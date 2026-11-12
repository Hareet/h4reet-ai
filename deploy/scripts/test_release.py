"""Tests for deploy/scripts/release.py, the Author's release (spec 001 tasks.md T083, T088; FR-039, FR-046 to FR-048;
contracts/releases-deployer.md §1 and §2; research.md R-17).

  - on a clean `main` alone;
  - one build per project image, for linux/amd64, and for linux/arm64 where its `hosts` name a Graviton host (EC2,
    the tunnel end), pushed by the release's commit;
  - every upstream image a cloud host runs copied to the account's registry by its lock line's index digest, and
    refused when the copy's digest isn't the lock's;
  - when the release makes hello or the twin's turns public, the red-team gate: each of the four adapters' newest run
    since the commit passed, or nothing is built;
  - a site build with drafts refused, before anything is pushed;
  - release.json: the commit, the tree at trees/<commit>.tar.gz by its SHA-256, the Compose plugin by its SHA-256, and
    each cloud service's repository, digest, tag (a copy's), hosts, and platforms; the pointer written last.

Git, Docker, the AWS CLI, and the site's build are stood in for: release.run takes a Runner.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import secrets
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location("release", HERE / "release.py")
assert SPEC and SPEC.loader
rl = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = rl
SPEC.loader.exec_module(rl)

REGISTRY = "6" * 12 + ".dkr.ecr.us-east-1.amazonaws.com"
BUCKET = "h4reet-ai-releases-abc123"
COMMIT = "c" * 40


class Runner:
    """Each command, and an answer by its first words."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.main = COMMIT
        self.dirty = ""
        self.content_check = 0
        self.copied: dict[str, str] = {}
        self.uploads: list[str] = []
        self.wrong_copy: str | None = None

    def __call__(self, argv: list[str], data: bytes | None = None) -> tuple[int, str]:
        self.calls.append(list(argv))
        if argv[:3] == ["git", "rev-parse", "HEAD"]:
            return 0, COMMIT + "\n"
        if argv[:3] == ["git", "rev-parse", "refs/heads/main"]:
            return 0, self.main + "\n"
        if argv[:3] == ["git", "status", "--porcelain"]:
            return 0, self.dirty
        if argv[:3] == ["git", "show", "-s"]:
            return 0, "1790000000\n"
        if argv[:2] == ["git", "archive"]:
            return 0, ""
        if "content_check.py" in " ".join(argv):
            return self.content_check, ""
        if argv[:4] == ["docker", "buildx", "imagetools", "create"]:
            target = argv[argv.index("--tag") + 1]
            source = argv[-1]
            self.copied[target] = source.split("@", 1)[1]
            return 0, ""
        if argv[:4] == ["docker", "buildx", "imagetools", "inspect"]:
            ref = argv[-1]
            digest = (
                self.copied.get(ref)
                or "sha256:" + hashlib.sha256(ref.encode()).hexdigest()
            )
            if self.wrong_copy and ref.endswith(self.wrong_copy):
                digest = "sha256:" + "f" * 64
            return (
                0,
                f"Name:      {ref}\nMediaType: application/vnd.oci.image.index.v1+json\nDigest:    {digest}\n",
            )
        if argv[:3] == ["aws", "s3", "cp"] or argv[1:3] == ["s3", "cp"]:
            self.uploads.append(argv[-1] if argv[-1].startswith("s3://") else argv[-2])
            return 0, ""
        return 0, ""

    def builds(self) -> list[list[str]]:
        return [c for c in self.calls if c[:3] == ["docker", "buildx", "build"]]


def history(
    tmp_path: Path,
    adapters: dict[str, int],
    finished: str = "2027-01-01T00:00:00+00:00",
) -> Path:
    folder = tmp_path / "redteam-history"
    folder.mkdir(exist_ok=True)
    for adapter, failed in adapters.items():
        (folder / f"20270101T000000Z-{adapter}.json").write_text(
            json.dumps(
                {
                    "adapter": adapter,
                    "cases": 48,
                    "failed": failed,
                    "unjudged": 0,
                    "finished": finished,
                    "suite": "redteam",
                }
            ),
            encoding="utf-8",
        )
    return folder


def plugin(tmp_path: Path) -> tuple[Path, str]:
    path = tmp_path / "docker-compose-linux-aarch64"
    data = b"\x7fELF compose " + secrets.token_bytes(8)
    path.write_bytes(data)
    return path, hashlib.sha256(data).hexdigest()


def run(
    tmp_path: Path, runner: Runner, public: bool = False, folder: Path | None = None
) -> int:
    path, sha = plugin(tmp_path)
    return rl.run(
        rl.Options(
            registry=REGISTRY,
            bucket=BUCKET,
            compose_plugin=path,
            compose_sha256=sha,
            public=public,
            local=tmp_path / "releases",
            redteam=folder or history(tmp_path, {}),
        ),
        runner,
        root=REPO,
        now=lambda: "20261113T010203Z",
    )


def written(tmp_path: Path) -> dict:
    return json.loads(
        (tmp_path / "releases" / "latest-release.json").read_text(encoding="utf-8")
    )


