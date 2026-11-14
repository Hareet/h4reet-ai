// T008 and T009 (spec 024; FR-003, FR-004, FR-006 to FR-008, FR-015; RB-1, N-3; plan.md §5.4): the 3D side, on stub meshes and
// on the four real pieces built as three.js trees in GLTFLoader's names (helpers/eat-pieces.ts), no GPU. A first bite
// splits the piece: one mesh per chunk and primitive, sharing its primitive's attributes and material; a cut-face mesh
// beside each, one back-side cut material per original material, base colour × 0.7, no texture; the set-aside part's
// meshes, fixed; every one taking its source's visibility. A bite flies a chunk to the mouth in 600 ms and hides it; the
// last regrowth gives the piece back its own meshes, each with its recorded visibility, nothing disposed.
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from "three";
import type { Material, Object3D } from "three";
import { describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { CUT_SHADE, FLIGHT_MS, GROW_MS, createEat3d } from "../../src/room/eat/eat3d";
import type { EatKind } from "../../src/room/eat/eat3d";
import { createMeal } from "../../src/room/eat/meal";
import { facesOf, glowsOf, meshNameOf } from "../../src/room/eat/chunker";
import type { Face, GlowPoint, Primitive } from "../../src/room/eat/chunker";
import { keepOutBoxes } from "../../src/room/eat/keepouts";
import { corners, firstHit, pieceModel, roomGlb, triangleDistance, triangles } from "../helpers/eat-pieces";
import type { V3 } from "../helpers/eat-pieces";
import { repositoryBundle } from "../helpers/room";

type Part = Pick<RoomScene, "pieces" | "placements" | "switches">;

// Spec 004's FR-007: no room ID stands in a test, so each real piece is found in the repository's bundle by its
// placement's label words, and the charger by the switch whose pose mounts on the laptop.
const labelled = (words: string): string => {
  const { scene, index } = repositoryBundle();
  const found = scene.placements.filter((p) => p.label !== null && index.ui[p.label] === words);
  if (found.length !== 1 || !found[0]) throw new Error(`${found.length} placements labelled ${words}`);
  return found[0].id;
};
const DESK = labelled("Desk");
const SIGN = labelled("Desk sign, busy");
const LAPTOP = labelled("Laptop");
const CHALKBOARD = labelled("Chalkboard");
const POWER = repositoryBundle().scene.switches.find((s) =>
  Object.values(s.poses).some((pose) => pose.mount.on === LAPTOP),
);
const CHARGER = POWER?.piece ?? "";

/** Each effective visibility: the node and its ancestors up to the model's root. */
function shown(node: Object3D, root: Object3D): boolean {
  for (let n: Object3D | null = node; n; n = n === root ? null : n.parent) if (!n.visible) return false;
  return true;
}

const kindOf = (node: Object3D): EatKind | undefined => (node.userData.eat as { kind?: EatKind } | undefined)?.kind;

/** The eating's meshes under a model, by kind. */
function eatMeshes(root: Object3D, kind: EatKind): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((n) => {
    if (kindOf(n) === kind) out.push(n as Mesh);
  });
  return out;
}

/** The meshes a model draws: each mesh shown, its own and its ancestors' visibility. */
function drawn(root: Object3D): number {
  let n = 0;
  root.traverse((node) => {
    if ((node as Partial<Mesh>).isMesh && shown(node, root)) n++;
  });
  return n;
}

/** A small grid of triangles in the plane z = `z`, x and y from 0 to `w` × step, with normal and uv attributes. */
function sheet(w: number, h: number, z: number, step = 0.05, x0 = -0.15): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < w; i++)
    for (let j = 0; j < h; j++) {
      const [x, y] = [x0 + i * step, -0.1 + j * step];
      positions.push(x, y, z, x + step, y, z, x, y + step, z);
    }
  const g = new BufferGeometry();
  const count = positions.length / 3;
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(count * 2).fill(0.5), 2));
  g.setIndex(Array.from({ length: count }, (_, i) => i));
  return g;
}

