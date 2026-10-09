// The store's initialization (tasks.md T050, T055; data-model.md §3, §8; contracts/operator-admin.md §2.3): POST
// /admin/init on PGlite, with a journal written into a fresh state directory as the gateway writes it.
// - each meter takes the largest candidate: the surviving ledger (with any reservations at their maximum), the
//   journal (paired reserve and commit records), and the values the operator states;
// - the newest init record in the journal is a floor, so a second wipe after a stated start rebuilds the stated value
//   plus the spend since;
// - nothing is zeroed silently: 409 confirm_zero_required, then success with confirm_zero;
// - renewal stays pending unless `renew`; the allowance is today's last renewal;
// - 409 already_initialized once there is a state row;
// - a torn last line, and another stack's records, are skipped and counted;
// - in dev, the newest clock record restores the test clock.
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
import { connectionLost, statementRefused } from "../helpers/pglite.js";
import { testStack, type TestStack } from "../helpers/stack.js";

const HEX32 = "0123456789abcdef0123456789abcdef";
const HEX64 = "ab".repeat(32);
const DAY = 86_400_000;

const stacks: TestStack[] = [];
afterEach(async () => {
  for (const s of stacks.splice(0)) {
    await chmod(join(s.stateDir, "journal"), 0o700).catch(() => {});
    await s.close();
  }
});
async function stack(o: Parameters<typeof testStack>[0] = {}): Promise<TestStack> {
  const s = await testStack(o);
  stacks.push(s);
  return s;
}

const NOW = Date.now();
const TODAY = dayKey(NOW);
const MONTH = monthKey(NOW);
/** Another day of this month: the month meter counts it, the day meters don't. */
const OTHER_DAY = TODAY.endsWith("-01") ? `${MONTH}-02` : `${MONTH}-01`;
const at = (ms: number): string => new Date(ms).toISOString();

type Rec = Record<string, unknown>;
const base = (kind: string, ts: number, stackName = "dev"): Rec => ({ v: 1, kind, ts: at(ts), stack: stackName });
const reserve = (
  id: string,
  attribution: string,
  max: number,
  o: { ts?: number; day?: string; month?: string } = {},
) => ({
  ...base("reserve", o.ts ?? NOW - 60_000),
  reservation_id: id,
  attribution,
  adapter: "synthetic",
  provider: "synthetic",
  model: "metered-test",
  price_version: "2026-10-08.1",
  max_micro: max,
  period_day: o.day ?? TODAY,
  period_month: o.month ?? MONTH,
  expires_at: at((o.ts ?? NOW - 60_000) + 120_000),
});
const commit = (
  id: string,
  attribution: string,
  cost: number,
  o: { ts?: number; day?: string; month?: string; stack?: string } = {},
) => ({
  ...base("commit", o.ts ?? NOW - 59_000, o.stack),
  reservation_id: id,
  ledger_id: randomUUID(),
  cost_micro: cost,
  cost_basis: "usage",
  outcome: "ok",
  error_kind: null,
  input_tokens: 0,
  output_tokens: 1000,
  cache_read_tokens: 0,
  attribution,
  period_day: o.day ?? TODAY,
  period_month: o.month ?? MONTH,
  trace_id: HEX32,
});
const operator = (action: string, ts: number, fields: Rec) => ({
  ...base("operator", ts),
  action,
  audit_id: 7,
  actor: "operator:dev#abcdef01",
  period_day: TODAY,
  period_month: MONTH,
  ...fields,
});

async function writeJournal(s: TestStack, month: string, lines: (Rec | string)[], o: { newline?: boolean } = {}) {
  const dir = join(s.stateDir, "journal");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const text = lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n");
  await writeFile(join(dir, `${month}.jsonl`), o.newline === false ? text : `${text}\n`, { mode: 0o600 });
}

async function journalLines(s: TestStack, month: string): Promise<Rec[]> {
  const text = await readFile(join(s.stateDir, "journal", `${month}.jsonl`), "utf8");
  return text
    .split("\n")
    .filter((l) => l.startsWith("{") && l.endsWith("}"))
    .map((l) => JSON.parse(l) as Rec);
}

