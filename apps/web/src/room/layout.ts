// The room's screen (spec 002, T044; contracts/room-scene.md §1, §5, §6): its heading, the toolbar ("Resume", "2D view",
// "Pause the room", the data-flow disclosure link), the stage, the "In the room" list, the conversation panel, "Around
// the room" (spec 004, FR-063), and the resume's panel, in that order, which is the Tab order: "Around the room" is a
// Tab stop of its own after the conversation (FR-065; Amendment B8; text-copy.ts). While the hand-off plays, every part
// a visitor acts on is inert; the offer of "Read the resume now" and "Keep it for later" comes when it ends. The
// layout's CSS (room.css) frames it from 320 CSS pixels wide, with the stage, the list, the text box, and the talk
// button on screen in portrait: its grid's areas run toolbar, stage, list, talk, around, resume, and in landscape
// "around" spans both columns before the resume; below a portrait width of 35rem, where five controls (spec 003's
// "Credits" among them once it lands) wrap to two rows, the stage gives up one toolbar row, and below 25rem the
// toolbar's type drops to 0.875rem, so the text box and the talk button stay on screen, a 320 × 568 one included
// (FR-047, FR-065; R-40; the review of T171, B1). The stage's placeholder note, the UI word standin.note, shows only
// while stand-ins are in use. Spec 009's stand-in line, the UI word twin.stand_in, is a paragraph of its own beside it
// (its FR-013; plan.md R-13), in 3D and 2D alike, since the note sits in the stage beside the view: the two stack at the
// stage's top left, over the view, taking no room in the layout and letting a pointer or a touch through to the scene.
// "Pause the room" (spec 004, FR-060, FR-065; Amendment B8; R-34), the UI word pause.button, is a toggle whose state
// is in aria-pressed; the room's motion store holds what it sets (motion.ts).
// Spec 005 (FR-008, FR-019 to FR-022; plan.md §2.3, §5.4, §6.1): the room's block fills the window, and the interface
// is a HUD laid over it. In Tab order, the room block holds the heading, the bar (the toolbar), the stage (its view, the
// canvas's place, and over it the clear box with the notes, the offer, and the walking control), and the panels (the
// list, then the conversation); "Around the room" and the resume follow it. applyHud sets the layout the room chose
// (compose/hud.ts) on the page's root, its data attributes and its sizes as CSS properties through the CSS object model
// (style.setProperty, which the CSP's style-src 'self' allows), never a style attribute; room.css places every docked
// box from them. The stage's view says what it holds in data-stage: loading and 2D sit in the clear area, 3D fills the
// window.
// Spec 012 (its Amendment L10, which amends spec 005's FR-019; FR-018, FR-024 to FR-027): in 3D the stage's loading line,
// "Loading the room…", gives its place to the loader, whose card insertLoader puts after the room's block and before
// "Around the room"; setLoading sets data-loading on the page's root, which tints the room's parts (loading/loading.css),
// and makes "Around the room" inert while the loader shows. The AI disclosure's strip and the stage's notes are never
// tinted or covered: the card sits below the strip and the notes' reserve, or first in the page's flow when stacked.
import type { Box, HudLayout, HudMetrics, HudState } from "./compose/hud";
import { h } from "./dom";
import { icon } from "./hud/icons";
import type { IconName } from "./hud/icons";

/** The layout the room applies: the HUD's boxes in their layout, or the stacked layout. */
export interface HudApplied {
  readonly layout: HudLayout | "stacked";
  readonly state: HudState;
  readonly metrics: HudMetrics;
  /** The docked boxes' sizes: the strip's and the bar's heights, the column's width, and the dock's height. */
  readonly strip: number;
  readonly bar: number;
  readonly column: number;
  readonly dock: number;
  readonly clear: Box;
  /** Spec 014 (FR-003, FR-009): the frame area the room is framed into, the clear area where there is none. */
  readonly frame: Box;
  /** The stage's notes' reserve at the clear area's top, which no sheet reaches into (compose/hud.ts's notesReserve). */
  readonly notes: number;
  /** The on-screen keyboard's inset over the window's foot. */
  readonly keyboard: number;
}

