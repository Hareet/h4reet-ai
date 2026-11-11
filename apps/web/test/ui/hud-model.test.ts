// T008 (spec 005; FR-007, FR-022, FR-054; SC-010, SC-012; plan.md §2.1, §3.3, §3.5): the table's bands held to the
// model with real text (test/ui/hud-model.ts). At every screen of the sweep, with the index's words and IBM Plex Sans's
// widths, the strip's lines, the bar's rows (six controls, the full-screen control's longer words and "Credits"
// counted), the list's rows beside its header button, and the text box's row fit what the table gives; every landscape
// screen's bar is one row; 320 × 568 keeps the text box and the talk button on screen with a clear area of at least
// 304 × 196; and 320 × 256, and a 32-pixel root on 320 × 568, give the stacked layout.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_METRICS,
  HUD_PLACEMENTS,
  OPENING,
  alwaysOnCoverage,
  barRows,
  compactBoxes,
  fitsHud,
  hudBoxes,
  layoutFor,
  listRows,
  logRestRem,
  stripLines,
} from "../../src/room/compose/hud";
import { sweepScreens } from "../../src/room/compose/stages";
import { roomIndex } from "../helpers/room";
import { compactModel, hudModel, hudWords, joinedNote, notesWords, textLines, textWidth } from "./hud-model";

const WORDS = hudWords(roomIndex());
const COLLAPSED = { list: "collapsed" } as const;

describe("the table's bands against the model (plan.md §3.3)", () => {
  it("counts the bar's six controls, the full-screen control's longer words and Credits among them", () => {
    expect(WORDS.bar).toHaveLength(6);
    expect(WORDS.bar).toContain(roomIndex().ui["toolbar.credits"]);
    expect(WORDS.bar[3]).toBe("Leave full screen");
    expect(WORDS.names.length).toBe(roomIndex().selectables.length);
  });

  it("gives every screen of the sweep at least the strip's lines, the bar's rows, and the list's rows the model finds", () => {
    const failures: string[] = [];
    for (const screen of sweepScreens()) {
      const where = `${screen.w} × ${screen.h}`;
      const model = hudModel(screen, WORDS);
      if (model.stripLines > stripLines(screen))
        failures.push(`${where}: the strip's ${model.stripLines} lines over the table's ${stripLines(screen)}`);
      if (model.barRows > barRows(screen))
        failures.push(`${where}: the bar's ${model.barRows} rows over the table's ${barRows(screen)}`);
      if (layoutFor(screen) === "dock") {
        if (model.listRows > listRows(screen))
          failures.push(`${where}: the list's ${model.listRows} rows over the table's ${listRows(screen)}`);
        if (model.talkRows !== 1) failures.push(`${where}: the text box's row wraps to ${model.talkRows}`);
      } else if (!model.columnHolds) failures.push(`${where}: the column can't hold the text box's row`);
      if (screen.w > screen.h && model.barRows !== 1)
        failures.push(`${where}: a landscape screen's bar takes ${model.barRows} rows`);
    }
    expect(failures.slice(0, 5), `${failures.length} screens; the first`).toEqual([]);
  });

  it("keeps the text box and the talk button on a 320 × 568 screen, with a clear area of at least 304 × 196", () => {
    const screen = { w: 320, h: 568 };
    for (const state of [OPENING, COLLAPSED]) {
      const model = hudModel(screen, WORDS, state);
      expect(model.layout).toBe("dock");
      expect(model.talkRows).toBe(1);
      expect(model.talkBottom).toBeLessThanOrEqual(screen.h);
      expect(model.clear.w).toBeGreaterThanOrEqual(304);
      expect(model.clear.h).toBeGreaterThanOrEqual(196);
    }
    // The model's own rows at 320 wide: two lines of the strip, two rows of the bar, two rows of the list.
    const model = hudModel(screen, WORDS);
    expect([model.stripLines, model.barRows, model.listRows]).toEqual([2, 2, 2]);
  });

  it("gives the stacked layout at 320 × 256 and at a 32-pixel root on 320 × 568 (SC-010)", () => {
    expect(hudModel({ w: 320, h: 256 }, WORDS).layout).toBe("stacked");
    expect(fitsHud({ w: 320, h: 256 })).toBe(false);
    const big = { ...DEFAULT_METRICS, rem: 32 };
    expect(hudModel({ w: 320, h: 568 }, WORDS, OPENING, big).layout).toBe("stacked");
    // At a 32-pixel root the same words need twice the room: 640 × 1136 holds the HUD as 320 × 568 does at 16.
    expect(hudModel({ w: 640, h: 1136 }, WORDS, OPENING, big).layout).toBe("dock");
  });
});

// The review of 60b51de4, finding 3 (FR-049; WCAG 1.4.12): with text spacing's overrides (letters 0.12em apart, words
// 0.16em), the strip's words take a second line on windows the table gives one, which is why the room measures it.
describe("the strip under text spacing (T046, finding 3)", () => {
  it("takes two lines from 432 to about 535 pixels wide, over the table's one", () => {
    const size = 13;
    const spaced = (word: string): number => textWidth(word, size) + 0.12 * size * word.length;
    const words = WORDS.disclosure.split(/\s+/).map(spaced);
    for (const w of [440, 480, 520]) {
      const inner = w - 16;
      let lines = 1;
      let used = 0;
      for (const word of words) {
        const next = used === 0 ? word : used + textWidth(" ", size) + 0.16 * size + word;
        if (next <= inner) used = next;
        else {
          lines += 1;
          used = word;
        }
      }
      expect(lines, `${w} px`).toBe(2);
      expect(stripLines({ w })).toBe(1);
    }
  });
});

