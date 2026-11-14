// T007 (spec 026; FR-001 to FR-006, FR-010 to FR-012, SC-001; plan.md R-01, R-02, R-07, R-08): the pet director,
// src/room/scene/pet.ts, pure, on fakes: the twin's and the dog's figures as the adapters give them (A016, A020, A025),
// a fake of spec 025's director (its phases, the twin's heading, `faceTwin`), and the room's fake clock. The dog stays at
// its home (Q159): the director has no way to move it, and the fake chase takes `faceTwin` and nothing else.
import { describe, expect, it } from "vitest";

import { createPet, inReach, PET_DEFAULTS, petAim } from "../../src/room/scene/pet";
import type { Pet, PetChase, PetDog, PetHome, PetMotion, PetTwin } from "../../src/room/scene/pet";
import type { Vec3 } from "../../src/room/scene/pet-reach";
import { FakeClock } from "../helpers/room";

const DEG = Math.PI / 180;
/** The twin's home (plan §3): (0.660, 0.469), facing glTF's +z, which is spec 008's heading π. */
const TWIN_HOME: PetHome = { x: 0.66, z: 0.469, heading: Math.PI };
/** The dog's home, Q158's estimate, its picture at `heading_deg` 0. */
const DOG_HOME: PetHome = { x: 0.3, z: 0.45, heading: 0 };
const FRAME_S = 1 / 60;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

interface World {
  readonly clock: FakeClock;
  readonly pet: Pet;
  motion: PetMotion;
  twin: PetTwin | null;
  dog: PetDog | null;
  /** The fake director's state: the twin's heading, the heading asked, whether a run is on, and every call it took. */
  heading: number;
  asked: number | null;
  running: boolean;
  readonly calls: Array<number | null>;
  readonly activity: Array<{ kind: "pet"; on: boolean }>;
  /** Moves the clock and both directors by `s` seconds, frame by frame. */
  run(s: number): void;
}

function world(
  over: { twin?: Partial<PetTwin>; dog?: Partial<PetHome>; config?: Partial<typeof PET_DEFAULTS> } = {},
): World {
  const clock = new FakeClock();
  const dogHome: PetHome = { ...DOG_HOME, ...over.dog };
  const w = {
    clock,
    motion: { animate: true, paused: false, level: 0, live: true } as PetMotion,
    twin: {
      home: TWIN_HOME,
      shows: "model",
      rig: true,
      petting_s: null,
      arriving: false,
      phase: "home",
      ...over.twin,
    } as PetTwin | null,
    dog: {
      home: dogHome,
      phase: "home",
      headPoint(out: Vec3): Vec3 {
        out.x = dogHome.x;
        out.y = 0.558;
        out.z = dogHome.z + 0.217;
        return out;
      },
    } as PetDog | null,
    heading: TWIN_HOME.heading,
    asked: null as number | null,
    running: false,
    calls: [] as Array<number | null>,
    activity: [] as Array<{ kind: "pet"; on: boolean }>,
  } as World;
  // Spec 025's director, faked (R-07): `faceTwin` turns the twin's `home` pose toward the heading at 180°/s, and null
  // turns it back; `fleeing` ignores it. It names no floor, no `visit`, no dog.
  const chase: PetChase = {
    faceTwin(h) {
      w.calls.push(h);
      w.asked = h;
    },
    twinHeading: () => w.heading,
    running: () => w.running,
  };
  const pet = createPet({
    config: over.config,
    clock,
    motion: () => w.motion,
    twin: () => w.twin,
    dog: () => w.dog,
    chase,
    signal: (a) => w.activity.push(a),
  });
  Object.assign(w, {
    pet,
    run(s: number) {
      const n = Math.round(s / FRAME_S);
      for (let i = 0; i < n; i += 1) {
        clock.advance(FRAME_S * 1000, FRAME_S * 1000);
        pet.frame(FRAME_S);
        if (!w.running && !w.motion.paused) {
          const want = w.asked ?? TWIN_HOME.heading;
          const d = wrap(want - w.heading);
          const step = Math.PI * FRAME_S;
          w.heading = Math.abs(d) <= step ? want : w.heading + Math.sign(d) * step;
        }
      }
    },
  });
  return w;
}

