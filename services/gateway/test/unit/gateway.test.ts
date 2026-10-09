// The gateway's health tracking and routing order (tasks.md T051, T052; contracts/provider-adapter.md §3.1, §6;
// gateway-http.md §2.4), with a scripted adapter and a stand-in store: no network and no Postgres.
import { fileURLToPath } from "node:url";

import { context, metrics, trace } from "@opentelemetry/api";
import { node, tracing } from "@opentelemetry/sdk-node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ADAPTER_TYPE_SPECS } from "../../src/adapters/_settings.js";

import type { BuiltAdapter } from "../../src/adapters/registry.js";
import { loadConfig, type AdapterConfig, type LoadedConfig, type PriceVersion } from "../../src/config/validate.js";
import { GatewayClock } from "../../src/core/clock.js";
import { AdapterHealth, Gateway, type GatewayCall } from "../../src/core/gateway.js";
import {
  ProviderError,
  type AdapterResult,
  type CompletionRequest,
  type HealthStatus,
  type ProviderAdapter,
} from "../../src/core/types.js";
import type { StateRead, Store } from "../../src/meter/store.js";
import type { AdmitRequest, AdmitResult, Admitted, CallEnd, MeterPort } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const T0 = Date.parse("2026-10-28T10:00:00.000Z");
const CADENCE = { intervalMs: 1_000, timeoutMs: 800, unhealthyAfter: 1, healthyAfter: 3 };

/** An adapter whose probes and calls a test scripts. */
function scripted() {
  const probes: boolean[] = [];
  let call: (req: CompletionRequest) => Promise<AdapterResult> = async () => ({
    text: "hi",
    usage: { inputTokens: 1, outputTokens: 1 },
    finishReason: "stop",
    responseModel: "stand-in",
    latencyMs: 1,
  });
  let calls = 0;
  const adapter: ProviderAdapter = {
    id: "local",
    type: "openai-compatible",
    provider: "local",
    kind: "local",
    model: "stand-in",
    server: { address: "model-server", port: 8080 },
    retry: { on: [], max: 0, backoffMs: 0 },
    complete: (req) => {
      calls += 1;
      return call(req);
    },
    health: async (): Promise<HealthStatus> => {
      const ok = probes.shift() ?? true;
      return ok
        ? { healthy: true, checkedAt: new Date(T0).toISOString() }
        : { healthy: false, checkedAt: new Date(T0).toISOString(), reason: "unreachable" };
    },
  };
  return {
    adapter,
    probes,
    calls: () => calls,
    onCall: (fn: typeof call) => {
      call = fn;
    },
  };
}

