// POST /hello and GET /health on a local stack (tasks.md T049, T052–T054; contracts/gateway-http.md §2, §5), on
// Fastify inject and PGlite, with the local adapter talking to an in-process stub of llama.cpp's API:
// - store_uninitialized before init, then a 200 body exactly as §2.5.1;
// - the ledger row of a local call: attribution none, cost 0, cost basis none (data-model.md §7.4);
// - the server, gateway.route, and chat {model} spans (telemetry.md §3.2);
// - the /health report exactly as §5;
// - 400 and 415 (§2.5.4), the per-client cap's 429 (§2.3), 502 local_error (§2.5.5), and the degraded causes a
//   stack without a fallback can give (§3).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { FastifyOtelInstrumentation } from "@fastify/otel";
import { SpanKind, context, trace } from "@opentelemetry/api";
import { node, tracing } from "@opentelemetry/sdk-node";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp, createServices, type GatewayServices } from "../../src/app.js";
import { loadConfig, type AdapterConfig, type LoadedConfig } from "../../src/config/validate.js";
import { dayKey, monthKey } from "../../src/core/clock.js";
import { readMigrations, Store } from "../../src/meter/store.js";
import { isHealthProbe } from "../../src/telemetry/otel.js";
import { testDatabase, type TestDatabase } from "../helpers/pglite.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const HEX32 = /^[0-9a-f]{32}$/;
const SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SYSTEM_PROMPT =
  "You are the hello endpoint of the h4reet.ai stack, a test of its model gateway. You are not the Author and not the Author's AI twin, and you know nothing about the Author. Reply to the message in at most two short sentences.";

const exporter = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });
let fastifyOtel: FastifyOtelInstrumentation;

interface Logged {
  level: string;
  record: Record<string, unknown>;
}
const logged: Logged[] = [];
const at = (level: string) => (record: object) =>
  void logged.push({ level, record: record as Record<string, unknown> });
const logger = { info: at("info"), warn: at("warn"), error: at("error"), fatal: at("fatal") };

let stub: StubOpenAI;
let db: TestDatabase;
let store: Store;
let services: GatewayServices;
let api: FastifyInstance;
let config: LoadedConfig;
let stateDir: string;

/** The fixture configuration, with the local adapter probed every 250 ms, the schema's floor, so tests wait less. */
async function fastConfig(): Promise<LoadedConfig> {
  const base = await loadConfig(FIXTURES, { allowPlanned: false });
  const routing = base.routing;
  const local = routing?.adapters.get("local");
  if (!routing || !local) throw new Error("fixture routing");
  const health = { ...(local.settings.health as object), interval_ms: 250, timeout_ms: 200 };
  const fast: AdapterConfig = { ...local, settings: { ...local.settings, health } };
  return { ...base, routing: { ...routing, adapters: new Map([["local", fast]]) } };
}

beforeAll(async () => {
  provider.register();
  // Created before any Fastify instance, so its plugin attaches to the listeners buildApp makes. With no HTTP
  // instrumentation under inject, its request span is the SERVER span.
  fastifyOtel = new FastifyOtelInstrumentation({
    registerOnInitialization: true,
    ignorePaths: (route) => isHealthProbe(route.url),
  });
  stub = await stubOpenAI({ model: "stand-in" });
  stateDir = await mkdtemp(join(tmpdir(), "h4-hello-"));
  db = await testDatabase();
  store = new Store({ db, migrations: await readMigrations(), envClass: "dev", logger, onFatal: () => {} });
  await store.start();
  config = await fastConfig();
  services = await createServices({
    env: {
      H4_STACK: "dev",
      H4_ENV: "dev",
      OPERATOR_TOKEN_SHA256: "ab".repeat(32),
      ALERT_DELIVERY: "standin",
      GATEWAY_TEST_CLOCK: "1",
      GATEWAY_TEST_SYNTHETIC_SPEND: "1",
      TELEMETRY_PAYLOAD_SAMPLING: "off",
      LOCAL_MODEL_BASE_URL: stub.baseUrl,
      LOCAL_MODEL_NAME: "stand-in",
      AWS_PROFILE: "none",
      GATEWAY_STATE_DIR: stateDir,
    },
    config,
    store,
    logger,
    version: "0.1.0",
  });
  ({ api } = buildApp({ stack: "dev", logger, services }));
  services.gateway.start();
  await api.ready();
});

