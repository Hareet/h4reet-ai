# ADR 0003: Local-compose-first delivery, then Terraform elevation to AWS

Status: proposed, 2026-10-08 · Spec: 000 and 001 (FR-013, FR-018, FR-037; SC-001; User Story 1; Assumptions, "No cloud resources are created in this spec")

## Context

The intent asks that "the entire production stack runs on my local machine calling local models. First phase is the compose stack; Terraform in AWS elevates it afterward." Principle I says the local tier "is a production tier, not a demo".

Spec 001 "lifts this same stack to AWS with Terraform" (spec.md, Input). Until then, the only cloud contact in spec 000 is the Bedrock adapter in prod.

## Decision

- Spec 000 creates no cloud resources. Bedrock is reached only from prod, through a dedicated, narrow identity: an IAM Identity Center user that can call `bedrock:InvokeModel` on one inference profile and the models behind it (FR-013). Its config directory is mounted read-only into prod's gateway only. The Author's own AWS identity never reaches a container. The plan records the set-up.
- Until spec 001, `infra/` holds Terraform boilerplate only: no resources, no state.
- Spec 001 lifts the same compose stack to AWS. Its own ADRs decide the account layout (0007), plan-on-change with human apply (0008), and pull-based deployment to the local tier (0009). Those rows are in the index; their files do not exist yet.
- Apply is a human action. The constitution asks for apply "from a protected environment requiring human approval" (Technology Standards, Cloud). That environment belongs to the publication spec (ADR 0014). Until publication, apply is the Author's terminal action, and spec 001 must say how it is recorded.

## Alternatives considered

- Cloud first. Rejected: money is spent before the controls exist, and the local tier becomes a demo. The constitution says "Budgets, alerts, and the automated kill switch ship before the first feature".
- A different managed service per environment. Rejected: the environments would differ in code, not configuration (FR-017).
- Terraform in spec 000. Rejected: resources would exist before the meter and the kill switch, which must come first.

## Consequences

- Cost: $0 cloud in spec 000. Bedrock spend happens only in prod, and only inside the fallback sub-budget and the ceilings (ADR 0001). Spec 001 states its own cost.
- Degraded mode: the stack needs no cloud to run. With the Bedrock identity expired or revoked, prod answers locally, or degrades with cause `fallback_unavailable` when local is also down. The constitution's rule, under Local tier, is "Production MUST function when it is off, via the cloud fallback within its sub-budget or via degraded mode."
- Limit: the 5090 host has to be awake and online. Spec.md's edge cases leave wake, restart, and tunnel to the spec 001 runbook.

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), [ADR 0014](0014-github-side-requirements-to-a-publication-spec.md)
