"""The admin-only stack's start (spec 001 contracts/shared-state.md §7; night 5's F5, specs/001-cloud-elevation/fixes/
f5.md): it runs prod's own gateway image, the one prod's run file names, and it waits, within named bounds, for the
tunnel's `connected` mark and then for the gateway to read the store, before the CLI asks the gateway anything.

A fake docker plays the tunnel and the gateway, and a fake clock the time, so no container runs and no test waits.
Tokens are built at run time, so this file holds none.
"""

from __future__ import annotations

import importlib.util
import re
import shutil
import subprocess
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


base = _load("h4_operator_tests_for_admin_stack", REPO / "scripts" / "test_operator.py")
op = base.op
home = base.home  # the fixture: a temporary HOME, outside the sandbox

PROD_COMMIT = "0123456789abcdef0123456789abcdef01234567"
TUNNEL_PROBE = [
    "docker",
    "exec",
    "h4reet-prod-tunnel-admin",
    "test",
    "-f",
    "/run/tunnel/connected",
]


def plant_run_file(home: Path, ref: str = PROD_COMMIT) -> Path:
    """~/.local/state/h4reet/prod/run.env as deploy/scripts/export_tree.py writes it."""
    state = home / ".local" / "state" / "h4reet" / "prod"
    state.mkdir(parents=True, exist_ok=True)
    run = state / "run.env"
    run.write_text(
        f"H4_TREE={state}/tree/{ref}\nH4_REF={ref}\nH4_REF_BRANCH=main\nH4_REF_PREVIOUS=\n",
        encoding="utf-8",
    )
    run.chmod(0o600)
    return run


def plant_env_file(home: Path) -> Path:
    env = home / ".config" / "h4reet-ai" / "env"
    env.mkdir(parents=True, exist_ok=True)
    env.chmod(0o700)
    (env / "prod.env").write_text("H4_STACK=prod\n", encoding="utf-8")
    (env / "prod.env").chmod(0o600)
    return env / "prod.env"


