// T025 (spec 005; FR-054 to FR-057; SC-002; plan.md §10.1, §10.2): spec 004's checks at the new stages, only easier.
// Over the repository's room and the fixture set: each readable face's smallest cap height on each new reference stage
// is at least its height on spec 004's (test/room/legacy-stages.ts) and at least the floor; the index's screen_css comes
// from the new reference stages; RK3's texture total on the reference phone is within 96 MB; the report names the
// stages and the reserved boxes; and, run at spec 004's stages and at the new ones, each side-wall selectable is list-only
// at a screen's new stage only where it was at that screen's old one.
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
} from "../../build/room/checks/rg";
import type { Geometry } from "../../build/room/checks/rg";
import { sceneTextureMemory, sceneTextureTotal } from "../../build/room/checks/rk";
import { compose } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { capsOf, noPolicy, readRoomPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { framing } from "../../src/room/compose/framing";
import { memberRect, unionOf } from "../../src/room/compose/pick";
import type { Rect } from "../../src/room/compose/pick";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { frameArea } from "../../src/room/compose/frame";
import { DEFAULT_METRICS, OPENING } from "../../src/room/compose/hud";
import {
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  stageFor,
  supportedStages,
  sweepScreens,
} from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { REPO, repositoryBundle } from "../helpers/room";
import { countersTree, goodTree, sideWallPolicy, sideWallTree } from "../helpers/room-fixtures";
import * as legacy from "./legacy-stages";

const repositoryTree = (): Tree => fileTree(REPO);
const mainPolicy = (): RoomPolicy => readRoomPolicy({ env: process.env, root: REPO });

function contextOf(t: Tree, policy: RoomPolicy) {
  return createContext(loadRoom(t), policy, { mode: "lenient", drafts: true }, t).ctx;
}

/** The geometry measured at spec 004's reference stages instead: the same framed boxes, the old stages. */
function atLegacyStages(g: Geometry): Geometry {
  const reference = ([legacy.REFERENCE_DESKTOP, legacy.REFERENCE_PHONE] as const).map(({ stage, dpr }, k) => ({
    name: k === 0 ? ("desktop" as const) : ("phone" as const),
    stage,
    dpr,
    camera: framing(stage.w / stage.h, g.framed),
  }));
  return { ...g, reference } as Geometry;
}

const ROOMS: readonly [string, () => Tree, () => RoomPolicy][] = [
  ["the repository's room", repositoryTree, mainPolicy],
  ["the fixture set", goodTree, noPolicy],
  ["the counters overlay", countersTree, noPolicy],
];

describe("legibility at the new reference stages (FR-054, FR-056; RG7)", () => {
  for (const [name, tree, policy] of ROOMS)
    it(`gives every bound face of ${name} at least its cap height at spec 004's stages, and at least the floor`, () => {
      const t = tree();
      const p = policy();
      const ctx = contextOf(t, p);
      const g = geometryOf(ctx);
      if (!g) throw new Error("no geometry");
      const typefaces = lookTypefaces(loadRoom(t), t);
      const now = faceCaps(g, typefaces);
      const then = faceCaps(atLegacyStages(g), typefaces);
      expect(now.length).toBeGreaterThan(0);
      const floor = capsOf(p).legibility_floor_css_px;
      for (const [k, face] of now.entries()) {
        const old = then[k];
        expect(old?.face).toBe(face.face);
        for (const stage of ["desktop", "phone"] as const) {
          const [a, b] = [face[stage], old?.[stage]];
          if (a === null || a === undefined || b === null || b === undefined) continue;
          expect(a, `${face.face} on the ${stage}`).toBeGreaterThanOrEqual(b - 1e-9);
          // The floor holds where RG7 holds it: a readable face, not atmosphere, and not the counters' exemption on the
          // phone.
          const held = face.readable && !face.atmosphere && !(stage === "phone" && face.phone_exempt);
          if (held) expect(a, `${face.face} on the ${stage}`).toBeGreaterThanOrEqual(floor);
        }
      }
    });
});

describe("the faces' on-screen sizes and texture memory at the new reference stages (FR-056; RK3)", () => {
  it("gives the index's screen_css from the new reference stages", () => {
    const { index } = repositoryBundle();
    const g = geometryOf(contextOf(repositoryTree(), mainPolicy()));
    if (!g) throw new Error("no geometry");
    // Spec 014 (its FR-060; plan.md §11): each reference stage is its screen's frame area, which holds spec 005's.
    expect(g.reference.map((r) => r.stage)).toEqual(
      [REFERENCE_DESKTOP, REFERENCE_PHONE].map(({ screen }) => {
        const s = stageFor(screen, g.protect);
        return { w: s.w, h: s.h };
      }),
    );
    // Spec 028 (T-A05; plan.md §R-B8): the reference desktop's window takes the split layout, whose area is narrower
    // than spec 005's clear area; it holds spec 004's stage there, 686.4 × 640 (test/room/stages-floor.test.ts).
    expect(g.reference[0]?.stage.w).toBeGreaterThanOrEqual(686.4);
    expect(g.reference[0]?.stage.h).toBeGreaterThanOrEqual(640);
    const screens = faceScreens(g);
    for (const face of index.faces) {
      const s = screens.find((x) => `${x.placement}.${x.role}` === face.id);
      expect(s, face.id).toBeDefined();
      if (s?.screen) expect(face.screen_css, face.id).toEqual([s.screen[0], s.screen[1]]);
    }
  });

  // The cap in force is main's scene_texture_bytes, 200,000,000 since the Author raised it from FR-053's starting
  // 96,000,000; the repository's room was over 96 MB through its models before spec 005, and the live faces' canvases,
  // sized at the new reference stages, are a small share. The fixture set is held to the starting 96 MB.
  for (const [name, tree, policy] of ROOMS)
    it(`totals ${name}'s texture memory on the reference phone within its cap, the live faces' canvases grown least`, () => {
      const t = tree();
      const p = policy();
      const ctx = contextOf(t, p);
      const memory = sceneTextureMemory(ctx);
      expect(memory.canvases).toBeGreaterThan(0);
      expect(memory.total).toBeLessThanOrEqual(capsOf(p).scene_texture_bytes);
      if (name !== "the repository's room") expect(memory.total).toBeLessThanOrEqual(96_000_000);
      // At spec 004's reference stages the faces' canvases were no larger.
      const g = geometryOf(ctx);
      if (!g) throw new Error("no geometry");
      const before = sceneTextureTotal(atLegacyStages(g), t);
      expect(memory.canvases).toBeGreaterThanOrEqual(before.canvases);
      expect(memory.total - memory.canvases).toBe(before.total - before.canvases);
    });
});

describe("the report's stages and reserved boxes (FR-055, FR-057; plan.md §10.2)", () => {
  it("names the layouts, the sweep's extent and count, the reference stages, and each reserved box", () => {
    const md = compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }).report.markdown;
    const screens = sweepScreens();
    const stages = supportedStages();
    expect(md).toContain(
      `Stages (spec 005, FR-052 to FR-054): the clear areas of the HUD's column and dock layouts, a dock screen's with ` +
        `its list open and collapsed, over ${screens.length.toLocaleString("en-US")} screens from 320 × 320 to ` +
        `5120 × 3840, ${stages.length.toLocaleString("en-US")} stages; the reference desktop's 1472 × 1120.5 ` +
        `(1920 × 1200 at a pixel ratio of 1) and the reference phone's 384 × 422 (384 × 740 at 2.8125).`,
    );
    expect(md).toContain(
      "Reserved boxes (spec 005, FR-055): the walking control's (spec 008, FR-021) where it stands in the clear area " +
        "(since spec 014's W19, on short column windows and in the dock), 8rem × 2.75rem, 0.5rem in from " +
        "the clear area's bottom-right corner, holds no side-wall selectable at any supported stage.",
    );
    expect(md).not.toContain("The walking control's box (spec 008, FR-021)");
  });
});

