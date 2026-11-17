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
  notesReserve,
  splitBoxes,
  wallArea,
  wallBoxes,
} from "../../src/room/compose/hud";
import type { Box, HudMetrics } from "../../src/room/compose/hud";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { sweepScreens } from "../../src/room/compose/stages";
import { repositoryBundle } from "../helpers/room";
import { hudWords, textLines } from "../ui/hud-model";

/** The room's own 3D protector, as the room makes it from its bundle (scene.ts), and one without the wall: an older
 *  protector, or the compositor's before it reads the shell. */
const { scene, index } = repositoryBundle();
const PROTECT: Protect = protectorFor(protectSceneOf(scene, index));
const full = protectSceneOf(scene, index);
const NO_WALL: Protect = protectorFor({ framed: full.framed, selectables: full.selectables, figures: full.figures });

interface Expected {
  readonly area: Box;
  readonly wall: Box;
  readonly panel: Box;
  readonly title: Box;
  readonly column: Box;
  readonly list: Box;
  readonly tiles: Box;
  readonly bar: Box;
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
  notes = false,
  /** Spec 030 (T-INT02a; Q100): the list's floor in (b); off only to find the windows it refuses. */
  listFloor = true,
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
  // (b) The floor, and the wall box at least minHeightRem tall. T-A05 (the page's question, recommended answer taken):
  // the area at least spec 004's widest stage, 686.4 px, so no split stage is under its screen's stage before spec 005
  // (test/room/stages-floor.test.ts; spec 005's FR-054).
  if (area.w < T.minimum.w || area.h < T.minimum.h || area.w < t.minAreaWidthPx) return null;
  const wall = protect.wall?.(area) ?? null;
  if (!wall || wall.h < t.minHeightRem * rem) return null;
  // (c) Both bands hold their least widths.
  const leftBand = wall.x - gap - (safe.left + edge);
  const rightBand = screen.w - safe.right - edge - (wall.x + wall.w + gap);
  if (leftBand < t.panel.minRem * rem - 1e-9 || rightBand < t.column.minRem * rem - 1e-9) return null;
  // The protector judges the area as it judges an ease step: a refusal keeps the column layout.
  if (protect.boxes(area, bands.clear) === null) return null;
  const px = Math.max(safe.left + edge, wall.x - gap - t.panel.maxRem * rem);
  // FR-004, SC-001 as reworked (rv-spec-028's N-4; rv-028a-1's A1-2): the panel's top is the wall box's top while no
  // note shows, and below the notes' reserve while one does; its foot is the wall box's foot either way.
  const py = wall.y + (notes ? notesReserve(bands.clear, rem) : 0);
  const panel: Box = { x: px, y: py, w: wall.x - gap - px, h: wall.y + wall.h - py };
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
  // The tiles' block at the column's foot: the toolbar's tiles in rows, each row tall enough for an icon over two
  // lines of words (rv-028a-1's A1-3), in the bar's own box; then, a gap below the bar and outside it, the walking
  // control and the "Eat" tile (rv-028a-1's A1-1: the bar never lies over them).
  const tileH = t.tiles.tileRem * scaleRight * rem;
  const walkW = WALK_CONTROL.widthRem * scaleRight * rem;
  const walkH = WALK_CONTROL.heightRem * scaleRight * rem;
  const pad = t.tiles.padRem * rem;
  const tgap = t.tiles.gapRem * rem;
  const barH = 2 * pad + t.tiles.rows * tileH + (t.tiles.rows - 1) * tgap;
  const tilesH = barH + tgap + walkH + pad;
  const tiles: Box = { x: column.x, y: column.y + column.h - tilesH, w: column.w, h: tilesH };
  const bar: Box = { x: tiles.x, y: tiles.y, w: tiles.w, h: barH };
  const walk: Box = { x: tiles.x + pad, y: bar.y + barH + tgap, w: walkW, h: walkH };
  const eatBox: Box | null = eat ? { x: walk.x + walk.w + tgap, y: walk.y, w: walkW, h: walkH } : null;
  // Spec 030 (FR-003; T-A01 (d)): the list, the top half, from the column's top to the slice, `sliceRem` at the right
  // side's scale above the tiles' block (was `column.h - tilesH - tgap`, the 0.25rem gap); never below 0, where the
  // column is too short for the block and the slice (under 3 px of list before, at 1360 × 320).
  const sliceH = t.sliceRem * scaleRight * rem;
  const list: Box = { x: column.x, y: column.y, w: column.w, h: Math.max(0, column.h - tilesH - sliceH) };
  // Spec 030 (T-INT02a; Q100's recommended answer): (b) also holds the list to its top padding (split.css's 0.5rem,
  // in rem, so no side's scale grows it) and "Back"'s 44 × 44 hit area (FR-013; ui/button.css's 44 px floor): 52 CSS
  // px at a 16-pixel root. Under it, "Back" was cut by the list's `overflow-y: hidden`; the window takes the column
  // layout.
  if (listFloor && list.h < 0.5 * rem + 44 - 1e-9) return null;
  const title: Box = { x: panel.x, y: panel.y, w: panel.w, h: T.split.panel.titleRem * scaleLeft * rem };
  return { area, wall, panel, title, column, list, tiles, bar, walk, eat: eatBox, scaleLeft, scaleRight };
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
const KEYS = ["area", "wall", "panel", "title", "column", "list", "tiles", "bar", "walk", "eat"] as const;

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
      minAreaWidthPx: 686.4,
      scaleMax: 1.375,
      tiles: { rows: 2, perRow: 3, gapRem: 0.25, padRem: 0.25, tileRem: 3.75 },
      // Spec 030 (FR-002, FR-003; T-A01 (d)): the slice between the column's halves, new.
      sliceRem: 0.75,
      // Spec 030 (T-INT02a; Q100): the list's least height, its top padding and "Back"'s hit area, new (was: no
      // such entry; the table as above).
      listFloor: { padRem: 0.5, backPx: 44 },
    });
  });
});

