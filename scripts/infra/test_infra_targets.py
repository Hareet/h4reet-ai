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


# Group 3's Author-only targets (tasks.md T024; contracts/infra-records.md §1; research.md R-32): each refuses inside
# the agent sandbox before its script runs, as the bash gate refuses it there too (P-1). In his terminal, each runs its
# script by path through PY_HOST, with the command line's values passed as typed ("$NAME"), never spliced into a recipe.
AUTHOR_TARGETS = [
    (("plan", "ROOT=bootstrap"), "scripts/infra/infra_plan.py", "--root bootstrap"),
    (
        ("plan", "ROOT=bootstrap", "PROFILE=h4reet-admin"),
        "scripts/infra/infra_plan.py",
        "--root bootstrap --profile h4reet-admin",
    ),
    (
        ("infra-verify", "ROOT=account"),
        "scripts/infra/infra_verify.py",
        "--root account",
    ),
    (
        ("infra-record", "ROOT=prod", "OUTCOME=failed", "EXIT_STATUS=1"),
        "scripts/infra/infra_record.py",
        "--root prod --outcome failed --exit-status 1",
    ),
    (
        ("infra-audit", "PROFILE=h4reet-admin"),
        "infra/lambdas/credential_audit/audit.py",
        "--terminal --profile h4reet-admin",
    ),
    (
        ("secrets-check", "PROFILE=h4reet-admin"),
        "scripts/infra/secrets_check.py",
        "--profile h4reet-admin",
    ),
]
AUTHOR_SCRIPTS = sorted({script for _, script, _ in AUTHOR_TARGETS})


def run_make(
    root: Path, *words: str, sandbox: bool
) -> subprocess.CompletedProcess[str]:
    env = {"HOME": str(root.parent / "home"), "PATH": "/usr/bin:/bin"}
    if sandbox:
        env["SANDBOX_RUNTIME"] = "1"
    argv = [
        "make",
        "--no-print-directory",
        "-s",
        "-C",
        str(root),
        "-f",
        str(REPO / "Makefile"),
        *words,
    ]
    return subprocess.run(
        argv, capture_output=True, text=True, env=env, check=False, timeout=120
    )


def author_stubs(root: Path) -> None:
    for script in AUTHOR_SCRIPTS:
        path = root / script
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"import sys\nprint('ran {script}', *sys.argv[1:])\n", encoding="utf-8"
        )


@pytest.mark.parametrize(
    ("words", "script", "args"),
    AUTHOR_TARGETS,
    ids=[" ".join(w) for w, _, _ in AUTHOR_TARGETS],
)
def test_each_author_target_refuses_in_the_sandbox(
    tree: Path, words: tuple, script: str, args: str
) -> None:
    author_stubs(tree)
    done = run_make(tree, *words, sandbox=True)
    assert done.returncode == 2, (done.stdout, done.stderr)
    assert "the Author's" in done.stderr
    assert "ran " not in done.stdout


@pytest.mark.parametrize(
    ("words", "script", "args"),
    AUTHOR_TARGETS,
    ids=[" ".join(w) for w, _, _ in AUTHOR_TARGETS],
)
def test_each_author_target_runs_its_script_in_his_terminal(
    tree: Path, words: tuple, script: str, args: str
) -> None:
    author_stubs(tree)
    done = run_make(tree, *words, sandbox=False)
    assert done.returncode == 0, done.stderr
    assert done.stdout.splitlines() == [f"ran {script} {args}"]


def test_a_value_reaches_the_script_as_typed(tree: Path) -> None:
    author_stubs(tree)
    done = run_make(tree, "infra-verify", "ROOT=$(shell echo x) $$HOME;", sandbox=False)
    assert done.returncode == 0, done.stderr
    assert done.stdout.splitlines() == [
        "ran scripts/infra/infra_verify.py --root $(shell echo x) $$HOME;"
    ]


@pytest.mark.parametrize(
    ("words", "missing"),
    [
        (("infra-verify",), "ROOT"),
        (("infra-record", "OUTCOME=ok"), "ROOT"),
        (("infra-record", "ROOT=bootstrap"), "OUTCOME"),
    ],
)
def test_the_apply_targets_need_their_values(
    tree: Path, words: tuple, missing: str
) -> None:
    author_stubs(tree)
    done = run_make(tree, *words, sandbox=False)
    assert done.returncode == 2 and missing in done.stderr
    assert "ran " not in done.stdout


@pytest.mark.parametrize(
    ("words", "script", "args"),
    AUTHOR_TARGETS,
    ids=[" ".join(w) for w, _, _ in AUTHOR_TARGETS],
)
def test_make_adds_nothing_to_what_the_script_prints(
    tree: Path, words: tuple, script: str, args: str
) -> None:
    # Without -s, make echoes each recipe line it runs that doesn't start with @. make plan ROOT=…'s stdout is the block
    # for the note, and make infra-verify's the one apply command, so make itself may add nothing to them.
    author_stubs(tree)
    env = {"HOME": str(tree.parent / "home"), "PATH": "/usr/bin:/bin"}
    argv = [
        "make",
        "--no-print-directory",
        "-C",
        str(tree),
        "-f",
        str(REPO / "Makefile"),
        *words,
    ]
    done = subprocess.run(
        argv, capture_output=True, text=True, env=env, check=False, timeout=120
    )
    assert done.returncode == 0, done.stderr
    assert done.stdout.splitlines() == [f"ran {script} {args}"]
