// T123 (spec 004; FR-067, SC-005, SC-006; research.md R-41; contracts/lookdev.md §5): the lookdev page's frame
// readouts, from frame intervals scripted on the room's FakeClock: the frame time's p50 and p95 by nearest rank, the
// median frame rate (1000 ÷ the median interval, by the quality controller's own median), the share of intervals over
// 33.0 ms, the settled level and the step-downs in all and while a hold is held or a piece loads, and the largest draw
// calls, triangles, and texture memory any frame reported. A run ends at its 120 or 600 seconds on the clock, and one
// stopped early gives nothing. The run reads only the clock: no Date, and no performance.now().
import { afterEach, describe, expect, it, vi } from "vitest";

import { OVER_MS, RUN_SECONDS, frameStats, nearestRank, startRun } from "../../src/lookdev/metrics";
import type { FrameSample, RunOptions, RunReadouts } from "../../src/lookdev/metrics";
import { median } from "../../src/room/quality";
import { FakeClock } from "../helpers/room";

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE: FrameSample = { drawCalls: 10, triangles: 1000, textureBytes: 5000 };

/** A run on `clock`, recording what it ends with; `busy` and `sample` as the test sets them. */
function run(
  clock: FakeClock,
  options: Partial<Omit<RunOptions, "clock" | "onEnd">> = {},
): { ended: { at: number; readouts: RunReadouts }[]; handle: ReturnType<typeof startRun> } {
  const ended: { at: number; readouts: RunReadouts }[] = [];
  const handle = startRun({
    clock,
    seconds: 120,
    level: 0,
    sample: () => SAMPLE,
    busy: () => false,
    ...options,
    onEnd: (readouts) => ended.push({ at: clock.now(), readouts }),
  });
  return { ended, handle };
}

/** The run's first frame `first` ms in, then a frame after each interval: one frame each, on the clock. */
function frames(clock: FakeClock, intervals: readonly number[], first = 10): void {
  clock.advance(first, first);
  for (const ms of intervals) clock.advance(ms, ms);
}

/** The clock moved to `at` ms after `start` with no frame on the way, so only the run's end can fall due. */
function until(clock: FakeClock, start: number, at: number): void {
  clock.advance(start + at - clock.now(), Number.MAX_SAFE_INTEGER);
}

describe("the frame readouts (contracts/lookdev.md §5)", () => {
  it("take p50 and p95 by nearest rank, the ⌈p · n / 100⌉-th interval in order, never between two", () => {
    const four = frameStats([40, 10, 30, 20]);
    expect([four.p50Ms, four.p95Ms]).toEqual([20, 40]);
    const twenty = frameStats([...new Array<number>(18).fill(16), 50, 40]);
    expect([twenty.p50Ms, twenty.p95Ms]).toEqual([16, 40]);
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect([nearestRank(sorted, 50), nearestRank(sorted, 95)]).toEqual([50, 95]);
    expect([nearestRank([1, 2, 3, 4, 5, 6, 7], 50), nearestRank([1, 2, 3, 4, 5, 6, 7], 95)]).toEqual([4, 7]);
    expect(nearestRank([7], 50)).toBe(7);
  });

  it("give the median frame rate as 1000 ÷ the median interval, the quality controller's own measure", () => {
    // The median of an even count is its middle two's mean, as the controller takes it: 25 ms, so 40 frames a second.
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(frameStats([10, 20, 30, 40]).medianFps).toBe(40);
    expect(frameStats([16, 16, 17, 100, 15]).medianFps).toBe(62.5);
  });

  it("count the share of intervals over 33.0 ms, a frame that misses one 60 Hz refresh among them", () => {
    expect(OVER_MS).toBe(33);
    expect(frameStats([33, 33.3, 16.7, 16.7]).over33Share).toBe(0.25);
    expect(frameStats([33, 33, 32.9, 16.7]).over33Share).toBe(0);
    expect(frameStats([...new Array<number>(18).fill(16.7), 33.4, 50]).over33Share).toBe(0.1);
  });

  it("give zeros, not a division by nothing, when no interval was measured", () => {
    expect(frameStats([])).toEqual({ count: 0, p50Ms: 0, p95Ms: 0, medianFps: 0, over33Share: 0 });
  });
});

