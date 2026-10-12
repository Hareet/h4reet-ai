// The admin listener (tasks.md T055; contracts/operator-admin.md §1, §4.1; data-model.md §2.6):
// - bearer authentication comes first, before the body, the store, or the route, with the prefix checked before
//   hashing and the digests compared in constant time; every failure gets the same 401;
// - failures are counted in memory in fixed 10-minute windows of real time: one auth_failed audit row per class per
//   window, carrying the route template and never the raw path, and one auth_failed alert at the third;
// - GET /admin/status reports what GET /health does, plus the meters, the limits, the journal, and the alerts.
import { afterEach, describe, expect, it } from "vitest";

import { makeToken, testStack, type TestStack } from "../helpers/stack.js";

const T0 = Date.parse("2026-10-28T10:00:00.000Z"); // a window boundary: 10-minute windows of real time
const MINUTE = 60_000;

const stacks: TestStack[] = [];
afterEach(async () => {
  for (const s of stacks.splice(0)) await s.close();
});
async function stack(o: Parameters<typeof testStack>[0] = {}): Promise<TestStack> {
  const s = await testStack(o);
  stacks.push(s);
  return s;
}

/** A clock the test moves. */
function clock(start = T0) {
  let now = start;
  return { now: () => now, set: (ms: number) => void (now = ms) };
}

const get = (s: TestStack, url: string, headers: Record<string, string> = {}) =>
  s.admin.inject({ method: "GET", url, headers });

const unauthorized = (res: Awaited<ReturnType<typeof get>>) => {
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: "unauthorized" });
  expect(res.headers["www-authenticate"]).toBe('Bearer realm="h4reet-admin"');
  expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
};

async function authRows(s: TestStack) {
  return (
    await s.db.pg.query<{ actor: string; reason: string | null; detail: Record<string, unknown> }>(
      "SELECT actor, reason, detail FROM gateway.audit_log WHERE action = 'auth_failed' ORDER BY id",
    )
  ).rows;
}

