#!/usr/bin/env python3
"""A cloud host's deployer, the tunnel end's and EC2's (spec 001 FR-046 to FR-049; contracts/releases-deployer.md §1,
§3, §5, §6; research.md R-17; tasks.md T049, T088). Runs as root at boot (h4-stack.service, --boot) and every minute
(h4-deployer.timer), through the host's egress proxy.

    python3 -I -B deployer.py --host tunnel-end|ec2 [--boot] [--restart SERVICE]

Each run verifies the bucket's newest release (RELEASE_BUCKET) for this host's class and starts it, or rolls back, or
refuses, with an alert in contracts/aws-alerts.md §2's format that carries no address, account, or secret; and first
keeps the running release up, from the images the host holds. deploy/scripts/test_deployer.py's docstring and
contracts/releases-deployer.md §3 give each step. --restart restarts one service of the running release. The standard
library alone, in Python 3.9's syntax: it runs from the release's own tree, by the user data's first step
(deploy/scripts/deploy_first_step.py; plan.md §16, "From the release").
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
import urllib.request
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
    # EC2's (group 7; contracts/env-cloud.md §3): the whole topology but the model server and the local store.
    "ec2": (
        "edge",
        "web",
        "gateway",
        "otel-collector",
        "prometheus",
        "loki",
        "grafana",
        "langfuse-web",
        "langfuse-worker",
        "langfuse-db",
        "clickhouse",
        "valkey",
        "seaweedfs",
        "ec2-relay-block",
    ),
}
# EC2's images (group 7; plan.md §16, "Group 7, as built"). The two the release builds run under the laptop's own build
# names, which compose never pulls: the deployer pulls each by the release's digest and tags it for the release's commit
# (H4_REF). Every other shared service runs the account's registry's copy, by the lock's own tag and digest, which the
# deployer names in H4_IMAGE_<SERVICE>; compose's `:-` default, the pin itself, runs on every other host.
RELEASE_TAGS = {"gateway": "h4reet-gateway", "web": "h4reet-web"}
# The lock line each copy must match: its own, but the relay block's, which is edge's image.
COPIES = {"ec2-relay-block": "edge"}
# The hosts whose boot asks the bucket before anything starts, and start their last release only when it can't be read
# (FR-046, "before its stack takes visitors").
BUCKET_FIRST = ("ec2",)
# Each class's host step, from the release's tree, before compose pulls or starts anything (spec 001 tasks.md T164):
# the tunnel end's shared state, its data volume's mount, its key and certificate on tmpfs, and its backup's units and
# timer. A failed step is a failed start. So the host's later parts come with each release, never the user data.
HOST_STEPS = {
    "tunnel-end": ("deploy/hosts/tunnel-end/shared_state.py", "prepare"),
    # EC2's: the gateway's Bedrock credentials and their timer (group 7).
    "ec2": ("deploy/hosts/ec2/ec2_host.py", "prepare"),
}
# Where each host's deployer sends its own metrics (h4.deploy.events, h4.release.info; contracts/releases-deployer.md
# §6): EC2's collector through its relay block's forwarder; the tunnel end's collector at its address on the stack's
# egress bridge, as the backup timer finds it.
METRICS_AT = {"ec2": "http://10.42.0.20:4318/v1/metrics"}


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
DOCKER_ROOTS = ("/var/lib/docker/", "/srv/h4reet/data/docker/")
# main's exit for a run that refused or rolled back and alerted; anything else non-zero is a deployer that didn't run,
# which the first step alerts (deploy/scripts/deploy_first_step.py).
EXIT_ALERTED = 75
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")
HEX_RE = re.compile(r"[0-9a-f]{64}")
RELEASE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
REPOSITORY_RE = re.compile(r"h4reet/[a-z0-9-]{1,40}")
TAG_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
KEY_RE = re.compile(r"(releases|trees|tools)/[A-Za-z0-9._/-]{1,200}")


def tree_key(commit: str) -> str:
    """The one key a release's tree may have (contracts/releases-deployer.md §1; the deployer's review, nit 2)."""
    return f"trees/{commit}.tar.gz"


class Unreachable(Exception):
    """The bucket, or the AWS CLI, didn't answer."""