describe("inReach and petAim, from the two homes (R-08; FR-003, FR-004)", () => {
  it("is in reach within reach_m, the boundary included", () => {
    expect(inReach(TWIN_HOME, DOG_HOME, 0.55)).toBe(true);
    expect(inReach(TWIN_HOME, { x: 0.36, z: 0.55 }, 0.55)).toBe(true);
    const d = Math.hypot(DOG_HOME.x - TWIN_HOME.x, DOG_HOME.z - TWIN_HOME.z);
    expect(inReach(TWIN_HOME, DOG_HOME, d)).toBe(true);
    expect(inReach(TWIN_HOME, DOG_HOME, d - 1e-6)).toBe(false);
  });

  it("aims at the dog's home, clamped to turn_max_deg from the twin's home heading, on the right", () => {
    const { heading, side } = petAim(TWIN_HOME, DOG_HOME, { turn_max_deg: 60 });
    // The dog is 93° to the twin's right (−x of a figure facing +z): clamped to 60°.
    expect(wrap(heading - TWIN_HOME.heading)).toBeCloseTo(-60 * DEG, 9);
    expect(side).toBe("right");
  });

  it("aims exactly where the turn allows, and takes the left for a dog on the twin's left", () => {
    const ahead = { x: 0.66 + 0.2, z: 0.469 + 0.3 };
    const { heading, side } = petAim(TWIN_HOME, ahead, { turn_max_deg: 60 });
    expect(wrap(heading - Math.atan2(-0.2, -0.3))).toBeCloseTo(0, 9);
    expect(side).toBe("left");
  });

  it("is deterministic", () => {
    expect(petAim(TWIN_HOME, DOG_HOME, { turn_max_deg: 60 })).toEqual(
      petAim(TWIN_HOME, DOG_HOME, { turn_max_deg: 60 }),
    );
  });
});

