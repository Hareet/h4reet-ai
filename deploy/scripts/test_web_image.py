"""Tests for deploy/scripts/web_image.py: the room's image (spec 002, T001; contracts/web-serving.md §1).

The web image bakes in two things the gateway's doesn't: the drafts flag (ROOM_DRAFTS) and main's policy files as
they stood at build time. So, unlike gateway_image.py (tasks.md T184):
  - its tag carries the drafts flag, from the env file's H4_WEB_SUFFIX: h4reet-web:<ref> on prod, with no drafts,
    and h4reet-web:<ref>-drafts on dev and dev-cpu, with ROOM_DRAFTS=1; a prod build with drafts is refused;
  - it rebuilds on every make up and never reuses a tag, so a dev build never runs as prod's, and an approval on main
    reaches the next make up;
  - main's assets/policy/content-approvals.json, resume-header.json, and caps.json are read on the host with git
    cat-file, from the repository make names, and handed to the build as the named build context `policy`; a file
    main lacks is absent from it. The build stage reads only that and the tree's own assets/policy/caps.json, which
    the room takes where the context holds no caps.json (spec 004, T328): rule A9 holds it to main's, but on dev-cpu
    it is the working tree's, so that rests on main keeping caps.json. The build stage never runs git.
The rest is the gateway's rule: a host stack builds the export its run file names; dev-cpu builds the working tree on
the agents' engine only. deploy/compose.yaml names that image and never pulls it.

Spec 004's T005 (FR-053; research.md R-13; contracts/serving.md §3): caps.json joins the policy third, so the room's
compositor reads main's caps while main holds caps.json, and the image's label org.h4reet.web.policy digests the three
files in that order, as apps/web/build/approvals.ts's policyDigest does for room-data.json's built_from.

Spec 004's T215 (FR-013, FR-053, FR-079; Amendment B14; R-46; contracts/serving.md §3 and §8): the models come from
the tree it builds. --build-context room-assets=<tree>/assets/room is passed exactly when that path is a directory of
the tree's own, neither it nor assets/ a link, and the Dockerfile's empty room-assets stage gives every other build no
model, so each piece keeps its stand-in. The build stage copies the context to /src/assets/room/ before its RUN, and
the runtime stage still copies only dist/. .dockerignore leaves assets/policy out of every context but the caps, so
the build reads the approvals and the PDF's header only from the named policy context, and the install stage's copy of
the caps (T328) still finds its file.
"""

from __future__ import annotations

import hashlib
import importlib.util
import os
import re
import subprocess
import sys
from collections.abc import Callable
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
CAPS = "assets/policy/caps.json"
# The policy's names in the context, in the order its digest takes them (spec 004, R-13).
NAMES = ("content-approvals.json", "resume-header.json", "caps.json")
# Stand-ins for the Author's files, as main would hold them. Not real approvals: the digest is made here, at run time.
MAIN_APPROVALS = (
    '{"schema": 1, "approvals": [{"id": "C-0001", "sha256": "'
    + hashlib.sha256(b"a resume").hexdigest()
    + '"}]}\n'
)
MAIN_HEADER = '{"schema": 1, "full_name": null, "contact": null}\n'
MAIN_CAPS = '{"schema": 1, "per_asset": {}, "fixture": "made by the test"}\n'


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
    """The policy's digest, as the contract defines it: each file's name and SHA-256 (or "absent"), in order, over
    the three files; a name the dict lacks is absent."""
    text = "".join(
        f"{name}:{hashlib.sha256(data).hexdigest() if data is not None else 'absent'}\n"
        for name, data in ((n, files.get(n)) for n in NAMES)
    )
    return hashlib.sha256(text.encode()).hexdigest()


class FakeDocker:
    """docker buildx build, as the engine would answer it, keeping a copy of the policy context it was handed, and
    the room-assets and visitor-assets contexts' paths, or None where the build names one or the other not."""

    def __init__(self, build_rc: int = 0) -> None:
        self.build_rc = build_rc
        self.calls: list[tuple[str, ...]] = []
        self.contexts: list[dict[str, bytes]] = []
        self.context_dirs: list[Path] = []
        self.room_assets: list[str | None] = []
        self.visitor_assets: list[str | None] = []

    def __call__(self, *args: str, capture: bool = True) -> subprocess.CompletedProcess:
        self.calls.append(args)
        if args[:2] != ("buildx", "build"):
            raise AssertionError(args)
        named = [
            args[i + 1].partition("=")
            for i, a in enumerate(args)
            if a == "--build-context"
        ]
        names = [name for name, _, _ in named]
        assert names in (
            ["policy"],
            ["policy", "room-assets"],
            ["policy", "visitor-assets"],
            ["policy", "room-assets", "visitor-assets"],
        ), names
        where = {name: path for name, _, path in named}
        folder = Path(where["policy"])
        self.context_dirs.append(folder)
        self.contexts.append({p.name: p.read_bytes() for p in sorted(folder.iterdir())})
        self.room_assets.append(where.get("room-assets"))
        self.visitor_assets.append(where.get("visitor-assets"))
        return subprocess.CompletedProcess(args, self.build_rc, "", "")

    def builds(self) -> list[tuple[str, ...]]:
        return [c for c in self.calls if c[:2] == ("buildx", "build")]


