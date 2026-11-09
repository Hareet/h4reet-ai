// A room turn on prod with the Anthropic API as its paid fallback (spec 010, FR-001 to FR-003, FR-017 to FR-020;
// tasks.md T026): the twin's turn route, the real anthropic-messages adapter over its transport, and an in-process
// stub of the Messages API; the key is a run-time value. The local model is down, so the paid fallback answers, metered
// at a made-up price, with no temperature (model_default), counted toward the day, the month, the sub-budget, and the
// adapter's month; and a refusal is withheld whole, its cost still counted.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { monthKey } from "../../src/core/clock.js";
import {
  ANTHROPIC_PRICES,
  anthropicBudgets,
  anthropicFactories,
  anthropicRouting,
} from "../helpers/anthropic-config.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";
import { ROOM } from "../helpers/twin.js";
import { ledger, twinStack, type TwinStack } from "../helpers/twin-stack.js";

type Rec = Record<string, unknown>;

const KEY = `test-${randomBytes(16).toString("hex")}`;
let anthropic: StubAnthropic;
const stacks: TwinStack[] = [];
beforeAll(async () => {
  anthropic = await stubAnthropic();
});
afterAll(async () => {
  await anthropic.close();
});
afterEach(async () => {
  anthropic.reset();
  for (const t of stacks.splice(0)) await t.close();
});

async function prod(): Promise<TwinStack> {
  const { factories } = await anthropicFactories(anthropic.origin);
  const t = await twinStack({
    stack: "prod",
    healthy: false,
    files: { routing: anthropicRouting(), prices: ANTHROPIC_PRICES, budgets: anthropicBudgets() },
    factories,
    env: { GATEWAY_ANTHROPIC_API_KEY: KEY },
  });
  stacks.push(t);
  t.stub.setHealth({ status: 503 }); // the local model stays down
  await t.s.services.gateway.probeAll();
  return t;
}

describe("a room turn the Anthropic API answers (FR-001, FR-019, FR-020)", () => {
  it("says route fallback, charges its priced cost to the ledger, and sends no temperature", async () => {
    const t = await prod();
    anthropic.next({ ok: { text: "A plain answer.", inputTokens: 900, outputTokens: 9, finish: "stop" } });
    const res = await t.turn({ feature: ROOM.third.id, path: "engineer", turns: [] });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as Rec;
    expect(body).toMatchObject({ feature: ROOM.third.id, route: "fallback", text: "A plain answer." });
    const rows = await ledger(t.s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "anthropic",
      adapter_id: "anthropic",
      request_model: "claude-haiku-5-5",
      input_tokens: 900,
      output_tokens: 9,
      attribution: "fallback",
      purpose: "twin",
      room_feature: ROOM.third.id,
    });
    // $1 in and $5 out per million: 900 + 45 micro-USD, rounded up once.
    expect(Number(rows[0]?.cost_micro)).toBe(945);
    expect(body.cost_micro_usd).toBe(945);
    const [sent] = anthropic.messages();
    expect(sent?.body).not.toHaveProperty("temperature");
    expect(String(sent?.headers.authorization)).toBe(`Bearer ${KEY}`);
    const meters = (
      await t.s.db.pg.query<Rec>("SELECT meter, spent_micro::text AS spent FROM gateway.meters ORDER BY meter")
    ).rows;
    expect(meters).toEqual(
      expect.arrayContaining([
        { meter: "day", spent: "945" },
        { meter: "month", spent: "945" },
        { meter: "fallback_day", spent: "945" },
        { meter: "adapter_month", spent: "945" },
      ]),
    );
    const month = await t.s.db.pg.query<Rec>("SELECT period_key FROM gateway.meters WHERE meter = 'adapter_month'");
    expect(month.rows).toEqual([{ period_key: `anthropic:${monthKey(Date.now())}` }]);
  });

  it("withholds a refusal whole as the fixed line, under refusal, its cost still counted (FR-018)", async () => {
    const t = await prod();
    anthropic.next({
      ok: { text: "I won't answer that.", inputTokens: 900, outputTokens: 9, finish: "content_filter" },
    });
    const res = await t.turn({ feature: ROOM.third.id, path: "engineer", turns: [] });
    expect(res.statusCode).toBe(200);
    const twin = t.s.services.twin.load;
    if (!twin.available) throw new Error("the twin isn't available");
    expect(res.json()).toMatchObject({ text: twin.files.lines.withheld, route: "fallback", cost_micro_usd: 945 });
    expect(res.body).not.toContain("won't answer");
    expect(anthropic.messages()).toHaveLength(1);
    const [row] = await ledger(t.s);
    expect([row?.finish_reason, Number(row?.cost_micro)]).toEqual(["content_filter", 945]);
  });
});
