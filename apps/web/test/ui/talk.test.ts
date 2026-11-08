// T038 (spec 002; FR-023, FR-026, FR-027, FR-039, FR-040; contracts/room-conversation.md §3; research.md R-14): the
// room's floor before the twin exists. Each object answers topic_not_ready, the text box cannot_talk.unavailable with a
// pointer to the resume and the PDF, and the talk button announces voice_unavailable and moves focus to the text box
// without asking for the microphone. No request leaves but the events beacon (Phase 6's), which nothing sends yet.
// T105 (spec 004; FR-037, FR-063; R-16, R-33): the selectables, their names, and their topics come from the bundle's
// index, as compose() makes it: of the fixture set, whose IDs are synthetic fx- ones, and of the repository's data,
// whose IDs no test names. A selectable whose topic isn't ready answers topic_not_ready, its {topic} filled with the
// topic's own phrase from the index, never the visitor's words, and calls nothing.
// T205 (spec 004; FR-036 to FR-038, FR-076, SC-015; User Story 6, scenarios 3 and 4; R-33): selectObject runs the
// selectable's action. An unready topic shows topic_not_ready with its own phrase, makes no model call and no request
// but its usage event, and sends no turn; "Laptop and screen" holds the laptop, its stand, and the monitor, found from
// compose()'s room by how they mount; a ready topic makes the conversation's feature the selectable's ID, so a turn
// carries only that ID, the visitor's path, and the turns, through the twin's sender (absent until the twin's spec) and
// only while live.turn is site; and a resume action opens the resume.
// T264 (spec 004; FR-037, FR-047, FR-050, SC-015; contracts/turn-cost.md §7): renderTalk's onTurnOutcome(result) is
// called exactly once for each turn the panel sent, when the sender reports its end, and never for a turn it didn't
// send: an unready topic, free talk that isn't ready, the route off, or no sender. The room wires it to its one cost
// channel (signals/turn-cost.ts), whose fallback cue reaches the tier (row 7's, in the frame log), and whose state reaches
// the stage; it makes no request and stores nothing.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { createFrameLog } from "../../src/room/signals/frame-log";
import type { TurnResult } from "../../src/room/signals/turn-cost";
import { MESSAGE_IDS, cannotTalkFor } from "../../src/talk/messages";
import { renderTalk } from "../../src/talk/talk";
import type { TurnRequest } from "../../src/talk/talk";
import {
  FakeClock,
  WEB,
  button,
  enter,
  flush,
  intoRoom,
  repositoryBundle,
  roomContent,
  roomIndex,
  start,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

let composed: ComposeResult | null = null;
/** The fixture set, composed once a file, as a release build in strict mode. */
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));

/** A selectable's topic's phrase, from the index; null where its action isn't talk. */
function phraseOf(index: RoomIndex, id: string): string | null {
  const action = index.selectables.find((s) => s.id === id)?.action;
  return action?.kind === "talk" ? (index.topics.find((t) => t.id === action.topic)?.phrase ?? null) : null;
}

/** A selectable's button in the "In the room" list. */
function listButton(v: Visit, id: string): HTMLButtonElement {
  const found = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")].find(
    (b) => b.getAttribute("data-object-id") === id,
  );
  if (!found) throw new Error(`no button in the list for ${id}`);
  return found;
}

const messages = roomContent().messages;
const lastMessage = (v: Visit): Element | null => talkLog(v.doc).lastElementChild;
const textBox = (v: Visit): HTMLInputElement => {
  const el = v.doc.querySelector<HTMLInputElement>("#talk-text");
  if (!el) throw new Error("no text box");
  return el;
};

afterEach(() => vi.restoreAllMocks());

