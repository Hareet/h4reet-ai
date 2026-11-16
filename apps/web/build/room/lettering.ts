// The shirt's outline (spec 016; FR-036, FR-039; plan.md R-13; contracts/twin-data.md §6): the studio's lettering
// sources, apps/web/content/lettering/twin-shirt-lettering.svg and .json, converted to spec 004 §8's outline,
// apps/web/content/room/outlines/twin-shirt-lettering.outline.json, which the Author approves by its SHA-256 with the
// kind room-text. `npm run room:lettering -w apps/web` writes it; a test holds the committed file to the conversion.
// - The SVG: one `svg` root with `viewBox="0 0 180 70"` (and `xmlns`, `width`, `height`), and only `path` children, each
//   with `d`, `fill="#000000"`, and `fill-rule="nonzero"`, and no other attribute or element. Anything else is refused
//   with the element's index, never its content.
// - The outline: the SVG's paths in document order, unchanged; the JSON's `words`; the view box 180 × 70; its cap height
//   the JSON's largest `cap_height_mm`; its advance the view box's width; its source D4's provisional opaque design ID,
//   and its tool this converter, under the repository's own MIT license (the typeface and its license are named in the
//   committed JSON). Written as two-space JSON with a final newline.
// It reads the two sources only; it never reads the brief, which stays outside the repository.
// Spec 029 (FR-015 to FR-018, FR-021; plan.md §R-C1) generalises it for the desk signs, whose words are set here in a
// vendored typeface rather than traced: see `setLettering` below. The shirt's conversion and its output are unchanged.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { create } from "fontkit";
import type { Font, PathCommand } from "fontkit";

/** The sources' folder and the outline's path, from the repository's root. */
export const LETTERING_DIR = "apps/web/content/lettering";
export const OUTLINE_PATH = "apps/web/content/room/outlines/twin-shirt-lettering.outline.json";

/** Spec 004 §8's outline, as this converter writes it. */
export interface LetteringOutline {
  readonly schema: 1;
  readonly sign: string;
  readonly words: string;
  readonly intent_ref: string;
  readonly source: { readonly type: "design"; readonly id: string };
  readonly tool: { readonly name: string; readonly version: string; readonly license: string };
  readonly view_box: readonly [number, number, number, number];
  readonly cap_height: number;
  readonly advance: number;
  readonly paths: readonly string[];
}

/** D4's provisional provenance (spec 016, Defaults): an opaque design ID, and this converter as the tool. */
const SOURCE = { type: "design", id: "D-0002" } as const;
// The version names this spec, so the outline's private fields hold no value short enough to turn up by chance in
// what ships (dist.test.ts holds every one of them to nowhere in dist/).
const TOOL = { name: "the room's outline converter", version: "spec-016.1", license: "mit" } as const;
const VIEW_BOX = "0 0 180 70";
const SVG_ATTRS = new Set(["xmlns", "width", "height", "viewBox"]);
const PATH_ATTRS = new Set(["d", "fill", "fill-rule"]);

const refuse = (why: string): never => {
  throw new Error(`the lettering's SVG: ${why}`);
};

