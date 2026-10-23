// The lookdev page's frame readouts (spec 004; FR-055, FR-067, SC-005, SC-006; research.md R-41; contracts/lookdev.md
// §5): "Run 2 minutes" or "Run 10 minutes" on the room's clock, measuring what §5 lists. Its own animation frames give
// the intervals: the frame time's p50 and p95 by nearest rank, the median frame rate the quality controller steps on
// (1000 ÷ the median interval, by quality.ts's own median), and the share of intervals over 33.0 ms, which a frame that
// misses one refresh of a 60 Hz display, 33.3 ms, is. Each frame it reads the page's sample, renderer.info's draw calls
// and triangles and the texture ledger's bytes, and keeps the largest of each. It counts the controller's step-downs,
// in all and while a quality hold is held or a piece loads, and the level it settles at. A run gives its readouts at its
// end, once; one stopped early gives none, so the results (§6) never come from part of a run. Every time is the
// clock's, and only durations leave the run: it reads no time of day.
import type { Clock } from "../room/clock";
import { median } from "../room/quality";

/** A frame interval over this many milliseconds counts as over (SC-005). */
export const OVER_MS = 33;
/** SC-005's visit and soak, in seconds. */
export const RUN_SECONDS = [120, 600] as const;
export type RunSeconds = (typeof RUN_SECONDS)[number];

/** What one frame drew: renderer.info's draw calls and triangles, and the texture ledger's bytes (FR-053). */
export interface FrameSample {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textureBytes: number;
}

/** §5's frame figures, unrounded: the results round them (results.ts). */
export interface FrameStats {
  /** The intervals measured, one for each frame after the first. */
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  /** 1000 ÷ the median interval. */
  readonly medianFps: number;
  /** The intervals over 33.0 ms, over all of them. */
  readonly over33Share: number;
}

/** The value at nearest rank `percent` of an ascending list: its ⌈percent · n ÷ 100⌉-th, never between two. */
export function nearestRank(sorted: readonly number[], percent: number): number {
  const rank = Math.max(1, Math.ceil((percent * sorted.length) / 100));
  return sorted[Math.min(rank, sorted.length) - 1] ?? 0;
}

/** §5's frame figures over a run's intervals; zeros where there are none. */
export function frameStats(intervals: readonly number[]): FrameStats {
  if (intervals.length === 0) return { count: 0, p50Ms: 0, p95Ms: 0, medianFps: 0, over33Share: 0 };
  const sorted = [...intervals].sort((a, b) => a - b);
  const middle = median(sorted);
  return {
    count: sorted.length,
    p50Ms: nearestRank(sorted, 50),
    p95Ms: nearestRank(sorted, 95),
    medianFps: middle > 0 ? 1000 / middle : 0,
    over33Share: sorted.filter((ms) => ms > OVER_MS).length / sorted.length,
  };
}

/** What a run measured. */
export interface RunReadouts {
  readonly seconds: RunSeconds;
  readonly frames: FrameStats;
  /** The quality level at the run's end: the controller's, or the pinned one. */
  readonly settled: number;
  readonly stepDowns: number;
  /** Those while a quality hold was held or a piece was loading. */
  readonly stepDownsWhileLoading: number;
  /** The largest any frame reported. */
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textureBytes: number;
}

export interface RunOptions {
  readonly clock: Clock;
  readonly seconds: RunSeconds;
  /** The quality level as the run starts: the controller's, or the level a pinned run holds. */
  readonly level: number;
  /** Read each frame: what the frame drew. */
  sample(): FrameSample;
  /** Read at each step-down: whether a quality hold is held or a piece is loading. */
  busy(): boolean;
  /** At the run's end, once; never for a run stopped early. */
  onEnd(readouts: RunReadouts): void;
}

export interface Run {
  /** The controller's level changed, through its onQuality: a rise is a step down. */
  quality(level: number): void;
  /** The readouts so far, for the page's live view; the results come from `onEnd` alone. */
  readouts(): RunReadouts;
  /** Stops the run early: it gives no readouts. */
  stop(): void;
  /** Neither ended nor stopped. */
  readonly running: boolean;
}

/** Starts a run on `options.clock`: its first frame, then one each frame, until its seconds are up or it's stopped. */
export function startRun(options: RunOptions): Run {
  const { clock, seconds } = options;
  const intervals: number[] = [];
  let last: number | null = null;
  let level = options.level;
  let stepDowns = 0;
  let whileLoading = 0;
  let drawCalls = 0;
  let triangles = 0;
  let textureBytes = 0;
  let running = true;
  let frame: number | null = null;
  let timer: number | null = null;

  const tick = (time: number): void => {
    frame = null;
    if (!running) return;
    if (last !== null) intervals.push(time - last);
    last = time;
    const s = options.sample();
    drawCalls = Math.max(drawCalls, s.drawCalls);
    triangles = Math.max(triangles, s.triangles);
    textureBytes = Math.max(textureBytes, s.textureBytes);
    frame = clock.requestFrame(tick);
  };

  const readouts = (): RunReadouts => ({
    seconds,
    frames: frameStats(intervals),
    settled: level,
    stepDowns,
    stepDownsWhileLoading: whileLoading,
    drawCalls,
    triangles,
    textureBytes,
  });

  const halt = (): void => {
    running = false;
    if (frame !== null) clock.cancelFrame(frame);
    if (timer !== null) clock.clearTimeout(timer);
    frame = null;
    timer = null;
  };

  frame = clock.requestFrame(tick);
  timer = clock.setTimeout(() => {
    timer = null;
    halt();
    options.onEnd(readouts());
  }, seconds * 1000);

  return {
    quality(next) {
      if (!running) return;
      if (next > level) {
        stepDowns += next - level;
        if (options.busy()) whileLoading += next - level;
      }
      level = next;
    },
    readouts,
    stop: halt,
    get running() {
      return running;
    },
  };
}
