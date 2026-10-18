// T041 and T044 (spec 002; FR-005, FR-047; contracts/room-scene.md §2, §3, §6; research.md R-11): the work area's
// placeholder geometry, built without a renderer. Every piece W1 and W8 name is there and labeled as a placeholder, in
// its place; the visitor's avatar is the one chosen; the camera keeps the twin, the desk, the snowboard, and the bicycle
// in view from a wide desktop to a 320-pixel portrait phone; and the hand-off moves the paper from the twin's hand to the
// visitor, or crossfades it under reduced motion.
import { Box3, PerspectiveCamera, Vector3 } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";

import { AVATARS } from "../../src/choice/avatars";
import { applyHandoff, buildWorkArea, fitCamera, qualitySettings } from "../../src/room/scene";
import type { PartName } from "../../src/room/scene";

const PARTS: PartName[] = [
  "desk",
  "laptop",
  "screen",
  "snowboard",
  "bicycle",
  "window",
  "artwork",
  "view",
  "twin",
  "visitor",
  "paper",
];

const box = (o: Object3D): Box3 => new Box3().setFromObject(o);
const center = (o: Object3D): Vector3 => box(o).getCenter(new Vector3());

function labelsOf(o: Object3D): string[] {
  const out: string[] = [];
  o.traverse((x) => {
    if (x.name.startsWith("label:")) out.push(x.name.slice("label:".length));
  });
  return out;
}

describe("the work area's placeholders", () => {
  it("has every piece the intent names, each labeled as a placeholder", () => {
    const area = buildWorkArea({ avatar: "dog" });
    for (const name of PARTS) {
      const part = area.parts[name];
      expect(part, name).toBeDefined();
      expect(part.parent, name).not.toBeNull();
      if (name !== "paper")
        expect(
          labelsOf(part).some((l) => /placeholder/i.test(l)),
          name,
        ).toBe(true);
    }
  });

  it("puts the snowboard on the left, the bicycle on the right, the desk between, the artwork above the window", () => {
    const { parts } = buildWorkArea({ avatar: "dog" });
    expect(center(parts.snowboard).x).toBeLessThan(box(parts.desk).min.x);
    expect(center(parts.bicycle).x).toBeGreaterThan(box(parts.desk).max.x);
    expect(box(parts.artwork).min.y).toBeGreaterThan(box(parts.window).max.y);
    // The laptop and screen stand on the desk; the twin stands at it.
    expect(box(parts.laptop).min.y).toBeGreaterThanOrEqual(box(parts.desk).max.y - 0.01);
    expect(Math.abs(center(parts.twin).x - center(parts.desk).x)).toBeLessThan(1.6);
    // The view (a fence and a tree) is inside the window.
    const view = box(parts.view);
    const window = box(parts.window);
    expect(view.min.x).toBeGreaterThanOrEqual(window.min.x - 0.01);
    expect(view.max.x).toBeLessThanOrEqual(window.max.x + 0.01);
    expect(view.min.y).toBeGreaterThanOrEqual(window.min.y - 0.01);
    expect(view.max.y).toBeLessThanOrEqual(window.max.y + 0.01);
    expect(labelsOf(parts.view).join(" ")).toMatch(/fence/i);
    expect(labelsOf(parts.view).join(" ")).toMatch(/tree/i);
  });

  it("shows the visitor's chosen avatar, a different flat shape for each", () => {
    const shapes = AVATARS.map(({ id }) => {
      const { parts } = buildWorkArea({ avatar: id });
      expect(labelsOf(parts.visitor).join(" "), id).toContain(AVATARS.find((a) => a.id === id)?.name ?? "?");
      const size = box(parts.visitor).getSize(new Vector3());
      return `${size.x.toFixed(3)}x${size.y.toFixed(3)}`;
    });
    expect(new Set(shapes).size).toBe(AVATARS.length);
  });
});

