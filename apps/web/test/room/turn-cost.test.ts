// T263 (spec 004; FR-047 to FR-050, SC-011; User Story 9 scenarios 1 to 5 and 7; R-32; contracts/turn-cost.md §3 to
// §6, §10): src/room/signals/turn-cost.ts, pure.
// - classifyTurn on each row of §3's table: a 200 is a reply, carrying its body's route and cost as found; a 503 whose
//   body has state "degraded" and a string cause is degraded; 400 to 499, 429 included, refused; any other status or a
//   network error, failed; an abort, a body that fails to read or parse, or a stream without its final frame, lost.
// - §4's valid reply: route exactly "local" or "fallback", and a safe integer cost of at least 0; the gateway's dev-only
//   "metered", a missing field, "950", a fraction, a negative, and an integer past 2^53 − 1 all invalid.
// - §5's readings, in the repository's UI words: "cost unavailable" twice while live.turn is off; "no call yet" and
//   "$0" before the first turn; "local · $0"; a paid cost to six decimals with "est."; "at least" from an invalid,
//   degraded, failed, or lost turn until reload, kept after a later paid turn; a refused turn changing nothing; a
//   fallback reply costing 0 reading "$0.000000 est."; a call of $100 or more "cost unavailable", and a visit of $100
//   or more "at least $99.999999 est."; "test" in a drafts build and "Sample" from a fixture.
// - Every sequence of up to 4 outcomes from a fresh channel, against a reference model written apart from the code.
// - 10,000 random valid costs up to 2^53 − 1 sum exactly, against a bigint reference.
// - Row 7's cue: a fallback reply from a turn calls onFallbackReply with the Clock's time; a fixture never does.
// - Spies on every request and storage API a page has: 0 touches across the file (FR-047, FR-050).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  classifyTurn,
  costReadings,
  createCostChannel,
  formatMicro,
  isValidReply,
} from "../../src/room/signals/turn-cost";
import type { CostReading, CostState, TurnOutcome, TurnResult } from "../../src/room/signals/turn-cost";
import { roomIndex } from "../helpers/room";

/** The repository's UI words, read before the spies go in. */
const UI = roomIndex().ui;
const word = (key: string, amount?: string): string => {
  const text = UI[key];
  if (text === undefined) throw new Error(`no UI word ${key}`);
  return amount === undefined ? text : text.replace("{amount}", amount);
};

/** A clock the channel reads: the room's Clock's now(), moved by hand. */
function clock(start = 1_000): { now(): number; at: number } {
  return {
    at: start,
    now() {
      return this.at;
    },
  };
}

// ---- The spies: every request and storage API, any touch recorded ----

const touched: string[] = [];
const SPIED = [
  "fetch",
  "XMLHttpRequest",
  "navigator",
  "WebSocket",
  "EventSource",
  "Image",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "document",
  "history",
] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const name of SPIED) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        return undefined;
      },
    });
  }
});

