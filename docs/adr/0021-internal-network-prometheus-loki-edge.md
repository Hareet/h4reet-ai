# ADR 0021: Prometheus and Loki on an internal-only network, with edge as the only publisher

Status: proposed, 2026-10-08 · Spec: 000 (FR-020, FR-026, FR-028, FR-040; User Story 1 scenarios 3 and 4)

## Context

FR-020 requires environments to be isolated by network, volume, and port. User Story 1 scenario 3 requires that, seen from another machine, only the intended ports are open, and none is reachable from the internet. FR-040 requires every outbound flow to be listed, and third-party services phone home by default unless they are switched off.

Principle IV says the local tier "accepts no inbound connections". In spec 000 every listener is bound to 127.0.0.1, so nothing from the network reaches one. This ADR reads the principle as "no inbound from outside the host". Spec 001's tunnel decides what crosses the host boundary.

## Decision

- Every service joins `internal`, a network with `internal: true` and no route out.
- `edge`, nginx-unprivileged on its stable line, is the only publisher. It binds 127.0.0.1 only and publishes x000 (the api: `/hello`, `/health`), x001 (Langfuse), x002 (Grafana), x003 (the admin listener), and x004 (OTLP/HTTP for Claude Code's metrics, prod only). When the api is down, edge serves the degraded JSON with cause `api_unavailable`.
- `egress` belongs to the gateway alone. The gateway reaches Bedrock (prod), Telegram, and SMTP. Its alert dispatcher runs in-process, so no second service needs egress.
- Metrics: the collector sends OTLP metrics to Prometheus 3, with its OTLP receiver enabled. Prometheus also scrapes the model server and the collector.
- Logs: the collector sends OTLP logs to Loki 3. Third-party container logs stay in Docker's rotated local driver.
- Traces stay in Langfuse. There is no Tempo (ADR 0004).
- Grafana reads Prometheus for spend, state, requests, latency, and model-server health; Loki for logs; and the read-only Postgres role for the audit panel (ADR 0020).

## Alternatives considered

- Publishing each service's port directly. Rejected: every service becomes a place to audit and firewall, and the stack loses its one list of published ports (User Story 1 scenario 3).
- Mimir or VictoriaMetrics for metrics. Rejected: not needed at this scale, and each is one more service to run.
- Grafana Alloy as the collector. Rejected: the collector-contrib image already has the redaction, transform, and basic-auth processors.
- Tempo beside Langfuse. Rejected (ADR 0004).
- Shipping third-party container logs into Loki. Rejected: it would mount the host's container log directory into the collector, which crosses stack boundaries (FR-020).

## Consequences

- Cost: $0 cloud. Memory limits on the host are about 1 GiB for Prometheus, 512 MiB each for Loki and Grafana, 256 MiB for the collector, and 64 MiB for edge (plan.md).
- Degraded mode: Prometheus or Loki down gives empty panels. Enforcement is unaffected, because the meter and the audit log live in Postgres (ADR 0020). Edge down means nothing is reachable from the host, but the stack keeps running and hello fails fast. The api down means edge answers with the degraded JSON.
- Checks: the compose policy refuses any published port that is not on 127.0.0.1 and edge (ADR 0017). Matrix stage S proves from inside the sandbox that stack ports are refused.

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0004](0004-langfuse-and-grafana-over-opentelemetry.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md), [ADR 0020](0020-gateway-state-store-and-meter.md)
