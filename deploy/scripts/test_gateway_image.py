"""Tests for deploy/scripts/gateway_image.py: the gateway's one image per commit (tasks.md T184; plan §4).

prod and dev at one commit run one image, h4reet-gateway:<the commit>, built once, outside compose, on the host's
engine, from the export the run file names, and reused after that, so both stacks show one image ID (US1-5,
FR-017). dev-cpu builds the working tree on the agents' engine as h4reet-gateway:working-tree, on every run, since
the working tree changes under one name. deploy/compose.yaml names that image and never pulls it.
"""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "gateway_image", REPO / "deploy" / "scripts" / "gateway_image.py"
)
assert SPEC and SPEC.loader
gi = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = gi
SPEC.loader.exec_module(gi)

COMPOSE = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
DEV_CPU_VARS = REPO / "deploy/env.agents/dev-cpu.vars"
SHA = "0123456789abcdef0123456789abcdef01234567"
PROXY = (
    "http://198.18.0.1:3128"  # dev-cpu.vars' H4_BUILD_PROXY (contracts/env-files.md §2)
)
IMAGE_ID = "sha256:" + "a" * 64


class FakeDocker:
    """docker image inspect and docker buildx build, as the engine would answer them."""

    def __init__(self, present: set[str] | None = None, build_rc: int = 0) -> None:
        self.present = set(present or ())
        self.build_rc = build_rc
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, *args: str, capture: bool = True) -> subprocess.CompletedProcess:
        self.calls.append(args)
        if args[:2] == ("image", "inspect"):
            there = args[-1] in self.present
            return subprocess.CompletedProcess(
                args,
                0 if there else 1,
                f"{IMAGE_ID}\n" if there else "",
                "" if there else f"Error: No such image: {args[-1]}",
            )
        if args[:2] == ("buildx", "build"):
            if self.build_rc == 0:
                self.present.add(args[args.index("--tag") + 1])
            return subprocess.CompletedProcess(args, self.build_rc, "", "")
        raise AssertionError(args)

    def builds(self) -> list[tuple[str, ...]]:
        return [c for c in self.calls if c[:2] == ("buildx", "build")]


def build_argv(tree: Path, tag: str, proxy: str) -> tuple[str, ...]:
    """The one build the script may run: its own tree's Dockerfile and context, the proxy, and nothing else."""
    return (
        "buildx",
        "build",
        "--load",
        "--file",
        str(tree / "services/gateway/Dockerfile"),
        "--tag",
        f"h4reet-gateway:{tag}",
        "--build-arg",
        f"HTTP_PROXY={proxy}",
        "--build-arg",
        f"HTTPS_PROXY={proxy}",
        str(tree),
    )


