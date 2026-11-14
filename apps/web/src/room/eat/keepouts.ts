// Spec 024 (FR-004 (c); plan.md §5.2's keep-out boxes, NB-2): the boxes the chunker keeps standing on a piece, one for
// each placement and each switch pose mounted on it, in the piece's own frame at scale 1. Pure, from the 3D bundle, so
// the 3D side (eat3d.ts) and the tests build the same boxes. A mounted piece's box is its set model's measured bounds
// (the studio models it at its stylized scale, so they stand as they are), or its stand-in's shapes (compose/shape-box.ts)
// at its stylized scale, through the mount (compose/mount.ts's World(child) relative to World(piece)):
//   T(s_on · anchor.at) · R(anchor.turn) · T(offset) · R(turn)
// then into the piece's frame at scale 1, S(1 / s_on). The chunker grows each by MOUNT_MARGIN.
import type { RoomScene } from "../compose/bundle";
import type { Box } from "../compose/framing";
import { IDENTITY, multiply, scaling, transformPoint } from "../compose/math";
import type { Mat4, Turn, Vec3 } from "../compose/math";
import { mountWorld } from "../compose/mount";
import { shapeBox } from "../compose/shape-box";

type Part = Pick<RoomScene, "pieces" | "placements" | "switches">;

/** The axis-aligned box of a box's eight corners through m. */
function through(m: Mat4, b: Box): Box {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) {
        const p = transformPoint(m, [x, y, z]);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k] as number, p[k] as number);
          hi[k] = Math.max(hi[k] as number, p[k] as number);
        }
      }
  return { min: lo as unknown as Vec3, max: hi as unknown as Vec3 };
}

/** A mounted piece's own box, in the frame its mount places (World, without its scale), or null with nothing to measure. */
function ownBox(part: Part, piece: string, model: { readonly bounds: Box } | null): Box | null {
  if (model) return model.bounds;
  const entry = Object.hasOwn(part.pieces, piece) ? part.pieces[piece] : undefined;
  if (!entry || entry.standin.length === 0) return null;
  const boxes = entry.standin.map((s) => through(scaling(entry.scale), shapeBox(s)));
  return {
    min: [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.min[k] as number))) as unknown as Vec3,
    max: [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k] as number))) as unknown as Vec3,
  };
}

/** The keep-out boxes on placement `on` (its ID, which is its piece's in the room's scene), unmargined. */
export function keepOutBoxes(part: Part, on: string): Box[] {
  const host = part.placements.find((p) => p.id === on);
  const hostPiece = host && Object.hasOwn(part.pieces, host.piece) ? part.pieces[host.piece] : undefined;
  if (!host || !hostPiece) return [];
  const toPiece = scaling(1 / hostPiece.scale);
  const mounted: { anchor: string; offset: Vec3; turn: Turn; piece: string; model: { readonly bounds: Box } | null }[] = [];
  for (const p of part.placements)
    if (p.mount?.on === on) mounted.push({ anchor: p.mount.anchor, offset: p.offset, turn: p.turn, piece: p.piece, model: p.model });
  for (const sw of part.switches)
    for (const pose of Object.values(sw.poses))
      if (pose.mount.on === on)
        mounted.push({ anchor: pose.mount.anchor, offset: pose.mount.offset, turn: pose.mount.turn, piece: sw.piece, model: sw.model });
  return mounted.flatMap((m): Box[] => {
    const anchor = Object.hasOwn(hostPiece.anchors, m.anchor) ? hostPiece.anchors[m.anchor] : undefined;
    const own = ownBox(part, m.piece, m.model);
    if (!anchor || !own) return [];
    const world = mountWorld(IDENTITY, hostPiece.scale, anchor, m.offset, m.turn);
    return [through(multiply(toPiece, world), own)];
  });
}
