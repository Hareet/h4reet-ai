// T-A01 (spec 028; FR-004, FR-006 to FR-009, SC-001; Q2 to Q4; plan.md §R-A2, §R-A3): the split layout beside the
// room's walls. The room is framed into the wall area (the window less the strip, the panel's and the column's least
// widths with their gaps, and the safe areas), the wall box is the shell's opening there (compose/wall.ts), and the
// conversation panel and the right column stand 1rem off its left and right edges, as tall as it, each filling its
// band out to its most width and scaling its type and tiles with it. FR-009's rule and the boxes are computed here,
// independently, from the table, hudBoxes, and the protector's wall; the kernel's wallBoxes (splitBoxes its alias),
// compactBoxes, and frameArea must agree with them. Where the rule fails, the column or dock layout is today's, box
// for box.
import { describe, expect, it } from "vitest";

import { frameArea } from "../../src/room/compose/frame";
import type { Protect } from "../../src/room/compose/frame";
import {
  DEFAULT_METRICS,
  HUD_PLACEMENTS,
  OPENING,
  WALK_CONTROL,
  compactBoxes,
  fitsHud,
  hudBoxes,
  layoutFor,
  splitBoxes,
  wallArea,
  wallBoxes,
} from "../../src/room/compose/hud";
import type { Box, HudMetrics } from "../../src/room/compose/hud";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { sweepScreens } from "../../src/room/compose/stages";
import { repositoryBundle } from "../helpers/room";

/** The room's own 3D protector, as the room makes it from its bundle (scene.ts), and one without the wall: an older
 *  protector, or the compositor's before it reads the shell. */
const { scene, index } = repositoryBundle();
const PROTECT: Protect = protectorFor(protectSceneOf(scene, index));
const { shell: _shell, ...sceneWithoutShell } = protectSceneOf(scene, index);
const NO_WALL: Protect = protectorFor(sceneWithoutShell);

interface Expected {
  readonly area: Box;
  readonly wall: Box;
  readonly panel: Box;
  readonly title: Box;
  readonly column: Box;
  readonly list: Box;
  readonly tiles: Box;
  readonly walk: Box;
  readonly eat: Box | null;
  readonly scaleLeft: number;
  readonly scaleRight: number;
}

/** FR-009's rule and FR-004, FR-006 to FR-008's boxes, from the table: null where the rule fails. */
function oracle(
  screen: { w: number; h: number },
  m: HudMetrics = DEFAULT_METRICS,
  protect: Protect = PROTECT,
  eat = false,
): Expected | null {
  const T = HUD_PLACEMENTS;
  const t = T.wall;
  const { rem, safe } = m;
  // (a) The column layout's rule, holding its HUD.
  if (layoutFor(screen, m) !== "column" || !fitsHud(screen, OPENING, m)) return null;
  const bands = hudBoxes(screen, OPENING, m);
  const gap = t.gapRem * rem;
  const edge = t.edgeRem * rem;
  // FR-006: the area, the window less the strip, the two least widths with their gap and edge, and the safe areas.
  const x = safe.left + (t.panel.minRem + t.gapRem + t.edgeRem) * rem;
  const right = screen.w - safe.right - (t.column.minRem + t.gapRem + t.edgeRem) * rem;
  const y = bands.strip.h;
  const area: Box = { x, y, w: right - x, h: screen.h - safe.bottom - y };
  // (b) The floor, and the wall box at least minHeightRem tall.
  if (area.w < T.minimum.w || area.h < T.minimum.h) return null;
  const wall = protect.wall?.(area) ?? null;
  if (!wall || wall.h < t.minHeightRem * rem) return null;
  // (c) Both bands hold their least widths.
  const leftBand = wall.x - gap - (safe.left + edge);
  const rightBand = screen.w - safe.right - edge - (wall.x + wall.w + gap);
  if (leftBand < t.panel.minRem * rem - 1e-9 || rightBand < t.column.minRem * rem - 1e-9) return null;
  // The protector judges the area as it judges an ease step: a refusal keeps the column layout.
  if (protect.boxes(area, bands.clear) === null) return null;
  const px = Math.max(safe.left + edge, wall.x - gap - t.panel.maxRem * rem);
  const panel: Box = { x: px, y: wall.y, w: wall.x - gap - px, h: wall.h };
  const cx = wall.x + wall.w + gap;
  const column: Box = {
    x: cx,
    y: wall.y,
    w: Math.min(t.column.maxRem * rem, screen.w - safe.right - edge - cx),
    h: wall.h,
  };
  const scale = (w: number, lo: number, hi: number): number =>
    1 + (t.scaleMax - 1) * Math.min(1, Math.max(0, (w - lo * rem) / ((hi - lo) * rem)));
  const scaleLeft = scale(panel.w, t.panel.minRem, t.panel.maxRem);
  const scaleRight = scale(column.w, t.column.minRem, t.column.maxRem);
  // The tiles' block at the column's foot: the toolbar's tiles in rows, then the walking control and the "Eat" tile.
  const tileH = T.bar.tileRem * scaleRight * rem;
  const walkW = WALK_CONTROL.widthRem * scaleRight * rem;
  const walkH = WALK_CONTROL.heightRem * scaleRight * rem;
  const pad = t.tiles.padRem * rem;
  const tgap = t.tiles.gapRem * rem;
  const tilesH = 2 * pad + t.tiles.rows * (tileH + tgap) + walkH;
  const tiles: Box = { x: column.x, y: column.y + column.h - tilesH, w: column.w, h: tilesH };
  const walk: Box = { x: tiles.x + pad, y: tiles.y + tiles.h - pad - walkH, w: walkW, h: walkH };
  const eatBox: Box | null = eat ? { x: walk.x + walk.w + tgap, y: walk.y, w: walkW, h: walkH } : null;
  const list: Box = { x: column.x, y: column.y, w: column.w, h: column.h - tilesH - tgap };
  const title: Box = { x: panel.x, y: panel.y, w: panel.w, h: T.split.panel.titleRem * scaleLeft * rem };
  return { area, wall, panel, title, column, list, tiles, walk, eat: eatBox, scaleLeft, scaleRight };
}

