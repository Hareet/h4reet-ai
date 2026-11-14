// T007 (spec 025; FR-014, FR-023, FR-024, FR-025, SC-003; User Story 2): the director when a piece is missing or the
// motion is limited. The dinosaur's model missing, failing, or loading is FR-001's `shows` false: nothing runs. The
// dog's: no dog figure, or the dog held: the twin runs alone. A twin model without the leg bones or the hips bone, or
// the twin's capsule, is the twin held: it stays at home in its usual states and the dog runs alone. Reduced motion, a
// paused room, or quality level 1: no figure moves and nothing is said; reduced motion or level 1 beginning mid-run
// cuts the figures home; a pause mid-run keeps them where they are, and they walk back after it. The 2D room, the floor
// below ADR 0010's, and a lost context are the shell's (chase-figures.ts never makes the run there): chase-figures.test.ts.
import { describe, expect, it } from "vitest";

import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { createChase, pursuerPresent } from "../../src/room/scene/chase";
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

function chase(notes: ChaseNote[] = [], figures: Parameters<typeof createChase>[0]["figures"] = HOMES) {
  return createChase({ floor, config: CHASE_DEFAULTS, walkMps: 1, figures, note: (n) => notes.push(n) });
}
type C = ReturnType<typeof chase>;
const atHome = (c: C, id: ChaseFigureId): boolean => {
  const r = c.runner(id);
  const h = HOMES[id];
  return r === null || Math.hypot(r.x - h.x, r.z - h.z) < 1e-3;
};
const run = (c: C, n: number, input: ChaseInput, motion: ChaseMotion = MOVE): void => {
  for (let i = 0; i < n; i += 1) c.frame(input, DT, motion);
};

describe("a missing piece (FR-014, FR-023; User Story 2)", () => {
  it("the dinosaur's model missing, failing, or loading: its cut-out, so nothing runs", () => {
    const present = pursuerPresent({ chosen: "dinosaur", shows: false, walking: true });
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    run(c, 60, { present, x: near.x, z: near.z });
    expect(c.on).toBe(false);
    expect(atHome(c, "twin") && atHome(c, "dog")).toBe(true);
    expect(notes).toEqual([]);
  });

  it("no room dog (not bundled, failed, or no figures.dog): the twin runs alone", () => {
    const notes: ChaseNote[] = [];
    const c = chase(notes, { twin: HOMES.twin, dog: null });
    run(c, 30, near);
    expect(atHome(c, "twin")).toBe(false);
    expect(notes).toEqual([{ state: "started", who: "twin" }]);
  });

  it("the dog held (its files failed mid-visit): the twin runs alone", () => {
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    c.hold("dog", true);
    run(c, 30, near);
    expect(atHome(c, "dog")).toBe(true);
    expect(notes).toEqual([{ state: "started", who: "twin" }]);
  });

  it("the twin held (no leg bones, no hips bone, or its capsule): it stays home in its states, the dog runs alone", () => {
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    c.hold("twin", true);
    run(c, 30, near);
    expect(atHome(c, "twin")).toBe(true);
    expect(c.moving("twin")).toBe(false);
    expect(c.phase("twin")).toBe("home");
    expect(atHome(c, "dog")).toBe(false);
    expect(notes).toEqual([{ state: "started", who: "dog" }]);
  });

  it("both held: nothing moves and nothing is said", () => {
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    c.hold("twin", true);
    c.hold("dog", true);
    run(c, 30, near);
    run(c, 300, { present: false, x: 0, z: 1.8 });
    expect(atHome(c, "twin") && atHome(c, "dog")).toBe(true);
    expect(notes).toEqual([]);
  });

  it("a figure held mid-run is put home at once", () => {
    const c = chase();
    run(c, 30, near);
    expect(atHome(c, "twin")).toBe(false);
    c.hold("twin", true);
    run(c, 1, near);
    expect(atHome(c, "twin")).toBe(true);
    expect(c.moving("twin")).toBe(false);
  });
});

