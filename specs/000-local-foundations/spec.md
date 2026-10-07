# Feature Specification: Local Foundations — The Whole Production Stack in Compose, Governed and Metered

**Feature Branch**: `000-local-foundations`

**Created**: 2026-09-04 · **Revised**: 2026-10-07

**Status**: Draft

**Input**: `intent.md` in this folder. Summary: before any visitor-facing feature and before any cloud resource, stand up the public repository under the constitution, the role-scoped multi-agent environment with policy hooks, CI gates that enforce the intent → spec → plan → review chain on hosted runners, and the entire production topology as one compose stack running on the RTX 5090 machine — local model server, provider-agnostic gateway (local adapter and Bedrock adapter, local-first), real-time cost meter and kill switch with Telegram alerts, self-hosted Langfuse and Grafana, and a hello endpoint — proven by deliberately tripping the kill switch. Spec `001-cloud-elevation` then lifts this same stack to AWS with Terraform.

## User Scenarios & Testing *(mandatory)*

The "users" of this phase are the Author as operator and builder, the AI agents that will do most implementation, and the public reader the repository is meant to convince.

### User Story 1 - The Entire Production Stack Runs on My Local Machine, Calling Local Models (Priority: P1)

As the Author, I want one command to bring up the complete production topology on the RTX 5090 machine — gateway, local model server, kill-switch state, cost meter, Langfuse, Grafana, hello endpoint — so that the local tier is a real production tier and this compose definition is exactly what later ships to a cloud VM.

**Why this priority**: Constitution Principle I and the intent's central constraint. Everything else in this spec attaches to this stack.

**Independent Test**: On a clean checkout on the 5090 host, `make up` starts the stack; the hello endpoint answers from the local model with a complete trace in Langfuse and a panel update in Grafana; `make down` stops it.

**Acceptance Scenarios**:

1. **Given** the 5090 host with the container runtime and GPU support installed, **When** `make up` runs, **Then** every service starts from pinned images and the hello endpoint answers within 10 minutes of a cold start including model download.
2. **Given** the stack is up, **When** hello is called, **Then** the response comes from the local adapter and a complete trace appears in the local Langfuse.
3. **Given** the stack is up, **When** inspected from another machine on the network, **Then** only the intended local ports are exposed, and no port is reachable from the internet.
4. **Given** `ENV=dev` and `ENV=prod` configurations, **When** both stacks run on the same host, **Then** they are isolated (separate networks, volumes, ports) and cannot reach each other's state.
5. **Given** the same compose definition, **When** a different environment file is supplied, **Then** nothing but configuration differs — no image, no service, no code path.

---

### User Story 2 - The Cost Kill Switch Fires Before Anyone Can Run Up a Bill (Priority: P1)

As the operator, I want metered spend attributed per request, alerted on, and automatically capped at $5/day and $20/month by a real-time meter inside the stack, so that the day the stack becomes reachable from the internet, cost failure is already bounded — proven by a rehearsed breach.

**Why this priority**: Constitution Principle V, and the first control band in the closing-the-loop pattern: deterministic detection, tiered response, agent only afterward.

**Independent Test**: `make breach-test` (ENV=dev) drives synthetic metered calls: warning alert on Telegram at 70%, kill switch flips to `degraded` at 100%, hello returns the degraded response, Grafana shows the state, an incident `intent.md` is drafted, a manual reset with a reason restores service and is audited. Recorded and linked from the README.

**Acceptance Scenarios**:

