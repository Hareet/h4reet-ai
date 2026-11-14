// T003 (spec 026; FR-007, FR-008, SC-002; plan.md R-03, R-04, amended by the page's Q212, taken provisionally): the
// reach's bones on the twin's real model and the man's, read in Node as the measure reads them
// (pet-reach-measure.test.ts), each placed at the twin's home, turned by the aim, at its size in the room. With the dog of
// 0.62 m at its default home and the measured defaults (the crouch and the lean), the hand on the dog's side comes within
// 0.08 m of the target at the stroke's middle; the feet stay where the clip has them; only the reach's bones change; and
// after `clearReach`, and after a frame the mixer wrote, every bone is the clip's own.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AnimationMixer, Group, Object3D, Quaternion, Vector3 } from "three";
import type { AnimationClip } from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { AVATAR_SHAPES } from "../../src/choice/avatars";
import { stripMorphs } from "../../src/room/scene/avatars";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { PET_DEFAULTS } from "../../src/room/scene/pet";
import { applyReach, clearReach, findReachRig, strokeTarget } from "../../src/room/scene/pet-reach";
import type { ReachRig, Vec3 } from "../../src/room/scene/pet-reach";
import { avatarGlb } from "../helpers/glb";
import { REPO } from "../helpers/room";

const decode: Decode = (_source, options) =>
  Promise.resolve({
    width: options.resizeWidth ?? 1,
    height: options.resizeHeight ?? 1,
    close: () => undefined,
  } as unknown as ImageBitmap);

const DEG = Math.PI / 180;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const TWIN_HOME = v(0.66, 0, 0.469);
const HOMES: ReadonlyArray<readonly [string, Vec3]> = [
  ["spec 025's estimate [0.36, 0.55]", v(0.36, 0, 0.55)],
  ["Q158's estimate [0.30, 0.45]", v(0.3, 0, 0.45)],
];
const MAN_HEIGHT = 1.76;
const TWIN_HEIGHT = 1.82;

async function parsed(file: string): Promise<{ root: Object3D; clips: AnimationClip[] }> {
  const bytes = new Uint8Array(readFileSync(join(REPO, file)));
  const gltf = (await parseModel(bytes.slice().buffer, { reduced: false, decode })).gltf;
  stripMorphs(gltf.scene);
  return { root: gltf.scene, clips: gltf.animations };
}

interface Figure {
  readonly name: string;
  readonly model: string;
  readonly idle: string;
  readonly scale: number;
  root?: Object3D;
  clip?: AnimationClip | undefined;
}

const FIGURES: Figure[] = [
  { name: "twin", model: "assets/twin/twin.glb", idle: "assets/twin/idle.glb", scale: 1 },
  {
    name: "man",
    model: "assets/visitors/man/man.glb",
    idle: "assets/visitors/man/man-idle.glb",
    scale: TWIN_HEIGHT / MAN_HEIGHT,
  },
];

beforeAll(async () => {
  for (const f of FIGURES) {
    f.root = (await parsed(f.model)).root;
    f.clip = (await parsed(f.idle)).clips[0];
  }
}, 180_000);

/** The figure's model in a picture at the twin's home, turned by the aim toward `home` (clamped to 60°), at its size. */
function placed(f: Figure, home: Vec3): { picture: Group; root: Object3D } {
  const root = (f.root as Object3D).clone(true);
  const picture = new Group();
  const psi = Math.max(-60 * DEG, Math.min(60 * DEG, Math.atan2(home.x - TWIN_HOME.x, home.z - TWIN_HOME.z)));
  picture.position.set(TWIN_HOME.x, 0, TWIN_HOME.z);
  picture.rotation.y = psi;
  picture.scale.setScalar(f.scale);
  picture.add(root);
  picture.updateMatrixWorld(true);
  return { picture, root };
}

/** R-03's target at the stroke's share `u`: the head point of a dog at `home`, heading 0 (its head +z), lowered 0.03 m
 *  and moved 0.05 m toward the twin, then along its heading by the stroke. */
function target(home: Vec3, u = 0.5): Vec3 {
  const h = AVATAR_SHAPES.dog.height;
  const head = v(home.x, 0.9 * h, home.z + 0.35 * h);
  const bx = TWIN_HOME.x - head.x;
  const bz = TWIN_HOME.z - head.z;
  const m = Math.hypot(bx, bz);
  const base = v(head.x + (0.05 * bx) / m, head.y - 0.03, head.z + (0.05 * bz) / m);
  return strokeTarget(base, 0, u, PET_DEFAULTS, v(0, 0, 0));
}

