// The loader's view (spec 012; FR-016, FR-018, FR-022, FR-037 to FR-042, FR-052; plan.md §5, §6, PD-10, PD-11, PD-19,
// PD-23; contracts/loading-progress.md §5): the card the room shows over its page from "Enter" until the loader gives
// way, built with dom.ts's h, its words set as text, never as markup. It only draws: the room's sequence (app.ts) owns
// the clock's ceiling and giving way, so a view that throws can't hold the hand-off (FR-007).
// - The card, `section.room-loader.hud-glass`, its heading "Loading the room" (`loading.heading`), which takes focus as
//   the loader shows, so it is said once (FR-038, FR-039).
// - The bar, a progress bar named by the heading, its value and its value text ("64%: Loading the room's pieces: 12 of
//   21") set at each change, and the fill's width from `--loader-fraction`, set through the CSS object model, never a
//   style attribute (FR-052). The percentage and the stage line beside it are hidden from assistive technology, since
//   the value text carries both. Nothing announces a change of the value.
// - The hints (FR-028 to FR-031, FR-036): one at a time below the bar, in a polite, atomic live region created empty and
//   given the first hint on the next tick, so it is said, and each later one as it appears; its place, "Hint {n} of
//   {total}"; and "Pause hints" or "Play hints", "Previous hint", and "Next hint", which never move focus. The rotation
//   is loading/hints.ts's: the pointer over the area holds it, focus entering its controls from outside them stops it,
//   and a hidden page pauses it. No hint area where the index holds none (FR-032).
// - Giving way: the card inert at once, then a fade of at most 200 ms (loading.css), the card removed on its
//   `transitionend` or 250 ms on the room's clock, whichever comes first; at once under reduced motion (FR-022). The
//   hints go with it, and nothing of them stays in the room.
import type { Clock } from "../clock";
import { h } from "../dom";
import { uiWord } from "../ui-keys";
import type { Slot } from "../ui-keys";
import { createRotation } from "./hints";
import type { Rotation } from "./hints";
import "./loading.css";
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
  /** The loader gives way: the card inert at once, then gone, `onGone` called once it is. */
  giveWay(onGone?: () => void): void;
  /** The page shown or hidden. */
  visibility(visible: boolean): void;
}

/** How long the card's fade may run before it is removed anyway (PD-19): its 200 ms and a frame or so. */
export const FADE_REMOVE_MS = 250;

/** D8's words, where the index lacks one: every index the compositor accepts holds them (RT12). */
const DEFAULTS: Readonly<Record<string, string>> = {
  "loading.heading": "Loading the room",
  "loading.code": "Loading the room's code",
  "loading.pieces": "Loading the room's pieces: {done} of {total}",
  "loading.finishing": "Finishing the room",
  "loading.ready": "The room is ready.",
  "hints.label": "Hint",
  "hints.position": "Hint {n} of {total}",
  "hints.pause": "Pause hints",
  "hints.play": "Play hints",
  "hints.previous": "Previous hint",
  "hints.next": "Next hint",
};

