"""The night shift's container specs, images, and allowlists (spec 017: FR-010 to FR-016, FR-038, FR-041;
plan.md §1, §2; contracts/containers.md 1 to 11; tasks.md T030, T031).

No Docker, no network: every claim here is about files. The Author's probe and rehearsal prove the containers.
The masks follow main: they are computed from `refs/heads/main:.claude/settings.json`'s denyWrite, read with
`GIT_NO_REPLACE_OBJECTS=1 git cat-file blob`. The tests use a committed fixture copy, and one test reads the real
main copy when this checkout can (it skips in an export without `.git`).
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
# The specs that write the repository: each carries the masks (contracts/containers.md §4).
WRITING = {"supervisor", "spec-writer", "implementer", "ops"}
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
}
# What the runner fills per task (contracts/containers.md §9): never a `{{…}}`, which the install fills.
TOKENS = {"worktree", "task", "claude", "io", "root", "credentials"}

INTERNAL = {"h4-night", "h4-night-engine", "h4-night-studio", "h4-night-plan"}
PROXY_FOR = {
    "h4-night": "egress",
    "h4-night-studio": "egress-studio",
    "h4-night-plan": "egress-plan",
}

TOKEN_FILE = "{{HOME}}/.config/h4reet-ai/night-shift/claude.env"
SHARE = "{{HOME}}/.local/share/h4reet-ai/night-shift"
GIT = "{{REPO}}/.git"
W = "<worktree>"

# FR-041 and contracts/containers.md §5: never in a session's environment, and the token only by env_file.
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

# The machine facts and task values the tests resolve paths with (data-model.md's shapes, a made-up user).
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
}


def task_values(role: str) -> dict[str, str]:
    return {
        "worktree": "/home/author/h4reet-ai/night/t-01",
        "task": "t-01",
        "claude": f"/home/author/.local/share/h4reet-ai/night-shift/claude/{role}",
        "io": "/home/author/h4reet-ai/night/.io/t-01",
        "root": "bootstrap",
        "credentials": "/home/author/.local/state/h4reet-ai/night-shift/plan-t-01.env",
    }


def resolve(text: str, role: str) -> str:
    for key, value in FACTS.items():
        text = text.replace("{{" + key + "}}", value)
    for key, value in task_values(role).items():
        text = text.replace(f"<{key}>", value)
    return text


def load(name: str) -> dict:
    path = CONTAINERS / f"{name}.json"
    assert path.is_file(), f"{path} is missing (contracts/containers.md §1)"
    return json.loads(path.read_text(encoding="utf-8"))


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
# Paths
# ---------------------------------------------------------------------------------------------------------------
def under(path: str, base: str) -> bool:
    """`path` is `base` or inside it, by whole components."""
    p, b = PurePosixPath(path), PurePosixPath(base)
    return p == b or b in p.parents


def ancestor(path: str, of: str) -> bool:
    """`path` is a proper ancestor of `of`."""
    return PurePosixPath(path) in PurePosixPath(of).parents


RANK = {None: 0, "ro": 1, "rw": 2}


def effective(spec: dict, host: str) -> str | None:
    """The mode a host path has in a spec: that of the deepest mount whose host path holds it."""
    best, depth = None, -1
    for m in spec["mounts"]:
        if under(host, m["host"]) and len(PurePosixPath(m["host"]).parts) > depth:
            best, depth = m["mode"], len(PurePosixPath(m["host"]).parts)
    return best


def effective_in_container(spec: dict, path: str) -> str | None:
    best, depth = None, -1
    for m in spec["mounts"]:
        if (
            under(path, m["container"])
            and len(PurePosixPath(m["container"]).parts) > depth
        ):
            best, depth = m["mode"], len(PurePosixPath(m["container"]).parts)
    return best


def expected_masks(settings: dict) -> set[str]:
    """contracts/containers.md §4: the fixed masks, plus every denyWrite path inside the worktree.

    A `./.git/…` entry names the repository's own `.git`, which a linked worktree shares; any other `./…` entry is
    in the worktree. `~/…` and absolute entries are outside it (the never-mounted list covers those).
    """
    out = {
        f"{GIT}/hooks",
        f"{GIT}/config",
        f"{GIT}/info",
        f"{GIT}/packed-refs",
        f"{GIT}/refs/heads/main",
        f"{GIT}/refs/tags",
        f"{GIT}/objects/info",
        f"{GIT}/worktrees/<task>/commondir",
        f"{W}/.git",
    }
    for entry in settings["sandbox"]["filesystem"]["denyWrite"]:
        if not entry.startswith("./"):
            continue
        rel = entry[2:].rstrip("/")
        if rel == ".git":
            out.add(GIT)
        elif rel.startswith(".git/"):
            out.add(f"{GIT}/{rel[5:]}")
        else:
            out.add(f"{W}/{rel}")
    return out


def never_mounted(settings: dict, role: str) -> list[str]:
    """contracts/containers.md §3, resolved, plus what main's settings deny reading outside the worktree."""
    home = FACTS["HOME"]
    out = [
        f"{home}/.aws",
        f"{home}/.ssh",
        f"{home}/.config/h4reet-ai",
        f"{home}/.config/gh",
        f"{home}/.git-credentials",
        f"{home}/.docker",
        f"{home}/.claude",
        f"{home}/.claude.json",
        "/srv/studio/photos",
        "/srv/studio/key",
        "/var/run/docker.sock",
        "/run/docker.sock",
        f"{home}/.local/state/h4reet",
        f"{home}/.local/state/h4reet-ai",
        f"{home}/.local/share/h4reet/terraform-providers",
    ]
    if role != "studio":
        out += ["/srv/studio/outputs", "/srv/studio/workflows"]
    fs = settings["sandbox"]["filesystem"]
    extra = list(fs.get("denyRead", [])) + [
        f["path"] for f in settings["sandbox"].get("credentials", {}).get("files", [])
    ]
    for entry in extra:
        if entry.startswith("./"):
            continue
        if entry.startswith("~/"):
            entry = f"{home}/{entry[2:]}"
        if role == "studio" and entry in (
            "/srv/studio/outputs",
            "/srv/studio/workflows",
        ):
            continue
        out.append(entry)
    return sorted(set(out))


