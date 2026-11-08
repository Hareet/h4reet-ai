// T028 (spec 008; FR-025, FR-026, FR-028, FR-032, SC-003; plan.md R-03): src/room/walk/movement.ts, the figure's steps.
// - Seeded walks of 10,000 steps on the default scene's floor and on three data copies with the desk, the twin, and the
//   snowboard moved (floor.test.ts's copies): random camera-relative input, random camera yaw, and random frame
//   times, slow frames of up to 400 ms among them; the footprint's centre never leaves the walkable floor.
// - A blocked diagonal slides along what blocks it; a slow frame doesn't tunnel through a thin obstacle.
// - Movement is relative to the camera's yaw: forward is away from the camera, along the floor; the figure faces the
//   way it walks, at the walking speed, from the first frame after input begins, and stops on the first frame after it
//   ends.
// - Walk-to (a floor tap) walks toward its goal at the walking speed, sliding, and stops when it arrives, or after
//   0.5 s without progress; another input takes over (walking.test.ts holds that in the orchestrator).
// The synthetic floors take fx- IDs.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import { floorOfPart, isWalkable } from "../../src/room/compose/floor";
import type { WalkableFloor } from "../../src/room/compose/floor";
import { ARRIVE_M, STALL_S, STEP_S, startPose, step, walkTo } from "../../src/room/walk/movement";
import type { Pose, WalkTo } from "../../src/room/walk/movement";
import { REPO, repositoryBundle } from "../helpers/room";

/** mulberry32: a small seeded generator, so each walk is the same walk every run. */
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

const SPEED = 1.0;
const DEG = Math.PI / 180;

/** A floor of the test's own: a 4 × 3 room, a radius of 0.1, and one thin wall-like obstacle across its middle. */
function synthetic(): WalkableFloor {
  return {
    radius: 0.1,
    feetY: 0,
    height: 1.7,
    shell: { x0: -2, x1: 2, z0: -1.5, z1: 1.5 },
    bounds: { x0: -1.9, x1: 1.9, z0: -1.4, z1: 1.45 },
    obstacles: [{ id: "fx-wall", rect: { x0: -1, x1: 1, z0: -0.02, z1: 0.02 } }],
    start: { x: 0, z: 1 },
  };
}

const encoder = new TextEncoder();
const SCENE = "apps/web/room/scene.yaml";
type Doc = { placements: { id: string; role?: string; mount?: { on: string; offset?: number[] } }[] };

/** The default scene's floor, and three data copies' floors with a piece moved 5 cm left, found by structure. */
function floors(): { name: string; floor: WalkableFloor }[] {
  const base = repositoryBundle();
  const out = [
    { name: "the default scene", floor: floorOfPart(base.scene, base.scene.walking.radius_m) as WalkableFloor },
  ];
  const doc0 = parse(readFileSync(join(REPO, SCENE), "utf8")) as Doc;
  const root = doc0.placements.find((p) => !p.mount)?.id;
  const counts = new Map<string, number>();
  for (const p of doc0.placements)
    if (p.mount && p.mount.on !== root) counts.set(p.mount.on, (counts.get(p.mount.on) ?? 0) + 1);
  const hub = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const twin = doc0.placements.find((p) => p.role === "twin")?.id ?? "";
  const board =
    base.index.selectables
      .filter((s) => s.side_wall)
      .flatMap((s) => s.members)
      .find((m) => (base.scene.placements.find((p) => p.id === m)?.frame_box.min[1] ?? 1) <= 1e-6) ?? "";
  for (const [name, id] of [
    ["the hub moved", hub],
    ["the twin moved", twin],
    ["the standing board moved", board],
  ] as const) {
    const doc = parse(readFileSync(join(REPO, SCENE), "utf8")) as Doc;
    const p = doc.placements.find((x) => x.id === id);
    if (!p?.mount) throw new Error(`${name}: no mount`);
    p.mount.offset = (p.mount.offset ?? [0, 0, 0]).map((v, i) => (i === 0 ? Math.round((v - 0.05) * 1e4) / 1e4 : v));
    const tree = overlayTree(fileTree(REPO), new Map([[SCENE, encoder.encode(stringify(doc, { lineWidth: 0 }))]]));
    const result = compose(tree, readRoomPolicy({ env: process.env, root: REPO }), { mode: "lenient", drafts: false });
    out.push({ name, floor: floorOfPart(result.scene, result.scene.walking.radius_m) as WalkableFloor });
  }
  return out;
}

