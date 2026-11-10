// T004 (spec 014): the grip's skeletons and the protector's scene build, and say what they hold, before any test uses
// them (test/room/grip.test.ts, test/room/protect.test.ts).
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { PROTECT_IDS, PROTECT_SCENE } from "../fixtures/room/protect-scene";
import { SKELETON_CASES, boneNames, skeleton } from "../fixtures/room/skeleton";

const world = (o: { getWorldPosition(v: Vector3): Vector3 }): Vector3 => o.getWorldPosition(new Vector3());

describe("the skeleton fixtures (T004)", () => {
  it("build both avatars in both poses with ADR 0010's bones for each hand", () => {
    expect(SKELETON_CASES).toHaveLength(8);
    for (const { avatar, pose, side } of SKELETON_CASES) {
      const s = skeleton(avatar, pose);
      const n = boneNames(side);
      for (const name of [n.arm, n.forearm, n.hand, ...n.middle, n.index1, ...n.thumb])
        expect(s.bone(name).name, `${avatar} ${pose} ${name}`).toBe(name);
      // The forearm is the hand's parent, and the middle finger's first bone its child.
      expect(s.bone(n.hand).parent?.name).toBe(n.forearm);
      expect(s.bone(n.middle[0] ?? "").parent?.name).toBe(n.hand);
    }
  });

  it("hang the hands below the elbows at rest, and raise the forearms forward in the holding pose", () => {
    for (const avatar of ["man", "woman"] as const) {
      const rest = skeleton(avatar, "rest");
      const holding = skeleton(avatar, "holding");
      for (const side of ["right", "left"] as const) {
        const n = boneNames(side);
        const [elbow, wrist] = [world(rest.bone(n.forearm)), world(rest.bone(n.hand))];
        expect(wrist.y).toBeLessThan(elbow.y - 0.2);
        expect(Math.abs(wrist.z - elbow.z)).toBeLessThan(1e-9);
        const [e2, w2] = [world(holding.bone(n.forearm)), world(holding.bone(n.hand))];
        expect(w2.z - e2.z).toBeGreaterThan(0.2);
        expect(Math.abs(w2.y - e2.y)).toBeLessThan(0.1);
      }
      // The man's arms are longer than the woman's.
      const n = boneNames("right");
      expect(world(skeleton("man", "rest").bone(n.hand)).y).toBeLessThan(
        world(skeleton("man", "rest").bone(n.forearm)).y,
      );
    }
  });
});

describe("the protector's scene (T004)", () => {
  it("holds a selectable on each side wall, one at the desk's right, and the two figures", () => {
    expect(PROTECT_SCENE.selectables.map((s) => s.id)).toEqual(PROTECT_IDS.selectables);
    expect(PROTECT_SCENE.selectables.filter((s) => s.sideWall)).toHaveLength(2);
    const [board, bike, laptop] = PROTECT_SCENE.selectables;
    expect(board?.boxes[0]?.min[0]).toBeLessThan(-1);
    expect(bike?.boxes[0]?.max[0]).toBeGreaterThan(1);
    expect(laptop?.boxes[0]?.min[0]).toBeGreaterThan(0.3);
    expect(PROTECT_SCENE.figures).toHaveLength(2);
    for (const b of [...PROTECT_SCENE.framed, ...PROTECT_SCENE.figures])
      for (const axis of [0, 1, 2] as const) expect(b.min[axis]).toBeLessThan(b.max[axis]);
  });
});