interface Stub {
  readonly root: Group;
  readonly part: Part;
  readonly body: readonly Mesh[];
  readonly lettering: Mesh;
  readonly materials: readonly Material[];
}

/** A stub piece: a two-primitive mesh `body` (a group, as GLTFLoader makes it) of two materials, behind a face whose
 *  one-primitive mesh `lettering` is hidden as prepareModel hides it. */
function stub(): Stub {
  const root = new Group();
  root.name = "model";
  const red = new MeshStandardMaterial({ color: new Color(1, 0, 0) });
  const blue = new MeshStandardMaterial({ color: new Color(0, 0, 1) });
  const body = new Group();
  body.name = "body";
  const a = new Mesh(sheet(8, 6, -0.02), red);
  a.name = "body_1";
  const b = new Mesh(sheet(8, 6, -0.3, 0.05, 0.5), blue);
  b.name = "body_2";
  body.add(a, b);
  const lettering = new Mesh(sheet(2, 1, 0.001, 0.05, -0.05), red);
  lettering.name = "lettering";
  lettering.visible = false;
  root.add(body, lettering);
  root.position.set(1, 0.5, -2);
  root.updateMatrixWorld(true);
  const part = {
    pieces: {
      stub: {
        scale: 1,
        anchors: {},
        standin: [],
        faces: { lettering: { at: [0, 0, 0], size: [0.1, 0.05], facing: [0, 0, 1], up: [0, 1, 0] } },
        glows: {},
      },
    },
    placements: [
      {
        id: "stub",
        piece: "stub",
        mount: null,
        offset: [0, 0, 0],
        turn: { x: 0, y: 0, z: 0 },
        framed: true,
        frame_box: { min: [0, 0, 0], max: [1, 1, 1] },
        label: null,
        model: null,
        edible: { chunks: 3 },
      },
    ],
    switches: [],
  } as unknown as Part;
  return { root, part, body: [a, b], lettering, materials: [red, blue] };
}

interface Rig {
  readonly eat: ReturnType<typeof createEat3d>;
  readonly meal: ReturnType<typeof createMeal>;
  readonly clock: { t: number };
  readonly refresh: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly mouth: Group;
}

function rig(part: Part, models: Record<string, Object3D>, regrow_s = 5, over: { reduced?: boolean } = {}): Rig {
  const clock = { t: 1000 };
  const meal = createMeal({ regrow_s, now: () => clock.t });
  const refresh = vi.fn();
  const warn = vi.fn();
  const mouth = new Group();
  mouth.position.set(3, 1, 0);
  mouth.updateMatrixWorld(true);
  const eat = createEat3d({
    part,
    model: (id) => models[id] ?? null,
    figure: () => ({ root: mouth, height: 1.2 }),
    meal,
    highlight: { refresh },
    now: () => clock.t,
    reduced: () => over.reduced === true,
    warn,
  });
  return { eat, meal, clock, refresh, warn, mouth };
}

const centreOf = (meshes: readonly Mesh[]): Vector3 => {
  const c = new Vector3();
  let n = 0;
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    m.geometry.computeBoundingBox();
    const box = m.geometry.boundingBox;
    if (!box) continue;
    c.add(box.getCenter(new Vector3()).applyMatrix4(m.matrixWorld));
    n++;
  }
  return c.divideScalar(Math.max(n, 1));
};

