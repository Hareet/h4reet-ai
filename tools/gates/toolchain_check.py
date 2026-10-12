#!/usr/bin/env python3
"""Compare the installed tool versions against .devcontainer/toolchain.vars (spec 000, plan §9, ADR 0018).

Run through PY_HOST, `python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py`
(`make toolchain-check`). Standard library only. It prints one row per tool and exits 1 when any required tool is
missing or differs from its pin.

A pin matches its exact version, or any release in its series: "3.12" matches 3.12.3, and "1.7" matches 1.7.1.
Claude Code is required where agent sessions run (the host), not inside the devcontainer, which sets
H4_DEVCONTAINER=1 and builds without it by default.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_VARS = REPO / ".devcontainer" / "toolchain.vars"
DEFAULT_LINT_NODE = Path.home() / ".local" / "share" / "h4reet" / "lint-node"
VERSION_RE = re.compile(r"(\d+(?:\.\d+)+)")


@dataclass
class Row:
    tool: str
    pinned: str
    found: str
    where: str
    status: str  # OK, DRIFT, MISSING, or SKIP


def read_vars(path: Path) -> dict[str, str]:
    """Parse KEY=VALUE lines as data. Blank lines and # comments are skipped; a malformed line is an error."""
    pins: dict[str, str] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or not value:
            raise ValueError(f"{path}:{number}: expected KEY=VALUE, got {raw!r}")
        pins[key] = value
    return pins


def matches(pinned: str, found: str) -> bool:
    """True when found is the pinned version, or a release in the pinned series."""
    return found == pinned or found.startswith(pinned + ".")


def first_version(text: str) -> str | None:
    found = VERSION_RE.search(text)
    return found.group(1) if found else None


