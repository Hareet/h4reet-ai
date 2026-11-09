"""Tests for tools/gates/toolchain_check.py, run with fake tools on a private PATH."""

from __future__ import annotations

import importlib.util
import json
import re
import shlex
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "toolchain_check", REPO / "tools" / "gates" / "toolchain_check.py"
)
assert SPEC and SPEC.loader
tc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = tc  # dataclasses look their module up here
SPEC.loader.exec_module(tc)

PINS = {
    "NODE_VERSION": "24.21.0",
    "UV_VERSION": "0.8.22",
    "RUFF_VERSION": "0.16.10",
    "GITLEAKS_VERSION": "8.30.1",
    "PYTEST_VERSION": "9.1.1",
    "PYYAML_VERSION": "6.0.3",
    "PYTHON_VERSION": "3.12",
    "SHELLCHECK_VERSION": "0.9.0",
    "JQ_VERSION": "1.7",
    "CLAUDE_CODE_VERSION": "2.1.294",
    "ESLINT_VERSION": "10.12.0",
    "TYPESCRIPT_ESLINT_VERSION": "8.71.1",
    "TYPESCRIPT_VERSION": "6.0.3",
    "PRETTIER_VERSION": "3.9.9",
}

OUTPUTS = {
    "node": "v24.21.0",
    "uv": "uv 0.8.22 (abc 2026-09-01)",
    "ruff": "ruff 0.16.10",
    "gitleaks": "8.30.1",
    "python3": "Python 3.12.3",
    "shellcheck": "ShellCheck - shell script analysis tool\nversion: 0.9.0\nlicense: GNU General Public License",
    "jq": "jq-1.7.1",
    "claude": "2.1.294 (Claude Code)",
}


def make_tool(bin_dir: Path, name: str, output: str) -> None:
    """A fake tool that prints output. It uses only shell builtins: the tests' PATH holds nothing else."""
    lines = " ".join(shlex.quote(line) for line in output.splitlines())
    script = bin_dir / name
    script.write_text(f"#!/bin/sh\nprintf '%s\\n' {lines}\n", encoding="utf-8")
    script.chmod(0o755)


