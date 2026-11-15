// T011a (spec 026; FR-005, FR-010, FR-011; plan.md R-06, R-07; M3): `faceTwin(heading | null)`, the one input spec 026
// adds to spec 025's director (src/room/scene/chase.ts). While the twin is `home`, its pose's facing turns toward the
// given heading at 180°/s, limited to FACE_MAX_RAD from its home heading (the pet director clamps to the data's
// `turn_max_deg` before it asks), and back to the home heading on `null`; `fleeing` ignores it; reduced motion or
// quality level 1 or more puts the facing back at once; a pause holds it. The dog's pose, phase, and clip are the same
// with and without it (Q159). chase-figures.ts, unchanged, writes the twin's picture from the pose, as it writes every
// pose; no pet module writes a picture's place or turn.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Group, Object3D } from "three";
import type { AnimationClip } from "three";
import { describe, expect, it } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { FACE_MAX_RAD, FACE_RATE_RAD_S, createChase } from "../../src/room/scene/chase";
import type { ChaseInput, ChaseMotion } from "../../src/room/scene/chase";
import { createChaseFigures } from "../../src/room/scene/chase-figures";
import type { ChaseAvatars } from "../../src/room/scene/chase-figures";
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
const HOMES = { twin: { x: 0, z: -1, heading: 0.25 }, dog: { x: 0.5, z: -1, heading: 0 } };
const near: ChaseInput = { present: true, x: 0, z: -0.6 };
const gone: ChaseInput = { present: false, x: 0, z: 1.8 };

const chase = () => createChase({ floor, config: CHASE_DEFAULTS, walkMps: WALK, figures: HOMES });
const angle = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe("faceTwin at home (FR-005; R-07)", () => {
  it("turns 180° a second, a third of a second for 60°, and lands on the heading exactly", () => {
    expect(FACE_RATE_RAD_S).toBeCloseTo(Math.PI, 12);
    const c = chase();
    const aim = HOMES.twin.heading + Math.PI / 3;
    c.faceTwin(aim);
    c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBeCloseTo(HOMES.twin.heading + Math.PI * DT, 12);
    for (let i = 1; i < 19; i += 1) c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBeLessThan(aim);
    c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBe(aim);
    // It stays there, and the twin stays at its home's place and phase: it turns, it doesn't walk.
    c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBe(aim);
    expect(c.runner("twin")?.x).toBe(HOMES.twin.x);
    expect(c.runner("twin")?.z).toBe(HOMES.twin.z);
    expect(c.runner("twin")?.speed).toBe(0);
    expect(c.phase("twin")).toBe("home");
    expect(c.moving("twin")).toBe(false);
  });

  it("turns the short way round, across ±π", () => {
    const c = createChase({
      floor,
      config: CHASE_DEFAULTS,
      walkMps: WALK,
      figures: { twin: { x: 0, z: -1, heading: Math.PI - 0.1 }, dog: HOMES.dog },
    });
    c.faceTwin(-Math.PI + 0.2);
    for (let i = 0; i < 30; i += 1) c.frame(gone, DT, MOVE);
    expect(angle(c.runner("twin")?.facing ?? Number.NaN, -Math.PI + 0.2)).toBeLessThan(1e-9);
  });

  it("is limited to FACE_MAX_RAD from the home heading, on either side", () => {
    expect(FACE_MAX_RAD).toBeCloseTo(Math.PI / 2, 12);
    for (const side of [1, -1]) {
      const c = chase();
      c.faceTwin(HOMES.twin.heading + side * 2.5);
      for (let i = 0; i < 120; i += 1) c.frame(gone, DT, MOVE);
      expect(angle(c.runner("twin")?.facing ?? Number.NaN, HOMES.twin.heading + side * FACE_MAX_RAD)).toBeLessThan(
        1e-9,
      );
    }
  });

  it("turns back to the home heading on null, at the same rate, landing on it exactly", () => {
    const c = chase();
    c.faceTwin(HOMES.twin.heading + 0.5);
    for (let i = 0; i < 60; i += 1) c.frame(gone, DT, MOVE);
    c.faceTwin(null);
    c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBeCloseTo(HOMES.twin.heading + 0.5 - Math.PI * DT, 12);
    for (let i = 0; i < 60; i += 1) c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBe(HOMES.twin.heading);
    expect(c.runner("twin")?.heading).toBe(HOMES.twin.heading);
  });

  it("does nothing for a scene with no twin", () => {
    const c = createChase({ floor, config: CHASE_DEFAULTS, walkMps: WALK, figures: { twin: null, dog: HOMES.dog } });
    c.faceTwin(1);
    c.frame(gone, DT, MOVE);
    expect(c.runner("twin")).toBeNull();
    expect(c.runner("dog")?.facing).toBe(HOMES.dog.heading);
  });
});

