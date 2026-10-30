#!/usr/bin/env python3
"""The room's image (spec 002, FR-059; plan §1; contracts/web-serving.md §1; tasks.md T001, T006).

    python3 -I -B -X pycache_prefix=/dev/null <tree>/deploy/scripts/web_image.py --stack prod|dev|dev-cpu
        --env-file PATH --repo DIR [--run-file PATH]

make up runs it after the gateway's image, before compose starts anything, from the tree being started; make build
and make image run it for dev-cpu (make web-image). It builds apps/web/Dockerfile from its own tree, outside compose,
as h4reet-web:<ref><suffix>. deploy/compose.yaml names that image (COMPOSE_IMAGE) with pull_policy: never and no build.

It follows deploy/scripts/gateway_image.py (spec 000, tasks.md T184), with three differences, because this image
bakes in what the gateway's doesn't:
  - The tag carries the drafts flag. The env file's H4_WEB_SUFFIX, read as data, is empty on prod and -drafts on dev
    and dev-cpu, and nothing else (preflight holds it there too). A -drafts build gets ROOM_DRAFTS=1, and no other
    build does, so prod's tag never names an image with drafts in it.
  - It builds on every run and reuses no tag: the image holds main's policy as it stood at build time, so an approval
    on main reaches the next make up, and prod and dev at one commit run two images.
  - The policy comes from main, read on the host: `git -C <repo> cat-file blob refs/heads/main:<path>`, with
    GIT_NO_REPLACE_OBJECTS=1, for assets/policy/content-approvals.json and assets/policy/resume-header.json, where
    <repo> is the working tree make names (as it names preflight's --repo). The full ref, as spec 003 reads its
    policy: a bare "main" resolves to refs/tags/main before refs/heads/main, and an agent session can make that tag. It writes them to a fresh 0700 temporary directory, outside the tree being built, and
    hands that to the build as the named build context `policy`, then removes it. A file main lacks is absent from
    it, so every content file builds as a draft and the PDF gets the room's header. The build stage reads only that
    directory and runs no git: a host stack builds a git archive export, and .dockerignore drops .git anyway. The
    two files' digest is the image's label org.h4reet.web.policy: SHA-256 over "<name>:<the file's SHA-256 or
    absent>\\n" for content-approvals.json, then resume-header.json.

Otherwise as the gateway's: a host stack builds the export its run file names, and only in the Author's terminal;
dev-cpu builds the working tree on the agents' engine only. The build is `docker buildx build --load` with this tree's
Dockerfile and context, the env file's H4_BUILD_PROXY as the proxy arguments, ROOM_DRAFTS, the policy context, and
the label, and nothing else: no --ssh, --secret, cache import or export, --add-host, --allow, or --network. Docker and
git get only their own settings from the environment.

Exit codes: 0 the image is built; 1 the build failed; 2 usage, or refused.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = "h4reet-web"
WORKING_TREE = "working-tree"
COMPOSE_IMAGE = f"{REPOSITORY}:${{H4_REF:-{WORKING_TREE}}}${{H4_WEB_SUFFIX}}"
DOCKERFILE = "apps/web/Dockerfile"
HOST_STACKS = ("prod", "dev")
# H4_WEB_SUFFIX per stack (contracts/web-serving.md §4): the drafts flag, in the tag.
SUFFIX = {"prod": "", "dev": "-drafts", "dev-cpu": "-drafts"}
DRAFTS_SUFFIX = "-drafts"
# main's policy files, by their path on main and their name in the context (contracts/resume-source.md §5).
POLICY_FILES = (
    ("assets/policy/content-approvals.json", "content-approvals.json"),
    ("assets/policy/resume-header.json", "resume-header.json"),
)
POLICY_LABEL = "org.h4reet.web.policy"
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


def host_ref(stack: str, run_file: Path | None, root: Path) -> str:
    """A host stack's commit: the one its run file names, whose export must be this tree."""
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
            f"this copy is in {root}, and a host stack's web image builds from the export the run file names, "
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
        "dev-cpu's web image is the working tree's, so it builds on the agents' engine only, never on this shell's "
        f"engine (FR-039): through the relay in an agent session, or with DOCKER_HOST={AGENTS_ENGINE}"
    )


