"""The night shift's runner (spec 017, plan §4; contracts/runner.md, queue.md, decision-page.md).

Installed copy only: ~/.local/share/h4reet-ai/night-shift/night.py, run as

    /usr/bin/python3 -I -B night.py start|stop|status|check

It is the only process outside every container, and the only one that uses the host's Docker socket. It starts the
supervisor and up to ten workers, each in its role's container; holds the matrix, gate, and gpu locks; answers the
sessions' requests; waits once for a usage limit's reset; stops idle sessions; and appends its own lines to the
decision page. It never commits for a session, never merges, and runs nothing from a working tree.

Every external effect goes through `Effects`: docker, git, aws, the gate, the clock, sleeping, signals, locks, and the
disk and memory readings. The tests replace it with a stub and never call Docker.

Safety rules this file keeps, each for a reason:
- Its own git runs as `git -c core.hooksPath=/dev/null -c core.fsmonitor=false` with GIT_NO_REPLACE_OBJECTS=1 and
  GIT_CONFIG_NOSYSTEM=1, without the caller's GIT_* variables, and names main only as refs/heads/main. In a session's
  worktree it sets GIT_DIR, GIT_COMMON_DIR, and GIT_WORK_TREE itself, never reading the worktree's own `.git` file
  again: an agent can rewrite that file, and the common dir's config is the only one it can't.
- Everything it reads or writes in a folder a session can write (the queue, the page, the inbox and outbox) is opened
  one component at a time with O_NOFOLLOW, so a planted link can't make it read or write outside as the Author.
- Every `docker run` line is built from a live spec whose SHA-256 the install recorded, checked again at each start
  against the never-mounted list (contracts/containers.md §3), the locks, and FR-041's variables.
- The token file is checked for mode and shape and passed only as `--env-file`. Its value is never read into a line
  this file prints or logs.
"""

from __future__ import annotations

import datetime as dt
import fcntl
import hashlib
import json
import os
import queue
import re
import signal
import stat
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

# ---- roles, locks, limits ---------------------------------------------------------------------------------------

ROLES = (
    "supervisor",
    "spec-writer",
    "implementer",
    "reviewer",
    "red-teamer",
    "ops",
    "gate-runner",
    "studio",
)
QUEUE_ROLES = ROLES[1:]  # the supervisor is the runner's, never a queue task
LOCKS = ("matrix", "gate", "gpu")
WRITING_WT = {
    "supervisor",
    "spec-writer",
    "implementer",
    "ops",
}  # worktree and .git read-write, masked
READING_WT = {"reviewer", "red-teamer", "gate-runner"}  # worktree and .git read-only
NO_WT = {"studio"}  # no worktree: the studio folders and its io folder
GPU_ROLES = {
    "studio",
    "comfyui",
}  # --gpus all, and --read-only off (contracts/containers.md §7)
FINAL_STATES = (
    "done",
    "failed",
    "refused",
)  # a second start the same night doesn't run these again
RESERVED_IDS = {
    "supervisor",
    "egress",
    "egress-studio",
    "egress-plan",
    "engine-fwd",
    "comfyui",
}

MAX_WORKERS = 10  # FR-018
STAGGER_S = 10  # contracts/runner.md §3
IDLE_S = 15 * 60  # FR-022: IDLE_MINUTES
LIMIT_MARGIN_S = 300  # the reset plus five minutes (plan §4)
STOP_GRACE_S = 60  # docker stop: SIGTERM, then SIGKILL after 60 s
MIN_DISK = 30 * 2**30  # the 2026-10-08 rule: / and /mnt/c
MIN_MEM = 8 * 2**30
DISKS = ("/", "/mnt/c")
FAST_FAIL_S = 120  # three sessions failing this soon after starting stop the night (a missed limit, probably)
FAST_FAIL_COUNT = 3
RETRY_S = 60  # a ready task waits on a lock another process holds, or on the gpu checks: look again this often
COMFY_READY_S = 120
COMFY_POLL_S = 2
IDLE_PROCS = {
    "claude",
    "node",
}  # "claude and its idle children" (contracts/runner.md §4)

NETWORKS = (
    "h4-night",
    "h4-night-studio",
    "h4-night-plan",
    "h4-night-engine",
)  # internal, all of them
OUT_NETWORK = (
    "h4-night-out"  # the egress helpers' ordinary network; no session joins it
)
SESSION_NETS = {"h4-night", "h4-night-engine"}
STUDIO_NETS = {"h4-night-studio"}
PLAN_NETS = {"h4-night-plan"}
ENGINE = (
    "TCP:198.18.0.1:2376"  # the agents' engine, the only place engine-fwd forwards to
)

# FR-041: an API-billing credential must exist nowhere a night container can see.
BILLING_VARS = (
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
)
SPEC_FORBIDDEN_ENV = (
    *BILLING_VARS,
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_OAUTH_TOKEN",
)  # and every AWS_* name
SESSION_ENV_REQUIRED = {
    "SANDBOX_RUNTIME": "1",
    "DISABLE_AUTOUPDATER": "1",
    "DISABLE_TELEMETRY": "1",
    "DISABLE_ERROR_REPORTING": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
}
ENV_ORDER = (
    "HTTPS_PROXY",
    "NO_PROXY",
    "SANDBOX_RUNTIME",
    "CLAUDE_CONFIG_DIR",
    "DISABLE_AUTOUPDATER",
    "DISABLE_TELEMETRY",
    "DISABLE_ERROR_REPORTING",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
)
CLAUDE_DIR_IN = "/night/claude"
IO_IN = "/night/io"
TOKEN_LINE = re.compile(r"CLAUDE_CODE_OAUTH_TOKEN=[A-Za-z0-9._~+/=-]+")

# The runner's own git (contracts/runner.md, first paragraph).
GIT_FLAGS = ("-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false")
GIT_ENV = {
    "GIT_NO_REPLACE_OBJECTS": "1",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_TERMINAL_PROMPT": "0",
}
MAIN = "refs/heads/main"

# The masks every writing session gets over `.git` (contracts/containers.md §4), in this order, then the task's own
# commondir, then the `.git` paths main's settings deny, then the worktree paths main's settings deny.
# HEAD and index are the main checkout's own; no worktree uses them, and without the masks a session could move the
# Author's HEAD or rewrite his staging area (a departure from containers.md §4's list, named in runner.md §3).
GIT_MASKS = (
    "hooks",
    "config",
    "info",
    "packed-refs",
    "refs/heads/main",
    "refs/tags",
    "objects/info",
    "HEAD",
    "index",
)

OFF_ANSWER = "off: waiting for P-2, P-3, P-6"  # plan §8
PLAN_ROOTS = ("bootstrap", "account", "prod")
SHA40 = re.compile(r"[0-9a-f]{40}")
TASK_ID = re.compile(r"[a-z0-9-]{3,40}")
SLUG = re.compile(r"[a-z0-9-]{1,40}")
STACK_NAME = re.compile(r"feat/[0-9]{3}-[a-z0-9-]{1,60}")
FULL_REF = re.compile(r"refs/(?:heads|tags)/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}")
REQ_NAME = re.compile(r"[0-9]{1,6}\.json")
NIGHT_NAME = re.compile(r"h4-night-[a-z0-9-]{1,60}")
IMAGE = re.compile(r"h4-night-[a-z0-9-]+:[A-Za-z0-9._-]+")
TASK_KEYS = {
    "id",
    "role",
    "spec",
    "base",
    "slug",
    "locks",
    "after",
    "prompt",
    "brief",
    "name",
}

# ComfyUI (contracts/runner.md §5): the runner fixes these; an agent's parameter may never name one.
COMFY_FIXED = (
    "--listen",
    "--port",
    "--output-directory",
    "--temp-directory",
    "--user-directory",
)
COMFY_TEMP = "/comfyui/temp"
COMFY_USER = "/comfyui/user"
COMFY_READY_PY = (
    "import urllib.request as u;"
    "u.build_opener(u.ProxyHandler({})).open('http://127.0.0.1:%s/system_stats', timeout=3)"
)

# ---- the usage limit's message ------------------------------------------------------------------------------------
# Claude Code's stream-json text for the plan's limit isn't documented, so this is the one place that knows it. The
# first real limit will confirm the text; change only these patterns then. What counts:
#   - only a `result` event with `is_error: true`, or an `assistant` event whose model is "<synthetic>" (Claude Code's
#     own message, not the model's words), and only text under 500 characters. A tool's output or a model's reply that
#     quotes these words (this very repository's specs do) never stops the night;
#   - the text matches LIMIT_TEXT, case-insensitively;
#   - the reset time, in this order: epoch seconds after a `|` ("Claude AI usage limit reached|1800003600"); an
#     ISO-8601 time with its zone; or a clock time after "resets" ("resets 3pm (Europe/London)", "resets at 15:00
#     (UTC)"), in the named zone or the host's, the next time that clock comes round. None found means no time.
LIMIT_TEXT = re.compile(r"usage limit|limit reached|hit your limit", re.IGNORECASE)
LIMIT_EPOCH = re.compile(r"\|\s*(\d{10,11})\b")
LIMIT_ISO = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})"
)
LIMIT_CLOCK = re.compile(
    r"resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([^)]{1,40})\))?",
    re.IGNORECASE,
)
LIMIT_MAX_TEXT = 500


class Refused(Exception):
    """A check refused: one line, exit 1."""


class CantRun(Exception):
    """The runner can't run (its own inputs are missing or broken): one line, exit 2."""


class QueueRefused(Exception):
    """queue.json refused: one line naming the field."""


class StopNight(Exception):
    """`night.py stop` sent SIGTERM."""


# ---- effects --------------------------------------------------------------------------------------------------------


@dataclass
class Result:
    rc: int
    out: str = ""
    err: str = ""


class Effects:
    """Every effect outside the runner's own memory. The tests replace it."""

    def __init__(self) -> None:
        self.environ: dict[str, str] = dict(os.environ)
        self._events: queue.Queue = queue.Queue()

    # the clock
    def now(self) -> float:
        return time.time()

    def sleep(self, seconds: float) -> None:
        """The usage limit's one wait (FR-021). Nothing else calls it."""
        time.sleep(seconds)

    def pause(self, seconds: float) -> None:
        """A short wait inside a request's job (ComfyUI's readiness), never in the runner's loop."""
        time.sleep(seconds)

    # readings
    def disk_free(self, path: str) -> int:
        st = os.statvfs(path)
        return st.f_bavail * st.f_frsize

    def mem_available(self) -> int:
        with open("/proc/meminfo", encoding="ascii") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) * 1024
        raise OSError("no MemAvailable in /proc/meminfo")

    def exists(self, path: str) -> bool:
        return os.path.lexists(path)

    def realpath(self, path: str) -> str:
        return os.path.realpath(path)

    # locks: flock(2) on a 0444 file
    def lock(self, path: str):
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        fd = os.open(
            path, os.O_RDONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o444
        )
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            return None
        return fd

    def unlock(self, handle) -> None:
        if handle is not None:
            os.close(handle)

    # processes
    def run(self, argv, *, env=None, cwd=None, timeout=900) -> Result:
        try:
            p = subprocess.run(
                list(argv),
                env=self.environ if env is None else env,
                cwd=cwd,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as e:
            return Result(127, "", f"{argv[0]}: {type(e).__name__}")
        return Result(p.returncode, p.stdout, p.stderr)

    def spawn(self, key: str, argv: list[str], log_path: str | None = None) -> None:
        """Start a session's `docker run`; its stream's lines and its exit arrive as events."""
        err = (
            os.fdopen(
                os.open(
                    log_path,
                    os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW,
                    0o600,
                ),
                "ab",
            )
            if log_path
            else subprocess.DEVNULL
        )
        p = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=err,
            text=True,
            bufsize=1,
        )

        def read() -> None:
            assert p.stdout is not None
            for line in p.stdout:
                self._events.put(("line", key, line))
            self._events.put(("exit", key, p.wait()))
            if log_path:
                err.close()

        threading.Thread(target=read, daemon=True).start()

    def start_job(self, key: str, fn) -> None:
        def go() -> None:
            # A job's failure is an answer, never the runner's crash.
            try:
                result = fn()
            except Exception as e:  # noqa: BLE001
                result = {
                    "ok": False,
                    "answer": f"refused: the job failed ({type(e).__name__})",
                }
            self._events.put(("job", key, result))

        threading.Thread(target=go, daemon=True).start()

    def wait(self, timeout):
        try:
            return self._events.get(timeout=timeout)
        except queue.Empty:
            return None

    def signal(self, signum, handler) -> None:
        signal.signal(signum, handler)

    def kill(self, pid: int, signum: int) -> None:
        os.kill(pid, signum)

    def cmdline(self, pid: int) -> bytes:
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                return f.read()
        except OSError:
            return b""

    def pid(self) -> int:
        return os.getpid()


