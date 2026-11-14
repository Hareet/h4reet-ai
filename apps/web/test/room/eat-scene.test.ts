// rework-024 (spec 024; FR-001, FR-009, FR-010, FR-012, US3 AS5; rv-impl-024's B-1): the eating's wiring in the real 3D
// stage (src/room/scene.ts), on a stand-in renderer and a jsdom window, as avatar-scene.test.ts stages the figures. The
// repository's 3D part, with the dinosaur's files from spec 021's test folder (helpers/room-dinosaur.ts) bundled in, so
// the visitor's figure shows the dinosaur's model; the busy sign's model is the real file built as GLTFLoader names it
// (helpers/eat-pieces.ts), put under its placement as the loader puts a model. The walking view is entered, and the
// reach is the one stand-in: press.ts's edibleReach names the busy sign for any pose, so the test needn't walk there.
// What runs: scene.ts's eatFrame, eatPress, modelOf, the label passed to `said`, and protectorFor(..., { eat }).
import { createHash } from "node:crypto";

import { JSDOM } from "jsdom";
import type { Mesh, Object3D, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { reservedBoxes } from "../../src/room/compose/hud";
import { FLIGHT_MS } from "../../src/room/eat/eat3d";
import { readImage } from "../../src/room/glb/images";
import { createScene } from "../../src/room/scene";
import type { SceneOptions } from "../../src/room/stage";
import { pieceModel, roomGlb } from "../helpers/eat-pieces";
import { FakeClock, flush, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { dinosaurFolder, dinosaurNight } from "../helpers/room-dinosaur";

const swapped = vi.hoisted(() => ({
  part: null as RoomScene | null,
  renderer: null as ((parameters: unknown) => unknown) | null,
  /** Each stage scene.ts gives the selectables' picker (its resize), in order. */
  picked: [] as { w: number; h: number; reserved?: readonly (readonly number[])[] }[],
}));

// The picker as built, its stages recorded (I-1: what scene.ts reserves in the stacked layout).
vi.mock("../../src/room/scene/bundle3d", async (importOriginal) => {
  const own = await importOriginal<typeof import("../../src/room/scene/bundle3d")>();
  return {
    ...own,
    selectablePicker: (...args: Parameters<typeof own.selectablePicker>) => {
      const picker = own.selectablePicker(...args);
      return {
        ...picker,
        resize(stage: Parameters<typeof picker.resize>[0]) {
          swapped.picked.push(stage);
          picker.resize(stage);
        },
      };
    },
  };
});

vi.mock("virtual:room-scene", async (importOriginal) => {
  const own = await importOriginal<{ default: RoomScene }>();
  return {
    get default() {
      return swapped.part ?? own.default;
    },
  };
});

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

// The reach, stood in: the busy sign for any pose.
vi.mock("../../src/room/eat/press", async (importOriginal) => {
  const own = await importOriginal<typeof import("../../src/room/eat/press")>();
  return { ...own, edibleReach: () => "busy-sign" };
});

afterEach(() => {
  swapped.part = null;
  swapped.renderer = null;
});

const PIECE = "busy-sign";

/** The repository's 3D part with the dinosaur's files bundled, and their bytes by URL. */
function dinosaurPart(): {
  part: RoomScene;
  index: ReturnType<typeof repositoryBundle>["index"];
  files: Map<string, Uint8Array>;
} {
  const repo = repositoryBundle();
  const dinosaur = dinosaurNight().scene.avatars.dinosaur;
  if (!dinosaur) throw new Error("no dinosaur in the night's bundle");
  const bySha = new Map<string, Uint8Array>();
  for (const bytes of Object.values(dinosaurFolder()))
    if (bytes instanceof Uint8Array) bySha.set(createHash("sha256").update(bytes).digest("hex"), bytes);
  const files = new Map<string, Uint8Array>();
  for (const f of [dinosaur.model, ...Object.values(dinosaur.clips)]) {
    if (!f) continue;
    const bytes = bySha.get(f.sha256);
    if (bytes) files.set(f.url, bytes);
  }
  const part = { ...repo.scene, avatars: { ...repo.scene.avatars, dinosaur } } as RoomScene;
  return { part, index: repo.index, files };
}

interface Staged {
  readonly stage: ReturnType<typeof createScene>;
  readonly clock: FakeClock;
  readonly view: HTMLElement;
  readonly state: { paused: boolean; loading: boolean };
  readonly offered: boolean[];
  readonly said: [string, string | null][];
  /** The busy sign's label word's key, as the 3D part carries it. */
  readonly label: string | null;
  drawn(): Scene;
}

async function staged(options: Partial<SceneOptions> = {}): Promise<Staged> {
  const { part, index, files } = dinosaurPart();
  swapped.part = part;
  let last: Scene | null = null;
  swapped.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene) => {
      if (scene.name === "") last ??= scene;
    },
    dispose: () => undefined,
  });
  const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, {
    url: "http://127.0.0.1:18105/",
    pretendToBeVisual: true,
  }).window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  Object.defineProperty(win, "createImageBitmap", {
    configurable: true,
    value: async (source: Blob, o: ImageBitmapOptions = {}) => {
      const size = readImage(new Uint8Array(await source.arrayBuffer())).header;
      if (!size) throw new Error("undecodable");
      return { width: o.resizeWidth ?? size.width, height: o.resizeHeight ?? size.height, close: () => undefined };
    },
  });
  // The dinosaur's files are answered; the set's models never are, so the pieces keep their stand-ins.
  Object.defineProperty(win, "fetch", {
    configurable: true,
    value: (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        const bytes = files.get(url.replace(/^.*?(a\/)/, "$1"));
        if (bytes) resolve({ status: 200, arrayBuffer: () => Promise.resolve(bytes.slice().buffer) } as Response);
      }),
  });
  const clock = new FakeClock();
  const state = { paused: false, loading: false };
  const offered: boolean[] = [];
  const said: [string, string | null][] = [];
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar: "dinosaur",
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
    floor: true,
    handoff: Promise.resolve(),
    eating: {
      state: () => state,
      available: (on) => offered.push(on),
      said: (id, label) => said.push([id, label]),
    },
    ...options,
  });
  Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => 960 });
  Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => 600 });
  const drawn = (): Scene => {
    if (!last) throw new Error("no frame drawn");
    return last;
  };
  // The dinosaur's model in the visitor's figure.
  for (let k = 0; k < 80 && !(await figureShows()); k++) {
    await flush();
    clock.advance(32);
  }
  async function figureShows(): Promise<boolean> {
    await flush();
    let found = false;
    try {
      drawn()
        .getObjectByName(part.figures.visitor)
        ?.traverse((n) => {
          if (n.name === "avatar") found = true;
        });
    } catch {
      return false;
    }
    return found;
  }
  if (!(await figureShows())) throw new Error("the dinosaur's model never showed");
  // The busy sign's model, under its placement, as the loader puts it.
  const node = drawn().getObjectByName(PIECE);
  if (!node) throw new Error("no busy sign's placement");
  const model = pieceModel(
    roomGlb(PIECE),
    part.pieces[part.placements.find((p) => p.id === PIECE)?.piece ?? ""]?.scale ?? 1,
  );
  model.name = "model";
  node.add(model);
  const view = win.document.getElementById("view") as HTMLElement;
  const label = part.placements.find((p) => p.id === PIECE)?.label ?? null;
  return { stage, clock, view, state, offered, said, label, drawn };
}

