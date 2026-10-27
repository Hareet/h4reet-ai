// T039 (spec 002; FR-020, FR-043–FR-045; contracts/room-scene.md §2): the three ways to select an object (a raycast hit
// from a mouse, a touch, and the "In the room" list's button) each call selectObject with the same ID, and the 2D
// drawing's buttons do too. The scene is built without a renderer: Three.js raycasts against geometry alone.
import { JSDOM } from "jsdom";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import type { Object3D } from "three";
import { describe, expect, it, vi } from "vitest";

import { renderObjectList } from "../../src/room/a11y";
import { renderFlat } from "../../src/room/flat";
import { ROOM_OBJECTS, bindPointerSelection } from "../../src/room/objects";
import type { ObjectId } from "../../src/room/objects";
import { buildWorkArea, createPicker, fitCamera } from "../../src/room/scene";
import type { TestWindow } from "../helpers/room";

const WIDTH = 300;
const HEIGHT = 200;

function setup(): {
  pick: ReturnType<typeof createPicker>;
  camera: PerspectiveCamera;
  area: ReturnType<typeof buildWorkArea>;
} {
  const area = buildWorkArea({ avatar: "dog" });
  const camera = new PerspectiveCamera();
  fitCamera(camera, WIDTH / HEIGHT);
  area.scene.updateMatrixWorld(true);
  return { area, camera, pick: createPicker(camera, area) };
}

function centerNdc(object: Object3D, camera: PerspectiveCamera): { x: number; y: number } {
  const c = new Box3().setFromObject(object).getCenter(new Vector3()).project(camera);
  return { x: c.x, y: c.y };
}

function surface(): { doc: Document; win: TestWindow; canvas: HTMLCanvasElement } {
  const win = new JSDOM("<main></main>", { pretendToBeVisual: true }).window as unknown as TestWindow;
  const doc = win.document;
  const canvas = doc.createElement("canvas");
  doc.body.append(canvas);
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: WIDTH, bottom: HEIGHT, width: WIDTH, height: HEIGHT, x: 0, y: 0 }) as DOMRect;
  return { doc, win, canvas };
}

function tap(win: TestWindow, el: Element, ndc: { x: number; y: number }, pointerType: string, drag = 0): void {
  const clientX = ((ndc.x + 1) / 2) * WIDTH;
  const clientY = ((1 - ndc.y) / 2) * HEIGHT;
  const init = { bubbles: true, pointerType, clientX, clientY, button: 0 };
  el.dispatchEvent(new win.PointerEvent("pointerdown", init));
  el.dispatchEvent(new win.PointerEvent("pointerup", { ...init, clientX: clientX + drag }));
}

describe("the room's objects", () => {
  it("are the snowboard, the bicycle, and the laptop and screen, with their topics", () => {
    expect(ROOM_OBJECTS.map((o) => [o.id, o.name, o.topic])).toEqual([
      ["snowboard", "Snowboard", "hobbies and general life"],
      ["bicycle", "Bicycle", "travel adventures"],
      ["laptop", "Laptop and screen", "work projects"],
    ]);
  });

  it("carry their ID on their meshes as userData.objectId", () => {
    const { area } = setup();
    for (const { id } of ROOM_OBJECTS) {
      const ids: unknown[] = [];
      area.objects.get(id)?.traverse((o) => ids.push(o.userData.objectId));
      expect(ids.filter((x) => x === id).length, id).toBeGreaterThan(0);
    }
  });

  it("raycast from each object's center to its ID, and from the bare wall to nothing", () => {
    const { area, camera, pick } = setup();
    for (const { id } of ROOM_OBJECTS) {
      const object = area.objects.get(id);
      if (!object) throw new Error(`no ${id}`);
      expect(pick(centerNdc(object, camera)), id).toBe(id);
    }
    // The wall's top corner, far from every object.
    expect(pick({ x: -0.98, y: 0.98 })).toBeNull();
  });
});

describe("selectObject", () => {
  it("is called with the same ID from a raycast hit, a touch, and the list's button", () => {
    const { area, camera, pick } = setup();
    const { doc, win, canvas } = surface();
    const selectObject = vi.fn<(id: ObjectId) => void>();
    bindPointerSelection(canvas, pick, selectObject);
    const list = renderObjectList(doc, selectObject);
    doc.body.append(list);
    for (const { id } of ROOM_OBJECTS) {
      selectObject.mockClear();
      const object = area.objects.get(id);
      if (!object) throw new Error(`no ${id}`);
      tap(win, canvas, centerNdc(object, camera), "mouse");
      tap(win, canvas, centerNdc(object, camera), "touch");
      list.querySelector<HTMLButtonElement>(`button[data-object-id="${id}"]`)?.click();
      expect(selectObject.mock.calls, id).toEqual([[id], [id], [id]]);
    }
  });

  it("isn't called by a drag, or a press off every object", () => {
    const { area, camera, pick } = setup();
    const { win, canvas } = surface();
    const selectObject = vi.fn<(id: ObjectId) => void>();
    bindPointerSelection(canvas, pick, selectObject);
    const snowboard = area.objects.get("snowboard");
    if (!snowboard) throw new Error("no snowboard");
    tap(win, canvas, centerNdc(snowboard, camera), "touch", 40);
    tap(win, canvas, { x: -0.98, y: 0.98 }, "mouse");
    expect(selectObject).not.toHaveBeenCalled();
  });

  it("labels every piece of the 2D drawing as a placeholder, its buttons too", () => {
    const { doc } = surface();
    const flat = renderFlat(doc, { avatar: "dinosaur", select: () => undefined });
    const texts = [...flat.element.querySelectorAll("text, button")].map((t) =>
      (t.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(flat.element.querySelectorAll("button")).toHaveLength(3);
    expect(texts.length).toBeGreaterThan(6);
    for (const text of texts) expect(text).toMatch(/ \(placeholder\)$/);
  });

  it("is called with the same IDs from the 2D drawing's buttons", () => {
    const { doc } = surface();
    const selectObject = vi.fn<(id: ObjectId) => void>();
    const flat = renderFlat(doc, { avatar: "woman", select: selectObject });
    doc.body.append(flat.element);
    for (const { id } of ROOM_OBJECTS) {
      flat.element.querySelector<HTMLButtonElement>(`button[data-object-id="${id}"]`)?.click();
    }
    expect(selectObject.mock.calls).toEqual(ROOM_OBJECTS.map((o) => [o.id]));
  });
});