describe("the camera's framing", () => {
  const inView = ["twin", "desk", "laptop", "screen", "snowboard", "bicycle"] as const;

  // From a 320-pixel portrait phone's stage (about 304 by 264, and taller ones) to a wide desktop.
  for (const aspect of [0.45, 0.6, 0.8, 1.15, 1.5, 2.4]) {
    it(`keeps the twin, the desk, the snowboard, and the bicycle on screen at ${aspect}`, () => {
      const area = buildWorkArea({ avatar: "dog" });
      const camera = new PerspectiveCamera();
      fitCamera(camera, aspect);
      area.scene.updateMatrixWorld(true);
      for (const name of inView) {
        const b = box(area.parts[name]);
        for (const x of [b.min.x, b.max.x]) {
          for (const y of [b.min.y, b.max.y]) {
            for (const z of [b.min.z, b.max.z]) {
              const p = new Vector3(x, y, z).project(camera);
              expect(Math.abs(p.x), `${name} x at ${aspect}`).toBeLessThanOrEqual(1);
              expect(Math.abs(p.y), `${name} y at ${aspect}`).toBeLessThanOrEqual(1);
              expect(p.z, `${name} in front at ${aspect}`).toBeLessThan(1);
            }
          }
        }
      }
    });
  }
});

describe("the hand-off in 3D", () => {
  it("moves the paper from the twin's hand to the visitor's", () => {
    const area = buildWorkArea({ avatar: "man" });
    applyHandoff(area, 0, false);
    const from = area.parts.paper.getWorldPosition(new Vector3());
    expect(from.distanceTo(area.anchors.twinHand)).toBeLessThan(0.2);
    applyHandoff(area, 0.5, false);
    const middle = area.parts.paper.getWorldPosition(new Vector3());
    expect(middle.distanceTo(area.anchors.twinHand)).toBeGreaterThan(0.2);
    expect(middle.distanceTo(area.anchors.visitorHand)).toBeGreaterThan(0.2);
    applyHandoff(area, 1, false);
    expect(area.parts.paper.getWorldPosition(new Vector3()).distanceTo(area.anchors.visitorHand)).toBeLessThan(0.2);
  });

  it("crossfades the paper in place under reduced motion", () => {
    const area = buildWorkArea({ avatar: "man" });
    applyHandoff(area, 0, true);
    const at = (o: Object3D): Vector3 => o.getWorldPosition(new Vector3());
    const start = at(area.parts.paper).clone();
    expect(area.paper.atTwin.opacity).toBe(1);
    expect(area.paper.atVisitor.opacity).toBe(0);
    applyHandoff(area, 0.5, true);
    expect(at(area.parts.paper).distanceTo(start)).toBeLessThan(1e-9);
    expect(area.paper.atTwin.opacity).toBeCloseTo(0.5);
    expect(area.paper.atVisitor.opacity).toBeCloseTo(0.5);
    applyHandoff(area, 1, true);
    expect(area.paper.atTwin.opacity).toBe(0);
    expect(area.paper.atVisitor.opacity).toBe(1);
  });
});

describe("quality levels", () => {
  it("lower the pixel ratio, then shadows, then textures and animations, never raising any", () => {
    const levels = [0, 1, 2, 3].map(qualitySettings);
    for (let i = 1; i < levels.length; i += 1) {
      const [a, b] = [levels[i - 1], levels[i]];
      if (!a || !b) throw new Error("missing level");
      expect(b.pixelRatio).toBeLessThanOrEqual(a.pixelRatio);
      expect(Number(b.shadows)).toBeLessThanOrEqual(Number(a.shadows));
      expect(b.textureScale).toBeLessThanOrEqual(a.textureScale);
      expect(Number(b.animations)).toBeLessThanOrEqual(Number(a.animations));
    }
    expect(levels[0]).toMatchObject({ shadows: true, animations: true });
    expect(levels[3]).toMatchObject({ shadows: false, animations: false });
    expect(levels[1]?.pixelRatio).toBeLessThan(levels[0]?.pixelRatio ?? 0);
  });
});
