// The room's modes and quality (spec 002, FR-042, FR-048; contracts/room-scene.md §4; research.md R-04). One
// controller for spec 002's targets and spec 003's floor:
// - while the 5-second median frame rate is below the device's target (30 on a touch-primary device, 60 otherwise),
//   it steps quality down one level per window, 0 → 1 → 2 → 3;
// - at quality 3, below 24 frames a second for 5 s, it switches to the 2D drawing;
// - it never steps back up during a visit.
// Also here: the WebGL 2 check, which runs before the 3D chunk is imported (a device without WebGL 2 never downloads
// it), and the lost-context watch, which allows one restore.
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
/** A gap between frames longer than this is a pause (a hidden tab, a locked phone), not a slow frame. */
export const PAUSE_MS = 1000;
/** How long a lost WebGL context has to come back before the room switches to 2D. */
export const CONTEXT_RESTORE_MS = 3000;

export type FlatReason = "no_webgl2" | "load_failed" | "frame_floor" | "context_lost" | "visitor";

export function targetFps(touchPrimary: boolean): 30 | 60 {
  return touchPrimary ? 30 : 60;
}

export interface QualityController {
  /** One rendered frame, at its time in milliseconds. */
  frame(time: number): void;
  /** Switches to 2D for the reason given, once; frames after that are ignored. */
  toFlat(reason: FlatReason): void;
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
      if (flat) return;
      if (last === null || time - last > PAUSE_MS) {
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
 * Whether the device can render the room in 3D: a WebGL 2 context without a major performance caveat (a software
 * renderer can't hold the frame rates). The context it makes is released at once. Runs before the 3D chunk loads.
 */
export function hasWebGL2(doc: Document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Watches a canvas's WebGL context: on its first loss the room waits CONTEXT_RESTORE_MS for it to come back (Three.js
 * restores what it drew); if it doesn't, or it is lost again after one restore, `onFail` switches the room to 2D, once.
 */
export function watchContext(
  canvas: EventTarget,
  clock: Clock,
  onFail: () => void,
  waitMs: number = CONTEXT_RESTORE_MS,
): () => void {
  let restoredOnce = false;
  let failed = false;
  let timer: number | null = null;
  const fail = (): void => {
    if (failed) return;
    failed = true;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    onFail();
  };
  const lost = (event: Event): void => {
    event.preventDefault();
    if (restoredOnce) fail();
    else if (timer === null) timer = clock.setTimeout(fail, waitMs);
  };
  const restored = (): void => {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
    restoredOnce = true;
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  return () => {
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
}
