// The frame log (spec 004; FR-042, FR-044; SC-004, SC-012; R-70; contracts/tier-signal.md §6, §9): the evidence for
// the Author's runs on dev, drafts builds only, like the fixtures. The room's entry gets it through the virtual module
// `virtual:room-frame-log`, which build/room/plugin.ts gives as this module's `createFrameLog` in a drafts build and as
// null in a release build, so a release build holds neither this code nor its names.
// - It lives in page memory and keeps the newest FRAME_LOG_LIMIT entries of {t, wall, frame, event, …}: `t` on the
//   room's Clock, `wall` on the wall clock, `frame` the count of 3D frames drawn so far.
// - Its events: enter, pause, resume, hide, and show; each request's start (`request`) and its result (`result`, with
//   `outcome` "ok" or its `why`, and its `status`); each reduction's tier and row (`tier`); each fallback cue
//   (`fallback`); each new switch case (`case`), with the frame on which the 3D room first drew it, or in 2D the
//   time it was applied; each change of the room's target (`target`, spec 008's FR-054 and plan.md §3.4), with the
//   selectable's `id`, or null, and the `input` that made it: pointer, press, focus, reach, select, or reset; and spec
//   009's figures: each picture's change (`figure`, with `figure`, `shows`, and `why`) and each clip's (`clip`, with
//   `figure` and `role`).
// - In a drafts build, the console's h4FrameLog() returns it as JSON, which the Author copies out for
//   scripts/room/har_check.py. It is never stored or sent.
import type { Clock } from "../clock";

/** How many entries the log keeps: the newest. */
export const FRAME_LOG_LIMIT = 10_000;
/** The marker the log's JSON carries, which a build test looks for: no release build holds it. */
export const FRAME_LOG_KIND = "h4-frame-log";

export type FrameEvent =
  | "enter"
  | "pause"
  | "resume"
  | "hide"
  | "show"
  | "request"
  | "result"
  | "tier"
  | "fallback"
  | "case"
  | "target"
  | "walk"
  // Spec 009's figures (its FR-035; plan.md §3.4): a picture's change (`figure`, `shows`, `why`) and a clip's.
  | "figure"
  | "clip"
  // Spec 005's re-fits (its FR-063; plan.md §12.4): the window, the layout, the clear area, the buffer's size, and its
  // ratio (null, and the size "none", in 2D).
  | "refit"
  // A collapsible part's change (`part`, `state`): the list, the log, and the larger view.
  | "panel"
  // Full screen's changes and refusals (`state`: entered, left, or refused).
  | "fullscreen";

/** A field an entry carries beside its four. */
export type FrameField = string | number | boolean | null;

export interface FrameLogEntry {
  readonly t: number;
  readonly wall: number;
  readonly frame: number;
  readonly event: FrameEvent;
  readonly [field: string]: FrameField;
}

export interface FrameLogOptions {
  readonly clock: Clock;
  /** The wall clock: milliseconds since the epoch. */
  readonly wall: () => number;
  /** The page's own origin, which the HAR checker reads every other request's against. */
  readonly origin: string;
  /** How many entries to keep; FRAME_LOG_LIMIT unless a test asks for fewer. */
  readonly limit?: number;
}

export interface FrameLog {
  /** Logs an event now. */
  record(event: FrameEvent, fields?: Readonly<Record<string, FrameField>>): void;
  /** A 3D frame drawn, at its time: counted, and each case applied since the last frame logged as first drawn on it. */
  frame(time: number): void;
  /** A switch's case applied: in 3D, logged on the next frame; in 2D, now. Only a new case, or a new mode, is logged. */
  applied(sw: string, pose: string, plugged: boolean, mode: "3d" | "2d"): void;
  /** The log as JSON: {kind, version, origin, limit, dropped, entries}. */
  json(): string;
  /** Puts h4FrameLog() on the window, for the console. */
  expose(win: Window): void;
}

export function createFrameLog(options: FrameLogOptions): FrameLog {
  const { clock, wall, origin } = options;
  const limit = options.limit ?? FRAME_LOG_LIMIT;
  const entries: FrameLogEntry[] = [];
  let dropped = 0;
  let frames = 0;
  /** Per switch: the case last logged, and the 3D case applied since the last frame. */
  const shown = new Map<string, { pose: string; mode: "3d" | "2d" }>();
  const pending = new Map<string, { pose: string; plugged: boolean }>();

  function push(entry: FrameLogEntry): void {
    entries.push(entry);
    const over = entries.length - limit;
    if (over > 0) {
      entries.splice(0, over);
      dropped += over;
    }
  }

  const json = (): string => JSON.stringify({ kind: FRAME_LOG_KIND, version: 1, origin, limit, dropped, entries });

  function logCase(t: number, sw: string, pose: string, plugged: boolean, mode: "3d" | "2d"): void {
    const last = shown.get(sw);
    if (last && last.pose === pose && last.mode === mode) return;
    shown.set(sw, { pose, mode });
    push({ t, wall: wall(), frame: frames, event: "case", switch: sw, pose, plugged, mode });
  }

  return {
    record(event, fields = {}) {
      push({ ...fields, t: clock.now(), wall: wall(), frame: frames, event });
    },
    frame(time) {
      frames += 1;
      for (const [sw, { pose, plugged }] of pending) logCase(time, sw, pose, plugged, "3d");
      pending.clear();
    },
    applied(sw, pose, plugged, mode) {
      if (mode === "3d") pending.set(sw, { pose, plugged });
      else {
        pending.delete(sw);
        logCase(clock.now(), sw, pose, plugged, "2d");
      }
    },
    json,
    expose(win) {
      Object.defineProperty(win, "h4FrameLog", { configurable: true, value: json });
    },
  };
}
