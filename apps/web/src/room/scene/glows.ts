// The glow cards (spec 004; FR-017, FR-022, FR-059; R-27, R-35): each glow a piece's catalog entry declares, drawn as a
// flat card at its point under its placement's node, at the piece's stylized scale, in its tone's colour from the look,
// added over what's behind it. Its strength is its tone's intensity times its level now, which the shown switch pose
// sets while its case shows (such as the laptop's charge light) and its piece's own level otherwise (scene/cables.ts's
// `glow`). Its motion is the catalog's: `breathe` swells slowly, `flicker` wavers, `steady` holds; while the room
// doesn't animate (reduced motion, paused, or hidden), every card holds still at its full strength (FR-059, FR-060).
// Quality 2 and 3 draw no glow cards (R-35). Nothing here is a lit material: the room adds the light (FR-022).
import { AdditiveBlending, CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { Object3D } from "three";

import type { RoomScene } from "../compose/bundle";
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
      const material = new MeshBasicMaterial({
        color: new Color(tone?.color ?? "#ffffff"),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const card = new Mesh(new CircleGeometry(g.radius, SEGMENTS), material);
      card.name = `glow:${key}`;
      card.position.copy(new Vector3(...g.at));
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
