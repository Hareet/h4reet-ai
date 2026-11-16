// The speech bubble over the twin's figure (spec 028; FR-020, FR-027; plan.md R-B5): one `div.room-bubble` in the
// stage's host, placed each frame at the point the 3D stage gives (the twin's head, projected by the room's camera) and
// clamped inside the frame area the stage gives, shown for a time on the room's clock. It is a picture of words the
// polite live region says, so it is hidden from assistive technology and out of the Tab order. It sends nothing.
import "./bubble.css";

/** A rectangle in the host's CSS pixels. */
export interface BubbleArea {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Bubble {
  readonly element: HTMLElement;
  readonly shown: boolean;
  /** Shows `text` for `seconds` from `now` (the room's clock's milliseconds); a second show restarts it. */
  show(text: string, seconds: number, now: number, motion?: { readonly reduced: boolean }): void;
  /** Its tail's tip at (x, y), clamped so its box stays inside `frame`. */
  place(x: number, y: number, frame: BubbleArea): void;
  /** Hides it once its time has passed. */
  tick(now: number): void;
  hide(): void;
  dispose(): void;
}

/** Spec 016's speaking-time defaults (its FR-054; contracts/twin-data.md §1: 150 words a minute within 3 s and 20 s),
 *  for a part without the twin's own block (its stand-in or capsule). */
export const SPEAK_DEFAULTS: { readonly speak_wpm: number; readonly speak_s: readonly [number, number] } = {
  speak_wpm: 150,
  speak_s: [3, 20],
};

/** Spec 016's speaking time (its FR-021; contracts/twin-states.md §2): the words at `wpm`, within `[least, most]`
 *  seconds. */
export function speakingSeconds(text: string, wpm: number, [least, most]: readonly [number, number]): number {
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  return Math.min(most, Math.max(least, (words * 60) / wpm));
}

export function createBubble(doc: Document, host: HTMLElement): Bubble {
  const element = doc.createElement("div");
  element.className = "room-bubble";
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  host.append(element);
  let until = -Infinity;
  let shown = false;

  const hide = (): void => {
    shown = false;
    until = -Infinity;
    element.hidden = true;
  };

  return {
    element,
    get shown() {
      return shown;
    },
    show(text, seconds, now, motion) {
      element.textContent = text;
      if (motion?.reduced) element.setAttribute("data-motion", "reduced");
      else element.removeAttribute("data-motion");
      until = now + Math.max(0, seconds) * 1000;
      shown = true;
      element.hidden = false;
    },
    place(x, y, frame) {
      // Centred on x, its tail's tip at y below its box: the box's half width each side and its height above.
      const half = element.offsetWidth / 2;
      const tall = element.offsetHeight;
      const left = Math.min(Math.max(x, frame.x + half), Math.max(frame.x + half, frame.x + frame.w - half));
      const top = Math.min(Math.max(y, frame.y + tall), Math.max(frame.y + tall, frame.y + frame.h));
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    },
    tick(now) {
      if (shown && now >= until) hide();
    },
    hide,
    dispose() {
      element.remove();
    },
  };
}