const world = (root: Object3D, bone: string): Vector3 =>
  (root.getObjectByName(`mixamorig${bone}`) as Object3D).getWorldPosition(new Vector3());
const worldQ = (root: Object3D, bone: string): Quaternion =>
  (root.getObjectByName(`mixamorig${bone}`) as Object3D).getWorldQuaternion(new Quaternion());

interface Snap {
  readonly q: Map<string, Quaternion>;
  readonly p: Map<string, Vector3>;
}
function snap(root: Object3D): Snap {
  const q = new Map<string, Quaternion>();
  const p = new Map<string, Vector3>();
  root.traverse((o) => {
    if (!o.name.startsWith("mixamorig")) return;
    q.set(o.name, o.quaternion.clone());
    p.set(o.name, o.position.clone());
  });
  return { q, p };
}
/** The bones whose rotation or position differs from the snapshot's (exactly). */
function changed(root: Object3D, s: Snap): { rotated: string[]; moved: string[] } {
  const rotated: string[] = [];
  const moved: string[] = [];
  root.traverse((o) => {
    if (!o.name.startsWith("mixamorig")) return;
    if (!o.quaternion.equals(s.q.get(o.name) as Quaternion)) rotated.push(o.name.slice(9));
    if (!o.position.equals(s.p.get(o.name) as Vector3)) moved.push(o.name.slice(9));
  });
  return { rotated: rotated.sort(), moved: moved.sort() };
}

const CFG = PET_DEFAULTS;
const ALLOWED_ROTATED = [
  "LeftFoot",
  "LeftLeg",
  "LeftUpLeg",
  "RightArm",
  "RightFoot",
  "RightForeArm",
  "RightLeg",
  "RightUpLeg",
  "Spine",
  "Spine1",
  "Spine2",
];

describe("findReachRig (R-04)", () => {
  it("finds the reach's bones on each side of both real rigs", () => {
    for (const f of FIGURES) {
      const { root } = placed(f, HOMES[1]![1]);
      for (const side of ["right", "left"] as const) {
        const rig = findReachRig(root, side);
        expect(rig, `${f.name} ${side}`).not.toBeNull();
        expect((rig as ReachRig).side).toBe(side);
      }
    }
  });

  it("gives null on a rig without them", async () => {
    expect(findReachRig(new Object3D(), "right")).toBeNull();
    // The fixture avatar (test/helpers/glb.ts) has a spine of one bone and no forearm.
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const fixture = (await new GLTFLoader().parseAsync(avatarGlb({ legs: true }).bytes.slice().buffer, "")).scene;
    expect(findReachRig(fixture, "right")).toBeNull();
  });
});