afterAll(async () => {
  await services?.gateway.close();
  await api?.close();
  await store?.close();
  await stub?.close();
  fastifyOtel?.disable();
  await provider.shutdown();
  trace.disable();
  context.disable();
  await rm(stateDir, { recursive: true, force: true });
});

beforeEach(() => {
  exporter.reset();
  logged.length = 0;
  stub.reset();
});

/** The store's one-time initialization: a state row, as the operator's init writes it. */
async function initialize(): Promise<void> {
  await db.pg.query(
    `INSERT INTO gateway.stack_state (stack, env, state, since, crossed, fallback_awaiting_renewal,
       fallback_awaiting_since, initialized_at, initialized_by, test_clock_offset_ms, updated_at)
     VALUES ('dev', 'dev', 'normal', now(), '{}', true, now(), now(), 'operator:dev#abababab', NULL, now())`,
  );
}

async function healthy(): Promise<void> {
  await vi.waitFor(
    async () => {
      const report = (await api.inject({ method: "GET", url: "/health" })).json() as {
        adapters: { healthy: boolean }[];
      };
      expect(report.adapters[0]?.healthy).toBe(true);
    },
    { timeout: 10_000, interval: 50 },
  );
}

const hello = (o: { body?: unknown; label?: string; headers?: Record<string, string>; raw?: string } = {}) =>
  api.inject({
    method: "POST",
    url: "/hello",
    headers: {
      "content-type": "application/json",
      ...(o.label === undefined ? {} : { "x-h4-client": o.label }),
      ...o.headers,
    },
    payload: o.raw ?? JSON.stringify(o.body ?? {}),
  });

describe("before the store is initialized", () => {
  it("answers 503 store_uninitialized, with the cause in the header and the body", async () => {
    const res = await hello({ body: { message: "Say hello." }, label: "before-init" });
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("store_uninitialized");
    expect(res.headers["retry-after"]).toBeUndefined();
    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "state",
      "cause",
      "detail",
      "ceilings",
      "stack",
      "since",
      "request_id",
      "trace_id",
    ]);
    expect(body).toEqual({
      state: "degraded",
      cause: "store_uninitialized",
      detail: "The kill-switch store is empty. The operator must initialize it: make operator-init.",
      ceilings: null,
      stack: "dev",
      since: null,
      request_id: res.headers["x-request-id"],
      trace_id: expect.stringMatching(HEX32),
    });
    const { rows } = await db.pg.query("SELECT count(*)::int AS n FROM gateway.ledger");
    expect(rows).toEqual([{ n: 0 }]); // a degraded answer makes no provider call and writes no row
    expect(logged.find((l) => l.record.event === "call.degraded")?.record).toEqual({
      event: "call.degraded",
      cause: "store_uninitialized",
      route_decision: "degraded",
    });
  });

  it("reports GET /health degraded, with the store uninitialized and no state", async () => {
    const res = await api.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "degraded",
      store: "uninitialized",
      state: null,
      since: null,
      crossed: null,
      degraded_cause: "store_uninitialized",
      fallback: { adapter: null, awaiting_renewal: null, awaiting_since: null },
    });
  });
});

