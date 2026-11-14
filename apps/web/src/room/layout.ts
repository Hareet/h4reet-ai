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
import type { Box, HudLayout, HudMetrics, HudState, SplitBoxes } from "./compose/hud";
import { h } from "./dom";
import { icon } from "./hud/icons";
import type { IconName } from "./hud/icons";
import { keycap } from "./hud/keycap";
import { attempt } from "./hud/split";

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
  /** Spec 014 (FR-017 to FR-021; plan.md §3.2): the column layout's compact clusters, compose/hud.ts's compactBoxes: the
   *  strip's place and width, the bar's width, and the column's height; and the log's rest height in the column, in
   *  CSS pixels. */
  readonly compact: {
    readonly strip: Box;
    readonly bar: Box;
    readonly column: Box | null;
    /** T053 (W19): the walking control's box, and where it sits. */
    readonly walk: Box;
    readonly walkPlace: "column" | "stage";
    /** Spec 024 (FR-012; plan.md §5.5): the "Eat" tile's box, compactBoxes's `eat`, for a 3D dinosaur visit; absent or
     *  null, none. */
    readonly eat?: Box | null;
  };
  readonly logRest: number;
  /** The stage's notes' reserve at the clear area's top, which no sheet reaches into (compose/hud.ts's notesReserve). */
  readonly notes: number;
  /** The on-screen keyboard's inset over the window's foot. */
  readonly keyboard: number;
  /** Spec 018 (FR-001, FR-004): the split layout's boxes where the window takes it; absent or null, today's layout. */
  readonly split?: SplitBoxes | null;
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
  /** Shows the placeholder note while stand-ins are in use: from the bundle, or once a piece's load falls back. Since
   *  spec 014 (its FR-053, FR-054; PD-18) it says what is missing: the room's pieces (standin.note), the visitor's
   *  figure in 3D (standin.avatar), or both in one note, the pieces' first; hidden where nothing is. */
  setPlaceholders(on: { readonly pieces: boolean; readonly figure: boolean }): void;
  /** Spec 016 (FR-014; contracts/twin-states.md §4): the line slot's words, in place: the twin's line while its own
   *  picture shows, the stand-in line otherwise. The paragraph isn't a live region, so nothing is announced. */
  setLine(words: string): void;
  /** Spec 020 (FR-007; plan.md R-02): the likeness line of a visitor-avatar model any figure shows, a note of its own
   *  after the line slot's, only while it has words: "" takes the paragraph away, so the layout holds no empty line.
   *  Not a live region. */
  setVisitorLine(words: string): void;
  /** Shows whether the room is paused, in "Pause the room"'s aria-pressed. */
  setPaused(on: boolean): void;
  /** Spec 008's walking control (FR-020, FR-021; R-09): in the stage's bottom-right corner, inert with the rest. */
  readonly walkButton: HTMLButtonElement;
  /** Offers the walking control, in 3D after the hand-off's offer, or takes it away, in 2D. */
  setWalkOffered(on: boolean): void;
  /** Spec 024's "Eat" tile (FR-001, FR-012; plan.md §5.5): after the walking control in the clear box, its name
   *  "{eat.button}, B", hidden until offered. */
  readonly eatButton: HTMLButtonElement;
  /** Offers the "Eat" tile, while the 3D side says the eating is available, or takes it away. */
  setEatOffered(on: boolean): void;
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
    /** Spec 014 (FR-054): the visitor's figure's placeholder words, the UI word standin.avatar; empty for none. */
    noteAvatar?: string;
    /** Spec 009's stand-in line: the UI word twin.stand_in while the index's copy holds it; empty for none. */
    standIn?: string;
    /** "Pause the room": the UI word pause.button. */
    pause: string;
    /** Spec 016 (FR-042): the toolbar's credits link, the UI word toolbar.credits. */
    credits?: string;
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
    /** Spec 024's "Eat" tile: its words, eat.button, and the key cap's drawer (hud/keycap.ts's by default; a test's
     *  may throw, and the tile keeps its icon, words, and name, NB-1). Absent, the tile has no words and never shows. */
    eat?: { readonly button: string; readonly keycap?: (doc: Document, name: string) => HTMLElement };
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
    // Spec 016 (FR-042; plan.md R-14): the site's credits page, rendered from assets/CREDITS.md at build.
    tile(doc, "a", { href: "./credits/" }, "credits", parts.credits ?? "Credits"),
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
  // Spec 024 (FR-012; NB-1): the "Eat" tile, a tile with the "B" key cap drawn through attempt, as split.ts's labelled
  // draws its caps, so a throw leaves it its icon and words; its name is "{eat.button}, B" either way.
  const eatWords = parts.eat?.button ?? "";
  const eatButton = tile(
    doc,
    "button",
    {
      type: "button",
      class: "room-eat hud-glass",
      hidden: true,
      "aria-label": `${eatWords}, B`,
      "aria-keyshortcuts": "B",
    },
    "eat",
    eatWords,
  );
  const eatCap = attempt(() => (parts.eat?.keycap ?? keycap)(doc, "B"));
  if (eatCap) eatButton.append(eatCap);
  const standIn = h(doc, "p", { class: "room-note room-stand-in", hidden: !parts.standIn }, parts.standIn ?? "");
  const notes = h(doc, "div", { class: "room-notes" }, note, standIn);
  /** Spec 020's visitor line, in the notes after the line slot's while it has words. */
  let visitorLine: HTMLElement | null = null;
  const clear = h(doc, "div", { class: "room-clear" }, notes, walkButton, walkHelp, eatButton);
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
  const controls = [toolbar, view, walkButton, eatButton, parts.list, parts.talk, resumePanel];

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
    setLine(words) {
      if (standIn.textContent !== words) standIn.textContent = words;
      standIn.hidden = words === "";
    },
    setVisitorLine(words) {
      if (words === "") {
        visitorLine?.remove();
        visitorLine = null;
      } else if (visitorLine) {
        if (visitorLine.textContent !== words) visitorLine.textContent = words;
      } else {
        visitorLine = h(doc, "p", { class: "room-note room-visitor-line" }, words);
        standIn.after(visitorLine);
      }
    },
    setPlaceholders(on) {
      const words = [on.pieces ? parts.note : "", on.figure ? (parts.noteAvatar ?? "") : ""].filter((w) => w !== "");
      // One note (FR-055): the two joined, the first ending in a stop where its words don't.
      note.textContent = words.map((w, k) => (k < words.length - 1 && !/[.!?]$/.test(w) ? `${w}.` : w)).join(" ");
      note.hidden = words.length === 0;
    },
    setPaused(on) {
      pauseButton.setAttribute("aria-pressed", String(on));
    },
    walkButton,
    setWalkOffered(on) {
      walkButton.hidden = !on || walkWords.enter === "";
      root.setAttribute("data-walk", walkButton.hidden ? "off" : "on");
    },
    eatButton,
    setEatOffered(on) {
      eatButton.hidden = !on || eatWords === "";
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
      // Spec 014, T053 (W19): where the walking control sits, which room.css's column layout reads with --walk-x/-y.
      root.setAttribute("data-walk-place", applied.compact.walkPlace);
      // Spec 024 (plan.md §5.5): the "Eat" tile's box, for a 3D dinosaur visit only, which room.css reads.
      const eat = applied.compact.eat ?? null;
      root.setAttribute("data-eat-place", eat ? "on" : "off");
      if (eat) {
        root.style.setProperty("--eat-x", `${eat.x}px`);
        root.style.setProperty("--eat-y", `${eat.y}px`);
      } else {
        root.style.removeProperty("--eat-x");
        root.style.removeProperty("--eat-y");
      }
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
        // Spec 014 (FR-017 to FR-021; plan.md §3.2): the compact clusters, which room.css's column layout reads.
        ["--strip-x", applied.compact.strip.x],
        ["--strip-w", applied.compact.strip.w],
        ["--bar-w", applied.compact.bar.w],
        // Since T053 (W19): the walking control's place, at the column's head or in the clear area's corner.
        ["--walk-x", applied.compact.walk.x],
        ["--walk-y", applied.compact.walk.y],
        ["--column-h", applied.compact.column?.h ?? 0],
        ["--log-rest", applied.logRest],
        // Spec 014 (FR-003; plan.md §2.5, §3.2): the frame area, where the 2D drawing's view sits.
        ["--frame-x", applied.frame.x],
        ["--frame-y", applied.frame.y],
        ["--frame-w", applied.frame.w],
        ["--frame-h", applied.frame.h],
      ];
      // Spec 018: the split layout's boxes for hud/split.css, and data-split beside data-hud. The walking control's
      // place is compact.walk's, above (R-3); the rest row is in the bar's band (R-2), and the open panel's frame is the
      // panel with the rest row below it, its title row at its top.
      const sp = applied.layout === "column" ? (applied.split ?? null) : null;
      root.setAttribute("data-split", sp ? "on" : "off");
      if (sp)
        sizes.push(
          ["--split-panel-x", sp.panel.x],
          ["--split-panel-y", sp.panel.y],
          ["--split-panel-w", sp.panel.w],
          ["--split-panel-h", sp.panel.h],
          ["--split-title-h", sp.title.h],
          ["--split-frame-y", sp.frame.y],
          ["--split-frame-h", sp.frame.h],
          ["--split-rest-x", sp.rest.x],
          ["--split-rest-y", sp.rest.y],
          ["--split-rest-w", sp.rest.w],
          ["--split-rest-h", sp.rest.h],
          ["--split-list-x", sp.list.x],
          ["--split-list-y", sp.list.y],
          ["--split-list-w", sp.list.w],
          ["--split-list-h", sp.list.h],
        );
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
