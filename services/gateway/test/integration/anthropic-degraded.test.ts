// Every row of spec 010's Degraded-Mode Behavior table, end to end (spec 010, FR-011, SC-006; tasks.md T046): prod's
// route on the Anthropic API, the local model down, and an in-process stub of the API answering each way it can fail.
// Each answer carries its cause or its line, the stub counts the Messages requests the row allows, and the ledger
// charges what the row says. The admission causes (the kill switch, the ceilings, the sub-budget, the cap, the store)
// are hello-anthropic.test.ts's; this file holds the provider's own failures and the twin's two endings.
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ANTHROPIC_PRICES,
  anthropicBudgets,
  anthropicConfigDir,
  anthropicFactories,
  anthropicRouting,
} from "../helpers/anthropic-config.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";
import { ROOM } from "../helpers/twin.js";
import { ledger, twinStack, type TwinStack } from "../helpers/twin-stack.js";

type Rec = Record<string, unknown>;

const KEY = `test-${randomBytes(16).toString("hex")}`;
let openai: StubOpenAI;
let anthropic: StubAnthropic;
const stacks: TestStack[] = [];
const twins: TwinStack[] = [];
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
  for (const t of twins.splice(0)) await t.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

/** prod on the Anthropic API, initialized, the local model down; a 1 s request timeout keeps the timeout row short. */
async function prod(): Promise<TestStack> {
  const configDir = await anthropicConfigDir({ requestMs: 1000 });
  dirs.push(configDir);
  const { factories } = await anthropicFactories(anthropic.origin);
  openai.setHealth({ status: 503 });
  const s = await testStack({
    stack: "prod",
    env: { LOCAL_MODEL_BASE_URL: openai.baseUrl, GATEWAY_ANTHROPIC_API_KEY: KEY },
    configDir,
    factories,
  });
  stacks.push(s);
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({ reason: "A fresh prod stack for the degraded rows.", confirm_zero: true, renew: true }),
  });
  expect(init.statusCode).toBe(200);
  await s.services.gateway.probeAll();
  return s;
}

const hello = (s: TestStack, client = "198.51.100.7") =>
  s.api.inject({
    method: "POST",
    url: "/hello",
    headers: { "content-type": "application/json", "x-forwarded-for": client },
    payload: JSON.stringify({}),
  });

async function rows(s: TestStack): Promise<Rec[]> {
  return (await s.db.pg.query<Rec>("SELECT * FROM gateway.ledger ORDER BY ts, id")).rows;
}

describe("the API's failures, as the table's rows say (FR-009, FR-011)", () => {
  for (const status of [529, 502, 503]) {
    it(`${status}: cannot_talk.resting (fallback_unavailable), one request, nothing charged`, async () => {
      const s = await prod();
      anthropic.next({ status });
      const res = await hello(s);
      expect(res.statusCode).toBe(503);
      expect(res.headers["x-h4-degraded-cause"]).toBe("fallback_unavailable");
      expect(anthropic.messages()).toHaveLength(1);
      const [row] = await rows(s);
      expect([row?.error_kind, Number(row?.cost_micro), row?.cost_basis]).toEqual(["unavailable", 0, "none"]);
    });
  }

  it("an unreachable API: fallback_unavailable, no request reached it, nothing charged", async () => {
    const s = await prod();
    anthropic.next({ refuse: true });
    const res = await hello(s);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("fallback_unavailable");
    expect(anthropic.messages()).toEqual([]);
    expect(Number((await rows(s))[0]?.cost_micro)).toBe(0);
  });

  it("a rate limit: one retry, which answers, and at most two requests", async () => {
    const s = await prod();
    anthropic.next({ status: 429 });
    anthropic.next({ ok: { text: "Hello again.", inputTokens: 40, outputTokens: 4, finish: "stop" } });
    const res = await hello(s);
    expect(res.statusCode, res.body).toBe(200);
    expect(anthropic.messages()).toHaveLength(2);
  });

  it("a rate limit twice: fallback_unavailable after the one retry", async () => {
    const s = await prod();
    anthropic.next({ status: 429 });
    anthropic.next({ status: 429 });
    const res = await hello(s);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("fallback_unavailable");
    expect(anthropic.messages()).toHaveLength(2);
  });

  it("a call past its request timeout: fallback_unavailable, charged its reserved maximum", async () => {
    const s = await prod();
    anthropic.next({ hang: true });
    const res = await hello(s);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("fallback_unavailable");
    expect(anthropic.messages()).toHaveLength(1);
    const [row] = await rows(s);
    expect([row?.error_kind, row?.cost_basis]).toEqual(["timeout", "reservation"]);
    expect(Number(row?.cost_micro)).toBeGreaterThan(0);
  });
});

describe("the twin's two endings on the Anthropic API (FR-018; spec 007, FR-023)", () => {
  async function room(): Promise<TwinStack> {
    const { factories } = await anthropicFactories(anthropic.origin);
    const t = await twinStack({
      stack: "prod",
      healthy: false,
      files: { routing: anthropicRouting(), prices: ANTHROPIC_PRICES, budgets: anthropicBudgets() },
      factories,
      env: { GATEWAY_ANTHROPIC_API_KEY: KEY },
    });
    twins.push(t);
    t.stub.setHealth({ status: 503 });
    await t.s.services.gateway.probeAll();
    return t;
  }

  it("a refusal: the fixed line withheld, its cost counted, one request", async () => {
    const t = await room();
    anthropic.next({ ok: { text: "I can't help.", inputTokens: 900, outputTokens: 5, finish: "content_filter" } });
    const res = await t.turn({ feature: ROOM.third.id, path: "engineer", turns: [] });
    const twin = t.s.services.twin.load;
    if (!twin.available) throw new Error("the twin isn't available");
    expect(res.json()).toMatchObject({ text: twin.files.lines.withheld, route: "fallback" });
    expect(Number((await ledger(t.s))[0]?.cost_micro)).toBeGreaterThan(0);
    expect(anthropic.messages()).toHaveLength(1);
  });

  it("an answer at max_tokens: trimmed to its last sentence, or withheld, its cost counted", async () => {
    const t = await room();
    anthropic.next({
      ok: {
        text: "A plain answer. And then the cap cut it off mid",
        inputTokens: 900,
        outputTokens: 300,
        finish: "length",
      },
    });
    const trimmed = await t.turn({ feature: ROOM.third.id, path: "engineer", turns: [] });
    expect(trimmed.json()).toMatchObject({ text: "A plain answer.", route: "fallback" });
    anthropic.next({
      ok: { text: "No sentence ends before the cap cut it off", inputTokens: 900, outputTokens: 300, finish: "length" },
    });
    const withheld = await t.turn(
      { feature: ROOM.third.id, path: "engineer", turns: [] },
      { "x-forwarded-for": "198.51.100.9" },
    );
    const twin = t.s.services.twin.load;
    if (!twin.available) throw new Error("the twin isn't available");
    expect(withheld.json()).toMatchObject({ text: twin.files.lines.withheld });
    expect((await ledger(t.s)).every((r) => Number(r.cost_micro) > 0)).toBe(true);
  });
});
