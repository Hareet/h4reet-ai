// T010 (spec 025; FR-018 to FR-021, SC-007; plan.md R-10): the room's dog, a third figure of the avatar controller.
// - With a fixture dog bundle (its model, idle, walk, run, and an approval's line) and the scene's `figures.dog`, the
//   controller wants the dog for each of the four chosen avatars and shows it at its home, AVATAR_SHAPES.dog.height
//   tall (its target, through instanceFor), playing idle; it isn't in the hand-off's wait (`settled`).
// - No `figures.dog`, or no bundled dog: `wants.dog` null and nothing at its home. A failure: one fallback signal,
//   `failed`, and nothing at its home.
// - The loader lists the dog's entries after the twin's and the visitor's, once where the visitor chose the dog.
// - rv-rework2-spec-025's I-1: the paths beside `place`, `clip`, and `missed` that the dog needs too: a reset puts it
//   back to nothing and it shows again on a reload; one ready during the hand-off shows at its end; and `update`
//   advances its mixer at quality level 0 and not above.
// Spec 028 (T-B02; FR-017, FR-018, SC-005; Q9, Q11; plan.md R-B1, R-B8, the named departure): the room's dog is wanted
// only in a dinosaur visit whose bundle carries the dinosaur's model, and its picture is hidden until the dinosaur's
// scene shows it at its entry; a dog visitor is the only dog in its room; the loader lists the room's dog's files only
// for such a visit. The cases that set up a woman or a man visitor to have a room's dog now set up a dinosaur visit.
import { createHash } from "node:crypto";

