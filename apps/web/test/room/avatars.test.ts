// T011 (spec 009; FR-002, FR-003, FR-008, FR-015 to FR-018, FR-025 to FR-027; plan.md R-04 to R-09, R-17; SC-001,
// SC-005): src/room/scene/avatars.ts in Node, with three's objects and no renderer, over the fixture set's room
// (test/helpers/room-fixtures.ts) composed with the woman's and the man's folders (test/helpers/room-avatars.ts), each
// file parsed by three's GLTFLoader from the GLBs test/helpers/glb.ts makes, as the room's loader parses them.
// - The picture: an avatar instance in its figure's picture group, named `avatar`, once its model and idle are ready,
//   the fallback's meshes hidden, and back on reset; a failure keeps the fallback; the boxes the camera and the pick
//   areas read are the part's, so nothing a swap does moves them.
// - The placement: its origin at the placement, its lowest point on the floor, its height its target (the woman's
//   1.58 m, the twin's catalog 1.75 m), facing as the placement turns it; a model in centimetres placed as one in
//   metres; a degenerate height refused.
// - Two instances of one avatar, each with its own skeleton, sharing geometry and materials.
// - The clips: the idle loops while the motion store animates; while it doesn't, the first frame holds and a change is
//   a cut; a failing idle leaves the rest pose; at quality 1 or more only the twin's mixer advances; a clip binds across
//   three's name sanitizing (`mixamorig:Hips` loads as `mixamorigHips`).
// - The holding hand from the clips (the right on a tie), each hand's motion counting the bones under it, its fingers,
//   as the Author amended FR-018 on 2026-11-09 ("Count the fingers"); the nearer hand with no "idle-holding", none with
//   no hand bone; the kept paper in it after the hand-off, moving with it.
import { Box3, Object3D, PropertyBinding, Quaternion, Vector3 } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { AVATAR_SHAPES } from "../../src/choice/avatars";
import type { AvatarId, ClipRole } from "../../src/choice/avatars";
import type { RoomScene } from "../../src/room/compose/bundle";
import { buildRoom, frameCamera, framedBoxes } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import * as avatarsModule from "../../src/room/scene/avatars";
import { AVATAR_NODE, CROSSFADE_S, createAvatarFigures } from "../../src/room/scene/avatars";
import { gripMatrix } from "../../src/room/scene/grip";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import type { FigureSignal } from "../../src/room/stage";
import { PerspectiveCamera } from "three";
import {
  AVATAR_BONES,
  avatarClips,
  avatarGlb,
  clipGlb,
  fingerTracks,
  holdingTracks,
  IDLE_TRACKS,
} from "../helpers/glb";
import type { AvatarGlbOptions, ClipTrack } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarPolicy, nightFiles } from "../helpers/room-avatars";

/** The fixture set with the night's two folders, composed as a release build composes it. */
let night: ComposeResult;
beforeAll(() => {
  night = compose(overlay(nightFiles()), avatarPolicy(), { mode: "lenient", drafts: false });
  expect(night.findings).toEqual([]);
});

const loader = new GLTFLoader();
/** A GLB's default scene, parsed as the room's loader parses one. */
async function parsed(bytes: Uint8Array): Promise<Object3D> {
  return (await loader.parseAsync(bytes.slice().buffer, "")).scene;
}
async function clipsOf(bytes: Uint8Array): Promise<AnimationClip[]> {
  return (await loader.parseAsync(bytes.slice().buffer, "")).animations;
}

const CLIPS = avatarClips();
const label = (): Object3D => new Object3D();

interface Setup {
  readonly part: RoomScene;
  readonly room: Room3D;
  readonly figures: AvatarFigures;
  readonly signals: FigureSignal[];
}

/** The fixture room with the visitor's chosen avatar, its figures' controllers, and their signals. */
function setup(chosen: AvatarId = "woman", part: RoomScene = night.scene): Setup {
  const room = buildRoom(part, { avatar: chosen, label, index: night.index });
  const signals: FigureSignal[] = [];
  const figures = createAvatarFigures(room, part, { chosen, signal: (s) => signals.push(s) });
  return { part, room, figures, signals };
}

