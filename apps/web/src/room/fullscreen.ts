// Full screen (spec 005; FR-036 to FR-042; plan.md §8, PD-19 to PD-21): the page's root in full screen, never the room's
// element alone, so the AI disclosure, every panel, the resume, the live regions, and "Around the room" stay in it (D4).
// - Support is what the browser reports: `fullscreenEnabled` with a request function, or WebKit's prefixed names where
//   the unprefixed ones are missing (iPadOS's Safari before 16.4). An iPhone's browsers report none, and the room offers
//   no control there (Q4, provisional). Never decided by the browser's name.
// - A request asks to hide the browser's navigation UI; a rejected request or a fullscreenerror is a refusal, which the
//   room says once and never retries (FR-005).
// - A change by any means (the control, the shortcut, the browser's Escape or its own exit, a tab switch) reaches the
//   listeners, by either event's name.
// - Escape is the browser's while the page is in full screen (D3): every Escape handler in the room asks
//   browserOwnsEscape first, so the press that leaves full screen can't also leave the walking view, stop a turn, or
//   close a sheet. The room never locks the keyboard, the orientation, or the pointer (FR-041).

type FullscreenDoc = Document & {
  readonly webkitFullscreenEnabled?: boolean;
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: (options?: FullscreenOptions) => void };

/** The page's element in full screen, by either name, or null. */
export function fullscreenElement(doc: Document): Element | null {
  const d = doc as FullscreenDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Whether an Escape now is the browser's: the page is in full screen (PD-21). */
export function browserOwnsEscape(doc: Document): boolean {
  return fullscreenElement(doc) !== null;
}

export interface Fullscreen {
  /** Whether the browser offers full screen to this page. */
  readonly supported: boolean;
  /** Whether the page is in full screen now. */
  readonly active: boolean;
  /** Asks for the page's root in full screen, or to leave it. */
  toggle(): void;
  /** Hears every change, with whether the page is now in full screen; returns what stops it. */
  onChange(listener: (active: boolean) => void): () => void;
  /** Hears every refusal; returns what stops it. */
  onRefused(listener: () => void): () => void;
  dispose(): void;
}

export function createFullscreen(doc: Document): Fullscreen {
  const d = doc as FullscreenDoc;
  const root = doc.documentElement as FullscreenRoot;
  const unprefixed = d.fullscreenEnabled === true && typeof root.requestFullscreen === "function";
  const webkit = d.webkitFullscreenEnabled === true && typeof root.webkitRequestFullscreen === "function";
  const changes = new Set<(active: boolean) => void>();
  const refusals = new Set<() => void>();
  const changed = (): void => {
    const on = fullscreenElement(doc) !== null;
    for (const fn of [...changes]) fn(on);
  };
  const refused = (): void => {
    for (const fn of [...refusals]) fn();
  };
  /** A promise's rejection, where a request gives one. */
  const caught = (result: unknown, onError: () => void): void => {
    if (result && typeof (result as Promise<void>).catch === "function") (result as Promise<void>).catch(onError);
  };
  for (const name of ["fullscreenchange", "webkitfullscreenchange"]) doc.addEventListener(name, changed);
  for (const name of ["fullscreenerror", "webkitfullscreenerror"]) doc.addEventListener(name, refused);

  return {
    supported: unprefixed || webkit,
    get active() {
      return fullscreenElement(doc) !== null;
    },
    toggle() {
      if (!(unprefixed || webkit)) return;
      if (fullscreenElement(doc) !== null) {
        const exit = unprefixed ? d.exitFullscreen : d.webkitExitFullscreen;
        try {
          caught(exit?.call(d), () => undefined);
        } catch {
          // The browser keeps full screen; its own exit stays.
        }
        return;
      }
      const request = unprefixed ? root.requestFullscreen : root.webkitRequestFullscreen;
      try {
        caught(request?.call(root, { navigationUI: "hide" }), refused);
      } catch {
        refused();
      }
    },
    onChange(listener) {
      changes.add(listener);
      return () => changes.delete(listener);
    },
    onRefused(listener) {
      refusals.add(listener);
      return () => refusals.delete(listener);
    },
    dispose() {
      changes.clear();
      refusals.clear();
      for (const name of ["fullscreenchange", "webkitfullscreenchange"]) doc.removeEventListener(name, changed);
      for (const name of ["fullscreenerror", "webkitfullscreenerror"]) doc.removeEventListener(name, refused);
    },
  };
}
