// The room's modes and quality (spec 002, FR-042, FR-048; contracts/room-scene.md §4; research.md R-04). One
// controller for spec 002's targets and spec 003's floor:
// - while the 5-second median frame rate is below the device's target (30 on a touch-primary device, 60 otherwise),
//   it steps quality down one level per window, 0 → 1 → 2 → 3;
// - at quality 3, below 24 frames a second for 5 s, it switches to the 2D drawing;
// - it never steps back up during a visit.
// Also here: the WebGL 2 check, which runs before the 3D chunk is imported (a device without WebGL 2 never downloads
// it), and the lost-context watch, which allows one restore.
//
// Spec 004 (FR-055, FR-056; Amendment B13; research.md R-28, R-35) adds the holds: while pieces parse and swap, and
// while a lost context comes back, frames don't count, and the window restarts when the last hold is released, so the
// room never steps down because pieces are loading; and capability(), which reads what ADR 0010's floor for studio
// models asks of the device.
import type { Mode } from "../choice/visit";
import type { Clock } from "./clock";

export const FRAME_WINDOW_MS = 5000;
export const FLOOR_FPS = 24;
export const MAX_QUALITY = 3;
/**
 * A median within 10% of the target holds it. Animation frames' times jitter around the display's refresh, and a
 * missed frame at the target's rate is a whole refresh late (33 ms at 60 Hz), so the tolerance never hides a miss
 * (plan.md §4, "What group 4 found").
 */
export const TARGET_TOLERANCE = 0.9;
/**
 * How long the room waits, after "Enter", for the 3D chunk it began importing behind the choice: then it goes to 2D,
 * so a stalled download can't hold the hand-off back (SC-005). A late chunk is ignored: the mode never moves back up.
 */
export const SCENE_WAIT_MS = 4000;
/** How long a lost WebGL context has to come back before the room switches to 2D. */
export const CONTEXT_RESTORE_MS = 3000;
/**
 * How many frames a hold outlasts the work it covers: a swap's or a restore's uploads and recompiles land in the first
 * frame after it, so the hold is released at the second (R-28, R-35).
 */
export const SETTLE_FRAMES = 2;

export type FlatReason = "no_webgl2" | "load_failed" | "load_timeout" | "frame_floor" | "context_lost" | "visitor";

export function targetFps(touchPrimary: boolean): 30 | 60 {
  return touchPrimary ? 30 : 60;
}

export interface QualityController {
  /** One rendered frame, at its time in milliseconds. */
  frame(time: number): void;
  /** Switches to 2D for the reason given, once; frames after that are ignored. */
  toFlat(reason: FlatReason): void;
  /**
   * The page was hidden (a background tab, a locked phone): the next frame starts a new window, so the time away
   * isn't counted as one slow frame. A long gap on a visible page is a slow frame, and counts.
   */
  restart(): void;
  /**
   * Holds the controller while pieces load or a lost context comes back (FR-055): frames are ignored until the last
   * hold is released, and the next frame starts a new window. Holds are counted; each returns its release, which
   * counts once however often it's called.
   */
  hold(): () => void;
  readonly quality: number;
  readonly mode: Mode;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function createQualityController(options: {
  target: number;
  onQuality(level: number): void;
  onFlat(reason: FlatReason): void;
}): QualityController {
  let quality = 0;
  let flat = false;
  let holds = 0;
  let last: number | null = null;
  let windowStart = 0;
  let intervals: number[] = [];

  const toFlat = (reason: FlatReason): void => {
    if (flat) return;
    flat = true;
    options.onFlat(reason);
  };

  return {
    frame(time) {
      if (flat || holds > 0) return;
      if (last === null) {
        last = time;
        windowStart = time;
        intervals = [];
        return;
      }
      intervals.push(time - last);
      last = time;
      if (time - windowStart < FRAME_WINDOW_MS) return;
      const fps = 1000 / median(intervals);
      windowStart = time;
      intervals = [];
      if (quality < MAX_QUALITY) {
        if (fps < options.target * TARGET_TOLERANCE) {
          quality += 1;
          options.onQuality(quality);
        }
      } else if (fps < FLOOR_FPS) {
        toFlat("frame_floor");
      }
    },
    toFlat,
    restart() {
      last = null;
    },
    hold() {
      holds += 1;
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holds -= 1;
        if (holds === 0) last = null;
      };
    },
    get quality() {
      return quality;
    },
    get mode(): Mode {
      if (flat) return "2d";
      return quality === 0 ? "3d" : "reduced";
    },
  };
}

