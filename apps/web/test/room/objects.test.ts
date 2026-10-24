// T039 (spec 002; FR-020, FR-043–FR-045; contracts/room-scene.md §2): the three ways to select an object (a pick from a
// mouse, a touch, and the "In the room" list's button) each call selectObject with the same ID, and a pick in the 2D
// drawing does too (spec 004's T109 took its buttons away; test/room/flat.test.ts holds the 2D room).
// T092 (spec 004; FR-064; R-20): the 3D pick goes through compose/pick.ts as the compositor's spacing check (RG6)
// measures it: each selectable's members' frame boxes, projected with the camera's framing into CSS-pixel rectangles
// on the stage, with their union and exclusive core, recomputed when the stage's size changes (the 3D room's
// selectablePicker, src/room/scene/bundle3d.ts), here held to three.js's own projection, with no renderer. The
// selectables and their IDs come from compose() over the repository, never from a list in the test, and the room
// takes a selection only for an ID its index lists (src/room/app.ts).
// T112 (spec 004; FR-005, FR-007; R-16): src/room/objects.ts holds no list of the room's objects, nor a check against
// one: it keeps the tap's slop, toNdc, and bindPointerSelection over string IDs.
import { JSDOM } from "jsdom";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { renderObjectList } from "../../src/room/a11y";
import type { Box } from "../../src/room/compose/bundle";
import { flatCore, pick, pickAreas, pickProblems } from "../../src/room/compose/pick";
import type { MemberRect, PickArea } from "../../src/room/compose/pick";
import {
  FLAT_VIEW,
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  SMALLEST,
  flatScale,
  supportedStages,
} from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { renderFlat } from "../../src/room/flat";
import { bindPointerSelection } from "../../src/room/objects";
import { frameCamera, framedBoxes, selectablePicker } from "../../src/room/scene/bundle3d";
import { intoRoom, repositoryBundle, roomIndex, start, talkLog } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

type Point = readonly [number, number];

/** The reference stages and the smallest, where the compositor holds every selectable's core in view (RG6). */
const STAGES: readonly Stage[] = [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage, ...SMALLEST.map((s) => s.stage)];
/** How far apart the points are that the pick is checked at, in CSS pixels. */
const STEP = 6;

/**
 * Each selectable's pick area on a stage, by three.js: its members' frame boxes, never loaded geometry, projected by a
 * camera framed as the room frames it, each the bounds of its corners in the stage's CSS pixels, at the depth of its
 * nearest corner; then compose/pick.ts's union and core.
 */
function threeAreas(stage: Stage): PickArea[] {
  const { scene: part, index } = repositoryBundle();
  const camera = new PerspectiveCamera();
  frameCamera(camera, stage.w / stage.h, framedBoxes(part));
  const boxes = new Map<string, Box>();
  for (const p of part.placements) if (!boxes.has(p.id)) boxes.set(p.id, p.frame_box);
  const member = ({ min, max }: Box): MemberRect => {
    let [x0, y0, x1, y1, depth] = [Infinity, Infinity, -Infinity, -Infinity, Infinity];
    for (const x of [min[0], max[0]])
      for (const y of [min[1], max[1]])
        for (const z of [min[2], max[2]]) {
          const corner = new Vector3(x, y, z);
          depth = Math.min(depth, -corner.clone().applyMatrix4(camera.matrixWorldInverse).z);
          corner.project(camera);
          const [px, py] = [((corner.x + 1) / 2) * stage.w, ((1 - corner.y) / 2) * stage.h];
          [x0, y0, x1, y1] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py)];
        }
    return { rect: [x0, y0, x1 - x0, y1 - y0], depth };
  };
  return pickAreas(
    index.selectables.map((s) => ({
      id: s.id,
      members: s.members.flatMap((m) => {
        const box = boxes.get(m);
        return box ? [member(box)] : [];
      }),
    })),
  );
}

/** A point of a stage in normalized device coordinates, as bindPointerSelection hands the picker one. */
const ndcOf = ([x, y]: Point, stage: Stage): { x: number; y: number } => ({
  x: (x / stage.w) * 2 - 1,
  y: 1 - (y / stage.h) * 2,
});

/** The centre of a selectable's exclusive core. */
function centre(area: PickArea): Point {
  if (!area.core) throw new Error(`${area.id} has no core`);
  const [x, y, w, h] = area.core;
  return [x + w / 2, y + h / 2];
}

/** Points across a stage, STEP apart. */
function grid(stage: Stage): Point[] {
  const points: Point[] = [];
  for (let y = STEP / 2; y < stage.h; y += STEP) for (let x = STEP / 2; x < stage.w; x += STEP) points.push([x, y]);
  return points;
}

/** The areas the room draws at a stage (FR-064's amendment, 2026-10-23): all of them but the side-wall selectables
 *  the stage can't give its exclusive core to, which the room draws no pick area for and the "In the room" list
 *  reaches. */
