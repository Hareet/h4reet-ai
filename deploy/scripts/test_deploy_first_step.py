"""Tests for deploy/scripts/deploy_first_step.py, a cloud host's deployer's first step (spec 001 contracts/releases-
deployer.md §3; plan.md §16, "From the release": the Author's answer of 2026-11-13, "From the release (Recommended)").

The user data carries this small step, not the deployer. Each run, at boot, on the timer, and for the key's revocation:
  1. the release the host last started (the deployer's state, current.json): its tree, which the deployer exported,
     holds deploy/scripts/deployer.py, which it runs with the host's python and the run's own arguments;
  2. before any release has started there: it fetches the newest release's tree from the release bucket as the deployer
     does, held to release.json's SHA-256, every member inside its folder, into the deployer's own tree folder, and runs
     that tree's deployer, which verifies the whole release again before anything starts;
  3. no release in the bucket yet, or the bucket out of reach: nothing runs, nothing is alerted, and the timer asks again;
  4. a tree that isn't release.json's: deploy_refused, reason tree, once per release (refused.json, the deployer's own
     memory), and nothing runs;
  5. a deployer that doesn't run (it exits other than 0, or 75, the deployer's "refused or rolled back, and alerted"):
     deploy_refused, reason deployer, once per release, and the previous release's deployer runs instead, so a broken
     deployer never keeps the host from the next release; with no previous release, the alert stands alone.

The AWS CLI and the deployer's process are stood in for: run() takes them as objects.
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
SPEC = importlib.util.spec_from_file_location(
    "deploy_first_step", HERE / "deploy_first_step.py"
)
assert SPEC and SPEC.loader
fs = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = fs
SPEC.loader.exec_module(fs)

BUCKET = "h4reet-ai-releases-" + "q" * 8


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
        self.publish_ok = True

    def get(self, bucket: str, key: str) -> bytes | None:
        assert bucket == BUCKET
        if not self.reachable:
            raise fs.Unreachable("the bucket")
        return self.objects.get(key)

    def publish(self, message: str) -> bool:
        if self.publish_ok:
            self.alerts.append(message)
        return self.publish_ok


class Runner:
    """The deployer's process: each argv run, and the exit code each tree's deployer gives."""

    def __init__(self) -> None:
        self.ran: list[list[str]] = []
        self.codes: dict[str, int] = {}

    def __call__(self, argv: list[str]) -> int:
        self.ran.append(list(argv))
        script = Path(argv[3])
        return self.codes.get(script.parents[2].name, 0)


class World:
    def __init__(self, tmp_path: Path) -> None:
        self.aws, self.runner = Aws(), Runner()
        self.state = tmp_path / "state"
        self.env_file = tmp_path / "tunnel-end.env"
        self.env_file.write_text(
            f"H4_HOST=tunnel-end\nRELEASE_BUCKET={BUCKET}\n", encoding="utf-8"
        )

    def release(self, rid: str, tar: bytes | None = None) -> dict:
        commit = secrets.token_hex(20)
        tar = (
            tar
            if tar is not None
            else tree_tar({"deploy/scripts/deployer.py": f"# {rid}\n"})
        )
        release = {
            "release": rid,
            "commit": commit,
            "tree": {
                "key": f"trees/{commit}.tar.gz",
                "sha256": hashlib.sha256(tar).hexdigest(),
            },
        }
        self.aws.objects[release["tree"]["key"]] = tar
        self.aws.objects[f"releases/{rid}/release.json"] = json.dumps(release).encode()
        self.aws.objects["releases/latest.json"] = json.dumps({"release": rid}).encode()
        return release

    def started(self, release: dict, name: str = "current") -> Path:
        """The deployer's state after it started a release: its record and its exported tree."""
        tree = self.state / "trees" / release["commit"]
        (tree / "deploy" / "scripts").mkdir(parents=True, exist_ok=True)
        (tree / "deploy" / "scripts" / "deployer.py").write_text(
            f"# {release['release']}\n"
        )
        self.state.mkdir(parents=True, exist_ok=True)
        (self.state / f"{name}.json").write_text(json.dumps(release))
        return tree

    def run(self, *args: str) -> int:
        return fs.run(
            "tunnel-end",
            env_file=self.env_file,
            state=self.state,
            aws=self.aws,
            runner=self.runner,
            args=list(args),
        )


def deployer_argv(tree: Path, w: World, *args: str) -> list[str]:
    return [
        "/usr/bin/python3",
        "-I",
        "-B",
        str(tree / "deploy" / "scripts" / "deployer.py"),
        "--host",
        "tunnel-end",
        "--env-file",
        str(w.env_file),
        "--state",
        str(w.state),
        *args,
    ]


