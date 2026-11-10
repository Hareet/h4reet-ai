// The motion store (spec 004; FR-042, FR-059, FR-060; WCAG 2.2's 2.2.2; R-34; data-model.md §11.3): the room's one
// record of what stops its motion, read throughout the visit (spec 002 read reduced motion once, at "Enter").
// - paused: the toolbar's "Pause the room" toggle (aria-pressed), with the wall clock's HH:MM at the moment it paused,
//   which the text copy shows as "Paused at HH:MM", the UI word pause.paused_at with its {time} slot filled by that live
//   value, 24-hour and local, from a wall clock the room injects;
// - reducedMotion: matchMedia("(prefers-reduced-motion: reduce)"), with a change listener;
// - hidden: document.visibilityState, from visibilitychange, and pagehide and pageshow.
// The room animates only while all three are false; otherwise it draws final frames (no typing, glow motion, or idle
// sway), still applying state changes at once, and the frame loop keeps drawing still frames. Paused or hidden also
// stop the status polling, and the tier reads paused (signals/live.ts); reduced motion stops motion alone, not polling
// (FR-044, FR-059). Only the pause shows "Paused at" (FR-060). Nothing here stores anything or asks the network.
// Spec 012 (its FR-024; D13; plan.md PD-20) adds hold(), the loader's: counted, as the quality controller's holds are;
// while any is taken the room doesn't animate, and nothing else changes: no pause, no "Paused at", no polling.
import { uiWord } from "./ui-keys";

/** The media query whose change the store follows. */
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export interface MotionState {
  /** "Pause the room" is on. */
  readonly paused: boolean;
  /** The device asks for reduced motion. */
  readonly reducedMotion: boolean;
  /** The page isn't visible. */
  readonly hidden: boolean;
  /** Whether the room animates: only while none of the three is set. */
  readonly animate: boolean;
  /** HH:MM, 24-hour, local, of the moment the room paused; null while it isn't paused. */
  readonly pausedAt: string | null;
}

export interface MotionStore extends MotionState {
  /** "Pause the room" pressed, or pressed again. */
  setPaused(on: boolean): void;
  /** Spec 012: holds the room's motion still while the loader shows, with nothing paused; returns its release, which
   *  counts once however often it's called. */
  hold(): () => void;
  /** Called with the store's state, synchronously, whenever a flag changes; returns what unsubscribes. */
  subscribe(listener: (state: MotionState) => void): () => void;
  /** Stops listening to the page. */
  dispose(): void;
}

/** A wall-clock time as the text copy shows it: HH:MM, 24-hour, in the device's local time. */
export function clockTime(ms: number): string {
  const at = new Date(ms);
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** "Paused at HH:MM": the UI word pause.paused_at, its {time} slot filled with the live value; null without the word. */
export function pausedAtWords(ui: Readonly<Record<string, string>>, time: string): string | null {
  return uiWord(ui, "pause.paused_at", { time });
}

/** The page's motion store: its flags from the window given, its "Paused at" from the wall clock given (by default the
 *  window's Date.now). */
export function createMotionStore(options: { readonly win: Window; readonly wall?: () => number }): MotionStore {
  const { win } = options;
  const doc = win.document;
  const wall = options.wall ?? ((): number => Date.now());
  const query: MediaQueryList | null = typeof win.matchMedia === "function" ? win.matchMedia(REDUCED_MOTION) : null;
  const listeners = new Set<(state: MotionState) => void>();
  let paused = false;
  let pausedAt: string | null = null;
  let reducedMotion = query?.matches === true;
  let hidden = doc.visibilityState === "hidden";
  /** The loader's holds taken and not yet let go (spec 012). */
  let holds = 0;
  const animating = (): boolean => !paused && !reducedMotion && !hidden && holds === 0;

  const state = (): MotionState => ({
    paused,
    reducedMotion,
    hidden,
    animate: animating(),
    pausedAt,
  });
  const notify = (): void => {
    const now = state();
    for (const listener of [...listeners]) listener(now);
  };

  const onMedia = (): void => {
    const next = query?.matches === true;
    if (next === reducedMotion) return;
    reducedMotion = next;
    notify();
  };
  const setHidden = (next: boolean): void => {
    if (next === hidden) return;
    hidden = next;
    notify();
  };
  const onVisibility = (): void => setHidden(doc.visibilityState === "hidden");
  const onPageHide = (): void => setHidden(true);
  const onPageShow = (): void => setHidden(doc.visibilityState === "hidden");

  // An older Safari's MediaQueryList has only addListener.
  const listen = (on: boolean): void => {
    if (!query) return;
    if (typeof query.addEventListener === "function") {
      if (on) query.addEventListener("change", onMedia);
      else query.removeEventListener("change", onMedia);
    } else if (on) query.addListener(onMedia);
    else query.removeListener(onMedia);
  };
  listen(true);
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pagehide", onPageHide);
  win.addEventListener("pageshow", onPageShow);

  return {
    get paused() {
      return paused;
    },
    get reducedMotion() {
      return reducedMotion;
    },
    get hidden() {
      return hidden;
    },
    // Read on every frame, so it builds no state object.
    get animate() {
      return animating();
    },
    get pausedAt() {
      return pausedAt;
    },
    setPaused(on) {
      if (on === paused) return;
      paused = on;
      pausedAt = on ? clockTime(wall()) : null;
      notify();
    },
    hold() {
      const before = animating();
      holds += 1;
      if (before !== animating()) notify();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const was = animating();
        holds -= 1;
        if (was !== animating()) notify();
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listen(false);
      doc.removeEventListener("visibilitychange", onVisibility);
      win.removeEventListener("pagehide", onPageHide);
      win.removeEventListener("pageshow", onPageShow);
      listeners.clear();
    },
  };
}
