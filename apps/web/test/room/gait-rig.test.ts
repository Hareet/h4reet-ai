// T004 (spec 019; FR-005, FR-006, FR-008; R-07): the leg rig, found on the studio's real models. Each GLB's JSON chunk
// is read and its node tree built from the nodes' translation, rotation, and scale alone: no textures, no renderer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Object3D, PropertyBinding, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { applyGait, clearGait, findLegRig } from "../../src/room/scene/gait";
import type { LegRig } from "../../src/room/scene/gait";
import { REPO } from "../helpers/room";

interface GltfNode {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
}

/** A GLB's scene as Object3Ds, names sanitized as three's loader sanitizes them. */
function treeOf(path: string): Object3D {
  const bytes = readFileSync(join(REPO, path));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8")) as {
    nodes: GltfNode[];
    scenes: { nodes: number[] }[];
  };
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

  it("swings the foot toward +z on a positive hip offset, and bends the shin backward on a positive knee offset (R-07)", () => {
    const root = treeOf(path);
    const rig = findLegRig(root) as LegRig;
    const zero = { hip: 0, knee: 0, ankle: 0 };
    const foot = rig.left.ankle.node;
    const knee = rig.left.knee.node;
    const rest = { foot: worldOf(foot), knee: worldOf(knee) };
    applyGait(rig, { left: { ...zero, hip: 0.3 }, right: zero });
    root.updateMatrixWorld(true);
    expect(worldOf(foot).z - rest.foot.z).toBeGreaterThan(0.05);
    clearGait(rig);
    root.updateMatrixWorld(true);
    applyGait(rig, { left: { ...zero, knee: 0.5 }, right: zero });
    root.updateMatrixWorld(true);
    // The shin swings back: the foot's z, relative to the knee's, falls.
    expect(worldOf(foot).z - worldOf(knee).z).toBeLessThan(rest.foot.z - rest.knee.z - 0.05);
  });

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