1. **Given** spend below the warning threshold, **When** a metered call completes, **Then** its estimated cost is a telemetry attribute, added to the daily and monthly meters, and visible on the dashboard within 60 seconds.
2. **Given** the daily meter reaches $3.50 or the monthly meter reaches $14, **When** the threshold is crossed, **Then** Telegram (primary) and email (secondary) alerts arrive within 5 minutes and the dashboard shows warning.
3. **Given** a meter reaches its ceiling ($5 / $20), **When** the threshold is crossed, **Then** the kill switch sets `degraded`, metered calls are refused with the documented response, and the operator is alerted — with no human action.
4. **Given** the runtime is `degraded`, **When** the operator resets with a reason, **Then** service resumes and the reset is audited (who, when, why) and shown on the dashboard.
5. **Given** the monthly ceiling was reached, **When** a new day begins, **Then** the runtime stays `degraded` until the month rolls over or the operator resets.
6. **Given** a breach occurred, **When** the loop runs, **Then** an incident `intent.md` is drafted in the intent format with evidence attached.
7. **Given** the kill-switch state store is unreachable, **When** a request arrives, **Then** it is treated as `degraded` (fail closed).
8. **Given** the breach test runs, **When** it completes, **Then** every step above is asserted from a trace, metric, or log.

---

### User Story 3 - Role-Scoped Agents Cannot Do What the Policy Forbids (Priority: P1)

As the Author, I want to delegate work to agents in named roles inside a sandboxed, reproducible environment where prohibited actions are blocked by enforcement points rather than by asking nicely, so that the development environment is itself the demonstration of safe agentic engineering.

**Why this priority**: Constitution Principle IV. Agents write the rest of the system; their guardrails come first.

**Independent Test**: The forbidden-action matrix (`redteam/forbidden-actions.sh`): for each role, each prohibited action, direct and indirect. Every attempt blocked, logged, and reported in the PR.

**Acceptance Scenarios**:

1. **Given** the repository opened in the devcontainer with the committed permissions, hooks, and sandbox settings, **When** any role is invoked, **Then** it has only its allowlisted tools, cannot read credential files or secret-bearing environment variables, and cannot reach non-allowlisted domains.
2. **Given** the implementer, **When** it attempts a prohibited shell command, **Then** the pre-execution hook blocks it, returns the reason, and appends an audit record.
3. **Given** the reviewer, red-teamer, or docs agent, **When** it attempts to modify source, **Then** the write is refused.
4. **Given** the ops agent, **When** it runs Terraform, **Then** `plan` succeeds and `apply`/`destroy` are refused.
5. **Given** any agent in a fix task, **When** it attempts to edit a test file, **Then** the edit is refused.
6. **Given** any agent, **When** it attempts to edit `.claude/**`, `REVIEW.md`, CI workflows, or the constitution, **Then** the edit is refused.
7. **Given** a subagent completes, **When** its report returns, **Then** it is checked for instruction-shaped content and the result logged.
8. **Given** a fresh clone, **When** a contributor follows the README, **Then** they reach a running devcontainer with passing tests in under 30 minutes.

---

### User Story 4 - No Code Merges Without a Spec, and Every PR Is Reviewed by Someone Who Didn't Write It (Priority: P1)

As the Author, I want CI on hosted runners to refuse any implementation PR without an approved spec, run the tests and the eval and red-team scaffolds, and post the `REVIEW.md` passes from a reviewer with no write access.

**Why this priority**: Constitution Principle III.

**Independent Test**: A PR changing source without a spec link fails with an actionable message; a PR with a link runs all gates and receives the reviewer's comment; a PR changing a hook runs the agent-configuration evals.

**Acceptance Scenarios**:

1. **Given** a PR touching `apps/`, `services/`, `deploy/`, or `infra/`, **When** it references no `specs/NNN-*/spec.md`, **Then** the required check fails and explains how to link one.
2. **Given** a linked PR, **When** CI runs, **Then** tests, eval harness, red-team harness, secret scanning, dependency and static analysis, image build, and a constitution check all report status.
3. **Given** the same PR, **When** the reviewer agent runs headlessly, **Then** it posts one comment with the four `REVIEW.md` passes tagged by severity, and it has no write access.
4. **Given** a PR changing `CLAUDE.md`, `REVIEW.md`, or `.claude/**`, **When** CI runs, **Then** the agent-configuration eval suite runs and a drop below threshold blocks merge.
5. **Given** branch protection on `main`, **When** any actor other than the Author attempts to merge, **Then** it is refused.

---

### User Story 5 - Local-First Gateway with Cloud Fallback, Fully Traced (Priority: P2)

