// The edible pieces' models as the chunker takes them (spec 024, T004; plan.md §5.2): each of the four GLBs read at
// test time by the room's own GLB reader (src/room/glb/read.ts), one entry per primitive of every mesh, its positions
// through its node's transform and divided by the piece's stylized scale, since the studio models a piece at that scale
// and the chunker works in the piece's frame at scale 1 (as the catalog's faces, glows, and anchors are). Each primitive's
// `mesh` is the name `meshNameOf` (chunker.ts) resolves on the node tree three's GLTFLoader would build, which `loaderTree`
// rebuilds without three: a node's name reserved first, then each primitive's mesh named through the same unique-name
// counter (GLTFLoader's createUniqueName, with PropertyBinding's sanitizer), a one-primitive mesh taking its node's name
// and a multi-primitive mesh becoming a group with that name holding `<mesh>_<i>` children. The test pins this rebuild
// against the real loader on the two files that parse in Node (no textures).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readGlb, transform } from "../../src/room/glb/read";
import type { Glb } from "../../src/room/glb/read";
import { meshNameOf } from "../../src/room/eat/chunker";
import type { NamedNode, Primitive } from "../../src/room/eat/chunker";
import { REPO } from "./room";

export type V3 = readonly [number, number, number];

/** A node as GLTFLoader names it, without three. */
export interface LoaderNode extends NamedNode {
  readonly name: string;
  readonly isMesh: boolean;
  readonly parent: LoaderNode | null;
  /** The glTF mesh and primitive a mesh node draws. */
  readonly draws: { readonly mesh: number; readonly primitive: number } | null;
}

/** three's PropertyBinding.sanitizeNodeName: spaces to underscores, and `[ ] . : /` dropped. */
const sanitize = (name: string): string => name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");

/** The node tree GLTFLoader builds for a file's default scene, as plain objects, in traversal order. */
export function loaderTree(glb: Glb, sceneName = "Scene"): LoaderNode[] {
  const used = new Map<string, number>();
  const unique = (raw: string): string => {
    const name = sanitize(raw);
    const seen = used.get(name);
    if (seen === undefined) {
      used.set(name, 0);
      return name;
    }
    used.set(name, seen + 1);
    return `${name}_${seen + 1}`;
  };
  const nodes = glb.json.nodes ?? [];
  const meshes = glb.json.meshes ?? [];
  const scenes = glb.json.scenes ?? [];
  const scene = glb.json.scene === undefined ? scenes[0] : scenes[glb.json.scene];
  const order: number[] = [];
  const walk = (index: number): void => {
    order.push(index);
    for (const child of nodes[index]?.children ?? []) walk(child);
  };
  for (const n of scene?.nodes ?? []) walk(n);
  // Every node reserves its name before any mesh is named: the loader names a mesh once its geometry resolves.
  const nodeNames = new Map<number, string>();
  for (const i of order) {
    const raw = nodes[i]?.name;
    if (raw !== undefined) nodeNames.set(i, unique(raw));
  }
  const meshNames = new Map<number, string[]>();
  for (const i of order) {
    const m = nodes[i]?.mesh;
    const mesh = m === undefined ? undefined : meshes[m];
    if (m === undefined || mesh === undefined || meshNames.has(m)) continue;
    meshNames.set(
      m,
      mesh.primitives.map(() => unique(mesh.name ?? `mesh_${m}`)),
    );
  }
  const out: LoaderNode[] = [];
  const root: LoaderNode = { name: sceneName, isMesh: false, parent: null, draws: null };
  out.push(root);
  const visit = (index: number, parent: LoaderNode): void => {
    const def = nodes[index];
    if (def === undefined) return;
    const own = nodeNames.get(index);
    const names = def.mesh === undefined ? undefined : meshNames.get(def.mesh);
    let node: LoaderNode;
    if (def.mesh === undefined || names === undefined) {
      node = { name: own ?? "", isMesh: false, parent, draws: null };
      out.push(node);
    } else if (names.length === 1) {
      node = { name: own ?? names[0] ?? "", isMesh: true, parent, draws: { mesh: def.mesh, primitive: 0 } };
      out.push(node);
    } else {
      node = { name: own ?? "", isMesh: false, parent, draws: null };
      out.push(node);
      const meshIndex = def.mesh;
      names.forEach((name, k) => out.push({ name, isMesh: true, parent: node, draws: { mesh: meshIndex, primitive: k } }));
    }
    for (const child of def.children ?? []) visit(child, node);
  };
  for (const n of scene?.nodes ?? []) visit(n, root);
  return out;
}

