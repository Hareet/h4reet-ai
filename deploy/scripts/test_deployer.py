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
At boot it starts the last release it recorded before it asks the bucket, from the images it already holds
(`--pull never`, no registry login), so a bucket or a registry it can't reach leaves the host on its last release; and
each run brings that release up again when its services aren't running. Before each `up` it runs the release tree's
own preflight for the host's class, and a refusal there starts nothing (group 5's review, I4 and I7).

The AWS CLI, Docker, and the clock are stood in for: deployer.run takes them as objects.
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import itertools
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
        self.logins: list[str] = []
        self.registry_reachable = True
        # Whether SNS takes the publish (the second review, I-B): a refused one isn't an alert sent.
        self.publish_ok = True
        self.refused_publishes: list[str] = []

    def get(self, bucket: str, key: str) -> bytes | None:
        assert bucket == BUCKET
        if not self.reachable:
            raise dp.Unreachable("the bucket")
        return self.objects.get(key)

    def publish(self, message: str) -> bool:
        if not self.publish_ok:
            self.refused_publishes.append(message)
            return False
        self.alerts.append(message)
        return True

    def login(self, registry: str) -> None:
        if not self.registry_reachable:
            raise dp.Unreachable("ecr")
        self.logins.append(registry)


class Docker:
    def __init__(self) -> None:
        self.calls: list[tuple[str, list[str], dict[str, str]]] = []
        self.fail_for: set[str] = set()
        self.owned: list[tuple[str, int]] = []
        # What runs: the services the last up started, until the test stops them.
        self.up: set[str] = set()
        self.preflight_fails_for: set[str] = set()
        # Releases whose T5, the check after the host step, refuses (group 5's fixes' review, 2).
        self.preflight_after_fails_for: set[str] = set()
        self.host_step_fails_trees: set[str] = set()

    def own_volume(self, name: str, uid: int) -> bool:
        self.owned.append((name, uid))
        return True

    def host_step(self, host: str, tree: Path) -> bool:
        self.calls.append((str(tree), ["host-step", host], {}))
        return host not in self.fail_for and str(tree) not in self.host_step_fails_trees

    def preflight(self, host: str, tree: Path, env_file: Path, phase: str) -> bool:
        self.calls.append((str(tree), ["preflight", host, str(env_file), phase], {}))
        rid = (tree / "deploy/compose.yaml").read_text().split("# ")[-1].strip()
        fails = (
            self.preflight_fails_for
            if phase == "before"
            else self.preflight_after_fails_for
        )
        return rid not in fails

    def running(self, tree: Path, env_files: list[Path], services: list[str]) -> bool:
        return set(services) <= self.up

    def compose(self, tree: Path, env_files: list[Path], args: list[str]) -> bool:
        env: dict[str, str] = {}
        for path in env_files:
            env.update(dp.read_env(path))
        self.calls.append((str(tree), args, env))
        ok = not (args[0] == "up" and env.get("H4_RELEASE") in self.fail_for)
        if args[0] == "up" and ok:
            self.up = {a for a in args[1:] if not a.startswith("-") and a != "never"}
        return ok


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


