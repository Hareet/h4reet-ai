// T011b (spec 026; plan.md §4, R-07, R-08; A016, A020, A025): src/room/scene/pet-adapters.ts, the one place that names
// specs 016's, 020's, and 025's real code for the pet director. Over a fake of the avatar controller's shape
// (scene/avatars.ts's AvatarFigures: `shows`, `wants`, `pictureOf`, `clipOf`, and the two reads T014 adds to it,
// `twinState` and `reachRigOf`) and spec 025's real run shell (chase-figures.ts, unchanged), it checks:
// - the twin's view: its home as the run's shell takes it (the picture's world place, spec 008's heading from its
//   turn), what it shows (model, stand-in, capsule), its rig on both sides, the loaded `petting` clip's length (its own
//   model's only), `arriving` from spec 016's state, and spec 025's phase;
// - the dog's view: null without `figures.dog`, its picture, or its model shown; its home, its phase, and its head
//   point at 0.9 of AVATAR_SHAPES.dog.height and 0.35 of it forward along its facing (placeholders: spec 020's model
//   isn't on the line, so the pin against it waits, the notes say);
// - the run's adapter: `faceTwin` through to spec 025's director, `twinHeading` its runner's facing, `running` while
//   either figure flees;
// - the views are made once and written in place (FR-027): the same objects each call;
// - the director over them: a petting turns the twin's picture through chase-figures.ts and never moves the dog's.
import { Group, Object3D } from "three";
import type { AnimationClip } from "three";
import { describe, expect, it } from "vitest";

import { AVATAR_SHAPES } from "../../src/choice/avatars";
import type { RoomScene } from "../../src/room/compose/bundle";
import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import type { ChaseMotion } from "../../src/room/scene/chase";
import { createChaseFigures } from "../../src/room/scene/chase-figures";
import type { ChaseAvatars } from "../../src/room/scene/chase-figures";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";
import type { FigureRole, FigureSource } from "../../src/room/scene/loader";
import { createPet } from "../../src/room/scene/pet";
import { DOG_HEAD_FORWARD, DOG_HEAD_UP, createPetAdapters } from "../../src/room/scene/pet-adapters";
import type { PetAvatars } from "../../src/room/scene/pet-adapters";
import { Point } from "../../src/room/scene/pet-reach";
import type { ReachRig } from "../../src/room/scene/pet-reach";
import type { TwinState } from "../../src/room/scene/twin-states";
import type { FigureId } from "../../src/room/stage";

const DT = 1 / 60;
const MOVE: ChaseMotion = { animate: true, paused: false, level: 0 };
const TWIN_AT = { x: 0.66, z: 0.469 };
const DOG_AT: [number, number] = [0.3, 0.45];
const OPEN: FloorRect = { x0: -2, x1: 2, z0: -2, z1: 2 };
const floor: WalkableFloor = {
  radius: 0.12,
  feetY: 0,
  height: 1.7,
  shell: OPEN,
  bounds: OPEN,
  obstacles: [{ id: "fx-twin-figure", rect: { x0: 0.17, x1: 1.14, z0: 0.025, z1: 0.789 } }],
  start: { x: -0.7, z: 0.58 },
};
const part = {
  figures: {
    twin: "fx-twin-figure",
    dog: { home: { at: DOG_AT, heading_deg: 180 }, footprint_m: 0.3 },
    chase: CHASE_DEFAULTS,
  },
  walking: { speed_mps: 1 },
} as unknown as Pick<RoomScene, "figures" | "walking">;

interface Fake {
  readonly avatars: PetAvatars & ChaseAvatars;
  readonly twin: Group;
  readonly dog: Group;
  readonly shows: Record<FigureId, boolean>;
  readonly wants: Record<FigureId, FigureSource | null>;
  state: TwinState | null;
  rig: { right: boolean; left: boolean };
  petting: AnimationClip | null;
}

/** A fake controller: the twin's picture inside its placement's node, turned as the room's is, and the dog's group at
 *  its home, turned by spec 008's 180° (facing +z, glTF's front). */
function fake(): Fake {
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
  const f: Fake = {
    twin,
    dog,
    shows: { twin: true, visitor: true, dog: true },
    wants: { twin: "twin", visitor: "woman", dog: "dog" },
    state: "present",
    rig: { right: true, left: true },
    petting: null,
    avatars: {
      wants: {} as Record<FigureId, FigureSource | null>,
      shows: (id) => f.shows[id],
      pictureOf: (id) => (id === "twin" ? twin : id === "dog" ? dog : null),
      legsOf: (id) => (id === "twin" ? ({} as never) : null),
      clipOf: (avatar: FigureSource, role: FigureRole) =>
        avatar === "twin" && role === "petting"
          ? f.petting
          : avatar === "dog" && (role === "walk" || role === "run")
            ? ({} as AnimationClip)
            : null,
      dogPlays: () => undefined,
      twinActivity: () => undefined,
      stride: () => undefined,
      twinState: () => f.state,
      reachRigOf: (side) => (f.rig[side] ? ({ side } as unknown as ReachRig) : null),
    },
  };
  Object.defineProperty(f.avatars, "wants", { get: () => f.wants });
  return f;
}

