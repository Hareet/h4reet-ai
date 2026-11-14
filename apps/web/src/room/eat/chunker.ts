// Spec 024 (FR-003, FR-004, FR-006, FR-015, SC-001; plan.md §5.2): the chunker, pure and Three.js-free, so it tests in
// Node. A piece's primitives, in its own frame at scale 1, go in; `setAside` marks the fixed part FR-004 keeps standing,
// and `split` cuts the rest into the placement's N chunks. Everything here is deterministic: the same piece splits the
// same way on every visit (seeded by its ID).
//
// The set-aside part, per triangle (FR-004):
//   (a) every triangle of a primitive whose mesh is named for a live face's role;
//   (b) every triangle that overlaps a face's rectangle in the face's plane and lies wholly behind it (every corner at
//       most FACE_SLACK in front), to the piece's far side: what holds the face up;
//   (c) every triangle whose box overlaps a keep-out box (a mounted piece's box, eat/keepouts.ts) grown MOUNT_MARGIN
//       every way: what carries a mount;
//   (d) every triangle of a primitive whose mesh is named for a glow's id, and, for a glow that isn't on a face (more
//       than ON_FACE in front of every face's plane, or outside its rectangle), every triangle whose closest point to the
//       glow's point is within its radius: what holds a glow. A glow on a face stands on what (a) and (b) keep.
// The split: k-means over the remaining triangles' centres, all primitives together, KMEANS_ITERATIONS fixed, its seed
// points from a PRNG seeded by the piece's ID spread over the rest's bounds; an empty group is refilled from the largest.
import type { RoomScene } from "../compose/bundle";

export type V3 = readonly [number, number, number];

/** One primitive of a piece's model: its glTF mesh's name (meshNameOf), its positions in the piece's frame at scale 1,
 *  and its index, or null for a non-indexed one. */
export interface Primitive {
  readonly mesh: string;
  readonly positions: Float32Array;
  readonly index: Uint32Array | Uint16Array | null;
}

/** A live face, in the piece's frame at scale 1. */
export interface Face {
  readonly role: string;
  readonly at: V3;
  readonly size: readonly [number, number];
  readonly facing: V3;
  readonly up: V3;
}

/** A glow's point and the radius round it that holds it; a path glow gives each of its points with its spread. */
export interface GlowPoint {
  readonly id: string;
  readonly at: V3;
  readonly radius: number;
}

export interface KeepOut {
  readonly min: V3;
  readonly max: V3;
}

export interface ChunkInput {
  readonly primitives: readonly Primitive[];
  readonly faces: readonly Face[];
  readonly glows: readonly GlowPoint[];
  /** The mounted pieces' boxes in this piece's frame at scale 1, not yet grown (eat/keepouts.ts). */
  readonly keepOuts: readonly KeepOut[];
  /** The placement's chunks, 2 to 12 (FR-002). */
  readonly n: number;
  /** The piece's ID. */
  readonly seed: string;
}

/** A node as three's GLTFLoader names it: enough of an Object3D to read a primitive's mesh name. */
export interface NamedNode {
  readonly name: string;
  readonly isMesh?: boolean;
  readonly parent: NamedNode | null;
}

/** (c)'s margin: a keep-out box grows 10 mm in every direction (NB-2). */
export const MOUNT_MARGIN = 0.01;
/** (b): how far in front of a face's plane a corner may lie and still be behind it. */
export const FACE_SLACK = 0.0005;
/** (d): a glow's point within this of a face's plane (in front), inside its rectangle, is on the face. */
export const ON_FACE = 0.005;
/** The split's k-means iterations. */
export const KMEANS_ITERATIONS = 8;

/**
 * A primitive's glTF mesh name (plan.md §5.2, N-2). GLTFLoader names a one-primitive mesh's node for itself, and makes a
 * multi-primitive mesh a group carrying the name, with a child per primitive named `<name>_<i>` by its unique-name
 * counter. So a mesh node whose name is its non-mesh parent's followed by `_<digits>` takes the parent's name.
 */
export function meshNameOf(node: NamedNode): string {
  const parent = node.parent;
  if (node.isMesh && parent && !parent.isMesh && parent.name !== "") {
    const rest = node.name.startsWith(`${parent.name}_`) ? node.name.slice(parent.name.length + 1) : "";
    if (/^\d+$/.test(rest)) return parent.name;
  }
  return node.name;
}

