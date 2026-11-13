"""Tests for deploy/scripts/release.py, the Author's release (spec 001 tasks.md T083, T088; FR-039, FR-046 to FR-048;
contracts/releases-deployer.md §1 and §2; research.md R-17).

  - refs/heads/main's commit alone, from a fresh export of it, whatever the checkout holds, and only when its merge
    carries the gate's line for the branch tip it merged (group 7's review A, I-D and I-H);
  - one build per project image, for linux/amd64, and for linux/arm64 where its `hosts` name a Graviton host (EC2,
    the tunnel end), pushed by the release's commit;
  - every upstream image a cloud host runs copied to the account's registry by its lock line's index digest, and
    refused when the copy's digest isn't the lock's;
  - when the release makes hello or the twin's turns public, the red-team gate: a passing run of that very commit on each
    adapter that answers on either host, read from a folder outside the export, or nothing is built;
  - the room's site checked in the web image the release builds, from the export, its dist copied out of the image:
    nothing of the checkout's node_modules runs (I-E); a build with drafts refused, before anything is pushed;
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
PARENT = "b" * 40
TIP = "d" * 40
GATED = (
    f"{PARENT} {TIP}\nMerge feat/x ({TIP[:12]})\n\n"
    f"gate: {TIP} (feat/x) by tools/gates/gate at {PARENT[:12]}: 22 PASS, 0 FAIL\n"
)


def blob_of(path: Path) -> str:
    """git's blob ID of a file's bytes, as `git hash-object` gives it."""
    data = path.read_bytes()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


# FR-039's four, each host's two route adapters (group 7's fixes' review, I1): the laptop's from the export's
# config/routing.yaml, EC2's from its line there, which the tests' routing gives.
FOUR = ("laptop/local", "laptop/anthropic", "ec2/anthropic", "ec2/bedrock")
ROUTING = {
    "envs": {
        "prod": {
            "hosts": {
                "laptop": {"primary": "local", "fallback": "anthropic"},
                "ec2": {"first": "anthropic", "second": "bedrock"},
            }
        }
    }
}


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
        self.merge = GATED
        self.fail_with: BaseException | None = None
        # main's blob of a path, where a test makes it differ from the tree's (group 7's fixes' review, I2).
        self.blobs: dict[str, str] = {}

    def __call__(self, argv: list[str], data: bytes | None = None) -> tuple[int, str]:
        self.calls.append(list(argv))
        if self.fail_with is not None:
            raise self.fail_with
        if argv[:3] == ["git", "rev-parse", "HEAD"]:
            return 0, "e" * 40 + "\n"  # the checkout, which the release never reads
        if argv[:2] == ["git", "rev-parse"] and any(
            a.startswith("refs/heads/main:") for a in argv
        ):
            path = next(a for a in argv if a.startswith("refs/heads/main:")).split(
                ":", 1
            )[1]
            return 0, self.blobs.get(path, blob_of(REPO / path)) + "\n"
        if argv[:2] == ["git", "rev-parse"] and "refs/heads/main" in argv:
            return 0, self.main + "\n"
        if argv[:3] == ["git", "status", "--porcelain"]:
            return 0, self.dirty
        if argv[:3] == ["git", "show", "-s"]:
            return 0, self.merge
        if argv[:2] == ["docker", "create"]:
            return 0, "f00d" * 16 + "\n"
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
    commit: str | None = COMMIT,
) -> Path:
    folder = tmp_path / "redteam-history"
    folder.mkdir(exist_ok=True)
    for name, failed in adapters.items():
        host, _, adapter = name.rpartition("/")
        (folder / f"20270101T000000Z-{name.replace('/', '-')}.json").write_text(
            json.dumps(
                {
                    "adapter": adapter,
                    **({"host": host} if host else {}),
                    "cases": 48,
                    "failed": failed,
                    "unjudged": 0,
                    "finished": finished,
                    "suite": "redteam",
                    **({"commit": commit} if commit else {}),
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


EXPORTED: list[str] = []


def exported(commit: str, work: Path) -> Path:
    """The export of refs/heads/main's commit, which the tests stand in for with the repository's own files."""
    EXPORTED.append(commit)
    return REPO


def run(
    tmp_path: Path, runner: Runner, public: bool = False, folder: Path | None = None
) -> int:
    path, sha = plugin(tmp_path)
    EXPORTED.clear()
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
        exported=exported,
        routing_of=lambda src: ROUTING,
    )


def written(tmp_path: Path) -> dict:
    return json.loads(
        (tmp_path / "releases" / "latest-release.json").read_text(encoding="utf-8")
    )


def test_a_release_builds_once_each_for_its_hosts_platforms(tmp_path: Path) -> None:
    r = Runner()
    assert run(tmp_path, r) == 0
    # The pushed builds: the site's check builds its own image too, loaded and never pushed (group 7's review A, I-E).
    pushed = [c for c in r.builds() if "--load" not in c]
    built = {
        c[c.index("--tag") + 1].rsplit(":", 1)[0]: c[c.index("--platform") + 1]
        for c in pushed
    }
    # The gateway and the room's site run on the laptop and EC2; the tunnel's image on the tunnel end: each on Graviton.
    assert built == {
        f"{REGISTRY}/h4reet/gateway": "linux/amd64,linux/arm64",
        f"{REGISTRY}/h4reet/web": "linux/amd64,linux/arm64",
        f"{REGISTRY}/h4reet/tunnel": "linux/amd64,linux/arm64",
        # Group 8: the relay, on the tunnel end.
        f"{REGISTRY}/h4reet/relay": "linux/amd64,linux/arm64",
        # Group 10: the public view's image, built once for the tunnel end's sink and EC2's publisher.
        f"{REGISTRY}/h4reet/snapshot": "linux/amd64,linux/arm64",
    }
    assert (
        len([c for c in pushed if "/h4reet/snapshot:" in c[c.index("--tag") + 1]]) == 1
    )
    services = written(tmp_path)["services"]
    assert (
        services["snapshot-sink"]["digest"]
        == services["ec2-snapshot-publisher"]["digest"]
    )
    assert services["snapshot-sink"]["hosts"] == ["tunnel-end"]
    assert services["ec2-snapshot-publisher"]["hosts"] == ["ec2"]
    for c in pushed:
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


@pytest.mark.parametrize("failed_adapter", FOUR)
def test_a_public_release_needs_the_red_team_on_all_four_adapters(
    tmp_path: Path, failed_adapter: str
) -> None:
    adapters = dict.fromkeys(FOUR, 0)
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
            folder=history(tmp_path, dict.fromkeys(FOUR, 0)),
        )
        == 0
    )
    assert written(tmp_path)["public"] is True


@pytest.mark.parametrize("commit", ["a" * 40, None])
def test_a_run_of_another_commit_or_of_none_doesnt_count(
    tmp_path: Path, commit: str | None
) -> None:
    # Group 7's review A, I-D: a run is matched by its record's commit, not by its time, so a run made after the merge
    # needn't dirty the tree or move HEAD; one with no commit field, from before it, counts for nothing.
    r = Runner()
    other = history(tmp_path, dict.fromkeys(FOUR, 0), commit=commit)
    assert run(tmp_path, r, public=True, folder=other) == 1
    assert r.builds() == []


def test_the_four_adapters_are_those_that_answer_on_either_host() -> None:
    # FR-039: the laptop's local model and its paid fallback, EC2's Anthropic API and Bedrock, each on its own host,
    # from the export's routing (group 7's fixes' review, I1): a laptop run of Bedrock doesn't stand for EC2's.
    assert rl.required_runs(ROUTING) == [
        ("laptop", "local"),
        ("laptop", "anthropic"),
        ("ec2", "anthropic"),
        ("ec2", "bedrock"),
    ]
    # A record without a host is the laptop's, as every run before group 7's fixes was.
    assert rl.required_runs(
        {"envs": {"prod": {"hosts": {"laptop": {"primary": "local"}}}}}
    ) == [("laptop", "local")]


def test_a_site_build_with_drafts_is_refused_before_anything_is_pushed(
    tmp_path: Path,
) -> None:
    r = Runner()
    r.content_check = 1
    assert run(tmp_path, r) == 1
    # The check's own image is built, and loaded, never pushed (group 7's review A, I-E).
    assert not [c for c in r.builds() if "--push" in c] and r.uploads == []


def test_main_is_released_from_its_export_whatever_the_checkout_holds(
    tmp_path: Path,
) -> None:
    # Group 7's review A, I-D: the main checkout always holds untracked files, and its HEAD may be any branch. The
    # release is refs/heads/main's commit, built from a fresh export of it.
    r = Runner()
    r.dirty = "?? resume/\n M deploy/compose.yaml\n"
    assert run(tmp_path, r) == 0
    assert EXPORTED == [COMMIT]
    assert written(tmp_path)["commit"] == COMMIT
    assert not [c for c in r.calls if c[:3] in (["git", "status", "--porcelain"],)]
    assert not [c for c in r.calls if c[:3] == ["git", "rev-parse", "HEAD"]]
    archives = [c for c in r.calls if c[:2] == ["git", "archive"]]
    assert archives and all(c[-1] == COMMIT for c in archives)


def test_a_main_that_doesnt_resolve_is_refused(tmp_path: Path) -> None:
    r = Runner()
    r.main = "not a commit"
    assert run(tmp_path, r) == 1
    assert r.builds() == []


@pytest.mark.parametrize(
    "merge",
    [
        f"{PARENT}\nan Author's own commit on main\n",
        f"{PARENT} {TIP}\nMerge feat/x\n\nno gate here\n",
        f"{PARENT} {TIP}\nMerge feat/x\n\ngate: {'a' * 40} (feat/y) by tools/gates/gate at x: 0 FAIL\n",
        f"{PARENT} {TIP}\nMerge feat/x\n\n  gate: {TIP} (feat/x) quoted, not the line\n",
    ],
)
def test_a_commit_whose_merge_doesnt_carry_the_gates_line_is_refused(
    tmp_path: Path, merge: str
) -> None:
    # Group 7's review A, I-H; contracts/releases-deployer.md §2.1: "checks the commit passed the gate". The Author's
    # hand guard writes the gate's `gate: <tip> (<branch>) by tools/gates/gate at …` line in each merge's message.
    r = Runner()
    r.merge = merge
    assert run(tmp_path, r) == 1
    assert r.builds() == [] and r.uploads == []


def test_the_site_is_checked_in_the_web_image_built_from_the_export(
    tmp_path: Path,
) -> None:
    # Group 7's review A, I-E: no npm, and nothing of the checkout's node_modules, runs in the Author's terminal; the
    # check reads the dist the image holds, copied out of it, before anything is pushed.
    r = Runner()
    assert run(tmp_path, r) == 0
    assert not [c for c in r.calls if "npm" in c]
    (load,) = [c for c in r.builds() if "--load" in c]
    assert "--push" not in load
    assert load[load.index("--file") + 1] == str(REPO / "apps/web/Dockerfile")
    assert load[-1] == str(REPO)
    check_tag = load[load.index("--tag") + 1]
    order = [" ".join(c) for c in r.calls]
    create = next(i for i, c in enumerate(r.calls) if c[:2] == ["docker", "create"])
    copy = next(i for i, c in enumerate(r.calls) if c[:2] == ["docker", "cp"])
    check = next(i for i, c in enumerate(order) if "content_check.py" in c)
    first_push = next(i for i, c in enumerate(r.calls) if "--push" in c)
    assert r.calls[create][-1] == check_tag
    assert r.calls[copy][2].endswith(":/usr/share/nginx/html")
    dist = r.calls[copy][3]
    content = r.calls[check]
    assert content[content.index("--dist") + 1] == dist
    assert content[content.index("--tree") + 1] == str(REPO)
    assert create < copy < check < first_push


@pytest.mark.parametrize("error", [OSError("no docker"), "timeout"])
def test_a_command_that_cant_run_is_exit_2(tmp_path: Path, error: object) -> None:
    import subprocess

    r = Runner()
    r.fail_with = (
        subprocess.TimeoutExpired(["docker"], 1) if error == "timeout" else error  # type: ignore[assignment]
    )
    assert run(tmp_path, r) == 2


def test_the_export_keeps_every_member_inside_its_folder(tmp_path: Path) -> None:
    import io
    import tarfile

    def tar(names: list[str]) -> bytes:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as out:
            for name in names:
                info = tarfile.TarInfo(name)
                info.size = 2
                out.addfile(info, io.BytesIO(b"ok"))
        return buf.getvalue()

    def runner(argv: list[str]) -> tuple[int, str]:
        Path(argv[argv.index("--output") + 1]).write_bytes(tar(names))
        return 0, ""

    names = ["deploy/compose.yaml", "apps/web/Dockerfile"]
    src = rl.export_tree(runner, COMMIT, tmp_path / "w1")
    assert (src / "deploy/compose.yaml").read_text() == "ok"
    names = ["../outside"]
    with pytest.raises(rl.Refused):
        rl.export_tree(runner, COMMIT, tmp_path / "w2")
    assert not (tmp_path / "outside").exists()


def test_the_usage_line_runs_python_as_the_makefile_does() -> None:
    assert "-X pycache_prefix=/dev/null" in rl.__doc__


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
    assert hosts["relay"] == ["tunnel-end"] and "dev-relay" not in hosts
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
        exported=exported,
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
