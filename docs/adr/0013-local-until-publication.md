# ADR 0013: Develop locally until publication; publish the history unchanged

Status: accepted by the Author, 2026-10-07 · Spec: 000 (FR-001, User Story 4), 001

## Context

The plan was a public GitHub repository from the first commit, with pull requests, hosted CI, branch protection, and a protected environment as the outer gates. On 2026-10-07 the Author decided to build every phase locally, and to publish once the stack is locally sufficient and fully tested and the Author is ready for interviews. Until then there is no remote.

## Decision

- No GitHub repository, remote, or push until the Author publishes, and only the Author changes `main`. `bash-gate.sh` blocks agents from `git push`; from creating or changing a remote or a repository (including the `git -C` and `git -c` forms, `git config remote.*`, and repository creation through `gh api`); from switching to `main`; and from commits, merges, resets, and ref updates that would move it. A regex gate can be evaded by obfuscation, and the forbidden-action matrix records that as a known gap. These rules add to the Author's review; they don't replace branch protection after publication.
- Every change is a feature branch. The agent commits there and never merges; the Author reviews and merges locally with `git merge --no-ff`.
- A merge-request note in `docs/merge-requests/` stands in for the pull request: what changed, the spec it satisfies, the constitution check, the `REVIEW.md` passes from an agent that didn't write the change, and the verification output.
- Before a merge, the gate is `make check`: the corpus gate, the tests, lint, and the forbidden-action matrix. It stays the gate until spec 000 makes `make lint`, `make test`, and `make evals` runnable. Hooks, permissions, and the sandbox work as before.
- At publication, the Author pushes the full local history with no squash, so the repository is still public from its first commit (spec 000 FR-001). The one allowed rewrite is a pre-publication cleanup: if a history-wide scan finds a secret, an amount, or a denylisted phrase in any commit, the Author removes it before the first push (corpus/README.md, Public safety) and records the cleanup in a merge-request note. Branch protection, the `production` environment, secret scanning, and Dependabot are turned on before the next agent session.

## Alternatives considered

- **Public from the first commit (the original plan).** Every gate exists from day one, but unfinished work is public before the Author chooses to show it.
- **A private GitHub repository until publication.** Pull requests and Actions would work, but branch protection on a private repository may need a paid plan, and it adds a remote the Author doesn't need yet. It is still a reasonable way to rehearse the CI workflows before publishing.
- **Squash the local history at publication.** A tidier log, but it erases the audit trail that Principles III and VI depend on.

## Consequences

- The GitHub-side gates can't be verified until publication: in spec 000, User Story 4 (spec-link check, CI, the reviewer GitHub Action, branch protection), User Story 6 scenario 1 (the public README), FR-001, FR-005 and FR-016 (images built in CI), FR-011, FR-012 (scanning in CI), FR-014, FR-015, SC-004, and SC-008; in spec 001, plan-in-PR and the protected apply. Spec 000 has to say how each is verified locally first and confirmed at publication.
- For the local phase, this deviates from Principle VI and from the pull-request wording in Principle III, the Review section, and Development Workflow steps 2 and 5. Governance requires a written justification in the spec, so spec 000's Assumptions record the deviation.
- Nothing scans for secrets until spec 000 adds pre-commit scanning. Until then the Author's review is the only check, and a history-wide scan for secrets, amounts, and denylisted phrases runs before the first push.
- The merge-request notes become part of the public record at publication.

## Links

Intent: none (process decision). Spec: 000, 001. Merge request: `docs/merge-requests/2026-10-07-chore-gate-fixes-and-local-workflow.md`.
