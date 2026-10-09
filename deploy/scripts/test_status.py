"""Tests for deploy/scripts/status.py and deploy/scripts/redact.sh, with a stubbed docker."""

from __future__ import annotations

import copy
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "status", REPO / "deploy" / "scripts" / "status.py"
)
assert SPEC and SPEC.loader
st = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = st
SPEC.loader.exec_module(st)

SHA, PREVIOUS = "b" * 40, "c" * 40
RAW = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
PROM_JOBS = [
    job["job_name"]
    for job in yaml.safe_load(
        (REPO / "deploy/prometheus/prometheus.yml").read_text(encoding="utf-8")
    )["scrape_configs"]
]
LOCK = {
    ln.split()[0]: ln.split()
    for ln in (REPO / "deploy/images.lock").read_text().splitlines()
    if ln and not ln.startswith("#")
}
# Secret-shaped log content, built at run time so this file holds none.
LEAKY = (
    "connect postgres://gateway:"
    + "hunter"
    + "2pw@gateway-state:5432 failed; password="
    + "s3"
    + "cret"
)


def pinned(service: str) -> str:
    return f"{LOCK[service][1]}@{LOCK[service][3]}"


class FakeDocker(st.Docker):
    def __init__(self, tree: Path, stack: str) -> None:
        super().__init__({"PATH": "/usr/bin"})
        self.tree, self.stack = tree, stack
        self.raw = copy.deepcopy(RAW)
        self.state = {name: ("running", "healthy") for name in self.raw["services"]}
        self.digests = {
            name: [pinned(name)] for name in self.raw["services"] if name in LOCK
        }
        self.created_from = str(tree / "deploy/compose.yaml")
        self.health_report: dict | None = {
            "status": "ok",
            "store": "ok",
            "state": "normal",
            "crossed": [],
            "degraded_cause": None,
            "adapters": [{"id": "local", "healthy": True, "reason": None}],
        }
        # Prometheus's answer: every job of the committed prometheus.yml, up.
        self.prom: dict | None = {
            "data": {
                "activeTargets": [
                    {"health": "up", "labels": {"job": job}} for job in PROM_JOBS
                ]
            }
        }
        self.down = False
        self.calls: list[tuple[str, ...]] = []

    def run(self, *args: str, timeout: float = 30) -> subprocess.CompletedProcess:
        self.calls.append(args)

        def done(out: str = "", code: int = 0) -> subprocess.CompletedProcess:
            return subprocess.CompletedProcess(["docker", *args], code, out, "")

        if self.down:
            return done("", 1)
        if args[0] == "compose":
            assert args[1:4] == ("-p", f"h4reet-{self.stack}", "-f")
            assert args[4] == str(self.tree / "deploy/compose.yaml")
            rest = args[args.index("--env-file") + 2 :]
            if rest and rest[0] == "--env-file":
                rest = rest[2:]
            if rest[0] == "config":
                return done(json.dumps(self.raw))
            if rest[0] == "ps":
                lines = []
                for name, (state, health) in self.state.items():
                    if state == "absent":
                        continue
                    labels = f"com.docker.compose.project=h4reet-{self.stack},com.docker.compose.project.config_files={self.created_from}"
                    lines.append(
                        json.dumps(
                            {
                                "ID": f"id-{name}",
                                "Service": name,
                                "State": state,
                                "Health": health,
                                "Labels": labels,
                            }
                        )
                    )
                return done("\n".join(lines) + "\n")
            if rest[0] == "logs":
                return done(
                    f"2026-10-08T10:00:00Z booting\n2026-10-08T10:00:01Z ERROR {LEAKY}\n"
                )
            if rest[:3] == ("exec", "-T", "edge"):
                return (
                    done(json.dumps(self.health_report))
                    if self.health_report
                    else done("", 1)
                )
            if rest[:3] == ("exec", "-T", "prometheus"):
                return done(json.dumps(self.prom)) if self.prom else done("", 1)
        if args[:3] == ("inspect", "--format", "{{.Image}}"):
            return done(f"sha256:img-{args[3][3:]}\n")
        if args[:3] == ("image", "inspect", "--format"):
            return done(json.dumps(self.digests.get(args[4].split("img-", 1)[1], [])))
        if args[:3] == ("inspect", "--format", "{{json .State.Health}}"):
            return done(
                json.dumps(
                    {
                        "Status": "unhealthy",
                        "Log": [{"ExitCode": 1, "Output": f"probe: {LEAKY}"}],
                    }
                )
            )
        if args[:2] == ("system", "df"):
            return done("TYPE   TOTAL   ACTIVE   SIZE\nImages 12      9        9.1GB\n")
        raise AssertionError(f"unexpected docker {args}")

    def nvidia(self) -> str | None:
        return "1536 MiB, 24463 MiB"


