// The twin's reach (spec 016; plan.md R-19; the Author's lookdev, T079, 2026-11-11): how far the twin's own model
// reaches toward each wall of the shell, at rest and in each clip it plays, sampled every 1/30 s, for RA8
// (checks/ra.ts) and the report. At lookdev its left foot and hand went through the right wall: the catalog's box is
// the rest pose's, and the clips reach past it.
// - As three plays them: a clip's channels set its nodes' local translation, rotation, and scale by node name, with no
//   retargeting (scene/avatars.ts); LINEAR rotations slerp, CUBICSPLINE values follow glTF's Hermite form, STEP holds;
//   before its first key a channel holds its first value, after its last its last. A node no channel moves keeps its
//   rest TRS. A skinned primitive's vertex is Σ w · World(joint) · IBM(joint) · v, its weights scaled to sum to 1 (a
//   vertex weighing nothing takes its first joint), as three binds a glTF skin with an identity bind matrix; a
//   primitive without a skin moves with its node.
// - Placed as the room places it (scene/avatars.ts's instanceFor): at the twin placement's world, its own scale undone,
//   lifted so the rest pose's lowest point is on the floor.
// - Exactly, not by boxes alone: a vertex's position is a convex combination of its joints' rigid images, so for one
//   direction its reach is at most the greatest, over its joints, of that joint's box of the vertices it weighs, carried
//   rigidly. Each joint's vertices are kept in small clusters with boxes of their own: a frame skins only the clusters
//   whose box could still pass the best reach found, so each frame's reach is every vertex's, found without skinning
//   them all.
// - Not sampled: the crossfades between clips, and the stand-in, which shows only where the twin's own model doesn't.
import { IDENTITY, invert, multiply, translation } from "../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../src/room/compose/math";
import { SIDE_WALL_ANCHORS } from "../../src/room/compose/vocabulary";
import { localMatrix, multiply as times, readGlb } from "../../src/room/glb/read";
import type { Glb, Mat4 as M } from "../../src/room/glb/read";
import { TWIN_CLIPS_DEFAULT, TWIN_CLIP_ROLES, TWIN_STATES, isTwinClipRole } from "../../src/room/scene/twin-states";
import type { TwinClipRole } from "../../src/room/scene/twin-states";
import type { TwinSet } from "./avatars";
import { sideWallFrame } from "./checks/rg";
import type { Geometry } from "./checks/rg";
import type { CatalogEntry, Scene } from "./schema";
import type { Tree } from "./source";

/** Frames a second at which each clip is sampled. */
export const REACH_FPS = 30;
/** Vertices a cluster holds at most. */
const CLUSTER = 64;
/** A slot's members are ordered by Morton code where they number fewer than this, 2^21. */
const INDEX_SPAN = 2_097_152;

/** A wall of the shell the twin stays inside: its outward normal in the shell's frame, and its plane's offset along it.
 *  Named by the shell's anchor its side wall stands at, or `back`. */
export interface ShellWall {
  readonly name: string;
  readonly normal: Vec3;
  readonly at: number;
}

/** A source's greatest reach toward one wall over its frames, in metres along the wall's normal, and when. */
export interface WallReach {
  readonly wall: string;
  readonly reach: number;
  readonly at_s: number;
}

/** The rest pose, or one clip the twin plays: its frames' count and its reach toward each wall. */
export interface SourceReach {
  readonly source: "rest" | TwinClipRole;
  readonly frames: number;
  readonly walls: readonly WallReach[];
}

export interface ReachClip {
  readonly role: TwinClipRole;
  readonly bytes: Uint8Array;
}

/** The twin's reach in a compose: the model's frame in the shell's, the walls, and each source's reach. */
export interface TwinReach {
  readonly place: Mat4;
  readonly walls: readonly ShellWall[];
  readonly sources: readonly SourceReach[];
}

// ---- The model, prepared once ----

interface Rest {
  readonly matrix: M | null;
  readonly t: readonly number[];
  readonly r: readonly number[];
  readonly s: readonly number[];
}

/** A joint of a skin, or a mesh node without one: its node, the matrix from the vertices' space to its own (the inverse
 *  bind matrix, or none), its box there, and its vertices in clusters. */
