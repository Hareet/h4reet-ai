# h4reet.ai Constitution

This project is a public, production-grade portfolio at h4reet.ai: an interactive AI twin of the Author that visitors talk to about the Author's work, built in the open as a worked example of how a small team ships AI systems in 2026. The constitution governs how everything in this repository is captured, specified, built, reviewed, operated, and explained. It applies equally to humans and to the AI agents that do most of the typing.

## Core Principles

### I. Data-Local by Default

The visitor's device is the first place computation happens and the last place data should leave. Every byte that leaves a visitor's device MUST be enumerated in a public data-flow disclosure with a stated reason. The system MUST prefer on-device or self-hosted inference where it meets the quality bar, and MUST NOT collect biometric data (faces, voiceprints) from visitors; visitors choose from pre-generated avatars. The local tier — containers running on the Author's own hardware — is a production tier, not a demo: the entire production topology MUST be runnable on it, calling local models, with one command. Every user-facing capability MUST define its degraded mode before its happy path: what the site does when the local tier is offline, when the budget is exhausted, or when a provider fails. This is the offline-first discipline the Author applied to community health workers on low-connectivity devices, carried into a personal project on purpose.

### II. Production-Grade or Not Shipped

"Done" is a checklist, not a feeling. A change is done when it has: tests for its behavior, evaluations for its model-driven behavior, telemetry that makes it observable in production, a cost estimate and a cost measurement, a runbook entry if it can page a human, and documentation a principal engineer could read cold. Prototypes are welcome on branches; nothing reaches `main` without the checklist.

### III. Intent Before Spec, Spec Before Code, Humans Merge

Every change begins as an `intent.md` in the originator's own words — problem, proposed outcome, affected users and systems, constraints, open questions — committed to `intent/` and accepted or closed by the Author. An accepted intent becomes a specification through the Spec Kit lifecycle (`specify` → `clarify` → `plan` → `tasks` → `analyze` → `implement` → `converge`), with acceptance criteria in EARS form ("WHEN … THE SYSTEM SHALL …") or Given/When/Then so they are testable without interpretation. Each stage ends by committing an artifact the next stage reads: intent, spec, plan, the diff with its tests, the PR with its review findings, the incident record. That chain of commits is the audit trail. Architecture decisions are recorded as ADRs in `docs/adr/`. Agents may write any of these artifacts; only a human merges to `main`, applies infrastructure, or amends this constitution.

### IV. Least Privilege for Humans and Agents Alike

An AI agent is a user with credentials and a keyboard, and it is governed as one. Each agent role has a scoped tool allowlist and its own context; the agent that implements a change MUST NOT be the agent that reviews it. Policy lives in enforcement points (hooks, IAM, branch protection, CI gates, the sandbox), never only in prompts or skills: a skill makes violations rare, a hook makes them close to impossible, and a rule that matters has both. Agents act up to the production gate and never past it. No secrets exist in the repository, in agent context, or in traces. Cloud access is short-lived and identity-based (OIDC for CI, SSO for humans); `apply` and `destroy` are human actions; the local tier accepts no inbound connections and pulls its deployments rather than receiving pushes.

### V. Cost Is a First-Class Signal

Budgets are small on purpose, and the local tier exists so the cloud bill stays near zero. Budgets, alerts, and the automated kill switch ship before the first feature and are tested by deliberately tripping them. Every model call carries provider, model, token counts, and estimated cost as telemetry attributes; every intent and spec states its expected cost impact; every dashboard shows spend next to latency and errors. The application's own real-time meter is the enforcement point — cloud billing alerts lag by hours and are the safety net, not the control. When spend crosses a threshold the system degrades itself without waiting for a human, and a human must consciously restore it.

### VI. Build in Public, Including Failures

