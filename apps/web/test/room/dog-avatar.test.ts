// T004 (spec 020; FR-001, FR-005, FR-006, FR-008, SC-003; plan.md R-03): the dog in the visitor's figure, in Node, on
// the fixture room with the dog's folder recorded as a likeness and approved, and a fixture without hand bones
// (test/helpers/glb.ts `hands: false`, `legs: true`) in the dog's place.
// Where a case already passes on spec 009's and 019's code, it is a PIN, not a new behaviour: the scale by the rest
// pose's precise bounds (any part above the back counts, so a raised tail is the studio's to keep under the head,
// FR-012, and the fixture's tallest point stands for it), the walk clip, the idle with the slide, the paper left at the
// anchor, the fallback on a model that fails, and the stillness under reduced motion.
import { Box3, Object3D, Quaternion, Vector3 } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { AVATAR_NODE, createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import type { FigureFrame } from "../../src/room/scene/figure";
import type { FigureSignal } from "../../src/room/stage";
import type { Pose } from "../../src/room/walk/movement";
import { avatarGlb, clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, sceneWith, SCENE } from "../helpers/room-avatars";
import { createHash } from "node:crypto";
import { twinPolicy } from "../helpers/room-twin";

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const DOG_HEIGHT = 0.62;
// A quadruped as the fixture makes one: 1.3 m to its highest point (the tail's tip), no hand bone, its leg bones.
const dogBytes = avatarGlb({ height: 1.3, hands: false, legs: true }).bytes;
const walkBytes = clipGlb("walk", { tracks: IDLE_TRACKS, duration: 1 }).bytes;
const idleBytes = clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes;

let night: ComposeResult;
beforeAll(() => {
  const likeness = (e: { likeness: boolean; source: { type: string; id: string } }[]): void => {
    for (const x of e) {
      x.likeness = true;
      x.source = { type: "photo", id: "H-dog-1" };
    }
  };
  const tree = overlay({
    [SCENE]: sceneWith({ twin_stand_in: "man" }),
    ...avatarFolder("man"),
    ...avatarFolder("dog", {
      model: dogBytes,
      clips: { idle: idleBytes, walk: walkBytes, "idle-holding": null, take: null },
      records: likeness,
    }),
  });
  const policy = twinPolicy({
    likeness: [{ id: "A-fx-dog", sha256: sha256(dogBytes), line: "A made-up likeness for the tests." }],
  });
  night = compose(tree, policy, { mode: "lenient", drafts: false });
  expect(night.findings).toEqual([]);
  expect(night.scene.avatars.dog).toBeDefined();
});

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;

interface Setup {
  readonly room: Room3D;
  readonly figures: AvatarFigures;
  readonly signals: FigureSignal[];
}
function setup(): Setup {
  const room = buildRoom(night.scene, { avatar: "dog", label: () => new Object3D(), index: night.index });
  const signals: FigureSignal[] = [];
  return {
    room,
    figures: createAvatarFigures(room, night.scene, { chosen: "dog", signal: (x) => signals.push(x) }),
    signals,
  };
}
async function feed(s: Setup, walk = true): Promise<void> {
  expect(s.figures.model("dog", await parsed(dogBytes))).toBe(true);
  s.figures.clip("dog", "idle", await clipsOf(idleBytes));
  if (walk) s.figures.clip("dog", "walk", await clipsOf(walkBytes));
  s.figures.handoffEnded();
}
const avatar = (s: Setup): Object3D => s.room.visitor.children.find((c) => c.name === AVATAR_NODE) as Object3D;
const CAMERA: readonly [number, number, number] = [0.4, 1.6, 3.5];
const walking = (animate = true): FigureFrame => ({
  pose: { x: 0, z: -1, heading: 0, speed: 0.6, walking: true } satisfies Pose,
  camera: CAMERA,
  animate,
});

describe("the dog's size, floor, and facing (FR-001)", () => {
  it("is scaled by its rest pose's precise bounds to 0.62 m, its lowest point on the floor, facing +z", async () => {
    const s = setup();
    await feed(s);
    // As a frame draws it (avatars.test.ts's worldBox): the whole tree's matrices by updateMatrixWorld, which also
    // refreshes a skinned mesh's bind inverse (updateWorldMatrix doesn't).
    let root: Object3D = s.room.visitor;
    while (root.parent) root = root.parent;
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(avatar(s), true);
    const at = new Vector3().setFromMatrixPosition(s.room.visitor.matrixWorld);
    expect(box.max.y - box.min.y).toBeCloseTo(DOG_HEIGHT, 3);
    expect(box.min.y).toBeCloseTo(at.y, 3);
    const forward = new Vector3(0, 0, 1).applyQuaternion(avatar(s).getWorldQuaternion(new Quaternion()));
    expect(forward.z).toBeCloseTo(1, 3);
    expect(s.figures.shows("visitor")).toBe(true);
  });
});

describe("the dog's walk and idle (FR-005)", () => {
  it("plays walk while walking, and idle when it stops", async () => {
    const s = setup();
    await feed(s);
    s.figures.driver.frame(walking());
    expect(s.figures.playing("visitor")).toBe("walk");
    s.figures.driver.frame({ ...walking(), pose: { x: 0, z: -1, heading: 0, speed: 0, walking: false } });
    expect(s.figures.playing("visitor")).toBe("idle");
  });

  it("plays its idle with the slide where it has no walk clip", async () => {
    const s = setup();
    await feed(s, false);
    s.figures.driver.frame(walking());
    expect(s.figures.playing("visitor")).toBe("idle");
  });

  it("moves no bone under reduced motion, the clip held where it was", async () => {
    const s = setup();
    await feed(s);
    const bones = (): number[] => {
      const out: number[] = [];
      avatar(s).traverse((o) => {
        if ((o as { isBone?: boolean }).isBone) out.push(...o.quaternion.toArray());
      });
      return out;
    };
    const before = bones();
    for (let i = 0; i < 30; i += 1) {
      s.figures.driver.frame(walking(false));
      s.figures.update(16, false, 0);
    }
    expect(bones()).toEqual(before);
  });
});

describe("no hand bone (FR-008)", () => {
  it("leaves the paper at the anchor, throws nothing, and plays the idle through the hand-off", async () => {
    const s = setup();
    expect(s.figures.model("dog", await parsed(dogBytes))).toBe(true);
    s.figures.clip("dog", "idle", await clipsOf(idleBytes));
    expect(s.figures.handOf("visitor")).toBeNull();
    expect(() => {
      s.figures.update(16, true, 0);
      s.figures.showHandoff(1, false);
      expect(s.figures.playing("visitor")).toBe("idle");
      s.figures.update(16, true, 0);
      s.figures.handoffEnded();
    }).not.toThrow();
    expect(s.figures.playing("visitor")).toBe("idle");
    expect(s.room.paper.kept.parent).not.toBe(avatar(s));
    expect(s.room.paper.kept.parent?.name).not.toMatch(/Hand/);
  });
});

describe("a dog model that fails (FR-006, SC-003)", () => {
  it("a model the figures can't place leaves the cut-out", async () => {
    const s = setup();
    // A model with no vertex has no height: place() refuses it.
    expect(s.figures.model("dog", new Object3D())).toBe(false);
    s.figures.missed("dog", null, "failed");
    expect(s.figures.shows("visitor")).toBe(false);
    expect(avatar(s)).toBeUndefined();
  });

  it("a model lost after it showed returns to the cut-out", async () => {
    const s = setup();
    await feed(s);
    expect(s.figures.shows("visitor")).toBe(true);
    s.figures.missed("dog", null, "failed");
    expect(s.figures.shows("visitor")).toBe(false);
    expect(
      s.signals.filter((x) => x.kind === "picture" && x.figure === "visitor" && x.shows === "fallback"),
    ).not.toEqual([]);
  });
});
