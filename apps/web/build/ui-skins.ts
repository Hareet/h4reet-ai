// The interface's button skins at build (spec 030, FR-009 to FR-011; plan.md §R-B1, §R-B2): content/ui-skins.yaml,
// held to its schema, read into one generated stylesheet of custom properties (--btn-*) on
// :root[data-skin="<id>"], which src/ui/button.css alone reads, and data-skin written on the page's root. A swap of
// skins is an edit of `active` (or of a skin's tokens) in the data, never of code (the Author's "features as data";
// SC-004). An image skin (`kind: image`) is accepted and, until T-DS builds image skins, resolved to its CSS fallback
// whole, with one line that says so (FR-025); the build prints the skin it took either way.
import { readFileSync } from "node:fs";

import type { Plugin } from "vite";
import { parseDocument, visit } from "yaml";

/** The page imports the skin's stylesheet by this ID (src/main.ts). */
export const SKIN_MODULE = "virtual:ui-skin.css";
/** The ID the plugin resolves it to: a CSS module's, so Vite's CSS pipeline takes it into the page's stylesheet. */
const RESOLVED = "\0virtual:ui-skin.css";

export const VARIANTS = ["primary", "secondary"] as const;
export const STATES = ["normal", "hover", "pressed", "disabled", "selected"] as const;
export type Variant = (typeof VARIANTS)[number];
export type ButtonState = (typeof STATES)[number];

/** A state's colours: the face, the label on it, and the border; the selected state's glow besides. */
export interface StateTokens {
  readonly face: string;
  readonly label: string;
  readonly border: string;
}
export interface VariantTokens extends Record<ButtonState, StateTokens> {
  /** The focus ring, drawn inside the face (plan §R-B3), so in a colour that holds against this variant's faces. */
  readonly ring: string;
  readonly selected: StateTokens & { readonly glow: string };
}
export interface Tokens {
  readonly font: {
    readonly family: string;
    readonly weight: number;
    readonly case: "upper" | "as-written";
    readonly tracking: string;
  };
  readonly chamfer: string;
  readonly radius: string;
  readonly frame: string;
  readonly bevel: { readonly light: string; readonly dark: string };
  readonly highlight: string;
  readonly glow: { readonly radius: string };
  readonly primary: VariantTokens;
  readonly secondary: VariantTokens;
}
export interface CssSkin {
  readonly kind: "css";
  readonly tokens: Tokens;
}
/** An image skin: its CSS fallback, and its files, which T-DS's build reads (plan §R-D4). */
export interface ImageSkin {
  readonly kind: "image";
  readonly fallback: string;
  readonly files: unknown;
}
export type Skin = CssSkin | ImageSkin;
export interface Skins {
  readonly active: string;
  readonly skins: Readonly<Record<string, Skin>>;
}

/** The active skin, resolved to a CSS skin, and the build's line about it. */
export interface ResolvedSkin {
  readonly id: string;
  readonly skin: CssSkin;
  readonly line: string;
}

export class SkinError extends Error {}

const SKINS_LABEL = "apps/web/content/ui-skins.yaml";

type Obj = Record<string, unknown>;

function refuse(label: string, path: string, why: string): never {
  throw new SkinError(`${label}: ${path}: ${why}`);
}

/** A mapping holding exactly the keys `required`, and of `optional` only those given; anything else refused. */
function keys(
  label: string,
  path: string,
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse(label, path, "isn't a mapping");
  const obj = value as Obj;
  for (const k of Object.keys(obj))
    if (!required.includes(k) && !optional.includes(k)) refuse(label, `${path}.${k}`, "isn't a key the schema knows");
  for (const k of required) if (!(k in obj)) refuse(label, `${path}.${k}`, "is missing");
  return obj;
}

const HEX = /^#[0-9a-f]{6}$/i;
const RGB = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ (0|1|0?\.\d+|1\.0+)\)$/;

/** A colour as the schema admits it: #rrggbb, or rgb(r g b / a) with each channel 0 to 255 and a from 0 to 1. */
function colour(label: string, path: string, value: unknown): string {
  if (typeof value !== "string") refuse(label, path, "isn't a colour (#rrggbb or rgb(r g b / a))");
  if (HEX.test(value)) return value.toLowerCase();
  const m = RGB.exec(value);
  if (m && [m[1], m[2], m[3]].every((c) => Number(c) <= 255) && Number(m[4]) <= 1) return value;
  return refuse(label, path, `"${value}" isn't a colour (#rrggbb or rgb(r g b / a))`);
}

