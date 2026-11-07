#!/usr/bin/env python3
"""make evals' line for the behavioral tier, as information (spec 006 FR-002, FR-003; the interim patch, 2026-11-07).

    python3 -I -B -X pycache_prefix=/dev/null evals/behavioral_line.py      # what make evals runs

Standard library only. It runs the tier's status, evals/agent-config/behavioral.py status, with the same flags and
this process's environment (in the gate's container phase, H4_DEVCONTAINER=1, where every entry counts), and prints
its lines. Two of them are information in make evals, never a merge block, and print as "WARN (behavioral tier): "
followed by the rest of the line as status wrote it, which make check and the gate read as WARN:
  - the PENDING when no attested run has the tree's trigger hash, which names the hash and the Author's command;
  - the FAIL for the newest attested run that has it, which names the run and its reasons.
A note line after them says so. The gate's agent-config-evals step still holds a branch that changes CLAUDE.md,
REVIEW.md, .claude/, or the Claude Code pin until its run exists (FR-006). main's gate reads the same two lines as WARN
from a tree whose make evals predates this file.

Any other FAIL still fails, with status's own exit code: a case, thresholds.yaml, or a history entry that doesn't
load, or a case that names something the tree lacks (FR-001). Status then prints no header, or a FAIL line of its own
beside the run's. Exit codes: 0 when status passed, or said only one of the two lines above; otherwise status's own.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TIER = HERE / "agent-config" / "behavioral.py"
# status's first line, and its two verdict lines this file turns into information, as behavioral.py prints them.
HEADER = re.compile(
    r"behavioral tier: \d+ cases? \(\d+ enforcement, \d+ conduct\), \d+ runs each; trigger hash [0-9a-f]{12}"
)
PENDING = "PENDING (behavioral tier): "
FAIL = "FAIL  behavioral tier: "
RUN_FAILED = re.compile(
    r"FAIL  behavioral tier: [^\s,]+, the newest run for trigger hash [0-9a-f]{12}, failed: "
)
WARN = "WARN (behavioral tier): "
NOTE = (
    "note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's "
    "agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the "
    "Claude Code pin"
)


def advise(code: int, out: str) -> tuple[int, list[str]]:
    """make evals' exit code and lines, from status's. A FAIL counts as the run's own only when status got as far as
    its header and it is the only FAIL line status printed."""
    lines = out.splitlines()
    fails = [line for line in lines if line.startswith("FAIL")]
    run_failed = (
        code == 1
        and bool(lines)
        and HEADER.fullmatch(lines[0]) is not None
        and len(fails) == 1
        and RUN_FAILED.match(fails[0]) is not None
    )
    if code != 0 and not run_failed:
        return code, lines
    shown = [
        WARN + line[len(PENDING) :]
        if line.startswith(PENDING)
        else WARN + line[len(FAIL) :]
        if run_failed and line.startswith(FAIL)
        else line
        for line in lines
    ]
    if shown != lines:
        shown.append(NOTE)
    return 0, shown


def main() -> int:
    done = subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(TIER),
            "status",
        ],
        stdout=subprocess.PIPE,
        text=True,
        check=False,
    )
    code, lines = advise(done.returncode, done.stdout)
    for line in lines:
        print(line)
    return code


if __name__ == "__main__":
    sys.exit(main())
