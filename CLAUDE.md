# h4reet.ai — AI twin portfolio

Public, production-grade portfolio: an AI twin of the Author, local-first, built in the open.
`.specify/memory/constitution.md` supersedes this file. When they disagree, fix this file.

## Lifecycle (every change)
intent (`intent/`) → `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` (plan mode) → `/speckit-tasks` → `/speckit-analyze` → implement → `/speckit-converge` → `REVIEW.md` passes → human merge.
Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`. If implementation departs from the plan, update `plan.md` in the same commit.
Local until the Author publishes (ADR 0013): commit on a feature branch and end it with a note in `docs/merge-requests/`; never merge, push, or create a remote. The Author merges locally.

## Commands
- Setup: `make setup` (devcontainer already has the toolchain)
- Build: `make build` — must end with `BUILD OK`
- Test: `make test` (all), `make test-fast` (pre-commit subset), `make evals`, `make redteam`. Until spec 000 adds what those need: `make check` (corpus gate, tests, lint, hook matrix)
- Lint/format: `make lint` (zero warnings), `make fmt`
- Local production stack: `make up` / `make down` (whole topology, local models)
- Infra: `make plan` only. There is no `make apply` on purpose — apply is a human action in the protected CI environment.
- Kill-switch rehearsal: `make breach-test` (dev only)

## Conventions
- TypeScript (web, services), Python (ML, evals). Everything ships as a container; images are built in CI and promoted unchanged.
- Model calls go through `services/gateway` only. Never call a provider SDK directly. Every call carries provider, model, tokens, cost.
- Routing is configuration (`config/routing.yaml`): local-first, Bedrock fallback within sub-budget, then degraded. Check kill-switch state at request start; unknown state = degraded.
- No payloads in telemetry unless `TELEMETRY_PAYLOAD_SAMPLING` is explicitly on. No secrets anywhere in the repo, context, or traces.
- New endpoint or feature → also: telemetry span, dashboard panel, cost estimate in the spec, degraded-mode behavior, data-flow disclosure entry if a byte leaves the visitor's device.

## Architecture
- `apps/web` — static site + 3D room (Three.js), served from the edge.
- `services/gateway` — provider-agnostic model gateway, routing, cost meter.
- `services/relay` — thin cloud API; kill-switch flag; budget checks.
- `infra/` — Terraform, one AWS account, per-environment roles/tags/budgets.
- `deploy/` — compose topology (one file, per-environment config), local-tier deployer (pull-based).
- `corpus/` — the twin's only source of truth about the Author. Human-authored; propose changes in `corpus/proposals/`.
- `evals/`, `redteam/` — harnesses; `evals/agent-config/` tests `.claude/**` and this file.
- `specs/`, `intent/`, `docs/adr/`, `docs/incidents/`, `docs/how-we-build/` — the artifact chain.

## Agent roles (`.claude/agents/`)
spec-writer · implementer · reviewer (read-only) · red-teamer (read-only) · ops (plan only) · docs (read-only on source).
The agent that implements never reviews. Agent teams are experimental here; use only for independent workstreams.

## Verifying your work
Run `make lint`, `make test`, and `make evals` (until they can run, `make check`) before reporting any task complete, and paste the output.
If a test fails, fix the code, not the test. Do not edit test files during a fix task (a hook blocks it).

## Things Claude gets wrong
- Adding a provider call outside the gateway, or a call without cost attributes.
- Treating the local tier as a demo. It is production; `make up` must always work.
- Editing `.claude/**`, `REVIEW.md`, or the constitution from an agent session. These change only by the Author's hand (a human PR after publication).
- Running `terraform apply`. Never. Plan only.
- Editing `corpus/`, or stating a number about the Author that isn't in the corpus or a filled `facts/` slot.
- Widening `permissions.allow` or sandbox domains to make a task easier. Ask instead.