/** Gives an avatar its model and the clips of `roles`, each parsed from its GLB. */
async function feed(
  s: Setup,
  avatar: AvatarId,
  o: {
    model?: AvatarGlbOptions;
    roles?: readonly ClipRole[];
    tracks?: Partial<Record<ClipRole, readonly ClipTrack[]>>;
  } = {},
): Promise<void> {
  expect(s.figures.model(avatar, await parsed(avatarGlb(o.model).bytes))).toBe(true);
  for (const role of o.roles ?? (["idle", "idle-holding", "take"] as const)) {
    const tracks = o.tracks?.[role];
    // The clips in the model's own units, as the studio exports a set.
    const clips = o.model?.unit === undefined ? CLIPS : avatarClips({ unit: o.model.unit });
    const bytes =
      tracks !== undefined
        ? clipGlb(role, { tracks, unit: o.model?.unit ?? 1 }).bytes
        : (role === "walk" || role === "run" ? clips.idle : clips[role]).bytes;
    s.figures.clip(avatar, role, await clipsOf(bytes));
  }
}

const groupOf = (s: Setup, figure: "twin" | "visitor"): Object3D => (figure === "twin" ? s.room.twin : s.room.visitor);
const avatarIn = (s: Setup, figure: "twin" | "visitor"): Object3D | undefined =>
  groupOf(s, figure).children.find((c) => c.name === AVATAR_NODE);
/** An object's world box with its skinned vertices, as a frame draws them: the whole tree's matrices updated by
 *  updateMatrixWorld, which also refreshes a skinned mesh's bind inverse (updateWorldMatrix doesn't). */
const worldBox = (o: Object3D): Box3 => {
  let root = o;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(o, true);
};
const bone = (root: Object3D, name: string): Object3D => {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};
const worldOf = (o: Object3D): Vector3 => {
  o.updateWorldMatrix(true, false);
  return new Vector3().setFromMatrixPosition(o.matrixWorld);
};

describe("the picture (FR-002, FR-008, FR-011; R-04)", () => {
  it("puts the avatar in its figure's picture group once its model and idle are ready, the fallback hidden", async () => {
    const s = setup("woman");
    expect(s.figures.wants).toEqual({ twin: "man", visitor: "woman", dog: null });
    expect(s.figures.model("woman", await parsed(avatarGlb().bytes))).toBe(true);
    // The model alone isn't ready while its idle is on its way: it never shows its rest pose for a frame.
    expect(avatarIn(s, "visitor")).toBeUndefined();
    expect(s.figures.shows("visitor")).toBe(false);
    s.figures.clip("woman", "idle", await clipsOf(CLIPS.idle.bytes));
    expect(avatarIn(s, "visitor")).toBeDefined();
    expect(s.figures.shows("visitor")).toBe(true);
    for (const child of s.room.visitor.children) expect(child.visible, child.name).toBe(child.name === AVATAR_NODE);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "visitor", shows: "avatar", why: null });
  });

  it("brings the fallback straight back on reset, with nothing to rebuild", async () => {
    const s = setup("woman");
    const fallback = [...s.room.visitor.children];
    await feed(s, "woman");
    s.figures.reset();
    expect(avatarIn(s, "visitor")).toBeUndefined();
    expect(s.room.visitor.children).toEqual(fallback);
    for (const child of fallback) expect(child.visible).toBe(true);
    expect(s.figures.shows("visitor")).toBe(false);
  });

  it("keeps the fallback where the part bundles no avatar for a figure, or its model fails", async () => {
    // The dog has no files: its flat shape stays, and the frame log says why.
    const s = setup("dog");
    expect(s.figures.wants).toEqual({ twin: "man", visitor: null, dog: null });
    expect(s.signals).toContainEqual({ kind: "picture", figure: "visitor", shows: "fallback", why: "no-file" });
    s.figures.missed("man", null, "failed");
    expect(s.figures.shows("twin")).toBe(false);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "twin", shows: "fallback", why: "failed" });
    for (const child of s.room.twin.children) expect(child.visible).toBe(true);
  });

  it("moves neither the camera nor the pick areas: they read the part's boxes, never an avatar's geometry", async () => {
    const s = setup("woman");
    const boxes = JSON.stringify(framedBoxes(s.part));
    const camera = JSON.stringify(frameCamera(new PerspectiveCamera(), 16 / 9, framedBoxes(s.part)));
    await feed(s, "woman");
    await feed(s, "man");
    expect(JSON.stringify(framedBoxes(s.part))).toBe(boxes);
    expect(JSON.stringify(frameCamera(new PerspectiveCamera(), 16 / 9, framedBoxes(s.part)))).toBe(camera);
  });
});

