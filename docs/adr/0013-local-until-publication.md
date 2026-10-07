# ADR 0013: Develop locally until publication; publish the history unchanged

Status: accepted by the Author, 2026-10-07 · Spec: 000 (FR-001, User Story 4), 001

## Context

The plan was a public GitHub repository from the first commit, with pull requests, hosted CI, branch protection, and a protected environment as the outer gates. On 2026-10-07 the Author decided to build every phase locally, and to publish once the stack is locally sufficient and fully tested and the Author is ready for interviews. Until then there is no remote.

## Decision

- No GitHub repository, remote, or push until the Author publishes. Agents never create one; `bash-gate.sh` blocks `gh repo create`, `gh repo fork`, `git remote add`, and `git remote set-url`.
- Every change is a feature branch. The agent commits there and never merges; the Author reviews and merges locally with `git merge --no-ff`.
- A merge-request note in `docs/merge-requests/` stands in for the pull request: what changed, the spec it satisfies, the constitution check, the `REVIEW.md` passes from an agent that didn't write the change, and the verification output.
- Before a merge, the gates are the `make` targets and `redteam/forbidden-actions.sh`. Hooks, permissions, and the sandbox work as before.
- At publication, the Author pushes the full local history unchanged, with no squash or rewrite, so the repository is still public from its first commit (spec 000 FR-001). Branch protection, the `production` environment, secret scanning, and Dependabot are turned on before the next agent session.

## Alternatives considered

- **Public from the first commit (the original plan).** Every gate exists from day one, but unfinished work is public before the Author chooses to show it.
- **A private GitHub repository until publication.** Pull requests and Actions would work, but branch protection on a private repository may need a paid plan, and it adds a remote the Author doesn't need yet. It is still a reasonable way to rehearse the CI workflows before publishing.
- **Squash the local history at publication.** A tidier log, but it erases the audit trail that Principles III and VI depend on.

## Consequences

- The GitHub-side gates can't be verified until publication: spec 000's User Story 4 (spec-link check, CI, the reviewer GitHub Action, branch protection), FR-011, FR-014, FR-015, SC-004, and SC-008, and spec 001's plan-in-PR and protected apply. Spec 000 has to say how each is verified locally first and confirmed at publication.
- Until publication, secret scanning can only run locally (spec 000 puts it in pre-commit). Because the history is published unchanged, nothing secret may be committed in the meantime.
- The merge-request notes become part of the public record at publication.

## Links

Intent: none (process decision). Spec: 000, 001. Merge request: `docs/merge-requests/2026-10-07-chore-gate-fixes-and-local-workflow.md`.
