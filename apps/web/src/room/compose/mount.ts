// The world resolver (spec 004; FR-003, FR-040, FR-051; R-17; data-model.md §4.2; contracts/room-data-files.md §2):
// one function for the compositor's checks, the room's object tree, and the lookdev page, so they compute the same
// numbers. Each placement mounts on a named anchor of another, with an offset and a turn in the anchor's frame:
//   World(shell) = I
//   World(p)     = World(on) · T(s_on · anchor.at) · R(anchor.turn) · T(offset) · R(turn)
//   Model(p)     = World(p) · S(s_p)
// where s_on is the parent's piece's stylized scale and s_p the placement's own. An anchor moves with its piece's
// scale, but a child never takes it: an enlarged monitor carries the neon sign on its scaled top edge without
// enlarging it. So a parent's move carries everything mounted on it (FR-003). The resolver never throws on data: a
// cycle (RG1), or a missing parent, anchor, or piece (RI4), leaves those placements unresolved for the rules to report.
import { IDENTITY, multiply, rotation, scaling, translation } from "./math";
import type { Mat4, Turn, Vec3 } from "./math";

export interface MountAnchor {
  /** In the piece's frame, at scale 1. */
  readonly at: Vec3;
  readonly turn: Turn;
}

export interface MountPiece {
  /** The stylized scale, 1 to 4 (FR-051). */
  readonly scale: number;
  readonly anchors: Readonly<Record<string, MountAnchor>>;
}

/** A placement as the 3D part keeps it (contracts/room-bundle.md §3.2): authored, not resolved. */
export interface MountPlacement {
  readonly id: string;
  readonly piece: string;
  /** Null only for the shell, the root (FR-003). */
  readonly mount: { readonly on: string; readonly anchor: string } | null;
  readonly offset: Vec3;
  readonly turn: Turn;
}

export interface Unresolved {
  readonly id: string;
  /** In a cycle of mounts (RG1); under a parent that's missing or unresolved; on an anchor or of a piece that's missing (RI4). */
  readonly reason: "cycle" | "parent" | "anchor" | "piece";
}

export interface Resolved {
  /** Each resolved placement's world transform, without its own scale. */
  readonly world: ReadonlyMap<string, Mat4>;
  /** Each resolved placement's model transform, World · S(its own stylized scale). */
  readonly model: ReadonlyMap<string, Mat4>;
  /** The placements left unresolved, in the data's order. */
  readonly unresolved: readonly Unresolved[];
}

/** An anchor's frame in the world, for a piece placed at `world` with its stylized scale: World · T(s · at) · R(turn). */
export function anchorWorld(world: Mat4, scale: number, anchor: MountAnchor): Mat4 {
  const [x, y, z] = anchor.at;
  return multiply(multiply(world, translation([scale * x, scale * y, scale * z])), rotation(anchor.turn));
}

/** World(p) for a mount: the parent's world and scale, the anchor, and the placement's own offset and turn. */
export function mountWorld(
  parentWorld: Mat4,
  parentScale: number,
  anchor: MountAnchor,
  offset: Vec3,
  turn: Turn,
): Mat4 {
  return multiply(multiply(anchorWorld(parentWorld, parentScale, anchor), translation(offset)), rotation(turn));
}

/** Model(p) = World(p) · S(s_p): what scales a piece's own geometry, anchors, faces, and glows. */
export function modelOf(world: Mat4, scale: number): Mat4 {
  return multiply(world, scaling(scale));
}

/** Resolves every placement it can, parents before children, whatever the data's order. */
export function resolveMounts(
  placements: readonly MountPlacement[],
  pieces: Readonly<Record<string, MountPiece>>,
): Resolved {
  // A repeated ID is RI2's to report; the first placement with it is the one resolved.
  const byId = new Map<string, MountPlacement>();
  for (const p of placements) if (!byId.has(p.id)) byId.set(p.id, p);
  const piece = (id: string): MountPiece | undefined => (Object.hasOwn(pieces, id) ? pieces[id] : undefined);
  const world = new Map<string, Mat4>();
  const model = new Map<string, Mat4>();
  const failed = new Map<string, Unresolved["reason"]>();

  const settle = (q: MountPlacement): void => {
    if (world.has(q.id) || failed.has(q.id)) return;
    const own = piece(q.piece);
    if (q.mount === null) {
      if (!own) failed.set(q.id, "piece");
      else {
        world.set(q.id, IDENTITY);
        model.set(q.id, modelOf(IDENTITY, own.scale));
      }
      return;
    }
    const parent = byId.get(q.mount.on);
    const parentWorld = parent ? world.get(parent.id) : undefined;
    const parentPiece = parent ? piece(parent.piece) : undefined;
    if (!parent || !parentWorld || !parentPiece) {
      failed.set(q.id, "parent");
      return;
    }
    const anchor = Object.hasOwn(parentPiece.anchors, q.mount.anchor) ? parentPiece.anchors[q.mount.anchor] : undefined;
    if (!anchor) failed.set(q.id, "anchor");
    else if (!own) failed.set(q.id, "piece");
    else {
      const w = mountWorld(parentWorld, parentPiece.scale, anchor, q.offset, q.turn);
      world.set(q.id, w);
      model.set(q.id, modelOf(w, own.scale));
    }
  };

  for (const start of byId.values()) {
    // Walk up from this placement until a settled one, the root, a missing parent, or a placement already on the walk.
    const chain: MountPlacement[] = [];
    const onChain = new Map<string, number>();
    let current: MountPlacement | undefined = start;
    while (current && !world.has(current.id) && !failed.has(current.id)) {
      const seen = onChain.get(current.id);
      if (seen !== undefined) {
        // A cycle: every placement on it is unresolvable; those below it fail as their parents do.
        for (const q of chain.slice(seen)) failed.set(q.id, "cycle");
        break;
      }
      onChain.set(current.id, chain.length);
      chain.push(current);
      current = current.mount === null ? undefined : byId.get(current.mount.on);
    }
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const q = chain[i];
      if (q) settle(q);
    }
  }

  const unresolved: Unresolved[] = [];
  for (const p of byId.values()) {
    const reason = failed.get(p.id);
    if (reason) unresolved.push({ id: p.id, reason });
  }
  return { world, model, unresolved };
}