def test_it_runs_the_current_releases_own_deployer_with_the_runs_arguments(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    tree = w.started(w.release("r1"))
    assert w.run("--boot") == 0
    assert w.runner.ran == [deployer_argv(tree, w, "--boot")]
    assert w.run("--restart", "tunnel-end") == 0
    assert w.runner.ran[-1] == deployer_argv(tree, w, "--restart", "tunnel-end")
    assert w.aws.alerts == []


def test_a_deployer_that_refused_and_alerted_ran(tmp_path: Path) -> None:
    w = World(tmp_path)
    tree = w.started(w.release("r1"))
    w.runner.codes[tree.name] = fs.DEPLOYER_ALERTED
    assert w.run() == 0
    assert w.aws.alerts == []


def test_before_any_release_started_it_fetches_the_newest_tree_and_runs_its_deployer(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    release = w.release("r1")
    assert w.run() == 0
    tree = w.state / "trees" / release["commit"]
    assert (tree / "deploy" / "scripts" / "deployer.py").read_text() == "# r1\n"
    assert w.runner.ran == [deployer_argv(tree, w)]
    assert not (
        w.state / "current.json"
    ).exists()  # the deployer records it once it starts the release


def test_no_release_yet_runs_nothing_and_alerts_nothing(tmp_path: Path, capsys) -> None:
    w = World(tmp_path)
    assert w.run("--boot") == 0
    assert w.runner.ran == [] and w.aws.alerts == []
    assert "no release yet" in capsys.readouterr().out


def test_the_bucket_out_of_reach_before_any_release_runs_nothing(
    tmp_path: Path, capsys
) -> None:
    w = World(tmp_path)
    w.release("r1")
    w.aws.reachable = False
    assert w.run() == 0
    assert w.runner.ran == [] and w.aws.alerts == []
    assert "can't be reached" in capsys.readouterr().err


@pytest.mark.parametrize("bad", ["sha", "escape", "link"])
def test_a_tree_that_isnt_the_releases_is_refused_once_and_nothing_runs(
    tmp_path: Path, bad: str
) -> None:
    w = World(tmp_path)
    if bad == "escape":
        release = w.release("r1", tree_tar({"../outside": "x"}))
    elif bad == "link":
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            info = tarfile.TarInfo("deploy/scripts/deployer.py")
            info.type, info.linkname = tarfile.SYMTYPE, "/etc/passwd"
            tar.addfile(info)
        release = w.release("r1", buf.getvalue())
    else:
        release = w.release("r1")
        w.aws.objects[release["tree"]["key"]] = b"another tree"
    assert w.run() == 1
    assert w.run() == 1
    assert w.runner.ran == []
    (alert,) = w.aws.alerts
    assert alert.splitlines()[:2] == [
        "[hareet.ai aws] deploy_refused: tunnel-end refused release r1",
        "- reason: tree",
    ]
    assert not (tmp_path / "outside").exists()
    assert json.loads((w.state / "refused.json").read_text())


def test_a_deployer_that_doesnt_run_alerts_once_and_the_previous_releases_runs(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    old = w.started(w.release("r1"), "previous")
    new = w.started(w.release("r2"))
    w.runner.codes[new.name] = (
        1  # a traceback, a syntax error: no exit the deployer gives
    )
    assert w.run() == 0
    assert w.runner.ran == [deployer_argv(new, w), deployer_argv(old, w)]
    (alert,) = w.aws.alerts
    assert alert.splitlines() == [
        "[hareet.ai aws] deploy_refused: tunnel-end couldn't run release r2's deployer",
        "- reason: deployer",
        "- release: r2",
        "- fallback: r1",
    ]
    assert w.run() == 0
    assert len(w.aws.alerts) == 1


def test_a_deployer_that_doesnt_run_with_no_previous_alerts_and_fails(
    tmp_path: Path,
) -> None:
    w = World(tmp_path)
    new = w.started(w.release("r1"))
    w.runner.codes[new.name] = 2
    assert w.run() == 1
    (alert,) = w.aws.alerts
    assert "- reason: deployer" in alert and "- fallback: none" in alert


def test_the_real_runner_and_the_deployers_exit_for_an_alerted_refusal() -> None:
    dp_spec = importlib.util.spec_from_file_location(
        "deployer_for_first_step", HERE / "deployer.py"
    )
    assert dp_spec and dp_spec.loader
    dp = importlib.util.module_from_spec(dp_spec)
    sys.modules[dp_spec.name] = dp
    dp_spec.loader.exec_module(dp)
    assert fs.DEPLOYER_ALERTED == dp.EXIT_ALERTED == 75


def test_it_keeps_to_amazon_linux_2023s_python_and_the_standard_library() -> None:
    import ast

    text = (HERE / "deploy_first_step.py").read_text(encoding="utf-8")
    tree = ast.parse(text, feature_version=(3, 9))
    assert text.startswith("#!/usr/bin/env python3\n")
    allowed = {
        "__future__",
        "argparse",
        "hashlib",
        "io",
        "json",
        "os",
        "re",
        "shutil",
        "subprocess",
        "sys",
        "tarfile",
        "fcntl",
        "signal",
        "time",
        "pathlib",
        "collections",
        "typing",
    }
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            assert {a.name.split(".")[0] for a in node.names} <= allowed
        if isinstance(node, ast.ImportFrom):
            assert (node.module or "").split(".")[0] in allowed


def test_an_alert_sns_refused_is_sent_on_the_next_run(tmp_path: Path) -> None:
    # The second review's I-B, as the deployer takes it: the memory keeps an alert only once SNS took it.
    w = World(tmp_path)
    new = w.started(w.release("r1"))
    w.runner.codes[new.name] = 1
    w.aws.publish_ok = False
    w.run()
    assert w.aws.alerts == []
    w.aws.publish_ok = True
    w.run()
    assert len(w.aws.alerts) == 1


# ----------------------------------------------------------------------------------------------------------------------
# The deployer's review (58d5a676..23622319): the first boot's deployer that doesn't run, a restart's exit, the lock,
# the S3 errors that aren't the network's, and a missing env file.


def test_on_first_boot_a_deployer_that_doesnt_run_alerts_once(tmp_path: Path) -> None:
    # Review 4: no release started yet, the newest one's deployer fails: deploy_refused, reason deployer, once.
    w = World(tmp_path)
    release = w.release("r1")
    w.runner.codes[release["commit"]] = 1
    assert w.run("--boot") == 1
    assert w.run() == 1
    (alert,) = w.aws.alerts
    assert alert.splitlines() == [
        "[hareet.ai aws] deploy_refused: tunnel-end couldn't run release r1's deployer",
        "- reason: deployer",
        "- release: r1",
        "- fallback: none",
    ]


def test_a_restarts_exit_passes_through_with_no_fallback(tmp_path: Path) -> None:
    # Review 3: the key's revocation restarts the sshd; its failure must fail the unit, and nothing else runs.
    w = World(tmp_path)
    w.started(w.release("r1"), "previous")
    new = w.started(w.release("r2"))
    w.runner.codes[new.name] = 1
    assert w.run("--restart", "tunnel-end") == 1
    assert w.runner.ran == [deployer_argv(new, w, "--restart", "tunnel-end")]
    assert w.aws.alerts == []
    w.runner.codes[new.name] = fs.DEPLOYER_ALERTED
    assert w.run("--restart", "tunnel-end") == fs.DEPLOYER_ALERTED


def test_runs_take_a_lock_on_the_state_folder(tmp_path: Path) -> None:
    # Review nit 4: --boot and the timer's run never share a tree's partial folder.
    import fcntl

    w = World(tmp_path)
    w.started(w.release("r1"))
    seen = []

    def runner(argv: list[str]) -> int:
        with open(w.state / ".lock", "a+") as other:
            try:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
                seen.append("free")
            except BlockingIOError:
                seen.append("held")
        return 0

    w.runner = runner  # type: ignore[assignment]
    assert w.run() == 0
    assert seen == ["held"]


class Denied(Aws):
    def get(self, bucket: str, key: str) -> bytes | None:
        raise fs.Misconfigured("AccessDenied")


def test_an_s3_error_that_isnt_the_networks_alerts_once_per_boot(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Review nit 5.
    boot = ["boot-1"]
    monkeypatch.setattr(fs, "boot_id", lambda: boot[0])
    w = World(tmp_path)
    w.aws = Denied()
    assert w.run("--boot") == 1
    assert w.run() == 1
    (alert,) = w.aws.alerts
    assert "- reason: bucket" in alert
    boot[0] = "boot-2"
    assert w.run("--boot") == 1
    assert len(w.aws.alerts) == 2


def test_an_empty_release_bucket_alerts_rather_than_waits(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fs, "boot_id", lambda: "boot-1")
    w = World(tmp_path)
    w.env_file.write_text("H4_HOST=tunnel-end\nRELEASE_BUCKET=\n", encoding="utf-8")
    assert w.run("--boot") == 1
    assert "- reason: bucket" in w.aws.alerts[0]


def test_a_missing_env_file_doesnt_crash_the_alert(tmp_path: Path) -> None:
    # Review nit 5: write_env.py refused, so no env file; the AWS CLI's publish can't find the account.
    w = World(tmp_path)
    w.env_file.unlink()
    cli = fs.AwsCli(w.env_file)
    fs.alert_once(w.state, cli, "k", ["[hareet.ai aws] deploy_refused: x"])
    assert w.run("--boot") == 1


def test_the_real_runner_waits_for_the_deployers_worst_case_and_kills_its_group() -> (
    None
):
    # Review nit 4: the deployer's worst case is about 2,760 s; the runner's timeout is longer, and kills the group.
    import inspect

    source = inspect.getsource(fs.process)
    assert "start_new_session=True" in source and "killpg" in source
    assert fs.DEPLOYER_TIMEOUT >= 3600


def test_the_tree_key_is_pinned_to_the_commits(tmp_path: Path) -> None:
    # Review nit 2: the first step and the deployer take one key, trees/<commit>.tar.gz.
    w = World(tmp_path)
    release = w.release("r1")
    tar = w.aws.objects[release["tree"]["key"]]
    release["tree"]["key"] = "trees/another.tar.gz"
    w.aws.objects["trees/another.tar.gz"] = tar
    w.aws.objects["releases/r1/release.json"] = json.dumps(release).encode()
    assert w.run() == 1
    assert w.runner.ran == []
    assert "- reason: tree" in w.aws.alerts[0]