def mount_violations(spec: dict, role: str, settings: dict) -> list[str]:
    bad = []
    repo = FACTS["REPO"]
    for m in spec["mounts"]:
        host = resolve(m["host"], role)
        if host in ("/", FACTS["HOME"], "/srv", "/srv/studio", "/var/run", "/run"):
            bad.append(f"{m['host']}: an ancestor of a never-mounted path")
            continue
        for f in never_mounted(settings, role):
            if under(host, f) or ancestor(host, f):
                bad.append(f"{m['host']} touches {f}")
        # The main checkout's working tree: neither it, an ancestor, nor anything in it but its .git.
        if under(host, repo) and not under(host, f"{repo}/.git"):
            bad.append(f"{m['host']}: the main checkout's working tree")
        if ancestor(host, repo):
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


def test_fragments_and_build_exist() -> None:
    assert (CONTAINERS / "fragments.json").is_file()
    assert BUILD.is_file()


def test_no_other_spec_files() -> None:
    names = {p.stem for p in CONTAINERS.glob("*.json")} - {"fragments"}
    assert names == set(ALL_SPECS)


def test_build_check_passes_on_the_committed_files() -> None:
    done = run_build("--check", "--settings", str(FIXTURE))
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
    target = scratch / "containers" / "implementer.json"
    target.write_text(
        target.read_text(encoding="utf-8").replace('"rw"', '"ro"', 1), encoding="utf-8"
    )
    done = run_build(
        "--check", "--settings", str(FIXTURE), build=scratch / "containers" / "build.py"
    )
    assert done.returncode == 1
    assert "implementer.json" in done.stdout + done.stderr
    again = run_build(
        "--settings", str(FIXTURE), build=scratch / "containers" / "build.py"
    )
    assert again.returncode == 0, again.stdout + again.stderr
    assert (
        run_build(
            "--check",
            "--settings",
            str(FIXTURE),
            build=scratch / "containers" / "build.py",
        ).returncode
        == 0
    )


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
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    done = run_build(
        "--check", "--settings", str(bad), build=scratch / "containers" / "build.py"
    )
    assert done.returncode == 2
    done = run_build(
        "--check",
        "--settings",
        str(tmp_path / "absent.json"),
        build=scratch / "containers" / "build.py",
    )
    assert done.returncode == 2


