// The conversation panel (spec 002, T045; FR-021, FR-023, FR-026, FR-027, FR-039, FR-040; contracts/room-conversation.md
// §3; research.md R-14), and the twin's conversation in it (spec 007, FR-032 to FR-041; plan §7; spec 002's T065): the
// log where the twin's words, the visitor's, and the fixed messages appear, the waiting status, the text box, "Send"
// (which becomes "Stop" while a turn is out), and the talk button.
// - A selectable whose topic isn't ready answers topic_not_ready, its {topic} the topic's own phrase from the bundle's
//   index (spec 004, FR-037), never the visitor's words, and calls nothing.
// - A selectable whose topic is ready starts a new conversation with its ID as the feature and sends its opening,
//   `{feature, path, turns: []}` (spec 007, FR-032; provisional, Q4); the active conversation's own piece sends nothing;
//   another piece aborts the turn in flight first.
// - Typed text is a visitor turn of the active conversation, or of a new free-talk conversation while free talk is
//   ready; otherwise cannot_talk.unavailable, the text left in the box. A turn goes only while the turn route exists
//   (the index's live.turn is `site`) and a sender was given, which main.ts gives (src/talk/turn-client.ts).
// - One turn at a time (FR-033): its request carries the newest turns within the limits, oldest dropped first; within
//   100 ms the visitor's words show under "You", the box clears, the status says twin_answering, and Send becomes Stop
//   (FR-034). Escape or Stop aborts it, drops it, and shows turn_stopped.
// - The answer shows under "AI twin" as plain text, never markup, and focus stays where it was (FR-035). A failure shows
//   its fixed message by spec 002's cause classes, gives the visitor's words back to an empty box, and drops the
//   unanswered turn from the conversation (FR-036). Each sent turn's end reaches onTurnOutcome exactly once (spec 004,
//   contracts/turn-cost.md §7), where the room's cost channel reads it; a turn the panel didn't send reports nothing.
// - The talk button announces voice_unavailable and moves focus to the text box, without asking for the microphone
//   (the image's Permissions-Policy keeps microphone=() until push-to-talk's group).
import "./talk.css";

import type { Turn, VisitPath } from "../choice/visit";
import type { Clock } from "../room/clock";
import type { RoomIndex } from "../room/compose/bundle";
import { h } from "../room/dom";
import type { EventSink } from "../room/events";
import type { TurnResult } from "../room/signals/turn-cost";
import { cannotTalkFor, fill, pointsToResume } from "./messages";
import type { MessageId, Messages } from "./messages";
import { historyWindow } from "./turn-client";

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

/** The twin's sender: main.ts gives the room src/talk/turn-client.ts's, which reports each turn's end through `ended`,
 *  once, when the whole answer, a failure, or an abort is in (contracts/turn-cost.md §7); `signal` aborts the turn
 *  (spec 007, departure D2). Without one, no turn goes anywhere. */
export type SendTurn = (request: TurnRequest, ended: (result: TurnResult) => void, signal?: AbortSignal) => void;

/** The per-turn limits the room holds a turn to (spec 007, FR-027, FR-041): config/budgets.yaml's limits.twin. */
export interface TalkLimits {
  turnMaxChars: number;
  historyMaxTurns: number;
  historyMaxChars: number;
}

/** FR-027's defaults, while the build gives no limits. */
export const DEFAULT_TALK_LIMITS: TalkLimits = { turnMaxChars: 600, historyMaxTurns: 8, historyMaxChars: 4_000 };

export interface TalkPanel {
  readonly element: HTMLElement;
  readonly textBox: HTMLInputElement;
  /** A selectable whose action is talk was selected (FR-023; spec 004, FR-037, FR-038; spec 007, FR-032): an unready
   *  topic shows the fixed message naming it by its own phrase, from the bundle's index; a ready one opens its
   *  conversation, unless it is the active conversation's own. */
  topicSelected(feature: string, topic: Pick<RoomIndex["topics"][number], "phrase" | "ready">): void;
}

