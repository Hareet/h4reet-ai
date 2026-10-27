// T104 (spec 004; FR-071; Amendment B7; R-60; contracts/room-live-state-telemetry.md §2): selecting a piece sends spec
// 002's object_selected, unchanged, through the room's one selectObject: one event per selection from each input (a 3D
// pick, a 2D pick, and the "In the room" list's button), its body {kind, id} alone, the ID the selectable's own from
// the bundle's index. The room starts with the index compose() makes of the fixture set, so every ID is a synthetic
// fx- one; the 3D pick is the scene module's own, scene/bundle3d.ts's selectablePicker over the fixture's 3D part,
// bound to the canvas as src/room/scene.ts binds it, and the 2D pick is src/room/flat.ts's.
// The other events a selection's action sends (a resume action's resume_opened, T207) are test/ui/talk.test.ts's.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { EVENTS_URL, beaconEvents } from "../../src/events";
import { framing } from "../../src/room/compose/framing";
import { CORE_PX, pickAreas } from "../../src/room/compose/pick";
import type { PickArea, Rect } from "../../src/room/compose/pick";
import { FLAT_VIEW, REFERENCE_DESKTOP, REFERENCE_PHONE, flatScale } from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import type { RoomEvent } from "../../src/room/events";
import { bindPointerSelection } from "../../src/room/objects";
import { framedBoxes, pickAreasOn, selectablePicker } from "../../src/room/scene/bundle3d";
import { button, enter, intoRoom, start } from "../helpers/room";
import type { TestWindow, Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

type Point = readonly [number, number];

let composed: ComposeResult | null = null;
/** The fixture set, composed once a file, as a release build in strict mode. */
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));

/** A box's client rectangle, from the page's top left. */
const rectOf = (size: Stage, [left, top]: Point = [0, 0]): DOMRect =>
  ({
    left,
    top,
    width: size.w,
    height: size.h,
    right: left + size.w,
    bottom: top + size.h,
    x: left,
    y: top,
  }) as DOMRect;

function centreOf(rect: Rect | null): Point {
  if (!rect) throw new Error("no core");
  return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
}

function tap(win: TestWindow, el: Element, [clientX, clientY]: Point, pointerType: string): void {
  const init = { bubbles: true, pointerType, clientX, clientY, button: 0 };
  el.dispatchEvent(new win.PointerEvent("pointerdown", init));
  el.dispatchEvent(new win.PointerEvent("pointerup", init));
}

/** The object_selected events the visit has sent since `from`. */
const selections = (v: Visit, from: number): RoomEvent[] =>
  v.events.slice(from).filter((e) => e.kind === "object_selected");

/** The 3D stage the room builds, picking as src/room/scene.ts picks: the bundle's selectablePicker over the fixture's
 *  3D part, sized to `stage`, bound to the canvas with the room's own select. */
function pickIn3d(v: Visit, stage: Stage): void {
  const { scene: part } = fixture();
  const create = v.scene.module.createScene.bind(v.scene.module);
  v.scene.module.createScene = (options) => {
    const made = create(options);
    const picker = selectablePicker(part, options.room);
    picker.resize(stage);
    made.canvas.getBoundingClientRect = () => rectOf(stage);
    bindPointerSelection(made.canvas, picker.pick, options.select);
    return made;
  };
}

/** Each selectable's core on the 3D stage, as the compositor's spacing check (RG6) measured it. */
function cores3d(stage: Stage): PickArea[] {
  const { scene: part, index } = fixture();
  return pickAreasOn(part, index, framing(stage.w / stage.h, framedBoxes(part)), stage);
}

/** Each selectable's core in the 2D drawing's view box, 44 CSS pixels at the drawing's scale on a box of `size`. */
function cores2d(size: Stage): PickArea[] {
  const { index } = fixture();
  return pickAreas(
    index.flat.hits.map((hit) => ({
      id: hit.selectable,
      members: hit.rects.map((rect, k) => ({ rect, depth: hit.depths[k] ?? Number.POSITIVE_INFINITY })),
    })),
    CORE_PX / flatScale(size),
  );
}

describe("object_selected", () => {
  it("is sent once for each pick in 3D, a mouse's or a finger's, with the selectable's ID alone", async () => {
    const { index } = fixture();
    const stage = REFERENCE_DESKTOP.stage;
    const v = start({ webgl: true, room: index });
    pickIn3d(v, stage);
    await intoRoom(v);
    const canvas = v.scene.stage?.canvas;
    if (!canvas) throw new Error("the room built no 3D stage");
    const areas = cores3d(stage);
    expect(areas.map((a) => a.id)).toEqual(index.selectables.map((s) => s.id));
    for (const pointer of ["mouse", "touch"]) {
      for (const area of areas) {
        const from = v.events.length;
        tap(v.win, canvas, centreOf(area.core), pointer);
        expect(selections(v, from), `${pointer} on ${area.id}`).toEqual([{ kind: "object_selected", id: area.id }]);
      }
    }
  });

  it("is sent once for each pick in 2D, and for none while the hand-off plays", async () => {
    const { index } = fixture();
    const v = start({ webgl: false, room: index });
    await enter(v);
    const flat = v.doc.querySelector<HTMLElement>(".flat");
    if (!flat) throw new Error("the room drew no 2D stage");
    // The drawing's box keeps the view box's 8:5 shape inside the stage (room.css's .flat).
    const s = flatScale(REFERENCE_PHONE.stage);
    const size = { w: FLAT_VIEW.w * s, h: FLAT_VIEW.h * s };
    flat.getBoundingClientRect = () => rectOf(size);
    const areas = cores2d(size);
    expect(areas.map((a) => a.id)).toEqual(index.selectables.map((s) => s.id));
    const at = (area: PickArea): Point => [centreOf(area.core)[0] * s, centreOf(area.core)[1] * s];
    for (const area of areas) tap(v.win, flat, at(area), "touch");
    expect(selections(v, 0)).toEqual([]);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    for (const pointer of ["mouse", "touch"]) {
      for (const area of areas) {
        const from = v.events.length;
        tap(v.win, flat, at(area), pointer);
        expect(selections(v, from), `${pointer} on ${area.id}`).toEqual([{ kind: "object_selected", id: area.id }]);
      }
    }
  });

  it('is sent once for each press of a button in the "In the room" list, in scene order', async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: index });
    await intoRoom(v);
    const buttons = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")];
    expect(buttons.map((b) => b.getAttribute("data-object-id"))).toEqual(index.selectables.map((s) => s.id));
    for (const b of buttons) {
      const from = v.events.length;
      b.click();
      expect(selections(v, from)).toEqual([{ kind: "object_selected", id: b.getAttribute("data-object-id") }]);
    }
  });

  it("goes out as a beacon whose body is {kind, id} alone, the ID the selectable's", async () => {
    const { index } = fixture();
    const v = start({ webgl: false, room: index });
    await intoRoom(v);
    const from = v.events.length;
    for (const b of v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")) b.click();
    const sent: { url: string; body: unknown }[] = [];
    const emit = beaconEvents({ sendBeacon: (url: string, body?: unknown) => (sent.push({ url, body }), true) });
    for (const event of selections(v, from)) emit(event);
    expect(sent).toEqual(
      index.selectables.map((s) => ({ url: EVENTS_URL, body: JSON.stringify({ kind: "object_selected", id: s.id }) })),
    );
    for (const { body } of sent) expect(Object.keys(JSON.parse(String(body)) as object).sort()).toEqual(["id", "kind"]);
  });
});