import { Box3, Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeOptions } from "../../build/room/compose";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { AVATAR_SHAPES } from "../../src/choice/avatars";
import type { AvatarId } from "../../src/choice/avatars";
import { DOG_NODE, createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { figureEntries } from "../../src/room/scene/loader";
import type { FigureSignal } from "../../src/room/stage";
import { avatarGlb, clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, sceneWith, SCENE } from "../helpers/room-avatars";
import { dinosaurFolder } from "../helpers/room-dinosaur";
import type { RecordEntry } from "../helpers/room-avatars";
import { twinPolicy } from "../helpers/room-twin";

const LENIENT: ComposeOptions = { mode: "lenient", drafts: false };
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const LINE = "A made-up likeness line for the tests.";
const HOME = { at: [0.3, 0.45] as [number, number], heading_deg: 180 };

const dogBytes = avatarGlb({ height: 1.3, hands: false, legs: true }).bytes;
const idleBytes = clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes;
const walkBytes = clipGlb("walk", { tracks: IDLE_TRACKS, duration: 1 }).bytes;
const runBytes = clipGlb("run", { tracks: IDLE_TRACKS, duration: 0.5 }).bytes;

const records = (e: RecordEntry[]): void => {
  for (const x of e) {
    if (x.file === "dog.glb") {
      x.likeness = true;
      x.source = { type: "photo", id: "H-dog-1" };
    } else {
      x.likeness = false;
      x.source = { type: "asset", id: "AS-dog-model" };
    }
  }
};
const tree = (o: { dog?: boolean; block?: boolean; dino?: boolean } = {}): Tree =>
  overlay({
    [SCENE]: sceneWith({
      twin_stand_in: "man",
      ...(o.block === false ? {} : { dog: { home: HOME, footprint_m: 0.3 } }),
    }),
    ...avatarFolder("man"),
    ...avatarFolder("woman"),
    ...(o.dog === false
      ? {}
      : avatarFolder("dog", {
          model: dogBytes,
          clips: { idle: idleBytes, walk: walkBytes, run: runBytes, "idle-holding": null, take: null },
          records,
        })),
    // Spec 028 (Q11): the dinosaur's model bundled, as a visit with the room's dog needs; `dino: false` leaves it out.
    ...(o.dino === false ? {} : dinosaurFolder()),
  });
const approved = (): RoomPolicy => twinPolicy({ likeness: [{ id: "A-fx-dog", sha256: sha256(dogBytes), line: LINE }] });

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<{ scene: Object3D; animations: AnimationClip[] }> =>
  loader.parseAsync(bytes.slice().buffer, "");

interface Setup {
  readonly figures: AvatarFigures;
  readonly room: Room3D;
  readonly signals: FigureSignal[];
}
function setup(chosen: AvatarId, o: { dog?: boolean; block?: boolean; dino?: boolean } = {}): Setup {
  const composed = compose(tree(o), approved(), LENIENT);
  const room = buildRoom(composed.scene, { avatar: chosen, label: () => new Object3D(), index: composed.index });
  const signals: FigureSignal[] = [];
  const figures = createAvatarFigures(room, composed.scene, { chosen, signal: (s) => signals.push(s) });
  return { figures, room, signals };
}
async function loadDog(figures: AvatarFigures, o: { idle?: boolean } = {}): Promise<void> {
  expect(figures.model("dog", (await parsed(dogBytes)).scene)).toBe(true);
  if (o.idle !== false) figures.clip("dog", "idle", (await parsed(idleBytes)).animations);
  figures.clip("dog", "walk", (await parsed(walkBytes)).animations);
  figures.clip("dog", "run", (await parsed(runBytes)).animations);
}
const dogNode = (room: Room3D): Object3D | undefined => room.scene.getObjectByName(DOG_NODE);
const dogInstance = (room: Room3D): Object3D | undefined => dogNode(room)?.getObjectByName("avatar");
const dogPictures = (signals: FigureSignal[]): FigureSignal[] =>
  signals.filter((s) => s.kind === "picture" && s.figure === "dog");

describe("the room's dog at its home (FR-018, FR-019)", () => {
  // Spec 028 (FR-017; Q9): was "is wanted and shows for a visitor who chose the {woman, man, dog, dinosaur}".
  for (const chosen of ["woman", "man", "dog"] as const)
    it(`isn't wanted, and nothing is at its home, for a visitor who chose the ${chosen} (spec 028, FR-017)`, () => {
      const { figures, room, signals } = setup(chosen);
      expect(figures.wants.dog).toBeNull();
      expect(dogNode(room)).toBeUndefined();
      expect(dogPictures(signals)).toEqual([]);
    });

  it("isn't wanted for a dinosaur visit whose bundle lacks the dinosaur's model (spec 028, Q11)", () => {
    const { figures, room } = setup("dinosaur", { dino: false });
    expect(figures.wants.dog).toBeNull();
    expect(dogNode(room)).toBeUndefined();
  });

  it("is wanted for a visitor who chose the dinosaur, shows at its home, and stays hidden until the scene's entry (spec 028, FR-018)", async () => {
    const { figures, room } = setup("dinosaur");
    expect(figures.wants.dog).toBe("dog");
    figures.handoffEnded();
    await loadDog(figures);
    expect(figures.shows("dog")).toBe(true);
    expect(figures.playing("dog")).toBe("idle");
    const node = dogNode(room);
    if (!node) throw new Error("no room dog");
    // Hidden: the dinosaur's scene shows it at its entry (FR-021).
    expect(node.visible).toBe(false);
    expect(figures.pictureOf("dog")).toBe(node);
    node.updateWorldMatrix(true, true);
    const at = node.getWorldPosition(node.position.clone());
    expect(at.x).toBeCloseTo(HOME.at[0], 6);
    expect(at.z).toBeCloseTo(HOME.at[1], 6);
    const instance = dogInstance(room);
    if (!instance) throw new Error("no instance");
    // Its rest pose's height scaled to the dog's (the idle moves its hips, so the posed box isn't the measure).
    const rest = new Box3().setFromObject((await parsed(dogBytes)).scene, true);
    expect((rest.max.y - rest.min.y) * instance.scale.y).toBeCloseTo(AVATAR_SHAPES.dog.height, 6);
    expect(instance.position.y).toBeCloseTo(-rest.min.y * instance.scale.y, 6);
  });

  // Spec 028 (FR-017; Q9): was "shows two dogs where the visitor chose the dog, one model parsed, two instances".
  it("shows one dog where the visitor chose the dog: the visitor's own (spec 028, FR-017)", async () => {
    const { figures, room } = setup("dog");
    figures.handoffEnded();
    await loadDog(figures);
    expect(figures.shows("visitor")).toBe(true);
    expect(figures.shows("dog")).toBe(false);
    expect(dogNode(room)).toBeUndefined();
    expect(figures.pictureOf("dog")).toBeNull();
  });

  it("isn't in the hand-off's wait: the room settles with the dog still loading", async () => {
    const { figures } = setup("dinosaur");
    for (const avatar of [figures.wants.twin, "man", "dinosaur"] as const)
      if (avatar !== null) figures.missed(avatar, null, "failed");
    await expect(figures.settled).resolves.toBeUndefined();
    expect(figures.shows("dog")).toBe(false);
  });

  it("carries the approval's line on its picture signal while its model shows (FR-020)", async () => {
    const { figures, signals } = setup("dinosaur");
    figures.handoffEnded();
    await loadDog(figures);
    expect(dogPictures(signals)).toEqual([{ kind: "picture", figure: "dog", shows: "avatar", why: null, line: LINE }]);
  });

  it("plays its walk and run by role, and its idle for a role it hasn't", async () => {
    const { figures } = setup("dinosaur");
    figures.handoffEnded();
    await loadDog(figures);
    figures.dogPlays("run");
    expect(figures.playing("dog")).toBe("run");
    figures.dogPlays("walk");
    expect(figures.playing("dog")).toBe("walk");
    figures.dogPlays("idle");
    expect(figures.playing("dog")).toBe("idle");
  });
});

describe("no room dog (FR-018)", () => {
  // Spec 028 (rv-028b-1's B1-3, rework-028b): these two stage a dinosaur visit, the only one that wants the room's dog
  // (FR-017, FR-018); with the man they passed for spec 028's reason, not their own. Names kept.
  it("with no figures.dog: wants.dog null, nothing at its home, no signal", () => {
    const { figures, room, signals } = setup("dinosaur", { block: false });
    expect(figures.wants.dog).toBeNull();
    expect(dogInstance(room)).toBeUndefined();
    expect(dogPictures(signals)).toEqual([]);
  });

  it("with no bundled dog: wants.dog null, nothing at its home", () => {
    const { figures, room } = setup("dinosaur", { dog: false });
    expect(figures.wants.dog).toBeNull();
    expect(dogInstance(room)).toBeUndefined();
  });

  it("a failed model: one fallback signal, failed, and nothing at its home", async () => {
    const { figures, room, signals } = setup("dinosaur");
    figures.handoffEnded();
    figures.missed("dog", null, "failed");
    expect(dogPictures(signals)).toEqual([{ kind: "picture", figure: "dog", shows: "fallback", why: "failed" }]);
    expect(dogInstance(room)).toBeUndefined();
    expect(figures.shows("dog")).toBe(false);
  });
});

describe("the loader's entries (FR-021)", () => {
  it("lists the dog's files after the twin's and the visitor's", () => {
    const scene = compose(tree(), approved(), LENIENT).scene;
    const entries = figureEntries(scene, "dinosaur");
    const dog = entries.filter((e) => e.figure.avatar === "dog");
    expect(dog.map((e) => e.figure.role)).toEqual([null, "idle", "walk", "run"]);
    const first = entries.findIndex((e) => e.figure.avatar === "dog");
    expect(entries.slice(first).every((e) => e.figure.avatar === "dog")).toBe(true);
  });

  it("lists them once where the visitor chose the dog", () => {
    const scene = compose(tree(), approved(), LENIENT).scene;
    const dog = figureEntries(scene, "dog").filter((e) => e.figure.avatar === "dog");
    expect(dog.map((e) => e.figure.role)).toEqual([null, "idle", "walk", "run"]);
  });

  it("lists none with no figures.dog, or with the dog not bundled", () => {
    for (const o of [{ block: false }, { dog: false }]) {
      const scene = compose(tree(o), approved(), LENIENT).scene;
      expect(figureEntries(scene, "dinosaur").some((e) => e.figure.avatar === "dog")).toBe(false);
    }
  });

  it("lists none for the woman or the man, or for a dinosaur visit without the dinosaur's model (spec 028, SC-005)", () => {
    const scene = compose(tree(), approved(), LENIENT).scene;
    for (const chosen of ["woman", "man"] as const)
      expect(figureEntries(scene, chosen).some((e) => e.figure.avatar === "dog")).toBe(false);
    const noDino = compose(tree({ dino: false }), approved(), LENIENT).scene;
    expect(noDino.avatars.dinosaur).toBeUndefined();
    expect(figureEntries(noDino, "dinosaur").some((e) => e.figure.avatar === "dog")).toBe(false);
  });
});

describe("the paths beside place, clip, and missed (rv-rework2-spec-025, I-1)", () => {
  it("reset() puts the dog back to nothing at its home, still wanting it, and a reload shows it again", async () => {
    const { figures, room } = setup("dinosaur");
    figures.handoffEnded();
    await loadDog(figures);
    figures.reset();
    expect(figures.shows("dog")).toBe(false);
    expect(dogInstance(room)).toBeUndefined();
    expect(figures.wants.dog).toBe("dog");
    await loadDog(figures);
    expect(figures.shows("dog")).toBe(true);
  });

  it("one ready during the hand-off waits, and shows at its end (handoffEnded's retry)", async () => {
    const { figures } = setup("dinosaur");
    figures.showHandoff(0.1, false);
    await loadDog(figures);
    expect(figures.shows("dog")).toBe(false);
    figures.handoffEnded();
    expect(figures.shows("dog")).toBe(true);
  });

  it("update() advances its mixer at quality level 0, not at 1", async () => {
    const { figures, room } = setup("dinosaur");
    figures.handoffEnded();
    await loadDog(figures);
    const instance = dogInstance(room);
    if (!instance) throw new Error("no instance");
    // The idle moves the hips (IDLE_TRACKS): its mixer's time shows in the hips' place.
    const hips = instance.getObjectByName("mixamorigHips");
    if (!hips) throw new Error("no hips");
    const before = hips.position.clone();
    figures.update(1000, true, 1);
    expect(hips.position.equals(before)).toBe(true);
    figures.update(1000, true, 0);
    expect(hips.position.equals(before)).toBe(false);
  });
});
