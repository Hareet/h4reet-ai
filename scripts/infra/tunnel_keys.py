#!/usr/bin/env python3
"""The tunnel's keys and their revocation: the Author's tunnel-keys and tunnel-revoke targets (spec 001 FR-055;
contracts/tunnel.md §5; research.md R-11, R-26; tasks.md T052). His terminal alone, with his SSO session: the sandbox,
and the bash gate (P-1), refuse both to agent sessions.

    python3 -I -B scripts/infra/tunnel_keys.py keys [--rotate] [--profile NAME]
    python3 -I -B scripts/infra/tunnel_keys.py revoke [--restore] [--profile NAME]

keys makes, with ssh-keygen and the secrets module:
  - the client's key pair, kept in ~/.config/h4reet-ai/tunnel/client/ (0600 in 0700), which agents can't read;
  - the tunnel end's host key pair, whose private half goes to Parameter Store and whose public half is pinned in
    client/known_hosts as h4-tunnel-end; no copy of the private half stays on the laptop;
  - the relay's two host tokens, the sink's token, and the telemetry block's token.
It writes /h4reet/tunnel-end/HOST_KEY, AUTHORIZED_KEY (the client's public key), RELAY_TOKEN_LAPTOP, RELAY_TOKEN_EC2,
SNAPSHOT_SINK_TOKEN, and TELEMETRY_BLOCK_TOKEN, and EC2's copies, /h4reet/ec2/RELAY_TOKEN_SELF and SNAPSHOT_SINK_TOKEN,
each from a 0600 file (file://), never on a command line; then fills the laptop prod env file's four tunnel keys,
TUNNEL_END_ADDRESS from /h4reet/prod/tunnel-end-address among them, and nothing else in it. Keys that exist stay unless
--rotate (ROTATE=1). Everything is made in a staging folder first, and moves into place only once every parameter is
written, so a failed write changes nothing on the laptop.

revoke empties the authorized key (a line no key matches) and restarts the tunnel end's sshd with its keys read again,
in one Systems Manager command: one action (FR-055). --restore (RESTORE=1) puts the client's public key back the same
way. It prints names and the command's ID, never a value. Exit codes: 0 done; 1 refused; 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROG = "tunnel-keys"
PROFILE = re.compile(r"[A-Za-z0-9._-]+")
ENV_KEYS = (
    "TUNNEL_END_ADDRESS",
    "H4_TUNNEL_DIR",
    "RELAY_TOKEN_SELF",
    "TELEMETRY_BLOCK_TOKEN",
    # Group 10: the public view's sink's token, for the laptop's publisher.
    "SNAPSHOT_SINK_TOKEN",
)
ADDRESS_PARAMETER = "/h4reet/prod/tunnel-end-address"
TOKENS = (
    "RELAY_TOKEN_LAPTOP",
    "RELAY_TOKEN_EC2",
    "SNAPSHOT_SINK_TOKEN",
    "TELEMETRY_BLOCK_TOKEN",
)
REVOKED = "revoked: no key is authorized (make tunnel-revoke RESTORE=1 puts the laptop's back)"
RESTART = "systemctl start h4-tunnel-restart.service"
TARGETS = "Key=tag:Name,Values=h4-prod-tunnel-end"


class Refused(Exception):
    pass


def config() -> Path:
    return Path.home() / ".config" / "h4reet-ai"


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
        raise RuntimeError(f"aws {' '.join(args[:2])} exited {done.returncode}")
    return json.loads(done.stdout or "{}")


def put(profile: str, name: str, value: str, kind: str, folder: Path) -> None:
    """One parameter, its value from a 0600 file that's gone afterwards."""
    fd, path = tempfile.mkstemp(dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value)
        os.chmod(path, 0o600)
        aws(
            profile,
            "ssm",
            "put-parameter",
            "--name",
            name,
            "--type",
            kind,
            "--overwrite",
            "--value",
            f"file://{path}",
        )
    finally:
        os.unlink(path)


def keygen(path: Path, comment: str) -> None:
    done = subprocess.run(
        ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", comment, "-f", str(path)],
        capture_output=True,
        check=False,
        stdin=subprocess.DEVNULL,
    )
    if done.returncode != 0:
        raise RuntimeError("ssh-keygen failed")


def env_lines(path: Path) -> list[str]:
    if not path.is_file():
        raise Refused(f"{path} is missing: make init-env ENV=prod first")
    lines = path.read_text(encoding="utf-8").splitlines()
    present = {
        line.split("=", 1)[0]
        for line in lines
        if "=" in line and not line.startswith("#")
    }
    missing = [k for k in ENV_KEYS if k not in present]
    if missing:
        raise Refused(
            f"the prod env file lacks {', '.join(missing)}: make init-env ENV=prod SYNC=1 adds them first"
        )
    return lines


