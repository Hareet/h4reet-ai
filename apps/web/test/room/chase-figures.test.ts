// T014 (spec 025; FR-001, FR-010, FR-012 to FR-014, FR-016, FR-017, FR-027; plan.md R-05, R-06): the run's shell,
// chase-figures.ts, and the avatar controller's part in it.
// - The shell, over a fake controller and an open floor with the twin's own obstacle on it: the pursuer from the walking
//   view's `on` and `pose`, the chosen avatar, and `shows("visitor")` (R-06); the twin's picture moves and its placement
//   stays (FR-017), and comes back home exactly; the dog's group follows its runner and plays its clip by speed
//   (FR-010); a figure that can't run is held (FR-010, FR-014); `fleeing` on only while the twin moves (FR-012); the
//   twin's stride carries its picture's place; the run's start and end said once each; the walking pose read and
//   never written (FR-016); no request and no event in a whole run (FR-027).
// - The controller, on fixture models: `pictureOf` and `legsOf`; the twin's gait advances by the distance its picture
//   moved, at `cycleLength` of its height in metres (the stand-in's `figures.twin_height`, its own model's measured
//   height, never OWN), and clears when the run ends (FR-013, R-05); the visitor's gait objects stay its own.
import { Box3, Group, Object3D, Quaternion, Vector3 } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { AvatarId } from "../../src/choice/avatars";
import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import type { RoomScene } from "../../src/room/compose/bundle";
import { createAvatarFigures, DOG_NODE } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import type { ChaseMotion } from "../../src/room/scene/chase";
import { createChaseFigures } from "../../src/room/scene/chase-figures";
import type { ChaseAvatars } from "../../src/room/scene/chase-figures";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";
import { cycleLength } from "../../src/room/scene/gait";
import type { TwinActivity } from "../../src/room/scene/twin-states";
import type { FigureId, FigureSignal } from "../../src/room/stage";
import { avatarClips, avatarGlb, clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, avatarPolicy, SCENE, sceneWith } from "../helpers/room-avatars";
import { dinosaurFolder } from "../helpers/room-dinosaur";
import { approvalOf, twinDefaults, twinFolder, twinModel, twinPolicy } from "../helpers/room-twin";

const MOVE: ChaseMotion = { animate: true, paused: false, level: 0 };
const DT = 1 / 60;
const TWIN_AT = { x: 0.66, z: 0.469 };
const DOG_AT: [number, number] = [0.3, 0.45];
const NEAR = { x: -0.2, z: 0.46 };
const OPEN: FloorRect = { x0: -2, x1: 2, z0: -2, z1: 2 };
const TWIN_RECT: FloorRect = { x0: 0.17, x1: 1.14, z0: 0.025, z1: 0.789 };

const floor: WalkableFloor = {
  radius: 0.12,
  feetY: 0,
  height: 1.7,
  shell: OPEN,
  bounds: OPEN,
  obstacles: [{ id: "fx-twin-figure", rect: TWIN_RECT }],
  start: { x: -0.7, z: 0.58 },
};
const part = {
  figures: {
    twin: "fx-twin-figure",
    dog: { home: { at: DOG_AT, heading_deg: 180 }, footprint_m: 0.3 },
    chase: CHASE_DEFAULTS,
  },
  walking: { speed_mps: 1 },
} as unknown as Pick<RoomScene, "figures" | "walking">;

interface Fake {
  readonly avatars: ChaseAvatars;
  readonly placement: Object3D;
  readonly twin: Group;
  readonly dog: Group;
  readonly shows: Record<FigureId, boolean>;
  legs: boolean;
  dogClips: { walk: boolean; run: boolean };
  readonly plays: string[];
  readonly activity: TwinActivity[];
  readonly strides: { x: number; z: number; speed: number; moving: boolean }[];
}