function held(
  areas: readonly PickArea[],
  index: { readonly selectables: readonly { readonly id: string; readonly side_wall: boolean }[] },
  stage: Stage,
): PickArea[] {
  const flagged = new Set(pickProblems(areas, [0, 0, stage.w, stage.h]).map((p) => p.selectable));
  const side = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
  return areas.filter((a) => !(side.has(a.id) && flagged.has(a.id)));
}

/** Where a picker over `stage` picks otherwise than compose/pick.ts over `areas`, the first few. */
function disagreements(picked: (p: Point) => string | null, areas: readonly PickArea[], stage: Stage): string[] {
  const out: string[] = [];
  for (const p of grid(stage)) {
    const [got, want] = [picked(p), pick(areas, p)];
    if (got !== want && out.length < 5) out.push(`${p.join(", ")}: ${String(got)}, not ${String(want)}`);
  }
  return out;
}

function surface(stage: Stage): { doc: Document; win: TestWindow; canvas: HTMLCanvasElement } {
  const win = new JSDOM("<main></main>", { pretendToBeVisual: true }).window as unknown as TestWindow;
  const doc = win.document;
  const canvas = doc.createElement("canvas");
  doc.body.append(canvas);
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: stage.w, bottom: stage.h, width: stage.w, height: stage.h, x: 0, y: 0 }) as DOMRect;
  return { doc, win, canvas };
}

function tap(win: TestWindow, el: Element, [clientX, clientY]: Point, pointerType: string, drag = 0): void {
  const init = { bubbles: true, pointerType, clientX, clientY, button: 0 };
  el.dispatchEvent(new win.PointerEvent("pointerdown", init));
  el.dispatchEvent(new win.PointerEvent("pointerup", { ...init, clientX: clientX + drag }));
}

describe("the 3D pick (compose/pick.ts)", () => {
  it.each(STAGES.map((s) => [`${s.w} × ${s.h}`, s] as const))(
    "picks as three.js projects the members' frame boxes, on the %s stage",
    (_, stage) => {
      const { scene: part, index } = repositoryBundle();
      const picker = selectablePicker(part, index);
      picker.resize(stage);
      const areas = threeAreas(stage);
      expect(areas.map((a) => a.id)).toEqual(index.selectables.map((s) => s.id));
      // FR-064's amendment (2026-10-23): a side-wall selectable the stage can't give its exclusive core to is
      // list-only there, the room drawing no pick area for it; the pointer picks the rest as the kernel does over
      // the areas the room holds.
      const kept = held(areas, index, stage);
      // Each held selectable at its core's centre; then everywhere, as the kernel picks over three.js's rectangles:
      // the frontmost member under the point, else the nearest area that holds it, else none.
      for (const area of kept) expect(picker.pick(ndcOf(centre(area), stage)), area.id).toBe(area.id);
      expect(disagreements((p) => picker.pick(ndcOf(p, stage)), kept, stage)).toEqual([]);
      expect(grid(stage).some((p) => pick(kept, p) === null)).toBe(true);
    },
  );

  it("picks nothing before it knows the stage's size, and recomputes the areas whenever the size changes", () => {
    const { scene: part, index } = repositoryBundle();
    const picker = selectablePicker(part, index);
    expect(picker.pick({ x: 0, y: 0 })).toBeNull();
    const [wide, narrow] = [REFERENCE_DESKTOP.stage, SMALLEST[0]?.stage ?? REFERENCE_PHONE.stage];
    expect(wide.w / wide.h).not.toBeCloseTo(narrow.w / narrow.h, 2);
    picker.resize(wide);
    expect(disagreements((p) => picker.pick(ndcOf(p, wide)), held(threeAreas(wide), index, wide), wide)).toEqual([]);
    picker.resize(narrow);
    const areas = threeAreas(narrow);
    expect(disagreements((p) => picker.pick(ndcOf(p, narrow)), held(areas, index, narrow), narrow)).toEqual([]);
    // Areas kept from the wide stage would pick otherwise somewhere on the narrow one.
    const stale = threeAreas(wide);
    const kept = (p: Point): string | null => pick(stale, [(p[0] / narrow.w) * wide.w, (p[1] / narrow.h) * wide.h]);
    expect(disagreements(kept, areas, narrow)).not.toEqual([]);
  });
});

