// The chalkboard (spec 004; FR-033; R-36, R-38; Confirmation 7): a block's lines, or the published resume's section
// titles, in Patrick Hand, chalk on the slate: each line in its grid's slot, from the region's left edge, in order.
// Nothing types or moves. A pending line never reaches it: room-data.json holds none (contracts/room-bundle.md §5).
import { textGrid } from "../compose/layout";
import { badgeOps, copyOf } from "./display-list";
import type { Op } from "./display-list";
import type { FaceRenderer, RegionInput } from "./registry";
import { BASELINE } from "./terminal";

const CHALK = "#efefe6";

function grid(input: RegionInput): { em: number; pitch: number } {
  const g = textGrid("chalk", input.grid, input.box);
  return g ? { em: g.em, pitch: g.pitch } : { em: 0, pitch: 0 };
}

export const chalk: FaceRenderer = {
  id: "chalk",
  background: "#2f3b33",
  layout(input) {
    const { em } = grid(input);
    return {
      words: [...input.lines],
      copy: copyOf(input.lines, input.badge),
      typingMs: 0,
      glyph: input.typeface.capRatio * em,
    };
  },
  draw(input) {
    const { em, pitch } = grid(input);
    const { box, typeface } = input;
    const ops: Op[] = input.lines.map((text, row) => ({
      op: "text",
      x: box.x,
      y: box.y + pitch * (row + BASELINE),
      text,
      anchor: "start",
      size: em,
      family: typeface.family,
      weight: typeface.weight,
      color: CHALK,
      tube: null,
    }));
    return [...ops, ...badgeOps(input.badge, box, em, typeface.family)];
  },
};
