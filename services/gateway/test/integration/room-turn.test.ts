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

import { ROOM, committed, committedTexts, readinessText, runningHashes, short, twinWith } from "../helpers/twin.js";
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
    for (const body of [turn({ feature: ROOM.lead.id, turns: [] }), turn()]) {
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
    const res = await t.turn(turn({ feature: ROOM.lead.id, turns: [] }));
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
      const res = await t.turn(turn({ feature: ROOM.lead.id, turns: [] }));
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
    const res = await without.turn(turn({ feature: ROOM.lead.id, turns: [] }));
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("twin_unavailable");
    const withLimits = await stack({ stack: "prod", limits: true });
    withLimits.stub.next({ ok: { text: "An opening.", inputTokens: 10, outputTokens: 3, finish: "stop" } });
    expect((await withLimits.turn(turn({ feature: ROOM.lead.id, turns: [] }))).statusCode).toBe(200);
  });

  it("uses FR-027's defaults on dev without limits.twin", async () => {
    const t = await stack({ limits: false });
    expect(t.s.services.twin.limits).toMatchObject({ turnMaxChars: 600, maxInputChars: 32_000, maxOutputTokens: 300 });
    expect(t.s.services.twin.limitsDefault).toBe(true);
  });
});

// T037 (spec 007; FR-003, FR-004, FR-006, FR-008, FR-024, FR-026; SC-006's automated half; plan §2): the happy path,
// User Story 1's acceptance test over the units the foundation built.
describe("an answered turn (T037; User Story 1)", () => {
  type Sent = { messages: { role: string; content: string }[] };
  const sentTo = (t: TwinStack): Sent[] =>
    t.stub
      .requests()
      .filter((r) => r.path.endsWith("/chat/completions"))
      .map((r) => r.body as Sent);

  it("grounds a ready selectable's opening in the rules, 00, and its topic's files alone, with the piece's lead", async () => {
    const t = await stack();
    t.stub.next({
      ok: { text: "Winter first: he rides every season.", inputTokens: 900, outputTokens: 12, finish: "stop" },
    });
    const res = await t.turn({ feature: ROOM.lead.id, path: "non-engineer", turns: [] });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Rec;
    expect(Object.keys(body).sort()).toEqual(["cost_micro_usd", "feature", "route", "text"]);
    expect(body).toEqual({
      text: "Winter first: he rides every season.",
      feature: ROOM.lead.id,
      cost_micro_usd: 0,
      route: "local",
    });
    const [sent] = sentTo(t);
    expect(sent?.messages.map((m) => m.role)).toEqual(["system", "user"]);
    const system = sent?.messages[0]?.content ?? "";
    expect(system).toContain("[00-profile — Role at a glance]");
    expect(system).toContain(`[${short(ROOM.lead.files[0] ?? "")} — `);
    // The rules carry every file's "Do not claim" bullets; no other file's sections come.
    expect(system).not.toContain(`[${short(ROOM.third.files[0] ?? "")} —`);
    expect(system).not.toContain("[01-ai-strategy-and-cht —");
    expect(system).toContain("## Depth: non-engineer");
    expect(sent?.messages[1]?.content).toContain(ROOM.lead.lead ?? "");
    const rows = await ledger(t.s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ purpose: "twin", room_feature: ROOM.lead.id, room_topic: ROOM.lead.topic });
    expect(Number(rows[0]?.cost_micro)).toBe(0);
  });

  it("keeps a follow-up in its topic while free talk isn't ready, quoting the conversation", async () => {
    const t = await stack({ twin: twinWith(readinessText({ topics: { [ROOM.second.topic]: { ready: true } } })) });
    t.stub.next({
      ok: { text: "An answer from his work projects.", inputTokens: 900, outputTokens: 9, finish: "stop" },
    });
    const turns = [
      { role: "twin", text: "An opening about his work." },
      { role: "visitor", text: "What does agent-watchdog do?" },
    ];
    expect((await t.turn({ feature: ROOM.second.id, path: "engineer", turns })).statusCode).toBe(200);
    const system = sentTo(t)[0]?.messages[0]?.content ?? "";
    expect(system).toContain(`[${short(ROOM.second.files[0] ?? "")} —`);
    expect(system).not.toContain("[01-ai-strategy-and-cht —");
    const user = sentTo(t)[0]?.messages[1]?.content ?? "";
    expect(user).toContain(`Twin: ${JSON.stringify("An opening about his work.")}`);
    expect(user).toContain(`Visitor: ${JSON.stringify("What does agent-watchdog do?")}`);
  });

  it("charges a fallback answer its priced cost, says route fallback, and the cost equals the turn's ledger rows", async () => {
    const t = await stack({ fallback: true, healthy: false });
    await t.s.services.gateway.probeAll(); // the synthetic fallback is healthy; local isn't
    const res = await t.turn({ feature: ROOM.third.id, path: "engineer", turns: [] });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Rec;
    expect(body).toMatchObject({ feature: ROOM.third.id, route: "fallback", text: "synthetic response" });
    const rows = await ledger(t.s);
    const total = rows.reduce((n, r) => n + Number(r.cost_micro), 0);
    expect(body.cost_micro_usd).toBe(total);
    expect(total).toBeGreaterThan(0);
    expect(
      rows.every((r) => r.purpose === "twin" && r.room_feature === ROOM.third.id && r.room_topic === ROOM.third.topic),
    ).toBe(true);
  });

  it("replaces an answer that breaks a guard with the fixed line, keeps its cost counted, and answers 200", async () => {
    const t = await stack();
    t.stub.next({
      ok: { text: "He has biked across 4321 countries.", inputTokens: 900, outputTokens: 9, finish: "stop" },
    });
    const res = await t.turn({ feature: ROOM.leadless.id, path: "engineer", turns: [] });
    expect(res.statusCode).toBe(200);
    const twin = t.s.services.twin.load;
    if (!twin.available) throw new Error("the twin isn't available");
    expect(res.json()).toMatchObject({ text: twin.files.lines.withheld, route: "local", cost_micro_usd: 0 });
    expect(await ledger(t.s)).toHaveLength(1);
  });
});

