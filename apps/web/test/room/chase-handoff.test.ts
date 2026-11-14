// rv-impl-025's B-1 (spec 025; FR-016, FR-017, Degraded-Mode's "the room is as `main` has it"; spec 002's FR-008,
// spec 016's `appear`): the run's shell beside the hand-off.
// - A real avatar controller for a dinosaur visitor, its hand-off turning the twin's picture group, and the shell's
//   frame after each of the hand-off's frames: the twin's turn shows at p near 0.3, whether the shell was made before
//   the hand-off or in its middle.
// - The shell writes a picture only while its runner is away from home, and once on the frame it gets home: nothing
//   while a figure stays home and no run is on, nothing for a held figure, and nothing after the frame it got home.
// - The stage makes the shell only once the hand-off has ended (scene.ts, by `chaseDue`), so no home holds a mid-turn
//   rotation.
import { Group, Object3D } from "three";
import type { AnimationClip } from "three";
import { describe, expect, it } from "vitest";

import type { AvatarId } from "../../src/choice/avatars";
import type { RoomScene } from "../../src/room/compose/bundle";
import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import type { ChaseMotion } from "../../src/room/scene/chase";
import { chaseDue, createChaseFigures } from "../../src/room/scene/chase-figures";
import type { ChaseAvatars } from "../../src/room/scene/chase-figures";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";
import type { FigureId } from "../../src/room/stage";
import { dinosaurNight, dinosaurStage } from "../helpers/room-dinosaur";

const MOVE: ChaseMotion = { animate: true, paused: false, level: 0 };
const DT = 1 / 60;
const OPEN: FloorRect = { x0: -3, x1: 3, z0: -3, z1: 3 };
const floor: WalkableFloor = {
  radius: 0.12,
  feetY: 0,
  height: 1.7,
  shell: OPEN,
  bounds: OPEN,
  obstacles: [],
  start: { x: -0.7, z: 0.58 },
};
/** The walking view, off, as it is through the hand-off. */
const offView = (): { on: boolean; pose: { x: number; z: number } } => ({ on: false, pose: { x: -0.7, z: 0.58 } });

describe("the hand-off's turn beside the run's shell, a real controller, the dinosaur chosen (B-1)", () => {
  it("shows the twin's turn at p near 0.3 after the shell's frame, the shell made before the hand-off", async () => {
    const s = await dinosaurStage({ ended: false });
    const shell = createChaseFigures({
      floor,
      part: dinosaurNight().scene,
      avatars: s.figures,
      walking: offView(),
      chosen: "dinosaur",
    });
    shell.frame(DT, MOVE);
    const turns: number[] = [];
    for (const p of [0, 0.1, 0.2, 0.29, 0.3, 0.31]) {
      s.figures.showHandoff(p, false);
      const turn = s.room.twin.rotation.y;
      shell.frame(DT, MOVE);
      expect(s.room.twin.rotation.y).toBe(turn);
      turns.push(turn);
    }
    // The hand-off's full turn at p = 0.3 (bundle3d.ts's TWIN_TURN, 0.45 rad, to the twin's side).
    expect(Math.abs(turns[4] as number)).toBeCloseTo(0.45, 9);
  });

  it("shows it the same with the shell made in the hand-off's middle, and ends it at the hand-off's end", async () => {
    const s = await dinosaurStage({ ended: false });
    s.figures.showHandoff(0, false);
    s.figures.showHandoff(0.3, false);
    const shell = createChaseFigures({
      floor,
      part: dinosaurNight().scene,
      avatars: s.figures,
      walking: offView(),
      chosen: "dinosaur",
    });
    shell.frame(DT, MOVE);
    expect(Math.abs(s.room.twin.rotation.y)).toBeCloseTo(0.45, 9);
    for (const p of [0.31, 0.5, 0.7, 0.9]) {
      s.figures.showHandoff(p, false);
      const turn = s.room.twin.rotation.y;
      shell.frame(DT, MOVE);
      expect(s.room.twin.rotation.y).toBe(turn);
    }
    s.figures.showHandoff(1, false);
    s.figures.handoffEnded();
    shell.frame(DT, MOVE);
    expect(s.room.twin.rotation.y).toBe(0);
  });
});

describe("chaseDue: the stage makes the shell once the hand-off has ended, for the dinosaur (B-1 (b); FR-001)", () => {
  it.each([
    ["dinosaur", false, false],
    ["dinosaur", true, true],
    ["woman", true, false],
    ["man", true, false],
    ["dog", true, false],
  ] as const)("the %s chosen, the hand-off ended %s: %s", (chosen, ended, due) => {
    expect(chaseDue(chosen as AvatarId, ended)).toBe(due);
  });
});

