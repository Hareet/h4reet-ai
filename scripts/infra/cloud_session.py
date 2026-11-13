#!/usr/bin/env python3
"""A Systems Manager port-forwarding session to a cloud host: the Author's cloud-session target (spec 001 FR-050;
contracts/handover.md §7; research.md R-32; tasks.md T052). His terminal alone, with his SSO session: the sandbox,
and the bash gate (P-1), refuse it to agent sessions. Systems Manager is the one way in: no host takes SSH from him,
and no port is open for it.

    python3 -I -B scripts/infra/cloud_session.py --host ec2|tunnel-end [--profile NAME]

It finds the running instance by its Name tag, h4-prod-ec2 or h4-prod-tunnel-end, and forwards the same port on his
loopback to the host's listener: EC2's gateway admin listener, 18503, or the tunnel end's relay's internal listener,
18505 (contracts/env-cloud.md §2). The session runs in his terminal until he ends it; Systems Manager keeps its history.
Exit codes: 0 the session ended; 1 no running instance; 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PROG = "cloud-session"
PROFILE = re.compile(r"[A-Za-z0-9._-]+")
HOSTS = {
    "ec2": ("h4-prod-ec2", "18503"),
    "tunnel-end": ("h4-prod-tunnel-end", "18505"),
}


def aws(profile: str, *args: str, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["aws", *args, "--profile", profile, "--region", "us-east-1", "--no-cli-pager"],
        capture_output=capture,
        text=True,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(Path.home())},
        check=False,
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="cloud_session.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--host", required=True, choices=sorted(HOSTS))
    parser.add_argument("--profile")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            f"{PROG}: this is the Author's: it opens a session to a cloud host with his SSO session",
            file=sys.stderr,
        )
        return 2
    profile = args.profile or os.environ.get("AWS_PROFILE", "")
    if not PROFILE.fullmatch(profile):
        print(f"{PROG}: name your SSO profile: PROFILE=h4reet-…", file=sys.stderr)
        return 2
    name, port = HOSTS[args.host]
    found = aws(
        profile,
        "ec2",
        "describe-instances",
        "--filters",
        f"Name=tag:Name,Values={name}",
        "Name=instance-state-name,Values=running",
        "--output",
        "json",
    )
    if found.returncode != 0:
        print(
            f"{PROG}: aws ec2 describe-instances exited {found.returncode}",
            file=sys.stderr,
        )
        return 2
    instances = [
        i["InstanceId"]
        for r in json.loads(found.stdout or "{}").get("Reservations") or []
        for i in r.get("Instances") or []
    ]
    if len(instances) != 1:
        print(
            f"{PROG}: {len(instances)} running instances named {name}, not one",
            file=sys.stderr,
        )
        return 1
    print(
        f"{PROG}: 127.0.0.1:{port} forwards to {args.host}'s listener; end the session with Ctrl-C"
    )
    done = aws(
        profile,
        "ssm",
        "start-session",
        "--target",
        instances[0],
        "--document-name",
        "AWS-StartPortForwardingSession",
        "--parameters",
        json.dumps({"portNumber": [port], "localPortNumber": [port]}),
        capture=False,
    )
    return 0 if done.returncode == 0 else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
