// rework-028a (spec 028; FR-006, FR-010; spec 014's FR-061; rv-028a-2's A2-1): the compositor's report names the split
// layout. Its "Frame" lines counted the split layout's stages among "the column layout from 1280 × 720" and called
// them eased toward each clear area, while spec 028's FR-006 frames them in the wall area with no ease, and never said
// how many take it. Now a class of their own, chosen as the room chooses it (wallBoxes with the stage's protector),
// with its count and its prose; the column and dock classes hold the rest, so the classes still sum to every screen.
// On the room's own bundle (its shell framed, so the split is taken) and on the fixture (its shell not framed: none).
import { describe, expect, it } from "vitest";

import { frameLines } from "../../build/room/report";
import { DEFAULT_METRICS, layoutFor, wallBoxes } from "../../src/room/compose/hud";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { framedStages } from "../../src/room/compose/stages";
import { repositoryBundle } from "../helpers/room";

const { scene, index } = repositoryBundle();
const ROOM = protectSceneOf(scene, index);
const PROTECT = protectorFor(ROOM);
const n = (x: number): string => x.toLocaleString("en-US");

describe("the report's frame lines name the split layout (A2-1)", () => {
  const made = framedStages(PROTECT);
  const split = made.screens.filter((x) => wallBoxes(x.screen, x.state, DEFAULT_METRICS, { wall: PROTECT }) !== null);
  const lines = frameLines({ protect: PROTECT, framed: ROOM.framed });
  const row = (name: string): string | undefined => lines.find((l) => l.startsWith(`- ${name}: `));

  it("gives the split layout's screens a row of their own, each framed in the wall area at ease 0", () => {
    expect(split.length).toBeGreaterThan(0);
    for (const x of split) expect(x.stage.ease ?? 1).toBe(0);
    expect(row("the split layout (spec 028)")).toBe(
      `- the split layout (spec 028): ${n(split.length)} screens and states, ${n(split.length)} at ease 0, 0 ` +
        `between, 0 at ease 1; the median 0.`,
    );
  });

  it("says in its head that the split layout's stages are the wall area, with no ease", () => {
    expect(lines[0]).toContain(
      "in the split layout (spec 028, FR-006), the wall area beside the room's walls, with no ease",
    );
  });

  it("counts every other screen in a column or dock class, so the classes sum to every screen", () => {
    const counted = lines
      .filter((l) => /^- the (split|dock|column) layout/.test(l))
      .map((l) => Number((/: ([\d,]+) screens and states/.exec(l)?.[1] ?? "0").replace(/,/g, "")));
    expect(counted.reduce((a, b) => a + b, 0)).toBe(made.screens.length);
    const wide = made.screens.filter(
      (x) => layoutFor(x.screen) === "column" && x.screen.w >= 1280 && x.screen.h >= 720 && !split.includes(x),
    );
    expect(row("the column layout from 1280 × 720 (no split)")).toMatch(
      new RegExp(`^- the column layout from 1280 × 720 \\(no split\\): ${n(wide.length)} screens and states, `),
    );
  });

  it("gives no split row where the protector has no wall (the fixture's unframed shell, an older protector)", () => {
    const bare = protectorFor({ framed: ROOM.framed, selectables: ROOM.selectables, figures: ROOM.figures });
    const out = frameLines({ protect: bare, framed: ROOM.framed });
    expect(out.some((l) => l.startsWith("- the split layout"))).toBe(false);
  });
});
