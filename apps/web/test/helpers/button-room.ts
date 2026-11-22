// The room and the selection screen with the skin in place (spec 030, T-B01; plan.md §R-B4), for B's tests: the real
// room as main.ts starts it (test/helpers/room.ts's start), its root carrying the data-skin a build without the image
// skin's files writes on index.html (the CSS skin, before his intake and after it: rework-030ds, F-2), and the page's
// stylesheets in the bundle's order (main.ts's import graph: style.css, fonts.css, the
// skin's generated stylesheet, ui/button.css, then app.ts's room.css and the modules' own), both inserted into the
// document, where jsdom's getComputedStyle reads them, and given to the cascade (button-cascade.ts), which also reads
// @media and the states jsdom can't enter. Declares no test.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect } from "vitest";

import { readSkins, resolveSkin, skinCss } from "../../build/ui-skins";
import type { ResolvedSkin } from "../../build/ui-skins";
import type { ReadFile } from "../../build/ui-skins-image";
import { Cascade } from "./button-cascade";
import type { Env, Sheet } from "./button-cascade";
import { WEB, button, flush, intoRoom, radio, roomIndex, start, stubViewport } from "./room";
import type { Visit } from "./room";

/** The skin file's text with `active` set to `id` (the repository's own value where `id` is absent). */
export function skinText(id?: string): string {
  const text = readFileSync(join(WEB, "content", "ui-skins.yaml"), "utf8");
  return id === undefined ? text : text.replace(/^active: .*$/m, `active: ${id}`);
}

/** A reader that finds no file, as a checkout without the image skin's files (rework-030ds, rv-030ds's F-2, Q101). */
const NO_FILES: ReadFile = (path) => {
  throw Object.assign(new Error(`ENOENT: ${path} (B's helpers read no image file)`), { code: "ENOENT" });
};

/** `id`'s skin, `metal` where `id` is absent (the repository's `active`, `metal-image`, is the image skin whose CSS
 *  fallback `metal` is), built as the build builds it with no image file anywhere, so B's cases get `metal`, the CSS
 *  skin, before his intake and after it (rework-030ds, F-2, Q101), and a named image skin its CSS fallback, whole.
 *  DS's cases put the image skin's stylesheet in its place themselves (test/ui/button-image-skin.test.ts). */
function cssSkin(id?: string): ResolvedSkin {
  return resolveSkin(readSkins(skinText(id ?? "metal")), { read: NO_FILES });
}

/** The stylesheets in the bundle's order, the skin's generated one among them; main.ts imports ./resume (its
 *  resume.css, where the resume panel's "Close" is drawn) after the component and before the room's. */
export function bundleSheets(id?: string): Sheet[] {
  const skin = skinCss(cssSkin(id));
  const src = (rel: string): Sheet => ({ name: rel, text: readFileSync(join(WEB, "src", rel), "utf8") });
  return [
    src("style.css"),
    src("fonts.css"),
    { name: "virtual:ui-skin.css", text: skin },
    src("ui/button.css"),
    src("resume/resume.css"),
    src("room/room.css"),
    src("choice/choice.css"),
    src("talk/talk.css"),
    src("room/hud/split.css"),
    src("room/loading/loading.css"),
    src("room/bubble.css"),
  ];
}

/** The same stylesheets without the skin and the component: the page as spec 029 left it, for what B must keep (a
 *  control's `position` where it isn't static, plan §R-B3). */
export function baseSheets(): Sheet[] {
  return bundleSheets().filter((s) => s.name !== "ui/button.css" && s.name !== "virtual:ui-skin.css");
}

/** A window of the HUD, as spec 029's tests name them. */
export interface Layout {
  readonly name: string;
  readonly screen: { readonly w: number; readonly h: number };
  readonly hud: "column" | "dock";
  readonly split: boolean;
  readonly walk: boolean;
}

export const LAYOUTS: readonly Layout[] = [
  { name: "the split layout (1366 × 768)", screen: { w: 1366, h: 768 }, hud: "column", split: true, walk: false },
  { name: "the split layout, walking", screen: { w: 1366, h: 768 }, hud: "column", split: true, walk: true },
  { name: "the column layout (1280 × 720)", screen: { w: 1280, h: 720 }, hud: "column", split: false, walk: false },
  { name: "the dock (390 × 844)", screen: { w: 390, h: 844 }, hud: "dock", split: false, walk: false },
];

/** A page with the skin in place: the visit, the cascade of its stylesheets, and the window's media. */
export interface Skinned {
  readonly v: Visit;
  readonly cascade: Cascade;
  readonly env: Env;
  readonly id: string;
}

function dress(v: Visit, id: string | undefined, env: Env): Skinned {
  const sheets = bundleSheets(id);
  const active = cssSkin(id).id;
  v.doc.documentElement.setAttribute("data-skin", active);
  for (const sheet of sheets) {
    const style = v.doc.createElement("style");
    style.textContent = sheet.text;
    v.doc.head.append(style);
  }
  return { v, cascade: new Cascade(sheets, env), env, id: active };
}