describe("the selectables", () => {
  it("each answer topic_not_ready, naming its topic by the index's phrase, and call no model", async () => {
    for (const index of [fixture().index, roomIndex()]) {
      const v = start({ room: index });
      await intoRoom(v);
      expect(index.selectables.filter((s) => phraseOf(index, s.id) !== null).length).toBeGreaterThan(0);
      for (const { id } of index.selectables) {
        const [events, shown] = [v.events.length, talkLog(v.doc).children.length];
        listButton(v, id).click();
        expect(v.events.slice(events)[0], id).toEqual({ kind: "object_selected", id });
        const phrase = phraseOf(index, id);
        if (phrase === null) {
          // An action other than talk names no topic, so it shows no message: the fixture's opens the resume.
          expect(talkLog(v.doc).children, id).toHaveLength(shown);
          continue;
        }
        expect(v.events.slice(events), id).toEqual([{ kind: "object_selected", id }]);
        expect(textOf(lastMessage(v)), id).toBe(messages.topic_not_ready.replace("{topic}", phrase));
        expect(lastMessage(v)?.getAttribute("data-message")).toBe("topic_not_ready");
      }
      expect(v.spies.network).toEqual([]);
    }
  });

  it("fill the message with the topic's own phrase, never the visitor's words", async () => {
    const { index } = fixture();
    const v = start({ room: index });
    await intoRoom(v);
    const talk = index.selectables.find((s) => phraseOf(index, s.id) !== null);
    if (!talk) throw new Error("the fixture opens no topic");
    textBox(v).value = "a topic of my own";
    listButton(v, talk.id).click();
    expect(textOf(lastMessage(v))).toBe(messages.topic_not_ready.replace("{topic}", phraseOf(index, talk.id) ?? ""));
    expect(textOf(talkLog(v.doc))).not.toContain("a topic of my own");
  });

  it("are none of them ready in the manifest, and neither is free talk", () => {
    const { manifest } = roomContent();
    expect(manifest.objects.map((o) => o.id)).toEqual(roomIndex().selectables.map((s) => s.id));
    for (const o of manifest.objects) expect(o.ready, o.id).toBe(o.action === "talk" ? false : null);
    expect(manifest.free_talk.ready).toBe(false);
  });
});

/** The index with one topic made ready, as the twin's spec will mark it, and the turn route on (`live.turn`). */
function readyIndex(index: RoomIndex, topic: string, turn: RoomIndex["live"]["turn"] = "site"): RoomIndex {
  return {
    ...index,
    live: { ...index.live, turn },
    topics: index.topics.map((t) => (t.id === topic ? { ...t, ready: true } : t)),
  };
}

/** The fixture's selectable whose action is talk, and its topic's ID. */
function talkingSelectable(index: RoomIndex): { id: string; topic: string } {
  for (const s of index.selectables) if (s.action.kind === "talk") return { id: s.id, topic: s.action.topic };
  throw new Error("the fixture opens no topic");
}

/** Sends the visitor's words through the text box. */
function say(v: Visit, words: string): void {
  textBox(v).value = words;
  button(v.doc, "Send").click();
}

