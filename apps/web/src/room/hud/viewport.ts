// The window's measures and their changes (spec 005; FR-008, FR-009, FR-012, FR-050; plan.md §4.3, §6.8, PD-14): what
// the room re-fits to. Everything the browser decides about the window comes through here, so the room's tests stub
// it. A change reports "refit", for the window's size or shape, its pixel ratio, or full screen; or "keyboard", for the
// on-screen keyboard's inset over the visual viewport, which lifts the HUD's foot and never re-frames the room.
// - The size: the page's root's client width (the window less a scroll bar, which "Around the room" below gives a
//   desktop page) and the window's inner height, which the room block's 100dvh follows.
// - The sources: the window's resize, a ResizeObserver on the page's root where the browser has one (the bars showing
//   or hiding), a resolution query re-armed at each new pixel ratio (a move to another screen, the browser's zoom), and
//   fullscreenchange in either name.
// - The safe areas: a probe element whose padding room.css sets to env(safe-area-inset-*), read on each change.
// - The keyboard: the visual viewport's resize and scroll, where the browser has one; where a browser resizes the
//   layout viewport instead, the window got shorter and that is a re-fit (plan.md's departure B1).
import type { Insets } from "../compose/hud";

/** The window's measures, in CSS pixels. */
export interface WindowMeasures {
  readonly w: number;
  readonly h: number;
  /** The device pixel ratio. */
  readonly dpr: number;
  /** The root font size every rem is counted in. */
  readonly rem: number;
  readonly safe: Insets;
  /** The on-screen keyboard's inset over the window's foot. */
  readonly keyboard: number;
  /** The AI disclosure's strip as drawn in the HUD: its words' height and its padding, 0 before the HUD lays it out.
   *  Text spacing or a minimum font size can make it taller than the table gives (the review of 60b51de4, finding 3). */
  readonly strip: number;
}

/** What the window changed: a re-fit, or the keyboard's inset alone. */
export type ViewportChange = "refit" | "keyboard";

export interface Viewport {
  read(): WindowMeasures;
  /** Calls `listener` on each change; returns what stops it. */
  subscribe(listener: (what: ViewportChange) => void): () => void;
  dispose(): void;
}

const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The page's window, measured. */
export function createViewport(win: Window, doc: Document = win.document): Viewport {
  const probe = doc.createElement("div");
  probe.className = "hud-safe-probe";
  probe.setAttribute("aria-hidden", "true");
  doc.body.append(probe);
  const listeners = new Set<(what: ViewportChange) => void>();
  const tell = (what: ViewportChange): void => {
    for (const fn of [...listeners]) fn(what);
  };
  const refit = (): void => tell("refit");
  const keyboard = (): void => tell("keyboard");
  const number = (value: string | undefined): number => {
    const n = Number.parseFloat(value ?? "");
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const read = (): WindowMeasures => {
    const root = doc.documentElement;
    const style = typeof win.getComputedStyle === "function" ? win.getComputedStyle(probe) : null;
    const safe: Insets = style
      ? {
          top: number(style.paddingTop),
          right: number(style.paddingRight),
          bottom: number(style.paddingBottom),
          left: number(style.paddingLeft),
        }
      : NONE;
    const fontSize = typeof win.getComputedStyle === "function" ? number(win.getComputedStyle(root).fontSize) : 0;
    // The strip's natural height, but not in the stacked layout, whose header is the page's own. Before the first
    // layout the words are at the page's size; the HUD's size changes their box, and the observer below re-fits.
    const header = doc.querySelector<HTMLElement>("header.disclosure");
    const words = header?.querySelector("p");
    const hud = root.getAttribute("data-hud") !== "stacked";
    let strip = 0;
    if (hud && header && words && typeof win.getComputedStyle === "function") {
      const pad = win.getComputedStyle(header);
      strip = words.getBoundingClientRect().height + number(pad.paddingTop) + number(pad.paddingBottom);
    }
    const vv = win.visualViewport;
    const h = win.innerHeight;
    // What the visual viewport loses at its foot, while the visitor hasn't pinch-zoomed: a zoom shrinks it too, and is
    // no keyboard.
    const inset = vv && vv.scale <= 1.01 ? Math.max(0, h - vv.height - vv.offsetTop) : 0;
    return {
      w: root.clientWidth || win.innerWidth,
      h,
      dpr: win.devicePixelRatio || 1,
      rem: fontSize || 16,
      safe,
      keyboard: Math.round(inset),
      strip,
    };
  };

  // The pixel ratio: a query for the current one, re-armed whenever it stops matching.
  let ratioQuery: MediaQueryList | null = null;
  const onRatio = (): void => {
    arm();
    refit();
  };
  const arm = (): void => {
    ratioQuery?.removeEventListener("change", onRatio);
    ratioQuery = typeof win.matchMedia === "function" ? win.matchMedia(`(resolution: ${read().dpr}dppx)`) : null;
    ratioQuery?.addEventListener("change", onRatio);
  };
  arm();

  win.addEventListener("resize", refit);
  doc.addEventListener("fullscreenchange", refit);
  doc.addEventListener("webkitfullscreenchange", refit);
  const Observer = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  const observer = typeof Observer === "function" ? new Observer(() => refit()) : null;
  observer?.observe(doc.documentElement);
  // The strip's words, whose box text spacing or a font size changes without the window changing.
  const stripWords = doc.querySelector("header.disclosure p");
  if (stripWords) observer?.observe(stripWords);
  win.visualViewport?.addEventListener("resize", keyboard);
  win.visualViewport?.addEventListener("scroll", keyboard);

  return {
    read,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      ratioQuery?.removeEventListener("change", onRatio);
      win.removeEventListener("resize", refit);
      doc.removeEventListener("fullscreenchange", refit);
      doc.removeEventListener("webkitfullscreenchange", refit);
      observer?.disconnect();
      win.visualViewport?.removeEventListener("resize", keyboard);
      win.visualViewport?.removeEventListener("scroll", keyboard);
      probe.remove();
    },
  };
}