let n = 0;
async function ledgerRow(s: TestStack, attribution: string, cost: number, o: { day?: string; month?: string } = {}) {
  n += 1;
  const row = {
    id: randomUUID(),
    reservation_id: randomUUID(),
    ts: at(NOW - 3_600_000),
    started_at: at(NOW - 3_600_000),
    stack: "dev",
    request_id: HEX32,
    trace_id: HEX32,
    purpose: "synthetic",
    route_decision: attribution === "fallback" ? "fallback" : "metered",
    route_reason: attribution === "fallback" ? "local_failed" : null,
    attribution,
    adapter_id: "synthetic",
    provider: "synthetic",
    request_model: "metered-test",
    response_model: "metered-test",
    input_tokens: 0,
    output_tokens: 1000 + n,
    latency_ms: 3,
    finish_reason: "stop",
    outcome: "ok",
    error_kind: null,
    cost_micro: cost,
    cost_basis: "usage",
    price_version: "2026-10-08.1",
    routing_sha: HEX64,
    period_day: o.day ?? TODAY,
    period_month: o.month ?? MONTH,
  };
  const keys = Object.keys(row);
  await s.db.pg.query(
    `INSERT INTO gateway.ledger (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(row),
  );
}

async function liveReservation(s: TestStack, attribution: string, max: number) {
  await s.db.pg.query(
    `INSERT INTO gateway.reservations (id, attribution, adapter_id, provider, model, price_version, max_micro,
       period_day, period_month, created_at, expires_at, request_id, trace_id, purpose, route_reason, routing_sha)
     VALUES ($1, $2, 'synthetic', 'synthetic', 'metered-test', '2026-10-08.1', $3, $4, $5, now(),
       now() + interval '120 seconds', $6, $6, 'synthetic', $7, $8)`,
    [randomUUID(), attribution, max, TODAY, MONTH, HEX32, attribution === "fallback" ? "local_failed" : null, HEX64],
  );
}

const init = (s: TestStack, body: Rec) =>
  s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify(body),
  });

const REASON = "New host; the journal survived on the bind mount.";

describe("POST /admin/init: the candidates and the max rule (data-model.md §8 steps 4–5)", () => {
  it("rebuilds each meter from its largest candidate: the ledger, the journal, and the stated values", async () => {
    const s = await stack();
    await ledgerRow(s, "fallback", 300_000);
    await ledgerRow(s, "metered", 1_000_000, { day: OTHER_DAY });
    await liveReservation(s, "fallback", 50_000);
    await writeJournal(s, MONTH, [
      reserve("j1", "fallback", 600_000),
      commit("j1", "fallback", 500_000),
      reserve("j2", "metered", 200_000), // no commit: counted at its maximum
      commit("j3", "test", 100_000), // no reserve: counted at its own cost
      reserve("j4", "metered", 70_000, { day: OTHER_DAY }), // this month, another day
    ]);

    const res = await init(s, { reason: REASON, stated: { day_usd: "0.50", month_usd: 9.4 } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Rec;
    expect(Object.keys(body)).toEqual([
      "action",
      "audit_id",
      "state",
      "fallback_awaiting_renewal",
      "periods",
      "meters",
      "journal",
      "confirm_zero",
      "renewed",
      "clock_offset_ms",
    ]);
    expect(body).toEqual({
      action: "init",
      audit_id: expect.any(Number),
      state: "normal",
      fallback_awaiting_renewal: true,
      periods: { day: TODAY, month: MONTH },
      meters: {
        day: { spent_micro_usd: 800_000, sources: { ledger: 350_000, journal: 800_000, stated: 500_000 } },
        month: { spent_micro_usd: 9_400_000, sources: { ledger: 1_350_000, journal: 870_000, stated: 9_400_000 } },
        fallback_day: {
          spent_micro_usd: 500_000,
          allowance_micro_usd: 2_000_000,
          grant: 1,
          sources: { ledger: 350_000, journal: 500_000, stated: null },
        },
      },
      journal: { files_read: [`journal/${MONTH}.jsonl`], records: 5, lines_skipped: 0, append: "ok" },
      confirm_zero: false,
      renewed: false,
      clock_offset_ms: null,
    });
    const auditId = body.audit_id as number;

    // The write, in one transaction (§8 step 8).
    const state = (await s.db.pg.query<Rec>("SELECT * FROM gateway.stack_state")).rows;
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      stack: "dev",
      env: "dev",
      state: "normal",
      crossed: [],
      fallback_awaiting_renewal: true,
      initialized_by: `operator:dev#${s.tokenSha256.slice(0, 8)}`,
      test_clock_offset_ms: null,
    });
    const meters = (
      await s.db.pg.query<Rec>(
        "SELECT meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no FROM gateway.meters ORDER BY meter",
      )
    ).rows;
    expect(meters).toEqual([
      {
        meter: "day",
        period_key: TODAY,
        spent_micro: 800_000,
        reserved_micro: 0,
        allowance_micro: null,
        grant_no: null,
      },
      {
        meter: "fallback_day",
        period_key: TODAY,
        spent_micro: 500_000,
        reserved_micro: 0,
        allowance_micro: 2_000_000,
        grant_no: 1,
      },
      {
        meter: "month",
        period_key: MONTH,
        spent_micro: 9_400_000,
        reserved_micro: 0,
        allowance_micro: null,
        grant_no: null,
      },
    ]);
    // A leftover reservation is counted at its maximum in the ledger's candidate, and starts no reservation over.
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.reservations")).rows).toEqual([{ n: 0 }]);
    const audit = (await s.db.pg.query<Rec>("SELECT * FROM gateway.audit_log")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      id: auditId,
      stack: "dev",
      actor: `operator:dev#${s.tokenSha256.slice(0, 8)}`,
      action: "init",
      reason: REASON,
      before: null,
    });
    expect(audit[0]?.detail).toMatchObject({
      candidates: {
        day: { ledger: 350_000, journal_calls: 800_000, journal_floor: null, stated: 500_000 },
        month: { ledger: 1_350_000, journal_calls: 870_000, journal_floor: null, stated: 9_400_000 },
        fallback_day: { ledger: 350_000, journal_calls: 500_000, journal_floor: null, stated: null },
      },
      chosen: { day: 800_000, month: 9_400_000, fallback_day: 500_000 },
      confirm_zero: false,
      renewed: false,
      lines_skipped: 0,
    });
    // The confirmation alert, queued in the same transaction (operator-admin.md §1.3; alerts.md §3).
    const outbox = (await s.db.pg.query<Rec>("SELECT * FROM gateway.alert_outbox")).rows;
    expect(outbox).toHaveLength(1);
    const fingerprint = s.tokenSha256.slice(0, 8);
    expect(outbox[0]).toMatchObject({
      dedupe_key: `dev:operator_action:init:${auditId}`,
      kind: "operator_action",
      stack: "dev",
      telegram_status: "pending",
      email_status: "pending",
      subject: `[dev] OPERATOR ACTION: store initialized by operator #${fingerprint}`,
    });
    expect(String(outbox[0]?.body).split("\n")).toEqual([
      `[dev] OPERATOR ACTION: store initialized by operator #${fingerprint}`,
      "Daily: 0.80 / 5.00 USD (warning 3.50) · Month: 9.40 / 20.00 (warning 14.00) · Fallback today: 0.50 / 2.00 (grant 1) (synthetic spend)",
      expect.stringMatching(
        new RegExp(
          `^Runtime: normal · Fallback: none · \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z · id dev:operator_action:init:${auditId}$`,
        ),
      ),
      "Meters rebuilt from the journal and the stated values; renewal pending.",
      "Runbook: docs/runbooks/store-initialization.md",
    ]);
    expect(String(outbox[0]?.body)).not.toContain(REASON); // the reason never goes into an alert (§1.2)
    expect(String(outbox[0]?.body)).not.toContain(s.tokenSha256);
    // The journal's operator record follows the commit (§8 step 9).
    expect((await journalLines(s, MONTH)).at(-1)).toMatchObject({
      v: 1,
      kind: "operator",
      stack: "dev",
      action: "init",
      audit_id: auditId,
      actor: `operator:dev#${fingerprint}`,
      period_day: TODAY,
      period_month: MONTH,
      day_micro: 800_000,
      month_micro: 9_400_000,
      fallback_day_micro: 500_000,
      confirm_zero: false,
      renewed: false,
    });
    expect(s.logged.find((l) => l.record.event === "operator.init")?.record).toMatchObject({
      event: "operator.init",
      "event.name": "h4.audit",
      audit_id: auditId,
      action: "init",
      reason: REASON,
    });
    // And the stack answers: GET /health reports the store initialized and the journal written.
    const health = (await s.api.inject({ method: "GET", url: "/health" })).json() as Rec;
    expect(health).toMatchObject({ store: "ok", state: "normal", journal: "ok" });
  });

  it("takes the newest init record as a floor: a second wipe rebuilds the stated value plus the spend since (§3 step 6)", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [
      commit("before", "fallback", 400_000, { ts: NOW - 3 * 3_600_000 }), // before the init: in its chosen values
      operator("init", NOW - 2 * 3_600_000, {
        day_micro: 1_200_000,
        month_micro: 9_400_000,
        fallback_day_micro: 300_000,
        confirm_zero: false,
        renewed: false,
      }),
      reserve("after", "fallback", 150_000, { ts: NOW - 3_600_000 }),
      commit("after", "fallback", 100_000, { ts: NOW - 3_599_000 }),
    ]);
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { meters: unknown }).meters).toEqual({
      day: { spent_micro_usd: 1_300_000, sources: { ledger: 0, journal: 1_300_000, stated: null } },
      month: { spent_micro_usd: 9_500_000, sources: { ledger: 0, journal: 9_500_000, stated: null } },
      fallback_day: {
        spent_micro_usd: 500_000,
        allowance_micro_usd: 2_000_000,
        grant: 1,
        sources: { ledger: 0, journal: 500_000, stated: null },
      },
    });
    const detail = (await s.db.pg.query<{ detail: Rec }>("SELECT detail FROM gateway.audit_log")).rows[0]?.detail;
    expect(detail?.candidates).toMatchObject({
      day: { journal_calls: 500_000, journal_floor: 1_300_000 },
      month: { journal_calls: 500_000, journal_floor: 9_500_000 },
      fallback_day: { journal_calls: 500_000, journal_floor: 400_000 },
    });
  });

  it("never lowers a meter: a stated value below the rebuilt one is a candidate, not an override", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 1_500_000)]);
    const res = await init(s, { reason: REASON, stated: { day_usd: "0.10", fallback_today_usd: 0 } });
    expect((res.json() as { meters: { day: Rec; fallback_day: Rec } }).meters).toMatchObject({
      day: { spent_micro_usd: 1_500_000, sources: { stated: 100_000 } },
      fallback_day: { spent_micro_usd: 1_500_000, sources: { stated: 0 } },
    });
  });
});

