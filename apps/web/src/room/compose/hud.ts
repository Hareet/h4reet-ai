// The HUD's placements (spec 005; FR-007, FR-019 to FR-022, FR-052 to FR-055; plan.md §2, §3, PD-1 to PD-7): one table
// beside the supported stages, in the kernel, so a data edit can't move the stages the checks run at (spec 004's
// room-data-files.md §13.3), and moving a panel is one edit here. The runtime (layout.ts, through CSS properties the
// room sets on the page's root) and the compositor (compose/stages.ts, rg.ts) read the same numbers.
// - The column layout, on a window wider than tall and at least 32rem wide: the AI disclosure as a strip across the
//   top, the bar of controls across the foot, and one column on the right between them, clamp(15rem, 40%, 28rem),
//   holding the list above the conversation. Collapsing either keeps the column's width (PD-5).
// - The dock layout, on every other window: the strip at the top, and one dock across the foot holding the list's
//   strip and the text box's row, above the bar. Collapsing the list's strip frees its rows (PD-6).
// - The clear area: the window less the docked boxes and the safe areas, computed from the table, never measured
//   (PD-7). The room is framed into it, and it is what spec 004's checks call the stage.
// - The minimum: a clear area of 304 × 196 CSS pixels on a window at least 20rem wide; below it the stacked layout,
//   spec 004's grid, takes over (FR-007).
// Every size is in rem of the window's root font size, so 200% text needs twice the window; the width bands, where a
// part's rows or lines change, are test/ui/hud-model.ts's findings with the index's words, rounded inward to a whole
// rem, which test/ui/hud-model.test.ts holds to the model at every screen of the sweep.
// Spec 014 (FR-017 to FR-021; plan.md §3, PD-3 to PD-7; contracts/frame-area.md §1, §3): beside the bands, which stay
// the floor's definition and what spec 005's and spec 012's rules read, the table holds the compact boxes the visitor
// sees at rest, each taking its own pointer: in the column layout the strip as wide as its words' bound, centred at the
// top; the bar's tiles one cluster at the foot's right, under the column (PD-6); the column its content's height at its
// band's foot (D8), its log at a rest height by the window's height (PD-7); in the dock layout the bands themselves;
// and in both the walking control in the clear area's corner. Each bound is test/ui/hud-model.ts's finding with the
// index's words, rounded up to a whole rem, which test/ui/hud-model.test.ts holds; the always-on interface, those
// boxes and the notes' reserve, covers at most a quarter of every landscape window from 1280 × 720 (FR-019).
import type { Rect } from "./pick";

/** A window's box or a panel's, in CSS pixels from the window's top left. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The window's safe-area insets (`env(safe-area-inset-*)`), in CSS pixels. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** What the boxes depend on beside the window's size: the root font size, and the safe areas. */
export interface HudMetrics {
  readonly rem: number;
  readonly safe: Insets;
  /** The strip's height the window measured, its safe area included, where text spacing or a minimum font size makes
   *  its words take more lines than the table's band gives: a floor for the strip's box (the review of 60b51de4,
   *  finding 3; FR-049). Absent, the table's alone, as the compositor counts it. */
  readonly strip?: number;
}

/** The compositor's metrics: the browser's default root font size, and no safe areas. */
export const DEFAULT_METRICS: HudMetrics = { rem: 16, safe: { top: 0, right: 0, bottom: 0, left: 0 } };

/** The docked panels' states: the list's strip open or collapsed. The conversation's log is a sheet in the dock
 *  layout and collapses inside the column in the column layout, so it never changes the clear area. */
export interface HudState {
  readonly list: "open" | "collapsed";
}

/** Every panel starts open (FR-020). */
export const OPENING: HudState = { list: "open" };

export type HudLayout = "column" | "dock";

/** A part's rows or lines by the window's width: the first band the width (in rem) is under gives its count, and the
 *  part takes one at or above every band. */
export interface Band {
  readonly belowRem: number;
  readonly n: number;
}

/**
 * The table: every size the HUD's docked boxes and their contents take, in rem unless named otherwise. room.css's HUD
 * rules are pinned to it (test/room/stages.test.ts, test/ui/hud.test.ts), and the model measures words at its sizes.
 */