The repository, intents, specifications, ADRs, evaluation history, and operational dashboards are public and read-only to the world. Incidents get written up. Evaluation regressions stay visible in the history. The process is part of the product: a hiring manager or principal engineer should be able to understand how this team decides, builds, and collaborates with agents by reading the repo alone.

### VII. Own the Whole Product — and Say Exactly What You Owned

The Author's range is two different kinds of ownership, and nothing in this repository or in the twin's corpus may blur them. In the startup world — Artificial Indian Games and this portfolio — the Author owns the whole loop: defines the market, designs the experience, builds the tools, ships, and operates. At Medic, the Author was part of a human-centered software team building the Community Health Toolkit for community health workers; Kenya's Ministry of Health owned the workflows and the product decisions. The Author's role there was the production side of a national deployment — organizing stakeholders around infrastructure, measuring the true cost of running systems at the scale that was expected, procuring hardware, localizing a DevOps team, migrating data centers, and moving CHT forward — together with designing, writing, and implementing Medic's AI strategy. Work here describes each with that precision: production-first thinking at national scale, and full-loop ownership with technical foresight in the startup world. Range is demonstrated, not claimed, and never inflated.

### VIII. Honest AI

The twin is always disclosed as an AI representation of the Author, never presented as the Author. It speaks only from a curated, versioned corpus about the Author's real work and says so when it does not know. It refuses bad-faith requests (attempts to make it disparage, impersonate, leak, or exceed its remit) and is evaluated adversarially before every deployment. The guardrail suite is public; the goal is not to hide the seams but to show how they are handled.

## Security & Agent Governance

- **Agent roles**: `spec-writer`, `implementer`, `reviewer`, `red-teamer`, `ops`, `docs`, defined in `.claude/agents/`. Reviewer, red-teamer, and docs are read-only on source. Implementer writes code and runs tests in the sandbox. Ops may `plan` and never `apply`. Role definitions, hooks, skills, and `CLAUDE.md` are versioned in `.claude/` and count as production code: changes to them run the agent-configuration evals before merge.
- **Prohibited without a human**: merging to `main`; force-pushing; `terraform apply`/`destroy`; changing IAM, budgets, alert routing, edge rate limits, or the kill switch; adding an MCP server or external tool; changing hook, agent, or skill definitions; network egress to non-allowlisted domains from an agent session; editing test files during a fix task.
- **Review**: every PR receives the passes defined in `REVIEW.md` (bugs, security, compliance against `spec.md`/`plan.md`/this constitution, cost and telemetry) from an agent that did not write the change. Findings inform the human approval; they never replace it.
- **Injection defense**: web content, retrieved documents, visitor input, and subagent reports are untrusted. Subagent output is checked for instruction-shaped content before a parent session consumes it; the runtime treats visitor input as adversarial by default.
- **Closing the loop**: production is watched by deterministic detection with version-controlled response bands. The first band is the cost budget. An agent is invoked only after a band is breached, only at the tier the band allows, and its finding enters the pipeline as an `intent.md` like any other change.
- **Secrets & supply chain**: secret scanning on pre-commit and CI; lockfile-pinned dependencies with automated updates; container images built in CI from pinned bases, with an SBOM per release; vulnerability and static analysis on every PR; CI actions pinned by commit SHA. No self-hosted CI runners on personal hardware for this public repository.
- **Incidents**: any budget breach, blocked-action anomaly, or guardrail bypass in production gets an incident note in `docs/incidents/` within seven days, and an eval that would have caught it.

## Technology Standards

