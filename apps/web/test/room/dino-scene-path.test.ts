// T-B04 (spec 028; FR-021, FR-023; plan.md R-B2, R-B3): the scene's movement.
// - By arc length: each walker covers its speed × dt a frame along its route, corners included (the last frame of a
//   route short of it), and faces its segment's heading (spec 008's: 0 faces −z, headingOf).
// - The adapter (scene/dino-scene-figures.ts), over plain three.js groups and a fake controller: only the pictures
//   move (the twin's placement's node stays, FR-023); the bicycle's pictures leave its placement's node for a carrier
//   and stand at `carry` in the twin's picture's frame through the leave, the offset kept frame by frame; the three are
//   hidden at the end; the twin's wave asked once at the call, its gait given its picture's place, the dog's walk
//   played while it moves.
import { Group, Object3D, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { headingOf } from "../../src/room/walk/movement";
import { createDinoFigures } from "../../src/room/scene/dino-scene-figures";
import type { DinoAvatars } from "../../src/room/scene/dino-scene-figures";
import { DT, LEAVE, inputs, made, runTo } from "../helpers/dino-scene";

describe("by arc length, facing each segment (FR-021)", () => {
  it("moves the twin walk_mps × dt a frame in the leave, along the path's segments", () => {
    const t = made();
    runTo(t.scene, "leave");
    let prev = { x: t.scene.twin.x, z: t.scene.twin.z };
    let steps = 0;
    while (t.scene.phase === "leave") {
      t.scene.frame(DT, inputs());
      const d = Math.hypot(t.scene.twin.x - prev.x, t.scene.twin.z - prev.z);
      if (t.scene.phase === "leave") {
        // Across a corner the straight-line step is at most the arc's.
        expect(d).toBeLessThanOrEqual(LEAVE.walk_mps * DT + 1e-9);
        expect(d).toBeGreaterThan(LEAVE.walk_mps * DT * 0.9);
        steps += 1;
      }
      prev = { x: t.scene.twin.x, z: t.scene.twin.z };
    }
    expect(steps).toBeGreaterThan(10);
  });

  it("moves the dog dog_mps × dt a frame in the enter", () => {
    const t = made();
    runTo(t.scene, "enter");
    let prev = { x: t.scene.dog.x, z: t.scene.dog.z };
    while (t.scene.phase === "enter") {
      t.scene.frame(DT, inputs());
      if (t.scene.phase !== "enter") break;
      const d = Math.hypot(t.scene.dog.x - prev.x, t.scene.dog.z - prev.z);
      expect(d).toBeLessThanOrEqual(LEAVE.dog_mps * DT + 1e-9);
      expect(d).toBeGreaterThan(LEAVE.dog_mps * DT * 0.9);
      prev = { x: t.scene.dog.x, z: t.scene.dog.z };
    }
  });

  it("faces each segment's heading as it walks it", () => {
    const t = made();
    runTo(t.scene, "leave");
    const last = LEAVE.path.at(-1)!;
    const before = LEAVE.path.at(-2)!;
    const final = headingOf(last[0] - before[0], last[1] - before[1]);
    let faced = false;
    while (t.scene.phase === "leave") {
      t.scene.frame(DT, inputs());
      if (t.scene.twin.x > before[0] + 0.01 && t.scene.phase === "leave") {
        expect(t.scene.twin.facing).toBeCloseTo(final, 9);
        faced = true;
      }
    }
    expect(faced).toBe(true);
  });
});

/** A room of plain groups: the twin's placement node and picture at its home, the dog's picture hidden at its home,
 *  the bicycle's node on the wall with its stand-in picture and a label, and a controller that records its calls. */
function room() {
  const root = new Object3D();
  const twinNode = new Object3D();
  twinNode.position.set(0.66, 0, 0.469);
  const twin = new Group();
  // Its picture faces glTF's +z; heading π (facing +z) is a yaw of 2π, so the identity turn.
  twinNode.add(twin);
  root.add(twinNode);
  const dog = new Group();
  dog.position.set(0.3, 0, 0.45);
  dog.rotation.set(0, Math.PI + Math.PI, 0);
  dog.visible = false;
  root.add(dog);
  const bicycle = new Object3D();
  bicycle.position.set(0.977, 1.49, 0.222);
  bicycle.rotation.set(0, -Math.PI / 2, Math.PI / 2);
  const standin = new Group();
  standin.name = "standin";
  const label = new Object3D();
  label.name = "label";
  bicycle.add(standin, label);
  root.add(bicycle);
  root.updateMatrixWorld(true);
  const calls = { wave: 0, strides: 0, dog: [] as string[], activity: [] as string[] };
  const avatars: DinoAvatars = {
    shows: () => true,
    pictureOf: (id) => (id === "twin" ? twin : id === "dog" ? dog : null),
    legsOf: () => ({}) as never,
    clipOf: (_a, role) => (role === "walk" || role === "idle" ? ({ duration: 1 } as never) : null),
    dogPlays: (role) => calls.dog.push(role),
    twinActivity: (a) => calls.activity.push(`${a.kind}:${"on" in a ? String(a.on) : ""}`),
    stride: () => void (calls.strides += 1),
    twinWave: () => void (calls.wave += 1),
  };
  return { root, twinNode, twin, dog, bicycle, standin, label, avatars, calls };
}

describe("the adapter: the pictures, the bicycle's carry, and the controller (FR-021, FR-023; R-B3)", () => {
  const MOTION = { animate: true, paused: false, level: 0, reduced: false };
  const told: string[] = [];
  function setup() {
    const r = room();
    const figures = createDinoFigures({
      leave: LEAVE,
      avatars: r.avatars,
      bicycle: r.bicycle,
      root: r.root,
      chosen: "dinosaur",
      handedOff: () => true,
      callSeconds: () => 1,
      call: () => told.push("call"),
      left: (who) => told.push(`left:${who}`),
    });
    return { ...r, figures };
  }
  const until = (s: ReturnType<typeof setup>, phase: string, max = 60 * 60): void => {
    for (let k = 0; k < max && s.figures.scene.phase !== phase; k += 1) s.figures.frame(DT, MOTION);
  };

  it("keeps the twin's placement's node and the bicycle's label where they were; moves only the pictures", () => {
    const s = setup();
    const node = s.twinNode.position.clone();
    const labelAt = s.label.getWorldPosition(new Vector3());
    until(s, "leave");
    for (let k = 0; k < 30; k += 1) s.figures.frame(DT, MOTION);
    expect(s.twinNode.position.equals(node)).toBe(true);
    expect(s.label.parent).toBe(s.bicycle);
    expect(s.label.getWorldPosition(new Vector3()).distanceTo(labelAt)).toBeLessThan(1e-9);
    expect(s.standin.parent).not.toBe(s.bicycle);
    expect(s.twin.getWorldPosition(new Vector3()).distanceTo(new Vector3(0.66, 0, 0.469))).toBeGreaterThan(0.05);
  });

  it("stands the bicycle at carry in the twin's picture's frame on every frame of the leave", () => {
    const s = setup();
    until(s, "leave");
    const yaw = new Quaternion();
    const at = new Vector3();
    const want = new Vector3();
    let frames = 0;
    while (s.figures.scene.phase === "leave") {
      s.figures.frame(DT, MOTION);
      if (s.figures.scene.phase !== "leave") break;
      s.root.updateMatrixWorld(true);
      s.twin.getWorldPosition(at);
      s.twin.getWorldQuaternion(yaw);
      want.set(...LEAVE.carry).applyQuaternion(yaw).add(at);
      expect(s.standin.getWorldPosition(new Vector3()).distanceTo(want)).toBeLessThan(1e-6);
      frames += 1;
    }
    expect(frames).toBeGreaterThan(10);
  });

  it("hides the three at the end, and tells the controller the wave once, the gait, and the dog's walk", () => {
    const s = setup();
    told.length = 0;
    until(s, "gone");
    expect(s.figures.scene.phase).toBe("gone");
    expect(s.twin.visible).toBe(false);
    expect(s.dog.visible).toBe(false);
    expect(s.standin.parent?.visible === false || s.standin.visible === false).toBe(true);
    expect(s.calls.wave).toBe(1);
    expect(s.calls.strides).toBeGreaterThan(10);
    expect(s.calls.dog).toContain("walk");
    expect(told).toEqual(["call", "left:both"]);
  });
});