interface Slot {
  readonly node: number;
  readonly offset: M | null;
  readonly box: Float64Array;
  readonly members: Int32Array;
  /** Cluster k holds members[starts[k]] to members[starts[k + 1] − 1]. */
  readonly starts: Int32Array;
  readonly boxes: Float64Array;
}

interface Prepared {
  readonly names: readonly string[];
  /** The default scene's nodes, parents before children. */
  readonly order: readonly number[];
  readonly parent: Int32Array;
  readonly rest: readonly Rest[];
  readonly positions: Float64Array;
  /** Each vertex's four slots (−1 for none) and their weights. */
  readonly vslots: Int32Array;
  readonly vweights: Float64Array;
  readonly slots: readonly Slot[];
  /** The rest pose's lowest point's height, in the model's frame. */
  readonly floor: number;
}

const prepared = new WeakMap<Uint8Array, Prepared | null>();
/** The last models prepared, by SHA-256, since a tree may read a file into new bytes each time. */
const bySha = new Map<string, Prepared | null>();

/** Interleaves a 10-bit integer's bits two apart. */
function spread(v: number): number {
  let x = v & 0x3ff;
  x = (x | (x << 16)) & 0x030000ff;
  x = (x | (x << 8)) & 0x0300f00f;
  x = (x | (x << 4)) & 0x030c30c3;
  x = (x | (x << 2)) & 0x09249249;
  return x;
}

/** A column-major matrix's element. */
const el = (m: M, i: number): number => m[i] ?? 0;

/** A point carried by a column-major matrix, into out[k..k+2]. */
function carry(m: M, x: number, y: number, z: number, out: Float64Array, k: number): void {
  out[k] = el(m, 0) * x + el(m, 4) * y + el(m, 8) * z + el(m, 12);
  out[k + 1] = el(m, 1) * x + el(m, 5) * y + el(m, 9) * z + el(m, 13);
  out[k + 2] = el(m, 2) * x + el(m, 6) * y + el(m, 10) * z + el(m, 14);
}

/** A slot's clusters: its members in Morton order over their points in its space, cut every CLUSTER, each with a box. */
function slotOf(node: number, offset: M | null, members: readonly number[], positions: Float64Array): Slot {
  const n = members.length;
  const q = new Float64Array(n * 3);
  const box = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  members.forEach((v, i) => {
    const [x, y, z] = [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
    if (offset) carry(offset, x, y, z, q, i * 3);
    else q.set([x, y, z], i * 3);
    for (let a = 0; a < 3; a++) {
      const c = q[i * 3 + a] ?? 0;
      if (c < (box[a] ?? 0)) box[a] = c;
      if (c > (box[a + 3] ?? 0)) box[a + 3] = c;
    }
  });
  const keys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let code = 0;
    for (let a = 0; a < 3; a++) {
      const span = (box[a + 3] ?? 0) - (box[a] ?? 0);
      const cell = span > 0 ? Math.min(1023, Math.floor((((q[i * 3 + a] ?? 0) - (box[a] ?? 0)) / span) * 1024)) : 0;
      code |= spread(cell) << a;
    }
    // The code above the index, both exact in a double: 30 bits and 21.
    keys[i] = n < INDEX_SPAN ? (code >>> 0) * INDEX_SPAN + i : i;
  }
  keys.sort();
  const order = new Int32Array(n);
  const sorted = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    order[i] = (keys[i] ?? 0) % INDEX_SPAN;
    sorted[i] = members[order[i] ?? 0] ?? 0;
  }
  const count = Math.ceil(n / CLUSTER);
  const starts = new Int32Array(count + 1);
  const boxes = new Float64Array(count * 6);
  for (let k = 0; k < count; k++) {
    starts[k] = k * CLUSTER;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = k * CLUSTER; i < Math.min(n, (k + 1) * CLUSTER); i++) {
      const at = (order[i] ?? 0) * 3;
      for (let a = 0; a < 3; a++) {
        const c = q[at + a] ?? 0;
        if (c < (b[a] ?? 0)) b[a] = c;
        if (c > (b[a + 3] ?? 0)) b[a + 3] = c;
      }
    }
    boxes.set(b, k * 6);
  }
  starts[count] = n;
  return { node, offset, box, members: sorted, starts, boxes };
}

