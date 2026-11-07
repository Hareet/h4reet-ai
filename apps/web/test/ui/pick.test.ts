// T170 (spec 004; FR-064, SC-009; R-19, R-20; User Story 7's Independent Test; quickstart Q9): every hit area the
// repository's room draws, in 3D and in 2D, at the smallest stages (a 320 × 568 screen in portrait, 304 × 196 once
// T171's narrow-portrait rules grow the stage's reserve, and in landscape, 304 × 208), at R-19's 304 × 248, at the
// reference stages, and across the sweep of screen sizes (compose/stages.ts): each selectable keeps an exclusive core of
// at least 44 × 44 CSS pixels, except a side-wall selectable FR-064 leaves to the "In the room" list there; a pointer
// pick that hits no member goes to the nearest selectable whose pick area holds the point, and to none otherwise; and
// FR-064's carve-out on the page, as T302's answer has it: at every stage where the compositor's report lists a
// side-wall selectable as list-only, in 3D or in 2D at that stage's scale, it has no pick area and no 2D cue, a pick on
// its members selects nothing, and its "In the room" button selects it, while at every stage the report doesn't list,
// it is picked as any selectable is. The runtime's own pickers (scene/bundle3d.ts's selectablePicker, flat.ts's
// flatPicker) run at every stage; the page itself (the real 3D stage with a stand-in renderer, and the 2D room) at the
// stages that bound each side-wall selectable's runs.
import { afterEach, describe, expect, it, vi } from "vitest";

import { createContext } from "../../build/room/checks/family";
import { geometryOf, sideWallPicks } from "../../build/room/checks/rg";
import type { SideWallPick } from "../../build/room/checks/rg";
import { loadRoom } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";
import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import { CORE_PX, flatCore, listOnly, pickAreas, pickProblems } from "../../src/room/compose/pick";
import type { PickArea, Rect } from "../../src/room/compose/pick";
import {
  FLAT_VIEW,
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  SMALLEST,
  flatScale,
  supportedStages,
} from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { flatPicker } from "../../src/room/flat";
import { framedBoxes, pickAreasOn, selectablePicker } from "../../src/room/scene/bundle3d";
import type { SceneModule } from "../../src/room/stage";
import { REPO, flush, intoRoom, repositoryBundle, start } from "../helpers/room";
import type { TestWindow, Visit } from "../helpers/room";

/** What the real scene module draws with on the page: a stand-in renderer, as test/ui/degraded.test.ts swaps it in. */
const swapped = vi.hoisted(() => ({ renderer: null as ((parameters: unknown) => unknown) | null }));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

afterEach(() => {
  swapped.renderer = null;
});

type Point = readonly [number, number];

const room = (): { scene: RoomScene; index: RoomIndex } => repositoryBundle();
const ids = (): string[] => room().index.selectables.map((s) => s.id);
const sideWalls = (): ReadonlySet<string> =>
  new Set(
    room()
      .index.selectables.filter((s) => s.side_wall)
      .map((s) => s.id),
  );
const key = (s: Stage): string => `${s.w} × ${s.h}`;

let report: Map<string, SideWallPick> | null = null;
/** The compositor's report's side-wall section (FR-073; build/room/report.ts): each side-wall selectable it lists as
 *  list-only somewhere, with the stages where it is, in 3D and in 2D. */
function listed(): Map<string, SideWallPick> {
  if (report) return report;
  const tree = fileTree(REPO);
  const policy = readRoomPolicy({ env: process.env, root: REPO });
  const { ctx } = createContext(loadRoom(tree), policy, { mode: "lenient", drafts: false }, tree);
  report = new Map(sideWallPicks(geometryOf(ctx)).map((p) => [p.id, p] as const));
  return report;
}
const listOnly3d = (id: string, stage: Stage): boolean =>
  listed()
    .get(id)
    ?.stages.some((s) => s.w === stage.w && s.h === stage.h) ?? false;
const listOnly2d = (id: string, stage: Stage): boolean =>
  listed()
    .get(id)
    ?.flat.some((s) => flatScale(s) === flatScale(stage)) ?? false;

// ---- The areas, as the runtime computes them ----

/** The 3D room's areas on a stage, as selectablePicker computes them: the members' frame boxes at the stage's framing. */
function areas3d(stage: Stage): PickArea[] {
  const { scene: part, index } = room();
  return pickAreasOn(part, index, framing(stage.w / stage.h, framedBoxes(part)), stage);
}

