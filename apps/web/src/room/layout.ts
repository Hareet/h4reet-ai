// The room's screen (spec 002, T044; contracts/room-scene.md §1, §5, §6): its heading, the toolbar ("Resume", "2D view",
// the data-flow disclosure link), the stage, the "In the room" list, the conversation panel, and the resume's panel,
// in that order, which is the Tab order. While the hand-off plays, every part a visitor acts on is inert; the offer of
// "Read the resume now" and "Keep it for later" comes when it ends. The layout's CSS (room.css) frames it from 320 CSS
// pixels wide, with the stage, the list, the text box, and the talk button on screen in portrait.
import { h } from "./dom";

export interface RoomLayout {
  readonly element: HTMLElement;
  /** The room's h1, which holds focus while the hand-off plays. */
  readonly heading: HTMLElement;
  readonly resumeButton: HTMLButtonElement;
  readonly flatButton: HTMLButtonElement;
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
}

export function renderRoom(doc: Document, parts: { list: HTMLElement; talk: HTMLElement }): RoomLayout {
  const heading = h(doc, "h1", { class: "visually-hidden", tabindex: -1 }, "The Author's work area");
  const resumeButton = h(doc, "button", { type: "button" }, "Resume");
  const flatButton = h(doc, "button", { type: "button" }, "2D view");
  const toolbar = h(
    doc,
    "div",
    { class: "room-toolbar", role: "group", "aria-label": "The room's controls" },
    resumeButton,
    flatButton,
    h(doc, "a", { href: "./disclosure/" }, "How data flows"),
  );
  const view = h(doc, "div", { class: "room-stage-view" });
  const stage = h(
    doc,
    "div",
    { class: "room-stage" },
    view,
    h(doc, "p", { class: "room-note" }, "Placeholder shapes stand in for the room's real objects."),
  );
  const resumeHeading = h(doc, "h2", { id: "resume-heading", tabindex: -1 }, "The resume");
  const resumeBody = h(doc, "div", { class: "resume-body" });
  const resumePanel = h(
    doc,
    "section",
    { class: "resume-panel", "aria-labelledby": "resume-heading", hidden: true },
    resumeHeading,
    resumeBody,
  );
  const element = h(doc, "div", { class: "room" }, heading, toolbar, stage, parts.list, parts.talk, resumePanel);
  const controls = [toolbar, view, parts.list, parts.talk, resumePanel];

  return {
    element,
    heading,
    resumeButton,
    flatButton,
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
      stage.append(panel);
      nowButton.focus();
      return () => panel.remove();
    },
    markFlat() {
      flatButton.setAttribute("aria-disabled", "true");
    },
  };
}
