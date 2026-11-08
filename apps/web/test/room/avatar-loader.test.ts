// T012 (spec 009; FR-002, FR-004 to FR-006, FR-015, FR-021, FR-022, FR-024, FR-031; plan.md R-03, R-11): the room's
// loader with the figures' entries, on FakeClock, with stand-ins for the page's fetch, createImageBitmap, the renderer's
// uploads, and the quality controller's hold, as test/room/loader.test.ts has them, over the GLBs test/helpers/glb.ts
// makes. Kept in a file of its own, since spec 008 also extends loader.test.ts (plan.md §10).
// - The entries: the stand-in's and the chosen avatar's files, each once, models first, then clips, each with its a/
//   URL, its plain file's SHA-256, its stem as its asset, and its copy's length.
// - The fetch: same-origin, with integrity, no redirect, a 10-second timeout, one retry, then failed; the models at once,
//   each avatar's clips only once its model's fetch has ended; the room's models only once every figure file's fetch
//   has; nothing below the floor; stop() skipping what hadn't ended; a second loadFigures fetching again (a restore).
// - Parse and hand over: after the hand-off; a model through the ledger, decoded at most texture_px a side and half that
//   at quality 1, and refused as a failed parse where the figures can't place it; a clip's animations, with no ledger
//   and no swap; each outcome one asset event, keyed by the file's stem.
import { Object3D } from "three";
import type { AnimationClip, Texture } from "three";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { AssetEvent } from "../../src/asset-events";
import type { Mode } from "../../src/choice/visit";
import { readImage } from "../../src/room/glb/images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { createTextureLedger, textureBytes } from "../../src/room/scene/ledger";
import { FETCH_TIMEOUT_MS, createLoader, figureEntries, integrity } from "../../src/room/scene/loader";
import type { FetchLike, FigureEntry, LoaderOptions, ModelEntry } from "../../src/room/scene/loader";
import { avatarClips, avatarGlb, pngHeader } from "../helpers/glb";
import { FakeClock, flush } from "../helpers/room";
import { overlay } from "../helpers/room-fixtures";
import { avatarPolicy, nightFiles } from "../helpers/room-avatars";

class FakeBitmap {
  constructor(
    public width: number,
    public height: number,
  ) {}
  close(): void {
    this.width = 0;
    this.height = 0;
  }
}

/** createImageBitmap's stand-in, sizing each bitmap from its image's header or the resize asked for. */
function decoder(): { decode: Decode; options: ImageBitmapOptions[] } {
  const options: ImageBitmapOptions[] = [];
  const decode: Decode = async (source, o) => {
    options.push(o);
    let size: { width: number; height: number };
    if (source instanceof Blob) {
      const header = readImage(new Uint8Array(await source.arrayBuffer())).header;
      if (!header) throw new Error("no header");
      size = header;
    } else size = source as unknown as FakeBitmap;
    return new FakeBitmap(o.resizeWidth ?? size.width, o.resizeHeight ?? size.height) as unknown as ImageBitmap;
  };
  return { decode, options };
}

interface Call {
  readonly url: string;
  readonly init: RequestInit;
  readonly at: number;
  answer(r: { status?: number; body?: Uint8Array } | "hang" | Error): void;
}

function fetcher(clock: FakeClock): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init) =>
    new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      calls.push({
        url,
        init,
        at: clock.now(),
        answer(r) {
          if (r === "hang") return;
          if (r instanceof Error) {
            reject(r);
            return;
          }
          const body = (r.body ?? new Uint8Array()).slice();
          resolve({ status: r.status ?? 200, arrayBuffer: () => Promise.resolve(body.buffer) } as Response);
        },
      });
    });
  return { fetch, calls };
}

/** The night's set composed: the man stands in, the woman and the man have their three clips. */
const night = compose(
  overlay(nightFiles({ woman: { modelOptions: { images: [pngHeader(2048, 1024)] } } })),
  avatarPolicy(),
  {
    mode: "lenient",
    drafts: false,
  },
);
const FILES = nightFiles({ woman: { modelOptions: { images: [pngHeader(2048, 1024)] } } });
/** A figure file's bytes by its URL in the 3D part. */
function bytesOf(url: string): Uint8Array {
  const stem = /^a\/(.+)\.[0-9a-f]{16}\.glb$/.exec(url)?.[1] ?? "";
  const id = stem.split("-")[0] ?? "";
  const data = FILES[`assets/visitors/${id}/${stem}.glb`];
  if (!(data instanceof Uint8Array)) throw new Error(`no file for ${url}`);
  return data;
}

