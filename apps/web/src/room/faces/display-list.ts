// The live faces' display lists (spec 004; FR-005, FR-029, FR-034; R-36): what a renderer draws, as data, so the
// Canvas2D backend (raster.ts, in the 3D chunk) and the attribute-only SVG backend (svg.ts, the 2D room's) draw the
// same thing, and the text copy reads the same words. Lengths are in the face's own pixels, its catalog `px`, from its
// top left, y down; colours are `#rrggbb`. A text run never wraps or measures: room text arrives as lines, and each
// renderer's grid (compose/layout.ts) places them. Types and one reader only, so this costs the entry chunk nothing.
import type { Matrix2D } from "../compose/bundle";

/** Where a text run stands on its point: SVG's text-anchor, Canvas2D's textAlign (`middle` is its `center`). */
export type Anchor = "start" | "middle" | "end";

/** A badge's kind: a draft's "Draft" (FR-030), a fixture's "Sample", and a drafts build's amount "test" (FR-049). */
export type BadgeKind = "draft" | "sample" | "test";

/** One drawing operation. */
export type Op =
  /** The whole face in one colour. */
  | { readonly op: "fill"; readonly color: string }
  | {
      readonly op: "rect";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly color: string;
    }
  /** A line of words at its baseline, filled in its colour. With `tube`, the neon word instead: its letters' outlines
   *  stroked as a tube in its colour over a glow pass in `tube`'s, two runs each backend draws (R-38). */
  | {
      readonly op: "text";
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly anchor: Anchor;
      readonly size: number;
      readonly family: string;
      readonly weight: number;
      readonly color: string;
      readonly tube: string | null;
    }
  /** A sign's traced lettering: its outline's paths at a matrix from the view box into the face, filled; `words` are
   *  what the paths spell, its outline's words, which the text copy says (FR-032, FR-034). */
  | {
      readonly op: "path";
      readonly paths: readonly string[];
      readonly matrix: Matrix2D;
      readonly color: string;
      readonly words: string;
    }
  /** A badge beside the words: its plate and its word, a UI word, in its own small type. */
  | {
      readonly op: "badge";
      readonly kind: BadgeKind;
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly anchor: Anchor;
      readonly size: number;
      readonly family: string;
    };

/** A face's drawing: its size in its own pixels, and its operations in order, back to front. */
export interface DisplayList {
  readonly size: readonly [number, number];
  readonly ops: readonly Op[];
}

/** A badge as the text copy says it: in brackets (contracts/turn-cost.md §5). */
export const bracketed = (text: string): string => `[${text}]`;

/** The words a list draws, in its order: each text run's, each sign's outline words, and each badge in brackets. The
 *  text copy says exactly these (FR-034). */
export function drawnWords(ops: readonly Op[]): string[] {
  const out: string[] = [];
  for (const op of ops) {
    if (op.op === "text") out.push(op.text);
    else if (op.op === "path") out.push(op.words);
    else if (op.op === "badge") out.push(bracketed(op.text));
  }
  return out;
}

/** A badge's plate around its word, in the face's pixels: its word's box, from its size, grown by a margin. The two
 *  backends draw the same plate, since neither measures text. */
export function badgePlate(op: Extract<Op, { op: "badge" }>): { x: number; y: number; w: number; h: number } {
  const w = op.text.length * op.size * BADGE_ADVANCE + op.size * BADGE_PAD * 2;
  const h = op.size * (1 + BADGE_PAD * 2);
  const right = op.anchor === "end" ? op.x + op.size * BADGE_PAD : op.anchor === "middle" ? op.x + w / 2 : op.x + w;
  return { x: right - w, y: op.y - op.size * (1 + BADGE_PAD) + op.size * 0.2, w, h };
}

/** A badge's word's width per character, in ems: a generous average, so its plate holds it in any face. */
const BADGE_ADVANCE = 0.62;
/** The margin around a badge's word, in ems. */
const BADGE_PAD = 0.3;
/** A badge's plate and its word. */
export const BADGE_COLOURS = { plate: "#ffd54f", ink: "#1a1a1a" } as const;

/** The neon word's tube, two strokes of its letters' outlines, no fill: the glow pass, wide, at an opacity (and, on a
 *  canvas, blurred), then the tube, in ems of its size (R-38). */
export const TUBE = { glow: 0.22, stroke: 0.07, opacity: 0.45, blur: 0.35 } as const;

// ---- What the renderers share ----

/** The lines as typed `ms` into their typing, at the screens' rate (compose/layout.ts), a line break taking no time:
 *  each line whole, cut, or not yet begun (empty). Every line whole from the end of the typing on. */
export function typedLines(lines: readonly string[], ms: number, charsPerS: number): string[] {
  let left = ms === Infinity ? Infinity : Math.max(0, Math.floor((ms * charsPerS) / 1000 + 1e-9));
  return lines.map((line) => {
    const chars = [...line];
    const shown = chars.slice(0, Math.min(chars.length, left)).join("");
    left = Math.max(0, left - chars.length);
    return shown;
  });
}

/** A region's badge, at its top right, in its typeface at a share of its glyph size; none without one. */
export function badgeOps(
  badge: { readonly kind: BadgeKind; readonly text: string } | null,
  box: { readonly x: number; readonly y: number; readonly w: number },
  em: number,
  family: string,
): Op[] {
  if (badge === null) return [];
  const size = Math.max(1, em * 0.5);
  return [
    {
      op: "badge",
      kind: badge.kind,
      text: badge.text,
      x: box.x + box.w - size * 0.4,
      y: box.y + size * 1.4,
      anchor: "end",
      size,
      family,
    },
  ];
}

/** A region's text-copy lines: its words, then its badge in brackets. */
export function copyOf(words: readonly string[], badge: { readonly text: string } | null): string[] {
  return badge === null ? [...words] : [...words, bracketed(badge.text)];
}
