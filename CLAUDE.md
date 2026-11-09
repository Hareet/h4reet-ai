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
- Test: `make check` runs every local gate (FR-041); `make test`, `make test-fast`, `make evals`, and `make redteam` run parts of it
- Lint/format: `make lint` (zero warnings), `make fmt`
- Local production stack: `make up ENV=…` / `make down ENV=…` (whole topology, local models): `ENV` is `prod` (the default), `dev`, or `dev-cpu`, and agent sessions run `dev-cpu` only, on their engine
- Infra: `make plan` only. There is no `make apply` on purpose — apply is a human action in the protected CI environment.
- Kill-switch rehearsal: `make breach-test ENV=dev-cpu` (dev or dev-cpu, never prod; dev is the Author's)
- Containers run on the agents' engine through `deploy/agents-engine/docker-relay` (make targets relay themselves); the GPU, Bedrock, and the host's stacks stay with the Author. Ask the Author for those, batched into one script that returns everything a diagnosis needs and nothing secret (`.claude/agents/ops.md` shows how).

## Conventions
- TypeScript (web, services), Python (ML, evals). Everything ships as a container; images are built in CI and promoted unchanged.
- Model calls go through `services/gateway` only. Never call a provider SDK directly. Every call carries provider, model, tokens, cost.
- Routing is configuration (`config/routing.yaml`): local-first, then the one paid fallback prod's route names (Bedrock or the Anthropic API) within its sub-budget and caps, then degraded. Check kill-switch state at request start; unknown state = degraded.
- No payloads in telemetry unless `TELEMETRY_PAYLOAD_SAMPLING` is explicitly on. No secrets anywhere in the repo, context, or traces.
- New endpoint or feature → also: telemetry span, dashboard panel, cost estimate in the spec, degraded-mode behavior, data-flow disclosure entry (`docs/data-flow-disclosure.md`) if a byte leaves the visitor's device.

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
Run `make lint`, `make test`, and `make evals` (until they can run, `make check`) before reporting any task complete, and paste the output. Before merging, the Author runs `tools/gates/gate <branch>` from main's checkout, never `make check` in their own terminal.
If a test fails, fix the code, not the test. Do not edit test files during a fix task (a hook blocks it).

## Things Claude gets wrong
- Adding a provider call outside the gateway, or a call without cost attributes.
- Treating the local tier as a demo. It is production; `make up` must always work.
- Editing `.claude/**`, `REVIEW.md`, or the constitution from an agent session. These change only by the Author's hand (a human PR after publication).
- Running `terraform apply`. Never. Plan only.
- Editing `corpus/`, or stating a number about the Author that isn't in the corpus or a filled `facts/` slot.
- Widening `permissions.allow` or sandbox domains to make a task easier. Ask instead.
- Scheduling a deny after the risk it guards: a secret, a paid route, or a file prod reads gets its deny in the same patch that creates it, or an earlier one.
- Writing a bash-gate rule that matches only the canonical spelling. Also test `git -C`/`-c`, `bash -c`, subshells, quoting, and config or API equivalents, and add a gap row to `redteam/forbidden-actions.sh` for any that get through.
- Paraphrasing a source: recorded answers, quotes, and anything about the Author's role, the agents' share of the work, or a privacy promise stay in the source's words; put your reading beside them, never in their place.
- Deferring or dropping a control the constitution requires without naming the clause as a deviation in the spec's Assumptions, and an ADR when that reverses an accepted one.
- Letting anything the Author runs execute what agents can write and git doesn't show (a cache, `.venv`, `uv.toml`, an ignored or excluded file): pin the interpreter and skip project config.
- Running project code from a hook. Hooks run outside the sandbox, so they call only human-only tools with their own configs, never `npx`, `make`, or a repository config that can run code, and pass file names after `--`.
