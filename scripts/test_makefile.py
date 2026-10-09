"""The Makefile's command-line variables (T056's review, rounds 1 and 2).

make expands a command-line variable's value when it builds a recipe's environment, so "$5" vanishes and
"$(shell ...)" runs in the Author's make. The Makefile rebinds each name in LITERAL_VARS to the text typed. These
tests hold every variable a recipe reads from its shell, and every NAME= a target's help offers, to that list, or to
the short list of names that only ever come from the environment, so the next variable can't be missed.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MAKEFILE = ROOT / "Makefile"
TEXT = MAKEFILE.read_text(encoding="utf-8")

# Read by recipes from the environment the Author's shell or the sandbox sets, never offered on the command line.
ENVIRONMENT_ONLY = {
    "CI",
    "DOCKER_HOST",
    "H4_DEVCONTAINER",
    "HOME",
    "SANDBOX_RUNTIME",
    "TMPDIR",
    "XDG_CACHE_HOME",
}


def literal_vars() -> set[str]:
    match = re.search(r"^LITERAL_VARS := (.+)$", TEXT, re.MULTILINE)
    assert match, "the Makefile names LITERAL_VARS"
    return set(match.group(1).split())


def recipe_reads() -> set[str]:
    """$$NAME and $${NAME...} in recipe lines (tab-indented), the shell's reads of its environment."""
    names: set[str] = set()
    for line in TEXT.splitlines():
        if line.startswith("\t"):
            names.update(re.findall(r"\$\$\{?([A-Z][A-Z0-9_]*)", line))
    return names


def help_offers() -> set[str]:
    """NAME= in a target's ## help text: what `make help` tells the Author to type."""
    names: set[str] = set()
    for line in TEXT.splitlines():
        if re.match(r"^[a-z][a-z0-9-]*:", line) and "## " in line:
            names.update(re.findall(r"\b([A-Z][A-Z0-9_]*)=", line.split("## ", 1)[1]))
    return names


def test_every_variable_a_recipe_reads_is_literal_or_environment_only() -> None:
    missing = recipe_reads() - literal_vars() - ENVIRONMENT_ONLY
    assert not missing, (
        f"add to LITERAL_VARS, or to ENVIRONMENT_ONLY with a reason: {sorted(missing)}"
    )


def test_every_variable_the_help_offers_is_literal() -> None:
    missing = help_offers() - literal_vars()
    assert not missing, f"add to LITERAL_VARS: {sorted(missing)}"


def test_the_lists_find_what_they_should() -> None:
    # Not vacuous: the scans see the variables the targets are known to read.
    assert {"REASON", "MESSAGE", "ADAPTER", "SANDBOX_RUNTIME"} <= recipe_reads()
    assert {"REASON", "MESSAGE", "ADAPTER", "TAIL"} <= help_offers()
    assert not ENVIRONMENT_ONLY & literal_vars()


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_a_command_line_adapter_reaches_the_recipe_as_typed(tmp_path: Path) -> None:
    # ADAPTER's value was make code before it joined LITERAL_VARS: make ran $(shell ...) while exporting it.
    marker = tmp_path / "ran"
    value = f"fake$(shell touch {marker})"
    done = subprocess.run(
        ["make", "--no-print-directory", "-C", str(ROOT), "evals", f"ADAPTER={value}"],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert not marker.exists(), "make ran the value as make code"
    assert done.returncode == 2
    assert "ADAPTER must be fake, local, or bedrock" in done.stderr
