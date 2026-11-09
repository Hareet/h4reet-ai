// T015 (spec 005; FR-010, FR-012, FR-014 to FR-018, FR-035; SC-001, SC-014; plan.md §4.2 to §5.3): the 3D stage
// (src/room/scene.ts) at the window, with a stand-in renderer, since Node has no WebGL. Over SC-001's windows and pixel
// ratios, with the room's clear area given through SceneOptions.clear(): the buffer at bufferRatio and the canvas's
// CSS size; the camera framed at the clear area's aspect and its projection shifted by viewOffsetFor's numbers; the
// look's lines at the canvas's height and the highlight's stage at the canvas's size, overwriting their initial
// REFERENCE_DESKTOP values; a press at each selectable's core selecting it; and, while walking, the follow camera taking
// the same shift and a missed click walking the figure to the floor point under the pointer. Beside scene.test.ts,
// whose own mocks it doesn't share: this file wraps the ink's and the highlight's factories to see their stage calls.
import { JSDOM } from "jsdom";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import type { Camera, PerspectiveCamera, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import { clearArea, reservedBoxes } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { listOnly } from "../../src/room/compose/pick";
import { bufferRatio, viewOffsetFor } from "../../src/room/fit";
import { createScene } from "../../src/room/scene";
import { framedBoxes, pickAreasOn } from "../../src/room/scene/bundle3d";
import { qualitySettings } from "../../src/room/scene/levels";
import { FakeClock, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

const swapped = vi.hoisted(() => ({
  renderer: null as ((parameters: unknown) => unknown) | null,
  stageHeights: [] as number[],
  stages: [] as [number, number][],
}));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

vi.mock("../../src/room/scene/look", async (importOriginal) => {
  const look = await importOriginal<typeof import("../../src/room/scene/look")>();
  return {
    ...look,
    createInk(...args: Parameters<typeof look.createInk>) {
      const ink = look.createInk(...args);
      return {
        ...ink,
        setStageHeight(height: number) {
          swapped.stageHeights.push(height);
          ink.setStageHeight(height);
        },
      };
    },
  };
});

vi.mock("../../src/room/scene/highlight", async (importOriginal) => {
  const highlight = await importOriginal<typeof import("../../src/room/scene/highlight")>();
  return {
    ...highlight,
    createHighlight(...args: Parameters<typeof highlight.createHighlight>) {
      const made = highlight.createHighlight(...args);
      const setStage = made.setStage;
      made.setStage = (w: number, h: number): void => {
        swapped.stages.push([w, h]);
        setStage(w, h);
      };
      return made;
    },
  };
});

afterEach(() => {
  swapped.renderer = null;
  swapped.stageHeights.length = 0;
  swapped.stages.length = 0;
});

/** SC-001's resize steps, and the pixel ratios each is taken at. */
const STEPS = [
  { w: 1280, h: 720 },
  { w: 2560, h: 1440 },
  { w: 3440, h: 1440 },
  { w: 390, h: 844 },
  { w: 844, h: 390 },
] as const;
const RATIOS = [1, 2, 1.5] as const;

function run() {
  const { scene: part, index } = repositoryBundle() as {
    scene: RoomScene;
    index: ReturnType<typeof repositoryBundle>["index"];
  };
  const calls = { ratio: [] as number[], size: [] as [number, number, boolean | undefined][] };
  const drawn: { camera: PerspectiveCamera | null; room: Scene | null } = { camera: null, room: null };
  swapped.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: (r: number) => calls.ratio.push(r),
    setSize: (w: number, h: number, style?: boolean) => calls.size.push([w, h, style]),
    initTexture: () => undefined,
    render: (scene: Scene, camera: Camera) => {
      if (scene.name !== "") return;
      drawn.camera = camera as PerspectiveCamera;
      drawn.room ??= scene;
    },
    dispose: () => undefined,
  });
  const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, { pretendToBeVisual: true })
    .window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  const clock = new FakeClock();
  const selected: string[] = [];
  const window = { w: 1280, h: 720, dpr: 1 };
  let clear: Box = clearArea(window);
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar: "dog",
    reducedMotion: true,
    select: (id) => selected.push(id),
    onFrame: () => undefined,
    clear: () => clear,
  });
  Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => window.w });
  Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => window.h });
  stage.canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: window.w, height: window.h, right: window.w, bottom: window.h, x: 0, y: 0 }) as DOMRect;
  Object.defineProperty(win, "devicePixelRatio", { configurable: true, get: () => window.dpr });
  const resize = (w: number, h: number, dpr: number): Box => {
    Object.assign(window, { w, h, dpr });
    clear = clearArea({ w, h });
    clock.advance(16);
    return clear;
  };
  const tap = (x: number, y: number): void => {
    const init = { bubbles: true, pointerType: "mouse", clientX: x, clientY: y, button: 0 };
    stage.canvas.dispatchEvent(new win.PointerEvent("pointerdown", init));
    stage.canvas.dispatchEvent(new win.PointerEvent("pointerup", init));
  };
  const view = win.document.getElementById("view") as HTMLElement;
  return { part, index, stage, clock, calls, drawn, selected, resize, tap, view, window };
}

