// The operator's restore (spec 001 tasks.md T071; FR-019, FR-074; contracts/shared-state.md §8, step 3; spec 000's
// operator actions, amended by name): POST /admin/restore on a store restored from a backup prints the restored
// meters, sets the store uninitialized under the initialization lock, and keeps the ledger and the audit log; init
// then accepts the store, and refuses a stated value lower than a restored meter. Each write's audit row has its host.
import { afterEach, describe, expect, it } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
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
  const s = await testStack({ stack: "prod", env: { H4_HOST: "laptop" } });
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
  return s;
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
      restored: { day_usd: "1.25", month_usd: "7.50" },
    });
    expect((await s.db.pg.query("SELECT * FROM gateway.stack_state")).rows).toEqual([]);
    const health = (await s.api.inject({ method: "GET", url: "/health" })).json() as Rec;
    expect(health).toMatchObject({ store: "uninitialized", degraded_cause: "store_uninitialized" });
    const audit = await s.db.pg.query<Rec>(
      "SELECT action, host, reason FROM gateway.audit_log ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows).toEqual([
      { action: "restore", host: "laptop", reason: "Restored from the 06:00 dump after the loss." },
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
    const lower = await post(s, "/admin/init", { reason: "Carried after the restore.", day_usd: "1.00" });
    expect(lower.statusCode).toBe(409);
    expect(lower.json()).toMatchObject({ error: "below_restored_meters" });
    const ok = await post(s, "/admin/init", {
      reason: "Carried after the restore, with the providers' usage.",
      day_usd: "1.40",
      month_usd: "7.65",
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const init = await s.db.pg.query<Rec>(
      "SELECT action, host FROM gateway.audit_log WHERE action = 'init' ORDER BY id DESC LIMIT 1",
    );
    expect(init.rows).toEqual([{ action: "init", host: "laptop" }]);
  });
});
