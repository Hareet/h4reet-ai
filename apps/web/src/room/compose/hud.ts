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
  /** Spec 018 (FR-001, FR-004; plan.md §2, R-1 to R-4): the split layout, a refinement of the column layout, chosen by
   *  FR-001's rule, not a width: the open conversation panel over the clear area's left, under the notes' reserve, at
   *  most `maxRem` wide and `shareMax` of the window, at least `minWidthRem` × `minHeightRem`, its title row `titleRem`
   *  tall; the rest row, the conversation at rest, in the bar's band at its left, at least `rest.minRem` wide (the
   *  model's finding, test/ui/hud-split-model.test.ts) and `rest.gapRem` short of the tile cluster; the list at the
   *  column band's top right, `list.widthRem` wide and at most `list.heightRem` tall; the walking control at the band's
   *  foot, `walkGapRem` in from its right and its foot; and the always-on interface at rest at most `coverMax`. */
  split: {
    panel: { shareMax: 0.5, maxRem: 40, minWidthRem: 18, minHeightRem: 14, titleRem: 2.75 },
    rest: { minRem: 40, gapRem: 0.25 },
    list: { widthRem: 24, heightRem: 22 },
    walkGapRem: 0.25,
    coverMax: 0.25,
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

/** Spec 024 (FR-012; plan.md §5.5, Q-R2a): the "Eat" tile's box, the walking control's size, a gap apart from it. */
export const EAT_CONTROL = {
  widthRem: WALK_CONTROL.widthRem,
  heightRem: WALK_CONTROL.heightRem,
  gapRem: 0.25,
} as const;

/** Spec 024's option on the HUD's boxes: `eat`, a 3D dinosaur visit's, where the "Eat" tile's box is reserved for the
 *  whole visit (Q-R2a). Off by default, every box as before. */
export interface EatOption {
  readonly eat?: boolean | undefined;
}

/** A box beside `walk`: on its left, a gap apart, at its height, where `within` holds it; else directly above it, a gap
 *  apart, where `within` holds that; else null. Every place the Eat box takes is this one rule (Q-R2a). */
function besideWalk(walk: Box, within: Box, rem: number): Box | null {
  const [w, h, gap] = [EAT_CONTROL.widthRem * rem, EAT_CONTROL.heightRem * rem, EAT_CONTROL.gapRem * rem];
  const left: Box = { x: walk.x - gap - w, y: walk.y, w, h };
  if (left.x >= within.x) return left;
  const above: Box = { x: walk.x + walk.w - w, y: walk.y - gap - h, w, h };
  return above.y >= within.y ? above : null;
}

/** The Eat box in a clear area, in its pixels: beside the walking control's box in the clear area's corner, as
 *  `compactBoxes` places it there (the stage's corner). Null where it fits neither beside nor above it. */
export function eatControlBox(
  clear: { readonly w: number; readonly h: number },
  rem = DEFAULT_METRICS.rem,
): Rect | null {
  const [x, y, w, h] = walkControlBox(clear, rem);
  const eat = besideWalk({ x, y, w, h }, { x: 0, y: 0, w: clear.w, h: clear.h }, rem);
  return eat ? [eat.x, eat.y, eat.w, eat.h] : null;
}

/** The HUD controls over the clear area, in its pixels, which RG6 reserves (FR-055): the walking control's box, every
 *  other control sitting in a docked panel outside the clear area; and with spec 024's option, the Eat box beside it. */
export function reservedBoxes(
  clear: { readonly w: number; readonly h: number },
  rem = DEFAULT_METRICS.rem,
  option: EatOption = {},
): Rect[] {
  const eat = option.eat ? eatControlBox(clear, rem) : null;
  return eat ? [walkControlBox(clear, rem), eat] : [walkControlBox(clear, rem)];
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
  /** Spec 018 (FR-004, R-4): the split layout's boxes where the window takes it, else null. Where it isn't null, `walk`
   *  is its walking control and `all` holds its boxes at rest; `column` is still the column's compact box, computed for
   *  spec 014's content case and not shown. */
  readonly split: SplitBoxes | null;
  /** Spec 024 (FR-012; plan.md §5.5): with the `eat` option, the "Eat" tile's box beside `walk` (besideWalk); else
   *  null. */
  readonly eat: Box | null;
  readonly all: readonly Box[];
}

/** The column layout's strip and the bar's tile cluster (spec 014, PD-6): the strip as wide as its words' bound, centred
 *  at the top, and the cluster at the foot's right. */
function columnClusters(
  screen: { readonly w: number; readonly h: number },
  bands: HudBoxes,
  metrics: HudMetrics,
): { strip: Box; bar: Box } {
  const t = HUD_PLACEMENTS;
  const rem = metrics.rem;
  const width = across(screen, metrics);
  const stripW = Math.min(t.strip.maxRem * rem, width);
  const strip: Box = { x: metrics.safe.left + (width - stripW) / 2, y: 0, w: stripW, h: bands.strip.h };
  const barW = Math.min(t.bar.maxRem * rem, width);
  const bar: Box = { x: screen.w - metrics.safe.right - barW, y: bands.bar.y, w: barW, h: bands.bar.h };
  return { strip, bar };
}

/** The compact boxes a window's table gives (contracts/frame-area.md §1): each inside its band. */
export function compactBoxes(
  screen: { readonly w: number; readonly h: number },
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
  option: EatOption = {},
): CompactBoxes {
  const t = HUD_PLACEMENTS;
  const rem = metrics.rem;
  const bands = hudBoxes(screen, state, metrics);
  const [wx, wy, ww, wh] = walkControlBox(bands.clear, rem);
  const walk: Box = { x: bands.clear.x + wx, y: bands.clear.y + wy, w: ww, h: wh };
  // Spec 024: in the stage's corner, the Eat box is eatControlBox's, in the window's pixels.
  const cornerRect = option.eat ? eatControlBox(bands.clear, rem) : null;
  const corner: Box | null = cornerRect
    ? { x: bands.clear.x + cornerRect[0], y: bands.clear.y + cornerRect[1], w: cornerRect[2], h: cornerRect[3] }
    : null;
  const withEat = (boxes: readonly Box[], eat: Box | null): Box[] => (eat ? [...boxes, eat] : [...boxes]);
  if (bands.layout === "dock" || !bands.column) {
    const all = withEat([bands.strip, bands.bar, ...(bands.dock ? [bands.dock] : []), walk], corner);
    return {
      layout: bands.layout,
      strip: bands.strip,
      bar: bands.bar,
      column: null,
      dock: bands.dock,
      walk,
      walkPlace: "stage",
      split: null,
      eat: corner,
      all,
    };
  }
  const { strip, bar } = columnClusters(screen, bands, metrics);
  const band = bands.column;
  const contentW = band.w - metrics.safe.right;
  const h = Math.min(band.h, columnContentHeight(screen, metrics, contentW));
  const column: Box = { x: band.x, y: band.y + band.h - h, w: band.w, h };
  // Spec 018 (FR-004, R-3, R-4): where the window takes the split layout, the column's content is moved out: the
  // boxes at rest are the strip, the cluster, the rest row, the list, and the walking control at the band's foot.
  const split = splitBoxes(screen, state, metrics, option);
  if (split)
    return {
      layout: "column",
      strip,
      bar,
      column,
      dock: null,
      walk: split.walk,
      walkPlace: "column",
      split,
      eat: split.eat,
      all: withEat([strip, bar, split.rest, split.list, split.walk], split.eat),
    };
  // T053 (Amendment W19; the Author's answer of 2026-11-10, "Move the walk control (Recommended)"): where the column's
  // band has room above its content, the walking control sits at the column's head, at its right, a gap above it;
  // else in the clear area's corner, as spec 008 put it.
  // Spec 024: with the option, the head takes the walking control only where the Eat box fits beside it there, inside
  // the band above the column's content; else both sit in the stage's corner.
  const gap = t.column.walkGapRem * rem;
  if (h + gap + wh <= band.h) {
    const head: Box = { x: column.x + column.w - metrics.safe.right - gap - ww, y: column.y - gap - wh, w: ww, h: wh };
    const headEat = option.eat ? besideWalk(head, { x: band.x, y: band.y, w: band.w, h: band.h }, rem) : null;
    if (!option.eat || headEat)
      return {
        layout: "column",
        strip,
        bar,
        column,
        dock: null,
        walk: head,
        walkPlace: "column",
        split: null,
        eat: headEat,
        all: withEat([strip, bar, column, head], headEat),
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
    split: null,
    eat: corner,
    all: withEat([strip, bar, column, walk], corner),
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

// ---- Spec 018: the split layout (FR-001, FR-004; plan.md §2, R-1 to R-4) ----

/** The split layout's boxes in a window's pixels. `panel` is the open conversation panel over the scene's left;
 *  `title` its title row, at its top (the frame is drawn below it); `rest` the conversation at rest, one row in the bar's
 *  band at its left; `frame` the panel with the rest row below it, the box the open panel's frame is drawn round; `list`
 *  the list at the column band's top right; and `walk` the walking control at the band's foot. */
export interface SplitBoxes {
  readonly panel: Box;
  readonly title: Box;
  readonly rest: Box;
  readonly frame: Box;
  readonly list: Box;
  readonly walk: Box;
  /** Spec 024: with the `eat` option, the "Eat" tile's box beside `walk` at the band's foot; else null. */
  readonly eat: Box | null;
}

/**
 * The split layout's boxes, or null where the window takes none. FR-001's rule, in plan.md §2's order: (a) the window
 * takes the column layout and holds its HUD; (b) the panel is at least `panel.minWidthRem` × `panel.minHeightRem`; (c)
 * the scene beside it is at least spec 005's floor; (d) the rest row is at least `rest.minRem` wide; and (e) the
 * always-on interface at rest covers at most `coverMax` of the window. A refinement of the column layout: the bands, the
 * clear area, and the stages are the column layout's, unchanged (D-I1, Q53); the open panel lies over the scene and is
 * not a box at rest (Q59).
 */
export function splitBoxes(
  screen: { readonly w: number; readonly h: number },
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
  option: EatOption = {},
): SplitBoxes | null {
  const T = HUD_PLACEMENTS;
  const t = T.split;
  const { rem, safe } = metrics;
  // (a)
  if (layoutFor(screen, metrics) !== "column" || !fitsHud(screen, state, metrics)) return null;
  const bands = hudBoxes(screen, state, metrics);
  const band = bands.column;
  if (!band) return null;
  const { clear } = bands;
  // (b) The panel: from the notes' reserve's foot to the clear area's foot, at most 40rem and half the window.
  const top = clear.y + notesReserve(clear, rem);
  const panel: Box = {
    x: clear.x,
    y: top,
    w: Math.min(t.panel.maxRem * rem, t.panel.shareMax * screen.w - clear.x),
    h: clear.y + clear.h - top,
  };
  if (panel.w < t.panel.minWidthRem * rem || panel.h < t.panel.minHeightRem * rem) return null;
  // (c) The scene beside the panel: the floor.
  if (clear.w - panel.w < T.minimum.w || clear.h < T.minimum.h) return null;
  // (d) The rest row: in the bar's band at its left, as wide as the panel, short of the tile cluster.
  const { strip, bar: cluster } = columnClusters(screen, bands, metrics);
  const rest: Box = {
    x: safe.left,
    y: bands.bar.y,
    w: Math.min(panel.w, cluster.x - t.rest.gapRem * rem - safe.left),
    h: bands.bar.h,
  };
  if (rest.w < t.rest.minRem * rem) return null;
  // The walking control at the band's foot, at its right (R-3); the list above it, at the band's top right.
  const gap = t.walkGapRem * rem;
  const [ww, wh] = [WALK_CONTROL.widthRem * rem, WALK_CONTROL.heightRem * rem];
  const walk: Box = { x: band.x + band.w - safe.right - gap - ww, y: band.y + band.h - gap - wh, w: ww, h: wh };
  const listW = Math.min(t.list.widthRem * rem, band.w - safe.right);
  const list: Box = {
    x: band.x + band.w - safe.right - listW,
    y: band.y,
    w: listW,
    h: Math.min(t.list.heightRem * rem, walk.y - gap - band.y),
  };
  // (e) At rest, at most a quarter of the window (Q58). Spec 024 (Q-R3b): judged as with the option off, the list at
  // its full height and no Eat box, so the option never changes where the split layout is taken.
  const cover = unionArea([strip, cluster, rest, list, walk, notesBox(clear, rem)]) / (screen.w * screen.h);
  if (cover > t.coverMax) return null;
  const title: Box = { x: panel.x, y: panel.y, w: panel.w, h: t.panel.titleRem * rem };
  const frame: Box = { x: panel.x, y: panel.y, w: panel.w, h: rest.y + rest.h - panel.y };
  // Spec 024: the Eat box beside the walking control in the band; where it sits above it, the list ends above it.
  const eat = option.eat ? besideWalk(walk, band, rem) : null;
  const shown = eat && eat.y < walk.y ? { ...list, h: Math.min(list.h, eat.y - gap - band.y) } : list;
  return { panel, title, rest, frame, list: shown, walk, eat };
}
