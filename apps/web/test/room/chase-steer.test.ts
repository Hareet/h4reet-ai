// T001 (spec 025; FR-004 to FR-009, SC-001; plan.md R-02, R-03, §3.1): src/room/scene/chase-steer.ts, the run's
// steering, pure and on numbers alone.
// - First, the room's composed floors are printed (the visitor's and the chase floor: bounds, obstacles, start), for
//   plan §3.1.
// - Heading choice away from the dinosaur, the lookahead, a corner escaped, an obstacle slid, the dead band, standing
//   beyond `flee_m`; the turn rate bounds the facing and never the step (FR-009); the dog keeps `separation_m`.
// - FR-007's property in two clauses (Q11): an adversarial pursuer (straight at the nearer figure, and seeded random
//   turns), moved by spec 008's movement at the walking speed on the visitor's floor, from `floor.start` and from 200
//   seeded walkable points, with seeded jumps back to `floor.start` (a leave and a re-entry of the walking view). The
//   figures start at their homes; each start runs 600 frames, on the room's own floor and on three fake floors. Each
//   frame: (a) a figure under `safe_m` after a start or a jump never ends a frame closer than it ended the last, until
//   it reaches `safe_m`; (b) a figure at or above `safe_m` never falls below it; and none leaves the chase floor.
import { describe, expect, it } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { floorOfPart, isWalkable } from "../../src/room/compose/floor";
import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { origin } from "../../src/room/compose/math";
import { resolveMounts } from "../../src/room/compose/mount";
import {
  CHASE_DEFAULTS,
  DEAD_BAND_MPS,
  chaseFloor,
  createRunner,
  steer,
  turnToward,
} from "../../src/room/scene/chase-steer";
import type { ChaseConfig, Runner } from "../../src/room/scene/chase-steer";
import { headingOf, startPose, step } from "../../src/room/walk/movement";
import type { Pose } from "../../src/room/walk/movement";
import { repositoryBundle } from "../helpers/room";

const WALK = 1;
const DT = 1 / 60;
const FRAMES = 600;
const STARTS = 200;
const EPS = 1e-9;

