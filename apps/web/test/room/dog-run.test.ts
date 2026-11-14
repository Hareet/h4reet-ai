// T016 (spec 020; FR-012, FR-017; plan.md R-03, reworked for Q69): the `run` clip role, for spec 025's room dog figure.
// - The closed list ends "walk", "run".
// - The dog's folder with `dog-run.glb` and main's approval of its model composes `run` among its clips, after `walk`,
//   capped as the others (RA4) and refused for a channel on a bone its model lacks (RA2); with no approval, no `run`
//   (RA9: a clip rides with its model).
// - The loader fetches `dog-run.glb` only where the visitor chose the dog, with its other clips.
// - The visitor's dog plays `walk` while walking and never `run`, and its idle with the slide where it has no walk clip,
//   even with a `run` clip; the loaded avatar holds the `run` clip by its role, where spec 025's figure finds it.
// - The man's and the woman's bundles hold no `run`.
// The records are as plan.md §4 has them (Q78): the model `likeness: true` from a photo batch, the clips
// `likeness: false`, their source the model's entry (`asset`).
import { createHash } from "node:crypto";

import { Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { CLIP_ROLES } from "../../src/choice/avatars";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { FigureFrame } from "../../src/room/scene/figure";
import { figureEntries } from "../../src/room/scene/loader";
import type { Pose } from "../../src/room/walk/movement";
import { avatarGlb, clipGlb, IDLE_TRACKS } from "../helpers/glb";
import type { ClipTrack } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, sceneWith, SCENE } from "../helpers/room-avatars";
import type { RecordEntry } from "../helpers/room-avatars";
import { twinPolicy } from "../helpers/room-twin";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: false };
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const where = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.rule} ${f.file}:${f.path}`);
const LINE = "A made-up likeness line for the tests.";

const dogBytes = avatarGlb({ height: 1.3, hands: false, legs: true }).bytes;
const idleBytes = clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes;
const walkBytes = clipGlb("walk", { tracks: IDLE_TRACKS, duration: 1 }).bytes;
const runBytes = clipGlb("run", { tracks: IDLE_TRACKS, duration: 0.5 }).bytes;
/** A run whose channels move many bones the dog has: a larger file than its idle and walk. */
const LEGS: readonly ClipTrack[] = [
  "mixamorig:Spine",
  "mixamorig:Head",
  "mixamorig:RightUpLeg",
  "mixamorig:LeftUpLeg",
].flatMap((bone) =>
  [0, 1, 2, 3, 4, 5].map(() => ({
    bone,
    path: "rotation" as const,
    values: [
      [0, 0, 0, 1],
      [0, 0.1, 0, 0.995],
    ],
  })),
);
const bigRunBytes = clipGlb("run", { tracks: [...IDLE_TRACKS, ...LEGS], duration: 0.5 }).bytes;
/** A run moving a hand bone, which the dog's model doesn't name. */
const handRunBytes = clipGlb("run", {
  tracks: [
    {
      bone: "mixamorig:RightHand",
      path: "translation",
      values: [
        [0, 0, 0],
        [0, 0.1, 0],
      ],
    },
  ],
}).bytes;

/** Plan.md §4: the model a likeness from a photo batch; each clip not a likeness, from the model's entry. */
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
const tree = (o: { run?: Uint8Array | null; walk?: Uint8Array | null } = {}): Tree =>
  overlay({
    [SCENE]: sceneWith({ twin_stand_in: "man" }),
    ...avatarFolder("man"),
    ...avatarFolder("woman"),
    ...avatarFolder("dog", {
      model: dogBytes,
      clips: {
        idle: idleBytes,
        walk: o.walk === undefined ? walkBytes : o.walk,
        run: o.run === undefined ? runBytes : o.run,
        "idle-holding": null,
        take: null,
      },
      records,
    }),
  });
const approved = (o: { animation?: { bytes: number } } = {}): RoomPolicy =>
  twinPolicy({ likeness: [{ id: "A-fx-dog", sha256: sha256(dogBytes), line: LINE }], ...o });

describe("the closed list (FR-012)", () => {
  it("ends with walk, then run", () => {
    expect(CLIP_ROLES.slice(-2)).toEqual(["walk", "run"]);
  });
});

describe("the compose's run (FR-012; RA2, RA4, RA9)", () => {
  it("bundles run with the model's approval", () => {
    const t = tree();
    expect(where(compose(t, approved(), STRICT).findings)).toEqual([]);
    const dog = compose(t, approved(), LENIENT).scene.avatars.dog;
    // The bundle's clip keys are sorted bytewise (emit.ts's avatarsPart); the loader's order is the closed list's.
    expect(Object.keys(dog?.clips ?? {})).toEqual(["idle", "run", "walk"]);
    expect(dog?.clips.run?.sha256).toBe(sha256(runBytes));
  });

  it("refuses a run over the animation cap, as the others (RA4)", () => {
    expect(bigRunBytes.length).toBeGreaterThan(Math.max(idleBytes.length, walkBytes.length));
    const policy = approved({ animation: { bytes: Math.max(idleBytes.length, walkBytes.length) } });
    const t = tree({ run: bigRunBytes });
    // The man's and the woman's fixture clips are larger than this cap too; only the dog's folder is asked about.
    const dogs = where(compose(t, policy, STRICT).findings).filter((w) => w.includes("/dog/"));
    expect(dogs).toEqual(["RA4 assets/visitors/dog/dog-run.glb:-"]);
    expect(Object.keys(compose(t, policy, LENIENT).scene.avatars.dog?.clips ?? {})).toEqual(["idle", "walk"]);
  });

  it("refuses a run moving a bone the model lacks (RA2)", () => {
    const t = tree({ run: handRunBytes });
    const findings = compose(t, approved(), STRICT).findings;
    expect(findings.map((f) => `${f.rule} ${f.file}`)).toEqual(["RA2 assets/visitors/dog/dog-run.glb"]);
    expect(compose(t, approved(), LENIENT).scene.avatars.dog?.clips.run).toBeUndefined();
  });

  it("bundles no run without the model's approval (RA9)", () => {
    const t = tree();
    const none = twinPolicy({ likeness: [] });
    expect(where(compose(t, none, STRICT).findings)).toEqual(["RA9 assets/visitors/dog/dog.glb:-"]);
    expect(compose(t, none, LENIENT).scene.avatars.dog).toBeUndefined();
  });

  it("leaves the man's and the woman's bundles without a run", () => {
    const scene = compose(tree(), approved(), LENIENT).scene;
    for (const id of ["man", "woman"] as const) {
      expect(scene.avatars[id]).toBeDefined();
      expect("run" in (scene.avatars[id]?.clips ?? {})).toBe(false);
    }
  });
});

describe("the loader's run", () => {
  it("fetches dog-run.glb with the dog's other clips, only where the visitor chose the dog", () => {
    const scene = compose(tree(), approved(), LENIENT).scene;
    const dog = figureEntries(scene, "dog").filter((e) => e.figure.avatar === "dog");
    expect(dog.map((e) => e.figure.role)).toEqual([null, "idle", "walk", "run"]);
    for (const chosen of ["man", "woman"] as const)
      expect(figureEntries(scene, chosen).some((e) => e.figure.avatar === "dog")).toBe(false);
  });
});

describe("the visitor's dog never runs (FR-017)", () => {
  const loader = new GLTFLoader();
  const parsed = async (bytes: Uint8Array): Promise<{ scene: Object3D; animations: AnimationClip[] }> =>
    loader.parseAsync(bytes.slice().buffer, "");
  const setup = async (withWalk: boolean): Promise<AvatarFigures> => {
    const composed = compose(tree(withWalk ? {} : { walk: null }), approved(), LENIENT);
    const room = buildRoom(composed.scene, { avatar: "dog", label: () => new Object3D(), index: composed.index });
    const figures = createAvatarFigures(room, composed.scene, { chosen: "dog" });
    expect(figures.model("dog", (await parsed(dogBytes)).scene)).toBe(true);
    figures.clip("dog", "idle", (await parsed(idleBytes)).animations);
    if (withWalk) figures.clip("dog", "walk", (await parsed(walkBytes)).animations);
    figures.clip("dog", "run", (await parsed(runBytes)).animations);
    figures.handoffEnded();
    return figures;
  };
  const walking: FigureFrame = {
    pose: { x: 0, z: -1, heading: 0, speed: 3, walking: true } satisfies Pose,
    camera: [0.4, 1.6, 3.5],
    animate: true,
  };

  it("plays walk while walking, at any speed, and idle when it stops", async () => {
    const figures = await setup(true);
    figures.driver.frame(walking);
    expect(figures.playing("visitor")).toBe("walk");
    figures.driver.frame({ ...walking, pose: { x: 0, z: -1, heading: 0, speed: 0, walking: false } });
    expect(figures.playing("visitor")).toBe("idle");
  });

  it("plays its idle with the slide where it has no walk clip, though it has a run", async () => {
    const figures = await setup(false);
    figures.driver.frame(walking);
    expect(figures.playing("visitor")).toBe("idle");
  });

  it("holds the run clip by its role, for spec 025's figure", async () => {
    const figures = await setup(true);
    expect(figures.clipOf("dog", "run")?.name).toBe("run");
    expect(figures.clipOf("dog", "walk")?.name).toBe("walk");
    expect(figures.clipOf("man", "run")).toBeNull();
  });
});