describe("POST /admin/init: nothing is zeroed silently (§8 step 7)", () => {
  it("refuses with 409 confirm_zero_required when no record survives and nothing is stated", async () => {
    const s = await stack();
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "confirm_zero_required", detail: expect.any(String) });
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.stack_state")).rows).toEqual([{ n: 0 }]);
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.audit_log")).rows).toEqual([{ n: 0 }]);
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.alert_outbox")).rows).toEqual([{ n: 0 }]);

    const ok = await init(s, { reason: REASON, confirm_zero: true });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      confirm_zero: true,
      meters: {
        day: { spent_micro_usd: 0, sources: { ledger: 0, journal: 0, stated: null } },
        month: { spent_micro_usd: 0 },
        fallback_day: { spent_micro_usd: 0, allowance_micro_usd: 2_000_000, grant: 1 },
      },
      journal: { files_read: [], records: 0, lines_skipped: 0, append: "ok" },
    });
    const detail = (await s.db.pg.query<{ detail: Rec }>("SELECT detail FROM gateway.audit_log")).rows[0]?.detail;
    expect(detail).toMatchObject({ confirm_zero: true });
    // The journal it started: a 0700 directory holding a 0600 file.
    const dir = join(s.stateDir, "journal");
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, `${MONTH}.jsonl`))).mode & 0o777).toBe(0o600);
    const body = (await s.db.pg.query<{ body: string }>("SELECT body FROM gateway.alert_outbox")).rows[0]?.body;
    expect(body).toContain("Meters rebuilt from no surviving record, zero confirmed; renewal pending.");
  });

  it("counts a stated zero as stated: the operator said so", async () => {
    const s = await stack();
    const res = await init(s, { reason: REASON, stated: { day_usd: 0 } });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /admin/init: renewal and the allowance (§8 steps 6 and 8)", () => {
  it("leaves renewal pending unless renew, keeping today's last renewal as the allowance", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [
      commit("c", "fallback", 2_000_000),
      operator("renew", NOW - 60_000, { allowance_micro: 4_000_000, grant_no: 2 }),
    ]);
    const res = await init(s, { reason: REASON });
    expect(res.json()).toMatchObject({
      fallback_awaiting_renewal: true,
      renewed: false,
      meters: { fallback_day: { spent_micro_usd: 2_000_000, allowance_micro_usd: 4_000_000, grant: 2 } },
    });
    const state = (
      await s.db.pg.query<Rec>("SELECT fallback_awaiting_renewal, fallback_awaiting_since FROM gateway.stack_state")
    ).rows[0];
    expect(state?.fallback_awaiting_renewal).toBe(true);
    expect(state?.fallback_awaiting_since).not.toBeNull();
  });

  it("with renew, grants a fresh $2 on top of the rebuilt fallback spend, and clears the flag", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 500_000)]);
    const res = await init(s, { reason: REASON, renew: true });
    expect(res.json()).toMatchObject({
      fallback_awaiting_renewal: false,
      renewed: true,
      meters: { fallback_day: { spent_micro_usd: 500_000, allowance_micro_usd: 2_500_000, grant: 2 } },
    });
    const state = (
      await s.db.pg.query<Rec>("SELECT fallback_awaiting_renewal, fallback_awaiting_since FROM gateway.stack_state")
    ).rows[0];
    expect(state).toEqual({ fallback_awaiting_renewal: false, fallback_awaiting_since: null });
    expect((await journalLines(s, MONTH)).at(-1)).toMatchObject({
      kind: "operator",
      action: "init",
      renewed: true,
      allowance_micro: 2_500_000,
      grant_no: 2,
    });
    const body = (await s.db.pg.query<{ body: string }>("SELECT body FROM gateway.alert_outbox")).rows[0]?.body;
    expect(body).toContain("renewal granted.");
  });
});

