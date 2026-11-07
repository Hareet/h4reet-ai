// T061 (spec 004; FR-003, FR-051; R-17; data-model.md §4.2; contracts/room-data-files.md §2): the kernel's world
// resolver, `compose/mount.ts`, and its matrices, `compose/math.ts`, held to three.js. A placement's world transform is
//   World(shell) = I
//   World(p)     = World(on) · T(s_on · anchor.at) · R(anchor.turn) · T(offset) · R(turn)
//   Model(p)     = World(p) · S(s_p)
//   R({x, y, z}) = Ry(y) · Rx(x) · Rz(z)        (three.js's Euler order "YXZ")
// so a parent's move carries everything mounted on it, and a child never takes its parent's stylized scale. Every ID
// here is a synthetic `fx-` one: the room's data defines the real ones, and the source scan keeps them out of code.
import { Euler, MathUtils, Matrix3, Matrix4, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  IDENTITY,
  invert,
  multiply,
  rotation,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  transformDirection,
  transformPoint,
  translation,
} from "../../src/room/compose/math";
import type { Mat4, Turn, Vec3 } from "../../src/room/compose/math";
import { anchorWorld, modelOf, mountWorld, resolveMounts } from "../../src/room/compose/mount";
import type { MountPiece, MountPlacement } from "../../src/room/compose/mount";

/** A seeded xorshift32 stream in [0, 1), so every run checks the same values. */
function stream(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-9, what = ""): void {
  expect(actual.length, what).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const [a, e] = [actual[i] ?? Number.NaN, expected[i] ?? Number.NaN];
    expect(Math.abs(a - e), `${what}[${i}]: ${a} against ${e}`).toBeLessThanOrEqual(tolerance);
  }
}

const turnOf = (x: number, y: number, z: number): Turn => ({ x, y, z });
const NO_TURN = turnOf(0, 0, 0);
const rad = (degrees: number): number => MathUtils.degToRad(degrees);
const three = (m: Mat4): Matrix4 => new Matrix4().fromArray([...m]);

/** three.js's rotation for a turn in degrees, in the room's order. */
const threeRotation = (t: Turn): Matrix4 =>
  new Matrix4().makeRotationFromEuler(new Euler(rad(t.x), rad(t.y), rad(t.z), "YXZ"));

describe("the kernel's matrices (compose/math.ts)", () => {
  const next = stream(0x5eed0061);
  const between = (lo: number, hi: number): number => lo + (hi - lo) * next();
  const vec = (lo: number, hi: number): Vec3 => [between(lo, hi), between(lo, hi), between(lo, hi)];
  const turn = (): Turn => turnOf(between(-360, 360), between(-360, 360), between(-360, 360));

  it("are column-major, as three.js's Matrix4.elements", () => {
    expectClose(IDENTITY, new Matrix4().elements);
    const m = translation([1, 2, 3]);
    expect([m[12], m[13], m[14], m[15]]).toEqual([1, 2, 3, 1]);
    expectClose(m, new Matrix4().makeTranslation(1, 2, 3).elements);
  });

  it("give translations, scales, and turns equal to three.js's within 1e-9", () => {
    for (let i = 0; i < 50; i += 1) {
      const v = vec(-5, 5);
      expectClose(translation(v), new Matrix4().makeTranslation(...v).elements, 1e-9, "translation");
      const s = between(0.25, 4);
      expectClose(scaling(s), new Matrix4().makeScale(s, s, s).elements, 1e-9, "scale");
      const a = between(-7, 7);
      expectClose(rotationX(a), new Matrix4().makeRotationX(a).elements, 1e-9, "x");
      expectClose(rotationY(a), new Matrix4().makeRotationY(a).elements, 1e-9, "y");
      expectClose(rotationZ(a), new Matrix4().makeRotationZ(a).elements, 1e-9, "z");
    }
  });

  it('turn in Y, then X, then Z: R({x, y, z}) = Ry(y) · Rx(x) · Rz(z), Euler order "YXZ", in degrees', () => {
    for (let i = 0; i < 100; i += 1) {
      const t = turn();
      const product = new Matrix4()
        .makeRotationY(rad(t.y))
        .multiply(new Matrix4().makeRotationX(rad(t.x)))
        .multiply(new Matrix4().makeRotationZ(rad(t.z)));
      expectClose(rotation(t), product.elements, 1e-9, "Ry · Rx · Rz");
      expectClose(rotation(t), threeRotation(t).elements, 1e-9, "YXZ");
    }
    // Each part alone: a quarter turn about Y takes +Z to +X; about X takes +Y to +Z; about Z takes +X to +Y.
    expectClose(transformDirection(rotation(turnOf(0, 90, 0)), [0, 0, 1]), [1, 0, 0]);
    expectClose(transformDirection(rotation(turnOf(90, 0, 0)), [0, 1, 0]), [0, 0, 1]);
    expectClose(transformDirection(rotation(turnOf(0, 0, 90)), [1, 0, 0]), [0, 1, 0]);
    expectClose(rotation(NO_TURN), IDENTITY);
  });

  it("multiply, invert, and transform points and directions as three.js does, within 1e-9", () => {
    for (let i = 0; i < 50; i += 1) {
      const a = multiply(multiply(translation(vec(-3, 3)), rotation(turn())), scaling(between(0.5, 3)));
      const b = multiply(translation(vec(-3, 3)), rotation(turn()));
      expectClose(multiply(a, b), new Matrix4().multiplyMatrices(three(a), three(b)).elements, 1e-9, "multiply");
      const inverse = invert(a);
      expect(inverse).not.toBeNull();
      if (inverse) expectClose(inverse, three(a).invert().elements, 1e-9, "invert");
      const p = vec(-4, 4);
      expectClose(transformPoint(a, p), new Vector3(...p).applyMatrix4(three(a)).toArray(), 1e-9, "point");
      const d = vec(-1, 1);
      const upper = new Matrix3().setFromMatrix4(three(a));
      expectClose(transformDirection(a, d), new Vector3(...d).applyMatrix3(upper).toArray(), 1e-9, "direction");
    }
  });

  it("refuse to invert a singular matrix", () => {
    expect(invert(scaling(0))).toBeNull();
  });
});

