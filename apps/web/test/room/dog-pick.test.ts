// T013a (spec 026; FR-014, M4; plan.md R-09; the page's Q160): the room's dog figure as a front-only pick target of
// the `dog` selectable, and RG6 measuring it at its home.
// - `dogBoxAt` (compose/dog-box.ts): the dog's box at its home from `figures.dog` and AVATAR_SHAPES.dog, as the
//   axis-aligned bounds of the box turned by `heading_deg`, every turned corner inside them.
// - compose/pick.ts: `front` rectangles stay out of the union and the core; `pick`'s first rule takes them as members
//   (the dog only where its rectangle is the frontmost under the point); `pickProblems` refuses another's core over
//   one ("member") and nothing else for it.
// - Over a grid on the scene's real selectables (snowboard, bicycle, laptop, chalkboard) plus the `dog` piece (the
//   sign, with the dog's front), and no twin pick area (the twin has none): every point picks what it picks without
//   the dog's rectangle, except where that rectangle is the frontmost member under it.
// - bundle3d.ts's picker skips the rectangle while `pickable("dog")` is false.
// - RG6 (`pickSweep`): its inputs gain only the dog piece's `front`; the dog's rectangle is non-null at every swept
//   stage; another core over it is refused.
// The `dog` selectable is added in memory only, never in scene.yaml (FR-016).
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeOptions, ComposeResult } from "../../build/room/compose";
import { createContext } from "../../build/room/checks/family";
import { loadRoom } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import { figureFronts, geometryOf, pickSweep, sweptStages } from "../../build/room/checks/rg";
import { fileTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { AVATAR_SHAPES } from "../../src/choice/avatars";
import type { Box } from "../../src/room/compose/bundle";
import { dogBoxAt } from "../../src/room/compose/dog-box";
import { framing } from "../../src/room/compose/framing";
import { origin } from "../../src/room/compose/math";
import { resolveMounts } from "../../src/room/compose/mount";
import { listOnly, memberRect, pick, pickAreas, pickProblems } from "../../src/room/compose/pick";
import type { MemberRect, PickArea, Rect } from "../../src/room/compose/pick";
import { toStage } from "../../src/room/compose/project";
import type { Stage } from "../../src/room/compose/stages";
import { framedBoxes, pickAreasOn, selectablePicker } from "../../src/room/scene/bundle3d";
import { reservedBoxes } from "../../src/room/compose/hud";
import { REPO } from "../helpers/room";
import { placementLabelled, selectableNamed, topicPhrased, twinFigure } from "../helpers/room-ids";

const SCENE_PATH = "apps/web/room/scene.yaml";
const STRICT: ComposeOptions = { mode: "strict", drafts: false };
// Spec 004's FR-007: no room ID stands in a test, so the dog sign and the hobbies topic are found by their words
// (../helpers/room-ids.ts).
const DOG_SELECTABLE = {
  id: "dog",
  name: "Dog",
  members: [placementLabelled("Desk sign, dog")],
  figure: "dog",
  action: { talk: { topic: topicPhrased("hobbies and travel adventures"), lead: "The dog first." } },
};
/** The scene's selectables without the one that holds the dog's sign (spec 026's human patch, T019, puts one in
 *  scene.yaml; Q297; its r3 gives it the sign's ID), so a test that adds its own works whether or not the shipped scene
 *  holds it. */
const lessDog = (selectables: unknown[]): unknown[] =>
  selectables.filter((s) => !((s as { members?: unknown[] }).members ?? []).includes(DOG_SELECTABLE.members[0]));

const corners = (dog: { home: { at: [number, number]; heading_deg: number }; footprint_m: number }) => {
  const h = (dog.home.heading_deg * Math.PI) / 180;
  const f: [number, number] = [-Math.sin(h), -Math.cos(h)];
  const r: [number, number] = [Math.cos(h), -Math.sin(h)];
  const L = AVATAR_SHAPES.dog.width / 2;
  const W = dog.footprint_m / 2;
  const out: [number, number][] = [];
  for (const a of [-L, L])
    for (const b of [-W, W]) out.push([dog.home.at[0] + a * f[0] + b * r[0], dog.home.at[1] + a * f[1] + b * r[1]]);
  return out;
};

describe("dogBoxAt (R-09; Nit-1)", () => {
  it("is the box at its home, 0.8 m along its heading, footprint_m across, from the floor to 0.62 m, at 0°", () => {
    const box = dogBoxAt({ home: { at: [0.3, 0.45], heading_deg: 0 }, footprint_m: 0.3 }, AVATAR_SHAPES.dog);
    expect(box.min[0]).toBeCloseTo(0.15, 12);
    expect(box.max[0]).toBeCloseTo(0.45, 12);
    expect(box.min[1]).toBe(0);
    expect(box.max[1]).toBeCloseTo(0.62, 12);
    expect(box.min[2]).toBeCloseTo(0.05, 12);
    expect(box.max[2]).toBeCloseTo(0.85, 12);
  });

  it.each([30, 135, -70, 180])("at %s°, holds every turned corner, and each bound is a corner's", (deg) => {
    const dog = { home: { at: [0.3, 0.45] as [number, number], heading_deg: deg }, footprint_m: 0.3 };
    const box = dogBoxAt(dog, AVATAR_SHAPES.dog);
    const c = corners(dog);
    for (const [x, z] of c) {
      expect(x).toBeGreaterThanOrEqual(box.min[0] - 1e-12);
      expect(x).toBeLessThanOrEqual(box.max[0] + 1e-12);
      expect(z).toBeGreaterThanOrEqual(box.min[2] - 1e-12);
      expect(z).toBeLessThanOrEqual(box.max[2] + 1e-12);
    }
    expect(Math.min(...c.map((p) => p[0]))).toBeCloseTo(box.min[0], 12);
    expect(Math.max(...c.map((p) => p[0]))).toBeCloseTo(box.max[0], 12);
    expect(Math.min(...c.map((p) => p[1]))).toBeCloseTo(box.min[2], 12);
    expect(Math.max(...c.map((p) => p[1]))).toBeCloseTo(box.max[2], 12);
  });
});

const m = (rect: Rect, depth: number): MemberRect => ({ rect, depth });

describe("front rectangles in compose/pick.ts (R-09)", () => {
  const sign = m([100, 100, 20, 20], 5);
  const dog = m([60, 120, 80, 60], 4);
  const board = m([200, 100, 40, 80], 6);

  it("stay out of the union and the core: the piece's are its members' alone", () => {
    const [withFront] = pickAreas([{ id: "dog", members: [sign], front: [dog] }]);
    const [without] = pickAreas([{ id: "dog", members: [sign] }]);
    expect(withFront?.union).toEqual(without?.union);
    expect(withFront?.core).toEqual(without?.core);
    expect(withFront?.front).toEqual([dog]);
  });

  it("pick the piece where the front rectangle is the frontmost member under the point, and only there", () => {
    const behind = m([0, 150, 100, 100], 3);
    const areas = pickAreas([
      { id: "dog", members: [sign], front: [dog] },
      { id: "board", members: [board] },
      { id: "shelf", members: [behind] },
    ]);
    // Inside the dog's rectangle, nothing else under the point.
    expect(pick(areas, [130, 170])).toBe("dog");
    // Inside it, but the shelf's member is in front (depth 3 < 4).
    expect(pick(areas, [80, 170])).toBe("shelf");
    // Outside it: the second rule over unions and cores, which the front never joins.
    const without = pickAreas([
      { id: "dog", members: [sign] },
      { id: "board", members: [board] },
      { id: "shelf", members: [behind] },
    ]);
    for (const p of [
      [150, 110],
      [190, 140],
      [50, 90],
    ] as const)
      expect(pick(areas, p)).toBe(pick(without, p));
  });

  it("refuses another's core over the front rectangle (member), and nothing else for it", () => {
    // A core of 44 centred on the board's union, moved over the dog's rectangle.
    const near = m([100, 150, 20, 20], 6);
    const areas = pickAreas([
      { id: "dog", members: [m([400, 400, 20, 20], 5)], front: [dog] },
      { id: "board", members: [near] },
    ]);
    const problems = pickProblems(areas, [0, 0, 800, 600]);
    expect(problems).toContainEqual({ selectable: "board", problem: "member", other: "dog" });
    // Without the front, no problem at all; with it, only that one.
    const bare = pickAreas([
      { id: "dog", members: [m([400, 400, 20, 20], 5)] },
      { id: "board", members: [near] },
    ]);
    expect(pickProblems(bare, [0, 0, 800, 600])).toEqual([]);
    expect(problems).toEqual([{ selectable: "board", problem: "member", other: "dog" }]);
  });
});

/** The repository's tree with the `dog` selectable added to its scene in memory, never on disk (FR-016). */
let shipped: { tree: Tree; result: ComposeResult } | null = null;
function withDog(): { tree: Tree; result: ComposeResult } {
  if (shipped) return shipped;
  const base = fileTree(REPO);
  const text = new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array());
  const doc = parse(text) as { selectables: unknown[] };
  doc.selectables = [...lessDog(doc.selectables), DOG_SELECTABLE];
  const tree = overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]]));
  const policy = readRoomPolicy({ env: {}, root: REPO });
  shipped = { tree, result: compose(tree, policy, STRICT) };
  return shipped;
}

