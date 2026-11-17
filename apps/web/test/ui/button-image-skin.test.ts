// T-DS01 (b) (spec 030; FR-008, FR-013, FR-014, FR-024; plan.md §R-D4): the image skin on the page, through the real
// room and the real selection screen, with a fixture image skin built (PNGs this file writes into its own temporary
// folder; build/ui-skins.ts resolves them as it resolves the round's) and its stylesheet in the bundle's place of the
// skin's; read by the cascade (test/helpers/button-cascade.ts), as B's tests read pseudo-elements.
// - The image on each control's ::before (rework 2, R-3): its state's URI as `border-image-source`, `-slice` its insets
//   with `fill`, `-width` its --btn-…-bw, `-outset` 0, `-repeat` stretch, a `border-style` other than `none`; beneath
//   it the fallback's face colour for the state, clipped to the image's centre (`background-clip: content-box`,
//   `padding` the --btn-…-bw); B's octagon clip-path kept; no bevel, highlight, or glow of B's drawn over the image.
// - The control itself, under `metal` and under the image skin: `background-color` transparent, `border-image-source`
//   none, `box-shadow` none (rework 3, R-2; `.split-back` and `.split-hint` with their panel marked over the room, where
//   spec 029's plate rule is in the cascade), `clip-path` none, `filter` none (FR-013 holds for the control).
// - Each half's own element (A's `[data-half]`): the panel frame's image, its slice without `fill`.
// - The label: the element's own text and accessible name, unchanged; its colour the skin's `labels` (rework, I-2).
// - Forced colours: no image on the control, and both pseudo-elements not displayed.
// - Disabled: B's dashed ::after inset by the image's band (--btn-dash-inset), above the ::before (rework, I-2).
// - The band's crossings (rework 2, Q74): each control whose content box crosses its state's band, printed (BAND
//   lines) for impl-ds.md and the measurement of the labels over the band.
// - The content boxes (rework, S-6): the bar's tiles, the walking control, and "Eat" at 1366 × 768, 1440 × 900, and
//   1920 × 1080, at rest and walking, keep their border widths and padding under the image skin, and a tile's row
//   less them holds the icon and two lines; each half's border and padding the same under both skins.
// - Nothing before Enter with the image skin's stylesheet inserted (the URIs are `data:`; no request).
// A's own halves and `hud-halves.test.ts` aren't on this branch (B's tip); "no control's box leaves its half" is run
// beside A's file at the integration (int-030), named in impl-ds.md.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

import { readSkins, resolveSkin, skinCss } from "../../build/ui-skins";
import type { CssSkin } from "../../build/ui-skins";
import { Cascade } from "../helpers/button-cascade";
import type { Declaration, Sheet, State } from "../helpers/button-cascade";
import {
  CLOSE_BUTTONS,
  ENTER,
  LAYOUTS,
  ROOM_CONTROLS,
  bundleSheets,
  chooseBoth,
  cssLength,
  room,
  selectionScreen,
  skinText,
} from "../helpers/button-room";
import type { Control, Layout, Skinned } from "../helpers/button-room";
import { flush, nameOf, radio } from "../helpers/room";

const VARIANTS = ["primary", "secondary"] as const;
const STATES = ["normal", "hover", "pressed", "disabled", "selected"] as const;
type Variant = (typeof VARIANTS)[number];
type ButtonState = (typeof STATES)[number];

const METAL = readSkins(skinText()).skins.metal as CssSkin;
const LABELS = { primary: "#0b0d10", secondary: "#f4fdff" } as const;
const ID = "fixture-image";

// ---- The fixture skin: eleven PNGs in a temporary root, and the stylesheet the build serves for them ----

