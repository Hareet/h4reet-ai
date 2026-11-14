// fix-019, N-1 (spec 019; FR-015, Q7; plan.md §2.6): at the controller, the hips bone lowers by exactly the standing
// leg's lift. avatar-gait.test.ts checks that the hips only lower, along the avatar's down, and by more than 1 cm; this
// checks the amount, every frame: the hips' offset from the clip's position is `down · standingLift(that frame's
// gaitFrame().offsets, the rig's shape)`, here `-standingLift(…)` on the parent's y. The shape is the one `findLegRig`
// measures on the same instance before the walk, as the controller's own (the fixture's idle clip moves the hips'
// position only, which the shape, in the hips bone's parent space, doesn't see).
import { Object3D, Vector3 } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { findLegRig, standingLift } from "../../src/room/scene/gait";
import type { LegRig } from "../../src/room/scene/gait";
import type { FigureFrame } from "../../src/room/scene/figure";
import type { Pose } from "../../src/room/walk/movement";
import { avatarClips, avatarGlb } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarPolicy, nightFiles } from "../helpers/room-avatars";

let night: ComposeResult;
beforeAll(() => {
  night = compose(overlay(nightFiles()), avatarPolicy(), { mode: "lenient", drafts: false });
  expect(night.findings).toEqual([]);
});

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;

interface Setup {
  readonly figures: AvatarFigures;
  readonly visitor: Object3D;
}

async function setup(): Promise<Setup> {
  const room = buildRoom(night.scene, { avatar: "woman", label: () => new Object3D(), index: night.index });
  const figures = createAvatarFigures(room, night.scene, { chosen: "woman", signal: () => undefined });
  expect(figures.model("woman", await parsed(avatarGlb({ legs: true }).bytes))).toBe(true);
  const clips = avatarClips();
  for (const role of ["idle", "idle-holding", "take"] as const)
    figures.clip("woman", role, await clipsOf(clips[role].bytes));
  figures.handoffEnded();
  const visitor = room.visitor.children.find((c) => c.name === "avatar") as Object3D;
  return { figures, visitor };
}

const CAMERA: readonly [number, number, number] = [0.4, 1.6, 3.5];
const step = (s: Setup, pose: Pose): void => {
  const f: FigureFrame = { pose, camera: CAMERA, animate: true };
  s.figures.driver.frame(f);
  s.figures.update(16, true, 0);
};
const hipsOf = (root: Object3D): Object3D => root.getObjectByName("mixamorigHips") as Object3D;

describe("the hips' lowering at the controller (FR-015)", () => {
  it("is exactly the standing leg's lift from the same frame's offsets, every frame of a walk and its ease-out", async () => {
    const s = await setup();
    const control = await setup();
    const rig = findLegRig(s.visitor) as LegRig;
    expect(rig).not.toBeNull();
    // The fixture's avatar's down, in the hips bone's parent space, is that space's −y.
    expect(rig.down.distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-12);
    const speed = night.scene.walking.speed_mps;
    let z = 0;
    let most = 0;
    let lowered = 0;
    for (let i = 0; i < 150; i += 1) {
      const walking = i < 120;
      if (walking) z -= speed * 0.016;
      step(s, { x: 0, z, heading: 0, speed: walking ? speed : 0, walking });
      step(control, { x: 0, z: 0, heading: 0, speed: 0, walking: false });
      const { state, offsets } = s.figures.gaitFrame();
      const off = hipsOf(s.visitor).position.clone().sub(hipsOf(control.visitor).position);
      // Once the amplitude is back to 0 the gait is cleared and the offsets aren't written: no lowering at all.
      const lift = state.amp > 0 ? standingLift(offsets, rig.shape) : 0;
      expect(Math.abs(off.y + lift)).toBeLessThan(1e-12);
      expect(Math.abs(off.x)).toBeLessThan(1e-12);
      expect(Math.abs(off.z)).toBeLessThan(1e-12);
      most = Math.max(most, lift);
      if (lift > 1e-6) lowered += 1;
    }
    // Not 0 = 0: the walk lowered the hips by more than a centimetre, on most of its frames.
    expect(most).toBeGreaterThan(0.01);
    expect(lowered).toBeGreaterThan(60);
  });
});
