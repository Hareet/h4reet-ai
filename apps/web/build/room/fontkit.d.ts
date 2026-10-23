// fontkit 2.0.4, as far as build/room/typefaces.ts reads it (spec 004, T079; R-21): the package ships no types, so this
// declares only that use, never fontkit's whole API: a font made from its bytes; its kind, its units per em, its OS/2
// weight class, and its post table's fixed pitch; a glyph by code point, with its bounding box; and a text laid out,
// for its advance width (RT8).
declare module "fontkit" {
  /** A glyph's bounding box in font units, y up from the baseline. */
  export interface BBox {
    readonly maxY: number;
  }

  export interface Glyph {
    readonly bbox: BBox;
  }

  /** One font: TrueType or OpenType, WOFF, or WOFF2. */
  export interface Font {
    readonly type: "TTF" | "WOFF" | "WOFF2";
    readonly unitsPerEm: number;
    /** Undefined when the font has no OS/2 table, or fontkit can't decode it. */
    readonly "OS/2"?: { readonly usWeightClass: number } | undefined;
    /** Undefined when the font has no post table, or fontkit can't decode it. */
    readonly post?: { readonly isFixedPitch: number } | undefined;
    hasGlyphForCodePoint(codePoint: number): boolean;
    glyphForCodePoint(codePoint: number): Glyph;
    /** The text shaped with the font's default features, kerning among them. */
    layout(text: string): GlyphRun;
  }

  /** A shaped text: its total advance width, in font units. */
  export interface GlyphRun {
    readonly advanceWidth: number;
  }

  /** A TrueType collection: several fonts in one file. */
  export interface TrueTypeCollection {
    readonly type: "TTC";
  }

  /** A Mac OS resource-fork font file: several fonts in one file. */
  export interface DFont {
    readonly type: "DFont";
  }

  /** The font, or fonts, in `buffer`; throws when its format is none fontkit reads. */
  export function create(buffer: Uint8Array): Font | TrueTypeCollection | DFont;
}