def build_argv(
    tree: Path,
    tag: str,
    proxy: str,
    drafts: str,
    context: str,
    policy: str,
    room: Path | None = None,
    visitors: Path | None = None,
) -> tuple[str, ...]:
    """The one build the script may run: its own tree's Dockerfile and context, the proxy, the drafts flag, the
    policy context, the tree's models as the room-assets context where it has them (`room`), its visitor avatars'
    folder as the visitor-assets context where it has one (`visitors`, spec 009), and the policy's digest as a
    label."""
    models = ("--build-context", f"room-assets={room}") if room is not None else ()
    avatars = (
        ("--build-context", f"visitor-assets={visitors}") if visitors is not None else ()
    )
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
        *models,
        *avatars,
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
# main once the Author's caps commit (P-6) is on it: the three files.
ALL_THREE = BOTH | {"caps.json": MAIN_CAPS.encode()}


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


def test_the_policy_files_are_the_approvals_the_header_and_the_caps_in_order() -> None:
    # Spec 004, R-13: the caps join third, so the room's compositor reads main's caps from the same context.
    assert wi.POLICY_FILES == (
        (APPROVALS, "content-approvals.json"),
        (HEADER, "resume-header.json"),
        (CAPS, "caps.json"),
    )


def test_mains_caps_join_the_context_and_the_label_digests_the_three_in_order(
    tmp_path: Path, export: Path
) -> None:
    repo = make_repo(
        tmp_path / "repo",
        {APPROVALS: MAIN_APPROVALS, HEADER: MAIN_HEADER, CAPS: MAIN_CAPS},
    )
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [ALL_THREE]
    # The label is apps/web/build/approvals.ts's policyDigest over the same bytes: "<name>:<SHA-256>\n" for the
    # approvals, the header, then the caps, hashed once more.
    lines = "".join(f"{n}:{hashlib.sha256(ALL_THREE[n]).hexdigest()}\n" for n in NAMES)
    argv = built(fake)
    assert (
        argv[argv.index("--label") + 1]
        == f"org.h4reet.web.policy={hashlib.sha256(lines.encode()).hexdigest()}"
    )


