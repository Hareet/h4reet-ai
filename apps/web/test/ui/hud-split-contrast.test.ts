// T013 (spec 018; FR-014, SC-003): the split layout's legibility, computed from split.css's and room.css's palette as
// browsers blend it, in sRGB, as test/room/hud-contrast.test.ts does: the panel's and the list's glass over pure white
// and over pure black, the brightest and darkest a scene pixel can be. Every text reaches 4.5:1; the accent entry, which
// is large (1.5rem), 3:1, and in fact 4.5:1 too, so a smaller use of it would pass; and the glass is opaque where the
// visitor asks for less transparency or more contrast.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCss } from "../helpers/room";

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const ROOM = parseCss(read("../../src/room/room.css"));
const SPLIT = read("../../src/room/hud/split.css");
const SPLIT_SHEET = parseCss(SPLIT);

type Rgb = readonly [number, number, number];
const props = (sheet: ReturnType<typeof parseCss>): Map<string, string> =>
  sheet.rules.find((r) => r.selector === ":root")?.declarations ?? new Map();
const ROOM_P = props(ROOM);
const SPLIT_P = props(SPLIT_SHEET);

const hex = (v: string): Rgb => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v.trim());
  if (!m) throw new Error(`not a hex colour: ${v}`);
  return [parseInt(m[1] ?? "0", 16), parseInt(m[2] ?? "0", 16), parseInt(m[3] ?? "0", 16)];
};
const resolve = (v: string): string => {
  const m = /^var\((--[a-z-]+)\)$/.exec(v.trim());
  return m ? resolve(SPLIT_P.get(m[1] ?? "") ?? ROOM_P.get(m[1] ?? "") ?? "") : v.trim();
};
const glassRgb = (): Rgb => {
  const m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(ROOM_P.get("--glass") ?? "");
  return [Number(m?.[1]), Number(m?.[2]), Number(m?.[3])];
};
const over = (rgb: Rgb, a: number, under: Rgb): Rgb =>
  rgb.map((c, i) => a * c + (1 - a) * (under[i] ?? 0)) as unknown as Rgb;
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

const alpha = Number(SPLIT_P.get("--split-glass-alpha"));
const colours = {
  text: hex(ROOM_P.get("--hud-text") ?? ""),
  muted: hex(resolve(SPLIT_P.get("--split-muted") ?? "")),
  accent: hex(resolve(SPLIT_P.get("--split-accent") ?? "")),
  border: hex(ROOM_P.get("--hud-focus") ?? ""),
};

describe("the split layout's contrast (FR-014)", () => {
  it("reads its numbers from the stylesheets", () => {
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  });
  for (const [beneath, under] of [
    ["white", [255, 255, 255]],
    ["black", [0, 0, 0]],
  ] as [string, Rgb][]) {
    it(`gives every text 4.5:1 over the glass over ${beneath}, and the accent entry 4.5:1 too`, () => {
      const glass = over(glassRgb(), alpha, under);
      expect(ratio(colours.text, glass), "text").toBeGreaterThanOrEqual(4.5);
      expect(ratio(colours.muted, glass), "muted entries and labels").toBeGreaterThanOrEqual(4.5);
      expect(ratio(colours.accent, glass), "accent entry").toBeGreaterThanOrEqual(4.5);
      expect(ratio(colours.accent, glass), "accent as large text").toBeGreaterThanOrEqual(3);
    });
  }
  it("is opaque where the visitor asks for less transparency or more contrast", () => {
    const at = SPLIT_SHEET.atRules.find(
      (a) => /prefers-reduced-transparency/.test(a.prelude) && /prefers-contrast/.test(a.prelude),
    );
    expect(at?.body).toMatch(/--split-glass-alpha:\s*1\b/);
  });
  it("keeps the focus ring the HUD's yellow on the glass, 3:1", () => {
    const glass = over(glassRgb(), alpha, [255, 255, 255]);
    expect(ratio(colours.border, glass)).toBeGreaterThanOrEqual(3);
  });
});

// T027 (rv2-impl-018's B2; FR-014, SC-003): the open panel's title row, the title toggle and the hint, sits above the
// frame, so the frame's glass is not behind it: it has the panel's glass of its own. Every rule of split.css that sets
// type or colour on the open panel's text names a part that one of the two glasses backs.
describe("the open panel's text on glass (T027; FR-014, B2)", () => {
  const ON = 'html[data-split="on"][data-hud="column"]';
  const OPEN = `${ON} .talk[data-panel="open"]`;
  const GLASS = "rgb(var(--glass) / var(--split-glass-alpha))";
  const rule = (selector: string, property: string): string | undefined =>
    SPLIT_SHEET.rules
      .filter(
        (r) =>
          r.selector
            .split(",")
            .map((x) => x.trim())
            .includes(selector) && r.declarations.has(property),
      )
      .at(-1)
      ?.declarations.get(property);

  it("puts the panel's glass behind the title row, and the frame's behind the rest", () => {
    expect(rule(`${OPEN} .talk-head`, "background")).toBe(GLASS);
    expect(rule(`${ON} .split-frame path`, "fill")).toBe(GLASS);
    expect(rule(`${OPEN}.split-plain`, "background")).toBe(GLASS);
  });

  for (const [beneath, under] of [
    ["white", [255, 255, 255]],
    ["black", [0, 0, 0]],
  ] as [string, Rgb][])
    it(`gives the title 4.5:1 over the title row's glass over ${beneath}`, () => {
      const glass = over(glassRgb(), alpha, under);
      expect(ratio(colours.text, glass)).toBeGreaterThanOrEqual(4.5);
    });

  it("makes the title row's glass opaque under reduced transparency and more contrast, and Canvas in forced colours", () => {
    expect(rule(`${OPEN} .talk-head`, "background")).toContain("var(--split-glass-alpha)");
    const forced = SPLIT_SHEET.atRules.find((a) => /forced-colors:\s*active/.test(a.prelude));
    expect(forced?.body).toMatch(/\.talk\[data-panel="open"\] \.talk-head[^{]*\{[^}]*background:\s*Canvas/);
  });

  it("sets the open panel's type and colour only on parts a glass backs", () => {
    const TITLE_ROW = [".talk-head", ".talk-log-toggle", ".split-hint"];
    const IN_FRAME = [".split-top", ".split-stat", ".split-emblem", ".talk-log", ".talk-status", ".talk-form"];
    const unbacked: string[] = [];
    for (const r of SPLIT_SHEET.rules)
      for (const sel of r.selector.split(",").map((x) => x.trim())) {
        if (!sel.includes('[data-panel="open"]')) continue;
        if (![...r.declarations.keys()].some((k) => /^(color|font|font-size|font-family)$/.test(k))) continue;
        if (![...TITLE_ROW, ...IN_FRAME].some((part) => sel.includes(part))) unbacked.push(sel);
      }
    expect(unbacked).toEqual([]);
  });
});
