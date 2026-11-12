#!/usr/bin/env python3
"""A cloud host's deployer's first step, the one the user data carries (spec 001 contracts/releases-deployer.md §3;
plan.md §16, "From the release", the Author's answer of 2026-11-13, "From the release (Recommended)"). It runs the
deployer of the release the host last started, from that release's tree, so the deployer changes with a release, not
with a replace of the host. Before any release started it fetches the newest one's tree, held to release.json's
SHA-256, and runs its deployer, which verifies the whole release again. A deployer that doesn't run is alerted once,
and the previous release's runs instead. deploy/scripts/test_deploy_first_step.py's docstring gives each case.

    python3 -I -B deploy_first_step.py --host tunnel-end [the deployer's arguments: --boot, --restart SERVICE]

The standard library alone, in Python 3.9's syntax; the AWS CLI does the reads.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
from collections.abc import Callable
from pathlib import Path

PROG = "deploy-first-step"
PREFIX = "[hareet.ai aws]"
STATE = Path("/var/lib/h4reet/deploy")
# Each host's env file, which its write_env.py writes at boot; group 7 adds EC2's.
ENV_FILES = {"tunnel-end": Path("/run/h4reet/tunnel-end.env")}
PYTHON = "/usr/bin/python3"
# The deployer's exit for a run that refused or rolled back and alerted (deploy/scripts/deployer.py's EXIT_ALERTED).
DEPLOYER_ALERTED = 75
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
HEX_RE = re.compile(r"[0-9a-f]{64}")
RELEASE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
KEY_RE = re.compile(r"trees/[A-Za-z0-9._/-]{1,200}")


class Unreachable(Exception):
    """The bucket, or the AWS CLI, didn't answer."""


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            values[key] = value
    return values


def recorded(state: Path, name: str) -> dict | None:
    path = state / f"{name}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
    except ValueError:
        return None


def alert_once(state: Path, aws, key: str, lines: list[str]) -> None:
    """One alert per release and reason, in the deployer's own memory of them (state/refused.json)."""
    seen = recorded(state, "refused") or {}
    if key in seen:
        return
    state.mkdir(parents=True, exist_ok=True)
    tmp = state / ".refused.json"
    tmp.write_text(
        json.dumps({**seen, key: "first-step"}, sort_keys=True), encoding="utf-8"
    )
    os.replace(tmp, state / "refused.json")
    aws.publish("\n".join(lines))


def extract(data: bytes, into: Path) -> bool:
    """The tree into its folder, beside it first and renamed over it: files and folders alone, each inside it."""
    partial = into.with_name(f".{into.name}")
    shutil.rmtree(str(partial), ignore_errors=True)
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            members = tar.getmembers()
            for m in members:
                target = (partial / m.name).resolve()
                if not (m.isfile() or m.isdir()) or (
                    target != partial.resolve()
                    and partial.resolve() not in target.parents
                ):
                    return False
            partial.mkdir(parents=True)
            for m in members:
                target = partial / m.name
                if m.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                source = tar.extractfile(m)
                assert source is not None
                target.write_bytes(source.read())
                os.chmod(str(target), m.mode & 0o755)
    except (tarfile.TarError, OSError):
        shutil.rmtree(str(partial), ignore_errors=True)
        return False
    os.replace(str(partial), str(into))
    return True


def fetch_newest(
    host: str, state: Path, bucket: str, aws
) -> tuple[dict | None, Path | None]:
    """The newest release and its tree, fetched and held to release.json; (None, None) if there's none to run."""
    pointer = aws.get(bucket, "releases/latest.json")
    if pointer is None:
        print(f"{PROG}: no release yet; nothing runs")
        return None, None
    try:
        rid = str(json.loads(pointer).get("release", ""))
        body = (
            aws.get(bucket, f"releases/{rid}/release.json")
            if RELEASE_RE.fullmatch(rid)
            else None
        )
        release = json.loads(body) if body is not None else {}
    except ValueError:
        release = {}
    rid = str(release.get("release", "latest"))
    tree = release.get("tree") or {}
    commit, key, sha = (
        str(release.get("commit", "")),
        str(tree.get("key", "")),
        str(tree.get("sha256", "")),
    )
    data = (
        aws.get(bucket, key)
        if COMMIT_RE.fullmatch(commit) and KEY_RE.fullmatch(key)
        else None
    )
    folder = state / "trees" / commit
    if (
        data is None
        or not HEX_RE.fullmatch(sha)
        or hashlib.sha256(data).hexdigest() != sha
        or not (folder.is_dir() or extract(data, folder))
    ):
        alert_once(
            state,
            aws,
            f"{rid}:tree",
            [
                f"{PREFIX} deploy_refused: {host} refused release {rid}",
                "- reason: tree",
                f"- release: {rid}",
            ],
        )
        return release, None
    return release, folder


