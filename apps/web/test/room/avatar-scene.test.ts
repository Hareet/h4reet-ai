// T013's network half and T021 (spec 009; FR-004, FR-006, FR-008, FR-010, FR-011, FR-021, FR-032; plan.md R-03, R-04;
// SC-004): the real 3D stage (src/room/scene.ts) over the fixture set composed with the woman's and the man's folders,
// drawn by a stand-in renderer on a jsdom window whose fetch is a spy the test answers, as scene.test.ts stages the
// room's models.
// - The requests: the chosen avatar's files and the stand-in's, each once, from the site's own origin, each with its
//   integrity; none below the floor; the stand-in's alone for an avatar with no files.
// - The figures: each avatar in its figure once the hand-off has ended; a failed file reported once as `failed`; and a
//   restored context putting the fallbacks back and loading the files again.
import { JSDOM } from "jsdom";
import { Object3D } from "three";
import type { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { AvatarId } from "../../src/choice/avatars";
import type { RoomScene } from "../../src/room/compose/bundle";
import { readImage } from "../../src/room/glb/images";
import { createScene } from "../../src/room/scene";
import { AVATAR_NODE } from "../../src/room/scene/avatars";
import { integrity } from "../../src/room/scene/loader";
import type { FigureSignal, SceneOptions } from "../../src/room/stage";
import { FakeClock, flush } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { overlay } from "../helpers/room-fixtures";
import { avatarPolicy, nightFiles } from "../helpers/room-avatars";

const swapped = vi.hoisted(() => ({
  part: null as RoomScene | null,
  renderer: null as ((parameters: unknown) => unknown) | null,
}));

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

afterEach(() => {
  swapped.part = null;
  swapped.renderer = null;
});

const FILES = nightFiles();
let night: ComposeResult | null = null;
const composed = (): ComposeResult =>
  (night ??= compose(overlay(FILES), avatarPolicy(), { mode: "lenient", drafts: false }));

/** A figure file's plain bytes by its a/ URL. */
function bytesOf(url: string): Uint8Array {
  const stem = /^a\/(.+)\.[0-9a-f]{16}\.glb$/.exec(url)?.[1] ?? "";
  const data = FILES[`assets/visitors/${stem.split("-")[0] ?? ""}/${stem}.glb`];
  if (!(data instanceof Uint8Array)) throw new Error(`no file for ${url}`);
  return data;
}

interface Fetched {
  readonly url: string;
  readonly init: RequestInit;
  answer(response: { status?: number; body?: Uint8Array }): void;
}

interface Staged {
  readonly stage: ReturnType<typeof createScene>;
  readonly fetched: Fetched[];
  readonly signals: FigureSignal[];
  readonly clock: FakeClock;
  readonly canvas: HTMLCanvasElement;
  drawn(): Scene;
  handoff(): void;
}

/** The fixture room with the night's avatars, on a stage whose renderer is a stand-in and whose fetch the test answers. */
function staged(avatar: AvatarId, options: Partial<SceneOptions> = {}): Staged {
  const result = composed();
  swapped.part = result.scene;
  let last: Scene | null = null;
  const renderer = {
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene) => {
      last = scene;
    },
    dispose: () => undefined,
  };
  swapped.renderer = () => renderer;
  const win = new JSDOM("<main></main>", { url: "http://127.0.0.1:18105/", pretendToBeVisual: true })
    .window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  Object.defineProperty(win, "createImageBitmap", {
    configurable: true,
    value: async (source: Blob, o: ImageBitmapOptions = {}) => {
      const size = readImage(new Uint8Array(await source.arrayBuffer())).header;
      if (!size) throw new Error("undecodable");
      return { width: o.resizeWidth ?? size.width, height: o.resizeHeight ?? size.height, close: () => undefined };
    },
  });
  const fetched: Fetched[] = [];
  Object.defineProperty(win, "fetch", {
    configurable: true,
    value: (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        fetched.push({
          url,
          init,
          answer: (r) =>
            resolve({
              status: r.status ?? 200,
              arrayBuffer: () => Promise.resolve((r.body ?? new Uint8Array()).slice().buffer),
            } as Response),
        });
      }),
  });
  const clock = new FakeClock();
  const signals: FigureSignal[] = [];
  let ended: () => void = () => undefined;
  const handoff = new Promise<void>((resolve) => (ended = resolve));
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: result.index,
    avatar,
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
    floor: true,
    handoff,
    onFigure: (s) => signals.push(s),
    ...options,
  });
  return {
    stage,
    fetched,
    signals,
    clock,
    canvas: stage.canvas,
    drawn: () => {
      if (!last) throw new Error("no frame drawn");
      return last;
    },
    handoff: ended,
  };
}