describe("AdapterHealth (§3.1's cadence: unhealthy after 1 failure, healthy after 3 passes)", () => {
  it("starts unhealthy, not_ready, and needs three passes in a row", async () => {
    const s = scripted();
    const flips: boolean[] = [];
    const h = new AdapterHealth(s.adapter, CADENCE, {
      realNow: () => T0,
      onChange: (x) => flips.push(x.status().healthy),
    });
    expect(h.status()).toMatchObject({ healthy: false, reason: "not_ready" });
    s.probes.push(true, true, false, true, true, true);
    await h.probe();
    await h.probe();
    expect(h.status().healthy).toBe(false);
    await h.probe(); // a failure resets the count
    expect(h.status()).toMatchObject({ healthy: false, reason: "unreachable" });
    await h.probe();
    await h.probe();
    expect(h.status().healthy).toBe(false);
    await h.probe();
    expect(h.status()).toEqual({ healthy: true, checkedAt: new Date(T0).toISOString() });
    expect(flips).toEqual([true]);
  });

  it("turns unhealthy after one failed probe, and a call that fails as unavailable or timeout does it at once", async () => {
    const s = scripted();
    let now = T0;
    const h = new AdapterHealth(s.adapter, CADENCE, { realNow: () => now, onChange: () => {} });
    s.probes.push(true, true, true);
    for (let i = 0; i < 3; i++) await h.probe();
    expect(h.unhealthySince()).toBeUndefined();
    now = T0 + 5_000;
    h.callFailed(new ProviderError("timeout", true, false));
    expect(h.status()).toMatchObject({ healthy: false, reason: "timeout" });
    expect(h.unhealthySince()).toBe(T0 + 5_000);

    s.probes.push(true, true, true);
    for (let i = 0; i < 3; i++) await h.probe();
    h.callFailed(new ProviderError("unavailable", true, false, undefined, "ECONNREFUSED"));
    expect(h.status()).toMatchObject({ healthy: false, reason: "unreachable" });

    s.probes.push(true, true, true);
    for (let i = 0; i < 3; i++) await h.probe();
    s.probes.push(false);
    await h.probe();
    expect(h.status()).toMatchObject({ healthy: false, reason: "unreachable" });
  });

  it("ignores a call that fails any other way: a rejected request is no sign of an unhealthy server", async () => {
    const s = scripted();
    const h = new AdapterHealth(s.adapter, CADENCE, { realNow: () => T0, onChange: () => {} });
    s.probes.push(true, true, true);
    for (let i = 0; i < 3; i++) await h.probe();
    for (const kind of ["bad_request", "auth", "rate_limited", "provider_error", "content_filtered"] as const) {
      h.callFailed(new ProviderError(kind, false, false));
      expect(h.status().healthy, kind).toBe(true);
    }
  });

  it("reports each unhealthy reason it enters: the first probe's, a flip, and a change while unhealthy", async () => {
    const s = scripted();
    const entered: (string | undefined)[] = [];
    const h = new AdapterHealth(s.adapter, CADENCE, {
      realNow: () => T0,
      onChange: () => {},
      onUnhealthy: (x) => entered.push(x.status().reason),
    });
    s.probes.push(false, false); // not_ready, then the first probe's own reason; the same reason again is no news
    await h.probe();
    await h.probe();
    expect(entered).toEqual(["unreachable"]);
    s.probes.push(true, true, true);
    for (let i = 0; i < 3; i++) await h.probe();
    h.callFailed(new ProviderError("timeout", true, false)); // a flip
    h.callFailed(new ProviderError("unavailable", true, false)); // a new reason while unhealthy
    expect(entered).toEqual(["unreachable", "timeout", "unreachable"]);
  });

  it("probes on the cadence once started, and not after stop()", async () => {
    const s = scripted();
    const h = new AdapterHealth(s.adapter, { ...CADENCE, intervalMs: 20 }, { realNow: Date.now, onChange: () => {} });
    h.start();
    await new Promise((r) => setTimeout(r, 120));
    expect(h.status().healthy).toBe(true);
    h.stop();
    s.probes.push(false, false, false);
    await new Promise((r) => setTimeout(r, 80));
    expect(h.status().healthy).toBe(true);
    expect(s.probes).toHaveLength(3); // none taken
  });
});

