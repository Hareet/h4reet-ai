// The narration display (spec 002, T053; FR-011, SC-006; contracts/narration.md §4; research.md R-07). In the room,
// src/room/resume-port.ts's adapter drives it: it prepares the resume's panel when the resume opens, passes each
// selected item with the visitor's chosen path, and stops it when the resume closes. The item's script for that path
// shows beside the item:
//   start       the first word at once, in the selection's own event, so it paints with the next frame (SC-006's
//               "within 1 s" is measured from the click to the first word painted);
//   pace        then a word every 375 ms, 160 words a minute, timed from the start, until the script is shown whole;
//   assistive   the whole script goes to the panel's polite live region at the start; the word-by-word copy is hidden
//               from assistive technology, so the script is read once;
//   the AI      a line above the words says the AI twin narrates them, so the twin's words never show without it
//               (FR-004; the page's AI disclosure, sticky at the top, says it too);
//   another     a new selection stops the current one at once and starts the new one (FR-011); so does selecting the
//               same item again; closing the resume stops it and takes the words away;
//   draft       a draft, which only a drafts build (ROOM_DRAFTS=1) publishes, plays under a "Draft" label; an item whose
//               script the build left out shows no narration.
// The voice (Phase 9, ADR 0011) will drive the same words from the audio's word timings. Nothing here fetches, stores,
// or sends anything: the words come from room-data.json, which the room already loaded for the resume.
import type { Narration, NarrationPath, RoomNarration } from "./data";

export const WORDS_PER_MINUTE = 160;
/** One word's time on screen: 375 ms at 160 words a minute. */
export const WORD_MS = 60_000 / WORDS_PER_MINUTE;
export const DRAFT_LABEL = "Draft";
export const NARRATION_AI_LINE = "The AI twin narrates this, not the Author.";

/** The display's timers: the page's own by default, the room's or a fake one in tests. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

function windowClock(win: Window): Clock {
  return {
    now: () => win.performance.now(),
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: (id) => win.clearTimeout(id),
  };
}

export interface NarrationSource {
  /** room-data.json's narration; called when the resume first opens, and again only if that failed. */
  load: () => Promise<RoomNarration>;
  clock?: Clock;
}

export interface Narrator {
  /** The resume's panel is on screen: make its polite live region now, before the first selection, so its first
   * change is announced, and start loading the scripts. */
  prepare(panel: HTMLElement): void;
  /** An item was selected in the panel: show its script for the path beside it, stopping any other. */
  select(panel: HTMLElement, id: string, path: NarrationPath): void;
  /** Stop at once, and take the words and the live region's text away. */
  stop(): void;
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

function liveRegion(doc: Document, panel: HTMLElement): HTMLElement {
  const found = panel.querySelector<HTMLElement>("[data-narration-live]");
  if (found) return found;
  const live = el(doc, "p", { class: "narration-live", "aria-live": "polite", "data-narration-live": "" });
  panel.append(live);
  return live;
}

export function createNarrator(doc: Document, source: NarrationSource): Narrator {
  const win = doc.defaultView;
  const clock = source.clock ?? (win ? windowClock(win) : null);

  let data: RoomNarration | null = null;
  let loading: Promise<RoomNarration | null> | null = null;
  const ensure = (): Promise<RoomNarration | null> => {
    if (!loading) {
      loading = source.load().then(
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

  // One region, moved beside the selected item: the AI line, the draft label, and the words.
  const region = el(doc, "div", { class: "narration", "data-narration": "" });
  const ai = el(doc, "p", { class: "narration-ai" }, NARRATION_AI_LINE);
  const label = el(doc, "p", { class: "narration-label" }, DRAFT_LABEL);
  const words = el(doc, "p", { class: "narration-words", "aria-hidden": "true" });
  region.append(ai, label, words);

  let timer: number | null = null;
  let selection = 0;
  let live: HTMLElement | null = null;

  const halt = (): void => {
    if (timer !== null) clock?.clearTimeout(timer);
    timer = null;
  };

  const play = (panel: HTMLElement, button: HTMLElement, narration: Narration | undefined, mine: number): void => {
    if (mine !== selection || !clock) return;
    halt();
    live = liveRegion(doc, panel);
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
      const due = Math.min(list.length, Math.floor((clock.now() - start) / WORD_MS) + 1);
      if (due > shown) {
        shown = due;
        words.textContent = list.slice(0, shown).join(" ");
      }
      if (shown < list.length) timer = clock.setTimeout(step, start + shown * WORD_MS - clock.now());
    };
    step();
  };

  return {
    prepare(panel) {
      live = liveRegion(doc, panel);
      void ensure();
    },
    select(panel, id, path) {
      const mine = ++selection;
      halt();
      const button = [...panel.querySelectorAll<HTMLElement>("button[data-item-id]")].find(
        (b) => b.getAttribute("data-item-id") === id,
      );
      if (!button) return;
      if (data) {
        play(panel, button, data.get(id)?.[path], mine);
      } else {
        void ensure().then((loaded) => play(panel, button, loaded?.get(id)?.[path], mine));
      }
    },
    stop() {
      selection += 1;
      halt();
      region.remove();
      words.textContent = "";
      if (live) live.textContent = "";
    },
  };
}
