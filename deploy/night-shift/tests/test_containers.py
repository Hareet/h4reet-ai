"""The night shift's container specs, images, and allowlists (spec 017: FR-010 to FR-016, FR-038, FR-041;
plan.md §1, §2; contracts/containers.md 1 to 12; tasks.md T030, T031).

No Docker, no network: every claim here is about files. The Author's probe and rehearsal prove the containers.

A spec holds its role's own mounts. The runner adds the task's: the worktree, `.git`, the masks, the role's Claude
folder, and the io folder (contracts/runner.md §3). The lattice and never-mounted tests count those as the role's,
built here as the runner builds them, with the masks computed from `refs/heads/main:.claude/settings.json`'s
denyWrite. The tests use a committed fixture copy of main's settings, and some read the real main copy when this
checkout can (they skip in an export without `.git`).
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath

import pytest

NIGHT = Path(__file__).resolve().parents[1]  # deploy/night-shift
REPO_ROOT = NIGHT.parents[1]
CONTAINERS = NIGHT / "containers"
IMAGES = NIGHT / "images"
BUILD = CONTAINERS / "build.py"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "main-settings.json"

SESSION_ROLES = [
    "supervisor",
    "spec-writer",
    "implementer",
    "reviewer",
    "red-teamer",
    "ops",
    "gate-runner",
    "studio",
]
RUNNER_ONLY = ["plan", "comfyui"]
ALL_SPECS = SESSION_ROLES + RUNNER_ONLY
WORKER_ROLES = [r for r in SESSION_ROLES if r != "studio"]
# What the runner mounts for each role's task (contracts/containers.md §4, contracts/runner.md §3).
TASK = {
    "supervisor": "writing",
    "spec-writer": "writing",
    "implementer": "writing",
    "ops": "writing",
    "reviewer": "reading",
    "red-teamer": "reading",
    "gate-runner": "reading",
    "studio": "none",
    "plan": "plan",
    "comfyui": "none",
}
WRITING = {r for r, t in TASK.items() if t == "writing"}
GPU = {"studio", "comfyui"}
ENGINE_ROLES = {
    "implementer",
    "ops",
    "red-teamer",
}  # the roles that run containers on the agents' engine

# plan.md §2's lattice. The ceiling isn't a file: it is the union of every session spec.
LATTICE = {
    "supervisor": "ceiling",
    "ops": "ceiling",
    "implementer": "ops",
    "spec-writer": "implementer",
    "reviewer": "spec-writer",
    "red-teamer": "implementer",
    "gate-runner": "ceiling",
    "studio": "ceiling",
}

PLACEHOLDERS = {
    "UID",
    "GID",
    "HOME",
    "REPO",
    "NIGHT_ROOT",
    "COMFYUI_DIR",
    "COMFYUI_VENV",
    "COMFYUI_PORT",
    "BLENDER_DIR",
    "ENGINE_CERTS",
    "IMAGE_TAG",
}

INTERNAL = {"h4-night", "h4-night-engine", "h4-night-studio", "h4-night-plan"}
PROXY_FOR = {
    "h4-night": "egress",
    "h4-night-studio": "egress-studio",
    "h4-night-plan": "egress-plan",
}
TOKEN_FILE = "{{HOME}}/.config/h4reet-ai/night-shift/claude.env"
# Container paths a spec's mount may not take (contracts/runner.md §3): the runner's own, and the system's.
RESERVED = [
    "/",
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib64",
    "/proc",
    "/sys",
    "/dev",
    "/night/claude",
    "/night/io",
]

# FR-041 and contracts/containers.md §5: never in a spec's environment, and the token only by env_file.
FORBIDDEN_ENV = {
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "CLAUDE_CODE_OAUTH_TOKEN",
}
REQUIRED_ENV = {
    "SANDBOX_RUNTIME": "1",
    "DISABLE_AUTOUPDATER": "1",
    "DISABLE_TELEMETRY": "1",
    "DISABLE_ERROR_REPORTING": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CONFIG_DIR": "/night/claude",
    "HOME": "/night/home",
}
MANAGED = {
    "forceLoginMethod": "claudeai",
    "env": {"ANTHROPIC_API_KEY": "", "ANTHROPIC_AUTH_TOKEN": ""},
}

# The machine facts the tests resolve paths with (data-model.md's shapes, a made-up user).
FACTS = {
    "UID": "1000",
    "GID": "1000",
    "HOME": "/home/author",
    "REPO": "/home/author/h4reet-ai/h4reet-ai",
    "NIGHT_ROOT": "/home/author/h4reet-ai/night",
    "COMFYUI_DIR": "/home/author/ComfyUI",
    "COMFYUI_VENV": "/home/author/flux-env",
    "COMFYUI_PORT": "8188",
    "BLENDER_DIR": "/home/author/blender-5.2.3-linux-x64",
    "ENGINE_CERTS": "/home/author/.config/h4reet/agents-engine/docker",
    "IMAGE_TAG": "0123456789ab",
}
HOME = FACTS["HOME"]
REPO = FACTS["REPO"]
GIT = f"{REPO}/.git"
WT = f"{FACTS['NIGHT_ROOT']}/2026-11-14/t-01"  # the runner's worktrees: <NIGHT_ROOT>/<date>/<task>


def fill(text: str) -> str:
    for key, value in FACTS.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def load(name: str) -> dict:
    path = CONTAINERS / f"{name}.json"
    assert path.is_file(), f"{path} is missing (contracts/containers.md §1)"
    return json.loads(path.read_text(encoding="utf-8"))


def filled(name: str) -> dict:
    """The spec as the install fills it: placeholders replaced, x-h4 dropped."""
    spec = json.loads(fill((CONTAINERS / f"{name}.json").read_text(encoding="utf-8")))
    spec.pop("x-h4", None)
    return spec


@pytest.fixture(scope="module")
def specs() -> dict[str, dict]:
    return {name: load(name) for name in ALL_SPECS}


def fixture_settings() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def git_env() -> dict[str, str]:
    env = dict(os.environ)
    env.update(
        GIT_NO_REPLACE_OBJECTS="1",
        GIT_CONFIG_NOSYSTEM="1",
        GIT_CONFIG_GLOBAL="/dev/null",
    )
    return env


def main_blob(path: str) -> bytes | None:
    """`refs/heads/main:<path>` from this checkout's repository, or None (an export, or no main)."""
    if shutil.which("git") is None:
        return None
    done = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "cat-file", "blob", f"refs/heads/main:{path}"],
        capture_output=True,
        env=git_env(),
        check=False,
    )
    return done.stdout if done.returncode == 0 and done.stdout else None


# ---------------------------------------------------------------------------------------------------------------
# Paths, and the runner's task mounts
# ---------------------------------------------------------------------------------------------------------------
def under(path: str, base: str) -> bool:
    """`path` is `base` or inside it, by whole components."""
    p, b = PurePosixPath(path), PurePosixPath(base)
    return p == b or b in p.parents


def ancestor(path: str, of: str) -> bool:
    """`path` is a proper ancestor of `of`."""
    return PurePosixPath(path) in PurePosixPath(of).parents


RANK = {None: 0, "ro": 1, "rw": 2}

# contracts/containers.md §4 (FR-012): `.git` is read-only; a writing task's own parts of it are read-write.
OWN_GIT = [
    "objects",
    "worktrees/t-01",
    "refs/heads/night/t-01",
    "logs/refs/heads/night/t-01",
]
# What must stay read-only in `.git` whatever the role: under the read-only `.git`, or masked where an own part
# would cover it.
PROTECTED_GIT = [
    "",
    "commondir",
    "hooks",
    "config",
    "info",
    "packed-refs",
    "refs/heads/main",
    "refs/heads/other",
    "refs/tags",
    "refs/replace",
    "objects/info",
    "HEAD",
    "index",
    "worktrees/t-01/commondir",
    "worktrees/t-02",
    "logs/HEAD",
]