/** A length: a number with px, rem, or em. */
function length(label: string, path: string, value: unknown): string {
  if (typeof value === "string" && /^\d+(\.\d+)?(px|rem|em)$/.test(value)) return value;
  return refuse(label, path, `${JSON.stringify(value)} isn't a length (a number with px, rem, or em)`);
}

function state(label: string, path: string, value: unknown, glow: boolean): StateTokens & { glow?: string } {
  const o = keys(label, path, value, glow ? ["face", "label", "border", "glow"] : ["face", "label", "border"]);
  const out = {
    face: colour(label, `${path}.face`, o.face),
    label: colour(label, `${path}.label`, o.label),
    border: colour(label, `${path}.border`, o.border),
  };
  return glow ? { ...out, glow: colour(label, `${path}.glow`, o.glow) } : out;
}

function variant(label: string, path: string, value: unknown): VariantTokens {
  const o = keys(label, path, value, ["ring", ...STATES]);
  const states = Object.fromEntries(STATES.map((s) => [s, state(label, `${path}.${s}`, o[s], s === "selected")]));
  return { ring: colour(label, `${path}.ring`, o.ring), ...states } as unknown as VariantTokens;
}

function tokens(label: string, path: string, value: unknown): Tokens {
  const o = keys(label, path, value, [
    "font",
    "chamfer",
    "radius",
    "frame",
    "bevel",
    "highlight",
    "glow",
    "primary",
    "secondary",
  ]);
  const font = keys(label, `${path}.font`, o.font, ["family", "weight", "case", "tracking"]);
  // A family is words alone: no quote, semicolon, or brace can leave the declaration it is written into.
  if (typeof font.family !== "string" || !/^[A-Za-z0-9 -]{1,64}$/.test(font.family))
    refuse(label, `${path}.font.family`, "isn't a family name (letters, digits, spaces, hyphens)");
  if (
    typeof font.weight !== "number" ||
    !Number.isInteger(font.weight) ||
    font.weight % 100 !== 0 ||
    font.weight < 100 ||
    font.weight > 900
  )
    refuse(label, `${path}.font.weight`, "isn't a weight from 100 to 900 in hundreds");
  if (font.case !== "upper" && font.case !== "as-written")
    refuse(label, `${path}.font.case`, "isn't upper or as-written");
  const tracking =
    font.tracking === 0 || font.tracking === "0" ? "0em" : length(label, `${path}.font.tracking`, font.tracking);
  const bevel = keys(label, `${path}.bevel`, o.bevel, ["light", "dark"]);
  const glow = keys(label, `${path}.glow`, o.glow, ["radius"]);
  return {
    font: { family: font.family, weight: font.weight, case: font.case, tracking },
    chamfer: length(label, `${path}.chamfer`, o.chamfer),
    radius: length(label, `${path}.radius`, o.radius),
    frame: colour(label, `${path}.frame`, o.frame),
    bevel: {
      light: colour(label, `${path}.bevel.light`, bevel.light),
      dark: colour(label, `${path}.bevel.dark`, bevel.dark),
    },
    highlight: colour(label, `${path}.highlight`, o.highlight),
    glow: { radius: length(label, `${path}.glow.radius`, glow.radius) },
    primary: variant(label, `${path}.primary`, o.primary),
    secondary: variant(label, `${path}.secondary`, o.secondary),
  };
}

/** The skin file, parsed with the yaml package's core schema, no anchors or aliases, and held to its schema; a
 *  SkinError names the first field it refuses. */
export function readSkins(text: string, label: string = SKINS_LABEL): Skins {
  const doc = parseDocument(text, { schema: "core", uniqueKeys: true, merge: false, prettyErrors: false });
  if (doc.errors.length > 0) refuse(label, "the file", `isn't YAML: ${doc.errors[0]?.message ?? "?"}`);
  let alias = false;
  visit(doc, {
    Alias() {
      alias = true;
      return visit.BREAK;
    },
  });
  if (alias) refuse(label, "the file", "holds an alias; it has no anchors or aliases");
  const root = keys(label, "the file", doc.toJS(), ["active", "skins"]);
  if (typeof root.active !== "string") refuse(label, "active", "isn't a skin's ID");
  const entries = keys(label, "skins", root.skins, [], Object.keys((root.skins as Obj | null) ?? {}));
  const skins: Record<string, Skin> = {};
  for (const [id, value] of Object.entries(entries)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(id))
      refuse(label, `skins.${id}`, "isn't an ID (lower-case letters, digits, hyphens)");
    const kind = (value as Obj | null)?.kind;
    if (kind === "css") {
      const o = keys(label, `skins.${id}`, value, ["kind", "tokens"]);
      skins[id] = { kind: "css", tokens: tokens(label, `skins.${id}.tokens`, o.tokens) };
    } else if (kind === "image") {
      const o = keys(label, `skins.${id}`, value, ["kind", "fallback", "files"], ["slices"]);
      if (typeof o.fallback !== "string") refuse(label, `skins.${id}.fallback`, "isn't a skin's ID");
      skins[id] = { kind: "image", fallback: o.fallback, files: o.files };
    } else refuse(label, `skins.${id}.kind`, `${JSON.stringify(kind)} isn't css or image`);
  }
  for (const [id, skin] of Object.entries(skins))
    if (skin.kind === "image" && skins[skin.fallback]?.kind !== "css")
      refuse(label, `skins.${id}.fallback`, `"${skin.fallback}" isn't a CSS skin of this file`);
  if (!(root.active in skins)) refuse(label, "active", `"${root.active}" isn't a skin of this file`);
  return { active: root.active, skins };
}

