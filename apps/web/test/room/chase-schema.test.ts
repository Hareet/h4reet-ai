// T013 (spec 025; FR-005, FR-007, FR-008; plan.md R-09, §3; Q11): the scene's `figures.chase` block and the room's data.
// - `figures.chase` is optional: absent, the bundle carries none and the run takes CHASE_DEFAULTS (chase-steer.ts); a
//   block given in part takes the defaults for the rest, and the compositor carries it whole into `RoomScene.figures`.
// - FR-005: a `twin_run_mps` or `dog_run_mps` not above `walking.speed_mps` + `speed_margin_mps` is refused (RD3, at
//   the run speed's path), the dinosaur's speed being the visitor's walking speed.
// - The block's own ranges (RD3) and a key it doesn't define (RD2).
// - The shipped `scene.yaml` (Q11; a test over the data, not a build rule, R-09): its `figures.chase` is plan §3's
//   defaults; each home (the twin's placement's position, `figures.dog.home.at`) is at least `safe_m` from
//   `floor.start`; the dog's home is walkable on the chase floor and at least `separation_m` from the twin's.
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeOptions } from "../../build/room/compose";
import { readFile } from "../../build/room/load";
import { noPolicy } from "../../build/room/policy";
import { floorOfPart, isWalkable } from "../../src/room/compose/floor";
import { origin } from "../../src/room/compose/math";
import { resolveMounts } from "../../src/room/compose/mount";
import { CHASE_DEFAULTS, chaseFloor } from "../../src/room/scene/chase-steer";
import { repositoryBundle } from "../helpers/room";
import { SCENE } from "../helpers/room-avatars";
import { goodFiles, overlay } from "../helpers/room-fixtures";

type Doc = Record<string, unknown>;
const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const goodScene = (): Doc => parse(decoder.decode(goodFiles().get(SCENE))) as Doc;

/** The good fixture's scene with a chase block (none for null) and, where given, a walking speed. */
function sceneText(chase: unknown, speed?: number): string {
  const d = goodScene();
  const figures = { ...(d.figures as Doc | undefined) };
  if (chase === null) delete figures.chase;
  else figures.chase = JSON.parse(JSON.stringify(chase)) as unknown;
  d.figures = figures;
  if (speed !== undefined) d.walking = { ...(d.walking as Doc | undefined), speed_mps: speed };
  return stringify(d, { aliasDuplicateObjects: false });
}

/** The scene read whole: its value, or its problems as `<rule> <path>`. */
function judge(chase: unknown, speed?: number): { value: Doc; seen: string[] } {
  const read = readFile("scene", SCENE, encoder.encode(sceneText(chase, speed)));
  return { value: read.value as Doc, seen: read.problems.map((p) => `${p.rule} ${p.path}`) };
}
const chaseOf = (value: Doc): unknown => (value.figures as Doc | undefined)?.chase;

describe("the scene's figures.chase block (R-09)", () => {
  it("is optional: absent, the scene and the bundle carry none", () => {
    const read = judge(null);
    expect(read.seen).toEqual([]);
    expect(chaseOf(read.value)).toBeUndefined();
    const result = compose(overlay({ [SCENE]: sceneText(null) }), noPolicy(), STRICT);
    expect(result.findings.filter((f) => f.file === SCENE)).toEqual([]);
    expect(result.scene.figures.chase).toBeUndefined();
  });

  it("reads a full block whole, and fills a partial one with plan §3's defaults", () => {
    const full = { ...CHASE_DEFAULTS, flee_m: 0.9, clip_thresholds: { walk_mps: 0.2, run_mps: 1.2 } };
    const read = judge(full);
    expect(read.seen).toEqual([]);
    expect(chaseOf(read.value)).toEqual(full);
    const partial = judge({ safe_m: 0.5 });
    expect(partial.seen).toEqual([]);
    expect(chaseOf(partial.value)).toEqual({ ...CHASE_DEFAULTS, safe_m: 0.5 });
    expect(chaseOf(judge({}).value)).toEqual(CHASE_DEFAULTS);
  });

  it("carries the block, resolved, into the bundle's figures", () => {
    const result = compose(overlay({ [SCENE]: sceneText({ dog_run_mps: 2.4 }) }), noPolicy(), STRICT);
    expect(result.findings.filter((f) => f.file === SCENE)).toEqual([]);
    expect(result.scene.figures.chase).toEqual({ ...CHASE_DEFAULTS, dog_run_mps: 2.4 });
  });
});

