// The admission and commit transactions, step by step (tasks.md T068; data-model.md §2.3, §2.4, §7.2, §7.3), on
// PGlite, with the journal in a fresh state directory:
// - the locking order: every transaction that changes stack_state or meters locks the state row first (§2.1);
// - the refusal precedence of §7.2 step 5, and the in-memory limits before it;
// - outbox rows in the same transaction as each crossing, warnings, trips, and exhaustion alike;
// - an idempotent commit retry, after a lost acknowledgement and after an outage;
// - the sweep, at the maximum;
// - the reserved-micro invariant (§2.3) through all of it.
import { randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { metrics as otelMetrics } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../src/config/validate.js";
import { dayKey, GatewayClock, monthKey } from "../../src/core/clock.js";
import { ProviderError, type AdapterResult } from "../../src/core/types.js";
import { LOCK_STATE } from "../../src/meter/crossings.js";
import { Journal } from "../../src/meter/journal.js";
import { Meter } from "../../src/meter/meter.js";
import { readMigrations, Store } from "../../src/meter/store.js";
import type { AdmitRequest, AdmitResult, Admitted, CallEnd } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { connectionLost, statementRefused, testDatabase, type TestDatabase } from "../helpers/pglite.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const HEX64 = "ab".repeat(32);
/** The breach test's first day: the 20th of a month, 08:00 UTC (plan §8). */
const T0 = Date.parse("2026-11-20T08:00:00.000Z");
const DAY = dayKey(T0);
const MONTH = monthKey(T0);
const ACTOR = "operator:dev#abcdef01";

type Rec = Record<string, unknown>;

interface Logged {
  level: string;
  record: Rec;
}

interface Rig {
  db: TestDatabase;
  store: Store;
  meter: Meter;
  journal: Journal;
  stateDir: string;
  logged: Logged[];
  costs: { micro: bigint; attribution: string }[];
  clock: { now: number };
  changes: number;
}

const rigs: Rig[] = [];
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    await r.meter.stop();
    await chmod(join(r.stateDir, "journal"), 0o700).catch(() => {});
    await r.store.close();
    await rm(r.stateDir, { recursive: true, force: true });
  }
});

async function rig(o: { state?: "none" | "normal"; hasFallback?: boolean; commitRetryMs?: number } = {}): Promise<Rig> {
  const clock = { now: T0 };
  const realNow = () => clock.now;
  const logged: Logged[] = [];
  const at = (level: string) => (record: object) => void logged.push({ level, record: record as Rec });
  const logger = { info: at("info"), warn: at("warn"), error: at("error"), fatal: at("fatal") };
  const db = await testDatabase();
  const store = new Store({
    db,
    migrations: await readMigrations(),
    envClass: "dev",
    logger,
    onFatal: () => {},
    realNow,
  });
  await store.start();
  const stateDir = await mkdtemp(join(tmpdir(), "h4-meter-"));
  const journal = new Journal({ stateDir, stack: "dev", realNow });
  const config = await loadConfig(FIXTURES, { allowPlanned: false });
  if (!config.budgets || !config.alerts || !config.prices) throw new Error("fixtures");
  const metrics = new GatewayMetrics(otelMetrics.getMeter("test"));
  const costs: Rig["costs"] = [];
  vi.spyOn(metrics, "cost").mockImplementation((micro, a) => void costs.push({ micro, attribution: a.attribution }));
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
    logger,
    realNow,
    hasFallback: o.hasFallback ?? true,
    commitRetryMs: o.commitRetryMs ?? 20,
  });
  const r: Rig = { db, store, meter, journal, stateDir, logged, costs, clock, changes: 0 };
  meter.onChange = () => void (r.changes += 1);
  if ((o.state ?? "normal") === "normal") {
    await db.pg.query(
      `INSERT INTO gateway.stack_state (id, stack, env, state, since, crossed, fallback_awaiting_renewal,
         fallback_awaiting_since, initialized_at, initialized_by, test_clock_offset_ms, updated_at)
       VALUES (1, 'dev', 'dev', 'normal', $1, '{}', false, NULL, $1, $2, NULL, $1)`,
      [new Date(T0 - 3_600_000).toISOString(), ACTOR],
    );
  }
  rigs.push(r);
  return r;
}

const trace = (): string => randomBytes(16).toString("hex");

function request(o: Partial<AdmitRequest> = {}): AdmitRequest {
  return {
    attribution: "fallback",
    adapter: {
      id: "synthetic",
      provider: "synthetic",
      model: "metered-test",
      fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
    },
    adapterHealthy: true,
    maxOutputTokens: 128,
    requestId: trace(),
    traceId: trace(),
    purpose: "synthetic",
    routeReason: "local_unhealthy",
    ...o,
  };
}

/** A call that answered: the synthetic adapter's 1,000 output tokens, $0.10 at the fixtures' price. */
function answered(r: Rig, o: Partial<AdapterResult> = {}): CallEnd {
  const result: AdapterResult = {
    text: "synthetic response",
    usage: { inputTokens: 0, outputTokens: 1_000 },
    finishReason: "stop",
    responseModel: "metered-test",
    latencyMs: 3,
    ...o,
  };
  return { attempts: [{ outcome: "ok", result, startedAt: r.clock.now, endedAt: r.clock.now + 3 }] };
}

/** A call that failed, with the error its adapter raised. */
function failed(r: Rig, error: ProviderError): CallEnd {
  return { attempts: [{ outcome: "error", error, startedAt: r.clock.now, endedAt: r.clock.now + 3 }] };
}

const COMMITTED = { committed: true, costMicro: 100_000n };
const UNCOMMITTED = { committed: false, costMicro: 100_000n };

function admitted(result: AdmitResult): Admitted {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.admitted;
}

/** n calls of $0.10 each, admitted and committed one at a time, as the breach test spends. */
async function spend(r: Rig, n: number, o: Partial<AdmitRequest> = {}): Promise<void> {
  for (let i = 0; i < n; i++) {
    const a = admitted(await r.meter.admit(request(o)));
    expect(await r.meter.settle(a, answered(r))).toEqual(COMMITTED);
  }
}

async function meters(r: Rig): Promise<Rec[]> {
  return (
    await r.db.pg.query<Rec>(
      `SELECT meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no FROM gateway.meters
       ORDER BY meter, period_key`,
    )
  ).rows;
}

async function stateRow(r: Rig): Promise<Rec> {
  const row = (await r.db.pg.query<Rec>("SELECT * FROM gateway.stack_state")).rows[0];
  if (row === undefined) throw new Error("no state row");
  return row;
}

async function outbox(r: Rig): Promise<Rec[]> {
  return (await r.db.pg.query<Rec>("SELECT dedupe_key, kind, body FROM gateway.alert_outbox ORDER BY id")).rows;
}

async function journalRecords(r: Rig): Promise<Rec[]> {
  const text = await readFile(join(r.stateDir, "journal", `${MONTH}.jsonl`), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as Rec);
}

