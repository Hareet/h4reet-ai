// The renderers' fixed text grids (spec 004; FR-031, FR-033, FR-052; R-21, R-36; data-model.md §4.3;
// contracts/room-data-files.md §5.3): where a face's words go, shared by the compositor's checks (RT8's overflow, RG7's
// legibility) and the renderers, so the glyph size a check measures is the one drawn. A grid depends on its region and
// never on the words, so legibility can't change with a rewording, and words that overflow the grid are refused (RT8):
// the terminal's and the desktop session's columns and rows, the chalkboard's line slots, and the neon sign's word and
// counter panels with their maximum characters. A sign has no grid: its outline is fitted inside its region, keeping
// its aspect, centred. Lengths are in the face's own units, metres at the piece's scale 1, from its top left, y down.
// The screens' typing rate sits here too, so the time RT6 holds a monitor's script to is the time the screen types.
import type { Renderer } from "./vocabulary";

/** A region's rectangle on its face: `[x, y, w, h]`, fractions of the face from its top left (FR-017). */
export type RegionRect = readonly [number, number, number, number];

/** A region in the face's units, from the face's top left, y down. */
export interface RegionBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A region's grid, from the scene's face binding: `{cols, rows}`, `{rows}`, or `{chars}` by renderer. */
export type Grid =
  { readonly cols: number; readonly rows: number } | { readonly rows: number } | { readonly chars: number };

export type TextRenderer = Exclude<Renderer, "sign" | "print">;

/**
 * Each text renderer's line pitch and cell width, per em of its typeface. A terminal cell is 0.6 em wide, IBM Plex
 * Mono's advance; the desktop session and the neon sign count their columns and characters in the same cells, which a
 * proportional face's average fills; the chalkboard's lines are measured by their advance widths instead (RT8).
 */
export const GRID_METRICS = {
  terminal: { line: 1.25, advance: 0.6 },
  "desktop-session": { line: 1.35, advance: 0.6 },
  chalk: { line: 1.3 },
  neon: { line: 1.2, advance: 0.6 },
} as const satisfies Record<TextRenderer, { line: number; advance?: number }>;

/**
 * The screens' typing (FR-031): the terminal and the desktop session type their block's drawn lines once, a character
 * at a time at this rate, then hold. They must finish within TYPING_LIMIT_S, so a block that would take longer is
 * refused (RT6). A line break takes no time.
 */
export const TYPING_CHARS_PER_S = 60;
export const TYPING_LIMIT_S = 5;

/** How long a screen takes to type these lines, in seconds. */
export function typingSeconds(lines: readonly string[]): number {
  return lines.reduce((n, line) => n + [...line].length, 0) / TYPING_CHARS_PER_S;
}

export interface TextGrid {
  /** The glyph size, the typeface's em, in the face's units. */
  readonly em: number;
  /** The distance from one line to the next. */
  readonly pitch: number;
  readonly rows: number;
  /** Characters a line may hold; null on the chalkboard, whose lines are held to the region's width instead. */
  readonly cols: number | null;
}

/** A region's box on a face of this size. */
export function regionBox(rect: RegionRect, faceSize: readonly [number, number]): RegionBox {
  return { x: rect[0] * faceSize[0], y: rect[1] * faceSize[1], w: rect[2] * faceSize[0], h: rect[3] * faceSize[1] };
}

const count = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;

/**
 * The grid a text renderer lays its words on in a region: the glyph size its rows and columns give, the largest that
 * fits both the line pitch and the cell width. Null when the grid isn't the renderer's kind, or for a sign.
 */
export function textGrid(
  renderer: Renderer,
  grid: Grid | null,
  region: { readonly w: number; readonly h: number },
): TextGrid | null {
  if (renderer === "sign" || renderer === "print" || grid === null) return null;
  const g = grid as { cols?: unknown; rows?: unknown; chars?: unknown };
  switch (renderer) {
    case "terminal":
    case "desktop-session": {
      if (!count(g.cols) || !count(g.rows) || g.chars !== undefined) return null;
      const { line, advance } = GRID_METRICS[renderer];
      const pitch = region.h / g.rows;
      return { em: Math.min(pitch / line, region.w / (g.cols * advance)), pitch, rows: g.rows, cols: g.cols };
    }
    case "chalk": {
      if (!count(g.rows) || g.cols !== undefined || g.chars !== undefined) return null;
      const pitch = region.h / g.rows;
      return { em: pitch / GRID_METRICS.chalk.line, pitch, rows: g.rows, cols: null };
    }
    case "neon": {
      if (!count(g.chars) || g.cols !== undefined || g.rows !== undefined) return null;
      const { line, advance } = GRID_METRICS.neon;
      return { em: Math.min(region.h / line, region.w / (g.chars * advance)), pitch: region.h, rows: 1, cols: g.chars };
    }
  }
}

/** What fitting needs of a sign's outline (contracts/room-data-files.md §8), in its view box's units. */
export interface OutlineShape {
  /** `[min_x, min_y, width, height]`, y down, as in SVG. */
  readonly view_box: readonly [number, number, number, number];
  /** The lettering's advance width, which centres it; the view box's width when absent. */
  readonly advance?: number | undefined;
}

/** Where an outline sits in its region: a view-box point (u, v) lands at (x + u · scale, y + v · scale) on the face. */
export interface OutlineFit {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** A sign's outline fitted inside its region, keeping its aspect, centred by its advance and its view box's height. */
export function fitOutline(outline: OutlineShape, region: RegionBox): OutlineFit {
  const [minX, minY, , height] = outline.view_box;
  const width = outline.advance ?? outline.view_box[2];
  const scale = Math.min(region.w / width, region.h / height);
  return {
    scale,
    x: region.x + (region.w - width * scale) / 2 - minX * scale,
    y: region.y + (region.h - height * scale) / 2 - minY * scale,
  };
}