/** The model's nodes, rest pose, vertices, and slots; null where the GLB reader can't read it. */
function prepare(bytes: Uint8Array, sha256?: string): Prepared | null {
  if (prepared.has(bytes)) return prepared.get(bytes) ?? null;
  if (sha256 !== undefined && bySha.has(sha256)) return bySha.get(sha256) ?? null;
  const glb = readGlb(bytes).glb;
  const out = glb ? prepareGlb(glb) : null;
  prepared.set(bytes, out);
  if (sha256 !== undefined) {
    if (bySha.size >= 2) bySha.delete(bySha.keys().next().value as string);
    bySha.set(sha256, out);
  }
  return out;
}

function prepareGlb(glb: Glb): Prepared {
  const nodes = glb.json.nodes ?? [];
  const parent = new Int32Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => {
    for (const c of n.children ?? []) parent[c] = i;
  });
  const scene = glb.sceneNodes();
  const order = scene.map((s) => s.node);
  const rest: Rest[] = nodes.map((n) => ({
    matrix: n.matrix === undefined ? null : localMatrix(n),
    t: n.translation ?? [0, 0, 0],
    r: n.rotation ?? [0, 0, 0, 1],
    s: n.scale ?? [1, 1, 1],
  }));
  const positions: number[] = [];
  const vslots: number[] = [];
  const vweights: number[] = [];
  const slotKey = new Map<string, number>();
  const slotDefs: { node: number; offset: M | null; members: number[] }[] = [];
  const slotFor = (key: string, node: number, offset: M | null): number => {
    const known = slotKey.get(key);
    if (known !== undefined) return known;
    slotDefs.push({ node, offset, members: [] });
    slotKey.set(key, slotDefs.length - 1);
    return slotDefs.length - 1;
  };
  for (const { node: n } of scene) {
    const node = nodes[n];
    const mesh = node?.mesh === undefined ? undefined : glb.json.meshes?.[node.mesh];
    if (!node || !mesh) continue;
    const skin = node.skin === undefined ? undefined : glb.json.skins?.[node.skin];
    const ibm = skin?.inverseBindMatrices === undefined ? null : glb.accessor(skin.inverseBindMatrices);
    for (const prim of mesh.primitives) {
      const at = prim.attributes.POSITION;
      if (at === undefined) continue;
      const p = glb.accessor(at);
      const count = p.length / 3;
      const base = positions.length / 3;
      for (let i = 0; i < p.length; i++) positions.push(p[i] ?? 0);
      const joints = prim.attributes.JOINTS_0;
      const weights = prim.attributes.WEIGHTS_0;
      if (skin && joints !== undefined && weights !== undefined) {
        const j = glb.accessor(joints);
        const w = glb.accessor(weights);
        for (let v = 0; v < count; v++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += Math.abs(w[v * 4 + k] ?? 0);
          for (let k = 0; k < 4; k++) {
            const weight = sum > 0 ? (w[v * 4 + k] ?? 0) / sum : k === 0 ? 1 : 0;
            const ji = j[v * 4 + k] ?? 0;
            const jointNode = skin.joints[ji];
            if (weight === 0 || jointNode === undefined) {
              vslots.push(-1);
              vweights.push(0);
              continue;
            }
            const offset = ibm ? Array.from(ibm.subarray(ji * 16, ji * 16 + 16)) : null;
            const s = slotFor(`skin ${node.skin} ${ji}`, jointNode, offset);
            slotDefs[s]?.members.push(base + v);
            vslots.push(s);
            vweights.push(weight);
          }
        }
      } else {
        const s = slotFor(`node ${n}`, n, null);
        for (let v = 0; v < count; v++) {
          slotDefs[s]?.members.push(base + v);
          vslots.push(s, -1, -1, -1);
          vweights.push(1, 0, 0, 0);
        }
      }
    }
  }
  const pos = new Float64Array(positions);
  const slots = slotDefs.map((d) => slotOf(d.node, d.offset, d.members, pos));
  const out: Prepared = {
    names: nodes.map((n) => n.name ?? ""),
    order,
    parent,
    rest,
    positions: pos,
    vslots: new Int32Array(vslots),
    vweights: new Float64Array(vweights),
    slots,
    floor: 0,
  };
  const down = reachOf(out, worlds(out, null, 0, IDENTITY), [0, -1, 0]);
  return { ...out, floor: Number.isFinite(down) ? -down : 0 };
}

// ---- A clip, sampled ----

