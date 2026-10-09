// The gateway's health tracking and routing order (tasks.md T051, T052; contracts/provider-adapter.md §3.1, §6;
// gateway-http.md §2.4), with a scripted adapter and a stand-in store: no network and no Postgres.
import { fileURLToPath } from "node:url";

import { metrics, trace } from "@opentelemetry/api";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { BuiltAdapter } from "../../src/adapters/registry.js";
import { loadConfig, type LoadedConfig } from "../../src/config/validate.js";
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
