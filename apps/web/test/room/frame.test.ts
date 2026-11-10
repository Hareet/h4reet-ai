// T007 (spec 014; FR-004, FR-009, FR-012, FR-013; D5; contracts/frame-area.md §2, §4, §8; plan.md §2.1, PD-1): the
// frame area, `compose/frame.ts`'s `frameArea`, the box the room is framed into. It eases from the window toward spec
// 005's clear area in sixteenths and takes the first step at which every protected box lies at least 0.5rem outside
// every compact box: area(0) is the window and area(1) the clear area, every step holds the clear area, the ease is the
// least that clears, a protector that throws or gives a box that isn't finite falls back to the clear area, and one call
// asks the protector at most 17 times.
import { describe, expect, it } from "vitest";

import { EASE_STEPS, areaAt, frameArea } from "../../src/room/compose/frame";
import type { Protect } from "../../src/room/compose/frame";
import { DEFAULT_METRICS, OPENING, compactBoxes, fitsHud, hudBoxes } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";

/** A deterministic sequence in [0, 1): mulberry32, so a failure names a screen that comes back. */
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

const holds = (outer: Box, inner: Box): boolean =>
  outer.x <= inner.x + 1e-9 &&
  outer.y <= inner.y + 1e-9 &&
  outer.x + outer.w >= inner.x + inner.w - 1e-9 &&
  outer.y + outer.h >= inner.y + inner.h - 1e-9;

const SCREEN = { w: 1920, h: 1200 };
const CLEAR = hudBoxes(SCREEN).clear;
/** A box the column's compact box covers at every step: its centre. */
const UNDER = ((): Box => {
  const c = compactBoxes(SCREEN).column as Box;
  return { x: c.x + c.w / 2 - 22, y: c.y + c.h / 2 - 22, w: 44, h: 44 };
})();
/** A box clear of every compact box by far: the window's centre. */
const CLEAR_BOX: Box = { x: 940, y: 580, w: 40, h: 40 };

/** A protector that gives a covered box for its first `k` calls and a clear one after, counting its calls. */
function clearsAt(k: number): Protect & { calls: number } {
  const p = {
    calls: 0,
    boxes(): readonly Box[] {
      p.calls += 1;
      return p.calls <= k ? [UNDER] : [CLEAR_BOX];
    },
  };
  return p;
}

describe("the step (contracts/frame-area.md §2)", () => {
  it("is the window at 0 and the clear area at 1", () => {
    expect(EASE_STEPS).toBe(16);
    expect(areaAt(0, SCREEN, CLEAR)).toEqual({ x: 0, y: 0, w: 1920, h: 1200 });
    expect(areaAt(1, SCREEN, CLEAR)).toEqual(CLEAR);
    // Halfway, each edge halfway.
    expect(areaAt(0.5, SCREEN, CLEAR)).toEqual({ x: 0, y: 13.75, w: 1696, h: 1160.25 });
  });

  it("holds the clear area at every step, at 1,000 random screens and panel states", () => {
    const next = random(14);
    let tried = 0;
    while (tried < 1000) {
      const screen = { w: Math.round(320 + next() * 4800), h: Math.round(320 + next() * 3520) };
      const state = next() < 0.5 ? OPENING : ({ list: "collapsed" } as const);
      if (!fitsHud(screen, state)) continue;
      tried += 1;
      const clear = hudBoxes(screen, state).clear;
      for (let k = 0; k <= EASE_STEPS; k += 1) {
        const area = areaAt(k / EASE_STEPS, screen, clear);
        expect(holds(area, clear), `${screen.w} × ${screen.h} at ${k}/16`).toBe(true);
        expect(holds({ x: 0, y: 0, ...screen }, area), `${screen.w} × ${screen.h} at ${k}/16, in the window`).toBe(
          true,
        );
      }
    }
  });
});