def test_the_masks_follow_the_settings(scratch: Path, tmp_path: Path) -> None:
    """A path main's settings come to deny writing becomes a mask in every writing spec, and nowhere else."""
    settings = fixture_settings()
    settings["sandbox"]["filesystem"]["denyWrite"] += [
        "./newly/protected",
        "~/.elsewhere",
        "/srv/elsewhere",
    ]
    changed = tmp_path / "settings.json"
    changed.write_text(json.dumps(settings), encoding="utf-8")
    build = scratch / "containers" / "build.py"
    assert run_build("--check", "--settings", str(changed), build=build).returncode == 1
    assert run_build("--settings", str(changed), build=build).returncode == 0
    for role in ALL_SPECS:
        spec = json.loads(
            (scratch / "containers" / f"{role}.json").read_text(encoding="utf-8")
        )
        hosts = {m["host"] for m in spec["mounts"]}
        assert (f"{W}/newly/protected" in hosts) == (role in WRITING), role
        assert not any("elsewhere" in h for h in hosts), role


# ---------------------------------------------------------------------------------------------------------------
# 2. Shape
# ---------------------------------------------------------------------------------------------------------------
REQUIRED_KEYS = {
    "role",
    "parent",
    "image",
    "user",
    "init",
    "workdir",
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
OPTIONAL_KEYS = {"gpus", "settings", "command"}


@pytest.mark.parametrize("name", ALL_SPECS)
def test_shape(specs: dict[str, dict], name: str) -> None:
    spec = specs[name]
    assert REQUIRED_KEYS <= set(spec), REQUIRED_KEYS - set(spec)
    assert set(spec) <= REQUIRED_KEYS | OPTIONAL_KEYS, (
        set(spec) - REQUIRED_KEYS - OPTIONAL_KEYS
    )
    assert spec["role"] == name
    assert spec["user"] == "{{UID}}:{{GID}}"
    assert spec["init"] is True
    assert spec["cap_drop"] == ["ALL"]
    assert spec["security_opt"] == ["no-new-privileges"]
    assert spec["read_only"] is (name not in GPU)
    assert re.fullmatch(r"h4-night-(worker|studio|comfyui|egress)", spec["image"]), (
        spec["image"]
    )
    assert "latest" not in json.dumps(spec)
    assert any(t.startswith("/tmp:") for t in spec["tmpfs"])
    assert set(spec["limits"]) == {"memory", "cpus", "pids"}
    assert re.fullmatch(r"[0-9]+g", spec["limits"]["memory"])
    assert re.fullmatch(r"[0-9]+(\.[0-9]+)?", spec["limits"]["cpus"])
    assert (
        isinstance(spec["limits"]["pids"], int) and 0 < spec["limits"]["pids"] <= 1024
    )
    assert isinstance(spec["env"], dict)
    assert all(
        isinstance(k, str) and isinstance(v, str) for k, v in spec["env"].items()
    )
    for m in spec["mounts"]:
        assert (
            {"host", "container", "mode"}
            <= set(m)
            <= {"host", "container", "mode", "mask", "if_missing"}
        ), m
        assert m["mode"] in ("ro", "rw"), m
        assert m["container"].startswith("/") or m["container"].startswith(W), m
        if "mask" in m:
            assert (
                m["mask"] is True and m["mode"] == "ro" and m["host"] == m["container"]
            ), m
        if "if_missing" in m:
            assert m["if_missing"] in ("skip", "empty", "create"), m
    containers = [m["container"] for m in spec["mounts"]]
    assert len(containers) == len(set(containers)), "two mounts at one container path"
    # Parents before children, so a mask is never hidden by the mount it masks.
    depths = [len(PurePosixPath(resolve(c, name)).parts) for c in containers]
    assert depths == sorted(depths)


@pytest.mark.parametrize("name", SESSION_ROLES)
def test_session_shape(specs: dict[str, dict], name: str) -> None:
    spec = specs[name]
    assert spec["parent"] == LATTICE[name]
    assert spec["settings"] == f"/night/settings-{name}.json"
    assert "command" not in spec, "a session's command is the runner's claude -p line"
    assert spec["env_file"] == TOKEN_FILE
    assert spec["image"] == (
        "h4-night-studio" if name == "studio" else "h4-night-worker"
    )


@pytest.mark.parametrize("name", RUNNER_ONLY)
def test_runner_only_shape(specs: dict[str, dict], name: str) -> None:
    spec = specs[name]
    assert spec["parent"] == "runner"
    assert "settings" not in spec
    assert isinstance(spec["command"], list) and spec["command"]
    assert spec["requests"] == []


def test_no_bare_anywhere(specs: dict[str, dict]) -> None:
    for name, spec in specs.items():
        assert "--bare" not in json.dumps(spec), name


# ---------------------------------------------------------------------------------------------------------------
# 3. Never mounted
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", SESSION_ROLES)
def test_no_session_mounts_a_never_mounted_path_or_its_ancestor(
    specs: dict[str, dict], name: str
) -> None:
    assert mount_violations(specs[name], name, fixture_settings()) == []


def test_only_the_studio_mounts_the_studio_outputs(specs: dict[str, dict]) -> None:
    for name in SESSION_ROLES:
        mounted = any(
            under(resolve(m["host"], name), "/srv/studio/outputs")
            for m in specs[name]["mounts"]
        )
        assert mounted == (name == "studio"), name


@pytest.mark.parametrize("name", RUNNER_ONLY)
def test_runner_only_specs_still_mount_no_secret_or_socket(
    specs: dict[str, dict], name: str
) -> None:
    home = FACTS["HOME"]
    never = [
        f"{home}/.aws",
        f"{home}/.ssh",
        f"{home}/.config/gh",
        f"{home}/.git-credentials",
        f"{home}/.docker",
        f"{home}/.claude",
        f"{home}/.claude.json",
        f"{home}/.config/h4reet-ai/env",
        f"{home}/.config/h4reet-ai/night-shift",
        "/srv/studio/photos",
        "/srv/studio/key",
        "/var/run/docker.sock",
        "/run/docker.sock",
    ]
    for m in specs[name]["mounts"]:
        host = resolve(m["host"], name)
        assert host not in (
            "/",
            home,
            "/srv",
            "/srv/studio",
            "/var/run",
            "/run",
            f"{home}/.config/h4reet-ai",
        )
        for f in never:
            assert not (under(host, f) or ancestor(host, f)), (m["host"], f)
        assert not (
            under(host, FACTS["REPO"]) and not under(host, FACTS["REPO"] + "/.git")
        ), m["host"]


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
        "{{HOME}}/h4reet-ai",
        "{{HOME}}/.claude",
        "{{HOME}}/.config/h4reet-ai/env",
        "/srv/studio/outputs",
        "{{HOME}}/.gnupg",
    ],
)
def test_the_never_mounted_check_catches(host: str) -> None:
    spec = {"mounts": [{"host": host, "container": "/x", "mode": "ro"}]}
    assert mount_violations(spec, "implementer", fixture_settings())


