// T-INT02 (spec 030; FR-008; plan.md §R-B3, "As built (int2-030)"): with B's component in the cascade, no declaration
// of room.css or split.css that sets a property the component owns is left that loses on every element it matches.
// The probe reads the whole page as B's tests read it (test/helpers/button-room.ts's stylesheets in the bundle's order,
// the root's data-skin the build's, the cascade of test/helpers/button-cascade.ts), through the real room at each
// layout the HUD has (split, column, dock, stacked), at rest, walking, with the conversation open, and with the resume
// panel open, under each media the stylesheets ask about (forced colours, less transparency, more contrast, reduced
// motion, no hover), with every element in each state the selectors name (normal, hover, pressed, focus-visible). A
// declaration of an owned property (or a shorthand of owned longhands alone) that matches a skinned control (Q5) and
// wins no longhand it sets on any element, in any of those, is dead: B's rules took it over (T-INT02's GREEN removed
// each). A declaration that matches nothing in these windows isn't judged here.
import { describe, expect, it } from "vitest";

import { readSkins, resolveSkin } from "../../build/ui-skins";
import { Cascade } from "../helpers/button-cascade";
import type { Declaration, State } from "../helpers/button-cascade";
import { bundleSheets, open, skinText } from "../helpers/button-room";
import type { Open } from "../helpers/button-room";
import { flush, intoRoom, roomIndex, start, stubViewport } from "../helpers/room";
import type { Visit } from "../helpers/room";

/** The skinned controls of Q5 (spec.md FR-008), as ui/button.css names them. */
const SKINNED =
  '.hud-bar .hud-tile, .room-walk, .room-eat, .split-back, .split-hint, .resume-close, .talk-larger, .talk-log-toggle, .talk-form .talk-row > button:not(.talk-voice)';

/** The sheets whose dead declarations T-INT02 removes. */
const PROBED = new Set(["room/room.css", "room/hud/split.css"]);

const SIDES = ["top", "right", "bottom", "left"] as const;
const side = (what: string): string[] => SIDES.map((s) => `border-${s}-${what}`);

/** The longhands a declaration of the component's properties sets on the control (plan §R-B3: color, background,
 *  border, border-radius, box-shadow, clip-path, filter, isolation, the font's family and weight, text-transform,
 *  letter-spacing, white-space, min-height, min-width, opacity, transform, transition, the focus ring's outline), as
 *  button-cascade.ts's SHORTHANDS maps them; null for a property the component doesn't own whole. */
function longhands(property: string): string[] | null {
  const whole = [
    "color",
    "background-color",
    "background-image",
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
    "transition",
    "outline-color",
    "outline-style",
    "outline-width",
    "outline-offset",
    ...side("color"),
    ...side("width"),
    ...side("style"),
  ];
  if (whole.includes(property)) return [property];
  const map: Record<string, string[]> = {
    background: ["background-color", "background-image"],
    border: [...side("color"), ...side("width"), ...side("style")],
    "border-color": side("color"),
    "border-width": side("width"),
    "border-style": side("style"),
    "border-image": ["border-image-source"],
    outline: ["outline-color", "outline-style", "outline-width"],
    ...Object.fromEntries(SIDES.map((s) => [`border-${s}`, [`border-${s}-color`, `border-${s}-width`, `border-${s}-style`]])),
  };
  return map[property] ?? null;
}

/** What the component owns on the control's ::before (plan §R-B3). */
const BEFORE_OWNED = new Set([
  "content",
  "position",
  "inset",
  "z-index",
  "pointer-events",
  "background-color",
  "background-image",
  "box-shadow",
  "clip-path",
]);

const MEDIA: readonly (readonly string[])[] = [
  [],
  ["forced-colors: active"],
  ["prefers-reduced-transparency: reduce"],
  ["prefers-contrast: more"],
  ["prefers-reduced-motion: reduce"],
  ["hover: none", "any-hover: none", "pointer: coarse", "any-pointer: coarse"],
];

const STATES: readonly State[] = [{}, { hover: true }, { active: true }, { focusVisible: true }];

interface Window {
  readonly name: string;
  readonly screen: { readonly w: number; readonly h: number };
  readonly hud: string;
  readonly walk?: boolean;
  readonly opened?: Open;
  /** The 2D drawing's room (no WebGL). */
  readonly flat?: boolean;
}