/** The loader's card. */
export function createLoadingView(options: LoadingViewOptions): LoadingView {
  const { doc, clock } = options;
  const ui = { ...DEFAULTS, ...options.ui };
  const word = (key: string, slots: Readonly<Partial<Record<Slot, string>>> = {}): string =>
    uiWord(ui, key, slots) ?? uiWord(DEFAULTS, key, slots) ?? "";

  const heading = h(
    doc,
    "h2",
    { id: "loader-heading", class: "room-loader-heading", tabindex: -1 },
    word("loading.heading"),
  );
  const fill = h(doc, "div", { class: "room-loader-fill" });
  const bar = h(
    doc,
    "div",
    {
      class: "room-loader-bar",
      role: "progressbar",
      "aria-labelledby": "loader-heading",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": 0,
    },
    fill,
  );
  const percent = h(doc, "p", { class: "room-loader-percent", "aria-hidden": "true" });
  const line = h(doc, "p", { class: "room-loader-stage", "aria-hidden": "true" });
  const element = h(
    doc,
    "section",
    { class: "room-loader hud-glass", "aria-labelledby": "loader-heading" },
    heading,
    bar,
    percent,
    line,
  );
  let gone = false;

  // The hint area, where the index holds hints (FR-032).
  let rotation: Rotation | null = null;
  const { hints } = options;
  if (hints.length > 0) {
    const label = h(doc, "h3", { id: "loader-hints-label", class: "visually-hidden" }, word("hints.label"));
    const hint = h(doc, "p", { class: "room-loader-hint", "aria-live": "polite", "aria-atomic": "true" });
    const position = h(doc, "p", { class: "room-loader-position" });
    const rotate = h(doc, "button", { type: "button", class: "room-loader-rotate" }, word("hints.pause"));
    const previous = h(doc, "button", { type: "button" }, word("hints.previous"));
    const next = h(doc, "button", { type: "button" }, word("hints.next"));
    const controls = h(doc, "div", { class: "room-loader-controls" }, rotate, previous, next);
    const area = h(
      doc,
      "section",
      { class: "room-loader-hints", "aria-labelledby": "loader-hints-label" },
      label,
      hint,
      position,
      controls,
    );
    const place = (i: number): void => {
      position.textContent = word("hints.position", { n: String(i + 1), total: String(hints.length) });
    };
    /** A hint into the live region, as text, said once as it appears. */
    const showHint = (i: number): void => {
      if (gone) return;
      hint.textContent = hints[i] ?? "";
      place(i);
      options.onHint?.(i + 1);
    };
    const r = createRotation({
      count: hints.length,
      clock,
      onShow: showHint,
      onState: () => {
        rotate.textContent = word(r.control === "pause" ? "hints.pause" : "hints.play");
      },
    });
    rotation = r;
    place(0);
    // The first hint on the next tick, into the region created empty, so a screen reader says it (FR-031; PD-24).
    clock.setTimeout(() => showHint(r.index), 0);
    area.addEventListener("pointerenter", () => r.pointer(true));
    area.addEventListener("pointerleave", () => r.pointer(false));
    // Focus entering the controls from outside them stops the rotation; moving among them doesn't (FR-030). A press's own
    // focus isn't a stop: browsers that focus a button as it is pressed would otherwise stop the hints and then, with
    // the click, play them, so "Pause hints" pressed would start them (the review's I-1). The press is the pointerdown
    // on a control, which the next focus or click on the controls consumes.
    let pressing = false;
    controls.addEventListener("pointerdown", () => (pressing = true));
    controls.addEventListener("pointercancel", () => (pressing = false));
    controls.addEventListener("focusin", (event) => {
      if (pressing) {
        pressing = false;
        return;
      }
      const from = event.relatedTarget as Node | null;
      if (from === null || !controls.contains(from)) r.focusEntered();
    });
    controls.addEventListener("click", () => (pressing = false), { capture: true });
    rotate.addEventListener("click", () => r.toggle());
    previous.addEventListener("click", () => r.previous());
    next.addEventListener("click", () => r.next());
    if (options.hidden()) r.visibility(false);
    element.append(area);
  }

  /** The stage line's words for a state (FR-016). */
  const stageWords = (state: ProgressState): string => {
    switch (state.stage) {
      case "code":
        return word("loading.code");
      case "pieces":
        return word("loading.pieces", { done: String(state.done), total: String(state.total) });
      case "finishing":
        return word("loading.finishing");
      default:
        return word("loading.ready");
    }
  };

  return {
    element,
    heading,
    show(state) {
      const words = stageWords(state);
      bar.setAttribute("aria-valuenow", String(state.value));
      bar.setAttribute("aria-valuetext", `${state.value}%: ${words}`);
      bar.style.setProperty("--loader-fraction", String(state.value / 100));
      percent.textContent = `${state.value}%`;
      line.textContent = words;
    },
    giveWay(onGone) {
      if (gone) return;
      gone = true;
      rotation?.dispose();
      // Inert from the fade's first frame: no press, and no Tab stop, while it fades (FR-022).
      element.toggleAttribute("inert", true);
      let removed = false;
      const remove = (): void => {
        if (removed) return;
        removed = true;
        element.remove();
        onGone?.();
      };
      if (options.reducedMotion()) {
        remove();
        return;
      }
      element.classList.add("room-loader--leaving");
      // The card's own fade, not a child's transition bubbling up (the fill's width).
      element.addEventListener("transitionend", (event) => {
        if (event.target === element) remove();
      });
      clock.setTimeout(remove, FADE_REMOVE_MS);
    },
    visibility(visible) {
      // The hints don't rotate while the page is hidden (FR-009).
      rotation?.visibility(visible);
    },
  };
}