# ---------------------------------------------------------------------------------------------------------------
# 4. The masks
# ---------------------------------------------------------------------------------------------------------------
def check_masks(spec: dict, name: str, settings: dict) -> None:
    masks = {m["host"]: m for m in spec["mounts"] if m.get("mask")}
    want = expected_masks(settings)
    assert want <= set(masks), sorted(want - set(masks))
    assert set(masks) <= want, sorted(set(masks) - want)
    for host, m in masks.items():
        assert m["mode"] == "ro" and m["container"] == host
        assert effective(spec, host) == "ro", host
        assert effective_in_container(spec, host) == "ro", host
        # A mask the runner may skip when its path is missing must sit under a read-only mount already.
        if m.get("if_missing") == "skip":
            parents = [p for p in spec["mounts"] if ancestor(p["host"], host)]
            deepest = max(parents, key=lambda p: len(PurePosixPath(p["host"]).parts))
            assert deepest["mode"] == "ro", host
        else:
            assert m.get("if_missing") == "empty", host


@pytest.mark.parametrize("name", sorted(WRITING))
def test_every_writing_spec_carries_the_masks(
    specs: dict[str, dict], name: str
) -> None:
    check_masks(specs[name], name, fixture_settings())


@pytest.mark.parametrize("name", sorted(set(ALL_SPECS) - WRITING))
def test_a_spec_that_writes_no_repository_carries_no_masks_and_writes_no_repository(
    specs: dict[str, dict], name: str
) -> None:
    spec = specs[name]
    assert not any(m.get("mask") for m in spec["mounts"])
    for m in spec["mounts"]:
        if m["mode"] == "rw":
            assert not under(m["host"], W) and not under(m["host"], GIT), (name, m)


