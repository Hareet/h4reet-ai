// T-A06 (b) (spec 030, group A's rework; FR-002 to FR-004; Q3, Q4, Q85; plan.md §R-A2, §R-A3; the first rework's
// N-2): compose/halves.ts's halves() on boxes written by hand, so the room's tests (test/ui/hud-halves.test.ts) needn't
// check the room against halves()'s own output. The split layout: the list on top, the tiles' block below, the slice
// the layout gives between them; the column layout: the column on top, the bar's cluster alone below (the walking
// control at the column's head is in neither half, Q85); the dock: the dock on top, the bar below; the slice in both
// their shared width, from the top's foot to the bottom's top. The stacked layout, or a layout without its top box:
// null.
import { describe, expect, it } from "vitest";

import { halves } from "../../src/room/compose/halves";
import type { Box, SplitBoxes } from "../../src/room/compose/hud";

const NONE: Box = { x: 0, y: 0, w: 0, h: 0 };

/** A split layout's boxes, written by hand: the list, the slice, and the tiles' block given, the rest placeholders. */
function split(list: Box, slice: Box, tiles: Box): SplitBoxes {
  return {
    area: NONE,
    wall: NONE,
    panel: NONE,
    title: NONE,
    frame: NONE,
    column: { x: 1500, y: 100, w: 380, h: 900 },
    list,
    slice,
    tiles,
    bar: { x: tiles.x, y: tiles.y, w: tiles.w, h: 120 },
    walk: { x: tiles.x, y: tiles.y + 130, w: 128, h: 44 },
    eat: null,
    scaleLeft: 1,
    scaleRight: 1,
  };
}

describe("halves() on hand-written boxes (compose/halves.ts; FR-002 to FR-004)", () => {
  it("gives the split layout's list, slice, and tiles' block as the layout gives them", () => {
    const list: Box = { x: 1500, y: 100, w: 380, h: 600 };
    const slice: Box = { x: 1500, y: 700, w: 380, h: 12 };
    const tiles: Box = { x: 1500, y: 712, w: 380, h: 288 };
    const bar: Box = { x: 1500, y: 712, w: 380, h: 120 };
    expect(halves({ layout: "column", split: split(list, slice, tiles), column: null, dock: null, bar })).toEqual({
      top: list,
      bottom: tiles,
      slice,
    });
  });

  it("gives the column layout's column on top, the bar's cluster alone below, and the 12 px between (Q85)", () => {
    const column: Box = { x: 832, y: 337, w: 448, h: 319 };
    const bar: Box = { x: 1000, y: 668, w: 280, h: 52 };
    expect(halves({ layout: "column", split: null, column, dock: null, bar })).toEqual({
      top: column,
      bottom: bar,
      slice: { x: 1000, y: 656, w: 280, h: 12 },
    });
  });

  it("gives the dock on top, the bar below, and the 12 px between, across the window", () => {
    const dock: Box = { x: 0, y: 457, w: 384, h: 171 };
    const bar: Box = { x: 0, y: 640, w: 384, h: 100 };
    expect(halves({ layout: "dock", split: null, column: null, dock, bar })).toEqual({
      top: dock,
      bottom: bar,
      slice: { x: 0, y: 628, w: 384, h: 12 },
    });
  });

  it("takes the slice's width from the two halves' shared width, never below 0, and its height never below 0", () => {
    const bar: Box = { x: 1100, y: 668, w: 180, h: 52 };
    // A column whose left edge is right of the bar's, reaching past its right: the shared width is the bar's right part.
    expect(
      halves({ layout: "column", split: null, column: { x: 1150, y: 300, w: 200, h: 356 }, dock: null, bar })?.slice,
    ).toEqual({ x: 1150, y: 656, w: 130, h: 12 });
    // No shared width: 0 wide.
    expect(
      halves({ layout: "column", split: null, column: { x: 800, y: 300, w: 200, h: 356 }, dock: null, bar })?.slice.w,
    ).toBe(0);
    // A top whose foot is below the bottom's top: 0 tall.
    expect(
      halves({ layout: "column", split: null, column: { x: 1100, y: 300, w: 180, h: 400 }, dock: null, bar })?.slice.h,
    ).toBe(0);
  });

  it("gives none in the stacked layout, or where the layout has no top box", () => {
    const bar: Box = { x: 0, y: 640, w: 384, h: 100 };
    const dock: Box = { x: 0, y: 457, w: 384, h: 171 };
    expect(halves({ layout: "stacked", split: null, column: null, dock, bar })).toBeNull();
    expect(halves({ layout: "column", split: null, column: null, dock, bar })).toBeNull();
    expect(halves({ layout: "dock", split: null, column: dock, dock: null, bar })).toBeNull();
  });
});