def denied_paths(settings: dict) -> list[str]:
    """Each `./` path of main's denyWrite: `./.git/…` in the repository's `.git`, any other in the worktree."""
    out = []
    for entry in settings["sandbox"]["filesystem"]["denyWrite"]:
        if not entry.startswith("./"):
            continue  # outside the worktree: the never-mounted list's
        rel = os.path.normpath(entry[2:])
        if rel in (".", ".git") or rel.startswith(".."):
            continue
        p = f"{GIT}/{rel[5:]}" if rel.startswith(".git/") else f"{WT}/{rel}"
        if p not in out:
            out.append(p)
    return out


# Paths main's denyWrite names that a fresh worktree of main doesn't hold (G2's integration review). Docker would
# make a mask's missing source as root, so the runner masks none of them; a session can create them on its branch, and
# the runner's merge-time refusal (contracts/runner.md §6) is what keeps them, and any change made through the index
# and objects, off a named stack. Read from main's tree when this checkout can; this list otherwise.
ABSENT_IN_A_FRESH_WORKTREE = [
    "makefile",
    ".mcp.json",
    ".gitleaksignore",
    ".github/workflows",
    "deploy/env",
]


def main_tree() -> set[str] | None:
    """Every file and folder in refs/heads/main's tree, or None (an export, or no main)."""
    if shutil.which("git") is None:
        return None
    done = subprocess.run(
        [
            "git",
            "-C",
            str(REPO_ROOT),
            "ls-tree",
            "-r",
            "-z",
            "--name-only",
            "refs/heads/main",
        ],
        capture_output=True,
        env=git_env(),
        check=False,
    )
    if done.returncode != 0 or not done.stdout:
        return None
    files = {f for f in done.stdout.decode().split("\0") if f}
    dirs = {
        str(PurePosixPath(*PurePosixPath(f).parts[:i]))
        for f in files
        for i in range(1, len(PurePosixPath(f).parts))
    }
    return files | dirs


def absent(settings: dict) -> set[str]:
    """The worktree's denied paths (resolved) that a fresh worktree doesn't hold."""
    tree = main_tree()
    out = set()
    for p in denied_paths(settings):
        if not under(p, WT):
            continue
        rel = p[len(WT) + 1 :]
        if (
            (rel not in tree)
            if tree is not None
            else (rel in ABSENT_IN_A_FRESH_WORKTREE)
        ):
            out.add(p)
    return out


def expected_masks(settings: dict) -> list[str]:
    """The read-only binds a writing task needs: only where a read-write mount would otherwise cover a path, and
    only for paths that exist (contracts/containers.md §4)."""
    out = [f"{GIT}/objects/info", f"{GIT}/worktrees/t-01/commondir"]
    gone = absent(settings)
    return out + [p for p in denied_paths(settings) if under(p, WT) and p not in gone]


def night_runner():
    """The runner itself, loaded by path, so these tests call its real checks rather than copies of them."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "night_runner", NIGHT / "runner" / "night.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["night_runner"] = mod
    spec.loader.exec_module(mod)
    return mod


HOOK_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "protected-paths.sh.txt"


def protected(settings: dict) -> list[str]:
    return [f"{GIT}/{p}".rstrip("/") for p in PROTECTED_GIT] + denied_paths(settings)


def task_mounts(role: str, settings: dict) -> list[dict]:
    """The runner's own mounts for a role's task, resolved."""
    kind = TASK[role]
    out: list[tuple[str, str, str]] = []
    if kind == "writing":
        out += [(WT, WT, "rw"), (GIT, GIT, "ro")]
        out += [(f"{GIT}/{p}", f"{GIT}/{p}", "rw") for p in OWN_GIT]
        out += [(p, p, "ro") for p in expected_masks(settings)]
    elif kind == "reading":
        out += [(WT, WT, "ro"), (GIT, GIT, "ro")]
    elif kind == "plan":
        out += [(WT, WT, "ro")]
    if role in SESSION_ROLES:
        # Each role's own Claude folder (claude/<role>): one slot, which the lattice compares as the same.
        out += [
            (
                f"{HOME}/.local/share/h4reet-ai/night-shift/claude/the-role",
                "/night/claude",
                "rw",
            ),
            (f"{FACTS['NIGHT_ROOT']}/.io/t-01", "/night/io", "rw"),
        ]
    return [{"host": h, "container": c, "mode": m} for h, c, m in out]


def whole(role: str, settings: dict | None = None) -> dict:
    """The filled spec with the runner's task mounts: what the container gets."""
    spec = filled(role)
    spec["mounts"] = task_mounts(role, settings or fixture_settings()) + spec["mounts"]
    return spec


def effective(spec: dict, host: str) -> str | None:
    """The mode a host path has in a spec: that of the deepest mount whose host path holds it."""
    best, depth = None, -1
    for m in spec["mounts"]:
        d = len(PurePosixPath(m["host"]).parts)
        if under(host, m["host"]) and d > depth:
            best, depth = m["mode"], d
    return best


def never_mounted(settings: dict, role: str) -> list[str]:
    """contracts/containers.md §3, resolved, plus what main's settings deny reading outside the worktree."""
    out = [
        f"{HOME}/.aws",
        f"{HOME}/.ssh",
        f"{HOME}/.config/h4reet-ai",
        f"{HOME}/.config/gh",
        f"{HOME}/.git-credentials",
        f"{HOME}/.docker",
        f"{HOME}/.claude",
        f"{HOME}/.claude.json",
        "/srv/studio/photos",
        "/srv/studio/key",
        "/var/run/docker.sock",
        "/run/docker.sock",
        f"{HOME}/.local/state/h4reet",
        f"{HOME}/.local/state/h4reet-ai",
        f"{HOME}/.local/share/h4reet/terraform-providers",
    ]
    if role != "studio":
        out += ["/srv/studio/outputs", "/srv/studio/workflows"]
    fs = settings["sandbox"]["filesystem"]
    extra = list(fs.get("denyRead", []))
    extra += [
        f["path"] for f in settings["sandbox"].get("credentials", {}).get("files", [])
    ]
    for entry in extra:
        if entry.startswith("./"):
            continue
        if entry.startswith("~/"):
            entry = f"{HOME}/{entry[2:]}"
        if role == "studio" and entry in (
            "/srv/studio/outputs",
            "/srv/studio/workflows",
        ):
            continue
        out.append(entry)
    return sorted(set(out))


def mount_violations(
    mounts: list[dict], role: str, settings: dict, *, allow_git: bool
) -> list[str]:
    bad = []
    for m in mounts:
        host = fill(m["host"])
        if host in ("/", HOME, "/srv", "/srv/studio", "/var/run", "/run"):
            bad.append(f"{m['host']}: an ancestor of a never-mounted path")
            continue
        for f in never_mounted(settings, role):
            if under(host, f) or ancestor(host, f):
                bad.append(f"{m['host']} touches {f}")
        if under(host, REPO) and not (allow_git and under(host, GIT)):
            bad.append(f"{m['host']}: the main checkout")
        if ancestor(host, REPO):
            bad.append(f"{m['host']}: an ancestor of the main checkout")
    return bad


# ---------------------------------------------------------------------------------------------------------------
# 1. Files, and build.py --check
# ---------------------------------------------------------------------------------------------------------------
def run_build(*args: str, build: Path = BUILD) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-I", "-B", str(build), *args],
        capture_output=True,
        text=True,
        env=git_env(),
        check=False,
    )


@pytest.mark.parametrize("name", ALL_SPECS)
def test_every_spec_file_exists(name: str) -> None:
    assert (CONTAINERS / f"{name}.json").is_file()


def test_no_other_spec_files() -> None:
    names = {p.stem for p in CONTAINERS.glob("*.json")} - {"fragments"}
    assert names == set(ALL_SPECS)


