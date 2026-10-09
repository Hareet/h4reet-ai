// The operator's writes and reads (tasks.md T070, T075; contracts/operator-admin.md §1.2, §1.3, §2.1, §2.2, §4.2,
// §4.3; data-model.md §6, §7.5), on Fastify inject and PGlite:
// - reset: 409 not_degraded on a normal stack; otherwise normal again, the meters untouched, so metered calls stay
//   refused at a ceiling;
// - renew: 409 not_awaiting_renewal; otherwise the allowance rule (spend plus reservations plus $2), the grant up by
//   one, the flag cleared, on a degraded stack too;
// - the reason rule, the audit rows, the confirmation alerts, the journal records, and a failed append;
// - GET /admin/audit's paging and filter, and GET /admin/incidents' drafts read back from their files.
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
import type { AdmitRequest } from "../../src/meter/types.js";
import { connectionLost } from "../helpers/pglite.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;
const REASON = "Breach rehearsal done; restoring local answers.";

const stacks: TestStack[] = [];
afterEach(async () => {
  for (const s of stacks.splice(0)) {
    await chmod(join(s.stateDir, "journal"), 0o700).catch(() => {});
    await s.close();
  }
});

/** A dev stack with the synthetic fallback, initialized; renewal granted unless `renew` is false. */
async function stack(o: { renew?: boolean; init?: boolean } = {}): Promise<TestStack> {
  const s = await testStack({ fallback: true });
  stacks.push(s);
  if (o.init !== false) {
    const res = await post(s, "/admin/init", {
      reason: "Fresh dev stack for the operator tests.",
      confirm_zero: true,
      renew: o.renew ?? true,
    });
    expect(res.statusCode).toBe(200);
  }
  await s.services.gateway.probeAll();
  return s;
}