describe("seeded walks of 10,000 steps (SC-003)", () => {
  it.each(floors().map((f, i) => [f.name, f.floor, i] as const))(
    "never leave the walkable floor or enter an obstacle, on %s",
    (_, floor, i) => {
      const random = seeded(2026_11_07 + i);
      let pose: Pose = startPose(floor);
      expect(isWalkable(floor, pose.x, pose.z)).toBe(true);
      let moved = 0;
      for (let k = 0; k < 10_000; k += 1) {
        const move = { forward: random() * 2 - 1, right: random() * 2 - 1 };
        const yaw = (random() * 2 - 1) * 60 * DEG;
        // Mostly a frame's time, sometimes a slow frame, up to 400 ms.
        const dt = random() < 0.05 ? random() * 0.4 : random() * 0.034;
        const next = step(floor, pose, move, yaw, dt, SPEED);
        if (!isWalkable(floor, next.x, next.z)) throw new Error(`step ${k}: off the floor at ${next.x}, ${next.z}`);
        moved += Math.hypot(next.x - pose.x, next.z - pose.z);
        pose = next;
      }
      // It went somewhere: the walk isn't stuck at its start.
      expect(moved).toBeGreaterThan(1);
    },
  );
});

describe("a step (FR-025, FR-026, FR-028; R-03)", () => {
  const floor = synthetic();

  it("walks away from the camera at the walking speed, facing the way it walks, along the floor", () => {
    const pose = { ...startPose(floor), x: 0, z: 1 };
    const ahead = step(floor, pose, { forward: 1, right: 0 }, 0, 0.1, SPEED);
    expect(ahead.x).toBeCloseTo(0, 12);
    expect(ahead.z).toBeCloseTo(0.9, 12);
    expect(ahead.heading).toBeCloseTo(0, 12);
    expect(ahead.walking).toBe(true);
    expect(ahead.speed).toBeCloseTo(SPEED, 9);
    // The camera turned a quarter: forward is −x, the figure facing it.
    const turned = step(floor, pose, { forward: 1, right: 0 }, 90 * DEG, 0.1, SPEED);
    expect(turned.x).toBeCloseTo(-0.1, 12);
    expect(turned.z).toBeCloseTo(1, 12);
    expect(turned.heading).toBeCloseTo(90 * DEG, 12);
    // Right, with the camera straight on, is +x; a diagonal walks at the walking speed, not faster.
    const right = step(floor, pose, { forward: 0, right: 1 }, 0, 0.1, SPEED);
    expect(right.x).toBeCloseTo(0.1, 12);
    const diagonal = step(floor, pose, { forward: 1, right: 1 }, 0, 0.1, SPEED);
    expect(Math.hypot(diagonal.x - pose.x, diagonal.z - pose.z)).toBeCloseTo(0.1, 12);
  });

  it("starts on the first step after input begins and stops on the first after it ends, keeping its heading", () => {
    const pose = { ...startPose(floor), x: 0.5, z: 1 };
    const walking = step(floor, pose, { forward: 0, right: -1 }, 0, 1 / 60, SPEED);
    expect(walking.walking).toBe(true);
    expect(walking.x).toBeLessThan(0.5);
    const still = step(floor, walking, { forward: 0, right: 0 }, 0, 1 / 60, SPEED);
    expect(still.walking).toBe(false);
    expect(still.speed).toBe(0);
    expect([still.x, still.z]).toEqual([walking.x, walking.z]);
    expect(still.heading).toBe(walking.heading);
  });

  it("slides along an obstacle a diagonal move meets, and never passes through it", () => {
    // Just above the thin wall, walking diagonally into it: x goes on, z stops at the wall's grown edge.
    const pose = { ...startPose(floor), x: 0, z: 0.05 };
    const next = step(floor, pose, { forward: 1, right: 1 }, 0, 0.2, SPEED);
    expect(next.z).toBeCloseTo(0.02, 12);
    expect(next.x).toBeGreaterThan(0.1);
    expect(isWalkable(floor, next.x, next.z)).toBe(true);
  });

  it("cuts a slow frame into steps of at most 50 ms, and still never tunnels through a thin obstacle", () => {
    expect(STEP_S).toBe(0.05);
    const pose = { ...startPose(floor), x: 0, z: 1 };
    const next = step(floor, pose, { forward: 1, right: 0 }, 0, 2, SPEED);
    expect(next.z).toBeCloseTo(0.02, 12);
    expect(isWalkable(floor, next.x, next.z)).toBe(true);
  });

  it("holds at the floor's bounds and slides along them", () => {
    const pose = { ...startPose(floor), x: 1.85, z: 1 };
    const next = step(floor, pose, { forward: 1, right: 1 }, 0, 0.2, SPEED);
    expect(next.x).toBeCloseTo(1.9, 12);
    expect(next.z).toBeLessThan(1);
  });

  it("stands where the scene places it at the start, facing into the room, still", () => {
    expect(startPose(floor)).toEqual({ x: 0, z: 1, heading: 0, speed: 0, walking: false });
  });
});

