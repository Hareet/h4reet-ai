// T-B01 (c) (spec 030; FR-012 to FR-014; plan.md §R-B3, §R-B4): the component's states, through the real room (the
// split layout at rest and walking, the column layout, the dock, the conversation and the resume panel open) and the
// selection screen, read by the cascade (test/helpers/button-cascade.ts), which enters the states jsdom can't, reads
// a control's ::before and ::after, and applies @media as the window asks.
// - Each state reaches each control that has it, both "Close" buttons included (rework S-1): hover, focus-visible, and
//   pressed (:active) every control; disabled (:disabled, aria-disabled="true") the room's buttons and links, and
//   "Enter" before both choices; selected (aria-pressed="true") "Pause the room" once pressed, and the walking control
//   while walking (Q6).
// - Each state differs from normal by more than colour (WCAG 1.4.1): a property other than a colour changes (the
//   bevel's geometry on the ::before, the selected frame's width, the dashes on the ::after, the ring), never only
//   `color` or `background-color`.
// - Nothing clips a control (rework, S-4; rv-030b's R-2): in every layout, view, and state, no rule that selects a
//   control sets clip-path or -webkit-clip-path to anything but none, jsdom computes none, and the chamfer's clip-path
//   is on rules ending in ::before or ::after; no control has a filter; and the control's own box-shadow is none in
//   every state under every skin, won by ui/button.css (rv-rework2-spec-030's R-2: spec 029's plate, split.css's
//   over-room block, would otherwise draw a square ring round the chamfer).
// - Disabled's dashes are the ::after's (plan §R-B3, analysis R-2), in the variant's disabled border colour; the
//   selected glow is an inset shadow on the ::before, with a 2 px frame there (Q72).
// - The focus ring is B's, 2 px solid in the variant's ring colour, drawn inside the face: its outline-offset puts the
//   ring's outer corners inside the ::before's octagon (Q72).
// - Hover's rules apply only where the window can hover (rv-030b's N-2; as room.css guards the tiles').
// - A label twice its length wraps: no nowrap and no ellipsis on the control or anything inside it.
// - Reduced motion: no transition, animation, or transform in any state, on the control or its ::before; otherwise
//   at most 120 ms, of colours and shadows alone, never a movement (FR-014).
// - Forced colours: border-image none, no clip-path, no filter, no shadow, the system's colours, a 1 px ButtonText
//   border (2 px when selected), the ring in Highlight, and the ::before and ::after not displayed.
import { describe, expect, it } from "vitest";

import { readSkins } from "../../build/ui-skins";
import type { CssSkin } from "../../build/ui-skins";
import type { Cascade, State } from "../helpers/button-cascade";
import {
  CLOSE_BUTTONS,
  ENTER,
  LAYOUTS,
  ROOM_CONTROLS,
  chooseBoth,
  cssLength,
  room,
  selectionScreen,
  skinText,
} from "../helpers/button-room";
import type { Control, Layout, Skinned } from "../helpers/button-room";
import { button, flush } from "../helpers/room";

const skins = readSkins(skinText());
const metal = skins.skins.metal as CssSkin;
const SPLIT = LAYOUTS.find((l) => l.split && !l.walk) as Layout;
const WALKING = LAYOUTS.find((l) => l.walk) as Layout;
if (!SPLIT || !WALKING) throw new Error("no split layout");

const BEFORE: State = { pseudo: "before" };
const AFTER: State = { pseudo: "after" };
const on = (state: State, pseudo: "before" | "after"): State => ({ ...state, pseudo });

/** A shadow list's geometry, its colours taken out. */
const geometry = (shadow: string | null): string =>
  (shadow ?? "none")
    .replace(
      /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:transparent|currentcolor|Canvas|CanvasText|ButtonText|Highlight)\b/gi,
      "C",
    )
    .replace(/\s+/g, " ")
    .trim();