@pytest.fixture(autouse=True)
def outside_the_sandbox(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    monkeypatch.delenv("DOCKER_HOST", raising=False)


@pytest.fixture
def export(tmp_path: Path) -> Path:
    """A host stack's export: the tree the run file names, with the gateway's Dockerfile."""
    tree = tmp_path / "state/tree" / SHA
    (tree / "services/gateway").mkdir(parents=True)
    (tree / "services/gateway/Dockerfile").write_text(
        "FROM scratch\n", encoding="utf-8"
    )
    return tree


def host_files(
    tmp_path: Path, tree: Path, ref: str = SHA, proxy: str = ""
) -> tuple[Path, Path]:
    env = tmp_path / "prod.env"
    env.write_text(f"H4_STACK=prod\nH4_BUILD_PROXY={proxy}\n", encoding="utf-8")
    run = tmp_path / "run.env"
    run.write_text(
        f"H4_TREE={tree}\nH4_REF={ref}\nH4_REF_BRANCH=main\nH4_REF_PREVIOUS={SHA}\n",
        encoding="utf-8",
    )
    return env, run


def host(stack: str, env: Path, run: Path, fake: FakeDocker, tree: Path) -> int:
    return gi.main(
        ["--stack", stack, "--env-file", str(env), "--run-file", str(run)],
        fake,
        root=tree,
    )


# --------------------------------------------------------------------------------------------------
# The compose file names the image this script builds
# --------------------------------------------------------------------------------------------------
def interpolate(text: str, values: dict[str, str]) -> str:
    """compose's ${KEY:-default}, for the one form the image uses."""
    return re.sub(
        r"\$\{([A-Z0-9_]+):-([^}]*)\}",
        lambda m: values.get(m.group(1)) or m.group(2),
        text,
    )


def env_keys(path: Path) -> set[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return {ln.split("=", 1)[0] for ln in lines if ln and not ln.startswith("#")}


def test_compose_names_make_ups_one_image_and_never_pulls_or_builds_it() -> None:
    gateway = COMPOSE["services"]["gateway"]
    assert gateway["image"] == gi.COMPOSE_IMAGE
    # A missing image fails; nothing is pulled in its name.
    assert gateway["pull_policy"] == "never"
    # No per-stack build, so no per-project label or attestation.
    assert "build" not in gateway
    # A host stack's run file names its commit (contracts/env-files.md §12). dev-cpu has no run file, and no env file
    # sets H4_REF, so dev-cpu takes the default, the working tree.
    assert interpolate(gateway["image"], {"H4_REF": SHA}) == f"h4reet-gateway:{SHA}"
    assert interpolate(gateway["image"], {}) == f"h4reet-gateway:{gi.WORKING_TREE}"
    for path in (
        DEV_CPU_VARS,
        REPO / "deploy/env.example/prod.env.example",
        REPO / "deploy/env.example/dev.env.example",
    ):
        assert "H4_REF" not in env_keys(path), path
    # No other service names it.
    others = [
        n
        for n, s in COMPOSE["services"].items()
        if n != "gateway" and "h4reet-gateway" in str(s.get("image", ""))
    ]
    assert others == []


# --------------------------------------------------------------------------------------------------
# Host stacks: one build per commit, shared
# --------------------------------------------------------------------------------------------------
def test_a_host_stack_builds_its_commit_from_the_export(
    tmp_path: Path, export: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export) == 0
    assert fake.calls == [
        ("image", "inspect", "--format", "{{.Id}}", f"h4reet-gateway:{SHA}"),
        build_argv(export, SHA, ""),
    ]
    assert f"h4reet-gateway:{SHA}, built" in capsys.readouterr().out


def test_prod_and_dev_at_one_commit_share_one_build(
    tmp_path: Path, export: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # US1-5: "no code is changed or rebuilt per environment". The second stack finds the first one's image.
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export) == 0
    assert host("dev", env, run, fake, export) == 0
    assert host("prod", env, run, fake, export) == 0  # and a restart rebuilds nothing
    assert fake.builds() == [build_argv(export, SHA, "")]
    out = capsys.readouterr().out
    assert out.count(f"h4reet-gateway:{SHA}, reused") == 2
    assert IMAGE_ID[:19] in out


def test_another_commit_gets_its_own_image(tmp_path: Path, export: Path) -> None:
    other = "f" * 40
    tree = export.parent / other
    (tree / "services/gateway").mkdir(parents=True)
    (tree / "services/gateway/Dockerfile").write_text(
        "FROM scratch\n", encoding="utf-8"
    )
    env, run = host_files(tmp_path, tree, ref=other)
    fake = FakeDocker(present={f"h4reet-gateway:{SHA}"})
    assert host("dev", env, run, fake, tree) == 0
    assert fake.builds() == [build_argv(tree, other, "")]


def test_a_host_stack_builds_only_the_export_its_run_file_names(
    tmp_path: Path, export: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # Run from any other tree (the working tree, say), the build would put agent-written code on the host's engine
    # under a commit's name (FR-039).
    elsewhere = tmp_path / "working-tree"
    (elsewhere / "services/gateway").mkdir(parents=True)
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, elsewhere) == 2
    assert fake.calls == []
    assert "the export the run file names" in capsys.readouterr().err


@pytest.mark.parametrize(
    "ref", ["HEAD", SHA[:12], SHA.upper(), f"{SHA}x", "-" + SHA[1:], ""]
)
def test_a_run_file_without_a_full_sha_builds_nothing(
    tmp_path: Path, export: Path, ref: str
) -> None:
    env, run = host_files(tmp_path, export, ref=ref)
    fake = FakeDocker()
    assert host("dev", env, run, fake, export) == 2
    assert fake.calls == []


def test_a_host_stack_needs_its_run_file(
    tmp_path: Path, export: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env, _ = host_files(tmp_path, export)
    fake = FakeDocker()
    args = ["--stack", "prod", "--env-file", str(env)]
    assert gi.main(args, fake, root=export) == 2
    assert (
        gi.main([*args, "--run-file", str(tmp_path / "none.env")], fake, root=export)
        == 2
    )
    assert fake.calls == []
    assert "make up ENV=prod" in capsys.readouterr().err


@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_host_stacks_are_the_authors(
    tmp_path: Path,
    export: Path,
    stack: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host(stack, env, run, fake, export) == 2
    assert fake.calls == []
    assert "dev-cpu" in capsys.readouterr().err


def test_a_failed_build_fails_make_up_and_says_so(
    tmp_path: Path, export: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env, run = host_files(tmp_path, export)
    fake = FakeDocker(build_rc=1)
    assert host("prod", env, run, fake, export) == 1
    assert f"h4reet-gateway:{SHA} didn't build" in capsys.readouterr().err
    assert f"h4reet-gateway:{SHA}" not in fake.present


# --------------------------------------------------------------------------------------------------
# dev-cpu: the working tree, on the agents' engine, every run
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("docker_host", "sandbox"),
    [
        ("tcp://127.0.0.1:2376", "1"),
        ("tcp://198.18.0.1:2376", None),
        ("tcp://198.18.0.1:2376", "1"),
    ],
)
def test_dev_cpu_builds_the_working_tree_every_run_through_the_engines_proxy(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    docker_host: str,
    sandbox: str | None,
) -> None:
    monkeypatch.setenv("DOCKER_HOST", docker_host)
    if sandbox:
        monkeypatch.setenv("SANDBOX_RUNTIME", sandbox)
    # An image under the name already: the working tree may have changed since, so it is built again (the layer cache
    # makes an unchanged one quick), and never inspected for reuse.
    fake = FakeDocker(present={"h4reet-gateway:working-tree"})
    args = ["--stack", "dev-cpu", "--env-file", str(DEV_CPU_VARS)]
    assert gi.main(args, fake, root=REPO) == 0
    assert fake.calls == [build_argv(REPO, "working-tree", PROXY)]
    assert "h4reet-gateway:working-tree, built" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("docker_host", "sandbox"),
    [
        (None, None),  # the Author's terminal, the host's engine
        ("unix:///var/run/docker.sock", None),
        ("tcp://127.0.0.1:2376", None),  # the relay's address, outside the sandbox
        ("tcp://198.18.0.1:2377", None),
        (None, "1"),
        ("unix:///var/run/docker.sock", "1"),
    ],
)
def test_dev_cpu_never_builds_the_working_tree_on_another_engine(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    docker_host: str | None,
    sandbox: str | None,
) -> None:
    if docker_host:
        monkeypatch.setenv("DOCKER_HOST", docker_host)
    if sandbox:
        monkeypatch.setenv("SANDBOX_RUNTIME", sandbox)
    fake = FakeDocker()
    args = ["--stack", "dev-cpu", "--env-file", str(DEV_CPU_VARS)]
    assert gi.main(args, fake, root=REPO) == 2
    assert fake.calls == []
    assert "agents' engine" in capsys.readouterr().err


def test_dev_cpu_has_no_run_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DOCKER_HOST", "tcp://198.18.0.1:2376")
    run = tmp_path / "run.env"
    run.write_text(f"H4_TREE={REPO}\nH4_REF={SHA}\n", encoding="utf-8")
    fake = FakeDocker()
    args = [
        "--stack",
        "dev-cpu",
        "--env-file",
        str(DEV_CPU_VARS),
        "--run-file",
        str(run),
    ]
    assert gi.main(args, fake, root=REPO) == 2
    assert fake.calls == []


# --------------------------------------------------------------------------------------------------
# What the build gets
# --------------------------------------------------------------------------------------------------
def test_the_proxy_is_read_from_the_env_file_as_data(
    tmp_path: Path, export: Path
) -> None:
    # Single quotes are the grammar's (contracts/env-files.md §1.1); nothing is sourced or expanded.
    env, run = host_files(tmp_path, export)
    env.write_text("H4_BUILD_PROXY='$(touch x)'\n", encoding="utf-8")
    fake = FakeDocker()
    assert host("prod", env, run, fake, export) == 0
    assert fake.builds() == [build_argv(export, SHA, "$(touch x)")]
    assert not (tmp_path / "x").exists()


def test_an_unreadable_env_file_builds_nothing(tmp_path: Path, export: Path) -> None:
    _, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", tmp_path / "missing.env", run, fake, export) == 2
    assert fake.calls == []


def test_docker_gets_only_its_own_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    # Not the shell's proxies, which the CLI could hand the build; not AWS or stack settings.
    for key, value in {
        "DOCKER_HOST": "tcp://198.18.0.1:2376",
        "DOCKER_TLS_VERIFY": "1",
        "BUILDX_CONFIG": "/tmp/buildx",
        "HTTPS_PROXY": "http://user:pw@proxy.invalid:3128",
        "HTTP_PROXY": "http://proxy.invalid:3128",
        "AWS_PROFILE": "someone",
        "H4_REF": SHA,
    }.items():
        monkeypatch.setenv(key, value)
    env = gi.docker_env()
    assert set(env) <= {*gi.DOCKER_ENV, "LC_ALL"}
    assert (
        env["DOCKER_HOST"] == "tcp://198.18.0.1:2376"
        and env["BUILDX_CONFIG"] == "/tmp/buildx"
    )
    assert not {"HTTPS_PROXY", "HTTP_PROXY", "AWS_PROFILE", "H4_REF"} & set(env)
