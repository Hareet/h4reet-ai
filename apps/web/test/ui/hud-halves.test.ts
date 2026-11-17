// T-A01 (b) (spec 030, group A; FR-002 to FR-005; Q2 to Q4; plan.md §R-A2, §R-A3): the right column's two halves. His
// words, 2026-11-16: "Let's separate the right-side panel UI into two halves, making the separation a horizontal
// slice." Through the real room (test/helpers/room.ts), in a conversation with the "Eat" tile offered (3D), at his three
// windows (the split layout), 1280 × 720 (the column layout), and 390 × 844 (the dock), at rest and walking, and in 2D
// at rest at 1366 × 768 and 390 × 844:
// - two halves, each its own element: data-half="top" on the list (split) or the panels (column, dock), and
//   data-half="bottom" on the .hud-half panel, shown;
// - the top holding exactly "Back", the list's heading ("In the room"), the label ("Select a piece"), and the entries
//   (split), or the list and the conversation (column, dock); the bottom exactly the bar's tiles, the walking control,
//   and "Eat" where offered, by their boxes (split), or the bar (column, dock);
// - their boxes compose/halves.ts's halves() of compactBoxes at that window, as the room sets them (--wall-list-*,
//   --half-bottom-*, --hud-slice) and as room.css and hud/split.css read them;
// - the slice between them: `wall.sliceRem` × --wall-scale-right (split) or `sliceRem` (column, dock), the halves never
//   overlapping;
// - both marked data-over="room", at rest and walking (Q2).
// The stacked layout (300 × 400) has none.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { halves } from "../../src/room/compose/halves";
import { DEFAULT_METRICS, HUD_PLACEMENTS, OPENING, compactBoxes } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import type { Protect } from "../../src/room/compose/frame";
import { flatProtectorFor } from "../../src/room/compose/protect";
import { button, enter, flush, parseCss, roomIndex, start, stubViewport, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";

type Screen = { readonly w: number; readonly h: number };
interface Case extends Screen {
  readonly layout: "split" | "column" | "dock";
  readonly mode: "3d" | "2d";
  readonly walking: boolean;
}

const WINDOWS: readonly (Screen & { layout: Case["layout"] })[] = [
  { w: 1366, h: 768, layout: "split" },
  { w: 1440, h: 900, layout: "split" },
  { w: 1920, h: 1080, layout: "split" },
  { w: 1280, h: 720, layout: "column" },
  { w: 390, h: 844, layout: "dock" },
];
const CASES: readonly Case[] = [
  ...WINDOWS.flatMap((s) => [
    { ...s, mode: "3d" as const, walking: false },
    { ...s, mode: "3d" as const, walking: true },
  ]),
  { w: 1366, h: 768, layout: "split", mode: "2d", walking: false },
  { w: 390, h: 844, layout: "dock", mode: "2d", walking: false },
];

/** The room in a conversation, the "Eat" tile offered in 3D; walking where asked. Returns the protector the room's
 *  re-fit takes (app.ts's refit: the 3D stage's, here the drawing's with the "Eat" box, or the 2D drawing's). */
async function inConversation(c: Case): Promise<{ v: Visit; protect: Protect }> {
  const index = roomIndex();
  const room = {
    ...index,
    live: { ...index.live, turn: "site" as const },
    topics: index.topics.map((t) => ({ ...t, ready: true })),
  };
  const viewport = stubViewport(c);
  const v = start({ webgl: c.mode === "3d", room, viewport: viewport.factory, sendTurn: () => undefined });
  const flat = flatProtectorFor(roomIndex());
  const protect: Protect = c.mode === "3d" ? { ...flat, key: `${flat.key}:eat`, eat: true } : flat;
  if (c.mode === "3d") v.scene.protect = protect;
  await enter(v, "engineer", "dinosaur");
  await throughLoader(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  const id = room.selectables.find((s) => s.action.kind === "talk")?.id ?? "";
  v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`)?.click();
  await flush();
  if (c.mode === "3d") {
    v.scene.created.at(-1)?.eating?.available?.(true);
    await flush();
  }
  if (c.walking) {
    v.doc.querySelector<HTMLButtonElement>("button.room-walk")?.click();
    await flush();
  }
  return { v, protect };
}

const layoutOf = (v: Visit): string =>
  v.doc.documentElement.getAttribute("data-split") === "on"
    ? "split"
    : (v.doc.documentElement.getAttribute("data-hud") ?? "none");

/** A size the room set on the root, in pixels. */
const prop = (v: Visit, name: string): number => {
  const raw = v.doc.documentElement.style.getPropertyValue(name).trim();
  const m = /^(-?[\d.]+(?:e-?\d+)?)px$/.exec(raw);
  if (!m) throw new Error(`${name} is not set in pixels: "${raw}"`);
  return Number(m[1]);
};
const boxOf = (v: Visit, name: string): Box => ({
  x: prop(v, `--${name}-x`),
  y: prop(v, `--${name}-y`),
  w: prop(v, `--${name}-w`),
  h: prop(v, `--${name}-h`),
});
const inside = (a: Box, b: Box): boolean =>
  a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6;
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
const shown = (el: Element): boolean => el.closest("[hidden]") === null;

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const RULES = [read("../../src/room/room.css"), read("../../src/room/hud/split.css")].flatMap((t) => parseCss(t).rules);
/** The last top-level rule declaring `property` whose selector list holds `selector`. */
const decl = (selector: string, property: string): string | undefined =>
  RULES.filter(
    (r) =>
      r.selector
        .split(",")
        .map((s) => s.trim())
        .includes(selector) && r.declarations.has(property),
  )
    .at(-1)
    ?.declarations.get(property);

describe("the right column's two halves, through the real room (FR-002 to FR-005)", () => {
  for (const c of CASES)
    it(`stands two halves with the slice between at ${c.w} × ${c.h} (${c.layout}) in ${c.mode}, ${c.walking ? "walking" : "at rest"}`, async () => {
      const { v, protect } = await inConversation(c);
      if (c.walking) expect(v.scene.walks.at(-1)?.call).toBe("enter");
      expect(layoutOf(v)).toBe(c.layout);
      const doc = v.doc;
      const root = doc.documentElement;
      expect(root.getAttribute("data-halves")).toBe("on");

      // Two halves, each its own element, both shown and both over the room.
      const tops = [...doc.querySelectorAll('[data-half="top"]')];
      const bottoms = [...doc.querySelectorAll('[data-half="bottom"]')];
      expect(tops.length).toBe(1);
      expect(bottoms.length).toBe(1);
      const [top, bottom] = [tops[0] as Element, bottoms[0] as Element];
      expect(top.classList.contains(c.layout === "split" ? "room-list" : "hud-panels")).toBe(true);
      expect(bottom.classList.contains("hud-half")).toBe(true);
      expect(bottom.getAttribute("aria-hidden")).toBe("true");
      expect(shown(top) && shown(bottom)).toBe(true);
      expect(top.getAttribute("data-over")).toBe("room");
      expect(bottom.getAttribute("data-over")).toBe("room");

      // The top's contents: exactly "Back", the heading, the label, and the entries; or the list and the conversation.
      const kids = [...top.children].map((el) => el.className.split(" ")[0]);
      if (c.layout === "split") {
        expect(kids).toEqual(["split-back", "room-list-heading", "split-label", ""]);
        expect(top.children[3]?.tagName).toBe("UL");
        expect(shown(top.querySelector(".split-back") as Element)).toBe(true);
        expect(top.querySelector(".room-list-heading")?.textContent?.trim()).toBe(roomIndex().ui["list.heading"]);
        expect(top.querySelectorAll("li button").length).toBeGreaterThan(0);
      } else expect(kids).toEqual(["room-list", "talk"]);

      // The boxes: halves() of the compact boxes at this window, as the room sets them.
      const want = halves({
        ...compactBoxes(c, OPENING, DEFAULT_METRICS, { eat: protect.eat, wall: protect }),
      });
      expect(want).not.toBeNull();
      if (!want) return;
      expect(boxOf(v, "half-bottom")).toEqual(want.bottom);
      const rem = DEFAULT_METRICS.rem;
      if (c.layout === "split") {
        const scale = Number(root.style.getPropertyValue("--wall-scale-right"));
        expect(boxOf(v, "wall-list")).toEqual(want.top);
        expect(boxOf(v, "wall-tiles")).toEqual(want.bottom);
        expect(want.slice.h).toBeCloseTo(HUD_PLACEMENTS.wall.sliceRem * scale * rem, 9);
        // The bottom holds the bar's tiles, the walking control, and "Eat", by their boxes; the list holds none.
        const walk = { x: prop(v, "--walk-x"), y: prop(v, "--walk-y"), w: 0, h: 0 };
        expect(inside(boxOf(v, "wall-bar"), want.bottom)).toBe(true);
        expect(inside(walk, want.bottom)).toBe(true);
        if (c.mode === "3d") {
          expect(shown(doc.querySelector(".room-eat") as Element)).toBe(true);
          expect(inside({ x: prop(v, "--eat-x"), y: prop(v, "--eat-y"), w: 0, h: 0 }, want.bottom)).toBe(true);
        }
      } else {
        expect(prop(v, "--hud-slice")).toBeCloseTo(HUD_PLACEMENTS.sliceRem * rem, 9);
        expect(want.slice.h).toBeCloseTo(HUD_PLACEMENTS.sliceRem * rem, 9);
        const height = prop(v, c.layout === "column" ? "--column-h" : "--dock-h");
        expect(height).toBeCloseTo(want.top.h, 9);
        // The top stands the bar's height, the slice, and the keyboard's inset above the window's foot.
        expect(c.h - prop(v, "--bar-h") - prop(v, "--hud-slice")).toBeCloseTo(want.top.y + want.top.h, 9);
        expect(prop(v, "--bar-h")).toBeCloseTo(want.bottom.h, 9);
        const panels =
          c.layout === "column" ? 'html[data-hud="column"] .hud-panels' : 'html[data-hud="dock"] .hud-panels';
        expect(decl(panels, "bottom")).toBe("calc(var(--bar-h) + var(--hud-slice) + var(--keyboard))");
      }
      // The slice between the halves, the halves never overlapping.
      expect(want.slice.y).toBeCloseTo(want.top.y + want.top.h, 9);
      expect(want.slice.y + want.slice.h).toBeCloseTo(want.bottom.y, 9);
      expect(want.slice.w).toBeGreaterThan(0);
      expect(overlaps(want.top, want.bottom)).toBe(false);
    });

  it("places the bottom half at --half-bottom-*, behind the controls, taking no pointer", () => {
    for (const at of ['html[data-halves="on"][data-hud="column"]', 'html[data-halves="on"][data-hud="dock"]']) {
      const sel = `${at} .hud-half[data-over="room"]`;
      expect(decl(sel, "left"), sel).toBe("var(--half-bottom-x)");
      expect(decl(sel, "top"), sel).toBe("var(--half-bottom-y)");
      expect(decl(sel, "width"), sel).toBe("var(--half-bottom-w)");
      expect(decl(sel, "height"), sel).toBe("var(--half-bottom-h)");
      expect(decl(sel, "pointer-events"), sel).toBe("none");
      expect(Number(decl(sel, "z-index"))).toBeLessThan(Number(decl('html[data-hud="column"] .hud-bar', "z-index")));
    }
  });
});

describe("no halves in the stacked layout (FR-004)", () => {
  it("marks no half at 300 × 400", async () => {
    const viewport = stubViewport({ w: 300, h: 400 });
    const v = start({ webgl: true, viewport: viewport.factory });
    await enter(v);
    await throughLoader(v);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    expect(v.doc.documentElement.getAttribute("data-hud")).toBe("stacked");
    expect(v.doc.querySelectorAll('[data-half="top"]').length).toBe(0);
    const half = v.doc.querySelector(".hud-half");
    expect(half === null || !shown(half)).toBe(true);
    expect(v.doc.documentElement.getAttribute("data-halves")).not.toBe("on");
    expect(halves({ ...compactBoxes({ w: 300, h: 400 }), layout: "stacked" })).toBeNull();
  });
});
