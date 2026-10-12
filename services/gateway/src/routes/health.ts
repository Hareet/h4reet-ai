// The api listener's health endpoints (contracts/gateway-http.md §4, §5). Neither makes a span: the HTTP
// instrumentation and @fastify/otel both skip them (telemetry.md §3.1).
import type { FastifyInstance } from "fastify";

import type { Gateway } from "../core/gateway.js";

/**
 * GET /health/live: 200 {"status":"live"} while the event loop answers. It reads nothing, neither the store nor an
 * adapter, so neither can trap the gateway in a restart loop: the process is live even while the stack is degraded.
 * The compose health check probes it.
 */
export function registerHealthLive(api: FastifyInstance): void {
  api.get("/health/live", async () => ({ status: "live" }));
}

/**
 * GET /health: 200 with the report, whatever the state; it reports, it doesn't gate. It reads stack_state live, with
 * the store's timeouts, and the adapters' cached health, so it never calls a provider. It shows no meter amounts:
 * the authenticated GET /admin/status adds them (§5).
 */
export function registerHealth(api: FastifyInstance, gateway: Gateway): void {
  api.get("/health", async () => gateway.report());
}
