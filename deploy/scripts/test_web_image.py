"""Tests for deploy/scripts/web_image.py: the room's image (spec 002, T001; contracts/web-serving.md §1).

The web image bakes in two things the gateway's doesn't: the drafts flag (ROOM_DRAFTS) and main's policy files as
they stood at build time. So, unlike gateway_image.py (tasks.md T184):
  - its tag carries the drafts flag, from the env file's H4_WEB_SUFFIX: h4reet-web:<ref> on prod, with no drafts,
    and h4reet-web:<ref>-drafts on dev and dev-cpu, with ROOM_DRAFTS=1; a prod build with drafts is refused;
  - it rebuilds on every make up and never reuses a tag, so a dev build never runs as prod's, and an approval on main
    reaches the next make up;
  - main's assets/policy/content-approvals.json and resume-header.json are read on the host with git show, from the
    repository make names, and handed to the build as the named build context `policy`; a file main lacks is absent
    from it. The build stage reads only that, and never runs git.
The rest is the gateway's rule: a host stack builds the export its run file names; dev-cpu builds the working tree on
the agents' engine only. deploy/compose.yaml names that image and never pulls it.
"""

from __future__ import annotations

import hashlib
import importlib.util
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "web_image", REPO / "deploy" / "scripts" / "web_image.py"
)
assert SPEC and SPEC.loader
wi = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = wi
SPEC.loader.exec_module(wi)

COMPOSE = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
DEV_CPU_VARS = REPO / "deploy/env.agents/dev-cpu.vars"
TEMPLATES = {
    "prod": REPO / "deploy/env.example/prod.env.example",
    "dev": REPO / "deploy/env.example/dev.env.example",
    "dev-cpu": DEV_CPU_VARS,
}
SHA = "0123456789abcdef0123456789abcdef01234567"
PROXY = "http://198.18.0.1:3128"  # dev-cpu.vars' H4_BUILD_PROXY
APPROVALS = "assets/policy/content-approvals.json"
HEADER = "assets/policy/resume-header.json"
# Stand-ins for the Author's files, as main would hold them. Not real approvals: the digest is made here, at run time.
MAIN_APPROVALS = (
    '{"schema": 1, "approvals": [{"id": "C-0001", "sha256": "'
    + hashlib.sha256(b"a resume").hexdigest()
    + '"}]}\n'
)
MAIN_HEADER = '{"schema": 1, "full_name": null, "contact": null}\n'


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=True,
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(repo),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@example.invalid",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@example.invalid",
        },
    )
    return done.stdout.strip()


def make_repo(
    path: Path, files: dict[str, str] | None, branch_files: dict[str, str] | None = None
) -> Path:
    """A repository whose main holds `files` (None: no main at all), checked out on a branch holding `branch_files`."""
    path.mkdir(parents=True)
    git(path, "init", "-q", "-b", "main" if files is not None else "other")
    (path / "README.md").write_text("x\n", encoding="utf-8")
    for rel, text in (files or {}).items():
        (path / rel).parent.mkdir(parents=True, exist_ok=True)
        (path / rel).write_text(text, encoding="utf-8")
    git(path, "add", "-A")
    git(path, "commit", "-qm", "base")
    if branch_files is not None:
        git(path, "switch", "-qc", "feature")
        for rel, text in branch_files.items():
            (path / rel).parent.mkdir(parents=True, exist_ok=True)
            (path / rel).write_text(text, encoding="utf-8")
        git(path, "add", "-A")
        git(path, "commit", "-qm", "branch")
    return path


def digest(files: dict[str, bytes | None]) -> str:
    """The policy's digest, as the contract defines it: each file's name and SHA-256 (or "absent"), in order."""
    text = "".join(
        f"{name}:{hashlib.sha256(files[name]).hexdigest() if files[name] is not None else 'absent'}\n"
        for name in ("content-approvals.json", "resume-header.json")
    )
    return hashlib.sha256(text.encode()).hexdigest()


