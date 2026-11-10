// T016's geometry (spec 012; FR-025, FR-042; plan.md PD-10, H2 of the analyze pass), as test/ui/hud-notes.test.ts is
// for spec 005's sheets: the loader's card never covers the stage's notes, the stand-in line among them, nor the AI
// disclosure's strip. The notes' box comes from the model's real text widths at their size in the clear area's top
// left (hud-notes.test.ts's measure); the card's box from loading/loading.css's own formulas over compose/hud.ts's
// numbers: its top the clear area's top plus the notes' reserve, centred, at most 36rem wide. They never meet, at the
// windows spec 005's review measured and across the sweep, wherever the HUD fits; where it doesn't, the card is in the
// page's flow (loading-page.test.ts).
import { describe, expect, it } from "vitest";

import { fitsHud, hudBoxes, notesReserve } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { sweepScreens } from "../../src/room/compose/stages";
import { parseCss, roomIndex, stylesheets } from "../helpers/room";
import { textLines, textWidth } from "./hud-model";

const REM = 16;
const UI = roomIndex().ui;
const NOTES = [UI["standin.note"] ?? "", UI["twin.stand_in"] ?? ""];
const CSS = parseCss(stylesheets().find((s) => s.path.endsWith("src/room/loading/loading.css"))?.text ?? "");

/** A declaration of loading.css's rule for the card in the column layout. */
function cardRule(property: string): string | undefined {
  const rule = CSS.rules.find((r) =>
    r.selector
      .split(",")
      .map((s) => s.trim())
      .includes('html[data-hud="column"] .room-loader'),
  );
  return rule?.declarations.get(property);
}

/** Both notes' box, as test/ui/hud-notes.test.ts measures it: 0.5rem in from the clear area's top left, each a
 *  paragraph of 0.75rem words at a line height of 1.5, 0.125rem and 0.5rem of padding, 0.25rem apart. */
function notesBox(clear: Box): Box {
  const inner = clear.w - 2 * 0.5 * REM - 2 * 0.5 * REM;
  let h = 0;
  let w = 0;
  for (const [k, words] of NOTES.entries()) {
    const lines = textLines(words, 0.75 * REM, inner);
    h += lines * 0.75 * REM * 1.5 + 2 * 0.125 * REM + (k > 0 ? 0.25 * REM : 0);
    w = Math.max(w, Math.min(inner, textWidth(words, 0.75 * REM)) + 2 * 0.5 * REM);
  }
  return { x: clear.x + 0.5 * REM, y: clear.y + 0.5 * REM, w, h };
}

/** The card's box by loading.css: top `calc(var(--clear-y) + var(--notes-h))`, `width: min(36rem, 100% - 2rem)`
 *  centred in the window, down to the window's foot at most (its max-height, scrolling inside itself). */
function cardBox(screen: { w: number; h: number }): Box {
  const { clear } = hudBoxes(screen);
  const top = clear.y + notesReserve(clear);
  const w = Math.min(36 * REM, screen.w - 2 * REM);
  return { x: (screen.w - w) / 2, y: top, w, h: Math.max(0, screen.h - top - 0.5 * REM) };
}

const meet = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const REVIEWED = [
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
  { w: 844, h: 390 },
  { w: 568, h: 320 },
  { w: 320, h: 568 },
  { w: 390, h: 844 },
] as const;

describe("the card clear of the notes and the strip (FR-025)", () => {
  it("takes its box from loading.css's formulas", () => {
    expect(cardRule("top")).toBe("calc(var(--clear-y) + var(--notes-h))");
    expect(cardRule("width")).toBe("min(36rem, 100% - 2rem)");
    expect(cardRule("margin-inline")).toBe("auto");
  });

  it("never meets the notes, and starts below the strip, at the windows spec 005's review measured", () => {
    for (const screen of REVIEWED) {
      if (!fitsHud(screen)) continue;
      const b = hudBoxes(screen);
      const notes = notesBox(b.clear);
      const card = cardBox(screen);
      const at = `${screen.w} × ${screen.h}: notes ${JSON.stringify(notes)}, card ${JSON.stringify(card)}`;
      expect(meet(notes, card), at).toBe(false);
      expect(card.y, at).toBeGreaterThanOrEqual(b.strip.y + b.strip.h);
    }
  });

  it("never meets the notes, and starts below the strip, at every screen of the sweep the HUD fits", () => {
    const met: string[] = [];
    const under: string[] = [];
    let checked = 0;
    for (const screen of sweepScreens()) {
      if (!fitsHud(screen)) continue;
      checked += 1;
      const b = hudBoxes(screen);
      const card = cardBox(screen);
      if (meet(notesBox(b.clear), card)) met.push(`${screen.w} × ${screen.h}`);
      if (card.y < b.strip.y + b.strip.h) under.push(`${screen.w} × ${screen.h}`);
    }
    expect(checked).toBeGreaterThan(100);
    expect(met.slice(0, 3)).toEqual([]);
    expect(under.slice(0, 3)).toEqual([]);
  });

  it("starts below a strip whose words take more lines than the table's, by the measured strip", () => {
    const screen = { w: 390, h: 844 };
    const measured = { rem: REM, safe: { top: 0, right: 0, bottom: 0, left: 0 }, strip: 120 };
    const b = hudBoxes(screen, undefined, measured);
    expect(b.clear.y).toBeGreaterThanOrEqual(120);
    expect(b.clear.y + notesReserve(b.clear)).toBeGreaterThan(120);
  });
});
