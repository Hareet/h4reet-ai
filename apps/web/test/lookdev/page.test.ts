// T135 (spec 004; FR-067, FR-068, FR-070, User Story 3 scenarios 1 and 2; research.md R-41; contracts/lookdev.md §1 to
// §6, §9): the lookdev page, built inside its root by src/lookdev/page.ts's createLookdev, which startLookdev
// (src/lookdev/main.ts) calls with the drafts build's own inputs, a WebGLRenderer, and the window's clock. Here the
// inputs are compose()'s over the repository with drafts, as the drafts build composes them; jsdom has no WebGL, so a
// stand-in renderer "draws" each visible mesh and counts it, and createImageBitmap is a stand-in sized from the image's
// header. Time is FakeClock's. Every request and storage API of the page's window is a spy.
// - One canvas runs the production 3D part (buildRoom), the look (look.ts), the loader (scene/loader.ts), and the real
//   quality controller, after the hand-off.
// - The views: the reference desktop's stage at a pixel ratio of 1; the reference phone's last measured stage and pixel
//   ratio, or in the phone copy the phone's own; and the desk close-up through framing over close_up.frame's boxes,
//   its readouts labelled close-up.
// - The scene, room or vignette: only vignette.show's placements drawn, every mount still resolved. The look, applied
//   at run time. The sample state: the tier switch's case for the fixture's tier, its figures badged with the UI word
//   sign.sample. Quality automatic, the real controller, or pinned at 0 to 3. Pause, which stops the idle sway.
// - One "Load a candidate…" picker per piece but the figures', its file read with arrayBuffer() and nothing else, its
//   SHA-256, bytes, gzip-9 bytes, mark, and findings shown under its piece, swapped in through the room's loader; Clear
//   restores the stand-in; no file name anywhere.
// - "Load every piece", and "Run 2 minutes" and "Run 10 minutes", the scripted load first, then the results as text and
//   one JSON block in a read-only text area; a run stopped early gives none.
// - The asset events in the page's own log; no request, beacon, object URL, or storage, ever.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { Mesh, MeshBasicMaterial, MeshToonMaterial, Vector3 } from "three";
import type { Camera, Material, Object3D, Scene, WebGLRenderer } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { candidatePieces } from "../../src/lookdev/candidate";
import { RUN_SECONDS } from "../../src/lookdev/metrics";
import { createLookdev } from "../../src/lookdev/page";
import type { LookdevDeps, LookdevPage } from "../../src/lookdev/page";
import type { Probe } from "../../src/lookdev/results";
import { framing } from "../../src/room/compose/framing";
import { REFERENCE_DESKTOP, REFERENCE_PHONE, stageFor } from "../../src/room/compose/stages";
import { readImage } from "../../src/room/glb/images";
import { MODEL_FLOOR } from "../../src/room/quality";
import type { Capability } from "../../src/room/quality";
import { qualitySettings } from "../../src/room/scene";
import { MODEL_NODE } from "../../src/room/scene/loader";
import { FakeClock, REPO, flush, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { desk } from "../helpers/glb";
import { cleanModel } from "../helpers/room-models";

afterEach(() => {
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------------------------------------------------
// The page's inputs, a renderer, a window with spies, and createImageBitmap
// --------------------------------------------------------------------------------------------------------------------
/** The drafts build's inputs, as compose() gives them over the repository. */
function inputs(): LookdevDeps["inputs"] {
  const bundle = repositoryBundle({ drafts: true });
  if (!bundle.drafts) throw new Error("no drafts modules");
  return { part: bundle.scene, index: bundle.index, lookdev: bundle.drafts.lookdev, fixtures: bundle.drafts.fixtures };
}

/** A stand-in for WebGLRenderer: each render "draws" every visible mesh, counting its calls and triangles as
 *  renderer.info does, and calls its onBeforeRender, as OutlineEffect's lines need. */
function fakeRenderer(): { renderer: WebGLRenderer; state: { ratio: number; size: [number, number]; passes: number } } {
  const state = { ratio: 1, size: [0, 0] as [number, number], passes: 0 };
  const info = {
    autoReset: true,
    render: { calls: 0, triangles: 0, frame: 0 },
    reset(): void {
      info.render.calls = 0;
      info.render.triangles = 0;
    },
  };
  const fake = {
    autoClear: true,
    shadowMap: { enabled: true },
    outputColorSpace: "",
    info,
    setPixelRatio: (ratio: number) => (state.ratio = ratio),
    getPixelRatio: () => state.ratio,
    setSize: (w: number, h: number) => (state.size = [w, h]),
    initTexture: () => undefined,
    dispose: () => undefined,
    render(scene: Scene, camera: Camera): void {
      state.passes += 1;
      if (info.autoReset) info.reset();
      scene.traverseVisible((node: Object3D) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        info.render.calls += 1;
        const g = mesh.geometry;
        info.render.triangles += Math.floor((g.index?.count ?? g.getAttribute("position")?.count ?? 0) / 3);
        mesh.onBeforeRender(
          fake as unknown as WebGLRenderer,
          scene,
          camera,
          g,
          mesh.material as Material,
          null as never,
        );
      });
    },
  };
  return { renderer: fake as unknown as WebGLRenderer, state };
}

/** Every request and storage API the page's window has, as spies. */
interface Spies {
  readonly network: string[];
  readonly storage: string[];
}

function spyOn(win: TestWindow): Spies {
  const spies: Spies = { network: [], storage: [] };
  const define = (target: object, name: string, descriptor: PropertyDescriptor): void => {
    Object.defineProperty(target, name, { configurable: true, ...descriptor });
  };
  define(win, "fetch", {
    value: (input: unknown) => {
      spies.network.push(`fetch ${String(input)}`);
      return Promise.reject(new TypeError("no network in the page's tests"));
    },
  });
  class Refused {
    constructor(url?: string) {
      spies.network.push(`${new.target.name} ${String(url)}`);
    }
    open(method: string, url: string): void {
      spies.network.push(`XMLHttpRequest ${method} ${url}`);
    }
    send(): void {}
  }
  for (const name of ["XMLHttpRequest", "WebSocket", "EventSource"]) define(win, name, { value: Refused });
  define(win.navigator, "sendBeacon", {
    value: (url: string) => (spies.network.push(`sendBeacon ${url}`), true),
  });
  define(win.URL, "createObjectURL", { value: () => (spies.network.push("URL.createObjectURL"), "blob:refused") });
  define(win.document, "cookie", {
    get: () => (spies.storage.push("document.cookie read"), ""),
    set: () => spies.storage.push("document.cookie write"),
  });
  for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches"])
    define(win, name, { get: () => (spies.storage.push(name), undefined) });
  return spies;
}

/** createImageBitmap's stand-in, which jsdom lacks: a bitmap of the image header's size, or the resize asked for. */
function imageBitmaps(win: TestWindow): void {
  Object.defineProperty(win, "createImageBitmap", {
    configurable: true,
    value: async (source: Blob | { width: number; height: number }, o: ImageBitmapOptions = {}) => {
      const size =
        source instanceof Blob ? readImage(new Uint8Array(await source.arrayBuffer())).header : (source as ImageBitmap);
      if (!size) throw new Error("undecodable");
      return { width: o.resizeWidth ?? size.width, height: o.resizeHeight ?? size.height, close: () => undefined };
    },
  });
}

const ABOVE_FLOOR: Capability = {
  webgl2: true,
  maxTextureSize: MODEL_FLOOR.maxTextureSize,
  deviceMemory: MODEL_FLOOR.deviceMemory,
};

interface Opened {
  readonly win: TestWindow;
  readonly doc: Document;
  readonly root: HTMLElement;
  readonly clock: FakeClock;
  readonly page: LookdevPage;
  readonly spies: Spies;
  readonly renderer: ReturnType<typeof fakeRenderer>["state"];
  readonly inputs: LookdevDeps["inputs"];
}

/** The page on its own window, as /lookdev/ serves it, with every spy in place first. */
function open(options: { phone?: boolean; probe?: Probe | null; capability?: Capability } = {}): Opened {
  const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body><main id="lookdev"></main></body></html>', {
    url: "http://127.0.0.1:18105/lookdev/",
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as TestWindow;
  const spies = spyOn(win);
  imageBitmaps(win);
  const clock = new FakeClock();
  const { renderer, state } = fakeRenderer();
  const given = inputs();
  const root = win.document.getElementById("lookdev") as HTMLElement;
  const page = createLookdev(
    root,
    { phone: options.phone ?? false, probe: options.probe ?? null },
    { win, clock, inputs: given, renderer: () => renderer, capability: () => options.capability ?? ABOVE_FLOOR },
  );
  return { win, doc: win.document, root, clock, page, spies, renderer: state, inputs: given };
}

/** Lets the page's promises settle: a picked file read, a model parsed and swapped. */
async function settle(clock?: FakeClock): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await flush();
    clock?.advance(40);
  }
  await flush();
}

