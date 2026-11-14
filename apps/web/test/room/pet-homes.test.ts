// T012 (spec 026; plan.md R-08, R-09, §3): the scene's `figures.pet` block, `selectables[].figure`, and the shipped
// data.
// - `figures.pet` is optional: absent, the bundle carries none and the director takes PET_DEFAULTS; a partial block
//   takes the defaults for the rest; the compositor carries it whole into `RoomScene.figures`.
// - Its ranges (RD3), a key it doesn't define (RD2), and R-08's refine: a `reach_m` below `figures.chase.separation_m`
//   (or its default where the scene has no chase block) is refused, since no dog's home could then be in reach.
// - `selectables[].figure`: `dog`, the one value allowed now; any other refused; the bundle carries it.
// - The shipped `scene.yaml`: `figures.pet` at plan §3's defaults, `figures.twin.clips.petting: petting`, no `dog`
//   selectable (FR-016: it is the human patch's), and the dog's home (`figures.dog.home.at`, spec 025's, moved by
//   impl-025's T011) within `reach_m` of the twin's; the aim's heading and side printed for his look.
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeOptions } from "../../build/room/compose";
import { readFile } from "../../build/room/load";
import { noPolicy } from "../../build/room/policy";
import { origin } from "../../src/room/compose/math";
import { resolveMounts } from "../../src/room/compose/mount";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";
import { PET_DEFAULTS, inReach, petAim } from "../../src/room/scene/pet";
import { repositoryBundle } from "../helpers/room";
import { SCENE } from "../helpers/room-avatars";
import { goodFiles, overlay } from "../helpers/room-fixtures";

type Doc = Record<string, unknown>;
const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const goodScene = (): Doc => parse(decoder.decode(goodFiles().get(SCENE))) as Doc;

/** The good fixture's scene with `figures` keys set (undefined deletes one) and, where given, a selectable added. */
function sceneText(figures: Doc, selectable?: Doc): string {
  const d = goodScene();
  const f: Doc = { ...(d.figures as Doc | undefined) };
  for (const [k, v] of Object.entries(figures)) {
    if (v === undefined) delete f[k];
    else f[k] = JSON.parse(JSON.stringify(v)) as unknown;
  }
  d.figures = f;
  if (selectable) d.selectables = [...((d.selectables as Doc[] | undefined) ?? []), selectable];
  return stringify(d, { aliasDuplicateObjects: false });
}

function judge(figures: Doc, selectable?: Doc): { value: Doc; seen: string[] } {
  const read = readFile("scene", SCENE, encoder.encode(sceneText(figures, selectable)));
  return { value: read.value as Doc, seen: read.problems.map((p) => `${p.rule} ${p.path}`) };
}
const petOf = (value: Doc): unknown => (value.figures as Doc | undefined)?.pet;

describe("the scene's figures.pet block (plan §3; R-08)", () => {
  it("is optional: absent, the scene and the bundle carry none", () => {
    const read = judge({ pet: undefined });
    expect(read.seen).toEqual([]);
    expect(petOf(read.value)).toBeUndefined();
    const result = compose(overlay({ [SCENE]: sceneText({ pet: undefined }) }), noPolicy(), STRICT);
    expect(result.findings.filter((f) => f.file === SCENE)).toEqual([]);
    expect(result.scene.figures.pet).toBeUndefined();
  });

  it("reads a full block whole, and fills a partial one with plan §3's defaults", () => {
    const full = { ...PET_DEFAULTS, reach_m: 0.6, stroke_n: 2 };
    const read = judge({ pet: full });
    expect(read.seen).toEqual([]);
    expect(petOf(read.value)).toEqual(full);
    const part = judge({ pet: { cooldown_s: 30 } });
    expect(part.seen).toEqual([]);
    expect(petOf(part.value)).toEqual({ ...PET_DEFAULTS, cooldown_s: 30 });
    const result = compose(overlay({ [SCENE]: sceneText({ pet: { cooldown_s: 30 } }) }), noPolicy(), STRICT);
    expect(result.findings.filter((f) => f.file === SCENE)).toEqual([]);
    expect(result.scene.figures.pet).toEqual({ ...PET_DEFAULTS, cooldown_s: 30 });
  });

  it.each([
    ["reach_m", 0],
    ["reach_m", 2.5],
    ["cooldown_s", -1],
    ["cooldown_s", 700],
    ["turn_max_deg", -1],
    ["turn_max_deg", 91],
    ["crouch_max_m", -0.1],
    ["crouch_max_m", 0.7],
    ["lean_max_deg", 76],
    ["stroke_m", -0.01],
    ["stroke_m", 0.31],
    ["stroke_n", 0],
    ["stroke_n", 2.5],
    ["stroke_n", 11],
    ["pet_s", 0.4],
    ["pet_s", 31],
    ["elbow_deg", 181],
  ])("refuses %s %s (RD3)", (key, value) => {
    expect(judge({ pet: { [key]: value } }).seen).toEqual([`RD3 figures.pet.${key}`]);
  });

  it("refuses a key it doesn't define (RD2)", () => {
    expect(judge({ pet: { walk_mps: 0.5 } }).seen).toEqual(["RD2 figures.pet.walk_mps"]);
  });

  it("refuses a reach_m below figures.chase.separation_m, or its default without a chase block (R-08)", () => {
    expect(judge({ pet: { reach_m: 0.25 }, chase: { separation_m: 0.3 } }).seen).toEqual(["RD3 figures.pet.reach_m"]);
    expect(judge({ pet: { reach_m: 0.3 }, chase: { separation_m: 0.3 } }).seen).toEqual([]);
    expect(judge({ pet: { reach_m: 0.4 }, chase: { separation_m: 0.45 } }).seen).toEqual([
      "RD3 figures.pet.reach_m",
    ]);
    expect(judge({ pet: { reach_m: CHASE_DEFAULTS.separation_m - 0.01 }, chase: undefined }).seen).toEqual([
      "RD3 figures.pet.reach_m",
    ]);
  });
});

