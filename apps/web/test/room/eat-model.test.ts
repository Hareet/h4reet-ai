// verify-024 (spec 024; FR-001, FR-012; plan.md §5.5; page Q247, the Author's answer of 2026-11-13): "a dinosaur visit
// reserves the Eat box, and the compositor checks and reports it, only when the bundle carries the dinosaur's model
// (the tile can't show without it, FR-001)". Each place, with the dinosaur's model and without it:
// - the bundle: whether it carries the model, as the 3D part's `avatars.dinosaur` (build/room/avatars.ts's
//   carriesModel), and the compositor's own reading of it for a compose (rg.ts's dinosaurVisit);
// - the report's dinosaur visit lines (report.ts's dinosaurLines);
// - RG6's refusals found in the variant sweep alone (rg.ts's spacingReasons, over the variant the geometry still
//   builds: a test's geometry judges it whole);
// - the 3D stage (scene.ts's `eats`): the Eat box reserved, and the eating's `eat` given to the room.
// The dinosaur's folder is spec 021's test folder (helpers/room-dinosaur.ts), never the asset (spec 009's FR-043).
// premise-028 (spec 028, page Q49): the 3D stage's case without the model builds its bundle on purpose, as the
// repository no longer stands in for it (his intake, a556a933, bundles the model).
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { avatarsOf, carriesModel } from "../../build/room/avatars";
import { createContext } from "../../build/room/checks/family";
import {
  dinosaurVisit,
  geometryOf,
  protectSceneOfGeometry,
  sideWallsOf,
  spacingReasons,
} from "../../build/room/checks/rg";
import type { Geometry } from "../../build/room/checks/rg";
import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import type { RoomScene } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import type { Box as WorldBox } from "../../src/room/compose/framing";
import { DEFAULT_METRICS, eatControlBox, hudBoxes, walkControlBox } from "../../src/room/compose/hud";
import { CORE_PX, memberRect } from "../../src/room/compose/pick";
import type { Rect } from "../../src/room/compose/pick";
import { protectorFor } from "../../src/room/compose/protect";
import { REFERENCE_PHONE } from "../../src/room/compose/stages";
import { createScene } from "../../src/room/scene";
import { FakeClock, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { avatarPolicy, nightFiles } from "../helpers/room-avatars";
import { dinosaurFolder, dinosaurNight } from "../helpers/room-dinosaur";
import { overlay, sideWallPolicy, sideWallTree } from "../helpers/room-fixtures";

const swapped = vi.hoisted(() => ({ part: null as RoomScene | null }));

vi.mock("virtual:room-scene", async (importOriginal) => {
  const own = await importOriginal<{ default: RoomScene }>();
  return {
    get default() {
      return swapped.part ?? own.default;
    },
  };
});

// jsdom draws no WebGL: a renderer that draws nothing.
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(): unknown {
    return {
      autoClear: true,
      outputColorSpace: "",
      shadowMap: { enabled: true },
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      initTexture: () => undefined,
      render: () => undefined,
      dispose: () => undefined,
    };
  }
  return { ...three, WebGLRenderer };
});

/** The night's woman and man (the man the twin's stand-in), with the dinosaur's folder or without it. */
const tree = (dinosaur: boolean): Tree => overlay({ ...nightFiles(), ...(dinosaur ? dinosaurFolder() : {}) });
const contextOf = (t: Tree, policy: RoomPolicy) =>
  createContext(loadRoom(t), policy, { mode: "lenient", drafts: false }, t).ctx;

let without: ComposeResult | null = null;
/** The night's room without the dinosaur's folder, composed once as dinosaurNight() composes it with the folder. */
function nightWithout(): ComposeResult {
  without ??= compose(tree(false), avatarPolicy(), { mode: "lenient", drafts: false });
  return without;
}

const HEAD = "A 3D dinosaur visit (spec 024, Q150)";

