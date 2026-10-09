// The api listener's health endpoints (contracts/gateway-http.md §4, §5). GET /health, the report, arrives with
// tasks.md T054.
import type { FastifyInstance } from "fastify";

/**
 * GET /health/live: 200 {"status":"live"} while the event loop answers. It reads nothing, neither the store nor an
 * adapter, so neither can trap the gateway in a restart loop: the process is live even while the stack is degraded.
 * The compose health check probes it, and it makes no span (telemetry.md §3.1).
 */
export function registerHealthLive(api: FastifyInstance): void {
  api.get("/health/live", async () => ({ status: "live" }));
}
