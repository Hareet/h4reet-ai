#!/usr/bin/env python3
"""h4-handover, the laptop's loop (spec 001 tasks.md T118, T123; FR-060, FR-063, FR-064; contracts/handover.md §6 and
§8; research.md R-31; disclosure row C6). One host at a time: once the relay sends visitors to the laptop, EC2 stops.

    python3 -I -B deploy/scripts/handover.py --state-dir DIR start --env-file FILE   make up ENV=prod: returns at once
    python3 -I -B deploy/scripts/handover.py --state-dir DIR stop                    make down ENV=prod: ends it
    python3 -I -B deploy/scripts/handover.py --state-dir DIR run [--otlp-port N]     the loop itself

waiting   every 5 s, the public status (https://hareet.ai/api/status, or H4_HANDOVER_STATUS_URL), marked as a probe
          (X-H4-Probe: 1). A status it can't read is waited out, never read as `laptop`. Once it says `laptop`, EC2 is
          stopped through the Author's h4-ec2-stop profile (H4_EC2_STOP_PROFILE, by default h4-ec2-stop), and the loop
          serves. Until EC2 reads `stopped`, it is checked every 5 s, and stopped again if it runs.
window    from the relay's first `laptop` to EC2's `stopped`: one line in DIR/handover.jsonl, and the gauge
          h4.handover.window_seconds, posted to the stack's own collector on 127.0.0.1:<x004>, the port start reads
          from the env file's H4_OTLP_PORT and passes as --otlp-port (make up's env file reaches compose alone).
serving   every 60 s, the status again: while it says `laptop`, EC2's state, and `pending` or `running` is stopped
          again and recorded as a flap; on anything else, `released` is recorded and the loop goes back to waiting,
          so EC2 started while the relay sends elsewhere is left to serve (FR-064, "WHILE ... the relay sends to it").
failing   a describe or a stop that fails, an expired session or a hung CLI among them: one alert,
          `handover_stop_failed`, published to h4-alerts through the stop profile (both channels, as make ec2-stop's
          alert goes), and its line in DIR/handover.jsonl and the loop's log, DIR/handover.log; the loop keeps serving
          and retries each minute, and a later failure after a success alerts again. Any other error in a round is
          recorded and the loop goes on. `make up` never fails for it: start returns 0, and says on make up's terminal
          when the stop profile's session can't be used.

It records no address, no instance ID, and no secret: each line is the time, the event, its reason, and a count. The
loop asks EC2 for the instances tagged h4-prod-ec2 alone, and the stop permission set holds that tag (P-I6).
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

STATUS_URL = "https://hareet.ai/api/status"
PREFIX = "[hareet.ai aws]"
SERVING = ("laptop", "ec2", "none")
EC2_NAME = "h4-prod-ec2"
WAIT_S = 5
SERVE_S = 60
SETTLE_LIMIT_S = 600
RUNNING = ("pending", "running")
STOPPED = ("stopped", "terminated", "shutting-down")


class Ec2Error(RuntimeError):
    """A describe or a stop that failed; its code is AWS's, or the CLI's exit."""


def aws_argv(profile: str, *args: str) -> list[str]:
    return [
        "aws",
        *args,
        "--profile",
        profile,
        "--region",
        "us-east-1",
        "--output",
        "json",
        "--no-cli-pager",
    ]


def status_request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url, headers={"X-H4-Probe": "1", "Accept": "application/json"}, method="GET"
    )


class CliEc2:
    """EC2 through the AWS CLI and the Author's profile, by the tag alone."""

    def __init__(self, profile: str) -> None:
        self.profile = profile

    def _aws(self, *args: str) -> dict:
        # A hung or missing CLI is the step's failure, never a raise out of the loop (group 9's review A, I2).
        try:
            done = subprocess.run(
                aws_argv(self.profile, *args),
                capture_output=True,
                text=True,
                check=False,
                stdin=subprocess.DEVNULL,
                timeout=60,
            )
        except subprocess.TimeoutExpired:
            raise Ec2Error("timeout") from None
        except OSError as exc:
            raise Ec2Error(type(exc).__name__) from None
        if done.returncode != 0:
            text = done.stderr
            code = (
                text[text.find("(") + 1 : text.find(")")]
                if "(" in text and ")" in text
                else ""
            )
            raise Ec2Error(code if code.isalnum() else f"exit {done.returncode}")
        try:
            answer = json.loads(done.stdout or "{}")
        except ValueError:
            raise Ec2Error("unreadable_answer") from None
        return answer if isinstance(answer, dict) else {}

    def describe(self) -> list[tuple[str, str]]:
        answer = self._aws(
            "ec2", "describe-instances", "--filters", f"Name=tag:Name,Values={EC2_NAME}"
        )
        return [
            (
                str(i.get("InstanceId")),
                str((i.get("State") or {}).get("Name", "unknown")),
            )
            for r in answer.get("Reservations") or []
            for i in r.get("Instances") or []
        ]

    def stop(self, ids: list[str]) -> None:
        self._aws("ec2", "stop-instances", "--instance-ids", *ids)