describe("authentication (operator-admin.md §1.1)", () => {
  it("answers every failure with the same 401, whatever its class", async () => {
    const s = await stack();
    const other = makeToken("dev"); // the right shape and prefix, the wrong hash
    for (const headers of [
      {},
      { authorization: `Basic ${Buffer.from("user:pass").toString("base64")}` }, // made at run time, as tokens are
      { authorization: "Bearer" },
      { authorization: "Bearer not-a-token" },
      { authorization: `Bearer ${makeToken("prod")}` },
      { authorization: `Bearer ${other}` },
      { authorization: `Bearer ${s.token}x` },
    ]) {
      unauthorized(await get(s, "/admin/status", headers));
    }
  });

  it("accepts the stack's own token: a GET with no body and no content type is fine", async () => {
    const s = await stack();
    const res = await get(s, "/admin/status", s.auth());
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(await authRows(s)).toEqual([]);
  });

  it("authenticates before anything else: an unknown route or an oversized body gets 401 without a token", async () => {
    const s = await stack();
    unauthorized(await get(s, "/admin/nope"));
    const big = await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ reason: "x".repeat(5_000) }),
    });
    unauthorized(big);
    // With the token, an unknown route is a 404.
    const known = await get(s, "/admin/nope", s.auth());
    expect(known.statusCode).toBe(404);
    expect(known.json()).toEqual({ error: "not_found", request_id: known.headers["x-request-id"] });
  });

  it("checks the prefix before hashing: a prod gateway refuses a dev token as wrong_prefix, never as mismatch", async () => {
    const t = clock();
    const s = await stack({ stack: "prod", realNow: t.now });
    unauthorized(await get(s, "/admin/status", { authorization: `Bearer ${makeToken("dev")}` }));
    unauthorized(await get(s, "/admin/status", { authorization: `Bearer ${makeToken("dev-cpu")}` }));
    expect((await authRows(s)).map((r) => r.detail.class)).toEqual(["wrong_prefix"]);
  });

  it("audits the first failure of each class in a window, with the route template, and never the raw path", async () => {
    const t = clock();
    const s = await stack({ realNow: t.now });
    const malformed = { authorization: "Bearer not-a-token" };
    unauthorized(await get(s, "/admin/status?reason=leak-me", malformed));
    unauthorized(await get(s, "/admin/status", malformed));
    unauthorized(await get(s, "/admin/no/such/route-leak-me", {}));
    t.set(T0 + 9 * MINUTE);
    unauthorized(await get(s, "/admin/status", { authorization: `Bearer ${makeToken("dev")}` }));
    expect(await authRows(s)).toEqual([
      {
        actor: "unknown",
        reason: null,
        detail: { class: "malformed", route: "/admin/status", window_start: "2026-10-28T10:00:00Z" },
      },
      {
        actor: "unknown",
        reason: null,
        detail: { class: "missing", route: "other", window_start: "2026-10-28T10:00:00Z" },
      },
      {
        actor: "unknown",
        reason: null,
        detail: { class: "mismatch", route: "/admin/status", window_start: "2026-10-28T10:00:00Z" },
      },
    ]);
    // A new window audits each class again.
    t.set(T0 + 10 * MINUTE);
    unauthorized(await get(s, "/admin/status", malformed));
    expect((await authRows(s)).at(-1)?.detail).toEqual({
      class: "malformed",
      route: "/admin/status",
      window_start: "2026-10-28T10:10:00Z",
    });
    const text = JSON.stringify([s.logged, await authRows(s)]);
    expect(text).not.toContain("leak-me");
    expect(s.logged.filter((l) => l.record.event === "operator.auth_failed").map((l) => l.record)).toContainEqual({
      event: "operator.auth_failed",
      "event.name": "h4.audit",
      class: "malformed",
      route: "/admin/status",
    });
  });

  it("queues one auth_failed alert at the third failure in a window, and one in the next", async () => {
    const t = clock();
    const s = await stack({ realNow: t.now });
    const bad = { authorization: `Bearer ${makeToken("dev")}` };
    const outbox = async () =>
      (
        await s.db.pg.query<{ dedupe_key: string; kind: string; subject: string; body: string }>(
          "SELECT dedupe_key, kind, subject, body FROM gateway.alert_outbox ORDER BY id",
        )
      ).rows;
    unauthorized(await get(s, "/admin/status", bad));
    t.set(T0 + 2 * MINUTE + 11_000);
    unauthorized(await get(s, "/admin/status", { authorization: "Bearer not-a-token" }));
    expect(await outbox()).toEqual([]);
    unauthorized(await get(s, "/admin/status", bad));
    unauthorized(await get(s, "/admin/status", bad)); // the fourth: still one alert
    const rows = await outbox();
    expect(rows.map((r) => [r.dedupe_key, r.kind])).toEqual([
      ["dev:auth_failed:admin:2026-10-28T10:00Z", "auth_failed"],
    ]);
    expect(rows[0]?.subject).toBe("[dev] AUTH FAILURES: 3 failed operator authentications in 10 minutes");
    expect(rows[0]?.body.split("\n")).toEqual([
      "[dev] AUTH FAILURES: 3 failed operator authentications in 10 minutes",
      "Runtime: uninitialized, treated as degraded · Fallback: none · 2026-10-28T10:02:11Z · id dev:auth_failed:admin:2026-10-28T10:00Z",
      "The admin listener refused them (last: mismatch). No action was taken.",
      "Runbook: docs/runbooks/operator-auth-failures.md",
    ]);
    t.set(T0 + 10 * MINUTE);
    for (let i = 0; i < 3; i++) unauthorized(await get(s, "/admin/status", bad));
    expect((await outbox()).map((r) => r.dedupe_key)).toEqual([
      "dev:auth_failed:admin:2026-10-28T10:00Z",
      "dev:auth_failed:admin:2026-10-28T10:10Z",
    ]);
  });

  it("keeps no part of a presented token, in the store or the logs", async () => {
    const t = clock();
    const s = await stack({ realNow: t.now });
    const presented = makeToken("dev");
    for (let i = 0; i < 3; i++) unauthorized(await get(s, "/admin/status", { authorization: `Bearer ${presented}` }));
    const rows = (await s.db.pg.query("SELECT * FROM gateway.audit_log")).rows;
    const alerts = (await s.db.pg.query("SELECT * FROM gateway.alert_outbox")).rows;
    const text = JSON.stringify([rows, alerts, s.logged]);
    expect(text).not.toContain(presented.slice(10, 30));
    expect(text).not.toContain(s.tokenSha256.slice(8, 40));
  });

  it("only counts and logs a failure while the store is down", async () => {
    const s = await stack({ storeDown: true });
    unauthorized(await get(s, "/admin/status", {}));
    expect(s.logged.map((l) => l.record.event)).toContain("operator.auth_failed");
  });
});

