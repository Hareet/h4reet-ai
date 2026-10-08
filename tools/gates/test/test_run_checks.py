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
.PHONY: pass fail planned pending skip
"""


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
    assert "make check: 1 PASS, 1 SKIP, 1 PLANNED, 0 PENDING, 0 FAIL" in out


def test_fail_and_pending_fail_the_run_but_it_keeps_going(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert rc.main(["fail", "pending", "pass"]) == 1
    out = capsys.readouterr().out
    assert "-> FAIL fail" in out
    assert "-> PENDING pending" in out
    assert "-> PASS pass" in out  # the run kept going after the failure
    assert "failing: fail FAIL, pending PENDING" in out


def test_a_missing_target_is_skip_with_its_task_or_fail_without(
    project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert rc.main(["policy@T037"]) == 0
    assert "-> SKIP policy (added by T037)" in capsys.readouterr().out
    assert rc.main(["policy"]) == 1


def test_no_gates_is_a_usage_error() -> None:
    assert rc.main([]) == 2