const post = (s: TestStack, url: string, body: unknown, headers: Record<string, string> = {}) =>
  s.admin.inject({
    method: "POST",
    url,
    headers: { ...s.auth(), "content-type": "application/json", ...headers },
    payload: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (s: TestStack, url: string) => s.admin.inject({ method: "GET", url, headers: s.auth() });

const today = (): string => dayKey(Date.now());
const thisMonth = (): string => monthKey(Date.now());
const fingerprint = (s: TestStack): string => s.tokenSha256.slice(0, 8);

async function state(s: TestStack): Promise<Rec> {
  return (await s.db.pg.query<Rec>("SELECT * FROM gateway.stack_state")).rows[0] ?? {};
}
async function fallbackRow(s: TestStack): Promise<Rec> {
  return (
    (
      await s.db.pg.query<Rec>(
        "SELECT spent_micro, reserved_micro, allowance_micro, grant_no FROM gateway.meters WHERE meter = 'fallback_day' AND period_key = $1",
        [today()],
      )
    ).rows[0] ?? {}
  );
}
async function audit(s: TestStack, action: string): Promise<Rec[]> {
  return (await s.db.pg.query<Rec>("SELECT * FROM gateway.audit_log WHERE action = $1 ORDER BY id", [action])).rows;
}
async function journal(s: TestStack): Promise<Rec[]> {
  const text = await readFile(join(s.stateDir, "journal", `${thisMonth()}.jsonl`), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as Rec);
}

/** Trips the kill switch as a commit would have: degraded, the day crossed, and the day's meter at its ceiling. */
async function trip(s: TestStack): Promise<void> {
  await s.db.pg.query(
    "UPDATE gateway.meters SET spent_micro = 5000000, reached_at = now() WHERE meter = 'day' AND period_key = $1",
    [today()],
  );
  await s.db.pg.query("UPDATE gateway.stack_state SET state = 'degraded', since = now(), crossed = $1", [
    [`day:${today()}`],
  ]);
}

/** n fallback calls of $0.10, admitted and committed through the meter, as hello's would be. */
async function spendFallback(s: TestStack, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const a = await s.services.meter.admit(fallbackRequest());
    if (!a.ok) throw new Error(`refused: ${JSON.stringify(a)}`);
    await s.services.meter.settle(a.admitted, {
      outcome: "ok",
      costBasis: "usage",
      costMicro: 100_000n,
      inputTokens: 0,
      outputTokens: 1_000,
      cacheReadTokens: 0,
      responseModel: "metered-test",
      finishReason: "stop",
      errorKind: null,
      latencyMs: 1,
      startedAt: Date.now(),
      endedAt: Date.now(),
    });
  }
}
const fallbackRequest = (): AdmitRequest => ({
  attribution: "fallback",
  adapter: {
    id: "synthetic",
    provider: "synthetic",
    model: "metered-test",
    fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
  },
  adapterHealthy: true,
  maxOutputTokens: 128,
  requestId: "0".repeat(32),
  traceId: "1".repeat(32),
  purpose: "hello",
  routeReason: "local_unhealthy",
});

const hello = (s: TestStack) =>
  s.api.inject({ method: "POST", url: "/hello", headers: { "content-type": "application/json" }, payload: "{}" });

describe("POST /admin/reset (§2.1; data-model.md §6.1, §7.5)", () => {
  it("refuses a stack that is normal with 409 not_degraded, writing nothing", async () => {
    const s = await stack();
    const before = (await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.audit_log")).rows;
    const res = await post(s, "/admin/reset", { reason: REASON });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: "not_degraded",
      detail: "The kill switch is normal; there is nothing to reset.",
    });
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.audit_log")).rows).toEqual(before);
  });

  it("restores normal, leaves the meters alone, and keeps metered calls refused while a meter is at its ceiling", async () => {
    const s = await stack();
    await trip(s);
    const spy = vi.spyOn(s.services.metrics, "operatorAction");
    const res = await post(s, "/admin/reset", { reason: REASON });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Rec;
    expect(Object.keys(body)).toEqual(["action", "audit_id", "state", "since", "meters_at_ceiling", "note", "journal"]);
    expect(body).toMatchObject({
      action: "reset",
      state: "normal",
      meters_at_ceiling: ["day"],
      note: "Local answers resume now. Metered calls stay refused while these meters are at or above their ceiling: day.",
      journal: "ok",
    });
    expect(body.since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const row = await state(s);
    expect(row).toMatchObject({ state: "normal", crossed: [], fallback_awaiting_renewal: false });
    // The meters are untouched: the day still stands at its ceiling.
    expect(
      (
        await s.db.pg.query<Rec>("SELECT spent_micro FROM gateway.meters WHERE meter = 'day' AND period_key = $1", [
          today(),
        ])
      ).rows,
    ).toEqual([{ spent_micro: 5_000_000 }]);
    // The audit row: who, when, why; before and after; and the meters still at a ceiling (§2.6).
    const [row1] = await audit(s, "reset");
    expect(row1).toMatchObject({
      id: body.audit_id,
      actor: `operator:dev#${fingerprint(s)}`,
      reason: REASON,
      before: { state: "degraded", crossed: [`day:${today()}`] },
      after: { state: "normal", crossed: [] },
      detail: { meters_at_ceiling: ["day"] },
    });
    // The confirmation alert names the action and the fingerprint, never the reason (§1.3; alerts.md §3).
    const alert = (
      await s.db.pg.query<Rec>("SELECT dedupe_key, kind, body FROM gateway.alert_outbox WHERE dedupe_key = $1", [
        `dev:operator_action:reset:${body.audit_id}`,
      ])
    ).rows[0];
    expect(alert?.kind).toBe("operator_action");
    expect(String(alert?.body).split("\n")).toEqual([
      `[dev] OPERATOR ACTION: reset by operator #${fingerprint(s)}`,
      "Daily: 5.00 / 5.00 USD (warning 3.50) · Month: 0.00 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 2) (synthetic spend)",
      expect.stringMatching(/^Runtime: normal · Fallback: available · \S+ · id dev:operator_action:reset:\d+$/),
      "Local answers resume. Metered calls stay refused while a meter is at or above its ceiling: day.",
      "Runbook: docs/runbooks/kill-switch-reset.md",
    ]);
    expect(String(alert?.body)).not.toContain(REASON);
    // The journal's operator record follows the commit.
    expect((await journal(s)).at(-1)).toMatchObject({
      kind: "operator",
      action: "reset",
      audit_id: body.audit_id,
      actor: `operator:dev#${fingerprint(s)}`,
      period_day: today(),
      period_month: thisMonth(),
    });
    expect(spy).toHaveBeenCalledWith("reset");
    expect(s.logged.find((l) => l.record.event === "operator.reset")?.record).toMatchObject({
      "event.name": "h4.audit",
      audit_id: body.audit_id,
      action: "reset",
      reason: REASON,
    });
    // Metered calls stay refused: with local unhealthy, hello's fallback meets meter_at_ceiling.
    const refused = await hello(s);
    expect(refused.statusCode).toBe(503);
    expect(refused.headers["x-h4-degraded-cause"]).toBe("meter_at_ceiling");
  });

  it("answers 409 store_uninitialized before init, and checks the body and the reason first", async () => {
    const s = await stack({ init: false });
    expect((await post(s, "/admin/reset", { reason: REASON })).json()).toMatchObject({ error: "store_uninitialized" });
    expect((await post(s, "/admin/renew", { reason: REASON })).json()).toMatchObject({ error: "store_uninitialized" });
  });
});

describe("POST /admin/renew (§2.2; data-model.md §6.2, §7.5)", () => {
  it("refuses with 409 not_awaiting_renewal, showing today's sub-budget, when the flag isn't set", async () => {
    const s = await stack({ renew: true });
    const res = await post(s, "/admin/renew", { reason: "Model server down for a driver update; renewing fallback." });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: "not_awaiting_renewal",
      detail: "The fallback sub-budget isn't awaiting renewal; there is nothing to renew.",
      fallback: {
        day: today(),
        grant: 2,
        allowance_micro_usd: 2_000_000,
        spent_micro_usd: 0,
        reserved_micro_usd: 0,
        available_micro_usd: 2_000_000,
      },
    });
  });

  it("grants exactly $2 more, measured from spend: the day's first renewal, then a same-day second", async () => {
    const s = await stack({ renew: false }); // initialized awaiting renewal, grant 1
    const first = await post(s, "/admin/renew", { reason: "First fallback grant of the day, approved." });
    expect(first.statusCode).toBe(200);
    const body = first.json() as Rec;
    expect(Object.keys(body)).toEqual([
      "action",
      "audit_id",
      "fallback",
      "day_ceiling_room_micro_usd",
      "note",
      "journal",
    ]);
    expect(body).toMatchObject({
      action: "renew",
      fallback: {
        day: today(),
        grant: 2,
        allowance_micro_usd: 2_000_000, // a renewal before any spend today: $2, not $4
        spent_micro_usd: 0,
        reserved_micro_usd: 0,
        available_micro_usd: 2_000_000,
      },
      day_ceiling_room_micro_usd: 5_000_000,
      note: "Fallback passes again now: $2.00 more is available today, within the daily ceiling ($5.00 of room left).",
      journal: "ok",
    });
    expect(await state(s)).toMatchObject({ fallback_awaiting_renewal: false, fallback_awaiting_since: null });
    // Spend the grant: the flag is set again at the allowance, then a same-day renewal makes $2 more available.
    await spendFallback(s, 20);
    expect((await state(s)).fallback_awaiting_renewal).toBe(true);
    const second = await post(s, "/admin/renew", { reason: "Second fallback grant of the day, approved." });
    expect(second.json()).toMatchObject({
      fallback: {
        grant: 3,
        allowance_micro_usd: 4_000_000,
        spent_micro_usd: 2_000_000,
        available_micro_usd: 2_000_000,
      },
      day_ceiling_room_micro_usd: 3_000_000,
    });
    expect(await fallbackRow(s)).toEqual({
      spent_micro: 2_000_000,
      reserved_micro: 0,
      allowance_micro: 4_000_000,
      grant_no: 3,
    });
    // The audit row and the journal record carry the new allowance and grant, which a rebuild reads (§8 step 6).
    const rows = await audit(s, "renew");
    expect(rows.at(-1)).toMatchObject({
      reason: "Second fallback grant of the day, approved.",
      before: { fallback_day: { allowance_micro: 2_000_000, grant_no: 2 }, fallback_awaiting_renewal: true },
      after: {
        fallback_day: { allowance_micro: 4_000_000, grant_no: 3, spent_micro: 2_000_000, reserved_micro: 0 },
        fallback_awaiting_renewal: false,
      },
    });
    expect((await journal(s)).filter((r) => r.action === "renew").at(-1)).toMatchObject({
      kind: "operator",
      action: "renew",
      allowance_micro: 4_000_000,
      grant_no: 3,
      period_day: today(),
    });
    const alert = (
      await s.db.pg.query<Rec>("SELECT body FROM gateway.alert_outbox WHERE dedupe_key = $1", [
        `dev:operator_action:renew:${(second.json() as Rec).audit_id}`,
      ])
    ).rows[0];
    expect(String(alert?.body).split("\n")).toEqual([
      `[dev] OPERATOR ACTION: fallback renewed by operator #${fingerprint(s)}`,
      "Daily: 2.00 / 5.00 USD (warning 3.50) · Month: 2.00 / 20.00 (warning 14.00) · Fallback today: 2.00 / 4.00 (grant 3) (synthetic spend)",
      expect.stringMatching(/^Runtime: normal · Fallback: available · \S+ · id dev:operator_action:renew:\d+$/),
      "$2.00 more fallback is available now, within the daily ceiling (grant 3).",
      "Runbook: docs/runbooks/fallback-renewal.md",
    ]);
    // The second grant warns at its allowance minus $0.60: 3,400,000.
    await spendFallback(s, 14); // $3.40
    expect(
      (await s.db.pg.query<Rec>("SELECT dedupe_key FROM gateway.alert_outbox WHERE kind = 'warn'")).rows.map(
        (r) => r.dedupe_key,
      ),
    ).toContain(`dev:warn:fallback_day:${today()}:g3`);
  });

  it("measures from spend plus reservations, so an overshoot never shrinks the next grant", async () => {
    const s = await stack({ renew: false });
    await post(s, "/admin/renew", { reason: "First fallback grant of the day, approved." });
    await spendFallback(s, 19); // $1.90
    const held = await s.services.meter.admit(fallbackRequest()); // $0.10 in flight
    expect(held.ok).toBe(true);
    await s.db.pg.query(
      "UPDATE gateway.stack_state SET fallback_awaiting_renewal = true, fallback_awaiting_since = now()",
    );
    const res = await post(s, "/admin/renew", { reason: "Renewing with a call still in flight." });
    expect(res.json()).toMatchObject({
      fallback: {
        allowance_micro_usd: 4_000_000,
        spent_micro_usd: 1_900_000,
        reserved_micro_usd: 100_000,
        available_micro_usd: 2_000_000,
      },
    });
  });

  it("renews a degraded stack too: the flag clears, and fallback stays refused by the kill switch until a reset", async () => {
    const s = await stack({ renew: false });
    await trip(s);
    const res = await post(s, "/admin/renew", { reason: "Renewing while the switch is tripped." });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Rec).note).toContain("The kill switch is still degraded");
    expect(await state(s)).toMatchObject({ state: "degraded", fallback_awaiting_renewal: false });
    const refused = await hello(s);
    expect(refused.headers["x-h4-degraded-cause"]).toBe("kill_switch_tripped");
  });
});

