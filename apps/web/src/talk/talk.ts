// The conversation panel (spec 002, T045; FR-021, FR-023, FR-026, FR-027, FR-039, FR-040; contracts/room-conversation.md
// §3; research.md R-14): the text box, "Send", the talk button, and the log where the twin's words and the fixed
// messages appear. Until the twin's conversation core exists (Phase 7), every surface answers with a fixed message and
// sends nothing anywhere:
// - a selectable whose topic isn't ready answers topic_not_ready, its {topic} the topic's own phrase from the bundle's
//   index (spec 004, FR-037), never the visitor's words, and calls nothing;
// - a selectable whose topic is ready makes the conversation's feature its ID and starts a new conversation (spec 004,
//   FR-038; R-33): no message, since the twin's spec opens it;
// - a typed turn goes to the twin's sender as {feature, path, turns} and nothing else (FR-038), but only while the
//   conversation is ready (its topic, or free talk), the turn route exists (the index's live.turn is `site`), and a
//   sender was given, which only the twin's spec gives; otherwise it answers cannot_talk.unavailable, pointing to the
//   resume and the PDF, and leaves the text in the box;
// - the talk button announces voice_unavailable and moves focus to the text box, without asking for the microphone
//   (the image's Permissions-Policy keeps microphone=() until push-to-talk's group);
// - each sent turn's end, which the sender reports through the callback it is given, reaches onTurnOutcome exactly
//   once (spec 004, contracts/turn-cost.md §7), where the room's cost channel reads it; a turn the panel didn't send
//   reports nothing.
import "./talk.css";

import type { Turn, VisitPath } from "../choice/visit";
import type { Clock } from "../room/clock";
import type { RoomIndex } from "../room/compose/bundle";
import { h } from "../room/dom";
import type { EventSink } from "../room/events";
import type { TurnResult } from "../room/signals/turn-cost";
import { fill, pointsToResume } from "./messages";
import type { MessageId, Messages } from "./messages";

/** The log keeps the last few messages; older ones leave the page. */
const LOG_LIMIT = 20;

/** The conversation's feature before any ready topic is selected (spec 002's contracts/room-conversation.md §2). */
export const FREE_TALK = "free_talk";

/** A conversation turn, exactly spec 002's request body (contracts/room-conversation.md §2): the selectable's ID or
 *  free_talk, the visitor's path, and the turns, newest last. Never a lead, a live value, a face's words, or a cost
 *  (spec 004, FR-038). */
export interface TurnRequest {
  feature: string;
  path: VisitPath;
  turns: Turn[];
}

/** The twin's sender: the twin's spec gives it, and reports each turn's end through `ended`, once the whole answer, a
 *  failure, or an abort is in (contracts/turn-cost.md §7); the panel passes it on to `onTurnOutcome`, once. Until then
 *  the room has none, and no turn goes anywhere. */
export type SendTurn = (request: TurnRequest, ended: (result: TurnResult) => void) => void;

export interface TalkPanel {
  readonly element: HTMLElement;
  readonly textBox: HTMLInputElement;
  /** A selectable whose action is talk was selected (FR-023; spec 004, FR-037, FR-038): an unready topic shows the
   *  fixed message naming it by its own phrase, from the bundle's index; a ready one makes `feature` the
   *  conversation's and starts it anew. */
  topicSelected(feature: string, topic: Pick<RoomIndex["topics"][number], "phrase" | "ready">): void;
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
    /** The visitor's path, set at the choice. */
    path(): VisitPath | null;
    /** The visit's conversation so far, which the panel keeps (choice/visit.ts). */
    turns: Turn[];
    /** Whether free talk is ready (room-manifest.json's free_talk.ready). */
    freeTalkReady: boolean;
    /** Whether the turn route exists: the index's live.turn is `site` (contracts/tier-signal.md §1). */
    turnRoute: boolean;
    /** The twin's sender; absent until the twin's spec. */
    sendTurn?: SendTurn;
    /** Each sent turn's end, once, when the sender reports it (spec 004, contracts/turn-cost.md §7): the room's cost
     *  channel reads it. Never called for a turn the panel didn't send. */
    onTurnOutcome?(result: TurnResult): void;
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

  // The conversation: its feature, and whether it's ready. It starts as free talk, ready as the manifest says.
  let feature = FREE_TALK;
  let ready = options.freeTalkReady;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!options.enabled() || textBox.value.trim() === "") return;
    options.emit({ kind: "turn_sent" });
    const path = options.path();
    const send = options.sendTurn;
    if (!ready || !options.turnRoute || !send || !path) {
      // Not ready, or no route or sender: the turn goes nowhere, and the text stays with the visitor.
      show("cannot_talk.unavailable");
      return;
    }
    options.turns.push({ role: "visitor", text: textBox.value });
    textBox.value = "";
    // The turn's end, reported once: a second report of the same turn is the sender's mistake, and counts nothing.
    let ended = false;
    const end = (result: TurnResult): void => {
      if (ended) return;
      ended = true;
      options.onTurnOutcome?.(result);
    };
    send({ feature, path, turns: options.turns.map((t) => ({ role: t.role, text: t.text })) }, end);
  });

  // One press is one gesture, however long it's held. A pointer press ends in the click it fires, which belongs to
  // it; a keyboard press fires none (Enter's is prevented, and Space's keyup lands on the text box, where focus went);
  // a click alone, as a screen reader sends it, is a press of its own.
  let pointerPress = false;
  const press = (): void => {
    if (!options.enabled()) return;
    options.emit({ kind: "voice_pressed" });
    show("voice_unavailable");
    textBox.focus();
  };
  voice.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerPress = true;
    press();
  });
  voice.addEventListener("pointercancel", () => {
    pointerPress = false;
  });
  // A release anywhere ends the gesture: the click it fires on the button, if any, comes before this timer runs.
  doc.addEventListener(
    "pointerup",
    () => {
      if (pointerPress) {
        options.clock.setTimeout(() => {
          pointerPress = false;
        }, 0);
      }
    },
    true,
  );
  voice.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      press();
    }
  });
  voice.addEventListener("click", () => {
    if (pointerPress) {
      pointerPress = false;
      return;
    }
    press();
  });

  return {
    element,
    textBox,
    topicSelected(id, topic) {
      if (!topic.ready) {
        show("topic_not_ready", { topic: topic.phrase });
        return;
      }
      feature = id;
      ready = true;
      options.turns.length = 0;
    },
  };
}
