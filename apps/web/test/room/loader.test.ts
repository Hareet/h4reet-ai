// T126's loader half and T134 (spec 004; FR-055 to FR-057, FR-071; Amendments C9, C10, C11; research.md R-28, R-29,
// R-60; data-model.md §11.4, §11.5; contracts/room-live-state-telemetry.md §3): src/room/scene/loader.ts, R-28's six
// steps, on FakeClock, with stand-ins for the page's fetch, createImageBitmap (which Node lacks), the renderer's
// uploads, the quality controller's hold, and the scene's swap, over GLBs made when the test runs (test/helpers/glb.ts,
// room-models.ts), since spec 003's rule A1 refuses a committed model.
// - The floor: below ADR 0010's, every model is skipped, and nothing is fetched.
// - The order: after the figures, in the entries' order (the 3D part's load_order), at most 4 fetches at once, each
//   same-origin, with the plain file's SHA-256 as its integrity, no redirect, and a 10-second timeout on the room's
//   clock that covers the body; at most 2 parses at once, only after the hand-off, each inside a hold the controller
//   counts, released two frames after its swap.
// - Failure: a blocked, timed-out, integrity-failing, non-200, unparsable, or short-of-images load retries once
//   (retried), then keeps its stand-in (failed); textures that would take the ledger over its limit leave it skipped.
// - Each outcome records one asset event, {asset, outcome, ms_bucket, bytes, mode}: `bytes` the .gz copy's length for
//   loaded and 0 otherwise, `mode` full, reduced, or 2d.
// - In spec 003's reduced tier (a quality level of 1 or more as the model decodes) images decode at half size; every
//   texture uploads through the ledger, each image counted once, and the decoded bitmaps close.
// - After a lost context is restored, swapped pieces go back to their stand-ins and load again under a hold; stopping
//   (the room gone to 2D) skips each load that hasn't recorded its end, once, its holds let go and frames cancelled.
// - The scene's side: the 3D part's load order as entries; a model readied as the room's (lights and cameras out, the
//   look's materials, its face objects hidden) and shown in place of its piece's stand-ins wherever the piece shows,
//   the stand-ins back when it goes.
// - The room's wiring: app.ts hands the 3D stage the hand-off's end, the controller's hold, the quality level, the
//   visit's mode, and its asset events, which stay in page memory while live.asset_events is off; and a lost context
//   holds the controller until two frames after its restore.
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Texture,
} from "three";
import type { Material } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { ASSET_EVENTS_URL } from "../../src/asset-events";
import type { AssetEvent } from "../../src/asset-events";
import type { Mode } from "../../src/choice/visit";
import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { readImage } from "../../src/room/glb/images";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import type { Decode } from "../../src/room/scene/gltf-images";
import { createTextureLedger, textureBytes } from "../../src/room/scene/ledger";
import {
  FETCH_TIMEOUT_MS,
  MAX_FETCHES,
  MAX_PARSES,
  MODEL_NODE,
  assetOf,
  createLoader,
  disposeModel,
  integrity,
  modelEntries,
  prepareModel,
  showModel,
} from "../../src/room/scene/loader";
import type { FetchLike, LoaderOptions, ModelEntry } from "../../src/room/scene/loader";
import { lookMaterials } from "../../src/room/scene/look";
import { SCENE_WAIT_MS, SETTLE_FRAMES } from "../../src/room/quality";
import { ascii, desk } from "../helpers/glb";
import { FakeClock, button, enter, flush, intoRoom, radio, roomIndex, start } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, cleanModel, modelChanges } from "../helpers/room-models";

afterEach(() => {
  vi.unstubAllGlobals();
});

// --------------------------------------------------------------------------------------------------------------------
// Stand-ins: createImageBitmap, the page's fetch, the controller's hold, the renderer
// --------------------------------------------------------------------------------------------------------------------
/** ImageBitmap's stand-in: its size, and close(), which empties it as a browser's does. */
class FakeBitmap {
  width: number;
  height: number;
  closed = false;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  close(): void {
    this.closed = true;
    this.width = 0;
    this.height = 0;
  }
}

interface Decoder {
  readonly decode: Decode;
  /** Every bitmap made, in order. */
  readonly made: FakeBitmap[];
  /** Every call's options. */
  readonly options: ImageBitmapOptions[];
  /** How many decodes are waiting on `gate`. */
  waiting(): number;
  /** Lets every decode waiting, and every later one, finish. */
  open(): void;
}

/** createImageBitmap's stand-in, sizing each bitmap from its image's header or the resize asked for; with `gated`, each
 *  decode waits until open(). It refuses the MIME types `refused` names. */
function decoder(options: { gated?: boolean; refused?: readonly string[] } = {}): Decoder {
  const made: FakeBitmap[] = [];
  const calls: ImageBitmapOptions[] = [];
  let gate: Promise<void> | null = null;
  let open = (): void => undefined;
  if (options.gated) gate = new Promise((resolve) => (open = resolve));
  let waiting = 0;
  const decode = async (source: Blob | ImageBitmap, o: ImageBitmapOptions): Promise<ImageBitmap> => {
    calls.push(o);
    if (gate) {
      waiting += 1;
      await gate;
      waiting -= 1;
    }
    let size: { width: number; height: number };
    if (source instanceof Blob) {
      if ((options.refused ?? []).includes(source.type)) throw new Error("undecodable");
      const header = readImage(new Uint8Array(await source.arrayBuffer())).header;
      if (!header) throw new Error("no header");
      size = header;
    } else size = source as unknown as FakeBitmap;
    const bitmap = new FakeBitmap(o.resizeWidth ?? size.width, o.resizeHeight ?? size.height);
    made.push(bitmap);
    return bitmap as unknown as ImageBitmap;
  };
  return {
    decode,
    made,
    options: calls,
    waiting: () => waiting,
    open: () => {
      gate = null;
      open();
    },
  };
}

