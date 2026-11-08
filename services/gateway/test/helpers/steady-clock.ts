// A real-time clock that a step of the wall clock can't move, for code that times durations on the clock it is handed
// (the gateway's realNow: AdapterHealth's circuit and probe cadence). It starts at Date.now() and runs on the monotonic
// clock, performance.now(), from there, at the real clock's rate or a fraction of it. WSL's wall clock steps back, and
// Date.now() gave the gateway's timed tests negative durations.
export function steadyNow(rate = 1): () => number {
  const wallStart = Date.now();
  const monoStart = performance.now();
  return () => wallStart + (performance.now() - monoStart) * rate;
}
