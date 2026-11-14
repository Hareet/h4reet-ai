// rv-impl-025's N-5 (spec 025; FR-025): the run's end line names the figures that moved in it, not those named at its
// start. A figure that joins mid-run (held at the start, then free: its model shown, its clips in) is named at the end;
// one that never moved isn't; and each run names its own.
import { describe, expect, it } from "vitest";

import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { createChase } from "../../src/room/scene/chase";
import type { ChaseFigureId, ChaseInput, ChaseMotion, ChaseNote } from "../../src/room/scene/chase";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";

const DT = 1 / 60;
const OPEN: FloorRect = { x0: -2, x1: 2, z0: -2, z1: 2 };
const floor: WalkableFloor = {
  radius: 0.12,
  feetY: 0,
  height: 1.7,
  shell: OPEN,
  bounds: OPEN,
  obstacles: [],
  start: { x: 0, z: 1.8 },
};
const MOVE: ChaseMotion = { animate: true, paused: false, level: 0 };
const HOMES = { twin: { x: 0, z: -1, heading: 0 }, dog: { x: 0.5, z: -1, heading: 0 } };
const near: ChaseInput = { present: true, x: 0.2, z: -0.6 };
const gone: ChaseInput = { present: false, x: 0.2, z: -0.6 };

function chase(notes: ChaseNote[]) {
  return createChase({ floor, config: CHASE_DEFAULTS, walkMps: 1, figures: HOMES, note: (n) => notes.push(n) });
}
type C = ReturnType<typeof chase>;
const run = (c: C, n: number, input: ChaseInput): void => {
  for (let i = 0; i < n; i += 1) c.frame(input, DT, MOVE);
};
/** The dinosaur leaves; the delay and the walk home pass. */
const end = (c: C): void => run(c, 60 * 8, gone);

describe("the run's end line names the figures that moved (N-5; FR-025)", () => {
  it.each([
    ["the dog joins a run the twin started alone", "dog", "twin"],
    ["the twin joins a run the dog started alone", "twin", "dog"],
  ] as const)("names both where %s", (_, late: ChaseFigureId, first) => {
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    c.hold(late, true);
    run(c, 30, near);
    expect(c.moving(late)).toBe(false);
    c.hold(late, false);
    run(c, 30, near);
    expect(c.moving(late)).toBe(true);
    end(c);
    expect(notes).toEqual([
      { state: "started", who: first },
      { state: "ended", who: "both" },
    ]);
  });

  it("names only the figure that moved where the other stays held through the run", () => {
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    c.hold("dog", true);
    run(c, 60, near);
    end(c);
    expect(notes).toEqual([
      { state: "started", who: "twin" },
      { state: "ended", who: "twin" },
    ]);
  });

  it("names each run's own: both in the first, the twin alone in the next", () => {
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    run(c, 30, near);
    end(c);
    c.hold("dog", true);
    run(c, 30, near);
    end(c);
    expect(notes).toEqual([
      { state: "started", who: "both" },
      { state: "ended", who: "both" },
      { state: "started", who: "twin" },
      { state: "ended", who: "twin" },
    ]);
  });
});
