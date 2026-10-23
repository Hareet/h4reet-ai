// Spec 003's asset events, built and switched off (spec 004; FR-071; Amendment C11; research.md R-60;
// contracts/room-live-state-telemetry.md §3, data-model.md §11.5; spec 003's contracts/asset-events.md §1). When a
// studio model loads, retries, fails, or is skipped, the room's loader records one event, `{asset, outcome, ms_bucket,
// bytes, mode}`: `asset` its record's file name without the extension, which is its piece's ID; `ms_bucket` the time
// from the first fetch's start to the swap or the failure, `<250` for a skip; `bytes` the length of the .glb.gz the
// site sends, for `loaded` alone (C11); and `mode` spec 003's names, spec 002's `3d` reading `full`.
// - An event is made from those five fields alone, so nothing else a caller holds (a URL, a visit, a time) rides along,
//   and one outside spec 003's schema, which the relay would refuse, is dropped.
// - The queue is page memory: at most 64 events, a full queue drops new ones, and the queue goes with the page.
// - While the index's `live.asset_events` is `off`, the default until spec 001 carries the route with row V6, nothing
//   is sent, by the page's fetch, its beacon, or any other way. In a drafts build the lookdev page hands the module
//   its log, which shows each event, those a full queue dropped among them.
// - While it is `site`, spec 003's batcher: a batch goes 10 seconds after its first event, so posts are at least 10
//   seconds apart, each `POST /api/events` carrying at most 20 events; when the page hides, one navigator.sendBeacon
//   carries at most 20 more, once until the page shows again. Both send `{"events": [...]}` as text, which a beacon
//   sends as text/plain;charset=UTF-8 (spec 002's own beacon does the same), with no cookie. A failed send is dropped:
//   never retried, put back, or stored.
// Wiring it into the room, the loader's events and the page's visibility, is T134's (app.ts and scene.ts).
import type { Mode } from "./choice/visit";
import type { Clock } from "./room/clock";
import type { LiveSwitch } from "./room/compose/vocabulary";

export const ASSET_EVENTS_URL = "/api/events";
/** The most events page memory holds. */
export const QUEUE_MAX = 64;
/** The most events one request carries. */
export const BATCH_MAX = 20;
/** The least time between two posts, and from a batch's first event to its post. */
export const SEND_EVERY_MS = 10_000;

export const ASSET_OUTCOMES = ["loaded", "retried", "failed", "skipped"] as const;
export const MS_BUCKETS = ["<250", "<1000", "<3000", "<10000", ">=10000"] as const;
export const ASSET_MODES = ["full", "reduced", "2d"] as const;

export type AssetOutcome = (typeof ASSET_OUTCOMES)[number];
export type MsBucket = (typeof MS_BUCKETS)[number];
export type AssetMode = (typeof ASSET_MODES)[number];

/** Spec 003's asset event, as its contract's §1 gives it. */
export interface AssetEvent {
  readonly asset: string;
  readonly outcome: AssetOutcome;
  readonly ms_bucket: MsBucket;
  readonly bytes: number;
  readonly mode: AssetMode;
}

/** A record's file name without its extension: lowercase letters and digits in runs joined by single hyphens. */
const ASSET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_ID_MAX = 64;

/** Each bucket below the last, by the time it stays under, in milliseconds. */
const BUCKET_EDGES: readonly (readonly [number, MsBucket])[] = [
  [250, "<250"],
  [1000, "<1000"],
  [3000, "<3000"],
  [10_000, "<10000"],
];

/** A load's time, in its bucket. */
export function msBucket(ms: number): MsBucket {
  for (const [edge, bucket] of BUCKET_EDGES) if (ms < edge) return bucket;
  return ">=10000";
}

/** The visit's display mode by spec 003's name for it. */
export function assetMode(mode: Mode): AssetMode {
  return mode === "3d" ? "full" : mode;
}