class FakeDocker:
    """docker buildx build, as the engine would answer it, keeping a copy of the policy context it was handed."""

    def __init__(self, build_rc: int = 0) -> None:
        self.build_rc = build_rc
        self.calls: list[tuple[str, ...]] = []
        self.contexts: list[dict[str, bytes]] = []
        self.context_dirs: list[Path] = []

    def __call__(self, *args: str, capture: bool = True) -> subprocess.CompletedProcess:
        self.calls.append(args)
        if args[:2] != ("buildx", "build"):
            raise AssertionError(args)
        spec = args[args.index("--build-context") + 1]
        name, _, where = spec.partition("=")
        assert name == "policy"
        folder = Path(where)
        self.context_dirs.append(folder)
        self.contexts.append({p.name: p.read_bytes() for p in sorted(folder.iterdir())})
        return subprocess.CompletedProcess(args, self.build_rc, "", "")

    def builds(self) -> list[tuple[str, ...]]:
        return [c for c in self.calls if c[:2] == ("buildx", "build")]


def build_argv(
    tree: Path, tag: str, proxy: str, drafts: str, context: str, policy: str
) -> tuple[str, ...]:
    """The one build the script may run: its own tree's Dockerfile and context, the proxy, the drafts flag, the
    policy context, and its digest as a label."""
    return (
        "buildx",
        "build",
        "--load",
        "--file",
        str(tree / "apps/web/Dockerfile"),
        "--tag",
        f"h4reet-web:{tag}",
        "--build-arg",
        f"HTTP_PROXY={proxy}",
        "--build-arg",
        f"HTTPS_PROXY={proxy}",
        "--build-arg",
        f"ROOM_DRAFTS={drafts}",
        "--build-context",
        f"policy={context}",
        "--label",
        f"org.h4reet.web.policy={policy}",
        str(tree),
    )


def built(fake: FakeDocker, i: int = 0) -> tuple[str, ...]:
    """The i-th build, with its random context path, for comparison with build_argv."""
    return fake.builds()[i]


def context_of(argv: tuple[str, ...]) -> str:
    return argv[argv.index("--build-context") + 1].partition("=")[2]