/** The busy sign's chunk meshes shown now, by chunk. */
function shownChunks(s: Staged): Set<number> {
  const out = new Set<number>();
  s.drawn()
    .getObjectByName(PIECE)
    ?.traverse((n: Object3D) => {
      const tag = n.userData.eat as { kind?: string; chunk?: number } | undefined;
      if (tag?.kind === "chunk" && (n as Mesh).visible) out.add(tag.chunk ?? -1);
    });
  return out;
}

const run = (s: Staged, ms: number): void => s.clock.advance(ms, 16);

describe("the eating's wiring in the 3D stage (scene.ts; FR-001, FR-009, FR-010, FR-012)", () => {
  it("reserves the Eat box for a dinosaur visit, offers the tile in reach, bites on a press, and says the piece's word", async () => {
    const s = await staged();
    expect(s.stage.protect?.eat).toBe(true);
    expect(s.stage.eat).toBeDefined();
    s.stage.walk.enter(s.view);
    run(s, 64);
    expect(s.offered.at(-1)).toBe(true);
    s.stage.eat?.press();
    run(s, 16);
    expect(s.label, "the busy sign has a label word").not.toBeNull();
    expect(s.said).toEqual([[PIECE, s.label]]);
    const chunks = shownChunks(s);
    expect(chunks.size).toBeGreaterThan(0);
    run(s, FLIGHT_MS + 32);
    expect(shownChunks(s).size).toBe(chunks.size - 1);
    s.stage.dispose();
  });

  it("holds a flight while the room is paused, and lands it after the rest of its flight on the resume", async () => {
    const s = await staged();
    s.stage.walk.enter(s.view);
    run(s, 64);
    s.stage.eat?.press();
    run(s, 16);
    const before = shownChunks(s).size;
    run(s, 200);
    s.state.paused = true;
    run(s, 2000);
    expect(shownChunks(s).size, "nothing lands while paused").toBe(before);
    expect(s.offered.at(-1), "no tile while paused").toBe(false);
    s.state.paused = false;
    run(s, FLIGHT_MS - 200 - 64);
    expect(shownChunks(s).size, "the rest of its flight, not at once").toBe(before);
    run(s, 128);
    expect(shownChunks(s).size).toBe(before - 1);
    s.stage.dispose();
  });

  it("holds a flight while the loader shows, as while paused (FR-009)", async () => {
    const s = await staged();
    s.stage.walk.enter(s.view);
    run(s, 64);
    s.stage.eat?.press();
    run(s, 16);
    const before = shownChunks(s).size;
    s.state.loading = true;
    run(s, 2000);
    expect(shownChunks(s).size, "nothing lands while the loader shows").toBe(before);
    s.state.loading = false;
    run(s, FLIGHT_MS + 32);
    expect(shownChunks(s).size).toBe(before - 1);
    s.stage.dispose();
  });

  // rework2-024 (rv-rework-024's I-A; page Q232): the browser draws no frames while the page is hidden, and its clock
  // runs on; so the room tells the stage of each change at once (eat.sync()), and the frame's poll is only a backstop.
  // `stopped` moves the clock with no frame drawn, as a hidden page does.
  const stopped = (s: Staged, ms: number): void => {
    expect(s.clock.pendingFrames, "the loop waits on a frame").toBeGreaterThan(0);
    s.clock.advance(ms, ms + 1);
  };
  it("doesn't count a hidden page's time: no landing and no regrowth at the first frame back (I-A, page Q232)", async () => {
    const s = await staged();
    s.stage.walk.enter(s.view);
    run(s, 64);
    s.stage.eat?.press();
    run(s, 16);
    const before = shownChunks(s).size;
    run(s, 200);
    // Hidden: the room's state() counts it as paused, and the motion listener tells the stage at once.
    s.state.paused = true;
    s.stage.eat?.sync();
    stopped(s, 60_000);
    s.state.paused = false;
    s.stage.eat?.sync();
    run(s, 16);
    expect(shownChunks(s).size, "the flight hasn't landed at the first frame back").toBe(before);
    run(s, FLIGHT_MS - 200 - 64);
    expect(shownChunks(s).size, "the rest of its flight, not at once").toBe(before);
    run(s, 128);
    expect(shownChunks(s).size, "landed").toBe(before - 1);
    // Hidden longer than the room's regrow_s (20 s): no regrowth is due at the first frame back.
    s.state.paused = true;
    s.stage.eat?.sync();
    stopped(s, 30_000);
    s.state.paused = false;
    s.stage.eat?.sync();
    run(s, 16);
    expect(shownChunks(s).size, "no regrowth came due while hidden").toBe(before - 1);
    s.stage.dispose();
  });

  it("holds the meal at once for every state the room counts, with frames stopped: the toggle, hidden, the loader", async () => {
    for (const held of ["paused", "loading"] as const) {
      const s = await staged();
      s.stage.walk.enter(s.view);
      run(s, 64);
      s.stage.eat?.press();
      run(s, 16);
      const before = shownChunks(s).size;
      s.state[held] = true;
      s.stage.eat?.sync();
      stopped(s, FLIGHT_MS * 4);
      s.state[held] = false;
      s.stage.eat?.sync();
      run(s, 16);
      expect(shownChunks(s).size, `${held}: no landing at the first frame back`).toBe(before);
      run(s, FLIGHT_MS);
      expect(shownChunks(s).size, `${held}: landed after the rest of its flight`).toBe(before - 1);
      s.stage.dispose();
    }
  });

  it("lands a flight at once when the visitor leaves walking by Escape (the spec's edge case; nit 1)", async () => {
    const s = await staged();
    s.stage.walk.enter(s.view);
    run(s, 64);
    s.stage.eat?.press();
    run(s, 16);
    const before = shownChunks(s).size;
    run(s, 100);
    s.view.dispatchEvent(
      new s.view.ownerDocument.defaultView!.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    run(s, 32);
    expect(s.stage.walk.walking, "Escape left the walk").toBe(false);
    expect(shownChunks(s).size, "landed at once, not after the rest of its flight").toBe(before - 1);
    s.stage.dispose();
  });

  it("lands a flight at once when the visitor leaves by the walking control, and not while paused (nit 1's siblings)", async () => {
    const s = await staged();
    s.stage.walk.enter(s.view);
    run(s, 64);
    s.stage.eat?.press();
    run(s, 16);
    const before = shownChunks(s).size;
    s.stage.walk.leave();
    expect(shownChunks(s).size, "landed at once").toBe(before - 1);
    s.stage.dispose();

    const p = await staged();
    p.stage.walk.enter(p.view);
    run(p, 64);
    p.stage.eat?.press();
    run(p, 16);
    const then = shownChunks(p).size;
    p.state.paused = true;
    run(p, 32);
    p.stage.walk.leave();
    run(p, 2000);
    expect(shownChunks(p).size, "nothing lands while paused, leaving or not").toBe(then);
    p.state.paused = false;
    run(p, 32);
    expect(shownChunks(p).size, "it lands at the resume, its flight cut short by the leave").toBe(then - 1);
    p.stage.dispose();
  });

  it("frees, at the stage's dispose, a split that left the scene when its piece was whole again (nit 3)", async () => {
    const s = await staged();
    s.stage.walk.enter(s.view);
    run(s, 64);
    s.stage.eat?.press();
    run(s, 16);
    const geometries = new Set<{ addEventListener(type: string, f: () => void): void }>();
    s.drawn()
      .getObjectByName(PIECE)
      ?.traverse((n) => {
        if (n.userData.eat !== undefined) geometries.add((n as Mesh).geometry);
      });
    expect(geometries.size).toBeGreaterThan(0);
    let freed = 0;
    for (const g of geometries) g.addEventListener("dispose", () => freed++);
    // Landed, regrown (the room's regrow_s), whole: the split leaves the scene.
    run(s, FLIGHT_MS + 32);
    s.clock.advance(25_000, 100);
    let left = true;
    s.drawn()
      .getObjectByName(PIECE)
      ?.traverse((n) => {
        if (n.userData.eat !== undefined) left = false;
      });
    expect(left, "the split left the scene").toBe(true);
    s.stage.dispose();
    expect(freed, "every geometry the eating built").toBe(geometries.size);
  });

  it("reserves the Eat box beside the walking control in the stacked layout (I-1, page Q215)", async () => {
    // The stacked layout: the room gives no frame and no clear area, and the canvas is its own stage.
    swapped.picked = [];
    const s = await staged();
    const last = swapped.picked.at(-1);
    expect(last, "the picker was sized").toBeDefined();
    expect({ w: last?.w, h: last?.h }).toEqual({ w: 960, h: 600 });
    expect(last?.reserved, "the walking control's box and the Eat box beside it").toEqual(
      reservedBoxes({ w: 960, h: 600 }, 16, { eat: true }),
    );
    s.stage.dispose();
  });

  it("reserves no stacked Eat box in a HUD layout mid-resize, whose frame was given for another window (N-3)", async () => {
    // A HUD layout's frame, computed for a window the canvas no longer is: the stage frames the whole canvas until the
    // room's next re-fit, and the tile sits at the HUD's Eat box, not in the canvas's corner, so the stage reserves as a
    // plain visit's does there (the picker's fallback), not the stacked layout's boxes.
    swapped.picked = [];
    const box = { x: 0, y: 64, w: 900, h: 600 };
    const s = await staged({
      frame: () => ({ window: { w: 1280, h: 800 }, area: box, ease: 1, hud: [], clear: box, rem: 16 }),
    });
    const last = swapped.picked.at(-1);
    expect(last, "the picker was sized").toBeDefined();
    expect({ w: last?.w, h: last?.h }, "the whole canvas, until the re-fit").toEqual({ w: 960, h: 600 });
    expect(last?.reserved, "the picker's fallback, as a plain visit's").toBeUndefined();
    s.stage.dispose();
  });
});
