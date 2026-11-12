// The operator's restore (spec 001 tasks.md T071; FR-019, FR-074; contracts/shared-state.md §8, step 3; spec 000's
// operator actions, amended by name): POST /admin/restore on a store restored from a backup prints the restored
// meters, sets the store uninitialized under the initialization lock, and keeps the ledger and the audit log; init
// then accepts the store, and refuses a stated value lower than a restored meter. Each write's audit row has its host.
import { afterEach, describe, expect, it } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
import { LAPTOP } from "../../src/config/hosts.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;
const stacks: TestStack[] = [];
afterEach(async () => {
  for (const s of stacks.splice(0)) await s.close();
});

const post = (s: TestStack, url: string, body: Rec) =>
  s.admin.inject({
    method: "POST",
    url,
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

/** A prod stack whose store holds what a restored dump holds: an initialized state row and the day's spend. */
async function restored(): Promise<TestStack> {
  const s = await testStack({ stack: "prod", env: { H4_HOST: LAPTOP } });
  stacks.push(s);
  const init = await post(s, "/admin/init", { reason: "The store before its loss.", confirm_zero: true });
  expect(init.statusCode, init.body).toBe(200);
  const now = Date.now();
  await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 1250000 WHERE meter = 'day' AND period_key = $1", [
    dayKey(now),
  ]);
  await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 7500000 WHERE meter = 'month' AND period_key = $1", [
    monthKey(now),
  ]);
  await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 400000 WHERE meter = 'fallback_day' AND period_key = $1", [
    dayKey(now),
  ]);
  // The capped adapter's month (spec 010, FR-022), as the dump held it.
  await s.db.pg.query(
    `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, created_at, updated_at)
     VALUES ('adapter_month', $1, 3000000, 0, now(), now())`,
    [`anthropic:${monthKey(now)}`],
  );
  return s;
}

/** The current periods' meters, spent, by meter. */
async function spent(s: TestStack): Promise<Record<string, string>> {
  const now = Date.now();
  const { rows } = await s.db.pg.query<{ meter: string; spent_micro: unknown }>(
    `SELECT meter, spent_micro FROM gateway.meters
     WHERE period_key IN ($1, $2, $3)`,
    [dayKey(now), monthKey(now), `anthropic:${monthKey(now)}`],
  );
  return Object.fromEntries(rows.map((r) => [r.meter, String(r.spent_micro)]));
}

describe("POST /admin/restore (contracts/shared-state.md §8)", () => {
  it("prints the restored meters, leaves the store uninitialized, and keeps the ledger and the audit log", async () => {
    const s = await restored();
    const auditBefore = (await s.db.pg.query<{ n: string }>("SELECT count(*) AS n FROM gateway.audit_log")).rows[0]?.n;
    const res = await post(s, "/admin/restore", { reason: "Restored from the 06:00 dump after the loss." });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      stack: "prod",
      status: "uninitialized",
      restored: { day_usd: "1.25", month_usd: "7.50", crossed: [], fallback_awaiting_renewal: true },
    });
    expect((await s.db.pg.query("SELECT * FROM gateway.stack_state")).rows).toEqual([]);
    const health = (await s.api.inject({ method: "GET", url: "/health" })).json() as Rec;
    expect(health).toMatchObject({ store: "uninitialized", degraded_cause: "store_uninitialized" });
    const audit = await s.db.pg.query<Rec>(
      "SELECT action, host, reason FROM gateway.audit_log ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows).toEqual([
      { action: "restore", host: LAPTOP, reason: "Restored from the 06:00 dump after the loss." },
    ]);
    const auditAfter = (await s.db.pg.query<{ n: string }>("SELECT count(*) AS n FROM gateway.audit_log")).rows[0]?.n;
    expect(Number(auditAfter)).toBe(Number(auditBefore) + 1);
  });

  it("refuses without a reason, and on a store that is uninitialized already", async () => {
    const s = await restored();
    expect((await post(s, "/admin/restore", {})).statusCode).toBe(400);
    expect((await post(s, "/admin/restore", { reason: "The first restore of the day." })).statusCode).toBe(200);
    const again = await post(s, "/admin/restore", { reason: "The second restore of the day." });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: "not_initialized" });
  });

  it("lets init accept the restored store, and refuses a stated value lower than a restored meter", async () => {
    const s = await restored();
    expect((await post(s, "/admin/restore", { reason: "Restored from the 06:00 dump." })).statusCode).toBe(200);
    const lower = await post(s, "/admin/init", { reason: "Carried after the restore.", stated: { day_usd: "1.00" } });
    expect(lower.statusCode).toBe(409);
    expect(lower.json()).toMatchObject({ error: "below_restored_meters" });
    const ok = await post(s, "/admin/init", {
      reason: "Carried after the restore, with the providers' usage.",
      stated: { day_usd: "1.40", month_usd: "7.65" },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const init = await s.db.pg.query<Rec>(
      "SELECT action, host FROM gateway.audit_log WHERE action = 'init' ORDER BY id DESC LIMIT 1",
    );
    expect(init.rows).toEqual([{ action: "init", host: LAPTOP }]);
  });

  // Group 6's review, I-3: the restored meters are init's fourth candidate, so a meter left unstated keeps its
  // restored value, the capped adapter's month among them, and a restored store needs no zero confirmed.
  it("keeps each meter the init leaves unstated at its restored value, a second restore in the month too", async () => {
    const s = await restored();
    expect((await post(s, "/admin/restore", { reason: "Restored from the 06:00 dump." })).statusCode).toBe(200);
    const first = await post(s, "/admin/init", {
      reason: "Carried after the restore: the month's spend from the providers.",
      stated: { month_usd: "7.65" },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(await spent(s)).toMatchObject({
      day: "1250000",
      month: "7650000",
      fallback_day: "400000",
      adapter_month: "3000000",
    });
    // The same month, the store lost again and restored from a dump that holds the first init's meters.
    expect((await post(s, "/admin/restore", { reason: "Restored again, from the 07:00 dump." })).statusCode).toBe(200);
    const second = await post(s, "/admin/init", { reason: "Carried after the second restore, nothing stated." });
    expect(second.statusCode, second.body).toBe(200);
    expect(await spent(s)).toMatchObject({
      day: "1250000",
      month: "7650000",
      fallback_day: "400000",
      adapter_month: "3000000",
    });
  });
});
