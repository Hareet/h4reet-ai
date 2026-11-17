// T-B01 (b) (spec 030; FR-008, FR-010, FR-013; SC-003; plan.md §R-B3, §R-B4): one button component for every control of
// Q5, through the real room and the real selection screen. The page's root carries data-skin as the build writes it,
// and the stylesheets go into the document in the bundle's order, the skin's generated one and ui/button.css among
// them (test/helpers/button-room.ts). For each control, in the split layout at rest and walking, the column layout,
// and the dock, both "Close" buttons as the room makes them (rework, S-1; Q51), and "Enter" on the selection screen:
// - every property the component owns is won by ui/button.css's rules, by the cascade (test/helpers/button-cascade.ts:
//   importance, specificity, order), over room.css's, split.css's, talk.css's, resume.css's, and choice.css's;
// - the control itself paints nothing and clips nothing (rework, S-4; rv-030b's R-2): a transparent background and
//   border, no border-image, no clip-path, no filter, and its own box-shadow `none` (spec 029's rectangular plate,
//   split.css's over-room block, and any bevel would draw a square ring round the chamfer; rv-rework2-spec-030's R-2);
//   `isolation: isolate`, and `position: relative` only where the page leaves it static (an absolute or fixed control
//   keeps its own);
// - its `::before` draws the face, the frame, the bevel, and the highlight, behind the label (`z-index: -1`, `inset: 0`,
//   no pointer events), cut to the chamfer by its own clip-path, in the active skin's tokens for the control's variant:
//   "Send" and "Enter" primary, the rest secondary (Q6);
// - the label's case, weight, tracking and font the skin's, except the bar's tiles in the column layout and the dock,
//   which keep spec 014's metrics under every skin (rv-030b's R-1, the page's Q89): the words' own case, weight 400,
//   no tracking, the page's family; and the six tiles' widths, summed from the vendored Plex faces' advance widths,
//   fit the bar's one row in the column layout (HUD_PLACEMENTS.bar.maxRem) and its rows in the dock;
// - the hit area is at least 44 × 44 CSS px, and the label wraps (white-space never nowrap);
// - jsdom's getComputedStyle, which applies the same stylesheets, agrees with the cascade on each owned property it
//   computes (analysis A-5: jsdom's reading, as spec 029's talk-answer-shows.test.ts reads position and z-index).
// With `active: plain` the same controls resolve to plain's tokens: the swap reaches every control (SC-004).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { create } from "fontkit";
import type { Font } from "fontkit";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { readSkins } from "../../build/ui-skins";
import type { CssSkin } from "../../build/ui-skins";
import { HUD_PLACEMENTS } from "../../src/room/compose/hud";
import { Cascade, topLevel } from "../helpers/button-cascade";
import type { State } from "../helpers/button-cascade";
import {
  CLOSE_BUTTONS,
  ENTER,
  LAYOUTS,
  ROOM_CONTROLS,
  baseSheets,
  chooseBoth,
  cssLength,
  room,
  selectionScreen,
  skinText,
} from "../helpers/button-room";
import type { Control, Layout, Skinned } from "../helpers/button-room";
import { WEB, nameOf } from "../helpers/room";

/** The longhands (and the radius) the component owns on the control (plan §R-B3), each won by ui/button.css. */
const OWNED = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-width",
  "border-top-style",
  "border-image-source",
  "border-radius",
  "box-shadow",
  "clip-path",
  "filter",
  "isolation",
  "font-family",
  "font-weight",
  "text-transform",
  "letter-spacing",
  "white-space",
  "min-height",
  "min-width",
  "opacity",
  "transform",
];

/** What the component owns on the control's `::before` (plan §R-B3), each won by ui/button.css. */
const BEFORE_OWNED = [
  "content",
  "position",
  "inset",
  "z-index",
  "pointer-events",
  "background-color",
  "background-image",
  "box-shadow",
  "clip-path",
];

/** Properties jsdom's getComputedStyle carries as declared, for the cross-check. Not the background: jsdom keys a
 *  shorthand holding var() (room.css's `background: var(--tile-face)`) apart from its longhands, so a later shorthand
 *  of lower specificity resets the component's background-color in jsdom alone (its computed-style.js compares
 *  specificity per declared name); browsers, and the cascade above, cascade the longhand. */
const JSDOM_READS = ["color", "clip-path", "white-space", "min-height", "min-width", "text-transform"];

