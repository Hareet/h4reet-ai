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

/** A selector's specificity, [ids, classes and attributes and pseudo-classes, types and pseudo-elements], for the
 *  plain selectors room.css writes (no :is, :not, :where, or :has). */
function specificity(selector: string): [number, number, number] {
  let s = selector;
  const take = (re: RegExp): number => {
    const n = (s.match(re) ?? []).length;
    s = s.replace(re, " ");
    return n;
  };
  const attributes = take(/\[[^\]]*\]/g);
  const elements = take(/::[\w-]+/g);
  const pseudo = take(/:[\w-]+(\([^)]*\))?/g);
  const ids = take(/#[\w-]+/g);
  const classes = take(/\.[\w-]+/g);
  const types = take(/(^|[\s>+~])[a-zA-Z][\w-]*/g);
  return [ids, classes + attributes + pseudo, types + elements];
}

const outranks = (a: [number, number, number], b: [number, number, number]): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

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

  // In the HUD's layouts: in the stacked layout the bar and the panels keep spec 004's page buttons.
  const HUD = 'html[data-hud="column"]';
  const DOCK = 'html[data-hud="dock"]';

  it("draws the HUD from the palette: the glass, the tiles, their borders, the focus ring, and the pressed mark", () => {
    const GLASS = "rgb(var(--glass) / var(--glass-alpha))";
    for (const at of [HUD, DOCK]) {
      expect(declared(`${at} .hud-glass`, "background"), at).toBe(GLASS);
      expect(declared(`${at} .hud-glass`, "color"), at).toBe("var(--hud-text)");
      expect(declared(`${at} .hud-tile`, "background"), at).toBe("var(--tile-face)");
      expect(declared(`${at} .hud-tile`, "color"), at).toBe("var(--hud-text)");
      expect(declared(`${at} .hud-tile`, "border"), at).toBe("1px solid var(--tile-border)");
      expect(declared(`${at} .hud-glass button:focus-visible`, "outline"), at).toBe("2px solid var(--hud-focus)");
      expect(declared(`${at} .hud-glass a:focus-visible`, "outline"), at).toBe("2px solid var(--hud-focus)");
      // The conversation's text box too, on the panels' glass (the review of 60b51de4, finding 4; FR-024, SC-003): the
      // room's blue ring falls below 3:1 on the dark glass.
      expect(declared(`${at} .hud-glass input:focus-visible`, "outline"), at).toBe("2px solid var(--hud-focus)");
      expect(declared(`${at} .hud-glass input:focus-visible`, "outline-offset"), at).toBe("2px");
      expect(declared(`${at} .hud-tile[aria-pressed="true"]`, "box-shadow"), at).toBe(
        "inset 0 0 0 2px var(--hud-text)",
      );
      expect(declared(`${at} .hud-tile[aria-pressed="true"]`, "text-decoration"), at).toBe("underline");
      // The walking control, over the scene with no panel behind it, is glass of its own.
      expect(declared(`${at} .room-walk`, "background"), at).toBe(GLASS);
      expect(declared(`${at} .room-walk`, "color"), at).toBe("var(--hud-text)");
    }
  });

  // The review of 60b51de4's nit: the fallbacks for less transparency, more contrast, no backdrop blur, and forced
  // colours lost to the HUD's own rules, which name the root's attributes. Each now outranks the rule it undoes.
  it("lets each fallback outrank the HUD's rule it undoes", () => {
    expect(specificity('html[data-blur="on"] .hud-glass')).toEqual([0, 2, 1]);
    expect(specificity(":root[data-hud] .hud-glass button:focus-visible")).toEqual([0, 4, 1]);
    const FALLBACKS: [RegExp, string, string, string][] = [];
    for (const block of [/prefers-reduced-transparency/, /prefers-contrast: more/, /^@supports not/, /forced-colors/])
      for (const p of ["backdrop-filter", "-webkit-backdrop-filter"])
        FALLBACKS.push([block, p, "none", 'html[data-blur="on"] .hud-glass']);
    for (const at of [HUD, DOCK])
      FALLBACKS.push(
        [/forced-colors/, "background", "Canvas", `${at} .hud-glass`],
        [/forced-colors/, "color", "CanvasText", `${at} .hud-glass`],
        [/forced-colors/, "background", "ButtonFace", `${at} .hud-tile`],
        [/forced-colors/, "color", "ButtonText", `${at} .hud-tile`],
        [/forced-colors/, "outline-color", "Highlight", `${at} .hud-glass button:focus-visible`],
        [/forced-colors/, "outline-color", "Highlight", `${at} .hud-glass input:focus-visible`],
        [/forced-colors/, "outline-color", "Highlight", `${at} .hud-glass.room-walk:focus-visible`],
      );
    const losing: string[] = [];
    for (const [block, property, value, rule] of FALLBACKS) {
      const selectors = SHEET.atRules
        .filter((a) => block.test(a.prelude))
        .flatMap((a) => parseCss(a.body).rules)
        .filter((r) => r.declarations.get(property) === value)
        .flatMap((r) => r.selector.split(",").map((s) => s.trim()));
      if (!selectors.some((s) => outranks(specificity(s), specificity(rule))))
        losing.push(`${String(block)} ${property}: ${value} under ${rule}`);
    }
    expect(losing).toEqual([]);
  });

  // The review of 60b51de4's nit: the walking view's ring sat at the window's edge, under the HUD. It is drawn at the
  // clear area: the HUD's yellow outside and a band of the glass's colour inside, so one of them reaches 3:1 over any
  // scene pixel, white or black.
  it("draws the walking view's focus at the clear area, yellow over a dark band, at 3:1 over white and black", () => {
    for (const at of [HUD, DOCK]) {
      const view = `${at} .room-stage-view[role="application"]:focus-visible`;
      expect(declared(view, "outline"), at).toBe("none");
      expect(declared(`${view} + .room-clear`, "outline"), at).toBe("3px solid var(--hud-focus)");
      expect(declared(`${view} + .room-clear`, "outline-offset"), at).toBe("-3px");
      expect(declared(`${view} + .room-clear`, "box-shadow"), at).toBe("inset 0 0 0 5px rgb(var(--glass))");
    }
    const p = palette();
    expect(ratio(colour(p.get("--hud-focus") ?? "").rgb, BLACK)).toBeGreaterThanOrEqual(3);
    expect(ratio(colour(p.get("--glass") ?? "").rgb, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it("blurs behind the glass only under data-blur on, in both its forms, and never relies on it (PD-17)", () => {
    const on = 'html[data-blur="on"] .hud-glass';
    expect(declared(on, "backdrop-filter")).toBe("var(--hud-blur)");
    expect(declared(on, "-webkit-backdrop-filter")).toBe("var(--hud-blur)");
    expect(declared(`${HUD} .hud-glass`, "backdrop-filter")).toBeUndefined();
    expect(palette().get("--hud-blur")).toBe("blur(12px)");
  });
});

// T025 (spec 014; FR-025, FR-026; SC-004; plan.md §4, PD-8): the look's new pairs, computed from the same palette over
// white and over black beneath. The notes' chips (the glass's colour at its opacity) with their light words; the neon's
// warm accent edge against the glass and against a tile; a hovered or selected tile's lighter face with its words; and
// the headings' words on the glass. The glass's opacity stays the lowest 5% step at which every pair passes, the new
// ones among them.
const HUD_AT = 'html[data-hud="column"]';
const DOCK_AT = 'html[data-hud="dock"]';
const declaredAt = (selector: string, property: string): string | undefined =>
  rulesFor(selector)
    .filter((r) => r.declarations.has(property))
    .at(-1)
    ?.declarations.get(property);

describe("the look's new pairs (spec 014, T025)", () => {
  function newPairs(alpha: number): { name: string; contrast: number; floor: number }[] {
    const p = palette();
    const glassRgb = colour(p.get("--glass") ?? "").rgb;
    const text = colour(p.get("--hud-text") ?? "").rgb;
    const face = colour(p.get("--tile-face") ?? "");
    const lit = colour(p.get("--tile-face-lit") ?? "");
    const accent = colour(p.get("--accent-neon") ?? "").rgb;
    const out: { name: string; contrast: number; floor: number }[] = [];
    for (const [beneath, under] of [
      ["white", WHITE],
      ["black", BLACK],
    ] as const) {
      const glass = over({ rgb: glassRgb, a: alpha }, under);
      const chip = over({ rgb: glassRgb, a: alpha }, under);
      const tile = over(face, glass);
      const litTile = over(lit, glass);
      out.push(
        { name: `a chip's words over ${beneath}`, contrast: ratio(text, chip), floor: 4.5 },
        { name: `the accent edge against the glass over ${beneath}`, contrast: ratio(accent, glass), floor: 3 },
        { name: `the accent edge against a tile over ${beneath}`, contrast: ratio(accent, tile), floor: 3 },
        { name: `the accent edge against a lit tile over ${beneath}`, contrast: ratio(accent, litTile), floor: 3 },
        { name: `a lit tile's words over ${beneath}`, contrast: ratio(text, litTile), floor: 4.5 },
        { name: `a heading's words on the glass over ${beneath}`, contrast: ratio(text, glass), floor: 4.5 },
      );
    }
    return out;
  }
  const failingNew = (alpha: number): string[] =>
    newPairs(alpha)
      .filter((x) => x.contrast < x.floor)
      .map((x) => `${x.name}: ${x.contrast.toFixed(2)} under ${x.floor}`);

  it("passes every new pair at the glass's opacity, and fails one a step below with the old pairs", () => {
    const alpha = Number(palette().get("--glass-alpha"));
    expect(failingNew(alpha)).toEqual([]);
    expect(alpha).toBe(0.6);
    expect([...failing(alpha - 0.05), ...failingNew(alpha - 0.05)].length).toBeGreaterThan(0);
  });

  it("passes every new pair where the glass is opaque", () => {
    expect(failingNew(1)).toEqual([]);
  });

  it("draws the chips, the accent, and the lit face from the palette", () => {
    for (const at of [HUD_AT, DOCK_AT]) {
      expect(declaredAt(`${at} .room-note`, "background"), at).toBe("var(--chip-face)");
      // T053 (the review's I3): the hover names the HUD's buttons, only where the pointer hovers; the selection too.
      const hover = rulesFor(`${at} .hud-panels button:hover`, /\(hover: hover\)/);
      expect(hover.at(-1)?.declarations.get("border-color"), at).toBe("var(--accent-neon)");
      expect(hover.at(-1)?.declarations.get("background"), at).toBe("var(--tile-face-lit)");
      expect(declaredAt(`${at} .hud-panels button[aria-current="true"]`, "border-color"), at).toBe(
        "var(--accent-neon)",
      );
    }
  });
});

// T053 (spec 014, the review's I2 and I3): the hand-off offer's buttons take the yellow ring on the glass, not the
// page's #0b4f9c (about 1.7:1 there); the walking control's hover face, the glass at --glass-alpha-lit, keeps its words
// at 4.5:1 over a white scene, and turns opaque where the visitor asks for less transparency or more contrast.
describe("the offer's focus ring and the walking control's hover (spec 014, T053)", () => {
  it("rings the offer's buttons in the highlight's yellow, at 3:1 over the glass on white and on black", () => {
    for (const layout of ["column", "dock"]) {
      const at = `html[data-hud="${layout}"] .room-offer button:focus-visible`;
      expect(declared(at, "outline"), at).toBe("2px solid var(--hud-focus)");
    }
    const glass = colour(`${palette().get("--glass")} `.trim());
    const alpha = Number(palette().get("--glass-alpha"));
    const yellow = colour(palette().get("--hud-focus") ?? "").rgb;
    for (const under of [WHITE, BLACK])
      expect(ratio(yellow, over({ rgb: glass.rgb, a: alpha }, under))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the walking control's hover words at 4.5:1 over a white scene, opaque under the two preferences", () => {
    const lit = Number(palette().get("--glass-alpha-lit"));
    expect(lit).toBeGreaterThanOrEqual(Number(palette().get("--glass-alpha")));
    const glass = colour(palette().get("--glass") ?? "").rgb;
    const text = colour(palette().get("--hud-text") ?? "").rgb;
    expect(ratio(text, over({ rgb: glass, a: lit }, WHITE))).toBeGreaterThanOrEqual(4.5);
    for (const prelude of [/prefers-reduced-transparency: reduce/, /prefers-contrast: more/]) {
      const root = rulesFor(":root", prelude).find((r) => r.declarations.has("--glass-alpha-lit"));
      expect(root?.declarations.get("--glass-alpha-lit"), String(prelude)).toBe("1");
    }
  });
});
