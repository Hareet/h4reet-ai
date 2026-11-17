// T-A01 (b) (spec 030, group A; FR-002 to FR-005; Q2 to Q4; plan.md §R-A2, §R-A3): the right column's two halves. His
// words, 2026-11-16: "Let's separate the right-side panel UI into two halves, making the separation a horizontal
// slice." Through the real room (test/helpers/room.ts), in a conversation with the "Eat" tile offered (3D), at his three
// windows (the split layout), 1280 × 720 (the column layout), and 390 × 844 (the dock), at rest and walking, and in 2D
// at rest at 1366 × 768 and 390 × 844:
// - two halves, each its own element: data-half="top" on the list (split) or the panels (column, dock), and
//   data-half="bottom" on the .hud-half panel, shown;
// - the top holding exactly "Back", the list's heading ("In the room"), the label ("Select a piece"), and the entries
//   (split), or the list and the conversation (column, dock); the bottom exactly the bar's tiles, the walking control,
//   and "Eat" where offered, by their boxes (split), or the bar's cluster alone (column, dock; Q85: the column layout's
//   walking control at the column's head in neither half);
// - both marked data-over="room", at rest and walking (Q2).
// T-A06 (b) (group A's rework; the first rework's N-2, rv-030a's R-3): the boxes are measured from what the room sets
// on the root (--wall-*, --half-bottom-*, --column-*, --dock-h, --bar-*, --hud-slice, --walk-*, --eat-*) through the
// rules room.css and hud/split.css place them by, and checked against numbers this file derives itself: the gap
// between the top's foot and the bottom's top 0.75rem at the right side's scale (0.75 × 16 × --wall-scale-right CSS px)
// in the split layout and 0.75 × 16 = 12 in the column layout and the dock (FR-003; Q4), both halves inside the
// column's box (split) or the window, sharing a width, never overlapping; never against compose/halves.ts's own output,
// whose cases are test/room/halves.test.ts's, on boxes written by hand. The walking control and "Eat" are checked by
// their boxes (8rem × 2.75rem at the scale), not their corners. The stacked layout (300 × 400) has none.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

/** The slice, as spec 030 gives it (FR-003; Q4), and the root's font size in these windows: written here, never read
 *  from compose/hud.ts's table, so the room's boxes are checked against numbers the test derives. */
const SLICE_REM = 0.75;
const REM = 16;
/** The walking control's and "Eat"'s size in the split layout (split.css: 8rem × 2.75rem at the right side's scale). */
const TILE = { w: 8, h: 2.75 } as const;

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

