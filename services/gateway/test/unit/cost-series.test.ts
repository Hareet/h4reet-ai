// The cost series' zeros at start (contracts/telemetry.md §4.1; tasks.md T191): a metered call's h4.cost.usd series
// is first written at its commit, with its cost, and Prometheus ingests no zero at a series' start, so the gateway
// writes a zero on each series a routed metered adapter can be charged under when it starts. An in-memory metric
// exporter, stand-in adapters, a stand-in store, and a stand-in meter: no network, no Postgres, no AWS.
import { fileURLToPath } from "node:url";

import { trace } from "@opentelemetry/api";
import { metrics as sdkMetrics } from "@opentelemetry/sdk-node";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ADAPTER_TYPE_SPECS, type AdapterTypeSpec } from "../../src/adapters/_settings.js";
import type { BuiltAdapter } from "../../src/adapters/registry.js";
import { loadConfig, type AdapterConfig, type LoadedConfig } from "../../src/config/validate.js";
import { GatewayClock } from "../../src/core/clock.js";
import { Gateway } from "../../src/core/gateway.js";
import type { AdapterKind, ProviderAdapter } from "../../src/core/types.js";
import type { Store } from "../../src/meter/store.js";
import type { MeterPort } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const MODEL = "us.anthropic.claude-test-v1:0";
const { AggregationTemporality, InMemoryMetricExporter, MeterProvider } = sdkMetrics;

let config: LoadedConfig;
beforeAll(async () => {
  config = await loadConfig(FIXTURES, { allowPlanned: false });
});

const running: { g: Gateway; provider: InstanceType<typeof MeterProvider> }[] = [];
afterEach(async () => {
  for (const r of running.splice(0)) {
    await r.g.close();
    await r.provider.shutdown();
  }
});

function adapter(o: { id: string; kind: AdapterKind; provider: string; model: string }): ProviderAdapter {
  return {
    id: o.id,
    type: o.kind === "local" ? "openai-compatible" : o.kind === "paid" ? "bedrock-converse" : "synthetic",
    provider: o.provider,
    kind: o.kind,
    model: o.model,
    server: { address: "stand-in" },
    retry: { on: [], max: 0, backoffMs: 0 },
    complete: async () => {
      throw new Error("not called");
    },
    health: async () => ({ healthy: true, checkedAt: new Date().toISOString() }),
  };
}

const settingsOf: Record<string, Record<string, unknown>> = {
  "bedrock-converse": {
    timeouts: { connect_ms: 1_000, request_ms: 4_000 },
    retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
    circuit: { failures: 3, open_s: 30 },
    health: { interval_ms: 10_000 },
    credentials_warn_before_s: 7_200,
  },
  synthetic: { model: "metered-test", output_tokens: 1_000 },
};

/** A started gateway on its route, with its metrics on an in-memory exporter, and nothing called yet. */
function started(fallback?: { kind: "paid" | "synthetic" }) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const provider = new MeterProvider({ readers: [reader] });
  const fixture = config.routing?.adapters.get("local");
  if (!config.routing || !config.prices || !config.budgets || !fixture) throw new Error("fixtures");
  const adapters: BuiltAdapter[] = [
    {
      role: "primary",
      config: fixture,
      adapter: adapter({ id: "local", kind: "local", provider: "local", model: "m" }),
    },
  ];
  if (fallback !== undefined) {
    const paid = fallback.kind === "paid";
    const type = paid ? "bedrock-converse" : "synthetic";
    const fallbackConfig: AdapterConfig = {
      id: paid ? "bedrock" : "synthetic",
      type,
      kind: fallback.kind,
      provider: paid ? "aws.bedrock" : "synthetic",
      settings: settingsOf[type] as Record<string, unknown>,
      spec: ADAPTER_TYPE_SPECS.get(type) as AdapterTypeSpec,
      placeholders: [],
    };
    adapters.push({
      role: "fallback",
      config: fallbackConfig,
      adapter: adapter({
        id: fallbackConfig.id,
        kind: fallback.kind,
        provider: fallbackConfig.provider,
        model: paid ? MODEL : "metered-test",
      }),
    });
  }
  const meter: MeterPort = {
    admit: async () => {
      throw new Error("not called");
    },
    settle: async () => {
      throw new Error("not called");
    },
    counters: () => ({ inFlight: 0, lastMinute: 0 }),
    start: () => {},
    stop: async () => {},
  };
  const g = new Gateway({
    stack: fallback?.kind === "synthetic" ? "dev" : "prod",
    envClass: fallback?.kind === "synthetic" ? "dev" : "prod",
    version: "0.1.0",
    routing: config.routing,
    prices: config.prices,
    budgets: config.budgets,
    adapters,
    store: {
      readStackState: async () => ({ kind: "uninitialized" }),
      outageStartedAt: () => undefined,
      readMeters: async () => [],
    } as unknown as Store,
    clock: new GatewayClock(),
    tracer: trace.getTracer("test"),
    metrics: new GatewayMetrics(provider.getMeter("gateway")),
    logger: { info() {}, warn() {}, error() {} },
    payloadSampling: false,
    testMachinery: { clock: false, synthetic: fallback?.kind === "synthetic" },
    ...(fallback === undefined ? {} : { meter }),
  });
  g.start();
  running.push({ g, provider });
  /** h4.cost.usd's points, as [provider, model, attribution, value]. */
  const costPoints = async () => {
    const { resourceMetrics, errors } = await reader.collect();
    expect(errors).toEqual([]);
    const cost = resourceMetrics.scopeMetrics
      .flatMap((s) => s.metrics)
      .find((m) => m.descriptor.name === "h4.cost.usd");
    return (cost?.dataPoints ?? []).map((p) => [
      p.attributes["gen_ai.provider.name"],
      p.attributes["gen_ai.request.model"],
      p.attributes["h4.meter.attribution"],
      p.value,
    ]);
  };
  return { g, costPoints };
}

describe("h4.cost.usd's series at the gateway's start (telemetry.md §4.1; tasks.md T191)", () => {
  it("are written at zero for prod's Bedrock fallback, under fallback and test, before any call", async () => {
    const { costPoints } = started({ kind: "paid" });
    expect(await costPoints()).toEqual([
      ["aws.bedrock", MODEL, "fallback", 0],
      ["aws.bedrock", MODEL, "test", 0],
    ]);
  });

  it("are written at zero for dev's synthetic fallback, under fallback and metered", async () => {
    const { costPoints } = started({ kind: "synthetic" });
    expect(await costPoints()).toEqual([
      ["synthetic", "metered-test", "fallback", 0],
      ["synthetic", "metered-test", "metered", 0],
    ]);
  });

  it("aren't written for a route with no metered adapter, and a second start writes nothing more", async () => {
    const local = started();
    expect(await local.costPoints()).toEqual([]);
    const prod = started({ kind: "paid" });
    prod.g.start();
    expect(await prod.costPoints()).toHaveLength(2);
  });
});
