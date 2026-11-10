// The loader's view (spec 012; FR-018, FR-022, FR-037; plan.md §5; contracts/loading-progress.md §5): the card the room
// shows over its page from "Enter" until the loader gives way, built with dom.ts's h, its words set as text, never as
// markup. It only draws: the room's sequence (app.ts) owns the clock, the ceiling, and giving way, so a view that throws
// can't hold the hand-off (FR-007).
import type { Clock } from "../clock";
import { h } from "../dom";
import type { ProgressState } from "./progress";

export interface LoadingViewOptions {
  readonly doc: Document;
  readonly clock: Clock;
  /** The index's UI words, slots unfilled. */
  readonly ui: Readonly<Record<string, string>>;
  /** The index's hints, filled (contracts/hints.md §3). */
  readonly hints: readonly string[];
  /** Whether the device asks for reduced motion, read at each change. */
  readonly reducedMotion: () => boolean;
  /** Whether the page is hidden, read as the view starts. */
  readonly hidden: () => boolean;
  /** Each hint shown, by its place from 1, for a drafts build's frame log. */
  readonly onHint?: (n: number) => void;
}

export interface LoadingView {
  /** The card, `section.room-loader`. */
  readonly element: HTMLElement;
  /** Its heading, which takes focus as the loader shows. */
  readonly heading: HTMLElement;
  /** Draws a state of the progress model. */
  show(state: ProgressState): void;
  /** The loader gives way: the card inert at once, then gone. */
  giveWay(onGone?: () => void): void;
  /** The page shown or hidden. */
  visibility(visible: boolean): void;
}

/** The loader's card. */
export function createLoadingView(options: LoadingViewOptions): LoadingView {
  const { doc } = options;
  const heading = h(
    doc,
    "h2",
    { id: "loader-heading", tabindex: -1 },
    options.ui["loading.heading"] ?? "Loading the room",
  );
  const bar = h(doc, "div", {
    role: "progressbar",
    "aria-labelledby": "loader-heading",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": 0,
  });
  const element = h(doc, "section", { class: "room-loader", "aria-labelledby": "loader-heading" }, heading, bar);
  let gone = false;
  return {
    element,
    heading,
    show(state) {
      bar.setAttribute("aria-valuenow", String(state.value));
    },
    giveWay(onGone) {
      if (gone) return;
      gone = true;
      element.toggleAttribute("inert", true);
      element.remove();
      onGone?.();
    },
    visibility() {
      // The hints' rotation pauses while the page is hidden (T024).
    },
  };
}