def test_build_check_passes_on_the_committed_files() -> None:
    done = run_build("--check", "--settings", str(FIXTURE))
    assert done.returncode == 0, done.stdout + done.stderr


def test_build_check_passes_against_the_real_main() -> None:
    if main_blob(".claude/settings.json") is None:
        pytest.skip("no refs/heads/main here (an export): the fixture's copy stands in")
    done = run_build("--check")
    assert done.returncode == 0, done.stdout + done.stderr


@pytest.fixture
def scratch(tmp_path: Path) -> Path:
    """A copy of deploy/night-shift's generated tree, so build.py can be run against changed inputs."""
    root = tmp_path / "night-shift"
    shutil.copytree(CONTAINERS, root / "containers")
    for f in NIGHT.glob("allowlist*.json"):
        shutil.copy(f, root / f.name)
    return root


def test_build_check_names_a_changed_file_and_fails(scratch: Path) -> None:
    build = scratch / "containers" / "build.py"
    target = scratch / "containers" / "implementer.json"
    target.write_text(
        target.read_text(encoding="utf-8").replace('"rw"', '"ro"', 1), encoding="utf-8"
    )
    done = run_build("--check", "--settings", str(FIXTURE), build=build)
    assert done.returncode == 1
    assert "implementer.json" in done.stdout + done.stderr
    assert run_build("--settings", str(FIXTURE), build=build).returncode == 0
    assert run_build("--check", "--settings", str(FIXTURE), build=build).returncode == 0


def test_build_check_fails_on_a_missing_allowlist(scratch: Path) -> None:
    (scratch / "allowlist-studio.json").unlink()
    done = run_build(
        "--check", "--settings", str(FIXTURE), build=scratch / "containers" / "build.py"
    )
    assert done.returncode == 1
    assert "allowlist-studio.json" in done.stdout + done.stderr


def test_build_is_deterministic(scratch: Path) -> None:
    build = scratch / "containers" / "build.py"
    assert run_build("--settings", str(FIXTURE), build=build).returncode == 0
    first = {p.name: p.read_bytes() for p in (scratch / "containers").glob("*.json")}
    assert run_build("--settings", str(FIXTURE), build=build).returncode == 0
    assert first == {
        p.name: p.read_bytes() for p in (scratch / "containers").glob("*.json")
    }


def test_build_refuses_unreadable_settings(scratch: Path, tmp_path: Path) -> None:
    build = scratch / "containers" / "build.py"
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert run_build("--check", "--settings", str(bad), build=build).returncode == 2
    assert (
        run_build(
            "--check", "--settings", str(tmp_path / "absent.json"), build=build
        ).returncode
        == 2
    )


def test_the_night_allowlist_follows_the_settings(
    scratch: Path, tmp_path: Path
) -> None:
    settings = fixture_settings()
    settings["sandbox"]["network"]["allowedDomains"] += [
        "New.Example.org",
        "10.0.0.1",
        "host.example:8443",
    ]
    changed = tmp_path / "settings.json"
    changed.write_text(json.dumps(settings), encoding="utf-8")
    build = scratch / "containers" / "build.py"
    specs_before = {
        p.name: p.read_bytes() for p in (scratch / "containers").glob("*.json")
    }
    assert run_build("--check", "--settings", str(changed), build=build).returncode == 1
    assert run_build("--settings", str(changed), build=build).returncode == 0
    hosts = json.loads((scratch / "allowlist.json").read_text(encoding="utf-8"))[
        "sandbox"
    ]["network"]
    assert "new.example.org" in hosts["allowedDomains"]
    assert not [h for h in hosts["allowedDomains"] if ":" in h or h.startswith("10.")]
    assert specs_before == {
        p.name: p.read_bytes() for p in (scratch / "containers").glob("*.json")
    }


# ---------------------------------------------------------------------------------------------------------------
# 2. Shape, as the runner validates a live spec (contracts/runner.md §3)
# ---------------------------------------------------------------------------------------------------------------
REQUIRED_KEYS = {
    "role",
    "parent",
    "image",
    "user",
    "mounts",
    "networks",
    "env",
    "env_file",
    "cap_drop",
    "security_opt",
    "read_only",
    "tmpfs",
    "limits",
    "requests",
    "x-h4",
}


@pytest.mark.parametrize("name", ALL_SPECS)
def test_shape(specs: dict[str, dict], name: str) -> None:
    spec = specs[name]
    assert set(spec) - {"gpus"} == REQUIRED_KEYS, set(spec) ^ REQUIRED_KEYS
    assert spec["role"] == name
    assert spec["parent"] == LATTICE.get(name, "runner")
    assert spec["user"] == "{{UID}}:{{GID}}"
    assert spec["cap_drop"] == ["ALL"]
    assert spec["security_opt"] == ["no-new-privileges"]
    assert spec["read_only"] is (name not in GPU)
    want = (
        "studio" if name == "studio" else "comfyui" if name == "comfyui" else "worker"
    )
    assert spec["image"] == f"h4-night-{want}:{{{{IMAGE_TAG}}}}"
    assert "latest" not in json.dumps(spec)
    assert any(t.startswith("/tmp:") for t in spec["tmpfs"])
    assert set(spec["limits"]) == {"memory", "cpus", "pids"}
    assert re.fullmatch(r"[0-9]+g", spec["limits"]["memory"])
    assert re.fullmatch(r"[0-9]+(\.[0-9]+)?", spec["limits"]["cpus"])
    assert (
        isinstance(spec["limits"]["pids"], int) and 0 < spec["limits"]["pids"] <= 1024
    )
    assert spec["x-h4"]["task"] == TASK[name]
    containers = [m["container"] for m in spec["mounts"]]
    assert len(containers) == len(set(containers)), "two mounts at one container path"
    for i, outer in enumerate(containers):
        for inner in containers[:i]:
            assert not ancestor(fill(outer), fill(inner)), (
                f"{outer} comes after {inner}, inside it"
            )


@pytest.mark.parametrize("name", ALL_SPECS)
def test_the_runner_would_take_the_filled_spec(name: str) -> None:
    """The runner's own live check (night.py's validate_spec, called, not copied) on the filled copy: what the
    install writes must start, against main's settings' never-read paths too."""
    spec = filled(name)
    assert "{{" not in json.dumps(spec)
    night = night_runner()
    why = night.validate_spec(
        spec,
        name,
        uid_gid="1000:1000",
        token=fill(TOKEN_FILE),
        home=HOME,
        repo=REPO,
        realpath=lambda p: p,
        exists=lambda p: True,
        never_extra=night.settings_never(fixture_settings(), HOME),
    )
    assert why is None, why
    if name in SESSION_ROLES:
        assert spec["env_file"] == fill(TOKEN_FILE)
    else:
        assert spec["env_file"] is None, (
            "the runner gives the plan its credentials itself, and ComfyUI no token"
        )


@pytest.mark.parametrize("name", ALL_SPECS)
def test_no_spec_mount_takes_a_reserved_or_task_path(name: str) -> None:
    spec = filled(name)
    task = [m["container"] for m in task_mounts(name, fixture_settings())]
    for m in spec["mounts"]:
        c = m["container"]
        assert not c.startswith("/night/settings"), c
        for r in RESERVED:
            assert not under(c, r) or (r == "/" and c != "/"), (c, r)
        for t in task:
            assert not under(c, t), (c, t)


def test_no_bare_anywhere(specs: dict[str, dict]) -> None:
    for name, spec in specs.items():
        assert "--bare" not in json.dumps(spec), name


# ---------------------------------------------------------------------------------------------------------------
# 3. Never mounted
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", SESSION_ROLES)
def test_no_session_mounts_a_never_mounted_path_or_its_ancestor(name: str) -> None:
    settings = fixture_settings()
    assert (
        mount_violations(filled(name)["mounts"], name, settings, allow_git=False) == []
    )
    assert (
        mount_violations(task_mounts(name, settings), name, settings, allow_git=True)
        == []
    )


