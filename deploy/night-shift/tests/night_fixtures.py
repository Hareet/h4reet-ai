"""Fixtures for the night-shift runner's tests (spec 017, tasks.md T010 to T017; contracts/runner.md).

No conftest.py: each test file loads this module and `runner/night.py` by path, as tools/gates/test/ does.

Nothing here calls Docker, git, aws, or claude. `FakeFx` stands in for every external effect the runner has: it answers
`docker`, `git`, `aws`, and the gate by argument list, keeps a fake clock, records each sleep, and reports disk and
memory from a dict. Locks are real `flock(2)` locks on files under the fake home, so a test can hold one itself.

The fake home follows data-model.md: `~/.config/h4reet-ai/night-shift/` (the live specs, the token file, the facts),
`~/.local/share/h4reet-ai/night-shift/` (prompts, role Claude folders, installed.txt), and
`~/.local/state/h4reet-ai/night-shift/` (locks, log, state). The specs follow contracts/containers.md §2 with the
placeholders already filled, as the install leaves them. The token's value is made at run time.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NIGHT_PY = HERE.parent / "runner" / "night.py"
COMFY_PARAMS = HERE / "fixtures" / "comfyui-params.json"
# main's .claude/hooks/protected-paths.sh, verbatim (named .txt so shellcheck leaves the copy alone).
HOOK_FIXTURE = HERE / "fixtures" / "protected-paths.sh.txt"

SESSION_ROLES = (
    "supervisor",
    "spec-writer",
    "implementer",
    "reviewer",
    "red-teamer",
    "ops",
    "gate-runner",
    "studio",
)
PARENT = {
    "supervisor": "ceiling",
    "ops": "ceiling",
    "implementer": "ops",
    "spec-writer": "implementer",
    "reviewer": "spec-writer",
    "red-teamer": "implementer",
    "gate-runner": "ceiling",
    "studio": "ceiling",
    "plan": "ceiling",
    "comfyui": "ceiling",
}
BILLING_VARS = (
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
)
SHA12 = "0123456789ab"
UID, GID = "1000", "1000"
NIGHT = "2026-11-14"
GIT_PREFIX = ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"]

# A subset of main's sandbox.filesystem.denyWrite, in its own shapes: worktree paths, .git paths, and paths outside.
MAIN_SETTINGS = {
    "sandbox": {
        "filesystem": {
            "denyWrite": [
                "./CLAUDE.md",
                "./REVIEW.md",
                "./.claude",
                "./.specify/memory/constitution.md",
                "./tools/gates",
                "./GNUmakefile",
                "./makefile",
                "./.git/hooks",
                "./.git/config",
                "./.git/refs/heads/main",
                "./.git/refs/replace",
                "~/.aws",
                "/srv/studio/photos",
            ]
        }
    }
}
# Paths the fake worktree checkout holds (so their masks exist); ./makefile is absent on purpose.
WORKTREE_FILES = (
    "CLAUDE.md",
    "REVIEW.md",
    ".specify/memory/constitution.md",
    "GNUmakefile",
    "README.md",
)
WORKTREE_DIRS = (".claude", "tools/gates")


def load_night():
    """night.py, loaded by path. Every test calls this, so a missing runner fails each test, not the collection."""
    spec = importlib.util.spec_from_file_location("night", NIGHT_PY)
    assert spec and spec.loader, NIGHT_PY
    mod = importlib.util.module_from_spec(spec)
    sys.modules["night"] = mod
    spec.loader.exec_module(mod)
    return mod


def token_value() -> str:
    # Built at run time: the content scan refuses hash-shaped literals.
    return "tok-" + hashlib.sha256(b"night-shift-fixture").hexdigest()


def sha40(seed: str) -> str:
    return hashlib.sha1(seed.encode()).hexdigest()


class Home:
    """A fake $HOME with everything the install leaves, filled for one machine."""

    def __init__(self, root: Path):
        self.root = root
        self.home = root / "home" / "author"
        self.repo = self.home / "h4reet-ai" / "h4reet-ai"
        self.night_root = self.home / "h4reet-ai" / "night"
        self.config = self.home / ".config" / "h4reet-ai" / "night-shift"
        self.live = self.config / "containers"
        self.token = self.config / "claude.env"
        self.facts = self.config / "facts.env"
        self.share = self.home / ".local" / "share" / "h4reet-ai" / "night-shift"
        self.prompts = self.share / "prompts"
        self.installed = self.share / "installed.txt"
        self.state = self.home / ".local" / "state" / "h4reet-ai" / "night-shift"
        self.engine_certs = (
            self.home / ".config" / "h4reet" / "agents-engine" / "docker"
        )
        self.comfyui_dir = self.home / "ComfyUI"
        self.comfyui_venv = self.home / "flux-env"
        self.blender = self.home / "blender-5.2.3-linux-x64"
        self.images = {
            f"h4-night-worker:{SHA12}": "sha256:"
            + hashlib.sha256(b"worker").hexdigest(),
            f"h4-night-studio:{SHA12}": "sha256:"
            + hashlib.sha256(b"studio").hexdigest(),
            f"h4-night-comfyui:{SHA12}": "sha256:"
            + hashlib.sha256(b"comfyui").hexdigest(),
            f"h4-night-egress:{SHA12}": "sha256:"
            + hashlib.sha256(b"egress").hexdigest(),
        }
        self.facts_values = {
            "REPO": str(self.repo),
            "NIGHT_ROOT": str(self.night_root),
            "UID": UID,
            "GID": GID,
            "CLAUDE_VERSION": "2.1.322",
            "BLENDER_DIR": str(self.blender),
            "COMFYUI_DIR": str(self.comfyui_dir),
            "COMFYUI_VENV": str(self.comfyui_venv),
            "COMFYUI_PORT": "8188",
            "ENGINE_CERTS": str(self.engine_certs),
            "NIGHT_PLAN": "off",
            "NIGHT_GATE": "off",
            "PLAN_AWS_PROFILE": "h4-agent-plan",
        }
        self.build()

    # ---- the tree -------------------------------------------------------------------------------------------------
    def build(self) -> None:
        for d in (
            self.live,
            self.prompts,
            self.state,
            self.night_root,
            self.engine_certs,
            self.blender,
            self.comfyui_dir,
            self.comfyui_venv,
            self.home / ".config/h4reet-ai/infra/data",
            self.home / ".config/h4reet-ai/infra/plans",
        ):
            d.mkdir(parents=True, exist_ok=True)
        git = self.repo / ".git"
        for d in (
            "hooks",
            "info",
            "refs/heads",
            "refs/tags",
            "objects/info",
            "worktrees",
        ):
            (git / d).mkdir(parents=True, exist_ok=True)
        (git / "config").write_text("[core]\n\tbare = false\n")
        (git / "packed-refs").write_text("")
        # The main checkout's own HEAD and index, which the runner masks too (contracts/runner.md §3).
        (git / "HEAD").write_text("ref: refs/heads/main\n")
        (git / "index").write_bytes(b"DIRC")
        (git / "refs" / "heads" / "main").write_text(sha40("main") + "\n")
        for role in SESSION_ROLES:
            (self.prompts / f"{role}.md").write_text(
                f"You are the night shift's {role}.\n"
            )
            (self.share / "claude" / role).mkdir(parents=True, exist_ok=True)
        self.write_token(f"CLAUDE_CODE_OAUTH_TOKEN={token_value()}\n")
        self.write_facts()
        (self.config / "allowlist.json").write_text(
            '{"sandbox": {"network": {"allowedDomains": ["x.test"]}}}\n'
        )
        (self.config / "allowlist-studio.json").write_text(
            '{"sandbox": {"network": {"allowedDomains": ["api.anthropic.com"]}}}\n'
        )
        (self.config / "allowlist-plan.json").write_text(
            '{"sandbox": {"network": {"allowedDomains": ["sts.amazonaws.com"]}}}\n'
        )
        # The ComfyUI allowlist is G3's (T045): fixtures/comfyui-params.json is a verbatim copy of its file, as the
        # install would place it.
        (self.config / "comfyui-params.json").write_bytes(COMFY_PARAMS.read_bytes())
        for role in (*SESSION_ROLES, "plan", "comfyui"):
            self.write_spec(role, self.spec_for(role))

    def write_token(self, text: str, mode: int = 0o600) -> None:
        self.token.write_text(text)
        os.chmod(self.token, mode)

    def write_facts(self) -> None:
        lines = [
            "# machine facts, read as data",
            *(f"{k}={v}" for k, v in self.facts_values.items()),
        ]
        self.facts.write_text("\n".join(lines) + "\n")

    def set_fact(self, key: str, value: str | None) -> None:
        if value is None:
            self.facts_values.pop(key, None)
        else:
            self.facts_values[key] = value
        self.write_facts()

    def spec_for(self, role: str) -> dict:
        """A live spec of contracts/containers.md §2's shape, placeholders filled, `x-h4` dropped (the install's fill)."""
        image = {
            "studio": f"h4-night-studio:{SHA12}",
            "comfyui": f"h4-night-comfyui:{SHA12}",
        }.get(role, f"h4-night-worker:{SHA12}")
        env = {
            "HTTPS_PROXY": "http://egress-studio:3128"
            if role in ("studio", "comfyui")
            else "http://egress:3128",
            "NO_PROXY": "engine-fwd",
            "SANDBOX_RUNTIME": "1",
            "DISABLE_AUTOUPDATER": "1",
            "DISABLE_TELEMETRY": "1",
            "DISABLE_ERROR_REPORTING": "1",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        }
        certs = {
            "host": str(self.engine_certs),
            "container": "/night/engine-certs",
            "mode": "ro",
        }
        mounts = {
            "supervisor": [
                {
                    "host": str(self.night_root),
                    "container": str(self.night_root),
                    "mode": "ro",
                },
                {
                    "host": "/srv/studio/briefs",
                    "container": "/srv/studio/briefs",
                    "mode": "ro",
                },
                {
                    "host": "/srv/studio/handoff",
                    "container": "/srv/studio/handoff",
                    "mode": "ro",
                },
            ],
            "spec-writer": [],
            "reviewer": [],
            "implementer": [
                {
                    "host": "/srv/studio/briefs",
                    "container": "/srv/studio/briefs",
                    "mode": "rw",
                },
                {
                    "host": "/srv/studio/handoff",
                    "container": "/srv/studio/handoff",
                    "mode": "ro",
                },
                certs,
            ],
            "red-teamer": [certs],
            "ops": [
                {
                    "host": "/srv/studio/briefs",
                    "container": "/srv/studio/briefs",
                    "mode": "rw",
                },
                {
                    "host": "/srv/studio/handoff",
                    "container": "/srv/studio/handoff",
                    "mode": "ro",
                },
                certs,
            ],
            "gate-runner": [],
            "studio": [
                {
                    "host": "/srv/studio/handoff",
                    "container": "/srv/studio/handoff",
                    "mode": "rw",
                },
                {
                    "host": "/srv/studio/outputs",
                    "container": "/srv/studio/outputs",
                    "mode": "rw",
                },
                {
                    "host": "/srv/studio/briefs",
                    "container": "/srv/studio/briefs",
                    "mode": "ro",
                },
                {
                    "host": "/srv/studio/workflows",
                    "container": "/srv/studio/workflows",
                    "mode": "ro",
                },
                {
                    "host": str(self.blender),
                    "container": str(self.blender),
                    "mode": "ro",
                },
            ],
            "plan": [
                {
                    "host": str(self.home / ".config/h4reet-ai/infra/data"),
                    "container": "/night/infra/data",
                    "mode": "rw",
                },
                {
                    "host": str(self.home / ".config/h4reet-ai/infra/plans"),
                    "container": "/night/infra/plans",
                    "mode": "rw",
                },
            ],
            "comfyui": [
                {
                    "host": "/srv/studio/outputs",
                    "container": "/srv/studio/outputs",
                    "mode": "rw",
                },
                {
                    "host": str(self.comfyui_dir),
                    "container": str(self.comfyui_dir),
                    "mode": "ro",
                },
                {
                    "host": str(self.comfyui_venv),
                    "container": str(self.comfyui_venv),
                    "mode": "ro",
                },
            ],
        }[role]
        networks = {
            "implementer": ["h4-night", "h4-night-engine"],
            "red-teamer": ["h4-night", "h4-night-engine"],
            "ops": ["h4-night", "h4-night-engine"],
            "studio": ["h4-night-studio"],
            "comfyui": ["h4-night-studio"],
            "plan": ["h4-night-plan"],
        }.get(role, ["h4-night"])
        spec = {
            "role": role,
            "parent": PARENT[role],
            "image": image,
            "user": f"{UID}:{GID}",
            "mounts": mounts,
            "networks": networks,
            "env": env,
            "env_file": str(self.token),
            "cap_drop": ["ALL"],
            "security_opt": ["no-new-privileges"],
            "read_only": role not in ("studio", "comfyui"),
            "tmpfs": ["/tmp:rw,nosuid,size=2g"],
            "limits": {
                "memory": "2g" if role == "supervisor" else "4g",
                "cpus": "2",
                "pids": 512,
            },
        }
        if role in ("studio", "comfyui"):
            spec["gpus"] = "all"
        if role == "comfyui":
            spec["env"] = {}
            spec["env_file"] = None
        if role == "plan":
            spec["env"] = {"HTTPS_PROXY": "http://egress-plan:3128"}
            spec["env_file"] = None
        return spec

    def write_spec(self, role: str, spec: dict | str, record: bool = True) -> Path:
        path = self.live / f"{role}.json"
        text = spec if isinstance(spec, str) else json.dumps(spec, indent=2) + "\n"
        if path.exists():
            os.chmod(path, 0o644)
        path.write_text(text)
        if record:
            self.record_installed()
        return path

    def record_installed(self) -> None:
        lines = []
        for p in sorted(self.live.glob("*.json")):
            if p.is_symlink():
                continue
            lines.append(f"file {p} {hashlib.sha256(p.read_bytes()).hexdigest()}")
        for ref, image_id in self.images.items():
            lines.append(f"image {ref} {image_id}")
        self.installed.write_text("\n".join(lines) + "\n")


class Result:
    def __init__(self, rc: int = 0, out: str = "", err: str = ""):
        self.rc, self.out, self.err = rc, out, err


def is_git(argv) -> bool:
    return bool(argv) and argv[0] == "git"


class FakeFx:
    """Every external effect, stubbed. Subclasses the runner's real Effects for the filesystem and lock helpers."""

    def __init__(self, night, h: Home):
        base = night.Effects

        class _Fx(base):  # type: ignore[misc, valid-type]
            pass

        self._real = _Fx()
        self.night = night
        self.h = h
        self.t = 1_800_000_000.0
        self.sleeps: list[float] = []
        self.pauses: list[float] = []
        self.calls: list[tuple[list[str], dict]] = []
        self.spawned: list[tuple[str, list[str]]] = []
        self.events: list[tuple] = []
        self.environ: dict[str, str] = {"PATH": "/usr/bin:/bin", "HOME": str(h.home)}
        self.disk = {"/": 200 * 2**30, "/mnt/c": 100 * 2**30}
        self.mem = 32 * 2**30
        self.mem_total_bytes = 62 * 2**30
        self.branch_changes: list[str] = []
        self.main_hook: str | None = HOOK_FIXTURE.read_text()
        self.internal = {
            "h4-night": "true",
            "h4-night-studio": "true",
            "h4-night-plan": "true",
            "h4-night-engine": "true",
        }
        self.docker_images = dict(h.images)
        self.dirty: dict[str, str] = {}
        self.procs: dict[str, str] = {}
        self.repo_head = "refs/heads/main"
        self.repo_dirty = ""
        self.existing_branches: set[str] = set()
        self.main_settings = json.dumps(MAIN_SETTINGS)
        self.unresolvable: set[str] = set()
        self.gate_out = "gate: passed (fixture)\nmerge: would merge cleanly\n"
        self.plan_seen: list[dict] = []
        self.gate_seen: list[dict] = []
        self.comfy_ready = True
        self.signals: list = []
        self.defer_jobs = False
        self.deferred: dict = {}
        self.terminated: list[dict] = []
        self.kills: list = []
        self.cmdlines: dict[int, bytes] = {}
        self.present = {
            "/srv/studio/briefs",
            "/srv/studio/handoff",
            "/srv/studio/outputs",
            "/srv/studio/workflows",
        }

    # ---- the clock ------------------------------------------------------------------------------------------------
    def now(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.t += seconds

    def pause(self, seconds: float) -> None:
        self.pauses.append(seconds)
        self.t += seconds

    # ---- readings -------------------------------------------------------------------------------------------------
    def disk_free(self, path: str) -> int:
        if path not in self.disk:
            raise OSError(f"no such mount: {path}")
        return self.disk[path]

    def mem_available(self) -> int:
        return self.mem

    def mem_total(self) -> int:
        return self.mem_total_bytes

    def exists(self, path: str) -> bool:
        return path in self.present or os.path.lexists(path)

    def realpath(self, path: str) -> str:
        return os.path.realpath(path)

    # ---- locks: real flock(2) under the fake home ---------------------------------------------------------------
    def lock(self, path):
        return self._real.lock(path)

    def unlock(self, handle) -> None:
        self._real.unlock(handle)

    # ---- processes ------------------------------------------------------------------------------------------------
    def signal(self, signum, handler) -> None:
        self.signals.append((signum, handler))

    def run_proc(self, key: str, argv, *, env=None, cwd=None, timeout=None):
        """A job's long process (the gate), which terminate(key) can end."""
        return self.run(argv, env=env, cwd=cwd, timeout=timeout)

    def terminate(self, key: str) -> None:
        gate_path = str(self.h.state / "locks" / "gate")
        probe = self._real.lock(gate_path)
        if probe is not None:
            self._real.unlock(probe)
        self.terminated.append({"key": key, "gate_lock_held": probe is None})

    def kill(self, pid: int, signum: int) -> None:
        self.kills.append((pid, signum))

    def cmdline(self, pid: int) -> bytes:
        return self.cmdlines.get(pid, b"")

    def pid(self) -> int:
        return 4242

    def spawn(self, key: str, argv: list[str], log_path: str | None = None) -> None:
        self.spawned.append((key, list(argv)))

    def start_job(self, key: str, fn) -> None:
        # Jobs run at once here; their result arrives as an event, as the real thread's would. With defer_jobs,
        # they stay pending (a gate still running when the night is stopped).
        if self.defer_jobs:
            self.deferred[key] = fn
            return
        self.events.append(("job", key, fn()))

    def wait(self, timeout):
        if self.events:
            return self.events.pop(0)
        if timeout:
            self.t += timeout
        return None

    def run(self, argv, *, env=None, cwd=None, timeout=None):
        argv = list(argv)
        self.calls.append((argv, {"env": dict(env or {}), "cwd": cwd}))
        if argv[:1] == ["docker"]:
            return self._docker(argv[1:])
        if is_git(argv):
            return self._git(argv, env or {})
        if argv[:3] == ["aws", "configure", "export-credentials"]:
            # Built at run time, and never a real key.
            return Result(
                0,
                "AWS_ACCESS_KEY_ID="
                + "AKIA"
                + "X" * 16
                + "\nAWS_SECRET_ACCESS_KEY="
                + "s" * 40
                + "\n",
            )
        if argv[:4] == ["/usr/bin/python3", "-I", "-B", "tools/gates/gate"]:
            gate_path = str(self.h.state / "locks" / "gate")
            probe = self._real.lock(gate_path)
            held = probe is None
            if probe is not None:
                self._real.unlock(probe)
            self.gate_seen.append({"argv": argv, "cwd": cwd, "gate_lock_held": held})
            return Result(0, self.gate_out)
        return Result(127, "", f"fake: no stub for {argv[0]}")

    def _docker(self, a):
        if a[:2] == ["network", "inspect"]:
            name = a[-1]
            if name not in self.internal:
                return Result(1, "", f"Error: network {name} not found")
            return Result(0, self.internal[name] + "\n")
        if a[:2] == ["image", "inspect"]:
            ref = a[-1]
            if ref not in self.docker_images:
                return Result(1, "", "Error: No such image")
            return Result(0, self.docker_images[ref] + "\n")
        if a[:1] == ["top"]:
            return Result(0, "COMMAND\n" + self.procs.get(a[1], "claude\n"))
        if a[:1] == ["exec"]:
            return Result(0 if self.comfy_ready else 7, "")
        if a[:1] == ["logs"]:
            return Result(0, "comfyui: last line\n")
        if a[:1] == ["ps"]:
            return Result(0, "h4-night-supervisor\nh4-night-egress\n")
        if a[:1] == ["run"] and "h4-night-plan" in " ".join(a):
            envf = a[a.index("--env-file") + 1]
            st = os.stat(envf)
            self.plan_seen.append(
                {"argv": ["docker", *a], "env_file": envf, "mode": st.st_mode & 0o777}
            )
            return Result(
                0, "<!-- h4-plan root=bootstrap -->\nNo changes.\n<!-- /h4-plan -->\n"
            )
        return Result(0, "")

    def _git(self, argv, env):
        assert argv[: len(GIT_PREFIX)] == GIT_PREFIX, argv
        a = argv[len(GIT_PREFIX) :]
        while a and a[0].startswith(("--git-dir=", "--work-tree=")):
            a = a[1:]
        if a[:2] == ["cat-file", "blob"]:
            if a[-1] == "refs/heads/main:.claude/hooks/protected-paths.sh":
                if self.main_hook is None:
                    return Result(128, "", "fatal: path not in refs/heads/main")
                return Result(0, self.main_hook)
            return Result(0, self.main_settings)
        if a[:1] == ["merge-base"]:
            return Result(0, sha40("merge-base") + "\n")
        if a[:1] == ["diff-tree"]:
            # The paths a branch changes since its merge base with main, NUL-separated (-z).
            return Result(0, "".join(f"{x}\0" for x in self.branch_changes))
        if a[:1] == ["rev-parse"]:
            target = a[-1].removesuffix("^{commit}")
            if target in self.unresolvable:
                return Result(1, "")
            if (
                target.startswith("refs/heads/")
                and target[len("refs/heads/") :] in self.existing_branches
            ):
                return Result(0, sha40(target) + "\n")
            if target.startswith("refs/heads/feat/"):
                return Result(1, "")
            return Result(0, sha40(target) + "\n")
        if a[:2] == ["worktree", "add"]:
            # worktree add -b <branch> <path> <base> | --detach <path> <sha> | <path> <branch>
            if a[2] == "-b":
                path = a[4]
            elif a[2] == "--detach":
                path = a[3]
            else:
                path = a[2]
            self.make_worktree(Path(path))
            return Result(0, "")
        if a[:2] == ["worktree", "remove"]:
            return Result(0, "")
        if a[:2] == ["status", "--porcelain"]:
            wt = env.get("GIT_WORK_TREE", "")
            if wt == str(self.h.repo):
                return Result(0, self.repo_dirty)
            return Result(0, self.dirty.get(wt, ""))
        if a[:3] == ["symbolic-ref", "-q", "HEAD"]:
            return Result(0, self.repo_head + "\n")
        if a[:1] == ["branch"]:
            return Result(0, "")
        return Result(0, "")

    def make_worktree(self, path: Path) -> None:
        admin = self.h.repo / ".git" / "worktrees" / path.name
        admin.mkdir(parents=True, exist_ok=True)
        (admin / "commondir").write_text("../..\n")
        (admin / "gitdir").write_text(f"{path}/.git\n")
        path.mkdir(parents=True, exist_ok=True)
        (path / ".git").write_text(f"gitdir: {admin}\n")
        for f in WORKTREE_FILES:
            (path / f).parent.mkdir(parents=True, exist_ok=True)
            (path / f).write_text("x\n")
        for d in WORKTREE_DIRS:
            (path / d).mkdir(parents=True, exist_ok=True)

    # ---- helpers for assertions -----------------------------------------------------------------------------------
    def docker_calls(self, sub: str | None = None) -> list[list[str]]:
        out = [c for c, _ in self.calls if c[:1] == ["docker"]]
        return [c for c in out if sub is None or c[1:2] == [sub]]

    def git_calls(self) -> list[tuple[list[str], dict]]:
        return [(c, k) for c, k in self.calls if is_git(c)]


def make_runner(night, h: Home, fx: FakeFx | None = None, *, night_date: str = NIGHT):
    fx = fx or FakeFx(night, h)
    paths = night.Paths.from_home(h.home)
    facts = night.read_facts(paths.facts)
    runner = night.Runner(paths, facts, fx, night_date)
    return runner, fx


def task(id_: str, role: str = "implementer", **kw) -> dict:
    t = {
        "id": id_,
        "role": role,
        "spec": "018-resume-links",
        "base": "refs/heads/main",
        "slug": kw.pop("slug", "s"),
        "locks": kw.pop("locks", ["gpu"] if role == "studio" else []),
        "after": kw.pop("after", []),
        "prompt": kw.pop("prompt", f"prompts/{role}.md"),
        "brief": kw.pop("brief", "one paragraph"),
    }
    t.update(kw)
    return t


def queue(*tasks: dict) -> dict:
    return {"schema": 1, "night": NIGHT, "tasks": list(tasks)}


def write_queue(runner, data) -> Path:
    path = Path(runner.queue_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data) if not isinstance(data, str) else data)
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
    return path


def event_line(obj: dict) -> str:
    return json.dumps(obj)


def assistant_text(text: str, model: str = "<synthetic>") -> str:
    return event_line(
        {
            "type": "assistant",
            "message": {"model": model, "content": [{"type": "text", "text": text}]},
        }
    )


def result_event(text: str = "done", is_error: bool = False) -> str:
    return event_line(
        {"type": "result", "subtype": "success", "is_error": is_error, "result": text}
    )


def page_text(runner) -> str:
    p = Path(runner.page_path())
    return p.read_text() if p.exists() else ""
