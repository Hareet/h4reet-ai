// POST /hello on prod with the Anthropic API as its paid fallback (spec 010; tasks.md T010, T026): the real
// anthropic-messages adapter, its SDK, and its transport, against an in-process stub of the API, through the module's
// deps seam; the key is a run-time value. The local model is a stub that needs three passes to turn healthy, so after
// one probe the local model is down and the fallback answers.
//
// The degraded half (T010, FR-011, FR-013, SC-006's automated half): every cause answers 503 with spec 000's body and
// header, and the stub counts no Messages request.
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { dayKey, monthKey } from "../../src/core/clock.js";
import { anthropicConfigDir, anthropicFactories } from "../helpers/anthropic-config.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

const KEY = `test-${randomBytes(16).toString("hex")}`;
let openai: StubOpenAI;
let anthropic: StubAnthropic;
const stacks: TestStack[] = [];
const dirs: string[] = [];
beforeAll(async () => {
  openai = await stubOpenAI({ model: "stand-in" });
  anthropic = await stubAnthropic();
});
afterAll(async () => {
  await anthropic.close();
  await openai.close();
});
afterEach(async () => {
  openai.reset();
  anthropic.reset();
  for (const s of stacks.splice(0)) await s.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

/** prod with the Anthropic fallback, initialized with renewal granted unless told not to, and probed once. */
async function prod(
  o: { init?: boolean; storeDown?: boolean; fallback?: "anthropic" | "bedrock"; cap?: string } = {},
): Promise<TestStack> {
  const configDir = await anthropicConfigDir({
    ...(o.fallback === undefined ? {} : { fallback: o.fallback }),
    ...(o.cap === undefined ? {} : { cap: o.cap }),
  });
  dirs.push(configDir);
  const { factories } = await anthropicFactories(anthropic.origin);
  openai.setHealth({ status: 503 }); // the local model stays down: every turn is the fallback's
  const s = await testStack({
    stack: "prod",
    env: { LOCAL_MODEL_BASE_URL: openai.baseUrl, GATEWAY_ANTHROPIC_API_KEY: KEY },
    configDir,
    factories,
    ...(o.storeDown === true ? { storeDown: true } : {}),
  });
  stacks.push(s);
  if (o.init !== false && o.storeDown !== true) {
    const init = await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({
        reason: "A fresh prod stack for the anthropic test.",
        confirm_zero: true,
        renew: true,
      }),
    });
    expect(init.statusCode, init.body).toBe(200);
  }
  await s.services.gateway.probeAll(); // local needs three passes in a row; the Anthropic API, one
  return s;
}

const hello = (s: TestStack, headers: Record<string, string> = {}) =>
  s.api.inject({
    method: "POST",
    url: "/hello",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
    payload: JSON.stringify({}),
  });

const degraded = (res: Awaited<ReturnType<typeof hello>>, cause: string): void => {
  expect(res.statusCode, res.body).toBe(503);
  expect(res.headers["x-h4-degraded-cause"]).toBe(cause);
  expect(res.json()).toMatchObject({ state: "degraded", cause, stack: "prod" });
  expect(res.body).not.toContain(KEY);
};