def test_no_spec_mount_touches_the_main_checkout_or_its_git(
    specs: dict[str, dict],
) -> None:
    """Only the runner's task mounts reach `.git`, so no spec can reopen a mask."""
    for name in ALL_SPECS:
        for m in filled(name)["mounts"]:
            assert not under(m["host"], REPO) and not ancestor(m["host"], REPO), (
                name,
                m["host"],
            )
            assert not under(m["host"], FACTS["NIGHT_ROOT"] + "/2026-11-14"), (
                name,
                m["host"],
            )


def test_only_the_studio_mounts_the_studio_outputs() -> None:
    for name in SESSION_ROLES:
        mounted = any(
            under(m["host"], "/srv/studio/outputs") for m in filled(name)["mounts"]
        )
        assert mounted == (name == "studio"), name


@pytest.mark.parametrize("name", RUNNER_ONLY)
def test_runner_only_specs_still_mount_no_secret_or_socket(name: str) -> None:
    never = [
        f"{HOME}/.aws",
        f"{HOME}/.ssh",
        f"{HOME}/.config/gh",
        f"{HOME}/.git-credentials",
        f"{HOME}/.docker",
        f"{HOME}/.claude",
        f"{HOME}/.claude.json",
        f"{HOME}/.config/h4reet-ai/env",
        f"{HOME}/.config/h4reet-ai/night-shift",
        "/srv/studio/photos",
        "/srv/studio/key",
        "/var/run/docker.sock",
        "/run/docker.sock",
    ]
    for m in filled(name)["mounts"]:
        host = m["host"]
        assert host not in (
            "/",
            HOME,
            "/srv",
            "/srv/studio",
            "/var/run",
            "/run",
            f"{HOME}/.config/h4reet-ai",
        )
        for f in never:
            assert not (under(host, f) or ancestor(host, f)), (host, f)
        assert not under(host, REPO), host


@pytest.mark.parametrize(
    "host",
    [
        "{{HOME}}",
        "/",
        "/srv/studio",
        "/var/run/docker.sock",
        "/run",
        "{{HOME}}/.aws/config",
        "{{HOME}}/.config",
        "{{REPO}}",
        "{{REPO}}/src",
        "{{REPO}}/.git",
        "{{HOME}}/h4reet-ai",
        "{{HOME}}/.claude",
        "{{HOME}}/.config/h4reet-ai/env",
        "/srv/studio/outputs",
        "{{HOME}}/.gnupg",
    ],
)
def test_the_never_mounted_check_catches(host: str) -> None:
    assert mount_violations(
        [{"host": host, "container": "/x", "mode": "ro"}],
        "implementer",
        fixture_settings(),
        allow_git=False,
    )


# ---------------------------------------------------------------------------------------------------------------
# 4. The masks: the runner's, over its own task mounts; no spec mount reopens one
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", sorted(WRITING))
def test_every_protected_path_stays_read_only_with_the_spec_mounts(name: str) -> None:
    for settings in [fixture_settings()] + (
        [json.loads(b)] if (b := main_blob(".claude/settings.json")) else []
    ):
        spec = whole(name, settings)
        gone = absent(settings)
        hook = main_blob(".claude/hooks/protected-paths.sh")
        hook_text = hook.decode() if hook else HOOK_FIXTURE.read_text()
        for p in protected(settings):
            if p in gone:
                # No mask can cover a path that isn't there. The merge-time refusal does: a stack that creates it,
                # or changes any human-only path through the index, isn't named (contracts/runner.md §6).
                rel = p[len(WT) + 1 :]
                for probe in (rel, f"{rel}/x"):
                    assert night_runner().human_only_paths(
                        [probe], settings, hook_text
                    ) == [probe], (name, probe)
                continue
            assert effective(spec, p) == "ro", (name, p)
        for p in OWN_GIT:
            assert effective(spec, f"{GIT}/{p}") == "rw", (name, p)
        assert effective(spec, WT) == "rw"


@pytest.mark.parametrize("name", ALL_SPECS)
def test_no_container_writes_the_repositorys_git_itself(name: str) -> None:
    """A session that could write `.git` could write `.git/commondir` and steer git outside the container."""
    for m in filled(name)["mounts"] + task_mounts(name, fixture_settings()):
        assert not (m["host"] == GIT and m["mode"] == "rw"), (name, m)
    spec = whole(name)
    for p in ("", "commondir", "config", "hooks", "worktrees/t-02", "refs/heads/other"):
        assert effective(spec, f"{GIT}/{p}".rstrip("/")) in (None, "ro"), (name, p)


@pytest.mark.parametrize("name", ["reviewer", "red-teamer", "gate-runner"])
def test_the_reading_roles_write_nothing_of_the_repository(name: str) -> None:
    spec = whole(name)
    for m in spec["mounts"]:
        if m["mode"] == "rw":
            assert not under(m["host"], WT) and not under(m["host"], GIT), (name, m)


def test_the_masks_are_only_where_a_read_write_mount_covers_a_protected_path() -> None:
    settings = fixture_settings()
    masks = expected_masks(settings)
    for p in (
        ".claude",
        "CLAUDE.md",
        "REVIEW.md",
        "tools/gates",
        ".specify/memory/constitution.md",
        "assets/policy",
    ):
        assert f"{WT}/{p}" in masks
    assert f"{GIT}/objects/info" in masks and f"{GIT}/worktrees/t-01/commondir" in masks
    rw = [f"{GIT}/{p}" for p in OWN_GIT] + [WT]
    for p in masks:
        assert any(under(p, r) for r in rw), p
    for p in (
        "hooks",
        "config",
        "HEAD",
        "index",
        "refs/heads/main",
        "refs/tags",
        "refs/replace",
    ):
        assert f"{GIT}/{p}" in protected(settings) and f"{GIT}/{p}" not in masks, p


def test_the_absent_paths_are_the_merge_time_refusals() -> None:
    """Each denied path a fresh worktree lacks is unmasked, and the runner's refusal names it instead."""
    settings = fixture_settings()
    gone = absent(settings)
    assert gone, (
        "a fresh worktree holds every denied path: then this test has nothing to show"
    )
    masks = expected_masks(settings)
    rels = sorted(p[len(WT) + 1 :] for p in gone)
    assert not [p for p in gone if p in masks]
    assert (
        night_runner().human_only_paths(rels, settings, HOOK_FIXTURE.read_text())
        == rels
    )


def test_the_hook_fixture_is_mains_copy() -> None:
    blob = main_blob(".claude/hooks/protected-paths.sh")
    if blob is None:
        pytest.skip("no refs/heads/main here (an export)")
    assert HOOK_FIXTURE.read_bytes() == blob


def test_the_fixture_is_mains_copy() -> None:
    blob = main_blob(".claude/settings.json")
    if blob is None:
        pytest.skip("no refs/heads/main here (an export)")
    main = json.loads(blob)["sandbox"]
    fixture = fixture_settings()["sandbox"]
    assert fixture["filesystem"]["denyWrite"] == main["filesystem"]["denyWrite"]
    assert fixture["filesystem"]["denyRead"] == main["filesystem"]["denyRead"]
    assert fixture["network"]["allowedDomains"] == main["network"]["allowedDomains"]
    assert fixture["credentials"]["files"] == main["credentials"]["files"]


def test_the_specs_hold_against_the_real_main() -> None:
    blob = main_blob(".claude/settings.json")
    if blob is None:
        pytest.skip("no refs/heads/main here (an export)")
    settings = json.loads(blob)
    banned = {
        v["name"] for v in settings["sandbox"].get("credentials", {}).get("envVars", [])
    }
    for name in SESSION_ROLES:
        assert (
            mount_violations(filled(name)["mounts"], name, settings, allow_git=False)
            == []
        ), name
        assert not set(load(name)["env"]) & banned, name


