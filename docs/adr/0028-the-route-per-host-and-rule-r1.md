# ADR 0028: The route per host, and rule R1 amended

Status: proposed, 2026-11-10 · Spec: 001 (FR-035, FR-067, FR-068; plan §6; research.md R-27, R-28; contracts/env-cloud.md §2, §4; data-model.md §2) · Extends [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), whose order holds on the laptop, and sits beside [ADR 0041](0041-the-anthropic-api-as-a-second-paid-adapter.md), which makes prod's route change the Author's · Accepted when the Author merges spec 001's groups 1 to 4 (`feat/001-cloud-elevation-p`), after his approval at T000 · Number: one of 0024 to 0029, allocated to spec 001 since September

## Context

Spec 000's routing selects a route by `H4_ENV`, and its rule R1 says every `primary` must be local. With both hosts running prod, the route has to follow the host. The Author's words of 2026-11-09, verbatim (spec.md, Clarifications):

> "On the ec2 server, anthropic api will answer first. That ec2 server will end up being the main server running, I will rarely be running the stack from my laptop other than a demo to showcase or talk about, but it should be the local-first primary scenario we built for."

> "The server size and budget is outside the $20 model spend cost. Yes, bedrock stays as the ec2 second paid route."

> Q: "What should limit paid spend on EC2?" → A: "The $5 and $20 ceilings (Recommended)", which read: "On EC2, the daily $5 and monthly $20 ceilings and the adapter caps limit the Anthropic API and Bedrock. When a ceiling trips, the twin rests until you reset it, as today. The $2-a-day sub-budget stays the laptop's fallback rule."

The session reads "it should be the local-first primary scenario we built for" as the laptop's stack (plan question 6, provisional, which his approval at T000 leaves standing).

## Decision

1. **`H4_HOST`** (`laptop`, `ec2`, or `tunnel-end`) selects `envs.prod.hosts.<host>` in `config/routing.yaml`'s schema 2; the gateway exits 78 on a host without its route (`route_missing`), on `ec2` with a `primary`, and on `laptop` with a `first` (contracts/env-cloud.md §4).
2. **The laptop:** ADR 0001's order. The kill switch first; the local model while healthy; then the one paid fallback its route names, attributed `fallback`, inside the $2-a-day sub-budget, the ceilings, and the adapter caps; otherwise degraded.
3. **EC2:** the kill switch first; the Anthropic API while healthy and admitted; then Bedrock under the same admission; otherwise degraded. Its calls are attributed `metered`, so the sub-budget never sees them.
4. **Rule R1, amended:** every `primary` is local; a route with `first` names only paid adapters and appears only as `envs.prod.hosts.ec2`. Spec 000's config-files contract and spec 010's FR-001 change with it, by name, in group 6.
5. **EC2's route line is the Author's,** `ec2: { first: anthropic, second: bedrock }`, in his own commit in group 7 (ADR 0041); agents write schema 2 with the laptop's line only.

## Alternatives considered

- **Bedrock first on EC2:** ruled out by "anthropic api will answer first".
- **A model server on EC2:** ruled out by his recorded reason under Principle I (spec.md, Clarifications: "within the server budget EC2 has no GPU, and a model run on its CPU wouldn't meet the twin's quality bar").

## Consequences

- The placeholder gate reads every host route's `first`, `second`, and `fallback`, before schema 2 lands (FR-068).
- Readiness evidence covers four adapters: the laptop's local model and fallback, and EC2's Anthropic API and Bedrock.

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contract: [env-cloud.md](../../specs/001-cloud-elevation/contracts/env-cloud.md)
- Extends: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md) · Related: [ADR 0041](0041-the-anthropic-api-as-a-second-paid-adapter.md), [ADR 0044](0044-ec2-as-prods-default-host.md) (accepted), which amends ADR 0001
