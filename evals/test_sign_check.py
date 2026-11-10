"""T042 (spec 014, FR-056 to FR-058; SC-010; contracts/sign-check.md §2 to §6): evals/sign_check.py with docker, the
probe, and the page's reading stubbed. Each refusal of §2 exits 2 and calls nothing that changes the stack; the steps run
in §3's order; each step's miss exits 1 naming its row; the model server is started again whatever the outcome, Ctrl-C
and SIGTERM included; and the output holds no reply's words.
"""

from __future__ import annotations

import importlib.util
import io
import json
import signal
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load():
    spec = importlib.util.spec_from_file_location(
        "h4_sign_check", ROOT / "evals" / "sign_check.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["h4_sign_check"] = module
    spec.loader.exec_module(module)
    return module


sign = load()

HEALTHY = {
    "status": "ok",
    "state": "normal",
    "awaiting_renewal": False,
    "local_healthy": True,
    "synthetic": True,
}
SECRET_WORDS = "the twin's own words, never printed"


class Stack:
    """A fake stack: the compose calls it sees, in order, and the probe's and the reading's answers."""

    def __init__(self, **over):
        self.calls: list[str] = []
        self.local = True
        self.health = dict(HEALTHY, **over.get("health", {}))
        self.paid = over.get(
            "paid", {"status": 200, "route": "fallback", "cost_micro_usd": 100_000}
        )
        self.free = over.get(
            "free", {"status": 200, "route": "local", "cost_micro_usd": 0}
        )
        self.stays_healthy = over.get("stays_healthy", False)
        self.interrupt = over.get("interrupt")

    def __call__(self, argv, stdin, env, timeout):
        if argv[0] == "node" or "sign-reading.ts" in " ".join(argv):
            facts = json.loads(stdin)
            self.calls.append(f"reading {facts.get('route')}")
            if facts.get("status") != 200 or facts.get("route") not in (
                "local",
                "fallback",
            ):
                return (
                    0,
                    json.dumps(
                        {"call": "cost unavailable", "visit": "cost unavailable"}
                    )
                    + "\n",
                    "",
                )
            if facts["route"] == "local":
                return (
                    0,
                    json.dumps({"call": "local · $0", "visit": "$0.00"}) + "\n",
                    "",
                )
            return (
                0,
                json.dumps({"call": "$0.10 est.", "visit": "$0.10 est."}) + "\n",
                "",
            )
        if "breach-probe" in argv:
            op = argv[-1]
            self.calls.append(f"probe {op}")
            if op == "health":
                body = dict(self.health, local_healthy=self.local)
                return 0, json.dumps({"sign_probe": 1, "health": body}) + "\n", ""
            if self.interrupt == "turn":
                raise KeyboardInterrupt
            if self.interrupt == "sigterm":
                raise sign.breach.Interrupted("SIGTERM")
            reply = dict(self.free if self.local else self.paid, text=SECRET_WORDS)
            return 0, json.dumps({"sign_probe": 1, "turn": reply}) + "\n", ""
        if "stop" in argv:
            self.calls.append(f"stop {argv[-1]}")
            if not self.stays_healthy:
                self.local = False
            return 0, "", ""
        if "start" in argv:
            self.calls.append(f"start {argv[-1]}")
            self.local = True
            return 0, "", ""
        self.calls.append(" ".join(argv))
        return 0, "", ""


def run(
    stack,
    *,
    stack_name="dev-cpu",
    environ=None,
    git_dirs=("/repo/.git", "/repo/.git"),
    extra=(),
):
    out = io.StringIO()

    def git(args):
        return 0, (git_dirs[0] if "--git-dir" in args else git_dirs[1]) + "\n"

    code = sign.main(
        ["--stack", stack_name, *extra],
        runner=stack,
        environ=environ
        if environ is not None
        else {"SANDBOX_RUNTIME": "1", "PATH": "/usr/bin"},
        out=out,
        git=git,
        sleep=lambda s: None,
    )
    return code, out.getvalue()


CHANGES = ("stop", "start", "probe turn")


def changed(stack):
    return [c for c in stack.calls if c.startswith(CHANGES)]


class TestRefusals:
    def test_prod_by_name(self):
        stack = Stack()
        code, text = run(stack, stack_name="prod")
        assert code == 2
        assert stack.calls == []
        assert "prod" in text

    def test_dev_from_an_agent_session(self):
        stack = Stack()
        code, _ = run(stack, stack_name="dev")
        assert code == 2
        assert stack.calls == []

    def test_dev_cpu_off_the_agents_engine(self):
        stack = Stack()
        code, _ = run(
            stack, environ={"PATH": "/usr/bin", "DOCKER_HOST": "tcp://other:2376"}
        )
        assert code == 2
        assert stack.calls == []

    def test_dev_cpu_from_a_linked_worktree(self):
        stack = Stack()
        code, _ = run(stack, git_dirs=("/repo/.git/worktrees/x", "/repo/.git"))
        assert code == 2
        assert stack.calls == []

    @pytest.mark.parametrize(
        ("health", "word"),
        [
            ({"synthetic": False}, "GATEWAY_TEST_SYNTHETIC_SPEND"),
            ({"state": "degraded"}, "operator-reset"),
            ({"awaiting_renewal": True}, "operator-renew"),
            ({"status": "degraded", "state": None}, "operator-reset"),
        ],
    )
    def test_a_stack_that_cant_prove_a_paid_reading(self, health, word):
        stack = Stack(health=health)
        code, text = run(stack)
        assert code == 2
        assert changed(stack) == []
        assert word in text


class TestSteps:
    def test_runs_in_order_and_passes(self):
        stack = Stack()
        code, text = run(stack)
        assert code == 0, text
        assert [c for c in stack.calls if not c.startswith("probe health")] == [
            "stop model-server-cpu",
            "probe turn",
            "reading fallback",
            "start model-server-cpu",
            "probe turn",
            "reading local",
        ]
        assert "pass" in text
        assert "$0.10 est." in text
        assert "local · $0" in text

    def test_never_prints_a_replys_words(self):
        stack = Stack()
        _, text = run(stack)
        assert SECRET_WORDS not in text

    @pytest.mark.parametrize(
        ("over", "row"),
        [
            ({"stays_healthy": True}, "stop"),
            ({"paid": {"status": 503}}, "paid"),
            (
                {"paid": {"status": 200, "route": "fallback", "cost_micro_usd": 0}},
                "paid",
            ),
            (
                {
                    "free": {
                        "status": 200,
                        "route": "fallback",
                        "cost_micro_usd": 100_000,
                    }
                },
                "local",
            ),
        ],
    )
    def test_a_miss_exits_1_naming_its_row_and_starts_the_model_server(self, over, row):
        stack = Stack(**over)
        code, text = run(stack)
        assert code == 1
        assert "miss" in text and row in text
        assert stack.calls.count("start model-server-cpu") >= 1
        assert stack.local

    @pytest.mark.parametrize("how", ["turn", "sigterm"])
    def test_starts_the_model_server_on_ctrl_c_and_sigterm(self, how):
        stack = Stack(interrupt=how)
        code, _ = run(stack)
        assert code == 1
        assert "start model-server-cpu" in stack.calls
        assert stack.local

    def test_restores_its_signal_handlers(self):
        before = signal.getsignal(signal.SIGTERM)
        run(Stack())
        assert signal.getsignal(signal.SIGTERM) == before