class Misconfigured(Exception):
    """The bucket answered, and refused: access denied, no such bucket, a bad name, or none in the env file. No network
    hiccup, so it is alerted once per boot rather than waited out in silence (the deployer's review, nit 5)."""


# What the AWS CLI's stderr says when S3 refused rather than wasn't reached.
REFUSALS = (
    b"(AccessDenied)",
    b"(403)",
    b"(NoSuchBucket)",
    b"InvalidBucketName",
    b"Invalid bucket name",
    b"(AllAccessDisabled)",
)


def s3_error(said: bytes) -> Exception:
    """The S3 failure the CLI's stderr names: Misconfigured for a refusal, Unreachable for anything else."""
    return (
        Misconfigured("s3") if any(r in said for r in REFUSALS) else Unreachable("s3")
    )


# The retry rule (the deployer's review, 1): every attempt is tried again at boot; on the timer, a failed start after a
# backoff that doubles from two minutes to an hour, and a refusal once a newer release comes. With nothing running,
# every run tries, so a host is never stranded by one failure. The Author's manual retry removes attempts.json
# (docs/runbooks/deploy.md).
RETRY_BASE_SECONDS = 120
RETRY_CAP_SECONDS = 3600
RETRIED = ("rolled_back", "rollback_failed")
# A refusal's wait: until a newer release deploys (which forgets every attempt) or a boot.
NEVER_SECONDS = 10**12


class Refused(Exception):
    """The release isn't one this host may run: the reason is one word, the alert's fact."""


class Aws(Protocol):
    def get(self, bucket: str, key: str) -> bytes | None: ...

    def publish(self, message: str) -> bool: ...

    def login(self, registry: str) -> None: ...


class Docker(Protocol):
    def compose(self, tree: Path, env_files: list[Path], args: list[str]) -> bool: ...

    def running(
        self, tree: Path, env_files: list[Path], services: list[str]
    ) -> bool: ...

    def own_volume(self, name: str, uid: int) -> bool: ...

    def host_step(self, host: str, tree: Path) -> bool: ...

    def preflight(self, host: str, tree: Path, env_file: Path, phase: str) -> bool: ...

    def retag(self, source: str, target: str) -> bool: ...


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
    if str(tree.get("key", "")) != tree_key(
        str(release["commit"])
    ) or not HEX_RE.fullmatch(str(tree.get("sha256", ""))):
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
        if (
            host in BUCKET_FIRST
            and name not in RELEASE_TAGS
            and not TAG_RE.fullmatch(str(service.get("tag", "")))
        ):
            raise Refused("digest")
        mine.append(name)
    if not mine:
        raise Refused("services")
    return [n for n in HOST_CLASSES[host] if n in mine]


def read_lock(tree: Path) -> dict[str, tuple[str, str]]:
    """deploy/images.lock's (tag, digest) by service, from the release's own tree."""
    out = {}
    path = tree / "deploy" / "images.lock"
    for line in path.read_text(encoding="utf-8").splitlines() if path.is_file() else []:
        fields = line.split()
        if len(fields) >= 4 and not line.startswith("#"):
            out[fields[0]] = (fields[2], fields[3])
    return out


def check_pins(host: str, release: dict, tree: Path) -> None:
    """Each copy EC2 runs is its lock line's image, by tag and digest, so both hosts run one digest (FR-048)."""
    if host not in BUCKET_FIRST:
        return
    lock = read_lock(tree)
    for name in verify(host, release):
        if name in RELEASE_TAGS:
            continue
        service = release["services"][name]
        if lock.get(COPIES.get(name, name)) != (
            str(service.get("tag")),
            str(service.get("digest")),
        ):
            raise Refused("pin")


