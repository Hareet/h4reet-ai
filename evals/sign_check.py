#!/usr/bin/env python3
"""The sign's check from end to end (spec 014, FR-056 to FR-059; SC-010; contracts/sign-check.md; plan.md §10, PD-20).

    make sign-check ENV=dev|dev-cpu        its only entry point, which runs:
    python3 -I -B -X pycache_prefix=/dev/null <tree>/evals/sign_check.py --stack dev|dev-cpu [--env-file F]
        [--run-file F]

On a running dev stack, with the local model stopped, one conversation turn through the edge's site listener, as the
page sends it, reaches the room's own cost code as a paid estimate; with the model started again, a turn reads
"local · $0". Every HTTP call runs in a one-off breach-probe container on the stack's internal network, the probe's
code, evals/sign_probe.py, read from standard input, so the image needs nothing new; the page's half is the room's own
turn-cost code, apps/web/build/room/sign-reading.ts, run by Node on the client with each turn's three facts alone.

It loads evals/breach.py by path for the guards the breach test already proves on these stacks: dev from the export
its run file names, dev-cpu on the agents' engine from the main working tree, the docker client's narrow environment,
the model servers' names, the signal handling, and the cleaned output. It never calls a paid adapter (dev's route is
local, then synthetic), never reads Langfuse, Prometheus, or the meter, and leaves the model server running whatever
the outcome, a Ctrl-C or a SIGTERM included.

Exit codes: 0 every step passed; 1 a step missed, or the run stopped (the table says which); 2 refused before anything
changed: a stack but dev and dev-cpu, prod by name, dev from an agent session, dev-cpu off the agents' engine or from a
linked worktree, a gateway without synthetic spend, or a kill switch that isn't normal or a fallback awaiting renewal.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, NoReturn, TextIO

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / "evals" / "sign_probe.py"
READING = ROOT / "apps" / "web" / "build" / "room" / "sign-reading.ts"
STOP_WAIT_S = 30
START_WAIT_S = 120


def _load(name: str, path: Path) -> Any:
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"can't load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


breach = _load("h4_breach", ROOT / "evals" / "breach.py")
Refusal = breach.Refusal
Runner = Callable[
    [list[str], "str | None", dict[str, str], float], tuple[int, str, str]
]


class Miss(Exception):
    """A step that didn't hold: the run stops, its row says why."""


@dataclass
class Run:
    stack: str
    env_file: Path
    run_file: Path | None
    runner: Runner
    environ: Mapping[str, str]
    out: TextIO
    sleep: Callable[[float], None]
    rows: list[tuple[str, str, str]] = field(default_factory=list)
    stopped: bool = False

    @property
    def sandboxed(self) -> bool:
        return self.environ.get("SANDBOX_RUNTIME") == "1"

    def say(self, text: str) -> None:
        breach.tell(self.out, text)

    def docker(self) -> list[str]:
        return [str(breach.RELAY), "docker"] if self.sandboxed else ["docker"]

    def compose(self, *args: str) -> list[str]:
        command = [
            *self.docker(),
            "compose",
            "-p",
            f"h4reet-{self.stack}",
            "-f",
            str(breach.COMPOSE_FILE),
        ]
        command += ["--env-file", str(self.env_file)]
        if self.run_file is not None:
            command += ["--env-file", str(self.run_file)]
        return command + list(args)

    def env(self) -> dict[str, str]:
        kept = {key: self.environ[key] for key in breach.HOP_ENV if key in self.environ}
        return {**kept, "LC_ALL": "C"}

    def probe(self, op: str) -> dict[str, Any]:
        command = self.compose(
            "--profile", "breach", "run", "--build", "--rm", "-T", "breach-probe"
        )
        command += ["python3", "-I", "-B", "-", op]
        code, out, err = self.runner(
            command, PROBE.read_text(encoding="utf-8"), self.env(), 300.0
        )
        for line in out.splitlines():
            if line.startswith("{"):
                try:
                    parsed = json.loads(line)
                except ValueError:
                    continue
                if (
                    isinstance(parsed, dict)
                    and parsed.get("sign_probe") == 1
                    and isinstance(parsed.get(op), dict)
                ):
                    return parsed[op]
        tail = " | ".join(x.strip() for x in err.strip().splitlines()[-2:])
        raise Miss(
            f"the probe's {op} gave no answer (docker exited {code}){': ' + tail if tail else ''}"
        )

    def reading(self, facts: Mapping[str, Any]) -> dict[str, Any]:
        command = ["node", "--import", "tsx", str(READING)]
        kept = {
            k: facts[k] for k in ("status", "route", "cost_micro_usd") if k in facts
        }
        code, out, _ = self.runner(
            command,
            json.dumps(kept) + "\n",
            {"PATH": self.environ.get("PATH", "")},
            120.0,
        )
        line = next((x for x in out.splitlines() if x.startswith("{")), None)
        if code != 0 or line is None:
            raise Miss(f"the page's reading gave nothing (node exited {code})")
        return json.loads(line)

    def lifecycle(self, verb: str) -> None:
        service = breach.MODEL_SERVER[self.stack]
        code, _, err = self.runner(
            self.compose(verb, service), None, self.env(), breach.LIFECYCLE_TIMEOUT_S
        )
        if code != 0:
            tail = " | ".join(x.strip() for x in err.strip().splitlines()[-2:])
            raise Miss(
                f"docker compose {verb} {service} failed (exit {code}){': ' + tail if tail else ''}"
            )
        self.stopped = verb == "stop"

    def wait_local(self, healthy: bool, seconds: int) -> None:
        for _ in range(seconds):
            if self.probe("health").get("local_healthy") is healthy:
                return
            self.sleep(1)
        raise Miss(
            f"local didn't read {'healthy' if healthy else 'unhealthy'} within {seconds} s"
        )

    def row(self, step: str, result: str, detail: str) -> None:
        self.rows.append((step, result, detail))