describe("whether the bundle carries the dinosaur's model", () => {
  it("is the 3D part's avatars.dinosaur: not without the folder, and with it", () => {
    for (const [result, dinosaur] of [
      [nightWithout(), false],
      [dinosaurNight(), true],
    ] as const) {
      expect(Object.hasOwn(result.scene.avatars, "dinosaur")).toBe(dinosaur);
      const t = tree(dinosaur);
      const set = avatarsOf(t, avatarPolicy(), loadRoom(t).scene?.value ?? null);
      expect(carriesModel(set, "dinosaur"), `carriesModel, the folder ${dinosaur ? "in" : "out"}`).toBe(dinosaur);
    }
  });

  it("is what the compositor's checks read for a compose (rg.ts's dinosaurVisit)", () => {
    expect(dinosaurVisit(contextOf(tree(false), avatarPolicy()))).toBe(false);
    expect(dinosaurVisit(contextOf(tree(true), avatarPolicy()))).toBe(true);
  });
});

describe("the report's dinosaur visit lines (report.ts)", () => {
  it("prints none without the model: the report names no dinosaur", () => {
    const report = nightWithout().report.markdown;
    expect(report.split("\n").some((l) => l.startsWith(HEAD))).toBe(false);
    expect(report).not.toMatch(/dinosaur/);
  });

  it("prints them with the model, after the frame lines", () => {
    const lines = dinosaurNight().report.markdown.split("\n");
    const head = lines.findIndex((l) => l.startsWith(`${HEAD}: `));
    expect(head).toBeGreaterThan(0);
    expect(lines[head - 1]).toBe("");
    expect(lines[head]).toContain("stages over the same screens, checked by RG6 and RG7 and not emitted");
    expect(lines[head + 1]).toMatch(/^- The reference desktop \(1920 × 1200\): /);
    expect(lines[head + 2]).toMatch(/^- The reference phone \(384 × 740\): /);
  });
});

const overlaps = (a: Rect, b: Rect): boolean =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** A small world box whose 44 × 44 core, at a screen's clear area, lies over the Eat box and clear of the walking
 *  control's box, its core's centre at most `left` of the stage's width in (eat-checks.test.ts's search). */
function boxUnderEat(g: Geometry, screen: { w: number; h: number }, left: number): WorldBox {
  const clear = hudBoxes(screen).clear;
  const stage = { w: clear.w, h: clear.h };
  const camera = framing(stage.w / stage.h, g.framed);
  const eat = eatControlBox(clear) as Rect;
  const walk = walkControlBox(clear) as Rect;
  for (let x = 1; x > -1; x -= 0.02)
    for (let y = 0; y < 1; y += 0.02)
      for (let z = -0.03; z > -0.8; z -= 0.02) {
        const b: WorldBox = { min: [x, y, z - 0.03], max: [x + 0.03, y + 0.03, z] };
        const r = memberRect(b, camera, stage);
        if (!r) continue;
        const cx = r.rect[0] + r.rect[2] / 2;
        const cy = r.rect[1] + r.rect[3] / 2;
        const core: Rect = [cx - CORE_PX / 2, cy - CORE_PX / 2, CORE_PX, CORE_PX];
        if (!overlaps(core, eat) || overlaps(core, walk)) continue;
        if (core[0] < 0 || core[1] < 0 || core[0] + core[2] > stage.w || core[1] + core[3] > stage.h) continue;
        if (cx > left * stage.w) continue;
        return b;
      }
  throw new Error("no box under the Eat box");
}

