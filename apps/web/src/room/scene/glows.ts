// The glow cards (spec 004; FR-017, FR-022, FR-059; R-27, R-35): each glow a piece's catalog entry declares, drawn as a
// flat card at its point under its placement's node, at the piece's stylized scale, in its tone's colour from the look,
// added over what's behind it. Its strength is its tone's intensity times its level now, which the shown switch pose
// sets while its case shows (such as the laptop's charge light) and its piece's own level otherwise (scene/cables.ts's
// `glow`). Its motion is the catalog's: `breathe` swells slowly, `flicker` wavers, `steady` holds; while the room
// doesn't animate (reduced motion, paused, or hidden), every card holds still at its full strength (FR-059, FR-060).
// Quality 2 and 3 draw no glow cards (R-35). Nothing here is a lit material: the room adds the light (FR-022).
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import type { Object3D } from "three";

import type { RoomScene } from "../compose/bundle";
import type { Vec3 } from "../compose/math";
import type { GlowMotion } from "../compose/vocabulary";
import type { MotionView } from "../stage";

/** A card's opacity per unit of its tone's intensity at level 1. */
const STRENGTH = 0.35;
/** A card's segments round its edge. */
const SEGMENTS = 24;

export interface GlowCards {
  /** Each card, by `<placement>.<glow>`, named `glow:<placement>.<glow>`. */
  readonly cards: ReadonlyMap<string, Mesh>;
  /** A frame of the room at `now`: each card's level and motion. */
  frame(now: number): void;
  /** Whether the quality level draws glow cards. */
  setEnabled(on: boolean): void;
  dispose(): void;
}

/** A glow's share of its strength at a time: 1 while the room is still, and for `steady`. */
export function glowFactor(motion: GlowMotion, now: number, animate: boolean): number {
  if (!animate) return 1;
  switch (motion) {
    case "breathe":
      return 0.8 + 0.2 * Math.sin((2 * Math.PI * now) / 4000);
    case "flicker":
      return 0.85 + 0.15 * Math.sin(now / 47) * Math.sin(now / 131 + 1);
    default:
      return 1;
  }
}

/** How far a path glow's ribbon stands toward the viewer from its path, in metres at scale 1 (spec 014, plan.md §7). */
export const RIBBON_LIFT = 0.001;

/**
 * A path glow's ribbon (spec 014; FR-044, FR-045, FR-047, FR-049; plan.md §7, PD-14; R-8), in its piece's frame at scale
 * 1, lying in the plane through the path facing +Z, RIBBON_LIFT toward the viewer: each segment a strip of the path and
 * its two edges at `spread`, the alpha 1 on the path and 0 at the edges, by a four-component vertex colour; each joint
 * bevelled, a triangle from the corner to the two segments' edge points on each side, so no vertex lies farther than
 * the spread from the path. Null for a path that can't be built: fewer than two distinct points, or a spread not above
 * 0 (FR-006).
 */
