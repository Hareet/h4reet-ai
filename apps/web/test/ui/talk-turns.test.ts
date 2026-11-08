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
import type { TurnRequest } from "../../src/talk/talk";
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
  o: { freeTalk?: boolean } = {},
): Promise<{ v: Visit; sent: Sent[]; outcomes: TurnResult[] }> {
  const sent: Sent[] = [];
  const content = roomContent();
  const v = start({
    room: index,
    sendTurn: (request, ended, signal) => sent.push({ request, ended, signal }),
    ...(o.freeTalk === undefined
      ? {}
      : { content: { ...content, manifest: { ...content.manifest, free_talk: { ready: o.freeTalk } } } }),
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
