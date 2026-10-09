// POST /hello through dev's synthetic fallback (tasks.md T073, T074; contracts/gateway-http.md §2.4, §2.5, §3;
// FR-022), on Fastify inject and PGlite, with the local adapter talking to an in-process stub of llama.cpp's API:
// - local unhealthy, then local failing: the fallback answers 200, metered, at $0.10 a call;
// - every admission cause in its precedence, as 503 with X-H4-Degraded-Cause;
// - the metered limits in memory, as 429;
// - GET /health's dry run of the fallback branch;
// - dev's route without its switch: no fallback at all.
import { chmod, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
import { clientKey } from "../../src/core/limits.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;
const HEX32 = /^[0-9a-f]{32}$/;

const stacks: TestStack[] = [];
const stubs: StubOpenAI[] = [];
afterEach(async () => {
  for (const s of stacks.splice(0)) {
    await chmod(join(s.stateDir, "journal"), 0o700).catch(() => {});
    await s.close();
  }
  for (const stub of stubs.splice(0)) await stub.close();
});

/**
 * A dev stack whose route falls back to the synthetic adapter, initialized with renewal granted, and probed once:
 * the synthetic adapter is healthy, and local isn't yet (it needs three passes in a row).
 */
async function stack(o: { synthetic?: boolean } = {}): Promise<{ s: TestStack; stub: StubOpenAI }> {
  const stub = await stubOpenAI({ model: "stand-in" });
  stubs.push(stub);
  const s = await testStack({
    fallback: true,
    env: {
      LOCAL_MODEL_BASE_URL: stub.baseUrl,
      ...(o.synthetic === false ? { GATEWAY_TEST_SYNTHETIC_SPEND: "0" } : {}),
    },
  });
  stacks.push(s);
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({ reason: "Fresh dev stack for the fallback tests.", confirm_zero: true, renew: true }),
  });
  expect(init.statusCode).toBe(200);
  await s.services.gateway.probeAll();
  return { s, stub };
}

const hello = (s: TestStack, headers: Record<string, string> = {}, body: Rec = {}) =>
  s.api.inject({
    method: "POST",
    url: "/hello",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
    payload: JSON.stringify(body),
  });

const health = async (s: TestStack): Promise<Rec> =>
  (await s.api.inject({ method: "GET", url: "/health" })).json() as Rec;

async function meters(s: TestStack): Promise<Rec[]> {
  return (await s.db.pg.query<Rec>("SELECT meter, spent_micro, reserved_micro FROM gateway.meters ORDER BY meter"))
    .rows;
}

