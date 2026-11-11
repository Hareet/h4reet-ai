// T023 and T028's test (spec 016; FR-004, FR-044, FR-047; plan.md R-05; contracts/twin-data.md §4; SC-011): the real
// 3D stage (src/room/scene.ts) over the fixture set composed with the twin's folder and the visitors', drawn by a
// stand-in renderer on a jsdom window whose fetch is a spy the test answers, as avatar-scene.test.ts stages it.
// - In a 3D visit, the twin's files are requested once each, same-origin, with integrity: the twin's model and the
//   chosen avatar's first, then the clips, the twin's in the closed list's order; the stand-in's files never, unless
//   the twin's model failed or the visitor chose them.
// - Below the floor nothing is requested.
// - The stage's expected files list the twin's and the chosen avatar's, by their served bytes; a stand-in fetched after
//   the twin fails isn't among them (spec 012).
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
import { figureEntries, integrity, modelEntries, twinEntries } from "../../src/room/scene/loader";
import type { FigureSignal, SceneOptions } from "../../src/room/stage";
import { FakeClock, flush } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, SCENE, sceneWith } from "../helpers/room-avatars";
import { TWIN_DIR, TWIN_ROLES, twinFolder, twinPolicy } from "../helpers/room-twin";

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

const FILES: Record<string, Uint8Array | string> = {
  [SCENE]: sceneWith({ twin_stand_in: "man" }),
  ...avatarFolder("man"),
  ...avatarFolder("woman"),
  ...twinFolder(),
};
let night: ComposeResult | null = null;
const composed = (): ComposeResult =>
  (night ??= compose(overlay(FILES), twinPolicy(), { mode: "lenient", drafts: false }));

/** A figure file's plain bytes by its a/ URL. */
function bytesOf(url: string): Uint8Array {
  const stem = /^a\/(.+)\.[0-9a-f]{16}\.glb$/.exec(url)?.[1] ?? "";
  const path =
    stem === "twin"
      ? `${TWIN_DIR}/twin.glb`
      : stem.startsWith("twin-")
        ? `${TWIN_DIR}/${stem.slice(5)}.glb`
        : `assets/visitors/${stem.split("-")[0] ?? ""}/${stem}.glb`;
  const data = FILES[path];
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
  drawn(): Scene;
  handoff(): void;
}

function staged(avatar: AvatarId, options: Partial<SceneOptions> = {}): Staged {
  swapped.part = composed().scene;
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
    room: composed().index,
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
    drawn: () => {
      if (!last) throw new Error("no frame drawn");
      return last;
    },
    handoff: ended,
  };
}

/** Answers every figure file's fetch with its file, or the status `status` gives, running frames, until `until`. */
async function answer(s: Staged, until: () => boolean, status?: (url: string) => number | undefined): Promise<void> {
  const answered = new Set<Fetched>();
  for (let i = 0; i < 80 && !until(); i += 1) {
    for (const f of s.fetched) {
      if (answered.has(f) || !/^a\/(twin|woman|man)[-.]/.test(f.url)) continue;
      answered.add(f);
      const code = status?.(f.url);
      f.answer(code === undefined ? { body: bytesOf(f.url) } : { status: code });
    }
    await flush();
    s.clock.advance(32);
  }
}

const avatarIn = (s: Staged, figure: string): boolean => {
  let scene: Scene;
  try {
    scene = s.drawn();
  } catch {
    return false;
  }
  let found = false;
  scene.getObjectByName(figure)?.traverse((n: Object3D) => {
    if (n.name === AVATAR_NODE) found = true;
  });
  return found;
};
const showsOwn = (s: Staged): boolean =>
  s.signals.some((x) => x.kind === "picture" && x.figure === "twin" && x.shows === "own");