interface Harness {
  readonly clock: FakeClock;
  readonly fetch: ReturnType<typeof fetcher>;
  readonly decoder: ReturnType<typeof decoder>;
  readonly events: AssetEvent[];
  readonly models: { avatar: string; model: Object3D }[];
  readonly clips: { avatar: string; role: string | null; clips: readonly AnimationClip[] }[];
  readonly ended: string[];
  readonly uploads: Texture[];
  readonly swaps: string[];
  readonly loader: ReturnType<typeof createLoader>;
  handoff(): void;
  figures(): void;
  level: number;
  /** What the figures' model hand-over answers: false refuses the model, as a degenerate height does. */
  takes: boolean;
}

function harness(o: { floor?: boolean; handoff?: "pending"; limit?: number; figures?: "pending" } = {}): Harness {
  const clock = new FakeClock();
  const f = fetcher(clock);
  const d = decoder();
  let handoff = (): void => undefined;
  let figures = (): void => undefined;
  const h = {
    clock,
    fetch: f,
    decoder: d,
    events: [] as AssetEvent[],
    models: [] as Harness["models"],
    clips: [] as Harness["clips"],
    ended: [] as string[],
    uploads: [] as Texture[],
    swaps: [] as string[],
    handoff: () => handoff(),
    figures: () => figures(),
    level: 0,
    takes: true,
    loader: null as unknown as ReturnType<typeof createLoader>,
  };
  const options: LoaderOptions = {
    clock,
    fetch: f.fetch,
    decode: d.decode,
    floor: () => o.floor ?? true,
    figures: o.figures === "pending" ? new Promise<void>((r) => (figures = r)) : Promise.resolve(),
    handoff: o.handoff === "pending" ? new Promise<void>((r) => (handoff = r)) : Promise.resolve(),
    hold: () => () => undefined,
    level: () => h.level,
    mode: (): Mode => "3d",
    record: (event) => h.events.push(event),
    ledger: createTextureLedger(o.limit),
    uploader: { initTexture: (t) => h.uploads.push(t) },
    prepare: () => undefined,
    swap: (piece) => h.swaps.push(piece),
    maxSide: night.scene.figures.texture_px,
    avatar: (entry, model) => {
      h.models.push({ avatar: entry.figure.avatar, model });
      return h.takes;
    },
    clip: (entry, clips) => h.clips.push({ avatar: entry.figure.avatar, role: entry.figure.role, clips }),
    figureEnded: (entry, outcome) => h.ended.push(`${entry.asset} ${outcome}`),
  };
  h.loader = createLoader(options);
  return h as Harness;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await flush();
}

/** Answers the figure files' fetches and runs frames, which the loader's holds settle on, until `done` settles. */
async function drive(h: Harness, done: Promise<void>, answered: Set<Call> | null = new Set<Call>()): Promise<void> {
  let finished = false;
  void done.then(() => (finished = true));
  for (let i = 0; i < 60 && !finished; i += 1) {
    if (answered) answerAll(h, answered);
    await settle();
    h.clock.advance(32);
  }
  await done;
}

/** Answers every unanswered fetch with its file. */
function answerAll(h: Harness, answered: Set<Call>): void {
  for (const call of h.fetch.calls) {
    // The figure files alone: a room model's fetch stays the case's own to answer.
    if (answered.has(call) || !/^a\/(woman|man)[-.]/.test(call.url)) continue;
    answered.add(call);
    call.answer({ body: bytesOf(call.url) });
  }
}

describe("the figures' entries (FR-010, FR-015, FR-021)", () => {
  it("gives the stand-in's and the chosen avatar's files, each once, models first, then clips", () => {
    const entries = figureEntries(night.scene, "woman");
    expect(entries.map((e) => e.asset)).toEqual([
      "man",
      "woman",
      "man-idle",
      "man-idle-holding",
      "man-take",
      "woman-idle",
      "woman-idle-holding",
      "woman-take",
    ]);
    for (const e of entries) {
      const own = night.scene.avatars[e.figure.avatar];
      const file = e.figure.role === null ? own?.model : own?.clips[e.figure.role];
      expect(e.source).toEqual({ kind: "url", url: file?.url, sha256: file?.sha256 });
      expect(e.bytes).toBe(file?.bytes);
    }
    // The visitor who chooses the stand-in: its files once, for both figures.
    expect(figureEntries(night.scene, "man").map((e) => e.asset)).toEqual([
      "man",
      "man-idle",
      "man-idle-holding",
      "man-take",
    ]);
    // An avatar with no files: the stand-in's alone.
    expect(figureEntries(night.scene, "dog").map((e) => e.asset)).toEqual([
      "man",
      "man-idle",
      "man-idle-holding",
      "man-take",
    ]);
    // `../` from the lookdev page.
    expect(figureEntries(night.scene, "dog", "../")[0]?.source).toMatchObject({
      url: `../${night.scene.avatars.man?.model.url}`,
    });
  });
});

