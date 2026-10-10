"""Tests for make contract-live (contracts/provider-adapter.md §5.3, §5.4; tasks.md T103, T092).

Each runs make with an environment it sets itself. The refusals stop before the target calls anything: an agent
session, a missing REASON or ADAPTER, bedrock off prod, no tools/gates/gate to replay with, and a live-cases.json
that differs from HEAD's, since the recorder reads the working tree's and the replay HEAD's (T092). The run itself
is shown in a repository of its own, with stand-ins for operator.py and the gate that record how they were called.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
REASON = "REASON=a refusal test of make contract-live"


def make(*args: str, sandbox: bool) -> subprocess.CompletedProcess[str]:
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/tmp"),
    }
    if sandbox:
        env["SANDBOX_RUNTIME"] = "1"
    return subprocess.run(
        ["make", "-f", "Makefile", "--no-print-directory", "contract-live", *args],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


@pytest.mark.parametrize(
    ("args", "sandbox", "says"),
    [
        (
            ("ENV=dev-cpu", "ADAPTER=local", REASON),
            True,
            "make contract-live is the Author's",
        ),
        (("ENV=dev", "ADAPTER=local"), False, "needs REASON="),
        (("ENV=dev", REASON), False, "needs ADAPTER=local or ADAPTER=bedrock"),
        (
            ("ENV=dev", "ADAPTER=other", REASON),
            False,
            "needs ADAPTER=local or ADAPTER=bedrock",
        ),
        (("ENV=dev", "ADAPTER=bedrock", REASON), False, "bedrock is prod's adapter"),
    ],
)
def test_refuses_before_calling_anything(
    args: tuple[str, ...], sandbox: bool, says: str
) -> None:
    done = make(*args, sandbox=sandbox)
    assert done.returncode == 2
    assert says in done.stderr
    assert "contract-record" not in done.stdout + done.stderr


def test_reads_the_adapter_through_the_shell_never_splicing_it_into_a_command() -> None:
    # make reads ADAPTER as "$ADAPTER" (the Makefile's rule for values), so quotes in it can't end the string.
    done = make("ENV=prod", 'ADAPTER=x"; echo SPLICED >&2; "', REASON, sandbox=False)
    assert done.returncode == 2
    assert "needs ADAPTER=local or ADAPTER=bedrock" in done.stderr
    assert "SPLICED" not in done.stdout + done.stderr


# --------------------------------------------------------------------------------------------------
# The run, in a repository of its own: the case file is held to HEAD's before anything is recorded (T092)
# --------------------------------------------------------------------------------------------------
CASES = "services/gateway/test/contract/live-cases.json"
SYSTEM_PATH = "/usr/local/bin:/usr/bin:/bin"
# operator.py's stand-in: logs its arguments and writes a recording where --out says.
OPERATOR = """import json, sys
from pathlib import Path
with Path({log!r}).open("a") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
out = sys.argv[sys.argv.index("--out") + 1]
Path(out).write_text(json.dumps({{"adapter": "local", "cases": []}}))
"""
# The gate's stand-in: logs its arguments and the recording it was handed, if it was there to replay.
GATE = """#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
file = sys.argv[-1]
entry = {{"argv": sys.argv[1:], "recording": os.path.isfile(file) and json.loads(Path(file).read_text())}}
with Path({log!r}).open("a") as log:
    log.write(json.dumps(entry) + "\\n")