describe("the least ease (FR-009; D5, D6)", () => {
  it("is k ÷ 16 for a protector that clears first at k, for every k", () => {
    for (let k = 0; k <= EASE_STEPS; k += 1) {
      const p = clearsAt(k);
      const f = frameArea(SCREEN, OPENING, DEFAULT_METRICS, p);
      expect(f.ease, `k = ${k}`).toBe(k / EASE_STEPS);
      expect(f.area).toEqual(areaAt(k / EASE_STEPS, SCREEN, CLEAR));
      expect(f.fellBack).toBe(false);
      expect(p.calls).toBeLessThanOrEqual(17);
    }
  });

  it("chooses the clear area at 16 whether or not its boxes clear, as spec 005's checks already judged it", () => {
    const always = { boxes: (): readonly Box[] => [UNDER] };
    const f = frameArea(SCREEN, OPENING, DEFAULT_METRICS, always);
    expect(f).toEqual({ area: CLEAR, ease: 1, fellBack: false });
  });

  it("keeps a protected box 0.5rem clear: 7.9 pixels from the column is too near, 8 is clear", () => {
    const column = compactBoxes(SCREEN).column as Box;
    const at = (gap: number): Box => ({ x: column.x - gap - 44, y: column.y + 10, w: 44, h: 44 });
    expect(frameArea(SCREEN, OPENING, DEFAULT_METRICS, { boxes: () => [at(8)] }).ease).toBe(0);
    const near = frameArea(SCREEN, OPENING, DEFAULT_METRICS, {
      boxes: (area) => (area.x === 0 && area.w === SCREEN.w ? [at(7.9)] : [CLEAR_BOX]),
    });
    expect(near.ease).toBe(1 / 16);
    // At a 20-pixel root the margin is 10 pixels.
    const big = { ...DEFAULT_METRICS, rem: 20 };
    const bigColumn = compactBoxes(SCREEN, OPENING, big).column as Box;
    const at20 = (gap: number): Box => ({ x: bigColumn.x - gap - 44, y: bigColumn.y + 10, w: 44, h: 44 });
    expect(frameArea(SCREEN, OPENING, big, { boxes: () => [at20(10)] }).ease).toBe(0);
    expect(frameArea(SCREEN, OPENING, big, { boxes: (a) => (a.w === SCREEN.w ? [at20(9)] : []) }).ease).toBe(1 / 16);
  });

  it("gives the protector the clear area beside each step's area, and the same result for the same inputs", () => {
    const seen: Box[] = [];
    frameArea(SCREEN, OPENING, DEFAULT_METRICS, {
      boxes: (_area, clear) => {
        seen.push(clear);
        return [UNDER];
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const c of seen) expect(c).toEqual(CLEAR);
    const a = frameArea(SCREEN, OPENING, DEFAULT_METRICS, clearsAt(5));
    const b = frameArea(SCREEN, OPENING, DEFAULT_METRICS, clearsAt(5));
    expect(a).toEqual(b);
  });
});

describe("the fallback (FR-004; contracts/frame-area.md §4)", () => {
  it("gives the clear area, fellBack, for a protector that throws", () => {
    const f = frameArea(SCREEN, OPENING, DEFAULT_METRICS, {
      boxes: () => {
        throw new Error("no scene");
      },
    });
    expect(f).toEqual({ area: CLEAR, ease: 1, fellBack: true });
  });

  it("gives the clear area, fellBack, for a box that isn't finite, at the first step or a later one", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const first = frameArea(SCREEN, OPENING, DEFAULT_METRICS, { boxes: () => [{ x: bad, y: 0, w: 44, h: 44 }] });
      expect(first).toEqual({ area: CLEAR, ease: 1, fellBack: true });
      let n = 0;
      const later = frameArea(SCREEN, OPENING, DEFAULT_METRICS, {
        boxes: () => {
          n += 1;
          return n < 3 ? [UNDER] : [{ x: 0, y: 0, w: bad, h: 44 }];
        },
      });
      expect(later).toEqual({ area: CLEAR, ease: 1, fellBack: true });
    }
  });

  it("falls back where the screen's clear area isn't finite", () => {
    const f = frameArea({ w: Number.NaN, h: 1200 }, OPENING, DEFAULT_METRICS, { boxes: () => [] });
    expect(f.fellBack).toBe(true);
    expect(f.ease).toBe(1);
  });
});