describe('the split layout\'s list holds "Back" (spec 030, T-INT02a; Q100; FR-013)', () => {
  it("refuses the split layout where the list can't hold its top padding and Back's 44 px, so the column layout takes it", () => {
    const floor = 0.5 * DEFAULT_METRICS.rem + 44;
    expect(floor).toBe(52);
    const refused: string[] = [];
    for (const s of LANDSCAPE) {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      if (w) {
        expect(w.list.h, `${s.w}x${s.h}`).toBeGreaterThanOrEqual(floor - 1e-9);
        continue;
      }
      // A window the rule refuses for the list alone: without the floor it would take the split, its list under it.
      const without = oracle(s, DEFAULT_METRICS, PROTECT, false, false, false);
      if (without !== null) {
        expect(without.list.h, `${s.w}x${s.h}`).toBeLessThan(floor);
        refused.push(`${s.w}x${s.h}`);
      }
    }
    // rv3-rework-030b-r2's I-1: at 1360 × 320 the list was 2.9 px, and "Back" was cut at 144 split windows 320 to 368 px
    // tall; with the list's top padding counted, the floor takes 35 more, 384 px tall, where the list held 44 px but
    // not the padding above "Back": 179, each keeping the column layout and holding its HUD.
    expect(wallBoxes({ w: 1360, h: 320 }, OPENING, DEFAULT_METRICS, { wall: PROTECT })).toBeNull();
    for (const where of refused) {
      const [w = 0, h = 0] = where.split("x").map(Number);
      expect(h, where).toBeGreaterThanOrEqual(320);
      expect(h, where).toBeLessThanOrEqual(384);
      expect(layoutFor({ w, h }), where).toBe("column");
      expect(fitsHud({ w, h }), where).toBe(true);
    }
    expect(refused.filter((r) => Number(r.split("x")[1]) <= 368)).toHaveLength(144);
    expect(refused).toHaveLength(179);
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
    it(`at ${s.w} x ${s.h}: each column 1rem off the wall box, 1rem inside the window, apart; the column's top and foot and the panel's foot the wall box's, the panel's top the wall box's with no note (SC-001 as reworked)`, () => {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      if (!w) {
        // Today's layouts, box for box (FR-009): the compact boxes with the wall are those without it.
        expect(compactBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT })).toEqual(compactBoxes(s));
        return;
      }
      const rem = 16;
      expect(w.panel.x + w.panel.w).toBeCloseTo(w.wall.x - rem, 6);
      expect(w.column.x).toBeCloseTo(w.wall.x + w.wall.w + rem, 6);
      // No note shows: the panel's top is the wall box's; the column's top and foot and the panel's foot are the wall
      // box's (SC-001 as reworked after rv-spec-028's N-4).
      expect(w.panel.y).toBeCloseTo(w.wall.y, 6);
      expect(w.panel.y + w.panel.h).toBeCloseTo(w.wall.y + w.wall.h, 6);
      expect(w.column.y).toBeCloseTo(w.wall.y, 6);
      expect(w.column.y + w.column.h).toBeCloseTo(w.wall.y + w.wall.h, 6);
      for (const part of [w.panel, w.column]) {
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
      // rv-028a-1's A1-1: the toolbar's bar holds its tile rows only, inside the tiles' block, off the walking control
      // and the "Eat" tile, so a press reaches them.
      expect(inside(w.bar, w.tiles)).toBe(true);
      expect(w.bar.y).toBeCloseTo(w.tiles.y, 6);
      expect(overlaps(w.bar, w.walk)).toBe(false);
      const e = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT, eat: true });
      if (!e?.eat) throw new Error("no Eat box with the option");
      expect(overlaps(e.bar, e.eat)).toBe(false);
      expect(overlaps(e.bar, e.walk)).toBe(false);
      expect(inside(e.eat, e.tiles)).toBe(true);
      expect(w.tiles.y + w.tiles.h).toBeCloseTo(w.column.y + w.column.h, 6);
    });
  }

  it("pushes the panel's top below the notes' reserve while a note shows, its foot and the column the wall box's (FR-004, FR-014; SC-001 as reworked, N-4)", () => {
    let seen = 0;
    for (const s of TABLE) {
      const bare = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      const noted = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT, notes: true });
      expect(noted === null, `${s.w}x${s.h}`).toBe(bare === null);
      if (!bare || !noted) continue;
      seen += 1;
      const reserve = notesReserve(hudBoxes(s).clear, DEFAULT_METRICS.rem);
      expect(reserve).toBeGreaterThan(0);
      expect(noted.panel.y).toBeCloseTo(bare.wall.y + reserve, 6);
      expect(noted.panel.y + noted.panel.h).toBeCloseTo(bare.wall.y + bare.wall.h, 6);
      expect(noted.panel.x).toBeCloseTo(bare.panel.x, 6);
      expect(noted.panel.w).toBeCloseTo(bare.panel.w, 6);
      expect(noted.title.y).toBeCloseTo(noted.panel.y, 6);
      expect(noted.frame).toEqual(noted.panel);
      for (const k of ["area", "wall", "column", "list", "tiles", "bar", "walk"] as const)
        expect(noted[k]).toEqual(bare[k]);
      expect(close(noted.panel, oracle(s, DEFAULT_METRICS, PROTECT, false, true)?.panel ?? null)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });

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