describe("Gateway.complete's order (§2.4)", () => {
  let config: LoadedConfig;
  beforeAll(async () => {
    config = await loadConfig(FIXTURES, { allowPlanned: false });
  });

  function gatewayWith(read: StateRead, s: ReturnType<typeof scripted>): Gateway {
    const store = {
      readStackState: async () => read,
      outageStartedAt: () => undefined,
      query: async () => ({ rows: [] }),
      readMeters: async () => [],
    } as unknown as Store;
    const fixture = config.routing?.adapters.get("local");
    if (!config.routing || !config.prices || !config.budgets || !fixture) throw new Error("fixtures");
    // Probed every 50 ms here; the schema's 250 ms floor applies when the file is read, not to the tracker.
    const health = { ...(fixture.settings.health as object), interval_ms: 50, timeout_ms: 40 };
    const local = { ...fixture, settings: { ...fixture.settings, health } };
    const built: BuiltAdapter = { role: "primary", config: local, adapter: s.adapter };
    return new Gateway({
      stack: "dev",
      envClass: "dev",
      version: "0.1.0",
      routing: config.routing,
      prices: config.prices,
      budgets: config.budgets,
      adapters: [built],
      store,
      clock: new GatewayClock(),
      tracer: trace.getTracer("test"),
      metrics: new GatewayMetrics(metrics.getMeter("test")),
      logger: { info() {}, warn() {}, error() {} },
      payloadSampling: false,
      testMachinery: { clock: true, synthetic: true },
    });
  }

  const normal: StateRead = {
    kind: "ok",
    state: "normal",
    since: new Date(T0),
    crossed: [],
    fallbackAwaitingRenewal: true,
    fallbackAwaitingSince: new Date(T0),
    testClockOffsetMs: null,
  };
  const call = (signal = new AbortController().signal): GatewayCall => ({
    requestId: "ab".repeat(16),
    purpose: "hello",
    messages: [{ role: "user", content: "hi" }],
    maxOutputTokens: 128,
    arrivedAt: Date.now(),
    signal,
  });
  /** Three passing probes from the gateway's own loop, then the loop stopped. */
  const healthy = async (g: Gateway, s: ReturnType<typeof scripted>) => {
    g.start();
    await vi.waitFor(() => expect(g.routedAdapters()[0]?.health.healthy).toBe(true), { timeout: 5_000, interval: 10 });
    await g.close();
    expect(s.calls()).toBe(0);
  };

  it("answers from the state read alone, never calling an adapter, while the store is empty", async () => {
    const s = scripted();
    const g = gatewayWith({ kind: "uninitialized" }, s);
    const a = await g.complete(call());
    expect(a).toMatchObject({ kind: "degraded", decision: { cause: "store_uninitialized" } });
    expect(s.calls()).toBe(0);
  });

  it("answers no_fallback_in_stack, never calling local, while local is unhealthy", async () => {
    const s = scripted();
    const g = gatewayWith(normal, s);
    const a = await g.complete(call());
    expect(a).toMatchObject({ kind: "degraded", decision: { cause: "no_fallback_in_stack" } });
    expect(s.calls()).toBe(0);
  });

  it("doesn't mark local unhealthy when the caller goes away mid-call", async () => {
    const s = scripted();
    const g = gatewayWith(normal, s);
    await healthy(g, s);
    expect(g.routedAdapters()[0]?.health.healthy).toBe(true);
    s.onCall(
      (req) =>
        new Promise((_, reject) =>
          req.signal.addEventListener("abort", () => reject(new ProviderError("timeout", true, false))),
        ),
    );
    const gone = new AbortController();
    const pending = g.complete(call(gone.signal));
    setTimeout(() => gone.abort(), 20);
    await pending;
    expect(s.calls()).toBe(1);
    expect(g.routedAdapters()[0]?.health.healthy).toBe(true);
  });
});

