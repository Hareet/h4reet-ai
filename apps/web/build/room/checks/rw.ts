// RW, the walking view and the highlight (spec 008; FR-016, FR-058; plan.md §3.5): the family spec 008 adds after spec
// 004's nine, run last.
// - RW2: a look, the scene's or another, whose highlight's band and edge both give under 3:1 against one colour of its
//   palette (WCAG 2.2's 1.4.11, non-text contrast), so the border reads on the room's light surfaces and on its dark
//   ones; or whose band doesn't stand at least 9:1 lighter than its edge, 9·(L_edge + 0.05) at most L_band + 0.05, so
//   the two tones read as one border's band and its dark frame (the review of Phase 1; Q5's pair stands at 0.54 to
//   0.73). One finding a look, at its `highlight`, each part it fails in its reason: the palette colour the better of
//   the two tones gives least against, by its name where RT2 passed it, with the two contrasts; and the band's
//   contrast with its edge. Never a colour's value.
// - RW1: a scene whose visitor figure's footprint, at the walking block's radius, isn't on the walkable floor that
//   compose/floor.ts computes from the frame boxes (spec 008's FR-026, FR-058), so the walking view always starts
//   free. One finding, at the visitor placement's mount offset, naming the obstacle its feet stand in, where RT2 passed
//   its ID, or the bound they're past.
// A highlight colour RI4 refuses isn't judged here: RI4's finding is the one to fix. The report prints each look's
// lowest contrast through `highlightContrasts`, this rule's own measure.
import { clearanceOf, isWalkable, walkableFloor } from "../../../src/room/compose/floor";
import type { FloorEdge } from "../../../src/room/compose/floor";
import { origin } from "../../../src/room/compose/math";
import type { Loaded } from "../load";
import { HEX } from "../schema";
import type { LookFile } from "../schema";
import type { Context, Family } from "./family";
import { geometryOf } from "./rg";
import type { Geometry } from "./rg";

/** RW1's measure, which the report prints too: the visitor figure's start at the scene's walking radius, whether it's
 *  on the walkable floor, and its clearance, with the nearest edge. */
export interface FigureStart {
  /** The visitor placement's index in scene.yaml's placements. */
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly walkable: boolean;
  readonly clearance: { readonly distance: number; readonly edge: FloorEdge };
}

/** The visitor figure's start over the geometry's frame boxes; null without a geometry, a visitor, or its feet. */
export function figureStart(g: Geometry | null): FigureStart | null {
  if (!g) return null;
  const scene = g.scene.value;
  const index = scene.placements.findIndex((p) => p.role === "visitor");
  const visitor = scene.placements[index];
  const world = visitor && g.resolved.world.get(visitor.id);
  if (!visitor || !world) return null;
  const feet = origin(world);
  const placements = scene.placements.flatMap((p) => {
    const box = g.boxes.get(p.id);
    return box ? [{ id: p.id, root: p.mount === undefined, box }] : [];
  });
  const radius = scene.walking.radius_m;
  const floor = walkableFloor(placements, visitor.id, [feet[0], feet[2]], radius);
  if (!floor) return null;
  return {
    index,
    x: feet[0],
    z: feet[2],
    radius,
    walkable: isWalkable(floor, feet[0], feet[2]),
    clearance: clearanceOf(floor, feet[0], feet[2]),
  };
}

/** RW1: the visitor figure's start off the walkable floor. */
function start(ctx: Context): void {
  const g = geometryOf(ctx);
  const s = figureStart(g);
  if (!g || !s || s.walkable) return;
  const { edge } = s.clearance;
  const where =
    typeof edge === "object"
      ? ctx.printable(edge.obstacle)
        ? `its feet stand in ${edge.obstacle}'s footprint, grown by the radius`
        : "its feet stand in an obstacle's footprint, grown by the radius"
      : `its feet stand past the floor's ${edge === "front" ? "open front" : `${edge} wall`}, less the radius`;
  ctx.report(
    "RW1",
    g.scene.file,
    ctx.path("placements", s.index, "mount", "offset"),
    `the visitor figure's footprint, at the walking radius, isn't on the walkable floor: ${where}`,
  );
}

/** WCAG 2.2's least contrast for a border against what is around it (1.4.11). */
export const HIGHLIGHT_CONTRAST = 3;

/** The least the band stands lighter than its edge: (L_band + 0.05) / (L_edge + 0.05). */
export const TONES_CONTRAST = 9;

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
  /** How much lighter the band stands than its edge: (L_band + 0.05) / (L_edge + 0.05), under 1 where it's darker. */
  readonly tones: number;
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
    const tones = (luminance(band) + 0.05) / (luminance(edge) + 0.05);
    return [{ file, index, look: value.id, band, band_px: h.band_px, edge, edge_px: h.edge_px, lowest, tones }];
  });
}

/** A contrast as the reasons and the report print it: cut, not rounded, to two decimals, so under 3 never reads 3.00. */
export function contrastText(contrast: number): string {
  return `${(Math.floor(contrast * 100) / 100).toFixed(2)}:1`;
}

/** RW: RW1, the figure's start, then RW2 over every look. */
export const rw: Family = (ctx: Context) => {
  start(ctx);
  for (const c of highlightContrasts(ctx.room.looks)) {
    const parts: string[] = [];
    if (c.lowest !== null && c.lowest.contrast < HIGHLIGHT_CONTRAST) {
      const against = ctx.printable(c.lowest.against) ? `the palette colour ${c.lowest.against}` : "a palette colour";
      parts.push(
        `whose band and edge both give under 3:1 against ${against}: the band ` +
          `${contrastText(c.lowest.band)}, the edge ${contrastText(c.lowest.edge)}`,
      );
    }
    if (c.tones < TONES_CONTRAST) {
      const darker = c.tones < 1 ? ", the band the darker" : "";
      parts.push(
        `whose band doesn't stand 9:1 lighter than its edge: ${contrastText(Math.max(c.tones, 1 / c.tones))}${darker}`,
      );
    }
    if (parts.length > 0) ctx.report("RW2", c.file, "highlight", `a highlight ${parts.join("; and ")}`);
  }
};