def test_the_fixture_masks_include_the_human_only_paths() -> None:
    want = expected_masks(fixture_settings())
    for p in (
        ".claude",
        "CLAUDE.md",
        "REVIEW.md",
        "tools/gates",
        ".specify/memory/constitution.md",
        "assets/policy",
    ):
        assert f"{W}/{p}" in want
    assert f"{GIT}/refs/replace" in want


def test_the_committed_masks_follow_the_real_main() -> None:
    """The committed specs carry the masks main's settings call for today."""
    blob = main_blob(".claude/settings.json")
    if blob is None:
        pytest.skip("no refs/heads/main here (an export): the fixture's copy stands in")
    settings = json.loads(blob)
    for name in sorted(WRITING):
        check_masks(load(name), name, settings)
    for name in SESSION_ROLES:
        assert mount_violations(load(name), name, settings) == [], name
    banned = {
        v["name"] for v in settings["sandbox"].get("credentials", {}).get("envVars", [])
    }
    for name in SESSION_ROLES:
        assert not set(load(name)["env"]) & banned, name


def test_the_fixture_is_mains_copy() -> None:
    blob = main_blob(".claude/settings.json")
    if blob is None:
        pytest.skip("no refs/heads/main here (an export)")
    main = json.loads(blob)["sandbox"]
    fixture = fixture_settings()["sandbox"]
    assert fixture["filesystem"]["denyWrite"] == main["filesystem"]["denyWrite"]
    assert fixture["filesystem"]["denyRead"] == main["filesystem"]["denyRead"]
    assert fixture["network"]["allowedDomains"] == main["network"]["allowedDomains"]


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
    proxy = "http://egress-studio:3128" if name == "studio" else "http://egress:3128"
    assert env["HTTPS_PROXY"] == proxy
    assert env["https_proxy"] == proxy
    claude = [m for m in spec["mounts"] if m["container"] == "/night/claude"]
    assert claude == [{"host": "<claude>", "container": "/night/claude", "mode": "rw"}]
    io = [m for m in spec["mounts"] if m["container"] == "/night/io"]
    assert io == [{"host": "<io>", "container": "/night/io", "mode": "rw"}]
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


def test_comfyui_gets_no_token_and_no_proxy(specs: dict[str, dict]) -> None:
    spec = specs["comfyui"]
    assert spec["env_file"] is None
    assert not {"HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"} & set(
        spec["env"]
    )


def test_the_plan_gets_its_credentials_only_by_env_file(specs: dict[str, dict]) -> None:
    spec = specs["plan"]
    assert spec["env_file"] == "<credentials>"
    assert "SANDBOX_RUNTIME" not in spec["env"], (
        "infra_plan.py refuses inside a sandbox"
    )
    assert spec["env"]["HTTPS_PROXY"] == "http://egress-plan:3128"


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
            "deploy/night-shift/claude/managed-settings.json is G1's (T020), not on this branch yet"
        )
    assert json.loads(path.read_text(encoding="utf-8")) == MANAGED