describe("the side-wall selectables' list-only stages, no more than spec 004's (FR-057)", () => {
  /** For each screen of spec 004's sweep, the side-wall selectables list-only at its stage, by a sweep of stages. */
  function listOnlyByScreen(g: Geometry, stageOf: (s: { w: number; h: number }) => Stage, all: readonly Stage[]) {
    const sweep = pickSweep(g, all);
    const key = (s: Stage): string => `${s.w}x${s.h}`;
    const held = new Map<string, Set<string>>();
    for (const p of sweep.sideWalls)
      for (const s of [...p.stages, ...p.flat]) {
        const set = held.get(key(s)) ?? new Set<string>();
        set.add(p.id);
        held.set(key(s), set);
      }
    return (screen: { w: number; h: number }): ReadonlySet<string> => held.get(key(stageOf(screen))) ?? new Set();
  }

  for (const [name, tree, policy] of [
    ["the repository's room", repositoryTree, mainPolicy],
    ["the side-wall overlay", sideWallTree, sideWallPolicy],
  ] as const)
    it(`lists a side-wall selectable of ${name} at a screen's new stage only where spec 004 listed it at its old one`, () => {
      const g = geometryOf(contextOf(tree(), policy()));
      if (!g) throw new Error("no geometry");
      const now = listOnlyByScreen(g, stageFor, supportedStages());
      const then = listOnlyByScreen(g, legacy.stageFor, legacy.supportedStages());
      let before = 0;
      const more: string[] = [];
      for (const screen of legacy.sweepScreens()) {
        const [a, b] = [now(screen), then(screen)];
        before += b.size;
        for (const id of a) if (!b.has(id)) more.push(`${id} at ${screen.w} × ${screen.h}`);
      }
      expect(more.slice(0, 3)).toEqual([]);
      if (name === "the side-wall overlay") expect(before).toBeGreaterThan(0);
    });
});

