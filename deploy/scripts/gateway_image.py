#!/usr/bin/env python3
"""The gateway's one image per commit (spec 000 US1-5, FR-017; plan §4; contracts/env-files.md §12; tasks.md T184).

    python3 -I -B -X pycache_prefix=/dev/null <tree>/deploy/scripts/gateway_image.py --stack prod|dev|dev-cpu
        --env-file PATH [--run-file PATH]

make up runs it after preflight and the model, before compose starts anything, from the tree being started; make
build and make image run it for dev-cpu (make gateway-image). It builds services/gateway/Dockerfile from its own
tree, outside compose, as h4reet-gateway:<tag>. deploy/compose.yaml names that image (COMPOSE_IMAGE, below) with
pull_policy: never and no build, so compose never builds a gateway of its own per stack (with its project's label)
and never pulls one:
  - prod and dev, on the host's engine. The tree is the export of the commit the run file names, and the tag is that
    commit's SHA, the run file's H4_REF. An image with that tag on this engine was built from that same commit, so
    it is reused: prod and dev at one commit run one image, with one ID, and a restart or a rollback to a commit
    already built builds nothing.
  - dev-cpu, on the agents' engine only. The tree is the working tree, which agents change between runs under one
    name, so the tag is working-tree, and it is built every time; unchanged layers come from the cache. dev-cpu has no
    run file, so H4_REF is unset there and compose takes the default.

The build is `docker buildx build --load` with this tree's Dockerfile and context, and the env file's H4_BUILD_PROXY,
read as data, as the HTTP_PROXY and HTTPS_PROXY build arguments (empty on host stacks, the engine's proxy on dev-cpu),
and nothing else: no --ssh, --secret, --build-context, cache import or export, --add-host, --allow, or --network.
Those are the build settings the compose policy refuses in compose's own builds (plan §11). Docker gets only its own
settings from the environment.

Exit codes: 0 the image is there, built or reused; 1 the build failed; 2 usage, or refused.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = "h4reet-gateway"
WORKING_TREE = "working-tree"
# What deploy/compose.yaml's gateway names: H4_REF is the run file's commit on a host stack. dev-cpu has no run file,
# so it takes the default, the working tree. (A host stack's compose call without its run file fails on H4_TREE first.)
COMPOSE_IMAGE = f"{REPOSITORY}:${{H4_REF:-{WORKING_TREE}}}"
DOCKERFILE = "services/gateway/Dockerfile"
HOST_STACKS = ("prod", "dev")
# The agents' engine: the relay's end inside the sandbox, or the engine itself (make compose-images' rule).
RELAY_HOST = "tcp://127.0.0.1:2376"
AGENTS_ENGINE = "tcp://198.18.0.1:2376"
SHA_RE = re.compile(r"[0-9a-f]{40}")
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*")
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


class Refused(Exception):
    """Exit 2, with the reason."""


def docker_env() -> dict[str, str]:
    """Docker's own settings, and nothing else of the caller's: not its proxies, AWS, or stack settings."""
    return {k: os.environ[k] for k in DOCKER_ENV if k in os.environ} | {"LC_ALL": "C"}


def docker(*args: str, capture: bool = True) -> subprocess.CompletedProcess:
    """docker with only its own settings. A build's output goes straight to the terminal (capture=False)."""
    try:
        return subprocess.run(
            ["docker", *args],
            capture_output=capture,
            text=True,
            check=False,
            timeout=1800,
            env=docker_env(),
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return subprocess.CompletedProcess(["docker", *args], 127, "", str(error))


def read_values(path: Path) -> dict[str, str]:
    """KEY=VALUE lines as data (contracts/env-files.md §1.1): never sourced, a single-quoted value taken literally."""
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.rstrip("\r").partition("=")
        if not sep or not KEY_RE.fullmatch(key) or key in values:
            continue
        if len(value) >= 2 and value[0] == value[-1] == "'":
            value = value[1:-1]
        values[key] = value
    return values


def host_tag(stack: str, run_file: Path | None, root: Path) -> str:
    """A host stack's tag: the commit its run file names, whose export must be this tree."""
    started = f"make up ENV={stack} writes it"
    if run_file is None:
        raise Refused(f"{stack} builds from the commit its run file names: {started}")
    try:
        run = read_values(run_file)
    except (OSError, UnicodeDecodeError) as error:
        raise Refused(
            f"{run_file} can't be read ({error.__class__.__name__}): {started}"
        ) from None
    ref = run.get("H4_REF", "")
    if not SHA_RE.fullmatch(ref):
        raise Refused(f"{run_file}'s H4_REF isn't a full commit SHA: {started}")
    tree = run.get("H4_TREE", "")
    if not tree or Path(tree).resolve() != root.resolve():
        raise Refused(
            f"this copy is in {root}, and a host stack's gateway builds from the export the run file names, "
            f"{tree or '(none)'}: run it from there, as make up does"
        )
    return ref


def check_engine() -> None:
    """dev-cpu's image is the working tree's, which agents write: it builds on the agents' engine only (FR-039)."""
    host = os.environ.get("DOCKER_HOST", "")
    if host == AGENTS_ENGINE:
        return
    if host == RELAY_HOST and os.environ.get("SANDBOX_RUNTIME") == "1":
        return
    raise Refused(
        "dev-cpu's gateway image is the working tree's, so it builds on the agents' engine only, never on this shell's "
        f"engine (FR-039): through the relay in an agent session, or with DOCKER_HOST={AGENTS_ENGINE}"
    )


def main(argv: list[str], run: Runner = docker, root: Path = ROOT) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--stack", required=True, choices=(*HOST_STACKS, "dev-cpu"))
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--run-file", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.stack in HOST_STACKS:
            if os.environ.get("SANDBOX_RUNTIME") == "1":
                raise Refused(
                    f"{args.stack}'s gateway image builds in the Author's terminal; agent sessions run dev-cpu only "
                    "(FR-039)"
                )
            tag = host_tag(args.stack, args.run_file, root)
        else:
            if args.run_file is not None:
                raise Refused("dev-cpu has no run file: it builds the working tree")
            check_engine()
            tag = WORKING_TREE
        try:
            proxy = read_values(args.env_file).get("H4_BUILD_PROXY", "")
        except (OSError, UnicodeDecodeError) as error:
            raise Refused(
                f"{args.env_file} can't be read ({error.__class__.__name__})"
            ) from None
    except Refused as refusal:
        print(f"gateway image: {refusal}", file=sys.stderr)
        return 2

    image = f"{REPOSITORY}:{tag}"
    if tag != WORKING_TREE:
        found = run("image", "inspect", "--format", "{{.Id}}", image)
        if found.returncode == 0:
            image_id = found.stdout.strip()[:19]
            print(
                f"gateway image: {image}, reused: this engine built it for this commit before ({image_id})",
                flush=True,
            )
            return 0
    print(f"gateway image: building {image} from {root}", flush=True)
    built = run(
        "buildx",
        "build",
        "--load",
        "--file",
        str(root / DOCKERFILE),
        "--tag",
        image,
        "--build-arg",
        f"HTTP_PROXY={proxy}",
        "--build-arg",
        f"HTTPS_PROXY={proxy}",
        str(root),
        capture=False,
    )
    if built.returncode != 0:
        print(
            f"gateway image: {image} didn't build (docker exited {built.returncode}); the output above says why",
            file=sys.stderr,
        )
        return 1
    print(f"gateway image: {image}, built", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