/** A seeded generator, mulberry32: the same seed, the same run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fake floor: bounds, obstacles, and a start, its shell the bounds. */
function fakeFloor(bounds: FloorRect, obstacles: { id: string; rect: FloorRect }[], start: { x: number; z: number }) {
  const floor: WalkableFloor = { radius: 0.12, feetY: 0, height: 1.7, shell: bounds, bounds, obstacles, start };
  return floor;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Walkable points of a floor, seeded: rejection sampling inside its bounds. */
function walkablePoints(floor: WalkableFloor, n: number, seed: number): { x: number; z: number }[] {
  const r = rng(seed);
  const b = floor.bounds;
  const out: { x: number; z: number }[] = [];
  for (let tries = 0; out.length < n && tries < n * 1000; tries += 1) {
    const x = b.x0 + r() * (b.x1 - b.x0);
    const z = b.z0 + r() * (b.z1 - b.z0);
    if (isWalkable(floor, x, z)) out.push({ x, z });
  }
  return out;
}

interface Home {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

interface Violation {
  readonly start: number;
  readonly frame: number;
  readonly figure: "twin" | "dog";
  readonly clause: "a" | "b" | "floor";
  readonly was: number;
  readonly now: number;
}

/**
 * One start of FR-007's property: the pursuer from `from`, moved by spec 008's `step` at the walking speed on the
 * visitor's floor, straight at the nearer figure or, for seeded spells, at a seeded turn; a seeded jump to
 * `floor.start` now and then. The figures from their homes on the chase floor, the twin first, the dog keeping its
 * separation from the twin. Each frame's distances are checked against both clauses.
 */
function runStart(
  visitor: WalkableFloor,
  chase: WalkableFloor,
  homes: { twin: Home; dog: Home },
  config: ChaseConfig,
  from: { x: number; z: number },
  seed: number,
  start: number,
): { violations: Violation[]; least: number } {
  const r = rng(seed);
  let pose: Pose = { x: from.x, z: from.z, heading: 0, speed: 0, walking: false };
  const twin = createRunner(homes.twin.x, homes.twin.z, homes.twin.heading);
  const dog = createRunner(homes.dog.x, homes.dog.z, homes.dog.heading);
  const figures: [Runner, number, "twin" | "dog"][] = [
    [twin, config.twin_run_mps, "twin"],
    [dog, config.dog_run_mps, "dog"],
  ];
  const violations: Violation[] = [];
  let least = Infinity;
  let spell = 0;
  let spellYaw = 0;
  const ended = new Map<Runner, number>();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    let jumped = frame === 0;
    if (frame > 0 && r() < 1 / 240) {
      pose = startPose(visitor);
      jumped = true;
    } else if (frame > 0) {
      if (spell <= 0 && r() < 0.02) {
        spell = 0.3 + r();
        spellYaw = r() * 2 * Math.PI;
      }
      let yaw = spellYaw;
      if (spell > 0) spell -= DT;
      else {
        const target = dist(pose, twin) <= dist(pose, dog) ? twin : dog;
        yaw = headingOf(target.x - pose.x, target.z - pose.z);
      }
      pose = step(visitor, pose, { forward: 1, right: 0 }, yaw, DT, WALK);
    }
    const dino = { x: pose.x, z: pose.z };
    for (const [figure, run, name] of figures) {
      // A start or a jump begins clause (a): the reference is where the figure stood, measured to where the dinosaur is.
      const before = jumped ? dist(figure, dino) : (ended.get(figure) ?? dist(figure, dino));
      if (jumped) figure.last = Number.NaN;
      steer(chase, figure, run, dino, config, WALK, DT, name === "dog" ? twin : null);
      const now = dist(figure, dino);
      least = Math.min(least, now);
      const was = ended.get(figure);
      if (!isWalkable(chase, figure.x, figure.z))
        violations.push({ start, frame, figure: name, clause: "floor", was: before, now });
      if (jumped || was === undefined) {
        if (now < Math.min(config.safe_m, before) - EPS)
          violations.push({ start, frame, figure: name, clause: "a", was: before, now });
      } else if (was < config.safe_m) {
        if (now < was - EPS) violations.push({ start, frame, figure: name, clause: "a", was, now });
      } else if (now < config.safe_m - EPS) violations.push({ start, frame, figure: name, clause: "b", was, now });
      ended.set(figure, now);
    }
  }
  return { violations, least };
}

/** FR-007's property over `floor.start` and the seeded starts: every violation, and the least distance kept. */
function property(
  visitor: WalkableFloor,
  chase: WalkableFloor,
  homes: { twin: Home; dog: Home },
  config: ChaseConfig,
  seed: number,
): { violations: Violation[]; least: number; starts: number } {
  const starts = [visitor.start, ...walkablePoints(visitor, STARTS, seed)];
  const violations: Violation[] = [];
  let least = Infinity;
  starts.forEach((from, i) => {
    const run = runStart(visitor, chase, homes, config, from, seed * 7919 + i, i);
    violations.push(...run.violations);
    least = Math.min(least, run.least);
  });
  return { violations, least, starts: starts.length };
}

/** The room's homes: the twin's placement's position, and the dog's from `figures.dog` (plan §3's estimate where the
 *  scene has none yet), each facing as its home turns it. */
function roomHomes(part: RoomScene): { twin: Home; dog: Home } {
  const { world } = resolveMounts(part.placements, part.pieces);
  const m = world.get(part.figures.twin);
  if (!m) throw new Error("no twin");
  const at = origin(m);
  const dog = (part.figures as { dog?: { home: { at: [number, number]; heading_deg: number } } }).dog?.home ?? {
    at: [0.3, 0.45] as [number, number],
    heading_deg: 0,
  };
  return {
    twin: { x: at[0], z: at[2], heading: 0 },
    dog: { x: dog.at[0], z: dog.at[1], heading: (dog.heading_deg * Math.PI) / 180 },
  };
}

const OPEN: FloorRect = { x0: -2, x1: 2, z0: -2, z1: 2 };

describe("the room's composed floors, printed for plan §3.1 (T001)", () => {
  it("prints the visitor's floor and the chase floor: bounds, obstacles, and start", () => {
    const part = repositoryBundle().scene;
    const visitor = floorOfPart(part, part.walking.radius_m);
    if (!visitor) throw new Error("no floor");
    const chase = chaseFloor(visitor, part.figures.twin);
    const r3 = (v: number): number => Math.round(v * 1000) / 1000;
    const rect = (q: FloorRect): string => `x [${r3(q.x0)}, ${r3(q.x1)}], z [${r3(q.z0)}, ${r3(q.z1)}]`;
    const lines = [
      `visitor floor: bounds ${rect(visitor.bounds)}; start (${r3(visitor.start.x)}, ${r3(visitor.start.z)})`,
      ...visitor.obstacles.map((o) => `  obstacle ${o.id}: ${rect(o.rect)}`),
      `chase floor: bounds ${rect(chase.bounds)}; ${chase.obstacles.length} obstacles (the visitor's less ${part.figures.twin})`,
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
    expect(chase.obstacles.map((o) => o.id)).toEqual(
      visitor.obstacles.filter((o) => o.id !== part.figures.twin).map((o) => o.id),
    );
    expect(chase.bounds).toEqual(visitor.bounds);
    expect(chase.start).toEqual(visitor.start);
  });
});

describe("steering (FR-004, FR-006, FR-009; R-02)", () => {
  const floor = fakeFloor(OPEN, [], { x: 0, z: 1.8 });

  it("runs straight away from the dinosaur at its run speed within flee_m", () => {
    const fig = createRunner(0, 0, 0);
    steer(floor, fig, 2, { x: 0, z: 0.5 }, CHASE_DEFAULTS, WALK, DT, null);
    expect(fig.z).toBeLessThan(0);
    expect(Math.abs(fig.x)).toBeLessThan(1e-9);
    expect(fig.speed).toBeCloseTo(2, 6);
    expect(fig.heading).toBeCloseTo(headingOf(0, -1), 9);
  });

  it("stands beyond flee_m, its facing turning toward the dinosaur", () => {
    const fig = createRunner(0, 0, 0);
    steer(floor, fig, 2, { x: 1.5, z: 0 }, CHASE_DEFAULTS, WALK, 1, null);
    expect([fig.x, fig.z, fig.speed]).toEqual([0, 0, 0]);
    expect(fig.facing).toBeCloseTo(headingOf(1, 0), 9);
  });

  it("is deterministic: the same inputs, the same step", () => {
    const a = createRunner(0.3, -0.2, 1);
    const b = createRunner(0.3, -0.2, 1);
    steer(floor, a, 2, { x: 0.1, z: 0.1 }, CHASE_DEFAULTS, WALK, DT, null);
    steer(floor, b, 2, { x: 0.1, z: 0.1 }, CHASE_DEFAULTS, WALK, DT, null);
    expect(a).toEqual(b);
  });

  it("slides along an obstacle in its way, never into it", () => {
    const wall = fakeFloor(OPEN, [{ id: "wall", rect: { x0: -1, x1: 1, z0: -0.5, z1: -0.3 } }], { x: 0, z: 1.8 });
    const fig = createRunner(0.05, -0.29, 0);
    for (let i = 0; i < 30; i += 1) {
      steer(wall, fig, 2, { x: 0.05, z: 0.2 }, CHASE_DEFAULTS, WALK, DT, null);
      expect(isWalkable(wall, fig.x, fig.z)).toBe(true);
    }
    expect(Math.abs(fig.x - 0.05)).toBeGreaterThan(0.2);
  });

  it("escapes a corner the dinosaur can enter, along the edge, rather than into it", () => {
    const fig = createRunner(1.5, 1.5, 0);
    for (let i = 0; i < 60; i += 1) steer(floor, fig, 2, { x: 0.9, z: 0.9 }, CHASE_DEFAULTS, WALK, DT, null);
    const toCorner = Math.hypot(OPEN.x1 - fig.x, OPEN.z1 - fig.z);
    expect(toCorner).toBeGreaterThan(0.2);
  });

  it("escapes a corner the dinosaur can enter, along the edge and around it, never pinned", () => {
    // The dinosaur comes straight at the figure, which stands near the floor's corner; it never falls under safe_m and
    // ends the walk away from the corner.
    const fig = createRunner(1.5, 1.5, 0);
    let pose: Pose = { x: 0.9, z: 0.9, heading: 0, speed: 0, walking: false };
    let least = Infinity;
    for (let i = 0; i < 300; i += 1) {
      pose = step(floor, pose, { forward: 1, right: 0 }, headingOf(fig.x - pose.x, fig.z - pose.z), DT, WALK);
      steer(floor, fig, 2, pose, CHASE_DEFAULTS, WALK, DT, null);
      least = Math.min(least, dist(fig, pose));
    }
    expect(least).toBeGreaterThanOrEqual(CHASE_DEFAULTS.safe_m);
    expect(Math.hypot(OPEN.x1 - fig.x, OPEN.z1 - fig.z)).toBeGreaterThan(0.2);
  });

  it("keeps the dead band: pressed into a wall it can't leave, it stands still, no jitter", () => {
    // A pocket three walls close: the dinosaur at its mouth, the figure at its end. Its corner is 8 mm farther than the
    // end's middle, so the figure walks there (8 frames, T002) and then stands: from frame 10 on, one position.
    const pocket = fakeFloor({ x0: 0, x1: 0.6, z0: 0, z1: 0.2 }, [], { x: 0, z: 0.1 });
    const fig = createRunner(0.6, 0.1, 0);
    const xs: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      steer(pocket, fig, 2, { x: 0, z: 0.1 }, CHASE_DEFAULTS, WALK, DT, null);
      xs.push(fig.x, fig.z);
    }
    expect(new Set(xs.slice(20)).size).toBeLessThanOrEqual(2);
    expect(fig.speed).toBeLessThanOrEqual(DEAD_BAND_MPS);
  });

  it("bounds the facing by the turn rate, never the step (FR-009)", () => {
    // Facing the dinosaur, it reverses at once in its step; its picture turns at most turn_rate × dt a frame.
    const fig = createRunner(0, 0, headingOf(0, 1));
    steer(floor, fig, 2, { x: 0, z: 0.3 }, CHASE_DEFAULTS, WALK, DT, null);
    expect(fig.z).toBeCloseTo(-2 * DT, 9);
    expect(fig.heading).toBeCloseTo(headingOf(0, -1), 9);
    expect(Math.abs(fig.facing - headingOf(0, 1))).toBeCloseTo(CHASE_DEFAULTS.turn_rate_rad_s * DT, 9);
    // Within 0.4 s it faces the way it runs.
    for (let i = 0; i < 24; i += 1) steer(floor, fig, 2, { x: fig.x, z: fig.z + 0.3 }, CHASE_DEFAULTS, WALK, DT, null);
    expect(Math.abs(Math.atan2(Math.sin(fig.facing - fig.heading), Math.cos(fig.facing - fig.heading)))).toBeLessThan(
      1e-9,
    );
  });

  it("turnToward takes the short way round and stops at the target", () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1, 9);
    expect(turnToward(0, 0.05, 0.1)).toBe(0.05);
  });
});

