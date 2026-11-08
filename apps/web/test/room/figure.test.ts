// T044 (spec 008; FR-034; plan.md R-12): src/room/scene/figure.ts, the figure driver, in Node with three's objects.
// The walking view drives the visitor's figure through one interface, which a rigged avatar's driver takes over later
// (spec 009): a frame's pose, the camera, and whether the motion store animates. The flat cut-out's driver puts the
// figure's node at the pose's place, turns the picture to face the camera about +Y, mirrors it toward the side of the
// camera's right the heading falls on, keeping its last side within ±0.2 so it doesn't flicker, and bobs it by at most
// 0.015 m with each 0.35 m walked, only while walking and animating; whatever the picture holds, the kept paper,
// moves and mirrors with it; and rest() puts it all back as the scene has it.
import { Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { BOB_M, BOB_STRIDE_M, MIRROR_HOLD, cutoutDriver } from "../../src/room/scene/figure";
import type { FigureDriver } from "../../src/room/scene/figure";
import type { Pose } from "../../src/room/walk/movement";

/** A visitor's node at its place on the shell, its picture inside, and a paper the picture holds. */
function figure(): { root: Object3D; node: Object3D; picture: Group; paper: Mesh; driver: FigureDriver } {
  const root = new Object3D();
  const node = new Object3D();
  node.position.set(0.1, 0, 0.8);
  root.add(node);
  const picture = new Group();
  node.add(picture);
  const paper = new Mesh(new PlaneGeometry(0.2, 0.3), new MeshBasicMaterial());
  paper.position.set(0.25, 1, 0);
  picture.add(paper);
  root.updateMatrixWorld(true);
  return { root, node, picture, paper, driver: cutoutDriver({ node, picture }) };
}

const pose = (x: number, z: number, heading: number, walking = true, speed = walking ? 1 : 0): Pose => ({
  x,
  z,
  heading,
  speed,
  walking,
});
const world = (o: Object3D): Vector3 => {
  o.updateWorldMatrix(true, false);
  return new Vector3().setFromMatrixPosition(o.matrixWorld);
};

describe("the figure driver (spec 008, T044; R-12)", () => {
  it("puts the figure's feet at the pose's place, its height kept", () => {
    const { node, driver } = figure();
    driver.frame({ pose: pose(-0.3, 0.6, 0), camera: [0, 1.5, 3], animate: false });
    expect(world(node).toArray()).toEqual([-0.3, 0, 0.6]);
  });

  it("turns the picture to face the camera about +Y", () => {
    const { picture, driver } = figure();
    driver.frame({ pose: pose(0, 0.5, 0, false), camera: [2, 1.5, 2.5], animate: false });
    // Its +Z, the cut-out's face, points at the camera on the floor's plane.
    picture.updateWorldMatrix(true, false);
    const facing = new Vector3(0, 0, 1).transformDirection(picture.matrixWorld);
    const toward = new Vector3(2, 0, 2).normalize();
    expect(facing.x).toBeCloseTo(toward.x, 9);
    expect(facing.z).toBeCloseTo(toward.z, 9);
  });

  it("mirrors toward the heading's side of the camera's right, holding its side within the hold", () => {
    const { picture, driver } = figure();
    const camera: [number, number, number] = [0, 1.5, 3];
    // The camera looks along −z, its right +x: a heading of −90° walks toward +x, the right.
    driver.frame({ pose: pose(0, 0.6, -Math.PI / 2), camera, animate: false });
    const right = Math.sign(picture.scale.x);
    driver.frame({ pose: pose(0, 0.6, Math.PI / 2), camera, animate: false });
    expect(Math.sign(picture.scale.x)).toBe(-right);
    // Nearly straight into the room, within the hold: the side stays.
    const within = Math.asin(MIRROR_HOLD / 2);
    driver.frame({ pose: pose(0, 0.6, within), camera, animate: false });
    expect(Math.sign(picture.scale.x)).toBe(-right);
    driver.frame({ pose: pose(0, 0.6, -within), camera, animate: false });
    expect(Math.sign(picture.scale.x)).toBe(-right);
    // Past it, toward the right again: it turns.
    driver.frame({ pose: pose(0, 0.6, -Math.asin(MIRROR_HOLD * 1.5)), camera, animate: false });
    expect(Math.sign(picture.scale.x)).toBe(right);
  });

  it("bobs at most 0.015 m with each 0.35 m walked, only while walking and animating", () => {
    expect([BOB_M, BOB_STRIDE_M]).toEqual([0.015, 0.35]);
    const { picture, driver } = figure();
    const camera: [number, number, number] = [0, 1.5, 3];
    const heights: number[] = [];
    for (let k = 0; k <= 40; k += 1) {
      driver.frame({ pose: pose(-0.4 + k * 0.02, 0.6, -Math.PI / 2), camera, animate: true });
      heights.push(picture.position.y);
    }
    expect(Math.max(...heights)).toBeGreaterThan(0.01);
    expect(Math.max(...heights)).toBeLessThanOrEqual(BOB_M + 1e-12);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0);
    // Still, or not animating: no bob.
    driver.frame({ pose: pose(0.5, 0.6, -Math.PI / 2, false), camera, animate: true });
    expect(picture.position.y).toBe(0);
    for (let k = 0; k <= 10; k += 1) {
      driver.frame({ pose: pose(0.4 - k * 0.02, 0.6, Math.PI / 2), camera, animate: false });
      expect(picture.position.y).toBe(0);
    }
  });

  it("carries what the picture holds, the kept paper, and mirrors it with the figure", () => {
    const { node, paper, driver } = figure();
    const camera: [number, number, number] = [0, 1.5, 3];
    const held = Math.hypot(0.25, 1);
    driver.frame({ pose: pose(-0.2, 0.6, -Math.PI / 2, false), camera, animate: false });
    expect(world(paper).distanceTo(world(node))).toBeCloseTo(held, 9);
    driver.frame({ pose: pose(0.3, 0.6, -Math.PI / 2, false), camera, animate: false });
    const b = world(paper);
    // Still in the picture's hand, wherever the figure stands.
    expect(b.distanceTo(world(node))).toBeCloseTo(held, 9);
    driver.frame({ pose: pose(0.3, 0.6, Math.PI / 2, false), camera, animate: false });
    const c = world(paper);
    // Mirrored about the figure: the paper on the other side of its feet.
    expect(Math.sign(c.x - 0.3)).toBe(-Math.sign(b.x - 0.3));
  });

  it("takes a frame's seconds, which a rigged driver needs, and the cut-out reads nothing of them", () => {
    const a = figure();
    const b = figure();
    a.driver.frame({ pose: pose(0.2, 0.6, -Math.PI / 2), camera: [0, 1.5, 3], animate: true });
    b.driver.frame({ pose: pose(0.2, 0.6, -Math.PI / 2), camera: [0, 1.5, 3], animate: true, dt: 0.016 });
    expect(world(b.node).toArray()).toEqual(world(a.node).toArray());
    expect(b.picture.position.y).toBe(a.picture.position.y);
  });

  it("holds what it's given in its hand, its place in the room kept: the cut-out's hand its picture", () => {
    const { root, picture, driver } = figure();
    const sheet = new Mesh(new PlaneGeometry(0.2, 0.3), new MeshBasicMaterial());
    sheet.position.set(0.4, 1.2, 0.9);
    root.add(sheet);
    const before = world(sheet).toArray();
    driver.hold?.(sheet);
    expect(sheet.parent).toBe(picture);
    expect(world(sheet).distanceTo(new Vector3(...before))).toBeLessThan(1e-12);
    // It walks with the figure from then on.
    driver.frame({ pose: pose(0.5, 0.6, -Math.PI / 2, false), camera: [0, 1.5, 3], animate: false });
    expect(world(sheet).distanceTo(new Vector3(...before))).toBeGreaterThan(0.1);
  });

  it("rests the figure as the scene has it: its place, its turn, its side, no bob", () => {
    const { node, picture, driver } = figure();
    const before = [node.position.toArray(), picture.rotation.toArray(), picture.scale.toArray()];
    driver.frame({ pose: pose(0.4, 0.5, Math.PI / 2), camera: [1, 1.5, 3], animate: true });
    driver.rest();
    expect([node.position.toArray(), picture.rotation.toArray(), picture.scale.toArray()]).toEqual(before);
    expect(picture.position.y).toBe(0);
  });
});
