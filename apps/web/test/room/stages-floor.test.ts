// T007 (spec 005; FR-054, SC-002; plan.md §3.2): no check weakens. Every screen of spec 004's sweep, 320 × 568 to
// 1920 × 1200, as test/room/legacy-stages.ts froze it at e324771e, gets a stage in the room's opening panel state at
// least its stage before spec 005, in width and in height; so does each of the two reference screens and the two
// smallest. The first screen that fails is named, with both stages.
import { describe, expect, it } from "vitest";

import { DEFAULT_METRICS, OPENING, clearArea, wallBoxes } from "../../src/room/compose/hud";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { REFERENCE_DESKTOP, REFERENCE_PHONE, SMALLEST, stageFor } from "../../src/room/compose/stages";
import { repositoryBundle } from "../helpers/room";
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

// T009 (spec 014; FR-061; contracts/frame-area.md §5): the frame areas hold the floor. Given the composed scene's
// protector, every screen's frame area holds its clear area, which holds its stage before spec 005, so the legacy floor
// holds at every screen of spec 004's sweep, and at the reference and smallest screens.
describe("the floor at the frame areas (spec 014, T009)", () => {
  const { scene, index } = repositoryBundle();
  const protect = protectorFor(protectSceneOf(scene, index));

  it("holds every screen of spec 004's sweep to its old stage at its frame area, in width and in height; outside the split layout, to its clear area (spec 028)", () => {
    const failures: string[] = [];
    for (const screen of legacy.sweepScreens()) {
      const before = legacy.stageFor(screen);
      const clear = clearArea(screen);
      const after = stageFor(screen, protect);
      // Spec 028 (T-A05; plan.md §R-B8): the split layout frames the room into its own area, narrower than the column
      // layout's clear area, with no box of the HUD over it; the floor below holds it to spec 004's stage.
      const split = wallBoxes(screen, OPENING, DEFAULT_METRICS, { wall: protect }) !== null;
      if (!split && (after.w + 1e-9 < clear.w || after.h + 1e-9 < clear.h))
        failures.push(`${screen.w} × ${screen.h}: ${after.w} × ${after.h} under its clear area`);
      if (after.w + 1e-9 < before.w || after.h + 1e-9 < before.h)
        failures.push(`${screen.w} × ${screen.h}: ${after.w} × ${after.h} under ${before.w} × ${before.h}`);
    }
    expect(failures.slice(0, 1), `${failures.length} screens under the floor; the first`).toEqual([]);
  });

  it("holds the reference and smallest screens' frame areas to their old stages", () => {
    for (const [screen, then] of [
      [REFERENCE_DESKTOP.screen, legacy.REFERENCE_DESKTOP.stage],
      [REFERENCE_PHONE.screen, legacy.REFERENCE_PHONE.stage],
      [SMALLEST[0]?.screen, legacy.SMALLEST[0]?.stage],
      [SMALLEST[1]?.screen, legacy.SMALLEST[1]?.stage],
    ] as const) {
      if (!screen || !then) throw new Error("a stage is missing");
      const now = stageFor(screen, protect);
      expect(now.w).toBeGreaterThanOrEqual(then.w);
      expect(now.h).toBeGreaterThanOrEqual(then.h);
    }
  });
});

// T-A05 (spec 028; FR-010; plan.md §R-A7): every stage the split layout gives is at least spec 005's floor, 304 × 196,
// and its screen's stage before spec 005; no window's split layout is taken where that would fail.
describe("the floor at the split layout's stages (spec 028, T-A05)", () => {
  const { scene, index } = repositoryBundle();
  const protect = protectorFor(protectSceneOf(scene, index));

  it("holds every split stage of the sweep to spec 005's floor and to spec 004's stage", () => {
    const failures: string[] = [];
    let seen = 0;
    for (const screen of legacy.sweepScreens()) {
      if (wallBoxes(screen, OPENING, DEFAULT_METRICS, { wall: protect }) === null) continue;
      seen += 1;
      const before = legacy.stageFor(screen);
      const after = stageFor(screen, protect);
      if (after.w < 304 || after.h < 196)
        failures.push(`${screen.w} × ${screen.h}: ${after.w} × ${after.h} under 304 × 196`);
      if (after.w + 1e-9 < before.w || after.h + 1e-9 < before.h)
        failures.push(`${screen.w} × ${screen.h}: ${after.w} × ${after.h} under ${before.w} × ${before.h}`);
    }
    expect(seen).toBeGreaterThan(0);
    expect(failures.slice(0, 1), `${failures.length} split stages under the floor; the first`).toEqual([]);
  });
});