describe("a selectable's action (T205)", () => {
  it("is topic_not_ready for every unready topic, with no request but its usage event and no turn", async () => {
    for (const index of [fixture().index, roomIndex()]) {
      const sent: TurnRequest[] = [];
      // The route on and a sender given: an unready topic still sends nothing anywhere.
      const v = start({ room: { ...index, live: { ...index.live, turn: "site" } }, sendTurn: (r) => sent.push(r) });
      await intoRoom(v);
      const before = v.events.length;
      const talking = index.selectables.filter((s) => s.action.kind === "talk");
      expect(talking.length).toBeGreaterThan(0);
      for (const { id } of talking) {
        listButton(v, id).click();
        expect(lastMessage(v)?.getAttribute("data-message"), id).toBe("topic_not_ready");
        expect(textOf(lastMessage(v)), id).toBe(messages.topic_not_ready.replace("{topic}", phraseOf(index, id) ?? ""));
      }
      expect(v.events.slice(before)).toEqual(talking.map(({ id }) => ({ kind: "object_selected", id })));
      // A typed turn afterwards is still free talk, which isn't ready.
      say(v, "and now?");
      expect(lastMessage(v)?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
      expect(sent).toEqual([]);
      expect(v.spies.network).toEqual([]);
      expect(v.spies.beacons).toEqual([]);
    }
  });

  it("gives each topic of the repository's room its own phrase, which every selectable opening it shares", () => {
    const index = roomIndex();
    for (const s of index.selectables) {
      if (s.action.kind !== "talk") continue;
      const { topic } = s.action;
      expect(
        index.topics.filter((t) => t.id === topic),
        s.id,
      ).toHaveLength(1);
    }
    const phrases = index.topics.map((t) => t.phrase);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const t of index.topics) expect(t.ready, t.id).toBe(false);
  });

  it("makes one selectable of the plugged pose's host, its stand, and the monitor, which opens a topic (compose())", () => {
    const { index, scene } = repositoryBundle();
    const placement = (id: string | undefined): (typeof scene.placements)[number] | undefined =>
      scene.placements.find((p) => p.id === id);
    // The laptop: where the tier switch's pose that claims local (the plugged pose) mounts its plug.
    const tier = index.switches.find((s) => s.signal === "tier" && s.claims);
    const plugged = tier?.claims ? scene.switches.find((s) => s.id === tier.id)?.poses[tier.claims.local] : undefined;
    const laptop = plugged?.mount.on;
    // Its stand: what the laptop mounts on. The monitor: what the neon sign clips onto.
    const stand = placement(laptop)?.mount?.on;
    const neon = index.faces.find((f) => f.regions.some((r) => r.renderer === "neon"))?.placement;
    const monitor = placement(neon)?.mount?.on;
    const found = [laptop, stand, monitor];
    expect(found.every((id) => typeof id === "string")).toBe(true);
    expect(new Set(found).size).toBe(3);
    const selectable = index.selectables.find((s) => laptop !== undefined && s.members.includes(laptop));
    expect([...(selectable?.members ?? [])].sort()).toEqual([...found].sort());
    // FR-036: its ID is `laptop`, the laptop's own, and it opens work projects.
    expect(selectable?.id).toBe(laptop);
    expect(selectable?.action.kind).toBe("talk");
  });

  // Spec 007 supersedes what this test pinned before the twin existed (its FR-032, provisional Q4; FR-033; FR-034): a
  // ready piece's selection now sends its opening, the conversation takes one turn at a time, and selecting the active
  // conversation's own piece sends nothing.
  it("makes a ready topic's selectable the conversation's feature and sends its opening: a turn carries only it, the path, and the turns", async () => {
    const base = fixture().index;
    const { id, topic } = talkingSelectable(base);
    const sent: { request: TurnRequest; ended: (result: TurnResult) => void }[] = [];
    const v = start({ room: readyIndex(base, topic), sendTurn: (request, ended) => sent.push({ request, ended }) });
    await enter(v, "non-engineer");
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    const shown = talkLog(v.doc).children.length;
    listButton(v, id).click();
    expect(v.events.at(-1)).toEqual({ kind: "object_selected", id });
    // No fixed message: the twin's opening is on its way.
    expect(talkLog(v.doc).children).toHaveLength(shown);
    expect(sent.map((s) => s.request)).toEqual([{ feature: id, path: "non-engineer", turns: [] }]);
    const reply = (text: string): TurnResult => ({
      kind: "response",
      status: 200,
      body: { text, feature: id, cost_micro_usd: 0, route: "local" },
    });
    sent[0]?.ended(reply("An opening."));
    say(v, "What was the work?");
    expect(sent).toHaveLength(2);
    expect(Object.keys(sent[1]?.request ?? {}).sort()).toEqual(["feature", "path", "turns"]);
    expect(sent[1]?.request).toEqual({
      feature: id,
      path: "non-engineer",
      turns: [
        { role: "twin", text: "An opening." },
        { role: "visitor", text: "What was the work?" },
      ],
    });
    // The conversation so far, newest last.
    sent[1]?.ended(reply("The work was this."));
    say(v, "And then?");
    expect(sent[2]?.request.turns.at(-1)).toEqual({ role: "visitor", text: "And then?" });
    // Selecting it again sends nothing: it is the active conversation's own piece.
    listButton(v, id).click();
    expect(sent).toHaveLength(3);
    // No lead, live value, face's words, or cost rides along; the room itself made no request.
    expect(JSON.stringify(sent.map((s) => s.request))).not.toContain("lead");
    expect(v.spies.network).toEqual([]);
    expect(v.events.filter((e) => e.kind === "turn_sent")).toHaveLength(2);
  });

  it("sends no turn while the turn route is off or no sender exists: the turn is cannot_talk.unavailable", async () => {
    const base = fixture().index;
    const { id, topic } = talkingSelectable(base);
    const sent: TurnRequest[] = [];
    for (const v of [
      start({ room: readyIndex(base, topic, "off"), sendTurn: (r) => sent.push(r) }),
      start({ room: readyIndex(base, topic) }),
    ]) {
      await intoRoom(v);
      listButton(v, id).click();
      say(v, "hello");
      expect(lastMessage(v)?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
      expect(textBox(v).value).toBe("hello");
      expect(v.spies.network).toEqual([]);
    }
    expect(sent).toEqual([]);
  });

  it("opens the resume for a resume action, with no message and no call", async () => {
    const index = fixture().index;
    const resume = index.selectables.find((s) => s.action.kind === "resume");
    if (!resume) throw new Error("the fixture has no resume action");
    const sent: TurnRequest[] = [];
    const v = start({ room: index, sendTurn: (r) => sent.push(r) });
    await intoRoom(v);
    const [before, shown] = [v.events.length, talkLog(v.doc).children.length];
    expect(v.doc.querySelector(".resume-panel")?.hasAttribute("hidden")).toBe(true);
    listButton(v, resume.id).click();
    await flush();
    expect(v.events.slice(before)).toEqual([{ kind: "object_selected", id: resume.id }, { kind: "resume_opened" }]);
    expect(v.doc.querySelector(".resume-panel")?.hasAttribute("hidden")).toBe(false);
    expect(talkLog(v.doc).children).toHaveLength(shown);
    expect(sent).toEqual([]);
    expect(v.spies.network).toEqual([]);
  });
});

describe("the text box", () => {
  it("answers cannot_talk.unavailable, ending with the resume and the PDF, and sends turn_sent", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    textBox(v).value = "What did the Author build?";
    button(v.doc, "Send").click();
    const message = lastMessage(v);
    expect(message?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
    expect(textOf(message)).toContain(messages["cannot_talk.unavailable"]);
    const controls = [...(message?.querySelectorAll("button, a") ?? [])];
    expect(controls.map((c) => [c.tagName, textOf(c), c.getAttribute("href")])).toEqual([
      ["BUTTON", "Read the resume", null],
      ["A", "Download the resume (PDF)", "./resume.pdf"],
    ]);
    expect(v.events).toEqual([{ kind: "resume_kept" }, { kind: "turn_sent" }]);
    expect(v.spies.network).toEqual([]);
  });

  it("sends with Enter in the box, too, through the form, which never submits", async () => {
    const v = start();
    await intoRoom(v);
    textBox(v).value = "hello";
    const form = textBox(v).form;
    const submit = new v.win.Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(lastMessage(v)?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
  });

  it("keeps the visitor's text in the box, since nothing was sent anywhere", async () => {
    const v = start();
    await intoRoom(v);
    textBox(v).value = "Tell me about the room.";
    button(v.doc, "Send").click();
    expect(textBox(v).value).toBe("Tell me about the room.");
    expect(textOf(talkLog(v.doc))).not.toContain("Tell me about the room.");
  });

  it("ignores an empty send", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    textBox(v).value = "   ";
    button(v.doc, "Send").click();
    expect(talkLog(v.doc).children).toHaveLength(0);
    expect(v.events).toEqual([{ kind: "resume_kept" }]);
  });

  it("opens the resume from the message's pointer", async () => {
    const v = start();
    await intoRoom(v);
    textBox(v).value = "hi";
    button(v.doc, "Send").click();
    button(v.doc, "Read the resume").click();
    await flush();
    expect(v.doc.querySelector(".resume-panel")?.hasAttribute("hidden")).toBe(false);
  });
});

describe("the talk button", () => {
  const press: [string, (v: Visit, el: HTMLElement) => void][] = [
    ["a pointer", (v, el) => el.dispatchEvent(new v.win.PointerEvent("pointerdown", { bubbles: true }))],
    ["a held Space", (v, el) => el.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: " ", bubbles: true }))],
    ["a held Enter", (v, el) => el.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))],
    ["a screen reader's click", (_v, el) => el.click()],
  ];

  for (const [how, act] of press) {
    it(`announces voice_unavailable on ${how}, moves focus to the text box, and never asks for the microphone`, async () => {
      const v = start();
      await intoRoom(v);
      const talk = button(v.doc, "Hold to talk");
      talk.focus();
      act(v, talk);
      expect(lastMessage(v)?.getAttribute("data-message")).toBe("voice_unavailable");
      expect(textOf(lastMessage(v))).toBe(messages.voice_unavailable);
      expect(v.doc.activeElement).toBe(textBox(v));
      expect(v.events.at(-1)).toEqual({ kind: "voice_pressed" });
      expect(v.spies.microphone).toBe(0);
    });
  }

  it("shows one message for one press, though a press fires pointerdown, pointerup, and click", async () => {
    const v = start();
    await intoRoom(v);
    const talk = button(v.doc, "Hold to talk");
    talk.dispatchEvent(new v.win.PointerEvent("pointerdown", { bubbles: true }));
    talk.dispatchEvent(new v.win.PointerEvent("pointerup", { bubbles: true }));
    talk.click();
    expect(talkLog(v.doc).children).toHaveLength(1);
    expect(v.events.filter((e) => e.kind === "voice_pressed")).toHaveLength(1);
    v.clock.advance(2000);
    talk.click();
    expect(talkLog(v.doc).children).toHaveLength(2);
  });

  it("is one press however long it's held: one message, one voice_pressed", async () => {
    const v = start();
    await intoRoom(v);
    const talk = button(v.doc, "Hold to talk");
    talk.dispatchEvent(new v.win.PointerEvent("pointerdown", { bubbles: true }));
    v.clock.advance(2500);
    talk.dispatchEvent(new v.win.PointerEvent("pointerup", { bubbles: true }));
    talk.click();
    expect(talkLog(v.doc).children).toHaveLength(1);
    expect(v.events.filter((e) => e.kind === "voice_pressed")).toHaveLength(1);
  });

  it("takes a click after a cancelled pointer press as a press of its own", async () => {
    const v = start();
    await intoRoom(v);
    const talk = button(v.doc, "Hold to talk");
    talk.dispatchEvent(new v.win.PointerEvent("pointerdown", { bubbles: true }));
    talk.dispatchEvent(new v.win.PointerEvent("pointercancel", { bubbles: true }));
    v.clock.advance(100);
    talk.click();
    expect(talkLog(v.doc).children).toHaveLength(2);
    expect(v.events.filter((e) => e.kind === "voice_pressed")).toHaveLength(2);
  });

  it("keeps microphone=() in the image's Permissions-Policy until push-to-talk's group", () => {
    const nginx = readFileSync(join(WEB, "nginx.conf"), "utf8");
    expect(nginx).toContain('Permissions-Policy "microphone=(), camera=(), geolocation=()"');
  });
});