class Clock:
    """Fake time: it moves only when the code under test sleeps."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.slept: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


class Docker:
    """The engine as the admin-only stack sees it: compose's up, run, and rm succeed; the tunnel's mark shows up on
    the `mark_on`-th probe (never, if None); the gateway's /health reads the store as `stores` says, one per probe,
    then as the last, and its probe exits 0 for ok or uninitialized, as the in-container script does."""

    def __init__(
        self, *, mark_on: int | None = 1, stores: list[str] | None = None
    ) -> None:
        self.mark_on = mark_on
        self.stores = list(stores or ["ok"])
        self.calls: list[tuple[str, list[str], dict[str, str]]] = []
        self.tunnel_probes = 0
        self.store_probes = 0
        self.seen_before: list[
            int
        ] = []  # the listener's request count at each call, when a listener is given
        self.listener: Any = None

    def kind(self, argv: list[str]) -> str:
        if argv == TUNNEL_PROBE:
            return "tunnel-probe"
        if "exec" in argv and "gateway" in argv and "node" in argv:
            return "store-probe"
        for word in ("up", "run", "rm"):
            if word in argv:
                return word
        return "other"

    def __call__(self, argv: list[str], env: dict[str, str]) -> int:
        kind = self.kind(argv)
        self.calls.append((kind, list(argv), dict(env)))
        if self.listener is not None:
            self.seen_before.append(len(self.listener.requests))
        if kind == "tunnel-probe":
            self.tunnel_probes += 1
            return (
                0
                if self.mark_on is not None and self.tunnel_probes >= self.mark_on
                else 1
            )
        if kind == "store-probe":
            self.store_probes += 1
            store = self.stores[min(self.store_probes, len(self.stores)) - 1]
            return 0 if store in ("ok", "uninitialized") else 1
        return 0

    def kinds(self) -> list[str]:
        return [kind for kind, _, _ in self.calls]


@pytest.fixture
def prod_home(home: Path) -> Path:
    plant_env_file(home)
    plant_run_file(home)
    return home


def make_stack(
    home: Path, docker: Docker, clock: Clock, monkeypatch: pytest.MonkeyPatch, **kw: Any
) -> Any:
    monkeypatch.setattr(op, "run_docker", docker)
    return op.AdminOnlyStack(
        REPO,
        home / ".config" / "h4reet-ai" / "env" / "prod.env",
        clock=clock.monotonic,
        sleep=clock.sleep,
        **kw,
    )


def compose_gateway_image() -> str:
    """deploy/compose.yaml's gateway image, as written: prod's compose names it so."""
    text = (REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8")
    block = text.split("\n  gateway:\n", 1)[1]
    found = re.search(r'^    image: "([^"]+)"$', block, re.MULTILINE)
    assert found, "compose.yaml's gateway has no image line"
    return found.group(1)


def interpolate(expression: str, env: dict[str, str]) -> str:
    """Compose's ${VAR:-default} and ${VAR}, enough for the gateway's image."""

    def one(m: re.Match[str]) -> str:
        name, default = m.group(1), m.group(3)
        value = env.get(name, "")
        return value if value else (default or "")

    return re.sub(r"\$\{([A-Z0-9_]+)(:-([^}]*))?\}", one, expression)


# --- prod's own image ---------------------------------------------------------------------------------------------


def test_the_gateway_runs_prods_own_image_the_run_files_commit(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    docker, clock = Docker(), Clock()
    stack = make_stack(prod_home, docker, clock, monkeypatch)
    stack.start()
    (_, _, up_env) = next(c for c in docker.calls if c[0] == "up")
    assert up_env.get("H4_REF") == PROD_COMMIT
    image = interpolate(compose_gateway_image(), up_env)
    assert image == f"h4reet-gateway:{PROD_COMMIT}"
    assert "working-tree" not in image
    # Every compose call of the stack names the same image: run, exec, and rm see the same environment.
    assert {
        c[2].get("H4_REF") for c in docker.calls if c[1][:2] == ["docker", "compose"]
    } == {PROD_COMMIT}


def test_the_run_file_defaults_to_prods_own(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert op.PROD_RUN_FILE == Path(".local") / "state" / "h4reet" / "prod" / "run.env"
    docker, clock = Docker(), Clock()
    stack = make_stack(prod_home, docker, clock, monkeypatch)
    assert stack.env["H4_REF"] == PROD_COMMIT


def test_without_prods_run_file_it_refuses_before_starting_anything(
    home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plant_env_file(home)
    docker, clock = Docker(), Clock()
    with pytest.raises(op.StackProblem) as problem:
        make_stack(home, docker, clock, monkeypatch)
    assert "run.env" in str(problem.value) and "make up ENV=prod" in str(problem.value)
    assert docker.calls == []


@pytest.mark.parametrize(
    "ref",
    ["", "working-tree", "0123456789abcdef", PROD_COMMIT.upper(), PROD_COMMIT + "0"],
)
def test_a_run_file_that_names_no_full_commit_is_refused(
    home: Path, monkeypatch: pytest.MonkeyPatch, ref: str
) -> None:
    plant_env_file(home)
    plant_run_file(home, ref)
    docker, clock = Docker(), Clock()
    with pytest.raises(op.StackProblem) as problem:
        make_stack(home, docker, clock, monkeypatch)
    assert "H4_REF" in str(problem.value)
    assert docker.calls == []


def test_an_up_that_fails_names_prods_image(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    docker, clock = Docker(), Clock()
    stack = make_stack(prod_home, docker, clock, monkeypatch)
    monkeypatch.setattr(op, "run_docker", lambda argv, env: 1 if "up" in argv else 0)
    with pytest.raises(op.StackProblem) as problem:
        stack.start()
    assert f"h4reet-gateway:{PROD_COMMIT}" in str(problem.value)
    assert "make up ENV=prod" in str(problem.value)


# --- the wait ------------------------------------------------------------------------------------------------------


def test_the_bounds_are_named() -> None:
    assert op.ADMIN_TUNNEL_WAIT_S == 60
    assert op.ADMIN_STORE_WAIT_S == 20
    assert op.ADMIN_POLL_S == 1


def test_it_waits_for_the_tunnels_mark_then_the_store_before_it_returns(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    docker, clock = Docker(mark_on=1, stores=["ok"]), Clock()
    make_stack(prod_home, docker, clock, monkeypatch).start()
    assert docker.kinds() == ["up", "run", "tunnel-probe", "store-probe"]


def test_it_waits_through_a_slow_first_connection_and_the_gateways_retry(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The first ssh try times out (ConnectTimeout 10) and the retry connects; then the gateway's next store attempt,
    # up to 5 s away, finds it.
    docker = Docker(mark_on=15, stores=["unreachable"] * 4 + ["ok"])
    clock = Clock()
    make_stack(prod_home, docker, clock, monkeypatch).start()
    kinds = docker.kinds()
    assert kinds.count("tunnel-probe") == 15 and kinds.count("store-probe") == 5
    # The store is asked only after the tunnel's mark is there.
    assert kinds.index("store-probe") > max(
        i for i, k in enumerate(kinds) if k == "tunnel-probe"
    )
    assert all(s == op.ADMIN_POLL_S for s in clock.slept)
    assert clock.now - 1000.0 <= op.ADMIN_TUNNEL_WAIT_S + op.ADMIN_STORE_WAIT_S


def test_an_uninitialized_store_is_ready_so_init_can_run(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    docker, clock = Docker(stores=["unreachable", "uninitialized"]), Clock()
    make_stack(prod_home, docker, clock, monkeypatch).start()
    assert docker.store_probes == 2


def test_a_tunnel_that_never_connects_fails_within_its_bound_and_never_asks_the_store(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    docker, clock = Docker(mark_on=None), Clock()
    stack = make_stack(prod_home, docker, clock, monkeypatch)
    with pytest.raises(op.StackProblem) as problem:
        stack.start()
    message = str(problem.value)
    assert "connected" in message and "60 s" in message
    assert docker.store_probes == 0
    assert clock.now - 1000.0 <= op.ADMIN_TUNNEL_WAIT_S + op.ADMIN_POLL_S
    assert docker.tunnel_probes >= op.ADMIN_TUNNEL_WAIT_S // op.ADMIN_POLL_S


def test_a_store_that_stays_unreachable_fails_within_its_bound(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    docker, clock = Docker(stores=["unreachable"]), Clock()
    stack = make_stack(prod_home, docker, clock, monkeypatch)
    with pytest.raises(op.StackProblem) as problem:
        stack.start()
    message = str(problem.value)
    assert "store" in message and "20 s" in message
    assert clock.now - 1000.0 <= op.ADMIN_STORE_WAIT_S + op.ADMIN_POLL_S


def test_the_store_probe_runs_in_the_gateways_own_container(
    prod_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    docker, clock = Docker(), Clock()
    make_stack(prod_home, docker, clock, monkeypatch).start()
    (_, argv, _) = next(c for c in docker.calls if c[0] == "store-probe")
    assert (
        argv[:2] == ["docker", "compose"]
        and "-p" in argv
        and argv[argv.index("-p") + 1] == "h4reet-prod"
    )
    at = argv.index("exec")
    assert argv[at : at + 5] == ["exec", "-T", "gateway", "node", "-e"]
    assert argv[at + 5] == op.store_probe_js(op.GATEWAY_HEALTH_URL)
    assert op.GATEWAY_HEALTH_URL == "http://127.0.0.1:8080/health"


@pytest.mark.skipif(shutil.which("node") is None, reason="node isn't on PATH")
@pytest.mark.parametrize(
    ("store", "code"), [("ok", 0), ("uninitialized", 0), ("unreachable", 1)]
)
def test_the_store_probe_script_exits_0_for_a_readable_store(
    store: str, code: int
) -> None:
    stub = base.Stub()
    try:
        stub.answer("GET", "/health", 200, {**base.STATUS_BODY, "store": store})
        done = subprocess.run(
            ["node", "-e", op.store_probe_js(f"{stub.url}/health")],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    finally:
        stub.close()
    assert done.returncode == code, done.stderr
    assert done.stdout == ""


@pytest.mark.skipif(shutil.which("node") is None, reason="node isn't on PATH")
def test_the_store_probe_script_exits_1_when_the_gateway_doesnt_answer() -> None:
    stub = base.Stub()
    url = f"{stub.url}/health"
    stub.close()
    done = subprocess.run(
        ["node", "-e", op.store_probe_js(url)],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert done.returncode == 1


# --- through the CLI ------------------------------------------------------------------------------------------------


@pytest.fixture
def cli(prod_home: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    listener = base.Stub()
    base.plant(prod_home, "prod", base.token("prod", 3))
    monkeypatch.setattr(op, "ADMIN_PORTS", {**op.ADMIN_PORTS, "prod": listener.port})
    monkeypatch.setattr(op, "prod_gateway_running", lambda port: False)
    monkeypatch.setattr(op, "port_held", lambda port: False)
    yield listener
    listener.close()


def test_the_cli_asks_the_gateway_only_after_the_tunnel_and_the_store(
    cli: Any, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    docker = Docker(mark_on=1, stores=["ok"])
    docker.listener = cli
    monkeypatch.setattr(op, "run_docker", docker)
    cli.answer("GET", "/admin/status", 200, base.STATUS_BODY)
    code, out, err = base.run(["--stack", "shared", "status"], capsys)
    assert code == 0, err
    kinds = docker.kinds()
    assert kinds[:4] == ["up", "run", "tunnel-probe", "store-probe"]
    # No request reached the admin listener before the store read.
    assert docker.seen_before[: kinds.index("store-probe") + 1] == [0] * (
        kinds.index("store-probe") + 1
    )
    assert [r["path"] for r in cli.requests] == ["/admin/status"]
    # Then the stack is stopped: compose's rm of gateway and edge, and the tunnel's own rm.
    assert kinds[-2:] == ["rm", "rm"]
    assert "via the admin-only stack" in out


def test_the_cli_stops_the_stack_and_asks_nothing_when_the_tunnel_never_connects(
    cli: Any, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    docker = Docker(mark_on=None)
    monkeypatch.setattr(op, "run_docker", docker)
    # Bounds of zero: one probe each, and no sleep, so the test waits on nothing.
    monkeypatch.setattr(op, "ADMIN_TUNNEL_WAIT_S", 0)
    code, _, err = base.run(["--stack", "shared", "status"], capsys)
    assert code == 4
    assert "connected" in err
    assert cli.requests == []
    words = [" ".join(argv) for _, argv, _ in docker.calls]
    assert any(w.endswith("rm --stop --force gateway edge") for w in words), words
    assert words[-1] == "docker rm --force h4reet-prod-tunnel-admin"