describe("the fallback answers while local can't (gateway-http.md §2.4 steps 5.2–5.8)", () => {
  it("answers 200 from the synthetic fallback while local is unhealthy, metered at $0.10", async () => {
    const { s } = await stack();
    const res = await hello(s, { "x-h4-client": "author-laptop" }, { message: "Say hello." });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Rec;
    expect(Object.keys(body)).toEqual([
      "answer",
      "route",
      "route_reason",
      "provider",
      "model",
      "usage",
      "cost_usd",
      "cost_micro_usd",
      "price_version",
      "latency_ms",
      "stack",
      "request_id",
      "trace_id",
    ]);
    expect(body).toMatchObject({
      answer: "synthetic response",
      route: "fallback",
      route_reason: "local_unhealthy",
      provider: "synthetic",
      model: "metered-test",
      usage: { input_tokens: 0, output_tokens: 1_000 },
      cost_usd: 0.1,
      cost_micro_usd: 100_000,
      price_version: "2026-10-08.1",
      stack: "dev",
    });
    expect(body.trace_id).toMatch(HEX32);
    const ledger = (await s.db.pg.query<Rec>("SELECT * FROM gateway.ledger")).rows;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      route_decision: "fallback",
      route_reason: "local_unhealthy",
      attribution: "fallback",
      adapter_id: "synthetic",
      cost_micro: 100_000,
      cost_basis: "usage",
      purpose: "hello",
      trace_id: body.trace_id,
      client_label: "author-laptop",
    });
    expect((await meters(s)).map((m) => [m.meter, m.spent_micro, m.reserved_micro])).toEqual([
      ["day", 100_000, 0],
      ["fallback_day", 100_000, 0],
      ["month", 100_000, 0],
    ]);
    const month = monthKey(Date.now());
    const journal = (await readFile(join(s.stateDir, "journal", `${month}.jsonl`), "utf8"))
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l) as Rec);
    expect(journal.map((r) => r.kind)).toEqual(["operator", "reserve", "commit"]);
    expect(s.logged.some((l) => l.record.event === "call.completed" && l.record.attribution === "fallback")).toBe(true);
    // The label stays in the ledger: no log record carries it.
    expect(JSON.stringify(s.logged)).not.toContain("author-laptop");
    expect(await health(s)).toMatchObject({ status: "ok", degraded_cause: null, fallback: { adapter: "synthetic" } });
  });

  it("fails over when the local call itself fails, as local_failed, writing both attempts' rows", async () => {
    const { s, stub } = await stack();
    await s.services.gateway.probeAll();
    await s.services.gateway.probeAll(); // three passes in a row: local is healthy
    expect(s.services.gateway.routedAdapters().map((a) => a.health.healthy)).toEqual([true, true]);
    stub.next({ refuse: true }); // the model server stops between the probe and the call
    const res = await hello(s);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ route: "fallback", route_reason: "local_failed", provider: "synthetic" });
    const rows = (
      await s.db.pg.query<Rec>(
        "SELECT route_decision, attribution, outcome, error_kind FROM gateway.ledger ORDER BY ts",
      )
    ).rows;
    expect(rows).toEqual(
      expect.arrayContaining([
        { route_decision: "local", attribution: "none", outcome: "error", error_kind: "unavailable" },
        { route_decision: "fallback", attribution: "fallback", outcome: "ok", error_kind: null },
      ]),
    );
    expect(rows).toHaveLength(2);
  });
});

describe("the admission causes, as 503 (gateway-http.md §2.4 step 5.6; §3)", () => {
  const degraded = (res: Awaited<ReturnType<typeof hello>>, cause: string) => {
    expect(res.statusCode, res.body).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe(cause);
    expect(res.json()).toMatchObject({ state: "degraded", cause, stack: "dev" });
  };

  it("spends the grant, then answers fallback_awaiting_renewal, which GET /health names too", async () => {
    const { s } = await stack();
    for (let i = 0; i < 20; i++)
      expect((await hello(s, { "x-forwarded-for": `198.51.100.${i}` })).statusCode).toBe(200);
    const res = await hello(s, { "x-forwarded-for": "198.51.100.99" });
    degraded(res, "fallback_awaiting_renewal");
    const body = res.json() as Rec;
    expect(body.detail).toBe(
      "The local model is unavailable, and the fallback sub-budget ran out. It stays refused until the operator renews it.",
    );
    expect(body.since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(await health(s)).toMatchObject({
      status: "degraded",
      degraded_cause: "fallback_awaiting_renewal",
      fallback: { adapter: "synthetic", awaiting_renewal: true },
    });
    // Each degraded response records its cause: the counter and the log (§2.5.2).
    expect(s.logged.filter((l) => l.record.event === "call.degraded").map((l) => l.record.cause)).toContain(
      "fallback_awaiting_renewal",
    );
    // The warning and the exhaustion went into the outbox with the commits that crossed them. init with renew
    // granted today's $2 as grant 2 (data-model.md §8 step 8), so their keys end :g2.
    const keys = (await s.db.pg.query<Rec>("SELECT dedupe_key FROM gateway.alert_outbox ORDER BY id")).rows.map(
      (r) => r.dedupe_key,
    );
    const day = dayKey(Date.now());
    expect(keys.slice(1)).toEqual([`dev:warn:fallback_day:${day}:g2`, `dev:fallback_exhausted:fallback_day:${day}:g2`]);
  });

  it("answers meter_at_ceiling before the sub-budget's causes, with the ceilings", async () => {
    const { s } = await stack();
    const day = dayKey(Date.now());
    await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 5000000 WHERE meter = 'day' AND period_key = $1", [
      day,
    ]);
    await s.db.pg.query(
      "UPDATE gateway.stack_state SET fallback_awaiting_renewal = true, fallback_awaiting_since = now()",
    );
    const res = await hello(s);
    degraded(res, "meter_at_ceiling");
    expect(res.json()).toMatchObject({ ceilings: ["day"] });
    await s.services.gateway.refreshGauges();
    expect(await health(s)).toMatchObject({ degraded_cause: "meter_at_ceiling" });
  });

  it("answers kill_switch_tripped after the commit that reached the ceiling, local answers included", async () => {
    const { s } = await stack();
    const day = dayKey(Date.now());
    await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 4900000 WHERE meter = 'day' AND period_key = $1", [
      day,
    ]);
    expect((await hello(s)).statusCode).toBe(200); // $5.00: the trip
    expect((await s.db.pg.query<Rec>("SELECT state FROM gateway.stack_state")).rows).toEqual([{ state: "degraded" }]);
    await s.services.gateway.probeAll();
    await s.services.gateway.probeAll(); // local healthy again: it is refused too
    const res = await hello(s);
    degraded(res, "kill_switch_tripped");
    expect(res.json()).toMatchObject({ ceilings: ["day"] });
  });

  it("answers journal_unwritable when the reserve record can't be written, and local answers are unaffected", async () => {
    const { s } = await stack();
    const dir = join(s.stateDir, "journal");
    await mkdir(dir, { recursive: true });
    // init's record made this month's file; a file that can't be written, in a directory that can't be either.
    await chmod(join(dir, `${monthKey(Date.now())}.jsonl`), 0o400);
    await chmod(dir, 0o500);
    const res = await hello(s);
    degraded(res, "journal_unwritable");
    expect((await s.db.pg.query("SELECT count(*)::int AS n FROM gateway.reservations")).rows).toEqual([{ n: 0 }]);
    expect(await health(s)).toMatchObject({ journal: "unwritable", degraded_cause: "journal_unwritable" });
    await s.services.gateway.probeAll();
    await s.services.gateway.probeAll();
    expect((await hello(s)).json()).toMatchObject({ route: "local" });
  });
});

