"""Tests for deploy/seaweedfs/entrypoint.sh, run with a fake weed and a fake wget.

The script's container paths (/tmp, a tmpfs, and /data, the volume) are moved under tmp_path in a copy of it, which is
the only change made to what runs.
"""

from __future__ import annotations

import json
import os
import signal
import stat
import subprocess
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "deploy" / "seaweedfs" / "entrypoint.sh"
ACCESS = "AB12" * 5  # 20 uppercase hex, the generated shape
SECRET = "c0ffee" * 10 + "c0de"  # 64 lowercase hex

# The fake weed: `server -h` prints a flag listing; `-logtostderr=true server ...` logs its arguments and runs until
# stopped (or exits at once with FAKE_WEED_EXIT); `-logtostderr=true shell ...` answers s3.bucket.list from, and
# s3.bucket.create into, a state file.
FAKE_WEED = """#!/usr/bin/env python3
import json, os, signal, sys, time
args = sys.argv[1:]
log = os.environ["FAKE_WEED_LOG"]
def record(kind, extra=None):
    with open(log, "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"kind": kind, "args": args, "extra": extra}) + "\\n")
if args[:2] == ["server", "-h"]:
    sys.stdout.write(open(os.environ["FAKE_WEED_HELP"], encoding="utf-8").read())
    sys.exit(0)
if args[1:2] == ["server"]:
    record("server")
    if os.environ.get("FAKE_WEED_EXIT"):
        sys.exit(int(os.environ["FAKE_WEED_EXIT"]))
    signal.signal(signal.SIGTERM, lambda *_: (record("stopped"), sys.exit(0)))
    while True:
        time.sleep(0.1)
if args[1:2] == ["shell"]:
    state = os.environ["FAKE_WEED_STATE"]
    buckets = open(state, encoding="utf-8").read().split() if os.path.exists(state) else []
    for line in sys.stdin.read().splitlines():
        record("shell", line)
        if line == "s3.bucket.list":
            for bucket in buckets:
                print(f"  {bucket}\\tsize:0\\tchunk:0")
        elif line.startswith("s3.bucket.create -name "):
            buckets.append(line.split()[-1])
            with open(state, "w", encoding="utf-8") as handle:
                handle.write("\\n".join(buckets) + "\\n")
    sys.exit(0)
sys.exit(2)
"""

# The fake wget: fails FAKE_WGET_FAILS times (a master not up yet), then answers.
FAKE_WGET = """#!/usr/bin/env python3
import os, sys
count = os.environ["FAKE_WGET_COUNT"]
seen = int(open(count).read()) if os.path.exists(count) else 0
open(count, "w").write(str(seen + 1))
if seen < int(os.environ.get("FAKE_WGET_FAILS", "0")):
    sys.exit(4)
print("{}")
"""

HELP = """Usage: weed server -dir=/tmp
  -dir string
    \tdirectories to store data files
  -master.port int
    \tmaster server http listen port (default 9333)
  -master.telemetry
    \tsend anonymous usage statistics
  -master.telemetry.url string
    \twhere usage statistics go
  -s3
    \twhether to start S3 gateway
"""


