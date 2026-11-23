"""make test runs both of its parts, whatever the first exits, and says what each exited (spec 036 FR-008).

The Author's gate retries a failed test step once, by rerunning exactly the tests that failed
(tools/gates/gate, spec 036 FR-001 to FR-005). That is honest only if one run of make test shows every failing test:
before spec 036, a failing workspace stopped make before pytest, whose tests then never ran. So the recipe runs the
workspaces' tests and pytest whatever each exits, prints `test-part: workspaces exited N` and
`test-part: pytest exited N`, which the gate reads before it retries anything, and fails when either part did.

These tests run the real Makefile's `make test` with stand-ins for npm and pytest on PATH, each logging its arguments
and exiting as the test says.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

STAND_IN = """#!/bin/sh
printf '%s\\n' "$(basename "$0") $*" >>"$PARTS_LOG"
echo "{name} ran"
exit "${{{code}:-0}}"
"""

pytestmark = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


def run_make_test(
    tmp_path: Path, npm: int, pytest_rc: int
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    bindir = tmp_path / "bin"
    bindir.mkdir()
    for name, code in (("npm", "NPM_RC"), ("pytest", "PYTEST_RC")):
        path = bindir / name
        path.write_text(STAND_IN.format(name=name, code=code), encoding="utf-8")
        path.chmod(0o755)
    log = tmp_path / "parts.log"
    log.write_text("", encoding="utf-8")
    done = subprocess.run(
        ["make", "--no-print-directory", "-f", "Makefile", "-C", str(ROOT), "test"],
        env={
            "PATH": f"{bindir}:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            # The devcontainer's mark, which the recipe's CONTAINED check reads, as the gate's container sets it.
            "H4_DEVCONTAINER": "1",
            "PARTS_LOG": str(log),
            "NPM_RC": str(npm),
            "PYTEST_RC": str(pytest_rc),
        },
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    return done, log.read_text(encoding="utf-8").splitlines()


def parts(done: subprocess.CompletedProcess[str]) -> list[str]:
    return [
        line
        for line in (done.stdout + done.stderr).splitlines()
        if line.startswith("test-part: ")
    ]


def test_pytest_runs_after_a_failing_workspace_and_both_parts_say_what_they_exited(
    tmp_path: Path,
) -> None:
    done, calls = run_make_test(tmp_path, npm=1, pytest_rc=0)
    assert done.returncode != 0, done.stdout + done.stderr
    assert [c.split()[0] for c in calls] == ["npm", "pytest"]
    assert calls[0] == "npm test --workspaces --if-present"
    assert calls[1].startswith("pytest -q -p no:cacheprovider --import-mode=importlib ")
    assert parts(done) == [
        "test-part: workspaces exited 1",
        "test-part: pytest exited 0",
    ]
    out = done.stdout
    assert out.index("npm ran") < out.index("test-part: workspaces exited 1")
    assert out.index("test-part: workspaces exited 1") < out.index("pytest ran")
    assert out.index("pytest ran") < out.index("test-part: pytest exited 0")


@pytest.mark.parametrize(("npm", "pytest_rc"), [(0, 1), (1, 1), (0, 5), (2, 0)])
def test_make_test_fails_when_either_part_does(
    tmp_path: Path, npm: int, pytest_rc: int
) -> None:
    done, calls = run_make_test(tmp_path, npm=npm, pytest_rc=pytest_rc)
    assert done.returncode != 0
    assert [c.split()[0] for c in calls] == ["npm", "pytest"]
    assert parts(done) == [
        f"test-part: workspaces exited {npm}",
        f"test-part: pytest exited {pytest_rc}",
    ]


def test_make_test_passes_when_both_parts_do(tmp_path: Path) -> None:
    done, calls = run_make_test(tmp_path, npm=0, pytest_rc=0)
    assert done.returncode == 0, done.stdout + done.stderr
    assert [c.split()[0] for c in calls] == ["npm", "pytest"]
    assert parts(done) == [
        "test-part: workspaces exited 0",
        "test-part: pytest exited 0",
    ]