/** The room in a conversation, the "Eat" tile offered in 3D; walking where asked. */
async function inConversation(c: Case): Promise<Visit> {
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
  return v;
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
const sharedWidth = (a: Box, b: Box): number => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
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
      const v = await inConversation(c);
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
      const [topEl, bottomEl] = [tops[0] as Element, bottoms[0] as Element];
      expect(topEl.classList.contains(c.layout === "split" ? "room-list" : "hud-panels")).toBe(true);
      expect(bottomEl.classList.contains("hud-half")).toBe(true);
      expect(bottomEl.getAttribute("aria-hidden")).toBe("true");
      expect(shown(topEl) && shown(bottomEl)).toBe(true);
      expect(topEl.getAttribute("data-over")).toBe("room");
      expect(bottomEl.getAttribute("data-over")).toBe("room");

      // The top's contents: exactly "Back", the heading, the label, and the entries; or the list and the conversation.
      const kids = [...topEl.children].map((el) => el.className.split(" ")[0]);
      if (c.layout === "split") {
        expect(kids).toEqual(["split-back", "room-list-heading", "split-label", ""]);
        expect(topEl.children[3]?.tagName).toBe("UL");
        expect(shown(topEl.querySelector(".split-back") as Element)).toBe(true);
        expect(topEl.querySelector(".room-list-heading")?.textContent?.trim()).toBe(roomIndex().ui["list.heading"]);
        expect(topEl.querySelectorAll("li button").length).toBeGreaterThan(0);
      } else expect(kids).toEqual(["room-list", "talk"]);

      // The boxes, as the room sets them and the sheets place them; the gap and the bounds derived here.
      let top: Box;
      let bottom: Box;
      let bounds: Box;
      let gap: number;
      if (c.layout === "split") {
        const scale = Number(root.style.getPropertyValue("--wall-scale-right"));
        expect(scale).toBeGreaterThan(0);
        gap = SLICE_REM * REM * scale;
        top = boxOf(v, "wall-list");
        bottom = boxOf(v, "half-bottom");
        bounds = boxOf(v, "wall-column");
        // The bottom half is the tiles' block: the bar's tiles, the walking control, and "Eat", by their boxes.
        expect(bottom).toEqual(boxOf(v, "wall-tiles"));
        const sized = (x: number, y: number): Box => ({ x, y, w: TILE.w * REM * scale, h: TILE.h * REM * scale });
        const walk = sized(prop(v, "--walk-x"), prop(v, "--walk-y"));
        expect(decl('html[data-split="on"][data-hud="column"] .room-walk', "width")).toBe(
          "calc(8rem * var(--wall-scale-right))",
        );
        expect(decl('html[data-split="on"][data-hud="column"] .room-walk', "height")).toBe(
          "calc(2.75rem * var(--wall-scale-right))",
        );
        expect(inside(boxOf(v, "wall-bar"), bottom)).toBe(true);
        expect(inside(walk, bottom)).toBe(true);
        expect(overlaps(walk, top)).toBe(false);
        if (c.mode === "3d") {
          expect(shown(doc.querySelector(".room-eat") as Element)).toBe(true);
          expect(decl('html[data-split="on"][data-hud="column"] .room-eat', "width")).toBe(
            "calc(8rem * var(--wall-scale-right))",
          );
          expect(decl('html[data-split="on"][data-hud="column"] .room-eat', "height")).toBe(
            "calc(2.75rem * var(--wall-scale-right))",
          );
          const eat = sized(prop(v, "--eat-x"), prop(v, "--eat-y"));
          expect(inside(eat, bottom)).toBe(true);
          expect(overlaps(eat, top)).toBe(false);
          expect(overlaps(eat, walk)).toBe(false);
        }
      } else {
        gap = SLICE_REM * REM;
        expect(prop(v, "--hud-slice")).toBeCloseTo(gap, 9);
        const keyboard = prop(v, "--keyboard");
        const barH = prop(v, "--bar-h");
        const panels =
          c.layout === "column" ? 'html[data-hud="column"] .hud-panels' : 'html[data-hud="dock"] .hud-panels';
        // room.css stands the panels the bar's height, the slice, and the keyboard's inset above the window's foot.
        expect(decl(panels, "bottom")).toBe("calc(var(--bar-h) + var(--hud-slice) + var(--keyboard))");
        const foot = c.h - barH - prop(v, "--hud-slice") - keyboard;
        if (c.layout === "column") {
          expect(decl(panels, "right")).toBe("0");
          expect(decl(panels, "width")).toBe("var(--column-w)");
          expect(decl(panels, "height")).toBe("var(--column-h)");
          const w = prop(v, "--column-w");
          const h = prop(v, "--column-h");
          top = { x: c.w - w, y: foot - h, w, h };
        } else {
          expect(decl(panels, "left")).toBe("0");
          expect(decl(panels, "right")).toBe("0");
          expect(decl(panels, "height")).toBe("var(--dock-h)");
          const h = prop(v, "--dock-h");
          top = { x: 0, y: foot - h, w: c.w, h };
        }
        // The bottom half: --half-bottom-x and -w across, its foot on the keyboard's inset (room.css's rule outside
        // the split layout), --half-bottom-h tall; the bar's cluster exactly (the bar: right on the safe area's edge,
        // --bar-w wide, in the column layout; across the window in the dock; --bar-h tall on the keyboard's inset).
        const hb = boxOf(v, "half-bottom");
        bottom = { x: hb.x, y: c.h - keyboard - hb.h, w: hb.w, h: hb.h };
        expect(hb.y).toBeCloseTo(bottom.y, 9);
        const bar: Box =
          c.layout === "column"
            ? {
                x: c.w - prop(v, "--safe-right") - prop(v, "--bar-w"),
                y: c.h - keyboard - barH,
                w: prop(v, "--bar-w"),
                h: barH,
              }
            : { x: 0, y: c.h - keyboard - barH, w: c.w, h: barH };
        for (const k of ["x", "y", "w", "h"] as const) expect(bottom[k], k).toBeCloseTo(bar[k], 9);
        bounds = { x: 0, y: 0, w: c.w, h: c.h };
        // Q85: the walking control at the column layout's head stands in neither half.
        if (root.getAttribute("data-walk-place") === "column") {
          const walk: Box = { x: prop(v, "--walk-x"), y: prop(v, "--walk-y"), w: 8 * REM, h: 2.75 * REM };
          expect(overlaps(walk, top)).toBe(false);
          expect(overlaps(walk, bottom)).toBe(false);
        }
      }
      // The slice between the halves: the gap from the top's foot to the bottom's top; both inside their bounds,
      // sharing a width, never overlapping.
      expect(top.h).toBeGreaterThan(0);
      expect(bottom.h).toBeGreaterThan(0);
      expect(bottom.y - (top.y + top.h)).toBeCloseTo(gap, 9);
      expect(inside(top, bounds)).toBe(true);
      expect(inside(bottom, bounds)).toBe(true);
      expect(sharedWidth(top, bottom)).toBeGreaterThan(0);
      expect(overlaps(top, bottom)).toBe(false);
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
    // Outside the split layout the bottom half follows the bar's foot onto the keyboard's inset.
    const off = 'html[data-halves="on"][data-split="off"] .hud-half[data-over="room"]';
    expect(decl(off, "top")).toBe("auto");
    expect(decl(off, "bottom")).toBe("var(--keyboard)");
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
  });
});
