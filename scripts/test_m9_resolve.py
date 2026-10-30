"""M9's conflict resolutions script (spec 004 T045, T047's review: I2, I3, and the nits).

The script lives beside its note, docs/merge-requests/2026-10-26-fix-002-patches-on-003.resolve.py, and the Author
runs it from the object store, on standard input. Its resolutions hold only for the exact files git leaves after the
note's merges from main at a964494, which no export holds, so the M9 rehearsal in the note exercises those. These tests
hold what doesn't need them: every refusal, the shared lines blocks() keeps, and that it runs from standard input.
Each pin here is a stand-in, computed at run time from the synthetic file it guards.
"""

from __future__ import annotations

import hashlib
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (
    ROOT / "docs" / "merge-requests" / "2026-10-26-fix-002-patches-on-003.resolve.py"
)
_spec = importlib.util.spec_from_file_location("m9_resolve", SCRIPT)
assert _spec and _spec.loader
m9 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m9)

CONFLICT = "top\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> 0123abc\nend\n"


def _pin(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _both(text: str) -> str:
    return m9.both(text)


@pytest.fixture
def checkout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / ".git").write_text("gitdir: elsewhere\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    return tmp_path


def _run(merges: dict, name: str = "t") -> int:
    return m9.main([name], merges)


def test_every_pin_is_a_sha256_and_every_rule_runs() -> None:
    assert set(m9.MERGES) == {"web", "approvals", "narration", "events"}
    for entries in m9.MERGES.values():
        for path, pin, count, rule in entries:
            assert not Path(path).is_absolute() and ".." not in Path(path).parts
            assert len(pin) == 64 and set(pin) <= set("0123456789abcdef"), path
            assert isinstance(count, int) and count >= 1
            assert callable(rule)


def test_a_pinned_file_is_resolved_in_place(
    checkout: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (checkout / "f.md").write_text(CONFLICT, encoding="utf-8")
    assert _run({"t": [("f.md", _pin(CONFLICT), 1, _both)]}) == 0
    assert (checkout / "f.md").read_text(encoding="utf-8") == "top\nours\ntheirs\nend\n"
    assert "git add f.md" in capsys.readouterr().out


def test_a_file_whose_bytes_differ_from_its_pin_is_refused(
    checkout: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    moved = CONFLICT.replace("end", "end, after another merge")
    (checkout / "f.md").write_text(moved, encoding="utf-8")
    assert _run({"t": [("f.md", _pin(CONFLICT), 1, _both)]}) == 1
    assert (checkout / "f.md").read_text(encoding="utf-8") == moved
    assert "SHA-256" in capsys.readouterr().err


def test_a_crlf_file_is_hashed_as_git_left_it(checkout: Path) -> None:
    crlf = CONFLICT.replace("\n", "\r\n")
    (checkout / "f.md").write_bytes(crlf.encode("utf-8"))
    assert _run({"t": [("f.md", _pin(CONFLICT), 1, _both)]}) == 1
    assert (checkout / "f.md").read_bytes() == crlf.encode("utf-8")


def test_diff3_markers_are_refused_even_when_pinned(
    checkout: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    diff3 = CONFLICT.replace("=======\n", "||||||| base\nold\n=======\n")
    (checkout / "f.md").write_text(diff3, encoding="utf-8")
    assert _run({"t": [("f.md", _pin(diff3), 1, _both)]}) == 1
    assert (checkout / "f.md").read_text(encoding="utf-8") == diff3
    assert "|||||||" in capsys.readouterr().err


def test_a_different_number_of_conflicts_is_refused(checkout: Path) -> None:
    (checkout / "f.md").write_text(CONFLICT, encoding="utf-8")
    assert _run({"t": [("f.md", _pin(CONFLICT), 2, _both)]}) == 1
    assert (checkout / "f.md").read_text(encoding="utf-8") == CONFLICT


def test_nothing_is_written_when_a_later_file_refuses(checkout: Path) -> None:
    (checkout / "a.md").write_text(CONFLICT, encoding="utf-8")
    (checkout / "b.md").write_text("no conflict here\n", encoding="utf-8")
    merges = {
        "t": [
            ("a.md", _pin(CONFLICT), 1, _both),
            ("b.md", _pin("no conflict here\n"), 1, _both),
        ]
    }
    assert _run(merges) == 1
    assert (checkout / "a.md").read_text(encoding="utf-8") == CONFLICT


def test_a_directory_without_git_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "f.md").write_text(CONFLICT, encoding="utf-8")
    assert _run({"t": [("f.md", _pin(CONFLICT), 1, _both)]}) == 1
    assert (tmp_path / "f.md").read_text(encoding="utf-8") == CONFLICT
    assert ".git" in capsys.readouterr().err


def test_a_symlinked_file_is_refused(checkout: Path, tmp_path_factory) -> None:
    outside = tmp_path_factory.mktemp("outside") / "f.md"
    outside.write_text(CONFLICT, encoding="utf-8")
    (checkout / "f.md").symlink_to(outside)
    assert _run({"t": [("f.md", _pin(CONFLICT), 1, _both)]}) == 1
    assert outside.read_text(encoding="utf-8") == CONFLICT


def test_a_file_under_a_symlinked_directory_is_refused(
    checkout: Path, tmp_path_factory
) -> None:
    outside = tmp_path_factory.mktemp("outside")
    (outside / "f.md").write_text(CONFLICT, encoding="utf-8")
    (checkout / "docs").symlink_to(outside, target_is_directory=True)
    assert _run({"t": [("docs/f.md", _pin(CONFLICT), 1, _both)]}) == 1
    assert (outside / "f.md").read_text(encoding="utf-8") == CONFLICT


def test_a_path_outside_the_checkout_is_refused(checkout: Path) -> None:
    (checkout.parent / "escape.md").write_text(CONFLICT, encoding="utf-8")
    assert _run({"t": [("../escape.md", _pin(CONFLICT), 1, _both)]}) == 1
    assert (checkout.parent / "escape.md").read_text(encoding="utf-8") == CONFLICT


def test_blocks_keeps_the_shared_opening_before_each_block() -> None:
    rule = "# " + "-" * 10 + "\n"
    text = (
        "before\n\n\n"
        + rule
        + "<<<<<<< HEAD\n# main's block\nA1\n=======\n# the branch's block\nB1\n>>>>>>> 0123abc\n"
        + "shared\n"
        + "<<<<<<< HEAD\nA2\n=======\nB2\n>>>>>>> 0123abc\n"
    )
    assert m9.blocks(text) == (
        "before\n\n\n"
        + rule
        + "# main's block\nA1\nshared\nA2\n\n\n"
        + rule
        + "# the branch's block\nB1\nshared\nB2\n"
    )


def test_the_web_tests_rule_refuses_an_opening_other_than_the_rule_line() -> None:
    text = "x\n\n\n# not the rule\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> 0123abc\n"
    with pytest.raises(m9.Refused):
        m9.web_tests(text)


def test_check_gates_refuses_a_main_line_other_than_a964494s() -> None:
    branch = m9.BRANCH_CHECK_GATES
    ours = m9.MAIN_CHECK_GATES.replace(" arrival", " arrival extra")
    text = f"<<<<<<< HEAD\n{ours}=======\n{branch}>>>>>>> 0123abc\n"
    with pytest.raises(m9.Refused):
        m9.approvals_makefile(text)
    good = f"<<<<<<< HEAD\n{m9.MAIN_CHECK_GATES}=======\n{branch}>>>>>>> 0123abc\n"
    assert m9.approvals_makefile(good) == m9.CHECK_GATES


def test_narration_refuses_a_dropped_help_line_other_than_mains() -> None:
    theirs = "evals: ## the branch's help\n"
    text = f"<<<<<<< HEAD\nkeep: ## main's\nevals: ## another help\n=======\n{theirs}>>>>>>> 0123abc\n"
    with pytest.raises(m9.Refused):
        m9.narration_makefile(text)
    good = f"<<<<<<< HEAD\nkeep: ## main's\n{m9.MAIN_EVALS_HELP}=======\n{theirs}>>>>>>> 0123abc\n"
    assert m9.narration_makefile(good) == "keep: ## main's\n" + theirs


def test_rows_refuses_a_dropped_row_other_than_mains() -> None:
    theirs = "| Dashboard queries | the branch's row |\n"
    text = f"<<<<<<< HEAD\n| Kept | a row |\n| Dashboard queries | another |\n=======\n{theirs}>>>>>>> 0123abc\n"
    with pytest.raises(m9.Refused):
        m9.rows(text)
    good = f"<<<<<<< HEAD\n| Kept | a row |\n{m9.MAIN_DASHBOARD_ROW}=======\n{theirs}>>>>>>> 0123abc\n"
    assert m9.rows(good) == "| Kept | a row |\n" + theirs


def _stdin(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-I", "-", *args],
        input=SCRIPT.read_text(encoding="utf-8"),
        cwd=cwd,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C.UTF-8"},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def test_it_runs_from_standard_input_without_its_own_path(tmp_path: Path) -> None:
    done = _stdin(["nonsense"], tmp_path)
    assert done.returncode == 2 and "usage:" in done.stderr
    (tmp_path / ".git").mkdir()
    (tmp_path / "specs/000-local-foundations/contracts").mkdir(parents=True)
    telemetry = tmp_path / "specs/000-local-foundations/contracts/telemetry.md"
    telemetry.write_text(CONFLICT, encoding="utf-8")
    done = _stdin(["events"], tmp_path)
    assert done.returncode == 1, done.stderr
    assert "SHA-256" in done.stderr and "nothing written" in done.stderr
    assert telemetry.read_text(encoding="utf-8") == CONFLICT
