"""Tests for evals/behavioral_line.py and make evals' run of it (spec 006 FR-002, FR-003; the interim patch of
2026-11-07), on throwaway trees.

In make evals, the behavioral tier's PENDING and its FAIL for a recorded run are information: they print as
"WARN (behavioral tier): ...", make evals exits 0 on them, and the docs' links still run. Any other FAIL from the tier
is a file that doesn't load, and still fails make evals, after the links (FR-001). The Makefile tests run the
repository's own Makefile and evals/behavioral_line.py, beside stand-ins for the suites, the static tier,
behavioral.py, and the links.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO = Path(__file__).resolve().parents[1]
HELPER = REPO / "evals" / "behavioral_line.py"

# behavioral.py status's lines, as it prints them on main at c84a115b (trigger hash 401d0a4d7341, no run) and for
# the run of 2026-11-07 that failed (trigger hash 788771dbb186), in the gate's container (H4_DEVCONTAINER=1).
HEADER = "behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 401d0a4d7341"
FAILED_HEADER = "behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 788771dbb186"
CONTAINER = (
    "note: attestations aren't checked here: with H4_DEVCONTAINER=1 (the devcontainer, the gate's container phase "
    "among them), no store like ~/.local/state/h4reet/evals/attested/ can be seen, so every entry counts; the "
    "Author's gate checks them"
)
NO_RUN = (
    "no run for trigger hash 401d0a4d7341 in evals/agent-config/history/; the Author runs make "
    "evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the commands it "
    "prints"
)
RUN = "2026-11-07T004715Z-feat-004-setup-e5b1dd3749f4"
FAILED = (
    f"{RUN}, the newest run for trigger hash 788771dbb186, failed: reads-studio-folder: the forbidden effect, or a "
    "run without hook events, in 2 of 3 runs (at most 0)"
)
PENDING_OUT = [
    HEADER,
    CONTAINER,
    f"PENDING (behavioral tier): {NO_RUN}",
    "agent-config behavioral: pending, 0 planned",
]
FAILED_OUT = [
    FAILED_HEADER,
    f"FAIL  behavioral tier: {FAILED}",
    "agent-config behavioral: fail, 0 planned",
]
PASSED = f"PASS  behavioral tier: {RUN} passed for trigger hash 401d0a4d7341, the newest run for it, on Claude Code 2.1.312"
# A file that doesn't load: status prints no header, only the error (CaseError).
BROKEN_OUT = [
    "FAIL  behavioral tier: evals/agent-config/cases/edits-settings.yaml: not valid YAML",
    "agent-config behavioral: fail",
]
# A case that names a check or a role the tree lacks: status's header, then a FAIL line of its own.
PROBLEM = (
    "FAIL  edits-settings: names role 'nobody', which .claude/agents/ doesn't have"
)
LINKS_OK = "docs links: 0 failed, 3 relative links in 1 files"


@pytest.fixture
def helper() -> ModuleType:
    spec = importlib.util.spec_from_file_location("h4_behavioral_line", HELPER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def text(lines: list[str]) -> str:
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------------------------------
# advise: status's exit code and lines, to make evals' exit code and lines
# --------------------------------------------------------------------------------------------------
def test_a_pending_tier_is_a_warn_line_that_fails_nothing(helper: ModuleType) -> None:
    code, lines = helper.advise(0, text(PENDING_OUT))
    assert code == 0
    assert (
        f"WARN (behavioral tier): {NO_RUN}" in lines
    )  # the missing hash and the Author's command, as status said
    assert not any(line.startswith("PENDING") for line in lines)
    assert lines[:2] == [HEADER, CONTAINER]
    assert [line for line in lines if line.startswith("note: the behavioral tier")] == [
        helper.NOTE
    ]


def test_a_recorded_runs_failure_is_a_warn_line_that_fails_nothing(
    helper: ModuleType,
) -> None:
    code, lines = helper.advise(1, text(FAILED_OUT))
    assert code == 0
    assert (
        f"WARN (behavioral tier): {FAILED}" in lines
    )  # the run, the hash, and its reasons
    assert not any(line.startswith("FAIL") for line in lines)


def test_an_unattested_pending_is_a_warn_line_too(helper: ModuleType) -> None:
    unattested = (
        f"no attested run for trigger hash 401d0a4d7341: {RUN} isn't attested on this machine, in "
        "~/.local/state/h4reet/evals/attested/, which only make evals-agent-config writes, so not counted; the Author "
        "runs make evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the "
        "commands it prints"
    )
    code, lines = helper.advise(
        0, text([HEADER, f"PENDING (behavioral tier): {unattested}"])
    )
    assert (code, lines[1]) == (0, f"WARN (behavioral tier): {unattested}")


@pytest.mark.parametrize(
    "out",
    [
        BROKEN_OUT,  # no header: a case, thresholds.yaml, or an entry that doesn't load
        [
            FAILED_HEADER,
            PROBLEM,
            f"FAIL  behavioral tier: {FAILED}",
            "agent-config behavioral: fail, 0 planned",
        ],
        [HEADER, PROBLEM, PASSED, "agent-config behavioral: fail, 0 planned"],
        [
            HEADER,
            PROBLEM,
            f"PENDING (behavioral tier): {NO_RUN}",
            "agent-config behavioral: fail, 0 planned",
        ],
    ],
)
def test_any_other_failure_keeps_its_exit_code_and_its_lines(
    helper: ModuleType, out: list[str]
) -> None:
    assert helper.advise(1, text(out)) == (1, out)


def test_a_pass_and_a_planned_case_pass_through_unchanged(helper: ModuleType) -> None:
    planned = (
        "PLANNED (T117): 1 behavioral case waits for the closing patch: edits-settings"
    )
    out = [HEADER, planned, PASSED, "agent-config behavioral: pass, 1 planned"]
    assert helper.advise(0, text(out)) == (0, out)


def test_a_tier_that_couldnt_run_keeps_its_exit_code(helper: ModuleType) -> None:
    assert helper.advise(2, "") == (2, [])


# --------------------------------------------------------------------------------------------------
# make evals, the repository's Makefile, end to end
# --------------------------------------------------------------------------------------------------
def write(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """The repository's Makefile and helper, with stand-ins for every script make evals runs beside them."""
    root = tmp_path / "repo"
    write(root / "Makefile", (REPO / "Makefile").read_text(encoding="utf-8"))
    write(
        root / ".devcontainer/toolchain.vars",
        (REPO / ".devcontainer/toolchain.vars").read_text(encoding="utf-8"),
    )
    if HELPER.exists():
        write(root / "evals/behavioral_line.py", HELPER.read_text(encoding="utf-8"))
    write(
        root / "evals/run.py",
        'import sys\nprint(f"evals {sys.argv[2]} (fake): 1 passed, 0 failed")\n',
    )
    write(
        root / "evals/agent-config/static.py",
        'print("agent-config static: 0 failed, 0 planned")\n',
    )
    return root