const BEFORE: State = { pseudo: "before" };

/** The page as spec 029 left it, for each control's own position. */
const BASE = (s: Skinned): Cascade => new Cascade(baseSheets(), s.env);

/** Whether the element is one of the bar's tiles in a layout that keeps spec 014's metrics (Q89): the column layout
 *  and the dock, where the bar is one row of 35rem (or the dock's rows) and the tiles never wrap their words. */
const keepsMetrics = (el: Element): boolean =>
  el.matches(".hud-bar .hud-tile") && el.ownerDocument.documentElement.getAttribute("data-split") !== "on";

function checkControl(
  s: Skinned,
  control: Control,
  el: Element,
  skin: CssSkin,
  where: string,
  state: "normal" | "selected" = "normal",
): void {
  const { cascade } = s;
  const label = `${where}: ${control.name} (${el.textContent?.trim().slice(0, 24) ?? ""})`;
  for (const property of OWNED) {
    const won = cascade.winner(el, property);
    expect(won?.sheet, `${label}: ${property} won by ${won?.sheet ?? "nothing"} (${won?.selector ?? ""})`).toBe(
      "ui/button.css",
    );
  }
  // The control paints nothing of its own and clips nothing: its box is the hit area, whole (FR-013).
  expect(cascade.value(el, "background-color"), `${label}: no face on the control`).toBe("transparent");
  expect(cascade.value(el, "background-image"), `${label}: no image on the control`).toBe("none");
  for (const side of ["top", "right", "bottom", "left"])
    expect(cascade.value(el, `border-${side}-color`), `${label}: a transparent border`).toBe("transparent");
  expect(cascade.value(el, "border-image-source"), `${label}: no border-image`).toBe("none");
  expect(cascade.value(el, "box-shadow"), `${label}: no shadow on the control`).toBe("none");
  expect(cascade.value(el, "clip-path"), `${label}: no clip`).toBe("none");
  expect(cascade.value(el, "filter"), `${label}: no filter`).toBe("none");
  expect(cascade.value(el, "isolation"), `${label}: its own stacking context`).toBe("isolate");
  // position: relative only where the page leaves the control static.
  const base = BASE(s).value(el, "position") ?? "static";
  const position = cascade.winner(el, "position");
  if (base === "static") {
    expect(position?.sheet, `${label}: position: relative, B's`).toBe("ui/button.css");
    expect(cascade.value(el, "position"), `${label}: position`).toBe("relative");
  } else {
    expect(position?.sheet, `${label}: its own position (${base}) kept`).not.toBe("ui/button.css");
    expect(cascade.value(el, "position"), `${label}: position`).toBe(base);
  }
  // The ::before draws the face, behind the label, cut to the chamfer.
  for (const property of BEFORE_OWNED) {
    const won = cascade.winner(el, property, BEFORE);
    expect(won?.sheet, `${label}: ::before's ${property} won by ${won?.sheet ?? "nothing"}`).toBe("ui/button.css");
  }
  const t = skin.tokens;
  const want = t[control.variant][state];
  expect(cascade.value(el, "content", BEFORE), `${label}: ::before`).toBe('""');
  expect(cascade.value(el, "position", BEFORE), `${label}: ::before position`).toBe("absolute");
  expect(cascade.value(el, "inset", BEFORE), `${label}: ::before inset`).toBe("0");
  expect(cascade.value(el, "z-index", BEFORE), `${label}: ::before behind the label`).toBe("-1");
  expect(cascade.value(el, "pointer-events", BEFORE), `${label}: ::before takes no press`).toBe("none");
  expect(cascade.value(el, "background-color", BEFORE), `${label}: face`).toBe(want.face);
  const shadow = cascade.value(el, "box-shadow", BEFORE) ?? "";
  expect(shadow, `${label}: the border's line`).toContain(want.border);
  expect(shadow, `${label}: the frame`).toContain(t.frame);
  const clip = cascade.value(el, "clip-path", BEFORE) ?? "";
  expect(clip, `${label}: the chamfer's octagon`).toMatch(/^polygon\(/);
  expect(clip, `${label}: the chamfer's size`).toContain(t.chamfer);
  expect(cascade.value(el, "color"), `${label}: label`).toBe(want.label);
  if (keepsMetrics(el)) {
    // Spec 014's metrics under every skin (Q89).
    expect(cascade.value(el, "text-transform"), `${label}: the words' own case`).toBe("none");
    expect(cascade.value(el, "font-weight"), `${label}: weight 400`).toBe("400");
    expect(cascade.value(el, "letter-spacing"), `${label}: no tracking`).toBe("normal");
    expect(cascade.value(el, "font-family"), `${label}: the page's family`).toContain("IBM Plex Sans");
    expect(cascade.winner(el, "font-family")?.value, `${label}: not the skin's family`).not.toContain("--btn-");
  } else {
    expect(cascade.value(el, "text-transform"), `${label}: case`).toBe(t.font.case === "upper" ? "uppercase" : "none");
    expect(cascade.value(el, "letter-spacing"), `${label}: tracking`).toBe(t.font.tracking);
    expect(cascade.value(el, "font-family"), `${label}: font`).toContain(`"${t.font.family}"`);
    expect(cascade.value(el, "font-weight"), `${label}: weight`).toBe(String(t.font.weight));
  }
  expect(cssLength(cascade.value(el, "min-height")), `${label}: min-height`).toBeGreaterThanOrEqual(44);
  expect(cssLength(cascade.value(el, "min-width")), `${label}: min-width`).toBeGreaterThanOrEqual(44);
  expect(cascade.value(el, "white-space"), `${label}: wraps`).not.toMatch(/nowrap|pre/);
  const computed = s.v.win.getComputedStyle(el);
  for (const property of JSDOM_READS)
    expect(computed.getPropertyValue(property), `${label}: jsdom's ${property}`).toBe(cascade.declared(el, property));
}

const metal = readSkins(skinText()).skins.metal as CssSkin;
const plain = readSkins(skinText()).skins.plain as CssSkin;
const CSS_SKINS = Object.entries(readSkins(skinText()).skins).filter(([, s]) => s.kind === "css");

describe("one button component for every control of Q5 (FR-008, FR-013; SC-003)", () => {
  it("ships `metal` as the active skin (Q15 makes it the image skin's fallback; T-DS)", () => {
    expect(readSkins(skinText()).active).toBe("metal");
  });

  for (const layout of LAYOUTS)
    it(`gives each control the component, its variant, 44 × 44, and wrapping, in ${layout.name}`, async () => {
      const s = await room(layout);
      expect(s.id).toBe("metal");
      for (const control of ROOM_CONTROLS) {
        const found = control.find(s.v.doc);
        // "Back" is the split layout's alone (split.ts).
        if (control.name === '"Back"' && !layout.split) continue;
        // The bar's six tiles where the browser offers full screen; jsdom has no Fullscreen API, so five here.
        if (control.name === "the bar's tiles") expect(found.length, layout.name).toBe(5);
        expect(found.length, `${layout.name}: ${control.name}`).toBeGreaterThan(0);
        for (const el of found) {
          // The walking control while walking is selected (Q6): its selected tokens; every other control at rest.
          const state = layout.walk && el.classList.contains("room-walk") ? "selected" : "normal";
          checkControl(s, control, el, metal, layout.name, state);
        }
      }
    });

  const SPLIT = LAYOUTS[0] as Layout;
  const COLUMN = LAYOUTS.find((l) => l.hud === "column" && !l.split) as Layout;
  it('gives the conversation\'s "Close, Escape" the secondary button, its name and key cap kept (Q51)', async () => {
    const control = CLOSE_BUTTONS[0] as Control;
    const s = await room(SPLIT, undefined, [], "conversation");
    const found = control.find(s.v.doc);
    expect(found).toHaveLength(1);
    for (const el of found) {
      expect(nameOf(el), "its accessible name").toBe("Close, Escape");
      expect(el.querySelector(".hud-keycap"), "its key cap inside").not.toBeNull();
      checkControl(s, control, el, metal, "the split layout, the conversation open");
    }
  });

  for (const layout of [SPLIT, COLUMN])
    it(`gives the resume panel's "Close" the secondary button on the panel's white, in ${layout.name} (Q51)`, async () => {
      const control = CLOSE_BUTTONS[1] as Control;
      const s = await room(layout, undefined, [], "resume");
      const found = control.find(s.v.doc);
      expect(found).toHaveLength(1);
      for (const el of found) {
        expect(nameOf(el)).toBe("Close");
        checkControl(s, control, el, metal, `${layout.name}, the resume panel open`);
      }
      // The resume's PDF link, which shares 002's rule with "Close", keeps 002's look (spec.md's Amendments, R-7).
      const pdf = s.v.doc.querySelector(".resume .resume-pdf");
      expect(pdf).not.toBeNull();
      if (pdf) for (const property of OWNED) expect(s.cascade.winner(pdf, property)?.sheet).not.toBe("ui/button.css");
    });

  it('gives the selection screen\'s "Enter" the primary button', async () => {
    const s = await selectionScreen();
    await chooseBoth(s.v.doc);
    const found = ENTER.find(s.v.doc);
    expect(found).toHaveLength(1);
    for (const el of found) checkControl(s, ENTER, el, metal, "the selection screen");
  });

  it("draws plain's tokens on every control once `active: plain` (SC-004)", async () => {
    const s = await room(SPLIT, "plain");
    expect(s.id).toBe("plain");
    for (const control of ROOM_CONTROLS) {
      const found = control.find(s.v.doc);
      expect(found.length, control.name).toBeGreaterThan(0);
      for (const el of found) checkControl(s, control, el, plain, "plain, split");
    }
    for (const control of CLOSE_BUTTONS) {
      const opened = await room(SPLIT, "plain", [], control.open);
      for (const el of control.find(opened.v.doc)) checkControl(opened, control, el, plain, "plain, split, opened");
    }
    const screen = await selectionScreen("plain");
    await chooseBoth(screen.v.doc);
    for (const el of ENTER.find(screen.v.doc)) checkControl(screen, ENTER, el, plain, "plain, the selection screen");
  });
});

// ---- The bar's fit (rv-030b's R-1; the page's Q89) ----

const FACES = new Map<string, Font>();
/** The vendored IBM Plex Sans face for a weight (fonts/IBMPlexSans-*.woff); the test can't measure another. */
function plexFace(weight: string): Font {
  const file = { "400": "Regular", normal: "Regular", "700": "Bold", bold: "Bold" }[weight];
  if (!file) throw new Error(`no vendored IBM Plex Sans face for weight ${weight}`);
  let font = FACES.get(file);
  if (!font) {
    font = create(readFileSync(join(WEB, "fonts", `IBMPlexSans-${file}.woff`))) as Font;
    FACES.set(file, font);
  }
  return font;
}

/** A run's width in CSS px: the sum of its glyphs' advance widths (no kerning, as rv-030b summed them), plus the
 *  tracking after every character, as a browser adds letter-spacing. */
function runWidth(text: string, weight: string, size: number, tracking: number): number {
  const font = plexFace(weight);
  const advance = font.glyphsForString(text).reduce((sum, g) => sum + g.advanceWidth, 0);
  return (advance / font.unitsPerEm) * size + tracking * [...text].length;
}

/** One side of a box property (padding, border-width) from its winning declaration: the longhand itself, or the side
 *  a shorthand gives (one to four values, or the one length a `border` shorthand holds). */
function side(c: Cascade, el: Element, longhand: string, which: "left" | "right", state: State = {}): number {
  const won = c.winner(el, longhand, state);
  if (!won) return 0;
  const value = c.resolve(el, won.value, state);
  if (won.property === longhand) return cssLength(value);
  const parts = topLevel(value, " ");
  if (/^border(-(left|right))?$/.test(won.property)) {
    const width = parts.find((p) => Number.isFinite(cssLength(p)));
    return width === undefined ? 3 : cssLength(width);
  }
  const at = { 1: [0, 0], 2: [1, 1], 3: [1, 1], 4: [1, 3] }[parts.length] ?? [0, 0];
  return cssLength(parts[which === "right" ? (at[0] ?? 0) : (at[1] ?? 0)] ?? "");
}

/** The tile's width in CSS px for its words: the larger of its minimum and its icon or words, plus its padding and
 *  border (the larger of normal's and selected's), each read by the cascade. */
function tileWidth(c: Cascade, tile: Element, words: string): number {
  const weight = c.value(tile, "font-weight") ?? "400";
  const size = cssLength(c.value(tile, "font-size"));
  const spacing = c.value(tile, "letter-spacing") ?? "normal";
  const tracking = spacing === "normal" ? 0 : spacing.endsWith("em") ? Number.parseFloat(spacing) * size : cssLength(spacing);
  const cased = { uppercase: words.toUpperCase(), lowercase: words.toLowerCase(), none: words }[
    c.value(tile, "text-transform") ?? "none"
  ];
  if (cased === undefined) throw new Error(`a case the test can't measure: ${c.value(tile, "text-transform") ?? ""}`);
  const family = c.value(tile, "font-family") ?? "";
  if (!family.includes("IBM Plex Sans")) throw new Error(`a family the test can't measure: ${family}`);
  const icon = tile.querySelector(".hud-icon");
  const iconW = icon ? cssLength(c.value(icon, "width")) : 0;
  const text = Math.max(iconW, runWidth(cased, weight, size, tracking));
  const pressed = tile.getAttribute("aria-pressed");
  const borders = (state: "normal" | "selected"): number => {
    if (state === "selected") tile.setAttribute("aria-pressed", "true");
    const w = side(c, tile, "border-left-width", "left") + side(c, tile, "border-right-width", "right");
    if (pressed === null) tile.removeAttribute("aria-pressed");
    else tile.setAttribute("aria-pressed", pressed);
    return w;
  };
  const pad = side(c, tile, "padding-left", "left") + side(c, tile, "padding-right", "right");
  const min = cssLength(c.value(tile, "min-width"));
  return Math.max(Number.isFinite(min) ? min : 0, text + pad + Math.max(borders("normal"), borders("selected")));
}

/** How many rows a wrapping flex line of items takes in a width, with a gap between items. */
function flexRows(widths: readonly number[], width: number, gap: number): number {
  let rows = 0;
  let used = Infinity;
  for (const w of widths) {
    if (used + gap + w <= width) used += gap + w;
    else {
      rows += 1;
      used = w;
    }
  }
  return rows;
}

/** The lines a label breaks into in a width, greedy by word, each line measured as runWidth measures a run. */
function lines(text: string, weight: string, size: number, tracking: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((w) => w !== "")) {
    const trial = line === "" ? word : `${line} ${word}`;
    if (line === "" || runWidth(trial, weight, size, tracking) <= width) line = trial;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line !== "") out.push(line);
  return out;
}