interface Channel {
  readonly node: number;
  readonly path: "translation" | "rotation" | "scale";
  readonly times: Float64Array;
  readonly values: Float64Array;
  readonly size: number;
  readonly interpolation: string;
}

interface Clip {
  readonly channels: readonly Channel[];
  readonly length: number;
}

const clips = new WeakMap<Uint8Array, WeakMap<Prepared, Clip | null>>();

/** A clip's channels bound to the model's nodes by name, as three binds them; null where the reader can't read it. */
function clipOf(bytes: Uint8Array, model: Prepared): Clip | null {
  const byModel = clips.get(bytes) ?? new WeakMap<Prepared, Clip | null>();
  clips.set(bytes, byModel);
  if (byModel.has(model)) return byModel.get(model) ?? null;
  const glb = readGlb(bytes).glb;
  let out: Clip | null = null;
  const animation = glb?.json.animations?.[0] as
    | {
        channels: readonly { sampler: number; target: { node?: number; path?: string } }[];
        samplers: readonly { input: number; output: number; interpolation?: string }[];
      }
    | undefined;
  if (glb && animation) {
    const names = (glb.json.nodes ?? []).map((n) => n.name ?? "");
    const index = new Map<string, number>();
    model.names.forEach((name, i) => {
      if (!index.has(name)) index.set(name, i);
    });
    const channels: Channel[] = [];
    let length = 0;
    for (const ch of animation.channels) {
      const path = ch.target.path;
      const sampler = animation.samplers[ch.sampler];
      if (ch.target.node === undefined || !sampler) continue;
      if (path !== "translation" && path !== "rotation" && path !== "scale") continue;
      const node = index.get(names[ch.target.node] ?? "");
      if (node === undefined) continue;
      const times = glb.accessor(sampler.input);
      const values = glb.accessor(sampler.output);
      length = Math.max(length, times[times.length - 1] ?? 0);
      channels.push({
        node,
        path,
        times,
        values,
        size: path === "rotation" ? 4 : 3,
        interpolation: sampler.interpolation ?? "LINEAR",
      });
    }
    out = { channels, length };
  }
  byModel.set(model, out);
  return out;
}

/** A quaternion's slerp, the short way, as three's Quaternion.slerpFlat. */
function slerp(a: readonly number[], b: readonly number[], u: number): number[] {
  let [x1, y1, z1, w1] = [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 1];
  const [x0, y0, z0, w0] = [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 1];
  let cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
  if (cos < 0) {
    [x1, y1, z1, w1, cos] = [-x1, -y1, -z1, -w1, -cos];
  }
  let [s0, s1] = [1 - u, u];
  if (cos < 1 - Number.EPSILON) {
    const sin = Math.sqrt(1 - cos * cos);
    const len = Math.atan2(sin, cos);
    s0 = Math.sin(s0 * len) / sin;
    s1 = Math.sin(s1 * len) / sin;
  }
  const q = [x0 * s0 + x1 * s1, y0 * s0 + y1 * s1, z0 * s0 + z1 * s1, w0 * s0 + w1 * s1];
  const n = Math.hypot(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 0) || 1;
  return q.map((c) => c / n);
}

/** A channel's value at time t. */
function valueAt(c: Channel, t: number): number[] {
  const { times, values, size } = c;
  const keys = times.length;
  const cubic = c.interpolation === "CUBICSPLINE";
  const value = (k: number): number[] => {
    const at = cubic ? (k * 3 + 1) * size : k * size;
    return Array.from(values.subarray(at, at + size));
  };
  if (keys === 0) return [];
  if (t <= (times[0] ?? 0) || keys === 1) return value(0);
  if (t >= (times[keys - 1] ?? 0)) return value(keys - 1);
  let lo = 0;
  let hi = keys - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) <= t) lo = mid;
    else hi = mid;
  }
  const [t0, t1] = [times[lo] ?? 0, times[hi] ?? 0];
  const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  if (c.interpolation === "STEP") return value(lo);
  if (cubic) {
    const dt = t1 - t0;
    const [u2, u3] = [u * u, u * u * u];
    const v0 = value(lo);
    const v1 = value(hi);
    const b0 = Array.from(values.subarray((lo * 3 + 2) * size, (lo * 3 + 3) * size));
    const a1 = Array.from(values.subarray(hi * 3 * size, (hi * 3 + 1) * size));
    const out = v0.map(
      (_, i) =>
        (2 * u3 - 3 * u2 + 1) * (v0[i] ?? 0) +
        (u3 - 2 * u2 + u) * dt * (b0[i] ?? 0) +
        (-2 * u3 + 3 * u2) * (v1[i] ?? 0) +
        (u3 - u2) * dt * (a1[i] ?? 0),
    );
    if (c.path !== "rotation") return out;
    const n = Math.hypot(...out) || 1;
    return out.map((x) => x / n);
  }
  const [v0, v1] = [value(lo), value(hi)];
  if (c.path === "rotation") return slerp(v0, v1, u);
  return v0.map((x, i) => x + u * ((v1[i] ?? 0) - x));
}