interface Flight {
  readonly controller: AbortController;
  readonly feature: string;
  /** The visitor's turn this flight answers, or null for an opening. */
  readonly visitor: Turn | null;
  stopped: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

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
    /** The twin's sender; absent, no turn goes anywhere. */
    sendTurn?: SendTurn;
    /** Each sent turn's end, once, when the sender reports it (spec 004, contracts/turn-cost.md §7): the room's cost
     *  channel reads it. Never called for a turn the panel didn't send. */
    onTurnOutcome?(result: TurnResult): void;
    /** The per-turn limits, from the build; FR-027's defaults when absent. */
    limits?: TalkLimits;
  },
): TalkPanel {
  const limits = options.limits ?? DEFAULT_TALK_LIMITS;
  const log = h(doc, "div", {
    class: "talk-log",
    role: "log",
    "aria-live": "polite",
    "aria-labelledby": "talk-heading",
  });
  // The waiting status, outside the log, so it is announced once and never kept as a line of the conversation: a polite
  // live region of its own, beside the room's announcer, which is the page's one role="status".
  const status = h(doc, "p", { class: "talk-status", "aria-live": "polite" });
  const limitNote = h(
    doc,
    "span",
    { id: "talk-limit", class: "visually-hidden" },
    `Up to ${limits.turnMaxChars} characters.`,
  );
  const counter = h(doc, "span", { id: "talk-counter", class: "talk-counter" });
  counter.hidden = true;
  const textBox = h(doc, "input", {
    id: "talk-text",
    type: "text",
    autocomplete: "off",
    spellcheck: "true",
    maxlength: limits.turnMaxChars,
    enterkeyhint: "send",
    "aria-describedby": "talk-limit talk-counter",
  });
  const send = h(doc, "button", { type: "submit" }, "Send");
  const voice = h(doc, "button", { type: "button", class: "talk-voice" }, "Hold to talk");
  const form = h(
    doc,
    "form",
    { class: "talk-form", autocomplete: "off", novalidate: true },
    h(doc, "label", { for: "talk-text" }, "Your message"),
    h(doc, "div", { class: "talk-row" }, textBox, send, voice),
    limitNote,
    counter,
  );
  // Spec 005 (FR-020, FR-028; plan.md §6.5): the log and the waiting status are the conversation's sheet, which the
  // dock layout lays above the dock once the log holds a line (data-log), and the column layout keeps in the column.
  const sheet = h(doc, "div", { class: "talk-sheet" }, log, status);
  const element = h(
    doc,
    "section",
    { class: "talk", "aria-labelledby": "talk-heading", "data-log": "empty" },
    h(doc, "h2", { id: "talk-heading", class: "visually-hidden" }, "Talk to the twin"),
    sheet,
    form,
  );

  const append = (node: HTMLElement): void => {
    log.append(node);
    while (log.children.length > LOG_LIMIT) log.firstElementChild?.remove();
    element.setAttribute("data-log", "lines");
    // The newest line stays in view (spec 007, FR-042; spec 005, FR-028).
    log.scrollTop = log.scrollHeight;
  };

  const show = (id: MessageId, vars: Readonly<Record<string, string>> = {}): void => {
    const message = h(doc, "p", { class: "talk-message", "data-message": id }, fill(options.messages[id], vars));
    if (pointsToResume(id)) {
      const resume = h(doc, "button", { type: "button", class: "talk-link" }, "Read the resume");
      resume.addEventListener("click", () => options.openResume());
      const pdf = h(doc, "a", { href: "./resume.pdf", download: true }, "Download the resume (PDF)");
      pdf.addEventListener("click", () => options.pdfFollowed());
      message.append(" ", resume, " ", pdf);
    }
    append(message);
  };

  /** A line of the conversation, under its speaker's label, its words as text (textContent), never markup. */
  const entry = (role: Turn["role"], words: string): void => {
    const speaker = h(doc, "span", { class: "talk-speaker" }, role === "twin" ? "AI twin" : "You");
    const text = h(doc, "span", { class: "talk-words" });
    text.textContent = words;
    const separator = h(doc, "span", { class: "talk-sep" }, ": ");
    append(h(doc, "p", { class: "talk-entry", "data-speaker": role }, speaker, separator, text));
  };

  const updateCounter = (): void => {
    const used = [...textBox.value].length;
    counter.hidden = used < Math.ceil(limits.turnMaxChars * 0.8);
    counter.textContent = `${limits.turnMaxChars - used} characters left`;
  };
  textBox.addEventListener("input", updateCounter);

  // The conversation: the active one's feature, or none; the topic's phrase, for a 409's message; one turn in flight.
  let conversation: string | null = null;
  let phrase = "";
  let flight: Flight | null = null;

  const waiting = (on: boolean): void => {
    status.textContent = on ? options.messages.twin_answering : "";
    send.textContent = on ? "Stop" : "Send";
    send.type = on ? "button" : "submit";
  };

  const canSend = (): boolean => options.turnRoute && options.sendTurn !== undefined && options.path() !== null;

  /** Drops the turn's visitor words from the conversation, and gives them back to an empty box. */
  const giveBack = (f: Flight): void => {
    if (f.visitor === null) return;
    const at = options.turns.lastIndexOf(f.visitor);
    if (at !== -1) options.turns.splice(at, 1);
    if (textBox.value === "") {
      textBox.value = f.visitor.text;
      updateCounter();
    }
  };

  /** How a turn ended, shown (FR-035, FR-036). */
  const finish = (f: Flight, result: TurnResult): void => {
    if (result.kind === "response" && result.status === 200) {
      const text = isObject(result.body) && typeof result.body.text === "string" ? result.body.text.trim() : "";
      if (text !== "") {
        options.turns.push({ role: "twin", text });
        entry("twin", text);
        return;
      }
    }
    giveBack(f);
    // An opening that didn't answer leaves no conversation behind, so its piece can be selected again.
    if (f.visitor === null) conversation = null;
    if (f.stopped) return show("turn_stopped");
    if (result.kind === "error") return show("cannot_talk.unavailable");
    const { status: code, body } = result;
    if (code === 503 && isObject(body) && body.state === "degraded" && typeof body.cause === "string")
      return show(cannotTalkFor(body.cause));
    if (code === 429) return show("turn_refused.slow_down");
    if (code === 400 || code === 413 || code === 415) return show("turn_refused.unreadable");
    if (code === 409) {
      // Readiness changed since the page was built: the route's 409 wins, and that conversation ends.
      conversation = null;
      return f.feature === FREE_TALK ? show("cannot_talk.unavailable") : show("topic_not_ready", { topic: phrase });
    }
    show("cannot_talk.unavailable");
  };

  /** Sends a turn of the conversation `feature`: an opening when `visitor` is null. */
  const begin = (feature: string, visitor: Turn | null): void => {
    const sender = options.sendTurn;
    const path = options.path();
    if (sender === undefined || path === null) return;
    const f: Flight = { controller: new AbortController(), feature, visitor, stopped: false };
    flight = f;
    waiting(true);
    let reported = false;
    const ended = (result: TurnResult): void => {
      // The turn's end, reported once: a second report of the same turn is the sender's mistake, and counts nothing.
      if (reported) return;
      reported = true;
      options.onTurnOutcome?.(result);
      if (flight !== f) return; // superseded by a new conversation: it shows nothing
      flight = null;
      waiting(false);
      finish(f, result);
    };
    sender({ feature, path, turns: historyWindow(options.turns, limits) }, ended, f.controller.signal);
  };

  const stop = (): void => {
    if (flight === null) return;
    flight.stopped = true;
    flight.controller.abort();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (flight !== null) return; // Enter while a turn is out does nothing; Stop and Escape stop it
    const words = textBox.value.trim();
    if (!options.enabled() || words === "") return;
    options.emit({ kind: "turn_sent" });
    const feature = conversation ?? (options.freeTalkReady ? FREE_TALK : null);
    if (feature === null || !canSend()) {
      // Not ready, or no route or sender: the turn goes nowhere, and the text stays with the visitor.
      show("cannot_talk.unavailable");
      return;
    }
    conversation = feature;
    const visitor: Turn = { role: "visitor", text: words };
    options.turns.push(visitor);
    entry("visitor", words);
    textBox.value = "";
    updateCounter();
    begin(feature, visitor);
  });
  send.addEventListener("click", (event) => {
    if (flight === null) return;
    event.preventDefault();
    stop();
  });
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && flight !== null) {
      event.preventDefault();
      stop();
    }
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
      // The active conversation's own piece sends nothing (FR-032).
      if (conversation === id) return;
      // Another piece: the turn in flight is aborted, and shows nothing in the new conversation.
      if (flight !== null) {
        const old = flight;
        flight = null;
        waiting(false);
        old.controller.abort();
      }
      options.turns.length = 0;
      phrase = topic.phrase;
      if (!canSend()) {
        conversation = null;
        show("cannot_talk.unavailable");
        return;
      }
      conversation = id;
      begin(id, null);
    },
  };
}
