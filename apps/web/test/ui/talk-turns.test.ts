// The twin's conversation in the room (spec 007; FR-032 to FR-036, FR-039 to FR-042; plan §7; spec 002's T065), through
// the real talk panel with a sender the test holds, so each turn ends when the test says.
// - T033, the conversation: a ready piece's selection sends its opening, `{feature, path, turns: []}`; the active
//   conversation's own piece sends nothing; another piece aborts the turn in flight and opens a new conversation; typed
//   text carries the conversation on; an unready topic shows its fixed message and sends nothing; each sent turn reaches
//   onTurnOutcome once, after it ends; and nothing is written to storage, a cookie, or the URL.
// - T035, the panel's states and accessibility: within 100 ms of a send, the visitor's words under "You", the box
//   cleared, the waiting status outside the log, and Send renamed Stop; the answer as plain text under "AI twin", markup
//   and links as text; focus where it was; each announced once; Escape stops; the box's limit, its description, and
//   its counter from 80%; 0 axe violations idle, waiting, answered, and failed; the status still under reduced motion.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { TurnResult } from "../../src/room/signals/turn-cost";
import type { SendTurn, TalkLimits, TurnRequest } from "../../src/talk/talk";
import { createTurnSender } from "../../src/talk/turn-client";
import {
  FakeClock,
  WEB,
  axeViolations,
  button,
  enter,
  flush,
  roomContent,
  start,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));
const messages = roomContent().messages;

/** The fixture's index with every talk topic ready and the turn route on, as the twin's readiness marks them. */
function ready(index: RoomIndex = fixture().index, o: { topics?: boolean } = {}): RoomIndex {
  return {
    ...index,
    live: { ...index.live, turn: "site" },
    topics: index.topics.map((t) => ({ ...t, ready: o.topics ?? true })),
  };
}

const talking = (index: RoomIndex): string[] =>
  index.selectables.filter((s) => s.action.kind === "talk").map((s) => s.id);

interface Sent {
  request: TurnRequest;
  ended: (result: TurnResult) => void;
  signal: AbortSignal | undefined;
}

async function room(
  index: RoomIndex = ready(),
  o: { freeTalk?: boolean; limits?: TalkLimits } = {},
): Promise<{ v: Visit; sent: Sent[]; outcomes: TurnResult[] }> {
  const sent: Sent[] = [];
  const content = roomContent();
  const changed = o.freeTalk !== undefined || o.limits !== undefined;
  const v = start({
    room: index,
    sendTurn: (request, ended, signal) => sent.push({ request, ended, signal }),
    ...(changed
      ? {
          content: {
            ...content,
            manifest: { ...content.manifest, free_talk: { ready: o.freeTalk ?? content.manifest.free_talk.ready } },
            ...(o.limits === undefined ? {} : { twin: { limits: o.limits } }),
          },
        }
      : {}),
  });
  await enter(v, "engineer");
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  const outcomes: TurnResult[] = [];
  const cost = v.room.cost;
  const report = cost.report.bind(cost);
  vi.spyOn(cost, "report").mockImplementation((outcome, from) => {
    if (from === "turn") outcomes.push(outcome as unknown as TurnResult);
    report(outcome, from);
  });
  return { v, sent, outcomes };
}

const select = (v: Visit, id: string): void => {
  const b = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")].find(
    (x) => x.getAttribute("data-object-id") === id,
  );
  if (!b) throw new Error(`no button for ${id}`);
  b.click();
};
const box = (v: Visit): HTMLInputElement => {
  const el = v.doc.querySelector<HTMLInputElement>("#talk-text");
  if (!el) throw new Error("no text box");
  return el;
};
const status = (v: Visit): HTMLElement | null => v.doc.querySelector<HTMLElement>(".talk .talk-status");
const say = (v: Visit, words: string): void => {
  box(v).value = words;
  button(v.doc, "Send").click();
};
const answer = (text: string, route = "local", cost = 0): TurnResult => ({
  kind: "response",
  status: 200,
  body: { text, feature: "f", cost_micro_usd: cost, route },
});
const entries = (v: Visit): { speaker: string | null; text: string }[] =>
  [...talkLog(v.doc).querySelectorAll(".talk-entry")].map((e) => ({
    speaker: e.querySelector(".talk-speaker")?.textContent ?? null,
    text: e.querySelector(".talk-words")?.textContent ?? "",
  }));

