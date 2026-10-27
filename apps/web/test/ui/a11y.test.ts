// T037 (spec 002; FR-043–FR-047; contracts/room-scene.md §5–§6; research.md R-12), in jsdom with axe-core: the room's
// Tab order (the toolbar, the "In the room" list, the conversation panel, then the resume when it's open), visible
// focus in the CSS, the canvas and the 2D drawing hidden from assistive technology with the list as their equivalent,
// 44-pixel targets in the CSS, polite live regions, and 0 axe violations on every screen. What jsdom can't show (layout,
// real focus rings, a screen reader) is the Author's run, quickstart §4.
// T105 (spec 004; FR-063; R-16, R-40): the "In the room" list is the bundle's index's: a button per selectable in
// scene order, named by its name with a visually hidden ": " and its topic's phrase, or the resume action's UI word,
// under the index's own heading. Expectations come from compose(), of the repository's data and of the fixture set,
// whose IDs are synthetic fx- ones.
// T169 (spec 004; FR-063, FR-065, SC-009; User Story 7 scenarios 1, 2, 4, and 5; Amendment B8; R-40): the Tab order
// ends with "Around the room", in 3D and 2D; axe on the paused room too; "Around the room" visible after the
// conversation, outside the stage, open, updated in place in no live region; no meaning on colour alone; and the
// 320 × 568 page, modelled from room.css (below), with five toolbar controls.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { create } from "fontkit";
import type { Font } from "fontkit";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { renderObjectList } from "../../src/room/a11y";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import { memberRect } from "../../src/room/compose/pick";
import { stageFor, sweepScreens } from "../../src/room/compose/stages";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { renderFlat } from "../../src/room/flat";
import { framedBoxes } from "../../src/room/scene/bundle3d";
import { renderTextCopy } from "../../src/room/text-copy";
import {
  AI_DISCLOSURE,
  WEB,
  axeViolations,
  button,
  enter,
  flush,
  intoRoom,
  matchesRule,
  nameOf,
  parseCss,
  px,
  repositoryBundle,
  roomIndex,
  start,
  stylesheets,
  tabOrder,
  talkLog,
  textOf,
} from "../helpers/room";
import type { CssRule, Visit } from "../helpers/room";
import { goodTree, sideWallPolicy, sideWallTree } from "../helpers/room-fixtures";

/** The "In the room" list's buttons by their accessible names, as the index gives them: in scene order, each name, a
 *  ": ", and its topic's phrase, or the resume action's UI word. */
function objectButtons(index: RoomIndex): string[] {
  return index.selectables.map(({ name, action }) => {
    const what =
      action.kind === "talk" ? index.topics.find((t) => t.id === action.topic)?.phrase : index.ui["list.resume_action"];
    return `${name}: ${what ?? ""}`;
  });
}

const OBJECT_BUTTONS = objectButtons(roomIndex());

function rules(): CssRule[] {
  return stylesheets().flatMap((sheet) => parseCss(sheet.text).rules);
}

/** The interactive elements a pointer or finger aims at: buttons, links, text boxes, and each radio's label. */
function targets(doc: Document): Element[] {
  const out: Element[] = [];
  for (const el of doc.querySelectorAll("#app button, #app a[href], #app input")) {
    if (el.closest("[hidden]")) continue;
    out.push(el.tagName === "INPUT" && (el as HTMLInputElement).type === "radio" ? (el.closest("label") ?? el) : el);
  }
  return out;
}

function targetSize(el: Element, all: CssRule[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const rule of all) {
    if (!matchesRule(el, rule.selector)) continue;
    width = Math.max(width, px(rule.declarations.get("min-width")) || 0, px(rule.declarations.get("width")) || 0);
    height = Math.max(height, px(rule.declarations.get("min-height")) || 0, px(rule.declarations.get("height")) || 0);
  }
  return { width, height };
}

/** The relative luminance contrast of a #rrggbb colour against white. */
function contrastOnWhite(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return 1.05 / (l + 0.05);
}