function png(w: number, h: number, rgba: readonly number[]): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgba).flat())]);
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const fileOf = (v: Variant, s: ButtonState): string => `assets/ui/buttons/btn-${v}-${s}.png`;
const PANEL = "assets/ui/buttons/panel-frame.png";
const ROOT = mkdtempSync(join(tmpdir(), "h4-button-image-skin-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const FILES = [...VARIANTS.flatMap((v) => STATES.map((s) => fileOf(v, s))), PANEL];
mkdirSync(join(ROOT, "assets", "ui", "buttons"), { recursive: true });
const HASHES = new Map<string, string>();
FILES.forEach((path, i) => {
  const bytes = path === PANEL ? png(256, 256, [40, 44, 50, 77]) : png(192, 96, [30 + i * 9, 40, 50, 255]);
  writeFileSync(join(ROOT, path), bytes);
  HASHES.set(path, createHash("sha256").update(bytes).digest("hex"));
});
const line = (indent: string, key: string, path: string): string =>
  `${indent}${key}: { file: ${path}, sha256: ${HASHES.get(path) ?? ""}, slice: [${path === PANEL ? "48, 48, 48, 48" : "24, 24, 24, 24"}] }`;
const TEXT = [
  skinText()
    .replace(/^active: .*$/m, `active: ${ID}`)
    .trimEnd(),
  `  ${ID}:`,
  "    kind: image",
  "    fallback: metal",
  `    labels: { primary: "${LABELS.primary}", secondary: "${LABELS.secondary}" }`,
  "    files:",
  ...VARIANTS.flatMap((v) => [`      ${v}:`, ...STATES.map((s) => line("        ", s, fileOf(v, s)))]),
  line("      ", "panel", PANEL),
  "",
].join("\n");
/** The fixture skin as the build resolves it, and its stylesheet: built at first use, so each case fails on its own
 *  where the build refuses it. */
let built: { kind: string; css: string } | null = null;
function fixtureSkin(): { kind: string; css: string } {
  if (built === null) {
    const resolved = resolveSkin(readSkins(TEXT), { root: ROOT });
    built = { kind: resolved.kind, css: skinCss(resolved) };
  }
  return built;
}
const imageCss = (): string => fixtureSkin().css;
/** The bundle's stylesheets with the image skin's in the skin's place. */
const imageSheets = (): Sheet[] =>
  bundleSheets().map((s) => (s.name === "virtual:ui-skin.css" ? { name: s.name, text: imageCss() } : s));
/** A custom property of the image skin's root rule. */
const token = (name: string): string => {
  const m = new RegExp(`\\s${name}: ([^;]+);`).exec(imageCss());
  if (!m?.[1]) throw new Error(`the image skin has no ${name}`);
  return m[1].trim();
};

it("builds the fixture skin as an image skin, its files read from the fixture's root", () => {
  expect(fixtureSkin().kind).toBe("image");
});

// ---- The page under each skin ----

interface Both {
  readonly s: Skinned;
  /** The cascade under `metal`, the root marked as the build marks it. */
  readonly metal: () => Cascade;
  /** The cascade under the fixture image skin, the root marked as the build marks it. */
  readonly image: () => Cascade;
}

function both(s: Skinned): Both {
  const root = s.v.doc.documentElement;
  const style = s.v.doc.createElement("style");
  style.textContent = imageCss();
  s.v.doc.head.append(style);
  const imageCascade = new Cascade(imageSheets(), s.env);
  return {
    s,
    metal: () => {
      root.setAttribute("data-skin", "metal");
      root.setAttribute("data-skin-kind", "css");
      return s.cascade;
    },
    image: () => {
      root.setAttribute("data-skin", ID);
      root.setAttribute("data-skin-kind", "image");
      return imageCascade;
    },
  };
}

/** Each state, the cascade's state for it, and what puts the element in it (undone after). */
const STATE_OF: readonly (readonly [ButtonState, State, ((el: Element) => () => void) | null])[] = [
  ["normal", {}, null],
  ["hover", { hover: true }, null],
  ["pressed", { active: true }, null],
  ["selected", {}, (el) => mark(el, "aria-pressed", "true")],
  ["disabled", {}, (el) => mark(el, "aria-disabled", "true")],
];

function mark(el: Element, name: string, value: string): () => void {
  const old = el.getAttribute(name);
  el.setAttribute(name, value);
  return () => (old === null ? el.removeAttribute(name) : el.setAttribute(name, old));
}

const BEFORE: State = { pseudo: "before" };
const on = (state: State, pseudo: "before" | "after"): State => ({ ...state, pseudo });

/** A side of a box property (padding or border-width) as the cascade gives it, its shorthand taken where that wins. */
function side(
  c: Cascade,
  el: Element,
  what: "padding" | "border-width",
  s: "top" | "right" | "bottom" | "left",
): number {
  const long = what === "padding" ? `padding-${s}` : `border-${s}-width`;
  // The cascade's matching takes border-*-width's shorthands itself; padding's it doesn't, so it is asked for both.
  const candidates: Declaration[] =
    what === "padding" ? [...c.matching(el, long), ...c.matching(el, "padding")] : c.matching(el, long);
  const rank = (a: Declaration, b: Declaration): number => {
    if (a.important !== b.important) return a.important ? 1 : -1;
    for (let i = 0; i < 3; i += 1)
      if ((a.specificity[i] ?? 0) !== (b.specificity[i] ?? 0)) return (a.specificity[i] ?? 0) - (b.specificity[i] ?? 0);
    return a.order - b.order;
  };
  const won = candidates.reduce<Declaration | null>((best, d) => (best === null || rank(d, best) > 0 ? d : best), null);
  const inline = (el as HTMLElement).style.getPropertyValue(long);
  if (!won && inline === "") return 0;
  const raw = c.resolve(el, inline !== "" && won?.important !== true ? inline : (won?.value ?? ""));
  if (inline !== "" || won?.property === long) return cssLength(raw);
  if (what === "border-width" && won?.property !== "border-width") {
    // border, border-<side>: its width, or none's 0, or medium's 3.
    const tokens = topValues(raw);
    const width = tokens.find((t) => /^-?[\d.]+(px|rem|em)?$|^calc\(/.test(t));
    if (width !== undefined) return cssLength(width);
    const keyword = tokens.find((t) => /^(thin|medium|thick)$/.test(t));
    if (keyword !== undefined) return { thin: 1, medium: 3, thick: 5 }[keyword] ?? 3;
    return tokens.some((t) => t === "none" || t === "hidden") ? 0 : 3;
  }
  const parts = topValues(raw);
  const idx = { top: 0, right: 1, bottom: 2, left: 3 }[s];
  const pick = [
    [0, 0, 0, 0],
    [0, 1, 0, 1],
    [0, 1, 2, 1],
    [0, 1, 2, 3],
  ][parts.length - 1]?.[idx];
  return cssLength(parts[pick ?? 0] ?? "0");
}

/** A value's space-separated parts, none inside parentheses. */
function topValues(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const SIDES = ["top", "right", "bottom", "left"] as const;

// ---- The image on each control's ::before ----

const SPLIT = LAYOUTS.find((l) => l.split && !l.walk) as Layout;
const STILL_LAYOUTS = LAYOUTS.filter((l) => !l.walk);

/** Every image-skin check of one control in one state. */
function imageChecks(c: Cascade, el: Element, variant: Variant, s: ButtonState, state: State, what: string): void {
  const before = on(state, "before");
  expect(c.value(el, "border-image-source", before), `${what}: the ::before's image`).toBe(
    token(`--btn-${variant}-${s}-image`),
  );
  expect(c.value(el, "border-image-slice", before), `${what}: its slice`).toBe(
    `${token(`--btn-${variant}-${s}-slice`)} fill`,
  );
  expect(c.value(el, "border-image-width", before), `${what}: its width`).toBe(token(`--btn-${variant}-${s}-bw`));
  expect(c.value(el, "border-image-outset", before), `${what}: its outset`).toBe("0");
  expect(c.value(el, "border-image-repeat", before), `${what}: its repeat`).toBe("stretch");
  expect(c.value(el, "border-top-style", before) ?? "none", `${what}: its border-style`).not.toBe("none");
  expect(cssLength(c.value(el, "border-top-width", before)), `${what}: its border-width`).toBe(0);
  expect(c.value(el, "background-color", before), `${what}: the face beneath`).toBe(METAL.tokens[variant][s].face);
  expect(c.value(el, "background-clip", before), `${what}: the face clipped to the centre`).toBe("content-box");
  expect(c.value(el, "padding", before), `${what}: the centre's padding`).toBe(token(`--btn-${variant}-${s}-bw`));
  expect(c.value(el, "background-image", before), `${what}: no gradient of B's over the image`).toBe("none");
  expect(c.value(el, "box-shadow", before), `${what}: no bevel or glow of B's over the image`).toBe("none");
  expect(c.value(el, "clip-path", before) ?? "", `${what}: B's octagon`).toMatch(/^polygon\(/);
  expect(c.value(el, "z-index", before), `${what}: behind the label`).toBe("-1");
  expect(c.value(el, "color", state), `${what}: the label`).toBe(LABELS[variant]);
}

/** The control itself paints, clips, and shadows nothing, under either skin. */
function controlChecks(c: Cascade, el: Element, state: State, what: string): void {
  expect(c.value(el, "background-color", state), `${what}: the control's background`).toBe("transparent");
  expect(c.value(el, "border-image-source", state), `${what}: the control's border-image`).toBe("none");
  expect(c.value(el, "box-shadow", state), `${what}: the control's box-shadow`).toBe("none");
  expect(c.value(el, "clip-path", state) ?? "none", `${what}: the control's clip-path`).toBe("none");
  expect(c.value(el, "filter", state) ?? "none", `${what}: the control's filter`).toBe("none");
}

function eachState(
  both: Both,
  controls: readonly Control[],
  where: string,
  check: (c: Cascade, el: Element, control: Control, s: ButtonState, state: State, what: string) => void,
  skin: "metal" | "image" = "image",
): number {
  let n = 0;
  for (const control of controls)
    for (const el of control.find(both.s.v.doc))
      for (const [s, state, apply] of STATE_OF) {
        const undo = apply?.(el);
        check(skin === "image" ? both.image() : both.metal(), el, control, s, state, `${where}: ${control.name}, ${s}`);
        undo?.();
        n += 1;
      }
  return n;
}

describe("the image on each control's ::before (FR-024; rework 2, R-3)", () => {
  for (const layout of STILL_LAYOUTS)
    it(`draws each state's image on the ::before, the face clipped to its centre, in ${layout.name}`, async () => {
      const b = both(await room(layout));
      const controls = ROOM_CONTROLS.filter((c) => c.name !== '"Back"' || layout.split);
      const n = eachState(b, controls, layout.name, (c, el, control, s, state, what) =>
        imageChecks(c, el, control.variant, s, state, what),
      );
      expect(n).toBeGreaterThan(0);
    });

  for (const control of CLOSE_BUTTONS)
    it(`draws it on ${control.name}`, async () => {
      const b = both(await room(SPLIT, undefined, [], control.open));
      expect(
        eachState(b, [control], SPLIT.name, (c, el, k, s, state, what) =>
          imageChecks(c, el, k.variant, s, state, what),
        ),
      ).toBeGreaterThan(0);
    });

  it('draws it on "Enter", on the selection screen', async () => {
    const b = both(await selectionScreen());
    await chooseBoth(b.s.v.doc);
    expect(
      eachState(b, [ENTER], "the selection screen", (c, el, k, s, state, what) =>
        imageChecks(c, el, k.variant, s, state, what),
      ),
    ).toBeGreaterThan(0);
  });
});

describe("the control itself draws nothing, under metal and the image skin (FR-013; rework 3, R-2)", () => {
  for (const skin of ["metal", "image"] as const) {
    it(`${skin}: no background, image, shadow, clip, or filter on any control, in every layout and state`, async () => {
      for (const layout of LAYOUTS) {
        const b = both(await room(layout));
        const controls = ROOM_CONTROLS.filter((c) => c.name !== '"Back"' || layout.split);
        eachState(
          b,
          controls,
          `${skin}, ${layout.name}`,
          (c, el, _k, _s, state, what) => controlChecks(c, el, state, what),
          skin,
        );
      }
      const enter = both(await selectionScreen());
      eachState(
        enter,
        [ENTER],
        `${skin}, the selection screen`,
        (c, el, _k, _s, state, what) => controlChecks(c, el, state, what),
        skin,
      );
    });

    it(`${skin}: "Back" and "Close, Escape" with their panel over the room, where spec 029's plate would draw`, async () => {
      for (const opened of ["conversation", "resume"] as const) {
        const b = both(await room(SPLIT, undefined, [], opened));
        for (const part of [".talk", ".room-list", ".hud-bar"])
          for (const el of b.s.v.doc.querySelectorAll(part)) el.setAttribute("data-over", "room");
        const marked: Control[] = [
          { name: '"Back"', variant: "secondary", find: (d) => [...d.querySelectorAll(".split-back")] },
          { name: '"Close, Escape"', variant: "secondary", find: (d) => [...d.querySelectorAll(".split-hint")] },
          ...CLOSE_BUTTONS.filter((k) => k.open === opened),
        ];
        let n = 0;
        eachState(
          b,
          marked,
          `${skin}, ${opened}, over the room`,
          (c, el, _k, _s, state, what) => {
            // The plate rule is in the cascade, and loses.
            n += c.matching(el, "box-shadow", state).filter((d) => d.sheet === "room/hud/split.css").length;
            controlChecks(c, el, state, what);
          },
          skin,
        );
        if (opened === "conversation") expect(n, "split.css's plate in the cascade").toBeGreaterThan(0);
      }
    });
  }
});

describe("the halves' frame, the labels, forced colours, and the disabled cue (FR-014, FR-024)", () => {
  it("draws the panel frame on each half's own element, without fill, its border and padding the same under both skins", async () => {
    const b = both(await room(SPLIT));
    const doc = b.s.v.doc;
    // A's halves (plan §R-A3) aren't on this branch: the list carries data-half="top" as A's layout.ts gives it in the
    // split layout, and a stand-in for A's bottom half, a div.hud-half[data-half="bottom"], is placed in the block.
    const top = doc.querySelector(".room-list");
    if (!top) throw new Error("no list");
    top.setAttribute("data-half", "top");
    const bottom = doc.createElement("div");
    bottom.className = "hud-half";
    bottom.setAttribute("data-half", "bottom");
    bottom.setAttribute("aria-hidden", "true");
    doc.querySelector(".room-block")?.prepend(bottom);
    for (const half of [top, bottom]) {
      const what = `the ${half.getAttribute("data-half") ?? ""} half`;
      const c = b.image();
      expect(c.value(half, "border-image-source"), what).toBe(token("--half-frame-image"));
      expect(c.value(half, "border-image-slice"), `${what}: no fill`).toBe(token("--half-frame-slice"));
      expect(c.value(half, "border-image-slice") ?? "", `${what}: no fill`).not.toMatch(/fill/);
      expect(c.value(half, "border-image-width"), what).toBe(token("--half-frame-bw"));
      expect(c.value(half, "border-image-outset"), what).toBe("0");
      expect(c.value(half, "border-image-repeat"), what).toBe("stretch");
      const boxes = (cc: Cascade): number[] =>
        SIDES.flatMap((s) => [side(cc, half, "border-width", s), side(cc, half, "padding", s)]);
      const image = boxes(c);
      expect(boxes(b.metal()), `${what}: its border and padding`).toEqual(image);
      expect(b.metal().value(half, "border-image-source") ?? "none", `${what} under metal`).toBe("none");
    }
  });

  it("keeps each label the element's own text and name, in the skin's label colour", async () => {
    const b = both(await room(SPLIT, undefined, [], "conversation"));
    for (const control of [...ROOM_CONTROLS, CLOSE_BUTTONS[0] as Control])
      for (const el of control.find(b.s.v.doc)) {
        b.metal();
        const name = nameOf(el);
        const text = el.textContent;
        const c = b.image();
        expect(nameOf(el), control.name).toBe(name);
        expect(el.textContent, control.name).toBe(text);
        expect(c.value(el, "color"), control.name).toBe(LABELS[control.variant]);
        expect(c.value(el, "content", BEFORE), `${control.name}: no label in the image`).toBe('""');
      }
  });

  it("forced colours: no image on any control, both pseudo-elements not displayed", async () => {
    const b = both(await room(SPLIT, undefined, ["forced-colors: active"]));
    const controls = ROOM_CONTROLS;
    eachState(b, controls, "forced colours", (c, el, _k, _s, state, what) => {
      expect(c.value(el, "border-image-source", state), what).toBe("none");
      expect(c.value(el, "display", on(state, "before")), `${what}: ::before`).toBe("none");
      expect(c.value(el, "display", on(state, "after")), `${what}: ::after`).toBe("none");
    });
  });

  it("disabled: B's dashes inset by the image's band, above the image", async () => {
    const b = both(await room(SPLIT, undefined, [], "conversation"));
    for (const control of [...ROOM_CONTROLS, ...CLOSE_BUTTONS.slice(0, 1)])
      for (const el of control.find(b.s.v.doc)) {
        const undo = mark(el, "aria-disabled", "true");
        const c = b.image();
        const what = `${control.name}, disabled`;
        expect(c.value(el, "inset", { pseudo: "after" }), what).toBe(token(`--btn-${control.variant}-disabled-bw`));
        expect(c.value(el, "border-top-style", { pseudo: "after" }), what).toBe("dashed");
        expect(c.value(el, "z-index", { pseudo: "after" }) ?? "auto", `${what}: above the ::before`).toBe("auto");
        undo();
      }
  });
});

// ---- The band's crossings (rework 2, Q74) and the content boxes (rework, S-6) ----

describe("the band and the content boxes (rework, S-6; rework 2, Q74)", () => {
  it("names each control whose content box crosses its state's band (for impl-ds.md)", async () => {
    const crossings = new Set<string>();
    const opened: [Layout, Control[], "conversation" | "resume" | undefined][] = [
      ...LAYOUTS.map((l): [Layout, Control[], undefined] => [l, [...ROOM_CONTROLS], undefined]),
      [SPLIT, CLOSE_BUTTONS.filter((k) => k.open === "conversation"), "conversation"],
      [SPLIT, CLOSE_BUTTONS.filter((k) => k.open === "resume"), "resume"],
    ];
    for (const [layout, controls, open] of opened) {
      const b = both(await room(layout, undefined, [], open));
      for (const control of controls)
        for (const el of control.find(b.s.v.doc))
          for (const [s, , apply] of STATE_OF) {
            const undo = apply?.(el);
            const c = b.image();
            const band = topValues(token(`--btn-${control.variant}-${s}-bw`)).map(cssLength);
            const crossed = SIDES.filter(
              (sd, i) => (band[i] ?? 0) > side(c, el, "border-width", sd) + side(c, el, "padding", sd),
            );
            if (crossed.length > 0) crossings.add(`${layout.name}: ${control.name} (${s}): ${crossed.join(", ")}`);
            undo?.();
          }
    }
    const enter = both(await selectionScreen());
    for (const el of ENTER.find(enter.s.v.doc)) {
      const c = enter.image();
      const band = topValues(token("--btn-primary-normal-bw")).map(cssLength);
      const crossed = SIDES.filter(
        (sd, i) => (band[i] ?? 0) > side(c, el, "border-width", sd) + side(c, el, "padding", sd),
      );
      if (crossed.length > 0) crossings.add(`the selection screen: "Enter" (every state): ${crossed.join(", ")}`);
    }
    for (const c of crossings) console.info(`BAND ${c}`);
    // The split layout's tiles cross it (plan §R-D4: 12 CSS px against a 1 px border and 0.125rem of padding).
    expect([...crossings].some((c) => c.startsWith(`${SPLIT.name}: the bar's tiles`))).toBe(true);
  });

  const SCREENS: Layout[] = [
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ].flatMap(([w = 0, h = 0]) =>
    [false, true].map((walk) => ({
      name: `the split layout (${w} × ${h})${walk ? ", walking" : ""}`,
      screen: { w, h },
      hud: "column" as const,
      split: true,
      walk,
    })),
  );
  const ROW: readonly Control[] = ROOM_CONTROLS.filter((c) =>
    ["the bar's tiles", "the walking control", '"Eat"'].includes(c.name),
  );

  for (const layout of SCREENS)
    it(`keeps the row's border and padding under the image skin, and a tile's row holds the icon and two lines, in ${layout.name}`, async () => {
      const b = both(await room(layout));
      const doc = b.s.v.doc;
      const scale = Number(doc.documentElement.style.getPropertyValue("--wall-scale-right")) || 1;
      let n = 0;
      for (const control of ROW)
        for (const el of control.find(doc)) {
          const metal = SIDES.flatMap((s) => [
            side(b.metal(), el, "border-width", s),
            side(b.metal(), el, "padding", s),
          ]);
          const image = SIDES.flatMap((s) => [
            side(b.image(), el, "border-width", s),
            side(b.image(), el, "padding", s),
          ]);
          expect(image, `${layout.name}: ${control.name}`).toEqual(metal);
          if (control.name === "the bar's tiles") {
            const c = b.image();
            const row = 3.75 * 16 * scale;
            const vertical =
              side(c, el, "border-width", "top") +
              side(c, el, "border-width", "bottom") +
              side(c, el, "padding", "top") +
              side(c, el, "padding", "bottom");
            const font = cssLength(c.resolve(el, c.declared(el, "font-size") ?? "0.8125rem"));
            // compose/hud.ts's numbers (its tileRem's comment): a 1.25rem icon, a 0.125rem gap, and two lines at 1.2 of
            // the words' size, the row's model at the column's scale.
            const needs = (1.25 + 0.125) * 16 * scale + 2 * 1.2 * font;
            expect(row - vertical, `${layout.name}: a tile's content box (scale ${scale})`).toBeGreaterThanOrEqual(
              needs - 0.01,
            );
          }
          n += 1;
        }
      expect(n).toBeGreaterThan(0);
    });
});

describe("nothing before Enter with the image skin's stylesheet (FR-029, FR-030)", () => {
  it("fetches, sends, and stores nothing while the visitor chooses", async () => {
    const b = both(await selectionScreen());
    b.image();
    const v = b.s.v;
    radio(v.doc, "path", "engineer").click();
    radio(v.doc, "avatar", "dog").click();
    await flush();
    v.clock.advance(10_000);
    await flush();
    expect(imageCss()).toContain("data:image/png;base64,");
    expect(imageCss()).not.toMatch(/url\((?!"data:)/);
    expect(v.spies.network).toEqual([]);
    expect(v.spies.assets).toEqual([]);
    expect(v.spies.beacons).toEqual([]);
    expect(v.spies.storage).toEqual([]);
    expect(v.events).toEqual([]);
    expect(v.roomDataLoads()).toBe(0);
    expect(v.room.visit.stage).toBe("choosing");
  });
});
