// The studio's GPU window (spec 003 FR-035, SC-011; tasks.md T032; specs/003-studio-assets/contracts/gpu-window.md §1,
// §3), on Fastify inject and PGlite, following spec 000's operator writes (contracts/operator-admin.md §1.2, §1.3):
// - start and end, each with its audit row, journal record, confirmation alert, counter, and log record;
// - 409 already_open and not_open, writing nothing;
// - the gauge, read from the store, so a restarted gateway still reads an open window;
// - no meter, budget, ceiling, or state changed, and the window's fallback spend in the end's answer and in the view
//   the dashboard reads;
// - the reason and body rules, store_uninitialized, dev's 404, and prod's route.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
import type { AdmitRequest } from "../../src/meter/types.js";
import type { GaugeSnapshot } from "../../src/telemetry/metrics.js";
import { testStack, type StackName, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;
const START = "studio: a portrait batch on the GPU";
const END = "studio: the portrait batch is done";

const stacks: TestStack[] = [];
afterEach(async () => {
  for (const s of stacks.splice(0)) await s.close();
});

/** A stack, dev-cpu by default with dev's synthetic fallback, initialized with today's grant, its adapters probed. */
async function stack(o: { stack?: StackName; init?: boolean } = {}): Promise<TestStack> {
  const name = o.stack ?? "dev-cpu";
  const s = await testStack({ stack: name, fallback: name !== "prod" });
  stacks.push(s);
  if (o.init !== false) {
    const res = await post(s, "/admin/init", {
      reason: "Fresh stack for the studio window's tests.",
      confirm_zero: true,
      renew: true,
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
const send = (s: TestStack, state: unknown, reason: unknown = state === "end" ? END : START) =>
  post(s, "/admin/studio-window", { state, reason });

const fingerprint = (s: TestStack): string => s.tokenSha256.slice(0, 8);
const today = (): string => dayKey(Date.now());
const thisMonth = (): string => monthKey(Date.now());

async function audit(s: TestStack, action: string): Promise<Rec[]> {
  return (await s.db.pg.query<Rec>("SELECT * FROM gateway.audit_log WHERE action = $1 ORDER BY id", [action])).rows;
}
async function count(s: TestStack, table: string): Promise<number> {
  return (await s.db.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM gateway.${table}`)).rows[0]?.n ?? -1;
}
async function journal(s: TestStack): Promise<Rec[]> {
  const text = await readFile(join(s.stateDir, "journal", `${thisMonth()}.jsonl`), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as Rec);
}
/** What a window must never change: the kill switch's row and every meter row, whole. */
async function untouched(s: TestStack): Promise<unknown> {
  return {
    state: (await s.db.pg.query("SELECT * FROM gateway.stack_state")).rows,
    meters: (await s.db.pg.query("SELECT * FROM gateway.meters ORDER BY meter, period_key")).rows,
    reservations: await count(s, "reservations"),
  };
}

/** n fallback calls of $0.10, admitted and committed through the meter, as hello's would be. */
async function spendFallback(s: TestStack, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const a = await s.services.meter.admit(fallbackRequest());
    if (!a.ok) throw new Error(`refused: ${JSON.stringify(a)}`);
    const result = {
      text: "synthetic response",
      usage: { inputTokens: 0, outputTokens: 1_000 },
      finishReason: "stop" as const,
      responseModel: "metered-test",
      latencyMs: 1,
    };
    await s.services.meter.settle(a.admitted, {
      attempts: [{ outcome: "ok", result, startedAt: Date.now(), endedAt: Date.now() }],
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

/** The gauges' snapshot after a refresh, as the 10 s task would leave it. */
async function gauges(s: TestStack): Promise<GaugeSnapshot | undefined> {
  const seen = vi.spyOn(s.services.metrics, "setSnapshot");
  await s.services.gateway.refreshGauges();
  return seen.mock.calls.at(-1)?.[0];
}

/** A wait of a few milliseconds, so two writes' gateway times differ. */
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("POST /admin/studio-window, start (gpu-window.md §1)", () => {
  it("opens the window: the answer, the audit row, the journal record, the alert, the counter, and the log", async () => {
    const s = await stack();
    const counter = vi.spyOn(s.services.metrics, "operatorAction");
    const res = await send(s, "start");
    expect(res.statusCode).toBe(200);
    const body = res.json() as Rec;
    expect(Object.keys(body)).toEqual(["action", "audit_id", "state", "window", "since", "note", "journal"]);
    expect(body).toMatchObject({
      action: "studio_window",
      state: "start",
      window: "open",
      note: "The window is open. Hello falls back within the sub-budget, or degrades, once the model server stops.",
      journal: "ok",
    });
    expect(body.since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    // The audit row: who, when, why, and the window before and after (data-model.md §2.6).
    const [row] = await audit(s, "studio_window");
    expect(row).toMatchObject({
      id: body.audit_id,
      stack: "dev-cpu",
      actor: `operator:dev-cpu#${fingerprint(s)}`,
      reason: START,
      before: { window: "closed" },
      after: { window: "open" },
      detail: { state: "start" },
    });
    // The row keeps the gateway time to the millisecond; the answer gives it to the second (gpu-window.md §1).
    const at = new Date(String((row?.after as Rec).since)).getTime();
    expect(Math.floor(at / 1_000) * 1_000).toBe(Date.parse(String(body.since)));

    // The journal's operator record follows the commit.
    expect((await journal(s)).at(-1)).toMatchObject({
      kind: "operator",
      action: "studio_window",
      state: "start",
      audit_id: body.audit_id,
      actor: `operator:dev-cpu#${fingerprint(s)}`,
      period_day: today(),
      period_month: thisMonth(),
    });

    // The confirmation alert names the action and the fingerprint, never the reason (operator-admin.md §1.3).
    const alert = (
      await s.db.pg.query<Rec>("SELECT kind, body, facts FROM gateway.alert_outbox WHERE dedupe_key = $1", [
        `dev-cpu:operator_action:studio_window:${body.audit_id}`,
      ])
    ).rows[0];
    expect(alert?.kind).toBe("operator_action");
    const lines = String(alert?.body).split("\n");
    expect(lines[0]).toBe(`[dev-cpu] OPERATOR ACTION: studio GPU window opened by operator #${fingerprint(s)}`);
    expect(lines[1]).toMatch(/^Daily: 0\.00 \/ 5\.00 USD/);
    expect(lines.slice(3)).toEqual([
      "The model server stops next: hello falls back within the sub-budget, or degrades, until the window closes.",
      "Runbook: docs/runbooks/studio-gpu-window.md",
    ]);
    expect(String(alert?.body)).not.toContain(START);
    expect(alert?.facts).toMatchObject({ action: "studio_window", state: "start", fingerprint: fingerprint(s) });

    expect(counter).toHaveBeenCalledWith("studio_window");
    expect(s.logged.find((l) => l.record.event === "operator.studio_window")?.record).toMatchObject({
      "event.name": "h4.audit",
      audit_id: body.audit_id,
      action: "studio_window",
      reason: START,
      before: { window: "closed" },
      after: { window: "open" },
    });
  });

  it("changes no meter, budget, ceiling, or state, and the routing stays as it was", async () => {
    const s = await stack();
    await spendFallback(s, 2);
    const before = await untouched(s);
    expect((await send(s, "start")).statusCode).toBe(200);
    expect(await untouched(s)).toEqual(before);
    await tick();
    expect((await send(s, "end")).statusCode).toBe(200);
    expect(await untouched(s)).toEqual(before);
  });

  it("refuses a second start with 409 already_open, naming the open window's start, and writes nothing", async () => {
    const s = await stack();
    const first = (await send(s, "start")).json() as Rec;
    const rows = await count(s, "audit_log");
    const alerts = await count(s, "alert_outbox");
    const records = (await journal(s)).length;
    const res = await send(s, "start", "studio: a second batch, by mistake");
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: "already_open",
      detail: "A studio window is already open: end it first, with STATE=end.",
      since: first.since,
    });
    expect([await count(s, "audit_log"), await count(s, "alert_outbox"), (await journal(s)).length]).toEqual([
      rows,
      alerts,
      records,
    ]);
  });
});

