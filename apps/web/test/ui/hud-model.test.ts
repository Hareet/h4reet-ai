// T008 (spec 005; FR-007, FR-022, FR-054; SC-010, SC-012; plan.md §2.1, §3.3, §3.5): the table's bands held to the
// model with real text (test/ui/hud-model.ts). At every screen of the sweep, with the index's words and IBM Plex Sans's
// widths, the strip's lines, the bar's rows (six controls, the full-screen control's longer words and "Credits"
// counted), the list's rows beside its header button, and the text box's row fit what the table gives; every landscape
// screen's bar is one row; 320 × 568 keeps the text box and the talk button on screen with a clear area of at least
// 304 × 196; and 320 × 256, and a 32-pixel root on 320 × 568, give the stacked layout.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_METRICS,
  OPENING,
  barRows,
  fitsHud,
  layoutFor,
  listRows,
  stripLines,
} from "../../src/room/compose/hud";
import { sweepScreens } from "../../src/room/compose/stages";
import { roomIndex } from "../helpers/room";
import { hudModel, hudWords } from "./hud-model";

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
