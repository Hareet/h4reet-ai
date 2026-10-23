// The lookdev page's frame readouts (spec 004; FR-055, FR-067, SC-005, SC-006; research.md R-41; contracts/lookdev.md
// §5): "Run 2 minutes" or "Run 10 minutes" on the room's clock, measuring what §5 lists. Its own animation frames give
// the intervals: the frame time's p50 and p95 by nearest rank, the median frame rate the quality controller steps on
// (1000 ÷ the median interval, by quality.ts's own median), and the share of intervals over 33.0 ms, which a frame that
// misses one refresh of a 60 Hz display, 33.3 ms, is. Each frame it reads the page's sample, renderer.info's draw calls
// and triangles and the texture ledger's bytes, and keeps the largest of each. It counts the controller's step-downs,
// in all and while a quality hold is held or a piece loads, and the level it settles at. A run gives its readouts at its
// end, once; one stopped early gives none, so the results (§6) never come from part of a run. Every time is the
// clock's, and only durations leave the run: it reads no time of day.
// The page also reads the figures so far each second, inside the frames a run measures, so those live figures come
// from running counts and a fixed histogram of the intervals in 0.1-ms steps, each read at its step's top, so a live
// figure is within 0.1 ms of the exact one and never reads better; the exact percentiles are taken once, at the end
// (the review's page-9).
import type { Clock } from "../room/clock";
import { median } from "../room/quality";

/** A frame interval over this many milliseconds counts as over (SC-005). */
export const OVER_MS = 33;
/** The live figures' steps in a millisecond. */
const STEPS_PER_MS = 10;
/** The longest interval with a step of its own: longer ones share the last, read as the longest the run measured. */
const LIVE_MAX_MS = 1000;
/** Room for floating point at a step's edge. */
const EPS = 1e-9;
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
  /** The readouts so far, for the page's live view, cheap to read however long the run: the frame times to their
   *  0.1-ms step's top, the rest exact. The results come from `onEnd` alone, exact. */
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
  // The live figures' counts: each interval in its 0.1-ms step, those over 33 ms, and the longest.
  const steps = new Uint32Array(LIVE_MAX_MS * STEPS_PER_MS + 1);
  let over = 0;
  let longest = 0;
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
    if (last !== null) {
      const ms = time - last;
      intervals.push(ms);
      // Its step: up to 0.1 ms, as results.ts rounds a time up.
      const step = Math.min(steps.length - 1, Math.max(0, Math.ceil(ms * STEPS_PER_MS - EPS)));
      steps[step] = (steps[step] ?? 0) + 1;
      if (ms > OVER_MS) over += 1;
      longest = Math.max(longest, ms);
    }
    last = time;
    const s = options.sample();
    drawCalls = Math.max(drawCalls, s.drawCalls);
    triangles = Math.max(triangles, s.triangles);
    textureBytes = Math.max(textureBytes, s.textureBytes);
    frame = clock.requestFrame(tick);
  };

  /** The interval at a rank, 1 for the shortest, to its step's top: the last step's is the longest measured. */
  const atRank = (rank: number): number => {
    let seen = 0;
    for (let step = 0; step < steps.length; step += 1) {
      seen += steps[step] ?? 0;
      if (seen >= rank) return step === steps.length - 1 ? longest : step / STEPS_PER_MS;
    }
    return longest;
  };

  /** §5's frame figures so far from the counts, with no copy or sort of the intervals. */
  const liveFrames = (): FrameStats => {
    const n = intervals.length;
    if (n === 0) return frameStats([]);
    const rank = (percent: number): number => Math.max(1, Math.ceil((percent * n) / 100));
    const middle = n % 2 === 1 ? atRank((n + 1) / 2) : (atRank(n / 2) + atRank(n / 2 + 1)) / 2;
    return {
      count: n,
      p50Ms: atRank(rank(50)),
      p95Ms: atRank(rank(95)),
      medianFps: middle > 0 ? 1000 / middle : 0,
      over33Share: over / n,
    };
  };

  const readouts = (frames: FrameStats): RunReadouts => ({
    seconds,
    frames,
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
    options.onEnd(readouts(frameStats(intervals)));
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
    readouts: () => readouts(liveFrames()),
    stop: halt,
    get running() {
      return running;
    },
  };
}
