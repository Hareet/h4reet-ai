// T022 (spec 016; FR-001 to FR-007, FR-011, FR-044, FR-049; plan.md R-05; SC-002): the twin's degraded modes in
// src/room/scene/avatars.ts and the loader's entries, with three's objects and no renderer.
// - The twin's model failing (each of FR-002's faults ends as a `failed` or `skipped` load: blocked, timed out, failing
//   integrity, not 200, corrupt, over the ledger): the capsule at once, the stand-in's files asked for then and not
//   before, the stand-in shown once ready at the catalog's height, the stand-in line throughout (its picture `avatar`).
// - The stand-in failing too keeps the capsule; a failing clip plays the idle in its place; a failing idle stands the
//   model still; a lost and restored context shows the twin again; the twin left out of the bundle fetches the
//   stand-in at once, as spec 009 has it.
// - The entries carry the served stems as their asset events' `asset`, and the tier, the kill switch, and the live
//   source reach none of this: the entries are the part's and the chosen avatar's alone.
import { Box3, Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { AvatarId } from "../../src/choice/avatars";
import type { RoomScene } from "../../src/room/compose/bundle";
import { AVATAR_NODE, createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { figureEntries, standInEntries, twinEntries } from "../../src/room/scene/loader";
import type { FigureSignal } from "../../src/room/stage";
import { avatarClips } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, SCENE, sceneWith } from "../helpers/room-avatars";
import { TWIN_ROLES, twinDefaults, twinFolder, twinPolicy } from "../helpers/room-twin";

let result: ComposeResult;
let without: ComposeResult;
beforeAll(() => {
  const files = { [SCENE]: sceneWith({ twin_stand_in: "man" }), ...avatarFolder("man"), ...avatarFolder("woman") };
  result = compose(overlay({ ...files, ...twinFolder() }), twinPolicy(), { mode: "lenient", drafts: false });
  without = compose(overlay(files), twinPolicy(), { mode: "lenient", drafts: false });
  expect(result.scene.twin).not.toBeNull();
  expect(without.scene.twin).toBeNull();
});

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;

interface Setup {
  readonly part: RoomScene;
  readonly room: Room3D;
  readonly figures: AvatarFigures;
  readonly signals: FigureSignal[];
  readonly asked: { count: number };
}

function setup(chosen: AvatarId = "woman", part: RoomScene = result.scene): Setup {
  const room = buildRoom(part, { avatar: chosen, label: () => new Object3D(), index: result.index });
  const signals: FigureSignal[] = [];
  const asked = { count: 0 };
  const figures = createAvatarFigures(room, part, {
    chosen,
    signal: (s) => signals.push(s),
    standIn: () => {
      asked.count += 1;
    },
  });
  return { part, room, figures, signals, asked };
}

const manModel = (): Uint8Array => avatarFolder("man")["assets/visitors/man/man.glb"] as Uint8Array;
const twinIn = (s: Setup): boolean => s.room.twin.children.some((c) => c.name === AVATAR_NODE);
const lastTwinPicture = (s: Setup): FigureSignal | undefined =>
  [...s.signals].reverse().find((x) => x.kind === "picture" && x.figure === "twin");

describe("the twin's model failing (FR-002; SC-002)", () => {
  it.each(["failed", "skipped"] as const)(
    "as %s: the capsule at once, the stand-in asked for once, then shown",
    async (why) => {
      const s = setup();
      expect(s.asked.count).toBe(0);
      s.figures.missed("twin", null, why);
      expect(twinIn(s)).toBe(false);
      expect(lastTwinPicture(s)).toEqual({ kind: "picture", figure: "twin", shows: "fallback", why });
      expect(s.asked.count).toBe(1);
      expect(s.figures.wants.twin).toBe("man");
      // The stand-in's files arrive: it shows in the twin's figure at the catalog's height (FR-011).
      expect(s.figures.model("man", await parsed(manModel()))).toBe(true);
      s.figures.clip("man", "idle", await clipsOf(avatarClips().idle.bytes));
      expect(twinIn(s)).toBe(true);
      expect(lastTwinPicture(s)).toEqual({ kind: "picture", figure: "twin", shows: "avatar", why: null });
      const instance = s.room.twin.children.find((c) => c.name === AVATAR_NODE) as Object3D;
      let root = instance;
      while (root.parent) root = root.parent;
      root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(instance, true);
      expect(Math.abs(box.max.y - box.min.y - s.part.figures.twin_height) / s.part.figures.twin_height).toBeLessThan(
        0.01,
      );
      // Asked for once a visit, however the twin's other files end.
      s.figures.missed("twin", "idle", "skipped");
      expect(s.asked.count).toBe(1);
    },
  );

  it("with the man chosen, the twin's failure shows the man in both figures from the one fetch, asking for nothing", async () => {
    const s = setup("man");
    expect(s.figures.model("man", await parsed(manModel()))).toBe(true);
    s.figures.clip("man", "idle", await clipsOf(avatarClips().idle.bytes));
    expect(s.figures.shows("visitor")).toBe(true);
    s.figures.missed("twin", null, "failed");
    expect(s.asked.count).toBe(0);
    expect(twinIn(s)).toBe(true);
    expect(lastTwinPicture(s)).toEqual({ kind: "picture", figure: "twin", shows: "avatar", why: null });
  });

  it("keeps the capsule where the stand-in fails too", async () => {
    const s = setup();
    s.figures.missed("twin", null, "failed");
    s.figures.missed("man", null, "failed");
    expect(twinIn(s)).toBe(false);
    expect(lastTwinPicture(s)).toEqual({ kind: "picture", figure: "twin", shows: "fallback", why: "failed" });
    let settled = false;
    void s.figures.settled.then(() => (settled = true));
    await Promise.resolve();
    expect(s.figures.shows("twin")).toBe(false);
    void settled;
  });

  it("before the twin fails, asks for no stand-in file", async () => {
    const s = setup();
    expect(s.figures.model("twin", await parsed(twinDefaults().model))).toBe(true);
    for (const role of TWIN_ROLES)
      s.figures.clip("twin", role, await clipsOf(twinDefaults().clips[role] as Uint8Array));
    expect(s.asked.count).toBe(0);
    expect(s.figures.wants.twin).toBe("twin");
  });
});

describe("the twin's clips failing (FR-003)", () => {
  it("plays the idle where another clip failed, and stands still in its rest pose where the idle failed", async () => {
    const s = setup();
    expect(s.figures.model("twin", await parsed(twinDefaults().model))).toBe(true);
    s.figures.missed("twin", "talking", "failed");
    s.figures.clip("twin", "idle", await clipsOf(twinDefaults().clips.idle as Uint8Array));
    expect(s.figures.playing("twin")).toBe("idle");
    const t = setup();
    expect(t.figures.model("twin", await parsed(twinDefaults().model))).toBe(true);
    t.figures.missed("twin", "idle", "failed");
    expect(t.figures.shows("twin")).toBe(true);
    expect(t.figures.playing("twin")).toBeNull();
  });
});

describe("a lost and restored context (FR-006)", () => {
  it("puts the capsule back on reset and shows the twin again once its files are taken again", async () => {
    const s = setup();
    expect(s.figures.model("twin", await parsed(twinDefaults().model))).toBe(true);
    s.figures.clip("twin", "idle", await clipsOf(twinDefaults().clips.idle as Uint8Array));
    expect(twinIn(s)).toBe(true);
    s.figures.reset();
    expect(twinIn(s)).toBe(false);
    expect(s.figures.wants.twin).toBe("twin");
    expect(s.figures.model("twin", await parsed(twinDefaults().model))).toBe(true);
    s.figures.clip("twin", "idle", await clipsOf(twinDefaults().clips.idle as Uint8Array));
    expect(twinIn(s)).toBe(true);
    expect(s.asked.count).toBe(0);
  });
});

describe("the entries (FR-044, FR-049)", () => {
  it("name each of the twin's files by its served stem, the asset events' `asset`", () => {
    expect(twinEntries(result.scene).map((e) => [e.piece, e.asset])).toEqual([
      ["twin", "twin"],
      ...TWIN_ROLES.map((r) => [`twin:${r}`, `twin-${r}`]),
    ]);
  });

  it("with the twin left out of the bundle, give the stand-in's files at once, as spec 009 has it", () => {
    const assets = figureEntries(without.scene, "woman").map((e) => e.asset);
    expect(assets.slice(0, 2)).toEqual(["man", "woman"]);
    expect(standInEntries(without.scene, "woman")).toEqual([]);
  });

  it("depend on the part and the chosen avatar alone: no tier, kill switch, or live source reaches them (FR-001)", () => {
    expect(figureEntries.length).toBeLessThanOrEqual(3);
    expect(figureEntries(result.scene, "woman")).toEqual(figureEntries(result.scene, "woman"));
  });
});