As the builder, I want hello to route local-first with Bedrock as fallback inside its own sub-budget, emitting a complete trace either way, so that routing, observability, and cost plumbing are proven on something trivial.

**Why this priority**: Principles I and V; proves degraded-mode design before it matters.

**Independent Test**: Call hello with the local model up (local answer); stop the model server and call again (Bedrock answer, cost metered against the fallback sub-budget); exhaust the sub-budget and call again (degraded response). Each path visible in Langfuse and Grafana within 60 seconds.

**Acceptance Scenarios**:

1. **Given** the local adapter is healthy, **When** hello is called, **Then** it is answered locally and the span records provider, model, tokens, latency, and cost (zero marginal) per the GenAI semantic conventions.
2. **Given** the local adapter fails health checks, **When** hello is called, **Then** Bedrock answers within 5 seconds of the first failed check, the span records the fallback, and cost is metered against the sub-budget.
3. **Given** the sub-budget is exhausted and the local tier is down, **When** hello is called, **Then** the degraded response is returned and the dashboard shows why.
4. **Given** the configuration names another adapter, **When** the same request is made, **Then** response and span shape are identical apart from provider and model, and the contract test passes for it.
5. **Given** telemetry is exported, **When** inspected, **Then** it contains no secret material and no payloads unless payload sampling is explicitly enabled.

---

### User Story 6 - The Repository Explains Itself to a Stranger (Priority: P3)

As a hiring manager or principal engineer landing cold, I want to understand within ten minutes what this is, why it is built this way, how the team works with agents, and where to watch it running.

**Why this priority**: Principle VI. Structure from the first commit; content grows.

**Independent Test**: A reader follows the README to the constitution, the intent inbox, the spec index, the ADR index, the how-we-build guide, and the recorded breach test without asking a question.

**Acceptance Scenarios**:

1. **Given** the public repository, **When** opened, **Then** the README links the constitution, `intent/`, the spec index, the ADR index, `docs/how-we-build/`, `SECURITY.md`, and the MIT license.
2. **Given** a decision made here (local-first routing; one compose topology; Langfuse and Grafana; Telegram alerting; local-compose-first delivery), **When** a reader looks for the reasoning, **Then** an ADR exists.

---

### Edge Cases

- Burst faster than telemetry: the meter is checked at request start, and a per-client request cap inside the gateway bounds overspend by requests, not minutes.
- Model download or GPU driver failure on cold start: `make up` reports which service failed and why; hello degrades rather than hangs.
- Indirect forbidden actions (a script that does the thing): hooks plus sandbox network and credential denies plus branch protection. The matrix includes one indirect variant per action.
- Legitimate change to budgets, alerting, or the kill switch: ADR plus Author approval; CI flags it sensitive.
- Alert channel down: the secondary fires; degradation never depends on delivery.
- Request in flight when state flips: it completes; the flag is read at request start.
- Fork PR from a stranger: hosted runners, read-only tokens; no self-hosted runner ever.
- Windows host sleeping or WSL2 restarting: out of scope for the stack itself; the local-tier runbook (spec 001) covers wake, restart, and tunnel.

## Requirements *(mandatory)*

### Functional Requirements

**Repository & governance**

- **FR-001**: The repository MUST be public from its first commit and contain the MIT license, `SECURITY.md`, `CONTRIBUTING.md`, a code of conduct, `CODEOWNERS` covering the enforcement layer, `intent/` with the template, `docs/adr/`, `docs/incidents/`, and `docs/how-we-build/`.
- **FR-002**: The constitution MUST be at `.specify/memory/constitution.md` and linked from the README; `CLAUDE.md` and `REVIEW.md` MUST reference it as superseding.
- **FR-003**: WHEN a decision listed in User Story 6 is made, THE SYSTEM SHALL record it as an ADR in the same PR.
- **FR-004**: Every spec folder MUST contain the `intent.md` it was specified from.

**Development environment**

