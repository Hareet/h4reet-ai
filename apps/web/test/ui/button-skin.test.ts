// T-B01 (b) (spec 030; FR-008, FR-010, FR-013; SC-003; plan.md §R-B3, §R-B4): one button component for every control of
// Q5, through the real room and the real selection screen. The page's root carries data-skin as the build writes it,
// and the stylesheets go into the document in the bundle's order, the skin's generated one and ui/button.css among
// them (test/helpers/button-room.ts). For each control, in the split layout at rest and walking, the column layout,
// and the dock, and for "Enter" on the selection screen:
// - every property the component owns is won by ui/button.css's rules, by the cascade (test/helpers/button-cascade.ts:
//   importance, specificity, order), over room.css's, split.css's, talk.css's, and choice.css's, whatever they set;
// - the winners resolve to the active skin's tokens for the control's variant: "Send" and "Enter" primary, the rest
//   secondary (Q6); the label's case and tracking, the font, the chamfer;
// - the hit area is at least 44 × 44 CSS px, and the label wraps (white-space never nowrap);
// - jsdom's getComputedStyle, which applies the same stylesheets, agrees with the cascade on each owned property it
//   computes (analysis A-5: jsdom's reading, as spec 029's talk-answer-shows.test.ts reads position and z-index).
// With `active: plain` the same controls resolve to plain's tokens: the swap reaches every control (SC-004).
import { describe, expect, it } from "vitest";

import { readSkins } from "../../build/ui-skins";
import type { CssSkin } from "../../build/ui-skins";
import type { Cascade } from "../helpers/button-cascade";
import { ENTER, LAYOUTS, ROOM_CONTROLS, room, selectionScreen, skinText } from "../helpers/button-room";
import type { Control } from "../helpers/button-room";

/** The longhands (and the radius) the component owns (plan §R-B3), each won by ui/button.css. */
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
  "border-radius",
  "box-shadow",
  "clip-path",
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

/** Properties jsdom's getComputedStyle carries as declared, for the cross-check. */
const JSDOM_READS = ["background-color", "color", "clip-path", "white-space", "min-height", "min-width", "text-transform"];

const px = (v: string | null): number => {
  const m = /^([\d.]+)px$/.exec((v ?? "").trim());
  return m ? Number(m[1]) : NaN;
};

function checkControl(cascade: Cascade, win: Window, control: Control, el: Element, skin: CssSkin, where: string): void {
  const label = `${where}: ${control.name} (${el.textContent?.trim().slice(0, 24) ?? ""})`;
  for (const property of OWNED) {
    const won = cascade.winner(el, property);
    expect(won?.sheet, `${label}: ${property} won by ${won?.sheet ?? "nothing"} (${won?.selector ?? ""})`).toBe(
      "ui/button.css",
    );
  }
  const t = skin.tokens;
  const normal = t[control.variant].normal;
  expect(cascade.value(el, "background-color"), `${label}: face`).toBe(normal.face);
  expect(cascade.value(el, "color"), `${label}: label`).toBe(normal.label);
  for (const side of ["top", "right", "bottom", "left"])
    expect(cascade.value(el, `border-${side}-color`), `${label}: border`).toBe(normal.border);
  expect(cascade.value(el, "text-transform"), `${label}: case`).toBe(t.font.case === "upper" ? "uppercase" : "none");
  expect(cascade.value(el, "letter-spacing"), `${label}: tracking`).toBe(t.font.tracking);
  expect(cascade.value(el, "font-family"), `${label}: font`).toContain(`"${t.font.family}"`);
  expect(cascade.value(el, "font-weight"), `${label}: weight`).toBe(String(t.font.weight));
  expect(cascade.value(el, "clip-path"), `${label}: chamfer`).toContain(t.chamfer);
  expect(px(cascade.value(el, "min-height")), `${label}: min-height`).toBeGreaterThanOrEqual(44);
  expect(px(cascade.value(el, "min-width")), `${label}: min-width`).toBeGreaterThanOrEqual(44);
  expect(cascade.value(el, "white-space"), `${label}: wraps`).not.toMatch(/nowrap|pre/);
  const computed = win.getComputedStyle(el);
  for (const property of JSDOM_READS)
    expect(computed.getPropertyValue(property), `${label}: jsdom's ${property}`).toBe(cascade.declared(el, property));
}

const metal = readSkins(skinText()).skins.metal as CssSkin;
const plain = readSkins(skinText()).skins.plain as CssSkin;

describe("one button component for every control of Q5 (FR-008, FR-013; SC-003)", () => {
  it("ships `metal` as the active skin (Q15 makes it the image skin's fallback; T-DS)", () => {
    expect(readSkins(skinText()).active).toBe("metal");
  });

  for (const layout of LAYOUTS)
    it(`gives each control the component, its variant, 44 × 44, and wrapping, in ${layout.name}`, async () => {
      const { v, cascade, id } = await room(layout);
      expect(id).toBe("metal");
      let tiles = 0;
      for (const control of ROOM_CONTROLS) {
        const found = control.find(v.doc);
        if (control.name === "the bar's tiles") tiles = found.length;
        expect(found.length, `${layout.name}: ${control.name}`).toBeGreaterThan(0);
        for (const el of found) checkControl(cascade, v.win, control, el, metal, layout.name);
      }
      expect(tiles, `${layout.name}: the bar's six tiles`).toBe(6);
    });

  it('gives the selection screen\'s "Enter" the primary button', async () => {
    const { v, cascade } = await selectionScreen();
    const found = ENTER.find(v.doc);
    expect(found).toHaveLength(1);
    for (const el of found) checkControl(cascade, v.win, ENTER, el, metal, "the selection screen");
  });

  it("draws plain's tokens on every control once `active: plain` (SC-004)", async () => {
    const split = LAYOUTS[0];
    if (!split) throw new Error("no layout");
    const { v, cascade, id } = await room(split, "plain");
    expect(id).toBe("plain");
    for (const control of ROOM_CONTROLS)
      for (const el of control.find(v.doc)) checkControl(cascade, v.win, control, el, plain, "plain, split");
    const screen = await selectionScreen("plain");
    for (const el of ENTER.find(screen.v.doc))
      checkControl(screen.cascade, screen.v.win, ENTER, el, plain, "plain, the selection screen");
  });
});
