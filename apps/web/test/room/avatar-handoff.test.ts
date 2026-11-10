// T028 (spec 009; FR-019, FR-020; plan.md R-10; SC-006): the hand-off between the two avatars, in Node, with three's
// objects and no renderer, over the fixture room composed with the night's two folders (test/helpers/room-avatars.ts),
// each file parsed by three's GLTFLoader from the GLBs test/helpers/glb.ts makes.
// - Before it: the twin's avatar holds the paper in "idle-holding", the sheet in its holding hand.
// - At its start: the sheet starts in the twin's holding hand, and the twin plays its idle from then on.
// - During it: the visitor's "take" starts so that it ends as the hand-off ends; the sheet's end follows the visitor's
//   holding hand; each figure's turn is spec 002's, as without avatars.
// - At its end: the sheet within 2 cm of the visitor's holding hand, by its lower edge, which the hand holds (R-09);
//   "idle-holding" loops; the kept paper in the hand.
// - Under reduced motion: 1 s, no turn, no clip motion, the paper crossfading from hand to hand, the clips changing by
//   cuts at the start and the end, "idle-holding"'s first frame at the end.
// - One avatar late: its figure plays the hand-off with its fallback and its anchor, and its avatar swaps in after.
// - The loader's parse gate: a figure file parses before the hand-off starts or after it ends, never during it.
import { Object3D, PerspectiveCamera, Vector3 } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { AvatarId, ClipRole } from "../../src/choice/avatars";
import { handoffDuration } from "../../src/room/handoff";
import { buildRoom, showHandoff } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { PAPER_LIFT, createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { avatarClips, avatarGlb } from "../helpers/glb";
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
}

function setup(chosen: AvatarId = "woman"): Setup {
  const room = buildRoom(night.scene, { avatar: chosen, label: () => new Object3D(), index: night.index });
  return { room, figures: createAvatarFigures(room, night.scene, { chosen }) };
}

async function feed(s: Setup, avatar: AvatarId, roles: readonly ClipRole[] = ["idle", "idle-holding", "take"]) {
  expect(s.figures.model(avatar, await parsed(avatarGlb().bytes))).toBe(true);
  for (const role of roles) s.figures.clip(avatar, role, await clipsOf(CLIPS[role as "idle"].bytes));
}

const worldOf = (o: Object3D): Vector3 => {
  o.updateWorldMatrix(true, false);
  return new Vector3().setFromMatrixPosition(o.matrixWorld);
};
/** The sheet's lower edge, which the hand holds: its centre less PAPER_LIFT. */
const lowerEdge = (s: Setup): Vector3 => worldOf(s.room.paper.sheet).sub(new Vector3(0, PAPER_LIFT, 0));
const D = handoffDuration("3d", false);
const TAKE_MS = 1500;

/** Plays the hand-off from `from` to `to` in steps of `step` ms of its duration, advancing the mixers as frames would. */
function play(s: Setup, from: number, to: number, reduced = false, step = 50): void {
  const duration = handoffDuration("3d", reduced);
  for (let t = from; t <= to + 1e-9; t += step) {
    s.figures.update(step, !reduced, 0);
    s.figures.showHandoff(Math.min(1, t / duration), reduced);
  }
}

describe("before the hand-off (FR-019 (b))", () => {
  it("holds the paper in the twin's avatar's hand, in its idle-holding, the sheet in that hand", async () => {
    const s = setup("woman");
    await feed(s, "man");
    await feed(s, "woman");
    expect(s.figures.playing("twin")).toBe("idle-holding");
    expect(s.figures.playing("visitor")).toBe("idle");
    s.figures.update(16, true, 0);
    const hand = s.figures.handOf("twin") as Object3D;
    expect(
      worldOf(s.room.paper.sheet)
        .sub(worldOf(hand))
        .distanceTo(new Vector3(0, PAPER_LIFT, 0)),
    ).toBeLessThan(1e-4);
  });
});

describe("the hand-off between the avatars (FR-019; R-10; SC-006)", () => {
  it("starts the sheet in the twin's hand, the twin turning to its idle, and ends it in the visitor's hand", async () => {
    const s = setup("woman");
    await feed(s, "man");
    await feed(s, "woman");
    s.figures.update(16, true, 0);
    const start = worldOf(s.figures.handOf("twin") as Object3D).add(new Vector3(0, PAPER_LIFT, 0));
    s.figures.showHandoff(0, false);
    expect(worldOf(s.room.paper.sheet).distanceTo(start)).toBeLessThan(1e-4);
    expect(s.figures.playing("twin")).toBe("idle");
    play(s, 0, D);
    // The sheet's lower edge within 2 cm of the visitor's holding hand at the end.
    const hand = s.figures.handOf("visitor") as Object3D;
    expect(lowerEdge(s).distanceTo(worldOf(hand))).toBeLessThan(0.02);
    s.figures.handoffEnded();
    expect(s.figures.playing("visitor")).toBe("idle-holding");
    expect(s.room.paper.kept.parent).toBe(hand);
  });

  it("starts the visitor's take so that it ends as the hand-off ends, then idle-holding", async () => {
    const s = setup("woman");
    await feed(s, "man");
    await feed(s, "woman");
    s.figures.showHandoff(0, false);
    play(s, 0, D - TAKE_MS - 100);
    expect(s.figures.playing("visitor")).toBe("idle");
    play(s, D - TAKE_MS, D - TAKE_MS + 50);
    expect(s.figures.playing("visitor")).toBe("take");
    play(s, D - TAKE_MS + 100, D);
    s.figures.handoffEnded();
    expect(s.figures.playing("visitor")).toBe("idle-holding");
  });

  it("keeps each figure's turn spec 002's, and the hand-off's length within 5 s", async () => {
    const plain = setup("woman");
    const rigged = setup("woman");
    await feed(rigged, "man");
    await feed(rigged, "woman");
    for (const p of [0.1, 0.3, 0.5, 0.8, 1]) {
      showHandoff(plain.room, p, false);
      rigged.figures.showHandoff(p, false);
      expect(rigged.room.twin.rotation.y).toBeCloseTo(plain.room.twin.rotation.y, 9);
      expect(rigged.room.visitor.rotation.y).toBeCloseTo(plain.room.visitor.rotation.y, 9);
    }
    expect(D).toBe(4500);
    expect(D).toBeLessThanOrEqual(5000);
  });
});

