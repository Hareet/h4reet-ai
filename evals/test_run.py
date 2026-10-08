"""Tests for evals/run.py: case loading, deterministic scoring, adapters, and history only for real runs."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("evals_run", REPO / "evals" / "run.py")
assert SPEC and SPEC.loader
run = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = run
SPEC.loader.exec_module(run)


@pytest.fixture
def suite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """An isolated evals/ tree with one suite, so tests never write into the repository."""
    monkeypatch.setattr(run, "EVALS", tmp_path)
    cases = tmp_path / "demo" / "cases"
    cases.mkdir(parents=True)
    (cases / "a.yaml").write_text(
        "id: a\nprompt: Say hello.\nfake_response: Hello there.\nexpect:\n  contains: [hello]\n",
        encoding="utf-8",
    )
    return tmp_path


def test_the_committed_product_suite_passes_on_fake(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert run.main(["--suite", "product", "--adapter", "fake"]) == 0
    assert "1 passed, 0 failed" in capsys.readouterr().out


def test_scoring_is_deterministic() -> None:
    case = {
        "id": "x",
        "prompt": "p",
        "expect": {"contains": ["Hello"], "not_contains": ["twin"], "regex": "^H"},
    }
    assert run.score(case, "hello world") == ["doesn't match /^H/"]
    assert run.score(case, "Hello, I am the twin") == ["contains 'twin'"]
    assert run.score(case, "Hello") == []
    assert run.score({"id": "y", "prompt": "p"}, "anything") == []


def test_a_failing_case_exits_one(suite: Path) -> None:
    (suite / "demo" / "cases" / "b.yaml").write_text(
        "id: b\nprompt: p\nfake_response: nope\nexpect:\n  contains: [agree]\n",
        encoding="utf-8",
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 1


def test_fake_runs_write_no_history(suite: Path) -> None:
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 0
    assert not (suite / "demo" / "history").exists()


def test_malformed_cases_and_unknown_suites_are_usage_errors(suite: Path) -> None:
    (suite / "demo" / "cases" / "c.yaml").write_text(
        "id: c\nprompt: p\nsurprise: 1\n", encoding="utf-8"
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2
    assert run.main(["--suite", "no-such-suite", "--adapter", "fake"]) == 2
    assert run.main(["--suite", "../escape", "--adapter", "fake"]) == 2


def test_non_string_expectations_are_usage_errors(suite: Path) -> None:
    (suite / "demo" / "cases" / "a.yaml").write_text(
        "id: a\nprompt: p\nfake_response: x\nexpect:\n  contains: [yes]\n",
        encoding="utf-8",
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2


def test_the_fake_adapter_needs_a_fake_response(suite: Path) -> None:
    (suite / "demo" / "cases" / "a.yaml").write_text(
        "id: a\nprompt: p\n", encoding="utf-8"
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2


def test_bedrock_says_what_it_needs_until_the_operator_cli_exists(
    suite: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(run, "REPO", tmp_path / "empty-repo")
    with pytest.raises(run.AdapterError, match="T056"):
        run.bedrock_adapter()


def test_local_takes_only_known_stacks() -> None:
    with pytest.raises(run.AdapterError):
        run.local_adapter("dev-cpu")
