// The right column's two halves (spec 030, group A; FR-002 to FR-004; Q3, Q4; plan.md §R-A2): the top half, the slice,
// and the bottom half, from the boxes the layout already has (compose/hud.ts's compactBoxes and wallBoxes), so nothing
// is measured in the DOM. The split layout: the list on top, the tiles' block (the bar's tiles, the walking control,
// and "Eat") below, the slice `wall.sliceRem` at the right side's scale between them. The column layout: the column on
// top, the bar's cluster below (the walking control at the column's head, spec 014's W19, stands outside both); the
// dock: the dock on top, the bar below; the slice `sliceRem` between each. The stacked layout lays nothing over the
// stage: no halves. Pure: no DOM, no clock; layout.ts places the bottom half's element and marks each half with
// data-half, room.css and hud/split.css draw them.
import type { Box, CompactBoxes } from "./hud";

/** The halves and the slice between them, in the window's pixels. */
export interface Halves {
  readonly top: Box;
  readonly bottom: Box;
  readonly slice: Box;
}

/** What the halves are read from: compactBoxes's, the stacked layout besides. */
export type HalvesInput = Pick<CompactBoxes, "split" | "column" | "dock" | "bar"> & {
  readonly layout: CompactBoxes["layout"] | "stacked";
};

/** The slice between a top box and a bottom box below it: their shared width, from the top's foot to the bottom's top. */
function between(top: Box, bottom: Box): Box {
  const x = Math.max(top.x, bottom.x);
  const right = Math.min(top.x + top.w, bottom.x + bottom.w);
  const y = top.y + top.h;
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom.y - y) };
}

/** The right column's halves at a layout, or null in the stacked layout. */
export function halves(c: HalvesInput): Halves | null {
  if (c.layout === "stacked") return null;
  if (c.split) return { top: c.split.list, bottom: c.split.tiles, slice: c.split.slice };
  const top = c.layout === "column" ? c.column : c.dock;
  if (!top) return null;
  return { top, bottom: c.bar, slice: between(top, c.bar) };
}