def image_variable(name: str) -> str:
    return "H4_IMAGE_" + name.upper().replace("-", "_")


def metrics_payload(
    host: str, outcome: str | None, current: dict | None, at: float
) -> dict:
    """h4.deploy.events and h4.release.info, as OTLP/HTTP's JSON, every label a datapoint's (contracts/releases-
    deployer.md §6). Never an address, an account, or a digest."""

    def attrs(pairs: dict[str, str]) -> list[dict]:
        return [{"key": k, "value": {"stringValue": v}} for k, v in pairs.items()]

    stamp = str(int(at * 1_000_000_000))
    metrics = []
    if outcome is not None:
        metrics.append(
            {
                "name": "h4.deploy.events",
                "sum": {
                    "aggregationTemporality": 1,
                    "isMonotonic": True,
                    "dataPoints": [
                        {
                            "asInt": "1",
                            "timeUnixNano": stamp,
                            "attributes": attrs({"h4.host": host, "outcome": outcome}),
                        }
                    ],
                },
            }
        )
    if current is not None:
        labels = {
            "h4.host": host,
            "h4.release": str(current.get("release")),
            "h4.commit": str(current.get("commit"))[:12],
            "h4.started_by": "deployer",
        }
        metrics.append(
            {
                "name": "h4.release.info",
                "gauge": {
                    "dataPoints": [
                        {
                            "asInt": "1",
                            "timeUnixNano": stamp,
                            "attributes": attrs(labels),
                        }
                    ]
                },
            }
        )
    resource = {"service.name": "deployer", "service.namespace": "h4reet"}
    return {
        "resourceMetrics": [
            {
                "resource": {"attributes": attrs(resource)},
                "scopeMetrics": [
                    {"scope": {"name": "h4-deployer"}, "metrics": metrics}
                ],
            }
        ]
    }


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
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.host, self.env_file, self.state = host, env_file, state
        self.aws, self.docker, self.plugin, self.now = aws, docker, plugin, now
        self.clock = clock
        self.env = read_env(env_file)
        self.bucket = self.env.get("RELEASE_BUCKET", "")
        self.booting = False

    # The state folder: current.json, previous.json, each release's tree and env file, and the record.
    def recorded(self, name: str) -> dict | None:
        path = self.state / f"{name}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    # The alert memory, refused.json (the second review, I-B): an incident's key, kept only once SNS took its alert;
    # unreadable or unwritable, it is nothing seen, so it never silences an alert; a deploy forgets it.
    def seen(self) -> dict:
        try:
            got = self.recorded("refused")
        except (OSError, ValueError):
            return {}
        return got if isinstance(got, dict) else {}

    def memory(self, name: str) -> dict:
        try:
            got = self.recorded(name)
        except (OSError, ValueError):
            return {}
        return got if isinstance(got, dict) else {}

    def publish(self, message: str) -> bool:
        try:
            return self.aws.publish(message) is not False
        except (Unreachable, Misconfigured, OSError):
            return False

    def alert_once(self, key: str, message: str) -> bool:
        """The alert, once per key. One SNS refused waits in pending.json and goes on a later run (flush), so the
        memory only deduplicates: the attempt and its record never wait for SNS (the deployer's review, 2)."""
        if key in self.seen() or key in self.memory("pending"):
            return False
        if self.publish(message):
            try:
                self.keep("refused", {**self.seen(), key: self.now()})
            except OSError:
                pass
            return True
        try:
            self.keep("pending", {**self.memory("pending"), key: message})
        except OSError:
            pass
        return False

    def flush(self) -> None:
        """Each alert SNS refused earlier, again; kept in the memory once SNS takes it."""
        pending = self.memory("pending")
        if not pending:
            return
        for key, message in list(pending.items()):
            if self.publish(str(message)):
                pending.pop(key)
                try:
                    self.keep("refused", {**self.seen(), key: self.now()})
                except OSError:
                    pass
        try:
            self.keep("pending", pending)
        except OSError:
            pass

    def tried(self, key: str) -> bool:
        """An attempt that waits: a refusal until a newer release, a failed start for its backoff; at boot, none waits,
        and with nothing running every run tries (the deployer's review, 1)."""
        attempt = self.memory("attempts").get(key)
        if not isinstance(attempt, dict) or self.recorded("current") is None:
            return False
        if self.booting:
            return False
        try:
            return self.clock() < float(attempt.get("next_at", 0))
        except (TypeError, ValueError):
            return False

    def mark(self, key: str, outcome: str) -> None:
        """The attempt, whatever SNS does: its outcome, its count, and when it may be tried again."""
        attempts = self.memory("attempts")
        before = attempts.get(key) if isinstance(attempts.get(key), dict) else {}
        count = (
            int(before.get("count", 0) or 0) + 1
            if before.get("outcome") == outcome
            else 1
        )
        wait = (
            min(RETRY_BASE_SECONDS * 2 ** (count - 1), RETRY_CAP_SECONDS)
            if outcome in RETRIED
            else NEVER_SECONDS
        )
        attempts[key] = {
            "outcome": outcome,
            "count": count,
            "next_at": self.clock() + wait,
        }
        try:
            self.keep("attempts", attempts)
        except OSError:
            pass

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
        current = release if outcome == "deployed" else self.recorded("current")
        self.emit(outcome, current)

    def emit(self, outcome: str | None, current: dict | None) -> None:
        """The deployment's event and the running release, to the host's collector; a collector that isn't there
        loses them, and changes nothing else (FR-060)."""
        post = getattr(self.docker, "post_metrics", None)
        if post is None:
            return
        try:
            post(self.host, metrics_payload(self.host, outcome, current, self.clock()))
        except OSError:
            pass

    def tree(self, release: dict) -> Path:
        return self.state / "trees" / str(release["commit"])

    def release_env(self, release: dict) -> Path:
        lines = [f"H4_RELEASE={release['release']}"]
        registry = self.env.get("H4_REGISTRY", "")
        if self.host in BUCKET_FIRST:
            # EC2's: the release-built images under the laptop's build names, and the copies by H4_IMAGE_<SERVICE>.
            lines += [f"H4_REF={release['commit']}", "H4_WEB_SUFFIX="]
        for name in verify(self.host, release):
            service = release["services"][name]
            repository = str(service["repository"]).split("/", 1)[1]
            if self.host in BUCKET_FIRST:
                if name not in RELEASE_TAGS and name not in COPIES:
                    lines.append(
                        f"{image_variable(name)}={registry}/{service['repository']}:{service['tag']}@{service['digest']}"
                    )
                continue
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
        if pull and self.host in BUCKET_FIRST:
            # The laptop's two build names, by the release's digest and tagged for its commit; compose never pulls them.
            for name in [s for s in services if s in RELEASE_TAGS]:
                service = release["services"][name]
                source = f"{registry}/{service['repository']}@{service['digest']}"
                if not self.docker.retag(
                    source, f"{RELEASE_TAGS[name]}:{release['commit']}"
                ):
                    return False
        pulled = [s for s in services if s not in RELEASE_TAGS]
        if pull and not self.docker.compose(tree, env_files, ["pull", *pulled]):
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
        self.booting = True
        self.count_boot()
        current = self.recorded("current")
        if current is not None and self.host not in BUCKET_FIRST:
            self.restart_cached(current, "the last release didn't start at boot")
        return self.check()

    def bucket_first(self) -> bool:
        """EC2's boot: the bucket is asked before anything starts (FR-046)."""
        return self.booting and self.host in BUCKET_FIRST

    def unread_at_boot(self, reason: str) -> bool:
        """EC2's boot couldn't read the bucket: its last release starts, from its cached images, and the alert says
        whether it did (group 7's review B, I4). False if it didn't."""
        current = self.recorded("current")
        if current is None:
            return True
        started = self.restart_cached(current, "the last release didn't start at boot")
        rid = current["release"]
        self.alert_once(
            f"boot-{reason}@boot{self.boot_mark()}",
            alert(
                "deploy_refused",
                f"{self.host} started its last release, {rid}, without the release bucket"
                if started
                else f"{self.host} couldn't start its last release, {rid}, without the release bucket",
                [
                    ("reason", reason),
                    ("release", str(rid)),
                    ("started", "yes" if started else "no"),
                ],
            ),
        )
        return started

    def count_boot(self) -> None:
        try:
            boots = int((self.state / "boots").read_text(encoding="utf-8").strip() or 0)
        except (OSError, ValueError):
            boots = 0
        try:
            self.state.mkdir(parents=True, exist_ok=True)
            (self.state / "boots").write_text(f"{boots + 1}\n", encoding="utf-8")
        except OSError:
            pass

    def boot_mark(self) -> str:
        try:
            return (self.state / "boots").read_text(encoding="utf-8").strip() or "0"
        except OSError:
            return "0"

    def misconfigured(self) -> int:
        """The bucket refused, or the env file names none: one alert per boot, and nothing changes."""
        message = alert(
            "deploy_refused",
            f"{self.host} can't read the release bucket",
            [("reason", "bucket")],
        )
        self.alert_once(f"bucket@boot{self.boot_mark()}", message)
        print(
            f"{PROG}: the release bucket refuses, or none is named; nothing changes",
            file=sys.stderr,
        )
        return 1

    def check(self) -> int:
        self.flush()
        if not self.bucket_first():
            self.ensure()
        try:
            if not self.bucket:
                raise Misconfigured("RELEASE_BUCKET")
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
            if self.bucket_first() and not self.unread_at_boot("unreachable"):
                return 1
            return 0
        except Misconfigured:
            if self.bucket_first():
                self.unread_at_boot("bucket")
            return self.misconfigured()
        except (Refused, ValueError) as error:
            # Keyed on the pointer itself, so each new pointer's incident alerts (the second review, I-B).
            mark = hashlib.sha256(pointer or b"").hexdigest()[:16]
            return self.refuse(
                {"release": "latest"}, str(error) or "release", f"latest@{mark}"
            )
        current = self.recorded("current")
        if current is not None and current.get("release") == release.get("release"):
            if self.bucket_first():
                self.ensure()
            self.emit(None, current)
            return 0
        if self.bucket_first() and self.tried(str(release.get("release"))):
            self.ensure()
        if self.tried(str(release.get("release"))):
            print(
                f"{PROG}: release {release.get('release')} stays refused or rolled back; nothing changes"
            )
            return 1
        try:
            verify(self.host, release)
            self.prepare(release)
            check_pins(self.host, release, self.tree(release))
        except Refused as refused:
            return self.refuse(release, str(refused))
        except Misconfigured:
            return self.misconfigured()
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
                # The new tree's host step ran: the running release's puts its host files back, and says if it can't.
                and not self.docker.host_step(self.host, self.tree(current))
            ):
                reason = "preflight_after_restore_failed"
            self.ensure()
            return self.refuse(release, reason)
        if started:
            if current is not None:
                self.keep("previous", current)
            self.keep("current", release)
            for name in ("refused", "attempts"):
                try:
                    (self.state / f"{name}.json").unlink()
                except OSError:
                    pass
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
        message = alert(
            kind,
            summary,
            [("release", str(release["release"])), ("previous", str(old))],
        )
        # Recorded and marked whatever SNS does; the alert once per incident (the deployer's review, 1 and 2).
        self.record(release, outcome)
        self.mark(str(release["release"]), outcome)
        self.alert_once(f"{release['release']}:{outcome}", message)
        return 1

    def refuse(self, release: dict, reason: str, key: str | None = None) -> int:
        """deploy_refused: the attempt recorded and marked, its alert once per incident, which outlives a reboot."""
        rid = str(release.get("release", "latest"))
        attempt = key or rid
        if self.tried(attempt):
            print(f"{PROG}: release {rid} stays refused ({reason})", file=sys.stderr)
            return 1
        message = alert(
            "deploy_refused",
            f"{self.host} refused release {rid}",
            [("reason", reason), ("release", rid)],
        )
        self.record(release, "refused")
        self.mark(attempt, "refused")
        self.alert_once(key or f"{rid}:{reason}", message)
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
    clock: Callable[[], float] = time.time,
) -> int:
    deployer = Deployer(host, env_file, state, aws, docker, plugin, now, clock)
    if restart is not None:
        return deployer.restart(restart)
    # The Author's hold (releases-deployer.md §4): nothing starts, restarts, or deploys while it stands; alerted once
    # per hold, so a forgotten one doesn't stand unseen (the second review, nit 3).
    hold = state / "hold"
    if hold.exists():
        print(f"{PROG}: held ({hold}): nothing changes", file=sys.stderr)
        deployer.alert_once(
            f"hold@{hold.stat().st_mtime_ns}",
            alert(
                "deploy_refused",
                f"{host} is held: nothing starts or deploys until the hold goes",
                [("reason", "held")],
            ),
        )
        return 0
    return deployer.boot() if boot else deployer.check()