/** The 2D room's areas at a stage's scale, as flatPicker computes them, in the drawing's view-box units. */
function areas2d(stage: Stage): PickArea[] {
  return pickAreas(
    room().index.flat.hits.map((hit) => ({
      id: hit.selectable,
      members: hit.rects.map((rect, k) => ({ rect, depth: hit.depths[k] ?? Number.POSITIVE_INFINITY })),
    })),
    flatCore(stage),
  );
}

const VIEW_2D: Rect = [0, 0, FLAT_VIEW.w, FLAT_VIEW.h];
const view3d = (stage: Stage): Rect => [0, 0, stage.w, stage.h];

const inside = (p: Point, r: Rect): boolean =>
  p[0] >= r[0] && p[0] <= r[0] + r[2] && p[1] >= r[1] && p[1] <= r[1] + r[3];

/** Points across a core, inset half a pixel from its edges: its corners, its edges' middles, and its centre. */
function corePoints(core: Rect, inset: number): Point[] {
  const [x, y, w, h] = core;
  const xs = [x + inset, x + w / 2, x + w - inset];
  const ys = [y + inset, y + h / 2, y + h - inset];
  return xs.flatMap((px) => ys.map((py) => [px, py] as const));
}

/** Points on a selectable's members where one of its members is the frontmost under the point, up to `most`. */
function ownMemberPoints(areas: readonly PickArea[], id: string, view: Rect, most = 3): Point[] {
  const own = areas.find((a) => a.id === id);
  const out: Point[] = [];
  for (const m of own?.members ?? []) {
    const [x, y, w, h] = m.rect;
    for (const fx of [0.5, 0.25, 0.75]) {
      for (const fy of [0.5, 0.25, 0.75]) {
        const p: Point = [x + fx * w, y + fy * h];
        if (!inside(p, view)) continue;
        let front: { id: string; depth: number } | null = null;
        for (const a of areas)
          for (const other of a.members)
            if (inside(p, other.rect) && (front === null || other.depth < front.depth))
              front = { id: a.id, depth: other.depth };
        if (front?.id === id && out.length < most) out.push(p);
      }
    }
  }
  return out;
}

/** FR-064's nearest rule, written out here apart from compose/pick.ts: a point on no member goes to the selectable,
 *  among those not held, whose union or core holds it and whose union is nearest, ties to scene order; else none. */
function nearest(areas: readonly PickArea[], p: Point, held: ReadonlySet<string>): string | null {
  let best: { id: string; d: number } | null = null;
  for (const a of areas) {
    if (held.has(a.id) || !a.union || !a.core) continue;
    if (!inside(p, a.union) && !inside(p, a.core)) continue;
    const [x, y, w, h] = a.union;
    const d = Math.hypot(Math.max(x - p[0], 0, p[0] - (x + w)), Math.max(y - p[1], 0, p[1] - (y + h)));
    if (best === null || d < best.d) best = { id: a.id, d };
  }
  return best?.id ?? null;
}

const onAnyMember = (areas: readonly PickArea[], p: Point): boolean =>
  areas.some((a) => a.members.some((m) => inside(p, m.rect)));

/** A point of a stage in normalized device coordinates, as bindPointerSelection gives a picker one. */
const ndc = ([x, y]: Point, size: { w: number; h: number }): { x: number; y: number } => ({
  x: (x / size.w) * 2 - 1,
  y: 1 - (y / size.h) * 2,
});

/** The 2D drawing's box on a stage: the view box at the stage's scale (room.css's `.flat`). */
const flatBox = (stage: Stage): { w: number; h: number } => {
  const s = flatScale(stage);
  return { w: FLAT_VIEW.w * s, h: FLAT_VIEW.h * s };
};

/** A view-box point as a point of the drawing's box. */
const fromView = ([x, y]: Point, stage: Stage): Point => [x * flatScale(stage), y * flatScale(stage)];

// ---- The stages ----

/** The smallest stages and the reference ones, all supported stages. */
function namedStages(): Stage[] {
  return [...SMALLEST.map((s) => s.stage), REFERENCE_PHONE.stage, REFERENCE_DESKTOP.stage];
}

/** R-19's 304 × 248, the 320 × 568 screen's stage before T171's toolbar row: now no screen's stage in the sweep, so the
 *  report lists nothing there, but the picks are checked there too. */
const R19_PORTRAIT: Stage = { w: 304, h: 248 };

