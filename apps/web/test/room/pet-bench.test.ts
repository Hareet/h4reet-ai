// T016's allocation half (spec 026; FR-027, SC-007; plan.md R-04; rv-impl-026's I-1, built by rework-026, and
// rv-rework-026's B-3, by rework2-026): no allocation per frame, measured, in the pet director's `frame` (on fakes
// that hand out the same objects each frame, as the adapters must) and in `applyReachLayer`, the reach's entry the twin's
// controller calls with the director's `reach` (T014), on the twin's real rig at the measured defaults, the stroke
// moving the target each frame. The director is measured a whole petting at a time, from its selection to idle: the
// turn on a heading that converges, the reach-in, the stroke, the withdraw, the return; a short petting whose phases
// change every few frames; and a petting cut by a run, through its fade. The measure: V8's heap in use across many
// calls, after a warm-up and a full collection; a call that makes one object adds 12 bytes or more. A number is an
// object too where V8 can't keep it unboxed: a fraction held in a closure variable, or in a field of an `{ x, y, z }`
// literal, whose fields this process has generalized, is a new heap number at each write; so the harness itself keeps
// its state in typed arrays, class fields, and three's `Vector3`s. T016 adds the timing (under 0.1 ms a frame).
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
import type { Pet, PetChase, PetConfig, PetDog, PetMotion, PetTwin } from "../../src/room/scene/pet";
import { applyReachLayer, findReachRig, strokeTarget } from "../../src/room/scene/pet-reach";
import type { ReachRig, Vec3 } from "../../src/room/scene/pet-reach";
import { REPO } from "../helpers/room";

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
/** Below one object a petting: a step that is a whole petting makes none. */
const MAX_BYTES_PER_PETTING = 12;
/** The bench's own limit: its warm-ups run the measured function 20,000 times a pass until V8 optimizes it, and
 *  under load the eight `pet-*` files together took 63 s, over vitest's 60 s a test (rv-rework-026's nit 5). */
const BENCH_TIMEOUT_MS = 300_000;

/** The heap's growth per call of `step` (a frame, or a whole petting) over `calls` calls, once `hot` is optimized
 *  (warmed up to 100 times `calls`) and after a collection; the median of five, since a collection inside the loop can only lower one and the
 *  compiler's work can only raise one. */
function bytesPerFrame(step: () => void, hot: (...args: never[]) => unknown, calls = FRAMES): number {
  const loop = (n: number): void => {
    for (let i = 0; i < n; i += 1) step();
  };
  loop(calls);
  for (let r = 0; r < 100 && !(status(hot) & TURBOFANNED); r += 1) loop(calls);
  expect(status(hot) & TURBOFANNED, "the measured function is optimized before the measure").toBe(TURBOFANNED);
  loop(calls);
  const runs: number[] = [];
  for (let r = 0; r < 5; r += 1) {
    gc();
    const before = process.memoryUsage().heapUsed;
    loop(calls);
    runs.push((process.memoryUsage().heapUsed - before) / calls);
  }
  return runs.sort((a, b) => a - b)[2] as number;
}

const DOG_HOME = { x: 0.3, z: 0.45, heading: 0 };
const TWIN_HOME = { x: 0.66, z: 0.469, heading: Math.PI };

