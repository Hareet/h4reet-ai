// The status poller (spec 004; FR-042, FR-044, FR-045, SC-012; Amendment A1; R-31; contracts/tier-signal.md §5): the
// only code in the room that asks the relay anything, in the entry chunk. Each page is its own room: two tabs poll on
// their own schedules and share nothing.
// - The request is GET /api/status on the page's own origin, the URL code and never data, with no header, body,
//   query string, or credential, uncached, refusing redirects, and aborted at STATUS_TIMEOUT_MS on the room's Clock,
//   the body's read counting (§5.1). One request at a time: the next is armed only once the last has completed.
// - A valid answer is a 200 whose whole body arrived in time and is a JSON object holding `local_tier` and `state` as
//   strings and `cause_now` as a string or null; the answer keeps those three alone. Anything else is a failure with
//   its `why` (§5.2).
// - The schedule (§5.3) keeps `lastStart`, `wait`, and `nextAt = lastStart + wait` on the room's monotonic Clock alone:
//   `wait` is the poll interval after a valid answer, double the last wait after a failure up to BACKOFF_CAP_MS, and
//   after a 429 at least its Retry-After (the header's delta-seconds, else the body's `retry_after_s`, capped at
//   RETRY_AFTER_CAP_MS). So every start is at least one interval after the one before.
// - It runs only while live.source is `site`, the visitor has entered, the room isn't paused, and the page is visible
//   (§5.4). Pause or hide clears its timer; a request in flight completes and is recorded. On resume or show it starts
//   a request at once only when `now ≥ nextAt` or none has started, else arms its timer for `nextAt`.
// - It stores nothing: no cookie, Web Storage, IndexedDB, Cache API, or URL change, and calls no model (§5.5).
// The timeout and the backoff's cap are FR-041's and FR-044's own figures, so they are constants here, with no scene
// key: no data edit can move them past the spec's table.
import type { Clock } from "../clock";
import type { StatusAnswer, StatusFailure, StatusResult } from "./tier";

/** The request's URL: a root-relative path on the page's own origin, with no query string. */
export const STATUS_PATH = "/api/status";
/** The request's timeout, the body's read counting (FR-041 row 3, FR-044). */
export const STATUS_TIMEOUT_MS = 5_000;
/** The backoff's cap (FR-044). */
export const BACKOFF_CAP_MS = 120_000;
/** The longest Retry-After honoured: it keeps the timer inside the Clock's range (§5.3). */
export const RETRY_AFTER_CAP_MS = 3_600_000;

/** The page's fetch, as the poller calls it. */
export type StatusFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface StatusPollerOptions {
  /** live.source: `off` makes no request, ever (FR-045). */
  readonly source: "off" | "site";
  /** live.poll_ms: the poll interval. */
  readonly pollMs: number;
  readonly clock: Clock;
  /** The wall clock: milliseconds since the epoch, for each result's `endedWall`. */
  readonly wall: () => number;
  readonly fetch: StatusFetch;
  /** Called as each request starts, with its time on the Clock. */
  readonly onStart?: (started: number) => void;
  /** Called once with each completed request. */
  readonly onResult: (result: StatusResult) => void;
}

/** The schedule, as the poller holds it: `nextAt` is null before the first request and while one is in flight. */
export interface PollerSchedule {
  readonly lastStart: number | null;
  readonly wait: number;
  readonly nextAt: number | null;
  readonly inFlight: boolean;
}

export interface StatusPoller {
  readonly schedule: PollerSchedule;
  /** The visitor entered the room (§5.4): the first request at once, if running. Only the first call counts. */
  enter(): void;
  /** "Pause the room" on or off. */
  setPaused(on: boolean): void;
  /** The page hidden or shown. */
  setHidden(on: boolean): void;
  /** Stops for good: its timers cleared, a request in flight aborted and never recorded. */
  dispose(): void;
}

/** The request's init: exactly these fields (§5.1). */
function requestInit(signal: AbortSignal): RequestInit {
  return {
    method: "GET",
    mode: "same-origin",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  };
}

/** The three fields of a valid answer, or null where the body isn't one (§5.2). */
function answerOf(body: string): StatusAnswer | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const { local_tier, state, cause_now } = o;
  if (typeof local_tier !== "string" || typeof state !== "string") return null;
  if (!Object.hasOwn(o, "cause_now") || (cause_now !== null && typeof cause_now !== "string")) return null;
  return { local_tier, state, cause_now };
}

/** A 429's wait in ms: the header's delta-seconds (digits only), else the body's `retry_after_s` (a non-negative
 *  integer), else none; capped at RETRY_AFTER_CAP_MS. */