function setup(options: { dog?: boolean; chosen?: "woman" | "dinosaur" } = {}) {
  const f = fake();
  const walking = { on: false, pose: { x: -0.7, z: 0.58 } };
  const shell = createChaseFigures({ floor, part, avatars: f.avatars, walking, chosen: options.chosen ?? "woman" });
  const adapters = createPetAdapters({ avatars: f.avatars, chase: () => shell.chase, hasDog: options.dog ?? true });
  return { f, shell, walking, adapters };
}

describe("the twin's view (A016, A025)", () => {
  it("takes its home as the run's shell does: the picture's world place, spec 008's heading from its turn", () => {
    const { shell, adapters } = setup();
    const r = shell.chase.runner("twin");
    const twin = adapters.twin();
    expect(twin?.home.x).toBeCloseTo(r?.x ?? Number.NaN, 12);
    expect(twin?.home.z).toBeCloseTo(r?.z ?? Number.NaN, 12);
    expect(twin?.home.heading).toBeCloseTo(r?.facing ?? Number.NaN, 12);
    // The placement's 0.4 and the picture's −0.1, less π (it faces glTF's +z).
    expect(twin?.home.heading).toBeCloseTo(0.3 - Math.PI, 12);
  });

  it("says what the picture shows: its own model, the stand-in, or the capsule", () => {
    const { f, adapters } = setup();
    expect(adapters.twin()?.shows).toBe("model");
    f.wants.twin = "man";
    expect(adapters.twin()?.shows).toBe("stand-in");
    f.shows.twin = false;
    expect(adapters.twin()?.shows).toBe("capsule");
  });

  it("has the rig only with the reach's bones on both sides", () => {
    const { f, adapters } = setup();
    expect(adapters.twin()?.rig).toBe(true);
    f.rig.left = false;
    expect(adapters.twin()?.rig).toBe(false);
    f.rig = { right: false, left: true };
    expect(adapters.twin()?.rig).toBe(false);
  });

  it("gives the loaded petting clip's length, its own model's only, else null (the reach's path)", () => {
    const { f, adapters } = setup();
    expect(adapters.twin()?.petting_s).toBeNull();
    f.petting = { duration: 3.25 } as AnimationClip;
    expect(adapters.twin()?.petting_s).toBe(3.25);
    f.wants.twin = "man";
    expect(adapters.twin()?.petting_s).toBeNull();
  });

  it("reads arriving from spec 016's state, and the phase from spec 025's director", () => {
    const { f, shell, walking, adapters } = setup({ chosen: "dinosaur" });
    expect(adapters.twin()?.arriving).toBe(false);
    f.state = "arriving";
    expect(adapters.twin()?.arriving).toBe(true);
    f.state = null;
    expect(adapters.twin()?.arriving).toBe(false);
    expect(adapters.twin()?.phase).toBe("home");
    walking.on = true;
    walking.pose.x = 0.3;
    walking.pose.z = 0.75;
    for (let i = 0; i < 20; i += 1) shell.frame(DT, MOVE);
    expect(shell.chase.phase("twin")).toBe("fleeing");
    expect(adapters.twin()?.phase).toBe("fleeing");
    expect(adapters.chase.running()).toBe(true);
  });

  it("is null without the twin's picture", () => {
    const f = fake();
    const adapters = createPetAdapters({
      avatars: { ...f.avatars, pictureOf: () => null, wants: f.wants },
      chase: () => null,
      hasDog: true,
    });
    expect(adapters.twin()).toBeNull();
    expect(adapters.dog()).toBeNull();
  });
});

describe("the dog's view (A020, A025)", () => {
  it("is null without figures.dog, its picture, or its model shown", () => {
    expect(setup({ dog: false }).adapters.dog()).toBeNull();
    const { f, adapters } = setup();
    expect(adapters.dog()).not.toBeNull();
    f.shows.dog = false;
    expect(adapters.dog()).toBeNull();
  });

  it("takes its home from its picture, and spec 025's phase", () => {
    const { shell, adapters } = setup();
    const dog = adapters.dog();
    const r = shell.chase.runner("dog");
    expect(dog?.home.x).toBeCloseTo(DOG_AT[0], 12);
    expect(dog?.home.z).toBeCloseTo(DOG_AT[1], 12);
    expect(dog?.home.heading).toBeCloseTo(r?.facing ?? Number.NaN, 12);
    expect(dog?.phase).toBe("home");
  });

  it("puts the head point 0.9 of the dog's height up and 0.35 of it forward, along its facing", () => {
    expect([DOG_HEAD_UP, DOG_HEAD_FORWARD]).toEqual([0.9, 0.35]);
    const { f, adapters } = setup();
    const h = AVATAR_SHAPES.dog.height;
    const out = new Point();
    adapters.dog()?.headPoint(out);
    // At spec 008's 180°, the picture's own turn 0: it faces +z.
    expect(out.x).toBeCloseTo(DOG_AT[0], 9);
    expect(out.y).toBeCloseTo(0.9 * h, 9);
    expect(out.z).toBeCloseTo(DOG_AT[1] + 0.35 * h, 9);
    // Turned a quarter to its left (+y), it faces +x.
    f.dog.rotation.set(0, Math.PI / 2, 0);
    f.dog.updateMatrixWorld(true);
    adapters.dog()?.headPoint(out);
    expect(out.x).toBeCloseTo(DOG_AT[0] + 0.35 * h, 9);
    expect(out.z).toBeCloseTo(DOG_AT[1], 9);
  });
});

