// T-B01 (c) (spec 030; FR-012 to FR-014; plan.md §R-B3, §R-B4): the component's states, through the real room (the
// split layout, at rest and walking) and the selection screen, read by the cascade (test/helpers/button-cascade.ts),
// which enters the states jsdom can't and applies @media as the window asks.
// - Each state reaches each control that has it: hover, focus-visible, and pressed (:active) every control; disabled
//   (:disabled, aria-disabled="true") the room's buttons and links, and "Enter" before both choices; selected
//   (aria-pressed="true") "Pause the room" once pressed, and the walking control while walking (Q6).
// - Each state differs from normal by more than colour (WCAG 1.4.1): a property other than a colour changes (the
//   bevel's geometry, the border's style or width, the ring), never only `color` or `background-color`.
// - The focus ring shows whole: drawn inside the control (its outline-offset at least its width plus half the chamfer
//   inward, so the chamfer's corners never cut it) or on a control with no clip-path; in the variant's ring colour.
// - A label twice its length wraps: no nowrap and no ellipsis on the control or anything inside it.
// - Reduced motion: no transition, animation, or transform in any state; otherwise at most 120 ms, of colours and
//   shadows alone, never a movement (FR-014).
// - Forced colours: border-image none, no clip-path, no shadow, the system's colours, a 1 px ButtonText border (2 px
//   when selected), and the ring in Highlight.
import { describe, expect, it } from "vitest";

import { readSkins } from "../../build/ui-skins";
import type { CssSkin } from "../../build/ui-skins";
import type { Cascade, State } from "../helpers/button-cascade";
import { ENTER, LAYOUTS, ROOM_CONTROLS, room, selectionScreen, skinText } from "../helpers/button-room";
import type { Control, Skinned } from "../helpers/button-room";
import { button, flush, radio } from "../helpers/room";

const metal = readSkins(skinText()).skins.metal as CssSkin;
const SPLIT = LAYOUTS.find((l) => l.split && !l.walk);
const WALKING = LAYOUTS.find((l) => l.walk);
if (!SPLIT || !WALKING) throw new Error("no split layout");

/** A CSS length or a calc() of px and rem lengths, in CSS pixels; NaN for anything else. */
function length(value: string | null): number {
  const src = (value ?? "").trim().replace(/^calc\((.*)\)$/s, "$1");
  let i = 0;
  const skip = (): void => {
    while (src[i] === " ") i += 1;
  };
  const atom = (): number => {
    skip();
    if (src[i] === "(") {
      i += 1;
      const v = sum();
      skip();
      i += 1;
      return v;
    }
    const m = /^-?[\d.]+(px|rem|em)?/.exec(src.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    const n = Number.parseFloat(m[0]);
    return m[1] === "rem" || m[1] === "em" ? n * 16 : n;
  };
  const product = (): number => {
    let v = atom();
    for (;;) {
      skip();
      const op = src[i];
      if (op !== "*" && op !== "/") return v;
      i += 1;
      const r = atom();
      v = op === "*" ? v * r : v / r;
    }
  };
  const sum = (): number => {
    let v = product();
    for (;;) {
      skip();
      const op = src[i];
      if (op !== "+" && op !== "-") return v;
      i += 1;
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
  };
  const out = sum();
  skip();
  return i === src.length ? out : NaN;
}

/** A shadow list's geometry, its colours taken out. */
const geometry = (shadow: string | null): string =>
  (shadow ?? "none")
    .replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:transparent|currentcolor|Canvas|CanvasText|ButtonText|Highlight)\b/gi, "C")
    .replace(/\s+/g, " ")
    .trim();

/** What a state may show beyond colour (FR-012). */
function marks(c: Cascade, el: Element, state: State): Record<string, string> {
  return {
    bevel: geometry(c.value(el, "box-shadow", state)),
    "border style": c.value(el, "border-top-style", state) ?? "",
    "border width": c.value(el, "border-top-width", state) ?? "",
    "outline style": c.value(el, "outline-style", state) ?? "none",
    "outline width": c.value(el, "outline-width", state) ?? "",
    decoration: c.value(el, "text-decoration-line", state) ?? "none",
  };
}

function differsBeyondColour(c: Cascade, el: Element, state: State, what: string): void {
  const normal = marks(c, el, {});
  const now = marks(c, el, state);
  const changed = Object.keys(now).filter((k) => now[k] !== normal[k]);
  expect(changed.length, `${what}: changes ${JSON.stringify(now)} from ${JSON.stringify(normal)}`).toBeGreaterThan(0);
}

/** The variant's face in a state, as the cascade resolves it on the element. */
const face = (c: Cascade, el: Element, state: State = {}): string | null => c.value(el, "background-color", state);