describe("under reduced motion (FR-020)", () => {
  it("lasts 1 s: no turn, no clip motion, the paper crossfading from hand to hand, cuts at the start and the end", async () => {
    const s = setup("woman");
    await feed(s, "man");
    await feed(s, "woman");
    expect(handoffDuration("3d", true)).toBe(1000);
    s.figures.update(16, false, 0);
    s.figures.showHandoff(0, true);
    expect(s.figures.playing("twin")).toBe("idle");
    const visitorPaper = worldOf(s.figures.handOf("visitor") as Object3D).add(new Vector3(0, PAPER_LIFT, 0));
    for (const p of [0.25, 0.5, 0.75]) {
      s.figures.update(250, false, 0);
      s.figures.showHandoff(p, true);
      expect([s.room.twin.rotation.y, s.room.visitor.rotation.y]).toEqual([0, 0]);
      expect(s.room.paper.atTwin.opacity).toBeCloseTo(1 - p, 9);
      expect(s.room.paper.atVisitor.opacity).toBeCloseTo(p, 9);
      // No take under reduced motion: the pose changes only at the start and the end.
      expect(s.figures.playing("visitor")).toBe("idle");
    }
    // The kept sheet fades in at the visitor's hand.
    expect(worldOf(s.room.paper.kept).distanceTo(visitorPaper)).toBeLessThan(1e-4);
    s.figures.showHandoff(1, true);
    s.figures.handoffEnded();
    expect(s.figures.playing("visitor")).toBe("idle-holding");
    const hand = s.figures.handOf("visitor") as Object3D;
    // idle-holding's first frame: the fixture's holding hand, raised and forward.
    expect(hand.position.toArray().map((v) => Math.round(v * 1e4) / 1e4)).toEqual([-0.02, -0.3, 0.22]);
  });
});

describe("an avatar late (FR-019 (e); SC-006)", () => {
  it("plays the hand-off with that figure's fallback and anchor, and swaps the avatar in after", async () => {
    const s = setup("woman");
    await feed(s, "man");
    const anchor = s.room.anchors.visitorHand.clone();
    s.figures.showHandoff(0, false);
    play(s, 0, D / 2);
    // The woman arrives mid-hand-off: she waits for its end to show.
    await feed(s, "woman");
    expect(s.figures.shows("visitor")).toBe(false);
    play(s, D / 2, D);
    expect(worldOf(s.room.paper.sheet).distanceTo(anchor)).toBeLessThan(1e-6);
    s.figures.handoffEnded();
    expect(s.figures.shows("visitor")).toBe(true);
    expect(s.figures.playing("visitor")).toBe("idle-holding");
  });

  it("resolves `settled` once both figures show their avatars or keep their fallbacks for good", async () => {
    const s = setup("dog");
    let settled = false;
    void s.figures.settled.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await feed(s, "man");
    await Promise.resolve();
    expect(settled).toBe(true);
    const t = setup("woman");
    let failed = false;
    void t.figures.settled.then(() => (failed = true));
    t.figures.missed("man", null, "failed");
    t.figures.missed("woman", null, "failed");
    await Promise.resolve();
    expect(failed).toBe(true);
    expect(new PerspectiveCamera()).toBeDefined();
  });
});

// Spec 012 (T005; FR-021; Amendment L11): an avatar the figures take once the loader has given way, before the
// hand-off's first frame, shows only once the hand-off ends, as one ready during it does (spec 009's FR-022).
describe("spec 012: the figures closed from the loader's giving way (T005)", () => {
  it("shows an avatar that becomes ready after close() only once the hand-off ends", async () => {
    const s = setup("woman");
    s.figures.close();
    await feed(s, "man");
    await feed(s, "woman");
    expect(s.figures.shows("twin")).toBe(false);
    expect(s.figures.shows("visitor")).toBe(false);
    play(s, 0, D);
    expect(s.figures.shows("visitor")).toBe(false);
    s.figures.handoffEnded();
    expect(s.figures.shows("twin")).toBe(true);
    expect(s.figures.shows("visitor")).toBe(true);
  });

  it("shows an avatar ready before close() at once, as before", async () => {
    const s = setup("woman");
    await feed(s, "man");
    s.figures.close();
    expect(s.figures.shows("twin")).toBe(true);
  });
});