# ---------------------------------------------------------------------------------------------------------------
# 5. The environment
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", ALL_SPECS)
def test_no_api_billing_variable(specs: dict[str, dict], name: str) -> None:
    env = specs[name]["env"]
    assert not set(env) & FORBIDDEN_ENV
    assert not [k for k in env if k.startswith("AWS_")], name
    assert "sk-ant" not in json.dumps(specs[name])


@pytest.mark.parametrize("name", SESSION_ROLES)
def test_session_environment(specs: dict[str, dict], name: str) -> None:
    spec = specs[name]
    env = spec["env"]
    for key, value in REQUIRED_ENV.items():
        assert env.get(key) == value, key
    assert env["HTTPS_PROXY"] == (
        "http://egress-studio:3128" if name == "studio" else "http://egress:3128"
    )
    assert any(t.startswith("/night/home:") for t in spec["tmpfs"])
    if name in ENGINE_ROLES:
        assert env["DOCKER_HOST"] == "tcp://127.0.0.1:2376"
        assert env["NIGHT_ENGINE_FWD"] == "engine-fwd:2376"
        assert "engine-fwd" in env["NO_PROXY"].split(",")
        assert env["DOCKER_CONFIG"] == "/night/engine"
        assert {
            "host": "{{ENGINE_CERTS}}",
            "container": "/night/engine",
            "mode": "ro",
        } in spec["mounts"]
    else:
        assert "DOCKER_HOST" not in env and "NIGHT_ENGINE_FWD" not in env
        assert not any(m["host"] == "{{ENGINE_CERTS}}" for m in spec["mounts"])


def test_the_studio_reaches_comfyui_by_its_container_name(
    specs: dict[str, dict],
) -> None:
    env = specs["studio"]["env"]
    assert env["COMFYUI_URL"] == "http://h4-night-comfyui:{{COMFYUI_PORT}}"
    assert "h4-night-comfyui" in env["NO_PROXY"].split(",")


def test_comfyui_gets_no_token_and_no_proxy(specs: dict[str, dict]) -> None:
    spec = specs["comfyui"]
    assert spec["env_file"] is None
    assert not {"HTTPS_PROXY", "HTTP_PROXY"} & set(spec["env"])
    assert spec["env"]["HF_HUB_OFFLINE"] == "1"


def test_the_plan_environment(specs: dict[str, dict]) -> None:
    env = specs["plan"]["env"]
    assert "SANDBOX_RUNTIME" not in env, "infra_plan.py refuses inside a sandbox"
    assert env["HTTPS_PROXY"] == "http://egress-plan:3128"
    assert env["HOME"] == "{{HOME}}", (
        "infra_plan.py finds its values, data, and mirror under the home"
    )


# ---------------------------------------------------------------------------------------------------------------
# 6. Managed settings and settings layers, baked into the images
# ---------------------------------------------------------------------------------------------------------------
DOCKERFILES = ["worker", "studio", "comfyui", "egress"]


def dockerfile(name: str) -> str:
    path = IMAGES / f"{name}.Dockerfile"
    assert path.is_file(), path
    return path.read_text(encoding="utf-8")


def instructions(text: str) -> list[str]:
    """The Dockerfile's instructions, continuation lines joined, comments dropped."""
    out, cur = [], ""
    for line in text.splitlines():
        if not cur and line.lstrip().startswith("#"):
            continue
        cur += (
            line.rstrip("\\").rstrip() + " " if line.rstrip().endswith("\\") else line
        )
        if not line.rstrip().endswith("\\"):
            if cur.strip():
                out.append(" ".join(cur.split()))
            cur = ""
    return out


@pytest.mark.parametrize("name", DOCKERFILES)
def test_every_image_bakes_the_managed_settings(name: str) -> None:
    want = "COPY --chmod=0444 deploy/night-shift/claude/managed-settings.json /etc/claude-code/managed-settings.json"
    assert want in instructions(dockerfile(name))


def test_the_managed_settings_file_is_exactly_the_proven_one() -> None:
    path = NIGHT / "claude" / "managed-settings.json"
    if not path.is_file():
        pytest.skip(
            "deploy/night-shift/claude/managed-settings.json is G1's (T020), not on this branch"
        )
    assert json.loads(path.read_text(encoding="utf-8")) == MANAGED


@pytest.mark.parametrize("name", DOCKERFILES)
def test_bases_come_only_through_pinned_arguments(name: str) -> None:
    for ins in instructions(dockerfile(name)):
        if ins.upper().startswith("FROM "):
            assert re.fullmatch(r"FROM \$\{[A-Z_]+\}( AS [a-z0-9-]+)?", ins), ins
    # T090 round 2: make check's policy gate reads each FROM's default, so a digest may sit in an ARG default, which
    # test_install.py holds to pins.json; anywhere else it belongs in pins.json
    for line in dockerfile(name).splitlines():
        if re.search(r"[0-9a-f]{64}", line):
            assert re.fullmatch(r"ARG [A-Z_]+=\S+@sha256:[0-9a-f]{64}", line), line
    assert ":latest" not in dockerfile(name)


@pytest.mark.parametrize("name", DOCKERFILES)
def test_no_credential_in_an_image(name: str) -> None:
    for ins in instructions(dockerfile(name)):
        if ins.upper().startswith(("ENV ", "ARG ")):
            assert not re.search(r"TOKEN|API_KEY|SECRET|PASSWORD|AWS_", ins), ins
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in dockerfile(name)


@pytest.mark.parametrize("name", ["worker", "studio", "comfyui"])
def test_the_session_images_know_the_authors_uid(name: str) -> None:
    """The runner mounts nothing at /etc, so the image holds a passwd entry for the uid it runs as."""
    ins = instructions(dockerfile(name))
    assert "ARG NIGHT_UID" in ins and "ARG NIGHT_GID" in ins
    assert any(
        "getent passwd" in i and "useradd" in i and "/night/home" in i for i in ins
    )


def test_the_worker_image_bakes_each_role_layer() -> None:
    ins = instructions(dockerfile("worker"))
    for role in WORKER_ROLES:
        want = f"COPY --chmod=0444 deploy/night-shift/claude/{role}.settings.json /night/settings-{role}.json"
        assert want in ins, role
    assert not any("studio.settings.json" in i for i in ins)
    assert any(re.fullmatch(r"FROM \$\{TOOLCHAIN_IMAGE\}", i) for i in ins)
    assert any("claude --version" in i and "CLAUDE_CODE_VERSION" in i for i in ins)
    assert any("socat" in i for i in ins)


def test_the_worker_entrypoint_runs_the_runners_command_unchanged() -> None:
    """The runner gives the program (`claude …`, or engine-fwd's `socat …`); the entrypoint only adds the
    in-container forward for the engine roles, then executes it."""
    ins = instructions(dockerfile("worker"))
    assert (
        "COPY --chmod=0555 deploy/night-shift/images/entrypoint.sh /night/entrypoint.sh"
        in ins
    )
    assert 'ENTRYPOINT ["/night/entrypoint.sh"]' in ins
    assert not any(i.startswith("CMD ") for i in ins)
    script = (IMAGES / "entrypoint.sh").read_text(encoding="utf-8")
    assert script.rstrip().endswith('exec "$@"')
    assert "engine-fwd:2376" in script and "bind=127.0.0.1" in script


def test_the_studio_image_bakes_its_layer_and_checks_blender() -> None:
    ins = instructions(dockerfile("studio"))
    assert (
        "COPY --chmod=0444 deploy/night-shift/claude/studio.settings.json /night/settings-studio.json"
        in ins
    )
    assert any("sha256sum -c" in i and "BLENDER_SHA256" in i for i in ins)
    assert any(i.startswith("ARG BLENDER_SHA256") for i in ins)
    assert any("@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" in i for i in ins)