# ---- paths and facts ------------------------------------------------------------------------------------------------


@dataclass
class Paths:
    home: str
    config: str
    live: str
    token: str
    facts: str
    allowlist: str
    allowlist_studio: str
    allowlist_plan: str
    comfyui_params: str
    share: str
    prompts: str
    installed: str
    state: str
    locks: str
    log: str
    runner_lock: str
    state_file: str

    @classmethod
    def from_home(cls, home) -> Paths:
        h = str(home)
        config = f"{h}/.config/h4reet-ai/night-shift"
        share = f"{h}/.local/share/h4reet-ai/night-shift"
        state = f"{h}/.local/state/h4reet-ai/night-shift"
        return cls(
            home=h,
            config=config,
            live=f"{config}/containers",
            token=f"{config}/claude.env",
            facts=f"{config}/facts.env",
            allowlist=f"{config}/allowlist.json",
            allowlist_studio=f"{config}/allowlist-studio.json",
            allowlist_plan=f"{config}/allowlist-plan.json",
            comfyui_params=f"{config}/comfyui-params.json",
            share=share,
            prompts=f"{share}/prompts",
            installed=f"{share}/installed.txt",
            state=state,
            locks=f"{state}/locks",
            log=f"{state}/log",
            runner_lock=f"{state}/runner.lock",
            state_file=f"{state}/state.json",
        )


REQUIRED_FACTS = (
    "REPO",
    "NIGHT_ROOT",
    "UID",
    "GID",
    "CLAUDE_VERSION",
    "BLENDER_DIR",
    "COMFYUI_DIR",
    "COMFYUI_VENV",
    "COMFYUI_PORT",
    "ENGINE_CERTS",
    "NIGHT_PLAN",
    "NIGHT_GATE",
)
PATH_FACTS = (
    "REPO",
    "NIGHT_ROOT",
    "BLENDER_DIR",
    "COMFYUI_DIR",
    "COMFYUI_VENV",
    "ENGINE_CERTS",
)


def read_facts(path) -> dict[str, str]:
    """facts.env as data, never sourced (data-model.md)."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        raise CantRun(f"facts: can't read {path}") from None
    facts: dict[str, str] = {}
    for n, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        key, sep, value = s.partition("=")
        if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise CantRun(f"facts: line {n} isn't KEY=value")
        facts[key] = value
    for key in REQUIRED_FACTS:
        if key not in facts:
            raise CantRun(f"facts: {key} is missing")
    for key, value in facts.items():
        if "{{" in value:
            raise CantRun(f"facts: {key} holds a placeholder")
    for key in PATH_FACTS:
        v = facts[key]
        if not os.path.isabs(v) or os.path.normpath(v) != v:
            raise CantRun(f"facts: {key} isn't an absolute path")
    for key in ("UID", "GID", "COMFYUI_PORT"):
        if not facts[key].isdigit():
            raise CantRun(f"facts: {key} isn't a number")
    if facts["UID"] == "0":
        raise CantRun("facts: UID is root's")
    for key in ("NIGHT_PLAN", "NIGHT_GATE"):
        if facts[key] not in ("on", "off"):
            raise CantRun(f"facts: {key} must be on or off")
    if facts["NIGHT_PLAN"] == "on" and not re.fullmatch(
        r"[A-Za-z0-9._-]{1,64}", facts.get("PLAN_AWS_PROFILE", "")
    ):
        raise CantRun("facts: PLAN_AWS_PROFILE is missing or malformed")
    return facts


def read_installed(path: str) -> dict[str, dict[str, str]]:
    """installed.txt: `file <path> <sha256>`, `image <ref> <id>`, `network <name> <id>` lines (runner.md §2)."""
    out: dict[str, dict[str, str]] = {"file": {}, "image": {}, "network": {}}
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        raise Refused(f"can't read {path}") from None
    for line in text.splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        kind, _, rest = line.partition(" ")
        name, _, value = rest.rpartition(" ")
        if kind in out and name and value:
            out[kind][name] = value
    return out


# ---- the usage limit ------------------------------------------------------------------------------------------------


def parse_limit(text: str, now: float):
    """None if `text` isn't the limit's message; else (True, reset epoch or None)."""
    if not isinstance(text, str) or not LIMIT_TEXT.search(text):
        return None
    m = LIMIT_EPOCH.search(text)
    if m:
        return True, float(m.group(1))
    m = LIMIT_ISO.search(text)
    if m:
        try:
            return True, dt.datetime.fromisoformat(m.group(0)).timestamp()
        except ValueError:
            pass
    m = LIMIT_CLOCK.search(text)
    if m and (m.group(2) or m.group(3)):
        hour, minute = int(m.group(1)), int(m.group(2) or 0)
        ampm = (m.group(3) or "").lower()
        if ampm == "pm" and hour != 12:
            hour += 12
        if ampm == "am" and hour == 12:
            hour = 0
        zone = _zone(m.group(4))
        if hour < 24 and minute < 60 and zone is not False:
            base = (
                dt.datetime.fromtimestamp(now, zone)
                if zone
                else dt.datetime.fromtimestamp(now).astimezone()
            )
            at = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if at <= base:
                at += dt.timedelta(days=1)
            return True, at.timestamp()
    return True, None


def _zone(name):
    """A tzinfo, None for the host's zone, or False for a zone this host can't read."""
    if not name:
        return None
    name = name.strip()
    if name.upper() in ("UTC", "Z", "GMT"):
        return dt.UTC
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except (ImportError, ValueError, OSError, KeyError):
        # ZoneInfoNotFoundError is a KeyError; a malformed name is a ValueError.
        return False


def limit_from_event(event, now: float):
    """The limit from one stream event, or None. Only Claude Code's own messages count (see LIMIT_TEXT)."""
    if not isinstance(event, dict):
        return None
    texts: list[str] = []
    kind = event.get("type")
    if (
        kind == "result"
        and event.get("is_error") is True
        and isinstance(event.get("result"), str)
    ):
        texts.append(event["result"])
    elif kind == "assistant":
        msg = event.get("message")
        if (
            isinstance(msg, dict)
            and msg.get("model") == "<synthetic>"
            and isinstance(msg.get("content"), list)
        ):
            for c in msg["content"]:
                if (
                    isinstance(c, dict)
                    and c.get("type") == "text"
                    and isinstance(c.get("text"), str)
                ):
                    texts.append(c["text"])
    for text in texts:
        if len(text) <= LIMIT_MAX_TEXT:
            found = parse_limit(text, now)
            if found:
                return found
    return None


# ---- mounts ---------------------------------------------------------------------------------------------------------


def is_under(path: str, root: str) -> bool:
    return path != root and path.startswith(root.rstrip("/") + "/")


def never_mounted(home: str, role: str) -> list[str]:
    """contracts/containers.md §3. The plan's container (runner-only) may mount its own ~/.config/h4reet-ai/infra."""
    out = [
        f"{home}/.aws",
        f"{home}/.ssh",
        f"{home}/.config/gh",
        f"{home}/.git-credentials",
        f"{home}/.docker",
        f"{home}/.claude",
        f"{home}/.claude.json",
        "/srv/studio/photos",
        "/srv/studio/key",
        "/var/run/docker.sock",
        "/run/docker.sock",
    ]
    if role == "plan":
        out += [
            f"{home}/.config/h4reet-ai/night-shift",
            f"{home}/.config/h4reet-ai/env",
        ]
    else:
        out.append(f"{home}/.config/h4reet-ai")
    if role not in GPU_ROLES:
        out.append("/srv/studio/outputs")
    return out


def path_shape_refusal(p) -> str | None:
    if not isinstance(p, str) or not os.path.isabs(p) or os.path.normpath(p) != p:
        return f"{p!r} isn't an absolute, normal path"
    if any(c in p for c in ":,\n\0"):
        return f"{p!r} holds a character docker's -v can't take"
    return None


def host_refusal(
    host: str, *, role: str, home: str, repo: str, realpath, allow_git: bool
) -> str | None:
    """Why `host` may not be mounted for `role`, or None. `allow_git` is the runner's own task mounts' exception."""
    why = path_shape_refusal(host)
    if why:
        return why
    git = f"{repo}/.git"
    for p in {host, realpath(host)}:
        for f in never_mounted(home, role):
            if p == f or is_under(p, f) or is_under(f, p):
                return f"{host} is, holds, or sits in a never-mounted path ({f})"
        if p == repo or is_under(repo, p):
            return f"{host} is or holds the main checkout's working tree"
        if is_under(p, repo) and not (allow_git and (p == git or is_under(p, git))):
            return f"{host} sits in the main checkout"
        if p.endswith(".sock"):
            return f"{host} is a socket"
    return None


RESERVED_CONTAINER = (
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
)


def container_refusal(c: str, task_containers: list[str]) -> str | None:
    why = path_shape_refusal(c)
    if why:
        return why
    if c == "/" or c.startswith("/night/settings"):
        return f"{c} is reserved"
    for r in RESERVED_CONTAINER:
        if c == r or is_under(c, r):
            return f"{c} is reserved"
    for t in task_containers:
        if c == t or is_under(c, t):
            return f"{c} would lie over the runner's own mount {t}"
    return None


def mask_lists(settings) -> tuple[list[str], list[str]]:
    """main's sandbox.filesystem.denyWrite, split into `.git` paths and worktree paths (both relative)."""
    try:
        deny = settings["sandbox"]["filesystem"]["denyWrite"]
    except (KeyError, TypeError):
        raise Refused(
            "main's .claude/settings.json has no sandbox.filesystem.denyWrite"
        ) from None
    if not isinstance(deny, list) or not all(isinstance(e, str) for e in deny):
        raise Refused("main's denyWrite isn't a list of paths")
    git_rel: list[str] = []
    wt_rel: list[str] = []
    for e in deny:
        if not e.startswith("./"):
            continue
        rel = os.path.normpath(e[2:])
        if rel in (".", "", ".git") or rel.startswith("..") or os.path.isabs(rel):
            continue
        target = git_rel if rel.startswith(".git/") else wt_rel
        item = rel.removeprefix(".git/")
        if item not in target:
            target.append(item)
    return git_rel, wt_rel


def env_items(env) -> list[tuple[str, str]]:
    """A spec's env: a mapping, or a list of NAME=value strings or {"name", "value"} objects."""
    if env is None:
        return []
    if isinstance(env, dict):
        items = list(env.items())
    elif isinstance(env, list):
        items = []
        for e in env:
            if isinstance(e, str) and "=" in e:
                k, _, v = e.partition("=")
                items.append((k, v))
            elif isinstance(e, dict) and set(e) == {"name", "value"}:
                items.append((e["name"], e["value"]))
            else:
                raise Refused("env entries must be NAME=value or {name, value}")
    else:
        raise Refused("env must be a mapping or a list")
    for k, v in items:
        if not isinstance(k, str) or not re.fullmatch(r"[A-Z_][A-Z0-9_]*", k):
            raise Refused(f"env name {k!r} is malformed")
        if not isinstance(v, str) or "\n" in v or "\0" in v:
            raise Refused(f"env {k}'s value is malformed")
    return items


def env_refusal(name: str) -> str | None:
    if name in SPEC_FORBIDDEN_ENV or name.startswith("AWS_"):
        return f"env names {name}, which no night container may hold (FR-041)"
    return None


REQUIRED_SPEC_KEYS = (
    "image",
    "user",
    "mounts",
    "networks",
    "env",
    "cap_drop",
    "security_opt",
    "read_only",
    "tmpfs",
    "limits",
)


