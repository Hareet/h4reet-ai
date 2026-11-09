// T005 (spec 005; FR-007, FR-020; plan.md §2, PD-1 to PD-7): the HUD's placements, `compose/hud.ts`, as pure kernel
// functions over a window's measures. The column layout on a window wider than tall and at least 32rem wide, the dock
// layout otherwise; each docked panel's box from the table; the clear area, the window less those boxes and the safe
// areas; the minimum below which the stacked layout takes over; and the boxes RG6 reserves in the clear area. Sizes are
// CSS pixels at a 16-pixel root unless a test gives its own metrics.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_METRICS,
  HUD_PLACEMENTS,
  OPENING,
  clearArea,
  fitsHud,
  hudBoxes,
  layoutFor,
  reservedBoxes,
} from "../../src/room/compose/hud";
import type { HudMetrics } from "../../src/room/compose/hud";
import { walkControlBox } from "../../src/room/compose/stages";

const COLLAPSED = { list: "collapsed" } as const;
/** The strip's one line and two: 0.8125rem at a line height of 1.5, with 0.25rem above and below. */
const STRIP = { one: 13 * 1.5 + 8, two: 2 * 13 * 1.5 + 8 } as const;
/** The bar's one row and two: 2.75rem tiles, a 0.25rem gap between rows, 0.25rem above and below. */
const BAR = { one: 44 + 8, two: 44 + 4 + 44 + 8 } as const;
/** The dock's text box row: a 0.875rem label at 1.5, a 0.125rem gap, and the 2.75rem row. */
const TALK = 14 * 1.5 + 2 + 44;
/** A row of the list's strip: a 2.75rem button and its 0.25rem margin below. */
const LIST_ROW = 44 + 4;

describe("the layouts (compose/hud.ts's layoutFor)", () => {
  it("gives the column layout to a window wider than tall and at least 32rem wide, the dock layout otherwise", () => {
    expect(layoutFor({ w: 1920, h: 1200 })).toBe("column");
    expect(layoutFor({ w: 844, h: 390 })).toBe("column");
    expect(layoutFor({ w: 568, h: 320 })).toBe("column");
    expect(layoutFor({ w: 512, h: 300 })).toBe("column");
    // Narrower than 32rem, though wider than tall: the dock.
    expect(layoutFor({ w: 511, h: 300 })).toBe("dock");
    // A square window, and every window held upright.
    expect(layoutFor({ w: 800, h: 800 })).toBe("dock");
    expect(layoutFor({ w: 390, h: 844 })).toBe("dock");
    expect(layoutFor({ w: 384, h: 740 })).toBe("dock");
    // The bound is in rem: at a 32-pixel root, 1023 pixels is under 32rem.
    expect(layoutFor({ w: 1023, h: 600 }, { ...DEFAULT_METRICS, rem: 32 })).toBe("dock");
    expect(layoutFor({ w: 1024, h: 600 }, { ...DEFAULT_METRICS, rem: 32 })).toBe("column");
  });
});