// T048 (spec 007; FR-008, FR-009, FR-015; User Story 2): free talk, and the follow-up rule, at the route. A free-talk
// turn is grounded in the rules, `00`, and the sections the ranking scores for its question; a piece's follow-up adds
// ranked sections only while free talk is ready; the same question on either path gets the same sections and its own
// depth line, whatever the two depth lines' lengths; a question about an empty slot gets its fallback, no value.
describe("free talk and a follow-up's ranked sections (T048; User Story 2)", () => {
  type Sent = { messages: { role: string; content: string }[] };
  type Section = { id: string; file: string; heading: string; text: string };
  const PROFILE = "corpus/00-profile.md";
  const { sections } = JSON.parse(committed("corpus.json")) as { sections: Section[] };
  const header = (s: Section): string => `[${short(s.file)} — ${s.heading}]`;
  const headersIn = (system: string): string[] =>
    system.split("\n").filter((l) => /^\[\d{2}-[a-z0-9-]+ — .*\]$/.test(l));
  const systems = (t: TwinStack): string[] =>
    t.stub
      .requests()
      .filter((r) => r.path.endsWith("/chat/completions"))
      .map((r) => (r.body as Sent).messages[0]?.content ?? "");
  const answer = {
    ok: { text: "An answer from the corpus.", inputTokens: 900, outputTokens: 6, finish: "stop" as const },
  };
  const FREE_READY = readinessText({ freeTalk: { ready: true } });
  // "Who is Arya?" ranks only the sections that name her: its other words are on the ranking's stop list.
  const ARYA = "Who is Arya?";
  const arya = sections.filter((s) => s.file !== PROFILE && /\barya/i.test(s.text));
  const profile = sections.filter((s) => s.file === PROFILE);

  it("grounds a free-talk turn in the rules, 00, and the sections ranked for its question, and nothing else", async () => {
    expect(arya.length).toBeGreaterThan(0);
    const t = await stack({ twin: twinWith(FREE_READY) });
    t.stub.setCompletions(answer);
    expect((await t.turn({ feature: "free_talk", path: "engineer", turns: [visitor(ARYA)] })).statusCode).toBe(200);
    const [system = ""] = systems(t);
    const headers = headersIn(system);
    expect(headers.slice(0, profile.length)).toEqual(profile.map(header));
    expect(new Set(headers.slice(profile.length))).toEqual(new Set(arya.map(header)));
    expect(system.indexOf("Do not claim:")).toBeGreaterThan(-1);
    expect(system.indexOf("Ownership rulings:")).toBeLessThan(system.indexOf(headers[0] ?? "~"));
  });

  it("adds ranked sections to a piece's follow-up only while free talk is ready", async () => {
    expect(ROOM.second.files.some((f) => arya.some((s) => s.file === f))).toBe(false);
    const turns = [{ role: "twin", text: "An opening about his work." }, visitor(ARYA)];
    const topic = { [ROOM.second.topic]: { ready: true } };
    const ready = await stack({ twin: twinWith(readinessText({ topics: topic, freeTalk: { ready: true } })) });
    const closed = await stack({ twin: twinWith(readinessText({ topics: topic })) });
    for (const t of [ready, closed]) {
      t.stub.setCompletions(answer);
      expect((await t.turn({ feature: ROOM.second.id, path: "engineer", turns })).statusCode).toBe(200);
    }
    const added = (t: TwinStack) => headersIn(systems(t)[0] ?? "").filter((h) => arya.map(header).includes(h));
    expect(new Set(added(ready))).toEqual(new Set(arya.map(header)));
    expect(added(closed)).toEqual([]);
    // An opening has no visitor words to rank: free talk's readiness adds nothing to it.
    const opening = await stack({ twin: twinWith(readinessText({ topics: topic, freeTalk: { ready: true } })) });
    opening.stub.setCompletions(answer);
    expect((await opening.turn({ feature: ROOM.second.id, path: "engineer", turns: [] })).statusCode).toBe(200);
    expect(headersIn(systems(opening)[0] ?? "").every((h) => !h.startsWith("[" + short(arya[0]?.file ?? "~")))).toBe(
      true,
    );
  });

  it("gives the same question the same sections on either path, with that path's depth line alone", async () => {
    // The non-engineer depth line made far longer than the engineer one: the grounding's bound mustn't follow it.
    const longer = committed("prompt.md").replace(
      /\n## Depth: non-engineer\n\n[^\n]*/,
      (line) => line + " Keep each answer plain and short.".repeat(100),
    );
    expect(longer).not.toBe(committed("prompt.md"));
    const texts = { ...committedTexts(), prompt: longer };
    const t = await stack({
      twin: twinWith(readinessText({ freeTalk: { ready: true } }, runningHashes(texts)), { prompt: longer }),
    });
    t.stub.setCompletions(answer);
    const question = "What did he build for health workers at national scale with AI and agents on the cloud?";
    for (const path of ["engineer", "non-engineer"]) {
      expect((await t.turn({ feature: "free_talk", path, turns: [visitor(question)] })).statusCode).toBe(200);
    }
    const [engineer = "", plain = ""] = systems(t);
    expect(headersIn(engineer).length).toBeGreaterThan(profile.length + 5);
    expect(headersIn(plain)).toEqual(headersIn(engineer));
    expect(engineer).toContain("\n## Depth: engineer\n");
    expect(engineer).not.toContain("\n## Depth: non-engineer\n");
    expect(plain).toContain("\n## Depth: non-engineer\n");
    expect(plain).not.toContain("\n## Depth: engineer\n");
  });

  it("grounds a question about an empty slot in its fallback, with no value and no slot reference", async () => {
    const gap = sections.find((s) => /national deployment go live\?/.test(s.text));
    expect(gap?.text).toMatch(/go live\?\* — [^\d\n]+$/);
    const t = await stack({ twin: twinWith(FREE_READY) });
    t.stub.setCompletions(answer);
    const res = await t.turn({
      feature: "free_talk",
      path: "engineer",
      turns: [visitor("When did the national deployment go live?")],
    });
    expect(res.statusCode).toBe(200);
    const [system = ""] = systems(t);
    expect(gap).toBeDefined();
    expect(system).toContain(`${header(gap as Section)}\n${gap?.text ?? "~"}\n`);
    expect(system).not.toContain("{{slot");
  });
});