@pytest.fixture
def host_stack(tmp_path: Path) -> tuple[Path, Path, Path]:
    """prod's env file, its run file, and the export it names."""
    tree = tmp_path / "state/tree" / SHA
    (tree / "deploy").mkdir(parents=True)
    shutil.copy2(REPO / "deploy/compose.yaml", tree / "deploy/compose.yaml")
    shutil.copy2(REPO / "deploy/images.lock", tree / "deploy/images.lock")
    env = tmp_path / "prod.env"
    env.write_text("H4_STACK=prod\nCOMPOSE_PROFILES=gpu\n", encoding="utf-8")
    run = tmp_path / "state/run.env"
    run.write_text(
        f"H4_TREE={tree}\nH4_REF={SHA}\nH4_REF_BRANCH=main\nH4_REF_PREVIOUS={PREVIOUS}\n",
        encoding="utf-8",
    )
    return env, run, tree


def status(
    env: Path,
    run: Path | None,
    docker: FakeDocker,
    stack: str = "prod",
    root: Path = REPO,
    after_up: bool = True,
) -> int:
    argv = ["--stack", stack, "--env-file", str(env), "--root", str(root)]
    if run is not None:
        argv += ["--run-file", str(run)]
    if after_up:
        argv.append("--after-up")
    return st.main(argv, docker)


