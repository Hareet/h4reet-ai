// The timers a call arms, for the tests that prove a watchdog or a deadline without a bound in ms (fix/036): each
// timer's delay, and whether the event loop had turned once since the watch began. A timer armed with nothing awaited
// before it (no timer, no I/O, no later tick) reads `turned: false`, on a loaded machine as on an idle one; a timer
// armed after any wait reads `turned: true`. The spy calls through to the real setTimeout, and vitest's restoreMocks
// removes it after the test.
import { vi } from "vitest";

export interface ArmedTimer {
  readonly delay: number | undefined;
  readonly turned: boolean;
}

/** Starts the watch: call it just before the call whose timers it records. */
export function watchArmedTimers(): ArmedTimer[] {
  const armed: ArmedTimer[] = [];
  let turned = false;
  setImmediate(() => {
    turned = true;
  });
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    handler: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    armed.push({ delay, turned });
    return real(handler, delay, ...args);
  }) as unknown as typeof setTimeout);
  return armed;
}
