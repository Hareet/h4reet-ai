// T-B01 (a) (spec 030; FR-009 to FR-012; SC-003, SC-004; plan.md §R-B1, §R-B2, §R-B4): the skin file and its build.
// - The schema (build/ui-skins.ts's readSkins) refuses an unknown key, a missing token, a state missing from a
//   variant, a colour that isn't #rrggbb or rgb(r g b / a), a font family that could break out of its declaration,
//   an `active` that names no skin, and an image skin without a CSS fallback.
// - skinCss emits one rule, `:root[data-skin="<id>"]`, holding every --btn-* custom property of the active skin and
//   nothing else; an image skin, until T-DS, resolves to its fallback whole with the line
//   "<id>: falling back to <fallback> (image skins not built)".
// - FR-012's ratios for every CSS skin of content/ui-skins.yaml, every variant, every state, computed as spec 029's
//   hud-over-contrast.test.ts computes them (sRGB, composited over pure white and pure black): the label 4.5:1 against
//   the face, and against the face under the skin's inner highlight; the border 3:1 against the face (the states'
//   marks, dashed and doubled, are drawn in it); the focus ring, drawn inside the face (plan §R-B3), 3:1 against it;
//   and the button's edge, its border or its face, 3:1 against what lies beside it: the room's glass at each of its
//   alphas (spec 029's over-room glass, spec 005's glass, spec 018's split glass, and opaque, as under the visitor's
//   asks) over white and over black, and the dark pages' opaque ground, rgb(16 20 26), where "Enter" stands (analysis
//   A-7). The glow is decoration and counts as no boundary.
// - The swap (SC-004): the plugin, given a copy of the file whose one difference is `active: plain`, serves plain's
//   stylesheet and writes data-skin="plain" on the page, through the same code; nothing under src/ or build/ differs.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SKIN_MODULE, readSkins, resolveSkin, skinCss, skinHtml, uiSkins } from "../build/ui-skins";
import type { CssSkin } from "../build/ui-skins";
import { WEB, parseCss } from "./helpers/room";
import { callHook, hookContext } from "./helpers/vite-plugin";

const SOURCE = join(WEB, "content", "ui-skins.yaml");
const TEXT = readFileSync(SOURCE, "utf8");

const VARIANTS = ["primary", "secondary"] as const;
const STATES = ["normal", "hover", "pressed", "disabled", "selected"] as const;

/** Every custom property a skin's stylesheet sets (FR-009's tokens). */
const PROPERTIES = [
  "--btn-font-family",
  "--btn-font-weight",
  "--btn-case",
  "--btn-tracking",
  "--btn-chamfer",
  "--btn-radius",
  "--btn-frame",
  "--btn-bevel-light",
  "--btn-bevel-dark",
  "--btn-highlight",
  "--btn-glow-radius",
  ...VARIANTS.flatMap((v) => [
    `--btn-${v}-ring`,
    ...STATES.flatMap((s) => [`--btn-${v}-${s}-face`, `--btn-${v}-${s}-label`, `--btn-${v}-${s}-border`]),
    `--btn-${v}-selected-glow`,
  ]),
];

/** A minimal valid skin's tokens, as YAML at an indent, for the schema's fixtures. */
const STATE = (glow = false): string =>
  `{ face: "#16323c", label: "#ffffff", border: "#76e1f4"${glow ? ', glow: "#46d7f0"' : ""} }`;
const VARIANT = (indent: string, ring = '"#ffd23f"'): string =>
  [
    `${indent}ring: ${ring}`,
    `${indent}normal: ${STATE()}`,
    `${indent}hover: ${STATE()}`,
    `${indent}pressed: ${STATE()}`,
    `${indent}disabled: ${STATE()}`,
    `${indent}selected: ${STATE(true)}`,
  ].join("\n");
const TOKENS = (indent: string): string =>
  [
    `${indent}font: { family: "IBM Plex Sans", weight: 700, case: upper, tracking: 0.06em }`,
    `${indent}chamfer: 0.5rem`,
    `${indent}radius: 0rem`,
    `${indent}frame: "#2a3038"`,
    `${indent}bevel: { light: "rgb(255 255 255 / 0.28)", dark: "rgb(0 0 0 / 0.55)" }`,
    `${indent}highlight: "rgb(255 255 255 / 0.18)"`,
    `${indent}glow: { radius: 0.5rem }`,
    `${indent}primary:`,
    VARIANT(`${indent}  `),
    `${indent}secondary:`,
    VARIANT(`${indent}  `),
  ].join("\n");