function ringWhole(c: Cascade, el: Element, control: Control, what: string): void {
  const focus: State = { focusVisible: true };
  expect(c.value(el, "outline-style", focus), `${what}: a ring`).toBe("solid");
  const width = length(c.value(el, "outline-width", focus));
  expect(width, `${what}: ring width`).toBeGreaterThanOrEqual(2);
  expect(c.value(el, "outline-color", focus), `${what}: ring colour`).toBe(metal.tokens[control.variant].ring);
  const clip = c.value(el, "clip-path", focus);
  if (clip !== null && clip !== "none") {
    const offset = length(c.value(el, "outline-offset", focus));
    const chamfer = length(metal.tokens.chamfer);
    expect(offset, `${what}: the ring inside the control`).toBeLessThanOrEqual(-width);
    expect(-offset, `${what}: the ring inside the chamfer's corners`).toBeGreaterThanOrEqual(chamfer / 2);
  }
}

function wraps(c: Cascade, el: Element, what: string): void {
  for (const node of [el, ...el.querySelectorAll("*")]) {
    expect(c.value(node, "white-space"), `${what}: ${node.tagName} white-space`).not.toMatch(/nowrap|pre/);
    expect(c.value(node, "text-overflow"), `${what}: ${node.tagName} text-overflow`).not.toBe("ellipsis");
  }
}

describe("the component's states (FR-012)", () => {
  it("reaches hover, focus-visible, and pressed on every room control, each beyond colour, the ring whole", async () => {
    const s = await room(SPLIT);
    for (const control of ROOM_CONTROLS)
      for (const el of control.find(s.v.doc)) {
        const what = `${control.name} (${el.textContent?.trim().slice(0, 20) ?? ""})`;
        for (const [name, state] of [
          ["hover", { hover: true }],
          ["focus-visible", { focusVisible: true }],
          ["pressed", { active: true }],
        ] as const)
          differsBeyondColour(s.cascade, el, state, `${what}, ${name}`);
        expect(face(s.cascade, el, { hover: true }), `${what}: hover's face`).toBe(
          metal.tokens[control.variant].hover.face,
        );
        expect(face(s.cascade, el, { active: true }), `${what}: pressed's face`).toBe(
          metal.tokens[control.variant].pressed.face,
        );
        ringWhole(s.cascade, el, control, what);
      }
  });

  it("reaches disabled on the room's buttons and links, by :disabled and by aria-disabled, with a dashed border", async () => {
    const s = await room(SPLIT);
    for (const control of ROOM_CONTROLS)
      for (const el of control.find(s.v.doc)) {
        const what = control.name;
        const ways: [string, () => void, () => void][] = [
          ["aria-disabled", () => el.setAttribute("aria-disabled", "true"), () => el.removeAttribute("aria-disabled")],
        ];
        if (el.tagName === "BUTTON")
          ways.push(["disabled", () => el.setAttribute("disabled", ""), () => el.removeAttribute("disabled")]);
        for (const [how, on, off] of ways) {
          const was = el.getAttribute("aria-disabled");
          const before = marks(s.cascade, el, {});
          on();
          expect(face(s.cascade, el), `${what} ${how}: face`).toBe(metal.tokens[control.variant].disabled.face);
          expect(s.cascade.value(el, "border-top-style"), `${what} ${how}: dashed`).toBe("dashed");
          const after = marks(s.cascade, el, {});
          const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
          expect(changed.length, `${what} ${how}: beyond colour`).toBeGreaterThan(0);
          off();
          if (was !== null) el.setAttribute("aria-disabled", was);
        }
      }
  });

  it('reaches selected on "Pause the room" pressed, with the glow and a thicker border', async () => {
    const s = await room(SPLIT);
    const pause = button(s.v.doc, "Pause the room");
    const before = marks(s.cascade, pause, {});
    pause.click();
    await flush();
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    const after = marks(s.cascade, pause, {});
    expect(after["border width"]).not.toBe(before["border width"]);
    expect(length(after["border width"] ?? "")).toBeGreaterThan(length(before["border width"] ?? ""));
    expect(s.cascade.value(pause, "box-shadow")).toContain(metal.tokens.secondary.selected.glow);
    expect(face(s.cascade, pause)).toBe(metal.tokens.secondary.selected.face);
  });

  it("reaches selected on the walking control while walking", async () => {
    const s = await room(WALKING);
    const walk = s.v.doc.querySelector(".room-walk");
    if (!walk) throw new Error("no walking control");
    expect(face(s.cascade, walk)).toBe(metal.tokens.secondary.selected.face);
    expect(s.cascade.value(walk, "box-shadow")).toContain(metal.tokens.secondary.selected.glow);
    expect(length(s.cascade.value(walk, "border-top-width"))).toBe(2);
  });

  it('gives "Enter" its disabled look before both choices and its primary look after, the ring whole', async () => {
    const s = await selectionScreen();
    const enter = ENTER.find(s.v.doc)[0];
    if (!enter) throw new Error("no Enter");
    expect((enter as HTMLButtonElement).disabled).toBe(true);
    expect(face(s.cascade, enter)).toBe(metal.tokens.primary.disabled.face);
    expect(s.cascade.value(enter, "border-top-style")).toBe("dashed");
    radio(s.v.doc, "path", "engineer").click();
    radio(s.v.doc, "avatar", "dog").click();
    await flush();
    expect((enter as HTMLButtonElement).disabled).toBe(false);
    expect(face(s.cascade, enter)).toBe(metal.tokens.primary.normal.face);
    for (const state of [{ hover: true }, { focusVisible: true }, { active: true }])
      differsBeyondColour(s.cascade, enter, state, `"Enter" ${JSON.stringify(state)}`);
    ringWhole(s.cascade, enter, ENTER, '"Enter"');
  });
});

