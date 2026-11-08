// The adapter month (spec 010, FR-020 to FR-023, SC-004; plan §4.4; tasks.md T009; data-model.md §2.3, §7.2, §7.3), on
// PGlite, with the journal in a fresh state directory and the test clock: a capped paid adapter's spend per UTC
// month, its own meter beside day, month, and fallback_day. The adapter here is "anthropic" at a made-up price, $0.10 a
// call, under a $1.00 cap with a 70% warning at $0.70; the day's $5 ceiling and the $2 sub-budget stay out of reach.
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { metrics as otelMetrics } from "@opentelemetry/api";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig, type LoadedConfig } from "../../src/config/validate.js";
import { dayKey, GatewayClock, monthKey } from "../../src/core/clock.js";
import type { AdapterResult } from "../../src/core/types.js";
import { initializeStore } from "../../src/meter/init.js";
import { Journal } from "../../src/meter/journal.js";
import { Meter } from "../../src/meter/meter.js";
import { renewFallback } from "../../src/meter/operator.js";
import { readMigrations, Store } from "../../src/meter/store.js";
import type { AdmitRequest, AdmitResult, Admitted, CallEnd } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { testDatabase, type TestDatabase } from "../helpers/pglite.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const HEX64 = "ab".repeat(32);
const T0 = Date.parse("2026-11-20T08:00:00.000Z");
const DAY = dayKey(T0);
const MONTH = monthKey(T0);
const ACTOR = "operator:dev#abcdef01";
const OPERATOR = { actor: ACTOR, fingerprint: "abcdef01" };
const KEY = `anthropic:${MONTH}`;

type Rec = Record<string, unknown>;

const ROUTING = `schema: 1
deadline_ms: 20000
adapters:
  local:
    type: openai-compatible
    kind: local
    provider: local
    base_url_env: LOCAL_MODEL_BASE_URL
    model_env: LOCAL_MODEL_NAME
    timeouts: { connect_ms: 1000, request_ms: 10000 }
    health: { path: /models, interval_ms: 1000, timeout_ms: 800, unhealthy_after: 1, healthy_after: 3 }
  anthropic:
    type: anthropic-messages
    kind: paid
    model: claude-haiku-5-5
    api_key_env: GATEWAY_ANTHROPIC_API_KEY
    thinking: disabled
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: 4000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 250 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 60000 }
  synthetic:
    type: synthetic
    kind: synthetic
    model: metered-test
    output_tokens: 1000
envs:
  prod: { primary: local, fallback: anthropic }
  dev: { primary: local, fallback: synthetic }
`;
const PRICES = `schema: 1
currency: USD
unit: per_million_tokens
versions:
  - id: "2026-11-01.1"
    effective_from: "2026-11-01T00:00:00Z"
    source: "the adapter-month test: a made-up price, $0.10 a call"
    entries:
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: anthropic
        model: claude-haiku-5-5
        input: 1
        output: 100
      - provider: synthetic
        model: metered-test
        input: 0
        output: 100
`;
const BUDGETS = `schema: 1
timing:
  timezone: UTC
  reservation_ttl_s: 120
envs:
  prod:
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00
    warn_ratio: 0.70
    adapter_monthly_usd: { anthropic: 1.00 }
  dev:
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00
    warn_ratio: 0.70
    adapter_monthly_usd: { anthropic: 1.00 }
limits:
  per_client: { requests_per_minute: 20, burst: 5, requests_per_day: 500, metered_in_flight: 1 }
  global: { metered_in_flight: 4, metered_per_minute: 60 }
  per_call: { max_input_chars: 2000, hello_max_output_tokens: 128, max_output_tokens: 512 }
`;

interface Rig {
  db: TestDatabase;
  store: Store;
  meter: Meter;
  journal: Journal;
  stateDir: string;
  config: LoadedConfig;
  clock: { now: number };
  metrics: GatewayMetrics;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function configDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "h4-adapter-month-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "routing.yaml"), ROUTING);
  await writeFile(join(dir, "prices.yaml"), PRICES);
  await writeFile(join(dir, "budgets.yaml"), BUDGETS);
  await copyFile(join(FIXTURES, "alerts.yaml"), join(dir, "alerts.yaml"));
  return dir;
}

