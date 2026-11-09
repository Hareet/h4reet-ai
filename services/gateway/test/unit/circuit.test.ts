// The circuit breaker (contracts/provider-adapter.md §6 items 5 and 6; gateway-http.md §2.4 step 5.6; alerts.md §2;
// tasks.md T102, T193): an adapter whose type has a circuit, Bedrock, opens it for `open_s` after `failures` counted
// failures in a row, and reads unhealthy with circuit_open while it's open. Then it's half-open: the adapter reads as
// its probes do, and one fallback call at a time goes through as the trial. A clock the test moves, scripted
// adapters, and a fake meter that refuses an unhealthy fallback as admission does: no network, no Postgres, no AWS.
import { fileURLToPath } from "node:url";

import { metrics, trace } from "@opentelemetry/api";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ADAPTER_TYPE_SPECS, type AdapterTypeSpec } from "../../src/adapters/_settings.js";
import { loadConfig, type AdapterConfig, type LoadedConfig, type PriceVersion } from "../../src/config/validate.js";
import { GatewayClock } from "../../src/core/clock.js";
import { AdapterHealth, Gateway, type AttemptOutcome, type GatewayCall } from "../../src/core/gateway.js";
import { degraded } from "../../src/core/router.js";
import {
  ProviderError,
  type AdapterResult,
  type HealthStatus,
  type ProviderAdapter,
  type ProviderErrorKind,
} from "../../src/core/types.js";
import type { StateRead, Store } from "../../src/meter/store.js";
import type { AdmitRequest, AdmitResult, MeterPort } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { steadyNow } from "../helpers/steady-clock.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const T0 = Date.parse("2026-10-29T16:00:00.000Z");
const MODEL = "us.anthropic.claude-test-v1:0";
const CADENCE = { intervalMs: 10_000, timeoutMs: 1_000, unhealthyAfter: 1, healthyAfter: 1 };
const COUNTED: ProviderErrorKind[] = ["unavailable", "timeout", "rate_limited", "auth", "provider_error"];

const answer: AdapterResult = {
  text: "Hello.",
  usage: { inputTokens: 12, outputTokens: 3 },
  finishReason: "stop",
  responseModel: MODEL,
  latencyMs: 1,
};
const ok: AttemptOutcome = { ok: true, result: answer, attempts: [] };
const failed = (kind: ProviderErrorKind): AttemptOutcome => ({
  ok: false,
  error: new ProviderError(kind, kind !== "bad_request", false),
  attempts: [],
});

/**
 * One AdapterHealth on a clock the test moves, or on one at the real clock's rate ("real") or half of it ("slow"), each
 * a steady clock that a step of the wall clock can't move, its flips and its unhealthy reasons recorded.
 */
function healthRig(o: { kind?: "paid" | "local"; circuit?: boolean; openMs?: number; clock?: "real" | "slow" } = {}) {
  const clock = { now: T0 };
  let next: HealthStatus = { healthy: true, checkedAt: new Date(T0).toISOString() };
  const adapter: ProviderAdapter = {
    id: o.kind === "local" ? "local" : "bedrock",
    type: o.kind === "local" ? "openai-compatible" : "bedrock-converse",
    provider: o.kind === "local" ? "local" : "aws.bedrock",
    kind: o.kind ?? "paid",
    model: MODEL,
    server: { address: "stand-in" },
    retry: { on: [], max: 0, backoffMs: 0 },
    complete: async () => {
      throw new Error("not called");
    },
    health: async () => next,
  };
  const flips: string[] = [];
  const reasons: string[] = [];
  const h = new AdapterHealth(adapter, CADENCE, {
    // "slow" runs at half the real clock's speed, so a timer fires before this clock says its time is up.
    realNow: o.clock === "real" ? steadyNow() : o.clock === "slow" ? steadyNow(1 / 2) : () => clock.now,
    onChange: (x) => flips.push(x.status().healthy ? "healthy" : `unhealthy ${String(x.status().reason)}`),
    onUnhealthy: (x) => reasons.push(String(x.status().reason)),
    ...(o.circuit === false ? {} : { circuit: { failures: 3, openMs: o.openMs ?? 30_000 } }),
  });
  const probe = (status: Partial<HealthStatus> = {}) => {
    next = { healthy: true, checkedAt: new Date(clock.now).toISOString(), ...status };
    return h.probe();
  };
  const end = (outcome: AttemptOutcome | undefined, trial = false, callerGone = false) =>
    h.callEnded(outcome, { trial, callerGone });
  const open = () => {
    for (let i = 0; i < 3; i++) end(failed("provider_error"));
    expect(h.status()).toMatchObject({ healthy: false, reason: "circuit_open" });
  };
  return { h, clock, flips, reasons, probe, end, open };
}

