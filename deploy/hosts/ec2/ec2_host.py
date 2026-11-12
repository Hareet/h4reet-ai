#!/usr/bin/env python3
"""EC2's host step, from the release's tree (spec 001 research.md R-10, R-15; plan.md §16, "Group 7, as built"; the
deployer's HOST_STEPS): the gateway's proxy, and the gateway's Bedrock credentials. The gateway calls Bedrock as
h4-prod-gateway, which only EC2's instance role may assume; IMDSv2's one hop keeps every container from the instance
role itself.

    python3 -I -B ec2_host.py prepare --tree TREE    (the deployer, before compose pulls or starts anything)
    python3 -I -B ec2_host.py credentials             (h4-gateway-credentials.timer, every 15 minutes)

prepare makes the gateway's journal folder, ${H4_STATE_DIR}/gateway on the data volume, which compose's bind never
makes (group 7's review B, B1); installs, from the tree, the gateway's proxy (deploy/scripts/sni_proxy.py, beside the
egress proxy it reads), its allowlist, and its unit, and the credential timer's units and this script; writes the
gateway's AWS profile; runs credentials once; and enables the timer and restarts the proxy. A failure is a failed
start, but a failed assume: Bedrock is EC2's second route, so it answers degraded until the timer's next run, and the
stack starts on the Anthropic API (review B, I4). credentials assumes h4-prod-gateway with the instance role for an
hour, and writes the answer as a credential_process document the gateway's profile reads with cat, so the SDK
refreshes on its own before each document's Expiration. Each file is replaced whole, on tmpfs, and is the gateway's
user's to read alone. No key is printed. The standard library alone, in Python 3.9's syntax.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROG = "ec2-host"
ENV_FILE = Path("/run/h4reet/ec2.env")
AWS_DIR = Path("/run/h4reet/ec2/aws")
UNITS = Path("/etc/systemd/system")
INSTALLED = Path("/opt/h4reet/release/ec2_host.py")
GATEWAY_UID = 1000  # the gateway image's user, node
PROFILE = "h4reet-bedrock"
CONFIG = f"""[profile {PROFILE}]
region = us-east-1
credential_process = /bin/cat /home/node/.aws/credentials.json
"""


def read_env(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            out[key] = value
    return out


def write(path: Path, text: str, uid: int, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.chmod(str(tmp), mode)
    os.chown(str(tmp), uid, uid)
    os.replace(str(tmp), str(path))


def assumed(answer: str) -> str:
    """aws sts assume-role's JSON, as the credential_process document; ValueError if it isn't one."""
    c = json.loads(answer)["Credentials"]
    return json.dumps(
        {
            "Version": 1,
            "AccessKeyId": c["AccessKeyId"],
            "SecretAccessKey": c["SecretAccessKey"],
            "SessionToken": c["SessionToken"],
            "Expiration": c["Expiration"],
        }
    )


def credentials(env_file: Path, aws_dir: Path, run=subprocess.run) -> int:
    account = read_env(env_file).get("H4_REGISTRY", "").split(".", 1)[0]
    if not (len(account) == 12 and account.isdigit()):
        print(f"{PROG}: the env file names no account", file=sys.stderr)
        return 1
    done = run(
        [
            "aws",
            "sts",
            "assume-role",
            "--region",
            "us-east-1",
            "--output",
            "json",
            "--no-cli-pager",
            "--role-arn",
            f"arn:aws:iam::{account}:role/h4-prod-gateway",
            "--role-session-name",
            "ec2-gateway",
            "--duration-seconds",
            "3600",
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    if done.returncode != 0:
        print(f"{PROG}: the assume of h4-prod-gateway failed", file=sys.stderr)
        return 1
    try:
        document = assumed(done.stdout)
    except (ValueError, KeyError, TypeError):
        print(f"{PROG}: the assume's answer isn't credentials", file=sys.stderr)
        return 1
    write(aws_dir / "config", CONFIG, GATEWAY_UID, 0o444)
    write(aws_dir / "credentials.json", document + "\n", GATEWAY_UID, 0o400)
    print(f"{PROG}: the gateway's credentials are fresh")
    return 0


def prepare(
    tree: Path, env_file: Path, aws_dir: Path, units: Path, run=subprocess.run
) -> int:
    release = tree / "deploy" / "hosts" / "ec2" / "release"
    state = read_env(env_file).get("H4_STATE_DIR", "")
    if not state.startswith("/"):
        print(f"{PROG}: the env file names no H4_STATE_DIR", file=sys.stderr)
        return 1
    journal = Path(state) / "gateway"
    journal.mkdir(parents=True, exist_ok=True)
    os.chmod(str(journal), 0o700)
    os.chown(str(journal), GATEWAY_UID, GATEWAY_UID)
    INSTALLED.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(str(Path(__file__).resolve()), str(INSTALLED))
    os.chmod(str(INSTALLED), 0o755)
    scripts = tree / "deploy" / "scripts"
    for source, target in (
        (scripts / "sni_proxy.py", INSTALLED.parent / "sni_proxy.py"),
        (scripts / "egress_proxy.py", INSTALLED.parent / "egress_proxy.py"),
        (release / "gateway-allowlist.txt", INSTALLED.parent / "gateway-allowlist.txt"),
    ):
        shutil.copyfile(str(source), str(target))
    for unit in sorted(release.glob("h4-*")):
        shutil.copyfile(str(unit), str(units / unit.name))
    write(aws_dir / "config", CONFIG, GATEWAY_UID, 0o444)
    if credentials(env_file, aws_dir, run) != 0:
        print(
            f"{PROG}: Bedrock answers degraded until the credential timer's next run",
            file=sys.stderr,
        )
    for argv in (
        ["systemctl", "daemon-reload"],
        ["systemctl", "enable", "--now", "h4-gateway-credentials.timer"],
        ["systemctl", "enable", "h4-sni-proxy.service"],
        ["systemctl", "restart", "h4-sni-proxy.service"],
    ):
        if run(argv, check=False, timeout=60).returncode != 0:
            print(f"{PROG}: {' '.join(argv)} failed", file=sys.stderr)
            return 1
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="ec2_host.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("action", choices=("prepare", "credentials"))
    parser.add_argument("--tree", type=Path)
    args = parser.parse_args(argv)
    if args.action == "credentials":
        return credentials(ENV_FILE, AWS_DIR)
    if args.tree is None:
        parser.error("prepare needs --tree")
    return prepare(args.tree, ENV_FILE, AWS_DIR, UNITS)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
