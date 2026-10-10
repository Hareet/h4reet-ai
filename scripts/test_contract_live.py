"""Tests for make contract-live's refusals (contracts/provider-adapter.md §5.3; tasks.md T103).

Each runs make with an environment it sets itself, and stops before the target calls anything: an agent session, a
missing REASON or ADAPTER, bedrock off prod, and, until tools/gates/gate exists (T092), the replay it waits for.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
REASON = "REASON=a refusal test of make contract-live"


def make(*args: str, sandbox: bool) -> subprocess.CompletedProcess[str]:
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/tmp"),
    }
    if sandbox:
        env["SANDBOX_RUNTIME"] = "1"
    return subprocess.run(
        ["make", "-f", "Makefile", "--no-print-directory", "contract-live", *args],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


@pytest.mark.parametrize(
    ("args", "sandbox", "says"),
    [
        (
            ("ENV=dev-cpu", "ADAPTER=local", REASON),
            True,
            "make contract-live is the Author's",
        ),
        (("ENV=dev", "ADAPTER=local"), False, "needs REASON="),
        (("ENV=dev", REASON), False, "needs ADAPTER=local or ADAPTER=bedrock"),
        (
            ("ENV=dev", "ADAPTER=other", REASON),
            False,
            "needs ADAPTER=local or ADAPTER=bedrock",
        ),
        (("ENV=dev", "ADAPTER=bedrock", REASON), False, "bedrock is prod's adapter"),
    ],
)
def test_refuses_before_calling_anything(
    args: tuple[str, ...], sandbox: bool, says: str
) -> None:
    done = make(*args, sandbox=sandbox)
    assert done.returncode == 2
    assert says in done.stderr
    assert "contract-record" not in done.stdout + done.stderr


@pytest.mark.skipif(
    (REPO / "tools" / "gates" / "gate").exists(),
    reason="the gate exists: the replay can run",
)
def test_waits_for_the_gates_container_phase_before_any_call() -> None:
    done = make("ENV=prod", "ADAPTER=bedrock", REASON, sandbox=False)
    assert done.returncode == 2
    assert "PLANNED (T092)" in done.stderr
    assert "nothing was called" in done.stderr


def test_reads_the_adapter_through_the_shell_never_splicing_it_into_a_command() -> None:
    # make reads ADAPTER as "$ADAPTER" (the Makefile's rule for values), so quotes in it can't end the string.
    done = make("ENV=prod", 'ADAPTER=x"; echo SPLICED >&2; "', REASON, sandbox=False)
    assert done.returncode == 2
    assert "needs ADAPTER=local or ADAPTER=bedrock" in done.stderr
    assert "SPLICED" not in done.stdout + done.stderr
