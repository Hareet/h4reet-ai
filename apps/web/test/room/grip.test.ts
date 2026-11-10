// T031 (spec 014; FR-005, FR-038 to FR-041; SC-006; plan.md §6, PD-12, PD-13): the sheet in the hand, `scene/grip.ts`,
// over T004's skeletons, with no mixer and no model. For the man and the woman, each hand, at rest and in the holding
// pose: the computed default puts the sheet's held edge's middle at the midpoint of the hand bone and the middle finger's
// first bone, within 1 cm, and no point of the sheet within the forearm's 4 cm capsule; a data grip puts the held edge at
// its point in the hand bone's frame, in the room's metres, within 1 cm, its sheet clear of the forearm too; without the
// middle finger's bone the default holds at the hand bone; and a grip whose numbers aren't finite gives nothing, so the
// figure keeps its hand anchor (FR-005).
import { Matrix4, Vector3 } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";

import { SHEET_SIZE, gripMatrix, middleOf } from "../../src/room/scene/grip";
import type { GripData } from "../../src/room/scene/grip";
import { SKELETON_CASES, boneNames, skeleton } from "../fixtures/room/skeleton";

const world = (o: Object3D): Vector3 => o.getWorldPosition(new Vector3());

/** The sheet's points, an 11 × 11 grid over its face, through its world matrix. */
function sheetPoints(m: Matrix4): Vector3[] {
  const [w, h] = SHEET_SIZE;
  const out: Vector3[] = [];
  for (let i = 0; i <= 10; i += 1)
    for (let j = 0; j <= 10; j += 1)
      out.push(new Vector3(-w / 2 + (w * i) / 10, -h / 2 + (h * j) / 10, 0).applyMatrix4(m));
  return out;
}

/** The held edge's middle: the sheet's top edge's middle, through its world matrix. */
const heldEdge = (m: Matrix4): Vector3 => new Vector3(0, SHEET_SIZE[1] / 2, 0).applyMatrix4(m);

/** A point's distance from the segment from a to b. */
function segmentDistance(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
}

const FOREARM_RADIUS = 0.04;

describe("the computed default grip (FR-040; PD-13)", () => {
  for (const { avatar, pose, side } of SKELETON_CASES)
    it(`holds the sheet at the ${avatar}'s ${side} hand, ${pose}, between the fingers, clear of the forearm`, () => {
      const s = skeleton(avatar, pose);
      const n = boneNames(side);
      const hand = s.bone(n.hand);
      const m = gripMatrix(hand, s.front, null);
      if (!m) throw new Error("no grip");
      const middle = world(s.bone(n.middle[0] ?? ""));
      const point = world(hand).add(middle).multiplyScalar(0.5);
      expect(heldEdge(m).distanceTo(point)).toBeLessThan(0.01);
      expect(middleOf(hand)?.name).toBe(n.middle[0]);
      const [elbow, wrist] = [world(s.bone(n.forearm)), world(hand)];
      const inside = sheetPoints(m).filter((p) => segmentDistance(p, elbow, wrist) < FOREARM_RADIUS);
      expect(inside, `${inside.length} points in the forearm`).toEqual([]);
      // The sheet faces the figure's front, more or less: its normal leans forward, never back.
      const normal = new Vector3(0, 0, 1).transformDirection(m);
      expect(normal.dot(s.front)).toBeGreaterThan(0);
    });

  it("holds at the hand bone where the middle finger's first bone is missing", () => {
    const s = skeleton("man", "rest");
    const n = boneNames("right");
    const hand = s.bone(n.hand);
    const middle = s.bone(n.middle[0] ?? "");
    hand.remove(middle);
    hand.updateMatrixWorld(true);
    const m = gripMatrix(hand, s.front, null);
    if (!m) throw new Error("no grip");
    expect(heldEdge(m).distanceTo(world(hand))).toBeLessThan(0.01);
    expect(middleOf(hand)).toBeNull();
  });
});

describe("a grip from data (FR-039; PD-12)", () => {
  // The held edge 6 cm along the hand from the wrist, the sheet turned half a turn about the hand's own Z, so it hangs
  // on along the hand, past the fingers.
  const GRIP: GripData = { at: [0, 0.06, 0], turn: { x: 0, y: 0, z: 180 } };

  for (const { avatar, pose, side } of SKELETON_CASES)
    it(`puts the held edge at its point in the ${avatar}'s ${side} hand bone's frame, ${pose}`, () => {
      const s = skeleton(avatar, pose);
      const n = boneNames(side);
      const hand = s.bone(n.hand);
      const m = gripMatrix(hand, s.front, GRIP);
      if (!m) throw new Error("no grip");
      const point = hand.localToWorld(new Vector3(...GRIP.at));
      expect(heldEdge(m).distanceTo(point)).toBeLessThan(0.01);
      const [elbow, wrist] = [world(s.bone(n.forearm)), world(hand)];
      expect(sheetPoints(m).filter((p) => segmentDistance(p, elbow, wrist) < FOREARM_RADIUS)).toEqual([]);
    });

  it("reads `at` in the room's metres whatever the hand bone's world scale", () => {
    const s = skeleton("woman", "holding");
    s.root.scale.setScalar(0.01);
    s.root.updateMatrixWorld(true);
    const hand = s.bone(boneNames("left").hand);
    const m = gripMatrix(hand, s.front, GRIP);
    if (!m) throw new Error("no grip");
    // 6 cm from the wrist along the hand, in the room's metres, not 6 cm times the bone's scale.
    expect(heldEdge(m).distanceTo(world(hand))).toBeCloseTo(0.06, 6);
  });

  it("gives nothing for a grip whose numbers aren't finite, so the figure keeps its anchor (FR-005)", () => {
    const s = skeleton("man", "rest");
    const hand = s.bone(boneNames("right").hand);
    expect(gripMatrix(hand, s.front, { at: [Number.NaN, 0, 0], turn: { x: 0, y: 0, z: 0 } })).toBeNull();
    expect(gripMatrix(hand, s.front, { at: [0, 0, 0], turn: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 } })).toBeNull();
  });
});