/** Every scene node's world matrix in a frame: the rest pose under the clip's channels at t, below `place`. */
function worlds(model: Prepared, clip: Clip | null, t: number, place: M): M[] {
  const local = model.rest.map((r) => ({ t: [...r.t], r: [...r.r], s: [...r.s] }));
  for (const c of clip?.channels ?? []) {
    const v = valueAt(c, t);
    const target = local[c.node];
    if (!target || v.length === 0) continue;
    if (c.path === "translation") target.t = v;
    else if (c.path === "rotation") target.r = v;
    else target.s = v;
  }
  const out: M[] = new Array<M>(model.rest.length).fill(IDENTITY);
  for (const n of model.order) {
    const r = model.rest[n];
    const l = local[n] ?? { t: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
    const m = r?.matrix ?? localMatrix({ translation: l.t, rotation: l.r, scale: l.s });
    const up = model.parent[n] ?? -1;
    out[n] = times(up < 0 ? place : (out[up] ?? IDENTITY), m);
  }
  return out;
}

/** The greatest reach along `normal` over every vertex in one frame, exactly: slots and clusters by their boxes' bounds,
 *  greatest first, skinned only where their bound could pass the best so far. −Infinity with no vertex. */
function reachOf(model: Prepared, w: readonly M[], normal: Vec3): number {
  const [n0, n1, n2] = normal;
  const slots = model.slots;
  // Each slot's matrix from the vertices' space into the shell's, as the direction reads it: a · p + b.
  const a = new Float64Array(slots.length * 3);
  const b = new Float64Array(slots.length);
  const bound = new Float64Array(slots.length);
  // The joint's own world, which carries the slot's box (in its space) rigidly: c · q + d.
  const c = new Float64Array(slots.length * 3);
  slots.forEach((s, k) => {
    const world = w[s.node] ?? IDENTITY;
    const g = s.offset ? times(world, s.offset) : world;
    for (let col = 0; col < 3; col++) {
      a[k * 3 + col] = el(g, col * 4) * n0 + el(g, col * 4 + 1) * n1 + el(g, col * 4 + 2) * n2;
      c[k * 3 + col] = el(world, col * 4) * n0 + el(world, col * 4 + 1) * n1 + el(world, col * 4 + 2) * n2;
    }
    b[k] = el(g, 12) * n0 + el(g, 13) * n1 + el(g, 14) * n2;
    const d = el(world, 12) * n0 + el(world, 13) * n1 + el(world, 14) * n2;
    bound[k] = d + support(c, k, s.box, 0);
  });
  const order = Array.from(slots.keys()).sort((x, y) => (bound[y] ?? 0) - (bound[x] ?? 0));
  let best = -Infinity;
  const { positions: p, vslots, vweights } = model;
  for (const k of order) {
    if ((bound[k] ?? -Infinity) <= best) break;
    const s = slots[k] as Slot;
    const world = w[s.node] ?? IDENTITY;
    const d = el(world, 12) * n0 + el(world, 13) * n1 + el(world, 14) * n2;
    const count = s.starts.length - 1;
    const ub = new Float64Array(count);
    for (let i = 0; i < count; i++) ub[i] = d + support(c, k, s.boxes, i * 6);
    const byBound = Array.from(ub.keys()).sort((x, y) => (ub[y] ?? 0) - (ub[x] ?? 0));
    for (const i of byBound) {
      if ((ub[i] ?? -Infinity) <= best) break;
      for (let m = s.starts[i] ?? 0; m < (s.starts[i + 1] ?? 0); m++) {
        const v = s.members[m] ?? 0;
        const [x, y, z] = [p[v * 3] ?? 0, p[v * 3 + 1] ?? 0, p[v * 3 + 2] ?? 0];
        let along = 0;
        for (let j = 0; j < 4; j++) {
          const sj = vslots[v * 4 + j] ?? -1;
          if (sj < 0) continue;
          along +=
            (vweights[v * 4 + j] ?? 0) *
            ((a[sj * 3] ?? 0) * x + (a[sj * 3 + 1] ?? 0) * y + (a[sj * 3 + 2] ?? 0) * z + (b[sj] ?? 0));
        }
        if (along > best) best = along;
      }
    }
  }
  return best;
}

/** The greatest of c · q over a box's corners, the box at boxes[at..at+5] (min x, y, z, then max), c slot k's. */
function support(c: Float64Array, k: number, boxes: Float64Array, at: number): number {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    const ci = c[k * 3 + i] ?? 0;
    sum += ci >= 0 ? ci * (boxes[at + 3 + i] ?? 0) : ci * (boxes[at + i] ?? 0);
  }
  return sum;
}

