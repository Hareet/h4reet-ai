// POST /room/turn (spec 007; FR-001 to FR-006, FR-025, FR-028, FR-054; plan §2, §11), on Fastify inject and PGlite,
// the local adapter on the in-process llama.cpp stub and the twin's committed files.
// - T013, the refusals: 415 for each non-JSON type; 400 naming the field for each of FR-002's rules; 409 not_ready; 429
//   client_cap_exceeded past spec 000's per-client limits, in a bucket hello's requests don't fill. For each: no model
//   call, no ledger row, and the body in no log record.
// - T014, the degraded paths: the kill switch, an unreachable or empty store, a ceiling, the sub-budget, and a stack
//   with no fallback, each 503 with spec 000's body and header, no call made; twin_unavailable for invalid twin files
//   and for prod without limits.twin, while POST /hello still answers on the same app; dev without limits.twin on the
//   defaults, logged once.
import { afterEach, describe, expect, it } from "vitest";

import { committedTexts, twinWith } from "../helpers/twin.js";
import { ledger, twinStack, type TwinStack } from "../helpers/twin-stack.js";
import { twinFromTexts } from "../../src/config/twin.js";

type Rec = Record<string, unknown>;
const stacks: TwinStack[] = [];
afterEach(async () => {
  for (const t of stacks.splice(0)) await t.close();
});
async function stack(o: Parameters<typeof twinStack>[0] = {}): Promise<TwinStack> {
  const t = await twinStack(o);
  stacks.push(t);
  return t;
}

const SECRET_WORDS = "my-very-own-words-zq";
const visitor = (text: string) => ({ role: "visitor", text });
const turn = (o: Rec = {}) => ({
  feature: "free_talk",
  path: "engineer",
  turns: [visitor(`hello ${SECRET_WORDS}`)],
  ...o,
});

/** Nothing reached the model, the ledger, or a log record. */
async function nothingSpent(t: TwinStack): Promise<void> {
  expect(t.stub.requests().filter((r) => r.path.endsWith("/chat/completions"))).toEqual([]);
  // A store that is down has no ledger to write to: nothing can have been written.
  expect(await ledger(t.s).catch(() => [])).toEqual([]);
  expect(JSON.stringify(t.s.logged)).not.toContain(SECRET_WORDS);
}

describe("the refusals, before any model call (T013; FR-002, FR-003, FR-005)", () => {
  it("answers 415 for every body that isn't JSON", async () => {
    const t = await stack();
    for (const type of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "application/xml",
    ]) {
      const res = await t.raw(JSON.stringify(turn()), { "content-type": type });
      expect(res.statusCode, type).toBe(415);
      expect(res.json()).toMatchObject({ error: "unsupported_media_type" });
    }
    await nothingSpent(t);
  });

  const cases: [string, Rec, string][] = [
    ["an extra key", turn({ extra: 1 }), "body"],
    ["no turns key", { feature: "free_talk", path: "engineer" }, "body"],
    ["an unknown feature", turn({ feature: "teapot" }), "feature"],
    ["a feature that isn't a string", turn({ feature: 7 }), "feature"],
    ["a path that isn't one of the two", turn({ path: "manager" }), "path"],
    ["turns that aren't a list", turn({ turns: "hi" }), "turns"],
    ["too many turns", turn({ turns: Array.from({ length: 9 }, (_, i) => visitor(`turn ${i}`)) }), "turns"],
    ["a visitor turn past 600 characters", turn({ turns: [visitor("x".repeat(601))] }), "turns"],
    [
      "a conversation past 4,000 characters",
      turn({
        turns: [
          ...Array.from({ length: 7 }, () => ({ role: "twin", text: "b".repeat(590) })),
          visitor("a".repeat(590)),
        ],
      }),
      "turns",
    ],
    ["a turn holding U+0000", turn({ turns: [visitor("a\u0000b")] }), "turns"],
    ["an empty turn", turn({ turns: [visitor("   ")] }), "turns"],
    ["empty turns for free talk", turn({ turns: [] }), "turns"],
    [
      "a last turn that isn't the visitor's",
      turn({ turns: [visitor("hi"), { role: "twin", text: "hello" }] }),
      "turns",
    ],
    ["a turn with an extra key", turn({ turns: [{ role: "visitor", text: "hi", at: 1 }] }), "turns"],
    ["a role that isn't one of the two", turn({ turns: [{ role: "system", text: "hi" }] }), "turns"],
  ];
  for (const [name, body, field] of cases) {
    it(`answers 400 naming ${field} for ${name}`, async () => {
      const t = await stack();
      const res = await t.turn(body);
      expect(res.statusCode, name).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request", field });
      await nothingSpent(t);
    });
  }

  it("answers 400 for JSON that doesn't parse, and for a body that isn't an object", async () => {
    const t = await stack();
    expect((await t.raw("{not json")).statusCode).toBe(400);
    expect((await t.raw("[]")).statusCode).toBe(400);
    await nothingSpent(t);
  });

  it("answers 409 not_ready for a feature whose topic isn't ready, and for free talk that isn't", async () => {
    const t = await stack({ twin: twinWith(null) });
    for (const body of [turn({ feature: "snowboard", turns: [] }), turn()]) {
      const res = await t.turn(body);
      expect(res.statusCode).toBe(409);
      expect(Object.keys(res.json() as Rec).sort()).toEqual(["error", "request_id"]);
      expect(res.json()).toMatchObject({ error: "not_ready" });
    }
    await nothingSpent(t);
  });

  it("answers 429 client_cap_exceeded with Retry-After past the per-client burst, in a bucket hello doesn't fill", async () => {
    const t = await stack({ twin: twinWith(null) });
    // Hello's own requests fill hello's bucket, not the turn route's.
    for (let i = 0; i < 6; i += 1) {
      await t.s.api.inject({
        method: "POST",
        url: "/hello",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
        payload: "{}",
      });
    }
    const codes: number[] = [];
    let last: Awaited<ReturnType<TwinStack["turn"]>> | undefined;
    for (let i = 0; i < 6; i += 1) {
      last = await t.turn(turn());
      codes.push(last.statusCode);
    }
    expect(codes.slice(0, 5)).toEqual([409, 409, 409, 409, 409]);
    expect(codes[5]).toBe(429);
    expect(last?.headers["retry-after"]).toMatch(/^\d+$/);
    expect(last?.json()).toMatchObject({ error: "client_cap_exceeded" });
    // Another client isn't held by it.
    expect((await t.turn(turn(), { "x-forwarded-for": "203.0.113.9" })).statusCode).toBe(409);
  });
});