describe("the 3D stage at the window (spec 005, T015)", () => {
  it("sizes the buffer at bufferRatio and the canvas's CSS size, and frames the room into the clear area", () => {
    const r = run();
    for (const dpr of RATIOS)
      for (const { w, h } of STEPS) {
        const clear = r.resize(w, h, dpr);
        const where = `${w} × ${h} at ${dpr}`;
        expect(r.calls.ratio.at(-1), where).toBeCloseTo(bufferRatio(dpr, qualitySettings(0), w, h), 12);
        expect(r.calls.size.at(-1), where).toEqual([w, h, false]);
        const camera = r.drawn.camera;
        if (!camera) throw new Error("no frame drawn");
        expect(camera.aspect, where).toBeCloseTo(clear.w / clear.h, 12);
        const o = viewOffsetFor(clear, { w, h });
        expect(camera.view, where).toMatchObject({
          enabled: true,
          fullWidth: o.fullWidth,
          fullHeight: o.fullHeight,
          offsetX: o.x,
          offsetY: o.y,
          width: o.width,
          height: o.height,
        });
        // The camera is the kernel's framing at the clear area's aspect.
        const spec = framing(clear.w / clear.h, framedBoxes(r.part));
        expect(camera.position.toArray(), where).toEqual(spec.position);
        expect(camera.fov, where).toBe(spec.fov);
        // The look's lines at the canvas's height, the highlight's band at the canvas's size.
        expect(swapped.stageHeights.at(-1), where).toBe(h);
        expect(swapped.stages.at(-1), where).toEqual([w, h]);
      }
    r.stage.dispose();
  });

  it("selects each selectable by a press at its exclusive core, at every step", () => {
    const r = run();
    const sideWall = new Set(r.index.selectables.filter((s) => s.side_wall).map((s) => s.id));
    for (const dpr of RATIOS)
      for (const { w, h } of STEPS) {
        const clear = r.resize(w, h, dpr);
        const camera = framing(clear.w / clear.h, framedBoxes(r.part));
        const areas = pickAreasOn(r.part, r.index, camera, clear);
        const held = listOnly(areas, [0, 0, clear.w, clear.h], sideWall, reservedBoxes(clear));
        let pressed = 0;
        for (const a of areas) {
          if (held.has(a.id) || !a.core) continue;
          const [x, y, cw, ch] = a.core;
          r.selected.length = 0;
          r.tap(clear.x + x + cw / 2, clear.y + y + ch / 2);
          expect(r.selected, `${a.id} at ${w} × ${h}`).toEqual([a.id]);
          pressed += 1;
        }
        expect(pressed, `${w} × ${h}`).toBeGreaterThan(0);
        // A press over the column or the bar, outside the clear area, picks nothing.
        r.selected.length = 0;
        r.tap(w - 2, h - 2);
        expect(r.selected, `${w} × ${h}: the corner under the bar`).toEqual([]);
      }
    r.stage.dispose();
  });

  it("overwrites the initial REFERENCE_DESKTOP stage at its first frame, so the look doesn't change", () => {
    const r = run();
    r.clock.advance(16);
    expect(swapped.stageHeights.at(-1)).toBe(720);
    expect(swapped.stages.at(-1)).toEqual([1280, 720]);
    r.stage.dispose();
  });

  it("shifts the follow camera as the production one, and walks a missed click to the floor under the pointer", () => {
    const r = run();
    const clear = r.resize(1280, 720, 1);
    r.stage.walk.enter(r.view);
    for (let k = 0; k < 40; k += 1) r.clock.advance(16);
    const camera = r.drawn.camera;
    if (!camera) throw new Error("no frame drawn");
    expect(camera.aspect).toBeCloseTo(clear.w / clear.h, 12);
    const o = viewOffsetFor(clear, { w: 1280, h: 720 });
    expect(camera.view).toMatchObject({ enabled: true, fullWidth: o.fullWidth, offsetY: o.y, width: 1280 });
    // A press on the floor, in the clear area's lower part, where no selectable is: the figure walks to the floor
    // point under it, as three's own ray through the shifted projection finds it.
    const figure = (): Vector3 => {
      const node = r.drawn.room?.getObjectByName("cutout")?.parent;
      if (!node) throw new Error("no visitor's figure");
      return node.getWorldPosition(new Vector3());
    };
    const [px, py] = [clear.x + clear.w * 0.35, clear.y + clear.h * 0.82];
    const ndc = new Vector2((px / 1280) * 2 - 1, -((py / 720) * 2 - 1));
    const caster = new Raycaster();
    camera.updateMatrixWorld(true);
    caster.setFromCamera(ndc, camera);
    const goal = caster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
    if (!goal) throw new Error("the press misses the floor");
    const start = figure();
    const before = Math.hypot(start.x - goal.x, start.z - goal.z);
    r.selected.length = 0;
    r.tap(px, py);
    expect(r.selected).toEqual([]);
    for (let k = 0; k < 400; k += 1) r.clock.advance(16);
    const end = figure();
    const after = Math.hypot(end.x - goal.x, end.z - goal.z);
    expect(before).toBeGreaterThan(0.3);
    expect(after, `from ${before.toFixed(2)} m to ${after.toFixed(2)} m`).toBeLessThan(0.15);
    r.stage.dispose();
  });
});
