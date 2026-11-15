// Spec 024 (A1; plan.md §3): the dinosaur's mouth, where a bite's chunk flies. Spec 021's rig contract leaves a `Jaw`
// bone, child of `Head`, for this item; its raw glTF name is `Jaw` or `<prefix>:Jaw`, which three's loader keeps as
// `Jaw` or sanitizes to `<prefix>Jaw` (the `:` dropped, as `mixamorig:Hips` binds as `mixamorigHips`), keeping the raw
// name in `userData.name`. The mouth is the first such node's world point, in traversal order. With none, the estimate:
// 0.8 of the figure's height up and 0.3 of it ahead of its feet, along its heading (the figure faces glTF's +z).
import { Vector3 } from "three";
import type { Object3D } from "three";

/** The sanitized name: `Jaw`, or a prefix of letters, digits, `_`, or `-` before it. */
const SANITIZED = /^[A-Za-z0-9_-]*Jaw$/;
/** The raw name: `Jaw`, or `<prefix>:Jaw`. */
const RAW = /^(?:[^:]+:)?Jaw$/;

export function findJaw(root: Object3D): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((node) => {
    if (found !== null) return;
    const raw: unknown = node.userData.name;
    if (SANITIZED.test(node.name) || (typeof raw === "string" && RAW.test(raw))) found = node;
  });
  return found;
}

const forward = new Vector3();

/** The mouth's world point for the figure whose root (at its feet) is `root`, of room height `height`. */
export function mouthWorldPoint(root: Object3D, height: number, out = new Vector3()): Vector3 {
  const jaw = findJaw(root);
  if (jaw !== null) return jaw.getWorldPosition(out);
  root.getWorldPosition(out);
  root.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-12) forward.set(0, 0, 1);
  forward.normalize();
  return out.addScaledVector(forward, 0.3 * height).setY(out.y + 0.8 * height);
}