/** One load's event: the bucket of its time (`<250` for a skip), its bytes for `loaded` alone, and its mode's name. */
export function assetEvent(load: {
  readonly asset: string;
  readonly outcome: AssetOutcome;
  readonly ms: number;
  readonly bytes: number;
  readonly mode: Mode;
}): AssetEvent {
  return {
    asset: load.asset,
    outcome: load.outcome,
    ms_bucket: load.outcome === "skipped" ? "<250" : msBucket(load.ms),
    bytes: load.outcome === "loaded" ? load.bytes : 0,
    mode: assetMode(load.mode),
  };
}

const among = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/** The event made from its five fields alone, or null where one falls outside spec 003's schema. */
function fromFields(event: AssetEvent): AssetEvent | null {
  const { asset, outcome, ms_bucket: bucket, bytes, mode } = event;
  if (typeof asset !== "string" || asset.length > ASSET_ID_MAX || !ASSET_ID.test(asset)) return null;
  if (!among(ASSET_OUTCOMES, outcome) || !among(MS_BUCKETS, bucket) || !among(ASSET_MODES, mode)) return null;
  if (!Number.isSafeInteger(bytes) || bytes < 0) return null;
  return { asset, outcome, ms_bucket: bucket, bytes, mode };
}

export interface AssetEventsOptions {
  /** The index's `live.asset_events`. */
  readonly live: LiveSwitch;
  readonly clock: Clock;
  /** The page's fetch, which posts the batches while `site`. */
  readonly fetch?: (url: string, init: RequestInit) => Promise<unknown>;
  /** The page's navigator, whose beacon goes when the page hides while `site`. */
  readonly nav?: Pick<Navigator, "sendBeacon">;
  /** The lookdev page's log, in a drafts build: shown each event recorded. */
  readonly log?: (event: AssetEvent) => void;
}

export interface AssetEvents {
  /** Queues an event and shows it in the log; drops it when it falls outside spec 003's schema or the queue is full. */
  record(event: AssetEvent): void;
  /** The page hid: while `site`, one beacon of at most 20 queued events, once until it shows again. */
  hide(): void;
  /** The page is shown again. */
  show(): void;
  /** The events waiting, oldest first. */
  readonly queued: readonly AssetEvent[];
  /** The page is going: nothing more is queued or sent. */
  stop(): void;
}

/** The room's asset events: queued, and sent only while `live.asset_events` is `site`. */
export function createAssetEvents(options: AssetEventsOptions): AssetEvents {
  const sending = options.live === "site";
  const queue: AssetEvent[] = [];
  let timer: number | null = null;
  let hidden = false;
  let stopped = false;

  const body = (batch: readonly AssetEvent[]): string => JSON.stringify({ events: batch });

  /** One POST, whose answer is never read: a failed send is dropped. */
  const post = (batch: readonly AssetEvent[]): void => {
    if (options.fetch === undefined) return;
    const init: RequestInit = {
      method: "POST",
      body: body(batch),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    };
    try {
      Promise.resolve(options.fetch(ASSET_EVENTS_URL, init)).catch(() => undefined);
    } catch {
      // Refused before it was sent, like a failed send: dropped.
    }
  };

  const schedule = (): void => {
    if (!sending || stopped || timer !== null || queue.length === 0) return;
    timer = options.clock.setTimeout(flush, SEND_EVERY_MS);
  };

  function flush(): void {
    timer = null;
    const batch = queue.splice(0, BATCH_MAX);
    if (batch.length > 0) post(batch);
    schedule();
  }

  return {
    record(event) {
      if (stopped) return;
      const made = fromFields(event);
      if (made === null) return;
      options.log?.(made);
      if (queue.length >= QUEUE_MAX) return;
      queue.push(made);
      schedule();
    },
    hide() {
      if (!sending || stopped || hidden) return;
      hidden = true;
      const batch = queue.splice(0, BATCH_MAX);
      if (batch.length === 0) return;
      try {
        options.nav?.sendBeacon(ASSET_EVENTS_URL, body(batch));
      } catch {
        // Refused, like a false return: the events are gone.
      }
    },
    show() {
      hidden = false;
    },
    get queued() {
      return [...queue];
    },
    stop() {
      stopped = true;
      if (timer !== null) options.clock.clearTimeout(timer);
      timer = null;
    },
  };
}
