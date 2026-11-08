// T031 and T032 (spec 009; FR-028; plan.md R-16; SC-007), and the review of Phases 1 and 2 on walking's tip: the
// visitor's avatar as walking's figure, in Node, with three's objects and no renderer, over the fixture room composed
// with the night's two folders, each file parsed by three's GLTFLoader from the GLBs test/helpers/glb.ts makes.
// - T031, the avatar's driver (scene/figure.ts's FigureDriver, the controller's `driver`): over a seeded walk of 10,000
//   steps, at the pose's place on the floor, turned to its heading, never mirrored, with no bob, the paper in its
//   holding hand; "walk" while it walks where it has the clip, and "idle-holding", a slide, where it hasn't; no clip
//   motion while the motion store doesn't animate; rest() back at its place, facing its placement's turn, with the paper.
// - T032, the driver by picture (figure.ts's figureDriverFor, the one driver walking.ts takes): the avatar's while the
//   visitor's avatar shows, the cut-out's otherwise, the old one resting and the new one taking the pose on the same
//   frame when the picture changes mid-walk. Here rather than in walking.test.ts, since walking.ts doesn't change.
// - The paper beside walking: an avatar that shows after walking moved the kept sheet into the visitor's picture
//   leaves the sheet visible; walking's keepPaper leaves it in the avatar's hand; a fallback puts it back where it was.
// - A clip parsed before its model is checked against the model's bones; and a figure not ready at the hand-off's
//   start says so ("late", FR-035).
import { Object3D, Quaternion, Vector3 } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { AvatarId, ClipRole } from "../../src/choice/avatars";
import { buildRoom, keepPaper } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { PAPER_LIFT, createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { cutoutDriver, figureDriverFor } from "../../src/room/scene/figure";
import type { FigureDriver, FigureFrame } from "../../src/room/scene/figure";
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
  readonly room: Room3D;
  readonly figures: AvatarFigures;
  readonly signals: FigureSignal[];
}

function setup(chosen: AvatarId = "woman"): Setup {
  const room = buildRoom(night.scene, { avatar: chosen, label: () => new Object3D(), index: night.index });
  const signals: FigureSignal[] = [];
  return { room, figures: createAvatarFigures(room, night.scene, { chosen, signal: (x) => signals.push(x) }), signals };
}

async function feed(s: Setup, avatar: AvatarId, roles: readonly ClipRole[] = ["idle", "idle-holding", "take"]) {
  expect(s.figures.model(avatar, await parsed(avatarGlb().bytes))).toBe(true);
  for (const role of roles) {
    const bytes = role === "walk" ? clipGlb("walk", { tracks: IDLE_TRACKS }).bytes : CLIPS[role as "idle"].bytes;
    s.figures.clip(avatar, role, await clipsOf(bytes));
  }
}

const worldOf = (o: Object3D): Vector3 => {
  o.updateWorldMatrix(true, false);
  return new Vector3().setFromMatrixPosition(o.matrixWorld);
};
const node = (s: Setup): Object3D => s.room.placements.get(night.scene.figures.visitor) as Object3D;
const avatar = (s: Setup): Object3D => s.room.visitor.children.find((c) => c.name === "avatar") as Object3D;

/** A seeded walk: a wandering path across the floor near the visitor's place, walking and standing in stretches. */
function poses(start: Vector3, steps: number): Pose[] {
  let seed = 7;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const out: Pose[] = [];
  let [x, z, heading] = [start.x, start.z, 0];
  for (let i = 0; i < steps; i += 1) {
    const walking = Math.floor(i / 40) % 3 !== 2;
    heading += (random() - 0.5) * 0.3;
    if (walking) {
      x += -Math.sin(heading) * 0.01;
      z += -Math.cos(heading) * 0.01;
    }
    out.push({ x, z, heading, speed: walking ? 0.6 : 0, walking });
  }
  return out;
}

/** The camera somewhere in front of the room, as walking's orbit puts it. */
const CAMERA: readonly [number, number, number] = [0.4, 1.6, 3.5];
const frameOf = (pose: Pose, animate = true): FigureFrame => ({ pose, camera: CAMERA, animate });