/** A fake controller over a twin picture inside its placement's node, turned as the room's is, and the dog's group. */
function fake(): Fake {
  const root = new Object3D();
  const placement = new Object3D();
  placement.position.set(TWIN_AT.x, 0, TWIN_AT.z);
  placement.rotation.set(0, 0.4, 0);
  const twin = new Group();
  twin.rotation.set(0, -0.1, 0);
  placement.add(twin);
  root.add(placement);
  const dog = new Group();
  dog.position.set(DOG_AT[0], 0, DOG_AT[1]);
  dog.rotation.set(0, Math.PI + Math.PI, 0);
  root.add(dog);
  root.updateMatrixWorld(true);
  const f: Fake = {
    placement,
    twin,
    dog,
    shows: { twin: true, visitor: true, dog: true },
    legs: true,
    dogClips: { walk: true, run: true },
    plays: [],
    activity: [],
    strides: [],
    avatars: {
      shows: (id) => f.shows[id],
      pictureOf: (id) => (id === "twin" ? twin : id === "dog" ? dog : null),
      legsOf: (id) => (id === "twin" && f.legs ? ({} as never) : null),
      clipOf: (avatar, role) =>
        avatar === "dog" && (role === "walk" || role === "run") && f.dogClips[role] ? ({} as AnimationClip) : null,
      dogPlays: (role) => {
        if (f.plays.at(-1) !== role) f.plays.push(role);
      },
      twinActivity: (a) => f.activity.push(a),
      stride: (_figure, x, z, speed, moving) => f.strides.push({ x, z, speed, moving }),
    },
  };
  return f;
}

interface Run {
  readonly f: Fake;
  readonly walking: { on: boolean; pose: { x: number; z: number; heading: number; speed: number; walking: boolean } };
  readonly signals: FigureSignal[];
  readonly frame: (n?: number, motion?: ChaseMotion) => void;
  readonly shell: ReturnType<typeof createChaseFigures>;
}
function run(chosen: AvatarId = "dinosaur", f: Fake = fake()): Run {
  const walking = { on: true, pose: { x: NEAR.x, z: NEAR.z, heading: 0, speed: 0, walking: false } };
  const signals: FigureSignal[] = [];
  const shell = createChaseFigures({
    floor,
    part,
    avatars: f.avatars,
    walking,
    chosen,
    signal: (s) => signals.push(s),
  });
  const frame = (n = 1, motion = MOVE): void => {
    for (let i = 0; i < n; i += 1) shell.frame(DT, motion);
  };
  return { f, walking, signals, frame, shell };
}
const world = (o: Object3D): Vector3 => {
  o.updateWorldMatrix(true, false);
  return new Vector3().setFromMatrixPosition(o.matrixWorld);
};
const yawOf = (o: Object3D): number => {
  o.updateWorldMatrix(true, false);
  const q = new Quaternion();
  o.matrixWorld.decompose(new Vector3(), q, new Vector3());
  return 2 * Math.atan2(q.y, q.w);
};
const angle = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/** Leaves the walking view and lets the run end, the delay and the walk home. */
const endRun = (r: Run): void => {
  r.walking.on = false;
  r.frame(60 * 6);
};

describe("the pursuer (FR-001; R-06)", () => {
  it("is the visitor's figure as the dinosaur, its model shown, in the walking view: the figures run", () => {
    const r = run();
    r.frame(30);
    expect(r.shell.chase.on).toBe(true);
    expect(world(r.f.twin).x).not.toBeCloseTo(TWIN_AT.x, 3);
  });

  it.each([
    ["the woman chosen", (r: Run): void => void r, "woman"],
    ["the man chosen", (r: Run): void => void r, "man"],
    ["the dog chosen", (r: Run): void => void r, "dog"],
    ["the dinosaur's cut-out (its model not shown)", (r: Run): void => void (r.f.shows.visitor = false), "dinosaur"],
    ["the walking view off", (r: Run): void => void (r.walking.on = false), "dinosaur"],
  ] as const)("doesn't start with %s", (_, change, chosen) => {
    const r = run(chosen as AvatarId);
    change(r);
    r.frame(30);
    expect(r.shell.chase.on).toBe(false);
    expect(world(r.f.twin).distanceTo(new Vector3(TWIN_AT.x, 0, TWIN_AT.z))).toBeLessThan(1e-9);
    expect(world(r.f.dog).distanceTo(new Vector3(DOG_AT[0], 0, DOG_AT[1]))).toBeLessThan(1e-9);
    expect(r.signals).toEqual([]);
  });

  it("reads the dinosaur's place from the walking view's pose each frame", () => {
    const r = run();
    r.walking.pose.x = 1.9;
    r.walking.pose.z = -1.9;
    r.frame(10);
    // Beyond flee_m the figures stand, turned toward it.
    expect(world(r.f.twin).distanceTo(new Vector3(TWIN_AT.x, 0, TWIN_AT.z))).toBeLessThan(1e-9);
    r.walking.pose.x = NEAR.x;
    r.walking.pose.z = NEAR.z;
    r.frame(10);
    expect(world(r.f.twin).distanceTo(new Vector3(TWIN_AT.x, 0, TWIN_AT.z))).toBeGreaterThan(0.05);
  });
});

