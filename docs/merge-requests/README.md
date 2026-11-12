# Merge requests: the local stand-in for pull requests

Until the repository is published (ADR 0013) there are no pull requests. Each change is a feature branch that the Author reviews and merges locally. The branch's last commit adds a note here named `YYYY-MM-DD-<branch name, slashes as dashes>.md`. After publication, pull requests take over, and these notes remain as the record of the local phase.

The Author runs the clean-room gate on the branch in their own terminal, from main's checkout (once spec 017's patches P-2, P-3, and P-6 merge, the night shift's runner may also run it from that checkout on a gate-runner's request, never merging; [ADR 0051](../adr/0051-agents-plan-and-run-the-gate.md)), `tools/gates/gate <branch>`, and once nothing fails or waits, merges with the merge command it prints ([ADR 0017](../adr/0017-clean-room-gate-and-human-only-gate-paths.md); [START-HERE §7](../START-HERE.md#7-before-you-merge)): by SHA, with replace objects off, and with the gate's summary line in the merge commit's message. Its shape, as the gate's `finish()` prints it:

```text
merge: git --no-replace-objects merge --no-ff -m 'Merge <branch> (<the SHA's first 12>)' -m '<the gate's summary line>' <SHA>
```

## Template

```markdown
# <branch name>
Spec: specs/NNN-*/ (or "none: <reason>") · Intent: <path or none> · Written by: <agent role or human> · Date: YYYY-MM-DD
Session: <directory the session started from> · Repo hooks active: <yes, with an excerpt from .claude/audit/hooks.log | no, and why>
Authorized by: <the spec and plan, or the Author's direction for anything outside them>

## What changed and why
## Acceptance criteria         Spec IDs this satisfies (FR-…, SC-…), or "none: process change"
## Constitution check          The constitution-check skill's table
## Review                      REVIEW.md passes from an agent that did not write the change; each finding and what was done about it
## Verification                Commands run (make check today; make lint, make test, make evals once spec 000 adds them) and their output
## Cost and data-flow impact
## For the Author              Decisions needed before merging; anything wrong in the governance files
```