@pytest.mark.parametrize("name", DOCKERFILES)
def test_bases_come_only_through_pinned_arguments(name: str) -> None:
    for ins in instructions(dockerfile(name)):
        if ins.upper().startswith("FROM "):
            assert re.fullmatch(r"FROM \$\{[A-Z_]+\}( AS [a-z0-9-]+)?", ins), ins
    assert not re.search(r"[0-9a-f]{64}", dockerfile(name)), (
        "a digest belongs in pins.json"
    )
    assert ":latest" not in dockerfile(name)


@pytest.mark.parametrize("name", DOCKERFILES)
def test_no_credential_in_an_image(name: str) -> None:
    for ins in instructions(dockerfile(name)):
        if ins.upper().startswith(("ENV ", "ARG ")):
            assert not re.search(r"TOKEN|API_KEY|SECRET|PASSWORD|AWS_", ins), ins
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in dockerfile(name)


def test_the_worker_image_bakes_each_role_layer() -> None:
    ins = instructions(dockerfile("worker"))
    for role in WORKER_ROLES:
        want = f"COPY --chmod=0444 deploy/night-shift/claude/{role}.settings.json /night/settings-{role}.json"
        assert want in ins, role
    assert not any("studio.settings.json" in i for i in ins)
    assert any(re.fullmatch(r"FROM \$\{TOOLCHAIN_IMAGE\}", i) for i in ins)
    assert any("claude --version" in i and "CLAUDE_CODE_VERSION" in i for i in ins)
    assert any("socat" in i for i in ins) or "socat" in (
        IMAGES / "entrypoint.sh"
    ).read_text(encoding="utf-8")
    assert (
        "COPY --chmod=0555 deploy/night-shift/images/entrypoint.sh /night/entrypoint.sh"
        in ins
    )


def test_the_studio_image_bakes_its_layer_and_checks_blender() -> None:
    text = dockerfile("studio")
    ins = instructions(text)
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
        pytest.skip("the role layers are G1's (T020), not on this branch yet")
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
        assert re.search(rf"^ARG {arg}$", text, flags=re.MULTILINE), arg
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


@pytest.mark.parametrize("name", ALL_SPECS)
def test_only_internal_networks(specs: dict[str, dict], name: str) -> None:
    nets = specs[name]["networks"]
    assert nets and set(nets) <= INTERNAL, nets
    assert len(nets) == len(set(nets))
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
    outer = [n for n, v in nets.items() if not v["internal"]]
    assert outer == ["h4-night-out"]


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
def test_networks_role_by_role(specs: dict[str, dict], name: str) -> None:
    assert specs[name]["networks"] == EXPECTED_NETWORKS[name]


# ---------------------------------------------------------------------------------------------------------------
# 8. The lattice (plan §2), mount by mount
# ---------------------------------------------------------------------------------------------------------------
PW = {"host": f"{SHARE}/passwd", "container": "/etc/passwd", "mode": "ro"}
GR = {"host": f"{SHARE}/group", "container": "/etc/group", "mode": "ro"}
OWN_GIT = [
    f"{GIT}/objects",
    f"{GIT}/refs/heads/night/<task>",
    f"{GIT}/logs/refs/heads/night/<task>",
    f"{GIT}/worktrees/<task>",
]


def same(host: str, mode: str) -> tuple[str, str, str]:
    return (host, host, mode)