async function rig(
  o: { stateDir?: string; state?: "normal" | "none"; fallbackAdapterId?: string; clock?: { now: number } } = {},
): Promise<Rig> {
  const clock = o.clock ?? { now: T0 };
  const realNow = () => clock.now;
  const quiet = { info() {}, warn() {}, error() {}, fatal() {} };
  const db = await testDatabase();
  const store = new Store({
    db,
    migrations: await readMigrations(),
    envClass: "dev",
    logger: quiet,
    onFatal: () => {},
    realNow,
  });
  await store.start();
  const stateDir = o.stateDir ?? (await mkdtemp(join(tmpdir(), "h4-adapter-month-state-")));
  if (o.stateDir === undefined) cleanups.push(() => rm(stateDir, { recursive: true, force: true }));
  const journal = new Journal({ stateDir, stack: "dev", realNow });
  const config = await loadConfig(await configDir(), { allowPlanned: false });
  expect(config.issues.filter((i) => i.severity === "error")).toEqual([]);
  if (!config.budgets || !config.alerts || !config.prices) throw new Error("config");
  const metrics = new GatewayMetrics(otelMetrics.getMeter("adapter-month-test"));
  const meter = new Meter({
    stack: "dev",
    envClass: "dev",
    budgets: config.budgets,
    alerts: config.alerts,
    prices: config.prices,
    routingSha: HEX64,
    store,
    journal,
    clock: new GatewayClock(realNow),
    metrics,
    logger: quiet,
    realNow,
    hasFallback: true,
    fallbackAdapterId: o.fallbackAdapterId ?? "anthropic",
    commitRetryMs: 20,
  });
  cleanups.push(async () => {
    await meter.stop();
    await store.close();
  });
  if ((o.state ?? "normal") === "normal") {
    await db.pg.query(
      `INSERT INTO gateway.stack_state (id, stack, env, state, since, crossed, fallback_awaiting_renewal,
         fallback_awaiting_since, initialized_at, initialized_by, test_clock_offset_ms, updated_at)
       VALUES (1, 'dev', 'dev', 'normal', $1, '{}', false, NULL, $1, $2, NULL, $1)`,
      [new Date(T0 - 3_600_000).toISOString(), ACTOR],
    );
  }
  return { db, store, meter, journal, stateDir, config, clock, metrics };
}

const trace = (): string => randomBytes(16).toString("hex");

function request(o: Partial<AdmitRequest> = {}): AdmitRequest {
  return {
    attribution: "fallback",
    adapter: {
      id: "anthropic",
      provider: "anthropic",
      model: "claude-haiku-5-5",
      fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
    },
    adapterHealthy: true,
    maxOutputTokens: 128,
    requestId: trace(),
    traceId: trace(),
    purpose: "hello",
    routeReason: "local_unhealthy",
    ...o,
  };
}

function answered(r: Rig): CallEnd {
  const result: AdapterResult = {
    text: "an answer",
    usage: { inputTokens: 0, outputTokens: 1_000 },
    finishReason: "stop",
    responseModel: "claude-haiku-5-5",
    latencyMs: 3,
  };
  return { attempts: [{ outcome: "ok", result, startedAt: r.clock.now, endedAt: r.clock.now + 3 }] };
}

function admitted(result: AdmitResult): Admitted {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.admitted;
}

const refusal = (result: AdmitResult): string | undefined =>
  !result.ok && result.refusal === "degraded" ? result.decision.cause : undefined;

/** n calls of $0.10 each, admitted and committed one at a time. */
async function spend(r: Rig, n: number, o: Partial<AdmitRequest> = {}): Promise<void> {
  for (let i = 0; i < n; i++) {
    const a = admitted(await r.meter.admit(request(o)));
    expect(await r.meter.settle(a, answered(r))).toEqual({ committed: true, costMicro: 100_000n });
    r.clock.now += 1_000;
  }
}

async function row(r: Rig, meter: string, periodKey: string): Promise<Rec | undefined> {
  const { rows } = await r.db.pg.query<Rec>(
    "SELECT spent_micro::text AS spent, reserved_micro::text AS reserved, warned_at, reached_at FROM gateway.meters WHERE meter = $1 AND period_key = $2",
    [meter, periodKey],
  );
  return rows[0];
}
const outbox = async (r: Rig): Promise<Rec[]> =>
  (await r.db.pg.query<Rec>("SELECT dedupe_key, kind FROM gateway.alert_outbox ORDER BY id")).rows;
const audit = async (r: Rig): Promise<Rec[]> =>
  (await r.db.pg.query<Rec>("SELECT action, before, after, detail FROM gateway.audit_log ORDER BY id")).rows;
const flag = async (r: Rig): Promise<Rec | undefined> =>
  (
    await r.db.pg.query<Rec>(
      "SELECT state, fallback_awaiting_renewal AS awaiting, fallback_awaiting_since AS since FROM gateway.stack_state",
    )
  ).rows[0];