def refuse_stack(run: Run) -> None:
    """contracts/sign-check.md §2's stack refusals, from one read of the gateway's /health: nothing changes."""
    health = run.probe("health")
    if "error" in health:
        raise Refusal(
            f"the gateway didn't answer /health ({health['error']}): is h4reet-{run.stack} up?"
        )
    if not health.get("synthetic"):
        raise Refusal(
            "the gateway reports no synthetic spend (GATEWAY_TEST_SYNTHETIC_SPEND): its route has no fallback to prove"
        )
    if health.get("state") != "normal":
        raise Refusal(
            f"the kill switch reads {health.get('state')}, not normal: a turn would be degraded; "
            "the Author restores it with make operator-reset"
        )
    if health.get("awaiting_renewal"):
        raise Refusal(
            "the fallback sub-budget awaits renewal, so it can't admit one synthetic call; "
            "the Author renews it with make operator-renew"
        )


def check_turn(run: Run, step: str, want_route: str) -> None:
    turn = run.probe("turn")
    facts = {k: turn.get(k) for k in ("status", "route", "cost_micro_usd")}
    readings = run.reading(facts)
    shown = f"status {facts['status']}, route {facts['route']}, cost {facts['cost_micro_usd']}"
    shown += (
        f"; this call {readings.get('call')!s}, this visit {readings.get('visit')!s}"
    )
    cost = facts["cost_micro_usd"]
    if facts["status"] != 200 or facts["route"] != want_route:
        run.row(step, "miss", shown)
        raise Miss(f"{step}: wanted a 200 with route {want_route}")
    call = str(readings.get("call") or "")
    if want_route == "fallback":
        ok = (
            isinstance(cost, int)
            and cost > 0
            and call.endswith("est.")
            and str(readings.get("visit")).endswith("est.")
        )
    else:
        ok = cost == 0 and call == "local · $0"
    run.row(step, "pass" if ok else "miss", shown)
    if not ok:
        raise Miss(
            f"{step}: the sign's reading isn't the {'paid estimate' if want_route == 'fallback' else 'local'}"
        )


def steps(run: Run) -> None:
    run.say(
        f"sign check: h4reet-{run.stack}, {breach.MODEL_SERVER[run.stack]} stopped, then started"
    )
    run.lifecycle("stop")
    try:
        run.wait_local(False, STOP_WAIT_S)
    except Miss:
        run.row("stop", "miss", "local still healthy")
        raise
    run.row("stop", "pass", "local unhealthy")
    check_turn(run, "paid", "fallback")
    run.lifecycle("start")
    run.wait_local(True, START_WAIT_S)
    run.row("start", "pass", "local healthy")
    check_turn(run, "local", "local")


