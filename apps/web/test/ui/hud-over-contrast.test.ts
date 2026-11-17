// T-A01 (spec 029; FR-002 to FR-004, FR-006; SC-002; plan.md §R-A3, §R-A4): the legibility of a HUD part over the
// room, computed from room.css's and split.css's palette as browsers blend it, in sRGB, as
// test/ui/hud-split-contrast.test.ts and test/room/hud-contrast.test.ts do. Over the room a part's glass drops to
// --over-glass-alpha, and each run of words sits on a plate at --over-plate-alpha over that glass; both are composited
// over pure white and pure black, the brightest and darkest pixel the room can put beneath. Every text reaches 4.5:1
// (the large accent entry 3:1); every border, icon, and the focus ring 3:1, the ring drawn inside its control (or on
// its plate), never on the bare translucent glass. The tiles keep their own faces, which carry their words, icons, and
// rings over the translucent glass (FR-006): --over-glass-alpha is the lowest 5% step at which they do, and
// --over-plate-alpha the lowest 5% step at which every pair on a plate holds over that glass (FR-003). Under the
// visitor's asks (less transparency, more contrast, forced colours) both are 1 (FR-004). Spec 030 (T-INT02; Q73): the
// controls the skin draws take their faces, labels, lines, and rings from the skin the build ships, so their pairs
// read its tokens; the tiles' pairs name the tiles the skin leaves (was: every tile, and the walking control's face
// the glass at --glass-alpha).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SKIN_STATES, SKIN_VARIANTS, builtSkin, stateColours } from "../helpers/built-skin";
import { parseCss } from "../helpers/room";

/** The skin the build ships (spec 030, T-INT02; Q73): its tokens on :root[data-skin="<id>"]. */
const SKIN = builtSkin();

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const ROOM = parseCss(read("../../src/room/room.css"));
const SPLIT = parseCss(read("../../src/room/hud/split.css"));

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly rgb: Rgb;
  readonly a: number;
}

const props = (sheet: ReturnType<typeof parseCss>): Map<string, string> =>
  sheet.rules.find((r) => r.selector === ":root")?.declarations ?? new Map();
const ROOM_P = props(ROOM);
const SPLIT_P = props(SPLIT);

const resolve = (v: string): string => {
  const m = /^var\((--[a-z-]+)\)$/.exec(v.trim());
  return m ? resolve(SPLIT_P.get(m[1] ?? "") ?? ROOM_P.get(m[1] ?? "") ?? "") : v.trim();
};
/** A colour of the palette: #rrggbb, rgb(r g b / a), or the glass's own "r g b". */
function colour(value: string): Rgba {
  const v = resolve(value);
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  if (m) return { rgb: [1, 2, 3].map((i) => parseInt(m?.[i] ?? "0", 16)) as unknown as Rgb, a: 1 };
  m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(v);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
  m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(v);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: 1 };
  throw new Error(`not a colour the palette uses: ${value}`);
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

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const num = (name: string): number => Number(ROOM_P.get(name));
const GLASS_ALPHA = num("--over-glass-alpha");
const PLATE_ALPHA = num("--over-plate-alpha");

interface Pair {
  readonly name: string;
  readonly contrast: number;
  readonly floor: number;
  /** Whether the pair is on a tile's face (FR-006), which the glass's alpha alone decides. */
  readonly tile: boolean;
}