describe("faceTwin and the room's motion (R-07; spec 025's FR-024)", () => {
  it("holds while the room is paused", () => {
    const c = chase();
    c.faceTwin(HOMES.twin.heading + 0.5);
    for (let i = 0; i < 6; i += 1) c.frame(gone, DT, MOVE);
    const at = c.runner("twin")?.facing;
    for (let i = 0; i < 30; i += 1) c.frame(gone, DT, { ...MOVE, paused: true });
    expect(c.runner("twin")?.facing).toBe(at);
    c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBeCloseTo((at ?? Number.NaN) + Math.PI * DT, 12);
  });

  it.each([
    ["reduced motion", { ...MOVE, animate: false }],
    ["quality level 1", { ...MOVE, level: 1 }],
  ])("puts the facing back at once under %s, and drops the request", (_name, motion) => {
    const c = chase();
    c.faceTwin(HOMES.twin.heading + 0.5);
    for (let i = 0; i < 10; i += 1) c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).not.toBe(HOMES.twin.heading);
    c.frame(gone, DT, motion);
    expect(c.runner("twin")?.facing).toBe(HOMES.twin.heading);
    // Motion back on: the request is gone, so the twin stays at its home heading.
    for (let i = 0; i < 10; i += 1) c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBe(HOMES.twin.heading);
  });

  it("is refused under reduced motion: the facing never leaves home", () => {
    const c = chase();
    c.faceTwin(HOMES.twin.heading + 0.5);
    for (let i = 0; i < 10; i += 1) c.frame(gone, DT, { ...MOVE, animate: false });
    expect(c.runner("twin")?.facing).toBe(HOMES.twin.heading);
  });
});

/** The twin's and the dog's runners over a seeded run: the pursuer near, then gone, then home. */
function trace(face: (c: ReturnType<typeof chase>, i: number) => void): number[][] {
  const c = chase();
  const out: number[][] = [];
  for (let i = 0; i < 60 * 14; i += 1) {
    face(c, i);
    const dino = i < 90 ? { present: true, x: Math.sin(i / 17) * 0.3, z: -0.6 + i * 0.002 } : gone;
    c.frame(dino, DT, MOVE);
    const t = c.runner("twin");
    const d = c.runner("dog");
    out.push([
      t?.x ?? 0,
      t?.z ?? 0,
      t?.facing ?? 0,
      d?.x ?? 0,
      d?.z ?? 0,
      d?.facing ?? 0,
      d?.speed ?? 0,
      c.phase("dog") === "home" ? 0 : c.phase("dog") === "fleeing" ? 1 : 2,
      c.moving("dog") ? 1 : 0,
    ]);
  }
  return out;
}

describe("faceTwin under the run (R-07; FR-011)", () => {
  it("is ignored while the twin flees or walks back: the run is the same with and without it", () => {
    const without = trace(() => undefined);
    // Asked once the run is on (frame 5), and again on its way back: neither changes anything.
    const withFace = trace((c, i) => {
      if (i === 5 || i === 200) c.faceTwin(HOMES.twin.heading + 0.7);
    });
    expect(withFace).toEqual(without);
  });

  it("is dropped when a run starts: the twin comes home to its home heading and stays there", () => {
    const c = chase();
    c.faceTwin(HOMES.twin.heading + 0.5);
    for (let i = 0; i < 10; i += 1) c.frame(gone, DT, MOVE);
    for (let i = 0; i < 30; i += 1) c.frame(near, DT, MOVE);
    expect(c.phase("twin")).toBe("fleeing");
    for (let i = 0; i < 60 * 20 && c.phase("twin") !== "home"; i += 1) c.frame(gone, DT, MOVE);
    expect(c.phase("twin")).toBe("home");
    for (let i = 0; i < 30; i += 1) c.frame(gone, DT, MOVE);
    expect(c.runner("twin")?.facing).toBe(HOMES.twin.heading);
  });
});

