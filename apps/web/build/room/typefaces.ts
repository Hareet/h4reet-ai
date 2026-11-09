// The room's typefaces (spec 004; FR-052; RT10; R-21, R-38; data-model.md §7.2, §10.1; contracts/room-data-files.md
// §10, RT10, RG7; contracts/room-bundle.md §3.1): each look's families, read from apps/web/fonts/ through the
// compositor's tree, every file of a family only after its SHA-256 matched fonts.lock (schema 2), and the index's
// typefaces[], so the room and the lookdev page compute RG7's glyph heights as the compositor does.
//
// A look names a family and a weight for each typeface use (§10). The family must be one fonts.lock vendors with `room`
// in its uses, and the weight one of its fonts', as fontkit reads a font's OS/2 weight class. The use's cap ratio is
// that font's: the smallest top (`bbox.maxY`) of a glyph over A to Z and 0 to 9, over the font's units per em. Its
// fallback, the generic family a face draws while the typeface is late (FR-061), is `monospace` for a font whose post
// table marks it fixed-pitch, so a grid's columns hold, and `sans-serif` for any other.
//
// Every problem is RT10's, returned as data for the RT family to report, never thrown: fonts.lock absent or not schema
// 2, and a vendored file absent, off its digest, or not a font fontkit can measure, each once at its file; a look's
// family that fonts.lock doesn't vendor for the room, and a weight it has no file at, or two, at the look's
// `typefaces.<use>`. No reason holds a family's name. A look's typefaces[] is null while a finding stands on a family
// it names. `readFaces` also gives each use's advance widths, where its font was read, which RT8 holds a chalk line
// and a neon word to. Pure but for the tree: no clock, environment variable, or network.
import { createHash } from "node:crypto";

import { create } from "fontkit";

import type { Look, RoomIndex } from "../../src/room/compose/bundle";
import { TYPEFACE_USES } from "../../src/room/compose/vocabulary";
import type { TypefaceUse } from "../../src/room/compose/vocabulary";
import { parseFontsLock } from "../pdf";
import type { FontsLock } from "../pdf";

const FONTS = "apps/web/fonts";
const LOCK = `${FONTS}/fonts.lock`;

/** The compositor's tree (contracts/room-bundle.md §1), of which this module needs only `read`: a repository-relative
 * path's bytes, or null when it's absent. */
export interface TreeReader {
  read(path: string): Uint8Array | null;
}

/** A look's file, and its `typefaces` map as the schema read it (contracts/room-data-files.md §10). */
export interface LookFonts {
  readonly file: string;
  readonly typefaces: Look["typefaces"];
}

/** One entry of the index's `typefaces[]` (contracts/room-bundle.md §3.1). */
export type Typeface = RoomIndex["typefaces"][number];

/** RT10, which the RT family reports as `RT10 <file>:<path>: <reason>` (contracts/room-data-files.md §14). */
export interface TypefaceFinding {
  readonly rule: "RT10";
  readonly file: string;
  readonly path: string;
  readonly reason: string;
}

export interface Typefaces {
  /** Each look's typefaces[], in the order given: one per use, in the vocabulary's order, or null while a finding
   * stands on a family the look names. */
  readonly looks: readonly { readonly file: string; readonly typefaces: readonly Typeface[] | null }[];
  /** Each finding once. */
  readonly findings: readonly TypefaceFinding[];
}

/** readTypefaces's reading, with the fonts kept for their advance widths (RT8). */
export interface Faces extends Typefaces {
  /** A text's advance width in ems, laid out in the font a look names for a use, kerning included; null where that
   * font wasn't read, or fontkit can't lay the text out. */
  advance(look: string, use: TypefaceUse, text: string): number | null;
}