/** The selection screen, before "Enter", with the skin in place. */
export async function selectionScreen(id?: string, media: readonly string[] = []): Promise<Skinned> {
  const viewport = stubViewport({ w: 1366, h: 768 });
  const v = start({ webgl: true, viewport: viewport.factory });
  await flush();
  return dress(v, id, { media, width: 1366, height: 768 });
}

/** Chooses a path and an avatar on the selection screen, so "Enter" is no longer disabled. */
export async function chooseBoth(doc: Document): Promise<void> {
  radio(doc, "path", "engineer").click();
  radio(doc, "avatar", "dog").click();
  await flush();
  const enter = doc.querySelector<HTMLButtonElement>(".choice-enter");
  expect(enter?.disabled).toBe(false);
}

/** What a test opens before it reads a control the room makes only then (rework 2's S-1, Q51): the conversation (its
 *  "Close, Escape", `.split-hint`, in the split layout) or the resume panel (its "Close", `.resume-close`). */
export type Open = "conversation" | "resume";

/** Opens the conversation (a talk object's entry in the list) or the resume panel ("Resume" in the bar). */
export async function open(v: Visit, what: Open): Promise<void> {
  if (what === "conversation") {
    const id = roomIndex().selectables.find((s) => s.action.kind === "talk")?.id;
    const entry = v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id ?? ""}"]`);
    if (!entry) throw new Error("no talk entry in the list");
    entry.click();
    await flush();
    expect(v.doc.querySelector('.talk[data-panel="open"]'), "the conversation open").not.toBeNull();
  } else {
    button(v.doc, "Resume").click();
    // The resume's view renders once its room-data.json has loaded.
    await flush();
    expect(v.doc.querySelector(".resume .resume-close"), "the resume panel open").not.toBeNull();
  }
}

/** The room in a layout, past the hand-off (spec 033: no offer), walking where the layout asks, with the conversation
 *  or the resume panel open where the test asks, the skin in place. */
export async function room(
  layout: Layout,
  id?: string,
  media: readonly string[] = [],
  opened?: Open,
): Promise<Skinned> {
  const viewport = stubViewport(layout.screen);
  const v = start({ webgl: true, viewport: viewport.factory });
  await intoRoom(v);
  const root = v.doc.documentElement;
  expect(root.getAttribute("data-hud"), layout.name).toBe(layout.hud);
  expect(root.getAttribute("data-split"), layout.name).toBe(layout.split ? "on" : "off");
  if (layout.walk) {
    const walk = v.doc.querySelector<HTMLButtonElement>("button.room-walk");
    if (!walk || walk.hidden) throw new Error(`${layout.name}: no walking control`);
    walk.click();
    await flush();
    expect(v.doc.querySelector(".room-stage-view")?.getAttribute("role"), layout.name).toBe("application");
  }
  if (opened) await open(v, opened);
  return dress(v, id, { media, width: layout.screen.w, height: layout.screen.h });
}

/** One control of Q5, by what finds it, its variant (Q6), and what the room must have open to make it. */
export interface Control {
  readonly name: string;
  readonly variant: "primary" | "secondary";
  readonly find: (doc: Document) => Element[];
  readonly open?: Open;
}

const all = (selector: string) => (doc: Document) => [...doc.querySelectorAll(selector)];

/** The room's controls of Q5: the bar's six tiles, the walking control, "Eat", "Back", the conversation's two header
 *  toggles, and "Send". */
export const ROOM_CONTROLS: readonly Control[] = [
  { name: "the bar's tiles", variant: "secondary", find: all(".hud-bar .hud-tile") },
  { name: "the walking control", variant: "secondary", find: all(".room-walk") },
  { name: '"Eat"', variant: "secondary", find: all(".room-eat") },
  { name: '"Back"', variant: "secondary", find: all(".split-back") },
  { name: "the larger view's toggle", variant: "secondary", find: all(".talk-larger") },
  { name: "the log's toggle", variant: "secondary", find: all(".talk-log-toggle") },
  { name: '"Send"', variant: "primary", find: (doc) => [button(doc, "Send")] },
];

/** The two "Close" buttons (rework, S-1; Q51), each secondary, each reached as the room makes it: the conversation's
 *  "Close, Escape" in the split layout with the conversation open, and the resume panel's "Close" with it open. */
export const CLOSE_BUTTONS: readonly Control[] = [
  { name: '"Close, Escape" (the conversation)', variant: "secondary", find: all(".split-hint"), open: "conversation" },
  { name: '"Close" (the resume panel)', variant: "secondary", find: all(".resume .resume-close"), open: "resume" },
];

/** The selection screen's "Enter". */
export const ENTER: Control = { name: '"Enter"', variant: "primary", find: all(".choice-enter") };

/** A CSS length, or a calc() of px, rem, and em lengths and numbers, in CSS pixels (1rem = 1em = 16px); 0 for a bare
 *  `0`; NaN for anything else. */
export function cssLength(value: string | null): number {
  const src = (value ?? "").trim().replace(/^calc\((.*)\)$/s, "$1");
  let i = 0;
  const skip = (): void => {
    while (src[i] === " ") i += 1;
  };
  const atom = (): number => {
    skip();
    if (src.startsWith("calc(", i)) i += 4;
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
