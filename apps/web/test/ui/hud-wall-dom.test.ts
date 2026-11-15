// T-A03 (spec 028; FR-007, FR-008; plan.md §R-A4): the split layout's boxes in the page. layout.ts's applyHud writes the
// panel's, the column's, the list's, and the tiles' block's boxes and the two sides' scales as --wall-* on the page's
// root; split.css places the panel, the list, and (by CSS alone) the toolbar's tiles, the walking control, and the
// "Eat" tile in the column's tiles' block, so the DOM, and the Tab order, toolbar first, are unchanged; the type and the
// tiles scale through --wall-scale-left and --wall-scale-right. Outside the split layout, today's variables and bar.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { RoomIndex } from "../../src/room/compose/bundle";
import { DEFAULT_METRICS, OPENING, compactBoxes, wallBoxes } from "../../src/room/compose/hud";
import { flatProtectorFor } from "../../src/room/compose/protect";
import { enter, flush, parseCss, roomIndex, stubViewport, start, throughLoader } from "../helpers/room";

const ready = (): RoomIndex => {
  const index = roomIndex();
  return { ...index, live: { ...index.live, turn: "site" }, topics: index.topics.map((t) => ({ ...t, ready: true })) };
};
const WIDE = { w: 1920, h: 1080 } as const;
const WALL_VARS = [
  "--wall-panel-x",
  "--wall-panel-y",
  "--wall-panel-w",
  "--wall-panel-h",
  "--wall-title-h",
  "--wall-column-x",
  "--wall-column-y",
  "--wall-column-w",
  "--wall-column-h",
  "--wall-list-x",
  "--wall-list-y",
  "--wall-list-w",
  "--wall-list-h",
  "--wall-tiles-x",
  "--wall-tiles-y",
  "--wall-tiles-w",
  "--wall-tiles-h",
  "--wall-scale-left",
  "--wall-scale-right",
];

async function room(screen: { w: number; h: number } = WIDE) {
  const viewport = stubViewport(screen);
  const v = start({ room: ready(), sendTurn: () => undefined, viewport: viewport.factory });
  await enter(v, "engineer");
  await throughLoader(v);
  v.clock.advance(5000);
  [...v.doc.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Keep it for later")?.click();
  await flush();
  return { v, viewport };
}

const CSS = parseCss(
  readFileSync(fileURLToPath(new URL("../../src/room/hud/split.css", import.meta.url)), "utf8"),
).rules;
const ON = 'html[data-split="on"][data-hud="column"]';
/** The last rule naming `selector` exactly in its selector list that sets `property`. */
const decl = (selector: string, property: string): string =>
  CSS.filter(
    (r) =>
      r.selector
        .split(",")
        .map((x) => x.trim())
        .includes(selector) && r.declarations.has(property),
  )
    .at(-1)
    ?.declarations.get(property) ?? "";

/** The page's controls in document order, the Tab order's, each by its name or words, but spec 018's own parts, which
 *  show only in the split layout ("Back", the hint). */
const order = (doc: Document): string[] =>
  [...doc.querySelectorAll<HTMLElement>(".room button, .room a[href], .room input")]
    .filter((el) => !el.matches(".split-back, .split-hint"))
    .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.id);