// ---- The measures ----

/** The model's reach along `normal` at time t of a clip (none: the rest pose), with its root frame at `place`. */
export function reachAt(model: Uint8Array, clip: Uint8Array | null, t: number, place: Mat4, normal: Vec3): number {
  const m = prepare(model);
  if (!m) return Number.NaN;
  const c = clip ? clipOf(clip, m) : null;
  return reachOf(m, worlds(m, c, t, place), normal);
}

/** The frames a clip of `length` seconds is sampled at: every 1/30 s from 0, and its end. */
function framesOf(length: number): number[] {
  const out: number[] = [];
  for (let k = 0; k / REACH_FPS <= length + 1e-9; k++) out.push(k / REACH_FPS);
  if (length - (out[out.length - 1] ?? 0) > 1e-9) out.push(length);
  return out;
}

/** The rest pose's and each clip's reach toward each wall, with the model's root frame at `place`. */
export function sampleReach(
  model: Uint8Array,
  roles: readonly ReachClip[],
  place: Mat4,
  walls: readonly ShellWall[],
): SourceReach[] {
  const m = prepare(model);
  if (!m) return [];
  const one = (source: SourceReach["source"], clip: Clip | null): SourceReach => {
    const times = clip ? framesOf(clip.length) : [0];
    const best = walls.map((wall) => ({ wall: wall.name, reach: -Infinity, at_s: 0 }));
    for (const t of times) {
      const w = worlds(m, clip, t, place);
      walls.forEach((wall, i) => {
        const r = reachOf(m, w, wall.normal);
        const b = best[i];
        if (b && r > b.reach) [b.reach, b.at_s] = [r, t];
      });
    }
    return { source, frames: times.length, walls: best };
  };
  const out = [one("rest", null)];
  for (const { role, bytes } of roles) {
    const clip = clipOf(bytes, m);
    if (clip) out.push(one(role, clip));
  }
  return out;
}

/** The shell's walls: each side wall its side-wall anchors stand on (checks/rg.ts's sideWallFrame), then its back, its
 *  bounds' least z; each at the shell's stylized scale. The front is open, and the floor and the top aren't walls. */
export function shellWalls(shell: CatalogEntry): ShellWall[] {
  const out: ShellWall[] = [];
  for (const name of SIDE_WALL_ANCHORS) {
    const frame = sideWallFrame(shell, name);
    if (!frame) continue;
    out.push(
      frame.side === "max" ? { name, normal: [1, 0, 0], at: frame.x } : { name, normal: [-1, 0, 0], at: -frame.x },
    );
  }
  out.push({ name: "back", normal: [0, 0, -1], at: -shell.origin.bounds.min[2] * shell.stylized_scale });
  return out;
}

/** The clips the twin plays (scene/avatars.ts's choice by state): each state's, by the block's map or its default; the
 *  idle for the lean where the scene has no lean, and for a role whose clip isn't bundled; none for the idle unbundled,
 *  when the rest pose shows. In the closed list's order. */
export function playedRoles(scene: Scene | null, bundled: ReadonlySet<TwinClipRole>): TwinClipRole[] {
  const block = scene?.figures.twin;
  const played = new Set<TwinClipRole>();
  for (const state of TWIN_STATES) {
    const named = block?.clips?.[state];
    let role: TwinClipRole = named !== undefined && isTwinClipRole(named) ? named : TWIN_CLIPS_DEFAULT[state];
    if (role === "desk-lean" && !block?.lean) role = "idle";
    if (!bundled.has(role)) role = "idle";
    if (bundled.has(role)) played.add(role);
  }
  return TWIN_CLIP_ROLES.filter((r) => played.has(r));
}

