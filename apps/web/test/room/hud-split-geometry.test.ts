// T006, rewritten by T021 (spec 018; FR-001, FR-004, SC-001; plan.md §2, §13): the split layout's geometry. It is a
// refinement of the column layout (D-I1, Q53) that FR-001 selects by rule, not by a width: (a) the column layout holds
// its HUD; (b) the open panel is at least 18rem × 14rem; (c) the scene beside it is at least spec 005's floor, 304 ×
// 196; (d) the rest row, in the bar's band at its left, holds its contents; (e) the always-on interface at rest covers at
// most a quarter of the window. The rule is computed here, independently, from hudBoxes, notesReserve, notesBox,
// unionArea, and the table, and the kernel's splitBoxes must agree with it at every screen of the sweep. Where it holds,
// compactBoxes gives the rest row, the list, and the walking control as the boxes at rest (FR-004, R-4); elsewhere,
// today's column or dock layout's boxes. The clear area is the column layout's everywhere.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_METRICS,
  HUD_PLACEMENTS,
  alwaysOnCoverage,
  compactBoxes,
  fitsHud,
  hudBoxes,
  layoutFor,
  notesBox,
  notesReserve,
  splitBoxes,
  unionArea,
} from "../../src/room/compose/hud";
import type { Box, HudMetrics } from "../../src/room/compose/hud";
import { sweepScreens } from "../../src/room/compose/stages";

interface Expected {
  readonly panel: Box;
  readonly rest: Box;
  readonly frame: Box;
  readonly list: Box;
  readonly walk: Box;
}

/** FR-001's rule and FR-004's boxes, from the table: the boxes where (a) to (e) hold, else null. */
function oracle(screen: { w: number; h: number }, m: HudMetrics = DEFAULT_METRICS): Expected | null {
  const T = HUD_PLACEMENTS;
  const t = T.split;
  const { rem, safe } = m;
  // (a)
  if (layoutFor(screen, m) !== "column" || !fitsHud(screen, undefined, m)) return null;
  const bands = hudBoxes(screen, undefined, m);
  const { clear, bar } = bands;
  const band = bands.column as Box;
  // (b)
  const py = clear.y + notesReserve(clear, rem);
  const panel: Box = {
    x: clear.x,
    y: py,
    w: Math.min(t.panel.maxRem * rem, t.panel.shareMax * screen.w - clear.x),
    h: clear.y + clear.h - py,
  };
  if (panel.w < t.panel.minWidthRem * rem || panel.h < t.panel.minHeightRem * rem) return null;
  // (c)
  if (clear.w - panel.w < T.minimum.w || clear.h < T.minimum.h) return null;
  // The bar's tile cluster and the strip, spec 014's compact boxes in the column layout.
  const across = screen.w - safe.left - safe.right;
  const clusterW = Math.min(T.bar.maxRem * rem, across);
  const cluster: Box = { x: screen.w - safe.right - clusterW, y: bar.y, w: clusterW, h: bar.h };
  const stripW = Math.min(T.strip.maxRem * rem, across);
  const strip: Box = { x: safe.left + (across - stripW) / 2, y: 0, w: stripW, h: bands.strip.h };
  // (d)
  const rest: Box = {
    x: safe.left,
    y: bar.y,
    w: Math.min(panel.w, cluster.x - t.rest.gapRem * rem - safe.left),
    h: bar.h,
  };
  if (rest.w < t.rest.minRem * rem) return null;
  const walk: Box = {
    x: band.x + band.w - safe.right - t.walkGapRem * rem - 8 * rem,
    y: band.y + band.h - t.walkGapRem * rem - 2.75 * rem,
    w: 8 * rem,
    h: 2.75 * rem,
  };
  const listW = Math.min(t.list.widthRem * rem, band.w - safe.right);
  const list: Box = {
    x: band.x + band.w - safe.right - listW,
    y: band.y,
    w: listW,
    h: Math.min(t.list.heightRem * rem, walk.y - t.walkGapRem * rem - band.y),
  };
  // (e)
  const cover = unionArea([strip, cluster, rest, list, walk, notesBox(clear, rem)]) / (screen.w * screen.h);
  if (cover > t.coverMax) return null;
  const frame: Box = { x: panel.x, y: panel.y, w: panel.w, h: rest.y + rest.h - panel.y };
  return { panel, rest, frame, list, walk };
}