describe("requests", () => {
  it("sends none but the events beacon, through every surface of the room", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const v = start({ webgl: true });
    const baseline = v.doc.querySelectorAll("img, script, link, iframe, audio, video, source, object, embed").length;
    await intoRoom(v);
    for (const b of v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")) b.click();
    textBox(v).value = "hello";
    button(v.doc, "Send").click();
    button(v.doc, "Hold to talk").click();
    button(v.doc, "Resume").click();
    v.clock.advance(30_000);
    expect(v.spies.network).toEqual([]);
    expect(v.spies.microphone).toBe(0);
    expect(globalFetch).not.toHaveBeenCalled();
    for (const beacon of v.spies.beacons) {
      expect(beacon.url).toBe("/api/room/events");
      // {kind} or {kind, id}, and nothing else (contracts/room-events.md §1).
      expect([["kind"], ["id", "kind"]]).toContainEqual(Object.keys(JSON.parse(beacon.body) as object).sort());
    }
    expect(v.doc.querySelectorAll("img, script, link, iframe, audio, video, source, object, embed")).toHaveLength(
      baseline,
    );
  });
});

describe("the fixed messages", () => {
  it("hold every message data-model.md §7 names, each written in advance", () => {
    expect([...MESSAGE_IDS]).toEqual([
      "topic_not_ready",
      "cannot_talk.resting",
      "cannot_talk.budget",
      "cannot_talk.unavailable",
      "voice_unavailable",
      "voice_output_unavailable",
      "didnt_catch",
      "utterance_limit",
      // Spec 007's Amendment 2-2 adds four to the closed list (its FR-038).
      "twin_answering",
      "turn_refused.slow_down",
      "turn_refused.unreadable",
      "turn_stopped",
    ]);
    for (const id of MESSAGE_IDS) expect(messages[id].trim(), id).not.toBe("");
    expect(messages.topic_not_ready).toContain("{topic}");
  });

  it("map spec 000's degraded causes to the three cannot_talk classes, an unknown cause to unavailable", () => {
    for (const cause of ["local_unhealthy", "local_error", "no_fallback_in_stack", "fallback_unavailable"]) {
      expect(cannotTalkFor(cause), cause).toBe("cannot_talk.resting");
    }
    for (const cause of [
      "meter_at_ceiling",
      "fallback_spent_today",
      "fallback_awaiting_renewal",
      "kill_switch_tripped",
    ]) {
      expect(cannotTalkFor(cause), cause).toBe("cannot_talk.budget");
    }
    for (const cause of [
      "store_unreachable",
      "store_uninitialized",
      "journal_unwritable",
      "api_unavailable",
      "x",
      undefined,
    ]) {
      expect(cannotTalkFor(cause), String(cause)).toBe("cannot_talk.unavailable");
    }
  });
});