export const HUD_PLACEMENTS = {
  /** The column layout from this width, on a window wider than tall (spec 004's landscape bound). */
  columnMinWidthRem: 32,
  /** The least clear area, in CSS pixels, and the narrowest window, for the HUD; below either, the stacked layout. */
  minimum: { w: 304, h: 196, windowRem: 20 },
  /** A control's and a border's sizes, shared: the 44 × 44 target (FR-048), and a 1-pixel border. */
  borderPx: 1,
  /** The AI disclosure's strip (index.html's header, fixed at the top): its type, line height, and padding. */
  strip: {
    fontRem: 0.8125,
    lineHeight: 1.5,
    padYRem: 0.25,
    padXRem: 0.5,
    lines: [{ belowRem: 27, n: 2 }] as readonly Band[],
    /** Spec 014: the strip's compact box at most this wide, its words on one line with its padding and border (the
     *  model: 26.3rem), centred at the top; narrower windows take the band's width, and its lines. */
    maxRem: 27,
  },
  /** The bar of controls at the foot: tiles of an icon over words, one row on every landscape screen of the sweep. */
  bar: {
    tileRem: 2.75,
    fontRem: 0.8125,
    tilePadXRem: 0.5,
    gapRem: 0.25,
    padRem: 0.25,
    rows: [{ belowRem: 35, n: 2 }] as readonly Band[],
    /** Spec 014: the tiles' cluster at most this wide, the six in one row with their gaps and padding (the model:
     *  34.4rem), at the foot's right, under the column (PD-6). */
    maxRem: 35,
    align: "right",
  },
  /** The column, on the right between the strip and the bar: two fifths of the window, between 15rem and 28rem. */
  column: {
    share: 0.4,
    minRem: 15,
    maxRem: 28,
    padRem: 0.25,
    /** Spec 014: the column's compact box sits at its band's foot (D8), as tall as its content. */
    anchor: "foot",
    /** Spec 014, T053 (W19): the gap between the column's content and the walking control at its head, and the
     *  control's inset from the column's right. */
    walkGapRem: 0.25,
    /** Spec 014: the list's rows beside its header button in the column, by the column's width (the model: three
     *  rows under 20rem, two from there to 28rem), which its content's height counts. */
    listRows: [
      { belowRem: 20, n: 3 },
      { belowRem: Number.POSITIVE_INFINITY, n: 2 },
    ] as readonly Band[],
  },
  /** Spec 018 (FR-001, FR-004; plan.md §2): the split layout, a refinement of the column layout: from a landscape window of
   *  `minWidthRem`, the conversation panel in the clear area's left (at most `maxRem` wide and `shareMax` of the window,
   *  and at least `minWidthRem`/`minHeightRem` or no split) and the list in the column's right `widthRem`, at most
   *  `heightRem` tall. The panel keeps the notes' reserve above it and the walking control's corner beside it. */
  split: {
    minWidthRem: 48,
    panel: { shareMax: 0.5, maxRem: 40, minWidthRem: 18, minHeightRem: 14, gapRem: 0.5 },
    list: { widthRem: 24, heightRem: 22 },
  },
  /** The dock, across the foot above the bar: its padding around the list's strip and the text box's row. */
  dock: { padRem: 0.25 },
  /** The list: its header button (an icon, then list.heading's words) floated before its buttons, each row a
   *  2.75rem button and its 0.25rem margin; the dock's strip takes the rows its band gives, and one collapsed. */
  list: {
    fontRem: 1,
    padXRem: 0.5,
    rowRem: 2.75,
    gapRem: 0.25,
    iconRem: 1,
    iconGapRem: 0.25,
    rows: [{ belowRem: 36, n: 2 }] as readonly Band[],
  },
  /** The text box's row: its label over the text box, Send, and the talk button, never collapsed (FR-022); and the
   *  waiting status's line, in the column. */
  talk: {
    labelRem: 0.875,
    lineHeight: 1.5,
    gapRem: 0.125,
    rowRem: 2.75,
    rowGapRem: 0.25,
    inputMinRem: 6,
    buttonPadXRem: 0.75,
    statusRem: 1.25,
  },
  /** The conversation's log: a sheet above the dock in the dock layout, at most 4.75rem, shown once it holds a line.
   *  Spec 014: in the column, at rest, at most `restRem` where the window is at least `tallFromRem` tall, and
   *  `shortRestRem` below it (PD-7; D12), and scrolling inside. */
  log: { sheetMaxRem: 4.75, restRem: 8, shortRestRem: 5, tallFromRem: 56.25 },
  /** The stage's notes in the clear area's top left (the placeholder note and the stand-in line, both counted): their
   *  type, line height, padding, inset, and gap, room.css's `.room-notes` and `.room-note`, and the clear widths where
   *  their words take two lines. No sheet reaches into this reserve, so none covers them (FR-021; the review of
   *  60b51de4, finding 2); test/ui/hud-notes.test.ts holds it to the words. */
  notes: {
    fontRem: 0.75,
    lineHeight: 1.5,
    padYRem: 0.125,
    insetRem: 0.5,
    gapRem: 0.25,
    count: 2,
    lines: [{ belowRem: 27, n: 2 }] as readonly Band[],
    /** Spec 014: a note's widest words on one line, its padding and border included (the model: 25.99rem for
     *  `standin.note`): room.css holds each note to it, and it is the notes' reserve's width in the always-on
     *  interface's coverage. */
    maxRem: 26,
    /** Spec 014 (FR-054, FR-055; PD-18): the placeholder note's lines, which may hold `standin.note` and
     *  `standin.avatar` joined, wrapped at maxRem: two, and three where the clear area is under 27rem; the stand-in line
     *  keeps `lines`. */
    placeholderLines: [
      { belowRem: 27, n: 3 },
      { belowRem: Number.POSITIVE_INFINITY, n: 2 },
    ] as readonly Band[],
  },
} as const;

