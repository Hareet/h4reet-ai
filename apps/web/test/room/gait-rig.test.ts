// T004 (spec 019; FR-005, FR-006, FR-008; R-07): the leg rig, found on the studio's real models. Each GLB's JSON chunk
// is read and its node tree built from the nodes' translation, rotation, and scale alone: no textures, no renderer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Object3D, PropertyBinding, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { AVATAR_SHAPES } from "../../src/choice/avatars";
import { applyGait, clearGait, findLegRig, legOffsets, standingLift } from "../../src/room/scene/gait";
import type { LegRig } from "../../src/room/scene/gait";
import { REPO } from "../helpers/room";

interface GltfNode {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
}

interface Gltf {
  nodes: GltfNode[];
  scenes: { nodes: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  accessors: { max?: number[] }[];
}

const jsonOf = (path: string): Gltf => {
  const bytes = readFileSync(join(REPO, path));
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString("utf8")) as Gltf;
};

/** The model's height in its own units: its meshes stand from 0 up to the highest vertex's y. */
function heightOf(path: string): number {
  const json = jsonOf(path);
  return Math.max(
    ...json.meshes.flatMap((m) => m.primitives.map((p) => json.accessors[p.attributes.POSITION]?.max?.[1] ?? 0)),
  );
}

/** A GLB's scene as Object3Ds, names sanitized as three's loader sanitizes them. */
function treeOf(path: string): Object3D {
  const json = jsonOf(path);
  const made = json.nodes.map((n) => {
    const o = new Object3D();
    o.name = PropertyBinding.sanitizeNodeName(n.name ?? "");
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => n.children?.forEach((c) => made[i]?.add(made[c] as Object3D)));
  const root = new Object3D();
  for (const i of json.scenes[0]?.nodes ?? []) root.add(made[i] as Object3D);
  root.updateMatrixWorld(true);
  return root;
}

/** The largest component's difference: the real files' rotations aren't exactly unit, which angleTo would count. */
const apart = (a: Quaternion, b: Quaternion): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));

const worldOf = (o: Object3D): Vector3 => {
  o.updateWorldMatrix(true, false);
  return new Vector3().setFromMatrixPosition(o.matrixWorld);
};