/** Every pair a part over the room draws, at a glass and a plate alpha, over white and over black. */
function pairs(glassAlpha: number, plateAlpha: number): Pair[] {
  const glassRgb = colour(ROOM_P.get("--glass") ?? "").rgb;
  const text = colour(ROOM_P.get("--hud-text") ?? "").rgb;
  const muted = colour(SPLIT_P.get("--split-muted") ?? "").rgb;
  const accent = colour(SPLIT_P.get("--split-accent") ?? "").rgb;
  const focus = colour(ROOM_P.get("--hud-focus") ?? "").rgb;
  const face = colour(ROOM_P.get("--tile-face") ?? "");
  const border = colour(ROOM_P.get("--tile-border") ?? "");
  const out: Pair[] = [];
  for (const [beneath, under] of [
    ["white", WHITE],
    ["black", BLACK],
  ] as const) {
    const glass = over({ rgb: glassRgb, a: glassAlpha }, under);
    const plate = over({ rgb: glassRgb, a: plateAlpha }, glass);
    const tile = over(face, glass);
    const p = (name: string, contrast: number, floor: number, onTile = false): Pair => ({
      name: `${name} over ${beneath}`,
      contrast,
      floor,
      tile: onTile,
    });
    out.push(
      p("text on a plate", ratio(text, plate), 4.5),
      p("muted text on a plate", ratio(muted, plate), 4.5),
      p("the accent entry (large) on a plate", ratio(accent, plate), 3),
      p("the accent's marks (strokes, emblem) on a plate", ratio(accent, plate), 3),
      p("the focus ring on a plate", ratio(focus, plate), 3),
      p("text on a tile the skin leaves on the glass", ratio(text, tile), 4.5, true),
      p("a tile's border the skin leaves over its face", ratio(over(border, tile), tile), 3, true),
      p("the focus ring inside a tile the skin leaves", ratio(focus, tile), 3, true),
    );
    // Spec 030 (T-INT02; Q73): the skinned controls over the room (Q5: the bar's tiles and, in the split layout, the
    // walking control, "Eat", "Back", "Close, Escape", the header toggles, "Send"), from the built skin's tokens, each
    // variant and state: the label and the icon (in the label's colour) on the face, the edge (the border's line or the
    // face) on the glass, the focus ring inside the face, the selected line on the face. On a tile's face (FR-006).
    for (const variant of SKIN_VARIANTS)
      for (const state of SKIN_STATES) {
        const c = stateColours(SKIN, variant, state);
        const skinFace = over(colour(c.face), glass);
        const label = over(colour(c.label), skinFace);
        const at = `${SKIN.id}'s ${variant} ${state} control`;
        out.push(
          p(`${at}: its label on its face`, ratio(label, skinFace), 4.5, true),
          p(`${at}: its icon on its face`, ratio(label, skinFace), 3, true),
          p(
            `${at}: its edge on the glass`,
            Math.max(ratio(over(colour(c.border), glass), glass), ratio(skinFace, glass)),
            3,
            true,
          ),
        );
        if (state !== "disabled")
          out.push(p(`${at}: its focus ring inside its face`, ratio(colour(c.ring).rgb, skinFace), 3, true));
        if (state === "selected")
          out.push(p(`${at}: its selected line on its face`, ratio(over(colour(c.border), skinFace), skinFace), 3, true));
      }
  }
  return out;
}

const failing = (list: Pair[]): string[] =>
  list.filter((x) => x.contrast < x.floor).map((x) => `${x.name}: ${x.contrast.toFixed(2)} under ${x.floor}`);
const step = (a: number): number => Math.round(a * 100 - 5) / 100;

/** Every rule of a sheet, one per selector, with its at-rule's prelude (null at the top level). */
function all(sheet: ReturnType<typeof parseCss>, at: string | null = null) {
  const out: { selector: string; declarations: Map<string, string>; at: string | null }[] = [];
  for (const r of sheet.rules)
    for (const s of r.selector.split(",")) out.push({ selector: s.trim(), declarations: r.declarations, at });
  for (const a of sheet.atRules) out.push(...all(parseCss(a.body), a.prelude));
  return out;
}
const RULES = [...all(ROOM), ...all(SPLIT)];
const OVER = RULES.filter((r) => r.selector.includes('[data-over="room"]'));

describe("a part over the room, its contrast (FR-003, FR-006; SC-002)", () => {
  it("reads its alphas from room.css's :root, the glass's below the plate's", () => {
    expect(GLASS_ALPHA).toBeGreaterThan(0);
    expect(PLATE_ALPHA).toBeLessThanOrEqual(1);
    expect(GLASS_ALPHA).toBeLessThan(PLATE_ALPHA);
  });

  it("gives every text and mark its ratio over white and over black at the stylesheet's alphas", () => {
    expect(failing(pairs(GLASS_ALPHA, PLATE_ALPHA))).toEqual([]);
  });

  it("takes the lowest 5% step for the glass at which the tiles' faces hold (FR-006)", () => {
    expect(failing(pairs(GLASS_ALPHA, PLATE_ALPHA).filter((x) => x.tile))).toEqual([]);
    expect(failing(pairs(step(GLASS_ALPHA), PLATE_ALPHA).filter((x) => x.tile)).length).toBeGreaterThan(0);
  });

  it("takes the lowest 5% step for the plate at which every pair holds over that glass (FR-003)", () => {
    expect(failing(pairs(GLASS_ALPHA, step(PLATE_ALPHA))).length).toBeGreaterThan(0);
  });
});