describe("separation (FR-008)", () => {
  const floor = fakeFloor(OPEN, [], { x: 0, z: 1.8 });

  it("the dog yields to keep separation_m from the twin, where FR-007 lets it", () => {
    const twin = createRunner(0, 0, 0);
    const dog = createRunner(0.05, 0, 0);
    for (let i = 0; i < 40; i += 1) {
      const dino = { x: 0.02, z: 0.6 };
      steer(floor, twin, 2, dino, CHASE_DEFAULTS, WALK, DT, null);
      steer(floor, dog, 2.5, dino, CHASE_DEFAULTS, WALK, DT, twin);
    }
    expect(dist(twin, dog)).toBeGreaterThanOrEqual(CHASE_DEFAULTS.separation_m - 1e-9);
  });
});

describe("FR-007's property: never caught, two clauses (SC-001, Q11)", () => {
  it("holds on the room's own floor, from floor.start, 200 seeded starts, and seeded jumps", () => {
    const part = repositoryBundle().scene;
    const visitor = floorOfPart(part, part.walking.radius_m);
    if (!visitor) throw new Error("no floor");
    const chase = chaseFloor(visitor, part.figures.twin);
    const homes = roomHomes(part);
    const result = property(visitor, chase, homes, CHASE_DEFAULTS, 25);
    process.stdout.write(
      `room floor: ${result.starts} starts × ${FRAMES} frames, least distance kept ${result.least.toFixed(3)} m, ${result.violations.length} violations\n`,
    );
    expect(result.violations.slice(0, 5)).toEqual([]);
  }, 300_000);

  const fakes: [string, WalkableFloor, { twin: Home; dog: Home }][] = [
    [
      "an open floor",
      fakeFloor(OPEN, [], { x: -1.5, z: 1.5 }),
      { twin: { x: 0.5, z: -0.5, heading: 0 }, dog: { x: 0.9, z: -0.5, heading: 0 } },
    ],
    [
      "a floor with the figures near its corner",
      fakeFloor(OPEN, [], { x: -1.5, z: 1.5 }),
      { twin: { x: 1.4, z: -1.4, heading: 0 }, dog: { x: 1.0, z: -1.4, heading: 0 } },
    ],
    [
      "a floor with an obstacle between them and the start",
      fakeFloor(OPEN, [{ id: "block", rect: { x0: -0.6, x1: 0.6, z0: -0.3, z1: 0.3 } }], { x: 0, z: 1.5 }),
      { twin: { x: -0.3, z: -0.9, heading: 0 }, dog: { x: 0.3, z: -0.9, heading: 0 } },
    ],
  ];
  for (const [name, floor, homes] of fakes)
    it(`holds on ${name}`, () => {
      const result = property(floor, floor, homes, CHASE_DEFAULTS, 11);
      expect(result.violations.slice(0, 5)).toEqual([]);
    }, 300_000);
});
