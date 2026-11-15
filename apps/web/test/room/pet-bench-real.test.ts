// T016's real paths (spec 026; FR-027, SC-007; plan.md R-04): the pet director over the real adapters
// (pet-adapters.ts) and spec 025's real director (chase.ts), whose frame runs in the step: `twinFacing()` reads its
// runner's facing and `faceTwin` turns it at 180°/s, as in the page; the controller is a fake of its shape whose answers
// are constants, as the real one's are between pictures. Whole pettings, from the selection to idle, under one object
// a petting, measured as the page's Q259 answer says, on V8's optimized code after the warm-up (../helpers/bench.ts).
// impl3-026 marked this case `it.fails` in pet-bench.test.ts, a known gap (246 bytes a petting in that file's full run,
// 4,324 alone). rework3-026 (the page's Q284) made it a plain `it`, and moved it to this file: in pet-bench.test.ts the
// fakes' directors ran first, and their call targets, in the feedback V8 shares among all the closures `createPet`
// makes, were inlined into this director's code; the measure's `gc()` collected them, V8 deoptimized `frame` and
// `select` mid-measure ("embedded weak objects cleared"), and `select` stayed unoptimized (466 to 2,326 bytes a
// petting a run, measured). The page has one director: a file of its own runs in a process of its own, as the page's.
// rework4-026 (rv-impl3-026's B-1, step 1): the warm-up also waits for the functions the review's scratch breakdown
// named, `adapters.twin`, `adapters.chase.faceTwin`, and spec 025's `real.faceTwin`, with `adapters.chase.twinFacing`,
// which the director reads in `twinHeading`'s place since rework3-026; `twinHeading` is counted, and isn't called on
// this path. The frame's time is checked before the bytes, so a byte failure doesn't hide it (N-2).
import { Group } from "three";
import { describe, expect, it } from "vitest";

import { createChase } from "../../src/room/scene/chase";
import type { Chase } from "../../src/room/scene/chase";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";
import { createPet } from "../../src/room/scene/pet";
import type { PetMotion } from "../../src/room/scene/pet";
import { createPetAdapters } from "../../src/room/scene/pet-adapters";
import type { PetAvatars } from "../../src/room/scene/pet-adapters";
import type { ReachRig } from "../../src/room/scene/pet-reach";
import { BENCH_TIMEOUT_MS, bytesPerCall, MAX_BYTES_PER_PETTING, MAX_MS_PER_FRAME, msPerCall } from "../helpers/bench";
import type { Hot } from "../helpers/bench";

const TWIN_HOME = { x: 0.66, z: 0.469 };
const DOG_HOME = { x: 0.3, z: 0.45 };
const MOTION: PetMotion = { animate: true, paused: false, level: 0, live: true };

describe("no allocation per petting over the real adapters (FR-027, SC-007; Q284)", () => {
  it(
    "over the real adapters and spec 025's real director: whole pettings, and the frame's time",
    () => {
      const twinNode = new Group();
      twinNode.position.set(TWIN_HOME.x, 0, TWIN_HOME.z);
      const dogNode = new Group();
      dogNode.position.set(DOG_HOME.x, 0, DOG_HOME.z);
      const root = new Group();
      root.add(twinNode, dogNode);
      root.updateMatrixWorld(true);
      const rigStub = {} as ReachRig;
      const avatars: PetAvatars = {
        wants: { twin: "twin", visitor: "woman", dog: "dog" },
        shows: () => true,
        pictureOf: (id) => (id === "twin" ? twinNode : id === "dog" ? dogNode : null),
        clipOf: () => null,
        twinState: () => "present",
        reachRigOf: () => rigStub,
      };
      let chase: Chase | null = null;
      const adapters = createPetAdapters({ avatars, chase: () => chase, hasDog: true });
      const twinHome = adapters.twin()?.home;
      const dogHome = adapters.dog()?.home;
      if (!twinHome || !dogHome) throw new Error("no homes");
      const OPEN = { x0: -2, x1: 2, z0: -2, z1: 2 };
      const real = createChase({
        floor: {
          radius: 0.12,
          feetY: 0,
          height: 1.7,
          shell: OPEN,
          bounds: OPEN,
          obstacles: [],
          start: { x: 0, z: 1.8 },
        },
        config: CHASE_DEFAULTS,
        walkMps: 1,
        figures: { twin: { x: twinHome.x, z: twinHome.z, heading: twinHome.heading }, dog: { ...dogHome } },
      });
      chase = real;
      // twinHeading, counted: the director reads twinFacing where the adapter gives it (rework3-026), so it's off this
      // path; a call would be a fraction returned across a call.
      const headingCalls = new Int32Array(1);
      const twinHeading = adapters.chase.twinHeading.bind(adapters.chase);
      adapters.chase.twinHeading = () => {
        headingCalls[0] = (headingCalls[0] as number) + 1;
        return twinHeading();
      };
      if (!adapters.chase.twinFacing) throw new Error("the adapter gives no twinFacing");
      const ms = new Float64Array(1);
      const pet = createPet({
        config: { cooldown_s: 0 },
        clock: { now: () => ms[0] as number },
        motion: () => MOTION,
        twin: adapters.twin,
        dog: adapters.dog,
        chase: adapters.chase,
      });
      const gone = { present: false, x: 0, z: 1.8 };
      const MOVE = { animate: true, paused: false, level: 0 };
      const seen = new Int32Array(4);
      const frame = (): void => {
        ms[0] = (ms[0] as number) + 1000 / 60;
        pet.frame(1 / 60);
        real.frame(gone, 1 / 60, MOVE);
        seen[0] = (seen[0] as number) + 1;
        if (pet.phase === "turn") seen[1] = (seen[1] as number) + 1;
      };
      const step = (): void => {
        if (!pet.select("dog")) seen[2] = (seen[2] as number) + 1;
        seen[3] = (seen[3] as number) + 1;
        for (let i = 0; i < 1000 && pet.phase !== "idle"; i += 1) frame();
      };
      const hot: Hot[] = [
        pet.frame,
        [pet.select, step],
        real.frame,
        adapters.twin,
        real.faceTwin,
        adapters.chase.faceTwin,
        adapters.chase.twinFacing,
      ];
      const perPetting = bytesPerCall(step, hot, 2_000);
      expect(seen[2], "selections refused").toBe(0);
      const msPetting = msPerCall(step, hot, 200);
      const framesPerPetting = (seen[0] as number) / ((seen[3] as number) || 1);
      const msFrame = msPetting / framesPerPetting;
      process.stderr.write(
        `\npet.select and pet.frame over the real adapters, with chase.frame: ${perPetting.toFixed(2)} bytes a ` +
          `petting of ${framesPerPetting.toFixed(0)} frames; ${msFrame.toFixed(4)} ms a frame\n`,
      );
      expect(headingCalls[0], "twinHeading's calls on the real path").toBe(0);
      expect(msFrame).toBeLessThan(MAX_MS_PER_FRAME);
      expect(perPetting).toBeLessThan(MAX_BYTES_PER_PETTING);
    },
    BENCH_TIMEOUT_MS,
  );
});