const WINDOWS: readonly Window[] = [
  { name: "split", screen: { w: 1366, h: 768 }, hud: "column" },
  { name: "split, walking", screen: { w: 1366, h: 768 }, hud: "column", walk: true },
  { name: "split, the conversation open", screen: { w: 1366, h: 768 }, hud: "column", opened: "conversation" },
  { name: "split, the resume open", screen: { w: 1366, h: 768 }, hud: "column", opened: "resume" },
  { name: "column", screen: { w: 1280, h: 720 }, hud: "column" },
  { name: "column, walking", screen: { w: 1280, h: 720 }, hud: "column", walk: true },
  { name: "column, the conversation open", screen: { w: 1280, h: 720 }, hud: "column", opened: "conversation" },
  { name: "column, the resume open", screen: { w: 1280, h: 720 }, hud: "column", opened: "resume" },
  { name: "dock", screen: { w: 390, h: 844 }, hud: "dock" },
  { name: "dock, walking", screen: { w: 390, h: 844 }, hud: "dock", walk: true },
  { name: "dock, the conversation open", screen: { w: 390, h: 844 }, hud: "dock", opened: "conversation" },
  { name: "stacked", screen: { w: 300, h: 400 }, hud: "stacked" },
  { name: "split, 2D", screen: { w: 1366, h: 768 }, hud: "column", flat: true },
  { name: "dock, 2D", screen: { w: 390, h: 844 }, hud: "dock", flat: true },
];

const key = (d: Declaration): string =>
  `${d.sheet} | ${d.at.join(" ")} | ${d.selector} | ${d.property}: ${d.value}`.replace(/\s+/g, " ");

/** The selector with the state pseudo-classes taken out: it matches every element the selector matches in a state. */
const stateless = (selector: string): string =>
  selector.replace(/:not\(:(hover|active|focus-visible|focus)\)/g, "").replace(/:(hover|active|focus-visible|focus)(?![\w-])/g, "");

async function visit(w: Window): Promise<Visit> {
  const viewport = stubViewport(w.screen);
  const v = start({ webgl: w.flat !== true, viewport: viewport.factory });
  await intoRoom(v);
  expect(v.doc.documentElement.getAttribute("data-hud"), w.name).toBe(w.hud);
  if (w.walk) {
    const walk = v.doc.querySelector<HTMLButtonElement>("button.room-walk");
    if (!walk || walk.hidden) throw new Error(`${w.name}: no walking control`);
    walk.click();
    await flush();
  }
  // The split layout's conversation and every layout's resume as B's helper opens them; the column's and the dock's
  // conversation by its entry in the list, as the visitor opens it there (no data-panel to wait for).
  if (w.opened === "resume" || (w.opened === "conversation" && w.name.startsWith("split"))) await open(v, w.opened);
  else if (w.opened === "conversation") {
    const id = roomIndex().selectables.find((s) => s.action.kind === "talk")?.id ?? "";
    v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`)?.click();
    await flush();
  }
  // The root's data-skin as the build writes it: the resolved skin's (metal while the image skin's files are absent).
  v.doc.documentElement.setAttribute("data-skin", resolveSkin(readSkins(skinText())).id);
  return v;
}

describe("no declaration of room.css or split.css lost to B's component (spec 030, T-INT02)", () => {
  it("leaves none that matches a skinned control and wins nowhere, in any layout, media, or state", async () => {
    const sheets = bundleSheets(resolveSkin(readSkins(skinText())).id);
    const matched = new Map<string, Declaration>();
    const onSkinned = new Set<string>();
    const won = new Set<string>();
    for (const w of WINDOWS) {
      const t0 = Date.now();
      const v = await visit(w);
      for (const media of MEDIA) {
        const cascade = new Cascade(sheets, { media, width: w.screen.w, height: w.screen.h });
        const candidates = cascade.declarations.filter(
          (d) =>
            PROBED.has(d.sheet) &&
            (d.pseudo === null ? longhands(d.property) !== null : d.pseudo === "before" && BEFORE_OWNED.has(d.property)),
        );
        const elements = new Set<Element>();
        for (const d of candidates) {
          let found: Element[];
          try {
            found = [...v.doc.querySelectorAll(stateless(d.element))];
          } catch {
            found = [...v.doc.querySelectorAll("*")];
          }
          for (const el of found) elements.add(el);
        }
        for (const el of elements) {
          const skinned = el.matches(SKINNED);
          for (const base of STATES)
            for (const pseudo of [undefined, "before"] as const) {
              const state: State = pseudo ? { ...base, pseudo } : base;
              const names = new Set<string>();
              for (const d of candidates)
                if ((d.pseudo ?? undefined) === pseudo)
                  for (const l of pseudo ? [d.property] : (longhands(d.property) ?? [])) names.add(l);
              for (const name of names) {
                for (const d of cascade.matching(el, name, state)) {
                  if (!PROBED.has(d.sheet)) continue;
                  matched.set(key(d), d);
                  if (skinned) onSkinned.add(key(d));
                }
                const winner = cascade.winner(el, name, state);
                if (winner && PROBED.has(winner.sheet)) won.add(key(winner));
              }
            }
        }
      }
      console.log(`${w.name}: ${Date.now() - t0} ms`);
    }
    const dead = [...onSkinned].filter((k) => !won.has(k)).sort();
    console.log(`the probe: ${matched.size} declarations matched, ${onSkinned.size} on a skinned control, ${dead.length} dead`);
    for (const k of dead) console.log(`dead: ${k}`);
    expect(dead).toEqual([]);
  }, 1_800_000);
});
