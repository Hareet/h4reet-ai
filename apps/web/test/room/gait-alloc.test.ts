// T017 (spec 019; FR-011, SC-007; plan.md §2.7): a frame's gait allocates nothing. First the identity: with an `out`,
// `advance` and `legOffsets` write into it and return it, the same objects frame after frame, with the values the
// fresh-object calls give. Then a measure: the young heap's growth a frame, in windows no collection ran in, over the
// gait's path, against a control that allocates one object a frame, so the probe is seen to see allocation; and,
// through the controller, the frame's path with the gait on against the same path with a model without leg bones.
import { PerformanceObserver } from "node:perf_hooks";

import { Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { advance, applyGait, clearGait, findLegRig, legOffsets, standingLift } from "../../src/room/scene/gait";
import type { GaitOffsets, LegRig } from "../../src/room/scene/gait";
import type { FigureFrame } from "../../src/room/scene/figure";
import type { Pose } from "../../src/room/walk/movement";
import { avatarClips, avatarGlb } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarPolicy, nightFiles } from "../helpers/room-avatars";

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;

const offsetsOut = (): GaitOffsets => ({ left: { hip: 0, knee: 0, ankle: 0 }, right: { hip: 0, knee: 0, ankle: 0 } });

/**
 * The bytes the young heap grows by per frame of `run(n)`, in a window no collection ran in: Node's `gc` performance
 * entries, which arrive on a later turn, say whether one did, and a window that had one is thrown away and run again.
 * Allocation-free code reads about 0; one small object a frame reads 16 or more.
 */
async function bytesPerFrame(run: (n: number) => void, n: number): Promise<number> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let collections = 0;
    const observer = new PerformanceObserver((list) => {
      collections += list.getEntries().length;
    });
    observer.observe({ entryTypes: ["gc"] });
    const before = process.memoryUsage().heapUsed;
    run(n);
    const after = process.memoryUsage().heapUsed;
    await new Promise((resolve) => setTimeout(resolve, 20));
    observer.disconnect();
    if (collections === 0) return (after - before) / n;
  }
  throw new Error("no window without a collection in 12 tries");
}

describe("the pure gait with an out (FR-011)", () => {
  it("writes advance's phase and amplitude into the out it is given, and returns it", () => {
    const out = { phase: 0, amp: 0 };
    let fresh = { phase: 0, amp: 0 };
    for (let i = 0; i < 500; i += 1) {
      const dist = 0.01 * ((i * 7) % 5);
      const on = i % 97 < 80;
      fresh = advance(fresh, dist, 0.8, 0.016, on, 1.12);
      expect(advance(out, dist, 0.8, 0.016, on, 1.12, out)).toBe(out);
      expect(out).toEqual(fresh);
    }
  });

  it("writes legOffsets' angles into the out's own left and right, the same objects frame after frame", () => {
    const out = offsetsOut();
    const { left, right } = out;
    for (let i = 0; i <= 200; i += 1) {
      const [phase, amp] = [i / 200, (i % 11) / 10];
      expect(legOffsets(phase, amp, out)).toBe(out);
      expect(out.left).toBe(left);
      expect(out.right).toBe(right);
      expect(out).toEqual(legOffsets(phase, amp));
    }
  });
});

describe("a frame's gait, measured (SC-007)", () => {
  let rig: LegRig;
  beforeAll(async () => {
    rig = findLegRig(await parsed(avatarGlb({ legs: true }).bytes)) as LegRig;
    expect(rig).not.toBeNull();
  });

  let kept: unknown = null;
  /** The gait's frame path, `n` frames: advance → legOffsets → standingLift → applyGait, clearGait every tenth. */
  function path(n: number, control: boolean): void {
    const state = { phase: 0, amp: 0 };
    const offsets = offsetsOut();
    for (let i = 0; i < n; i += 1) {
      advance(state, 0.016, 1, 0.016, true, 1.12, state);
      legOffsets(state.phase, state.amp, offsets);
      applyGait(rig, offsets, standingLift(offsets, rig.shape));
      if (i % 10 === 9) clearGait(rig);
      // The control: one object a frame, kept past the frame, so it can't be optimized away.
      if (control) kept = { i };
    }
  }

  it("grows the heap by under 2 bytes a frame, where the control that makes one object a frame grows it by 16 or more", async () => {
    // Warmed first, so the measure reads the optimized code a long walk runs.
    path(200_000, false);
    path(200_000, true);
    const gait = await bytesPerFrame((n) => path(n, false), 5_000);
    const control = await bytesPerFrame((n) => path(n, true), 5_000);
    expect(kept).not.toBeNull();
    expect(gait).toBeLessThan(2);
    expect(control).toBeGreaterThanOrEqual(16);
  });
});

describe("the controller's frame with the gait on (SC-007)", () => {
  let night: ComposeResult;
  beforeAll(() => {
    night = compose(overlay(nightFiles()), avatarPolicy(), { mode: "lenient", drafts: false });
    expect(night.findings).toEqual([]);
  });

  async function setup(legs: boolean): Promise<AvatarFigures> {
    const room = buildRoom(night.scene, { avatar: "woman", label: () => new Object3D(), index: night.index });
    const figures = createAvatarFigures(room, night.scene, { chosen: "woman", signal: () => undefined });
    expect(figures.model("woman", await parsed(avatarGlb({ legs }).bytes))).toBe(true);
    const clips = avatarClips();
    for (const role of ["idle", "idle-holding", "take"] as const)
      figures.clip("woman", role, await clipsOf(clips[role].bytes));
    figures.handoffEnded();
    return figures;
  }

  /** `n` frames of a walk at the walking speed round a small circle: the driver's frame, then update. */
  function walkFrames(figures: AvatarFigures, n: number): void {
    const speed = night.scene.walking.speed_mps;
    const pose = { x: 0, z: 0, heading: 0, speed, walking: true };
    const frame: FigureFrame = { pose: pose as Pose, camera: [0.4, 1.6, 3.5], animate: true };
    for (let i = 0; i < n; i += 1) {
      const turn = (2 * Math.PI * (i % 600)) / 600;
      pose.x = 0.6 * Math.sin(turn);
      pose.z = 0.6 * Math.cos(turn);
      figures.driver.frame(frame);
      figures.update(16, true, 0);
    }
  }

  it("grows the heap by no more a frame with the gait on than with a model without leg bones, within 4 bytes", async () => {
    const [on, off] = [await setup(true), await setup(false)];
    walkFrames(on, 20_000);
    walkFrames(off, 20_000);
    const gaitOn = await bytesPerFrame((n) => walkFrames(on, n), 1_000);
    const gaitOff = await bytesPerFrame((n) => walkFrames(off, n), 1_000);
    expect(gaitOn - gaitOff).toBeLessThan(4);
  });
});
