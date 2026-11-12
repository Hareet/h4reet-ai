"""The operator's actions on the shared state (spec 001 tasks.md T064; FR-019, FR-074; contracts/shared-state.md §7,
§8; research.md R-32): `operator.py --stack shared`, which make operator-* ENV=shared runs, with a stub laptop prod and
a stub store, never Docker or AWS.

  - while the laptop's prod runs, it uses prod's own admin listener, 127.0.0.1:18003, and starts no stack; otherwise
    it composes an admin-only stack, the tunnel with -L 5432 alone, the gateway's admin listener on the same port, and
    no relay block, and stops it when the command ends; it never starts that stack while something else holds the
    port;
  - init refuses unless the store is uninitialized;
  - restore refuses unless EC2 is stopped and the laptop's prod isn't running; it prints the restored meters, and the
    gateway sets the store uninitialized under the initialization lock, keeping the ledger and the audit log; init then
    accepts the store;
  - each action is the gateway's, which writes its audit row with its host (src/meter/store.ts, 0007).
The token is prod's: the shared state is prod's one meter. Tokens are built at run time, so this file holds none.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


base = _load("h4_operator_tests_for_shared", REPO / "scripts" / "test_operator.py")
op = base.op
home = base.home  # the fixture: a temporary HOME, outside the sandbox
REASON = "Restored from the 06:00 dump after the tunnel end's loss."


class World:
    """The laptop and the cloud as the shared mode asks them: whether prod's gateway holds the admin port, whether
    anything else does, whether EC2 runs, and the admin-only stack's starts and stops."""

    def __init__(self, listener: Any) -> None:
        self.listener = listener
        self.prod_running = False
        self.port_held = False
        self.ec2_running = False
        self.stack: list[str] = []

    def install(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            op, "ADMIN_PORTS", {**op.ADMIN_PORTS, "prod": self.listener.port}
        )
        monkeypatch.setattr(op, "prod_gateway_running", lambda port: self.prod_running)
        monkeypatch.setattr(
            op, "port_held", lambda port: self.port_held or self.prod_running
        )
        monkeypatch.setattr(op, "ec2_running", lambda profile: self.ec2_running)
        world = self

        class Stack:
            def __init__(self, root: Path, env_file: Path) -> None:
                world.stack.append(f"made {env_file.name}")

            def start(self) -> None:
                world.stack.append("start")

            def stop(self) -> None:
                world.stack.append("stop")

        monkeypatch.setattr(op, "AdminOnlyStack", Stack)


@pytest.fixture
def world(monkeypatch: pytest.MonkeyPatch, home: Path) -> Any:
    listener = base.Stub()
    w = World(listener)
    w.install(monkeypatch)
    base.plant(home, "prod", base.token("prod", 3))
    env = home / ".config" / "h4reet-ai" / "env"
    env.mkdir(parents=True, exist_ok=True)
    env.chmod(0o700)
    (env / "prod.env").write_text("H4_STACK=prod\n", encoding="utf-8")
    (env / "prod.env").chmod(0o600)
    yield w
    listener.close()


def status(store: str) -> dict:
    return {
        **base.STATUS_BODY,
        "store": store,
        "state": None if store != "ok" else "normal",
    }


def test_while_prod_runs_it_uses_prods_admin_listener_and_starts_nothing(
    world: Any, capsys
) -> None:
    world.prod_running = True
    world.listener.answer("GET", "/admin/status", 200, base.STATUS_BODY)
    code, out, err = base.run(["--stack", "shared", "status"], capsys)
    assert code == 0, err
    assert world.stack == []
    assert [r["path"] for r in world.listener.requests] == ["/admin/status"]
    assert "via prod's admin listener" in out


def test_otherwise_it_composes_the_admin_only_stack_and_stops_it(
    world: Any, capsys
) -> None:
    world.listener.answer("GET", "/admin/status", 200, base.STATUS_BODY)
    code, out, err = base.run(["--stack", "shared", "status"], capsys)
    assert code == 0, err
    assert world.stack == ["made prod.env", "start", "stop"]
    assert "via the admin-only stack" in out


def test_it_stops_the_admin_only_stack_when_the_command_fails(
    world: Any, capsys
) -> None:
    world.listener.answer("GET", "/admin/status", 503, {"error": "store_unreachable"})
    code, _, _ = base.run(["--stack", "shared", "status"], capsys)
    assert code != 0
    assert world.stack[-1] == "stop"


def test_it_never_starts_the_admin_only_stack_while_another_listener_holds_the_port(
    world: Any, capsys
) -> None:
    world.port_held = True
    code, _, err = base.run(["--stack", "shared", "status"], capsys)
    assert code == 4
    assert world.stack == [] and world.listener.requests == []
    assert "is held, and not by prod's gateway" in err


def test_init_refuses_unless_the_store_is_uninitialized(world: Any, capsys) -> None:
    world.prod_running = True
    world.listener.answer("GET", "/admin/status", 200, status("ok"))
    code, _, err = base.run(
        ["--stack", "shared", "init", "--reason", REASON, "--day-usd", "1.40"], capsys
    )
    assert code == 1 and "uninitialized" in err
    assert [r["method"] for r in world.listener.requests] == ["GET"]