/**
 * A WebGL 2 context made as the room makes it, without a major performance caveat (a software renderer can't hold the
 * frame rates), read, and released at once; null without one, or when asking throws.
 */
function probeWebGL2<T>(doc: Document, read: (gl: WebGL2RenderingContext) => T): T | null {
  try {
    const gl = doc.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return null;
    try {
      return read(gl);
    } finally {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    return null;
  }
}

/** Whether the device can render the room in 3D: a WebGL 2 context, released at once. Runs before the 3D chunk. */
export function hasWebGL2(doc: Document): boolean {
  return probeWebGL2(doc, () => true) ?? false;
}

/** What the room reads of the device before it loads studio models (R-28). */
export interface Capability {
  readonly webgl2: boolean;
  /** The context's MAX_TEXTURE_SIZE, or 0 without WebGL 2. */
  readonly maxTextureSize: number;
  /** `navigator.deviceMemory` in gigabytes, or null where the browser doesn't give it. */
  readonly deviceMemory: number | null;
}

/** ADR 0010's proposed capability floor for studio models (R-28). */
export const MODEL_FLOOR = { deviceMemory: 4, maxTextureSize: 4096 } as const;

/** Spec 002's WebGL 2 check, reading the largest texture side before it releases its context, and the device memory. */
export function capability(win: Window): Capability {
  const probe = probeWebGL2(win.document, (gl) => ({ max: gl.getParameter(gl.MAX_TEXTURE_SIZE) as unknown }));
  const memory = (win.navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
  return {
    webgl2: probe !== null,
    maxTextureSize: typeof probe?.max === "number" ? probe.max : 0,
    deviceMemory: typeof memory === "number" && Number.isFinite(memory) ? memory : null,
  };
}

/**
 * Whether studio models may load here: ADR 0010's floor, "WebGL2; where the browser reports it,
 * `navigator.deviceMemory` of at least 4; and a maximum texture size of at least 4096" (contracts/lookdev.md §7.2).
 * Below it every model is skipped, and the stand-ins stay (FR-056).
 */
export function meetsModelFloor(c: Capability): boolean {
  return (
    c.webgl2 &&
    c.maxTextureSize >= MODEL_FLOOR.maxTextureSize &&
    (c.deviceMemory === null || c.deviceMemory >= MODEL_FLOOR.deviceMemory)
  );
}

/** What watchContext takes beyond its canvas. */
export interface WatchOptions {
  /** How long a lost context has to come back; CONTEXT_RESTORE_MS by default. */
  readonly waitMs?: number;
  /** The quality controller's hold: taken when the context is lost, released SETTLE_FRAMES after it's restored. */
  readonly hold?: () => () => void;
}

/**
 * Watches a canvas's WebGL context: on its first loss the room waits CONTEXT_RESTORE_MS for it to come back (Three.js
 * restores what it drew); if it doesn't, or it is lost again after one restore, `onFail` switches the room to 2D, once.
 * Given the controller's hold, it holds from the loss until the restore's own work is drawn (R-35).
 */
export function watchContext(
  canvas: EventTarget,
  clock: Clock,
  onFail: () => void,
  options: WatchOptions = {},
): () => void {
  const waitMs = options.waitMs ?? CONTEXT_RESTORE_MS;
  let restoredOnce = false;
  let failed = false;
  let timer: number | null = null;
  let release: (() => void) | null = null;
  let settling: number | null = null;
  const letGo = (): void => {
    if (settling !== null) clock.cancelFrame(settling);
    settling = null;
    release?.();
    release = null;
  };
  const fail = (): void => {
    if (failed) return;
    failed = true;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    letGo();
    onFail();
  };
  const lost = (event: Event): void => {
    event.preventDefault();
    if (restoredOnce) fail();
    else if (timer === null) {
      timer = clock.setTimeout(fail, waitMs);
      release ??= options.hold?.() ?? null;
    }
  };
  const restored = (): void => {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
    restoredOnce = true;
    if (release === null) return;
    let frames = 0;
    const settle = (): void => {
      frames += 1;
      if (frames < SETTLE_FRAMES) settling = clock.requestFrame(settle);
      else {
        settling = null;
        letGo();
      }
    };
    settling = clock.requestFrame(settle);
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  return () => {
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    letGo();
  };
}
