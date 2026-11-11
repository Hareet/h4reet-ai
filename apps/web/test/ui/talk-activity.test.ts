// T033 (spec 016; FR-022; plan.md R-08; contracts/twin-states.md §1): the conversation panel's activity, which the
// twin's states read, through the real panel (src/talk/talk.ts) with a sender the test holds.
// - draft on each input event and on send; turn out and ended (answered, failed, stopped); answer with its word count,
//   only for the twin's answers, never for cannot_talk, topic_not_ready, a failure's message, or turn_stopped; and
//   selected on a piece's selection.
// - No activity carries a word, a topic, a feature, a cost, or a time.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import type { TurnResult } from "../../src/room/signals/turn-cost";
import { renderTalk } from "../../src/talk/talk";
import type { TalkActivity } from "../../src/talk/talk";
import { FakeClock, roomContent } from "../helpers/room";

interface Sent {
  ended: (result: TurnResult) => void;
}

function panel(o: { turnRoute?: boolean; freeTalkReady?: boolean } = {}) {
  const doc = new JSDOM("<main></main>", { url: "http://127.0.0.1:18105/" }).window.document;
  const activity: TalkActivity[] = [];
  const sent: Sent[] = [];
  const talk = renderTalk(doc, {
    messages: roomContent().messages,
    clock: new FakeClock(),
    emit: () => undefined,
    enabled: () => true,
    openResume: () => undefined,
    pdfFollowed: () => undefined,
    path: () => "engineer",
    turns: [],
    freeTalkReady: o.freeTalkReady ?? true,
    turnRoute: o.turnRoute ?? true,
    sendTurn: (_request, ended) => sent.push({ ended }),
    onActivity: (a) => activity.push(a),
  });
  doc.body.append(talk.element);
  const type = (text: string): void => {
    talk.textBox.value = text;
    talk.textBox.dispatchEvent(new doc.defaultView!.Event("input", { bubbles: true }));
  };
  const send = (): void => {
    const form = talk.element.querySelector("form");
    form?.dispatchEvent(new doc.defaultView!.Event("submit", { bubbles: true, cancelable: true }));
  };
  return { doc, talk, activity, sent, type, send };
}

const answered = (text: string): TurnResult => ({ kind: "response", status: 200, body: { text } }) as TurnResult;

describe("the panel's activity (FR-022)", () => {
  it("reports draft on each input event, holding while the box holds text, and not on send", () => {
    const p = panel();
    p.type("Hi");
    p.type("");
    p.type("Hello there");
    p.send();
    expect(p.activity.slice(0, 3)).toEqual([
      { kind: "draft", holds: true },
      { kind: "draft", holds: false },
      { kind: "draft", holds: true },
    ]);
    expect(p.activity).toContainEqual({ kind: "draft", holds: false });
  });

  it("reports a turn out on send, and ended when answered, with the answer's words", () => {
    const p = panel();
    p.type("How does the room work?");
    p.send();
    expect(p.activity).toContainEqual({ kind: "turn", out: true });
    p.sent[0]?.ended(answered("It is drawn by the site's own code."));
    expect(p.activity.slice(-2)).toEqual([
      { kind: "turn", out: false },
      { kind: "answer", words: 8 },
    ]);
  });

  it.each([
    ["a failure", { kind: "error" } as TurnResult],
    [
      "a degraded refusal",
      { kind: "response", status: 503, body: { state: "degraded", cause: "budget" } } as TurnResult,
    ],
    ["a slow-down", { kind: "response", status: 429, body: {} } as TurnResult],
    ["an empty answer", answered("   ")],
  ])("ends the turn with no answer on %s", (_, result) => {
    const p = panel();
    p.type("A question");
    p.send();
    p.sent[0]?.ended(result);
    expect(p.activity.at(-1)).toEqual({ kind: "turn", out: false });
    expect(p.activity.some((a) => a.kind === "answer")).toBe(false);
  });

  it("ends a stopped turn with no answer", () => {
    const p = panel();
    p.type("A question");
    p.send();
    const stop = [...p.talk.element.querySelectorAll("button")].find((b) => b.textContent === "Stop");
    stop?.click();
    p.sent[0]?.ended({ kind: "error" } as TurnResult);
    expect(p.activity.at(-1)).toEqual({ kind: "turn", out: false });
    expect(p.activity.some((a) => a.kind === "answer")).toBe(false);
  });

  it("sends no turn and no answer where the turn can't go: cannot_talk", () => {
    const p = panel({ turnRoute: false });
    p.type("A question");
    p.send();
    expect(p.activity.some((a) => a.kind === "turn" || a.kind === "answer")).toBe(false);
  });

  it("reports selected on a piece's selection, ready or not, and no answer for topic_not_ready", () => {
    const p = panel();
    p.talk.topicSelected("fx-topic", { phrase: "a fixture topic", ready: false });
    expect(p.activity).toEqual([{ kind: "selected" }]);
    p.talk.topicSelected("fx-topic", { phrase: "a fixture topic", ready: true });
    expect(p.activity).toEqual([{ kind: "selected" }, { kind: "selected" }, { kind: "turn", out: true }]);
  });

  it("carries no word, topic, feature, cost, or time", () => {
    const p = panel();
    p.type("secret words");
    p.send();
    p.sent[0]?.ended(answered("More secret words here."));
    p.talk.topicSelected("fx-topic", { phrase: "a fixture topic", ready: true });
    for (const a of p.activity) {
      expect(Object.keys(a).every((k) => ["kind", "holds", "out", "words"].includes(k))).toBe(true);
      expect(JSON.stringify(a)).not.toMatch(/secret|fixture|fx-topic|engineer/);
    }
  });
});
