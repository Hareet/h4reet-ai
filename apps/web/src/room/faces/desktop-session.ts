// The desktop session (spec 004; FR-031; R-36, R-38): the monitor's right half, a Claude desktop session, in IBM Plex
// Sans: a conversation column, its turns the block's lines, each on a band of its own row, alternating as a
// conversation does. No logo, and no picture: product names are words in the lines, plain text (FR-031). It types once
// at the screens' rate, as the terminal does, and holds.
import { TYPING_CHARS_PER_S, textGrid, typingSeconds } from "../compose/layout";
import { badgeOps, copyOf, typedLines } from "./display-list";
import type { Op } from "./display-list";
import type { FaceRenderer, RegionInput } from "./registry";
import { BASELINE } from "./terminal";

const INK = "#1f2328";
/** The column behind the turns, and the two turns' bands. */
const COLUMN = "#ffffff";
const BANDS = ["#e8ecf2", "#dbe8fb"] as const;
/** The column's margin inside its region, as a share of the region's width. */
const MARGIN = 0.04;

function grid(input: RegionInput): { em: number; pitch: number } {
  const g = textGrid("desktop-session", input.grid, input.box);
  return g ? { em: g.em, pitch: g.pitch } : { em: 0, pitch: 0 };
}

export const desktopSession: FaceRenderer = {
  id: "desktop-session",
  background: "#f3f4f6",
  layout(input) {
    const { em } = grid(input);
    return {
      words: [...input.lines],
      copy: copyOf(input.lines, input.badge),
      typingMs: typingSeconds(input.lines) * 1000,
      glyph: input.typeface.capRatio * em,
    };
  },
  draw(input, ms = Infinity) {
    const { em, pitch } = grid(input);
    const { box, typeface } = input;
    const inset = box.w * MARGIN;
    const ops: Op[] = [{ op: "rect", x: box.x + inset, y: box.y, w: box.w - inset * 2, h: box.h, color: COLUMN }];
    const typed = typedLines(input.lines, ms, TYPING_CHARS_PER_S);
    typed.forEach((text, row) => {
      if (text === "") return;
      // A turn's band, then its words: the visitor's turns and the session's alternate down the column.
      ops.push({
        op: "rect",
        x: box.x + inset,
        y: box.y + pitch * row + pitch * 0.06,
        w: box.w - inset * 2,
        h: pitch * 0.88,
        color: BANDS[row % 2] ?? COLUMN,
      });
      ops.push({
        op: "text",
        x: box.x + inset,
        y: box.y + pitch * (row + BASELINE),
        text,
        anchor: "start",
        size: em,
        family: typeface.family,
        weight: typeface.weight,
        color: INK,
        tube: null,
      });
    });
    return [...ops, ...badgeOps(input.badge, box, em, typeface.family)];
  },
};