// A small tree: the shell at the root, a parent on the shell, a child on the parent, a grandchild on the child, and a
// sibling on the shell. Turns on every level, so a wrong order shows.
const PIECES: Record<string, MountPiece> = {
  "fx-base": { scale: 1, anchors: { "fx-mark": { at: [0.4, 0, -1.2], turn: turnOf(0, 15, 0) } } },
  "fx-holder": {
    scale: 1,
    anchors: {
      "fx-upper": { at: [0.1, 0.75, -0.2], turn: turnOf(0, -30, 0) },
      "fx-rear": { at: [0, 0.75, -0.35], turn: NO_TURN },
    },
  },
  "fx-panel": { scale: 2, anchors: { "fx-rim": { at: [0, 0.3, 0.01], turn: turnOf(10, 0, 5) } } },
  "fx-small": { scale: 1.5, anchors: { "fx-point": { at: [0.05, 0.12, 0], turn: turnOf(0, 0, 20) } } },
};

const TREE: MountPlacement[] = [
  { id: "fx-root", piece: "fx-base", mount: null, offset: [0, 0, 0], turn: NO_TURN },
  {
    id: "fx-parent",
    piece: "fx-holder",
    mount: { on: "fx-root", anchor: "fx-mark" },
    offset: [0.2, 0, 0.1],
    turn: turnOf(0, 12, 0),
  },
  {
    id: "fx-child",
    piece: "fx-panel",
    mount: { on: "fx-parent", anchor: "fx-upper" },
    offset: [0.05, 0.01, -0.02],
    turn: turnOf(-8, 25, 3),
  },
  {
    id: "fx-grandchild",
    piece: "fx-small",
    mount: { on: "fx-child", anchor: "fx-rim" },
    offset: [0, 0.02, 0],
    turn: turnOf(5, -40, 0),
  },
  {
    id: "fx-sibling",
    piece: "fx-small",
    mount: { on: "fx-root", anchor: "fx-mark" },
    offset: [-1, 0, 0],
    turn: NO_TURN,
  },
];

/** The same tree in three.js: an anchor node (s_on · at, the anchor's turn) and the placement's node (offset, turn). */
function threeTree(
  placements: readonly MountPlacement[],
  pieces: Record<string, MountPiece>,
): Map<string, { world: Object3D; model: Object3D }> {
  const root = new Object3D();
  const nodes = new Map<string, { world: Object3D; model: Object3D }>();
  const byId = new Map(placements.map((p) => [p.id, p]));
  for (const p of placements) {
    const world = new Object3D();
    world.position.set(...p.offset);
    world.rotation.set(rad(p.turn.x), rad(p.turn.y), rad(p.turn.z), "YXZ");
    if (p.mount === null) root.add(world);
    else {
      const parent = byId.get(p.mount.on);
      const parentPiece = parent ? pieces[parent.piece] : undefined;
      const anchor = parentPiece?.anchors[p.mount.anchor];
      const parentNode = nodes.get(p.mount.on);
      if (!parent || !parentPiece || !anchor || !parentNode) throw new Error(`fixture: ${p.id}'s mount`);
      const anchorNode = new Object3D();
      anchorNode.position.set(...anchor.at).multiplyScalar(parentPiece.scale);
      anchorNode.rotation.set(rad(anchor.turn.x), rad(anchor.turn.y), rad(anchor.turn.z), "YXZ");
      parentNode.world.add(anchorNode);
      anchorNode.add(world);
    }
    const model = new Object3D();
    const scale = pieces[p.piece]?.scale ?? 1;
    model.scale.set(scale, scale, scale);
    world.add(model);
    nodes.set(p.id, { world, model });
  }
  root.updateMatrixWorld(true);
  return nodes;
}