def validate_spec(
    spec, role: str, *, uid_gid: str, token: str, home: str, repo: str, realpath, exists
) -> str | None:
    """Why a live spec may not start, or None (contracts/containers.md §2 to §7, checked again at every start)."""
    if not isinstance(spec, dict):
        return "isn't an object"
    for key in REQUIRED_SPEC_KEYS:
        if key not in spec:
            return f"{key} is missing"
    image = spec["image"]
    if (
        not isinstance(image, str)
        or not IMAGE.fullmatch(image)
        or image.endswith(":latest")
    ):
        return (
            f"image {image!r} must be an installed h4-night-<name>:<tag>, never latest"
        )
    if spec["user"] != uid_gid:
        return f"user must be {uid_gid}"
    if spec["cap_drop"] != ["ALL"]:
        return "cap_drop must be [ALL]"
    if spec["security_opt"] != ["no-new-privileges"]:
        return "security_opt must be [no-new-privileges]"
    gpu = role in GPU_ROLES
    if (
        "gpus" in spec
        and spec["gpus"] is not None
        and (not gpu or spec["gpus"] != "all")
    ):
        return "gpus is only for studio and comfyui, and only all"
    if gpu and spec.get("gpus") != "all":
        return "gpus must be all"
    if spec["read_only"] is not True and not (gpu and spec["read_only"] is False):
        return "read_only must be true"
    tmpfs = spec["tmpfs"]
    if not isinstance(tmpfs, list) or not all(
        isinstance(t, str) and re.fullmatch(r"/[A-Za-z0-9/_.-]+(?::[a-z0-9,=]+)?", t)
        for t in tmpfs
    ):
        return "tmpfs must be a list of /path[:options]"
    lim = spec["limits"]
    if not isinstance(lim, dict):
        return "limits must be an object"
    if not re.fullmatch(r"\d+[kmg]", str(lim.get("memory", ""))):
        return "limits.memory is malformed"
    if not re.fullmatch(r"\d+(?:\.\d+)?", str(lim.get("cpus", ""))):
        return "limits.cpus is malformed"
    pids = lim.get("pids")
    if not isinstance(pids, int) or isinstance(pids, bool) or not 1 <= pids <= 4096:
        return "limits.pids must be 1 to 4096"
    nets = spec["networks"]
    allowed = PLAN_NETS if role == "plan" else STUDIO_NETS if gpu else SESSION_NETS
    if (
        not isinstance(nets, list)
        or not nets
        or not all(isinstance(n, str) and n in allowed for n in nets)
    ):
        return f"networks must be from {sorted(allowed)}"
    try:
        env = env_items(spec["env"])
    except Refused as e:
        return str(e)
    names = dict(env)
    for k, _v in env:
        why = env_refusal(k)
        if why:
            return why
    if "CLAUDE_CONFIG_DIR" in names and names["CLAUDE_CONFIG_DIR"] != CLAUDE_DIR_IN:
        return f"CLAUDE_CONFIG_DIR is the runner's ({CLAUDE_DIR_IN})"
    if role in ROLES:
        proxy = (
            "http://egress-studio:3128" if role == "studio" else "http://egress:3128"
        )
        if names.get("HTTPS_PROXY") != proxy:
            return f"HTTPS_PROXY must be {proxy}"
        for k, v in SESSION_ENV_REQUIRED.items():
            if names.get(k) != v:
                return f"env {k} must be {v}"
        if spec.get("env_file") != token:
            return "env_file must be the night-shift token file"
    elif spec.get("env_file") is not None:
        return "env_file is for sessions only (the runner gives the plan its own)"
    mounts = spec["mounts"]
    if not isinstance(mounts, list):
        return "mounts must be a list"
    for m in mounts:
        if (
            not isinstance(m, dict)
            or set(m) != {"host", "container", "mode"}
            or m["mode"] not in ("ro", "rw")
        ):
            return f"mount {m!r} must be {{host, container, mode: ro|rw}}"
        why = host_refusal(
            m["host"],
            role=role,
            home=home,
            repo=repo,
            realpath=realpath,
            allow_git=False,
        )
        if why:
            return why
        why = path_shape_refusal(m["container"])
        if why:
            return why
        if not exists(m["host"]):
            return f"{m['host']} doesn't exist (docker would make it as root)"
    return None


def common_flags(spec) -> list[str]:
    argv = [
        "--user",
        spec["user"],
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
    ]
    if spec["read_only"] is True:
        argv.append("--read-only")
    for t in spec["tmpfs"]:
        argv += ["--tmpfs", t]
    lim = spec["limits"]
    argv += [
        "--memory",
        str(lim["memory"]),
        "--cpus",
        str(lim["cpus"]),
        "--pids-limit",
        str(lim["pids"]),
    ]
    if spec.get("gpus"):
        argv += ["--gpus", spec["gpus"]]
    for n in spec["networks"]:
        argv += ["--network", n]
    return argv


def vol(host: str, container: str, mode: str) -> list[str]:
    return ["-v", f"{host}:{container}:{mode}"]


def build_run_argv(
    spec, *, name: str, role: str, pre, post, workdir: str, prompt: str, token: str
) -> list[str]:
    """contracts/runner.md §3's line for one session. `pre` and `post` are the runner's own task mounts."""
    argv = [
        "docker",
        "run",
        "--rm",
        "--name",
        name,
        *common_flags(spec),
        "--env-file",
        token,
    ]
    env = dict(env_items(spec["env"]))
    env["CLAUDE_CONFIG_DIR"] = CLAUDE_DIR_IN
    for k in ENV_ORDER:
        if k in env:
            argv += ["-e", f"{k}={env.pop(k)}"]
    for k, v in env.items():
        argv += ["-e", f"{k}={v}"]
    for h, c, m in pre:
        argv += vol(h, c, m)
    for m in spec["mounts"]:
        argv += vol(m["host"], m["container"], m["mode"])
    for h, c, m in post:
        argv += vol(h, c, m)
    argv += [
        "-w",
        workdir,
        spec["image"],
        "claude",
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
    ]
    argv += ["--settings", f"/night/settings-{role}.json"]
    final_line_refusal(argv)
    return argv


def final_line_refusal(argv: list[str]) -> None:
    """The last look before any `docker run`: FR-041's variables and --bare (contracts/runner.md §3)."""
    if "--bare" in argv:
        raise Refused("a session line may never hold --bare")
    for i, a in enumerate(argv):
        if a == "-e":
            why = env_refusal(argv[i + 1].partition("=")[0])
            if why:
                raise Refused(why)


# ---- the decision page ----------------------------------------------------------------------------------------------

SECTIONS = ["Questions", "Stacks", "Interruptions", "Requests", "The runner"]
RUNNER_HEADING = "## The runner\n"


def page_template(date: str) -> str:
    return (
        f"# The night of {date}\n\n"
        "## Questions\n\n"
        "## Stacks\n| Branch | Tip | Note | Gate |\n|---|---|---|---|\n\n"
        "## Interruptions\n| When | Task | Cause |\n|---|---|---|\n\n"
        "## Requests\n\n"
        "## The runner\n"
    )


def append_runner_line(text: str, line: str, date: str | None = None) -> str:
    """`text` with one more line under `## The runner`, and nothing else changed (contracts/decision-page.md)."""
    line = " ".join(str(line).split())
    if not text:
        text = page_template(date or "unknown")
    if text.startswith(RUNNER_HEADING):
        idx = -1
        start = len(RUNNER_HEADING)
    else:
        idx = text.find("\n" + RUNNER_HEADING)
        start = idx + 1 + len(RUNNER_HEADING)
    if idx < 0 and not text.startswith(RUNNER_HEADING):
        return text.rstrip("\n") + "\n\n" + RUNNER_HEADING + f"- {line}\n"
    nxt = text.find("\n## ", start - 1)
    end = len(text) if nxt < 0 else nxt
    body = text[start:end].rstrip("\n")
    return text[:start] + (body + "\n" if body else "") + f"- {line}\n" + text[end:]


def check_page(text: str) -> list[str]:
    """The page's rules: title, sections in order, each question once with Blocks and Recommended."""
    findings: list[str] = []
    lines = text.splitlines()
    if not lines or not re.fullmatch(r"# The night of \d{4}-\d{2}-\d{2}", lines[0]):
        findings.append("title: the first line must be '# The night of <YYYY-MM-DD>'")
    heads = [ln[3:].strip() for ln in lines if ln.startswith("## ")]
    if heads != SECTIONS:
        findings.append(f"sections: {heads} must be {SECTIONS}, in that order")
    ids: set[str] = set()
    texts: set[str] = set()
    in_q = False
    for i, ln in enumerate(lines):
        if ln.startswith("## "):
            in_q = ln[3:].strip() == "Questions"
            continue
        if not in_q or not ln.startswith("### "):
            continue
        m = re.fullmatch(r"### (Q\d+): (.+)", ln)
        if not m:
            findings.append(f"questions: {ln!r} must be '### Q<n>: <question>?'")
            continue
        qid, q = m.group(1), m.group(2).strip()
        if not q.endswith("?"):
            findings.append(f"{qid}: the question must end with ?")
        norm = " ".join(q.lower().split())
        if qid in ids or norm in texts:
            findings.append(f"{qid}: each question appears once")
        ids.add(qid)
        texts.add(norm)
        nxt = next((x for x in lines[i + 1 :] if x.strip()), "")
        if not nxt.startswith("Blocks: "):
            findings.append(
                f"{qid}: needs a 'Blocks: <task> · Recommended: <answer>' line"
            )
            continue
        if " · Recommended: " not in nxt:
            findings.append(f"{qid}: has no Recommended answer")
            continue
        if not re.fullmatch(r"Blocks: \S+ · Recommended: \S.*", nxt):
            findings.append(f"{qid}: its Blocks line is malformed")
    return findings


# ---- safe folder access ---------------------------------------------------------------------------------------------

_DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def open_dir_chain(base: str, *names: str, make: bool = False) -> int:
    """An fd for base/names..., each component opened with O_NOFOLLOW. `base` itself must hold no link."""
    if os.path.realpath(base) != base:
        raise OSError(f"{base} holds a link")
    fd = os.open(base, _DIR)
    try:
        for n in names:
            if make:
                try:
                    os.mkdir(n, 0o755, dir_fd=fd)
                except FileExistsError:
                    pass
            nfd = os.open(n, _DIR, dir_fd=fd)
            os.close(fd)
            fd = nfd
    except BaseException:
        os.close(fd)
        raise
    return fd


def read_at(dfd: int, name: str, limit: int) -> bytes:
    fd = os.open(
        name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=dfd
    )
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise OSError(f"{name} isn't a regular file")
        if st.st_size > limit:
            raise OSError(f"{name} is over {limit} bytes")
        return os.read(fd, limit + 1)
    finally:
        os.close(fd)


def write_at(dfd: int, name: str, data: bytes, mode: int = 0o644) -> None:
    tmp = f".{name}.{os.getpid()}.tmp"
    try:
        os.unlink(tmp, dir_fd=dfd)
    except FileNotFoundError:
        pass
    fd = os.open(
        tmp,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
        mode,
        dir_fd=dfd,
    )
    try:
        os.write(fd, data)
    finally:
        os.close(fd)
    os.rename(tmp, name, src_dir_fd=dfd, dst_dir_fd=dfd)


def iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---- tasks ----------------------------------------------------------------------------------------------------------


@dataclass
class Task:
    id: str
    role: str
    base: str = MAIN
    slug: str = ""
    locks: list[str] = field(default_factory=list)
    after: list[str] = field(default_factory=list)
    prompt: str = ""
    brief: str = ""
    spec: str = ""
    name: str = ""
    branch: str = ""
    state: str = "queued"  # queued → running → done | failed | stopped-idle | stopped-limit | refused
    key: str | None = None
    gen: int = 0
    worktree: str | None = None
    admin: str | None = None
    started: float = 0.0
    last_event: float = 0.0
    result: dict | None = None
    held: dict = field(default_factory=dict)
    held_reason: str | None = None
    named: bool = False