SESSION_BASE = {
    ("<claude>", "/night/claude", "rw"),
    ("<io>", "/night/io", "rw"),
    tuple(PW.values()),
    tuple(GR.values()),
}
WRITER = (
    SESSION_BASE | {same(W, "rw"), same(GIT, "ro")} | {same(p, "rw") for p in OWN_GIT}
)
READER = SESSION_BASE | {same(W, "ro"), same(GIT, "ro")}
ENGINE = {("{{ENGINE_CERTS}}", "/night/engine", "ro")}
EXPECTED_MOUNTS = {
    "supervisor": WRITER
    | {
        same("{{NIGHT_ROOT}}", "ro"),
        same("/srv/studio/briefs", "ro"),
        same("/srv/studio/handoff", "ro"),
    },
    "spec-writer": WRITER,
    "implementer": WRITER
    | ENGINE
    | {same("/srv/studio/briefs", "rw"), same("/srv/studio/handoff", "ro")},
    "ops": WRITER
    | ENGINE
    | {same("/srv/studio/briefs", "rw"), same("/srv/studio/handoff", "ro")},
    "reviewer": READER,
    "red-teamer": READER | ENGINE,
    "gate-runner": READER,
    "studio": SESSION_BASE
    | {
        same("/srv/studio/handoff", "rw"),
        same("/srv/studio/outputs", "rw"),
        same("/srv/studio/briefs", "ro"),
        same("/srv/studio/workflows", "ro"),
    },
    "plan": {tuple(PW.values()), tuple(GR.values()), same(W, "ro"), same(GIT, "ro")}
    | {
        same("{{HOME}}/.config/h4reet-ai/infra/data", "rw"),
        same("{{HOME}}/.config/h4reet-ai/infra/plans", "rw"),
        same("{{HOME}}/.config/h4reet-ai/infra/state", "rw"),
        same("{{HOME}}/.config/h4reet-ai/infra/<root>.env", "ro"),
        same("{{HOME}}/.local/share/h4reet/terraform-providers", "ro"),
    },
    "comfyui": {tuple(PW.values()), tuple(GR.values())}
    | {
        same("{{COMFYUI_DIR}}", "ro"),
        same("{{COMFYUI_VENV}}", "ro"),
        same("/srv/studio/outputs", "rw"),
        ("{{NIGHT_ROOT}}/.comfyui/user", "/night/comfyui/user", "rw"),
    },
}


@pytest.mark.parametrize("name", ALL_SPECS)
def test_mounts_role_by_role(specs: dict[str, dict], name: str) -> None:
    got = {
        (m["host"], m["container"], m["mode"])
        for m in specs[name]["mounts"]
        if not m.get("mask")
    }
    assert got == EXPECTED_MOUNTS[name], (
        sorted(got - EXPECTED_MOUNTS[name]),
        sorted(EXPECTED_MOUNTS[name] - got),
    )


def test_the_own_refs_are_made_by_the_runner_when_missing(
    specs: dict[str, dict],
) -> None:
    for name in sorted(WRITING):
        for m in specs[name]["mounts"]:
            if m["host"] in OWN_GIT[1:]:
                assert m.get("if_missing") == "create", (name, m)