/** Answers every figure file's fetch with its file, running frames, until `until` holds. */
async function answer(s: Staged, until: () => boolean, status?: (url: string) => number | undefined): Promise<void> {
  const answered = new Set<Fetched>();
  for (let i = 0; i < 80 && !until(); i += 1) {
    for (const f of s.fetched) {
      if (answered.has(f) || !/^a\/(woman|man)[-.]/.test(f.url)) continue;
      answered.add(f);
      const code = status?.(f.url);
      f.answer(code === undefined ? { body: bytesOf(f.url) } : { status: code });
    }
    await flush();
    s.clock.advance(32);
  }
}

/** Whether the last frame drew an avatar in a figure's placement; false before the first frame. */
const avatarIn = (s: Staged, figure: string): boolean => {
  let scene: Scene;
  try {
    scene = s.drawn();
  } catch {
    return false;
  }
  const placement = scene.getObjectByName(figure);
  let found = false;
  placement?.traverse((n: Object3D) => {
    if (n.name === AVATAR_NODE) found = true;
  });
  return found;
};

describe("the figures in the 3D stage (scene.ts with scene/avatars.ts)", () => {
  it("requests the chosen avatar's files and the stand-in's, each once, same-origin, each with its integrity", async () => {
    const s = staged("woman");
    s.handoff();
    await answer(s, () => s.signals.filter((x) => x.kind === "picture" && x.shows === "avatar").length === 2);
    const part = composed().scene;
    const expected = (["man", "woman"] as const).flatMap((id) => {
      const own = part.avatars[id];
      return own ? [own.model, ...Object.values(own.clips)].flatMap((f) => (f ? [f] : [])) : [];
    });
    const urls = s.fetched.map((f) => f.url);
    expect([...urls].sort()).toEqual(expected.map((f) => f.url).sort());
    expect(new Set(urls).size).toBe(urls.length);
    for (const f of s.fetched) {
      expect(f.url.startsWith("a/")).toBe(true);
      const file = expected.find((e) => e.url === f.url);
      expect(f.init).toMatchObject({
        mode: "same-origin",
        redirect: "error",
        integrity: integrity(file?.sha256 ?? ""),
      });
    }
    expect(avatarIn(s, "fx-visitor") && avatarIn(s, "fx-twin")).toBe(true);
    s.stage.dispose();
  });

  it("fetches the man's files once when the visitor chooses the stand-in, and only the stand-in's for the dog", async () => {
    for (const [avatar, count] of [
      ["man", 4],
      ["dog", 4],
    ] as const) {
      const s = staged(avatar);
      s.handoff();
      await answer(s, () => s.signals.some((x) => x.kind === "picture" && x.figure === "twin" && x.shows === "avatar"));
      expect(s.fetched.map((f) => f.url).filter((u) => u.includes("/man") || u.startsWith("a/man"))).toHaveLength(
        count,
      );
      expect(s.fetched.every((f) => f.url.startsWith("a/man"))).toBe(true);
      s.stage.dispose();
    }
  });

  it("swaps the avatars in only after the hand-off ends", async () => {
    const s = staged("woman");
    await answer(s, () => s.fetched.length >= 8 && false);
    expect(s.fetched).toHaveLength(8);
    expect(avatarIn(s, "fx-visitor")).toBe(false);
    s.handoff();
    await answer(s, () => avatarIn(s, "fx-visitor") && avatarIn(s, "fx-twin"));
    expect(avatarIn(s, "fx-visitor")).toBe(true);
    s.stage.dispose();
  });

  it("fetches no avatar file below the floor, and says why each figure keeps its fallback", async () => {
    const s = staged("woman", { floor: false });
    s.handoff();
    await answer(s, () => false);
    expect(s.fetched).toEqual([]);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "visitor", shows: "fallback", why: "floor" });
    expect(s.signals).toContainEqual({ kind: "picture", figure: "twin", shows: "fallback", why: "floor" });
    expect(s.signals.some((x) => x.kind === "failed")).toBe(false);
    s.stage.dispose();
  });

  it("reports each file that failed after its retry as failed, and keeps the figure's fallback", async () => {
    const s = staged("woman");
    s.handoff();
    await answer(
      s,
      () => s.signals.some((x) => x.kind === "picture" && x.figure === "visitor" && x.shows === "fallback"),
      (url) => (url.startsWith("a/woman.") ? 404 : undefined),
    );
    expect(s.signals.filter((x) => x.kind === "failed")).toHaveLength(1);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "visitor", shows: "fallback", why: "failed" });
    expect(avatarIn(s, "fx-visitor")).toBe(false);
    s.stage.dispose();
  });

  it("puts the fallbacks back on a restored context and loads the files again, from the HTTP cache", async () => {
    const s = staged("man");
    s.handoff();
    await answer(s, () => avatarIn(s, "fx-twin"));
    const before = s.fetched.length;
    s.canvas.dispatchEvent(new s.canvas.ownerDocument.defaultView!.Event("webglcontextrestored"));
    await flush();
    expect(avatarIn(s, "fx-twin")).toBe(false);
    await answer(s, () => avatarIn(s, "fx-twin"));
    expect(s.fetched.length).toBe(2 * before);
    expect(avatarIn(s, "fx-twin")).toBe(true);
    s.stage.dispose();
  });
});
