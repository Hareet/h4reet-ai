// T020 (spec 005; FR-019 to FR-023, FR-026 to FR-028, FR-066; plan.md §6): the HUD's parts in the room, in jsdom with
// the window stubbed (hud/viewport.ts). Where each part sits in the column and the dock layouts; the list's and the
// log's header buttons and what collapsing keeps; the AI disclosure's strip and the stand-in line, which nothing hides;
// the resume over the room; the larger conversation view, only when asked; the blur's levels; the tiles, their words,
// their icons, and their size; and the room's sizes set through style.setProperty alone.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { hudBoxes } from "../../src/room/compose/hud";
import {
  AI_DISCLOSURE,
  WEB,
  button,
  flush,
  intoRoom,
  roomIndex,
  start,
  stubViewport,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";

const WORDS = roomIndex().ui;
const WIDE = { w: 1280, h: 720 } as const;
const UPRIGHT = { w: 390, h: 844 } as const;

async function room(screen: { w: number; h: number } = WIDE, webgl = true) {
  const viewport = stubViewport(screen);
  const v = start({ webgl, viewport: viewport.factory });
  await intoRoom(v);
  return { v, viewport };
}

const root = (v: Visit): HTMLElement => v.doc.documentElement;
const listToggle = (v: Visit): HTMLButtonElement => button(v.doc, WORDS["list.heading"] ?? "In the room");
const logToggle = (v: Visit): HTMLButtonElement => button(v.doc, WORDS["hud.log_toggle"] ?? "Conversation");
const largerToggle = (v: Visit): HTMLButtonElement =>
  v.doc.querySelector<HTMLButtonElement>(".talk-larger") ?? (null as unknown as HTMLButtonElement);

/** Neither hidden nor inert nor taken from assistive technology, by itself or an ancestor. */
const shown = (el: Element | null): boolean =>
  el !== null && el.closest("[hidden], [inert], [aria-hidden='true']") === null;

describe("the HUD's places (FR-019, FR-020)", () => {
  it("lays the bar at the foot holding the toolbar's tiles in order, and the column the list then the conversation; no note on the stage (spec 028)", async () => {
    const { v } = await room(WIDE);
    expect(root(v).getAttribute("data-hud")).toBe("column");
    const bar = v.doc.querySelector(".hud-bar");
    expect(bar?.getAttribute("role")).toBe("group");
    const tiles = [...(bar?.children ?? [])].map((el) => textOf(el));
    expect(tiles.slice(0, 3)).toEqual(["Resume", "2D view", WORDS["pause.button"]]);
    // Spec 016 (FR-042; changed with T064, plan.md R-18): Credits after How data flows, the bar's last tile.
    expect(tiles.slice(-2)).toEqual(["How data flows", "Credits"]);
    const panels = v.doc.querySelector(".hud-panels");
    expect([...(panels?.children ?? [])].map((el) => el.className.split(" ")[0])).toEqual(["room-list", "talk"]);
    // Spec 028 (T-A06, FR-012; plan.md §R-B8): the stand-in line is no longer in the clear box's notes, which hold
    // nothing; it is "Around the room"'s first line.
    expect(v.doc.querySelectorAll(".room-notes > *")).toHaveLength(0);
    expect(v.doc.querySelector('.room-around [data-line="twin"]')).not.toBeNull();
  });

  it("docks the list's strip and the text box's row above the bar on a window held upright", async () => {
    const { v } = await room(UPRIGHT);
    expect(root(v).getAttribute("data-hud")).toBe("dock");
    const b = hudBoxes(UPRIGHT);
    expect(root(v).style.getPropertyValue("--dock-h")).toBe(`${b.dock?.h}px`);
    const panels = v.doc.querySelector(".hud-panels");
    expect(panels?.firstElementChild?.classList.contains("room-list")).toBe(true);
    expect(panels?.querySelector(".talk-form")).not.toBeNull();
    // The log is a sheet above the dock, out of view until it holds a line, and still in the accessibility tree.
    const talk = v.doc.querySelector(".talk");
    expect(talk?.getAttribute("data-log")).toBe("empty");
    expect(talkLog(v.doc).getAttribute("role")).toBe("log");
    expect(shown(talkLog(v.doc))).toBe(true);
  });
});

describe("the collapsing parts (FR-023)", () => {
  it("collapses and opens the list by its header button, in one press, every selectable one press away", async () => {
    const { v, viewport } = await room(UPRIGHT);
    const toggle = listToggle(v);
    expect(toggle.closest("h2")?.id).toBe("room-list-heading");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = v.doc.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(list?.tagName).toBe("UL");
    const open = hudBoxes(UPRIGHT).clear;
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(list?.hidden).toBe(true);
    expect(root(v).getAttribute("data-list")).toBe("collapsed");
    // The dock re-frames into the space the list's rows freed.
    expect(root(v).style.getPropertyValue("--clear-h")).toBe(`${hudBoxes(UPRIGHT, { list: "collapsed" }).clear.h}px`);
    expect(hudBoxes(UPRIGHT, { list: "collapsed" }).clear.h).toBeGreaterThan(open.h);
    expect(viewport.measures.w).toBe(390);
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(list?.hidden).toBe(false);
    expect(root(v).style.getPropertyValue("--clear-h")).toBe(`${open.h}px`);
    // Collapsing the list that holds focus moves focus to its header button (FR-045).
    const first = v.doc.querySelector<HTMLButtonElement>(".room-list li button");
    first?.focus();
    toggle.click();
    expect(v.doc.activeElement).toBe(toggle);
  });

  it("keeps the column's clear area when the list collapses there", async () => {
    const { v } = await room(WIDE);
    const before = root(v).style.getPropertyValue("--clear-w");
    listToggle(v).click();
    expect(root(v).style.getPropertyValue("--clear-w")).toBe(before);
    expect(root(v).getAttribute("data-list")).toBe("collapsed");
  });

  it("collapses the log by its header button, keeping it in the accessibility tree, and still announces an answer once", async () => {
    const { v } = await room(WIDE);
    const toggle = logToggle(v);
    expect(toggle.getAttribute("aria-controls")).toBe(talkLog(v.doc).id);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const log = talkLog(v.doc);
    expect(log.getAttribute("role")).toBe("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.hidden).toBe(false);
    expect(shown(log)).toBe(true);
    expect(log.classList.contains("visually-hidden")).toBe(true);
    // A line still lands in the log, once.
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (!box) throw new Error("no text box");
    box.value = "Is anyone there?";
    button(v.doc, "Send").click();
    await flush();
    expect(log.childElementCount).toBe(1);
    toggle.click();
    expect(log.classList.contains("visually-hidden")).toBe(false);
  });
});

describe("what never hides (FR-021, FR-022)", () => {
  it("keeps the AI disclosure in view in every panel state, and the stand-in line in Around the room, in no panel (spec 028)", async () => {
    const { v } = await room(UPRIGHT);
    const check = (what: string): void => {
      const strip = v.doc.getElementById("ai-disclosure");
      expect(textOf(strip), what).toBe(AI_DISCLOSURE);
      expect(shown(strip), what).toBe(true);
      // Spec 028 (FR-012, FR-015): the stand-in line is "Around the room"'s, off the stage.
      const line = v.doc.querySelector('.room-around [data-line="twin"]');
      expect(textOf(line), what).not.toBe("");
      expect(shown(v.doc.querySelector("#talk-text")), `${what}: the text box`).toBe(true);
      // Nothing that collapses holds either.
      expect(strip?.closest(".room-list, .talk-sheet, .resume-panel"), what).toBeNull();
      expect(line?.closest(".room-list, .talk-sheet, .resume-panel") ?? null, what).toBeNull();
    };
    check("open");
    listToggle(v).click();
    check("the list collapsed");
    logToggle(v).click();
    check("the log collapsed");
    largerToggle(v).click();
    check("the larger view");
    button(v.doc, "Resume").click();
    await flush();
    check("the resume open");
  });
});

describe("the resume over the room (FR-027)", () => {
  it("opens in the clear area, opaque, with focus on its heading, and Close and Escape return focus to Resume", async () => {
    const { v } = await room(WIDE);
    const rules = readFileSync(join(WEB, "src/room/room.css"), "utf8");
    expect(rules).toMatch(
      /html\[data-hud="column"\] \.resume-panel,\s*html\[data-hud="dock"\] \.resume-panel \{[^}]*left: var\(--clear-x\);[^}]*background: #ffffff;/,
    );
    button(v.doc, "Resume").click();
    await flush();
    expect(v.doc.activeElement?.id).toBe("resume-heading");
    button(v.doc, "Close").click();
    expect(v.doc.activeElement).toBe(button(v.doc, "Resume"));
    button(v.doc, "Resume").click();
    await flush();
    v.doc.activeElement?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(v.doc.activeElement).toBe(button(v.doc, "Resume"));
  });
});

describe("the larger conversation view, only when asked (FR-028)", () => {
  it("opens and closes by its toggle, never by a turn, never re-framing the room, the newest line in view", async () => {
    const { v } = await room(WIDE);
    const toggle = largerToggle(v);
    expect(textOf(toggle)).toBe(WORDS["talk.larger"]);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(talkLog(v.doc).id);
    const clear = root(v).style.getPropertyValue("--clear-w");
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(textOf(toggle)).toBe(WORDS["talk.smaller"]);
    expect(v.doc.querySelector(".talk")?.getAttribute("data-larger")).toBe("on");
    expect(root(v).style.getPropertyValue("--clear-w")).toBe(clear);
    // A turn's failure, its fixed message, opens or closes nothing.
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (!box) throw new Error("no text box");
    box.value = "Hello";
    button(v.doc, "Send").click();
    await flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const log = talkLog(v.doc);
    expect(log.scrollTop).toBe(log.scrollHeight);
    // Escape in the larger view closes it, and focus goes back to its toggle.
    log.focus();
    toggle.focus();
    toggle.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(v.doc.activeElement).toBe(toggle);
    toggle.click();
    toggle.click();
    expect(v.doc.querySelector(".talk")?.getAttribute("data-larger")).toBe("off");
    expect(root(v).style.getPropertyValue("--clear-w")).toBe(clear);
  });
});

describe("the blur's levels (FR-025; PD-17)", () => {
  it("is on at quality levels 0 and 1, and off from 2", async () => {
    const { v } = await room(WIDE);
    expect(root(v).getAttribute("data-blur")).toBe("on");
    const seen = new Map<number, string>();
    // Slow frames step the quality controller down a level each window.
    for (let k = 0; k < 600 && v.room.visit.mode !== "2d"; k += 1) {
      v.clock.advance(50, 50);
      seen.set(v.room.visit.quality ?? 0, root(v).getAttribute("data-blur") ?? "");
    }
    expect(seen.get(0)).toBe("on");
    expect(seen.get(1)).toBe("on");
    expect(seen.get(2)).toBe("off");
  });
});

describe("the tiles (FR-026, FR-029)", () => {
  it("shows every control's words, an icon of inline SVG beside them, hidden from assistive technology", async () => {
    const { v } = await room(WIDE);
    const tiles = [...v.doc.querySelectorAll<HTMLElement>(".hud-bar > button, .hud-bar > a, .room-walk")];
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    for (const tile of tiles) {
      expect(tile.classList.contains("hud-tile"), textOf(tile)).toBe(true);
      const words = tile.querySelector(".hud-tile-words");
      expect(textOf(words), textOf(tile)).not.toBe("");
      const svg = tile.querySelector("svg");
      expect(svg?.namespaceURI, textOf(tile)).toBe("http://www.w3.org/2000/svg");
      expect(svg?.getAttribute("aria-hidden"), textOf(tile)).toBe("true");
      expect(svg?.getAttribute("focusable"), textOf(tile)).toBe("false");
      expect(svg?.querySelector("path")?.getAttribute("d"), textOf(tile)).toMatch(/^M/);
    }
    // No markup parsed from strings: the icons' module never writes innerHTML.
    expect(readFileSync(join(WEB, "src/room/hud/icons.ts"), "utf8")).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML/,
    );
    // Every tile at least 44 × 44 in the CSS: 2.75rem.
    const css = readFileSync(join(WEB, "src/room/room.css"), "utf8");
    expect(css).toMatch(/\.hud-tile \{[^}]*min-height: 2\.75rem;[^}]*min-width: 2\.75rem;/);
  });
});

describe("styles through the CSS object model alone (FR-066)", () => {
  it("sets the room's sizes with style.setProperty, never a style attribute", async () => {
    const viewport = stubViewport(WIDE);
    const v = start({ webgl: true, viewport: viewport.factory });
    const set = vi.spyOn(v.win.Element.prototype, "setAttribute");
    const property = vi.spyOn(v.win.CSSStyleDeclaration.prototype, "setProperty");
    await intoRoom(v);
    viewport.set(UPRIGHT);
    listToggle(v).click();
    expect(set.mock.calls.filter(([name]) => name.toLowerCase() === "style")).toEqual([]);
    expect(property.mock.calls.some(([name]) => name === "--clear-w")).toBe(true);
  });
});
