# ADR 0001: Local-first routing with Bedrock as capped fallback

Status: proposed, 2026-10-08 · Spec: 000 (FR-021, FR-022, FR-023, FR-024, FR-030, FR-031, FR-033, FR-034, FR-036; SC-005, SC-006; User Stories 2 and 5)

## Context

Hello answers from a local model on the Author's RTX 5090. When that model is down, production may fall back to Bedrock, but only inside a cap. The constitution's initial policy is "local-first with Bedrock as fallback inside a capped sub-budget" (Technology Standards, Model access). Every capability also needs a degraded mode before its happy path (Principle I).

The cap: on 2026-10-07 the Author chose "$2/day (Recommended)", which read: "The proposal. Leaves $3/day for other metered spend; a long local outage reaches the $20 month in 10 days. Adds a 70% warning at $1.40, like the other ceilings." (spec.md's Clarifications). Renewal is a human act, in the Author's own words: "it does not renew on its own, a human approves renewal."

On 2026-10-08, asked whether a renewal on the day the sub-budget ran out brings fallback back that day, the Author chose "Fresh $2 immediately" (recorded in spec.md's Clarifications). That option read: "Renewal grants another $2 today, still inside the $5 daily ceiling." FR-030 now reads: "from that moment, up to $2 more can go to fallback that day, whatever was spent before it." Our reading: a renewal measures $2 from what is already spent or reserved. It does not add $2 to a fixed daily count. The difference shows after an overshoot. It also means a renewal on a later day gives $2, not $4.

## Decision

Routing order (FR-022), decided at request start from the stored state:

1. Degraded, if the kill switch is `degraded` or its state is unknown. An unreachable or empty store counts as unknown (FR-031).
2. Local, if the local adapter is healthy. Its check runs every second with an 800 ms timeout. One miss marks it unhealthy. Three passes in a row mark it healthy again.
3. Bedrock, if local is unhealthy, the stack has a paid route (prod only, `H4_ENV=prod`), no meter is at its ceiling, today's fallback is below its allowance, and no renewal is pending.
4. Otherwise, the degraded response, with the condition that applied as its cause.

The fallback sub-budget, per UTC day, on the `fallback_day` meter row:

- The row holds `allowance_micro`. It starts at 2,000,000 micro-USD ($2).
- A fallback call is admitted only while spend plus reservations is below the allowance. Admission reserves the call's maximum cost first (ADR 0020).
- When committed fallback spend reaches the allowance, the runtime sets `fallback_awaiting_renewal`, refuses fallback, and alerts. The flag survives rollovers and restarts. While reservations alone fill the allowance, fallback is refused with `fallback_spent_today` until they commit or expire.
- A renewal is an operator action: `POST /admin/renew`, with the operator credential (a per-stack token; the gateway keeps only its SHA-256), a reason, and an audit row (FR-034). It clears the flag and sets the allowance to spend plus reservations plus $2. From that moment exactly $2 more is available, whatever was spent earlier that day.
- A day that ends without running out starts the next with $2 and no pending renewal.
- Warnings fire at 70% of each $2 granted: $1.40 for the first grant, and allowance minus $0.60 after a renewal. Each grant warns once.

Worked cases:

- The day starts at $2, and $2 is spent. Fallback stops. A same-day renewal sets the allowance to $4, so fallback passes again at once. This is the same-day case of breach-test step 6.
- A renewal on a later day, with nothing spent yet that day, leaves $2 available.
- If $4 of fallback has been spent after one renewal, a second same-day renewal raises the allowance to $6. The $5 daily ceiling trips first, so at most $1 more can be spent that day.

Other rules:

- Budget days and months are UTC. The Author chose "UTC (Recommended)" (spec.md's Clarifications, 2026-10-08).
- Every metered call counts toward the $5 daily and $20 monthly ceilings, fallback included (FR-030).
- Bedrock model: Claude Haiku 5.5 through Converse in us-east-1 if Bedrock offers it there, otherwise Claude Haiku 4.5's `us.` inference profile. The Author confirms the ID and copies the prices into `config/prices.yaml`, which is human-only.
- `config/routing.yaml` is agent-editable. Its schema keeps every stack's primary local and allows a paid route only in prod.
- Dev has no paid adapter. Its breach test uses synthetic metered calls (FR-036). The Author's words: "the dev environment won't use spend and will use a Claude Team plan."

## Alternatives considered

- Bedrock first, local second. Rejected: every request would spend money.
- Local only, with no fallback. Rejected by the cap the Author set on 2026-10-07.
- Automatic daily renewal. Rejected: "it does not renew on its own, a human approves renewal."
- Renewal that re-arms fallback for the next day only (an early default). Rejected by the same-day answer of 2026-10-08.
- A cumulative allowance, $2 × (1 + renewals that day). Rejected: it adds $2 to a count the operator did not see, and a later-day renewal would show $4 with nothing spent.
- A sub-budget outside the daily ceiling. Rejected: FR-030 counts it inside the ceiling.

## Consequences

- Cost: fallback is capped at $2 per grant, and each grant needs a human. Metered spend cannot pass $5 a day or $20 a month, however many renewals there are (FR-030, FR-033). The live Bedrock contract test is about 10 calls, charged to the same meters with attribution `test` (FR-024, FR-031, FR-037).
- Overshoot is at most 4 calls in flight times the maximum cost per call (plan.md). A renewal measures from actual spend and reservations, so an overshoot does not reduce the next $2.
- Degraded mode: local down with fallback refused gives the degraded response, with cause `fallback_awaiting_renewal`, `meter_at_ceiling`, or `kill_switch_tripped`, as applies. A tripped ceiling sets `degraded` (FR-033). Only an operator reset restores `normal`. The Author chose "Your reset only (Recommended)", which read in part: "The reset brings local answers back at once; paid fallback calls stay refused until the tripped meter rolls over." A rollover alone never restores service: that is the spec's reading (FR-033). A reset does not renew fallback; renewal is a separate action.
- Failover in SC-005 (within 5 seconds) rests on a fast connect failure and a 4-second Bedrock request timeout (plan.md).
- Decided in the plan:
  - Renewal when the flag is not set is refused (409 `not_awaiting_renewal`), so each renewal answers an exhaustion. Initialization's `--renew` is the only other way to clear the flag.
  - The cause `fallback_spent_today` stays beside `fallback_awaiting_renewal`. Committing spend that reaches the allowance sets the flag, but calls already in flight can fill the allowance with reservations before any commit does. Those refusals report `fallback_spent_today`.
  - The alert dedupe key. Warnings are per grant, so the fallback meter's key includes the grant (ADR 0005).

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0005](0005-telegram-and-smtp-alerting.md), [ADR 0013](0013-local-until-publication.md), [ADR 0020](0020-gateway-state-store-and-meter.md)
