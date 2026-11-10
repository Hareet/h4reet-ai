# ADR 0007: One AWS account; environments separated by VM, IAM role, tag, and budget

Status: proposed, 2026-11-10 · Spec: 001 (FR-001, FR-002, FR-021, FR-022; plan §1, §3.1; research.md R-01, R-02) · Accepted when the Author merges spec 001's groups 1 to 4 (`feat/001-cloud-elevation`), after his approval at T000 (plan §14) · Number: reserved for spec 001 since 2026-09-07

## Context

The intent's constraints, in the Author's words (`specs/001-cloud-elevation/intent.md`): "One account; environments by VM, IAM role, tag, budget. Plan in PR, human apply. Idle cloud cost must leave headroom for the Bedrock fallback. No inbound ports on the local tier; no self-hosted runners."

The constitution's Cloud standard: "one AWS account. Environments are separated by VM, IAM role, cost-allocation tag, and budget, not by account."

The idle-cost sentence is superseded by his words of 2026-11-09: "The server size and budget is outside the $20 model spend cost." (spec.md, Clarifications). His approval of the plan on 2026-11-10: "Let's approve the t000 and spec 001 plan." (tasks.md T000).

## Decision

1. **One account, in us-east-1,** for everything that has a region: the edge's certificate must be there, Bedrock's inference profile is called from there, and the spec rules out "more than one AWS region for the stack" (research.md R-01).
2. **Environments by root, never by workspace:** `infra/bootstrap` (the state bucket, the budgets, the anomaly monitor, the alert topic), `infra/account` (the budget actions, the AWS-side functions, the handover's functions, the registry), and `infra/prod` (the network, the tunnel end, RDS, EC2, the edge). Each root has its own state key (research.md R-02).
3. **Tags on every resource:** `project` and `environment` through each provider's `default_tags`, and `component` on each taggable resource (FR-002). The policy's rules T1 and T2 enforce both.
4. **Budgets by scope, not by account:** the model ceilings on Bedrock's cost, and the server budget on every other cost (FR-021, FR-022; research.md R-22).

## Alternatives considered

- **An account per environment** (AWS Organizations). Not chosen: the constitution and the intent both name one account, and the project has one production environment; dev and staging stay on the laptop (spec.md Assumptions).

## Consequences

- Least privilege rests on roles, tags, and conditions inside one account, not on account boundaries; research.md R-15 lists each identity and what it may touch, and the credential audit checks them weekly (FR-008).
- A mistake in one root can reach another's resources by name; the roots read each other only through data sources by name, and the protected files hold every identity and budget (FR-012).

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Plan: [§1](../../specs/001-cloud-elevation/plan.md#1-infrastructure-the-roots-the-state-and-the-records) · Research: [R-01, R-02](../../specs/001-cloud-elevation/research.md#account-terraform-and-the-records)
- Related: [ADR 0044](0044-ec2-as-prods-default-host.md) (accepted): EC2 as prod's default host. [ADR 0008](0008-terraform-reviewed-plans-recorded-apply.md).
