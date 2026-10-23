// Loading pieces (spec 004; FR-055 to FR-057, FR-071; Amendments C9, C10, C11; research.md R-28, R-29, R-60;
// data-model.md §11.4, §11.5; contracts/room-live-state-telemetry.md §3): the studio models a piece shows in place of
// its stand-in, in R-28's six steps, for the room's 3D stage (scene.ts) and the lookdev page alike.
// 1. The floor. Models load only above ADR 0010's floor (quality.ts's capability() and meetsModelFloor), read once,
//    when the first model would load; below it every model is skipped, and the stand-ins stay.
// 2. The order. After the figures (a promise spec 003's avatar loader will resolve; today, at once), in the entries'
//    order, which is the 3D part's load_order (compose/load-order.ts): a model several placements share loads once.
// 3. The fetch. At most 4 at once, same-origin, with `integrity` the plain file's SHA-256, no redirect, and a
//    10-second timeout on the room's clock that covers the body. A model the page holds in memory (lookdev's
//    candidates, every model in the phone copy) is read from there, and nothing is fetched.
// 4. Parse and swap. At most 2 at once, only after the hand-off (fetches may run during it), each inside a quality
//    hold from its parse until two frames after its swap (R-35), with the room's image step (gltf-images.ts); the
//    model readied as the room's (prepareModel: lights and cameras out, the look applied, its face objects hidden),
//    then shown in place of its piece's stand-ins (showModel) and its textures uploaded through the ledger, each image
//    counted once, every decoded bitmap closed. A piece whose textures would take the ledger over its limit stays a
//    stand-in (skipped).
// 5. Failure. Blocked, timed out, failing integrity, not 200, failing to parse or decode, or short of the images its
//    materials use: one retry (retried), then the stand-in stays, selectable, with its faces and state (failed), and
//    `fellBack` says the placeholder note shows (FR-057).
// 6. Memory and context loss. In spec 003's reduced tier, a quality level of 1 or more as the model decodes, images
//    decode at half size. After a lost context is restored, reload() puts the swapped pieces back to their stand-ins
//    and loads them again, from the HTTP cache, each under its hold.
// Each outcome records spec 003's asset event once (asset-events.ts): `asset` the record's file stem, `ms_bucket` from
// the first fetch's start to the swap or the failure, `bytes` the .glb.gz copy's length for loaded alone, and `mode`
// the visit's. A load's end (loaded, failed, or skipped) is recorded as it happens, before its hold's two frames.
// stop(), when the room goes to 2D, fetches, parses, and swaps nothing more, lets every hold go, and skips each load
// that hadn't recorded its end, from its load() call on, once; a load a newer one of its piece superseded isn't one.
//
// Readings beside the research's words (plan.md §10):
// - An image card (a set model whose URL isn't a .glb) waits for its drawing: the loader takes GLBs only.
// - A switch's pose in load_order loads its piece's model only where a placement shows that piece too, since the 3D
//   part carries a model's URL on placements alone.
// - Parsing waits for the hand-off as the swap does, since a parse stalls frames in the one animation nothing skips.
// - A failed attempt's hold, like a swap's, is released two frames after it.
import type { Light, Material, Mesh, Object3D, Texture } from "three";

import { assetEvent } from "../../asset-events";
import type { AssetEvent, AssetOutcome } from "../../asset-events";
import type { Mode } from "../../choice/visit";
import type { Clock } from "../clock";
import type { Look, RoomScene } from "../compose/bundle";
import { SETTLE_FRAMES } from "../quality";
import type { Room3D } from "./bundle3d";
import { parseModel } from "./gltf-images";
import type { Decode } from "./gltf-images";
import type { TextureLedger, Uploader } from "./ledger";
import type { Materials } from "./look";

/** Spec 003's limit on one model's fetch, its body included. */
export const FETCH_TIMEOUT_MS = 10_000;
/** Fetches at once. */
export const MAX_FETCHES = 4;
/** Parses at once. */
export const MAX_PARSES = 2;
/** The name a shown model's node takes under its placement or switch case. */
export const MODEL_NODE = "model";
/** The name buildRoom gives a piece's stand-in. */
const STANDIN_NODE = "standin";
/** A set model's URL in the 3D part: `a/<stem>.<hash16>.glb`, the stem its record's file name. */
const MODEL_URL = /^a\/(.+)\.[0-9a-f]{16}\.glb$/;
const GLB_URL = /\.glb$/;

