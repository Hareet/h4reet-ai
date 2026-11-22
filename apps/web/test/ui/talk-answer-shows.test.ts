// T-B01 (spec 029; FR-010, FR-011, FR-012, FR-013; plan.md §R-B2 and §R-B2a, which wins where they differ; SC-003): the
// Author's "we can't see the chat output in the box below the input text field of "your message"" (his review of
// 2026-11-15), as a test through the real panel. The room starts as main.ts starts it, with the real renderTalk,
// app.ts, split.ts, layout.ts, and the real sender (createTurnSender) over a fake fetch at the network boundary that
// answers as /api/room/turn does; nothing of the panel is a stub. The room's stylesheets go into the document in the
// bundle's order (vitest loads a CSS import as empty), so getComputedStyle gives the cascade's position, display,
// grid-row, and z-index (jsdom cascades z-index as it does position; an unset one reads "auto", and "" is read so too).
// - Two rooms (rv-spec-029's S-2): (a) free talk ready; (b) a topic ready with free talk closed, the repository's shape
//   once the Author re-marks the pack hashes, where the visitor selects that topic's piece, sees the opening answer
//   under "AI twin", then types and sends. In each the visitor focuses "Your message", types, sends by Enter (the
//   form's implicit submission) and by "Send"; within 100 ms (no clock step) their words show under "You" and the
//   field is empty; at the answer, its text shows in the log under "AI twin". Each failure (a network failure, the
//   35-second timeout on the room's fake clock, 503 degraded with each cause, 429, 400, 409) shows its fixed message
//   and gives the words back to the field.
// - No send shows nothing (FR-012; Q20, provisional): while the room doesn't take input (the hand-off, app.ts's open()
//   false; spec 033 took out the offer after it), turn_wait.room; typed text with no conversation open and free talk closed shows
//   cannot_talk.free_talk_closed while a topic is ready, and cannot_talk.unavailable while none is (the repository's
//   readiness at f411d8e1), so no message points to a piece that would refuse; each with the words left in the field
//   and no request.
// - The log shown (FR-011, FR-013): in the open split panel, every box the grid places without a row of its own is out
//   of the grid's flow (position absolute or fixed) — the boxes the grid places, with each `display: contents` child
//   expanded into its children, as B0's harness's items() does (plan.md §R-B2's reading of "every child that holds no
//   grid row of its own": the frame's SVG and the visually hidden heading; the sheet itself makes no box); every box
//   it places in a row, `.talk-sheet`'s rows among them, paints above the frame within `.talk`'s stacking context
//   (rv-spec-029's S-1, §R-B2a): the row positioned with a z-index over the frame's, or the frame's z-index negative,
//   and `.talk` a stacking context; the log's row comes before the text box row's. In every layout, nothing hides the
//   log: no hidden or inert ancestor, and no display: none, visibility: hidden, visually-hidden declarations, or zero
//   height or max-height on it or an ancestor. jsdom computes no paint order, so this is the cascade's reading; the
//   paint itself is the DevTools snippet's document.elementFromPoint (plan §10).
// - Where (Q3; N-2): the split layout at 1920 × 1080 and 1366 × 768, the split layout in the walking view, the column
//   layout (1280 × 720), the dock (390 × 844), and the stacked layout (300 × 400), each in 3D, and in 2D all but the
//   walking view, which is offered in 3D alone (layout.ts:98): eleven runs.
// On f411d8e1 the layout's clause fails in the split runs (svg.split-frame and h2#talk-heading are position:
// relative, B0 §2b), the sheet's rows are static, and the two messages don't exist. Not edited after T-B01
// (Development Workflow 4); rework-029b's T-B01 rewrote it, test-first, for rv-spec-029's S-1, S-2, S-3, and N-2.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RoomIndex } from "../../src/room/compose/bundle";
import { BUDGET_CAUSES, RESTING_CAUSES } from "../../src/room/signals/tier";
import { cannotTalkFor } from "../../src/talk/messages";
import { TURN_TIMEOUT_MS, createTurnSender } from "../../src/talk/turn-client";
import {
  WEB,
  button,
  enter,
  flush,
  nameOf,
  roomContent,
  roomIndex,
  start,
  stubViewport,
  talkLog,
  textOf,
  throughLoader,
} from "../helpers/room";
import type { Visit } from "../helpers/room";