- **FR-005**: A devcontainer MUST provide the complete toolchain, and CI MUST run in the same image.
- **FR-006**: Agent roles MUST be defined under `.claude/agents/` with explicit tool allowlists; `CLAUDE.md` MUST stay under one page.
- **FR-007**: The committed `.claude/settings.json` MUST deny credential-file reads and secret-bearing environment variables, enable the sandbox with a network allowlist, pre-approve the safe inner loop, and register the hooks.
- **FR-008**: WHEN an agent attempts a prohibited action, THE SYSTEM SHALL block it via a pre-execution hook with a reason and an audit record. Prohibited at minimum: force-push; push to or merge into `main`; `terraform apply`/`destroy`; secret-pattern content; non-allowlisted egress; editing `.claude/**`, `REVIEW.md`, CI workflows, the constitution, or budget/alert/kill-switch configuration; adding MCP servers; editing test files during a fix task.
- **FR-009**: WHEN an agent edits source, THE SYSTEM SHALL run format and lint via a post-edit hook and report failures.
- **FR-010**: WHEN a subagent completes, THE SYSTEM SHALL check its report for instruction-shaped content and log the result.
- **FR-011**: WHEN `CLAUDE.md`, `REVIEW.md`, or `.claude/**` changes, THE SYSTEM SHALL run the agent-configuration evals in CI and block merge below threshold.

**Secrets, identity, supply chain**

- **FR-012**: No secret MUST exist in the repository, agent context, or telemetry; secret scanning MUST run on pre-commit and CI.
- **FR-013**: Local access to AWS (for the Bedrock adapter) MUST use SSO short-lived credentials held outside the repository and outside the agent sandbox; no IAM user access keys MUST exist.
- **FR-014**: Dependencies MUST be lockfile-pinned with automated updates; CI actions pinned by SHA; images built in CI from pinned bases with an SBOM; vulnerability and static analysis on every PR.
- **FR-015**: CI MUST run only on hosted runners.

**Compose stack**

- **FR-016**: Every service MUST be a container image built in CI and promoted unchanged.
- **FR-017**: One compose definition MUST describe the production topology; environments MUST differ only by an environment file.
- **FR-018**: `make up` MUST start the entire topology including the local model server with GPU access; `make down` MUST stop it.
- **FR-019**: The local model server MUST expose an OpenAI-compatible endpoint; images MUST support the RTX 5090's GPU architecture.
- **FR-020**: Multiple environments on one host MUST be isolated by network, volume, and port.

**Model gateway**

- **FR-021**: A single gateway interface MUST exist with adapters for a local OpenAI-compatible endpoint, Amazon Bedrock, direct vendor APIs, and OpenRouter. This spec ships local and Bedrock. Provider selection and routing policy MUST be configuration.
- **FR-022**: Routing MUST be local-first: WHEN the local adapter is healthy, route to it; WHEN unhealthy, route to Bedrock within the fallback sub-budget; WHEN that is exhausted or the kill switch is `degraded` or unknown, return the degraded response.
- **FR-023**: Every gateway call MUST record provider, model, input and output tokens, latency, routing decision, and estimated cost from a versioned price table.
- **FR-024**: A contract test suite MUST exist that any adapter must pass; both shipped adapters MUST pass it.
- **FR-025**: The gateway MUST enforce a per-client request cap.

**Observability**

- **FR-026**: Services MUST emit OpenTelemetry traces, metrics, and logs; model spans MUST follow the GenAI semantic conventions.
- **FR-027**: Langfuse MUST run in the stack as the LLM tracing and evaluation backend, receiving traces via OpenTelemetry.
- **FR-028**: Grafana MUST run in the stack with a dashboard showing request count, latency p50/p95, error rate, spend today and month-to-date, fallback sub-budget remaining, kill-switch state, and model-server health. Public exposure of this dashboard is spec 001.
- **FR-029**: Payloads MUST NOT be exported unless sampling is explicitly enabled; exported telemetry MUST be redacted of secret patterns.

**Cost control**

