// Spec 018's split HUD, the panel and the list (T003 starts it: the key cap; T008 to T012, T010 add the rest).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { keycap } from "../../src/room/hud/keycap";
import type { TurnRequest } from "../../src/talk/talk";
import { button, enter, flush, parseCss, stubViewport, start, throughLoader } from "../helpers/room";
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
    sendTurn: (request, ended, signal) => {
      sent.push({ request, signal });
      signal?.addEventListener("abort", () => ended({ kind: "error", error: "aborted" }));
    },
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

  it("opens from the bar by the larger toggle, and the hint closes it, ending the larger view", async () => {
    const { v } = await room();
    const larger = v.doc.querySelector(".talk-larger") as HTMLButtonElement;
    larger.click();
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    (v.doc.querySelector(".split-hint") as HTMLButtonElement).click();
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    expect(larger.getAttribute("aria-expanded")).toBe("false");
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

// ---- T010 (Q4; FR-003): the portrait ----

import { createHash } from "node:crypto";
import { createSplit } from "../../src/room/hud/split";
import { fetchStill } from "../../src/room/flat";
import type { Still } from "../../src/room/flat";

const split = (portrait?: () => Promise<string | null>) => {
  const dom = new JSDOM(
    '<body><div class="room-list"><h2 class="room-list-heading"></h2><ul><li><button data-object-id="a">A</button></li></ul></div>' +
      '<section class="talk"><div class="talk-sheet"><div class="talk-head"><button class="talk-log-toggle"><span>Conversation</span></button></div><div class="talk-log"></div></div></section></body>',
  );
  const doc = dom.window.document;
  const s = createSplit(doc, {
    talk: doc.querySelector(".talk") as HTMLElement,
    list: doc.querySelector(".room-list") as HTMLElement,
    words: { select: "Select a piece", back: "Back", close: "Close", esc: "Esc", enter: "Enter" },
    stats: () => [],
    turnOut: () => false,
    walking: () => false,
    ...(portrait ? { portrait } : {}),
  });
  s.setActive(true);
  return { doc, s };
};
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));
};

describe("the portrait (T010)", () => {
  it("shows the still where the fetch gives one, the silhouette until then and where it fails", async () => {
    const ok = split(() => Promise.resolve("data:image/png;base64,AAAA"));
    ok.s.openPanel();
    expect(ok.doc.querySelector(".split-silhouette")).not.toBeNull();
    await settle();
    expect(ok.doc.querySelector(".split-still")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    for (const give of [() => Promise.resolve(null), () => Promise.reject(new Error("no"))]) {
      const bad = split(give);
      bad.s.openPanel();
      await settle();
      expect(bad.doc.querySelector(".split-silhouette")).not.toBeNull();
      expect(bad.doc.querySelector(".split-still")).toBeNull();
    }
  });
  it("fetches once, at the first opening, never while a bar", async () => {
    let calls = 0;
    const t = split(() => {
      calls += 1;
      return Promise.resolve(null);
    });
    await settle();
    expect(calls).toBe(0);
    t.s.openPanel();
    t.s.closePanel();
    t.s.openPanel();
    expect(calls).toBe(1);
  });
  it("is spec 016's verified fetch: same-origin, with integrity, refusing bytes that aren't the index's", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const still = {
      url: "/twin/still.png",
      sha256: sha,
      bytes: 4,
      rect: [0, 0, 1, 1],
      view: [0, 0, 1, 1],
      placement: "p",
    } as Still;
    const seen: RequestInit[] = [];
    const serve = (body: Uint8Array) => (_url: string, init: RequestInit) => {
      seen.push(init);
      return Promise.resolve(new Response(body as unknown as BodyInit, { status: 200 }));
    };
    expect(await fetchStill(still, serve(bytes))).toMatch(/^data:image\/png;base64,/);
    expect(seen[0]).toMatchObject({ mode: "same-origin", credentials: "same-origin", redirect: "error" });
    expect(await fetchStill(still, serve(new Uint8Array([9, 9])))).toBeNull();
    expect(await fetchStill(still, () => Promise.reject(new Error("down")))).toBeNull();
  });
});

// ---- T011 (FR-007, FR-008): choosing ----

const entries = (v: Visit): HTMLButtonElement[] => [
  ...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button[data-object-id]"),
];

describe("the list (T011; FR-007, FR-008)", () => {
  it("has the label, and Back only while the panel is open, named with its key", async () => {
    const { v } = await room();
    expect(v.doc.querySelector(".split-label")?.textContent).toBe("Select a piece");
    const back = v.doc.querySelector<HTMLButtonElement>(".split-back");
    expect(back?.hidden).toBe(true);
    expect(back?.getAttribute("aria-label")).toBe("Back, Escape");
    talkingPiece(v).click();
    await flush();
    expect(back?.hidden).toBe(false);
    expect(back?.querySelector(".hud-keycap")?.textContent).toBe("Esc");
    back?.click();
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    expect(back?.hidden).toBe(true);
  });

  it("marks the focused entry: aria-current, a stroke above and below, the confirm key cap; no other entry has them", async () => {
    const { v } = await room();
    const [first, second] = entries(v);
    first?.focus();
    expect(first?.getAttribute("aria-current")).toBe("true");
    expect(first?.closest("li")?.querySelectorAll(".split-stroke")).toHaveLength(2);
    expect(first?.closest("li")?.querySelector(".split-confirm")?.textContent).toBe("Enter");
    expect(first?.closest("li")?.querySelector(".split-confirm")?.getAttribute("aria-hidden")).toBe("true");
    second?.focus();
    expect(first?.hasAttribute("aria-current")).toBe(false);
    expect(first?.closest("li")?.querySelector(".split-stroke, .split-confirm")).toBeNull();
    expect(second?.getAttribute("aria-current")).toBe("true");
    expect(v.doc.querySelectorAll(".room-list [aria-current]")).toHaveLength(1);
  });

  it("falls back to the hovered entry, then to the piece of the open conversation", async () => {
    const { v } = await room();
    const [first] = entries(v);
    const piece = talkingPiece(v);
    first?.dispatchEvent(new v.win.Event("pointerover", { bubbles: true }));
    expect(first?.getAttribute("aria-current")).toBe("true");
    v.doc.querySelector(".room-list")?.dispatchEvent(new v.win.Event("pointerleave"));
    expect(v.doc.querySelectorAll(".room-list [aria-current]")).toHaveLength(0);
    piece.click();
    await flush();
    expect(piece.getAttribute("aria-current")).toBe("true");
  });

  it("opens a piece in one tap", async () => {
    const { v, sent } = await room();
    talkingPiece(v).click();
    await flush();
    expect(sent).toHaveLength(1);
    expect(talk(v).getAttribute("data-panel")).toBe("open");
  });

  it("gives no entry another row size when the selection moves: the selected rule sets type, never a size", () => {
    const css = readFileSync(fileURLToPath(new URL("../../src/room/hud/split.css", import.meta.url)), "utf8");
    const rules = parseCss(css).rules.filter((r) => /\[data-selected\]/.test(r.selector));
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules)
      for (const name of ["height", "min-height", "max-height", "padding", "margin", "border-width", "line-height"])
        expect(r.declarations.has(name), `${r.selector} sets ${name}`).toBe(false);
    expect(css).toMatch(/\.room-list[^{]*\{[^}]*text-align:\s*right/);
  });
});