describe("a first bite splits the piece (FR-003, FR-006; plan.md §5.4)", () => {
  it("builds one mesh per chunk and primitive, sharing every attribute and the material, and a cut mesh beside each", () => {
    const s = stub();
    const r = rig(s.part, { stub: s.root });
    expect(r.eat.bite("stub")).toBe(true);
    const chunks = eatMeshes(s.root, "chunk");
    const cuts = eatMeshes(s.root, "cut");
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(cuts).toHaveLength(chunks.length);
    const sources = new Set(s.body);
    for (const c of chunks) {
      const source = s.body.find((b) => b.parent === c.parent && b.material === c.material);
      expect(source, "a chunk mesh beside its source, sharing its material").toBeDefined();
      sources.delete(source as Mesh);
      for (const name of ["position", "normal", "uv"])
        expect(c.geometry.getAttribute(name)).toBe(source?.geometry.getAttribute(name));
      expect(c.position.equals((source as Mesh).position)).toBe(true);
      const cut = cuts.find((x) => x.geometry === c.geometry) as Mesh;
      expect(cut, "a cut mesh sharing the chunk's geometry").toBeDefined();
      const material = cut.material as MeshBasicMaterial;
      expect(material).toBeInstanceOf(MeshBasicMaterial);
      expect(material.side).toBe(BackSide);
      expect(material.map).toBeNull();
      const base = ((source as Mesh).material as MeshStandardMaterial).color;
      expect(material.color.r).toBeCloseTo(base.r * CUT_SHADE, 6);
      expect(material.color.b).toBeCloseTo(base.b * CUT_SHADE, 6);
    }
    expect(sources.size, "every primitive has a chunk mesh").toBe(0);
    // One cut material per original material.
    expect(new Set(cuts.map((c) => c.material)).size).toBe(2);
    // The chunks hold the body's triangles but the set-aside part's; each chunk's meshes together hold one chunk.
    const total = s.body.reduce((n, b) => n + (b.geometry.index?.count ?? 0), 0);
    const held = [...chunks, ...eatMeshes(s.root, "aside")]
      .filter((m) => s.body.some((b) => b.material === m.material && b.parent === m.parent))
      .reduce((n, m) => n + (m.geometry.index?.count ?? 0), 0);
    expect(held).toBe(total);
    expect(new Set(chunks.map((c) => (c.userData.eat as { chunk: number }).chunk))).toEqual(new Set([0, 1, 2]));
  });

  it("hides the original meshes, and the set-aside mesh of a hidden face stays hidden while a chunk shows (RB-1)", () => {
    const s = stub();
    const r = rig(s.part, { stub: s.root });
    r.eat.bite("stub");
    for (const b of s.body) expect(b.visible).toBe(false);
    const aside = eatMeshes(s.root, "aside");
    const fromLettering = aside.filter(
      (m) =>
        m.parent === s.lettering.parent &&
        m.geometry.getAttribute("position") === s.lettering.geometry.getAttribute("position"),
    );
    expect(fromLettering).toHaveLength(1);
    expect(shown(fromLettering[0] as Mesh, s.root)).toBe(false);
    const standing = eatMeshes(s.root, "chunk").filter(
      (m) => (m.userData.eat as { chunk: number }).chunk !== r.meal.states("stub").indexOf("flying"),
    );
    expect(standing.length).toBeGreaterThan(0);
    for (const m of standing) expect(shown(m, s.root)).toBe(true);
  });

  it("adds no texture: no cut material, chunk, or set-aside mesh carries a map (spec 004's FR-053)", () => {
    const s = stub();
    const r = rig(s.part, { stub: s.root });
    r.eat.bite("stub");
    const textures = new Set<unknown>();
    s.root.traverse((n) => {
      const m = (n as Partial<Mesh>).material as (Material & { map?: unknown }) | undefined;
      if (m?.map) textures.add(m.map);
    });
    expect(textures.size).toBe(0);
  });
});