/** §2.3's invariant: each row's reserved_micro is the sum of max_micro over the live reservations charged to it. */
async function invariant(r: Rig): Promise<void> {
  const { rows } = await r.db.pg.query<{ meter: string; period_key: string; reserved: unknown; held: unknown }>(
    `SELECT m.meter, m.period_key, m.reserved_micro::text AS reserved, coalesce((
        SELECT sum(x.max_micro) FROM gateway.reservations x
        WHERE (m.meter = 'day' AND x.period_day = m.period_key)
           OR (m.meter = 'month' AND x.period_month = m.period_key)
           OR (m.meter = 'fallback_day' AND x.attribution = 'fallback' AND x.period_day = m.period_key)
      ), 0)::text AS held
     FROM gateway.meters m`,
  );
  for (const row of rows) expect(row.reserved, `${row.meter} ${row.period_key}`).toBe(row.held);
}

/** The statements of each transaction in the log, BEGIN through COMMIT or ROLLBACK. */
function transactions(statements: readonly string[]): string[][] {
  const out: string[][] = [];
  let current: string[] | undefined;
  for (const s of statements) {
    if (s === "BEGIN") current = [];
    else if (current !== undefined && (s === "COMMIT" || s === "ROLLBACK")) {
      out.push([...current, s]);
      current = undefined;
    } else current?.push(s);
  }
  return out;
}

const writes = (s: string): boolean =>
  /^(INSERT INTO|UPDATE|DELETE FROM) gateway\.(meters|stack_state)\b/.test(s.trim());

const causeOf = (result: AdmitResult) => (!result.ok && result.refusal === "degraded" ? result.decision : undefined);
const killLogs = (r: Rig) => r.logged.filter((l) => l.record.event === "killswitch.tripped").map((l) => l.record);
const reservationIds = async (r: Rig) =>
  (await r.db.pg.query<{ id: string }>("SELECT id FROM gateway.reservations ORDER BY id")).rows.map((x) => x.id);

describe("admission, step by step (data-model.md §7.2)", () => {
  it("locks the state, sweeps, upserts and locks the periods' rows, reserves, then appends the reserve record", async () => {
    const r = await rig();
    r.db.statements.length = 0;
    const a = admitted(await r.meter.admit(request({ attribution: "fallback" })));
    const [tx] = transactions(r.db.statements);
    expect(tx?.map((s) => s.trim().split(/\s+/).slice(0, 3).join(" "))).toEqual([
      "SELECT stack, env,", // 1. the state row, FOR UPDATE
      "DELETE FROM gateway.reservations", // 3. the sweep
      "INSERT INTO gateway.meters", // 4. the periods' rows
      "SELECT meter, period_key,", //    locked
      "INSERT INTO gateway.reservations", // 6. the reservation
      "UPDATE gateway.meters SET", // 7. reserved, on day,
      "UPDATE gateway.meters SET", //    month,
      "UPDATE gateway.meters SET", //    and fallback_day
      "COMMIT",
    ]);
    expect(tx?.[0]).toBe(LOCK_STATE);
    expect(tx?.[3]).toMatch(/FOR UPDATE$/);
    expect(a).toMatchObject({
      attribution: "fallback",
      adapterId: "synthetic",
      maxMicro: 100_000n,
      periodDay: DAY,
      periodMonth: MONTH,
      createdAt: T0,
      expiresAt: T0 + 120_000,
    });
    const reservation = (await r.db.pg.query<Rec>("SELECT * FROM gateway.reservations")).rows[0];
    expect(reservation).toMatchObject({
      id: a.reservationId,
      attribution: "fallback",
      max_micro: 100_000,
      period_day: DAY,
      period_month: MONTH,
      purpose: "synthetic",
      route_reason: "local_unhealthy",
      routing_sha: HEX64,
    });
    expect(await meters(r)).toEqual([
      { meter: "day", period_key: DAY, spent_micro: 0, reserved_micro: 100_000, allowance_micro: null, grant_no: null },
      {
        meter: "fallback_day",
        period_key: DAY,
        spent_micro: 0,
        reserved_micro: 100_000,
        allowance_micro: 2_000_000,
        grant_no: 1,
      },
      {
        meter: "month",
        period_key: MONTH,
        spent_micro: 0,
        reserved_micro: 100_000,
        allowance_micro: null,
        grant_no: null,
      },
    ]);
    // 8. The reserve record, fsync'd before the provider call (data-model.md §3).
    expect(await journalRecords(r)).toEqual([
      {
        v: 1,
        kind: "reserve",
        ts: new Date(T0).toISOString(),
        stack: "dev",
        reservation_id: a.reservationId,
        attribution: "fallback",
        adapter: "synthetic",
        provider: "synthetic",
        model: "metered-test",
        price_version: "2026-10-08.1",
        max_micro: 100_000,
        period_day: DAY,
        period_month: MONTH,
        expires_at: new Date(T0 + 120_000).toISOString(),
      },
    ]);
    expect(r.meter.counters()).toEqual({ inFlight: 1, lastMinute: 1 });
    await invariant(r);
  });

  it("charges a metered call to day and month only, with no route reason", async () => {
    const r = await rig();
    admitted(await r.meter.admit(request({ attribution: "metered", routeReason: "local_failed" })));
    expect((await meters(r)).map((m) => [m.meter, m.reserved_micro])).toEqual([
      ["day", 100_000],
      ["fallback_day", 0],
      ["month", 100_000],
    ]);
    const reservation = (await r.db.pg.query<Rec>("SELECT route_reason FROM gateway.reservations")).rows[0];
    expect(reservation).toEqual({ route_reason: null });
    await invariant(r);
  });
});