describe("POST /admin/studio-window, end (gpu-window.md §1)", () => {
  it("closes the window, with its fallback spend from the ledger, and only the spend inside it", async () => {
    const s = await stack();
    await spendFallback(s, 1); // before the window: not its spend
    await tick();
    const opened = (await send(s, "start")).json() as Rec;
    await tick();
    await spendFallback(s, 3); // inside it: $0.30 in 3 calls
    await tick();
    const res = await send(s, "end");
    expect(res.statusCode).toBe(200);
    const body = res.json() as Rec;
    expect(Object.keys(body)).toEqual([
      "action",
      "audit_id",
      "state",
      "window",
      "since",
      "opened",
      "fallback",
      "note",
      "journal",
    ]);
    expect(body).toMatchObject({
      action: "studio_window",
      state: "end",
      window: "closed",
      opened: opened.since,
      fallback: { spent_micro_usd: 300_000, calls: 3 },
      note: "The window is closed. Its fallback spend: $0.30 in 3 calls.",
      journal: "ok",
    });
    const rows = await audit(s, "studio_window");
    expect(rows.map((r) => (r.detail as Rec).state)).toEqual(["start", "end"]);
    expect(rows[1]).toMatchObject({
      id: body.audit_id,
      reason: END,
      before: { window: "open" },
      after: { window: "closed" },
      detail: { state: "end", fallback_micro: 300_000, fallback_calls: 3 },
    });
    expect((await journal(s)).at(-1)).toMatchObject({ kind: "operator", action: "studio_window", state: "end" });
    const alert = (
      await s.db.pg.query<Rec>("SELECT body FROM gateway.alert_outbox WHERE dedupe_key = $1", [
        `dev-cpu:operator_action:studio_window:${body.audit_id}`,
      ])
    ).rows[0];
    const lines = String(alert?.body).split("\n");
    expect(lines[0]).toBe(`[dev-cpu] OPERATOR ACTION: studio GPU window closed by operator #${fingerprint(s)}`);
    expect(lines.slice(3)).toEqual([
      "Hello answers from the local model again. The window's fallback spend: $0.30 in 3 calls.",
      "Runbook: docs/runbooks/studio-gpu-window.md",
    ]);
    expect(String(alert?.body)).not.toContain(END);
  });

  it("refuses an end with no open window, 409 not_open, before any start and after an end, writing nothing", async () => {
    const s = await stack();
    const expected = { error: "not_open", detail: "No studio window is open: there is nothing to end." };
    const rows = await count(s, "audit_log");
    const before = await send(s, "end");
    expect(before.statusCode).toBe(409);
    expect(before.json()).toEqual(expected);
    expect(await count(s, "audit_log")).toBe(rows);
    expect((await send(s, "start")).statusCode).toBe(200);
    await tick();
    expect((await send(s, "end")).statusCode).toBe(200);
    const again = await send(s, "end");
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual(expected);
    expect((await audit(s, "studio_window")).length).toBe(2);
  });

  it("opens and closes again: windows alternate, each its own pair", async () => {
    const s = await stack();
    for (let i = 0; i < 2; i++) {
      expect((await send(s, "start")).statusCode).toBe(200);
      await tick();
      expect((await send(s, "end")).statusCode).toBe(200);
      await tick();
    }
    expect((await audit(s, "studio_window")).map((r) => (r.detail as Rec).state)).toEqual([
      "start",
      "end",
      "start",
      "end",
    ]);
  });
});