const REASON = {
  lockAbsent: "absent, so no typeface is vendored",
  lockShape: "not fonts.lock's schema 2 (data-model.md §7.2), so no typeface is vendored",
  fileAbsent: "absent, though fonts.lock vendors it",
  fileDigest: "its SHA-256 differs from fonts.lock's",
  unmeasurable: "not one font with a weight and a glyph for each of A to Z and 0 to 9, as fontkit reads it",
  noFamily: "no family of that name in fonts.lock",
  notForRoom: "fonts.lock doesn't vendor that family for the room",
  twoFiles: "two vendored files of that family at that weight",
} as const;

/** RT10's reason for a weight a family has no font at, naming the weights it has: "400", "400 and 700", or "300, 400,
 * and 700". */
function noWeight(fonts: readonly { readonly weight: number }[]): string {
  const words = [...new Set(fonts.map((f) => f.weight))].sort((a, b) => a - b).map(String);
  const has = words.length <= 2 ? words.join(" and ") : `${words.slice(0, -1).join(", ")}, and ${words.at(-1) ?? ""}`;
  return `no vendored file of that family at that weight${words.length > 0 ? ` (fonts.lock vendors it at ${has})` : ""}`;
}

/** A file fontkit reads as a font; a family's other files, its license, are only checked against their digests. */
const FONT_FILE = /\.(?:woff2?|ttf|otf)$/i;

/** The capitals and digits whose glyphs' tops give a cap ratio. */
const CAPS_AND_DIGITS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].map((c) => c.charCodeAt(0));

/** What a font gives the index, and its advance widths. */
interface Measured {
  readonly weight: number;
  readonly capRatio: number;
  readonly fixedPitch: boolean;
  /** A text's advance width in ems, or null when fontkit can't lay it out. */
  readonly advance: (text: string) => number | null;
}

/** A vendored file as read: sound when present, on its digest, and, for a font, measured. */
interface Read {
  readonly sound: boolean;
  readonly font: Measured | null;
}

/** A font's weight class, cap ratio, and pitch as fontkit reads them, or null for a file that isn't one font with a
 * weight, a units per em, and a glyph for each capital and digit. Any throw from fontkit is the file's, not the
 * build's. */
function measure(bytes: Uint8Array): Measured | null {
  try {
    const font = create(bytes);
    if (font.type === "TTC" || font.type === "DFont") return null;
    const weight = font["OS/2"]?.usWeightClass;
    if (weight === undefined || !Number.isInteger(weight) || !(font.unitsPerEm > 0)) return null;
    let top = Infinity;
    for (const code of CAPS_AND_DIGITS) {
      if (!font.hasGlyphForCodePoint(code)) return null;
      top = Math.min(top, font.glyphForCodePoint(code).bbox.maxY);
    }
    const capRatio = top / font.unitsPerEm;
    if (!Number.isFinite(capRatio) || capRatio <= 0) return null;
    const advance = (text: string): number | null => {
      try {
        const ems = font.layout(text).advanceWidth / font.unitsPerEm;
        return Number.isFinite(ems) ? ems : null;
      } catch {
        return null;
      }
    };
    return { weight, capRatio, fixedPitch: (font.post?.isFixedPitch ?? 0) !== 0, advance };
  } catch {
    return null;
  }
}

/** Each font file's measure, by its SHA-256, made once: a measure is a function of the file's bytes alone, and every
 * compose reads the same few files, so no result depends on what was read before. */
const MEASURED = new Map<string, Measured | null>();

function measureOnce(bytes: Uint8Array, sha256: string): Measured | null {
  if (!MEASURED.has(sha256)) MEASURED.set(sha256, measure(bytes));
  return MEASURED.get(sha256) ?? null;
}

/** Each look's typefaces from the fonts the tree holds, and RT10's findings (the module's header gives the rules). */
export function readTypefaces(tree: TreeReader, looks: readonly LookFonts[]): Typefaces {
  const { looks: read, findings } = readFaces(tree, looks);
  return { looks: read, findings };
}

