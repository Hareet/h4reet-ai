// T154 (spec 004; FR-041, FR-042, FR-043, SC-003; Confirmation 9; contracts/tier-signal.md §3, §4, §9; data-model.md
// §11.1): src/room/signals/tier.ts's reduceTier, FR-041's table as table tests, rows tried in order with the first
// match winning: 1 the live source off, not-live; 2 paused or hidden, paused; 3 no completed request, or the last
// failed, unknown; 4 the last valid answer at least the freshness window old, its age the larger of its monotonic and
// wall-clock ages, unknown; 5 state "unknown", unknown; 6 a cause, its class; 7 a fallback reply after the start of the
// last valid answer's request, cloud; 8 normal and up, local; 9 normal and down, cloud; 10 anything else, unknown.
// recheckAt is null on rows 1 to 4 and the instant the answer turns stale on rows 5 to 10, where a stale answer of each
// row reads as before at recheckAt − 1 and unknown at recheckAt. Each failure kind of §5.2; row 7 with a reply before,
// during, and after a request; a wall clock jumping forward stales an answer, and one jumping back changes nothing. And
// §4's one cause map: causeClass and the talk panel's cannotTalkFor agree on every cause of its table, an unknown one,
// and none.
import { describe, expect, it } from "vitest";

import { cannotTalkFor } from "../../src/talk/messages";
import { BUDGET_CAUSES, RESTING_CAUSES, causeClass, reduceTier } from "../../src/room/signals/tier";
import type { StatusAnswer, StatusResult, TierInputs, TierReading } from "../../src/room/signals/tier";

/** The freshness window, live.freshness_ms's default. */
const FRESH = 35_000;
/** The room's Clock at the moment of each reduction, and the wall clock's at the same moment. */
const NOW = 500_000;
const WALL = 1_793_000_000_000;

/** A valid answer whose request ran from `started` to `ended` on the Clock, ending `ago` ms before NOW on both clocks
 *  unless the wall clock's age is given. */
function answered(
  answer: Partial<StatusAnswer> = {},
  o: { ago?: number; wallAgo?: number; took?: number } = {},
): StatusResult {
  const ago = o.ago ?? 1_000;
  const took = o.took ?? 200;
  return {
    ok: true,
    started: NOW - ago - took,
    ended: NOW - ago,
    endedWall: WALL - (o.wallAgo ?? ago),
    answer: { local_tier: "up", state: "normal", cause_now: null, ...answer },
  };
}

function failed(why: "network" | "timeout" | "status" | "shape", extra: object = {}): StatusResult {
  return { ok: false, started: NOW - 5_200, ended: NOW - 200, endedWall: WALL - 200, why, ...extra };
}

function inputs(over: Partial<TierInputs> = {}): TierInputs {
  return {
    live: "site",
    paused: false,
    hidden: false,
    now: NOW,
    wallNow: WALL,
    freshnessMs: FRESH,
    last: answered(),
    fallbackReplyAt: null,
    ...over,
  };
}

/** The reading, its inputs frozen, so a reducer that wrote to them would throw. */
function reduce(over: Partial<TierInputs> = {}): TierReading {
  const given = inputs(over);
  if (given.last) Object.freeze(given.last);
  return reduceTier(Object.freeze(given));
}

/** recheckAt for an answer `ago` ms old on both clocks: the instant it turns stale. */
const staleAt = (ago: number): number => NOW + FRESH - ago;