describe("walk-to, a floor tap (FR-032)", () => {
  const floor = synthetic();
  const run = (
    pose: Pose,
    goal: { x: number; z: number },
    dt = 1 / 60,
    limit = 10_000,
  ): { pose: Pose; frames: number; at: number[] } => {
    let walk: WalkTo | null = { goal, best: Infinity, since: 0 };
    let p = pose;
    let frames = 0;
    const at: number[] = [];
    while (walk && frames < limit) {
      const out = walkTo(floor, p, walk, dt, SPEED);
      p = out.pose;
      walk = out.walk;
      frames += 1;
      at.push(Math.hypot(goal.x - p.x, goal.z - p.z));
    }
    return { pose: p, frames, at };
  };

  it("walks straight to a reachable goal at the walking speed and stops there", () => {
    const start = { ...startPose(floor), x: -1, z: 1 };
    const { pose, frames } = run(start, { x: 1, z: 0.5 });
    expect(Math.hypot(1 - pose.x, 0.5 - pose.z)).toBeLessThanOrEqual(ARRIVE_M);
    expect(pose.walking).toBe(false);
    // About its length's worth of time at 1 m/s, at 60 frames a second.
    const length = Math.hypot(2, 0.5);
    expect(frames).toBeGreaterThanOrEqual(Math.floor(length * 60) - 1);
    expect(frames).toBeLessThanOrEqual(Math.ceil(length * 60) + 2);
  });

  it("slides along what's in the way, and stops within 0.5 s once it makes no progress", () => {
    expect(STALL_S).toBe(0.5);
    // A goal behind the thin wall: it walks to the wall, slides as far as it brings it nearer, then stops.
    const start = { ...startPose(floor), x: 0, z: 1 };
    const { pose, frames, at } = run(start, { x: 0, z: -1 });
    expect(isWalkable(floor, pose.x, pose.z)).toBe(true);
    expect(pose.walking).toBe(false);
    // Its last progress came at some frame; it stopped within 0.5 s of it.
    const best = Math.min(...at);
    const lastProgress = at.findIndex((d) => d <= best + 1e-6);
    expect((frames - 1 - lastProgress) / 60).toBeLessThanOrEqual(0.5 + 1 / 60);
    expect(frames).toBeLessThan(10_000);
  });

  it("faces its goal as it walks", () => {
    const start = { ...startPose(floor), x: 0, z: 1 };
    const out = walkTo(floor, start, { goal: { x: -1, z: 1 }, best: Infinity, since: 0 }, 0.1, SPEED);
    expect(out.pose.heading).toBeCloseTo(90 * DEG, 12);
    expect(out.pose.walking).toBe(true);
  });
});