describe("POST /admin/init: refusals", () => {
  it("answers 409 already_initialized once the state row exists, and writes nothing more", async () => {
    const s = await stack();
    expect((await init(s, { reason: REASON, confirm_zero: true })).statusCode).toBe(200);
    const again = await init(s, { reason: REASON, confirm_zero: true });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: "already_initialized" });
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.audit_log")).rows).toEqual([{ n: 1 }]);
  });

  it("answers 409 journal_unreadable when the journal directory exists but can't be read", async () => {
    const s = await stack();
    const dir = join(s.stateDir, "journal");
    await mkdir(dir, { mode: 0o700 });
    await chmod(dir, 0o000);
    const res = await init(s, { reason: REASON, confirm_zero: true });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "journal_unreadable" });
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.stack_state")).rows).toEqual([{ n: 0 }]);
  });

  it("answers 503 store_unreachable while the store can't be read", async () => {
    const s = await stack({ storeDown: true });
    const res = await init(s, { reason: REASON, confirm_zero: true });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "store_unreachable" });
  });

  it("answers 415 for a body that isn't JSON, or none, the same way the listener's parsers do", async () => {
    const s = await stack();
    for (const headers of [{}, { "content-type": "text/plain" }]) {
      const res = await s.admin.inject({
        method: "POST",
        url: "/admin/init",
        headers: { ...s.auth(), ...headers },
        ...("content-type" in headers ? { payload: "reason=hello there" } : {}),
      });
      expect(res.statusCode, JSON.stringify(headers)).toBe(415);
      expect(res.json()).toEqual({ error: "unsupported_media_type", request_id: res.headers["x-request-id"] });
    }
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.stack_state")).rows).toEqual([{ n: 0 }]);
  });

  it("answers 400 with field body for JSON that doesn't parse, as the api listener does (gateway-http.md §2.5.4)", async () => {
    const s = await stack();
    const res = await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: '{"reason": "unterminated',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "invalid_request",
      field: "body",
      detail: "the request is malformed",
      request_id: res.headers["x-request-id"],
    });
    expect(res.body).not.toContain("unterminated");
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.stack_state")).rows).toEqual([{ n: 0 }]);
  });

  it("validates the reason (§1.2) and the stated values, naming the field and never echoing a value", async () => {
    const s = await stack();
    const cases: [Rec, string][] = [
      [{}, "reason"],
      [{ reason: "too short" }, "reason"],
      [{ reason: "x".repeat(501) }, "reason"],
      [{ reason: "has a\nnewline in it" }, "reason"],
      [{ reason: 42 }, "reason"],
      [{ reason: REASON, stated: { day_usd: "1.2345678" } }, "stated.day_usd"],
      [{ reason: REASON, stated: { month_usd: -1 } }, "stated.month_usd"],
      [{ reason: REASON, stated: { fallback_today_usd: "1e3" } }, "stated.fallback_today_usd"],
      [{ reason: REASON, stated: { weekly_usd: "1" } }, "stated"],
      [{ reason: REASON, stated: "1.00" }, "stated"],
      [{ reason: REASON, confirm_zero: "yes" }, "confirm_zero"],
      [{ reason: REASON, renew: 1 }, "renew"],
      [{ reason: REASON, extra: true }, "body"],
    ];
    for (const [body, field] of cases) {
      const res = await init(s, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request", field, detail: expect.any(String) });
      expect(res.body).not.toContain("1.2345678");
    }
    expect((await init(s, { reason: "x".repeat(10) })).statusCode).toBe(409); // 10 characters is enough
    expect((await init(s, { reason: `  ${"y".repeat(10)}  ` })).statusCode).toBe(409); // counted after trimming
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.stack_state")).rows).toEqual([{ n: 0 }]);
  });
});

