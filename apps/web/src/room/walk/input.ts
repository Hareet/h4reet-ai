// The walking view's input (spec 008; FR-028 to FR-030, FR-032; plan.md R-10): keys, mouse drags, the wheel, and clicks,
// bound only while walking and gathered into each frame's intents, which scene/walking.ts reads.
// - Keys only on the walking view's focusable element (WCAG 2.2's 2.1.4): W or ↑ forward, S or ↓ back, A or ← left, D
//   or → right, Q and E turn, R and F tilt, + and − zoom (= counting as +), Enter selects the target, Escape leaves.
//   Letters by `code`, the physical key, so other layouts keep the shape; the rest by `key`. The arrows' default, the
//   page's scroll, is prevented; Tab isn't touched, so focus moves on as anywhere (2.1.2).
// - A press on the surface beyond the tap slop is a drag: it turns and tilts by its movement since the last frame. A
//   click within the slop is objects.ts's, the one selection path, which gives the 3D stage a click that picks nothing
//   as a walk toward the floor (T052). The wheel zooms, a trackpad's pinch arriving as a wheel with ctrlKey; while
//   walking its listener isn't passive, so it can keep the page from scrolling.
// - Every held key and drag is dropped when the walking view or the window loses focus, the page hides, or the input
//   is unbound, so nothing moves until a new input begins (FR-029).
// - Spec 024 (FR-012): B, by its physical key, is the dinosaur's bite, passed on once; never with a modifier, and never
//   from a text field inside the view (the twin's chat is outside it, so its keys never arrive here).
import { browserOwnsEscape } from "../fullscreen";
import { TAP_SLOP_PX } from "../objects";
import type { Ndc } from "../objects";
import type { Move } from "./movement";

/** What the visitor asks of the walking view in a frame. */
export interface WalkIntents {
  /** The held keys' direction, in the camera's frame. */
  readonly move: Move;
  /** Radians to turn the camera, right positive, and to tilt it, down positive. */
  readonly turn: number;
  readonly tilt: number;
  /** Zoom steps, in positive: a key's press or a wheel's notch each one. */
  readonly zoom: number;
  /** Clicks within the slop that picked nothing, in normalized device coordinates: the stage puts objects.ts's misses
   *  here, and the walking view walks toward the floor under each (FR-032). */
  readonly taps: readonly Ndc[];
  /** Enter, and Escape, pressed since the last frame. */
  readonly enter: boolean;
  readonly escape: boolean;
  /** Spec 024 (FR-012): B, the dinosaur's bite, pressed since the last frame. Optional, so a frame without it is one
   *  with no bite. */
  readonly eat?: boolean;
}

export interface WalkInput {
  /** Binds the keys to `focus`, the walking view's focusable element, and the pointer and the wheel to the surface. */
  bind(focus: HTMLElement): void;
  /** Unbinds them, dropping whatever is held. */
  unbind(): void;
  /** The intents since the last frame, a frame of `dt` seconds at the walking data's rates in radians a second. */
  take(dt: number, rates: { readonly turn: number; readonly tilt: number }): WalkIntents;
  /** A click that picked nothing, for the next frame's taps. */
  miss(ndc: Ndc): void;
}

/** How many radians a pixel of drag turns or tilts the camera. */
export const DRAG_RAD_PER_PX = Math.PI / 600;
/** Zoom steps a wheel's notch, 100 pixels of deltaY, gives. */
const WHEEL_STEP_PX = 100;

/** The keys, by `code` for the letters and by `key` for the rest, and what each holds or does. */
const HELD: Readonly<Record<string, string>> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyQ: "turnLeft",
  KeyE: "turnRight",
  KeyR: "tiltUp",
  KeyF: "tiltDown",
};

/** Whether a key's target takes text: an input, a text area, a select, or an editable element (spec 024, FR-012). */
function typing(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!el || typeof el.tagName !== "string") return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true;
}