def window_payload(seconds: float, at: float) -> dict:
    """h4.handover.window_seconds, as OTLP/HTTP's JSON, the gauge of the last takeover's window."""
    return {
        "resourceMetrics": [
            {
                "resource": {
                    "attributes": [
                        {
                            "key": "service.name",
                            "value": {"stringValue": "h4-handover"},
                        },
                        {
                            "key": "service.namespace",
                            "value": {"stringValue": "h4reet"},
                        },
                    ]
                },
                "scopeMetrics": [
                    {
                        "scope": {"name": "h4-handover"},
                        "metrics": [
                            {
                                "name": "h4.handover.window_seconds",
                                "unit": "s",
                                "gauge": {
                                    "dataPoints": [
                                        {
                                            "asDouble": float(seconds),
                                            "timeUnixNano": str(
                                                int(at * 1_000_000_000)
                                            ),
                                            "attributes": [
                                                {
                                                    "key": "h4.host",
                                                    "value": {"stringValue": "laptop"},
                                                }
                                            ],
                                        }
                                    ]
                                },
                            }
                        ],
                    }
                ],
            }
        ]
    }


class Handover:
    def __init__(
        self,
        status: Callable[[], str | None],
        ec2,
        alert: Callable[[str], None],
        window: Callable[[float], None],
        state_dir: Path,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        wall: Callable[[], float] = time.time,
    ) -> None:
        self.status, self.ec2, self.alert, self.window = status, ec2, alert, window
        self.state_dir, self.clock, self.sleep, self.wall = (
            state_dir,
            clock,
            sleep,
            wall,
        )
        self.phase = "waiting"
        self.taken_at: float | None = None
        self.failing = False

    def record(self, event: str, **fields: object) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.wall()))
        with (self.state_dir / "handover.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps({"at": stamp, "event": event, **fields}, sort_keys=True)
                + "\n"
            )

    def failed(self, step: str, exc: Ec2Error) -> None:
        if not self.failing:
            self.failing = True
            self.record("alert", kind="handover_stop_failed", step=step, code=str(exc))
            self.alert(stop_failed_message(step, str(exc)))

    def stop_running(self, reason: str) -> list[tuple[str, str]] | None:
        """EC2's states, after stopping any instance that runs; None when the describe or the stop failed."""
        step = "describe"
        try:
            states = self.ec2.describe()
            running = [i for i, s in states if s in RUNNING]
            if running:
                step = "stop"
                self.ec2.stop(running)
                self.record("stop", reason=reason, count=len(running))
        except Ec2Error as exc:
            self.failed(step, exc)
            return None
        self.failing = False
        return states

    def wait_for_laptop(self) -> None:
        while True:
            if self.status() == "laptop":
                self.taken_at = self.clock()
                self.phase = "serving"
                self.record("takeover")
                self.stop_running("takeover")
                return
            self.sleep(WAIT_S)

    def settle(self) -> None:
        """Until EC2 reads stopped, at most SETTLE_LIMIT_S: then the window, from the first `laptop`."""
        start = self.taken_at if self.taken_at is not None else self.clock()
        while self.clock() - start <= SETTLE_LIMIT_S:
            states = self.stop_running("takeover")
            if states is not None and all(s in STOPPED for _, s in states):
                seconds = round(self.clock() - start, 3)
                self.record("window", reason="takeover", seconds=seconds)
                self.window(seconds)
                return
            self.sleep(WAIT_S)
        self.record("window", reason="takeover", seconds=None)

    def serve_once(self) -> None:
        """One minute of serving: EC2 is stopped again only while the relay still sends to the laptop (I1)."""
        self.sleep(SERVE_S)
        serving = self.status()
        if serving != "laptop":
            self.phase = "waiting"
            self.record(
                "released", serving=serving if serving in SERVING else "unread"
            )
            return
        self.stop_running("flap")

    def run(self) -> None:
        while True:
            try:
                if self.phase == "waiting":
                    self.wait_for_laptop()
                    self.settle()
                else:
                    self.serve_once()
            # One round's unexpected error is recorded, and the loop goes on (I2): a dead loop would leave EC2 running.
            except Exception as exc:  # noqa: BLE001 - any round's failure is recorded by its class alone
                self.record("error", kind=type(exc).__name__)
                self.sleep(WAIT_S)


