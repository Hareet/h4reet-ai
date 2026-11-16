// Spec 024 (T005; FR-005, FR-007, FR-009, FR-010, FR-011, FR-016; SC-003; plan.md §5.3): the meal ledger, pure. Per
// piece, its chunks' states (standing, flying, eaten, regrowing); a bite takes the nearest standing chunk to the mouth,
// ties to the lowest index, one bite at a time, never the last standing chunk of a piece whose set-aside part is
// empty; regrowth earliest-eaten first, `eating.regrow_s` after the last bite, each next one that long after; the
// timer stops while paused; the first bite of a piece is said once a visit. It keeps its state in memory and sends
// nothing.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMeal } from "../../src/room/eat/meal";
import type { Meal } from "../../src/room/eat/meal";
import { WEB } from "../helpers/room";

const REGROW_S = 20;
const R = REGROW_S * 1000;

/** A ledger on a fake clock, with a desk of `n` chunks on the x axis at x = 0, 1, 2, … */
function setup(n = 4, asideEmpty = false): { meal: Meal; clock: { t: number } } {
  const clock = { t: 0 };
  const meal = createMeal({ regrow_s: REGROW_S, now: () => clock.t });
  meal.addPiece("desk", {
    centres: Array.from({ length: n }, (_, i) => [i, 0, 0] as const),
    asideEmpty,
  });
  return { meal, clock };
}

/** Bites the desk and lands the chunk at once; the chunk's index. */
function eat(meal: Meal, mouth: readonly [number, number, number] = [0, 0, 0]): number {
  const index = meal.bite("desk", mouth);
  if (index === null) throw new Error("no bite");
  meal.landed("desk", index);
  return index;
}

describe("a bite (FR-007)", () => {
  it("takes the nearest standing chunk to the mouth", () => {
    const { meal } = setup();
    expect(meal.bite("desk", [2.2, 0, 0])).toBe(2);
    expect(meal.states("desk")).toEqual(["standing", "standing", "flying", "standing"]);
  });

  it("ties to the lowest index", () => {
    const { meal } = setup();
    expect(meal.bite("desk", [1.5, 0, 0])).toBe(1);
  });

  it("is one at a time: a second bite while one flies is refused, on any piece", () => {
    const { meal } = setup();
    meal.addPiece("sign", { centres: [[9, 0, 0]], asideEmpty: false });
    expect(meal.bite("desk", [0, 0, 0])).toBe(0);
    expect(meal.bite("desk", [0, 0, 0])).toBeNull();
    expect(meal.bite("sign", [9, 0, 0])).toBeNull();
    expect(meal.flying()).toBe(true);
    meal.landed("desk", 0);
    expect(meal.flying()).toBe(false);
    expect(meal.bite("desk", [0, 0, 0])).toBe(1);
  });

  it("never takes an eaten chunk, and refuses once none stands (US1 AS4)", () => {
    const { meal } = setup(2);
    expect(eat(meal)).toBe(0);
    expect(eat(meal)).toBe(1);
    expect(meal.canBite("desk")).toBe(false);
    expect(meal.bite("desk", [0, 0, 0])).toBeNull();
  });

  it("with a set-aside part, eats every chunk", () => {
    const { meal } = setup(3);
    [0, 1, 2].forEach(() => eat(meal));
    expect(meal.states("desk")).toEqual(["eaten", "eaten", "eaten"]);
  });

  it("with an empty set-aside part, never takes the last standing chunk (FR-005)", () => {
    const { meal } = setup(3, true);
    eat(meal);
    eat(meal);
    expect(meal.canBite("desk")).toBe(false);
    expect(meal.bite("desk", [0, 0, 0])).toBeNull();
    expect(meal.states("desk")).toEqual(["eaten", "eaten", "standing"]);
  });

  it("refuses an unknown piece", () => {
    const { meal } = setup();
    expect(meal.canBite("lamp")).toBe(false);
    expect(meal.bite("lamp", [0, 0, 0])).toBeNull();
  });
});