describe("the pictures (FR-017; R-06)", () => {
  it("moves the twin's picture to its runner on the chase floor, its placement's node unmoved", () => {
    const r = run();
    const node = { at: r.f.placement.position.clone(), turn: r.f.placement.quaternion.clone() };
    r.frame(20);
    const runner = r.shell.chase.runner("twin");
    if (!runner) throw new Error("no twin runner");
    const at = world(r.f.twin);
    expect(at.x).toBeCloseTo(runner.x, 9);
    expect(at.z).toBeCloseTo(runner.z, 9);
    expect(at.y).toBeCloseTo(0, 9);
    // Its world turn follows the runner's facing, from the turn it had at home.
    expect(angle(yawOf(r.f.twin), runner.facing + Math.PI)).toBeLessThan(1e-9);
    expect(r.f.placement.position.equals(node.at)).toBe(true);
    expect(r.f.placement.quaternion.equals(node.turn)).toBe(true);
  });

  it("puts the twin's picture back exactly as it was once the run ends and it walks home", () => {
    const r = run();
    const at = r.f.twin.position.clone();
    const turn = r.f.twin.rotation.clone();
    r.frame(30);
    endRun(r);
    expect(r.shell.chase.phase("twin")).toBe("home");
    expect(r.f.twin.position.equals(at)).toBe(true);
    expect(r.f.twin.rotation.equals(turn)).toBe(true);
  });

  it("moves the dog's group to its runner, turned by its facing + π, and back home after", () => {
    const r = run();
    r.frame(20);
    const runner = r.shell.chase.runner("dog");
    if (!runner) throw new Error("no dog runner");
    expect(r.f.dog.position.x).toBeCloseTo(runner.x, 9);
    expect(r.f.dog.position.z).toBeCloseTo(runner.z, 9);
    expect(angle(r.f.dog.rotation.y, runner.facing + Math.PI)).toBeLessThan(1e-9);
    endRun(r);
    expect([r.f.dog.position.x, r.f.dog.position.z]).toEqual(DOG_AT);
    expect(angle(r.f.dog.rotation.y, Math.PI + Math.PI)).toBeLessThan(1e-9);
  });

  it("makes no runner for a dog the controller has no picture for", () => {
    const f = fake();
    const pictureOf = f.avatars.pictureOf;
    (f.avatars as { pictureOf: ChaseAvatars["pictureOf"] }).pictureOf = (id) => (id === "dog" ? null : pictureOf(id));
    const r = run("dinosaur", f);
    r.frame(20);
    expect(r.shell.chase.runner("dog")).toBeNull();
    expect(r.shell.chase.runner("twin")).not.toBeNull();
  });
});

