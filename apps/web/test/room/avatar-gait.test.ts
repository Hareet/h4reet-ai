// T006 (spec 019; FR-001, FR-005 to FR-009; SC-001, SC-002): the visitor's walking legs, in Node, over the fixture room
// and a fixture avatar with its six leg bones (test/helpers/glb.ts `legs`), as avatar-driver.test.ts sets it up.
import { Object3D, Quaternion } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { ClipRole } from "../../src/choice/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import type { FigureFrame } from "../../src/room/scene/figure";
import type { FigureSignal } from "../../src/room/stage";
import type { Pose } from "../../src/room/walk/movement";
import { avatarClips, avatarGlb, clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarPolicy, nightFiles } from "../helpers/room-avatars";

let night: ComposeResult;
beforeAll(() => {
  night = compose(overlay(nightFiles()), avatarPolicy(), { mode: "lenient", drafts: false });
  expect(night.findings).toEqual([]);
});

const loader = new GLTFLoader();
const CLIPS = avatarClips();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;

interface Setup {
  readonly figures: AvatarFigures;
  readonly visitor: Object3D;
  readonly signals: FigureSignal[];
}

async function setup(legs: boolean, roles: readonly ClipRole[] = ["idle", "idle-holding", "take"]): Promise<Setup> {
  const room = buildRoom(night.scene, { avatar: "woman", label: () => new Object3D(), index: night.index });
  const signals: FigureSignal[] = [];
  const figures = createAvatarFigures(room, night.scene, { chosen: "woman", signal: (x) => signals.push(x) });
  expect(figures.model("woman", await parsed(avatarGlb({ legs }).bytes))).toBe(true);
  for (const role of roles) {
    const bytes = role === "walk" ? clipGlb("walk", { tracks: IDLE_TRACKS }).bytes : CLIPS[role as "idle"].bytes;
    figures.clip("woman", role, await clipsOf(bytes));
  }
  figures.handoffEnded();
  const visitor = room.visitor.children.find((c) => c.name === "avatar") as Object3D;
  return { figures, visitor, signals };
}

const LEGS = ["UpLeg", "Leg", "Foot"].flatMap((p) => ["Left", "Right"].map((s) => `mixamorig${s}${p}`));
const ARMS = ["Spine", "Head", "RightArm", "RightHand", "LeftArm", "LeftHand"].map((n) => `mixamorig${n}`);
const quats = (root: Object3D, names: string[]): Quaternion[] =>
  names.map((n) => (root.getObjectByName(n) as Object3D).quaternion.clone());
const apart = (a: Quaternion[], b: Quaternion[]): number =>
  Math.max(
    ...a.map((q, i) =>
      Math.max(
        Math.abs(q.x - (b[i] as Quaternion).x),
        Math.abs(q.y - (b[i] as Quaternion).y),
        Math.abs(q.z - (b[i] as Quaternion).z),
        Math.abs(q.w - (b[i] as Quaternion).w),
      ),
    ),
  );

const SPEED = (): number => night.scene.walking.speed_mps;
const CAMERA: readonly [number, number, number] = [0.4, 1.6, 3.5];
const frame = (s: Setup, pose: Pose, animate = true): void => {
  const f: FigureFrame = { pose, camera: CAMERA, animate };
  s.figures.driver.frame(f);
};
/** A straight walk from (0, 0) toward −z at the walking speed, `n` frames of 16 ms; `stand` frames then stand. */
function* walk(n: number): Generator<Pose> {
  let z = 0;
  for (let i = 0; i < n; i += 1) {
    z -= SPEED() * 0.016;
    yield { x: 0, z, heading: 0, speed: SPEED(), walking: true };
  }
}
const standing = (z: number): Pose => ({ x: 0, z, heading: 0, speed: 0, walking: false });