const UI_WORDS = (parse(readFileSync(join(WEB, "room", "ui-words.yaml"), "utf8")) as { words: Record<string, string> })
  .words;

describe("the bar's six tiles fit its row in the column layout and its rows in the dock, under every skin (Q89)", () => {
  const COLUMN = LAYOUTS.find((l) => l.hud === "column" && !l.split) as Layout;
  const DOCK = LAYOUTS.find((l) => l.hud === "dock") as Layout;
  for (const [id] of CSS_SKINS)
    for (const layout of [COLUMN, DOCK])
      it(`${id}, ${layout.name}`, async () => {
        const s = await room(layout, id);
        const c = s.cascade;
        const bar = s.v.doc.querySelector(".hud-bar");
        const tiles = [...s.v.doc.querySelectorAll(".hud-bar .hud-tile")];
        if (!bar || tiles.length !== 5) throw new Error("the bar's five tiles (jsdom has no Fullscreen API)");
        // The six labels: the five in the page, and the full-screen control's longer words after "Pause the room",
        // drawn as its siblings are (the same rule styles every tile of the bar).
        const enter = UI_WORDS["fullscreen.enter"] ?? "";
        const leave = UI_WORDS["fullscreen.leave"] ?? "";
        const fullscreen = enter.length >= leave.length ? enter : leave;
        const labels = tiles.map((t) => t.querySelector(".hud-tile-words")?.textContent ?? "");
        const widths = tiles.map((t, i) => tileWidth(c, t, labels[i] ?? ""));
        widths.splice(3, 0, tileWidth(c, tiles[0] as Element, fullscreen));
        labels.splice(3, 0, fullscreen);
        const gapWon = c.winner(bar, "column-gap");
        const gapValue = gapWon ? c.resolve(bar, gapWon.value) : "0px";
        const gapParts = topLevel(gapValue, " ");
        const gap = cssLength(gapWon?.property === "gap" ? (gapParts[1] ?? gapParts[0] ?? "") : gapValue);
        const pad = side(c, bar, "padding-left", "left") + side(c, bar, "padding-right", "right");
        const rem = 16;
        const declared = cssLength(c.value(bar, "width"));
        const barW = Number.isFinite(declared) ? declared : layout.screen.w;
        const rows = HUD_PLACEMENTS.bar.rows.find((b) => layout.screen.w < b.belowRem * rem)?.n ?? 1;
        const sum = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1) + pad;
        const report = `${labels.map((l, i) => `${l} ${((widths[i] ?? 0) / rem).toFixed(2)}rem`).join(", ")}; one row ${(sum / rem).toFixed(2)}rem; the bar ${(barW / rem).toFixed(2)}rem, ${String(rows)} row(s)`;
        expect(widths.every((w) => Number.isFinite(w)), report).toBe(true);
        if (layout === COLUMN) {
          expect(barW, report).toBeLessThanOrEqual(HUD_PLACEMENTS.bar.maxRem * rem);
          expect(rows, report).toBe(1);
          expect(sum, report).toBeLessThanOrEqual(HUD_PLACEMENTS.bar.maxRem * rem);
        }
        expect(flexRows(widths, barW - pad, gap), report).toBeLessThanOrEqual(rows);
      });
});