function retryAfterOf(header: string | null, body: string | null): number | undefined {
  let seconds: number | undefined;
  if (header !== null && /^\d+$/.test(header.trim())) seconds = Number(header.trim());
  else if (body !== null) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const value = (parsed as Record<string, unknown>).retry_after_s;
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) seconds = value;
      }
    } catch {
      // No Retry-After from a body that isn't JSON.
    }
  }
  return seconds === undefined ? undefined : Math.min(seconds * 1_000, RETRY_AFTER_CAP_MS);
}

export function createStatusPoller(options: StatusPollerOptions): StatusPoller {
  const { clock, pollMs } = options;
  let entered = false;
  let paused = false;
  let hidden = false;
  let disposed = false;
  let lastStart: number | null = null;
  let wait = pollMs;
  let nextAt: number | null = null;
  let timer: number | null = null;
  /** The request in flight: its abort, its timeout timer, and whether it has completed. */
  let flight: { controller: AbortController; timeout: number; done: boolean } | null = null;

  const running = (): boolean => options.source === "site" && entered && !paused && !hidden && !disposed;

  function clearTimer(): void {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function arm(): void {
    clearTimer();
    if (!running() || flight !== null || nextAt === null) return;
    timer = clock.setTimeout(
      () => {
        timer = null;
        start();
      },
      Math.max(0, nextAt - clock.now()),
    );
  }

  /** The resume rule, also Enter's: a request at once when none has started or `now ≥ nextAt`, else the timer. */
  function kick(): void {
    if (!running() || flight !== null) return;
    if (lastStart === null || nextAt === null || clock.now() >= nextAt) start();
    else arm();
  }

  function start(): void {
    if (!running() || flight !== null) return;
    clearTimer();
    const started = clock.now();
    const controller = new AbortController();
    const current = {
      controller,
      timeout: clock.setTimeout(() => finish({ why: "timeout" }), STATUS_TIMEOUT_MS),
      done: false,
    };
    flight = current;
    lastStart = started;
    nextAt = null;
    options.onStart?.(started);

    function finish(end: { answer: StatusAnswer } | { why: StatusFailure; status?: number; retryAfterMs?: number }) {
      if (current.done || disposed) return;
      current.done = true;
      clock.clearTimeout(current.timeout);
      if ("why" in end && end.why === "timeout") controller.abort();
      flight = null;
      const ended = clock.now();
      const endedWall = options.wall();
      let result: StatusResult;
      if ("answer" in end) {
        wait = pollMs;
        result = { ok: true, started, ended, endedWall, answer: end.answer };
      } else {
        wait = Math.min(2 * wait, BACKOFF_CAP_MS);
        if (end.retryAfterMs !== undefined) wait = Math.max(wait, end.retryAfterMs);
        result = {
          ok: false,
          started,
          ended,
          endedWall,
          why: end.why,
          ...(end.status === undefined ? {} : { status: end.status }),
          ...(end.retryAfterMs === undefined ? {} : { retryAfterMs: end.retryAfterMs }),
        };
      }
      nextAt = started + wait;
      options.onResult(result);
      arm();
    }

    let request: Promise<Response>;
    try {
      request = options.fetch(STATUS_PATH, requestInit(controller.signal));
    } catch {
      request = Promise.reject(new TypeError("fetch threw"));
    }
    request.then(
      async (response) => {
        if (current.done) return;
        const { status } = response;
        if (status === 429) {
          const header = response.headers.get("Retry-After");
          // The body is read only for its retry_after_s, inside the timeout; a body that fails to arrive gives none.
          const body = await response.text().catch(() => null);
          const retryAfterMs = retryAfterOf(header, body);
          finish({ why: "status", status, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });
          return;
        }
        if (status !== 200) {
          finish({ why: "status", status });
          return;
        }
        let body: string;
        try {
          body = await response.text();
        } catch {
          // A body that fails to arrive whole: a timeout once the abort lands, else a shape it doesn't have.
          finish({ why: controller.signal.aborted ? "timeout" : "shape" });
          return;
        }
        const answer = answerOf(body);
        finish(answer === null ? { why: "shape" } : { answer });
      },
      () => finish({ why: "network" }),
    );
  }

  return {
    get schedule() {
      return { lastStart, wait, nextAt, inFlight: flight !== null };
    },
    enter() {
      if (entered) return;
      entered = true;
      kick();
    },
    setPaused(on) {
      if (paused === on) return;
      paused = on;
      if (on) clearTimer();
      else kick();
    },
    setHidden(on) {
      if (hidden === on) return;
      hidden = on;
      if (on) clearTimer();
      else kick();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimer();
      if (flight !== null) {
        clock.clearTimeout(flight.timeout);
        flight.controller.abort();
        flight = null;
      }
    },
  };
}