const STAGES: readonly Stage[] = [
  { w: 1280, h: 800 },
  { w: 390, h: 844 },
  { w: 1024, h: 600 },
];

describe("the scene's real selectables plus the dog piece, on a grid (R-09; Q160)", () => {
  it("carries the selectable's figure into the index, and the twin has no pick area", () => {
    const { result } = withDog();
    const ids = result.index.selectables.map((s) => s.id);
    expect(ids).toEqual([...["Snowboard", "Bicycle", "Laptop and screen", "Chalkboard"].map(selectableNamed), "dog"]);
    expect(result.index.selectables.find((s) => s.id === "dog")?.figure).toBe("dog");
    expect(ids).not.toContain(twinFigure());
    // The floor the dog's box stands on: the twin's placement's, at y 0.
    const twin = resolveMounts(result.scene.placements, result.scene.pieces).world.get(result.scene.figures.twin);
    expect(twin && origin(twin)[1]).toBeCloseTo(0, 9);
  });

  it.each(STAGES)("every point picks as without the dog's rectangle, except where it is frontmost (%o)", (raw) => {
    const { result } = withDog();
    const part = result.scene;
    const stage: Stage = { ...raw, reserved: reservedBoxes(raw) };
    const camera = framing(stage.w / stage.h, framedBoxes(part));
    const areas = pickAreasOn(part, result.index, camera, stage);
    const dogArea = areas.find((a) => a.id === "dog");
    const front = dogArea?.front?.[0];
    expect(front, "the dog's rectangle").toBeDefined();
    const bare: PickArea[] = areas.map((a) => ({ id: a.id, members: a.members, union: a.union, core: a.core }));
    const view: Rect = [0, 0, stage.w, stage.h];
    const sideWall = new Set(result.index.selectables.filter((s) => s.side_wall).map((s) => s.id));
    const held = listOnly(areas, view, sideWall, stage.reserved);
    const heldBare = listOnly(bare, view, sideWall, stage.reserved);
    expect([...held]).toEqual([...heldBare]);
    // The twin's projected figure: a point on it picks what it picks without the dog, outside the dog's rectangle.
    const twinBox = part.placements.find((p) => p.id === part.figures.twin)?.frame_box as Box;
    let dogPoints = 0;
    let changed = 0;
    for (let y = 0; y <= stage.h; y += 6)
      for (let x = 0; x <= stage.w; x += 6) {
        const p: [number, number] = [x, y];
        const all = [...areas.flatMap((a) => a.members), ...(front ? [front] : [])].filter((r) => contains(r.rect, p));
        const frontmost = all.length > 0 && all.reduce((a, b) => (b.depth < a.depth ? b : a)) === front;
        const got = pick(areas, p, held);
        if (frontmost) {
          dogPoints += 1;
          expect(got, `(${x}, ${y})`).toBe("dog");
        } else {
          if (got !== pick(bare, p, heldBare)) changed += 1;
          expect(got, `(${x}, ${y})`).toBe(pick(bare, p, heldBare));
        }
      }
    expect(dogPoints).toBeGreaterThan(0);
    expect(changed).toBe(0);
    expect(twinBox).toBeDefined();
  });
});

