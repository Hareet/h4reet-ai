// Spec 024 (FR-003, FR-004, FR-006 to FR-008, FR-010, FR-015; RB-1, N-3; plan.md §5.4): the eating's 3D side, in the
// lazy 3D chunk. At a piece's first bite it reads the model's meshes, builds the keep-outs (keepouts.ts), and asks the
// chunker (chunker.ts) for the set-aside part and the chunks; then it builds, beside each source mesh (same parent, same
// transform, so every ancestor's visibility still holds, as prepareModel's hidden face nodes need):
//   - per chunk and primitive, a mesh over the primitive's own attributes, indexed by the chunk's triangles, sharing its
//     material, and a cut-face mesh over the same geometry with the material's cut material (CUT_SHADE × its base
//     colour, BackSide, no texture: the back faces of the open chunk show it);
//   - per primitive with set-aside triangles, one fixed mesh of them.
// Each takes its source's own `visible`; the sources are recorded and hidden. A bite flies a chunk's meshes to the mouth
// (mouth.ts) over FLIGHT_MS and hides them; a regrowth scales them back about the chunk's centre over GROW_MS; reduced
// motion does both at once. When the last eaten chunk is back, the sources take their recorded flags and the eating's
// meshes leave the scene, memoized for the next bite; the stage's dispose calls dispose(), which frees every geometry and
// cut material the eating built, in the scene or not (the room's disposeRoom reaches only the scene's graph), and a split
// dropped for a reloaded model is freed at once (rework-024, nit 3). highlight.refresh() follows each end.
// An exception anywhere disables the eating for the visit: one warning without payload, every piece as loaded.
import { BackSide, BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { Material, Object3D } from "three";

import type { RoomScene } from "../compose/bundle";
import { facesOf, glowsOf, matchedNameOf, setAside, split } from "./chunker";
import type { ChunkInput, Primitive } from "./chunker";
import { keepOutBoxes } from "./keepouts";
import type { Meal, Point } from "./meal";
import { mouthWorldPoint } from "./mouth";

export const FLIGHT_MS = 600;
export const GROW_MS = 400;
/** The cut faces' colour: the material's base colour times this (FR-006). */
export const CUT_SHADE = 0.7;

export type EatKind = "chunk" | "cut" | "aside";

export interface Eat3dOptions {
  readonly part: Pick<RoomScene, "pieces" | "placements" | "switches">;
  /** The model a placement shows now, or null on its stand-in. */
  readonly model: (placement: string) => Object3D | null;
  /** The dinosaur's figure: its root and its height, or null. */
  readonly figure: () => { readonly root: Object3D; readonly height: number } | null;
  readonly meal: Meal;
  readonly highlight: { refresh(): void };
  /** The room's clock, in milliseconds: the meal's own. The motions run on it less the meal's paused time
   *  (`meal.pausedMs()`), so they stop while the meal is paused, whatever this clock does then (FR-009). */
  readonly now: () => number;
  readonly reduced?: () => boolean;
  /** FR-010: a piece's first bite of the visit, for the polite line. */
  readonly said?: (placement: string) => void;
  readonly warn?: (message: string) => void;
}

export interface Eat3d {
  /** Starts a bite on an edible placement: true where a chunk flies. */
  bite(placement: string): boolean;
  /** Each frame: the flights, the regrowths, the meal's tick. */
  frame(): void;
  /** The visitor left walking (Escape, the walking control, a failed step): every flight lands at once, as the spec's
   *  edge case says; while the meal is paused, at the resume's first frame, since nothing lands while paused (FR-009). */
  settle(): void;
  /** The stage's dispose: frees every geometry and cut material the eating built, attached or not. */
  dispose(): void;
  disabled(): boolean;
}

interface Part {
  readonly mesh: Mesh;
  readonly parent: Object3D;
  readonly visible: boolean;
  /** Its source's own transform. */
  readonly position: Vector3;
  readonly scale: Vector3;
}

interface Split {
  readonly root: Object3D;
  /** Each source mesh and its recorded own visibility. */
  readonly sources: readonly { readonly mesh: Mesh; readonly visible: boolean }[];
  /** Per chunk, its meshes (each chunk mesh and its cut mesh). */
  readonly chunks: readonly (readonly Part[])[];
  /** Per chunk, its centre in the world. */
  readonly centres: readonly Vector3[];
  readonly aside: readonly Part[];
  attached: boolean;
}

interface Motion {
  readonly placement: string;
  readonly index: number;
  /** Its start on the eating's time; -Infinity for a flight a leave cut short (settle), due at the next frame. */
  start: number;
  readonly kind: "flight" | "growth";
  /** A flight's chunk centre in the world at its start. */
  readonly from: Vector3;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function createEat3d(options: Eat3dOptions): Eat3d {
  const { part, meal } = options;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const reduced = options.reduced ?? (() => false);
  const splits = new Map<string, Split>();
  const cutMaterials = new Map<Material, MeshBasicMaterial>();
  const motions: Motion[] = [];
  let off = false;
  /** The eating's time: the room's clock less the meal's paused time, so it stops while paused (FR-009). */
  const time = (): number => options.now() - meal.pausedMs();

  const cutOf = (material: Material): MeshBasicMaterial => {
    let cut = cutMaterials.get(material);
    if (!cut) {
      const base = (material as Material & { color?: Color }).color;
      cut = new MeshBasicMaterial({
        color: (base ? base.clone() : new Color(0.5, 0.5, 0.5)).multiplyScalar(CUT_SHADE),
        side: BackSide,
      });
      cut.name = `${material.name}:cut`;
      cutMaterials.set(material, cut);
    }
    return cut;
  };

  /** A mesh over `source`'s attributes, indexed by its triangles `tris`, beside it. */
  const build = (
    source: Mesh,
    tris: readonly number[],
    kind: EatKind,
    chunk: number,
    material: Material | Material[],
  ): Mesh => {
    let geometry: BufferGeometry;
    if (kind === "cut") geometry = source.geometry;
    else {
      geometry = new BufferGeometry();
      for (const [name, attribute] of Object.entries(source.geometry.attributes))
        geometry.setAttribute(name, attribute);
      const index = source.geometry.index;
      const out = new Uint32Array(tris.length * 3);
      tris.forEach((t, k) => {
        for (let c = 0; c < 3; c++) out[3 * k + c] = index ? index.getX(3 * t + c) : 3 * t + c;
      });
      geometry.setIndex(new BufferAttribute(out, 1));
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = `${source.name}:eat-${kind}${kind === "aside" ? "" : `-${chunk}`}`;
    mesh.userData.eat = { kind, chunk };
    mesh.position.copy(source.position);
    mesh.quaternion.copy(source.quaternion);
    mesh.scale.copy(source.scale);
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.renderOrder = source.renderOrder;
    return mesh;
  };

  const partOf = (mesh: Mesh, source: Mesh): Part => ({
    mesh,
    parent: source.parent as Object3D,
    visible: source.visible,
    position: source.position.clone(),
    scale: source.scale.clone(),
  });

  /** The first bite's split of a placement's model. */
  const splitOf = (id: string, root: Object3D): Split => {
    const placement = part.placements.find((p) => p.id === id);
    const piece = placement && Object.hasOwn(part.pieces, placement.piece) ? part.pieces[placement.piece] : undefined;
    if (!placement?.edible || !piece) throw new Error("not an edible placement");
    root.updateMatrixWorld(true);
    const toRoot = new Matrix4().copy(root.matrixWorld).invert();
    const sources: Mesh[] = [];
    root.traverse((node) => {
      if ((node as Partial<Mesh>).isMesh && node.userData.eat === undefined) sources.push(node as Mesh);
    });
    // The names (a) and (d) match: a face's role or a glow's ID, on the mesh or a node above it (matchedNameOf).
    const named = new Set([...Object.keys(piece.faces), ...glowsOf(piece).map((g) => g.id)]);
    // Each primitive in the piece's frame at scale 1: through the mesh's transform to the model's root, then 1 / scale.
    const primitives: Primitive[] = sources.map((mesh) => {
      const m = new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
      const attribute = mesh.geometry.getAttribute("position");
      const positions = new Float32Array(attribute.count * 3);
      const v = new Vector3();
      for (let i = 0; i < attribute.count; i++) {
        v.fromBufferAttribute(attribute, i).applyMatrix4(m).divideScalar(piece.scale);
        positions[3 * i] = v.x;
        positions[3 * i + 1] = v.y;
        positions[3 * i + 2] = v.z;
      }
      const index = mesh.geometry.index;
      return {
        mesh: matchedNameOf(mesh, named, root),
        positions,
        index: index ? (index.array instanceof Uint16Array ? index.array : Uint32Array.from(index.array)) : null,
      };
    });
    const input: ChunkInput = {
      primitives,
      faces: facesOf(piece),
      glows: glowsOf(piece),
      keepOuts: keepOutBoxes(part, id),
      n: placement.edible.chunks,
      seed: id,
    };
    const { mask } = setAside(input);
    const { chunks } = split(input, mask);

    const aside: Part[] = [];
    sources.forEach((source, k) => {
      const tris = [...(mask[k] ?? [])].flatMap((v, t) => (v ? [t] : []));
      if (tris.length > 0) aside.push(partOf(build(source, tris, "aside", -1, source.material), source));
    });
    const toWorld = new Matrix4()
      .copy(root.matrixWorld)
      .multiply(new Matrix4().makeScale(piece.scale, piece.scale, piece.scale));
    const centres: Vector3[] = [];
    const chunkParts = chunks.map((perPrimitive, c) => {
      const out: Part[] = [];
      const centre = new Vector3();
      let n = 0;
      perPrimitive.forEach((tris, k) => {
        const source = sources[k] as Mesh;
        if (tris.length === 0) return;
        const prim = primitives[k] as Primitive;
        for (const t of tris)
          for (let q = 0; q < 3; q++) {
            const i = prim.index ? (prim.index[3 * t + q] ?? 0) : 3 * t + q;
            centre.x += prim.positions[3 * i] ?? 0;
            centre.y += prim.positions[3 * i + 1] ?? 0;
            centre.z += prim.positions[3 * i + 2] ?? 0;
            n++;
          }
        const mesh = build(source, tris, "chunk", c, source.material);
        const material = Array.isArray(source.material) ? source.material.map(cutOf) : cutOf(source.material);
        const cut = build(source, tris, "cut", c, material);
        cut.geometry = mesh.geometry;
        out.push(partOf(mesh, source), partOf(cut, source));
      });
      centres.push(centre.divideScalar(Math.max(n, 1)).applyMatrix4(toWorld));
      return out;
    });
    const asideEmpty = mask.every((m) => m.every((v) => v === 0));
    meal.addPiece(id, { centres: centres.map((c): Point => [c.x, c.y, c.z]), asideEmpty });
    return {
      root,
      sources: sources.map((mesh) => ({ mesh, visible: mesh.visible })),
      chunks: chunkParts,
      centres,
      aside,
      attached: false,
    };
  };

  const attach = (s: Split): void => {
    if (s.attached) return;
    for (const p of [...s.aside, ...s.chunks.flat()]) {
      p.mesh.position.copy(p.position);
      p.mesh.scale.copy(p.scale);
      p.mesh.visible = p.visible;
      p.parent.add(p.mesh);
    }
    for (const { mesh } of s.sources) mesh.visible = false;
    s.attached = true;
  };

  const detach = (s: Split): void => {
    for (const p of [...s.aside, ...s.chunks.flat()]) p.mesh.removeFromParent();
    for (const { mesh, visible } of s.sources) mesh.visible = visible;
    s.attached = false;
  };

  /** Frees a split's own geometries (a cut mesh shares its chunk mesh's; the attributes are its source's and stay). */
  const free = (s: Split): void => {
    for (const g of new Set([...s.aside, ...s.chunks.flat()].map((p) => p.mesh.geometry))) g.dispose();
  };

  const disable = (): void => {
    if (off) return;
    off = true;
    motions.length = 0;
    for (const s of splits.values())
      try {
        detach(s);
      } catch {
        // Keep restoring the others.
      }
    warn("room: the dinosaur's eating is off for this visit");
  };

  const guarded = <T>(fallback: T, run: () => T): T => {
    if (off) return fallback;
    try {
      return run();
    } catch {
      disable();
      return fallback;
    }
  };

  /** A chunk's meshes moved by `delta` in the world from their rest, scaled `scale` about the chunk's centre. */
  const place = (s: Split, index: number, delta: Vector3, scale: number): void => {
    const centre = s.centres[index] as Vector3;
    for (const p of s.chunks[index] ?? []) {
      p.parent.updateMatrixWorld(true);
      const local = p.parent.worldToLocal(centre.clone());
      const moved = p.parent.worldToLocal(centre.clone().add(delta));
      // Scaled about the centre: rest + (1 − s)(centre − rest), then the move.
      p.mesh.position
        .copy(p.position)
        .addScaledVector(local.clone().sub(p.position), 1 - scale)
        .add(moved.sub(local));
      p.mesh.scale.copy(p.scale).multiplyScalar(scale);
    }
  };

  const showChunk = (s: Split, index: number, on: boolean): void => {
    for (const p of s.chunks[index] ?? []) p.mesh.visible = on && p.visible;
  };

  const mouth = (): Vector3 | null => {
    const figure = options.figure();
    return figure ? mouthWorldPoint(figure.root, figure.height) : null;
  };

  const land = (m: Motion): void => {
    const s = splits.get(m.placement);
    if (!s) return;
    showChunk(s, m.index, false);
    place(s, m.index, new Vector3(), 1);
    meal.landed(m.placement, m.index);
    options.highlight.refresh();
  };

  const grow = (m: Motion): void => {
    const s = splits.get(m.placement);
    if (!s) return;
    place(s, m.index, new Vector3(), 1);
    meal.grown(m.placement, m.index);
    if (meal.whole(m.placement)) detach(s);
    options.highlight.refresh();
  };

  return {
    bite(id) {
      return guarded(false, () => {
        // Paused, a press neither splits nor starts anything (FR-009, US3 AS5).
        if (meal.paused()) return false;
        const root = options.model(id);
        if (!root) return false;
        let s = splits.get(id);
        if (s && s.root !== root) {
          // The model was loaded again (a lost context's reload): its split goes with the old one, freed.
          detach(s);
          free(s);
          splits.delete(id);
          s = undefined;
        }
        if (!s) {
          s = splitOf(id, root);
          splits.set(id, s);
        }
        const at = mouth();
        if (!at) return false;
        attach(s);
        const index = meal.bite(id, [at.x, at.y, at.z]);
        if (index === null) {
          if (meal.whole(id)) detach(s);
          return false;
        }
        if (meal.firstBite(id)) options.said?.(id);
        const motion: Motion = {
          placement: id,
          index,
          start: time(),
          kind: "flight",
          from: (s.centres[index] as Vector3).clone(),
        };
        if (reduced()) land(motion);
        else motions.push(motion);
        return true;
      });
    },
    frame() {
      guarded(undefined, () => {
        // Paused, nothing moves, lands, grows, or comes due: each motion takes up where it was at the resume (FR-009).
        if (meal.paused()) return;
        const now = time();
        for (const m of [...motions]) {
          const s = splits.get(m.placement);
          if (!s) continue;
          const k = Math.min(1, (now - m.start) / (m.kind === "flight" ? FLIGHT_MS : GROW_MS));
          if (k >= 1) {
            motions.splice(motions.indexOf(m), 1);
            if (m.kind === "flight") land(m);
            else grow(m);
            continue;
          }
          if (m.kind === "flight") {
            const at = mouth();
            if (!at) {
              motions.splice(motions.indexOf(m), 1);
              land(m);
              continue;
            }
            place(s, m.index, at.sub(m.from).multiplyScalar(ease(k)), 1);
          } else place(s, m.index, new Vector3(), Math.max(1e-3, ease(k)));
        }
        for (const r of meal.tick()) {
          const s = splits.get(r.piece);
          if (!s) continue;
          const motion: Motion = {
            placement: r.piece,
            index: r.index,
            start: now,
            kind: "growth",
            from: new Vector3(),
          };
          showChunk(s, r.index, true);
          if (reduced()) grow(motion);
          else {
            place(s, r.index, new Vector3(), 1e-3);
            motions.push(motion);
          }
        }
      });
    },
    settle() {
      guarded(undefined, () => {
        for (const m of [...motions]) {
          if (m.kind !== "flight") continue;
          if (meal.paused()) m.start = -Infinity;
          else {
            motions.splice(motions.indexOf(m), 1);
            land(m);
          }
        }
      });
    },
    dispose() {
      motions.length = 0;
      for (const s of splits.values())
        try {
          free(s);
        } catch {
          // Keep freeing the others.
        }
      splits.clear();
      for (const cut of cutMaterials.values()) cut.dispose();
      cutMaterials.clear();
    },
    disabled: () => off,
  };
}