// ---- T264: the turn's outcome (contracts/turn-cost.md §7) ----

/** A talk panel on its own page, every option given, its sender recording each turn and the end it reports. */
function panel(o: { ready?: boolean; route?: boolean; sender?: boolean } = {}) {
  const doc = new JSDOM("<main></main>").window.document;
  const sent: { request: TurnRequest; ended: (result: TurnResult) => void }[] = [];
  const outcomes: TurnResult[] = [];
  const talk = renderTalk(doc, {
    messages,
    clock: new FakeClock(),
    emit: () => undefined,
    enabled: () => true,
    openResume: () => undefined,
    pdfFollowed: () => undefined,
    path: () => "engineer",
    turns: [],
    freeTalkReady: o.ready ?? true,
    turnRoute: o.route ?? true,
    ...(o.sender === false ? {} : { sendTurn: (request, ended) => sent.push({ request, ended }) }),
    onTurnOutcome: (result) => outcomes.push(result),
  });
  doc.body.append(talk.element);
  const send = (words: string): void => {
    talk.textBox.value = words;
    talk.element.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  };
  return { talk, sent, outcomes, send };
}

const paid: TurnResult = {
  kind: "response",
  status: 200,
  body: { text: "t", feature: "free_talk", cost_micro_usd: 950, route: "fallback" },
};