describe("limited motion (FR-024, FR-025)", () => {
  for (const [name, motion] of [
    ["reduced motion", { animate: false, paused: false, level: 0 }],
    ["a paused room", { animate: true, paused: true, level: 0 }],
    ["quality level 1", { animate: true, paused: false, level: 1 }],
    ["quality level 2", { animate: true, paused: false, level: 2 }],
  ] as const)
    it(`${name}: no figure moves, and nothing is said`, () => {
      const notes: ChaseNote[] = [];
      const c = chase(notes);
      run(c, 60, near, motion);
      expect(atHome(c, "twin") && atHome(c, "dog")).toBe(true);
      expect(c.moving("twin")).toBe(false);
      expect(notes).toEqual([]);
    });

  for (const [name, motion] of [
    ["reduced motion", { animate: false, paused: false, level: 0 }],
    ["quality level 1", { animate: true, paused: false, level: 1 }],
  ] as const)
    it(`${name} beginning mid-run: the figures are cut back home at once, and nothing more is said`, () => {
      const notes: ChaseNote[] = [];
      const c = chase(notes);
      run(c, 30, near);
      expect(atHome(c, "twin")).toBe(false);
      run(c, 1, near, motion);
      expect(atHome(c, "twin") && atHome(c, "dog")).toBe(true);
      expect(c.runner("twin")?.facing).toBe(HOMES.twin.heading);
      expect(c.phase("twin")).toBe("home");
      expect(c.moving("twin")).toBe(false);
      run(c, 60, near, motion);
      expect(notes).toEqual([{ state: "started", who: "both" }]);
    });

  it("a pause mid-run keeps the figures where they are, and they walk back after it once the run has ended", () => {
    const c = chase();
    run(c, 30, near);
    const twin = c.runner("twin");
    const at = { x: twin?.x, z: twin?.z };
    const paused = { animate: true, paused: true, level: 0 };
    run(c, 600, { present: false, x: 0, z: 1.8 }, paused);
    expect({ x: twin?.x, z: twin?.z }).toEqual(at);
    expect(c.on).toBe(true);
    run(c, 1, { present: false, x: 0, z: 1.8 });
    expect(c.on).toBe(true);
    for (let i = 0; i < 1800 && c.phase("twin") !== "home"; i += 1) c.frame({ present: false, x: 0, z: 1.8 }, DT, MOVE);
    expect(atHome(c, "twin")).toBe(true);
  });

  it("resumes the run after a pause with clause (a): a figure under safe_m moves away from that frame", () => {
    const c = chase();
    run(c, 30, near);
    const twin = c.runner("twin");
    if (!twin) throw new Error("no twin");
    const paused = { animate: true, paused: true, level: 0 };
    const close: ChaseInput = { present: true, x: twin.x + 0.1, z: twin.z };
    run(c, 10, close, paused);
    const before = Math.hypot(twin.x - close.x, twin.z - close.z);
    run(c, 1, close);
    expect(Math.hypot(twin.x - close.x, twin.z - close.z)).toBeGreaterThan(before);
  });
});

describe("no exception (SC-003)", () => {
  it("over every combination of figures, holds, motion, and pursuer", () => {
    const motions: ChaseMotion[] = [
      MOVE,
      { animate: false, paused: false, level: 0 },
      { animate: true, paused: true, level: 0 },
      { animate: true, paused: false, level: 1 },
    ];
    for (const figures of [HOMES, { twin: HOMES.twin }, { dog: HOMES.dog }, {}])
      for (const held of [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ])
        expect(() => {
          const c = chase([], figures);
          c.hold("twin", held[0] as boolean);
          c.hold("dog", held[1] as boolean);
          for (let i = 0; i < 400; i += 1) {
            const m = motions[Math.floor(i / 25) % motions.length] as ChaseMotion;
            c.frame({ present: i % 150 < 100, x: 0.2 * Math.sin(i / 20), z: -0.6 }, i % 97 === 0 ? 0 : DT, m);
          }
        }).not.toThrow();
  });
});
