"""make test runs every part, whatever the others exit, and says what each exited (spec 036 FR-008).

The Author's gate retries a failed test step once, by rerunning exactly the tests that failed
(tools/gates/gate, spec 036 FR-001 to FR-005). That is honest only if one run of make test shows every failing test
and which part failed: before spec 036, a failing workspace stopped make before pytest, whose tests then never ran,
and npm's one exit for every workspace couldn't say which of them failed. So the recipe runs each workspace's tests,
then pytest, whatever each exits, prints `test-part: workspace <folder> exited N` after each workspace and
`test-part: pytest exited N` last, which the gate reads before it retries anything, and fails when any part did.

These tests run the real Makefile's `make test` with stand-ins for npm and pytest on PATH, each logging its arguments
and exiting as the test says.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# The workspaces, in the Makefile's order: its wildcard of services/*/package.json, then apps/*/package.json.
WORKSPACES = [
    p.parent.relative_to(ROOT).as_posix()
    for pattern in ("services/*/package.json", "apps/*/package.json")
    for p in sorted(ROOT.glob(pattern))
]

# npm fails the workspace NPM_FAIL names, with NPM_RC; pytest exits PYTEST_RC.
NPM = """#!/bin/sh
printf '%s\\n' "npm $*" >>"$PARTS_LOG"
echo "npm ran $3"
if [ "$3" = "$NPM_FAIL" ]; then exit "$NPM_RC"; fi
exit 0
"""
PYTEST = """#!/bin/sh
printf '%s\\n' "pytest $*" >>"$PARTS_LOG"
echo "pytest ran"
exit "$PYTEST_RC"
"""

pytestmark = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


def run_make_test(
    tmp_path: Path, failing: str = "", npm_rc: int = 1, pytest_rc: int = 0
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    bindir = tmp_path / "bin"
    bindir.mkdir()
    for name, text in (("npm", NPM), ("pytest", PYTEST)):
        path = bindir / name
        path.write_text(text, encoding="utf-8")
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
            "NPM_FAIL": failing,
            "NPM_RC": str(npm_rc),
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


def said(failing: str = "", npm_rc: int = 1, pytest_rc: int = 0) -> list[str]:
    return [
        f"test-part: workspace {ws} exited {npm_rc if ws == failing else 0}"
        for ws in WORKSPACES
    ] + [f"test-part: pytest exited {pytest_rc}"]


def test_the_repository_has_workspaces_to_run() -> None:
    assert WORKSPACES[:2] == ["services/gateway", "services/relay"]
    assert "apps/web" in WORKSPACES


def test_every_part_runs_after_a_failing_workspace_and_each_says_what_it_exited(
    tmp_path: Path,
) -> None:
    done, calls = run_make_test(tmp_path, failing="services/gateway")
    assert done.returncode != 0, done.stdout + done.stderr
    # Each workspace's own tests, by its folder, as npm test --workspaces --if-present ran them; then pytest.
    assert calls[:-1] == [f"npm test -w {ws} --if-present" for ws in WORKSPACES]
    assert calls[-1].startswith(
        "pytest -q -p no:cacheprovider --import-mode=importlib "
    )
    assert parts(done) == said("services/gateway")
    out = done.stdout
    assert out.index("npm ran services/gateway") < out.index(
        "test-part: workspace services/gateway exited 1"
    )
    assert out.index("test-part: workspace services/gateway exited 1") < out.index(
        "npm ran services/relay"
    )
    assert out.index(f"test-part: workspace {WORKSPACES[-1]} exited 0") < out.index(
        "pytest ran"
    )
    assert out.index("pytest ran") < out.index("test-part: pytest exited 0")


@pytest.mark.parametrize(
    ("failing", "npm_rc", "pytest_rc"),
    [
        ("", 1, 1),
        ("services/relay", 1, 1),
        ("", 1, 5),
        ("apps/web", 2, 0),
    ],
)
def test_make_test_fails_when_any_part_does(
    tmp_path: Path, failing: str, npm_rc: int, pytest_rc: int
) -> None:
    done, calls = run_make_test(
        tmp_path, failing=failing, npm_rc=npm_rc, pytest_rc=pytest_rc
    )
    assert done.returncode != 0
    assert len(calls) == len(WORKSPACES) + 1
    assert parts(done) == said(failing, npm_rc, pytest_rc)


def test_make_test_passes_when_every_part_does(tmp_path: Path) -> None:
    done, calls = run_make_test(tmp_path)
    assert done.returncode == 0, done.stdout + done.stderr
    assert len(calls) == len(WORKSPACES) + 1
    assert parts(done) == said()