/** readTypefaces's reading, with each use's advance widths where its font was read. */
export function readFaces(tree: TreeReader, looks: readonly LookFonts[]): Faces {
  const findings: TypefaceFinding[] = [];
  const refuse = (file: string, path: string, reason: string): void => {
    findings.push({ rule: "RT10", file, path, reason });
  };
  const unread = (): Faces => ({
    looks: looks.map((look) => ({ file: look.file, typefaces: null })),
    findings,
    advance: () => null,
  });

  const bytes = tree.read(LOCK);
  if (bytes === null) {
    refuse(LOCK, "-", REASON.lockAbsent);
    return unread();
  }
  let lock: FontsLock;
  try {
    // A byte-order mark is kept, so the lock's JSON refuses it here as readFontsLock's read does.
    lock = parseFontsLock(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes));
  } catch {
    refuse(LOCK, "-", REASON.lockShape);
    return unread();
  }

  // Each file of each family a look names and fonts.lock gives the room, read once, a file two families share
  // included: one that's absent, or off its digest, is refused before anything reads it as a font.
  const files = new Map<string, Read>();
  const fileOf = (name: string, sha256: string): Read => {
    const known = files.get(name);
    if (known) return known;
    const path = `${FONTS}/${name}`;
    const data = tree.read(path);
    let read: Read = { sound: false, font: null };
    if (data === null) refuse(path, "-", REASON.fileAbsent);
    else if (createHash("sha256").update(data).digest("hex") !== sha256) refuse(path, "-", REASON.fileDigest);
    else if (!FONT_FILE.test(name)) read = { sound: true, font: null };
    else {
      const font = measureOnce(data, sha256);
      if (font === null) refuse(path, "-", REASON.unmeasurable);
      read = { sound: font !== null, font };
    }
    files.set(name, read);
    return read;
  };
  const named = new Set(looks.flatMap((look) => TYPEFACE_USES.map((use) => look.typefaces[use].family)));
  const vendored = new Map<string, { sound: boolean; fonts: Measured[] }>();
  for (const family of lock.families) {
    if (!named.has(family.family) || !family.uses.includes("room")) continue;
    const read = Object.entries(family.files).map(([name, entry]) => fileOf(name, entry.sha256));
    vendored.set(family.family, {
      sound: read.every((r) => r.sound),
      fonts: read.flatMap((r) => (r.font ? [r.font] : [])),
    });
  }

  /** Each look's font for each use it resolved, by the look's file and the use. */
  const resolved = new Map<string, Measured>();
  const out = looks.map((look) => {
    const typefaces: Typeface[] = [];
    let whole = true;
    for (const use of TYPEFACE_USES) {
      const { family, weight } = look.typefaces[use];
      const at = `typefaces.${use}`;
      const room = vendored.get(family);
      if (!room) {
        const known = lock.families.some((f) => f.family === family);
        refuse(look.file, `${at}.family`, known ? REASON.notForRoom : REASON.noFamily);
        whole = false;
        continue;
      }
      const fonts = room.fonts.filter((f) => f.weight === weight);
      const font = fonts.length === 1 ? fonts[0] : undefined;
      if (fonts.length > 1) refuse(look.file, `${at}.weight`, REASON.twoFiles);
      // A file refused unread may be the font at this weight: its own finding stands for the look's.
      if (fonts.length === 0 && room.sound) refuse(look.file, `${at}.weight`, noWeight(room.fonts));
      if (!font || !room.sound) {
        whole = false;
        continue;
      }
      const fallback = font.fixedPitch ? "monospace" : "sans-serif";
      typefaces.push({ use, family, weight, cap_ratio: font.capRatio, fallback });
      resolved.set(`${look.file}\n${use}`, font);
    }
    return { file: look.file, typefaces: whole ? typefaces : null };
  });
  return {
    looks: out,
    findings,
    advance: (look, use, text) => resolved.get(`${look}\n${use}`)?.advance(text) ?? null,
  };
}