const VALID = ["active: one", "skins:", "  one:", "    kind: css", "    tokens:", TOKENS("      "), ""].join("\n");

describe("the skin file's schema (FR-009)", () => {
  it("reads a valid file, and the repository's", () => {
    expect(readSkins(VALID).active).toBe("one");
    const repo = readSkins(TEXT);
    expect(Object.keys(repo.skins)).toEqual(expect.arrayContaining(["metal", "plain"]));
    expect(repo.skins.metal?.kind).toBe("css");
    expect(repo.skins.plain?.kind).toBe("css");
  });

  const refusals: [string, string, RegExp][] = [
    ["an unknown top-level key", `${VALID}extra: 1\n`, /extra/],
    ["an unknown key in a skin", VALID.replace("    kind: css", "    kind: css\n    colour: red"), /colour/],
    ["an unknown token", VALID.replace("      chamfer: 0.5rem", "      chamfer: 0.5rem\n      sparkle: 1"), /sparkle/],
    ["an unknown key in a state", VALID.replace('label: "#ffffff", border', 'label: "#ffffff", shine: "#ffffff", border'), /shine/],
    ["a missing token", VALID.replace("      chamfer: 0.5rem\n", ""), /chamfer/],
    ["a missing token inside a group", VALID.replace(', dark: "rgb(0 0 0 / 0.55)"', ""), /dark/],
    ["a missing state", VALID.replace(/ {8}pressed: [^\n]*\n/, ""), /pressed/],
    ["a selected state without its glow", VALID.replaceAll(', glow: "#46d7f0"', ""), /glow/],
    ["a short colour", VALID.replace('frame: "#2a3038"', 'frame: "#234"'), /frame/],
    ["a named colour", VALID.replace('frame: "#2a3038"', "frame: red"), /frame/],
    ["a channel over 255", VALID.replace('"rgb(0 0 0 / 0.55)"', '"rgb(300 0 0 / 0.55)"'), /dark/],
    ["an alpha over 1", VALID.replace('"rgb(0 0 0 / 0.55)"', '"rgb(0 0 0 / 1.5)"'), /dark/],
    ["a length without a unit", VALID.replace("chamfer: 0.5rem", "chamfer: 8"), /chamfer/],
    ["a case it doesn't know", VALID.replace("case: upper", "case: shouting"), /case/],
    ["a weight off the scale", VALID.replace("weight: 700", "weight: 750"), /weight/],
    ["a family that leaves its declaration", VALID.replace('family: "IBM Plex Sans"', 'family: "x; } body { color: red"'), /family/],
    ["an active skin that isn't there", VALID.replace("active: one", "active: two"), /two/],
    ["a kind it doesn't know", VALID.replace("kind: css", "kind: video"), /kind/],
    ["an image skin without a fallback", `${VALID}  pic:\n    kind: image\n    files: {}\n`, /fallback/],
    [
      "an image skin whose fallback is no CSS skin",
      `${VALID}  pic:\n    kind: image\n    fallback: pic\n    files: {}\n`,
      /fallback/,
    ],
    ["a CSS skin with a fallback", VALID.replace("    kind: css", "    kind: css\n    fallback: one"), /fallback/],
    ["no skins", "active: one\nskins: {}\n", /one/],
  ];
  for (const [what, text, named] of refusals)
    it(`refuses ${what}, naming it`, () => {
      expect(() => readSkins(text)).toThrow(named);
    });
});