- **FR-030**: Ceilings MUST be $5/day and $20/month with warning thresholds at 70%, in version-controlled configuration, plus a Bedrock fallback sub-budget within the daily ceiling. [NEEDS CLARIFICATION: proposed $2/day fallback sub-budget — confirm].
- **FR-031**: A real-time meter in the stack MUST track daily and monthly metered spend and be checked at request start; it is the enforcement point.
- **FR-032**: WHEN a warning threshold is crossed, THE SYSTEM SHALL alert via Telegram (primary) and email (secondary) within 5 minutes.
- **FR-033**: WHEN a ceiling is reached, THE SYSTEM SHALL set `degraded`, refuse metered calls, and alert — without human action.
- **FR-034**: WHEN the operator resets, THE SYSTEM SHALL require a reason and record it in an audit log shown on the dashboard.
- **FR-035**: WHEN a ceiling is breached, THE SYSTEM SHALL draft an incident `intent.md` with evidence.
- **FR-036**: `make breach-test` MUST run against dev only and assert every step of User Story 2.
- **FR-037**: Development-time model spend MUST be tracked separately and reported on the dashboard.

**Runtime surface (this spec only)**

- **FR-038**: `health` and `hello` endpoints MUST exist; `hello` MUST invoke the gateway; the runtime MUST support `normal` and `degraded` states read at request start.

### Key Entities

Intent · Specification · ADR · Agent Role · Policy Hook · Provider Adapter · Routing Policy · Model Call Record · Budget · Kill Switch State · Control Band · Dashboard — as defined in the constitution and `docs/how-we-build/lifecycle.md`.

## Success Criteria *(mandatory)*

- **SC-001**: `make up` on the 5090 host reaches a locally answered hello with a complete Langfuse trace within 10 minutes of a cold start.
- **SC-002**: In the recorded breach test, `degraded` is active within 60 seconds of the ceiling and the Telegram alert arrives within 5 minutes, with no human action.
- **SC-003**: 100% of the forbidden-action matrix is blocked with an audit record.
- **SC-004**: Zero PRs touching `apps/`, `services/`, `deploy/`, or `infra/` can merge without a linked spec; a negative test PR stays open as evidence.
- **SC-005**: With the model server stopped, hello fails over to Bedrock within 5 seconds and the fallback cost appears on the dashboard within 60 seconds.
- **SC-006**: Both adapters pass the identical contract test; switching requires zero source changes.
- **SC-007**: A newcomer reaches a running devcontainer with passing tests in under 30 minutes.
- **SC-008**: The agent-configuration evals run on every `.claude/**` change and their history is public.
- **SC-009**: Every decision in User Story 6 has an ADR reachable from the README in two clicks.

## Assumptions

- A single Author builds and operates; the agent roles are the team.
- **Local until publication** (ADR 0013; the Author's decision of 2026-10-07). Every phase is developed locally and published later. For the local phase, this deviates from Principle VI (a public repository) and from the pull-request wording of Principle III, the Review section, and Development Workflow steps 2 and 5. Each change is a feature branch the Author merges locally; a note in `docs/merge-requests/` stands in for the PR, and `make check` stands in for CI. FR-001 still holds: the history is published from its first commit, with only the pre-publication cleanup that ADR 0013 allows. [NEEDS CLARIFICATION: how each GitHub-side requirement (User Story 4, User Story 6 scenario 1, FR-001, FR-005, FR-011, FR-012, FR-014, FR-015, FR-016, SC-004, SC-008) is verified locally before publication and confirmed after it]
- The RTX 5090 machine runs Windows with WSL2; the stack runs in WSL2 with GPU passthrough. It is on wall power and wired network.
- No cloud resources are created in this spec. The Bedrock adapter is exercised with the Author's SSO credentials; AWS Budgets, Terraform, the domain, edge protection, the public dashboard snapshot, and the outbound tunnel are spec `001-cloud-elevation`.
- Spec Kit is the lifecycle tooling and Claude Code the harness, under the committed project settings; dev-time model access is a subscription or key separate from the production budget.
- The twin persona, corpus, guardrail evals, voice, avatar rig, the room, the audience selector, and the rickshaw-walla page are Phases 1–3. Eval and red-team harnesses ship here as scaffolds that run and pass trivially.
