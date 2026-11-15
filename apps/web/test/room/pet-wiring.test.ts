// T014 (spec 026; FR-005 to FR-011; plan.md R-04, R-05, R-07; Q226): the twin's figure and the wiring, on the twin's
// real model and idle (assets/twin/), in the room's controller (scene/avatars.ts), with spec 025's run shell
// (chase-figures.ts, unchanged) and the pet director over the adapters (pet-adapters.ts), as scene.ts wires them.
// - The controller gives the adapters the twin's state and its reach rig on both sides.
// - A petting on the reach's path: the director's `reach` is applied after the legs each frame by `applyReachLayer`
//   (the arm leaves the clip's pose), and cleared when it ends (every bone the clip's again).
// - The twin's picture turns only through chase-figures.ts (its rotation the runner's facing's change from home) and
//   the dog's picture doesn't move.
// - A run's cut (Q226): on the run's first frame after it, no leg bone and not the hips is the reach's (they equal a
//   twin given the same frames and the same petting's turn, its controller unlinked), while the arm still eases out.
// - The petting clip, where loaded, plays once and its end ends the petting.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AnimationClip, Group, Quaternion, QuaternionKeyframeTrack } from "three";
import type { Object3D } from "three";
import { beforeAll, describe, expect, it } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { floorOfPart } from "../../src/room/compose/floor";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { createAvatarFigures, stripMorphs } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import type { ChaseMotion } from "../../src/room/scene/chase";
import { createChaseFigures } from "../../src/room/scene/chase-figures";
import type { ChaseAvatars } from "../../src/room/scene/chase-figures";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { createPet } from "../../src/room/scene/pet";
import type { Pet, PetDog } from "../../src/room/scene/pet";
import { createPetAdapters } from "../../src/room/scene/pet-adapters";
import { PET_DEFAULTS } from "../../src/room/scene/pet-config";
import { REPO, repositoryBundle } from "../helpers/room";

const decode: Decode = (_source, options) =>
  Promise.resolve({
    width: options.resizeWidth ?? 1,
    height: options.resizeHeight ?? 1,
    close: () => undefined,
  } as unknown as ImageBitmap);

async function parsed(file: string): Promise<{ root: Object3D; clips: AnimationClip[] }> {
  const bytes = new Uint8Array(readFileSync(join(REPO, file)));
  const gltf = (await parseModel(bytes.slice().buffer, { reduced: false, decode })).gltf;
  stripMorphs(gltf.scene);
  return { root: gltf.scene, clips: gltf.animations };
}

let idleClips: AnimationClip[];
beforeAll(async () => {
  idleClips = (await parsed("assets/twin/idle.glb")).clips;
}, 180_000);

const DT = 1 / 60;
const MOVE: ChaseMotion = { animate: true, paused: false, level: 0 };
const LEGS = ["Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"];

interface World {
  readonly part: RoomScene;
  readonly figures: AvatarFigures;
  readonly twin: Object3D;
  readonly dog: Group;
  readonly walking: { on: boolean; pose: { x: number; z: number } };
  readonly shell: ReturnType<typeof createChaseFigures>;
  readonly pet: Pet | null;
  frame(n?: number): void;
}

/** The room's controller with the twin's real model and idle, the run's shell over it (the visitor shown as the
 *  dinosaur, so a run can start), and, where `petting`, the pet director over the adapters, linked as scene.ts links it.
 *  The dog's view is the director's own fake at the scene's dog home: its model isn't on the line. */