describe("the journal as a rebuild reads it (data-model.md §3)", () => {
  it("skips and counts a torn last line, a line that isn't a record, and another stack's records", async () => {
    const s = await stack();
    await writeJournal(
      s,
      MONTH,
      [
        commit("ok", "fallback", 100_000),
        commit("theirs", "fallback", 900_000, { stack: "prod" }),
        "not a record {",
        '{"v":1,"kind":"commit","ts":"20', // torn by a crash mid-write
      ],
      { newline: false },
    );
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      journal: { files_read: [`journal/${MONTH}.jsonl`], records: 1, lines_skipped: 3 },
      meters: { day: { spent_micro_usd: 100_000 } },
    });
  });

  it("reads this month's file and the one before, and counts only records of the current periods", async () => {
    const s = await stack();
    const lastMonth = monthKey(Date.UTC(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)) - 2, 15));
    await writeJournal(s, lastMonth, [commit("old", "metered", 300_000, { day: `${lastMonth}-15`, month: lastMonth })]);
    await writeJournal(s, MONTH, [commit("new", "metered", 200_000)]);
    const res = await init(s, { reason: REASON });
    expect(res.json()).toMatchObject({
      journal: { files_read: [`journal/${MONTH}.jsonl`, `journal/${lastMonth}.jsonl`], records: 2 },
      meters: { day: { spent_micro_usd: 200_000 }, month: { spent_micro_usd: 200_000 } },
    });
  });

  it("restores dev's test clock from the newest clock record, and rebuilds the periods it was written in (§8 step 2)", async () => {
    const s = await stack();
    const offset = 40 * DAY;
    const later = NOW + offset;
    await writeJournal(s, monthKey(NOW + DAY), [
      { ...base("clock", NOW + DAY), offset_ms: DAY, gateway_time: at(NOW + DAY), audit_id: 2 },
    ]);
    await writeJournal(s, monthKey(later), [
      { ...base("clock", later), offset_ms: offset, gateway_time: at(later), audit_id: 3 },
      commit("future", "fallback", 250_000, { ts: later + 1_000, day: dayKey(later), month: monthKey(later) }),
    ]);
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      clock_offset_ms: offset,
      periods: { day: dayKey(later), month: monthKey(later) },
      meters: { day: { spent_micro_usd: 250_000 }, fallback_day: { spent_micro_usd: 250_000 } },
    });
    const state = (await s.db.pg.query<Rec>("SELECT test_clock_offset_ms FROM gateway.stack_state")).rows[0];
    expect(Number(state?.test_clock_offset_ms)).toBe(offset);
    const health = (await s.api.inject({ method: "GET", url: "/health" })).json() as Rec;
    expect((health.test_machinery as Rec).clock_offset_ms).toBe(offset);
    expect(Date.parse(String(health.time)) - Date.parse(String(health.real_time))).toBe(offset);
  });

  it("skips and counts a clock record outside dev, where no test clock exists", async () => {
    const s = await stack({ stack: "prod" });
    await writeJournal(s, MONTH, [
      { ...base("clock", NOW - 60_000, "prod"), offset_ms: DAY, gateway_time: at(NOW + DAY), audit_id: 2 },
      { ...commit("p", "test", 100_000), stack: "prod" },
    ]);
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      clock_offset_ms: null,
      journal: { records: 1, lines_skipped: 1 },
      meters: { day: { spent_micro_usd: 100_000 } },
    });
  });

  it("reports a failed append in the response and in a journal_failed audit row, without undoing the init", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 100_000)]);
    const dir = join(s.stateDir, "journal");
    await chmod(join(dir, `${MONTH}.jsonl`), 0o400);
    await chmod(dir, 0o500);
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { audit_id: number; journal: Rec };
    expect(body.journal).toMatchObject({ append: "unwritable" });
    const audit = (await s.db.pg.query<Rec>("SELECT action, actor, reason, detail FROM gateway.audit_log ORDER BY id"))
      .rows;
    expect(audit).toEqual([
      expect.objectContaining({ action: "init" }),
      {
        action: "journal_failed",
        actor: "gateway",
        reason: null,
        detail: { audit_id: body.audit_id, error_class: "EACCES" },
      },
    ]);
    expect((await s.db.pg.query("SELECT state FROM gateway.stack_state")).rows).toEqual([{ state: "normal" }]);
    const health = (await s.api.inject({ method: "GET", url: "/health" })).json() as Rec;
    expect(health.journal).toBe("unwritable");
  });
});

