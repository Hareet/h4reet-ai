// Spec 024 (T007; A1; plan.md §3): the dinosaur's mouth, the point a bite flies to. The `Jaw` bone's world point (spec
// 021's rig contract), found by its raw glTF name `Jaw` or `<prefix>:Jaw`, which three's loader keeps as `Jaw` or
// sanitizes to `<prefix>Jaw`, keeping the raw name in `userData.name`; the first in traversal order. With no `Jaw`, the
// estimate: 0.8 × the figure's height up and 0.3 × its height ahead of its feet, along its heading (glTF's +z).
import { Bone, Group, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { findJaw, mouthWorldPoint } from "../../src/room/eat/mouth";

const H = 1.2;

/** A figure root at `at`, turned `yaw` radians about y, with a `Head` bone 1 m up and its child `jaw` 0.1 m ahead. */
function figure(jaw: { name: string; raw?: string } | null, at = new Vector3(2, 0, -1), yaw = 0): Group {
  const root = new Group();
  root.position.copy(at);
  root.rotation.y = yaw;
  const head = new Bone();
  head.name = "Head";
  head.position.set(0, 1, 0);
  root.add(head);
  if (jaw) {
    const bone = new Bone();
    bone.name = jaw.name;
    if (jaw.raw) bone.userData.name = jaw.raw;
    bone.position.set(0, -0.05, 0.1);
    head.add(bone);
  }
  root.updateMatrixWorld(true);
  return root;
}

const near = (a: Vector3, b: Vector3): void => {
  expect(a.distanceTo(b)).toBeLessThan(1e-9);
};

describe("the Jaw bone (A1)", () => {
  it("is the mouth for a node named Jaw", () => {
    const root = figure({ name: "Jaw" });
    expect(findJaw(root)?.name).toBe("Jaw");
    near(mouthWorldPoint(root, H), new Vector3(2, 0.95, -0.9));
  });

  it("is found under a prefix as three's loader sanitizes it (rig:Jaw → rigJaw)", () => {
    const root = figure({ name: "rigJaw" });
    expect(findJaw(root)?.name).toBe("rigJaw");
    near(mouthWorldPoint(root, H), new Vector3(2, 0.95, -0.9));
  });

  it("is found by the raw name the loader keeps in userData.name", () => {
    const root = figure({ name: "renamed", raw: "rig:Jaw" });
    expect(findJaw(root)?.name).toBe("renamed");
  });

  it("follows the figure's turn", () => {
    const root = figure({ name: "Jaw" }, new Vector3(0, 0, 0), Math.PI / 2);
    near(mouthWorldPoint(root, H), new Vector3(0.1, 0.95, 0));
  });

  it("takes the first in traversal order when two match", () => {
    const root = figure({ name: "Jaw" });
    const second = new Object3D();
    second.name = "otherJaw";
    root.add(second);
    root.updateMatrixWorld(true);
    expect(findJaw(root)?.name).toBe("Jaw");
  });

  it("doesn't take a name that only contains Jaw, or a raw name with a second colon", () => {
    const root = figure(null);
    const a = new Object3D();
    a.name = "JawLower";
    const b = new Object3D();
    b.name = "x";
    b.userData.name = "a:b:Jaw:end";
    const c = new Object3D();
    c.name = "rig.Jaw";
    root.add(a, b, c);
    expect(findJaw(root)).toBeNull();
  });
});

describe("the estimate with no Jaw (A1)", () => {
  it("is 0.8 × height up and 0.3 × height ahead of the feet, facing +z", () => {
    const root = figure(null, new Vector3(2, 0, -1), 0);
    expect(findJaw(root)).toBeNull();
    near(mouthWorldPoint(root, H), new Vector3(2, 0.8 * H, -1 + 0.3 * H));
  });

  it("follows the heading, at a quarter turn", () => {
    const root = figure(null, new Vector3(2, 0, -1), Math.PI / 2);
    near(mouthWorldPoint(root, H), new Vector3(2 + 0.3 * H, 0.8 * H, -1));
  });

  it("writes into the vector it's given", () => {
    const root = figure(null);
    const out = new Vector3();
    expect(mouthWorldPoint(root, H, out)).toBe(out);
  });
});