def test_the_comfyui_image_has_the_python_the_venv_needs() -> None:
    ins = instructions(dockerfile("comfyui"))
    assert any("python3.12" in i and "apt-get install" in i for i in ins)
    assert any(re.fullmatch(r"FROM \$\{UBUNTU_IMAGE\}", i) for i in ins)


def test_the_egress_image_copies_mains_proxy_readable() -> None:
    ins = instructions(dockerfile("egress"))
    assert (
        "COPY --chmod=0444 deploy/agents-engine/egress-proxy.py /egress-proxy.py" in ins
    )
    assert any(re.fullmatch(r"FROM \$\{PYTHON_IMAGE\}", i) for i in ins)


def test_the_role_layers_hold_no_credential() -> None:
    folder = NIGHT / "claude"
    layers = sorted(folder.glob("*.settings.json")) if folder.is_dir() else []
    if not layers:
        pytest.skip("the role layers are G1's (T020), not on this branch")
    for path in layers:
        layer = json.loads(path.read_text(encoding="utf-8"))
        assert "apiKeyHelper" not in layer, path.name
        assert not set(layer.get("env", {})) & FORBIDDEN_ENV, path.name


# ---------------------------------------------------------------------------------------------------------------
# The pins (T002)
# ---------------------------------------------------------------------------------------------------------------
def pins() -> dict:
    return json.loads((IMAGES / "pins.json").read_text(encoding="utf-8"))


def test_pins_shape() -> None:
    p = pins()
    assert p["claude_code"] == "2.1.322"
    assert p["bases"], "no bases"
    for key, base in p["bases"].items():
        assert set(base) >= {"image", "tag", "digest"}, key
        assert base["tag"] != "latest" and base["tag"], key
        assert key == f"{base['image'].rsplit('/', 1)[-1]}:{base['tag']}", key
        assert base["digest"] is None or re.fullmatch(
            r"sha256:[0-9a-f]{64}", base["digest"]
        ), key
    tool = p["toolchain"]
    assert tool["dockerfile"] == ".devcontainer/Dockerfile"
    assert tool["args"] == {"WITH_CLAUDE": "1", "CLAUDE_CODE_VERSION": p["claude_code"]}
    for path in tool["context"]:
        assert (REPO_ROOT / path).is_file(), path


def test_pins_blender_checksum_is_whole_when_joined() -> None:
    b = pins()["blender"]
    assert b["version"] == "5.2.3"
    assert (
        b["url"]
        == "https://download.blender.org/release/Blender5.2/blender-5.2.3-linux-x64.tar.xz"
    )
    halves = b["sha256"]
    assert len(halves) == 2 and all(re.fullmatch(r"[0-9a-f]{32}", h) for h in halves)
    assert re.fullmatch(r"[0-9a-f]{64}", "".join(halves))


@pytest.mark.parametrize("name", DOCKERFILES)
def test_each_image_names_its_pins_and_its_context(name: str) -> None:
    p = pins()
    image = p["images"][name]
    assert image["dockerfile"] == f"deploy/night-shift/images/{name}.Dockerfile"
    text = dockerfile(name)
    froms = set(re.findall(r"^FROM \$\{([A-Z_]+)\}", text, flags=re.MULTILINE))
    assert froms == set(image["bases"]), (froms, image["bases"])
    for arg, base in image["bases"].items():
        assert base == "toolchain" or base in p["bases"], (arg, base)
        # a pinned default since T090 round 2 (make check's policy gate); test_install.py holds it to pins.json
    assert re.search(
        rf"^ARG {arg}(=\S+@sha256:[0-9a-f]{{64}})?$", text, flags=re.MULTILINE
    ), arg
    # Every COPY source from the context is listed, so the install writes exactly these from `git show`.
    sources = set()
    for ins in instructions(text):
        if ins.startswith("COPY ") and "--from=" not in ins:
            sources.update(w for w in ins.split()[1:-1] if not w.startswith("--"))
    assert sources == set(image["context"]) - {image["dockerfile"]}, sources ^ set(
        image["context"]
    )
    for path in image["context"]:
        assert (REPO_ROOT / path).is_file() or path.startswith(
            "deploy/night-shift/claude/"
        ), path


def test_every_dockerfile_arg_has_a_value_in_the_pins() -> None:
    p = pins()
    for name in DOCKERFILES:
        image = p["images"][name]
        given = set(image["bases"]) | set(image.get("args", {}))
        for arg in re.findall(
            r"^ARG ([A-Z_0-9]+)", dockerfile(name), flags=re.MULTILINE
        ):
            assert arg in given, (name, arg)
        for arg, value in image.get("args", {}).items():
            assert isinstance(value, dict) and set(value) <= {"from", "join"}, (
                name,
                arg,
            )
            source = value["from"]
            if source.startswith("facts."):
                assert source[len("facts.") :] in PLACEHOLDERS, (name, arg)
            else:
                node: object = p
                for part in source.split("."):
                    assert isinstance(node, dict) and part in node, (name, arg, source)
                    node = node[part]


# ---------------------------------------------------------------------------------------------------------------
# 7. GPU containers, and the networks
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", ALL_SPECS)
def test_gpu_only_where_needed(specs: dict[str, dict], name: str) -> None:
    spec = specs[name]
    if name in GPU:
        assert spec["gpus"] == "all"
        assert spec["read_only"] is False, (
            "the NVIDIA runtime's hook writes into the container at start"
        )
    else:
        assert "gpus" not in spec
        assert spec["read_only"] is True


EXPECTED_NETWORKS = {
    "supervisor": ["h4-night"],
    "spec-writer": ["h4-night"],
    "implementer": ["h4-night", "h4-night-engine"],
    "ops": ["h4-night", "h4-night-engine"],
    "reviewer": ["h4-night"],
    "red-teamer": ["h4-night", "h4-night-engine"],
    "gate-runner": ["h4-night"],
    "studio": ["h4-night-studio"],
    "plan": ["h4-night-plan"],
    "comfyui": ["h4-night-studio"],
}


@pytest.mark.parametrize("name", ALL_SPECS)
def test_only_internal_networks_role_by_role(specs: dict[str, dict], name: str) -> None:
    nets = specs[name]["networks"]
    assert nets == EXPECTED_NETWORKS[name]
    assert set(nets) <= INTERNAL
    if name != "comfyui":
        proxy = specs[name]["env"]["HTTPS_PROXY"]
        assert proxy in {
            f"http://{PROXY_FOR[n]}:3128" for n in nets if n in PROXY_FOR
        }, (name, proxy)


def test_only_the_engine_roles_reach_the_engine(specs: dict[str, dict]) -> None:
    for name in ALL_SPECS:
        assert ("h4-night-engine" in specs[name]["networks"]) == (
            name in ENGINE_ROLES
        ), name


def test_the_fragments_declare_the_networks() -> None:
    nets = json.loads((CONTAINERS / "fragments.json").read_text(encoding="utf-8"))[
        "networks"
    ]
    assert {n for n, v in nets.items() if v["internal"]} == INTERNAL
    assert [n for n, v in nets.items() if not v["internal"]] == ["h4-night-out"]


# ---------------------------------------------------------------------------------------------------------------
# 8. The lattice (plan §2), mount by mount, with the runner's task mounts counted as the role's
# ---------------------------------------------------------------------------------------------------------------
def same(path: str, mode: str) -> tuple[str, str, str]:
    return (path, path, mode)