export interface RoomLayout {
  readonly element: HTMLElement;
  /** The room's h1, which holds focus while the hand-off plays. */
  readonly heading: HTMLElement;
  readonly resumeButton: HTMLButtonElement;
  readonly flatButton: HTMLButtonElement;
  /** "Pause the room", a toggle: its state in aria-pressed (spec 004, FR-060). */
  readonly pauseButton: HTMLButtonElement;
  /** Where the canvas or the 2D drawing goes. */
  readonly view: HTMLElement;
  readonly resumePanel: HTMLElement;
  readonly resumeHeading: HTMLElement;
  /** Where the resume view renders. */
  readonly resumeBody: HTMLElement;
  /** Makes the toolbar, the stage, the list, the conversation, and the resume inert, or not. */
  setInteractive(on: boolean): void;
  /** Offers the resume now or later, with focus on "Read the resume now"; returns what removes the offer. */
  offer(now: () => void, later: () => void): () => void;
  /** The room is in 2D for the rest of the visit: "2D view" stays, marked unavailable. */
  markFlat(): void;
  /** Shows the placeholder note while stand-ins are in use: from the bundle, or once a piece's load falls back. */
  setPlaceholders(on: boolean): void;
  /** Shows whether the room is paused, in "Pause the room"'s aria-pressed. */
  setPaused(on: boolean): void;
  /** Spec 008's walking control (FR-020, FR-021; R-09): in the stage's bottom-right corner, inert with the rest. */
  readonly walkButton: HTMLButtonElement;
  /** Offers the walking control, in 3D after the hand-off's offer, or takes it away, in 2D. */
  setWalkOffered(on: boolean): void;
  /** The walking view on or off: the control's words, and the view's name, role, and focus while walking (R-13). */
  setWalking(on: boolean): void;
  /** The clear box, over the stage at the clear area (spec 005): the notes, the offer, and the walking control. */
  readonly clear: HTMLElement;
  /** Sets the HUD's layout on the page's root: data-hud, data-list, and the sizes as CSS properties (spec 005). */
  applyHud(applied: HudApplied): void;
  /** What the stage's view holds: loading, the 3D canvas, or the 2D drawing (or flat-failed's line). */
  setStage(what: "loading" | "3d" | "2d"): void;
  /** The glass's blur, on at quality levels 0 and 1 and off from 2 (spec 005, FR-025; PD-17). */
  setBlur(on: boolean): void;
  /** Spec 005's full-screen control (FR-036; Q4, provisional), after "Pause the room", where the browser offers full
   *  screen; null where it doesn't. */
  readonly fullscreenButton: HTMLButtonElement | null;
  /** Whether the page is in full screen: the control's words and icon, and the walking view's instructions, which then
   *  say that Escape first leaves full screen (FR-039, FR-040). */
  setFullscreen(on: boolean): void;
  /** Spec 012 (FR-024 to FR-027; plan.md PD-18): the loader's state on the page's root, data-loading, which tints the
   *  room's parts: "on" while it shows, with "Around the room" inert too and the stage's "Loading the room…" line gone,
   *  the loader in its place; "leaving" while its card fades, "Around the room" reachable again; "off" after. */
  setLoading(state: "on" | "leaving" | "off"): void;
  /** Spec 012: puts the loader's card in the room, after the room's block and before "Around the room" (contract §5). */
  insertLoader(card: HTMLElement): void;
}

/** A HUD tile (spec 005, FR-026; plan.md §6.2): an icon over its words, the words its name. */
function tile<K extends "button" | "a">(
  doc: Document,
  tag: K,
  attributes: Record<string, string | number | boolean>,
  name: IconName,
  words: string,
): HTMLElementTagNameMap[K] {
  const cls = typeof attributes.class === "string" ? `${attributes.class} hud-tile` : "hud-tile";
  return h(
    doc,
    tag,
    { ...attributes, class: cls },
    icon(doc, name),
    h(doc, "span", { class: "hud-tile-words" }, words),
  ) as HTMLElementTagNameMap[K];
}

