// T035 (spec 014; FR-006, FR-044 to FR-049; SC-007; plan.md §7, PD-14; R-8): the path glow, `scene/glows.ts`. A glow
// that gives a path draws as one mesh with one additive material, a ribbon of at most 2,000 triangles, every vertex
// within the spread, plus the 1 mm it stands toward the viewer, of the path; its strength by vertex alpha, 1 on the path
// and 0 at the edges; its joints bevelled, so no corner spikes past the spread (R-8); `flicker` wavering while the room
// animates and full strength while it doesn't; none drawn at quality levels 2 and 3; a path that can't be built draws
// nothing, never a disc; and a disc glow keeps its disc.
import { BufferGeometry, CircleGeometry, Group, MeshBasicMaterial, Vector3 } from "three";
import type { Mesh, Object3D } from "three";
import { describe, expect, it } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import type { Vec3 } from "../../src/room/compose/math";
import { buildGlows, glowFactor } from "../../src/room/scene/glows";

/** The neon sign's tube, the arrow's outline, as PD-15 gives it (scale 1, at its tubes' z). */
const TUBE: Vec3[] = [
  [-0.244, 0.04, 0.0137],
  [0.254, 0.04, 0.0137],
  [0.318, 0.136, 0.0137],
  [0.254, 0.232, 0.0137],
  [-0.244, 0.232, 0.0137],
  [-0.244, 0.04, 0.0137],
];
const SPREAD = 0.015;

type Glow = RoomScene["pieces"][string]["glows"][string];

function build(glows: Record<string, Glow>, animate = true) {
  const part = {
    pieces: { sign: { scale: 2.6, anchors: {}, standin: [], faces: {}, glows } },
    placements: [{ id: "sign", piece: "sign" }],
    look: { glow_tones: { warm: { color: "#ffb08a", intensity: 1.2 } } },
  } as unknown as Pick<RoomScene, "pieces" | "placements" | "look">;
  const node = new Group();
  const made = buildGlows({
    part,
    placements: new Map<string, Object3D>([["sign", node]]),
    glow: () => 1,
    motion: () => ({ animate }),
  });
  return { made, node };
}

const path = (points: Vec3[] = TUBE, spread = SPREAD): Glow =>
  ({ path: points, spread, tone: "warm", motion: "flicker", level: 1 }) as unknown as Glow;

/** A point's distance from a polyline. */
function polylineDistance(p: Vector3, points: readonly Vec3[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = new Vector3(...(points[i] as Vec3));
    const b = new Vector3(...(points[i + 1] as Vec3));
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    best = Math.min(best, p.distanceTo(a.clone().add(ab.multiplyScalar(t))));
  }
  return best;
}

describe("the path glow's ribbon (scene/glows.ts; PD-14)", () => {
  it("is one mesh with one additive material, at most 2,000 triangles, and no disc", () => {
    const { made, node } = build({ tube: path() });
    const card = made.cards.get("sign.tube") as Mesh;
    expect(card).toBeDefined();
    expect(card.geometry).toBeInstanceOf(BufferGeometry);
    expect(card.geometry).not.toBeInstanceOf(CircleGeometry);
    const material = card.material as MeshBasicMaterial;
    expect(Array.isArray(card.material)).toBe(false);
    expect(material.blending).toBe(2); // AdditiveBlending
    expect(material.depthWrite).toBe(false);
    expect(material.vertexColors).toBe(true);
    const triangles = (card.geometry.index?.count ?? 0) / 3;
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(2000);
    let meshes = 0;
    node.traverse((o) => {
      if ((o as Mesh).isMesh) meshes += 1;
    });
    expect(meshes).toBe(1);
  });

  it("keeps every vertex within the spread, plus 1 mm, of the path, its alpha 1 on the path and 0 at the edges", () => {
    const { made } = build({ tube: path() });
    const card = made.cards.get("sign.tube") as Mesh;
    const position = card.geometry.getAttribute("position");
    const color = card.geometry.getAttribute("color");
    expect(color.itemSize).toBe(4);
    let onPath = 0;
    let atEdge = 0;
    for (let i = 0; i < position.count; i += 1) {
      const p = new Vector3(position.getX(i), position.getY(i), position.getZ(i));
      const d = polylineDistance(p.clone().setZ(TUBE[0]?.[2] ?? 0), TUBE);
      expect(d, `vertex ${i}`).toBeLessThanOrEqual(SPREAD + 0.001 + 1e-6);
      // Never past twice the spread at a joint, the mitre's cap (R-8).
      expect(d).toBeLessThanOrEqual(2 * SPREAD);
      expect(Math.abs(p.z - ((TUBE[0]?.[2] ?? 0) + 0.001))).toBeLessThan(1e-6);
      const alpha = color.getW(i);
      // Alpha 1 only on the path, within float32's rounding of the positions; 0 at the spread's edges, which at a
      // square corner can lie on the next segment, so an edge vertex's distance alone doesn't tell them apart.
      if (alpha === 1) {
        expect(d, `vertex ${i}, alpha 1`).toBeLessThan(1e-6);
        onPath += 1;
      } else {
        expect(alpha).toBe(0);
        atEdge += 1;
      }
    }
    expect(onPath).toBeGreaterThan(0);
    expect(atEdge).toBeGreaterThan(0);
  });

  it("flickers while the room animates and holds full strength while it doesn't (FR-047)", () => {
    const moving = build({ tube: path() }, true);
    const still = build({ tube: path() }, false);
    const opacity = (b: ReturnType<typeof build>, now: number): number => {
      b.made.frame(now);
      return ((b.made.cards.get("sign.tube") as Mesh).material as MeshBasicMaterial).opacity;
    };
    const seen = new Set([0, 100, 333, 777].map((t) => opacity(moving, t).toFixed(4)));
    expect(seen.size).toBeGreaterThan(1);
    expect(opacity(still, 0)).toBeCloseTo(opacity(still, 777), 12);
    expect(opacity(still, 0)).toBeCloseTo(Math.min(1, 0.35 * 1.2 * glowFactor("flicker", 0, false)), 12);
  });

  it("draws none at quality levels 2 and 3, as every glow", () => {
    const { made } = build({ tube: path() });
    made.setEnabled(false);
    made.frame(0);
    expect((made.cards.get("sign.tube") as Mesh).visible).toBe(false);
  });

  it("draws nothing, never a disc, for a path that can't be built (FR-006)", () => {
    for (const bad of [
      path([]),
      path([[0, 0, 0]]),
      path([
        [0, 0, 0],
        [0, 0, 0],
      ]),
      path(TUBE, 0),
    ]) {
      const { made, node } = build({ tube: bad });
      expect(made.cards.has("sign.tube")).toBe(false);
      let meshes = 0;
      node.traverse((o) => {
        if ((o as Mesh).isMesh) meshes += 1;
      });
      expect(meshes).toBe(0);
    }
  });

  it("keeps a disc glow's disc (FR-048)", () => {
    const disc = { at: [0, 0.1, 0.01], radius: 0.25, tone: "warm", motion: "breathe", level: 1 } as unknown as Glow;
    const { made } = build({ screen: disc });
    expect((made.cards.get("sign.screen") as Mesh).geometry).toBeInstanceOf(CircleGeometry);
  });
});
