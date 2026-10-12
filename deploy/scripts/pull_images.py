#!/usr/bin/env python3
"""make pull's images, the Author's terminal (spec 000; plan §4; research.md R-29).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/pull_images.py --stack prod|dev --env-file PATH
        [--root DIR]

It pulls, by digest, every image deploy/compose.yaml runs in any profile, and the bases the stack's own images
build on (base:node, base:python in deploy/images.lock), one at a time; not the gateway's, which make up builds and
no registry has (tasks.md T184). An image already present is skipped. A
Docker Hub image that answers HTTP 429, its anonymous rate limit, is retried after 5, 15, and 45 s, and then named
as a 429; any other failure stops that image at once. Docker Hub stays anonymous (R-29).

Exit codes: 0 every image is present; 1 a pull failed, named with its reason; 2 usage, or inside the sandbox.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKOFF_S = (5, 15, 45)
BASES = ("base:node", "base:python")
# The gateway's one image per commit, which make up builds and compose never pulls (tasks.md T184;
# deploy/scripts/gateway_image.py): no registry has it, so it is neither pulled nor unpinned.
SHARED_IMAGES = {"gateway": "h4reet-gateway:${H4_REF:-working-tree}"}
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

Runner = Callable[..., subprocess.CompletedProcess]


def docker(*args: str) -> subprocess.CompletedProcess:
    env = {k: os.environ[k] for k in DOCKER_ENV if k in os.environ} | {"LC_ALL": "C"}
    try:
        return subprocess.run(
            ["docker", *args],
            capture_output=True,
            text=True,
            check=False,
            timeout=1800,
            env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return subprocess.CompletedProcess(["docker", *args], 127, "", str(error))


def wanted(
    root: Path, stack: str, env_file: Path, run: Runner
) -> tuple[list[str], list[str]]:
    """The pinned images to pull, and the services whose image isn't pinned."""
    done = run(
        "compose", "-p", f"h4reet-{stack}", "-f", str(root / "deploy/compose.yaml"), "--env-file", str(env_file),
        "config", "--no-interpolate", "--no-path-resolution", "--format", "json",
    )  # fmt: skip
    if done.returncode:
        raise RuntimeError("docker compose config refused the compose file")
    services = json.loads(done.stdout).get("services") or {}
    refs, unpinned = [], []
    for name, service in sorted(services.items()):
        image = service.get("image")
        if service.get("build") is not None or not image:
            continue
        if SHARED_IMAGES.get(name) == image and service.get("pull_policy") == "never":
            continue
        (refs if "@sha256:" in str(image) else unpinned).append(
            str(image) if "@sha256:" in str(image) else name
        )
    for line in (root / "deploy/images.lock").read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] in BASES and fields[3].startswith("sha256:"):
            refs.append(f"{fields[1]}:{fields[2]}@{fields[3]}")
    return list(dict.fromkeys(refs)), unpinned


def docker_hub(ref: str) -> bool:
    first = ref.split("/", 1)[0]
    return (
        ref.startswith("docker.io/")
        or "/" not in ref
        or ("." not in first and ":" not in first)
    )


def rate_limited(text: str) -> bool:
    return "toomanyrequests" in text.lower() or "429" in text


def pull(ref: str, run: Runner, sleep: Callable[[float], None]) -> tuple[str, str]:
    if run("image", "inspect", "--format", "{{.Id}}", ref).returncode == 0:
        return "present", ""
    waits = list(BACKOFF_S) if docker_hub(ref) else []
    while True:
        done = run("pull", "--quiet", ref)
        if done.returncode == 0:
            return "pulled", ""
        reason = (done.stderr or done.stdout).strip().splitlines()[-1:] or [
            f"exit {done.returncode}"
        ]
        if rate_limited(reason[0]) and waits:
            wait = waits.pop(0)
            print(
                f"  {ref}: Docker Hub answered HTTP 429 (its anonymous rate limit); retrying in {wait} s",
                flush=True,
            )
            sleep(wait)
            continue
        if rate_limited(reason[0]):
            return (
                "FAILED",
                "HTTP 429, Docker Hub's anonymous rate limit, after 5, 15, and 45 s: try again in an hour",
            )
        return "FAILED", reason[0][:200]


def main(
    argv: list[str], run: Runner = docker, sleep: Callable[[float], None] = time.sleep
) -> int:
    parser = argparse.ArgumentParser(description="Pull the stack's images by digest")
    parser.add_argument("--stack", required=True, choices=("prod", "dev"))
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            "pull runs in the Author's terminal; the agents' engine is seeded instead (engine.sh seed)",
            file=sys.stderr,
        )
        return 2
    try:
        refs, unpinned = wanted(args.root.resolve(), args.stack, args.env_file, run)
    except (RuntimeError, OSError, json.JSONDecodeError) as error:
        print(f"pull: {error}", file=sys.stderr)
        return 1
    failed = [
        f"{name}: its image isn't pinned by digest: make pin-images"
        for name in unpinned
    ]
    for ref in refs:
        status, reason = pull(ref, run, sleep)
        print(f"{status:<8} {ref}{': ' + reason if reason else ''}", flush=True)
        if status == "FAILED":
            failed.append(f"{ref}: {reason}")
    for failure in failed:
        print(f"FAIL {failure}", file=sys.stderr)
    print(
        f"pull: {len(refs) - sum(1 for f in failed if '@sha256:' in f)} of {len(refs)} images present"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