describe("labels that grow (FR-013)", () => {
  it("wraps a label twice its length: no nowrap and no ellipsis on any control or inside it", async () => {
    const s = await room(SPLIT);
    for (const control of [...ROOM_CONTROLS])
      for (const el of control.find(s.v.doc)) {
        const words = el.querySelector(".hud-tile-words") ?? el;
        const text = words.textContent ?? "";
        words.textContent = `${text} ${text}`;
        wraps(s.cascade, el, control.name);
        words.textContent = text;
      }
    const screen = await selectionScreen();
    for (const el of ENTER.find(screen.v.doc)) wraps(screen.cascade, el, ENTER.name);
  });
});

describe("motion (FR-014)", () => {
  const STATES: State[] = [{}, { hover: true }, { focusVisible: true }, { active: true }];

  it("under reduced motion: no transition, animation, or transform, in any state", async () => {
    const check = (s: Skinned, controls: readonly Control[]): void => {
      for (const control of controls)
        for (const el of control.find(s.v.doc))
          for (const state of STATES) {
            const what = `${control.name} ${JSON.stringify(state)}`;
            expect(s.cascade.value(el, "transition", state) ?? "none", what).toMatch(/^none\b/);
            expect(s.cascade.value(el, "animation-name", state) ?? "none", what).toBe("none");
            expect(s.cascade.value(el, "transform", state) ?? "none", what).toBe("none");
          }
    };
    check(await room(SPLIT, undefined, ["prefers-reduced-motion: reduce"]), ROOM_CONTROLS);
    check(await selectionScreen(undefined, ["prefers-reduced-motion: reduce"]), [ENTER]);
  });

  it("otherwise fades colours and shadows for at most 120 ms, and never moves", async () => {
    const s = await room(SPLIT);
    for (const control of ROOM_CONTROLS)
      for (const el of control.find(s.v.doc))
        for (const state of STATES) {
          const what = `${control.name} ${JSON.stringify(state)}`;
          const won = s.cascade.winner(el, "transition", state);
          expect(won?.sheet, what).toBe("ui/button.css");
          const value = won?.value ?? "";
          expect(value, what).not.toMatch(/\b(all|transform|top|left|right|bottom|margin|width|height)\b/);
          for (const ms of value.match(/\d+ms/g) ?? []) expect(Number.parseInt(ms, 10), what).toBeLessThanOrEqual(120);
          expect(s.cascade.value(el, "transform", state) ?? "none", what).toBe("none");
        }
  });
});

describe("forced colours (FR-014)", () => {
  it("draws every control in the system's colours, with no image, clip, or shadow, the selected border thicker", async () => {
    const forced = ["forced-colors: active"];
    const check = (s: Skinned, controls: readonly Control[]): void => {
      for (const control of controls)
        for (const el of control.find(s.v.doc)) {
          const what = control.name;
          expect(s.cascade.value(el, "border-image-source"), what).toBe("none");
          expect(s.cascade.value(el, "clip-path"), what).toBe("none");
          expect(s.cascade.value(el, "box-shadow"), what).toBe("none");
          expect(s.cascade.value(el, "background-image"), what).toBe("none");
          expect(face(s.cascade, el), what).toBe("ButtonFace");
          expect(s.cascade.value(el, "color"), what).toBe("ButtonText");
          for (const side of ["top", "right", "bottom", "left"])
            expect(s.cascade.value(el, `border-${side}-color`), what).toBe("ButtonText");
          expect(s.cascade.value(el, "border-top-width"), what).toBe("1px");
          expect(s.cascade.value(el, "outline-color", { focusVisible: true }), what).toBe("Highlight");
          const pressed = el.getAttribute("aria-pressed");
          el.setAttribute("aria-pressed", "true");
          expect(s.cascade.value(el, "border-top-width"), `${what} selected`).toBe("2px");
          if (pressed === null) el.removeAttribute("aria-pressed");
          else el.setAttribute("aria-pressed", pressed);
        }
    };
    check(await room(SPLIT, undefined, forced), ROOM_CONTROLS);
    check(await selectionScreen(undefined, forced), [ENTER]);
  });
});