describe("the rows a call to a capped adapter touches (FR-020, FR-022)", () => {
  it("a fallback call reserves against and commits to the adapter's month, as well as day, month, and fallback_day", async () => {
    const r = await rig();
    const a = admitted(await r.meter.admit(request()));
    for (const [meter, key] of [
      ["day", DAY],
      ["month", MONTH],
      ["fallback_day", DAY],
      ["adapter_month", KEY],
    ]) {
      expect(await row(r, meter as string, key as string)).toMatchObject({ spent: "0", reserved: "100000" });
    }
    await r.meter.settle(a, answered(r));
    for (const [meter, key] of [
      ["day", DAY],
      ["month", MONTH],
      ["fallback_day", DAY],
      ["adapter_month", KEY],
    ]) {
      expect(await row(r, meter as string, key as string)).toMatchObject({ spent: "100000", reserved: "0" });
    }
    const { rows } = await r.db.pg.query<Rec>("SELECT count(*)::int AS n FROM gateway.reservations");
    expect(rows[0]?.n).toBe(0);
  });

  it("a test call counts toward the adapter's month too, but not toward fallback_day", async () => {
    const r = await rig();
    await spend(r, 1, { attribution: "test", purpose: "contract", routeReason: null });
    expect(await row(r, "adapter_month", KEY)).toMatchObject({ spent: "100000", reserved: "0" });
    expect((await row(r, "fallback_day", DAY))?.spent ?? "0").toBe("0");
  });

  it("an uncapped adapter has no month row", async () => {
    const r = await rig();
    await spend(r, 1, {
      adapter: {
        id: "synthetic",
        provider: "synthetic",
        model: "metered-test",
        fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
      },
      purpose: "synthetic",
    });
    const { rows } = await r.db.pg.query<Rec>("SELECT period_key FROM gateway.meters WHERE meter = 'adapter_month'");
    expect(rows).toEqual([]);
  });
});