describe("the run's adapter (M3)", () => {
  it("turns the twin through spec 025's director, and reads its runner's facing back", () => {
    const { shell, adapters } = setup();
    const home = adapters.twin()?.home.heading ?? Number.NaN;
    expect(adapters.chase.twinHeading()).toBeCloseTo(home, 12);
    adapters.chase.faceTwin(home + 0.4);
    for (let i = 0; i < 30; i += 1) shell.frame(DT, MOVE);
    expect(adapters.chase.twinHeading()).toBeCloseTo(home + 0.4, 12);
    expect(shell.chase.runner("twin")?.facing).toBeCloseTo(home + 0.4, 12);
    adapters.chase.faceTwin(null);
    for (let i = 0; i < 30; i += 1) shell.frame(DT, MOVE);
    expect(adapters.chase.twinHeading()).toBe(shell.chase.runner("twin")?.facing);
    expect(adapters.chase.running()).toBe(false);
  });

  it("gives the twin's facing on an object too, the runner itself, the same numbers as twinHeading (rework3-026)", () => {
    const { shell, adapters } = setup();
    const home = adapters.twin()?.home.heading ?? Number.NaN;
    expect(adapters.chase.twinFacing?.()).toBe(shell.chase.runner("twin"));
    adapters.chase.faceTwin(home + 0.4);
    for (let i = 0; i < 10; i += 1) {
      shell.frame(DT, MOVE);
      expect(adapters.chase.twinFacing?.().facing).toBe(adapters.chase.twinHeading());
    }
  });

  it("without the run's shell: the twin's home heading on twinFacing's object too (rework3-026)", () => {
    const f = fake();
    const adapters = createPetAdapters({ avatars: f.avatars, chase: () => null, hasDog: true });
    expect(adapters.chase.twinFacing?.().facing).toBeCloseTo(0.3 - Math.PI, 12);
    expect(adapters.chase.twinFacing?.()).toBe(adapters.chase.twinFacing?.());
  });

  it("without the run's shell: the twin's home heading, never running, and faceTwin does nothing", () => {
    const f = fake();
    const adapters = createPetAdapters({ avatars: f.avatars, chase: () => null, hasDog: true });
    adapters.chase.faceTwin(1);
    expect(adapters.chase.twinHeading()).toBeCloseTo(0.3 - Math.PI, 12);
    expect(adapters.chase.running()).toBe(false);
    expect(adapters.twin()?.phase).toBe("home");
    expect(adapters.dog()?.phase).toBe("home");
  });
});

describe("made once, written in place (FR-027)", () => {
  it("hands out the same view objects each call", () => {
    const { adapters } = setup();
    const twin = adapters.twin();
    const dog = adapters.dog();
    expect(adapters.twin()).toBe(twin);
    expect(adapters.dog()).toBe(dog);
    expect(adapters.twin()?.home).toBe(twin?.home);
    expect(adapters.dog()?.home).toBe(dog?.home);
  });
});

describe("the director over the adapters (R-07; Q159)", () => {
  it("a petting turns the twin's picture through chase-figures.ts and back, and the dog's picture never moves", () => {
    const { f, shell, adapters } = setup();
    let now = 0;
    const pet = createPet({
      clock: { now: () => now },
      motion: () => ({ animate: true, paused: false, level: 0, live: true }),
      twin: adapters.twin,
      dog: adapters.dog,
      chase: adapters.chase,
    });
    const dogBefore = [f.dog.position.toArray(), f.dog.rotation.toArray()];
    expect(pet.select("dog")).toBe(true);
    let turned = 0;
    for (let i = 0; i < 60 * 6 && (i === 0 || pet.phase !== "idle"); i += 1) {
      now += DT * 1000;
      pet.frame(DT);
      shell.frame(DT, MOVE);
      turned = Math.max(turned, Math.abs(f.twin.rotation.y - -0.1));
      expect([f.dog.position.toArray(), f.dog.rotation.toArray()]).toEqual(dogBefore);
    }
    expect(pet.phase).toBe("idle");
    expect(turned).toBeGreaterThan(0.5);
    expect(f.twin.rotation.y).toBe(-0.1);
  });
});