describe("GET /admin/status (operator-admin.md §4.1)", () => {
  it("reports an empty store: no state, no meters", async () => {
    const s = await stack({ realNow: clock().now });
    const res = await get(s, "/admin/status", s.auth());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      store: "uninitialized",
      initialized_at: null,
      initialized_by: null,
      state: null,
      degraded_cause: "store_uninitialized",
      periods: { day: "2026-10-28", month: "2026-10" },
      meters: null,
    });
  });

  it("reports the meters, their thresholds, what fallback can still spend, the limits, the journal, and the alerts", async () => {
    const t = clock();
    const s = await stack({ realNow: t.now });
    const init = await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({
        reason: "New host; the stated values are the bill's.",
        stated: { day_usd: "4.00", month_usd: "10.00", fallback_today_usd: "0.50" },
        renew: true,
      }),
    });
    expect(init.statusCode).toBe(200);
    t.set(T0 + 5_000);
    const res = await get(s, "/admin/status", s.auth());
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "status",
      "stack",
      "env",
      "version",
      "time",
      "real_time",
      "store",
      "initialized_at",
      "initialized_by",
      "state",
      "since",
      "crossed",
      "degraded_cause",
      "periods",
      "meters",
      "fallback",
      "adapters",
      "limits",
      "journal",
      "alerts",
      "config",
      "test_machinery",
    ]);
    expect(body).toMatchObject({
      stack: "dev",
      env: "dev",
      time: "2026-10-28T10:00:05.000Z",
      real_time: "2026-10-28T10:00:05.000Z",
      store: "ok",
      initialized_at: "2026-10-28T10:00:00Z",
      initialized_by: `operator:dev#${s.tokenSha256.slice(0, 8)}`,
      state: "normal",
      since: "2026-10-28T10:00:00Z",
      crossed: [],
      periods: { day: "2026-10-28", month: "2026-10" },
      meters: {
        day: {
          spent_micro_usd: 4_000_000,
          reserved_micro_usd: 0,
          ceiling_micro_usd: 5_000_000,
          warn_micro_usd: 3_500_000,
        },
        month: {
          spent_micro_usd: 10_000_000,
          reserved_micro_usd: 0,
          ceiling_micro_usd: 20_000_000,
          warn_micro_usd: 14_000_000,
        },
        fallback_day: {
          spent_micro_usd: 500_000,
          reserved_micro_usd: 0,
          allowance_micro_usd: 2_500_000,
          warn_micro_usd: 1_900_000,
          grant: 2,
          available_micro_usd: 1_000_000, // the day ceiling's room is the smallest of the three
        },
      },
      fallback: { adapter: null, awaiting_renewal: false, awaiting_since: null },
      limits: { metered_in_flight: 0, metered_last_minute: 0 },
      journal: { status: "ok", file: "journal/2026-10.jsonl" },
      alerts: { pending: 1, failed_last_24h: 0 },
      test_machinery: { clock: true, synthetic: true, clock_offset_ms: null },
    });
    expect(body.adapters).toEqual([expect.objectContaining({ id: "local", role: "primary", healthy: false })]);
  });

  it("shows nothing available to fallback while renewal is pending", async () => {
    const s = await stack({ realNow: clock().now });
    await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({ reason: "First start on this host; no earlier records.", confirm_zero: true }),
    });
    const res = await get(s, "/admin/status", s.auth());
    expect(res.json()).toMatchObject({
      fallback: { awaiting_renewal: true },
      meters: { fallback_day: { allowance_micro_usd: 2_000_000, grant: 1, available_micro_usd: 0 } },
    });
  });
});