/** The supported stages with one per 2D scale, the first by size: in 2D only the scale counts. */
function oneStagePerScale(): Stage[] {
  const seen = new Map<number, Stage>();
  for (const s of supportedStages()) if (!seen.has(flatScale(s))) seen.set(flatScale(s), s);
  return [...seen.values()];
}

describe("the stages under test (R-19; compose/stages.ts)", () => {
  it("start at the smallest: 304 × 196 for 320 × 568 in portrait, 304 × 208 for 568 × 320 in landscape", () => {
    expect(SMALLEST.map((s) => s.screen)).toEqual([
      { w: 320, h: 568 },
      { w: 568, h: 320 },
    ]);
    expect(SMALLEST.map((s) => s.stage)).toEqual([
      { w: 304, h: 196 },
      { w: 304, h: 208 },
    ]);
    const all = new Set(supportedStages().map(key));
    for (const s of namedStages()) expect(all.has(key(s)), key(s)).toBe(true);
    expect(all.has(key(R19_PORTRAIT))).toBe(false);
  });
});

describe("every hit area, at least 44 × 44 CSS px with its exclusive core (FR-064)", () => {
  it("in 3D at every supported stage, but where FR-064 leaves a side-wall selectable to the list", () => {
    const walls = sideWalls();
    for (const stage of supportedStages()) {
      const areas = areas3d(stage);
      expect(areas.map((a) => a.id)).toEqual(ids());
      const held = listOnly(areas, view3d(stage), walls);
      for (const id of held) expect(walls.has(id), `${id} held at ${key(stage)}`).toBe(true);
      for (const a of areas.filter((x) => !held.has(x.id))) {
        expect(a.core?.[2], `${a.id} at ${key(stage)}`).toBeGreaterThanOrEqual(CORE_PX);
        expect(a.core?.[3], `${a.id} at ${key(stage)}`).toBeGreaterThanOrEqual(CORE_PX);
      }
      expect(pickProblems(areas, view3d(stage), held), key(stage)).toEqual([]);
    }
    expect(CORE_PX).toBeGreaterThanOrEqual(44);
  });

  it("in 2D at every supported stage's scale, its core 44 px at that scale, with the same exception", () => {
    const walls = sideWalls();
    for (const stage of oneStagePerScale()) {
      const areas = areas2d(stage);
      const held = listOnly(areas, VIEW_2D, walls);
      for (const id of held) expect(walls.has(id), `${id} held at ${flatScale(stage)}`).toBe(true);
      for (const a of areas.filter((x) => !held.has(x.id))) {
        const [, , w = 0, h = 0] = a.core ?? [];
        expect(w * flatScale(stage), `${a.id} at ${flatScale(stage)}`).toBeGreaterThanOrEqual(CORE_PX - 1e-9);
        expect(h * flatScale(stage), `${a.id} at ${flatScale(stage)}`).toBeGreaterThanOrEqual(CORE_PX - 1e-9);
      }
      expect(pickProblems(areas, VIEW_2D, held), String(flatScale(stage))).toEqual([]);
    }
  });

  it.each([...namedStages(), R19_PORTRAIT].map((s) => [key(s), s] as const))(
    "picks each selectable it keeps all over its core on the %s stage, in 3D and in 2D",
    (_, stage) => {
      const { scene: part, index } = room();
      const walls = sideWalls();
      const picker3d = selectablePicker(part, index);
      picker3d.resize(stage);
      const areas = areas3d(stage);
      const held = listOnly(areas, view3d(stage), walls);
      for (const a of areas.filter((x) => !held.has(x.id) && x.core)) {
        for (const p of corePoints(a.core as Rect, 0.5))
          expect(picker3d.pick(ndc(p, stage)), `${a.id} at ${p.join(", ")}`).toBe(a.id);
      }
      const box = flatBox(stage);
      const picker2d = flatPicker(index.flat.hits, index);
      picker2d.resize(box);
      const flat = areas2d(stage);
      const flatHeld = listOnly(flat, VIEW_2D, walls);
      expect([...picker2d.held()].sort()).toEqual([...flatHeld].sort());
      for (const a of flat.filter((x) => !flatHeld.has(x.id) && x.core)) {
        for (const p of corePoints(a.core as Rect, 0.5 / flatScale(stage)))
          expect(picker2d.pick(ndc(fromView(p, stage), box)), `${a.id} at ${p.join(", ")}`).toBe(a.id);
      }
    },
  );
});

