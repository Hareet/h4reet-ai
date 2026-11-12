#!/usr/bin/env python3
"""A cloud host's deployer, the tunnel end's part (spec 001 FR-046 to FR-049; contracts/releases-deployer.md §1, §3,
§5; research.md R-17; tasks.md T049; group 7 extends it). Runs as root at boot (h4-stack.service, --boot) and every
minute (h4-deployer.timer), through the host's egress proxy.

    python3 -I -B deployer.py --host tunnel-end [--boot] [--restart SERVICE]

Each run verifies the bucket's newest release (RELEASE_BUCKET) for this host's class and starts it, or rolls back, or
refuses, with an alert in contracts/aws-alerts.md §2's format that carries no address, account, or secret; and first
keeps the running release up, from the images the host holds. deploy/scripts/test_deployer.py's docstring and
contracts/releases-deployer.md §3 give each step. --restart restarts one service of the running release. The standard
library alone, in Python 3.9's syntax: it travels in the tunnel end's user data, whose 16 KB it nearly fills.
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
import time
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

PROG = "deployer"
PREFIX = "[hareet.ai aws]"
STATE = Path("/var/lib/h4reet/deploy")
ENV_FILE = Path("/run/h4reet/tunnel-end.env")
PLUGIN = Path("/usr/local/lib/docker/cli-plugins/docker-compose")
# The services each cloud host's class runs (spec 001 contracts/env-cloud.md §3); preflight.py's HOST_CLASSES, which
# deploy/scripts/test_deployer.py holds this to.
HOST_CLASSES = {
    "tunnel-end": (
        "tunnel-end",
        "relay",
        "snapshot-sink",
        "tunnel-end-collector",
        "shared-state",
    ),
}
# Each class's host step, from the release's tree, before compose pulls or starts anything (spec 001 tasks.md T164):
# the tunnel end's shared state, its data volume's mount, its key and certificate on tmpfs, and its backup's units and
# timer. A failed step is a failed start. So the host's later parts come with each release, never the user data.
HOST_STEPS = {
    "tunnel-end": ("deploy/hosts/tunnel-end/shared_state.py", "prepare"),
}


def host_step_argv(host: str, tree: Path) -> list[str]:
    script, action = HOST_STEPS[host]
    return [
        "/usr/bin/python3",
        "-I",
        "-B",
        str(tree / script),
        action,
        "--tree",
        str(tree),
    ]


def preflight_argv(host: str, tree: Path, env_file: Path, phase: str) -> list[str]:
    """The release tree's own preflight for the host's class, T1 to T5 (group 5's review, I7)."""
    return [
        "/usr/bin/python3",
        "-I",
        "-B",
        str(tree / "deploy" / "scripts" / "preflight.py"),
        "--host-class",
        host,
        "--env-file",
        str(env_file),
        "--root",
        str(tree),
        "--phase",
        phase,
    ]


# The named volumes a class's service writes as its image's own user, which a new volume's root isn't: the deployer
# gives each its owner before compose starts the service (the tunnel end's collector's queue, deploy/compose.yaml).
VOLUME_OWNERS = {
    "tunnel-end": {"tunnel-end-collector-queue": 10001},
}
PROJECT = "h4reet-prod"
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")
HEX_RE = re.compile(r"[0-9a-f]{64}")
RELEASE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
REPOSITORY_RE = re.compile(r"h4reet/[a-z0-9-]{1,40}")
KEY_RE = re.compile(r"(releases|trees|tools)/[A-Za-z0-9._/-]{1,200}")


class Unreachable(Exception):
    """The bucket, or the AWS CLI, didn't answer."""


class Refused(Exception):
    """The release isn't one this host may run: the reason is one word, the alert's fact."""


class Aws(Protocol):
    def get(self, bucket: str, key: str) -> bytes | None: ...

    def publish(self, message: str) -> None: ...

    def login(self, registry: str) -> None: ...


class Docker(Protocol):
    def compose(self, tree: Path, env_files: list[Path], args: list[str]) -> bool: ...

    def running(
        self, tree: Path, env_files: list[Path], services: list[str]
    ) -> bool: ...

    def own_volume(self, name: str, uid: int) -> bool: ...

    def host_step(self, host: str, tree: Path) -> bool: ...

    def preflight(self, host: str, tree: Path, env_file: Path, phase: str) -> bool: ...


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            values[key] = value
    return values


def alert(kind: str, summary: str, facts: list[tuple[str, str]]) -> str:
    return "\n".join(
        [f"{PREFIX} {kind}: {summary}", *(f"- {k}: {v}" for k, v in facts)]
    )


def verify(host: str, release: dict) -> list[str]:
    """This host's services in the release, in its class's order, or Refused with the reason."""
    if not RELEASE_RE.fullmatch(str(release.get("release", ""))):
        raise Refused("release")
    if not COMMIT_RE.fullmatch(str(release.get("commit", ""))):
        raise Refused("commit")
    tree = release.get("tree") or {}
    if not KEY_RE.fullmatch(str(tree.get("key", ""))) or not HEX_RE.fullmatch(
        str(tree.get("sha256", ""))
    ):
        raise Refused("tree")
    plugin = release.get("compose") or {}
    if not KEY_RE.fullmatch(str(plugin.get("key", ""))) or not HEX_RE.fullmatch(
        str(plugin.get("sha256", ""))
    ):
        raise Refused("compose")
    services = release.get("services") or {}
    mine = []
    for name, service in services.items():
        if host not in (service.get("hosts") or []):
            continue
        if name not in HOST_CLASSES[host]:
            raise Refused("class")
        if not DIGEST_RE.fullmatch(
            str(service.get("digest", ""))
        ) or not REPOSITORY_RE.fullmatch(str(service.get("repository", ""))):
            raise Refused("digest")
        mine.append(name)
    if not mine:
        raise Refused("services")
    return [n for n in HOST_CLASSES[host] if n in mine]


def safe_extract(data: bytes, into: Path) -> None:
    """The tree, whose every member stays inside its folder: files and folders alone, no link, no device."""
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        members = tar.getmembers()
        for m in members:
            target = (into / m.name).resolve()
            if not (m.isfile() or m.isdir()) or (
                target != into.resolve() and into.resolve() not in target.parents
            ):
                raise Refused("tree")
        into.mkdir(parents=True, exist_ok=True)
        for m in members:
            target = into / m.name
            if m.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source = tar.extractfile(m)
            assert source is not None
            target.write_bytes(source.read())
            os.chmod(target, m.mode & 0o755)


class Deployer:
    def __init__(
        self,
        host: str,
        env_file: Path,
        state: Path,
        aws: Aws,
        docker: Docker,
        plugin: Path,
        now: Callable[[], str],
    ) -> None:
        self.host, self.env_file, self.state = host, env_file, state
        self.aws, self.docker, self.plugin, self.now = aws, docker, plugin, now
        self.env = read_env(env_file)
        self.bucket = self.env.get("RELEASE_BUCKET", "")

    # The state folder: current.json, previous.json, each release's tree and env file, and the record.
    def recorded(self, name: str) -> dict | None:
        path = self.state / f"{name}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    def keep(self, name: str, release: dict) -> None:
        self.state.mkdir(parents=True, exist_ok=True)
        tmp = self.state / f".{name}.json"
        tmp.write_text(json.dumps(release, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.state / f"{name}.json")

    def record(self, release: dict, outcome: str) -> None:
        self.state.mkdir(parents=True, exist_ok=True)
        line = {
            "host": self.host,
            "release": release.get("release"),
            "commit": release.get("commit"),
            "outcome": outcome,
            "at": self.now(),
            "started_by": "deployer",
        }
        with (self.state / "deployments.jsonl").open("a", encoding="utf-8") as out:
            out.write(json.dumps(line, sort_keys=True) + "\n")

    def tree(self, release: dict) -> Path:
        return self.state / "trees" / str(release["commit"])

    def release_env(self, release: dict) -> Path:
        lines = [f"H4_RELEASE={release['release']}"]
        for name in verify(self.host, release):
            repository = str(release["services"][name]["repository"]).split("/", 1)[1]
            lines.append(
                f"H4_DIGEST_{repository.upper().replace('-', '_')}={release['services'][name]['digest']}"
            )
        path = self.state / "releases" / f"{release['release']}.env"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.chmod(path, 0o600)
        return path

    def fetch(self, key: str, sha256: str, reason: str) -> bytes:
        """An object of the release, held to its SHA-256; a missing or different one refuses with the reason."""
        data = self.aws.get(self.bucket, key)
        if data is None or hashlib.sha256(data).hexdigest() != sha256:
            raise Refused(reason)
        return data

    def prepare(self, release: dict) -> None:
        """The tree and the plugin, each by its SHA-256, before anything starts."""
        tree = self.tree(release)
        if not tree.is_dir():
            data = self.fetch(release["tree"]["key"], release["tree"]["sha256"], "tree")
            partial = tree.with_name(f".{tree.name}")
            shutil.rmtree(partial, ignore_errors=True)
            safe_extract(data, partial)
            os.replace(partial, tree)
        plugin = self.fetch(
            release["compose"]["key"], release["compose"]["sha256"], "compose"
        )
        self.plugin.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.plugin.with_name(f".{self.plugin.name}")
        tmp.write_bytes(plugin)
        os.chmod(tmp, 0o755)
        os.replace(tmp, self.plugin)

    def start(self, release: dict, pull: bool = True) -> bool:
        """Up: a new release with the registry's login (Unreachable before any change) and its pull; else, the
        cached images alone. Refused("preflight") starts nothing."""
        services = verify(self.host, release)
        env_files = [self.env_file, self.release_env(release)]
        tree = self.tree(release)
        registry = self.env.get("H4_REGISTRY", "")
        if pull and registry:
            self.aws.login(registry)
        # T1 to T4 need no host step, so a refusal there leaves the host's files as they were; T5 reads what the
        # host step writes (group 5's fixes' review, 2).
        if not self.docker.preflight(self.host, tree, self.env_file, "before"):
            raise Refused("preflight")
        if self.host in HOST_STEPS and not self.docker.host_step(self.host, tree):
            return False
        if not self.docker.preflight(self.host, tree, self.env_file, "after"):
            raise Refused("preflight_after")
        for volume, uid in VOLUME_OWNERS.get(self.host, {}).items():
            if not self.docker.own_volume(f"{PROJECT}_{volume}", uid):
                return False
        if pull and not self.docker.compose(tree, env_files, ["pull", *services]):
            return False
        up = ["up", "-d", "--wait", "--no-build", "--remove-orphans"]
        if not pull:
            up += ["--pull", "never"]
        return self.docker.compose(tree, env_files, [*up, *services])

    def restart_cached(self, release: dict, why: str) -> bool:
        """A release the host ran, from its cached images; False, said on stderr, if it doesn't start."""
        try:
            if self.start(release, pull=False):
                return True
            print(f"{PROG}: {why}", file=sys.stderr)
        except Refused as refused:
            print(f"{PROG}: {why}: {refused} refuses it", file=sys.stderr)
        return False

    def ensure(self) -> None:
        """The current release, up again from its cached images if any of its services isn't running."""
        current = self.recorded("current")
        if current is None:
            return
        try:
            services = verify(self.host, current)
        except Refused:
            return
        env_files = [self.env_file, self.release_env(current)]
        if self.docker.running(self.tree(current), env_files, services):
            return
        self.restart_cached(
            current,
            f"release {current['release']} isn't running, and didn't start again",
        )

    def boot(self) -> int:
        current = self.recorded("current")
        if current is not None:
            self.restart_cached(current, "the last release didn't start at boot")
        return self.check()

    def check(self) -> int:
        self.ensure()
        try:
            pointer = self.aws.get(self.bucket, "releases/latest.json")
            if pointer is None:
                print(f"{PROG}: no release yet")
                return 0
            rid = str(json.loads(pointer).get("release", ""))
            if not RELEASE_RE.fullmatch(rid):
                raise Refused("release")
            body = self.aws.get(self.bucket, f"releases/{rid}/release.json")
            if body is None:
                raise Refused("missing")
            release = json.loads(body)
        except Unreachable:
            print(
                f"{PROG}: the release bucket can't be reached; nothing changes",
                file=sys.stderr,
            )
            return 0
        except (Refused, ValueError) as error:
            return self.refuse({"release": "latest"}, str(error) or "release")
        current = self.recorded("current")
        if current is not None and current.get("release") == release.get("release"):
            return 0
        try:
            verify(self.host, release)
            self.prepare(release)
        except Refused as refused:
            return self.refuse(release, str(refused))
        except Unreachable:
            print(
                f"{PROG}: the release bucket can't be reached; nothing changes",
                file=sys.stderr,
            )
            return 0
        try:
            started = self.start(release)
        except Unreachable:
            print(
                f"{PROG}: the registry can't be reached; nothing changes",
                file=sys.stderr,
            )
            return 0
        except Refused as refused:
            reason = str(refused)
            if (
                reason == "preflight_after"
                and current is not None
                and self.host in HOST_STEPS
            ):
                # The new tree's host step ran: the running release's puts its host files back.
                self.docker.host_step(self.host, self.tree(current))
            self.ensure()
            return self.refuse(release, "preflight")
        if started:
            if current is not None:
                self.keep("previous", current)
            self.keep("current", release)
            self.record(release, "deployed")
            print(f"{PROG}: {self.host} runs release {release['release']}")
            return 0
        back = current is not None and self.restart_cached(
            current, f"release {current['release']} didn't start again"
        )
        kind, outcome = (
            ("deploy_rolled_back", "rolled_back")
            if back
            else ("deploy_rollback_failed", "rollback_failed")
        )
        old = current.get("release") if current else "none"
        summary = (
            f"{self.host} returned from {release['release']} to {old}"
            if back
            else f"{self.host} couldn't start {release['release']} or return to {old}"
        )
        self.aws.publish(
            alert(
                kind,
                summary,
                [("release", str(release["release"])), ("previous", str(old))],
            )
        )
        self.record(release, outcome)
        return 1

    def refuse(self, release: dict, reason: str) -> int:
        """deploy_refused once per release and reason: the memory is the state folder's refused.json, which outlives
        a run and a reboot (group 5's fixes' review, 2)."""
        rid = str(release.get("release", "latest"))
        seen = self.recorded("refused") or {}
        key = f"{rid}:{reason}"
        if key in seen:
            print(f"{PROG}: release {rid} stays refused ({reason})", file=sys.stderr)
            return 1
        self.keep("refused", {**seen, key: self.now()})
        self.aws.publish(
            alert(
                "deploy_refused",
                f"{self.host} refused release {rid}",
                [("reason", reason), ("release", rid)],
            )
        )
        self.record(release, "refused")
        return 1

    def restart(self, service: str) -> int:
        current = self.recorded("current")
        if current is None or service not in verify(self.host, current):
            print(f"{PROG}: {service} isn't running here", file=sys.stderr)
            return 1
        env_files = [self.env_file, self.release_env(current)]
        ok = self.docker.compose(self.tree(current), env_files, ["restart", service])
        return 0 if ok else 1


def run(
    host: str,
    env_file: Path,
    state: Path,
    aws: Aws,
    docker: Docker,
    boot: bool = False,
    plugin: Path = PLUGIN,
    now: Callable[[], str] = lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    restart: str | None = None,
) -> int:
    deployer = Deployer(host, env_file, state, aws, docker, plugin, now)
    if restart is not None:
        return deployer.restart(restart)
    # The Author's hold (releases-deployer.md §4): nothing starts, restarts, or deploys while it stands.
    if (state / "hold").exists():
        print(f"{PROG}: held ({state / 'hold'}): nothing changes", file=sys.stderr)
        return 0
    return deployer.boot() if boot else deployer.check()


# ----------------------------------------------------------------------------------------------------------------------
# The host's own tools.


class AwsCli:
    """The AWS CLI with the instance role, through the host's egress proxy (the units' HTTPS_PROXY)."""

    def __init__(self) -> None:
        self.base = ["aws", "--region", "us-east-1", "--no-cli-pager"]

    def run(self, *args: str, data: bytes | None = None) -> subprocess.CompletedProcess:
        try:
            return subprocess.run(
                [*self.base, *args],
                input=data,
                capture_output=True,
                check=False,
                timeout=120,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise Unreachable(type(error).__name__) from error

    def get(self, bucket: str, key: str) -> bytes | None:
        done = self.run("s3", "cp", f"s3://{bucket}/{key}", "-")
        if done.returncode == 0:
            return done.stdout
        said = done.stderr.decode(errors="replace")
        if "404" in said or "NoSuchKey" in said or "Not Found" in said:
            return None
        raise Unreachable("s3")

    def account(self) -> str:
        registry = read_env(ENV_FILE).get("H4_REGISTRY", "")
        return registry.split(".", 1)[0]

    def publish(self, message: str) -> None:
        topic = f"arn:aws:sns:us-east-1:{self.account()}:h4-alerts"
        self.run("sns", "publish", "--topic-arn", topic, "--message", message)

    def login(self, registry: str) -> None:
        password = self.run("ecr", "get-login-password")
        if password.returncode != 0:
            raise Unreachable("ecr")
        subprocess.run(
            ["docker", "login", "--username", "AWS", "--password-stdin", registry],
            input=password.stdout,
            capture_output=True,
            check=False,
            timeout=60,
        )


class DockerCli:
    def preflight(self, host: str, tree: Path, env_file: Path, phase: str) -> bool:
        done = subprocess.run(
            preflight_argv(host, tree, env_file, phase), check=False, timeout=120
        )
        return done.returncode == 0

    def host_step(self, host: str, tree: Path) -> bool:
        """The class's host step, the release tree's own script, with the host's python."""
        done = subprocess.run(host_step_argv(host, tree), check=False, timeout=600)
        return done.returncode == 0

    def own_volume(self, name: str, uid: int) -> bool:
        """The named volume, made if it isn't, with its root owned by uid, which the service's image runs as."""
        made = subprocess.run(
            ["docker", "volume", "create", name],
            capture_output=True,
            check=False,
            timeout=60,
        )
        found = subprocess.run(
            ["docker", "volume", "inspect", "--format", "{{.Mountpoint}}", name],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )
        if (
            made.returncode != 0
            or found.returncode != 0
            or not found.stdout.strip().startswith("/var/lib/docker/")
        ):
            return False
        os.chown(found.stdout.strip(), uid, uid)
        return True

    @staticmethod
    def _compose(
        tree: Path, env_files: list[Path], args: list[str], capture: bool = False
    ) -> subprocess.CompletedProcess:
        command = ["docker", "compose", "-f", str(tree / "deploy" / "compose.yaml")]
        for path in env_files:
            command += ["--env-file", str(path)]
        return subprocess.run(
            [*command, *args],
            cwd=tree,
            env={
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                "HOME": "/root",
                "H4_TREE": str(tree),
            },
            capture_output=capture,
            text=capture,
            check=False,
            timeout=900,
        )

    def compose(self, tree: Path, env_files: list[Path], args: list[str]) -> bool:
        return self._compose(tree, env_files, args).returncode == 0

    def running(self, tree: Path, env_files: list[Path], services: list[str]) -> bool:
        done = self._compose(
            tree,
            env_files,
            ["ps", "--status", "running", "--services", *services],
            capture=True,
        )
        return done.returncode == 0 and set(services) <= set(done.stdout.split())


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="deployer.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--host", required=True, choices=sorted(HOST_CLASSES))
    parser.add_argument("--boot", action="store_true")
    parser.add_argument("--restart")
    parser.add_argument("--env-file", type=Path, default=ENV_FILE)
    parser.add_argument("--state", type=Path, default=STATE)
    args = parser.parse_args(argv)
    return run(
        args.host,
        env_file=args.env_file,
        state=args.state,
        aws=AwsCli(),
        docker=DockerCli(),
        boot=args.boot,
        restart=args.restart,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
