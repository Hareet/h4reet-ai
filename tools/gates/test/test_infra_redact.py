"""Tests for tools/gates/infra_redact.py, the plan block's redaction and its check (spec 001
contracts/infra-records.md §2; September's §2 at 00309c47; tasks.md T004). Account-, key-, and token-shaped values are
built at run time, never written as literals."""

from __future__ import annotations

import importlib.util
import io
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "infra_redact", REPO / "tools" / "gates" / "infra_redact.py"
)
assert SPEC and SPEC.loader
ir = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ir
SPEC.loader.exec_module(ir)

ACCOUNT = "".join(str(d % 10) for d in range(1, 13))  # twelve digits
EMAIL = "alerts" + "@" + "example.com"
KEY = "AKIA" + "X" * 16
PEM = "-----BEGIN " + "RSA PRIVATE KEY-----"


def test_twelve_digit_runs_become_account() -> None:
    text = f'  + arn = "arn:aws:iam::{ACCOUNT}:role/h4-prod-gateway"\n  + repo = "{ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/relay"\n'
    out = ir.redact(text)
    assert ACCOUNT not in out
    assert out.count("<account>") == 2


def test_other_digit_runs_stay() -> None:
    text = "  + port = 8087\n  + id = " + "9" * 13 + "\n  + eleven = " + "1" * 11 + "\n"
    assert ir.redact(text) == text


def test_emails_become_email() -> None:
    out = ir.redact(f'  + endpoint = "{EMAIL}"\n')
    assert EMAIL not in out and "<email>" in out


def test_sensitive_values_become_redacted() -> None:
    out = ir.redact("  + value = (sensitive value)\n")
    assert out == "  + value = <redacted>\n"


def test_named_attributes_become_redacted() -> None:
    text = '  + alert_email = "anything"\n  ~ server_budget_usd = "40" -> "45"\n  + other = "kept"\n'
    out = ir.redact(text, names={"alert_email", "server_budget_usd"})
    assert (
        out
        == '  + alert_email = <redacted>\n  ~ server_budget_usd = <redacted>\n  + other = "kept"\n'
    )


def test_read_names_skips_comments_and_blanks(tmp_path: Path) -> None:
    f = tmp_path / "redact.txt"
    f.write_text("# names\nalert_email\n\n  server_budget_usd  \n", encoding="utf-8")
    assert ir.read_names(f) == {"alert_email", "server_budget_usd"}


@pytest.mark.parametrize(
    "secret", [KEY, PEM, "h4op_" + "a" * 20, "sk-" + "ant-" + "b" * 30]
)
def test_a_secret_pattern_is_refused(secret: str) -> None:
    with pytest.raises(ir.Refused) as caught:
        ir.redact(f'  + x = "{secret}"\n')
    assert secret not in str(caught.value)


def test_check_finds_what_redaction_removes() -> None:
    text = f"line one\n  + arn = {ACCOUNT}\n  + to = {EMAIL}\n  + key = {KEY}\n"
    found = ir.check(text)
    assert [(n, kind) for n, kind in found] == [
        (2, "a 12-digit run"),
        (3, "an email address"),
        (4, "a secret pattern"),
    ]
    assert ir.check(ir.redact(text.replace(KEY, "fine"))) == []


def test_main_filters_stdin(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO(f"  + arn = {ACCOUNT}\n"))
    assert ir.main([]) == 0
    assert capsys.readouterr().out == "  + arn = <account>\n"


def test_main_refuses_and_prints_no_block(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO(f"  + k = {KEY}\n"))
    assert ir.main([]) == 3
    captured = capsys.readouterr()
    assert captured.out == ""
    assert KEY not in captured.err and "refused" in captured.err


def test_main_check_names_lines_never_values(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    f = tmp_path / "block.txt"
    f.write_text(f"ok\n  + to = {EMAIL}\n", encoding="utf-8")
    assert ir.main(["--check", str(f)]) == 1
    out = capsys.readouterr().out
    assert "line 2: an email address" in out and EMAIL not in out
    f.write_text("ok\n", encoding="utf-8")
    assert ir.main(["--check", str(f)]) == 0