describe("a bite's flight and the regrowth (FR-007, FR-008, FR-011; N-3)", () => {
  it("flies one chunk to the mouth in 600 ms and hides it; a later bite takes under 2 ms", () => {
    const s = stub();
    const r = rig(s.part, { stub: s.root });
    r.eat.bite("stub");
    const index = r.meal.states("stub").indexOf("flying");
    expect(index).toBeGreaterThanOrEqual(0);
    const flying = eatMeshes(s.root, "chunk").filter((m) => (m.userData.eat as { chunk: number }).chunk === index);
    const before = centreOf(flying);
    const mouth = new Vector3(3, 1, 0);
    r.clock.t += FLIGHT_MS / 2;
    r.eat.frame();
    const half = centreOf(flying);
    expect(half.distanceTo(mouth)).toBeLessThan(before.distanceTo(mouth));
    expect(r.meal.states("stub")[index]).toBe("flying");
    r.clock.t += FLIGHT_MS / 2;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("eaten");
    for (const m of flying) expect(shown(m, s.root)).toBe(false);
    expect(r.refresh).toHaveBeenCalledTimes(1);
    const t = performance.now();
    expect(r.eat.bite("stub")).toBe(true);
    expect(performance.now() - t).toBeLessThan(2);
  });

  it("regrows each eaten chunk over 400 ms, then gives back the piece's own meshes, each as it was, nothing disposed", () => {
    const s = stub();
    const r = rig(s.part, { stub: s.root });
    const disposed = vi.fn();
    s.root.traverse((n) => (n as Partial<Mesh>).geometry?.addEventListener("dispose", disposed));
    for (let k = 0; k < 3; k++) {
      expect(r.eat.bite("stub")).toBe(true);
      r.clock.t += FLIGHT_MS;
      r.eat.frame();
    }
    expect(r.meal.states("stub")).toEqual(["eaten", "eaten", "eaten"]);
    const refreshed = r.refresh.mock.calls.length;
    r.clock.t += 5000;
    r.eat.frame();
    expect(r.meal.states("stub").filter((x) => x === "regrowing")).toHaveLength(1);
    r.clock.t += GROW_MS;
    r.eat.frame();
    expect(r.refresh.mock.calls.length).toBe(refreshed + 1);
    for (let k = 0; k < 2; k++) {
      r.clock.t += 5000;
      r.eat.frame();
      r.clock.t += GROW_MS;
      r.eat.frame();
    }
    expect(r.meal.whole("stub")).toBe(true);
    for (const b of s.body) expect(b.visible).toBe(true);
    expect(s.lettering.visible).toBe(false);
    for (const kind of ["chunk", "cut", "aside"] as const) expect(eatMeshes(s.root, kind)).toHaveLength(0);
    expect(disposed).not.toHaveBeenCalled();
    // A new bite takes the memoized split again.
    expect(r.eat.bite("stub")).toBe(true);
    expect(eatMeshes(s.root, "chunk").length).toBeGreaterThanOrEqual(3);
  });

  it("disables the eating once on an exception, with one warning and the piece as loaded", () => {
    const clock = { t: 1000 };
    const refresh = vi.fn();
    const warn = vi.fn();
    // The figure throws as the bite reads the mouth, after the split.
    const t = stub();
    const broke = createEat3d({
      part: t.part,
      model: () => t.root,
      figure: () => {
        throw new Error("no figure");
      },
      meal: createMeal({ regrow_s: 5, now: () => clock.t }),
      highlight: { refresh },
      now: () => clock.t,
      warn,
    });
    expect(broke.bite("stub")).toBe(false);
    expect(broke.disabled()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toMatch(/no figure/);
    for (const b of t.body) expect(b.visible).toBe(true);
    expect(t.lettering.visible).toBe(false);
    for (const kind of ["chunk", "cut", "aside"] as const) expect(eatMeshes(t.root, kind)).toHaveLength(0);
    expect(broke.bite("stub")).toBe(false);
    broke.frame();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("the four real pieces' draw calls (FR-015)", () => {
  const PIECES = [
    [SIGN, 3],
    [CHALKBOARD, 10],
    [LAPTOP, 13],
    [DESK, 16],
  ] as const;

  it("draw their own meshes whole, at most 100 each split, and at most 240 more with all four split", () => {
    const scene = repositoryBundle().scene;
    const models: Record<string, Group> = {};
    for (const [id] of PIECES) models[id] = pieceModel(roomGlb(id), scene.pieces[id]?.scale ?? 1);
    let whole = 0;
    for (const [id, count] of PIECES) {
      expect(drawn(models[id] as Group), `${id} whole`).toBe(count);
      whole += count;
    }
    const r = rig(scene, models);
    let split = 0;
    for (const [id] of PIECES) {
      expect(r.eat.bite(id), id).toBe(true);
      r.clock.t += FLIGHT_MS;
      r.eat.frame();
      const n = drawn(models[id] as Group);
      console.info(`${id}: ${n} meshes split`);
      expect(n, `${id} split`).toBeLessThanOrEqual(100);
      split += n;
    }
    console.info(`all four: ${split} split, ${whole} whole, ${split - whole} more`);
    expect(split - whole).toBeLessThanOrEqual(240);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// T009 (US2 AS1, AS2, AS4; SC-002): every chunk eaten, what the room holds up still stands.
// --------------------------------------------------------------------------------------------------------------------
describe("every chunk of the four pieces eaten (US2; SC-002)", () => {
  const PIECES = [DESK, SIGN, LAPTOP, CHALKBOARD] as const;
  const scene = repositoryBundle().scene;
  const before = JSON.stringify({ placements: scene.placements, selectables: repositoryBundle().index.selectables });
  const models: Record<string, Group> = {};
  for (const id of PIECES) {
    const root = pieceModel(roomGlb(id), scene.pieces[id]?.scale ?? 1);
    // As prepareModel hides them: each node named for a live face's role.
    const roles = new Set(Object.keys(scene.pieces[id]?.faces ?? {}));
    root.traverse((n) => {
      if (roles.has(n.name)) n.visible = false;
    });
    models[id] = root;
  }
  const r = rig(scene, models, 120);
  for (const id of PIECES) {
    for (let k = 0; k < 20 && r.eat.bite(id); k++) {
      r.clock.t += FLIGHT_MS;
      r.eat.frame();
    }
  }

  /** The standing meshes of a piece as the chunker's primitives, in its frame at scale 1 (identity transforms below the
   *  root, as pieceModel builds it). */
  const standing = (id: (typeof PIECES)[number]): Primitive[] => {
    const root = models[id] as Group;
    const scale = scene.pieces[id]?.scale ?? 1;
    const out: Primitive[] = [];
    root.traverse((n) => {
      const mesh = n as Mesh;
      if (!mesh.isMesh || !shown(mesh, root)) return;
      const positions = (mesh.geometry.getAttribute("position").array as Float32Array).map((v) => v / scale);
      const index = mesh.geometry.index ? Uint32Array.from(mesh.geometry.index.array) : null;
      out.push({ mesh: meshNameOf(mesh.name.includes(":eat-") ? (mesh.parent as Object3D) : mesh), positions, index });
    });
    return out;
  };

  it.each(PIECES)("%s: every chunk eaten, only its set-aside part standing, unmoved", (id) => {
    expect(r.meal.states(id).length).toBeGreaterThan(0);
    expect(r.meal.states(id).every((s) => s === "eaten")).toBe(true);
    const root = models[id] as Group;
    for (const m of eatMeshes(root, "chunk")) expect(shown(m, root)).toBe(false);
    const aside = eatMeshes(root, "aside");
    expect(aside.some((m) => shown(m, root))).toBe(true);
    for (const m of aside) {
      expect(m.position.toArray()).toEqual([0, 0, 0]);
      expect(m.scale.toArray()).toEqual([1, 1, 1]);
    }
  });

  it("leaves the placements and the selectables as they were: selectable, labelled, the same pick areas and frame boxes", () => {
    expect(JSON.stringify({ placements: scene.placements, selectables: repositoryBundle().index.selectables })).toBe(
      before,
    );
  });

  it.each([
    // The sign's stand is a mesh the model names after the piece: `<piece>-stand`.
    [SIGN, "lettering", `${SIGN}-stand`],
    [CHALKBOARD, "slate", "frame"],
    [LAPTOP, "screen", "lid"],
  ] as const)(
    "%s: its face's mesh %s still hidden as the loader left it, and %s holding it standing",
    (id, role, holder) => {
      const root = models[id] as Group;
      root.traverse((n) => {
        if (n.name === role) expect(n.visible).toBe(false);
      });
      for (const m of eatMeshes(root, "aside"))
        if (meshNameOf(m.parent as Object3D) === role || m.parent?.name === role) expect(shown(m, root)).toBe(false);
      const face = facesOf(scene.pieces[id] as RoomScene["pieces"][string]).find((f) => f.role === role) as Face;
      const hit = firstHit(standing(id), face.at, [-face.facing[0], -face.facing[1], -face.facing[2]]);
      expect(hit, `nothing standing behind the ${role}, where the ${holder} holds it`).not.toBeNull();
    },
  );

  it(`${LAPTOP}: the screen glow's point in front of the standing lid, and the charge light's within its radius of a standing triangle`, () => {
    const glows = glowsOf(scene.pieces[LAPTOP] as RoomScene["pieces"][string]);
    const screen = glows.find((g) => g.id === "screen-glow") as GlowPoint;
    const face = facesOf(scene.pieces[LAPTOP] as RoomScene["pieces"][string]).find((f) => f.role === "screen") as Face;
    const behind = firstHit(standing(LAPTOP), screen.at, [-face.facing[0], -face.facing[1], -face.facing[2]]);
    expect(behind && standing(LAPTOP)[behind.p]?.mesh).toBe("lid");
    const light = glows.find((g) => g.id === "charge-light") as GlowPoint;
    const prims = standing(LAPTOP);
    const near = prims.some((p) => {
      for (let t = 0; t < triangles(p); t++) if (triangleDistance(light.at, corners(p, t)) <= light.radius) return true;
      return false;
    });
    expect(near).toBe(true);
  });

  it(`${LAPTOP}: the ${CHARGER}'s plugged pose keeps its port whether the plug is in or out (spec 004's ${POWER?.id ?? ""})`, () => {
    // The keep-outs take every pose mounted on the piece, whichever the switch shows, so the port stands in both.
    const boxes = keepOutBoxes(scene, LAPTOP);
    expect(boxes).toHaveLength(1);
    const port = scene.pieces[LAPTOP]?.anchors.port?.at as V3;
    const hit = firstHit(standing(LAPTOP), [port[0] + 0.05, port[1], port[2]], [-1, 0, 0]);
    expect(hit && standing(LAPTOP)[hit.p]?.mesh).toBe("base");
  });

  it(`${DESK}: no placement or switch pose mounted on it loses the top under it`, () => {
    const boxes = keepOutBoxes(scene, DESK);
    expect(boxes).toHaveLength(9);
    const prims = standing(DESK);
    for (const box of boxes) {
      const centre: V3 = [(box.min[0] + box.max[0]) / 2, 2, (box.min[2] + box.max[2]) / 2];
      expect(firstHit(prims, centre, [0, -1, 0]), `the top under ${JSON.stringify(box)}`).not.toBeNull();
    }
  });
});

// rv-rework3-spec-024's last nit: a primitive is a face's when its node or an ancestor up to the model's root is named
// for the face's role, as scene/loader.ts's prepareModel hides it (`roles.has(node.name)`, on every node), not only by
// the glTF mesh's own name.
describe("a face's mesh matched by the node's name, as prepareModel hides it", () => {
  it("sets aside, wholly and hidden, a mesh under a node named for the face's role, however deep", () => {
    const s = stub();
    const holder = new Group();
    holder.name = "lettering";
    holder.visible = false;
    const inner = new Group();
    inner.name = "inner";
    const plate = new Mesh(sheet(3, 2, 0.05, 0.05, 0.3), s.materials[1] as Material);
    plate.name = "plate";
    inner.add(plate);
    holder.add(inner);
    s.root.remove(s.lettering);
    s.root.add(holder);
    s.root.updateMatrixWorld(true);
    const r = rig(s.part, { stub: s.root });
    expect(r.eat.bite("stub")).toBe(true);
    const position = plate.geometry.getAttribute("position");
    const fromPlate = (kind: EatKind) =>
      eatMeshes(s.root, kind).filter((m) => m.geometry.getAttribute("position") === position);
    expect(fromPlate("chunk")).toEqual([]);
    expect(fromPlate("aside")).toHaveLength(1);
    expect(fromPlate("aside")[0]?.geometry.index?.count).toBe(plate.geometry.index?.count);
    expect(shown(fromPlate("aside")[0] as Mesh, s.root)).toBe(false);
  });
});
