# ADR 0006: intent.md + Spec Kit + REVIEW.md as the artifact chain; hooks as the deterministic layer

Status: proposed, 2026-10-08 · Spec: 000 (FR-001 to FR-004, FR-006 to FR-012, FR-041, FR-042; SC-003, SC-008, SC-009; User Stories 3 and 6)

## Context

The constitution asks that each change begin as an intent and pass through spec and plan before code, with humans merging (Principle III). It also asks that policy live "in enforcement points (hooks, IAM, branch protection, CI gates, the sandbox), never only in prompts or skills." Principle IV adds: "a skill makes violations rare, a hook makes them close to impossible, and a rule that matters has both."

ADR 0012 fixed the Spec Kit order: specify, clarify, plan, tasks, analyze, implement, converge. ADR 0013 made the merge-request note the stand-in for a pull request until publication.

## Decision

The chain. Each stage ends by committing the artifact the next stage reads (`docs/how-we-build/lifecycle.md`):

1. Intent: `intent/NNN-name.md`, accepted or closed by the Author.
2. Spec: `/speckit-specify` and `/speckit-clarify`, with EARS or Given/When/Then criteria. The Author approves it.
3. Plan: `/speckit-plan` in plan mode. `plan.md` is approved before any code exists.
4. Tasks and analysis: `/speckit-tasks`, then `/speckit-analyze`, which is read-only.
5. Implement: the `implementer` on a feature branch. Tests come with or before the code. A bug fix starts from a failing test the agent may not edit.
6. Converge: `/speckit-converge` appends unbuilt work to `tasks.md`.
7. Diff and tests: `make check` (until spec 000 adds `make lint`, `make test`, and `make evals`), with the output pasted.
8. Review: the `reviewer` runs the passes in `REVIEW.md`, read-only, from an agent that did not write the change. Findings go into the merge-request note.
9. Merge: the Author merges locally with `git merge --no-ff`. A decision that needs an ADR gets one on the same branch (FR-003).

Deterministic layers, the ones that decide:

- Permissions and the sandbox. The committed settings deny credential files and secret variables by name (FR-007), and the network allowlist is the only way out (FR-008).
- Hooks, fail-closed and audited: `bash-gate.sh`, `protected-paths.sh` (governance files, and test files during a fix task), `post-edit-check.sh` (format and lint, FR-009), and `subagent-report-check.sh` (FR-010). Each decision is appended to `.claude/audit/hooks.log` through `_audit.sh`. The plan adds role scopes from `agent_type` and a secret-content check.
- Git hooks: `.claude/git-hooks/reference-transaction` refuses any change to `main` made inside Claude Code, whatever the spelling. The Author's own terminal is unaffected (ADR 0013).
- The clean-room gate, `tools/gates/gate` (ADR 0017).
- The matrix, `redteam/forbidden-actions.sh`. It proves each layer above and reports passed, failed, known gaps, and skipped rows, each with its reason (SC-003).

Soft layer: `CLAUDE.md`, kept under one page (FR-006), and the skills. They guide. They do not enforce.

Agent-configuration evals (FR-011, SC-008) run before the Author merges any change to `.claude/**`, `CLAUDE.md`, or `REVIEW.md`. A static tier runs in `make check`. A behavioral tier runs each role through `claude -p`. Their cases and history are human-only (ADR 0017).

## Alternatives considered

- Prompts alone. Rejected: the constitution says a rule that matters needs an enforcement point.
- CI-only enforcement. Rejected for now: no CI exists before publication (ADR 0014), and CI acts after the fact.
- Managed settings. Rejected: "Managed settings don't exist for one person" (how-we-build lifecycle).

## Consequences

- Cost: $0 cloud. Dev-time model use runs on the Claude Team plan, tracked apart from production (FR-037). A triggered behavioral run is about 36 short sessions (plan.md).
- Degraded mode: a hook that can't run fails closed. Without gitleaks, the commit and content hooks fail, and `make check` fails (FR-012). With the Team plan unavailable, the behavioral tier shows PENDING and the merge waits (FR-011).
- `claude -p` silently ignores a settings file that fails validation. The behavioral runs therefore require hook events in every case, and the Author runs `claude doctor` after each settings change.
- Known gaps, listed in the matrix: obfuscated commands can get past the regex gate (ADR 0013). Pre-existing git aliases are expanded before matching from the closing patch on (plan §13). Bash can read `*.env` files outside `deploy/env`, because Linux ignores glob denies. Placement contains that. Exfiltration through an allowlisted registry remains a residual risk. No secrets are in agent context.
- The constitution is explicit that "Findings inform the human approval; they never replace it." The reviewer's passes support the Author's merge. They do not replace it.

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [lifecycle guide](../how-we-build/lifecycle.md), [constitution](../../.specify/memory/constitution.md), [ADR 0012](0012-constitution-1-0-1-spec-kit-lifecycle.md), [ADR 0013](0013-local-until-publication.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md)
