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
  alwaysOnCoverage,
  clearArea,
  compactBoxes,
  fitsHud,
  hudBoxes,
  layoutFor,
  logRestRem,
  notesReserve,
  reservedBoxes,
} from "../../src/room/compose/hud";
import type { Box, HudMetrics } from "../../src/room/compose/hud";
import { sweepScreens, walkControlBox } from "../../src/room/compose/stages";

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

// The review of 60b51de4, finding 3 (FR-049; WCAG 1.4.12): the strip's height the window measured, where text spacing or
// a minimum font size makes its words take more lines than the table's band gives, is a floor the clear area follows.
describe("a strip taller than the table (T046, finding 3)", () => {
  it("starts the clear area below the measured strip, and keeps the table's where the measure is less", () => {
    const tall: HudMetrics = { ...DEFAULT_METRICS, strip: 80 };
    for (const screen of [
      { w: 1280, h: 720 },
      { w: 500, h: 844 },
    ]) {
      const b = hudBoxes(screen, OPENING, tall);
      const plain = hudBoxes(screen);
      expect(b.strip.h).toBe(80);
      expect(b.clear.y).toBe(80);
      expect(b.clear.y + b.clear.h).toBe(plain.clear.y + plain.clear.h);
      expect(hudBoxes(screen, OPENING, { ...DEFAULT_METRICS, strip: 10 }).strip.h).toBe(plain.strip.h);
    }
  });
});

