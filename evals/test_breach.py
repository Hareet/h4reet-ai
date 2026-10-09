"""Tests for evals/breach.py, the breach test's orchestrator, and make breach-test (plan §8; contracts/env-files.md §7.2;
tasks.md T080).

No stack runs here. A fake docker runner records every command and plays the probe: it reads each probe call's token
line and operations from standard input, and answers each operation as a healthy stack would, by meeting the
operation's own expectations, or as a broken one, when a test names the assertion to miss or the action to fail. So
the whole run, its twelve steps, its lifecycle commands, its refusals, its cleanup, and its table run here; what each
assertion means on a real stack is the probe's, which evals/test_breach_helpers.py tests.
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import io
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]


def load(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


breach = load("h4_breach", REPO / "evals" / "breach.py")
probe = breach.probe_module()
DEVCPU_TOKEN = breach.operator_module().read_devcpu_token(
    REPO / "deploy" / "env.agents" / "dev-cpu.vars"
)
START = "2026-10-09T12:00:00.000Z"


def set_path(node: dict[str, Any], path: str, value: Any) -> None:
    parts = path.split(".")
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = value


class FakeStack:
    """The docker commands' stand-in: the lifecycle commands succeed, and each probe call answers its operations."""

    def __init__(
        self,
        *,
        miss: set[str] = frozenset(),
        fail: set[str] = frozenset(),
        guard: str = "ok",
    ) -> None:
        self.commands: list[list[str]] = []
        self.stdins: list[str] = []
        self.envs: list[dict[str, str]] = []
        self.miss, self.fail, self.guard = set(miss), set(fail), guard
        self.time = dt.datetime.fromisoformat(START.replace("Z", "+00:00"))
        self.offset_ms = 0
        self.audit_id = 0
        self.ops_seen: list[dict[str, Any]] = []

    def __call__(
        self, argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        self.commands.append(argv)
        self.stdins.append(stdin or "")
        self.envs.append(env)
        if "breach-probe" not in argv:
            return 0, "", ""
        return self.probe(argv, stdin or "")

    def stamp(self) -> str:
        return self.time.isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def answer(self, op: dict[str, Any], results: dict[str, Any]) -> dict[str, Any]:
        kind = op["op"]
        result: dict[str, Any] = {
            "op": kind,
            "id": op.get("id"),
            "assert": op.get("assert"),
            "started_s": 1_900_000_000.0,
            "ended_s": 1_900_000_001.5,
        }
        if kind in ("health", "wait_health"):
            if self.guard == "unreachable":
                return {
                    **result,
                    "ok": False,
                    "error": "Unreachable: gateway:8080: Name or service not known",
                }
            health = {
                "time": self.stamp(),
                "stack": "dev-cpu",
                "env": "dev",
                "store": "ok",
                "state": "normal",
                "fallback": {"adapter": "synthetic"},
                "test_machinery": {"clock": True, "synthetic": True},
                "adapter": {},
            }
            for path, value in (op.get("expect") or {}).items():
                set_path(health, path, value)
            if self.guard == "prod-like" and op.get("id") == "guard":
                health["test_machinery"]["synthetic"] = False
                return {
                    **result,
                    "ok": False,
                    "health": health,
                    "misses": ["test_machinery.synthetic"],
                }
            return {**result, "ok": True, "health": health}
        if kind == "admin":
            body: dict[str, Any] = {}
            if op["path"] == "/admin/test/clock":
                if "set" in op["body"]:
                    self.time = dt.datetime.fromisoformat(
                        op["body"]["set"].replace("Z", "+00:00")
                    )
                else:
                    self.time += dt.timedelta(seconds=op["body"]["advance_s"])
                self.offset_ms += 1000
                body = {"gateway_time": self.stamp(), "offset_ms": self.offset_ms}
            self.audit_id += 1
            body["audit_id"] = self.audit_id
            answer = {"status": 200, "error": None, "body": body}
            for path, value in (op.get("expect") or {}).items():
                set_path(answer, path, value)
            return {**result, "ok": True, **answer}
        if kind == "spend":
            expect = op.get("expect") or {}
            answered = expect.get("answered", op["count"])
            route = op.get("route") or op["attribution"]
            calls = [
                {
                    "n": n,
                    "status": 200,
                    "route": route,
                    "cost_micro_usd": 100000,
                    "trace_id": f"{len(self.ops_seen):016x}{n:016x}",
                }
                for n in range(1, answered + 1)
            ]
            stopped = None
            if expect.get("stopped.cause"):
                stopped = {
                    "n": answered + 1,
                    "status": expect.get("stopped.status", 503),
                    "cause": expect["stopped.cause"],
                }
            return {
                **result,
                "ok": True,
                "requested": op["count"],
                "answered": answered,
                "calls": calls,
                "stopped": stopped,
            }
        if kind == "hello":
            return {
                **result,
                "ok": True,
                "status": 200,
                "trace_id": "f" * 32,
                **(op.get("expect") or {}),
            }
        if kind == "incident":
            return {
                **result,
                "ok": True,
                "id": 7,
                "status": "written",
                "sha256": "ab" * 32,
                "checks": {"written": True},
            }
        if kind == "log":
            return {
                **result,
                "ok": True,
                "records": [
                    {"ts": "t", "ts_ns": 1, "channel": "telegram", "lag_s": "0.4"}
                ],
            }
        if kind == "trace":
            return {
                **result,
                "ok": True,
                "observed": dict(op.get("expect") or {}),
                "via": {},
                "waited_s": 3,
            }
        return {**result, "ok": True, "observed": 0.1, "waited_s": 1.5}

    def probe(self, argv: list[str], stdin: str) -> tuple[int, str, str]:
        token, _, document = stdin.partition("\n")
        assert token == DEVCPU_TOKEN or token.startswith("h4op_dev_"), (
            "the token's line comes first"
        )
        ops = json.loads(document)["ops"]
        step = argv[argv.index("/app/breach_probe.py") + 1]
        lines, results, failed = [], {}, None
        for index, op in enumerate(ops):
            self.ops_seen.append(op)
            if failed is not None:
                result = {
                    "op": op["op"],
                    "id": op.get("id"),
                    "assert": op.get("assert"),
                    "ok": False,
                    "skipped": True,
                }
            else:
                op = probe.resolve(op, results)
                result = self.answer(op, results)
                if op.get("assert") in self.miss:
                    result.update(ok=False, observed="something else", waited_s=60)
                if op.get("id") in self.fail:
                    result.update(ok=False, failed=True, misses=["answered"])
                if not result["ok"] and op["op"] in probe.ACTIONS:
                    failed = op.get("id") or index
                    result["failed"] = True
            if op.get("id"):
                results[op["id"]] = result
            lines.append(
                json.dumps(
                    {probe.MARK: 1, "step": step, "index": index, "result": result}
                )
            )
        code = 1 if failed is not None else 0
        lines.append(
            json.dumps({probe.MARK: 1, "step": step, "done": True, "exit": code})
        )
        return (
            code,
            "\n".join(["[+] Building 0.4s (8/8) FINISHED", *lines]) + "\n",
            "Container h4reet-dev-cpu-breach-probe-run-1 Created\n",
        )


def no_worktree(args: list[str]) -> tuple[int, str]:
    return 0, "/repo/.git\n"


def sandbox_env(**extra: str) -> dict[str, str]:
    return {
        "PATH": "/usr/bin:/bin",
        "HOME": "/home/agent",
        "SANDBOX_RUNTIME": "1",
        "TMPDIR": "/tmp/agent",
        **extra,
    }


def run(
    argv: list[str],
    stack: FakeStack,
    environ: dict[str, str] | None = None,
    *,
    runner: Any = None,
    git: Any = no_worktree,
    home: Path | None = None,
) -> tuple[int, str]:
    out = io.StringIO()
    code = breach.main(
        argv,
        runner=runner or stack,
        environ=environ if environ is not None else sandbox_env(),
        out=out,
        git=git,
        home=home,
    )
    return code, out.getvalue()


def rows(text: str) -> dict[str, tuple[str, str, str]]:
    """The summary table: assertion ID to (source, result, the rest)."""
    found = {}
    for line in text.splitlines():
        match = re.match(
            r"^(\d+[a-z])\s+(\d+)\s+(\S+)\s+([TML])\s+(PASS|MISS)\s+(.*)$", line
        )
        if match:
            found[match.group(1)] = (match.group(4), match.group(5), match.group(6))
    return found


def probe_calls(stack: FakeStack) -> list[list[str]]:
    return [c for c in stack.commands if "breach-probe" in c]


# --- the catalog ---------------------------------------------------------------------------------------------------


def test_every_assertion_is_tagged_with_its_source() -> None:
    assert breach.CATALOG
    ids = [a.id for a in breach.CATALOG]
    assert len(ids) == len(set(ids))
    assert {a.source for a in breach.CATALOG} == {"T", "M", "L"}
    # Every step of plan §8 but the last, which is the table itself, has at least one.
    assert {a.step for a in breach.CATALOG} == set(range(1, 12))
    for scenario in (
        "US2-1",
        "US2-2",
        "US2-3",
        "US2-4",
        "US2-5",
        "US2-6",
        "US2-7",
        "US5-6",
        "US5-7",
    ):
        assert scenario in {a.scenario for a in breach.CATALOG}, scenario


def test_a_full_run_feeds_every_assertion_from_an_operation_of_its_source() -> None:
    stack = FakeStack()
    code, text = run(["--stack", "dev-cpu"], stack)
    assert code == 0, text
    kinds = {
        "T": {"trace"},
        "M": {"metric"},
        "L": {"log", "telegram", "mailpit", "audit", "incident"},
    }
    fed: dict[str, set[str]] = {}
    for op in stack.ops_seen:
        if op.get("assert"):
            fed.setdefault(op["assert"], set()).add(op["op"])
    by_id = {a.id: a for a in breach.CATALOG}
    assert set(fed) == set(
        by_id
    )  # no assertion without an operation, and no operation for an unknown one
    for aid, ops in fed.items():
        assert ops <= kinds[by_id[aid].source], (aid, ops)
    # Only checks are assertions: an action's result is a step's precondition, never a row.
    assert not [
        op for op in stack.ops_seen if op.get("assert") and op["op"] in probe.ACTIONS
    ]


# --- a healthy run --------------------------------------------------------------------------------------------------


def test_a_healthy_run_passes_every_assertion_and_prints_the_table() -> None:
    stack = FakeStack()
    code, text = run(["--stack", "dev-cpu"], stack)
    assert code == 0, text
    table = rows(text)
    assert set(table) == {a.id for a in breach.CATALOG}
    assert {result for _, result, _ in table.values()} == {"PASS"}
    assert re.search(
        r"^summary: \d+ assertions: \d+ passed, 0 missed", text, re.MULTILINE
    )
    assert DEVCPU_TOKEN not in text


def test_the_steps_run_their_lifecycle_in_plan_8s_order() -> None:
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    lifecycle = [
        c[c.index("--env-file") + 2 :]
        for c in stack.commands
        if "compose" in c and "breach-probe" not in c
    ]
    volume = [c for c in stack.commands if "volume" in c]
    assert lifecycle == [
        # step 1: a clean start on a wiped store, which the running gateway sees as uninitialized: no restart
        # (data-model.md §6.1, "the store's volume is lost")
        ["stop", "gateway-state"],
        ["rm", "--force", "--stop", "gateway-state"],
        [
            "up",
            "--detach",
            "--no-deps",
            "--wait",
            "--wait-timeout",
            "120",
            "gateway-state",
        ],
        # step 4: the local model down, for the fallback steps
        ["stop", "model-server-cpu"],
        # step 5 and step 6: restarts keep today's fallback spend and the renewal flag
        ["restart", "gateway"],
        ["restart", "gateway"],
        # step 7: the local model back
        ["start", "model-server-cpu"],
        # step 11: the store stopped, then wiped
        ["stop", "gateway-state"],
        ["rm", "--force", "--stop", "gateway-state"],
        [
            "up",
            "--detach",
            "--no-deps",
            "--wait",
            "--wait-timeout",
            "120",
            "gateway-state",
        ],
    ]
    assert volume == [
        [
            str(breach.RELAY),
            "docker",
            "volume",
            "rm",
            "h4reet-dev-cpu_gateway-state-data",
        ],
        [
            str(breach.RELAY),
            "docker",
            "volume",
            "rm",
            "h4reet-dev-cpu_gateway-state-data",
        ],
    ]


def test_the_clock_moves_as_plan_8_lays_it_out() -> None:
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    clock = [
        op["body"]
        for op in stack.ops_seen
        if op.get("op") == "admin" and op.get("path") == "/admin/test/clock"
    ]
    # From 2026-10-09: the 20th of the next month at 08:00, a day at a time to the 25th, then the next month.
    assert clock[0]["set"] == "2026-11-20T08:00:00Z"
    assert [c.get("advance_s") for c in clock[1:-1]] == [86400] * 5
    assert clock[-1]["set"] == "2026-12-01T08:00:00Z"
    for body in clock:
        assert 10 <= len(body["reason"]) <= 500


def test_the_spend_reaches_each_threshold_as_plan_8_figures_it() -> None:
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    spends = [
        (op["attribution"], op["count"])
        for op in stack.ops_seen
        if op.get("op") == "spend"
    ]
    assert spends == [
        ("metered", 1),  # step 2: 0.10
        ("metered", 34),  # step 3: 3.50 today, the warning
        ("fallback", 14),  # step 4: fallback 1.40, grant 1's warning
        ("fallback", 1),  # 1.50
        ("fallback", 6),  # step 5: five pass to 2.00, the sixth is refused
        ("fallback", 1),  # step 6: fallback passes again after the renewal
        ("fallback", 19),  # 4.00: grant 2's warning at 3.40, exhausted at 4.00
        ("metered", 50),  # step 7: 5.00 today, the trip
        ("metered", 1),  # step 9: refused, meter_at_ceiling
        ("metered", 15),  # step 10: the month at 14.00
        ("metered", 34),  # 4.90 today, 17.40 this month
        ("metered", 26),  # the next day: the month at 20.00, the trip
        ("metered", 1),  # the next month, after the reset
    ]


def figures(op: dict[str, Any]) -> str | None:
    """An operation's figures, in one line: what each row and action asserts, for the table below."""
    name, kind = op.get("assert") or op.get("id"), op["op"]
    if kind == "metric":
        expect = op["expect"]
        if "value" in expect:
            wanted = f"= {expect['value']}"
        elif "labels" in expect:
            wanted = f"labels {next(iter(expect['labels'].values()))}"
        else:
            wanted = f">= {expect['at_least']}"
        return f"{name} {op['query']} {wanted}"
    if kind in ("spend", "admin", "audit"):
        what = {
            "spend": f"{op.get('attribution')} x{op.get('count')}",
            "admin": f"{op.get('method')} {op.get('path')}",
            "audit": f"audit {op.get('action')}",
        }[kind]
        expect = op.get("expect") or {}
        return f"{name} {what} {dict(sorted(expect.items()))}"
    if kind == "trace":
        return f"{name} trace {dict(sorted(op['expect'].items()))}"
    if kind == "log" and ("grant_no" in op["query"] or "allowance" in op["query"]):
        return f"{name} log {op['query'].split(' | ', 1)[1]}"
    return None


def test_every_figure_is_plan_8s() -> None:
    # The fake meets whatever an operation expects, so the figures themselves are held here, from plan §8's text and
    # arithmetic: $0.10 a call, fallback spend counted in the day and the month (round 1's review).
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    seen = [line for line in map(figures, stack.ops_seen) if line]
    assert seen == PLAN_8_FIGURES


KILL_Q = "max by (deployment_environment_name, h4_state) (h4_kill_switch_state) == 1"
CAUSE_Q = "max by (h4_cause) (h4_degraded_cause) == 1"
DAY_Q, MONTH_Q = (
    f'max(h4_meter_spend_usd{{h4_meter="{m}"}})' for m in ("day", "month")
)
FALLBACK_Q = 'max(h4_meter_spend_usd{h4_meter="fallback_day"})'
SPENT = "meters.{}.spent_micro_usd"


def spent(**usd: float) -> str:
    """The store's figures a spend's reply must show, in micro-USD, in the order figures() prints them."""
    return ", ".join(
        f"'{SPENT.format(m)}': {round(v * 1_000_000)}" for m, v in sorted(usd.items())
    )


PLAN_8_FIGURES = [
    # 1: a clean start, on the 20th
    "s1.init POST /admin/init {'body.state': 'normal', 'status': 200}",
    "s1.clock POST /admin/test/clock {'status': 200}",
    f"1a {KILL_Q} labels ['normal']",
    f"1b {DAY_Q} = 0.0",
    f"1b {MONTH_Q} = 0.0",
    # 2 (US2-1): one metered call, $0.10
    f"s2.spend metered x1 {{'answered': 1, {spent(day=0.1, month=0.1)}, 'stopped': None}}",
    "2a trace {'h4.cost.usd': 0.1}",
    f"2b {DAY_Q} = 0.1",
    f"2b {MONTH_Q} = 0.1",
    # 3 (US2-2): metered calls to $3.50 today, its warning
    f"s3.spend metered x34 {{'answered': 34, {spent(day=3.5, month=3.5)}, 'stopped': None}}",
    f"3c {DAY_Q} = 3.5",
    f'3c {DAY_Q} >= max(h4_meter_warn_usd{{h4_meter="day"}})',
    # 4: the 21st; the day starts at zero and the month carries $3.50; fallback to $1.40, grant 1's warning, then $1.50
    "s4.clock POST /admin/test/clock {'status': 200}",
    f"4a {DAY_Q} = 0.0",
    f"4a {MONTH_Q} = 3.5",
    f"s4.spend fallback x14 {{'answered': 14, {spent(day=1.4, fallback_day=1.4, month=4.9)}, 'stopped': None}}",
    f"4d {FALLBACK_Q} = 1.4",
    '4d max(h4_meter_warn_usd{h4_meter="fallback_day"}) = 1.4',
    f"s4.more fallback x1 {{'answered': 1, {spent(day=1.5, fallback_day=1.5, month=5.0)}, 'stopped': None}}",
    f"4e {FALLBACK_Q} = 1.5",
    # 5 (US5-7): still $1.50 after a restart; five more calls reach $2.00 and the flag, the sixth is refused
    f"5a {FALLBACK_Q} = 1.5",
    (
        f"s5.spend fallback x6 {{'answered': 5, {spent(day=2.0, fallback_day=2.0, month=5.5)}, "
        "'stopped.cause': 'fallback_awaiting_renewal', 'stopped.status': 503}"
    ),
    '5b log event="fallback.exhausted" | grant_no="1" | allowance_micro="2000000"',
    "5e max(h4_fallback_awaiting_renewal) = 1.0",
    f"5e {CAUSE_Q} labels ['fallback_awaiting_renewal']",
    # 6 (US5-6): a same-day renewal to $4.00, spent to $4.00; the 22nd's renewal grants $2.00, not $4.00
    (
        "s6.renew POST /admin/renew {'body.fallback.allowance_micro_usd': 4000000, 'body.fallback.grant': 2, "
        "'status': 200}"
    ),
    "6a audit renew {'after.fallback_day.allowance_micro': 4000000, 'after.fallback_day.grant_no': 2}",
    f"s6.again fallback x1 {{'answered': 1, {spent(day=2.1, fallback_day=2.1, month=5.6)}, 'stopped': None}}",
    "6b max(h4_fallback_allowance_usd) = 4.0",
    "6b max(h4_fallback_awaiting_renewal) = 0.0",
    f"s6.spend fallback x19 {{'answered': 19, {spent(day=4.0, fallback_day=4.0, month=7.5)}, 'stopped': None}}",
    '6d log event="fallback.exhausted" | grant_no="2" | allowance_micro="4000000"',
    f"6e {DAY_Q} = 4.0",
    "6e max(h4_fallback_awaiting_renewal) = 1.0",
    "s6.clock POST /admin/test/clock {'status': 200}",
    f"6f {CAUSE_Q} labels ['fallback_awaiting_renewal']",
    "s6.renew2 POST /admin/renew {'body.fallback.allowance_micro_usd': 2000000, 'status': 200}",
    "6h max(h4_fallback_allowance_usd) = 2.0",
    "6h max(h4_fallback_awaiting_renewal) = 0.0",
    # 7 (US2-3): metered calls to $5.00 on the 22nd: the trip, with the month at $12.50
    f"s7.spend metered x50 {{'answered': 50, {spent(day=5.0, month=12.5)}, 'stopped': None}}",
    f"7a {KILL_Q} labels ['degraded']",
    f"7e {CAUSE_Q} labels ['kill_switch_tripped']",
    '7e max(h4_adapter_healthy{h4_adapter="local"}) = 1.0',
    # 9 (US2-4): the reset; local answers, metered calls are still refused at the ceiling
    "s9.reset POST /admin/reset {'body.state': 'normal', 'status': 200}",
    "9a audit reset {}",
    f"9b {KILL_Q} labels ['normal']",
    "9c trace {'gen_ai.provider.name': 'local', 'h4.cost.usd': 0}",
    f"s9.refused metered x1 {{'answered': 0, {spent(day=5.0, month=12.5)}, 'stopped.cause': 'meter_at_ceiling'}}",
    f"9e {DAY_Q} = 5.0",
    f'9e {DAY_Q} >= max(h4_meter_ceiling_usd{{h4_meter="day"}})',
    # 10 (US2-5): the 23rd, $1.50 to $14.00 and its warning, $3.40 more; the 24th, $2.60 to $20.00 and the trip
    "s10.clock1 POST /admin/test/clock {'status': 200}",
    f"s10.spend1 metered x15 {{'answered': 15, {spent(day=1.5, month=14.0)}, 'stopped': None}}",
    f"10c {MONTH_Q} = 14.0",
    f'10c {MONTH_Q} >= max(h4_meter_warn_usd{{h4_meter="month"}})',
    f"s10.spend2 metered x34 {{'answered': 34, {spent(day=4.9, month=17.4)}, 'stopped': None}}",
    "s10.clock2 POST /admin/test/clock {'status': 200}",
    f"s10.spend3 metered x26 {{'answered': 26, {spent(day=2.6, month=20.0)}, 'stopped': None}}",
    f"10d {MONTH_Q} = 20.0",
    f"10d {KILL_Q} labels ['degraded']",
    "s10.clock3 POST /admin/test/clock {'status': 200}",
    f"10f {DAY_Q} = 0.0",
    f"10f {KILL_Q} labels ['degraded']",
    "s10.clock4 POST /admin/test/clock {'status': 200}",
    f"10g {MONTH_Q} = 0.0",
    f"10g {KILL_Q} labels ['degraded']",
    "s10.reset POST /admin/reset {'body.meters_at_ceiling': [], 'body.state': 'normal', 'status': 200}",
    f"s10.spend4 metered x1 {{'answered': 1, {spent(day=0.1, month=0.1)}, 'stopped': None}}",
    f"10h {KILL_Q} labels ['normal']",
    f"10h {DAY_Q} = 0.1",
    f"10h {MONTH_Q} = 0.1",
    # 11 (US2-7): the store stopped, then wiped and rebuilt from the journal: $0.10, the clock, renewal pending.
    # 7000 is the clock offset s10.clock4 answered (the fake adds 1000 a move); init must restore the same.
    f"11a {CAUSE_Q} labels ['store_unreachable']",
    f"11c {CAUSE_Q} labels ['store_uninitialized']",
    (
        "s11.init POST /admin/init {'body.clock_offset_ms': 7000, 'body.fallback_awaiting_renewal': True, "
        "'body.meters.day.sources.journal': 100000, 'body.meters.day.spent_micro_usd': 100000, "
        "'body.meters.month.sources.journal': 100000, 'body.meters.month.spent_micro_usd': 100000, 'status': 200}"
    ),
    (
        "11d audit init {'detail.chosen.day': 100000, 'detail.chosen.month': 100000, 'detail.clock_offset_ms': 7000, "
        "'detail.renewed': False}"
    ),
    f"11e {DAY_Q} = 0.1",
    f"11e {MONTH_Q} = 0.1",
    "11e max(h4_fallback_awaiting_renewal) = 1.0",
]


def test_every_probe_call_rebuilds_the_probe_and_runs_it_isolated_in_the_stacks_network() -> (
    None
):
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    calls = probe_calls(stack)
    assert calls
    for call in calls:
        assert call[:2] == [
            str(breach.RELAY),
            "docker",
        ]  # inside the sandbox, the agents' engine only
        tail = call[call.index("--profile") :]
        assert tail[:9] == [
            "--profile",
            "breach",
            "run",
            "--build",
            "--rm",
            "-T",
            "breach-probe",
            "python3",
            "-I",
        ]
        assert tail[9] == "/app/breach_probe.py" and tail[-2:] == ["--stack", "dev-cpu"]
    for env in stack.envs:
        assert set(env) <= set(breach.HOP_ENV) | {"LC_ALL"}, env


def test_the_docker_client_keeps_none_of_the_shells_stack_variables() -> None:
    stack = FakeStack()
    run(
        ["--stack", "dev-cpu"],
        stack,
        environ=sandbox_env(
            H4_STACK="prod", COMPOSE_PROFILES="gpu", LANGFUSE_SECRET_KEY="x"
        ),
    )
    for env in stack.envs:
        assert not {"H4_STACK", "COMPOSE_PROFILES", "LANGFUSE_SECRET_KEY"} & set(env)


# --- what each check is timed from (round 1's review) --------------------------------------------------------------


def test_every_check_names_the_action_its_window_is_timed_from() -> None:
    # A check's deadline runs from its action, never from when the check gets its turn behind slower ones: each names
    # an earlier operation of its call, or, for an action in an earlier call or a lifecycle command, its start and end.
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    checks = [op for op in stack.ops_seen if op["op"] in probe.CHECKS]
    assert checks
    unnamed = [
        op.get("assert") or op.get("id")
        for op in checks
        if not ("after" in op or ("after_s" in op and "after_end_s" in op))
    ]
    assert unnamed == []


@pytest.mark.parametrize(
    ("aid", "action"),
    [
        ("2a", "s2.spend"),
        ("2b", "s2.spend"),  # US2-1's 60 s, from the call: not from when 2a ends
        ("3c", "s3.spend"),
        ("4d", "s4.spend"),
        ("5a", "s5.ready"),
        ("5e", "s5.spend"),
        ("6b", "s6.renew"),
        ("6f", "s6.ready"),
        ("7a", "s7.spend"),  # within 60 s of the crossing call
        ("7e", "s7.spend"),
        ("9b", "s9.reset"),
        ("9e", "s9.refused"),
        ("10c", "s10.spend1"),
        ("10d", "s10.spend3"),
        ("11e", "s11.init"),
    ],
)
def test_each_metric_row_is_timed_from_the_action_it_measures(
    aid: str, action: str
) -> None:
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    ops = [
        op
        for op in stack.ops_seen
        if op.get("assert") == aid and op["op"] in probe.CHECKS
    ]
    assert ops and {op["after"] for op in ops} == {action}


def test_the_restart_rows_count_only_samples_from_the_new_process() -> None:
    # The old gateway's shutdown flush is stamped after `compose restart` begins, on the same series: 5a and 6f count
    # only samples from after the new process answers /health (round 1's review).
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    fresh = {
        op["assert"]: op["fresh"]
        for op in stack.ops_seen
        if op.get("assert") in ("5a", "6f")
    }
    assert fresh["5a"] == {
        "selector": breach.meter_selector("fallback_day"),
        "after": "s5.ready",
    }
    assert fresh["6f"] == {"selector": "h4_degraded_cause", "after": "s6.ready"}


def test_the_wiped_stores_rows_are_timed_from_the_store_coming_back() -> None:
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    (row,) = [op for op in stack.ops_seen if op.get("assert") == "11c"]
    assert row["after_s"] <= row["after_end_s"] <= row["fresh"]["after_s"] + 1e-6
    assert "after" not in row


# --- misses, aborts, and the cleanup --------------------------------------------------------------------------------


def test_a_missed_check_is_a_miss_in_the_table_and_the_run_goes_on() -> None:
    stack = FakeStack(miss={"3b"})
    code, text = run(["--stack", "dev-cpu"], stack)
    assert code == 1
    table = rows(text)
    assert table["3b"][1] == "MISS"
    assert [aid for aid, (_, result, _) in table.items() if result != "PASS"] == ["3b"]
    assert re.search(
        r"^summary: \d+ assertions: \d+ passed, 1 missed", text, re.MULTILINE
    )


def test_a_failed_action_stops_the_run_and_every_later_assertion_is_a_miss() -> None:
    # Step 5's spend answers six calls where five should pass and the sixth be refused.
    stack = FakeStack(fail={"s5.spend"})
    code, text = run(["--stack", "dev-cpu"], stack)
    assert code == 1
    table = rows(text)
    later = [a.id for a in breach.CATALOG if a.step > 5]
    assert all(table[aid][1] == "MISS" and "not run" in table[aid][2] for aid in later)
    assert "step 5 stopped" in text
    # The cleanup starts the model server step 4 stopped, and nothing else runs.
    assert stack.commands[-1][-2:] == ["start", "model-server-cpu"]
    assert not [op for op in stack.ops_seen if op.get("id", "").startswith("s6")]


@pytest.mark.parametrize("on_done_line", [True, False])
def test_a_refused_probe_call_says_why_cleaned(on_done_line: bool) -> None:
    # The probe's reason, from its done line, or else its own last line on standard error, cleaned: never "see its
    # last line above" for a line nothing printed (round 1's review).
    stack = FakeStack()
    reason = "no such operation: shell\x1b[31m\x7f\x9b"  # ESC, DEL, and CSI

    def refusing(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        if (
            "breach-probe" in argv
            and argv[argv.index("/app/breach_probe.py") + 1] == "2"
        ):
            stack.commands.append(argv)
            done: dict[str, Any] = {probe.MARK: 1, "step": "2", "done": True, "exit": 2}
            if on_done_line:
                done["error"] = reason
            err = f"[+] Building 0.4s (8/8) FINISHED\nbreach_probe.py: {reason}\nexited 2\n"
            return 2, json.dumps(done) + "\n", err
        return stack(argv, stdin, env, timeout)

    code, text = run(["--stack", "dev-cpu"], stack, runner=refusing)
    assert code == 1
    assert (
        "step 2: the probe refused its operations: no such operation: shell?[31m??"
        in text
    )
    assert "see its last line above" not in text
    assert not {"\x1b", "\x7f", "\x9b"} & set(text)


def test_what_docker_says_reaches_the_terminal_cleaned() -> None:
    # A lifecycle command's error lines come from docker, and through it from the engine: every line the run prints
    # has its control characters replaced, C0, DEL, and C1 alike (round 2's review).
    stack = FakeStack()

    def failing(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        if argv[-2:] == ["stop", "gateway-state"]:
            stack.commands.append(argv)
            return 1, "", "Error: \x1b[2J\x9b2Jgone\x7f\n"
        return stack(argv, stdin, env, timeout)

    code, text = run(["--stack", "dev-cpu"], stack, runner=failing)
    assert code == 1 and "Error: ?[2J?2Jgone?" in text
    assert not {"\x1b", "\x7f", "\x9b"} & set(text)


class Gone(io.StringIO):
    """A terminal closed under the run (SIGHUP): every write fails, as on a hung-up tty."""

    def write(self, text: str) -> int:
        raise OSError(5, "Input/output error")


@pytest.mark.parametrize("terminal", ["hung up", "closed"])
def test_a_terminal_gone_mid_run_takes_the_output_never_the_cleanup(
    terminal: str,
) -> None:
    # Output fails with EIO, or on a closed file, from the first line on. The run still goes to its end, its cleanup
    # starts what it stopped, and its exit code is the run's (round 2's review).
    out: io.StringIO = Gone()
    if terminal == "closed":
        out = io.StringIO()
        out.close()
    stack = FakeStack(fail={"s5.spend"})
    code = breach.main(
        ["--stack", "dev-cpu"],
        runner=stack,
        environ=sandbox_env(),
        out=out,
        git=no_worktree,
    )
    assert code == 1
    assert stack.commands[-1][-2:] == ["start", "model-server-cpu"]


def test_a_volume_already_gone_is_wiped_enough() -> None:
    # A run stopped between removing the store's volume and bringing the store back leaves no volume: the next run's
    # wipe goes on rather than failing on it. Any other failure to remove it still stops the run.
    def gone(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        if "volume" in argv:
            stack.commands.append(argv)
            return (
                1,
                "",
                "Error response from daemon: get h4reet-dev-cpu_gateway-state-data: no such volume\n",
            )
        return stack(argv, stdin, env, timeout)

    stack = FakeStack()
    code, _ = run(["--stack", "dev-cpu"], stack, runner=gone)
    assert code == 0

    def busy(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        if "volume" in argv:
            return (
                1,
                "",
                "Error response from daemon: remove h4reet-dev-cpu_gateway-state-data: volume is in use\n",
            )
        return stack(argv, stdin, env, timeout)

    stack = FakeStack()
    code, text = run(["--stack", "dev-cpu"], stack, runner=busy)
    assert code == 1 and "volume is in use" in text


def test_an_unreachable_stack_fails_at_the_first_step_naming_the_stack_and_touches_nothing() -> (
    None
):
    # plan §19: it fails at its first step, naming the stack and the port, before asserting anything.
    stack = FakeStack(guard="unreachable")
    code, text = run(["--stack", "dev-cpu"], stack)
    assert code == 1
    assert "h4reet-dev-cpu" in text and "gateway:8080" in text
    assert len(stack.commands) == 1  # the guard's probe call and nothing destructive
    assert all(result == "MISS" for _, result, _ in rows(text).values())


def test_a_stack_without_the_test_machinery_is_refused_before_anything_changes() -> (
    None
):
    stack = FakeStack(guard="prod-like")
    code, text = run(["--stack", "dev-cpu"], stack)
    assert code == 1 and "test machinery" in text
    assert len(stack.commands) == 1


def test_a_gateway_that_never_sees_the_wiped_store_fails_step_11_and_nothing_restarts_it() -> (
    None
):
    # data-model.md §6.1: a store whose volume is lost is store_uninitialized, to the gateway that is running. One
    # that stays store_unreachable misses 11c, never reports the empty store, and so never gets its init: the run
    # fails there, as the contract is written, and no restart papers over it.
    stack = FakeStack(miss={"11c"}, fail={"s11.empty"})
    code, text = run(["--stack", "dev-cpu"], stack)
    assert code == 1
    table = rows(text)
    assert table["11c"][1] == "MISS"
    assert table["11d"][1] == "MISS" and table["11e"][1] == "MISS"
    assert "step 11 stopped: s11.empty" in text
    restarts = [c for c in stack.commands if c[-2:] == ["restart", "gateway"]]
    assert len(restarts) == 2  # steps 5 and 6's, and no others


def test_step_11_asserts_the_wiped_store_in_the_call_that_rebuilds_it() -> None:
    # The wiped store's check, its uninitialized /health, and the init that rebuilds it go in one probe call, after
    # the store is back, with nothing between them but the probe.
    stack = FakeStack()
    run(["--stack", "dev-cpu"], stack)
    last = json.loads(stack.stdins[-1].split("\n", 1)[1])["ops"]
    assert [op.get("id") or op.get("assert") for op in last][:3] == [
        "11c",
        "s11.empty",
        "s11.init",
    ]
    # Step 1's wipe sends the same command, so find step 11's by its place: the last one.
    back = max(i for i, c in enumerate(stack.commands) if c[-1] == "gateway-state")
    assert stack.commands[back + 1 :] == [stack.commands[-1]]


# --- the delivery overlay (contracts/env-files.md §7.2) -----------------------------------------------------------


@pytest.fixture
def dev_files(tmp_path: Path) -> tuple[Path, Path, Path]:
    home = tmp_path / "home"
    env_dir = home / ".config" / "h4reet-ai" / "env"
    token_dir = home / ".config" / "h4reet-ai" / "operator"
    for directory in (
        home,
        home / ".config",
        home / ".config" / "h4reet-ai",
        env_dir,
        token_dir,
    ):
        directory.mkdir(mode=0o700, exist_ok=True)
        directory.chmod(0o700)
    env_file = env_dir / "dev.env"
    values = {key: "a-value" for key in breach.REAL_KEYS}
    env_file.write_text(
        "".join(f"{k}={v}\n" for k, v in values.items()) + "ALERT_DELIVERY=standin\n"
    )
    env_file.chmod(0o600)
    token = token_dir / "dev.token"
    token.write_text("h4op_dev_" + "B" * 43 + "\n")
    token.chmod(0o600)
    # make up's run file names the export make runs breach.py from: here, the tree these tests load it from.
    run_file = tmp_path / "state" / "run.env"
    run_file.parent.mkdir()
    run_file.write_text(f"H4_TREE={breach.ROOT}\nH4_REF=" + "a" * 40 + "\n")
    return home, env_file, run_file


def author(**extra: str) -> dict[str, str]:
    return {"PATH": "/usr/bin:/bin", "HOME": "/home/me", **extra}


def test_real_delivery_recreates_dev_s_gateway_with_the_overlay_and_puts_it_back(
    dev_files: tuple[Path, Path, Path], tmp_path: Path
) -> None:
    home, env_file, run_file = dev_files
    stack = FakeStack()
    overlays: list[tuple[str, str, int, int]] = []
    scratch = tmp_path / "tmp"  # the session's TMPDIR, outside the tree
    scratch.mkdir()

    def watching(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        files = [argv[i + 1] for i, a in enumerate(argv) if a == "--env-file"]
        if len(files) == 3:
            path = Path(files[2])
            overlays.append(
                (
                    path.name,
                    path.read_text(),
                    stat.S_IMODE(path.stat().st_mode),
                    stat.S_IMODE(path.parent.stat().st_mode),
                )
            )
        return stack(argv, stdin, env, timeout)

    code, text = run(
        [
            "--stack",
            "dev",
            "--env-file",
            str(env_file),
            "--run-file",
            str(run_file),
            "--delivery",
            "real",
        ],
        stack,
        environ=author(TMPDIR=str(scratch)),
        runner=watching,
        home=home,
    )
    assert code == 0, text
    # Exactly one line, in a 0700 directory outside the tree, as a third env file after dev's and the run file.
    assert overlays and overlays[0] == (
        "delivery-real.vars",
        "ALERT_DELIVERY=real\n",
        0o600,
        0o700,
    )
    up = [c for c in stack.commands if "up" in c and c[-1] == "gateway"]
    first, last = up[0], up[-1]
    assert first.count("--env-file") == 3 and last.count("--env-file") == 2
    assert first[first.index("up") :] == [
        "up",
        "--detach",
        "--no-deps",
        "--wait",
        "--wait-timeout",
        "120",
        "gateway",
    ]
    # The overlay is gone at the end, success or not.
    overlay = Path(first[[i for i, a in enumerate(first) if a == "--env-file"][2] + 1])
    assert not overlay.exists() and not overlay.parent.exists()
    # Real delivery asserts the providers' references, and that neither stand-in holds the alert: the stand-in's
    # numeric message_id and Mailpit's 250 have the same shapes, so a gateway still on the stand-ins would pass on
    # the references alone (round 1's review).
    for aid in ("3b", "4c", "5d", "7d", "10b"):
        ops = [op for op in stack.ops_seen if op.get("assert") == aid]
        refs = [op for op in ops if op["op"] == "log"]
        assert refs and refs[0]["expect"]["each_regex"]["provider_ref"]["email"]
        receivers = sorted(op["op"] for op in ops if op["op"] != "log")
        assert receivers == ["mailpit", "telegram"], aid
        assert all(op.get("absent") is True for op in ops if op["op"] != "log"), aid
    standing = [
        op
        for op in stack.ops_seen
        if op["op"] in ("telegram", "mailpit") and not op.get("absent")
    ]
    assert standing == []


def test_real_delivery_refuses_an_overlay_inside_the_tree_and_makes_nothing_there(
    dev_files: tuple[Path, Path, Path],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # contracts/env-files.md §7.2: the overlay's directory is outside the working tree. A TMPDIR inside it, or a link
    # into it, is refused before anything is made: no directory there, and the gateway never sees a third env file.
    home, env_file, run_file = dev_files
    tree, made = tmp_path / "tree", []
    inside = tree / "tmp"
    inside.mkdir(parents=True)
    monkeypatch.setattr(breach, "ROOT", tree)
    run_file.write_text(f"H4_TREE={tree}\nH4_REF=" + "a" * 40 + "\n")
    link = tmp_path / "tmp-link"
    link.symlink_to(inside, target_is_directory=True)
    mkdtemp = breach.tempfile.mkdtemp
    monkeypatch.setattr(
        breach.tempfile, "mkdtemp", lambda **kw: made.append(kw) or mkdtemp(**kw)
    )
    for tmpdir in (inside, link):
        stack = FakeStack()
        code, text = run(
            [
                "--stack",
                "dev",
                "--env-file",
                str(env_file),
                "--run-file",
                str(run_file),
                "--delivery",
                "real",
            ],
            stack,
            environ=author(TMPDIR=str(tmpdir)),
            home=home,
        )
        assert code == 1 and "inside the tree" in text, text
        assert made == [] and list(inside.iterdir()) == []
        assert not [c for c in stack.commands if c.count("--env-file") == 3]


@pytest.mark.parametrize(
    ("stop", "says"),
    [("SIGINT", "Ctrl-C"), ("SIGTERM", "SIGTERM"), ("SIGHUP", "SIGHUP")],
)
def test_an_interrupted_real_run_still_puts_dev_back_on_the_stand_ins(
    dev_files: tuple[Path, Path, Path], tmp_path: Path, stop: str, says: str
) -> None:
    # Ctrl-C, SIGTERM, and SIGHUP (a closed terminal) run the same cleanup as a run's end: the gateway back on dev's
    # files, the overlay deleted, and the table, saying why the run stopped (contracts/env-files.md §7.2; round 1's
    # review). Only a SIGKILL can't, and the disclosure row says what puts dev back then.
    home, env_file, run_file = dev_files
    stack = FakeStack()
    scratch = tmp_path / "tmp"
    scratch.mkdir()

    def interrupted(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        if (
            "breach-probe" in argv
            and argv[argv.index("/app/breach_probe.py") + 1] == "3"
        ):
            if stop == "SIGINT":
                raise KeyboardInterrupt
            breach.on_signal(getattr(signal, stop), None)
        return stack(argv, stdin, env, timeout)

    argv = ["--stack", "dev", "--env-file", str(env_file), "--run-file", str(run_file)]
    try:
        code, text = run(
            [*argv, "--delivery", "real"],
            stack,
            environ=author(TMPDIR=str(scratch)),
            runner=interrupted,
            home=home,
        )
    except KeyboardInterrupt:
        pytest.fail("the interrupt escaped the run, and its cleanup with it")
    assert code == 1
    assert f"interrupted ({says})" in text
    ups = [c for c in stack.commands if "up" in c and c[-1] == "gateway"]
    assert ups[0].count("--env-file") == 3 and ups[-1].count("--env-file") == 2
    assert list(scratch.iterdir()) == []  # the overlay's directory is gone
    table = rows(text)
    assert table["3a"][1] == "MISS" and "interrupted" in table["3a"][2]


def test_the_run_takes_sigterm_and_sighup_and_puts_their_handlers_back() -> None:
    for signum in (signal.SIGTERM, signal.SIGHUP):
        with pytest.raises(breach.Interrupted):
            breach.on_signal(signum, None)
    before = (signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGHUP))
    during: list[Any] = []
    stack = FakeStack()

    def watching(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        during.append(
            (signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGHUP))
        )
        return stack(argv, stdin, env, timeout)

    code, _ = run(["--stack", "dev-cpu"], stack, runner=watching)
    assert code == 0
    assert set(during) == {(breach.on_signal, breach.on_signal)}
    assert (signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGHUP)) == before


class Escaped(Exception):
    """A signal the run should have ignored, caught by the test's own handler rather than ending pytest."""


@pytest.mark.parametrize("signum", [signal.SIGINT, signal.SIGTERM, signal.SIGHUP])
def test_a_signal_during_the_cleanup_is_ignored_and_the_cleanup_finishes(
    dev_files: tuple[Path, Path, Path], tmp_path: Path, signum: int
) -> None:
    # The verifier's run: real delivery fails at s4.spend with the model server stopped, and a signal arrives while the
    # cleanup puts the gateway back. The cleanup ignores it, as do the docker commands it starts, and finishes: the
    # gateway on dev's files, the model server started, the overlay gone, and the table (round 2's review).
    home, env_file, run_file = dev_files
    stack = FakeStack(fail={"s4.spend"})
    scratch = tmp_path / "tmp"
    scratch.mkdir()
    sent: list[int] = []

    def signalling(
        argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ) -> tuple[int, str, str]:
        cleanup = (
            "up" in argv and argv[-1] == "gateway" and argv.count("--env-file") == 2
        )
        if cleanup and not sent:
            sent.append(signum)
            os.kill(os.getpid(), signum)
        return stack(argv, stdin, env, timeout)

    def escaped(number: int, frame: object) -> None:
        raise Escaped(signal.Signals(number).name)

    argv = ["--stack", "dev", "--env-file", str(env_file), "--run-file", str(run_file)]
    previous = {
        s: signal.signal(s, escaped)
        for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)
    }
    try:
        code, text = run(
            [*argv, "--delivery", "real"],
            stack,
            environ=author(TMPDIR=str(scratch)),
            runner=signalling,
            home=home,
        )
    except BaseException as escape:  # noqa: BLE001 — whatever left the run, the cleanup didn't finish
        pytest.fail(
            f"{type(escape).__name__} ({escape}) left the run before its cleanup finished"
        )
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)
    assert sent == [signum] and code == 1
    assert stack.commands[-1][-2:] == ["start", "model-server-gpu"]
    ups = [c for c in stack.commands if "up" in c and c[-1] == "gateway"]
    assert ups[-1].count("--env-file") == 2
    assert list(scratch.iterdir()) == []
    assert rows(text)["4b"][1] == "MISS"  # the table printed


def test_real_delivery_puts_the_gateway_back_when_the_run_fails(
    dev_files: tuple[Path, Path, Path], tmp_path: Path
) -> None:
    home, env_file, run_file = dev_files
    stack = FakeStack(fail={"s3.spend"})
    code, _ = run(
        [
            "--stack",
            "dev",
            "--env-file",
            str(env_file),
            "--run-file",
            str(run_file),
            "--delivery",
            "real",
        ],
        stack,
        environ=author(),
        home=home,
    )
    assert code == 1
    gateway_ups = [c for c in stack.commands if "up" in c and c[-1] == "gateway"]
    assert gateway_ups[-1].count("--env-file") == 2  # back on dev's file alone


def test_real_delivery_refuses_an_empty_channel_key_naming_it_never_a_value(
    dev_files: tuple[Path, Path, Path],
) -> None:
    home, env_file, run_file = dev_files
    env_file.write_text(
        env_file.read_text().replace("SMTP_PASSWORD=a-value", "SMTP_PASSWORD=")
    )
    stack = FakeStack()
    code, text = run(
        [
            "--stack",
            "dev",
            "--env-file",
            str(env_file),
            "--run-file",
            str(run_file),
            "--delivery",
            "real",
        ],
        stack,
        environ=author(),
        home=home,
    )
    assert code == 2 and "SMTP_PASSWORD" in text and "a-value" not in text
    assert stack.commands == []


@pytest.mark.parametrize(
    ("argv", "environ", "words"),
    [
        (["--stack", "dev-cpu", "--delivery", "real"], sandbox_env(), "dev"),
        (["--stack", "dev", "--delivery", "real"], sandbox_env(), "agent"),
        (["--stack", "dev"], sandbox_env(), "agent"),
        (["--stack", "dev-cpu"], author(), "agents' engine"),
        (
            ["--stack", "dev-cpu"],
            author(DOCKER_HOST="unix:///var/run/docker.sock"),
            "agents' engine",
        ),
    ],
)
def test_what_it_refuses_before_touching_anything(
    argv: list[str], environ: dict[str, str], words: str
) -> None:
    stack = FakeStack()
    code, text = run(argv, stack, environ=environ)
    assert code == 2 and words in text, text
    assert stack.commands == []


def test_prod_is_never_a_choice() -> None:
    stack = FakeStack()
    code, _ = run(["--stack", "prod"], stack)
    assert code == 2 and stack.commands == []


def test_dev_runs_on_the_host_s_engine_from_its_own_files(
    dev_files: tuple[Path, Path, Path],
) -> None:
    home, env_file, run_file = dev_files
    stack = FakeStack()
    code, _ = run(
        ["--stack", "dev", "--env-file", str(env_file), "--run-file", str(run_file)],
        stack,
        environ=author(),
        home=home,
    )
    assert code == 0
    first = stack.commands[0]
    assert first[:2] == ["docker", "compose"]
    assert first[first.index("-f") + 1] == str(breach.ROOT / "deploy" / "compose.yaml")
    files = [first[i + 1] for i, a in enumerate(first) if a == "--env-file"]
    assert files == [str(env_file), str(run_file)]
    assert stack.stdins[0].split("\n", 1)[0] == "h4op_dev_" + "B" * 43


@pytest.mark.parametrize("named", ["another", "", None])
def test_dev_runs_only_from_the_export_its_run_file_names(
    dev_files: tuple[Path, Path, Path], tmp_path: Path, named: str | None
) -> None:
    # dev's compose file and the probe's build context are this file's tree. From any tree but the export the stack
    # runs, the run would build that tree's probe on the host's engine and hand it dev's token (FR-039); with real
    # delivery it would recreate dev's gateway from that tree's compose file. make's path isn't enough: the script
    # checks that its own tree is the run file's H4_TREE.
    home, env_file, run_file = dev_files
    other = tmp_path / "state" / "tree" / ("b" * 40)
    other.mkdir(parents=True)
    tree = {"another": f"H4_TREE={other}\n", "": "H4_TREE=\n", None: ""}[named]
    run_file.write_text(tree + "H4_REF=" + "a" * 40 + "\n")
    for delivery in ([], ["--delivery", "real"]):
        stack = FakeStack()
        code, text = run(
            [
                "--stack",
                "dev",
                "--env-file",
                str(env_file),
                "--run-file",
                str(run_file),
                *delivery,
            ],
            stack,
            environ=author(),
            home=home,
        )
        assert code == 2 and "make breach-test ENV=dev" in text, text
        assert stack.commands == []


def test_a_link_to_the_export_is_the_export(
    dev_files: tuple[Path, Path, Path], tmp_path: Path
) -> None:
    home, env_file, run_file = dev_files
    link = tmp_path / "export-link"
    link.symlink_to(breach.ROOT, target_is_directory=True)
    run_file.write_text(f"H4_TREE={link}\nH4_REF=" + "a" * 40 + "\n")
    stack = FakeStack()
    code, text = run(
        ["--stack", "dev", "--env-file", str(env_file), "--run-file", str(run_file)],
        stack,
        environ=author(),
        home=home,
    )
    assert code == 0, text


@pytest.mark.parametrize("host", ["tcp://198.18.0.1:2376", "tcp://127.0.0.1:2376"])
def test_dev_refuses_a_shell_pointed_at_the_agents_engine(
    dev_files: tuple[Path, Path, Path], host: str
) -> None:
    home, env_file, run_file = dev_files
    stack = FakeStack()
    code, text = run(
        ["--stack", "dev", "--env-file", str(env_file), "--run-file", str(run_file)],
        stack,
        environ=author(DOCKER_HOST=host),
        home=home,
    )
    assert code == 2 and "host's engine" in text and stack.commands == []


def test_dev_needs_its_run_file_and_token(
    dev_files: tuple[Path, Path, Path], tmp_path: Path
) -> None:
    home, env_file, run_file = dev_files
    stack = FakeStack()
    code, text = run(
        [
            "--stack",
            "dev",
            "--env-file",
            str(env_file),
            "--run-file",
            str(tmp_path / "none.env"),
        ],
        stack,
        environ=author(),
        home=home,
    )
    assert code == 2 and "make up ENV=dev" in text
    (home / ".config" / "h4reet-ai" / "operator" / "dev.token").unlink()
    code, text = run(
        ["--stack", "dev", "--env-file", str(env_file), "--run-file", str(run_file)],
        stack,
        environ=author(),
        home=home,
    )
    assert code == 2 and "make operator-token ENV=dev" in text
    assert stack.commands == []


def test_dev_cpu_from_a_linked_worktree_is_refused() -> None:
    def linked(args: list[str]) -> tuple[int, str]:
        return 0, (
            "/repo/.git/worktrees/x\n" if "--git-dir" in args else "/repo/.git\n"
        )

    stack = FakeStack()
    code, text = run(["--stack", "dev-cpu"], stack, git=linked)
    assert code == 2 and "main working tree" in text and stack.commands == []


def test_dev_cpu_from_the_authors_terminal_runs_on_the_agents_engine() -> None:
    stack = FakeStack()
    code, _ = run(
        ["--stack", "dev-cpu"],
        stack,
        environ=author(DOCKER_HOST="tcp://198.18.0.1:2376", DOCKER_TLS_VERIFY="1"),
    )
    assert code == 0
    assert stack.commands[0][:2] == ["docker", "compose"]
    assert stack.envs[0]["DOCKER_HOST"] == "tcp://198.18.0.1:2376"


# --- make breach-test -----------------------------------------------------------------------------------------------


def make(*args: str, home: Path, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["make", "--no-print-directory", "-C", str(REPO), "breach-test", *args],
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(home),
            "LC_ALL": "C",
            **env,
        },
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


@needs_make
@pytest.mark.parametrize(
    ("stack", "says"),
    [
        ("prod", "runs on dev or dev-cpu, never prod"),
        (
            "dev-cpu prod",
            "ENV must be prod, dev, or dev-cpu",
        ),  # one word, refused before any recipe
    ],
)
def test_make_refuses_any_stack_but_dev_and_dev_cpu(
    stack: str, says: str, tmp_path: Path
) -> None:
    for sandbox in ({}, {"SANDBOX_RUNTIME": "1"}):
        done = make(f"ENV={stack}", home=tmp_path, **sandbox)
        assert done.returncode == 2 and says in done.stderr, done.stderr


@needs_make
def test_make_keeps_agent_sessions_off_dev_and_off_real_delivery(
    tmp_path: Path,
) -> None:
    done = make("ENV=dev", home=tmp_path, SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "dev-cpu only" in done.stderr
    done = make("ENV=dev-cpu", "DELIVERY=real", home=tmp_path, SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "dev's recorded run" in done.stderr


@needs_make
def test_make_says_so_before_the_agents_engine_exists(tmp_path: Path) -> None:
    done = make("ENV=dev-cpu", home=tmp_path, SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "isn't set up yet" in done.stderr


@needs_make
def test_make_keeps_an_agent_off_dev_inside_the_relay_too(tmp_path: Path) -> None:
    # The relay's re-run of make sees DOCKER_HOST at the relay's end and takes the recipe's other branch: an agent
    # there is still refused dev, by name, before the run file's own check.
    done = make(
        "ENV=dev",
        home=tmp_path,
        SANDBOX_RUNTIME="1",
        DOCKER_HOST="tcp://127.0.0.1:2376",
    )
    assert done.returncode == 2 and "agent sessions run dev-cpu only" in done.stderr, (
        done.stderr
    )


@needs_make
def test_make_needs_a_host_stack_started_by_make_up(tmp_path: Path) -> None:
    done = make("ENV=dev", home=tmp_path)
    assert done.returncode == 2 and "wasn't started by make up" in done.stderr


@needs_make
def test_a_command_line_delivery_reaches_the_recipe_as_typed(tmp_path: Path) -> None:
    marker = tmp_path / "ran"
    done = make(
        "ENV=dev-cpu",
        f"DELIVERY=real$(shell touch {marker})",
        home=tmp_path,
        SANDBOX_RUNTIME="1",
    )
    assert not marker.exists(), "make ran the value as make code"
    assert done.returncode == 2


# --- the docker commands' own session (round 3's review) -----------------------------------------------------------


def test_real_run_starts_each_command_in_its_own_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # docker and compose are Go programs, which turn SIGINT and SIGTERM back on after exec, so an ignored signal
    # can't keep a terminal's second Ctrl-C from ending the cleanup's commands. Their own session can.
    seen: list[dict[str, object]] = []

    def fake_run(argv: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        seen.append(kwargs)
        return subprocess.CompletedProcess(argv, 0, "out", "err")

    monkeypatch.setattr(breach.subprocess, "run", fake_run)
    assert breach.real_run(["docker", "version"], None, {}, 5) == (0, "out", "err")
    assert breach.real_run(["docker", "compose", "run"], "ops\n", {}, 5) == (
        0,
        "out",
        "err",
    )
    without_input, with_input = seen
    assert without_input["start_new_session"] is True
    assert with_input["start_new_session"] is True
    # Nothing reads the terminal: no input means /dev/null, never the terminal's stdin.
    assert (
        without_input["stdin"] is subprocess.DEVNULL and without_input["input"] is None
    )
    assert with_input["stdin"] is None and with_input["input"] == "ops\n"
