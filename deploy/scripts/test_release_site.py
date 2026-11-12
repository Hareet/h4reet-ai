"""Spec 001 group 8 (contracts/releases-deployer.md §2, step 5; contracts/edge.md §5; plan.md §16, "Group 8, as
built"): the release syncs the site it checked to the site's bucket.

  - the checked copy of the room's site, the web image's own, goes to releases/<commit>/ first, each file with its
    Cache-Control as the web image's nginx sends it: hashed assets and the content-addressed files a year, immutable,
    everything else no-cache; each GLB's build-time gzip copy under its own name, without .gz, with Content-Encoding
    gzip, as nginx's gzip_static serves it; the PDF's text file never;
  - then that copy becomes site/, objects gone from the release deleted, but the public view's status/, which the
    snapshot sink writes;
  - then one invalidation of the distribution, when the Author names it;
  - all before release.json and the pointer, so a failed sync leaves the pointer on the release before;
  - and with no site bucket named, nothing is synced, and the release says so: the edge is W2's.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "test_release_for_site", HERE / "test_release.py"
)
assert SPEC and SPEC.loader
base = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = base
SPEC.loader.exec_module(base)
rl = base.rl

SITE = "h4reet-ai-site-" + "6" * 12
DISTRIBUTION = "E" + "2ABCDEFGHIJKL"
IMMUTABLE = "public, max-age=31536000, immutable"


class SiteRunner(base.Runner):
    """The release's runner, whose `docker cp` of the web image's site leaves a small site where it copies to."""

    def __init__(self) -> None:
        super().__init__()
        self.fail_sync = False

    def __call__(self, argv: list[str], data: bytes | None = None) -> tuple[int, str]:
        if argv[:2] == ["docker", "cp"]:
            self.calls.append(list(argv))
            dist = Path(argv[-1])
            for rel, body in {
                "index.html": b"<html></html>",
                "assets/index-abc123.js": b"js",
                "a/desk.0123456789abcdef.glb.gz": b"\x1f\x8bgz",
                "a/card.0123456789abcdef.png": b"png",
                "disclosure/index.html": b"<html></html>",
                "_degraded/api.json": b"{}",
                "resume.pdf": b"%PDF",
                "resume.pdf.txt": b"text",
            }.items():
                (dist / rel).parent.mkdir(parents=True, exist_ok=True)
                (dist / rel).write_bytes(body)
            return 0, ""
        if self.fail_sync and argv[:3] == ["aws", "s3", "sync"]:
            self.calls.append(list(argv))
            return 1, ""
        return super().__call__(argv, data)


def release(tmp_path: Path, runner: SiteRunner, **site: str) -> int:
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
            site_bucket=site.get("bucket"),
            distribution=site.get("distribution"),
        ),
        runner,
        root=base.REPO,
        now=lambda: "20261113T010203Z",
        exported=base.exported,
    )


def aws(runner: SiteRunner, *first: str) -> list[list[str]]:
    return [c for c in runner.calls if c[: len(first)] == list(first)]


def test_the_site_goes_to_its_release_copy_then_to_site_then_one_invalidation(
    tmp_path: Path,
) -> None:
    r = SiteRunner()
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    copy = f"s3://{SITE}/releases/{base.COMMIT}/"
    syncs = aws(r, "aws", "s3", "sync")
    assert [s[4] for s in syncs] == [copy, copy, f"s3://{SITE}/site/"]
    # Hashed assets and the content-addressed files, a year and immutable; the GLBs' .gz copies apart.
    immutable = syncs[0]
    assert immutable[immutable.index("--cache-control") + 1] == IMMUTABLE
    assert immutable[immutable.index("--exclude") + 1] == "*"
    assert ["--include", "assets/*"] == immutable[immutable.index("--include") :][:2]
    assert "a/*.gz" in immutable
    # Everything else no-cache, and the PDF's text file never.
    rest = syncs[1]
    assert rest[rest.index("--cache-control") + 1] == "no-cache"
    assert "*.pdf.txt" in rest and "assets/*" in rest and "a/*" in rest
    # The copy becomes site/, with what the release lacks deleted, but the public view's status/.
    promote = syncs[2]
    assert promote[3] == copy and "--delete" in promote
    assert promote[promote.index("--exclude") + 1] == "status/*"
    # Each GLB under its name, without .gz, as nginx's gzip_static serves it.
    (glb,) = [c for c in aws(r, "aws", "s3", "cp") if c[-1].endswith(".glb")]
    assert glb[-1] == f"{copy}a/desk.0123456789abcdef.glb"
    assert glb[glb.index("--content-encoding") + 1] == "gzip"
    assert glb[glb.index("--content-type") + 1] == "model/gltf-binary"
    assert glb[glb.index("--cache-control") + 1] == IMMUTABLE
    # One invalidation, of everything.
    (invalidation,) = aws(r, "aws", "cloudfront", "create-invalidation")
    assert invalidation[invalidation.index("--distribution-id") + 1] == DISTRIBUTION
    assert invalidation[invalidation.index("--paths") + 1] == "/*"
    # All of it before release.json and the pointer.
    order = [" ".join(c) for c in r.calls]
    pointer = next(i for i, c in enumerate(order) if c.endswith("releases/latest.json"))
    last_site = max(
        i for i, c in enumerate(order) if SITE in c or "create-invalidation" in c
    )
    assert last_site < pointer


def test_without_a_site_bucket_nothing_is_synced_and_the_release_says_so(
    tmp_path: Path, capsys
) -> None:
    r = SiteRunner()
    assert release(tmp_path, r) == 0
    assert not aws(r, "aws", "s3", "sync")
    assert not aws(r, "aws", "cloudfront")
    assert "the site isn't synced" in capsys.readouterr().out


def test_a_failed_sync_refuses_and_leaves_the_pointer_on_the_release_before(
    tmp_path: Path,
) -> None:
    r = SiteRunner()
    r.fail_sync = True
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 1
    assert not [u for u in r.uploads if u.endswith("releases/latest.json")]
    assert not aws(r, "aws", "cloudfront")


def test_a_site_bucket_that_isnt_the_accounts_site_is_refused(tmp_path: Path) -> None:
    r = SiteRunner()
    assert release(tmp_path, r, bucket="someone-elses-bucket") == 1
    assert not aws(r, "aws", "s3", "sync")
