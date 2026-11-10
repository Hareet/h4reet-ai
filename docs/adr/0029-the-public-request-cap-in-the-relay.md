# ADR 0029: The public request cap, in the relay, in figures the Author sets

Status: proposed, 2026-11-10 · Spec: 001 (FR-032, FR-033, FR-042; plan §4, §14 P-6; research.md R-18; contracts/relay-http.md) · Accepted when the Author merges spec 001's group 1, after his approval at T000; its figures are his, in P-6 and in this record, in group 8 (tasks.md T114) · Number: one of 0024 to 0029, allocated to spec 001 since September

## Context

The Author's answers, verbatim (spec.md, Clarifications, Session 2026-10-12, from the recommended options he accepted together: "I've read through the clarify questions in teh spec and the rest of them you can go with the recommendeded ones. I agree with the recommendations"):

> Q: Where is the public request cap enforced within budget? (FR-033) → A: "A (recommended)", which read: "in the relay, from the address the edge supplies."

> Q: Is hello public in spec 001? (FR-030 to FR-039) → A: "A (recommended)", which read: "yes, through the relay, capped, as a test endpoint with spec 000's fixed prompt."

With the relay on the tunnel end (ADR 0025), every dynamic request passes through it, so one cap holds whichever host serves.

## Decision

1. **The cap lives in the relay,** keyed on the address CloudFront supplies (`CloudFront-Viewer-Address`), held in memory only and never logged or stored (FR-042): a per-address limit of requests a minute, a burst, and requests a day, and a global in-flight limit.
2. **Its figures are the Author's,** in `config/budgets.yaml`'s new `public` section, by his patch P-6 (human-only, ADR 0017's file). The agent drafts the keys with each figure blank (tasks.md T105); the relay refuses to start while the section is missing or a figure is blank, naming each key.
3. **A refusal** answers spec 000's degraded body with the cause `public_cap`, which the room shows as `turn_refused.slow_down` (FR-066).
4. **The figures recorded here** when he sets them, with the date: none yet.

## Alternatives considered

- **AWS WAF's rate-based rules at the edge:** rejected for now, as September (research.md R-06, "Rejected for now").
- **The cap in each host's gateway:** the two hosts would each hold half a view, and a request in a start-up gap would be uncounted.

## Consequences

- An interruption of the tunnel end empties the caps; acceptable for a per-address cap of at most a day (FR-042).
- Hello is public only through the cap, as a test endpoint, never the twin.

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contract: [relay-http.md](../../specs/001-cloud-elevation/contracts/relay-http.md)
- Related: [ADR 0025](0025-the-relay-on-the-tunnel-end-on-spot.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md)
