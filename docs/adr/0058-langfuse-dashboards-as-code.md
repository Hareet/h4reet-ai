# ADR 0058: Langfuse's dashboards as code, through its unstable dashboard API, checked before every write

Status: proposed, 2026-11-22 · Spec: 034 ([spec.md](../../specs/034-langfuse-dashboards/spec.md) Q1, Q5, FR-001 to FR-016; [research.md](../../specs/034-langfuse-dashboards/research.md) R-1 to R-6; [plan.md](../../specs/034-langfuse-dashboards/plan.md)) · Extends [ADR 0004](0004-langfuse-and-grafana-over-opentelemetry.md) (Langfuse for traces, Grafana for the dashboard) · Accepted when the Author merges `feat/034-langfuse-dashboards`

## Context

The Author's words, 2026-11-22, verbatim:

> "Let's create Langfuse dashboards that we can use"

Every stack runs Langfuse 4.54.0, and every model call reaches it as a trace with its model, tokens, and the gateway's
own cost (contracts/telemetry.md §3). Grafana's `h4-runtime` is the dashboard ADR 0004 chose, from the gateway's metrics,
and the authoritative view of the meter. Langfuse's project had no dashboard of its own. Agents can't reach the Author's
Langfuse, so whatever they design must reach it in one step of his, and a stack whose volumes are removed loses anything
made by hand.

Langfuse added dashboard and widget endpoints to its public API on 2026-07-17, under `/api/public/unstable`, "unstable and
may change while the dashboard and widget contract is being finalized"; 4.54.0 (2026-10-07) carries them. No source the
session could read gave their exact bodies, and no Langfuse was reachable to try them (research R-1, R-2).

## Decision

1. **The dashboards are files**: `deploy/langfuse/dashboards/<key>.json`, the repository's own schema (a dashboard, its
   widgets, each widget's one metric, dimension, filters, chart, and place on the 12-column grid). A change is a commit.
2. **Aggregates only, enforced**: the files may name only the observations view, the cost, latency, and token measures,
   and dimensions and filters that carry no payload and no user or session identifier; the command refuses anything
   else before any call.
3. **One command, the Author's**: `make langfuse-dashboards ENV=<stack> [APPLY=1]` calls the stack's Langfuse on
   `127.0.0.1` with the project's keys from the env file. Read-only by default.
4. **Checked before every write**: it reads the instance's own API description and stops if any operation or field name
   it uses is missing; it runs each widget's query through the read-only Metrics API v2 and stops if any is refused.
   Only then, with `APPLY=1`, does it write.
5. **It manages what it marks, and the files win**: a mark at the end of each description (`[h4 <dashboard>/<widget>]`),
   idempotent updates, managed objects no file names deleted, unmarked objects never touched (as Grafana's
   `allowUiUpdates: false` makes its files win).
6. **A recipe as the fallback**: the same command prints each dashboard as steps for Langfuse's UI, from the same files.
7. **Grafana stays authoritative** for spend, the ceilings, the kill switch, and the degraded causes; Langfuse's
   dashboards add the per-model and per-trace views and say where Grafana's counterpart is.

## Alternatives considered

| Option | What it costs | Why not |
|---|---|---|
| Grafana panels over Langfuse's ClickHouse | a ClickHouse plugin in Grafana (none is preinstalled, and preinstalls are off), a ClickHouse login for Grafana (a new secret and a new data path), and queries on Langfuse's internal tables, which v4 changed and may change again | More moving parts and a private schema, to repeat what Langfuse's own widgets do over its own API |
| A written UI recipe only | nothing to build | Not reproducible: lost with a stack's volumes, drifts from the repository, and every stack is hand work |
| Langfuse's portable JSON, imported in the UI | the envelope's fields, which no source gave whole | A hand step per stack and per change; kept as the recipe instead, which the command can print from what it knows |
| Only create, never update or delete | simpler | UI edits and removed widgets would drift and pile up; the mark makes updates safe |

## Consequences

- **The risk is the unstable API.** A Langfuse upgrade that changes it shows as the command's `FAIL` lines with nothing
  written; the fix is in the command's constants, and the recipe works meanwhile. The Author's first run against 4.54.0 is
  the proof the tests can't give (spec 034 SC-004).
- **Cost**: $0; the dashboards' queries run on the stack's ClickHouse when opened.
- **Data flow**: none new; the command and the browser use x001 on the host (disclosure rows S9, B1).
- **Not covered**: EC2's Langfuse (a follow-up once a cloud session forwards its x001); eval and red-team scores, which
  nothing writes to Langfuse; a visit or conversation view, since no trace carries such an identifier.

## Links

- Spec: [034](../../specs/034-langfuse-dashboards/spec.md) · Runbook: [langfuse-dashboards.md](../runbooks/langfuse-dashboards.md)
- Merge request, in place of a PR until publication: [2026-11-22 note](../merge-requests/2026-11-22-feat-034-langfuse-dashboards.md)
