"""Tests for deploy/scripts/deployer.py, the tunnel end's part (spec 001 tasks.md T044, T049; FR-046 to FR-049;
contracts/releases-deployer.md §1, §3, and §5; research.md R-17). Group 7 extends it to EC2 and the laptop (T082, T088).

Each run, on the host's timer:
  1. read the release pointer, releases/latest.json, and the release it names from the release bucket;
  2. verify it: the commit, the tree's SHA-256, each of this host's services with its digest, and no service outside
     the host's class (preflight.HOST_CLASSES);
  3. if it isn't the one running, export its tree, install the release's Compose plugin by its SHA-256, write the
     release's digests to the release's env file, and `docker compose up -d --wait` this host's services only;
  4. on a failed start, return to the previous release, and alert `deploy_rolled_back`, or `deploy_rollback_failed`
     if that fails too; a release it refuses alerts `deploy_refused`, and nothing runs;
  5. record the deployment, one JSON line in the state folder.
At boot it starts the last release it recorded before it asks the bucket, so a bucket it can't reach leaves the host
on its last release.

The AWS CLI, Docker, and the clock are stood in for: deployer.run takes them as objects.
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import secrets
import sys
import tarfile
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("deployer", HERE / "deployer.py")
assert SPEC and SPEC.loader
dp = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = dp
SPEC.loader.exec_module(dp)

BUCKET = "h4reet-ai-releases-" + "q" * 8


def digest() -> str:
    return "sha256:" + secrets.token_hex(32)


def commit() -> str:
    return secrets.token_hex(20)


def tree_tar(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, text in files.items():
            data = text.encode()
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(data), 0o644
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


class Aws:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.alerts: list[str] = []
        self.reachable = True

    def get(self, bucket: str, key: str) -> bytes | None:
        assert bucket == BUCKET
        if not self.reachable:
            raise dp.Unreachable("the bucket")
        return self.objects.get(key)

    def publish(self, message: str) -> None:
        self.alerts.append(message)

    def login(self, registry: str) -> None:
        pass


class Docker:
    def __init__(self) -> None:
        self.calls: list[tuple[str, list[str], dict[str, str]]] = []
        self.fail_for: set[str] = set()
        self.owned: list[tuple[str, int]] = []

    def own_volume(self, name: str, uid: int) -> bool:
        self.owned.append((name, uid))
        return True

    def compose(self, tree: Path, env_files: list[Path], args: list[str]) -> bool:
        env: dict[str, str] = {}
        for path in env_files:
            env.update(dp.read_env(path))
        self.calls.append((str(tree), args, env))
        return not (args[0] == "up" and env.get("H4_RELEASE") in self.fail_for)


class World:
    def __init__(self, tmp_path: Path) -> None:
        self.aws, self.docker = Aws(), Docker()
        self.state = tmp_path / "state"
        self.env_file = tmp_path / "tunnel-end.env"
        self.env_file.write_text(
            f"H4_HOST=tunnel-end\nRELEASE_BUCKET={BUCKET}\nH4_REGISTRY=r.example.invalid\n",
            encoding="utf-8",
        )
        self.plugin = tmp_path / "plugins" / "docker-compose"

    def release(self, rid: str, **override: object) -> dict:
        files = {"deploy/compose.yaml": f"services: {{}}  # {rid}\n"}
        tar = tree_tar(files)
        c = commit()
        compose_binary = b"#!compose " + rid.encode()
        release = {
            "release": rid,
            "commit": c,
            "built_at": "2026-11-13T00:00:00Z",
            "built_by": "author",
            "tree": {
                "key": f"trees/{c}.tar.gz",
                "sha256": hashlib.sha256(tar).hexdigest(),
            },
            "compose": {
                "version": "2.39.1",
                "key": "tools/docker-compose-2.39.1-linux-aarch64",
                "sha256": hashlib.sha256(compose_binary).hexdigest(),
            },
            "services": {
                "tunnel-end": {
                    "repository": "h4reet/tunnel",
                    "digest": digest(),
                    "hosts": ["tunnel-end", "laptop"],
                },
                "tunnel-end-collector": {
                    "repository": "h4reet/otel-collector",
                    "digest": digest(),
                    "hosts": ["tunnel-end"],
                },
                "gateway": {
                    "repository": "h4reet/gateway",
                    "digest": digest(),
                    "hosts": ["laptop", "ec2"],
                },
            },
        }
        release.update(override)
        self.aws.objects[release["tree"]["key"]] = tar  # type: ignore[index]
        self.aws.objects[release["compose"]["key"]] = compose_binary  # type: ignore[index]
        self.aws.objects[f"releases/{rid}/release.json"] = json.dumps(release).encode()
        self.aws.objects["releases/latest.json"] = json.dumps({"release": rid}).encode()
        return release

    def run(self, boot: bool = False) -> int:
        return dp.run(
            "tunnel-end",
            env_file=self.env_file,
            state=self.state,
            aws=self.aws,
            docker=self.docker,
            boot=boot,
            plugin=self.plugin,
            now=lambda: "2026-11-13T01:02:03Z",
        )

    def records(self) -> list[dict]:
        path = self.state / "deployments.jsonl"
        return (
            [json.loads(line) for line in path.read_text().splitlines()]
            if path.exists()
            else []
        )


def ups(w: World) -> list[tuple[list[str], dict[str, str]]]:
    return [(args, env) for _, args, env in w.docker.calls if args[0] == "up"]


def test_no_release_yet_runs_nothing(tmp_path: Path) -> None:
    w = World(tmp_path)
    assert w.run() == 0
    assert w.docker.calls == [] and w.aws.alerts == [] and w.records() == []


def test_a_release_starts_this_hosts_services_only_with_their_digests(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    release = w.release("r1")
    assert w.run() == 0
    (up,) = ups(w)
    args, env = up
    assert args == [
        "up",
        "-d",
        "--wait",
        "--no-build",
        "--remove-orphans",
        "tunnel-end",
        "tunnel-end-collector",
    ]
    assert env["H4_RELEASE"] == "r1"
    assert env["H4_DIGEST_TUNNEL"] == release["services"]["tunnel-end"]["digest"]
    assert "gateway" not in " ".join(args)
    pulls = [args for _, args, _ in w.docker.calls if args[0] == "pull"]
    assert pulls == [["pull", "tunnel-end", "tunnel-end-collector"]]
    tree = Path(w.docker.calls[0][0])
    assert (tree / "deploy/compose.yaml").read_text().endswith("# r1\n")
    # The collector's queue volume is its image's user's before compose starts it.
    assert w.docker.owned == [("h4reet-prod_tunnel-end-collector-queue", 10001)]
    assert (
        w.plugin.read_bytes() == b"#!compose r1"
        and w.plugin.stat().st_mode & 0o777 == 0o755
    )
    (record,) = w.records()
    assert record == {
        "host": "tunnel-end",
        "release": "r1",
        "commit": release["commit"],
        "outcome": "deployed",
        "at": "2026-11-13T01:02:03Z",
        "started_by": "deployer",
    }
    assert w.aws.alerts == []


def test_the_running_release_runs_nothing_again(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    calls = len(w.docker.calls)
    assert w.run() == 0
    assert len(w.docker.calls) == calls and len(w.records()) == 1


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        ({"commit": "not-a-commit"}, "commit"),
        ({"tree": {"key": "trees/x.tar.gz", "sha256": "0" * 63 + "1"}}, "tree"),
        (
            {
                "services": {
                    "tunnel-end": {
                        "repository": "h4reet/tunnel",
                        "digest": "latest",
                        "hosts": ["tunnel-end"],
                    }
                }
            },
            "digest",
        ),
        (
            {
                "services": {
                    "gateway": {
                        "repository": "h4reet/gateway",
                        "digest": "sha256:" + "a" * 64,
                        "hosts": ["tunnel-end"],
                    }
                }
            },
            "class",
        ),
        (
            {"compose": {"version": "2.39.1", "key": "tools/x", "sha256": "b" * 64}},
            "compose",
        ),
    ],
)
def test_a_release_it_cant_verify_is_refused_and_alerted(
    tmp_path: Path, change: dict, reason: str
) -> None:
    w = World(tmp_path)
    w.release("r1", **change)
    assert w.run() == 1
    assert ups(w) == []
    (alert,) = w.aws.alerts
    assert alert.startswith(
        "[hareet.ai aws] deploy_refused: tunnel-end refused release r1"
    )
    assert f"- reason: {reason}" in alert
    assert w.records()[-1]["outcome"] == "refused"


def test_a_failed_start_returns_to_the_previous_release(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.fail_for = {"r2"}
    assert w.run() == 1
    releases = [env["H4_RELEASE"] for _, env in ups(w)]
    assert releases == ["r1", "r2", "r1"]
    (alert,) = w.aws.alerts
    assert (
        alert.splitlines()[0]
        == "[hareet.ai aws] deploy_rolled_back: tunnel-end returned from r2 to r1"
    )
    assert [r["outcome"] for r in w.records()] == ["deployed", "rolled_back"]
    assert json.loads((w.state / "current.json").read_text())["release"] == "r1"


def test_a_failed_return_alerts_that_too(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.fail_for = {"r1", "r2"}
    assert w.run() == 1
    (alert,) = w.aws.alerts
    assert alert.startswith("[hareet.ai aws] deploy_rollback_failed: tunnel-end")
    assert w.records()[-1]["outcome"] == "rollback_failed"


def test_at_boot_the_last_release_starts_before_the_bucket_is_asked(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.aws.reachable = False
    assert w.run(boot=True) == 0
    (up,) = ups(w)
    assert up[1]["H4_RELEASE"] == "r1"
    assert w.aws.alerts == []


def test_a_bucket_out_of_reach_on_the_timer_changes_nothing(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.aws.reachable = False
    assert w.run() == 0
    assert w.docker.calls == [] and w.records() == []


def test_a_tree_that_escapes_its_folder_is_refused(tmp_path: Path) -> None:
    w = World(tmp_path)
    release = w.release("r1")
    bad = tree_tar({"../outside": "x"})
    w.aws.objects[release["tree"]["key"]] = bad
    release["tree"]["sha256"] = hashlib.sha256(bad).hexdigest()
    w.aws.objects["releases/r1/release.json"] = json.dumps(release).encode()
    assert w.run() == 1
    assert "- reason: tree" in w.aws.alerts[0]
    assert not (tmp_path / "outside").exists()


def test_alerts_carry_no_address_and_no_account() -> None:
    message = dp.alert(
        "deploy_refused",
        "tunnel-end refused release r1",
        [("reason", "tree"), ("release", "r1")],
    )
    assert message.splitlines() == [
        "[hareet.ai aws] deploy_refused: tunnel-end refused release r1",
        "- reason: tree",
        "- release: r1",
    ]
