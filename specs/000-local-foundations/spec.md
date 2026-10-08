# Feature Specification: Local Foundations — The Whole Production Stack in Compose, Governed and Metered

**Feature Branch**: `000-local-foundations`

**Created**: 2026-09-04 · **Revised**: 2026-10-08

**Status**: Draft

**Input**: `intent.md` in this folder. Summary: before any visitor-facing feature and before any cloud resource, stand up the public repository under the constitution, the role-scoped multi-agent environment with policy hooks, CI gates that enforce the intent → spec → plan → review chain on hosted runners, and the entire production topology as one compose stack running on the RTX 5090 machine — local model server, provider-agnostic gateway (local adapter and Bedrock adapter, local-first), real-time cost meter and kill switch with Telegram alerts, self-hosted Langfuse and Grafana, and a hello endpoint — proven by deliberately tripping the kill switch. Spec `001-cloud-elevation` then lifts this same stack to AWS with Terraform. (Clarified on 2026-10-07: making the repository public and the CI gates move to a separate publication spec; see Clarifications and Assumptions.)

## Clarifications

### Session 2026-10-07

- Q: How much of the $5 daily ceiling may the Bedrock cloud fallback spend per day? → A: $2/day, inside the daily ceiling, with a 70% warning at $1.40 like the other ceilings.
- Q: Until publication, how should spec 000 prove the requirements only GitHub can enforce (CI checks, the reviewer Action, branch protection, secret scanning, Dependabot, hosted runners)? → A: It doesn't. Every GitHub-side requirement moves out of spec 000 into a separate publication spec, and spec 000 closes on local criteria only.
- Q: After a spending ceiling trips the kill switch, should service come back on its own when the day or month rolls over, or only when the operator resets it? → A: Only when the operator resets it, for both ceilings. The reset brings local answers back at once; metered calls stay refused until the tripped meter rolls over. A rollover alone never restores service.
- Q: The agent sandbox blocks the Docker socket and the GPU; who runs the container-level checks during spec 000? → A: Agents get a separate, disposable container engine (a VM or devcontainer with its own daemon) for CPU-only stacks; the host's Docker socket, the GPU, and the host's stacks stay out of their reach. GPU checks and Bedrock calls run in the Author's terminal.
- Q: Spec 000 may create no cloud resources but requires email as the secondary alert channel; how are alert emails sent? → A: Over SMTP from a dedicated alerts mailbox (a free account used only to send alerts), with its app password in a local environment file outside the repository and outside agent context.
- Q: Does an image, a compose profile, or a dev-only test switch chosen by the environment file count as "only an environment file" (FR-017)? → A: "yes the env file can count as only a config change"
- Q: When the fallback sub-budget runs out, does fallback come back the next day on its own, or only after a human restores it (FR-030)? → A: "it does not renew on its own, a human approves renewal"
- Q: Does each environment on the host have its own ceilings, or do all environments share one budget (FR-031)? → A: "Yes each stack will have its own meter as we are only concerned for production environment, the dev environment won't use spend and will use a Claude Team plan"

### Session 2026-10-08 (plan interview)

- Q: The code of conduct names a contact, which only matters once the repository is public. Does it stay in spec 000 (FR-001)? → A: No. It moves to the publication spec, and its contact is chosen then.
- Q: Which clock defines the budget day and month (FR-030, FR-031)? → A: UTC.
- Q: When the operator renews the fallback sub-budget on the day it ran out, does fallback return that day (FR-030)? → A: Yes. A renewal grants a fresh $2 at once, still inside the $5 daily ceiling.
- Q: The sandbox can't run inside the devcontainer without being weakened. Where do agent sessions run (User Story 3, scenario 1)? → A: On the WSL host, under the full sandbox, with the devcontainer's tool versions. A check fails when the host's versions drift from the devcontainer's.

## User Scenarios & Testing *(mandatory)*

The "users" of this phase are the Author as operator and builder, the AI agents that will do most implementation, and the public reader the repository is meant to convince.

### User Story 1 - The Entire Production Stack Runs on My Local Machine, Calling Local Models (Priority: P1)