const close = (a: Box | null, b: Box | null, eps = 1e-6): boolean =>
  a === null || b === null
    ? a === b
    : Math.abs(a.x - b.x) <= eps &&
      Math.abs(a.y - b.y) <= eps &&
      Math.abs(a.w - b.w) <= eps &&
      Math.abs(a.h - b.h) <= eps;
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
  inner.y + inner.h <= outer.y + outer.h + 1e-9;
const KEYS = ["area", "wall", "panel", "title", "column", "list", "tiles", "walk", "eat"] as const;

/** Plan §R-A3's windows. */
const TABLE: readonly { w: number; h: number }[] = [
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 1920, h: 1200 },
  { w: 1680, h: 1050 },
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 844, h: 390 },
  { w: 768, h: 1024 },
  { w: 700, h: 500 },
  { w: 320, h: 568 },
];

/** The landscape screens of the sweep: the only ones the column layout, and so the split layout, can take. */
const LANDSCAPE = sweepScreens().filter((s) => s.w > s.h && s.w >= 512);

describe("plan §R-A3's table (T-A01 records it)", () => {
  it("prints each window's layout, its wall box, and the two columns' widths", () => {
    const rows: string[] = ["| Window | Layout | Wall box | Panel w | Column w |", "|---|---|---|---|---|"];
    const r = (n: number): string => String(Math.round(n * 10) / 10);
    for (const s of TABLE) {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      const layout = w ? "split" : fitsHud(s) ? layoutFor(s) : "stacked";
      const wall = w ? `${r(w.wall.x)}, ${r(w.wall.y)}, ${r(w.wall.w)} × ${r(w.wall.h)}` : "—";
      rows.push(`| ${s.w} × ${s.h} | ${layout} | ${wall} | ${w ? r(w.panel.w) : "—"} | ${w ? r(w.column.w) : "—"} |`);
    }
    console.log(rows.join("\n"));
    expect(rows).toHaveLength(TABLE.length + 2);
  });

  it("takes the split layout at the wide windows and keeps today's layouts at the small ones", () => {
    for (const s of [TABLE[0], TABLE[1], TABLE[2], TABLE[3]])
      expect(wallBoxes(s as Box, OPENING, DEFAULT_METRICS, { wall: PROTECT }), `${s?.w}x${s?.h}`).not.toBeNull();
    for (const s of [TABLE[6], TABLE[7], TABLE[8], TABLE[9]])
      expect(wallBoxes(s as Box, OPENING, DEFAULT_METRICS, { wall: PROTECT }), `${s?.w}x${s?.h}`).toBeNull();
  });
});

describe("the wall placement table (Key Entities)", () => {
  it("holds spec 028's numbers", () => {
    expect(HUD_PLACEMENTS.wall).toEqual({
      gapRem: 1,
      edgeRem: 1,
      panel: { minRem: 20, maxRem: 44 },
      column: { minRem: 18, maxRem: 32 },
      minHeightRem: 14,
      scaleMax: 1.375,
      tiles: { rows: 2, perRow: 3, gapRem: 0.25, padRem: 0.25 },
    });
  });
});