describe("the refusal precedence (§7.2 step 5)", () => {
  /** Puts the store in the given condition directly, as the transactions would have left it. */
  async function condition(
    r: Rig,
    o: { degraded?: boolean; awaiting?: boolean; day?: number; fallback?: number; fallbackReserved?: number },
  ) {
    if (o.degraded) {
      await r.db.pg.query("UPDATE gateway.stack_state SET state = 'degraded', since = $1, crossed = $2", [
        new Date(T0 - 60_000).toISOString(),
        [`day:${DAY}`],
      ]);
    }
    if (o.awaiting) {
      await r.db.pg.query(
        "UPDATE gateway.stack_state SET fallback_awaiting_renewal = true, fallback_awaiting_since = $1",
        [new Date(T0 - 120_000).toISOString()],
      );
    }
    const now = new Date(T0 - 1_000).toISOString();
    await r.db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no, created_at,
         updated_at, reached_at)
       VALUES ('day', $1, $3, 0, NULL, NULL, $6, $6, $7), ('month', $2, $3, 0, NULL, NULL, $6, $6, NULL),
              ('fallback_day', $1, $4, $5, 2000000, 1, $6, $6, NULL)`,
      [
        DAY,
        MONTH,
        String(o.day ?? 0),
        String(o.fallback ?? 0),
        String(o.fallbackReserved ?? 0),
        now,
        (o.day ?? 0) >= 5_000_000 ? new Date(T0 - 60_000).toISOString() : null,
      ],
    );
  }

  const cause = (result: AdmitResult) => (!result.ok && result.refusal === "degraded" ? result.decision : undefined);

  it("answers kill_switch_tripped first, under the lock, with the crossed ceilings and the state's since", async () => {
    const r = await rig();
    await condition(r, { degraded: true, awaiting: true, day: 5_000_000, fallback: 2_000_000 });
    const before = (await meters(r)).map((m) => m.reserved_micro);
    expect(cause(await r.meter.admit(request()))).toMatchObject({
      cause: "kill_switch_tripped",
      ceilings: ["day"],
      since: new Date(T0 - 60_000).toISOString().slice(0, 19) + "Z",
    });
    // A refusal rolls back: no reservation, no reserved change, and its slot back.
    expect((await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.reservations")).rows).toEqual([{ n: 0 }]);
    expect((await meters(r)).map((m) => m.reserved_micro)).toEqual(before);
    expect(transactions(r.db.statements).at(-1)?.at(-1)).toBe("ROLLBACK");
    expect(r.meter.counters()).toEqual({ inFlight: 0, lastMinute: 0 });
  });

  it("then meter_at_ceiling, counting reservations, with the meter's reached_at, for every attribution", async () => {
    const r = await rig();
    await condition(r, { awaiting: true, day: 5_000_000, fallback: 2_000_000 });
    for (const attribution of ["fallback", "metered", "test"] as const) {
      expect(cause(await r.meter.admit(request({ attribution })))).toMatchObject({
        cause: "meter_at_ceiling",
        ceilings: ["day"],
        since: new Date(T0 - 60_000).toISOString().slice(0, 19) + "Z",
      });
    }
    // Spend plus reservations: 4,950,000 spent and 50,000 held is at the ceiling too.
    const s = await rig();
    await condition(s, { day: 4_950_000 });
    await s.db.pg.query("UPDATE gateway.meters SET reserved_micro = 50000 WHERE meter = 'day'");
    expect(cause(await s.meter.admit(request({ attribution: "metered" })))).toMatchObject({
      cause: "meter_at_ceiling",
      ceilings: ["day"],
    });
  });

  it("then, for fallback only, the renewal flag, today's allowance, and the adapter's health", async () => {
    const r = await rig();
    await condition(r, { awaiting: true, fallback: 2_000_000 });
    expect(cause(await r.meter.admit(request({ adapterHealthy: false })))).toMatchObject({
      cause: "fallback_awaiting_renewal",
      since: new Date(T0 - 120_000).toISOString().slice(0, 19) + "Z",
    });
    const s = await rig();
    await condition(s, { fallback: 1_900_000, fallbackReserved: 100_000 }); // in flight hold the rest
    expect(cause(await s.meter.admit(request({ adapterHealthy: false })))).toEqual({
      kind: "degraded",
      cause: "fallback_spent_today",
      detail: "The local model is unavailable, and calls in flight hold the rest of today's fallback sub-budget.",
    });
    const u = await rig();
    expect(
      cause(await u.meter.admit(request({ adapterHealthy: false, adapterUnhealthySince: T0 - 5_000 }))),
    ).toMatchObject({
      cause: "fallback_unavailable",
      since: new Date(T0 - 5_000).toISOString().slice(0, 19) + "Z",
    });
  });

  it("checks the ceilings only for metered and test calls: not the sub-budget, nor the adapter's health", async () => {
    const r = await rig();
    await condition(r, { awaiting: true, fallback: 2_000_000 });
    for (const attribution of ["metered", "test"] as const) {
      const a = admitted(await r.meter.admit(request({ attribution, adapterHealthy: false })));
      await r.meter.settle(a, answered(r));
    }
    await invariant(r);
  });

  it("puts the in-memory limits before the transaction: four in flight refuse even an unhealthy fallback with 429", async () => {
    const r = await rig();
    const held = [];
    for (let i = 0; i < 4; i++) held.push(admitted(await r.meter.admit(request())));
    const refused = await r.meter.admit(request({ adapterHealthy: false }));
    expect(refused).toEqual({
      ok: false,
      refusal: "limit",
      error: "metered_capacity_exceeded",
      limit: "global_in_flight",
      retryAfterS: 1,
    });
    // A client's own second call in flight is client_cap_exceeded, checked before the global count.
    const s = await rig();
    admitted(await s.meter.admit(request({ clientKey: "client" })));
    expect(await s.meter.admit(request({ clientKey: "client" }))).toMatchObject({
      error: "client_cap_exceeded",
      limit: "metered_in_flight",
    });
    for (const a of held) await r.meter.settle(a, answered(r));
    expect(r.meter.counters().inFlight).toBe(0);
  });

  it("answers store_uninitialized with no state row, and store_unreachable when the store fails under it", async () => {
    const empty = await rig({ state: "none" });
    expect(cause(await empty.meter.admit(request()))).toMatchObject({ cause: "store_uninitialized" });
    const r = await rig();
    r.db.hook = (text) => {
      if (text.startsWith("INSERT INTO gateway.reservations")) throw connectionLost();
    };
    expect(cause(await r.meter.admit(request()))).toMatchObject({ cause: "store_unreachable" });
    expect(r.meter.counters()).toEqual({ inFlight: 0, lastMinute: 0 });
  });
});

describe("a lost acknowledgement of the admission's COMMIT (§7.2; tasks.md T072)", () => {
  /** Drops the connection at the admission's COMMIT: before it reaches the server, or after it landed. */
  function dropCommit(r: Rig, phase: "before" | "after", o: { staysDown?: boolean } = {}): () => boolean {
    let armed = false;
    let dropped = false;
    r.db.hook = (text, at) => {
      if (dropped && o.staysDown) throw connectionLost();
      if (text.startsWith("INSERT INTO gateway.reservations")) armed = true;
      if (armed && !dropped && text === "COMMIT" && at === phase) {
        dropped = true;
        throw connectionLost();
      }
    };
    return () => dropped;
  }

  it("withdraws a reservation whose COMMIT landed, refuses with store_unreachable, and gives the slot back", async () => {
    const r = await rig();
    const dropped = dropCommit(r, "after");
    const result = await r.meter.admit(request());
    r.db.hook = undefined;
    expect(dropped()).toBe(true);
    expect(causeOf(result)).toMatchObject({ cause: "store_unreachable" });
    expect(await reservationIds(r)).toEqual([]);
    expect((await meters(r)).map((m) => m.reserved_micro)).toEqual([0, 0, 0]);
    expect(r.meter.counters()).toEqual({ inFlight: 0, lastMinute: 0 });
    await invariant(r);
  });

  it("subtracts nothing when the COMMIT never landed, beside another call's live reservation", async () => {
    const r = await rig();
    const live = admitted(await r.meter.admit(request({ attribution: "metered" })));
    const dropped = dropCommit(r, "before");
    const result = await r.meter.admit(request({ attribution: "metered" }));
    r.db.hook = undefined;
    expect(dropped()).toBe(true);
    expect(causeOf(result)).toMatchObject({ cause: "store_unreachable" });
    // The withdrawal found no reservation to delete, so it took nothing off the live call's rows (§2.3).
    expect(await reservationIds(r)).toEqual([live.reservationId]);
    expect((await meters(r)).find((m) => m.meter === "day")).toMatchObject({ reserved_micro: 100_000 });
    expect(r.meter.counters().inFlight).toBe(1); // the live call's slot, and only it
    await invariant(r);
  });

  it("leaves a reservation it can't withdraw to the sweep, which settles the never-run call at its maximum", async () => {
    const r = await rig();
    dropCommit(r, "after", { staysDown: true });
    const result = await r.meter.admit(request({ attribution: "metered" }));
    r.db.hook = undefined;
    expect(causeOf(result)).toMatchObject({ cause: "store_unreachable" });
    expect(await reservationIds(r)).toHaveLength(1);
    expect(r.meter.counters().inFlight).toBe(0);
    r.clock.now += 121_000;
    expect(await r.meter.sweepNow()).toBe(1);
    expect((await meters(r)).find((m) => m.meter === "day")).toMatchObject({ spent_micro: 100_000, reserved_micro: 0 });
    await invariant(r);
  });
});

describe("the commit (§7.3)", () => {
  it("releases the reservation, writes the ledger row, adds the spend, appends the commit record, and counts the cost", async () => {
    const r = await rig();
    const a = admitted(await r.meter.admit(request({ clientKey: "client" })));
    r.clock.now += 40;
    r.db.statements.length = 0;
    expect(await r.meter.settle(a, answered(r), { clientLabel: "author-laptop" })).toEqual(COMMITTED);
    const [tx] = transactions(r.db.statements);
    expect(tx?.[0]).toBe(LOCK_STATE);
    expect(tx?.map((s) => s.trim().split(/\s+/).slice(0, 3).join(" "))).toEqual([
      "SELECT stack, env,", // 1. lock
      "SELECT id FROM", // 2. already committed?
      "DELETE FROM gateway.reservations", // 3. the reservation
      "UPDATE gateway.meters SET", //    released, on its three rows
      "UPDATE gateway.meters SET",
      "UPDATE gateway.meters SET",
      "INSERT INTO gateway.ledger", // 4. the ledger row
      "INSERT INTO gateway.meters", // 5. the spend, on its three rows
      "INSERT INTO gateway.meters",
      "INSERT INTO gateway.meters",
      "COMMIT",
    ]);
    const ledger = (await r.db.pg.query<Rec>("SELECT * FROM gateway.ledger")).rows;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      reservation_id: a.reservationId,
      stack: "dev",
      request_id: a.requestId,
      trace_id: a.traceId,
      purpose: "synthetic",
      route_decision: "fallback",
      route_reason: "local_unhealthy",
      attribution: "fallback",
      adapter_id: "synthetic",
      provider: "synthetic",
      request_model: "metered-test",
      response_model: "metered-test",
      input_tokens: 0,
      output_tokens: 1_000,
      cache_read_tokens: 0,
      latency_ms: 3,
      finish_reason: "stop",
      outcome: "ok",
      error_kind: null,
      cost_micro: 100_000,
      cost_basis: "usage",
      price_version: "2026-10-08.1",
      routing_sha: HEX64,
      period_day: DAY,
      period_month: MONTH,
      client_label: "author-laptop", // the ledger keeps the label, and nothing else does
    });
    expect((await meters(r)).map((m) => [m.meter, m.spent_micro, m.reserved_micro])).toEqual([
      ["day", 100_000, 0],
      ["fallback_day", 100_000, 0],
      ["month", 100_000, 0],
    ]);
    const records = await journalRecords(r);
    expect(records.map((x) => x.kind)).toEqual(["reserve", "commit"]);
    expect(records[1]).toEqual({
      v: 1,
      kind: "commit",
      ts: new Date(T0 + 40).toISOString(),
      stack: "dev",
      reservation_id: a.reservationId,
      ledger_id: ledger[0]?.id,
      cost_micro: 100_000,
      cost_basis: "usage",
      outcome: "ok",
      error_kind: null,
      input_tokens: 0,
      output_tokens: 1_000,
      cache_read_tokens: 0,
      attribution: "fallback",
      period_day: DAY,
      period_month: MONTH,
      trace_id: a.traceId,
    });
    expect(r.costs).toEqual([{ micro: 100_000n, attribution: "fallback" }]);
    const completed = r.logged.find((l) => l.record.event === "call.completed")?.record;
    expect(completed).toEqual({
      event: "call.completed",
      route_decision: "fallback",
      route_reason: "local_unhealthy",
      attribution: "fallback",
      adapter: "synthetic",
      provider: "synthetic",
      request_model: "metered-test",
      response_model: "metered-test",
      input_tokens: 0,
      output_tokens: 1_000,
      latency_ms: 3,
      cost_micro: 100_000,
      cost_basis: "usage",
      price_version: "2026-10-08.1",
      outcome: "ok",
      error_kind: null,
    });
    expect(JSON.stringify(r.logged)).not.toContain("author-laptop");
    expect(r.meter.counters()).toEqual({ inFlight: 0, lastMinute: 1 });
    await invariant(r);
  });

  it("charges a possibly billed failure its reserved maximum, and an unbilled one nothing", async () => {
    const r = await rig();
    const billed = admitted(await r.meter.admit(request()));
    expect(await r.meter.settle(billed, failed(r, new ProviderError("timeout", true, true)))).toEqual(COMMITTED);
    const unbilled = admitted(await r.meter.admit(request()));
    expect(await r.meter.settle(unbilled, failed(r, new ProviderError("unavailable", true, false)))).toEqual({
      committed: true,
      costMicro: 0n,
    });
    const ledger = (
      await r.db.pg.query<Rec>("SELECT cost_micro, cost_basis, outcome, error_kind FROM gateway.ledger ORDER BY ts, id")
    ).rows;
    expect(ledger).toEqual(
      expect.arrayContaining([
        { cost_micro: 100_000, cost_basis: "reservation", outcome: "error", error_kind: "timeout" },
        { cost_micro: 0, cost_basis: "none", outcome: "error", error_kind: "unavailable" },
      ]),
    );
    expect((await meters(r)).find((m) => m.meter === "day")).toMatchObject({ spent_micro: 100_000, reserved_micro: 0 });
    await invariant(r);
  });

  it("writes each crossing's outbox row in the commit's own transaction, once, with NOTIFY", async () => {
    const r = await rig();
    await spend(r, 34, { attribution: "metered" }); // $3.40
    expect(await outbox(r)).toEqual([]);
    r.db.statements.length = 0;
    await spend(r, 1, { attribution: "metered" }); // $3.50: the day's warning
    const commitTxs = transactions(r.db.statements).filter((t) =>
      t.some((s) => s.startsWith("INSERT INTO gateway.ledger")),
    );
    expect(commitTxs).toHaveLength(1);
    const statements = commitTxs[0] ?? [];
    const insert = statements.findIndex((s) => s.trim().startsWith("INSERT INTO gateway.alert_outbox"));
    expect(insert).toBeGreaterThan(statements.findIndex((s) => s.startsWith("INSERT INTO gateway.ledger")));
    expect(statements[insert + 1]).toBe("NOTIFY alert_outbox");
    expect(statements.at(-1)).toBe("COMMIT");
    const rows = await outbox(r);
    expect(rows.map((x) => [x.dedupe_key, x.kind])).toEqual([[`dev:warn:day:${DAY}`, "warn"]]);
    expect(String(rows[0]?.body).split("\n")).toEqual([
      "[dev] WARNING: daily meter at 70%",
      "Daily: 3.50 / 5.00 USD (warning 3.50) · Month: 3.50 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1) (synthetic spend)",
      `Runtime: normal · Fallback: available · ${new Date(T0).toISOString().slice(0, 19)}Z · id dev:warn:day:${DAY}`,
      "Runbook: docs/runbooks/cost-warning.md",
    ]);
    const day = (await r.db.pg.query<Rec>("SELECT warned_at FROM gateway.meters WHERE meter = 'day'")).rows[0];
    expect(day?.warned_at).toBeInstanceOf(Date);
    expect(r.logged.filter((l) => l.record.event === "meter.threshold_crossed").map((l) => l.record)).toEqual([
      {
        event: "meter.threshold_crossed",
        meter: "day",
        period: DAY,
        threshold: "warn",
        spent_micro: 3_500_000,
        threshold_micro: 3_500_000,
      },
    ]);
    expect(r.logged.filter((l) => l.record.event === "alert.queued").map((l) => l.record)).toEqual([
      { event: "alert.queued", dedupe_key: `dev:warn:day:${DAY}`, kind: "warn" },
    ]);
    // Spend past the warning never warns again.
    await spend(r, 2, { attribution: "metered" });
    expect((await outbox(r)).map((x) => x.dedupe_key)).toEqual([`dev:warn:day:${DAY}`]);
  });

  it("trips the kill switch in the commit that reaches the ceiling: state, crossed, reached_at, incident, audit, alert", async () => {
    const r = await rig();
    await spend(r, 49, { attribution: "metered" }); // $4.90
    r.clock.now += 5_000;
    const crossing = admitted(await r.meter.admit(request({ attribution: "metered" })));
    await r.meter.settle(crossing, answered(r)); // $5.00: the daily ceiling
    const state = await stateRow(r);
    expect(state).toMatchObject({ state: "degraded", crossed: [`day:${DAY}`], fallback_awaiting_renewal: false });
    expect((state.since as Date).getTime()).toBe(T0 + 5_000);
    const day = (await r.db.pg.query<Rec>("SELECT reached_at FROM gateway.meters WHERE meter = 'day'")).rows[0];
    expect((day?.reached_at as Date).getTime()).toBe(T0 + 5_000);
    const ledgerId = (
      await r.db.pg.query<Rec>("SELECT id FROM gateway.ledger WHERE reservation_id = $1", [crossing.reservationId])
    ).rows[0]?.id;
    const incident = (await r.db.pg.query<Rec>("SELECT * FROM gateway.incidents")).rows;
    expect(incident).toEqual([
      expect.objectContaining({
        stack: "dev",
        ceiling: "day",
        period_key: DAY,
        ledger_id: ledgerId,
        trip_alert_key: `dev:trip:day:${DAY}`,
        status: "queued",
        path: null,
      }),
    ]);
    const audit = (
      await r.db.pg.query<Rec>("SELECT actor, action, reason, before, after, detail FROM gateway.audit_log")
    ).rows;
    expect(audit).toEqual([
      {
        actor: "gateway",
        action: "trip",
        reason: null,
        before: { state: "normal", crossed: [] },
        after: { state: "degraded", since: new Date(T0 + 5_000).toISOString(), crossed: [`day:${DAY}`] },
        detail: expect.objectContaining({
          ceiling: "day",
          period: DAY,
          ledger_id: ledgerId,
          trace_id: crossing.traceId,
          spent_before_micro: 4_900_000,
          spent_after_micro: 5_000_000,
          degraded_now: true,
          meters: {
            day: {
              period: DAY,
              spent_micro: 5_000_000,
              reserved_micro: 0,
              ceiling_micro: 5_000_000,
              warn_micro: 3_500_000,
            },
            month: {
              period: MONTH,
              spent_micro: 5_000_000,
              reserved_micro: 0,
              ceiling_micro: 20_000_000,
              warn_micro: 14_000_000,
            },
            fallback_day: {
              period: DAY,
              spent_micro: 0,
              reserved_micro: 0,
              allowance_micro: 2_000_000,
              grant_no: 1,
              warn_micro: 1_400_000,
            },
          },
        }),
      },
    ]);
    const trip = (await outbox(r)).find((x) => x.kind === "trip");
    expect(String(trip?.body).split("\n").slice(0, 3)).toEqual([
      "[dev] KILL SWITCH TRIPPED: daily ceiling reached",
      "Daily: 5.00 / 5.00 USD (warning 3.50) · Month: 5.00 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1) (synthetic spend)",
      `Runtime: degraded since ${new Date(T0 + 5_000).toISOString().slice(0, 19)}Z · Fallback: available · ${new Date(T0 + 5_000).toISOString().slice(0, 19)}Z · id dev:trip:day:${DAY}`,
    ]);
    expect(r.logged.find((l) => l.record.event === "killswitch.tripped")?.record).toEqual({
      event: "killswitch.tripped",
      ceilings: ["day"],
      day_micro: 5_000_000,
      month_micro: 5_000_000,
    });
    // The next metered call is refused under the lock: the switch is degraded now.
    const next = await r.meter.admit(request({ attribution: "metered" }));
    expect(!next.ok && next.refusal === "degraded" && next.decision.cause).toBe("kill_switch_tripped");
    await invariant(r);
  });

  it("keeps since when a second ceiling trips a degraded stack, and adds it to crossed", async () => {
    const r = await rig();
    // Month at $19.90 and today at $4.90, already degraded since earlier today by another period's crossing.
    const earlier = new Date(T0 - 600_000).toISOString();
    await r.db.pg.query("UPDATE gateway.stack_state SET state = 'degraded', since = $1, crossed = $2", [
      earlier,
      ["day:2026-11-19"],
    ]);
    await r.db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, spent_micro, created_at, updated_at, allowance_micro, grant_no)
       VALUES ('month', $1, 19900000, $2, $2, NULL, NULL)`,
      [MONTH, earlier],
    );
    // A call admitted before the trip commits after it: its spend still counts, and crosses the month's ceiling.
    const a: Admitted = {
      reservationId: "0f9d6f46-79f1-4f55-9c88-0d1f9a5c6b10",
      attribution: "metered",
      adapterId: "synthetic",
      provider: "synthetic",
      model: "metered-test",
      price: (await loadConfig(FIXTURES, { allowPlanned: false })).prices?.versions[0] as Admitted["price"],
      maxMicro: 100_000n,
      periodDay: DAY,
      periodMonth: MONTH,
      createdAt: T0,
      expiresAt: T0 + 120_000,
      retryUntil: T0 + 120_000,
      requestId: trace(),
      traceId: trace(),
      purpose: "synthetic",
      routeReason: null,
      routingSha: HEX64,
    };
    await r.meter.settle(a, answered(r));
    const state = await stateRow(r);
    expect(state).toMatchObject({ state: "degraded", crossed: ["day:2026-11-19", `month:${MONTH}`] });
    expect((state.since as Date).toISOString()).toBe(earlier);
    // Only the ceiling: the month's warning at $14.00 was crossed long before.
    expect((await outbox(r)).map((x) => x.dedupe_key)).toEqual([`dev:trip:month:${MONTH}`]);
  });

  it("logs killswitch.tripped once, for the commit that sets degraded, naming every ceiling it crossed", async () => {
    const r = await rig();
    const earlier = new Date(T0 - 1_000).toISOString();
    const seed = (s: Rig, day: number, month: number) =>
      s.db.pg.query(
        `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no,
           created_at, updated_at)
         VALUES ('day', $1, $3, 0, NULL, NULL, $5, $5), ('month', $2, $4, 0, NULL, NULL, $5, $5)`,
        [DAY, MONTH, day, month, earlier],
      );
    // One call crosses both ceilings: one record that names both, and each ceiling still has its own trip.
    await seed(r, 4_950_000, 19_950_000);
    await spend(r, 1, { attribution: "metered" });
    expect(killLogs(r)).toEqual([
      { event: "killswitch.tripped", ceilings: ["day", "month"], day_micro: 5_050_000, month_micro: 20_050_000 },
    ]);
    expect((await stateRow(r)).crossed).toEqual([`day:${DAY}`, `month:${MONTH}`]);
    expect((await outbox(r)).filter((x) => x.kind === "trip").map((x) => x.dedupe_key)).toEqual([
      `dev:trip:day:${DAY}`,
      `dev:trip:month:${MONTH}`,
    ]);
    // A ceiling crossed on a stack that is degraded already sets nothing: no second record.
    const s = await rig();
    await seed(s, 4_800_000, 0);
    const b = admitted(await s.meter.admit(request({ attribution: "metered" })));
    const c = admitted(await s.meter.admit(request({ attribution: "metered" })));
    await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 4950000 WHERE meter = 'day'");
    await s.meter.settle(b, answered(s)); // the day's ceiling: degraded
    await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 19950000 WHERE meter = 'month'");
    await s.meter.settle(c, answered(s)); // in flight before the trip: the month's ceiling, on a degraded stack
    expect(killLogs(s)).toEqual([
      { event: "killswitch.tripped", ceilings: ["day"], day_micro: 5_050_000, month_micro: 100_000 },
    ]);
    expect((await stateRow(s)).crossed).toEqual([`day:${DAY}`, `month:${MONTH}`]);
    expect((await outbox(s)).filter((x) => x.kind === "trip")).toHaveLength(2);
  });

  it("exhausts the sub-budget in the commit that reaches the allowance, and refuses fallback until a renewal", async () => {
    const r = await rig();
    await spend(r, 13); // $1.30 of fallback
    expect((await outbox(r)).map((x) => x.dedupe_key)).toEqual([]);
    await spend(r, 1); // $1.40: the first grant's warning
    await spend(r, 5); // $1.90
    r.clock.now += 7_000;
    await spend(r, 1); // $2.00: the grant is spent
    const state = await stateRow(r);
    expect(state).toMatchObject({ state: "normal", fallback_awaiting_renewal: true });
    expect((state.fallback_awaiting_since as Date).getTime()).toBe(T0 + 7_000);
    expect((await outbox(r)).map((x) => [x.dedupe_key, x.kind])).toEqual([
      [`dev:warn:fallback_day:${DAY}:g1`, "warn"],
      [`dev:fallback_exhausted:fallback_day:${DAY}:g1`, "fallback_exhausted"],
    ]);
    const bodies = (await outbox(r)).map((x) => String(x.body).split("\n"));
    expect(bodies[0]?.[1]).toBe(
      "Daily: 1.40 / 5.00 USD (warning 3.50) · Month: 1.40 / 20.00 (warning 14.00) · Fallback today: 1.40 / 2.00 (grant 1, warning 1.40) (synthetic spend)",
    );
    expect(bodies[1]?.[2]).toBe(
      `Runtime: normal · Fallback: awaiting renewal since ${new Date(T0 + 7_000).toISOString().slice(0, 19)}Z · ${new Date(T0 + 7_000).toISOString().slice(0, 19)}Z · id dev:fallback_exhausted:fallback_day:${DAY}:g1`,
    );
    const audit = (await r.db.pg.query<Rec>("SELECT action, before, after, detail FROM gateway.audit_log")).rows;
    expect(audit).toEqual([
      {
        action: "fallback_exhausted",
        before: { fallback_awaiting_renewal: false },
        after: { fallback_awaiting_renewal: true, fallback_awaiting_since: new Date(T0 + 7_000).toISOString() },
        detail: expect.objectContaining({ grant_no: 1, allowance_micro: 2_000_000, spent_micro: 2_000_000 }),
      },
    ]);
    expect(r.logged.find((l) => l.record.event === "fallback.exhausted")?.record).toEqual({
      event: "fallback.exhausted",
      grant_no: 1,
      allowance_micro: 2_000_000,
      spent_micro: 2_000_000,
    });
    const next = await r.meter.admit(request());
    expect(!next.ok && next.refusal === "degraded" && next.decision.cause).toBe("fallback_awaiting_renewal");
    // Metered calls don't count against the sub-budget, so they still pass.
    admitted(await r.meter.admit(request({ attribution: "metered" })));
  });

  it("refuses fallback_spent_today while calls in flight hold the rest of the grant", async () => {
    const r = await rig();
    await spend(r, 17); // $1.70
    const held = [];
    for (let i = 0; i < 3; i++) held.push(admitted(await r.meter.admit(request()))); // $0.30 reserved: the rest
    const refused = await r.meter.admit(request());
    expect(!refused.ok && refused.refusal === "degraded" && refused.decision.cause).toBe("fallback_spent_today");
    await invariant(r);
    for (const a of held) await r.meter.settle(a, answered(r));
    expect((await stateRow(r)).fallback_awaiting_renewal).toBe(true); // the commit that reached it set the flag
  });
});

