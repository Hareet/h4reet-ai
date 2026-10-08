"""Tests for deploy/scripts/init_env.py (contracts/env-files.md §9), each against a temporary HOME."""

from __future__ import annotations

import importlib.util
import os
import re
import stat
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "init_env", REPO / "deploy" / "scripts" / "init_env.py"
)
assert SPEC and SPEC.loader
ie = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ie
SPEC.loader.exec_module(ie)

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
SHAPES = {
    **dict.fromkeys(ie.HEX64, r"[0-9a-f]{64}"),
    "LANGFUSE_PUBLIC_KEY": rf"pk-lf-{UUID}",
    "LANGFUSE_SECRET_KEY": rf"sk-lf-{UUID}",
    "SEAWEEDFS_S3_ACCESS_KEY": r"[0-9A-F]{20}",
}


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    return home


def mode(path: Path) -> int:
    return stat.S_IMODE(path.lstat().st_mode)


def parse(path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return dict(ln.split("=", 1) for ln in lines if ln and not ln.startswith("#"))


def template(stack: str) -> list[str]:
    return (
        (REPO / "deploy" / "env.example" / f"{stack}.env.example")
        .read_text(encoding="utf-8")
        .splitlines()
    )


def test_prod_a_new_file(home: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert ie.main(["--stack", "prod"]) == 0
    out, err = capsys.readouterr()
    path = home / ".config/h4reet-ai/env/prod.env"
    assert mode(path) == 0o600 and mode(path.parent) == 0o700
    aws = home / ".config/h4reet-ai/aws-home/.aws"
    assert (
        mode(aws) == 0o700 and mode(aws.parent) == 0o700 and list(aws.iterdir()) == []
    )
    values = parse(path)
    for key, shape in SHAPES.items():
        assert re.fullmatch(shape, values[key]), key
        assert values[key] not in out + err, f"{key}'s value was printed"
    assert values["H4_MODEL_DIR"] == f"{home}/.local/share/h4reet/models"
    assert values["H4_STATE_DIR"] == f"{home}/.local/state/h4reet/prod"
    assert values["H4_AWS_DIR"] == f"{home}/.config/h4reet-ai/aws-home/.aws"
    assert (
        values["OPERATOR_TOKEN_SHA256"] == "__ASK__"
        and values["SMTP_PASSWORD"] == "__ASK__"
    )
    # Line by line, comments included: only the placeholders changed.
    written = path.read_text(encoding="utf-8").splitlines()
    assert len(written) == len(template("prod"))
    for before, after in zip(template("prod"), written, strict=True):
        if "__GENERATE__" not in before and "__HOME__" not in before:
            assert before == after
    assert "generated: GATEWAY_DB_PASSWORD" in out
    assert (
        "fill these yourself, in an editor: OPERATOR_TOKEN_SHA256, TELEGRAM_BOT_TOKEN"
        in out
    )
    assert "make operator-token ENV=prod" in out


def test_dev_fills_the_repository_path_and_names_the_optional_channels(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert ie.main(["--stack", "dev"]) == 0
    out = capsys.readouterr().out
    values = parse(home / ".config/h4reet-ai/env/dev.env")
    assert values["H4_AWS_DIR"] == f"{REPO}/deploy/aws-none"
    assert not (home / ".config/h4reet-ai/aws-home").exists()
    assert (
        "fill these for the recorded run" in out
        and "SMTP_PASSWORD" in out.split("recorded run")[1]
    )
    assert not any(
        p in v
        for v in values.values()
        for p in ("__GENERATE__", "__HOME__", "__REPO__")
    )


def test_generated_values_differ_between_keys_and_runs(home: Path) -> None:
    assert ie.main(["--stack", "dev"]) == 0
    first = parse(home / ".config/h4reet-ai/env/dev.env")
    os.rename(home / ".config/h4reet-ai/env/dev.env", home / "aside.env")
    assert ie.main(["--stack", "dev"]) == 0
    second = parse(home / ".config/h4reet-ai/env/dev.env")
    hex_values = [first[k] for k in ie.HEX64]
    assert len(set(hex_values)) == len(hex_values)
    assert all(first[k] != second[k] for k in SHAPES)


def test_it_never_overwrites(home: Path, capsys: pytest.CaptureFixture[str]) -> None:
    path = home / ".config/h4reet-ai/env/prod.env"
    path.parent.mkdir(parents=True, mode=0o700)
    path.write_text("MINE=1\n", encoding="utf-8")
    assert ie.main(["--stack", "prod"]) == 5
    assert "exists; to start again, move it aside yourself" in capsys.readouterr().err
    assert path.read_text(encoding="utf-8") == "MINE=1\n"


def test_a_symlink_in_its_place_is_refused(home: Path, tmp_path: Path) -> None:
    target = tmp_path / "elsewhere"
    path = home / ".config/h4reet-ai/env/dev.env"
    path.parent.mkdir(parents=True, mode=0o700)
    path.symlink_to(target)
    assert ie.main(["--stack", "dev"]) == 5
    assert not target.exists()


@pytest.mark.parametrize(
    ("argv", "message"),
    [(["--stack", "dev-cpu"], "committed"), (["--stack", "staging"], "prod or dev")],
)
def test_usage(
    home: Path, capsys: pytest.CaptureFixture[str], argv: list[str], message: str
) -> None:
    assert ie.main(argv) == 2
    assert message in capsys.readouterr().err


def test_inside_the_sandbox_it_refuses(
    home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    assert ie.main(["--stack", "prod"]) == 2
    assert not (home / ".config").exists()


def test_a_loose_directory_is_refused(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env_dir = home / ".config/h4reet-ai/env"
    env_dir.mkdir(parents=True)
    env_dir.chmod(0o755)
    assert ie.main(["--stack", "dev"]) == 5
    assert "mode 0755; it must be 0700" in capsys.readouterr().err
    assert list(env_dir.iterdir()) == []


def test_a_loose_aws_directory_is_refused(home: Path) -> None:
    aws = home / ".config/h4reet-ai/aws-home/.aws"
    aws.mkdir(parents=True)
    aws.parent.chmod(0o700)
    aws.chmod(0o755)
    assert ie.main(["--stack", "prod"]) == 5
    assert not (home / ".config/h4reet-ai/env/prod.env").exists()


def test_another_owner_is_refused(
    home: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    (home / ".config/h4reet-ai/env").mkdir(parents=True, mode=0o700)
    real = os.getuid()
    monkeypatch.setattr(ie.os, "getuid", lambda: real + 1)
    assert ie.main(["--stack", "dev"]) == 5
    assert "belongs to another user" in capsys.readouterr().err


def test_sync_appends_only_the_missing_keys(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    env_dir = home / ".config/h4reet-ai/env"
    env_dir.mkdir(parents=True, mode=0o700)
    path = env_dir / "dev.env"
    kept = [
        ln
        for ln in template("dev")
        if not ln.startswith(("LANGFUSE_", "GF_SECURITY_ADMIN_PASSWORD"))
    ]
    original = (
        "\n".join(kept)
        .replace("__GENERATE__", "keep-me")
        .replace("__HOME__", "/h")
        .replace("__REPO__", "/r")
    )
    original += "\nOLD_KEY=gone\n"
    path.write_text(original, encoding="utf-8")
    path.chmod(0o600)
    inode = path.stat().st_ino
    assert ie.main(["--stack", "dev", "--sync"]) == 0
    out = capsys.readouterr().out
    text = path.read_text(encoding="utf-8")
    assert text.startswith(original), "existing lines change, move, or vanish"
    tail = text[len(original) :].splitlines()
    assert re.fullmatch(
        r"# added by make init-env SYNC=1 on \d{4}-\d{2}-\d{2}", tail[0]
    )
    added = dict(ln.split("=", 1) for ln in tail[1:])
    assert set(added) == {k for k in SHAPES if k.startswith(("LANGFUSE_", "GF_"))} | {
        "LANGFUSE_INIT_USER_EMAIL"
    }
    assert added["LANGFUSE_INIT_USER_EMAIL"] == "operator@h4reet.local"
    for key, value in added.items():
        if key in SHAPES:
            assert re.fullmatch(SHAPES[key], value), key
            assert value not in out
    assert "the template no longer has: OLD_KEY" in out
    assert (
        mode(path) == 0o600 and path.stat().st_ino != inode
    )  # written aside, then renamed over
    assert not list(env_dir.glob(".*.sync"))
    # A second sync finds nothing to add and changes nothing.
    assert ie.main(["--stack", "dev", "--sync"]) == 0
    assert path.read_text(encoding="utf-8") == text
    assert "already has every template key" in capsys.readouterr().out


def test_sync_needs_the_file_and_its_mode(home: Path) -> None:
    assert ie.main(["--stack", "dev", "--sync"]) == 5
    path = home / ".config/h4reet-ai/env/dev.env"
    path.write_text("H4_STACK=dev\n", encoding="utf-8")
    path.chmod(0o644)
    assert ie.main(["--stack", "dev", "--sync"]) == 5
    path.chmod(0o600)
    path.write_text("H4_STACK=dev\nexport X=1\n", encoding="utf-8")
    assert ie.main(["--stack", "dev", "--sync"]) == 5


def test_a_template_secret_without_a_shape_is_refused() -> None:
    with pytest.raises(ie.FileProblem):
        ie.generate("NEW_SECRET")