/** The active skin as the build takes it: a CSS skin itself; an image skin its fallback, whole (until T-DS). */
export function resolveSkin(skins: Skins): ResolvedSkin {
  const skin = skins.skins[skins.active];
  if (skin?.kind === "css") return { id: skins.active, skin, line: `ui-skins: ${skins.active} (css)` };
  if (skin?.kind === "image") {
    const fallback = skins.skins[skin.fallback];
    if (fallback?.kind === "css")
      return {
        id: skin.fallback,
        skin: fallback,
        line: `${skins.active}: falling back to ${skin.fallback} (image skins not built)`,
      };
  }
  throw new SkinError(`${SKINS_LABEL}: active: "${skins.active}" resolves to no CSS skin`);
}

/** The custom properties of a CSS skin, by name, in a fixed order. */
export function skinProperties(skin: CssSkin): [string, string][] {
  const t = skin.tokens;
  const out: [string, string][] = [
    ["--btn-font-family", `"${t.font.family}", system-ui, sans-serif`],
    ["--btn-font-weight", String(t.font.weight)],
    ["--btn-case", t.font.case === "upper" ? "uppercase" : "none"],
    ["--btn-tracking", t.font.tracking],
    ["--btn-chamfer", t.chamfer],
    ["--btn-radius", t.radius],
    ["--btn-frame", t.frame],
    ["--btn-bevel-light", t.bevel.light],
    ["--btn-bevel-dark", t.bevel.dark],
    ["--btn-highlight", t.highlight],
    ["--btn-glow-radius", t.glow.radius],
  ];
  for (const v of VARIANTS) {
    out.push([`--btn-${v}-ring`, t[v].ring]);
    for (const s of STATES) {
      out.push([`--btn-${v}-${s}-face`, t[v][s].face]);
      out.push([`--btn-${v}-${s}-label`, t[v][s].label]);
      out.push([`--btn-${v}-${s}-border`, t[v][s].border]);
    }
    out.push([`--btn-${v}-selected-glow`, t[v].selected.glow]);
  }
  return out;
}

/** The generated stylesheet: one rule on the skin's root, its custom properties, nothing else. */
export function skinCss(resolved: ResolvedSkin): string {
  const body = skinProperties(resolved.skin)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return (
    `/* Generated at build by build/ui-skins.ts from content/ui-skins.yaml (spec 030, FR-010): ${resolved.line}. */\n` +
    `:root[data-skin="${resolved.id}"] {\n${body}\n}\n`
  );
}

/** The page with data-skin on its root element (index.html's <html>), and nothing else changed. */
export function skinHtml(html: string, id: string): string {
  return html.replace(
    /<html(\s[^>]*)?>/i,
    (_m, attributes: string | undefined) => `<html${attributes ?? ""} data-skin="${id}">`,
  );
}

/** The Vite plugin: the skin file read when the build starts (and its line printed), the generated stylesheet served
 *  as `virtual:ui-skin.css`, and data-skin written on each page Vite builds. */
export function uiSkins(options: { readonly source: string }): Plugin {
  let resolved: ResolvedSkin | null = null;
  const take = (): ResolvedSkin => {
    resolved ??= resolveSkin(readSkins(readFileSync(options.source, "utf8")));
    return resolved;
  };
  return {
    name: "h4-ui-skins",
    buildStart() {
      resolved = null;
      this.addWatchFile(options.source);
      console.log(take().line);
    },
    resolveId(id) {
      return id === SKIN_MODULE ? RESOLVED : null;
    },
    load(id) {
      return id === RESOLVED ? skinCss(take()) : null;
    },
    transformIndexHtml(html) {
      return skinHtml(html, take().id);
    },
  };
}
