// Spec 018's split HUD, the panel and the list (T003 starts it: the key cap; T008 to T012, T010 add the rest).
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { keycap } from "../../src/room/hud/keycap";
import type { TurnRequest } from "../../src/talk/talk";
import { button, enter, flush, stubViewport, start, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

describe("keycap (T003; FR-013)", () => {
  it("shows its name, hidden from assistive technology, by class only", () => {
    const doc = new JSDOM("<!doctype html><body></body>").window.document;
    const cap = keycap(doc, "Esc");
    expect(cap.textContent).toBe("Esc");
    expect(cap.getAttribute("aria-hidden")).toBe("true");
    expect(cap.className).toBe("hud-keycap");
    expect(cap.getAttribute("style")).toBeNull();
  });
});

// ---- T008 (FR-005, FR-006, FR-009): the panel ----

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));
/** The fixture's index with every talk topic ready and the turn route on. */
const ready = (): RoomIndex => {
  const index = fixture().index;
  return { ...index, live: { ...index.live, turn: "site" }, topics: index.topics.map((t) => ({ ...t, ready: true })) };
};
interface Sent {
  request: TurnRequest;
  signal: AbortSignal | undefined;
}
const WIDE = { w: 1280, h: 720 } as const;

async function room(screen: { w: number; h: number } = WIDE) {
  const sent: Sent[] = [];
  const viewport = stubViewport(screen);
  const v = start({
    room: ready(),
    sendTurn: (request, _ended, signal) => sent.push({ request, signal }),
    viewport: viewport.factory,
  });
  await enter(v, "engineer");
  await throughLoader(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  return { v, sent, viewport };
}
const root = (v: Visit): HTMLElement => v.doc.documentElement;
const talk = (v: Visit): HTMLElement => v.doc.querySelector<HTMLElement>(".talk") as HTMLElement;
const talkingPiece = (v: Visit): HTMLButtonElement => {
  const index = ready();
  const id = index.selectables.find((s) => s.action.kind === "talk")?.id ?? "";
  return v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`) as HTMLButtonElement;
};
const key = (v: Visit, el: Element, name: string): void => {
  el.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
};

describe("the panel (T008; FR-005, FR-006, FR-009)", () => {
  it("opens as the bar: the title, the text box row, Send, and talk; no frame, stats, or portrait", async () => {
    const { v } = await room();
    expect(root(v).getAttribute("data-split")).toBe("on");
    expect(root(v).getAttribute("data-hud")).toBe("column");
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    expect(v.doc.querySelector(".talk-log-toggle")?.textContent).toContain("Conversation");
    expect(v.doc.querySelector("#talk-text")).not.toBeNull();
    for (const part of [".split-frame", ".split-stats", ".split-portrait", ".split-hint", ".split-emblem"])
      expect(v.doc.querySelector(part), part).toBeNull();
  });

  it("opens the panel when a conversation starts: the hint with its key cap, the emblem, the three stats, the portrait slot", async () => {
    const { v } = await room();
    talkingPiece(v).click();
    await flush();
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    const hint = v.doc.querySelector(".split-hint");
    expect(hint?.getAttribute("aria-label")).toBe("Close, Escape");
    expect(hint?.querySelector(".hud-keycap")?.textContent).toBe("Esc");
    expect(v.doc.querySelector(".split-emblem")?.getAttribute("aria-hidden")).toBe("true");
    const labels = [...v.doc.querySelectorAll(".split-stats dt")].map((e) => e.textContent);
    expect(labels).toEqual(["Serving", "This call", "This visit"]);
    expect(v.doc.querySelectorAll(".split-stats dd")).toHaveLength(3);
    expect(v.doc.querySelector(".split-frame")?.getAttribute("aria-hidden")).toBe("true");
    expect(v.doc.querySelector(".split-frame path")?.getAttribute("d")).toMatch(/^M[0-9.,\-LZ\s]+$/);
    expect(v.doc.querySelector(".split-portrait")?.getAttribute("aria-hidden")).toBe("true");
    // The log is the body, between the stats and the text box row.
    const order = [".split-stats", "#talk-log", "#talk-text"].map((s) => v.doc.querySelector(s) as Element);
    expect(order[0]?.compareDocumentPosition(order[1] as Node)).toBe(4);
    expect(order[1]?.compareDocumentPosition(order[2] as Node)).toBe(4);
  });

  it("opens from the title while a bar", async () => {
    const { v } = await room();
    (v.doc.querySelector(".talk-log-toggle") as HTMLButtonElement).click();
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    (v.doc.querySelector(".talk-log-toggle") as HTMLButtonElement).click();
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
  });

  it("with a turn out, Escape stops the turn first; then Escape closes to the bar and focuses the selected entry", async () => {
    const { v, sent } = await room();
    const piece = talkingPiece(v);
    piece.click();
    await flush();
    expect(sent).toHaveLength(1);
    const text = v.doc.getElementById("talk-text") as HTMLInputElement;
    text.focus();
    key(v, text, "Escape");
    expect(sent[0]?.signal?.aborted).toBe(true);
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    key(v, text, "Escape");
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    expect(v.doc.activeElement).toBe(piece);
    expect(v.doc.querySelector(".split-frame")).toBeNull();
  });

  it("keeps the log and the typed text across a resize under 48rem and back", async () => {
    const { v, viewport } = await room();
    talkingPiece(v).click();
    await flush();
    const text = v.doc.getElementById("talk-text") as HTMLInputElement;
    text.value = "hello";
    const lines = v.doc.querySelectorAll("#talk-log > *").length;
    viewport.set({ w: 700, h: 400 });
    expect(root(v).getAttribute("data-split")).toBe("off");
    expect(v.doc.querySelectorAll("#talk-log > *").length).toBe(lines);
    expect((v.doc.getElementById("talk-text") as HTMLInputElement).value).toBe("hello");
    viewport.set(WIDE);
    expect(root(v).getAttribute("data-split")).toBe("on");
    expect(v.doc.querySelectorAll("#talk-log > *").length).toBe(lines);
    expect((v.doc.getElementById("talk-text") as HTMLInputElement).value).toBe("hello");
  });

  it("does nothing in today's layouts: no split parts, no panel state", async () => {
    const { v } = await room({ w: 390, h: 844 });
    expect(root(v).getAttribute("data-split")).toBe("off");
    talkingPiece(v).click();
    await flush();
    expect(v.doc.querySelector(".split-frame, .split-stats, .split-hint")).toBeNull();
  });
});