/** A part's count at a width in CSS pixels. */
function band(bands: readonly Band[], width: number, rem: number): number {
  for (const b of bands) if (width < b.belowRem * rem) return b.n;
  return 1;
}

/** The width the strip, the bar, and the dock lay their contents across: the window less its side safe areas. */
const across = (screen: { readonly w: number }, m: HudMetrics): number => screen.w - m.safe.left - m.safe.right;

/** The strip's lines at a window, by the table's bands. */
export function stripLines(screen: { readonly w: number }, metrics: HudMetrics = DEFAULT_METRICS): number {
  return band(HUD_PLACEMENTS.strip.lines, across(screen, metrics), metrics.rem);
}

/** The bar's rows at a window, by the table's bands. */
export function barRows(screen: { readonly w: number }, metrics: HudMetrics = DEFAULT_METRICS): number {
  return band(HUD_PLACEMENTS.bar.rows, across(screen, metrics), metrics.rem);
}

/** The dock's list rows at a window, open, by the table's bands. */
export function listRows(screen: { readonly w: number }, metrics: HudMetrics = DEFAULT_METRICS): number {
  return band(HUD_PLACEMENTS.list.rows, across(screen, metrics), metrics.rem);
}

/** The layout a window takes: the column layout where it is wider than tall and at least 32rem wide (PD-2). */
export function layoutFor(
  screen: { readonly w: number; readonly h: number },
  metrics: HudMetrics = DEFAULT_METRICS,
): HudLayout {
  return screen.w > screen.h && screen.w >= HUD_PLACEMENTS.columnMinWidthRem * metrics.rem ? "column" : "dock";
}

/** Each docked box at a window, a state, and the metrics, with the clear area they leave. */
export interface HudBoxes {
  readonly layout: HudLayout;
  readonly strip: Box;
  readonly bar: Box;
  /** The column, in the column layout; null in the dock layout. */
  readonly column: Box | null;
  /** The dock, in the dock layout; null in the column layout. */
  readonly dock: Box | null;
  readonly clear: Box;
}