describe("applyReach on the real rigs, at the measured defaults (SC-002; Q212)", () => {
  for (const f of FIGURES) {
    for (const [label, home] of HOMES) {
      it(`${f.name}, the dog at ${label}: the hand within 0.08 m at the stroke's middle, the feet kept`, () => {
        const { picture, root } = placed(f, home);
        const rig = findReachRig(root, "right") as ReachRig;
        const T = target(home);
        const feet = ["LeftFoot", "RightFoot"].map((b) => [world(root, b), worldQ(root, b)] as const);
        const hips = world(root, "Hips");
        applyReach(rig, T, 1, CFG);
        picture.updateMatrixWorld(true);
        const hand = world(root, "RightHandMiddle1");
        const miss = hand.distanceTo(new Vector3(T.x, T.y, T.z));
        console.log(
          `${f.name} at ${label}: the hand ${miss.toFixed(4)} m from the target; hips down ${(hips.y - world(root, "Hips").y).toFixed(3)} m`,
        );
        expect(miss).toBeLessThan(0.08);
        // The crouch: the hips lowered, never past the limit; the feet where the clip had them.
        const fall = hips.y - world(root, "Hips").y;
        expect(fall).toBeGreaterThan(0);
        expect(fall).toBeLessThanOrEqual(CFG.crouch_max_m + 1e-6);
        ["LeftFoot", "RightFoot"].forEach((b, i) => {
          const [p, q] = feet[i]!;
          expect(world(root, b).distanceTo(p), b).toBeLessThan(1e-3);
          expect(Math.abs(worldQ(root, b).dot(q)), b).toBeGreaterThan(1 - 1e-5);
        });
      });
    }
  }

  it("changes only the reach's bones: the spine, the arm's two, the hips' position, and the legs", () => {
    for (const f of FIGURES) {
      const { root } = placed(f, HOMES[1]![1]);
      const rig = findReachRig(root, "right") as ReachRig;
      const before = snap(root);
      applyReach(rig, target(HOMES[1]![1]), 1, CFG);
      const { rotated, moved } = changed(root, before);
      expect(
        rotated.filter((b) => !ALLOWED_ROTATED.includes(b)),
        f.name,
      ).toEqual([]);
      expect(moved, f.name).toEqual(["Hips"]);
      expect(rotated).toContain("RightArm");
      expect(rotated).toContain("RightForeArm");
    }
  });

  it("keeps the elbow within elbow_deg and the hips' rotation the clip's", () => {
    for (const f of FIGURES) {
      const { picture, root } = placed(f, HOMES[0]![1]);
      const rig = findReachRig(root, "right") as ReachRig;
      const hipsQ = (root.getObjectByName("mixamorigHips") as Object3D).quaternion.clone();
      applyReach(rig, target(HOMES[0]![1]), 1, CFG);
      picture.updateMatrixWorld(true);
      const [s, e, m] = ["RightArm", "RightForeArm", "RightHandMiddle1"].map((b) => world(root, b)) as [
        Vector3,
        Vector3,
        Vector3,
      ];
      const bend = Math.PI - e.clone().sub(s).angleTo(m.clone().sub(e));
      expect(Math.PI - bend).toBeLessThanOrEqual(CFG.elbow_deg * DEG + 1e-6);
      expect((root.getObjectByName("mixamorigHips") as Object3D).quaternion.equals(hipsQ)).toBe(true);
    }
  });

  it("at a partial weight bends less, the feet still kept", () => {
    const f = FIGURES[0]!;
    const { picture, root } = placed(f, HOMES[1]![1]);
    const rig = findReachRig(root, "right") as ReachRig;
    const foot = world(root, "RightFoot");
    const hips = world(root, "Hips").y;
    applyReach(rig, target(HOMES[1]![1]), 0.5, CFG);
    picture.updateMatrixWorld(true);
    const half = hips - world(root, "Hips").y;
    applyReach(rig, target(HOMES[1]![1]), 1, CFG);
    picture.updateMatrixWorld(true);
    const full = hips - world(root, "Hips").y;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
    expect(world(root, "RightFoot").distanceTo(foot)).toBeLessThan(1e-3);
  });

  it("is deterministic", () => {
    const f = FIGURES[1]!;
    const runs = [0, 1].map(() => {
      const { root } = placed(f, HOMES[0]![1]);
      applyReach(findReachRig(root, "right") as ReachRig, target(HOMES[0]![1], 0.3), 1, CFG);
      return snap(root);
    });
    for (const [name, q] of runs[0]!.q) expect(q.equals(runs[1]!.q.get(name) as Quaternion), name).toBe(true);
  });
});