describe("the twin's files in a 3D visit (FR-044; SC-011)", () => {
  it("gives the twin's model and the chosen avatar's first, then the clips, the twin's in the closed list's order", () => {
    const part = composed().scene;
    const entries = figureEntries(part, "woman");
    expect(entries.map((e) => e.asset)).toEqual([
      "twin",
      "woman",
      ...TWIN_ROLES.map((r) => `twin-${r}`),
      "woman-idle",
      "woman-idle-holding",
      "woman-take",
    ]);
    expect(twinEntries(part).map((e) => e.asset)).toEqual(["twin", ...TWIN_ROLES.map((r) => `twin-${r}`)]);
  });

  it("requests each of the twin's files once, same-origin, with its integrity, and none of the stand-in's", async () => {
    const s = staged("woman");
    s.handoff();
    await answer(s, () => showsOwn(s) && avatarIn(s, "fx-visitor"));
    const part = composed().scene;
    const twin = part.twin;
    if (!twin) throw new Error("no twin");
    const files = [twin.model, ...Object.values(twin.clips)].flatMap((f) => (f ? [f] : []));
    const urls = s.fetched.map((f) => f.url);
    for (const f of files) expect(urls.filter((u) => u === f.url)).toHaveLength(1);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((u) => u.startsWith("a/man"))).toEqual([]);
    for (const f of s.fetched) {
      const file = files.find((e) => e.url === f.url);
      if (!file) continue;
      expect(f.init).toMatchObject({ mode: "same-origin", redirect: "error", integrity: integrity(file.sha256) });
    }
    // The models first: the twin's and the woman's, before any clip.
    expect(urls.slice(0, 2).sort()).toEqual([twin.model.url, part.avatars.woman?.model.url].sort());
    expect(avatarIn(s, "fx-twin")).toBe(true);
    s.stage.dispose();
  });

  it("requests the stand-in's files only once the twin's model has failed, and shows the stand-in then", async () => {
    const s = staged("woman");
    s.handoff();
    const twinModel = composed().scene.twin?.model.url ?? "";
    await answer(
      s,
      () => s.signals.some((x) => x.kind === "picture" && x.figure === "twin" && x.shows === "avatar"),
      (url) => (url === twinModel ? 404 : undefined),
    );
    const urls = s.fetched.map((f) => f.url);
    expect(urls.filter((u) => u === twinModel)).toHaveLength(2);
    expect(urls.filter((u) => u.startsWith("a/man")).length).toBe(4);
    expect(s.signals.filter((x) => x.kind === "failed")).toHaveLength(1);
    expect(avatarIn(s, "fx-twin")).toBe(true);
    s.stage.dispose();
  });

  it("fetches the man's files once when the visitor chooses him, and none for the twin's figure", async () => {
    const s = staged("man");
    s.handoff();
    await answer(s, () => showsOwn(s) && avatarIn(s, "fx-visitor"));
    expect(s.fetched.filter((f) => f.url.startsWith("a/man"))).toHaveLength(4);
    s.stage.dispose();
  });

  it("fetches nothing below the floor", async () => {
    const s = staged("woman", { floor: false });
    s.handoff();
    await answer(s, () => false);
    expect(s.fetched).toEqual([]);
    expect(s.signals).toContainEqual({ kind: "picture", figure: "twin", shows: "fallback", why: "floor" });
    s.stage.dispose();
  });
});

describe("the stage's expected files with the twin (spec 012; FR-047; contracts/twin-data.md §4)", () => {
  it("lists the twin's files and the chosen avatar's by their served bytes, and no stand-in's", async () => {
    const s = staged("woman");
    const part = composed().scene;
    const want = [...figureEntries(part, "woman"), ...modelEntries(part)].map((e) => ({
      asset: e.asset,
      bytes: e.bytes,
    }));
    const got = await s.stage.expected;
    expect(got).toEqual(want);
    expect(got?.some((f) => f.asset.startsWith("man"))).toBe(false);
    expect(got?.find((f) => f.asset === "twin")?.bytes).toBe(part.twin?.model.bytes);
    s.stage.dispose();
  });
});
