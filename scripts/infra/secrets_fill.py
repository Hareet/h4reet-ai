#!/usr/bin/env python3
"""make secrets-fill [PROFILE=…]: each Parameter Store name infra/parameters.txt expects and lacks, written once
(spec 001 fixes/f8.md; research.md R-26; contracts/env-cloud.md §1). His terminal alone: the sandbox, and the bash
gate (P-1), refuse it to agent sessions.

    python3 -I -B -X pycache_prefix=/dev/null scripts/infra/secrets_fill.py [--profile NAME]

It asks Parameter Store which names exist under /h4reet/ (describe-parameters: names and types, never a value), and
for each name the list expects and the store lacks, takes its value:
  1. copied from the laptop's prod env file, ~/.config/h4reet-ai/env/prod.env, where the laptop has the value, under
     the key the laptop's file uses (LAPTOP_KEY; the name's last part otherwise), or from the laptop's file the list
     names (LAPTOP_FILE: the audit's allowlist, ~/.config/h4reet-ai/infra/iam-allow.txt);
  2. generated in deploy/scripts/init_env.py's shapes otherwise (SHAPE_AS names the key whose shape a name takes);
  3. asked at a hidden prompt when neither, on a terminal only: without one it writes nothing and says which.
The names another writer owns (OTHERS: make tunnel-keys's pairs, make shared-state-tls's, Terraform's) it leaves to
it. It writes each with put-parameter, never --overwrite, so a name written meanwhile is refused by the store, not
replaced; each value from a 0600 file in a 0700 folder under ~/.config/h4reet-ai/, never on a command line, and the
folder is gone at the end. It prints names, never a value. Exit codes: 0 nothing it fills is left missing; 1 refused,
or a name not written; 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import getpass
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROG = "secrets-fill"
REPO = Path(__file__).resolve().parents[2]
LIST = REPO / "infra" / "parameters.txt"
INIT_ENV = REPO / "deploy" / "scripts" / "init_env.py"
TYPES = ("String", "StringList", "SecureString")
NAME = re.compile(r"/h4reet/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*")
PROFILE = re.compile(r"[A-Za-z0-9._-]+")
NO_VALUE = ("", "__ASK__", "__GENERATE__")

TUNNEL = "make tunnel-keys writes it, with its pair (contracts/tunnel.md §5)"
TLS = "make shared-state-tls writes it (contracts/shared-state.md §3)"
# The names another writer owns. The tunnel's come in pairs, the tunnel end's and EC2's or the laptop's, so a value
# made here alone would break the pair; and EC2's RELAY_TOKEN_SELF is the tunnel end's RELAY_TOKEN_EC2, never the
# laptop's RELAY_TOKEN_SELF, which is RELAY_TOKEN_LAPTOP (tunnel_keys.py).
OTHERS = {
    "/h4reet/tunnel-end/HOST_KEY": TUNNEL,
    "/h4reet/tunnel-end/AUTHORIZED_KEY": TUNNEL,
    "/h4reet/tunnel-end/RELAY_TOKEN_LAPTOP": TUNNEL,
    "/h4reet/tunnel-end/RELAY_TOKEN_EC2": TUNNEL,
    "/h4reet/tunnel-end/SNAPSHOT_SINK_TOKEN": TUNNEL,
    "/h4reet/tunnel-end/TELEMETRY_BLOCK_TOKEN": TUNNEL,
    "/h4reet/ec2/RELAY_TOKEN_SELF": TUNNEL,
    "/h4reet/ec2/SNAPSHOT_SINK_TOKEN": TUNNEL,
    "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY": TLS,
    "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT": TLS,
    "/h4reet/hosts/SHARED_STATE_TLS_CA": TLS,
    "/h4reet/hosts/RELEASE_BUCKET": "the account's apply writes it (Terraform)",
    "/h4reet/prod/tunnel-end-address": "prod's apply writes it (Terraform)",
    "/h4reet/prod/ec2-instance-id": "prod's apply writes it (Terraform)",
}
# The key in the laptop's prod env file where it isn't the name's last part: the shared state's gateway and grafana_ro
# roles, which both hosts sign in as, so the values must match (deploy/hosts/ec2/ec2.env.example).
LAPTOP_KEY = {
    "/h4reet/ec2/DB_GATEWAY_PASSWORD": "GATEWAY_DB_PASSWORD",
    "/h4reet/ec2/DB_GRAFANA_RO_PASSWORD": "GATEWAY_GRAFANA_RO_PASSWORD",
}
# A value the laptop keeps in a file of its own, relative to ~/.config/h4reet-ai/ (infra/parameters.txt's comment).
LAPTOP_FILE = {"/h4reet/audit/IAM_ALLOW": "infra/iam-allow.txt"}
# The init_env.py key whose shape a name takes, where the laptop's file has no key of its own: the relay's roles on the
# shared state, a store password like the gateway's.
SHAPE_AS = {
    "/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD": "GATEWAY_DB_PASSWORD",
    "/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD": "GATEWAY_DB_PASSWORD",
}


class Refused(Exception):
    pass


def config() -> Path:
    return Path.home() / ".config" / "h4reet-ai"


def expected() -> dict[str, str]:
    names = {}
    for number, raw in enumerate(LIST.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 2 or not NAME.fullmatch(parts[0]) or parts[1] not in TYPES:
            raise ValueError(
                f"infra/parameters.txt:{number} isn't '/h4reet/<path> <{'|'.join(TYPES)}>'"
            )
        names[parts[0]] = parts[1]
    return names


def laptop_values() -> dict[str, str]:
    """The laptop prod env file's values, the first of each key, outer single quotes removed (as init_env.py reads)."""
    path = config() / "env" / "prod.env"
    if not path.is_file():
        raise Refused(f"{path} is missing: make init-env ENV=prod first")
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key in values:
            continue
        if len(value) >= 2 and value[0] == value[-1] == "'":
            value = value[1:-1]
        values[key] = value
    return values


