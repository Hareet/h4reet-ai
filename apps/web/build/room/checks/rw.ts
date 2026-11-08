// RW, the walking view and the highlight (spec 008; FR-016, FR-058; plan.md §3.5): the family spec 008 adds after spec
// 004's nine, run last.
// - RW2: a look, the scene's or another, whose highlight's band and edge both give under 3:1 against one colour of its
//   palette (WCAG 2.2's 1.4.11, non-text contrast), so the border reads on the room's light surfaces and on its dark
//   ones. One finding a look, at its `highlight`, naming the palette colour the better of the two tones gives least
//   against, by its name where RT2 passed it, with the two contrasts; never a colour's value.
// - RW1, the visitor figure's start on the walkable floor, comes with the walking data (spec 008's T041).
// A highlight colour RI4 refuses isn't judged here: RI4's finding is the one to fix. The report prints each look's
// lowest contrast through `highlightContrasts`, this rule's own measure.
import type { Loaded } from "../load";
import { HEX } from "../schema";
import type { LookFile } from "../schema";
import type { Context, Family } from "./family";

/** WCAG 2.2's least contrast for a border against what is around it (1.4.11). */
export const HIGHLIGHT_CONTRAST = 3;

/** A #rrggbb colour's relative luminance (WCAG 2.2). */
export function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** The contrast ratio of two #rrggbb colours, 1 to 21 (WCAG 2.2). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A look's highlight resolved against its own palette: each colour #rrggbb, or null where RI4 refuses it; the edge
 *  the look's ink, its outlines' colour, where the look leaves it out (plan.md §3.2, §10). */
export interface ResolvedHighlight {
  readonly band: string | null;
  readonly band_px: number;
  readonly edge: string | null;
  readonly edge_px: number;
}

export function resolvedHighlight(look: LookFile): ResolvedHighlight {
  const resolve = (value: string): string | null =>
    HEX.test(value) ? value : Object.hasOwn(look.palette, value) ? (look.palette[value] as string) : null;
  const { band, band_px, edge, edge_px } = look.highlight;
  return { band: resolve(band), band_px, edge: resolve(edge ?? look.outlines.color), edge_px };
}

/** One look's highlight and its lowest contrast against its palette. */
export interface HighlightContrast {
  readonly file: string;
  /** Its place among the looks, in path order, which names it where RT2 refused its name. */
  readonly index: number;
  readonly look: string;
  readonly band: string;
  readonly band_px: number;
  readonly edge: string;
  readonly edge_px: number;
  /** Over the palette's colours, the least of the better of the two tones' contrasts, the colour's name, and each
   *  tone's contrast against it; null for an empty palette. */
  readonly lowest: {
    readonly contrast: number;
    readonly against: string;
    readonly band: number;
    readonly edge: number;
  } | null;
}

/** Each look's highlight with its lowest contrast, in the looks' order; a look whose highlight holds a colour RI4
 *  refuses is left out. */
export function highlightContrasts(looks: readonly Loaded<LookFile>[]): HighlightContrast[] {
  return looks.flatMap(({ file, value }, index) => {
    const h = resolvedHighlight(value);
    const { band, edge } = h;
    if (band === null || edge === null) return [];
    let lowest: HighlightContrast["lowest"] = null;
    for (const [name, colour] of Object.entries(value.palette)) {
      const [b, e] = [contrastRatio(band, colour), contrastRatio(edge, colour)];
      const better = Math.max(b, e);
      if (lowest === null || better < lowest.contrast) lowest = { contrast: better, against: name, band: b, edge: e };
    }
    return [{ file, index, look: value.id, band, band_px: h.band_px, edge, edge_px: h.edge_px, lowest }];
  });
}

/** A contrast as the reasons and the report print it: cut, not rounded, to two decimals, so under 3 never reads 3.00. */
export function contrastText(contrast: number): string {
  return `${(Math.floor(contrast * 100) / 100).toFixed(2)}:1`;
}

/** RW: RW2 over every look (RW1 joins with the walking data). */
export const rw: Family = (ctx: Context) => {
  for (const c of highlightContrasts(ctx.room.looks)) {
    if (c.lowest === null || c.lowest.contrast >= HIGHLIGHT_CONTRAST) continue;
    const against = ctx.printable(c.lowest.against) ? `the palette colour ${c.lowest.against}` : "a palette colour";
    ctx.report(
      "RW2",
      c.file,
      "highlight",
      `a highlight whose band and edge both give under 3:1 against ${against}: the band ` +
        `${contrastText(c.lowest.band)}, the edge ${contrastText(c.lowest.edge)}`,
    );
  }
};
