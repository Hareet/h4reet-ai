// T-A03 (spec 028; FR-001 to FR-003; Q1, Q2; plan.md §R-A4): the conversation panel beside the room's left wall. It
// holds no portrait in any state (the twin's still, its silhouette); the room fetches no still for it in a 3D visit
// (spec 016's rule again: the still only where the 2D room shows it); in the split layout it stands open at rest and
// in a conversation, with no bar state and no "Larger conversation"; Escape and "Back" close the open piece's
// conversation and leave the panel standing, its log as the conversation left it; elsewhere the log's own collapse
// ("Conversation", a toggle) is as before.
import { describe, expect, it } from "vitest";

import type { RoomIndex } from "../../src/room/compose/bundle";
import type { TurnRequest } from "../../src/talk/talk";
import { enter, flush, roomIndex, stubViewport, start, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";

/** The repository's index, which bundles the twin's still, with every talk topic ready and the turn route on. */
const ready = (): RoomIndex => {
  const index = roomIndex();
  return { ...index, live: { ...index.live, turn: "site" }, topics: index.topics.map((t) => ({ ...t, ready: true })) };
};
const WIDE = { w: 1920, h: 1080 } as const;

async function room(screen: { w: number; h: number } = WIDE, o: { webgl?: boolean; answer?: string } = {}) {
  const sent: TurnRequest[] = [];
  const viewport = stubViewport(screen);
  const v = start({
    ...(o.webgl ? { webgl: true, maxTextureSize: 4096 } : {}),
    room: ready(),
    sendTurn: (request, ended, signal) => {
      sent.push(request);
      if (o.answer !== undefined) ended({ kind: "response", status: 200, body: { text: o.answer } });
      else signal?.addEventListener("abort", () => ended({ kind: "error", error: "aborted" }));
    },
    viewport: viewport.factory,
  });
  await enter(v, "engineer");
  await throughLoader(v);
  v.clock.advance(5000);
  [...v.doc.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Keep it for later")?.click();
  await flush();
  return { v, sent, viewport };
}
const talk = (v: Visit): HTMLElement => v.doc.querySelector<HTMLElement>(".talk") as HTMLElement;
const talkingPiece = (v: Visit): HTMLButtonElement => {
  const id = ready().selectables.find((s) => s.action.kind === "talk")?.id ?? "";
  return v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`) as HTMLButtonElement;
};
const PORTRAIT = ".split-portrait, .split-silhouette, .split-still";
const key = (v: Visit, el: Element, name: string): void => {
  el.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
};

describe("no portrait (FR-001; Q1)", () => {
  it("holds no portrait in any state: at rest, in a conversation, and after it closes", async () => {
    const { v } = await room();
    expect(v.doc.documentElement.getAttribute("data-split")).toBe("on");
    expect(v.doc.querySelector(PORTRAIT)).toBeNull();
    talkingPiece(v).click();
    await flush();
    expect(v.doc.querySelector(PORTRAIT)).toBeNull();
    (v.doc.querySelector(".split-back") as HTMLButtonElement).click();
    await flush();
    expect(v.doc.querySelector(PORTRAIT)).toBeNull();
  });
});

describe("no still in 3D (FR-002)", () => {
  it("makes no request for the twin's still in a 3D visit, at rest or in a conversation", async () => {
    const { v } = await room(WIDE, { webgl: true });
    expect(v.doc.querySelector(".room-stage-view")?.getAttribute("data-stage")).toBe("3d");
    expect(ready().twin?.still).toBeTruthy();
    talkingPiece(v).click();
    await flush();
    await flush();
    expect(v.spies.assets).toEqual([]);
  });
});

describe("the panel stands open in the split layout (FR-003; Q2)", () => {
  it("is open at rest: the title, the emblem and the stats, the log, and the text box row; no hint and no Back yet", async () => {
    const { v } = await room();
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    for (const part of [".talk-head", ".split-top", ".split-emblem", ".split-stats", "#talk-log", "#talk-text"])
      expect(talk(v).querySelector(part), part).not.toBeNull();
    expect((v.doc.querySelector(".split-hint") as HTMLElement | null)?.hidden ?? true).toBe(true);
    expect(v.doc.querySelector<HTMLButtonElement>(".split-back")?.hidden).toBe(true);
  });

  it('doesn\'t show "Larger conversation" there, and shows it again in the other layouts', async () => {
    const { v, viewport } = await room();
    const larger = v.doc.querySelector<HTMLButtonElement>(".talk-larger");
    expect(larger?.hidden).toBe(true);
    viewport.set({ w: 844, h: 390 });
    expect(v.doc.documentElement.getAttribute("data-split")).toBe("off");
    expect(larger?.hidden).toBe(false);
  });

  it("stays open, its box and parts unchanged, when a conversation opens", async () => {
    const { v } = await room();
    const top = v.doc.querySelector(".split-top");
    talkingPiece(v).click();
    await flush();
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    expect(v.doc.querySelector(".split-top")).toBe(top);
    expect((v.doc.querySelector(".split-hint") as HTMLElement).hidden).toBe(false);
    expect(v.doc.querySelector<HTMLButtonElement>(".split-back")?.hidden).toBe(false);
  });

  it("Back closes the open piece's conversation and leaves the panel standing, its log kept", async () => {
    const { v } = await room(WIDE, { answer: "The twin's answer." });
    talkingPiece(v).click();
    await flush();
    const lines = v.doc.querySelectorAll("#talk-log > *").length;
    expect(lines).toBeGreaterThan(0);
    (v.doc.querySelector(".split-back") as HTMLButtonElement).click();
    await flush();
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    expect(v.doc.querySelectorAll("#talk-log > *").length).toBe(lines);
    expect(v.doc.querySelector<HTMLButtonElement>(".split-back")?.hidden).toBe(true);
    expect((v.doc.querySelector(".split-hint") as HTMLElement).hidden).toBe(true);
  });

  it("Escape closes the open piece's conversation and leaves the panel standing, its log kept", async () => {
    const { v } = await room();
    const piece = talkingPiece(v);
    piece.click();
    await flush();
    const text = v.doc.getElementById("talk-text") as HTMLInputElement;
    text.focus();
    // The first Escape stops the turn that is out (spec 018's FR-009 order); the next closes the conversation.
    key(v, text, "Escape");
    const lines = v.doc.querySelectorAll("#talk-log > *").length;
    key(v, text, "Escape");
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    expect(v.doc.querySelectorAll("#talk-log > *").length).toBe(lines);
    expect(v.doc.querySelector<HTMLButtonElement>(".split-back")?.hidden).toBe(true);
    expect(v.doc.activeElement).toBe(piece);
  });
});

describe("the log's collapse elsewhere (FR-003)", () => {
  it('keeps "Conversation" a toggle of the log in the dock and column layouts, with no panel state', async () => {
    for (const screen of [
      { w: 390, h: 844 },
      { w: 844, h: 390 },
    ]) {
      const { v } = await room(screen);
      expect(v.doc.documentElement.getAttribute("data-split")).toBe("off");
      expect(talk(v).hasAttribute("data-panel")).toBe(false);
      const toggle = v.doc.querySelector<HTMLButtonElement>(".talk-log-toggle") as HTMLButtonElement;
      const before = toggle.getAttribute("aria-expanded");
      toggle.click();
      expect(toggle.getAttribute("aria-expanded")).not.toBe(before);
      expect(v.doc.querySelector(PORTRAIT)).toBeNull();
    }
  });
});
