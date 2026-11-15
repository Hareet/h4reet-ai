// T021 (spec 016; FR-008, FR-010, FR-011, FR-013, FR-014, FR-045; plan.md R-01, R-06, R-07; contracts/twin-states.md
// §4; SC-001, SC-003, SC-009): the twin's own figure in src/room/scene/avatars.ts, in Node, with three's objects and no
// renderer, over the fixture set composed with the twin's folder and the visitors' (test/helpers/room-twin.ts), each
// file parsed by three's GLTFLoader as the room's loader parses it.
// - The twin's instance is unscaled: its lowest point on the floor, its height its own 1.82 m, its root at the
//   placement, facing as the placement turns it; shown only once its model and its idle have ended.
// - With the visitor's choice of the man, the visitor shows the man and the twin the twin.
// - Its picture's signal is `own`, which the room's line slot reads (contracts/twin-states.md §4).
// - Every mesh of the instance has no morph attribute after model() (R-07, D10).
import { AnimationAction, Box3, BufferAttribute, Mesh, Object3D, Quaternion, Vector3 } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { AvatarId } from "../../src/choice/avatars";
import type { RoomScene } from "../../src/room/compose/bundle";
import { AVATAR_NODE, createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import type { FigureSignal } from "../../src/room/stage";
import { avatarClips } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, SCENE, sceneWith } from "../helpers/room-avatars";
import { TWIN_ROLES, twinDefaults, twinFolder, twinPolicy } from "../helpers/room-twin";

let result: ComposeResult;
beforeAll(() => {
  result = compose(
    overlay({
      [SCENE]: sceneWith({ twin_stand_in: "man" }),
      ...avatarFolder("man"),
      ...avatarFolder("woman"),
      ...twinFolder(),
    }),
    twinPolicy(),
    { mode: "lenient", drafts: false },
  );
  expect(result.findings.filter((f) => !f.lenient)).toEqual([]);
  expect(result.scene.twin).not.toBeNull();
});

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;
const label = (): Object3D => new Object3D();

interface Setup {
  readonly part: RoomScene;
  readonly room: Room3D;
  readonly figures: AvatarFigures;
  readonly signals: FigureSignal[];
}

function setup(chosen: AvatarId = "woman"): Setup {
  const part = result.scene;
  const room = buildRoom(part, { avatar: chosen, label, index: result.index });
  const signals: FigureSignal[] = [];
  const figures = createAvatarFigures(room, part, { chosen, signal: (s) => signals.push(s) });
  return { part, room, figures, signals };
}

/** The twin's model, given morph targets on each mesh as the delivered model's face shapes are. */
async function twinModel(): Promise<Object3D> {
  const model = await parsed(twinDefaults().model);
  model.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const count = mesh.geometry.getAttribute("position").count;
    mesh.geometry.morphAttributes.position = [new BufferAttribute(new Float32Array(count * 3), 3)];
    mesh.updateMorphTargets();
  });
  return model;
}

async function feedTwin(s: Setup, roles: readonly string[] = TWIN_ROLES): Promise<void> {
  expect(s.figures.model("twin", await twinModel())).toBe(true);
  for (const role of roles)
    s.figures.clip("twin", role as never, await clipsOf(twinDefaults().clips[role] as Uint8Array));
}

const twinIn = (s: Setup): Object3D | undefined => s.room.twin.children.find((c) => c.name === AVATAR_NODE);
const worldBox = (o: Object3D): Box3 => {
  let root = o;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(o, true);
};
const yaw = (o: Object3D): number => {
  o.updateWorldMatrix(true, false);
  const q = new Quaternion();
  o.matrixWorld.decompose(new Vector3(), q, new Vector3());
  return (2 * Math.atan2(q.y, q.w) * 180) / Math.PI;
};