describe("the boxes and the clear area (compose/hud.ts's hudBoxes and clearArea)", () => {
  it("puts the strip at the top, the bar at the foot, and the column between them on the right", () => {
    const b = hudBoxes({ w: 1920, h: 1200 });
    expect(b.layout).toBe("column");
    expect(b.strip).toEqual({ x: 0, y: 0, w: 1920, h: STRIP.one });
    expect(b.bar).toEqual({ x: 0, y: 1200 - BAR.one, w: 1920, h: BAR.one });
    // clamp(15rem, 40% of the window, 28rem): 28rem here.
    expect(b.column).toEqual({ x: 1920 - 448, y: STRIP.one, w: 448, h: 1200 - STRIP.one - BAR.one });
    expect(b.dock).toBeNull();
    expect(b.clear).toEqual({ x: 0, y: STRIP.one, w: 1472, h: 1200 - STRIP.one - BAR.one });
    expect(clearArea({ w: 1920, h: 1200 })).toEqual(b.clear);
  });

  it("sizes the column at two fifths of the window, between 15rem and 28rem", () => {
    expect(hudBoxes({ w: 568, h: 320 }).column?.w).toBe(240);
    expect(hudBoxes({ w: 1000, h: 600 }).column?.w).toBe(400);
    expect(hudBoxes({ w: 1280, h: 720 }).column?.w).toBe(448);
    expect(clearArea({ w: 568, h: 320 })).toEqual({ x: 0, y: STRIP.one, w: 328, h: 320 - STRIP.one - BAR.one });
  });

  it("docks the list, the text box's row, and the bar at the foot of a window held upright", () => {
    const b = hudBoxes({ w: 384, h: 740 });
    expect(b.layout).toBe("dock");
    // Under 27rem the strip's words take two lines; under 35rem the bar's tiles take two rows; under 36rem the list's
    // names take two rows beside its header button.
    expect(b.strip).toEqual({ x: 0, y: 0, w: 384, h: STRIP.two });
    expect(b.bar).toEqual({ x: 0, y: 740 - BAR.two, w: 384, h: BAR.two });
    const dock = 4 + 2 * LIST_ROW + TALK + 4;
    expect(b.dock).toEqual({ x: 0, y: 740 - BAR.two - dock, w: 384, h: dock });
    expect(b.column).toBeNull();
    expect(b.clear).toEqual({ x: 0, y: STRIP.two, w: 384, h: 740 - STRIP.two - dock - BAR.two });
    expect(b.clear.h).toBe(422);
  });

  it("gives 320 × 568 a clear area of 320 × 250, and the list's strip collapsed one of 320 × 298", () => {
    expect(clearArea({ w: 320, h: 568 })).toEqual({ x: 0, y: STRIP.two, w: 320, h: 250 });
    expect(clearArea({ w: 320, h: 568 }, COLLAPSED)).toEqual({ x: 0, y: STRIP.two, w: 320, h: 250 + LIST_ROW });
  });

  it("keeps the column layout's clear area when the list or the log collapses; grows the dock's when the list does", () => {
    for (const s of [
      { w: 1920, h: 1200 },
      { w: 568, h: 320 },
      { w: 844, h: 390 },
    ])
      expect(clearArea(s, COLLAPSED)).toEqual(clearArea(s, OPENING));
    // Where the list's strip takes two rows, collapsing it to its header button's row frees one.
    for (const s of [
      { w: 320, h: 568 },
      { w: 390, h: 844 },
      { w: 560, h: 900 },
    ]) {
      const open = clearArea(s, OPENING);
      const collapsed = clearArea(s, COLLAPSED);
      expect(collapsed.h, `${s.w} × ${s.h}`).toBe(open.h + LIST_ROW);
      expect(collapsed.w).toBe(open.w);
    }
    // Where it takes one, its header button's row is all it ever takes.
    expect(clearArea({ w: 1024, h: 1366 }, COLLAPSED)).toEqual(clearArea({ w: 1024, h: 1366 }, OPENING));
  });

  it("never gives a collapsed state a clear area smaller than the open one's", () => {
    for (let w = 320; w <= 2560; w += 80)
      for (let h = 320; h <= 2560; h += 80) {
        const open = clearArea({ w, h }, OPENING);
        const collapsed = clearArea({ w, h }, COLLAPSED);
        expect(collapsed.w, `${w} × ${h}`).toBeGreaterThanOrEqual(open.w);
        expect(collapsed.h, `${w} × ${h}`).toBeGreaterThanOrEqual(open.h);
      }
  });

  it("narrows the clear area by the safe-area insets, and pads the strip, the bar, and the column by them", () => {
    // A notched phone held sideways: 47 pixels each side, 21 at the foot.
    const metrics: HudMetrics = { rem: 16, safe: { top: 0, right: 47, bottom: 21, left: 47 } };
    const screen = { w: 844, h: 390 };
    const b = hudBoxes(screen, OPENING, metrics);
    const plain = hudBoxes(screen);
    expect(b.bar.h).toBe(plain.bar.h + 21);
    // The column's two fifths are of the safe width, 750, and it pads the right inset (T032).
    expect(plain.column?.w).toBeCloseTo(337.6, 9);
    expect(b.column?.w).toBe(0.4 * 750 + 47);
    expect(b.clear.x).toBe(47);
    expect(b.clear.w).toBe(844 - 47 - (b.column?.w ?? 0));
    expect(b.clear.h).toBe(390 - b.strip.h - b.bar.h);
    // And a notch at the top of a phone held upright.
    const upright = hudBoxes({ w: 390, h: 844 }, OPENING, {
      rem: 16,
      safe: { top: 47, right: 0, bottom: 34, left: 0 },
    });
    expect(upright.strip.h).toBe(hudBoxes({ w: 390, h: 844 }).strip.h + 47);
    expect(upright.clear.y).toBe(upright.strip.h);
  });

  it("follows the root font size: the boxes are in rem", () => {
    const big = hudBoxes({ w: 2560, h: 1600 }, OPENING, { ...DEFAULT_METRICS, rem: 20 });
    expect(big.strip.h).toBeCloseTo((STRIP.one * 20) / 16, 9);
    expect(big.bar.h).toBeCloseTo((BAR.one * 20) / 16, 9);
    expect(big.column?.w).toBe(28 * 20);
  });
});

describe("the minimum (compose/hud.ts's fitsHud)", () => {
  it("holds the HUD where the clear area is at least 304 × 196 on a window at least 20rem wide", () => {
    expect(HUD_PLACEMENTS.minimum).toEqual({ w: 304, h: 196, windowRem: 20 });
    expect(fitsHud({ w: 320, h: 568 })).toBe(true);
    expect(fitsHud({ w: 568, h: 320 })).toBe(true);
    expect(fitsHud({ w: 1920, h: 1200 })).toBe(true);
  });

  it("is false below 304 × 196, at 320 × 256, under 320 wide, and at a 32-pixel root on 320 × 568", () => {
    // Too short for the dock: its clear area would be under 196 pixels tall.
    expect(clearArea({ w: 320, h: 500 }).h).toBeLessThan(196);
    expect(fitsHud({ w: 320, h: 500 })).toBe(false);
    // WCAG 1.4.10's reflow size: 1280 × 1024 at 400%.
    expect(fitsHud({ w: 320, h: 256 })).toBe(false);
    // Under 20rem wide.
    expect(fitsHud({ w: 319, h: 900 })).toBe(false);
    // 200% text on a 320 × 568 phone.
    expect(fitsHud({ w: 320, h: 568 }, OPENING, { ...DEFAULT_METRICS, rem: 32 })).toBe(false);
  });
});

describe("the reserved boxes (compose/hud.ts's reservedBoxes)", () => {
  it("are the walking control's box in the clear area's bottom-right corner, in its pixels", () => {
    for (const clear of [
      { w: 320, h: 250 },
      { w: 1472, h: 1120.5 },
    ])
      expect(reservedBoxes(clear)).toEqual([walkControlBox(clear)]);
    const [box] = reservedBoxes({ w: 1472, h: 1120.5 });
    expect(box).toEqual([1472 - 8 - 128, 1120.5 - 8 - 44, 128, 44]);
  });
});