describe("the generated stylesheet (FR-010)", () => {
  it("is one rule on :root[data-skin] holding every --btn-* of the active skin, and nothing else", () => {
    for (const id of ["metal", "plain"]) {
      const skins = readSkins(TEXT.replace(/^active: .*$/m, `active: ${id}`));
      const resolved = resolveSkin(skins);
      expect(resolved.id).toBe(id);
      const sheet = parseCss(skinCss(resolved));
      expect(sheet.atRules).toEqual([]);
      expect(sheet.rules.map((r) => r.selector)).toEqual([`:root[data-skin="${id}"]`]);
      const declared = [...(sheet.rules[0]?.declarations.keys() ?? [])];
      expect(declared.sort()).toEqual([...PROPERTIES].sort());
      for (const [name, value] of sheet.rules[0]?.declarations ?? []) expect(value, name).not.toBe("");
    }
  });

  it("writes the tokens' values: the face colours, the case, the font with its fallbacks", () => {
    const skins = readSkins(TEXT.replace(/^active: .*$/m, "active: metal"));
    const metal = skins.skins.metal as CssSkin;
    const decl = parseCss(skinCss(resolveSkin(skins))).rules[0]?.declarations;
    expect(decl?.get("--btn-primary-normal-face")).toBe(metal.tokens.primary.normal.face);
    expect(decl?.get("--btn-secondary-selected-glow")).toBe(metal.tokens.secondary.selected.glow);
    expect(decl?.get("--btn-chamfer")).toBe(metal.tokens.chamfer);
    expect(decl?.get("--btn-case")).toBe(metal.tokens.font.case === "upper" ? "uppercase" : "none");
    expect(decl?.get("--btn-font-family")).toBe(`"${metal.tokens.font.family}", system-ui, sans-serif`);
    expect(decl?.get("--btn-font-weight")).toBe(String(metal.tokens.font.weight));
  });

  it("resolves an image skin to its CSS fallback, whole, with the line that says so", () => {
    const text = `${VALID.replace("active: one", "active: pic")}  pic:\n    kind: image\n    fallback: one\n    files: {}\n`;
    const resolved = resolveSkin(readSkins(text));
    expect(resolved.id).toBe("one");
    expect(resolved.line).toBe("pic: falling back to one (image skins not built)");
    expect(skinCss(resolved)).toContain(':root[data-skin="one"]');
  });

  it("names the active CSS skin in its line", () => {
    expect(resolveSkin(readSkins(VALID)).line).toBe("ui-skins: one (css)");
  });

  it("writes data-skin on the page's root element, and only there", () => {
    const html = '<!doctype html>\n<html lang="en">\n<head></head><body><p>html</p></body></html>\n';
    const out = skinHtml(html, "metal");
    expect(out).toBe('<!doctype html>\n<html lang="en" data-skin="metal">\n<head></head><body><p>html</p></body></html>\n');
    expect(skinHtml("<html><body></body></html>", "plain")).toBe('<html data-skin="plain"><body></body></html>');
  });
});

// ---- FR-012's ratios, in sRGB, as spec 029's hud-over-contrast.test.ts computes them ----

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly rgb: Rgb;
  readonly a: number;
}
function colour(v: string): Rgba {
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v.trim());
  if (m) return { rgb: [1, 2, 3].map((i) => parseInt(m?.[i] ?? "0", 16)) as unknown as Rgb, a: 1 };
  m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(v.trim());
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
  m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(v.trim());
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: 1 };
  throw new Error(`not a colour: ${v}`);
}
const over = (top: Rgba, under: Rgb): Rgb =>
  top.rgb.map((c, i) => top.a * c + (1 - top.a) * (under[i] ?? 0)) as unknown as Rgb;
const luminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: Rgb, b: Rgb): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};

const rootOf = (rel: string): Map<string, string> =>
  parseCss(readFileSync(join(WEB, "src", rel), "utf8")).rules.find((r) => r.selector === ":root")?.declarations ??
  new Map();
const ROOM = rootOf("room/room.css");
const SPLIT = rootOf("room/hud/split.css");
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const GLASS = colour(ROOM.get("--glass") ?? "").rgb;
/** The dark pages' ground (spec 030, FR-015, Q9): the glass's colour, opaque. */
const GROUND: Rgb = [16, 20, 26];

/** What lies beside a button: the glass at each alpha the room draws it, over white and over black, and the ground. */
const BESIDE: readonly { name: string; rgb: Rgb }[] = [
  ...[
    ["spec 029's over-room glass", Number(ROOM.get("--over-glass-alpha"))],
    ["spec 005's glass", Number(ROOM.get("--glass-alpha"))],
    ["spec 018's split glass", Number(SPLIT.get("--split-glass-alpha"))],
    ["the glass made opaque", 1],
  ].flatMap(([name, alpha]) =>
    [
      ["white", WHITE],
      ["black", BLACK],
    ].map(([under, rgb]) => ({
      name: `${String(name)} (${String(alpha)}) over ${String(under)}`,
      rgb: over({ rgb: GLASS, a: Number(alpha) }, rgb as Rgb),
    })),
  ),
  { name: "the dark pages' ground", rgb: GROUND },
];