afterEach(() => vi.restoreAllMocks());

describe("the conversation (T033; FR-032, FR-033)", () => {
  it("sends a ready piece's opening, with no turns, and sends nothing for the active conversation's own piece", async () => {
    const { v, sent } = await room();
    const [first] = talking(v.room.visit.path === null ? fixture().index : fixture().index);
    if (first === undefined) throw new Error("the fixture opens no topic");
    select(v, first);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.request).toEqual({ feature: first, path: "engineer", turns: [] });
    expect(Object.keys(sent[0]?.request ?? {}).sort()).toEqual(["feature", "path", "turns"]);
    expect(status(v)?.textContent).toBe(messages.twin_answering);
    // The opening shows no visitor words.
    expect(entries(v)).toEqual([]);
    sent[0]?.ended(answer("An opening from the corpus."));
    select(v, first);
    expect(sent).toHaveLength(1);
    expect(v.events.filter((e) => e.kind === "object_selected")).toHaveLength(2);
  });

  it("aborts the turn in flight when another piece is selected, and opens that piece's conversation", async () => {
    const index = ready(withSecondTalk(fixture().index));
    const { v, sent } = await room(index);
    const [a, b] = talking(index);
    if (a === undefined || b === undefined) throw new Error("two talk pieces needed");
    select(v, a);
    select(v, b);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.signal?.aborted).toBe(true);
    expect(sent[1]?.request).toEqual({ feature: b, path: "engineer", turns: [] });
    // The first turn's end, aborted, shows nothing in the new conversation.
    const shown = talkLog(v.doc).children.length;
    sent[0]?.ended({ kind: "error", error: "aborted" });
    expect(talkLog(v.doc).children).toHaveLength(shown);
    expect(status(v)?.textContent).toBe(messages.twin_answering);
  });

  it("carries the conversation on with typed text: the twin's answer and the visitor's words, newest last", async () => {
    const { v, sent } = await room();
    const [first] = talking(fixture().index);
    if (first === undefined) throw new Error("no talk piece");
    select(v, first);
    sent[0]?.ended(answer("An opening."));
    say(v, "Tell me more.");
    expect(sent[1]?.request).toEqual({
      feature: first,
      path: "engineer",
      turns: [
        { role: "twin", text: "An opening." },
        { role: "visitor", text: "Tell me more." },
      ],
    });
  });

  it("shows an unready topic's fixed message and sends nothing", async () => {
    const index = ready(fixture().index, { topics: false });
    const { v, sent } = await room(index);
    const [first] = talking(index);
    if (first === undefined) throw new Error("no talk piece");
    select(v, first);
    expect(sent).toEqual([]);
    expect(talkLog(v.doc).lastElementChild?.getAttribute("data-message")).toBe("topic_not_ready");
  });

  it("reports each sent turn once to the cost channel, after it ends, and writes nothing to storage, a cookie, or the URL", async () => {
    const { v, sent, outcomes } = await room();
    const [first] = talking(fixture().index);
    if (first === undefined) throw new Error("no talk piece");
    const url = v.win.location.href;
    select(v, first);
    expect(outcomes).toEqual([]);
    sent[0]?.ended(answer("An opening.", "fallback", 950));
    sent[0]?.ended(answer("Again."));
    expect(outcomes).toHaveLength(1);
    expect(v.room.cost.state.visitMicro).toBe(950n);
    say(v, "And then?");
    sent[1]?.ended(answer("Then this."));
    expect(outcomes).toHaveLength(2);
    expect(v.spies.storage).toEqual([]);
    expect(v.doc.cookie).toBe("");
    expect(v.win.location.href).toBe(url);
    expect(v.spies.network).toEqual([]);
  });
});

/** The fixture's index with a second talk selectable, a copy of its first, for the abort case. */
function withSecondTalk(index: RoomIndex): RoomIndex {
  const first = index.selectables.find((s) => s.action.kind === "talk");
  if (!first) return index;
  return {
    ...index,
    selectables: [...index.selectables, { ...first, id: `${first.id}-two`, name: `${first.name} two` }],
  };
}