describe("clearReach: every bone the clip's own (FR-008)", () => {
  it("puts back the rest pose exactly, and a second clear changes nothing", () => {
    for (const f of FIGURES) {
      const { root } = placed(f, HOMES[1]![1]);
      const rig = findReachRig(root, "right") as ReachRig;
      const before = snap(root);
      applyReach(rig, target(HOMES[1]![1]), 1, CFG);
      clearReach(rig);
      expect(changed(root, before), f.name).toEqual({ rotated: [], moved: [] });
      clearReach(rig);
      expect(changed(root, before), f.name).toEqual({ rotated: [], moved: [] });
    }
  });

  /** The same figure with the idle clip alone, `seconds` in: the clip's own pose, the reference. A bone the clip has no
   *  track for holds the rest pose there, which the reach's snapshot after a mixer frame wouldn't show. */
  function clipOnly(f: Figure, seconds: readonly number[]): Snap {
    const { root } = placed(f, HOMES[1]![1]);
    const mixer = new AnimationMixer(root);
    mixer.clipAction(f.clip as AnimationClip).play();
    for (const dt of seconds) mixer.update(dt);
    return snap(root);
  }

  it("over the idle clip: after a frame the mixer wrote, the reach takes it as the base and clears back to it", () => {
    for (const f of FIGURES) {
      const { root } = placed(f, HOMES[1]![1]);
      const rig = findReachRig(root, "right") as ReachRig;
      const mixer = new AnimationMixer(root);
      mixer.clipAction(f.clip as AnimationClip).play();
      mixer.update(0.2);
      applyReach(rig, target(HOMES[1]![1]), 1, CFG);
      // The mixer writes the next frame over the reach; the reach lays itself over that one.
      mixer.update(0.4);
      const own = clipOnly(f, [0.2, 0.4]);
      applyReach(rig, target(HOMES[1]![1], 0.6), 1, CFG);
      expect(changed(root, own).rotated.length, f.name).toBeGreaterThan(0);
      clearReach(rig);
      expect(changed(root, own), f.name).toEqual({ rotated: [], moved: [] });
    }
  });

  it("clears a frame the mixer wrote after the reach to the clip's own", () => {
    for (const f of FIGURES) {
      const { root } = placed(f, HOMES[1]![1]);
      const rig = findReachRig(root, "right") as ReachRig;
      const mixer = new AnimationMixer(root);
      mixer.clipAction(f.clip as AnimationClip).play();
      mixer.update(0.2);
      applyReach(rig, target(HOMES[1]![1]), 1, CFG);
      mixer.update(0.4);
      clearReach(rig);
      expect(changed(root, clipOnly(f, [0.2, 0.4])), f.name).toEqual({ rotated: [], moved: [] });
    }
  });

  const LEG_BONES = ["LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"];

  it("a run's cut (legs off): from its first frame no leg bone, and not the hips, is the reach's; the arm and spine ease (Q226)", () => {
    for (const f of FIGURES) {
      const { root } = placed(f, HOMES[1]![1]);
      const rig = findReachRig(root, "right") as ReachRig;
      const own = snap(root);
      applyReach(rig, target(HOMES[1]![1]), 1, CFG);
      expect(changed(root, own).moved, f.name).toEqual(["Hips"]);
      // The cut's first frame: the arm and the spine at a weight still easing, the crouch gone at once.
      applyReach(rig, target(HOMES[1]![1]), 0.9, CFG, false);
      const { rotated, moved } = changed(root, own);
      expect(moved, f.name).toEqual([]);
      expect(
        rotated.filter((b) => LEG_BONES.includes(b)),
        f.name,
      ).toEqual([]);
      expect(rotated, f.name).toContain("RightArm");
      expect(rotated, f.name).toContain("Spine");
      expect(rig.hips.on, f.name).toBe(false);
      for (const leg of rig.legs) for (const b of [leg.up, leg.knee, leg.foot]) expect(b.on, f.name).toBe(false);
      // The ease's last frame clears the rest.
      applyReach(rig, target(HOMES[1]![1]), 0, CFG, false);
      expect(changed(root, own), f.name).toEqual({ rotated: [], moved: [] });
    }
  });

  it("a run's cut (legs off) never writes a leg bone or the hips the run wrote (Q226)", () => {
    const axis = new Vector3(1, 0, 0);
    for (const f of FIGURES) {
      const { root } = placed(f, HOMES[1]![1]);
      const rig = findReachRig(root, "right") as ReachRig;
      applyReach(rig, target(HOMES[1]![1]), 1, CFG);
      // The run's layers write the legs and the hips this frame (by hand here: the idle clip has no track for them, so
      // its mixer can't stand in), then the reach eases out.
      LEG_BONES.forEach((b, i) =>
        (root.getObjectByName(`mixamorig${b}`) as Object3D).quaternion.setFromAxisAngle(axis, 0.1 + 0.05 * i),
      );
      rig.hips.node.position.y += 0.02;
      const run = snap(root);
      applyReach(rig, target(HOMES[1]![1]), 0.8, CFG, false);
      const { rotated, moved } = changed(root, run);
      expect(moved, f.name).toEqual([]);
      expect(
        rotated.filter((b) => LEG_BONES.includes(b)),
        f.name,
      ).toEqual([]);
      expect(rotated, f.name).toContain("RightArm");
    }
  });

  it("a weight of 0 clears the reach", () => {
    const f = FIGURES[1]!;
    const { root } = placed(f, HOMES[1]![1]);
    const rig = findReachRig(root, "right") as ReachRig;
    const before = snap(root);
    applyReach(rig, target(HOMES[1]![1]), 1, CFG);
    applyReach(rig, target(HOMES[1]![1]), 0, CFG);
    expect(changed(root, before)).toEqual({ rotated: [], moved: [] });
  });
});