def load_init_env():
    spec = importlib.util.spec_from_file_location("h4_init_env", INIT_ENV)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"can't load {INIT_ENV}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def aws(profile: str, *args: str) -> dict:
    done = subprocess.run(
        [
            "aws",
            *args,
            "--profile",
            profile,
            "--region",
            "us-east-1",
            "--output",
            "json",
            "--no-cli-pager",
        ],
        capture_output=True,
        text=True,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(Path.home())},
        check=False,
        stdin=subprocess.DEVNULL,
    )
    if done.returncode != 0:
        # AWS's error code alone, never the rest of its message.
        code = re.search(r"\(([A-Za-z]+)\)", done.stderr or "")
        raise RuntimeError(
            f"aws {' '.join(args[:2])} exited {done.returncode}"
            + (f" ({code.group(1)})" if code else "")
        )
    return json.loads(done.stdout or "{}")


def describe(profile: str) -> set[str]:
    found = aws(
        profile,
        "ssm",
        "describe-parameters",
        "--parameter-filters",
        "Key=Path,Option=Recursive,Values=/h4reet/",
    )
    return {str(p["Name"]) for p in found.get("Parameters") or []}


def source(name: str, laptop: dict[str, str], init_env) -> tuple[str | None, str]:
    """The value for name, and where it came from; None when neither the laptop nor a shape has one."""
    if name in LAPTOP_FILE:
        path = config() / LAPTOP_FILE[name]
        if path.is_file():
            text = path.read_text(encoding="utf-8")
            if text.strip():
                return text, f"copied from the laptop's {LAPTOP_FILE[name]}"
    key = LAPTOP_KEY.get(name, name.rsplit("/", 1)[1])
    value = laptop.get(key, "")
    if value not in NO_VALUE:
        return value, f"copied from prod.env's {key}"
    try:
        return init_env.generate(SHAPE_AS.get(name, key)), "generated"
    except init_env.FileProblem:
        return None, "asked"


def put(profile: str, name: str, value: str, kind: str, folder: Path) -> None:
    """One parameter, never --overwrite, its value from a 0600 file that's gone afterwards."""
    fd, path = tempfile.mkstemp(dir=folder)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value)
        aws(
            profile,
            "ssm",
            "put-parameter",
            "--name",
            name,
            "--type",
            kind,
            "--value",
            f"file://{path}",
        )
    finally:
        os.unlink(path)


def fill(profile: str) -> int:
    want = expected()
    laptop = laptop_values()
    init_env = load_init_env()
    have = describe(profile)
    status: dict[str, str] = {}
    values: dict[str, tuple[str, str]] = {}
    ask: list[str] = []
    for name in want:
        if name in have:
            status[name] = "present"
        elif name in OTHERS:
            status[name] = f"missing; {OTHERS[name]}"
        else:
            value, how = source(name, laptop, init_env)
            if value is None:
                ask.append(name)
            else:
                values[name] = (value, how)
    if ask and not sys.stdin.isatty():
        raise Refused(
            "neither the laptop nor a shape has a value for "
            + ", ".join(ask)
            + ": run it in a terminal, which asks for each at a hidden prompt; nothing written"
        )
    skipped = 0
    for name in ask:
        answer = getpass.getpass(f"{PROG}: the value of {name} (hidden): ")
        if answer:
            values[name] = (answer, "from the prompt")
        else:
            status[name] = "missing; skipped, no answer"
            skipped += 1
    failed = 0
    written = 0
    if values:
        stage = Path(tempfile.mkdtemp(prefix=".secrets-fill-", dir=config()))
        try:
            os.chmod(stage, 0o700)
            for name, (value, how) in values.items():
                try:
                    put(profile, name, value, want[name], stage)
                except (RuntimeError, OSError) as error:
                    status[name] = f"not written: {error}; never overwritten"
                    failed += 1
                else:
                    status[name] = f"wrote ({want[name]}): {how}"
                    written += 1
        finally:
            shutil.rmtree(stage, ignore_errors=True)
    for name in want:
        print(f"{name:60} {status[name]}")
    others = sum(1 for name in want if name not in have and name in OTHERS)
    if not values and not ask:
        print(f"{PROG}: nothing to write")
    print(
        f"{PROG}: {written} written, {failed + skipped} not written, {others} left to their writers"
    )
    if failed or skipped:
        print(
            f"{PROG}: a name not written is still missing: run it again, or write it by hand",
            file=sys.stderr,
        )
        return 1
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="secrets_fill.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--profile")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            f"{PROG}: this is the Author's: it writes his account's parameters with his SSO session",
            file=sys.stderr,
        )
        return 2
    profile = args.profile or os.environ.get("AWS_PROFILE", "")
    if not PROFILE.fullmatch(profile):
        print(f"{PROG}: name your SSO profile: PROFILE=h4reet-…", file=sys.stderr)
        return 2
    try:
        return fill(profile)
    except Refused as refused:
        print(f"{PROG}: {refused}", file=sys.stderr)
        return 1
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        print(f"{PROG}: can't run: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