@pytest.fixture
def host(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    """A fake host: every tool at its pin, and a lint toolchain directory."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, output in OUTPUTS.items():
        make_tool(bin_dir, name, output)
    # pytest's shebang names a fake interpreter: run as pytest it prints pytest's version, and asked to import
    # yaml (-c) it prints PyYAML's, which is how toolchain_check finds the version in pytest's own environment.
    fake_python = bin_dir / "fake-python"
    fake_python.write_text(
        # Only the yaml probe passes "-I -c" first; a pattern on all of "$*" would also match a path holding "-c".
        '#!/bin/sh\ncase "$1 $2" in "-I -c") echo 6.0.3 ;; *) echo "pytest 9.1.1" ;; esac\n',
        encoding="utf-8",
    )
    fake_python.chmod(0o755)
    pytest_exe = bin_dir / "pytest"
    pytest_exe.write_text(f"#!{fake_python}\n", encoding="utf-8")
    pytest_exe.chmod(0o755)
    lint = tmp_path / "lint-node"
    for package, version in (
        ("eslint", "10.12.0"),
        ("typescript-eslint", "8.71.1"),
        ("typescript", "6.0.3"),
        ("prettier", "3.9.9"),
    ):
        manifest = lint / "node_modules" / package / "package.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(
            json.dumps({"name": package, "version": version}), encoding="utf-8"
        )
    make_tool(
        lint, "node", "v24.21.0"
    )  # the link make tools leaves for the post-edit hook
    monkeypatch.setenv("PATH", str(bin_dir))
    return bin_dir, lint


def status(rows: list, tool: str) -> str:
    return next(r.status for r in rows if r.tool == tool)


def test_read_vars_parses_data_and_rejects_malformed_lines(tmp_path: Path) -> None:
    good = tmp_path / "good.vars"
    good.write_text(
        "# a comment\n\nNODE_VERSION=24.21.0\nJQ_VERSION=1.7\n", encoding="utf-8"
    )
    assert tc.read_vars(good) == {"NODE_VERSION": "24.21.0", "JQ_VERSION": "1.7"}
    bad = tmp_path / "bad.vars"
    bad.write_text("export NODE_VERSION=24\n", encoding="utf-8")
    with pytest.raises(ValueError):
        tc.read_vars(bad)


def test_series_matching() -> None:
    assert tc.matches("1.7", "1.7.1")
    assert tc.matches("3.12", "3.12.3")
    assert tc.matches("24.21.0", "24.21.0")
    assert not tc.matches("24.21.0", "24.21.1")
    assert not tc.matches("1.7", "1.70.0")
    assert not tc.matches("3.12", "3.13.0")


def test_every_tool_at_its_pin_passes(host: tuple[Path, Path]) -> None:
    _, lint = host
    rows = tc.check(PINS, lint, in_devcontainer=False)
    assert [r.tool for r in rows if r.status != "OK"] == []


def test_a_drifted_node_fails(host: tuple[Path, Path]) -> None:
    bin_dir, lint = host
    make_tool(bin_dir, "node", "v22.18.0")
    rows = tc.check(PINS, lint, in_devcontainer=False)
    assert status(rows, "node") == "DRIFT"


def test_a_missing_tool_fails(host: tuple[Path, Path]) -> None:
    bin_dir, lint = host
    (bin_dir / "gitleaks").unlink()
    rows = tc.check(PINS, lint, in_devcontainer=False)
    assert status(rows, "gitleaks") == "MISSING"


def test_claude_code_is_required_on_the_host_but_not_in_the_devcontainer(
    host: tuple[Path, Path],
) -> None:
    bin_dir, lint = host
    (bin_dir / "claude").unlink()
    assert (
        status(tc.check(PINS, lint, in_devcontainer=False), "claude code") == "MISSING"
    )
    assert status(tc.check(PINS, lint, in_devcontainer=True), "claude code") == "SKIP"


def test_a_missing_lint_toolchain_fails(
    host: tuple[Path, Path], tmp_path: Path
) -> None:
    rows = tc.check(PINS, tmp_path / "nowhere", in_devcontainer=False)
    assert status(rows, "lint: eslint") == "MISSING"


def test_the_post_edit_hooks_node_is_required_on_the_host_at_its_pin(
    host: tuple[Path, Path],
) -> None:
    _, lint = host
    make_tool(lint, "node", "v22.18.0")
    assert status(tc.check(PINS, lint, in_devcontainer=False), "lint: node") == "DRIFT"
    (lint / "node").unlink()
    assert (
        status(tc.check(PINS, lint, in_devcontainer=False), "lint: node") == "MISSING"
    )
    assert status(tc.check(PINS, lint, in_devcontainer=True), "lint: node") == "SKIP"


def test_main_exits_one_on_drift(
    host: tuple[Path, Path], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bin_dir, lint = host
    pins = tmp_path / "toolchain.vars"
    pins.write_text("".join(f"{k}={v}\n" for k, v in PINS.items()), encoding="utf-8")
    monkeypatch.setenv("H4_LINT_NODE", str(lint))
    monkeypatch.delenv("H4_DEVCONTAINER", raising=False)
    assert tc.main(["toolchain_check.py", str(pins)]) == 0
    make_tool(bin_dir, "jq", "jq-1.6")
    assert tc.main(["toolchain_check.py", str(pins)]) == 1


# ADR 0023: Claude Code updates itself from the Author's other projects, so its pin is a floor.
def test_newer_compares_release_numbers() -> None:
    assert tc.newer("2.1.294", "2.1.301")
    assert tc.newer("2.1.294", "2.2.0")
    assert tc.newer("2.1.294", "3.0")
    assert not tc.newer("2.1.294", "2.1.294")
    assert not tc.newer("2.1.294", "2.1.30")
    assert not tc.newer("2.1.294", "2.1.293")
    assert not tc.newer("latest", "2.1.301")


def test_claude_codes_pin_is_a_floor(host: tuple[Path, Path]) -> None:
    bin_dir, lint = host
    make_tool(bin_dir, "claude", "2.1.301 (Claude Code)")
    assert status(tc.check(PINS, lint, in_devcontainer=False), "claude code") == "WARN"
    make_tool(bin_dir, "claude", "2.1.293 (Claude Code)")
    assert status(tc.check(PINS, lint, in_devcontainer=False), "claude code") == "DRIFT"


def test_only_claude_codes_pin_is_a_floor(host: tuple[Path, Path]) -> None:
    bin_dir, lint = host
    make_tool(bin_dir, "node", "v24.22.0")
    make_tool(bin_dir, "gitleaks", "8.31.0")
    rows = tc.check(PINS, lint, in_devcontainer=False)
    assert status(rows, "node") == "DRIFT"
    assert status(rows, "gitleaks") == "DRIFT"


def test_main_passes_a_newer_claude_code_with_a_warn_line(
    host: tuple[Path, Path],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    bin_dir, lint = host
    pins = tmp_path / "toolchain.vars"
    pins.write_text("".join(f"{k}={v}\n" for k, v in PINS.items()), encoding="utf-8")
    monkeypatch.setenv("H4_LINT_NODE", str(lint))
    monkeypatch.delenv("H4_DEVCONTAINER", raising=False)
    make_tool(bin_dir, "claude", "2.1.301 (Claude Code)")
    assert tc.main(["toolchain_check.py", str(pins)]) == 0
    lines = capsys.readouterr().out.splitlines()
    (warn,) = [ln for ln in lines if ln.startswith("WARN:")]
    assert "claude code 2.1.301" in warn and "floor, 2.1.294" in warn
    assert lines[-1].endswith("match their pins, 1 newer than its floor (claude code)")
    # A drift elsewhere still fails the check.
    make_tool(bin_dir, "jq", "jq-1.6")
    assert tc.main(["toolchain_check.py", str(pins)]) == 1
    assert "differ from their pins (jq)" in capsys.readouterr().out


def test_the_repository_pins_and_the_dockerfile_agree() -> None:
    """The Dockerfile's version arguments must equal toolchain.vars, so the devcontainer installs the pins."""
    pins = tc.read_vars(REPO / ".devcontainer" / "toolchain.vars")
    assert set(PINS) <= set(pins)
    dockerfile = (REPO / ".devcontainer" / "Dockerfile").read_text(encoding="utf-8")
    args = dict(re.findall(r"^ARG ([A-Z_]+_VERSION)=(\S+)$", dockerfile, re.MULTILINE))
    assert args, "the Dockerfile declares its versions as ARG <NAME>_VERSION=<value>"
    for key, value in args.items():
        assert pins.get(key) == value, (
            f"{key}: Dockerfile {value}, toolchain.vars {pins.get(key)}"
        )


def test_make_tools_pulls_the_same_gitleaks_image_as_the_dockerfile() -> None:
    """install-tools.sh copies gitleaks out of an image it names by digest; it must be the devcontainer's."""
    dockerfile = (REPO / ".devcontainer" / "Dockerfile").read_text(encoding="utf-8")
    script = (REPO / "tools" / "gates" / "install-tools.sh").read_text(encoding="utf-8")
    pinned = re.findall(
        r"ghcr\.io/gitleaks/gitleaks:v\$\{GITLEAKS_VERSION\}@(sha256:[0-9a-f]{64})",
        dockerfile,
    )
    copied = re.findall(
        r"ghcr\.io/gitleaks/gitleaks:v\$\{gitleaks_v\}@(sha256:[0-9a-f]{64})", script
    )
    assert len(pinned) == 1 and copied == pinned
