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
import { button, enter, flush, parseCss, roomContent, stubViewport, start, throughLoader } from "../helpers/room";
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
/** T024 (plan.md §13): a window the split layout takes by FR-001's rule; 1280 × 720 no longer does. */
const WIDE = { w: 1920, h: 1080 } as const;

async function room(screen: { w: number; h: number } = WIDE, o: { freeTalk?: boolean } = {}) {
  const sent: Sent[] = [];
  const viewport = stubViewport(screen);
  const content = roomContent();
  const v = start({
    room: ready(),
    ...(o.freeTalk ? { content: { ...content, manifest: { ...content.manifest, free_talk: { ready: true } } } } : {}),
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

  it("keeps the log and the typed text across a resize to 1280 x 720, which takes no split, and back", async () => {
    const { v, viewport } = await room();
    talkingPiece(v).click();
    await flush();
    const text = v.doc.getElementById("talk-text") as HTMLInputElement;
    text.value = "hello";
    const lines = v.doc.querySelectorAll("#talk-log > *").length;
    viewport.set({ w: 1280, h: 720 });
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

// ---- T018's findings: the review's (a worker that did not write the code) ----

describe("after review (T018)", () => {
  it("Escape outside the conversation closes the panel and ends the larger view (finding 1)", async () => {
    const { v } = await room();
    (v.doc.querySelector(".talk-larger") as HTMLButtonElement).click();
    expect(talk(v).getAttribute("data-panel")).toBe("open");
    const piece = entries(v)[0] as HTMLButtonElement;
    piece.focus();
    key(v, piece, "Escape");
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    expect((v.doc.querySelector(".talk-larger") as HTMLButtonElement).getAttribute("aria-expanded")).toBe("false");
  });

  it("a part that throws midway leaves no stray part behind, and the next opening builds one set (finding 2)", () => {
    let calls = 0;
    const t = split();
    const again = createSplit(t.doc, {
      talk: t.doc.querySelector(".talk") as HTMLElement,
      list: t.doc.querySelector(".room-list") as HTMLElement,
      words: { select: "Select a piece", back: "Back", close: "Close", esc: "Esc", enter: "Enter" },
      stats: () => {
        calls += 1;
        if (calls === 1) throw new Error("no stats");
        return [];
      },
      turnOut: () => false,
      walking: () => false,
    });
    again.setActive(true);
    expect(() => again.openPanel()).not.toThrow();
    again.closePanel();
    again.openPanel();
    expect(t.doc.querySelectorAll(".split-hint")).toHaveLength(1);
    again.closePanel();
    expect(t.doc.querySelector(".split-hint, .split-top, .split-portrait")).toBeNull();
  });

  it("leaves aria-current to the target alone once the split layout goes (finding 3)", async () => {
    const { v, viewport } = await room();
    const [first] = entries(v);
    first?.dispatchEvent(new v.win.Event("pointerover", { bubbles: true }));
    expect(first?.getAttribute("aria-current")).toBe("true");
    viewport.set({ w: 700, h: 400 });
    expect(v.doc.querySelectorAll(".room-list [aria-current]")).toHaveLength(0);
  });

  it("keeps the focus and the portrait when the window changes size while the panel is open (finding 5)", async () => {
    const { v, viewport } = await room();
    (v.doc.querySelector(".talk-larger") as HTMLButtonElement).click();
    const hint = v.doc.querySelector(".split-hint");
    const slot = v.doc.querySelector(".split-portrait");
    expect(v.doc.activeElement).toBe(hint);
    const before = v.doc.querySelector(".split-frame path")?.getAttribute("d");
    viewport.set({ w: 1400, h: 800 });
    expect(v.doc.querySelector(".split-hint")).toBe(hint);
    expect(v.doc.querySelector(".split-portrait")).toBe(slot);
    expect(v.doc.activeElement).toBe(hint);
    expect(v.doc.querySelector(".split-frame path")?.getAttribute("d")).not.toBe(before);
  });

  it("does not open for a conversation in a window the split layout doesn't take (finding 6)", async () => {
    const { v, viewport } = await room({ w: 700, h: 400 });
    talkingPiece(v).click();
    await flush();
    viewport.set(WIDE);
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
  });
});

// ---- T024 (rule 6's rework; FR-004, FR-006, FR-009, plan.md §3, §13): the rest row, the openings, Escape's order, and
// focus back to the opener ----

const SPLIT_CSS = parseCss(
  readFileSync(fileURLToPath(new URL("../../src/room/hud/split.css", import.meta.url)), "utf8"),
).rules;
/** The last top-level rule naming `selector` exactly among its selector list that sets `property`. */
const decl = (selector: string, property: string): string | undefined =>
  SPLIT_CSS.filter(
    (r) =>
      r.selector
        .split(",")
        .map((x) => x.trim())
        .includes(selector) && r.declarations.has(property),
  )
    .at(-1)
    ?.declarations.get(property);
const ON = 'html[data-split="on"][data-hud="column"]';

/** A split on a page of its own, its talk section holding the text box, the larger toggle, and the log. */
const unit = (o: { turnOut?: boolean; walking?: boolean; resumeOpen?: boolean } = {}) => {
  const dom = new JSDOM(
    '<body><div class="room-list"><h2 class="room-list-heading"></h2><ul>' +
      '<li><button data-object-id="a">A</button></li><li><button data-object-id="b">B</button></li></ul></div>' +
      '<section class="talk" data-larger="off"><div class="talk-sheet"><div class="talk-head">' +
      '<button class="talk-log-toggle"><span>Conversation</span></button><button class="talk-larger">Larger</button></div>' +
      '<div class="talk-log"></div></div><form class="talk-form"><input id="talk-text"></form></section>' +
      '<button id="outside">Outside</button></body>',
    { pretendToBeVisual: true },
  );
  const doc = dom.window.document;
  const s = createSplit(doc, {
    talk: doc.querySelector(".talk") as HTMLElement,
    list: doc.querySelector(".room-list") as HTMLElement,
    words: { select: "Select a piece", back: "Back", close: "Close", esc: "Esc", enter: "Enter" },
    stats: () => [],
    turnOut: () => o.turnOut ?? false,
    walking: () => o.walking ?? false,
    resumeOpen: () => o.resumeOpen ?? false,
  });
  s.setActive(true);
  const escape = (target: Element = doc.body): KeyboardEvent => {
    const e = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  const q = <T extends Element = HTMLElement>(sel: string): T => doc.querySelector(sel) as unknown as T;
  return { dom, doc, s, escape, q };
};

describe("the rest row (T024; FR-004, R-2)", () => {
  it("is in the bar's band at its left, at --split-rest-*, holding the head and the text box row", async () => {
    const { v } = await room();
    const style = root(v).style;
    expect(
      ["--split-rest-x", "--split-rest-y", "--split-rest-w", "--split-rest-h"].map((n) => style.getPropertyValue(n)),
    ).toEqual(["0px", "1028px", "640px", "52px"]);
    expect(style.getPropertyValue("--split-bar-y")).toBe("");
    const rest = `${ON} .talk[data-panel="bar"]`;
    expect(decl(rest, "left")).toBe("var(--split-rest-x)");
    expect(decl(rest, "top") ?? "").toContain("var(--split-rest-y)");
    expect(decl(rest, "width")).toBe("var(--split-rest-w)");
    expect(decl(rest, "height")).toBe("var(--split-rest-h)");
    // Its contents: the title toggle, "Larger conversation", the label, the text box, Send, and the talk button.
    const t = talk(v);
    expect(t.getAttribute("data-panel")).toBe("bar");
    for (const part of [".talk-log-toggle", ".talk-larger", 'label[for="talk-text"]', "#talk-text", ".talk-voice"])
      expect(t.querySelector(part), part).not.toBeNull();
    expect(button(v.doc, "Send")).toBeTruthy();
  });

  it("opens the panel round the frame's box, its title row at --split-title-h, the frame below it", () => {
    const open = `${ON} .talk[data-panel="open"]`;
    expect(decl(open, "top")).toBe("var(--split-frame-y)");
    expect(decl(open, "height") ?? "").toContain("var(--split-frame-h)");
    expect(decl(`${ON} .split-frame`, "top")).toBe("var(--split-title-h)");
    expect(decl(`${ON} .talk-head`, "min-height")).toBe("var(--split-title-h)");
  });

  it("draws the frame below the title row the kernel gives, never a fixed 44 px", () => {
    const { s, q } = unit();
    s.setSize(640, 970.5, 55);
    s.openPanel();
    expect(q(".split-frame").getAttribute("viewBox")).toBe("0 0 640 915.5");
    s.setSize(800, 1000, 44);
    expect(q(".split-frame").getAttribute("viewBox")).toBe("0 0 800 956");
  });
});

describe("the openings (T024; FR-006)", () => {
  it("opens the panel for a sent turn with no piece open, free talk included", async () => {
    const { v, sent } = await room(WIDE, { freeTalk: true });
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    const text = v.doc.getElementById("talk-text") as HTMLInputElement;
    text.value = "Hello";
    button(v.doc, "Send").click();
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.request.feature).toBe("free_talk");
    expect(talk(v).getAttribute("data-panel")).toBe("open");
  });
});

describe("Escape's order (T024; FR-009, R-5)", () => {
  it("1: leaves an event whose default is already prevented", () => {
    const u = unit();
    u.s.openPanel();
    u.dom.window.addEventListener("keydown", (e) => e.preventDefault(), true);
    u.escape();
    expect(u.s.open).toBe(true);
  });

  it("2: leaves Escape to the browser in full screen", () => {
    const u = unit();
    u.s.openPanel();
    Object.defineProperty(u.doc, "fullscreenElement", { value: u.doc.documentElement, configurable: true });
    const e = u.escape();
    expect(u.s.open).toBe(true);
    expect(e.defaultPrevented).toBe(false);
  });

  it("3: leaves it to a turn out", () => {
    const u = unit({ turnOut: true });
    u.s.openPanel();
    expect(u.escape(u.q("#talk-text")).defaultPrevented).toBe(false);
    expect(u.s.open).toBe(true);
  });

  it("4: leaves it to the walking view while walking", () => {
    const u = unit({ walking: true });
    u.s.openPanel();
    expect(u.escape().defaultPrevented).toBe(false);
    expect(u.s.open).toBe(true);
  });

  it("5: leaves it to the resume while it is open", () => {
    const u = unit({ resumeOpen: true });
    u.s.openPanel();
    expect(u.escape().defaultPrevented).toBe(false);
    expect(u.s.open).toBe(true);
  });

  it("6: leaves it to the larger view where the conversation holds focus, and takes it where it doesn't", () => {
    const u = unit();
    u.s.openPanel();
    u.q(".talk").setAttribute("data-larger", "on");
    const text = u.q<HTMLInputElement>("#talk-text");
    text.focus();
    expect(u.escape(text).defaultPrevented).toBe(false);
    expect(u.s.open).toBe(true);
    const outside = u.q<HTMLButtonElement>("#outside");
    outside.focus();
    expect(u.escape(outside).defaultPrevented).toBe(true);
    expect(u.s.open).toBe(false);
  });

  it("7: else closes the open panel, preventing the default; with the panel at rest, does nothing", () => {
    const u = unit();
    expect(u.escape().defaultPrevented).toBe(false);
    u.s.openPanel();
    expect(u.escape().defaultPrevented).toBe(true);
    expect(u.s.open).toBe(false);
  });
});

describe("focus after closing (T024; FR-009, spec 005's FR-045)", () => {
  it("goes back to the entry that opened the panel", async () => {
    const { v } = await room();
    const piece = talkingPiece(v);
    piece.click();
    await flush();
    (v.doc.querySelector(".split-back") as HTMLButtonElement).click();
    expect(v.doc.activeElement).toBe(piece);
  });

  it("goes back to Larger conversation where that opened it", async () => {
    const { v } = await room();
    const larger = v.doc.querySelector(".talk-larger") as HTMLButtonElement;
    larger.click();
    key(v, v.doc.querySelector(".split-hint") as Element, "Escape");
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    expect(v.doc.activeElement).toBe(larger);
  });

  it("goes back to the text box where a sent turn opened it", async () => {
    const { v } = await room(WIDE, { freeTalk: true });
    const text = v.doc.getElementById("talk-text") as HTMLInputElement;
    text.value = "Hello";
    button(v.doc, "Send").click();
    await flush();
    const entry = entries(v)[0] as HTMLButtonElement;
    entry.focus();
    // A turn is out: the first Escape is the turn's (from the form), the second the panel's.
    key(v, text, "Escape");
    key(v, entry, "Escape");
    expect(talk(v).getAttribute("data-panel")).toBe("bar");
    expect(v.doc.activeElement).toBe(text);
  });

  it("goes to the selected entry where the opener is hidden", () => {
    const u = unit();
    const opener = u.q<HTMLButtonElement>("#outside");
    u.s.setConversation("b");
    u.s.closePanel();
    u.s.openPanel(opener);
    opener.hidden = true;
    u.escape();
    expect(u.doc.activeElement).toBe(u.q('button[data-object-id="b"]'));
  });
});

describe("the list's parts (T024; FR-007, FR-008)", () => {
  it("scrolls the entries, never Back or the label", () => {
    expect(decl(`${ON} .room-list`, "overflow-y")).toBe("hidden");
    expect(decl(`${ON} .room-list ul`, "overflow-y")).toBe("auto");
    expect(decl(`${ON} .room-list ul`, "min-height")).toBe("0");
    expect(decl(`${ON} .room-list ul`, "flex")).toBe("1 1 auto");
  });

  it("lets a press through the confirm key cap to its entry", () => {
    expect(decl(`${ON} .split-confirm`, "pointer-events")).toBe("none");
  });
});

// ---- T026 (rv2-impl-018's B3; FR-005, Q60, R6): the emblem is the open piece's icon; and the portrait's speaker ----

import { PIECE_ICONS, SPEECH_ICON } from "../../src/room/hud/icons";

describe("the emblem (T026; FR-005, Q60)", () => {
  const emblem = (u: ReturnType<typeof unit>) => u.doc.querySelector(".split-emblem");
  const path = (u: ReturnType<typeof unit>) => emblem(u)?.querySelector("path")?.getAttribute("d");

  it("draws one icon per piece of the repository's scene, on the 24-unit grid, none the speech glyph", () => {
    expect(Object.keys(PIECE_ICONS).sort()).toEqual(["bicycle", "chalkboard", "laptop", "snowboard"]);
    const all = [...Object.values(PIECE_ICONS), SPEECH_ICON];
    expect(new Set(all).size).toBe(all.length);
    for (const d of all) {
      expect(d).toMatch(/^[MmLlHhVvCcSsQqAaZz0-9.,\-\s]+$/);
      for (const n of d.match(/-?\d*\.?\d+/g) ?? []) expect(Math.abs(Number(n))).toBeLessThanOrEqual(24);
    }
  });

  for (const id of ["snowboard", "bicycle", "laptop", "chalkboard"])
    it(`is the ${id}'s icon while its conversation is open`, () => {
      const u = unit();
      u.s.setConversation(id);
      expect(u.s.open).toBe(true);
      expect(emblem(u)?.getAttribute("data-emblem")).toBe(id);
      expect(path(u)).toBe(PIECE_ICONS[id]);
      expect(emblem(u)?.getAttribute("aria-hidden")).toBe("true");
    });

  it("gives two pieces two emblems, and follows the conversation while the panel is open", () => {
    const u = unit();
    u.s.setConversation("snowboard");
    const first = path(u);
    u.s.setConversation("chalkboard");
    expect(u.doc.querySelectorAll(".split-emblem")).toHaveLength(1);
    expect(path(u)).not.toBe(first);
    expect(path(u)).toBe(PIECE_ICONS.chalkboard);
  });

  it("is the speech glyph in free talk, and for a piece with no icon", () => {
    const free = unit();
    free.s.openPanel();
    expect(emblem(free)?.getAttribute("data-emblem")).toBe("speech");
    expect(path(free)).toBe(SPEECH_ICON);
    const other = unit();
    other.s.setConversation("a");
    expect(emblem(other)?.getAttribute("data-emblem")).toBe("speech");
    expect(path(other)).toBe(SPEECH_ICON);
  });
});

describe("the portrait's speaker (T026; the brief's item d)", () => {
  it("draws and fetches the speaker's portrait, the twin's by default", async () => {
    const seen: string[] = [];
    const drawn: string[] = [];
    const make = (speaker?: () => string) => {
      const dom = new JSDOM('<body><div class="room-list"><ul></ul></div><section class="talk"></section></body>');
      const doc = dom.window.document;
      const s = createSplit(doc, {
        talk: doc.querySelector(".talk") as HTMLElement,
        list: doc.querySelector(".room-list") as HTMLElement,
        words: { select: "Select a piece", back: "Back", close: "Close", esc: "Esc", enter: "Enter" },
        stats: () => [],
        turnOut: () => false,
        walking: () => false,
        portrait: (who) => {
          seen.push(who);
          return Promise.resolve(null);
        },
        draw: {
          portrait: (d, who) => {
            drawn.push(who);
            return d.createElement("span");
          },
        },
        ...(speaker ? { speaker } : {}),
      });
      s.setActive(true);
      s.openPanel();
      return doc;
    };
    const twin = make();
    expect(twin.querySelector(".split-portrait")?.getAttribute("data-speaker")).toBe("twin");
    const dog = make(() => "dog");
    expect(dog.querySelector(".split-portrait")?.getAttribute("data-speaker")).toBe("dog");
    await settle();
    expect(drawn).toEqual(["twin", "dog"]);
    expect(seen).toEqual(["twin", "dog"]);
  });
});