describe("the placement (FR-016, FR-017; R-05; SC-001)", () => {
  const expectPlaced = (s: Setup, figure: "twin" | "visitor", height: number): void => {
    const avatar = avatarIn(s, figure);
    if (!avatar) throw new Error(`no avatar in the ${figure}'s figure`);
    const box = worldBox(avatar);
    const placement = groupOf(s, figure).parent as Object3D;
    const at = worldOf(placement);
    expect(Math.abs(box.min.y - at.y), "the lowest point on the floor").toBeLessThan(0.005);
    expect(Math.abs(box.max.y - box.min.y - height) / height, "the height").toBeLessThan(0.01);
    const origin = worldOf(avatar);
    expect(Math.hypot(origin.x - at.x, origin.z - at.z), "the origin at the placement").toBeLessThan(0.005);
    // Facing: the avatar's +z in the world, against the placement's.
    const facing = (o: Object3D): Vector3 =>
      new Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new Quaternion())).setY(0).normalize();
    const angle = (facing(avatar).angleTo(facing(placement)) * 180) / Math.PI;
    expect(angle, "the facing").toBeLessThan(1);
  };

  it("stands the visitor's avatar at its placement, at the room's height for it, and the twin's at its catalog's", async () => {
    const s = setup("woman");
    await feed(s, "woman", { model: { height: 1.7 } });
    await feed(s, "man", { model: { height: 1.9 } });
    expectPlaced(s, "visitor", AVATAR_SHAPES.woman.height);
    expectPlaced(s, "twin", s.part.figures.twin_height);
  });

  it("places a model exported in centimetres as one in metres", async () => {
    const s = setup("woman");
    await feed(s, "woman", { model: { unit: 100 } });
    expectPlaced(s, "visitor", AVATAR_SHAPES.woman.height);
  });

  it("refuses a degenerate height as a failed parse: the fallback stays, and the frame log says why", async () => {
    const s = setup("woman");
    expect(s.figures.model("woman", await parsed(avatarGlb({ height: 0.001 }).bytes))).toBe(false);
    s.figures.clip("woman", "idle", await clipsOf(CLIPS.idle.bytes));
    expect(avatarIn(s, "visitor")).toBeUndefined();
    expect(s.signals).toContainEqual({ kind: "picture", figure: "visitor", shows: "fallback", why: "degenerate" });
  });
});

describe("two instances of one avatar (FR-015; R-06)", () => {
  it("gives each figure its own skeleton and clip, sharing geometry and materials, when the visitor chooses the stand-in", async () => {
    const s = setup("man");
    expect(s.figures.wants).toEqual({ twin: "man", visitor: "man", dog: null });
    await feed(s, "man");
    const [twin, visitor] = [avatarIn(s, "twin"), avatarIn(s, "visitor")];
    if (!twin || !visitor) throw new Error("both figures show the man");
    expect(bone(twin, "mixamorigHips")).not.toBe(bone(visitor, "mixamorigHips"));
    const mesh = (o: Object3D) => o.getObjectByName("fx-body") as unknown as { geometry: unknown; material: unknown };
    expect(mesh(twin).geometry).toBe(mesh(visitor).geometry);
    expect(mesh(twin).material).toBe(mesh(visitor).material);
    // The twin plays its idle, the visitor, holding the paper after the hand-off, its "idle-holding".
    s.figures.handoffEnded();
    expect([s.figures.playing("twin"), s.figures.playing("visitor")]).toEqual(["idle", "idle-holding"]);
  });
});