def stop_failed_message(step: str, code: str) -> str:
    """handover_stop_failed, in the bridge's form (contracts/aws-alerts.md §2): its line, then its facts."""
    return "\n".join(
        [
            f"{PREFIX} handover_stop_failed: the laptop's loop couldn't stop EC2; the laptop keeps serving and retries"
            " each minute",
            f"- step: {step}",
            f"- code: {code}",
        ]
    )


def notify(profile: str, text: str, run=subprocess.run) -> None:
    """The alert: its line in the loop's log, then h4-alerts through the stop profile, which may publish there (P-I6),
    as make ec2-stop's alert goes. One that can't be published, an expired session's among them, stays in the log."""
    print(f"h4-handover: ALERT {text.splitlines()[0]}", file=sys.stderr, flush=True)

    def aws(*args: str) -> dict:
        done = run(
            aws_argv(profile, *args),
            capture_output=True,
            text=True,
            check=False,
            stdin=subprocess.DEVNULL,
            timeout=30,
        )
        if done.returncode != 0:
            raise Ec2Error(f"exit {done.returncode}")
        answer = json.loads(done.stdout or "{}")
        return answer if isinstance(answer, dict) else {}

    try:
        account = str(aws("sts", "get-caller-identity").get("Account", ""))
        if not (len(account) == 12 and account.isdigit()):
            raise Ec2Error("no_account")
        topic = f"arn:aws:sns:us-east-1:{account}:h4-alerts"
        aws("sns", "publish", "--topic-arn", topic, "--message", text)
    except (Ec2Error, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(
            f"h4-handover: the alert was not published ({type(exc).__name__}); this log keeps it",
            file=sys.stderr,
            flush=True,
        )


def session_usable(profile: str, run=subprocess.run) -> bool:
    """Whether the stop profile's session answers now (sts get-caller-identity)."""
    try:
        done = run(
            aws_argv(profile, "sts", "get-caller-identity"),
            capture_output=True,
            text=True,
            check=False,
            stdin=subprocess.DEVNULL,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return done.returncode == 0


def read_status(url: str) -> str | None:
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(status_request(url), timeout=5) as response:
            doc = json.loads(response.read(65536).decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError):
        return None
    serving = doc.get("serving") if isinstance(doc, dict) else None
    return serving if isinstance(serving, str) else None


def default_open(request: urllib.request.Request, timeout: float) -> None:
    urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
        request, timeout=timeout
    ).close()


def post_window(seconds: float, port: str | None, open_url=default_open) -> None:
    """The window's gauge, to the stack's own collector on 127.0.0.1:<port> (x004); without a port, said, not sent."""
    if not (port or "").isdigit():
        print(
            "h4-handover: no OTLP port, so the window's metric didn't post; handover.jsonl has it",
            file=sys.stderr,
        )
        return
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/metrics",
        data=json.dumps(window_payload(seconds, time.time())).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        open_url(request, timeout=5)
    except (OSError, urllib.error.URLError):
        print(
            "h4-handover: the window's metric didn't post; handover.jsonl has it",
            file=sys.stderr,
        )


def default_spawn(argv: list[str], log: Path) -> int:
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as out:
        child = subprocess.Popen(
            argv,
            stdout=out,
            stderr=out,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    return child.pid


def default_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def default_kill(pid: int) -> None:
    os.kill(pid, signal.SIGTERM)


def read_pid(state_dir: Path) -> int | None:
    try:
        text = (state_dir / "handover.pid").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return int(text) if text.isdigit() else None


def env_value(env_file: Path | None, key: str) -> str | None:
    """One key of the env file, read as data (never sourced); None if the file or the key is missing."""
    if env_file is None:
        return None
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        name, sep, value = line.partition("=")
        if sep and name.strip() == key:
            return value.strip()
    return None


def start(
    state_dir: Path,
    spawn=default_spawn,
    alive=default_alive,
    session=None,
    env_file: Path | None = None,
) -> int:
    """Starts the loop, unless one runs; returns 0 whatever happens, so `make up` never fails for it."""
    try:
        profile = os.environ.get("H4_EC2_STOP_PROFILE", "h4-ec2-stop")
        usable = session if session is not None else lambda: session_usable(profile)
        if not usable():
            print(
                f"h4-handover: the {profile} profile's session can't be used, so a failed stop can't stop EC2 or "
                f"alert: make aws-login PROFILE={profile} (docs/runbooks/handover.md)",
                file=sys.stderr,
            )
        pid = read_pid(state_dir)
        if pid is not None and alive(pid):
            print("h4-handover: already running")
            return 0
        port = env_value(env_file, "H4_OTLP_PORT")
        if not (port or "").isdigit():
            port = None
            print(
                "h4-handover: the env file has no H4_OTLP_PORT, so the window's metric won't post",
                file=sys.stderr,
            )
        argv = [
            sys.executable,
            "-I",
            "-B",
            str(Path(__file__).resolve()),
            "--state-dir",
            str(state_dir),
            "run",
            *(["--otlp-port", port] if port else []),
        ]
        pid = spawn(argv, state_dir / "handover.log")
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / "handover.pid").write_text(f"{pid}\n", encoding="utf-8")
        print(
            "h4-handover: started; it stops EC2 once the relay serves the laptop (docs/runbooks/handover.md)"
        )
    except Exception as exc:  # noqa: BLE001 - make up never fails for the loop; its class alone is said
        print(
            f"h4-handover: not started ({type(exc).__name__}); see docs/runbooks/handover.md",
            file=sys.stderr,
        )
    return 0


def stop(state_dir: Path, kill=default_kill, alive=default_alive) -> int:
    pid = read_pid(state_dir)
    if pid is not None and alive(pid):
        kill(pid)
    (state_dir / "handover.pid").unlink(missing_ok=True)
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="handover.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("command", choices=("start", "stop", "run"))
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--otlp-port")
    args = parser.parse_args(argv)
    if args.command == "start":
        return start(args.state_dir, env_file=args.env_file)
    if args.command == "stop":
        return stop(args.state_dir)
    url = os.environ.get("H4_HANDOVER_STATUS_URL", STATUS_URL)
    profile = os.environ.get("H4_EC2_STOP_PROFILE", "h4-ec2-stop")
    loop = Handover(
        status=lambda: read_status(url),
        ec2=CliEc2(profile),
        alert=lambda text: notify(profile, text),
        window=lambda seconds: post_window(seconds, args.otlp_port),
        state_dir=args.state_dir,
    )
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    loop.run()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