describe("a pick that hits no selectable's member (FR-064)", () => {
  it.each([...namedStages(), R19_PORTRAIT].map((s) => [key(s), s] as const))(
    "goes on the %s stage to the nearest selectable whose pick area holds the point, and to none otherwise",
    (_, stage) => {
      const { scene: part, index } = room();
      const walls = sideWalls();
      const counts = { nearest: 0, none: 0 };
      // 3D: points every 4 px across the stage.
      const picker3d = selectablePicker(part, index);
      picker3d.resize(stage);
      const areas = areas3d(stage);
      const held = listOnly(areas, view3d(stage), walls);
      for (let y = 2; y < stage.h; y += 4) {
        for (let x = 2; x < stage.w; x += 4) {
          const p: Point = [x, y];
          if (onAnyMember(areas, p)) continue;
          const want = nearest(areas, p, held);
          counts[want === null ? "none" : "nearest"] += 1;
          expect(picker3d.pick(ndc(p, stage)), `3D ${p.join(", ")}`).toBe(want);
        }
      }
      // 2D: points every 2 view-box units across the drawing.
      const box = flatBox(stage);
      const picker2d = flatPicker(index.flat.hits, index);
      picker2d.resize(box);
      const flat = areas2d(stage);
      const flatHeld = listOnly(flat, VIEW_2D, walls);
      for (let y = 1; y < FLAT_VIEW.h; y += 2) {
        for (let x = 1; x < FLAT_VIEW.w; x += 2) {
          const p: Point = [x, y];
          if (onAnyMember(flat, p)) continue;
          const want = nearest(flat, p, flatHeld);
          counts[want === null ? "none" : "nearest"] += 1;
          expect(picker2d.pick(ndc(fromView(p, stage), box)), `2D ${p.join(", ")}`).toBe(want);
        }
      }
      // Both outcomes come up: a point in a pick area off its members, and a point in none.
      expect(counts.nearest).toBeGreaterThan(0);
      expect(counts.none).toBeGreaterThan(0);
    },
  );
});

