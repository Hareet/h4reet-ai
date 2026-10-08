# ADR 0020: The gateway's state store is its own Postgres, and the meter counts integer micro-USD

Status: proposed, 2026-10-08 · Spec: 000 (FR-022, FR-023, FR-030, FR-031, FR-033, FR-034, FR-035; SC-002; User Story 2 scenarios 3, 4, and 7; User Story 5 scenarios 6 and 7)

## Context

FR-031 says the meters, today's fallback spend, the crossed ceilings, the renewal flag, and the kill-switch state survive a restart and `make down`. An unreachable store counts as unknown, which means degraded. An empty store keeps the runtime degraded until the operator initializes it. Nothing sets the meters to zero silently.

The Author's answer on per-stack meters (2026-10-07): "Yes each stack will have its own meter as we are only concerned for production environment, the dev environment won't use spend and will use a Claude Team plan."

A meter that shares a database with Langfuse would share its migrations and load. A Langfuse fault could then trip the kill switch or blind it. So the meter gets its own database.

## Decision

- A dedicated Postgres 17 container, `gateway-state`, on `internal`, with schema `gateway`. One volume per stack. Its image is pinned by digest.
- Tables:
  - `stack_state`: state, cause, since, the renewal flag, and the crossed ceilings.
  - `meters`: one row per UTC day and month. One `fallback_day` row per day holds `spent_micro`, `reserved_micro`, and `allowance_micro` (ADR 0001).
  - `reservations`, `ledger` (one row per call: provider, model, tokens, latency, route, cost, price version, outcome; FR-023), `audit_log`, `alert_outbox`, and `incidents`.
- Money is an integer count of micro-USD (`bigint`). $1 is 1,000,000. Nothing is a float.
- Admission reserves each paid call's maximum cost in one transaction. It locks the state row, deletes expired reservations, and refuses unless the state is normal, every ceiling has room, and (for fallback) spend plus reservations is below the day's allowance with no renewal pending. Then it inserts the reservation. Overshoot is at most 4 calls in flight times the maximum cost per call (plan.md).
- The state is read on every request. Nothing caches it.
- The journal is an fsync'd JSONL file per stack, on a host bind mount (`GATEWAY_STATE_DIR`), outside Docker volumes, so `docker compose down -v` leaves it intact. Each reservation and each completion is journaled.
- A renewal writes an audit row and a journal record. Both carry the allowance the renewal set (ADR 0001).
- Rollover is lazy. A new UTC day starts its rows and never touches the state or the renewal flag (FR-033).
- Initialization is an operator action under FR-034. It rebuilds each meter from the ledger and the journal, with pending reservations at their maximum. It keeps the larger of the rebuilt spend and any spend the operator states, and never lowers a spend meter. The allowance is not summed or maxed. It is the value the day's last renewal set, or $2 if the day had no renewal, because only a renewal changes it. Zero needs `--confirm-zero`, which goes in the audit row. Init leaves the renewal flag set unless `--renew` is part of the same action.
- Grafana's audit panel reads `audit_log` through the read-only role `grafana_ro`, which can select from `audit_log` and a state view only. Spend, state, and request panels read Prometheus.

## Alternatives considered

- Valkey with AOF. Rejected: durable writes need `appendfsync always`, and the multi-key invariants need Lua scripts. That is a second consistency model to maintain.
- SQLite. Rejected: one writer, a file that several containers must share, and Grafana cannot read it directly.
- Sharing Langfuse's Postgres. Rejected: the coupling described in Context.
- Rebuilding from Langfuse or Prometheus. Rejected: both are asynchronous and can lose records. A rebuild must not lose a charge.

## Consequences

- Cost: one more Postgres container, about 100 MB of RAM. No cloud spend.
- Degraded mode: store unreachable gives 503 `store_unreachable` for every request (fail closed), with one deduplicated alert after 60 seconds. Store empty gives `store_uninitialized` until `init` runs. A journal that cannot be written refuses metered calls (`journal_unwritable`), and local answers continue (FR-022).
- Timeouts are short (250 ms per statement, 500 ms to connect, plan.md), so a sick store answers fast instead of hanging.
- On the agents' engine, the admission plugin allows one read-write bind root besides the read-only tree and models: `/var/lib/h4agents/state`, owned by `h4agents` and wiped by `engine-reset` (ADR 0016). dev-cpu's `H4_STATE_DIR` points there, so the journal's bind is the same compose line on every engine (FR-017). Prod and dev bind `~/.local/state/h4reet/<stack>`.

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), [ADR 0016](0016-agents-engine-rootless-docker.md), [ADR 0021](0021-internal-network-prometheus-loki-edge.md)