describe.each(["man", "woman"])("the leg rig on the %s", (id) => {
  const path = `assets/visitors/${id}/${id}.glb`;

  it("finds the six leg bones", () => {
    const rig = findLegRig(treeOf(path)) as LegRig;
    expect(rig).not.toBeNull();
    for (const side of [rig.left, rig.right])
      for (const t of [side.hip, side.knee, side.ankle])
        expect(t.node.name).toMatch(/^mixamorig(Left|Right)(UpLeg|Leg|Foot)$/);
  });

  // T014 (FR-008, FR-015; plan §2.6, R-08): the hips bone, and the legs measured in the hips bone's parent space.
  it("finds the hips bone, and gives a model without it null", () => {
    const rig = findLegRig(treeOf(path)) as LegRig;
    expect(rig.hips.node.name).toBe("mixamorigHips");
    const root = treeOf(path);
    (root.getObjectByName("mixamorigHips") as Object3D).name = "mixamorigPelvis";
    expect(findLegRig(root)).toBeNull();
  });

  it("measures each thigh and shin from the GLB's node data, in the plane of the avatar's down and front", () => {
    const root = treeOf(path);
    const rig = findLegRig(root) as LegRig;
    // The studio's `rig` node is the hips bone's parent and carries no transform: its space is the root's.
    expect(rig.down.x).toBeCloseTo(0, 9);
    expect(rig.down.y).toBeCloseTo(-1, 9);
    expect(rig.down.z).toBeCloseTo(0, 9);
    for (const which of ["Left", "Right"] as const) {
      const at = (bone: string): Vector3 =>
        root.worldToLocal(worldOf(root.getObjectByName(`mixamorig${which}${bone}`) as Object3D));
      const [hip, knee, ankle] = [at("UpLeg"), at("Leg"), at("Foot")];
      const thigh = knee.clone().sub(hip);
      const shin = ankle.clone().sub(knee);
      const shape = rig.shape[which === "Left" ? "left" : "right"];
      expect(shape.thigh).toBeCloseTo(Math.hypot(thigh.y, thigh.z), 6);
      expect(shape.shin).toBeCloseTo(Math.hypot(shin.y, shin.z), 6);
      expect(shape.thighAngle).toBeCloseTo(Math.atan2(thigh.z, -thigh.y), 6);
      expect(shape.shinAngle).toBeCloseTo(Math.atan2(shin.z, -shin.y), 6);
      // The node data's own lengths: the knee's and the ankle's translations; the leg nearly in the plane.
      const knot = (bone: string): number =>
        (root.getObjectByName(`mixamorig${which}${bone}`) as Object3D).position.length();
      expect(shape.thigh / knot("Leg")).toBeGreaterThan(0.97);
      expect(shape.thigh).toBeLessThanOrEqual(knot("Leg") + 1e-6);
      expect(shape.shin / knot("Foot")).toBeGreaterThan(0.97);
      expect(shape.shin).toBeLessThanOrEqual(knot("Foot") + 1e-6);
    }
  });

  it("keeps the lower ankle within 2 cm of its standing height through a cycle at the room's height (SC-006)", () => {
    const run = (lowered: boolean): number => {
      const root = treeOf(path);
      root.scale.setScalar(AVATAR_SHAPES[id as "man" | "woman"].height / heightOf(path));
      root.updateMatrixWorld(true);
      const rig = findLegRig(root) as LegRig;
      const ankles = [rig.left.ankle.node, rig.right.ankle.node];
      const lowest = (): number => Math.min(...ankles.map((a) => worldOf(a).y));
      const standing = lowest();
      let most = 0;
      for (let i = 0; i < 64; i += 1) {
        const offsets = legOffsets(i / 64, 1);
        applyGait(rig, offsets, lowered ? standingLift(offsets, rig.shape) : 0);
        root.updateMatrixWorld(true);
        const off = lowest() - standing;
        if (Math.abs(off) > Math.abs(most)) most = off;
      }
      return most;
    };
    expect(Math.abs(run(true))).toBeLessThanOrEqual(0.02);
    // The control: the same cycle with the hips still lifts the lower ankle past 2 cm, so the test can see a hover.
    expect(run(false)).toBeGreaterThan(0.02);
  });

  it("gives the hips bone the clip's position back after clearGait, to 1e-9, also after the mixer wrote it (SC-002)", () => {
    const root = treeOf(path);
    const rig = findLegRig(root) as LegRig;
    const hips = rig.hips.node;
    const before = hips.position.clone();
    const offsets = legOffsets(0.125, 1);
    const lift = standingLift(offsets, rig.shape);
    expect(lift).toBeGreaterThan(0.005);
    applyGait(rig, offsets, lift);
    expect(hips.position.distanceTo(before)).toBeGreaterThan(0.005);
    applyGait(rig, offsets, lift);
    clearGait(rig);
    expect(hips.position.distanceTo(before)).toBeLessThan(1e-9);
    // The mixer writes a new position between two of the gait's frames: that is the new base.
    applyGait(rig, offsets, lift);
    const clip = new Vector3(0.01, 0.9, 0.02);
    hips.position.copy(clip);
    applyGait(rig, offsets, lift);
    applyGait(rig, offsets, lift);
    clearGait(rig);
    expect(hips.position.distanceTo(clip)).toBeLessThan(1e-9);
    // The rotation is the clip's throughout (FR-005).
    expect(apart(hips.quaternion, (treeOf(path).getObjectByName("mixamorigHips") as Object3D).quaternion)).toBe(0);
  });

  // R-07, for each leg on its own (T013 added the right's beside the left's).
  it.each(["left", "right"] as const)(
    "swings the %s foot toward +z on a positive hip offset, and bends its shin backward on a positive knee offset (R-07)",
    (which) => {
      const root = treeOf(path);
      const rig = findLegRig(root) as LegRig;
      const zero = { hip: 0, knee: 0, ankle: 0 };
      const only = (angles: typeof zero) =>
        which === "left" ? { left: angles, right: zero } : { left: zero, right: angles };
      const foot = rig[which].ankle.node;
      const knee = rig[which].knee.node;
      const rest = { foot: worldOf(foot), knee: worldOf(knee) };
      applyGait(rig, only({ ...zero, hip: 0.3 }));
      root.updateMatrixWorld(true);
      expect(worldOf(foot).z - rest.foot.z).toBeGreaterThan(0.05);
      clearGait(rig);
      root.updateMatrixWorld(true);
      applyGait(rig, only({ ...zero, knee: 0.5 }));
      root.updateMatrixWorld(true);
      // The shin swings back: the foot's z, relative to the knee's, falls.
      expect(worldOf(foot).z - worldOf(knee).z).toBeLessThan(rest.foot.z - rest.knee.z - 0.05);
    },
  );

  it("leaves the clip's rotations where they were after clearGait, to 1e-9 (SC-002)", () => {
    const root = treeOf(path);
    const rig = findLegRig(root) as LegRig;
    const bones = [rig.left, rig.right].flatMap((s) => [s.hip.node, s.knee.node, s.ankle.node]);
    const before = bones.map((b) => b.quaternion.clone());
    const off = { hip: 0.3, knee: 0.4, ankle: -0.1 };
    applyGait(rig, { left: off, right: off });
    applyGait(rig, { left: off, right: off });
    clearGait(rig);
    bones.forEach((b, i) => expect(apart(b.quaternion, before[i] as Quaternion)).toBeLessThan(1e-9));
  });

  it("takes a clip's new pose as the base, and keeps it when the mixer didn't write", () => {
    const root = treeOf(path);
    const rig = findLegRig(root) as LegRig;
    const bone = rig.right.hip.node;
    const clip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.2).multiply(bone.quaternion);
    applyGait(rig, { left: { hip: 0.1, knee: 0, ankle: 0 }, right: { hip: 0.3, knee: 0, ankle: 0 } });
    // The mixer writes the clip's pose; the gait lays itself over it, then clears back to it.
    bone.quaternion.copy(clip);
    applyGait(rig, { left: { hip: 0, knee: 0, ankle: 0 }, right: { hip: 0.3, knee: 0, ankle: 0 } });
    // A frame the mixer didn't write: nothing compounds.
    applyGait(rig, { left: { hip: 0, knee: 0, ankle: 0 }, right: { hip: 0.3, knee: 0, ankle: 0 } });
    clearGait(rig);
    expect(apart(bone.quaternion, clip)).toBeLessThan(1e-9);
  });
});

describe("a model missing a leg bone", () => {
  it("gives null", () => {
    const root = treeOf("assets/visitors/man/man.glb");
    root.getObjectByName("mixamorigLeftFoot")?.removeFromParent();
    expect(findLegRig(root)).toBeNull();
  });
});