/** What a state may show beyond colour (FR-012). */
function marks(c: Cascade, el: Element, state: State): Record<string, string> {
  return {
    bevel: geometry(c.value(el, "box-shadow", on(state, "before"))),
    dashes: `${c.value(el, "content", on(state, "after")) ?? "none"} ${c.value(el, "border-top-style", on(state, "after")) ?? ""}`,
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

/** The variant's face in a state: the ::before's background, as the cascade resolves it. */
const face = (c: Cascade, el: Element, state: State = {}): string | null =>
  c.value(el, "background-color", on(state, "before"));

/** The ring: B's, 2 px solid in the variant's ring colour, its outer corners inside the ::before's octagon. The
 *  ::before fills the control's padding box (inset 0), so in the border box its octagon's diagonal is x + y = chamfer +
 *  2 × (border + inset); the outline's outer edge lies (−offset − width) inside the border box. */
function ringInside(c: Cascade, el: Element, control: Control, skin: CssSkin, what: string, state: State = {}): void {
  const focus: State = { ...state, focusVisible: true };
  expect(c.winner(el, "outline-style", focus)?.sheet, `${what}: B's ring`).toBe("ui/button.css");
  expect(c.value(el, "outline-style", focus), `${what}: a ring`).toBe("solid");
  const width = cssLength(c.value(el, "outline-width", focus));
  expect(width, `${what}: ring width`).toBe(2);
  expect(c.value(el, "outline-color", focus), `${what}: ring colour`).toBe(skin.tokens[control.variant].ring);
  const offset = cssLength(c.value(el, "outline-offset", focus));
  const border = cssLength(c.value(el, "border-top-width", focus));
  const inset = cssLength(c.value(el, "inset", on(focus, "before")));
  const chamfer = cssLength(skin.tokens.chamfer);
  const corner = -offset - width;
  expect(corner, `${what}: the ring inside the control (offset ${String(offset)})`).toBeGreaterThanOrEqual(0);
  expect(2 * corner, `${what}: the ring's corners inside the octagon (offset ${String(offset)})`).toBeGreaterThanOrEqual(
    chamfer + 2 * (border + inset),
  );
}

function wraps(c: Cascade, el: Element, what: string): void {
  for (const node of [el, ...el.querySelectorAll("*")]) {
    expect(c.value(node, "white-space") ?? "normal", `${what}: ${node.tagName} white-space`).not.toMatch(/nowrap|pre/);
    expect(c.value(node, "text-overflow"), `${what}: ${node.tagName} text-overflow`).not.toBe("ellipsis");
  }
}

/** Each control a page holds, with the layout's name: every room control in each layout, both "Close" buttons as the
 *  room makes them, and "Enter" before and after both choices. */
async function everyControl(id?: string, media: readonly string[] = []): Promise<[Skinned, Control, Element][]> {
  const out: [Skinned, Control, Element][] = [];
  for (const layout of LAYOUTS) {
    const s = await room(layout, id, media);
    for (const control of ROOM_CONTROLS) for (const el of control.find(s.v.doc)) out.push([s, control, el]);
  }
  for (const control of CLOSE_BUTTONS) {
    const s = await room(SPLIT, id, media, control.open);
    for (const el of control.find(s.v.doc)) out.push([s, control, el]);
  }
  const screen = await selectionScreen(id, media);
  for (const el of ENTER.find(screen.v.doc)) out.push([screen, ENTER, el]);
  const after = await selectionScreen(id, media);
  await chooseBoth(after.v.doc);
  for (const el of ENTER.find(after.v.doc)) out.push([after, ENTER, el]);
  return out;
}

/** Each state a control can be read in: the interaction states, and selected and disabled by their attributes. */
const STATES: readonly [string, State, ((el: Element) => () => void) | null][] = [
  ["normal", {}, null],
  ["hover", { hover: true }, null],
  ["focus-visible", { focusVisible: true }, null],
  ["pressed", { active: true }, null],
  [
    "selected",
    {},
    (el) => {
      const was = el.getAttribute("aria-pressed");
      el.setAttribute("aria-pressed", "true");
      return () => (was === null ? el.removeAttribute("aria-pressed") : el.setAttribute("aria-pressed", was));
    },
  ],
  [
    "disabled",
    {},
    (el) => {
      const was = el.getAttribute("aria-disabled");
      el.setAttribute("aria-disabled", "true");
      return () => (was === null ? el.removeAttribute("aria-disabled") : el.setAttribute("aria-disabled", was));
    },
  ],
];

describe("the component's states (FR-012)", () => {
  it("reaches hover, focus-visible, and pressed on every room control and both Close buttons, each beyond colour, the ring inside", async () => {
    const pages: [Skinned, readonly Control[]][] = [[await room(SPLIT), ROOM_CONTROLS]];
    for (const control of CLOSE_BUTTONS) pages.push([await room(SPLIT, undefined, [], control.open), [control]]);
    for (const [s, controls] of pages)
      for (const control of controls)
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
          ringInside(s.cascade, el, control, metal, what);
        }
  });

  it("applies hover only where the window can hover (@media (hover: hover))", async () => {
    const s = await room(SPLIT, undefined, ["hover: none", "any-hover: none", "pointer: coarse", "any-pointer: coarse"]);
    for (const control of ROOM_CONTROLS)
      for (const el of control.find(s.v.doc)) {
        const what = control.name;
        expect(face(s.cascade, el, { hover: true }), `${what}: no hover face`).toBe(face(s.cascade, el));
        expect(marks(s.cascade, el, { hover: true }), `${what}: no hover bevel`).toEqual(marks(s.cascade, el, {}));
      }
    const hovering = await room(SPLIT);
    for (const el of ROOM_CONTROLS[0]?.find(hovering.v.doc) ?? []) {
      const won = hovering.cascade.winner(el, "--_face", { hover: true });
      expect(won?.at.join(" "), "hover's rule sits in @media (hover: hover)").toMatch(/@media\s*\(hover:\s*hover\)/);
    }
  });

  it("reaches disabled on the room's buttons and links and both Close buttons, by :disabled and by aria-disabled, with the ::after's dashes", async () => {
    const pages: [Skinned, readonly Control[]][] = [[await room(SPLIT), ROOM_CONTROLS]];
    for (const control of CLOSE_BUTTONS) pages.push([await room(SPLIT, undefined, [], control.open), [control]]);
    for (const [s, controls] of pages)
      for (const control of controls)
        for (const el of control.find(s.v.doc)) {
          const what = control.name;
          const ways: [string, () => void, () => void][] = [
            ["aria-disabled", () => el.setAttribute("aria-disabled", "true"), () => el.removeAttribute("aria-disabled")],
          ];
          if (el.tagName === "BUTTON")
            ways.push(["disabled", () => el.setAttribute("disabled", ""), () => el.removeAttribute("disabled")]);
          for (const [how, enable, restore] of ways) {
            const was = el.getAttribute("aria-disabled");
            const before = marks(s.cascade, el, {});
            expect(s.cascade.value(el, "content", AFTER) ?? "none", `${what}: no dashes at rest`).toMatch(/^(none|normal)$/);
            enable();
            const t = metal.tokens[control.variant].disabled;
            expect(face(s.cascade, el), `${what} ${how}: face`).toBe(t.face);
            expect(s.cascade.value(el, "content", AFTER), `${what} ${how}: the ::after`).toBe('""');
            expect(s.cascade.value(el, "border-top-style", AFTER), `${what} ${how}: dashed`).toBe("dashed");
            expect(s.cascade.value(el, "border-top-color", AFTER), `${what} ${how}: the dashes' colour`).toBe(t.border);
            expect(s.cascade.value(el, "pointer-events", AFTER), `${what} ${how}: the dashes take no press`).toBe("none");
            expect(s.cascade.value(el, "clip-path", AFTER) ?? "", `${what} ${how}: the dashes inside the chamfer`).toMatch(
              /^polygon\(/,
            );
            const after = marks(s.cascade, el, {});
            const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
            expect(changed.length, `${what} ${how}: beyond colour`).toBeGreaterThan(0);
            restore();
            if (was !== null) el.setAttribute("aria-disabled", was);
          }
        }
  });

  it('reaches selected on "Pause the room" pressed, with the glow and a 2 px frame on the ::before', async () => {
    const s = await room(SPLIT);
    const pause = button(s.v.doc, "Pause the room");
    const before = marks(s.cascade, pause, {});
    pause.click();
    await flush();
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    const after = marks(s.cascade, pause, {});
    expect(after.bevel).not.toBe(before.bevel);
    const t = metal.tokens.secondary.selected;
    const shadow = s.cascade.value(pause, "box-shadow", BEFORE) ?? "";
    expect(shadow).toContain(`inset 0 0 0 2px ${t.border}`);
    expect(shadow).toContain(t.glow);
    expect(face(s.cascade, pause)).toBe(t.face);
    // The control's own box doesn't change: its border stays as at rest, so nothing moves (FR-014).
    expect(s.cascade.value(pause, "border-top-width")).toBe(s.cascade.value(button(s.v.doc, "Resume"), "border-top-width"));
    ringInside(s.cascade, pause, ROOM_CONTROLS[0] as Control, metal, '"Pause the room" selected');
  });

  it("reaches selected on the walking control while walking", async () => {
    const s = await room(WALKING);
    const walk = s.v.doc.querySelector(".room-walk");
    if (!walk) throw new Error("no walking control");
    const t = metal.tokens.secondary.selected;
    expect(face(s.cascade, walk)).toBe(t.face);
    const shadow = s.cascade.value(walk, "box-shadow", BEFORE) ?? "";
    expect(shadow).toContain(t.glow);
    expect(shadow).toContain(`inset 0 0 0 2px ${t.border}`);
  });

  it('gives "Enter" its disabled look before both choices and its primary look after, the ring inside', async () => {
    const s = await selectionScreen();
    const enter = ENTER.find(s.v.doc)[0];
    if (!enter) throw new Error("no Enter");
    expect((enter as HTMLButtonElement).disabled).toBe(true);
    expect(face(s.cascade, enter)).toBe(metal.tokens.primary.disabled.face);
    expect(s.cascade.value(enter, "border-top-style", AFTER)).toBe("dashed");
    await chooseBoth(s.v.doc);
    expect(face(s.cascade, enter)).toBe(metal.tokens.primary.normal.face);
    expect(s.cascade.value(enter, "content", AFTER) ?? "none").toMatch(/^(none|normal)$/);
    for (const state of [{ hover: true }, { focusVisible: true }, { active: true }])
      differsBeyondColour(s.cascade, enter, state, `"Enter" ${JSON.stringify(state)}`);
    ringInside(s.cascade, enter, ENTER, metal, '"Enter"');
  });
});

describe("nothing clips a control, nor shadows or filters it (FR-013; rework, S-4; rv-030b's R-2)", () => {
  for (const [id, skin] of Object.entries(skins.skins))
    if (skin.kind === "css")
      it(`${id}: every control, in every layout, view, and state`, async () => {
        for (const [s, control, el] of await everyControl(id))
          for (const [name, state, apply] of STATES) {
            const undo = apply?.(el);
            const what = `${id}, ${control.name}, ${name}`;
            for (const property of ["clip-path", "-webkit-clip-path", "filter"])
              for (const d of s.cascade.matching(el, property, state))
                expect(d.value, `${what}: ${property} by ${d.sheet} (${d.selector})`).toBe("none");
            const computed = s.v.win.getComputedStyle(el).getPropertyValue("clip-path");
            expect(["none", ""], `${what}: jsdom's clip-path`).toContain(computed);
            const shadow = s.cascade.winner(el, "box-shadow", state);
            expect(shadow?.sheet, `${what}: the control's box-shadow won by ${shadow?.sheet ?? "nothing"}`).toBe(
              "ui/button.css",
            );
            expect(s.cascade.value(el, "box-shadow", state), `${what}: the control's box-shadow`).toBe("none");
            ringInside(s.cascade, el, control, skin, what, state);
            undo?.();
          }
      });

  it("keeps the control's box-shadow none with its panel over the room, where spec 029's plate would draw (rework 3, R-2)", async () => {
    // A's halves mark the right column's panels data-over="room" at rest (rework 2, R-2); on B's branch nothing marks
    // them at the room's framing, so the case marks them as A's tree does, to put split.css's plate rule in the cascade.
    for (const opened of ["conversation", "resume"] as const) {
      const s = await room(SPLIT, undefined, [], opened);
      for (const part of [".talk", ".room-list", ".hud-bar"])
        for (const el of s.v.doc.querySelectorAll(part)) el.setAttribute("data-over", "room");
      const marked = [".split-back", ".split-hint", ".talk-log-toggle", ".hud-bar .hud-tile"].flatMap((q) => [
        ...s.v.doc.querySelectorAll(q),
      ]);
      expect(marked.length).toBeGreaterThan(0);
      let plates = 0;
      for (const el of marked)
        for (const [name, state, apply] of STATES) {
          const undo = apply?.(el);
          const what = `${opened}, ${el.className}, ${name}`;
          plates += s.cascade
            .matching(el, "box-shadow", state)
            .filter((d) => d.sheet === "room/hud/split.css" && /0 0 0 0\.25rem/.test(d.value)).length;
          const won = s.cascade.winner(el, "box-shadow", state);
          expect(won?.sheet, `${what}: won by ${won?.sheet ?? "nothing"} (${won?.selector ?? ""})`).toBe("ui/button.css");
          expect(s.cascade.value(el, "box-shadow", state), what).toBe("none");
          undo?.();
        }
      // The case discriminates: spec 029's plate rule (split.css's `0 0 0 0.25rem`) is in the cascade and loses.
      expect(plates, `${opened}: the plate rule matched`).toBeGreaterThan(0);
    }
  });

  it("declares every shadow other than none on a ::before rule (rework 3, R-2)", async () => {
    const s = await room(SPLIT);
    const shadows = s.cascade.declarations.filter((d) => d.sheet === "ui/button.css" && d.property === "box-shadow");
    expect(shadows.some((d) => d.pseudo === "before" && d.value !== "none")).toBe(true);
    for (const d of shadows.filter((x) => x.value !== "none")) expect(d.pseudo, d.selector).toBe("before");
  });

  it("puts the chamfer's clip-path only on rules ending in ::before or ::after", async () => {
    const s = await room(SPLIT);
    const clips = s.cascade.declarations.filter(
      (d) => d.sheet === "ui/button.css" && /clip-path$/.test(d.property) && d.value !== "none",
    );
    expect(clips.length).toBeGreaterThan(0);
    for (const d of clips) expect(d.pseudo, d.selector).not.toBeNull();
    expect(clips.some((d) => d.pseudo === "before")).toBe(true);
    expect(clips.some((d) => d.pseudo === "after")).toBe(true);
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
    for (const control of CLOSE_BUTTONS) {
      const opened = await room(SPLIT, undefined, [], control.open);
      for (const el of control.find(opened.v.doc)) wraps(opened.cascade, el, control.name);
    }
    const screen = await selectionScreen();
    for (const el of ENTER.find(screen.v.doc)) wraps(screen.cascade, el, ENTER.name);
  });
});

describe("motion (FR-014)", () => {
  const MOTION_STATES: State[] = [{}, { hover: true }, { focusVisible: true }, { active: true }];

  it("under reduced motion: no transition, animation, or transform, in any state, on the control or its ::before", async () => {
    const check = (s: Skinned, controls: readonly Control[]): void => {
      for (const control of controls)
        for (const el of control.find(s.v.doc))
          for (const state of MOTION_STATES)
            for (const layer of [state, on(state, "before")]) {
              const what = `${control.name} ${JSON.stringify(layer)}`;
              expect(s.cascade.value(el, "transition", layer) ?? "none", what).toMatch(/^none\b/);
              expect(s.cascade.value(el, "animation-name", layer) ?? "none", what).toBe("none");
              expect(s.cascade.value(el, "transform", layer) ?? "none", what).toBe("none");
            }
    };
    const reduce = ["prefers-reduced-motion: reduce"];
    check(await room(SPLIT, undefined, reduce), ROOM_CONTROLS);
    for (const control of CLOSE_BUTTONS) check(await room(SPLIT, undefined, reduce, control.open), [control]);
    check(await selectionScreen(undefined, reduce), [ENTER]);
  });

  it("otherwise fades colours and shadows for at most 120 ms, and never moves", async () => {
    const s = await room(SPLIT);
    for (const control of ROOM_CONTROLS)
      for (const el of control.find(s.v.doc))
        for (const state of MOTION_STATES)
          for (const layer of [state, on(state, "before")]) {
            const what = `${control.name} ${JSON.stringify(layer)}`;
            const won = s.cascade.winner(el, "transition", layer);
            expect(won?.sheet, what).toBe("ui/button.css");
            const value = won?.value ?? "";
            expect(value, what).not.toMatch(/\b(all|transform|top|left|right|bottom|inset|margin|width|height)\b/);
            for (const ms of value.match(/\d+ms/g) ?? []) expect(Number.parseInt(ms, 10), what).toBeLessThanOrEqual(120);
            expect(s.cascade.value(el, "transform", layer) ?? "none", what).toBe("none");
          }
  });
});

describe("forced colours (FR-014)", () => {
  it("draws every control in the system's colours, with no image, clip, filter, or shadow, the ::before and ::after hidden, the selected border thicker", async () => {
    const forced = ["forced-colors: active"];
    const check = (s: Skinned, controls: readonly Control[]): void => {
      for (const control of controls)
        for (const el of control.find(s.v.doc)) {
          const what = control.name;
          expect(s.cascade.value(el, "border-image-source"), what).toBe("none");
          expect(s.cascade.value(el, "clip-path"), what).toBe("none");
          expect(s.cascade.value(el, "filter"), what).toBe("none");
          expect(s.cascade.value(el, "box-shadow"), what).toBe("none");
          expect(s.cascade.value(el, "background-image"), what).toBe("none");
          expect(s.cascade.value(el, "background-color"), what).toBe("ButtonFace");
          expect(s.cascade.value(el, "color"), what).toBe("ButtonText");
          for (const side of ["top", "right", "bottom", "left"])
            expect(s.cascade.value(el, `border-${side}-color`), what).toBe("ButtonText");
          expect(s.cascade.value(el, "border-top-style"), what).toBe("solid");
          expect(s.cascade.value(el, "border-top-width"), what).toBe("1px");
          expect(s.cascade.value(el, "outline-color", { focusVisible: true }), what).toBe("Highlight");
          expect(s.cascade.value(el, "display", BEFORE), `${what}: no ::before`).toBe("none");
          expect(s.cascade.value(el, "display", AFTER), `${what}: no ::after`).toBe("none");
          const pressed = el.getAttribute("aria-pressed");
          el.setAttribute("aria-pressed", "true");
          expect(s.cascade.value(el, "border-top-width"), `${what} selected`).toBe("2px");
          if (pressed === null) el.removeAttribute("aria-pressed");
          else el.setAttribute("aria-pressed", pressed);
          el.setAttribute("aria-disabled", "true");
          expect(s.cascade.value(el, "display", AFTER), `${what} disabled: no ::after`).toBe("none");
          expect(s.cascade.value(el, "border-top-style"), `${what} disabled`).toBe("dashed");
          expect(s.cascade.value(el, "color"), `${what} disabled`).toBe("GrayText");
          el.removeAttribute("aria-disabled");
        }
    };
    check(await room(SPLIT, undefined, forced), ROOM_CONTROLS);
    for (const control of CLOSE_BUTTONS) check(await room(SPLIT, undefined, forced, control.open), [control]);
    const screen = await selectionScreen(undefined, forced);
    const enter = ENTER.find(screen.v.doc)[0];
    if (!enter) throw new Error("no Enter");
    // Disabled before both choices: GrayText and a dashed border, as the system draws a disabled button.
    expect(screen.cascade.value(enter, "color")).toBe("GrayText");
    expect(screen.cascade.value(enter, "border-top-style")).toBe("dashed");
    await chooseBoth(screen.v.doc);
    check(screen, [ENTER]);
  });
});
