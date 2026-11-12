#!/usr/bin/env python3
"""The Author's release (spec 001 FR-039, FR-046 to FR-048; contracts/releases-deployer.md §1 and §2; research.md R-17;
tasks.md T088). His terminal alone: it pushes to the account's registry and its release bucket with his SSO session.

    python3 -I -B deploy/scripts/release.py --registry ACCOUNT.dkr.ecr.us-east-1.amazonaws.com --bucket BUCKET
        --compose-plugin FILE --compose-sha256 HEX [--public] [--redteam DIR]

On a clean `main` alone, in this order, and nothing pushed before every check has passed:
  1. the gates: when the release makes hello or the twin's turns public (--public), each of the four adapters' newest
     red-team run since the commit passed (redteam/history/); the Compose plugin is the file its SHA-256 names; the
     room's site builds with no draft, as main's approvals admit (tools/gates/content_check.py);
  2. one build of each project image, for linux/amd64, and for linux/arm64 where its hosts name a Graviton host (EC2,
     the tunnel end), pushed by the commit; and a copy of each upstream image a cloud host runs, to the account's
     registry, by its lock line's index digest, refused if the copy's digest isn't the lock's;
  3. the commit's tree, at trees/<commit>.tar.gz, and the plugin, by their SHA-256s; release.json, to the bucket and to
     ~/.local/state/h4reet/releases/; and the pointer, releases/latest.json, last.
The site's sync to the edge is group 8's (contracts/edge.md §5). Exit 0 released, 1 refused, 2 couldn't run.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import re
import sys
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
ADAPTERS = ("fake", "local", "bedrock", "anthropic")
CLOUD_CLASSES = ("ec2", "tunnel-end")
DIGEST_LINE = re.compile(r"^Digest:\s+(sha256:[0-9a-f]{64})\s*$", re.MULTILINE)

Runner = Callable[..., "tuple[int, str]"]


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


def check_redteam(runner: Runner, folder: Path) -> None:
    code, out = runner(["git", "show", "-s", "--format=%ct", "HEAD"])
    if code != 0:
        raise Refused("the commit's time can't be read")
    since = datetime.datetime.fromtimestamp(int(out.strip()), datetime.timezone.utc)
    newest: dict[str, dict] = {}
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            run = json.loads(path.read_text(encoding="utf-8"))
            finished = datetime.datetime.fromisoformat(str(run["finished"]))
        except (OSError, ValueError, KeyError):
            continue
        adapter = str(run.get("adapter"))
        if finished >= since and (
            adapter not in newest or finished >= newest[adapter]["_at"]
        ):
            newest[adapter] = {**run, "_at": finished}
    failing = [
        a
        for a in ADAPTERS
        if a not in newest
        or newest[a].get("failed") != 0
        or newest[a].get("unjudged") != 0
        or not newest[a].get("cases")
    ]
    if failing:
        raise Refused(
            f"the red-team gate: no passing run since this commit on {', '.join(failing)} (FR-039)"
        )


def run(
    opts: Options,
    runner: Runner,
    root: Path = ROOT,
    now: Callable[[], str] = lambda: time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()),
    contexts: Callable[[str], list[str]] | None = None,
) -> int:
    contexts = contexts or (lambda name: [])
    try:
        return released(opts, runner, root, now, contexts)
    except Refused as refused:
        print(
            f"{PROG}: refused, nothing pushed past the step that refused: {refused}",
            file=sys.stderr,
        )
        return 1


def released(opts: Options, runner: Runner, root: Path, now, contexts) -> int:
    # 1. The gates, before anything is built or pushed.
    head = runner(["git", "rev-parse", "HEAD"])[1].strip()
    main = runner(["git", "rev-parse", "refs/heads/main"])[1].strip()
    if not re.fullmatch(r"[0-9a-f]{40}", head) or head != main:
        raise Refused(
            "HEAD isn't refs/heads/main: a release is made from main alone (FR-046)"
        )
    if runner(["git", "status", "--porcelain"])[1].strip():
        raise Refused("the tree isn't clean")
    plugin = opts.compose_plugin.read_bytes()
    if hashlib.sha256(plugin).hexdigest() != opts.compose_sha256:
        raise Refused("the Compose plugin isn't the file its SHA-256 names")
    if opts.public:
        check_redteam(runner, opts.redteam)
    # The room's site, built without drafts whatever the shell's ROOM_DRAFTS, as make content-check builds it.
    if runner(["env", "ROOM_DRAFTS=", "npm", "run", "build", "-w", "apps/web"])[0] != 0:
        raise Refused("the room's site didn't build")
    content = [
        "python3",
        "-I",
        "-B",
        "-X",
        "pycache_prefix=/dev/null",
        "tools/gates/content_check.py",
    ]
    if (
        runner([*content, "--tree", ".", "--dist", "apps/web/dist", "--repo", "."])[0]
        != 0
    ):
        raise Refused(
            "the room's site holds a draft or a placeholder main doesn't approve (spec 002's rule)"
        )

    # 2. The images.
    hosts = cloud_services(root)
    lock = read_lock(root)
    services: dict[str, dict] = {}
    for name, its_hosts in hosts.items():
        if name in BUILDS:
            dockerfile, repository = BUILDS[name]
            ref = f"{opts.registry}/{repository}:{head}"
            argv = [
                "docker",
                "buildx",
                "build",
                "--push",
                "--platform",
                ",".join(platforms(its_hosts)),
                "--file",
                str(root / dockerfile),
                "--tag",
                ref,
                *contexts(name),
                str(root / Path(dockerfile).parent if name == "tunnel-end" else root),
            ]
            if runner(argv)[0] != 0:
                raise Refused(f"{name}'s image didn't build")
            services[name] = {
                "repository": repository,
                "digest": digest_of(runner, ref),
                "hosts": its_hosts,
                "platforms": platforms(its_hosts),
            }
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

    # 3. The tree, the plugin, release.json, and the pointer last.
    rid = f"{now()}-{head[:12]}"
    work = Path(tempfile.mkdtemp(prefix="h4-release-"))
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
    import subprocess

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


def web_contexts(name: str) -> list[str]:
    """The room's named build contexts, as deploy/scripts/web_image.py gives them on a host stack, without drafts."""
    if name != "web":
        return []
    wi = _load("web_image_for_release", ROOT / "deploy" / "scripts" / "web_image.py")
    folder = wi.write_policy(wi.read_policy(ROOT))
    out = ["--build-arg", "ROOM_DRAFTS=", "--build-context", f"policy={folder}"]
    for folder_name, context in (
        (wi.ROOM_ASSETS, wi.ROOM_ASSETS_CONTEXT),
        (wi.VISITOR_ASSETS, wi.VISITOR_ASSETS_CONTEXT),
        (wi.TWIN_ASSETS, wi.TWIN_ASSETS_CONTEXT),
    ):
        found = wi.room_assets(ROOT, folder_name)
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
    parser.add_argument("--redteam", type=Path, default=ROOT / "redteam" / "history")
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
    )
    return run(opts, subprocess_runner, contexts=web_contexts)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
