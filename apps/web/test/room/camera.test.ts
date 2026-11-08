// T029 (spec 008; FR-022 to FR-024, FR-037, FR-044, SC-004, SC-005; plan.md R-01, R-02): src/room/walk/camera.ts, the
// follow camera.
// - 10,000 seeded requests, each a yaw, a pitch, and a distance at a random place on the default scene's walkable floor
//   and a random stage aspect: every clamped camera stands in front of the open face, within the side walls' width less
//   their margin, and above the floor; within the yaw and pitch limits; and no farther from the figure's focus than the
//   production framing's camera at that aspect.
// - A wider aspect, whose framing stands nearer, pulls a camera at the old farthest distance in.
// - The transitions into and out of the walking view take 500 ms while the motion store animates, and are a cut while
//   it doesn't; the return lands on framing(aspect, boxes) within 1e-9.
import { describe, expect, it } from "vitest";

import { floorOfPart, isWalkable } from "../../src/room/compose/floor";
import type { WalkableFloor } from "../../src/room/compose/floor";
import { framing } from "../../src/room/compose/framing";
import type { Camera } from "../../src/room/compose/project";
import { framedBoxes } from "../../src/room/scene/bundle3d";
import {
  REGION_FLOOR,
  REGION_MARGIN,
  TRANSITION_MS,
  blendCamera,
  cameraLimits,
  cameraRegion,
  clampOrbit,
  farthest,
  focusOf,
  followCamera,
  inRegion,
  orbitPosition,
} from "../../src/room/walk/camera";
import { startPose } from "../../src/room/walk/movement";
import { repositoryBundle } from "../helpers/room";

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;
const bundle = () => repositoryBundle();
const floor = (): WalkableFloor => floorOfPart(bundle().scene, bundle().scene.walking.radius_m) as WalkableFloor;
const limits = () => cameraLimits(bundle().scene.walking);
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(...a.map((v, i) => v - (b[i] ?? 0)));

describe("the limits and the region (R-01, R-02)", () => {
  it("take the walking data's figures in radians and metres", () => {
    const w = bundle().scene.walking;
    expect(limits()).toEqual({
      yaw: w.camera.yaw_deg * DEG,
      pitchMin: w.camera.pitch_deg[0] * DEG,
      pitchMax: w.camera.pitch_deg[1] * DEG,
      minDistance: w.camera.min_distance_m,
      focusHeight: w.camera.focus_height_m,
    });
  });

  it("put the region in front of the open face, within the side walls less their margin, and above the floor", () => {
    const f = floor();
    expect([REGION_MARGIN, REGION_FLOOR]).toEqual([0.05, 0.1]);
    expect(cameraRegion(f)).toEqual({
      x0: f.shell.x0 + REGION_MARGIN,
      x1: f.shell.x1 - REGION_MARGIN,
      zMin: f.shell.z1 + REGION_MARGIN,
      yMin: f.feetY + REGION_FLOOR,
    });
  });

  it("raise the focus by the focus height above the figure's feet", () => {
    const f = floor();
    expect(focusOf(startPose(f), limits(), f)).toEqual([f.start.x, f.feetY + limits().focusHeight, f.start.z]);
  });
});