def table(run: Run) -> None:
    run.say("| step | result | what it read |")
    run.say("|---|---|---|")
    for step, result, detail in run.rows:
        run.say(f"| {step} | {result} | {detail} |")


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        raise Refusal(message)


def context(
    args: argparse.Namespace,
    *,
    runner: Runner,
    environ: Mapping[str, str],
    out: TextIO,
    git: Any,
    sleep,
):
    sandboxed = environ.get("SANDBOX_RUNTIME") == "1"
    docker_host = environ.get("DOCKER_HOST", "")
    if sandboxed and args.stack != "dev-cpu":
        raise Refusal(
            f"{args.stack} is the Author's: agent sessions run the sign check on dev-cpu only"
        )
    run_file = None
    if args.stack == "dev":
        if docker_host in (breach.ENGINE_HOST, breach.RELAY_HOST):
            raise Refusal(
                "dev runs on the host's engine: unset DOCKER_HOST, which names the agents' engine"
            )
        if args.env_file is None or args.run_file is None:
            raise Refusal(
                "dev needs --env-file and --run-file: run make sign-check ENV=dev"
            )
        run_file = Path(args.run_file)
        if not run_file.is_file():
            raise Refusal(
                f"{run_file} is missing: h4reet-dev wasn't started by make up ENV=dev"
            )
        breach.check_run_tree(run_file, breach.operator_module())
        env_file = Path(args.env_file)
    else:
        env_file = Path(args.env_file) if args.env_file else breach.DEVCPU_VARS
        if env_file.resolve() != breach.DEVCPU_VARS.resolve():
            raise Refusal(f"dev-cpu's env file is {breach.DEVCPU_VARS}")
        if not sandboxed and docker_host != breach.ENGINE_HOST:
            raise Refusal(
                "dev-cpu runs on the agents' engine only: from an agent session, through the relay, or from your "
                f"terminal with DOCKER_HOST={breach.ENGINE_HOST}"
            )
        breach.check_worktree(git)
    return Run(args.stack, env_file, run_file, runner, environ, out, sleep)


def main(
    argv: list[str] | None = None,
    *,
    runner: Runner | None = None,
    environ: Mapping[str, str] | None = None,
    out: TextIO | None = None,
    git: Any = None,
    sleep: Callable[[float], None] | None = None,
) -> int:
    out = out or sys.stdout
    environ = os.environ if environ is None else environ
    args_in = sys.argv[1:] if argv is None else argv
    parser = Parser(
        prog="sign_check.py",
        description="The sign's check (spec 014).",
        allow_abbrev=False,
    )
    parser.add_argument("--stack", required=True)
    parser.add_argument("--env-file")
    parser.add_argument("--run-file")
    try:
        args = parser.parse_args(args_in)
        if args.stack == "prod":
            raise Refusal(
                "prod is never a sign-check stack: it runs on dev or dev-cpu, and calls no paid adapter"
            )
        if args.stack not in breach.STACKS:
            raise Refusal(f"{args.stack} isn't dev or dev-cpu")
        run = context(
            args,
            runner=runner or breach.real_run,
            environ=environ,
            out=out,
            git=git or breach.real_git,
            sleep=sleep or time.sleep,
        )
        refuse_stack(run)
    except Refusal as refusal:
        breach.tell(out, f"sign_check.py: {refusal}")
        breach.tell(out, "sign_check.py: exit 2: refused before anything changed")
        return 2
    except Miss as miss:
        breach.tell(out, f"sign_check.py: {miss}")
        breach.tell(out, "sign_check.py: exit 2: refused before anything changed")
        return 2
    code = 1
    try:
        with breach.interruptible():
            steps(run)
        code = 0
    except Miss as miss:
        run.say(f"  miss: {miss}")
    except (KeyboardInterrupt, breach.Interrupted):
        run.say("  stopped")
    finally:
        with breach.ignoring_signals():
            if run.stopped:
                try:
                    run.lifecycle("start")
                except Miss as miss:
                    run.say(f"  {miss}: start it with make up ENV={run.stack}")
            table(run)
    breach.tell(
        out,
        "sign check: pass"
        if code == 0
        else "sign_check.py: exit 1: a step missed, or the run stopped",
    )
    return code


if __name__ == "__main__":
    sys.exit(main())
