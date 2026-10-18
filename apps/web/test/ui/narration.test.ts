// T051 (spec 002; FR-011, SC-006; contracts/narration.md §4): the narration display, in jsdom with a fake clock, in
// the room's resume view (src/room/resume-port.ts), whose context carries the visitor's path. Selecting an item shows
// its script for that path: the first word at once (within 1 s of the selection), then word by word at 160 words a
// minute, beside the item, under a line saying the AI twin narrates, with the whole text in the polite live region at
// the start. Another selection stops it at once and starts the new one; closing the resume stops it. A draft plays
// under a "Draft" label in a drafts build; without ROOM_DRAFTS=1 the build leaves it out, and the item shows no
// narration. 0 axe violations. test/ui/narration-room.test.ts runs the same view inside the room.
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { asRoomNarration, type NarrationPath, type RoomNarration } from "../../src/narration/data";
import { DRAFT_LABEL, NARRATION_AI_LINE, type Clock, WORD_MS, WORDS_PER_MINUTE } from "../../src/narration/view";
import type { RoomResume } from "../../src/resume/data";
import { resumeView } from "../../src/room/resume-port";

const LANTERN_ENGINEER = "Robin designed the lantern service and its nightly schedule for the fixture clinic.";
const LANTERN_PLAIN = "Robin designed the lantern service, so the harbor stays lit.";
const TIDE_ENGINEER = "Robin built the tide clock for the harbor office.";
const TIDE_DRAFT = "The tide clock runs on a public server.";

const RESUME: RoomResume = {
  resume_state: "approved",
  header: { name: "Robin", lines: ["Lighthouse keeping by background"] },
  sections: [
    {
      id: "work",
      title: "Work",
      items: [
        { id: "lantern", text: "Designed the lantern service." },
        { id: "tide", text: "Built the tide clock." },
        { id: "map", text: "Drew the harbor map." },
      ],
    },
  ],
};

const entry = (words: string, approved = true) => ({ words, approved, source: "s", sha256: "h" });

/** room-data.json as the build writes it (data-model.md §5): each item's narration per path, null where the build
 * left a draft out. */
const BUILT = {
  resume_state: "approved",
  sections: [
    {
      id: "work",
      title: "Work",
      items: [
        {
          id: "lantern",
          text: "Designed the lantern service.",
          narration: { engineer: entry(LANTERN_ENGINEER), "non-engineer": entry(LANTERN_PLAIN) },
        },
        {
          id: "tide",
          text: "Built the tide clock.",
          narration: { engineer: entry(TIDE_ENGINEER), "non-engineer": entry(TIDE_DRAFT, false) },
        },
        // Built without ROOM_DRAFTS=1: both of this item's scripts were drafts, so the build left them out.
        { id: "map", text: "Drew the harbor map.", narration: { engineer: null, "non-engineer": null } },
      ],
    },
  ],
};

/** A clock the test moves by hand: timers fire in order as it advances, and nothing else moves it. */
class FakeClock implements Clock {
  private time = 0;
  private next = 0;
  private queue: { at: number; id: number; fn: () => void }[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = ++this.next;
    this.queue.push({ at: this.time + Math.max(0, ms), id, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.queue = this.queue.filter((t) => t.id !== handle);
  }

  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
      const due = this.queue[0];
      if (!due || due.at > end) break;
      this.queue.shift();
      this.time = due.at;
      due.fn();
    }
    this.time = end;
  }

