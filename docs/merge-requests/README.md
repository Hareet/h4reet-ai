# Merge requests: the local stand-in for pull requests

Until the repository is published (ADR 0013) there are no pull requests. Each change is a feature branch that the Author reviews and merges locally. The branch's last commit adds a note here named `YYYY-MM-DD-<branch name, slashes as dashes>.md`. After publication, pull requests take over, and these notes remain as the record of the local phase.

The Author merges with:

```bash
git switch main && git merge --no-ff <branch>
```

## Template

```markdown
# <branch name>
Spec: specs/NNN-*/ (or "none: <reason>") · Intent: <path or none> · Written by: <agent role or human> · Date: YYYY-MM-DD

## What changed and why
## Acceptance criteria         Spec IDs this satisfies (FR-…, SC-…), or "none: process change"
## Constitution check          The constitution-check skill's table
## Review                      REVIEW.md passes from an agent that did not write the change; each finding and what was done about it
## Verification                Commands run (make lint, make test, make evals, redteam/forbidden-actions.sh, …) and their output
## Cost and data-flow impact
## For the Author              Decisions needed before merging; anything wrong in the governance files
```
