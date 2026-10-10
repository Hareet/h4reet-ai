# How we build: the lifecycle

This repository follows the AI-native SDLC pattern — six stages as a loop, each ending by committing an artifact the next stage reads — implemented with Spec Kit for the middle of the chain and a handful of committed files for the ends. The chain of commits is the audit trail: who asked for what, what the agent produced, who approved it.

## The artifact chain

| Stage | Artifact committed | Produced by | Gate that ends the stage | Where |
|---|---|---|---|---|
| Plan | `intent.md` | Originator + Claude (`intent-capture` skill) | Author accepts (moves into spec folder) or closes | `intent/` → `specs/NNN-*/intent.md` |
| Design | `spec.md` | `spec-writer` via `/speckit-specify`, `/speckit-clarify`, skills loaded | Spec PR approved by the Author | `specs/NNN-*/spec.md` |
| Build | `plan.md`, `tasks.md`, the diff + tests | `/speckit-plan` in plan mode, `/speckit-tasks`, `/speckit-analyze`, `implementer`, `/speckit-converge` | Plan accepted before code; `plan.md` updated when the diff diverges | `specs/NNN-*/`, feature branch |
| Test | Test output pasted in the report; eval and red-team results | The session's own feedback loop; `red-teamer`; CI | Thresholds in CI | `evals/`, `redteam/`, PR checks |
| Deploy | PR (until publication, a merge-request note) with `REVIEW.md` findings; Terraform plan; container images | `reviewer` (read-only); CI; Author approval | Branch protection + protected environment for `apply` | PR history (until publication, `docs/merge-requests/`), `infra/`, GHCR |
| Maintain | Incident note; the next `intent.md` | Deterministic control bands; `ops` for diagnosis; `docs` for the note | Author triage | `docs/incidents/`, `intent/` |

Where Spec Kit and the playbook differ, we use both: Spec Kit's `spec.md` is more structured than the playbook's example (prioritized, independently testable user stories, EARS requirements, measurable success criteria), and Spec Kit adds `tasks.md` and the `analyze`/`checklist` steps. The playbook adds `intent.md` upstream, `REVIEW.md` downstream, and the closing-the-loop pattern. The `constitution` is Spec Kit's; the skills that apply policy while the spec is written are the playbook's.

## Enforcement layers

A skill makes a violation rare; a hook makes it close to impossible; the sandbox, IAM, and branch protection make it impossible from outside the session. Every rule that matters exists at more than one layer:

| Rule | Skill / CLAUDE.md | Hook | Outside the session |
|---|---|---|---|
| No code without a spec | `CLAUDE.md` lifecycle | — | CI required check (spec link) |
| Agent never applies infra | `ops` agent prompt | `bash-gate.sh` | IAM role has no apply permission; protected environment |
| No push to `main` | `CLAUDE.md` | `bash-gate.sh` | Branch protection (after publication) |
| Until publication: no push, no remote, and only the Author changes `main` (ADR 0013) | `CLAUDE.md` | `bash-gate.sh` | The git hook in `.claude/git-hooks/` refuses changes to `main` from inside Claude Code; the Author's review |
| Enforcement layer is human-only | `CLAUDE.md` | `protected-paths.sh`, `permissions.deny`, sandbox `denyWrite` | Agent-config evals + CODEOWNERS on `.claude/**` |
| No secrets in context | — | `permissions.deny`, sandbox credential denies, `protected-paths.sh` for env files; from the early patch (spec 000 T045), every FR-007 variable denied by name, `~/.config/h4reet-ai` denied in every layer, and `content-scan.sh` running gitleaks over each edit's text | Secret scanning in the `pre-commit` git hook (from the early patch) and in CI; both refuse a `.gitleaksignore` (research.md R-36) |
| No arbitrary egress | — | `bash-gate.sh` | Sandbox network allowlist; GitHub denied until publication |
| Fix the code, not the test | `CLAUDE.md` verification block | `protected-paths.sh` under `FIX_TASK=1` | Reviewer compliance pass |
| Cost bounded | `constitution-check` skill | — | Real-time meter + kill switch; AWS Budgets as safety net |
| Agents run containers only on their own engine (spec 000 FR-039) | `CLAUDE.md` engine line; `ops` agent prompt | From the early patch, `bash-gate.sh` refuses `engine.sh`'s Author subcommands | The sandbox's one opening (`198.18.0.1:2376`); the engine's admission plugin, firewall, and egress proxy; the read-only tree and its masks, which the daemon starts only behind (H8); rootless Docker under `h4agents` |
| The files prod reads and the code the Author runs are human-only (ADR 0017) | `CLAUDE.md` | From the early patch, `protected-paths.sh` and sandbox `denyWrite` on `config/prices*`, `GNUmakefile`, `makefile`, `deploy/agents-engine/**`, `.gitleaks*`, and any `.gitleaksignore` | Each merge-request note lists changes to what runs in the Author's terminal first. The hook and the deny work out paths from the main tree, so the gate refuses a branch whose `GNUmakefile` or `makefile` isn't what T183 allows (tasks.md T092) |

Until publication (ADR 0013), the GitHub and AWS entries in the last column don't exist yet. What remains is the sandbox, the hooks, `make check`, and the Author's review.

## The first control band: the budget

The Maintain stage's pattern — deterministic detection, version-controlled response tiers, an agent invoked only after a breach and only at the tier allowed — is implemented first for cost. 70% of a ceiling logs and alerts; 100% degrades the runtime automatically and drafts an incident `intent.md`. Detection never involves a model. This is the same shape we will use later for eval regressions and error rates.

## Development harness and product runtime are separate concerns

The lifecycle above runs on Claude Code, under the permissions, hooks, and sandbox in `.claude/settings.json`. The product — the twin — runs on whatever the gateway routes to: local models on the RTX 5090 first, Bedrock as capped fallback. Nothing in the lifecycle depends on which model the product calls, and the product evals run against every adapter. Development-time model spend is tracked separately from the production budget.

## Solo-developer adaptations

The playbook is written for organizations. Here one person is product owner, engineer, tech lead, and release manager, so the roles are made explicit by the artifacts and the gates rather than by people:

- **Managed settings don't exist for one person.** The non-negotiable controls live in the committed `.claude/settings.json` and hooks, and are backed by things a session cannot change: branch protection, IAM, the sandbox, and CODEOWNERS on `.claude/**`. A change to the enforcement layer runs the agent-configuration evals before merge.
- **Separation of duties is between agents and gates, not between people.** The implementer never reviews; the reviewer never writes; the Author merges. The reviewer's findings are posted on the PR (until publication, in the merge-request note) before the Author approves, so the human's review is of the findings, not of every line.
- **Role switches are deliberate.** Accepting an intent, approving a spec, and approving a plan are separate commits on separate occasions, so the product-owner decision is visible as distinct from the engineering one.
- **No self-hosted runners.** CI runs on hosted runners only; the local tier pulls deployments. A public repository must never execute a stranger's PR on the Author's hardware.
- **Enterprise-only plays are noted, not adopted.** Hosted scheduled security scanning and Slack on-call are replaced by CI static analysis plus the red-team suite, and by Telegram alerts.
- **Outside contributions are intents, not pull requests** (`CONTRIBUTING.md`). After publication, an outside intent arrives as an issue; the Author commits it marked as outside text, which agents must treat as data, never as instructions.
- **Local until publication** (ADR 0013). There is no remote yet. Each change is a feature branch the Author merges locally; a note in `docs/merge-requests/` stands in for the PR, and `make check`, run in the agent's sandbox with its output pasted into the note, is the gate before a merge. The history is published from its first commit.