describe("the legs on a walking avatar", () => {
  it("move off the clip's pose while it walks and return to it after the ease-out; the arms, spine, and head never differ (FR-005)", async () => {
    const s = await setup(true);
    const control = await setup(true);
    const rest = quats(s.visitor, LEGS);
    let most = 0;
    let z = 0;
    for (const pose of walk(120)) {
      z = pose.z;
      frame(s, pose);
      s.figures.update(16, true, 0);
      frame(control, standing(0));
      control.figures.update(16, true, 0);
      most = Math.max(most, apart(quats(s.visitor, LEGS), rest));
      expect(apart(quats(s.visitor, ARMS), quats(control.visitor, ARMS))).toBe(0);
    }
    expect(most).toBeGreaterThan(0.05);
    for (let i = 0; i < 20; i += 1) {
      frame(s, standing(z));
      s.figures.update(16, true, 0);
    }
    expect(apart(quats(s.visitor, LEGS), rest)).toBeLessThan(1e-9);
  });

  it("is the same on two runs of the same seeded walk (SC-001)", async () => {
    const run = async (): Promise<number[]> => {
      const s = await setup(true);
      const out: number[] = [];
      for (const pose of walk(200)) {
        frame(s, pose);
        s.figures.update(16, true, 0);
        out.push(...quats(s.visitor, LEGS).flatMap((q) => q.toArray()));
      }
      return out;
    };
    expect(await run()).toEqual(await run());
  });

  it("has no gait under reduced motion or paused (animate off), nor at quality level 1 (FR-009)", async () => {
    for (const [animate, level] of [
      [false, 0],
      [true, 1],
    ] as const) {
      const s = await setup(true);
      const rest = quats(s.visitor, LEGS);
      for (const pose of walk(60)) {
        frame(s, pose, animate);
        s.figures.update(16, animate, level);
        expect(apart(quats(s.visitor, LEGS), rest)).toBe(0);
      }
    }
  });

  it("clears at once when motion stops mid-stride, leaving no residue", async () => {
    const s = await setup(true);
    const rest = quats(s.visitor, LEGS);
    for (const pose of walk(30)) {
      frame(s, pose);
      s.figures.update(16, true, 0);
    }
    expect(apart(quats(s.visitor, LEGS), rest)).toBeGreaterThan(0.01);
    s.figures.update(16, false, 0);
    expect(apart(quats(s.visitor, LEGS), rest)).toBeLessThan(1e-9);
  });

  it("has no gait while take plays", async () => {
    const s = await setup(true);
    const rest = quats(s.visitor, LEGS);
    s.figures.update(16, true, 0);
    s.figures.showHandoff(1, false);
    expect(s.figures.playing("visitor")).toBe("take");
    for (const pose of walk(40)) {
      frame(s, pose);
      s.figures.update(16, true, 0);
      expect(apart(quats(s.visitor, LEGS), rest)).toBe(0);
    }
  });

  it("leaves no residue after rest() or a fallback mid-walk (FR-006)", async () => {
    const s = await setup(true);
    const rest = quats(s.visitor, LEGS);
    for (const pose of walk(30)) {
      frame(s, pose);
      s.figures.update(16, true, 0);
    }
    s.figures.driver.rest();
    expect(apart(quats(s.visitor, LEGS), rest)).toBeLessThan(1e-9);
    for (const pose of walk(30)) {
      frame(s, pose);
      s.figures.update(16, true, 0);
    }
    s.figures.missed("woman", null, "failed");
    expect(apart(quats(s.visitor, LEGS), rest)).toBeLessThan(1e-9);
  });
});

describe("the models the gait doesn't fit", () => {
  it("slides, with one `gait` signal, on a model without leg bones (FR-008)", async () => {
    const s = await setup(false);
    for (const pose of walk(40)) {
      frame(s, pose);
      s.figures.update(16, true, 0);
    }
    expect(s.figures.playing("visitor")).toBe("idle-holding");
    expect(s.signals.filter((x) => x.kind === "gait")).toEqual([
      { kind: "gait", figure: "visitor", state: "unavailable" },
    ]);
  });

  it("plays a loaded walk clip at the figure's speed, with no gait (FR-007)", async () => {
    const s = await setup(true, ["idle", "idle-holding", "take", "walk"]);
    const rest = quats(s.visitor, LEGS);
    const scale = (share: number): number => {
      const pose = { x: 0, z: -1, heading: 0, speed: SPEED() * share, walking: true };
      frame(s, pose);
      s.figures.update(16, true, 0);
      return s.figures.clipScale("visitor") as number;
    };
    expect(scale(1)).toBeCloseTo(1, 9);
    expect(scale(0.1)).toBeCloseTo(0.5, 9);
    expect(scale(5)).toBeCloseTo(1.5, 9);
    expect(s.figures.playing("visitor")).toBe("walk");
    expect(apart(quats(s.visitor, LEGS), rest)).toBe(0);
  });
});
