# ADR 0004: Langfuse (self-hosted, in the stack) + Grafana dashboards

Status: proposed, 2026-10-08 · Spec: 000 (FR-023, FR-026, FR-027, FR-028, FR-029, FR-031, FR-037, FR-040; SC-005; User Story 2 scenario 1)

## Context

FR-026 asks for OpenTelemetry traces, metrics, and logs, with model spans on the GenAI semantic conventions. FR-027 names Langfuse as the LLM tracing backend. FR-028 names the Grafana panels: request count, latency p50 and p95, error rate, spend today and month to date, fallback remaining, kill-switch state, model-server health, and why responses are degraded. Spend must reach the dashboard within 60 seconds (User Story 2 scenario 1, SC-005).

The constitution names Langfuse "for LLM traces and evaluation records" and Grafana for dashboards (Observability).

## Decision

- Every service emits OpenTelemetry to a collector on `internal`. The collector fans out: traces to Langfuse, metrics to Prometheus, logs to Loki (ADR 0021).
- Spans: `POST /hello` (server), `gateway.route` (internal), and one client span per provider attempt named `chat {gen_ai.request.model}`. Each carries the `gen_ai.*` attributes: provider, model, tokens, finish reason, plus the gateway's own cost, route decision, and degraded cause.
- Langfuse v4 (web and worker), self-hosted. Its stores are Postgres 17, ClickHouse (at least 25.12, the version Langfuse's own compose file pins for v4), Valkey 8.1, and SeaweedFS for objects (ADR 0022). The plan's registry check found v4 generally available and v3 limited to security fixes until January 2027 (research.md).
- The gateway emits the `h4.*` instruments. OTLP turns them into Prometheus names: dots become underscores, units are added, counters gain `_total`. Examples: `h4.gateway.requests` becomes `h4_gateway_requests_total`, and `h4.cost.usd` becomes `h4_cost_usd_total`. The fallback gauges are `h4_fallback_allowance_usd` (today's allowance, ADR 0001) and `h4_fallback_awaiting_renewal` (0 or 1). The full list is in contracts/telemetry.md §4.
- The cost on each span is the gateway's own number, from `config/prices.yaml`. It is zero for local calls. Langfuse does not price calls itself. Research.md records which attribute Langfuse reads for cost.
- Payloads leave the spans only when `TELEMETRY_PAYLOAD_SAMPLING` is on and the span carries `h4.payload.sampled=true`. Sampling is dev only. Prod refuses it at preflight and at gateway startup (exit 78). Logs and metrics never carry payloads. Secret patterns are masked in attributes and in log bodies (FR-029).
- Grafana: dashboard `h4-runtime`, provisioned from files, in UTC. Every FR-028 panel is included, plus dev-time usage (FR-037). Grafana's own alerting is off. Alerts come from the gateway (ADR 0005).
- Dev-time usage (FR-037): Claude Code's OpenTelemetry metrics go to prod's collector through edge port x004, bound to 127.0.0.1, prod only. Metrics only; no prompts. The eval history is the second source.
- Third-party telemetry is off: Langfuse `TELEMETRY_ENABLED=false`; Grafana's analytics, update, and news settings; Loki's usage reporting; ClickHouse crash reports; and any SeaweedFS usage reporting. The internal network is the second layer. The data-flow disclosure, which spec 000's implementation writes (FR-040), lists each one.

## Alternatives considered

- SaaS tracing. Rejected: prompts and completions leave the local tier by default (FR-029, FR-040).
- Phoenix. Rejected: the constitution names Langfuse for this role.
- Jaeger with Prometheus only. Rejected: no LLM trace or evaluation records.
- Tempo beside Langfuse. Rejected: Langfuse already stores every trace (FR-027). A second trace store doubles disk for no requirement.
- Grafana Cloud. Rejected: a cloud data flow and a bill. The constitution keeps the cloud to what must be always on.

## Consequences

- Cost: $0 cloud. The resource cost sits on the 5090 host: Langfuse's services, Prometheus, Loki, Grafana, and the collector. ClickHouse is capped at 4 GiB, and the Langfuse web and worker have heap caps (plan.md).
- Degraded mode: a failed collector, Langfuse, Loki, Prometheus, or Grafana costs telemetry or a panel, and nothing else. Enforcement never reads telemetry (FR-031, FR-033). The dashboard shows the age of the last spend sample, so a stale panel is visible as stale.
- The audit panel reads Postgres through a read-only role (ADR 0020), not Loki. Spend, state, and request panels read Prometheus.
- Trade-off: Langfuse v4 has more moving parts (ClickHouse, Valkey, S3-compatible storage) than a single-store setup. Those parts are the price of a supported major version.

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0021](0021-internal-network-prometheus-loki-edge.md), [ADR 0022](0022-seaweedfs-for-langfuse.md), [ADR 0005](0005-telegram-and-smtp-alerting.md)