const collapse = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** A control by its label's text. */
function control<T extends HTMLElement>(root: HTMLElement, label: string): T {
  for (const el of root.querySelectorAll("label")) {
    if (collapse(el.textContent) !== label) continue;
    const id = el.getAttribute("for");
    const target = id ? root.ownerDocument.getElementById(id) : el.querySelector("input, select");
    if (target) return target as T;
  }
  throw new Error(`no control labelled "${label}"`);
}

/** A button by its text. */
function buttonNamed(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => collapse(b.textContent) === name);
  if (!found) throw new Error(`no button "${name}"`);
  return found;
}

/** Chooses a value: a radio clicked, a select changed. */
function choose(el: HTMLInputElement | HTMLSelectElement, value?: string): void {
  if (el instanceof el.ownerDocument.defaultView!.HTMLSelectElement) {
    el.value = value ?? "";
    el.dispatchEvent(new el.ownerDocument.defaultView!.Event("change", { bubbles: true }));
  } else el.click();
}

/** The visible drawable meshes under a placement's node, not counting placements mounted on it. */
function drawn(page: LookdevPage, placement: string): boolean {
  const room = page.stage.room;
  const nodes = new Set(room.placements.values());
  let any = false;
  const visit = (node: Object3D, visible: boolean): void => {
    for (const child of node.children) {
      if (nodes.has(child)) continue;
      const shown = visible && child.visible;
      if ((child as Mesh).isMesh && shown) any = true;
      visit(child, shown);
    }
  };
  const node = room.placements.get(placement);
  if (node) visit(node, true);
  return any;
}

