"""Spec 001 group 8 (contracts/releases-deployer.md §2, step 5; contracts/edge.md §5; plan.md §16, "Group 8, as
built"): the release syncs the site it checked to the site's bucket.

  - the checked copy of the room's site, the web image's own, goes to releases/<commit>/ first, each file with its
    Cache-Control as the web image's nginx sends it: hashed assets and the content-addressed files a year, immutable,
    everything else no-cache; each GLB's build-time gzip copy under its own name, without .gz, with Content-Encoding
    gzip, as nginx's gzip_static serves it; the PDF's text file never;
  - then that copy becomes site/: its assets first, so no page names one that isn't there yet, then the rest, objects
    gone from the release deleted, but the public view's status/latest.json, which the snapshot sink writes, and the
    hashed assets and the content-addressed files, which a tab still open on the release before may yet load; the
    build's own status/ page, its index.html and stylesheet, reaches site/ like any other page (W2's review, I1);
  - then one invalidation of the distribution, when the Author names it; a failed one is a warning that names its
    recovery, and the release goes on, since site/ already holds the release (W2; group 8's review B, nit 1);
  - then the assets the release lacks are retired: each is kept a day from the release that first lacked it, by a
    ledger, releases/retired.json, and deleted after; a listing, a ledger, or a delete that fails deletes nothing it
    can't account for, and is a warning;
  - all before release.json and the pointer, so a failed sync leaves the pointer on the release before;
  - and with no site bucket named, nothing is synced, and the release says so: the edge is W2's.
"""

from __future__ import annotations