describe("RG6's refusals found in the variant sweep alone (rg.ts's spacingReasons)", () => {
  // eat-checks.test.ts's case: a selectable moved under the Eat box at the reference phone's clear area, both
  // protectors stubbed to find no frame area, so the variant alone refuses it.
  function stubbed(): { g: Geometry; index: number } {
    const g = geometryOf(contextOf(sideWallTree(), sideWallPolicy()));
    if (!g) throw new Error("no geometry");
    const index = sideWallsOf(g).findIndex((f) => !f);
    const to = boxUnderEat(g, REFERENCE_PHONE.screen, 0.4);
    const boxes = new Map(g.boxes);
    for (const m of g.scene.value.selectables[index]?.members ?? []) boxes.set(m, to);
    const next = { ...g, boxes } as Geometry;
    const scene = protectSceneOfGeometry(next);
    const moved = {
      ...next,
      protect: protectorFor(scene),
      protectEat: protectorFor(scene, DEFAULT_METRICS.rem, { eat: true }),
    };
    return {
      g: {
        ...moved,
        protect: { key: `stub:${Math.random()}`, boxes: () => null },
        protectEat: { key: `stub-eat:${Math.random()}`, eat: true, boxes: () => null },
      } as Geometry,
      index,
    };
  }

  it("names the dinosaur visit's refusal with the model, and leaves only the plain visit's without it", () => {
    const { g, index } = stubbed();
    const own = (dinosaur: boolean) => spacingReasons(g, dinosaur).filter((r) => r.selectable === index);
    expect(own(true).some((r) => r.reason.includes("for a 3D dinosaur visit"))).toBe(true);
    expect(own(false).filter((r) => r.reason.includes("dinosaur") || r.reason.includes('"Eat"'))).toEqual([]);
    expect(spacingReasons(g, false)).toEqual(spacingReasons(g, true).filter((r) => !r.reason.includes("dinosaur")));
  });
});

describe("the 3D stage (scene.ts's eats)", () => {
  function stageOver(part: RoomScene): ReturnType<typeof createScene> {
    swapped.part = part;
    const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, {
      url: "http://127.0.0.1:18105/",
      pretendToBeVisual: true,
    }).window as unknown as TestWindow;
    win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    // No file is answered: what's read here is set when the stage is made.
    Object.defineProperty(win, "fetch", { configurable: true, value: () => new Promise<Response>(() => undefined) });
    return createScene({
      win,
      doc: win.document,
      clock: new FakeClock(),
      room: repositoryBundle().index,
      avatar: "dinosaur",
      reducedMotion: false,
      select: () => undefined,
      onFrame: () => undefined,
      floor: true,
      handoff: Promise.resolve(),
      eating: { state: () => ({ paused: false, loading: false }), available: () => undefined },
    });
  }

  it("reserves no Eat box and gives no eating to a dinosaur visit whose bundle has no dinosaur's model", () => {
    // premise-028 (spec 028, page Q49; probe-dino.md §4 T-a): the bundle without the model is built on purpose, the
    // repository's part with `avatars.dinosaur` taken out, since his intake (a556a933) puts the model in the repository.
    const repo = repositoryBundle().scene;
    const part = {
      ...repo,
      avatars: Object.fromEntries(Object.entries(repo.avatars).filter(([id]) => id !== "dinosaur")),
    } as RoomScene;
    expect(Object.hasOwn(part.avatars, "dinosaur")).toBe(false);
    expect(part.placements.some((p) => p.edible !== null)).toBe(true);
    const stage = stageOver(part);
    try {
      expect(stage.protect?.eat).not.toBe(true);
      expect(stage.eat).toBeUndefined();
    } finally {
      stage.dispose();
      swapped.part = null;
    }
  });

  it("reserves the Eat box and gives the eating with the model", () => {
    const dinosaur = dinosaurNight().scene.avatars.dinosaur;
    expect(dinosaur).toBeDefined();
    const repo = repositoryBundle().scene;
    const stage = stageOver({ ...repo, avatars: { ...repo.avatars, dinosaur } } as RoomScene);
    try {
      expect(stage.protect?.eat).toBe(true);
      expect(stage.eat).toBeDefined();
    } finally {
      stage.dispose();
      swapped.part = null;
    }
  });
});