const close = (a: Box, b: Box, eps = 1e-6): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.w - b.w) <= eps && Math.abs(a.h - b.h) <= eps;
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
  inner.y + inner.h <= outer.y + outer.h + 1e-9;
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe("the split layout's rule (FR-001; SC-001)", () => {
  it("is chosen at exactly the sweep's windows where (a) to (e) hold, with the oracle's boxes", () => {
    const wrong: string[] = [];
    for (const s of sweepScreens()) {
      const want = oracle(s);
      const got = splitBoxes(s);
      const where = `${s.w}x${s.h}`;
      if ((want === null) !== (got === null)) {
        wrong.push(`${where}: ${want ? "split wanted" : "no split wanted"}`);
        continue;
      }
      if (!want || !got) continue;
      for (const k of ["panel", "rest", "frame", "list", "walk"] as const)
        if (!close(want[k], got[k])) wrong.push(`${where}: ${k} ${JSON.stringify(got[k])}`);
    }
    expect(wrong).toEqual([]);
  });

  it("agrees with the oracle at a 20-pixel root and with safe areas", () => {
    const metrics: HudMetrics[] = [
      { ...DEFAULT_METRICS, rem: 20 },
      { rem: 16, safe: { top: 0, right: 44, bottom: 21, left: 44 } },
    ];
    const wrong: string[] = [];
    for (const m of metrics)
      for (const s of sweepScreens()) {
        const want = oracle(s, m);
        const got = splitBoxes(s, undefined, m);
        if ((want === null) !== (got === null)) wrong.push(`${s.w}x${s.h} at ${m.rem}`);
        else if (want && got && !close(want.rest, got.rest)) wrong.push(`${s.w}x${s.h} rest at ${m.rem}`);
      }
    expect(wrong).toEqual([]);
  });

  it("is not chosen at the review's narrower windows", () => {
    for (const s of [
      { w: 1280, h: 720 },
      { w: 1366, h: 768 },
      { w: 844, h: 390 },
      { w: 768, h: 432 },
      { w: 800, h: 500 },
      { w: 1024, h: 600 },
      { w: 700, h: 400 },
      { w: 770, h: 330 },
    ])
      expect(splitBoxes(s), `${s.w}x${s.h}`).toBeNull();
  });

  it("leaves compactBoxes the column or dock layout's where it isn't chosen", () => {
    // Today's boxes at 1280 × 720 (impl-018's tip, probed before the rework): the column's compact box at its band's
    // foot and the walking control at its head (W19).
    const c = compactBoxes({ w: 1280, h: 720 });
    expect(c.split).toBeNull();
    expect(c.column).toEqual(box(832, 349, 448, 319));
    expect(c.walk).toEqual(box(1148, 301, 128, 44));
    expect(c.walkPlace).toBe("column");
    expect(c.all).toEqual([box(424, 0, 432, 27.5), box(720, 668, 560, 52), box(832, 349, 448, 319), c.walk]);
    for (const s of sweepScreens()) {
      if (splitBoxes(s) !== null) continue;
      const k = compactBoxes(s);
      expect(k.split, `${s.w}x${s.h}`).toBeNull();
      expect(k.all, `${s.w}x${s.h}`).toContain(k.layout === "column" ? k.column : k.dock);
    }
  });
});

