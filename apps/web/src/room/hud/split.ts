// The split layout's parts (spec 018; FR-002, FR-005 to FR-009, FR-012, FR-013, FR-016; plan.md §3, §4, §9): around the
// conversation panel and the list the room already has, never in place of them. The text box, the log, Send, and the
// list's buttons keep their elements and handlers; this module adds the title's hint, the emblem and the three stats,
// the frame, and the portrait to the panel, and "Back", the label, and the selected entry's strokes and confirm key
// cap to the list, and keeps the panel's two states: `bar` at rest (the title and the text box row) and `open`.
// - The panel's decoration exists only while it is open and the split layout shows; closing removes it, and the log and
//   the text box stay where they are, so a resize across 48rem loses nothing (plan.md P2).
// - The selected entry is the piece focused or targeted, else the one hovered, else the one the open conversation is
//   about (P7); it carries aria-current and the strokes; no other row changes size.
// - Escape: the turn out stops first (talk.ts, which prevents the default); while walking, the walking view takes it;
//   else it closes the panel to the bar and moves focus to the selected entry (FR-009). In full screen the browser's.
// - Every decoration is made inside its own try: a part that throws shows its plain form (a 1 px border, no strokes,
//   the silhouette, text labels) and every control still works (FR-002; plan.md §9).
// It makes no request: the portrait comes from the function the room gives it, spec 016's verified still (FR-003).
import "./split.css";

import { h, svg } from "../dom";
import { browserOwnsEscape } from "../fullscreen";
import { brushStrokePath, roughFramePath } from "./frame";
import { keycap } from "./keycap";
import type { Stat } from "./stats";

/** The words the split layout shows, from the index's UI words. */
export interface SplitWords {
  readonly select: string;
  readonly back: string;
  readonly close: string;
  readonly esc: string;
  readonly enter: string;
}

/** What draws each decoration; the room's own, and a test's that throws. */
export interface SplitDraw {
  readonly frame: (w: number, h: number, seed: number) => string;
  readonly stroke: (w: number, seed: number) => string;
  readonly keycap: (doc: Document, name: string) => HTMLElement;
  readonly portrait: (doc: Document) => HTMLElement;
}

export interface SplitOptions {
  /** The conversation panel's section and the list's section: the room's own elements. */
  readonly talk: HTMLElement;
  readonly list: HTMLElement;
  readonly words: SplitWords;
  /** The three stats, now. */
  readonly stats: () => readonly Stat[];
  /** Whether a turn is out, and whether the room is walking, now. */
  readonly turnOut: () => boolean;
  readonly walking: () => boolean;
  /** Spec 016's still as a data URL, fetched once through its verified path; absent or null, the silhouette stays. */
  readonly portrait?: () => Promise<string | null>;
  readonly draw?: Partial<SplitDraw>;
  /** The panel closed, by any means: the room's larger view ends with it. */
  readonly onClose?: () => void;
}

export interface Split {
  readonly active: boolean;
  readonly open: boolean;
  /** The split layout shows, or doesn't: the panel's state and its parts come and go with it; nothing else changes. */
  setActive(on: boolean): void;
  /** The open panel's size in CSS pixels, for the frame's path. */
  setSize(w: number, h: number): void;
  /** `focusHint` moves focus to the hint, where the control that opened the panel is gone from view. */
  openPanel(focusHint?: boolean): void;
  closePanel(focus?: boolean): void;
  /** The three stats' values again, after a tier or cost change. */
  refreshStats(): void;
  /** The piece the room targets (focus, the pointer on the scene), or none. */
  setTarget(id: string | null): void;
  /** The piece the open conversation is about, or none. */
  setConversation(feature: string | null): void;
  dispose(): void;
}

/** The title row above the frame, in CSS pixels at the default root size (room.css reads the same 2.75rem). */
const TITLE_PX = 44;
const FRAME_SEED = 17;

const DEFAULT_DRAW: SplitDraw = {
  frame: roughFramePath,
  stroke: brushStrokePath,
  keycap,
  portrait: (doc) =>
    svg(
      doc,
      "svg",
      { class: "split-silhouette", viewBox: "0 0 100 160", focusable: "false" },
      svg(doc, "circle", { cx: 50, cy: 38, r: 22 }),
      svg(doc, "path", { d: "M10 160 C10 105 30 84 50 84 C70 84 90 105 90 160 Z" }),
    ) as unknown as HTMLElement,
};

/** Runs a decoration, and gives its plain form (null) where it throws. */
function attempt<T>(make: () => T): T | null {
  try {
    return make();
  } catch {
    return null;
  }
}