ENGINE = ("{{ENGINE_CERTS}}", "/night/engine", "ro")
EXPECTED_MOUNTS = {
    "supervisor": {
        same("{{NIGHT_ROOT}}", "ro"),
        same("/srv/studio/briefs", "ro"),
        same("/srv/studio/handoff", "ro"),
    },
    "spec-writer": set(),
    "implementer": {
        ENGINE,
        same("/srv/studio/briefs", "rw"),
        same("/srv/studio/handoff", "ro"),
    },
    "ops": {
        ENGINE,
        same("/srv/studio/briefs", "rw"),
        same("/srv/studio/handoff", "ro"),
    },
    "reviewer": set(),
    "red-teamer": {ENGINE},
    "gate-runner": set(),
    "studio": {
        same("/srv/studio/handoff", "rw"),
        same("/srv/studio/outputs", "rw"),
        same("/srv/studio/briefs", "ro"),
        same("/srv/studio/workflows", "ro"),
    },
    "plan": {
        same("{{HOME}}/.config/h4reet-ai/infra", "ro"),
        same("{{HOME}}/.config/h4reet-ai/infra/data", "rw"),
        same("{{HOME}}/.config/h4reet-ai/infra/plans", "rw"),
        same("{{HOME}}/.config/h4reet-ai/infra/state", "rw"),
        same("{{HOME}}/.local/share/h4reet/terraform-providers", "ro"),
    },
    "comfyui": {
        same("{{COMFYUI_DIR}}", "ro"),
        same("{{COMFYUI_VENV}}", "ro"),
        same("/srv/studio/outputs", "rw"),
        ("{{NIGHT_ROOT}}/.comfyui/user", "/comfyui/user", "rw"),
    },
}


@pytest.mark.parametrize("name", ALL_SPECS)
def test_mounts_role_by_role(specs: dict[str, dict], name: str) -> None:
    got = {(m["host"], m["container"], m["mode"]) for m in specs[name]["mounts"]}
    assert got == EXPECTED_MOUNTS[name], (
        sorted(got - EXPECTED_MOUNTS[name]),
        sorted(EXPECTED_MOUNTS[name] - got),
    )


def test_comfyui_writes_only_its_own_folders(specs: dict[str, dict]) -> None:
    spec = specs["comfyui"]
    rw = {m["container"] for m in spec["mounts"] if m["mode"] == "rw"}
    assert rw == {"/srv/studio/outputs", "/comfyui/user"}
    tmp = {t.split(":", 1)[0] for t in spec["tmpfs"]}
    assert {"/tmp", "/comfyui/temp", "{{COMFYUI_DIR}}/input"} <= tmp, (
        "temp and uploads stay in the container"
    )


def ceiling() -> dict:
    """The union of every session, task mounts included: each path at its widest, every network, request, device."""
    whole_specs = {r: whole(r) for r in SESSION_ROLES}
    hosts: dict[str, dict] = {}
    for spec in whole_specs.values():
        for m in spec["mounts"]:
            hosts.setdefault(
                m["host"],
                {"host": m["host"], "container": m["container"], "mode": "ro"},
            )
    for host, m in hosts.items():
        m["mode"] = (
            max(
                (effective(s, host) for s in whole_specs.values()),
                key=lambda v: RANK[v],
            )
            or "ro"
        )
    return {
        "mounts": list(hosts.values()),
        "networks": sorted({n for s in whole_specs.values() for n in s["networks"]}),
        "requests": sorted({q for s in whole_specs.values() for q in s["requests"]}),
        "gpus": "all" if any("gpus" in s for s in whole_specs.values()) else None,
        "read_only": all(s["read_only"] for s in whole_specs.values()),
        "security_opt": ["no-new-privileges"],
        "limits": {
            "memory": max(
                int(s["limits"]["memory"][:-1]) for s in whole_specs.values()
            ),
            "cpus": max(float(s["limits"]["cpus"]) for s in whole_specs.values()),
            "pids": max(s["limits"]["pids"] for s in whole_specs.values()),
        },
    }


def norm_limits(spec: dict) -> dict:
    lim = spec["limits"]
    if isinstance(lim["memory"], int):
        return lim
    return {
        "memory": int(lim["memory"][:-1]),
        "cpus": float(lim["cpus"]),
        "pids": lim["pids"],
    }


def lattice_violations(child: dict, parent: dict) -> list[str]:
    """Every mount (by host path and mode, rw covering ro), network, device, and capability of the child is the
    parent's. Checked at every path either names, so a mask the parent has and the child lacks is a widening."""
    bad = []
    paths = {m["host"] for m in child["mounts"]} | {m["host"] for m in parent["mounts"]}
    for p in sorted(paths):
        c, q = effective(child, p), effective(parent, p)
        if RANK[c] > RANK[q]:
            bad.append(f"mount {p}: {c} in the child, {q} in the parent")
    for m in child["mounts"]:
        match = [x for x in parent["mounts"] if under(m["host"], x["host"])]
        if match:
            deepest = max(match, key=lambda x: len(PurePosixPath(x["host"]).parts))
            rel = PurePosixPath(m["host"]).relative_to(deepest["host"])
            if str(PurePosixPath(deepest["container"]) / rel) != m["container"]:
                bad.append(f"mount {m['host']} lands at {m['container']} in the child")
    if set(child["networks"]) - set(parent["networks"]):
        bad.append(
            f"networks {sorted(set(child['networks']) - set(parent['networks']))}"
        )
    if set(child.get("requests", [])) - set(parent.get("requests", [])):
        bad.append(
            f"requests {sorted(set(child['requests']) - set(parent['requests']))}"
        )
    if child.get("gpus") and not parent.get("gpus"):
        bad.append("gpus")
    if not child["read_only"] and parent["read_only"]:
        bad.append("a writable root")
    if set(child.get("cap_add", [])) - set(parent.get("cap_add", [])):
        bad.append("capabilities")
    if child.get("cap_drop", ["ALL"]) != ["ALL"]:
        bad.append("cap_drop")
    if set(parent["security_opt"]) - set(child["security_opt"]):
        bad.append("security_opt")
    cl, pl = norm_limits(child), norm_limits(parent)
    for k in ("memory", "cpus", "pids"):
        if cl[k] > pl[k]:
            bad.append(f"limits.{k}")
    return bad


@pytest.mark.parametrize("name", SESSION_ROLES)
def test_each_spec_is_within_its_lattice_parent(name: str) -> None:
    parent_name = LATTICE[name]
    parent = ceiling() if parent_name == "ceiling" else whole(parent_name)
    assert lattice_violations(whole(name), parent) == []


def test_the_lattice_check_catches_a_widening() -> None:
    impl = whole("implementer")
    wider = whole("spec-writer")
    wider["mounts"].append(
        {
            "host": "/srv/studio/handoff",
            "container": "/srv/studio/handoff",
            "mode": "rw",
        }
    )
    assert lattice_violations(wider, impl)
    unmasked = whole("spec-writer")
    unmasked["mounts"] = [m for m in unmasked["mounts"] if m["host"] != f"{WT}/.claude"]
    assert lattice_violations(unmasked, impl)
    netted = whole("reviewer")
    netted["networks"].append("h4-night-engine")
    assert lattice_violations(netted, whole("spec-writer"))
    asks = whole("implementer")
    asks["requests"].append("gate")
    assert lattice_violations(asks, whole("ops"))
    gpu = whole("reviewer")
    gpu["gpus"] = "all"
    assert lattice_violations(gpu, whole("spec-writer"))
    moved = whole("red-teamer")
    for m in moved["mounts"]:
        if m["container"] == "/night/engine":
            m["container"] = "/elsewhere"
    assert lattice_violations(moved, impl)


def test_the_ceiling_is_the_union() -> None:
    top = ceiling()
    assert effective(top, f"{WT}/.claude") == "ro", (
        "every role that writes the worktree masks .claude"
    )
    assert effective(top, "/srv/studio/outputs") == "rw"
    assert set(top["networks"]) == {"h4-night", "h4-night-engine", "h4-night-studio"}
    assert "h4-night-plan" not in top["networks"], (
        "the plan's network is the runner's alone"
    )