describe("the dog's clip (FR-010)", () => {
  it("runs while it flees, walks home at the walking speed, then idles", () => {
    const r = run();
    r.frame(20);
    expect(r.f.plays).toContain("run");
    endRun(r);
    // It may stand mid-run (idle) where it is safe; the walk home comes after its last run, and the idle ends it.
    expect(r.f.plays.slice(r.f.plays.lastIndexOf("run") + 1).slice(-2)).toEqual(["walk", "idle"]);
  });

  it("walks at time scale 1 for a missing run, and is held at home with neither", () => {
    const walkOnly = fake();
    walkOnly.dogClips = { walk: true, run: false };
    const a = run("dinosaur", walkOnly);
    a.frame(20);
    expect(a.f.plays).toContain("walk");
    expect(a.f.plays).not.toContain("run");
    const neither = fake();
    neither.dogClips = { walk: false, run: false };
    const b = run("dinosaur", neither);
    b.frame(30);
    expect([b.f.dog.position.x, b.f.dog.position.z]).toEqual(DOG_AT);
    expect(b.f.plays.filter((p) => p !== "idle")).toEqual([]);
    expect(world(b.f.twin).x).not.toBeCloseTo(TWIN_AT.x, 3);
  });
});

describe("a figure that can't run (FR-014)", () => {
  it.each([
    ["without the leg bones or the hips bone", (f: Fake): void => void (f.legs = false)],
    ["as its capsule", (f: Fake): void => void (f.shows.twin = false)],
  ])("holds the twin %s, and the dog runs alone", (_, change) => {
    const f = fake();
    change(f);
    const r = run("dinosaur", f);
    r.frame(30);
    expect(world(r.f.twin).distanceTo(new Vector3(TWIN_AT.x, 0, TWIN_AT.z))).toBeLessThan(1e-9);
    expect(r.f.dog.position.distanceTo(new Vector3(DOG_AT[0], 0, DOG_AT[1]))).toBeGreaterThan(0.05);
    expect(r.f.activity.filter((a) => a.kind === "flee" && a.on)).toEqual([]);
    expect(r.signals).toContainEqual({ kind: "chase", state: "started", who: "dog" });
  });

  it("holds the dog where its model doesn't show, and cuts a figure home when it stops showing mid-run", () => {
    const f = fake();
    f.shows.dog = false;
    const r = run("dinosaur", f);
    r.frame(30);
    expect([r.f.dog.position.x, r.f.dog.position.z]).toEqual(DOG_AT);
    r.f.shows.twin = false;
    r.frame(1);
    expect(world(r.f.twin).distanceTo(new Vector3(TWIN_AT.x, 0, TWIN_AT.z))).toBeLessThan(1e-9);
  });

  it("moves nothing where no figure shows (below the floor, a lost context, the 2D room's last frame)", () => {
    const f = fake();
    f.shows.twin = false;
    f.shows.dog = false;
    f.shows.visitor = false;
    const r = run("dinosaur", f);
    r.frame(30);
    expect(r.shell.chase.on).toBe(false);
    expect(r.signals).toEqual([]);
    expect(r.f.strides.every((s) => !s.moving)).toBe(true);
  });
});

describe("fleeing, the twin's stride, and the run's words (FR-012, FR-013, FR-025)", () => {
  it("sets the twin's fleeing on once while it moves and off once when it is home", () => {
    const r = run();
    r.frame(30);
    endRun(r);
    expect(r.f.activity).toEqual([
      { kind: "flee", on: true },
      { kind: "flee", on: false },
    ]);
  });

  it("gives the twin's stride its picture's place each frame, moving while it runs and not once home", () => {
    const r = run();
    r.frame(20);
    const last = r.f.strides.at(-1);
    const runner = r.shell.chase.runner("twin");
    if (!last || !runner) throw new Error("no stride");
    expect(last).toEqual({ x: runner.x, z: runner.z, speed: runner.speed, moving: true });
    endRun(r);
    expect(r.f.strides.at(-1)?.moving).toBe(false);
  });

  it("says the start and the end once each, as the stage's chase signal", () => {
    const r = run();
    r.frame(30);
    endRun(r);
    expect(r.signals).toEqual([
      { kind: "chase", state: "started", who: "both" },
      { kind: "chase", state: "ended", who: "both" },
    ]);
  });
});

