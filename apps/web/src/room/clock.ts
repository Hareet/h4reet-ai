// The room's time (spec 002, Phase 4). Every timer and animation frame goes through a Clock: in a page it is the
// window's, and the tests drive a fake one, so the hand-off's length and the quality controller's windows are checked
// to the millisecond (test/helpers/room.ts).
export interface Clock {
  /** Milliseconds, on the same base as animation frames' times. */
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  requestFrame(fn: (time: number) => void): number;
  cancelFrame(id: number): void;
}

export function windowClock(win: Window): Clock {
  return {
    now: () => win.performance.now(),
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: (id) => win.clearTimeout(id),
    requestFrame: (fn) => win.requestAnimationFrame(fn),
    cancelFrame: (id) => win.cancelAnimationFrame(id),
  };
}