/** Where a model's bytes come from: the site's own a/ path, or the page's memory. */
export type ModelSource =
  | { readonly kind: "url"; readonly url: string; readonly sha256: string }
  | { readonly kind: "memory"; read(): ArrayBuffer | null };

/** One model to load. */
export interface ModelEntry {
  /** The piece whose stand-ins the model replaces. */
  readonly piece: string;
  /** Its asset events' `asset`: its record's file name without the extension. */
  readonly asset: string;
  /** The .glb.gz copy's length (C11): a loaded event's `bytes`. */
  readonly bytes: number;
  readonly source: ModelSource;
}

/** The page's fetch, as far as the loader calls it. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LoaderOptions {
  readonly clock: Clock;
  readonly fetch: FetchLike;
  /** createImageBitmap, which the page takes from its window. */
  readonly decode: Decode;
  /** Whether models may load here: ADR 0010's floor. */
  readonly floor: () => boolean;
  /** Resolves once the figures have loaded: spec 003's avatar loader; today, at once. */
  readonly figures: Promise<unknown>;
  /** Resolves once the hand-off has ended: nothing parses or swaps before it. */
  readonly handoff: Promise<unknown>;
  /** The quality controller's hold. */
  readonly hold: () => () => void;
  /** The quality level as a model decodes: 1 or more decodes its images at half size. */
  readonly level: () => number;
  /** The visit's mode, for the events. */
  readonly mode: () => Mode;
  readonly record: (event: AssetEvent) => void;
  readonly ledger: TextureLedger;
  readonly uploader: Uploader;
  /** Readies a parsed model as the room's (prepareModel). */
  readonly prepare: (piece: string, model: Object3D) => void;
  /** Shows a model in place of its piece's stand-ins, or the stand-ins again for null (showModel). */
  readonly swap: (piece: string, model: Object3D | null) => void;
}

export interface Loader {
  /** Loads each entry, as R-28 orders it; resolves once every one has settled, its hold let go. */
  load(entries: readonly ModelEntry[]): Promise<void>;
  /** Puts every swapped piece back to its stand-in at once, then loads it again: after a lost context's restore, or
   *  lookdev's scripted load. */
  reload(): Promise<void>;
  /** Puts one piece's stand-in back and releases its model; a load of it still on its way is dropped. */
  remove(piece: string): void;
  /** Fetches, parses, and swaps nothing more, and lets every hold go; each load that hadn't recorded its end is
   *  skipped, once (the room went to 2D). */
  stop(): void;
  /** The pieces showing a model. */
  readonly loaded: ReadonlySet<string>;
  /** Whether a model is fetching, parsing, swapping, or settling. */
  readonly busy: boolean;
  /** Whether a piece fell back to its stand-in, failed or skipped: the placeholder note shows (FR-057). */
  readonly fellBack: boolean;
}

/** `integrity` for a plain file's SHA-256 in hexadecimal: Subresource Integrity's `sha256-<base64>`. */
export function integrity(sha256: string): string {
  const bytes = sha256.match(/[0-9a-f]{2}/g) ?? [];
  return `sha256-${btoa(String.fromCharCode(...bytes.map((b) => parseInt(b, 16))))}`;
}

/** A model's asset name, its record's file stem, from its a/ URL; the piece's ID where the URL isn't one. */
export function assetOf(url: string, piece: string): string {
  return MODEL_URL.exec(url)?.[1] ?? piece;
}

