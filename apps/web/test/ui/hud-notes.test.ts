// The review of 60b51de4, finding 2 (spec 005; FR-021: "No control SHALL collapse, cover, or hide either"): no sheet
// covers the stage's notes, the stand-in line among them. Geometry, not attributes: the notes' box comes from the
// model's real text widths at their size in the clear area's top left, and the larger conversation view's box (the
// column layout) and the dock's sheet's (the dock layout) from room.css's own formulas over compose/hud.ts's numbers.
// They never meet, at the windows the review measured and across the sweep; and the room sets the reserve the formulas
// read.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HUD_PLACEMENTS, hudBoxes, notesReserve } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { sweepScreens } from "../../src/room/compose/stages";
import { WEB, intoRoom, roomIndex, start, stubViewport } from "../helpers/room";
import { textLines, textWidth } from "./hud-model";

const CSS = readFileSync(join(WEB, "src/room/room.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const UI = roomIndex().ui;
/** Spec 016 (FR-014; contracts/twin-states.md §4; changed with T029, plan.md R-18): the line slot says the stand-in
 *  line or the twin's line, one at a time, so the notes' box is measured with the longer of the two. */
const LINE = [UI["twin.stand_in"] ?? "", roomIndex().twin?.line ?? ""].reduce((a, b) => (b.length > a.length ? b : a));
const NOTES = [UI["standin.note"] ?? "", LINE];

/** A declaration of the last rule whose selector list holds `selector`. */
function declared(selector: string, property: string): string | undefined {
  let value: string | undefined;
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      !(m[1] ?? "")
        .split(",")
        .map((s) => s.trim())
        .includes(selector)
    )
      continue;
    for (const d of (m[2] ?? "").split(";")) {
      const c = d.indexOf(":");
      if (c > 0 && d.slice(0, c).trim() === property) value = d.slice(c + 1).trim();
    }
  }
  return value;
}

/** Both notes' box, in the window's pixels, as room.css lays them out: 0.5rem in from the clear area's top left, each
 *  a paragraph of 0.75rem words at a line height of 1.5, 0.125rem and 0.5rem of padding, 0.25rem apart. */
function notesBox(clear: Box): Box {
  const rem = 16;
  const inner = clear.w - 2 * 0.5 * rem - 2 * 0.5 * rem;
  let h = 0;
  let w = 0;
  for (const [k, words] of NOTES.entries()) {
    const lines = textLines(words, 0.75 * rem, inner);
    h += lines * 0.75 * rem * 1.5 + 2 * 0.125 * rem + (k > 0 ? 0.25 * rem : 0);
    w = Math.max(w, Math.min(inner, textWidth(words, 0.75 * rem)) + 2 * 0.5 * rem);
  }
  return { x: clear.x + 0.5 * rem, y: clear.y + 0.5 * rem, w, h };
}

const meet = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The column's larger view, by room.css: right of nothing but the column, `top: var(--notes-h)` from the column's top
 *  (the clear area's), `bottom: 3.75rem` above the column's foot, and half the window wide. */
function largerBox(screen: { w: number; h: number }): Box {
  const b = hudBoxes(screen);
  const column = b.column as Box;
  const w = Math.min(screen.w / 2, screen.w - column.w);
  const top = column.y + notesReserve(b.clear);
  return { x: column.x - w, y: top, w, h: column.y + column.h - 3.75 * 16 - top };
}

/** The dock's sheet at its tallest, by room.css: above the dock, at most the clear area less the notes' reserve. */
function sheetBox(screen: { w: number; h: number }): Box {
  const b = hudBoxes(screen);
  const dock = b.dock as Box;
  const h = b.clear.h - notesReserve(b.clear);
  return { x: 0, y: dock.y - h, w: screen.w, h };
}

const REVIEWED = [
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
  { w: 844, h: 390 },
  { w: 568, h: 320 },
  { w: 320, h: 568 },
  { w: 390, h: 844 },
] as const;

describe("no sheet covers the stage's notes (T046, finding 2)", () => {
  it("reads the reserve in room.css's formulas: the larger view starts below it, the dock's sheet stops above it", () => {
    // Spec 014 (T053's second review): the panels are the compact column at its band's foot, so the sheet's top reaches
    // back up the band to the notes' reserve, the same box as before.
    expect(declared('html[data-hud="column"] .talk[data-larger="on"] .talk-sheet', "top")).toBe(
      "calc(var(--notes-h) + var(--column-h) - var(--clear-h))",
    );
    expect(declared('html[data-hud="dock"] .talk-sheet', "max-height")).toBe(
      "calc(var(--clear-h) - var(--notes-h) - var(--keyboard))",
    );
    expect(HUD_PLACEMENTS.notes.count).toBe(2);
  });

  it("keeps both notes clear of the larger view and the dock's sheet at the windows the review measured", () => {
    for (const screen of REVIEWED) {
      const b = hudBoxes(screen);
      const notes = notesBox(b.clear);
      const sheet = b.layout === "column" ? largerBox(screen) : sheetBox(screen);
      expect(
        meet(notes, sheet),
        `${screen.w} × ${screen.h}: notes ${JSON.stringify(notes)}, sheet ${JSON.stringify(sheet)}`,
      ).toBe(false);
    }
  });

  it("reserves at least the notes' height, with the index's words, at every screen of the sweep", () => {
    const short: string[] = [];
    for (const screen of sweepScreens()) {
      const { clear } = hudBoxes(screen);
      const notes = notesBox(clear);
      if (notes.y + notes.h > clear.y + notesReserve(clear) + 1e-9) short.push(`${screen.w} × ${screen.h}`);
    }
    expect(short.slice(0, 3)).toEqual([]);
  });

  it("sets the reserve on the page's root, with the layout", async () => {
    for (const screen of [
      { w: 1280, h: 720 },
      { w: 320, h: 568 },
    ]) {
      const viewport = stubViewport(screen);
      const v = start({ webgl: true, viewport: viewport.factory });
      await intoRoom(v);
      expect(v.doc.documentElement.style.getPropertyValue("--notes-h")).toBe(
        `${notesReserve(hudBoxes(screen).clear)}px`,
      );
    }
  });
});
