#!/usr/bin/env python3
"""make init-env, the Author's terminal (spec 000 FR-007, FR-032; contracts/env-files.md §9; research.md R-31).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/init_env.py --stack prod|dev [--sync]

Writes ~/.config/h4reet-ai/env/<stack>.env from deploy/env.example/<stack>.env.example: mode 0600, in a 0700
directory, outside the repository. It copies the template line by line, comments included, replacing
__GENERATE__ with a value in the key's shape (§9.2), __HOME__ with your home, and __REPO__ with this checkout's
path, and leaves each __ASK__ for you to fill in an editor. It never overwrites a file.

With --sync (make init-env SYNC=1) it brings an existing file up to date with a template that gained keys: it
appends each missing key under a dated comment, never changes, removes, or reorders a line, and names the keys the
template no longer has, for you to remove by hand.

For prod it also creates ~/.config/h4reet-ai/aws-home/.aws (0700, empty), so the gateway's bind source exists
before Bedrock is set up and Docker never creates it as root.

It prints names, never values. Exit codes: 0 done; 2 usage (dev-cpu, an unknown stack, inside the sandbox);
5 a file problem (the file exists, it's missing for --sync, or a mode or owner is wrong).
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import secrets
import stat
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STACKS = ("prod", "dev")
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*")
# contracts/env-files.md §9.2. A __GENERATE__ key without a shape here is refused, so a new secret declares one.
HEX64 = {
    "GATEWAY_DB_PASSWORD",
    "GATEWAY_GRAFANA_RO_PASSWORD",
    "LANGFUSE_DB_PASSWORD",
    "LANGFUSE_SALT",
    "LANGFUSE_NEXTAUTH_SECRET",
    "LANGFUSE_INIT_USER_PASSWORD",
    "CLICKHOUSE_PASSWORD",
    "VALKEY_PASSWORD",
    "SEAWEEDFS_S3_SECRET_KEY",
    "GF_SECURITY_ADMIN_PASSWORD",
    "LANGFUSE_ENCRYPTION_KEY",
}
# dev's alert channels stay empty until the recorded run (contracts/env-files.md §4, §7.2).
OPTIONAL_CHANNELS = (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "ALERT_EMAIL_FROM",
    "ALERT_EMAIL_TO",
)


class FileProblem(Exception):
    """Exit 5."""


def generate(key: str) -> str:
    if key in HEX64:
        return secrets.token_hex(32)
    if key == "LANGFUSE_PUBLIC_KEY":
        return "pk-lf-" + str(uuid.UUID(bytes=secrets.token_bytes(16), version=4))
    if key == "LANGFUSE_SECRET_KEY":
        return "sk-lf-" + str(uuid.UUID(bytes=secrets.token_bytes(16), version=4))
    if key == "SEAWEEDFS_S3_ACCESS_KEY":
        return secrets.token_hex(10).upper()
    raise FileProblem(
        f"the template asks to generate {key}, which has no shape in init_env.py (contracts/env-files.md §9.2)"
    )


def template_lines(stack: str) -> list[tuple[str, str | None, str | None]]:
    """(line, key, value) for each template line; key and value are None for comments and blank lines."""
    path = ROOT / "deploy" / "env.example" / f"{stack}.env.example"
    out: list[tuple[str, str | None, str | None]] = []
    seen: set[str] = set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            out.append((line, None, None))
            continue
        key, sep, value = line.partition("=")
        if not sep or not KEY_RE.fullmatch(key) or key in seen:
            raise FileProblem(
                f"{path.relative_to(ROOT)} line {number}: not one KEY=VALUE per key"
            )
        seen.add(key)
        out.append((line, key, value))
    return out


def fill(key: str, value: str, home: Path) -> tuple[str, bool]:
    """The value to write, and whether it was generated."""
    if value == "__GENERATE__":
        return generate(key), True
    return value.replace("__HOME__", str(home)).replace("__REPO__", str(ROOT)), False


def check_private_dir(path: Path) -> None:
    """Create path as 0700 if it's missing; refuse one with another owner or a looser mode."""
    try:
        path.mkdir(mode=0o700)
        os.chmod(path, 0o700)
        return
    except FileExistsError:
        pass
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode):
        raise FileProblem(f"{path} isn't a directory")
    if info.st_uid != os.getuid():
        raise FileProblem(f"{path} belongs to another user")
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise FileProblem(
            f"{path} is mode {stat.S_IMODE(info.st_mode):04o}; it must be 0700 (chmod 700 it yourself)"
        )


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path: Path, text: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    fsync_dir(path.parent)


def existing_keys(path: Path) -> list[str]:
    keys: list[str] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, _ = line.partition("=")
        if not sep or not KEY_RE.fullmatch(key):
            raise FileProblem(
                f"{path} line {number} isn't KEY=VALUE; fix it by hand, then run SYNC=1 again"
            )
        keys.append(key)
    return keys


