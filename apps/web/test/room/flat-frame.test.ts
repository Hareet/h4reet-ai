// T010 (spec 014; FR-003; plan.md §2.5, PD-23): the 2D drawing in its frame area. The drawing's 8:5 view box takes the
// largest scale that fits the area, min(W ÷ 320, H ÷ 200), centred in it; its protector gives each selectable pressable
// at spec 005's frame its 44 × 44 core, from the drawing's hit rectangles at the area's scale (compose/pick.ts, as RG6
// measures the 2D room), and the two figures' drawn boxes, the index's `flat.figures`, all in the window's pixels; and
// the frame area eases by the same rule as in 3D.
import { describe, expect, it } from "vitest";

import { frameArea } from "../../src/room/compose/frame";
import { DEFAULT_METRICS, OPENING, compactBoxes, hudBoxes } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { CORE_PX, flatCore, listOnly, pickAreas } from "../../src/room/compose/pick";
import { flatProtectorFor } from "../../src/room/compose/protect";
import { FLAT_VIEW, flatPlacement, flatScale } from "../../src/room/compose/stages";
import { roomIndex } from "../helpers/room";

const index = roomIndex();

describe("the 2D drawing's place in a frame area (compose/stages.ts's flatPlacement)", () => {
  it("scales the view box to fit the area and centres it there", () => {
    for (const area of [
      { x: 0, y: 0, w: 1920, h: 1200 },
      { x: 0, y: 27.5, w: 1472, h: 1120.5 },
      { x: 12, y: 40, w: 300, h: 400 },
    ]) {
      const p = flatPlacement(area);
      expect(p.scale).toBe(flatScale(area));
      expect(p.scale).toBe(Math.min(area.w / FLAT_VIEW.w, area.h / FLAT_VIEW.h));
      expect(p.x + (FLAT_VIEW.w * p.scale) / 2).toBeCloseTo(area.x + area.w / 2, 9);
      expect(p.y + (FLAT_VIEW.h * p.scale) / 2).toBeCloseTo(area.y + area.h / 2, 9);
    }
  });
});

describe("the 2D protector (compose/protect.ts's flatProtectorFor)", () => {
  it("carries the two figures' drawn boxes in the index, inside the view box", () => {
    expect(index.flat.figures).toHaveLength(2);
    for (const [x, y, w, h] of index.flat.figures) {
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y + h).toBeLessThanOrEqual(FLAT_VIEW.h + 1e-9);
    }
  });

  it("gives each pressable selectable's core and each figure's drawn box, in the window's pixels", () => {
    const protect = flatProtectorFor(index);
    const screen = { w: 1920, h: 1200 };
    const clear = hudBoxes(screen).clear;
    const area: Box = { x: 0, y: 0, ...screen };
    const got = protect.boxes(area, clear);
    // Written out: the hits' cores at the area's scale, less those list-only at the clear area's scale.
    const inputs = index.flat.hits.map((h) => ({
      id: h.selectable,
      members: h.rects.map((rect, k) => ({ rect, depth: h.depths[k] ?? 0 })),
    }));
    const sideWall = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
    const view: [number, number, number, number] = [0, 0, FLAT_VIEW.w, FLAT_VIEW.h];
    const held = listOnly(pickAreas(inputs, flatCore(clear)), view, sideWall);
    const p = flatPlacement(area);
    const cores = pickAreas(inputs, flatCore(area))
      .filter((a) => a.core && !held.has(a.id))
      .map((a) => {
        const [cx, cy, cw] = a.core as [number, number, number, number];
        const centre = [p.x + (cx + cw / 2) * p.scale, p.y + (cy + cw / 2) * p.scale];
        return { x: (centre[0] ?? 0) - CORE_PX / 2, y: (centre[1] ?? 0) - CORE_PX / 2, w: CORE_PX, h: CORE_PX };
      });
    const figures = index.flat.figures.map(([x, y, w, h]) => ({
      x: p.x + x * p.scale,
      y: p.y + y * p.scale,
      w: w * p.scale,
      h: h * p.scale,
    }));
    expect(got.length).toBe(cores.length + figures.length);
    got.forEach((b, i) => {
      const want = [...cores, ...figures][i] as Box;
      for (const k of ["x", "y", "w", "h"] as const) expect(b[k]).toBeCloseTo(want[k], 6);
    });
  });

  it("eases the 2D frame by the same rule: every protected box 0.5rem clear of the compact boxes, or the clear area", () => {
    const protect = flatProtectorFor(index);
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
    ]) {
      const f = frameArea(screen, OPENING, DEFAULT_METRICS, protect);
      expect(f.fellBack).toBe(false);
      if (f.ease === 1) continue;
      const clear = hudBoxes(screen).clear;
      const near = (a: Box, b: Box): boolean =>
        a.x < b.x + b.w + 8 && b.x - 8 < a.x + a.w && a.y < b.y + b.h + 8 && b.y - 8 < a.y + a.h;
      for (const p of protect.boxes(f.area, clear))
        for (const c of compactBoxes(screen).all) expect(near(p, c), `${screen.w} × ${screen.h}`).toBe(false);
    }
  });
});
