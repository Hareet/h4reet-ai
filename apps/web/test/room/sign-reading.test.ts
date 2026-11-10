// T043 (spec 014; FR-056 (d), FR-059; contracts/sign-check.md §3 step 5, §6; plan.md PD-21): the page's half of the
// sign's check, `build/room/sign-reading.ts`. Given a turn's three facts, its status and, for a 200, its route and cost,
// it reads them through the room's own turn-cost code (classifyTurn, the cost channel, costReadings) with the index's
// UI words, as the neon sign does: a fallback reply reads sign.estimated with its cost on "this call" and "this visit",
// a local reply sign.local with $0, and a degraded 503 or a reply with no valid route sign.unavailable, each the words
// turn-cost.test.ts expects of the same outcome. It reads nothing else of the reply.
import { describe, expect, it } from "vitest";

import { signReadings } from "../../build/room/sign-reading";
import { classifyTurn, costReadings, createCostChannel } from "../../src/room/signals/turn-cost";
import { roomIndex } from "../helpers/room";

const ui = roomIndex().ui;
const words = { ui, drafts: false };

/** The sign's two readings after one turn, by the room's code directly: what turn-cost.test.ts expects. */
function expected(status: number, body: unknown): { call: string | null; visit: string | null } {
  const channel = createCostChannel({ configured: true, clock: { now: () => 0 } });
  channel.report(classifyTurn({ kind: "response", status, body }), "turn");
  const r = costReadings(channel.state, words);
  return { call: r.call?.text ?? null, visit: r.visit?.text ?? null };
}

describe("the sign's readings from a turn's three facts (spec 014, T043)", () => {
  it("reads a fallback reply's cost as the paid estimate on both counters", () => {
    const got = signReadings({ status: 200, route: "fallback", cost_micro_usd: 100_000 }, words);
    expect(got).toEqual(expected(200, { route: "fallback", cost_micro_usd: 100_000 }));
    expect(got.call).toBe("$0.10 est.");
    expect(got.visit).toContain("est.");
  });

  it("reads a local reply costing 0 as local · $0", () => {
    const got = signReadings({ status: 200, route: "local", cost_micro_usd: 0 }, words);
    expect(got).toEqual(expected(200, { route: "local", cost_micro_usd: 0 }));
    expect(got.call).toBe("local · $0");
  });

  it("reads a degraded 503 and a reply with no valid route as cost unavailable", () => {
    const degraded = signReadings({ status: 503 }, words);
    expect(degraded.call).toBe(expected(503, { state: "degraded", cause: "meter_at_ceiling" }).call);
    expect(degraded.call).toBe(ui["sign.unavailable"]);
    const invalid = signReadings({ status: 200, route: "metered", cost_micro_usd: 5 }, words);
    expect(invalid).toEqual(expected(200, { route: "metered", cost_micro_usd: 5 }));
    expect(invalid.call).toBe(ui["sign.unavailable"]);
  });

  it("reads the facts alone: a reply's words never reach the reading", () => {
    const got = signReadings(
      { status: 200, route: "local", cost_micro_usd: 0, text: "the twin's words" } as never,
      words,
    );
    expect(JSON.stringify(got)).not.toContain("the twin's words");
  });
});
