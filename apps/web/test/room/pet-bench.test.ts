// T016's allocation half (spec 026; FR-027, SC-007; plan.md R-04; rv-impl-026's I-1, built by rework-026): no
// allocation per frame, measured, in the pet director's `frame` (on fakes that hand out the same objects each frame, as
// the adapters must) and in `applyReachLayer`, the reach's entry the twin's controller calls with the director's `reach`
// (T014), on the twin's real rig at the measured defaults, the stroke moving the target each frame. The measure: V8's heap in use across many frames, after a warm-up and a full collection; a frame that
// makes one object adds 12 bytes or more. A number is an object too where V8 can't keep it unboxed: a fraction held in
// a closure variable, or in a field of an `{ x, y, z }` literal, whose fields this process has generalized, is a new
// heap number at each write; so the harness itself keeps its state in a `Float64Array` and three's `Vector3`s.
// T016 adds the timing (under 0.1 ms a frame) to this file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import v8 from "node:v8";
import vm from "node:vm";

import { Group, Vector3 } from "three";
import type { Object3D } from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { AVATAR_SHAPES } from "../../src/choice/avatars";
import { stripMorphs } from "../../src/room/scene/avatars";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { createPet, PET_DEFAULTS } from "../../src/room/scene/pet";
import type { PetChase, PetDog, PetMotion, PetTwin } from "../../src/room/scene/pet";
import { applyReachLayer, findReachRig, strokeTarget } from "../../src/room/scene/pet-reach";
import type { ReachRig, Vec3 } from "../../src/room/scene/pet-reach";
import { FakeClock, REPO } from "../helpers/room";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;
// The measure is of the code the page runs once it is hot: V8's optimized code, which keeps fractions unboxed. Code not
// yet optimized boxes them, and under load the optimizing compiler, on a thread of its own, can finish late, so the
// warm-up runs until the functions measured are optimized, read through V8's own status (a test-only flag).
v8.setFlagsFromString("--allow-natives-syntax");
const status = new Function("f", "return %GetOptimizationStatus(f);") as (f: unknown) => number;
/** V8's status bit for a function its optimizing compiler, TurboFan, has compiled. */
const TURBOFANNED = 1 << 6;

const FRAMES = 20_000;
/** Below one object a frame (12 bytes or more), above the measure's noise. */
const MAX_BYTES_PER_FRAME = 8;

/** The heap's growth per frame over `FRAMES` calls of `step`, once `hot` is optimized (warmed up to 100 times
 *  `FRAMES`) and after a collection; the median of five, since a collection inside the loop can only lower one and the
 *  compiler's work can only raise one. */
function bytesPerFrame(step: () => void, hot: (...args: never[]) => unknown): number {
  const loop = (n: number): void => {
    for (let i = 0; i < n; i += 1) step();
  };
  loop(FRAMES);
  for (let r = 0; r < 100 && !(status(hot) & TURBOFANNED); r += 1) loop(FRAMES);
  expect(status(hot) & TURBOFANNED, "the measured function is optimized before the measure").toBe(TURBOFANNED);
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
    const bytes = bytesPerFrame(() => pet.frame(1 / 60), pet.frame);
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
      const head: Vec3 = new Vector3(DOG_HOME.x, 0.9 * h - 0.03, DOG_HOME.z + 0.35 * h);
      const target: Vec3 = new Vector3();
      const u = new Float64Array(1);
      // The layer as the director's `reach` holds it, a class's fields: the full reach, and a weight inside an ease
      // (the reach-in, the withdraw, a run's cut), where the arm's two bones are slerped from the clip's.
      class Layer {
        readonly target: Vec3 = target;
        weight = 1;
        legs = true;
      }
      const layer = new Layer();
      const step = (legs: boolean) => (): void => {
        u[0] = ((u[0] as number) + 1 / 240) % 1;
        strokeTarget(head, 0, u[0] as number, PET_DEFAULTS, target);
        layer.legs = legs;
        applyReachLayer(rig, layer, PET_DEFAULTS);
      };
      for (const w of [1, 0.37]) {
        layer.weight = w;
        const crouched = bytesPerFrame(step(true), applyReachLayer);
        const cut = bytesPerFrame(step(false), applyReachLayer);
        process.stderr.write(
          `\napplyReachLayer at weight ${w}: ${crouched.toFixed(2)} bytes a frame; legs off ${cut.toFixed(2)}\n`,
        );
        expect(crouched, `weight ${w}`).toBeLessThan(MAX_BYTES_PER_FRAME);
        expect(cut, `weight ${w}, legs off`).toBeLessThan(MAX_BYTES_PER_FRAME);
      }
    });
  });
});