describe("no allocation per frame (FR-027, SC-007; I-1)", () => {
  // The director's fakes keep their state as the page's adapters must, in typed arrays and class fields: the clock's
  // milliseconds (fractional, as `performance.now()`'s are), the twin's heading and the heading spec 025's director
  // turns it toward, and whether a run is on. The twin turns at FR-005's rate (60° in a third of a second), so its
  // heading is a fraction every frame of a turn and arrives at the aim, as the real one does; `snap` turns it at once.
  class Rig {
    readonly ms = new Float64Array(1);
    /** The twin's heading, and its aim (`faceTwin`'s, or its home's after `faceTwin(null)`). */
    readonly heading = new Float64Array([TWIN_HOME.heading, TWIN_HOME.heading]);
    running = false;
    snap = false;
    /** Frames seen in each phase, and frames whose reach weight is strictly between 0 and 1, in a cut's fade or not. */
    readonly seen = new Int32Array(7);
  }
  const TURN_RAD_PER_FRAME = Math.PI / 60;
  const PHASES = ["idle", "turn", "petting", "return"] as const;
  const EASING = 4;
  const FADING = 5;
  /** Selections refused: none expected (an `expect` in the measure would make objects of its own). */
  const REFUSED = 6;
  const select = (pet: Pet, rig: Rig): void => {
    if (!pet.select("dog")) rig.seen[REFUSED] = (rig.seen[REFUSED] as number) + 1;
  };

  function director(config: Partial<PetConfig>, rig: Rig): Pet {
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
    const chase: PetChase = {
      faceTwin(heading: number | null): void {
        rig.heading[1] = heading ?? TWIN_HOME.heading;
        if (rig.snap) rig.heading[0] = rig.heading[1] as number;
      },
      twinHeading: () => rig.heading[0] as number,
      running: () => rig.running,
    };
    return createPet({
      config,
      clock: { now: () => rig.ms[0] as number },
      motion: () => motion,
      twin: () => twin,
      dog: () => dog,
      chase,
    });
  }

  /** One frame of the room: spec 025's director turns the twin a step toward its aim, the clock moves a 60th of a
   *  second, and the pet director's frame runs; what it saw is counted. A closure for each director, so its calls stay
   *  monomorphic, as the page's are. */
  function framer(pet: Pet, rig: Rig): () => void {
    return (): void => {
      const h = rig.heading;
      const off = (h[1] as number) - (h[0] as number);
      h[0] = (h[0] as number) + Math.max(-TURN_RAD_PER_FRAME, Math.min(TURN_RAD_PER_FRAME, off));
      rig.ms[0] = (rig.ms[0] as number) + 1000 / 60;
      pet.frame(1 / 60);
      const phase = pet.phase;
      for (let i = 0; i < PHASES.length; i += 1) if (PHASES[i] === phase) rig.seen[i] = (rig.seen[i] as number) + 1;
      const reach = pet.reach;
      if (reach !== null && reach.weight > 0 && reach.weight < 1) {
        const k = rig.running ? FADING : EASING;
        rig.seen[k] = (rig.seen[k] as number) + 1;
      }
    };
  }

  it(
    "in the pet director's frame, over whole pettings: the turn, the reach-in, the stroke, the withdraw, the return",
    () => {
      const rig = new Rig();
      const pet = director({ cooldown_s: 0 }, rig);
      const frame = framer(pet, rig);
      // A step is a whole petting, from its selection to idle: the measure's noise is the heap's, a few kilobytes a
      // pass, so over 2,000 pettings it is about 2 bytes a petting, and an object a petting (12 bytes or more) shows.
      const step = (): void => {
        select(pet, rig);
        for (let i = 0; i < 1000 && pet.phase !== "idle"; i += 1) frame();
      };
      const perPetting = bytesPerFrame(step, pet.frame, 2_000);
      expect(rig.seen[REFUSED], "selections refused").toBe(0);
      const s = rig.seen;
      const all = s[0]! + s[1]! + s[2]! + s[3]!;
      const pettings = s[0]! > 0 ? s[0]! : 1;
      // Each petting turns over frames, not at its time limit, and is half-eased for frames at each end.
      expect(s[1]! / pettings, "turn frames a petting").toBeGreaterThan(1);
      expect(s[1]! / pettings, "a turn ends before its time limit").toBeLessThan(60);
      expect(s[3]! / pettings, "return frames a petting").toBeGreaterThan(1);
      expect(s[EASING]! / pettings, "reach-in and withdraw frames a petting").toBeGreaterThan(20);
      process.stderr.write(
        `\npet.select and pet.frame, a whole petting of ${(all / pettings).toFixed(0)} frames ` +
          `(turn ${(s[1]! / pettings).toFixed(0)}, petting ${(s[2]! / pettings).toFixed(0)}, return ` +
          `${(s[3]! / pettings).toFixed(0)}; ${(s[EASING]! / pettings).toFixed(0)} eased): ` +
          `${perPetting.toFixed(2)} bytes a petting\n`,
      );
      expect(perPetting).toBeLessThan(MAX_BYTES_PER_PETTING);
    },
    BENCH_TIMEOUT_MS,
  );

  // The same, a petting of 0.1 s, the twin turned at once: the phase changes come every few frames.
  it(
    "in the pet director's frame, a whole short petting at a time, the selection and the phase changes included",
    () => {
      const rig = new Rig();
      rig.snap = true;
      const pet = director({ cooldown_s: 0, pet_s: 0.1 }, rig);
      const frame = framer(pet, rig);
      const step = (): void => {
        select(pet, rig);
        for (let i = 0; i < 100 && pet.phase !== "idle"; i += 1) frame();
      };
      const perPetting = bytesPerFrame(step, pet.frame);
      expect(rig.seen[REFUSED], "selections refused").toBe(0);
      const pettings = rig.seen[2]! > 0 ? rig.seen[0]! : 0;
      expect(pettings).toBeGreaterThan(0);
      expect(rig.seen[EASING]!, "eased frames").toBeGreaterThan(0);
      process.stderr.write(
        `\npet.select and pet.frame, a short petting of ${((rig.seen[1]! + rig.seen[2]! + rig.seen[3]! + rig.seen[0]!) / pettings).toFixed(0)} frames: ${perPetting.toFixed(2)} bytes a petting\n`,
      );
      expect(perPetting).toBeLessThan(MAX_BYTES_PER_PETTING);
    },
    BENCH_TIMEOUT_MS,
  );

  it(
    "in the pet director's frame, over a run's cut and its fade, a whole cut petting at a time",
    () => {
      const rig = new Rig();
      const pet = director({ cooldown_s: 0 }, rig);
      const frame = framer(pet, rig);
      // The run starts 15 frames into the petting (inside the reach-in, its weight a fraction) and stays on until the
      // director is idle (its fade over, the run on), then ends.
      const step = (): void => {
        rig.running = false;
        select(pet, rig);
        for (let i = 0; i < 300 && pet.phase !== "petting"; i += 1) frame();
        for (let i = 0; i < 15; i += 1) frame();
        rig.running = true;
        for (let i = 0; i < 300 && pet.phase !== "idle"; i += 1) frame();
      };
      const perCut = bytesPerFrame(step, pet.frame);
      expect(rig.seen[REFUSED], "selections refused").toBe(0);
      const cuts = rig.seen[0]!;
      expect(cuts).toBeGreaterThan(0);
      expect(rig.seen[FADING]! / cuts, "fade frames a cut").toBeGreaterThan(5);
      const frames = rig.seen[0]! + rig.seen[1]! + rig.seen[2]! + rig.seen[3]!;
      process.stderr.write(
        `\npet.frame through a cut petting of ${(frames / cuts).toFixed(0)} frames ` +
          `(fade ${(rig.seen[FADING]! / cuts).toFixed(0)}): ${perCut.toFixed(2)} bytes a cut petting\n`,
      );
      expect(perCut).toBeLessThan(MAX_BYTES_PER_PETTING);
    },
    BENCH_TIMEOUT_MS,
  );

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

    it(
      "with the crouch, and on a run's cut (legs off)",
      () => {
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
      },
      BENCH_TIMEOUT_MS,
    );
  });
});
