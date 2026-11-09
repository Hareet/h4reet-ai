// T019 (spec 005; FR-006, FR-024, FR-025; SC-003; plan.md §6.7, PD-16, PD-17): the HUD's legibility, computed from
// room.css's palette as browsers blend it, in sRGB. The dark glass is composited over pure white and over pure black,
// the brightest and darkest a scene pixel can be, and the tile face over that; every text pair reaches 4.5:1, and every
// border, focus ring, and pressed mark 3:1, so the floor holds over any part of any look, in 3D and 2D, with or without
// the blur. The glass's alpha is the lowest 5% step at which all pass: the step below fails at least one pair. The rules
// that draw the HUD take their colours from the palette, so this test judges what the visitor sees.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCss } from "../helpers/room";
import type { CssRule } from "../helpers/room";

const CSS = readFileSync(fileURLToPath(new URL("../../src/room/room.css", import.meta.url)), "utf8");
const SHEET = parseCss(CSS);

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly rgb: Rgb;
  readonly a: number;
}

/** The :root rule's custom properties, the palette. */
function palette(): Map<string, string> {
  const root = SHEET.rules.find((r) => r.selector === ":root");
  if (!root) throw new Error("room.css has no :root rule");
  return root.declarations;
}

/** A colour of the palette: #rrggbb, rgb(r g b / a), or the glass's own "r g b" with its alpha. */
function colour(value: string): Rgba {
  const v = value.trim();
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  if (m) return { rgb: [1, 2, 3].map((i) => parseInt(m?.[i] ?? "0", 16)) as unknown as Rgb, a: 1 };
  m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(v);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
  m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(v);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: 1 };
  throw new Error(`not a colour room.css's palette uses: ${v}`);
}

/** `top` over an opaque `under`, blended in sRGB's encoded values, as browsers composite. */
const over = (top: Rgba, under: Rgb): Rgb =>
  top.rgb.map((c, i) => top.a * c + (1 - top.a) * (under[i] ?? 0)) as unknown as Rgb;

/** WCAG's relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

const ratio = (a: Rgb, b: Rgb): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** Every pair the HUD draws, at a glass alpha: its contrast, and the floor it must reach. */
function pairs(alpha: number): { name: string; contrast: number; floor: number }[] {
  const p = palette();
  const glassRgb = colour(p.get("--glass") ?? "").rgb;
  const text = colour(p.get("--hud-text") ?? "").rgb;
  const face = colour(p.get("--tile-face") ?? "");
  const border = colour(p.get("--tile-border") ?? "");
  const focus = colour(p.get("--hud-focus") ?? "").rgb;
  const out: { name: string; contrast: number; floor: number }[] = [];
  for (const [beneath, under] of [
    ["white", WHITE],
    ["black", BLACK],
  ] as const) {
    const glass = over({ rgb: glassRgb, a: alpha }, under);
    const tile = over(face, glass);
    out.push(
      { name: `text on the glass over ${beneath}`, contrast: ratio(text, glass), floor: 4.5 },
      { name: `text on a tile over ${beneath}`, contrast: ratio(text, tile), floor: 4.5 },
      { name: `a tile's border on the glass over ${beneath}`, contrast: ratio(over(border, glass), glass), floor: 3 },
      { name: `the focus ring on the glass over ${beneath}`, contrast: ratio(focus, glass), floor: 3 },
      { name: `the focus ring on a tile over ${beneath}`, contrast: ratio(focus, tile), floor: 3 },
      // The pressed mark: an inset ring in the text's colour inside the tile, and its words underlined.
      { name: `the pressed mark on a tile over ${beneath}`, contrast: ratio(text, tile), floor: 3 },
    );
  }
  return out;
}

const failing = (alpha: number): string[] =>
  pairs(alpha)
    .filter((x) => x.contrast < x.floor)
    .map((x) => `${x.name}: ${x.contrast.toFixed(2)} under ${x.floor}`);

/** The rules matching a selector exactly, from the sheet's top level and every at-rule's body. */
function rulesFor(selector: string, prelude: RegExp | null = null): CssRule[] {
  const top = prelude ? [] : SHEET.rules;
  const nested = SHEET.atRules
    .filter((a) => (prelude ? prelude.test(a.prelude) : false))
    .flatMap((a) => parseCss(a.body).rules);
  return [...top, ...nested].filter((r) => r.selector.split(",").some((s) => s.trim() === selector));
}

const declared = (selector: string, property: string): string | undefined =>
  rulesFor(selector)
    .filter((r) => r.declarations.has(property))
    .at(-1)
    ?.declarations.get(property);

describe("the HUD's palette (room.css; FR-024, FR-025)", () => {
  it("reaches 4.5:1 for every text and 3:1 for every border, focus ring, and pressed mark, over white and black", () => {
    const alpha = Number(palette().get("--glass-alpha"));
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
    expect(failing(alpha)).toEqual([]);
  });

  it("sets the glass at the lowest 5% step at which every pair passes: the step below fails one", () => {
    const alpha = Number(palette().get("--glass-alpha"));
    expect(Math.round(alpha * 20)).toBeCloseTo(alpha * 20, 9);
    expect(failing(alpha - 0.05).length, `at ${(alpha - 0.05).toFixed(2)}`).toBeGreaterThan(0);
    // The floor this palette gives, the plan's starting estimate, 0.60.
    expect(alpha).toBe(0.6);
  });

  it("makes the glass opaque where the fallbacks hold, and every pair passes there too", () => {
    for (const prelude of [
      /^@media \(prefers-reduced-transparency: reduce\)$/,
      /^@media \(prefers-contrast: more\)$/,
      /^@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)$/,
    ])
      expect(
        rulesFor(":root", prelude).some((r) => r.declarations.get("--glass-alpha") === "1"),
        String(prelude),
      ).toBe(true);
    expect(failing(1)).toEqual([]);
  });

  it("draws the HUD from the palette: the glass, the tiles, their borders, the focus ring, and the pressed mark", () => {
    const GLASS = "rgb(var(--glass) / var(--glass-alpha))";
    expect(declared(".hud-glass", "background")).toBe(GLASS);
    expect(declared(".hud-glass", "color")).toBe("var(--hud-text)");
    expect(declared(".hud-tile", "background")).toBe("var(--tile-face)");
    expect(declared(".hud-tile", "color")).toBe("var(--hud-text)");
    expect(declared(".hud-tile", "border")).toBe("1px solid var(--tile-border)");
    expect(declared(".hud-glass button:focus-visible", "outline")).toBe("2px solid var(--hud-focus)");
    expect(declared(".hud-glass a:focus-visible", "outline")).toBe("2px solid var(--hud-focus)");
    expect(declared('.hud-tile[aria-pressed="true"]', "box-shadow")).toBe("inset 0 0 0 2px var(--hud-text)");
    expect(declared('.hud-tile[aria-pressed="true"]', "text-decoration")).toBe("underline");
  });

  it("blurs behind the glass only under data-blur on, in both its forms, and never relies on it (PD-17)", () => {
    const on = 'html[data-blur="on"] .hud-glass';
    expect(declared(on, "backdrop-filter")).toBe("var(--hud-blur)");
    expect(declared(on, "-webkit-backdrop-filter")).toBe("var(--hud-blur)");
    expect(declared(".hud-glass", "backdrop-filter")).toBeUndefined();
    expect(palette().get("--hud-blur")).toBe("blur(12px)");
  });
});