describe("the avatar's driver (FR-028; R-16; SC-007)", () => {
  it("stands the avatar at the pose's place, turned to its heading, never mirrored, no bob, the paper in its hand", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    s.figures.handoffEnded();
    const hand = s.figures.handOf("visitor") as Object3D;
    const lift = s.room.visitor.position.y;
    // The worst of 10,000 steps (T031), each checked, the worst kept, so one expect a measure.
    const worst = { place: 0, degrees: 0, scale: Infinity, det: Infinity, bob: 0, paper: 0, held: true };
    for (const pose of poses(worldOf(node(s)), 10_000)) {
      s.figures.driver.frame(frameOf(pose));
      s.figures.update(16, true, 0);
      const at = worldOf(node(s));
      worst.place = Math.max(worst.place, Math.hypot(at.x - pose.x, at.z - pose.z));
      // Facing: the avatar's +z in the world along the heading, (−sin h, −cos h) on the floor.
      const q = avatar(s).getWorldQuaternion(new Quaternion());
      const forward = new Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
      const heading = new Vector3(-Math.sin(pose.heading), 0, -Math.cos(pose.heading));
      worst.degrees = Math.max(worst.degrees, (forward.angleTo(heading) * 180) / Math.PI);
      // Never mirrored: a positive scale on x, and a world matrix that keeps its handedness.
      worst.scale = Math.min(worst.scale, s.room.visitor.scale.x);
      worst.det = Math.min(worst.det, avatar(s).matrixWorld.determinant());
      worst.bob = Math.max(worst.bob, Math.abs(s.room.visitor.position.y - lift));
      // The paper in the holding hand, its lower edge within 2 cm of it.
      worst.held &&= s.room.paper.kept.parent === hand;
      const edge = worldOf(s.room.paper.kept).sub(new Vector3(0, PAPER_LIFT, 0));
      worst.paper = Math.max(worst.paper, edge.distanceTo(worldOf(hand)));
    }
    expect(worst.place).toBeLessThan(1e-6);
    expect(worst.degrees).toBeLessThan(1);
    expect(worst.scale).toBeGreaterThan(0);
    expect(worst.det).toBeGreaterThan(0);
    expect(worst.bob).toBe(0);
    expect(worst.held).toBe(true);
    expect(worst.paper).toBeLessThan(0.02);
  });

  it("moves no clip while the motion store doesn't animate", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    s.figures.handoffEnded();
    const hand = s.figures.handOf("visitor") as Object3D;
    const pose = hand.quaternion.clone();
    for (const step of poses(worldOf(node(s)), 200)) {
      s.figures.driver.frame(frameOf(step, false));
      s.figures.update(16, false, 0);
    }
    expect(hand.quaternion.angleTo(pose)).toBe(0);
  });

  it("slides in idle-holding with no walk clip, and plays walk while it walks where it has one, back on rest", async () => {
    const slide = setup("woman");
    await feed(slide, "woman");
    slide.figures.handoffEnded();
    for (const pose of poses(worldOf(node(slide)), 60)) {
      slide.figures.driver.frame(frameOf(pose));
      expect(slide.figures.playing("visitor")).toBe("idle-holding");
    }
    const walker = setup("woman");
    await feed(walker, "woman", ["idle", "idle-holding", "take", "walk"]);
    walker.figures.handoffEnded();
    const [first] = poses(worldOf(node(walker)), 1);
    walker.figures.driver.frame(frameOf({ ...(first as Pose), walking: true, speed: 0.6 }));
    expect(walker.figures.playing("visitor")).toBe("walk");
    walker.figures.driver.frame(frameOf({ ...(first as Pose), walking: false, speed: 0 }));
    expect(walker.figures.playing("visitor")).toBe("idle-holding");
    walker.figures.driver.frame(frameOf({ ...(first as Pose), walking: true, speed: 0.6 }));
    walker.figures.driver.rest();
    expect(walker.figures.playing("visitor")).toBe("idle-holding");
  });

  it("rests the avatar at its place, facing its placement's turn, with the paper in its hand", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    s.figures.handoffEnded();
    const home = { at: node(s).position.clone(), turn: s.room.visitor.rotation.y };
    for (const pose of poses(worldOf(node(s)), 120)) s.figures.driver.frame(frameOf(pose));
    s.figures.driver.rest();
    expect(node(s).position.distanceTo(home.at)).toBeLessThan(1e-9);
    expect(s.room.visitor.rotation.y).toBeCloseTo(home.turn, 9);
    expect(s.room.paper.kept.parent).toBe(s.figures.handOf("visitor"));
  });
});