describe("admission at the cap (FR-022)", () => {
  it("refuses with adapter_month_spent once spend plus reservations reaches the cap, fallback and test alike", async () => {
    const r = await rig();
    await spend(r, 9);
    const held = admitted(await r.meter.admit(request())); // $0.90 spent + $0.10 reserved = the cap
    expect(refusal(await r.meter.admit(request()))).toBe("adapter_month_spent");
    expect(refusal(await r.meter.admit(request({ attribution: "test", purpose: "contract", routeReason: null })))).toBe(
      "adapter_month_spent",
    );
    await r.meter.settle(held, answered(r));
    const result = await r.meter.admit(request());
    expect(refusal(result)).toBe("adapter_month_spent");
    if (!result.ok && result.refusal === "degraded") {
      expect(result.decision.detail).toBe(
        "The local model is unavailable, and the paid fallback has reached its monthly cap.",
      );
      expect(result.decision.since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
    expect((await flag(r))?.state).toBe("normal"); // local answers go on: the kill switch never trips
  });

  it("comes after meter_at_ceiling and before the sub-budget's causes", async () => {
    const r = await rig();
    await spend(r, 1);
    await r.db.pg.query("UPDATE gateway.meters SET spent_micro = 1000000 WHERE meter = 'adapter_month'");
    await r.db.pg.query("UPDATE gateway.meters SET spent_micro = 5000000 WHERE meter = 'day'");
    expect(refusal(await r.meter.admit(request()))).toBe("meter_at_ceiling");
    await r.db.pg.query("UPDATE gateway.meters SET spent_micro = 100000 WHERE meter = 'day'");
    await r.db.pg.query(
      "UPDATE gateway.stack_state SET fallback_awaiting_renewal = true, fallback_awaiting_since = $1",
      [new Date(T0).toISOString()],
    );
    expect(refusal(await r.meter.admit(request()))).toBe("adapter_month_spent");
    await r.db.pg.query("UPDATE gateway.meters SET spent_micro = 100000 WHERE meter = 'adapter_month'");
    expect(refusal(await r.meter.admit(request()))).toBe("fallback_awaiting_renewal");
  });
});

describe("the crossings (FR-023)", () => {
  it("queues the warning's keyed alert once, at the cap times warn_ratio", async () => {
    const r = await rig();
    await spend(r, 6);
    expect((await outbox(r)).map((a) => a.dedupe_key)).not.toContain(`dev:warn:adapter_month:${KEY}`);
    await spend(r, 1); // $0.70
    await spend(r, 1);
    const warns = (await outbox(r)).filter((a) => a.dedupe_key === `dev:warn:adapter_month:${KEY}`);
    expect(warns).toEqual([{ dedupe_key: `dev:warn:adapter_month:${KEY}`, kind: "warn" }]);
    expect((await row(r, "adapter_month", KEY))?.warned_at).not.toBeNull();
  });

  it("at the cap: the flag, the fallback_exhausted alert, and the audit row, while the state stays normal", async () => {
    const r = await rig();
    await spend(r, 10);
    expect(await flag(r)).toMatchObject({ state: "normal", awaiting: true });
    expect((await row(r, "adapter_month", KEY))?.reached_at).not.toBeNull();
    expect((await outbox(r)).map((a) => [a.dedupe_key, a.kind])).toContainEqual([
      `dev:fallback_exhausted:adapter_month:${KEY}`,
      "fallback_exhausted",
    ]);
    const rows = (await audit(r)).filter((a) => a.action === "fallback_exhausted");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detail).toMatchObject({
      adapter: "anthropic",
      month: MONTH,
      cap_micro: 1_000_000,
      spent_micro: 1_000_000,
    });
  });

  it("sets no flag when the capped adapter isn't the route's fallback, but still alerts and audits", async () => {
    const r = await rig({ fallbackAdapterId: "bedrock" });
    await spend(r, 10);
    expect((await flag(r))?.awaiting).toBe(false);
    expect((await outbox(r)).map((a) => a.dedupe_key)).toContain(`dev:fallback_exhausted:adapter_month:${KEY}`);
    expect((await audit(r)).filter((a) => a.action === "fallback_exhausted")).toHaveLength(1);
  });
});

describe("after the cap (FR-023, SC-004)", () => {
  it("a renewal clears the flag while the month's level still refuses the adapter", async () => {
    const r = await rig();
    await spend(r, 10);
    const renewed = await renewFallback(
      {
        stack: "dev",
        envClass: "dev",
        store: r.store,
        journal: r.journal,
        clock: new GatewayClock(() => r.clock.now),
        budgets: r.config.budgets!,
        metrics: r.metrics,
        logger: { info() {}, warn() {} },
        realNow: () => r.clock.now,
        meter: { txDeps: () => r.meter.txDeps(), emit: (e) => r.meter.emit(e) },
      },
      "Renewing after the adapter month's cap, in the test.",
      OPERATOR,
    );
    expect(renewed.status).toBe(200);
    expect((await flag(r))?.awaiting).toBe(false);
    expect(refusal(await r.meter.admit(request()))).toBe("adapter_month_spent");
  });

  it("the flag survives a rollover into the next month, and a restart", async () => {
    const clock = { now: T0 };
    const r = await rig({ clock });
    await spend(r, 10);
    clock.now = Date.parse("2026-12-01T00:00:05.000Z");
    expect(refusal(await r.meter.admit(request()))).toBe("fallback_awaiting_renewal");
    const second = new Meter({ ...(r.meter as unknown as { deps: ConstructorParameters<typeof Meter>[0] }).deps });
    expect(refusal(await second.admit(request()))).toBe("fallback_awaiting_renewal");
    // The new month's row starts at zero: a test call, which the flag doesn't hold, is admitted against it.
    admitted(await second.admit(request({ attribution: "test", purpose: "contract", routeReason: null })));
    expect(await row(r, "adapter_month", "anthropic:2026-12")).toMatchObject({ spent: "0", reserved: "100000" });
    await second.stop();
  });

  it("the sweep settles an expired reservation on the month row at its maximum", async () => {
    const r = await rig();
    admitted(await r.meter.admit(request()));
    expect(await row(r, "adapter_month", KEY)).toMatchObject({ spent: "0", reserved: "100000" });
    r.clock.now += 121_000;
    await spend(r, 1);
    expect(await row(r, "adapter_month", KEY)).toMatchObject({ spent: "200000", reserved: "0" });
  });
});

describe("initialization's rebuild (FR-022; data-model.md §3)", () => {
  it("rebuilds the adapter's month from the journal's records of its calls", async () => {
    const first = await rig();
    await spend(first, 3);
    const fresh = await rig({ stateDir: first.stateDir, state: "none" });
    const result = await initializeStore(
      {
        stack: "dev",
        envClass: "dev",
        store: fresh.store,
        journal: fresh.journal,
        clock: new GatewayClock(() => fresh.clock.now),
        budgets: fresh.config.budgets!,
        alerts: fresh.config.alerts!,
        fallbackId: "anthropic",
        metrics: fresh.metrics,
        logger: { info() {}, warn() {} },
        realNow: () => fresh.clock.now,
      },
      { reason: "Rebuilding after a wiped store, in the test.", stated: {}, confirmZero: false, renew: false },
      OPERATOR,
    );
    expect(result.status).toBe(200);
    expect(await row(fresh, "adapter_month", KEY)).toMatchObject({ spent: "300000", reserved: "0" });
  });
});
