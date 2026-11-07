"""Tests for tools/gates/run_checks.py, driving a throwaway Makefile with one target per status."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "run_checks", REPO / "tools" / "gates" / "run_checks.py"
)
assert SPEC and SPEC.loader
rc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = rc
SPEC.loader.exec_module(rc)

MAKEFILE = """\
pass:
\t@echo all good
fail:
\t@echo broken; exit 1
planned:
\t@echo "PLANNED (T045): waits for the early patch"
pending:
\t@echo "PENDING: the Author runs make evals-agent-config"
skip:
\t@echo "SKIP: no engine in CI"
warn:
\t@echo "WARN (behavioral tier): no run for trigger hash 0123abcd4567 in evals/agent-config/history/"
warnfail:
\t@echo "WARN (behavioral tier): no run for trigger hash 0123abcd4567"; echo "docs links: 1 failed"; exit 1
warnpending:
\t@echo "WARN (behavioral tier): no run for trigger hash 0123abcd4567"; echo "PENDING: a run the Author makes"
.PHONY: pass fail planned pending skip warn warnfail warnpending
"""
# make evals' line for the behavioral tier, as information (spec 006 FR-002; evals/behavioral_line.py).
WARN_LINE = "WARN (behavioral tier): no run for trigger hash 0123abcd4567 in evals/agent-config/history/"
# The toolchain check's lines for a Claude Code above its floor (ADR 0023), whose "WARN:" make check reads as PASS.
FLOOR_WARN = (
    "WARN: claude code 2.1.312 is newer than its floor, 2.1.296 (ADR 0023): the agent-config evals record the version "
    "each run used, and moving the floor runs them again\n"
    "toolchain-check: all 15 match their pins, 1 newer than its floor (claude code)\n"
)


@pytest.fixture
def project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / "Makefile").write_text(MAKEFILE, encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    return tmp_path


def test_parse_reads_label_target_and_task() -> None:
    gate = rc.parse("redteam=redteam-suite@T011")
    assert (gate.label, gate.target, gate.task) == ("redteam", "redteam-suite", "T011")
    assert rc.parse("lint").target == "lint"
    with pytest.raises(ValueError):
        rc.parse("Bad Gate")


def test_each_status(project: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert rc.main(["pass", "planned", "skip"]) == 0
    out = capsys.readouterr().out
    assert "-> PASS pass" in out
    assert "-> PLANNED planned (PLANNED (T045): waits for the early patch)" in out
    assert "-> SKIP skip (no engine in CI)" in out
    # The summary counts WARN too, in the gate's own order (spec 006 FR-002, FR-010).
    assert "make check: 1 PASS, 1 SKIP, 0 WARN, 1 PLANNED, 0 PENDING, 0 FAIL" in out


def test_a_warn_line_is_a_warn_that_fails_nothing(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # Spec 006 FR-002: make evals prints the behavioral tier's PENDING and a recorded run's FAIL as a "WARN (" line,
    # information that make check counts and doesn't fail on.
    assert rc.main(["pass", "warn"]) == 0
    out = capsys.readouterr().out
    assert f"-> WARN warn ({WARN_LINE})" in out
    assert f"WARN     warn  {WARN_LINE}" in out.splitlines()
    assert "make check: 1 PASS, 0 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 0 FAIL" in out
    assert "failing" not in out


def test_a_warn_line_never_hides_a_failure_or_a_wait(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert rc.main(["warnfail", "warnpending", "warn"]) == 1
    out = capsys.readouterr().out
    assert "-> FAIL warnfail" in out
    assert "-> PENDING warnpending (PENDING: a run the Author makes)" in out
    assert "failing: warnfail FAIL, warnpending PENDING" in out


@pytest.mark.parametrize(
    ("output", "status"),
    [
        (
            f"PLANNED (T117): 1 case waits for the closing patch\n{WARN_LINE}\n",
            "PLANNED",
        ),
        (f"{WARN_LINE}\nSKIP: no engine here\n", "WARN"),
        # The toolchain's "WARN:" line still reads PASS here, as before.
        (FLOOR_WARN, "PASS"),
    ],
    ids=["planned-over-warn", "warn-over-skip", "toolchains-warn-colon"],
)
def test_a_warn_line_ranks_below_planned_and_above_skip(
    output: str, status: str
) -> None:
    gate = rc.parse("evals")
    rc.classify(gate, 0, output)
    assert gate.status == status


def test_fail_and_pending_fail_the_run_but_it_keeps_going(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert rc.main(["fail", "pending", "pass"]) == 1
    out = capsys.readouterr().out
    assert "-> FAIL fail" in out
    assert "-> PENDING pending" in out
    assert "-> PASS pass" in out  # the run kept going after the failure
    assert "failing: fail FAIL, pending PENDING" in out


def test_the_arrival_checks_warning_reads_pass() -> None:
    # Spec 004's P-5: the arrival check's WARN line, for a hand-made or composite file that needs no approval, fails
    # nothing (spec 004, contracts/intake-amendments.md §7, As built), so its gate stays PASS.
    gate = rc.parse("arrival")
    output = (
        "WARN assets/visitors/dog/still.png: its record's steps call for the hand-made mark, and the file needs no "
        "approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)\n"
        "arrival-check: 0 findings in 3 files, 1 warning\n"
    )
    rc.classify(gate, 0, output)
    assert (gate.status, gate.notes) == ("PASS", [])


def test_a_missing_target_is_skip_with_its_task_or_fail_without(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert rc.main(["policy@T037"]) == 0
    assert "-> SKIP policy (added by T037)" in capsys.readouterr().out
    assert rc.main(["policy"]) == 1


def test_no_gates_is_a_usage_error() -> None:
    assert rc.main([]) == 2


def test_a_path_named_like_a_missing_gate_is_skip_with_its_task_or_fail_without(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # make prints "Nothing to be done" and exits 0 for a directory with no rule, which used to read as PASS.
    (project / "secrets").mkdir()
    assert rc.main(["secrets@T091"]) == 0
    assert (
        "-> SKIP secrets (added by T091; a path named 'secrets' exists, so the gate must be .PHONY)"
        in capsys.readouterr().out
    )
    assert rc.main(["secrets"]) == 1
    assert "make would do nothing for 'secrets'" in capsys.readouterr().out


def test_a_rule_that_isnt_phony_fails_when_its_path_makes_it_look_done(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (project / "Makefile").write_text(
        MAKEFILE + "built:\n\t@echo building\n", encoding="utf-8"
    )
    (project / "built").write_text("", encoding="utf-8")
    assert rc.main(["built"]) == 1
    assert "declare it .PHONY" in capsys.readouterr().out


def test_a_task_mark_is_stale_once_its_target_exists(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert rc.main(["pass@T045"]) == 1
    out = capsys.readouterr().out
    assert "all good" in out  # the gate still ran, so its own result shows
    assert "-> FAIL pass" in out
    assert "stale mark: make pass exists now, so remove @T045 from the gate list" in out


def test_a_gate_that_cant_be_built_fails_even_with_its_task_mark(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # The target exists, but a prerequisite has no rule: a broken gate, never "added by Tnnn" (round 2, R2-I1).
    (project / "Makefile").write_text(
        MAKEFILE
        + "policy: deploy/compose.yaml\n\t@echo policy\n"
        + "validate-config: valdiate-schema\n\t@echo validated\n"
        + ".PHONY: policy validate-config\n",
        encoding="utf-8",
    )
    assert rc.main(["policy@T037", "validate-config@T019"]) == 1
    out = capsys.readouterr().out
    assert "-> FAIL policy (make can't build 'policy'" in out
    assert "No rule to make target 'deploy/compose.yaml', needed by 'policy'" in out
    assert "-> FAIL validate-config (make can't build 'validate-config'" in out


def test_the_probe_reads_makes_messages_under_an_inherited_silent_flag(
    project: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # `make -s check` passes -s down in MAKEFLAGS, which would hide "is up to date" from the probe.
    monkeypatch.setenv("MAKEFLAGS", "s")
    (project / "Makefile").write_text(
        MAKEFILE + "built:\n\t@echo building\n", encoding="utf-8"
    )
    (project / "built").write_text("", encoding="utf-8")
    assert rc.main(["built"]) == 1
    assert "declare it .PHONY" in capsys.readouterr().out