def check_suffix(stack: str, values: dict[str, str]) -> str:
    """The env file's H4_WEB_SUFFIX, which must be the stack's: never drafts on prod."""
    if "H4_WEB_SUFFIX" not in values:
        raise Refused(
            "the env file has no H4_WEB_SUFFIX: make init-env SYNC=1 adds it (contracts/web-serving.md §4)"
        )
    suffix, expected = values["H4_WEB_SUFFIX"], SUFFIX[stack]
    if suffix == expected:
        return suffix
    if stack == "prod":
        raise Refused(
            "H4_WEB_SUFFIX isn't empty, and prod never shows drafts: its tag and its build are drafts-free "
            "(contracts/web-serving.md §1)"
        )
    raise Refused(
        f"H4_WEB_SUFFIX is {DRAFTS_SUFFIX} on {stack}, whose image shows the drafts, bannered "
        "(contracts/web-serving.md §4)"
    )


def git_env() -> dict[str, str]:
    """git's minimum: no GIT_DIR or other GIT_* of the caller's, no replace objects, no system or global config."""
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/nonexistent"),
        "LC_ALL": "C",
        "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_TERMINAL_PROMPT": "0",
    }


def read_policy(repo: Path) -> dict[str, bytes | None]:
    """main's policy files, by their name in the context; None for a file main doesn't hold (or no main at all).

    The branch's full ref, refs/heads/main, never a bare "main", which git resolves to a tag of that name first."""
    found: dict[str, bytes | None] = {}
    for path, name in POLICY_FILES:
        try:
            done = subprocess.run(
                ["git", "-C", str(repo), "cat-file", "blob", f"refs/heads/main:{path}"],
                capture_output=True,
                check=False,
                timeout=60,
                env=git_env(),
                stdin=subprocess.DEVNULL,
            )
        except (OSError, subprocess.TimeoutExpired):
            found[name] = None
            continue
        found[name] = done.stdout if done.returncode == 0 else None
    return found


def policy_digest(files: dict[str, bytes | None]) -> str:
    text = "".join(
        f"{name}:{hashlib.sha256(data).hexdigest() if data is not None else 'absent'}\n"
        for name, data in ((n, files.get(n)) for _, n in POLICY_FILES)
    )
    return hashlib.sha256(text.encode()).hexdigest()


def write_policy(files: dict[str, bytes | None]) -> Path:
    """A fresh 0700 directory under the system's temporary directory, holding the files main has."""
    folder = Path(tempfile.mkdtemp(prefix="h4-web-policy-"))
    folder.chmod(0o700)
    for name, data in files.items():
        if data is not None:
            target = folder / name
            target.write_bytes(data)
            target.chmod(0o644)
    return folder


def main(argv: list[str], run: Runner = docker, root: Path = ROOT) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--stack", required=True, choices=(*HOST_STACKS, "dev-cpu"))
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--run-file", type=Path)
    parser.add_argument("--repo", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.stack in HOST_STACKS:
            if os.environ.get("SANDBOX_RUNTIME") == "1":
                raise Refused(
                    f"{args.stack}'s web image builds in the Author's terminal; agent sessions run dev-cpu only "
                    "(FR-039)"
                )
            ref = host_ref(args.stack, args.run_file, root)
        else:
            if args.run_file is not None:
                raise Refused("dev-cpu has no run file: it builds the working tree")
            check_engine()
            ref = WORKING_TREE
        try:
            values = read_values(args.env_file)
        except (OSError, UnicodeDecodeError) as error:
            raise Refused(
                f"{args.env_file} can't be read ({error.__class__.__name__})"
            ) from None
        suffix = check_suffix(args.stack, values)
    except Refused as refusal:
        print(f"web image: {refusal}", file=sys.stderr)
        return 2

    proxy = values.get("H4_BUILD_PROXY", "")
    drafts = "1" if suffix == DRAFTS_SUFFIX else ""
    image = f"{REPOSITORY}:{ref}{suffix}"
    files = read_policy(args.repo)
    if all(data is None for data in files.values()):
        print(
            f"web image: main has no assets/policy files in {args.repo}, so every content file builds as a draft",
            flush=True,
        )
    folder = write_policy(files)
    try:
        print(
            f"web image: building {image} from {root}{' with drafts' if drafts else ''}",
            flush=True,
        )
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
            "--build-arg",
            f"ROOM_DRAFTS={drafts}",
            "--build-context",
            f"policy={folder}",
            "--label",
            f"{POLICY_LABEL}={policy_digest(files)}",
            str(root),
            capture=False,
        )
    finally:
        shutil.rmtree(folder, ignore_errors=True)
    if built.returncode != 0:
        print(
            f"web image: {image} didn't build (docker exited {built.returncode}); the output above says why",
            file=sys.stderr,
        )
        return 1
    print(f"web image: {image}, built", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