describe("applyHud's --wall-* (FR-007, FR-008)", () => {
  it("writes the split layout's boxes and scales, the wall from the room's protector (the 2D drawing's before a 3D one)", async () => {
    const { v } = await room();
    const root = v.doc.documentElement;
    expect(root.getAttribute("data-split")).toBe("on");
    const want = wallBoxes(WIDE, OPENING, DEFAULT_METRICS, { wall: flatProtectorFor(ready()) });
    if (!want) throw new Error("no split");
    const px = (n: number): string => `${n}px`;
    const style = root.style;
    expect(WALL_VARS.map((n) => style.getPropertyValue(n))).toEqual([
      px(want.panel.x),
      px(want.panel.y),
      px(want.panel.w),
      px(want.panel.h),
      px(want.title.h),
      px(want.column.x),
      px(want.column.y),
      px(want.column.w),
      px(want.column.h),
      px(want.list.x),
      px(want.list.y),
      px(want.list.w),
      px(want.list.h),
      px(want.tiles.x),
      px(want.tiles.y),
      px(want.tiles.w),
      px(want.tiles.h),
      String(want.scaleLeft),
      String(want.scaleRight),
    ]);
    // The walking control's place is the tiles' block's (compact.walk); the old split's rest row is gone.
    expect(style.getPropertyValue("--walk-x")).toBe(px(want.walk.x));
    expect(style.getPropertyValue("--walk-y")).toBe(px(want.walk.y));
    expect(root.getAttribute("data-walk-place")).toBe("column");
    for (const old of ["--split-rest-x", "--split-rest-w", "--split-panel-x", "--split-list-x"])
      expect(style.getPropertyValue(old), old).toBe("");
  });

  it("writes today's variables and no --wall-* outside the split layout", async () => {
    const { v, viewport } = await room();
    const screen = { w: 844, h: 390 };
    viewport.set(screen);
    const root = v.doc.documentElement;
    expect(root.getAttribute("data-split")).toBe("off");
    for (const n of WALL_VARS) expect(root.style.getPropertyValue(n), n).toBe("");
    const c = compactBoxes(screen);
    expect(root.style.getPropertyValue("--bar-w")).toBe(`${c.bar.w}px`);
    expect(root.style.getPropertyValue("--walk-x")).toBe(`${c.walk.x}px`);
  });

  it("keeps the DOM, and so the Tab order, the same in and out of the split layout: the toolbar first", async () => {
    const { v, viewport } = await room();
    const inSplit = order(v.doc);
    viewport.set({ w: 844, h: 390 });
    expect(order(v.doc)).toEqual(inSplit);
    expect(v.doc.querySelector(".room-block > .room-toolbar")).not.toBeNull();
    const toolbar = v.doc.querySelector(".room-toolbar") as Element;
    const stage = v.doc.querySelector(".room-stage") as Element;
    expect(toolbar.compareDocumentPosition(stage)).toBe(4);
  });
});

describe("split.css places the parts at --wall-* (FR-007, FR-008)", () => {
  it("puts the panel at --wall-panel-*, the list at --wall-list-*", () => {
    expect(decl(`${ON} .talk`, "left")).toBe("var(--wall-panel-x)");
    expect(decl(`${ON} .talk`, "top")).toBe("var(--wall-panel-y)");
    expect(decl(`${ON} .talk`, "width")).toBe("var(--wall-panel-w)");
    expect(decl(`${ON} .talk`, "height")).toContain("var(--wall-panel-h)");
    expect(decl(`${ON} .room-list`, "left")).toBe("var(--wall-list-x)");
    expect(decl(`${ON} .room-list`, "top")).toBe("var(--wall-list-y)");
    expect(decl(`${ON} .room-list`, "width")).toBe("var(--wall-list-w)");
    expect(decl(`${ON} .room-list`, "height")).toBe("var(--wall-list-h)");
  });

  it("puts the toolbar's tiles in the column's tiles' block, three to a row, and the walking control and Eat tile at their boxes", () => {
    expect(decl(`${ON} .hud-bar`, "left")).toBe("var(--wall-tiles-x)");
    expect(decl(`${ON} .hud-bar`, "top")).toBe("var(--wall-tiles-y)");
    expect(decl(`${ON} .hud-bar`, "width")).toBe("var(--wall-tiles-w)");
    expect(decl(`${ON} .hud-bar`, "height")).toBe("var(--wall-tiles-h)");
    expect(decl(`${ON} .hud-bar`, "display")).toBe("grid");
    expect(decl(`${ON} .hud-bar`, "grid-template-columns")).toMatch(/^repeat\(3,/);
    expect(decl(`${ON} .room-walk`, "width")).toBe("calc(8rem * var(--wall-scale-right))");
    expect(decl(`${ON} .room-walk`, "height")).toBe("calc(2.75rem * var(--wall-scale-right))");
    expect(decl(`${ON} .room-eat`, "width")).toBe("calc(8rem * var(--wall-scale-right))");
    expect(decl(`${ON} .room-eat`, "height")).toBe("calc(2.75rem * var(--wall-scale-right))");
  });

  it("scales the panel's type by --wall-scale-left and the column's type and tiles by --wall-scale-right", () => {
    expect(decl(`${ON} .talk`, "font-size")).toContain("var(--wall-scale-left)");
    expect(decl(`${ON} .room-list`, "font-size")).toContain("var(--wall-scale-right)");
    expect(decl(`${ON} .hud-bar .hud-tile`, "font-size")).toContain("var(--wall-scale-right)");
    expect(decl(`${ON} .hud-bar .hud-tile`, "min-height")).toContain("var(--wall-scale-right)");
  });

  it("has no rest row: no rule for the bar state is left", () => {
    expect(CSS.some((r) => r.selector.includes('data-panel="bar"'))).toBe(false);
    expect(CSS.some((r) => /--split-rest-/.test([...r.declarations.values()].join(" ")))).toBe(false);
  });
});