describe("onTurnOutcome (T264; contracts/turn-cost.md §7)", () => {
  it("is called exactly once for each sent turn, after its end, with what the sender reported", () => {
    const { sent, outcomes, send } = panel();
    send("first");
    // Spec 007's FR-033: one turn in flight, so the second waits for the first's end.
    send("second");
    expect(sent).toHaveLength(1);
    // Nothing before a turn's end.
    expect(outcomes).toEqual([]);
    const lost: TurnResult = { kind: "error", error: "aborted" };
    sent[0]?.ended(lost);
    expect(outcomes).toEqual([lost]);
    send("second");
    expect(sent).toHaveLength(2);
    sent[1]?.ended(paid);
    expect(outcomes).toEqual([lost, paid]);
    // A second end of the same turn reports nothing more.
    sent[0]?.ended({ kind: "error", error: "network" });
    sent[1]?.ended(lost);
    expect(outcomes).toEqual([lost, paid]);
  });

  it("is never called for a turn the panel didn't send: free talk not ready, an unready topic, no route, no sender", () => {
    for (const o of [{ ready: false }, { route: false }, { sender: false }]) {
      const { sent, outcomes, send } = panel(o);
      send("hello");
      expect(sent, JSON.stringify(o)).toEqual([]);
      expect(outcomes, JSON.stringify(o)).toEqual([]);
    }
    const { talk, sent, outcomes, send } = panel();
    talk.topicSelected("fx-topic-selectable", { phrase: "a topic", ready: false });
    send("about it");
    // The conversation stays free talk, which is ready here: one turn, and its outcome only at its end.
    expect(sent).toHaveLength(1);
    expect(outcomes).toEqual([]);
  });
});