As the Author, I want one command to bring up the complete production topology on the RTX 5090 machine — gateway, local model server, kill-switch state, cost meter, Langfuse, Grafana, hello endpoint — so that the local tier is a real production tier and this compose definition is exactly what later ships to a cloud VM.

**Why this priority**: Constitution Principle I and the intent's central constraint. Everything else in this spec attaches to this stack.

**Independent Test**: On a clean checkout on the 5090 host, `make up` starts the stack and the operator initializes its store once (FR-031); the hello endpoint answers from the local model with a complete trace in Langfuse and a panel update in Grafana; `make down` stops it.

**Acceptance Scenarios**:

1. **Given** the 5090 host with the container runtime and GPU support installed, **When** `make up` runs, **Then** every service starts from pinned images and the hello endpoint answers within 10 minutes of a cold start including model download (on a new host, after the store's one-time initialization, FR-031).
2. **Given** the stack is up, **When** hello is called, **Then** the response comes from the local adapter and a complete trace appears in the local Langfuse.
3. **Given** the stack is up, **When** inspected from another machine on the network, **Then** only the intended local ports are exposed, and no port is reachable from the internet.
4. **Given** `ENV=dev` and `ENV=prod` configurations, **When** both stacks run on the same host, **Then** they are isolated (separate networks, volumes, ports) and cannot reach each other's state.
5. **Given** the same compose definition, **When** a different environment file is supplied, **Then** nothing but configuration differs: no code is changed or rebuilt per environment, and whatever the environment file selects (an image variant, a compose profile, a dev-only test switch) counts as configuration (FR-017).

---

### User Story 2 - The Cost Kill Switch Fires Before Anyone Can Run Up a Bill (Priority: P1)

As the operator, I want metered spend attributed per request, alerted on, and automatically capped at $5/day and $20/month by a real-time meter inside the stack, so that the day the stack becomes reachable from the internet, cost failure is already bounded — proven by a rehearsed breach.

**Why this priority**: Constitution Principle V, and the first control band in the closing-the-loop pattern: deterministic detection, tiered response, agent only afterward.

**Independent Test**: `make breach-test` (ENV=dev) drives synthetic metered calls: warning alert on Telegram at 70%, kill switch flips to `degraded` at 100%, hello returns the degraded response, Grafana shows the state, an incident `intent.md` is drafted, and a manual reset with a reason brings local answers back (metered calls stay refused while any meter is at or above its ceiling) and is audited. Recorded in the Author's terminal and linked from the README.

**Acceptance Scenarios**:

1. **Given** spend below the warning threshold, **When** a metered call completes, **Then** its estimated cost is a telemetry attribute, added to the daily and monthly meters, and visible on the dashboard within 60 seconds.
2. **Given** the daily meter reaches $3.50, the monthly meter reaches $14, or today's fallback spend reaches $1.40, **When** the threshold is crossed, **Then** Telegram (primary) and email (secondary) alerts arrive within 5 minutes and the dashboard shows warning.
3. **Given** a meter reaches its ceiling ($5 / $20), **When** the threshold is crossed, **Then** the kill switch sets `degraded`, every request gets the documented degraded response (FR-022), and the operator is alerted — with no human action.
4. **Given** the runtime is `degraded`, **When** the operator resets with a reason, **Then** local answers resume at once, metered calls stay refused while any meter is at or above its ceiling, and the reset is audited (who, when, why) and shown on the dashboard.
5. **Given** either ceiling was reached, **When** the day or the month rolls over, **Then** the meters roll over but the runtime stays `degraded` until the operator resets it (Principle V: a human consciously restores it).
6. **Given** a breach occurred, **When** the loop runs, **Then** an incident `intent.md` is drafted in the intent format with evidence attached.
7. **Given** the kill-switch state store or the meter is unreachable, or found empty and not yet initialized (FR-031), **When** a request arrives, **Then** it is treated as `degraded` (fail closed).
8. **Given** the breach test runs, **When** it completes, **Then** every step above is asserted from a trace, metric, or log.

---

### User Story 3 - Role-Scoped Agents Cannot Do What the Policy Forbids (Priority: P1)

As the Author, I want to delegate work to agents in named roles inside a sandboxed, reproducible environment where prohibited actions are blocked by enforcement points rather than by asking nicely, so that the development environment is itself the demonstration of safe agentic engineering.

**Why this priority**: Constitution Principle IV. Agents write the rest of the system; their guardrails come first.

**Independent Test**: The forbidden-action matrix (`redteam/forbidden-actions.sh`): for each role, each prohibited action, direct and indirect. Every attempt blocked, logged, and reported in the PR.

**Acceptance Scenarios**:

1. **Given** an agent session in the development environment (the WSL host with the devcontainer's tool versions; Clarifications, 2026-10-08) under the committed permissions, hooks, and sandbox settings, **When** any role is invoked, **Then** it has only its allowlisted tools, cannot read credential files or secret-bearing environment variables, cannot reach non-allowlisted domains, and cannot reach the host's container engine or the GPU (FR-039).
2. **Given** the implementer, **When** it attempts a prohibited shell command, **Then** the pre-execution hook blocks it, returns the reason, and appends an audit record.
3. **Given** the reviewer, red-teamer, or docs agent, **When** it attempts to modify source, **Then** the write is refused.
4. **Given** the ops agent, **When** it runs Terraform, **Then** `plan` succeeds and `apply`/`destroy` are refused.
5. **Given** any agent in a fix task, **When** it attempts to edit a test file, **Then** the edit is refused.
6. **Given** any agent, **When** it attempts to edit `.claude/**`, `REVIEW.md`, CI workflows, or the constitution, **Then** the edit is refused.
7. **Given** a subagent completes, **When** its report returns, **Then** it is checked for instruction-shaped content and the result logged.
8. **Given** a fresh clone, **When** a contributor follows the README, **Then** they reach a running devcontainer with passing tests in under 30 minutes.
9. **Given** an agent session, **When** it runs `make up` and `make breach-test` with the CPU-only environment file, **Then** the stack runs on the agents' own engine (FR-039); **When** a container on that engine tries to reach the host's engine, the GPU, the host's stacks, the Author's files, a path the sandbox denies, or a non-allowlisted domain, **Then** the attempt fails and the matrix records it.

---

### Moved to the publication spec: what was User Story 4

Not part of spec 000 (Clarifications, 2026-10-07; ADR 0014). Everything in it needs GitHub. Its text and acceptance scenarios are in `publication-carryover.md` in this folder, where the publication spec's intent starts. Until publication, the local stand-ins are the local gate (FR-041), the reviewer agent's `REVIEW.md` passes in every merge-request note, and the git hook that keeps `main` the Author's (ADR 0013).

---

### User Story 5 - Local-First Gateway with Cloud Fallback, Fully Traced (Priority: P2)

As the builder, I want hello to route local-first with Bedrock as fallback inside its own sub-budget, emitting a complete trace either way, so that routing, observability, and cost plumbing are proven on something trivial.

**Why this priority**: Principles I and V; proves degraded-mode design before it matters.

**Independent Test**: Call hello with the local model up (local answer); stop the model server and call again (Bedrock answer, cost metered against the fallback sub-budget); exhaust the sub-budget and call again (degraded response). Each path visible in Langfuse and Grafana within 60 seconds. The Bedrock steps run against production on the 5090 host, from the Author's terminal, because production is the only stack that spends (FR-031, FR-039); exhausting the sub-budget can use dev's synthetic spend instead (FR-036).

**Acceptance Scenarios**:

1. **Given** the local adapter is healthy, **When** hello is called, **Then** it is answered locally and the span records provider, model, tokens, latency, and cost (zero marginal) per the GenAI semantic conventions.
2. **Given** the local adapter fails health checks, **When** hello is called, **Then** Bedrock answers within 5 seconds of the first failed check, the span records the fallback, and cost is metered against the sub-budget.
3. **Given** the local tier is down and metered calls are refused (the sub-budget is exhausted, or a meter is at or above its ceiling after a reset), **When** hello is called, **Then** the degraded response is returned and the dashboard shows which of these applies.
4. **Given** the configuration names another adapter, **When** the same request is made, **Then** response and span shape are identical apart from provider and model, and the contract test passes for it.
5. **Given** telemetry is exported, **When** inspected, **Then** it contains no secret material and no payloads unless payload sampling is explicitly enabled.
6. **Given** the sub-budget ran out, **When** the day rolls over or the stack restarts, **Then** fallback stays refused until the operator approves its renewal, and the approval is audited (who, when, why) and shown on the dashboard (FR-030).
7. **Given** part of today's sub-budget is spent, **When** the stack restarts, **Then** today's fallback spend survives, and only the remainder can still be spent today (FR-031).

---

### User Story 6 - The Repository Explains Itself to a Stranger (Priority: P3)

As a hiring manager or principal engineer landing cold, I want to understand within ten minutes what this is, why it is built this way, how the team works with agents, and where to watch it running.

**Why this priority**: Principle VI. Structure from the first commit; content grows.

**Independent Test**: A reader follows the README to the constitution, the intent inbox, the spec index, the ADR index, the how-we-build guide, and the recorded breach test without asking a question.

**Acceptance Scenarios**:

1. **Given** a clone of the repository, **When** the README is opened, **Then** it links the constitution, `intent/`, the spec index, the ADR index, `docs/how-we-build/`, `SECURITY.md`, and the MIT license. (The same check on the public repository moved to the publication spec.)
2. **Given** a decision made here (local-first routing; one compose topology; Langfuse and Grafana; Telegram alerting; local-compose-first delivery), **When** a reader looks for the reasoning, **Then** an ADR exists.

---

### Edge Cases

- Burst faster than telemetry: the meter is checked at request start, and a per-client request cap inside the gateway bounds overspend by requests, not minutes.
- Model download or GPU driver failure on cold start: `make up` reports which service failed and why; hello degrades rather than hangs.
- Indirect forbidden actions (a script that does the thing): hooks plus sandbox network and credential denies plus the git hook that keeps `main` the Author's (ADR 0013; branch protection joins them at publication). The matrix includes one indirect variant per action.
- Legitimate change to budgets, alerting, or the kill switch: ADR plus Author approval. (CI flagging it as sensitive moved to the publication spec.)
- Alert channel down: the secondary fires; degradation never depends on delivery.
- Request in flight when state flips: it completes; the flag is read at request start.
- Windows host sleeping or WSL2 restarting: out of scope for the stack itself; the local-tier runbook (spec 001) covers wake, restart, and tunnel.

## Requirements *(mandatory)*

### Functional Requirements

**Repository & governance**

- **FR-001**: The repository MUST contain the MIT license, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS` covering the enforcement layer, `intent/` with the template, `docs/adr/`, `docs/incidents/`, and `docs/how-we-build/`, and its history MUST stay publishable from its first commit (ADR 0013). (Making it public and the code of conduct moved to the publication spec; Clarifications, 2026-10-07 and 2026-10-08.)
- **FR-002**: The constitution MUST be at `.specify/memory/constitution.md` and linked from the README; `CLAUDE.md` and `REVIEW.md` MUST reference it as superseding.
- **FR-003**: WHEN a decision listed in User Story 6 is made, THE SYSTEM SHALL record it as an ADR in the same PR.
- **FR-004**: Every spec folder MUST contain the `intent.md` it was specified from.
- **FR-041**: Until publication, `make check` MUST run every gate this spec adds that can run locally (tests, evals, the red-team and forbidden-action suites, lint, the pre-commit secret scan, and the image build), and every branch's merge-request note MUST carry its output and the reviewer agent's `REVIEW.md` passes (ADR 0013).

**Development environment**

- **FR-005**: A devcontainer MUST provide the complete toolchain. (CI running in the same image moved to the publication spec.)
- **FR-006**: Agent roles MUST be defined under `.claude/agents/` with explicit tool allowlists; `CLAUDE.md` MUST stay under one page.
- **FR-007**: The committed `.claude/settings.json` MUST deny credential-file reads and secret-bearing environment variables, enable the sandbox with a network allowlist, pre-approve the safe inner loop, and register the hooks. Every secret this spec introduces MUST be denied by name, both its environment variable and the file that holds it, with a forbidden-action matrix row for each. These include the Telegram bot token, the SMTP password, the operator's credential (FR-030, FR-034), and the stack's own service credentials. The environment files the host's stacks run with MUST be denied to agents for writing as well as reading.
- **FR-008**: WHEN an agent attempts a prohibited action, THE SYSTEM SHALL block it via a pre-execution hook with a reason and an audit record. Prohibited at minimum: force-push; push to or merge into `main`; `terraform apply`/`destroy`; secret-pattern content; non-allowlisted egress; editing `.claude/**`, `REVIEW.md`, CI workflows, the constitution, or budget/alert/kill-switch configuration; resetting the kill switch, or renewing the fallback sub-budget, of any stack outside the agents' own engine (FR-030, FR-034, FR-039); adding MCP servers; editing test files during a fix task.
- **FR-009**: WHEN an agent edits source, THE SYSTEM SHALL run format and lint via a post-edit hook and report failures.
- **FR-010**: WHEN a subagent completes, THE SYSTEM SHALL check its report for instruction-shaped content and log the result.
- **FR-011**: WHEN `CLAUDE.md`, `REVIEW.md`, or `.claude/**` changes, THE SYSTEM SHALL run the agent-configuration evals on the branch before the Author merges it, and a result below threshold SHALL fail the run. (Running them in CI and blocking the merge there moved to the publication spec.)
- **FR-039**: Agent sessions MUST have their own disposable container engine, separate from the host's, on which they run the stack CPU-only, including `make up`, `make down`, and `make breach-test`; disposable means it can be destroyed and recreated with one command and holds nothing the Author needs. FR-017 still holds: the same compose definition, with an environment file that selects a CPU stand-in model and, if the model server needs one, its CPU image. The engine MUST NOT run privileged on the host's engine, and MUST NOT reach the host's container engine, the GPU, the host's stacks, or the Author's files and credentials; it MAY see the working tree only read-only and without the paths the sandbox denies, so no container can write what the sandbox protects or read what it hides. Its containers MUST be held to the sandbox's network allowlist; images and the stand-in model come from allowlisted sources or are pulled in advance by the Author. The engine's own definition (its privileges, what it shares, and its egress policy) and the sandbox opening that lets agent sessions reach it change only by the Author's hand, and the opening MUST reach that engine and nothing else. The forbidden-action matrix MUST prove each of these limits from the host. GPU checks, Bedrock calls, and real alert delivery run in the Author's terminal, and their results go into the merge-request note, with no secrets or payloads.

**Secrets, identity, supply chain**

- **FR-012**: No secret MUST exist in the repository, agent context, or telemetry; secret scanning MUST run on pre-commit. (Secret scanning in CI moved to the publication spec.)
- **FR-013**: Local access to AWS (for the Bedrock adapter) MUST use SSO short-lived credentials held outside the repository and outside the agent sandbox; no IAM user access keys MUST exist.
- **FR-014**: Dependencies MUST be lockfile-pinned, and images MUST build from pinned bases. (Automated updates, CI actions pinned by SHA, images built in CI with an SBOM, and vulnerability and static analysis on every PR moved to the publication spec.)
- **FR-042**: `make publish-check` MUST scan every commit in the history for secrets and denylisted phrases, and the corpus Markdown in every commit for currency amounts (the corpus rule), and fail on any finding; the Author runs it before the first push (START-HERE section 6).

**Compose stack**

- **FR-016**: Every service MUST be a container image. (Building images in CI and promoting them unchanged moved to the publication spec.)
- **FR-017**: One compose definition MUST describe the production topology; environments MUST differ only by an environment file. What the environment file selects (an image variant, a compose profile, or a dev-only test switch) counts as configuration (Clarifications, 2026-10-07).
- **FR-018**: On the 5090 host, `make up` MUST start the entire topology including the local model server with GPU access, and `make down` MUST stop it; on the agents' engine, the CPU-only environment file starts it without the GPU (FR-039).
- **FR-019**: The local model server MUST expose an OpenAI-compatible endpoint; images MUST support the RTX 5090's GPU architecture.
- **FR-020**: Multiple environments on one host MUST be isolated by network, volume, and port.

**Model gateway**

- **FR-021**: A single gateway interface MUST exist with adapters for a local OpenAI-compatible endpoint, Amazon Bedrock, direct vendor APIs, and OpenRouter. This spec ships local and Bedrock. Provider selection and routing policy MUST be configuration.
- **FR-022**: Routing MUST be local-first and MUST decide in this order: WHEN the kill switch is `degraded` or unknown, return the degraded response; WHEN the local adapter is healthy, route to it; WHEN it is unhealthy, route to Bedrock, but only in a stack that has it (production, FR-031), while no meter is at or above its ceiling and the fallback sub-budget hasn't run out (FR-030); otherwise return the degraded response. Every degraded response records which condition applied.
- **FR-023**: Every gateway call MUST record provider, model, input and output tokens, latency, routing decision, and estimated cost from a versioned price table.
- **FR-024**: A contract test suite MUST exist that any adapter must pass; both shipped adapters MUST pass it.
- **FR-025**: The gateway MUST enforce a per-client request cap.

**Observability**

- **FR-026**: Services MUST emit OpenTelemetry traces, metrics, and logs; model spans MUST follow the GenAI semantic conventions.
- **FR-027**: Langfuse MUST run in the stack as the LLM tracing and evaluation backend, receiving traces via OpenTelemetry.
- **FR-028**: Grafana MUST run in the stack with a dashboard showing request count, latency p50/p95, error rate, spend today and month-to-date, fallback sub-budget remaining, kill-switch state, model-server health, and why responses are degraded when they are (FR-022). Public exposure of this dashboard is spec 001.
- **FR-029**: Payloads MUST NOT be exported unless sampling is explicitly enabled; exported telemetry MUST be redacted of secret patterns.
- **FR-040**: The data-flow disclosure MUST list every flow that leaves the local tier in this spec, with what each carries and why. These include the Bedrock fallback, the Telegram and SMTP alerts, image and model downloads, and any telemetry or update checks that third-party services send by default, which the plan switches off or lists. No visitor data flows in this spec.

**Cost control**

- **FR-030**: Production's ceilings MUST be $5/day and $20/month, each with a warning threshold at 70% ($3.50 and $14). Its Bedrock fallback sub-budget MUST be $2/day, counted inside the daily ceiling, with a warning at 70% ($1.40); it limits the calls routed to Bedrock as fallback (FR-022), and every metered call counts toward the ceilings. WHEN the sub-budget runs out, THE SYSTEM SHALL refuse fallback and alert, and fallback SHALL stay refused, across day rollovers, until the operator approves its renewal with the operator credential and a reason, recorded in the audit log as for FR-034. A renewal makes a fresh $2 available at once, still inside the daily ceiling: from that moment, up to $2 more can go to fallback that day, whatever was spent before it (Clarifications, 2026-10-08). A day that ends without running it out starts the next with the full $2. All of these MUST live in version-controlled configuration.
- **FR-031**: A real-time meter in the stack MUST track daily and monthly metered spend, by UTC day and month (Clarifications, 2026-10-08), and be checked at request start; it is the enforcement point. The meters, today's fallback spend, which ceilings have been crossed, whether the fallback sub-budget awaits renewal (FR-030), and the kill-switch state MUST survive a restart and `make down`. A store that is unreachable counts as unknown, which is `degraded` (fail closed). A store found empty, on a new host or after its data was removed, leaves the runtime `degraded` until the operator initializes it. Initialization is a reset under FR-034 (credential, reason, audit): it rebuilds the meters and today's fallback spend from the surviving call records (FR-023), and where none survive, it takes starting values the operator states in the reason; it leaves the fallback sub-budget awaiting renewal unless the operator renews it in the same action. Nothing sets the meters to zero silently. Each stack has its own meter, and production is the only stack that spends: FR-030's ceilings and sub-budget govern it, and a stack other than production MUST refuse to start with a paid adapter configured. The dev stack's meter applies the same thresholds to the breach test's synthetic spend (FR-036). Paid calls the Author makes while testing, such as the Bedrock contract test (FR-024) and Bedrock evals, count toward production's meter.
- **FR-032**: WHEN a warning threshold is crossed, THE SYSTEM SHALL alert via Telegram (primary) and email (secondary) within 5 minutes. Email goes over SMTP from a dedicated alerts mailbox whose credentials stay in a local environment file outside the repository and outside agent context (FR-007). Alerts MUST carry only operational facts (which threshold, the meter values, the runtime state, the time), never payloads, client identifiers, or secrets.
- **FR-033**: WHEN a ceiling is reached, THE SYSTEM SHALL set `degraded` (every request then gets the degraded response, FR-022) and alert — without human action. Only an operator reset (FR-034) SHALL restore `normal`; a meter rolling over SHALL NOT.
- **FR-034**: WHEN the operator resets, THE SYSTEM SHALL require an operator credential kept outside the repository and agent context (FR-007) and a reason, and record who and why in an audit log shown on the dashboard. Local answers resume at once; metered calls SHALL stay refused while any meter is at or above its ceiling (FR-022). Agents can't reset the kill switch of any stack outside their own engine (FR-008).
- **FR-035**: WHEN a ceiling is breached, THE SYSTEM SHALL draft an incident `intent.md` with evidence.
- **FR-036**: `make breach-test` MUST run against dev only (on the 5090 host, or CPU-only on the agents' engine, FR-039) and assert every step of User Story 2. It drives a synthetic metered source and a controllable clock for the rollovers. Both exist only for dev, because they would get around FR-034. The runtime MUST refuse synthetic spend and clock control in any environment but dev, and a prod stack MUST refuse to start if its environment file enables either. The local gate (FR-041) also fails if a committed environment template enables them for prod. On the agents' engine it asserts alert delivery against stand-in receivers and resets with a dev-only credential; real delivery and the recorded run (SC-002) are asserted in the Author's terminal.
- **FR-037**: Development-time model use (agents and agent evals) runs on a Claude Team plan, outside the production budget; its cost MUST be tracked separately and reported on the dashboard. Paid calls the Author makes while testing count toward production's meter instead (FR-031).

**Runtime surface (this spec only)**

- **FR-038**: `health` and `hello` endpoints MUST exist; `hello` MUST invoke the gateway; the runtime MUST support `normal` and `degraded` states read at request start, and a degraded response MUST name its cause (FR-022).

### Key Entities

Intent · Specification · ADR · Agent Role · Policy Hook · Provider Adapter · Routing Policy · Model Call Record · Budget · Kill Switch State · Control Band · Dashboard — as defined in the constitution and `docs/how-we-build/lifecycle.md`.

## Success Criteria *(mandatory)*

- **SC-001**: `make up` on the 5090 host reaches a locally answered hello with a complete Langfuse trace within 10 minutes of a cold start (on a new host, after the store's one-time initialization, FR-031).
- **SC-002**: In the recorded breach test, run in the Author's terminal, `degraded` is active within 60 seconds of the ceiling and the Telegram alert arrives within 5 minutes, with no human action.
- **SC-003**: 100% of the forbidden-action matrix is blocked with an audit record.
- **SC-005**: With the model server stopped, hello fails over to Bedrock within 5 seconds and the fallback cost appears on the dashboard within 60 seconds.
- **SC-006**: Both adapters pass the identical contract test; switching requires zero source changes.
- **SC-007**: A newcomer reaches a running devcontainer with passing tests in under 30 minutes.
- **SC-008**: The agent-configuration evals run on every `.claude/**` change before the Author merges it, and their history is committed. (Publishing that history moved to the publication spec.)
- **SC-009**: Every decision in User Story 6 has an ADR reachable from the README in two clicks.

## Assumptions

- A single Author builds and operates; the agent roles are the team.
- **Local until publication** (ADR 0013; the Author's decision of 2026-10-07). Every phase is developed locally and published later. For the local phase, this deviates from Principle VI (a public repository) and from the pull-request wording of Principle III, the Review section, and Development Workflow steps 2 and 5. Each change is a feature branch the Author merges locally; a note in `docs/merge-requests/` stands in for the PR, and `make check` stands in for CI (FR-041). The history stays publishable from its first commit, with only the pre-publication cleanup that ADR 0013 allows (FR-001), and `make publish-check` scans it before the first push (FR-042).
- **GitHub-side requirements move to a publication spec** (Clarifications, 2026-10-07; ADR 0014, which replaces one Consequence of ADR 0013). Spec 000 closes on local criteria only; a separate spec, specified from its own intent, takes over what only GitHub can enforce or show. `publication-carryover.md` in this folder holds the moved text word for word. Moved whole: User Story 4, FR-015 (CI only on hosted runners), SC-004 (no PR merges without a linked spec), and the fork-PR edge case; their numbers are not reused. Moved in part: the GitHub halves of User Story 6 scenario 1, FR-001, FR-005, FR-011, FR-012, FR-014, FR-016, SC-008, and the edge cases on budget changes and indirect forbidden actions. **Deviation, for the local phase:** this defers the constitution's controls that need CI: from Security & Agent Governance's supply-chain standard, secret scanning in CI, automated dependency updates, images built in CI with an SBOM, vulnerability and static analysis on every PR, and CI actions pinned by SHA; and Development Workflow step 6's containers "built once and promoted". Pre-commit secret scanning (FR-012), lockfile pins and pinned bases (FR-014), the local gate (FR-041), and the history scan (FR-042) stand in for some of them. Nothing local stands in for vulnerability scanning, SBOMs, automated updates, or building once and promoting, so until publication the local tier, which is production, runs without them.
- **Deviation: image variants** (Clarifications, answer 6; ADR 0015). The constitution's Technology Standards ask for one compose definition in every environment "with identical images and only configuration differing". Here, whatever the environment file selects counts as configuration, an image variant included. Justification: the agents' engine has no GPU (FR-039), and a model server may ship separate CPU and GPU images. The dev-only test switches the same answer covers are refused outside dev (FR-036).
- **Agent sessions on WSL** (Clarifications, 2026-10-08; ADR 0018). The devcontainer defines the toolchain, and agent sessions use the same tool versions on the WSL host, under the full sandbox, checked by `make toolchain-check`. The plan reads this as meeting the constitution's "a devcontainer defines the single toolchain used by humans, agents, and CI". ADR 0018 records that reading, so the Author can treat it as a deviation instead.
- **Expected cost**: the intent's estimate ("Cloud: only Bedrock fallback calls during testing, within the sub-budget.") with the clarifications applied. Bedrock spend happens only in production while testing: fallback within the $2/day sub-budget, and the contract test and Bedrock evals within production's ceilings. No other cloud resource. Dev-time: the Claude Team plan (FR-037); the agent-configuration evals on `.claude/**` changes are kept small.
- The RTX 5090 machine runs Windows with WSL2; the stack runs in WSL2 with GPU passthrough. It is on wall power and wired network.
- No cloud resources are created in this spec. The Bedrock adapter is exercised with SSO credentials the Author holds for a dedicated runtime identity, whose permission set allows only the Bedrock calls (plan research R-17); AWS Budgets, Terraform, the domain, edge protection, the public dashboard snapshot, and the outbound tunnel are spec `001-cloud-elevation`.
- Spec Kit is the lifecycle tooling and Claude Code the harness, under the committed project settings; dev-time model access is a Claude Team plan, separate from the production budget (Clarifications, 2026-10-07).
- The twin persona, corpus, guardrail evals, voice, avatar rig, the room, the audience selector, and the rickshaw-walla page are Phases 1–3. Eval and red-team harnesses ship here as scaffolds that run and pass trivially.