describe("a run on the room's clock", () => {
  it("measures the intervals between its animation frames, exactly the ones scripted", () => {
    const clock = new FakeClock();
    const { ended } = run(clock);
    // Whole milliseconds, so the clock's sums stay exact.
    const intervals = [17, 16, 17, 33, 34, 16, 50, 17, 17, 100, 16];
    frames(clock, intervals);
    until(clock, 0, 120_000);
    expect(ended).toHaveLength(1);
    expect(ended[0]?.readouts.frames).toEqual(frameStats(intervals));
    expect(ended[0]?.readouts.frames).toEqual({
      count: 11,
      p50Ms: 17,
      p95Ms: 100,
      medianFps: 1000 / 17,
      over33Share: 3 / 11,
    });
  });

  it("ends at its 120 or 600 seconds on the clock, once, and asks for no frame after", () => {
    expect(RUN_SECONDS).toEqual([120, 600]);
    for (const seconds of RUN_SECONDS) {
      const clock = new FakeClock();
      clock.advance(5_000);
      const start = clock.now();
      const { ended, handle } = run(clock, { seconds });
      expect(handle.running).toBe(true);
      clock.advance(seconds * 1000 - 1, 100);
      expect(ended, `${seconds} s`).toEqual([]);
      clock.advance(1, 100);
      expect(ended.map((e) => [e.at - start, e.readouts.seconds])).toEqual([[seconds * 1000, seconds]]);
      // A frame every 100 ms from the first, at 100 ms: one interval fewer than frames.
      expect(ended[0]?.readouts.frames.count).toBe(seconds * 10 - 2);
      expect([handle.running, clock.pendingFrames, clock.pendingTimers]).toEqual([false, 0, 0]);
      clock.advance(60_000, 100);
      expect(ended).toHaveLength(1);
    }
  });

  it("gives nothing when stopped early, and stops asking for frames", () => {
    const clock = new FakeClock();
    const { ended, handle } = run(clock);
    clock.advance(119_000, 16);
    handle.stop();
    expect([handle.running, clock.pendingFrames, clock.pendingTimers]).toEqual([false, 0, 0]);
    clock.advance(600_000, 16);
    expect(ended).toEqual([]);
  });

  it("settles at the controller's last level, counting its step-downs, in all and while a hold is held or a piece loads", () => {
    const clock = new FakeClock();
    let busy = false;
    const { ended, handle } = run(clock, { busy: () => busy });
    frames(clock, [16, 16, 16]);
    handle.quality(1);
    busy = true;
    frames(clock, [40, 40], 40);
    handle.quality(2);
    handle.quality(2);
    busy = false;
    handle.quality(3);
    expect(handle.readouts()).toMatchObject({ settled: 3, stepDowns: 3, stepDownsWhileLoading: 1 });
    until(clock, 0, 120_000);
    expect(ended[0]?.readouts).toMatchObject({ settled: 3, stepDowns: 3, stepDownsWhileLoading: 1 });
    // After its end, a level the page reports changes nothing.
    handle.quality(2);
    handle.quality(3);
    expect(handle.readouts()).toMatchObject({ settled: 3, stepDowns: 3, stepDownsWhileLoading: 1 });
  });

  it("starts at the level it is given, as a pinned run holds it, with no step-down", () => {
    const clock = new FakeClock();
    const { ended } = run(clock, { level: 2 });
    frames(clock, [16, 16]);
    until(clock, 0, 120_000);
    expect(ended[0]?.readouts).toMatchObject({ settled: 2, stepDowns: 0, stepDownsWhileLoading: 0 });
  });

  it("keeps the largest draw calls, triangles, and texture memory any frame reported", () => {
    const clock = new FakeClock();
    const reported: FrameSample[] = [
      { drawCalls: 120, triangles: 30_000, textureBytes: 10_000_000 },
      { drawCalls: 180, triangles: 25_000, textureBytes: 10_000_000 },
      { drawCalls: 90, triangles: 41_000, textureBytes: 12_500_000 },
      { drawCalls: 100, triangles: 20_000, textureBytes: 96_000_000 },
      { drawCalls: 60, triangles: 10_000, textureBytes: 1_000_000 },
    ];
    let i = 0;
    const { ended } = run(clock, { sample: () => reported[Math.min(i++, reported.length - 1)] ?? SAMPLE });
    frames(clock, [16, 16, 16, 16]);
    until(clock, 0, 120_000);
    expect(ended[0]?.readouts).toMatchObject({ drawCalls: 180, triangles: 41_000, textureBytes: 96_000_000 });
  });

  it("reads no time of day: neither Date nor performance.now()", () => {
    const now = vi.spyOn(Date, "now");
    const performanceNow = vi.spyOn(performance, "now");
    const clock = new FakeClock();
    const { ended } = run(clock);
    frames(clock, [16, 16, 16]);
    until(clock, 0, 120_000);
    expect(ended).toHaveLength(1);
    expect([now.mock.calls.length, performanceNow.mock.calls.length]).toEqual([0, 0]);
  });
});
