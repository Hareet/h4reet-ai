"""Tests for deploy/agents-engine/prove-limits.sh's classifiers (spec 000, FR-039; contracts/agents-engine.md §7).

The script runs only on the host, against the live engine, so these load its pure functions alone: each is cut from
the script by name and run in bash on recorded engine output.

    PYTHONPYCACHEPREFIX=$TMPDIR/pyc pytest -q -p no:cacheprovider --import-mode=importlib deploy/agents-engine
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "prove-limits.sh"
TEXT = SCRIPT.read_text(encoding="utf-8")
LINK = "/run/h4agents/tree/.h4-prove-e5c"


def function(name: str) -> str:
    """A function's definition, from its `name() {` line to the `}` that closes it at the start of a line."""
    match = re.search(rf"^{name}\(\) {{\n.*?^}}\n", TEXT, re.MULTILINE | re.DOTALL)
    assert match, name
    return match.group(0)


def link_refusal(rc: int, out: str, source: str = LINK) -> str:
    script = (
        function("refusal_rule")
        + function("link_refusal")
        + 'link_refusal "$1" "$2" "$3"\n'
    )
    done = subprocess.run(
        ["bash", "-c", script, "bash", str(rc), out, source],
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


def test_the_plugins_refusal_names_its_rule() -> None:
    out = "docker: Error response from daemon: refused by h4-authz (A14): HostConfig.Binds."
    assert link_refusal(125, out) == "the plugin (A14)"


def test_the_kernels_eloop_is_named() -> None:
    out = f"docker: Error response from daemon: {LINK}: too many levels of symbolic links."
    assert link_refusal(125, out) == "ELOOP"


def test_the_daemons_mkdir_over_the_unfollowed_link_is_the_kernels_refusal() -> None:
    # Stage E, 2026-10-13: on a nosymfollow root the daemon's stat of the link gets ELOOP, so it makes the source as a
    # directory, and mkdir finds the link itself there.
    out = (
        "docker: Error response from daemon: error while creating mount source path "
        f"'{LINK}': mkdir {LINK}: file exists."
    )
    assert link_refusal(125, out).startswith("the kernel (nosymfollow")


@pytest.mark.parametrize(
    "out",
    [
        (
            "docker: Error response from daemon: error while creating mount source path "
            "'/run/h4agents/tree/other': mkdir /run/h4agents/tree/other: file exists."
        ),
        (
            "docker: Error response from daemon: error while creating mount source path "
            f"'{LINK}': mkdir {LINK}: permission denied."
        ),
        "",
    ],
)
def test_other_failures_name_no_refusal(out: str) -> None:
    assert link_refusal(125, out) == ""


def test_a_run_that_succeeded_is_no_refusal() -> None:
    out = f"error while creating mount source path '{LINK}': mkdir {LINK}: file exists"
    assert link_refusal(0, out) == ""