describe("FR-005: the run speeds above the dinosaur's walking speed and the margin", () => {
  // The fixture's walking speed is the default, 1 m/s; with the margin's default 0.5, the floor is 1.5 m/s.
  it.each([
    ["twin_run_mps", { twin_run_mps: 1.5 }, undefined],
    ["dog_run_mps", { dog_run_mps: 1.5 }, undefined],
    ["twin_run_mps", { twin_run_mps: 1.4 }, undefined],
    ["twin_run_mps", { twin_run_mps: 2.0, speed_margin_mps: 1.0 }, undefined],
    ["dog_run_mps", { speed_margin_mps: 0.5 }, 2.0],
    ["twin_run_mps", {}, 1.6],
  ])("refuses %s not above walking.speed_mps + speed_margin_mps (%j at %s m/s)", (key, chase, speed) => {
    expect(judge(chase, speed).seen).toContain(`RD3 figures.chase.${key}`);
  });

  it("takes run speeds just above the line, with the walking speed and the margin given", () => {
    expect(judge({ twin_run_mps: 1.51, dog_run_mps: 1.51 }).seen).toEqual([]);
    expect(judge({ twin_run_mps: 2.4, dog_run_mps: 2.5, speed_margin_mps: 0.3 }, 2).seen).toEqual([]);
  });

  it("refuses the build over it: the compositor's findings carry the rule", () => {
    const result = compose(overlay({ [SCENE]: sceneText({ dog_run_mps: 1.2 }) }), noPolicy(), STRICT);
    expect(result.findings.map((f) => `${f.rule} ${f.file}:${f.path}`)).toContain(
      `RD3 ${SCENE}:figures.chase.dog_run_mps`,
    );
  });
});

describe("the block's ranges", () => {
  it.each([
    ["flee_end_delay_s", -1],
    ["flee_m", 0],
    ["safe_m", 0],
    ["separation_m", -0.1],
    ["speed_margin_mps", -0.1],
    ["turn_rate_rad_s", 0],
    ["lookahead_s", 0],
    ["headings", 3],
    ["headings", 16.5],
    ["headings", 65],
  ])("refuses %s %j (RD3)", (key, value) => {
    expect(judge({ [key]: value }).seen).toContain(`RD3 figures.chase.${key}`);
  });

  it("refuses clip thresholds whose walk isn't below its run (RD3)", () => {
    expect(judge({ clip_thresholds: { walk_mps: 1.5, run_mps: 1.5 } }).seen).toContain(
      "RD3 figures.chase.clip_thresholds",
    );
  });

  it("refuses a key the block doesn't define, and one the thresholds don't, with RD2", () => {
    expect(judge({ pace: 1 }).seen).toContain("RD2 figures.chase.pace");
    expect(judge({ clip_thresholds: { walk_mps: 0.3, run_mps: 1.5, trot_mps: 1 } }).seen).toContain(
      "RD2 figures.chase.clip_thresholds.trot_mps",
    );
  });
});

describe("the shipped scene.yaml's run data (Q11; plan §3, §3.1)", () => {
  const part = repositoryBundle().scene;
  const visitor = floorOfPart(part, part.walking.radius_m);
  if (!visitor) throw new Error("no floor");
  const chase = chaseFloor(visitor, part.figures.twin);
  const config = part.figures.chase;
  const twinAt = origin(resolveMounts(part.placements, part.pieces).world.get(part.figures.twin)!);
  const twin = { x: twinAt[0], z: twinAt[2] };
  const dogHome = part.figures.dog?.home.at;
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

  it("carries figures.chase at plan §3's defaults, and figures.dog", () => {
    expect(config).toEqual(CHASE_DEFAULTS);
    expect(dogHome).toBeDefined();
  });

  it("puts each home at least safe_m from floor.start", () => {
    const safe = (config ?? CHASE_DEFAULTS).safe_m;
    const dog = { x: dogHome![0], z: dogHome![1] };
    expect(dist(twin, visitor.start)).toBeGreaterThanOrEqual(safe);
    expect(dist(dog, visitor.start)).toBeGreaterThanOrEqual(safe);
  });

  it("puts the dog's home on the chase floor, at least separation_m from the twin's", () => {
    const dog = { x: dogHome![0], z: dogHome![1] };
    expect(isWalkable(chase, dog.x, dog.z)).toBe(true);
    expect(dist(dog, twin)).toBeGreaterThanOrEqual((config ?? CHASE_DEFAULTS).separation_m);
  });

  it("gives run speeds above the room's walking speed and margin (FR-005, on the shipped data)", () => {
    const c = config ?? CHASE_DEFAULTS;
    expect(c.twin_run_mps).toBeGreaterThan(part.walking.speed_mps + c.speed_margin_mps);
    expect(c.dog_run_mps).toBeGreaterThan(part.walking.speed_mps + c.speed_margin_mps);
  });
});
