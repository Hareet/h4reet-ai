#!/usr/bin/env python3
"""h4-handover, the laptop's loop (spec 001 tasks.md T118, T123; FR-060, FR-063, FR-064; contracts/handover.md §6 and
§8; research.md R-31; disclosure row C6). One host at a time: once the relay sends visitors to the laptop, EC2 stops.

    python3 -I -B deploy/scripts/handover.py start --state-dir DIR     make up ENV=prod: starts the loop, returns at once
    python3 -I -B deploy/scripts/handover.py stop --state-dir DIR      make down ENV=prod: ends it
    python3 -I -B deploy/scripts/handover.py run --state-dir DIR       the loop itself

waiting   every 5 s, the public status (https://hareet.ai/api/status, or H4_HANDOVER_STATUS_URL), marked as a probe
          (X-H4-Probe: 1). A status it can't read is waited out, never read as `laptop`. Once it says `laptop`, EC2 is
          stopped through the Author's h4-ec2-stop profile (H4_EC2_STOP_PROFILE, by default h4-ec2-stop), and the loop
          serves. Until EC2 reads `stopped`, it is checked every 5 s, and stopped again if it runs.
window    from the relay's first `laptop` to EC2's `stopped`: one line in DIR/handover.jsonl, and the gauge
          h4.handover.window_seconds, posted to the stack's own collector on 127.0.0.1:H4_OTLP_PORT (x004).
serving   every 60 s, EC2's state; `pending` or `running` is stopped again and recorded as a flap.
failing   a describe or a stop that fails, an expired session among them: one alert line, `handover_stop_failed`,
          in DIR/handover.jsonl and the loop's log, DIR/handover.log, and the loop keeps serving and retries each
          minute; a later failure after a success alerts again. `make up` never fails for it: start returns 0.

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
        done = subprocess.run(
            aws_argv(self.profile, *args),
            capture_output=True,
            text=True,
            check=False,
            stdin=subprocess.DEVNULL,
            timeout=60,
        )
        if done.returncode != 0:
            text = done.stderr
            code = (
                text[text.find("(") + 1 : text.find(")")]
                if "(" in text and ")" in text
                else ""
            )
            raise Ec2Error(code if code.isalnum() else f"exit {done.returncode}")
        answer = json.loads(done.stdout or "{}")
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
            text = f"handover_stop_failed: EC2's {step} failed ({exc}); the laptop keeps serving and retries each minute"
            self.record("alert", kind="handover_stop_failed", step=step, code=str(exc))
            self.alert(text)

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
        self.sleep(SERVE_S)
        self.stop_running("flap")

    def run(self) -> None:
        self.wait_for_laptop()
        self.settle()
        while True:
            self.serve_once()


def read_status(url: str) -> str | None:
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(status_request(url), timeout=5) as response:
            doc = json.loads(response.read(65536).decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError):
        return None
    serving = doc.get("serving") if isinstance(doc, dict) else None
    return serving if isinstance(serving, str) else None


def post_window(seconds: float) -> None:
    port = os.environ.get("H4_OTLP_PORT", "")
    if not port.isdigit():
        return
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/metrics",
        data=json.dumps(window_payload(seconds, time.time())).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
            request, timeout=5
        ).close()
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


def start(state_dir: Path, spawn=default_spawn, alive=default_alive) -> int:
    """Starts the loop, unless one runs; returns 0 whatever happens, so `make up` never fails for it."""
    try:
        pid = read_pid(state_dir)
        if pid is not None and alive(pid):
            print("h4-handover: already running")
            return 0
        argv = [
            sys.executable,
            "-I",
            "-B",
            str(Path(__file__).resolve()),
            "--state-dir",
            str(state_dir),
            "run",
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
    args = parser.parse_args(argv)
    if args.command == "start":
        return start(args.state_dir)
    if args.command == "stop":
        return stop(args.state_dir)
    url = os.environ.get("H4_HANDOVER_STATUS_URL", STATUS_URL)
    loop = Handover(
        status=lambda: read_status(url),
        ec2=CliEc2(os.environ.get("H4_EC2_STOP_PROFILE", "h4-ec2-stop")),
        alert=lambda text: print(
            f"h4-handover: ALERT {text}", file=sys.stderr, flush=True
        ),
        window=post_window,
        state_dir=args.state_dir,
    )
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    loop.run()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