describe("reduceTier: FR-041's rows, in order, the first match winning", () => {
  it("row 1: the live source off reads not-live, whatever else holds", () => {
    for (const over of [
      {},
      { paused: true },
      { hidden: true },
      { last: null },
      { last: failed("network") },
      { fallbackReplyAt: NOW },
      { last: answered({ state: "unknown" }) },
    ]) {
      expect(reduce({ ...over, live: "off" }), JSON.stringify(over)).toEqual({
        tier: "not-live",
        row: 1,
        recheckAt: null,
      });
    }
  });

  it("row 2: a paused room or a hidden page reads paused, even over a fresh answer that the local tier serves", () => {
    for (const over of [{ paused: true }, { hidden: true }, { paused: true, hidden: true }]) {
      expect(reduce(over), JSON.stringify(over)).toEqual({ tier: "paused", row: 2, recheckAt: null });
      expect(reduce({ ...over, last: null })).toEqual({ tier: "paused", row: 2, recheckAt: null });
      expect(reduce({ ...over, last: failed("timeout") })).toEqual({ tier: "paused", row: 2, recheckAt: null });
    }
  });

  it("row 3: no completed request yet reads unknown", () => {
    expect(reduce({ last: null })).toEqual({ tier: "unknown", row: 3, recheckAt: null });
    // A fallback reply alone makes no answer.
    expect(reduce({ last: null, fallbackReplyAt: NOW - 10 })).toEqual({ tier: "unknown", row: 3, recheckAt: null });
  });

  it.each([
    ["a network error, a refused redirect, or a request the browser blocked", failed("network")],
    ["no response, or no whole body, within 5 s", failed("timeout")],
    ["the local edge's 404", failed("status", { status: 404 })],
    ["a 429, with its Retry-After", failed("status", { status: 429, retryAfterMs: 7_000 })],
    ["a 503", failed("status", { status: 503 })],
    ["a 200 whose body lacks a field", failed("shape")],
  ] as const)("row 3: a failed request reads unknown at once: %s", (_, last) => {
    expect(reduce({ last })).toEqual({ tier: "unknown", row: 3, recheckAt: null });
    // Even with a fallback reply since: only a valid answer reaches row 7.
    expect(reduce({ last, fallbackReplyAt: NOW })).toEqual({ tier: "unknown", row: 3, recheckAt: null });
  });

  it("row 4: an answer at least the freshness window old reads unknown, by its larger age", () => {
    expect(reduce({ last: answered({}, { ago: FRESH }) })).toEqual({ tier: "unknown", row: 4, recheckAt: null });
    expect(reduce({ last: answered({}, { ago: FRESH + 1 }) })).toEqual({ tier: "unknown", row: 4, recheckAt: null });
    // Fresh on one clock, stale on the other: the device slept (monotonic young, wall old), or the reverse.
    expect(reduce({ last: answered({}, { ago: 1_000, wallAgo: FRESH }) })).toEqual({
      tier: "unknown",
      row: 4,
      recheckAt: null,
    });
    expect(reduce({ last: answered({}, { ago: FRESH, wallAgo: 1_000 }) })).toEqual({
      tier: "unknown",
      row: 4,
      recheckAt: null,
    });
    // One millisecond younger is fresh.
    expect(reduce({ last: answered({}, { ago: FRESH - 1 }) }).row).toBe(8);
  });

  it("row 5: state unknown reads unknown, over a cause, a fallback reply, and an up local tier", () => {
    expect(reduce({ last: answered({ state: "unknown" }) })).toEqual({
      tier: "unknown",
      row: 5,
      recheckAt: staleAt(1_000),
    });
    expect(
      reduce({ last: answered({ state: "unknown", cause_now: "meter_at_ceiling" }), fallbackReplyAt: NOW }),
    ).toEqual({ tier: "unknown", row: 5, recheckAt: staleAt(1_000) });
  });

  it("row 6: a cause reads its class, over a fallback reply and a normal, up answer", () => {
    for (const cause of RESTING_CAUSES)
      expect(reduce({ last: answered({ cause_now: cause }) }), cause).toEqual({
        tier: "resting",
        row: 6,
        recheckAt: staleAt(1_000),
      });
    for (const cause of BUDGET_CAUSES)
      expect(reduce({ last: answered({ cause_now: cause }), fallbackReplyAt: NOW }), cause).toEqual({
        tier: "budget",
        row: 6,
        recheckAt: staleAt(1_000),
      });
    for (const cause of ["no_path_available", "store_unreachable", "a_cause_the_room_does_not_know"])
      expect(reduce({ last: answered({ cause_now: cause, state: "degraded", local_tier: "down" }) }), cause).toEqual({
        tier: "unavailable",
        row: 6,
        recheckAt: staleAt(1_000),
      });
    // An empty cause is still a cause: set, so it reads its class.
    expect(reduce({ last: answered({ cause_now: "" }) }).row).toBe(6);
  });

  it("row 7: a fallback reply after the start of the last valid answer's request reads cloud, until a later answer", () => {
    const last = answered({}, { ago: 1_000, took: 400 });
    if (!last.ok) throw new Error("not an answer");
    const fresh = { tier: "cloud", row: 7, recheckAt: staleAt(1_000) };
    // After the request: cloud.
    expect(reduce({ last, fallbackReplyAt: last.ended + 50 })).toEqual(fresh);
    // During the request, after it began: cloud, since that answer may predate the failover the reply reports (§3).
    expect(reduce({ last, fallbackReplyAt: last.started + 1 })).toEqual(fresh);
    expect(reduce({ last, fallbackReplyAt: last.ended })).toEqual(fresh);
    // Before it, or as it began: the later answer stands, and the local tier serves.
    expect(reduce({ last, fallbackReplyAt: last.started - 1 })).toEqual({
      tier: "local",
      row: 8,
      recheckAt: staleAt(1_000),
    });
    expect(reduce({ last, fallbackReplyAt: last.started }).row).toBe(8);
    // It holds over a down local tier and anything else row 10 reads, below it.
    expect(reduce({ last: answered({ local_tier: "down" }), fallbackReplyAt: NOW }).row).toBe(7);
    expect(reduce({ last: answered({ state: "degraded" }), fallbackReplyAt: NOW }).row).toBe(7);
  });

  it("rows 8 and 9: normal and up reads local, normal and down reads cloud", () => {
    expect(reduce()).toEqual({ tier: "local", row: 8, recheckAt: staleAt(1_000) });
    expect(reduce({ last: answered({ local_tier: "down" }) })).toEqual({
      tier: "cloud",
      row: 9,
      recheckAt: staleAt(1_000),
    });
  });

  it("row 10: anything else reads unknown", () => {
    for (const answer of [
      { state: "degraded" },
      { state: "normal", local_tier: "starting" },
      { state: "", local_tier: "up" },
      { state: "Normal" },
      { local_tier: "UP" },
    ])
      expect(reduce({ last: answered(answer) }), JSON.stringify(answer)).toEqual({
        tier: "unknown",
        row: 10,
        recheckAt: staleAt(1_000),
      });
  });

  it("is pure: the same inputs give the same reading, and nothing is written to them", () => {
    const given = inputs({ fallbackReplyAt: NOW - 100 });
    expect(reduceTier(given)).toEqual(reduceTier(given));
    expect(() => reduce({ fallbackReplyAt: NOW - 100 })).not.toThrow();
  });
});

