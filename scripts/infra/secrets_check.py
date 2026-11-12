#!/usr/bin/env python3
"""make secrets-check [PROFILE=…]: which of the Author's Parameter Store names exist, by name and type (spec 001
research.md R-26; contracts/env-cloud.md §1; tasks.md T024; FR-009). His terminal alone: the sandbox, and the bash
gate (P-1), refuse it to agent sessions.

    python3 -I -B -X pycache_prefix=/dev/null scripts/infra/secrets_check.py [--profile NAME]

The secrets are his, written by hand under /h4reet/<host>/ with `aws ssm put-parameter`, outside Terraform, which
never creates or reads one (rule T9). infra/parameters.txt lists the names the hosts expect, one a line with its type;
each group adds the ones its hosts read. This runs one call, `aws ssm describe-parameters` under /h4reet/, which
returns names and metadata, never a value, and lists each expected name as present, missing, or of another type, and
each name it finds that the list doesn't expect. Exit codes: 0 every expected name present with its type; 1 one
missing or of another type; 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PROG = "secrets-check"
REPO = Path(__file__).resolve().parents[2]
LIST = REPO / "infra" / "parameters.txt"
TYPES = ("String", "StringList", "SecureString")
NAME = re.compile(r"/h4reet/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*")
PROFILE = re.compile(r"[A-Za-z0-9._-]+")


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


def describe(profile: str) -> dict[str, str]:
    done = subprocess.run(
        [
            "aws",
            "ssm",
            "describe-parameters",
            "--parameter-filters",
            "Key=Path,Option=Recursive,Values=/h4reet/",
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
        raise RuntimeError(f"aws ssm describe-parameters exited {done.returncode}")
    return {
        str(p["Name"]): str(p.get("Type"))
        for p in json.loads(done.stdout or "{}").get("Parameters") or []
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="secrets_check.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--profile")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            f"{PROG}: this is the Author's: it reads his account's parameters with his SSO session",
            file=sys.stderr,
        )
        return 2
    profile = args.profile or os.environ.get("AWS_PROFILE", "")
    if not PROFILE.fullmatch(profile):
        print(f"{PROG}: name your SSO profile: PROFILE=h4reet-…", file=sys.stderr)
        return 2
    try:
        want = expected()
        have = describe(profile)
    except (OSError, ValueError, RuntimeError, KeyError) as exc:
        print(f"{PROG}: can't run: {exc}", file=sys.stderr)
        return 2
    bad = 0
    for name, kind in sorted(want.items()):
        if name not in have:
            status = "missing"
            bad += 1
        elif have[name] != kind:
            status = f"type {have[name]}, not {kind}"
            bad += 1
        else:
            status = f"present, {kind}"
        print(f"{name:60} {status}")
    for name in sorted(set(have) - set(want)):
        print(
            f"{name:60} unexpected ({have[name]}): infra/parameters.txt doesn't list it"
        )
    if not want:
        print(
            f"{PROG}: no name expected yet (infra/parameters.txt); {len(have)} under /h4reet/"
        )
        return 0
    print(f"{PROG}: {len(want) - bad} of {len(want)} present with their types")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