/** The outline a focusable element gets when focused, from the rules whose selector holds :focus-visible. */
function focusOutline(el: Element, all: CssRule[]): { width: number; color: string } | null {
  for (const rule of all) {
    for (const part of rule.selector.split(",")) {
      if (!part.includes(":focus-visible")) continue;
      let base = part.replace(/:focus-visible/g, "").trim();
      if (base === "" || /[\s>+~]$/.test(base)) base = `${base} *`.trim();
      if (!matchesRule(el, base)) continue;
      const m = /^(\d+)px\s+solid\s+(#[0-9a-fA-F]{6})$/.exec(rule.declarations.get("outline") ?? "");
      if (m) return { width: Number(m[1]), color: m[2] ?? "" };
    }
  }
  return null;
}

async function screens(): Promise<[string, Visit][]> {
  const out: [string, Visit][] = [];
  out.push(["the choice, empty", start()]);
  const chosen = start();
  await flush();
  chosen.doc.querySelector<HTMLInputElement>('input[name="path"][value="engineer"]')?.click();
  chosen.doc.querySelector<HTMLInputElement>('input[name="avatar"][value="woman"]')?.click();
  out.push(["the choice, made", chosen]);
  const handoff3d = start({ webgl: true });
  await enter(handoff3d);
  handoff3d.clock.advance(1000);
  out.push(["the hand-off, 3D", handoff3d]);
  const handoff2d = start({ webgl: false });
  await enter(handoff2d);
  handoff2d.clock.advance(2000);
  out.push(["the hand-off, 2D", handoff2d]);
  const offer = start({ webgl: true });
  await enter(offer);
  offer.clock.advance(5000);
  out.push(["after the hand-off", offer]);
  const room3d = start({ webgl: true });
  await intoRoom(room3d);
  out.push(["the room, 3D", room3d]);
  const room2d = start({ webgl: false });
  await intoRoom(room2d);
  out.push(["the room, 2D", room2d]);
  const talking = start({ webgl: true });
  await intoRoom(talking);
  button(talking.doc, OBJECT_BUTTONS[0] ?? "").click();
  const text = talking.doc.querySelector<HTMLInputElement>("#talk-text");
  if (text) text.value = "What do you build?";
  button(talking.doc, "Send").click();
  button(talking.doc, "Hold to talk").click();
  out.push(["the room, with messages", talking]);
  const reading = start({ webgl: true });
  await intoRoom(reading);
  button(reading.doc, "Resume").click();
  // The resume's view renders once its room-data.json has loaded.
  await flush();
  out.push(["the room, with the resume open", reading]);
  // T169 (spec 004; FR-060, FR-065; SC-009): the room paused, in 3D and in 2D, "Paused at" in "Around the room".
  for (const webgl of [true, false]) {
    const paused = start({ webgl });
    await intoRoom(paused);
    button(paused.doc, "Pause the room").click();
    await flush();
    out.push([`the room, paused, ${webgl ? "3D" : "2D"}`, paused]);
  }
  return out;
}

/** "Around the room"'s heading, the UI word around.heading. */
const AROUND = roomIndex().ui["around.heading"] ?? "Around the room";

describe("keyboard", () => {
  // T169 (spec 004; FR-063, FR-065; User Story 7 scenario 1; Amendment B8; R-40): the toolbar, "Pause the room" among
  // its buttons with aria-pressed, the "In the room" list, the conversation, then "Around the room", in 3D and in 2D.
  it.each([
    ["3D", true],
    ["2D", false],
  ] as const)(
    'orders the room\'s Tab stops in %s: the toolbar, the list, the conversation, "Around the room", then the resume',
    async (_, webgl) => {
      const v = start({ webgl });
      await intoRoom(v);
      const stops = tabOrder(v.doc);
      expect(stops.map(nameOf)).toEqual([
        "Resume",
        "2D view",
        "Pause the room",
        "How data flows",
        ...OBJECT_BUTTONS,
        "Your message",
        "Send",
        "Hold to talk",
        AROUND,
      ]);
      // "Pause the room" is a toggle in the toolbar, its state in aria-pressed.
      const pause = stops[2];
      expect(pause?.closest(".room-toolbar")).not.toBeNull();
      expect(pause?.getAttribute("aria-pressed")).toBe("false");
      // The last stop is the section itself, named by its heading.
      expect(stops.at(-1)?.matches("section.room-around")).toBe(true);
      button(v.doc, "Resume").click();
      await flush();
      const order = tabOrder(v.doc).map(nameOf);
      // The toolbar's four stops ("Pause the room", spec 004's, T161), a button per selectable, the conversation
      // panel's three, and "Around the room" come first.
      const room = 4 + OBJECT_BUTTONS.length + 3 + 1;
      expect(order.slice(0, room)).toEqual([
        "Resume",
        "2D view",
        "Pause the room",
        "How data flows",
        ...OBJECT_BUTTONS,
        "Your message",
        "Send",
        "Hold to talk",
        AROUND,
      ]);
      expect(order.slice(room)).toContain("Close");
      expect(order.slice(room)).toContain("Download (PDF)");
    },
  );

  it("orders the choice screen's Tab stops: the path, the avatar, Enter, then the links", async () => {
    const v = start();
    await flush();
    v.doc.querySelector<HTMLInputElement>('input[name="path"][value="engineer"]')?.click();
    v.doc.querySelector<HTMLInputElement>('input[name="avatar"][value="woman"]')?.click();
    const kinds = tabOrder(v.doc).map((el) => (el.tagName === "INPUT" ? (el as HTMLInputElement).name : nameOf(el)));
    // Each radio group is one Tab stop in a browser; the order of first appearances is what matters.
    expect([...new Set(kinds)]).toEqual(["path", "avatar", "Enter", "Download the resume (PDF)", "How data flows"]);
  });

  it("uses no positive tabindex anywhere", async () => {
    for (const [name, v] of await screens()) {
      for (const el of v.doc.querySelectorAll("[tabindex]")) {
        expect(Number(el.getAttribute("tabindex")), name).toBeLessThanOrEqual(0);
      }
    }
  });

  it("keeps focus visible: a 2-pixel solid outline at 3:1 or better on every kind of focusable element", async () => {
    const all = rules();
    for (const [name, v] of await screens()) {
      for (const el of tabOrder(v.doc)) {
        const outline = focusOutline(el, all);
        expect(outline, `${name}: ${nameOf(el)}`).not.toBeNull();
        expect(outline?.width ?? 0).toBeGreaterThanOrEqual(2);
        expect(contrastOnWhite(outline?.color ?? "#ffffff")).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("assistive technology", () => {
  it('hides the 3D canvas and the 2D drawing; the "In the room" list is their equivalent', async () => {
    const v3 = start({ webgl: true });
    await intoRoom(v3);
    expect(v3.doc.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
    const v2 = start({ webgl: false });
    await intoRoom(v2);
    expect(v2.doc.querySelector(".flat")?.getAttribute("aria-hidden")).toBe("true");
    for (const v of [v3, v2]) {
      const list = v.doc.querySelector(".room-list");
      const heading = list?.querySelector("h2");
      expect(heading?.textContent?.trim()).toBe(roomIndex().ui["list.heading"]);
      expect(list?.getAttribute("aria-labelledby")).toBe(heading?.id);
      expect([...(list?.querySelectorAll("ul > li > button") ?? [])].map(nameOf)).toEqual(OBJECT_BUTTONS);
    }
  });

  it('builds the "In the room" list from the index: a button per selectable, with its topic or action', async () => {
    const { index } = compose(goodTree(), noPolicy(), { mode: "strict", drafts: false });
    expect(new Set(index.selectables.map((s) => s.action.kind))).toEqual(new Set(["talk", "resume"]));
    const v = start({ webgl: false, room: index });
    await intoRoom(v);
    const list = v.doc.querySelector(".room-list");
    expect(list?.querySelector("h2")?.textContent?.trim()).toBe(index.ui["list.heading"]);
    const buttons = [...(list?.querySelectorAll("ul > li > button") ?? [])];
    expect(buttons.map((b) => b.getAttribute("data-object-id"))).toEqual(index.selectables.map((s) => s.id));
    expect(buttons.map(nameOf)).toEqual(objectButtons(index));
    // Each shows its name; the ": " and its topic or action are there for a screen reader, visually hidden.
    for (const [k, b] of buttons.entries()) {
      const [shown, hidden, ...rest] = [...b.children];
      expect(rest).toEqual([]);
      expect(textOf(shown ?? null)).toBe(index.selectables[k]?.name);
      expect(hidden?.getAttribute("class")).toBe("visually-hidden");
      expect(hidden?.textContent?.startsWith(": ")).toBe(true);
    }
  });

  it("puts nothing to focus or press in the 2D drawing, whose cues picture what the list's buttons hold", async () => {
    const v = start({ webgl: false });
    await intoRoom(v);
    const flat = v.doc.querySelector(".flat");
    expect(flat?.getAttribute("aria-hidden")).toBe("true");
    expect(flat?.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    // Each selectable is cued in the drawing (spec 004, T109), and has its button in the list.
    const count = roomIndex().selectables.length;
    expect(flat?.querySelectorAll(".flat-cue")).toHaveLength(count);
    expect(v.doc.querySelectorAll(".room-list button")).toHaveLength(count);
  });

  it("has polite live regions for the hand-off line and the twin's words, in the page before either speaks", () => {
    const v = start();
    const status = v.doc.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live") ?? "polite").toBe("polite");
    expect(status?.closest("main")).not.toBeNull();
  });

  it("gives the conversation's log role log, polite, before anything is in it", async () => {
    const v = start();
    await enter(v);
    const log = talkLog(v.doc);
    expect(log.getAttribute("aria-live") ?? "polite").toBe("polite");
    expect(log.textContent?.trim()).toBe("");
  });

  it("has 0 axe violations on every screen", async () => {
    for (const [name, v] of await screens()) {
      expect(await axeViolations(v), name).toEqual([]);
    }
  }, 60_000);
});

// T295 (spec 004; FR-063, FR-064, SC-009): over T292's side-wall overlay (test/fixtures/room/README.md), the "In the
// room" list reaches every selectable at every stage, the list-only side-wall one among them, by a named button; the
// 2D drawing, aria-hidden, hides its cue where it has no pick area and shows the rest, the upper sign's among them,
// which `listOnly`'s release pass keeps.
describe("the side-wall selectables' road in (FR-064's carve-out)", () => {
  it("gives every selectable its named button, and hides only the list-only ones' cues on a 304 px stage", () => {
    const { index } = compose(sideWallTree(), sideWallPolicy(), { mode: "strict", drafts: false });
    const doc = new JSDOM("<main></main>").window.document;
    const select = vi.fn<(id: string) => void>();
    const list = renderObjectList(doc, index, select);
    doc.body.append(list);
    const buttons = [...list.querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("data-object-id"))).toEqual([
      "fx-workstation",
      "fx-board",
      "fx-upper",
      "fx-lower",
    ]);
    expect(buttons.map(nameOf)).toEqual(objectButtons(index));
    for (const b of buttons) b.click();
    expect(select.mock.calls).toEqual([["fx-workstation"], ["fx-board"], ["fx-upper"], ["fx-lower"]]);
    for (const stage of [
      { w: 304, h: 208 },
      { w: 368, h: 420 },
    ]) {
      const flat = renderFlat(doc, { room: index, avatar: "dog", select });
      const s = Math.min(stage.w / 320, stage.h / 200);
      flat.resize({ w: 320 * s, h: 200 * s });
      expect(flat.element.getAttribute("aria-hidden")).toBe("true");
      expect(flat.element.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
      const hidden = [...flat.drawing.cues].filter(([, c]) => c.area.getAttribute("visibility") === "hidden");
      expect(
        hidden.map(([id]) => id),
        `${stage.w} × ${stage.h}`,
      ).toEqual(stage.w === 304 ? ["fx-lower"] : []);
    }
  });
});

describe("the AI disclosure", () => {
  /** The value a property ends with on an element, from the top-level rules that match it, in order. */
  function declared(el: Element, property: string, all: CssRule[]): string | undefined {
    let value: string | undefined;
    for (const rule of all)
      if (matchesRule(el, rule.selector) && rule.declarations.has(property)) value = rule.declarations.get(property);
    return value;
  }

  it("stays in view on every screen: the page's header, sticky at the top, opaque, never inert or hidden", async () => {
    const all = rules();
    for (const [name, v] of await screens()) {
      const header = [...v.doc.querySelectorAll("header")].find((h) => textOf(h).includes(AI_DISCLOSURE));
      if (!header) throw new Error(`${name}: no header holds the AI disclosure`);
      expect(header.closest("[inert], [hidden], [aria-hidden='true']"), name).toBeNull();
      expect(header.parentElement, name).toBe(v.doc.body);
      expect(declared(header, "position", all), name).toBe("sticky");
      expect(declared(header, "top", all), name).toBe("0");
      expect(declared(header, "background", all), name).toMatch(/^#fff(fff)?$/i);
    }
  });

  it("leaves room above a focused control for itself, so the header never covers it (WCAG 2.4.11)", () => {
    const html = rules().find((r) => r.selector === "html");
    expect(px(html?.declarations.get("scroll-padding-top"))).toBeGreaterThanOrEqual(64);
  });
});

describe('"Pause the room" pressed (WCAG 1.4.1)', () => {
  /** The value a property ends with on an element, from the top-level rules that match it, in order. */
  function last(el: Element, property: string, all: CssRule[]): string {
    let value = "";
    for (const rule of all)
      if (matchesRule(el, rule.selector) && rule.declarations.has(property))
        value = rule.declarations.get(property) ?? "";
    return value;
  }

  it("shows the toggle pressed by more than colour: an inset border or an underline only the pressed state has", async () => {
    const all = rules();
    for (const webgl of [true, false]) {
      const v = start({ webgl });
      await intoRoom(v);
      const pause = button(v.doc, roomIndex().ui["pause.button"] ?? "Pause the room");
      const cue = (): { inset: boolean; underline: boolean } => ({
        inset: /\binset\b/.test(last(pause, "box-shadow", all)),
        underline: /\bunderline\b/.test(
          `${last(pause, "text-decoration", all)} ${last(pause, "text-decoration-line", all)}`,
        ),
      });
      expect(pause.getAttribute("aria-pressed")).toBe("false");
      const before = cue();
      pause.click();
      await flush();
      expect(pause.getAttribute("aria-pressed")).toBe("true");
      const after = cue();
      const what = webgl ? "3D" : "2D";
      expect(after.inset || after.underline, `${what}: pressed`).toBe(true);
      expect(before.inset && after.inset, `${what}: the inset border only when pressed`).toBe(false);
      expect(before.underline && after.underline, `${what}: the underline only when pressed`).toBe(false);
    }
  });
});

describe("touch and small screens", () => {
  it("gives every target at least 44 by 44 CSS pixels in the CSS, on every screen", async () => {
    const all = rules();
    for (const [name, v] of await screens()) {
      for (const el of targets(v.doc)) {
        const size = targetSize(el, all);
        expect(size.width, `${name}: ${nameOf(el)} width`).toBeGreaterThanOrEqual(44);
        expect(size.height, `${name}: ${nameOf(el)} height`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("frames the room for portrait from 320 pixels, and turns motion off under prefers-reduced-motion", () => {
    const sheets = stylesheets().map((s) => parseCss(s.text));
    const media = sheets.flatMap((s) => s.atRules).map((a) => a.prelude);
    expect(media.some((m) => /prefers-reduced-motion:\s*reduce/.test(m))).toBe(true);
    expect(media.some((m) => /orientation:\s*landscape/.test(m))).toBe(true);
    // The stage's height leaves the toolbar, the list, the text box, and the talk button on a 320 by 568 screen.
    const stage = sheets.flatMap((s) => s.rules).find((r) => r.selector === ".room-stage");
    expect(stage?.declarations.get("height")).toMatch(/dvh/);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// T169 (spec 004; FR-063, FR-065, SC-009; User Story 7 scenarios 2, 4, and 5; Amendment B8; R-40)
// --------------------------------------------------------------------------------------------------------------------

/** The index with its live source on, so pausing the room changes the tier "Around the room" shows (FR-041's row 2). */
const siteIndex = (): RoomIndex => {
  const index = roomIndex();
  return { ...index, live: { ...index.live, source: "site" } };
};

describe('"Around the room" (FR-063; User Story 7 scenarios 2 and 5)', () => {
  it.each([
    ["3D", true],
    ["2D", false],
  ] as const)(
    "is visible in %s after the conversation panel, outside the stage, open with nothing to expand, with the tier's sentence",
    async (_, webgl) => {
      const v = start({ webgl });
      await intoRoom(v);
      const room = v.doc.querySelector(".room");
      const around = v.doc.querySelector<HTMLElement>(".room-around");
      if (!room || !around) throw new Error('no room, or no "Around the room"');
      // A part of the room's grid of its own, right after the conversation panel and before the resume's.
      const parts = [...room.children];
      const at = parts.indexOf(around);
      expect(at).toBeGreaterThan(0);
      expect(parts[at - 1]?.classList.contains("talk")).toBe(true);
      expect(parts[at + 1]?.classList.contains("resume-panel")).toBe(true);
      expect(around.closest(".room-stage")).toBeNull();
      // Open to every visitor: never hidden, inert, visually hidden, or folded, and nothing in it to expand.
      expect(around.closest("[hidden], [inert], [aria-hidden='true'], .visually-hidden, details")).toBeNull();
      expect(
        around.querySelectorAll("details, summary, [aria-expanded], [aria-controls], [hidden], .visually-hidden"),
      ).toHaveLength(0);
      const heading = around.querySelector("h2");
      expect(textOf(heading)).toBe(AROUND);
      expect(around.getAttribute("aria-labelledby")).toBe(heading?.id);
      // The laptop's state sentence, as the room shows it: not-live while the live source is off.
      expect(textOf(around)).toContain(roomIndex().ui["tier.not-live"]);
    },
  );

  it.each([
    ["3D", true],
    ["2D", false],
  ] as const)("updates in place in %s, in no live region, so a change announces nothing", async (_, webgl) => {
    const index = siteIndex();
    const v = start({ webgl, room: index });
    await intoRoom(v);
    const around = v.doc.querySelector<HTMLElement>(".room-around");
    if (!around) throw new Error('no "Around the room"');
    const LIVE = "[aria-live], [role='status'], [role='log'], [role='alert'], [role='timer'], [role='marquee']";
    expect(around.closest(LIVE)).toBeNull();
    expect(around.querySelectorAll(LIVE)).toHaveLength(0);
    const label = index.ui[index.switches[0]?.label ?? ""] ?? "";
    const line = (): HTMLElement | undefined =>
      [...around.querySelectorAll<HTMLElement>("li")].find((li) => textOf(li).startsWith(`${label}:`));
    const before = line();
    const state = before?.querySelector("span");
    if (!before || !state) throw new Error("no line for the tier's switch");
    const was = textOf(state);
    button(v.doc, "Pause the room").click();
    await flush();
    // The same line and the same element, its words replaced: nothing added to or taken from the section for it.
    expect(line()).toBe(before);
    expect(before.querySelector("span")).toBe(state);
    expect(textOf(state)).toBe(index.ui["tier.paused"]);
    expect(textOf(state)).not.toBe(was);
    expect(around.closest(LIVE)).toBeNull();
  });

  it("takes its own place in room.css's grid: after the talk panel in portrait, across both columns in landscape", () => {
    const sheets = stylesheets().map((s) => parseCss(s.text));
    const top = sheets.flatMap((s) => s.rules);
    const last = (list: CssRule[], selector: string, property: string): string | undefined =>
      list
        .filter((r) => r.selector === selector && r.declarations.has(property))
        .at(-1)
        ?.declarations.get(property);
    expect(last(top, ".room-around", "grid-area")).toBe("around");
    const areas = (value: string | undefined): string[] =>
      [...(value ?? "").matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "");
    expect(areas(last(top, ".room", "grid-template-areas"))).toEqual([
      "toolbar",
      "stage",
      "list",
      "talk",
      "around",
      "resume",
    ]);
    const landscape = sheets
      .flatMap((s) => s.atRules)
      .filter((a) => /orientation:\s*landscape/.test(a.prelude))
      .flatMap((a) => parseCss(a.body).rules);
    expect(areas(last(landscape, ".room", "grid-template-areas"))).toEqual([
      "toolbar toolbar",
      "stage list",
      "stage talk",
      "around around",
      "resume resume",
    ]);
  });
});

describe("no meaning on colour alone (FR-065; WCAG 2.2's 1.4.1; R-40)", () => {
  it('gives every tier value its own sentence in "Around the room"', () => {
    const index = roomIndex();
    const sentences = TIER_VALUES.map((value) => index.ui[`tier.${value}`] ?? "");
    for (const [k, s] of sentences.entries()) expect(s.trim(), TIER_VALUES[k]).not.toBe("");
    expect(new Set(sentences).size).toBe(TIER_VALUES.length);
    const doc = new JSDOM("<main></main>").window.document;
    const copy = renderTextCopy(doc, index);
    doc.body.append(copy.element);
    const label = index.ui[index.switches[0]?.label ?? ""] ?? "";
    const shown = TIER_VALUES.map((value) => {
      copy.setTier(value);
      return [...copy.element.querySelectorAll("li")].map(textOf).find((t) => t.startsWith(`${label}:`));
    });
    expect(shown).toEqual(sentences.map((s) => `${label}: ${s}`));
  });

  it('writes each badge as a word: "Draft", "Sample", and "test"', () => {
    const ui = roomIndex().ui;
    for (const key of ["draft.badge", "sign.sample", "sign.test"]) expect(ui[key], key).toMatch(/^\p{L}+$/u);
  });

  it("tags each 2D cue with its selectable's name, and draws it dashed, a shape as well as a colour", async () => {
    const v = start({ webgl: false });
    await intoRoom(v);
    const flat = v.doc.querySelector(".flat");
    const names = [...(flat?.querySelectorAll(".flat-cue") ?? [])].map((cue) => {
      const tag = cue.nextElementSibling;
      expect(tag?.matches("text.flat-cue-name")).toBe(true);
      return textOf(tag ?? null);
    });
    expect([...names].sort()).toEqual(
      roomIndex()
        .selectables.map((s) => s.name)
        .sort(),
    );
    const cue = rules().find((r) => r.selector === ".flat-cue");
    expect(cue?.declarations.get("stroke-dasharray")).toMatch(/\d/);
  });
});

// The 320 × 568 guarantee (FR-065; User Story 7 scenario 4; R-40): jsdom lays nothing out, so this models the portrait
// page as room.css lays it out, from room.css's own values at that screen, with each control's words measured in the
// page's typeface, the vendored IBM Plex Sans: the AI disclosure, the toolbar's five controls (spec 003's "Credits"
// link, the UI word toolbar.credits, counted until T223 adds it), the stage, the "In the room" list, and the
// conversation panel as the room shows it, its log empty. The Author's run at 320 × 568 (T174) checks it in a browser.

interface CssAt {
  /** A property's value for an exact selector at this screen: its last declaration, the media rules that apply last. */
  get(selector: string, property: string): string | undefined;
}

/** Whether a media query applies at a screen: orientation and widths in rem; anything else (reduced motion) is off. */
function mediaApplies(prelude: string, screen: { w: number; h: number }): boolean {
  const query = prelude.replace(/^@media\s*/, "").trim();
  return query.split(/\s+and\s+/).every((feature) => {
    const f = feature.trim();
    let m = /^\(orientation:\s*(portrait|landscape)\)$/.exec(f);
    if (m) return m[1] === "portrait" ? screen.h >= screen.w : screen.w > screen.h;
    m = /^\((min|max)-width:\s*([\d.]+)rem\)$/.exec(f);
    if (m) return m[1] === "min" ? screen.w >= Number(m[2]) * 16 : screen.w <= Number(m[2]) * 16;
    m = /^\(width\s*(<|<=)\s*([\d.]+)rem\)$/.exec(f);
    if (m) return m[1] === "<" ? screen.w < Number(m[2]) * 16 : screen.w <= Number(m[2]) * 16;
    return false;
  });
}

let parsedSheets: ReturnType<typeof parseCss>[] | null = null;

function cssAt(screen: { w: number; h: number }): CssAt {
  const ordered: CssRule[] = [];
  parsedSheets ??= stylesheets().map((sheet) => parseCss(sheet.text));
  for (const parsed of parsedSheets) {
    ordered.push(...parsed.rules);
    for (const at of parsed.atRules) if (mediaApplies(at.prelude, screen)) ordered.push(...parseCss(at.body).rules);
  }
  return {
    get(selector, property) {
      let value: string | undefined;
      for (const rule of ordered) {
        const parts = rule.selector.split(",").map((s) => s.trim());
        if (parts.includes(selector) && rule.declarations.has(property)) value = rule.declarations.get(property);
      }
      return value;
    },
  };
}

/** A length in CSS pixels: px, rem, or em (of `em`), or 0. */
function length(value: string | undefined, em = 16): number {
  const v = (value ?? "").trim();
  if (v === "0") return 0;
  const m = /^(-?[\d.]+)(px|rem|em)$/.exec(v);
  if (!m) throw new Error(`not a length: "${v}"`);
  return Number(m[1]) * (m[2] === "px" ? 1 : m[2] === "rem" ? 16 : em);
}

/** A padding or margin shorthand's right and left, or top and bottom, summed. */
function sides(value: string | undefined, axis: "x" | "y"): number {
  const parts = (value ?? "0")
    .trim()
    .split(/\s+/)
    .map((p) => length(p));
  const [top = 0, right = top, bottom = top, left = right] = parts;
  return axis === "x" ? left + right : top + bottom;
}

/** A border shorthand's width. */
const borderWidth = (value: string | undefined): number => length(/^([\d.]+px)/.exec(value ?? "")?.[1] ?? "0");

let plex: Font | null = null;
/** A text's advance width in CSS pixels, in the page's typeface at `size` px, kerning applied. */
function textWidth(text: string, size: number): number {
  plex ??= create(readFileSync(join(WEB, "fonts", "IBMPlexSans-Regular.woff"))) as Font;
  return (plex.layout(text).advanceWidth / plex.unitsPerEm) * size;
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

/** How many lines a paragraph's words wrap to in a width. */
function textLines(text: string, size: number, width: number): number {
  const space = textWidth(" ", size);
  return flexRows(
    text
      .split(/\s+/)
      .filter((w) => w !== "")
      .map((w) => textWidth(w, size)),
    width,
    space,
  );
}

interface PortraitPage {
  readonly toolbar: readonly string[];
  readonly toolbarRows: number;
  readonly listRows: number;
  /** The stage's box on the screen, from the page's top. */
  readonly stage: { readonly top: number; readonly w: number; readonly h: number };
  /** The foot of the text box and the talk button's row. */
  readonly talkBottom: number;
}

/** The portrait page in the room at a screen, from the page's top, as room.css lays it out (see above). */
function portraitPage(doc: Document, screen: { w: number; h: number }): PortraitPage {
  const css = cssAt(screen);
  const root = 16;
  const lineHeight = Number(css.get(":root", "line-height"));
  const pad = length(css.get("body.in-room", "padding"));
  const width = screen.w - 2 * pad;
  const gap = length(css.get(".room", "gap"));
  const target = length(css.get(".room button", "min-height"));
  const row = (size: number): number => Math.max(target, size * lineHeight);
  const buttonX = sides(css.get(".room button", "padding"), "x") + 2 * borderWidth(css.get(".room button", "border"));

  // The AI disclosure, sticky at the top.
  const pSize = length(css.get("body.in-room .disclosure p", "font-size"), root);
  const disclosure = textOf(doc.getElementById("ai-disclosure"));
  const header =
    sides(css.get("body.in-room .disclosure p", "margin"), "y") +
    textLines(disclosure, pSize, width) * pSize * lineHeight +
    borderWidth(css.get(".disclosure", "border-bottom"));

  // The toolbar: its buttons and links at its type, wrapping; the fifth control, "Credits", counted until T223.
  const toolbarSize = length(css.get(".room-toolbar", "font-size") ?? "1rem", root);
  const controls = [...doc.querySelectorAll(".room-toolbar > button, .room-toolbar > a")].map((el) => ({
    text: textOf(el),
    x: el.tagName === "A" ? sides(css.get(".room-toolbar a", "padding"), "x") : buttonX,
  }));
  const credits = roomIndex().ui["toolbar.credits"] ?? "Credits";
  if (!controls.some((c) => c.text === credits))
    controls.push({ text: credits, x: sides(css.get(".room-toolbar a", "padding"), "x") });
  const toolbarGap = length(css.get(".room-toolbar", "gap"));
  const toolbarRows = flexRows(
    controls.map((c) => Math.max(target, textWidth(c.text, toolbarSize) + c.x)),
    width,
    toolbarGap,
  );
  const toolbar = toolbarRows * row(toolbarSize) + (toolbarRows - 1) * toolbarGap;

  // The stage: the screen's height less the reserve, clamped.
  const height = /^calc\(100dvh - ([\d.]+rem)\)$/.exec(css.get(".room-stage", "height") ?? "");
  if (!height) throw new Error(".room-stage's height isn't calc(100dvh - <n>rem)");
  const stageH = Math.min(
    length(css.get(".room-stage", "max-height")),
    Math.max(length(css.get(".room-stage", "min-height")), screen.h - length(height[1])),
  );
  const stageTop = pad + header + toolbar + gap;

  // The "In the room" list: each button's shown name (its ": " and topic are visually hidden), wrapping.
  const listX =
    sides(css.get(".room-list button", "padding"), "x") + 2 * borderWidth(css.get(".room button", "border"));
  const names = [...doc.querySelectorAll(".room-list ul > li > button")].map((b) => textOf(b.firstElementChild));
  const listGap = length(css.get(".room-list ul", "gap"));
  const listRows = flexRows(
    names.map((n) => Math.max(target, textWidth(n, root) + listX)),
    width,
    listGap,
  );
  const list = listRows * row(root) + (listRows - 1) * listGap;

  // The conversation as the room shows it: an empty log, then the label over the text box and the talk button.
  const labelSize = length(css.get(".talk-form label", "font-size"), root);
  const talk =
    0 + length(css.get(".talk", "gap")) + labelSize * lineHeight + length(css.get(".talk-form", "gap")) + row(root);

  return {
    toolbar: controls.map((c) => c.text),
    toolbarRows,
    listRows,
    stage: { top: stageTop, w: width, h: stageH },
    talkBottom: stageTop + stageH + gap + list + gap + talk,
  };
}

describe("320 × 568 (FR-065; User Story 7 scenario 4)", () => {
  const SCREEN = { w: 320, h: 568 } as const;

  it("keeps the text box and the talk button on screen under five toolbar controls, without scrolling", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const page = portraitPage(v.doc, SCREEN);
    expect(page.toolbar).toEqual([
      "Resume",
      "2D view",
      "Pause the room",
      "How data flows",
      roomIndex().ui["toolbar.credits"],
    ]);
    expect(page.talkBottom, `the talk button's foot, ${page.talkBottom.toFixed(1)} px`).toBeLessThanOrEqual(SCREEN.h);
    // compose/stages.ts gives the stage room.css gives this screen, so the checks run at the stage a visitor sees.
    expect({ w: page.stage.w, h: page.stage.h }).toEqual(stageFor(SCREEN));
  });

  it("frames the twin, the desk, and every selectable's members inside that stage: every framed placement", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const { stage } = portraitPage(v.doc, SCREEN);
    const { scene: part, index } = repositoryBundle();
    const camera = framing(stage.w / stage.h, framedBoxes(part));
    // As the scene frames them (Amendment B8): every framed placement, the desk among them, the twin, and every
    // selectable's members; the IDs are the data's, read from it.
    const framed = part.placements.filter((p) => p.framed).map((p) => p.id);
    const shown = [...new Set([...framed, part.figures.twin, ...index.selectables.flatMap((s) => s.members)])];
    expect(shown.length).toBeGreaterThan(index.selectables.length);
    const boxes = new Map(part.placements.map((p) => [p.id, p.frame_box] as const));
    for (const id of shown) {
      const box = boxes.get(id);
      if (!box) throw new Error(`no placement ${id}`);
      const rect = memberRect(box, camera, { w: stage.w, h: stage.h })?.rect;
      expect(rect, id).toBeDefined();
      const [x, y, w, h] = rect ?? [NaN, NaN, NaN, NaN];
      expect(x, `${id}'s left`).toBeGreaterThanOrEqual(-1e-6);
      expect(y, `${id}'s top`).toBeGreaterThanOrEqual(-1e-6);
      expect(x + w, `${id}'s right`).toBeLessThanOrEqual(stage.w + 1e-6);
      expect(y + h, `${id}'s foot`).toBeLessThanOrEqual(stage.h + 1e-6);
    }
    expect(stage.top + stage.h).toBeLessThanOrEqual(SCREEN.h);
  });

  it("drops the toolbar's type to 0.875rem below a portrait width of 25rem, and grows the stage's reserve below 35rem", () => {
    const narrow = cssAt(SCREEN);
    const between = cssAt({ w: 400, h: 800 });
    const wide = cssAt({ w: 560, h: 900 });
    expect(narrow.get(".room-toolbar", "font-size")).toBe("0.875rem");
    expect(between.get(".room-toolbar", "font-size")).toBeUndefined();
    expect(wide.get(".room-toolbar", "font-size")).toBeUndefined();
    // One toolbar row: a 44 px control and the toolbar's 0.5rem gap, 3.25rem.
    const rowRem = (length(wide.get(".room button", "min-height")) + length(wide.get(".room-toolbar", "gap"))) / 16;
    expect(rowRem).toBe(3.25);
    // Wherever the five controls wrap to two rows at 1rem, below 35rem (the review of T171, B1; FR-047).
    expect(narrow.get(".room-stage", "height")).toBe(`calc(100dvh - ${20 + rowRem}rem)`);
    expect(between.get(".room-stage", "height")).toBe(`calc(100dvh - ${20 + rowRem}rem)`);
    expect(cssAt({ w: 559, h: 900 }).get(".room-stage", "height")).toBe(`calc(100dvh - ${20 + rowRem}rem)`);
    expect(wide.get(".room-stage", "height")).toBe("calc(100dvh - 20rem)");
    // Portrait only: a landscape phone keeps the landscape layout's reserve.
    expect(cssAt({ w: 568, h: 320 }).get(".room-stage", "height")).toBe("calc(100dvh - 7rem)");
    // Both bounds in max-width, not range syntax, which Safari reads only from 16.4 (the review of T171, N1).
    const preludes = stylesheets().flatMap((sheet) => parseCss(sheet.text).atRules.map((a) => a.prelude));
    expect(preludes).toContain("@media (orientation: portrait) and (max-width: 24.99rem)");
    expect(preludes).toContain("@media (orientation: portrait) and (max-width: 34.99rem)");
    expect(preludes.some((m) => /\(\s*width\s*[<>]/.test(m))).toBe(false);
  });
});

// The review of T171, B1 (spec 002's FR-047, as Amendment B8 extends it): "Pause the room" wraps the toolbar to two
// rows at 1rem on every portrait screen below about 35rem, and below about 447 px the "In the room" list wraps too, so
// the same model holds every portrait screen from 320 px to 35rem wide whose stage isn't at its 9rem minimum: the
// common phones by name, and the sweep's portrait screens (compose/stages.ts) in that band.
describe("every portrait screen to 35rem wide (FR-047; the review of T171, B1)", () => {
  const PHONES = [
    [320, 568],
    [360, 640],
    [360, 800],
    [375, 667],
    [375, 812],
    [384, 740],
    [390, 844],
    [393, 852],
    [412, 915],
    [414, 896],
    [428, 926],
    [430, 932],
  ] as const;

  /** The band's portrait screens: the phones above and the sweep's screens from 320 to 560 wide, at least as tall as
   *  wide, whose stage isn't at the 9rem minimum, where the room gives up its stage first. */
  function band(): { w: number; h: number }[] {
    const out = new Map<string, { w: number; h: number }>();
    for (const [w, h] of PHONES) out.set(`${w}x${h}`, { w, h });
    for (const s of sweepScreens()) if (s.w <= 560 && s.h >= s.w) out.set(`${s.w}x${s.h}`, s);
    return [...out.values()].filter((s) => stageFor(s).h > 9 * 16);
  }

  it("keeps the talk button's foot on screen when the room shows, and the stage stages.ts gives", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const screens = band();
    for (const [w, h] of PHONES)
      expect(
        screens.some((s) => s.w === w && s.h === h),
        `${w} × ${h}`,
      ).toBe(true);
    expect(screens.some((s) => s.w === 560)).toBe(true);
    for (const screen of screens) {
      const page = portraitPage(v.doc, screen);
      const where = `${screen.w} × ${screen.h}`;
      expect(page.talkBottom, `${where}: the talk button's foot, ${page.talkBottom.toFixed(1)} px`).toBeLessThanOrEqual(
        screen.h,
      );
      expect({ w: page.stage.w, h: page.stage.h }, where).toEqual(stageFor(screen));
    }
  });
});