async function world(petting: boolean, link = true): Promise<World> {
  const model = (await parsed("assets/twin/twin.glb")).root;
  const bundle = repositoryBundle();
  const part = bundle.scene;
  const room = buildRoom(part, { avatar: "dinosaur", label: () => new Group(), index: bundle.index });
  const t = { now: 0 };
  const figures = createAvatarFigures(room, part, { chosen: "dinosaur", clock: () => t.now });
  expect(figures.model("twin", model)).toBe(true);
  figures.clip("twin", "idle", idleClips);
  figures.handoffEnded();
  const floor = floorOfPart(part, part.walking.radius_m);
  if (!floor) throw new Error("no floor");
  const walking = { on: false, pose: { x: -0.7, z: 0.58 } };
  const avatars: ChaseAvatars = {
    shows: (id) => (id === "visitor" ? true : figures.shows(id)),
    pictureOf: (id) => figures.pictureOf(id),
    legsOf: (id) => figures.legsOf(id),
    clipOf: (a, r) => figures.clipOf(a, r),
    dogPlays: (r) => figures.dogPlays(r),
    twinActivity: (a) => figures.twinActivity(a),
    stride: (f, x, z, s, m) => figures.stride(f, x, z, s, m),
  };
  const shell = createChaseFigures({ floor, part, avatars, walking, chosen: "dinosaur" });
  const dogNode = figures.pictureOf("dog") ?? new Group();
  const dogHome = part.figures.dog?.home.at ?? [0.3, 0.45];
  const dogView: PetDog = {
    home: { x: dogHome[0], z: dogHome[1], heading: Math.PI },
    phase: "home",
    headPoint(out) {
      out.x = dogHome[0];
      out.y = 0.9 * 0.62;
      out.z = dogHome[1] + 0.35 * 0.62;
      return out;
    },
  };
  let pet: Pet | null = null;
  if (petting) {
    const adapters = createPetAdapters({ avatars: figures, chase: () => shell.chase, hasDog: true });
    const director = createPet({
      config: part.figures.pet ?? null,
      clock: { now: () => t.now },
      motion: () => ({ animate: true, paused: false, level: 0, live: true }),
      twin: adapters.twin,
      dog: () => dogView,
      chase: adapters.chase,
      signal: (a) => figures.twinActivity(a),
    });
    if (link) figures.pet({ reach: () => director.reach, finished: () => director.finished(), config: PET_DEFAULTS });
    pet = director;
  }
  const w: World = {
    part,
    figures,
    twin: figures.pictureOf("twin") as Object3D,
    dog: dogNode as Group,
    walking,
    shell,
    pet,
    frame(n = 1) {
      for (let i = 0; i < n; i += 1) {
        t.now += DT * 1000;
        w.pet?.frame(DT);
        shell.frame(DT, MOVE);
        figures.update(DT * 1000, true, 0);
      }
    },
  };
  return w;
}