/** The room's fixed messages by ID, the two this spec adds among them once content/messages.yaml has them. */
const MESSAGES: Readonly<Record<string, string>> = roomContent().messages;
const ANSWER = "The twin's answer, from the fake gateway.";
const WORDS = "What is this";

/** The room's stylesheets as the bundle orders them (main.ts's import graph: style.css, then app.ts's room.css,
 *  talk.ts's talk.css, split.ts's split.css, bubble.ts's bubble.css). */
const SHEETS = ["style.css", "room/room.css", "talk/talk.css", "room/hud/split.css", "room/bubble.css"].map((rel) =>
  readFileSync(join(WEB, "src", rel), "utf8"),
);

interface Layout {
  name: string;
  screen: { w: number; h: number };
  /** The root's data-hud ("stacked" where it has none) and data-split the window takes. */
  hud: "column" | "dock" | "stacked";
  split: boolean;
  walk: boolean;
}
const LAYOUTS: readonly Layout[] = [
  { name: "the split layout at 1920 × 1080", screen: { w: 1920, h: 1080 }, hud: "column", split: true, walk: false },
  { name: "the split layout at 1366 × 768", screen: { w: 1366, h: 768 }, hud: "column", split: true, walk: false },
  {
    name: "the split layout in the walking view",
    screen: { w: 1920, h: 1080 },
    hud: "column",
    split: true,
    walk: true,
  },
  { name: "the column layout (1280 × 720)", screen: { w: 1280, h: 720 }, hud: "column", split: false, walk: false },
  { name: "the dock (390 × 844)", screen: { w: 390, h: 844 }, hud: "dock", split: false, walk: false },
  { name: "the stacked layout (300 × 400)", screen: { w: 300, h: 400 }, hud: "stacked", split: false, walk: false },
];
const MODES = ["3D", "2D"] as const;
/** The runs (N-2): every layout in 3D; in 2D, all but the walking view. */
const RUNS = LAYOUTS.flatMap((layout) =>
  MODES.filter((mode) => mode === "3D" || !layout.walk).map((mode) => ({ layout, mode })),
);

/** How the fake gateway answers one request. */
type Reply = { status: number; body: unknown } | "network" | "never";

/** A fetch that answers each POST /api/room/turn with the next reply, as the route does; it records every call. */
function fakeGateway() {
  const replies: Reply[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const reply = replies.shift() ?? "network";
    if (reply === "network") return Promise.reject(new TypeError("Failed to fetch"));
    if (reply === "never")
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetch, replies, calls };
}

/** The repository's index with the turn route on, its topics ready or closed. */
function indexWith(topics: boolean): RoomIndex {
  const index = roomIndex();
  return {
    ...index,
    live: { ...index.live, turn: "site" },
    topics: index.topics.map((t) => ({ ...t, ready: topics })),
  };
}

/** Opens the room in a layout and a mode, its stylesheets in the document, up to the hand-off's offer. */
async function toHandoff(layout: Layout, mode: (typeof MODES)[number], o: { freeTalk: boolean; topics: boolean }) {
  const viewport = stubViewport(layout.screen);
  const gateway = fakeGateway();
  let sender: ReturnType<typeof createTurnSender> | null = null;
  const content = roomContent();
  const v = start({
    webgl: mode === "3D",
    room: indexWith(o.topics),
    content: { ...content, manifest: { ...content.manifest, free_talk: { ready: o.freeTalk } } },
    viewport: viewport.factory,
    sendTurn: (request, ended, signal) => sender?.(request, ended, signal),
  });
  // The real sender, on the room's own clock, so its 35-second timeout runs on the test's.
  sender = createTurnSender({ fetch: gateway.fetch, clock: v.clock });
  for (const text of SHEETS) {
    const style = v.doc.createElement("style");
    style.textContent = text;
    v.doc.head.append(style);
  }
  await enter(v, "engineer");
  await throughLoader(v);
  // Spec 033: no offer follows the hand-off, so the room doesn't take input only while it plays: stop inside it.
  v.clock.advance(1000);
  await flush();
  expect(v.room.visit.stage).toBe("handoff");
  return { v, gateway };
}

