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
// T295 (spec 004; FR-063, FR-064, SC-009): at FR-064's smallest stages the 3D room holds no pick area for a side-wall
// selectable that can't keep its core there (compose/pick.ts listOnly), and the list reaches it: over the repository's
// room by the kernel's function, and over T292's side-wall overlay with its literal sets.
import { JSDOM } from "jsdom";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { renderObjectList } from "../../src/room/a11y";
import type { Box } from "../../src/room/compose/bundle";
import { flatCore, listOnly, pick, pickAreas } from "../../src/room/compose/pick";
import type { MemberRect, PickArea } from "../../src/room/compose/pick";
import { FLAT_VIEW, REFERENCE_DESKTOP, REFERENCE_PHONE, SMALLEST, flatScale } from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { renderFlat } from "../../src/room/flat";
import { TAP_SLOP_PX, bindPointerSelection } from "../../src/room/objects";
import { frameCamera, framedBoxes, selectablePicker } from "../../src/room/scene/bundle3d";
import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { intoRoom, repositoryBundle, roomIndex, start, talkLog } from "../helpers/room";
import { sideWallFiles, sideWallPolicy, sideWallTree } from "../helpers/room-fixtures";
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
function threeAreas(stage: Stage, bundle: { scene: RoomScene; index: RoomIndex } = repositoryBundle()): PickArea[] {
  const { scene: part, index } = bundle;
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

/** The selectables FR-064's carve-out holds at a stage, by the kernel's own function (compose/pick.ts listOnly). */
function heldAt(areas: readonly PickArea[], index: Pick<RoomIndex, "selectables">, stage: Stage): ReadonlySet<string> {
  const sideWall = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
  return listOnly(areas, [0, 0, stage.w, stage.h], sideWall);
}

/** Where a picker over `stage` picks otherwise than compose/pick.ts over `areas`, the first few. */
function disagreements(
  picked: (p: Point) => string | null,
  areas: readonly PickArea[],
  stage: Stage,
  held: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = [];
  for (const p of grid(stage)) {
    const [got, want] = [picked(p), pick(areas, p, held)];
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
      // FR-064's carve-out (see listOnly) holds a side-wall selectable wherever it can't keep its core.
      const held = heldAt(areas, index, stage);
      // Each selectable it doesn't hold at its core's centre; then everywhere, as the kernel picks over three.js's
      // rectangles: the frontmost member under the point, else the nearest area that holds it, else none.
      for (const area of areas.filter((a) => !held.has(a.id)))
        expect(picker.pick(ndcOf(centre(area), stage)), area.id).toBe(area.id);
      expect(disagreements((p) => picker.pick(ndcOf(p, stage)), areas, stage, held)).toEqual([]);
      expect(grid(stage).some((p) => pick(areas, p, held) === null)).toBe(true);
    },
  );

  it("picks nothing before it knows the stage's size, and recomputes the areas whenever the size changes", () => {
    const { scene: part, index } = repositoryBundle();
    const picker = selectablePicker(part, index);
    expect(picker.pick({ x: 0, y: 0 })).toBeNull();
    const [wide, narrow] = [REFERENCE_DESKTOP.stage, SMALLEST[0]?.stage ?? REFERENCE_PHONE.stage];
    expect(wide.w / wide.h).not.toBeCloseTo(narrow.w / narrow.h, 2);
    picker.resize(wide);
    const wideAreas = threeAreas(wide);
    expect(disagreements((p) => picker.pick(ndcOf(p, wide)), wideAreas, wide, heldAt(wideAreas, index, wide))).toEqual(
      [],
    );
    picker.resize(narrow);
    const areas = threeAreas(narrow);
    const held = heldAt(areas, index, narrow);
    expect(disagreements((p) => picker.pick(ndcOf(p, narrow)), areas, narrow, held)).toEqual([]);
    // Areas kept from the wide stage would pick otherwise somewhere on the narrow one.
    const stale = threeAreas(wide);
    const kept = (p: Point): string | null => pick(stale, [(p[0] / narrow.w) * wide.w, (p[1] / narrow.h) * wide.h]);
    expect(disagreements(kept, areas, narrow, held)).not.toEqual([]);
  });
});

