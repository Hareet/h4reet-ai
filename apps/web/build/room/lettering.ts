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
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The sources' folder and the outline's path, from the repository's root. */
export const LETTERING_DIR = "apps/web/content/lettering";
export const OUTLINE_PATH = "apps/web/content/room/outlines/twin-shirt-lettering.outline.json";

/** Spec 004 §8's outline, as this converter writes it. */
export interface LetteringOutline {
  readonly schema: 1;
  readonly sign: "twin-shirt-lettering";
  readonly words: string;
  readonly intent_ref: "intent-016";
  readonly source: { readonly type: "design"; readonly id: string };
  readonly tool: { readonly name: string; readonly version: string; readonly license: string };
  readonly view_box: readonly [number, number, number, number];
  readonly cap_height: number;
  readonly advance: number;
  readonly paths: readonly string[];
}

/** D4's provisional provenance (spec 016, Defaults): an opaque design ID, and this converter as the tool. */
const SOURCE = { type: "design", id: "D-0002" } as const;
const TOOL = { name: "the room's outline converter", version: "1", license: "mit" } as const;
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

/** `npm run room:lettering -w apps/web`: writes the outline from the committed sources. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const read = (name: string): string => readFileSync(join(root, LETTERING_DIR, name), "utf8");
  const outline = convertLettering(read("twin-shirt-lettering.svg"), read("twin-shirt-lettering.json"));
  writeFileSync(join(root, OUTLINE_PATH), formatOutline(outline));
  console.log(`lettering: wrote ${OUTLINE_PATH}, ${outline.paths.length} paths`);
}
