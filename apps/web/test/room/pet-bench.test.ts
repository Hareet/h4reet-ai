// T016's allocation half (spec 026; FR-027, SC-007; plan.md R-04; rv-impl-026's I-1, built by rework-026): no
// allocation per frame, measured, in the pet director's `frame` (on fakes that hand out the same objects each frame, as
// the adapters must) and in `applyReach` on the twin's real rig at the measured defaults, the stroke moving the target
// each frame. The measure: V8's heap in use across many frames, after a warm-up and a full collection; a frame that
// makes one object adds 16 bytes or more. T016 adds the timing (under 0.1 ms a frame) to this file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";

import { Group } from "three";
import type { Object3D } from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { AVATAR_SHAPES } from "../../src/choice/avatars";
import { stripMorphs } from "../../src/room/scene/avatars";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { createPet, PET_DEFAULTS } from "../../src/room/scene/pet";
import type { PetChase, PetDog, PetMotion, PetTwin } from "../../src/room/scene/pet";
import { applyReach, findReachRig, strokeTarget } from "../../src/room/scene/pet-reach";
import type { ReachRig, Vec3 } from "../../src/room/scene/pet-reach";
import { FakeClock, REPO } from "../helpers/room";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;

const FRAMES = 20_000;
/** Below one object a frame (16 bytes or more), above the measure's noise. */
const MAX_BYTES_PER_FRAME = 8;

/** The heap's growth per frame over `FRAMES` calls of `step`, after two warm-ups of the same loop and a collection;
 *  the median of five, since a collection inside the loop can only lower one and the compiler's work can only raise
 *  one. */
function bytesPerFrame(step: () => void): number {
  const loop = (n: number): void => {
    for (let i = 0; i < n; i += 1) step();
  };
  loop(FRAMES);
  loop(FRAMES);
  const runs: number[] = [];
  for (let r = 0; r < 5; r += 1) {
    gc();
    const before = process.memoryUsage().heapUsed;
    loop(FRAMES);
    runs.push((process.memoryUsage().heapUsed - before) / FRAMES);
  }
  return runs.sort((a, b) => a - b)[2] as number;
}

const DOG_HOME = { x: 0.3, z: 0.45, heading: 0 };
const TWIN_HOME = { x: 0.66, z: 0.469, heading: Math.PI };

describe("no allocation per frame (FR-027, SC-007; I-1)", () => {
  it("in the pet director's frame, through the petting", () => {
    const clock = new FakeClock();
    const motion: PetMotion = { animate: true, paused: false, level: 0, live: true };
    const twin: PetTwin = {
      home: TWIN_HOME,
      shows: "model",
      rig: true,
      petting_s: null,
      arriving: false,
      phase: "home",
    };
    const dog: PetDog = {
      home: DOG_HOME,
      phase: "home",
      headPoint(out: Vec3): Vec3 {
        out.x = DOG_HOME.x;
        out.y = 0.558;
        out.z = DOG_HOME.z + 0.217;
        return out;
      },
    };
    let heading = TWIN_HOME.heading;
    const chase: PetChase = {
      faceTwin: () => undefined,
      twinHeading: () => heading,
      running: () => false,
    };
    // A petting long enough for every measured frame to be inside it, its reach moving the stroke each frame.
    const pet = createPet({
      config: { pet_s: 1e9 },
      clock,
      motion: () => motion,
      twin: () => twin,
      dog: () => dog,
      chase,
    });
    expect(pet.select("dog")).toBe(true);
    heading = Number.NaN;
    pet.frame(1);
    expect(pet.phase).toBe("petting");
    const bytes = bytesPerFrame(() => pet.frame(1 / 60));
    expect(pet.phase).toBe("petting");
    expect(pet.reach?.weight).toBe(1);
    process.stderr.write(`\npet.frame: ${bytes.toFixed(2)} bytes a frame\n`);
    expect(bytes).toBeLessThan(MAX_BYTES_PER_FRAME);
  });

  describe("in applyReach, on the twin's real rig", () => {
    let root: Object3D;
    beforeAll(async () => {
      const decode: Decode = (_source, options) =>
        Promise.resolve({
          width: options.resizeWidth ?? 1,
          height: options.resizeHeight ?? 1,
          close: () => undefined,
        } as unknown as ImageBitmap);
      const bytes = new Uint8Array(readFileSync(join(REPO, "assets/twin/twin.glb")));
      const gltf = (await parseModel(bytes.slice().buffer, { reduced: false, decode })).gltf;
      stripMorphs(gltf.scene);
      root = gltf.scene;
    }, 180_000);

    it("with the crouch, and on a run's cut (legs off)", () => {
      const picture = new Group();
      picture.position.set(TWIN_HOME.x, 0, TWIN_HOME.z);
      picture.rotation.y = -60 * (Math.PI / 180);
      picture.add(root);
      picture.updateMatrixWorld(true);
      const rig = findReachRig(root, "right") as ReachRig;
      expect(rig).not.toBeNull();
      const h = AVATAR_SHAPES.dog.height;
      const head: Vec3 = { x: DOG_HOME.x, y: 0.9 * h - 0.03, z: DOG_HOME.z + 0.35 * h };
      const target: Vec3 = { x: 0, y: 0, z: 0 };
      let u = 0;
      const step = (legs: boolean) => (): void => {
        u = (u + 1 / 240) % 1;
        strokeTarget(head, 0, u, PET_DEFAULTS, target);
        applyReach(rig, target, 1, PET_DEFAULTS, legs);
      };
      const crouched = bytesPerFrame(step(true));
      const cut = bytesPerFrame(step(false));
      process.stderr.write(`\napplyReach: ${crouched.toFixed(2)} bytes a frame; legs off ${cut.toFixed(2)}\n`);
      expect(crouched).toBeLessThan(MAX_BYTES_PER_FRAME);
      expect(cut).toBeLessThan(MAX_BYTES_PER_FRAME);
    });
  });
});