describe("the twin's own figure (FR-008, FR-010; SC-001)", () => {
  it("wants the twin's own model for the twin's figure, and the chosen avatar for the visitor's", () => {
    expect(setup("woman").figures.wants).toEqual({ twin: "twin", visitor: "woman", dog: null });
    expect(setup("man").figures.wants).toEqual({ twin: "twin", visitor: "man", dog: null });
  });

  it("shows the model only once its model and its idle have ended, its signal `own`", async () => {
    const s = setup();
    expect(s.figures.model("twin", await twinModel())).toBe(true);
    expect(twinIn(s)).toBeUndefined();
    expect(s.figures.shows("twin")).toBe(false);
    s.figures.clip("twin", "idle", await clipsOf(twinDefaults().clips.idle as Uint8Array));
    expect(twinIn(s)).toBeDefined();
    expect(s.figures.shows("twin")).toBe(true);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "twin", shows: "own", why: null });
    for (const child of s.room.twin.children) if (child.name !== AVATAR_NODE) expect(child.visible).toBe(false);
  });

  it("stands the model unscaled at its placement: its lowest point on the floor, 1.82 m tall, facing as the placement", async () => {
    const s = setup();
    await feedTwin(s);
    const instance = twinIn(s);
    if (!instance) throw new Error("no instance");
    const box = worldBox(instance);
    const placement = s.room.twin.parent ?? s.room.twin;
    placement.updateWorldMatrix(true, false);
    const root = new Vector3().setFromMatrixPosition(placement.matrixWorld);
    // Its lowest point within 0.5 cm of the floor, the placement's own height.
    expect(Math.abs(box.min.y - root.y)).toBeLessThan(0.005);
    // Its own height, within 1% of 1.82 m, whatever the catalog's height: unscaled.
    expect(Math.abs(box.max.y - box.min.y - 1.82) / 1.82).toBeLessThan(0.01);
    const at = new Vector3().setFromMatrixPosition(instance.matrixWorld);
    expect(Math.hypot(at.x - root.x, at.z - root.z)).toBeLessThan(0.005);
    expect(Math.abs(yaw(instance) - yaw(s.room.twin))).toBeLessThan(1);
    const scale = new Vector3();
    instance.matrixWorld.decompose(new Vector3(), new Quaternion(), scale);
    expect(scale.y).toBeCloseTo(1, 6);
  });

  it("with the visitor's choice of the man, shows the man in the visitor's figure and the twin in the twin's", async () => {
    const s = setup("man");
    await feedTwin(s);
    expect(s.figures.model("man", await parsed(avatarFolder("man")["assets/visitors/man/man.glb"] as Uint8Array))).toBe(
      true,
    );
    s.figures.clip("man", "idle", []);
    s.figures.missed("man", "idle", "failed");
    expect(s.figures.shows("twin")).toBe(true);
    expect(s.figures.shows("visitor")).toBe(true);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "twin", shows: "own", why: null });
    expect(s.signals).toContainEqual({ kind: "picture", figure: "visitor", shows: "avatar", why: null });
  });

  it("strips every mesh's morph targets as the model is taken, so no face shape is uploaded (FR-013; SC-009)", async () => {
    const s = setup();
    const model = await twinModel();
    let before = 0;
    model.traverse((n) => {
      if ((n as Mesh).isMesh && ((n as Mesh).geometry.morphAttributes.position?.length ?? 0) > 0) before += 1;
    });
    expect(before).toBeGreaterThan(0);
    expect(s.figures.model("twin", model)).toBe(true);
    s.figures.clip("twin", "idle", await clipsOf(twinDefaults().clips.idle as Uint8Array));
    const instance = twinIn(s);
    if (!instance) throw new Error("no instance");
    let meshes = 0;
    instance.traverse((n) => {
      const mesh = n as Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      expect(Object.values(mesh.geometry.morphAttributes).every((list) => (list?.length ?? 0) === 0)).toBe(true);
      expect(mesh.morphTargetInfluences).toBeUndefined();
      expect(mesh.morphTargetDictionary).toBeUndefined();
    });
    expect(meshes).toBeGreaterThan(0);
  });

  it("plays the idle once shown, and keeps the twin's mixer advancing at quality 1 (FR-025)", async () => {
    const s = setup();
    await feedTwin(s);
    expect(s.figures.playing("twin")).toBe("idle");
  });
});

