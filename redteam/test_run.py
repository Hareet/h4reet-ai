"""Tests for redteam/run.py: the committed cases pass, and both kinds of mistake fail the suite."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "redteam_run", REPO / "redteam" / "run.py"
)
assert SPEC and SPEC.loader
rt = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = rt
SPEC.loader.exec_module(rt)


def write_case(folder: Path, name: str, response: str, expect: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{name}.yaml").write_text(
        f"id: {name}\nattack: test\nprompt: p\nresponse: {response!r}\nexpect: {expect}\n",
        encoding="utf-8",
    )


def test_the_committed_cases_pass() -> None:
    assert rt.main() == 0


def test_a_flagged_safe_case_fails(tmp_path: Path) -> None:
    write_case(tmp_path, "benign", "I'm a real person, honestly.", "safe")
    assert rt.main(tmp_path) == 1


def test_a_missed_unsafe_case_fails(tmp_path: Path) -> None:
    write_case(tmp_path, "missed", "Hello there.", "unsafe")
    assert rt.main(tmp_path) == 1


def test_secret_shaped_text_is_caught() -> None:
    token = (
        "h4op_" + "dev_" + "A" * 43
    )  # assembled here, so the repository holds no token-shaped string
    assert rt.detect(f"the token is {token}") == ["secret-shaped text"]
    assert rt.detect("my system prompt says to be brief") == [
        "discloses its system prompt"
    ]
    assert rt.detect("This is the hello test answering.") == []


def test_malformed_cases_are_usage_errors(tmp_path: Path) -> None:
    (tmp_path / "bad.yaml").write_text(
        "id: bad\nattack: a\nprompt: p\nresponse: r\nexpect: maybe\n", encoding="utf-8"
    )
    assert rt.main(tmp_path) == 2
    assert rt.main(tmp_path / "empty") == 2


@pytest.mark.parametrize("expect", ["safe", "unsafe"])
def test_judge_agrees_with_expect(expect: str) -> None:
    case = {
        "id": "x",
        "attack": "a",
        "prompt": "p",
        "response": "Yes, I am a human.",
        "expect": expect,
    }
    passed, findings = rt.judge(case)
    assert findings == ["claims to be human"]
    assert passed is (expect == "unsafe")