describe("the gauge h4.studio.window (gpu-window.md §1)", () => {
  it("reads 0 with no window, 1 while one is open, and 0 once it ends, from the store", async () => {
    const s = await stack();
    expect((await gauges(s))?.studioWindow).toBe(false);
    await send(s, "start");
    expect((await gauges(s))?.studioWindow).toBe(true);
    // A gateway restarted inside the window, as `end` restarts prod, reads it from the store, not from memory.
    expect(await s.store.readStudioWindow()).toBe(true);
    await tick();
    await send(s, "end");
    expect((await gauges(s))?.studioWindow).toBe(false);
  });

  it("isn't observed while the store can't be read", async () => {
    const s = await stack();
    await send(s, "start");
    expect((await gauges(s))?.studioWindow).toBe(true);
    const seen = vi.spyOn(s.services.metrics, "setSnapshot");
    vi.spyOn(s.store, "readStackState").mockResolvedValue({ kind: "unreachable" });
    await s.services.gateway.refreshGauges();
    expect(seen.mock.calls.at(-1)?.[0].studioWindow).toBeUndefined();
  });
});

describe("the view gateway.v_studio_windows (gpu-window.md §3)", () => {
  it("has one row per window, its end once it has one, and the ledger's fallback spend inside it", async () => {
    const s = await stack();
    await spendFallback(s, 1);
    await tick();
    await send(s, "start");
    await tick();
    await spendFallback(s, 2);
    await tick();
    await send(s, "end");
    await tick();
    await spendFallback(s, 1); // between windows: no window's spend
    await tick();
    await send(s, "start");
    const { rows } = await s.db.pg.query<Rec>(
      "SELECT started_at, ended_at, fallback_micro::text AS micro, fallback_calls::text AS calls FROM gateway.v_studio_windows ORDER BY started_at",
    );
    expect(rows.map((r) => [r.ended_at === null, r.micro, r.calls])).toEqual([
      [false, "200000", "2"],
      [true, "0", "0"],
    ]);
    const [first] = await audit(s, "studio_window");
    expect(new Date(String(rows[0]?.started_at)).getTime()).toBe(new Date(String(first?.ts)).getTime());
    // The panel's own query, with Grafana's macros filled in for a range around now.
    const panel = await s.db.pg.query<Rec>(
      `SELECT started_at AS "time", ended_at, fallback_micro / 1e6 AS fallback_usd, fallback_calls FROM gateway.v_studio_windows WHERE started_at <= now() + interval '1 hour' AND (ended_at IS NULL OR ended_at >= now() - interval '1 hour') ORDER BY started_at DESC LIMIT 50`,
    );
    expect(panel.rows.map((r) => Number(r.fallback_usd))).toEqual([0, 0.2]);
  });
});