// T295 (spec 004; FR-063, FR-064, SC-009; R-20): FR-064's carve-out in the 3D room, over T292's side-wall overlay
// (test/fixtures/room/README.md), whose side-wall signs fx-upper and fx-lower can't both keep their cores on the stages
// 304 px wide, where their cores meet only each other's: `listOnly`'s release pass keeps fx-upper's tap, the first in
// scene order, and fx-lower is list-only there.
describe("the 3D room's side-wall selectables (FR-064's carve-out)", () => {
  let built: ComposeResult | undefined;
  const sideWall = (): ComposeResult =>
    (built ??= compose(sideWallTree(), sideWallPolicy(), { mode: "strict", drafts: false }));
  /** The overlay's 3D stage at a size: the picker on a canvas, the list, and selectObject. */
  function stageAt(stage: Stage) {
    const { scene: part, index } = sideWall();
    const picker = selectablePicker(part, index);
    picker.resize(stage);
    const { doc, win, canvas } = surface(stage);
    const selectObject = vi.fn<(id: string) => void>();
    bindPointerSelection(canvas, picker.pick, selectObject);
    const list = renderObjectList(doc, index, selectObject);
    doc.body.append(list);
    const areas = new Map(threeAreas(stage, sideWall()).map((a) => [a.id, a] as const));
    /** The centre of a selectable's first member, and of its core. */
    const member = (id: string): Point => {
      const m = areas.get(id)?.members[0];
      if (!m) throw new Error(`${id} has no member`);
      return [m.rect[0] + m.rect[2] / 2, m.rect[1] + m.rect[3] / 2];
    };
    const core = (id: string): Point => centre(areas.get(id) as PickArea);
    const button = (id: string) => list.querySelector<HTMLButtonElement>(`button[data-object-id="${id}"]`);
    return { win, canvas, selectObject, member, core, button };
  }

  it.each([
    ["304 × 208", { w: 304, h: 208 }],
    ["304 × 640", { w: 304, h: 640 }],
  ] as const)(
    "holds no pick area for the lower sign on the %s stage, and the list's buttons reach both",
    (_, stage) => {
      const { win, canvas, selectObject, member, core, button } = stageAt(stage);
      tap(win, canvas, member("fx-lower"), "mouse");
      tap(win, canvas, member("fx-lower"), "touch");
      tap(win, canvas, core("fx-lower"), "touch");
      expect(selectObject.mock.calls.flat()).not.toContain("fx-lower");
      selectObject.mockClear();
      for (const id of ["fx-upper", "fx-lower"]) button(id)?.click();
      expect(selectObject.mock.calls).toEqual([["fx-upper"], ["fx-lower"]]);
      // The upper sign, which the release pass keeps, and the selectables that aren't side-wall keep their areas.
      selectObject.mockClear();
      for (const id of ["fx-upper", "fx-workstation", "fx-board"]) tap(win, canvas, core(id), "touch");
      tap(win, canvas, member("fx-upper"), "touch");
      expect(selectObject.mock.calls).toEqual([["fx-upper"], ["fx-workstation"], ["fx-board"], ["fx-upper"]]);
    },
  );

  // T303: T302's answer holds a side-wall selectable at any stage where its core can't fit.
  it("holds no pick area for one on a larger stage where both cores can't fit, and keeps it where they can", () => {
    const text = (path: string): string => new TextDecoder().decode(sideWallFiles().get(path));
    const variant = compose(
      sideWallTree({
        "apps/web/room/catalog/fx-shell.yaml": text("apps/web/room/catalog/fx-shell.yaml").replace(
          "left-wall: { at: [-0.9, 0, -0.8]",
          "left-wall: { at: [-0.9, 0, -0.5]",
        ),
        "apps/web/room/scene.yaml": text("apps/web/room/scene.yaml").replace(
          "offset: [0, 1.0515, 0] }",
          "offset: [0, 1.09, 0] }",
        ),
      }),
      sideWallPolicy(),
      { mode: "strict", drafts: false },
    );
    expect(variant.findings).toEqual([]);
    built = variant;
    try {
      const narrow = stageAt({ w: 320, h: 432 });
      tap(narrow.win, narrow.canvas, narrow.member("fx-lower"), "touch");
      expect(narrow.selectObject).not.toHaveBeenCalled();
      tap(narrow.win, narrow.canvas, narrow.member("fx-upper"), "touch");
      expect(narrow.selectObject.mock.calls).toEqual([["fx-upper"]]);
      narrow.selectObject.mockClear();
      for (const id of ["fx-upper", "fx-lower"]) narrow.button(id)?.click();
      expect(narrow.selectObject.mock.calls).toEqual([["fx-upper"], ["fx-lower"]]);
      const wide = stageAt(REFERENCE_DESKTOP.stage);
      for (const id of ["fx-upper", "fx-lower"]) tap(wide.win, wide.canvas, wide.core(id), "touch");
      expect(wide.selectObject.mock.calls).toEqual([["fx-upper"], ["fx-lower"]]);
    } finally {
      built = undefined;
    }
  });

  it("gives them their pick areas at the reference desktop's stage and on a stage 312 px wide", () => {
    for (const stage of [REFERENCE_DESKTOP.stage, { w: 312, h: 224 }]) {
      const { win, canvas, selectObject, core, button } = stageAt(stage);
      for (const id of ["fx-upper", "fx-lower", "fx-workstation", "fx-board"]) {
        selectObject.mockClear();
        tap(win, canvas, core(id), "mouse");
        tap(win, canvas, core(id), "touch");
        button(id)?.click();
        expect(selectObject.mock.calls, `${id} at ${stage.w} × ${stage.h}`).toEqual([[id], [id], [id]]);
      }
    }
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
      // FR-064's carve-out (see listOnly): a side-wall selectable whose core can't fit is reached by the list alone.
      const held = heldAt(areas, index, stage);
      for (const area of areas) {
        selectObject.mockClear();
        tap(win, canvas, centre(area), "mouse");
        tap(win, canvas, centre(area), "touch");
        list.querySelector<HTMLButtonElement>(`button[data-object-id="${area.id}"]`)?.click();
        const picked = held.has(area.id) ? [] : [[area.id], [area.id]];
        expect(
          selectObject.mock.calls.filter((c) => c[0] === area.id),
          area.id,
        ).toEqual([...picked, [area.id]]);
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

  it("is called with the same IDs from a 2D pick at each selectable, the drawing's own pick areas", () => {
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
    // FR-064's carve-out (see listOnly): a side-wall selectable whose core can't fit has no pick area in the drawing.
    const sideWall = new Set(index.selectables.filter((x) => x.side_wall).map((x) => x.id));
    const held = listOnly(areas, [0, 0, FLAT_VIEW.w, FLAT_VIEW.h], sideWall);
    for (const area of areas) tap(win, flat.element, [centre(area)[0] * s, centre(area)[1] * s], "touch");
    expect(selectObject.mock.calls.map((c) => c[0])).toEqual(
      index.selectables.map((x) => x.id).filter((id) => !held.has(id)),
    );
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

// T006 (spec 008; FR-008 (a) and (b), FR-013; plan.md R-10): bindPointerSelection reports two targeting inputs beside
// its selection, through an optional fourth argument, over a synthetic picker whose left half is fx-left and right half
// fx-right above the middle, nothing below:
// - a hovering pointer, a mouse or a pen that hovers, reports its pick ("pointer") on each move, the same pick again
//   included, so it takes the target back from another input, and null when it leaves the surface; a touch never
//   hovers, so a touch's move with no press reports nothing;
// - a press, a mouse's main button, a pen's contact, or a finger, reports the pick at its start ("press") until it
//   ends: null once it moves beyond TAP_SLOP_PX, or when it's cancelled, or when it ends with no selection; a tap
//   within the slop still selects once, and the finger's lift then reports null, as the pointer leaving, while a mouse
//   or a pen leaves its target to the next hover, so a selected piece isn't targeted again while it rests (FR-012).
describe("hover and press as targeting inputs (spec 008, T006)", () => {
  const STAGE: Stage = { w: 400, h: 300 };
  const picker = (ndc: { x: number; y: number }): string | null => {
    if (ndc.y < 0) return null;
    return ndc.x < 0 ? "fx-left" : "fx-right";
  };
  const LEFT: Point = [100, 60];
  const RIGHT: Point = [300, 60];
  const FLOOR: Point = [200, 250];

  function bound() {
    const { win, canvas } = surface(STAGE);
    const select = vi.fn<(id: string) => void>();
    const target = vi.fn<(input: "pointer" | "press", id: string | null) => void>();
    const unbind = bindPointerSelection(canvas, picker, select, target);
    const fire = (type: string, pointerType: string, [clientX, clientY]: Point, extra: object = {}): void => {
      canvas.dispatchEvent(
        new win.PointerEvent(type, { bubbles: true, pointerType, clientX, clientY, button: 0, ...extra }),
      );
    };
    return { canvas, select, target, unbind, fire };
  }

  it("reports a mouse's and a hovering pen's pick on each move, and null when it leaves the surface", () => {
    for (const pointerType of ["mouse", "pen"]) {
      const { select, target, fire } = bound();
      fire("pointermove", pointerType, LEFT);
      fire("pointermove", pointerType, LEFT);
      fire("pointermove", pointerType, RIGHT);
      fire("pointermove", pointerType, FLOOR);
      fire("pointermove", pointerType, RIGHT);
      fire("pointerleave", pointerType, [-5, 60]);
      expect(target.mock.calls, pointerType).toEqual([
        ["pointer", "fx-left"],
        ["pointer", "fx-left"],
        ["pointer", "fx-right"],
        ["pointer", null],
        ["pointer", "fx-right"],
        ["pointer", null],
      ]);
      expect(select).not.toHaveBeenCalled();
    }
  });

  it("reports nothing for a touch until it presses, and nothing when a touch leaves", () => {
    const { target, fire } = bound();
    fire("pointermove", "touch", LEFT);
    fire("pointerleave", "touch", LEFT);
    expect(target).not.toHaveBeenCalled();
  });

  it("reports a finger's press until the tap selects, then null as it lifts, and selects once", () => {
    const { select, target, fire } = bound();
    fire("pointerdown", "touch", LEFT);
    expect(target.mock.calls).toEqual([["press", "fx-left"]]);
    fire("pointermove", "touch", [LEFT[0] + 3, LEFT[1] + 3]);
    fire("pointerup", "touch", [LEFT[0] + 3, LEFT[1] + 3]);
    expect(select.mock.calls).toEqual([["fx-left"]]);
    expect(target.mock.calls).toEqual([
      ["press", "fx-left"],
      ["press", null],
    ]);
  });

  it("reports a mouse's press, selects once on the click, and leaves the target to the next hover", () => {
    const { select, target, fire } = bound();
    fire("pointermove", "mouse", RIGHT);
    fire("pointerdown", "mouse", RIGHT, { buttons: 1 });
    fire("pointerup", "mouse", RIGHT);
    expect(select.mock.calls).toEqual([["fx-right"]]);
    expect(target.mock.calls).toEqual([
      ["pointer", "fx-right"],
      ["press", "fx-right"],
    ]);
    // The mouse rests over the piece: the next move is a hover again.
    fire("pointermove", "mouse", [RIGHT[0] + 1, RIGHT[1]]);
    expect(target.mock.calls.at(-1)).toEqual(["pointer", "fx-right"]);
  });

  it("reports null once a press moves beyond the slop, once, and selects nothing when it ends", () => {
    for (const pointerType of ["touch", "mouse", "pen"]) {
      const { select, target, fire } = bound();
      fire("pointerdown", pointerType, LEFT, { buttons: 1 });
      fire("pointermove", pointerType, [LEFT[0] + TAP_SLOP_PX + 1, LEFT[1]], { buttons: 1 });
      fire("pointermove", pointerType, [LEFT[0] + 40, LEFT[1]], { buttons: 1 });
      fire("pointerup", pointerType, [LEFT[0] + 40, LEFT[1]]);
      expect(select, pointerType).not.toHaveBeenCalled();
      expect(target.mock.calls, pointerType).toEqual([
        ["press", "fx-left"],
        ["press", null],
      ]);
    }
  });

  it("reports null when a press is cancelled, and when it ends with no selection", () => {
    const cancelled = bound();
    cancelled.fire("pointerdown", "touch", RIGHT);
    cancelled.fire("pointercancel", "touch", RIGHT);
    expect(cancelled.target.mock.calls).toEqual([
      ["press", "fx-right"],
      ["press", null],
    ]);
    const nothing = bound();
    nothing.fire("pointerdown", "mouse", FLOOR, { buttons: 1 });
    nothing.fire("pointerup", "mouse", FLOOR);
    expect(nothing.select).not.toHaveBeenCalled();
    expect(nothing.target.mock.calls).toEqual([
      ["press", null],
      ["press", null],
    ]);
  });

  it("takes no press for a mouse's other buttons, whose moves stay hovers", () => {
    const { select, target, fire } = bound();
    fire("pointerdown", "mouse", LEFT, { button: 2, buttons: 2 });
    fire("pointermove", "mouse", RIGHT, { buttons: 2 });
    fire("pointerup", "mouse", RIGHT, { button: 2 });
    expect(select).not.toHaveBeenCalled();
    expect(target.mock.calls).toEqual([["pointer", "fx-right"]]);
  });

  it("keeps the selection and the cursor's class as they were, with no targeting argument", () => {
    const { win, canvas } = surface(STAGE);
    const select = vi.fn<(id: string) => void>();
    bindPointerSelection(canvas, picker, select);
    canvas.dispatchEvent(
      new win.PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 100, clientY: 60 }),
    );
    expect(canvas.classList.contains("over-object")).toBe(true);
    tap(win, canvas, LEFT, "touch");
    tap(win, canvas, RIGHT, "mouse");
    expect(select.mock.calls).toEqual([["fx-left"], ["fx-right"]]);
  });

  it("reports nothing once unbound", () => {
    const { select, target, unbind, fire } = bound();
    unbind();
    fire("pointermove", "mouse", LEFT);
    fire("pointerdown", "touch", LEFT);
    fire("pointerup", "touch", LEFT);
    fire("pointerleave", "mouse", LEFT);
    expect(target).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});

// The review of Phase 1, finding 3: a mouse drag that ends off the canvas never sends its pointerup to it, so the press
// must not outlive it. The surface takes the pointer on a press (setPointerCapture), so the press's end reaches it; and
// a move with no button down is a hover whatever came before, the stale press dropped.
describe("a press that ends off the surface (the review of Phase 1, finding 3)", () => {
  const STAGE: Stage = { w: 400, h: 300 };
  const picker = (ndc: { x: number; y: number }): string | null =>
    ndc.y < 0 ? null : ndc.x < 0 ? "fx-left" : "fx-right";

  it("takes the pointer on a press, so the press's end comes back to the surface", () => {
    const { win, canvas } = surface(STAGE);
    const captured: number[] = [];
    canvas.setPointerCapture = (id: number) => void captured.push(id);
    bindPointerSelection(canvas, picker, vi.fn(), vi.fn());
    canvas.dispatchEvent(
      new win.PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "mouse",
        pointerId: 7,
        clientX: 100,
        clientY: 60,
        button: 0,
        buttons: 1,
      }),
    );
    expect(captured).toEqual([7]);
  });

  it("hovers again on the first move with no button down after a drag whose end never arrived", () => {
    const { win, canvas } = surface(STAGE);
    const select = vi.fn<(id: string) => void>();
    const target = vi.fn<(input: "pointer" | "press", id: string | null) => void>();
    bindPointerSelection(canvas, picker, select, target);
    const fire = (type: string, x: number, y: number, buttons: number): void => {
      canvas.dispatchEvent(
        new win.PointerEvent(type, { bubbles: true, pointerType: "mouse", clientX: x, clientY: y, button: 0, buttons }),
      );
    };
    fire("pointerdown", 100, 60, 1);
    fire("pointermove", 150, 60, 1);
    // The button comes up off the canvas: no pointerup reaches it. The mouse comes back, no button down.
    fire("pointermove", 300, 60, 0);
    expect(target.mock.calls.at(-1)).toEqual(["pointer", "fx-right"]);
    fire("pointermove", 300, 250, 0);
    expect(target.mock.calls.at(-1)).toEqual(["pointer", null]);
    // A click later is a click, its press its own.
    fire("pointerdown", 100, 60, 1);
    fire("pointerup", 100, 60, 0);
    expect(select.mock.calls).toEqual([["fx-left"]]);
  });
});
