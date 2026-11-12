#!/usr/bin/env python3
"""A cloud host's env file and key files, at boot, from Parameter Store to tmpfs (spec 001 contracts/env-cloud.md §1;
contracts/tunnel.md §5; research.md R-26, R-28; tasks.md T049), as root, through the host's egress proxy.

    python3 -I -B write_env.py --host tunnel-end --template FILE --out /run/h4reet/tunnel-end.env
        --keys-dir /run/h4reet/tunnel-end/keys

The template's placeholders are its own header's (deploy/hosts/<host>/<host>.env.example). Every file is 0600 in a
0700 folder, replaced whole; a missing parameter or a value outside the grammar refuses the whole write, naming the
parameter or the key, never a value (deploy/scripts/test_write_env.py's docstring). Exit 0 written, 1 refused, 2
couldn't run. The standard library alone, in Python 3.9's syntax: it travels in the tunnel end's user data.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from collections.abc import Callable
from pathlib import Path

PROG = "write_env"
TUNNEL_UID = 10001
KEY_FILES = {
    "tunnel-end": {
        "ssh_host_ed25519_key": "/h4reet/tunnel-end/HOST_KEY",
        "authorized_keys": "/h4reet/tunnel-end/AUTHORIZED_KEY",
    },
}
PARAMETER = "__PARAMETER__"
PARAMETER_AT = re.compile(r"__PARAMETER:(/h4reet/[A-Za-z0-9_./-]+)__")
REGISTRY = "__ACCOUNT_REGISTRY__"
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*")
ACCOUNT_RE = re.compile(r"[0-9]{12}")
UNSAFE = re.compile(r"[\s$\"'`\\#]")
IMDS = "http://169.254.169.254"

Fetch = Callable[[list[str]], dict[str, str]]


class Refused(Exception):
    pass


def parse_env(text: str) -> tuple[dict[str, str], list[str]]:
    """KEY=VALUE lines, as spec 000's preflight reads them: no quotes, spaces, $, backslashes, or # in a value."""
    values: dict[str, str] = {}
    errors: list[str] = []
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip("\r")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not KEY_RE.fullmatch(key):
            errors.append(f"line {number}: not KEY=VALUE")
        elif key in values:
            errors.append(f"line {number}: {key} appears twice")
        elif UNSAFE.search(value):
            errors.append(f"line {number}: {key}: a character outside the grammar")
        else:
            values[key] = value
    return values, errors


def wanted(host: str, template: dict[str, str]) -> dict[str, str]:
    """Each key whose value comes from Parameter Store, and the parameter it comes from."""
    out = {}
    for key, value in template.items():
        if value == PARAMETER:
            out[key] = f"/h4reet/{host}/{key}"
        else:
            m = PARAMETER_AT.fullmatch(value)
            if m:
                out[key] = m.group(1)
    return out


def write_private(
    path: Path, text: str, uid: int | None, chown: Callable[[Path, int], None]
) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    tmp = path.with_name(f".{path.name}.tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.chmod(tmp, 0o600)
        if uid is not None:
            chown(tmp, uid)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()
    if uid is not None:
        chown(path, uid)


def render(
    host: str, template_text: str, fetch: Fetch, account: Callable[[], str]
) -> tuple[str, dict[str, str]]:
    """The env file's text and the key files' texts, or Refused naming what's missing or wrong."""
    template, errors = parse_env(template_text)
    if errors:
        raise Refused(f"the template isn't in the grammar: {'; '.join(errors)}")
    from_store = wanted(host, template)
    files = KEY_FILES.get(host, {})
    names = sorted(set(from_store.values()) | set(files.values()))
    held = fetch(names) if names else {}
    missing = [n for n in names if n not in held]
    if missing:
        raise Refused(f"missing in Parameter Store: {', '.join(missing)}")
    values: dict[str, str] = {}
    bad: list[str] = []
    for key, value in template.items():
        if key in from_store:
            value = held[from_store[key]]
        elif value == REGISTRY:
            number = account()
            if not ACCOUNT_RE.fullmatch(number or ""):
                bad.append(key)
                continue
            value = f"{number}.dkr.ecr.us-east-1.amazonaws.com"
        if value == "" or UNSAFE.search(value):
            bad.append(key)
        values[key] = value
    if bad:
        raise Refused(f"outside the env file's grammar, or empty: {', '.join(bad)}")
    lines = [
        f"# Written by write_env.py from {host}'s template; on tmpfs, never on disk."
    ]
    lines += [f"{k}={v}" for k, v in values.items()]
    return "\n".join(lines) + "\n", {name: held[param] for name, param in files.items()}


def aws_fetch(names: list[str]) -> dict[str, str]:
    """ssm:GetParameters with decryption, ten names a call; the values stay in memory."""
    out: dict[str, str] = {}
    for i in range(0, len(names), 10):
        done = subprocess.run(
            [
                "aws",
                "ssm",
                "get-parameters",
                "--with-decryption",
                "--region",
                "us-east-1",
                "--output",
                "json",
                "--no-cli-pager",
                "--names",
                *names[i : i + 10],
            ],
            capture_output=True,
            text=True,
            check=False,
            stdin=subprocess.DEVNULL,
            timeout=60,
        )
        if done.returncode != 0:
            raise OSError(f"aws ssm get-parameters exited {done.returncode}")
        for p in json.loads(done.stdout or "{}").get("Parameters") or []:
            out[str(p["Name"])] = str(p["Value"])
    return out


def imds_account() -> str:
    """The account from the instance's identity document, with an IMDSv2 token."""
    token_request = urllib.request.Request(
        f"{IMDS}/latest/api/token",
        method="PUT",
        headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(token_request, timeout=5) as response:
        token = response.read().decode()
    document = urllib.request.Request(
        f"{IMDS}/latest/dynamic/instance-identity/document",
        headers={"X-aws-ec2-metadata-token": token},
    )
    with opener.open(document, timeout=5) as response:
        return str(json.loads(response.read().decode()).get("accountId", ""))


def os_chown(path: Path, uid: int) -> None:
    os.chown(path, uid, uid)


def main(
    argv: list[str],
    fetch: Fetch | None = None,
    account: Callable[[], str] | None = None,
    chown: Callable[[Path, int], None] | None = None,
) -> int:
    parser = argparse.ArgumentParser(
        prog="write_env.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--host", required=True, choices=sorted(KEY_FILES))
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--keys-dir", required=True, type=Path)
    args = parser.parse_args(argv)
    fetch = fetch or aws_fetch
    account = account or imds_account
    chown = chown or os_chown
    try:
        env_text, key_files = render(
            args.host, args.template.read_text(encoding="utf-8"), fetch, account
        )
    except Refused as refused:
        print(f"{PROG}: refused, nothing written: {refused}", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError) as error:
        print(f"{PROG}: can't run: {type(error).__name__}", file=sys.stderr)
        return 2
    for name, text in key_files.items():
        write_private(args.keys_dir / name, text, TUNNEL_UID, chown)
    if key_files:
        chown(args.keys_dir, TUNNEL_UID)
    write_private(args.out, env_text, None, chown)
    print(f"{PROG}: {args.out} and {len(key_files)} key files written")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