describe("regrowth (FR-011; SC-003)", () => {
  it("regrows the earliest eaten chunk regrow_s after the last bite, each next one that long after", () => {
    const { meal, clock } = setup();
    eat(meal, [3, 0, 0]); // 3, at 0
    clock.t = 1000;
    eat(meal, [1, 0, 0]); // 1, at 1 s
    clock.t = 1000 + R - 1;
    expect(meal.tick()).toEqual([]);
    clock.t = 1000 + R;
    expect(meal.tick()).toEqual([{ piece: "desk", index: 3 }]);
    expect(meal.states("desk")[3]).toBe("regrowing");
    meal.grown("desk", 3);
    clock.t = 1000 + 2 * R - 1;
    expect(meal.tick()).toEqual([]);
    clock.t = 1000 + 2 * R;
    expect(meal.tick()).toEqual([{ piece: "desk", index: 1 }]);
    meal.grown("desk", 1);
    expect(meal.whole("desk")).toBe(true);
  });

  it("a bite pushes the next regrowth to regrow_s after it", () => {
    const { meal, clock } = setup();
    eat(meal, [0, 0, 0]);
    clock.t = R - 5000;
    eat(meal, [1, 0, 0]);
    clock.t = R;
    expect(meal.tick()).toEqual([]);
    clock.t = 2 * R - 5000;
    expect(meal.tick()).toEqual([{ piece: "desk", index: 0 }]);
  });

  it("is whole again chunks × regrow_s after the last bite (SC-003)", () => {
    const n = 6;
    const { meal, clock } = setup(n);
    for (let i = 0; i < n; i += 1) eat(meal, [i, 0, 0]);
    const order: number[] = [];
    for (let s = 0; s <= n * REGROW_S; s += 1) {
      clock.t = s * 1000;
      for (const r of meal.tick()) {
        order.push(r.index);
        meal.grown(r.piece, r.index);
      }
      expect(meal.whole("desk")).toBe(s >= n * REGROW_S);
    }
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("stops while paused and goes on at the resume (US2 AS3, US3 AS5; FR-009)", () => {
    const { meal, clock } = setup();
    eat(meal);
    clock.t = 5000;
    meal.pause();
    clock.t = 5000 + 60_000;
    expect(meal.tick()).toEqual([]);
    expect(meal.bite("desk", [1, 0, 0])).toBeNull();
    meal.resume();
    clock.t = 60_000 + R - 1;
    expect(meal.tick()).toEqual([]);
    clock.t = 60_000 + R;
    expect(meal.tick()).toEqual([{ piece: "desk", index: 0 }]);
  });

  it("schedules nothing of its own: no timer, only tick()", () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    const { meal } = setup();
    eat(meal);
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(meal.states("desk")[0]).toBe("eaten");
  });
});

describe("the first bite's line (FR-010)", () => {
  it("is true once a visit per piece", () => {
    const { meal } = setup();
    meal.addPiece("sign", { centres: [[0, 0, 0]], asideEmpty: false });
    eat(meal);
    expect(meal.firstBite("desk")).toBe(true);
    expect(meal.firstBite("desk")).toBe(false);
    eat(meal);
    expect(meal.firstBite("desk")).toBe(false);
    expect(meal.firstBite("sign")).toBe(false);
    meal.landed("sign", meal.bite("sign", [0, 0, 0]) ?? -1);
    expect(meal.firstBite("sign")).toBe(true);
  });
});

describe("memory only, nothing sent (FR-014, FR-016)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("touches no storage and sends nothing through a whole visit", () => {
    const fetch = vi.fn();
    const sendBeacon = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("localStorage", { setItem, getItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { setItem, getItem: vi.fn() });
    const { meal, clock } = setup();
    for (let i = 0; i < 4; i += 1) eat(meal, [i, 0, 0]);
    for (let s = 0; s <= 4 * REGROW_S; s += 1) {
      clock.t = s * 1000;
      for (const r of meal.tick()) meal.grown(r.piece, r.index);
    }
    expect(meal.whole("desk")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("has no sink: its source names no request, beacon, storage, or event", () => {
    const source = readFileSync(join(WEB, "src/room/eat/meal.ts"), "utf8");
    expect(source).not.toMatch(/\b(fetch|sendBeacon|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/);
    expect(source).not.toMatch(/from "\.\.\/events"|recordEvent|emitEvent/);
  });
});