describe("the split layout's boxes (FR-004; plan.md §2)", () => {
  // plan.md §2's table, at the compositor's metrics.
  const TABLE: [{ w: number; h: number }, Expected, number][] = [
    [
      { w: 1392, h: 783 },
      {
        panel: box(0, 109.5, 640, 621.5),
        rest: box(0, 731, 640, 52),
        frame: box(0, 109.5, 640, 673.5),
        list: box(1008, 27.5, 384, 352),
        walk: box(1260, 683, 128, 44),
      },
      0.23,
    ],
    [
      { w: 1920, h: 1080 },
      {
        panel: box(0, 109.5, 640, 918.5),
        rest: box(0, 1028, 640, 52),
        frame: box(0, 109.5, 640, 970.5),
        list: box(1536, 27.5, 384, 352),
        walk: box(1788, 980, 128, 44),
      },
      0.121,
    ],
    [
      { w: 1920, h: 1200 },
      {
        panel: box(0, 109.5, 640, 1038.5),
        rest: box(0, 1148, 640, 52),
        frame: box(0, 109.5, 640, 1090.5),
        list: box(1536, 27.5, 384, 352),
        walk: box(1788, 1100, 128, 44),
      },
      0.109,
    ],
    [
      { w: 2560, h: 1440 },
      {
        panel: box(0, 109.5, 640, 1278.5),
        rest: box(0, 1388, 640, 52),
        frame: box(0, 109.5, 640, 1330.5),
        list: box(2176, 27.5, 384, 352),
        walk: box(2428, 1340, 128, 44),
      },
      0.068,
    ],
  ];
  for (const [screen, want, cover] of TABLE) {
    it(`gives plan.md §2's boxes at ${screen.w} x ${screen.h}`, () => {
      const s = splitBoxes(screen);
      if (s === null) throw new Error("no split");
      for (const k of ["panel", "rest", "frame", "list", "walk"] as const)
        expect(close(s[k], want[k]), `${k}: ${JSON.stringify(s[k])}`).toBe(true);
      const bands = hudBoxes(screen);
      const { clear, bar } = bands;
      const band = bands.column as Box;
      const c = compactBoxes(screen);
      // The panel in the left half; the scene beside it at least the floor.
      expect(s.panel.x + s.panel.w).toBeLessThanOrEqual(screen.w / 2 + 1e-9);
      expect(clear.w - s.panel.w).toBeGreaterThanOrEqual(304);
      expect(clear.h).toBeGreaterThanOrEqual(196);
      // The rest row in the bar's band, at its left, clear of the tile cluster by 0.25rem.
      expect(inside(s.rest, bar)).toBe(true);
      expect(s.rest.x + s.rest.w).toBeLessThanOrEqual(c.bar.x - 4 + 1e-9);
      // The list in the band's right 24rem, ending 0.25rem above the walking control at the band's foot.
      expect(inside(s.list, band)).toBe(true);
      expect(s.list.x + s.list.w).toBeCloseTo(band.x + band.w, 6);
      expect(s.list.y + s.list.h).toBeLessThanOrEqual(s.walk.y - 4 + 1e-9);
      expect(inside(s.walk, band)).toBe(true);
      expect(s.walk.y + s.walk.h).toBeCloseTo(band.y + band.h - 4, 6);
      for (const part of [s.rest, s.list, s.walk])
        for (const other of [c.strip, notesBox(clear)]) expect(overlaps(part, other)).toBe(false);
      // The boxes at rest, through compactBoxes (R-4): the strip, the cluster, the rest row, the list, the walking control.
      expect(c.split).toEqual(s);
      expect(c.walk).toEqual(s.walk);
      expect(c.walkPlace).toBe("column");
      expect(c.all).toEqual([c.strip, c.bar, s.rest, s.list, s.walk]);
      expect(c.column).not.toBeNull();
      // At rest at most a quarter covered (FR-001 (e)), as plan.md §2 counts it.
      const coverage = alwaysOnCoverage(screen);
      expect(coverage).toBeLessThanOrEqual(0.25);
      expect(coverage).toBeCloseTo(cover, 3);
      // The clear area is the column layout's, unchanged (D-I1).
      expect(clear).toEqual({ x: 0, y: 27.5, w: screen.w - 448, h: screen.h - 27.5 - 52 });
    });
  }

  it("keeps every chosen window's parts apart over the sweep", () => {
    const failures: string[] = [];
    for (const screen of sweepScreens()) {
      const s = splitBoxes(screen);
      if (s === null) continue;
      const bands = hudBoxes(screen);
      const c = compactBoxes(screen);
      const where = `${screen.w}x${screen.h}`;
      if (s.panel.x + s.panel.w > screen.w / 2 + 1e-9) failures.push(`${where}: panel past the half`);
      if (!inside(s.panel, bands.clear)) failures.push(`${where}: panel outside the clear area`);
      if (overlaps(s.panel, notesBox(bands.clear))) failures.push(`${where}: panel on the notes`);
      if (!inside(s.rest, bands.bar)) failures.push(`${where}: rest row outside the bar's band`);
      if (overlaps(s.rest, c.bar)) failures.push(`${where}: rest row on the cluster`);
      if (overlaps(s.list, s.walk)) failures.push(`${where}: list on the walking control`);
      if (!inside(s.list, bands.column as Box)) failures.push(`${where}: list outside the column`);
      if (alwaysOnCoverage(screen) > 0.25 + 1e-9) failures.push(`${where}: over a quarter at rest`);
    }
    expect(failures).toEqual([]);
  });
});