describe("10,000 seeded camera requests (SC-004)", () => {
  it("each stand in the region, within the limits, and no farther than the production framing at that aspect", () => {
    const f = floor();
    const l = limits();
    const region = cameraRegion(f);
    const boxes = framedBoxes(bundle().scene);
    const random = seeded(808);
    let bound = 0;
    for (let k = 0; k < 10_000; k += 1) {
      // A random walkable place on the floor.
      let x: number;
      let z: number;
      do {
        x = f.bounds.x0 + random() * (f.bounds.x1 - f.bounds.x0);
        z = f.bounds.z0 + random() * (f.bounds.z1 - f.bounds.z0);
      } while (!isWalkable(f, x, z));
      const aspect = 0.45 + random() * (2.4 - 0.45);
      const focus = focusOf({ x, z, heading: 0, speed: 0, walking: false }, l, f);
      const far = farthest(framing(aspect, boxes), focus);
      const request = {
        yaw: (random() * 2 - 1) * Math.PI,
        pitch: ((random() * 1.6 - 0.3) * Math.PI) / 2,
        distance: random() * 6,
      };
      const orbit = clampOrbit(request, focus, l, region, far);
      const at = orbitPosition(focus, orbit);
      const where = `request ${k}: ${JSON.stringify({ x, z, aspect, request })}`;
      expect(inRegion(at, region), where).toBe(true);
      expect(Math.abs(orbit.yaw), where).toBeLessThanOrEqual(l.yaw + 1e-12);
      expect(orbit.pitch, where).toBeGreaterThanOrEqual(l.pitchMin - 1e-12);
      expect(orbit.pitch, where).toBeLessThanOrEqual(l.pitchMax + 1e-12);
      expect(orbit.distance, where).toBeLessThanOrEqual(far + 1e-9);
      expect(dist(at, focus), where).toBeLessThanOrEqual(far + 1e-9);
      expect(orbit.distance, where).toBeGreaterThanOrEqual(Math.min(l.minDistance, far) - 1e-9);
      if (Math.abs(orbit.yaw) < Math.min(Math.abs(request.yaw), l.yaw) - 1e-9) bound += 1;
    }
    // The region binds now and then, near the side walls (R-02), and not on every request.
    expect(bound).toBeGreaterThan(0);
    expect(bound).toBeLessThan(10_000);
  });

  it("keeps a request that is already inside the limits and the region as it is", () => {
    const f = floor();
    const l = limits();
    const focus = focusOf(startPose(f), l, f);
    const far = farthest(framing(16 / 10, framedBoxes(bundle().scene)), focus);
    const request = { yaw: 0, pitch: 20 * DEG, distance: (l.minDistance + far) / 2 };
    expect(clampOrbit(request, focus, l, cameraRegion(f), far)).toEqual(request);
  });

  it("pulls a camera at the old farthest distance in when a wider aspect brings the framing nearer", () => {
    const f = floor();
    const l = limits();
    const boxes = framedBoxes(bundle().scene);
    const focus = focusOf(startPose(f), l, f);
    const [narrow, wide] = [farthest(framing(0.6, boxes), focus), farthest(framing(2.4, boxes), focus)];
    expect(wide).toBeLessThan(narrow);
    const orbit = clampOrbit({ yaw: 0, pitch: 10 * DEG, distance: narrow }, focus, l, cameraRegion(f), wide);
    expect(orbit.distance).toBeLessThanOrEqual(wide + 1e-9);
  });
});

describe("the follow camera and its transitions (FR-022, FR-044; SC-005)", () => {
  const f = () => floor();
  const boxes = () => framedBoxes(bundle().scene);

  it("looks at the figure's focus from its orbit, with the production framing's lens", () => {
    const l = limits();
    const focus = focusOf(startPose(f()), l, f());
    const base = framing(1.5, boxes());
    const orbit = { yaw: 10 * DEG, pitch: 15 * DEG, distance: 1.5 };
    const cam = followCamera(focus, orbit, base);
    expect([cam.fov, cam.near, cam.far]).toEqual([base.fov, base.near, base.far]);
    expect(cam.target).toEqual(focus);
    expect(dist(cam.position, focus)).toBeCloseTo(1.5, 12);
    // Yaw 0 stands straight in front of the figure, looking into the room; a positive yaw swings it to +x.
    const ahead = orbitPosition(focus, { yaw: 0, pitch: 0, distance: 1 });
    expect(ahead).toEqual([focus[0], focus[1], focus[2] + 1]);
    expect(orbitPosition(focus, { yaw: 90 * DEG, pitch: 0, distance: 1 })[0]).toBeCloseTo(focus[0] + 1, 12);
    expect(orbitPosition(focus, { yaw: 0, pitch: 90 * DEG, distance: 1 })[1]).toBeCloseTo(focus[1] + 1, 12);
  });

  it("takes at most 500 ms in either direction while animating, eased, and lands exactly", () => {
    expect(TRANSITION_MS).toBe(500);
    const l = limits();
    const from: Camera = framing(1.5, boxes());
    const to = followCamera(focusOf(startPose(f()), l, f()), { yaw: 0, pitch: 20 * DEG, distance: 1.6 }, from);
    expect(blendCamera(from, to, 0, true)).toEqual(from);
    const half = blendCamera(from, to, 250, true);
    expect(dist(half.position, from.position)).toBeGreaterThan(0);
    expect(dist(half.position, to.position)).toBeGreaterThan(0);
    expect(blendCamera(from, to, 500, true)).toEqual(to);
    expect(blendCamera(from, to, 10_000, true)).toEqual(to);
    // The return lands on the production framing within 1e-9.
    const back = blendCamera(to, from, 500, true);
    for (const k of ["position", "target"] as const) expect(dist(back[k], from[k])).toBeLessThanOrEqual(1e-9);
  });

  it("is a cut while the motion store doesn't animate: reduced motion, the pause, or a hidden page", () => {
    const l = limits();
    const from: Camera = framing(1.5, boxes());
    const to = followCamera(focusOf(startPose(f()), l, f()), { yaw: 0, pitch: 20 * DEG, distance: 1.6 }, from);
    expect(blendCamera(from, to, 0, false)).toEqual(to);
    expect(blendCamera(to, from, 0, false)).toEqual(from);
  });
});