describe("FR-009's rule and the boxes (FR-004, FR-006 to FR-008)", () => {
  it("agrees with the oracle at every landscape window of the sweep", () => {
    const wrong: string[] = [];
    for (const s of LANDSCAPE) {
      const want = oracle(s);
      const got = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      const where = `${s.w}x${s.h}`;
      if ((want === null) !== (got === null)) {
        wrong.push(`${where}: ${want ? "split wanted" : "no split wanted"}`);
        continue;
      }
      if (!want || !got) continue;
      for (const k of KEYS) if (!close(want[k], got[k])) wrong.push(`${where}: ${k} ${JSON.stringify(got[k])}`);
      if (Math.abs(want.scaleLeft - got.scaleLeft) > 1e-9) wrong.push(`${where}: scaleLeft ${got.scaleLeft}`);
      if (Math.abs(want.scaleRight - got.scaleRight) > 1e-9) wrong.push(`${where}: scaleRight ${got.scaleRight}`);
    }
    expect(wrong.slice(0, 20)).toEqual([]);
  });

  it("agrees with the oracle at a 20-pixel root, with safe areas, and with the Eat option", () => {
    const metrics: HudMetrics[] = [
      { ...DEFAULT_METRICS, rem: 20 },
      { rem: 16, safe: { top: 0, right: 44, bottom: 21, left: 44 } },
    ];
    const wrong: string[] = [];
    for (const s of TABLE) {
      for (const m of metrics) {
        const want = oracle(s, m);
        const got = wallBoxes(s, OPENING, m, { wall: PROTECT });
        if ((want === null) !== (got === null)) wrong.push(`${s.w}x${s.h} at ${m.rem}/${m.safe.left}`);
        else if (want && got) for (const k of KEYS) if (!close(want[k], got[k])) wrong.push(`${s.w}x${s.h} ${k}`);
      }
      const want = oracle(s, DEFAULT_METRICS, PROTECT, true);
      const got = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT, eat: true });
      if ((want === null) !== (got === null)) wrong.push(`${s.w}x${s.h} with eat`);
      else if (want && got && !close(want.eat, got.eat)) wrong.push(`${s.w}x${s.h} eat ${JSON.stringify(got.eat)}`);
    }
    expect(wrong).toEqual([]);
  });

  it("is none without a wall: a protector with none, or no protector, keeps today's layouts", () => {
    for (const s of TABLE) {
      expect(wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: NO_WALL }), `${s.w}x${s.h}`).toBeNull();
      expect(wallBoxes(s), `${s.w}x${s.h}`).toBeNull();
      expect(splitBoxes(s), `${s.w}x${s.h}`).toBeNull();
    }
  });

  it("keeps splitBoxes as wallBoxes's name for spec 018's callers", () => {
    expect(splitBoxes).toBe(wallBoxes);
  });

  it("is chosen where the protector's wall and FR-009 allow it, refused where the protector refuses the area", () => {
    const refusing: Protect = { wall: PROTECT.wall, boxes: () => null } as Protect;
    expect(wallBoxes({ w: 1920, h: 1080 }, OPENING, DEFAULT_METRICS, { wall: refusing })).toBeNull();
  });
});

describe("SC-001 at the table's windows", () => {
  for (const s of TABLE) {
    it(`at ${s.w} x ${s.h}: each column 1rem off the wall box, as tall as it, 1rem inside the window, apart`, () => {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      if (!w) {
        // Today's layouts, box for box (FR-009): the compact boxes with the wall are those without it.
        expect(compactBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT })).toEqual(compactBoxes(s));
        return;
      }
      const rem = 16;
      expect(w.panel.x + w.panel.w).toBeCloseTo(w.wall.x - rem, 6);
      expect(w.column.x).toBeCloseTo(w.wall.x + w.wall.w + rem, 6);
      for (const part of [w.panel, w.column]) {
        expect(part.y).toBeCloseTo(w.wall.y, 6);
        expect(part.h).toBeCloseTo(w.wall.h, 6);
        expect(part.x).toBeGreaterThanOrEqual(rem - 1e-9);
        expect(part.x + part.w).toBeLessThanOrEqual(s.w - rem + 1e-9);
        expect(part.y).toBeGreaterThanOrEqual(rem - 1e-9);
        expect(part.y + part.h).toBeLessThanOrEqual(s.h - rem + 1e-9);
        expect(overlaps(part, w.wall)).toBe(false);
      }
      expect(overlaps(w.panel, w.column)).toBe(false);
      // The sizes: between the least and the most width, each band's rest at the window's edge.
      expect(w.panel.w).toBeGreaterThanOrEqual(20 * rem - 1e-9);
      expect(w.panel.w).toBeLessThanOrEqual(44 * rem + 1e-9);
      expect(w.column.w).toBeGreaterThanOrEqual(18 * rem - 1e-9);
      expect(w.column.w).toBeLessThanOrEqual(32 * rem + 1e-9);
      // Inside the column: the list over the tiles' block, the walking control in it.
      expect(inside(w.list, w.column)).toBe(true);
      expect(inside(w.tiles, w.column)).toBe(true);
      expect(inside(w.walk, w.tiles)).toBe(true);
      expect(overlaps(w.list, w.tiles)).toBe(false);
      expect(w.tiles.y + w.tiles.h).toBeCloseTo(w.column.y + w.column.h, 6);
    });
  }

  it("keeps the panel and the column off the wall box and apart at every split window of the sweep", () => {
    const failures: string[] = [];
    for (const s of LANDSCAPE) {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      if (!w) continue;
      const where = `${s.w}x${s.h}`;
      for (const [name, part] of [
        ["panel", w.panel],
        ["column", w.column],
      ] as const) {
        if (overlaps(part, w.wall)) failures.push(`${where}: ${name} on the wall box`);
        if (part.x < 0 || part.x + part.w > s.w || part.y < 0 || part.y + part.h > s.h)
          failures.push(`${where}: ${name} outside the window`);
      }
      if (overlaps(w.panel, w.column)) failures.push(`${where}: the panel on the column`);
      if (!inside(w.wall, w.area)) failures.push(`${where}: the wall box outside its area`);
      if (w.eat !== null) failures.push(`${where}: an Eat box without the option`);
    }
    expect(failures.slice(0, 20)).toEqual([]);
  });
});