def write_env(path: Path, lines: list[str], values: dict[str, str]) -> None:
    out = []
    for line in lines:
        key = line.split("=", 1)[0]
        out.append(
            f"{key}={values[key]}"
            if key in values and not line.startswith("#")
            else line
        )
    tmp = path.with_name(f".{path.name}.tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out) + "\n")
    os.replace(tmp, path)
    os.chmod(path, 0o600)


def keys(profile: str, rotate: bool) -> int:
    base = config()
    tunnel = base / "tunnel"
    client = tunnel / "client"
    env_file = base / "env" / "prod.env"
    lines = env_lines(env_file)
    if (client / "id_ed25519").exists() and not rotate:
        raise Refused(
            "the tunnel's keys exist: --rotate (ROTATE=1) makes new ones and revokes the old"
        )
    tunnel.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(tunnel, 0o700)
    stage = Path(tempfile.mkdtemp(prefix=".stage-", dir=tunnel))
    try:
        os.chmod(stage, 0o700)
        address = str(
            aws(profile, "ssm", "get-parameter", "--name", ADDRESS_PARAMETER)
            .get("Parameter", {})
            .get("Value", "")
        )
        try:
            if ipaddress.ip_address(address).version != 4:
                raise ValueError(address)
        except ValueError:
            raise Refused(
                f"{ADDRESS_PARAMETER} isn't an IPv4 address: is prod applied?"
            ) from None
        new_client = stage / "client"
        new_client.mkdir(mode=0o700)
        keygen(new_client / "id_ed25519", "h4reet-laptop")
        host = stage / "host"
        host.mkdir(mode=0o700)
        keygen(host / "ssh_host_ed25519_key", "h4-tunnel-end")
        host_public = (
            (host / "ssh_host_ed25519_key.pub").read_text(encoding="utf-8").split()
        )
        (new_client / "known_hosts").write_text(
            f"h4-tunnel-end {host_public[0]} {host_public[1]}\n", encoding="utf-8"
        )
        tokens = {name: secrets.token_urlsafe(32) for name in TOKENS}
        writes = [
            (
                "/h4reet/tunnel-end/HOST_KEY",
                (host / "ssh_host_ed25519_key").read_text(encoding="utf-8"),
                "SecureString",
            ),
            (
                "/h4reet/tunnel-end/AUTHORIZED_KEY",
                (new_client / "id_ed25519.pub").read_text(encoding="utf-8"),
                "String",
            ),
            *(
                (f"/h4reet/tunnel-end/{name}", value, "SecureString")
                for name, value in tokens.items()
            ),
            ("/h4reet/ec2/RELAY_TOKEN_SELF", tokens["RELAY_TOKEN_EC2"], "SecureString"),
            (
                "/h4reet/ec2/SNAPSHOT_SINK_TOKEN",
                tokens["SNAPSHOT_SINK_TOKEN"],
                "SecureString",
            ),
        ]
        for name, value, kind in writes:
            put(profile, name, value, kind, stage)
            print(f"{PROG}: wrote {name} ({kind})")
        shutil.rmtree(host)
        if client.exists():
            shutil.rmtree(client)
        os.replace(new_client, client)
        os.chmod(client, 0o700)
        write_env(
            env_file,
            lines,
            {
                "TUNNEL_END_ADDRESS": address,
                "H4_TUNNEL_DIR": str(client),
                "RELAY_TOKEN_SELF": tokens["RELAY_TOKEN_LAPTOP"],
                "TELEMETRY_BLOCK_TOKEN": tokens["TELEMETRY_BLOCK_TOKEN"],
                "SNAPSHOT_SINK_TOKEN": tokens["SNAPSHOT_SINK_TOKEN"],
            },
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(
        f"{PROG}: the client's key and the pinned host key in {client}; the prod env file's tunnel keys filled"
    )
    print(
        f"{PROG}: next, the tunnel end reads them at its next boot, or now: make tunnel-revoke RESTORE=1"
    )
    return 0


def revoke(profile: str, restore: bool) -> int:
    tunnel = config() / "tunnel"
    if restore:
        public = tunnel / "client" / "id_ed25519.pub"
        if not public.is_file():
            raise Refused("no client key to restore: make tunnel-keys makes one")
        value = public.read_text(encoding="utf-8")
    else:
        value = REVOKED
    tunnel.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".stage-", dir=tunnel))
    try:
        put(profile, "/h4reet/tunnel-end/AUTHORIZED_KEY", value, "String", stage)
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    sent = aws(
        profile,
        "ssm",
        "send-command",
        "--document-name",
        "AWS-RunShellScript",
        "--targets",
        TARGETS,
        "--comment",
        "h4reet: the tunnel's key, read again (spec 001 FR-055)",
        "--parameters",
        json.dumps({"commands": [RESTART]}),
    )
    command = str(sent.get("Command", {}).get("CommandId", "?"))
    what = "restored" if restore else "revoked"
    print(
        f"{PROG}: the laptop's key {what}; the tunnel end restarts its sshd (command {command})"
    )
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="tunnel_keys.py", description=__doc__.split("\n\n", 1)[0]
    )
    sub = parser.add_subparsers(dest="action", required=True)
    make = sub.add_parser("keys")
    make.add_argument("--rotate", action="store_true")
    make.add_argument("--profile")
    take = sub.add_parser("revoke")
    take.add_argument("--restore", action="store_true")
    take.add_argument("--profile")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            f"{PROG}: this is the Author's: it writes his tunnel's keys with his SSO session",
            file=sys.stderr,
        )
        return 2
    profile = args.profile or os.environ.get("AWS_PROFILE", "")
    if not PROFILE.fullmatch(profile):
        print(f"{PROG}: name your SSO profile: PROFILE=h4reet-…", file=sys.stderr)
        return 2
    try:
        return (
            keys(profile, args.rotate)
            if args.action == "keys"
            else revoke(profile, args.restore)
        )
    except Refused as refused:
        print(f"{PROG}: {refused}", file=sys.stderr)
        return 1
    except (OSError, RuntimeError, ValueError) as error:
        print(f"{PROG}: can't run: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