export function createSplit(doc: Document, options: SplitOptions): Split {
  const draw: SplitDraw = { ...DEFAULT_DRAW, ...options.draw };
  const { talk, list, words } = options;
  const head = talk.querySelector<HTMLElement>(".talk-head");
  const sheet = talk.querySelector<HTMLElement>(".talk-sheet");
  const log = talk.querySelector<HTMLElement>(".talk-log");
  const buttons = (): HTMLButtonElement[] => [...list.querySelectorAll<HTMLButtonElement>("button[data-object-id]")];

  let active = false;
  let open = false;
  let size = { w: 600, h: 400 };
  let target: string | null = null;
  let hover: string | null = null;
  let conversation: string | null = null;
  let parts: HTMLElement[] = [];
  let listParts: HTMLElement[] = [];
  let portraitUrl: Promise<string | null> | null = null;
  let skipEscape = false;

  /** A button's label: the key cap and the word where the cap draws, the word alone where it doesn't. The key's name is
   *  in the button's accessible name either way (FR-016). */
  const labelled = (cls: string, word: string, key: string, name: string): HTMLButtonElement => {
    const cap = attempt(() => draw.keycap(doc, key));
    const b = h(
      doc,
      "button",
      { type: "button", class: cls, "aria-label": `${word}, ${name}` },
      ...(cap ? [cap] : []),
      h(doc, "span", { class: "split-word" }, word),
    );
    return b;
  };

  const selected = (): string | null => target ?? hover ?? conversation;

  const clearStrokes = (): void => {
    for (const el of list.querySelectorAll(".split-stroke, .split-confirm")) el.remove();
    for (const b of buttons()) {
      b.removeAttribute("data-selected");
      b.closest("li")?.removeAttribute("data-selected");
    }
  };

  /** Marks the selected entry: aria-current, the strokes above and below, the confirm key cap to its right. */
  const showSelection = (): void => {
    clearStrokes();
    const id = active ? selected() : null;
    // Out of the split layout the mark is spec 014's: the target's alone (app.ts's retarget writes it too).
    const current = active ? id : target;
    for (const b of buttons()) {
      if (b.dataset.objectId === current) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    }
    if (!active || id === null) return;
    const entry = buttons().find((b) => b.dataset.objectId === id);
    const li = entry?.closest("li");
    if (!entry || !li) return;
    entry.setAttribute("data-selected", "");
    li.setAttribute("data-selected", "");
    const add: Element[] = [];
    const stroke = (which: string, seed: number): void => {
      const d = attempt(() => draw.stroke(160, seed));
      if (d === null) return;
      const el = attempt(() =>
        svg(
          doc,
          "svg",
          {
            class: `split-stroke split-stroke-${which}`,
            viewBox: "0 0 160 8",
            preserveAspectRatio: "none",
            "aria-hidden": "true",
            focusable: "false",
          },
          svg(doc, "path", { d }),
        ),
      );
      if (el) add.push(el);
    };
    stroke("above", 3);
    stroke("below", 9);
    const cap = attempt(() => draw.keycap(doc, words.enter));
    if (cap) {
      cap.classList.add("split-confirm");
      add.push(cap);
    }
    li.append(...add);
  };

  const portraitSlot = (): HTMLElement => {
    const slot = h(doc, "div", { class: "split-portrait", "aria-hidden": "true" });
    const plain = attempt(() => draw.portrait(doc));
    if (plain) slot.append(plain);
    if (options.portrait) {
      portraitUrl ??= attempt(options.portrait)?.catch(() => null) ?? Promise.resolve(null);
      void portraitUrl.then((url) => {
        if (url === null || !slot.isConnected) return;
        const img = h(doc, "img", { class: "split-still", alt: "", src: url });
        slot.replaceChildren(img);
      });
    }
    return slot;
  };

  /** Builds the open panel's parts, each in its own try, each recorded the moment it is in the document, so `tear` takes
   *  away exactly what was added however far a failure got. */
  const build = (): void => {
    parts = [];
    const keep = (el: HTMLElement): void => {
      parts.push(el);
    };
    // The title's hint: one action, its key cap and a short label.
    attempt(() => {
      if (!head) return;
      const hint = labelled("split-hint", words.close, words.esc, "Escape");
      hint.addEventListener("click", () => api.closePanel(true));
      head.append(hint);
      keep(hint);
    });
    // The emblem, and beside it the three stats: a small label over a large value.
    attempt(() => {
      const emblem = attempt(() =>
        svg(
          doc,
          "svg",
          { class: "split-emblem", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
          svg(doc, "path", { d: "M4 5h16v10h-9l-4 4v-4H4z" }),
        ),
      );
      const stats = h(doc, "dl", { class: "split-stats" });
      for (const s of options.stats())
        stats.append(
          h(
            doc,
            "div",
            { class: `split-stat split-stat-${s.id}` },
            h(doc, "dt", {}, s.label),
            h(doc, "dd", {}, s.value),
          ),
        );
      const top = h(doc, "div", { class: "split-top" }, ...(emblem ? [emblem as unknown as HTMLElement] : []), stats);
      if (sheet && log && log.parentElement === sheet) sheet.insertBefore(top, log);
      else talk.append(top);
      keep(top);
    });
    // The frame, drawn from a seed; where it can't be, the panel's plain border (a class) stands in.
    const fh = Math.max(1, size.h - TITLE_PX);
    const frame = attempt(() => {
      const d = draw.frame(size.w, fh, FRAME_SEED);
      return svg(
        doc,
        "svg",
        {
          class: "split-frame",
          viewBox: `0 0 ${size.w} ${fh}`,
          preserveAspectRatio: "none",
          "aria-hidden": "true",
          focusable: "false",
        },
        svg(doc, "path", { d }),
      ) as unknown as HTMLElement;
    });
    if (frame) {
      talk.prepend(frame);
      keep(frame);
    } else talk.classList.add("split-plain");
    attempt(() => {
      const slot = portraitSlot();
      talk.append(slot);
      keep(slot);
    });
  };

  const tear = (): void => {
    for (const p of parts) p.remove();
    parts = [];
    talk.classList.remove("split-plain");
  };

  const build2 = (): void => {
    const b = labelled("split-back", words.back, words.esc, "Escape");
    b.hidden = !open;
    b.addEventListener("click", () => api.closePanel(true));
    const heading = list.querySelector(".room-list-heading");
    if (heading) heading.before(b);
    else list.prepend(b);
    const l = h(doc, "p", { class: "split-label" }, words.select);
    heading?.after(l);
    listParts = [b, l];
  };

  const sync = (): void => {
    if (active) {
      talk.setAttribute("data-panel", open ? "open" : "bar");
      if (open && parts.length === 0) build();
      if (!open) tear();
      if (listParts.length === 0) build2();
      for (const p of listParts) if (p.classList.contains("split-back")) p.hidden = !open;
    } else {
      tear();
      for (const p of listParts) p.remove();
      listParts = [];
      talk.removeAttribute("data-panel");
    }
    showSelection();
  };

  // List hover: the pointer's entry is the selected one while nothing is focused or targeted.
  list.addEventListener("pointerover", (event) => {
    const b = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-object-id]");
    hover = b?.dataset.objectId ?? null;
    showSelection();
  });
  // A tap leaves no pointerleave: on touch the hover ends with the press.
  list.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    hover = null;
    showSelection();
  });
  list.addEventListener("pointerleave", () => {
    hover = null;
    showSelection();
  });

  // Escape: the turn out or the walking view takes it first, as they did before; seen at capture, before they act.
  const onCapture = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    // The larger view's Escape, inside the conversation, is talk.ts's: it ends the larger view, which closes the panel.
    const inTalk = talk.contains(event.target as Node | null);
    skipEscape = options.turnOut() || options.walking() || (inTalk && talk.getAttribute("data-larger") === "on");
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !active || !open || event.defaultPrevented || skipEscape) return;
    if (browserOwnsEscape(doc)) return;
    event.preventDefault();
    api.closePanel(true);
  };
  doc.addEventListener("keydown", onCapture, true);
  doc.addEventListener("keydown", onKey);

  const api: Split = {
    get active() {
      return active;
    },
    get open() {
      return open;
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      sync();
    },
    setSize(w, h2) {
      if (Math.abs(w - size.w) < 1 && Math.abs(h2 - size.h) < 1) return;
      size = { w, h: h2 };
      // The frame's path and viewBox in place: the parts, and the focus in them, stay where they are.
      const frame = talk.querySelector(".split-frame");
      const path = frame?.querySelector("path");
      const fh = Math.max(1, size.h - TITLE_PX);
      if (frame && path) {
        const d = attempt(() => draw.frame(size.w, fh, FRAME_SEED));
        if (d !== null) {
          frame.setAttribute("viewBox", `0 0 ${size.w} ${fh}`);
          path.setAttribute("d", d);
        }
      }
    },
    openPanel(focusHint = false) {
      // Only where the split layout shows: a conversation in a narrower window leaves the bar for a later, wider one.
      if (!active) return;
      if (!open) {
        open = true;
        sync();
      }
      if (focusHint) talk.querySelector<HTMLElement>(".split-hint")?.focus();
    },
    closePanel(focus = false) {
      if (!open) return;
      open = false;
      sync();
      options.onClose?.();
      if (focus) {
        const id = selected();
        (buttons().find((b) => b.dataset.objectId === id) ?? buttons()[0])?.focus();
      }
    },
    refreshStats() {
      if (parts.length === 0) return;
      const values = options.stats();
      for (const s of values) {
        const dd = talk.querySelector(`.split-stat-${s.id} dd`);
        if (dd && dd.textContent !== s.value) dd.textContent = s.value;
      }
    },
    setTarget(id) {
      target = id;
      showSelection();
    },
    setConversation(feature) {
      conversation = feature;
      if (feature !== null) api.openPanel();
      showSelection();
    },
    dispose() {
      doc.removeEventListener("keydown", onCapture, true);
      doc.removeEventListener("keydown", onKey);
    },
  };
  return api;
}