/** Into the room at the hand-off's end (spec 033: no offer), then the walking view where the layout asks for it. */
async function intoTheRoom(v: Visit, layout: Layout, mode: (typeof MODES)[number]): Promise<void> {
  v.clock.advance(4000);
  await flush();
  expect(v.room.visit.stage).toBe("room");
  const root = v.doc.documentElement;
  expect(root.getAttribute("data-hud") ?? "stacked", "the layout").toBe(layout.hud);
  expect(root.getAttribute("data-split") === "on", "the split layout").toBe(layout.split);
  if (!layout.walk) return;
  // The walking view is the 3D room's (spec 008): its runs are 3D's alone (N-2).
  expect(mode).toBe("3D");
  const walk = v.doc.querySelector<HTMLButtonElement>("button.room-walk");
  if (!walk) throw new Error("no walking control");
  walk.click();
  await flush();
  expect(v.scene.walks.at(-1)?.call).toBe("enter");
}

/** The text box, found by its label, as a visitor finds it. */
function field(v: Visit): HTMLInputElement {
  const found = [...v.doc.querySelectorAll<HTMLInputElement>("input")].filter((el) => nameOf(el) === "Your message");
  expect(found).toHaveLength(1);
  return found[0] as HTMLInputElement;
}

/** Focuses "Your message" and types the words, as input events. */
function type(v: Visit, words: string): HTMLInputElement {
  const box = field(v);
  box.focus();
  box.value = words;
  box.dispatchEvent(new v.win.Event("input", { bubbles: true }));
  return box;
}