  pending(): number {
    return this.queue.length;
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function room(
  path: NarrationPath = "engineer",
  built: unknown = BUILT,
  load: () => Promise<RoomNarration> = async () => asRoomNarration(built),
) {
  const dom = new JSDOM(
    '<!doctype html><html lang="en"><head><title>t</title></head><body><header><p>An AI representation.</p></header>' +
      '<main><h1>The work area</h1><section aria-labelledby="r"><h2 id="r">The resume</h2><div id="host"></div>' +
      "</section></main></body></html>",
    { runScripts: "outside-only", pretendToBeVisual: true },
  );
  const doc = dom.window.document;
  const clock = new FakeClock();
  const view = resumeView(async () => RESUME, { load, clock });
  const host = doc.getElementById("host") as HTMLElement;
  view.mount(host, {
    doc,
    path,
    close: () => view.unmount(),
    pdfFollowed: () => undefined,
    itemSelected: () => undefined,
  });
  await tick();
  await tick();
  const panel = doc.querySelector("[data-resume-panel]") as HTMLElement;
  const select = (id: string): HTMLButtonElement => {
    const button = panel.querySelector(`button[data-item-id="${id}"]`) as HTMLButtonElement;
    button.click();
    return button;
  };
  const shown = (): string => panel.querySelector("[data-narration] .narration-words")?.textContent ?? "";
  const live = (): HTMLElement => panel.querySelector("[data-narration-live]") as HTMLElement;
  return { dom, doc, panel, clock, select, shown, live, view };
}

const words = (text: string): string[] => text.split(/\s+/);

describe("the narration display", () => {
  it("speaks at 160 words a minute: one word every 375 ms", () => {
    expect(WORDS_PER_MINUTE).toBe(160);
    expect(WORD_MS).toBe(375);
  });

  it("starts within 1 s of the selection: the first word is on screen at the click", async () => {
    const { select, shown } = await room();
    select("lantern");
    expect(shown()).toBe("Robin");
  });

  it("adds a word every 375 ms until the script is shown whole, then stops its timer", async () => {
    const { clock, select, shown } = await room();
    select("lantern");
    const all = words(LANTERN_ENGINEER);
    clock.advance(WORD_MS - 1);
    expect(shown()).toBe("Robin");
    clock.advance(1);
    expect(shown()).toBe("Robin designed");
    clock.advance(WORD_MS * 3);
    expect(shown()).toBe(all.slice(0, 5).join(" "));
    clock.advance(WORD_MS * (all.length - 5) - 1);
    expect(shown()).toBe(all.slice(0, all.length - 1).join(" "));
    clock.advance(1);
    expect(shown()).toBe(LANTERN_ENGINEER);
    expect(clock.pending()).toBe(0);
  });

  it("puts the whole script in the polite live region at the start", async () => {
    const { select, live } = await room();
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(live().textContent).toBe("");
    select("lantern");
    // The AI line first, then the script (Principle VIII): a screen reader hears who narrates before the words.
    expect(live().textContent).toBe(`${NARRATION_AI_LINE} ${LANTERN_ENGINEER}`);
  });

  it("shows the words beside the selected item", async () => {
    const { panel, select } = await room();
    const button = select("tide");
    const region = panel.querySelector("[data-narration]") as HTMLElement;
    expect(region.parentElement).toBe(button.parentElement);
    expect(button.nextElementSibling).toBe(region);
  });

  it("stops the current narration at once when another item is selected, and starts the new one", async () => {
    const { clock, panel, select, shown, live } = await room();
    select("lantern");
    clock.advance(WORD_MS * 2);
    expect(shown()).toBe("Robin designed the");
    const tide = select("tide");
    expect(shown()).toBe("Robin");
    expect(live().textContent).toBe(`${NARRATION_AI_LINE} ${TIDE_ENGINEER}`);
    expect(tide.nextElementSibling?.matches("[data-narration]")).toBe(true);
    expect(panel.querySelectorAll("[data-narration]")).toHaveLength(1);
    clock.advance(WORD_MS * 100);
    expect(shown()).toBe(TIDE_ENGINEER);
  });

  it("loads the scripts again after a load that failed, rather than keeping none for the visit", async () => {
    let loads = 0;
    const flaky = async (): Promise<RoomNarration> => {
      loads += 1;
      if (loads === 1) throw new Error("room-data.json didn't load");
      return asRoomNarration(BUILT);
    };
    const { select, shown } = await room("engineer", BUILT, flaky);
    expect(loads).toBe(1);
    select("lantern");
    await tick();
    await tick();
    expect(loads).toBe(2);
    expect(shown()).toBe("Robin");
  });

  it("starts the same item over when it is selected again", async () => {
    const { clock, select, shown } = await room();
    select("lantern");
    clock.advance(WORD_MS * 4);
    select("lantern");
    expect(shown()).toBe("Robin");
  });

  it("narrates at the depth of the visitor's path", async () => {
    const { clock, select, shown } = await room("non-engineer");
    select("lantern");
    clock.advance(WORD_MS * 100);
    expect(shown()).toBe(LANTERN_PLAIN);
  });

  it("plays a draft under a Draft label, which an approved script doesn't show", async () => {
    const { panel, select } = await room("non-engineer");
    const label = () => panel.querySelector("[data-narration] .narration-label") as HTMLElement;
    select("tide");
    expect(label().hidden).toBe(false);
    expect(label().textContent).toBe(DRAFT_LABEL);
    expect(DRAFT_LABEL).toBe("Draft");
    select("lantern");
    expect(label().hidden).toBe(true);
  });

  it("shows no narration for an item whose scripts a build without drafts left out, and stops the one playing", async () => {
    const { clock, panel, select, shown, live } = await room();
    select("lantern");
    clock.advance(WORD_MS);
    select("map");
    expect(panel.querySelector("[data-narration]")).toBeNull();
    expect(live().textContent).toBe("");
    clock.advance(WORD_MS * 100);
    expect(shown()).toBe("");
    expect(clock.pending()).toBe(0);
  });

  it("stops at once when the resume closes, and shows nothing of it when the resume opens again", async () => {
    const { clock, panel, select, shown, live } = await room();
    select("lantern");
    const close = [...panel.querySelectorAll("button")].find((b) => b.textContent === "Close") as HTMLButtonElement;
    close.click();
    expect(clock.pending()).toBe(0);
    expect(panel.querySelector("[data-narration]")).toBeNull();
    expect(live().textContent).toBe("");
    clock.advance(WORD_MS * 100);
    expect(shown()).toBe("");
  });

  it("says, beside the words, that the AI twin narrates them", async () => {
    const { panel, select } = await room();
    select("lantern");
    const region = panel.querySelector("[data-narration]") as HTMLElement;
    const line = region.querySelector(".narration-ai") as HTMLElement;
    expect(line.textContent).toBe(NARRATION_AI_LINE);
    expect(NARRATION_AI_LINE).toMatch(/\bAI\b/);
    expect(line.hidden).toBe(false);
    expect(line.closest("[aria-hidden]")).toBeNull();
    // Before the words, so it's read and seen first.
    expect(line.compareDocumentPosition(region.querySelector(".narration-words") as Node)).toBe(4);
  });

  it("has no axe violations while narrating", async () => {
    const { dom, clock, select } = await room("non-engineer");
    select("tide");
    clock.advance(WORD_MS * 2);
    const win = dom.window as unknown as Window & { eval(code: string): unknown; axe: typeof axe };
    win.eval(axe.source);
    const result = await win.axe.run(win.document, { resultTypes: ["violations"] });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe("room-data.json's narration, as the browser reads it", () => {
  it("reads each item's script per path, and nothing where the build left one out", () => {
    const narration = asRoomNarration(BUILT);
    expect(narration.get("lantern")?.engineer).toEqual({ words: LANTERN_ENGINEER, approved: true });
    expect(narration.get("tide")?.["non-engineer"]).toEqual({ words: TIDE_DRAFT, approved: false });
    expect(narration.get("map")).toEqual({});
  });

  it("reads anything that isn't the build's shape as no narration", () => {
    for (const json of [null, "x", { sections: "x" }, { sections: [{ items: [{ id: 1 }] }] }]) {
      expect(asRoomNarration(json).size).toBe(0);
    }
    const odd = { sections: [{ items: [{ id: "a", narration: { engineer: { words: 3, approved: true } } }] }] };
    expect(asRoomNarration(odd).get("a")).toEqual({});
  });
});