def deployer_argv(
    host: str, tree: Path, env_file: Path, state: Path, args: list[str]
) -> list[str]:
    script = tree / "deploy" / "scripts" / "deployer.py"
    return [
        PYTHON,
        "-I",
        "-B",
        str(script),
        "--host",
        host,
        "--env-file",
        str(env_file),
        "--state",
        str(state),
        *args,
    ]


def run(
    host: str,
    env_file: Path,
    state: Path,
    aws,
    runner: Callable[[list[str]], int],
    args: list[str],
) -> int:
    current = recorded(state, "current")
    if current is None:
        bucket = read_env(env_file).get("RELEASE_BUCKET", "")
        try:
            release, tree = fetch_newest(host, state, bucket, aws)
        except Unreachable:
            print(
                f"{PROG}: the release bucket can't be reached; nothing runs",
                file=sys.stderr,
            )
            return 0
        if release is None:
            return 0
        if tree is None:
            return 1
        code = runner(deployer_argv(host, tree, env_file, state, args))
        return 0 if code in (0, DEPLOYER_ALERTED) else 1
    tree = state / "trees" / str(current.get("commit", ""))
    code = runner(deployer_argv(host, tree, env_file, state, args))
    if code in (0, DEPLOYER_ALERTED):
        return 0
    # The release's deployer didn't run: alerted once, and the previous release's deployer runs, so the host still
    # takes the next release.
    previous = recorded(state, "previous")
    rid, old = (
        str(current.get("release", "?")),
        str((previous or {}).get("release", "none")),
    )
    alert_once(
        state,
        aws,
        f"{rid}:deployer",
        [
            f"{PREFIX} deploy_refused: {host} couldn't run release {rid}'s deployer",
            "- reason: deployer",
            f"- release: {rid}",
            f"- fallback: {old}",
        ],
    )
    if previous is None:
        return 1
    back = state / "trees" / str(previous.get("commit", ""))
    code = runner(deployer_argv(host, back, env_file, state, args))
    return 0 if code in (0, DEPLOYER_ALERTED) else 1


class AwsCli:
    """The AWS CLI with the instance role, through the host's egress proxy (the units' HTTPS_PROXY)."""

    def __init__(self, env_file: Path) -> None:
        self.env_file = env_file

    def call(self, *args: str) -> subprocess.CompletedProcess:
        try:
            return subprocess.run(
                ["aws", "--region", "us-east-1", "--no-cli-pager", *args],
                capture_output=True,
                check=False,
                timeout=120,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise Unreachable(type(error).__name__) from error

    def get(self, bucket: str, key: str) -> bytes | None:
        done = self.call("s3", "cp", f"s3://{bucket}/{key}", "-")
        if done.returncode == 0:
            return done.stdout
        said = done.stderr.decode(errors="replace")
        if "404" in said or "NoSuchKey" in said or "Not Found" in said:
            return None
        raise Unreachable("s3")

    def publish(self, message: str) -> None:
        account = read_env(self.env_file).get("H4_REGISTRY", "").split(".", 1)[0]
        topic = f"arn:aws:sns:us-east-1:{account}:h4-alerts"
        self.call("sns", "publish", "--topic-arn", topic, "--message", message)


def process(argv: list[str]) -> int:
    try:
        return subprocess.run(argv, check=False, timeout=1800).returncode
    except (OSError, subprocess.TimeoutExpired):
        return 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="deploy_first_step.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--host", required=True, choices=sorted(ENV_FILES))
    parser.add_argument("--state", type=Path, default=STATE)
    args, rest = parser.parse_known_args(argv)
    env_file = ENV_FILES[args.host]
    return run(args.host, env_file, args.state, AwsCli(env_file), process, rest)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