const bone = (root: Object3D, name: string): Object3D => {
  const found = root.getObjectByName(`mixamorig${name}`) ?? root.getObjectByName(`mixamorig:${name}`);
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const quat = (o: Object3D): number[] => o.quaternion.toArray();
const close = (a: readonly number[], b: readonly number[], eps = 1e-9): boolean =>
  a.length === b.length && a.every((x, i) => Math.abs(x - (b[i] ?? Number.NaN)) <= eps);

describe("the controller's reads for the adapters (A016)", () => {
  it("gives the twin's state and its reach rig on both sides", async () => {
    const w = await world(false);
    w.frame(2);
    expect(w.figures.shows("twin")).toBe(true);
    expect(w.figures.twinState()).toBe("present");
    expect(w.figures.reachRigOf("right")).not.toBeNull();
    expect(w.figures.reachRigOf("left")).not.toBeNull();
  });
});

describe("a petting on the reach's path, wired (R-04, R-05, R-07)", () => {
  it("lays the reach after the legs while it has weight, turns the twin through chase-figures.ts, and clears it after", async () => {
    const w = await world(true);
    const plain = await world(false);
    w.frame(2);
    plain.frame(2);
    const dogBefore = [w.dog.position.toArray(), w.dog.rotation.toArray()];
    const home = w.shell.chase.runner("twin")?.facing ?? Number.NaN;
    const turn0 = w.twin.rotation.y;
    expect(w.pet?.select("dog")).toBe(true);
    let laid = 0;
    let frames = 0;
    while (w.pet?.phase !== "idle" && frames < 60 * 8) {
      w.frame();
      plain.frame();
      frames += 1;
      // The twin's turn is the runner's: chase-figures.ts's write, the one writer.
      const facing = w.shell.chase.runner("twin")?.facing ?? Number.NaN;
      expect(w.twin.rotation.y).toBeCloseTo(turn0 + (facing - home), 9);
      expect([w.dog.position.toArray(), w.dog.rotation.toArray()]).toEqual(dogBefore);
      if (w.pet?.reach && w.pet.reach.weight > 0.5) {
        laid += 1;
        const arm = w.pet.reach.side === "right" ? "RightArm" : "LeftArm";
        expect(close(quat(bone(w.twin, arm)), quat(bone(plain.twin, arm)), 1e-4)).toBe(false);
      }
    }
    expect(w.pet?.phase).toBe("idle");
    expect(laid).toBeGreaterThan(30);
    w.frame();
    plain.frame();
    for (const name of ["Spine", "Spine1", "Spine2", "RightArm", "RightForeArm", "LeftArm", "LeftForeArm", ...LEGS])
      expect(close(quat(bone(w.twin, name)), quat(bone(plain.twin, name)), 1e-9), name).toBe(true);
    expect(bone(w.twin, "Hips").position.toArray()).toEqual(bone(plain.twin, "Hips").position.toArray());
    expect(w.twin.rotation.y).toBe(turn0);
  });
});

describe("a run's cut, wired (FR-011; Q226)", () => {
  it("on the run's first frame after the cut, no leg bone and not the hips is the reach's; the arm eases out", async () => {
    const w = await world(true);
    const plain = await world(true, false);
    w.frame(2);
    plain.frame(2);
    expect(w.pet?.select("dog")).toBe(true);
    // The control: the same director and run, the twin turned alike, but its controller not linked, so no reach.
    expect(plain.pet?.select("dog")).toBe(true);
    for (let i = 0; i < 300 && !(w.pet?.reach && w.pet.reach.weight >= 1); i += 1) {
      w.frame();
      plain.frame();
    }
    expect(w.pet?.reach?.weight).toBe(1);
    // The dinosaur comes near: spec 025's director starts the run in both worlds alike.
    for (const x of [w, plain]) {
      x.walking.on = true;
      x.walking.pose.x = 0.45;
      x.walking.pose.z = 0.75;
    }
    let cut = false;
    for (let i = 0; i < 30 && !cut; i += 1) {
      w.frame();
      plain.frame();
      cut = w.pet?.reach !== null && w.pet?.reach.legs === false;
    }
    expect(cut).toBe(true);
    expect(w.shell.chase.phase("twin")).toBe(plain.shell.chase.phase("twin"));
    for (const name of LEGS.slice(1))
      expect(close(quat(bone(w.twin, name)), quat(bone(plain.twin, name)), 1e-9), name).toBe(true);
    expect(bone(w.twin, "Hips").position.toArray()).toEqual(bone(plain.twin, "Hips").position.toArray());
    expect(close(quat(bone(w.twin, "Hips")), quat(bone(plain.twin, "Hips")), 1e-9)).toBe(true);
    const arm = w.pet?.reach?.side === "left" ? "LeftArm" : "RightArm";
    expect(close(quat(bone(w.twin, arm)), quat(bone(plain.twin, arm)), 1e-4)).toBe(false);
  });
});

describe("the petting clip, where loaded (FR-006; R-05)", () => {
  it("plays once in petting's place, and its end ends the petting", async () => {
    const w = await world(true);
    // A short petting clip on the twin's rig: the hips turned a little, 0.5 s.
    const track = new QuaternionKeyframeTrack(
      `${bone(w.twin, "Hips").name}.quaternion`,
      [0, 0.5],
      [...new Quaternion().toArray(), ...new Quaternion(0, 0.05, 0, 1).normalize().toArray()],
    );
    w.figures.clip("twin", "petting", [new AnimationClip("petting", 0.5, [track])]);
    w.frame(2);
    expect(w.pet?.select("dog")).toBe(true);
    expect(w.pet?.path).toBe("clip");
    let played = false;
    for (let i = 0; i < 120 && w.pet?.phase !== "return" && w.pet?.phase !== "idle"; i += 1) {
      w.frame();
      played ||= w.figures.playing("twin") === "petting";
    }
    expect(played).toBe(true);
    // Ended by the clip's end, half a second in, not by pet_s (3.5 s).
    expect(["return", "idle"]).toContain(w.pet?.phase);
    expect(w.pet?.reach).toBeNull();
  });
});