def test_a_release_builds_once_each_for_its_hosts_platforms(tmp_path: Path) -> None:
    r = Runner()
    assert run(tmp_path, r) == 0
    built = {
        c[c.index("--tag") + 1].rsplit(":", 1)[0]: c[c.index("--platform") + 1]
        for c in r.builds()
    }
    # The gateway and the room's site run on the laptop and EC2; the tunnel's image on the tunnel end: each on Graviton.
    assert built == {
        f"{REGISTRY}/h4reet/gateway": "linux/amd64,linux/arm64",
        f"{REGISTRY}/h4reet/web": "linux/amd64,linux/arm64",
        f"{REGISTRY}/h4reet/tunnel": "linux/amd64,linux/arm64",
    }
    for c in r.builds():
        assert "--push" in c and c[c.index("--tag") + 1].endswith(f":{COMMIT}")
    assert rl.platforms(["laptop"]) == ["linux/amd64"]
    assert rl.platforms(["laptop", "ec2"]) == ["linux/amd64", "linux/arm64"]


def test_each_upstream_copy_is_by_its_locks_index_digest(tmp_path: Path) -> None:
    r = Runner()
    assert run(tmp_path, r) == 0
    lock = rl.read_lock(REPO)
    release = written(tmp_path)
    for name, service in release["services"].items():
        if name in rl.BUILDS:
            continue
        source = rl.LOCK_LINES.get(name, name)
        _, tag, digest = lock[source]
        assert (service["tag"], service["digest"]) == (tag, digest), name
        target = f"{REGISTRY}/{service['repository']}:{tag}"
        assert r.copied[target] == digest, name
    creates = [
        c for c in r.calls if c[:4] == ["docker", "buildx", "imagetools", "create"]
    ]
    assert all("@sha256:" in c[-1] for c in creates)


def test_a_copy_whose_digest_isnt_the_locks_is_refused(tmp_path: Path) -> None:
    r = Runner()
    r.wrong_copy = "/h4reet/loki:" + rl.read_lock(REPO)["loki"][1]
    assert run(tmp_path, r) == 1
    assert r.uploads == []


@pytest.mark.parametrize("failed_adapter", ["fake", "local", "bedrock", "anthropic"])
def test_a_public_release_needs_the_red_team_on_all_four_adapters(
    tmp_path: Path, failed_adapter: str
) -> None:
    adapters = {a: 0 for a in rl.ADAPTERS}
    adapters[failed_adapter] = 1
    r = Runner()
    assert run(tmp_path, r, public=True, folder=history(tmp_path, adapters)) == 1
    assert r.builds() == [] and r.uploads == []


def test_a_public_release_with_every_adapter_passing_since_the_commit(
    tmp_path: Path,
) -> None:
    r = Runner()
    assert (
        run(
            tmp_path,
            r,
            public=True,
            folder=history(tmp_path, dict.fromkeys(rl.ADAPTERS, 0)),
        )
        == 0
    )
    assert written(tmp_path)["public"] is True


def test_a_run_older_than_the_commit_doesnt_count(tmp_path: Path) -> None:
    r = Runner()
    old = history(
        tmp_path, dict.fromkeys(rl.ADAPTERS, 0), finished="2020-01-01T00:00:00+00:00"
    )
    assert run(tmp_path, r, public=True, folder=old) == 1


def test_a_site_build_with_drafts_is_refused_before_anything_is_pushed(
    tmp_path: Path,
) -> None:
    r = Runner()
    r.content_check = 1
    assert run(tmp_path, r) == 1
    assert r.builds() == [] and r.uploads == []


@pytest.mark.parametrize("state", ["not-main", "dirty"])
def test_only_a_clean_main_is_released(tmp_path: Path, state: str) -> None:
    r = Runner()
    if state == "not-main":
        r.main = "d" * 40
    else:
        r.dirty = " M deploy/compose.yaml\n"
    assert run(tmp_path, r) == 1
    assert r.builds() == []


def test_release_json_and_the_pointer_last(tmp_path: Path) -> None:
    r = Runner()
    assert run(tmp_path, r) == 0
    release = written(tmp_path)
    assert (
        release["commit"] == COMMIT
        and release["release"] == f"20261113T010203Z-{COMMIT[:12]}"
    )
    assert release["tree"]["key"] == f"trees/{COMMIT}.tar.gz"
    assert len(release["tree"]["sha256"]) == 64
    assert release["compose"]["key"].startswith("tools/docker-compose-")
    hosts = {n: s["hosts"] for n, s in release["services"].items()}
    assert hosts["gateway"] == ["ec2", "laptop"] and hosts["tunnel-end"] == [
        "tunnel-end"
    ]
    assert hosts["shared-state"] == ["tunnel-end"] and hosts["ec2-relay-block"] == [
        "ec2"
    ]
    assert r.uploads[-1] == f"s3://{BUCKET}/releases/latest.json"
    assert f"s3://{BUCKET}/releases/{release['release']}/release.json" in r.uploads
    assert f"s3://{BUCKET}/trees/{COMMIT}.tar.gz" in r.uploads


def test_a_plugin_whose_sha256_isnt_the_given_one_is_refused(tmp_path: Path) -> None:
    path, _ = plugin(tmp_path)
    r = Runner()
    code = rl.run(
        rl.Options(
            REGISTRY,
            BUCKET,
            path,
            "0" * 64,
            False,
            tmp_path / "releases",
            history(tmp_path, {}),
        ),
        r,
        root=REPO,
        now=lambda: "20261113T010203Z",
    )
    assert code == 1 and r.builds() == []


def test_it_refuses_in_an_agent_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    assert (
        rl.main(
            [
                "--registry",
                REGISTRY,
                "--bucket",
                BUCKET,
                "--compose-plugin",
                "x",
                "--compose-sha256",
                "0" * 64,
            ]
        )
        == 2
    )