describe("the visitor and the network (FR-016, FR-027)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the walking pose and never writes it, and sends no request and no event in a whole run", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn();
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    const r = run();
    Object.freeze(r.walking.pose);
    const before = { ...r.walking.pose };
    r.frame(30);
    endRun(r);
    expect(r.walking.pose).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(r.signals.every((s) => s.kind === "chase")).toBe(true);
    vi.unstubAllGlobals();
  });
});

// ---- The controller's part, on fixture models (R-05) ----

const loader = new GLTFLoader();
const parsed = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;
const CLIPS = avatarClips();
const legged = avatarGlb({ legs: true }).bytes;
const ownLegged = twinModel({ legs: true });

interface Real {
  readonly figures: AvatarFigures;
  readonly room: Room3D;
  readonly part: RoomScene;
}
// Spec 028 (T-B02; FR-018; plan.md R-B8): the room's dog is wanted only in a dinosaur visit whose bundle carries the
// dinosaur's model, so `dino` adds the dinosaur's folder and chooses it; every other case keeps the woman.
function real(o: { own?: boolean; manLegs?: boolean; dog?: boolean; dino?: boolean } = {}): Real {
  const files = {
    [SCENE]: sceneWith({
      twin_stand_in: "man",
      ...(o.dog ? { dog: { home: { at: DOG_AT, heading_deg: 180 }, footprint_m: 0.3 } } : {}),
    }),
    ...avatarFolder("man", o.manLegs === false ? {} : { model: legged }),
    ...avatarFolder("woman"),
    ...(o.dog
      ? avatarFolder("dog", {
          model: avatarGlb({ height: 1.3, hands: false, legs: true }).bytes,
          clips: {
            idle: clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes,
            "idle-holding": null,
            take: null,
          },
          records: (e) => {
            for (const x of e) {
              x.likeness = false;
              x.source = { type: "asset", id: "AS-dog-model" };
            }
          },
        })
      : {}),
    ...(o.own ? twinFolder({ model: ownLegged }) : {}),
    ...(o.dino ? dinosaurFolder() : {}),
  };
  const policy = o.own ? twinPolicy({ likeness: [approvalOf(ownLegged)] }) : avatarPolicy();
  const composed = compose(overlay(files), policy, { mode: "lenient", drafts: false });
  const chosen: AvatarId = o.dino ? "dinosaur" : "woman";
  const room = buildRoom(composed.scene, { avatar: chosen, label: () => new Object3D(), index: composed.index });
  const figures = createAvatarFigures(room, composed.scene, { chosen });
  figures.handoffEnded();
  return { figures, room, part: composed.scene };
}
async function standIn(r: Real, model = legged): Promise<void> {
  // The twin's figure wants the man as its stand-in where the part has no own model.
  expect(r.figures.model("man", await parsed(model))).toBe(true);
  r.figures.clip("man", "idle", await clipsOf(CLIPS.idle.bytes));
}
async function ownTwin(r: Real): Promise<void> {
  expect(r.figures.model("twin", await parsed(ownLegged))).toBe(true);
  r.figures.clip("twin", "idle", await clipsOf(twinDefaults().clips.idle as Uint8Array));
}
const LEGS = ["UpLeg", "Leg", "Foot"].flatMap((p) => ["Left", "Right"].map((s) => `mixamorig${s}${p}`));
const legQuats = (root: Object3D): Quaternion[] =>
  LEGS.map((n) => (root.getObjectByName(n) as Object3D).quaternion.clone());
const instanceIn = (group: Object3D): Object3D => group.getObjectByName("avatar") as Object3D;

/** The twin strides `n` frames along +x at its run speed, from its home, each frame then the controller's update. */
function strideTwin(r: Real, n: number, speed = 2): void {
  for (let i = 0; i <= n; i += 1) {
    r.figures.stride("twin", 0.66 + speed * DT * i, 0.469, speed, true);
    r.figures.update(DT * 1000, true, 0);
  }
}