describe("FR-008: the scales", () => {
  it("run from 1 at the least width to 1.375 at the most, linearly", () => {
    let seenMax = false;
    for (const s of [...TABLE, { w: 3840, h: 2160 }, { w: 5120, h: 2160 }]) {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      if (!w) continue;
      const left = 1 + 0.375 * ((w.panel.w - 320) / 384);
      const right = 1 + 0.375 * ((w.column.w - 288) / 224);
      expect(w.scaleLeft).toBeCloseTo(Math.min(1.375, Math.max(1, left)), 9);
      expect(w.scaleRight).toBeCloseTo(Math.min(1.375, Math.max(1, right)), 9);
      expect(w.scaleLeft).toBeGreaterThanOrEqual(1);
      expect(w.scaleRight).toBeLessThanOrEqual(1.375);
      if (w.scaleLeft === 1.375 && w.scaleRight === 1.375) seenMax = true;
    }
    expect(seenMax).toBe(true);
  });
});

describe("the frame area and the compact boxes in the split layout (FR-006, FR-007)", () => {
  it("frames the room into the wall area with no ease, and the compact boxes are the strip, the panel, the column", () => {
    for (const s of TABLE) {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      if (!w) continue;
      const f = frameArea(s, OPENING, DEFAULT_METRICS, PROTECT);
      expect(f).toEqual({ area: w.area, ease: 0, fellBack: false });
      expect(wallArea(s, DEFAULT_METRICS)).toEqual(w.area);
      const c = compactBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      expect(c.split).toEqual(w);
      expect(c.walk).toEqual(w.walk);
      expect(c.walkPlace).toBe("column");
      expect(c.all).toEqual([c.strip, w.panel, w.column]);
      expect(c.eat).toBeNull();
      const ce = compactBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT, eat: true });
      expect(ce.eat).toEqual(ce.split?.eat);
      expect(ce.eat).not.toBeNull();
    }
  });

  it("leaves the frame area and the compact boxes today's where the rule fails", () => {
    const wrong: string[] = [];
    for (const s of LANDSCAPE.filter((_, k) => k % 7 === 0)) {
      if (wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT })) continue;
      const where = `${s.w}x${s.h}`;
      const today = compactBoxes(s);
      if (JSON.stringify(compactBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT })) !== JSON.stringify(today))
        wrong.push(`${where}: compact`);
      if (today.split !== null) wrong.push(`${where}: a split without a wall`);
      if (
        JSON.stringify(frameArea(s, OPENING, DEFAULT_METRICS, PROTECT)) !==
        JSON.stringify(frameArea(s, OPENING, DEFAULT_METRICS, NO_WALL))
      )
        wrong.push(`${where}: frame area`);
    }
    expect(wrong).toEqual([]);
  });

  it("keeps today's column layout's boxes at 1280 x 720 without a wall (impl-018's probe)", () => {
    const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
    const c = compactBoxes({ w: 1280, h: 720 });
    expect(c.split).toBeNull();
    expect(c.column).toEqual(box(832, 349, 448, 319));
    expect(c.walk).toEqual(box(1148, 301, 128, 44));
    expect(c.walkPlace).toBe("column");
    expect(c.all).toEqual([box(424, 0, 432, 27.5), box(720, 668, 560, 52), box(832, 349, 448, 319), c.walk]);
  });
});
