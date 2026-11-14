// T004 (spec 018; FR-010, plan.md §1 P5): the panel's three stats, from the tier and the cost channel's state, in the
// index's words: "est.", "at least", "local", and an unknown reading "—"; no word about the Author.
import { describe, expect, it } from "vitest";

import type { TierValue } from "../../src/room/compose/vocabulary";
import { statsFrom } from "../../src/room/hud/stats";
import { createCostChannel } from "../../src/room/signals/turn-cost";
import type { CostState } from "../../src/room/signals/turn-cost";
import { FakeClock, roomIndex } from "../helpers/room";

const ui = roomIndex().ui;
const words = { ui, drafts: false };
const fresh = (): CostState => createCostChannel({ configured: true, clock: new FakeClock() }).state;
const reply = (route: "local" | "fallback", micro: number, times = 1): CostState => {
  const ch = createCostChannel({ configured: true, clock: new FakeClock() });
  for (let i = 0; i < times; i += 1) ch.report({ kind: "reply", route, cost_micro_usd: micro }, "turn");
  return ch.state;
};

describe("statsFrom", () => {
  it("gives three stats, label then value", () => {
    const s = statsFrom("local", fresh(), words);
    expect(s.map((x) => x.id)).toEqual(["serving", "call", "visit"]);
    expect(s.map((x) => x.label)).toEqual(["Serving", "This call", "This visit"]);
    expect(s[0].value).toBe("Local");
  });
  it.each([
    ["local", "Local"],
    ["cloud", "Cloud"],
    ["resting", "Resting"],
    ["budget", "Budget"],
    ["unavailable", "Unavailable"],
    ["unknown", "Unknown"],
    ["paused", "Unknown"],
    ["not-live", "Unknown"],
  ] as [TierValue, string][])("reads tier %s as %s", (tier, word) => {
    expect(statsFrom(tier, fresh(), words)[0].value).toBe(word);
  });
  it("words a local reply as local, a paid one as est., and a lost one as at least", () => {
    expect(statsFrom("local", reply("local", 0), words)[1].value).toBe("local · $0");
    const paid = statsFrom("cloud", reply("fallback", 1500), words);
    expect(paid[1].value).toBe("$0.001500 est.");
    expect(paid[2].value).toBe("$0.001500 est.");
    const ch = createCostChannel({ configured: true, clock: new FakeClock() });
    ch.report({ kind: "reply", route: "fallback", cost_micro_usd: 1500 }, "turn");
    ch.report({ kind: "reply", route: "local", cost_micro_usd: "x" }, "turn");
    expect(statsFrom("cloud", ch.state, words)[2].value).toMatch(/^at least /);
  });
  it("reads an unconfigured channel and missing words as —", () => {
    const off = createCostChannel({ configured: false, clock: new FakeClock() }).state;
    expect(statsFrom("unknown", off, { ui: {}, drafts: false }).map((x) => x.value)).toEqual(["—", "—", "—"]);
  });
  it("says nothing about the Author", () => {
    const all = statsFrom("local", fresh(), words)
      .flatMap((x) => [x.label, x.value])
      .join(" ");
    expect(all).not.toMatch(/\b(author|he|his|him)\b/i);
  });
});
