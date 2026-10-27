// The neon sign (spec 004; FR-046 to FR-049; R-36, R-38): its word, "Langfuse" in IBM Plex Sans Bold drawn as a stroked
// tube over a glow pass, the room's own neon lettering, with no logo, wordmark, or colours of Langfuse's; its second
// line; and its two counter panels, "this call" and "this visit", whose readings are plain IBM Plex Mono. Each region is
// one row, its words centred on it, their caps centred in its height. A counter reads "cost unavailable" while the
// room's live configuration has no turn route (FR-048; contracts/turn-cost.md §5); its amounts, which T266's channel
// brings, carry "test" in a drafts build and "Sample" from a fixture, as a badge beside the figure (FR-049).
import { textGrid } from "../compose/layout";
import { badgeOps, copyOf } from "./display-list";
import type { Op } from "./display-list";
import type { FaceRenderer, RegionInput } from "./registry";

/** The tube's colour and its glow's: warm, and nobody's brand colours. */
const TUBE = "#ffb08a";
const GLOW = "#ff6a3d";
const COUNTER = "#ffd2b8";

function grid(input: RegionInput): { em: number } {
  const g = textGrid("neon", input.grid, input.box);
  return { em: g ? g.em : 0 };
}

export const neon: FaceRenderer = {
  id: "neon",
  background: "#16110f",
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
    const { em } = grid(input);
    const { box, typeface } = input;
    const cap = typeface.capRatio * em;
    // One row (RT8): the caps centred in the region's height.
    const ops: Op[] = input.lines.slice(0, 1).map((text) => ({
      op: "text",
      x: box.x + box.w / 2,
      y: box.y + (box.h + cap) / 2,
      text,
      anchor: "middle",
      size: em,
      family: typeface.family,
      weight: typeface.weight,
      color: input.counter ? COUNTER : TUBE,
      tube: input.counter ? null : GLOW,
    }));
    return [...ops, ...badgeOps(input.badge, box, em, typeface.family)];
  },
};