describe("the toolbar's tiles in the tiles' block (FR-007; rv-028a-1's A1-3)", () => {
  // Each tile is an icon over its words (room.css's .hud-tile: a column flex, 0.125rem apart, padding 0.125rem by
  // 0.5rem, a 1-pixel border, line height 1.2; .hud-icon 1.25rem); in the split layout its type is the bar's
  // 0.8125rem times the right scale (split.css). Its words may wrap to two lines in a third of the column, and the row
  // must hold them: measured with the model's text widths (test/ui/hud-model.ts).
  const WORDS = hudWords(index).bar;
  it("holds every tile's words in at most two lines, inside its row, at every split window of the sweep", () => {
    const T = HUD_PLACEMENTS;
    const t = T.wall.tiles;
    const rem = DEFAULT_METRICS.rem;
    const wrong: string[] = [];
    let narrowest = Number.POSITIVE_INFINITY;
    for (const s of LANDSCAPE) {
      const w = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: PROTECT });
      if (!w) continue;
      const tileW = (w.bar.w - 2 * t.padRem * rem - (t.perRow - 1) * t.gapRem * rem) / t.perRow;
      narrowest = Math.min(narrowest, tileW);
      const inner = tileW - 2 * T.bar.tilePadXRem * rem - 2 * T.borderPx;
      const font = T.bar.fontRem * w.scaleRight * rem;
      const rowH = (w.bar.h - 2 * t.padRem * rem - (t.rows - 1) * t.gapRem * rem) / t.rows;
      for (const word of WORDS) {
        const lines = textLines(word, font, inner);
        const needs = 1.25 * rem + 0.125 * rem + lines * 1.2 * font + 2 * 0.125 * rem + 2 * T.borderPx;
        if (lines > 2) wrong.push(`${s.w}x${s.h}: "${word}" takes ${lines} lines`);
        if (needs > rowH + 1e-9) wrong.push(`${s.w}x${s.h}: "${word}" needs ${needs} in a row of ${rowH}`);
      }
    }
    expect(Number.isFinite(narrowest)).toBe(true);
    expect(WORDS.length).toBe(6);
    expect(wrong.slice(0, 20)).toEqual([]);
  });

  it("wraps a tile's words at the narrowest split window, 1366 × 768 (so one line would not hold them)", () => {
    const w = wallBoxes({ w: 1366, h: 768 }, OPENING, DEFAULT_METRICS, { wall: PROTECT });
    if (!w) throw new Error("1366 x 768 takes no split");
    const T = HUD_PLACEMENTS;
    const rem = DEFAULT_METRICS.rem;
    const tileW = (w.bar.w - 2 * T.wall.tiles.padRem * rem - 2 * T.wall.tiles.gapRem * rem) / 3;
    const inner = tileW - 2 * T.bar.tilePadXRem * rem - 2 * T.borderPx;
    const font = T.bar.fontRem * w.scaleRight * rem;
    expect(Math.max(...WORDS.map((word) => textLines(word, font, inner)))).toBe(2);
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
    // Spec 030 (FR-004; T-A01 (d)): the column 12 px (the slice) above the bar's cluster, the walking control with it
    // (were y 349 and y 301).
    const c = compactBoxes({ w: 1280, h: 720 });
    expect(c.split).toBeNull();
    expect(c.column).toEqual(box(832, 337, 448, 319));
    expect(c.walk).toEqual(box(1148, 289, 128, 44));
    expect(c.walkPlace).toBe("column");
    expect(c.all).toEqual([box(424, 0, 432, 27.5), box(720, 668, 560, 52), box(832, 337, 448, 319), c.walk]);
  });
});