describe("the clips (FR-003, FR-025 to FR-027; R-07, R-17; SC-005)", () => {
  const hipsY = (s: Setup, figure: "twin" | "visitor"): number =>
    bone(avatarIn(s, figure) as Object3D, "mixamorigHips").position.y;

  it("loops the idle while the motion store animates, binding across three's name sanitizing", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    expect(s.figures.playing("visitor")).toBe("idle");
    const rest = hipsY(s, "visitor");
    s.figures.update(500, true, 0);
    // The idle's hips rise from 0.9 to 0.91 over its second: halfway, 0.905.
    expect(hipsY(s, "visitor")).toBeCloseTo(0.905, 4);
    expect(hipsY(s, "visitor")).not.toBeCloseTo(rest, 4);
    s.figures.update(600, true, 0);
    // Looped: 1.1 s is 0.1 s into the next pass.
    expect(hipsY(s, "visitor")).toBeCloseTo(0.901, 4);
  });

  it("holds the first frame while the motion store doesn't animate, and a change of clip is a cut", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    s.figures.update(400, false, 0);
    expect(hipsY(s, "visitor")).toBeCloseTo(0.9, 6);
    // The hand-off's end turns the visitor to "idle-holding" at once, with no crossfade, its first frame showing.
    s.figures.handoffEnded();
    expect(s.figures.playing("visitor")).toBe("idle-holding");
    s.figures.update(400, false, 0);
    const hand = bone(avatarIn(s, "visitor") as Object3D, "mixamorigRightHand");
    expect(hand.position.toArray().map((v) => Math.round(v * 1e4) / 1e4)).toEqual([-0.02, -0.3, 0.22]);
  });

  it("crossfades a change of clip over at most 0.25 s while the motion store animates", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    s.figures.update(100, true, 0);
    s.figures.handoffEnded();
    const hand = (): Vector3 => bone(avatarIn(s, "visitor") as Object3D, "mixamorigRightHand").position.clone();
    s.figures.update((CROSSFADE_S * 1000) / 2, true, 0);
    const midway = hand();
    // Halfway through the crossfade the hand is between its rest and its holding place.
    expect(midway.z).toBeGreaterThan(0.01);
    expect(midway.z).toBeLessThan(0.21);
    s.figures.update(CROSSFADE_S * 1000, true, 0);
    expect(hand().z).toBeCloseTo(0.22, 3);
  });

  it("leaves the rest pose standing still when the idle fails, and plays the idle in a missing clip's place", async () => {
    const s = setup("woman");
    expect(s.figures.model("woman", await parsed(avatarGlb().bytes))).toBe(true);
    s.figures.missed("woman", "idle", "failed");
    expect(avatarIn(s, "visitor")).toBeDefined();
    expect(s.figures.playing("visitor")).toBeNull();
    s.figures.update(500, true, 0);
    expect(hipsY(s, "visitor")).toBeCloseTo(0.9, 6);
    // With an idle but no "idle-holding", the idle plays while the visitor holds the paper.
    const t = setup("woman");
    await feed(t, "woman", { roles: ["idle"] });
    t.figures.missed("woman", "idle-holding", "failed");
    t.figures.handoffEnded();
    expect(t.figures.playing("visitor")).toBe("idle");
  });

  it("advances only the twin's mixer at quality 1 or more, the visitor holding its frame", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    await feed(s, "man");
    // After the hand-off: the twin in its idle, which moves its hips; the visitor in "idle-holding", which moves its
    // holding hand (Phase 2 has the twin hold the paper in "idle-holding" before it).
    s.figures.handoffEnded();
    const hand = (): number => bone(avatarIn(s, "visitor") as Object3D, "mixamorigRightHand").position.y;
    s.figures.update(250, true, 0);
    const [twin, visitor] = [hipsY(s, "twin"), hand()];
    s.figures.update(250, true, 1);
    expect(hipsY(s, "twin")).not.toBeCloseTo(twin, 6);
    expect(hand()).toBeCloseTo(visitor, 6);
  });
});