import fnmatch
import importlib.util
import json
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
        # W2 (group 8's review B, nit 1): a failing CloudFront, the bucket's listing of site/, its ledger of retired
        # assets (None: none yet), and what the release deletes and writes back.
        self.fail_invalidation = False
        self.listing: list[str] | None = []
        self.fail_listing = False
        self.ledger: str | None = None
        self.delete_errors: set[str] = set()
        self.fail_delete = False
        self.deleted: list[str] = []
        self.ledger_written: dict | None = None

    def __call__(self, argv: list[str], data: bytes | None = None) -> tuple[int, str]:
        if argv[:3] == ["aws", "cloudfront", "create-invalidation"]:
            self.calls.append(list(argv))
            return (1, "") if self.fail_invalidation else (0, "{}")
        if argv[:3] == ["aws", "s3api", "list-objects-v2"]:
            self.calls.append(list(argv))
            if self.fail_listing:
                return 1, ""
            return 0, json.dumps(self.listing)
        if argv[:3] == ["aws", "s3", "cp"] and argv[-1] == "-":
            self.calls.append(list(argv))
            return (1, "") if self.ledger is None else (0, self.ledger)
        if argv[:3] == ["aws", "s3api", "delete-objects"]:
            self.calls.append(list(argv))
            spec = argv[argv.index("--delete") + 1]
            assert spec.startswith("file://")
            keys = [o["Key"] for o in json.loads(Path(spec[7:]).read_text())["Objects"]]
            if self.fail_delete:
                return 1, ""
            self.deleted += [k for k in keys if k not in self.delete_errors]
            errors = [
                {"Key": k, "Code": "AccessDenied"}
                for k in keys
                if k in self.delete_errors
            ]
            return 0, json.dumps({"Errors": errors} if errors else {})
        if argv[:3] == ["aws", "s3", "cp"] and argv[-1].endswith(
            "/releases/retired.json"
        ):
            self.ledger_written = json.loads(Path(argv[-2]).read_text())
        return self._site(argv, data)

    def _site(self, argv: list[str], data: bytes | None = None) -> tuple[int, str]:
        if argv[:2] == ["docker", "cp"]:
            self.calls.append(list(argv))
            dist = Path(argv[-1])
            for rel, body in {
                "index.html": b"<html></html>",
                "assets/index-abc123.js": b"js",
                "a/desk.0123456789abcdef.glb.gz": b"\x1f\x8bgz",
                "a/card.0123456789abcdef.png": b"png",
                "disclosure/index.html": b"<html></html>",
                # The public view's page, the build's (apps/web/build/status.ts); the sink writes latest.json beside it.
                "status/index.html": b"<html></html>",
                "status/style.css": b"css",
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
    site = f"s3://{SITE}/site/"
    assert [s[3:5] for s in syncs[2:]] == [[copy, site], [copy, site]]
    assert [s[4] for s in syncs[:2]] == [copy, copy]
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
    # The copy becomes site/: its assets first, never deleting, so no page names an asset not there yet (W2).
    assets = syncs[2]
    assert "--delete" not in assets
    assert assets[assets.index("--exclude") :][:6] == [
        "--exclude", "*", "--include", "assets/*", "--include", "a/*",
    ]  # fmt: skip
    # Then the rest, with what the release lacks deleted, but the public view's status/, and the assets and the
    # content-addressed files, which the retirement below keeps a day for the tabs still open on the release before.
    promote = syncs[3]
    assert promote[3] == copy and "--delete" in promote
    excluded = [promote[i + 1] for i, a in enumerate(promote) if a == "--exclude"]
    assert excluded == ["status/latest.json", "assets/*", "a/*"]
    assert "--include" not in promote
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


def excluded_by(argv: list[str], key: str) -> bool:
    """Whether a sync's --exclude patterns, the CLI's own (`*` crosses `/`), leave key out; no --include follows them
    in these syncs, so the last match is an exclude's."""
    patterns = [argv[i + 1] for i, a in enumerate(argv) if a == "--exclude"]
    return any(fnmatch.fnmatchcase(key, p) for p in patterns)


def test_the_builds_status_page_reaches_site_and_the_sinks_file_stays(
    tmp_path: Path,
) -> None:
    # W2's review, I1: `--exclude status/*` kept the build's status/index.html and its stylesheet out of site/, so
    # /status/ answered S3's AccessDenied. Only the sink's own file is spared the --delete.
    r = SiteRunner()
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    syncs = aws(r, "aws", "s3", "sync")
    to_copy, promote = syncs[1], syncs[3]
    assert "--delete" in promote
    for key in ("status/index.html", "status/style.css"):
        assert not excluded_by(to_copy, key), key
        assert not excluded_by(promote, key), key
    # The sink writes status/latest.json alone (contracts/public-view.md §1): the release lacks it, and never deletes it.
    assert excluded_by(promote, "status/latest.json")
    assert not excluded_by(promote, "status/index.html")


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


# W2 (group 8's review B, nit 1): the sync's partial failures, and the assets a tab still open may load.
NOW = "20261113T010203Z"
LEDGER_KEY = f"s3://{SITE}/releases/retired.json"


def test_a_failed_invalidation_is_a_warning_that_names_its_recovery_and_the_release_goes_on(
    tmp_path: Path, capsys
) -> None:
    r = SiteRunner()
    r.fail_invalidation = True
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    out = capsys.readouterr().out
    assert "warning: the invalidation failed" in out
    assert (
        f"aws cloudfront create-invalidation --distribution-id {DISTRIBUTION} --paths '/*'"
        in out
    )
    # site/ holds the release, so the pointer names it too.
    assert [u for u in r.uploads if u.endswith("releases/latest.json")]


def test_a_newly_retired_asset_is_kept_and_entered_in_the_ledger(
    tmp_path: Path,
) -> None:
    r = SiteRunner()
    r.listing = [
        "site/index.html",
        "site/assets/index-abc123.js",
        "site/assets/index-old111.js",
        "site/a/desk.0123456789abcdef.glb",
        "site/a/old.fedcba9876543210.glb",
        "site/status/latest.json",
    ]
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    # No ledger yet: everything the release lacks is retired now, and nothing is deleted.
    assert not aws(r, "aws", "s3api", "delete-objects")
    assert r.ledger_written == {
        "site/a/old.fedcba9876543210.glb": NOW,
        "site/assets/index-old111.js": NOW,
    }


def test_an_asset_retired_a_day_ago_is_deleted_and_one_back_in_the_release_is_forgotten(
    tmp_path: Path,
) -> None:
    r = SiteRunner()
    r.listing = [
        "site/assets/index-abc123.js",
        "site/assets/index-old111.js",
        "site/assets/index-old222.js",
        "site/status/latest.json",
    ]
    r.ledger = json.dumps(
        {
            "site/assets/index-old111.js": "20261112T000203Z",  # 25 hours
            "site/assets/index-old222.js": "20261112T020203Z",  # 23 hours
            "site/assets/index-abc123.js": "20261111T000000Z",  # in this release again
            "site/assets/gone.js": "20261101T000000Z",  # no longer in the bucket
        }
    )
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    assert r.deleted == ["site/assets/index-old111.js"]
    assert r.ledger_written == {"site/assets/index-old222.js": "20261112T020203Z"}
    # And all of it before release.json and the pointer.
    order = [" ".join(c) for c in r.calls]
    pointer = next(i for i, c in enumerate(order) if c.endswith("releases/latest.json"))
    delete = next(i for i, c in enumerate(order) if "delete-objects" in c)
    assert delete < pointer


def test_a_failed_listing_deletes_nothing_and_is_a_warning(
    tmp_path: Path, capsys
) -> None:
    r = SiteRunner()
    r.fail_listing = True
    r.ledger = json.dumps({"site/assets/index-old111.js": "20261101T000000Z"})
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    assert not aws(r, "aws", "s3api", "delete-objects")
    assert r.ledger_written is None
    assert "warning: the retired assets weren't listed" in capsys.readouterr().out


def test_an_unreadable_ledger_deletes_nothing_and_starts_again(
    tmp_path: Path, capsys
) -> None:
    r = SiteRunner()
    r.listing = ["site/assets/index-old111.js"]
    r.ledger = "not json"
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    assert not aws(r, "aws", "s3api", "delete-objects")
    assert r.ledger_written == {"site/assets/index-old111.js": NOW}
    assert (
        "warning: the ledger of retired assets was unreadable"
        in capsys.readouterr().out
    )


def test_a_delete_that_fails_keeps_its_keys_in_the_ledger(
    tmp_path: Path, capsys
) -> None:
    r = SiteRunner()
    r.listing = ["site/assets/index-old111.js", "site/assets/index-old333.js"]
    old = "20261101T000000Z"
    r.ledger = json.dumps(
        {"site/assets/index-old111.js": old, "site/assets/index-old333.js": old}
    )
    r.delete_errors = {"site/assets/index-old333.js"}
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    assert r.deleted == ["site/assets/index-old111.js"]
    assert r.ledger_written == {"site/assets/index-old333.js": old}
    assert "warning: 1 retired asset wasn't deleted" in capsys.readouterr().out
    # A delete refused whole keeps them all.
    r = SiteRunner()
    r.listing = ["site/assets/index-old111.js"]
    r.ledger = json.dumps({"site/assets/index-old111.js": old})
    r.fail_delete = True
    again = tmp_path / "again"
    again.mkdir()
    assert release(again, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    assert r.ledger_written == {"site/assets/index-old111.js": old}


def test_the_retirement_never_reaches_beyond_the_assets(tmp_path: Path) -> None:
    r = SiteRunner()
    r.listing = [
        "site/status/latest.json",
        "site/old-page/index.html",
        "site/assets/index-old111.js",
    ]
    r.ledger = json.dumps(
        {
            "site/status/latest.json": "20261101T000000Z",
            "site/old-page/index.html": "20261101T000000Z",
            "site/assets/index-old111.js": "20261101T000000Z",
        }
    )
    assert release(tmp_path, r, bucket=SITE, distribution=DISTRIBUTION) == 0
    assert r.deleted == ["site/assets/index-old111.js"]
    (listing,) = aws(r, "aws", "s3api", "list-objects-v2")
    assert listing[listing.index("--bucket") + 1] == SITE
    assert listing[listing.index("--prefix") + 1] == "site/"