afterAll(() => {
  for (const name of SPIED) {
    const descriptor = saved.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

// ---- §3: classifying a turn ----

const response = (status: number, body: unknown): TurnResult => ({ kind: "response", status, body });

describe("classifyTurn (§3)", () => {
  it("reads a 200 as a reply, carrying its body's route and cost as found", () => {
    expect(classifyTurn(response(200, { text: "t", feature: "f", cost_micro_usd: 950, route: "fallback" }))).toEqual({
      kind: "reply",
      route: "fallback",
      cost_micro_usd: 950,
    });
    expect(classifyTurn(response(200, { route: "metered", cost_micro_usd: "950" }))).toEqual({
      kind: "reply",
      route: "metered",
      cost_micro_usd: "950",
    });
    // Absent when the body isn't an object.
    for (const body of [null, "text", 950, [1, 2], undefined]) {
      expect(classifyTurn(response(200, body)), JSON.stringify(body) ?? "undefined").toEqual({
        kind: "reply",
        route: undefined,
        cost_micro_usd: undefined,
      });
    }
  });

  it("reads a 503 with spec 000's degraded body as degraded, with its cause", () => {
    expect(classifyTurn(response(503, { state: "degraded", cause: "meter_at_ceiling" }))).toEqual({
      kind: "degraded",
      cause: "meter_at_ceiling",
    });
    expect(classifyTurn(response(503, { state: "degraded", cause: "api_unavailable", extra: 1 }))).toEqual({
      kind: "degraded",
      cause: "api_unavailable",
    });
  });

  it("reads 400 to 499, 429 included, as refused, with its status", () => {
    for (const status of [400, 401, 404, 413, 422, 429, 499]) {
      expect(classifyTurn(response(status, { state: "degraded", cause: "x" })), String(status)).toEqual({
        kind: "refused",
        status,
      });
    }
  });

  it("reads any other status, or a network error, as failed", () => {
    const bodies = [{ state: "degraded" }, { state: "degraded", cause: 3 }, { state: "normal", cause: "x" }, null, "x"];
    for (const body of bodies)
      expect(classifyTurn(response(503, body)), JSON.stringify(body)).toEqual({ kind: "failed" });
    for (const status of [201, 204, 299, 301, 302, 304, 399, 500, 502, 504, 599, 100, 0]) {
      expect(classifyTurn(response(status, { state: "degraded", cause: "x" })), String(status)).toEqual({
        kind: "failed",
      });
    }
    expect(classifyTurn({ kind: "error", error: "network" })).toEqual({ kind: "failed" });
  });

  it("reads an abort, or a body that failed to read or parse, or a stream without its final frame, as lost", () => {
    expect(classifyTurn({ kind: "error", error: "aborted" })).toEqual({ kind: "lost" });
    expect(classifyTurn({ kind: "error", error: "body" })).toEqual({ kind: "lost" });
  });
});

// ---- §4: a valid reply ----

const reply = (route: unknown, cost: unknown): Extract<TurnOutcome, { kind: "reply" }> => ({
  kind: "reply",
  route,
  cost_micro_usd: cost,
});

describe("a valid reply (§4)", () => {
  it('is route "local" or "fallback" with a safe integer cost of at least 0', () => {
    for (const r of [
      reply("local", 0),
      reply("local", 7),
      reply("fallback", 0),
      reply("fallback", 950),
      reply("fallback", Number.MAX_SAFE_INTEGER),
    ])
      expect(isValidReply(r), JSON.stringify(r)).toBe(true);
  });

  it('refuses the gateway\'s "metered", any other route, a missing field, "950", a fraction, a negative, and past 2^53 − 1', () => {
    for (const r of [
      reply("metered", 950),
      reply("cloud", 950),
      reply("Local", 0),
      reply(" fallback", 950),
      reply(undefined, 950),
      reply("fallback", undefined),
      reply(undefined, undefined),
      reply("fallback", "950"),
      reply("fallback", 950.5),
      reply("fallback", -1),
      reply("fallback", Number.MAX_SAFE_INTEGER + 1),
      reply("fallback", 2 ** 60),
      reply("fallback", Number.NaN),
      reply("fallback", Number.POSITIVE_INFINITY),
      reply("fallback", 950n),
      reply("fallback", null),
      reply("local", "0"),
    ])
      expect(isValidReply(r), String(r.route) + " " + String(r.cost_micro_usd)).toBe(false);
  });
});

// ---- §5: the readings ----

const show = (r: CostReading | null): string => {
  if (r === null) return "(none)";
  return r.badge === null ? r.text : `${r.text} [${r.badge.text}]`;
};
const read = (state: CostState, drafts = false): { call: string; visit: string } => {
  const r = costReadings(state, { ui: UI, drafts });
  return { call: show(r.call), visit: show(r.visit) };
};

/** A fresh channel, fed these outcomes from `from`. */
function fed(
  outcomes: readonly TurnOutcome[],
  options: { configured?: boolean; from?: "turn" | "fixture" } = {},
): CostState {
  const channel = createCostChannel({ configured: options.configured ?? true, clock: clock() });
  for (const o of outcomes) channel.report(o, options.from ?? "turn");
  return channel.state;
}

const DEGRADED: TurnOutcome = { kind: "degraded", cause: "meter_at_ceiling" };
const FAILED: TurnOutcome = { kind: "failed" };
const LOST: TurnOutcome = { kind: "lost" };
const REFUSED: TurnOutcome = { kind: "refused", status: 429 };

describe("the readings (§5)", () => {
  it('reads "cost unavailable" twice while live.turn is off, before and after any report (answer 7)', () => {
    expect(read(fed([], { configured: false }))).toEqual({ call: "cost unavailable", visit: "cost unavailable" });
    for (const o of [reply("fallback", 950), reply("local", 0), DEGRADED, FAILED, LOST, REFUSED]) {
      const state = fed([o], { configured: false });
      expect(read(state), o.kind).toEqual({ call: "cost unavailable", visit: "cost unavailable" });
      expect(read(state, true), o.kind).toEqual({ call: "cost unavailable", visit: "cost unavailable" });
      expect(state.visitMicro).toBe(0n);
    }
  });

  it('reads "no call yet" and "$0" before the first turn', () => {
    expect(read(fed([]))).toEqual({ call: "no call yet", visit: "$0" });
  });

  it('reads "local · $0" for a local reply costing 0, leaving the visit at $0', () => {
    expect(read(fed([reply("local", 0)]))).toEqual({ call: "local · $0", visit: "$0" });
    expect(read(fed([reply("local", 0), reply("local", 0)]))).toEqual({ call: "local · $0", visit: "$0" });
  });

  it('reads a paid cost to six decimals with "est.": 950 as $0.000950, and dev\'s synthetic 100,000 as $0.100000', () => {
    expect(read(fed([reply("fallback", 950)]))).toEqual({ call: "$0.000950 est.", visit: "$0.000950 est." });
    expect(read(fed([reply("fallback", 100_000)]))).toEqual({ call: "$0.100000 est.", visit: "$0.100000 est." });
    expect(read(fed([reply("fallback", 950), reply("local", 0)]))).toEqual({
      call: "local · $0",
      visit: "$0.000950 est.",
    });
    // A local reply that costs something took no free path: it is paid.
    expect(read(fed([reply("local", 12)]))).toEqual({ call: "$0.000012 est.", visit: "$0.000012 est." });
    expect(read(fed([reply("fallback", 1_234_567)]))).toEqual({ call: "$1.234567 est.", visit: "$1.234567 est." });
  });

  it('reads a fallback reply costing 0 as "$0.000000 est.": it took the paid path', () => {
    expect(read(fed([reply("fallback", 0)]))).toEqual({ call: "$0.000000 est.", visit: "$0.000000 est." });
  });

  it('marks the visit "at least" from an invalid, degraded, failed, or lost turn, and keeps it after a later paid turn', () => {
    for (const bad of [reply("metered", 1200), reply("fallback", "950"), DEGRADED, FAILED, LOST]) {
      const what = JSON.stringify(bad);
      expect(read(fed([bad])), what).toEqual({ call: "cost unavailable", visit: "at least $0" });
      expect(read(fed([reply("fallback", 950), bad])), what).toEqual({
        call: "cost unavailable",
        visit: "at least $0.000950 est.",
      });
      expect(read(fed([bad, reply("fallback", 950)])), what).toEqual({
        call: "$0.000950 est.",
        visit: "at least $0.000950 est.",
      });
      expect(read(fed([bad, reply("local", 0)])), what).toEqual({ call: "local · $0", visit: "at least $0" });
    }
  });

  it("clears nothing but by reload: a new channel reads no call yet and $0", () => {
    const before = fed([reply("fallback", 950), LOST, reply("fallback", 950)]);
    expect(before.visitAtLeast).toBe(true);
    expect(read(fed([]))).toEqual({ call: "no call yet", visit: "$0" });
  });

  it("leaves both counters unchanged on a refused turn", () => {
    const states = [[], [reply("local", 0)], [reply("fallback", 950)], [DEGRADED], [reply("fallback", 950), LOST]];
    for (const seq of states) {
      expect(read(fed([...seq, REFUSED])), JSON.stringify(seq)).toEqual(read(fed(seq)));
      expect(fed([...seq, REFUSED]), JSON.stringify(seq)).toEqual(fed(seq));
    }
  });

  it('reads a call of $100 or more "cost unavailable", and a visit of $100 or more "at least $99.999999 est."', () => {
    expect(read(fed([reply("fallback", 99_999_999)]))).toEqual({
      call: "$99.999999 est.",
      visit: "$99.999999 est.",
    });
    expect(read(fed([reply("fallback", 100_000_000)]))).toEqual({
      call: "cost unavailable",
      visit: "at least $99.999999 est.",
    });
    expect(read(fed([reply("fallback", 60_000_000), reply("fallback", 50_000_000)]))).toEqual({
      call: "$50.000000 est.",
      visit: "at least $99.999999 est.",
    });
    // The bound is display only: the visit's sum stays exact, and a valid cost never marks it "at least".
    const big = fed([reply("fallback", 100_000_000)]);
    expect(big.visitMicro).toBe(100_000_000n);
    expect(big.visitAtLeast).toBe(false);
  });

  it('badges each amount "test" in a drafts build, and "no call yet" and "cost unavailable" none', () => {
    expect(read(fed([]), true)).toEqual({ call: "no call yet", visit: "$0 [test]" });
    expect(read(fed([reply("local", 0)]), true)).toEqual({ call: "local · $0 [test]", visit: "$0 [test]" });
    expect(read(fed([reply("fallback", 950)]), true)).toEqual({
      call: "$0.000950 est. [test]",
      visit: "$0.000950 est. [test]",
    });
    expect(read(fed([reply("fallback", 950), LOST]), true)).toEqual({
      call: "cost unavailable",
      visit: "at least $0.000950 est. [test]",
    });
    expect(read(fed([reply("fallback", 950)]), false)).toEqual({ call: "$0.000950 est.", visit: "$0.000950 est." });
  });

  it('badges what a fixture feeds "Sample", in place of "test", in either build', () => {
    for (const drafts of [true, false]) {
      expect(read(fed([reply("fallback", 950)], { from: "fixture" }), drafts)).toEqual({
        call: "$0.000950 est. [Sample]",
        visit: "$0.000950 est. [Sample]",
      });
      expect(read(fed([reply("local", 0)], { from: "fixture" }), drafts)).toEqual({
        call: "local · $0 [Sample]",
        visit: "$0 [Sample]",
      });
      expect(read(fed([DEGRADED], { from: "fixture" }), drafts)).toEqual({
        call: "cost unavailable",
        visit: "at least $0 [Sample]",
      });
    }
    const state = fed([reply("fallback", 950)], { from: "fixture" });
    expect(state.callFrom).toBe("fixture");
    expect(state.visitSample).toBe(true);
    expect(fed([reply("fallback", 950)]).callFrom).toBe("turn");
    expect(fed([]).callFrom).toBeNull();
  });

  it("uses the UI words' badges: sign.test and sign.sample, with their kinds", () => {
    const r = costReadings(fed([reply("fallback", 950)]), { ui: UI, drafts: true });
    expect(r.call?.badge).toEqual({ kind: "test", text: word("sign.test") });
    const s = costReadings(fed([reply("fallback", 950)], { from: "fixture" }), { ui: UI, drafts: true });
    expect(s.visit?.badge).toEqual({ kind: "sample", text: word("sign.sample") });
  });

  it("reads no counter whose UI word the index lacks", () => {
    const rest = Object.fromEntries(Object.entries(UI).filter(([key]) => key !== "sign.unavailable"));
    expect(costReadings(fed([], { configured: false }), { ui: rest, drafts: false })).toEqual({
      call: null,
      visit: null,
    });
  });

  it("formats micro-dollars with integer arithmetic: $, the dollars, a point, then six digits", () => {
    expect(formatMicro(0n)).toBe("$0.000000");
    expect(formatMicro(950n)).toBe("$0.000950");
    expect(formatMicro(1n)).toBe("$0.000001");
    expect(formatMicro(1_000_000n)).toBe("$1.000000");
    expect(formatMicro(99_999_999n)).toBe("$99.999999");
    expect(formatMicro(BigInt(Number.MAX_SAFE_INTEGER))).toBe("$9007199254.740991");
    expect(formatMicro(BigInt(Number.MAX_SAFE_INTEGER) * 3n)).toBe("$27021597764.222973");
  });
});

// ---- Every sequence of up to 4 outcomes, against a reference model ----

/** The outcomes the sequences draw from, each with its reference reading. */
const ALPHABET: readonly { o: TurnOutcome; valid: boolean; cost: number; local0: boolean }[] = [
  { o: reply("local", 0), valid: true, cost: 0, local0: true },
  { o: reply("local", 5), valid: true, cost: 5, local0: false },
  { o: reply("fallback", 950), valid: true, cost: 950, local0: false },
  { o: reply("fallback", 0), valid: true, cost: 0, local0: false },
  { o: reply("fallback", 40_000_000), valid: true, cost: 40_000_000, local0: false },
  { o: reply("metered", 1200), valid: false, cost: 0, local0: false },
  { o: reply("fallback", "950"), valid: false, cost: 0, local0: false },
  { o: DEGRADED, valid: false, cost: 0, local0: false },
  { o: FAILED, valid: false, cost: 0, local0: false },
  { o: LOST, valid: false, cost: 0, local0: false },
  { o: REFUSED, valid: false, cost: 0, local0: false },
];

/** The reference: FR-048's table, in plain numbers and strings, written apart from the code. */
function reference(
  seq: readonly number[],
  o: { configured: boolean; drafts: boolean; from: "turn" | "fixture" },
): { call: string; visit: string } {
  const unavailable = "cost unavailable";
  if (!o.configured) return { call: unavailable, visit: unavailable };
  // A call reading set by an outcome is that outcome's source's; the visit is a fixture's only once one fed it.
  const badge = o.from === "fixture" ? " [Sample]" : o.drafts ? " [test]" : "";
  const fed = o.from === "fixture" && seq.some((k) => ALPHABET[k]?.o.kind !== "refused");
  const visitBadge = fed ? " [Sample]" : o.drafts ? " [test]" : "";
  const dollars = (micro: number): string => `$${(micro / 1e6).toFixed(6)}`;
  let call = "no call yet";
  let total = 0;
  let paid = false;
  let atLeast = false;
  for (const k of seq) {
    const a = ALPHABET[k];
    if (!a || a.o.kind === "refused") continue;
    if (!a.valid) {
      call = unavailable;
      atLeast = true;
      continue;
    }
    total += a.cost;
    if (a.local0) {
      call = `local · $0${badge}`;
      continue;
    }
    paid = true;
    call = a.cost >= 100_000_000 ? unavailable : `${dollars(a.cost)} est.${badge}`;
  }
  let visit = paid ? `${dollars(total)} est.` : "$0";
  if (total >= 100_000_000) visit = "at least $99.999999 est.";
  else if (atLeast) visit = `at least ${visit}`;
  return { call, visit: `${visit}${visitBadge}` };
}

describe("every sequence of up to 4 outcomes (§10)", () => {
  it("reads as the reference model, from a fresh channel, in every build, configured or not, from turns or a fixture", () => {
    const sequences: number[][] = [[]];
    for (let length = 1; length <= 4; length += 1)
      for (const s of sequences.filter((x) => x.length === length - 1))
        for (let k = 0; k < ALPHABET.length; k += 1) sequences.push([...s, k]);
    expect(sequences).toHaveLength(1 + 11 + 121 + 1331 + 14641);
    let checked = 0;
    for (const configured of [true, false])
      for (const from of ["turn", "fixture"] as const)
        for (const seq of sequences) {
          const state = fed(
            seq.map((k) => ALPHABET[k]?.o ?? REFUSED),
            { configured, from },
          );
          for (const drafts of [true, false]) {
            const want = reference(seq, { configured, drafts, from });
            const got = read(state, drafts);
            if (got.call !== want.call || got.visit !== want.visit)
              expect({ seq, configured, from, drafts, got }).toEqual({ seq, configured, from, drafts, got: want });
            checked += 1;
          }
        }
    expect(checked).toBe(sequences.length * 8);
  });
});

// ---- Exact sums ----

/** A seeded generator (mulberry32), so the 10,000 costs are the same each run. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("exact sums (FR-047, SC-011)", () => {
  it("sums 10,000 random valid costs up to 2^53 − 1 exactly, as a bigint", () => {
    const next = random(20261027);
    const channel = createCostChannel({ configured: true, clock: clock() });
    let want = 0n;
    for (let i = 0; i < 10_000; i += 1) {
      // Up to 2^53 − 1: 21 high bits and 32 low ones, with the extremes among them.
      const cost =
        i === 0
          ? Number.MAX_SAFE_INTEGER
          : i === 1
            ? 0
            : Math.floor(next() * 2 ** 21) * 2 ** 32 + Math.floor(next() * 2 ** 32);
      expect(Number.isSafeInteger(cost)).toBe(true);
      want += BigInt(cost);
      channel.report(reply(next() < 0.5 ? "local" : "fallback", cost), "turn");
    }
    expect(channel.state.visitMicro).toBe(want);
    expect(channel.state.visitMicro > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("adds nothing for an invalid, degraded, failed, lost, or refused turn", () => {
    const state = fed([
      reply("fallback", 950),
      reply("metered", 1200),
      reply("fallback", "1"),
      reply("fallback", 0.5),
      DEGRADED,
      FAILED,
      LOST,
      REFUSED,
      reply("local", 50),
    ]);
    expect(state.visitMicro).toBe(1000n);
  });
});

// ---- The channel: subscribers, and row 7's cue ----

describe("the channel (§6)", () => {
  it("notifies each subscriber once a report while configured, with the state; none after it unsubscribes", () => {
    const channel = createCostChannel({ configured: true, clock: clock() });
    const seen: CostState[] = [];
    const off = channel.subscribe((s) => seen.push(s));
    channel.report(reply("fallback", 950), "turn");
    channel.report(REFUSED, "turn");
    expect(seen).toHaveLength(2);
    expect(seen[0]?.visitMicro).toBe(950n);
    expect(seen[1]).toEqual(seen[0]);
    off();
    channel.report(reply("fallback", 950), "turn");
    expect(seen).toHaveLength(2);
    expect(channel.state.visitMicro).toBe(1900n);
  });

  it("changes nothing and notifies no one while not configured", () => {
    const channel = createCostChannel({ configured: false, clock: clock() });
    const seen: CostState[] = [];
    const cues: number[] = [];
    channel.subscribe((s) => seen.push(s));
    channel.onFallbackReply((at) => cues.push(at));
    const before = channel.state;
    channel.report(reply("fallback", 950), "turn");
    channel.report(LOST, "turn");
    expect(channel.state).toEqual(before);
    expect(channel.state).toEqual({
      configured: false,
      call: "unconfigured",
      callFrom: null,
      visitMicro: 0n,
      visitPaid: false,
      visitAtLeast: false,
      visitSample: false,
    });
    expect(seen).toEqual([]);
    expect(cues).toEqual([]);
  });

  it("starts configured as no call yet, at 0, with no mark", () => {
    expect(createCostChannel({ configured: true, clock: clock() }).state).toEqual({
      configured: true,
      call: "no-call-yet",
      callFrom: null,
      visitMicro: 0n,
      visitPaid: false,
      visitAtLeast: false,
      visitSample: false,
    });
  });

  it("calls onFallbackReply with the Clock's time for every fallback reply from a turn, valid cost or not", () => {
    const c = clock(5_000);
    const channel = createCostChannel({ configured: true, clock: c });
    const cues: number[] = [];
    const off = channel.onFallbackReply((at) => cues.push(at));
    channel.report(reply("fallback", 950), "turn");
    c.at = 6_000;
    channel.report(reply("fallback", "950"), "turn");
    c.at = 7_000;
    channel.report(reply("fallback", 0), "turn");
    // Not a fallback reply: no cue.
    for (const o of [reply("local", 0), reply("metered", 950), reply(undefined, 950), DEGRADED, FAILED, LOST, REFUSED])
      channel.report(o, "turn");
    expect(cues).toEqual([5_000, 6_000, 7_000]);
    off();
    channel.report(reply("fallback", 950), "turn");
    expect(cues).toHaveLength(3);
  });

  it("never cues row 7 from a fixture", () => {
    const channel = createCostChannel({ configured: true, clock: clock() });
    const cues: number[] = [];
    channel.onFallbackReply((at) => cues.push(at));
    channel.report(reply("fallback", 950), "fixture");
    channel.report(reply("fallback", "950"), "fixture");
    expect(cues).toEqual([]);
    expect(channel.state.visitMicro).toBe(950n);
  });

  it("keeps each state it gave: a later report makes a new one", () => {
    const channel = createCostChannel({ configured: true, clock: clock() });
    const first = channel.state;
    channel.report(reply("fallback", 950), "turn");
    expect(first.visitMicro).toBe(0n);
    expect(first.call).toBe("no-call-yet");
    expect(channel.state.call).toEqual({ paid: 950n });
  });
});

describe("no request, no storage (FR-047, FR-050)", () => {
  it("touched no request or storage API across the file", () => {
    expect(touched).toEqual([]);
  });
});