// ---- The split layout's tiles in their two lines (rework 2, Q75's recommended answer; T-B04's estimate) ----

describe("the split layout's tiles hold their words in two lines under every skin (Q75)", () => {
  const SPLIT = LAYOUTS[0] as Layout;
  for (const [id] of CSS_SKINS)
    it(`${id}, ${SPLIT.name}`, async () => {
      const s = await room(SPLIT, id);
      const c = s.cascade;
      const doc = s.v.doc;
      const bar = doc.querySelector(".hud-bar");
      const tiles = [...doc.querySelectorAll(".hud-bar .hud-tile")];
      if (!bar || tiles.length !== 5) throw new Error("the bar's five tiles (jsdom has no Fullscreen API)");
      // The full-screen tile as layout.ts makes it where the browser offers full screen (its attributes, its icon, its
      // words), after "Pause the room", with each of its two words in turn.
      const fullscreen = doc.createElement("button");
      fullscreen.setAttribute("type", "button");
      fullscreen.setAttribute("aria-keyshortcuts", "Alt+Enter");
      fullscreen.setAttribute("aria-describedby", "room-fullscreen-help");
      fullscreen.className = "hud-tile";
      const icon = tiles[0]?.querySelector(".hud-icon")?.cloneNode(true);
      if (icon) fullscreen.append(icon);
      const words = doc.createElement("span");
      words.className = "hud-tile-words";
      fullscreen.append(words);
      tiles[2]?.after(fullscreen);
      // The bar's grid: three columns (HUD_PLACEMENTS.wall.tiles.perRow) in the bar's width less its padding and gaps;
      // each tile's content box that column less its padding and border.
      const perRow = HUD_PLACEMENTS.wall.tiles.perRow;
      const barW = cssLength(c.value(bar, "width"));
      const gap = cssLength(c.value(bar, "column-gap"));
      const column = (barW - side(c, bar, "padding-left", "left") - side(c, bar, "padding-right", "right") - (perRow - 1) * gap) / perRow;
      const report: string[] = [];
      const over: string[] = [];
      const check = (tile: Element, label: string): void => {
        const weight = c.value(tile, "font-weight") ?? "400";
        const size = cssLength(c.value(tile, "font-size"));
        const spacing = c.value(tile, "letter-spacing") ?? "normal";
        const tracking =
          spacing === "normal" ? 0 : spacing.endsWith("em") ? Number.parseFloat(spacing) * size : cssLength(spacing);
        const transform = c.value(tile, "text-transform") ?? "none";
        const cased = transform === "uppercase" ? label.toUpperCase() : label;
        const content =
          column -
          side(c, tile, "padding-left", "left") -
          side(c, tile, "padding-right", "right") -
          side(c, tile, "border-left-width", "left") -
          side(c, tile, "border-right-width", "right");
        const broken = lines(cased, weight, size, tracking, content);
        report.push(`${label}: ${broken.join(" / ")} (${transform}, ${weight}, ${content.toFixed(2)}px)`);
        // An icon over two lines of words is the row's height (HUD_PLACEMENTS.wall.tiles.tileRem; spec 028's A1-3).
        if (broken.length > 2) over.push(label);
      };
      expect(Number.isFinite(column), "the column's width").toBe(true);
      for (const tile of tiles) check(tile, tile.querySelector(".hud-tile-words")?.textContent ?? "");
      for (const key of ["fullscreen.enter", "fullscreen.leave"]) {
        words.textContent = UI_WORDS[key] ?? "";
        check(fullscreen, words.textContent);
      }
      expect(over, report.join("; ")).toEqual([]);
    });
});