describe("the operator writes' common rules (§1.2, §1.3)", () => {
  it("holds the reason to 10 to 500 characters with no control characters, and the body to the reason alone", async () => {
    const s = await stack();
    await trip(s);
    const cases: [unknown, string][] = [
      [{}, "reason"],
      [{ reason: "too short" }, "reason"],
      [{ reason: "x".repeat(501) }, "reason"],
      [{ reason: "has a\nnewline in it" }, "reason"],
      [{ reason: 42 }, "reason"],
      [{ reason: REASON, extra: true }, "body"],
      [[REASON], "body"],
    ];
    for (const url of ["/admin/reset", "/admin/renew"]) {
      for (const [body, field] of cases) {
        const res = await post(s, url, body);
        expect(res.statusCode, `${url} ${JSON.stringify(body)}`).toBe(400);
        expect(res.json()).toMatchObject({ error: "invalid_request", field });
      }
      const plain = await s.admin.inject({
        method: "POST",
        url,
        headers: { ...s.auth(), "content-type": "text/plain" },
        payload: REASON,
      });
      expect(plain.statusCode).toBe(415);
    }
    expect((await state(s)).state).toBe("degraded");
  });

  it("reports a failed journal append, audits it as journal_failed, and doesn't undo the action", async () => {
    const s = await stack();
    await trip(s);
    const dir = join(s.stateDir, "journal");
    await chmod(join(dir, `${thisMonth()}.jsonl`), 0o400);
    await chmod(dir, 0o500);
    const res = await post(s, "/admin/reset", { reason: REASON });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ state: "normal", journal: "unwritable" });
    expect(await audit(s, "journal_failed")).toEqual([
      expect.objectContaining({
        actor: "gateway",
        reason: null,
        detail: { audit_id: (res.json() as Rec).audit_id, error_class: "EACCES" },
      }),
    ]);
    expect((await state(s)).state).toBe("normal");
  });

  it("finishes a write whose COMMIT answer was lost, when its audit row is there", async () => {
    const s = await stack();
    await trip(s);
    let dropped = false;
    s.db.hook = (text, phase) => {
      if (text === "COMMIT" && phase === "after" && !dropped) {
        dropped = true;
        throw connectionLost();
      }
    };
    const res = await post(s, "/admin/reset", { reason: REASON });
    expect(dropped).toBe(true);
    expect(res.statusCode).toBe(200);
    expect((await journal(s)).at(-1)).toMatchObject({ action: "reset", audit_id: (res.json() as Rec).audit_id });
  });
});

