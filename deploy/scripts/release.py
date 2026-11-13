#!/usr/bin/env python3
"""The Author's release (spec 001 FR-039, FR-046 to FR-048; contracts/releases-deployer.md §1 and §2; research.md R-17;
tasks.md T088). His terminal alone: it pushes to the account's registry and its release bucket with his SSO session.

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/release.py
        --registry ACCOUNT.dkr.ecr.us-east-1.amazonaws.com --bucket BUCKET
        --compose-plugin FILE --compose-sha256 HEX [--public] [--redteam DIR]

It releases refs/heads/main's commit from a fresh git archive export of it, whatever the checkout's HEAD or untracked
files (group 7's review A, I-D), in this order, and nothing pushed before every check has passed:
  1. the gates: the commit is a merge whose message carries the gate's `gate: <tip> (` line for the branch tip it
     merged, which the Author's hand guard writes (contract §2.1; I-H); when the release makes hello or the twin's
     turns public (--public), a passing red-team run of that very commit on each adapter that answers on either host,
     read from --redteam, outside the export, by each record's commit field; the Compose plugin is the file its
     SHA-256 names; and the room's site, in the web image built from the export and loaded, never pushed, holds no
     draft main doesn't approve, by main's tools/gates/content_check.py on the dist copied out of that image. Nothing
     of a checkout's node_modules runs here (I-E);
  2. one build of each project image from the export, for linux/amd64, and for linux/arm64 where its hosts name a
     Graviton host (EC2, the tunnel end), pushed by the commit; and a copy of each upstream image a cloud host runs, to
     the account's registry, by its lock line's index digest, refused if the copy's digest isn't the lock's;
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


def check_gate(runner: Runner, commit: str) -> None:
    """The commit is a merge whose message carries the gate's line for the tip it merged (contract §2.1): the Author's
    hand guard writes `gate: <tip> (<branch>) by tools/gates/gate at …` in each merge's message."""
    code, out = runner(["git", "show", "-s", "--format=%P%n%B", commit])
    parents, _, body = (out or "").partition("\n")
    tips = parents.split()
    if code != 0 or len(tips) < 2 or not COMMIT_RE.fullmatch(tips[1]):
        raise Refused(
            f"{commit[:12]} isn't a merge: a release is of a gated merge into main (contract §2.1)"
        )
    line = re.search(rf"^gate: {tips[1]} \(.*$", body, re.MULTILINE)
    if not line:
        raise Refused(
            f"{commit[:12]}'s message has no `gate: {tips[1][:12]}…` line: its branch didn't pass the gate"
        )
    # The line must report a pass, in the gate's own words (tools/gates/gate, summary_line): no failing step, none
    # PENDING, and a full run, not --host's degraded one (group 7's fixes' review, nit 1).
    said = line.group(0)
    if (
        "; failing:" in said
        or "DEGRADED" in said
        or not re.search(r"\b0 FAIL\b", said)
        or ("PENDING" in said and not re.search(r"\b0 PENDING\b", said))
    ):
        raise Refused(
            f"{commit[:12]}'s gate line doesn't report a pass: a merge by hand past a failing gate isn't releasable"
        )


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


def sync_site(runner: Runner, dist: Path, opts: Options, commit: str) -> None:
    """Contract §2, step 5 (contracts/edge.md §5): the site the release checked, to releases/<commit>/, each file with
    the Cache-Control the web image's nginx sends, each GLB's gzip copy under its own name with Content-Encoding gzip
    as gzip_static serves it, and never the PDF's text file; then that copy to site/, deleting what the release lacks
    but the public view's status/; then one invalidation of the distribution."""
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
        ["aws", "s3", "sync", copy, f"s3://{bucket}/site/", "--no-progress", "--delete", "--exclude", "status/*"],
    ]  # fmt: skip
    for argv in steps:
        if runner(argv)[0] != 0:
            raise Refused(
                "the site didn't sync; the pointer still names the release before"
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
            raise Refused(
                "the site synced, but its invalidation failed: run it again; the pointer names the release before"
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
    check_gate(runner, head)
    plugin = opts.compose_plugin.read_bytes()
    if hashlib.sha256(plugin).hexdigest() != opts.compose_sha256:
        raise Refused("the Compose plugin isn't the file its SHA-256 names")
    src = exported(head, work)
    if opts.public:
        check_redteam(opts.redteam, head, routing_of(src), exercised(src))
    check_site(runner, src, root, head, contexts, work)

    # 2. The images, from the export.
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
            ref = f"{opts.registry}/{repository}:{head}"
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
        sync_site(runner, work / "dist", opts, head)
    else:
        print(
            f"{PROG}: the site isn't synced: no site bucket named (the edge is W2's; contracts/edge.md §5)"
        )

    # 3. The tree, the plugin, release.json, and the pointer last.
    rid = f"{now()}-{head[:12]}"
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
    wi = _load("web_image_for_release", src / "deploy" / "scripts" / "web_image.py")
    folder = wi.write_policy(wi.read_policy(ROOT))
    out = ["--build-arg", "ROOM_DRAFTS=", "--build-context", f"policy={folder}"]
    for folder_name, context in (
        (wi.ROOM_ASSETS, wi.ROOM_ASSETS_CONTEXT),
        (wi.VISITOR_ASSETS, wi.VISITOR_ASSETS_CONTEXT),
        (wi.TWIN_ASSETS, wi.TWIN_ASSETS_CONTEXT),
    ):
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
    args = parser.parse_args(argv)
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
    )
    return run(opts, subprocess_runner, contexts=web_contexts)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