/** One fetch the loader made: its URL, options, and time, and how the test answers it. */
interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
  readonly at: number;
  /** Answers with a status and body; "hang" never answers, and a body of "hang" never ends. */
  answer(response: { status?: number; body?: Uint8Array | "hang" } | "hang" | Error): void;
}

/** The page's fetch, as a spy the test answers; an aborted fetch rejects as a browser's does. */
function fetcher(clock: FakeClock): { fetch: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetch: FetchLike = (url, init) =>
    new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      calls.push({
        url,
        init,
        at: clock.now(),
        answer(response) {
          if (response === "hang") return;
          if (response instanceof Error) {
            reject(response);
            return;
          }
          const body = response.body ?? new Uint8Array();
          resolve({
            status: response.status ?? 200,
            arrayBuffer: () =>
              body === "hang" ? new Promise<ArrayBuffer>(() => undefined) : Promise.resolve(copy(body)),
          } as Response);
        },
      });
    });
  return { fetch, calls };
}

/** A GLB's bytes as an ArrayBuffer of their own. */
const copy = (data: Uint8Array): ArrayBuffer => data.slice().buffer;

/** The quality controller's hold, counted: what's held now, and every take and release with its time. */
function holds(clock: FakeClock): { hold: () => () => void; held(): number; log: string[] } {
  let held = 0;
  const log: string[] = [];
  return {
    hold: () => {
      held += 1;
      log.push(`take ${clock.now()}`);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        held -= 1;
        log.push(`release ${clock.now()}`);
      };
    },
    held: () => held,
    log,
  };
}

interface Harness {
  readonly clock: FakeClock;
  readonly fetch: ReturnType<typeof fetcher>;
  readonly decoder: Decoder;
  readonly holds: ReturnType<typeof holds>;
  readonly events: AssetEvent[];
  readonly swaps: { piece: string; model: Object3D | null; at: number }[];
  readonly uploads: Texture[];
  readonly ledger: ReturnType<typeof createTextureLedger>;
  readonly loader: ReturnType<typeof createLoader>;
  figures(): void;
  handoff(): void;
  mode: Mode;
  level: number;
}

function harness(
  options: {
    floor?: boolean;
    figures?: "pending" | "done";
    handoff?: "pending" | "done";
    decoder?: Decoder;
    limit?: number;
  } = {},
): Harness {
  const clock = new FakeClock();
  const f = fetcher(clock);
  const d = options.decoder ?? decoder();
  const h = holds(clock);
  const events: AssetEvent[] = [];
  const swaps: Harness["swaps"] = [];
  const uploads: Texture[] = [];
  const ledger = createTextureLedger(options.limit);
  let figures = (): void => undefined;
  let handoff = (): void => undefined;
  const figuresDone =
    options.figures === "pending" ? new Promise<void>((resolve) => (figures = resolve)) : Promise.resolve();
  const handoffDone =
    options.handoff === "pending" ? new Promise<void>((resolve) => (handoff = resolve)) : Promise.resolve();
  const harnessed: Omit<Harness, "loader"> & { loader: Harness["loader"] | null } = {
    clock,
    fetch: f,
    decoder: d,
    holds: h,
    events,
    swaps,
    uploads,
    ledger,
    figures: () => figures(),
    handoff: () => handoff(),
    mode: "3d",
    level: 0,
    loader: null,
  };
  const loaderOptions: LoaderOptions = {
    clock,
    fetch: f.fetch,
    decode: d.decode,
    floor: () => options.floor ?? true,
    figures: figuresDone,
    handoff: handoffDone,
    hold: h.hold,
    level: () => harnessed.level,
    mode: () => harnessed.mode,
    record: (event) => events.push(event),
    ledger,
    uploader: { initTexture: (texture) => uploads.push(texture) },
    prepare: () => undefined,
    swap: (piece, model) => swaps.push({ piece, model, at: clock.now() }),
  };
  // The options read the harness itself, so a test's change to its mode or level reaches the loader.
  harnessed.loader = createLoader(loaderOptions);
  return harnessed as Harness;
}

/** Lets the loader's promises settle: fetches answered, models parsed, each through several turns of the loop. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await flush();
}

const SHA = "26f62e29fefa1fc8e5ba6da6ce7fcf09e59a515a87953fdbdc955219c60d1e7e";

/** A model's a/ URL, as the 3D part names one. */
const urlOf = (piece: string): string => `a/${piece}.${SHA.slice(0, 16)}.glb`;

/** An entry fetched from the site, as modelEntries makes one. */
function urlEntry(piece: string, bytes = 1234): ModelEntry {
  return { piece, asset: piece, bytes, source: { kind: "url", url: urlOf(piece), sha256: SHA } };
}

/** An entry read from page memory, as lookdev's candidates and the phone copy's models are. */
function memoryEntry(piece: string, data: Uint8Array, bytes = 999): ModelEntry {
  return { piece, asset: piece, bytes, source: { kind: "memory", read: () => copy(data) } };
}

const DESK_GLB = desk().bytes;
/** The desk's three images, as desk() lays them out by default. */
const DESK_TEXTURE_BYTES = textureBytes(8, 8) + textureBytes(16, 8) + textureBytes(4, 4);

// --------------------------------------------------------------------------------------------------------------------
// The floor, the order, and the fetch
// --------------------------------------------------------------------------------------------------------------------
describe("the floor (R-28 step 1)", () => {
  it("skips every model below ADR 0010's floor, fetching nothing: skipped, <250, 0 bytes", async () => {
    const h = harness({ floor: false });
    await h.loader.load([urlEntry("fx-desk"), urlEntry("fx-sign")]);
    expect(h.fetch.calls).toEqual([]);
    expect(h.swaps).toEqual([]);
    expect(h.events).toEqual([
      { asset: "fx-desk", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "full" },
      { asset: "fx-sign", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "full" },
    ]);
    expect(h.loader.fellBack).toBe(true);
  });
});

