// T004 (spec 024; FR-003, FR-004, FR-005, FR-015, SC-001; plan.md §5.2): the chunker, Three.js-free. `setAside` takes a
// piece's fixed part (its live faces' meshes, what holds a face up, what carries a mount, what holds a glow), and
// `split` cuts the rest into the placement's N chunks by k-means over the triangles' centres, 8 iterations, seeded by
// the piece's ID, empty groups refilled from the largest. First on stub primitives, one rule a case; then on the four
// real files (assets/room/{work-desk,busy-sign,laptop,chalkboard}.glb, read at test time), with their faces and glows
// from the repository's bundle and their keep-outs built from the mounts on each piece (keepouts.ts), as the 3D side
// (T008) builds them.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Mesh, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import type { RoomScene, Shape } from "../../src/room/compose/bundle";
import {
  KMEANS_ITERATIONS,
  MOUNT_MARGIN,
  facesOf,
  glowsOf,
  meshNameOf,
  setAside,
  split,
} from "../../src/room/eat/chunker";
import type { ChunkInput, Face, GlowPoint, Primitive } from "../../src/room/eat/chunker";
import { keepOutBoxes } from "../../src/room/eat/keepouts";
import { corners, firstHit, piecePrimitives, roomGlb, triangleDistance, triangles } from "../helpers/eat-pieces";
import type { V3 } from "../helpers/eat-pieces";
import { REPO, repositoryBundle } from "../helpers/room";

// --------------------------------------------------------------------------------------------------------------------
// Stub primitives
// --------------------------------------------------------------------------------------------------------------------
type Tri = readonly [V3, V3, V3];

/** A primitive of the triangles: indexed (Uint16 or Uint32) or not. */
function prim(mesh: string, tris: readonly Tri[], index: "u16" | "u32" | "none" = "u32"): Primitive {
  const positions = new Float32Array(tris.flatMap((t) => t.flatMap((v) => [...v])));
  const order = tris.flatMap((_, t) => [3 * t, 3 * t + 1, 3 * t + 2]);
  return {
    mesh,
    positions,
    index: index === "none" ? null : index === "u16" ? Uint16Array.from(order) : Uint32Array.from(order),
  };
}

/** A small triangle in the plane z = `z` (at depth `z` behind a face facing +Z at the origin), centred at (x, y). */
const flat = (x: number, y: number, z: number, r = 0.005): Tri => [
  [x - r, y - r, z],
  [x + r, y - r, z],
  [x, y + r, z],
];
/** A small triangle in the plane y = `y`, centred at (x, z): lying flat, as a desk's top does. */
const level = (x: number, y: number, z: number, r = 0.005): Tri => [
  [x - r, y, z - r],
  [x + r, y, z - r],
  [x, y, z + r],
];

/** A grid of small level triangles, `w` × `d`, spaced `step`. */
function grid(w: number, d: number, step = 0.05, y = 0): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) out.push(level(i * step, y, k * step, step / 4));
  return out;
}

const input = (over: Partial<ChunkInput> & Pick<ChunkInput, "primitives">): ChunkInput => ({
  faces: [],
  glows: [],
  keepOuts: [],
  n: 4,
  seed: "stub-piece",
  ...over,
});

/** The set-aside triangles of primitive `p`. */
const asideOf = (mask: readonly Uint8Array[], p = 0): number[] =>
  [...(mask[p] ?? new Uint8Array())].flatMap((v, t) => (v ? [t] : []));

/** SC-001: every triangle of every primitive in exactly one of the set-aside part and the chunks; each chunk holds one. */
function expectPartition(i: ChunkInput, mask: readonly Uint8Array[], chunks: readonly (readonly (readonly number[])[])[]) {
  expect(chunks).toHaveLength(i.n);
  i.primitives.forEach((p, k) => {
    const seen = new Uint8Array(triangles(p));
    for (const t of asideOf(mask, k)) seen[t] = (seen[t] ?? 0) + 1;
    for (const chunk of chunks) {
      expect(chunk).toHaveLength(i.primitives.length);
      for (const t of chunk[k] ?? []) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(triangles(p));
        seen[t] = (seen[t] ?? 0) + 1;
      }
    }
    expect([...seen].every((n) => n === 1), `primitive ${k} (${p.mesh}): a triangle lost or in two parts`).toBe(true);
  });
  for (const chunk of chunks) expect(chunk.reduce((n, ts) => n + ts.length, 0)).toBeGreaterThan(0);
}