# ----------------------------------------------------------------------------------------------------------------------
# The host's own tools.


class AwsCli:
    """The AWS CLI with the instance role, through the host's egress proxy (the units' HTTPS_PROXY)."""

    def __init__(self, env_file: Path = ENV_FILE) -> None:
        self.env_file = env_file
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
        raise s3_error(done.stderr)

    def account(self) -> str:
        """The account, from the registry the env file it was given names (the deployer's review, 2)."""
        registry = read_env(self.env_file).get("H4_REGISTRY", "")
        return registry.split(".", 1)[0]

    def publish(self, message: str) -> bool:
        try:
            account = self.account()
        except OSError:
            return False
        topic = f"arn:aws:sns:us-east-1:{account}:h4-alerts"
        done = self.run("sns", "publish", "--topic-arn", topic, "--message", message)
        return done.returncode == 0

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
    def retag(self, source: str, target: str) -> bool:
        """An image by its digest, pulled, then tagged with the laptop's own build name for it."""
        for argv in (["docker", "pull", source], ["docker", "tag", source, target]):
            done = subprocess.run(argv, capture_output=True, check=False, timeout=900)
            if done.returncode:
                return False
        return True

    def post_metrics(self, host: str, payload: dict) -> None:
        url = METRICS_AT.get(host)
        if url is None:
            found = subprocess.run(
                [
                    "docker",
                    "inspect",
                    "--format",
                    '{{(index .NetworkSettings.Networks "h4reet-prod_egress").IPAddress}}',
                    "h4reet-prod-tunnel-end-collector-1",
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=30,
            )
            if found.returncode or not found.stdout.strip():
                return
            url = f"http://{found.stdout.strip()}:4318/v1/metrics"
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        opener.open(request, timeout=10).close()

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
            # Docker's data root: the default, or EC2's on its data volume (group 7's review B, nit 6).
            or not found.stdout.strip().startswith(DOCKER_ROOTS)
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
    code = run(
        args.host,
        env_file=args.env_file,
        state=args.state,
        aws=AwsCli(args.env_file),
        docker=DockerCli(),
        boot=args.boot,
        restart=args.restart,
    )
    # 75 for a check or a boot that refused or rolled back and alerted; a restart's failure stays 1, so its unit fails
    # (the key's revocation, FR-055; the deployer's review, 3).
    return EXIT_ALERTED if code == 1 and args.restart is None else code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
