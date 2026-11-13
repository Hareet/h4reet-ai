// The api's health answers (contracts/gateway-http.md §4, §5; spec 001 tasks.md T043; FR-054; contracts/tunnel.md §4).
// GET /health reports the store's readability among its fields, and reads degraded while the store can't be read; it
// reports and never gates, so it answers 200 either way. GET /health/serving is the hosts' blocks' status: edge's
// relay block (8085) and health block (8088) pass its status and its empty body on, so the relay and Route 53's
// checks see 200 only while the gateway answers and the store can be read.
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { Gateway, HealthReport } from "../../src/core/gateway.js";
import { registerHealth, registerHealthServing } from "../../src/routes/health.js";

function report(store: HealthReport["store"]): HealthReport {
  return {
    status: store === "ok" ? "ok" : "degraded",
    stack: "dev",
    env: "dev",
    version: "test",
    time: "2026-11-12T00:00:00.000Z",
    real_time: "2026-11-12T00:00:00.000Z",
    store,
    state: store === "ok" ? "normal" : null,
    since: null,
    crossed: null,
    degraded_cause: store === "ok" ? null : store === "unreachable" ? "store_unreachable" : "store_uninitialized",
    fallback: { adapter: null, awaiting_renewal: null, awaiting_since: null },
    adapters: [],
    journal: "ok",
    config: { routing_sha: "0".repeat(64), price_version: null },
    test_machinery: { clock: false, synthetic: false, clock_offset_ms: null },
  } as HealthReport;
}

function stub(readable: boolean | Error, store: HealthReport["store"] = "ok"): Gateway {
  return {
    report: async () => report(store),
    storeReadable: async () => {
      if (readable instanceof Error) throw readable;
      return readable;
    },
  } as unknown as Gateway;
}

async function app(gateway: Gateway) {
  const api = Fastify({ logger: false });
  registerHealth(api, gateway);
  registerHealthServing(api, gateway);
  await api.ready();
  return api;
}

describe("GET /health carries the store's readability", () => {
  it("reports the store as ok while it reads", async () => {
    const res = await (await app(stub(true, "ok"))).inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", store: "ok" });
  });

  it("reads degraded, with the store unreachable, and still answers 200", async () => {
    const res = await (await app(stub(false, "unreachable"))).inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "degraded", store: "unreachable", degraded_cause: "store_unreachable" });
  });
});

describe("GET /health/serving: the hosts' blocks' status (spec 001, FR-054)", () => {
  it("answers 200 with an empty body while the store reads", async () => {
    const res = await (await app(stub(true))).inject({ method: "GET", url: "/health/serving" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers 503 with an empty body while the store can't be read", async () => {
    const res = await (await app(stub(false))).inject({ method: "GET", url: "/health/serving" });
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers 503 when the read itself throws, and says nothing of why", async () => {
    const res = await (
      await app(stub(new Error("connect ECONNREFUSED 10.0.0.1:5432")))
    ).inject({
      method: "GET",
      url: "/health/serving",
    });
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("");
  });

  it("takes GET alone", async () => {
    const res = await (await app(stub(true))).inject({ method: "POST", url: "/health/serving" });
    expect(res.statusCode).toBe(404);
  });
});