# Group 6 (tasks.md T164): the tunnel end's host step from the release's tree, before compose pulls or starts
# anything: the shared state's volume, its key and certificate on tmpfs, and its backup timer
# (deploy/hosts/tunnel-end/shared_state.py prepare), so none of it travels in the user data.
def test_the_host_step_runs_from_the_releases_tree_before_anything_starts(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    kinds = [args[0] for _, args, _ in w.docker.calls]
    assert kinds[:5] == ["preflight", "host-step", "preflight", "pull", "up"]
    phases = [args[3] for _, args, _ in w.docker.calls if args[0] == "preflight"]
    assert phases == ["before", "after"]
    (step,) = [c for c in w.docker.calls if c[1][0] == "host-step"]
    assert step[1] == ["host-step", "tunnel-end"]
    assert Path(step[0]) == Path(w.docker.calls[1][0])


def test_a_failed_host_step_is_a_failed_start(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    w.docker.fail_for.add("tunnel-end")
    assert w.run() == 1
    assert [args[0] for _, args, _ in w.docker.calls if args[0] in ("pull", "up")] == []
    assert w.aws.alerts and "deploy_rollback_failed" in w.aws.alerts[0]


def test_the_real_host_step_runs_the_trees_own_script_with_the_hosts_python(
    tmp_path: Path,
) -> None:
    assert dp.HOST_STEPS == {
        "tunnel-end": ("deploy/hosts/tunnel-end/shared_state.py", "prepare"),
        # Group 7's EC2: the gateway's Bedrock credentials and their timer, from the release's tree.
        "ec2": ("deploy/hosts/ec2/ec2_host.py", "prepare"),
    }
    argv = dp.host_step_argv("tunnel-end", tmp_path)
    assert argv == [
        "/usr/bin/python3",
        "-I",
        "-B",
        str(tmp_path / "deploy/hosts/tunnel-end/shared_state.py"),
        "prepare",
        "--tree",
        str(tmp_path),
    ]


# ----------------------------------------------------------------------------------------------------------------------
# Group 5's review, I4: the boot starts the cached images, an unreachable registry changes nothing, and each run brings
# the current release up again when its services aren't running.


def test_at_boot_the_cached_images_start_with_no_login_and_no_pull(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.aws.logins.clear()
    w.docker.up = set()
    w.aws.reachable = False
    w.aws.registry_reachable = False
    assert w.run(boot=True) == 0
    (up,) = ups(w)
    assert up[0][:3] == ["up", "-d", "--wait"] and up[0][-2:] == [
        "tunnel-end",
        "tunnel-end-collector",
    ]
    assert "--pull" in up[0] and up[0][up[0].index("--pull") + 1] == "never"
    assert up[1]["H4_RELEASE"] == "r1"
    assert [args for _, args, _ in w.docker.calls if args[0] == "pull"] == []
    assert w.aws.logins == [] and w.aws.alerts == []


def test_a_registry_out_of_reach_on_the_timer_changes_nothing(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.aws.registry_reachable = False
    assert w.run() == 0
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r1"]
    assert w.aws.alerts == [] and [r["outcome"] for r in w.records()] == ["deployed"]
    assert json.loads((w.state / "current.json").read_text())["release"] == "r1"


@pytest.mark.parametrize("bucket", [True, False], ids=["bucket", "no-bucket"])
def test_the_timer_brings_the_current_release_up_when_it_isnt_running(
    tmp_path: Path, bucket: bool
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.up = {"tunnel-end"}  # the collector stopped
    w.aws.reachable = bucket
    w.aws.registry_reachable = False
    assert w.run() == 0
    up = ups(w)[-1]
    assert len(ups(w)) == 2 and up[1]["H4_RELEASE"] == "r1"
    assert up[0][up[0].index("--pull") + 1] == "never"
    assert w.aws.alerts == [] and len(w.records()) == 1


def test_a_rollback_starts_the_previous_release_from_its_cached_images(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.fail_for = {"r2"}
    assert w.run() == 1
    back = ups(w)[-1]
    assert back[1]["H4_RELEASE"] == "r1"
    assert back[0][back[0].index("--pull") + 1] == "never"


# ----------------------------------------------------------------------------------------------------------------------
# Group 5's review, I7: the release tree's own preflight for the host's class (deploy/scripts/preflight.py
# --host-class tunnel-end) runs before each up, after the host step that writes what its T5 reads; a refusal starts
# nothing and alerts deploy_refused, with the running release kept.


def test_preflight_refuses_a_release_and_the_running_one_stays(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.preflight_fails_for = {"r2"}
    assert w.run() == 1
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r1"]
    (alert,) = w.aws.alerts
    assert alert.startswith(
        "[hareet.ai aws] deploy_refused: tunnel-end refused release r2"
    )
    assert "- reason: preflight" in alert
    assert w.records()[-1]["outcome"] == "refused"
    assert json.loads((w.state / "current.json").read_text())["release"] == "r1"


def test_preflight_refusing_the_first_release_starts_nothing(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    w.docker.preflight_fails_for = {"r1"}
    assert w.run() == 1
    assert ups(w) == []
    assert "- reason: preflight" in w.aws.alerts[0]


def test_preflight_refusing_at_boot_starts_nothing(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.docker.up = set()
    w.aws.reachable = False
    w.docker.preflight_fails_for = {"r1"}
    assert w.run(boot=True) == 0
    assert ups(w) == []
    assert [args[0] for _, args, _ in w.docker.calls].count("preflight") >= 1


def test_the_real_preflight_is_the_trees_own_for_the_hosts_class(
    tmp_path: Path,
) -> None:
    env_file = tmp_path / "tunnel-end.env"
    assert dp.preflight_argv("tunnel-end", tmp_path, env_file, "before") == [
        "/usr/bin/python3",
        "-I",
        "-B",
        str(tmp_path / "deploy/scripts/preflight.py"),
        "--host-class",
        "tunnel-end",
        "--env-file",
        str(env_file),
        "--root",
        str(tmp_path),
        "--phase",
        "before",
    ]


# ----------------------------------------------------------------------------------------------------------------------
# Group 5's fixes' review, 2: what needs no host step is checked before it, so a refusal there leaves the host's files
# as they were; a refusal after it (T5) puts the running release's host files back; a release refused once isn't
# alerted again.


def tree_of(w: World, rid: str) -> str:
    return str(
        w.state
        / "trees"
        / json.loads(w.aws.objects[f"releases/{rid}/release.json"])["commit"]
    )


def test_a_refusal_before_the_host_step_leaves_the_host_files_as_they_were(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.release("r2")
    w.docker.preflight_fails_for = {"r2"}
    assert w.run() == 1
    assert [c for c in w.docker.calls if c[1][0] == "host-step"] == []
    assert "- reason: preflight" in w.aws.alerts[0]


def test_a_refusal_after_the_host_step_puts_the_running_releases_host_files_back(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.release("r2")
    w.docker.preflight_after_fails_for = {"r2"}
    assert w.run() == 1
    steps = [tree for tree, args, _ in w.docker.calls if args[0] == "host-step"]
    assert steps == [tree_of(w, "r2"), tree_of(w, "r1")]
    assert ups(w) == []
    assert "- reason: preflight_after" in w.aws.alerts[0]
    assert json.loads((w.state / "current.json").read_text())["release"] == "r1"


def test_a_release_refused_once_isnt_alerted_again(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.preflight_fails_for = {"r2"}
    assert w.run() == 1
    assert w.run() == 1
    assert w.run() == 1
    assert len(w.aws.alerts) == 1
    assert [r["outcome"] for r in w.records()] == ["deployed", "refused"]
    # The memory is the deployer's state, which outlives a run and a reboot.
    assert (w.state / "refused.json").is_file()
    # A release refused for another reason is alerted, once.
    w.release("r3", commit="not-a-commit")
    assert w.run() == 1 and w.run() == 1
    assert len(w.aws.alerts) == 2 and "- reason: commit" in w.aws.alerts[1]


# ----------------------------------------------------------------------------------------------------------------------
# Group 5's fixes' review, 3: the Author's hold (contracts/releases-deployer.md §4): while the state folder holds
# `hold`, the deployer neither restarts what he stopped nor deploys, at boot or on the timer.


def test_a_hold_keeps_the_deployer_from_starting_or_deploying_anything(
    tmp_path: Path, capsys
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    (w.state / "hold").write_text("the Author, for maintenance\n", encoding="utf-8")
    w.docker.calls.clear()
    w.docker.up = set()  # stopped on purpose
    w.release("r2")
    assert w.run() == 0
    assert w.run(boot=True) == 0
    # Nothing starts or deploys; the hold itself is alerted once (the second review, nit 3).
    assert w.docker.calls == []
    assert [a.splitlines()[-1] for a in w.aws.alerts] == ["- reason: held"]
    assert "held" in capsys.readouterr().err
    assert json.loads((w.state / "current.json").read_text())["release"] == "r1"
    (w.state / "hold").unlink()
    assert w.run() == 0
    assert [env["H4_RELEASE"] for _, env in ups(w)][-1] == "r2"


def test_main_exits_75_for_a_run_that_refused_or_rolled_back_and_alerted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The first step tells a deployer that ran and alerted (75) from one that didn't run at all (any other non-zero
    # exit: a traceback is 1, a usage error 2), and alerts the latter itself (deploy/scripts/deploy_first_step.py).
    monkeypatch.setattr(dp, "run", lambda *a, **k: 1)
    assert dp.main(["--host", "tunnel-end"]) == dp.EXIT_ALERTED == 75
    monkeypatch.setattr(dp, "run", lambda *a, **k: 0)
    assert dp.main(["--host", "tunnel-end"]) == 0


# ----------------------------------------------------------------------------------------------------------------------
# The second review (I-B, I-C, I-E, nit 3): the alert memory keys a pointer's incident on the pointer itself, keeps an
# alert only once SNS took it, reads an unreadable or unwritable memory as nothing seen, forgets on a deploy; a
# refused or rolled-back release isn't tried again each minute; T5's restore checks its host step; a hold alerts once.


def test_a_pointer_incident_is_keyed_on_the_pointer_not_on_latest(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.aws.objects["releases/latest.json"] = b"not json"
    assert w.run() == 1
    w.aws.objects["releases/latest.json"] = b"another, not json"
    assert w.run() == 1
    assert w.run() == 1
    assert len(w.aws.alerts) == 2


def test_an_alert_sns_refused_is_kept_for_the_next_run(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1", commit="not-a-commit")
    w.aws.publish_ok = False
    w.run()
    assert w.aws.alerts == [] and len(w.aws.refused_publishes) == 1
    w.aws.publish_ok = True
    w.run()
    assert len(w.aws.alerts) == 1 and "- reason: commit" in w.aws.alerts[0]


@pytest.mark.parametrize("damage", ["unreadable", "unwritable"])
def test_a_damaged_memory_is_nothing_seen_and_never_silences(
    tmp_path: Path, damage: str
) -> None:
    w = World(tmp_path)
    w.state.mkdir(parents=True)
    if damage == "unreadable":
        (w.state / "refused.json").write_text("{not json", encoding="utf-8")
    else:
        (w.state / "refused.json").mkdir()  # a write over it fails
    w.release("r1", commit="not-a-commit")
    w.run()
    assert len(w.aws.alerts) == 1


def test_a_deploy_forgets_what_was_refused(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1", commit="not-a-commit")
    w.run()
    w.release("r2")
    assert w.run() == 0
    assert (
        not (w.state / "refused.json").exists()
        or json.loads((w.state / "refused.json").read_text()) == {}
    )


def test_t5s_restore_checks_its_host_step_and_isnt_run_again_each_minute(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.preflight_after_fails_for = {"r2"}
    w.docker.host_step_fails_trees = {tree_of(w, "r1")}
    w.run()
    (alert,) = w.aws.alerts
    assert "- reason: preflight_after_restore_failed" in alert
    w.docker.calls.clear()
    w.run()
    assert [c for c in w.docker.calls if c[1][0] == "host-step"] == []
    assert len(w.aws.alerts) == 1


def test_a_rolled_back_release_isnt_started_again_each_minute(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.fail_for = {"r2"}
    assert w.run() == 1
    w.run()
    w.run()
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r1", "r2", "r1"]
    assert len(w.aws.alerts) == 1


def test_a_hold_alerts_once_per_hold(tmp_path: Path) -> None:
    import os

    w = World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    hold = w.state / "hold"
    hold.write_text("maintenance\n", encoding="utf-8")
    w.run()
    w.run(boot=True)
    (alert,) = w.aws.alerts
    assert (
        alert.startswith("[hareet.ai aws] deploy_refused: tunnel-end is held")
        and "- reason: held" in alert
    )
    os.utime(
        hold, ns=(hold.stat().st_mtime_ns + 10**9, hold.stat().st_mtime_ns + 10**9)
    )
    w.run()
    assert len(w.aws.alerts) == 2


# ----------------------------------------------------------------------------------------------------------------------
# The deployer's review (58d5a676..23622319): the retry rule, the record, exit 75, and the S3 errors that aren't the
# network's. The alert memory (refused.json) only deduplicates alerts; the attempt marker (attempts.json) holds which
# release was tried and when it may be tried again; and each attempt is recorded whether or not SNS took its alert.


class Clock:
    def __init__(self) -> None:
        self.t = 1_800_000_000.0

    def __call__(self) -> float:
        return self.t


def timed_run(w: World, clock: Clock, boot: bool = False) -> int:
    return dp.run(
        "tunnel-end",
        env_file=w.env_file,
        state=w.state,
        aws=w.aws,
        docker=w.docker,
        boot=boot,
        plugin=w.plugin,
        now=lambda: "2026-11-13T01:02:03Z",
        clock=clock,
    )


def test_a_host_running_nothing_tries_again_whatever_was_tried(tmp_path: Path) -> None:
    # Review 1: a replaced host starts with nothing running; one failed first start mustn't strand it.
    w, clock = World(tmp_path), Clock()
    w.release("r1")
    w.docker.fail_for = {"r1"}
    assert timed_run(w, clock) == 1
    w.docker.fail_for = set()
    clock.t += 60
    assert timed_run(w, clock) == 0
    assert json.loads((w.state / "current.json").read_text())["release"] == "r1"


def test_the_first_steps_alert_key_doesnt_poison_the_release(tmp_path: Path) -> None:
    # Review 1: the first step's own {rid}:tree key, in the alert memory, isn't an attempt of the deployer's.
    w, clock = World(tmp_path), Clock()
    w.release("r1")
    assert timed_run(w, clock) == 0
    w.release("r2")
    (w.state / "refused.json").write_text(json.dumps({"r2:tree": "first-step"}))
    assert timed_run(w, clock) == 0
    assert json.loads((w.state / "current.json").read_text())["release"] == "r2"


def test_a_rolled_back_release_is_tried_again_at_boot(tmp_path: Path) -> None:
    w, clock = World(tmp_path), Clock()
    w.release("r1")
    assert timed_run(w, clock) == 0
    w.release("r2")
    w.docker.fail_for = {"r2"}
    assert timed_run(w, clock) == 1
    w.docker.fail_for = set()
    assert timed_run(w, clock, boot=True) == 0
    assert json.loads((w.state / "current.json").read_text())["release"] == "r2"


def test_a_rolled_back_release_is_tried_again_after_a_capped_backoff(
    tmp_path: Path,
) -> None:
    w, clock = World(tmp_path), Clock()
    w.release("r1")
    assert timed_run(w, clock) == 0
    w.release("r2")
    w.docker.fail_for = {"r2"}
    tries = []
    for _ in range(400):
        clock.t += 60
        before = len(ups(w))
        timed_run(w, clock)
        if len(ups(w)) > before and ups(w)[before][1]["H4_RELEASE"] == "r2":
            tries.append(clock.t)
    gaps = [b - a for a, b in itertools.pairwise(tries)]
    assert len(tries) >= 3, tries
    assert gaps == sorted(gaps), gaps  # it backs off
    assert max(gaps) <= dp.RETRY_CAP_SECONDS + 60, gaps  # and the backoff is capped
    # One alert for the incident, a record for each attempt.
    assert len(w.aws.alerts) == 1
    assert [r["outcome"] for r in w.records()].count("rolled_back") == len(tries)


def test_each_attempt_is_recorded_and_marked_whether_or_not_sns_takes_the_alert(
    tmp_path: Path,
) -> None:
    # Review 2: while SNS refuses, the release isn't started again each minute, and the record still says so.
    w, clock = World(tmp_path), Clock()
    w.release("r1")
    assert timed_run(w, clock) == 0
    w.release("r2")
    w.docker.fail_for = {"r2"}
    w.aws.publish_ok = False
    assert timed_run(w, clock) == 1
    clock.t += 60
    timed_run(w, clock)
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r1", "r2", "r1"]
    assert [r["outcome"] for r in w.records()] == ["deployed", "rolled_back"]
    assert w.aws.alerts == []
    # The alert itself waits for SNS, and goes once SNS takes it.
    w.aws.publish_ok = True
    clock.t += 60
    timed_run(w, clock)
    assert len(w.aws.alerts) == 1 and "deploy_rolled_back" in w.aws.alerts[0]
    clock.t += 60
    timed_run(w, clock)
    assert len(w.aws.alerts) == 1


def test_the_aws_clis_account_comes_from_the_env_file_it_was_given(
    tmp_path: Path,
) -> None:
    env_file = tmp_path / "ec2.env"
    env_file.write_text(
        "H4_REGISTRY=" + "4" * 12 + ".dkr.ecr.us-east-1.amazonaws.com\n",
        encoding="utf-8",
    )
    assert dp.AwsCli(env_file).account() == "4" * 12


def test_main_exits_75_for_check_and_boot_but_not_for_a_restart(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Review 3: a failed restart (the key's revocation, FR-055) must fail its unit, never read as "refused and alerted".
    monkeypatch.setattr(dp, "run", lambda *a, **k: 1)
    assert dp.main(["--host", "tunnel-end"]) == 75
    assert dp.main(["--host", "tunnel-end", "--boot"]) == 75
    assert dp.main(["--host", "tunnel-end", "--restart", "tunnel-end"]) == 1


class Denied(Aws):
    def get(self, bucket: str, key: str) -> bytes | None:
        raise dp.Misconfigured("AccessDenied")


def test_an_s3_error_that_isnt_the_networks_alerts_once_per_boot(
    tmp_path: Path,
) -> None:
    # Review nit 5: AccessDenied, a bucket that doesn't exist, or an empty RELEASE_BUCKET is no network hiccup.
    w, clock = World(tmp_path), Clock()
    w.aws = Denied()
    assert timed_run(w, clock, boot=True) == 1
    timed_run(w, clock)
    timed_run(w, clock)
    (alert,) = w.aws.alerts
    assert "- reason: bucket" in alert
    assert timed_run(w, clock, boot=True) == 1
    assert len(w.aws.alerts) == 2


def test_an_empty_release_bucket_is_misconfigured_not_out_of_reach(
    tmp_path: Path,
) -> None:
    w, clock = World(tmp_path), Clock()
    w.env_file.write_text("H4_HOST=tunnel-end\nRELEASE_BUCKET=\n", encoding="utf-8")
    assert timed_run(w, clock, boot=True) == 1
    assert "- reason: bucket" in w.aws.alerts[0]


@pytest.mark.parametrize(
    ("said", "kind"),
    [
        (b"fatal error: Could not connect to the endpoint URL", "Unreachable"),
        (b"fatal error: Connect timeout on endpoint URL", "Unreachable"),
        (
            b"An error occurred (AccessDenied) when calling the GetObject",
            "Misconfigured",
        ),
        (
            b"An error occurred (403) when calling the HeadObject operation",
            "Misconfigured",
        ),
        (
            b"An error occurred (NoSuchBucket) when calling the GetObject",
            "Misconfigured",
        ),
        (b"Invalid bucket name", "Misconfigured"),
    ],
)
def test_the_aws_cli_tells_the_network_from_a_refusal(said: bytes, kind: str) -> None:
    assert type(dp.s3_error(said)).__name__ == kind


def test_the_tree_key_is_pinned_to_the_commits(tmp_path: Path) -> None:
    # Review nit 2 (contracts/releases-deployer.md §1): trees/<commit>.tar.gz, and nothing else.
    w = World(tmp_path)
    release = w.release("r1")
    tar = w.aws.objects[release["tree"]["key"]]
    release["tree"]["key"] = "trees/another.tar.gz"
    w.aws.objects["trees/another.tar.gz"] = tar
    w.aws.objects["releases/r1/release.json"] = json.dumps(release).encode()
    assert w.run() == 1
    assert "- reason: tree" in w.aws.alerts[0]


# ----------------------------------------------------------------------------------------------------------------------
# Spec 001 group 7 (tasks.md T082): EC2's part. Its boot asks the bucket before anything starts, and starts its last
# release, alerted, only when the bucket can't be read; it takes its own class's services by their digests, each copy
# its lock line's image, the two the release builds tagged with the laptop's own build names; the hold, the rollback,
# and the record are the tunnel end's; and each run tells its collector h4.deploy.events and h4.release.info.

REGISTRY = "5" * 12 + ".dkr.ecr.us-east-1.amazonaws.com"
EC2_LOCK = {
    name: ("1.0", "sha256:" + format(i, "x") * 64)
    for i, name in enumerate(
        (
            "edge",
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
        )
    )
}


class Ec2Docker(Docker):
    def __init__(self) -> None:
        super().__init__()
        self.tagged: list[tuple[str, str]] = []
        self.metrics: list[dict] = []

    def retag(self, source: str, target: str) -> bool:
        self.calls.append(("", ["retag", source, target], {}))
        self.tagged.append((source, target))
        return True

    def post_metrics(self, host: str, payload: dict) -> None:
        assert host == "ec2"
        self.metrics.append(payload)


class Ec2World(World):
    def __init__(self, tmp_path: Path) -> None:
        super().__init__(tmp_path)
        self.docker = Ec2Docker()
        self.env_file = tmp_path / "ec2.env"
        self.env_file.write_text(
            f"H4_HOST=ec2\nRELEASE_BUCKET={BUCKET}\nH4_REGISTRY={REGISTRY}\n",
            encoding="utf-8",
        )

    def release(self, rid: str, **override: object) -> dict:  # type: ignore[override]
        lock_text = "".join(
            f"{name} repo {tag} {d} r 2026-11-13\n"
            for name, (tag, d) in EC2_LOCK.items()
        )
        files = {
            "deploy/compose.yaml": f"services: {{}}  # {rid}\n",
            "deploy/images.lock": lock_text,
        }
        tar = tree_tar(files)
        c = commit()
        compose_binary = b"#!compose " + rid.encode()
        services: dict[str, dict] = {
            name: {
                "repository": f"h4reet/{name}",
                "digest": digest(),
                "hosts": ["ec2", "laptop"],
            }
            for name in ("gateway", "web")
        }
        for name in dp.HOST_CLASSES["ec2"]:
            if name in services:
                continue
            source = dp.COPIES.get(name, name)
            tag, d = EC2_LOCK[source]
            services[name] = {
                "repository": f"h4reet/{source}",
                "tag": tag,
                "digest": d,
                "hosts": ["ec2"],
            }
        release = {
            "release": rid,
            "commit": c,
            "tree": {
                "key": f"trees/{c}.tar.gz",
                "sha256": hashlib.sha256(tar).hexdigest(),
            },
            "compose": {
                "version": "2.39.1",
                "key": "tools/docker-compose-2.39.1-linux-aarch64",
                "sha256": hashlib.sha256(compose_binary).hexdigest(),
            },
            "services": services,
        }
        release.update(override)
        self.aws.objects[release["tree"]["key"]] = tar  # type: ignore[index]
        self.aws.objects[release["compose"]["key"]] = compose_binary  # type: ignore[index]
        self.aws.objects[f"releases/{rid}/release.json"] = json.dumps(release).encode()
        self.aws.objects["releases/latest.json"] = json.dumps({"release": rid}).encode()
        return release

    def run(self, boot: bool = False) -> int:
        return dp.run(
            "ec2",
            env_file=self.env_file,
            state=self.state,
            aws=self.aws,
            docker=self.docker,
            boot=boot,
            plugin=self.plugin,
            now=lambda: "2026-11-13T01:02:03Z",
        )


def test_ec2_takes_its_class_its_copies_by_the_locks_digests_and_tags_its_builds(
    tmp_path: Path,
) -> None:
    w = Ec2World(tmp_path)
    release = w.release("r1")
    assert w.run() == 0
    (up,) = ups(w)
    args, env = up
    assert args[-len(dp.HOST_CLASSES["ec2"]) :] == list(dp.HOST_CLASSES["ec2"])
    assert env["H4_REF"] == release["commit"] and env["H4_WEB_SUFFIX"] == ""
    tag, d = EC2_LOCK["edge"]
    assert env["H4_IMAGE_EDGE"] == f"{REGISTRY}/h4reet/edge:{tag}@{d}"
    assert "H4_IMAGE_EC2_RELAY_BLOCK" not in env and "H4_IMAGE_GATEWAY" not in env
    # In the class's order: web, then the gateway.
    assert w.docker.tagged == [
        (
            f"{REGISTRY}/h4reet/web@{release['services']['web']['digest']}",
            f"h4reet-web:{release['commit']}",
        ),
        (
            f"{REGISTRY}/h4reet/gateway@{release['services']['gateway']['digest']}",
            f"h4reet-gateway:{release['commit']}",
        ),
    ]
    (pull,) = [a for _, a, _ in w.docker.calls if a[0] == "pull"]
    assert "gateway" not in pull and "web" not in pull and "edge" in pull
    # Its host step, from the release's tree: the gateway's proxy and its Bedrock credentials.
    assert ["host-step", "ec2"] in [a for _, a, _ in w.docker.calls]
    assert w.records()[-1]["host"] == "ec2"


def test_a_copy_that_isnt_its_lock_lines_image_is_refused(tmp_path: Path) -> None:
    w = Ec2World(tmp_path)
    release = w.release("r1")
    release["services"]["loki"]["digest"] = digest()
    w.aws.objects["releases/r1/release.json"] = json.dumps(release).encode()
    assert w.run() == 1
    assert ups(w) == []
    assert "- reason: pin" in w.aws.alerts[0]


def test_ec2s_boot_asks_the_bucket_before_anything_starts(tmp_path: Path) -> None:
    w = Ec2World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.calls.clear()
    w.docker.up = set()
    assert w.run(boot=True) == 0
    # The new release, and never the old one first.
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r2"]


def test_ec2s_boot_with_the_bucket_out_of_reach_starts_its_last_release_and_alerts(
    tmp_path: Path,
) -> None:
    w = Ec2World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.docker.up = set()
    w.aws.reachable = False
    assert w.run(boot=True) == 0
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r1"]
    (alert,) = w.aws.alerts
    assert alert.startswith(
        "[hareet.ai aws] deploy_refused: ec2 started its last release, r1, without the release bucket"
    )
    assert "- reason: unreachable" in alert


def test_ec2s_boot_with_the_latest_already_running_starts_it_once(
    tmp_path: Path,
) -> None:
    w = Ec2World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.docker.up = set()
    assert w.run(boot=True) == 0
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r1"]
    assert w.aws.alerts == []


def test_ec2s_failed_start_rolls_back_and_its_hold_holds(tmp_path: Path) -> None:
    w = Ec2World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.release("r2")
    w.docker.fail_for = {"r2"}
    assert w.run() == 1
    assert [env["H4_RELEASE"] for _, env in ups(w)] == ["r1", "r2", "r1"]
    assert "deploy_rolled_back: ec2 returned from r2 to r1" in w.aws.alerts[0]
    assert [r["host"] for r in w.records()] == ["ec2", "ec2"]
    (w.state / "hold").write_text("the Author\n", encoding="utf-8")
    w.docker.calls.clear()
    w.release("r3")
    assert w.run() == 0 and ups(w) == []


def metric(payloads: list[dict], name: str) -> list[dict]:
    return [
        {a["key"]: a["value"]["stringValue"] for a in p["attributes"]}
        for payload in payloads
        for m in payload["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
        if m["name"] == name
        for p in (m.get("sum") or m.get("gauge"))["dataPoints"]
    ]


def test_each_run_tells_the_collector_its_deployments_and_its_release(
    tmp_path: Path,
) -> None:
    # FR-049 and FR-060: h4.deploy.events by host and outcome, h4.release.info by host with who started it.
    w = Ec2World(tmp_path)
    release = w.release("r1")
    assert w.run() == 0
    assert w.run() == 0
    events = metric(w.docker.metrics, "h4.deploy.events")
    assert events == [{"h4.host": "ec2", "outcome": "deployed"}]
    info = metric(w.docker.metrics, "h4.release.info")
    assert info[-1] == {
        "h4.host": "ec2",
        "h4.release": "r1",
        "h4.commit": release["commit"][:12],
        "h4.started_by": "deployer",
    }
    assert len(info) == 2  # each run says what runs
    text = json.dumps(w.docker.metrics)
    assert REGISTRY not in text and "sha256:" not in text
