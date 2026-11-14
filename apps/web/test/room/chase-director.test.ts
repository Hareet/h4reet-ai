// T005 (spec 025; FR-001 to FR-003, FR-010, FR-012, SC-002; plan.md R-01): src/room/scene/chase.ts, the run's director,
// pure, on numbers: the pursuer's condition (the dinosaur, its model shown, the walking view on), the end delay and a
// return inside it, the walk home at the walking speed, `fleeing` only while the twin moves for the run, and the room's
// dog's clip by its speed.
import { describe, expect, it } from "vitest";

import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { createChase, dogRole, pursuerPresent } from "../../src/room/scene/chase";
import type { ChaseInput, ChaseMotion, ChaseNote } from "../../src/room/scene/chase";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";

const DT = 1 / 60;
const WALK = 1;
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

const near: ChaseInput = { present: true, x: 0, z: -0.6 };
const gone = (x = 0, z = 1.8): ChaseInput => ({ present: false, x, z });

function chase(notes: ChaseNote[] = [], figures: Parameters<typeof createChase>[0]["figures"] = HOMES) {
  return createChase({ floor, config: CHASE_DEFAULTS, walkMps: WALK, figures, note: (n) => notes.push(n) });
}

const atHome = (c: ReturnType<typeof chase>, id: "twin" | "dog"): boolean => {
  const r = c.runner(id);
  const h = HOMES[id];
  return r !== null && Math.hypot(r.x - h.x, r.z - h.z) < 1e-3;
};

describe("the pursuer (FR-001)", () => {
  it("is present only for the dinosaur, its model shown, in the walking view", () => {
    expect(pursuerPresent({ chosen: "dinosaur", shows: true, walking: true })).toBe(true);
    for (const chosen of ["woman", "man", "dog"] as const)
      expect(pursuerPresent({ chosen, shows: true, walking: true }), chosen).toBe(false);
    expect(pursuerPresent({ chosen: "dinosaur", shows: false, walking: true }), "the cut-out").toBe(false);
    expect(pursuerPresent({ chosen: "dinosaur", shows: true, walking: false })).toBe(false);
    expect(pursuerPresent({ chosen: null, shows: true, walking: true })).toBe(false);
  });

  it("with no pursuer, nothing moves, however near the pose", () => {
    const c = chase();
    for (let i = 0; i < 60; i += 1) c.frame({ present: false, x: 0, z: -0.8 }, DT, MOVE);
    expect(c.on).toBe(false);
    expect(atHome(c, "twin") && atHome(c, "dog")).toBe(true);
    expect(c.phase("twin")).toBe("home");
  });

  it("with the pursuer near, both run from it", () => {
    const c = chase();
    for (let i = 0; i < 10; i += 1) c.frame(near, DT, MOVE);
    expect(c.on).toBe(true);
    expect(c.phase("twin")).toBe("fleeing");
    expect(c.phase("dog")).toBe("fleeing");
    expect(atHome(c, "twin")).toBe(false);
    expect(atHome(c, "dog")).toBe(false);
  });

  it("a figure the scene doesn't have has no runner", () => {
    const c = chase([], { twin: HOMES.twin, dog: null });
    expect(c.runner("dog")).toBeNull();
    for (let i = 0; i < 10; i += 1) c.frame(near, DT, MOVE);
    expect(c.phase("dog")).toBe("home");
  });
});

