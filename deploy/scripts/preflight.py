#!/usr/bin/env python3
"""make up's preflight (spec 000; contracts/env-files.md §10; plan §4; research.md R-31, R-32, R-37).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/preflight.py --stack prod|dev|dev-cpu --env-file PATH
        [--run-file PATH] [--ref REF] [--repo DIR] [--for up|pull] [--models stack|all]
    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/preflight.py --disk-only --bytes N --path DIR
        [--vhdx-mount /mnt/c]

It reads env files as data and never sources them. It runs every check it can and prints one line per check:
PASS, WARN, or FAIL, the check's ID, and a reason that names keys, paths, and figures, never a value. Exit 1 if
any check failed; make up stops there, before anything starts.

- --for up (the default) runs P1 to P21 for the stack; --for pull runs P1 to P7, P10, P13, and P14 (make pull),
  with P13 counting every image and, with --models all, every model it will fetch.
- --disk-only runs P13 and P14 for N bytes written under DIR (deploy/scripts/pull-models.sh, before each
  download).
- On a host stack make runs the copy of this script in the export of the commit being started, so the templates,
  locks, and compose file it checks are that commit's; --repo names the working tree, for P9, P20, and P21.

The tree it checks (--root, by default the one this script is in) holds deploy/compose.yaml, the templates,
deploy/images.lock, and deploy/models.lock. models.lock has one model per line, whitespace-separated: id, alias,
repo, revision, file, sha256, bytes, license, vram (MiB, or a number with MiB or GiB), and stacks (comma-separated),
as plan §3 lists them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import socket
import stat
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GB = 10**9
GIB = 2**30
MARGIN = 20 * GB
IMAGES_ALLOWANCE = (
    12 * GB
)  # plan §4: what a cold pull of the stack's images takes, with headroom
WSL_HEADROOM = 4 * GIB
ENGINE_BUDGET = (
    16 * GIB - GIB
)  # the h4agents slice's MemoryMax, less 1 GiB (research.md R-37)
COMPOSE_MIN = (2, 30)
PLACEHOLDERS = ("__GENERATE__", "__ASK__", "__REPO__", "__HOME__")
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*")
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")
HEX64_RE = re.compile(r"[0-9a-f]{64}")
DEVCPU_TOKEN_RE = re.compile(r"h4op_devcpu_[A-Za-z0-9_-]{43}")
PORT_KEYS = (
    "H4_API_PORT",
    "H4_LANGFUSE_PORT",
    "H4_GRAFANA_PORT",
    "H4_ADMIN_PORT",
    "H4_OTLP_PORT",
)
CHANNELS = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "ALERT_EMAIL_FROM",
    "ALERT_EMAIL_TO",
)
SWITCHES = {
    "GATEWAY_TEST_CLOCK": ({"0", "1"}, "0"),
    "GATEWAY_TEST_SYNTHETIC_SPEND": ({"0", "1"}, "0"),
    "TELEMETRY_PAYLOAD_SAMPLING": ({"off", "on"}, "off"),
}
DOCKER_ENV = (
    "PATH",
    "HOME",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "BUILDX_CONFIG",
    "XDG_RUNTIME_DIR",
)
WATCHED = ("config", "deploy", "services", "evals", "scripts")  # P21


@dataclass(frozen=True)
class Stack:
    name: str
    env: str
    profiles: str
    base_port: int

    @property
    def host(self) -> bool:
        return self.name != "dev-cpu"


STACKS = {
    "prod": Stack("prod", "prod", "gpu", 18000),
    "dev": Stack("dev", "dev", "gpu,dev-receivers", 18100),
    "dev-cpu": Stack("dev-cpu", "dev", "cpu,dev-receivers", 18300),
}
DEVCPU = {
    "H4_TREE": "/run/h4agents/tree",
    "H4_MODEL_DIR": "/run/h4agents/models",
    "H4_STATE_DIR": "/var/lib/h4agents/state/dev-cpu",
    "H4_AWS_DIR": "/run/h4agents/tree/deploy/aws-none",
    "H4_BUILD_PROXY": "http://198.18.0.1:3128",
}


@dataclass(frozen=True)
class Result:
    check: str
    status: str
    reason: str

    def line(self) -> str:
        return f"{self.status} {self.check} {self.reason}"


@dataclass(frozen=True)
class Model:
    id: str
    alias: str
    repo: str
    revision: str
    file: str
    sha256: str
    bytes: int
    license: str
    vram_mib: int
    stacks: tuple[str, ...]


class Host:
    """Everything preflight asks the machine. The tests replace it."""

    def __init__(self, environ: dict[str, str] | None = None) -> None:
        self.environ = dict(os.environ if environ is None else environ)

    def run(self, args: list[str], timeout: float = 60) -> subprocess.CompletedProcess:
        try:
            return subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout,
                env=self._env(),
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            return subprocess.CompletedProcess(args, 127, "", str(error))

    def _env(self) -> dict[str, str]:
        # Nothing from the shell reaches compose but where the engine is: P5 refuses the rest anyway.
        env = {k: self.environ[k] for k in DOCKER_ENV if k in self.environ}
        env["LC_ALL"] = "C"
        return env

    def docker(self, *args: str, timeout: float = 60) -> subprocess.CompletedProcess:
        return self.run(["docker", *args], timeout)

    def git(self, repo: Path, *args: str) -> subprocess.CompletedProcess:
        return self.run(["git", "-C", str(repo), *args], 30)

    def which(self, name: str) -> str | None:
        return shutil.which(name, path=self.environ.get("PATH"))

    def free_bytes(self, path: Path) -> int:
        info = os.statvfs(existing(path))
        return info.f_bavail * info.f_frsize

    def mounts(self) -> list[tuple[str, str, str]]:
        out = []
        for line in Path("/proc/mounts").read_text(encoding="utf-8").splitlines():
            fields = line.split()
            if len(fields) >= 4:
                out.append((fields[1].replace("\\040", " "), fields[2], fields[3]))
        return out

    def mem_available(self) -> int:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) * 1024
        raise OSError("no MemAvailable in /proc/meminfo")

    def port_free(self, port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                return False
        return True

    def uid(self) -> int:
        return os.getuid()

    def home(self) -> Path:
        return Path(self.environ.get("HOME") or Path.home())


def existing(path: Path) -> Path:
    """path, or its nearest ancestor that exists."""
    path = Path(path)
    while not path.exists() and path != path.parent:
        path = path.parent
    return path


# ---------------------------------------------------------------------------------------------------------------
# Parsers, all data: env files (contracts/env-files.md §1.1) and the two locks.


def parse_env(text: str) -> tuple[dict[str, str], list[str]]:
    values: dict[str, str] = {}
    errors: list[str] = []
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip("\r")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not KEY_RE.fullmatch(key):
            errors.append(
                f"line {number}: not KEY=VALUE (no export, no spaces around =)"
            )
            continue
        if key in values:
            errors.append(f"line {number}: {key} appears twice")
            continue
        if value.startswith("'"):
            if (
                len(value) < 2
                or not value.endswith("'")
                or "'" in value[1:-1]
                or "\n" in value
            ):
                errors.append(
                    f"line {number}: {key}: an unterminated or nested single quote"
                )
                continue
            value = value[1:-1]
        elif re.search(r"[\s$\"'`\\#]", value):
            errors.append(
                f"line {number}: {key}: whitespace, $, a quote, a backslash, or # outside single quotes"
            )
            continue
        if "${" in value:
            errors.append(f"line {number}: {key}: ${{...}} inside a value")
            continue
        values[key] = value
    return values, errors


def read_env(path: Path) -> dict[str, str]:
    values, _ = parse_env(path.read_text(encoding="utf-8"))
    return values


def parse_vram(text: str) -> int:
    found = re.fullmatch(r"(\d+(?:\.\d+)?)(MiB|GiB)?", text)
    if not found:
        raise ValueError(text)
    number = float(found[1])
    return int(number * 1024) if found[2] == "GiB" else int(number)


def read_models(path: Path) -> list[Model]:
    models = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        fields = line.split()
        if len(fields) != 10:
            raise ValueError(
                f"{path.name} line {number}: expected 10 fields, found {len(fields)}"
            )
        id_, alias, repo, revision, file, sha, size, license_, vram, stacks = fields
        models.append(
            Model(
                id_,
                alias,
                repo,
                revision,
                file,
                sha,
                int(size),
                license_,
                parse_vram(vram),
                tuple(stacks.split(",")),
            )
        )
    return models


def read_lock(path: Path) -> dict[str, tuple[str, str, str]]:
    entries = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.lstrip().startswith("#"):
            service, repository, tag, digest, *_ = line.split()
            entries[service] = (repository, tag, digest)
    return entries


def split_reference(ref: str) -> tuple[str, str | None, str | None]:
    name, _, digest = ref.partition("@")
    tag = None
    if name.rfind(":") > name.rfind("/"):
        name, tag = name.rsplit(":", 1)
    return name, tag, digest or None


def active(service: dict, profiles: set[str]) -> bool:
    wanted = set(service.get("profiles") or [])
    return not wanted or bool(wanted & profiles)


def fmt_gb(n: int) -> str:
    return f"{n / GB:.1f} GB"


def fmt_gib(n: int) -> str:
    return f"{n / GIB:.1f} GiB"


# ---------------------------------------------------------------------------------------------------------------


@dataclass
class Context:
    stack: Stack
    env_file: Path
    root: Path
    repo: Path
    host: Host
    mode: str = "up"
    models_scope: str = "stack"
    run_file: Path | None = None
    ref: str | None = None
    values: dict[str, str] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    readable: bool = False
    run_values: dict[str, str] = field(default_factory=dict)
    _cache: dict[str, object] = field(default_factory=dict)

    def compose(self, *args: str) -> subprocess.CompletedProcess:
        command = [
            "compose",
            "-p",
            f"h4reet-{self.stack.name}",
            "-f",
            str(self.root / "deploy/compose.yaml"),
        ]
        command += ["--env-file", str(self.env_file)]
        if self.run_file and self.run_file.is_file():
            command += ["--env-file", str(self.run_file)]
        return self.host.docker(*command, *args)

    def config(self, interpolated: bool) -> dict | None:
        """The rendered compose model; None if compose refused it (or Docker is missing)."""
        key = f"config:{interpolated}"
        if key not in self._cache:
            flags = (
                ["--format", "json"]
                if interpolated
                else ["--no-interpolate", "--no-path-resolution", "--format", "json"]
            )
            done = self.compose("config", *flags)
            try:
                self._cache[key] = (
                    json.loads(done.stdout) if done.returncode == 0 else None
                )
            except json.JSONDecodeError:
                self._cache[key] = None
        return self._cache[key]  # type: ignore[return-value]

    def profiles(self) -> set[str]:
        return {p for p in self.values.get("COMPOSE_PROFILES", "").split(",") if p}

    def services(self) -> dict[str, dict]:
        model = self.config(interpolated=False) or {}
        return model.get("services") or {}

    def models(self) -> list[Model] | None:
        """deploy/models.lock's entries: None when the file is missing, and [] when it doesn't parse."""
        if "models" not in self._cache:
            path = self.root / "deploy/models.lock"
            self._cache["models_error"] = None
            try:
                self._cache["models"] = read_models(path) if path.is_file() else None
            except (ValueError, OSError) as error:
                self._cache["models"] = []
                self._cache["models_error"] = str(error)
        return self._cache["models"]  # type: ignore[return-value]

    def models_problem(self) -> str | None:
        """Why the stack's model can't be checked against deploy/models.lock, or None when it can."""
        if self.models() is None:
            return "deploy/models.lock is missing"
        if self._cache.get("models_error"):
            return f"deploy/models.lock doesn't parse: {self._cache['models_error']}"
        return None

    def stack_model(self) -> Model | None:
        file = self.values.get("MODEL_FILE")
        return next(
            (
                m
                for m in self.models() or []
                if m.file == file and self.stack.name in m.stacks
            ),
            None,
        )

    def docker_info(self) -> dict[str, object] | None:
        if "info" not in self._cache:
            done = self.host.docker(
                "info",
                "--format",
                "{{json .SecurityOptions}}\n{{json .Plugins.Authorization}}\n{{json .Runtimes}}\n{{.DockerRootDir}}",
            )
            info = None
            if done.returncode == 0:
                lines = done.stdout.splitlines()
                try:
                    info = {
                        "security": json.loads(lines[0]) or [],
                        "authz": json.loads(lines[1]) or [],
                        "runtimes": json.loads(lines[2]) or {},
                        "root": lines[3].strip(),
                    }
                except (IndexError, json.JSONDecodeError):
                    info = None
            self._cache["info"] = info
        return self._cache["info"]  # type: ignore[return-value]


def ok(check: str, reason: str) -> Result:
    return Result(check, "PASS", reason)


def warn(check: str, reason: str) -> Result:
    return Result(check, "WARN", reason)


def fail(check: str, reason: str) -> Result:
    return Result(check, "FAIL", reason)


def summarize(
    check: str, problems: list[str], passed: str, warnings: list[str] | None = None
) -> Result:
    if problems:
        return fail(check, "; ".join(problems))
    if warnings:
        return warn(check, "; ".join(warnings))
    return ok(check, passed)


# ---------------------------------------------------------------------------------------------------------------
# The checks.


def p1(ctx: Context) -> Result:
    path = ctx.env_file
    if not path.is_file():
        hint = f": make init-env ENV={ctx.stack.name}" if ctx.stack.host else ""
        return fail("P1", f"{path} is missing{hint}")
    problems = []
    if ctx.stack.host:
        info, parent = path.stat(), path.parent.stat()
        if info.st_uid != ctx.host.uid():
            problems.append(f"{path} isn't yours")
        if stat.S_IMODE(info.st_mode) != 0o600:
            problems.append(
                f"{path} is mode {stat.S_IMODE(info.st_mode):04o}, not 0600"
            )
        if stat.S_IMODE(parent.st_mode) != 0o700:
            problems.append(
                f"{path.parent} is mode {stat.S_IMODE(parent.st_mode):04o}, not 0700"
            )
    if not ctx.readable:
        problems.append(f"{path} can't be read")
    return summarize(
        "P1",
        problems,
        f"{path} is readable"
        + (", mode 0600 in a 0700 directory" if ctx.stack.host else ""),
    )


def p2(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P2", "needs a readable env file (P1)")
    return summarize("P2", ctx.errors, "every line is KEY=VALUE, each key once")


def p3(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P3", "needs a readable env file (P1)")
    allowed_empty = {"H4_BUILD_PROXY"} if ctx.stack.host else set()
    if ctx.stack.name == "dev":
        allowed_empty |= set(CHANNELS)
    left = [k for k, v in ctx.values.items() if any(p in v for p in PLACEHOLDERS)]
    empty = [k for k, v in ctx.values.items() if v == "" and k not in allowed_empty]
    problems = []
    if left:
        problems.append(
            f"placeholders left in {', '.join(left)}: fill them in an editor"
        )
    if empty:
        problems.append(f"empty: {', '.join(empty)}")
    return summarize("P3", problems, "no placeholder or empty value is left")


def template_keys(ctx: Context) -> set[str]:
    name = "dev" if ctx.stack.name == "dev-cpu" else ctx.stack.name
    keys = set(read_env(ctx.root / "deploy" / "env.example" / f"{name}.env.example"))
    if ctx.stack.name == "dev-cpu":
        keys |= {"H4_DEVCPU_OPERATOR_TOKEN", "H4_TREE"}
    return keys


def p4(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P4", "needs a readable env file (P1)")
    expected = template_keys(ctx)
    missing = sorted(expected - set(ctx.values))
    extra = sorted(set(ctx.values) - expected)
    problems = []
    if missing:
        hint = (
            f" (make init-env ENV={ctx.stack.name} SYNC=1 adds them)"
            if ctx.stack.host
            else ""
        )
        problems.append(f"missing {', '.join(missing)}{hint}")
    if extra:
        problems.append(f"not in the template: {', '.join(extra)}")
    return summarize("P4", problems, "the keys are the template's")


def p5(ctx: Context) -> Result:
    keys = template_keys(ctx) | set(ctx.values)
    set_in_shell = sorted(
        k for k in ctx.host.environ if k.startswith(("COMPOSE_", "H4_")) or k in keys
    )
    if set_in_shell:
        return fail(
            "P5",
            f"the shell sets {', '.join(set_in_shell)}, which would override the env file: unset them",
        )
    return ok("P5", "the shell sets no COMPOSE_*, H4_*, or template key")


def p6(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P6", "needs a readable env file (P1)")
    v, s = ctx.values, ctx.stack
    problems = []
    if v.get("H4_STACK") != s.name:
        problems.append(f"H4_STACK isn't {s.name}, the ENV make was given")
    if v.get("H4_ENV") != s.env:
        problems.append(f"H4_ENV isn't {s.env}")
    if v.get("COMPOSE_PROJECT_NAME") != f"h4reet-{s.name}":
        problems.append(f"COMPOSE_PROJECT_NAME isn't h4reet-{s.name}")
    profiles = v.get("COMPOSE_PROFILES", "").split(",")
    if v.get("COMPOSE_PROFILES") != s.profiles:
        problems.append(f"COMPOSE_PROFILES isn't {s.profiles}")
    elif ("gpu" in profiles) == ("cpu" in profiles) or "breach" in profiles:
        problems.append(
            "COMPOSE_PROFILES needs exactly one of gpu and cpu, and never breach"
        )
    return summarize(
        "P6",
        problems,
        f"ENV, H4_STACK, H4_ENV, the project, and the profiles agree on {s.name}",
    )


def p7(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P7", "needs a readable env file (P1)")
    v, s, home = ctx.values, ctx.stack, ctx.host.home()
    problems: list[str] = []
    for i, key in enumerate(PORT_KEYS):
        if v.get(key) != str(s.base_port + i):
            problems.append(f"{key} isn't {s.name}'s {s.base_port + i}")
    if s.host:
        if "H4_TREE" in v:
            problems.append(
                "H4_TREE is set in a host stack's env file: make up sets it in the run file"
            )
        state = home / ".local/state/h4reet" / s.name
        if v.get("H4_STATE_DIR") != str(state):
            problems.append(
                f"H4_STATE_DIR isn't {state}, where make finds the run file"
            )
        if v.get("H4_BUILD_PROXY", "") != "":
            problems.append("H4_BUILD_PROXY is set on a host stack")
        model_dir = v.get("H4_MODEL_DIR", "")
        if not model_dir.startswith("/"):
            problems.append("H4_MODEL_DIR isn't an absolute path")
        problems += run_file_problems(ctx)
    else:
        for key, expected in DEVCPU.items():
            if v.get(key) != expected:
                problems.append(f"{key} isn't {expected}")
    aws = v.get("H4_AWS_DIR", "")
    if s.name == "prod":
        if aws != str(home / ".config/h4reet-ai/aws-home/.aws"):
            problems.append(
                f"H4_AWS_DIR isn't {home / '.config/h4reet-ai/aws-home/.aws'}"
            )
    elif s.name == "dev":
        if not aws.endswith("/deploy/aws-none") or not aws.startswith("/"):
            problems.append("H4_AWS_DIR doesn't name the repository's deploy/aws-none")
        elif Path(aws).is_dir() and sorted(p.name for p in Path(aws).iterdir()) != [
            "README.md"
        ]:
            problems.append(f"{aws} holds more than its README.md")
        elif not Path(aws).is_dir():
            problems.append(f"{aws} doesn't exist")
    vhdx = v.get("H4_VHDX_MOUNT", "")
    if not windows_drive(ctx.host, vhdx):
        problems.append(
            f"H4_VHDX_MOUNT {vhdx or '(empty)'} isn't a mounted Windows drive (9p, aname=drvfs)"
        )
    problems += value_shape_problems(ctx)
    problems += model_key_problems(ctx)
    return summarize("P7", problems, f"every value is {s.name}'s")


def run_file_problems(ctx: Context) -> list[str]:
    if ctx.mode != "up":
        return []
    if not ctx.run_file or not ctx.run_file.is_file():
        return [
            "no run file: make up writes it before preflight (contracts/env-files.md §12)"
        ]
    r = ctx.run_values
    problems = []
    if set(r) != {"H4_TREE", "H4_REF", "H4_REF_BRANCH", "H4_REF_PREVIOUS"}:
        problems.append(
            f"{ctx.run_file} doesn't hold exactly H4_TREE, H4_REF, H4_REF_BRANCH, H4_REF_PREVIOUS"
        )
    sha = r.get("H4_REF", "")
    expected = Path(ctx.values.get("H4_STATE_DIR", "")) / "tree" / sha
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        problems.append("the run file's H4_REF isn't a full commit SHA")
    elif r.get("H4_TREE") != str(expected):
        problems.append(
            f"the run file's H4_TREE isn't {expected}, the export of its H4_REF"
        )
    elif not (expected / "deploy/compose.yaml").is_file():
        problems.append(
            f"{expected} holds no deploy/compose.yaml: run make up again to export it"
        )
    return problems


def windows_drive(host: Host, mount: str) -> bool:
    try:
        return any(
            m == mount and t == "9p" and "aname=drvfs" in o for m, t, o in host.mounts()
        )
    except OSError:
        return False


def value_shape_problems(ctx: Context) -> list[str]:
    v, s = ctx.values, ctx.stack
    problems = []
    base = v.get("LOCAL_MODEL_BASE_URL", "")
    # The host must start with a letter, as compose service names do: an all-digit or 0x label is an IPv4
    # address to every URL parser and to getaddrinfo, so http://134744072:8080 would reach 8.8.8.8 unmetered.
    # The label is the gateway's SERVICE_LABEL (provider-adapter.md §3.1); the port is one a server can listen on.
    url = re.fullmatch(
        r"http://[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?(?::(\d{1,5}))?(?:/[A-Za-z0-9._~/-]*)?",
        base,
    )
    if not url or not 0 < int(url.group(1) or 80) <= 65535:
        problems.append(
            "LOCAL_MODEL_BASE_URL isn't http://<an in-stack service, its name starting with a letter>[:port][/path]"
        )
    delivery = {"prod": "real", "dev": "standin", "dev-cpu": "standin"}[s.name]
    if v.get("ALERT_DELIVERY") != delivery:
        problems.append(f"ALERT_DELIVERY isn't {delivery} on {s.name}")
    telegram = (
        "http://telegram-standin:8080"
        if s.name == "dev-cpu"
        else "https://api.telegram.org"
    )
    if v.get("TELEGRAM_API_BASE") != telegram:
        problems.append(f"TELEGRAM_API_BASE isn't {telegram}")
    tls = v.get("SMTP_TLS", "")
    if tls not in ("implicit", "starttls", "none") or (tls == "none") != (
        s.name == "dev-cpu"
    ):
        problems.append("SMTP_TLS is implicit or starttls, and none only on dev-cpu")
    if s.name == "prod":
        if (tls, v.get("SMTP_PORT")) not in (("implicit", "465"), ("starttls", "587")):
            problems.append(
                "SMTP_TLS and SMTP_PORT aren't implicit with 465 or starttls with 587"
            )
        if v.get("GATEWAY_AWS_PROFILE") != "h4reet-bedrock":
            problems.append("GATEWAY_AWS_PROFILE isn't h4reet-bedrock")
    elif "GATEWAY_AWS_PROFILE" in v:
        problems.append("GATEWAY_AWS_PROFILE is set outside prod")
    sha = v.get("OPERATOR_TOKEN_SHA256", "")
    if not HEX64_RE.fullmatch(sha):
        problems.append(
            "OPERATOR_TOKEN_SHA256 isn't 64 lowercase hex: make operator-token prints it"
        )
    if s.host:
        token = ctx.host.home() / ".config/h4reet-ai/operator" / f"{s.name}.token"
        if not token.is_file():
            problems.append(f"{token} is missing: make operator-token ENV={s.name}")
        elif stat.S_IMODE(token.stat().st_mode) not in (0o600, 0o400):
            problems.append(f"{token} isn't mode 0600")
        if s.name == "prod" and sha and sha == devcpu_dummy_hash(ctx.root):
            problems.append(
                "OPERATOR_TOKEN_SHA256 is the published dev-cpu dummy's hash"
            )
    else:
        dummy = v.get("H4_DEVCPU_OPERATOR_TOKEN", "")
        if not DEVCPU_TOKEN_RE.fullmatch(dummy):
            problems.append(
                "H4_DEVCPU_OPERATOR_TOKEN isn't h4op_devcpu_ and 43 base64url characters"
            )
        elif hashlib.sha256(dummy.encode()).hexdigest() != sha:
            problems.append("OPERATOR_TOKEN_SHA256 isn't the dummy token's SHA-256")
    if not v.get("LANGFUSE_PUBLIC_KEY", "").startswith("pk-lf-"):
        problems.append("LANGFUSE_PUBLIC_KEY doesn't start pk-lf-")
    if not v.get("LANGFUSE_SECRET_KEY", "").startswith("sk-lf-"):
        problems.append("LANGFUSE_SECRET_KEY doesn't start sk-lf-")
    if not HEX64_RE.fullmatch(v.get("LANGFUSE_ENCRYPTION_KEY", "")):
        problems.append(
            "LANGFUSE_ENCRYPTION_KEY isn't 64 lowercase hex (256 bits, as Langfuse requires)"
        )
    ro = v.get("GATEWAY_GRAFANA_RO_PASSWORD", "")
    if ro and not re.fullmatch(r"[!-~]+", ro):
        # The gateway sets grafana_ro's password from it and refuses anything else (grafana_ro_password_invalid).
        problems.append(
            "GATEWAY_GRAFANA_RO_PASSWORD isn't printable ASCII without spaces, so the gateway would refuse to start"
        )
    if not re.fullmatch(r"[A-Za-z0-9._~-]+", v.get("LANGFUSE_DB_PASSWORD", "")):
        problems.append(
            "LANGFUSE_DB_PASSWORD would need URL escaping inside DATABASE_URL"
        )
    return problems


def devcpu_dummy_hash(root: Path) -> str | None:
    try:
        return read_env(root / "deploy/env.agents/dev-cpu.vars").get(
            "OPERATOR_TOKEN_SHA256"
        )
    except OSError:
        return None


def model_key_problems(ctx: Context) -> list[str]:
    v, s = ctx.values, ctx.stack
    problems = []
    unreadable = ctx.models_problem()
    if unreadable:
        return [unreadable]
    model = ctx.stack_model()
    if model is None:
        problems.append(f"MODEL_FILE names no deploy/models.lock entry for {s.name}")
    elif v.get("MODEL_ALIAS") != model.alias:
        problems.append(f"MODEL_ALIAS isn't the lock's alias for {model.file}")
    try:
        ctx_size, parallel, threads = (
            int(v["MODEL_CTX_SIZE"]),
            int(v["MODEL_PARALLEL"]),
            int(v["MODEL_THREADS"]),
        )
    except (KeyError, ValueError):
        return [
            *problems,
            "MODEL_CTX_SIZE, MODEL_PARALLEL, and MODEL_THREADS must be integers",
        ]
    if not 1 <= parallel <= 8:
        problems.append("MODEL_PARALLEL isn't 1 to 8")
    elif ctx_size <= 0 or ctx_size % parallel:
        problems.append("MODEL_CTX_SIZE isn't a positive multiple of MODEL_PARALLEL")
    if not 1 <= threads <= (4 if s.name == "dev-cpu" else 64):
        problems.append("MODEL_THREADS is out of range (1 to 4 on the engine)")
    return problems


def routing(ctx: Context) -> tuple[dict | None, str | None]:
    """config/routing.yaml, through PyYAML when the system has it: (the parsed file, or None; why not)."""
    path = ctx.root / "config/routing.yaml"
    if not path.is_file():
        return None, f"{path.relative_to(ctx.root)} is missing"
    try:
        import yaml  # the system's python3-yaml: root-owned, outside the tree, so -I still finds it
    except ImportError:
        return None, "PyYAML isn't installed, so config/routing.yaml wasn't read"
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}, None
    except yaml.YAMLError:
        return None, "config/routing.yaml doesn't parse"


def paid_route(ctx: Context, env: str) -> str | None:
    """The paid adapter env's route names, if any."""
    config, _ = routing(ctx)
    if not isinstance(config, dict):
        return None
    adapters = config.get("adapters") or {}
    route = (config.get("envs") or {}).get(env) or {}
    for role in ("primary", "fallback"):
        adapter = adapters.get(route.get(role)) if isinstance(route, dict) else None
        if isinstance(adapter, dict) and adapter.get("kind") == "paid":
            return str(route.get(role))
    return None


