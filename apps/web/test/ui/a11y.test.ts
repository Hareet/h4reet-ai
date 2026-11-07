// T037 (spec 002; FR-043–FR-047; contracts/room-scene.md §5–§6; research.md R-12), in jsdom with axe-core: the room's
// Tab order (the toolbar, the "In the room" list, the conversation panel, then the resume when it's open), visible
// focus in the CSS, the canvas and the 2D drawing hidden from assistive technology with the list as their equivalent,
// 44-pixel targets in the CSS, polite live regions, and 0 axe violations on every screen. What jsdom can't show (layout,
// real focus rings, a screen reader) is the Author's run, quickstart §4.
// T105 (spec 004; FR-063; R-16, R-40): the "In the room" list is the bundle's index's: a button per selectable in
// scene order, named by its name with a visually hidden ": " and its topic's phrase, or the resume action's UI word,
// under the index's own heading. Expectations come from compose(), of the repository's data and of the fixture set,
// whose IDs are synthetic fx- ones.
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { renderObjectList } from "../../src/room/a11y";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { renderFlat } from "../../src/room/flat";
import {
  AI_DISCLOSURE,
  axeViolations,
  button,
  enter,
  flush,
  intoRoom,
  matchesRule,
  nameOf,
  parseCss,
  px,
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
  return out;
}

describe("keyboard", () => {
  it("orders the room's Tab stops: the toolbar, the list, the conversation panel, then the resume", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    expect(tabOrder(v.doc).map(nameOf)).toEqual([
      "Resume",
      "2D view",
      "Pause the room",
      "How data flows",
      ...OBJECT_BUTTONS,
      "Your message",
      "Send",
      "Hold to talk",
    ]);
    button(v.doc, "Resume").click();
    await flush();
    const order = tabOrder(v.doc).map(nameOf);
    // The toolbar's four stops ("Pause the room", spec 004's, T161), a button per selectable, and the conversation
    // panel's three come first.
    const room = 4 + OBJECT_BUTTONS.length + 3;
    expect(order.slice(0, room)).toEqual([
      "Resume",
      "2D view",
      "Pause the room",
      "How data flows",
      ...OBJECT_BUTTONS,
      "Your message",
      "Send",
      "Hold to talk",
    ]);
    expect(order.slice(room)).toContain("Close");
    expect(order.slice(room)).toContain("Download (PDF)");
  });

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
