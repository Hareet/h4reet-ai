// The narration display (spec 002, T053; FR-011, SC-006; contracts/narration.md §4; research.md R-07). When the visitor
// selects an item in the interactive resume (its `room:item-selected` event), the item's script for the visitor's path
// shows beside it:
//   start       the first word at once, in the selection's own event, so it paints with the next frame (SC-006's
//               "within 1 s" is measured from the click to the first word painted);
//   pace        then a word every 375 ms, 160 words a minute, until the script is shown whole;
//   assistive   the whole script goes to the panel's polite live region at the start; the word-by-word copy is hidden
//               from assistive technology, so the script is read once;
//   another     a new selection stops the current one at once and starts the new one (FR-011); so does selecting the
//               same item again, and closing the resume stops it;
//   draft       a draft, which only a drafts build (ROOM_DRAFTS=1) publishes, plays under a "Draft" label; an item whose
//               script the build left out shows no narration.
// The voice (Phase 9, ADR 0011) will drive the same words from the audio's word timings. Nothing here fetches, stores,
// or sends anything: the words come from room-data.json, which the room already loaded.
import type { NarrationPath, RoomNarration, Narration } from "./data";

export const WORDS_PER_MINUTE = 160;
/** One word's time on screen: 375 ms at 160 words a minute. */
export const WORD_MS = 60_000 / WORDS_PER_MINUTE;
export const DRAFT_LABEL = "Draft";

/** The display's timers: the page's own by default, a fake one in tests. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

function windowClock(win: Window): Clock {
  return {
    now: () => win.performance.now(),
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: (handle) => win.clearTimeout(handle as number),
  };
}

export interface NarrationOptions {
  /** room-data.json's narration; called when the resume first opens, and again only if that failed. */
  load: () => Promise<RoomNarration>;
  /** The visitor's path, chosen once at the start of the visit (FR-002). */
  path: () => NarrationPath;
  clock?: Clock;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The panel's polite live region, made once, before the first selection, so its first change is announced. */
function liveRegion(doc: Document, panel: HTMLElement): HTMLElement {
  const found = panel.querySelector<HTMLElement>("[data-narration-live]");
  if (found) return found;
  const live = el(doc, "p", { class: "narration-live", "aria-live": "polite", "data-narration-live": "" });
  panel.append(live);
  return live;
}

/** Wires the display to the interactive resume's selections in this document. */
export function wireNarration(doc: Document, options: NarrationOptions): void {
  const win = doc.defaultView;
  const clock = options.clock ?? (win ? windowClock(win) : null);
  if (!clock) return;

  let data: RoomNarration | null = null;
  let loading: Promise<RoomNarration | null> | null = null;
  const ensure = (): Promise<RoomNarration | null> => {
    if (!loading) {
      loading = options.load().then(
        (loaded) => {
          data = loaded;
          return loaded;
        },
        () => {
          loading = null;
          return null;
        },
      );
    }
    return loading;
  };

  // One region, moved beside the selected item: its label and its words.
  const region = el(doc, "div", { class: "narration", "data-narration": "" });
  const label = el(doc, "p", { class: "narration-label" }, DRAFT_LABEL);
  const words = el(doc, "p", { class: "narration-words", "aria-hidden": "true" });
  region.append(label, words);

  let timer: unknown = null;
  let selection = 0;
  const stop = (): void => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };

  const play = (panel: HTMLElement, button: HTMLElement, narration: Narration | undefined, mine: number): void => {
    if (mine !== selection) return;
    stop();
    const live = liveRegion(doc, panel);
    if (!narration) {
      region.remove();
      words.textContent = "";
      live.textContent = "";
      return;
    }
    const list = narration.words.split(/\s+/).filter(Boolean);
    label.hidden = narration.approved;
    button.after(region);
    live.textContent = narration.words;
    const start = clock.now();
    let shown = 0;
    const step = (): void => {
      timer = null;
      if (mine !== selection) return;
      if (region.closest("[hidden]")) return; // the resume closed: nothing plays behind it
      const due = Math.min(list.length, Math.floor((clock.now() - start) / WORD_MS) + 1);
      if (due > shown) {
        shown = due;
        words.textContent = list.slice(0, shown).join(" ");
      }
      if (shown < list.length) timer = clock.setTimeout(step, start + shown * WORD_MS - clock.now());
    };
    step();
  };

  doc.addEventListener("room:resume-opened", (event) => {
    const panel = event.target as HTMLElement | null;
    if (panel?.nodeType === 1) liveRegion(doc, panel);
    void ensure();
  });

  doc.addEventListener("room:item-selected", (event) => {
    const mine = ++selection;
    stop();
    const panel = event.target as HTMLElement | null;
    const id = (event as CustomEvent<{ id?: unknown }>).detail?.id;
    if (!panel || panel.nodeType !== 1 || typeof id !== "string") return;
    const button = [...panel.querySelectorAll<HTMLElement>("button[data-item-id]")].find(
      (b) => b.getAttribute("data-item-id") === id,
    );
    if (!button) return;
    const path = options.path();
    if (data) {
      play(panel, button, data.get(id)?.[path], mine);
    } else {
      void ensure().then((loaded) => play(panel, button, loaded?.get(id)?.[path], mine));
    }
  });
}