def ceiling(specs: dict[str, dict]) -> dict:
    """The union of every session spec: each mount at its widest mode, every network, request, and device."""
    mounts: dict[str, dict] = {}
    for name in SESSION_ROLES:
        for m in specs[name]["mounts"]:
            cur = mounts.get(m["host"])
            if cur is None or RANK[m["mode"]] > RANK[cur["mode"]]:
                mounts[m["host"]] = {
                    "host": m["host"],
                    "container": m["container"],
                    "mode": m["mode"],
                }
    # The union of masks is no mask: a path one role masks and another writes is writable in the ceiling.
    for host, m in mounts.items():
        widest = max(
            (effective(specs[n], host) for n in SESSION_ROLES), key=lambda v: RANK[v]
        )
        m["mode"] = widest
    return {
        "mounts": list(mounts.values()),
        "networks": sorted({n for r in SESSION_ROLES for n in specs[r]["networks"]}),
        "requests": sorted({q for r in SESSION_ROLES for q in specs[r]["requests"]}),
        "gpus": "all" if any("gpus" in specs[r] for r in SESSION_ROLES) else None,
        "read_only": all(specs[r]["read_only"] for r in SESSION_ROLES),
        "cap_add": [],
        "security_opt": ["no-new-privileges"],
        "limits": {
            "memory": max(
                int(specs[r]["limits"]["memory"][:-1]) for r in SESSION_ROLES
            ),
            "cpus": max(float(specs[r]["limits"]["cpus"]) for r in SESSION_ROLES),
            "pids": max(specs[r]["limits"]["pids"] for r in SESSION_ROLES),
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
    for p in child["mounts"]:
        match = [m for m in parent["mounts"] if under(p["host"], m["host"])]
        if match:
            deepest = max(match, key=lambda m: len(PurePosixPath(m["host"]).parts))
            rel = PurePosixPath(p["host"]).relative_to(deepest["host"])
            if str(PurePosixPath(deepest["container"]) / rel) != p["container"]:
                bad.append(f"mount {p['host']} lands at {p['container']} in the child")
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
def test_each_spec_is_within_its_lattice_parent(
    specs: dict[str, dict], name: str
) -> None:
    parent_name = LATTICE[name]
    parent = ceiling(specs) if parent_name == "ceiling" else specs[parent_name]
    assert lattice_violations(specs[name], parent) == []


def test_the_lattice_check_catches_a_widening(specs: dict[str, dict]) -> None:
    impl = specs["implementer"]
    wider = json.loads(json.dumps(specs["spec-writer"]))
    wider["mounts"].append(
        {
            "host": "/srv/studio/handoff",
            "container": "/srv/studio/handoff",
            "mode": "rw",
        }
    )
    assert lattice_violations(wider, impl)
    unmasked = json.loads(json.dumps(specs["spec-writer"]))
    unmasked["mounts"] = [m for m in unmasked["mounts"] if m["host"] != f"{W}/.claude"]
    assert lattice_violations(unmasked, impl)
    netted = json.loads(json.dumps(specs["reviewer"]))
    netted["networks"].append("h4-night-engine")
    assert lattice_violations(netted, specs["spec-writer"])
    asks = json.loads(json.dumps(specs["implementer"]))
    asks["requests"].append("gate")
    assert lattice_violations(asks, specs["ops"])
    gpu = json.loads(json.dumps(specs["reviewer"]))
    gpu["gpus"] = "all"
    assert lattice_violations(gpu, specs["spec-writer"])
    moved = json.loads(json.dumps(specs["reviewer"]))
    for m in moved["mounts"]:
        if m["host"] == "<claude>":
            m["container"] = "/elsewhere"
    assert lattice_violations(moved, specs["spec-writer"])


def test_the_ceiling_is_the_union(specs: dict[str, dict]) -> None:
    top = ceiling(specs)
    assert effective(top, f"{W}/.claude") == "ro", (
        "every role that writes the worktree masks .claude"
    )
    assert effective(top, "/srv/studio/outputs") == "rw"
    assert set(top["networks"]) == {"h4-night", "h4-night-engine", "h4-night-studio"}
    assert "h4-night-plan" not in top["networks"], (
        "the plan's network is the runner's alone"
    )


# ---------------------------------------------------------------------------------------------------------------
# 9. Placeholders, and the runner's tokens
# ---------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", ALL_SPECS)
def test_only_known_placeholders(name: str) -> None:
    text = (CONTAINERS / f"{name}.json").read_text(encoding="utf-8")
    found = set(re.findall(r"\{\{([^{}]*)\}\}", text))
    assert found <= PLACEHOLDERS, found - PLACEHOLDERS
    assert (
        text.count("{{")
        == text.count("}}")
        == len(re.findall(r"\{\{[A-Z_]+\}\}", text))
    )


@pytest.mark.parametrize("name", ALL_SPECS)
def test_only_known_tokens(specs: dict[str, dict], name: str) -> None:
    spec = specs[name]
    texts = [m["host"] for m in spec["mounts"]] + [
        m["container"] for m in spec["mounts"]
    ]
    texts += [spec["workdir"], spec["env_file"] or ""] + list(spec.get("command", []))
    found = {t for s in texts for t in re.findall(r"<([^<>]*)>", s)}
    assert found <= TOKENS, found - TOKENS


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


def test_build_refuses_an_unknown_token(scratch: Path) -> None:
    frag = scratch / "containers" / "fragments.json"
    frag.write_text(
        frag.read_text(encoding="utf-8").replace("<io>", "<inbox>", 1), encoding="utf-8"
    )
    done = run_build(
        "--settings", str(FIXTURE), build=scratch / "containers" / "build.py"
    )
    assert done.returncode == 2
    assert "inbox" in done.stdout + done.stderr


# ---------------------------------------------------------------------------------------------------------------
# 10. Off: the plan's values, saved plans, and the provider mirror are the plan container's alone
# ---------------------------------------------------------------------------------------------------------------
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
# 11. The example marker
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