describe("the over-room look draws what the test judges (FR-002, FR-003)", () => {
  const PLATE = "rgb(var(--glass) / var(--over-plate-alpha))";
  it("drops a marked part's glass to --over-glass-alpha, the split layout's too", () => {
    expect(OVER.some((r) => r.declarations.get("--glass-alpha") === "var(--over-glass-alpha)")).toBe(true);
    expect(OVER.some((r) => r.declarations.get("--split-glass-alpha") === "var(--over-glass-alpha)")).toBe(true);
  });

  it("puts every run of words on a plate of the glass at --over-plate-alpha", () => {
    // Each selector read without its mark, so a part marked itself (".room-list[data-over] li") reads as its rows.
    const plated = OVER.filter((r) => r.declarations.get("background") === PLATE).map((r) =>
      r.selector.replaceAll('[data-over="room"]', ""),
    );
    for (const part of [
      ".talk-entry",
      ".talk-message",
      ".talk-status",
      ".talk-form",
      ".talk-head",
      ".room-list-heading",
      ".split-top",
      ".split-label",
      ".split-back",
      ".room-list li",
    ])
      expect(
        plated.some((s) => s.includes(part)),
        part,
      ).toBe(true);
  });

  it("never draws a plate, a glass, or a colour in room.css's or split.css's rules for a part not marked", () => {
    for (const r of RULES)
      for (const v of r.declarations.values())
        if (v.includes("--over-plate-alpha") || v.includes("--over-glass-alpha"))
          expect(r.selector.includes('[data-over="room"]') || r.selector === ":root", r.selector).toBe(true);
  });

  it("draws the focus ring inside its control over the room, or on a plate, never on the bare glass", () => {
    const rings = OVER.filter((r) => r.selector.includes(":focus-visible") && r.declarations.has("outline-offset"));
    const offset = (r: (typeof rings)[number]): number =>
      Number.parseFloat(r.declarations.get("outline-offset") ?? "0");
    // The tiles (the bar's, the walking control, the "Eat" tile) and the panels' tile buttons: inside, on the face.
    for (const part of [".hud-tile:focus-visible", '.hud-tile[data-over="room"]:focus-visible', "button:focus-visible"])
      expect(
        rings.some((r) => r.selector.endsWith(part) && offset(r) <= -4),
        part,
      ).toBe(true);
    // Any other ring stays outside its control only where a plate backs it: the link-like button in a message.
    for (const r of rings.filter((x) => offset(x) > -4))
      expect(r.selector, r.selector).toMatch(/\.talk-link:focus-visible$/);
    // A plate reaches 0.25rem past its box, so a ring 2px outside a control on it, 2px wide, lies on it; the entries'
    // rows, where no ring reaches past the row, have none.
    const plates = OVER.filter((r) => r.declarations.get("background") === PLATE && !/ li$/.test(r.selector));
    expect(plates.length).toBeGreaterThan(0);
    for (const r of plates) expect(r.declarations.get("box-shadow"), r.selector).toBe(`0 0 0 0.25rem ${PLATE}`);
  });
});

describe("a part over the room under the visitor's asks (FR-004)", () => {
  for (const ask of [/prefers-reduced-transparency:\s*reduce/, /prefers-contrast:\s*more/, /forced-colors:\s*active/])
    it(`makes both alphas 1 under ${ask.source}`, () => {
      const bodies = ROOM.atRules.filter((a) => ask.test(a.prelude)).map((a) => a.body);
      expect(bodies.some((b) => /--over-glass-alpha:\s*1\b/.test(b) && /--over-plate-alpha:\s*1\b/.test(b))).toBe(true);
    });
});