describe("a selectable's figure (R-09)", () => {
  const dog = (figure: unknown): Doc => ({
    id: "dog",
    name: "Dog",
    members: ["fx-desk"],
    figure,
    action: { talk: { topic: "hobbies-and-travel", lead: "The dog first." } },
  });

  it("takes dog, the one value allowed now", () => {
    expect(judge({}, dog("dog")).seen).toEqual([]);
  });

  it.each(["twin", "visitor", "cat", 3])("refuses %s (RD3)", (figure) => {
    const seen = judge({}, dog(figure)).seen;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^RD3 selectables\[\d+\]\.figure$/);
  });
});

describe("the shipped scene.yaml's petting data (plan §3; R-08)", () => {
  const part = repositoryBundle().scene;
  const twinWorld = resolveMounts(part.placements, part.pieces).world.get(part.figures.twin);
  if (!twinWorld) throw new Error("no twin placement");
  const twinAt = origin(twinWorld);
  // The placement's world turn about y, spec 008's heading (the figure faces glTF's +z: its turn − π).
  const heading = Math.atan2(twinWorld[8], twinWorld[10]) - Math.PI;
  const twin = { x: twinAt[0], z: twinAt[2], heading };
  const dogHome = part.figures.dog?.home.at;
  const config = part.figures.pet;

  it("carries figures.pet at plan §3's defaults, and the twin's petting clip in its map", () => {
    expect(config).toEqual(PET_DEFAULTS);
    expect(part.twin?.block.clips.petting).toBe("petting");
  });

  it("has no dog selectable: its line is the human patch's (FR-016)", () => {
    expect(part.selectables.map((s) => s.id)).not.toContain("dog");
    expect(part.selectables.filter((s) => s.figure !== undefined)).toEqual([]);
  });

  it("puts the dog's home within reach_m of the twin's, and prints the aim for his look", () => {
    if (!dogHome) throw new Error("no figures.dog");
    const dog = { x: dogHome[0], z: dogHome[1] };
    const d = Math.hypot(dog.x - twin.x, dog.z - twin.z);
    const reach = (config ?? PET_DEFAULTS).reach_m;
    expect(inReach(twin, dog, reach)).toBe(true);
    expect(d).toBeLessThanOrEqual(reach);
    const aim = petAim(twin, dog, config ?? PET_DEFAULTS);
    const deg = (r: number): string => ((r * 180) / Math.PI).toFixed(1);
    const off = Math.atan2(Math.sin(aim.heading - twin.heading), Math.cos(aim.heading - twin.heading));
    console.log(
      `pet-homes: the twin's home (${twin.x.toFixed(3)}, ${twin.z.toFixed(3)}), heading ${deg(twin.heading)}°; ` +
        `the dog's home (${dog.x}, ${dog.z}), ${d.toFixed(3)} m away (reach_m ${reach}); ` +
        `the aim ${deg(aim.heading)}°, ${deg(off)}° from home (turn_max_deg ${(config ?? PET_DEFAULTS).turn_max_deg}), ` +
        `the ${aim.side} arm`,
    );
    expect(Math.abs(off)).toBeLessThanOrEqual(((config ?? PET_DEFAULTS).turn_max_deg * Math.PI) / 180 + 1e-9);
  });
});