/**
 * The name the set-aside rules (a) and (d) match a primitive by (rv-rework3-spec-024): the nearest node, the primitive's
 * own or an ancestor's below `root`, whose name is in `named` (the piece's face roles and glow IDs), as
 * scene/loader.ts's prepareModel hides every node named for a face's role, whatever lies under it; else its glTF mesh's
 * name (`meshNameOf`).
 */
export function matchedNameOf(node: NamedNode, named: ReadonlySet<string>, root: NamedNode | null): string {
  for (let n: NamedNode | null = node; n && n !== root; n = n.parent) if (named.has(n.name)) return n.name;
  return meshNameOf(node);
}

type Piece = RoomScene["pieces"][string];

/** A piece's live faces, from the bundle. */
export function facesOf(piece: Pick<Piece, "faces">): Face[] {
  return Object.entries(piece.faces).map(([role, f]) => ({ role, at: f.at, size: f.size, facing: f.facing, up: f.up }));
}

/** A piece's glows' points, from the bundle: a disc glow's point and radius, a path glow's points with its spread. */
export function glowsOf(piece: Pick<Piece, "glows">): GlowPoint[] {
  return Object.entries(piece.glows).flatMap(([id, g]): GlowPoint[] => {
    if (g.at !== undefined) return [{ id, at: g.at, radius: g.radius ?? 0 }];
    return (g.path ?? []).map((at) => ({ id, at, radius: g.spread ?? 0 }));
  });
}

// ---- Geometry ----

const triangleCount = (p: Primitive): number => (p.index ? p.index.length : p.positions.length / 3) / 3;

