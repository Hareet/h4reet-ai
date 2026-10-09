#!/usr/bin/env python3
"""The breach test (spec 000 FR-036; User Story 2, US5-6, US5-7; plan §8; contracts/env-files.md §7.2; tasks.md T080).

    make breach-test ENV=dev|dev-cpu [DELIVERY=real]        FR-036's only entry point, which runs:
    python3 -I -B -X pycache_prefix=/dev/null <tree>/evals/breach.py --stack dev|dev-cpu [--env-file F] [--run-file F]
        [--delivery standin|real]
        <tree>: for dev, the export h4reet-dev runs (its run file's H4_TREE), and nothing else; for dev-cpu, the main
        working tree

It trips the kill switch on purpose, on a dev-class stack only, and asserts every step of User Story 2 from a trace
(T, Langfuse), a metric (M, Prometheus, with the dashboard's own queries), or a log (L, Loki, with the receivers'
records and the store's audit row and incident draft beside them), then prints a table of every assertion and exits
non-zero on any miss. Its twelve steps, figures, and order are plan §8's: the clock starts on the 20th of the month
after the gateway's own, at 08:00 UTC, and every metered or fallback call is synthetic, at $0.10.

How it runs:
  - This orchestrator runs on the client: the Author's terminal for dev, an agent session for dev-cpu. It drives the
    stack's lifecycle with docker compose: it stops and starts the model server, restarts the gateway, and stops and
    wipes the store.
  - Every HTTP call and assertion runs in evals/breach_probe.py, in a one-off breach-probe container on the stack's
    internal network (`docker compose --profile breach run --build --rm -T breach-probe`), so no stack port is needed,
    and --build makes the copy in the image the code being run. The probe gets the operator token on standard input:
    dev-cpu's committed dummy, or dev's from ~/.config/h4reet-ai/operator/dev.token, read by scripts/operator.py,
    which this file loads by path so the token is handled in that one reviewed file. It is never printed.
  - dev: the host's engine, with the stack's env file and the run file make up wrote, and the compose file of the
    commit the stack runs: make runs this file from that export, so the probe's image is built from it too. This file
    refuses dev from any other tree, since its own tree is the compose file and the probe's build context: it must be
    the run file's H4_TREE (contracts/env-files.md §12; FR-039).
  - dev-cpu: the agents' engine only (FR-039). Inside the sandbox every docker call goes through
    deploy/agents-engine/docker-relay; from the Author's terminal, only with DOCKER_HOST=tcp://198.18.0.1:2376. It
    runs from the main working tree, which the engine serves, never a linked worktree (contracts/env-files.md §7.3).
  - --delivery real (dev only, the Author's terminal: SC-002's recorded run) adds contracts/env-files.md §7.2's
    overlay, a one-line ALERT_DELIVERY=real in a fresh 0700 directory, to the gateway for the run, and recreates the
    gateway with dev's files alone at the end: when the run passes, fails, or is stopped by Ctrl-C, SIGTERM, or SIGHUP.
    A SIGKILL, or the host stopping, can't run that; dev stays on real delivery until the next make up ENV=dev. The
    run then asserts Telegram's message_id and SMTP's 250 reply in the delivery records, and that neither stand-in
    holds the alert.

Standard library only, by path through PY_HOST, never with -m (plan §4). The docker client gets only the variables
docker and the relay need, so no COMPOSE_*, H4_*, or template key in the shell can override the stack's env file
(contracts/env-files.md §10, P5). Nothing it prints carries a payload, a client identifier, or a secret: the table
holds figures, alert ids, trace ids, and times.

Exit codes: 0 every assertion passed; 1 an assertion missed, or the run stopped (the table says where); 2 a refusal
before anything changed: a stack other than dev and dev-cpu, dev from an agent session, dev-cpu off the agents'
engine or from a linked worktree, real delivery off dev or with a channel key empty, or a token problem.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import importlib.util
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, NoReturn, TextIO

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "deploy" / "compose.yaml"
DEVCPU_VARS = ROOT / "deploy" / "env.agents" / "dev-cpu.vars"
RELAY = ROOT / "deploy" / "agents-engine" / "docker-relay"
PROBE_DOCKERFILE = ROOT / "evals" / "Dockerfile.probe"
RELAY_HOST = "tcp://127.0.0.1:2376"  # the relay's end inside the sandbox
ENGINE_HOST = "tcp://198.18.0.1:2376"  # the agents' engine, from the Author's terminal (contracts/agents-engine.md §2)
STACKS = ("dev", "dev-cpu")
MODEL_SERVER = {
    "dev": "model-server-gpu",
    "dev-cpu": "model-server-cpu",
}  # COMPOSE_PROFILES' gpu and cpu
# What the docker client keeps from this environment, as the operator CLI's hop does (contracts/operator-admin.md §6).
HOP_ENV = (
    "PATH",
    "HOME",
    "TMPDIR",
    "SANDBOX_RUNTIME",
    "HTTPS_PROXY",
    "https_proxy",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "BUILDX_CONFIG",
    "XDG_RUNTIME_DIR",
)
# The real channels' keys, which the overlay needs filled (contracts/env-files.md §7.2).
REAL_KEYS = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "ALERT_EMAIL_FROM",
    "ALERT_EMAIL_TO",
)
UP_WAIT = ["--wait", "--wait-timeout", "120"]
LIFECYCLE_TIMEOUT_S = 300.0

# The dashboard's own queries (contracts/telemetry.md §7.1, §7.2), so an M assertion is what the panel shows.
KILL = "max by (deployment_environment_name, h4_state) (h4_kill_switch_state) == 1"
CAUSE = "max by (h4_cause) (h4_degraded_cause) == 1"
AWAITING = "max(h4_fallback_awaiting_renewal)"
ALLOWANCE = "max(h4_fallback_allowance_usd)"
LOCAL_UP = 'max(h4_adapter_healthy{h4_adapter="local"})'


def spend(meter: str) -> str:
    return f'max(h4_meter_spend_usd{{h4_meter="{meter}"}})'


def warn(meter: str) -> str:
    return f'max(h4_meter_warn_usd{{h4_meter="{meter}"}})'


def ceiling(meter: str) -> str:
    return f'max(h4_meter_ceiling_usd{{h4_meter="{meter}"}})'


def meter_selector(meter: str) -> str:
    return f'h4_meter_spend_usd{{h4_meter="{meter}"}}'


Runner = Callable[
    [list[str], "str | None", dict[str, str], float], tuple[int, str, str]
]
Git = Callable[[list[str]], tuple[int, str]]


# --- the assertions --------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Assertion:
    id: str
    step: int
    scenario: str
    source: str  # T, M, or L
    text: str
    real_text: str | None = (
        None  # with --delivery real, where the stand-ins' records become the providers' replies
    )


RECEIVED = "Telegram's message_id and SMTP's 250 reply are in its delivery records, and neither stand-in holds it"
CATALOG = (
    Assertion(
        "1a",
        1,
        "setup",
        "M",
        "the kill switch reads normal once the store is initialized",
    ),
    Assertion(
        "1b",
        1,
        "setup",
        "M",
        "on the test clock's 20th, today and this month read 0.00",
    ),
    Assertion(
        "1c", 1, "setup", "L", "operator.init and operator.test_clock audit records"
    ),
    Assertion(
        "2a", 2, "US2-1", "T", "the metered call's trace carries h4.cost.usd = 0.10"
    ),
    Assertion("2b", 2, "US2-1", "M", "today and this month show the 0.10 within 60 s"),
    Assertion(
        "3a",
        3,
        "US2-2",
        "L",
        "the daily warning is delivered on both channels within 300 s",
    ),
    Assertion(
        "3b",
        3,
        "US2-2",
        "L",
        "both stand-ins hold the daily warning",
        f"the daily warning: {RECEIVED}",
    ),
    Assertion("3c", 3, "US2-2", "M", "Spend today shows 3.50 at its 3.50 warning"),
    Assertion(
        "4a",
        4,
        "US2-5",
        "M",
        "the next UTC day: today reads 0.00, and the month carries 3.50",
    ),
    Assertion(
        "4b",
        4,
        "US2-2",
        "L",
        "fallback grant 1's 1.40 warning is delivered on both channels within 300 s",
    ),
    Assertion(
        "4c",
        4,
        "US2-2",
        "L",
        "both stand-ins hold grant 1's warning",
        f"grant 1's warning: {RECEIVED}",
    ),
    Assertion(
        "4d", 4, "US2-2", "M", "the fallback panel shows 1.40 spent at its 1.40 warning"
    ),
    Assertion("4e", 4, "US5-7", "M", "fallback today reads 1.50"),
    Assertion(
        "5a",
        5,
        "US5-7",
        "M",
        "after a gateway restart, fallback today still reads 1.50",
    ),
    Assertion(
        "5b", 5, "US5-7", "L", "fallback.exhausted at the 2.00 allowance, grant 1"
    ),
    Assertion(
        "5c",
        5,
        "US5-7",
        "L",
        "the fallback_exhausted alert is delivered on both channels within 300 s",
    ),
    Assertion(
        "5d",
        5,
        "US5-7",
        "L",
        "both stand-ins hold the fallback_exhausted alert",
        f"the exhaustion: {RECEIVED}",
    ),
    Assertion(
        "5e",
        5,
        "US5-3",
        "M",
        "renewal is awaited, and Why responses are degraded shows fallback_awaiting_renewal",
    ),
    Assertion(
        "6a",
        6,
        "US5-6",
        "L",
        "operator.renew, and its audit row: who, when, why, allowance 4.00, grant 2",
    ),
    Assertion(
        "6b",
        6,
        "US5-6",
        "M",
        "the allowance reads 4.00, and renewal is no longer awaited",
    ),
    Assertion(
        "6c",
        6,
        "US5-6",
        "L",
        "grant 2's 3.40 warning is delivered on both channels within 300 s",
    ),
    Assertion(
        "6d", 6, "US5-6", "L", "fallback.exhausted at the 4.00 allowance, grant 2"
    ),
    Assertion(
        "6e",
        6,
        "US5-6",
        "M",
        "today stands at 4.00, under its ceiling, with renewal awaited",
    ),
    Assertion(
        "6f",
        6,
        "US5-6",
        "M",
        "the next day, after a restart: Why responses are degraded shows fallback_awaiting_renewal",
    ),
    Assertion(
        "6g",
        6,
        "US5-6",
        "L",
        "that hello's call.degraded record names fallback_awaiting_renewal",
    ),
    Assertion(
        "6h",
        6,
        "US5-6",
        "M",
        "the next day's renewal: the allowance reads 2.00, not 4.00",
    ),
    Assertion(
        "7a",
        7,
        "US2-3",
        "M",
        "the kill switch reads degraded within 60 s of the crossing",
    ),
    Assertion(
        "7b",
        7,
        "US2-3",
        "L",
        "killswitch.tripped within 60 s of the crossing call's record (SC-002)",
    ),
    Assertion(
        "7c",
        7,
        "US2-3",
        "L",
        "the trip alert is delivered on both channels within 300 s",
    ),
    Assertion(
        "7d",
        7,
        "US2-3",
        "L",
        "both stand-ins hold the trip alert",
        f"the trip alert: {RECEIVED}",
    ),
    Assertion(
        "7e",
        7,
        "US2-3",
        "M",
        "Why responses are degraded shows kill_switch_tripped, with local healthy",
    ),
    Assertion(
        "7f",
        7,
        "US2-3",
        "L",
        "a hello's call.degraded record names kill_switch_tripped: local is refused too",
    ),
    Assertion("8a", 8, "US2-6", "L", "incident.drafted for the daily ceiling"),
    Assertion(
        "8b",
        8,
        "US2-6",
        "L",
        "GET /admin/incidents holds that draft, unchanged, with every evidence field",
    ),
    Assertion(
        "9a", 9, "US2-4", "L", "operator.reset, and its audit row: who, when, why"
    ),
    Assertion("9b", 9, "US2-4", "M", "the kill switch reads normal after the reset"),
    Assertion(
        "9c",
        9,
        "US2-4",
        "T",
        "hello answers locally again: its trace is a local call at 0 USD",
    ),
    Assertion(
        "9d",
        9,
        "US2-4",
        "L",
        "a metered call is refused with meter_at_ceiling (call.degraded)",
    ),
    Assertion("9e", 9, "US2-4", "M", "Spend today stays at its 5.00 ceiling"),
    Assertion(
        "10a",
        10,
        "US2-5",
        "L",
        "the monthly warning is delivered on both channels within 300 s",
    ),
    Assertion(
        "10b",
        10,
        "US2-5",
        "L",
        "both stand-ins hold the monthly warning",
        f"the monthly warning: {RECEIVED}",
    ),
    Assertion(
        "10c", 10, "US2-5", "M", "Spend month-to-date shows 14.00 at its 14.00 warning"
    ),
    Assertion(
        "10d",
        10,
        "US2-5",
        "M",
        "the kill switch reads degraded once the month reaches 20.00",
    ),
    Assertion(
        "10e",
        10,
        "US2-5",
        "L",
        "killswitch.tripped for the month, and its trip alert delivered on both channels",
    ),
    Assertion(
        "10f",
        10,
        "US2-5",
        "M",
        "the next day: today reads 0.00, and the kill switch still degraded",
    ),
    Assertion(
        "10g",
        10,
        "US2-5",
        "M",
        "the next month: the month reads 0.00, and the kill switch still degraded",
    ),
    Assertion(
        "10h",
        10,
        "US2-5",
        "M",
        "after the reset: normal, and one metered call reads 0.10 today and this month",
    ),
    Assertion(
        "11a",
        11,
        "US2-7",
        "M",
        "with the store stopped, Why responses are degraded shows store_unreachable",
    ),
    Assertion("11b", 11, "US2-7", "L", "state.unknown names store_unreachable"),
    Assertion(
        "11c",
        11,
        "US2-7",
        "M",
        "with the store wiped, Why responses are degraded shows store_uninitialized",
    ),
    Assertion(
        "11d",
        11,
        "US2-7",
        "L",
        "operator.init, and its audit row: 0.10 from the journal, the test clock restored",
    ),
    Assertion(
        "11e",
        11,
        "US2-7",
        "M",
        "the rebuilt meters read 0.10 today and this month, with renewal awaited",
    ),
)


class Refusal(Exception):
    """Exit 2: the run is refused before anything changes."""


class Stop(Exception):
    """The run can't go on: a step's action failed, or a command didn't run. The table says where."""