def p8(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P8", "needs a readable env file (P1)")
    v = ctx.values
    is_dev = v.get("H4_ENV") == "dev"
    problems, warnings = [], []
    for key, (allowed, off) in SWITCHES.items():
        if key not in v:
            continue
        if v[key] not in allowed:
            problems.append(f"{key} isn't {' or '.join(sorted(allowed))}")
        elif not is_dev and v[key] != off:
            problems.append(f"{key} is on outside H4_ENV=dev (FR-036)")
    env = v.get("H4_ENV", "")
    if env in ("prod", "dev"):
        config, why = routing(ctx)
        if config is None:
            warnings.append(
                f"{why}; the gateway refuses a paid route outside prod itself (exit 78)"
            )
        elif env != "prod" and (adapter := paid_route(ctx, env)):
            problems.append(
                f"config/routing.yaml routes {env} to {adapter}, a paid adapter, outside prod (FR-031)"
            )
    return summarize(
        "P8",
        problems,
        "no dev-only switch outside dev, and no paid route outside prod",
        warnings,
    )


def is_env_file(name: str) -> bool:
    if name.endswith(".env.example"):
        return False
    return name.endswith(".env") or name == ".env" or name.startswith(".env.")


def p9(ctx: Context) -> Result:
    problems, warnings = [], []
    for tree in dict.fromkeys((ctx.root, ctx.repo)):
        for name in (".env", "compose.override.yaml", "compose.override.yml"):
            if (tree / "deploy" / name).exists():
                problems.append(f"{tree / 'deploy' / name} exists")
        problems += [
            f"{p} exists"
            for p in sorted((tree / "deploy").glob("docker-compose.override.*"))
        ]
    unreadable: list[str] = []

    def onerror(error: OSError) -> None:
        unreadable.append(str(error.filename))

    for dirpath, dirnames, filenames in os.walk(ctx.repo, onerror=onerror):
        dirnames[:] = sorted(d for d in dirnames if d not in (".git", "node_modules"))
        for name in sorted(filenames):
            if is_env_file(name):
                problems.append(
                    f"{Path(dirpath, name)}: move it to ~/.config/h4reet-ai/env/"
                )
    for path in unreadable:
        if ctx.stack.host:
            problems.append(
                f"{path} can't be read, so it can't be checked for env files"
            )
        else:
            warnings.append(
                f"{path} can't be read here; the engine masks it (contracts/agents-engine.md H8)"
            )
    return summarize(
        "P9",
        problems,
        "no deploy/.env, no override file, and no env file in the working tree",
        warnings,
    )


def p10(ctx: Context) -> Result:
    server = ctx.host.docker("version", "--format", "{{.Server.Version}}")
    if server.returncode != 0:
        hint = (
            " (inside the sandbox, run make through deploy/agents-engine/docker-relay)"
            if sandboxed(ctx)
            else ""
        )
        return fail("P10", f"Docker isn't reachable{hint}")
    compose = ctx.host.docker("compose", "version", "--short")
    found = re.match(r"v?(\d+)\.(\d+)", compose.stdout.strip())
    if compose.returncode != 0 or not found:
        return fail("P10", "docker compose isn't installed")
    if (int(found[1]), int(found[2])) < COMPOSE_MIN:
        return fail("P10", f"Compose {compose.stdout.strip()} is older than 2.30")
    return ok(
        "P10", f"Docker {server.stdout.strip()}, Compose {compose.stdout.strip()}"
    )


def sandboxed(ctx: Context) -> bool:
    return ctx.host.environ.get("SANDBOX_RUNTIME") == "1"


def p11(ctx: Context) -> Result:
    info = ctx.docker_info()
    if info is None:
        return fail("P11", "docker info didn't answer (P10)")
    rootless = any("rootless" in str(o) for o in info["security"])  # type: ignore[union-attr]
    authz = "h4-authz" in (info["authz"] or [])  # type: ignore[operator]
    if ctx.stack.host and rootless:
        return fail(
            "P11",
            f"{ctx.stack.name} runs on the host's rootful engine, and this one is rootless",
        )
    if not ctx.stack.host and not (rootless and authz):
        hint = (
            "; inside the sandbox, run make through deploy/agents-engine/docker-relay"
            if sandboxed(ctx)
            else ""
        )
        return fail(
            "P11",
            f"dev-cpu runs only on the agents' engine: rootless, with h4-authz{hint}",
        )
    return ok(
        "P11",
        "the agents' engine" if not ctx.stack.host else "the host's rootful engine",
    )


def p12(ctx: Context) -> Result:
    if "gpu" not in ctx.profiles():
        return ok("P12", "no gpu profile")
    if ctx.config(interpolated=False) is None:
        return fail("P12", "docker compose config didn't render the compose file (P10)")
    if "model-server-gpu" not in ctx.services():
        return fail(
            "P12",
            "the gpu profile, but deploy/compose.yaml has no model-server-gpu (plan §3)",
        )
    info = ctx.docker_info()
    if info is None:
        return fail("P12", "docker info didn't answer (P10)")
    if "nvidia" not in (info["runtimes"] or {}):  # type: ignore[operator]
        return fail(
            "P12",
            "the nvidia runtime is missing: sudo nvidia-ctk runtime configure --runtime=docker",
        )
    model = ctx.stack_model()
    if model is None:
        return fail("P12", "the stack's model isn't in deploy/models.lock (P7)")
    running = ctx.host.docker(
        "ps",
        "--filter",
        f"label=com.docker.compose.project=h4reet-{ctx.stack.name}",
        "--filter",
        "label=com.docker.compose.service=model-server-gpu",
        "--format",
        "{{.ID}}",
    )
    if running.returncode == 0 and running.stdout.strip():
        return ok("P12", "this stack's model server already holds its VRAM")
    free = free_vram_mib(ctx)
    if free is None:
        return fail(
            "P12",
            "free VRAM couldn't be read, with nvidia-smi or the pinned CUDA probe",
        )
    if free < model.vram_mib:
        return fail(
            "P12", f"{free} MiB of VRAM free; {model.file} needs {model.vram_mib} MiB"
        )
    return ok("P12", f"{free} MiB of VRAM free; the model needs {model.vram_mib} MiB")


def free_vram_mib(ctx: Context) -> int | None:
    query = ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"]
    if ctx.host.which("nvidia-smi"):
        done = ctx.host.run(query, 30)
    else:
        repository, tag, digest = read_lock(ctx.root / "deploy/images.lock").get(
            "probe:cuda", ("", "", "")
        )
        if not digest.startswith("sha256:"):
            return None
        done = ctx.host.docker(
            "run",
            "--rm",
            "--gpus",
            "all",
            f"{repository}:{tag}@{digest}",
            *query,
            timeout=120,
        )
    try:
        return int(done.stdout.split()[0]) if done.returncode == 0 else None
    except (IndexError, ValueError):
        return None


def models_to_fetch(ctx: Context) -> list[Model]:
    models = ctx.models() or []
    chosen = (
        models if ctx.models_scope == "all" else [m for m in [ctx.stack_model()] if m]
    )
    folder = Path(ctx.values.get("H4_MODEL_DIR", "/nonexistent"))
    out = []
    for model in chosen:
        path = folder / model.file
        if not (path.is_file() and path.stat().st_size == model.bytes):
            out.append(model)
    return out


def images_missing(ctx: Context) -> list[str]:
    lock = read_lock(ctx.root / "deploy/images.lock")
    profiles = ctx.profiles()
    refs = []
    for service in ctx.services().values():
        if service.get("image") and (ctx.mode == "pull" or active(service, profiles)):
            refs.append(str(service["image"]))
    for base in ("base:node", "base:python"):
        if base in lock and lock[base][2].startswith("sha256:"):
            repository, tag, digest = lock[base]
            refs.append(f"{repository}:{tag}@{digest}")
    return [
        r
        for r in dict.fromkeys(refs)
        if ctx.host.docker("image", "inspect", "--format", "{{.Id}}", r).returncode
    ]


def disk(host: Host, need: int, vhdx: str, ext4_paths: list[Path], what: str) -> Result:
    figures, problems = [], []
    try:
        if not windows_drive(host, vhdx):
            raise OSError("not a mounted Windows drive")
        drive = host.free_bytes(Path(vhdx))
        figures.append(f"{vhdx} {fmt_gb(drive)} free")
        if drive < need:
            problems.append(f"the Windows drive {vhdx} has {fmt_gb(drive)} free")
    except OSError as error:
        problems.append(
            f"the Windows drive {vhdx or '(none)'} can't be read ({error}), so the check fails closed"
        )
    for path in dict.fromkeys(ext4_paths):
        try:
            free = host.free_bytes(path)
        except OSError as error:
            problems.append(f"{path} can't be read ({error})")
            continue
        figures.append(f"{path} {fmt_gb(free)} free")
        if free < need:
            problems.append(f"{path} has {fmt_gb(free)} free")
    required = f"needs {fmt_gb(need)} free ({what}; and the {fmt_gb(MARGIN)} margin)"
    if problems:
        return fail("P13", f"{required}: {'; '.join(problems)} (research.md R-32)")
    return ok("P13", f"{required}: {', '.join(figures)}")


def p13(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P13", "needs a readable env file (P1)")
    models = models_to_fetch(ctx) if ctx.models() else []
    missing = images_missing(ctx)
    need = sum(m.bytes for m in models) + (IMAGES_ALLOWANCE if missing else 0) + MARGIN
    parts = [
        f"{len(models)} model(s) to download, {fmt_gb(sum(m.bytes for m in models))}"
    ]
    parts.append(
        f"{len(missing)} image(s) missing locally"
        + (f", counted as {fmt_gb(IMAGES_ALLOWANCE)}" if missing else "")
    )
    if ctx.stack.host:
        info = ctx.docker_info()
        root = (
            Path(str(info["root"]))
            if info and info.get("root")
            else Path("/var/lib/docker")
        )
        ext4 = [root, Path(ctx.values.get("H4_MODEL_DIR", "/"))]
    else:
        ext4 = [Path("/")]  # the engine's data root is on the same WSL disk
    result = disk(
        ctx.host,
        need,
        ctx.values.get("H4_VHDX_MOUNT", "/mnt/c"),
        ext4,
        "; ".join(parts),
    )
    return result


def p14(ctx: Context, path: str | None = None) -> Result:
    target = path if path is not None else ctx.values.get("H4_MODEL_DIR", "")
    if not target.startswith("/"):
        return fail("P14", "H4_MODEL_DIR isn't an absolute path")
    if target == "/mnt" or target.startswith("/mnt/"):
        return fail(
            "P14", f"{target} is under /mnt/, on the Windows drive: keep models on ext4"
        )
    if ctx.stack.host:
        fstype = filesystem(ctx.host, Path(target))
        if fstype != "ext4":
            return fail(
                "P14", f"{target} is on {fstype or 'an unknown filesystem'}, not ext4"
            )
    return ok(
        "P14",
        f"{target} is on ext4, not under /mnt/"
        if ctx.stack.host
        else f"{target} isn't under /mnt/",
    )


def filesystem(host: Host, path: Path) -> str | None:
    target = str(existing(path))
    best, fstype = "", None
    try:
        for mount, kind, _ in host.mounts():
            if (target == mount or target.startswith(mount.rstrip("/") + "/")) and len(
                mount
            ) > len(best):
                best, fstype = mount, kind
    except OSError:
        return None
    return fstype


def p15(ctx: Context) -> Result:
    model = ctx.config(interpolated=True)
    if model is None:
        return fail("P15", "docker compose config didn't render the stack (P10, P2)")
    profiles = ctx.profiles() | ({"breach"} if not ctx.stack.host else set())
    total, unlimited = 0, []
    for name, service in (model.get("services") or {}).items():
        if not active(service, profiles):
            continue
        memory = (
            ((service.get("deploy") or {}).get("resources") or {}).get("limits") or {}
        ).get("memory")
        if memory in (None, "", "0"):
            unlimited.append(name)
        else:
            total += int(str(memory))
    if unlimited:
        return fail("P15", f"no memory limit on {', '.join(unlimited)} (plan §2)")
    if ctx.stack.host:
        available = ctx.host.mem_available()
        need = total + WSL_HEADROOM
        figures = f"the limits sum to {fmt_gib(total)}, plus {fmt_gib(WSL_HEADROOM)}; WSL has {fmt_gib(available)} available"
        return (fail if available < need else ok)("P15", figures)
    figures = f"the limits sum to {fmt_gib(total)} with the breach probe, against the engine's {fmt_gib(ENGINE_BUDGET)}"
    return (fail if total > ENGINE_BUDGET else ok)("P15", figures)


def p16(ctx: Context) -> Result:
    if not ctx.readable:
        return fail("P16", "needs a readable env file (P1)")
    ports = [int(ctx.values[k]) for k in PORT_KEYS if ctx.values.get(k, "").isdigit()]
    listing = ctx.host.docker(
        "ps",
        "--format",
        '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}\t{{.Ports}}',
    )
    if listing.returncode != 0:
        return fail("P16", "docker ps didn't answer (P10)")
    owners: dict[int, str] = {}
    for line in listing.stdout.splitlines():
        project, _, rest = line.partition("\t")
        service, _, published = rest.partition("\t")
        for port in re.findall(r":(\d+)->", published):
            owners[int(port)] = f"{project or '(no project)'}/{service or '?'}"
    mine = f"h4reet-{ctx.stack.name}/edge"
    problems = []
    for port in ports:
        owner = owners.get(port)
        if owner == mine:
            continue
        if owner:
            problems.append(f"127.0.0.1:{port} is published by {owner}")
        elif ctx.stack.host and not ctx.host.port_free(port):
            problems.append(f"127.0.0.1:{port} is held by another process")
    return summarize(
        "P16",
        problems,
        f"ports {ports[0] if ports else '?'}-{ports[-1] if ports else '?'} are free or this stack's edge's",
    )


def p17(ctx: Context) -> Result:
    model = ctx.config(interpolated=False)
    if model is None:
        return fail("P17", "docker compose config didn't render the compose file (P10)")
    lock = read_lock(ctx.root / "deploy/images.lock")
    problems = []
    for name, service in sorted((model.get("services") or {}).items()):
        image = service.get("image")
        if service.get("build") is not None or not image:
            continue
        repository, tag, digest = split_reference(str(image))
        if lock.get(name, ("", "", ""))[1:] == ("-", "-"):
            # An open pin (research.md R-09): the compose policy reports it PLANNED, but nothing starts unpinned.
            problems.append(
                f"{name}: its pin in deploy/images.lock is still open: make pin-images resolves it"
            )
        elif not digest or not DIGEST_RE.fullmatch(digest):
            problems.append(f"{name}: not pinned by digest")
        elif lock.get(name) != (repository, tag, digest):
            problems.append(f"{name}: differs from deploy/images.lock")
    return summarize(
        "P17", problems, "every image is pinned, as deploy/images.lock pins it"
    )


def p18(ctx: Context) -> Result:
    unreadable = ctx.models_problem()
    if unreadable:
        return fail("P18", unreadable)
    model = ctx.stack_model()
    if model is None:
        return fail("P18", "the stack's model isn't in deploy/models.lock (P7)")
    path = Path(ctx.values.get("H4_MODEL_DIR", "/nonexistent")) / model.file
    seed = "ask the Author to run deploy/agents-engine/engine.sh seed"
    if path.is_symlink():
        return fail(
            "P18",
            f"{path} is a symbolic link, which the model server's read-only mount can't follow out of H4_MODEL_DIR",
        )
    if not path.is_file():
        if ctx.stack.host:
            return warn(
                "P18",
                f"{path} is missing: pull-models.sh fetches it next, and P13 counted its bytes",
            )
        return fail("P18", f"{path} is missing: {seed}")
    info = path.stat()
    problems = []
    if info.st_size != model.bytes:
        problems.append(f"{path} is {info.st_size} bytes, not the lock's {model.bytes}")
    if stat.S_IMODE(info.st_mode) != 0o444:
        problems.append(f"{path} isn't mode 0444")
    if problems:
        problems.append(
            f"make pull ENV={ctx.stack.name} checks a file of the lock's size against its sha256 and sets mode 0444;"
            " move one of another size aside"
            if ctx.stack.host
            else seed
        )
    return summarize("P18", problems, f"{model.file} has the lock's size, mode 0444")


def p19(ctx: Context) -> Result:
    aws = Path(ctx.values.get("H4_AWS_DIR", ""))
    if not aws.is_dir():
        return fail("P19", f"{aws} is missing: make init-env ENV=prod creates it")
    if stat.S_IMODE(aws.stat().st_mode) != 0o700:
        return fail("P19", f"{aws} isn't mode 0700")
    adapter = paid_route(ctx, "prod")
    if adapter is None:
        return ok(
            "P19",
            f"{aws} is 0700; prod routes to no paid adapter yet, so it may be empty",
        )
    config = aws / "config"
    try:
        has_profile = re.search(
            r"^\[profile h4reet-bedrock\]\s*$",
            config.read_text(encoding="utf-8"),
            re.MULTILINE,
        )
    except OSError:
        has_profile = None
    if not has_profile:
        return fail(
            "P19",
            f"prod routes to {adapter}, but {config} has no [profile h4reet-bedrock] (quickstart.md §0.6)",
        )
    return ok("P19", f"{aws} is 0700, with the h4reet-bedrock profile")


def p20(ctx: Context) -> Result:
    git_dir = ctx.host.git(ctx.repo, "rev-parse", "--path-format=absolute", "--git-dir")
    common = ctx.host.git(
        ctx.repo, "rev-parse", "--path-format=absolute", "--git-common-dir"
    )
    if git_dir.returncode or common.returncode:
        return fail("P20", f"{ctx.repo} isn't a git working tree")
    if git_dir.stdout.strip() != common.stdout.strip():
        return fail(
            "P20", "this is a linked worktree: run dev-cpu from the main working tree"
        )
    return ok("P20", "the main working tree")


def p21(ctx: Context) -> Result:
    ref = ctx.ref or "HEAD"
    if ctx.host.git(
        ctx.repo, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"
    ).returncode:
        return fail("P21", f"REF {ref} isn't a commit")
    status = ctx.host.git(
        ctx.repo, "status", "--porcelain", "--untracked-files=all", "--", *WATCHED
    )
    changed = [line[3:] for line in status.stdout.splitlines() if line.strip()]
    if changed:
        shown = ", ".join(changed[:10]) + (
            f", and {len(changed) - 10} more" if len(changed) > 10 else ""
        )
        return warn(
            "P21",
            f"uncommitted changes, which the export of {ref} doesn't hold: {shown}",
        )
    return ok("P21", f"nothing uncommitted under {', '.join(WATCHED)}")


UP = (p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18)
PULL = (p1, p2, p3, p4, p5, p6, p7, p10, p13, p14)


def run_checks(ctx: Context) -> list[Result]:
    if ctx.env_file.is_file():
        try:
            ctx.values, ctx.errors = parse_env(ctx.env_file.read_text(encoding="utf-8"))
            ctx.readable = True
        except (OSError, UnicodeDecodeError):
            ctx.readable = False
    if ctx.run_file and ctx.run_file.is_file():
        ctx.run_values = read_env(ctx.run_file)
    checks: list[Callable[[Context], Result]] = list(UP if ctx.mode == "up" else PULL)
    if ctx.mode == "up":
        if ctx.stack.name == "prod":
            checks.append(p19)
        if ctx.stack.name == "dev-cpu":
            checks.append(p20)
        if ctx.stack.host:
            checks.append(p21)
    results = []
    for check in checks:
        try:
            results.append(check(ctx))
        except (OSError, ValueError, KeyError) as error:
            name = check.__name__.upper()
            results.append(fail(name, f"couldn't run: {type(error).__name__}: {error}"))
    return results


def disk_only(host: Host, size: int, path: str, vhdx: str) -> list[Result]:
    ctx = Context(STACKS["prod"], Path("/nonexistent"), ROOT, ROOT, host)
    return [
        disk(
            host,
            size + MARGIN,
            vhdx,
            [Path(path)],
            f"{fmt_gb(size)} to write under {path}",
        ),
        p14(ctx, path),
    ]


def main(argv: list[str], host: Host | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="make up's preflight (contracts/env-files.md §10)"
    )
    parser.add_argument("--stack", choices=sorted(STACKS))
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--run-file", type=Path)
    parser.add_argument("--ref")
    parser.add_argument("--repo", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--for", dest="mode", choices=("up", "pull"), default="up")
    parser.add_argument("--models", choices=("stack", "all"), default="stack")
    parser.add_argument("--disk-only", action="store_true")
    parser.add_argument("--bytes", type=int)
    parser.add_argument("--path")
    parser.add_argument("--vhdx-mount", default="/mnt/c")
    args = parser.parse_args(argv)
    host = host or Host()
    if args.disk_only:
        if args.bytes is None or not args.path:
            parser.error("--disk-only needs --bytes and --path")
        results = disk_only(host, args.bytes, args.path, args.vhdx_mount)
    else:
        if not args.stack or not args.env_file:
            parser.error("--stack and --env-file are required")
        stack = STACKS[args.stack]
        run_file = args.run_file
        if run_file is None and stack.host:
            run_file = host.home() / ".local/state/h4reet" / stack.name / "run.env"
        ctx = Context(
            stack,
            args.env_file,
            args.root.resolve(),
            (args.repo or args.root).resolve(),
            host,
            args.mode,
            args.models,
            run_file,
            args.ref,
        )
        results = run_checks(ctx)
    for result in results:
        print(result.line())
    failed = [r.check for r in results if r.status == "FAIL"]
    if failed:
        print(f"preflight: refused ({', '.join(failed)})")
        return 1
    warned = [r.check for r in results if r.status == "WARN"]
    print(
        f"preflight: passed{' with warnings (' + ', '.join(warned) + ')' if warned else ''}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