def test_a_host_stack_without_a_run_file_was_not_started_by_make_up(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env = tmp_path / "prod.env"
    env.write_text("H4_STACK=prod\n", encoding="utf-8")
    docker = FakeDocker(tmp_path, "prod")
    assert status(env, tmp_path / "none/run.env", docker) == 0
    assert "not started by make up" in capsys.readouterr().out
    assert docker.calls == []


def test_a_healthy_stack(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    assert status(env, run, FakeDocker(tree, "prod")) == 0
    out = capsys.readouterr().out
    assert f"h4reet-prod: commit {SHA} (branch main); previous {PREVIOUS}" in out
    assert f"rollback: make up ENV=prod REF={PREVIOUS}" in out
    rows = {
        line.split()[0]: line.split()[1:]
        for line in out.splitlines()
        if len(line.split()) == 4 and line.split()[0] in RAW["services"]
    }
    # Every service of prod's profile, gpu, and no other: the GPU model server, not the CPU one.
    assert rows["edge"] == ["running", "healthy", "pinned"]
    assert rows["gateway"] == ["running", "healthy", "built"]
    assert rows["model-server-gpu"] == ["running", "healthy", "pinned"]
    assert set(rows) == {
        name
        for name, service in RAW["services"].items()
        if not service.get("profiles") or "gpu" in service["profiles"]
    }
    assert "model-server-cpu" not in rows
    assert (
        "gateway /health: ok · store ok · state normal · cause None · adapters: local healthy"
        in out
    )
    # Prometheus is in every stack: its targets, asked from inside its container.
    assert f"prometheus targets: {len(PROM_JOBS)} up, 0 down" in out
    assert "gpu memory (used, total): 1536 MiB, 24463 MiB" in out
    assert "docker system df:" in out and out.rstrip().endswith("status: healthy")


def test_a_compose_file_without_prometheus_is_named(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    del docker.raw["services"]["prometheus"]
    del docker.state["prometheus"]
    assert status(env, run, docker) == 0
    out = capsys.readouterr().out
    assert "prometheus: not in this commit's compose file" in out
    assert out.rstrip().endswith("status: healthy, waiting on the operator")


def test_prometheus_unreachable_is_a_warning(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.prom = None
    assert status(env, run, docker) == 0
    assert "WARN Prometheus's targets couldn't be read" in capsys.readouterr().out


def test_an_uninitialized_store_prints_the_one_time_command(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.health_report = {
        **docker.health_report,
        "status": "degraded",
        "store": "uninitialized",
        "state": None,
    }
    assert status(env, run, docker) == 0
    out = capsys.readouterr().out
    assert (
        "WARN the store is uninitialized" in out
        and 'make operator-init ENV=prod REASON="' in out
    )
    assert out.rstrip().endswith("status: healthy, waiting on the operator")
    assert not [c for c in docker.calls if "init" in c or "reset" in c]  # it never acts


def test_a_tripped_switch_is_a_warning(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.health_report = {
        **docker.health_report,
        "state": "degraded",
        "crossed": ["day"],
    }
    assert status(env, run, docker) == 0
    assert (
        "WARN the kill switch is tripped (day): make operator-status ENV=prod"
        in capsys.readouterr().out
    )


def test_a_failing_service_is_named_with_redacted_evidence(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.state["gateway-state"] = ("running", "unhealthy")
    assert status(env, run, docker) == 1
    out = capsys.readouterr().out
    assert (
        "gateway-state's last health check (exit 1):" in out
        and "gateway-state's error lines, redacted:" in out
    )
    assert (
        "postgres://gateway:<redacted>@gateway-state" in out
        and "password=<redacted>" in out
    )
    assert "hunter2pw" not in out and "s3cret" not in out
    assert "status: 1 service(s) failing: gateway-state; the rest keep running" in out


def test_a_missing_or_stopped_service_fails(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.state["gateway"] = ("absent", "")
    docker.state["edge"] = ("exited", "")
    assert status(env, run, docker) == 1
    out = capsys.readouterr().out
    assert (
        "gateway              missing" in out and "edge                 exited" in out
    )
    assert "gateway /health: not asked, because edge or the gateway is down" in out


def test_starting_fails_after_up_and_only_warns_in_make_status(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.state["gateway"] = ("running", "starting")
    assert status(env, run, docker, after_up=True) == 1
    capsys.readouterr()
    assert status(env, run, docker, after_up=False) == 0
    assert "WARN gateway is still starting" in capsys.readouterr().out


def test_drift_from_the_pin_and_from_the_running_commit(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.digests["edge"] = [f"{LOCK['edge'][1]}@sha256:{'0' * 64}"]
    docker.created_from = "/elsewhere/tree/old/deploy/compose.yaml"
    assert status(env, run, docker) == 0
    out = capsys.readouterr().out
    assert (
        "differs from the pin" in out
        and "WARN edge runs an image whose digest isn't deploy/images.lock's" in out
    )
    assert (
        "WARN edge was created from another commit's compose file: make up ENV=prod recreates it"
        in out
    )


def test_dev_cpu_runs_the_working_tree(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    docker = FakeDocker(REPO, "dev-cpu")
    docker.prom = {
        "data": {
            "activeTargets": [
                {"health": "up", "labels": {"job": "otel"}},
                {"health": "down", "labels": {"job": "loki"}},
            ]
        }
    }
    assert (
        status(REPO / "deploy/env.agents/dev-cpu.vars", None, docker, stack="dev-cpu")
        == 0
    )
    out = capsys.readouterr().out
    assert "h4reet-dev-cpu: the working tree" in out
    assert (
        "prometheus targets: 1 up, 1 down (loki)" in out
        and "WARN Prometheus targets down: loki" in out
    )
    assert "gpu memory" not in out


def test_without_docker_it_fails(
    host_stack: tuple[Path, Path, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    env, run, tree = host_stack
    docker = FakeDocker(tree, "prod")
    docker.down = True
    assert status(env, run, docker) == 1
    assert "status: Docker didn't answer" in capsys.readouterr().out


def test_parse_ps_reads_lines_and_arrays() -> None:
    assert st.parse_ps('{"Service":"a"}\n{"Service":"b"}\n') == [
        {"Service": "a"},
        {"Service": "b"},
    ]
    assert st.parse_ps('[{"Service":"a"}]') == [{"Service": "a"}]
    assert st.parse_ps("") == []


# ---------------------------------------------------------------------------------------------------------------
# redact.sh


def test_redact_is_ops_filter_verbatim() -> None:
    ops = (REPO / ".claude/agents/ops.md").read_text(encoding="utf-8")
    (line,) = [
        ln.strip() for ln in ops.splitlines() if ln.strip().startswith("redact() {")
    ]
    script = (
        (REPO / "deploy/scripts/redact.sh").read_text(encoding="utf-8").splitlines()
    )
    assert line in script


@pytest.mark.parametrize(
    ("given", "shown"),
    [
        (
            "url postgres://gateway:" + "pw" + "@db:5432/x",
            "url postgres://gateway:<redacted>@db:5432/x",
        ),
        (
            "POST /bot" + "1234567" + ":" + "AAH" + "x_y-z/sendMessage",
            "POST /bot<redacted>/sendMessage",
        ),
        (
            '{"authorization": "Bearer ' + "abc" + ' def"}',
            '{"authorization": <redacted>',
        ),
        ("Authorization: Basic " + "Zm9v", "Authorization: <redacted>"),
        ("smtp password=" + "with spaces in it", "smtp password=<redacted>"),
        ("LANGFUSE_SECRET_KEY=" + "sk-lf-" + "x", "LANGFUSE_SECRET_KEY=<redacted>"),
        ("api_key: " + "k", "api_key: <redacted>"),
        ("nothing to hide here", "nothing to hide here"),
    ],
)
def test_redact_masks_the_usual_shapes(given: str, shown: str) -> None:
    assert st.redact(given + "\n") == shown + "\n"