/** Triangle t's corner k's vertex index. */
const vertexOf = (p: Primitive, t: number, k: number): number => (p.index ? (p.index[3 * t + k] ?? 0) : 3 * t + k);

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The closest point of triangle abc to p (Ericson, Real-Time Collision Detection §5.1.5). */
function closestOnTriangle(p: V3, a: V3, b: V3, c: V3): V3 {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  const along = (o: V3, d: V3, k: number): V3 => [o[0] + k * d[0], o[1] + k * d[1], o[2] + k * d[2]];
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return along(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return along(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return along(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

/** Whether a triangle, as 2D points, overlaps the rectangle |u| ≤ hw, |v| ≤ hh (separating axes). */
function overlapsRect(pts: readonly (readonly [number, number])[], hw: number, hh: number): boolean {
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  if (Math.min(...xs) > hw || Math.max(...xs) < -hw || Math.min(...ys) > hh || Math.max(...ys) < -hh) return false;
  for (let k = 0; k < 3; k++) {
    const a = pts[k] as readonly [number, number];
    const b = pts[(k + 1) % 3] as readonly [number, number];
    const n: readonly [number, number] = [b[1] - a[1], a[0] - b[0]];
    if (n[0] === 0 && n[1] === 0) continue;
    const proj = pts.map((q) => n[0] * q[0] + n[1] * q[1]);
    const r = hw * Math.abs(n[0]) + hh * Math.abs(n[1]);
    if (Math.min(...proj) > r || Math.max(...proj) < -r) return false;
  }
  return true;
}

interface FaceFrame {
  readonly at: V3;
  readonly right: V3;
  readonly up: V3;
  readonly facing: V3;
  readonly hw: number;
  readonly hh: number;
}

const frameOf = (f: Face): FaceFrame => ({
  at: f.at,
  right: cross(f.up, f.facing),
  up: f.up,
  facing: f.facing,
  hw: f.size[0] / 2,
  hh: f.size[1] / 2,
});

/** Whether a glow's point stands on a face: within ON_FACE in front of its plane (or behind it), inside its rectangle. */
function onFace(at: V3, faces: readonly FaceFrame[]): boolean {
  return faces.some((f) => {
    const rel = sub(at, f.at);
    return dot(rel, f.facing) <= ON_FACE && Math.abs(dot(rel, f.right)) <= f.hw && Math.abs(dot(rel, f.up)) <= f.hh;
  });
}

/** The set-aside part (FR-004): per primitive, 1 for each triangle it keeps standing. */
export function setAside(input: ChunkInput): { readonly mask: Uint8Array[] } {
  const faces = input.faces.map(frameOf);
  const roles = new Set(input.faces.map((f) => f.role));
  const glowIds = new Set(input.glows.map((g) => g.id));
  const boxes = input.keepOuts.map((b) => ({
    min: [b.min[0] - MOUNT_MARGIN, b.min[1] - MOUNT_MARGIN, b.min[2] - MOUNT_MARGIN] as V3,
    max: [b.max[0] + MOUNT_MARGIN, b.max[1] + MOUNT_MARGIN, b.max[2] + MOUNT_MARGIN] as V3,
  }));
  const balls = input.glows.filter((g) => g.radius > 0 && !onFace(g.at, faces));

  const mask = input.primitives.map((p): Uint8Array => {
    const count = triangleCount(p);
    const out = new Uint8Array(count);
    if (roles.has(p.mesh) || glowIds.has(p.mesh)) return out.fill(1); // (a), (d)'s mesh
    const pos = p.positions;
    const corner = (t: number, k: number): V3 => {
      const i = vertexOf(p, t, k);
      return [pos[3 * i] ?? 0, pos[3 * i + 1] ?? 0, pos[3 * i + 2] ?? 0];
    };
    for (let t = 0; t < count; t++) {
      const tri = [corner(t, 0), corner(t, 1), corner(t, 2)] as const;
      const lo: V3 = [
        Math.min(tri[0][0], tri[1][0], tri[2][0]),
        Math.min(tri[0][1], tri[1][1], tri[2][1]),
        Math.min(tri[0][2], tri[1][2], tri[2][2]),
      ];
      const hi: V3 = [
        Math.max(tri[0][0], tri[1][0], tri[2][0]),
        Math.max(tri[0][1], tri[1][1], tri[2][1]),
        Math.max(tri[0][2], tri[1][2], tri[2][2]),
      ];
      // (c): the triangle's box over a grown keep-out box.
      const carries = boxes.some(
        (b) =>
          lo[0] <= b.max[0] &&
          hi[0] >= b.min[0] &&
          lo[1] <= b.max[1] &&
          hi[1] >= b.min[1] &&
          lo[2] <= b.max[2] &&
          hi[2] >= b.min[2],
      );
      if (carries) {
        out[t] = 1;
        continue;
      }
      // (b): wholly behind a face's plane, over its rectangle.
      const holds = faces.some((f) => {
        const rel = tri.map((v) => sub(v, f.at));
        if (rel.some((r) => dot(r, f.facing) > FACE_SLACK)) return false;
        return overlapsRect(
          rel.map((r) => [dot(r, f.right), dot(r, f.up)] as const),
          f.hw,
          f.hh,
        );
      });
      if (holds) {
        out[t] = 1;
        continue;
      }
      // (d): within a glow's radius of its point, a box test first.
      const glows = balls.some((g) => {
        const r = g.radius;
        if (
          lo[0] > g.at[0] + r ||
          hi[0] < g.at[0] - r ||
          lo[1] > g.at[1] + r ||
          hi[1] < g.at[1] - r ||
          lo[2] > g.at[2] + r ||
          hi[2] < g.at[2] - r
        )
          return false;
        const q = closestOnTriangle(g.at, tri[0], tri[1], tri[2]);
        return Math.hypot(q[0] - g.at[0], q[1] - g.at[1], q[2] - g.at[2]) <= r;
      });
      if (glows) out[t] = 1;
    }
    return out;
  });
  return { mask };
}

// ---- The split ----

/** A 32-bit FNV-1a hash of a string: the PRNG's seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG in [0, 1). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rest, after the set-aside part, cut into `input.n` chunks: per chunk, per primitive, its triangles in order. */
export function split(input: ChunkInput, mask: readonly Uint8Array[]): { readonly chunks: number[][][] } {
  const n = input.n;
  // The remaining triangles' centres, all primitives together.
  const prim: number[] = [];
  const tri: number[] = [];
  const centres: number[] = [];
  input.primitives.forEach((p, k) => {
    const pos = p.positions;
    const aside = mask[k];
    const count = triangleCount(p);
    for (let t = 0; t < count; t++) {
      if (aside?.[t] === 1) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (let c = 0; c < 3; c++) {
        const i = vertexOf(p, t, c);
        x += pos[3 * i] ?? 0;
        y += pos[3 * i + 1] ?? 0;
        z += pos[3 * i + 2] ?? 0;
      }
      prim.push(k);
      tri.push(t);
      centres.push(x / 3, y / 3, z / 3);
    }
  });
  const m = prim.length;
  const group = new Int32Array(m);

  if (m > 0) {
    // Seed points spread over the rest's bounds.
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m; i++)
      for (let a = 0; a < 3; a++) {
        const v = centres[3 * i + a] as number;
        if (v < (lo[a] as number)) lo[a] = v;
        if (v > (hi[a] as number)) hi[a] = v;
      }
    const random = prng(hash(input.seed));
    const centre = new Float64Array(3 * n);
    for (let g = 0; g < n; g++)
      for (let a = 0; a < 3; a++)
        centre[3 * g + a] = (lo[a] as number) + random() * ((hi[a] as number) - (lo[a] as number));

    const sizes = new Int32Array(n);
    const assign = (): void => {
      sizes.fill(0);
      for (let i = 0; i < m; i++) {
        const [x, y, z] = [centres[3 * i] as number, centres[3 * i + 1] as number, centres[3 * i + 2] as number];
        let best = 0;
        let bestD = Infinity;
        for (let g = 0; g < n; g++) {
          const dx = x - (centre[3 * g] as number);
          const dy = y - (centre[3 * g + 1] as number);
          const dz = z - (centre[3 * g + 2] as number);
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestD) [best, bestD] = [g, d];
        }
        group[i] = best;
        sizes[best] = (sizes[best] as number) + 1;
      }
    };
    const largest = (): number => {
      let best = 0;
      for (let g = 1; g < n; g++) if ((sizes[g] as number) > (sizes[best] as number)) best = g;
      return best;
    };
    /** Group g's member farthest from its centre. */
    const farthest = (g: number): number => {
      let best = -1;
      let bestD = -1;
      for (let i = 0; i < m; i++) {
        if (group[i] !== g) continue;
        const dx = (centres[3 * i] as number) - (centre[3 * g] as number);
        const dy = (centres[3 * i + 1] as number) - (centre[3 * g + 1] as number);
        const dz = (centres[3 * i + 2] as number) - (centre[3 * g + 2] as number);
        const d = dx * dx + dy * dy + dz * dz;
        if (d > bestD) [best, bestD] = [i, d];
      }
      return best;
    };

    for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
      assign();
      // An empty group restarts at the largest's farthest member.
      for (let g = 0; g < n; g++) {
        if (sizes[g] !== 0) continue;
        const from = largest();
        const i = farthest(from);
        if (i < 0 || (sizes[from] as number) < 2) continue;
        for (let a = 0; a < 3; a++) centre[3 * g + a] = centres[3 * i + a] as number;
        group[i] = g;
        sizes[g] = 1;
        sizes[from] = (sizes[from] as number) - 1;
      }
      // Each centre to its group's mean.
      const sum = new Float64Array(3 * n);
      for (let i = 0; i < m; i++) {
        const g = group[i] as number;
        for (let a = 0; a < 3; a++) sum[3 * g + a] = (sum[3 * g + a] as number) + (centres[3 * i + a] as number);
      }
      for (let g = 0; g < n; g++) {
        const s = sizes[g] as number;
        if (s > 0) for (let a = 0; a < 3; a++) centre[3 * g + a] = (sum[3 * g + a] as number) / s;
      }
    }
    assign();
    // Empty groups refilled from the largest, one triangle at a time, while it has one to spare.
    for (let g = 0; g < n; g++) {
      if (sizes[g] !== 0) continue;
      const from = largest();
      if ((sizes[from] as number) < 2) break;
      const i = farthest(from);
      group[i] = g;
      sizes[g] = 1;
      sizes[from] = (sizes[from] as number) - 1;
    }
  }

  const chunks: number[][][] = Array.from({ length: n }, () => input.primitives.map((): number[] => []));
  for (let i = 0; i < m; i++) chunks[group[i] as number]?.[prim[i] as number]?.push(tri[i] as number);
  return { chunks };
}