/** A piece the vignette shows, with no live face, that takes a candidate, and its catalog entry. */
function vignettePiece(given: LookdevDeps["inputs"]): { piece: string; placement: string; entry: unknown } {
  const { part, lookdev } = given;
  const takes = new Set(candidatePieces(part, lookdev.pieces));
  for (const id of lookdev.vignette.show) {
    const p = part.placements.find((x) => x.id === id);
    if (!p || !takes.has(p.piece) || Object.keys(part.pieces[p.piece]?.faces ?? {}).length > 0) continue;
    const entry = parse(readFileSync(join(REPO, "apps/web/room/catalog", `${p.piece}.yaml`), "utf8")) as unknown;
    return { piece: p.piece, placement: p.id, entry };
  }
  throw new Error("no vignette piece takes a candidate");
}

/** Every piece the vignette shows with a live face, that takes a candidate: its catalog entry and its faces' roles. */
function faceVignettePieces(
  given: LookdevDeps["inputs"],
): { piece: string; entry: unknown; roles: readonly string[] }[] {
  const { part, lookdev } = given;
  const takes = new Set(candidatePieces(part, lookdev.pieces));
  const pieces = new Set(
    lookdev.vignette.show.flatMap((id) => part.placements.filter((p) => p.id === id).map((p) => p.piece)),
  );
  return [...pieces].flatMap((piece) => {
    const roles = Object.keys(part.pieces[piece]?.faces ?? {});
    if (!takes.has(piece) || roles.length === 0) return [];
    const entry = parse(readFileSync(join(REPO, "apps/web/room/catalog", `${piece}.yaml`), "utf8")) as unknown;
    return [{ piece, entry, roles }];
  });
}

/** Whether a node draws: it and every node above it visible. */
function shows(node: Object3D): boolean {
  for (let n: Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** The name a picker would reveal, which must appear nowhere. */
const PICKED_NAME = "PXL_20261023_fx-picked-name.glb";

/** Picks a file for a piece: the input's files hold a file whose every property but arrayBuffer is recorded. */
function pick(root: HTMLElement, piece: string, data: Uint8Array): string[] {
  const input = root.querySelector<HTMLInputElement>(`input[type="file"][data-piece="${piece}"]`);
  if (!input) throw new Error(`no picker for ${piece}`);
  const touched: string[] = [];
  const file = new Proxy(
    { name: PICKED_NAME, size: data.length, type: "model/gltf-binary", lastModified: 0 },
    {
      get(target, key) {
        if (key === "arrayBuffer") return () => Promise.resolve(data.slice().buffer);
        if (key === "then") return undefined;
        touched.push(String(key));
        return (target as Record<string | symbol, unknown>)[key];
      },
    },
  );
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new (root.ownerDocument.defaultView as TestWindow).Event("change", { bubbles: true }));
  return touched;
}

/** Picks a file for a piece whose read the test settles: it resolves with bytes, or rejects, when the test says. */
function pickLater(root: HTMLElement, piece: string): { resolve(data: Uint8Array): void; reject(error: Error): void } {
  const input = root.querySelector<HTMLInputElement>(`input[type="file"][data-piece="${piece}"]`);
  if (!input) throw new Error(`no picker for ${piece}`);
  let settle: { resolve(data: Uint8Array): void; reject(error: Error): void } | undefined;
  const read = new Promise<Uint8Array>((resolve, reject) => (settle = { resolve, reject }));
  // A Blob's two reads: the whole file, and a part of it.
  const bytes = (start?: number, end?: number): Promise<ArrayBuffer> =>
    read.then((data) => data.slice(start, end).buffer);
  const file = {
    arrayBuffer: () => bytes(),
    slice: (start?: number, end?: number) => ({ arrayBuffer: () => bytes(start, end) }),
  };
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new (root.ownerDocument.defaultView as TestWindow).Event("change", { bubbles: true }));
  if (!settle) throw new Error("no read");
  return settle;
}

const nodeSha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