describe("GET /admin/audit (§4.2)", () => {
  it("lists the newest first, a page at a time, filtered by action, never truncating a reason", async () => {
    const s = await stack();
    for (let i = 0; i < 3; i++) {
      await trip(s);
      expect((await post(s, "/admin/reset", { reason: `Reset number ${i}, after a rehearsal.` })).statusCode).toBe(200);
    }
    const all = (await get(s, "/admin/audit")).json() as { entries: Rec[]; next_before_id: unknown };
    expect(all.entries.map((e) => e.action)).toEqual(["reset", "reset", "reset", "init"]);
    expect(all.next_before_id).toBeNull();
    expect(Object.keys(all.entries[0] ?? {})).toEqual([
      "id",
      "ts",
      "recorded_at",
      "actor",
      "action",
      "reason",
      "before",
      "after",
      "detail",
    ]);
    expect(all.entries[0]).toMatchObject({
      reason: "Reset number 2, after a rehearsal.",
      actor: `operator:dev#${fingerprint(s)}`,
    });
    const page = (await get(s, "/admin/audit?limit=2")).json() as { entries: Rec[]; next_before_id: number };
    expect(page.entries).toHaveLength(2);
    expect(page.next_before_id).toBe(page.entries[1]?.id);
    const rest = (await get(s, `/admin/audit?limit=2&before_id=${page.next_before_id}`)).json() as {
      entries: Rec[];
      next_before_id: unknown;
    };
    expect(rest.entries.map((e) => e.action)).toEqual(["reset", "init"]);
    expect(rest.next_before_id).toBeNull();
    const inits = (await get(s, "/admin/audit?action=init")).json() as { entries: Rec[] };
    expect(inits.entries.map((e) => e.action)).toEqual(["init"]);
  });

  it("refuses parameters out of their range, an unknown action, and an unknown parameter, naming them", async () => {
    const s = await stack();
    for (const [url, field] of [
      ["/admin/audit?limit=0", "limit"],
      ["/admin/audit?limit=201", "limit"],
      ["/admin/audit?limit=ten", "limit"],
      ["/admin/audit?before_id=-1", "before_id"],
      ["/admin/audit?action=delete", "action"],
      ["/admin/audit?sql=1", "query"],
    ] as const) {
      const res = await get(s, url);
      expect(res.statusCode, url).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request", field });
    }
  });
});