const FRONT: Face = { role: "lettering", at: [0, 0, 0], size: [0.2, 0.1], facing: [0, 0, 1], up: [0, 1, 0] };

describe("the chunker on stub primitives (plan.md §5.2)", () => {
  it("puts every triangle in exactly one of the set-aside part and the N chunks, each chunk non-empty (SC-001)", () => {
    const i = input({
      primitives: [prim("body", grid(8, 6)), prim("legs", grid(3, 3, 0.05, -0.4), "u16"), prim("trim", grid(2, 5, 0.04, 0.2), "none")],
      faces: [{ ...FRONT, role: "trim", at: [0, 0.2, 0], facing: [0, 1, 0], up: [0, 0, -1] }],
      n: 5,
    });
    const aside = setAside(i);
    expect(asideOf(aside.mask, 2)).toHaveLength(10);
    expectPartition(i, aside.mask, split(i, aside.mask).chunks);
  });

  it("gives the same split on 100 runs with the same seed, and its own with another", () => {
    const i = input({ primitives: [prim("body", grid(10, 10)), prim("top", grid(4, 4, 0.08, 0.3))], n: 6 });
    const aside = setAside(i);
    const first = JSON.stringify(split(i, aside.mask).chunks);
    for (let run = 0; run < 100; run++) {
      expect(JSON.stringify(setAside(i).mask.map((m) => [...m]))).toBe(JSON.stringify(aside.mask.map((m) => [...m])));
      expect(JSON.stringify(split(i, aside.mask).chunks)).toBe(first);
    }
    expect(JSON.stringify(split({ ...i, seed: "another-piece" }, aside.mask).chunks)).not.toBe(first);
  });

  it("refills an empty group from the largest: two tight clusters still make six non-empty chunks", () => {
    const cluster = (x: number): Tri[] => Array.from({ length: 10 }, (_, k) => flat(x + k * 0.0004, 0, 0, 0.0002));
    const i = input({ primitives: [prim("body", [...cluster(-1), ...cluster(1)])], n: 6 });
    const aside = setAside(i);
    expectPartition(i, aside.mask, split(i, aside.mask).chunks);
  });

  it("makes N one-triangle chunks of N triangles", () => {
    const i = input({ primitives: [prim("body", [flat(0, 0, 0), flat(1, 0, 0), flat(0, 1, 0), flat(5, 5, 5)])], n: 4 });
    const chunks = split(i, setAside(i).mask).chunks;
    expect(chunks.map((c) => c[0]?.length)).toEqual([1, 1, 1, 1]);
  });

  it("(a) sets aside every triangle of a mesh named for a face's role, wherever it lies", () => {
    const i = input({
      primitives: [prim("lettering", [flat(0, 0, 0.002), flat(3, 3, 3)]), prim("stand", [flat(0, 0, 0.3)])],
      faces: [FRONT],
    });
    expect(asideOf(setAside(i).mask, 0)).toEqual([0, 1]);
    expect(asideOf(setAside(i).mask, 1)).toEqual([]);
  });

  it("(b) sets aside a triangle behind a face's rectangle at 7 mm and at 60 mm, and not one beside it or in front", () => {
    const tris: Tri[] = [
      flat(0, 0, -0.007), // 0: 7 mm behind, inside
      flat(0.05, 0.02, -0.06), // 1: 60 mm behind, inside
      flat(0.13, 0, -0.007), // 2: beside the rectangle (x from 0.125), 7 mm behind
      flat(0, 0.07, -0.007), // 3: beside it, above
      flat(0, 0, 0.003), // 4: in front
      [
        [0, 0, -0.01],
        [0.01, 0, -0.01],
        [0, 0.01, 0.001],
      ], // 5: through the plane, a corner 1 mm in front
      flat(0, 0, 0.0004), // 6: within the 0.5 mm the face allows
      flat(0.098, 0.048, -0.5, 0.004), // 7: far behind, overlapping a corner of the rectangle
    ];
    const i = input({ primitives: [prim("stand", tris)], faces: [FRONT] });
    expect(asideOf(setAside(i).mask)).toEqual([0, 1, 6, 7]);
  });

  it("(b) projects on right = up × facing for a tilted face (the busy sign's slope)", () => {
    const [s, c] = [Math.sin((12.16 * Math.PI) / 180), Math.cos((12.16 * Math.PI) / 180)];
    const face: Face = { role: "lettering", at: [0, 0.05, 0.017], size: [0.192, 0.0613], facing: [0, s, c], up: [0, c, -s] };
    // A point d behind the face's centre, moved along `up` by v and along x by u.
    const at = (u: number, v: number, d: number): V3 => [u, 0.05 + v * c - d * s, 0.017 + v * -s - d * c];
    const tri = (u: number, v: number, d: number): Tri => [at(u - 0.003, v - 0.003, d), at(u + 0.003, v - 0.003, d), at(u, v + 0.003, d)];
    const i = input({
      primitives: [prim("stand", [tri(0, 0, 0.011), tri(0.08, 0.02, 0.063), tri(0, 0.04, 0.011), tri(0.11, 0, 0.02)])],
      faces: [face],
    });
    expect(asideOf(setAside(i).mask)).toEqual([0, 1]);
  });

  it("(c) sets aside what a keep-out box carries, the box grown MOUNT_MARGIN (10 mm) every way", () => {
    expect(MOUNT_MARGIN).toBe(0.01);
    const box = { min: [-0.1, 1.0, -0.1] as V3, max: [0.1, 1.1, 0.1] as V3 };
    const i = input({
      primitives: [
        prim("top", [
          level(0, 1.0, 0, 0.02), // 0: under the box, touching its foot
          level(0.13, 1.05, 0, 0.021), // 1: 9 mm to its side (x from 0.109)
          level(0, 0.991, 0), // 2: 9 mm below it
          level(0, 0.989, 0), // 3: 11 mm below it
          level(0.131, 1.05, 0, 0.02), // 4: 11 mm to its side (x from 0.111)
          level(0.5, 1.0, 0.5), // 5: elsewhere on the top
        ]),
      ],
      keepOuts: [box],
    });
    expect(asideOf(setAside(i).mask)).toEqual([0, 1, 2]);
  });

  it("(d) sets aside a glow's mesh, named for its id, and what lies within its radius of its point", () => {
    const glow: GlowPoint = { id: "charge-light", at: [0, 0, 0], radius: 0.006 };
    const big = (y: number): Tri => [
      [-0.2, y, -0.2],
      [0.2, y, -0.2],
      [0, y, 0.2],
    ]; // its corners far from the point, its face passing over it
    const i = input({
      primitives: [
        prim("charge-light", [flat(1, 1, 1)]),
        prim("base", [big(0.0059), big(0.0061), flat(0.0055, 0, 0, 0.0001), flat(0.0065, 0, 0, 0.0001)]),
      ],
      glows: [glow],
    });
    const aside = setAside(i);
    expect(asideOf(aside.mask, 0)).toEqual([0]);
    expect(asideOf(aside.mask, 1)).toEqual([0, 2]);
  });

  it("(d) takes no ball for a glow on a face (2.4 mm in front, inside it), only the face's (a) and (b)", () => {
    const tris: Tri[] = [flat(0, 0, 0.05), flat(0, 0, -0.007), flat(0.15, 0, 0.01)];
    const on: GlowPoint = { id: "screen-glow", at: [0, 0, 0.0024], radius: 0.18 };
    const base = { primitives: [prim("keyboard", tris), prim("screen", [flat(0, 0, 0)])], faces: [{ ...FRONT, role: "screen" }] };
    const onFace = setAside(input({ ...base, glows: [on] }));
    expect(asideOf(onFace.mask, 0)).toEqual([1]);
    expect(asideOf(onFace.mask, 1)).toEqual([0]);
    // 6 mm in front, or beside the rectangle, it stands on nothing the face holds: it takes its ball.
    expect(asideOf(setAside(input({ ...base, glows: [{ ...on, at: [0, 0, 0.006] }] })).mask, 0)).toEqual([0, 1, 2]);
    expect(asideOf(setAside(input({ ...base, glows: [{ ...on, at: [0.12, 0, 0.0024] }] })).mask, 0)).toEqual([0, 1, 2]);
  });

  it("keeps each triangle in its own primitive when a chunk spans two", () => {
    // Two primitives interleaved in space: every chunk takes triangles of both.
    const a = grid(6, 6, 0.05);
    const b = grid(6, 6, 0.05).map((t): Tri => t.map(([x, y, z]): V3 => [x + 0.025, y, z + 0.025]) as unknown as Tri);
    const i = input({ primitives: [prim("a", a), prim("b", b, "u16")], n: 4 });
    const aside = setAside(i);
    const { chunks } = split(i, aside.mask);
    expectPartition(i, aside.mask, chunks);
    for (const chunk of chunks) {
      expect(chunk[0]?.length).toBeGreaterThan(0);
      expect(chunk[1]?.length).toBeGreaterThan(0);
      // A chunk's triangles of b are b's own: each its centre in b's lattice, a quarter step off a's.
      for (const t of chunk[1] ?? []) {
        const [p, q, r] = corners(i.primitives[1] as Primitive, t);
        const x = (p[0] + q[0] + r[0]) / 3;
        expect(Math.abs(((x / 0.05) % 1) - 0.5)).toBeLessThan(0.01);
      }
    }
  });

  it("reads a primitive's mesh name: the parent group's for a multi-primitive mesh, its own for a one-primitive one", () => {
    const laptop = { name: "laptop", isMesh: false, parent: null };
    const base = { name: "base", isMesh: false, parent: laptop };
    expect(meshNameOf({ name: "base_1", isMesh: true, parent: base })).toBe("base");
    expect(meshNameOf({ name: "base_4", isMesh: true, parent: base })).toBe("base");
    expect(meshNameOf({ name: "charge-light", isMesh: true, parent: laptop })).toBe("charge-light");
    // A one-primitive mesh whose own name only looks numbered stays itself.
    expect(meshNameOf({ name: "lid_2", isMesh: true, parent: laptop })).toBe("lid_2");
    // A face's and a glow's mesh match in both cases.
    const slate = { name: "slate", isMesh: false, parent: laptop };
    const i = input({
      primitives: [
        prim(meshNameOf({ name: "slate_1", isMesh: true, parent: slate }), [flat(0, 0, 0.3)]),
        prim(meshNameOf({ name: "slate_2", isMesh: true, parent: slate }), [flat(0, 0, 0.3)]),
        prim(meshNameOf({ name: "charge-light", isMesh: true, parent: laptop }), [flat(2, 2, 2)]),
      ],
      faces: [{ ...FRONT, role: "slate" }],
      glows: [{ id: "charge-light", at: [9, 9, 9], radius: 0.006 }],
    });
    expect(setAside(i).mask.map((m) => [...m])).toEqual([[1], [1], [1]]);
  });

  it("runs k-means a fixed 8 iterations", () => {
    expect(KMEANS_ITERATIONS).toBe(8);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// Keep-outs from mounts (plan.md §5.2, §5.4)
// --------------------------------------------------------------------------------------------------------------------
describe("keep-out boxes from the mounts on a piece", () => {
  const box = (size: V3, at: V3): Shape =>
    ({ shape: "box", size, at, turn: { x: 0, y: 0, z: 0 }, scale: [1, 1, 1], color: "#000000", lit: true }) as Shape;
  type Part = Pick<RoomScene, "pieces" | "placements" | "switches">;
  const piece = (scale: number, anchors: RoomScene["pieces"][string]["anchors"], standin: Shape[] = []) => ({
    scale,
    anchors,
    standin,
    faces: {},
    glows: {},
  });
  const placement = (id: string, p: string, mount: { on: string; anchor: string } | null, over = {}) => ({
    id,
    piece: p,
    mount,
    offset: [0, 0, 0] as V3,
    turn: { x: 0, y: 0, z: 0 },
    framed: false,
    frame_box: { min: [0, 0, 0] as V3, max: [0, 0, 0] as V3 },
    label: null,
    model: null,
    edible: null,
    ...over,
  });

  it("puts a stand-in's box, at its scale, turned and offset at the anchor, into the parent's frame at scale 1", () => {
    const part = {
      pieces: {
        table: piece(2, { top: { at: [0, 0.5, 0], turn: { x: 0, y: 0, z: 0 } } }),
        // x from 0 to 0.2, y 0 to 0.1, z −0.05 to 0.05, at scale 1.
        block: piece(1.5, {}, [box([0.2, 0.1, 0.1], [0.1, 0.05, 0])]),
      },
      placements: [
        placement("table", "table", null),
        placement("block", "block", { on: "table", anchor: "top" }, { offset: [0.2, 0, 0], turn: { x: 0, y: 90, z: 0 } }),
      ],
      switches: [],
    } as unknown as Part;
    const [b] = keepOutBoxes(part, "table");
    // Scaled 1.5: x 0 to 0.3, y 0 to 0.15, z ±0.075; turned 90° about Y: x' = z, z' = −x; offset 0.2 in x; at the
    // anchor, 2 × 0.5 = 1 up; then into the table's frame at scale 1, halved.
    expect(b?.min[0]).toBeCloseTo((0.2 - 0.075) / 2, 9);
    expect(b?.max[0]).toBeCloseTo((0.2 + 0.075) / 2, 9);
    expect(b?.min[1]).toBeCloseTo(1 / 2, 9);
    expect(b?.max[1]).toBeCloseTo((1 + 0.15) / 2, 9);
    expect(b?.min[2]).toBeCloseTo(-0.3 / 2, 9);
    expect(b?.max[2]).toBeCloseTo(0, 9);
    expect(keepOutBoxes(part, "block")).toEqual([]);
  });

  it("takes a set model's measured bounds as they are (the studio models at the stylized scale), and a switch's poses", () => {
    const measured = { min: [-0.166, -0.011, -0.006] as V3, max: [0, 0.011, 0.006] as V3 };
    const model = { url: "", sha256: "", bytes: 0, bounds: measured, texture_bytes: 0 };
    const part = {
      pieces: {
        laptop: piece(1, { port: { at: [0.155, 0.008, 0.05], turn: { x: 0, y: 180, z: 0 } } }),
        charger: piece(2, {}, [box([1, 1, 1], [0, 0, 0])]),
      },
      placements: [placement("laptop", "laptop", null)],
      switches: [
        {
          id: "power",
          piece: "charger",
          poses: {
            plugged: { mount: { on: "laptop", anchor: "port", offset: [0, 0, 0], turn: { x: 0, y: 0, z: 0 } }, glows: [] },
            away: { mount: { on: "elsewhere", anchor: "top", offset: [0, 0, 0], turn: { x: 0, y: 0, z: 0 } }, glows: [] },
          },
          cable: null,
          model,
        },
      ],
    } as unknown as Part;
    const boxes = keepOutBoxes(part, "laptop");
    expect(boxes).toHaveLength(1);
    const [b] = boxes;
    expect(b?.min[0]).toBeCloseTo(0.155, 6);
    expect(b?.max[0]).toBeCloseTo(0.155 + 0.166, 6);
    expect(b?.min[1]).toBeCloseTo(0.008 - 0.011, 6);
    expect(b?.min[2]).toBeCloseTo(0.05 - 0.006, 6);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The four real pieces
// --------------------------------------------------------------------------------------------------------------------
const PIECES = ["work-desk", "busy-sign", "laptop", "chalkboard"] as const;
type PieceId = (typeof PIECES)[number];

interface Real {
  readonly input: ChunkInput;
  readonly mask: readonly Uint8Array[];
  readonly chunks: number[][][];
  readonly asideMs: number;
  readonly splitMs: number;
}

const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

const real = new Map<PieceId, Real>();
let scene: RoomScene;

beforeAll(() => {
  scene = repositoryBundle().scene;
  for (const id of PIECES) {
    const placement = scene.placements.find((p) => p.id === id);
    const piece = scene.pieces[id];
    if (!placement || !piece || !placement.edible) throw new Error(`${id}: not an edible placement of the bundle`);
    const input: ChunkInput = {
      primitives: piecePrimitives(roomGlb(id), piece.scale),
      faces: facesOf(piece),
      glows: glowsOf(piece),
      keepOuts: keepOutBoxes(scene, id),
      n: placement.edible.chunks,
      seed: id,
    };
    // FR-015: each under 50 ms; the median of five runs, so a busy test machine's one stall doesn't decide it.
    const asideTimes: number[] = [];
    const splitTimes: number[] = [];
    let mask: readonly Uint8Array[] = [];
    let chunks: number[][][] = [];
    for (let run = 0; run < 5; run++) {
      let t = performance.now();
      mask = setAside(input).mask;
      asideTimes.push(performance.now() - t);
      t = performance.now();
      chunks = split(input, mask).chunks;
      splitTimes.push(performance.now() - t);
    }
    real.set(id, { input, mask, chunks, asideMs: median(asideTimes), splitMs: median(splitTimes) });
  }
}, 120_000);

const of = (id: PieceId): Real => real.get(id) as Real;
const meshIndices = (r: Real, mesh: string): number[] =>
  r.input.primitives.flatMap((p, k) => (p.mesh === mesh ? [k] : []));
const asideCount = (r: Real, mesh?: string): number =>
  r.mask.reduce((n, m, k) => n + (mesh === undefined || r.input.primitives[k]?.mesh === mesh ? m.reduce((a, v) => a + v, 0) : 0), 0);
const totalOf = (r: Real, mesh: string): number =>
  meshIndices(r, mesh).reduce((n, k) => n + triangles(r.input.primitives[k] as Primitive), 0);
const isAside = (r: Real, hit: { p: number; t: number } | null): boolean => hit !== null && r.mask[hit.p]?.[hit.t] === 1;

describe("the chunker on the four real pieces (FR-003, FR-004, FR-015, SC-001)", () => {
  it("reads the laptop's mesh names as three's GLTFLoader gives them: base's 4 primitives and the one charge-light", async () => {
    const loader = new GLTFLoader();
    for (const id of ["laptop", "busy-sign"] as const) {
      const bytes = new Uint8Array(readFileSync(join(REPO, "assets/room", `${id}.glb`)));
      const root: Object3D = (await loader.parseAsync(bytes.slice().buffer, "")).scene;
      const names: string[] = [];
      root.traverse((node) => {
        if ((node as Partial<Mesh>).isMesh) names.push(meshNameOf(node));
      });
      // The helper's rebuild of the loader's tree gives the same names in the same order.
      expect(of(id).input.primitives.map((p) => p.mesh)).toEqual(names);
    }
    const names = of("laptop").input.primitives.map((p) => p.mesh);
    expect(names.filter((n) => n === "base")).toHaveLength(4);
    expect(names.filter((n) => n === "charge-light")).toHaveLength(1);
    expect([...new Set(names)].sort()).toEqual(["base", "charge-light", "keyboard", "lid", "screen", "trackpad"]);
  });

  it.each([
    ["busy-sign", "lettering", "busy-sign-stand"],
    ["chalkboard", "slate", "frame"],
    ["laptop", "screen", "lid"],
  ] as const)("%s: sets aside its face's mesh %s, and what holds it up (%s, behind its centre)", (id, role, holder) => {
    const r = of(id);
    expect(meshIndices(r, role).length).toBeGreaterThan(0);
    expect(asideCount(r, role)).toBe(totalOf(r, role));
    const face = r.input.faces.find((f) => f.role === role) as Face;
    const back: V3 = [-face.facing[0], -face.facing[1], -face.facing[2]];
    const hit = firstHit(r.input.primitives, face.at, back, (p) => p.mesh !== role);
    expect(hit && r.input.primitives[hit.p]?.mesh).toBe(holder);
    expect(isAside(r, hit)).toBe(true);
    expect(asideCount(r, holder)).toBeGreaterThan(0);
  });

  it("work-desk: sets aside the top under each of its 9 mounts (7 placements and the charger's two desk poses)", () => {
    const r = of("work-desk");
    expect(r.input.keepOuts).toHaveLength(9);
    for (const box of r.input.keepOuts) {
      const centre: V3 = [(box.min[0] + box.max[0]) / 2, 2, (box.min[2] + box.max[2]) / 2];
      const hit = firstHit(r.input.primitives, centre, [0, -1, 0]);
      expect(hit, `nothing under ${JSON.stringify(box)}`).not.toBeNull();
      expect(isAside(r, hit), `the top under ${JSON.stringify(box)}`).toBe(true);
    }
  });

  it("laptop: sets aside its port, where the plugged charger mounts", () => {
    const r = of("laptop");
    expect(r.input.keepOuts).toHaveLength(1);
    const port = scene.pieces.laptop?.anchors.port?.at as V3;
    const hit = firstHit(r.input.primitives, [port[0] + 0.05, port[1], port[2]], [-1, 0, 0]);
    expect(hit && r.input.primitives[hit.p]?.mesh).toBe("base");
    expect(isAside(r, hit)).toBe(true);
  });

  it("laptop: sets aside the charge-light mesh and the base within 6 mm of its point; the screen glow takes no ball", () => {
    const r = of("laptop");
    expect(asideCount(r, "charge-light")).toBe(totalOf(r, "charge-light"));
    const glow = r.input.glows.find((g) => g.id === "charge-light") as GlowPoint;
    expect(glow.radius).toBeCloseTo(0.006, 9);
    let near = 0;
    for (const k of meshIndices(r, "base")) {
      const p = r.input.primitives[k] as Primitive;
      for (let t = 0; t < triangles(p); t++) {
        // Within its radius: the triangle's nearest point, not a corner (the base's nearest corner is 13.6 mm off).
        if (triangleDistance(glow.at, corners(p, t)) > glow.radius) continue;
        near++;
        expect(r.mask[k]?.[t], `base triangle ${t} of primitive ${k}, within 6 mm`).toBe(1);
      }
    }
    expect(near).toBeGreaterThan(0);
    // The keyboard isn't set aside wholesale, as a ball of the screen glow's 0.18 m would set it.
    expect(asideCount(r, "keyboard")).toBeLessThan(totalOf(r, "keyboard") / 2);
  });

  it.each(PIECES)("%s: splits into its N non-empty, edible chunks, every triangle once (SC-001)", (id) => {
    const r = of(id);
    expectPartition(r.input, r.mask, r.chunks);
    // Edible: the set-aside part isn't empty, so every chunk can go (FR-005), and it is small beside the rest.
    const aside = asideCount(r);
    const total = r.input.primitives.reduce((n, p) => n + triangles(p), 0);
    expect(aside).toBeGreaterThan(0);
    expect(aside).toBeLessThan(total / 4);
    const sizes = r.chunks.map((c) => c.reduce((n, ts) => n + ts.length, 0));
    console.info(`${id}: ${total} triangles, ${aside} set aside, chunks ${sizes.join(", ")}`);
  });

  it.each(PIECES)("%s: the same split on 100 runs (SC-001)", (id) => {
    const r = of(id);
    const first = JSON.stringify(r.chunks);
    for (let run = 0; run < 100; run++) expect(JSON.stringify(split(r.input, r.mask).chunks)).toBe(first);
  });

  it.each(PIECES)("%s: set-aside and split each under 50 ms (FR-015)", (id) => {
    const r = of(id);
    console.info(`${id}: set-aside ${r.asideMs.toFixed(1)} ms, split ${r.splitMs.toFixed(1)} ms (median of 5)`);
    expect(r.asideMs).toBeLessThan(50);
    expect(r.splitMs).toBeLessThan(50);
  });
});
