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
//   ready; otherwise cannot_talk.free_talk_closed while a topic is ready, and cannot_talk.unavailable while none is
//   (spec 029, FR-012; Q20, provisional), the text left in the box. A turn goes only while the turn route exists (the
//   index's live.turn is `site`) and a sender was given, which main.ts gives (src/talk/turn-client.ts); without them,
//   cannot_talk.unavailable, checked before free talk. While the room doesn't take input (the hand-off and its offer),
//   typed text shows turn_wait.room and stays in the box: a send never shows nothing.
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
import { PDF_HREF, pdfFileName } from "../resume/download";
import type { Clock } from "../room/clock";
import type { TwinActivity } from "../room/scene/twin-states";
import type { RoomIndex } from "../room/compose/bundle";
import { h } from "../room/dom";
import { browserOwnsEscape } from "../room/fullscreen";
import { icon } from "../room/hud/icons";
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
  /** Spec 005: whether the panel is docked at the window's foot, where its log is a sheet out of view until it holds a
   *  line; its header buttons hide with that empty sheet, so no stop of the Tab order is out of view (the review of
   *  60b51de4, finding 1). */
  setDocked(on: boolean): void;
  /** Spec 018: ends the larger view, as its toggle does, without moving focus. */
  closeLarger(): void;
  /** Spec 018: whether a turn is out, which Escape stops before it closes the panel. */
  turnOut(): boolean;
  /** Spec 026 (R-02): the active conversation's feature (a piece's ID, or free talk), or null: read only, so the room's
   *  selection pets the dog unless its piece's conversation is already the active one, as `topicSelected` sends nothing
   *  then. */
  readonly active: string | null;
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