const reaches = new Map<string, TwinReach>();

/** The twin's reach in a compose: null where its own model isn't bundled (the stand-in shows), or its placement or the
 *  shell doesn't resolve. Measured once for its files, placement, and walls. */
export function twinReachOf(tree: Tree, scene: Scene | null, twin: TwinSet, g: Geometry | null): TwinReach | null {
  const model = twin.model;
  if (!scene || !g || !model?.bundled) return null;
  const placement = scene.placements.find((p) => p.role === "twin");
  const root = scene.placements.find((p) => p.mount === undefined);
  const world = placement && g.resolved.world.get(placement.id);
  const shellWorld = root && g.resolved.world.get(root.id);
  const shell = root && g.pieces.get(root.piece);
  const inverse = shellWorld && invert(shellWorld);
  if (!world || !shell || !inverse) return null;
  const bytes = tree.read(model.path);
  const m = bytes && prepare(bytes, model.sha256);
  if (!bytes || !m) return null;
  const bundled = new Map(twin.clips.filter((c) => c.bundled).map((c) => [c.role as TwinClipRole, c] as const));
  const roles = playedRoles(scene, new Set(bundled.keys()));
  const place = multiply(multiply(inverse, world), translation([0, m.floor, 0]));
  const walls = shellWalls(shell);
  const key = JSON.stringify([model.sha256, roles.map((r) => bundled.get(r)?.sha256), place, walls]);
  const hit = reaches.get(key);
  if (hit) return hit;
  const clipsRead = roles.flatMap((role) => {
    const file = bundled.get(role);
    const data = file && tree.read(file.path);
    return data ? [{ role, bytes: data }] : [];
  });
  const out: TwinReach = { place, walls, sources: sampleReach(bytes, clipsRead, place, walls) };
  if (reaches.size >= 8) reaches.delete(reaches.keys().next().value as string);
  reaches.set(key, out);
  return out;
}

/** A source as a reason and the report name it. */
export const sourceName = (source: SourceReach["source"]): string =>
  source === "rest" ? "rest pose" : `\`${source}\` clip`;

const cm = (m: number): string => (Math.abs(m) * 100).toFixed(1);

/** The report's line: the nearest wall first, then the others in the walls' order, each by its closest source. */
export function reachLine(reach: TwinReach | null): string {
  if (!reach) return "The twin's reach (RA8): not measured, since the twin's own model isn't shown here.";
  if (reach.walls.length === 0) return "The twin's reach (RA8): the shell names no wall to measure it against.";
  const closest = reach.walls.map((wall) => {
    let worst: { source: SourceReach["source"]; reach: number; at_s: number } | null = null;
    for (const s of reach.sources) {
      const w = s.walls.find((x) => x.wall === wall.name);
      if (w && (worst === null || w.reach > worst.reach)) worst = { source: s.source, reach: w.reach, at_s: w.at_s };
    }
    return { wall, worst };
  });
  const clear = (c: (typeof closest)[number]): number => c.wall.at - (c.worst?.reach ?? -Infinity);
  const nearest = closest.reduce((x, y) => (clear(y) < clear(x) ? y : x));
  const words = (c: (typeof closest)[number]): string => {
    const d = clear(c);
    const where = d >= 0 ? `${cm(d)} cm inside` : `${cm(d)} cm past`;
    const src = c.worst?.source === "rest" ? "the rest pose" : `\`${c.worst?.source ?? "-"}\``;
    return `${where} ${c === nearest ? "the shell's" : "its"} ${c.wall.name}${c === nearest ? " at its nearest" : ""} (${src} at ${(c.worst?.at_s ?? 0).toFixed(2)} s)`;
  };
  const clipsCount = reach.sources.length - 1;
  const rest = closest.filter((c) => c !== nearest);
  return (
    `The twin's reach (RA8), over its rest pose and ${clipsCount} clip${clipsCount === 1 ? "" : "s"} every 1/${REACH_FPS} s: ` +
    [nearest, ...rest].map(words).join("; ") +
    "."
  );
}
