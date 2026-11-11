// The twin's shirt's lettering (spec 016; FR-036, FR-037; plan.md R-12; Amendment M18; contracts/twin-data.md §3): an
// approved outline's paths, fitted inside its region keeping their aspect and centred by the lettering's advance
// (compose/layout.ts's fitOutline, the fit the sign's lettering takes), filled #000000, on a canvas cleared to
// transparent, with no background, so the face's material, given an alpha cut-off, shows the shirt around the letters;
// a drafts build's badge in the same ink. Its words are the outline's, exactly as the Author wrote them, which "Around
// the room" says under the face's label (FR-040).
import { fitOutline } from "../compose/layout";
import { badgeOps, copyOf } from "./display-list";
import type { Op } from "./display-list";
import type { FaceRenderer, RegionInput } from "./registry";

const INK = "#000000";

/** The outline's fit in its region; a scale of 0 without an outline. */
function fit(input: RegionInput): { scale: number; x: number; y: number } {
  return input.outline ? fitOutline(input.outline, input.box) : { scale: 0, x: 0, y: 0 };
}

const wordsOf = (input: RegionInput): string[] => (input.outline ? input.lines.slice(0, 1) : []);

export const print: FaceRenderer = {
  id: "print",
  // No background: the canvas is cleared, so every pixel outside the ink is transparent (raster.ts).
  background: "transparent",
  layout(input) {
    const words = wordsOf(input);
    return {
      words,
      copy: copyOf(words, input.badge),
      typingMs: 0,
      glyph: (input.outline?.cap_height ?? 0) * fit(input).scale,
    };
  },
  draw(input) {
    if (!input.outline) return [];
    const { scale, x, y } = fit(input);
    const ops: Op[] = [
      {
        op: "path",
        paths: [...input.outline.paths],
        matrix: [scale, 0, 0, scale, x, y],
        color: INK,
        words: wordsOf(input)[0] ?? "",
      },
    ];
    // The draft's badge, its size following the lettering's cap height, as the sign's does.
    const em = (input.outline.cap_height * scale) / Math.max(input.typeface.capRatio, 0.5);
    return [...ops, ...badgeOps(input.badge, input.box, em, input.typeface.family)];
  },
};