const contains = (r: Rect, [px, py]: readonly [number, number]): boolean =>
  px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3];

describe("the picker's pickable (R-09)", () => {
  it("skips the dog's rectangle while the figure isn't pickable, and takes it while it is", () => {
    const { result } = withDog();
    const part = result.scene;
    let can = true;
    const picker = selectablePicker(part, result.index, (figure) => figure === "dog" && can);
    const stage: Stage = { w: 1280, h: 800 };
    picker.resize(stage);
    const camera = framing(stage.w / stage.h, framedBoxes(part));
    const areas = pickAreasOn(part, result.index, camera, { ...stage, reserved: reservedBoxes(stage) });
    const front = areas.find((a) => a.id === "dog")?.front?.[0];
    if (!front) throw new Error("no dog rectangle");
    // A point in the dog's rectangle where it is the frontmost member.
    let found: [number, number] | null = null;
    for (let y = front.rect[1]; y <= front.rect[1] + front.rect[3] && !found; y += 2)
      for (let x = front.rect[0]; x <= front.rect[0] + front.rect[2] && !found; x += 2) {
        const p: [number, number] = [x, y];
        if (pick(areas, p) === "dog" && !areas.some((a) => a.members.some((mr) => contains(mr.rect, p)))) found = p;
      }
    if (!found) throw new Error("no point where the dog is frontmost");
    const ndc = { x: (found[0] / stage.w) * 2 - 1, y: 1 - (found[1] / stage.h) * 2 };
    expect(toStage([ndc.x, ndc.y, 0], stage)[0]).toBeCloseTo(found[0], 6);
    expect(picker.pick(ndc)).toBe("dog");
    can = false;
    const bare = areas.map((a) => ({ id: a.id, members: a.members, union: a.union, core: a.core }));
    expect(picker.pick(ndc)).toBe(pick(bare, found));
    expect(picker.pick(ndc)).not.toBe("dog");
  });

  it("without a pickable callback, never takes the dog's rectangle (no figure picks unless the stage says so)", () => {
    const { result } = withDog();
    const picker = selectablePicker(result.scene, result.index);
    const stage: Stage = { w: 1280, h: 800 };
    picker.resize(stage);
    const camera = framing(stage.w / stage.h, framedBoxes(result.scene));
    const areas = pickAreasOn(result.scene, result.index, camera, { ...stage, reserved: reservedBoxes(stage) });
    const front = areas.find((a) => a.id === "dog")?.front?.[0];
    if (!front) throw new Error("no dog rectangle");
    const c: [number, number] = [front.rect[0] + front.rect[2] / 2, front.rect[1] + front.rect[3] / 2];
    const ndc = { x: (c[0] / stage.w) * 2 - 1, y: 1 - (c[1] / stage.h) * 2 };
    const bare = areas.map((a) => ({ id: a.id, members: a.members, union: a.union, core: a.core }));
    expect(picker.pick(ndc)).toBe(pick(bare, c));
  });
});