/** Enter in the text box: the key, then the form's implicit submission, which jsdom doesn't run on its own. */
function pressEnter(v: Visit, box: HTMLInputElement): void {
  for (const kind of ["keydown", "keypress", "keyup"])
    box.dispatchEvent(new v.win.KeyboardEvent(kind, { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
  box.form?.requestSubmit();
}

/** The log's lines under "You" and "AI twin" that weren't in it at `mark` (the log keeps its last few, so counts
 *  don't tell what's new). */
const mark = (v: Visit): Set<Element> => new Set(talkLog(v.doc).querySelectorAll(".talk-entry"));
const entries = (v: Visit, since: Set<Element> = new Set()): { speaker: string | null; words: string }[] =>
  [...talkLog(v.doc).querySelectorAll(".talk-entry")]
    .filter((e) => !since.has(e))
    .map((e) => ({
      speaker: e.querySelector(".talk-speaker")?.textContent ?? null,
      words: e.querySelector(".talk-words")?.textContent ?? "",
    }));
const lastMessage = (v: Visit): { id: string | null; text: string } | null => {
  const last = [...talkLog(v.doc).querySelectorAll(".talk-message")].at(-1);
  return last ? { id: last.getAttribute("data-message"), text: textOf(last) } : null;
};

/** A fixed message's words, which must exist in content/messages.yaml. */
function words(id: string): string {
  const text = MESSAGES[id];
  expect(text, `content/messages.yaml has ${id}`).toEqual(expect.any(String));
  expect(text?.trim(), id).not.toBe("");
  return text ?? "";
}

/** Asserts the last fixed message is `id`'s, by its words (`topic` fills topic_not_ready's {topic}). */
function expectMessage(v: Visit, id: string, topic?: string): void {
  const text = topic === undefined ? words(id) : words(id).replace("{topic}", topic);
  const last = lastMessage(v);
  expect(last?.id, `the message shown for ${id}`).toBe(id);
  expect(last?.text.startsWith(text), `${id}'s words`).toBe(true);
}

const css = (v: Visit, el: Element): CSSStyleDeclaration => v.win.getComputedStyle(el);
const gridRow = (v: Visit, el: Element): string => {
  const c = css(v, el);
  return (c.getPropertyValue("grid-row") || c.getPropertyValue("grid-row-start") || "auto").trim();
};
const rowLess = (row: string): boolean => row === "" || /^auto(\s*\/\s*auto)?$/.test(row);
const outOfFlow = (v: Visit, el: Element): boolean => ["absolute", "fixed"].includes(css(v, el).position);
/** The computed z-index, "" read as "auto" (rv-rework-spec-029ab's RA-5). */
const zOf = (v: Visit, el: Element): string => css(v, el).zIndex.trim() || "auto";
/** The boxes a grid places among an element's children: each `display: contents` child expanded into its own. */
const items = (v: Visit, el: Element): Element[] =>
  [...el.children].flatMap((c) => (css(v, c).display === "contents" ? items(v, c) : [c]));
const describeBox = (v: Visit, el: Element): string =>
  `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${[...el.classList].map((c) => `.${c}`).join("")}: position=${css(v, el).position} grid-row=${gridRow(v, el)} z-index=${zOf(v, el)}`;

/** FR-011 and FR-013: the log shown in this layout, by the stylesheets' cascade. */
function expectLogShown(v: Visit, layout: Layout): void {
  const log = talkLog(v.doc);
  const talk = v.doc.querySelector<HTMLElement>("section.talk");
  if (!talk) throw new Error("no conversation panel");
  expect(talk.contains(log)).toBe(true);
  if (layout.split) {
    expect(talk.getAttribute("data-panel")).toBe("open");
    const placed = items(v, talk);
    // The RED assertion (B0 §5): nothing the grid would put in a row of its own making is in its flow.
    const strays = placed.filter((el) => rowLess(gridRow(v, el)) && !outOfFlow(v, el)).map((el) => describeBox(v, el));
    expect(strays, "boxes in the grid's flow without a row of their own").toEqual([]);
    // The frame behind the body (S-1, §R-B2a): in `.talk`'s stacking context, each box in a row, `.talk-sheet`'s rows
    // among them, is positioned with a z-index over the frame's, or the frame's z-index is negative.
    const frame = talk.querySelector(":scope > svg.split-frame");
    expect(frame, "the split panel's frame").not.toBeNull();
    if (frame) {
      expect(outOfFlow(v, frame)).toBe(true);
      const own = css(v, talk);
      expect(
        (own.position !== "static" && zOf(v, talk) !== "auto") || own.isolation === "isolate",
        `.talk a stacking context: position=${own.position} z-index=${zOf(v, talk)} isolation=${own.isolation}`,
      ).toBe(true);
      const frameZ = zOf(v, frame);
      const frameBehind = frameZ !== "auto" && Number.parseInt(frameZ, 10) < 0;
      const above = (el: Element): boolean =>
        frameBehind ||
        (css(v, el).position !== "static" &&
          zOf(v, el) !== "auto" &&
          Number.parseInt(zOf(v, el), 10) > (frameZ === "auto" ? 0 : Number.parseInt(frameZ, 10)));
      const sheet = talk.querySelector(":scope > .talk-sheet");
      if (!sheet) throw new Error("no conversation sheet");
      const rows = [...sheet.children];
      for (const sel of [".talk-head", ".split-top", "#talk-log", ".talk-status"])
        expect(
          rows.some((el) => el.matches(sel)),
          `${sel} among .talk-sheet's rows`,
        ).toBe(true);
      const under = [...new Set([...rows, ...placed.filter((el) => !outOfFlow(v, el))])]
        .filter((el) => !above(el))
        .map((el) => describeBox(v, el));
      expect(under, `boxes the frame (z-index=${frameZ}) would paint over`).toEqual([]);
    }
    const form = talk.querySelector(".talk-form");
    if (!form) throw new Error("no text box row");
    const logRow = Number.parseInt(gridRow(v, log), 10);
    const formRow = Number.parseInt(gridRow(v, form), 10);
    expect(Number.isInteger(logRow) && Number.isInteger(formRow), `${gridRow(v, log)} / ${gridRow(v, form)}`).toBe(
      true,
    );
    expect(logRow).toBeLessThan(formRow);
  }
  // Nothing hides the log, on it or any ancestor.
  for (let el: Element | null = log; el !== null; el = el.parentElement) {
    const c = css(v, el);
    const where = describeBox(v, el);
    expect(el.hasAttribute("hidden"), `${where}: hidden`).toBe(false);
    expect(el.hasAttribute("inert"), `${where}: inert`).toBe(false);
    expect(c.display, `${where}: display`).not.toBe("none");
    expect(["0", "0px"].includes(c.height.trim()), `${where}: height ${c.height}`).toBe(false);
    expect(["0", "0px"].includes(c.maxHeight.trim()), `${where}: max-height ${c.maxHeight}`).toBe(false);
    const clipped = c.getPropertyValue("clip-path").replace(/\s+/g, "") === "inset(50%)";
    const pinhole = c.width.trim() === "1px" && c.height.trim() === "1px" && c.overflow.includes("hidden");
    expect(clipped || pinhole, `${where}: the visually-hidden declarations`).toBe(false);
  }
  expect(css(v, log).visibility, "the log's visibility").not.toBe("hidden");
}

/** One send that fails: the words show under "You" at once, then the message, and they come back to the field. */
async function sendFailing(v: Visit, id: string, by: "Enter" | "Send", step = 0, topic?: string): Promise<void> {
  const box = type(v, WORDS);
  const sent = mark(v);
  if (by === "Enter") pressEnter(v, box);
  else button(v.doc, "Send").click();
  expect(entries(v, sent), `${id}: the visitor's line at once`).toEqual([{ speaker: "You", words: WORDS }]);
  expect(field(v).value).toBe("");
  await flush();
  if (step > 0) {
    v.clock.advance(step);
    await flush();
  }
  expectMessage(v, id, topic);
  expect(field(v).value, `${id}: the words given back`).toBe(WORDS);
}

/** The room's first piece that talks about a topic, with the topic's phrase. */
function talkingPiece(): { id: string; topic: string; phrase: string } {
  const index = roomIndex();
  for (const s of index.selectables) {
    if (s.action.kind !== "talk") continue;
    const { topic } = s.action;
    const phrase = index.topics.find((t) => t.id === topic)?.phrase;
    if (phrase !== undefined) return { id: s.id, topic, phrase };
  }
  throw new Error("the room has no piece that talks");
}

/** Selects a piece from the room's list, as a visitor does. */
function select(v: Visit, id: string): void {
  const b = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")].find(
    (x) => x.getAttribute("data-object-id") === id,
  );
  if (!b) throw new Error(`no button for ${id}`);
  b.click();
}

/** The feature each request to the fake gateway named. */
const features = (calls: { init: RequestInit }[]): unknown[] =>
  calls.map((c) => (JSON.parse(String(c.init.body)) as { feature?: unknown }).feature);

/** The two answers (by Enter, then by "Send") and every failure, in the open conversation; `topic` is the piece's
 *  phrase in a topic's conversation, where a 409 ends it with topic_not_ready, or undefined in free talk. */
async function answersAndFailures(
  v: Visit,
  layout: Layout,
  gateway: ReturnType<typeof fakeGateway>,
  topic?: string,
): Promise<void> {
  const calls = gateway.calls.length;
  // By Enter: the visitor's line within 100 ms, then the answer under "AI twin".
  gateway.replies.push({ status: 200, body: { text: ANSWER } });
  const box = type(v, WORDS);
  expect(v.doc.activeElement).toBe(box);
  const before = mark(v);
  pressEnter(v, box);
  expect(entries(v, before)).toEqual([{ speaker: "You", words: WORDS }]);
  expect(field(v).value).toBe("");
  await flush();
  expect(gateway.calls.slice(calls).map((c) => `${c.init.method} ${c.url}`)).toEqual(["POST /api/room/turn"]);
  expect(entries(v, before)).toEqual([
    { speaker: "You", words: WORDS },
    { speaker: "AI twin", words: ANSWER },
  ]);
  expectLogShown(v, layout);

  // By "Send": the same.
  gateway.replies.push({ status: 200, body: { text: `${ANSWER} Again.` } });
  type(v, WORDS);
  const again = mark(v);
  button(v.doc, "Send").click();
  expect(entries(v, again)).toEqual([{ speaker: "You", words: WORDS }]);
  await flush();
  expect(entries(v, again)).toEqual([
    { speaker: "You", words: WORDS },
    { speaker: "AI twin", words: `${ANSWER} Again.` },
  ]);
  expectLogShown(v, layout);

  // Each failure: its fixed message, the words back in the field; a 409 last, since it ends a topic's conversation.
  gateway.replies.push("network");
  await sendFailing(v, "cannot_talk.unavailable", "Enter");
  gateway.replies.push("never");
  await sendFailing(v, "cannot_talk.unavailable", "Send", TURN_TIMEOUT_MS);
  for (const cause of [...RESTING_CAUSES, ...BUDGET_CAUSES, "no_path_available"]) {
    gateway.replies.push({ status: 503, body: { state: "degraded", cause } });
    await sendFailing(v, cannotTalkFor(cause), "Enter");
  }
  for (const [status, id] of [
    [429, "turn_refused.slow_down"],
    [400, "turn_refused.unreadable"],
    [409, topic === undefined ? "cannot_talk.unavailable" : "topic_not_ready"],
  ] as const) {
    gateway.replies.push({ status, body: { error: "refused" } });
    await sendFailing(v, id, "Send", 0, id === "topic_not_ready" ? topic : undefined);
  }
  expect(gateway.calls.length - calls).toBe(2 + 2 + RESTING_CAUSES.length + BUDGET_CAUSES.length + 1 + 3);
  expectLogShown(v, layout);
}

describe.each(RUNS)(
  "the conversation shows its answer in $layout.name, $mode (FR-010 to FR-013)",
  ({ layout, mode }) => {
    it("(a) free talk ready: types, sends by Enter and by Send, and shows each answer and each failure's message in the log, the log shown", async () => {
      const { v, gateway } = await toHandoff(layout, mode, { freeTalk: true, topics: true });
      await intoTheRoom(v, layout, mode);
      await answersAndFailures(v, layout, gateway);
      expect(new Set(features(gateway.calls))).toEqual(new Set(["free_talk"]));
    });

    it("(b) a topic ready, free talk closed: selects its piece, shows the opening answer, then types, sends, and shows each answer and each failure's message", async () => {
      const piece = talkingPiece();
      const { v, gateway } = await toHandoff(layout, mode, { freeTalk: false, topics: true });
      await intoTheRoom(v, layout, mode);
      gateway.replies.push({ status: 200, body: { text: "The twin's opening, from the fake gateway." } });
      const before = mark(v);
      select(v, piece.id);
      await flush();
      expect(entries(v, before)).toEqual([{ speaker: "AI twin", words: "The twin's opening, from the fake gateway." }]);
      expectLogShown(v, layout);
      await answersAndFailures(v, layout, gateway, piece.phrase);
      // Every turn went to the piece's conversation (its ID is the feature, spec 007's FR-032), none to free talk.
      expect(new Set(features(gateway.calls))).toEqual(new Set([piece.id]));
    });

    it("says why while the room doesn't take input yet, keeps the words, and sends them once the visitor is in the room", async () => {
      const { v, gateway } = await toHandoff(layout, mode, { freeTalk: true, topics: true });
      // The hand-off (spec 033: no offer after it): the room doesn't take input yet (open() false), so the words wait,
      // and it says so.
      pressEnter(v, type(v, WORDS));
      expectMessage(v, "turn_wait.room");
      expect(field(v).value).toBe(WORDS);
      expect(gateway.calls).toHaveLength(0);
      await intoTheRoom(v, layout, mode);
      gateway.replies.push({ status: 200, body: { text: ANSWER } });
      expect(field(v).value).toBe(WORDS);
      const before = mark(v);
      button(v.doc, "Send").click();
      await flush();
      expect(entries(v, before)).toEqual([
        { speaker: "You", words: WORDS },
        { speaker: "AI twin", words: ANSWER },
      ]);
      expectLogShown(v, layout);
    });

    it("says free talk is closed, not that the service is unavailable, when free talk is closed and a topic is ready (Q20)", async () => {
      const { v, gateway } = await toHandoff(layout, mode, { freeTalk: false, topics: true });
      await intoTheRoom(v, layout, mode);
      pressEnter(v, type(v, WORDS));
      expectMessage(v, "cannot_talk.free_talk_closed");
      expect(lastMessage(v)?.text.startsWith(words("cannot_talk.unavailable"))).toBe(false);
      expect(field(v).value).toBe(WORDS);
      expect(gateway.calls).toHaveLength(0);
      expectLogShown(v, layout);
    });

    it("says the service is unavailable, never that a piece would talk, when free talk and every topic are closed (Q20)", async () => {
      const { v, gateway } = await toHandoff(layout, mode, { freeTalk: false, topics: false });
      await intoTheRoom(v, layout, mode);
      pressEnter(v, type(v, WORDS));
      expectMessage(v, "cannot_talk.unavailable");
      expect(lastMessage(v)?.text.startsWith(words("cannot_talk.free_talk_closed"))).toBe(false);
      expect(field(v).value).toBe(WORDS);
      expect(gateway.calls).toHaveLength(0);
      expectLogShown(v, layout);
    });
  },
);