describe("the dog stays as spec 025 has it (Q159)", () => {
  it("its pose, phase, and clip are the same with and without faceTwin over a seeded run", () => {
    const dogOf = (rows: number[][]): number[][] => rows.map((r) => r.slice(3));
    const without = trace(() => undefined);
    const withFace = trace((c, i) => {
      if (i % 97 === 0) c.faceTwin(i % 2 === 0 ? HOMES.twin.heading - 0.4 : null);
    });
    expect(dogOf(withFace)).toEqual(dogOf(without));
  });

  it("its runner doesn't change at home while the twin turns", () => {
    const c = chase();
    c.faceTwin(HOMES.twin.heading + 0.9);
    for (let i = 0; i < 60; i += 1) c.frame(gone, DT, MOVE);
    const d = c.runner("dog");
    expect([d?.x, d?.z, d?.facing, d?.speed, c.phase("dog")]).toEqual([
      HOMES.dog.x,
      HOMES.dog.z,
      HOMES.dog.heading,
      0,
      "home",
    ]);
  });
});

// The one writer (R-07): chase-figures.ts, unchanged, places the twin's picture from the runner, as it does every pose.
describe("chase-figures.ts writes the turn (R-07)", () => {
  const TWIN_AT = { x: 0.66, z: 0.469 };
  const DOG_AT: [number, number] = [0.3, 0.45];
  const part = {
    figures: {
      twin: "fx-twin-figure",
      dog: { home: { at: DOG_AT, heading_deg: 180 }, footprint_m: 0.3 },
      chase: CHASE_DEFAULTS,
    },
    walking: { speed_mps: 1 },
  } as unknown as Pick<RoomScene, "figures" | "walking">;

  function stage(chosen: "woman" | "dinosaur") {
    const root = new Object3D();
    const placement = new Object3D();
    placement.position.set(TWIN_AT.x, 0, TWIN_AT.z);
    placement.rotation.set(0, 0.4, 0);
    const twin = new Group();
    twin.rotation.set(0, -0.1, 0);
    placement.add(twin);
    root.add(placement);
    const dog = new Group();
    dog.position.set(DOG_AT[0], 0, DOG_AT[1]);
    root.add(dog);
    root.updateMatrixWorld(true);
    const avatars: ChaseAvatars = {
      shows: () => true,
      pictureOf: (id) => (id === "twin" ? twin : id === "dog" ? dog : null),
      legsOf: (id) => (id === "twin" ? ({} as never) : null),
      clipOf: () => ({}) as AnimationClip,
      dogPlays: () => undefined,
      twinActivity: () => undefined,
      stride: () => undefined,
    };
    const walking = { on: false, pose: { x: -0.7, z: 0.58 } };
    const shell = createChaseFigures({ floor, part, avatars, walking, chosen: chosen });
    return { shell, twin, dog };
  }

  it("turns the twin's picture by the facing's change from home, for a visitor who isn't the dinosaur too", () => {
    for (const chosen of ["woman", "dinosaur"] as const) {
      const { shell, twin, dog } = stage(chosen);
      const home = shell.chase.runner("twin")?.facing ?? Number.NaN;
      const dogBefore = [dog.position.toArray(), dog.rotation.toArray()];
      const twinPlace = twin.position.toArray();
      shell.chase.faceTwin(home + 0.5);
      for (let i = 0; i < 60; i += 1) shell.frame(DT, MOVE);
      expect(twin.rotation.y, chosen).toBeCloseTo(-0.1 + 0.5, 9);
      expect(twin.position.toArray()).toEqual(twinPlace);
      expect([dog.position.toArray(), dog.rotation.toArray()]).toEqual(dogBefore);
      shell.chase.faceTwin(null);
      for (let i = 0; i < 60; i += 1) shell.frame(DT, MOVE);
      expect(twin.rotation.y, chosen).toBe(-0.1);
    }
  });

  it("no pet module writes a picture's place or turn", () => {
    const src = join(__dirname, "../../src/room/scene");
    for (const name of ["pet.ts", "pet-reach.ts"]) {
      const text = readFileSync(join(src, name), "utf8");
      expect(text, name).not.toMatch(/pictureOf\(/);
      expect(text, name).not.toMatch(/\.rotation\.(set|copy|y\s*=)/);
    }
  });
});