describe("RG6 measures the dog's box at its home (R-09; Q160)", () => {
  function geometryWith(tree: Tree) {
    const policy = readRoomPolicy({ env: {}, root: REPO });
    const g = geometryOf(createContext(loadRoom(tree), policy, STRICT, tree).ctx);
    if (!g) throw new Error("no geometry");
    return g;
  }

  it("gives only the dog piece a front, its box dogBoxAt's, non-null at every swept stage of the shipped scene", () => {
    const { tree, result } = withDog();
    const g = geometryWith(tree);
    const stages = sweptStages(g);
    expect(stages.length).toBeGreaterThan(0);
    const box = dogBoxAt(result.scene.figures.dog!, AVATAR_SHAPES.dog);
    const nulls: string[] = [];
    for (const stage of stages) {
      const fronts = figureFronts(g, stage);
      expect([...fronts.keys()]).toEqual(["4"]);
      expect(fronts.get("4")?.box).toEqual(box);
      if (!fronts.get("4")?.rect) nulls.push(`${stage.w} × ${stage.h}`);
    }
    expect(nulls, "stages where the dog's rectangle is null").toEqual([]);
  });

  it("gives no front without the selectable's figure, or without figures.dog", () => {
    const base = fileTree(REPO);
    const text = new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array());
    // The scene without a `dog` selectable: no front.
    const bare = parse(text) as { selectables: unknown[] };
    bare.selectables = lessDog(bare.selectables);
    const withoutDog = overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(bare))]]));
    expect(figureFronts(geometryWith(withoutDog), { w: 1280, h: 800 }).size).toBe(0);
    const doc = parse(text) as { selectables: unknown[]; figures: Record<string, unknown> };
    doc.selectables = [...lessDog(doc.selectables), DOG_SELECTABLE];
    delete doc.figures.dog;
    const tree = overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]]));
    expect(figureFronts(geometryWith(tree), { w: 1280, h: 800 }).size).toBe(0);
  });

  it("adds no RG6 problem of its own on the shipped scene: the sweep with the figure equals the sweep without it", () => {
    const { tree } = withDog();
    const g = geometryWith(tree);
    const key = (p: ReturnType<typeof pickSweep>["problems"][number]): string =>
      `${p.mode} ${p.problem.selectable} ${p.problem.problem} ${p.problem.other ?? "-"}`;
    const withFigure = pickSweep(g).problems.map(key).sort();
    // The same selectable without its figure: the sign alone.
    const base = fileTree(REPO);
    const text = new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array());
    const doc = parse(text) as { selectables: unknown[] };
    const { figure: dropped, ...signOnly } = DOG_SELECTABLE;
    void dropped;
    doc.selectables = [...lessDog(doc.selectables), signOnly];
    const bare = geometryWith(overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]])));
    const withoutFigure = pickSweep(bare).problems.map(key).sort();
    console.log(
      `dog-pick: RG6 on the shipped scene with the dog selectable in memory, over ${sweptStages(g).length} stages: ` +
        (withFigure.length === 0
          ? "no problem"
          : pickSweep(g)
              .problems.map((p) => `${key(p)} (${p.first.w} × ${p.first.h} and ${p.more} more)`)
              .join("; ")),
    );
    expect(withFigure).toEqual(withoutFigure);
  });

  it("refuses another's core over the dog's rectangle in the sweep: a fixture piece on the desk, the dog before it", () => {
    // A fixture selectable whose member is the work desk (no shipped selectable is), its core centred on the desk, and
    // the dog's home moved, on a grid, to where its rectangle holds that core's centre.
    const stage: Stage = { w: 1280, h: 800 };
    const FIXTURE = {
      id: "fixture-desk",
      name: "Fixture",
      members: [placementLabelled("Desk")],
      action: { resume: {} },
    };
    const treeOf = (figure: boolean, home: [number, number] | null): Tree => {
      const base = fileTree(REPO);
      const text = new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array());
      const d = parse(text) as { selectables: unknown[]; figures: { dog: { home: { at: number[] } } } };
      const { figure: dropped, ...signOnly } = DOG_SELECTABLE;
      void dropped;
      // The dog piece's member the bicycle, on the side wall, away from the desk.
      d.selectables = [
        ...lessDog(d.selectables),
        { ...(figure ? DOG_SELECTABLE : signOnly), members: [placementLabelled("Bicycle")] },
        FIXTURE,
      ];
      if (home) d.figures.dog.home.at = home;
      return overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(d))]]));
    };
    const policy = readRoomPolicy({ env: {}, root: REPO });
    const composed = compose(treeOf(true, null), policy, STRICT);
    const camera = framing(stage.w / stage.h, framedBoxes(composed.scene));
    const core = pickAreasOn(composed.scene, composed.index, camera, { ...stage, reserved: reservedBoxes(stage) }).find(
      (x) => x.id === FIXTURE.id,
    )?.core;
    if (!core) throw new Error("no fixture core");
    const centre: [number, number] = [core[0] + core[2] / 2, core[1] + core[3] / 2];
    let home: [number, number] | null = null;
    for (let z = 0.6; z >= -1.5 && !home; z -= 0.05)
      for (let x = -1.5; x <= 1.5 && !home; x += 0.05) {
        const dog = { home: { at: [x, z] as [number, number], heading_deg: 180 }, footprint_m: 0.3 };
        const r = memberRect(dogBoxAt(dog, AVATAR_SHAPES.dog), camera, stage);
        if (r && contains(r.rect, centre)) home = [x, z];
      }
    if (!home) throw new Error(`no home whose rectangle holds the fixture's core ${JSON.stringify(core)}`);
    const problems = (figure: boolean): string[] =>
      pickSweep(geometryWith(treeOf(figure, home)), [stage]).problems.map(
        (p) => `${p.mode} ${p.problem.selectable} ${p.problem.problem} ${p.problem.other}`,
      );
    // The fixture's core (selectable 5) over the dog's rectangle: RG6's member rule, in 3D only (2D draws no figure).
    const withFigure = problems(true);
    expect(withFigure, JSON.stringify(withFigure)).toContain("3D 5 member 4");
    expect(withFigure).not.toContain("2D 5 member 4");
    expect(problems(false)).not.toContain("3D 5 member 4");
  });
});
