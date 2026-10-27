// The live faces' typefaces (spec 004; FR-061; R-37, R-38): each typeface the index names, loaded through
// document.fonts, its files the site's own (src/fonts.css's @font-face rules, from apps/web/fonts/). A face draws once
// its typeface has arrived, or after TYPEFACE_WAIT_MS with its fallback family, the generic one the compositor read
// from the font (monospace or sans-serif), and again when the typeface arrives. A page without document.fonts, as in
// jsdom, counts every typeface as late. The words and their layout never wait: the text copy reads them whatever the
// family (words.ts), and the grids are the compositor's, from the typeface's own metrics.
import type { Clock } from "../clock";
import type { RoomIndex } from "../compose/bundle";
import type { TypefaceUse } from "../compose/vocabulary";

/** How long a face waits for its typeface before it draws with the fallback (FR-061). */
export const TYPEFACE_WAIT_MS = 2000;

export interface TypefaceLoader {
  /** The family list a use draws in now: the typeface and its fallback once it has arrived, the fallback alone once
   *  it is late, or null while it may still arrive in time, when the face doesn't draw yet. */
  family(use: TypefaceUse): string | null;
  /** Calls `fn` whenever a family changes; returns what stops it. */
  onChange(fn: () => void): () => void;
  /** Stops the wait. */
  dispose(): void;
}

/** What the loader reads of the page: its font set, where it has one. */
interface FontSet {
  load(font: string): Promise<unknown>;
}

/** Loads the index's typefaces on this page. */
export function loadTypefaces(doc: Document, clock: Clock, typefaces: RoomIndex["typefaces"]): TypefaceLoader {
  const fonts = (doc as { fonts?: FontSet }).fonts;
  const arrived = new Set<string>();
  const listeners = new Set<() => void>();
  let late = false;
  let disposed = false;
  const key = (t: { family: string; weight: number }): string => `${t.weight} ${t.family}`;
  // Each listener in turn: one that throws stops none of the others (the review of T194, nit 4).
  const changed = (): void => {
    if (disposed) return;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        // A face that can't redraw keeps its last drawing; the others still redraw.
      }
    }
  };
  // Typefaces that arrive together redraw the faces once.
  let queued = false;
  const arrive = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      changed();
    });
  };
  const timer = clock.setTimeout(() => {
    late = true;
    changed();
  }, TYPEFACE_WAIT_MS);
  if (fonts && typeof fonts.load === "function") {
    const seen = new Set<string>();
    for (const t of typefaces) {
      if (seen.has(key(t))) continue;
      seen.add(key(t));
      // The family quoted, as a font shorthand needs a name with spaces to be; a size is required and any will do.
      fonts
        .load(`${t.weight} 16px "${t.family}"`)
        .then(() => {
          arrived.add(key(t));
          arrive();
        })
        .catch(() => undefined);
    }
  }
  return {
    family(use) {
      const t = typefaces.find((x) => x.use === use);
      if (!t) return late ? "sans-serif" : null;
      if (arrived.has(key(t))) return `${t.family}, ${t.fallback}`;
      return late ? t.fallback : null;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      disposed = true;
      clock.clearTimeout(timer);
      listeners.clear();
    },
  };
}
