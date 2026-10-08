#!/usr/bin/env python3
"""make check's runner (spec 000 FR-041, plan §11): every local gate in order, a status for each, then a summary.

    python3 -I tools/gates/run_checks.py githooks-check lint redteam=redteam-suite policy@T037 ...

Each argument is a gate: `label`, `label=target` to run another make target under the gate's name, and `@Tnnn` to
name the task that adds the target, so that its absence is SKIP rather than FAIL. The runner keeps going after a
failure. A gate's status:

    FAIL     its target exited non-zero;
    PENDING  it passed but printed a line starting "PENDING": a run the Author must make (the merge waits);
    PLANNED  it passed but printed "PLANNED (Tnnn): ...": enforcement a patch adds, which the patch clears;
    SKIP     it printed "SKIP: <reason>", or its target doesn't exist yet;
    PASS     otherwise.

Exit 1 when any gate is FAIL or PENDING; PLANNED and SKIP don't fail the run. Spec 000's acceptance requires
no PLANNED line (tasks.md T118).
"""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass, field

GATE_RE = re.compile(
    r"(?P<label>[a-z][a-z0-9-]*)(?:=(?P<target>[a-z][a-z0-9-]*))?(?:@(?P<task>T\d{3}))?"
)
ORDER = ["FAIL", "PENDING", "PLANNED", "SKIP", "PASS"]


@dataclass
class Gate:
    label: str
    target: str
    task: str | None
    status: str = "PASS"
    notes: list[str] = field(default_factory=list)


def parse(argument: str) -> Gate:
    found = GATE_RE.fullmatch(argument)
    if not found:
        raise ValueError(f"not a gate: {argument!r} (label[=target][@Tnnn])")
    return Gate(found["label"], found["target"] or found["label"], found["task"])


def exists(target: str) -> bool:
    """`make -q` exits 2 only when make can't run the target at all, such as when there is no rule for it."""
    probe = subprocess.run(
        ["make", "--no-print-directory", "-q", target],
        capture_output=True,
        text=True,
        check=False,
    )
    return probe.returncode in (0, 1)


def classify(gate: Gate, returncode: int, output: str) -> None:
    lines = output.splitlines()
    if returncode != 0:
        gate.status = "FAIL"
        return
    pending = [ln for ln in lines if ln.startswith("PENDING")]
    planned = [ln for ln in lines if ln.startswith("PLANNED (")]
    skipped = [ln[len("SKIP:") :].strip() for ln in lines if ln.startswith("SKIP:")]
    if pending:
        gate.status, gate.notes = "PENDING", pending
    elif planned:
        gate.status, gate.notes = "PLANNED", planned
    elif skipped:
        gate.status, gate.notes = "SKIP", skipped


def run(gate: Gate) -> None:
    print(f"== {gate.label}", flush=True)
    if not exists(gate.target):
        gate.status = "SKIP"
        gate.notes = [
            f"added by {gate.task}" if gate.task else f"no make target {gate.target!r}"
        ]
        if not gate.task:
            gate.status = "FAIL"
        print(f"-> {gate.status} {gate.label} ({gate.notes[0]})", flush=True)
        return
    done = subprocess.run(
        ["make", "--no-print-directory", gate.target],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    sys.stdout.write(done.stdout)
    classify(gate, done.returncode, done.stdout)
    note = f" ({'; '.join(gate.notes)})" if gate.notes else ""
    print(f"-> {gate.status} {gate.label}{note}", flush=True)


def summary(gates: list[Gate]) -> str:
    counts = {
        status: sum(g.status == status for g in gates) for status in reversed(ORDER)
    }
    parts = ", ".join(f"{n} {status}" for status, n in counts.items())
    flagged = [
        f"{g.label} {g.status}" for g in gates if g.status in ("FAIL", "PENDING")
    ]
    tail = f"; failing: {', '.join(flagged)}" if flagged else ""
    return f"make check: {parts}{tail}"


def main(argv: list[str]) -> int:
    try:
        gates = [parse(a) for a in argv]
    except ValueError as exc:
        print(f"run_checks: {exc}", file=sys.stderr)
        return 2
    if not gates:
        print("run_checks: no gates given", file=sys.stderr)
        return 2
    for gate in gates:
        run(gate)
    print()
    for gate in gates:
        note = f"  {'; '.join(gate.notes)}" if gate.notes else ""
        print(f"{gate.status:<8} {gate.label}{note}")
    print(summary(gates))
    return 1 if any(g.status in ("FAIL", "PENDING") for g in gates) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