describe("the room's cost channel (T264, T266; contracts/turn-cost.md §6, §7)", () => {
  it("makes one channel, configured by live.turn, fed by each turn's outcome, its fallback cue reaching the tier", async () => {
    const base = fixture().index;
    const { id, topic } = talkingSelectable(base);
    const sent: { request: TurnRequest; ended: (result: TurnResult) => void }[] = [];
    const v = start({
      room: readyIndex(base, topic),
      sendTurn: (request, ended) => sent.push({ request, ended }),
      frameLog: createFrameLog,
      webgl: true,
    });
    await intoRoom(v);
    expect(v.room.cost.state.configured).toBe(true);
    expect(v.room.cost.state.call).toBe("no-call-yet");
    // Spec 007's FR-032: the selection sends the opening, whose end feeds the channel.
    listButton(v, id).click();
    expect(v.room.cost.state.call).toBe("no-call-yet");
    sent[0]?.ended(paid);
    expect(v.room.cost.state.visitMicro).toBe(950n);
    expect(v.room.cost.state.call).toEqual({ paid: 950n });
    const fallbacks = (): number => {
      const log = JSON.parse((v.win as unknown as { h4FrameLog: () => string }).h4FrameLog()) as {
        entries: { event: string }[];
      };
      return log.entries.filter((e) => e.event === "fallback").length;
    };
    // Row 7's cue, through signals/live.ts.
    expect(fallbacks()).toBe(1);
    say(v, "And then?");
    sent[1]?.ended({ kind: "response", status: 200, body: { cost_micro_usd: 0, route: "local" } });
    expect(v.room.cost.state.call).toBe("local-zero");
    expect(fallbacks()).toBe(1);
    // The stage took each state.
    expect(v.scene.cost.at(-1)).toEqual(v.room.cost.state);
    // No request, no storage, and nothing in the talk panel's log about the cost.
    expect(v.spies.network).toEqual([]);
    expect(v.spies.storage).toEqual([]);
    expect(textOf(talkLog(v.doc))).not.toMatch(/\$|est\./);
  });

  it("reads unconfigured while live.turn is off, and changes nothing", async () => {
    const v = start({ room: fixture().index });
    await intoRoom(v);
    expect(v.room.cost.state.configured).toBe(false);
    expect(v.room.cost.state.call).toBe("unconfigured");
  });
});
