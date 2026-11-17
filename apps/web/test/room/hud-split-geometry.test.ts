// T006, rewritten by T021 (spec 018; FR-001, FR-004, SC-001; plan.md §2, §13), rewritten again by spec 028's T-A02
// (its FR-004 to FR-009; plan.md §R-A2, §R-B8) for the geometry beside the room's walls: spec 018's split layout is
// placed beside the wall box, and FR-009's rule replaces spec 018's FR-001 (test/room/hud-wall-geometry.test.ts holds
// the rule and the boxes to an oracle). What stays spec 018's, and is held here: `splitBoxes` is the split layout's
// boxes under its old name; it is a refinement of the column layout that a rule selects, never a width; where it isn't
// taken, compactBoxes gives today's column or dock layout's boxes; and every chosen window's parts stay apart.
import { describe, expect, it } from "vitest";

import type { Protect } from "../../src/room/compose/frame";
import {
  DEFAULT_METRICS,
  OPENING,
  compactBoxes,
  hudBoxes,
  layoutFor,
  splitBoxes,
  wallBoxes,
} from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { sweepScreens } from "../../src/room/compose/stages";
import { repositoryBundle } from "../helpers/room";

const { scene, index } = repositoryBundle();
const WALL: Protect = protectorFor(protectSceneOf(scene, index));
const split = (s: { w: number; h: number }) => splitBoxes(s, OPENING, DEFAULT_METRICS, { wall: WALL });

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
  inner.y + inner.h <= outer.y + outer.h + 1e-9;
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const LANDSCAPE = sweepScreens().filter((s) => s.w > s.h && s.w >= 512);

describe("the split layout's rule (FR-001, as spec 028's FR-009 replaces it)", () => {
  it("is spec 028's wallBoxes under spec 018's name", () => {
    expect(splitBoxes).toBe(wallBoxes);
  });

  it("is a refinement of the column layout: never chosen where the window takes the dock layout", () => {
    for (const s of sweepScreens()) if (layoutFor(s) !== "column") expect(split(s), `${s.w}x${s.h}`).toBeNull();
  });

  it("is not chosen at the review's narrowest windows", () => {
    for (const s of [
      { w: 844, h: 390 },
      { w: 768, h: 432 },
      { w: 700, h: 400 },
      { w: 770, h: 330 },
    ])
      expect(split(s), `${s.w}x${s.h}`).toBeNull();
  });

  it("leaves compactBoxes the column or dock layout's where it isn't chosen", () => {
    // Today's boxes at 1280 × 720 without a wall (impl-018's tip, probed before the rework): the column's compact box at
    // its band's foot and the walking control at its head (W19).
    // Spec 030 (FR-004; T-A01 (d)): the column, the top half, 12 px (the slice) above the bar's cluster, the walking
    // control at its head with it (were the column at y 349 and the control at y 301).
    const c = compactBoxes({ w: 1280, h: 720 });
    expect(c.split).toBeNull();
    expect(c.column).toEqual(box(832, 337, 448, 319));
    expect(c.walk).toEqual(box(1148, 289, 128, 44));
    expect(c.walkPlace).toBe("column");
    expect(c.all).toEqual([box(424, 0, 432, 27.5), box(720, 668, 560, 52), box(832, 337, 448, 319), c.walk]);
    for (const s of LANDSCAPE.filter((_, k) => k % 5 === 0)) {
      if (split(s) !== null) continue;
      const k = compactBoxes(s, OPENING, DEFAULT_METRICS, { wall: WALL });
      expect(k.split, `${s.w}x${s.h}`).toBeNull();
      expect(k.all, `${s.w}x${s.h}`).toContain(k.layout === "column" ? k.column : k.dock);
    }
  });
});

describe("the split layout's boxes (FR-004, as spec 028 places them)", () => {
  it("keeps every chosen window's parts apart over the sweep", () => {
    const failures: string[] = [];
    for (const screen of LANDSCAPE) {
      const s = split(screen);
      if (s === null) continue;
      const where = `${screen.w}x${screen.h}`;
      const clear = hudBoxes(screen).clear;
      if (overlaps(s.panel, s.column)) failures.push(`${where}: panel on the column`);
      if (overlaps(s.panel, s.wall) || overlaps(s.column, s.wall)) failures.push(`${where}: a column on the wall box`);
      if (overlaps(s.list, s.tiles)) failures.push(`${where}: list on the tiles`);
      if (!inside(s.walk, s.tiles)) failures.push(`${where}: walking control outside the tiles`);
      if (!inside(s.list, s.column) || !inside(s.tiles, s.column)) failures.push(`${where}: outside the column`);
      if (!inside(s.title, s.panel)) failures.push(`${where}: title outside the panel`);
      if (s.panel.y < clear.y - 1e-9) failures.push(`${where}: panel over the strip`);
    }
    expect(failures.slice(0, 20)).toEqual([]);
  });

  it("gives compactBoxes the strip, the panel, and the column at rest where chosen (FR-003)", () => {
    for (const screen of [
      { w: 1920, h: 1080 },
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
    ]) {
      const s = split(screen);
      if (s === null) throw new Error(`no split at ${screen.w}x${screen.h}`);
      const c = compactBoxes(screen, OPENING, DEFAULT_METRICS, { wall: WALL });
      expect(c.split).toEqual(s);
      expect(c.walk).toEqual(s.walk);
      expect(c.walkPlace).toBe("column");
      expect(c.all).toEqual([c.strip, s.panel, s.column]);
    }
  });
});
