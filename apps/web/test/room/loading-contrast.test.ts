// T025's contrast half (spec 012; FR-041; SC-006; plan.md §5.4, PD-11): the loader's card, computed as
// test/room/hud-contrast.test.ts computes the HUD's: the glass composited over pure white and pure black, the brightest
// and darkest a scene or page pixel can be, at room.css's alpha. White text on the card at 4.5:1 or more; the bar's
// yellow fill against its track, the track's edge against the glass, and the yellow focus ring at 3:1 or more; the
// controls' words on their tile faces at 4.5:1. The colours come from loading.css's rules and room.css's palette, so
// this judges what the visitor sees.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCss } from "../helpers/room";

const ROOM = parseCss(readFileSync(fileURLToPath(new URL("../../src/room/room.css", import.meta.url)), "utf8"));
const LOADING = parseCss(
  readFileSync(fileURLToPath(new URL("../../src/room/loading/loading.css", import.meta.url)), "utf8"),
);

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly rgb: Rgb;
  readonly a: number;
}

const palette = (): Map<string, string> => {
  const root = ROOM.rules.find((r) => r.selector === ":root");
  if (!root) throw new Error("room.css has no :root rule");
  return root.declarations;
};

/** A colour: #rrggbb, rgb(r g b / a), "r g b", or var(--name) of the palette. */
function colour(value: string): Rgba {
  const v = value.trim();
  const named = /^var\((--[a-z-]+)\)$/.exec(v);
  if (named) return colour(palette().get(named[1] ?? "") ?? "");
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  if (m) return { rgb: [1, 2, 3].map((i) => parseInt(m?.[i] ?? "0", 16)) as unknown as Rgb, a: 1 };
  m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(v);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
  m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(v);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: 1 };
  throw new Error(`not a colour this test reads: ${v}`);
}

const over = (top: Rgba, under: Rgb): Rgb =>
  top.rgb.map((c, i) => top.a * c + (1 - top.a) * (under[i] ?? 0)) as unknown as Rgb;

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

/** A declaration of loading.css's first top-level rule naming `selector` in its list. */
function declared(selector: string, property: string): string {
  const rule = LOADING.rules.find(
    (r) =>
      r.selector
        .split(",")
        .map((s) => s.trim())
        .includes(selector) && r.declarations.has(property),
  );
  const value = rule?.declarations.get(property);
  if (value === undefined) throw new Error(`loading.css has no ${property} for ${selector}`);
  return value;
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** Every pair the card draws, over white and over black beneath. */
function pairs(): { name: string; contrast: number; floor: number }[] {
  const p = palette();
  const alpha = Number(p.get("--glass-alpha"));
  const glassRgb = colour(p.get("--glass") ?? "").rgb;
  const text = colour(declared(".room-loader", "color")).rgb;
  const track = colour(declared(".room-loader-bar", "background"));
  const edge = colour(
    /(rgb\([^)]*\)|var\([^)]*\)|#[0-9a-f]{6})$/i.exec(declared(".room-loader-bar", "border"))?.[1] ?? "",
  );
  const fill = colour(declared(".room-loader-fill", "background")).rgb;
  const ring = colour(
    /(var\([^)]*\))$/.exec(declared(":root .room-loader button:focus-visible", "outline"))?.[1] ?? "",
  ).rgb;
  const face = colour(declared(":root .room-loader button", "background"));
  const words = colour(declared(":root .room-loader button", "color")).rgb;
  const out: { name: string; contrast: number; floor: number }[] = [];
  for (const [beneath, under] of [
    ["white", WHITE],
    ["black", BLACK],
  ] as const) {
    const glass = over({ rgb: glassRgb, a: alpha }, under);
    const trackOn = over(track, glass);
    const tile = over(face, glass);
    out.push(
      { name: `text on the card over ${beneath}`, contrast: ratio(text, glass), floor: 4.5 },
      { name: `the fill against its track over ${beneath}`, contrast: ratio(fill, trackOn), floor: 3 },
      {
        name: `the track's edge against the card over ${beneath}`,
        contrast: ratio(over(edge, glass), glass),
        floor: 3,
      },
      { name: `the focus ring against the card over ${beneath}`, contrast: ratio(ring, glass), floor: 3 },
      { name: `a control's words on its tile over ${beneath}`, contrast: ratio(words, tile), floor: 4.5 },
    );
  }
  return out;
}

describe("the card's contrast (FR-041)", () => {
  it("reads its colours from loading.css and room.css's palette", () => {
    expect(declared(".room-loader", "background")).toBe("rgb(var(--glass) / var(--glass-alpha))");
    expect(declared(".room-loader-fill", "background")).toBe("var(--hud-focus)");
    expect(palette().get("--glass-alpha")).toBe("0.6");
  });

  it("passes every pair over white and over black beneath", () => {
    const failing = pairs().filter((p) => p.contrast < p.floor);
    expect(failing.map((p) => `${p.name}: ${p.contrast.toFixed(2)}:1, under ${p.floor}:1`)).toEqual([]);
    expect(pairs()).toHaveLength(10);
  });
});