const position = (m: Mat4): Vec3 => [m[12], m[13], m[14]];
const columnLength = (m: Mat4, c: 0 | 1 | 2): number => Math.hypot(...[0, 1, 2].map((r) => m[c * 4 + r] ?? Number.NaN));

describe("the world resolver (compose/mount.ts)", () => {
  it("puts the root, the one placement with no mount, at the identity", () => {
    const { world, model, unresolved } = resolveMounts(TREE, PIECES);
    expectClose(world.get("fx-root") ?? [], IDENTITY);
    expectClose(model.get("fx-root") ?? [], IDENTITY);
    expect(unresolved).toEqual([]);
  });

  it("gives World(p) = World(on) · T(s_on · anchor.at) · R(anchor.turn) · T(offset) · R(turn), and Model(p) = World(p) · S(s_p)", () => {
    const { world, model } = resolveMounts(TREE, PIECES);
    const byId = new Map(TREE.map((p) => [p.id, p]));
    for (const p of TREE) {
      if (p.mount === null) continue;
      const parent = byId.get(p.mount.on);
      const parentPiece = parent ? PIECES[parent.piece] : undefined;
      const anchor = parentPiece?.anchors[p.mount.anchor];
      const parentWorld = world.get(p.mount.on);
      if (!parentPiece || !anchor || !parentWorld) throw new Error(`fixture: ${p.id}`);
      const expected = [
        translation([
          anchor.at[0] * parentPiece.scale,
          anchor.at[1] * parentPiece.scale,
          anchor.at[2] * parentPiece.scale,
        ]),
        rotation(anchor.turn),
        translation(p.offset),
        rotation(p.turn),
      ].reduce(multiply, parentWorld);
      expectClose(world.get(p.id) ?? [], expected, 1e-12, `World(${p.id})`);
      expectClose(mountWorld(parentWorld, parentPiece.scale, anchor, p.offset, p.turn), expected, 1e-12, p.id);
      const own = PIECES[p.piece]?.scale ?? Number.NaN;
      expectClose(model.get(p.id) ?? [], multiply(expected, scaling(own)), 1e-12, `Model(${p.id})`);
      expectClose(modelOf(expected, own), multiply(expected, scaling(own)), 1e-12, `modelOf(${p.id})`);
    }
  });

  it("equals three.js's world matrices for the same tree within 1e-9, rotation order YXZ", () => {
    const { world, model } = resolveMounts(TREE, PIECES);
    const nodes = threeTree(TREE, PIECES);
    for (const p of TREE) {
      const node = nodes.get(p.id);
      if (!node) throw new Error(p.id);
      expectClose(world.get(p.id) ?? [], node.world.matrixWorld.elements, 1e-9, `world ${p.id}`);
      expectClose(model.get(p.id) ?? [], node.model.matrixWorld.elements, 1e-9, `model ${p.id}`);
      const origin = node.world.getWorldPosition(new Vector3());
      expectClose(position(world.get(p.id) ?? IDENTITY), origin.toArray(), 1e-9, `position ${p.id}`);
    }
  });

  it("never gives a child its parent's stylized scale, though the parent's anchors move with it", () => {
    const { world, model } = resolveMounts(TREE, PIECES);
    // fx-child's piece is at scale 2: its own model is scaled; the grandchild mounted on it isn't.
    const child = model.get("fx-child") ?? IDENTITY;
    expect(columnLength(child, 0)).toBeCloseTo(2, 12);
    const grandchild = world.get("fx-grandchild") ?? IDENTITY;
    for (const c of [0, 1, 2] as const) expect(columnLength(grandchild, c)).toBeCloseTo(1, 12);
    // Its model takes only its own scale, 1.5.
    expect(columnLength(model.get("fx-grandchild") ?? IDENTITY, 1)).toBeCloseTo(1.5, 12);
    // The anchor it hangs from sits at s_on · at in the parent's frame: twice as far as at scale 1.
    const atScale2 = anchorWorld(
      world.get("fx-child") ?? IDENTITY,
      2,
      PIECES["fx-panel"]?.anchors["fx-rim"] ?? { at: [0, 0, 0], turn: NO_TURN },
    );
    const atScale1 = anchorWorld(
      world.get("fx-child") ?? IDENTITY,
      1,
      PIECES["fx-panel"]?.anchors["fx-rim"] ?? { at: [0, 0, 0], turn: NO_TURN },
    );
    const childOrigin = position(world.get("fx-child") ?? IDENTITY);
    const far = Math.hypot(...position(atScale2).map((v, i) => v - (childOrigin[i] ?? 0)));
    const near = Math.hypot(...position(atScale1).map((v, i) => v - (childOrigin[i] ?? 0)));
    expect(far / near).toBeCloseTo(2, 12);
    // A grandchild with no offset sits exactly on that anchor, scaled position and all.
    const flush = resolveMounts(
      TREE.map((p) => (p.id === "fx-grandchild" ? { ...p, offset: [0, 0, 0], turn: NO_TURN } : p)),
      PIECES,
    );
    expectClose(position(flush.world.get("fx-grandchild") ?? IDENTITY), position(atScale2), 1e-12);
  });

  it("carries everything mounted on a parent when the parent moves (FR-003)", () => {
    const before = resolveMounts(TREE, PIECES);
    const moved = resolveMounts(
      TREE.map((p) =>
        p.id === "fx-parent" ? { ...p, offset: [p.offset[0] + 0.5, p.offset[1], p.offset[2] - 0.25] } : p,
      ),
      PIECES,
    );
    const shift = (id: string): Vec3 => {
      const [a, b] = [position(before.world.get(id) ?? IDENTITY), position(moved.world.get(id) ?? IDENTITY)];
      return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    };
    const parentShift = shift("fx-parent");
    expect(Math.hypot(...parentShift)).toBeGreaterThan(0.5);
    for (const id of ["fx-child", "fx-grandchild"]) expectClose(shift(id), parentShift, 1e-12, id);
    // The sibling, on the shell, stays where it was.
    expectClose(shift("fx-sibling"), [0, 0, 0], 1e-12, "sibling");
    // A turn of the parent turns its children about the parent's origin, and keeps their places relative to it.
    const turned = resolveMounts(
      TREE.map((p) => (p.id === "fx-parent" ? { ...p, turn: turnOf(0, 102, 0) } : p)),
      PIECES,
    );
    const relative = (r: typeof before, id: string): number => {
      const [o, q] = [position(r.world.get("fx-parent") ?? IDENTITY), position(r.world.get(id) ?? IDENTITY)];
      return Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]);
    };
    expect(relative(turned, "fx-grandchild")).toBeCloseTo(relative(before, "fx-grandchild"), 12);
  });

  it("stops on a cycle and leaves it to RG1, resolving the rest; a missing parent, anchor, or piece is left to RI4", () => {
    const cyclic: MountPlacement[] = [
      ...TREE,
      {
        id: "fx-loop-a",
        piece: "fx-small",
        mount: { on: "fx-loop-b", anchor: "fx-point" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
      {
        id: "fx-loop-b",
        piece: "fx-small",
        mount: { on: "fx-loop-a", anchor: "fx-point" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
      {
        id: "fx-on-loop",
        piece: "fx-small",
        mount: { on: "fx-loop-a", anchor: "fx-point" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
      {
        id: "fx-self",
        piece: "fx-small",
        mount: { on: "fx-self", anchor: "fx-point" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
      {
        id: "fx-orphan",
        piece: "fx-small",
        mount: { on: "fx-nowhere", anchor: "fx-point" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
      {
        id: "fx-no-anchor",
        piece: "fx-small",
        mount: { on: "fx-parent", anchor: "fx-missing" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
      {
        id: "fx-no-piece",
        piece: "fx-missing",
        mount: { on: "fx-parent", anchor: "fx-upper" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
      {
        id: "fx-under-no-piece",
        piece: "fx-small",
        mount: { on: "fx-no-piece", anchor: "fx-point" },
        offset: [0, 0, 0],
        turn: NO_TURN,
      },
    ];
    const { world, unresolved } = resolveMounts(cyclic, PIECES);
    expect(unresolved).toEqual([
      { id: "fx-loop-a", reason: "cycle" },
      { id: "fx-loop-b", reason: "cycle" },
      { id: "fx-on-loop", reason: "parent" },
      { id: "fx-self", reason: "cycle" },
      { id: "fx-orphan", reason: "parent" },
      { id: "fx-no-anchor", reason: "anchor" },
      { id: "fx-no-piece", reason: "piece" },
      { id: "fx-under-no-piece", reason: "parent" },
    ]);
    for (const { id } of unresolved) expect(world.has(id), id).toBe(false);
    for (const p of TREE) expect(world.has(p.id), p.id).toBe(true);
  });
});