def test_caps_main_lacks_are_absent_and_the_label_says_so(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    # Before the Author's caps commit (P-6), main has no caps.json: the context holds the other two, and the
    # compositor takes FR-053's starting figures (contracts/serving.md §3).
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [BOTH]
    lines = (
        f"content-approvals.json:{hashlib.sha256(MAIN_APPROVALS.encode()).hexdigest()}\n"
        f"resume-header.json:{hashlib.sha256(MAIN_HEADER.encode()).hexdigest()}\n"
        "caps.json:absent\n"
    )
    argv = built(fake)
    assert (
        argv[argv.index("--label") + 1]
        == f"org.h4reet.web.policy={hashlib.sha256(lines.encode()).hexdigest()}"
    )


def test_the_caps_are_mains_never_a_branchs_or_a_tags_named_main(
    tmp_path: Path, export: Path
) -> None:
    # A branch that could raise its own caps would make them the branch's, not the Author's (FR-053; R-13).
    raised = '{"schema": 1, "per_asset": {"room": "raised by the branch"}}\n'
    repo = make_repo(tmp_path / "repo", {CAPS: MAIN_CAPS}, branch_files={CAPS: raised})
    git(repo, "tag", "main", "feature")
    assert "raised by the branch" in git(repo, "show", f"main:{CAPS}")
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.contexts == [{"caps.json": MAIN_CAPS.encode()}]


def test_the_three_lists_name_the_policy_files_in_one_order() -> None:
    # R-13: POLICY_PATHS in apps/web/build/policy.ts, POLICY_FILES in apps/web/build/approvals.ts, and POLICY_FILES
    # here, so the image's label and room-data.json's built_from digest the same files in the same order.
    approvals_ts = (REPO / "apps/web/build/approvals.ts").read_text(encoding="utf-8")
    policy_ts = (REPO / "apps/web/build/policy.ts").read_text(encoding="utf-8")
    files = re.search(
        r"export const POLICY_FILES = \[(.*?)\] as const;", approvals_ts, re.DOTALL
    )
    paths = re.search(
        r"export const POLICY_PATHS = \[(.*?)\] as const;", policy_ts, re.DOTALL
    )
    assert files and paths
    assert tuple(re.findall(r'"([^"]+)"', files.group(1))) == NAMES
    pairs = tuple(re.findall(r'\[\s*"([^"]+)",\s*"([^"]+)",?\s*\]', paths.group(1)))
    assert pairs == wi.POLICY_FILES


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
        {
            "content-approvals.json": MAIN_APPROVALS.encode(),
            "resume-header.json": None,
            "caps.json": None,
        }
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
    absent = hashlib.sha256(
        b"content-approvals.json:absent\nresume-header.json:absent\ncaps.json:absent\n"
    ).hexdigest()
    assert absent == digest({})
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
        ["git", "-C", str(repo), "cat-file", "blob", f"refs/heads/main:{CAPS}"],
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
# Spec 004's models (T215; contracts/serving.md §3): the tree's own assets/room, as the named context
# room-assets, exactly when it is a directory of the tree, neither it nor assets/ a link
# --------------------------------------------------------------------------------------------------
def with_models(tree: Path) -> Path:
    """The tree's assets/room/, holding a model and its record, as an export of a commit with models holds them."""
    room = tree / "assets/room"
    room.mkdir(parents=True)
    (room / "fx-desk.glb").write_bytes(b"glTF made by the test")
    (room / "records.json").write_text('{"schema": 1}\n', encoding="utf-8")
    return room


@pytest.mark.parametrize(
    ("stack", "suffix", "drafts"), [("prod", "", ""), ("dev", "-drafts", "1")]
)
def test_the_models_come_from_the_export_it_builds(
    tmp_path: Path,
    export: Path,
    repo: Path,
    stack: str,
    suffix: str,
    drafts: str,
) -> None:
    # Only the policy comes from main: the models are the commit's own, each already through the arrival check.
    room = with_models(export)
    env, run = host_files(tmp_path, export, stack=stack, suffix=suffix)
    fake = FakeDocker()
    assert host(stack, env, run, fake, export, repo) == 0
    argv = built(fake)
    assert argv == build_argv(
        export, f"{SHA}{suffix}", "", drafts, context_of(argv), digest(BOTH), room=room
    )
    assert fake.room_assets == [str(room)]
    # The policy context and its label don't change for it.
    assert fake.contexts == [BOTH]


def test_a_tree_without_models_names_no_room_assets_context(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    # The Dockerfile's empty room-assets stage then stands in, and every piece builds as its stand-in (FR-013).
    (export / "assets/policy").mkdir(parents=True)
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    argv = built(fake)
    assert argv == build_argv(export, SHA, "", "", context_of(argv), digest(BOTH))
    assert fake.room_assets == [None]
    assert not [a for a in argv if "room-assets" in a]


def link_to_a_directory_outside(tree: Path, outside: Path) -> None:
    room = with_models(outside)
    (tree / "assets").mkdir()
    (tree / "assets/room").symlink_to(room, target_is_directory=True)


def link_to_a_directory_inside(tree: Path, outside: Path) -> None:
    room = with_models(tree / "elsewhere")
    (tree / "assets").mkdir()
    (tree / "assets/room").symlink_to(room, target_is_directory=True)


def assets_a_link(tree: Path, outside: Path) -> None:
    with_models(outside)
    (tree / "assets").symlink_to(outside / "assets", target_is_directory=True)


def room_a_file(tree: Path, outside: Path) -> None:
    (tree / "assets").mkdir()
    (tree / "assets/room").write_bytes(b"not a directory")


def room_a_dangling_link(tree: Path, outside: Path) -> None:
    (tree / "assets").mkdir()
    (tree / "assets/room").symlink_to(outside / "gone", target_is_directory=True)


@pytest.mark.parametrize(
    "make",
    [
        link_to_a_directory_outside,
        link_to_a_directory_inside,
        assets_a_link,
        room_a_file,
        room_a_dangling_link,
    ],
)
def test_assets_room_that_isnt_the_trees_own_directory_names_no_context(
    tmp_path: Path,
    export: Path,
    repo: Path,
    make: Callable[[Path, Path], None],
) -> None:
    # A link would hand the build a directory the commit doesn't hold, wherever it points; rule A3 refuses a link
    # inside an asset directory, and this refuses one in place of the directory itself, or of assets/.
    outside = tmp_path / "outside"
    outside.mkdir()
    make(export, outside)
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    argv = built(fake)
    assert argv == build_argv(export, SHA, "", "", context_of(argv), digest(BOTH))
    assert fake.room_assets == [None]


def test_the_build_gets_no_other_flag_for_the_models(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    # No --ssh, --secret, cache import or export, --allow, --network, or --add-host, with models or without.
    for tree in (export, tmp_path / "with-models"):
        if tree != export:
            (tree / "apps/web").mkdir(parents=True)
            (tree / "apps/web/Dockerfile").write_text(
                "FROM scratch\n", encoding="utf-8"
            )
            with_models(tree)
        env, run = host_files(tmp_path, tree)
        fake = FakeDocker()
        assert host("prod", env, run, fake, tree, repo) == 0
        flags = [a.partition("=")[0] for a in built(fake) if a.startswith("--")]
        assert set(flags) <= {
            "--load",
            "--file",
            "--tag",
            "--build-arg",
            "--build-context",
            "--label",
        }, flags


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
    # The working tree holds the room's models, under assets/room/ (spec 004, T234), so they go with the build.
    room = REPO / "assets/room"
    assert room.is_dir() and not room.is_symlink() and not room.parent.is_symlink()
    # And its visitor avatars' folder, under assets/visitors/ (spec 009, FR-023), whatever avatars it holds yet.
    visitors = REPO / "assets/visitors"
    assert visitors.is_dir() and not visitors.is_symlink()
    assert fake.calls == [
        build_argv(
            REPO,
            "working-tree-drafts",
            PROXY,
            "1",
            context_of(argv),
            digest(BOTH),
            room=room,
            visitors=visitors,
        )
    ]
    assert fake.contexts == [BOTH]
    assert fake.room_assets == [str(room)]
    assert fake.visitor_assets == [str(visitors)]
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
    # The build runs with --ignore-scripts, so a checkout's prebuild (build/policy.ts, which runs git show main:)
    # never runs in the image, and ROOM_POLICY_DIR names the context's copy (T017).
    (build,) = [
        ln
        for ln in instructions
        if ln.startswith("RUN ") and " build -w apps/web" in ln
    ]
    assert "npm run --ignore-scripts build -w apps/web" in build
    assert "ROOM_POLICY_DIR=/src/policy" in build


def test_the_build_stage_has_the_corpus_the_resume_cites_and_never_the_private_intake() -> (
    None
):
    # The resume's citation check (spec 002, T026) runs in the room's build: it reads corpus/*.md and
    # corpus/facts/*.yaml, so the build stage copies the corpus before it builds. .dockerignore keeps
    # corpus/intake/private, the Author's denylist and uncleared sources, out of every build context.
    text = (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")
    instructions = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip() and not ln.lstrip().startswith("#")
    ]
    copy = instructions.index("COPY corpus corpus")
    (build,) = [
        i
        for i, ln in enumerate(instructions)
        if ln.startswith("RUN ") and " build -w apps/web" in ln
    ]
    assert copy < build
    ignore = (REPO / ".dockerignore").read_text(encoding="utf-8").splitlines()
    assert "corpus/intake/private" in ignore


def test_the_builds_have_the_trees_caps_and_no_other_policy_file() -> None:
    # A build that names no policy context, the gate's image step and the Author's phone copy, gets the Dockerfile's
    # empty policy stage, so the room's compositor takes its caps from the tree it builds (spec 004, T327; its
    # contracts/room-bundle.md §2): assets/policy/caps.json, which spec 003's rule A9 keeps equal to main's at the
    # commit's base. The caps alone: the approvals and the PDF's header come from the policy context or not at all, so
    # nothing is approved without it. The install stage copies the file before either build runs.
    text = (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")
    instructions = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip() and not ln.lstrip().startswith("#")
    ]
    caps = "COPY assets/policy/caps.json assets/policy/caps.json"
    copy = instructions.index(caps)
    builds = [
        i
        for i, ln in enumerate(instructions)
        if ln.startswith("RUN ")
        and (" build -w apps/web" in ln or " build:lookdev-phone -w apps/web" in ln)
    ]
    assert len(builds) == 2
    assert all(copy < i for i in builds)
    # Of the files the build context gives (a COPY or ADD with no --from), the caps are the only one under assets/.
    # The models come from the named room-assets stage instead (T219), never from the context's assets/room, and the
    # visitor avatars from the visitor-assets stage (spec 009, FR-023).
    assert [
        ln
        for ln in instructions
        if ln.startswith(("COPY ", "ADD ")) and "--from=" not in ln and "assets/" in ln
    ] == [caps]
    assert [
        ln
        for ln in instructions
        if ln.startswith(("COPY ", "ADD ")) and "assets/" in ln and ln != caps
    ] == [ROOM_ASSETS_COPY, VISITOR_ASSETS_COPY]


# --------------------------------------------------------------------------------------------------
# Spec 004's room-assets stage (T219; contracts/serving.md §3): the models web_image.py hands over, or none
# --------------------------------------------------------------------------------------------------
ROOM_ASSETS_COPY = "COPY --from=room-assets / /src/assets/room/"


def test_the_room_assets_stage_is_empty_and_beside_the_policy_stage() -> None:
    # web_image.py replaces the stage with the named context when the tree has models; a build that names none, such
    # as the gate's image step, gets the empty stage, so nothing is pulled under that name and every piece builds as
    # its stand-in.
    stages = dockerfile_stages()
    names = [name for _, name, _ in stages]
    at = names.index("room-assets")
    assert names[at - 1] == "policy"
    assert stages[at] == ("scratch", "room-assets", [])
    text = (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")
    comment = (
        "# ---- room-assets: the tree's assets/room, as web_image.py hands it over ----\n"
        "# web_image.py replaces this stage with the named build context `room-assets` when the tree has models. A "
        "build that\n"
        "# names none, such as the gate's image step, gets this empty stage, and every piece builds as its stand-in.\n"
        "FROM scratch AS room-assets\n"
    )
    assert comment in text


def test_the_build_stage_copies_the_models_before_it_builds() -> None:
    # The compositor reads the models from /src/assets/room/, the repository-relative assets/room/ it reads in a
    # checkout, and writes their .gz copies into dist/a/.
    by_name = {name: body for _, name, body in dockerfile_stages() if name}
    build = by_name["build"]
    (run,) = [
        i
        for i, ln in enumerate(build)
        if ln.startswith("RUN ") and " build -w apps/web" in ln
    ]
    assert ROOM_ASSETS_COPY in build
    assert build.index(ROOM_ASSETS_COPY) < run


def test_only_the_build_stage_reads_the_models() -> None:
    # The phone copy holds no model (contracts/lookdev.md), and the runtime stage copies only dist/: no plain model,
    # record, or license file reaches nginx's root.
    stages = dockerfile_stages()
    readers = [
        name or image
        for image, name, body in stages
        if image.lower() == "room-assets"
        or any(
            copied_from(ln) == "room-assets" or "room-assets" in mounted_from(ln)
            for ln in body
        )
    ]
    assert readers == ["build"]
    image, _, body = stages[-1]
    assert image.startswith("ghcr.io/nginx/nginx-unprivileged:")
    assert [ln for ln in body if copied_from(ln)] == [
        "COPY --from=build /src/apps/web/dist /usr/share/nginx/html"
    ]


# --------------------------------------------------------------------------------------------------
# .dockerignore (T219; contracts/serving.md §3): assets/policy out of every context, but the caps
# --------------------------------------------------------------------------------------------------
def ignore_regex(pattern: str) -> re.Pattern[str]:
    """A .dockerignore pattern as Docker reads it (moby/patternmatcher): `**` any number of directories, `*` and `?`
    within one, `[...]` a class."""
    out, i = [], 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        elif pattern[i] == "[":
            end = pattern.index("]", i)
            out.append(pattern[i : end + 1])
            i = end + 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("".join(out))


def dockerignored(path: str) -> bool:
    """Whether the root .dockerignore leaves `path` out of a build context: the last pattern that matches it, or a
    directory above it, decides, a `!` pattern putting it back."""
    lines = (REPO / ".dockerignore").read_text(encoding="utf-8").splitlines()
    parts = path.split("/")
    ignored = False
    for line in lines:
        pattern = line.strip()
        if not pattern or pattern.startswith("#"):
            continue
        keep = pattern.startswith("!")
        regex = ignore_regex(pattern.removeprefix("!").strip("/"))
        if any(regex.fullmatch("/".join(parts[:n])) for n in range(1, len(parts) + 1)):
            ignored = not keep
    return ignored


def test_the_matcher_reads_dockerignore_as_docker_does() -> None:
    # The file's own patterns: a root-only name, a **/ pattern at any depth, a class, and the caps' exception.
    assert dockerignored(".git/config")
    assert not dockerignored("apps/.git")
    assert dockerignored("apps/web/node_modules/three/package.json")
    assert dockerignored("deploy/scripts/web_image.pyc")
    assert not dockerignored("deploy/scripts/web_image.py")
    assert dockerignored("apps/web/dist-phone/lookdev.html")


def test_the_policy_reaches_the_build_only_through_its_named_context() -> None:
    # The approvals and the PDF's header never enter a context from the tree: the build reads them from the policy
    # context, main's, or not at all. The caps are the exception, which the install stage copies (T328).
    ignore = (REPO / ".dockerignore").read_text(encoding="utf-8").splitlines()
    assert "assets/policy" in ignore
    assert "!assets/policy/caps.json" in ignore
    assert ignore.index("assets/policy") < ignore.index("!assets/policy/caps.json")
    for name in (
        "content-approvals.json",
        "resume-header.json",
        "approvals.json",
        "anything-else.json",
    ):
        assert dockerignored(f"assets/policy/{name}"), name
    assert not dockerignored("assets/policy/caps.json")


def test_every_file_the_dockerfile_copies_from_the_context_is_in_it() -> None:
    # A COPY whose source .dockerignore leaves out fails the build: the caps' copy among them.
    sources = []
    for _, _, body in dockerfile_stages():
        for ln in body:
            words = ln.split()
            if words[0].upper() in ("COPY", "ADD") and not copied_from(ln):
                sources += [w for w in words[1:-1] if not w.startswith("--")]
    assert "assets/policy/caps.json" in sources
    assert [s for s in sources if dockerignored(s.rstrip("/"))] == []


def test_the_pdfs_text_file_stays_in_the_build_stage() -> None:
    # dist/resume.pdf.txt is the PDF's text, for the gate's scan of dist/ (contracts/resume-source.md §4). Once
    # resume-header.json is filled it holds the full name and contact as crawlable plain text, so the build stage
    # removes it in the same RUN that builds, before the runtime stage copies dist/; nginx refuses it as well.
    text = (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")
    logical: list[str] = []
    pending = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        pending = f"{pending} {line}".strip()
        if pending.endswith("\\"):
            pending = pending[:-1]
            continue
        logical.append(pending)
        pending = ""
    (build,) = [
        i for i in logical if i.startswith("RUN ") and " build -w apps/web" in i
    ]
    assert "rm -f apps/web/dist/*.pdf.txt" in build
    assert build.index(" build -w apps/web") < build.index(
        "rm -f apps/web/dist/*.pdf.txt"
    )
    (copy,) = [i for i in logical if i.startswith("COPY --from=build ")]
    assert copy.split()[2] == "/src/apps/web/dist"
    assert logical.index(build) < logical.index(copy)


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


# --------------------------------------------------------------------------------------------------
# Spec 004's lookdev-phone target (T129; FR-066, FR-069; contracts/lookdev.md §7.1, §8 layer 5):
# the Author builds the phone's copy of the lookdev page with it, from a git archive export, and no
# image ever holds the copy
# --------------------------------------------------------------------------------------------------
LOOKDEV_PHONE = "lookdev-phone"


def dockerfile_stages(text: str | None = None) -> list[tuple[str, str, list[str]]]:
    """apps/web/Dockerfile's stages in order, or those of `text`: each FROM's image, the stage's name in lower case
    ("" for none), and its other instructions as logical lines, continuations joined and comments dropped."""
    if text is None:
        text = (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")
    logical: list[str] = []
    pending = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        pending = f"{pending} {line}".strip()
        if pending.endswith("\\"):
            pending = pending[:-1]
            continue
        logical.append(pending)
        pending = ""
    stages: list[tuple[str, str, list[str]]] = []
    for line in logical:
        word, _, rest = line.partition(" ")
        if word.upper() == "FROM":
            tokens = [t for t in rest.split() if not t.startswith("--")]
            named = len(tokens) >= 3 and tokens[1].upper() == "AS"
            stages.append((tokens[0], tokens[2].lower() if named else "", []))
        else:
            assert stages, f"{line}: an instruction before the first FROM"
            stages[-1][2].append(line)
    return stages


def copied_from(line: str) -> str | None:
    """The stage a COPY or ADD line copies from, in lower case, or None."""
    for token in line.split():
        if token.startswith("--from="):
            return token.removeprefix("--from=").lower()
    return None


def mounted_from(line: str) -> set[str]:
    """The stages a RUN line's --mount options read from, in lower case: each spec's from= key, wherever it stands
    among the comma-separated keys, quoted or not."""
    word, _, _ = line.partition(" ")
    if word.upper() != "RUN":
        return set()
    found: set[str] = set()
    for token in line.split():
        if not token.lower().startswith("--mount="):
            continue
        for field in token.partition("=")[2].split(","):
            key, _, value = field.strip("\"'").partition("=")
            if key.strip().lower() == "from":
                found.add(value.strip("\"'").lower())
    return found


def lookdev_phone_stages() -> tuple[str, list[str], str, list[str]]:
    """The target's stage and the stage it copies lookdev.html from: each one's image and instructions."""
    by_name = {name: (image, body) for image, name, body in dockerfile_stages() if name}
    image, body = by_name[LOOKDEV_PHONE]
    (copy,) = body
    source = copied_from(copy)
    assert source is not None and source in by_name, copy
    return image, body, by_name[source][0], by_name[source][1]


def test_the_lookdev_phone_target_sits_before_the_runtime_stage_which_stays_last() -> (
    None
):
    # Docker builds the last stage when no --target is named, and web_image.py names none, so every image it
    # builds is the runtime's; the drafts-only target is built only by name, by the Author (lookdev.md §7.3).
    stages = dockerfile_stages()
    names = [name for _, name, _ in stages]
    assert LOOKDEV_PHONE in names
    assert names.index(LOOKDEV_PHONE) < len(stages) - 1
    image, _, body = stages[-1]
    assert image.startswith("ghcr.io/nginx/nginx-unprivileged:")
    # The runtime stage copies the built site, dist/, and nothing else from another stage.
    assert [ln for ln in body if copied_from(ln)] == [
        "COPY --from=build /src/apps/web/dist /usr/share/nginx/html"
    ]


def test_the_lookdev_phone_target_holds_only_lookdev_html_from_scratch() -> None:
    image, body, _, _ = lookdev_phone_stages()
    assert image == "scratch"
    ((verb, source, *paths),) = [ln.split() for ln in body]
    assert verb == "COPY" and source.startswith("--from=")
    assert paths == ["/src/apps/web/dist-phone/lookdev.html", "/lookdev.html"]


def test_the_copy_is_built_with_drafts_on_the_build_stages_install() -> None:
    # The stage that builds the copy runs on the same installed workspace as the site's build stage, and runs only
    # the npm script, with drafts on and the policy the named context gives (empty when the build names none).
    _, _, base, body = lookdev_phone_stages()
    by_name = {
        name: (image, steps) for image, name, steps in dockerfile_stages() if name
    }
    assert base == by_name["build"][0]
    assert base in by_name
    assert any(ln.startswith("RUN npm ci ") for ln in by_name[base][1])
    run = (
        "RUN ROOM_DRAFTS=1 ROOM_POLICY_DIR=/src/policy npm run --ignore-scripts "
        "build:lookdev-phone -w apps/web"
    )
    assert body == [run]
    assert "git" not in run.split()


def stages_reading_the_copy(stages: list[tuple[str, str, list[str]]]) -> list[str]:
    """Each stage but the lookdev-phone target and the stage it copies lookdev.html from that builds on either or
    reads their files, through COPY --from or RUN --mount, by its name (its image where it has none)."""
    by_name = {name: body for _, name, body in stages if name}
    (copy,) = by_name[LOOKDEV_PHONE]
    phone = {LOOKDEV_PHONE, copied_from(copy)}
    return [
        name or image
        for image, name, steps in stages
        if name not in phone
        and (
            image.lower() in phone
            or any(copied_from(ln) in phone or mounted_from(ln) & phone for ln in steps)
        )
    ]


def test_no_other_stage_copies_from_the_lookdev_phone_target() -> None:
    assert stages_reading_the_copy(dockerfile_stages()) == []


def test_a_run_mount_from_the_phone_copys_stages_reads_them_too() -> None:
    # The review's phone-5: a RUN --mount from either stage, in the build stage, would put the drafts copy into
    # dist/ and the runtime image as surely as a COPY --from would.
    text = (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")
    for spec in (
        "type=bind,from=lookdev-phone-build,source=/src/apps/web/dist-phone,target=/p",
        "type=bind,source=/,from=lookdev-phone,target=/p",
        "type=cache,target=/p,from=LOOKDEV-PHONE-BUILD",
        '"type=bind,from=lookdev-phone-build,target=/p"',
    ):
        mount = f"RUN --mount={spec} cp /p/lookdev.html apps/web/dist/"
        edited = text.replace(
            "FROM install AS build\n", f"FROM install AS build\n{mount}\n", 1
        )
        assert edited != text
        assert stages_reading_the_copy(dockerfile_stages(edited)) == ["build"], spec


def test_the_phone_copy_stays_out_of_every_build_context_and_commit() -> None:
    # npm run build:lookdev-phone writes apps/web/dist-phone/, outside dist/: .dockerignore keeps a working tree's
    # copy out of every build context, so the runtime stage, which copies only dist/, never sees one, and .gitignore
    # keeps it out of every commit (lookdev.md §8, layer 5).
    ignore = (REPO / ".dockerignore").read_text(encoding="utf-8").splitlines()
    assert "**/dist-phone" in ignore
    gitignore = (REPO / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "apps/web/dist-phone/" in gitignore


def test_web_image_names_no_target(tmp_path: Path, export: Path, repo: Path) -> None:
    for stack, suffix in (("prod", ""), ("dev", "-drafts")):
        env, run = host_files(tmp_path, export, stack=stack, suffix=suffix)
        fake = FakeDocker()
        assert host(stack, env, run, fake, export, repo) == 0
        assert not [a for a in built(fake) if a.startswith("--target")], stack


# --------------------------------------------------------------------------------------------------
# Spec 009's avatars (FR-023; plan.md R-15; Amendment M19): the tree's own assets/visitors, as the named context
# visitor-assets, exactly when it is a directory of the tree, neither it nor assets/ a link
# --------------------------------------------------------------------------------------------------
VISITOR_ASSETS_COPY = "COPY --from=visitor-assets / /src/assets/visitors/"


def with_visitors(tree: Path) -> Path:
    """The tree's assets/visitors/, holding an avatar's folder with its model and record, as the intake lays it out."""
    visitors = tree / "assets/visitors"
    (visitors / "woman").mkdir(parents=True)
    (visitors / "woman/woman.glb").write_bytes(b"glTF made by the test")
    (visitors / "woman/records.json").write_text('{"schema": 1}\n', encoding="utf-8")
    return visitors


def test_the_avatars_come_from_the_export_it_builds(
    tmp_path: Path, export: Path, repo: Path
) -> None:
    visitors = with_visitors(export)
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    argv = built(fake)
    assert argv == build_argv(
        export, SHA, "", "", context_of(argv), digest(BOTH), visitors=visitors
    )
    assert fake.visitor_assets == [str(visitors)]
    assert fake.room_assets == [None]
    # With the room's models too: both named contexts, room-assets first.
    room = with_models(export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    argv = built(fake)
    assert argv == build_argv(
        export, SHA, "", "", context_of(argv), digest(BOTH), room=room, visitors=visitors
    )


def visitors_a_link(tree: Path, outside: Path) -> None:
    visitors = with_visitors(outside)
    (tree / "assets").mkdir()
    (tree / "assets/visitors").symlink_to(visitors, target_is_directory=True)


def visitors_under_assets_a_link(tree: Path, outside: Path) -> None:
    with_visitors(outside)
    (tree / "assets").symlink_to(outside / "assets", target_is_directory=True)


def visitors_a_file(tree: Path, outside: Path) -> None:
    (tree / "assets").mkdir()
    (tree / "assets/visitors").write_bytes(b"not a directory")


@pytest.mark.parametrize(
    "make", [visitors_a_link, visitors_under_assets_a_link, visitors_a_file]
)
def test_assets_visitors_that_isnt_the_trees_own_directory_names_no_context(
    tmp_path: Path,
    export: Path,
    repo: Path,
    make: Callable[[Path, Path], None],
) -> None:
    # As for room-assets: a link would hand the build a directory the commit doesn't hold.
    outside = tmp_path / "outside"
    outside.mkdir()
    make(export, outside)
    env, run = host_files(tmp_path, export)
    fake = FakeDocker()
    assert host("prod", env, run, fake, export, repo) == 0
    assert fake.visitor_assets == [None]
    assert not [a for a in built(fake) if "visitor-assets" in a]


def test_the_visitor_assets_stage_is_empty_and_beside_the_room_assets_stage() -> None:
    # A build that names no visitor-assets context, such as the gate's image step, gets the empty stage, and both
    # figures show their fallbacks.
    stages = dockerfile_stages()
    names = [name for _, name, _ in stages]
    at = names.index("visitor-assets")
    assert names[at - 1] == "room-assets"
    assert stages[at] == ("scratch", "visitor-assets", [])


def test_the_build_stage_copies_the_avatars_before_it_builds_and_nothing_else_reads_them() -> None:
    by_name = {name: body for _, name, body in dockerfile_stages() if name}
    build = by_name["build"]
    (run,) = [
        i
        for i, ln in enumerate(build)
        if ln.startswith("RUN ") and " build -w apps/web" in ln
    ]
    assert VISITOR_ASSETS_COPY in build
    assert build.index(VISITOR_ASSETS_COPY) < run
    readers = [
        name or image
        for image, name, body in dockerfile_stages()
        if image.lower() == "visitor-assets"
        or any(
            copied_from(ln) == "visitor-assets" or "visitor-assets" in mounted_from(ln)
            for ln in body
        )
    ]
    assert readers == ["build"]