def make_evals(
    root: Path, out: list[str], code: int, *, links: bool = True, **env: str
) -> subprocess.CompletedProcess[str]:
    """make evals, with behavioral.py's status printing these lines and exiting with this code, and the docs' links
    passing or failing. The stand-in also says on stderr which H4_DEVCONTAINER it got, the gate's container phase's
    mark, since status's own first line on stdout is its header."""
    write(
        root / "evals/agent-config/behavioral.py",
        "import os, sys\n"
        "assert sys.argv[1:] == ['status'], sys.argv\n"
        "print('devcontainer:', os.environ.get('H4_DEVCONTAINER', 'unset'), file=sys.stderr)\n"
        f"print({text(out)!r}, end='')\n"
        f"sys.exit({code})\n",
    )
    write(
        root / "evals/docs_links.py",
        "import sys\n"
        f"print({LINKS_OK if links else 'docs links: 1 failed, 3 relative links in 1 files'!r})\n"
        f"sys.exit({0 if links else 1})\n",
    )
    home = root.parent / "home"
    home.mkdir(exist_ok=True)
    return subprocess.run(
        ["make", "-f", "Makefile", "--no-print-directory", "evals"],
        cwd=root,
        env={
            "PATH": os.environ["PATH"],
            "HOME": str(home),
            "LC_ALL": "C",
            "TMPDIR": str(root.parent),
            **env,
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def lines_of(done: subprocess.CompletedProcess[str]) -> list[str]:
    return done.stdout.splitlines()


def test_make_evals_runs_the_links_and_passes_when_a_recorded_run_failed(
    tree: Path,
) -> None:
    done = make_evals(tree, FAILED_OUT, 1)
    assert done.returncode == 0, done.stdout + done.stderr
    out = lines_of(done)
    assert f"WARN (behavioral tier): {FAILED}" in out
    assert LINKS_OK in out, "the docs' links didn't run"
    assert out.index(LINKS_OK) > out.index(f"WARN (behavioral tier): {FAILED}")
    assert not any(line.startswith(("FAIL", "PENDING")) for line in out)


def test_make_evals_runs_the_links_and_passes_when_no_run_has_the_hash(
    tree: Path,
) -> None:
    done = make_evals(tree, PENDING_OUT, 0, H4_DEVCONTAINER="1")
    assert done.returncode == 0, done.stdout + done.stderr
    out = lines_of(done)
    # The gate's container phase reaches the tier as it did, so every entry counts there.
    assert "devcontainer: 1" in done.stderr.splitlines()
    assert f"WARN (behavioral tier): {NO_RUN}" in out and LINKS_OK in out
    assert not any(line.startswith(("FAIL", "PENDING")) for line in out)


@pytest.mark.parametrize(
    "out",
    [
        BROKEN_OUT,
        [
            FAILED_HEADER,
            PROBLEM,
            f"FAIL  behavioral tier: {FAILED}",
            "agent-config behavioral: fail, 0 planned",
        ],
    ],
)
def test_a_tier_file_that_doesnt_load_still_fails_make_evals_after_the_links(
    tree: Path, out: list[str]
) -> None:
    done = make_evals(tree, out, 1)
    assert done.returncode != 0, done.stdout
    printed = lines_of(done)
    assert LINKS_OK in printed, "the docs' links didn't run"
    assert [line for line in printed if line.startswith("FAIL")] == [
        line for line in out if line.startswith("FAIL")
    ]
    assert not any(line.startswith("WARN") for line in printed)


def test_failing_links_fail_make_evals_whatever_the_tier_says(tree: Path) -> None:
    for out, code in ((PENDING_OUT, 0), (FAILED_OUT, 1), ([HEADER, PASSED], 0)):
        done = make_evals(tree, out, code, links=False)
        assert done.returncode != 0, done.stdout
        assert "docs links: 1 failed, 3 relative links in 1 files" in lines_of(done)


def test_a_passing_tier_passes_make_evals_with_no_warn(tree: Path) -> None:
    done = make_evals(
        tree, [HEADER, PASSED, "agent-config behavioral: pass, 0 planned"], 0
    )
    assert done.returncode == 0, done.stdout + done.stderr
    out = lines_of(done)
    assert PASSED in out and LINKS_OK in out
    assert not any(
        line.startswith(("WARN", "note: the behavioral tier")) for line in out
    )
