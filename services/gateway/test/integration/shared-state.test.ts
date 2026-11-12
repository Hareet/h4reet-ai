// Two gateways on one store (spec 001 tasks.md T060; FR-017, FR-019; data-model.md §1.3; plan §10): spec 000's
// meter and kill switch, shared by both production hosts, as each host's gateway runs against the tunnel end's
// shared state. Two whole gateway stacks, each with its own services, adapters, and journal, use one PGlite, whose
// one connection interleaves their statements as two pools would interleave sessions (test/helpers/pglite.ts).
//
// - Paid admission at the global limit, from both at once, never passes the day's ceiling beyond spec 000's
//   in-flight bound, here the two gateways' four metered calls in flight each, at $0.10 a call.
// - The period's rows are made once at the UTC boundary, whichever gateway admits first, and count both.
// - A crossing alerts once, whichever gateway's commit crossed.
// - The kill switch one gateway trips is the other's at its next request: the state is read at request start.
import { afterEach, describe, expect, it } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
import { testDatabase, type TestDatabase } from "../helpers/pglite.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

const stacks: TestStack[] = [];
const stubs: StubOpenAI[] = [];
const dbs: TestDatabase[] = [];
afterEach(async () => {
  for (const s of stacks.splice(0)) await s.close();
  for (const stub of stubs.splice(0)) await stub.close();
  for (const db of dbs.splice(0)) await db.close();
});

/** Two dev gateways with the synthetic fallback on one store, the local model down for both, and a clock to move. */
async function pair(
  startMs: number,
): Promise<{ a: TestStack; b: TestStack; db: TestDatabase; clock: { now: number } }> {
  const db = await testDatabase();
  dbs.push(db);
  const clock = { now: startMs };
  const realNow = () => clock.now;
  const make = async (): Promise<TestStack> => {
    const stub = await stubOpenAI({ model: "stand-in" });
    stub.setHealth({ status: 503 });
    stubs.push(stub);
    const s = await testStack({ fallback: true, db, realNow, env: { LOCAL_MODEL_BASE_URL: stub.baseUrl } });
    stacks.push(s);
    return s;
  };
  const a = await make();
  const b = await make();
  const init = await a.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...a.auth(), "content-type": "application/json" },
    payload: JSON.stringify({ reason: "Two gateways, one shared state.", confirm_zero: true, renew: true }),
  });
  expect(init.statusCode, init.body).toBe(200);
  await Promise.all([a.services.gateway.probeAll(), b.services.gateway.probeAll()]);
  return { a, b, db, clock };
}

let address = 0;
const hello = (s: TestStack) =>
  s.api.inject({
    method: "POST",
    url: "/hello",
    // A client each, so no per-client cap refuses before the global limit and the meter do.
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${(address++ % 250) + 1}` },
    payload: JSON.stringify({}),
  });

const spent = async (db: TestDatabase, meter: string, key: string): Promise<bigint> => {
  const { rows } = await db.pg.query<{ spent_micro: string }>(
    "SELECT spent_micro FROM gateway.meters WHERE meter = $1 AND period_key = $2",
    [meter, key],
  );
  return BigInt(rows[0]?.spent_micro ?? "0");
};

describe("two gateways on one shared state (FR-017)", () => {
  it("admits paid calls from both at once without passing the day's ceiling beyond the in-flight bound", async () => {
    const start = Date.UTC(2026, 10, 13, 12, 0, 0);
    const { a, b, db } = await pair(start);
    const day = dayKey(start);
    await db.pg.query("UPDATE gateway.meters SET spent_micro = 4500000 WHERE meter = 'day' AND period_key = $1", [day]);
    const answers = await Promise.all(Array.from({ length: 24 }, (_, i) => hello(i % 2 === 0 ? a : b)));
    const statuses = answers.map((r) => r.statusCode);
    expect(statuses.filter((c) => c === 200).length).toBeGreaterThanOrEqual(1);
    for (const code of statuses) expect([200, 429, 503]).toContain(code);
    // spec 000's bound: what was in flight when the ceiling was reached, at most 4 a gateway at $0.10 each.
    expect(await spent(db, "day", day)).toBeLessThanOrEqual(5_000_000n + 2n * 4n * 100_000n);
    expect(await spent(db, "day", day)).toBeGreaterThanOrEqual(5_000_000n);
    const reserved = await db.pg.query<{ n: number | string }>("SELECT count(*) AS n FROM gateway.reservations");
    expect(Number(reserved.rows[0]?.n)).toBe(0);
    // Each row names the host whose gateway wrote it (0007, from H4_HOST: dev's is the laptop).
    const hosts = await db.pg.query<Rec>("SELECT DISTINCT host FROM gateway.ledger");
    expect(hosts.rows).toEqual([{ host: "laptop" }]);
  });

  it("is tripped for both by the commit of either, and alerts the crossing once", async () => {
    const start = Date.UTC(2026, 10, 13, 12, 0, 0);
    const { a, b, db } = await pair(start);
    const day = dayKey(start);
    await db.pg.query("UPDATE gateway.meters SET spent_micro = 4900000 WHERE meter = 'day' AND period_key = $1", [day]);
    expect((await hello(a)).statusCode).toBe(200); // $5.00 on a's commit: the trip
    const onB = await hello(b);
    expect(onB.statusCode).toBe(503);
    expect(onB.headers["x-h4-degraded-cause"]).toBe("kill_switch_tripped");
    const onA = await hello(a);
    expect(onA.headers["x-h4-degraded-cause"]).toBe("kill_switch_tripped");
    const trips = await db.pg.query<Rec>("SELECT dedupe_key FROM gateway.alert_outbox WHERE kind = 'trip'");
    expect(trips.rows).toHaveLength(1);
  });

  it("makes the new day's rows once at the UTC boundary, counting both gateways' calls", async () => {
    const before = Date.UTC(2026, 10, 13, 23, 59, 59);
    const { a, b, db, clock } = await pair(before);
    clock.now = Date.UTC(2026, 10, 14, 0, 0, 1);
    const answers = await Promise.all([hello(a), hello(b), hello(a), hello(b)]);
    const answered = answers.filter((r) => r.statusCode === 200).length;
    expect(answered).toBeGreaterThanOrEqual(2);
    const day = dayKey(clock.now);
    const rows = await db.pg.query<Rec>(
      "SELECT meter, period_key FROM gateway.meters WHERE period_key = $1 OR period_key = $2 ORDER BY meter",
      [day, monthKey(clock.now)],
    );
    expect(rows.rows).toEqual([
      { meter: "day", period_key: day },
      { meter: "fallback_day", period_key: day },
      { meter: "month", period_key: monthKey(clock.now) },
    ]);
    expect(await spent(db, "day", day)).toBe(BigInt(answered) * 100_000n);
    expect(await spent(db, "fallback_day", day)).toBe(BigInt(answered) * 100_000n);
  });
});