describe("the holding hand and the kept paper (FR-018; R-08, R-09)", () => {
  it("finds the hand idle-holding moves farther, the right one on a tie", async () => {
    for (const [hand, expected] of [
      ["right", "mixamorigRightHand"],
      ["left", "mixamorigLeftHand"],
    ] as const) {
      const s = setup("woman");
      await feed(s, "woman", { tracks: { "idle-holding": holdingTracks(hand) } });
      expect(s.figures.handOf("visitor")?.name).toBe(expected);
    }
    // An "idle-holding" that moves both hands alike, by the hips.
    const tie = setup("woman");
    await feed(tie, "woman", { tracks: { "idle-holding": IDLE_TRACKS } });
    expect(tie.figures.handOf("visitor")?.name).toBe("mixamorigRightHand");
  });

  it("counts each hand's fingers: the hand whose fingers alone close on the sheet holds it (the Author, 2026-11-09)", async () => {
    // The hand bones still, one hand's index finger closing: the studio's woman and man close their left hands so.
    for (const [hand, expected] of [
      ["right", "mixamorigRightHand"],
      ["left", "mixamorigLeftHand"],
    ] as const) {
      const s = setup("woman");
      await feed(s, "woman", { model: { fingers: true }, tracks: { "idle-holding": fingerTracks(hand) } });
      expect(s.figures.handOf("visitor")?.name, hand).toBe(expected);
    }
  });

  it("counts the fingers' motion with the hand bone's: closing fingers outweigh the other hand's small drift", async () => {
    // The right hand's fingers close while the left hand drifts 5 mm: the fingers' motion counts with the hand's, and
    // is the larger here, so the right holds, where the hand bones alone would give the left.
    const drift = setup("woman");
    const left = [0.055, -0.55, 0];
    await feed(drift, "woman", {
      model: { fingers: true },
      tracks: {
        "idle-holding": [
          ...fingerTracks("right"),
          { bone: "mixamorig:LeftHand", path: "translation", values: [left, left] },
        ],
      },
    });
    expect(drift.figures.handOf("visitor")?.name).toBe("mixamorigRightHand");
  });

  it("counts bones alone: a late idle-holding doesn't count the kept sheet with the hand that holds it", async () => {
    // The visitor shows with its idle alone, so the nearer hand holds, and takes the kept sheet at the hand-off's end.
    const s = setup("woman");
    await feed(s, "woman", { roles: ["idle"] });
    s.figures.handoffEnded();
    const holder = s.figures.handOf("visitor")?.name;
    expect(s.room.paper.kept.parent?.name).toBe(holder);
    // "idle-holding" arrives late (FR-018's rule runs again): the holding hand moves 10 mm, the other 15 mm. The sheet
    // under the holding hand moves with it, so counted it would carry that hand past the other; it is no bone.
    const [held, other] =
      holder === "mixamorigRightHand"
        ? (["mixamorig:RightHand", "mixamorig:LeftHand"] as const)
        : (["mixamorig:LeftHand", "mixamorig:RightHand"] as const);
    const moved = (bone: string, dz: number): ClipTrack => {
      const [x, y, z] = AVATAR_BONES.find((b) => b.name === bone)?.at ?? [0, 0, 0];
      const at = [x, y, z + dz];
      return { bone, path: "translation", values: [at, at] };
    };
    const late = clipGlb("idle-holding", { tracks: [moved(held, 0.01), moved(other, 0.015)] }).bytes;
    s.figures.clip("woman", "idle-holding", await clipsOf(late));
    expect(s.figures.handOf("visitor")?.name).toBe(PropertyBinding.sanitizeNodeName(other));
  });

  it("takes the hand nearer the other figure with no idle-holding, and none with no hand bone", async () => {
    const s = setup("woman");
    await feed(s, "woman", { roles: ["idle"] });
    s.figures.missed("woman", "idle-holding", "skipped");
    const avatar = avatarIn(s, "visitor") as Object3D;
    const twin = worldOf(s.room.twin);
    const distance = (name: string): number => worldOf(bone(avatar, name)).distanceTo(twin);
    const nearer =
      distance("mixamorigRightHand") <= distance("mixamorigLeftHand") ? "mixamorigRightHand" : "mixamorigLeftHand";
    expect(s.figures.handOf("visitor")?.name).toBe(nearer);
    const none = setup("woman");
    await feed(none, "woman", { model: { hands: false }, roles: ["idle"] });
    expect(none.figures.handOf("visitor")).toBeNull();
  });

  it("puts the kept paper in the holding hand after the hand-off, moving with it, and back at the anchor on reset", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    const kept = s.room.paper.kept;
    const anchor = s.room.anchors.visitorHand.clone();
    s.figures.handoffEnded();
    const hand = s.figures.handOf("visitor") as Object3D;
    expect(kept.parent).toBe(hand);
    expect(s.room.paper.atVisitor.opacity).toBe(1);
    expect(s.room.paper.atTwin.opacity).toBe(0);
    // Spec 014 (FR-038, FR-040; W15): at the hand's grip, the computed default where the scene gives none.
    const front = new Vector3(0, 0, 1).transformDirection((avatarIn(s, "visitor") ?? hand).matrixWorld);
    const grip = gripMatrix(hand, front, null);
    if (!grip) throw new Error("no grip");
    expect(worldOf(kept).distanceTo(new Vector3().setFromMatrixPosition(grip))).toBeLessThan(1e-6);
    // It moves with the hand as "idle-holding" plays: the hand's motion, carried.
    const before = worldOf(kept).sub(worldOf(hand));
    s.figures.update(500, true, 0);
    expect(worldOf(kept).sub(worldOf(hand)).distanceTo(before)).toBeLessThan(0.02);
    s.figures.reset();
    expect(kept.parent).toBe(s.room.scene);
    expect(worldOf(kept).distanceTo(anchor)).toBeLessThan(1e-6);
  });

  it("leaves the paper at the figure's hand anchor where the avatar has no hand bone", async () => {
    const s = setup("woman");
    await feed(s, "woman", { model: { hands: false }, roles: ["idle"] });
    s.figures.handoffEnded();
    expect(s.room.paper.kept.parent).toBe(s.room.scene);
    expect(worldOf(s.room.paper.kept).distanceTo(s.room.anchors.visitorHand)).toBeLessThan(1e-6);
  });
});

// T031 (spec 014; FR-038 to FR-041; W15): the paper's grip in the figures' controller. PAPER_LIFT is gone; a grip the
// scene gives for the holding avatar's hand places the kept sheet's held edge at its point in the hand bone's frame.
describe("the kept paper at the grip (spec 014, T031)", () => {
  it("exports no PAPER_LIFT", () => {
    expect(Object.keys(avatarsModule)).not.toContain("PAPER_LIFT");
  });
});
