// T006 (spec 018; FR-001, FR-004; plan.md §2): the split layout's geometry. It is a refinement of the column layout
// (plan.md §2, as amended): where the window is landscape and at least 48rem wide and the left half can hold a panel,
// the conversation panel is on the left within the left half, at most 40rem, and the list on the right within the
// right 24rem; neither reaches the strip, the bar, the notes' reserve, or the walking control, and every other window
// keeps today's column, dock, or stacked layout with the same boxes.
import { describe, expect, it } from "vitest";

import {
  HUD_PLACEMENTS,
  OPENING,
  clearArea,
  fitsHud,
  hudBoxes,
  layoutFor,
  notesBox,
  splitBoxes,
  walkControlBox,
} from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { sweepScreens } from "../../src/room/compose/stages";

const REM = 16;
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
  inner.y + inner.h <= outer.y + outer.h + 1e-9;

describe("the split layout's window (FR-001)", () => {
  const screens = sweepScreens();
  it("is chosen only for a landscape window of at least 48rem, which today's layouts already hold", () => {
    const wrong: string[] = [];
    for (const s of screens) {
      const split = splitBoxes(s);
      if (split === null) continue;
      if (!(s.w > s.h && s.w >= HUD_PLACEMENTS.split.minWidthRem * REM && layoutFor(s) === "column" && fitsHud(s)))
        wrong.push(`${s.w}x${s.h}`);
    }
    expect(wrong).toEqual([]);
  });
  it("leaves every window under 48rem, and every portrait one, with no split and today's boxes", () => {
    for (const s of screens.filter((x) => !(x.w > x.h && x.w >= 48 * REM))) {
      expect(splitBoxes(s)).toBeNull();
    }
    // Today's results, unchanged: 1280 x 720 is the column layout; 390 x 844 the dock; both by layoutFor.
    expect(layoutFor({ w: 1280, h: 720 })).toBe("column");
    expect(layoutFor({ w: 390, h: 844 })).toBe("dock");
    expect(layoutFor({ w: 700, h: 400 })).toBe("column");
    expect(splitBoxes({ w: 700, h: 400 })).toBeNull();
  });
  it("is chosen at 1280 x 720 and 1920 x 1080", () => {
    expect(splitBoxes({ w: 1280, h: 720 })).not.toBeNull();
    expect(splitBoxes({ w: 1920, h: 1080 })).not.toBeNull();
  });
});

describe("the split layout's boxes (FR-004)", () => {
  for (const screen of [
    { w: 1280, h: 720 },
    { w: 1920, h: 1080 },
    { w: 800, h: 500 },
    { w: 1024, h: 600 },
  ]) {
    it(`keeps the panel left, the list right, and each clear of the reserves at ${screen.w} x ${screen.h}`, () => {
      const s = splitBoxes(screen);
      if (s === null) throw new Error("no split");
      const bands = hudBoxes(screen);
      const clear = clearArea(screen);
      const [wx, wy, ww, wh] = walkControlBox(clear);
      const walk: Box = { x: clear.x + wx, y: clear.y + wy, w: ww, h: wh };
      // The panel: in the left half, at most 40rem wide; the list: in the right 24rem.
      expect(s.panel.x).toBeGreaterThanOrEqual(0);
      expect(s.panel.x + s.panel.w).toBeLessThanOrEqual(screen.w / 2 + 1e-9);
      expect(s.panel.w).toBeLessThanOrEqual(40 * REM + 1e-9);
      expect(s.list.x).toBeGreaterThanOrEqual(screen.w - 24 * REM - 1e-9);
      expect(s.list.x + s.list.w).toBeLessThanOrEqual(screen.w + 1e-9);
      expect(inside(s.panel, clear)).toBe(true);
      expect(inside(s.bar, s.panel)).toBe(true);
      for (const other of [s.list, bands.strip, bands.bar, notesBox(clear), walk]) {
        expect(overlaps(s.panel, other)).toBe(false);
      }
      for (const other of [bands.strip, bands.bar, notesBox(clear), walk]) {
        expect(overlaps(s.list, other)).toBe(false);
      }
      expect(inside(s.list, bands.column as Box)).toBe(true);
      expect(overlaps(s.list, clear)).toBe(false);
      // The panel's resting form is its foot, the text box's row (FR-006).
      expect(s.bar.y + s.bar.h).toBeCloseTo(s.panel.y + s.panel.h, 6);
    });
  }
  it("holds over the whole sweep wherever it is chosen", () => {
    const failures: string[] = [];
    for (const screen of sweepScreens()) {
      const s = splitBoxes(screen);
      if (s === null) continue;
      const bands = hudBoxes(screen);
      const clear = clearArea(screen);
      const [wx, wy, ww, wh] = walkControlBox(clear);
      const walk: Box = { x: clear.x + wx, y: clear.y + wy, w: ww, h: wh };
      const where = `${screen.w}x${screen.h}`;
      if (s.panel.x + s.panel.w > screen.w / 2 + 1e-9) failures.push(`${where}: panel past the half`);
      if (!inside(s.panel, clear)) failures.push(`${where}: panel outside the clear area`);
      if (overlaps(s.panel, notesBox(clear))) failures.push(`${where}: panel on the notes`);
      if (overlaps(s.panel, walk)) failures.push(`${where}: panel on the walking control`);
      if (overlaps(s.list, s.panel)) failures.push(`${where}: list on the panel`);
      if (!inside(s.list, bands.column as Box)) failures.push(`${where}: list outside the column`);
      if (s.list.w > 24 * REM + 1e-9) failures.push(`${where}: list wider than 24rem`);
    }
    expect(failures).toEqual([]);
  });
  it("falls through where the left half can't hold a panel, with the clear area unchanged", () => {
    const s = { w: 770, h: 330 };
    expect(layoutFor(s)).toBe("column");
    expect(splitBoxes(s)).toBeNull();
    expect(clearArea(s, OPENING)).toEqual(hudBoxes(s).clear);
  });
});