/** The boxes the table gives a window: each docked panel's, its safe-area padding included, and the clear area. */
export function hudBoxes(
  screen: { readonly w: number; readonly h: number },
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
): HudBoxes {
  const t = HUD_PLACEMENTS;
  const { rem, safe } = metrics;
  const layout = layoutFor(screen, metrics);
  const stripH = stripLines(screen, metrics) * t.strip.fontRem * t.strip.lineHeight * rem + 2 * t.strip.padYRem * rem;
  const strip: Box = { x: 0, y: 0, w: screen.w, h: Math.max(safe.top + stripH, metrics.strip ?? 0) };
  const rows = barRows(screen, metrics);
  const barH = rows * t.bar.tileRem * rem + (rows - 1) * t.bar.gapRem * rem + 2 * t.bar.padRem * rem + safe.bottom;
  const bar: Box = { x: 0, y: screen.h - barH, w: screen.w, h: barH };
  if (layout === "column") {
    // Two fifths of the safe width, between 15rem and 28rem, and the right inset padded inside it, so a notched phone
    // held sideways keeps the stage its safe viewport gave it before spec 005 (FR-009, FR-054).
    const share = t.column.share * (screen.w - safe.left - safe.right);
    const width = Math.min(t.column.maxRem * rem, Math.max(t.column.minRem * rem, share));
    const columnW = width + safe.right;
    const column: Box = { x: screen.w - columnW, y: strip.h, w: columnW, h: screen.h - strip.h - bar.h };
    const clear: Box = { x: safe.left, y: strip.h, w: screen.w - safe.left - columnW, h: column.h };
    return { layout, strip, bar, column, dock: null, clear };
  }
  const listN = state.list === "collapsed" ? 1 : listRows(screen, metrics);
  const list = listN * (t.list.rowRem + t.list.gapRem) * rem;
  const talk = (t.talk.labelRem * t.talk.lineHeight + t.talk.gapRem + t.talk.rowRem) * rem;
  const dockH = 2 * t.dock.padRem * rem + list + talk;
  const dock: Box = { x: 0, y: bar.y - dockH, w: screen.w, h: dockH };
  const clear: Box = {
    x: safe.left,
    y: strip.h,
    w: screen.w - safe.left - safe.right,
    h: screen.h - strip.h - dockH - bar.h,
  };
  return { layout, strip, bar, column: null, dock, clear };
}

/** The clear area a window leaves: the window less the docked boxes and the safe areas (PD-7). */
export function clearArea(
  screen: { readonly w: number; readonly h: number },
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
): Box {
  return hudBoxes(screen, state, metrics).clear;
}

/** Whether the window holds its layout's HUD: at least 20rem wide, with a clear area of at least 304 × 196 (FR-007).
 *  False selects the stacked layout. */
export function fitsHud(
  screen: { readonly w: number; readonly h: number },
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
): boolean {
  const { minimum } = HUD_PLACEMENTS;
  if (screen.w < minimum.windowRem * metrics.rem) return false;
  const clear = clearArea(screen, state, metrics);
  return clear.w >= minimum.w && clear.h >= minimum.h;
}

/** The height the stage's notes take at the clear area's top, their insets above and below included: what no sheet may
 *  reach into (FR-021). */
export function notesReserve(clear: { readonly w: number }, rem = DEFAULT_METRICS.rem): number {
  const n = HUD_PLACEMENTS.notes;
  const height = (lines: number): number => lines * n.fontRem * n.lineHeight * rem + 2 * n.padYRem * rem;
  // Spec 014: the placeholder note by its own band, since it may say two things; the stand-in line by the notes'.
  const first = height(band(n.placeholderLines, clear.w, rem));
  const rest = height(band(n.lines, clear.w, rem));
  return 2 * n.insetRem * rem + first + (n.count - 1) * (rest + n.gapRem * rem);
}

/** The walking control's box (spec 008, FR-021; plan.md R-09): `.room-walk`'s width, height, and inset from the clear
 *  area's bottom-right corner, in rem, which room.css sets and test/room/stages.test.ts pins. */
export const WALK_CONTROL = { widthRem: 8, heightRem: 2.75, insetRem: 0.5 } as const;

/** The walking control's box in a clear area, in CSS pixels from its top left: what RG6 reserves in 3D, and the room's
 *  picker with it (spec 008, FR-021, FR-058). */
export function walkControlBox(clear: { readonly w: number; readonly h: number }, rem = DEFAULT_METRICS.rem): Rect {
  const [w, h, inset] = [WALK_CONTROL.widthRem * rem, WALK_CONTROL.heightRem * rem, WALK_CONTROL.insetRem * rem];
  return [clear.w - inset - w, clear.h - inset - h, w, h];
}

/** The HUD controls over the clear area, in its pixels, which RG6 reserves (FR-055): the walking control's box alone,
 *  every other control sitting in a docked panel outside the clear area. */
export function reservedBoxes(clear: { readonly w: number; readonly h: number }, rem = DEFAULT_METRICS.rem): Rect[] {
  return [walkControlBox(clear, rem)];
}

// ---- Spec 014: the compact boxes (FR-017 to FR-021; contracts/frame-area.md §1, §3) ----

/** The log's rest height in the column, in rem: `restRem` where the window is at least `tallFromRem` tall, and
 *  `shortRestRem` below it (PD-7; D12). */