// ---- The shell's writes, over a fake controller (B-1 (a)) ----

const TWIN_AT = { x: 0.66, z: 0.469 };
const DOG_AT: [number, number] = [0.3, 0.45];
const NEAR = { x: -0.2, z: 0.46 };
const part = {
  figures: {
    twin: "twin-figure",
    dog: { home: { at: DOG_AT, heading_deg: 180 }, footprint_m: 0.3 },
    chase: CHASE_DEFAULTS,
  },
  walking: { speed_mps: 1 },
} as unknown as Pick<RoomScene, "figures" | "walking">;

interface Fake {
  readonly avatars: ChaseAvatars;
  readonly twin: Group;
  readonly dog: Group;
  readonly shows: Record<FigureId, boolean>;
}
function fake(): Fake {
  const root = new Object3D();
  const placement = new Object3D();
  placement.position.set(TWIN_AT.x, 0, TWIN_AT.z);
  placement.rotation.set(0, 0.4, 0);
  const twin = new Group();
  placement.add(twin);
  root.add(placement);
  const dog = new Group();
  dog.position.set(DOG_AT[0], 0, DOG_AT[1]);
  dog.rotation.set(0, Math.PI, 0);
  root.add(dog);
  root.updateMatrixWorld(true);
  const f: Fake = {
    twin,
    dog,
    shows: { twin: true, visitor: true, dog: true },
    avatars: {
      shows: (id) => f.shows[id],
      pictureOf: (id) => (id === "twin" ? twin : id === "dog" ? dog : null),
      legsOf: (id) => (id === "twin" ? ({} as never) : null),
      clipOf: (avatar, role) => (avatar === "dog" && (role === "walk" || role === "run") ? ({} as AnimationClip) : null),
      dogPlays: () => undefined,
      twinActivity: () => undefined,
      stride: () => undefined,
    },
  };
  return f;
}
function shellOver(f: Fake) {
  const walking = { on: false, pose: { x: NEAR.x, z: NEAR.z } };
  const shell = createChaseFigures({ floor, part, avatars: f.avatars, walking, chosen: "dinosaur" });
  const frame = (n = 1): void => {
    for (let i = 0; i < n; i += 1) shell.frame(DT, MOVE);
  };
  return { shell, walking, frame };
}
/** Another writer's mark on both pictures, which the shell must leave while they are home. */
const mark = (f: Fake): void => {
  f.twin.rotation.y = 0.7;
  f.dog.position.y = 0.25;
};
const marked = (f: Fake): boolean => f.twin.rotation.y === 0.7 && f.dog.position.y === 0.25;

describe("the shell writes a picture only while its runner is away (B-1 (a); FR-017)", () => {
  it("writes nothing while the figures stay home and no run is on", () => {
    const f = fake();
    const r = shellOver(f);
    r.frame(3);
    mark(f);
    r.frame(30);
    expect(r.shell.chase.on).toBe(false);
    expect(marked(f)).toBe(true);
  });

  it("writes each frame of a run, puts each picture home once on the frame it gets there, then nothing", () => {
    const f = fake();
    const r = shellOver(f);
    const home = { twin: f.twin.rotation.clone(), dog: f.dog.position.clone() };
    r.walking.on = true;
    r.frame(30);
    expect(r.shell.chase.phase("twin")).not.toBe("home");
    r.walking.on = false;
    let frames = 0;
    while ((r.shell.chase.phase("twin") !== "home" || r.shell.chase.phase("dog") !== "home") && frames < 60 * 10) {
      r.frame(1);
      frames += 1;
    }
    expect(f.twin.rotation.equals(home.twin)).toBe(true);
    expect(f.dog.position.equals(home.dog)).toBe(true);
    r.frame(5);
    mark(f);
    r.frame(30);
    expect(marked(f)).toBe(true);
  });

  it("writes nothing for a figure held at home through a run (the twin as its capsule)", () => {
    const f = fake();
    f.shows.twin = false;
    const r = shellOver(f);
    f.twin.rotation.y = 0.7;
    r.walking.on = true;
    r.frame(30);
    expect(r.shell.chase.runner("dog")?.x).not.toBeCloseTo(DOG_AT[0], 3);
    expect(f.twin.rotation.y).toBe(0.7);
  });
});