describe("after initialization", () => {
  beforeAll(async () => {
    await initialize();
    await healthy();
  });

  it("answers 200 from the local adapter, with a body exactly as §2.5.1", async () => {
    const res = await hello({ body: { message: "Say hello." }, label: "author-laptop" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-h4-degraded-cause"]).toBeUndefined();
    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "answer",
      "route",
      "route_reason",
      "provider",
      "model",
      "usage",
      "cost_usd",
      "cost_micro_usd",
      "price_version",
      "latency_ms",
      "stack",
      "request_id",
      "trace_id",
    ]);
    expect(body).toEqual({
      answer: `echo: Say hello. ${stub.canary}`,
      route: "local",
      route_reason: null,
      provider: "local",
      model: "stand-in",
      usage: { input_tokens: 71, output_tokens: 14 },
      cost_usd: 0,
      cost_micro_usd: 0,
      price_version: "2026-10-08.1",
      latency_ms: expect.any(Number),
      stack: "dev",
      request_id: res.headers["x-request-id"],
      trace_id: expect.stringMatching(HEX32),
    });
    expect(Number.isInteger(body.latency_ms) && (body.latency_ms as number) >= 0).toBe(true);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("sends the fixed system prompt, the message, and the 128-token cap, and nothing that names the client", async () => {
    await hello({ body: { message: "Say hello." }, label: "prompt-check", headers: { "x-forwarded-for": "10.9.8.7" } });
    const [sent] = stub.requests().filter((r) => r.method === "POST");
    expect(sent?.body).toEqual({
      model: "stand-in",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "Say hello." },
      ],
      max_tokens: 128,
      stream: false,
    });
    expect(JSON.stringify(sent)).not.toMatch(/prompt-check|10\.9\.8\.7/);
  });

  it("defaults the message to Hello. and trims it", async () => {
    await hello({ body: {}, label: "defaults" });
    await hello({ body: { message: "  hi there  " }, label: "defaults" });
    const contents = stub
      .requests()
      .filter((r) => r.method === "POST")
      .map((r) => (r.body as { messages: { content: string }[] }).messages[1]?.content);
    expect(contents).toEqual(["Hello.", "hi there"]);
  });

  it("writes the call's ledger row: local, attribution none, cost 0, cost basis none (data-model.md §7.4)", async () => {
    const res = await hello({ body: { message: "Say hello." }, label: "ledger-check" });
    const body = res.json() as { request_id: string; trace_id: string };
    const { rows } = await db.pg.query<Record<string, unknown>>("SELECT * FROM gateway.ledger WHERE request_id = $1", [
      body.request_id,
    ]);
    expect(rows).toHaveLength(1);
    const now = Date.now();
    expect(rows[0]).toMatchObject({
      reservation_id: null,
      stack: "dev",
      trace_id: body.trace_id,
      purpose: "hello",
      route_decision: "local",
      route_reason: null,
      attribution: "none",
      adapter_id: "local",
      provider: "local",
      request_model: "stand-in",
      response_model: "stand-in",
      input_tokens: 71,
      output_tokens: 14,
      finish_reason: "stop",
      outcome: "ok",
      error_kind: null,
      cost_micro: 0,
      cost_basis: "none",
      price_version: "2026-10-08.1",
      routing_sha: config.routing?.sha256,
      period_day: dayKey(now),
      period_month: monthKey(now),
      client_label: "ledger-check",
    });
    expect(Number(rows[0]?.latency_ms)).toBeGreaterThanOrEqual(0);
    expect(logged.find((l) => l.record.event === "call.completed")?.record).toMatchObject({
      event: "call.completed",
      route_decision: "local",
      attribution: "none",
      adapter: "local",
      provider: "local",
      request_model: "stand-in",
      response_model: "stand-in",
      input_tokens: 71,
      output_tokens: 14,
      cost_micro: 0,
      cost_basis: "none",
      price_version: "2026-10-08.1",
      outcome: "ok",
    });
  });

  it("makes the server, gateway.route, and chat {model} spans of one trace, with no payload or client label", async () => {
    const res = await hello({ body: { message: "Say hello." }, label: "span-check" });
    const traceId = (res.json() as { trace_id: string }).trace_id;
    const spans = exporter.getFinishedSpans().filter((s) => s.spanContext().traceId === traceId);
    const server = spans.find((s) => s.kind === SpanKind.SERVER);
    const route = spans.find((s) => s.name === "gateway.route");
    const chat = spans.find((s) => s.kind === SpanKind.CLIENT);
    expect(server?.attributes).toMatchObject({
      "http.route": "/hello",
      "h4.stack": "dev",
      "h4.outcome": "ok",
    });
    expect(route?.kind).toBe(SpanKind.INTERNAL);
    expect(route?.attributes).toEqual({
      "h4.stack": "dev",
      "h4.routing.sha": config.routing?.sha256,
      "h4.state": "normal",
      "h4.route.decision": "local",
      "h4.route.reason": "local_healthy",
    });
    expect(chat?.name).toBe("chat stand-in");
    expect(chat?.parentSpanContext?.spanId).toBe(route?.spanContext().spanId);
    expect(chat?.attributes).toMatchObject({
      "gen_ai.provider.name": "local",
      "gen_ai.request.model": "stand-in",
      "gen_ai.request.max_tokens": 128,
      "h4.cost.usd": 0,
      "h4.cost.basis": "none",
      "h4.meter.attribution": "none",
      "h4.route.decision": "local",
      "h4.route.reason": "local_healthy",
      "h4.payload.sampled": false,
      "server.address": "localhost",
    });
    // The route span sits inside the request: its parents lead to the server span.
    const byId = new Map(spans.map((s) => [s.spanContext().spanId, s]));
    let parent = route;
    while (parent !== undefined && parent !== server) parent = byId.get(parent.parentSpanContext?.spanId ?? "");
    expect(parent).toBe(server);
    const text = JSON.stringify(spans.map((s) => [s.name, s.attributes, s.events]));
    expect(text).not.toMatch(/Say hello|span-check|You are the hello endpoint/);
    expect(text).not.toContain(stub.canary);
  });

  it("reports GET /health exactly as §5", async () => {
    const res = await api.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "status",
      "stack",
      "env",
      "version",
      "time",
      "real_time",
      "store",
      "state",
      "since",
      "crossed",
      "degraded_cause",
      "fallback",
      "adapters",
      "journal",
      "config",
      "test_machinery",
    ]);
    expect(body).toEqual({
      status: "ok",
      stack: "dev",
      env: "dev",
      version: "0.1.0",
      time: expect.stringMatching(MILLIS),
      real_time: expect.stringMatching(MILLIS),
      store: "ok",
      state: "normal",
      since: expect.stringMatching(SECONDS),
      crossed: [],
      degraded_cause: null,
      fallback: { adapter: null, awaiting_renewal: true, awaiting_since: expect.stringMatching(SECONDS) },
      adapters: [
        {
          id: "local",
          role: "primary",
          provider: "local",
          kind: "local",
          model: "stand-in",
          healthy: true,
          reason: null,
          checked_at: expect.stringMatching(SECONDS),
        },
      ],
      journal: "unknown",
      config: { routing_sha: config.routing?.sha256, price_version: "2026-10-08.1" },
      test_machinery: { clock: true, synthetic: true, clock_offset_ms: null },
    });
    expect(exporter.getFinishedSpans()).toEqual([]); // health probes make no spans
  });

  describe("invalid requests (§2.5.4)", () => {
    const invalid = (res: Awaited<ReturnType<typeof hello>>, field: string) => {
      expect(res.statusCode).toBe(400);
      const body = res.json() as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(["error", "field", "detail", "request_id"]);
      expect(body).toMatchObject({ error: "invalid_request", field, request_id: res.headers["x-request-id"] });
      return body;
    };

    it("answers 400 for a client label that isn't [a-z0-9-]{1,32}, without echoing it", async () => {
      for (const label of ["Author", "a_b", "x".repeat(33), "évite", ""]) {
        const res = await hello({ body: {}, label });
        const body = invalid(res, "X-H4-Client");
        expect(JSON.stringify(body)).not.toContain(label || "never-empty");
      }
    });

    it("answers 400 for a message over 500 characters, empty, or not a string", async () => {
      expect(invalid(await hello({ body: { message: "x".repeat(501) }, label: "v1" }), "message").detail).toBe(
        "at most 500 characters",
      );
      invalid(await hello({ body: { message: "   " }, label: "v1" }), "message");
      invalid(await hello({ body: { message: 42 }, label: "v1" }), "message");
      // 500 code points is the limit, counted as code points, not UTF-16 units.
      const ok = await hello({ body: { message: "😀".repeat(500) }, label: "v2" });
      expect(ok.statusCode).toBe(200);
    });

    it("answers 400 for an unknown field or a body that isn't an object, and for malformed JSON", async () => {
      invalid(await hello({ body: { message: "hi", extra: true }, label: "v3" }), "body");
      invalid(await hello({ body: ["hi"], label: "v3" }), "body");
      invalid(await hello({ raw: "null", label: "v3" }), "body");
      const malformed = await hello({ raw: '{"message": "unterminated', label: "v4" });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toMatchObject({
        error: "invalid_request",
        request_id: malformed.headers["x-request-id"],
      });
      expect(malformed.body).not.toContain("unterminated");
    });

    it("answers 415 for any content type but JSON, and for none", async () => {
      for (const headers of [
        { "content-type": "text/plain" },
        { "content-type": "application/x-www-form-urlencoded" },
      ]) {
        const res = await hello({ raw: "message=hi", headers, label: "v5" });
        expect(res.statusCode).toBe(415);
        expect(res.json()).toEqual({ error: "unsupported_media_type", request_id: res.headers["x-request-id"] });
      }
      const none = await api.inject({ method: "POST", url: "/hello", headers: { "x-h4-client": "v5" } });
      expect(none.statusCode).toBe(415);
    });
  });

  describe("the per-client cap (§2.3)", () => {
    it("refuses the sixth request in a burst with 429 per_minute, after validation would have refused it", async () => {
      // 415s: the cap runs before validation, so a request that ends in a 4xx still counts.
      for (let i = 0; i < 5; i++) {
        const res = await hello({ raw: "x", headers: { "content-type": "text/plain" }, label: "burst" });
        expect(res.statusCode).toBe(415);
      }
      const res = await hello({ body: {}, label: "burst" });
      expect(res.statusCode).toBe(429);
      expect(res.headers["retry-after"]).toBe("3");
      expect(res.headers["x-h4-degraded-cause"]).toBeUndefined();
      expect(res.json()).toEqual({
        error: "client_cap_exceeded",
        limit: "per_minute",
        retry_after_s: 3,
        request_id: res.headers["x-request-id"],
      });
      expect(logged.find((l) => l.record.event === "call.refused")?.record).toEqual({
        event: "call.refused",
        error: "client_cap_exceeded",
        limit: "per_minute",
      });
      expect(JSON.stringify(logged)).not.toContain("burst");
    });

    it("tells clients apart by edge's X-Forwarded-For and the label", async () => {
      const as = (xff: string) =>
        hello({ raw: "x", headers: { "content-type": "text/plain", "x-forwarded-for": xff }, label: "shared" });
      for (let i = 0; i < 5; i++) expect((await as("10.0.0.1")).statusCode).toBe(415);
      expect((await as("10.0.0.1")).statusCode).toBe(429);
      expect((await as("10.0.0.2")).statusCode).toBe(415);
    });
  });

  it("answers 502 local_error when the local model rejects the request, without failing over", async () => {
    stub.setCompletions({ status: 400 });
    const res = await hello({ body: { message: "Say hello." }, label: "local-error" });
    expect(res.statusCode).toBe(502);
    expect(res.headers["x-h4-degraded-cause"]).toBeUndefined();
    const body = res.json() as { request_id: string; trace_id: string };
    expect(body).toEqual({
      error: "local_error",
      kind: "bad_request",
      request_id: res.headers["x-request-id"],
      trace_id: expect.stringMatching(HEX32),
    });
    const { rows } = await db.pg.query(
      "SELECT outcome, error_kind, attribution FROM gateway.ledger WHERE request_id = $1",
      [body.request_id],
    );
    expect(rows).toEqual([{ outcome: "error", error_kind: "bad_request", attribution: "none" }]);
    // A rejected request is no sign of an unhealthy model server: local stays healthy.
    const report = (await api.inject({ method: "GET", url: "/health" })).json() as { adapters: { healthy: boolean }[] };
    expect(report.adapters[0]?.healthy).toBe(true);
    const server = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER);
    expect(server?.attributes).toMatchObject({ "h4.outcome": "error", "error.type": "local_error" });
  });

  it("answers 503 no_fallback_in_stack when the local call fails as unavailable, and marks local unhealthy", async () => {
    stub.setCompletions({ refuse: true });
    const res = await hello({ body: { message: "Say hello." }, label: "local-down" });
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("no_fallback_in_stack");
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      state: "degraded",
      cause: "no_fallback_in_stack",
      detail: "The local model is unavailable, and this stack has no fallback.",
      ceilings: null,
      since: expect.stringMatching(SECONDS),
    });
    const { rows } = await db.pg.query("SELECT outcome, error_kind FROM gateway.ledger WHERE request_id = $1", [
      body.request_id,
    ]);
    expect(rows).toEqual([{ outcome: "error", error_kind: "unavailable" }]);
    const report = (await api.inject({ method: "GET", url: "/health" })).json() as Record<string, unknown>;
    expect(report).toMatchObject({ status: "degraded", degraded_cause: "no_fallback_in_stack" });
    // Unhealthy now, so the next hello doesn't call local at all.
    stub.reset();
    const next = await hello({ body: {}, label: "local-down" });
    expect(next.headers["x-h4-degraded-cause"]).toBe("no_fallback_in_stack");
    expect(stub.requests().filter((r) => r.method === "POST")).toEqual([]);
    const route = exporter.getFinishedSpans().find((s) => s.name === "gateway.route");
    expect(route?.attributes).toMatchObject({
      "h4.route.decision": "degraded",
      "h4.route.reason": "no_fallback_in_stack",
      "h4.degraded.cause": "no_fallback_in_stack",
    });
    stub.restore();
    await healthy();
  });

  it("answers 503 kill_switch_tripped while degraded, refusing local answers too, with the ceilings and since", async () => {
    await db.pg.query(
      `UPDATE gateway.stack_state SET state = 'degraded', crossed = '{day:2026-10-28}', since = '2026-10-28T16:40:03Z'`,
    );
    try {
      const res = await hello({ body: {}, label: "tripped" });
      expect(res.statusCode).toBe(503);
      expect(res.headers["x-h4-degraded-cause"]).toBe("kill_switch_tripped");
      expect(res.json()).toMatchObject({
        cause: "kill_switch_tripped",
        detail:
          "The kill switch set degraded when a spending ceiling was reached. Only an operator reset restores service.",
        ceilings: ["day"],
        since: "2026-10-28T16:40:03Z",
      });
      expect(stub.requests().filter((r) => r.method === "POST")).toEqual([]);
      const route = exporter.getFinishedSpans().find((s) => s.name === "gateway.route");
      expect(route?.attributes).toMatchObject({ "h4.state": "degraded", "h4.degraded.cause": "kill_switch_tripped" });
      expect(exporter.getFinishedSpans().filter((s) => s.kind === SpanKind.CLIENT)).toEqual([]);
    } finally {
      await db.pg.query(`UPDATE gateway.stack_state SET state = 'normal', crossed = '{}', since = now()`);
    }
  });

  it("answers 503 store_unreachable while the store can't be read", async () => {
    await db.pg.query("ALTER TABLE gateway.stack_state RENAME TO stack_state_away");
    try {
      const res = await hello({ body: {}, label: "store-down" });
      expect(res.statusCode).toBe(503);
      expect(res.headers["x-h4-degraded-cause"]).toBe("store_unreachable");
      expect(res.json()).toMatchObject({
        cause: "store_unreachable",
        detail: "The kill-switch store can't be read, so the stack fails closed.",
        since: expect.stringMatching(SECONDS),
      });
      const report = (await api.inject({ method: "GET", url: "/health" })).json() as Record<string, unknown>;
      expect(report).toMatchObject({
        status: "degraded",
        store: "unreachable",
        state: null,
        degraded_cause: "store_unreachable",
      });
    } finally {
      await db.pg.query("ALTER TABLE gateway.stack_state_away RENAME TO stack_state");
    }
  });
});