describe("every degraded cause on prod's anthropic route makes no Messages request (FR-013, SC-006)", () => {
  it("store_unreachable", async () => {
    const s = await prod({ storeDown: true });
    degraded(await hello(s), "store_unreachable");
    expect(anthropic.messages()).toEqual([]);
  });

  it("store_uninitialized", async () => {
    const s = await prod({ init: false });
    degraded(await hello(s), "store_uninitialized");
    expect(anthropic.messages()).toEqual([]);
  });

  it("kill_switch_tripped", async () => {
    const s = await prod();
    await s.db.pg.query("UPDATE gateway.stack_state SET state = 'degraded', crossed = $1, since = now()", [
      [`day:${dayKey(Date.now())}`],
    ]);
    degraded(await hello(s), "kill_switch_tripped");
    expect(anthropic.messages()).toEqual([]);
  });

  it("meter_at_ceiling", async () => {
    const s = await prod();
    await s.db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, created_at, updated_at)
       VALUES ('day', $1, 5000000, 0, now(), now())
       ON CONFLICT (meter, period_key) DO UPDATE SET spent_micro = 5000000`,
      [dayKey(Date.now())],
    );
    degraded(await hello(s), "meter_at_ceiling");
    expect(anthropic.messages()).toEqual([]);
  });

  it("adapter_month_spent, which GET /health names too", async () => {
    const s = await prod();
    await s.db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, created_at, updated_at)
       VALUES ('adapter_month', $1, 10000000, 0, now(), now())`,
      [`anthropic:${monthKey(Date.now())}`],
    );
    const res = await hello(s);
    degraded(res, "adapter_month_spent");
    expect(res.json()).toMatchObject({
      detail: "The local model is unavailable, and the paid fallback has reached its monthly cap.",
    });
    expect(anthropic.messages()).toEqual([]);
    const health = (await s.api.inject({ method: "GET", url: "/health" })).json() as Rec;
    expect(health).toMatchObject({ status: "degraded", degraded_cause: "adapter_month_spent" });
  });

  it("fallback_awaiting_renewal", async () => {
    const s = await prod();
    await s.db.pg.query(
      "UPDATE gateway.stack_state SET fallback_awaiting_renewal = true, fallback_awaiting_since = now()",
    );
    degraded(await hello(s), "fallback_awaiting_renewal");
    expect(anthropic.messages()).toEqual([]);
  });

  it("fallback_spent_today", async () => {
    const s = await prod();
    await s.db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no, created_at,
         updated_at)
       VALUES ('fallback_day', $1, 0, 2000000, 2000000, 1, now(), now())
       ON CONFLICT (meter, period_key) DO UPDATE SET reserved_micro = 2000000`,
      [dayKey(Date.now())],
    );
    degraded(await hello(s), "fallback_spent_today");
    expect(anthropic.messages()).toEqual([]);
  });

  it("fallback_unavailable, when the health check finds the key refused", async () => {
    anthropic.setHealth({ status: 401 });
    const s = await prod();
    const [, fallback] = s.services.gateway.routedAdapters();
    expect([fallback?.id, fallback?.health.healthy, fallback?.health.reason]).toEqual([
      "anthropic",
      false,
      "credentials",
    ]);
    degraded(await hello(s), "fallback_unavailable");
    expect(anthropic.messages()).toEqual([]);
  });

  it("fallback_unavailable, while the circuit is open, though the check passes", async () => {
    const s = await prod();
    for (let i = 0; i < 3; i++) {
      anthropic.next({ status: 503 });
      expect((await hello(s)).statusCode).toBe(503);
      await s.services.gateway.probeAll(); // the check passes again; the circuit counts the failures
    }
    expect(anthropic.messages()).toHaveLength(3);
    const [, fallback] = s.services.gateway.routedAdapters();
    expect(fallback?.health.healthy).toBe(false);
    degraded(await hello(s), "fallback_unavailable");
    expect(anthropic.messages()).toHaveLength(3);
  });
});

// The happy path (T026, FR-001 to FR-003, FR-019, FR-020, FR-033, SC-001's automated half).
describe("the Anthropic API answers hello while the local model can't (FR-001, FR-019, FR-020)", () => {
  it("says route fallback, and the ledger row names the provider, the model, the tokens, and the priced cost", async () => {
    const s = await prod();
    anthropic.next({ ok: { text: "Hello there.", inputTokens: 40, outputTokens: 4, finish: "stop" } });
    const res = await hello(s);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as Rec;
    expect(body).toMatchObject({
      answer: "Hello there.",
      route: "fallback",
      route_reason: "local_unhealthy",
      provider: "anthropic",
      model: "claude-haiku-5-5",
      usage: { input_tokens: 40, output_tokens: 4 },
    });
    const rows = (await s.db.pg.query<Rec>("SELECT * FROM gateway.ledger ORDER BY ts, id")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "anthropic",
      adapter_id: "anthropic",
      request_model: "claude-haiku-5-5",
      input_tokens: 40,
      output_tokens: 4,
      attribution: "fallback",
      route_decision: "fallback",
      route_reason: "local_unhealthy",
    });
    // $1 in and $5 out per million: 40 + 20 micro-USD.
    expect(Number(rows[0]?.cost_micro)).toBe(60);
    expect(body.cost_micro_usd).toBe(60);
    const meters = (
      await s.db.pg.query<Rec>("SELECT meter, period_key, spent_micro::text AS spent FROM gateway.meters ORDER BY meter")
    ).rows;
    for (const meter of ["day", "month", "fallback_day", "adapter_month"]) {
      expect(meters.find((m) => m.meter === meter)?.spent, meter).toBe("60");
    }
    expect(meters.find((m) => m.meter === "adapter_month")?.period_key).toBe(`anthropic:${monthKey(Date.now())}`);
    // Only the stub's origin was reached, and the request carried no temperature.
    expect(anthropic.messages()).toHaveLength(1);
    expect(anthropic.messages()[0]?.body).not.toHaveProperty("temperature");
  });

  it("sends nothing to the Anthropic API while the local model is healthy, over 100 turns", async () => {
    const s = await prod();
    openai.setHealth(undefined);
    for (let i = 0; i < 3; i++) await s.services.gateway.probeAll();
    for (let i = 1; i <= 100; i++) {
      const res = await hello(s, { "x-forwarded-for": `198.51.100.${i}` });
      expect(res.statusCode, res.body).toBe(200);
      expect((res.json() as Rec).route).toBe("local");
    }
    expect(anthropic.requests().filter((r) => r.method === "POST")).toEqual([]);
  });

  it("builds no anthropic adapter while prod's route names Bedrock, and its admin route answers unknown_adapter", async () => {
    const configDir = await anthropicConfigDir({ fallback: "bedrock" });
    dirs.push(configDir);
    const { factories, built } = await anthropicFactories(anthropic.origin);
    const s = await testStack({
      stack: "prod",
      env: { LOCAL_MODEL_BASE_URL: openai.baseUrl, GATEWAY_ANTHROPIC_API_KEY: "" },
      configDir,
      factories,
    });
    stacks.push(s);
    expect(built).toEqual([]);
    expect(s.services.gateway.routedAdapters().map((a) => a.id)).toEqual(["local", "bedrock"]);
    const res = await s.admin.inject({
      method: "POST",
      url: "/admin/adapters/anthropic/complete",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({
        messages: [{ role: "user", content: "Say hello." }],
        max_output_tokens: 16,
        purpose: "contract",
        reason: "A live run on an adapter the route doesn't name.",
      }),
    });
    expect(res.statusCode, res.body).toBe(404);
    expect(res.json()).toMatchObject({ error: "unknown_adapter" });
    expect(anthropic.requests()).toEqual([]);
  });
});