"""


def git(cwd: Path, *args: str) -> None:
    subprocess.run(
        [
            "git",
            "-C",
            str(cwd),
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.invalid",
            *args,
        ],
        env={"PATH": SYSTEM_PATH, "HOME": str(cwd), "GIT_CONFIG_NOSYSTEM": "1"},
        capture_output=True,
        check=True,
    )


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """The Makefile in a repository of its own, with the case file committed and the stand-ins in place."""
    root = tmp_path / "project"
    (root / "scripts").mkdir(parents=True)
    (root / "tools" / "gates").mkdir(parents=True)
    (root / CASES).parent.mkdir(parents=True)
    shutil.copy(REPO / "Makefile", root / "Makefile")
    (root / ".devcontainer").mkdir()  # the Makefile reads the Node pin from it
    shutil.copy(REPO / ".devcontainer" / "toolchain.vars", root / ".devcontainer")
    (root / CASES).write_text('{"cases": []}\n', encoding="utf-8")
    (root / "scripts" / "operator.py").write_text(
        OPERATOR.format(log=str(tmp_path / "operator.log")), encoding="utf-8"
    )
    gate = root / "tools" / "gates" / "gate"
    gate.write_text(GATE.format(log=str(tmp_path / "gate.log")), encoding="utf-8")
    gate.chmod(0o755)
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "init")
    return root


def run(project: Path) -> subprocess.CompletedProcess[str]:
    scratch = project.parent / "tmp"
    scratch.mkdir(exist_ok=True)
    return subprocess.run(
        [
            "make",
            "-f",
            "Makefile",
            "--no-print-directory",
            "contract-live",
            "ENV=dev",
            "ADAPTER=local",
            REASON,
        ],
        cwd=project,
        env={
            "PATH": SYSTEM_PATH,
            "HOME": str(project.parent),
            "LC_ALL": "C",
            "TMPDIR": str(scratch),
        },
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def logged(project: Path, name: str) -> list:
    log = project.parent / f"{name}.log"
    if not log.exists():
        return []
    return [json.loads(line) for line in log.read_text().splitlines()]


def test_it_records_then_hands_the_recording_to_the_gates_replay(project: Path) -> None:
    done = run(project)
    assert done.returncode == 0, done.stdout + done.stderr
    (recorded,) = logged(project, "operator")
    assert recorded[:4] == ["--stack", "dev", "contract-record", "--adapter"]
    out = Path(recorded[recorded.index("--out") + 1])
    (replayed,) = logged(project, "gate")
    assert replayed["argv"] == ["--contract-replay", str(out)]
    assert replayed["recording"] == {"adapter": "local", "cases": []}
    assert not out.parent.exists()  # the 0700 directory is deleted


@pytest.mark.parametrize(
    "change",
    ["edited", "staged", "deleted", "uncommitted", "uncommitted-empty", "replaced"],
)
def test_a_case_file_that_differs_from_heads_is_refused_before_anything_is_recorded(
    project: Path, change: str
) -> None:
    cases = project / CASES
    if change.startswith("uncommitted"):  # HEAD doesn't have it at all
        git(project, "rm", "-q", "--cached", CASES)
        git(project, "commit", "-qm", "untrack the cases")
        if (
            change == "uncommitted-empty"
        ):  # an empty file matches what a missing blob prints
            cases.write_text("", encoding="utf-8")
    elif change == "replaced":
        # A replace ref would make HEAD's case file look like the edited one; git reads past it.
        git(project, "switch", "-qc", "side")
        cases.write_text('{"cases": [{"name": "extra"}]}\n', encoding="utf-8")
        git(project, "commit", "-qam", "the edited cases")
        git(project, "switch", "-q", "main")
        git(project, "replace", "main", "side")
        cases.write_text('{"cases": [{"name": "extra"}]}\n', encoding="utf-8")
    elif change == "deleted":
        cases.unlink()
    else:
        cases.write_text('{"cases": [{"name": "extra"}]}\n', encoding="utf-8")
        if change == "staged":
            git(project, "add", CASES)
    done = run(project)
    assert done.returncode == 2
    assert "differs from HEAD's" in done.stderr
    assert "nothing was called" in done.stderr
    assert logged(project, "operator") == [] and logged(project, "gate") == []


def test_without_the_gate_nothing_is_called(project: Path) -> None:
    (project / "tools" / "gates" / "gate").chmod(0o644)
    done = run(project)
    assert done.returncode == 2
    assert "nothing was called" in done.stderr
    assert "PLANNED" not in done.stderr  # T092 added the gate, so its mark is gone
    assert logged(project, "operator") == []
