"""F6, the release's rerun (specs/001-cloud-elevation/fixes/f6.md; contracts/releases-deployer.md §2).

ECR's tags are immutable (infra/account/registry.tf), and a second build of one export isn't byte-identical, so a run
that pushed the gateway and the room under the commit's tag, then refused, left the next run of that commit refused.

- each project image is tagged by the release's id (`<time>-<the commit's first 12>`), release.json's own, so a rerun
  never meets a tag an earlier run left, and records its own builds alone;
- a copy's tag that already names its lock's digest is taken without a second put; one that names another digest
  still refuses;
- a release is of a gated merge still: the rerun's gate runs before anything is built, and a tag that names another
  image refuses with nothing uploaded.

The registry is stood in for with immutable tags and builds whose digest differs on every build.
"""

from __future__ import annotations

import hashlib
import importlib.util
import itertools
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "test_release_for_rerun", HERE / "test_release.py"
)
assert SPEC and SPEC.loader
base = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = base
SPEC.loader.exec_module(base)
rl = base.rl

FIRST = "20261117T003000Z"
SECOND = "20261117T003531Z"
BUILDS = itertools.count()


class Registry(base.Runner):
    """base.Runner, with a registry whose tags are immutable, as ECR's are: a push or a put under a tag that names
    another image fails; an unchanged put is accepted. Each build's digest is new, as a rebuild's is."""

    def __init__(self, tags: dict[str, str], fail_build: str | None = None) -> None:
        super().__init__()
        self.tags = tags
        self.fail_build = fail_build
        self.puts: list[str] = []

    def __call__(self, argv: list[str], data: bytes | None = None) -> tuple[int, str]:
        if argv[:3] == ["docker", "buildx", "build"] and "--push" in argv:
            self.calls.append(list(argv))
            ref = argv[argv.index("--tag") + 1]
            if self.fail_build and self.fail_build in ref:
                return 1, ""
            if ref in self.tags:
                return 1, ""  # ImageTagAlreadyExistsException
            self.tags[ref] = (
                "sha256:" + hashlib.sha256(f"{ref}#{next(BUILDS)}".encode()).hexdigest()
            )
            return 0, ""
        if argv[:4] == ["docker", "buildx", "imagetools", "create"]:
            self.calls.append(list(argv))
            target = argv[argv.index("--tag") + 1]
            digest = argv[-1].split("@", 1)[1]
            self.puts.append(target)
            if self.tags.get(target, digest) != digest:
                return 1, ""
            self.tags[target] = digest
            return 0, ""
        if argv[:4] == ["docker", "buildx", "imagetools", "inspect"]:
            self.calls.append(list(argv))
            ref = argv[-1]
            if ref not in self.tags:
                return 1, f"ERROR: {ref}: not found\n"
            return (
                0,
                f"Name:      {ref}\nMediaType: application/vnd.oci.image.index.v1+json\nDigest:    {self.tags[ref]}\n",
            )
        return super().__call__(argv, data)

    def pushed(self) -> list[str]:
        return [
            c[c.index("--tag") + 1]
            for c in self.calls
            if c[:3] == ["docker", "buildx", "build"] and "--push" in c
        ]


def release(tmp_path: Path, runner: Registry, stamp: str) -> int:
    path, sha = base.plugin(tmp_path)
    return rl.run(
        rl.Options(
            registry=base.REGISTRY,
            bucket=base.BUCKET,
            compose_plugin=path,
            compose_sha256=sha,
            public=False,
            local=tmp_path / "releases",
            redteam=base.history(tmp_path, {}),
        ),
        runner,
        root=base.REPO,
        now=lambda: stamp,
        exported=base.exported,
        routing_of=lambda src: base.ROUTING,
    )


def rid(stamp: str) -> str:
    return f"{stamp}-{base.COMMIT[:12]}"


def copy_targets(tmp_path: Path) -> dict[str, str]:
    """Each copy's target and its lock's digest, as a release against an empty registry puts them."""
    r = Registry({})
    (tmp_path / "learn").mkdir()
    assert release(tmp_path / "learn", r, FIRST) == 0
    return {t: r.tags[t] for t in r.puts}


def test_a_rerun_after_a_run_that_pushed_then_refused_releases(tmp_path: Path) -> None:
    tags: dict[str, str] = {}
    first = Registry(tags, fail_build="/h4reet/tunnel:")
    assert release(tmp_path, first, FIRST) == 1
    left = dict(tags)
    gateway = f"{base.REGISTRY}/h4reet/gateway"
    web = f"{base.REGISTRY}/h4reet/web"
    assert any(t.startswith(gateway + ":") for t in left)
    assert any(t.startswith(web + ":") for t in left)
    assert first.uploads == []

    second = Registry(tags)
    assert release(tmp_path, second, SECOND) == 0
    services = base.written(tmp_path)["services"]
    assert services["gateway"]["digest"] == tags[f"{gateway}:{rid(SECOND)}"]
    assert services["web"]["digest"] == tags[f"{web}:{rid(SECOND)}"]
    # The second run's own builds, never the first's.
    firsts = set(left.values())
    assert services["gateway"]["digest"] not in firsts
    assert services["web"]["digest"] not in firsts
    # What the first run left is as it left it.
    assert {k: tags[k] for k in left} == left


def test_each_build_is_tagged_by_its_release_id(tmp_path: Path) -> None:
    r = Registry({})
    assert release(tmp_path, r, SECOND) == 0
    assert r.pushed()
    for ref in r.pushed():
        assert ref.endswith(f":{rid(SECOND)}"), ref
    assert base.written(tmp_path)["release"] == rid(SECOND)


def test_a_build_tag_that_names_another_image_still_refuses(tmp_path: Path) -> None:
    taken = f"{base.REGISTRY}/h4reet/gateway:{rid(SECOND)}"
    other = "sha256:" + "e" * 64
    tags = {taken: other}
    r = Registry(tags)
    assert release(tmp_path, r, SECOND) == 1
    assert r.uploads == []
    assert tags[taken] == other
    assert not (tmp_path / "releases" / "latest-release.json").exists()


def test_a_copy_tag_that_names_another_digest_still_refuses(tmp_path: Path) -> None:
    targets = copy_targets(tmp_path)
    loki = next(t for t in targets if "/h4reet/loki:" in t)
    other = "sha256:" + "f" * 64
    tags = {loki: other}
    r = Registry(tags)
    assert release(tmp_path, r, SECOND) == 1
    assert r.uploads == []
    assert tags[loki] == other


def test_a_copy_tag_that_already_names_the_locks_digest_is_accepted_without_a_put(
    tmp_path: Path,
) -> None:
    targets = copy_targets(tmp_path)
    assert targets
    r = Registry(dict(targets))
    assert release(tmp_path, r, SECOND) == 0
    assert r.puts == []
    lock = rl.read_lock(base.REPO)
    for name, service in base.written(tmp_path)["services"].items():
        if name in rl.BUILDS:
            continue
        _, tag, digest = lock[rl.LOCK_LINES.get(name, name)]
        assert (service["tag"], service["digest"]) == (tag, digest), name


def test_a_rerun_still_needs_a_gated_merge(tmp_path: Path) -> None:
    tags: dict[str, str] = {}
    assert release(tmp_path, Registry(tags, fail_build="/h4reet/tunnel:"), FIRST) == 1
    left = dict(tags)
    r = Registry(tags)
    r.merge = f"{base.PARENT} {base.TIP}\nMerge feat/x by hand\n"
    assert release(tmp_path, r, SECOND) == 1
    assert r.builds() == [] and r.uploads == []
    assert tags == left
