// The allocation and timing measure of spec 026's benches (FR-027, SC-007; plan.md R-04), shared by pet-bench.test.ts
// and pet-bench-real.test.ts (rework3-026: the real adapters' case in a file of its own, so its director's functions
// carry no V8 feedback from the fakes' directors; the page has one director). Moved here unchanged from
// pet-bench.test.ts. The measure: V8's heap in use across many calls, after a warm-up and a full collection; a call
// that makes one object adds 12 bytes or more.
import v8 from "node:v8";
import vm from "node:vm";

import { expect } from "vitest";

v8.setFlagsFromString("--expose-gc");
export const gc = vm.runInNewContext("gc") as () => void;
// The measure is of the code the page runs once it is hot: V8's optimized code, which keeps fractions unboxed. Code not
// yet optimized boxes them, and under load the optimizing compiler, on a thread of its own, can finish late, so the
// warm-up runs until the functions measured are optimized, read through V8's own status (a test-only flag).
v8.setFlagsFromString("--allow-natives-syntax");
const status = new Function("f", "return %GetOptimizationStatus(f);") as (f: unknown) => number;
/** V8's status bit for a function its optimizing compiler, TurboFan, has compiled. */
const TURBOFANNED = 1 << 6;
/** V8's status bit for a function asked to be compiled by TurboFan on its next call of its own (rework4-026). */
const MARKED = 1 << 8;
/** Asks TurboFan to compile a function on its next call of its own, synchronously, before that call runs. */
const markForTurbofan = new Function("f", "%PrepareFunctionForOptimization(f); %OptimizeFunctionOnNextCall(f);") as (
  f: unknown,
) => void;

export const FRAMES = 20_000;
/** Below one object a frame (12 bytes or more), above the measure's noise. */
export const MAX_BYTES_PER_FRAME = 8;
/** Below one object a petting: a step that is a whole petting makes none. */
export const MAX_BYTES_PER_PETTING = 12;
/** The bench's own limit: its warm-ups run the measured step at least 20 passes and up to 100, until V8 optimizes it
 *  (rv-rework2-026's nit 3), and under load the eight `pet-*` files together took 63 s, over vitest's 60 s a test
 *  (rv-rework-026's nit 5). */
export const BENCH_TIMEOUT_MS = 300_000;
/** FR-027's bound on the reach's cost a frame, in milliseconds. */
export const MAX_MS_PER_FRAME = 0.1;

/** Warm-up passes before any measure, past `hot`'s optimization: the functions a petting calls once (its end, its
 *  return to idle, the selection's checks) tier up through V8's lower tiers, which box fractions, after the frame does;
 *  measured on the first pass once `frame` was optimized, they made 232 bytes a petting, and none by the twentieth. */
const MIN_PASSES = 20;

type Fn = (...args: never[]) => unknown;

/** A function TurboFan inlines into its optimized callers, so its own code runs too seldom to tier up past Maglev
 *  (rework4-026, rv-impl3-026's B-1: `adapters.chase.faceTwin` into `pet.select` and the petting's end,
 *  `adapters.chase.twinFacing` into the director's `atAim` and `atHome`, read in V8's inlining trace). Once the rest of
 *  `hot` is optimized, the warm-up asks TurboFan to compile it on its next call of its own; then, before and after the
 *  measure, it is either compiled by TurboFan (its own code ran, as TurboFan's) or still asked (its own code never ran:
 *  every call was inlined into its callers' optimized code). Either way no call of it ran in V8's lower tiers. */
export interface Inlined {
  readonly inlined: Fn;
}
export const inlined = (f: Fn): Inlined => ({ inlined: f });

/** A function the warm-up waits for: optimized by TurboFan; or, a list, any of them optimized, for a function V8
 *  inlines into its caller (`pet.select` into the step that calls it once a petting: then the caller's code is the
 *  optimized one and the callee has none of its own); or `inlined(f)`, above. */
export type Hot = Fn | readonly Fn[] | Inlined;
const turbofanned = (f: Fn): boolean => (status(f) & TURBOFANNED) !== 0;
const optimized = (h: Hot): boolean => {
  if (typeof h === "function") return turbofanned(h);
  if ("inlined" in h) return (status(h.inlined) & (TURBOFANNED | MARKED)) !== 0;
  return h.some(turbofanned);
};
const checkHot = (hot: readonly Hot[], when: string): void => {
  hot.forEach((h, i) => {
    expect(optimized(h), `hot function ${i} optimized ${when}`).toBe(true);
  });
};

/** The warm-up: at least `MIN_PASSES` passes of `calls` calls, and until every plain function in `hot` is optimized by
 *  TurboFan (up to 100 passes); then each `inlined(f)` not yet TurboFan's is asked of TurboFan, and one more pass runs. */
function warm(step: () => void, hot: readonly Hot[], calls: number): void {
  const loop = (): void => {
    for (let i = 0; i < calls; i += 1) step();
  };
  const plain = hot.filter((h) => typeof h === "function" || !("inlined" in h));
  const cold = (): boolean => plain.some((h) => !optimized(h));
  for (let r = 0; r < 100 && (r < MIN_PASSES || cold()); r += 1) loop();
  let asked = false;
  for (const h of hot)
    if (typeof h !== "function" && "inlined" in h && !optimized(h)) {
      markForTurbofan(h.inlined);
      asked = true;
    }
  if (asked) loop();
}

/** The heap's growth per call of `step` (a frame, or a whole petting) over `calls` calls, after the warm-up (`warm`),
 *  and after a collection; the median of five, since a collection inside the loop can only lower one and the
 *  compiler's work can only raise one. `hot` is checked before the measure and after it (rework4-026), so a function
 *  deoptimized during the measure fails the case. */
export function bytesPerCall(step: () => void, hot: readonly Hot[], calls = FRAMES): number {
  const loop = (n: number): void => {
    for (let i = 0; i < n; i += 1) step();
  };
  warm(step, hot, calls);
  checkHot(hot, "before the measure");
  const runs: number[] = [];
  for (let r = 0; r < 5; r += 1) {
    gc();
    const before = process.memoryUsage().heapUsed;
    loop(calls);
    runs.push((process.memoryUsage().heapUsed - before) / calls);
  }
  checkHot(hot, "after the measure");
  return runs.sort((a, b) => a - b)[2] as number;
}

/** T016's timing half (FR-027, SC-007): milliseconds a call of `step` over `calls` calls, after the same warm-up as
 *  `bytesPerCall`; the median of five. */
export function msPerCall(step: () => void, hot: readonly Hot[], calls = FRAMES): number {
  warm(step, hot, calls);
  const runs: number[] = [];
  for (let r = 0; r < 5; r += 1) {
    const t0 = performance.now();
    for (let i = 0; i < calls; i += 1) step();
    runs.push((performance.now() - t0) / calls);
  }
  return runs.sort((a, b) => a - b)[2] as number;
}