describe("GET /admin/incidents (§4.3)", () => {
  let seeded = 0;
  /** One incidents row, each of its own period (a period's ceiling is crossed once: UNIQUE (ceiling, period_key)). */
  async function seed(s: TestStack, o: { status: "queued" | "written"; content?: string; tamper?: boolean }) {
    seeded += 1;
    const period = `2026-10-${String(seeded).padStart(2, "0")}`;
    const path = `incidents/${period}-dev-day.intent.md`;
    let sha: string | null = null;
    if (o.status === "written") {
      const content = o.content ?? "# Intent: Respond to the daily ceiling breach on dev, 2026-10-29\n";
      await mkdir(join(s.stateDir, "incidents"), { recursive: true });
      await writeFile(join(s.stateDir, path), o.tamper === true ? `${content}edited\n` : content, { mode: 0o640 });
      sha = createHash("sha256").update(content).digest("hex");
    }
    const { rows } = await s.db.pg.query<{ id: number }>(
      `INSERT INTO gateway.incidents (created_at, stack, ceiling, period_key, ledger_id, trip_alert_key, status, path,
         sha256, written_at)
       VALUES (now(), 'dev', 'day', $1, gen_random_uuid(), 'dev:trip:day:x', $2, $3, $4, $5) RETURNING id`,
      [
        period,
        o.status,
        o.status === "written" ? path : null,
        sha,
        o.status === "written" ? new Date().toISOString() : null,
      ],
    );
    return rows[0]?.id as number;
  }

  it("returns each draft with its Markdown, and whether the file is still what the gateway wrote", async () => {
    const s = await stack();
    const written = await seed(s, { status: "written" });
    const tampered = await seed(s, { status: "written", tamper: true });
    const queued = await seed(s, { status: "queued" });
    const res = (await get(s, "/admin/incidents")).json() as { incidents: Rec[] };
    expect(res.incidents.map((i) => i.id)).toEqual([queued, tampered, written]);
    expect(Object.keys(res.incidents[2] ?? {})).toEqual([
      "id",
      "created_at",
      "ceiling",
      "period_key",
      "status",
      "path",
      "sha256",
      "sha256_matches",
      "written_at",
      "content",
    ]);
    expect(res.incidents[2]).toMatchObject({
      status: "written",
      sha256_matches: true,
      content: "# Intent: Respond to the daily ceiling breach on dev, 2026-10-29\n",
    });
    expect(res.incidents[1]).toMatchObject({ sha256_matches: false });
    expect(res.incidents[0]).toMatchObject({ status: "queued", content: null, sha256_matches: null, path: null });
    const one = (await get(s, `/admin/incidents?id=${written}`)).json() as { incidents: Rec[] };
    expect(one.incidents.map((i) => i.id)).toEqual([written]);
    expect(((await get(s, "/admin/incidents?limit=1")).json() as { incidents: Rec[] }).incidents).toHaveLength(1);
  });

  it("refuses a limit out of 1 to 20, a bad id, both at once, and an unknown parameter", async () => {
    const s = await stack();
    for (const url of [
      "/admin/incidents?limit=21",
      "/admin/incidents?limit=0",
      "/admin/incidents?id=abc",
      "/admin/incidents?limit=1&id=1",
      "/admin/incidents?all=1",
    ]) {
      expect((await get(s, url)).statusCode, url).toBe(400);
    }
  });
});
