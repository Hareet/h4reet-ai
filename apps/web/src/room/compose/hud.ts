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
  },
  /** The bar of controls at the foot: tiles of an icon over words, one row on every landscape screen of the sweep. */
  bar: {
    tileRem: 2.75,
    fontRem: 0.8125,
    tilePadXRem: 0.5,
    gapRem: 0.25,
    padRem: 0.25,
    rows: [{ belowRem: 35, n: 2 }] as readonly Band[],
  },
  /** The column, on the right between the strip and the bar: two fifths of the window, between 15rem and 28rem. */
  column: { share: 0.4, minRem: 15, maxRem: 28, padRem: 0.25 },
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
  /** The conversation's log: a sheet above the dock in the dock layout, at most 4.75rem, shown once it holds a line. */
  log: { sheetMaxRem: 4.75 },
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
  const lines = band(n.lines, clear.w, rem);
  const note = lines * n.fontRem * n.lineHeight * rem + 2 * n.padYRem * rem;
  return 2 * n.insetRem * rem + n.count * note + (n.count - 1) * n.gapRem * rem;
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
