// Spec 033 (User Story 2; FR-006, FR-008, FR-010; its Q4): the held paper at the 3D stage (src/room/scene.ts), with a
// stand-in renderer, since Node has no WebGL, as scene-fit.test.ts drives it. Once the hand-off has ended, a tap at the
// held sheet's centre on the canvas selects `held-paper`, a hover targets it and shows the pointer's hand, and a tap
// within its pick area, at least 44 × 44 CSS pixels about its centre, selects it too; before the hand-off's end it is
// never picked. The highlight's draws for `held-paper` are the held sheet's own meshes, its face and its back.
import { JSDOM } from "jsdom";
import { Mesh, Vector3 } from "three";
import type { Camera, Material, Object3D, PerspectiveCamera, PlaneGeometry, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { createScene } from "../../src/room/scene";
import type { Highlight } from "../../src/room/scene/highlight";
import { SHEET_SIZE } from "../../src/room/scene/grip";
import { FakeClock, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

const PAPER = "held-paper";

const swapped = vi.hoisted(() => ({
  renderer: null as ((parameters: unknown) => unknown) | null,
  highlights: [] as unknown[],
}));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

vi.mock("../../src/room/scene/highlight", async (importOriginal) => {
  const highlight = await importOriginal<typeof import("../../src/room/scene/highlight")>();
  return {
    ...highlight,
    createHighlight(...args: Parameters<typeof highlight.createHighlight>) {
      const made = highlight.createHighlight(...args);
      swapped.highlights.push(made);
      return made;
    },
  };
});

afterEach(() => {
  swapped.renderer = null;
  swapped.highlights.length = 0;
});

/** Whether three would draw a mesh: it and its parents visible, up to the scene, and its material visible. */
function drawn(mesh: Object3D): boolean {
  for (let at: Object3D | null = mesh; at; at = at.parent) {
    if (!at.visible) return false;
    if (at.parent === null) return ((mesh as Mesh).material as Material).visible;
  }
  return false;
}

/** The paper sheets in a scene: the A4 planes the hand-off makes, each front-facing sheet with its back as a child. */
function sheets(room: Scene): Mesh[] {
  const out: Mesh[] = [];
  room.traverse((n) => {
    const geometry = (n as Mesh).geometry as PlaneGeometry | undefined;
    const p = geometry?.parameters;
    if (
      (n as Mesh).isMesh &&
      p &&
      p.width === SHEET_SIZE[0] &&
      p.height === SHEET_SIZE[1] &&
      !(n.parent as Mesh)?.isMesh
    )
      out.push(n as Mesh);
  });
  return out;
}

function run() {
  const { scene: part, index } = repositoryBundle() as {
    scene: RoomScene;
    index: ReturnType<typeof repositoryBundle>["index"];
  };
  const frame: { camera: PerspectiveCamera | null; room: Scene | null } = { camera: null, room: null };
  swapped.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene, camera: Camera) => {
      if (scene.name !== "") return;
      frame.camera = camera as PerspectiveCamera;
      frame.room ??= scene;
    },
    dispose: () => undefined,
  });
  const win = new JSDOM(`<main></main>`, { pretendToBeVisual: true }).window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  const clock = new FakeClock();
  const selected: string[] = [];
  const targets: [string, string | null][] = [];
  let endHandoff: () => void = () => undefined;
  const handoff = new Promise<void>((resolve) => (endHandoff = resolve));
  const size = { w: 1280, h: 720 };
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar: "dog",
    reducedMotion: false,
    select: (id) => selected.push(id),
    target: (input, id) => targets.push([input, id]),
    onFrame: () => undefined,
    handoff,
    clear: () => ({ area: { x: 0, y: 0, w: size.w, h: size.h }, window: { ...size } }),
  });
  Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => size.w });
  Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => size.h });
  stage.canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: size.w, height: size.h, right: size.w, bottom: size.h, x: 0, y: 0 }) as DOMRect;
  const pointer = (type: string, x: number, y: number): void => {
    stage.canvas.dispatchEvent(
      new win.PointerEvent(type, { bubbles: true, pointerType: "mouse", clientX: x, clientY: y, button: 0 }),
    );
  };
  const tap = (x: number, y: number): void => {
    pointer("pointerdown", x, y);
    pointer("pointerup", x, y);
  };
  /** The drawn sheet at full opacity, and its centre on the canvas in CSS pixels, from the camera last drawn. */
  const paperOnCanvas = (): { mesh: Mesh; x: number; y: number } => {
    const room = frame.room;
    const camera = frame.camera;
    if (!room || !camera) throw new Error("no frame drawn");
    const shown = sheets(room).filter((m) => drawn(m) && (m.material as Material).opacity === 1);
    const [mesh] = shown;
    if (shown.length !== 1 || !mesh) throw new Error(`${shown.length} sheets shown`);
    room.updateMatrixWorld(true);
    const c = new Vector3().setFromMatrixPosition(mesh.matrixWorld).project(camera);
    return { mesh, x: ((c.x + 1) / 2) * size.w, y: ((1 - c.y) / 2) * size.h };
  };
  return { part, stage, clock, selected, targets, tap, pointer, endHandoff, paperOnCanvas };
}