describe("a stale answer of each of rows 5 to 10, at recheckAt − 1 and at recheckAt (SC-003)", () => {
  const cases: [string, Partial<TierInputs>, number][] = [
    ["row 5", { last: answered({ state: "unknown" }, { ago: 4_000 }) }, 5],
    ["row 6", { last: answered({ cause_now: "kill_switch_tripped" }, { ago: 4_000 }) }, 6],
    ["row 7", { last: answered({}, { ago: 4_000 }), fallbackReplyAt: NOW - 100 }, 7],
    ["row 8", { last: answered({}, { ago: 4_000 }) }, 8],
    ["row 9", { last: answered({ local_tier: "down" }, { ago: 4_000 }) }, 9],
    ["row 10", { last: answered({ state: "degraded" }, { ago: 4_000 }) }, 10],
  ];
  for (const [name, over, row] of cases) {
    it(`${name} holds until recheckAt, then reads unknown (row 4)`, () => {
      const first = reduce(over);
      expect(first.row).toBe(row);
      expect(first.recheckAt).toBe(staleAt(4_000));
      const at = first.recheckAt ?? Number.NaN;
      // Both clocks move on together.
      const later = (t: number): TierReading => reduce({ ...over, now: t, wallNow: WALL + (t - NOW) });
      const before = later(at - 1);
      expect(before.tier, name).toBe(first.tier);
      expect(before.row, name).toBe(row);
      // The instant it turns stale doesn't move as the clock does.
      expect(before.recheckAt, name).toBe(at);
      expect(later(at), name).toEqual({ tier: "unknown", row: 4, recheckAt: null });
    });
  }
});