describe("the end delay (FR-002, FR-003) and the walk home (SC-002)", () => {
  it("ends flee_end_delay_s after the pursuer goes, then walks home at the walking speed", () => {
    const c = chase();
    for (let i = 0; i < 30; i += 1) c.frame(near, DT, MOVE);
    const frames = Math.round(CHASE_DEFAULTS.flee_end_delay_s / DT);
    for (let i = 0; i < frames - 2; i += 1) c.frame(gone(), DT, MOVE);
    expect(c.on).toBe(true);
    for (let i = 0; i < 4; i += 1) c.frame(gone(), DT, MOVE);
    expect(c.on).toBe(false);
    expect(c.phase("twin")).toBe("returning");
    c.frame(gone(), DT, MOVE);
    const twin = c.runner("twin");
    expect(twin?.speed).toBeLessThanOrEqual(WALK + 1e-9);
    expect(twin?.speed).toBeGreaterThan(0);
  });

  it("is home within 20 s, facing as its home turns it (SC-002)", () => {
    const c = chase();
    for (let i = 0; i < 120; i += 1) c.frame({ present: true, x: 0, z: -0.6 + i * 0.005 }, DT, MOVE);
    let t = 0;
    while ((c.phase("twin") !== "home" || c.phase("dog") !== "home") && t < 20) {
      c.frame(gone(), DT, MOVE);
      t += DT;
    }
    expect(t).toBeLessThan(20);
    expect(atHome(c, "twin") && atHome(c, "dog")).toBe(true);
    expect(c.runner("twin")?.facing).toBe(HOMES.twin.heading);
    expect(c.runner("dog")?.facing).toBe(HOMES.dog.heading);
  });

  it("continues the run, without a restart, where the pursuer comes back inside the delay", () => {
    const notes: ChaseNote[] = [];
    const c = chase(notes);
    for (let i = 0; i < 30; i += 1) c.frame(near, DT, MOVE);
    for (let i = 0; i < 30; i += 1) c.frame(gone(), DT, MOVE);
    expect(c.on).toBe(true);
    for (let i = 0; i < 30; i += 1) c.frame(near, DT, MOVE);
    expect(c.on).toBe(true);
    expect(notes.filter((n) => n.state === "started")).toHaveLength(1);
    expect(notes.filter((n) => n.state === "ended")).toHaveLength(0);
  });
});

describe("fleeing only while the twin moves for the run (FR-012)", () => {
  it("is off at home, on while it runs and walks back, off once home", () => {
    const c = chase();
    c.frame(gone(), DT, MOVE);
    expect(c.moving("twin")).toBe(false);
    c.frame(near, DT, MOVE);
    expect(c.moving("twin")).toBe(true);
    for (let i = 0; i < 30; i += 1) c.frame(near, DT, MOVE);
    for (let i = 0; i < 1200 && c.on; i += 1) c.frame(gone(), DT, MOVE);
    c.frame(gone(), DT, MOVE);
    expect(c.phase("twin")).toBe("returning");
    expect(c.moving("twin")).toBe(true);
    for (let i = 0; i < 1200 && c.phase("twin") !== "home"; i += 1) c.frame(gone(), DT, MOVE);
    expect(c.moving("twin")).toBe(false);
  });

  it("is off while the run is on but the twin stands at home beyond flee_m", () => {
    const c = chase();
    for (let i = 0; i < 10; i += 1) c.frame({ present: true, x: 0, z: 1.5 }, DT, MOVE);
    expect(c.on).toBe(true);
    expect(c.moving("twin")).toBe(false);
    expect(atHome(c, "twin")).toBe(true);
  });
});

describe("the room's dog's clip by its speed (FR-010)", () => {
  const T = CHASE_DEFAULTS.clip_thresholds;
  const both = { walk: true, run: true };

  it("plays idle, walk, and run by the thresholds", () => {
    expect(dogRole(0, T, both)).toBe("idle");
    expect(dogRole(T.walk_mps - 0.01, T, both)).toBe("idle");
    expect(dogRole(T.walk_mps + 0.01, T, both)).toBe("walk");
    expect(dogRole(T.run_mps, T, both)).toBe("walk");
    expect(dogRole(T.run_mps + 0.01, T, both)).toBe("run");
  });

  it("plays walk for a missing run, run for a missing walk, and idle with neither", () => {
    expect(dogRole(2.5, T, { walk: true, run: false })).toBe("walk");
    expect(dogRole(0.5, T, { walk: false, run: true })).toBe("run");
    expect(dogRole(2.5, T, { walk: false, run: false })).toBe("idle");
  });

  it("holds the dog at home with neither clip: it doesn't run, the twin runs alone", () => {
    const c = chase();
    c.hold("dog", true);
    for (let i = 0; i < 30; i += 1) c.frame(near, DT, MOVE);
    expect(atHome(c, "dog")).toBe(true);
    expect(c.phase("dog")).toBe("home");
    expect(atHome(c, "twin")).toBe(false);
  });
});
