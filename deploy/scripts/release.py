#!/usr/bin/env python3
"""The Author's release (spec 001 FR-039, FR-046 to FR-048; contracts/releases-deployer.md §1 and §2; research.md R-17;
tasks.md T088). His terminal alone: it pushes to the account's registry and its release bucket with his SSO session.

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/release.py
        --registry ACCOUNT.dkr.ecr.us-east-1.amazonaws.com --bucket BUCKET
        --compose-plugin FILE --compose-sha256 HEX [--public] [--redteam DIR]
        [--accept-gate SHA --reason TEXT]

It releases refs/heads/main's commit from a fresh git archive export of it, whatever the checkout's HEAD or untracked
files (group 7's review A, I-D), in this order, and nothing pushed before every check has passed:
  1. the gates: the commit is a merge whose message carries the gate's `gate: <tip> (` line for the branch tip it
     merged, which the Author's hand guard writes (contract §2.1; I-H), reporting a pass: 0 FAIL, 0 PENDING, no
     failing step, not DEGRADED, a `flaky:` segment's test names read as nothing (spec 036 FR-009). Only the Author's
     recorded exception, --accept-gate with refs/heads/main's own SHA in full and --reason, releases past a line that
     doesn't report a pass, never a DEGRADED one or one with a PENDING step, and release.json keeps the line and the
     reason (FR-010, FR-011; ADR 0060); when the release makes hello or the twin's turns public (--public), a passing
     red-team run of that very commit on each adapter that answers on either host,
     read from --redteam, outside the export, by each record's commit field; the Compose plugin is the file its
     SHA-256 names; and the room's site, in the web image built from the export and loaded, never pushed, holds no
     draft main doesn't approve, by main's tools/gates/content_check.py on the dist copied out of that image. Nothing
     of a checkout's node_modules runs here (I-E);
  2. one build of each project image from the export, for linux/amd64, and for linux/arm64 where its hosts name a
     Graviton host (EC2, the tunnel end), pushed by the release's id, `<time>-<the commit's first 12>`, so a rerun of
     a commit whose run pushed then refused never meets a tag that run left in the registry, whose tags are immutable
     (F6: specs/001-cloud-elevation/fixes/f6.md); and a copy of each upstream image a cloud host runs, to the
     account's registry, by its lock line's index digest, taken as it is where its tag already names that digest, and
     refused if the copy's digest isn't the lock's;
  3. the commit's tree, at trees/<commit>.tar.gz, and the plugin, by their SHA-256s; release.json, to the bucket and to
     ~/.local/state/h4reet/releases/; and the pointer, releases/latest.json, last.
The site's sync to the edge is group 8's (contracts/edge.md §5; plan.md §16). Exit 0 released, 1 refused, 2 couldn't
run.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
PROG = "release"
# The project's images: their Dockerfile, their repository, and what else their build takes.
BUILDS = {
    "gateway": ("services/gateway/Dockerfile", "h4reet/gateway"),
    "web": ("apps/web/Dockerfile", "h4reet/web"),
    "tunnel-end": ("deploy/tunnel/Dockerfile", "h4reet/tunnel"),
    # Group 8: the relay, on the tunnel end, from the repository root as the gateway's is.
    "relay": ("services/relay/Dockerfile", "h4reet/relay"),
    # Group 10: the public view's image, one build for the tunnel end's sink and EC2's publisher.
    "snapshot-sink": ("deploy/snapshot/Dockerfile", "h4reet/snapshot"),
    "ec2-snapshot-publisher": ("deploy/snapshot/Dockerfile", "h4reet/snapshot"),
}
# A copy's lock line, where it isn't its own name; and its repository, where that isn't its own name.
LOCK_LINES = {
    "tunnel-end-collector": "otel-collector",
    "shared-state": "gateway-state",
    "ec2-relay-block": "edge",
}
COPY_REPOSITORIES = {
    "tunnel-end-collector": "otel-collector",
    "ec2-relay-block": "edge",
}
GRAVITON = frozenset({"ec2", "tunnel-end"})
CLOUD_CLASSES = ("ec2", "tunnel-end")
# Each host's route keys, in order, in config/routing.yaml's schema 2 (spec 001 data-model.md §2.1): the laptop's
# primary and fallback, EC2's first and second. FR-039's four adapters are these, each on its own host (group 7's
# fixes' review, I1): a laptop run of Bedrock doesn't stand for EC2's, whose prompt route and model may differ.
ROUTE_KEYS = {"laptop": ("primary", "fallback"), "ec2": ("first", "second")}
# The release runs only as main's own code (group 7's fixes' review, I2): these three, the makefiles GNU make reads
# (GNUmakefile first; group 8's review A, nit 2) and itself, must be refs/heads/main's blobs. The check is
# self-referential: it catches a checkout parked on an agent's branch by mistake, not a copy of this file written to
# skip it, which only main's gate and the Author's merge keep out.
SELF_FILES = ("deploy/scripts/release.py", "Makefile", "GNUmakefile")
DIGEST_LINE = re.compile(r"^Digest:\s+(sha256:[0-9a-f]{64})\s*$", re.MULTILINE)
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
# The site in the web image, where its Dockerfile's runtime stage copies dist/.
SITE_IN_IMAGE = "/usr/share/nginx/html"

Runner = Callable[..., "tuple[int, str]"]
# The site's sync (group 8; contracts/edge.md §5): the Cache-Control the web image's nginx sends, by path
# (apps/web/nginx.conf's $h4_cache), and the bucket's name, the account's.
IMMUTABLE = "public, max-age=31536000, immutable"
SITE_BUCKET_RE = re.compile(r"h4reet-ai-site-[0-9]{12}")
DISTRIBUTION_RE = re.compile(r"E[A-Z0-9]{8,20}")
# W2 (group 8's review B, nit 1): the hashed assets and the content-addressed files a tab still open on the release
# before may load, kept a day from the release that first lacked them, by a ledger in the bucket, outside site/ (the
# distribution serves site/ alone) and under releases/, whose 90-day lifecycle a release's rewrite keeps from it.
RETIRABLE = ("site/assets/", "site/a/")
RETIRED_KEY = "releases/retired.json"
RETIRED_KEPT = datetime.timedelta(days=1)
STAMP = "%Y%m%dT%H%M%SZ"


class Refused(Exception):
    pass


@dataclass
class Options:
    registry: str
    bucket: str
    compose_plugin: Path
    compose_sha256: str
    public: bool
    local: Path
    redteam: Path
    # Group 8 (contract §2, step 5): the site's bucket and the distribution, once the edge exists (W2); without a
    # bucket the site isn't synced, and without a distribution nothing is invalidated.
    site_bucket: str | None = None
    distribution: str | None = None
    # Spec 036 (FR-010): the Author's recorded exception, refs/heads/main's merge by its full SHA and why its gate line,
    # which doesn't report a pass, is releasable. Both or neither (main()).
    accept_gate: str | None = None
    reason: str | None = None


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses read their own module from here
    spec.loader.exec_module(module)
    return module


def read_lock(root: Path) -> dict[str, tuple[str, str, str]]:
    out = {}
    for line in (
        (root / "deploy" / "images.lock").read_text(encoding="utf-8").splitlines()
    ):
        fields = line.split()
        if len(fields) >= 4 and not line.startswith("#"):
            out[fields[0]] = (fields[1], fields[2], fields[3])
    return out


def platforms(hosts: list[str]) -> list[str]:
    return ["linux/amd64"] + (["linux/arm64"] if set(hosts) & GRAVITON else [])


def cloud_services(root: Path) -> dict[str, list[str]]:
    """Each service a cloud host runs, with every host class that runs it: a class's, and the laptop's when the
    service has no profile of its own (contracts/releases-deployer.md §1's `hosts`)."""
    classes = _load(
        "preflight_for_release", root / "deploy" / "scripts" / "preflight.py"
    ).HOST_CLASSES
    services = yaml.safe_load(
        (root / "deploy" / "compose.yaml").read_text(encoding="utf-8")
    )["services"]
    out: dict[str, list[str]] = {}
    for cls in CLOUD_CLASSES:
        for name in classes[cls]:
            if name not in services:
                continue  # a later group's service (the relay, the sink)
            hosts = out.setdefault(name, [])
            hosts.append(cls)
            if not services[name].get("profiles") and "laptop" not in hosts:
                hosts.append("laptop")
    return {name: sorted(hosts) for name, hosts in out.items()}


def digest_of(runner: Runner, ref: str) -> str:
    code, out = runner(["docker", "buildx", "imagetools", "inspect", ref])
    m = DIGEST_LINE.search(out or "")
    if code != 0 or m is None:
        raise Refused(f"{ref} has no index digest the registry reports")
    return m.group(1)


def named_digest(runner: Runner, ref: str) -> str | None:
    """The index digest a tag names, or None where the registry reports none (no such tag, or no answer)."""
    code, out = runner(["docker", "buildx", "imagetools", "inspect", ref])
    m = DIGEST_LINE.search(out or "")
    return m.group(1) if code == 0 and m is not None else None


def required_runs(routing: dict) -> list[tuple[str, str]]:
    """(host, adapter) for each adapter each host's route names, the laptop's first (FR-039)."""
    hosts = (((routing or {}).get("envs") or {}).get("prod") or {}).get("hosts") or {}
    out = []
    for host, keys in ROUTE_KEYS.items():
        route = hosts.get(host) or {}
        for key in keys:
            adapter = route.get(key) if isinstance(route, dict) else None
            if isinstance(adapter, str) and adapter:
                out.append((host, adapter))
    return out


def blob_of(path: Path) -> str:
    """git's blob ID of a file's bytes, as `git hash-object` gives it, computed here so no git config runs."""
    data = path.read_bytes()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def check_self(runner: Runner, root: Path) -> None:
    """The release and its Makefile are main's (I2): their bytes here are refs/heads/main's blobs."""
    for rel in SELF_FILES:
        code, out = runner(["git", "rev-parse", "--verify", f"refs/heads/main:{rel}"])
        try:
            own = blob_of(root / rel)
        except OSError:
            own = ""
        if code != 0 or out.strip() != own:
            raise Refused(
                f"{rel} isn't refs/heads/main's: run the release from main's checkout, on main (group 7's fixes' review, I2)"
            )


# What the red team's live cases exercise (group 8's review B, I3; contracts/releases-deployer.md §2): the gateway,
# but its tests, the configuration and the corpus it reads, the cases, and this runner. An EC2 run is keyed by their
# SHA-256, so a release whose export holds the same bytes counts a run made on an earlier release, and a release that
# changes any of them needs a run of its own first. deploy/scripts/release.py carries the same function, and a test
# holds the two alike.
EXERCISED = (
    "services/gateway",
    # The root's build inputs the gateway's image copies (the fixes' review, nit 5).
    "package.json",
    "tsconfig.base.json",
    "package-lock.json",
    "config",
    "corpus",
    "redteam/cases",
    "redteam/run.py",
)


# Never what EC2 runs: the gateway's tests, and a checkout's own builds and caches, which an export doesn't hold
# (group 8's fixes' review, nit 1: the gateway whole, its Dockerfile, migrations, and build settings among it).
SKIPPED = frozenset({"test", "node_modules", "dist", "coverage", "__pycache__"})


def exercised(root: Path) -> str:
    """The SHA-256 of every file EXERCISED names under root, each as its path, a NUL, its bytes, in path order."""
    digest = hashlib.sha256()
    files: list[Path] = []
    for rel in EXERCISED:
        path = root / rel
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(
                p
                for p in path.rglob("*")
                if p.is_file() and not set(p.relative_to(root).parts) & SKIPPED
            )
    for path in sorted(files, key=lambda p: p.relative_to(root).as_posix()):
        digest.update(path.relative_to(root).as_posix().encode("utf-8") + b"\0")
        digest.update(path.read_bytes() + b"\0")
    return digest.hexdigest()


def check_redteam(
    folder: Path, commit: str, routing: dict | None = None, exercised: str | None = None
) -> None:
    """A passing run on each host's route adapters, never matched by its time: a run made after the merge needn't
    touch the checkout. The laptop's is of this very commit, by each record's own commit field (redteam/run.py's live
    record); a record without a host is the laptop's, as every run was before EC2's had its own (I1). EC2's is of this
    commit, or of an earlier release whose cases exercised the same bytes, by the record's `exercised` against the
    export's (group 8's review B, I3): EC2 runs a release only once it is released, so a public release of a commit
    that changes what the cases exercise needs EC2's run of a non-public release of it first, made while the laptop
    serves (contracts/releases-deployer.md §2)."""
    required = required_runs(routing or {})
    if not any(host == "ec2" for host, _ in required):
        raise Refused(
            "the red-team gate: the export's config/routing.yaml names no route for ec2, so EC2's adapters can't be "
            "checked (FR-039)"
        )
    newest: dict[tuple[str, str], dict] = {}
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            run = json.loads(path.read_text(encoding="utf-8"))
            finished = datetime.datetime.fromisoformat(str(run["finished"]))
        except (OSError, ValueError, KeyError, TypeError):
            continue
        host = str(run.get("host") or "laptop")
        same_commit = run.get("commit") == commit
        same_bytes = (
            host == "ec2"
            and exercised is not None
            and run.get("exercised") == exercised
        )
        if not (same_commit or same_bytes):
            continue
        pair = (host, str(run.get("adapter")))
        if pair not in newest or finished >= newest[pair]["_at"]:
            newest[pair] = {**run, "_at": finished}
    failing = [
        f"{host}/{adapter}"
        for host, adapter in required
        if (host, adapter) not in newest
        or newest[(host, adapter)].get("failed") != 0
        or newest[(host, adapter)].get("unjudged") != 0
        or not newest[(host, adapter)].get("cases")
    ]
    if failing:
        raise Refused(
            f"the red-team gate: no passing run of {commit[:12]} on {', '.join(failing)} (FR-039)"
        )


FLAKY = "flaky: "
DOCS_ONLY = "docs-only: "
FAILING = "failing: "
# The steps whose FAIL the Author's exception may take (spec 036 FR-010; the review of 9adbc455, finding 3): the long
# suites, where a known flake fails. A FAIL anywhere else, lint, gitleaks, the arrival, content, or disclosure check,
# main's refs, is never a flake's, and no reason releases it.
ACCEPTABLE = ("test", "evals", "redteam", "matrix-h", "image")
# How far the release walks main's first parents past docs-only merges for the last full run (finding 1).
WALK_LIMIT = 200


def judged(line: str) -> tuple[str, list[str]]:
    """The gate line's head, up to its counts, and the segments after it that say a step's status (tools/gates/gate,
    summary_line: `; failing: …`, `; docs-only: N files`, `; DEGRADED (--host): …`). A `; flaky: …` segment names the
    tests the gate's one retry passed (spec 036), so its text, test names, is never read as a status; the gate writes
    no `;` in it."""
    head, *segments = line.split("; ")
    return head, [s for s in segments if not s.startswith(FLAKY)]


def gate_passes(line: str) -> bool:
    """The line reports a pass, in the gate's own words: no failing step, none PENDING, and a full run, not --host's
    degraded one (group 7's fixes' review, nit 1)."""
    head, segments = judged(line)
    said = "; ".join([head, *segments])
    return not (
        "; failing:" in said
        or "DEGRADED" in said
        or not re.search(r"\b0 FAIL\b", head)
        or ("PENDING" in head and not re.search(r"\b0 PENDING\b", head))
    )


def docs_only(line: str) -> bool:
    """The line is a docs-only run's (`; docs-only: N files`, spec 036 FR-006), which skipped the suites: it certifies
    the branch's notes, never the code beneath them."""
    return any(s.startswith(DOCS_ONLY) for s in judged(line)[1])


def gate_line(runner: Runner, commit: str) -> tuple[str | None, str | None, str]:
    """The commit's gate line for the tip it merged, its first parent, and, when it has no line, why not, as the text
    that follows the commit's name."""
    code, out = runner(["git", "show", "-s", "--format=%P%n%B", commit])
    parents, _, body = (out or "").partition("\n")
    tips = parents.split()
    first = tips[0] if code == 0 and tips and COMMIT_RE.fullmatch(tips[0]) else None
    if code != 0 or len(tips) < 2 or not COMMIT_RE.fullmatch(tips[1]):
        return (
            None,
            first,
            " isn't a merge: a release is of a gated merge into main (contract §2.1)",
        )
    line = re.search(rf"^gate: {tips[1]} \(.*$", body, re.MULTILINE)
    if not line:
        return (
            None,
            first,
            f"'s message has no `gate: {tips[1][:12]}…` line: its branch didn't pass the gate",
        )
    return line.group(0), first, ""


def failing_steps(segments: list[str]) -> list[tuple[str, str]] | None:
    """Each step a line's `failing:` segment names, with its status, or None when it names none that reads."""
    named = [s for s in segments if s.startswith(FAILING)]
    if len(named) != 1:
        return None
    steps = []
    for item in named[0][len(FAILING) :].split(", "):
        found = re.fullmatch(r"(\S+) (FAIL|PENDING)", item)
        if found is None:
            return None
        steps.append((found.group(1), found.group(2)))
    return steps


def check_gate(
    runner: Runner,
    commit: str,
    accept: str | None = None,
    reason: str | None = None,
) -> dict:
    """The commit is a merge whose message carries the gate's line for the tip it merged (contract §2.1): the Author's
    hand guard writes `gate: <tip> (<branch>) by tools/gates/gate at …` in each merge's message.

    A docs-only run's line (spec 036) certifies no code, so a docs-only merge is releasable as the commit before it is
    (the review of 9adbc455, finding 1): the release walks main's first parents past docs-only merges that passed, to
    the last full run, and judges its line. A commit on the way that no gate ran on, one of the Author's own or a merge
    without a line, refuses, as it would on its own. The judged line must report a pass, unless the Author's recorded
    exception names main's tip, the commit being released, with a reason, and the line fails only in the long suites,
    where a known flake fails (FR-010; finding 3). What the release keeps in release.json's `gate`: the tip's line, the
    judged run's merge and line when the walk passed docs-only merges, and the exception when it was used (FR-011)."""
    line, parent, why = gate_line(runner, commit)
    if line is None:
        raise Refused(f"{commit[:12]}{why}")
    record: dict = {"line": line}
    judged_commit, judged_line, walked = commit, line, 0
    while gate_passes(judged_line) and docs_only(judged_line):
        walked += 1
        if parent is None or walked > WALK_LIMIT:
            raise Refused(
                f"{commit[:12]}'s gate line is a docs-only run's, and no full gate run was found in the "
                f"{WALK_LIMIT} first parents before it"
            )
        judged_commit = parent
        judged_line, parent, why = gate_line(runner, judged_commit)
        if judged_line is None:
            raise Refused(
                f"{commit[:12]}'s gate line is a docs-only run's, which ran no suite, so the release judges the last "
                f"full run before it, and {judged_commit[:12]}{why}"
            )
    where = f"{judged_commit[:12]}'s gate line"
    if judged_commit != commit:
        record["judged"] = {"merge": judged_commit, "line": judged_line}
        where += f", the last full run before the docs-only {commit[:12]},"
        print(
            f"{PROG}: {commit[:12]}'s gate line is a docs-only run's, which ran no suite, so the release judges "
            f"{judged_commit[:12]}'s, the last full run before it: {judged_line}"
        )
    if gate_passes(judged_line):
        if accept is not None:
            print(
                f"{PROG}: --accept-gate isn't needed: {where} reports a pass, so nothing is accepted"
            )
        return record
    if accept is None:
        raise Refused(
            f"{where} doesn't report a pass: a merge by hand past a failing gate isn't releasable without the Author's "
            "recorded exception (--accept-gate <main's SHA> --reason …; ADR 0060)"
        )
    # The exception (spec 036 FR-010): refs/heads/main's own commit, a full run's line, and a reason a person wrote.
    if accept != commit:
        raise Refused(
            f"--accept-gate names {accept[:12]}, not refs/heads/main's {commit[:12]}: the exception is for the merge "
            "being released, by its full SHA"
        )
    head, segments = judged(judged_line)
    if "DEGRADED" in "; ".join([head, *segments]):
        raise Refused(
            f"{where} is DEGRADED: its container phase, lint and the tests among it, never ran, so no exception "
            "releases it"
        )
    # The exception is for a FAIL, a known flake's (the intent). A PENDING step waits on a run only the Author makes,
    # stage E's prove or the agent-config evals, which no reason stands in for.
    waiting = re.search(r"\b(\d+) PENDING\b", head)
    if (waiting and int(waiting.group(1))) or any(
        s.startswith(FAILING) and "PENDING" in s for s in segments
    ):
        raise Refused(
            f"{where} has a PENDING step, which waits on a run of the Author's own: no exception releases it; make "
            "that run, gate the branch again, and merge"
        )
    steps = failing_steps(segments)
    if steps is None:
        raise Refused(
            f"{where} doesn't name its failing steps, so no exception can tell a flake's FAIL from another"
        )
    others = [f"{name} {status}" for name, status in steps if name not in ACCEPTABLE]
    if others:
        raise Refused(
            f"{where} fails in {', '.join(others)}: the exception takes a known flake's FAIL in test, evals, "
            "redteam, matrix-h, or image alone (the review of 9adbc455, finding 3)"
        )
    why = (reason or "").strip()
    if not why or any(not ch.isprintable() for ch in why):
        raise Refused(
            "--accept-gate needs --reason: why this failing line is releasable, in printable text"
        )
    print(
        f"{PROG}: warning: releasing {commit[:12]} past {where}, which doesn't report a pass, by the Author's "
        f"exception: {judged_line}; reason: {why}",
        file=sys.stderr,
    )
    record["accepted"] = {"merge": commit, "reason": why}
    return record


def export_tree(runner: Runner, commit: str, work: Path) -> Path:
    """The commit's tree, by git archive, into work/src, with tarfile's data filter: no member outside the folder, no
    link out of it, no device."""
    work.mkdir(parents=True, exist_ok=True)
    archive, src = work / "src.tar", work / "src"
    if (
        runner(["git", "archive", "--format=tar", "--output", str(archive), commit])[0]
        != 0
    ):
        raise Refused("the commit's tree didn't export")
    src.mkdir()
    try:
        with tarfile.open(str(archive)) as tar:
            tar.extractall(str(src), filter="data")
    except tarfile.TarError as error:
        raise Refused(f"the export holds what it may not: {error}") from error
    return src


def check_site(
    runner: Runner, src: Path, root: Path, commit: str, contexts, work: Path
) -> None:
    """The room's site as the web image holds it: built from the export and loaded, never pushed, its dist copied
    out, and main's content check run on that copy (spec 002's rule)."""
    tag = f"h4reet-release-check:{commit}"
    build = [
        "docker",
        "buildx",
        "build",
        "--load",
        "--platform",
        "linux/amd64",
        "--file",
        str(src / BUILDS["web"][0]),
        "--tag",
        tag,
        *contexts("web", src),
        str(src),
    ]
    if runner(build)[0] != 0:
        raise Refused("the room's site didn't build")
    code, out = runner(["docker", "create", tag])
    container = (out or "").strip()
    if code != 0 or not re.fullmatch(r"[0-9a-f]{12,64}", container):
        raise Refused("the room's image gave no container to copy its site from")
    dist = work / "dist"
    try:
        if runner(["docker", "cp", f"{container}:{SITE_IN_IMAGE}", str(dist)])[0]:
            raise Refused("the room's site didn't copy out of its image")
    finally:
        runner(["docker", "rm", container])
    content = [
        "python3",
        "-I",
        "-B",
        "-X",
        "pycache_prefix=/dev/null",
        str(src / "tools" / "gates" / "content_check.py"),
        "--tree",
        str(src),
        "--dist",
        str(dist),
        "--repo",
        str(root),
    ]
    if runner(content)[0] != 0:
        raise Refused(
            "the room's site holds a draft or a placeholder main doesn't approve (spec 002's rule)"
        )


def sync_site(
    runner: Runner, dist: Path, opts: Options, commit: str, stamp: str
) -> None:
    """Contract §2, step 5 (contracts/edge.md §5): the site the release checked, to releases/<commit>/, each file with
    the Cache-Control the web image's nginx sends, each GLB's gzip copy under its own name with Content-Encoding gzip
    as gzip_static serves it, and never the PDF's text file; then that copy to site/, its assets first, then the rest,
    deleting what the release lacks but the sink's status/latest.json and the assets; then one invalidation of the
    distribution, whose failure is a warning that names its recovery, since site/ already holds the release; then the
    assets the release lacks retired, each kept a day (W2; group 8's review B, nit 1)."""
    bucket = opts.site_bucket
    assert bucket is not None
    if not SITE_BUCKET_RE.fullmatch(bucket):
        raise Refused(
            "the site's bucket isn't the account's (h4reet-ai-site-<the account's ID>)"
        )
    if opts.distribution is not None and not DISTRIBUTION_RE.fullmatch(
        opts.distribution
    ):
        raise Refused("the distribution isn't a CloudFront distribution's ID")
    copy = f"s3://{bucket}/releases/{commit}/"
    steps: list[list[str]] = [
        ["aws", "s3", "sync", str(dist), copy, "--no-progress", "--exclude", "*", "--include", "assets/*",
         "--include", "a/*", "--exclude", "a/*.gz", "--cache-control", IMMUTABLE],
    ]  # fmt: skip
    for gz in sorted((dist / "a").glob("*.gz")) if (dist / "a").is_dir() else []:
        steps.append(
            ["aws", "s3", "cp", "--no-progress", "--content-encoding", "gzip", "--content-type", "model/gltf-binary",
             "--cache-control", IMMUTABLE, str(gz), f"{copy}a/{gz.name[:-3]}"]
        )  # fmt: skip
    steps += [
        ["aws", "s3", "sync", str(dist), copy, "--no-progress", "--exclude", "assets/*", "--exclude", "a/*",
         "--exclude", "*.pdf.txt", "--cache-control", "no-cache"],
        # site/: the assets first, never deleting, so no page names an asset that isn't there yet; then the rest,
        # deleting what the release lacks, but the snapshot sink's status/latest.json and the assets, which
        # retire_assets keeps a day for the tabs still open on the release before (W2). Only the sink's one file is
        # spared: an excluded key is neither uploaded nor deleted, so `status/*` kept the build's own status/ page out
        # of site/ (W2's review, I1).
        ["aws", "s3", "sync", copy, f"s3://{bucket}/site/", "--no-progress", "--exclude", "*", "--include", "assets/*",
         "--include", "a/*"],
        ["aws", "s3", "sync", copy, f"s3://{bucket}/site/", "--no-progress", "--delete", "--exclude",
         "status/latest.json", "--exclude", "assets/*", "--exclude", "a/*"],
    ]  # fmt: skip
    for argv in steps:
        if runner(argv)[0] != 0:
            raise Refused(
                "the site didn't sync, and the pointer still names the release before: run `make release` again, "
                "which syncs the same copy whole (docs/runbooks/deploy.md, Act 4)"
            )
    if opts.distribution is not None:
        invalidate = [
            "aws",
            "cloudfront",
            "create-invalidation",
            "--distribution-id",
            opts.distribution,
            "--paths",
            "/*",
        ]
        if runner(invalidate)[0] != 0:
            # site/ holds the release already, so the pointer follows it; the edge serves its cached copies until
            # they expire, or until the invalidation runs (docs/runbooks/deploy.md, Act 4, the release's site warnings).
            print(
                f"{PROG}: warning: the invalidation failed; the edge may serve the release before until its cache "
                f"expires. Run, with your session: aws cloudfront create-invalidation --distribution-id "
                f"{opts.distribution} --paths '/*'"
            )
    retire_assets(runner, bucket, dist, stamp)


def released_assets(dist: Path) -> set[str]:
    """The keys under site/ the release's sync gives its assets and content-addressed files: a/'s gzip copies under
    their names without .gz, as sync_site uploads them."""
    keys: set[str] = set()
    for folder in ("assets", "a"):
        base = dist / folder
        for path in sorted(base.rglob("*")) if base.is_dir() else []:
            if not path.is_file():
                continue
            rel = path.relative_to(dist).as_posix()
            if folder == "a" and rel.endswith(".gz"):
                if path.parent != base:
                    continue  # sync_site uploads a/'s top-level gzip copies alone
                rel = rel[:-3]
            keys.add(f"site/{rel}")
    return keys


def _age(stamp: str, retired: object) -> datetime.timedelta | None:
    """retired's age at stamp, both UTC in STAMP's form; None for a value that isn't one."""
    utc = datetime.timezone.utc
    try:
        now = datetime.datetime.strptime(stamp, STAMP).replace(tzinfo=utc)
        then = datetime.datetime.strptime(str(retired), STAMP).replace(tzinfo=utc)
    except ValueError:
        return None
    return now - then


def retire_assets(runner: Runner, bucket: str, dist: Path, stamp: str) -> None:
    """The assets and content-addressed files under site/ the release lacks, each kept a day from the release that
    first lacked it, then deleted (W2; group 8's review B, nit 1). The ledger, RETIRED_KEY, holds each one's first
    release's time. Whatever fails deletes nothing it can't account for, and is a warning: the site is already
    released."""
    listing = [
        "aws", "s3api", "list-objects-v2", "--bucket", bucket, "--prefix", "site/", "--query", "Contents[].Key",
        "--output", "json",
    ]  # fmt: skip
    code, out = runner(listing)
    try:
        # The CLI lists an empty prefix as null.
        keys = (json.loads(out) or []) if code == 0 else None
    except ValueError:
        keys = None
    if keys is not None and not (
        isinstance(keys, list) and all(isinstance(k, str) for k in keys)
    ):
        keys = None
    if keys is None:
        print(
            f"{PROG}: warning: the retired assets weren't listed, so none was deleted; the next release retires them"
        )
        return
    code, out = runner(
        ["aws", "s3", "cp", "--no-progress", f"s3://{bucket}/{RETIRED_KEY}", "-"]
    )
    ledger: dict[str, str] = {}
    if code == 0:
        try:
            read = json.loads(out)
        except ValueError:
            read = None
        if isinstance(read, dict):
            ledger = {str(k): str(v) for k, v in read.items()}
        else:
            print(
                f"{PROG}: warning: the ledger of retired assets was unreadable; each asset the release lacks is kept "
                "a day from now"
            )
    released = released_assets(dist)
    retired = {
        k: (ledger[k] if _age(stamp, ledger.get(k)) is not None else stamp)
        for k in keys
        if k.startswith(RETIRABLE) and k not in released
    }
    zero = datetime.timedelta(0)
    due = sorted(
        k for k, then in retired.items() if (_age(stamp, then) or zero) >= RETIRED_KEPT
    )
    kept_back: set[str] = set()
    for i in range(0, len(due), 1000):
        batch = due[i : i + 1000]
        spec = dist.parent / f"retire-{i // 1000}.json"
        spec.write_text(
            json.dumps({"Objects": [{"Key": k} for k in batch], "Quiet": True}),
            encoding="utf-8",
        )
        code, out = runner(
            [
                "aws",
                "s3api",
                "delete-objects",
                "--bucket",
                bucket,
                "--delete",
                f"file://{spec}",
            ]
        )
        if code != 0:
            kept_back |= set(batch)
            continue
        try:
            errors = (json.loads(out) if out.strip() else {}).get("Errors") or []
        except (ValueError, AttributeError):
            errors = [{"Key": k} for k in batch]
        kept_back |= {str(e.get("Key")) for e in errors if isinstance(e, dict)}
    if kept_back:
        n = len(kept_back)
        what = "1 retired asset wasn't" if n == 1 else f"{n} retired assets weren't"
        print(f"{PROG}: warning: {what} deleted; the next release tries again")
    left = {k: v for k, v in retired.items() if k not in set(due) - kept_back}
    body = dist.parent / "retired.json"
    body.write_text(json.dumps(left, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if (
        runner(
            [
                "aws",
                "s3",
                "cp",
                "--no-progress",
                str(body),
                f"s3://{bucket}/{RETIRED_KEY}",
            ]
        )[0]
        != 0
    ):
        print(
            f"{PROG}: warning: the ledger of retired assets wasn't written; the next release keeps each a day from then"
        )


def run(
    opts: Options,
    runner: Runner,
    root: Path = ROOT,
    now: Callable[[], str] = lambda: time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()),
    contexts: Callable[[str, Path], list[str]] | None = None,
    exported: Callable[[str, Path], Path] | None = None,
    routing_of: Callable[[Path], dict] | None = None,
) -> int:
    contexts = contexts or (lambda name, src: [])
    exported = exported or (lambda commit, work: export_tree(runner, commit, work))
    # The export's own routes, which the red-team gate reads each host's adapters from (I1).
    routing_of = routing_of or (
        lambda src: (
            yaml.safe_load(
                (src / "config" / "routing.yaml").read_text(encoding="utf-8")
            )
            or {}
        )
    )
    work = Path(tempfile.mkdtemp(prefix="h4-release-"))
    try:
        return released(opts, runner, root, now, contexts, exported, work, routing_of)
    except Refused as refused:
        print(
            f"{PROG}: refused, nothing pushed past the step that refused: {refused}",
            file=sys.stderr,
        )
        return 1
    except (OSError, subprocess.TimeoutExpired) as error:
        print(f"{PROG}: couldn't run: {type(error).__name__}", file=sys.stderr)
        return 2
    finally:
        shutil.rmtree(str(work), ignore_errors=True)


def released(
    opts: Options,
    runner: Runner,
    root: Path,
    now,
    contexts,
    exported,
    work: Path,
    routing_of,
) -> int:
    # 1. The gates, before anything is built or pushed: refs/heads/main's commit, never the checkout's HEAD.
    check_self(runner, root)
    head = runner(["git", "rev-parse", "--verify", "refs/heads/main"])[1].strip()
    if not COMMIT_RE.fullmatch(head):
        raise Refused("refs/heads/main doesn't name a commit (FR-046)")
    gate = check_gate(runner, head, opts.accept_gate, opts.reason)
    plugin = opts.compose_plugin.read_bytes()
    if hashlib.sha256(plugin).hexdigest() != opts.compose_sha256:
        raise Refused("the Compose plugin isn't the file its SHA-256 names")
    src = exported(head, work)
    if opts.public:
        check_redteam(opts.redteam, head, routing_of(src), exercised(src))
    check_site(runner, src, root, head, contexts, work)

    # 2. The images, from the export. The release's id, taken once, after every gate: each build's tag, release.json's
    # own, and its key. The registry's tags are immutable and a rebuild's digest isn't the build before's, so a tag of
    # the commit's alone left a rerun refused by the tags a refused run had pushed (F6).
    rid = f"{now()}-{head[:12]}"
    # The review of 9adbc455, finding 4: the gate's record, an accepted line and its reason among it, before anything is
    # pushed or synced, so a run that stops part way, the site already synced, still leaves it beside the releases.
    opts.local.mkdir(parents=True, exist_ok=True)
    (opts.local / f"{rid}.gate.json").write_text(
        json.dumps(
            {"release": rid, "commit": head, "gate": gate}, indent=2, sort_keys=True
        )
        + "\n",
        encoding="utf-8",
    )
    hosts = cloud_services(src)
    lock = read_lock(src)
    services: dict[str, dict] = {}
    built: dict[str, dict] = {}
    for name, its_hosts in hosts.items():
        if name in BUILDS:
            dockerfile, repository = BUILDS[name]
            # One build a repository: a second service of the same image takes its digest (group 10's snapshot).
            if repository in built and set(platforms(its_hosts)) <= set(
                built[repository]["platforms"]
            ):
                services[name] = {**built[repository], "hosts": its_hosts}
                continue
            ref = f"{opts.registry}/{repository}:{rid}"
            argv = [
                "docker",
                "buildx",
                "build",
                "--push",
                "--platform",
                ",".join(platforms(its_hosts)),
                "--file",
                str(src / dockerfile),
                "--tag",
                ref,
                *contexts(name, src),
                str(src / Path(dockerfile).parent if name == "tunnel-end" else src),
            ]
            if runner(argv)[0] != 0:
                raise Refused(f"{name}'s image didn't build")
            services[name] = {
                "repository": repository,
                "digest": digest_of(runner, ref),
                "hosts": its_hosts,
                "platforms": platforms(its_hosts),
            }
            built[repository] = services[name]
            continue
        line = LOCK_LINES.get(name, name)
        if line not in lock:
            raise Refused(f"deploy/images.lock has no line for {line}")
        upstream, tag, digest = lock[line]
        repository = f"h4reet/{COPY_REPOSITORIES.get(name, name)}"
        target = f"{opts.registry}/{repository}:{tag}"
        # The lock's tag, the same on every release: where it already names the lock's digest, as an earlier release's
        # or a refused run's copy left it, it is taken without a second put (F6). One that names another digest still
        # refuses: the put fails, or the digest read after it isn't the lock's.
        if named_digest(runner, target) != digest:
            create = [
                "docker",
                "buildx",
                "imagetools",
                "create",
                "--tag",
                target,
                f"{upstream}@{digest}",
            ]
            if runner(create)[0] != 0 or digest_of(runner, target) != digest:
                raise Refused(f"{name}'s copy isn't the lock's index digest")
        services[name] = {
            "repository": repository,
            "tag": tag,
            "digest": digest,
            "hosts": its_hosts,
        }

    # The site, as the release checked it, before release.json and the pointer (contract §2, step 5; group 8).
    if opts.site_bucket is not None:
        sync_site(runner, work / "dist", opts, head, now())
    else:
        print(
            f"{PROG}: the site isn't synced: no site bucket named (the edge is W2's; contracts/edge.md §5)"
        )

    # 3. The tree, the plugin, release.json, and the pointer last.
    tree = work / "tree.tar.gz"
    tree.write_bytes(b"")
    if (
        runner(["git", "archive", "--format=tar.gz", "--output", str(tree), head])[0]
        != 0
    ):
        raise Refused("the commit's tree didn't export")
    tree_sha = hashlib.sha256(tree.read_bytes()).hexdigest()
    release = {
        "release": rid,
        "commit": head,
        "built_at": now(),
        "built_by": "author",
        "public": opts.public,
        # Spec 036 (FR-011): the merge's gate line, and the Author's exception when it was used.
        "gate": gate,
        "tree": {"key": f"trees/{head}.tar.gz", "sha256": tree_sha},
        "compose": {
            "key": f"tools/docker-compose-{opts.compose_sha256[:12]}",
            "sha256": opts.compose_sha256,
        },
        "services": services,
    }
    body = work / "release.json"
    body.write_text(
        json.dumps(release, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    pointer = work / "latest.json"
    pointer.write_text(json.dumps({"release": rid}) + "\n", encoding="utf-8")
    for source, key in (
        (tree, release["tree"]["key"]),
        (opts.compose_plugin, release["compose"]["key"]),
        (body, f"releases/{rid}/release.json"),
        (pointer, "releases/latest.json"),
    ):
        if (
            runner(
                [
                    "aws",
                    "s3",
                    "cp",
                    "--no-progress",
                    str(source),
                    f"s3://{opts.bucket}/{key}",
                ]
            )[0]
            != 0
        ):
            raise Refused(
                f"{key} didn't reach the bucket; the pointer still names the release before"
            )
    opts.local.mkdir(parents=True, exist_ok=True)
    (opts.local / f"{rid}.json").write_text(
        body.read_text(encoding="utf-8"), encoding="utf-8"
    )
    (opts.local / "latest-release.json").write_text(
        body.read_text(encoding="utf-8"), encoding="utf-8"
    )
    print(f"{PROG}: released {rid}, {len(services)} services")
    return 0


def subprocess_runner(argv: list[str], env: dict | None = None) -> tuple[int, str]:
    # Replace objects off for every git command it runs, the gate's check and the export among them (nit 1).
    env = {**(os.environ if env is None else env), "GIT_NO_REPLACE_OBJECTS": "1"}
    done = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        check=False,
        env=env,
        cwd=ROOT,
        timeout=3600,
    )
    return done.returncode, done.stdout


def web_contexts(name: str, src: Path) -> list[str]:
    """The room's named build contexts, as deploy/scripts/web_image.py gives them on a host stack, without drafts: main's
    policy files, which web_image.py reads from the repository's refs/heads/main itself, and the export's assets."""
    if name != "web":
        return []
    script = src / "deploy" / "scripts" / "web_image.py"
    wi = _load("web_image_for_release", script)
    # Spec 030 (plan.md §R-D4, rework 3, R-5): an export from before the list is refused by name, before any build.
    pairs = getattr(wi, "ASSET_CONTEXTS", None)
    if not isinstance(pairs, tuple) or not all(
        isinstance(pair, tuple)
        and len(pair) == 2
        and all(isinstance(part, str) for part in pair)
        for pair in pairs
    ):
        raise Refused(
            f"{script} has no ASSET_CONTEXTS: an export from before spec 030's ui-assets context can't be released"
            " by this release.py"
        )
    folder = wi.write_policy(wi.read_policy(ROOT))
    out = ["--build-arg", "ROOM_DRAFTS=", "--build-context", f"policy={folder}"]
    for folder_name, context in pairs:
        found = wi.room_assets(src, folder_name)
        if found is not None:
            out += ["--build-context", f"{context}={found}"]
    return out


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="release.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--registry", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--compose-plugin", required=True, type=Path)
    parser.add_argument("--compose-sha256", required=True)
    parser.add_argument("--public", action="store_true")
    # The red-team runs: the checkout's redteam/history by default, outside the export the release builds from.
    parser.add_argument("--redteam", type=Path, default=ROOT / "redteam" / "history")
    # Group 8: the site's bucket and the distribution, from W2's apply on (contracts/edge.md §5).
    parser.add_argument("--site-bucket")
    parser.add_argument("--distribution")
    # Spec 036 (FR-010): the Author's recorded exception, both or neither: refs/heads/main's merge by its full SHA, and
    # why its gate line, which doesn't report a pass, is releasable.
    parser.add_argument("--accept-gate", metavar="SHA")
    parser.add_argument("--reason")
    args = parser.parse_args(argv)
    if (args.accept_gate is None) != (args.reason is None):
        parser.error("--accept-gate and --reason come together")
    if args.accept_gate is not None and not COMMIT_RE.fullmatch(args.accept_gate):
        parser.error(
            "--accept-gate takes refs/heads/main's merge by its full SHA: git rev-parse refs/heads/main"
        )
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            f"{PROG}: the Author's, in his terminal: it pushes with his SSO session",
            file=sys.stderr,
        )
        return 2
    if not re.fullmatch(
        r"[0-9]{12}\.dkr\.ecr\.us-east-1\.amazonaws\.com", args.registry
    ) or not re.fullmatch(r"h4reet-ai-releases-[a-z0-9-]{1,40}", args.bucket):
        print(
            f"{PROG}: the registry or the bucket isn't the account's", file=sys.stderr
        )
        return 2
    opts = Options(
        args.registry,
        args.bucket,
        args.compose_plugin,
        args.compose_sha256,
        args.public,
        Path.home() / ".local" / "state" / "h4reet" / "releases",
        args.redteam,
        args.site_bucket,
        args.distribution,
        args.accept_gate,
        args.reason,
    )
    return run(opts, subprocess_runner, contexts=web_contexts)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
