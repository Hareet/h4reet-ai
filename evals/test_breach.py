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
    # Real delivery asserts the providers' references, and reads no stand-in.
    assert not [op for op in stack.ops_seen if op.get("op") in ("telegram", "mailpit")]
    refs = [op for op in stack.ops_seen if op.get("assert") == "3b"]
    assert refs and refs[0]["expect"]["each_regex"]["provider_ref"]["email"]


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