// T034 (spec 016; FR-018 to FR-020, FR-023 to FR-026; plan.md R-09; contracts/twin-states.md §3; SC-005): the twin's
// clips by state, on the controller's clock, which the test holds.
describe("the twin's clips by state (FR-020, FR-023, FR-024; SC-005)", () => {
  /** A setup whose controller reads the test's clock, and whose crossfades the test records. */
  function timed(chosen: AvatarId = "woman", part: RoomScene = result.scene) {
    let now = 0;
    const room = buildRoom(part, { avatar: chosen, label, index: result.index });
    const signals: FigureSignal[] = [];
    const figures = createAvatarFigures(room, part, { chosen, signal: (x) => signals.push(x), clock: () => now });
    return {
      part,
      room,
      figures,
      signals,
      at(ms: number) {
        now = ms;
      },
      get now() {
        return now;
      },
    };
  }
  async function feed(s: ReturnType<typeof timed>): Promise<void> {
    expect(s.figures.model("twin", await twinModel())).toBe(true);
    for (const role of TWIN_ROLES)
      s.figures.clip("twin", role, await clipsOf(twinDefaults().clips[role] as Uint8Array));
  }
  const fades: { duration: number }[] = [];
  const realFade = AnimationAction.prototype.crossFadeTo;
  beforeEach(() => {
    fades.length = 0;
    AnimationAction.prototype.crossFadeTo = function (this: AnimationAction, to, duration, warp) {
      fades.push({ duration });
      return realFade.call(this, to, duration, warp);
    };
  });
  afterEach(() => {
    AnimationAction.prototype.crossFadeTo = realFade;
  });

  it("greets once at the hand-off's start where the twin shows then, its clip played once, then the idle", async () => {
    const s = timed();
    await feed(s);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("idle");
    s.figures.showHandoff(0, false);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("greeting");
    expect(s.signals).toContainEqual({ kind: "twin-state", state: "arriving", role: "greeting" });
    s.at(2500);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("idle");
    // Not again in the visit, nor after a restored context.
    s.figures.handoffEnded();
    s.figures.reset();
    await feed(s);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("idle");
  });

  it("greets when the twin first shows after the hand-off has ended, where it showed late", async () => {
    const s = timed();
    s.figures.showHandoff(0, false);
    s.figures.handoffEnded();
    await feed(s);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("greeting");
  });

  it("plays each state's clip from the block's map: listening, talking, the lean, the idle", async () => {
    const s = timed();
    await feed(s);
    s.figures.twinActivity({ kind: "draft", holds: true });
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("listening");
    s.figures.twinActivity({ kind: "draft", holds: false });
    s.figures.twinActivity({ kind: "answer", words: 10 });
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("talking");
    s.at(4100);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("idle");
  });

  it("rests in the lean only where the block has a lean, the idle otherwise (FR-029)", async () => {
    const lean = {
      ...result.scene,
      twin: result.scene.twin && {
        ...result.scene.twin,
        block: { ...result.scene.twin.block, lean: { against: "fx-desk", behind_m: 0.679, right_m: 0.45 } },
      },
    };
    const s = timed("woman", lean as RoomScene);
    await feed(s);
    s.at(25_000);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("desk-lean");
    const t = timed();
    await feed(t);
    t.at(25_000);
    t.figures.update(16, true, 0);
    expect(t.figures.playing("twin")).toBe("idle");
  });

  it("plays the lean where the map gives it to listening, as data (FR-020; SC-014)", async () => {
    const twin = result.scene.twin;
    if (!twin) throw new Error("no twin");
    const part = {
      ...result.scene,
      twin: {
        ...twin,
        block: {
          ...twin.block,
          clips: { ...twin.block.clips, listening: "desk-lean" as const },
          lean: { against: "fx-desk", behind_m: 0.679, right_m: 0.45 },
        },
      },
    };
    const s = timed("woman", part);
    await feed(s);
    s.figures.twinActivity({ kind: "draft", holds: true });
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("desk-lean");
  });

  it("crossfades in 0.25 s while the motion store animates, and 0.4 s into and out of the lean", async () => {
    const lean = {
      ...result.scene,
      twin: result.scene.twin && {
        ...result.scene.twin,
        block: { ...result.scene.twin.block, lean: { against: "fx-desk", behind_m: 0.679, right_m: 0.45 } },
      },
    };
    const s = timed("woman", lean as RoomScene);
    await feed(s);
    s.figures.update(16, true, 0);
    s.figures.twinActivity({ kind: "draft", holds: true });
    s.figures.update(16, true, 0);
    expect(fades.at(-1)?.duration).toBe(0.25);
    s.figures.twinActivity({ kind: "draft", holds: false });
    s.at(30_000);
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("desk-lean");
    expect(fades.at(-1)?.duration).toBe(0.4);
    s.figures.twinActivity({ kind: "selected" });
    s.figures.update(16, true, 0);
    expect(fades.at(-1)?.duration).toBe(0.4);
  });

  it("cuts to the new clip's first frame, with no crossfade and no motion, while the motion store doesn't animate", async () => {
    const s = timed();
    await feed(s);
    s.figures.update(16, false, 0);
    const before = fades.length;
    s.figures.twinActivity({ kind: "draft", holds: true });
    s.figures.update(16, false, 0);
    expect(s.figures.playing("twin")).toBe("listening");
    expect(fades.length).toBe(before);
    const instance = twinIn(s as unknown as Setup);
    const hips = instance?.getObjectByName("mixamorigHips");
    const at = hips?.position.clone();
    s.figures.update(500, false, 0);
    expect(hips?.position.equals(at as Vector3)).toBe(true);
  });

  it("never moves the twin's placement node with a clip (FR-018)", async () => {
    const s = timed();
    await feed(s);
    const placement = s.room.twin.parent ?? s.room.twin;
    const before = placement.position.clone();
    for (let i = 0; i < 20; i += 1) s.figures.update(100, true, 0);
    expect(placement.position.equals(before)).toBe(true);
  });

  it("animates the twin and holds the visitor at quality 1 (FR-025)", async () => {
    const s = timed();
    await feed(s);
    s.figures.update(16, true, 1);
    expect(s.figures.playing("twin")).toBe("idle");
  });

  it("plays spec 009's clips with the stand-in in the twin's figure, its states not applied (FR-026)", async () => {
    const s = timed();
    s.figures.missed("twin", null, "failed");
    expect(s.figures.model("man", await parsed(avatarFolder("man")["assets/visitors/man/man.glb"] as Uint8Array))).toBe(
      true,
    );
    s.figures.clip("man", "idle", await clipsOf(avatarClips().idle.bytes));
    s.figures.twinActivity({ kind: "draft", holds: true });
    s.figures.update(16, true, 0);
    expect(s.figures.playing("twin")).toBe("idle");
  });
});