class Interrupted(BaseException):
    """SIGTERM or SIGHUP, which a closed terminal sends: the run stops, and its cleanup runs, as on Ctrl-C. A
    BaseException, like KeyboardInterrupt, so nothing on the way out takes it for an error and goes on."""


def on_signal(signum: int, frame: object) -> NoReturn:
    raise Interrupted(signal.Signals(signum).name)


@contextlib.contextmanager
def interruptible() -> Iterator[None]:
    """SIGTERM and SIGHUP stop the run the way Ctrl-C does, so its cleanup puts the stack back: the gateway on dev's own
    files, the overlay deleted, the stopped services started (contracts/env-files.md §7.2). Only a SIGKILL, or the host
    stopping, can't be caught. The previous handlers come back when the run ends."""
    previous = {s: signal.signal(s, on_signal) for s in (signal.SIGTERM, signal.SIGHUP)}
    try:
        yield
    finally:
        restore(previous)


@contextlib.contextmanager
def ignoring_signals() -> Iterator[None]:
    """While the run puts the stack back and prints its table, Ctrl-C, SIGTERM, and SIGHUP are ignored, by this process
    and by the docker commands it starts, which keep an ignored signal across exec: the cleanup always finishes
    (round 2's review). Only a SIGKILL, or the host stopping, can cut it short. The run's handlers come back after."""
    previous = {
        s: signal.signal(s, signal.SIG_IGN)
        for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)
    }
    try:
        yield
    finally:
        restore(previous)


def restore(previous: Mapping[int, Any]) -> None:
    # A handler that wasn't set from Python comes back as None, which signal.signal won't take: the default, then.
    for signum, handler in previous.items():
        signal.signal(signum, signal.SIG_DFL if handler is None else handler)


# --- the dates -----------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Dates:
    """Plan §8's calendar: the 20th of the month after the gateway's own, at 08:00 UTC, then a day at a time."""

    start: dt.datetime
    next_month: dt.datetime

    def day(self, offset: int) -> str:
        return (self.start + dt.timedelta(days=offset)).strftime("%Y-%m-%d")

    @property
    def month(self) -> str:
        return self.start.strftime("%Y-%m")


def dates_after(gateway_time: str) -> Dates:
    now = dt.datetime.fromisoformat(gateway_time.replace("Z", "+00:00"))
    year, month = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    start = dt.datetime(year, month, 20, 8, tzinfo=dt.timezone.utc)
    year2, month2 = (year + 1, 1) if month == 12 else (year, month + 1)
    return Dates(start, dt.datetime(year2, month2, 1, 8, tzinfo=dt.timezone.utc))