export function renderRoom(
  doc: Document,
  parts: {
    list: HTMLElement;
    talk: HTMLElement;
    /** "Around the room", after the conversation panel and outside the stage (spec 004, FR-063). */
    around: HTMLElement;
    /** The placeholder note's words: the UI word standin.note. */
    note: string;
    /** Spec 009's stand-in line: the UI word twin.stand_in while the index's copy holds it; empty for none. */
    standIn?: string;
    /** "Pause the room": the UI word pause.button. */
    pause: string;
    /** Spec 008's walking words: walk.enter, walk.leave, walk.region, and walk.help; and spec 005's helpFullscreen,
     *  walk.help_fullscreen. */
    walk?: {
      readonly enter: string;
      readonly leave: string;
      readonly region: string;
      readonly help: string;
      readonly helpFullscreen?: string;
    };
    /** Spec 005's full-screen control's words, fullscreen.enter and fullscreen.leave, where the browser offers full
     *  screen; absent, no control. */
    fullscreen?: { readonly enter: string; readonly leave: string };
  },
): RoomLayout {
  const heading = h(doc, "h1", { class: "visually-hidden", tabindex: -1 }, "The Author's work area");
  const resumeButton = tile(doc, "button", { type: "button" }, "resume", "Resume");
  const flatButton = tile(doc, "button", { type: "button" }, "flat", "2D view");
  const pauseButton = tile(doc, "button", { type: "button", "aria-pressed": "false" }, "pause", parts.pause);
  // Spec 005's full-screen control, its shortcut named to assistive technology and in its description (FR-037).
  const fs = parts.fullscreen;
  const fullscreenButton = fs
    ? tile(
        doc,
        "button",
        { type: "button", "aria-keyshortcuts": "Alt+Enter", "aria-describedby": "room-fullscreen-help" },
        "fullscreen",
        fs.enter,
      )
    : null;
  const fullscreenHelp = fs
    ? h(
        doc,
        "span",
        { id: "room-fullscreen-help", class: "visually-hidden" },
        "Shortcut: Alt+Enter, or Option+Return on a Mac.",
      )
    : null;
  const toolbar = h(
    doc,
    "div",
    { class: "room-toolbar hud-bar hud-glass", role: "group", "aria-label": "The room's controls" },
    resumeButton,
    flatButton,
    pauseButton,
    ...(fullscreenButton ? [fullscreenButton] : []),
    tile(doc, "a", { href: "./disclosure/" }, "data", "How data flows"),
    ...(fullscreenHelp ? [fullscreenHelp] : []),
  );
  // Until the 3D scene or the 2D drawing replaces it (at most SCENE_WAIT_MS after "Enter").
  const view = h(
    doc,
    "div",
    { class: "room-stage-view", "data-stage": "loading" },
    h(doc, "p", { class: "room-loading" }, "Loading the room…"),
  );
  const note = h(doc, "p", { class: "room-note", hidden: true }, parts.note);
  const walkWords: NonNullable<typeof parts.walk> = parts.walk ?? { enter: "", leave: "", region: "", help: "" };
  const walkButton = tile(
    doc,
    "button",
    { type: "button", class: "room-walk hud-glass", hidden: true },
    "walk",
    walkWords.enter,
  );
  const walkLabel = walkButton.querySelector(".hud-tile-words") as HTMLElement;
  // The walking keys' instructions, read only while walking: hidden otherwise, which aria-describedby still reads.
  const walkHelp = h(doc, "p", { id: "room-walk-help", class: "visually-hidden", hidden: true }, walkWords.help);
  const standIn = h(doc, "p", { class: "room-note room-stand-in", hidden: !parts.standIn }, parts.standIn ?? "");
  const notes = h(doc, "div", { class: "room-notes" }, note, standIn);
  const clear = h(doc, "div", { class: "room-clear" }, notes, walkButton, walkHelp);
  const stage = h(doc, "div", { class: "room-stage" }, view, clear);
  const panels = h(doc, "div", { class: "hud-panels hud-glass" }, parts.list, parts.talk);
  const resumeHeading = h(doc, "h2", { id: "resume-heading", tabindex: -1 }, "The resume");
  const resumeBody = h(doc, "div", { class: "resume-body" });
  const resumePanel = h(
    doc,
    "section",
    { class: "resume-panel", "aria-labelledby": "resume-heading", hidden: true },
    resumeHeading,
    resumeBody,
  );
  const block = h(doc, "div", { class: "room-block" }, heading, toolbar, stage, panels);
  const element = h(doc, "div", { class: "room" }, block, parts.around, resumePanel);
  const loadingLine = view.querySelector(".room-loading");
  const root = doc.documentElement;
  const controls = [toolbar, view, walkButton, parts.list, parts.talk, resumePanel];

  return {
    element,
    heading,
    resumeButton,
    flatButton,
    pauseButton,
    view,
    resumePanel,
    resumeHeading,
    resumeBody,
    setInteractive(on) {
      for (const part of controls) part.toggleAttribute("inert", !on);
    },
    offer(now, later) {
      const nowButton = h(doc, "button", { type: "button" }, "Read the resume now");
      const laterButton = h(doc, "button", { type: "button" }, "Keep it for later");
      nowButton.addEventListener("click", now);
      laterButton.addEventListener("click", later);
      const panel = h(
        doc,
        "div",
        { class: "room-offer", role: "group", "aria-labelledby": "room-offer-text" },
        h(doc, "p", { id: "room-offer-text" }, "The twin handed you the Author's resume."),
        nowButton,
        laterButton,
      );
      clear.append(panel);
      nowButton.focus();
      return () => panel.remove();
    },
    markFlat() {
      flatButton.setAttribute("aria-disabled", "true");
    },
    setPlaceholders(on) {
      note.hidden = !on || parts.note === "";
    },
    setPaused(on) {
      pauseButton.setAttribute("aria-pressed", String(on));
    },
    walkButton,
    setWalkOffered(on) {
      walkButton.hidden = !on || walkWords.enter === "";
      root.setAttribute("data-walk", walkButton.hidden ? "off" : "on");
    },
    setWalking(on) {
      walkLabel.textContent = on ? walkWords.leave : walkWords.enter;
      walkHelp.hidden = !on;
      // The view takes focus while walking: its name, its instructions, and a role that passes the keys through, never
      // the canvas inside it, which stays aria-hidden (R-13).
      if (on) {
        view.setAttribute("tabindex", "0");
        view.setAttribute("role", "application");
        view.setAttribute("aria-label", walkWords.region);
        view.setAttribute("aria-describedby", "room-walk-help");
      } else for (const name of ["tabindex", "role", "aria-label", "aria-describedby"]) view.removeAttribute(name);
    },
    clear,
    applyHud(applied) {
      root.setAttribute("data-hud", applied.layout);
      root.setAttribute("data-list", applied.state.list);
      const px = (n: number): string => `${n}px`;
      const { safe } = applied.metrics;
      const sizes: [string, number][] = [
        ["--strip-h", applied.strip],
        ["--bar-h", applied.bar],
        ["--column-w", applied.column],
        ["--dock-h", applied.dock],
        ["--clear-x", applied.clear.x],
        ["--clear-y", applied.clear.y],
        ["--clear-w", applied.clear.w],
        ["--clear-h", applied.clear.h],
        ["--safe-top", safe.top],
        ["--safe-right", safe.right],
        ["--safe-bottom", safe.bottom],
        ["--safe-left", safe.left],
        ["--keyboard", applied.keyboard],
        ["--notes-h", applied.notes],
        // Spec 014 (FR-003; plan.md §2.5, §3.2): the frame area, where the 2D drawing's view sits.
        ["--frame-x", applied.frame.x],
        ["--frame-y", applied.frame.y],
        ["--frame-w", applied.frame.w],
        ["--frame-h", applied.frame.h],
      ];
      for (const [name, value] of sizes) root.style.setProperty(name, px(value));
      // The stacked layout's header is sticky in the page's flow, its own height: the scroll padding takes its 4rem
      // fallback there, as before spec 005.
      if (applied.layout === "stacked") root.style.removeProperty("--strip-h");
    },
    setStage(what) {
      view.setAttribute("data-stage", what);
    },
    setBlur(on) {
      root.setAttribute("data-blur", on ? "on" : "off");
    },
    fullscreenButton,
    setFullscreen(on) {
      if (fullscreenButton && fs) {
        const words = fullscreenButton.querySelector(".hud-tile-words");
        if (words) words.textContent = on ? fs.leave : fs.enter;
        fullscreenButton.querySelector("svg")?.replaceWith(icon(doc, on ? "fullscreen-exit" : "fullscreen"));
      }
      const extra = walkWords.helpFullscreen ?? "";
      walkHelp.textContent = on && extra !== "" ? `${walkWords.help} ${extra}` : walkWords.help;
    },
    setLoading(state) {
      if (state === "off") root.removeAttribute("data-loading");
      else root.setAttribute("data-loading", state);
      parts.around.toggleAttribute("inert", state === "on");
      if (state === "on") loadingLine?.remove();
    },
    insertLoader(card) {
      block.after(card);
    },
  };
}