describe("the driver by picture (FR-028; R-16)", () => {
  /** A cut-out driver's stand-in that records its calls. */
  function recorder(): FigureDriver & { calls: string[] } {
    const calls: string[] = [];
    return { calls, frame: () => calls.push("frame"), rest: () => calls.push("rest") };
  }

  it("drives the cut-out until the avatar shows, then the avatar, the old driver resting on the switch", async () => {
    const s = setup("woman");
    const cutout = recorder();
    const driver = figureDriverFor(cutout, () => s.figures);
    const walk = poses(worldOf(node(s)), 6);
    driver.frame(frameOf(walk[0] as Pose));
    expect(cutout.calls).toEqual(["frame"]);
    await feed(s, "woman");
    s.figures.handoffEnded();
    driver.frame(frameOf(walk[1] as Pose));
    // The cut-out rests, and the avatar takes the pose on the same frame.
    expect(cutout.calls).toEqual(["frame", "rest"]);
    expect(Math.hypot(worldOf(node(s)).x - (walk[1] as Pose).x, worldOf(node(s)).z - (walk[1] as Pose).z)).toBeLessThan(
      1e-6,
    );
    // The avatar falls back mid-walk: the cut-out walks again, from the next frame.
    s.figures.missed("woman", null, "failed");
    driver.frame(frameOf(walk[2] as Pose));
    expect(cutout.calls).toEqual(["frame", "rest", "frame"]);
    driver.rest();
    expect(cutout.calls).toEqual(["frame", "rest", "frame", "rest"]);
  });

  it("drives the cut-out alone where no avatar module loaded", () => {
    const cutout = recorder();
    const driver = figureDriverFor(cutout, () => null);
    driver.frame(frameOf({ x: 0, z: 0, heading: 0, speed: 0, walking: false }));
    driver.rest();
    expect(cutout.calls).toEqual(["frame", "rest"]);
  });

  // Walking's hold hook (spec 008's figure.ts on a7c214a7): walking's entry hands the kept paper to the figure's driver.
  it("hands walking's held paper to the driver of the picture, and again to the one that takes over mid-walk", async () => {
    const s = setup("woman");
    s.figures.handoffEnded();
    const driver = figureDriverFor(cutoutDriver({ node: node(s), picture: s.room.visitor }), () => s.figures);
    const walk = poses(worldOf(node(s)), 3);
    // The cut-out's picture holds it while the cut-out shows.
    driver.hold?.(s.room.paper.kept);
    expect(s.room.paper.kept.parent).toBe(s.room.visitor);
    driver.frame(frameOf(walk[0] as Pose));
    // The avatar arrives mid-walk and takes it in its hand.
    await feed(s, "woman");
    driver.frame(frameOf(walk[1] as Pose));
    expect(s.room.paper.kept.parent).toBe(s.figures.handOf("visitor"));
    // It falls back mid-walk: the cut-out's picture holds the paper again, so it walks with the figure.
    s.figures.missed("woman", null, "failed");
    driver.frame(frameOf(walk[2] as Pose));
    expect(s.room.paper.kept.parent).toBe(s.room.visitor);
    driver.rest();
  });

  it("gives the cut-out the paper when an avatar that took it from the scene falls back mid-walk", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    s.figures.handoffEnded();
    const driver = figureDriverFor(cutoutDriver({ node: node(s), picture: s.room.visitor }), () => s.figures);
    const walk = poses(worldOf(node(s)), 2);
    driver.hold?.(s.room.paper.kept);
    driver.frame(frameOf(walk[0] as Pose));
    expect(s.room.paper.kept.parent).toBe(s.figures.handOf("visitor"));
    s.figures.missed("woman", null, "failed");
    driver.frame(frameOf(walk[1] as Pose));
    expect(s.room.paper.kept.parent).toBe(s.room.visitor);
    driver.rest();
  });
});

describe("the paper beside walking (the review of Phases 1 and 2)", () => {
  it("leaves walking's kept sheet visible when the avatar shows after it, and puts it back where it was on a fallback", async () => {
    const s = setup("woman");
    s.figures.handoffEnded();
    // Walking's entry moved the kept sheet into the visitor's picture (spec 008, R-12).
    keepPaper(s.room);
    expect(s.room.paper.kept.parent).toBe(s.room.visitor);
    await feed(s, "woman");
    expect(s.room.paper.kept.visible).toBe(true);
    expect(s.room.paper.kept.parent).toBe(s.figures.handOf("visitor"));
    s.figures.reset();
    expect(s.room.paper.kept.parent).toBe(s.room.visitor);
    expect(s.room.paper.kept.visible).toBe(true);
  });

  it("hides only the fallback's meshes: anything else the picture holds stays as it was", async () => {
    const s = setup("woman");
    const other = new Object3D();
    s.room.visitor.add(other);
    await feed(s, "woman");
    expect(other.visible).toBe(true);
  });

  it("keeps the paper in the avatar's hand when walking's keepPaper runs", async () => {
    const s = setup("woman");
    await feed(s, "woman");
    s.figures.handoffEnded();
    const hand = s.figures.handOf("visitor");
    keepPaper(s.room);
    expect(s.room.paper.kept.parent).toBe(hand);
  });
});

describe("the review's cheap fixes", () => {
  it("checks a clip parsed before its model against the model's bones, so a stray idle leaves the rest pose", async () => {
    const s = setup("woman");
    const stray = clipGlb("idle", {
      tracks: [
        {
          bone: "mixamorig:Tail",
          path: "translation",
          values: [
            [0, 0, 0],
            [0, 0.1, 0],
          ],
        },
      ],
    }).bytes;
    s.figures.clip("woman", "idle", await clipsOf(stray));
    expect(s.figures.model("woman", await parsed(avatarGlb().bytes))).toBe(true);
    expect(s.figures.shows("visitor")).toBe(true);
    expect(s.figures.playing("visitor")).toBeNull();
  });

  it("says a figure is late when the hand-off starts before its avatar is ready (FR-035)", async () => {
    const s = setup("woman");
    await feed(s, "man");
    s.figures.showHandoff(0, false);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "visitor", shows: "fallback", why: "late" });
    expect(s.signals).not.toContainEqual({ kind: "picture", figure: "twin", shows: "fallback", why: "late" });
  });
});