describe("the order and the fetch (R-28 steps 2 and 3)", () => {
  it("waits for the figures, then fetches in the entries' order, at most 4 at once", async () => {
    const h = harness({ figures: "pending" });
    const pieces = ["fx-a", "fx-b", "fx-c", "fx-d", "fx-e", "fx-f"];
    const done = h.loader.load(pieces.map((p) => urlEntry(p)));
    await settle();
    expect(h.fetch.calls).toHaveLength(0);
    h.figures();
    await settle();
    expect(MAX_FETCHES).toBe(4);
    expect(h.fetch.calls.map((c) => c.url)).toEqual(pieces.slice(0, 4).map((p) => urlOf(p)));
    h.fetch.calls[1]?.answer({ body: DESK_GLB });
    await settle();
    expect(h.fetch.calls.map((c) => c.url)).toEqual(pieces.slice(0, 5).map((p) => urlOf(p)));
    for (const c of h.fetch.calls) c.answer({ body: DESK_GLB });
    await settle();
    h.fetch.calls[5]?.answer({ body: DESK_GLB });
    await settle();
    h.clock.advance(200);
    await done;
    expect(h.fetch.calls).toHaveLength(6);
    expect(h.events.map((e) => e.outcome)).toEqual(["loaded", "loaded", "loaded", "loaded", "loaded", "loaded"]);
  });

  it("fetches same-origin, with the plain file's SHA-256 as its integrity, no redirect, and no cookie of another site", async () => {
    const h = harness();
    void h.loader.load([urlEntry("fx-desk")]);
    await settle();
    const call = h.fetch.calls[0];
    expect(call?.url).toBe(urlOf("fx-desk"));
    expect(call?.init).toMatchObject({
      integrity: integrity(SHA),
      redirect: "error",
      mode: "same-origin",
      credentials: "same-origin",
    });
    expect(integrity(SHA)).toBe(`sha256-${Buffer.from(SHA, "hex").toString("base64")}`);
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("times a fetch out after 10 seconds on the room's clock, its body included, retries once, then fails", async () => {
    const h = harness();
    const done = h.loader.load([urlEntry("fx-desk")]);
    await settle();
    expect(FETCH_TIMEOUT_MS).toBe(10_000);
    // The response arrives, but its body never ends.
    h.fetch.calls[0]?.answer({ body: "hang" });
    await settle();
    h.clock.advance(FETCH_TIMEOUT_MS - 1);
    await settle();
    expect(h.events).toEqual([]);
    expect(h.fetch.calls[0]?.init.signal?.aborted).toBe(false);
    h.clock.advance(1);
    await settle();
    expect(h.fetch.calls[0]?.init.signal?.aborted).toBe(true);
    expect(h.events).toEqual([{ asset: "fx-desk", outcome: "retried", ms_bucket: ">=10000", bytes: 0, mode: "full" }]);
    expect(h.fetch.calls).toHaveLength(2);
    h.fetch.calls[1]?.answer("hang");
    await settle();
    h.clock.advance(FETCH_TIMEOUT_MS);
    await done;
    expect(h.events.map((e) => e.outcome)).toEqual(["retried", "failed"]);
    expect(h.swaps).toEqual([]);
    expect(h.loader.fellBack).toBe(true);
  });

  it.each([
    ["blocked", new TypeError("Failed to fetch")],
    ["failing its integrity check", new TypeError("integrity mismatch")],
    ["answered 404", { status: 404, body: DESK_GLB }],
    ["answered 206", { status: 206, body: DESK_GLB }],
    ["unparsable", { body: ascii("not a glTF file at all") }],
  ] as const)("retries a load %s once, then keeps the stand-in: retried, then failed", async (_, answer) => {
    const h = harness();
    const done = h.loader.load([urlEntry("fx-desk")]);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await settle();
      h.clock.advance(300);
      // A failed parse's hold settles over the frames just drawn before its retry is fetched.
      await settle();
      h.fetch.calls[attempt]?.answer(answer);
    }
    await settle();
    h.clock.advance(100);
    await done;
    expect(h.fetch.calls).toHaveLength(2);
    expect(h.events).toEqual([
      { asset: "fx-desk", outcome: "retried", ms_bucket: "<1000", bytes: 0, mode: "full" },
      { asset: "fx-desk", outcome: "failed", ms_bucket: "<1000", bytes: 0, mode: "full" },
    ]);
    expect(h.swaps).toEqual([]);
  });

  it("loads on the retry when the first attempt failed: retried, then loaded", async () => {
    const h = harness();
    const done = h.loader.load([urlEntry("fx-desk", 4321)]);
    await settle();
    h.fetch.calls[0]?.answer({ status: 503 });
    await settle();
    h.clock.advance(1500);
    h.fetch.calls[1]?.answer({ body: DESK_GLB });
    await settle();
    h.clock.advance(100);
    await done;
    expect(h.events).toEqual([
      { asset: "fx-desk", outcome: "retried", ms_bucket: "<250", bytes: 0, mode: "full" },
      { asset: "fx-desk", outcome: "loaded", ms_bucket: "<3000", bytes: 4321, mode: "full" },
    ]);
    expect(h.swaps.map((s) => s.piece)).toEqual(["fx-desk"]);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// Parse and swap
// --------------------------------------------------------------------------------------------------------------------
describe("parse and swap (R-28 step 4)", () => {
  it("parses only after the hand-off, though fetches run during it", async () => {
    const h = harness({ handoff: "pending" });
    const done = h.loader.load([urlEntry("fx-desk")]);
    await settle();
    h.fetch.calls[0]?.answer({ body: DESK_GLB });
    await settle();
    h.clock.advance(1000);
    await settle();
    expect(h.decoder.options).toEqual([]);
    expect(h.holds.held()).toBe(0);
    expect(h.swaps).toEqual([]);
    h.handoff();
    await settle();
    h.clock.advance(100);
    await done;
    expect(h.swaps.map((s) => s.piece)).toEqual(["fx-desk"]);
  });

  it("parses at most 2 at once, each inside a hold from its parse until two frames after its swap", async () => {
    const d = decoder({ gated: true });
    const h = harness({ decoder: d });
    const pieces = ["fx-a", "fx-b", "fx-c"];
    const done = h.loader.load(pieces.map((p) => memoryEntry(p, DESK_GLB)));
    await settle();
    expect(MAX_PARSES).toBe(2);
    expect(h.holds.held()).toBe(2);
    expect(h.swaps).toEqual([]);
    d.open();
    await settle();
    // Two swapped; the third parses once a parse ends.
    expect(h.swaps.map((s) => s.piece)).toEqual(pieces);
    expect(h.holds.held()).toBe(3);
    expect(SETTLE_FRAMES).toBe(2);
    h.clock.advance(16);
    expect(h.holds.held()).toBe(3);
    h.clock.advance(16);
    expect(h.holds.held()).toBe(0);
    await done;
    expect(h.holds.log.filter((l) => l.startsWith("release"))).toEqual(["release 32", "release 32", "release 32"]);
  });

  it("swaps a model in through the scene, after readying it, and uploads every texture through the ledger once", async () => {
    const prepared: string[] = [];
    const h = harness();
    const loader = createLoader({
      ...optionsOf(h),
      prepare: (piece, model) => prepared.push(`${piece} ${model.type}`),
    });
    const done = loader.load([memoryEntry("fx-desk", DESK_GLB)]);
    await settle();
    h.clock.advance(32);
    await done;
    expect(prepared).toEqual(["fx-desk Group"]);
    expect(h.swaps).toHaveLength(1);
    const model = h.swaps[0]?.model;
    expect(model).toBeInstanceOf(Object3D);
    // Three images, each counted once, at FR-053's formula, though GLTFLoader clones a texture per use.
    expect(h.ledger.bytes).toBe(DESK_TEXTURE_BYTES);
    expect(h.uploads.length).toBeGreaterThanOrEqual(3);
    expect(new Set(h.uploads.map((t) => t.source)).size).toBe(3);
    // Every decoded bitmap is closed once the GPU holds its pixels.
    expect(h.decoder.made.length).toBe(3);
    expect(h.decoder.made.every((b) => b.closed)).toBe(true);
    expect(loader.loaded).toEqual(new Set(["fx-desk"]));
  });

  it("decodes images at half size in spec 003's reduced tier, a quality level of 1 or more as the model decodes", async () => {
    const h = harness();
    h.level = 1;
    h.mode = "reduced";
    const done = h.loader.load([memoryEntry("fx-desk", DESK_GLB, 777)]);
    await settle();
    h.clock.advance(32);
    await done;
    const resized = h.decoder.options.filter((o) => o.resizeWidth !== undefined);
    expect(resized.map((o) => `${o.resizeWidth ?? 0} × ${o.resizeHeight ?? 0}`).sort()).toEqual([
      "2 × 2",
      "4 × 4",
      "8 × 4",
    ]);
    expect(h.ledger.bytes).toBe(textureBytes(4, 4) + textureBytes(8, 4) + textureBytes(2, 2));
    expect(h.events).toEqual([{ asset: "fx-desk", outcome: "loaded", ms_bucket: "<250", bytes: 777, mode: "reduced" }]);
  });

  it("skips a piece whose textures would take the ledger over its limit, closing what it decoded", async () => {
    const h = harness({ limit: DESK_TEXTURE_BYTES - 1 });
    const done = h.loader.load([memoryEntry("fx-desk", DESK_GLB)]);
    await settle();
    h.clock.advance(32);
    await done;
    expect(h.swaps).toEqual([]);
    expect(h.uploads).toEqual([]);
    expect(h.ledger.bytes).toBe(0);
    expect(h.decoder.made.every((b) => b.closed)).toBe(true);
    expect(h.events).toEqual([{ asset: "fx-desk", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "full" }]);
    expect(h.loader.fellBack).toBe(true);
  });

  it("fails a model short of the images its materials use, after one retry (R-29)", async () => {
    const d = decoder({ refused: ["image/webp"] });
    const h = harness({ decoder: d });
    const done = h.loader.load([memoryEntry("fx-desk", DESK_GLB)]);
    await settle();
    h.clock.advance(32);
    await settle();
    h.clock.advance(32);
    await done;
    expect(h.events.map((e) => e.outcome)).toEqual(["retried", "failed"]);
    expect(h.swaps).toEqual([]);
    expect(d.made.every((b) => b.closed)).toBe(true);
  });

  it("records each outcome's event in the visit's mode: full, reduced, or 2d", async () => {
    for (const [mode, name] of [
      ["3d", "full"],
      ["reduced", "reduced"],
    ] as const) {
      const h = harness();
      h.mode = mode;
      const done = h.loader.load([memoryEntry("fx-desk", cleanModel(DESK_ENTRY), 55)]);
      await settle();
      h.clock.advance(32);
      await done;
      expect(h.events).toEqual([{ asset: "fx-desk", outcome: "loaded", ms_bucket: "<250", bytes: 55, mode: name }]);
    }
  });
});

const DESK_ENTRY = { origin: { bounds: { min: [-0.5, 0, -0.3], max: [0.5, 0.7, 0.3] } } } as const;

/** The options a harness's loader was made with, for a loader made with one changed. */
function optionsOf(h: Harness): LoaderOptions {
  return {
    clock: h.clock,
    fetch: h.fetch.fetch,
    decode: h.decoder.decode,
    floor: () => true,
    figures: Promise.resolve(),
    handoff: Promise.resolve(),
    hold: h.holds.hold,
    level: () => h.level,
    mode: () => h.mode,
    record: (event) => h.events.push(event),
    ledger: h.ledger,
    uploader: { initTexture: (texture) => h.uploads.push(texture) },
    prepare: () => undefined,
    swap: (piece, model) => h.swaps.push({ piece, model, at: h.clock.now() }),
  };
}

// --------------------------------------------------------------------------------------------------------------------
// A lost context, a piece taken out, and stopping
// --------------------------------------------------------------------------------------------------------------------
describe("memory and a lost context (R-28 step 6)", () => {
  it("puts swapped pieces back to their stand-ins after a restore, and loads them again under a hold", async () => {
    const h = harness();
    const done = h.loader.load([urlEntry("fx-desk", 600)]);
    await settle();
    h.fetch.calls[0]?.answer({ body: DESK_GLB });
    await settle();
    h.clock.advance(32);
    await done;
    expect(h.ledger.bytes).toBe(DESK_TEXTURE_BYTES);
    const reloaded = h.loader.reload();
    // At once: the stand-in back, the model's textures released.
    expect(h.swaps.map((s) => [s.piece, s.model === null])).toEqual([
      ["fx-desk", false],
      ["fx-desk", true],
    ]);
    expect(h.ledger.bytes).toBe(0);
    expect(h.loader.loaded).toEqual(new Set());
    await settle();
    // Fetched again, as the HTTP cache answers it.
    expect(h.fetch.calls.map((c) => c.url)).toEqual([urlOf("fx-desk"), urlOf("fx-desk")]);
    h.fetch.calls[1]?.answer({ body: DESK_GLB });
    await settle();
    expect(h.holds.held()).toBe(1);
    h.clock.advance(32);
    await reloaded;
    expect(h.holds.held()).toBe(0);
    expect(h.swaps.map((s) => s.model === null)).toEqual([false, true, false]);
    expect(h.events.map((e) => e.outcome)).toEqual(["loaded", "loaded"]);
    expect(h.ledger.bytes).toBe(DESK_TEXTURE_BYTES);
  });

  it("takes one piece's model out, its stand-in back, and drops a load of that piece still on its way", async () => {
    const d = decoder({ gated: true });
    const h = harness({ decoder: d });
    const done = h.loader.load([memoryEntry("fx-desk", DESK_GLB)]);
    await settle();
    h.loader.remove("fx-desk");
    d.open();
    await settle();
    h.clock.advance(32);
    await done;
    expect(h.swaps).toEqual([]);
    expect(h.ledger.bytes).toBe(0);
    expect(d.made.every((b) => b.closed)).toBe(true);
    expect(h.holds.held()).toBe(0);
  });

  it("stops when the room goes to 2D: nothing more is fetched or swapped, and what hadn't settled is skipped", async () => {
    const h = harness();
    const done = h.loader.load([urlEntry("fx-desk"), urlEntry("fx-sign")]);
    await settle();
    h.mode = "2d";
    h.loader.stop();
    expect(h.fetch.calls.every((c) => c.init.signal?.aborted)).toBe(true);
    h.fetch.calls[0]?.answer({ body: DESK_GLB });
    await settle();
    h.clock.advance(FETCH_TIMEOUT_MS * 3);
    await done;
    expect(h.swaps).toEqual([]);
    expect(h.events).toEqual([
      { asset: "fx-desk", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "2d" },
      { asset: "fx-sign", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "2d" },
    ]);
    expect(h.holds.held()).toBe(0);
  });
});

describe("a stop's one event per load (data-model.md §11.5)", () => {
  it("stops during a swap's two settle frames: its loaded event stands alone, its hold let go once, its frame cancelled", async () => {
    const h = harness();
    // Every call of each release, the repeated ones too: the controller's own release counts once however often it's
    // called, so only the calls show a second one.
    const calls: number[] = [];
    const loader = createLoader({
      ...optionsOf(h),
      hold: () => {
        const at = calls.push(0) - 1;
        return () => {
          calls[at] = (calls[at] ?? 0) + 1;
        };
      },
    });
    const done = loader.load([memoryEntry("fx-desk", DESK_GLB, 55)]);
    await settle();
    expect(h.events.map((e) => e.outcome)).toEqual(["loaded"]);
    expect(calls).toEqual([0]);
    expect(loader.busy).toBe(true);
    h.mode = "2d";
    loader.stop();
    expect(calls).toEqual([1]);
    expect(h.clock.pendingFrames).toBe(0);
    await done;
    h.clock.advance(SETTLE_FRAMES * 16 * 2);
    expect(calls).toEqual([1]);
    expect(loader.busy).toBe(false);
    expect(h.events).toEqual([{ asset: "fx-desk", outcome: "loaded", ms_bucket: "<250", bytes: 55, mode: "full" }]);
  });

  it("stops during a ledger skip's settle frames: its one skipped event stands alone", async () => {
    const h = harness({ limit: DESK_TEXTURE_BYTES - 1 });
    const done = h.loader.load([memoryEntry("fx-desk", DESK_GLB)]);
    await settle();
    expect(h.events.map((e) => e.outcome)).toEqual(["skipped"]);
    h.mode = "2d";
    h.loader.stop();
    await done;
    h.clock.advance(SETTLE_FRAMES * 16 * 2);
    expect(h.events).toEqual([{ asset: "fx-desk", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "full" }]);
    expect(h.holds.held()).toBe(0);
    expect(h.loader.busy).toBe(false);
  });

  it("stops while its loads wait for the figures: each is skipped, once, and nothing is fetched", async () => {
    const h = harness({ figures: "pending" });
    const done = h.loader.load([urlEntry("fx-desk"), urlEntry("fx-sign")]);
    await settle();
    h.mode = "2d";
    h.loader.stop();
    h.figures();
    await done;
    await settle();
    expect(h.fetch.calls).toEqual([]);
    expect(h.events).toEqual([
      { asset: "fx-desk", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "2d" },
      { asset: "fx-sign", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "2d" },
    ]);
  });

  it("skips a piece once when a newer load of it superseded an older one still fetching", async () => {
    const d = decoder({ gated: true });
    const h = harness({ decoder: d });
    const first = h.loader.load([urlEntry("fx-desk")]);
    await settle();
    // The page's own copy of the piece, read from memory, supersedes the fetch on its way, and is decoding at the stop.
    const newer = h.loader.load([memoryEntry("fx-desk", DESK_GLB)]);
    await settle();
    expect(d.waiting()).toBeGreaterThan(0);
    h.mode = "2d";
    h.loader.stop();
    d.open();
    await Promise.all([first, newer]);
    await settle();
    expect(h.swaps).toEqual([]);
    expect(h.events).toEqual([{ asset: "fx-desk", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "2d" }]);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The scene's side
// --------------------------------------------------------------------------------------------------------------------
/** The fixture room with set models on the pieces given, composed under main's caps. */
function withModels(pieces: readonly string[]): ComposeResult {
  return compose(overlay(modelChanges(pieces)), capsPolicy(), { mode: "lenient", drafts: false });
}

describe("the 3D part's load order as entries", () => {
  it("is each set model once, in load_order, from the site's a/ URLs under a base, keyed by its record's file", () => {
    const { scene, models } = withModels(["fx-desk", "fx-sign", "fx-monitor"]);
    const entries = modelEntries(scene, "../");
    const placed = scene.load_order.map((id) => scene.placements.find((p) => p.id === id));
    expect(entries.map((e) => e.piece)).toEqual(placed.flatMap((p) => (p ? [p.piece] : [])));
    for (const e of entries) {
      const model = scene.placements.find((p) => p.piece === e.piece)?.model;
      expect(e.source).toEqual({ kind: "url", url: `../${model?.url ?? ""}`, sha256: model?.sha256 });
      expect(e.bytes).toBe(models.find((m) => m.piece === e.piece)?.gz.length);
      expect(e.asset).toBe(e.piece);
    }
    expect(assetOf("a/fx-board.0123456789abcdef.glb", "fx-other")).toBe("fx-board");
    expect(assetOf("elsewhere.glb", "fx-other")).toBe("fx-other");
  });

  it("resolves a switch's pose, <switch>.<pose>, to the switch's own model, its piece's record's file the asset", () => {
    const { scene, models } = withModels(["fx-plug"]);
    const sw = scene.switches.find((s) => s.piece === "fx-plug");
    const plug = models.find((m) => m.piece === "fx-plug");
    // RS2 lets no placement place a switch's piece: the switch carries its model (contracts/room-bundle.md §3.2).
    expect(scene.placements.some((p) => p.piece === "fx-plug")).toBe(false);
    expect(scene.load_order).toEqual([`${sw?.id ?? ""}.fx-resting`]);
    expect(modelEntries(scene, "../")).toEqual([
      {
        piece: "fx-plug",
        asset: "fx-plug",
        bytes: plug?.gz.length,
        source: { kind: "url", url: `../${sw?.model?.url ?? ""}`, sha256: sw?.model?.sha256 },
      },
    ]);
  });

  it("loads a switch's model into each case of the switch, its event's bytes the .gz copy's length", async () => {
    const { scene: part, index, models } = withModels(["fx-plug"]);
    const label = (text: string): Object3D => Object.assign(new Object3D(), { name: `label:${text}` });
    const room = buildRoom(part, { avatar: "dog", label, index });
    const h = harness();
    const loader = createLoader({ ...optionsOf(h), swap: (piece, model) => showModel(room, part, piece, model) });
    const done = loader.load(modelEntries(part));
    await settle();
    const sw = part.switches.find((s) => s.piece === "fx-plug");
    expect(h.fetch.calls.map((c) => c.url)).toEqual([sw?.model?.url]);
    h.fetch.calls[0]?.answer({ body: modelChanges(["fx-plug"])["assets/room/fx-plug.glb"] as Uint8Array });
    await settle();
    h.clock.advance(32);
    await done;
    const cases = [...(room.switches.get(sw?.id ?? "")?.values() ?? [])];
    expect(cases.map((c) => c.name)).toEqual(Object.keys(sw?.poses ?? {}).map((pose) => `${sw?.id ?? ""}.${pose}`));
    for (const group of cases) {
      expect(
        group.children.filter((c) => c.name === MODEL_NODE),
        group.name,
      ).toHaveLength(1);
      expect(group.children.find((c) => c.name === "standin")?.visible, group.name).toBe(false);
    }
    expect(h.events).toEqual([
      {
        asset: "fx-plug",
        outcome: "loaded",
        ms_bucket: "<250",
        bytes: models.find((m) => m.piece === "fx-plug")?.gz.length,
        mode: "full",
      },
    ]);
  });
});

/** The fixture room's 3D part, its index, and the room built from it, with label nodes named by their words. */
function fixtureRoom(): { part: RoomScene; room: Room3D; result: ComposeResult } {
  const result = compose(goodTree(), noPolicy(), { mode: "lenient", drafts: true });
  const label = (text: string): Object3D => Object.assign(new Object3D(), { name: `label:${text}` });
  return { part: result.scene, result, room: buildRoom(result.scene, { avatar: "dog", label, index: result.index }) };
}

/** A model as GLTFLoader gives one: a group holding a textured mesh, a face's quad, a light, and a camera. */
function parsedModel(face: string): { model: Group; texture: Texture; source: MeshStandardMaterial } {
  const texture = new Texture();
  const source = new MeshStandardMaterial({ color: "#336699", map: texture });
  const model = new Group();
  const body = new Mesh(new PlaneGeometry(1, 1), source);
  const quad = new Mesh(new PlaneGeometry(0.2, 0.1), new MeshStandardMaterial({ color: "#101010" }));
  quad.name = face;
  const light = new PointLight();
  const camera = new PerspectiveCamera();
  body.add(light);
  model.add(body, quad, camera);
  return { model, texture, source };
}

describe("a model readied as the room's (R-28 step 4)", () => {
  it("strips lights and cameras, hides the model's own face objects, and applies the look's materials", () => {
    const { part } = fixtureRoom();
    const piece = Object.entries(part.pieces).find(([, p]) => Object.keys(p.faces).length > 0);
    if (!piece) throw new Error("no fixture piece with a live face");
    const role = Object.keys(piece[1].faces)[0] ?? "";
    for (const method of ["inked-cel", "painted", "flat"] as const) {
      const look = { ...part.look, method };
      const { model, texture } = parsedModel(role);
      prepareModel(model, piece[1], look, lookMaterials(look));
      const kinds: string[] = [];
      model.traverse((node) => kinds.push(node.type));
      expect(
        kinds.filter((k) => /Light|Camera/.test(k)),
        method,
      ).toEqual([]);
      expect(model.getObjectByName(role)?.visible, method).toBe(false);
      const body = model.children[0] as Mesh;
      const material = body.material as Material & { map?: Texture | null; color?: { getHexString(): string } };
      expect(material.color?.getHexString(), method).toBe("336699");
      if (method === "inked-cel") {
        expect(material).toBeInstanceOf(MeshToonMaterial);
        expect((material as MeshToonMaterial).gradientMap).not.toBeNull();
        expect(material.map).toBe(texture);
      } else {
        expect(material).toBeInstanceOf(MeshBasicMaterial);
        expect(material.map ?? null).toBe(method === "painted" ? texture : null);
      }
      expect(body.castShadow, method).toBe(method === "inked-cel");
    }
  });
});

describe("a model shown in place of its piece's stand-ins", () => {
  it("replaces the stand-in on every placement and switch case that shows the piece, and puts it back on null", () => {
    const { part, room } = fixtureRoom();
    const sw = part.switches[0];
    if (!sw) throw new Error("no fixture switch");
    // A placed piece with a stand-in's label, and the switch's piece, shown in each of its cases.
    const labelled = part.placements.find((p) => room.labels.has(p.id));
    if (!labelled) throw new Error("no labelled placement");
    for (const piece of [labelled.piece, sw.piece]) {
      const model = new Group();
      model.add(new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial()));
      showModel(room, part, piece, model);
      const holders: Object3D[] = [
        ...part.placements.filter((p) => p.piece === piece).map((p) => room.placements.get(p.id) as Object3D),
        ...part.switches
          .filter((s) => s.piece === piece)
          .flatMap((s) => [...(room.switches.get(s.id)?.values() ?? [])]),
      ];
      expect(holders.length).toBeGreaterThan(0);
      for (const holder of holders) {
        const shown = holder.children.filter((c) => c.name === MODEL_NODE);
        expect(shown).toHaveLength(1);
        expect((shown[0]?.children[0] as Mesh).geometry).toBe((model.children[0] as Mesh).geometry);
        expect(holder.children.find((c) => c.name === "standin")?.visible).toBe(false);
      }
      if (piece === labelled.piece) expect(room.labels.get(labelled.id)?.visible).toBe(false);
      showModel(room, part, piece, null);
      for (const holder of holders) {
        expect(holder.children.filter((c) => c.name === MODEL_NODE)).toEqual([]);
        expect(holder.children.find((c) => c.name === "standin")?.visible).toBe(true);
      }
      if (piece === labelled.piece) expect(room.labels.get(labelled.id)?.visible).toBe(true);
    }
  });

  it("releases a model's geometry, materials, and textures, but never the look's shared ramp", () => {
    const { part } = fixtureRoom();
    const materials = lookMaterials(part.look);
    const { model, texture } = parsedModel("fx-face");
    prepareModel(model, { faces: {} }, part.look, materials);
    const body = model.children[0] as Mesh;
    const toon = body.material as MeshToonMaterial;
    const ramp = toon.gradientMap as Texture;
    const disposed: string[] = [];
    texture.addEventListener("dispose", () => disposed.push("texture"));
    ramp.addEventListener("dispose", () => disposed.push("ramp"));
    toon.addEventListener("dispose", () => disposed.push("material"));
    body.geometry.addEventListener("dispose", () => disposed.push("geometry"));
    disposeModel(model);
    expect(disposed.sort()).toEqual(["geometry", "material", "texture"]);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The room's wiring (app.ts)
// --------------------------------------------------------------------------------------------------------------------
describe("the room's wiring (T134)", () => {
  it("hands the 3D stage the hand-off's end, the controller's hold, the quality level, and the visit's mode", async () => {
    const v = start({ webgl: true });
    await enter(v);
    const options = v.scene.created[0];
    if (!options) throw new Error("no scene made");
    let ended = false;
    void options.handoff?.then(() => (ended = true));
    await flush();
    expect(ended).toBe(false);
    v.clock.advance(5000);
    await flush();
    expect(ended).toBe(true);
    expect(options.mode?.()).toBe("3d");
    expect(options.level?.()).toBe(0);
    // Held, frames at 5 a second step nothing down; released, they do.
    const release = options.hold?.();
    v.clock.advance(12_000, 200);
    expect(v.scene.quality).toEqual([]);
    release?.();
    v.clock.advance(12_000, 200);
    expect(v.scene.quality.length).toBeGreaterThan(0);
    expect(options.level?.()).toBe(v.scene.quality.at(-1));
    expect(options.mode?.()).toBe("reduced");
  });

  it("reads ADR 0010's floor with spec 002's WebGL 2 check, behind the choice, and hands it to the 3D stage", async () => {
    for (const [maxTextureSize, floor] of [
      [4096, true],
      [2048, false],
    ] as const) {
      const v = start({ webgl: true, maxTextureSize });
      await enter(v);
      expect(v.room.visit.mode).toBe("3d");
      expect(v.scene.created[0]?.floor, `${maxTextureSize}`).toBe(floor);
    }
    // A context that won't give its texture size still draws the room in 3D, as spec 002's check has it: below the
    // floor.
    const v = start({ webgl: true });
    await enter(v);
    expect(v.room.visit.mode).toBe("3d");
    expect(v.scene.created[0]?.floor).toBe(false);
  });

  it("keeps the stage's asset events in page memory while live.asset_events is off: no request, no beacon", async () => {
    const v = start({ webgl: true });
    await enter(v);
    const options = v.scene.created[0];
    expect(v.room.visit.mode).toBe("3d");
    expect(options?.assets).toBeTypeOf("function");
    options?.assets?.({ asset: "fx-desk", outcome: "loaded", ms_bucket: "<1000", bytes: 1, mode: "full" });
    v.doc.dispatchEvent(new v.win.Event("visibilitychange"));
    v.clock.advance(60_000);
    await flush();
    expect(v.spies.network).toEqual([]);
    expect(v.spies.beacons).toEqual([]);
  });

  it("holds the quality controller from a lost context until two frames after its restore", async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(5000);
    const canvas = v.scene.stage?.canvas;
    if (!canvas) throw new Error("no canvas");
    // Frames at 5 a second from the loss on: unheld, the window running since before the loss would step down within
    // 5 s of it. Held, the window starts again only two frames after the restore, 2 s later.
    canvas.dispatchEvent(new v.win.Event("webglcontextlost", { cancelable: true }));
    v.clock.advance(2000, 200);
    canvas.dispatchEvent(new v.win.Event("webglcontextrestored"));
    v.clock.advance(4600, 200);
    expect(v.scene.quality).toEqual([]);
    expect(v.room.visit.mode).toBe("3d");
    v.clock.advance(1400, 200);
    expect(v.scene.quality).toEqual([1]);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// A room in 2D before its loader has its models (T141; the lookdev review's runtime-3)
// --------------------------------------------------------------------------------------------------------------------
describe("a set model's event when the room is in 2D before its 3D stage's loader has it", () => {
  /** An index with set models on a placed piece and a switch's piece, its asset events sent (`site`), so the page's
   *  beacon shows what the room recorded. */
  function sending(index: RoomIndex = withModels(["fx-desk", "fx-plug"]).index): RoomIndex {
    return { ...index, live: { ...index.live, asset_events: "site" } };
  }

  /** The asset events the room recorded, as its beacon carries them when the page hides. */
  function beaconed(v: Visit): AssetEvent[] {
    Object.defineProperty(v.doc, "visibilityState", { configurable: true, get: () => "hidden" });
    v.doc.dispatchEvent(new v.win.Event("visibilitychange"));
    return v.spies.beacons
      .filter((b) => b.url === ASSET_EVENTS_URL)
      .flatMap((b) => (JSON.parse(b.body) as { events: AssetEvent[] }).events);
  }

  const skipped2d = (asset: string): AssetEvent => ({
    asset,
    outcome: "skipped",
    ms_bucket: "<250",
    bytes: 0,
    mode: "2d",
  });

  it("records each set model skipped, in 2D, when the room starts there without WebGL 2", async () => {
    const v = start({ webgl: false, room: sending() });
    await enter(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(beaconed(v)).toEqual([skipped2d("fx-desk"), skipped2d("fx-plug")]);
  });

  it("records each skipped when the 3D chunk comes too late, or fails, or its stage refuses the part", async () => {
    const late = start({ webgl: true, sceneHangs: true, room: sending() });
    await flush();
    radio(late.doc, "path", "engineer").click();
    radio(late.doc, "avatar", "dog").click();
    button(late.doc, "Enter").click();
    await flush();
    late.clock.advance(SCENE_WAIT_MS);
    await late.room.settled();
    expect(late.room.visit.mode).toBe("2d");
    expect(beaconed(late)).toEqual([skipped2d("fx-desk"), skipped2d("fx-plug")]);
    const failed = start({ webgl: true, sceneFails: true, room: sending() });
    await enter(failed);
    expect(failed.room.visit.mode).toBe("2d");
    expect(beaconed(failed)).toEqual([skipped2d("fx-desk"), skipped2d("fx-plug")]);
    const refused = start({ webgl: true, room: sending() });
    refused.scene.module.createScene = () => {
      throw new Error("the 3D part's digest isn't the index's");
    };
    await enter(refused);
    expect(refused.room.visit.mode).toBe("2d");
    expect(beaconed(refused)).toEqual([skipped2d("fx-desk"), skipped2d("fx-plug")]);
  });

  it("records the rest skipped when the room goes to 2D before its 3D stage's loader had them, once each", async () => {
    const v = start({ webgl: true, room: sending() });
    await intoRoom(v);
    const loaded: AssetEvent = { asset: "fx-desk", outcome: "loaded", ms_bucket: "<1000", bytes: 636, mode: "full" };
    // The desk loaded in 3D, after a retry; the plug's load never reached the stage's loader (its chunk still on its
    // way when the stage was disposed).
    v.scene.created[0]?.assets?.({ ...loaded, outcome: "retried", bytes: 0 });
    v.scene.created[0]?.assets?.(loaded);
    button(v.doc, "2D view").click();
    expect(v.room.visit.mode).toBe("2d");
    expect(v.scene.disposed).toBe(1);
    expect(beaconed(v)).toEqual([{ ...loaded, outcome: "retried", bytes: 0 }, loaded, skipped2d("fx-plug")]);
  });

  it("records nothing where the index sets no model", async () => {
    const v = start({ webgl: false, room: sending(roomIndex()) });
    await enter(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(beaconed(v)).toEqual([]);
  });
});