describe("the fallback branch, against a fake meter (gateway-http.md §2.4 steps 5.3–5.8; tasks.md T074)", () => {
  let config: LoadedConfig;
  beforeAll(async () => {
    config = await loadConfig(FIXTURES, { allowPlanned: false });
  });

  /** A synthetic-like fallback: kind synthetic, $0.10 a call at the fixture's price, its answers scripted. */
  function fallbackAdapter() {
    let call: (req: CompletionRequest) => Promise<AdapterResult> = async () => ({
      text: "synthetic response",
      usage: { inputTokens: 0, outputTokens: 1_000 },
      finishReason: "stop",
      responseModel: "metered-test",
      responseId: "synthetic-1",
      latencyMs: 0,
    });
    let calls = 0;
    const adapter: ProviderAdapter = {
      id: "synthetic",
      type: "synthetic",
      provider: "synthetic",
      kind: "synthetic",
      model: "metered-test",
      server: { address: "synthetic" },
      retry: { on: [], max: 0, backoffMs: 0 },
      fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
      complete: (req) => {
        calls += 1;
        return call(req);
      },
      health: async () => ({ healthy: true, checkedAt: new Date(T0).toISOString() }),
    };
    return { adapter, calls: () => calls, onCall: (fn: typeof call) => void (call = fn) };
  }

  /** A MeterPort whose answers the test scripts, recording every admission and settlement. */
  function fakeMeter() {
    const admits: AdmitRequest[] = [];
    const settles: { a: Admitted; end: CallEnd; label?: string }[] = [];
    let next: (r: AdmitRequest) => AdmitResult = (r) => ({
      ok: true,
      admitted: {
        reservationId: "6f0f3a3e-29d8-4c9c-a6f5-0cbbd0f3e0a1",
        attribution: r.attribution,
        adapterId: r.adapter.id,
        provider: r.adapter.provider,
        model: r.adapter.model,
        price: config.prices?.versions[0] as PriceVersion,
        maxMicro: 100_000n,
        periodDay: "2026-10-28",
        periodMonth: "2026-10",
        createdAt: T0,
        expiresAt: T0 + 120_000,
        retryUntil: Date.now() + 120_000,
        requestId: r.requestId,
        traceId: r.traceId,
        purpose: r.purpose,
        routeReason: r.routeReason,
        routingSha: "ab".repeat(32),
      },
    });
    let committed = true;
    const meter: MeterPort = {
      admit: async (r) => {
        admits.push(r);
        return next(r);
      },
      settle: async (a, end, o) => {
        settles.push({ a, end, ...(o?.clientLabel === undefined ? {} : { label: o.clientLabel }) });
        return { committed, costMicro: 100_000n }; // what the meter found: the answer reports it
      },
      counters: () => ({ inFlight: 0, lastMinute: 0 }),
      start: () => {},
      stop: async () => {},
    };
    return {
      meter,
      admits,
      settles,
      answer: (fn: typeof next) => void (next = fn),
      commitPending: () => void (committed = false),
    };
  }

  // Registered, so the context manager carries the caller's span into the gateway, as the server span is carried.
  const exporter = new tracing.InMemorySpanExporter();
  const provider = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });
  const tracer = provider.getTracer("fallback-test");
  beforeAll(() => provider.register());
  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
  });

  function rig(read: StateRead = normalState) {
    const local = scripted();
    const fb = fallbackAdapter();
    const m = fakeMeter();
    const store = {
      readStackState: async () => read,
      outageStartedAt: () => undefined,
      query: async () => ({ rows: [] }),
      readMeters: async () => [],
    } as unknown as Store;
    const fixture = config.routing?.adapters.get("local");
    if (!config.routing || !config.prices || !config.budgets || !fixture) throw new Error("fixtures");
    const syntheticConfig: AdapterConfig = {
      id: "synthetic",
      type: "synthetic",
      kind: "synthetic",
      provider: "synthetic",
      settings: { model: "metered-test", output_tokens: 1_000 },
      spec: ADAPTER_TYPE_SPECS.get("synthetic") as AdapterConfig["spec"],
      placeholders: [],
    };
    const g = new Gateway({
      stack: "dev",
      envClass: "dev",
      version: "0.1.0",
      routing: config.routing,
      prices: config.prices,
      budgets: config.budgets,
      adapters: [
        { role: "primary", config: fixture, adapter: local.adapter },
        { role: "fallback", config: syntheticConfig, adapter: fb.adapter },
      ],
      store,
      clock: new GatewayClock(),
      tracer,
      metrics: new GatewayMetrics(metrics.getMeter("test")),
      logger: { info() {}, warn() {}, error() {} },
      payloadSampling: false,
      testMachinery: { clock: true, synthetic: true },
      meter: m.meter,
    });
    return { g, local, fb, m };
  }

  const normalState: StateRead = {
    kind: "ok",
    state: "normal",
    since: new Date(T0),
    crossed: [],
    fallbackAwaitingRenewal: false,
    fallbackAwaitingSince: null,
    testClockOffsetMs: null,
  };
  const call = (o: Partial<GatewayCall> = {}): GatewayCall => ({
    requestId: "cd".repeat(16),
    purpose: "hello",
    messages: [{ role: "user", content: "hi" }],
    maxOutputTokens: 128,
    arrivedAt: Date.now(),
    signal: new AbortController().signal,
    clientKey: "198.51.100.7\u0000author-laptop",
    clientLabel: "author-laptop",
    ...o,
  });
  const spans = () => exporter.getFinishedSpans();
  const routeSpan = () => spans().find((s) => s.name === "gateway.route");

  beforeEach(() => exporter.reset());

  it("admits the fallback call with its identity, calls it within the deadline, and settles it at the reservation's price", async () => {
    const { g, local, fb, m } = rig();
    await g.probeAll(); // the fallback is healthy; local needs three passes, so it stays unhealthy
    const a = await g.complete(call());
    expect(a).toMatchObject({
      kind: "answered",
      route: "fallback",
      routeReason: "local_unhealthy",
      provider: "synthetic",
      costMicro: 100_000n,
      priceVersion: "2026-10-08.1",
    });
    expect(local.calls()).toBe(0);
    expect(fb.calls()).toBe(1);
    expect(m.admits).toEqual([
      {
        attribution: "fallback",
        adapter: {
          id: "synthetic",
          provider: "synthetic",
          model: "metered-test",
          fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
        },
        adapterHealthy: true,
        maxOutputTokens: 128,
        clientKey: "198.51.100.7\u0000author-laptop",
        requestId: "cd".repeat(16),
        traceId: a.traceId,
        purpose: "hello",
        routeReason: "local_unhealthy",
      },
    ]);
    // The meter is told how the call ended, and finds its cost itself (data-model.md §7.3): the gateway states none.
    expect(m.settles).toHaveLength(1);
    expect(m.settles[0]?.end).toEqual({
      attempts: [
        expect.objectContaining({
          outcome: "ok",
          result: expect.objectContaining({
            usage: { inputTokens: 0, outputTokens: 1_000 },
            responseModel: "metered-test",
            finishReason: "stop",
          }),
          startedAt: expect.any(Number),
          endedAt: expect.any(Number),
        }),
      ],
    });
    expect(m.settles[0]?.label).toBe("author-laptop");
    expect(routeSpan()?.attributes).toMatchObject({
      "h4.route.decision": "fallback",
      "h4.route.reason": "local_unhealthy",
      "h4.meter.attribution": "fallback",
      "h4.state": "normal",
    });
    expect(routeSpan()?.attributes["h4.meter.commit"]).toBeUndefined();
    const client = spans().find((s) => s.name === "chat metered-test");
    expect(client?.attributes).toMatchObject({
      "h4.route.decision": "fallback",
      "h4.route.reason": "local_unhealthy",
      "h4.meter.attribution": "fallback",
      "h4.cost.usd": 0.1,
      "h4.cost.basis": "usage",
    });
    // No client identifier on any span.
    expect(JSON.stringify(spans().map((s) => s.attributes))).not.toContain("author-laptop");
  });

  it("passes the meter's 429 through as a refusal, calling nothing and settling nothing", async () => {
    const { g, fb, m } = rig();
    await g.probeAll();
    m.answer(() => ({
      ok: false,
      refusal: "limit",
      error: "metered_capacity_exceeded",
      limit: "global_per_minute",
      retryAfterS: 12,
    }));
    const a = await g.complete(call());
    expect(a).toMatchObject({
      kind: "refused",
      error: "metered_capacity_exceeded",
      limit: "global_per_minute",
      retryAfterS: 12,
    });
    expect(fb.calls()).toBe(0);
    expect(m.settles).toEqual([]);
  });

  it("answers the admission's degraded cause, calling nothing", async () => {
    const { g, fb, m } = rig();
    await g.probeAll();
    m.answer(() => ({
      ok: false,
      refusal: "degraded",
      decision: {
        kind: "degraded",
        cause: "meter_at_ceiling",
        detail: "x",
        ceilings: ["day"],
      },
    }));
    const a = await g.complete(call());
    expect(a).toMatchObject({ kind: "degraded", decision: { cause: "meter_at_ceiling", ceilings: ["day"] } });
    expect(fb.calls()).toBe(0);
    expect(routeSpan()?.attributes).toMatchObject({
      "h4.route.decision": "degraded",
      "h4.degraded.cause": "meter_at_ceiling",
    });
  });

  it("commits a failed fallback call at its cost basis, and answers fallback_unavailable with no since", async () => {
    const { g, fb, m } = rig();
    await g.probeAll();
    fb.onCall(async () => {
      throw new ProviderError("timeout", true, true); // possibly billed
    });
    const a = await g.complete(call());
    expect(a).toMatchObject({ kind: "degraded", decision: { cause: "fallback_unavailable" } });
    if (a.kind === "degraded") expect(a.decision.since).toBeUndefined();
    const end = m.settles[0]?.end;
    const attempts = end !== undefined && "attempts" in end ? end.attempts : [];
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ outcome: "error", error: { kind: "timeout", possiblyBilled: true } });
    // A timeout counts as a failed probe: the fallback is unhealthy now.
    expect(g.routedAdapters()[1]?.health.healthy).toBe(false);
  });

  it("settles a call whose surrounding code failed as unknown, so the meter charges its maximum, and rethrows", async () => {
    const { g, fb, m } = rig();
    await g.probeAll();
    const startSpan = tracer.startSpan.bind(tracer);
    const spy = vi.spyOn(tracer, "startSpan").mockImplementation((name, options, ctx) => {
      if (name.startsWith("chat ")) throw new TypeError("instrumentation failed");
      return startSpan(name, options, ctx);
    });
    try {
      await expect(g.complete(call())).rejects.toThrow(TypeError);
    } finally {
      spy.mockRestore();
    }
    expect(fb.calls()).toBe(0);
    expect(m.settles).toHaveLength(1);
    expect(m.settles[0]?.end).toEqual({ unknown: true, at: expect.any(Number) });
  });

  it("marks the routing span when the commit is pending, and still answers", async () => {
    const { g, m } = rig();
    await g.probeAll();
    m.commitPending();
    const a = await g.complete(call());
    expect(a).toMatchObject({ kind: "answered", route: "fallback" });
    expect(routeSpan()?.attributes["h4.meter.commit"]).toBe("pending");
  });

  it("fails over from a local call that fails as unavailable, as local_failed", async () => {
    const { g, local, m } = rig();
    local.probes.push(true, true, true);
    for (let i = 0; i < 3; i++) await g.probeAll();
    local.onCall(async () => {
      throw new ProviderError("unavailable", true, false, undefined, "ECONNREFUSED");
    });
    const a = await g.complete(call());
    expect(a).toMatchObject({ kind: "answered", route: "fallback", routeReason: "local_failed" });
    expect(local.calls()).toBe(1);
    expect(m.admits[0]?.routeReason).toBe("local_failed");
  });

  it("makes a metered call with no local step, even with local healthy: no route reason, no client key", async () => {
    const { g, local, m } = rig();
    local.probes.push(true, true, true);
    for (let i = 0; i < 3; i++) await g.probeAll();
    const a = await g.meteredCall(call({ purpose: "synthetic" }), { attribution: "metered", adapterId: "synthetic" });
    expect(a).toMatchObject({ kind: "answered", route: "metered", routeReason: null, costMicro: 100_000n });
    expect(local.calls()).toBe(0);
    expect(m.admits[0]).toMatchObject({ attribution: "metered", routeReason: null, purpose: "synthetic" });
    expect(m.admits[0]?.clientKey).toBeUndefined();
    expect(routeSpan()?.attributes).toMatchObject({
      "h4.route.decision": "metered",
      "h4.route.reason": "metered",
      "h4.meter.attribution": "metered",
    });
    await expect(g.meteredCall(call(), { attribution: "metered", adapterId: "local" })).rejects.toThrow(
      /no metered adapter/,
    );
  });

  it("starts a call of its own trace as a root span, linked to its caller's", async () => {
    const { g } = rig();
    await g.probeAll();
    const parent = tracer.startSpan("POST /admin/test/synthetic");
    const first = await context.with(trace.setSpan(context.active(), parent), () =>
      g.complete(call({ newTrace: true })),
    );
    const second = await context.with(trace.setSpan(context.active(), parent), () =>
      g.complete(call({ newTrace: true })),
    );
    parent.end();
    expect(first.traceId).not.toBe(second.traceId);
    expect(first.traceId).not.toBe(parent.spanContext().traceId);
    const routes = spans().filter((s) => s.name === "gateway.route");
    expect(routes).toHaveLength(2);
    for (const r of routes) {
      expect(r.parentSpanContext).toBeUndefined();
      expect(r.links.map((l) => l.context.spanId)).toEqual([parent.spanContext().spanId]);
    }
  });

  describe("a paid fallback that turns unhealthy (alerts.md §2; data-model.md §7.7; tasks.md T152)", () => {
    /** A Bedrock-like fallback, kind paid, whose probes the test scripts. It never spends: no call is made here. */
    function paidAdapter() {
      const probes: HealthStatus[] = [];
      const adapter: ProviderAdapter = {
        id: "bedrock",
        type: "bedrock-converse",
        provider: "aws.bedrock",
        kind: "paid",
        model: "inference-profile",
        server: { address: "bedrock-runtime.us-east-1.amazonaws.com" },
        retry: { on: ["rate_limited"], max: 1, backoffMs: 250 },
        complete: async () => {
          throw new ProviderError("timeout", true, true);
        },
        health: async () => probes.shift() ?? { healthy: true, checkedAt: new Date(T0).toISOString() },
      };
      const paidConfig: AdapterConfig = {
        id: "bedrock",
        type: "bedrock-converse",
        kind: "paid",
        provider: "aws.bedrock",
        settings: {
          region: "us-east-1",
          model: "inference-profile",
          additional_request_fields: {},
          timeouts: { connect_ms: 1_000, request_ms: 4_000 },
          retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
          circuit: { failures: 3, open_s: 30 },
          health: { interval_ms: 10_000 },
          credentials_warn_before_s: 7_200,
        },
        spec: ADAPTER_TYPE_SPECS.get("bedrock-converse") as AdapterConfig["spec"],
        placeholders: [],
      };
      return { adapter, paidConfig, probes };
    }
    const unhealthy = (reason: HealthStatus["reason"]): HealthStatus => ({
      healthy: false,
      checkedAt: new Date(T0).toISOString(),
      ...(reason === undefined ? {} : { reason }),
    });

    function paidRig(fallbackKind: "paid" | "synthetic" = "paid") {
      const local = scripted();
      const paid = paidAdapter();
      const synthetic = fallbackAdapter();
      const fixture = config.routing?.adapters.get("local");
      if (!config.routing || !config.prices || !config.budgets || !fixture) throw new Error("fixtures");
      const syntheticConfig: AdapterConfig = {
        id: "synthetic",
        type: "synthetic",
        kind: "synthetic",
        provider: "synthetic",
        settings: { model: "metered-test", output_tokens: 1_000 },
        spec: ADAPTER_TYPE_SPECS.get("synthetic") as AdapterConfig["spec"],
        placeholders: [],
      };
      const g = new Gateway({
        stack: "prod",
        envClass: "prod",
        version: "0.1.0",
        routing: config.routing,
        prices: config.prices,
        budgets: config.budgets,
        adapters: [
          { role: "primary", config: fixture, adapter: local.adapter },
          fallbackKind === "paid"
            ? { role: "fallback", config: paid.paidConfig, adapter: paid.adapter }
            : { role: "fallback", config: syntheticConfig, adapter: synthetic.adapter },
        ],
        store: { readStackState: async () => normalState, outageStartedAt: () => undefined } as unknown as Store,
        clock: new GatewayClock(),
        tracer,
        metrics: new GatewayMetrics(metrics.getMeter("test")),
        logger: { info() {}, warn() {}, error() {} },
        payloadSampling: false,
        testMachinery: { clock: false, synthetic: false },
        meter: fakeMeter().meter,
      });
      const queued: { adapter: string; reason: string }[] = [];
      g.onFallbackUnavailable = (adapter, reason) => void queued.push({ adapter, reason });
      return { g, local, paid, synthetic, queued };
    }

    it("asks for the alert when its credentials fail, at the first probe that finds it, and not again for the same reason", async () => {
      const { g, paid, queued } = paidRig();
      paid.probes.push(unhealthy("credentials"), unhealthy("credentials"));
      await g.probeAll();
      await g.probeAll();
      expect(queued).toEqual([{ adapter: "bedrock", reason: "credentials" }]);
    });

    it("asks again each time it turns unhealthy after a recovery: the outbox's hourly key keeps it to one an hour", async () => {
      const { g, paid, queued } = paidRig();
      await g.probeAll(); // healthy: one pass is enough for Bedrock's cadence
      expect(g.routedAdapters()[1]?.health.healthy).toBe(true);
      paid.probes.push(unhealthy("credentials"));
      await g.probeAll();
      await g.probeAll(); // healthy again
      paid.probes.push(unhealthy("credentials"));
      await g.probeAll();
      expect(queued).toEqual([
        { adapter: "bedrock", reason: "credentials" },
        { adapter: "bedrock", reason: "credentials" },
      ]);
    });

    it("asks for nothing on other reasons, for the primary, or for a fallback that isn't paid", async () => {
      const paid = paidRig();
      await paid.g.probeAll();
      paid.local.probes.push(false); // the primary turning unhealthy
      paid.paid.probes.push(unhealthy("unreachable"), unhealthy("timeout"), unhealthy("not_ready"));
      await paid.g.probeAll();
      await paid.g.probeAll();
      await paid.g.probeAll();
      expect(paid.queued).toEqual([]);
      const notPaid = paidRig("synthetic");
      notPaid.synthetic.adapter.health = async () => unhealthy("credentials");
      await notPaid.g.probeAll();
      expect(notPaid.g.routedAdapters()[1]?.health).toMatchObject({ healthy: false, reason: "credentials" });
      expect(notPaid.queued).toEqual([]);
    });
  });
});
