// T037 (spec 002; FR-043–FR-047; contracts/room-scene.md §5–§6; research.md R-12), in jsdom with axe-core: the room's
// Tab order (the toolbar, the "In the room" list, the conversation panel, then the resume when it's open), visible
// focus in the CSS, the canvas and the 2D drawing hidden from assistive technology with the list as their equivalent,
// 44-pixel targets in the CSS, polite live regions, and 0 axe violations on every screen. What jsdom can't show (layout,
// real focus rings, a screen reader) is the Author's run, quickstart §4.
import { describe, expect, it } from "vitest";

import {
  axeViolations,
  button,
  enter,
  flush,
  intoRoom,
  matchesRule,
  nameOf,
  parseCss,
  px,
  start,
  stylesheets,
  tabOrder,
  talkLog,
} from "../helpers/room";
import type { CssRule, Visit } from "../helpers/room";

const OBJECT_BUTTONS = [
  "Snowboard: hobbies and general life",
  "Bicycle: travel adventures",
  "Laptop and screen: work projects",
];

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
      "How data flows",
      ...OBJECT_BUTTONS,
      "Your message",
      "Send",
      "Hold to talk",
    ]);
    button(v.doc, "Resume").click();
    const order = tabOrder(v.doc).map(nameOf);
    expect(order.slice(0, 9)).toEqual([
      "Resume",
      "2D view",
      "How data flows",
      ...OBJECT_BUTTONS,
      "Your message",
      "Send",
      "Hold to talk",
    ]);
    expect(order.slice(9)).toContain("Close");
    expect(order.slice(9)).toContain("Download (PDF)");
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
      expect(heading?.textContent?.trim()).toBe("In the room");
      expect(list?.getAttribute("aria-labelledby")).toBe(heading?.id);
      expect([...(list?.querySelectorAll("ul > li > button") ?? [])].map(nameOf)).toEqual(OBJECT_BUTTONS);
    }
  });

  it("keeps the 2D drawing's buttons out of the Tab order, beside the list", async () => {
    const v = start({ webgl: false });
    await intoRoom(v);
    const hits = [...v.doc.querySelectorAll(".flat button")];
    expect(hits).toHaveLength(3);
    for (const hit of hits) expect(hit.getAttribute("tabindex")).toBe("-1");
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