/** Spec 016's activity, the twin's states' input (contracts/twin-states.md §1). */
export type TalkActivity = TwinActivity;

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
    /** Whether any topic of the room is ready (the index's topics' `ready`; spec 029, FR-012, Q20): typed text with
     *  free talk closed points to the pieces only then. Absent, false: the panel never points to a piece it can't
     *  vouch for. */
    topicReady?: boolean;
    /** Whether the turn route exists: the index's live.turn is `site` (contracts/tier-signal.md §1). */
    turnRoute: boolean;
    /** The twin's sender; absent, no turn goes anywhere. */
    sendTurn?: SendTurn;
    /** Each sent turn's end, once, when the sender reports it (spec 004, contracts/turn-cost.md §7): the room's cost
     *  channel reads it. Never called for a turn the panel didn't send. */
    onTurnOutcome?(result: TurnResult): void;
    /** The per-turn limits, from the build; FR-027's defaults when absent. */
    limits?: TalkLimits;
    /** Spec 005's words for the log's header (FR-023, FR-028): its toggle, hud.log_toggle, and the larger view's two,
     *  talk.larger and talk.smaller, from the bundle's index; English defaults without them. */
    words?: { readonly logToggle: string; readonly larger: string; readonly smaller: string };
    /** Each change of the log's state, for a drafts build's frame log (spec 005, FR-063). */
    onPanel?(part: "log" | "larger", state: "open" | "collapsed"): void;
    /** Spec 016 (FR-022; contracts/twin-states.md §1): what the twin's states need from the conversation, and nothing
     *  else: whether the text box holds unsent text, a turn's going and ending, the twin's answer's words, and a
     *  piece's selection. No activity carries a word, a topic, a feature, a cost, or a time. */
    onActivity?(activity: TalkActivity): void;
    /** Spec 018 (FR-006): a conversation begins (the piece's ID, or free talk) or a line appears in the log, which the split layout's
     *  panel opens for. Nothing they carry is a word of the visitor's. */
    onConversation?(feature: string): void;
    onLine?(): void;
    /** The larger view turned on or off, by its toggle or Escape: the split layout's panel opens and closes with it. */
    onLarger?(on: boolean): void;
  },
): TalkPanel {
  const activity = (a: TalkActivity): void => options.onActivity?.(a);
  const limits = options.limits ?? DEFAULT_TALK_LIMITS;
  const log = h(doc, "div", {
    id: "talk-log",
    class: "talk-log",
    role: "log",
    "aria-live": "polite",
    "aria-labelledby": "talk-heading",
  });
  // Spec 005 (FR-023, FR-028; plan.md §6.4, §6.5): the log's header, a toggle that collapses the log, which stays in the
  // accessibility tree visually hidden so its answers are still announced, and the larger view's toggle, which opens
  // the log over the scene only when asked and never re-frames the room. Neither moves focus but to itself.
  const words = options.words ?? {
    logToggle: "Conversation",
    larger: "Larger conversation",
    smaller: "Smaller conversation",
  };
  const header = (text: string, cls: string): HTMLButtonElement =>
    h(
      doc,
      "button",
      { type: "button", class: `hud-toggle ${cls}`, "aria-expanded": "true", "aria-controls": "talk-log" },
      icon(doc, "chevron"),
      h(doc, "span", {}, text),
    );
  const logToggle = header(words.logToggle, "talk-log-toggle");
  const largerToggle = header(words.larger, "talk-larger");
  largerToggle.setAttribute("aria-expanded", "false");
  const largerWords = largerToggle.querySelector("span") as HTMLElement;
  const head = h(doc, "div", { class: "talk-head" }, logToggle, largerToggle);
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
  const sheet = h(doc, "div", { class: "talk-sheet" }, head, log, status);
  const element = h(
    doc,
    "section",
    { class: "talk", "aria-labelledby": "talk-heading", "data-log": "empty", "data-larger": "off" },
    h(doc, "h2", { id: "talk-heading", class: "visually-hidden" }, "Talk to the twin"),
    sheet,
    form,
  );

  // Spec 005 (the review of 60b51de4, finding 1): the docked panel's empty sheet hides its header buttons with it; a
  // collapsed log, visually hidden but still a live region, keeps its links and buttons out of the Tab order.
  let docked = false;
  let collapsed = false;
  const showHead = (): void => {
    head.hidden = docked && log.childElementCount === 0;
  };
  /** A collapsed log's controls out of the Tab order, and back once it opens: only those it took out. */
  const tabbable = (): void => {
    for (const el of log.querySelectorAll<HTMLElement>("a[href], button, input, [tabindex]")) {
      if (collapsed && el.getAttribute("tabindex") !== "-1") {
        el.setAttribute("tabindex", "-1");
        el.setAttribute("data-collapsed-tab", "");
      } else if (!collapsed && el.hasAttribute("data-collapsed-tab")) {
        el.removeAttribute("tabindex");
        el.removeAttribute("data-collapsed-tab");
      }
    }
  };
  const append = (node: HTMLElement): void => {
    log.append(node);
    while (log.children.length > LOG_LIMIT) log.firstElementChild?.remove();
    element.setAttribute("data-log", "lines");
    options.onLine?.();
    showHead();
    tabbable();
    // The newest line stays in view (spec 007, FR-042; spec 005, FR-028).
    log.scrollTop = log.scrollHeight;
  };

  const show = (id: MessageId, vars: Readonly<Record<string, string>> = {}): void => {
    const message = h(doc, "p", { class: "talk-message", "data-message": id }, fill(options.messages[id], vars));
    if (pointsToResume(id)) {
      const resume = h(doc, "button", { type: "button", class: "talk-link" }, "Read the resume");
      resume.addEventListener("click", () => options.openResume());
      const pdf = h(doc, "a", { href: PDF_HREF, download: pdfFileName() }, "Download the resume (PDF)");
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
  textBox.addEventListener("input", () => activity({ kind: "draft", holds: textBox.value.trim() !== "" }));

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
        // The twin's answer, by its words alone (FR-022); a fixed message never is one.
        activity({ kind: "answer", words: text.split(/\s+/).filter((w) => w !== "").length });
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
    options.onConversation?.(feature);
    waiting(true);
    activity({ kind: "turn", out: true });
    let reported = false;
    const ended = (result: TurnResult): void => {
      // The turn's end, reported once: a second report of the same turn is the sender's mistake, and counts nothing.
      if (reported) return;
      reported = true;
      options.onTurnOutcome?.(result);
      if (flight !== f) return; // superseded by a new conversation: it shows nothing
      flight = null;
      waiting(false);
      activity({ kind: "turn", out: false });
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
    if (words === "") return;
    // Never nothing (spec 029, FR-012): each refusal says why, and the text stays with the visitor.
    if (!options.enabled()) {
      // The room doesn't take input yet (the hand-off and its offer).
      show("turn_wait.room");
      return;
    }
    options.emit({ kind: "turn_sent" });
    if (!canSend()) {
      // No route or no sender: no turn goes anywhere, a piece's neither, so this comes first.
      show("cannot_talk.unavailable");
      return;
    }
    const feature = conversation ?? (options.freeTalkReady ? FREE_TALK : null);
    if (feature === null) {
      // Free talk is closed and no conversation is open: point to the pieces while one may talk; with none ready,
      // cannot_talk.unavailable, so no message points to a piece that would refuse (Q20, provisional).
      show(options.topicReady === true ? "cannot_talk.free_talk_closed" : "cannot_talk.unavailable");
      return;
    }
    conversation = feature;
    const visitor: Turn = { role: "visitor", text: words };
    options.turns.push(visitor);
    entry("visitor", words);
    textBox.value = "";
    updateCounter();
    activity({ kind: "draft", holds: false });
    begin(feature, visitor);
  });
  send.addEventListener("click", (event) => {
    if (flight === null) return;
    event.preventDefault();
    stop();
  });
  form.addEventListener("keydown", (event) => {
    // In full screen the browser takes Escape to leave it, and the turn goes on (spec 005, FR-039).
    if (event.key === "Escape" && flight !== null && !browserOwnsEscape(doc)) {
      event.preventDefault();
      stop();
    }
  });

  const setCollapsed = (on: boolean): void => {
    collapsed = on;
    if (collapsed && log.contains(doc.activeElement)) logToggle.focus();
    log.classList.toggle("visually-hidden", collapsed);
    tabbable();
    logToggle.setAttribute("aria-expanded", String(!collapsed));
    options.onPanel?.("log", collapsed ? "collapsed" : "open");
  };
  logToggle.addEventListener("click", () => {
    setCollapsed(!collapsed);
  });
  let larger = false;
  const setLarger = (on: boolean): void => {
    larger = on;
    largerToggle.setAttribute("aria-expanded", String(on));
    largerWords.textContent = on ? words.smaller : words.larger;
    element.setAttribute("data-larger", on ? "on" : "off");
    options.onPanel?.("larger", on ? "open" : "collapsed");
    options.onLarger?.(on);
  };
  largerToggle.addEventListener("click", () => setLarger(!larger));
  // Escape closes the larger view, focus back on its toggle, unless the form's Escape stopped a turn first.
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || !larger || browserOwnsEscape(doc)) return;
    event.preventDefault();
    setLarger(false);
    largerToggle.focus();
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
    turnOut: () => flight !== null && !flight.stopped,
    get active() {
      return conversation;
    },
    closeLarger() {
      if (larger) setLarger(false);
    },
    setDocked(on) {
      docked = on;
      showHead();
    },
    topicSelected(id, topic) {
      activity({ kind: "selected" });
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
        activity({ kind: "turn", out: false });
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