describe("POST /admin/init when COMMIT's answer is lost, or the store refuses a statement (tasks.md T072)", () => {
  const stateRow = async (s: TestStack) =>
    (await s.db.pg.query<Rec>("SELECT initialized_by FROM gateway.stack_state")).rows;

  it("finds its own write after a lost acknowledgement: it appends the init record and answers 200", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 100_000)]);
    // COMMIT reaches the server and lands; the connection drops before its acknowledgement comes back.
    let dropped = false;
    s.db.hook = (text, phase) => {
      if (text === "COMMIT" && phase === "after" && !dropped) {
        dropped = true;
        throw connectionLost();
      }
    };
    const res = await init(s, { reason: REASON });
    expect(dropped).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { audit_id: number; journal: Rec };
    expect(body.journal).toMatchObject({ append: "ok" });
    expect(await stateRow(s)).toEqual([{ initialized_by: `operator:dev#${s.tokenSha256.slice(0, 8)}` }]);
    // The floor a later rebuild needs is in the journal (data-model.md §3 step 6).
    expect((await journalLines(s, MONTH)).at(-1)).toMatchObject({
      kind: "operator",
      action: "init",
      audit_id: body.audit_id,
      day_micro: 100_000,
    });
    expect(s.logged.some((l) => l.record.event === "operator.init")).toBe(true);
  });

  it("answers 503 store_unreachable when the lost COMMIT never landed, and appends nothing", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 100_000)]);
    let dropped = false;
    s.db.hook = (text, phase) => {
      if (text === "COMMIT" && phase === "before" && !dropped) {
        dropped = true;
        throw connectionLost();
      }
    };
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "store_unreachable" });
    expect(await stateRow(s)).toEqual([]);
    expect((await journalLines(s, MONTH)).filter((r) => r.kind === "operator")).toEqual([]);
  });

  it("answers 503 when the store can't be read again either, rather than guessing", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 100_000)]);
    let down = false;
    s.db.hook = (text, phase) => {
      if (down) throw connectionLost();
      if (text === "COMMIT" && phase === "after") {
        down = true;
        throw connectionLost();
      }
    };
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "store_unreachable" });
    expect((await journalLines(s, MONTH)).filter((r) => r.kind === "operator")).toEqual([]);
  });

  it("treats a CHECK violation inside the transaction as a bug: 500, no outage, nothing written", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 100_000)]);
    s.db.hook = (text, phase) => {
      if (phase === "before" && text.startsWith("INSERT INTO gateway.meters")) throw statementRefused("23514");
    };
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: "internal_error" });
    expect(await stateRow(s)).toEqual([]);
    // A refused statement isn't the store going away: no state.unknown record, and no outage under way.
    expect(s.logged.filter((l) => l.record.event === "state.unknown")).toEqual([]);
    expect(s.store.outageStartedAt()).toBeUndefined();
  });

  it("still answers 503 for a store that fails under the transaction: a lock or statement timeout", async () => {
    const s = await stack();
    await writeJournal(s, MONTH, [commit("c", "fallback", 100_000)]);
    s.db.hook = (text, phase) => {
      if (phase === "before" && text.startsWith("INSERT INTO gateway.meters")) throw statementRefused("57014");
    };
    const res = await init(s, { reason: REASON });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "store_unreachable" });
    expect(s.logged.some((l) => l.record.event === "state.unknown")).toBe(true);
  });
});