// T005 (spec 014; FR-017, FR-019, FR-021; contracts/frame-area.md §1, §3; plan.md §3.1, PD-3 to PD-7): the HUD's
// compact boxes beside spec 005's bands, which stay as they are. In the column layout the AI disclosure is a strip as
// wide as the table's bound for its words, centred at the top; the bar's tiles one cluster at the foot's right (PD-6);
// the column its content's height at its band's foot (D8), its log at its rest height (PD-7); and the walking control
// in the clear area's bottom-right corner. In the dock layout the compact boxes are the bands. Every compact box lies
// inside its band, and none covers the window's centre, so the follow camera's figure, centred in a frame area, is never
// under one (plan.md §5). The always-on interface's coverage is its compact boxes' and the notes' reserve's union over
// the window's area.
describe("the compact boxes (spec 014, T005; compose/hud.ts's compactBoxes)", () => {
  const inside = (inner: Box, outer: Box): boolean =>
    inner.x >= outer.x - 1e-9 &&
    inner.y >= outer.y - 1e-9 &&
    inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
    inner.y + inner.h <= outer.y + outer.h + 1e-9;
  const holds = (b: Box, x: number, y: number): boolean => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
  const screens = sweepScreens().filter((s) => fitsHud(s));

  it("gives the strip, the bar, the column or the dock, and the walking control, each inside its band", () => {
    const failures: string[] = [];
    for (const screen of screens)
      for (const state of [OPENING, COLLAPSED]) {
        const bands = hudBoxes(screen, state);
        const c = compactBoxes(screen, state);
        const where = `${screen.w} × ${screen.h}, ${state.list}`;
        if (c.layout !== bands.layout) failures.push(`${where}: the layout`);
        if (!inside(c.strip, bands.strip)) failures.push(`${where}: the strip`);
        if (!inside(c.bar, bands.bar)) failures.push(`${where}: the bar`);
        if (bands.column && !(c.column && inside(c.column, bands.column))) failures.push(`${where}: the column`);
        if (bands.dock && !(c.dock && inside(c.dock, bands.dock))) failures.push(`${where}: the dock`);
        // T053 (W19): the walking control at the column's head, in the column's band, where the band has room above
        // the column's content; else in the clear area, as spec 008 put it.
        const band = c.walkPlace === "column" ? bands.column : bands.clear;
        if (!band || !inside(c.walk, band)) failures.push(`${where}: the walking control`);
        // Spec 018 (FR-004, H-8): where the window takes the split layout, five: the rest row and the list stand for the
        // column's content.
        if (c.all.length !== (c.split ? 5 : 4)) failures.push(`${where}: ${c.all.length} boxes`);
      }
    expect(failures.slice(0, 5), `${failures.length} failures; the first`).toEqual([]);
  });

  it("makes the dock layout's compact boxes its bands", () => {
    for (const screen of [
      { w: 320, h: 568 },
      { w: 390, h: 844 },
      { w: 800, h: 800 },
    ]) {
      const bands = hudBoxes(screen);
      const c = compactBoxes(screen);
      expect(c.layout).toBe("dock");
      expect([c.strip, c.bar, c.dock]).toEqual([bands.strip, bands.bar, bands.dock]);
      expect(c.column).toBeNull();
    }
  });

  it("centres the strip at the top, as wide as the table's bound for its words, and never wider than the window", () => {
    const t = HUD_PLACEMENTS.strip;
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 1280, h: 720 },
      { w: 600, h: 400 },
    ]) {
      const c = compactBoxes(screen);
      const bands = hudBoxes(screen);
      expect(c.strip.w).toBe(Math.min(t.maxRem * 16, screen.w));
      expect(c.strip.x + c.strip.w / 2).toBeCloseTo(screen.w / 2, 9);
      expect(c.strip.y).toBe(0);
      expect(c.strip.h).toBe(bands.strip.h);
    }
  });

  it("puts the bar's cluster at the foot's right, as wide as the table's bound for its tiles, under the column", () => {
    const t = HUD_PLACEMENTS.bar;
    expect(t.align).toBe("right");
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 1280, h: 720 },
      { w: 2560, h: 1440 },
    ]) {
      const c = compactBoxes(screen);
      const bands = hudBoxes(screen);
      expect(c.bar.w).toBe(Math.min(t.maxRem * 16, screen.w));
      expect(c.bar.x + c.bar.w).toBe(screen.w);
      expect([c.bar.y, c.bar.h]).toEqual([bands.bar.y, bands.bar.h]);
      // The column stands on the bar: the two touch and don't overlap.
      expect((c.column?.y ?? 0) + (c.column?.h ?? 0)).toBeCloseTo(c.bar.y, 9);
    }
    // The safe area's right inset keeps the cluster off the notch.
    const safe: HudMetrics = { rem: 16, safe: { top: 0, right: 30, bottom: 0, left: 0 } };
    const c = compactBoxes({ w: 1920, h: 1200 }, OPENING, safe);
    expect(c.bar.x + c.bar.w).toBe(1920 - 30);
  });

  it("sizes the column to its content at its band's foot, its log at its rest height (D8, D12)", () => {
    expect(HUD_PLACEMENTS.column.anchor).toBe("foot");
    expect(logRestRem({ w: 1920, h: 1200 })).toBe(8);
    expect(logRestRem({ w: 1920, h: 900 })).toBe(8);
    expect(logRestRem({ w: 1920, h: 899 })).toBe(5);
    expect(logRestRem({ w: 1280, h: 720 })).toBe(5);
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 1280, h: 720 },
      { w: 3840, h: 2160 },
    ]) {
      const bands = hudBoxes(screen);
      const c = compactBoxes(screen);
      const band = bands.column as Box;
      const column = c.column as Box;
      expect([column.x, column.w]).toEqual([band.x, band.w]);
      expect(column.y + column.h).toBeCloseTo(band.y + band.h, 9);
      expect(column.h).toBeLessThan(band.h);
      // The log's rest height is inside it: the column shrinks by 3rem when the log rests at 5rem, not 8rem.
      const short = compactBoxes({ w: screen.w, h: 899 }).column as Box;
      if (screen.h >= 900) expect(column.h - short.h).toBeCloseTo(3 * 16, 9);
    }
  });

  it("leaves the window's centre outside every compact box at every screen of the sweep", () => {
    const failures: string[] = [];
    for (const screen of screens)
      for (const state of [OPENING, COLLAPSED])
        for (const b of compactBoxes(screen, state).all)
          if (holds(b, screen.w / 2, screen.h / 2)) failures.push(`${screen.w} × ${screen.h}, ${state.list}`);
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it("measures the always-on interface's coverage as its boxes' and the notes' union over the window's area", () => {
    const screen = { w: 1920, h: 1200 };
    const c = compactBoxes(screen);
    const clear = hudBoxes(screen).clear;
    const notesW = Math.min(HUD_PLACEMENTS.notes.maxRem * 16 + 2 * HUD_PLACEMENTS.notes.insetRem * 16, clear.w);
    // At 1920 × 1200 the boxes don't overlap: the bar lies under the column, the strip above it, the walking control and
    // the notes inside the clear area.
    const area = c.all.reduce((n, b) => n + b.w * b.h, 0) + notesW * notesReserve(clear);
    expect(alwaysOnCoverage(screen)).toBeCloseTo(area / (1920 * 1200), 9);
    expect(alwaysOnCoverage(screen)).toBeLessThan(0.25);
    // Overlapping boxes count once: where two boxes share a part (on a short window the walking control in the clear
    // area's corner can meet the bar's cluster or the column), the coverage is never above the boxes' summed areas.
    for (const s of [
      { w: 1280, h: 720 },
      { w: 700, h: 400 },
    ]) {
      const k = compactBoxes(s);
      const cl = hudBoxes(s).clear;
      const nw = Math.min(HUD_PLACEMENTS.notes.maxRem * 16 + 2 * HUD_PLACEMENTS.notes.insetRem * 16, cl.w);
      const sum = k.all.reduce((n, b) => n + b.w * b.h, 0) + nw * notesReserve(cl);
      expect(alwaysOnCoverage(s)).toBeLessThanOrEqual(sum / (s.w * s.h) + 1e-12);
      // At least the largest box's share.
      const largest = Math.max(...k.all.map((b) => b.w * b.h));
      expect(alwaysOnCoverage(s)).toBeGreaterThanOrEqual(largest / (s.w * s.h));
    }
  });

  it("keeps hudBoxes and every band as spec 005 set them (PD-3)", () => {
    expect(hudBoxes({ w: 1920, h: 1200 }).clear).toEqual({ x: 0, y: 27.5, w: 1472, h: 1120.5 });
    expect(hudBoxes({ w: 1920, h: 1200 }).column).toEqual({ x: 1472, y: 27.5, w: 448, h: 1120.5 });
  });
});