describe("the figures' fetches (FR-021, FR-022; R-03)", () => {
  it("fetches the two models at once, same-origin, with integrity and no redirect, and each avatar's clips after its model", async () => {
    const h = harness();
    let fetched = false;
    const done = h.loader.loadFigures(figureEntries(night.scene, "woman"), () => (fetched = true));
    await settle();
    expect(h.fetch.calls.map((c) => c.url)).toEqual([
      night.scene.avatars.man?.model.url,
      night.scene.avatars.woman?.model.url,
    ]);
    for (const call of h.fetch.calls) {
      expect(call.init).toMatchObject({ redirect: "error", mode: "same-origin", credentials: "same-origin" });
    }
    expect(h.fetch.calls[0]?.init.integrity).toBe(integrity(night.scene.avatars.man?.model.sha256 ?? ""));
    const answered = new Set<Call>();
    h.fetch.calls[0]?.answer({ body: bytesOf(h.fetch.calls[0].url) });
    answered.add(h.fetch.calls[0] as Call);
    await settle();
    // The man's clips follow his model's fetch; the woman's wait for hers.
    expect(h.fetch.calls.slice(2).map((c) => c.url)).toEqual(
      ["idle", "idle-holding", "take"].map((r) => night.scene.avatars.man?.clips[r as "idle"]?.url),
    );
    expect(fetched).toBe(false);
    for (let i = 0; i < 6 && !fetched; i += 1) {
      answerAll(h, answered);
      await settle();
    }
    expect(fetched).toBe(true);
    await drive(h, done, answered);
    expect(h.models.map((m) => m.avatar)).toEqual(["man", "woman"]);
    expect(h.clips.map((c) => `${c.avatar} ${c.role}`).sort()).toEqual(
      ["man idle", "man idle-holding", "man take", "woman idle", "woman idle-holding", "woman take"].sort(),
    );
    expect(h.clips.every((c) => c.clips.length === 1)).toBe(true);
    expect(h.events.map((e) => `${e.asset} ${e.outcome}`).sort()).toEqual(
      figureEntries(night.scene, "woman")
        .map((e) => `${e.asset} loaded`)
        .sort(),
    );
    const man = h.events.find((e) => e.asset === "man");
    expect(man?.bytes).toBe(night.scene.avatars.man?.model.bytes);
    // A clip takes no ledger, and nothing swaps a room piece.
    expect(h.swaps).toEqual([]);
  });

  it("starts the room's models only once every figure file's fetch has ended, fetched or failed", async () => {
    const h = harness({ figures: "pending" });
    const answered = new Set<Call>();
    const figuresDone = h.loader.loadFigures(figureEntries(night.scene, "man"), () => h.figures());
    const room: ModelEntry = {
      piece: "fx-desk",
      asset: "fx-desk",
      bytes: 10,
      source: {
        kind: "url",
        url: "a/fx-desk.0123456789abcdef.glb",
        sha256: night.scene.avatars.man?.model.sha256 ?? "",
      },
    };
    const roomDone = h.loader.load([room]);
    await settle();
    expect(h.fetch.calls.some((c) => c.url.includes("fx-desk"))).toBe(false);
    h.fetch.calls[0]?.answer(new Error("blocked"));
    answered.add(h.fetch.calls[0] as Call);
    await settle();
    // The model's retry; its clips wait for its fetch to end.
    expect(h.fetch.calls.map((c) => c.url).filter((u) => u.includes("fx-desk"))).toEqual([]);
    await drive(h, figuresDone, answered);
    expect(h.fetch.calls.some((c) => c.url.includes("fx-desk"))).toBe(true);
    h.loader.stop();
    await roomDone;
  });

  it("times out after 10 s with the body, retries once, then fails: the model's clips skipped, the figure on its fallback", async () => {
    const h = harness();
    let fetched = false;
    const done = h.loader.loadFigures(figureEntries(night.scene, "man"), () => (fetched = true));
    await settle();
    expect(h.fetch.calls).toHaveLength(1);
    h.clock.advance(FETCH_TIMEOUT_MS);
    await settle();
    expect(h.fetch.calls).toHaveLength(2);
    expect(h.fetch.calls[1]?.at).toBe(FETCH_TIMEOUT_MS);
    h.fetch.calls[1]?.answer({ status: 404 });
    await done;
    expect(fetched).toBe(true);
    expect(h.events.map((e) => `${e.asset} ${e.outcome}`)).toEqual([
      "man retried",
      "man failed",
      "man-idle skipped",
      "man-idle-holding skipped",
      "man-take skipped",
    ]);
    expect(h.ended).toEqual(["man failed", "man-idle skipped", "man-idle-holding skipped", "man-take skipped"]);
    expect(h.models).toEqual([]);
  });

  it("fetches nothing below the floor, each file skipped, and lets the room's models start at once", async () => {
    const h = harness({ floor: false });
    let fetched = false;
    await h.loader.loadFigures(figureEntries(night.scene, "woman"), () => (fetched = true));
    expect(fetched).toBe(true);
    expect(h.fetch.calls).toEqual([]);
    expect(h.events.every((e) => e.outcome === "skipped")).toBe(true);
    expect(h.ended).toHaveLength(8);
  });

  it("skips each figure load that hadn't ended when the room goes to 2D, once", async () => {
    const h = harness();
    const done = h.loader.loadFigures(figureEntries(night.scene, "man"));
    await settle();
    h.loader.stop();
    await done;
    expect(h.events.map((e) => `${e.asset} ${e.outcome}`)).toEqual([
      "man skipped",
      "man-idle skipped",
      "man-idle-holding skipped",
      "man-take skipped",
    ]);
    expect(h.fetch.calls[0]?.init.signal?.aborted).toBe(true);
  });

  it("fetches the files again on a second loadFigures, as a restored context's reload does", async () => {
    const h = harness();
    const answered = new Set<Call>();
    const first = h.loader.loadFigures(figureEntries(night.scene, "man"));
    await drive(h, first, answered);
    const before = h.fetch.calls.length;
    const second = h.loader.loadFigures(figureEntries(night.scene, "man"));
    await drive(h, second, answered);
    expect(h.fetch.calls.length).toBe(2 * before);
    expect(h.models).toHaveLength(2);
  });
});

