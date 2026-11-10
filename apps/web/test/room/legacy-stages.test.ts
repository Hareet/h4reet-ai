// T004 (spec 005; FR-054; plan.md §3.2, PD-8): test/room/legacy-stages.ts is `compose/stages.ts`'s stages as they stood
// at e324771e, the floor every new stage is held to. While the shipped module still holds the base's formulas (its
// ROOM_CSS export, which T011 retires), the copy gives exactly its numbers at every screen of the sweep. After that, the
// digest below, taken from both at the base, keeps the copy's numbers from moving.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import * as shipped from "../../src/room/compose/stages";
import * as legacy from "./legacy-stages";

/** Every screen of the legacy sweep with its legacy stage, then the reference, smallest, and supported stages. */
function fingerprint(module: Pick<typeof legacy, "sweepScreens" | "stageFor" | "supportedStages">): string {
  const lines = module.sweepScreens().map((s) => {
    const stage = module.stageFor(s);
    return `${s.w}x${s.h}:${stage.w}x${stage.h}`;
  });
  lines.push(...module.supportedStages().map((s) => `stage:${s.w}x${s.h}`));
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

/** The fingerprint of the stages at e324771e, from the shipped module and the copy, which agreed there: its sha256's
 *  first 16 hex digits. */
const BASE_FINGERPRINT = "743debd0833705b6";

describe("the frozen stages of e324771e (spec 005, T004)", () => {
  it("keep the base's numbers: 5,403 screens, 1,787 stages, and their fingerprint", () => {
    expect(legacy.sweepScreens()).toHaveLength(5403);
    expect(legacy.supportedStages()).toHaveLength(1787);
    expect(legacy.REFERENCE_DESKTOP.stage.w).toBeCloseTo(686.4, 9);
    expect(legacy.REFERENCE_DESKTOP.stage.h).toBe(640);
    expect(legacy.REFERENCE_PHONE.stage).toEqual({ w: 368, h: 368 });
    expect(legacy.SMALLEST.map((s) => s.stage)).toEqual([
      { w: 304, h: 196 },
      { w: 304, h: 208 },
    ]);
    expect(fingerprint(legacy)).toBe(BASE_FINGERPRINT);
  });

  it.runIf("ROOM_CSS" in shipped)("give exactly the shipped module's stages while it holds the base's formulas", () => {
    const screens = legacy.sweepScreens();
    expect(shipped.sweepScreens()).toEqual(screens);
    for (const s of screens) expect(legacy.stageFor(s), `${s.w} × ${s.h}`).toEqual(shipped.stageFor(s));
    expect(fingerprint(shipped)).toBe(BASE_FINGERPRINT);
  });
});
