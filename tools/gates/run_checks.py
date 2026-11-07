#!/usr/bin/env python3
"""make check's runner (spec 000 FR-041, plan §11): every local gate in order, a status for each, then a summary.

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/run_checks.py githooks-check lint redteam=redteam-suite policy@T037 ...

Each argument is a gate: `label`, `label=target` to run another make target under the gate's name, and `@Tnnn` to
name the task that adds the target, so that its absence is SKIP rather than FAIL. The runner keeps going after a
failure. A gate's status:

    FAIL     its target exited non-zero; or it has no target and no task; or make would do nothing for it;
             or its @Tnnn mark is stale, because the target exists now (the task that adds it removes the mark);
    PENDING  it passed but printed a line starting "PENDING": a run the Author must make (the merge waits);
    PLANNED  it passed but printed "PLANNED (Tnnn): ...": enforcement a patch adds, which the patch clears;
    WARN     it passed but printed a line starting "WARN (": information the merge doesn't wait on, such as make
             evals' line for the behavioral tier, its PENDING or a recorded run's FAIL (spec 006 FR-002);
    SKIP     it printed "SKIP: <reason>", or its target doesn't exist yet and a task is named to add it;
    PASS     otherwise.

Every gate is a .PHONY target. A file or directory with a gate's name, and no .PHONY rule claiming it, makes make
print "Nothing to be done" and exit 0, which would otherwise read as PASS.
Exit 1 when any gate is FAIL or PENDING; PLANNED, WARN, and SKIP don't fail the run. Spec 000's acceptance requires
no PLANNED line and no SKIP that names a task (tasks.md T118). Other lines that start with WARN, such as the toolchain
check's "WARN:" and the arrival check's "WARN <path>:", read as PASS here, as before.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass, field

GATE_RE = re.compile(
    r"(?P<label>[a-z][a-z0-9-]*)(?:=(?P<target>[a-z][a-z0-9-]*))?(?:@(?P<task>T\d{3}))?"
)
# Most severe first. The summary counts them in reverse, the order of the gate's summary line (tools/gates/gate).
ORDER = ["FAIL", "PENDING", "PLANNED", "WARN", "SKIP", "PASS"]


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


def make(*args: str) -> subprocess.CompletedProcess[str]:
    # LC_ALL=C keeps make's own messages untranslated, so probe() can read them, and --no-silent keeps them printed
    # when MAKEFLAGS carries -s from `make -s check`.
    return subprocess.run(
        ["make", "--no-print-directory", "--no-silent", *args],
        capture_output=True,
        text=True,
        env={**os.environ, "LC_ALL": "C"},
        check=False,
    )


def probe(target: str) -> tuple[str, str]:
    """What make would do for the target, and make's own message when it can't.

    The state is "gate", "missing", "broken", "idle", or "not-phony". `make -q` exits 1 when a recipe would run, as it
    always does for a .PHONY gate. It exits 2 when make can't: "missing" only when the target itself has no rule, and
    "broken" for anything else, such as a prerequisite with no rule ("..., needed by '<target>'"). It exits 0 when make
    thinks there is nothing to do: either no recipe, or a file or directory with the target's name that no .PHONY rule
    claims ("idle"), or a rule that isn't .PHONY and whose same-named path is up to date ("not-phony"). The dry run
    tells those two apart. Both `-q` and `-n` still run `$(MAKE)` lines, passing the flag on.
    """
    query = make("-q", target)
    if query.returncode == 1:
        return "gate", ""
    if query.returncode != 0:
        lines = query.stderr.strip().splitlines()
        message = lines[-1] if lines else f"make -q exited {query.returncode}"
        if re.search(
            rf"No rule to make target [`']{re.escape(target)}'\.", query.stderr
        ):
            return "missing", message
        return "broken", message
    dry = make("-n", target)
    return ("not-phony" if "is up to date" in dry.stdout + dry.stderr else "idle"), ""


def absent(gate: Gate, state: str, message: str) -> None:
    """The status of a gate whose target make wouldn't run."""
    path = (
        f"; a path named {gate.target!r} exists, so the gate must be .PHONY"
        if state == "idle"
        else ""
    )
    if state == "broken":
        # The target exists, so no task mark excuses it.
        gate.status, gate.notes = (
            "FAIL",
            [f"make can't build {gate.target!r}: {message}"],
        )
    elif state == "not-phony":
        gate.status = "FAIL"
        gate.notes = [
            f"{gate.target!r} has a rule, but a path with its name makes it look done: declare it .PHONY"
        ]
    elif gate.task:
        gate.status, gate.notes = "SKIP", [f"added by {gate.task}{path}"]
    elif state == "idle":
        gate.status = "FAIL"
        gate.notes = [
            f"make would do nothing for {gate.target!r}: no recipe, or a file or directory with its name"
        ]
    else:
        gate.status, gate.notes = "FAIL", [f"no make target {gate.target!r}"]


def classify(gate: Gate, returncode: int, output: str) -> None:
    lines = output.splitlines()
    if returncode != 0:
        gate.status = "FAIL"
        return
    pending = [ln for ln in lines if ln.startswith("PENDING")]
    planned = [ln for ln in lines if ln.startswith("PLANNED (")]
    warned = [ln for ln in lines if ln.startswith("WARN (")]
    skipped = [ln[len("SKIP:") :].strip() for ln in lines if ln.startswith("SKIP:")]
    if pending:
        gate.status, gate.notes = "PENDING", pending
    elif planned:
        gate.status, gate.notes = "PLANNED", planned
    elif warned:
        gate.status, gate.notes = "WARN", warned
    elif skipped:
        gate.status, gate.notes = "SKIP", skipped


def run(gate: Gate) -> None:
    print(f"== {gate.label}", flush=True)
    state, message = probe(gate.target)
    if state != "gate":
        absent(gate, state, message)
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
    if gate.task:
        # The task that adds the target removes its mark, so a later rename can't turn the gate into a silent SKIP.
        gate.status = "FAIL"
        gate.notes.append(
            f"stale mark: make {gate.target} exists now, so remove @{gate.task} from the gate list"
        )
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