/** A rig whose first probe passed: the adapter is healthy, its circuit closed. */
async function healthy(o: Parameters<typeof healthRig>[0] = {}) {
  const r = healthRig(o);
  await r.probe();
  expect(r.h.status().healthy).toBe(true);
  return r;
}

describe("AdapterHealth's circuit (provider-adapter.md §6 item 5)", () => {
  it.each(COUNTED)("opens after three %s failures in a row: unhealthy, circuit_open, entered once", async (kind) => {
    const r = await healthy();
    r.end(failed(kind));
    r.end(failed(kind));
    expect(r.h.status().healthy).toBe(true);
    r.clock.now += 1_000;
    r.end(failed(kind));
    expect(r.h.status()).toMatchObject({ healthy: false, reason: "circuit_open" });
    expect(r.flips).toEqual(["healthy", "unhealthy circuit_open"]);
    expect(r.reasons).toEqual(["circuit_open"]);
    expect(r.h.unhealthySince()).toBe(T0 + 1_000);
  });

  it("doesn't count bad_request or content_filtered, nor clear the count with them", async () => {
    const r = await healthy();
    r.end(failed("timeout"));
    r.end(failed("unavailable"));
    r.end(failed("bad_request"));
    r.end(failed("content_filtered"));
    expect(r.h.status().healthy).toBe(true);
    r.end(failed("rate_limited"));
    expect(r.h.status().reason).toBe("circuit_open");
  });

  it("clears the count with a success: the failures must come in a row", async () => {
    const r = await healthy();
    r.end(failed("provider_error"));
    r.end(failed("provider_error"));
    r.end(ok);
    r.end(failed("provider_error"));
    r.end(failed("provider_error"));
    expect(r.h.status().healthy).toBe(true);
    r.end(failed("provider_error"));
    expect(r.h.status().reason).toBe("circuit_open");
  });

  it("counts nothing for a caller that went away, or a call that never reached the adapter", async () => {
    const r = await healthy();
    for (let i = 0; i < 5; i++) {
      r.end(failed("timeout"), false, true);
      r.end(undefined);
    }
    expect(r.h.status().healthy).toBe(true);
  });

  it("stays open through passing probes, and puts the probes' own reason first", async () => {
    const r = await healthy();
    r.open();
    await r.probe();
    expect(r.h.status().reason).toBe("circuit_open");
    await r.probe({ healthy: false, reason: "credentials" });
    expect(r.h.status()).toMatchObject({ healthy: false, reason: "credentials" });
    await r.probe();
    expect(r.h.status()).toMatchObject({ healthy: false, reason: "circuit_open" });
    expect(r.reasons).toEqual(["circuit_open", "credentials", "circuit_open"]);
    expect(r.flips).toEqual(["healthy", "unhealthy circuit_open"]);
  });

  it("turns half-open after open_s: it reads as its probes do, and one fallback call at a time is the trial", async () => {
    const r = await healthy();
    r.open();
    r.clock.now += 29_999;
    expect(r.h.status().reason).toBe("circuit_open");
    expect([r.h.wouldAdmit(), r.h.admitCall()]).toEqual([false, { allowed: false, trial: false }]);
    r.clock.now += 1;
    expect(r.h.status()).toMatchObject({ healthy: true });
    expect(r.flips).toEqual(["healthy", "unhealthy circuit_open", "healthy"]);
    expect(r.h.wouldAdmit()).toBe(true);
    expect(r.h.admitCall()).toEqual({ allowed: true, trial: true });
    expect([r.h.wouldAdmit(), r.h.admitCall()]).toEqual([false, { allowed: false, trial: false }]); // the trial is out
    r.end(ok, true);
    expect(r.h.admitCall()).toEqual({ allowed: true, trial: false }); // closed: every call goes through
    expect(r.flips).toEqual(["healthy", "unhealthy circuit_open", "healthy"]);
  });

  it("opens it for another open_s when the trial fails, unhealthy again", async () => {
    const r = await healthy();
    r.open();
    r.clock.now += 30_000;
    expect(r.h.admitCall()).toEqual({ allowed: true, trial: true });
    r.end(failed("provider_error"), true);
    expect(r.h.status()).toMatchObject({ healthy: false, reason: "circuit_open" });
    expect(r.reasons).toEqual(["circuit_open", "circuit_open"]); // fallback_unavailable's hourly key holds the alert
    r.clock.now += 29_999;
    expect(r.h.admitCall().allowed).toBe(false);
    r.clock.now += 1;
    expect(r.h.status().healthy).toBe(true);
    expect(r.h.admitCall()).toEqual({ allowed: true, trial: true });
  });

  it("gives the trial back, still half-open, when the trial never reached the adapter or ended uncounted", async () => {
    const r = await healthy();
    r.open();
    r.clock.now += 30_000;
    expect(r.h.admitCall().trial).toBe(true);
    r.end(undefined, true); // admission refused it
    expect(r.h.admitCall().trial).toBe(true);
    r.end(failed("bad_request"), true);
    expect(r.h.admitCall().trial).toBe(true);
    r.end(failed("timeout"), true, true); // its caller went away
    expect(r.h.status().healthy).toBe(true);
    expect(r.h.admitCall().trial).toBe(true);
  });

  it("holds the trial back while the probes say unhealthy", async () => {
    const r = await healthy();
    r.open();
    await r.probe({ healthy: false, reason: "credentials" });
    r.clock.now += 30_000;
    expect(r.h.status()).toMatchObject({ healthy: false, reason: "credentials" });
    expect([r.h.wouldAdmit(), r.h.admitCall().allowed]).toEqual([false, false]);
    await r.probe();
    expect(r.h.admitCall().trial).toBe(true);
  });

  it("turns half-open on its own: the effective health moves when the time is up, without a read", async () => {
    const r = await healthy({ clock: "real", openMs: 40 });
    r.open();
    await vi.waitFor(() => expect(r.flips.at(-1)).toBe("healthy"), { timeout: 2_000, interval: 10 });
    expect(r.flips).toEqual(["healthy", "unhealthy circuit_open", "healthy"]);
    r.h.stop(); // and stop() clears a pending turn
  });

  it("turns half-open on its own when its timer fires before the clock says the time is up", async () => {
    const r = await healthy({ clock: "slow", openMs: 40 }); // the timer fires at 40 real ms: 20 on this clock
    r.open();
    await vi.waitFor(() => expect(r.flips.at(-1)).toBe("healthy"), { timeout: 2_000, interval: 10 });
    expect(r.flips).toEqual(["healthy", "unhealthy circuit_open", "healthy"]);
    r.h.stop();
  });

  it("never opens for an adapter whose type has no circuit", async () => {
    const r = await healthy({ circuit: false });
    for (let i = 0; i < 20; i++) r.end(failed("provider_error"));
    expect(r.h.status().healthy).toBe(true);
    expect(r.h.admitCall()).toEqual({ allowed: true, trial: false });
  });
});