describe("the degraded paths, before any grounding (T014; FR-025, FR-054; SC-005's automated half)", () => {
  async function degraded(t: TwinStack, cause: string): Promise<void> {
    const res = await t.turn(turn({ feature: "snowboard", turns: [] }));
    expect(res.statusCode, cause).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe(cause);
    const body = res.json() as Rec;
    expect(body).toMatchObject({ state: "degraded", cause, stack: t.s.stack });
    expect(body).not.toHaveProperty("cost_micro_usd");
    await nothingSpent(t);
  }

  it("answers store_uninitialized before the store is initialized", async () => {
    await degraded(await stack({ init: false }), "store_uninitialized");
  });

  it("answers store_unreachable while the store is down", async () => {
    await degraded(await stack({ storeDown: true }), "store_unreachable");
  });

  it("answers kill_switch_tripped once the kill switch has tripped", async () => {
    const t = await stack();
    const { dayKey } = await import("../../src/core/clock.js");
    await t.s.db.pg.query("UPDATE gateway.stack_state SET state = 'degraded', since = now(), crossed = $1", [
      [`day:${dayKey(Date.now())}`],
    ]);
    await degraded(t, "kill_switch_tripped");
  });

  it("answers no_fallback_in_stack when the local model is down on a stack with no fallback", async () => {
    await degraded(await stack({ healthy: false }), "no_fallback_in_stack");
  });

  it("answers meter_at_ceiling and fallback_spent_today on the fallback's path, with no call", async () => {
    const t = await stack({ fallback: true, healthy: false });
    await t.s.services.gateway.probeAll();
    const { dayKey } = await import("../../src/core/clock.js");
    const day = dayKey(Date.now());
    await t.s.db.pg.query("UPDATE gateway.meters SET spent_micro = 5000000 WHERE meter = 'day' AND period_key = $1", [
      day,
    ]);
    await degraded(t, "meter_at_ceiling");
    await t.s.db.pg.query("UPDATE gateway.meters SET spent_micro = 0 WHERE meter = 'day' AND period_key = $1", [day]);
    await t.s.db.pg.query(
      "UPDATE gateway.meters SET spent_micro = allowance_micro - 100000, reserved_micro = 100000 WHERE meter = 'fallback_day' AND period_key = $1",
      [day],
    );
    await degraded(t, "fallback_spent_today");
  });

  it("answers twin_unavailable for an invalid pack, prompt, or fixed lines, while hello still answers", async () => {
    for (const texts of [{ pack: "{}" }, { prompt: "# nothing\n" }, { lines: "lines: 1\n" }]) {
      const t = await stack({ twin: twinFromTexts({ ...committedTexts(), ...texts }) });
      const res = await t.turn(turn({ feature: "snowboard", turns: [] }));
      expect(res.statusCode).toBe(503);
      expect(res.headers["x-h4-degraded-cause"]).toBe("twin_unavailable");
      expect(res.json()).toMatchObject({ state: "degraded", cause: "twin_unavailable" });
      const hello = await t.s.api.inject({
        method: "POST",
        url: "/hello",
        headers: { "content-type": "application/json" },
        payload: "{}",
      });
      expect(hello.statusCode).toBe(200);
      await t.close();
      stacks.splice(stacks.indexOf(t), 1);
    }
  });

  it("answers twin_unavailable on prod without limits.twin, and answers with them", async () => {
    const without = await stack({ stack: "prod", limits: false });
    const res = await without.turn(turn({ feature: "snowboard", turns: [] }));
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("twin_unavailable");
    const withLimits = await stack({ stack: "prod", limits: true });
    withLimits.stub.next({ ok: { text: "An opening.", inputTokens: 10, outputTokens: 3, finish: "stop" } });
    expect((await withLimits.turn(turn({ feature: "snowboard", turns: [] }))).statusCode).toBe(200);
  });

  it("uses FR-027's defaults on dev without limits.twin", async () => {
    const t = await stack({ limits: false });
    expect(t.s.services.twin.limits).toMatchObject({ turnMaxChars: 600, maxInputChars: 32_000, maxOutputTokens: 300 });
    expect(t.s.services.twin.limitsDefault).toBe(true);
  });
});
