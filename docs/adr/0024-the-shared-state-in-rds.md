# ADR 0024: The shared state, one meter and one kill switch for both hosts, in RDS for PostgreSQL

Status: proposed, 2026-11-10; decision 1 amended 2026-11-11 · Spec: 001 (FR-017 to FR-020, FR-074; plan §3.3; research.md R-20; data-model.md §1; contracts/shared-state.md) · Changes, for prod, [ADR 0020](0020-gateway-state-store-and-meter.md)'s store, which stays every other stack's · Accepted when the Author merges spec 001's groups 1 to 4 (`feat/001-cloud-elevation-p`), after his approval at T000 · Number: one of 0024 to 0029, allocated to spec 001 since September (the index's row 0033)

## Context

Spec 000 gives each stack its own meter and kill switch (its FR-031; ADR 0020). With EC2 as prod's default host and the laptop serving when the Author runs it, two gateways run prod.

On 2026-11-09 the session put this point to him, in its words ([ADR 0044](0044-ec2-as-prods-default-host.md), decision 7): "The budget needs one counter." Each machine has its own database, so if each counts spend separately, both could spend the $20. The budget and kill-switch state need to live in one place in the cloud that both read. Spec 001's design already plans for that.

His reply to the five points, verbatim: "Okay, all of your feedback is approved. for server size, we will try to use spot instances, or only keep the server online for 8-12 hours a day."

The store's product was the plan's to settle, and the plan settled it as RDS (plan.md, "Settled in this plan"). His approval of the plan, 2026-11-10: "Let's approve the t000 and spec 001 plan." (tasks.md T000).

## Decision

1. **PostgreSQL 17 in a container on the tunnel end,** the compose stack's own image, its data on a volume the spot stop keeps. The Author's answer of 2026-11-11, "Postgres in a container on the tunnel end", after the session priced RDS at about $14 of the $45 server budget (research.md R-20). W1 designs its backups, TLS, and role passwords (Parameter Store, not an RDS-managed secret). It replaces this decision as first proposed: RDS for PostgreSQL 17, the smallest Graviton class, single-AZ, private, TLS only, deletion protection, and 7 days of backups. The file keeps its name, so links still work.
2. **Both prod gateways** connect as `gateway` with `H4_STACK=prod`, so they share one `stack_state` row and one set of meters, spec 000's schema as it is, with migration 0007 adding `host` to ledger and audit rows, `handover_events`, and the relay's roles.
3. **Two writers** are safe on spec 000's advisory locks and `SKIP LOCKED`, proved by a two-gateway test before EC2 serves (plan §10).
4. **Unknown is degraded,** on each host and in the relay: a store that can't be read within 10 s answers degraded (FR-019).
5. **The move** carries the laptop prod's meters into the shared store: nothing that wasn't zero starts at zero (data-model.md §1.5).

## Alternatives considered

- **RDS for PostgreSQL:** the decision as first proposed. It cost about $14 a month of the $45 budget (research.md R-05).
- **Postgres on the tunnel end, as first weighed:** one small spot instance would become the meter's only home (plan Complexity Tracking). Chosen anyway: while the tunnel end is gone the site already rests, so it adds no outage for visitors (R-20).
- **DynamoDB:** a second implementation of the meter, and the fallback if RDS's price is out of proportion to the server budget (research.md R-20).
- **A meter per host:** ruled out by the approved point, "both could spend the $20".

## Consequences

- An always-on database is a server-budget line the Author prices before he sets the figure (research.md R-05).
- Prod on a laptop without a network answers degraded; an offline demo runs `make up ENV=dev` (his answer to the plan's question 4).
- Spec 000's FR-031 is amended by name for prod, in group 6 (plan §13).

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contract: [shared-state.md](../../specs/001-cloud-elevation/contracts/shared-state.md) · Data model: [§1](../../specs/001-cloud-elevation/data-model.md)
- Related: [ADR 0020](0020-gateway-state-store-and-meter.md), [ADR 0044](0044-ec2-as-prods-default-host.md) (accepted)
