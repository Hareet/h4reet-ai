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

/**
 * GET /health/serving: the hosts' blocks' status (spec 001 contracts/tunnel.md §4; FR-054). 200 while the store reads,
 * 503 while it doesn't, each with an empty body and no-store, so edge's relay block (8085) and health block (8088) pass
 * the status on as it is: the relay's check of this host, every second, and Route 53's. It reads stack_state live, with
 * the store's timeouts, and nothing else, and says nothing of why. Like /health, it makes no span.
 */
export function registerHealthServing(api: FastifyInstance, gateway: Pick<Gateway, "storeReadable">): void {
  api.get("/health/serving", async (_request, reply) => {
    const readable = await gateway.storeReadable().catch(() => false);
    return reply
      .code(readable ? 200 : 503)
      .header("cache-control", "no-store")
      .send();
  });
}