class Stage:
    def __init__(self, tmp_path: Path, help_text: str = HELP) -> None:
        self.tmp = tmp_path
        self.run_dir = tmp_path / "run"  # the container's /tmp, a tmpfs
        self.data = tmp_path / "data"  # its /data, the volume
        self.run_dir.mkdir()
        self.data.mkdir()
        text = SCRIPT.read_text(encoding="utf-8")
        assert text.count("/tmp/") >= 3 and "-dir=/data" in text
        text = text.replace("/tmp/", f"{self.run_dir}/").replace(
            "-dir=/data", f"-dir={self.data}"
        )
        self.script = tmp_path / "entrypoint.sh"
        self.script.write_text(text, encoding="utf-8")
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        for name, body in (("weed", FAKE_WEED), ("wget", FAKE_WGET)):
            (bin_dir / name).write_text(body, encoding="utf-8")
            (bin_dir / name).chmod(0o755)
        (tmp_path / "help.txt").write_text(help_text, encoding="utf-8")
        self.log = tmp_path / "weed.log"
        self.state = tmp_path / "buckets"
        self.environ = {
            "PATH": f"{bin_dir}:/usr/bin:/bin",
            "SEAWEEDFS_S3_ACCESS_KEY": ACCESS,
            "SEAWEEDFS_S3_SECRET_KEY": SECRET,
            "FAKE_WEED_LOG": str(self.log),
            "FAKE_WEED_HELP": str(tmp_path / "help.txt"),
            "FAKE_WEED_STATE": str(self.state),
            "FAKE_WGET_COUNT": str(tmp_path / "wget.count"),
            "FAKE_WGET_FAILS": "1",
        }

    def start(self, **environ: str) -> subprocess.Popen:
        return subprocess.Popen(
            ["sh", str(self.script)],
            env={**self.environ, **environ},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def calls(self, kind: str) -> list[dict]:
        if not self.log.exists():
            return []
        found = [
            json.loads(line)
            for line in self.log.read_text(encoding="utf-8").splitlines()
        ]
        return [c for c in found if c["kind"] == kind]

    def wait_ready(self, proc: subprocess.Popen) -> None:
        deadline = time.monotonic() + 20
        while not (self.run_dir / "h4-bucket-ready").exists():
            assert proc.poll() is None, proc.communicate()
            assert time.monotonic() < deadline, "the bucket never got ready"
            time.sleep(0.1)


@pytest.fixture
def stage(tmp_path: Path) -> Stage:
    return Stage(tmp_path)


def stop(proc: subprocess.Popen) -> tuple[int, str, str]:
    proc.send_signal(signal.SIGTERM)
    out, err = proc.communicate(timeout=20)
    return proc.returncode, out, err


def test_it_renders_the_identity_starts_weed_and_makes_the_bucket(stage: Stage) -> None:
    proc = stage.start()
    stage.wait_ready(proc)
    identity = stage.run_dir / "s3.json"
    assert stat.S_IMODE(identity.stat().st_mode) == 0o600
    assert json.loads(identity.read_text(encoding="utf-8")) == {
        "identities": [
            {
                "name": "langfuse",
                "credentials": [{"accessKey": ACCESS, "secretKey": SECRET}],
                "actions": ["Read", "Write", "List", "Tagging"],
            }
        ]
    }
    (server,) = stage.calls("server")
    assert server["args"] == [
        "-logtostderr=true",
        "server",
        f"-dir={stage.data}",
        "-s3",
        "-s3.port=8333",
        f"-s3.config={stage.run_dir}/s3.json",
        "-master.telemetry=false",  # the pinned version's usage reporting, off
    ]
    assert stage.state.read_text(encoding="utf-8").split() == ["langfuse"]
    code, out, err = stop(proc)
    assert code == 0 and stage.calls("stopped")
    assert "the langfuse bucket is ready" in out
    assert "-master.telemetry.url string, which this script leaves alone" in err
    # The keys never reach the output.
    assert ACCESS not in out + err and SECRET not in out + err


def test_a_bucket_already_there_is_kept_as_it_is(stage: Stage) -> None:
    stage.state.write_text("langfuse\n", encoding="utf-8")
    proc = stage.start()
    stage.wait_ready(proc)
    assert [c["extra"] for c in stage.calls("shell")] == ["s3.bucket.list"]
    assert stop(proc)[0] == 0


def test_a_version_without_the_switch_gets_no_flag(tmp_path: Path) -> None:
    stage = Stage(tmp_path, help_text="  -dir string\n  -s3\n")
    proc = stage.start(FAKE_WGET_FAILS="0")
    stage.wait_ready(proc)
    (server,) = stage.calls("server")
    assert not [a for a in server["args"] if "telemetry" in a]
    assert stop(proc)[0] == 0


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("SEAWEEDFS_S3_ACCESS_KEY", ""),
        ("SEAWEEDFS_S3_SECRET_KEY", 'ab"},{"accessKey":"x'),
        ("SEAWEEDFS_S3_SECRET_KEY", "has space"),
    ],
)
def test_keys_out_of_shape_are_refused_and_never_printed(
    stage: Stage, key: str, value: str
) -> None:
    proc = stage.start(**{key: value})
    out, err = proc.communicate(timeout=20)
    assert proc.returncode == 1 and key in err
    if value:
        assert value not in out + err
    assert not (stage.run_dir / "s3.json").exists() and stage.calls("server") == []


def test_a_server_that_dies_at_start_fails_the_container(stage: Stage) -> None:
    proc = stage.start(FAKE_WEED_EXIT="3", FAKE_WGET_FAILS="1000")
    _, err = proc.communicate(timeout=30)
    assert (
        proc.returncode == 1 and "weed server exited before its master answered" in err
    )
    assert not (stage.run_dir / "h4-bucket-ready").exists()


def test_the_script_is_posix_sh_and_reads_no_file_but_its_own() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    assert text.startswith("#!/bin/sh\n") and "set -eu" in text
    for word in ("eval ", "source ", "bash"):
        assert word not in text, word
    assert os.access(SCRIPT, os.R_OK)