describe("every CSS skin, variant, and state meets FR-012's ratios", () => {
  it("reads the glass's alphas it measures over from room.css and split.css", () => {
    expect(BESIDE.every((b) => b.rgb.every((c) => Number.isFinite(c)))).toBe(true);
    expect(BESIDE).toHaveLength(9);
  });

  const skins = readSkins(TEXT);
  for (const [id, skin] of Object.entries(skins.skins)) {
    if (skin.kind !== "css") continue;
    it(`${id}: every pair at its floor`, () => {
      const failing: string[] = [];
      const t = skin.tokens;
      const highlight = colour(t.highlight);
      for (const variant of VARIANTS)
        for (const state of STATES) {
          const s = t[variant][state];
          const face = colour(s.face);
          const label = colour(s.label);
          const border = colour(s.border);
          const ring = colour(t[variant].ring);
          const check = (what: string, contrast: number, floor: number): void => {
            if (contrast < floor) failing.push(`${id} ${variant} ${state}: ${what} ${contrast.toFixed(2)} under ${floor}`);
          };
          for (const [beneath, under] of [
            ["white", WHITE],
            ["black", BLACK],
          ] as const) {
            const f = over(face, under);
            const lit = over(highlight, f);
            check(`the label on the face over ${beneath}`, ratio(over(label, f), f), 4.5);
            check(`the label on the face's highlight over ${beneath}`, ratio(over(label, lit), lit), 4.5);
            check(`the border against the face over ${beneath}`, ratio(over(border, f), f), 3);
            check(`the focus ring inside the face over ${beneath}`, ratio(over(ring, f), f), 3);
            check(`the focus ring inside the face's highlight over ${beneath}`, ratio(over(ring, lit), lit), 3);
          }
          for (const b of BESIDE) {
            const edge = Math.max(ratio(over(border, b.rgb), b.rgb), ratio(over(face, b.rgb), b.rgb));
            check(`the edge (border or face) against ${b.name}`, edge, 3);
          }
        }
      expect(failing).toEqual([]);
    });
  }
});

// ---- The swap (SC-004) ----

describe("swapping the skin is an edit of the data alone (SC-004)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** The plugin's stylesheet and page for one copy of the skin file, through its hooks, as Vite calls them. */
  function build(text: string): { css: string; html: string; printed: string[] } {
    const dir = mkdtempSync(join(tmpdir(), "h4-ui-skins-"));
    dirs.push(dir);
    const source = join(dir, "ui-skins.yaml");
    writeFileSync(source, text);
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(" "));
    });
    const plugin = uiSkins({ source });
    const { context, watched } = hookContext();
    callHook(plugin, "buildStart", context, {});
    expect(watched).toContain(source);
    const id = callHook(plugin, "resolveId", context, SKIN_MODULE, undefined, {});
    expect(typeof id).toBe("string");
    const css = callHook(plugin, "load", context, id);
    const hook: unknown = plugin.transformIndexHtml;
    const handler = typeof hook === "function" ? hook : (hook as { handler?: unknown } | undefined)?.handler;
    if (typeof handler !== "function") throw new Error("the plugin has no transformIndexHtml hook");
    const html = (handler as (h: string, c: unknown) => unknown).call(context, '<html lang="en"><body></body></html>', {
      path: "/index.html",
    });
    vi.restoreAllMocks();
    return { css: String(css), html: String(html), printed };
  }

  it("builds metal from the repository's file and plain from a copy whose one difference is `active: plain`", () => {
    expect(readSkins(TEXT).active).toBe("metal");
    const swapped = TEXT.replace(/^active: metal$/m, "active: plain");
    const changed = TEXT.split("\n").filter((line, i) => line !== swapped.split("\n")[i]);
    expect(changed).toEqual(["active: metal"]);

    const a = build(TEXT);
    const b = build(swapped);
    expect(a.html).toBe('<html lang="en" data-skin="metal"><body></body></html>');
    expect(b.html).toBe('<html lang="en" data-skin="plain"><body></body></html>');
    expect(a.printed).toEqual(["ui-skins: metal (css)"]);
    expect(b.printed).toEqual(["ui-skins: plain (css)"]);
    const plain = readSkins(swapped).skins.plain as CssSkin;
    const decl = parseCss(b.css).rules[0]?.declarations;
    expect(parseCss(b.css).rules[0]?.selector).toBe(':root[data-skin="plain"]');
    for (const variant of VARIANTS)
      for (const state of STATES) expect(decl?.get(`--btn-${variant}-${state}-face`)).toBe(plain.tokens[variant][state].face);
    expect(a.css).not.toBe(b.css);
  });

  it("serves the stylesheet as a CSS module, and nothing for another ID", () => {
    const plugin = uiSkins({ source: SOURCE });
    const { context } = hookContext();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    callHook(plugin, "buildStart", context, {});
    const id = callHook(plugin, "resolveId", context, SKIN_MODULE, undefined, {});
    expect(String(id).endsWith(".css")).toBe(true);
    expect(callHook(plugin, "resolveId", context, "./main.ts", undefined, {})).toBeNull();
    expect(callHook(plugin, "load", context, "/src/main.ts")).toBeNull();
  });
});