def run_version(argv: list[str]) -> tuple[str | None, str]:
    """Run a version command found on PATH. Returns (version, where)."""
    exe = shutil.which(argv[0])
    if exe is None:
        return None, "not on PATH"
    try:
        out = subprocess.run(
            [exe, *argv[1:]],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, f"{exe}: {exc.__class__.__name__}"
    text = (out.stdout or "") + (out.stderr or "")
    if argv[0] == "shellcheck":
        # shellcheck prints "version: 0.9.0" on its second line; the first line is its name.
        line = next((ln for ln in text.splitlines() if ln.startswith("version:")), "")
        return first_version(line), exe
    return first_version(text), exe


def pytest_pyyaml(pytest_exe: str) -> tuple[str | None, str]:
    """PyYAML's version in pytest's own environment, found through the interpreter on pytest's shebang line."""
    try:
        with open(pytest_exe, "rb") as handle:
            first = handle.readline().decode("utf-8", "replace").strip()
    except OSError as exc:
        return None, f"{pytest_exe}: {exc.__class__.__name__}"
    if not first.startswith("#!"):
        return None, "pytest has no shebang"
    interpreter = first[2:].split()[0]
    try:
        out = subprocess.run(
            [interpreter, "-I", "-c", "import yaml; print(yaml.__version__)"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, f"{interpreter}: {exc.__class__.__name__}"
    return first_version(out.stdout), interpreter


def package_version(root: Path, package: str) -> tuple[str | None, str]:
    manifest = root / "node_modules" / package / "package.json"
    try:
        version = json.loads(manifest.read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError):
        return None, f"{manifest} missing"
    return (version if isinstance(version, str) else None), str(manifest.parent)


def check(pins: dict[str, str], lint_node: Path, in_devcontainer: bool) -> list[Row]:
    rows: list[Row] = []

    def add(
        tool: str, key: str, found: str | None, where: str, required: bool = True
    ) -> None:
        pinned = pins.get(key, "")
        if not pinned:
            rows.append(Row(tool, "(no pin)", found or "-", where, "DRIFT"))
        elif found is None:
            rows.append(
                Row(tool, pinned, "-", where, "MISSING" if required else "SKIP")
            )
        else:
            rows.append(
                Row(
                    tool,
                    pinned,
                    found,
                    where,
                    "OK" if matches(pinned, found) else "DRIFT",
                )
            )

    for tool, key, argv in (
        ("node", "NODE_VERSION", ["node", "--version"]),
        ("uv", "UV_VERSION", ["uv", "--version"]),
        ("ruff", "RUFF_VERSION", ["ruff", "--version"]),
        ("gitleaks", "GITLEAKS_VERSION", ["gitleaks", "version"]),
        ("python3", "PYTHON_VERSION", ["python3", "--version"]),
        ("shellcheck", "SHELLCHECK_VERSION", ["shellcheck", "--version"]),
        ("jq", "JQ_VERSION", ["jq", "--version"]),
    ):
        found, where = run_version(argv)
        add(tool, key, found, where)

    found, where = run_version(["pytest", "--version"])
    add("pytest", "PYTEST_VERSION", found, where)
    pytest_exe = shutil.which("pytest")
    if pytest_exe:
        found, where = pytest_pyyaml(pytest_exe)
        add("pyyaml (pytest's)", "PYYAML_VERSION", found, where)
    else:
        add("pyyaml (pytest's)", "PYYAML_VERSION", None, "pytest not on PATH")

    found, where = run_version(["claude", "--version"])
    if in_devcontainer and found is None:
        add(
            "claude code",
            "CLAUDE_CODE_VERSION",
            None,
            "not in the devcontainer (WITH_CLAUDE=0)",
            required=False,
        )
    else:
        add("claude code", "CLAUDE_CODE_VERSION", found, where)

    for tool, key, package in (
        ("lint: eslint", "ESLINT_VERSION", "eslint"),
        ("lint: typescript-eslint", "TYPESCRIPT_ESLINT_VERSION", "typescript-eslint"),
        ("lint: typescript", "TYPESCRIPT_VERSION", "typescript"),
        ("lint: prettier", "PRETTIER_VERSION", "prettier"),
    ):
        found, where = package_version(lint_node, package)
        add(tool, key, found, where)
    # The post-edit hook runs the toolchain on its own Node, the link make tools leaves in it (tasks.md T117). Only the
    # host's hook needs it; the devcontainer's toolchain runs on the image's Node.
    lint_exe = lint_node / "node"
    if lint_exe.exists():
        found, where = run_version([str(lint_exe), "--version"])
    else:
        found, where = None, f"{lint_exe} missing"
    add("lint: node", "NODE_VERSION", found, where, required=not in_devcontainer)
    return rows


def render(rows: list[Row]) -> str:
    header = Row("tool", "pinned", "found", "where", "status")
    table = [header, *rows]
    widths = [
        max(len(getattr(r, f)) for r in table)
        for f in ("tool", "pinned", "found", "status")
    ]
    lines = []
    for r in table:
        cells = (r.tool, r.pinned, r.found, r.status)
        lines.append(
            "  ".join(c.ljust(w) for c, w in zip(cells, widths, strict=True))
            + "  "
            + r.where
        )
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    vars_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_VARS
    try:
        pins = read_vars(vars_path)
    except (OSError, ValueError) as exc:
        print(f"toolchain-check: can't read the pins: {exc}", file=sys.stderr)
        return 1
    lint_node = Path(os.environ.get("H4_LINT_NODE") or DEFAULT_LINT_NODE)
    in_devcontainer = os.environ.get("H4_DEVCONTAINER") == "1"
    rows = check(pins, lint_node, in_devcontainer)
    print(render(rows))
    bad = [r for r in rows if r.status in ("DRIFT", "MISSING")]
    if bad:
        names = ", ".join(r.tool for r in bad)
        print(
            f"toolchain-check: {len(bad)} of {len(rows)} differ from their pins ({names}); see tasks.md T013"
        )
        return 1
    print(f"toolchain-check: all {len(rows)} match their pins")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
