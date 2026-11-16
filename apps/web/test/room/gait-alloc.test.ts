// T017 (spec 019; FR-011, SC-007; plan.md §2.7): a frame's gait makes no object. The pure part: with an `out`,
// `advance` and `legOffsets` write into it and return it, the same objects frame after frame, with the values the
// fresh-object calls give. The controller: its gait state, offsets, and last place are each made once and written in
// place through a walk, its stops, a rest, and a model swap's fallback. The applier: `applyGait` and `clearGait` hold
// no array literal. (The heap measure plan §2.7 first named couldn't tell an object from V8's boxed numbers inside
// three's setters, which move with its inlining; plan §2.7 records why the identity stands alone.)
import { Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { advance, applyGait, clearGait, legOffsets } from "../../src/room/scene/gait";
import type { GaitOffsets } from "../../src/room/scene/gait";
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

describe("the applier", () => {
  it("holds no array literal in applyGait or clearGait, which run every frame", () => {
    for (const f of [applyGait, clearGait]) expect(f.toString()).not.toContain("[");
  });
});

describe("the controller's gait objects (SC-007)", () => {
  let night: ComposeResult;
  beforeAll(() => {
    night = compose(overlay(nightFiles()), avatarPolicy(), { mode: "lenient", drafts: false });
    expect(night.findings).toEqual([]);
  });

  async function setup(): Promise<AvatarFigures> {
    const room = buildRoom(night.scene, { avatar: "woman", label: () => new Object3D(), index: night.index });
    const figures = createAvatarFigures(room, night.scene, { chosen: "woman", signal: () => undefined });
    expect(figures.model("woman", await parsed(avatarGlb({ legs: true }).bytes))).toBe(true);
    const clips = avatarClips();
    for (const role of ["idle", "idle-holding", "take"] as const)
      figures.clip("woman", role, await clipsOf(clips[role].bytes));
    figures.handoffEnded();
    return figures;
  }

  it("keeps the same state, offsets, and last place through a walk, its stops, a rest, and a fallback, writing them in place", async () => {
    const figures = await setup();
    const first = figures.gaitFrame();
    const { state, offsets, last } = first;
    const { left, right } = offsets;
    const same = (): void => {
      const now = figures.gaitFrame();
      expect(now.state).toBe(state);
      expect(now.offsets).toBe(offsets);
      expect(now.offsets.left).toBe(left);
      expect(now.offsets.right).toBe(right);
      expect(now.last).toBe(last);
    };
    const speed = night.scene.walking.speed_mps;
    const pose = { x: 0, z: 0, heading: 0, speed, walking: true };
    const frame: FigureFrame = { pose: pose as Pose, camera: [0.4, 1.6, 3.5], animate: true };
    let most = 0;
    for (let i = 0; i < 600; i += 1) {
      // A walk round a small circle, standing still for a while every 200 frames.
      const walking = i % 200 < 150;
      const turn = (2 * Math.PI * i) / 300;
      pose.walking = walking;
      pose.speed = walking ? speed : 0;
      if (walking) [pose.x, pose.z] = [0.6 * Math.sin(turn), 0.6 * Math.cos(turn)];
      figures.driver.frame(frame);
      figures.update(16, true, 0);
      most = Math.max(most, Math.abs(offsets.left.hip));
      same();
      if (i === 300) {
        figures.driver.rest();
        expect(last.has).toBe(false);
        same();
      }
    }
    // The objects carried the walk: the last place, the phase, and the legs' angles were written into them.
    expect(last.has).toBe(true);
    expect(last.x).toBeCloseTo(pose.x, 12);
    expect(state.phase).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(0.1);
    figures.missed("woman", null, "failed");
    same();
    expect(state.amp).toBe(0);
  });
});