// T053 (spec 014, the review's finding on the frame; the Author's answer of 2026-11-10, "Move the walk control
// (Recommended)"; Amendment W19 to spec 008's FR-021): in the column layout, where the column's band has room above the
// column's content, the walking control sits at the column's head, at its right, a gap above the column, in the
// column's band and out of the clear area; the bar's cluster keeps its table width, so the frame doesn't ease around
// the control at the clear area's corner. Where the band has no room, and in the dock layout, it keeps spec 008's place
// in the clear area's bottom-right corner. Its size stays 8rem by 2.75rem.
describe("the walking control at the column's head (spec 014, T053)", () => {
  const inside = (outer: Box, inner: Box): boolean =>
    inner.x >= outer.x - 1e-9 &&
    inner.y >= outer.y - 1e-9 &&
    inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
    inner.y + inner.h <= outer.y + outer.h + 1e-9;
  const meets = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("puts it at the column's head, in the column's band, on landscape windows from 1280 × 720", () => {
    for (const screen of [
      { w: 1280, h: 720 },
      { w: 1920, h: 1080 },
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
    ]) {
      const c = compactBoxes(screen);
      const bands = hudBoxes(screen);
      const where = `${screen.w} × ${screen.h}`;
      const column = c.column;
      if (!column || !bands.column) throw new Error(`${where}: no column`);
      expect(c.layout, where).toBe("column");
      expect(c.walkPlace, where).toBe("column");
      // Spec 018 (FR-004, H-8): where the window takes the split layout, the column's content is moved out, and the
      // walking control stands at the band's foot, the column's head with nothing under it. Spec 028 (T-A03; plan.md
      // §R-B8): the split layout is taken only with a wall source, which this sweep gives none; its boxes at rest are
      // the strip, the panel, and the column.
      if (c.split) {
        expect(c.walk, where).toEqual(c.split.walk);
        expect(c.all, where).toEqual([c.strip, c.split.panel, c.split.column]);
        continue;
      }
      expect(inside(bands.column, c.walk), where).toBe(true);
      expect(c.walk.y + c.walk.h, where).toBeCloseTo(column.y - HUD_PLACEMENTS.column.walkGapRem * 16, 6);
      expect(c.walk.x + c.walk.w, where).toBeCloseTo(column.x + column.w - HUD_PLACEMENTS.column.walkGapRem * 16, 6);
      expect([c.walk.w, c.walk.h], where).toEqual([128, 44]);
      expect(meets(c.walk, bands.clear), where).toBe(false);
      expect(meets(c.walk, column), where).toBe(false);
      expect(c.all, where).toEqual([c.strip, c.bar, column, c.walk]);
      expect(c.bar.w, where).toBe(Math.min(HUD_PLACEMENTS.bar.maxRem * 16, screen.w));
    }
  });

  it("keeps spec 008's place in the clear area's corner where the column's band has no room, and in the dock layout", () => {
    for (const screen of [
      { w: 576, h: 368 },
      { w: 390, h: 844 },
    ]) {
      const c = compactBoxes(screen);
      const bands = hudBoxes(screen);
      const [x, y, w, h] = walkControlBox(bands.clear);
      expect(c.walkPlace, `${screen.w} × ${screen.h}`).toBe("stage");
      expect(c.walk).toEqual({ x: bands.clear.x + x, y: bands.clear.y + y, w, h });
      expect(c.all).toContain(c.walk);
    }
  });
});
