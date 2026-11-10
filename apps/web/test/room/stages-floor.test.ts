// T007 (spec 005; FR-054, SC-002; plan.md §3.2): no check weakens. Every screen of spec 004's sweep, 320 × 568 to
// 1920 × 1200, as test/room/legacy-stages.ts froze it at e324771e, gets a stage in the room's opening panel state at
// least its stage before spec 005, in width and in height; so does each of the two reference screens and the two
// smallest. The first screen that fails is named, with both stages.
import { describe, expect, it } from "vitest";

import { REFERENCE_DESKTOP, REFERENCE_PHONE, SMALLEST, stageFor } from "../../src/room/compose/stages";
import * as legacy from "./legacy-stages";

describe("the floor: every stage at least spec 004's (FR-054)", () => {
  it("holds every screen of spec 004's sweep to its old stage, in width and in height", () => {
    const screens = legacy.sweepScreens();
    expect(screens).toHaveLength(5403);
    const failures: string[] = [];
    for (const screen of screens) {
      const before = legacy.stageFor(screen);
      const after = stageFor(screen);
      if (after.w + 1e-9 < before.w || after.h + 1e-9 < before.h)
        failures.push(`${screen.w} × ${screen.h}: ${after.w} × ${after.h} under ${before.w} × ${before.h}`);
    }
    expect(failures.slice(0, 1), `${failures.length} screens under the floor; the first`).toEqual([]);
  });

  it("holds the reference and smallest screens to theirs", () => {
    const pairs = [
      [REFERENCE_DESKTOP, legacy.REFERENCE_DESKTOP],
      [REFERENCE_PHONE, legacy.REFERENCE_PHONE],
      [SMALLEST[0], legacy.SMALLEST[0]],
      [SMALLEST[1], legacy.SMALLEST[1]],
    ] as const;
    for (const [now, then] of pairs) {
      if (!now || !then) throw new Error("a stage is missing");
      expect(now.screen).toEqual(then.screen);
      expect(now.stage.w, `${now.screen.w} × ${now.screen.h}'s width`).toBeGreaterThanOrEqual(then.stage.w);
      expect(now.stage.h, `${now.screen.w} × ${now.screen.h}'s height`).toBeGreaterThanOrEqual(then.stage.h);
    }
  });
});