describe("the panel's states and accessibility (T035; FR-034, FR-035, FR-039 to FR-042)", () => {
  async function inFlight(): Promise<{ v: Visit; sent: Sent[] }> {
    const { v, sent } = await room();
    const [first] = talking(fixture().index);
    if (first === undefined) throw new Error("no talk piece");
    select(v, first);
    sent[0]?.ended(answer("An opening."));
    return { v, sent };
  }

  it("within 100 ms shows the words under You, clears the box, shows the status outside the log, and turns Send into Stop", async () => {
    const { v } = await inFlight();
    const t0 = v.clock.now();
    say(v, "What does he build?");
    expect(v.clock.now() - t0).toBeLessThan(100);
    expect(entries(v).at(-1)).toEqual({ speaker: "You", text: "What does he build?" });
    expect(box(v).value).toBe("");
    const s = status(v);
    expect(s?.textContent).toBe(messages.twin_answering);
    expect(s?.closest("[role='log']")).toBeNull();
    expect(button(v.doc, "Stop")).toBeTruthy();
    expect([...v.doc.querySelectorAll(".talk button")].map((b) => textOf(b))).not.toContain("Send");
  });

  it("shows the answer as plain text under AI twin, markup and links as text, and leaves focus where it was", async () => {
    const { v, sent } = await inFlight();
    box(v).focus();
    say(v, "Links?");
    const words = '<b>Bold</b> and <a href="https://example.org">a link</a>, see https://github.com/hareet.';
    sent[1]?.ended(answer(words));
    expect(entries(v).at(-1)).toEqual({ speaker: "AI twin", text: words });
    const last = talkLog(v.doc).lastElementChild;
    expect(last?.querySelector("b, a")).toBeNull();
    expect(status(v)?.textContent ?? "").toBe("");
    expect(v.doc.activeElement).toBe(box(v));
    expect(button(v.doc, "Send")).toBeTruthy();
  });

  it("stops a turn with Escape or Stop, drops it from the conversation, shows turn_stopped, and gives the words back", async () => {
    const { v, sent } = await inFlight();
    say(v, "A question I take back.");
    box(v).dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sent[1]?.signal?.aborted).toBe(true);
    sent[1]?.ended({ kind: "error", error: "aborted" });
    expect(talkLog(v.doc).lastElementChild?.getAttribute("data-message")).toBe("turn_stopped");
    expect(box(v).value).toBe("A question I take back.");
    say(v, "Another.");
    expect(sent[2]?.request.turns).toEqual([
      { role: "twin", text: "An opening." },
      { role: "visitor", text: "Another." },
    ]);
    button(v.doc, "Stop").click();
    expect(sent[2]?.signal?.aborted).toBe(true);
  });

  it("states its limit, holds it, and shows the characters left from 80% of it", async () => {
    const { v } = await inFlight();
    const b = box(v);
    expect(b.maxLength).toBe(600);
    const described = (b.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => v.doc.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(described).toContain("Up to 600 characters.");
    const counter = v.doc.querySelector<HTMLElement>(".talk-counter");
    b.value = "x".repeat(479);
    b.dispatchEvent(new v.win.Event("input", { bubbles: true }));
    expect(counter?.hidden).toBe(true);
    b.value = "x".repeat(480);
    b.dispatchEvent(new v.win.Event("input", { bubbles: true }));
    expect(counter?.hidden).toBe(false);
    expect(counter?.textContent).toBe("120 characters left");
  });

  it("announces each answer and failure once, through the log, and the status once", async () => {
    const { v, sent } = await inFlight();
    const log = talkLog(v.doc);
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(status(v)?.getAttribute("aria-live") ?? "polite").toBe("polite");
    say(v, "One.");
    const before = log.children.length;
    v.clock.advance(5_000);
    expect(log.children).toHaveLength(before);
    sent[1]?.ended(answer("An answer."));
    expect(log.children).toHaveLength(before + 1);
  });

  it("has 0 axe violations idle, waiting, answered, and failed", async () => {
    const { v, sent } = await room();
    expect(await axeViolations(v)).toEqual([]);
    const [first] = talking(fixture().index);
    if (first === undefined) throw new Error("no talk piece");
    select(v, first);
    expect(await axeViolations(v)).toEqual([]);
    sent[0]?.ended(answer("An opening."));
    expect(await axeViolations(v)).toEqual([]);
    say(v, "And?");
    sent[1]?.ended({ kind: "response", status: 503, body: { state: "degraded", cause: "kill_switch_tripped" } });
    expect(await axeViolations(v)).toEqual([]);
  });

  it("keeps the waiting status still under reduced motion, and the row wrapping at narrow widths", () => {
    const css = readFileSync(join(WEB, "src/talk/talk.css"), "utf8");
    const motion = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const animation = css.indexOf("animation");
    if (animation !== -1) expect(motion).toBeGreaterThan(-1);
    if (animation !== -1) expect(animation).toBeGreaterThan(motion);
    expect(css).toMatch(/\.talk-row\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});

describe("the clock", () => {
  it("is the room's FakeClock in these tests", () => expect(new FakeClock().now()).toBe(0));
});

// T050 (spec 007; FR-032; User Story 2): with no conversation open, typed text starts free talk when the manifest marks
// it ready, and shows cannot_talk.unavailable, with nothing sent and the words left in the box, when it doesn't.
describe("free talk from the text box (T050; FR-032)", () => {
  it("starts free talk with typed text when it is ready, and carries it on", async () => {
    const { v, sent } = await room(ready(), { freeTalk: true });
    say(v, "What drives him?");
    expect(sent[0]?.request).toEqual({
      feature: "free_talk",
      path: "engineer",
      turns: [{ role: "visitor", text: "What drives him?" }],
    });
    sent[0]?.ended(answer("The corpus says he builds what lasts."));
    say(v, "Tell me more.");
    expect(sent[1]?.request).toEqual({
      feature: "free_talk",
      path: "engineer",
      turns: [
        { role: "visitor", text: "What drives him?" },
        { role: "twin", text: "The corpus says he builds what lasts." },
        { role: "visitor", text: "Tell me more." },
      ],
    });
    expect(entries(v).map((e) => e.speaker)).toEqual(["You", "AI twin", "You"]);
  });

  it("shows cannot_talk.unavailable, sends nothing, and leaves the words in the box when free talk isn't ready", async () => {
    for (const freeTalk of [false, undefined]) {
      const { v, sent } = await room(ready(), freeTalk === undefined ? {} : { freeTalk });
      say(v, "What drives him?");
      expect(sent).toEqual([]);
      expect(talkLog(v.doc).lastElementChild?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
      expect(box(v).value).toBe("What drives him?");
      expect(entries(v)).toEqual([]);
    }
  });

  it("leaves free talk for a piece's conversation when a ready piece is selected", async () => {
    const { v, sent } = await room(ready(), { freeTalk: true });
    const [first] = talking(fixture().index);
    if (first === undefined) throw new Error("no talk piece");
    say(v, "What drives him?");
    select(v, first);
    expect(sent[0]?.signal?.aborted).toBe(true);
    expect(sent[1]?.request).toEqual({ feature: first, path: "engineer", turns: [] });
  });
});

// T055 (spec 007; FR-027, FR-036, FR-041; User Story 3): the box stops at the build's limit and says so; a refused turn
// shows its fixed message (429 slow_down; 400, 413, 415 unreadable), gives the words back to an empty box, never over
// what the visitor typed since, and leaves the conversation as it was.
describe("the limits in the room (T055; FR-027, FR-036, FR-041)", () => {
  const refused = (status: number): TurnResult => ({ kind: "response", status, body: { error: "refused" } });
  const message = (v: Visit): string | null => talkLog(v.doc).lastElementChild?.getAttribute("data-message") ?? null;

  it("stops the text box at the build's limit, and states it", async () => {
    const { v } = await room(ready(), {
      freeTalk: true,
      limits: { turnMaxChars: 120, historyMaxTurns: 4, historyMaxChars: 1_000 },
    });
    expect(box(v).maxLength).toBe(120);
    const described = (box(v).getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => v.doc.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(described).toContain("Up to 120 characters.");
  });

  for (const [status, id] of [
    [429, "turn_refused.slow_down"],
    [400, "turn_refused.unreadable"],
    [413, "turn_refused.unreadable"],
    [415, "turn_refused.unreadable"],
  ] as const) {
    it(`shows ${id} on a ${status}, gives the words back to an empty box, and drops the turn`, async () => {
      const { v, sent } = await room(ready(), { freeTalk: true });
      say(v, "What drives him?");
      sent[0]?.ended(answer("He builds what lasts."));
      say(v, "Tell me more.");
      expect(box(v).value).toBe("");
      sent[1]?.ended(refused(status));
      expect(message(v)).toBe(id);
      expect(box(v).value).toBe("Tell me more.");
      say(v, "Tell me more.");
      expect(sent[2]?.request.turns).toEqual([
        { role: "visitor", text: "What drives him?" },
        { role: "twin", text: "He builds what lasts." },
        { role: "visitor", text: "Tell me more." },
      ]);
    });
  }

  it("keeps what the visitor typed while the refused turn was out", async () => {
    const { v, sent } = await room(ready(), { freeTalk: true });
    say(v, "What drives him?");
    box(v).value = "Something newer.";
    sent[0]?.ended(refused(429));
    expect(message(v)).toBe("turn_refused.slow_down");
    expect(box(v).value).toBe("Something newer.");
  });
});

// T060 (spec 007; FR-005, FR-025, FR-036, FR-054; User Story 4): when the twin can't answer, the room says why, through
// the real turn client and a stub fetch. Each of spec 000's degraded causes shows its class's message, followed by the
// resume and the PDF; the edge's api_unavailable, twin_unavailable, a 502 local_error, a network error, the 35-second
// timeout, and a lost body show cannot_talk.unavailable, the last three marking the sign's visit "at least"; Stop shows
// turn_stopped; a 409 shows topic_not_ready and ends that conversation. Every time, the resume, the PDF, and the pieces
// still work.
describe("when the twin can't answer (T060; FR-036, FR-054)", () => {
  type Reply = (init: RequestInit) => Promise<Response>;
  const json =
    (status: number, body: unknown): Reply =>
    () =>
      Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  const degraded = (cause: string): Reply => json(503, { state: "degraded", cause, request_id: "r", trace_id: null });

  async function fetched(reply: Reply, o: { freeTalk?: boolean } = {}) {
    const calls: { url: string; init: RequestInit }[] = [];
    let sender: SendTurn | null = null;
    const v = start({
      room: ready(),
      sendTurn: (request, ended, signal) => sender?.(request, ended, signal),
      ...(o.freeTalk === false
        ? {}
        : {
            content: {
              ...roomContent(),
              manifest: { ...roomContent().manifest, free_talk: { ready: true } },
            },
          }),
    });
    sender = createTurnSender({
      fetch: (url, init) => {
        calls.push({ url, init });
        return reply(init);
      },
      clock: v.clock,
    });
    await enter(v, "engineer");
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    return { v, calls };
  }
  const message = (v: Visit): Element | null => talkLog(v.doc).lastElementChild;
  /** The resume, the PDF, and a piece still work after the failure. */
  async function stillWorks(v: Visit, calls: { url: string }[]): Promise<void> {
    const shown = message(v);
    const controls = [...(shown?.querySelectorAll("button, a") ?? [])].map((c) => [textOf(c), c.getAttribute("href")]);
    if (shown?.getAttribute("data-message")?.startsWith("cannot_talk.")) {
      expect(controls).toEqual([
        ["Read the resume", null],
        ["Download the resume (PDF)", "./resume.pdf"],
      ]);
    }
    const [first] = talking(fixture().index);
    if (first === undefined) throw new Error("no talk piece");
    const before = calls.length;
    select(v, first);
    await flush();
    expect(calls.length).toBe(before + 1);
    // A cannot_talk message's own pointer, or the room's Resume button; the panel offers the PDF.
    const pointer = [...(shown?.querySelectorAll("button") ?? [])].find((b) => textOf(b) === "Read the resume");
    (pointer ?? button(v.doc, "Resume")).click();
    await flush();
    expect(v.doc.querySelector(".resume-panel")?.hasAttribute("hidden")).toBe(false);
    expect(v.doc.querySelector('.resume-panel a[href="./resume.pdf"]')).not.toBeNull();
  }

  const CLASSES: Record<string, readonly string[]> = {
    "cannot_talk.resting": ["no_fallback_in_stack", "fallback_unavailable"],
    "cannot_talk.budget": [
      "meter_at_ceiling",
      "fallback_spent_today",
      "fallback_awaiting_renewal",
      "kill_switch_tripped",
      // Spec 010's Amendment 2-1 (its T047): the paid fallback's monthly cap.
      "adapter_month_spent",
    ],
    "cannot_talk.unavailable": [
      "store_unreachable",
      "store_uninitialized",
      "journal_unwritable",
      "api_unavailable",
      "twin_unavailable",
    ],
  };
  for (const [id, causes] of Object.entries(CLASSES)) {
    for (const cause of causes) {
      it(`shows ${id} for ${cause}, then the resume and the PDF, and the room still works`, async () => {
        const { v, calls } = await fetched(degraded(cause));
        say(v, "What drives him?");
        await flush();
        expect(calls.map((c) => c.url)).toEqual(["/api/room/turn"]);
        expect(message(v)?.getAttribute("data-message")).toBe(id);
        expect(textOf(message(v))).toContain(messages[id as keyof typeof messages]);
        await stillWorks(v, calls);
      });
    }
  }

  it("shows cannot_talk.unavailable for a 502 local_error, with the visit not marked", async () => {
    const { v, calls } = await fetched(json(502, { error: "local_error", request_id: "r" }));
    say(v, "What drives him?");
    await flush();
    expect(message(v)?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
    await stillWorks(v, calls);
  });

  const lost: Reply = () =>
    Promise.resolve({ status: 200, text: () => Promise.reject(new Error("lost")) } as unknown as Response);
  const hangs: Reply = (init) =>
    new Promise((_resolve, reject) =>
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
    );
  for (const [name, reply, wait] of [
    ["a network error", (() => Promise.reject(new TypeError("Failed to fetch"))) as Reply, 0],
    ["the 35-second timeout", hangs, 35_000],
    ["a lost body", lost, 0],
  ] as const) {
    it(`shows cannot_talk.unavailable for ${name}, and marks the sign's visit "at least"`, async () => {
      const { v, calls } = await fetched(reply);
      say(v, "What drives him?");
      await flush();
      if (wait > 0) {
        v.clock.advance(wait - 1);
        await flush();
        expect(message(v)?.getAttribute("data-message")).not.toBe("cannot_talk.unavailable");
        v.clock.advance(1);
        await flush();
      }
      expect(message(v)?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
      expect(v.room.cost.state.visitAtLeast).toBe(true);
      expect(box(v).value).toBe("What drives him?");
      await stillWorks(v, calls);
    });
  }

  it("shows turn_stopped when the visitor stops the turn, the fetch aborted", async () => {
    const { v, calls } = await fetched(hangs);
    say(v, "What drives him?");
    await flush();
    button(v.doc, "Stop").click();
    await flush();
    expect(calls[0]?.init.signal?.aborted).toBe(true);
    expect(message(v)?.getAttribute("data-message")).toBe("turn_stopped");
    await stillWorks(v, calls);
  });

  it("shows topic_not_ready for a 409 and ends that conversation", async () => {
    const replies: Reply[] = [json(409, { error: "not_ready", feature: "f" }), json(200, { text: "x" })];
    const { v, calls } = await fetched((init) => (replies.shift() ?? json(503, {}))(init), { freeTalk: false });
    const [first] = talking(fixture().index);
    if (first === undefined) throw new Error("no talk piece");
    select(v, first);
    await flush();
    expect(message(v)?.getAttribute("data-message")).toBe("topic_not_ready");
    // The conversation ended: typed text doesn't carry it on, and free talk isn't ready.
    say(v, "Tell me more.");
    await flush();
    expect(calls).toHaveLength(1);
    expect(message(v)?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
  });
});
