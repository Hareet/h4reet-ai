// A desk sign's lettering (spec 004; FR-032, FR-052; R-36): its approved outline's paths, fitted inside its region
// keeping their aspect and centred by the lettering's advance (compose/layout.ts's fitOutline, the fit RG7 measures),
// filled in the sign's ink. Its words are the outline's, exactly as the Author wrote them, which the text copy says.
// Its smallest glyph is the outline's cap height at the fitted scale.
import { fitOutline } from "../compose/layout";
import { badgeOps, copyOf } from "./display-list";
import type { Op } from "./display-list";
import type { FaceRenderer, RegionInput } from "./registry";

const INK = "#1a1a1a";

/** The outline's fit in its region; a scale of 0 without an outline. */
function fit(input: RegionInput): { scale: number; x: number; y: number } {
  return input.outline ? fitOutline(input.outline, input.box) : { scale: 0, x: 0, y: 0 };
}

const wordsOf = (input: RegionInput): string[] => (input.outline ? input.lines.slice(0, 1) : []);

export const sign: FaceRenderer = {
  id: "sign",
  background: "#efe6d2",
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
    // The badge's size follows the lettering's cap height, as a text renderer's follows its em.
    const em = (input.outline.cap_height * scale) / Math.max(input.typeface.capRatio, 0.5);
    return [...ops, ...badgeOps(input.badge, input.box, em, input.typeface.family)];
  },
};