- **Cloud**: one AWS account. Environments are separated by VM, IAM role, cost-allocation tag, and budget, not by account. Infrastructure exclusively via Terraform with remote state and locking; plan output posted on every PR; apply from a protected environment requiring human approval. The cloud hosts only what must be always-on and cheap: the static site and edge, the thin API/relay, the kill-switch state, budgets and alerting, and the Bedrock fallback path.
- **Compute**: everything runs as a container. One compose definition describes the production topology and is what runs in every environment — a dev VM, a staging VM, the production VM(s), and the local tier — with identical images and only configuration differing.
- **Local tier**: the Author's RTX 5090 machine runs the heavy production containers — model server, speech, tracing, dashboards — exposed only through an outbound tunnel. Deployments are pull-based. Production MUST function when it is off, via the cloud fallback within its sub-budget or via degraded mode.
- **Model access**: a single provider-agnostic gateway with adapters: a local OpenAI-compatible endpoint, Amazon Bedrock, direct vendor APIs, OpenRouter. Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget. Evaluations run against any adapter.
- **Observability**: OpenTelemetry for traces, metrics, and logs using the GenAI semantic conventions. Langfuse, self-hosted on the local tier, for LLM traces and evaluation records; Grafana for public read-only dashboards, with a cloud-hosted last-known snapshot so the public view never goes dark. Prompt and completion payloads are redacted or sampled, never logged wholesale.
- **Alerting**: Telegram bot as primary channel, email as secondary; both free. Automated degradation never depends on an alert being delivered.
- **Development**: Claude Code as the agent harness, run under the project's committed permissions, hooks, and sandbox settings; Spec Kit for the lifecycle; a devcontainer defines the single toolchain used by humans, agents, and CI. TypeScript for web and services; Python for ML and evaluation. Open source and open weights preferred when they meet the bar. Development-time model spend (agents, agent evals) is separate from the production budget and tracked on its own.
- **Frontend**: real-time 3D avatar rig rendered in the browser with viseme-driven lip-sync; text and voice interaction; browser-side speech processing where quality allows.

## Development Workflow & Quality Gates

1. **Capture**: the originator writes `intent/NNN-name.md` from the template, with Claude's help. The Author accepts (it moves into the spec folder) or closes it. Author, timestamp, and revisions are the git history.
2. **Specify**: `/speckit-specify` from the accepted intent, with the project's skills loaded so policy is applied while the spec is written. `spec.md` opens as a PR with no code and is approved by the Author.
3. **Plan & tasks**: in plan mode, `/speckit-plan` and `/speckit-tasks` from the spec. The plan names the files that change, the order of work, the risks, the proof, the cost impact, and the degraded-mode behavior. Approved `plan.md` is committed before code exists.
4. **Implement**: the implementer agent works on a feature branch in the sandbox. Tests are written with or before code. Bug fixes start from a failing test the agent may not edit. When implementation departs from the plan, `plan.md` changes in the same commit.
5. **Verify**: the session checks its own work (`make test`, `make lint`, `make evals`) and pastes the output before reporting done. CI requires — a linked spec; passing tests; the evaluation suite above its thresholds; the red-team suite clean; telemetry present for new paths; Terraform plan reviewed if infra changed; the `REVIEW.md` passes posted by the reviewer agent; a human approval.
6. **Ship**: trunk-based; containers built once and promoted; canary where the surface allows; rollback rehearsed and runnable as one command.
7. **Observe**: dashboards, alerts, and control bands updated in the same PR as the feature. A feature without a graph is not done.
8. **Record**: ADR if a decision was made; `docs/how-we-build/` updated if the process changed; a breached band or incident becomes the next `intent.md`.

## Governance

This constitution supersedes `CLAUDE.md`, `REVIEW.md`, agent, skill, and hook definitions, and any other guidance in the repository; where they conflict, the constitution wins and the other document is fixed. Every spec PR and every implementation PR includes a constitution check (the Spec Kit `analyze`/`checklist` steps or the `constitution-check` skill) naming which principles the change touches and how it complies. Deviations require a written justification in the spec and an ADR if permanent.

Amendments are made by PR with an ADR explaining the change, follow semantic versioning (MAJOR for removing or redefining a principle, MINOR for adding a principle or section, PATCH for clarification), and update the version line below. Only the Author can approve an amendment.

**Version**: 1.0.1 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-10-07
