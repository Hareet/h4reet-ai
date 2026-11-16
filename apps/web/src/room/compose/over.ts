// The over-room flag (spec 029, group A; FR-001, FR-005; Q2; plan.md §R-A1): which HUD parts lie over the room. A part
// is over the room where its on-screen box and the room's on-screen box share some area, with no threshold; a part
// that only touches the room's edge isn't. The room's box is the whole stage while the walking view is on (the follow
// camera fills it); otherwise the wall box at the room's framing (spec 028's: the frame area's protector's `wall` at the
// area the re-fit took), or the frame area itself where no protector gives one. The parts' boxes are the ones the
// layout already has (compose/hud.ts's compactBoxes and wallBoxes), so nothing is measured in the DOM. Pure: no DOM,
// no clock; layout.ts writes the result as data-over="room" on each part's element, room.css and hud/split.css draw it.
import type { Box, WallBoxes } from "./hud";

/** The HUD's parts (spec 029's Terms): the conversation panel and the room's list in the split layout, the bar, the
 *  walking control, the "Eat" tile, the column layout's column, the dock, the dock's sheet, and the column's larger
 *  conversation. */
export type PartId = "talk" | "list" | "bar" | "walk" | "eat" | "column" | "dock" | "sheet" | "larger";

const area = (b: Box): boolean => b.w > 0 && b.h > 0;

/** Whether two boxes share some area: boxes that only touch don't. */
const meets = (a: Box, b: Box): boolean =>
  area(a) && area(b) && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The parts over the room: each whose box meets the room's box. None without a room's box. */
export function overRoom(parts: ReadonlyMap<PartId, Box>, room: Box | null): Set<PartId> {
  const out = new Set<PartId>();
  if (!room) return out;
  for (const [id, box] of parts) if (meets(box, room)) out.add(id);
  return out;
}

/** The room's box (Q2): the stage while walking; else the wall box at the room's framing, or the frame area. */
export function roomBox(o: {
  readonly walking: boolean;
  readonly stage: Box;
  readonly wall: Box | null;
  readonly frame: Box;
}): Box {
  return o.walking ? o.stage : (o.wall ?? o.frame);
}

/** What the parts' boxes are read from: the boxes applyHud already takes (layout.ts's HudApplied). */
export interface PartsInput {
  readonly layout: "column" | "dock" | "stacked";
  readonly split: WallBoxes | null;
  readonly compact: { readonly bar: Box; readonly column: Box | null; readonly walk: Box; readonly eat?: Box | null };
  /** The dock's height, which sits on the bar's top across the window (compose/hud.ts's hudBoxes). */
  readonly dock: number;
  readonly clear: Box;
  /** The notes' reserve at the clear area's top (compose/hud.ts's notesReserve). */
  readonly notes: number;
}

/**
 * Each part's box at a layout. The split layout: the panel, the list, the toolbar's bar, the walking control, and the
 * "Eat" tile, at wallBoxes's places. The column layout: the column, the bar's cluster, the walking control, the "Eat"
 * tile, and the larger conversation's reach; the dock layout: the dock, the bar, the walking control, the "Eat" tile,
 * and the sheet's reach. A sheet's reach is the clear area below the notes' reserve, where room.css opens the dock's
 * sheet and the column's larger view (their own height is their words', which no box holds). The stacked layout lays
 * nothing over the stage: no part.
 */
export function hudParts(p: PartsInput): Map<PartId, Box> {
  const parts = new Map<PartId, Box>();
  if (p.layout === "stacked") return parts;
  const eat = p.split ? p.split.eat : (p.compact.eat ?? null);
  if (p.split) {
    parts.set("talk", p.split.panel);
    parts.set("list", p.split.list);
    parts.set("bar", p.split.bar);
    parts.set("walk", p.split.walk);
    if (eat) parts.set("eat", eat);
    return parts;
  }
  const reach: Box = { x: p.clear.x, y: p.clear.y + p.notes, w: p.clear.w, h: p.clear.h - p.notes };
  if (p.layout === "column") {
    if (p.compact.column) parts.set("column", p.compact.column);
    parts.set("larger", reach);
  } else {
    const bar = p.compact.bar;
    parts.set("dock", { x: bar.x, y: bar.y - p.dock, w: bar.w, h: p.dock });
    parts.set("sheet", reach);
  }
  parts.set("bar", p.compact.bar);
  parts.set("walk", p.compact.walk);
  if (eat) parts.set("eat", eat);
  return parts;
}