# ---------------------------------------------------------------------------------------------------------------
# 9 and 10. Placeholders; the plan's inputs are its own
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", ALL_SPECS)
def test_only_known_placeholders_and_no_runner_tokens(name: str) -> None:
    text = (CONTAINERS / f"{name}.json").read_text(encoding="utf-8")
    found = set(re.findall(r"\{\{([^{}]*)\}\}", text))
    assert found <= PLACEHOLDERS, found - PLACEHOLDERS
    assert (
        text.count("{{")
        == text.count("}}")
        == len(re.findall(r"\{\{[A-Z_]+\}\}", text))
    )
    spec = json.loads(text)
    for value in [m[k] for m in spec["mounts"] for k in ("host", "container")] + spec[
        "tmpfs"
    ]:
        assert "<" not in value and ">" not in value, value


def test_build_refuses_an_unknown_placeholder(scratch: Path) -> None:
    frag = scratch / "containers" / "fragments.json"
    frag.write_text(
        frag.read_text(encoding="utf-8").replace(
            "{{NIGHT_ROOT}}", "{{NIGHT_ROOOT}}", 1
        ),
        encoding="utf-8",
    )
    done = run_build(
        "--settings", str(FIXTURE), build=scratch / "containers" / "build.py"
    )
    assert done.returncode == 2
    assert "NIGHT_ROOOT" in done.stdout + done.stderr


def test_build_refuses_a_runner_token_in_a_spec(scratch: Path) -> None:
    frag = scratch / "containers" / "fragments.json"
    frag.write_text(
        frag.read_text(encoding="utf-8").replace(
            "/srv/studio/briefs", "/srv/studio/<task>", 1
        ),
        encoding="utf-8",
    )
    done = run_build(
        "--settings", str(FIXTURE), build=scratch / "containers" / "build.py"
    )
    assert done.returncode == 2
    assert "token" in done.stdout + done.stderr


PLAN_ONLY = [
    "{{HOME}}/.config/h4reet-ai/infra",
    "{{HOME}}/.local/share/h4reet/terraform-providers",
]


@pytest.mark.parametrize("name", [n for n in ALL_SPECS if n != "plan"])
def test_only_the_plan_mounts_the_plans_inputs(
    specs: dict[str, dict], name: str
) -> None:
    for m in specs[name]["mounts"]:
        for p in PLAN_ONLY:
            assert not (under(m["host"], p) or ancestor(m["host"], p)), (
                name,
                m["host"],
            )


def test_requests_role_by_role(specs: dict[str, dict]) -> None:
    want = {"ops": ["plan"], "gate-runner": ["gate"], "studio": ["comfyui"]}
    for name in ALL_SPECS:
        assert specs[name]["requests"] == want.get(name, []), name


# ---------------------------------------------------------------------------------------------------------------
# 12. The example marker
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", ALL_SPECS)
def test_every_committed_spec_is_marked_an_example(
    specs: dict[str, dict], name: str
) -> None:
    assert specs[name]["x-h4"]["example"] is True


# ---------------------------------------------------------------------------------------------------------------
# The allowlists (T035), checked by main's own egress-proxy.py --list
# ---------------------------------------------------------------------------------------------------------------
AWS_SERVICES = {
    "sts",
    "iam",
    "s3",
    "budgets",
    "ce",
    "events",
    "logs",
    "ecr",
    "lambda",
    "ec2",
    "sns",
    "sqs",
    "sso",
}


@pytest.fixture(scope="module")
def proxy_copy(tmp_path_factory: pytest.TempPathFactory) -> Path:
    blob = main_blob("deploy/agents-engine/egress-proxy.py")
    if blob is None:
        blob = (REPO_ROOT / "deploy" / "agents-engine" / "egress-proxy.py").read_bytes()
    path = tmp_path_factory.mktemp("proxy") / "egress-proxy.py"
    path.write_bytes(blob)
    return path


def proxy_list(proxy: Path, allowlist: Path) -> list[str]:
    done = subprocess.run(
        [sys.executable, "-I", "-B", str(proxy), "--list", str(allowlist)],
        capture_output=True,
        text=True,
        check=False,
        cwd=proxy.parent,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    return json.loads(done.stdout)["hosts"]


def listed(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    assert set(data) == {"sandbox"} and set(data["sandbox"]) == {"network"}
    assert set(data["sandbox"]["network"]) == {"allowedDomains"}
    return data["sandbox"]["network"]["allowedDomains"]


def hostnames(entries: list[str]) -> list[str]:
    out = []
    for e in entries:
        if ":" in e:
            continue
        try:
            ipaddress.ip_address(e.removeprefix("*."))
            continue
        except ValueError:
            out.append(e.lower())
    return out


def test_the_night_allowlist_is_mains_hosts_and_anthropics(proxy_copy: Path) -> None:
    path = NIGHT / "allowlist.json"
    want = sorted(
        set(hostnames(fixture_settings()["sandbox"]["network"]["allowedDomains"]))
        | {"api.anthropic.com"}
    )
    assert listed(path) == want, (
        "written as the proxy serves it: hosts only, sorted, once each"
    )
    assert proxy_list(proxy_copy, path) == want


def test_the_night_allowlist_follows_the_real_main(proxy_copy: Path) -> None:
    blob = main_blob(".claude/settings.json")
    if blob is None:
        pytest.skip("no refs/heads/main here (an export)")
    main = json.loads(blob)["sandbox"]["network"]["allowedDomains"]
    assert proxy_list(proxy_copy, NIGHT / "allowlist.json") == sorted(
        set(hostnames(main)) | {"api.anthropic.com"}
    )


def test_the_studio_allowlist_is_anthropic_alone(proxy_copy: Path) -> None:
    path = NIGHT / "allowlist-studio.json"
    assert listed(path) == ["api.anthropic.com"]
    assert proxy_list(proxy_copy, path) == ["api.anthropic.com"]


def test_the_plan_allowlist_is_the_aws_hosts_infra_uses(proxy_copy: Path) -> None:
    path = NIGHT / "allowlist-plan.json"
    hosts = proxy_list(proxy_copy, path)
    assert hosts == listed(path)
    assert "api.anthropic.com" not in hosts
    for h in hosts:
        assert h.endswith(".amazonaws.com"), h
        assert h != "*.amazonaws.com", "one entry per service, not the whole of AWS"
        regional = re.search(r"\.([a-z]{2}-[a-z]+-[0-9])\.amazonaws\.com$", h)
        assert regional is None or regional.group(1) == "us-east-1", h
    services = {re.sub(r"^\*\.|^api\.", "", h).split(".")[0] for h in hosts}
    assert AWS_SERVICES <= services, AWS_SERVICES - services


@pytest.mark.parametrize("name", SESSION_ROLES)
def test_a_sessions_tmp_and_home_run_programs(
    specs: dict[str, dict], name: str
) -> None:
    # T090 (2026-11-12): Docker mounts a tmpfs noexec unless told otherwise, and R3's make check failed over 220 tests
    # that write a fake program under /tmp and run it. nosuid stays.
    for t in specs[name]["tmpfs"]:
        where, opts = t.split(":", 1)
        if where in ("/tmp", "/night/home"):
            assert "exec" in opts.split(","), t
            assert "nosuid" in opts.split(","), t


def test_the_toolchain_installs_patch() -> None:
    # T090 round 2: infra/test/test_account.py reads iam.tf through P-6 with patch(1) until P-6 is applied, and R3's
    # make check, like the gate's, runs in the image .devcontainer/Dockerfile builds, which had no patch
    text = (NIGHT.parent.parent / ".devcontainer" / "Dockerfile").read_text()
    install = re.search(
        r"apt-get install -y --no-install-recommends \\\n(.*?)\n", text, re.DOTALL
    )
    assert install and "patch" in install.group(1).split(), install