// T009 (spec 014; FR-060, FR-061, SC-002; contracts/frame-area.md §5): RG6 at the frame areas. RG6 reserves each
// stage's `reserved` boxes: a stage whose reserved box covers a selectable's core refuses that selectable by name; and,
// run at the frame areas and at spec 005's clear areas, each side-wall selectable is list-only at a screen's frame area
// only where it was at that screen's clear area.
describe("RG6 at the frame areas (spec 014, T009)", () => {
  it("refuses a selectable whose core lies under a stage's reserved box, by name", () => {
    const g = geometryOf(contextOf(repositoryTree(), mainPolicy()));
    if (!g) throw new Error("no geometry");
    const stage = { w: 1472, h: 1120.5 };
    const clean = pickSweep(g, [{ ...stage, reserved: [] }]);
    expect(clean.problems.filter((p) => p.mode === "3D")).toEqual([]);
    // A box over the first selectable's core, at the clear area's framing.
    const camera = framing(stage.w / stage.h, g.framed);
    const first = g.scene.value.selectables[0];
    const boxes = (first?.members ?? []).flatMap((m) => {
      const b = g.boxes.get(m);
      const r = b && memberRect(b, camera, stage);
      return r ? [r.rect] : [];
    });
    const union = unionOf(boxes);
    if (!union) throw new Error("no union");
    const over: Rect = [union[0] + union[2] / 2 - 30, union[1] + union[3] / 2 - 30, 60, 60];
    const sweep = pickSweep(g, [{ ...stage, reserved: [over] }]);
    const found = sweep.problems.filter((p) => p.mode === "3D" && p.problem.problem === "reserved");
    const sideWall = sideWallsOf(g)[0] ?? false;
    if (sideWall) expect(sweep.sideWalls.find((s) => s.index === 0)?.stages).toHaveLength(1);
    else expect(found.map((p) => p.problem.selectable)).toEqual(["0"]);
  });

  for (const [name, tree, policy] of [
    ["the repository's room", repositoryTree, mainPolicy],
    ["the side-wall overlay", sideWallTree, sideWallPolicy],
  ] as const)
    it(`lists a side-wall selectable of ${name} at a frame area only where spec 005 listed it at the clear area`, () => {
      const g = geometryOf(contextOf(tree(), policy()));
      if (!g) throw new Error("no geometry");
      const protect = protectorFor(protectSceneOfGeometry(g));
      const screens = sweepScreens().filter((_, i) => i % 7 === 0);
      const framed = screens.map((s) => stageFor(s, protect));
      const clear = screens.map((s) => stageFor(s));
      const now = pickSweep(g, framed);
      const then = pickSweep(g, clear);
      const at = (sweep: ReturnType<typeof pickSweep>, stages: readonly Stage[]) =>
        new Map(sweep.sideWalls.map((p) => [p.id, new Set(p.stages.map((s) => stages.indexOf(s)))]));
      const [a, b] = [at(now, framed), at(then, clear)];
      const more: string[] = [];
      for (const [id, set] of a)
        for (const i of set) if (!b.get(id)?.has(i)) more.push(`${id} at ${JSON.stringify(screens[i])}`);
      expect(more.slice(0, 3)).toEqual([]);
    });
});

// T053 (spec 014, the review's N3; FR-016): the room's protector, built from the bundle (protectSceneOf), and the
// compositor's, built from the compose's own geometry over the sweep (protectSceneOfGeometry), give one frame area
// at each screen, so the room is framed where the checks judged it.
describe("one frame area for the room and the checks (spec 014, T053; FR-016)", () => {
  it("gives the bundle's protector and the sweep's the same frame area and ease", () => {
    const { scene: part, index } = repositoryBundle();
    const g = geometryOf(contextOf(repositoryTree(), mainPolicy()));
    if (!g) throw new Error("no geometry");
    const room = protectorFor(protectSceneOf(part, index));
    const sweep = protectorFor(protectSceneOfGeometry(g));
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 1920, h: 1080 },
      { w: 2560, h: 1440 },
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
      { w: 768, h: 1024 },
    ]) {
      const a = frameArea(screen, OPENING, DEFAULT_METRICS, room);
      const b = frameArea(screen, OPENING, DEFAULT_METRICS, sweep);
      expect(a.ease, `${screen.w} × ${screen.h}`).toBe(b.ease);
      expect(a.area, `${screen.w} × ${screen.h}`).toEqual(b.area);
    }
  });

  // The Author's answer of 2026-11-10, "Move the walk control (Recommended)": with the walking control at the column's
  // head, the reference desktop's frame no longer eases around it at the clear area's corner (plan.md E1).
  it("eases the reference desktop's frame less than 10/16 with the walking control at the column's head", () => {
    const g = geometryOf(contextOf(repositoryTree(), mainPolicy()));
    if (!g) throw new Error("no geometry");
    expect(stageFor(REFERENCE_DESKTOP.screen, g.protect).ease).toBeLessThan(10 / 16);
  });
});
