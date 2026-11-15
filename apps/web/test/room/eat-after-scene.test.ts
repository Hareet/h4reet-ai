// T-B06 (spec 028; FR-025, FR-032; plan.md R-B6): the eating after the dinosaur's scene, in the real 3D stage, staged
// as spec 024's eat-scene.test.ts stages it (its harness copied, the part's `figures.leave` kept or dropped): the
// repository's 3D part with the dinosaur's fixture files bundled, so the visitor's figure shows the dinosaur's model.
// The twin's files are never answered, so its figure can't walk and the scene is cut at its call's end (FR-026).
// - With `figures.leave`: no "Eat" tile and B does nothing before the director's `gone` or `cut`; offered after, and B
//   bites; the Eat box reserved from the visit's start (spec 024's FR-012, Q150), so the framing doesn't move.
// - Without it: offered at once, as spec 024 has it.
import { createHash } from "node:crypto";

import { JSDOM } from "jsdom";
import type { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
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
  /** The placement the stood-in reach names: PIECE, set below once the bundle is read. */
  reach: "",
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
  return { ...own, edibleReach: () => swapped.reach };
});

afterEach(() => {
  swapped.part = null;
  swapped.renderer = null;
});

// Spec 004's FR-007: no room ID stands in a test, so the busy sign is found in the repository's bundle by its label's
// words.
const PIECE = ((): string => {
  const { scene, index } = repositoryBundle();
  const found = scene.placements.filter((p) => p.label !== null && index.ui[p.label] === "Desk sign, busy");
  if (found.length !== 1 || !found[0]) throw new Error(`${found.length} placements labelled as the busy sign`);
  return found[0].id;
})();
swapped.reach = PIECE;

/** The repository's 3D part with the dinosaur's files bundled, and their bytes by URL. */
function dinosaurPart(keepLeave: boolean): {
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
  const figures = { ...repo.scene.figures };
  if (!keepLeave) delete figures.leave;
  const part = { ...repo.scene, figures, avatars: { ...repo.scene.avatars, dinosaur } } as RoomScene;
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

async function staged(keepLeave: boolean, options: Partial<SceneOptions> = {}): Promise<Staged> {
  const { part, index, files } = dinosaurPart(keepLeave);
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

const run = (s: Staged, ms: number): void => s.clock.advance(ms, 16);

describe("the eating after the dinosaur's scene (FR-025)", () => {
  it("offers no tile and bites nothing before the scene ends or is cut, the Eat box reserved from the start", async () => {
    const s = await staged(true);
    expect(s.stage.protect?.eat).toBe(true);
    s.stage.walk.enter(s.view);
    run(s, 64);
    expect(s.offered.includes(true)).toBe(false);
    s.stage.eat?.press();
    run(s, 16);
    expect(s.said).toEqual([]);
    run(s, 1000);
    expect(s.offered.includes(true)).toBe(false);
    s.stage.dispose();
  });

  it("offers the tile once the scene is cut at its call's end, and bites on a press", async () => {
    const s = await staged(true);
    s.stage.walk.enter(s.view);
    // The call's three seconds (spec 016's least speaking time), then the cut: the twin can't walk.
    run(s, 3500);
    expect(s.offered.at(-1)).toBe(true);
    s.stage.eat?.press();
    run(s, 16);
    expect(s.said).toEqual([[PIECE, s.label]]);
    s.stage.dispose();
  });

  it("offers the tile at once where the scene has no figures.leave", async () => {
    const s = await staged(false);
    expect(s.stage.protect?.eat).toBe(true);
    s.stage.walk.enter(s.view);
    run(s, 64);
    expect(s.offered.at(-1)).toBe(true);
    s.stage.dispose();
  });
});
