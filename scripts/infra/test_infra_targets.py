"""Tests for make infra-check, make infra-plan-note, and make disclosure-check (spec 001 tasks.md T008, T011; quickstart
§1): each reads PLANNED, naming its task, until its part exists, and then runs only what exists. They run the
repository's Makefile in a scratch tree, with stand-ins for the guard patch's checkers, a home of their own for the
provider mirror, and a PATH without terraform."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
STUB = "import sys\nprint('ran {name}', *sys.argv[1:])\n"


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    root = tmp_path / "tree"
    (root / ".devcontainer").mkdir(parents=True)
    (root / ".devcontainer" / "toolchain.vars").write_text(
        (REPO / ".devcontainer" / "toolchain.vars").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (tmp_path / "home").mkdir()
    return root


def stubs(root: Path, *names: str) -> None:
    gates = root / "tools" / "gates"
    gates.mkdir(parents=True, exist_ok=True)
    for name in names:
        (gates / f"{name}.py").write_text(STUB.format(name=name), encoding="utf-8")


def mirror(root: Path) -> None:
    (
        root.parent / "home" / ".local" / "share" / "h4reet" / "terraform-providers"
    ).mkdir(parents=True)


def run(root: Path, target: str) -> subprocess.CompletedProcess[str]:
    env = {
        "HOME": str(root.parent / "home"),
        "PATH": "/usr/bin:/bin",
        "SANDBOX_RUNTIME": "1",
    }
    argv = [
        "make",
        "--no-print-directory",
        "-s",
        "-C",
        str(root),
        "-f",
        str(REPO / "Makefile"),
        target,
    ]
    return subprocess.run(
        argv, capture_output=True, text=True, env=env, check=False, timeout=120
    )


def planned(done: subprocess.CompletedProcess[str]) -> list[str]:
    return [line for line in done.stdout.splitlines() if line.startswith("PLANNED (")]


@pytest.mark.parametrize(
    ("target", "script"),
    [
        ("infra-check", "infra_policy"),
        ("infra-plan-note", "infra_plan_note"),
        ("disclosure-check", "disclosure_check"),
    ],
)
def test_before_the_guard_patch_each_reads_planned_t010_and_stops(
    tree: Path, target: str, script: str
) -> None:
    done = run(tree, target)
    assert done.returncode == 0, done.stderr
    assert [line[:15] for line in planned(done)] == ["PLANNED (T010):"]
    assert "can't open file" not in done.stderr and "ran " not in done.stdout


@pytest.mark.parametrize(
    ("target", "script"),
    [("infra-plan-note", "infra_plan_note"), ("disclosure-check", "disclosure_check")],
)
def test_after_the_guard_patch_the_checker_runs(
    tree: Path, target: str, script: str
) -> None:
    stubs(tree, script)
    done = run(tree, target)
    assert done.returncode == 0, done.stderr
    assert f"ran {script}" in done.stdout and planned(done) == []


def test_infra_check_waits_for_the_mirror_then_infra(tree: Path) -> None:
    stubs(tree, "infra_policy")
    done = run(tree, "infra-check")
    assert [line[:15] for line in planned(done)] == ["PLANNED (T011):"]
    assert "ran infra_policy" not in done.stdout
    mirror(tree)
    done = run(tree, "infra-check")
    assert [line[:15] for line in planned(done)] == ["PLANNED (T020):"]
    assert "ran infra_policy" not in done.stdout


def test_infra_check_runs_the_policy_then_waits_for_terraform(tree: Path) -> None:
    stubs(tree, "infra_policy")
    mirror(tree)
    (tree / "infra" / "prod").mkdir(parents=True)
    done = run(tree, "infra-check")
    assert done.returncode == 0, done.stderr
    assert "ran infra_policy" in done.stdout
    assert [line[:15] for line in planned(done)] == ["PLANNED (T011):"]
    assert "terraform isn't installed" in done.stdout


def test_make_plan_alone_is_infra_check(tree: Path) -> None:
    done = run(tree, "plan")
    assert done.returncode == 0, done.stderr
    assert [line[:15] for line in planned(done)] == ["PLANNED (T010):"]