describe("parse and hand over (FR-022, FR-024; R-03, R-11)", () => {
  it("parses only after the hand-off, though its fetches run during it", async () => {
    const h = harness({ handoff: "pending" });
    const answered = new Set<Call>();
    const done = h.loader.loadFigures(figureEntries(night.scene, "man"));
    for (let i = 0; i < 6; i += 1) {
      answerAll(h, answered);
      await settle();
    }
    expect(h.fetch.calls).toHaveLength(4);
    expect(h.models).toEqual([]);
    h.handoff();
    await drive(h, done, answered);
    expect(h.models).toHaveLength(1);
  });

  it("decodes an avatar's images at most texture_px a side, keeping their aspect, and half that at quality 1", async () => {
    for (const [level, size] of [
      [0, [1024, 512]],
      [1, [512, 256]],
    ] as const) {
      const h = harness();
      h.level = level;
      const answered = new Set<Call>();
      const done = h.loader.loadFigures(figureEntries(night.scene, "woman").filter((e) => e.figure.avatar === "woman"));
      await drive(h, done, answered);
      const resized = h.decoder.options.filter((o) => o.resizeWidth !== undefined);
      expect(resized.map((o) => [o.resizeWidth, o.resizeHeight])).toEqual([size]);
      expect(h.uploads).toHaveLength(1);
      expect(h.events.find((e) => e.asset === "woman")?.outcome).toBe("loaded");
    }
  });

  it("skips an avatar whose textures would take the ledger over its limit, its figure on its fallback", async () => {
    const h = harness({ limit: textureBytes(1024, 512) - 1 });
    const answered = new Set<Call>();
    const done = h.loader.loadFigures(figureEntries(night.scene, "woman").filter((e) => e.figure.avatar === "woman"));
    await drive(h, done, answered);
    expect(h.models).toEqual([]);
    expect(h.ended).toContain("woman skipped");
    expect(h.uploads).toEqual([]);
  });

  it("refuses a model the figures can't place as a failed parse: one retry, then failed", async () => {
    const h = harness();
    h.takes = false;
    const answered = new Set<Call>();
    const done = h.loader.loadFigures(figureEntries(night.scene, "man").filter((e) => e.figure.role === null));
    await drive(h, done, answered);
    expect(h.events.map((e) => `${e.asset} ${e.outcome}`)).toEqual(["man retried", "man failed"]);
    expect(h.ended).toEqual(["man failed"]);
  });

  it("hands a clip's animations over by role, its own scene released", async () => {
    const h = harness();
    const answered = new Set<Call>();
    const done = h.loader.loadFigures(figureEntries(night.scene, "man"));
    await drive(h, done, answered);
    const take = h.clips.find((c) => c.role === "take");
    expect(take?.clips[0]?.name).toBe("take");
    expect(take?.clips[0]?.tracks.map((t) => t.name)).toEqual(["mixamorigRightArm.quaternion"]);
    expect(avatarClips().take.bytes.length).toBeGreaterThan(0);
    expect(avatarGlb().bytes.length).toBeGreaterThan(0);
  });
});

// FigureEntry is ModelEntry's: its piece the figure file's own key, so loads of one file supersede each other.
const _entry: FigureEntry | undefined = figureEntries(night.scene, "man")[0];
void _entry;