/** The 3D part's set models as entries, in its load_order, each once, at `base` + its a/ URL (`../` from /lookdev/). */
export function modelEntries(part: Pick<RoomScene, "placements" | "switches" | "load_order">, base = ""): ModelEntry[] {
  const byId = new Map(part.placements.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: ModelEntry[] = [];
  for (const id of part.load_order) {
    let placement = byId.get(id);
    if (!placement) {
      // A switch's pose, `<switch>.<pose>`: its piece's model, where a placement shows that piece too.
      const sw = part.switches.find((s) => id.startsWith(`${s.id}.`));
      placement = sw && part.placements.find((p) => p.piece === sw.piece && p.model !== null);
    }
    const model = placement?.model;
    if (!placement || !model || !GLB_URL.test(model.url) || seen.has(placement.piece)) continue;
    seen.add(placement.piece);
    out.push({
      piece: placement.piece,
      asset: assetOf(model.url, placement.piece),
      bytes: model.bytes,
      source: { kind: "url", url: `${base}${model.url}`, sha256: model.sha256 },
    });
  }
  return out;
}

/**
 * Readies a parsed model as the room's: its lights and cameras out, its materials the look's (Materials.model), each
 * source material once and then released, its own face objects (the nodes named for its piece's live faces) hidden,
 * since the room draws the faces, and its shadows as the look casts them.
 */
export function prepareModel(
  model: Object3D,
  piece: Pick<RoomScene["pieces"][string], "faces">,
  look: Look,
  materials: Materials,
): void {
  const strip: Object3D[] = [];
  model.traverse((node) => {
    if ((node as Partial<Light>).isLight || (node as { isCamera?: boolean }).isCamera) strip.push(node);
  });
  for (const node of strip) node.removeFromParent();
  const roles = new Set(Object.keys(piece.faces));
  const made = new Map<Material, Material>();
  const looked = (source: Material): Material => {
    let material = made.get(source);
    if (!material) {
      material = materials.model(source);
      made.set(source, material);
    }
    return material;
  };
  model.traverse((node) => {
    if (roles.has(node.name)) node.visible = false;
    const mesh = node as Partial<Mesh>;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(looked) : looked(mesh.material);
    mesh.castShadow = mesh.receiveShadow = materials.shaded && look.method === "inked-cel";
  });
  for (const source of made.keys()) source.dispose();
}

/** Where a piece shows: each placement of it, and each case of a switch of it, with the stand-in each holds. */
function holders(
  room: Room3D,
  part: Pick<RoomScene, "placements" | "switches" | "figures">,
  piece: string,
): Object3D[] {
  const figures = new Set([part.figures.twin, part.figures.visitor]);
  const placed = part.placements
    .filter((p) => p.piece === piece && !figures.has(p.id))
    .flatMap((p) => {
      const node = room.placements.get(p.id);
      return node ? [node] : [];
    });
  const cases = part.switches
    .filter((s) => s.piece === piece)
    .flatMap((s) => [...(room.switches.get(s.id)?.values() ?? [])]);
  return [...placed, ...cases];
}

/**
 * Shows a model in place of its piece's stand-ins wherever the piece shows (every placement of it and every case of a
 * switch of it), the model itself under the first and a clone sharing its geometry and materials under the rest, at
 * scale 1, since the studio models a piece at its stylized scale; a placement's stand-in label hides. For null, the
 * stand-ins and labels come back. The model's resources stay the caller's to release (disposeModel).
 */
export function showModel(
  room: Room3D,
  part: Pick<RoomScene, "placements" | "switches" | "figures">,
  piece: string,
  model: Object3D | null,
): void {
  holders(room, part, piece).forEach((holder, i) => {
    for (const old of holder.children.filter((c) => c.name === MODEL_NODE)) holder.remove(old);
    const standin = holder.children.find((c) => c.name === STANDIN_NODE);
    if (standin) standin.visible = model === null;
    if (model === null) return;
    const shown = i === 0 ? model : model.clone();
    shown.name = MODEL_NODE;
    holder.add(shown);
  });
  for (const p of part.placements) {
    const label = p.piece === piece ? room.labels.get(p.id) : undefined;
    if (label) label.visible = model === null;
  }
}

/** The model's own textures, every one its materials use but a gradient map, the look's shared ramp. */
function ownTextures(material: Material): Texture[] {
  return Object.entries(material).flatMap(([key, value]) =>
    key !== "gradientMap" && (value as Partial<Texture> | null)?.isTexture ? [value as Texture] : [],
  );
}

/** Every texture a model's materials use, the ramp aside: what the ledger uploads and counts. */
function texturesOf(model: Object3D): Set<Texture> {
  const textures = new Set<Texture>();
  model.traverse((node) => {
    for (const material of ([] as Material[]).concat((node as Partial<Mesh>).material ?? []))
      for (const texture of ownTextures(material)) textures.add(texture);
  });
  return textures;
}

/** Releases a model's geometry, materials, and textures, once each, but never a material's gradient map: the look's
 *  ramp, which the stand-ins share. A texture's release takes it off the ledger. */
export function disposeModel(model: Object3D): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  model.traverse((node) => {
    const mesh = node as Partial<Mesh>;
    if (mesh.isMesh && mesh.geometry) geometries.add(mesh.geometry);
    for (const material of ([] as Material[]).concat(mesh.material ?? [])) {
      materials.add(material);
      for (const texture of ownTextures(material)) textures.add(texture);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

/** A first-come, first-served count of slots: each acquire resolves with its release, which counts once. */
function slots(count: number): () => Promise<() => void> {
  let free = count;
  const waiting: (() => void)[] = [];
  return () =>
    new Promise((resolve) => {
      const grant = (): void => {
        free -= 1;
        let done = false;
        resolve(() => {
          if (done) return;
          done = true;
          free += 1;
          waiting.shift()?.();
        });
      };
      if (free > 0 && waiting.length === 0) grant();
      else waiting.push(grant);
    });
}

/** One entry's load, from its load() call to the state it ends in. */
interface Load {
  readonly entry: ModelEntry;
  /** Its piece's token in `latest` while it is the piece's latest load. */
  readonly mine: symbol;
}

/** The room's loader. */
export function createLoader(options: LoaderOptions): Loader {
  const { clock } = options;
  const fetchSlot = slots(MAX_FETCHES);
  const parseSlot = slots(MAX_PARSES);
  /** The pieces showing a model: the entry it came from, and the model. */
  const shown = new Map<string, { readonly entry: ModelEntry; readonly model: Object3D }>();
  /** Each piece's latest load: an older one, superseded or removed, drops its model. */
  const latest = new Map<string, symbol>();
  /** What a stop must undo: fetches to abort, and settling holds to let go. */
  const aborts = new Set<AbortController>();
  const settling = new Map<number, () => void>();
  /** The loads that haven't recorded the state they end in (loaded, failed, or skipped), from their load() call on:
   *  what a stop skips. A load superseded by a newer one of its piece, or by its removal, leaves them unrecorded. */
  const pending = new Set<Load>();
  let floor: boolean | null = null;
  let stopped = false;
  let fellBack = false;
  let active = 0;

  /** A piece's older loads, superseded, record nothing more. */
  const supersede = (piece: string): void => {
    for (const load of pending) if (load.entry.piece === piece) pending.delete(load);
  };

  /** Records the state a load ends in, once, while it is pending. */
  const end = (load: Load, outcome: "loaded" | "failed" | "skipped", start: number | null): void => {
    if (pending.delete(load)) record(load.entry, outcome, start);
  };

  const record = (entry: ModelEntry, outcome: AssetOutcome, start: number | null): void => {
    if (outcome === "failed" || outcome === "skipped") fellBack = true;
    options.record(
      assetEvent({
        asset: entry.asset,
        outcome,
        ms: start === null ? 0 : clock.now() - start,
        bytes: entry.bytes,
        mode: options.mode(),
      }),
    );
  };

  /** Lets a hold go SETTLE_FRAMES frames from now, or at once on a stop. */
  const settle = (release: () => void): Promise<void> =>
    new Promise((resolve) => {
      let frames = 0;
      let id = 0;
      const done = (): void => {
        settling.delete(id);
        release();
        resolve();
      };
      const tick = (): void => {
        settling.delete(id);
        frames += 1;
        if (frames >= SETTLE_FRAMES) done();
        else {
          id = clock.requestFrame(tick);
          settling.set(id, done);
        }
      };
      if (stopped) {
        done();
        return;
      }
      id = clock.requestFrame(tick);
      settling.set(id, done);
    });

  /** One fetch of the site's file, the timeout covering its body. */
  async function fetchOnce(url: string, sha256: string): Promise<ArrayBuffer> {
    const abort = new AbortController();
    aborts.add(abort);
    let timer: number | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = clock.setTimeout(() => {
        timer = null;
        abort.abort();
        reject(new Error(`no answer within ${FETCH_TIMEOUT_MS} ms`));
      }, FETCH_TIMEOUT_MS);
    });
    const body = (async (): Promise<ArrayBuffer> => {
      const response = await options.fetch(url, {
        integrity: integrity(sha256),
        redirect: "error",
        mode: "same-origin",
        credentials: "same-origin",
        signal: abort.signal,
      });
      if (response.status !== 200) throw new Error(`answered ${response.status}`);
      return response.arrayBuffer();
    })();
    try {
      return await Promise.race([body, timeout]);
    } finally {
      if (timer !== null) clock.clearTimeout(timer);
      aborts.delete(abort);
    }
  }

  async function read(entry: ModelEntry): Promise<ArrayBuffer> {
    const { source } = entry;
    if (source.kind === "url") return fetchOnce(source.url, source.sha256);
    const data = source.read();
    if (data === null) throw new Error("the page holds no bytes for it");
    return data;
  }

  /** Parses and swaps one model under a hold, which it lets go two frames after; the state it ends in is recorded at
   *  once, so a stop in those frames finds it settled. A newer load or a removal of its piece that came first drops it. */
  async function parseAndSwap(load: Load, data: ArrayBuffer, start: number | null): Promise<void> {
    const { entry } = load;
    const releaseSlot = await parseSlot();
    const release = options.hold();
    try {
      if (stopped) return;
      const parsed = await parseModel(data, { reduced: options.level() >= 1, decode: options.decode });
      const model = parsed.gltf.scene;
      if (stopped || latest.get(entry.piece) !== load.mine) {
        parsed.close();
        disposeModel(model);
        return;
      }
      if (!options.ledger.fits(parsed.textureBytes)) {
        parsed.close();
        disposeModel(model);
        end(load, "skipped", null);
        return;
      }
      options.prepare(entry.piece, model);
      const before = shown.get(entry.piece);
      if (before) {
        options.swap(entry.piece, null);
        disposeModel(before.model);
      }
      options.swap(entry.piece, model);
      shown.set(entry.piece, { entry, model });
      options.ledger.upload(options.uploader, texturesOf(model));
      parsed.close();
      end(load, "loaded", start);
    } finally {
      releaseSlot();
      await settle(release);
    }
  }

  /** One entry through its fetch, its parse, and its swap, with one retry. */
  async function one(load: Load): Promise<void> {
    const { entry } = load;
    active += 1;
    let start: number | null = null;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (stopped) return;
        try {
          const releaseFetch = await fetchSlot();
          let data: ArrayBuffer;
          try {
            if (stopped) return;
            start ??= clock.now();
            data = await read(entry);
          } finally {
            releaseFetch();
          }
          await options.handoff;
          if (stopped) return;
          await parseAndSwap(load, data, start);
          return;
        } catch {
          if (stopped || latest.get(entry.piece) !== load.mine) return;
          if (attempt === 0) record(entry, "retried", start);
          else end(load, "failed", start);
        }
      }
    } finally {
      active -= 1;
    }
  }

  async function load(entries: readonly ModelEntry[]): Promise<void> {
    if (stopped || entries.length === 0) return;
    const mine = new Map(entries.map((e) => [e.piece, Symbol(e.piece)]));
    for (const [piece, token] of mine) {
      latest.set(piece, token);
      supersede(piece);
    }
    const loads = entries.map((entry): Load => ({ entry, mine: mine.get(entry.piece) as symbol }));
    for (const l of loads) pending.add(l);
    active += 1;
    try {
      await options.figures;
      if (stopped) return;
      floor ??= options.floor();
      if (!floor) {
        for (const l of loads) end(l, "skipped", null);
        return;
      }
      // A load superseded while it waited fetches nothing.
      await Promise.all(loads.filter((l) => pending.has(l)).map(one));
    } finally {
      active -= 1;
    }
  }

  return {
    load,
    reload() {
      const entries = [...shown.values()].map((s) => s.entry);
      for (const piece of [...shown.keys()]) take(piece);
      return load(entries);
    },
    remove(piece) {
      latest.set(piece, Symbol(piece));
      supersede(piece);
      take(piece);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const abort of aborts) abort.abort();
      aborts.clear();
      // Each settling hold let go at once, its next frame cancelled first, so no tick of it runs again.
      const holds = [...settling];
      settling.clear();
      for (const [id, letGo] of holds) {
        clock.cancelFrame(id);
        letGo();
      }
      for (const l of pending) record(l.entry, "skipped", null);
      pending.clear();
    },
    get loaded() {
      return new Set(shown.keys());
    },
    get busy() {
      return active > 0 || settling.size > 0;
    },
    get fellBack() {
      return fellBack;
    },
  };

  /** A piece's model out: its stand-ins back, its resources released. */
  function take(piece: string): void {
    const current = shown.get(piece);
    if (!current) return;
    shown.delete(piece);
    options.swap(piece, null);
    disposeModel(current.model);
  }
}