describe("AdapterHealth's failed attempts (provider-adapter.md §6 item 4; §2.5's auth row)", () => {
  it("reads auth on a paid adapter as credentials, at once, until a probe passes", async () => {
    const r = await healthy();
    r.h.callFailed(new ProviderError("auth", false, false));
    expect(r.h.status()).toMatchObject({ healthy: false, reason: "credentials" });
    expect(r.reasons).toEqual(["credentials"]);
    await r.probe();
    expect(r.h.status().healthy).toBe(true);
  });

  it("leaves a local adapter's health alone on auth, and any adapter's on the kinds only the circuit counts", async () => {
    const local = await healthy({ kind: "local", circuit: false });
    local.h.callFailed(new ProviderError("auth", false, false));
    expect(local.h.status().healthy).toBe(true);
    const paid = await healthy();
    for (const kind of ["rate_limited", "provider_error", "bad_request", "content_filtered"] as const) {
      paid.h.callFailed(new ProviderError(kind, kind !== "bad_request", false));
      local.h.callFailed(new ProviderError(kind, kind !== "bad_request", false));
    }
    expect([paid.h.status().healthy, local.h.status().healthy]).toEqual([true, true]);
  });
});

describe("the circuit around Bedrock's calls (gateway-http.md §2.4 step 5.6; alerts.md §2; operator-admin.md §5)", () => {
  let config: LoadedConfig;
  beforeAll(async () => {
    config = await loadConfig(FIXTURES, { allowPlanned: false });
  });

  const PRICE: PriceVersion = {
    id: "2026-10-08.1",
    effectiveFrom: Date.parse("2026-10-08T00:00:00Z"),
    source: "the circuit test: a made-up Bedrock price",
    entries: [
      {
        provider: "aws.bedrock",
        model: MODEL,
        input: 1_000_000n,
        output: 5_000_000n,
        cacheReadInput: 1_000_000n,
        placeholders: [],
      },
    ],
  };
  const normal: StateRead = {
    kind: "ok",
    state: "normal",
    since: new Date(T0),
    crossed: [],
    fallbackAwaitingRenewal: false,
    fallbackAwaitingSince: null,
    testClockOffsetMs: null,
  };

  /** A paid adapter's scripted end: an answer, an error, or a call that waits for its signal and then times out. */
  type Next = AdapterResult | ProviderError | Promise<AdapterResult> | "hang";

  /** prod's route: a local adapter that never passed a probe, and a Bedrock-like paid fallback with routing.yaml's circuit. */
  function rig() {
    const clock = { now: T0 };
    const next: Next[] = [];
    let calls = 0;
    const paid: ProviderAdapter = {
      id: "bedrock",
      type: "bedrock-converse",
      provider: "aws.bedrock",
      kind: "paid",
      model: MODEL,
      server: { address: "bedrock-runtime.us-east-1.amazonaws.com", port: 443 },
      retry: { on: [], max: 0, backoffMs: 0 },
      complete: async (req) => {
        calls += 1;
        const n = next.shift() ?? answer;
        if (n === "hang") {
          return new Promise<AdapterResult>((_, reject) =>
            req.signal.addEventListener("abort", () => reject(new ProviderError("timeout", true, true))),
          );
        }
        if (n instanceof ProviderError) throw n;
        return n;
      },
      health: async () => ({ healthy: true, checkedAt: new Date(clock.now).toISOString() }),
    };
    const local: ProviderAdapter = {
      ...paid,
      id: "local",
      type: "openai-compatible",
      provider: "local",
      kind: "local",
      model: "stand-in",
      server: { address: "model-server", port: 8080 },
      complete: async () => {
        throw new Error("local is unhealthy: never called");
      },
      health: async () => ({ healthy: false, checkedAt: new Date(clock.now).toISOString(), reason: "unreachable" }),
    };
    const bedrockConfig: AdapterConfig = {
      id: "bedrock",
      type: "bedrock-converse",
      kind: "paid",
      provider: "aws.bedrock",
      settings: {
        timeouts: { connect_ms: 1_000, request_ms: 4_000 },
        retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
        circuit: { failures: 3, open_s: 30 },
        health: { interval_ms: 10_000 },
        credentials_warn_before_s: 7_200,
      },
      spec: ADAPTER_TYPE_SPECS.get("bedrock-converse") as AdapterTypeSpec,
      placeholders: [],
    };
    // Admission as data-model.md §7.2 step 5 has it, for what this test needs: a fallback call needs a healthy
    // adapter; a test call goes by the ceilings alone, which these calls never reach. A test can queue a refusal
    // for another cause, or a throw, for the next admission.
    const admits: AdmitRequest[] = [];
    const meterNext: ("refuse" | "throw")[] = [];
    const meter: MeterPort = {
      admit: async (r): Promise<AdmitResult> => {
        admits.push(r);
        const queued = meterNext.shift();
        if (queued === "throw") throw new Error("the store failed under admission");
        if (queued === "refuse") return { ok: false, refusal: "degraded", decision: degraded("meter_at_ceiling") };
        if (r.attribution === "fallback" && !r.adapterHealthy) {
          return { ok: false, refusal: "degraded", decision: degraded("fallback_unavailable") };
        }
        return {
          ok: true,
          admitted: {
            reservationId: "6f0f3a3e-29d8-4c9c-a6f5-0cbbd0f3e0a1",
            attribution: r.attribution,
            adapterId: r.adapter.id,
            provider: r.adapter.provider,
            model: r.adapter.model,
            price: PRICE,
            maxMicro: 3_000n,
            periodDay: "2026-10-29",
            periodMonth: "2026-10",
            createdAt: T0,
            expiresAt: T0 + 120_000,
            retryUntil: T0 + 120_000,
            requestId: r.requestId,
            traceId: r.traceId,
            purpose: r.purpose,
            routeReason: r.routeReason,
            routingSha: "ab".repeat(32),
          },
        };
      },
      settle: async () => ({ committed: true, costMicro: 0n }),
      counters: () => ({ inFlight: 0, lastMinute: 0 }),
      start: () => {},
      stop: async () => {},
    };
    const store = {
      readStackState: async () => normal,
      outageStartedAt: () => undefined,
      query: async () => ({ rows: [] }),
      readMeters: async () => [],
    } as unknown as Store;
    const fixture = config.routing?.adapters.get("local");
    if (!config.routing || !config.prices || !config.budgets || !fixture) throw new Error("fixtures");
    const g = new Gateway({
      stack: "prod",
      envClass: "prod",
      version: "0.1.0",
      routing: config.routing,
      prices: config.prices,
      budgets: config.budgets,
      adapters: [
        { role: "primary", config: fixture, adapter: local },
        { role: "fallback", config: bedrockConfig, adapter: paid },
      ],
      store,
      clock: new GatewayClock(),
      tracer: trace.getTracer("test"),
      metrics: new GatewayMetrics(metrics.getMeter("test")),
      logger: { info() {}, warn() {}, error() {} },
      payloadSampling: false,
      testMachinery: { clock: false, synthetic: false },
      meter,
      realNow: () => clock.now,
    });
    const alerts: string[] = [];
    g.onFallbackUnavailable = (adapter, reason) => void alerts.push(`${adapter} ${reason}`);
    const bedrock = () => g.routedAdapters().find((a) => a.id === "bedrock")?.health;
    const call = (signal = new AbortController().signal): GatewayCall => ({
      requestId: "cd".repeat(16),
      purpose: "hello",
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 128,
      arrivedAt: clock.now,
      signal,
    });
    return { g, clock, next, calls: () => calls, admits, meterNext, alerts, bedrock, call };
  }

  /** Three provider errors in a row: each fallback call fails, and the third opens the circuit. */
  async function opened(r: ReturnType<typeof rig>) {
    await r.g.probeAll(); // Bedrock passes its one probe; local never does
    for (let i = 0; i < 3; i++) {
      r.next.push(new ProviderError("provider_error", true, false));
      expect(await r.g.complete(r.call())).toMatchObject({
        kind: "degraded",
        decision: { cause: "fallback_unavailable" },
      });
    }
    expect(r.bedrock()).toMatchObject({ healthy: false, reason: "circuit_open" });
    expect(r.alerts).toEqual(["bedrock circuit_open"]);
  }

  /** opened(), then open_s later: half-open. */
  async function halfOpen(r: ReturnType<typeof rig>) {
    await opened(r);
    r.clock.now += 30_000;
    expect(r.bedrock()).toMatchObject({ healthy: true });
  }

  it("refuses fallback calls while it's open, without calling Bedrock, as fallback_unavailable", async () => {
    const r = rig();
    await opened(r);
    r.clock.now += 10_000;
    const a = await r.g.complete(r.call());
    expect(a).toMatchObject({ kind: "degraded", decision: { cause: "fallback_unavailable" } });
    expect(r.calls()).toBe(3);
    // Admission's `since` is when the circuit opened (admission.ts builds it from this).
    expect(r.admits.at(-1)).toMatchObject({
      attribution: "fallback",
      adapterHealthy: false,
      adapterUnhealthySince: T0,
    });
    expect(r.alerts).toEqual(["bedrock circuit_open"]);
  });

  it("reads healthy after open_s, admits the first fallback call as the trial, and closes on its success", async () => {
    const r = rig();
    await halfOpen(r);
    const a = await r.g.complete(r.call());
    expect(a).toMatchObject({ kind: "answered", route: "fallback", routeReason: "local_unhealthy" });
    expect(r.calls()).toBe(4);
    expect(r.admits.at(-1)).toMatchObject({ attribution: "fallback", adapterHealthy: true });
    expect(r.admits.at(-1)).not.toHaveProperty("adapterUnhealthySince");
    expect(r.bedrock()).toMatchObject({ healthy: true });
  });

  it("reopens on a failed trial, unhealthy again, and refuses until another open_s has passed", async () => {
    const r = rig();
    await halfOpen(r);
    r.next.push(new ProviderError("provider_error", true, false));
    expect(await r.g.complete(r.call())).toMatchObject({ kind: "degraded" });
    expect(r.bedrock()).toMatchObject({ healthy: false, reason: "circuit_open" });
    // The flip back raises the hook again; the outbox's hourly key holds the alert to one an hour (alerts.md §2).
    expect(r.alerts).toEqual(["bedrock circuit_open", "bedrock circuit_open"]);
    r.clock.now += 29_999;
    expect(await r.g.complete(r.call())).toMatchObject({ kind: "degraded" });
    expect(r.calls()).toBe(4);
    r.clock.now += 1;
    expect(await r.g.complete(r.call())).toMatchObject({ kind: "answered" });
  });

  it("lets only one call through while the trial is out", async () => {
    const r = rig();
    await halfOpen(r);
    let release: (x: AdapterResult) => void = () => {};
    r.next.push(new Promise<AdapterResult>((resolve) => (release = resolve)));
    const trial = r.g.complete(r.call());
    await new Promise((resolve) => setImmediate(resolve));
    expect(await r.g.complete(r.call())).toMatchObject({
      kind: "degraded",
      decision: { cause: "fallback_unavailable" },
    });
    expect((await r.g.report()).degraded_cause).toBe("fallback_unavailable"); // the dry run sees the trial out
    expect(r.calls()).toBe(4);
    release(answer);
    expect(await trial).toMatchObject({ kind: "answered" });
    expect(r.bedrock()?.healthy).toBe(true);
  });

  it("gives the trial back when admission refuses it for another cause, or throws", async () => {
    const r = rig();
    await halfOpen(r);
    r.meterNext.push("refuse");
    expect(await r.g.complete(r.call())).toMatchObject({ kind: "degraded", decision: { cause: "meter_at_ceiling" } });
    r.meterNext.push("throw");
    await expect(r.g.complete(r.call())).rejects.toThrow("the store failed under admission");
    expect(r.calls()).toBe(3);
    expect(await r.g.complete(r.call())).toMatchObject({ kind: "answered" }); // the trial, given back twice
    expect(r.calls()).toBe(4);
  });

  it("gives the trial back when its caller goes away, and counts nothing against the adapter", async () => {
    const r = rig();
    await halfOpen(r);
    r.next.push("hang");
    const gone = new AbortController();
    const pending = r.g.complete(r.call(gone.signal));
    await new Promise((resolve) => setImmediate(resolve));
    gone.abort();
    expect(await pending).toMatchObject({ kind: "degraded" });
    expect(r.bedrock()).toMatchObject({ healthy: true }); // still half-open, not reopened
    expect(await r.g.complete(r.call())).toMatchObject({ kind: "answered" });
    expect(r.calls()).toBe(5);
  });

  it("doesn't spend the trial on a live endpoint's test call", async () => {
    const r = rig();
    await halfOpen(r);
    r.next.push(new ProviderError("bad_request", false, false)); // an end the circuit doesn't count
    expect(await r.g.adapterCall(r.call(), "bedrock")).toMatchObject({ kind: "called", outcome: { ok: false } });
    const a = await r.g.complete(r.call());
    expect(a).toMatchObject({ kind: "answered" });
    expect(r.admits.at(-1)).toMatchObject({ attribution: "fallback", adapterHealthy: true });
  });

  it("counts the live endpoint's calls, which an open circuit doesn't hold: a success closes it", async () => {
    const r = rig();
    await opened(r);
    const a = await r.g.adapterCall(r.call(), "bedrock");
    expect(a).toMatchObject({ kind: "called", attribution: "test", outcome: { ok: true } });
    expect(r.calls()).toBe(4);
    expect(r.bedrock()).toMatchObject({ healthy: true });
  });

  it("reads open, then half-open, in GET /health's dry run", async () => {
    const r = rig();
    await opened(r);
    expect((await r.g.report()).degraded_cause).toBe("fallback_unavailable");
    r.clock.now += 30_000;
    const report = await r.g.report();
    expect(report.degraded_cause).toBeNull();
    expect(report.adapters.find((x) => x.id === "bedrock")).toMatchObject({ healthy: true });
  });
});
