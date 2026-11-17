// The room and the selection screen with the skin in place (spec 030, T-B01; plan.md §R-B4), for B's tests: the real
// room as main.ts starts it (test/helpers/room.ts's start), its root carrying the data-skin the build writes on
// index.html, and the page's stylesheets in the bundle's order (main.ts's import graph: style.css, fonts.css, the
// skin's generated stylesheet, ui/button.css, then app.ts's room.css and the modules' own), both inserted into the
// document, where jsdom's getComputedStyle reads them, and given to the cascade (button-cascade.ts), which also reads
// @media and the states jsdom can't enter. Declares no test.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect } from "vitest";

import { readSkins, resolveSkin, skinCss } from "../../build/ui-skins";
import { Cascade } from "./button-cascade";
import type { Env, Sheet } from "./button-cascade";
import { WEB, button, flush, intoRoom, start, stubViewport } from "./room";
import type { Visit } from "./room";

/** The skin file's text with `active` set to `id` (the repository's own value where `id` is absent). */
export function skinText(id?: string): string {
  const text = readFileSync(join(WEB, "content", "ui-skins.yaml"), "utf8");
  return id === undefined ? text : text.replace(/^active: .*$/m, `active: ${id}`);
}

/** The stylesheets in the bundle's order, the skin's generated one among them. */
export function bundleSheets(id?: string): Sheet[] {
  const skin = skinCss(resolveSkin(readSkins(skinText(id))));
  const src = (rel: string): Sheet => ({ name: rel, text: readFileSync(join(WEB, "src", rel), "utf8") });
  return [
    src("style.css"),
    src("fonts.css"),
    { name: "virtual:ui-skin.css", text: skin },
    src("ui/button.css"),
    src("room/room.css"),
    src("choice/choice.css"),
    src("talk/talk.css"),
    src("room/hud/split.css"),
    src("room/loading/loading.css"),
    src("room/bubble.css"),
  ];
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
  const active = resolveSkin(readSkins(skinText(id))).id;
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

/** The room in a layout, past the hand-off ("Keep it for later"), walking where the layout asks, the skin in place. */
export async function room(layout: Layout, id?: string, media: readonly string[] = []): Promise<Skinned> {
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
  return dress(v, id, { media, width: layout.screen.w, height: layout.screen.h });
}

/** One control of Q5, by what finds it, and its variant (Q6). */
export interface Control {
  readonly name: string;
  readonly variant: "primary" | "secondary";
  readonly find: (doc: Document) => Element[];
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

/** The selection screen's "Enter". */
export const ENTER: Control = { name: '"Enter"', variant: "primary", find: all(".choice-enter") };