/** The walking view's input over the stage's surface, in the stage's window. */
export function createWalkInput(surface: HTMLElement, win: Window): WalkInput {
  const held = new Set<string>();
  let zoom = 0;
  let taps: Ndc[] = [];
  let enter = false;
  let escape = false;
  let eat = false;
  let drag: { id: number; x: number; y: number; dragging: boolean } | null = null;
  let dragged = { x: 0, y: 0 };
  let focus: HTMLElement | null = null;

  const drop = (): void => {
    held.clear();
    drag = null;
    dragged = { x: 0, y: 0 };
  };
  const keyOf = (e: KeyboardEvent): string | undefined =>
    (e.code.startsWith("Key") ? HELD[e.code] : undefined) ?? HELD[e.key] ?? HELD[e.code];

  const onKeyDown = (e: KeyboardEvent): void => {
    // The browser's and the system's shortcuts stay theirs: Ctrl+F, Ctrl+D, Cmd+A (whose key-up macOS never sends).
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyB") {
      if (!typing(e.target)) eat = true;
      return;
    }
    const what = keyOf(e);
    if (what) {
      held.add(what);
      if (e.key.startsWith("Arrow")) e.preventDefault();
      return;
    }
    if (e.key === "+" || e.key === "=") zoom += 1;
    else if (e.key === "-" || e.key === "−") zoom -= 1;
    else if (e.key === "Enter") enter = true;
    // In full screen the browser takes Escape to leave it; the walking view keeps its own for the next (spec 005, FR-039).
    else if (e.key === "Escape" && !browserOwnsEscape(win.document)) escape = true;
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const what = keyOf(e);
    if (what) held.delete(what);
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
  };
  const onMove = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType !== "touch" && e.buttons === 0) {
      drag = null;
      return;
    }
    const [dx, dy] = [e.clientX - drag.x, e.clientY - drag.y];
    if (!drag.dragging && Math.hypot(dx, dy) <= TAP_SLOP_PX) return;
    drag.dragging = true;
    dragged = { x: dragged.x + dx, y: dragged.y + dy };
    drag = { ...drag, x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
  };
  const onCancel = (): void => {
    drag = null;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    zoom -= e.deltaY / WHEEL_STEP_PX;
  };
  const onBlur = (): void => drop();
  const onHidden = (): void => {
    if (win.document.visibilityState === "hidden") drop();
  };

  const unbind = (): void => {
    if (!focus) return;
    focus.removeEventListener("keydown", onKeyDown);
    focus.removeEventListener("keyup", onKeyUp);
    focus.removeEventListener("blur", onBlur);
    surface.removeEventListener("pointerdown", onDown);
    surface.removeEventListener("pointermove", onMove);
    surface.removeEventListener("pointerup", onUp);
    surface.removeEventListener("pointercancel", onCancel);
    surface.removeEventListener("wheel", onWheel);
    win.removeEventListener("blur", onBlur);
    win.document.removeEventListener("visibilitychange", onHidden);
    focus = null;
    drop();
    zoom = 0;
    taps = [];
    enter = false;
    escape = false;
    eat = false;
  };

  return {
    bind(element) {
      unbind();
      focus = element;
      element.addEventListener("keydown", onKeyDown);
      element.addEventListener("keyup", onKeyUp);
      element.addEventListener("blur", onBlur);
      surface.addEventListener("pointerdown", onDown);
      surface.addEventListener("pointermove", onMove);
      surface.addEventListener("pointerup", onUp);
      surface.addEventListener("pointercancel", onCancel);
      surface.addEventListener("wheel", onWheel, { passive: false });
      win.addEventListener("blur", onBlur);
      win.document.addEventListener("visibilitychange", onHidden);
    },
    unbind,
    miss(ndc) {
      if (focus) taps.push(ndc);
    },
    take(dt, rates) {
      const on = (k: string): number => (held.has(k) ? 1 : 0);
      const intents: WalkIntents = {
        move: { forward: on("forward") - on("back"), right: on("right") - on("left") },
        turn: (on("turnRight") - on("turnLeft")) * rates.turn * dt + dragged.x * DRAG_RAD_PER_PX,
        tilt: (on("tiltDown") - on("tiltUp")) * rates.tilt * dt + dragged.y * DRAG_RAD_PER_PX,
        zoom,
        taps,
        enter,
        escape,
        eat,
      };
      zoom = 0;
      taps = [];
      enter = false;
      escape = false;
      eat = false;
      dragged = { x: 0, y: 0 };
      return intents;
    },
  };
}
