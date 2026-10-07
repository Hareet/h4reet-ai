# Feature Specification: Cloud Elevation — Terraform, One Account, Same Compose Stack

**Feature Branch**: `001-cloud-elevation`

**Created**: 2026-09-07

**Status**: Draft (specify in full after spec 000 is implemented; the stack it elevates must exist first)

**Input**: `intent.md` in this folder.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Infrastructure Changes Are Planned by Machines and Applied by a Human (Priority: P1)

As the Author, I want all cloud infrastructure in Terraform in one AWS account, environments separated by VM, IAM role, tag, and budget, plan posted on every PR, apply gated behind a protected environment I approve, and only short-lived identity-based credentials anywhere.

**Independent Test**: A PR changing `infra/` shows the plan; merging does not apply; apply requires the Author's approval; an IAM audit shows zero access keys.

**Acceptance Scenarios**:

1. **Given** a PR changing `infra/`, **When** CI runs, **Then** the plan for the affected environment is posted and merge is blocked on plan failure.
2. **Given** a merged infra change, **When** the apply workflow runs, **Then** it pauses on a protected environment requiring the Author's approval.
3. **Given** CI needs cloud access, **When** it authenticates, **Then** it uses OIDC to an environment-scoped role; no static credentials exist.
4. **Given** resources exist, **When** costs are reported, **Then** every resource carries project, environment, and component tags under the correct environment budget.

### User Story 2 - The Same Compose Stack Runs on a Cloud VM (Priority: P1)

As the Author, I want the compose definition from spec 000, unchanged, to run on a Terraform-provisioned VM with a different environment file, so that "one topology, many environments" is demonstrated rather than claimed.

**Independent Test**: `terraform apply` (human) creates the VM; the deployer pulls the stack; hello answers via the relay with a full trace; destroying and recreating the VM yields an identical stack.

**Acceptance Scenarios**:

1. **Given** the VM is provisioned, **When** the deployer runs, **Then** the stack from `deploy/compose.yaml` starts with the cloud environment file and no other change.
2. **Given** the VM runs the stack, **When** hello is called through the relay, **Then** it routes exactly as spec 000 defines (local tier if healthy, Bedrock within sub-budget, else degraded).
3. **Given** a new image on `main`, **When** the deployer polls, **Then** it pulls and restarts only the affected service and records the deployment.

### User Story 3 - h4reet.ai Answers Whether or Not My Machine Is Awake (Priority: P1)

As a visitor, I want h4reet.ai to load over TLS from the edge and the hello endpoint to respond, degraded if necessary, regardless of the local tier's state.

**Independent Test**: With the local tier off, the site loads, hello answers via Bedrock or degraded, and the public dashboard shows last-known values plus tier status.

**Acceptance Scenarios**:

1. **Given** h4reet.ai, **When** requested, **Then** the static site is served over TLS from the edge with DNS managed in Terraform.
2. **Given** the local tier is unreachable, **When** hello is called, **Then** the relay routes to the fallback within the sub-budget or returns the degraded response, and the reason is visible on the dashboard.
3. **Given** the local tier is unreachable, **When** the public dashboard is viewed, **Then** a cloud-hosted snapshot shows last-known values and tier status; it does not go dark.
4. **Given** public exposure, **When** a client exceeds the edge request cap, **Then** it is limited before reaching the gateway. [NEEDS CLARIFICATION: mechanism within budget — managed WAF is a large fixed share of the ceiling; alternatives are an edge function with a counter store, or a free CDN tier in front].

### User Story 4 - The Local Tier Joins Production Without Opening a Port (Priority: P2)

As the operator, I want the RTX 5090 tier reachable by the relay only through an outbound tunnel, with pull-based deployments and a runbook for wake, restart, and tunnel recovery.

**Acceptance Scenarios**:

1. **Given** the local tier is running, **When** scanned from the internet, **Then** no inbound port is open; the relay reaches it only via the tunnel.
2. **Given** the tunnel drops, **When** health checks fail, **Then** routing falls back within 5 seconds and the runbook's restart procedure recovers it.

### User Story 5 - The Cloud Safety Net (Priority: P2)

As the operator, I want AWS Budgets and Cost Anomaly Detection on the account routed to the same Telegram and email channels, and the kill-switch state replicated where the relay can read it, so that non-model costs and meter failures are also bounded.

**Acceptance Scenarios**:

1. **Given** AWS billing data updates, **When** it crosses the budget thresholds, **Then** alerts arrive on both channels (lagging safety net, not the control).
2. **Given** the meter in the stack sets `degraded`, **When** the relay reads state, **Then** it sees the same state within 10 seconds; **Given** the state store is unreachable, **Then** the relay treats it as `degraded`.

## Requirements *(mandatory)*

- **FR-001**: All cloud resources MUST be defined in Terraform with remote state and locking in one AWS account, with per-environment roles, tags, and budgets.
- **FR-002**: WHEN a PR changes `infra/`, THE SYSTEM SHALL post the plan and block merge on plan failure; WHEN an infra change merges, THE SYSTEM SHALL require the Author's approval in a protected environment before `apply`.
- **FR-003**: CI MUST obtain cloud access only via OIDC federation; no IAM user access keys MUST exist.
- **FR-004**: The h4reet.ai zone MUST be managed in Terraform with TLS issued automatically; the static site MUST be served from the edge.
- **FR-005**: A cloud VM MUST run `deploy/compose.yaml` unchanged with a cloud environment file, via a pull-based deployer.
- **FR-006**: The local tier MUST expose no inbound ports and MUST be reachable only via an outbound tunnel; deployments to it MUST be pull-based.
- **FR-007**: The relay MUST read kill-switch state from a cloud store replicated from the stack, failing closed.
- **FR-008**: AWS Budgets and Cost Anomaly Detection MUST be enabled and routed to Telegram and email.
- **FR-009**: WHEN the local tier is unreachable, THE SYSTEM SHALL serve a cloud-hosted dashboard snapshot with last-known values and tier status.
- **FR-010**: The edge MUST enforce a request cap within budget (see clarification above).
- **FR-011**: A local-tier runbook MUST cover wake, WSL2 restart, tunnel recovery, deployer, and `make up`.

## Success Criteria *(mandatory)*

- **SC-001**: Zero long-lived credentials for any identity, verified weekly by a committed audit script.
- **SC-002**: Idle cloud cost under the confirmed target and visible on the dashboard. [NEEDS CLARIFICATION: proposed ≤ $10/month — confirm].
- **SC-003**: With the local tier off, h4reet.ai loads and hello answers (fallback or degraded) within 5 seconds.
- **SC-004**: Destroy-and-recreate of the VM yields an identical stack, verified by image digests.
- **SC-005**: Every decision here (one-account separation; Terraform with human apply; pull-based local deploys; edge mechanism) has an ADR.

## Assumptions

- Spec 000 is implemented and its stack passes its success criteria before this spec is planned.
- The heavy tiers stay on the local machine; the cloud VM runs the thin services and can run the full stack for demonstration only within budget.
- Cloud dev/staging VMs, if used, are ephemeral; dev and staging otherwise remain on the local host.
