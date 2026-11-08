// The live controller (spec 004; FR-042 to FR-045, FR-059, FR-060, FR-062, FR-065; Amendment B8; R-30, R-34;
// contracts/tier-signal.md §6): the tier reduced (tier.ts) whenever anything it reads changes, and shown at once.
// - It re-reduces at Enter; on every completed status request; on pause, resume, hide, and show (the motion store's
//   paused and hidden, never its reduced motion, which stops motion and not the tier); on every turn reply whose route
//   is `fallback`, through the cost channel's cue; and when a timer on the room's Clock reaches `recheckAt`, the
//   instant the last valid answer turns stale, so the plugged pose leaves on the first frame after it (SC-003).
// - Each reduction calls `apply` synchronously, in the same event: the room's switch takes its case, which the 3D room
//   draws on its next frame and the 2D room on its next paint, and the text copy takes its tier sentence in place
//   (FR-042, FR-058). So on resume or show the tier is reduced before the next frame.
// - A request in flight changes nothing: only a completed one is an input (FR-042).
// - With live.source `off` (until User Story 8's switch-on change), nothing polls and the tier is not-live (FR-045).
// - The status poller (status-poller.ts; T246) runs only while live.source is `site`, the visitor has entered, the page
//   is visible, and the room isn't paused: Enter, pause, resume, hide, and show reach it after the reduction, so on
//   resume or show the tier is reduced before any request starts. Each completed request comes back through
//   `complete`. The cost channel (T266) calls `fallbackReply` for each fallback reply.
// - A drafts build's frame log (frame-log.ts; R-70) gets Enter, pause, resume, hide, show, each request's start and
//   result, each reduction's tier and row, and each fallback cue; the room logs the cases it draws.
// Nothing here stores anything or calls a model (FR-076); the poller's GET /api/status is the only request.
import type { Clock } from "../clock";
import type { RoomIndex } from "../compose/bundle";
import type { MotionState } from "../motion";
import type { FrameLog } from "./frame-log";
import { createStatusPoller } from "./status-poller";
import type { StatusFetch, StatusPoller } from "./status-poller";
import { reduceTier } from "./tier";
import type { StatusResult, TierReading } from "./tier";

export interface LiveSignals {
  /** The tier the room shows now. */
  readonly tier: TierReading;
  /** Called with each reduction, after `apply`; returns what unsubscribes. */
  subscribe(listener: (reading: TierReading) => void): () => void;
  /** The visitor entered the room (§5.4): reduced at once. */
  enter(): void;
  /** A status request completed: recorded as the last, and reduced at once. The poller's hook (T245). */
  complete(result: StatusResult): void;
  /** A turn reply whose route was `fallback` arrived: row 7's cue, reduced at once. The cost channel's hook (T266). */
  fallbackReply(): void;
  dispose(): void;
}

export interface LiveOptions {
  /** The index's live configuration. */
  readonly live: Pick<RoomIndex["live"], "source" | "freshness_ms">;
  readonly clock: Clock;
  /** The wall clock: milliseconds since the epoch. */
  readonly wall: () => number;
  /** The motion store's pause and visibility, and its changes. */
  readonly motion: Pick<MotionState, "paused" | "hidden"> & {
    subscribe(listener: (state: MotionState) => void): () => void;
  };
  /** Shows a reading, synchronously: the switch's case and the text copy's sentence. */
  apply(reading: TierReading): void;
  /** The status poller's fetch and interval (T246): absent, nothing polls, and results come only through `complete`. */
  readonly status?: { readonly fetch: StatusFetch; readonly pollMs: number };
  /** A drafts build's frame log (T246): absent, as in a release build, nothing is logged. */
  readonly log?: FrameLog;
}

export function createLiveSignals(options: LiveOptions): LiveSignals {
  const { clock, motion, log } = options;
  const listeners = new Set<(reading: TierReading) => void>();
  let last: StatusResult | null = null;
  let fallbackReplyAt: number | null = null;
  let timer: number | null = null;
  let disposed = false;
  let paused = motion.paused;
  let hidden = motion.hidden;

  const read = (): TierReading =>
    reduceTier({
      live: options.live.source,
      paused: motion.paused,
      hidden: motion.hidden,
      now: clock.now(),
      wallNow: options.wall(),
      freshnessMs: options.live.freshness_ms,
      last,
      fallbackReplyAt,
    });
  let reading = read();

  function reduce(): void {
    if (disposed) return;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    reading = read();
    log?.record("tier", { tier: reading.tier, row: reading.row });
    options.apply(reading);
    for (const listener of [...listeners]) listener(reading);
    const at = reading.recheckAt;
    if (at !== null) {
      timer = clock.setTimeout(
        () => {
          timer = null;
          reduce();
        },
        Math.max(0, at - clock.now()),
      );
    }
  }

  function complete(result: StatusResult): void {
    if (disposed) return;
    log?.record("result", {
      outcome: result.ok ? "ok" : result.why,
      status: result.ok ? 200 : (result.status ?? null),
    });
    last = result;
    reduce();
  }

  const { status } = options;
  const poller: StatusPoller | null = status
    ? createStatusPoller({
        source: options.live.source,
        pollMs: status.pollMs,
        clock,
        wall: options.wall,
        fetch: status.fetch,
        onStart: () => log?.record("request"),
        onResult: complete,
      })
    : null;
  if (motion.paused) poller?.setPaused(true);
  if (motion.hidden) poller?.setHidden(true);

  const unsubscribe = motion.subscribe((state) => {
    // Pause, resume, hide, and show; reduced motion alone changes nothing here.
    if (state.paused === paused && state.hidden === hidden) return;
    if (state.paused !== paused) log?.record(state.paused ? "pause" : "resume");
    if (state.hidden !== hidden) log?.record(state.hidden ? "hide" : "show");
    paused = state.paused;
    hidden = state.hidden;
    // Reduced first, in the same event, before the next frame; then the poller's resume rule (§5.4). What stops it goes
    // first, so a change that resumes the room and hides the page together never lets it start on a hidden page.
    reduce();
    if (paused) poller?.setPaused(true);
    if (hidden) poller?.setHidden(true);
    if (!paused) poller?.setPaused(false);
    if (!hidden) poller?.setHidden(false);
  });

  return {
    get tier() {
      return reading;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    enter() {
      if (disposed) return;
      log?.record("enter", { source: options.live.source, poll_ms: status?.pollMs ?? null });
      reduce();
      poller?.enter();
    },
    complete,
    fallbackReply() {
      if (disposed) return;
      log?.record("fallback");
      fallbackReplyAt = clock.now();
      reduce();
    },
    dispose() {
      disposed = true;
      poller?.dispose();
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      unsubscribe();
      listeners.clear();
    },
  };
}