export function logRestRem(
  screen: { readonly w: number; readonly h: number },
  metrics: HudMetrics = DEFAULT_METRICS,
): number {
  const t = HUD_PLACEMENTS.log;
  return screen.h >= t.tallFromRem * metrics.rem ? t.restRem : t.shortRestRem;
}

/** The column's content height at a window, in CSS pixels: its padding, the list's rows beside its header button by
 *  the column's width, the conversation's header row, the log at its rest height, the status line, and the text box's
 *  label and row (PD-5). */
export function columnContentHeight(
  screen: { readonly w: number; readonly h: number },
  metrics: HudMetrics = DEFAULT_METRICS,
  columnWidth: number,
): number {
  const t = HUD_PLACEMENTS;
  const rem = metrics.rem;
  const rows = band(t.column.listRows, columnWidth, rem);
  const row = (t.list.rowRem + t.list.gapRem) * rem;
  const talk = (t.talk.labelRem * t.talk.lineHeight + t.talk.gapRem + t.talk.rowRem) * rem;
  return (
    2 * t.column.padRem * rem + rows * row + row + logRestRem(screen, metrics) * rem + t.talk.statusRem * rem + talk
  );
}

/** The HUD boxes the visitor sees at rest at a window: the compact clusters of the column layout, or the dock layout's
 *  bands, and the walking control's box; `all` holds each once, in that order. */
export interface CompactBoxes {
  readonly layout: HudLayout;
  readonly strip: Box;
  readonly bar: Box;
  /** The column's compact box, in the column layout; null in the dock layout. */
  readonly column: Box | null;
  /** The dock, in the dock layout; null in the column layout. */
  readonly dock: Box | null;
  /** The walking control's box, in the window's pixels: since T053 (Amendment W19), at the column's head where
   *  `walkPlace` is "column"; else in the clear area's bottom-right corner, spec 008's place. */
  readonly walk: Box;
  /** Where the walking control sits: at the column's head, or in the stage's corner (spec 008's FR-021). */
  readonly walkPlace: "column" | "stage";
  readonly all: readonly Box[];
}

/** The compact boxes a window's table gives (contracts/frame-area.md §1): each inside its band. */
export function compactBoxes(
  screen: { readonly w: number; readonly h: number },
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
): CompactBoxes {
  const t = HUD_PLACEMENTS;
  const rem = metrics.rem;
  const bands = hudBoxes(screen, state, metrics);
  const [wx, wy, ww, wh] = walkControlBox(bands.clear, rem);
  const walk: Box = { x: bands.clear.x + wx, y: bands.clear.y + wy, w: ww, h: wh };
  if (bands.layout === "dock" || !bands.column) {
    const all = [bands.strip, bands.bar, ...(bands.dock ? [bands.dock] : []), walk];
    return {
      layout: bands.layout,
      strip: bands.strip,
      bar: bands.bar,
      column: null,
      dock: bands.dock,
      walk,
      walkPlace: "stage",
      all,
    };
  }
  const width = across(screen, metrics);
  const stripW = Math.min(t.strip.maxRem * rem, width);
  const strip: Box = { x: metrics.safe.left + (width - stripW) / 2, y: 0, w: stripW, h: bands.strip.h };
  const barW = Math.min(t.bar.maxRem * rem, width);
  const bar: Box = { x: screen.w - metrics.safe.right - barW, y: bands.bar.y, w: barW, h: bands.bar.h };
  const band = bands.column;
  const contentW = band.w - metrics.safe.right;
  const h = Math.min(band.h, columnContentHeight(screen, metrics, contentW));
  const column: Box = { x: band.x, y: band.y + band.h - h, w: band.w, h };
  // T053 (Amendment W19; the Author's answer of 2026-11-10, "Move the walk control (Recommended)"): where the column's
  // band has room above its content, the walking control sits at the column's head, at its right, a gap above it;
  // else in the clear area's corner, as spec 008 put it.
  const gap = t.column.walkGapRem * rem;
  if (h + gap + wh <= band.h) {
    const head: Box = { x: column.x + column.w - metrics.safe.right - gap - ww, y: column.y - gap - wh, w: ww, h: wh };
    return {
      layout: "column",
      strip,
      bar,
      column,
      dock: null,
      walk: head,
      walkPlace: "column",
      all: [strip, bar, column, head],
    };
  }
  return {
    layout: "column",
    strip,
    bar,
    column,
    dock: null,
    walk,
    walkPlace: "stage",
    all: [strip, bar, column, walk],
  };
}