/** A GLB from assets/room/, read by the room's reader. */
export function roomGlb(piece: string): Glb {
  const read = readGlb(new Uint8Array(readFileSync(join(REPO, "assets/room", `${piece}.glb`))));
  if (read.glb === null) throw new Error(`assets/room/${piece}.glb doesn't read: ${JSON.stringify(read.problems)}`);
  return read.glb;
}

/** A piece's primitives in its frame at scale 1, in GLTFLoader's traversal order, each named by `meshNameOf`. */
export function piecePrimitives(glb: Glb, scale: number): Primitive[] {
  const world = new Map<number, readonly number[]>();
  for (const { node, world: w } of glb.sceneNodes()) world.set(node, w);
  const nodeOfMesh = new Map<number, number>();
  (glb.json.nodes ?? []).forEach((n, i) => {
    if (n.mesh !== undefined && world.has(i) && !nodeOfMesh.has(n.mesh)) nodeOfMesh.set(n.mesh, i);
  });
  const out: Primitive[] = [];
  for (const node of loaderTree(glb)) {
    if (!node.isMesh || node.draws === null) continue;
    const def = glb.json.meshes?.[node.draws.mesh]?.primitives[node.draws.primitive];
    if (def === undefined || def.attributes.POSITION === undefined) continue;
    if ((def.mode ?? 4) !== 4) throw new Error("a primitive that isn't triangles");
    const m = world.get(nodeOfMesh.get(node.draws.mesh) ?? -1) ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const raw = glb.accessor(def.attributes.POSITION);
    const positions = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i += 3) {
      const p = transform(m, raw[i] ?? 0, raw[i + 1] ?? 0, raw[i + 2] ?? 0);
      positions[i] = p[0] / scale;
      positions[i + 1] = p[1] / scale;
      positions[i + 2] = p[2] / scale;
    }
    const index = def.indices === undefined ? null : Uint32Array.from(glb.accessor(def.indices));
    out.push({ mesh: meshNameOf(node), positions, index });
  }
  return out;
}

/** A primitive's triangle `t`'s three corners. */
export function corners(p: Primitive, t: number): [V3, V3, V3] {
  const v = (k: number): V3 => {
    const i = p.index ? (p.index[3 * t + k] ?? 0) : 3 * t + k;
    return [p.positions[3 * i] ?? 0, p.positions[3 * i + 1] ?? 0, p.positions[3 * i + 2] ?? 0];
  };
  return [v(0), v(1), v(2)];
}

export const triangles = (p: Primitive): number => (p.index ? p.index.length : p.positions.length / 3) / 3;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The first triangle a ray from `from` along `dir` meets (Möller–Trumbore, both sides), among the primitives `take`
 *  allows, or null. */
export function firstHit(
  primitives: readonly Primitive[],
  from: V3,
  dir: V3,
  take: (p: Primitive) => boolean = () => true,
): { readonly p: number; readonly t: number; readonly distance: number } | null {
  let best: { p: number; t: number; distance: number } | null = null;
  primitives.forEach((prim, p) => {
    if (!take(prim)) return;
    for (let t = 0; t < triangles(prim); t++) {
      const [a, b, c] = corners(prim, t);
      const e1 = sub(b, a);
      const e2 = sub(c, a);
      const h = cross(dir, e2);
      const det = dot(e1, h);
      if (Math.abs(det) < 1e-12) continue;
      const s = sub(from, a);
      const u = dot(s, h) / det;
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1);
      const v = dot(dir, q) / det;
      if (v < 0 || u + v > 1) continue;
      const distance = dot(e2, q) / det;
      if (distance > 1e-9 && (best === null || distance < best.distance)) best = { p, t, distance };
    }
  });
  return best;
}