describe("pictureOf and legsOf (R-06)", () => {
  // Spec 028 (FR-018; plan.md R-B8): the room with a dog is now a dinosaur visit with the dinosaur's model; the name kept.
  it("gives each figure's picture group, the dog's only where the room has one", async () => {
    const r = real({ dog: true, dino: true });
    expect(r.figures.pictureOf("twin")).toBe(r.room.twin);
    expect(r.figures.pictureOf("visitor")).toBe(r.room.visitor);
    expect(r.figures.pictureOf("dog")?.name).toBe(DOG_NODE);
    expect(real().figures.pictureOf("dog")).toBeNull();
  });

  it("gives the twin's leg rig where its shown model has the leg bones and the hips, else null", async () => {
    const r = real();
    expect(r.figures.legsOf("twin")).toBeNull();
    await standIn(r);
    expect(r.figures.legsOf("twin")).not.toBeNull();
    const bare = real({ manLegs: false });
    await standIn(bare, avatarGlb().bytes);
    expect(bare.figures.shows("twin")).toBe(true);
    expect(bare.figures.legsOf("twin")).toBeNull();
  });
});

describe("the twin's gait while it runs (FR-013; R-05)", () => {
  it("advances by the distance moved at the stand-in's height, figures.twin_height, and moves its legs", async () => {
    const r = real();
    await standIn(r);
    const rest = legQuats(instanceIn(r.room.twin));
    strideTwin(r, 1);
    const step = 2 * DT;
    expect(r.figures.gaitFrame("twin").state.phase).toBeCloseTo(step / cycleLength(r.part.figures.twin_height), 9);
    strideTwin(r, 30);
    expect(r.figures.gaitFrame("twin").state.amp).toBeGreaterThan(0);
    const moved = legQuats(instanceIn(r.room.twin)).some((q, i) => q.angleTo(rest[i] as Quaternion) > 0.01);
    expect(moved).toBe(true);
  });

  it("advances at its own model's measured height in metres, never OWN", async () => {
    const r = real({ own: true });
    await ownTwin(r);
    expect(r.figures.shows("twin")).toBe(true);
    r.figures.twinActivity({ kind: "flee", on: true });
    const box = new Box3().setFromObject(await parsed(ownLegged), true);
    const height = box.max.y - box.min.y;
    strideTwin(r, 1);
    const phase = r.figures.gaitFrame("twin").state.phase;
    expect(phase).toBeCloseTo((2 * DT) / cycleLength(height), 9);
    expect(phase).toBeGreaterThan(0);
  });

  it("clears when the run ends: the legs back to the clip's pose, the amplitude 0", async () => {
    const r = real();
    await standIn(r);
    const rest = legQuats(instanceIn(r.room.twin));
    strideTwin(r, 30);
    for (let i = 0; i < 30; i += 1) {
      r.figures.stride("twin", 0.66, 0.469, 0, false);
      r.figures.update(DT * 1000, true, 0);
    }
    expect(r.figures.gaitFrame("twin").state.amp).toBe(0);
    legQuats(instanceIn(r.room.twin)).forEach((q, i) => expect(q.angleTo(rest[i] as Quaternion)).toBeLessThan(1e-9));
  });

  it("doesn't step at quality level 1, under reduced motion, or off its idle", async () => {
    const r = real();
    await standIn(r);
    for (let i = 0; i < 10; i += 1) {
      r.figures.stride("twin", 0.66 + 0.03 * i, 0.469, 2, true);
      r.figures.update(DT * 1000, true, 1);
    }
    expect(r.figures.gaitFrame("twin").state.amp).toBe(0);
    for (let i = 0; i < 10; i += 1) {
      r.figures.stride("twin", 0.66 + 0.03 * i, 0.469, 2, true);
      r.figures.update(DT * 1000, false, 0);
    }
    expect(r.figures.gaitFrame("twin").state.amp).toBe(0);
  });

  it("keeps the visitor's gait objects its own: gaitFrame() is the visitor's, gaitFrame(\"twin\") another", async () => {
    const r = real();
    expect(r.figures.gaitFrame()).toBe(r.figures.gaitFrame("visitor"));
    expect(r.figures.gaitFrame("twin")).not.toBe(r.figures.gaitFrame("visitor"));
    expect(r.figures.gaitFrame("twin").state).not.toBe(r.figures.gaitFrame("visitor").state);
  });
});