def rfc3339(moment: dt.datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


# --- the modules this file loads by path ------------------------------------------------------------------------------


def load(name: str, path: Path) -> Any:
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise Refusal(f"can't load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def probe_module() -> Any:
    """evals/breach_probe.py: the operations' vocabulary, and its LogQL and reference helpers."""
    return load("h4_breach_probe", ROOT / "evals" / "breach_probe.py")


def operator_module() -> Any:
    """scripts/operator.py, which reads the operator token (contracts/operator-admin.md §6)."""
    return load("h4_operator", ROOT / "scripts" / "operator.py")


# --- the run --------------------------------------------------------------------------------------------------------


@dataclass
class Context:
    stack: str
    env_file: Path
    run_file: Path | None
    delivery: str
    token: str
    runner: Runner
    environ: Mapping[str, str]
    out: TextIO
    probe: Any
    overlay: Path | None = None
    results: dict[str, dict[str, Any]] = field(default_factory=dict)
    stopped: set[str] = field(default_factory=set)

    @property
    def sandboxed(self) -> bool:
        return self.environ.get("SANDBOX_RUNTIME") == "1"

    def say(self, text: str) -> None:
        # A terminal closed under the run (SIGHUP) takes its output with it, never its cleanup.
        with contextlib.suppress(OSError, ValueError):
            print(text, file=self.out, flush=True)

    def docker(self) -> list[str]:
        # Inside the sandbox, the relay; it runs the command directly when a relay already answers (make's own).
        return [str(RELAY), "docker"] if self.sandboxed else ["docker"]

    def compose(self, *args: str, overlay: bool = False) -> list[str]:
        command = [
            *self.docker(),
            "compose",
            "-p",
            f"h4reet-{self.stack}",
            "-f",
            str(COMPOSE_FILE),
        ]
        command += ["--env-file", str(self.env_file)]
        if self.run_file is not None:
            command += ["--env-file", str(self.run_file)]
        if overlay and self.overlay is not None:
            command += ["--env-file", str(self.overlay)]
        return command + list(args)

    def env(self) -> dict[str, str]:
        kept = {key: self.environ[key] for key in HOP_ENV if key in self.environ}
        return {**kept, "LC_ALL": "C"}

    def lifecycle(
        self, what: str, command: list[str], *, done_if: str | None = None
    ) -> tuple[float, float]:
        """One docker command, which must succeed, or end with done_if in its error: already done. Returns when it
        started and ended, for the checks timed from it."""
        self.say(f"  {what}")
        start = time.time()
        code, _, err = self.runner(command, None, self.env(), LIFECYCLE_TIMEOUT_S)
        if code != 0 and not (done_if and done_if in err):
            tail = " | ".join(line.strip() for line in err.strip().splitlines()[-3:])
            raise Stop(
                f"{what} failed (docker exited {code}){': ' + tail if tail else ''}"
            )
        return start, time.time()

    def stop_service(self, service: str) -> tuple[float, float]:
        span = self.lifecycle(
            f"docker compose stop {service}", self.compose("stop", service)
        )
        self.stopped.add(service)
        return span

    def start_model_server(self) -> None:
        service = MODEL_SERVER[self.stack]
        self.lifecycle(
            f"docker compose start {service}", self.compose("start", service)
        )
        self.stopped.discard(service)

    def restart_gateway(self) -> None:
        """The checks after a restart are timed, and their samples counted, from the probe's first /health answer
        that names the new process ready, not from here: the old process's shutdown flush is stamped after this
        command starts, on the same series (round 1's review)."""
        self.lifecycle(
            "docker compose restart gateway", self.compose("restart", "gateway")
        )

    def wipe_store(self) -> tuple[float, float]:
        """Stop the store, remove its container and its volume, and bring it back empty (plan §8 steps 1 and 11)."""
        if "gateway-state" not in self.stopped:
            self.stop_service("gateway-state")
        self.lifecycle(
            "docker compose rm gateway-state",
            self.compose("rm", "--force", "--stop", "gateway-state"),
        )
        # A run stopped after this and before the store came back leaves no volume: that is wiped enough.
        volume = f"h4reet-{self.stack}_gateway-state-data"
        self.lifecycle(
            f"docker volume rm {volume}",
            [*self.docker(), "volume", "rm", volume],
            done_if="no such volume",
        )
        # When the store came back, empty: what the wiped store's checks are timed from.
        back = self.lifecycle(
            "docker compose up gateway-state",
            self.compose("up", "--detach", "--no-deps", *UP_WAIT, "gateway-state"),
        )
        self.stopped.discard("gateway-state")
        return back

    def probe_call(
        self, step: str, ops: list[dict[str, Any]], report: Report
    ) -> dict[str, dict[str, Any]]:
        """One probe container: the step's operations in, a result for each out, every check's into the table."""
        ops = [resolve_known(op, self.results, self.probe) for op in ops]
        command = self.compose(
            "--profile",
            "breach",
            "run",
            "--build",
            "--rm",
            "-T",
            "breach-probe",
            "python3",
            "-I",
            "/app/breach_probe.py",
            step,
            "--stack",
            self.stack,
        )
        windows = sum(float(op.get("within_s", 0)) for op in ops) + 150 * sum(
            op["op"] == "spend" for op in ops
        )
        stdin = self.token + "\n" + json.dumps({"ops": ops})
        code, out, err = self.runner(command, stdin, self.env(), windows + 600)
        lines = []
        for line in out.splitlines():
            if line.startswith("{"):
                try:
                    parsed = json.loads(line)
                except ValueError:
                    continue
                if isinstance(parsed, dict) and parsed.get(self.probe.MARK) == 1:
                    lines.append(parsed)
        done = next((line for line in lines if line.get("done")), None)
        found = {}
        for line in lines:
            result = line.get("result")
            if not isinstance(result, dict):
                continue
            if result.get("id"):
                self.results[str(result["id"])] = result
                found[str(result["id"])] = result
            if result.get("assert"):
                report.add(str(result["assert"]), result)
        if done is None:
            tail = " | ".join(x.strip() for x in err.strip().splitlines()[-3:])
            raise Stop(
                f"step {step}: the probe gave no result (docker exited {code}){': ' + tail if tail else ''}"
            )
        if done.get("exit") == 2:
            # The probe's own reason: on its done line, or else its last line on standard error, which docker's build
            # output surrounds. Cleaned, since either could carry what a control character would make of a terminal.
            own = [
                line.removeprefix("breach_probe.py:").strip()
                for line in err.splitlines()
                if line.startswith("breach_probe.py:")
            ]
            reason = done.get("error") or (own[-1] if own else "no reason given")
            raise Stop(
                f"step {step}: the probe refused its operations: {self.probe.shorten(str(reason))}"
            )
        failed = next(
            (
                line["result"]
                for line in lines
                if (line.get("result") or {}).get("failed")
            ),
            None,
        )
        if failed is not None:
            raise Stop(f"step {step} stopped: {describe_failure(failed)}")
        return found


def resolve_known(value: Any, results: Mapping[str, Any], probe: Any) -> Any:
    """{{<id>.<path>}} for an operation of an earlier probe call; a reference to this call's own stays for the probe."""
    if isinstance(value, dict):
        return {k: resolve_known(v, results, probe) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_known(v, results, probe) for v in value]
    if not isinstance(value, str) or "{{" not in value:
        return value
    whole = probe.REF_RE.fullmatch(value)
    if whole and probe.split_ref(whole.group(1), results) is not None:
        return probe.resolve(value, results)

    def known(match: re.Match[str]) -> str:
        if probe.split_ref(match.group(1), results) is None:
            return match.group(0)
        return str(probe.resolve(match.group(0), results))

    return probe.REF_RE.sub(known, value)


def describe_failure(result: Mapping[str, Any]) -> str:
    """A failed action, by its operation and what missed: never a body."""
    what = str(result.get("id") or result.get("op"))
    parts = []
    if result.get("misses"):
        parts.append("missed " + ", ".join(str(m) for m in result["misses"]))
    if result.get("status") not in (None, 200):
        parts.append(f"HTTP {result['status']} {result.get('error') or ''}".strip())
    if result.get("error") and result.get("status") is None:
        parts.append(str(result["error"])[:200])
    stopped = result.get("stopped")
    if isinstance(stopped, dict):
        parts.append(
            f"answered {result.get('answered')}, then {stopped.get('cause') or stopped.get('error')}"
        )
    return f"{what}: {'; '.join(parts) or 'failed'}"


# --- the table --------------------------------------------------------------------------------------------------------


@dataclass
class Report:
    delivery: str
    outcomes: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    stopped: str | None = None

    def add(self, assertion: str, result: dict[str, Any]) -> None:
        self.outcomes.setdefault(assertion, []).append(result)

    def verdict(self, assertion: Assertion) -> tuple[str, str]:
        results = self.outcomes.get(assertion.id, [])
        if not results:
            return "MISS", f"not run: {self.stopped}" if self.stopped else "not run"
        missed = [r for r in results if not r.get("ok")]
        detail = "; ".join(filter(None, (evidence(r) for r in (missed or results))))
        return ("MISS" if missed else "PASS"), detail

    def passed(self) -> bool:
        return self.stopped is None and all(
            self.verdict(a)[0] == "PASS" for a in CATALOG
        )

    def table(self) -> list[str]:
        lines = [
            f"{'id':<4} {'step':<4} {'scenario':<8} {'source':<6} {'result':<6} assertion"
        ]
        for a in CATALOG:
            result, detail = self.verdict(a)
            text = a.real_text if self.delivery == "real" and a.real_text else a.text
            lines.append(
                f"{a.id:<4} {a.step:<4} {a.scenario:<8} {a.source:<6} {result:<6} {text}{f' ({detail})' if detail else ''}"
            )
        passed = sum(self.verdict(a)[0] == "PASS" for a in CATALOG)
        by_source = []
        for source in ("T", "M", "L"):
            ones = [a for a in CATALOG if a.source == source]
            by_source.append(
                f"{source} {sum(self.verdict(a)[0] == 'PASS' for a in ones)}/{len(ones)}"
            )
        lines.append(
            f"summary: {len(CATALOG)} assertions: {passed} passed, {len(CATALOG) - passed} missed; {', '.join(by_source)}"
        )
        return lines


def evidence(result: Mapping[str, Any]) -> str:
    """What a result showed, briefly: figures, ids, and times; never a body."""
    if result.get("skipped"):
        return "skipped: an action before it failed"
    if result.get("error") and not result.get("ok"):
        return str(result["error"])[:160]
    op, parts = result.get("op"), []
    observed = result.get("observed")
    if op == "metric" or (op == "trace" and not isinstance(observed, dict)):
        parts.append(f"observed {observed}")
    elif op == "log":
        for record in result.get("records") or []:
            if not isinstance(record, dict):
                continue
            item = " ".join(
                f"{k} {v}"
                for k, v in record.items()
                if k not in ("ts", "ts_ns") and v is not None
            )
            parts.append(item or str(record.get("ts", "")))
        if result.get("gap_s") is not None:
            parts.append(f"{result['gap_s']} s apart")
    elif op == "trace" and isinstance(observed, dict):
        parts.append(", ".join(f"{k} {v}" for k, v in observed.items()))
        via = result.get("via")
        if isinstance(via, dict) and via:
            parts.append("via " + ", ".join(str(v) for v in via.values()))
    elif op in ("telegram", "mailpit") and result.get("absent"):
        held = result.get("message_id") or result.get("matched_by")
        parts.append(
            f"the {op} stand-in holds it ({held})"
            if held
            else f"the {op} stand-in holds none"
        )
    elif op == "telegram":
        parts.append(f"telegram message {result.get('message_id')}")
    elif op == "mailpit":
        parts.append(f"mailpit by {result.get('matched_by')}")
    elif op == "audit":
        parts.append(
            f"audit #{result.get('id')} by {result.get('actor')} at {result.get('ts')}"
        )
    elif op == "incident":
        checks = result.get("checks")
        failing = (
            [k for k, v in checks.items() if not v] if isinstance(checks, dict) else []
        )
        parts.append(f"incident #{result.get('id')} {result.get('status')}")
        if failing:
            parts.append("missing " + ", ".join(failing))
    if result.get("seen_after_s") is not None:
        parts.append(f"seen {result['seen_after_s']} s after its action")
    elif result.get("waited_s"):
        parts.append(f"in {result['waited_s']} s")
    return ", ".join(p for p in parts if p)


# --- the operations -------------------------------------------------------------------------------------------------

# What a check is timed from: an earlier operation of its probe call, by id, or the start and end of an action outside
# it (an earlier call's operation, or a lifecycle command).
Anchor = str | tuple[float, float]


def timed_from(when: Anchor) -> dict[str, Any]:
    """A check's window, from its action (round 1's review): the probe opens it at the action's start and closes it
    within_s after the action's end, never from when the check gets its turn."""
    if isinstance(when, str):
        return {"after": when}
    start, end = when
    return {"after_s": round(start, 3), "after_end_s": round(end, 3)}


def metric(
    aid: str,
    query: str,
    *,
    after: Anchor,
    value: float | None = None,
    labels: list[str] | None = None,
    at_least: str | None = None,
    fresh: tuple[str, str | float] | None = None,
    within_s: int = 60,
) -> dict[str, Any]:
    """An M assertion: the dashboard's query, until it shows the value, within 60 s of the action it measures
    (contracts/telemetry.md §6.5)."""
    if labels is not None:
        expect: dict[str, Any] = {
            "labels": {("h4_state" if query == KILL else "h4_cause"): labels}
        }
    elif at_least is not None:
        expect = {"at_least": at_least}
    else:
        expect = {"value": value}
    op: dict[str, Any] = {
        "op": "metric",
        "assert": aid,
        "query": query,
        "expect": expect,
        "within_s": within_s,
        **timed_from(after),
    }
    if fresh is not None:
        selector, since = fresh
        op["fresh"] = {
            "selector": selector,
            **(
                {"after_s": round(since, 3)}
                if isinstance(since, float)
                else {"after": since}
            ),
        }
    return op


class Steps:
    """Plan §8's steps 1 to 11, each as the probe's operations and the lifecycle commands between them."""

    def __init__(self, ctx: Context, report: Report) -> None:
        self.ctx, self.report, self.probe = ctx, report, ctx.probe
        self.stack = ctx.stack
        self.dates: Dates | None = None

    # The operations' builders.

    def log(
        self,
        aid: str | None,
        event: str,
        when: Anchor,
        *,
        within_s: int = 60,
        op_id: str | None = None,
        fields: tuple[str, ...] = (),
        expect: dict[str, Any] | None = None,
        **filters: object,
    ) -> dict[str, Any]:
        op = {
            "op": "log",
            "query": self.probe.logql(self.stack, event, **filters),
            "within_s": within_s,
            **timed_from(when),
        }
        op.update({"fields": list(fields), "expect": expect or {}})
        if aid:
            op["assert"] = aid
        if op_id:
            op["id"] = op_id
        return op

    def delivered(
        self, aid: str, receivers: str, key: str, when: Anchor
    ) -> list[dict[str, Any]]:
        """L: both channels' alert.delivered records within 300 s (FR-032); then the receivers: the stand-ins' own
        records, or with real delivery Telegram's message_id and SMTP's 250 in the same records (plan §8)."""
        expect = {"each": {"channel": ["telegram", "email"]}, "max": {"lag_s": 300}}
        fields = ("channel", "attempt", "lag_s")
        ops = [
            self.log(
                aid,
                "alert.delivered",
                when,
                within_s=300,
                expect=expect,
                fields=fields,
                dedupe_key=key,
            )
        ]
        real = self.ctx.delivery == "real"
        if real:
            refs = {
                "provider_ref": {"telegram": r"^[0-9]+$", "email": r"(^|\D)250(\D|$)"}
            }
            ops.append(
                self.log(
                    receivers,
                    "alert.delivered",
                    when,
                    within_s=300,
                    expect={**expect, "each_regex": refs},
                    fields=("channel", "provider_ref"),
                    dedupe_key=key,
                )
            )
        # With real delivery, the stand-ins must hold nothing: the stand-in's numeric message_id and Mailpit's 250 have
        # the providers' shapes, so a gateway still on the stand-ins would pass on the references alone (round 1's
        # review). Each gateway sends a channel to one place, so once the records exist, one look settles it.
        ops += [
            {
                "op": channel,
                "assert": receivers,
                "key": key,
                "within_s": 300,
                **({"absent": True} if real else {}),
                **timed_from(when),
            }
            for channel in ("telegram", "mailpit")
        ]
        return ops

    def span(self, op_id: str) -> tuple[float, float]:
        """An earlier probe call's operation, as an action outside this call: when it started and ended."""
        result = self.ctx.results[op_id]
        start = float(result["started_s"])
        return start, float(result.get("ended_s", start))

    def spend(
        self,
        op_id: str,
        attribution: str,
        count: int,
        reason: str,
        *,
        meters: Mapping[str, float],
        **expect: Any,
    ) -> dict[str, Any]:
        """POST /admin/test/synthetic's calls. The probe waits out the gateway's 429s (60 metered calls a minute,
        data-model.md §7.2), so step 10's paced calls aren't misses; the reply's meters must then show the store's
        figures plan §8 gives, in USD here, so a refused call that was never made again, or one counted twice, stops
        the step."""
        route = "metered" if attribution == "metered" else "fallback"
        expectation = dict(expect) or {"answered": count, "stopped": None}
        for meter, usd in meters.items():
            expectation[f"meters.{meter}.spent_micro_usd"] = round(usd * 1_000_000)
        return {
            "op": "spend",
            "id": op_id,
            "attribution": attribution,
            "route": route,
            "count": count,
            "reason": reason,
            "expect": expectation,
        }

    @staticmethod
    def admin(
        op_id: str,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        **expect: Any,
    ) -> dict[str, Any]:
        return {
            "op": "admin",
            "id": op_id,
            "method": method,
            "path": path,
            "body": body,
            "expect": {"status": 200, **expect},
        }

    def clock(
        self, op_id: str, reason: str, *, to: dt.datetime | None = None
    ) -> dict[str, Any]:
        """POST /admin/test/clock: to a time (set), or on by one UTC day (advance_s)."""
        body: dict[str, Any] = (
            {"set": rfc3339(to), "reason": reason}
            if to
            else {"advance_s": 86400, "reason": reason}
        )
        return self.admin(op_id, "POST", "/admin/test/clock", body)

    def keys(self) -> dict[str, str]:
        d, s = self.dates, self.stack
        assert d is not None
        return {
            "warn_day": f"{s}:warn:day:{d.day(0)}",
            "warn_g1": f"{s}:warn:fallback_day:{d.day(1)}:g1",
            "exhausted_g1": f"{s}:fallback_exhausted:fallback_day:{d.day(1)}:g1",
            "warn_g2": f"{s}:warn:fallback_day:{d.day(1)}:g2",
            "trip_day": f"{s}:trip:day:{d.day(2)}",
            "warn_month": f"{s}:warn:month:{d.month}",
            "trip_month": f"{s}:trip:month:{d.month}",
        }

    def call(self, step: str, ops: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        return self.ctx.probe_call(step, ops, self.report)

    def check_day(self, op_id: str, offset: int) -> None:
        """The clock's answer names the day plan §8 expects, or the figures that follow would land elsewhere."""
        assert self.dates is not None
        got = str(
            (self.ctx.results.get(op_id, {}).get("body") or {}).get("gateway_time", "")
        )
        if not got.startswith(
            self.dates.day(offset)
            if offset >= 0
            else rfc3339(self.dates.next_month)[:10]
        ):
            raise Stop(
                f"{op_id}: the gateway's clock reads {got or 'nothing'}, not plan §8's day"
            )

    # The guard, and the steps.

    def guard(self) -> None:
        """plan §8's preflight: /health on a dev-class stack with the test machinery on, or nothing happens."""
        self.ctx.say(f"breach test: h4reet-{self.stack}, checking /health first")
        expect = {
            "stack": self.stack,
            "env": "dev",
            "test_machinery.clock": True,
            "test_machinery.synthetic": True,
            "fallback.adapter": "synthetic",
        }
        try:
            self.call("0", [{"op": "health", "id": "guard", "expect": expect}])
        except Stop as stop:
            result = self.ctx.results.get("guard", {})
            if result.get("error") or "guard" not in self.ctx.results:
                raise Stop(
                    f"can't reach h4reet-{self.stack}'s gateway from the breach probe on its internal network "
                    f"(gateway:8080): {result.get('error') or stop}. Is the stack up? make up ENV={self.stack}"
                ) from None
            raise Stop(
                f"h4reet-{self.stack} isn't a dev stack with the test machinery on and a synthetic fallback (it "
                f"missed {', '.join(result.get('misses') or [])}): the breach test runs on dev and dev-cpu only "
                "(FR-036)"
            ) from None

    def step1(self) -> None:
        self.ctx.say(
            "step 1 · a clean start: the store wiped, initialized, and the clock on the 20th"
        )
        self.ctx.wipe_store()
        init = {
            "reason": "breach test step 1: a clean start on the wiped store",
            "confirm_zero": True,
            "renew": True,
        }
        self.call(
            "1",
            [
                {
                    "op": "wait_health",
                    "id": "s1.ready",
                    "expect": {"store": "uninitialized"},
                    "within_s": 120,
                },
                self.admin(
                    "s1.init", "POST", "/admin/init", init, **{"body.state": "normal"}
                ),
                {
                    "op": "health",
                    "id": "s1.health",
                    "expect": {"store": "ok", "state": "normal"},
                },
            ],
        )
        self.dates = dates_after(str(self.ctx.results["s1.health"]["health"]["time"]))
        self.call(
            "1",
            [
                self.clock(
                    "s1.clock",
                    "breach test step 1: the clock to the 20th of next month",
                    to=self.dates.start,
                ),
                metric(
                    "1a",
                    KILL,
                    after="s1.clock",
                    labels=["normal"],
                    fresh=("h4_kill_switch_state", "s1.clock"),
                ),
                metric(
                    "1b",
                    spend("day"),
                    after="s1.clock",
                    value=0.0,
                    fresh=(meter_selector("day"), "s1.clock"),
                ),
                metric(
                    "1b",
                    spend("month"),
                    after="s1.clock",
                    value=0.0,
                    fresh=(meter_selector("month"), "s1.clock"),
                ),
                self.log(
                    "1c",
                    "operator.init",
                    self.span("s1.init"),
                    audit_id="{{s1.init.body.audit_id}}",
                ),
                self.log(
                    "1c",
                    "operator.test_clock",
                    "s1.clock",
                    audit_id="{{s1.clock.body.audit_id}}",
                ),
            ],
        )
        self.check_day("s1.clock", 0)

    def step2(self) -> None:
        self.ctx.say("step 2 · US2-1: one metered call, $0.10")
        self.call(
            "2",
            [
                self.spend(
                    "s2.spend",
                    "metered",
                    1,
                    "breach test step 2: one metered call",
                    meters={"day": 0.1, "month": 0.1},
                ),
                {
                    "op": "trace",
                    "assert": "2a",
                    "trace_id": "{{s2.spend.calls.0.trace_id}}",
                    "expect": {"h4.cost.usd": 0.1},
                    "within_s": 60,
                    "after": "s2.spend",
                },
                # US2-1's 60 s are the call's, not what is left of them when 2a ends.
                metric("2b", spend("day"), after="s2.spend", value=0.1),
                metric("2b", spend("month"), after="s2.spend", value=0.1),
            ],
        )

    def step3(self) -> None:
        keys = self.keys()
        self.ctx.say("step 3 · US2-2: metered calls to $3.50 today, the daily warning")
        self.call(
            "3",
            [
                self.spend(
                    "s3.spend",
                    "metered",
                    34,
                    "breach test step 3: metered calls to 3.50 USD today",
                    meters={"day": 3.5, "month": 3.5},
                ),
                *self.delivered("3a", "3b", keys["warn_day"], "s3.spend"),
                metric("3c", spend("day"), after="s3.spend", value=3.5),
                metric("3c", spend("day"), after="s3.spend", at_least=warn("day")),
            ],
        )

    def step4(self) -> None:
        keys = self.keys()
        self.ctx.say(
            "step 4 · the 21st: the model server stopped, and fallback calls to $1.40, then $1.50"
        )
        self.call(
            "4",
            [
                self.clock(
                    "s4.clock", "breach test step 4: the next UTC day, the 21st"
                ),
                metric(
                    "4a",
                    spend("day"),
                    after="s4.clock",
                    value=0.0,
                    fresh=(meter_selector("day"), "s4.clock"),
                ),
                metric(
                    "4a",
                    spend("month"),
                    after="s4.clock",
                    value=3.5,
                    fresh=(meter_selector("month"), "s4.clock"),
                ),
            ],
        )
        self.check_day("s4.clock", 1)
        self.ctx.stop_service(MODEL_SERVER[self.stack])
        down = {"adapter.local.healthy": False, "adapter.synthetic.healthy": True}
        self.call(
            "4",
            [
                {"op": "wait_health", "id": "s4.down", "expect": down, "within_s": 60},
                self.spend(
                    "s4.spend",
                    "fallback",
                    14,
                    "breach test step 4: fallback calls to grant 1's warning",
                    meters={"fallback_day": 1.4, "day": 1.4, "month": 4.9},
                ),
                *self.delivered("4b", "4c", keys["warn_g1"], "s4.spend"),
                metric("4d", spend("fallback_day"), after="s4.spend", value=1.4),
                metric("4d", warn("fallback_day"), after="s4.spend", value=1.4),
                self.spend(
                    "s4.more",
                    "fallback",
                    1,
                    "breach test step 4: one more fallback call, to 1.50 USD",
                    meters={"fallback_day": 1.5, "day": 1.5, "month": 5.0},
                ),
                metric("4e", spend("fallback_day"), after="s4.more", value=1.5),
            ],
        )

    def step5(self) -> None:
        keys = self.keys()
        self.ctx.say(
            "step 5 · US5-7: a restart keeps fallback's 1.50; five more calls spend it, the sixth is refused"
        )
        self.ctx.restart_gateway()
        ready = {
            "store": "ok",
            "adapter.local.healthy": False,
            "adapter.synthetic.healthy": True,
        }
        sixth = {
            "answered": 5,
            "stopped.status": 503,
            "stopped.cause": "fallback_awaiting_renewal",
        }
        self.call(
            "5",
            [
                {
                    "op": "wait_health",
                    "id": "s5.ready",
                    "expect": ready,
                    "within_s": 120,
                },
                # Only the new process's samples: the old one's shutdown flush is stamped after the restart began,
                # on the same series (round 1's review).
                metric(
                    "5a",
                    spend("fallback_day"),
                    after="s5.ready",
                    value=1.5,
                    fresh=(meter_selector("fallback_day"), "s5.ready"),
                ),
                self.spend(
                    "s5.spend",
                    "fallback",
                    6,
                    "breach test step 5: fallback calls to the allowance",
                    meters={"fallback_day": 2.0, "day": 2.0, "month": 5.5},
                    **sixth,
                ),
                self.log(
                    "5b",
                    "fallback.exhausted",
                    "s5.spend",
                    fields=("grant_no", "allowance_micro"),
                    grant_no=1,
                    allowance_micro=2000000,
                ),
                *self.delivered("5c", "5d", keys["exhausted_g1"], "s5.spend"),
                metric("5e", AWAITING, after="s5.spend", value=1.0),
                metric(
                    "5e", CAUSE, after="s5.spend", labels=["fallback_awaiting_renewal"]
                ),
            ],
        )

    def step6(self) -> None:
        keys = self.keys()
        renew_reason = "breach test step 6: a same-day renewal"
        self.ctx.say(
            "step 6 · US5-6: a same-day renewal grants $2 more; the next day's grants $2, not $4"
        )
        renewal = {
            "body.fallback.allowance_micro_usd": 4000000,
            "body.fallback.grant": 2,
        }
        audit = {
            "after.fallback_day.allowance_micro": 4000000,
            "after.fallback_day.grant_no": 2,
        }
        self.call(
            "6",
            [
                self.admin(
                    "s6.renew",
                    "POST",
                    "/admin/renew",
                    {"reason": renew_reason},
                    **renewal,
                ),
                self.log(
                    "6a",
                    "operator.renew",
                    "s6.renew",
                    audit_id="{{s6.renew.body.audit_id}}",
                    event_name="h4.audit",
                ),
                {
                    "op": "audit",
                    "assert": "6a",
                    "action": "renew",
                    "audit_id": "{{s6.renew.body.audit_id}}",
                    "reason": renew_reason,
                    "expect": audit,
                    "within_s": 10,
                    "after": "s6.renew",
                },
                self.spend(
                    "s6.again",
                    "fallback",
                    1,
                    "breach test step 6: fallback passes again after the renewal",
                    meters={"fallback_day": 2.1, "day": 2.1, "month": 5.6},
                ),
                metric(
                    "6b",
                    ALLOWANCE,
                    after="s6.renew",
                    value=4.0,
                    fresh=("h4_fallback_allowance_usd", "s6.renew"),
                ),
                metric(
                    "6b",
                    AWAITING,
                    after="s6.renew",
                    value=0.0,
                    fresh=("h4_fallback_awaiting_renewal", "s6.renew"),
                ),
                self.spend(
                    "s6.spend",
                    "fallback",
                    19,
                    "breach test step 6: grant 2 spent to 4.00 USD",
                    meters={"fallback_day": 4.0, "day": 4.0, "month": 7.5},
                ),
                *self.delivered("6c", "6c", keys["warn_g2"], "s6.spend")[:1],
                self.log(
                    "6d",
                    "fallback.exhausted",
                    "s6.spend",
                    fields=("grant_no", "allowance_micro"),
                    grant_no=2,
                    allowance_micro=4000000,
                ),
                metric("6e", spend("day"), after="s6.spend", value=4.0),
                metric("6e", AWAITING, after="s6.spend", value=1.0),
                self.clock(
                    "s6.clock", "breach test step 6: the next UTC day, the 22nd"
                ),
            ],
        )
        self.check_day("s6.clock", 2)
        self.ctx.restart_gateway()
        second = {"body.fallback.allowance_micro_usd": 2000000}
        self.call(
            "6",
            [
                {
                    "op": "wait_health",
                    "id": "s6.ready",
                    "expect": {"store": "ok", "adapter.local.healthy": False},
                    "within_s": 120,
                },
                {
                    "op": "hello",
                    "id": "s6.hello",
                    "expect": {"status": 503, "cause": "fallback_awaiting_renewal"},
                },
                metric(
                    "6f",
                    CAUSE,
                    after="s6.ready",
                    labels=["fallback_awaiting_renewal"],
                    fresh=("h4_degraded_cause", "s6.ready"),
                ),
                self.log(
                    "6g",
                    "call.degraded",
                    "s6.hello",
                    cause="fallback_awaiting_renewal",
                    trace_id="{{s6.hello.trace_id}}",
                ),
                self.admin(
                    "s6.renew2",
                    "POST",
                    "/admin/renew",
                    {"reason": "breach test step 6: the next day's renewal"},
                    **second,
                ),
                metric(
                    "6h",
                    ALLOWANCE,
                    after="s6.renew2",
                    value=2.0,
                    fresh=("h4_fallback_allowance_usd", "s6.renew2"),
                ),
                metric(
                    "6h",
                    AWAITING,
                    after="s6.renew2",
                    value=0.0,
                    fresh=("h4_fallback_awaiting_renewal", "s6.renew2"),
                ),
            ],
        )

    def step7(self) -> None:
        keys = self.keys()
        self.ctx.say(
            "step 7 · US2-3: the model server back, and metered calls to $5.00 today: the kill switch trips"
        )
        self.ctx.start_model_server()
        crossing = "{{s7.spend.calls.-1.trace_id}}"
        self.call(
            "7",
            [
                {
                    "op": "wait_health",
                    "id": "s7.up",
                    "expect": {"adapter.local.healthy": True},
                    "within_s": 300,
                },
                self.spend(
                    "s7.spend",
                    "metered",
                    50,
                    "breach test step 7: metered calls to 5.00 USD today",
                    meters={"day": 5.0, "month": 12.5},
                ),
                # Within 60 s of the crossing, the spend's last call (SC-002).
                metric("7a", KILL, after="s7.spend", labels=["degraded"]),
                self.log(
                    "7b",
                    "call.completed",
                    "s7.spend",
                    op_id="s7.crossing",
                    trace_id=crossing,
                ),
                self.log(
                    "7b",
                    "killswitch.tripped",
                    "s7.spend",
                    expect={"gap": {"from": "s7.crossing", "max_s": 60}},
                ),
                *self.delivered("7c", "7d", keys["trip_day"], "s7.spend"),
                {
                    "op": "hello",
                    "id": "s7.hello",
                    "expect": {"status": 503, "cause": "kill_switch_tripped"},
                },
                metric("7e", CAUSE, after="s7.spend", labels=["kill_switch_tripped"]),
                metric("7e", LOCAL_UP, after="s7.spend", value=1.0),
                self.log(
                    "7f",
                    "call.degraded",
                    "s7.hello",
                    cause="kill_switch_tripped",
                    trace_id="{{s7.hello.trace_id}}",
                ),
            ],
        )

    def step8(self) -> None:
        assert self.dates is not None
        keys = self.keys()
        self.ctx.say("step 8 · US2-6: the incident draft, with its evidence")
        # The draft is written once both channels of the trip alert are final, or 300 s after the trip
        # (contracts/alerts.md §7), retried every 10 s: both rows are timed from step 7's spend, the trip.
        trip = self.span("s7.spend")
        self.call(
            "8",
            [
                {
                    "op": "incident",
                    "id": "s8.incident",
                    "assert": "8b",
                    "ceiling": "day",
                    "period_key": self.dates.day(2),
                    "trace_id": "{{s7.spend.calls.-1.trace_id}}",
                    "trip_key": keys["trip_day"],
                    "within_s": 330,
                    **timed_from(trip),
                },
                self.log(
                    "8a",
                    "incident.drafted",
                    trip,
                    within_s=330,
                    fields=("incident_id", "path", "sha256"),
                    incident_id="{{s8.incident.id}}",
                    sha256="{{s8.incident.sha256}}",
                ),
            ],
        )

    def step9(self) -> None:
        reason = "breach test step 9: a reset with a reason, the same day"
        self.ctx.say(
            "step 9 · US2-4: a reset brings local answers back; metered calls stay refused at the ceiling"
        )
        refused = {"answered": 0, "stopped.cause": "meter_at_ceiling"}
        self.call(
            "9",
            [
                self.admin(
                    "s9.reset",
                    "POST",
                    "/admin/reset",
                    {"reason": reason},
                    **{"body.state": "normal"},
                ),
                self.log(
                    "9a",
                    "operator.reset",
                    "s9.reset",
                    audit_id="{{s9.reset.body.audit_id}}",
                    event_name="h4.audit",
                ),
                {
                    "op": "audit",
                    "assert": "9a",
                    "action": "reset",
                    "audit_id": "{{s9.reset.body.audit_id}}",
                    "reason": reason,
                    "within_s": 10,
                    "after": "s9.reset",
                },
                metric(
                    "9b",
                    KILL,
                    after="s9.reset",
                    labels=["normal"],
                    fresh=("h4_kill_switch_state", "s9.reset"),
                ),
                {
                    "op": "hello",
                    "id": "s9.hello",
                    "expect": {"status": 200, "route": "local"},
                },
                {
                    "op": "trace",
                    "assert": "9c",
                    "trace_id": "{{s9.hello.trace_id}}",
                    "expect": {"gen_ai.provider.name": "local", "h4.cost.usd": 0},
                    "within_s": 60,
                    "after": "s9.hello",
                },
                self.spend(
                    "s9.refused",
                    "metered",
                    1,
                    "breach test step 9: a metered call at the ceiling",
                    meters={"day": 5.0, "month": 12.5},
                    **refused,
                ),
                self.log("9d", "call.degraded", "s9.refused", cause="meter_at_ceiling"),
                metric("9e", spend("day"), after="s9.refused", value=5.0),
                metric("9e", spend("day"), after="s9.refused", at_least=ceiling("day")),
            ],
        )

    def step10(self) -> None:
        assert self.dates is not None
        keys = self.keys()
        self.ctx.say(
            "step 10 · US2-5: the month to $20.00 trips; rollovers leave it degraded until a reset"
        )
        reset = {"body.state": "normal", "body.meters_at_ceiling": []}
        self.call(
            "10",
            [
                self.clock(
                    "s10.clock1", "breach test step 10: the next UTC day, the 23rd"
                ),
                self.spend(
                    "s10.spend1",
                    "metered",
                    15,
                    "breach test step 10: the month to 14.00 USD",
                    meters={"day": 1.5, "month": 14.0},
                ),
                *self.delivered("10a", "10b", keys["warn_month"], "s10.spend1"),
                metric("10c", spend("month"), after="s10.spend1", value=14.0),
                metric(
                    "10c", spend("month"), after="s10.spend1", at_least=warn("month")
                ),
                self.spend(
                    "s10.spend2",
                    "metered",
                    34,
                    "breach test step 10: 4.90 USD today, 17.40 USD this month",
                    meters={"day": 4.9, "month": 17.4},
                ),
                self.clock(
                    "s10.clock2", "breach test step 10: the next UTC day, the 24th"
                ),
                self.spend(
                    "s10.spend3",
                    "metered",
                    26,
                    "breach test step 10: the month to 20.00 USD",
                    meters={"day": 2.6, "month": 20.0},
                ),
                metric("10d", spend("month"), after="s10.spend3", value=20.0),
                metric("10d", KILL, after="s10.spend3", labels=["degraded"]),
                self.log("10e", "killswitch.tripped", "s10.spend3"),
                *self.delivered("10e", "10e", keys["trip_month"], "s10.spend3")[:1],
                self.clock(
                    "s10.clock3", "breach test step 10: the next UTC day, the 25th"
                ),
                metric(
                    "10f",
                    spend("day"),
                    after="s10.clock3",
                    value=0.0,
                    fresh=(meter_selector("day"), "s10.clock3"),
                ),
                metric(
                    "10f",
                    KILL,
                    after="s10.clock3",
                    labels=["degraded"],
                    fresh=("h4_kill_switch_state", "s10.clock3"),
                ),
                self.clock(
                    "s10.clock4",
                    "breach test step 10: into the next month",
                    to=self.dates.next_month,
                ),
                metric(
                    "10g",
                    spend("month"),
                    after="s10.clock4",
                    value=0.0,
                    fresh=(meter_selector("month"), "s10.clock4"),
                ),
                metric(
                    "10g",
                    KILL,
                    after="s10.clock4",
                    labels=["degraded"],
                    fresh=("h4_kill_switch_state", "s10.clock4"),
                ),
                self.admin(
                    "s10.reset",
                    "POST",
                    "/admin/reset",
                    {"reason": "breach test step 10: a reset in the new month"},
                    **reset,
                ),
                self.spend(
                    "s10.spend4",
                    "metered",
                    1,
                    "breach test step 10: one metered call in the new month",
                    meters={"day": 0.1, "month": 0.1},
                ),
                metric(
                    "10h",
                    KILL,
                    after="s10.reset",
                    labels=["normal"],
                    fresh=("h4_kill_switch_state", "s10.reset"),
                ),
                metric("10h", spend("day"), after="s10.spend4", value=0.1),
                metric("10h", spend("month"), after="s10.spend4", value=0.1),
            ],
        )
        self.check_day("s10.clock1", 3)
        self.check_day("s10.clock4", -1)

    def step11(self) -> None:
        self.ctx.say(
            "step 11 · US2-7: the store stopped, then wiped: fail closed, then rebuilt from the journal"
        )
        stopped = self.ctx.stop_service("gateway-state")
        self.call(
            "11",
            [
                {
                    "op": "hello",
                    "id": "s11.hello",
                    "expect": {"status": 503, "cause": "store_unreachable"},
                },
                metric(
                    "11a",
                    CAUSE,
                    after=stopped,
                    labels=["store_unreachable"],
                    fresh=("h4_degraded_cause", stopped[0]),
                ),
                self.log(
                    "11b", "state.unknown", stopped, condition="store_unreachable"
                ),
            ],
        )
        wiped = self.ctx.wipe_store()
        offset = "{{s10.clock4.body.offset_ms}}"
        rebuilt = {
            "body.fallback_awaiting_renewal": True,
            "body.meters.day.spent_micro_usd": 100000,
            "body.meters.month.spent_micro_usd": 100000,
            "body.meters.day.sources.journal": 100000,
            "body.meters.month.sources.journal": 100000,
            "body.clock_offset_ms": offset,
        }
        reason = "breach test step 11: the wiped store, rebuilt from the journal"
        audit = {
            "detail.chosen.day": 100000,
            "detail.chosen.month": 100000,
            "detail.renewed": False,
            "detail.clock_offset_ms": offset,
        }
        # The running gateway sees its store come back empty as store_uninitialized (data-model.md §6.1, "the store's
        # volume is lost"), with no restart: the dashboard shows it, /health reports it, and init rebuilds the store.
        # A gateway that never does misses 11c and fails s11.empty, and the step stops there.
        self.call(
            "11",
            [
                # Timed, and its samples counted, from the store coming back empty.
                metric(
                    "11c",
                    CAUSE,
                    after=wiped,
                    labels=["store_uninitialized"],
                    fresh=("h4_degraded_cause", wiped[1]),
                ),
                {
                    "op": "wait_health",
                    "id": "s11.empty",
                    "expect": {"store": "uninitialized"},
                    "within_s": 120,
                },
                self.admin(
                    "s11.init", "POST", "/admin/init", {"reason": reason}, **rebuilt
                ),
                self.log(
                    "11d",
                    "operator.init",
                    "s11.init",
                    audit_id="{{s11.init.body.audit_id}}",
                ),
                {
                    "op": "audit",
                    "assert": "11d",
                    "action": "init",
                    "audit_id": "{{s11.init.body.audit_id}}",
                    "reason": reason,
                    "expect": audit,
                    "within_s": 10,
                    "after": "s11.init",
                },
                metric(
                    "11e",
                    spend("day"),
                    after="s11.init",
                    value=0.1,
                    fresh=(meter_selector("day"), "s11.init"),
                ),
                metric(
                    "11e",
                    spend("month"),
                    after="s11.init",
                    value=0.1,
                    fresh=(meter_selector("month"), "s11.init"),
                ),
                metric(
                    "11e",
                    AWAITING,
                    after="s11.init",
                    value=1.0,
                    fresh=("h4_fallback_awaiting_renewal", "s11.init"),
                ),
            ],
        )


def apply_overlay(ctx: Context) -> None:
    """contracts/env-files.md §7.2: exactly ALERT_DELIVERY=real, in a fresh 0700 directory outside the tree, as the
    gateway's last env file, and the gateway recreated with it. Where the directory would go is checked, resolved,
    before anything is made: a TMPDIR inside the tree, or a link into it, is refused and leaves nothing there. mkdtemp
    then makes a new directory directly under that parent, which can't lead anywhere else."""
    parent = Path(ctx.environ.get("TMPDIR") or tempfile.gettempdir())
    if parent.resolve().is_relative_to(ROOT.resolve()):
        raise Stop(
            "the overlay's temporary directory would be inside the tree: set TMPDIR outside it"
        )
    directory = Path(tempfile.mkdtemp(prefix="h4reet-delivery-", dir=str(parent)))
    path = directory / "delivery-real.vars"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as file:
        file.write("ALERT_DELIVERY=real\n")
    ctx.overlay = path
    ctx.lifecycle(
        "docker compose up gateway, with ALERT_DELIVERY=real",
        ctx.compose("up", "--detach", "--no-deps", *UP_WAIT, "gateway", overlay=True),
    )


def remove_overlay(ctx: Context) -> None:
    """The gateway back on dev's own files, and the overlay deleted, however the run ended but by SIGKILL."""
    try:
        ctx.lifecycle(
            "docker compose up gateway, back on the stand-ins",
            ctx.compose("up", "--detach", "--no-deps", *UP_WAIT, "gateway"),
        )
    finally:
        if ctx.overlay is not None:
            shutil.rmtree(ctx.overlay.parent, ignore_errors=True)
            ctx.overlay = None


def cleanup(ctx: Context) -> None:
    """Put back what the run stopped, whatever happened: the model server and the store."""
    for service in sorted(ctx.stopped):
        try:
            if service == "gateway-state":
                ctx.lifecycle(
                    "docker compose up gateway-state",
                    ctx.compose("up", "--detach", "--no-deps", *UP_WAIT, service),
                )
                ctx.stopped.discard(service)
            else:
                ctx.start_model_server()
        except Stop as problem:
            ctx.say(f"  cleanup: {problem}")


def run(ctx: Context) -> int:
    report = Report(ctx.delivery)
    steps = Steps(ctx, report)
    began = time.monotonic()
    overlaid = False
    try:
        steps.guard()
        if ctx.delivery == "real":
            apply_overlay(ctx)
            overlaid = True
        for step in (
            steps.step1,
            steps.step2,
            steps.step3,
            steps.step4,
            steps.step5,
            steps.step6,
            steps.step7,
            steps.step8,
            steps.step9,
            steps.step10,
            steps.step11,
        ):
            step()
    except Stop as stop:
        report.stopped = str(stop)
        ctx.say(f"breach test: {stop}")
    except (KeyboardInterrupt, Interrupted) as stop:
        # The same cleanup as any end, which ignores any further interrupt (ignoring_signals).
        why = "Ctrl-C" if isinstance(stop, KeyboardInterrupt) else str(stop)
        report.stopped = f"interrupted ({why})"
        ctx.say(f"breach test: interrupted ({why}): putting the stack back")
    finally:
        with ignoring_signals():
            try:
                if overlaid or ctx.overlay is not None:
                    remove_overlay(ctx)
            except Stop as problem:
                ctx.say(f"  cleanup: {problem}")
            cleanup(ctx)
            ctx.say("")
            for line in report.table():
                ctx.say(line)
            ctx.say(
                f"breach test: h4reet-{ctx.stack}, {ctx.delivery} delivery, {round(time.monotonic() - began)} s"
            )
    return 0 if report.passed() else 1


# --- the command line -----------------------------------------------------------------------------------------------


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        raise Refusal(message)


def real_run(
    argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
) -> tuple[int, str, str]:
    try:
        done = subprocess.run(
            argv,
            input=stdin,
            capture_output=True,
            text=True,
            env=env,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return 124, "", f"timed out after {round(timeout)} s"
    except OSError as error:
        return 127, "", f"couldn't run {argv[0]}: {error.strerror or error}"
    return done.returncode, done.stdout, done.stderr


def real_git(args: list[str]) -> tuple[int, str]:
    try:
        done = subprocess.run(
            ["git", "-C", str(ROOT), *args],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return 1, ""
    return done.returncode, done.stdout


def check_worktree(git: Git) -> None:
    """contracts/env-files.md §7.3: the engine serves the main working tree, so dev-cpu runs from it."""
    code, git_dir = git(["rev-parse", "--path-format=absolute", "--git-dir"])
    code2, common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"])
    if code or code2:
        raise Refusal(f"{ROOT} isn't a git working tree")
    if git_dir.strip() != common.strip():
        raise Refusal(
            "this is a linked worktree: run dev-cpu from the main working tree (contracts/env-files.md §7.3)"
        )


def read_token(stack: str, operator: Any, home: Path) -> str:
    try:
        if stack == "dev-cpu":
            return operator.read_devcpu_token(DEVCPU_VARS)
        return operator.read_token_file("dev", home)
    except operator.TokenProblem as problem:
        raise Refusal(f"a token problem: {problem}") from None


def check_real_delivery(env_file: Path, operator: Any) -> None:
    """contracts/env-files.md §7.2: every real channel key filled, named when it isn't, never shown."""
    try:
        values, errors = operator.parse_env(env_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as error:
        raise Refusal(
            f"{env_file} can't be read: {getattr(error, 'strerror', None) or type(error).__name__}"
        ) from None
    if errors:
        raise Refusal(f"{env_file}: {'; '.join(errors)}")
    empty = [key for key in REAL_KEYS if not values.get(key)]
    if empty:
        raise Refusal(
            f"--delivery real needs dev's real channel keys filled; these are empty: {', '.join(empty)}"
        )


def check_run_tree(run_file: Path, operator: Any) -> None:
    """dev runs from the export h4reet-dev runs, which make up names in its run file as H4_TREE (contracts/env-files.md
    §12), and from nowhere else. The compose file and the probe's build context are this file's own tree, built and run
    on the host's engine with dev's token, so a run from the working tree would put the working tree's code there
    (FR-039). make's path to the export isn't enough: this file checks that its own tree is the run file's."""
    try:
        values, errors = operator.parse_env(run_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as error:
        raise Refusal(
            f"{run_file} can't be read: {getattr(error, 'strerror', None) or type(error).__name__}"
        ) from None
    tree = values.get("H4_TREE", "")
    if errors or not tree:
        problems = "; ".join(errors) or "no H4_TREE"
        raise Refusal(
            f"{run_file} names no export ({problems}): start h4reet-dev with make up ENV=dev, then run "
            "make breach-test ENV=dev"
        )
    if Path(tree).resolve() != ROOT.resolve():
        raise Refusal(
            f"h4reet-dev runs the export {tree}, and this breach.py is in {ROOT}: dev's run uses the running "
            "commit's compose file and probe only. Run make breach-test ENV=dev, which runs the export's breach.py"
        )


def context(
    args: argparse.Namespace,
    *,
    runner: Runner,
    environ: Mapping[str, str],
    out: TextIO,
    git: Git,
    home: Path,
) -> Context:
    sandboxed = environ.get("SANDBOX_RUNTIME") == "1"
    docker_host = environ.get("DOCKER_HOST", "")
    if args.delivery == "real" and args.stack != "dev":
        raise Refusal(
            "--delivery real is dev's recorded run, in the Author's terminal (contracts/env-files.md §7.2)"
        )
    if sandboxed and args.stack != "dev-cpu":
        raise Refusal(
            f"{args.stack} is the Author's: agent sessions run the breach test on dev-cpu only (FR-008, FR-039)"
        )
    if not PROBE_DOCKERFILE.is_file():
        raise Refusal(
            f"{PROBE_DOCKERFILE} is missing: the probe's image can't be built"
        )
    operator = operator_module()
    run_file = None
    if args.stack == "dev":
        if docker_host in (ENGINE_HOST, RELAY_HOST):
            raise Refusal(
                "dev runs on the host's engine: unset DOCKER_HOST, which names the agents' engine"
            )
        if args.env_file is None or args.run_file is None:
            raise Refusal(
                "dev needs --env-file and --run-file: run make breach-test ENV=dev"
            )
        run_file = Path(args.run_file)
        if not run_file.is_file():
            raise Refusal(
                f"{run_file} is missing: h4reet-dev wasn't started by make up ENV=dev"
            )
        check_run_tree(run_file, operator)
        env_file = Path(args.env_file)
        if args.delivery == "real":
            check_real_delivery(env_file, operator)
    else:
        env_file = Path(args.env_file) if args.env_file else DEVCPU_VARS
        if env_file.resolve() != DEVCPU_VARS.resolve():
            raise Refusal(f"dev-cpu's env file is {DEVCPU_VARS}")
        if sandboxed and not RELAY.is_file():
            raise Refusal(
                f"{RELAY} is missing: the agents' engine is reached through it"
            )
        if not sandboxed and docker_host != ENGINE_HOST:
            raise Refusal(
                "dev-cpu runs on the agents' engine only (FR-039): from an agent session, through the relay, or "
                f"from your terminal with DOCKER_HOST={ENGINE_HOST}"
            )
        check_worktree(git)
    token = read_token(args.stack, operator, home)
    return Context(
        args.stack,
        env_file,
        run_file,
        args.delivery,
        token,
        runner,
        environ,
        out,
        probe_module(),
    )


def main(
    argv: list[str] | None = None,
    *,
    runner: Runner | None = None,
    environ: Mapping[str, str] | None = None,
    out: TextIO | None = None,
    git: Git | None = None,
    home: Path | None = None,
) -> int:
    out = out or sys.stdout
    environ = os.environ if environ is None else environ
    parser = Parser(
        prog="breach.py", description="The breach test (plan §8).", allow_abbrev=False
    )
    parser.add_argument("--stack", choices=STACKS, required=True)
    parser.add_argument("--env-file", help="the stack's env file (make passes it)")
    parser.add_argument(
        "--run-file", help="dev's run file, from make up (make passes it)"
    )
    parser.add_argument("--delivery", choices=("standin", "real"), default="standin")
    try:
        args = parser.parse_args(argv)
        ctx = context(
            args,
            runner=runner or real_run,
            environ=environ,
            out=out,
            git=git or real_git,
            home=home or Path.home(),
        )
    except Refusal as refusal:
        print(f"breach.py: {refusal}", file=out, flush=True)
        print(
            "breach.py: exit 2: refused before anything changed", file=out, flush=True
        )
        return 2
    try:
        with interruptible():
            code = run(ctx)
    except (KeyboardInterrupt, Interrupted):
        # A second interrupt that came before the cleanup began: run()'s cleanup has finished anyway, under
        # ignoring_signals(), so only the exit is left.
        code = 1
    if code:
        print(
            "breach.py: exit 1: an assertion missed, or the run stopped (the table says which)",
            file=out,
            flush=True,
        )
    return code


if __name__ == "__main__":
    sys.exit(main())
