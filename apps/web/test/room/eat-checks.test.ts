// T011a (spec 024; FR-012, SC-004; plan.md §5.5; Q150, Q-R3a; spec A8): the compositor's judgement of a 3D dinosaur
// visit's framing. The geometry carries a second protector, `protectEat`, built with the `eat` option, and its
// reference stages, `referenceEat`. RG6 sweeps its supported stages too, in 3D, and names the dinosaur visit in a
// refusal found there alone; RG5's aspects cover its stages; RG7 judges the floor at its reference stages; the bundle
// stays the plain visit's; the report adds the dinosaur visit's lines; and the room's own picker, at each of its stages,
// holds exactly what the sweep holds. On the repository's scene, the variant finds nothing.
import { describe, expect, it } from "vitest";

import { createContext } from "../../build/room/checks/family";
import {
  faceCaps,
  faceScreens,
  geometryOf,
  lookTypefaces,
  pickSweep,
  protectSceneOfGeometry,
  sideWallsOf,
  spacingReasons,
} from "../../build/room/checks/rg";
import type { Geometry } from "../../build/room/checks/rg";
import { sceneTextureTotal } from "../../build/room/checks/rk";
import { compose } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { capsOf, noPolicy, readRoomPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { frameArea, reservedIn } from "../../src/room/compose/frame";
import { framing } from "../../src/room/compose/framing";
import type { Box as WorldBox } from "../../src/room/compose/framing";
import { compactBoxes, DEFAULT_METRICS, eatControlBox, hudBoxes, walkControlBox } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { CORE_PX, listOnly, memberRect, pickProblems } from "../../src/room/compose/pick";
import type { PickArea, Rect } from "../../src/room/compose/pick";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import {
  ASPECTS,
  framedStages,
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  stageFor,
  supportedStages,
} from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { framedBoxes, pickAreasOn, selectablePicker } from "../../src/room/scene/bundle3d";
import { REPO, repositoryBundle } from "../helpers/room";
import { goodTree, sideWallPolicy, sideWallTree } from "../helpers/room-fixtures";

const repositoryTree = (): Tree => fileTree(REPO);
const mainPolicy = (): RoomPolicy => readRoomPolicy({ env: process.env, root: REPO });
const contextOf = (t: Tree, policy: RoomPolicy) =>
  createContext(loadRoom(t), policy, { mode: "lenient", drafts: true }, t).ctx;

let repo: Geometry | null = null;
function repository(): Geometry {
  if (repo) return repo;
  const g = geometryOf(contextOf(repositoryTree(), mainPolicy()));
  if (!g) throw new Error("no geometry");
  repo = g;
  return g;
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const stageKey = (s: Stage): string => `${s.w}x${s.h}:${JSON.stringify(s.reserved ?? [])}`;
/** A stage's size: the report lists a side-wall selectable's stages by size, as pick.test.ts reads them. */
const sizeKey = (s: Stage): string => `${s.w} × ${s.h}`;

describe("the variant's stages (Q150)", () => {
  it("builds the dinosaur visit's protector over the same scene, and the plain one as before", () => {
    const g = repository();
    const scene = protectSceneOfGeometry(g);
    expect(g.protectEat.eat).toBe(true);
    expect(g.protectEat.key).toBe(protectorFor(scene, DEFAULT_METRICS.rem, { eat: true }).key);
    expect(g.protect.eat).toBeUndefined();
    expect(g.protect.key).toBe(protectorFor(scene).key);
  });

  it("gives stages whose reserved boxes hold the Eat box; the plain sweep's stages hold none", () => {
    const g = repository();
    const variant = framedStages(g.protectEat);
    const plain = framedStages(g.protect);
    expect(variant.screens).toHaveLength(plain.screens.length);
    let held = 0;
    variant.screens.forEach(({ screen, state, stage }, k) => {
      if (k % 11 !== 0) return;
      const eat = compactBoxes(screen, state, DEFAULT_METRICS, { eat: true }).eat as Box;
      const f = frameArea(screen, state, DEFAULT_METRICS, g.protectEat);
      expect(stage).toEqual(stageFor(screen, g.protectEat, state));
      if (overlaps(eat, f.area)) {
        held += 1;
        expect(stage.reserved).toContainEqual(reservedIn(f.area, [eat])[0]);
      }
      const p = plain.screens[k];
      expect(p?.stage.reserved ?? []).toEqual(
        reservedIn(frameArea(screen, state, DEFAULT_METRICS, g.protect).area, compactBoxes(screen, state).all),
      );
    });
    expect(held).toBeGreaterThan(0);
    expect(supportedStages(g.protect)).toEqual(supportedStages(protectorFor(protectSceneOfGeometry(g))));
  });
});

describe("RG5's aspects over the variant (nit 1: the cover only)", () => {
  it("cover every stage a 3D dinosaur visit frames into", () => {
    const aspects = supportedStages(repository().protectEat).map((s) => s.w / s.h);
    expect(ASPECTS[0]).toBeLessThanOrEqual(Math.min(...aspects));
    expect(ASPECTS.at(-1)).toBeGreaterThanOrEqual(Math.max(...aspects));
  });
});

/** A small world box whose 44 × 44 core, at a screen's clear area, lies over the Eat box (in the clear area's corner)
 *  and clear of the walking control's box; with `left`, its core's centre at most that share of the stage's width in. */
function boxUnderEat(g: Geometry, screen = REFERENCE_DESKTOP.screen, left = 1): WorldBox {
  const clear = hudBoxes(screen).clear;
  const stage = { w: clear.w, h: clear.h };
  const camera = framing(stage.w / stage.h, g.framed);
  const [ex, ey, ew, eh] = eatControlBox(clear) as Rect;
  const [wx, wy, ww, wh] = walkControlBox(clear);
  for (let x = 1; x > -1; x -= 0.02)
    for (let y = 0; y < 1; y += 0.02)
      for (let z = -0.03; z > -0.8; z -= 0.02) {
        const b: WorldBox = { min: [x, y, z - 0.03], max: [x + 0.03, y + 0.03, z] };
        const r = memberRect(b, camera, stage);
        if (!r) continue;
        const cx = r.rect[0] + r.rect[2] / 2;
        const cy = r.rect[1] + r.rect[3] / 2;
        const core = { x: cx - CORE_PX / 2, y: cy - CORE_PX / 2, w: CORE_PX, h: CORE_PX };
        if (!overlaps(core, { x: ex, y: ey, w: ew, h: eh }) || overlaps(core, { x: wx, y: wy, w: ww, h: wh })) continue;
        if (core.x < 0 || core.y < 0 || core.x + core.w > stage.w || core.y + core.h > stage.h) continue;
        if (cx > left * stage.w) continue;
        return b;
      }
  throw new Error("no box under the Eat box");
}

/** The geometry with one selectable's members all moved to `to`, and its protectors rebuilt over the moved scene. */
function moved(g: Geometry, index: number, to: WorldBox): Geometry {
  const boxes = new Map(g.boxes);
  for (const m of g.scene.value.selectables[index]?.members ?? []) boxes.set(m, to);
  const next = { ...g, boxes } as Geometry;
  const scene = protectSceneOfGeometry(next);
  return { ...next, protect: protectorFor(scene), protectEat: protectorFor(scene, DEFAULT_METRICS.rem, { eat: true }) };
}

describe("RG6 over both sweeps (Q150)", () => {
  it("refuses a selectable whose core collides with the Eat box, in the variant alone, naming the dinosaur visit", () => {
    const g = geometryOf(contextOf(sideWallTree(), sideWallPolicy()));
    if (!g) throw new Error("no geometry");
    const flags = sideWallsOf(g);
    const index = flags.findIndex((f) => !f);
    expect(index).toBeGreaterThanOrEqual(0);
    // Both protectors stubbed to find no frame area, so every stage of each sweep is a clear area at ease 1, the
    // variant's with the Eat box reserved beside the walking control's. The moved selectable's core lies under the
    // Eat box at the reference phone's clear area, its centre at most 40% of the stage's width in, so no walking
    // control's box (at least 57% in, at the narrowest dock stage) ever covers it in the plain sweep.
    const near = moved(g, index, boxUnderEat(g, REFERENCE_PHONE.screen, 0.4));
    const stub = {
      ...near,
      protect: { key: `stub:${Math.random()}`, boxes: () => null },
      protectEat: { key: `stub-eat:${Math.random()}`, eat: true, boxes: () => null },
    } as Geometry;
    const sweep = pickSweep(stub);
    const own = sweep.problems.filter((p) => p.problem.selectable === String(index));
    const dinosaur = own.filter((p) => p.dinosaur);
    expect(dinosaur.length).toBeGreaterThan(0);
    expect(dinosaur.every((p) => p.mode === "3D" && p.problem.problem === "reserved")).toBe(true);
    expect(own.filter((p) => !p.dinosaur && p.problem.problem === "reserved")).toEqual([]);
    const reasons = spacingReasons(stub).filter((r) => r.selectable === index);
    expect(reasons.some((r) => r.reason.includes("for a 3D dinosaur visit"))).toBe(true);
    expect(reasons.some((r) => r.reason.includes('the "Eat" tile\'s box'))).toBe(true);
  });

  it("holds a side-wall selectable whose core lies under the Eat box in the variant, and reports it apart", () => {
    const g = geometryOf(contextOf(sideWallTree(), sideWallPolicy()));
    if (!g) throw new Error("no geometry");
    const index = sideWallsOf(g).findIndex((f) => f);
    expect(index).toBeGreaterThanOrEqual(0);
    const stub = moved(g, index, boxUnderEat(g));
    const sweep = pickSweep(stub);
    expect(sweep.dinosaur.boxHolds.map((h) => h.index)).toContain(index);
    expect(sweep.problems.filter((p) => p.dinosaur && p.problem.selectable === String(index))).toEqual([]);
  });

  it("runs the variant only for the supported stages' sweep, not for a test's own stages", () => {
    const g = repository();
    const sweep = pickSweep(g, [{ w: 1472, h: 1120.5, reserved: [] }]);
    expect(sweep.dinosaur).toEqual({ sideWalls: [], boxHolds: [] });
  });
});

describe("RG7 at the variant's reference stages, and one bundle (Q-R3a; spec A8)", () => {
  it("frames the reference screens over the variant's protector", () => {
    const g = repository();
    expect(g.referenceEat.map((r) => r.name)).toEqual(["desktop", "phone"]);
    expect(g.referenceEat.map((r) => r.stage)).toEqual(
      [REFERENCE_DESKTOP, REFERENCE_PHONE].map(({ screen }) => {
        const s = stageFor(screen, g.protectEat);
        return { w: s.w, h: s.h };
      }),
    );
  });

  it("holds the floor at them for every readable face of the repository's room", () => {
    const t = repositoryTree();
    const p = mainPolicy();
    const g = repository();
    const typefaces = lookTypefaces(loadRoom(t), t);
    const floor = capsOf(p).legibility_floor_css_px;
    const caps = faceCaps({ ...g, reference: g.referenceEat }, typefaces);
    expect(caps.length).toBeGreaterThan(0);
    for (const face of caps)
      for (const stage of ["desktop", "phone"] as const) {
        const px = face[stage];
        if (px === null || !face.readable || face.atmosphere || (stage === "phone" && face.phone_exempt)) continue;
        expect(px, `${face.face} on the ${stage}`).toBeGreaterThanOrEqual(floor);
      }
  });

  it("keeps the bundle's faces, canvases, and frame boxes the plain visit's", () => {
    const g = repository();
    const without = { ...g, protectEat: g.protect, referenceEat: g.reference } as Geometry;
    expect(faceScreens(g)).toEqual(faceScreens(without));
    const t = repositoryTree();
    expect(sceneTextureTotal(g, t)).toEqual(sceneTextureTotal(without, t));
    const { index } = repositoryBundle();
    const screens = faceScreens(g);
    for (const face of index.faces) {
      const s = screens.find((x) => `${x.placement}.${x.role}` === face.id);
      if (s?.screen) expect(face.screen_css, face.id).toEqual([s.screen[0], s.screen[1]]);
    }
  });
});

describe("the report's dinosaur visit lines", () => {
  it("adds them after the frame lines, the existing lines as they were", () => {
    const result = compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
    const lines = result.report.markdown.split("\n");
    const head = lines.findIndex((l) => l.startsWith("A 3D dinosaur visit (spec 024, Q150): "));
    expect(head).toBeGreaterThan(0);
    expect(lines[head - 1]).toBe("");
    expect(lines[head]).toContain("stages over the same screens, checked by RG6 and RG7 and not emitted");
    expect(lines[head + 1]).toMatch(/^- The reference desktop \(1920 × 1200\): ease (0|1|\d+\/16), a frame area of /);
    expect(lines[head + 2]).toMatch(/^- The reference phone \(384 × 740\): ease (0|1|\d+\/16), a frame area of /);
    expect(lines[head + 3]).toMatch(/^- The "Eat" tile's box /);
    expect(lines[head + 4]).toBe("");
  });
});

describe("the runtime picker at the variant's stages", () => {
  it("holds, at every variant stage, exactly the side-wall selectables the sweep holds there", () => {
    const g = repository();
    const { scene: part, index } = repositoryBundle();
    const sweep = pickSweep(g).dinosaur.sideWalls;
    const heldAt = new Map<string, Set<string>>();
    for (const p of sweep)
      for (const s of p.stages) heldAt.set(sizeKey(s), (heldAt.get(sizeKey(s)) ?? new Set()).add(p.id));
    const walls = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
    const picker = selectablePicker(part, index);
    const room = protectorFor(protectSceneOf(part, index), DEFAULT_METRICS.rem, { eat: true });
    const stages = supportedStages(room);
    expect(stages.map(stageKey)).toEqual(supportedStages(g.protectEat).map(stageKey));
    for (const stage of stages) {
      picker.resize(stage);
      const areas: PickArea[] = pickAreasOn(part, index, framing(stage.w / stage.h, framedBoxes(part)), stage);
      const held = heldAt.get(sizeKey(stage)) ?? new Set();
      for (const id of walls) {
        const area = areas.find((a) => a.id === id);
        if (!area?.core) continue;
        const [x, y, w, h] = area.core;
        const ndc = { x: ((x + w / 2) / stage.w) * 2 - 1, y: 1 - ((y + h / 2) / stage.h) * 2 };
        if (held.has(id)) expect(picker.pick(ndc), `${id} at ${stageKey(stage)}`).not.toBe(id);
        else expect(picker.pick(ndc), `${id} at ${stageKey(stage)}`).toBe(id);
      }
    }
  });
});

describe("the repository's scene in the variant (plan §8)", () => {
  it("composes without a finding the dinosaur visit alone gives", () => {
    const g = repository();
    expect(spacingReasons(g).filter((r) => r.reason.includes("dinosaur"))).toEqual([]);
    const result = compose(repositoryTree(), mainPolicy(), { mode: "lenient", drafts: true });
    expect(result.findings.filter((f) => f.reason.includes("dinosaur")).map((f) => `${f.rule} ${f.reason}`)).toEqual(
      [],
    );
  });

  it("leaves no pressable core under the Eat box at the clear area (ease 1), as the variant judges it", () => {
    const g = repository();
    const { scene: part, index } = repositoryBundle();
    const walls = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
    let atClear = 0;
    for (const { screen, state, stage } of framedStages(g.protectEat).screens) {
      if (stage.ease !== 1) continue;
      atClear += 1;
      const areas = pickAreasOn(part, index, framing(stage.w / stage.h, framedBoxes(part)), stage);
      const view: Rect = [0, 0, stage.w, stage.h];
      const reserved = stage.reserved ?? [];
      const held = listOnly(areas, view, walls, reserved);
      const under = pickProblems(areas, view, held, reserved).filter((p) => p.problem === "reserved");
      expect(under, `${screen.w} × ${screen.h}, ${state.list}`).toEqual([]);
    }
    // The claim is judged, not vacuous: on 2026-11-14 the variant framed 1,968 of its screens at the clear area.
    expect(atClear).toBeGreaterThan(0);
  });
});