async function handedOff(r: ReturnType<typeof run>): Promise<void> {
  r.clock.advance(16);
  for (const p of [0, 0.5, 1]) r.stage.showHandoff(p);
  r.endHandoff();
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  r.clock.advance(16);
}

describe("the held paper at the 3D stage (spec 033, FR-006, FR-008, FR-010)", () => {
  it("is picked by a tap at its centre once the hand-off has ended, and never during it", async () => {
    const r = run();
    r.clock.advance(16);
    r.stage.showHandoff(0);
    r.stage.showHandoff(1);
    r.clock.advance(16);
    // The hand-off's last frame has a sheet at the visitor's hand; until the hand-off ends, it isn't the paper's pick.
    const before = r.paperOnCanvas();
    r.tap(before.x, before.y);
    expect(r.selected).not.toContain(PAPER);
    await handedOff(r);
    const at = r.paperOnCanvas();
    r.selected.length = 0;
    r.tap(at.x, at.y);
    expect(r.selected).toEqual([PAPER]);
    r.stage.dispose();
  });

  it("is targeted by a hovering mouse, which shows the pointer's hand, and cleared when it leaves", async () => {
    const r = run();
    await handedOff(r);
    const at = r.paperOnCanvas();
    r.pointer("pointermove", at.x, at.y);
    expect(r.targets.at(-1)).toEqual(["pointer", PAPER]);
    expect(r.stage.canvas.classList.contains("over-object")).toBe(true);
    r.pointer("pointerleave", at.x, at.y);
    expect(r.targets.at(-1)).toEqual(["pointer", null]);
    r.stage.dispose();
  });

  it("picks within a pick area at least 44 × 44 CSS pixels about its centre (FR-008)", async () => {
    const r = run();
    await handedOff(r);
    const at = r.paperOnCanvas();
    for (const [dx, dy] of [
      [-21, -21],
      [21, -21],
      [-21, 21],
      [21, 21],
    ]) {
      r.selected.length = 0;
      r.tap(at.x + dx, at.y + dy);
      expect(r.selected, `at (${dx}, ${dy}) from its centre`).toEqual([PAPER]);
    }
    r.stage.dispose();
  });

  it("borders the held sheet's own meshes, its face and its back, as its highlight's draws", async () => {
    const r = run();
    await handedOff(r);
    const at = r.paperOnCanvas();
    r.stage.setTarget(PAPER);
    r.clock.advance(16);
    const highlight = swapped.highlights.at(-1) as Highlight | undefined;
    if (!highlight) throw new Error("no highlight made");
    const own: Mesh[] = [];
    at.mesh.traverse((n) => {
      if ((n as Mesh).isMesh) own.push(n as Mesh);
    });
    expect(own).toHaveLength(2);
    expect(highlight.target).toBe(PAPER);
    expect([...highlight.draws].sort((a, b) => a.id - b.id)).toEqual(own.sort((a, b) => a.id - b.id));
    r.stage.dispose();
  });
});
