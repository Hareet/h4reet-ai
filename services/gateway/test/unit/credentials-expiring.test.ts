// The credentials_expiring alert's trigger (alerts.md §2; provider-adapter.md §3.2's health cadence; tasks.md T102):
// the probe's credentialsExpireAt reaches the adapter's effective health, and the 10 s ticker's check fires once per
// SSO session end, credentials_warn_before_s (2 h) before it, for a routed paid adapter alone. A stand-in store and
// stand-in adapters: no network, no Postgres, no AWS.
import { fileURLToPath } from "node:url";

import { metrics, trace } from "@opentelemetry/api";
import { beforeAll, describe, expect, it } from "vitest";

import { ADAPTER_TYPE_SPECS, type AdapterTypeSpec } from "../../src/adapters/_settings.js";
import type { BuiltAdapter } from "../../src/adapters/registry.js";
import { loadConfig, type AdapterConfig, type LoadedConfig } from "../../src/config/validate.js";
import { GatewayClock } from "../../src/core/clock.js";
import { AdapterHealth, Gateway } from "../../src/core/gateway.js";
import type { HealthStatus, ProviderAdapter } from "../../src/core/types.js";
import type { Store } from "../../src/meter/store.js";
import type { MeterPort } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const HOUR = 3_600_000;
const END = Date.parse("2026-10-29T18:00:00.000Z");

/** An adapter whose next probe answers `next`. */
function probed(o: { id: string; kind: "local" | "paid"; type: string }): ProviderAdapter & { next: HealthStatus } {
  const adapter = {
    id: o.id,
    type: o.type,
    provider: o.kind === "paid" ? "aws.bedrock" : "local",
    kind: o.kind,
    model: "stand-in",
    server: { address: "stand-in" },
    retry: { on: [], max: 0, backoffMs: 0 },
    next: { healthy: true, checkedAt: new Date(END - 3 * HOUR).toISOString() } as HealthStatus,
    complete: async () => {
      throw new Error("not called");
    },
    health: async (): Promise<HealthStatus> => adapter.next,
  };
  return adapter as ProviderAdapter & { next: HealthStatus };
}

describe("AdapterHealth keeps the probe's credentialsExpireAt (provider-adapter.md §2.4)", () => {
  it("reports it with the effective health, and drops it when a probe stops naming one", async () => {
    const adapter = probed({ id: "bedrock", kind: "paid", type: "bedrock-converse" });
    const health = new AdapterHealth(
      adapter,
      { intervalMs: 10_000, timeoutMs: 1_000, unhealthyAfter: 1, healthyAfter: 1 },
      {
        realNow: Date.now,
        onChange: () => {},
      },
    );
    adapter.next = {
      healthy: true,
      checkedAt: new Date().toISOString(),
      credentialsExpireAt: new Date(END).toISOString(),
    };
    await health.probe();
    expect(health.status().credentialsExpireAt).toBe("2026-10-29T18:00:00.000Z");
    adapter.next = { healthy: false, checkedAt: new Date().toISOString(), reason: "credentials" };
    await health.probe();
    expect(health.status()).not.toHaveProperty("credentialsExpireAt");
  });
});

describe("the 10 s ticker's credentials check (alerts.md §2)", () => {
  let config: LoadedConfig;
  beforeAll(async () => {
    config = await loadConfig(FIXTURES, { allowPlanned: false });
  });

  const bedrockConfig = (): AdapterConfig => ({
    id: "bedrock",
    type: "bedrock-converse",
    kind: "paid",
    provider: "aws.bedrock",
    settings: { credentials_warn_before_s: 7_200, health: { interval_ms: 10_000 } },
    spec: ADAPTER_TYPE_SPECS.get("bedrock-converse") as AdapterTypeSpec,
    placeholders: [],
  });

  function rig() {
    const clock = { now: END - 3 * HOUR };
    const local = probed({ id: "local", kind: "local", type: "openai-compatible" });
    const bedrock = probed({ id: "bedrock", kind: "paid", type: "bedrock-converse" });
    const fixture = config.routing?.adapters.get("local");
    if (!config.routing || !config.prices || !config.budgets || !fixture) throw new Error("fixtures");
    const built: BuiltAdapter[] = [
      { role: "primary", config: fixture, adapter: local },
      { role: "fallback", config: bedrockConfig(), adapter: bedrock },
    ];
    const gateway = new Gateway({
      stack: "prod",
      envClass: "prod",
      version: "0.1.0",
      routing: config.routing,
      prices: config.prices,
      budgets: config.budgets,
      adapters: built,
      store: {
        readStackState: async () => ({ kind: "uninitialized" }),
        outageStartedAt: () => undefined,
      } as unknown as Store,
      clock: new GatewayClock(),
      tracer: trace.getTracer("test"),
      metrics: new GatewayMetrics(metrics.getMeter("test")),
      logger: { info() {}, warn() {}, error() {} },
      payloadSampling: false,
      testMachinery: { clock: false, synthetic: false },
      // The route has a fallback, which needs a meter; these tests never call through it.
      meter: new Proxy(
        {},
        {
          get: () => () => {
            throw new Error("the meter isn't used here");
          },
        },
      ) as MeterPort,
      realNow: () => clock.now,
    });
    const fired: [string, string, number][] = [];
    gateway.onCredentialsExpiring = (adapter, label, endsAt) => void fired.push([adapter, label, endsAt]);
    const probeWith = async (endsAt: number | undefined) => {
      for (const a of [local, bedrock]) {
        a.next = {
          healthy: true,
          checkedAt: new Date(clock.now).toISOString(),
          ...(endsAt === undefined || a === local ? {} : { credentialsExpireAt: new Date(endsAt).toISOString() }),
        };
      }
      await gateway.probeAll();
    };
    return { gateway, clock, fired, probeWith };
  }

  it("fires once per session end, from 2 h before it, naming the adapter by its type's label", async () => {
    const r = rig();
    await r.probeWith(END);
    r.gateway.checkCredentials(); // 3 h before: not yet
    expect(r.fired).toEqual([]);
    r.clock.now = END - 2 * HOUR; // the warning's lead time
    r.gateway.checkCredentials();
    r.clock.now += 10_000; // the next tick asks again; one alert per session end
    r.gateway.checkCredentials();
    expect(r.fired).toEqual([["bedrock", "Bedrock", END]]);
  });

  it("fires again for a new session, after make aws-login, and never once the session has ended", async () => {
    const r = rig();
    await r.probeWith(END);
    r.clock.now = END - HOUR;
    r.gateway.checkCredentials();
    const renewed = END + 8 * HOUR;
    await r.probeWith(renewed);
    r.clock.now = renewed - HOUR;
    r.gateway.checkCredentials();
    expect(r.fired.map(([, , endsAt]) => endsAt)).toEqual([END, renewed]);
    const ended = rig();
    await ended.probeWith(END);
    ended.clock.now = END + 1;
    ended.gateway.checkCredentials();
    expect(ended.fired).toEqual([]);
  });

  it("asks nothing of an adapter that reports no session end", async () => {
    const r = rig();
    await r.probeWith(undefined);
    r.clock.now = END;
    r.gateway.checkCredentials();
    expect(r.fired).toEqual([]);
  });
});
