// The hints' rotation (spec 012; FR-028 to FR-031; WCAG 2.2's 2.2.2; plan.md PD-12, §7.5; contracts/loading-progress.md
// §6): a small state machine on the room's clock, the WAI-ARIA carousel pattern's rules, with no DOM, so Node tests
// cover them. One hint at a time, a new one every HINT_MS while running; never while the pointer is over the hint area
// (hovered), after "Pause hints" (paused), while the page is hidden (hidden, back to the state it left when it shows),
// or once focus has entered the hint controls from outside them (stopped: "It does not resume unless the user activates
// the rotation control"). "Play hints" leaves both pause and stop. The rotation control's words say what a press will
// do: "Pause hints" while it rotates, "Play hints" otherwise, with no pressed state. "Previous hint" and "Next hint"
// step in every state, wrapping at both ends, and the timer restarts its 6 seconds at each change of hint.
import type { Clock } from "../clock";

/** How long each hint shows while the hints rotate (D4). */
export const HINT_MS = 6000;

export type RotationState = "running" | "hovered" | "paused" | "hidden" | "stopped";

export interface Rotation {
  /** The hint showing, from 0. */
  readonly index: number;
  readonly count: number;
  readonly state: RotationState;
  /** What the rotation control offers: to pause the hints while they rotate, to play them otherwise. */
  readonly control: "pause" | "play";
  /** The pointer entered or left the hint area. */
  pointer(over: boolean): void;
  /** Focus entered the hint controls from outside them. */
  focusEntered(): void;
  /** The rotation control pressed: "Pause hints" or "Play hints". */
  toggle(): void;
  previous(): void;
  next(): void;
  /** The page shown or hidden. */
  visibility(visible: boolean): void;
  /** Stops the timer for good. */
  dispose(): void;
}

export interface RotationOptions {
  readonly count: number;
  /** The room's clock, which times each hint. */
  readonly clock: Clock;
  /** Called with each new hint's index, never with the first: the view shows the first itself. */
  readonly onShow: (index: number) => void;
  /** Called whenever the state changes, so the view can word the rotation control. */
  readonly onState?: (state: RotationState) => void;
}

/** The rotation, running from the first hint. */
export function createRotation(options: RotationOptions): Rotation {
  const { clock, count } = options;
  let index = 0;
  let state: RotationState = "running";
  /** The state the page left when it hid. */
  let beforeHidden: Exclude<RotationState, "hidden"> = "running";
  let timer: number | null = null;
  let disposed = false;

  const clear = (): void => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  /** The timer, set afresh while running, and none otherwise. */
  const schedule = (): void => {
    clear();
    if (disposed || state !== "running" || count < 2) return;
    timer = clock.setTimeout(() => {
      timer = null;
      show((index + 1) % count);
    }, HINT_MS);
  };
  const show = (next: number): void => {
    if (count < 2 || next === index) return;
    index = next;
    options.onShow(index);
    schedule();
  };
  const set = (next: RotationState): void => {
    if (next === state) return;
    state = next;
    options.onState?.(state);
    schedule();
  };

  schedule();
  return {
    get index() {
      return index;
    },
    count,
    get state() {
      return state;
    },
    get control() {
      return state === "running" || state === "hovered" ? "pause" : "play";
    },
    pointer(over) {
      if (over && state === "running") set("hovered");
      else if (!over && state === "hovered") set("running");
    },
    focusEntered() {
      if (state === "running" || state === "hovered") set("stopped");
      else if (state === "hidden" && (beforeHidden === "running" || beforeHidden === "hovered"))
        beforeHidden = "stopped";
    },
    toggle() {
      if (state === "running" || state === "hovered") set("paused");
      else if (state === "hidden")
        beforeHidden = beforeHidden === "paused" || beforeHidden === "stopped" ? "running" : "paused";
      else set("running");
    },
    previous() {
      show((index - 1 + count) % count);
    },
    next() {
      show((index + 1) % count);
    },
    visibility(visible) {
      if (!visible && state !== "hidden") {
        beforeHidden = state;
        set("hidden");
      } else if (visible && state === "hidden") set(beforeHidden);
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