/** The notes' reserve as a box at the clear area's top left: as wide as the notes' widest words and their inset, at
 *  most the clear area, as tall as `notesReserve`. */
export function notesBox(clear: Box, rem = DEFAULT_METRICS.rem): Box {
  const n = HUD_PLACEMENTS.notes;
  return {
    x: clear.x,
    y: clear.y,
    w: Math.min(clear.w, (n.maxRem + 2 * n.insetRem) * rem),
    h: notesReserve(clear, rem),
  };
}

/** The area a union of boxes covers, each overlap counted once: the plane cut at every box's edges into cells, each
 *  cell counted where a box holds it. */
export function unionArea(boxes: readonly Box[]): number {
  const xs = [...new Set(boxes.flatMap((b) => [b.x, b.x + b.w]))].sort((a, b) => a - b);
  const ys = [...new Set(boxes.flatMap((b) => [b.y, b.y + b.h]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const [x0, x1] = [xs[i] as number, xs[i + 1] as number];
    for (let j = 0; j + 1 < ys.length; j += 1) {
      const [y0, y1] = [ys[j] as number, ys[j + 1] as number];
      const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
      if (boxes.some((b) => cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h)) area += (x1 - x0) * (y1 - y0);
    }
  }
  return area;
}

/** The always-on interface's share of a window (FR-019; D7): its compact boxes in the opening state, the log at its
 *  rest height and the walking control included, and the notes' reserve, as one union, over the window's area. */
export function alwaysOnCoverage(
  screen: { readonly w: number; readonly h: number },
  metrics: HudMetrics = DEFAULT_METRICS,
): number {
  const c = compactBoxes(screen, OPENING, metrics);
  const clear = hudBoxes(screen, OPENING, metrics).clear;
  return unionArea([...c.all, notesBox(clear, metrics.rem)]) / (screen.w * screen.h);
}

// ---- Spec 018: the split layout (FR-001, FR-004; plan.md §2) ----

/** The split layout's boxes in a window's pixels: the panel open, its resting bar (the text box's row at its foot), and
 *  the list. */
export interface SplitBoxes {
  readonly panel: Box;
  readonly bar: Box;
  readonly list: Box;
}

/**
 * The split layout's boxes, or null where the window takes none: it is landscape, at least `split.minWidthRem` wide,
 * in the column layout, and its left half holds a panel (`panel.minWidthRem` by `panel.minHeightRem`) clear of the
 * notes' reserve and the walking control's corner. A refinement of the column layout, so the bands, the clear area, and
 * the compositor's checks are the column layout's, unchanged (plan.md §2).
 */
export function splitBoxes(
  screen: { readonly w: number; readonly h: number },
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
): SplitBoxes | null {
  const t = HUD_PLACEMENTS;
  const { rem, safe } = metrics;
  if (!(screen.w > screen.h) || screen.w < t.split.minWidthRem * rem) return null;
  const bands = hudBoxes(screen, state, metrics);
  if (bands.layout !== "column" || !bands.column || !fitsHud(screen, state, metrics)) return null;
  const { clear } = bands;
  const reserve = notesReserve(clear, rem);
  const p = t.split.panel;
  const walkLeft = clear.w - WALK_CONTROL.insetRem * rem - WALK_CONTROL.widthRem * rem - p.gapRem * rem;
  const width = Math.min(p.maxRem * rem, p.shareMax * screen.w - clear.x, walkLeft);
  const height = clear.h - reserve;
  if (width < p.minWidthRem * rem || height < p.minHeightRem * rem) return null;
  const panel: Box = { x: clear.x, y: clear.y + reserve, w: width, h: height };
  const talk = (t.talk.labelRem * t.talk.lineHeight + t.talk.gapRem + t.talk.rowRem) * rem + 2 * t.dock.padRem * rem;
  const bar: Box = { x: panel.x, y: panel.y + panel.h - talk, w: panel.w, h: talk };
  const listW = Math.min(t.split.list.widthRem * rem, bands.column.w - safe.right);
  const list: Box = {
    x: bands.column.x + bands.column.w - safe.right - listW,
    y: bands.column.y,
    w: listW,
    h: Math.min(bands.column.h, t.split.list.heightRem * rem),
  };
  return { panel, bar, list };
}