describe("the operator writes' common rules, for the window (operator-admin.md §1.2, §1.3)", () => {
  it("holds the reason to spec 000's rule, the state to start or end, and the body to those two", async () => {
    const s = await stack();
    const cases: [unknown, string][] = [
      [{ state: "start" }, "reason"],
      [{ state: "start", reason: "too short" }, "reason"],
      [{ state: "start", reason: "x".repeat(501) }, "reason"],
      [{ state: "start", reason: "has a\nnewline in it" }, "reason"],
      [{ state: "start", reason: 42 }, "reason"],
      [{ reason: START }, "state"],
      [{ state: "open", reason: START }, "state"],
      [{ state: 1, reason: START }, "state"],
      [{ state: "start", reason: START, extra: true }, "body"],
      [[START], "body"],
    ];
    for (const [body, field] of cases) {
      const res = await post(s, "/admin/studio-window", body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request", field });
    }
    const plain = await s.admin.inject({
      method: "POST",
      url: "/admin/studio-window",
      headers: { ...s.auth(), "content-type": "text/plain" },
      payload: START,
    });
    expect(plain.statusCode).toBe(415);
    expect(await audit(s, "studio_window")).toEqual([]);
  });

  it("trims the reason, as every operator write does", async () => {
    const s = await stack();
    expect((await send(s, "start", `   ${START}   `)).statusCode).toBe(200);
    expect((await audit(s, "studio_window"))[0]?.reason).toBe(START);
  });

  it("authenticates first: no token is a 401, and nothing is written", async () => {
    const s = await stack();
    const res = await s.admin.inject({
      method: "POST",
      url: "/admin/studio-window",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ state: "start", reason: START }),
    });
    expect(res.statusCode).toBe(401);
    expect(await audit(s, "studio_window")).toEqual([]);
  });

  it("answers 409 store_uninitialized before init", async () => {
    const s = await stack({ init: false });
    const res = await send(s, "start");
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "store_uninitialized" });
  });

  it("lists studio_window among GET /admin/audit's actions", async () => {
    const s = await stack();
    await send(s, "start");
    const res = await s.admin.inject({ method: "GET", url: "/admin/audit?action=studio_window", headers: s.auth() });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { entries: Rec[] }).entries.map((e) => e.action)).toEqual(["studio_window"]);
  });
});

describe("which stacks serve it (gpu-window.md §1)", () => {
  it("is prod's: a start and an end on prod's listener", async () => {
    const s = await stack({ stack: "prod" });
    const res = await send(s, "start");
    expect(res.statusCode).toBe(200);
    expect((await audit(s, "studio_window"))[0]?.actor).toBe(`operator:prod#${fingerprint(s)}`);
    await tick();
    expect((await send(s, "end")).json()).toMatchObject({ window: "closed", fallback: { calls: 0 } });
  });

  it("isn't dev's: dev's listener answers 404 not_found, after authentication, and writes nothing", async () => {
    const s = await stack({ stack: "dev" });
    const res = await send(s, "start");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "not_found" });
    expect(await audit(s, "studio_window")).toEqual([]);
  });
});