describe("the metered limits in memory, as 429 (gateway-http.md §2.4 step 5.5; §2.5.3)", () => {
  const held = (s: TestStack, key?: string) =>
    s.services.meter.admit({
      attribution: "fallback",
      adapter: {
        id: "synthetic",
        provider: "synthetic",
        model: "metered-test",
        fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
      },
      adapterHealthy: true,
      maxOutputTokens: 128,
      ...(key === undefined ? {} : { clientKey: key }),
      requestId: "0".repeat(32),
      traceId: "1".repeat(32),
      purpose: "hello",
      routeReason: "local_unhealthy",
    });

  it("refuses a client's second metered call in flight with client_cap_exceeded, not a degraded state", async () => {
    const { s } = await stack();
    expect((await held(s, clientKey("198.51.100.7", "author-laptop"))).ok).toBe(true);
    const res = await hello(s, { "x-h4-client": "author-laptop" });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("1");
    expect(res.headers["x-h4-degraded-cause"]).toBeUndefined();
    expect(res.json()).toEqual({
      error: "client_cap_exceeded",
      limit: "metered_in_flight",
      retry_after_s: 1,
      request_id: res.headers["x-request-id"],
    });
    // Another client isn't held back by it.
    expect((await hello(s, { "x-h4-client": "someone-else" })).statusCode).toBe(200);
    expect(s.logged.find((l) => l.record.event === "call.refused")?.record).toEqual({
      event: "call.refused",
      error: "client_cap_exceeded",
      limit: "metered_in_flight",
    });
  });

  it("refuses a fifth metered call in flight with metered_capacity_exceeded, before an unhealthy fallback's cause", async () => {
    const { s } = await stack();
    for (let i = 0; i < 4; i++) expect((await held(s)).ok).toBe(true);
    const res = await hello(s);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      error: "metered_capacity_exceeded",
      limit: "global_in_flight",
      retry_after_s: 1,
    });
  });
});

describe("dev's route without its switch (provider-adapter.md §3.3)", () => {
  it("has no fallback, so hello with local unhealthy answers no_fallback_in_stack", async () => {
    const { s } = await stack({ synthetic: false });
    const res = await hello(s);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("no_fallback_in_stack");
    expect(await health(s)).toMatchObject({
      degraded_cause: "no_fallback_in_stack",
      fallback: { adapter: null },
      test_machinery: { synthetic: false },
    });
  });
});