describe("the two clocks (§3: each used conservatively)", () => {
  it("a wall clock jumping forward stales an answer the monotonic clock holds fresh, and moves recheckAt sooner", () => {
    const last = answered({}, { ago: 5_000 });
    expect(reduce({ last })).toEqual({ tier: "local", row: 8, recheckAt: staleAt(5_000) });
    // The wall clock moves 20 s ahead: the answer's age is the wall clock's 25 s.
    expect(reduce({ last, wallNow: WALL + 20_000 })).toEqual({
      tier: "local",
      row: 8,
      recheckAt: NOW + FRESH - 25_000,
    });
    // An hour ahead: stale at once.
    expect(reduce({ last, wallNow: WALL + 3_600_000 })).toEqual({ tier: "unknown", row: 4, recheckAt: null });
  });

  it("a wall clock jumping back changes nothing", () => {
    const last = answered({}, { ago: 5_000 });
    const steady = reduce({ last });
    for (const back of [1, 30_000, 3_600_000, 86_400_000])
      expect(reduce({ last, wallNow: WALL - back }), String(back)).toEqual(steady);
  });
});

describe("one cause map (§4): causeClass and the talk panel's cannotTalkFor", () => {
  const UNAVAILABLE = [
    "store_unreachable",
    "store_uninitialized",
    "journal_unwritable",
    "api_unavailable",
    "no_path_available",
    "upstream_error",
    "edge_origin_unreachable",
  ];

  it("holds §4's table", () => {
    expect([...RESTING_CAUSES].sort()).toEqual(
      ["fallback_unavailable", "local_error", "local_unhealthy", "no_fallback_in_stack"].sort(),
    );
    // Spec 010's Amendment 2-1: the paid fallback's monthly cap, adapter_month_spent, is of the budget class.
    expect([...BUDGET_CAUSES].sort()).toEqual(
      [
        "adapter_month_spent",
        "fallback_awaiting_renewal",
        "fallback_spent_today",
        "kill_switch_tripped",
        "meter_at_ceiling",
      ].sort(),
    );
    expect(causeClass("adapter_month_spent")).toBe("budget");
    for (const cause of RESTING_CAUSES) expect(causeClass(cause), cause).toBe("resting");
    for (const cause of BUDGET_CAUSES) expect(causeClass(cause), cause).toBe("budget");
    for (const cause of UNAVAILABLE) expect(causeClass(cause), cause).toBe("unavailable");
    expect(causeClass("a_cause_the_room_does_not_know")).toBe("unavailable");
    expect(causeClass(null)).toBe("unavailable");
    expect(causeClass(undefined)).toBe("unavailable");
  });

  it("agrees with cannotTalkFor on every cause, an unknown one, and none", () => {
    const causes = [
      ...RESTING_CAUSES,
      ...BUDGET_CAUSES,
      ...UNAVAILABLE,
      "a_cause_the_room_does_not_know",
      "",
      undefined,
    ];
    for (const cause of causes) expect(cannotTalkFor(cause), String(cause)).toBe(`cannot_talk.${causeClass(cause)}`);
    // The tier's row 6 reads the same class the conversation's message names.
    for (const cause of causes.filter((c): c is string => typeof c === "string"))
      expect(`cannot_talk.${reduce({ last: answered({ cause_now: cause }) }).tier}`, cause).toBe(cannotTalkFor(cause));
  });
});