export function ribbonGeometry(path: readonly Vec3[], spread: number, color: Color): BufferGeometry | null {
  if (!(spread > 0) || !path.every((p) => p.every((v) => Number.isFinite(v)))) return null;
  const points = path.filter((p, i) => i === 0 || p.some((v, k) => v !== (path[i - 1] as Vec3)[k]));
  if (points.length < 2) return null;
  const closed = points.length > 2 && points[0]?.every((v, k) => v === (points.at(-1) as Vec3)[k]);
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  const vertex = (x: number, y: number, z: number, alpha: number): number => {
    positions.push(x, y, z + RIBBON_LIFT);
    colours.push(color.r, color.g, color.b, alpha);
    return positions.length / 3 - 1;
  };
  /** Each segment's normal in the facing plane, and its four edge vertices. */
  const ends: { left0: number; left1: number; right0: number; right1: number }[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [a, b] = [points[i] as Vec3, points[i + 1] as Vec3];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) continue;
    const [nx, ny] = [(-dy / len) * spread, (dx / len) * spread];
    const p0 = vertex(a[0], a[1], a[2], 1);
    const p1 = vertex(b[0], b[1], b[2], 1);
    const l0 = vertex(a[0] + nx, a[1] + ny, a[2], 0);
    const l1 = vertex(b[0] + nx, b[1] + ny, b[2], 0);
    const r0 = vertex(a[0] - nx, a[1] - ny, a[2], 0);
    const r1 = vertex(b[0] - nx, b[1] - ny, b[2], 0);
    index.push(p0, p1, l1, p0, l1, l0, p0, r1, p1, p0, r0, r1);
    ends.push({ left0: l0, left1: l1, right0: r0, right1: r1 });
  }
  if (ends.length === 0) return null;
  // The bevels: at each joint, the corner and the two segments' edge points, on each side.
  const joints = closed ? ends.length : ends.length - 1;
  for (let j = 0; j < joints; j += 1) {
    const [prev, next] = [ends[j], ends[(j + 1) % ends.length]];
    const at = points[(j + 1) % (points.length - 1 || 1)] as Vec3;
    if (!prev || !next || !at) continue;
    const corner = vertex(at[0], at[1], at[2], 1);
    index.push(corner, prev.left1, next.left0, corner, next.right0, prev.right1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 4));
  geometry.setIndex(index);
  return geometry;
}

/** The glow cards of every placement's piece. */
export function buildGlows(options: {
  readonly part: Pick<RoomScene, "pieces" | "placements" | "look">;
  /** buildRoom's placement nodes. */
  readonly placements: ReadonlyMap<string, Object3D>;
  /** A glow's level now: the room's switch cases' (scene/cables.ts). */
  readonly glow: (placement: string, glow: string) => number;
  /** Whether the room animates now, read on every frame. */
  readonly motion: () => Pick<MotionView, "animate">;
}): GlowCards {
  const { part } = options;
  const cards = new Map<string, Mesh>();
  const made: { placement: string; glow: string; motion: GlowMotion; intensity: number; card: Mesh }[] = [];
  let enabled = true;
  for (const p of part.placements) {
    const piece = Object.hasOwn(part.pieces, p.piece) ? part.pieces[p.piece] : undefined;
    const node = options.placements.get(p.id);
    if (!piece || !node) continue;
    const group = new Group();
    group.name = `glows:${p.id}`;
    group.scale.setScalar(piece.scale);
    for (const [id, g] of Object.entries(piece.glows)) {
      const key = `${p.id}.${id}`;
      if (cards.has(key)) continue;
      const tone = Object.hasOwn(part.look.glow_tones, g.tone) ? part.look.glow_tones[g.tone] : undefined;
      const colour = new Color(tone?.color ?? "#ffffff");
      // Spec 014 (FR-006, FR-044): a path glow's ribbon, or nothing, never a disc in its place; else the disc.
      const geometry = g.path
        ? ribbonGeometry(g.path, g.spread ?? 0, colour)
        : g.radius && g.at
          ? new CircleGeometry(g.radius, SEGMENTS)
          : null;
      if (!geometry) continue;
      const material = new MeshBasicMaterial({
        color: g.path ? new Color("#ffffff") : colour,
        vertexColors: g.path !== undefined,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const card = new Mesh(geometry, material);
      card.name = `glow:${key}`;
      if (!g.path && g.at) card.position.copy(new Vector3(...g.at));
      card.visible = false;
      group.add(card);
      cards.set(key, card);
      made.push({ placement: p.id, glow: id, motion: g.motion, intensity: tone?.intensity ?? 1, card });
    }
    if (group.children.length > 0) node.add(group);
  }
  return {
    cards,
    frame(now) {
      const animate = options.motion().animate;
      for (const m of made) {
        const level = options.glow(m.placement, m.glow);
        m.card.visible = enabled && level > 0;
        (m.card.material as MeshBasicMaterial).opacity = Math.min(
          1,
          STRENGTH * m.intensity * level * glowFactor(m.motion, now, animate),
        );
      }
    },
    setEnabled(on) {
      enabled = on;
    },
    dispose() {
      for (const m of made) {
        m.card.geometry.dispose();
        (m.card.material as MeshBasicMaterial).dispose();
      }
    },
  };
}