/** A tag's attributes, each `name="value"`; null where the tag holds anything else. */
function attributes(text: string): Map<string, string> | null {
  const out = new Map<string, string>();
  const rest = text.replace(/\s*([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"<>]*)"/g, (_m, name: string, value: string) => {
    if (out.has(name)) return "\u0000";
    out.set(name, value);
    return "";
  });
  return rest.trim() === "" ? out : null;
}

/** The SVG's paths, by the rules above. */
function pathsOf(svg: string): string[] {
  const tags = [...svg.matchAll(/<[^<>]*>/g)];
  // Between tags only white space: no text, no comment, no character data.
  let at = 0;
  for (const t of tags) {
    if (svg.slice(at, t.index).trim() !== "") refuse("text or markup outside an element");
    at = (t.index ?? 0) + t[0].length;
  }
  if (svg.slice(at).trim() !== "") refuse("text after the root");
  const [open, ...rest] = tags.map((t) => t[0]);
  const close = rest.pop();
  const svgOpen = /^<svg(\s[^>]*)?>$/.exec(open ?? "");
  if (!svgOpen || close !== "</svg>") refuse("not one svg root");
  const root = attributes(svgOpen?.[1] ?? "");
  if (!root || [...root.keys()].some((k) => !SVG_ATTRS.has(k))) refuse("a root attribute the converter doesn't take");
  if (root?.get("viewBox") !== VIEW_BOX) refuse(`a view box other than ${VIEW_BOX}`);
  return rest.map((tag, i) => {
    const m = /^<path(\s[^>]*?)\s*\/>$/.exec(tag);
    if (!m) return refuse(`element ${i} isn't a path`);
    const attrs = attributes(m[1] ?? "");
    if (!attrs || [...attrs.keys()].some((k) => !PATH_ATTRS.has(k)))
      return refuse(`element ${i} holds an attribute other than d, fill, and fill-rule`);
    if (attrs.get("fill") !== "#000000") return refuse(`element ${i}'s fill isn't #000000`);
    if (attrs.get("fill-rule") !== "nonzero") return refuse(`element ${i}'s fill-rule isn't nonzero`);
    const d = attrs.get("d");
    if (d === undefined || d.trim() === "") return refuse(`element ${i} has no path data`);
    return d;
  });
}

/** The outline converted from the SVG's and the JSON's text (FR-039). */
export function convertLettering(svg: string, json: string): LetteringOutline {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("the lettering's JSON doesn't parse");
  }
  const fields = (typeof doc === "object" && doc !== null ? doc : {}) as Record<string, unknown>;
  const words = fields.words;
  if (typeof words !== "string" || words === "") throw new Error("the lettering's JSON has no words");
  const caps = fields.cap_height_mm;
  if (!Array.isArray(caps) || caps.length === 0 || !caps.every((c) => typeof c === "number" && c > 0))
    throw new Error("the lettering's JSON has no cap_height_mm");
  const paths = pathsOf(svg);
  if (paths.length === 0) refuse("no path");
  return {
    schema: 1,
    sign: "twin-shirt-lettering",
    words,
    intent_ref: "intent-016",
    source: SOURCE,
    tool: TOOL,
    view_box: [0, 0, 180, 70],
    cap_height: Math.max(...(caps as number[])),
    advance: 180,
    paths,
  };
}

/** The outline as it is written: two-space JSON with a final newline. */
export function formatOutline(outline: LetteringOutline): string {
  return `${JSON.stringify(outline, null, 2)}\n`;
}

// ---- Spec 029: lettering set in a vendored typeface (FR-015 to FR-018, FR-021; plan.md §R-C1) ----
//
// A source, `apps/web/content/lettering/<stem>.json` with `"converter": "set"`, names a sign's words, the lines they are
// set on, the intent that quotes them (its number, `intent-NNN`), the next free design ID, the vendored font by its file
// and SHA-256 (fonts.lock's), and, for the dog sign, a mark: a path on its own grid with the grid's box round its ink,
// set after a line's words at a height in cap heights, bottom on the baseline. The outline, spec 004 §8's format: one
// path per drawn glyph, then the mark's, in an em of 100 units, y down, each line centred on the widest, the ink's box
// padded by PAD ems on every side and moved to the view box's origin; its cap height the font's; its advance the view
// box's width. Numbers are written to three decimals, so the output is the same on every machine. A source the converter
// doesn't take is refused with the key that's wrong, never its value.

/** The em, in the outline's units. */
const EM = 100;
/** The line pitch, and the ink's padding on every side, in ems. */
const PITCH = 1.2;
const PAD = 0.3;
/** The gap between a line's words and its mark, in ems. */
const MARK_GAP = 0.3;
/** This converter's version for set lettering: it names this spec (see TOOL). */
const SET_TOOL = { name: TOOL.name, version: "spec-029.1", license: TOOL.license } as const;

/** A set source (see above), as the converter reads it. */
export interface SetSource {
  readonly converter: "set";
  readonly sign: string;
  readonly words: string;
  readonly set_as: readonly string[];
  readonly words_from: string;
  readonly intent_ref: string;
  readonly source_id: string;
  readonly typeface: { readonly file: string; readonly sha256: string };
  readonly mark?: {
    readonly path: string;
    readonly from: string;
    /** The mark's ink on its own grid: `[x, y, w, h]`, y down. */
    readonly box: readonly [number, number, number, number];
    /** The line it follows, from 0. */
    readonly line: number;
    /** Its height, in the font's cap heights. */
    readonly height: number;
  };
}

const setRefuse = (key: string): never => {
  throw new Error(`the lettering's set source: ${key} isn't what the converter takes`);
};

const isText = (v: unknown): v is string => typeof v === "string" && v !== "";
const isFinite4 = (v: unknown): v is [number, number, number, number] =>
  Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** A set source's text read, or refused by the key that's wrong. */
export function readSetSource(json: string): SetSource {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("the lettering's set source doesn't parse");
  }
  const f = (typeof doc === "object" && doc !== null ? doc : {}) as Record<string, unknown>;
  if (f.converter !== "set") setRefuse("converter");
  for (const key of ["sign", "words", "words_from", "intent_ref", "source_id"] as const)
    if (!isText(f[key])) setRefuse(key);
  if (!/^intent-\d{3}$/.test(f.intent_ref as string)) setRefuse("intent_ref");
  const lines = f.set_as;
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every(isText)) return setRefuse("set_as");
  if ((lines as string[]).join(" ") !== f.words) setRefuse("set_as");
  const t = (typeof f.typeface === "object" && f.typeface !== null ? f.typeface : {}) as Record<string, unknown>;
  if (!isText(t.file) || !isText(t.sha256)) setRefuse("typeface");
  let mark: SetSource["mark"];
  if (f.mark !== undefined) {
    const m = (typeof f.mark === "object" && f.mark !== null ? f.mark : {}) as Record<string, unknown>;
    if (!isText(m.path) || !/^[Mm][MmZzLlHhVvCcSsQqTtAa0-9eE.,+\- ]*$/.test(m.path)) setRefuse("mark.path");
    if (!isText(m.from)) setRefuse("mark.from");
    if (!isFinite4(m.box) || !(m.box[2] > 0 && m.box[3] > 0)) setRefuse("mark.box");
    if (typeof m.line !== "number" || !Number.isInteger(m.line) || m.line < 0 || m.line >= lines.length)
      setRefuse("mark.line");
    if (typeof m.height !== "number" || !(m.height > 0)) setRefuse("mark.height");
    mark = m as unknown as SetSource["mark"];
  }
  return {
    converter: "set",
    sign: f.sign as string,
    words: f.words as string,
    set_as: lines as string[],
    words_from: f.words_from as string,
    intent_ref: f.intent_ref as string,
    source_id: f.source_id as string,
    typeface: { file: t.file as string, sha256: t.sha256 as string },
    ...(mark ? { mark } : {}),
  };
}