// --------------------------------------------------------------------------------------------------------------------
// The page
// --------------------------------------------------------------------------------------------------------------------
describe("the lookdev page (contracts/lookdev.md §1 to §3)", () => {
  it("builds itself inside its root: one canvas, the controls, a picker per piece, the readouts, results, and log", () => {
    const { root, inputs: given } = open();
    expect(root.querySelectorAll("canvas")).toHaveLength(1);
    expect(collapse(root.textContent)).toMatch(/drafts only/i);
    for (const label of ["Reference desktop", "Reference phone", "Desk close-up", "Room", "Vignette"])
      expect(control<HTMLInputElement>(root, label).type).toBe("radio");
    for (const label of ["Automatic", "Pinned at 0", "Pinned at 1", "Pinned at 2", "Pinned at 3"])
      expect(control<HTMLInputElement>(root, label).type).toBe("radio");
    const looks = [...control<HTMLSelectElement>(root, "Look").options].map((o) => o.value);
    expect(looks).toEqual(given.lookdev.looks.map((l) => l.id));
    expect(control<HTMLSelectElement>(root, "Look").value).toBe(given.part.look.id);
    const samples = [...control<HTMLSelectElement>(root, "Sample state").options].map((o) => o.value);
    expect(samples).toEqual(given.fixtures.map((f) => f.id));
    for (const name of ["Pause", "Load every piece", "Run 2 minutes", "Run 10 minutes"]) buttonNamed(root, name);
    expect(RUN_SECONDS).toEqual([120, 600]);
    const pickers = [...root.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    expect(pickers.map((p) => p.dataset.piece)).toEqual(candidatePieces(given.part, given.lookdev.pieces));
    for (const p of pickers) expect(collapse(p.closest("label")?.textContent)).toBe("Load a candidate…");
    expect(root.querySelector("textarea")).toBeNull();
    expect(root.querySelector(".lookdev-log")).not.toBeNull();
  });

  it("leaves nothing running when it throws as it's built: no frame, no timer, and its renderer released", () => {
    // The review's page-2: a page that can't be built says why (main.ts), and keeps no stage drawing behind the note.
    const throwing: [string, (given: LookdevDeps["inputs"], renderer: WebGLRenderer) => void][] = [
      // After the stage: the page's controls read the looks.
      ["the page", (given) => Object.assign(given, { lookdev: { ...given.lookdev, looks: undefined } })],
      // Inside the stage, after its renderer: the first fit sets the pixel ratio.
      [
        "the stage",
        (_, renderer) =>
          Object.assign(renderer, {
            setPixelRatio: () => {
              throw new Error("no pixel ratio");
            },
          }),
      ],
    ];
    for (const [where, breakIt] of throwing) {
      const win = new JSDOM('<!doctype html><main id="lookdev"></main>', { pretendToBeVisual: true })
        .window as unknown as TestWindow;
      imageBitmaps(win);
      const clock = new FakeClock();
      const { renderer } = fakeRenderer();
      const disposed = vi.spyOn(renderer, "dispose");
      const given = inputs();
      breakIt(given, renderer);
      const root = win.document.getElementById("lookdev") as HTMLElement;
      expect(
        () =>
          createLookdev(
            root,
            { phone: false, probe: null },
            { win, clock, inputs: given, renderer: () => renderer, capability: () => ABOVE_FLOOR },
          ),
        where,
      ).toThrow();
      expect([clock.pendingFrames, clock.pendingTimers], where).toEqual([0, 0]);
      expect(disposed, where).toHaveBeenCalled();
    }
  });

  it("draws the room after the hand-off, in the scene's look, on the real controller", () => {
    const { page, clock, renderer, inputs: given } = open();
    clock.advance(200);
    expect(renderer.passes).toBeGreaterThan(0);
    expect(page.stage.look.id).toBe(given.part.look.id);
    expect(page.stage.quality).toBe("auto");
    expect(page.stage.room.paper.atVisitor.opacity + page.stage.room.paper.atTwin.opacity).toBeGreaterThan(0);
  });
});

describe("the views (contracts/lookdev.md §3)", () => {
  /** The camera the kernel's framing places over these boxes for this stage. */
  function expectFramed(page: LookdevPage, aspect: number, boxes: Parameters<typeof framing>[1]): void {
    const spec = framing(aspect, boxes);
    expect(page.stage.camera.position.distanceTo(new Vector3(...spec.position))).toBeLessThan(1e-9);
    expect(page.stage.camera.fov).toBeCloseTo(spec.fov, 9);
  }

  it("draws the reference desktop's stage at a pixel ratio of 1, at the production framing", () => {
    const { page, clock, root, renderer, inputs: given } = open();
    clock.advance(50);
    const { w, h } = REFERENCE_DESKTOP.stage;
    const canvas = root.querySelector("canvas") as HTMLCanvasElement;
    expect([canvas.style.width, canvas.style.height]).toEqual([`${w}px`, `${h}px`]);
    expect(renderer.size).toEqual([w, h]);
    expect(renderer.ratio).toBe(1);
    expectFramed(
      page,
      w / h,
      given.part.placements.filter((p) => p.framed).map((p) => p.frame_box),
    );
  });

  it("draws the reference phone's last measured stage at its pixel ratio, as the room caps it", () => {
    const { page, clock, root, renderer, inputs: given } = open();
    choose(control<HTMLInputElement>(root, "Reference phone"));
    clock.advance(50);
    const { w, h } = REFERENCE_PHONE.stage;
    expect(renderer.size).toEqual([w, h]);
    expect(renderer.ratio).toBe(Math.min(REFERENCE_PHONE.dpr, qualitySettings(0).pixelRatio));
    expectFramed(
      page,
      w / h,
      given.part.placements.filter((p) => p.framed).map((p) => p.frame_box),
    );
  });

  it("frames the desk close-up over close_up.frame's boxes, its readouts labelled close-up", () => {
    const { page, clock, root, inputs: given } = open();
    choose(control<HTMLInputElement>(root, "Desk close-up"));
    clock.advance(50);
    const boxes = given.lookdev.close_up.frame.map((id) => given.part.placements.find((p) => p.id === id)?.frame_box);
    const { w, h } = REFERENCE_DESKTOP.stage;
    expectFramed(
      page,
      w / h,
      boxes.flatMap((b) => (b ? [b] : [])),
    );
    expect(collapse(root.querySelector(".lookdev-readouts")?.textContent)).toMatch(/close-up/);
  });

  it("in the copy opened on a desktop, offers the reference phone's stage as the site's page does, and claims no phone", () => {
    // The review's page-4 and phone-2: the copy in a desktop browser, a 1920 × 1080 viewport at a pixel ratio of 1.
    const probe: Probe = {
      webgl2: true,
      max_texture_size: 16384,
      device_memory: 8,
      create_image_bitmap: true,
      secure_context: true,
      viewport: [1920, 1080],
      dpr: 1,
    };
    const { page, clock, root, renderer, inputs: given } = open({ phone: true, probe });
    clock.advance(50);
    const caption = (): string => collapse(root.querySelector(".lookdev-caption")?.textContent);
    // The default view is this device's own stage, labelled as this device, never as a phone.
    const own = stageFor({ w: 1920, h: 1080 });
    expect(caption()).not.toMatch(/phone/i);
    expect(caption()).toMatch(/^This device: /);
    expect(control<HTMLInputElement>(root, "This device").checked).toBe(true);
    expect(renderer.size).toEqual([own.w, own.h]);
    expect(renderer.ratio).toBe(1);
    // The reference phone: stages.ts's last measured stage at its pixel ratio, as the site's page draws it.
    choose(control<HTMLInputElement>(root, "Reference phone"));
    clock.advance(50);
    const { w, h } = REFERENCE_PHONE.stage;
    expect(page.stage.view).toBe("phone");
    expect(renderer.size).toEqual([w, h]);
    expect(renderer.ratio).toBe(Math.min(REFERENCE_PHONE.dpr, qualitySettings(0).pixelRatio));
    expectFramed(
      page,
      w / h,
      given.part.placements.filter((p) => p.framed).map((p) => p.frame_box),
    );
    expect(caption()).not.toMatch(/own/);
    // The site's page has no probe, so no view of the device's own stage.
    expect(collapse(open().root.textContent)).not.toContain("This device");
  });

  it("in the phone copy, first draws this device's own stage, at the probe's viewport and pixel ratio", () => {
    const probe: Probe = {
      webgl2: true,
      max_texture_size: 8192,
      device_memory: 8,
      create_image_bitmap: true,
      secure_context: false,
      viewport: [412, 780],
      dpr: 2.625,
    };
    const { clock, renderer } = open({ phone: true, probe });
    clock.advance(50);
    const stage = stageFor({ w: 412, h: 780 });
    expect(renderer.size).toEqual([stage.w, stage.h]);
    expect(renderer.ratio).toBe(Math.min(2.625, qualitySettings(0).pixelRatio));
  });
});

describe("the scene, the look, the sample state, quality, and pause (contracts/lookdev.md §3)", () => {
  it("shows only vignette.show's placements in the vignette, every mount still resolved", () => {
    const { page, root, inputs: given } = open();
    const shown = new Set(given.lookdev.vignette.show);
    const before = new Map(
      [...page.stage.room.placements].map(([id, node]) => [id, node.getWorldPosition(new Vector3())]),
    );
    choose(control<HTMLInputElement>(root, "Vignette"));
    for (const p of given.part.placements) {
      if (p.id === given.part.figures.visitor) continue;
      expect(drawn(page, p.id), p.id).toBe(shown.has(p.id));
    }
    for (const [id, node] of page.stage.room.placements)
      expect(node.getWorldPosition(new Vector3()).distanceTo(before.get(id) as Vector3), id).toBeLessThan(1e-9);
    choose(control<HTMLInputElement>(root, "Room"));
    for (const id of shown) expect(drawn(page, id), id).toBe(true);
  });

  it("never shows a model's own face objects, which the loader hides since the room draws the faces, in either scene", async () => {
    // The review's page-1: the busy sign's `lettering` quad, among others, a Mesh named for its live face's role.
    const { page, root, clock, inputs: given } = open();
    const pieces = faceVignettePieces(given);
    expect(pieces.map((p) => p.piece)).toContain("busy-sign");
    for (const { piece, entry } of pieces) {
      pick(root, piece, cleanModel(entry as Parameters<typeof cleanModel>[0]));
      await settle(clock);
      expect(page.stage.loaded.has(piece), piece).toBe(true);
    }
    /** Each piece's shown models, in every placement of it, and their face objects. */
    const models = (): { piece: string; model: Object3D; faces: Object3D[] }[] =>
      pieces.flatMap(({ piece, roles }) =>
        given.part.placements
          .filter((p) => p.piece === piece)
          .flatMap((p) => page.stage.room.placements.get(p.id)?.children.filter((c) => c.name === MODEL_NODE) ?? [])
          .map((model) => {
            const faces: Object3D[] = [];
            model.traverse((node) => {
              if (roles.includes(node.name)) faces.push(node);
            });
            return { piece, model, faces };
          }),
      );
    for (const scene of ["Room", "Vignette", "Room"]) {
      choose(control<HTMLInputElement>(root, scene));
      clock.advance(50);
      const shown = models();
      expect(shown.length).toBeGreaterThanOrEqual(pieces.length);
      for (const { piece, model, faces } of shown) {
        expect(faces.length, `${scene} ${piece}`).toBeGreaterThan(0);
        // The model itself draws: every vignette piece shows in both scenes.
        expect(shows(model), `${scene} ${piece}`).toBe(true);
        for (const face of faces) expect(shows(face), `${scene} ${piece} ${face.name}`).toBe(false);
      }
    }
  });

  it("applies each look at run time: inked cel's toon materials and lines, painted's and flat's unlit ones", () => {
    const { page, root, clock, renderer, inputs: given } = open();
    const select = control<HTMLSelectElement>(root, "Look");
    for (const look of given.lookdev.looks) {
      choose(select, look.id);
      expect(page.stage.look.id).toBe(look.id);
      const materials = new Set<Material>();
      page.stage.room.scene.traverse((node) => {
        const mesh = node as Mesh;
        if (mesh.isMesh && node.parent?.name === "standin") materials.add(mesh.material as Material);
      });
      expect(materials.size).toBeGreaterThan(0);
      const kind = look.method === "inked-cel" ? MeshToonMaterial : MeshBasicMaterial;
      for (const m of materials) {
        if (m instanceof MeshBasicMaterial && look.method === "inked-cel") continue; // an unlit shape stays unlit
        expect(m, look.id).toBeInstanceOf(kind);
      }
      const passes = renderer.passes;
      clock.advance(16);
      expect(renderer.passes - passes, look.id).toBe(look.method === "inked-cel" ? 2 : 1);
    }
  });

  it("shows the tier switch's case for each fixture's tier, its sentence and figures badged as a sample", () => {
    const { page, root, inputs: given } = open();
    const select = control<HTMLSelectElement>(root, "Sample state");
    for (const fixture of given.fixtures) {
      choose(select, fixture.id);
      for (const sw of given.index.switches) {
        const cases = page.stage.room.switches.get(sw.id);
        for (const [pose, group] of cases ?? [])
          expect(group.visible, `${fixture.id} ${pose}`).toBe(pose === sw.cases[fixture.tier]);
      }
      const panel = collapse(root.querySelector(".lookdev-sample")?.textContent);
      expect(panel).toContain(given.index.ui[`tier.${fixture.tier}`] ?? "a tier sentence");
      expect(panel).toContain(given.index.ui["sign.sample"] ?? "the sample badge");
    }
  });

  it("runs the real controller in automatic, stepping down on slow frames, and holds a pinned level", () => {
    const auto = open();
    auto.clock.advance(12_000, 100);
    expect(auto.page.stage.level).toBeGreaterThan(0);
    const pinned = open();
    choose(control<HTMLInputElement>(pinned.root, "Pinned at 2"));
    pinned.clock.advance(20_000, 100);
    expect(pinned.page.stage.level).toBe(2);
    expect(pinned.page.stage.quality).toBe(2);
    expect(pinned.renderer.ratio).toBe(Math.min(1, qualitySettings(2).pixelRatio));
  });

  it("pauses the idle sway, and lets it move again", () => {
    const { page, root, clock } = open();
    const pause = buttonNamed(root, "Pause");
    expect(pause.getAttribute("aria-pressed")).toBe("false");
    clock.advance(400);
    pause.click();
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    clock.advance(400);
    expect(page.stage.room.twin.rotation.z).toBe(0);
    pause.click();
    clock.advance(400);
    expect(page.stage.room.twin.rotation.z).not.toBe(0);
  });
});

describe("candidates, in memory only (contracts/lookdev.md §4)", () => {
  it("reads a picked file with arrayBuffer() alone, shows its hash, sizes, mark, and findings, and swaps it in", async () => {
    const { page, root, clock, spies, inputs: given } = open();
    const { piece, placement, entry } = vignettePiece(given);
    const data = cleanModel(entry as Parameters<typeof cleanModel>[0]);
    const touched = pick(root, piece, data);
    await settle(clock);
    expect(touched).toEqual([]);
    const row = root.querySelector(`[data-candidate="${piece}"]`);
    const text = collapse(row?.textContent);
    expect(text).toContain(nodeSha256(data));
    // The clean model is in the scrubbed form, with spec 003's model mark and no finding: a hash the Author may approve.
    expect(text).toContain("Mark: model");
    expect(text).toContain("Findings: none");
    expect(page.stage.loaded.has(piece)).toBe(true);
    const node = page.stage.room.placements.get(placement);
    expect(node?.children.some((c) => c.name === MODEL_NODE)).toBe(true);
    // Its name, which the picker revealed, is nowhere on the page, nor kept by the input.
    expect(root.ownerDocument.documentElement.outerHTML).not.toContain(PICKED_NAME);
    expect(root.querySelector<HTMLInputElement>(`input[data-piece="${piece}"]`)?.value).toBe("");
    // An asset event, in the page's own log, and never a request or a stored byte.
    expect(collapse(root.querySelector(".lookdev-log")?.textContent)).toMatch(new RegExp(`${piece} loaded`));
    expect(spies.network).toEqual([]);
    expect(spies.storage).toEqual([]);
  });

  it('reads "not scrubbed" for a file without spec 003\'s mark, lists its findings, and still swaps it in', async () => {
    const { page, root, clock, inputs: given } = open();
    const { piece } = vignettePiece(given);
    const data = desk({ mark: false }).bytes;
    pick(root, piece, data);
    await settle(clock);
    const text = collapse(root.querySelector(`[data-candidate="${piece}"]`)?.textContent);
    expect(text).toContain(nodeSha256(data));
    expect(text).toContain("Mark: not scrubbed");
    expect(text).toMatch(/RX5 candidate:extensions: not scrubbed/);
    // Swapped in whatever its other findings, its textures decoded with no object URL, so a misfit shows at the framing.
    expect(page.stage.loaded.has(piece)).toBe(true);
    expect(page.stage.textureBytes).toBeGreaterThan(0);
  });

  it("restores the stand-in on Clear", async () => {
    const { page, root, clock, inputs: given } = open();
    const { piece, placement, entry } = vignettePiece(given);
    pick(root, piece, cleanModel(entry as Parameters<typeof cleanModel>[0]));
    await settle(clock);
    const row = root.querySelector(`[data-candidate="${piece}"]`)?.closest(".lookdev-piece") as HTMLElement;
    buttonNamed(row, "Clear").click();
    await settle(clock);
    expect(page.stage.loaded.has(piece)).toBe(false);
    const node = page.stage.room.placements.get(placement);
    expect(node?.children.some((c) => c.name === MODEL_NODE)).toBe(false);
    expect(node?.children.find((c) => c.name === "standin")?.visible).toBe(true);
    expect(collapse(root.querySelector(`[data-candidate="${piece}"]`)?.textContent)).not.toMatch(/[0-9a-f]{64}/);
  });

  it("says a picked file that can't be read couldn't be read, and keeps nothing (the review's page-6)", async () => {
    const { page, root, clock, inputs: given } = open();
    const { piece } = vignettePiece(given);
    pickLater(root, piece).reject(new Error("NotReadableError: the file moved"));
    await settle(clock);
    const text = collapse(root.querySelector(`[data-candidate="${piece}"]`)?.textContent);
    expect(text).toMatch(/couldn't be read/);
    expect(text).toMatch(/nothing kept/);
    expect(page.stage.loaded.has(piece)).toBe(false);
  });

  it("drops a read that ends after Clear, or after a newer pick of the same piece (the review's page-6)", async () => {
    const { page, root, clock, inputs: given } = open();
    const { piece, entry } = vignettePiece(given);
    const row = (): string => collapse(root.querySelector(`[data-candidate="${piece}"]`)?.textContent);
    const clean = cleanModel(entry as Parameters<typeof cleanModel>[0]);
    const pieceRow = root.querySelector(`[data-candidate="${piece}"]`)?.closest(".lookdev-piece") as HTMLElement;
    // Picked, then cleared before the read ends: the stand-in stays.
    const cleared = pickLater(root, piece);
    buttonNamed(pieceRow, "Clear").click();
    cleared.resolve(clean);
    await settle(clock);
    expect(page.stage.loaded.has(piece)).toBe(false);
    expect(row()).not.toContain(nodeSha256(clean));
    // Picked twice, the first read ending last: the second pick's file is the one shown and swapped in.
    const older = pickLater(root, piece);
    const newer = pickLater(root, piece);
    const unmarked = desk({ mark: false }).bytes;
    newer.resolve(unmarked);
    await settle(clock);
    older.resolve(clean);
    await settle(clock);
    expect(row()).toContain(nodeSha256(unmarked));
    expect(row()).not.toContain(nodeSha256(clean));
    expect(row()).toContain("Mark: not scrubbed");
    expect(page.stage.loaded.has(piece)).toBe(true);
  });

  it("swaps in no file RX1 refuses, and says why", async () => {
    const { page, root, clock, inputs: given } = open();
    const { piece } = vignettePiece(given);
    pick(root, piece, new TextEncoder().encode("not a glTF file at all"));
    await settle(clock);
    expect(page.stage.loaded.has(piece)).toBe(false);
    const text = collapse(root.querySelector(`[data-candidate="${piece}"]`)?.textContent);
    expect(text).toMatch(/RX1 candidate:/);
    expect(text).toMatch(/not swapped in/i);
  });

  it("loads every piece again through the loader on Load every piece: back to the stand-in, then the model", async () => {
    const { page, root, clock, inputs: given } = open();
    const { piece, entry } = vignettePiece(given);
    pick(root, piece, cleanModel(entry as Parameters<typeof cleanModel>[0]));
    await settle(clock);
    buttonNamed(root, "Load every piece").click();
    expect(page.stage.loaded.has(piece)).toBe(false);
    await settle(clock);
    expect(page.stage.loaded.has(piece)).toBe(true);
    const log = [...root.querySelectorAll(".lookdev-log li")].map((li) => collapse(li.textContent));
    expect(log.filter((line) => line.includes(`${piece} loaded`))).toHaveLength(2);
  });

  it("loads no model below ADR 0010's floor, and says a run measures stand-ins only", async () => {
    const {
      page,
      root,
      clock,
      inputs: given,
    } = open({
      capability: { webgl2: true, maxTextureSize: 2048, deviceMemory: 2 },
    });
    expect(collapse(root.textContent)).toMatch(/stand-ins only/);
    const { piece, entry } = vignettePiece(given);
    pick(root, piece, cleanModel(entry as Parameters<typeof cleanModel>[0]));
    await settle(clock);
    expect(page.stage.loaded.has(piece)).toBe(false);
    expect(collapse(root.querySelector(".lookdev-log")?.textContent)).toMatch(new RegExp(`${piece} skipped`));
  });
});

describe("runs and their results (contracts/lookdev.md §5, §6)", () => {
  it("runs 2 minutes, the scripted load first, then shows the results as text and one read-only JSON block", async () => {
    const { root, clock, spies, inputs: given } = open();
    const { piece, entry } = vignettePiece(given);
    const data = cleanModel(entry as Parameters<typeof cleanModel>[0]);
    pick(root, piece, data);
    await settle(clock);
    buttonNamed(root, "Run 2 minutes").click();
    await settle(clock);
    // While it measures, nothing changes its setting: the controls, the pickers, and Clear are off.
    expect(control<HTMLSelectElement>(root, "Look").disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>(`input[data-piece="${piece}"]`)?.disabled).toBe(true);
    const pieceRow = root.querySelector(`[data-candidate="${piece}"]`)?.closest(".lookdev-piece") as HTMLElement;
    expect(buttonNamed(pieceRow, "Clear").disabled).toBe(true);
    clock.advance(120_000, 100);
    await settle(clock);
    const area = root.querySelector("textarea");
    expect(area?.readOnly).toBe(true);
    const results = JSON.parse(area?.value ?? "{}") as Record<string, unknown>;
    expect(Object.keys(results)).toEqual([
      "schema",
      "build",
      "bundle",
      "probe",
      "scene",
      "view",
      "stage_css",
      "dpr",
      "look",
      "sample",
      "quality",
      "duration_s",
      "scripted_load",
      "frames",
      "draw_calls",
      "triangles",
      "texture_bytes",
      "smallest_cap_css",
      "candidates",
    ]);
    expect(results).toMatchObject({
      schema: 1,
      build: "drafts",
      bundle: given.part.digest,
      probe: null,
      scene: "room",
      view: "desktop",
      look: given.part.look.id,
      sample: given.fixtures[0]?.id,
      duration_s: 120,
      scripted_load: true,
      quality: { mode: "auto" },
    });
    // The pixel ratio drawn at: the desktop's 1, as the level the controller settled at caps it.
    const settled = (results.quality as { settled: number }).settled;
    expect(results.dpr).toBe(Math.min(1, qualitySettings(settled).pixelRatio));
    expect(results.stage_css).toEqual([REFERENCE_DESKTOP.stage.w, REFERENCE_DESKTOP.stage.h]);
    expect((results.frames as { count: number }).count).toBeGreaterThan(1000);
    expect(results.draw_calls).toBeGreaterThan(0);
    expect(results.candidates).toEqual([
      expect.objectContaining({ piece, sha256: nodeSha256(data), scrubbed: true, mark: "model", findings: [] }),
    ]);
    expect(area?.value).not.toContain(PICKED_NAME);
    expect(collapse(root.querySelector(".lookdev-results")?.textContent)).toContain("Lookdev results");
    expect(control<HTMLSelectElement>(root, "Look").disabled).toBe(false);
    expect(spies.network).toEqual([]);
    expect(spies.storage).toEqual([]);
  });

  it("gives no results for a run stopped early", async () => {
    const { root, clock } = open();
    buttonNamed(root, "Run 10 minutes").click();
    await settle(clock);
    clock.advance(30_000, 100);
    buttonNamed(root, "Stop the run").click();
    clock.advance(600_000, 1000);
    await settle(clock);
    expect(root.querySelector("textarea")).toBeNull();
    expect(collapse(root.querySelector(".lookdev-results")?.textContent)).not.toContain("Lookdev results");
  });

  it("starts an automatic run on a fresh controller at level 0, whatever the page stepped down to before", async () => {
    // The review's page-7: slow frames before the run step the page's controller down.
    const { page, root, clock } = open();
    clock.advance(12_000, 100);
    expect(page.stage.level).toBeGreaterThan(0);
    buttonNamed(root, "Run 2 minutes").click();
    expect(page.stage.level).toBe(0);
    await settle(clock);
    // Frames at 60 a second throughout: nothing to step down for.
    clock.advance(120_000, 16);
    await settle(clock);
    const results = JSON.parse(root.querySelector("textarea")?.value ?? "{}") as Record<string, unknown>;
    expect(results.quality).toEqual({ mode: "auto", settled: 0, step_downs: 0, step_downs_while_loading: 0 });
    expect(results.dpr).toBe(1);
  });

  it("stops a run when the page is hidden, which draws no frames, with no results, and says why", async () => {
    // The review's page-3: the phone's screen times out mid-run; its frames stop, and the run's timer runs on.
    const { root, clock, doc } = open();
    buttonNamed(root, "Run 10 minutes").click();
    await settle(clock);
    clock.advance(30_000, 16);
    Object.defineProperty(doc, "visibilityState", { configurable: true, value: "hidden" });
    Object.defineProperty(doc, "hidden", { configurable: true, value: true });
    doc.dispatchEvent(new (doc.defaultView as TestWindow).Event("visibilitychange"));
    clock.advance(600_000, Number.MAX_SAFE_INTEGER);
    await settle();
    expect(root.querySelector("textarea")).toBeNull();
    const text = collapse(root.querySelector(".lookdev-results")?.textContent);
    expect(text).not.toContain("Lookdev results");
    expect(text).toMatch(/stopped early/);
    expect(text).toMatch(/hidden/);
    expect(text).toMatch(/screen on/);
    expect(buttonNamed(root, "Run 10 minutes").disabled).toBe(false);
    expect(buttonNamed(root, "Stop the run").disabled).toBe(true);
  });

  it("records the probe in the phone copy's results", async () => {
    const probe: Probe = {
      webgl2: true,
      max_texture_size: 4096,
      device_memory: null,
      create_image_bitmap: true,
      secure_context: false,
      viewport: [384, 740],
      dpr: 2.8125,
    };
    const { root, clock } = open({ phone: true, probe });
    buttonNamed(root, "Run 2 minutes").click();
    await settle(clock);
    clock.advance(120_000, 250);
    await settle(clock);
    const results = JSON.parse(root.querySelector("textarea")?.value ?? "{}") as Record<string, unknown>;
    expect(results.probe).toEqual(probe);
    // The copy's first view is the stage of the device that opened it, which on the reference phone re-measures it.
    expect(results.view).toBe("device");
    const own = stageFor({ w: 384, h: 740 });
    expect(results.stage_css).toEqual([own.w, own.h]);
  });
});