def test_init_accepts_an_uninitialized_store(world: Any, capsys) -> None:
    world.prod_running = True
    world.listener.answer("GET", "/admin/status", 200, status("uninitialized"))
    world.listener.answer("POST", "/admin/init", 200, base.INIT_BODY)
    code, _, err = base.run(
        ["--stack", "shared", "init", "--reason", REASON, "--day-usd", "1.40"], capsys
    )
    assert code == 0, err
    posted = [r for r in world.listener.requests if r["method"] == "POST"]
    assert posted[0]["path"] == "/admin/init"
    assert posted[0]["body"]["stated"]["day_usd"] == "1.40"


RESTORE_BODY = {
    "stack": "prod",
    "action": "restore",
    "status": "uninitialized",
    "restored": {
        "day_usd": "1.25",
        "month_usd": "7.50",
        "fallback_today_usd": "0.40",
        "crossed": ["day:2026-11-13"],
        "fallback_awaiting_renewal": False,
    },
}


def test_restore_refuses_while_ec2_runs_or_the_laptops_prod_does(
    world: Any, capsys
) -> None:
    world.ec2_running = True
    code, _, err = base.run(
        ["--stack", "shared", "restore", "--reason", REASON], capsys
    )
    assert code == 1 and "EC2" in err
    world.ec2_running, world.prod_running = False, True
    code, _, err = base.run(
        ["--stack", "shared", "restore", "--reason", REASON], capsys
    )
    assert code == 1 and "prod" in err
    assert world.listener.requests == [] and world.stack == []


def test_restore_prints_the_restored_meters_through_the_admin_only_stack(
    world: Any, capsys
) -> None:
    world.listener.answer("POST", "/admin/restore", 200, RESTORE_BODY)
    code, out, err = base.run(
        ["--stack", "shared", "restore", "--reason", REASON], capsys
    )
    assert code == 0, err
    assert world.stack == ["made prod.env", "start", "stop"]
    (posted,) = world.listener.requests
    assert posted["path"] == "/admin/restore" and posted["body"] == {"reason": REASON}
    assert "restored day 1.25 USD, month 7.50 USD, fallback today 0.40 USD" in out
    # FR-019's carry-over list (group 6's review, I-3): the crossed ceilings, which the restored meters hold again at
    # init, and the renewal flag, which init sets as RENEW=1 says.
    assert "restored crossed ceilings: day:2026-11-13" in out
    assert (
        "restored renewal: the fallback was renewed: init with RENEW=1 keeps it" in out
    )
    assert "make operator-init ENV=shared" in out


def test_restore_is_the_shared_states_alone(home: Path, capsys) -> None:
    code, _, _ = base.run(["--stack", "prod", "restore", "--reason", REASON], capsys)
    assert code == 2


def test_the_admin_only_stack_runs_the_tunnel_with_its_one_forward_and_no_relay_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[list[str], dict[str, str]]] = []
    monkeypatch.setattr(
        op, "run_docker", lambda argv, env: (calls.append((argv, env)), 0)[1]
    )
    env_file = tmp_path / "prod.env"
    env_file.write_text("H4_STACK=prod\n")
    stack = op.AdminOnlyStack(REPO, env_file)
    stack.start()
    stack.stop()
    joined = [" ".join(argv) for argv, _ in calls]
    up = next(j for j in joined if " up " in j)
    assert up.endswith("up -d --wait --no-deps gateway edge")
    assert "-p h4reet-prod" in up and f"--env-file {env_file}" in up
    run = next(j for j in joined if " run " in j)
    assert run.endswith(
        "run -d --rm --no-deps --use-aliases --name h4reet-prod-tunnel-admin tunnel admin"
    )
    overrides = next(env for argv, env in calls if " up " in " ".join(argv))
    # No relay block and no telemetry block: their tokens are empty, so both answer 401.
    assert (
        overrides["RELAY_TOKEN_SELF"] == "" and overrides["TELEMETRY_BLOCK_TOKEN"] == ""
    )
    assert any(" rm --stop " in j for j in joined)


def test_the_admin_only_stack_stops_its_own_services_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Group 6's review, nit 4: under prod's project, `down --remove-orphans` would stop every prod container, not
    # the three the stack started.
    ran: list[list[str]] = []
    monkeypatch.setattr(op, "run_docker", lambda argv, env: ran.append(argv) or 0)
    stack = op.AdminOnlyStack(tmp_path, tmp_path / "prod.env")
    stack.start()
    stack.stop()
    words = [" ".join(argv) for argv in ran]
    assert not any(" down" in w for w in words), words
    started = [a for a in ran if "run" in a]
    (tunnel,) = started
    name = tunnel[tunnel.index("--name") + 1]
    assert [w for w in words if w.endswith("rm --stop --force gateway edge")], words
    assert ran[-1] == ["docker", "rm", "--force", name], ran[-1]
