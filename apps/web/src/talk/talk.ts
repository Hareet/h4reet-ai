// The conversation panel (spec 002, T045; FR-021, FR-023, FR-026, FR-027, FR-039, FR-040; contracts/room-conversation.md
// §3; research.md R-14): the text box, "Send", the talk button, and the log where the twin's words and the fixed
// messages appear. Until the twin's conversation core exists (Phase 7), every surface answers with a fixed message and
// sends nothing anywhere:
// - an object answers topic_not_ready;
// - a typed turn answers cannot_talk.unavailable, pointing to the resume and the PDF, and leaves the text in the box;
// - the talk button announces voice_unavailable and moves focus to the text box, without asking for the microphone
//   (the image's Permissions-Policy keeps microphone=() until push-to-talk's group).
import "./talk.css";

import type { Clock } from "../room/clock";
import { h } from "../room/dom";
import type { EventSink } from "../room/events";
import type { RoomObject } from "../room/objects";
import { fill, pointsToResume } from "./messages";
import type { MessageId, Messages } from "./messages";

/** The log keeps the last few messages; older ones leave the page. */
const LOG_LIMIT = 20;
/** One press of the talk button fires pointerdown or keydown, then click: within this, they are one press. */
const PRESS_MS = 1000;

export interface TalkPanel {
  readonly element: HTMLElement;
  readonly textBox: HTMLInputElement;
  /** An object was selected: its topic isn't ready (FR-023). */
  objectSelected(object: RoomObject): void;
}

export function renderTalk(
  doc: Document,
  options: {
    messages: Messages;
    clock: Clock;
    emit: EventSink;
    /** Whether the room takes input now: false during the hand-off and its offer. */
    enabled(): boolean;
    openResume(): void;
    pdfFollowed(): void;
  },
): TalkPanel {
  const log = h(doc, "div", {
    class: "talk-log",
    role: "log",
    "aria-live": "polite",
    "aria-labelledby": "talk-heading",
  });
  const textBox = h(doc, "input", {
    id: "talk-text",
    type: "text",
    autocomplete: "off",
    spellcheck: "true",
    maxlength: 2000,
    enterkeyhint: "send",
  });
  const send = h(doc, "button", { type: "submit" }, "Send");
  const voice = h(doc, "button", { type: "button", class: "talk-voice" }, "Hold to talk");
  const form = h(
    doc,
    "form",
    { class: "talk-form", autocomplete: "off", novalidate: true },
    h(doc, "label", { for: "talk-text" }, "Your message"),
    h(doc, "div", { class: "talk-row" }, textBox, send, voice),
  );
  const element = h(
    doc,
    "section",
    { class: "talk", "aria-labelledby": "talk-heading" },
    h(doc, "h2", { id: "talk-heading", class: "visually-hidden" }, "Talk to the twin"),
    log,
    form,
  );

  const show = (id: MessageId, vars: Readonly<Record<string, string>> = {}): void => {
    const message = h(doc, "p", { class: "talk-message", "data-message": id }, fill(options.messages[id], vars));
    if (pointsToResume(id)) {
      const resume = h(doc, "button", { type: "button", class: "talk-link" }, "Read the resume");
      resume.addEventListener("click", () => options.openResume());
      const pdf = h(doc, "a", { href: "./resume.pdf", download: true }, "Download the resume (PDF)");
      pdf.addEventListener("click", () => options.pdfFollowed());
      message.append(" ", resume, " ", pdf);
    }
    log.append(message);
    while (log.children.length > LOG_LIMIT) log.firstElementChild?.remove();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!options.enabled() || textBox.value.trim() === "") return;
    // Free talk isn't ready (room-manifest.json): the turn goes nowhere, and the text stays with the visitor.
    options.emit({ kind: "turn_sent" });
    show("cannot_talk.unavailable");
  });

  let lastPress = -Infinity;
  const press = (): void => {
    if (!options.enabled()) return;
    const now = options.clock.now();
    if (now - lastPress < PRESS_MS) return;
    lastPress = now;
    options.emit({ kind: "voice_pressed" });
    show("voice_unavailable");
    textBox.focus();
  };
  voice.addEventListener("pointerdown", (event) => {
    if (event.button === 0) press();
  });
  voice.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      press();
    }
  });
  // A screen reader activates a button with a click alone.
  voice.addEventListener("click", press);

  return {
    element,
    textBox,
    objectSelected(object) {
      show("topic_not_ready", { topic: object.topic });
    },
  };
}
