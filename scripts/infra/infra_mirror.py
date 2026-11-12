#!/usr/bin/env python3
"""make infra-mirror: seed spec 001's Terraform provider mirror at the pinned versions (its research.md R-14; tasks.md
T008, T011). The Author's terminal: it reaches the Terraform registry, which agent sessions can't, and the sandbox and
the bash gate (P-1) refuse it to them.

    python3 -I -B -X pycache_prefix=/dev/null scripts/infra/infra_mirror.py [--vars FILE] [--mirror DIR]
        [--platform linux_amd64 ...]

It reads TERRAFORM_VERSION and TERRAFORM_AWS_PROVIDER_VERSION from .devcontainer/toolchain.vars, as data; checks that
the terraform on PATH is that release; writes a configuration holding only those two pins to a temporary folder; and
runs `terraform providers mirror` there into ~/.local/share/h4reet/terraform-providers, beside the lint toolchain,
where agent sessions read it and can't write. make infra-check's terraform init then reads only that mirror.

terraform runs with PATH, HOME, and CHECKPOINT_DISABLE=1 alone, so no TF_CLI_ARGS*, TF_VAR_*, or AWS_* setting of the
calling shell reaches it, and it makes no update check. The platform is the host's (linux_amd64 here) unless
--platform names others. Exit codes: 0 mirrored, the pinned release present; 1 terraform failed, or the mirror lacks
the pin; 2 it couldn't run (the sandbox, no pins, no terraform, another release).
"""

from __future__ import annotations

import argparse
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_VARS = REPO / ".devcontainer" / "toolchain.vars"
DEFAULT_MIRROR = Path.home() / ".local" / "share" / "h4reet" / "terraform-providers"
PROVIDER = Path("registry.terraform.io") / "hashicorp" / "aws"
EXACT = re.compile(r"\d+\.\d+\.\d+")


def die(message: str) -> int:
    print(f"infra-mirror: {message}", file=sys.stderr)
    return 2


def read_pins(path: Path) -> dict[str, str]:
    pins = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = raw.strip().partition("=")
        if sep and not key.startswith("#"):
            pins[key] = value
    return pins


def host_platform() -> str:
    machine = platform.machine().lower()
    return "linux_arm64" if machine in ("aarch64", "arm64") else "linux_amd64"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="infra_mirror.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--vars", type=Path, default=DEFAULT_VARS)
    parser.add_argument("--mirror", type=Path, default=DEFAULT_MIRROR)
    parser.add_argument("--platform", action="append", dest="platforms")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        return die(
            "this is the Author's: it reaches the Terraform registry, which agent sessions can't"
        )
    try:
        pins = read_pins(args.vars)
    except OSError as exc:
        return die(f"can't read {args.vars}: {exc.__class__.__name__}")
    tf_pin, aws_pin = (
        pins.get("TERRAFORM_VERSION", ""),
        pins.get("TERRAFORM_AWS_PROVIDER_VERSION", ""),
    )
    if not (EXACT.fullmatch(tf_pin) and EXACT.fullmatch(aws_pin)):
        return die(
            f"{args.vars} must pin TERRAFORM_VERSION and TERRAFORM_AWS_PROVIDER_VERSION, each x.y.z"
        )
    terraform = shutil.which("terraform")
    if terraform is None:
        return die(f"there is no terraform on PATH: install Terraform {tf_pin}")
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(Path.home()),
        "CHECKPOINT_DISABLE": "1",
    }
    out = subprocess.run(
        [terraform, "version"], capture_output=True, text=True, env=env, check=False
    )
    found = re.search(r"Terraform v(\d+\.\d+\.\d+)", out.stdout)
    if not found or found.group(1) != tf_pin:
        return die(
            f"terraform on PATH is {found.group(1) if found else 'unknown'}; the pin is {tf_pin}"
        )
    platforms = args.platforms or [host_platform()]
    args.mirror.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="infra-mirror-") as work:
        (Path(work) / "versions.tf").write_text(
            "terraform {\n"
            f'  required_version = "{tf_pin}"\n'
            "  required_providers {\n"
            "    aws = {\n"
            '      source  = "hashicorp/aws"\n'
            f'      version = "{aws_pin}"\n'
            "    }\n"
            "  }\n"
            "}\n",
            encoding="utf-8",
        )
        argv_tf = [
            terraform,
            f"-chdir={work}",
            "providers",
            "mirror",
            *[f"-platform={p}" for p in platforms],
            str(args.mirror),
        ]
        print(
            f"infra-mirror: terraform {tf_pin}, hashicorp/aws {aws_pin}, for {', '.join(platforms)}, into {args.mirror}"
        )
        done = subprocess.run(argv_tf, env=env, check=False)
    if done.returncode != 0:
        print(
            f"infra-mirror: terraform providers mirror failed (exit {done.returncode})",
            file=sys.stderr,
        )
        return 1
    held = sorted(
        p.stem for p in (args.mirror / PROVIDER).glob("*.json") if p.stem != "index"
    )
    if aws_pin not in held:
        print(
            f"infra-mirror: the mirror holds {', '.join(held) or 'no release'}, not the pinned {aws_pin}",
            file=sys.stderr,
        )
        return 1
    print(
        f"infra-mirror: done; the mirror holds hashicorp/aws {', '.join(held)}; make check's infra-check reads it"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