describe("commit retries (§7.3)", () => {
  it("is idempotent after a lost acknowledgement: one ledger row, the spend once, and the retry finishes the work", async () => {
    const r = await rig();
    const a = admitted(await r.meter.admit(request()));
    let dropped = false;
    r.db.hook = (text, phase) => {
      if (text === "COMMIT" && phase === "after" && !dropped) {
        dropped = true;
        throw connectionLost();
      }
    };
    expect(await r.meter.settle(a, answered(r))).toEqual(UNCOMMITTED);
    expect(r.meter.pendingCommits()).toBe(1);
    await vi.waitFor(() => expect(r.meter.pendingCommits()).toBe(0), { timeout: 2_000, interval: 10 });
    expect((await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.ledger")).rows).toEqual([{ n: 1 }]);
    expect((await meters(r)).find((m) => m.meter === "day")).toMatchObject({ spent_micro: 100_000, reserved_micro: 0 });
    // The retry found its own row: the cost counts once, and the commit record follows.
    expect(r.costs).toEqual([{ micro: 100_000n, attribution: "fallback" }]);
    expect((await journalRecords(r)).map((x) => x.kind)).toEqual(["reserve", "commit"]);
    expect(r.meter.counters().inFlight).toBe(0);
    expect(r.logged.some((l) => l.record.event === "meter.commit_pending")).toBe(true);
  });

  it("keeps a commit the store couldn't take, retries it every 2 s, and holds the call's slot meanwhile", async () => {
    const r = await rig();
    const a = admitted(await r.meter.admit(request()));
    let down = true;
    r.db.hook = (text) => {
      if (down && text === LOCK_STATE) throw connectionLost();
    };
    expect(await r.meter.settle(a, answered(r))).toEqual(UNCOMMITTED);
    expect(r.meter.counters().inFlight).toBe(1); // the slot outlives no call, but this call isn't over
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(r.meter.pendingCommits()).toBe(1);
    down = false;
    await vi.waitFor(() => expect(r.meter.pendingCommits()).toBe(0), { timeout: 2_000, interval: 10 });
    expect(r.meter.counters().inFlight).toBe(0);
    expect((await r.db.pg.query("SELECT cost_basis FROM gateway.ledger")).rows).toEqual([{ cost_basis: "usage" }]);
    await invariant(r);
  });

  it("gives up at expires_at and releases the slot; the sweep then settles the reservation at its maximum", async () => {
    const r = await rig();
    const a = admitted(await r.meter.admit(request({ attribution: "metered" })));
    r.db.hook = (text) => {
      if (text === LOCK_STATE) throw connectionLost();
    };
    await r.meter.settle(a, answered(r, { usage: { inputTokens: 0, outputTokens: 400 } })); // $0.04
    r.clock.now = a.retryUntil; // the reservation has expired
    await vi.waitFor(() => expect(r.meter.pendingCommits()).toBe(0), { timeout: 2_000, interval: 10 });
    expect(r.meter.counters().inFlight).toBe(0);
    expect(r.logged.some((l) => l.record.event === "meter.commit_gave_up")).toBe(true);
    r.db.hook = undefined;
    r.clock.now += 1;
    expect(await r.meter.sweepNow()).toBe(1);
    expect((await r.db.pg.query<Rec>("SELECT cost_micro, cost_basis, outcome FROM gateway.ledger")).rows).toEqual([
      { cost_micro: 100_000, cost_basis: "expired", outcome: "unknown" }, // the maximum, not the 40,000 it cost
    ]);
    await invariant(r);
  });
});

describe("a commit the store refuses (tasks.md T072)", () => {
  it("gives the call's slot back at once, retries nothing, and leaves the reservation to the sweep", async () => {
    const r = await rig();
    const a = admitted(await r.meter.admit(request({ attribution: "metered" })));
    r.db.hook = (text, phase) => {
      if (phase === "before" && text.startsWith("INSERT INTO gateway.ledger")) throw statementRefused("23514");
    };
    expect(await r.meter.settle(a, answered(r))).toEqual(UNCOMMITTED); // a bug: it never throws to the caller
    r.db.hook = undefined;
    expect(r.meter.counters().inFlight).toBe(0);
    expect(r.meter.pendingCommits()).toBe(0);
    expect(r.logged.find((l) => l.record.event === "meter.commit_gave_up")?.record).toEqual({
      event: "meter.commit_gave_up",
      reservation_id: a.reservationId,
      attribution: "metered",
    });
    expect(r.store.outageStartedAt()).toBeUndefined(); // a refused statement isn't an outage
    // The reservation still holds the call's maximum; once it expires, the sweep charges it.
    expect(await reservationIds(r)).toEqual([a.reservationId]);
    r.clock.now = a.expiresAt;
    expect(await r.meter.sweepNow()).toBe(1);
    expect((await meters(r)).find((m) => m.meter === "day")).toMatchObject({ spent_micro: 100_000, reserved_micro: 0 });
    await invariant(r);
  });
});

describe("the sweep (§2.4)", () => {
  it("settles an expired reservation at its maximum, crossing like a commit, and a late commit is a no-op", async () => {
    const r = await rig();
    await spend(r, 34, { attribution: "metered" }); // $3.40
    const late = admitted(await r.meter.admit(request({ attribution: "metered" })));
    r.clock.now = late.expiresAt; // its TTL is over: it may have been billed
    r.db.statements.length = 0;
    expect(await r.meter.sweepNow()).toBe(1);
    const [tx] = transactions(r.db.statements);
    expect(tx?.[0]).toBe(LOCK_STATE);
    const row = (
      await r.db.pg.query<Rec>(
        `SELECT cost_micro, cost_basis, outcome, latency_ms, finish_reason, input_tokens, output_tokens,
           cache_read_tokens, error_kind, client_label, trace_id, route_decision, route_reason
         FROM gateway.ledger WHERE reservation_id = $1`,
        [late.reservationId],
      )
    ).rows[0];
    expect(row).toEqual({
      cost_micro: 100_000,
      cost_basis: "expired",
      outcome: "unknown",
      latency_ms: 0,
      finish_reason: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      error_kind: null,
      client_label: null,
      trace_id: late.traceId,
      route_decision: "metered",
      route_reason: null,
    });
    expect((await meters(r)).find((m) => m.meter === "day")).toMatchObject({
      spent_micro: 3_500_000,
      reserved_micro: 0,
    });
    expect((await outbox(r)).map((x) => x.dedupe_key)).toEqual([`dev:warn:day:${DAY}`]); // it crossed the warning
    expect(r.costs.at(-1)).toEqual({ micro: 100_000n, attribution: "metered" });
    expect(r.logged.find((l) => l.record.event === "reservation.expired")?.record).toEqual({
      event: "reservation.expired",
      reservation_id: late.reservationId,
      attribution: "metered",
      max_micro: 100_000,
    });
    // The commit arrives after all: the ledger row is there, so it does nothing, and the slot goes back.
    const costs = r.costs.length;
    expect(await r.meter.settle(late, answered(r))).toEqual(COMMITTED);
    expect((await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.ledger")).rows).toEqual([{ n: 35 }]);
    expect(r.costs).toHaveLength(costs);
    expect((await meters(r)).find((m) => m.meter === "day")).toMatchObject({ spent_micro: 3_500_000 });
    expect(r.meter.counters().inFlight).toBe(0);
    await invariant(r);
  });

  it("runs in the admission transaction too, and a refusal there keeps what it settled", async () => {
    const r = await rig();
    await spend(r, 49, { attribution: "metered" }); // $4.90
    admitted(await r.meter.admit(request({ attribution: "metered" }))); // never commits
    r.clock.now += 121_000;
    // The next admission sweeps the expired call to $5.00, which trips the switch, and is refused for it.
    const refused = await r.meter.admit(request({ attribution: "metered" }));
    expect(!refused.ok && refused.refusal === "degraded" && refused.decision.cause).toBe("kill_switch_tripped");
    expect((await stateRow(r)).state).toBe("degraded");
    expect(transactions(r.db.statements).at(-1)?.at(-1)).toBe("COMMIT");
    expect(
      (await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.ledger WHERE cost_basis = 'expired'")).rows,
    ).toEqual([{ n: 1 }]);
    expect((await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.reservations")).rows).toEqual([{ n: 0 }]);
    await invariant(r);
  });

  it("does nothing, and takes no lock, while no reservation has expired", async () => {
    const r = await rig();
    admitted(await r.meter.admit(request()));
    r.db.statements.length = 0;
    expect(await r.meter.sweepNow()).toBe(0);
    expect(r.db.statements).toHaveLength(1);
    expect(r.db.statements[0]).toMatch(/^SELECT 1 FROM gateway\.reservations WHERE expires_at <= \$1 LIMIT 1$/);
  });

  it("sweeps every 10 s on its own once started", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const r = await rig();
      admitted(await r.meter.admit(request()));
      r.clock.now += 121_000;
      r.meter.start();
      await vi.advanceTimersByTimeAsync(10_000);
      vi.useRealTimers();
      await vi.waitFor(async () =>
        expect((await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.reservations")).rows).toEqual([{ n: 0 }]),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the 10 s upkeep (§7.7)", () => {
  it("gives back the slot of a call that never settles once its reservation expires, and the sweep settles it", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const r = await rig();
      const a = admitted(await r.meter.admit(request({ clientKey: "client" })));
      r.meter.start();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(r.meter.counters().inFlight).toBe(1); // not expired: the call may still settle
      r.clock.now = a.retryUntil;
      await vi.advanceTimersByTimeAsync(10_000);
      vi.useRealTimers();
      await vi.waitFor(async () => expect(await reservationIds(r)).toEqual([]));
      expect(r.meter.counters().inFlight).toBe(0);
      expect(r.logged.find((l) => l.record.event === "meter.commit_gave_up")?.record).toEqual({
        event: "meter.commit_gave_up",
        reservation_id: a.reservationId,
        attribution: "fallback",
      });
      // The client's one metered slot is free again, and a settlement that comes after all gives nothing back twice.
      const next = admitted(await r.meter.admit(request({ clientKey: "client" })));
      expect(await r.meter.settle(a, answered(r))).toEqual(COMMITTED);
      expect(r.meter.counters().inFlight).toBe(1);
      await r.meter.settle(next, answered(r));
      expect(r.meter.counters().inFlight).toBe(0);
      await invariant(r);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs meter.sweep_failed with the error class when the sweep fails", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const r = await rig();
      admitted(await r.meter.admit(request()));
      r.clock.now += 121_000;
      r.db.hook = (text) => {
        if (text.startsWith("SELECT 1 FROM gateway.reservations")) throw connectionLost();
      };
      r.meter.start();
      await vi.advanceTimersByTimeAsync(10_000);
      vi.useRealTimers();
      await vi.waitFor(() => expect(r.logged.some((l) => l.record.event === "meter.sweep_failed")).toBe(true));
      expect(r.logged.find((l) => l.record.event === "meter.sweep_failed")).toEqual({
        level: "error",
        record: { event: "meter.sweep_failed", error_class: "ECONNRESET" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the journal (§7.2 step 8)", () => {
  it("withdraws the reservation when the reserve record can't be written, and refuses with journal_unwritable", async () => {
    const r = await rig();
    const dir = join(r.stateDir, "journal");
    await mkdir(dir, { mode: 0o700 });
    await chmod(dir, 0o500);
    r.clock.now += 1_000;
    r.db.statements.length = 0;
    const result = await r.meter.admit(request());
    expect(result).toEqual({
      ok: false,
      refusal: "degraded",
      decision: {
        kind: "degraded",
        cause: "journal_unwritable",
        detail:
          "The local model is unavailable, and metered calls are refused because the call journal can't be written.",
        since: new Date(T0 + 1_000).toISOString().slice(0, 19) + "Z",
      },
    });
    // The compensation: its own transaction, the state lock first, the reservation gone, its rows back to zero.
    const txs = transactions(r.db.statements);
    expect(txs).toHaveLength(2);
    expect(txs[1]?.[0]).toBe(LOCK_STATE);
    expect(txs[1]?.[1]).toMatch(/^DELETE FROM gateway\.reservations WHERE id = \$1/);
    expect((await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.reservations")).rows).toEqual([{ n: 0 }]);
    expect((await meters(r)).every((m) => m.reserved_micro === 0)).toBe(true);
    expect(r.meter.counters()).toEqual({ inFlight: 0, lastMinute: 0 });
    expect(r.logged.find((l) => l.record.event === "journal.unwritable")?.record).toEqual({
      event: "journal.unwritable",
      error_class: "EACCES",
    });
    expect(r.journal.status()).toBe("unwritable");
    await invariant(r);
    // The run of failures keeps its start; once an append works again, admission does too.
    await chmod(dir, 0o700);
    const a = admitted(await r.meter.admit(request()));
    await r.meter.settle(a, answered(r));
    expect(r.journal.unwritableSince()).toBeUndefined();
  });
});

describe("rollover (§7.6)", () => {
  it("starts a new day's rows at zero and a full grant, and leaves state, crossed, and the renewal flag alone", async () => {
    const r = await rig();
    await spend(r, 20); // $2.00 of fallback: the flag is set
    expect((await stateRow(r)).fallback_awaiting_renewal).toBe(true);
    const before = await stateRow(r);
    r.clock.now += 86_400_000; // the next UTC day
    await r.db.pg.query("UPDATE gateway.stack_state SET test_clock_offset_ms = NULL"); // real time moved, not a test clock
    admitted(await r.meter.admit(request({ attribution: "metered" })));
    const next = dayKey(r.clock.now);
    expect((await meters(r)).filter((m) => m.period_key === next)).toEqual([
      {
        meter: "day",
        period_key: next,
        spent_micro: 0,
        reserved_micro: 100_000,
        allowance_micro: null,
        grant_no: null,
      },
      {
        meter: "fallback_day",
        period_key: next,
        spent_micro: 0,
        reserved_micro: 0,
        allowance_micro: 2_000_000,
        grant_no: 1,
      },
    ]);
    const after = await stateRow(r);
    expect([after.state, after.crossed, after.fallback_awaiting_renewal, after.fallback_awaiting_since]).toEqual([
      before.state,
      before.crossed,
      before.fallback_awaiting_renewal,
      before.fallback_awaiting_since,
    ]);
    // Still refused across the rollover, until a renewal (FR-030).
    const refused = await r.meter.admit(request());
    expect(!refused.ok && refused.refusal === "degraded" && refused.decision.cause).toBe("fallback_awaiting_renewal");
  });

  it("charges a call to the periods of its admission, even when it commits after midnight", async () => {
    const r = await rig();
    r.clock.now = Date.parse("2026-11-20T23:59:59.000Z");
    const a = admitted(await r.meter.admit(request({ attribution: "metered" })));
    r.clock.now = Date.parse("2026-11-21T00:00:01.000Z");
    await r.meter.settle(a, answered(r));
    expect((await r.db.pg.query<Rec>("SELECT period_day FROM gateway.ledger")).rows).toEqual([
      { period_day: "2026-11-20" },
    ]);
    expect((await meters(r)).filter((m) => m.meter === "day").map((m) => [m.period_key, m.spent_micro])).toEqual([
      ["2026-11-20", 100_000],
    ]);
  });
});

describe("the locking order (§2.1) and the reserved-micro invariant (§2.3), across a mix", () => {
  it("locks stack_state first in every transaction that writes the state or the meters", async () => {
    const r = await rig();
    const dir = join(r.stateDir, "journal");
    await spend(r, 3); // admissions and commits
    admitted(await r.meter.admit(request({ attribution: "metered" }))); // left to expire
    r.clock.now += 121_000;
    await r.meter.sweepNow(); // a sweep
    await chmod(dir, 0o500);
    await r.meter.admit(request()); // a compensation
    await chmod(dir, 0o700);
    await spend(r, 2, { attribution: "test", purpose: "contract" });
    const writing = transactions(r.db.statements).filter((t) => t.some(writes));
    expect(writing.length).toBeGreaterThanOrEqual(9);
    for (const t of writing) expect(t[0]).toBe(LOCK_STATE);
    await invariant(r);
  });
});