// T006 (spec 014; FR-019, SC-003; D7, D12; plan.md §3.1, §3.3, PD-4, PD-5, PD-7): the compact entries of the table held
// to the model with real text. The strip's words on one line, the bar's six tiles in one row, and the notes' widest
// words fit the table's bounds; the column's content, its list's rows found at its width and its log at its rest height,
// fits the column's compact box; and the always-on interface covers at most a quarter of every landscape window from
// 1280 × 720 to 3840 × 2160 in the column layout, at the compositor's metrics.
describe("the compact HUD against the model (spec 014, T006)", () => {
  const hudBoxesOf = (s: { w: number; h: number }) => hudBoxes(s).column ?? { x: 0, y: 0, w: 0, h: 0 };
  const index = roomIndex();
  const NOTES = notesWords(index);
  const landscape = sweepScreens().filter(
    (s) => s.w > s.h && s.w >= 1280 && s.h >= 720 && s.w <= 3840 && s.h <= 2160 && layoutFor(s) === "column",
  );

  it("fits the strip's words on one line, the bar's six tiles in one row, and the notes' widest words in the bounds", () => {
    const m = compactModel({ w: 1920, h: 1200 }, WORDS, NOTES, logRestRem({ w: 1920, h: 1200 }));
    const t = HUD_PLACEMENTS;
    expect(m.stripW).toBeLessThanOrEqual(t.strip.maxRem * 16);
    expect(m.barW).toBeLessThanOrEqual(t.bar.maxRem * 16);
    expect(m.notesW).toBeLessThanOrEqual(t.notes.maxRem * 16);
    // Each bound is the model's figure rounded up to a whole rem, so a word added overflows it and fails here.
    expect(t.strip.maxRem * 16 - m.stripW).toBeLessThan(16);
    expect(t.bar.maxRem * 16 - m.barW).toBeLessThan(16);
    expect(t.notes.maxRem * 16 - m.notesW).toBeLessThan(16);
    expect(NOTES).toContain(index.ui["twin.stand_in"]);
  });

  // T041 (spec 014; FR-054, FR-055; PD-18): the placeholder note saying both, wrapped at the notes' bound, takes no more
  // lines than the table reserves it at every clear width the sweep gives.
  it("wraps the placeholder note saying both into the lines the table reserves it (spec 014, T041)", () => {
    const t = HUD_PLACEMENTS.notes;
    const joined = joinedNote(index);
    const failures: string[] = [];
    for (const screen of sweepScreens().filter((x) => fitsHud(x))) {
      const clear = hudBoxes(screen).clear;
      const inner = Math.min(t.maxRem * 16, clear.w - 2 * t.insetRem * 16) - 2 * 0.5 * 16 - 2;
      const lines = textLines(joined, t.fontRem * 16, inner);
      const band = t.placeholderLines.find((b) => clear.w < b.belowRem * 16)?.n ?? 1;
      if (lines > band) failures.push(`${screen.w} × ${screen.h}: ${lines} lines over ${band}`);
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it("holds the column's content, its list's rows and its log at rest, in the column's compact box", () => {
    const failures: string[] = [];
    for (const screen of sweepScreens().filter((s) => layoutFor(s) === "column")) {
      const m = compactModel(screen, WORDS, NOTES, logRestRem(screen));
      const column = compactBoxes(screen).column;
      const band = hudModel(screen, WORDS).layout === "column" ? hudBoxesOf(screen) : null;
      // Where the band can't hold the content, the column is the band, and its log scrolls inside (FR-018).
      const room = band ? Math.min(m.columnH, band.h) : m.columnH;
      if (!column) failures.push(`${screen.w} × ${screen.h}: no column`);
      else if (room > column.h + 1e-9)
        failures.push(`${screen.w} × ${screen.h}: the content's ${m.columnH} over the column's ${column.h}`);
    }
    expect(failures.slice(0, 3), `${failures.length} screens; the first`).toEqual([]);
  });

  it("covers at most a quarter of every landscape window from 1280 × 720 to 3840 × 2160 (SC-003)", () => {
    expect(landscape.length).toBeGreaterThan(500);
    const over: string[] = [];
    let worst = { share: 0, at: "" };
    for (const screen of landscape) {
      const share = alwaysOnCoverage(screen);
      if (share > worst.share) worst = { share, at: `${screen.w} × ${screen.h}` };
      if (share > 0.25) over.push(`${screen.w} × ${screen.h}: ${share.toFixed(4)}`);
    }
    expect(over.slice(0, 3), `${over.length} windows over 25%; the worst ${worst.at}`).toEqual([]);
    expect(alwaysOnCoverage({ w: 1280, h: 720 })).toBeLessThanOrEqual(0.25);
    expect(alwaysOnCoverage({ w: 1920, h: 1200 })).toBeLessThan(0.15);
  });
});
