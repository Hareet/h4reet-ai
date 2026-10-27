// The renderers' registry (spec 004; FR-005, FR-029, FR-031, FR-034; R-36): exactly the five renderers the closed
// vocabulary names, terminal, desktop session, neon, chalk, and sign, each pure. A renderer works on one region of a
// face: its layout gives the region's words, its text-copy lines (the words, and a badge in brackets), how long it
// types, and its smallest glyph, a cap height in the face's pixels; its draw gives the region's display list at a time
// into its typing, its final frame by default. A face's list is its renderers' lists over its background (words.ts).
// A new renderer is a new behaviour, made through the lifecycle, never data.
import type { RegionBox } from "../compose/layout";
import type { Grid } from "../compose/layout";
import type { Renderer } from "../compose/vocabulary";
import { chalk } from "./chalk";
import { desktopSession } from "./desktop-session";
import type { BadgeKind, Op } from "./display-list";
import { neon } from "./neon";
import { sign } from "./sign";
import { terminal } from "./terminal";

/** The typeface a region draws in: its family list as a font's family is written (the vendored family, then its
 *  fallback, or the fallback alone while the typeface is late), its weight, and its cap ratio, the compositor's. */
export interface Typeface {
  readonly family: string;
  readonly weight: number;
  readonly capRatio: number;
}

/** A sign's traced lettering, as room-data.json carries its outline (contracts/room-bundle.md §5). */
export interface OutlineData {
  readonly view_box: readonly [number, number, number, number];
  readonly cap_height: number;
  readonly advance: number;
  readonly paths: readonly string[];
}

/** What a renderer draws in one region of a face. */
export interface RegionInput {
  /** The region on its face, in the face's pixels. */
  readonly box: RegionBox;
  /** Its fixed grid (compose/layout.ts); null for a sign. */
  readonly grid: Grid | null;
  readonly typeface: Typeface;
  /** Its words, line by line: a block's drawn lines, the resume's titles, UI words, or a counter's reading. */
  readonly lines: readonly string[];
  /** Its badge, its kind and its word, or none. */
  readonly badge: { readonly kind: BadgeKind; readonly text: string } | null;
  /** A sign's outline; null for every other renderer. */
  readonly outline: OutlineData | null;
  /** A neon counter panel, drawn plain in the counters' typeface, rather than the neon word's tube. */
  readonly counter: boolean;
}

export interface RegionLayout {
  /** The words the region draws, in order. */
  readonly words: readonly string[];
  /** The text copy's lines: its words, then its badge in brackets (FR-034). */
  readonly copy: readonly string[];
  /** How long it types, in milliseconds; 0 for a renderer that doesn't type. */
  readonly typingMs: number;
  /** Its smallest glyph: the cap height in the face's pixels (FR-052). */
  readonly glyph: number;
}

export interface FaceRenderer {
  readonly id: Renderer;
  /** The colour behind its words, which a face's list fills first. */
  readonly background: string;
  layout(input: RegionInput): RegionLayout;
  /** Its display list `ms` into its typing; its final frame for Infinity, the default. */
  draw(input: RegionInput, ms?: number): Op[];
}

/** Exactly the five renderers, by name. */
export const REGISTRY: Readonly<Record<Renderer, FaceRenderer>> = Object.freeze({
  terminal,
  "desktop-session": desktopSession,
  neon,
  chalk,
  sign,
});