def existing_values(path: Path) -> dict[str, str]:
    """Each key's value as the file holds it, outer single quotes removed. Only the report reads it, for names."""
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, _, value = line.partition("=")
        if key in values:
            continue  # the first one counts, as in preflight, which refuses the repeat (P2)
        if len(value) >= 2 and value[0] == value[-1] == "'":
            value = value[1:-1]
        values[key] = value
    return values


def report(
    stack: str, path: Path, generated: list[str], values: dict[str, str]
) -> None:
    print(f"{path}: mode 0600")
    if generated:
        print(f"generated: {', '.join(generated)}")
    ask = [k for k, v in values.items() if v == "__ASK__"]
    if ask:
        print(f"fill these yourself, in an editor: {', '.join(ask)}")
    if stack == "dev":
        empty = [k for k in OPTIONAL_CHANNELS if values.get(k) == ""]
        if empty:
            print(
                f"fill these for the recorded run (make breach-test ENV=dev DELIVERY=real): {', '.join(empty)}"
            )
    print(
        f"next: make operator-token ENV={stack}, put its hash in OPERATOR_TOKEN_SHA256, fill the keys above, "
        f"then make up ENV={stack}"
    )


def init(stack: str, sync: bool, home: Path) -> int:
    lines = template_lines(stack)
    base = home / ".config" / "h4reet-ai"
    base.parent.mkdir(parents=True, exist_ok=True)
    check_private_dir(
        base
    )  # it holds the env files and the tokens, like env/ itself (contracts/env-files.md §9.1)
    env_dir = base / "env"
    check_private_dir(env_dir)
    if stack == "prod":
        check_private_dir(base / "aws-home")
        check_private_dir(base / "aws-home" / ".aws")
    path = env_dir / f"{stack}.env"

    if not sync:
        if path.exists() or path.is_symlink():
            raise FileProblem(f"{path} exists; to start again, move it aside yourself")
        out, generated, values = [], [], {}
        for line, key, value in lines:
            if key is None or value is None:
                out.append(line)
                continue
            filled, made = fill(key, value, home)
            out.append(f"{key}={filled}")
            values[key] = filled if not made else "(generated)"
            if made:
                generated.append(key)
        write_new(path, "\n".join(out) + "\n")
        report(stack, path, generated, values)
        return 0

    if not path.is_file() or path.is_symlink():
        raise FileProblem(
            f"{path} doesn't exist; run make init-env ENV={stack} first, without SYNC"
        )
    info = path.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise FileProblem(f"{path} must be yours, with mode 0600")
    have = existing_keys(path)
    twice = sorted({key for key in have if have.count(key) > 1})
    template_keys = [key for _, key, _ in lines if key]
    missing = [k for k in template_keys if k not in have]
    extra = [k for k in have if k not in template_keys]
    generated, values = [], {}
    if missing:
        today = datetime.datetime.now(datetime.UTC).date().isoformat()
        added = [f"# added by make init-env SYNC=1 on {today}"]
        for _, key, value in lines:
            if key in missing and value is not None:
                filled, made = fill(key, value, home)
                added.append(f"{key}={filled}")
                values[key] = filled if not made else "(generated)"
                if made:
                    generated.append(key)
        text = path.read_text(encoding="utf-8")
        if text and not text.endswith("\n"):
            text += "\n"
        tmp = path.with_name(f".{path.name}.sync")
        if tmp.exists() or tmp.is_symlink():
            tmp.unlink()
        write_new(tmp, text + "\n".join(added) + "\n")
        os.replace(tmp, path)
        fsync_dir(path.parent)
        print(f"added: {', '.join(missing)}")
    else:
        print("the file already has every template key")
    if extra:
        print(
            f"the template no longer has: {', '.join(extra)}; remove these by hand, because preflight refuses them"
        )
    if twice:
        print(
            f"these keys appear more than once: {', '.join(twice)}; keep one of each, because preflight refuses the file"
        )
    # Every __ASK__ the file still holds, not only the appended ones (contracts/env-files.md §9.1, step 5).
    report(stack, path, generated, {**existing_values(path), **values})
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Write a host stack's env file from its template."
    )
    parser.add_argument("--stack", required=True)
    parser.add_argument("--sync", action="store_true")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            "init-env runs in the Author's terminal: agents never see a real env file (FR-007)",
            file=sys.stderr,
        )
        return 2
    if args.stack == "dev-cpu":
        print(
            "init-env: dev-cpu's env file is the committed deploy/env.agents/dev-cpu.vars",
            file=sys.stderr,
        )
        return 2
    if args.stack not in STACKS:
        print(
            f"init-env: the stack is prod or dev, not {args.stack!r}", file=sys.stderr
        )
        return 2
    try:
        return init(args.stack, args.sync, Path.home())
    except (FileProblem, OSError) as error:
        print(f"init-env: {error}", file=sys.stderr)
        return 5


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