describe("the pet director (R-01, R-07; FR-001, FR-002, FR-005, FR-006, FR-010)", () => {
  it("starts on a `dog` selection, turns the twin by faceTwin, pets, turns back, and leaves the dog alone", () => {
    const w = world();
    const dogBefore = JSON.stringify(w.dog);
    expect(w.pet.select("dog")).toBe(true);
    expect(w.pet.phase).toBe("turn");
    const aim = petAim(TWIN_HOME, DOG_HOME, PET_DEFAULTS).heading;
    expect(w.calls).toEqual([aim]);
    // Not petting until the fake reports the heading reached.
    w.run(0.1);
    expect(w.pet.phase).toBe("turn");
    expect(w.activity).toEqual([]);
    w.run(0.3);
    expect(w.pet.phase).toBe("petting");
    expect(w.activity).toEqual([{ kind: "pet", on: true }]);
    w.run(PET_DEFAULTS.pet_s);
    expect(w.activity).toEqual([
      { kind: "pet", on: true },
      { kind: "pet", on: false },
    ]);
    expect(w.calls).toEqual([aim, null]);
    w.run(1);
    expect(w.pet.phase).toBe("idle");
    expect(w.heading).toBe(TWIN_HOME.heading);
    // The dog's view never changed, and no other call reached the director.
    expect(JSON.stringify(w.dog)).toBe(dogBefore);
  });

  it("starts nothing on another piece's selection", () => {
    const w = world();
    for (const id of ["dog-sign", "snowboard", "laptop", "twin", "visitor"]) expect(w.pet.select(id)).toBe(false);
    expect(w.pet.phase).toBe("idle");
    expect(w.calls).toEqual([]);
  });

  it("starts only at quality level 0, with both figures at home and the twin not arriving (FR-001)", () => {
    const cases: Array<(w: World) => void> = [
      (w) => (w.motion = { ...w.motion, level: 1 }),
      (w) => (w.twin = { ...(w.twin as PetTwin), arriving: true }),
      (w) => (w.twin = { ...(w.twin as PetTwin), phase: "returning" }),
      (w) => (w.dog = { ...(w.dog as PetDog), phase: "fleeing" }),
      (w) => (w.running = true),
    ];
    for (const change of cases) {
      const w = world();
      change(w);
      expect(w.pet.select("dog")).toBe(false);
      w.run(1);
      expect(w.pet.phase).toBe("idle");
      expect(w.calls).toEqual([]);
      expect(w.activity).toEqual([]);
    }
  });

  it("starts nothing, and moves nothing, for a dog's home beyond reach_m (FR-004)", () => {
    const w = world({ dog: { x: -0.2, z: 0.45 } });
    expect(w.pet.select("dog")).toBe(false);
    w.run(1);
    expect(w.calls).toEqual([]);
    expect(w.heading).toBe(TWIN_HOME.heading);
  });

  it("pets once at a time, and once per cooldown_s from the last one's end (FR-002)", () => {
    const w = world();
    expect(w.pet.select("dog")).toBe(true);
    expect(w.pet.select("dog")).toBe(false);
    w.run(0.4 + PET_DEFAULTS.pet_s + 1);
    expect(w.pet.phase).toBe("idle");
    expect(w.pet.select("dog")).toBe(false);
    w.run(PET_DEFAULTS.cooldown_s - 1.5);
    expect(w.pet.select("dog")).toBe(false);
    w.run(0.6);
    expect(w.pet.select("dog")).toBe(true);
  });

  it("takes the clip's path where the twin has a petting clip: its length, and its `finished` ends it early (FR-006)", () => {
    const w = world({ twin: { petting_s: 2.2 } });
    w.pet.select("dog");
    w.run(0.4);
    expect(w.pet.phase).toBe("petting");
    expect(w.pet.path).toBe("clip");
    expect(w.pet.reach).toBeNull();
    w.run(2.0);
    expect(w.pet.phase).toBe("petting");
    w.run(0.3);
    expect(w.pet.phase).not.toBe("petting");

    const early = world({ twin: { petting_s: 2.2 } });
    early.pet.select("dog");
    early.run(0.4);
    early.run(1);
    early.pet.finished();
    expect(early.pet.phase).toBe("return");
    expect(early.activity.at(-1)).toEqual({ kind: "pet", on: false });
  });

  it("takes the reach's path without one: the side, the weight 0 → 1 → 0, the target on the dog's head (FR-007)", () => {
    const w = world();
    w.pet.select("dog");
    w.run(0.4);
    expect(w.pet.path).toBe("reach");
    const reach = w.pet.reach;
    expect(reach).not.toBeNull();
    expect(reach?.side).toBe("right");
    expect(reach?.weight).toBeLessThan(0.2);
    w.run(1.2);
    expect(w.pet.reach?.weight).toBe(1);
    // R-03's target: the head point lowered 0.03 m, 0.05 m toward the twin, then stroked along the dog's heading.
    const t = w.pet.reach?.target as Vec3;
    expect(t.y).toBeCloseTo(0.558 - 0.03, 9);
    const head = { x: 0.3, z: 0.45 + 0.217 };
    const toward = Math.hypot(TWIN_HOME.x - head.x, TWIN_HOME.z - head.z);
    const base = {
      x: head.x + (0.05 * (TWIN_HOME.x - head.x)) / toward,
      z: head.z + (0.05 * (TWIN_HOME.z - head.z)) / toward,
    };
    // The stroke moves it along the dog's heading (−sin h, −cos h) only, by at most stroke_m.
    const along = -Math.sin(DOG_HOME.heading) * (t.x - base.x) - Math.cos(DOG_HOME.heading) * (t.z - base.z);
    const across = Math.cos(DOG_HOME.heading) * (t.x - base.x) - Math.sin(DOG_HOME.heading) * (t.z - base.z);
    expect(Math.abs(along)).toBeLessThanOrEqual(PET_DEFAULTS.stroke_m + 1e-12);
    expect(Math.abs(across)).toBeLessThan(1e-12);
    w.run(PET_DEFAULTS.pet_s);
    expect(w.pet.reach).toBeNull();
  });

  it("is cut by a run: the reach eases out over 0.2 s, faceTwin(null) is sent, and the twin is spec 025's (FR-011)", () => {
    const w = world();
    w.pet.select("dog");
    w.run(0.4 + 1);
    expect(w.pet.reach?.weight).toBe(1);
    w.running = true;
    w.run(FRAME_S);
    expect(w.calls.at(-1)).toBeNull();
    expect(w.activity.at(-1)).toEqual({ kind: "pet", on: false });
    const first = w.pet.reach?.weight ?? 0;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    w.run(0.1);
    expect(w.pet.reach?.weight ?? 0).toBeLessThan(first);
    w.run(0.12);
    expect(w.pet.reach).toBeNull();
    expect(w.pet.phase).toBe("idle");
  });

  it("is cut by a run that starts during the turn", () => {
    const w = world();
    w.pet.select("dog");
    w.run(0.1);
    w.running = true;
    w.run(FRAME_S);
    expect(w.calls.at(-1)).toBeNull();
    w.run(0.3);
    expect(w.pet.phase).toBe("idle");
    expect(w.activity).toEqual([]);
  });

  it("never takes the visitor's figure or the camera: its only outputs are faceTwin, the activity, and the reach (FR-012)", () => {
    const w = world();
    const keys = Object.keys(w.pet).sort();
    expect(keys).toEqual(["activity", "finished", "frame", "path", "phase", "reach", "select"]);
    w.pet.select("visitor-figure");
    expect(w.calls).toEqual([]);
  });

  it("gives one petting that ends done for each selection, the dog's view unchanged and the twin home within 1 s (SC-001)", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      // A seeded wait before each selection, and a seeded petting clip or none.
      let s = seed;
      const rand = (): number => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
      const w = world({ twin: { petting_s: rand() < 0.5 ? null : 1 + 3 * rand() } });
      const dogBefore = JSON.stringify(w.dog);
      w.run(Math.round(rand() * 60) * FRAME_S);
      expect(w.pet.select("dog")).toBe(true);
      w.run(0.4 + 4.5);
      expect(w.activity.filter((a) => a.on)).toHaveLength(1);
      expect(w.activity.at(-1)).toEqual({ kind: "pet", on: false });
      w.run(1);
      expect(w.pet.phase).toBe("idle");
      expect(w.heading).toBe(TWIN_HOME.heading);
      expect(JSON.stringify(w.dog)).toBe(dogBefore);
    }
  });
});