describe("selectObject", () => {
  it("is called with the same ID from a 3D pick, a touch, and the list's button", () => {
    const { scene: part, index } = repositoryBundle();
    for (const stage of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage]) {
      const picker = selectablePicker(part, index);
      picker.resize(stage);
      const { doc, win, canvas } = surface(stage);
      const selectObject = vi.fn<(id: string) => void>();
      bindPointerSelection(canvas, picker.pick, selectObject);
      const list = renderObjectList(doc, index, selectObject);
      doc.body.append(list);
      const areas = threeAreas(stage);
      expect(areas).toHaveLength(index.selectables.length);
      const kept = held(areas, index, stage);
      for (const area of kept) {
        selectObject.mockClear();
        tap(win, canvas, centre(area), "mouse");
        tap(win, canvas, centre(area), "touch");
        list.querySelector<HTMLButtonElement>(`button[data-object-id="${area.id}"]`)?.click();
        expect(selectObject.mock.calls, area.id).toEqual([[area.id], [area.id], [area.id]]);
      }
      // A side-wall selectable the stage can't hold (FR-064's amendment, 2026-10-23) is reached from the list alone.
      for (const area of areas.filter((a) => !kept.includes(a))) {
        selectObject.mockClear();
        list.querySelector<HTMLButtonElement>(`button[data-object-id="${area.id}"]`)?.click();
        expect(selectObject.mock.calls, area.id).toEqual([[area.id]]);
      }
    }
  });

  it("isn't called by a drag, or a press off every selectable", () => {
    const { scene: part, index } = repositoryBundle();
    const stage = REFERENCE_DESKTOP.stage;
    const picker = selectablePicker(part, index);
    picker.resize(stage);
    const { win, canvas } = surface(stage);
    const selectObject = vi.fn<(id: string) => void>();
    bindPointerSelection(canvas, picker.pick, selectObject);
    const areas = threeAreas(stage);
    const [first] = areas;
    if (!first) throw new Error("no selectable");
    tap(win, canvas, centre(first), "touch", 40);
    const off = grid(stage).find((p) => pick(areas, p) === null);
    if (!off) throw new Error("no point off every selectable");
    tap(win, canvas, off, "mouse");
    expect(selectObject).not.toHaveBeenCalled();
  });

  it("is called with the same IDs from a 2D pick at each selectable the drawing holds, the drawing's own pick areas", () => {
    // The drawing has no buttons since spec 004 (T109): a pointer picks through compose/pick.ts, in flat.test.ts.
    const stage = REFERENCE_PHONE.stage;
    const { doc, win } = surface(stage);
    const index = roomIndex();
    const selectObject = vi.fn<(id: string) => void>();
    const flat = renderFlat(doc, { room: index, avatar: "woman", select: selectObject });
    doc.body.append(flat.element);
    // room.css's .flat keeps the view box's 8:5 shape inside the stage, at the drawing's scale.
    const s = flatScale(stage);
    flat.element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 320 * s, bottom: 200 * s, width: 320 * s, height: 200 * s, x: 0, y: 0 }) as DOMRect;
    const areas = pickAreas(
      index.flat.hits.map((hit) => ({
        id: hit.selectable,
        members: hit.rects.map((rect, k) => ({ rect, depth: hit.depths[k] ?? Number.POSITIVE_INFINITY })),
      })),
      flatCore(stage),
    );
    // FR-064's amendment (2026-10-23): a side-wall selectable the drawing's smallest scale can't give its
    // exclusive core to is list-only in the drawing: no pick area, no cue, and the "In the room" list reaches it.
    const smallest = supportedStages().reduce((a, b) => (flatScale(b) < flatScale(a) ? b : a));
    const smallestAreas = pickAreas(
      index.flat.hits.map((hit) => ({
        id: hit.selectable,
        members: hit.rects.map((rect, k) => ({ rect, depth: hit.depths[k] ?? Number.POSITIVE_INFINITY })),
      })),
      flatCore(smallest),
    );
    const flagged = new Set(pickProblems(smallestAreas, [0, 0, FLAT_VIEW.w, FLAT_VIEW.h]).map((p) => p.selectable));
    const heldOut = new Set(
      smallestAreas
        .filter((a) => index.selectables.find((x) => x.id === a.id)?.side_wall && flagged.has(a.id))
        .map((a) => a.id),
    );
    const held = areas.filter((a) => !heldOut.has(a.id));
    for (const area of held) tap(win, flat.element, [centre(area)[0] * s, centre(area)[1] * s], "touch");
    expect(selectObject.mock.calls).toEqual(held.map((a) => [a.id]));
    // Where a held-out selectable's area used to be, a tap never selects it: the list is its road in.
    for (const area of areas.filter((a) => heldOut.has(a.id))) {
      selectObject.mockClear();
      tap(win, flat.element, [centre(area)[0] * s, centre(area)[1] * s], "touch");
      expect(selectObject.mock.calls.map((c) => c[0])).not.toContain(area.id);
    }
  });

  it("is the room's only for an ID its index lists, whatever calls it", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const scene = v.scene.created[0];
    if (!scene) throw new Error("the room built no 3D scene");
    // The 3D scene gets the index the page bundles, and calls the room's selectObject.
    expect(scene.room).toBe(roomIndex());
    for (const { id } of roomIndex().selectables) {
      scene.select(id);
      expect(v.events.at(-1)).toEqual({ kind: "object_selected", id });
    }
    const [events, messages] = [v.events.length, talkLog(v.doc).children.length];
    scene.select("fx-elsewhere");
    expect([v.events.length, talkLog(v.doc).children.length]).toEqual([events, messages]);
  });

  it("finds no list of the room's objects in the pointer's code, only the selection over string IDs (T112)", async () => {
    expect(Object.keys(await import("../../src/room/objects")).sort()).toEqual([
      "TAP_SLOP_PX",
      "bindPointerSelection",
      "toNdc",
    ]);
  });
});