@pytest.fixture(autouse=True)
def outside_the_sandbox(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    monkeypatch.delenv("DOCKER_HOST", raising=False)


@pytest.fixture
def export(tmp_path: Path) -> Path:
    """A host stack's export: the tree the run file names, with the room's Dockerfile."""
    tree = tmp_path / "state/tree" / SHA
    (tree / "apps/web").mkdir(parents=True)
    (tree / "apps/web/Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
    return tree


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """The working tree make names: main holds both policy files."""
    return make_repo(
        tmp_path / "repo", {APPROVALS: MAIN_APPROVALS, HEADER: MAIN_HEADER}
    )


def host_files(
    tmp_path: Path, tree: Path, stack: str = "prod", suffix: str = "", ref: str = SHA
) -> tuple[Path, Path]:
    env = tmp_path / f"{stack}.env"
    env.write_text(
        f"H4_STACK={stack}\nH4_BUILD_PROXY=\nH4_WEB_SUFFIX={suffix}\n",
        encoding="utf-8",
    )
    run = tmp_path / "run.env"
    run.write_text(
        f"H4_TREE={tree}\nH4_REF={ref}\nH4_REF_BRANCH=main\nH4_REF_PREVIOUS={SHA}\n",
        encoding="utf-8",
    )
    return env, run


def host(
    stack: str, env: Path, run: Path, fake: FakeDocker, tree: Path, repo: Path
) -> int:
    return wi.main(
        [
            "--stack",
            stack,
            "--env-file",
            str(env),
            "--run-file",
            str(run),
            "--repo",
            str(repo),
        ],
        fake,
        root=tree,
    )


def read_env(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            key, _, value = line.partition("=")
            out[key] = value
    return out


def interpolate(text: str, values: dict[str, str]) -> str:
    """compose's ${KEY:-default} and ${KEY}, the two forms the image uses."""
    text = re.sub(
        r"\$\{([A-Z0-9_]+):-([^}]*)\}",
        lambda m: values.get(m.group(1)) or m.group(2),
        text,
    )
    return re.sub(r"\$\{([A-Z0-9_]+)\}", lambda m: values[m.group(1)], text)


BOTH = {
    "content-approvals.json": MAIN_APPROVALS.encode(),
    "resume-header.json": MAIN_HEADER.encode(),
}


# --------------------------------------------------------------------------------------------------
# The compose file names the image this script builds, with the drafts flag in its tag
# --------------------------------------------------------------------------------------------------
def test_compose_names_make_ups_build_and_never_pulls_or_builds_it() -> None:
    web = COMPOSE["services"]["web"]
    assert (
        web["image"]
        == wi.COMPOSE_IMAGE
        == "h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}"
    )
    assert web["pull_policy"] == "never"
    assert "build" not in web
    others = [
        n
        for n, s in COMPOSE["services"].items()
        if n != "web" and "h4reet-web" in str(s.get("image", ""))
    ]
    assert others == []


@pytest.mark.parametrize(
    ("stack", "ref", "tag"),
    [
        ("prod", SHA, SHA),
        ("dev", SHA, f"{SHA}-drafts"),
        ("dev-cpu", None, "working-tree-drafts"),
    ],
)
def test_each_stacks_env_file_names_the_tag_this_script_builds(
    stack: str, ref: str | None, tag: str
) -> None:
    # H4_REF comes from a host stack's run file; dev-cpu has none, so compose takes the default.
    template = read_env(TEMPLATES[stack])
    assert "H4_REF" not in template
    values = template | ({"H4_REF": ref} if ref else {})
    assert interpolate(wi.COMPOSE_IMAGE, values) == f"h4reet-web:{tag}"


def test_the_templates_suffixes() -> None:
    assert {s: read_env(p)["H4_WEB_SUFFIX"] for s, p in TEMPLATES.items()} == {
        "prod": "",
        "dev": "-drafts",
        "dev-cpu": "-drafts",
    }


# --------------------------------------------------------------------------------------------------
# Host stacks: the export, the drafts flag, a build on every run
# --------------------------------------------------------------------------------------------------
def test_prod_builds_its_commit_without_drafts(
    tmp_path: Path, export: Path, repo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    argv = built(fake)
    assert fake.calls == [
        build_argv(export, SHA, "", "", context_of(argv), digest(BOTH))
    ]
    assert f"h4reet-web:{SHA}, built" in capsys.readouterr().out


def test_dev_builds_its_commit_with_drafts_under_its_own_tag(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    env, run = host_files(tmp_path, export, stack="dev", suffix="-drafts")
    fake = FakeDocker()
    assert host("dev", env, run, fake, export, repo) == 0
    argv = built(fake)
    assert argv == build_argv(
        export, f"{SHA}-drafts", "", "1", context_of(argv), digest(BOTH)
    )


def test_every_run_builds_and_no_tag_is_reused(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    # The image holds main's approvals as they stood: a restart rebuilds, so an approval reaches it.
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    for _ in range(2):
        assert host("prod", env, run, fake, export, repo) == 0
    assert len(fake.builds()) == 2
    assert not [c for c in fake.calls if c[:2] == ("image", "inspect")]


def test_prod_and_dev_at_one_commit_get_two_images(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    fake = FakeDocker()
    env, run = host_files(tmp_path, export, stack="dev", suffix="-drafts")
    assert host("dev", env, run, fake, export, repo) == 0
    env, run = host_files(tmp_path, export)
    assert host("prod", env, run, fake, export, repo) == 0
    tags = [c[c.index("--tag") + 1] for c in fake.builds()]
    drafts = [c[c.index("--build-arg") + 5] for c in fake.builds()]
    assert tags == [f"h4reet-web:{SHA}-drafts", f"h4reet-web:{SHA}"]
    assert drafts == ["ROOM_DRAFTS=1", "ROOM_DRAFTS="]


@pytest.mark.parametrize(
    ("stack", "suffix", "why"),
    [
        ("prod", "-drafts", "prod never shows drafts"),
        ("prod", "-x", "prod never shows drafts"),
        ("dev", "", "H4_WEB_SUFFIX is -drafts on dev"),
        ("dev", "-draft", "H4_WEB_SUFFIX is -drafts on dev"),
        ("dev", ":latest", "H4_WEB_SUFFIX is -drafts on dev"),
    ],
)
def test_a_suffix_other_than_the_stacks_builds_nothing(
    tmp_path: Path,
    export: Path,
    repo: Path,
    capsys: pytest.CaptureFixture[str],
    stack: str,
    suffix: str,
    why: str,
) -> None:
    env, run = host_files(tmp_path, export, stack=stack, suffix=suffix)
    fake = FakeDocker()
    assert host(stack, env, run, fake, export, repo) == 2
    assert fake.calls == []
    assert why in capsys.readouterr().err


def test_a_missing_suffix_key_builds_nothing(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    # A file from before spec 002: make init-env SYNC=1 adds the key.
    env, run = host_files(tmp_path, export)
    env.write_text("H4_STACK=prod\nH4_BUILD_PROXY=\n", encoding="utf-8")
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 2
    assert fake.calls == []


def test_a_host_stack_builds_only_the_export_its_run_file_names(
    tmp_path: Path, export: Path, repo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    elsewhere = tmp_path / "working-tree"
    (elsewhere / "apps/web").mkdir(parents=True)
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, elsewhere, repo) == 2
    assert fake.calls == []
    assert "the export the run file names" in capsys.readouterr().err


@pytest.mark.parametrize("ref", ["HEAD", SHA[:12], SHA.upper(), f"{SHA}x", ""])
def test_a_run_file_without_a_full_sha_builds_nothing(
    tmp_path: Path, export: Path, repo: Path, ref: str
) -> None:
    env, run = host_files(tmp_path, export, ref=ref)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 2
    assert fake.calls == []


def test_a_host_stack_needs_its_run_file(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    env, _ = host_files(tmp_path, export)
    fake = FakeDocker()
    args = ["--stack", "prod", "--env-file", str(env), "--repo", str(repo)]
    assert wi.main(args, fake, root=export) == 2
    assert fake.calls == []


@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_host_stacks_are_the_authors(
    tmp_path: Path,
    export: Path,
    repo: Path,
    stack: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    env, run = host_files(
        tmp_path, export, stack=stack, suffix="-drafts" if stack == "dev" else ""
    )
    fake = FakeDocker()
    assert host(stack, env, run, fake, export, repo) == 2
    assert fake.calls == []
    assert "dev-cpu" in capsys.readouterr().err


def test_a_failed_build_fails_make_up_and_says_so(
    tmp_path: Path, export: Path, repo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env, run = host_files(tmp_path, export)
    fake = FakeDocker(build_rc=1)
    assert host("prod", env, run, fake, export, repo) == 1
    assert f"h4reet-web:{SHA} didn't build" in capsys.readouterr().err


# --------------------------------------------------------------------------------------------------
# The policy: main's files, read on the host, handed over as the named context `policy`
# --------------------------------------------------------------------------------------------------
def test_the_policy_context_holds_mains_two_files_exactly(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [BOTH]


def test_the_branchs_copy_is_never_read(tmp_path: Path, export: Path) -> None:
    # A branch can't approve its own content: the working tree's copy says otherwise, and main's is what's used.
    repo = make_repo(
        tmp_path / "repo",
        {APPROVALS: MAIN_APPROVALS, HEADER: MAIN_HEADER},
        branch_files={
            APPROVALS: '{"schema": 1, "approvals": ["the branch approving itself"]}\n'
        },
    )
    assert "the branch approving itself" in (repo / APPROVALS).read_text(
        encoding="utf-8"
    )
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [BOTH]


def test_a_file_main_lacks_is_absent_from_the_context(
    tmp_path: Path, export: Path
) -> None:
    repo = make_repo(tmp_path / "repo", {APPROVALS: MAIN_APPROVALS})
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [{"content-approvals.json": MAIN_APPROVALS.encode()}]
    argv = built(fake)
    expected = digest(
        {"content-approvals.json": MAIN_APPROVALS.encode(), "resume-header.json": None}
    )
    assert argv[argv.index("--label") + 1] == f"org.h4reet.web.policy={expected}"


@pytest.mark.parametrize("files", [{}, None], ids=["main-without-the-files", "no-main"])
def test_no_policy_on_main_is_an_empty_context(
    tmp_path: Path,
    export: Path,
    files: dict[str, str] | None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Every content file then builds as a draft, and the PDF gets the room's header (resume-source.md §5).
    repo = make_repo(tmp_path / "repo", files)
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [{}]
    argv = built(fake)
    absent = digest({"content-approvals.json": None, "resume-header.json": None})
    assert argv[argv.index("--label") + 1] == f"org.h4reet.web.policy={absent}"
    assert "every content file builds as a draft" in capsys.readouterr().out


def test_the_context_is_private_and_removed_after_the_build(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    env, run = host_files(tmp_path, export)
    for rc in (0, 1):
        fake = FakeDocker(build_rc=rc)
        host("prod", env, run, fake, export, repo)
        (folder,) = fake.context_dirs
        assert not folder.exists()
        # Nowhere in the tree being built, which on a host stack is a read-only export.
        assert export not in folder.parents


def test_the_context_directory_is_0700(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    modes: list[int] = []

    class Recording(FakeDocker):
        def __call__(
            self, *args: str, capture: bool = True
        ) -> subprocess.CompletedProcess:
            spec = args[args.index("--build-context") + 1]
            modes.append(Path(spec.partition("=")[2]).stat().st_mode & 0o777)
            return super().__call__(*args, capture=capture)

    env, run = host_files(tmp_path, export)
    assert host("prod", env, run, Recording(), export, repo) == 0
    assert modes == [0o700]


def test_git_reads_main_without_replace_objects_or_the_callers_config(
    tmp_path: Path, export: Path, repo: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[list[str], dict[str, str]]] = []
    real = subprocess.run

    def spy(argv, *args, **kwargs):  # type: ignore[no-untyped-def]
        if argv and argv[0] == "git":
            seen.append((list(argv), dict(kwargs.get("env") or {})))
        return real(argv, *args, **kwargs)

    monkeypatch.setattr(wi.subprocess, "run", spy)
    monkeypatch.setenv("GIT_DIR", str(tmp_path / "elsewhere"))
    env, run = host_files(tmp_path, export)
    assert host("prod", env, run, FakeDocker(), export, repo) == 0
    # The branch's full ref, never a bare "main", which git would resolve to refs/tags/main before refs/heads/main.
    assert [a for a, _ in seen] == [
        ["git", "-C", str(repo), "cat-file", "blob", f"refs/heads/main:{APPROVALS}"],
        ["git", "-C", str(repo), "cat-file", "blob", f"refs/heads/main:{HEADER}"],
    ]
    for _, git_env in seen:
        assert git_env.get("GIT_NO_REPLACE_OBJECTS") == "1"
        assert "GIT_DIR" not in git_env


def test_a_tag_named_main_never_stands_in_for_the_branch(
    tmp_path: Path, export: Path
) -> None:
    # An agent session can write .git/refs/tags, and `git show main:<path>` would read a tag named main before the
    # branch. The tag here points at the feature branch, whose copy approves the branch's own content.
    repo = make_repo(
        tmp_path / "repo",
        {APPROVALS: MAIN_APPROVALS, HEADER: MAIN_HEADER},
        branch_files={
            APPROVALS: '{"schema": 1, "approvals": ["the tag approving itself"]}\n'
        },
    )
    git(repo, "tag", "main", "feature")
    assert "the tag approving itself" in git(
        repo, "show", f"main:{APPROVALS}"
    )  # what the old read would see
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [BOTH]


def test_a_tag_named_main_with_no_branch_main_approves_nothing(
    tmp_path: Path, export: Path
) -> None:
    repo = make_repo(tmp_path / "repo", None, branch_files={APPROVALS: MAIN_APPROVALS})
    git(repo, "tag", "main", "feature")
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [{}]


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
def test_dev_cpu_builds_the_working_tree_with_drafts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    docker_host: str,
    sandbox: str | None,
) -> None:
    monkeypatch.setenv("DOCKER_HOST", docker_host)
    if sandbox:
        monkeypatch.setenv("SANDBOX_RUNTIME", sandbox)
    repo = make_repo(
        tmp_path / "repo", {APPROVALS: MAIN_APPROVALS, HEADER: MAIN_HEADER}
    )
    fake = FakeDocker()
    args = ["--stack", "dev-cpu", "--env-file", str(DEV_CPU_VARS), "--repo", str(repo)]
    assert wi.main(args, fake, root=REPO) == 0
    argv = built(fake)
    assert fake.calls == [
        build_argv(
            REPO, "working-tree-drafts", PROXY, "1", context_of(argv), digest(BOTH)
        )
    ]
    assert fake.contexts == [BOTH]
    assert "h4reet-web:working-tree-drafts, built" in capsys.readouterr().out


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
    args = ["--stack", "dev-cpu", "--env-file", str(DEV_CPU_VARS), "--repo", str(REPO)]
    assert wi.main(args, fake, root=REPO) == 2
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
        "--repo",
        str(REPO),
    ]
    assert wi.main(args, fake, root=REPO) == 2
    assert fake.calls == []


# --------------------------------------------------------------------------------------------------
# What the build gets
# --------------------------------------------------------------------------------------------------
def test_the_env_file_is_read_as_data(tmp_path: Path, export: Path, repo: Path) -> None:
    env, run = host_files(tmp_path, export)
    env.write_text("H4_BUILD_PROXY='$(touch x)'\nH4_WEB_SUFFIX=\n", encoding="utf-8")
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    argv = built(fake)
    assert argv == build_argv(
        export, SHA, "$(touch x)", "", context_of(argv), digest(BOTH)
    )
    assert not (tmp_path / "x").exists()


def test_an_unreadable_env_file_builds_nothing(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    _, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", tmp_path / "missing.env", run, fake, export, repo) == 2
    assert fake.calls == []


def test_the_dockerfile_runs_no_git_and_takes_the_policy_from_its_named_context() -> (
    None
):
    # A host stack's context is a git archive export with no .git (.dockerignore drops it anyway). The policy stage
    # is the Dockerfile's own empty one unless the build names a context for it, so a build without one, such as
    # the gate's, gets an empty policy rather than an image pulled by that name.
    text = (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")
    instructions = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip() and not ln.lstrip().startswith("#")
    ]
    assert (
        "git" not in " ".join(ln for ln in instructions if ln.startswith("RUN")).split()
    )
    assert "FROM scratch AS policy" in instructions
    assert [ln for ln in instructions if "--from=policy" in ln]


def test_docker_gets_only_its_own_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in {
        "DOCKER_HOST": "tcp://198.18.0.1:2376",
        "HTTPS_PROXY": "http://user:pw@proxy.invalid:3128",
        "AWS_PROFILE": "someone",
        "H4_WEB_SUFFIX": "-drafts",
    }.items():
        monkeypatch.setenv(key, value)
    env = wi.docker_env()
    assert set(env) <= {*wi.DOCKER_ENV, "LC_ALL"}
    assert env["DOCKER_HOST"] == "tcp://198.18.0.1:2376"
    assert not {"HTTPS_PROXY", "AWS_PROFILE", "H4_WEB_SUFFIX"} & set(env)