/** A number as the outline writes it: three decimals at most, no negative zero. */
function num(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

/** How many numbers each path command takes. */
const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Path data scaled by `s` and moved by (tx, ty), every command kept: an absolute command's points scaled and moved, a
 * relative one's scaled; an arc's radii scaled, its rotation and flags kept. So a mark drawn on its own grid lands in
 * the outline's view box exactly as it was drawn.
 */
export function placePath(d: string, s: number, tx: number, ty: number): string {
  const tokens = [...d.matchAll(/([MmZzLlHhVvCcSsQqTtAa])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g)];
  const out: string[] = [];
  let k = 0;
  while (k < tokens.length) {
    const letter = tokens[k]?.[1];
    if (letter === undefined) throw new Error("the mark's path: a number where a command belongs");
    k++;
    const upper = letter.toUpperCase();
    const relative = letter !== upper;
    const n = ARITY[upper] ?? 0;
    out.push(letter);
    if (n === 0) continue;
    // A command repeats while numbers follow it.
    do {
      const args = tokens.slice(k, k + n).map((t) => (t[2] === undefined ? NaN : Number(t[2])));
      if (args.length !== n || args.some((a) => !Number.isFinite(a)))
        throw new Error("the mark's path: a command without its numbers");
      k += n;
      const x = (v: number): number => (relative ? v * s : v * s + tx);
      const y = (v: number): number => (relative ? v * s : v * s + ty);
      const placed =
        upper === "H"
          ? [x(args[0] as number)]
          : upper === "V"
            ? [y(args[0] as number)]
            : upper === "A"
              ? [
                  (args[0] as number) * s,
                  (args[1] as number) * s,
                  args[2] as number,
                  args[3] as number,
                  args[4] as number,
                  x(args[5] as number),
                  y(args[6] as number),
                ]
              : args.map((v, i) => (i % 2 === 0 ? x(v) : y(v)));
      out.push(placed.map(num).join(" "));
    } while (k < tokens.length && tokens[k]?.[2] !== undefined);
  }
  return out.join(" ");
}

/** A glyph's commands as path data, at (x0, baseline) and k outline units per font unit, y turned down. */
function glyphPath(commands: readonly PathCommand[], x0: number, baseline: number, k: number): string {
  const letter = { moveTo: "M", lineTo: "L", quadraticCurveTo: "Q", bezierCurveTo: "C", closePath: "Z" } as const;
  return commands
    .map((c) => {
      const pts: string[] = [];
      for (let i = 0; i + 1 < c.args.length; i += 2)
        pts.push(`${num(x0 + (c.args[i] as number) * k)} ${num(baseline - (c.args[i + 1] as number) * k)}`);
      return pts.length > 0 ? `${letter[c.command]} ${pts.join(" ")}` : letter[c.command];
    })
    .join(" ");
}

/** The SHA-256 of bytes, as hex. */
const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** The outline a set source gives in its font (FR-015 to FR-018). */
export function setLettering(source: SetSource, fontBytes: Uint8Array): LetteringOutline {
  if (digest(fontBytes) !== source.typeface.sha256) setRefuse("typeface.sha256");
  const font = create(fontBytes) as Font;
  if (!("unitsPerEm" in font) || !(font.unitsPerEm > 0)) setRefuse("typeface.file");
  const k = EM / font.unitsPerEm;
  const cap = font.capHeight * k;
  const { mark } = source;
  const markH = mark ? mark.height * cap : 0;
  const markS = mark ? markH / mark.box[3] : 0;
  const markW = mark ? mark.box[2] * markS : 0;
  // Each line's run and its width, its mark's included.
  const runs = source.set_as.map((text, i) => {
    const run = font.layout(text);
    const words = run.advanceWidth * k;
    const width = mark && mark.line === i ? words + MARK_GAP * EM + markW : words;
    return { run, width };
  });
  const widest = Math.max(...runs.map((r) => r.width));
  // Each drawn glyph and the mark where they stand, y down, and the ink's box round them.
  const drawn: ({ glyph: PathCommand[]; x: number; y: number } | { mark: true; x: number; y: number })[] = [];
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const ink = (x0: number, y0: number, x1: number, y1: number): void => {
    [minX, minY, maxX, maxY] = [Math.min(minX, x0), Math.min(minY, y0), Math.max(maxX, x1), Math.max(maxY, y1)];
  };
  runs.forEach(({ run, width }, i) => {
    const baseline = i * PITCH * EM;
    let pen = (widest - width) / 2;
    run.glyphs.forEach((glyph, g) => {
      const pos = run.positions[g];
      const x = pen + (pos?.xOffset ?? 0) * k;
      const y = baseline - (pos?.yOffset ?? 0) * k;
      if (glyph.path.commands.length > 0) {
        const b = glyph.bbox;
        ink(x + b.minX * k, y - b.maxY * k, x + b.maxX * k, y - b.minY * k);
        drawn.push({ glyph: [...glyph.path.commands], x, y });
      }
      pen += (pos?.xAdvance ?? 0) * k;
    });
    if (mark && mark.line === i) {
      const x = pen + MARK_GAP * EM;
      const y = baseline - markH;
      ink(x, y, x + markW, baseline);
      drawn.push({ mark: true, x, y });
    }
  });
  // The ink's box, padded, at the view box's origin.
  const [ox, oy] = [minX - PAD * EM, minY - PAD * EM];
  const paths = drawn.map((d) =>
    "glyph" in d
      ? glyphPath(d.glyph, d.x - ox, d.y - oy, k)
      : placePath(mark?.path ?? "", markS, d.x - ox - (mark?.box[0] ?? 0) * markS, d.y - oy - (mark?.box[1] ?? 0) * markS),
  );
  const w = Number(num(maxX - minX + 2 * PAD * EM));
  const h = Number(num(maxY - minY + 2 * PAD * EM));
  return {
    schema: 1,
    sign: source.sign,
    words: source.words,
    intent_ref: source.intent_ref,
    source: { type: "design", id: source.source_id },
    tool: SET_TOOL,
    view_box: [0, 0, w, h],
    cap_height: Number(num(cap)),
    advance: w,
    paths,
  };
}

/** An outline's path, from the repository's root, by its stem. */
export const outlinePath = (stem: string): string => `apps/web/content/room/outlines/${stem}.outline.json`;

/** The set sources' stems in the lettering folder: each JSON whose `converter` is `set`, sorted. */
export function setStems(root: string): string[] {
  return readdirSync(join(root, LETTERING_DIR))
    .filter((n) => n.endsWith(".json"))
    .sort()
    .filter((n) => {
      try {
        return (JSON.parse(readFileSync(join(root, LETTERING_DIR, n), "utf8")) as { converter?: unknown }).converter === "set";
      } catch {
        return false;
      }
    })
    .map((n) => n.slice(0, -".json".length));
}

/** A set source's outline, from the repository's tree: its source and its vendored font. */
export function setFromTree(root: string, stem: string): LetteringOutline {
  const source = readSetSource(readFileSync(join(root, LETTERING_DIR, `${stem}.json`), "utf8"));
  if (source.sign !== stem) setRefuse("sign");
  if (!/^[A-Za-z0-9-]+\.woff$/.test(source.typeface.file)) setRefuse("typeface.file");
  return setLettering(source, readFileSync(join(root, "apps/web/fonts", source.typeface.file)));
}

/** `npm run room:lettering -w apps/web`: writes the shirt's outline from its committed sources, then each set sign's. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const read = (name: string): string => readFileSync(join(root, LETTERING_DIR, name), "utf8");
  const outline = convertLettering(read("twin-shirt-lettering.svg"), read("twin-shirt-lettering.json"));
  mkdirSync(dirname(join(root, OUTLINE_PATH)), { recursive: true });
  writeFileSync(join(root, OUTLINE_PATH), formatOutline(outline));
  console.log(`lettering: wrote ${OUTLINE_PATH}, ${outline.paths.length} paths`);
  for (const stem of setStems(root)) {
    const set = setFromTree(root, stem);
    writeFileSync(join(root, outlinePath(stem)), formatOutline(set));
    console.log(`lettering: wrote ${outlinePath(stem)}, ${set.paths.length} paths`);
  }
}