class Runner:
    def __init__(self, paths: Paths, facts: dict[str, str], fx, night: str):
        self.p = paths
        self.facts = facts
        self.fx = fx
        self.night = night
        self.repo = facts["REPO"]
        self.git_dir = f"{self.repo}/.git"
        self.night_root = facts["NIGHT_ROOT"]
        self.uid_gid = f"{facts['UID']}:{facts['GID']}"
        self.sup = Task(
            id="supervisor",
            role="supervisor",
            prompt="prompts/supervisor.md",
            branch=f"night/supervisor/{night}",
        )
        self.tasks: dict[str, Task] = {}
        self.state_tasks: dict[str, dict] = {}
        self.lock_holders: dict[str, dict] = {}
        self.pending: dict[str, tuple] = {}
        self.answered: set[tuple[str, int]] = set()
        self.next_start_at = 0.0
        self.waiting_until: float | None = None
        self.ended = False
        self.stopping = False
        self.fast_fails = 0
        self.queue_sig = None
        self.comfy_owner: str | None = None
        self.runner_lock = None
        self.saved: dict[str, tuple[str, bool]] = {}
        self._load_state()

    # ---- small helpers -------------------------------------------------------------------------------------------
    def now(self) -> float:
        return self.fx.now()

    def log(self, text: str) -> None:
        os.makedirs(self.p.state, mode=0o700, exist_ok=True)
        line = f"{iso(self.now())} {' '.join(str(text).split())}\n"
        fd = os.open(
            self.p.log,
            os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o600,
        )
        try:
            os.write(fd, line.encode())
        finally:
            os.close(fd)

    def git_env(self, extra: dict | None = None) -> dict[str, str]:
        env = {k: v for k, v in self.fx.environ.items() if not k.startswith("GIT_")}
        env.update(GIT_ENV)
        env.update(extra or {})
        return env

    def git(
        self, *args: str, extra_env: dict | None = None, repo_git_dir: bool = True
    ) -> Result:
        argv = ["git", *GIT_FLAGS]
        if repo_git_dir:
            argv.append(f"--git-dir={self.git_dir}")
        argv += list(args)
        return self.fx.run(argv, env=self.git_env(extra_env), timeout=300)

    def docker(self, *args: str, timeout: int = 300) -> Result:
        return self.fx.run(
            ["docker", *args], env=dict(self.fx.environ), timeout=timeout
        )

    def host_env(self) -> dict[str, str]:
        return dict(self.fx.environ)

    def sup_worktree(self) -> str:
        return f"{self.night_root}/{self.night}/supervisor"

    def queue_path(self) -> str:
        return f"{self.sup_worktree()}/queue.json"

    def page_path(self) -> str:
        return f"{self.sup_worktree()}/docs/night-shift/{self.night}.md"

    def io_dir(self, t: Task) -> str:
        return f"{self.night_root}/.io/{t.id}"

    def container(self, t: Task) -> str:
        return f"h4-night-{t.id}"

    def sessions(self) -> list[Task]:
        return [self.sup, *self.tasks.values()]

    def running(self) -> list[Task]:
        return [t for t in self.sessions() if t.state == "running"]

    def by_key(self, key: str) -> Task | None:
        for t in self.sessions():
            if t.key == key:
                return t
        return None

    # ---- the page ------------------------------------------------------------------------------------------------
    def page(self, line: str) -> None:
        """One line under `## The runner`, and the same in the runner's log."""
        self.log(f"page: {line}")
        stamped = (
            f"{dt.datetime.fromtimestamp(self.now(), dt.UTC).strftime('%H:%MZ')} {line}"
        )
        wt = self.sup_worktree()
        if (
            not os.path.isdir(wt)
            or self.state_tasks.get("supervisor", {}).get("worktree") != wt
        ):
            return
        try:
            dfd = open_dir_chain(wt, "docs", "night-shift", make=True)
        except OSError as e:
            self.log(f"page not written: {e}")
            return
        try:
            name = f"{self.night}.md"
            try:
                text = read_at(dfd, name, 4 * 2**20).decode("utf-8", "replace")
            except FileNotFoundError:
                text = ""
            write_at(dfd, name, append_runner_line(text, stamped, self.night).encode())
        except OSError as e:
            self.log(f"page not written: {e}")
        finally:
            os.close(dfd)

    # ---- state ---------------------------------------------------------------------------------------------------
    def _load_state(self) -> None:
        try:
            st = json.loads(Path(self.p.state_file).read_text())
        except (OSError, ValueError):
            return
        if (
            isinstance(st, dict)
            and st.get("night") == self.night
            and isinstance(st.get("worktrees"), dict)
        ):
            self.state_tasks = {
                k: v for k, v in st["worktrees"].items() if isinstance(v, dict)
            }
            # A second `start` the same night keeps what finished; the rest start again from their branches' tips.
            for tid, rec in (st.get("tasks") or {}).items():
                if isinstance(rec, dict) and rec.get("state") in FINAL_STATES:
                    self.saved[tid] = (rec["state"], bool(rec.get("named")))

    def save_state(self) -> None:
        os.makedirs(self.p.state, mode=0o700, exist_ok=True)
        st = {
            "night": self.night,
            "pid": self.fx.pid(),
            "supervisor": self.sup.state,
            "tasks": {
                t.id: {
                    "state": t.state,
                    "role": t.role,
                    "branch": t.branch,
                    "named": t.named,
                }
                for t in self.tasks.values()
            },
            "locks": self.lock_holders,
            "waiting_until": self.waiting_until,
            "worktrees": self.state_tasks,
        }
        dfd = os.open(self.p.state, _DIR)
        try:
            write_at(
                dfd, "state.json", (json.dumps(st, indent=1) + "\n").encode(), 0o600
            )
        finally:
            os.close(dfd)

    # ---- the preflight (contracts/runner.md §2) -------------------------------------------------------------------
    def required_specs(self) -> list[str]:
        roles = [*ROLES, "comfyui"]
        if self.facts["NIGHT_PLAN"] == "on":
            roles.append("plan")
        return roles

    def installed(self) -> dict[str, dict[str, str]]:
        return read_installed(self.p.installed)

    def load_live_spec(self, role: str, installed=None) -> dict:
        installed = installed or self.installed()
        path = f"{self.p.live}/{role}.json"
        try:
            st = os.lstat(path)
        except FileNotFoundError:
            raise Refused(f"spec {role} is missing from {self.p.live}") from None
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
            raise Refused(
                f"spec {role} is a link or not a file: it sits outside the live folder"
            )
        if os.path.dirname(os.path.realpath(path)) != os.path.realpath(self.p.live):
            raise Refused(f"spec {role} sits outside the live folder")
        data = Path(path).read_bytes()
        text = data.decode("utf-8", "replace")
        if "{{" in text:
            raise Refused(f"spec {role} holds a placeholder")
        try:
            spec = json.loads(text)
        except ValueError:
            raise Refused(f"spec {role} isn't JSON") from None
        if isinstance(spec, dict) and "x-h4" in spec:
            raise Refused(
                f"spec {role} has the example marker (x-h4): only the install's filled copy runs"
            )
        if installed["file"].get(path) != hashlib.sha256(data).hexdigest():
            raise Refused(f"spec {role}'s SHA-256 isn't the one installed.txt records")
        why = validate_spec(
            spec,
            role,
            uid_gid=self.uid_gid,
            token=self.p.token,
            home=self.p.home,
            repo=self.repo,
            realpath=self.fx.realpath,
            exists=self.fx.exists,
        )
        if why:
            raise Refused(f"spec {role}: {why}")
        return spec

    def check_token(self) -> None:
        """Mode and shape only. The value is never in a line this prints (FR-036)."""
        try:
            st = os.lstat(self.p.token)
        except FileNotFoundError:
            raise Refused(f"the token file {self.p.token} is missing") from None
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
            raise Refused("the token file is a link or not a file")
        if stat.S_IMODE(st.st_mode) != 0o600:
            raise Refused("the token file must be mode 0600")
        if st.st_uid != os.getuid():
            raise Refused("the token file isn't the runner's user's")
        data = Path(self.p.token).read_bytes()
        try:
            text = data.decode("ascii")
        except UnicodeDecodeError:
            text = ""
        lines = text.split("\n")
        if lines and lines[-1] == "":
            lines.pop()
        if len(lines) != 1 or not TOKEN_LINE.fullmatch(lines[0]):
            raise Refused(
                "the token file must hold exactly one CLAUDE_CODE_OAUTH_TOKEN=<token> line"
            )

    def check_resources(self) -> str | None:
        for where in DISKS:
            try:
                free = self.fx.disk_free(where)
            except OSError:
                return f"can't read the free space on {where}"
            if free < MIN_DISK:
                return (
                    f"{where} has {free // 2**30} GB free, under {MIN_DISK // 2**30} GB"
                )
        try:
            mem = self.fx.mem_available()
        except OSError:
            return "can't read the free memory"
        if mem < MIN_MEM:
            return f"free memory is {mem // 2**30} GB, under {MIN_MEM // 2**30} GB"
        return None

    def preflight(self, keep_lock: bool) -> dict[str, dict]:
        installed = self.installed()
        # 1. the live specs
        specs = {
            role: self.load_live_spec(role, installed) for role in self.required_specs()
        }
        for entry in sorted(os.listdir(self.p.live)):
            role = entry.removesuffix(".json")
            if entry.endswith(".json") and role not in specs:
                self.load_live_spec_bytes_only(role, installed)
        # 2. the images
        refs = {s["image"] for s in specs.values()} | {self.egress_image(installed)}
        for ref in sorted(refs):
            want = installed["image"].get(ref)
            if not want:
                raise Refused(f"image {ref} isn't in installed.txt")
            r = self.docker("image", "inspect", "--format", "{{.Id}}", ref)
            if r.rc != 0:
                raise Refused(f"image {ref} is missing")
            if r.out.strip() != want:
                raise Refused(f"image {ref}'s ID isn't the one the install recorded")
        # 3. the token file
        self.check_token()
        # 4. the runner's own environment (FR-041)
        for name in BILLING_VARS:
            if name in self.fx.environ:
                raise Refused(
                    f"the runner's environment holds {name}; unset it (FR-041)"
                )
        # 5. the networks
        nets = list(NETWORKS)
        for s in specs.values():
            nets += [n for n in s["networks"] if n not in nets]
        for n in nets:
            r = self.docker("network", "inspect", "--format", "{{.Internal}}", n)
            if r.rc != 0:
                raise Refused(f"the network {n} is missing")
            if r.out.strip() != "true":
                raise Refused(f"the network {n} isn't internal")
        # 6. disk and memory
        why = self.check_resources()
        if why:
            raise Refused(why)
        # 7. one runner
        handle = self.fx.lock(self.p.runner_lock)
        if handle is None:
            raise Refused("another night.py start holds the runner's lock")
        if keep_lock:
            self.runner_lock = handle
        else:
            self.fx.unlock(handle)
        return specs

    def load_live_spec_bytes_only(self, role: str, installed) -> None:
        """A live file that isn't a known role's: it must still be the installed bytes, and no link."""
        path = f"{self.p.live}/{role}.json"
        st = os.lstat(path)
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
            raise Refused(
                f"spec {role} is a link or not a file: it sits outside the live folder"
            )
        data = Path(path).read_bytes()
        if b"x-h4" in data:
            raise Refused(f"spec {role} has the example marker (x-h4)")
        if installed["file"].get(path) != hashlib.sha256(data).hexdigest():
            raise Refused(f"spec {role}'s SHA-256 isn't the one installed.txt records")

    def egress_image(self, installed=None) -> str:
        installed = installed or self.installed()
        refs = sorted(r for r in installed["image"] if r.startswith("h4-night-egress:"))
        if len(refs) != 1:
            raise Refused("installed.txt must name exactly one h4-night-egress image")
        return refs[0]

    # ---- the queue (contracts/queue.md) ---------------------------------------------------------------------------
    def installed_prompts(self) -> set[str]:
        try:
            names = os.listdir(self.p.prompts)
        except OSError:
            return set()
        out = set()
        for n in names:
            p = f"{self.p.prompts}/{n}"
            if n.endswith(".md") and os.path.isfile(p) and not os.path.islink(p):
                out.add(f"prompts/{n}")
        return out

    def resolves(self, base: str) -> bool:
        return (
            self.git("rev-parse", "--verify", "--quiet", f"{base}^{{commit}}").rc == 0
        )

    def validate_queue(self, data) -> list[dict]:
        if not isinstance(data, dict) or data.get("schema") != 1:
            raise QueueRefused("schema: must be 1")
        tasks = data.get("tasks")
        if not isinstance(tasks, list):
            raise QueueRefused("tasks: must be a list")
        prompts = self.installed_prompts()
        seen: dict[str, int] = {}
        for i, t in enumerate(tasks):
            f = f"tasks[{i}]"
            if not isinstance(t, dict):
                raise QueueRefused(f"{f}: must be an object")
            extra = sorted(set(t) - TASK_KEYS)
            if extra:
                raise QueueRefused(f"{f}: unknown field {extra[0]!r}")
            tid = t.get("id")
            if not isinstance(tid, str) or not TASK_ID.fullmatch(tid):
                raise QueueRefused(f"{f}.id: must match [a-z0-9-]{{3,40}}")
            if tid in seen:
                raise QueueRefused(f"{f}.id: {tid!r} repeats tasks[{seen[tid]}]")
            if tid in RESERVED_IDS:
                raise QueueRefused(f"{f}.id: {tid!r} is reserved")
            seen[tid] = i
            if t.get("role") not in QUEUE_ROLES:
                raise QueueRefused(f"{f}.role: unknown role {t.get('role')!r}")
            locks = t.get("locks")
            if (
                not isinstance(locks, list)
                or not all(x in LOCKS for x in locks)
                or len(set(locks)) != len(locks)
            ):
                raise QueueRefused(
                    f"{f}.locks: must be distinct names from {list(LOCKS)}"
                )
            if t["role"] == "studio" and "gpu" not in locks:
                raise QueueRefused(f"{f}.locks: a studio task needs gpu")
            base = t.get("base")
            if (
                not isinstance(base, str)
                or not (SHA40.fullmatch(base) or FULL_REF.fullmatch(base))
                or (".." in base or base.endswith((".lock", "/")))
            ):
                raise QueueRefused(f"{f}.base: must be a full ref or a 40-hex SHA")
            if not isinstance(t.get("slug"), str) or not SLUG.fullmatch(t["slug"]):
                raise QueueRefused(f"{f}.slug: must match [a-z0-9-]{{1,40}}")
            if t.get("prompt") not in prompts:
                raise QueueRefused(
                    f"{f}.prompt: {t.get('prompt')!r} isn't an installed prompt"
                )
            if not isinstance(t.get("after", []), list) or not all(
                isinstance(a, str) for a in t.get("after", [])
            ):
                raise QueueRefused(f"{f}.after: must be a list of task IDs")
            if "name" in t and (
                not isinstance(t["name"], str) or not STACK_NAME.fullmatch(t["name"])
            ):
                raise QueueRefused(f"{f}.name: must match feat/NNN-<words>")
            for k, limit in (("spec", 80), ("brief", 8000)):
                if k in t and (not isinstance(t[k], str) or len(t[k]) > limit):
                    raise QueueRefused(
                        f"{f}.{k}: must be text of at most {limit} characters"
                    )
        for i, t in enumerate(tasks):
            for a in t.get("after", []):
                if a not in seen:
                    raise QueueRefused(f"tasks[{i}].after: names a missing task {a!r}")
        graph = {t["id"]: list(t.get("after", [])) for t in tasks}
        color: dict[str, int] = {}

        def visit(n: str, path: list[str]) -> None:
            color[n] = 1
            for m in graph[n]:
                if color.get(m) == 1:
                    cyc = [*path[path.index(m) :], m] if m in path else [n, m]
                    raise QueueRefused(
                        f"tasks[{seen[n]}].after: forms a cycle ({' -> '.join(cyc)})"
                    )
                if m not in color:
                    visit(m, [*path, m])
            color[n] = 2

        for tid in graph:
            if tid not in color:
                visit(tid, [tid])
        for i, t in enumerate(tasks):
            if not self.resolves(t["base"]):
                raise QueueRefused(f"tasks[{i}].base: {t['base']!r} doesn't resolve")
        return tasks

    def load_queue(self):
        """True if a new queue was taken, False if refused (the last good one stays), None if unchanged or absent."""
        wt = self.sup_worktree()
        if self.state_tasks.get("supervisor", {}).get("worktree") != wt:
            return None
        try:
            dfd = open_dir_chain(wt)
        except OSError:
            return None
        try:
            try:
                fd = os.open(
                    "queue.json",
                    os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                    dir_fd=dfd,
                )
            except FileNotFoundError:
                return None
            except OSError:
                return self._queue_refused(
                    "queue.json", "queue.json isn't a regular file"
                )
            try:
                st = os.fstat(fd)
                sig = (st.st_ino, st.st_size, st.st_mtime_ns)
                if sig == self.queue_sig:
                    return None
                self.queue_sig = sig
                if not stat.S_ISREG(st.st_mode) or st.st_size > 2**20:
                    return self._queue_refused(
                        sig, "queue.json isn't a regular file under 1 MB"
                    )
                raw = os.read(fd, 2**20 + 1)
            finally:
                os.close(fd)
        finally:
            os.close(dfd)
        try:
            data = json.loads(raw.decode("utf-8"))
        except ValueError:
            return self._queue_refused(sig, "queue.json isn't JSON")
        try:
            tasks = self.validate_queue(data)
        except QueueRefused as e:
            return self._queue_refused(sig, str(e))
        self._merge(tasks)
        self.log(f"queue taken: {len(tasks)} tasks")
        return True

    def _queue_refused(self, sig, why: str) -> bool:
        self.queue_sig = sig
        self.page(f"queue refused: {why}; the last good queue stays")
        return False

    def _merge(self, tasks: list[dict]) -> None:
        merged: dict[str, Task] = {}
        for d in tasks:
            t = self.tasks.get(d["id"])
            if t is None or t.state == "queued":
                if t is None:
                    t = Task(id=d["id"], role=d["role"])
                    if d["id"] in self.saved:
                        t.state, t.named = self.saved[d["id"]]
                t.role = d["role"]
                t.base = d["base"]
                t.slug = d["slug"]
                t.locks = list(d["locks"])
                t.after = list(d.get("after", []))
                t.prompt = d["prompt"]
                t.brief = d.get("brief", "")
                t.spec = d.get("spec", "")
                t.branch = f"night/{t.id}/{t.slug}"
            t.name = d.get("name", "")
            merged[t.id] = t
        for tid, t in self.tasks.items():
            if tid not in merged and t.state != "queued":
                merged[tid] = t
        self.tasks = merged
        for t in self.tasks.values():
            if t.state == "done" and t.name and not t.named:
                self.name_stack(t)

    # ---- scheduling (FR-018, FR-019) -------------------------------------------------------------------------------
    def lock_path(self, name: str) -> str:
        return f"{self.p.locks}/{name}"

    def take_locks(self, t: Task) -> bool:
        got = {}
        for name in t.locks:
            h = self.fx.lock(self.lock_path(name))
            if h is None:
                for g in got.values():
                    self.fx.unlock(g)
                return False
            got[name] = h
        t.held = got
        for name in got:
            self.lock_holders[name] = {"holder": t.id, "since": iso(self.now())}
            self.log(f"lock {name} held by {t.id}")
        return True

    def release_locks(self, t: Task) -> None:
        for name, h in t.held.items():
            self.fx.unlock(h)
            self.lock_holders.pop(name, None)
            self.log(f"lock {name} released by {t.id}")
        t.held = {}

    def ready(self, t: Task) -> bool:
        return t.state == "queued" and all(
            a in self.tasks and self.tasks[a].state == "done" for a in t.after
        )

    def schedule(self) -> None:
        if self.ended or self.stopping or self.waiting_until is not None:
            return
        now = self.now()
        if now < self.next_start_at:
            return
        if len([t for t in self.tasks.values() if t.state == "running"]) >= MAX_WORKERS:
            return
        for t in self.tasks.values():
            if not self.ready(t):
                continue
            if any(self.lock_holders.get(n) for n in t.locks):
                continue
            if "gpu" in t.locks:
                why = self.check_resources()
                if why:
                    if t.held_reason != why:
                        t.held_reason = why
                        self.page(f"{t.id} stays queued: {why} (FR-031)")
                    continue
            if not self.take_locks(t):
                continue
            t.held_reason = None
            try:
                self.start_session(t)
            except Refused as e:
                self.release_locks(t)
                t.state = "refused"
                self.page(f"{t.id} refused: {e}")
                continue
            self.next_start_at = now + STAGGER_S
            self.save_state()
            return

    def start_supervisor(self, extra: str = "") -> None:
        if self.sup.state == "running":
            return
        self.start_session(self.sup, extra)
        self.next_start_at = self.now() + STAGGER_S

    # ---- starting a session (contracts/runner.md §3) ---------------------------------------------------------------
    def check_task_mount(self, path: str) -> None:
        nr = self.night_root
        if not is_under(nr, self.p.home):
            raise Refused(f"NIGHT_ROOT {nr} isn't under the Author's home (FR-017)")
        if (
            not is_under(path, nr)
            or self.fx.realpath(path) != path
            and os.path.lexists(path)
        ):
            raise Refused(f"{path} isn't a plain folder under NIGHT_ROOT")

    def ensure_worktree(self, t: Task) -> None:
        wt = f"{self.night_root}/{self.night}/{t.id}"
        self.check_task_mount(wt)
        rec = self.state_tasks.get(t.id)
        if os.path.lexists(wt):
            if not rec or rec.get("worktree") != wt or not rec.get("admin"):
                raise Refused(f"{wt} exists, but the runner didn't make it")
            admin = rec["admin"]
        else:
            os.makedirs(os.path.dirname(wt), mode=0o755, exist_ok=True)
            exists = (
                self.git(
                    "rev-parse", "--verify", "--quiet", f"refs/heads/{t.branch}"
                ).rc
                == 0
            )
            if exists:
                r = self.git("worktree", "add", wt, t.branch)
            else:
                r = self.git("worktree", "add", "-b", t.branch, wt, t.base)
            if r.rc != 0:
                raise Refused(f"git worktree add failed for {t.id}")
            try:
                head = Path(f"{wt}/.git").read_text(encoding="utf-8").strip()
            except OSError:
                raise Refused(f"{t.id}'s worktree has no .git file") from None
            if not head.startswith("gitdir: "):
                raise Refused(f"{t.id}'s worktree .git file is malformed")
            admin = head[len("gitdir: ") :]
            self.state_tasks[t.id] = {
                "worktree": wt,
                "admin": admin,
                "branch": t.branch,
            }
        self.validate_admin(admin, wt)
        if self.fx.realpath(wt) != wt:
            raise Refused(f"{wt} holds a link")
        t.worktree, t.admin = wt, admin

    def validate_admin(self, admin: str, wt: str) -> None:
        if (
            os.path.dirname(admin) != f"{self.git_dir}/worktrees"
            or self.fx.realpath(admin) != admin
        ):
            raise Refused(f"{admin} isn't one of the repository's worktree folders")
        try:
            gitdir = Path(f"{admin}/gitdir").read_text(encoding="utf-8").strip()
            common = Path(f"{admin}/commondir").read_text(encoding="utf-8").strip()
        except OSError:
            raise Refused(f"{admin} is missing gitdir or commondir") from None
        if gitdir != f"{wt}/.git":
            raise Refused(f"{admin}/gitdir doesn't name {wt}")
        if os.path.realpath(os.path.join(admin, common)) != os.path.realpath(
            self.git_dir
        ):
            raise Refused(f"{admin}/commondir doesn't name the repository's .git")

    def ensure_io(self, t: Task) -> str:
        io = self.io_dir(t)
        self.check_task_mount(io)
        for sub in ("in", "out"):
            p = f"{io}/{sub}"
            if os.path.islink(p):
                raise Refused(f"{p} is a link")
            os.makedirs(p, mode=0o700, exist_ok=True)
        if self.fx.realpath(io) != io:
            raise Refused(f"{io} holds a link")
        return io

    def main_settings(self) -> dict:
        r = self.git("cat-file", "blob", f"{MAIN}:.claude/settings.json")
        if r.rc != 0:
            raise Refused("can't read refs/heads/main:.claude/settings.json")
        try:
            data = json.loads(r.out)
        except ValueError:
            raise Refused("main's .claude/settings.json isn't JSON") from None
        if not isinstance(data, dict):
            raise Refused("main's .claude/settings.json isn't an object")
        return data

    def ensure_git_mask(self, rel: str, p: str) -> bool:
        """Whether to mount the mask at `p`; makes a missing one when that's safe, so a session can't create it."""
        if os.path.lexists(p):
            if os.path.islink(p) or self.fx.realpath(p) != p:
                raise Refused(f".git/{rel} is a link")
            return True
        if rel == "refs/heads/main":
            r = self.git("rev-parse", "--verify", "--quiet", f"{MAIN}^{{commit}}")
            sha = r.out.strip()
            if r.rc != 0 or not SHA40.fullmatch(sha):
                raise Refused("refs/heads/main doesn't resolve")
            self._create(p, (sha + "\n").encode())
        elif rel == "packed-refs":
            self._create(p, b"")
        elif rel in ("config", "HEAD"):
            raise Refused(f".git/{rel} is missing")
        elif rel == "index":
            self.log(".git/index is absent: not masked")
            return False
        else:
            os.makedirs(p, mode=0o755, exist_ok=True)
        self.log(f".git/{rel} was absent: made, so it can be masked")
        return True

    def _create(self, p: str, data: bytes) -> None:
        fd = os.open(
            p,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o644,
        )
        try:
            os.write(fd, data)
        finally:
            os.close(fd)

    def task_mounts(self, t: Task, io: str):
        g = self.git_dir
        pre: list[tuple[str, str, str]] = []
        if t.role in WRITING_WT:
            assert t.worktree and t.admin
            git_rel, wt_rel = mask_lists(self.main_settings())
            pre += [(t.worktree, t.worktree, "rw"), (g, g, "rw")]
            for rel in GIT_MASKS:
                p = f"{g}/{rel}"
                if self.ensure_git_mask(rel, p):
                    pre.append((p, p, "ro"))
            cd = f"{t.admin}/commondir"
            pre.append((cd, cd, "ro"))
            for rel in git_rel:
                if rel in GIT_MASKS:
                    continue
                p = f"{g}/{rel}"
                if self.ensure_git_mask(rel, p):
                    pre.append((p, p, "ro"))
            for rel in wt_rel:
                p = f"{t.worktree}/{rel}"
                if not os.path.lexists(p):
                    self.log(
                        f"mask skipped for {t.id}: {rel} is absent from the worktree"
                    )
                    continue
                if self.fx.realpath(p) != p:
                    raise Refused(f"{rel} in {t.id}'s worktree is a link")
                pre.append((p, p, "ro"))
        elif t.role in READING_WT:
            assert t.worktree
            pre += [(t.worktree, t.worktree, "ro"), (g, g, "ro")]
        post = [
            (f"{self.p.share}/claude/{t.role}", CLAUDE_DIR_IN, "rw"),
            (io, IO_IN, "rw"),
        ]
        for h, _c, _m in pre + post:
            why = host_refusal(
                h,
                role=t.role,
                home=self.p.home,
                repo=self.repo,
                realpath=self.fx.realpath,
                allow_git=True,
            )
            if why:
                raise Refused(f"{t.id}: {why}")
        return pre, post

    def compose_prompt(self, t: Task, extra: str = "") -> str:
        name = t.prompt
        if name not in self.installed_prompts():
            raise Refused(f"{name} isn't an installed prompt")
        text = Path(f"{self.p.share}/{name}").read_text(encoding="utf-8")
        if text.lstrip().startswith("-"):
            raise Refused(f"{name} reads as a flag")
        lines = [
            text.rstrip("\n"),
            "",
            "## This task",
            f"- id: {t.id}",
            f"- role: {t.role}",
            f"- night: {self.night}",
            f"- branch: {t.branch}",
            f"- base: {t.base}",
            f"- worktree: {t.worktree or 'none: you work in /night/io and the studio folders'}",
        ]
        if t.spec:
            lines.append(f"- spec: {t.spec}")
        if t is self.sup:
            lines += [
                f"- queue: {self.queue_path()}",
                f"- decision page: docs/night-shift/{self.night}.md",
            ]
        lines.append(
            "- requests: write /night/io/out/<n>.json; the answer arrives as /night/io/in/<n>.json"
        )
        if t.brief:
            lines += ["", "## The brief", t.brief]
        if extra:
            lines += ["", extra]
        prompt = "\n".join(lines) + "\n"
        if prompt.startswith("-"):
            raise Refused(f"{name} reads as a flag")
        return prompt

    def start_session(self, t: Task, extra: str = "") -> None:
        spec = self.load_live_spec(t.role)
        if t.role not in NO_WT:
            self.ensure_worktree(t)
        io = self.ensure_io(t)
        pre, post = self.task_mounts(t, io)
        task_containers = [c for _h, c, _m in pre + post]
        for m in spec["mounts"]:
            why = container_refusal(m["container"], task_containers)
            if why:
                raise Refused(f"spec {t.role}: {why}")
        prompt = self.compose_prompt(t, extra)
        argv = build_run_argv(
            spec,
            name=self.container(t),
            role=t.role,
            pre=pre,
            post=post,
            workdir=t.worktree or IO_IN,
            prompt=prompt,
            token=self.p.token,
        )
        self.docker("rm", "-f", self.container(t))
        t.gen += 1
        t.key = f"{t.id}#{t.gen}"
        t.state = "running"
        t.started = t.last_event = self.now()
        t.result = None
        os.makedirs(f"{self.p.state}/sessions", mode=0o700, exist_ok=True)
        self.fx.spawn(t.key, argv, f"{self.p.state}/sessions/{t.id}-{t.gen}.log")
        self.log(f"started {t.id} ({t.role}) as {self.container(t)}")
        self.save_state()

    # ---- the egress helpers ----------------------------------------------------------------------------------------
    def helper_flags(self, name: str, mem: str) -> list[str]:
        return [
            "docker", "run", "-d", "--rm", "--name", name, "--user", self.uid_gid,
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only",
            "--tmpfs", "/tmp:rw,nosuid,size=64m", "--memory", mem, "--cpus", "1", "--pids-limit", "256",
            "--network", OUT_NETWORK,
        ]  # fmt: skip

    def egress_argv(self, name: str, allowlist: str, logdir: str) -> list[str]:
        return [
            *self.helper_flags(name, "256m"),
            "-e", "H4_EGRESS_SETTINGS=/etc/h4-egress/settings.json",
            "-e", "H4_EGRESS_LOG=/log/egress.jsonl",
            "-e", "H4_EGRESS_LIST_FILE=/tmp/egress-list.json",
            "-e", "H4_EGRESS_HOST=0.0.0.0",
            "-e", "H4_EGRESS_PORT=3128",
            *vol(allowlist, "/etc/h4-egress/settings.json", "ro"),
            *vol(logdir, "/log", "rw"),
            self.egress_image(),
        ]  # fmt: skip

    def start_helper(
        self, name: str, argv: list[str], network: str, alias: str
    ) -> None:
        self.docker("rm", "-f", name)
        if self.docker(*argv[1:]).rc != 0:
            raise Refused(f"{name} didn't start")
        if self.docker("network", "connect", "--alias", alias, network, name).rc != 0:
            raise Refused(f"{name} couldn't join {network}")

    def start_network_helpers(self) -> None:
        for name, allow, logdir, net, alias in (
            (
                "h4-night-egress",
                self.p.allowlist,
                f"{self.p.state}/egress",
                "h4-night",
                "egress",
            ),
            (
                "h4-night-egress-studio",
                self.p.allowlist_studio,
                f"{self.p.state}/egress-studio",
                "h4-night-studio",
                "egress-studio",
            ),
        ):
            os.makedirs(logdir, mode=0o700, exist_ok=True)
            self.start_helper(name, self.egress_argv(name, allow, logdir), net, alias)
        worker = self.load_live_spec("implementer")["image"]
        fwd = [*self.helper_flags("h4-night-engine-fwd", "128m"), worker]
        fwd += ["socat", "TCP-LISTEN:2376,fork,reuseaddr", ENGINE]
        self.start_helper("h4-night-engine-fwd", fwd, "h4-night-engine", "engine-fwd")

    def stop_helpers(self) -> None:
        self.docker(
            "stop",
            "-t",
            "10",
            "h4-night-egress",
            "h4-night-egress-studio",
            "h4-night-engine-fwd",
        )

    # ---- events ----------------------------------------------------------------------------------------------------
    def dispatch(self, ev) -> None:
        kind = ev[0]
        if kind == "line":
            self.on_line(ev[1], ev[2])
        elif kind == "exit":
            self.on_exit(ev[1], ev[2])
        elif kind == "job":
            self.on_job(ev[1], ev[2])

    def pump(self) -> None:
        while (ev := self.fx.wait(0)) is not None:
            self.dispatch(ev)

    def on_line(self, key: str, line: str) -> None:
        t = self.by_key(key)
        if t is None or t.state != "running":
            return
        now = self.now()
        t.last_event = now
        try:
            ev = json.loads(line)
        except ValueError:
            ev = None
        if isinstance(ev, dict):
            lim = limit_from_event(ev, now)
            if lim:
                self.on_limit(t, lim[1])
                return
            if ev.get("type") == "result":
                t.result = ev
        self.scan_requests(t)
        if t is self.sup:
            self.load_queue()

    def on_exit(self, key: str, rc: int) -> None:
        t = self.by_key(key)
        if t is None:
            return
        t.key = None
        self.release_locks(t)
        if self.comfy_owner == t.id:
            self.stop_comfyui()
        if t.state != "running":
            return
        ok = rc == 0 and not (
            isinstance(t.result, dict) and t.result.get("is_error") is True
        )
        t.state = "done" if ok else "failed"
        self.log(f"{t.id} ended: {t.state} (exit {rc})")
        if not ok:
            self.page(f"{t.id} failed (exit {rc})")
        if t.worktree and t.role in WRITING_WT and self.dirty(t):
            self.page(
                f"{t.id} ended with uncommitted changes in {t.worktree}; the runner never commits for it"
            )
        if ok and t.name and not t.named:
            self.name_stack(t)
        if ok:
            self.fast_fails = 0
        elif self.now() - t.started < FAST_FAIL_S:
            self.fast_fails += 1
            if self.fast_fails >= FAST_FAIL_COUNT:
                self.page(
                    f"{FAST_FAIL_COUNT} sessions failed within {FAST_FAIL_S} s of starting: the night stops "
                    "(a usage limit the matcher missed?)"
                )
                self.stop_all("stopped-limit")
                self.ended = True
        self.save_state()
        if t is not self.sup:
            self.wake_supervisor(
                f"The runner woke you because task {t.id} ended: {t.state}."
            )

    def wake_supervisor(self, why: str) -> None:
        if (
            self.ended
            or self.stopping
            or self.waiting_until is not None
            or self.sup.state == "running"
        ):
            return
        try:
            self.start_supervisor(why)
        except Refused as e:
            self.page(f"supervisor not restarted: {e}")

    def dirty(self, t: Task) -> bool:
        r = self.git(
            "status",
            "--porcelain",
            extra_env={
                "GIT_DIR": t.admin or "",
                "GIT_COMMON_DIR": self.git_dir,
                "GIT_WORK_TREE": t.worktree or "",
            },
            repo_git_dir=False,
        )
        return r.rc != 0 or bool(r.out.strip())

    def check_idle(self) -> None:
        now = self.now()
        for t in self.running():
            if now - t.last_event < IDLE_S:
                continue
            if t.worktree and t.role in WRITING_WT and self.dirty(t):
                continue
            r = self.docker("top", self.container(t), "-eo", "comm")
            procs = {ln.strip() for ln in r.out.splitlines()[1:] if ln.strip()}
            if r.rc != 0 or not procs <= IDLE_PROCS:
                continue
            self.docker(
                "stop",
                "-t",
                str(STOP_GRACE_S),
                self.container(t),
                timeout=STOP_GRACE_S + 30,
            )
            t.state = "stopped-idle"
            self.release_locks(t)
            if self.comfy_owner == t.id:
                self.stop_comfyui()
            self.page(f"{t.id} stopped: waited with nothing to do")
            self.save_state()
            if t is not self.sup:
                self.wake_supervisor(
                    f"The runner woke you because task {t.id} stopped idle."
                )

    def stop_all(self, new_state: str) -> None:
        names = []
        for t in self.running():
            names.append(self.container(t))
            t.state = new_state
            self.release_locks(t)
        if self.comfy_owner:
            names.append("h4-night-comfyui")
            self.comfy_owner = None
        if names:
            self.docker(
                "stop", "-t", str(STOP_GRACE_S), *names, timeout=STOP_GRACE_S + 60
            )

    def on_limit(self, t: Task, reset: float | None) -> None:
        """FR-021: stop every container, wait once until the reset plus 300 s, requeue. No other timer."""
        now = self.now()
        self.stop_all("stopped-limit")
        if reset is None:
            self.page(
                f"usage limit reported by {t.id} with no reset time: the night stops"
            )
            self.ended = True
            self.save_state()
            return
        until = reset + LIMIT_MARGIN_S
        self.waiting_until = until
        self.page(
            f"usage limit reported by {t.id}: every container stopped; waiting until {iso(until)}"
        )
        self.save_state()
        self.fx.sleep(max(0.0, until - now))
        self.waiting_until = None
        for s in self.sessions():
            if s.state == "stopped-limit":
                s.state = "queued"
        self.page("the reset passed: the night resumes, the supervisor first")
        try:
            self.start_supervisor(
                "The runner restarted you after the usage limit's reset."
            )
        except Refused as e:
            self.page(f"supervisor not restarted: {e}")
        self.save_state()

    def name_stack(self, t: Task) -> None:
        """contracts/runner.md §6: `git branch <name> <tip>`, outside every container, if the name is free."""
        t.named = True
        r = self.git(
            "rev-parse", "--verify", "--quiet", f"refs/heads/{t.branch}^{{commit}}"
        )
        tip = r.out.strip()
        if r.rc != 0 or not SHA40.fullmatch(tip):
            self.page(f"stack {t.name}: {t.branch} doesn't resolve; left unnamed")
            return
        if self.git("rev-parse", "--verify", "--quiet", f"refs/heads/{t.name}").rc == 0:
            self.page(f"stack {t.name} is taken; {t.branch} at {tip[:12]} left unnamed")
            return
        if self.git("branch", t.name, tip).rc != 0:
            self.page(f"stack {t.name}: git branch failed")
            return
        self.page(f"stack {t.name} at {tip[:12]} (from {t.branch})")

    # ---- requests (contracts/runner.md §5) --------------------------------------------------------------------------
    def scan_requests(self, t: Task) -> None:
        try:
            iofd = open_dir_chain(self.night_root, ".io", t.id)
        except OSError:
            return
        try:
            try:
                outfd = os.open("out", _DIR, dir_fd=iofd)
            except OSError:
                return
            try:
                names = sorted(
                    (n for n in os.listdir(outfd) if REQ_NAME.fullmatch(n)),
                    key=lambda n: int(n[:-5]),
                )
                for name in names:
                    n = int(name[:-5])
                    if (t.id, n) in self.answered or f"job:{t.id}:{n}" in self.pending:
                        continue
                    if self._answered_on_disk(iofd, n):
                        self.answered.add((t.id, n))
                        continue
                    self.answered.add((t.id, n))
                    try:
                        raw = read_at(outfd, name, 65536)
                        req = json.loads(raw.decode("utf-8"))
                    except (OSError, ValueError):
                        self.write_answer(
                            t, n, self.refuse(None, "refused: not a JSON file")
                        )
                        continue
                    try:
                        ans = self.handle_request(t, n, req)
                    except (Refused, OSError) as e:
                        ans = self.refuse(None, f"refused: {e}")
                    if ans is not None:
                        self.write_answer(t, n, ans)
            finally:
                os.close(outfd)
        finally:
            os.close(iofd)

    def _answered_on_disk(self, iofd: int, n: int) -> bool:
        try:
            infd = os.open("in", _DIR, dir_fd=iofd)
        except OSError:
            return False
        try:
            os.stat(f"{n}.json", dir_fd=infd, follow_symlinks=False)
            return True
        except FileNotFoundError:
            return False
        finally:
            os.close(infd)

    def write_answer(
        self, t: Task, n: int, ans: dict, files: dict[str, bytes] | None = None
    ) -> None:
        ans = {"n": n, **ans}
        try:
            infd = open_dir_chain(self.night_root, ".io", t.id, "in")
        except OSError as e:
            self.page(
                f"{t.id}'s answer {n} not written: its in/ isn't a plain folder ({type(e).__name__})"
            )
            return
        try:
            for name, data in (files or {}).items():
                write_at(infd, name, data)
            write_at(infd, f"{n}.json", (json.dumps(ans) + "\n").encode())
        except OSError as e:
            self.page(f"{t.id}'s answer {n} not written ({type(e).__name__})")
        finally:
            os.close(infd)

    def refuse(self, kind, why: str) -> dict:
        return {"kind": kind, "ok": False, "answer": why}

    def handle_request(self, t: Task, n: int, req) -> dict | None:
        if not isinstance(req, dict):
            return self.refuse(None, "refused: not a JSON object")
        kind = req.get("kind")
        if kind == "plan":
            ans = self.req_plan(t, n, req)
        elif kind == "gate":
            ans = self.req_gate(t, n, req)
        elif kind == "comfyui":
            ans = self.req_comfyui(t, n, req)
        else:
            ans = self.refuse(
                kind if isinstance(kind, str) else None, "refused: unknown kind"
            )
        if ans is not None and not ans["ok"] and ans["answer"] != OFF_ANSWER:
            self.page(f"{t.id}'s request {n} ({ans.get('kind')}): {ans['answer']}")
        return ans

    # gate
    def req_gate(self, t: Task, n: int, req: dict) -> dict | None:
        if set(req) - {"kind", "sha"}:
            return self.refuse(
                "gate", "refused: a gate request holds only kind and sha"
            )
        if self.facts["NIGHT_GATE"] != "on":
            return self.refuse("gate", OFF_ANSWER)
        if t.role != "gate-runner":
            return self.refuse(
                "gate", "refused: gate requests come from gate-runner tasks"
            )
        sha = req.get("sha")
        if not isinstance(sha, str) or not SHA40.fullmatch(sha):
            return self.refuse("gate", "refused: sha must be 40 hex")
        head = self.git("symbolic-ref", "-q", "HEAD")
        if head.rc != 0 or head.out.strip() != MAIN:
            return self.refuse("gate", "refused: REPO's HEAD isn't refs/heads/main")
        st = self.git(
            "status",
            "--porcelain",
            extra_env={"GIT_DIR": self.git_dir, "GIT_WORK_TREE": self.repo},
            repo_git_dir=False,
        )
        if st.rc != 0 or st.out.strip():
            return self.refuse("gate", "refused: REPO's tree isn't clean")
        handle = None
        if "gate" not in t.held:
            handle = self.fx.lock(self.lock_path("gate"))
            if handle is None:
                return self.refuse("gate", "refused: the gate lock is held")
            self.lock_holders["gate"] = {
                "holder": f"{t.id} (gate request {n})",
                "since": iso(self.now()),
            }
        os.makedirs(f"{self.p.state}/gate", mode=0o700, exist_ok=True)
        log = f"{self.p.state}/gate/{sha[:12]}-{t.id}-{n}.log"
        argv = [
            "/usr/bin/python3",
            "-I",
            "-B",
            "tools/gates/gate",
            sha,
        ]  # never --prove (plan Q7)

        def job() -> dict:
            r = self.fx.run(argv, cwd=self.repo, env=self.host_env(), timeout=6 * 3600)
            text = r.out + r.err
            Path(log).write_text(text, encoding="utf-8")
            return {"rc": r.rc, "text": text}

        key = f"job:{t.id}:{n}"
        self.pending[key] = ("gate", t, n, handle, sha)
        self.log(f"gate {sha[:12]} for {t.id}: started")
        self.fx.start_job(key, job)
        return None

    # plan
    def req_plan(self, t: Task, n: int, req: dict) -> dict | None:
        if set(req) - {"kind", "root", "sha"}:
            return self.refuse(
                "plan", "refused: a plan request holds only kind, root, and sha"
            )
        if self.facts["NIGHT_PLAN"] != "on":
            return self.refuse("plan", OFF_ANSWER)
        if t.role != "ops":
            return self.refuse("plan", "refused: plan requests come from ops tasks")
        root, sha = req.get("root"), req.get("sha")
        if root not in PLAN_ROOTS:
            return self.refuse(
                "plan", f"refused: root must be one of {', '.join(PLAN_ROOTS)}"
            )
        if (
            not isinstance(sha, str)
            or not SHA40.fullmatch(sha)
            or not self.resolves(sha)
        ):
            return self.refuse("plan", "refused: sha must be 40 hex and resolve")
        try:
            spec = self.load_live_spec("plan")
        except Refused as e:
            return self.refuse("plan", f"refused: {e}")
        base = f"{self.p.state}/plan"
        os.makedirs(base, mode=0o700, exist_ok=True)
        wt = f"{base}/wt-{sha[:12]}-{t.id}-{n}"
        creds = f"{base}/{t.id}-{n}.env"
        profile = self.facts["PLAN_AWS_PROFILE"]
        name = f"h4-night-plan-{t.id}-{n}"

        def job() -> dict:
            try:
                if self.git("worktree", "add", "--detach", wt, sha).rc != 0:
                    return {
                        "ok": False,
                        "answer": "refused: the detached worktree couldn't be made",
                    }
                r = self.fx.run(
                    [
                        "aws",
                        "configure",
                        "export-credentials",
                        "--profile",
                        profile,
                        "--format",
                        "env-no-export",
                    ],
                    env=self.host_env(),
                    timeout=120,
                )
                if r.rc != 0:
                    return {
                        "ok": False,
                        "answer": "refused: the plan role's credentials couldn't be read",
                    }
                self._create_private(creds, r.out.encode())
                del r
                egress = self.egress_argv(
                    "h4-night-egress-plan",
                    self.p.allowlist_plan,
                    f"{self.p.state}/egress-plan",
                )
                os.makedirs(f"{self.p.state}/egress-plan", mode=0o700, exist_ok=True)
                self.start_helper(
                    "h4-night-egress-plan", egress, "h4-night-plan", "egress-plan"
                )
                argv = [
                    "docker",
                    "run",
                    "--rm",
                    "--name",
                    name,
                    *common_flags(spec),
                    "--env-file",
                    creds,
                ]
                for k, v in env_items(spec["env"]):
                    argv += ["-e", f"{k}={v}"]
                for m in spec["mounts"]:
                    argv += vol(m["host"], m["container"], m["mode"])
                argv += [*vol(wt, wt, "ro"), "-w", wt, spec["image"]]
                argv += [
                    "/usr/bin/python3",
                    "-I",
                    "-B",
                    "scripts/infra/infra_plan.py",
                    "--root",
                    root,
                ]
                final_line_refusal(argv)
                r = self.fx.run(argv, env=self.host_env(), timeout=3600)
                if r.rc == 0:
                    return {"ok": True, "answer": r.out[-262144:]}
                last = [ln for ln in (r.err + r.out).splitlines() if ln.strip()]
                return {
                    "ok": False,
                    "answer": last[-1] if last else f"the plan exited {r.rc}",
                }
            finally:
                try:
                    os.unlink(creds)
                except FileNotFoundError:
                    pass
                self.docker("stop", "-t", "10", "h4-night-egress-plan")
                self.git("worktree", "remove", "--force", wt)

        key = f"job:{t.id}:{n}"
        self.pending[key] = ("plan", t, n, None, sha)
        self.log(f"plan {root} at {sha[:12]} for {t.id}: started")
        self.fx.start_job(key, job)
        return None

    def _create_private(self, path: str, data: bytes) -> None:
        fd = os.open(
            path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o600,
        )
        try:
            os.fchmod(fd, 0o600)
            os.write(fd, data)
        finally:
            os.close(fd)

    # comfyui
    def comfy_allowlist(self) -> tuple[set[str], set[str]]:
        """(allowed flags, fixed flags) from G3's file (T045):
        {"schema": 1, "fixed_by_runner": ["--listen", ...], "allowed": [{"flag": "--birefnet", "value": null, ...}]}.

        Flags only for now: an entry whose `value` isn't null allows nothing. `fixed_by_runner` adds to COMFY_FIXED,
        never removes from it. Any other shape fails closed: nothing allowed.
        """
        closed: tuple[set[str], set[str]] = (set(), set(COMFY_FIXED))
        try:
            data = json.loads(Path(self.p.comfyui_params).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return closed
        if not isinstance(data, dict) or data.get("schema") != 1:
            return closed
        fixed, allowed = data.get("fixed_by_runner"), data.get("allowed")
        if not isinstance(fixed, list) or not all(
            isinstance(f, str) and f.startswith("--") for f in fixed
        ):
            return closed
        if not isinstance(allowed, list):
            return closed
        flags: set[str] = set()
        for e in allowed:
            if (
                not isinstance(e, dict)
                or "value" not in e
                or not isinstance(e.get("flag"), str)
                or not re.fullmatch(r"--[a-z0-9][a-z0-9-]*", e["flag"])
            ):
                return closed
            if e["value"] is None:
                flags.add(e["flag"])
        fixed_all = set(COMFY_FIXED) | set(fixed)
        return flags - fixed_all, fixed_all

    def req_comfyui(self, t: Task, n: int, req: dict) -> dict | None:
        if t.role != "studio" or "gpu" not in t.held or t.state != "running":
            return self.refuse(
                "comfyui",
                "refused: ComfyUI starts only from a studio task holding the gpu lock",
            )
        action = req.get("action")
        if action == "stop":
            if set(req) - {"kind", "action"}:
                return self.refuse(
                    "comfyui", "refused: a stop request holds only kind and action"
                )
            self.stop_comfyui()
            return {"kind": "comfyui", "ok": True, "answer": "stopped"}
        if action != "start":
            return self.refuse("comfyui", "refused: action must be start or stop")
        if set(req) - {"kind", "action", "params"}:
            return self.refuse(
                "comfyui",
                "refused: a start request holds only kind, action, and params",
            )
        params = req.get("params", [])
        if not isinstance(params, list) or not all(isinstance(p, str) for p in params):
            return self.refuse("comfyui", "refused: params must be a list of strings")
        allow, fixed = self.comfy_allowlist()
        for p in params:
            if p in fixed or p.split("=", 1)[0] in fixed:
                return self.refuse("comfyui", f"refused: {p} is the runner's alone")
            if p not in allow:
                return self.refuse(
                    "comfyui", f"refused: {p} isn't on the ComfyUI allowlist"
                )
        if len(set(params)) != len(params):
            return self.refuse("comfyui", "refused: a parameter repeats")
        if self.comfy_owner:
            return self.refuse("comfyui", "refused: ComfyUI is already running")
        try:
            spec = self.load_live_spec("comfyui")
        except Refused as e:
            return self.refuse("comfyui", f"refused: {e}")
        f = self.facts
        argv = [
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            "h4-night-comfyui",
            *common_flags(spec),
        ]
        for k, v in env_items(spec["env"]):
            argv += ["-e", f"{k}={v}"]
        for m in spec["mounts"]:
            argv += vol(m["host"], m["container"], m["mode"])
        python = f"{f['COMFYUI_VENV']}/bin/python"
        argv += ["-w", f["COMFYUI_DIR"], spec["image"], python, "main.py"]
        argv += [
            "--listen",
            "0.0.0.0",
            "--port",
            f["COMFYUI_PORT"],
            "--output-directory",
            "/srv/studio/outputs",
        ]
        argv += [
            "--temp-directory",
            COMFY_TEMP,
            "--user-directory",
            COMFY_USER,
            *params,
        ]
        final_line_refusal(argv)
        self.docker("rm", "-f", "h4-night-comfyui")
        r = self.docker(*argv[1:])
        if r.rc != 0:
            return self.refuse("comfyui", "refused: the comfyui container didn't start")
        self.comfy_owner = t.id
        probe = [
            "exec",
            "h4-night-comfyui",
            python,
            "-I",
            "-c",
            COMFY_READY_PY % f["COMFYUI_PORT"],
        ]

        def job() -> dict:
            start = self.fx.now()
            while True:
                if self.docker(*probe, timeout=30).rc == 0:
                    return {"ok": True, "answer": "ready"}
                if self.fx.now() - start >= COMFY_READY_S:
                    logs = self.docker("logs", "--tail", "20", "h4-night-comfyui").out
                    return {
                        "ok": False,
                        "answer": "not ready after 120 s; its last lines:\n"
                        + logs[-4000:],
                    }
                self.fx.pause(COMFY_POLL_S)

        key = f"job:{t.id}:{n}"
        self.pending[key] = ("comfyui", t, n, None, None)
        self.fx.start_job(key, job)
        return None

    def stop_comfyui(self) -> None:
        self.docker(
            "stop",
            "-t",
            str(STOP_GRACE_S),
            "h4-night-comfyui",
            timeout=STOP_GRACE_S + 30,
        )
        self.comfy_owner = None

    def on_job(self, key: str, result: dict) -> None:
        pending = self.pending.pop(key, None)
        if pending is None:
            return
        kind, t, n, handle, sha = pending
        if kind == "gate":
            if handle is not None:
                self.fx.unlock(handle)
                self.lock_holders.pop("gate", None)
            text = result.get("text", "")
            lines = [
                ln for ln in text.splitlines() if ln.startswith(("gate:", "merge:"))
            ]
            ans = {
                "kind": "gate",
                "ok": result.get("rc") == 0,
                "answer": lines[0] if lines else f"the gate exited {result.get('rc')}",
                "log": f"{IO_IN}/in/{n}.log",
                "lines": lines,
            }
            self.write_answer(t, n, ans, {f"{n}.log": text.encode()})
            self.page(
                f"gate {sha[:12]} for {t.id}: {'; '.join(lines) or 'no gate: line'}"
            )
            return
        ans = {
            "kind": kind,
            "ok": bool(result.get("ok")),
            "answer": str(result.get("answer", "")),
        }
        if kind == "comfyui" and not ans["ok"]:
            self.stop_comfyui()
        self.write_answer(t, n, ans)
        self.page(
            f"{kind} for {t.id}: {'ok' if ans['ok'] else ans['answer'].splitlines()[0]}"
        )

    # ---- the loop --------------------------------------------------------------------------------------------------
    def next_timeout(self) -> float | None:
        now = self.now()
        deadlines = [t.last_event + IDLE_S for t in self.running()]
        if any(self.ready(t) for t in self.tasks.values()):
            # tick() has just run: a ready task still queued waits for the stagger, or (stagger passed) on a lock
            # another process holds or on the gpu checks, which no event announces; look again in RETRY_S.
            deadlines.append(
                self.next_start_at if self.next_start_at > now else now + RETRY_S
            )
        if not deadlines:
            return None
        return max(1.0, min(deadlines) - now)

    def night_over(self) -> bool:
        if self.ended:
            return True
        if self.running() or self.pending:
            return False
        return not any(self.ready(t) for t in self.tasks.values())

    def tick(self) -> None:
        self.load_queue()
        self.check_idle()
        self.schedule()

    def run_night(self) -> int:
        def on_term(_signum, _frame):
            raise StopNight()

        self.fx.signal(signal.SIGTERM, on_term)
        self.sweep_plan_credentials()
        try:
            self.start_network_helpers()
            self.start_supervisor()
            self.page(f"the night starts ({len(self.tasks)} tasks queued)")
            while True:
                self.tick()
                self.save_state()
                if self.night_over():
                    break
                ev = self.fx.wait(self.next_timeout())
                if ev is not None:
                    self.dispatch(ev)
        except (StopNight, KeyboardInterrupt):
            self.stopping = True
            self.stop_all("queued")
            self.page(
                "night.py stop: every session stopped; unfinished tasks stay queued"
            )
        except Refused as e:
            print(f"start: refused: {e}")
            self.page(f"the night can't go on: {e}")
            self.stop_all("queued")
            return 1
        finally:
            self.stop_helpers()
            self.sweep_plan_credentials()
            self.save_state()
            self.fx.unlock(self.runner_lock)
        done = sum(1 for t in self.tasks.values() if t.state == "done")
        self.page(f"the night ends: {done} of {len(self.tasks)} tasks done")
        return 0

    def sweep_plan_credentials(self) -> None:
        base = f"{self.p.state}/plan"
        try:
            names = os.listdir(base)
        except OSError:
            return
        for n in names:
            if n.endswith(".env"):
                try:
                    os.unlink(f"{base}/{n}")
                except OSError:
                    pass


# ---- commands -------------------------------------------------------------------------------------------------------


def read_state(paths: Paths) -> dict | None:
    try:
        st = json.loads(Path(paths.state_file).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return st if isinstance(st, dict) else None


def cmd_status(paths: Paths) -> int:
    st = read_state(paths)
    if st is None:
        print("status: no night has started")
        return 0
    print(f"night {st.get('night')}")
    print(f"task supervisor {st.get('supervisor')}")
    for tid, rec in (st.get("tasks") or {}).items():
        print(f"task {tid} {rec.get('state')}")
    locks = st.get("locks") or {}
    for name in LOCKS:
        h = locks.get(name)
        print(
            f"lock {name} {h['holder']} since {h['since']}"
            if h
            else f"lock {name} free"
        )
    if st.get("waiting_until"):
        print(f"waiting until {iso(float(st['waiting_until']))}")
    return 0


def cmd_stop(paths: Paths, fx) -> int:
    st = read_state(paths) or {}
    pid = st.get("pid")
    if isinstance(pid, int) and pid > 1:
        parts = fx.cmdline(pid).split(b"\0")
        if any(p.endswith(b"night.py") for p in parts) and b"start" in parts:
            fx.kill(pid, signal.SIGTERM)
    r = fx.run(
        ["docker", "ps", "--filter", "name=^h4-night-", "--format", "{{.Names}}"],
        env=dict(fx.environ),
    )
    names = [n for n in r.out.split() if NIGHT_NAME.fullmatch(n)]
    if names:
        fx.run(
            ["docker", "stop", "-t", str(STOP_GRACE_S), *names],
            env=dict(fx.environ),
            timeout=STOP_GRACE_S + 60,
        )
    print(f"stop: {len(names)} night containers stopped")
    for tid, rec in (st.get("tasks") or {}).items():
        print(f"task {tid} {rec.get('state')}")
    return 0


USAGE = "usage: night.py start|stop|status|check"


def main(argv=None, *, fx=None, home=None) -> int:
    args = sys.argv[1:] if argv is None else list(argv)
    if len(args) != 1 or args[0] not in ("start", "stop", "status", "check"):
        print(USAGE, file=sys.stderr)
        return 2
    cmd = args[0]
    fx = fx or Effects()
    paths = Paths.from_home(home or os.path.expanduser("~"))
    if cmd == "status":
        return cmd_status(paths)
    if cmd == "stop":
        return cmd_stop(paths, fx)
    try:
        facts = read_facts(paths.facts)
    except CantRun as e:
        print(f"{cmd}: can't run: {e}")
        return 2
    # The night is named for the host's local date, as the Author reads it.
    night = dt.datetime.fromtimestamp(fx.now(), dt.UTC).astimezone().date().isoformat()
    runner = Runner(paths, facts, fx, night)
    try:
        runner.preflight(keep_lock=cmd == "start")
    except Refused as e:
        print(f"{cmd}: refused: {e}")
        return 1
    except OSError as e:
        print(
            f"{cmd}: can't run: {type(e).__name__} on {getattr(e, 'filename', '') or 'a file'}"
        )
        return 2
    if cmd == "check":
        print("check: ok")
        return 0
    print(f"start: the night of {night}")
    return runner.run_night()


if __name__ == "__main__":
    sys.exit(main())