describe("FR-064's carve-out, as the report lists it (T302)", () => {
  it("lists only side-wall selectables, and each the index flags side_wall", () => {
    const walls = sideWalls();
    expect(walls.size).toBeGreaterThan(0);
    for (const id of listed().keys()) expect(walls.has(id), id).toBe(true);
  });

  it("holds each side-wall selectable in 3D at exactly the stages the report lists, by the runtime's picker", () => {
    const { scene: part, index } = room();
    const walls = [...sideWalls()];
    const picker = selectablePicker(part, index);
    for (const stage of supportedStages()) {
      picker.resize(stage);
      const areas = areas3d(stage);
      for (const id of walls) {
        const area = areas.find((a) => a.id === id);
        if (!area?.core) continue;
        if (listOnly3d(id, stage)) {
          for (const p of ownMemberPoints(areas, id, view3d(stage), 1))
            expect(picker.pick(ndc(p, stage)), `${id}'s member at ${key(stage)}`).toBeNull();
          const [x, y, w, h] = area.core;
          expect(picker.pick(ndc([x + w / 2, y + h / 2], stage)), `${id}'s core at ${key(stage)}`).not.toBe(id);
        } else {
          const [x, y, w, h] = area.core;
          expect(picker.pick(ndc([x + w / 2, y + h / 2], stage)), `${id} at ${key(stage)}`).toBe(id);
        }
      }
    }
  });

  it("holds each side-wall selectable in 2D at exactly the scales the report lists, by the runtime's picker", () => {
    const { index } = room();
    const walls = [...sideWalls()];
    const picker = flatPicker(index.flat.hits, index);
    for (const stage of oneStagePerScale()) {
      const box = flatBox(stage);
      picker.resize(box);
      for (const id of walls) expect(picker.held().has(id), `${id} at ${flatScale(stage)}`).toBe(listOnly2d(id, stage));
    }
  });

  /** For each side-wall selectable, the stages that bound its runs: the first and last it is list-only at, and the
   *  first and last it isn't, in 3D or (by `flat`) in 2D; with the named stages. */
  function bounds(flat: boolean): Stage[] {
    const stages = flat ? oneStagePerScale() : supportedStages();
    const out = new Map<string, Stage>(namedStages().map((s) => [key(s), s] as const));
    for (const id of sideWalls()) {
      const by = (on: boolean): Stage[] => stages.filter((s) => (flat ? listOnly2d(id, s) : listOnly3d(id, s)) === on);
      for (const run of [by(true), by(false)]) for (const s of [run[0], run.at(-1)]) if (s) out.set(key(s), s);
    }
    return [...out.values()];
  }

  /** The selections the page made since the last call, by ID. */
  function selections(v: Visit): string[] {
    const out = v.events.flatMap((e) => (e.kind === "object_selected" && e.id !== undefined ? [e.id] : []));
    v.events.length = 0;
    return out;
  }

  function tap(win: TestWindow, el: Element, [clientX, clientY]: Point): void {
    const init = { bubbles: true, pointerType: "touch", clientX, clientY, button: 0 };
    el.dispatchEvent(new win.PointerEvent("pointerdown", init));
    el.dispatchEvent(new win.PointerEvent("pointerup", init));
  }

  function sized(el: Element, size: { w: number; h: number }): void {
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: size.w, bottom: size.h, width: size.w, height: size.h, x: 0, y: 0 }) as DOMRect;
  }

  it("on the 3D page: no pick area where listed, its members selecting nothing, and its button selecting it", async () => {
    const renderer = {
      autoClear: true,
      outputColorSpace: "",
      shadowMap: { enabled: true },
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      initTexture: () => undefined,
      render: () => undefined,
      dispose: () => undefined,
    };
    swapped.renderer = () => renderer;
    const v = start({ webgl: true, loadScene: () => import("../../src/room/scene") as Promise<SceneModule> });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("3d");
    const canvas = v.doc.querySelector("canvas");
    if (!canvas) throw new Error("no canvas");
    let size = { w: 0, h: 0 };
    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => size.w });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => size.h });
    const walls = [...sideWalls()];
    for (const stage of bounds(false)) {
      size = { w: stage.w, h: stage.h };
      sized(canvas, size);
      // The next frame measures the canvas, and the picker follows its size.
      v.clock.advance(50);
      await flush();
      selections(v);
      const areas = areas3d(stage);
      for (const id of walls) {
        const area = areas.find((a) => a.id === id);
        const where = `${id} at ${key(stage)}`;
        if (listOnly3d(id, stage)) {
          const points = ownMemberPoints(areas, id, view3d(stage));
          expect(points.length, where).toBeGreaterThan(0);
          for (const p of points) tap(v.win, canvas, p);
          expect(selections(v), where).toEqual([]);
        } else if (area?.core) {
          const [x, y, w, h] = area.core;
          tap(v.win, canvas, [x + w / 2, y + h / 2]);
          expect(selections(v), where).toEqual([id]);
        }
        v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`)?.click();
        expect(selections(v), `${where}, its button`).toEqual([id]);
      }
    }
  });

  it("on the 2D page: no cue and no pick where listed, its members selecting nothing, and its button selecting it", async () => {
    const v = start({ webgl: false });
    await intoRoom(v);
    const flat = v.doc.querySelector(".flat");
    if (!flat) throw new Error("no 2D drawing");
    const walls = [...sideWalls()];
    const { index } = room();
    const cueOf = (id: string): Element | undefined => {
      const name = index.selectables.find((s) => s.id === id)?.name;
      return [...flat.querySelectorAll("text.flat-cue-name")].find((t) => t.textContent === name);
    };
    for (const stage of bounds(true)) {
      const box = flatBox(stage);
      sized(flat, box);
      // A pointer's move measures the drawing's box, as any pick does.
      flat.dispatchEvent(
        new v.win.PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 1, clientY: 1 }),
      );
      selections(v);
      const areas = areas2d(stage);
      for (const id of walls) {
        const where = `${id} at ${flatScale(stage)}`;
        const tag = cueOf(id);
        const area = tag?.previousElementSibling;
        if (listOnly2d(id, stage)) {
          expect(area?.getAttribute("visibility"), `${where}: its cue`).toBe("hidden");
          expect(tag?.getAttribute("visibility"), `${where}: its name tag`).toBe("hidden");
          const points = ownMemberPoints(areas, id, VIEW_2D);
          expect(points.length, where).toBeGreaterThan(0);
          for (const p of points) tap(v.win, flat, fromView(p, stage));
          expect(selections(v), where).toEqual([]);
        } else {
          expect(area?.getAttribute("visibility"), `${where}: its cue`).toBe("visible");
          const core = areas.find((a) => a.id === id)?.core;
          if (!core) throw new Error(`${where}: no core`);
          tap(v.win, flat, fromView([core[0] + core[2] / 2, core[1] + core[3] / 2], stage));
          expect(selections(v), where).toEqual([id]);
        }
        v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`)?.click();
        expect(selections(v), `${where}, its button`).toEqual([id]);
      }
    }
  });
});
