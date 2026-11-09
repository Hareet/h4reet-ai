// T034 (spec 005; FR-005, FR-036 to FR-040; SC-007; plan.md §8): full screen in the room, its API stubbed on the page.
// The control is the bar's tile after "Pause the room" where the browser offers full screen and absent where it doesn't
// (Q4, provisional), its words following every change; Alt+Enter toggles from anywhere in the room, sends no turn, and
// does nothing during the hand-off and its offer; a refusal says so once and leaves focus; while the page is in full
// screen Escape is the browser's, so the walking view, a turn in flight, the resume, and the larger view stay as they
// were, and after the exit the next Escape acts as before; the walking view's words speak of full screen while in it;
// and fullscreen_entered goes once a visit, at the first entry alone.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { TurnResult } from "../../src/room/signals/turn-cost";
import type { TurnRequest } from "../../src/talk/talk";
import { createWalkInput } from "../../src/room/walk/input";
import { announcer, button, enter, flush, hasButton, intoRoom, roomIndex, start, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const UI = roomIndex().ui;
const ENTER = "Full screen";
const LEAVE = "Leave full screen";
const REFUSED = "Full screen isn't available here. The room still fills the window.";

/** The page's Fullscreen API, a stand-in: whether the browser offers it, whether it refuses, and what was asked. */
function offerFullscreen(v: Visit, o: { supported?: boolean; refuse?: boolean } = {}) {
  const doc = v.doc as Document & Record<string, unknown>;
  const root = doc.documentElement as HTMLElement & Record<string, unknown>;
  let element: Element | null = null;
  const asked: unknown[] = [];
  const fire = (name: string): void => {
    doc.dispatchEvent(new v.win.Event(name));
  };
  Object.defineProperty(doc, "fullscreenEnabled", { configurable: true, value: o.supported ?? true });
  Object.defineProperty(doc, "fullscreenElement", { configurable: true, get: () => element });
  root.requestFullscreen = (options?: unknown) => {
    asked.push(options);
    if (o.refuse) return Promise.reject(new TypeError("refused"));
    element = root;
    fire("fullscreenchange");
    return Promise.resolve();
  };
  doc.exitFullscreen = () => {
    asked.push("exit");
    element = null;
    fire("fullscreenchange");
    return Promise.resolve();
  };
  return {
    asked,
    /** The browser's own exit: Escape, a system gesture, or a tab switch. */
    exit(): void {
      element = null;
      fire("fullscreenchange");
    },
    enterByBrowser(): void {
      element = root;
      fire("fullscreenchange");
    },
  };
}

const altEnter = (v: Visit, target: EventTarget): KeyboardEvent => {
  const e = new v.win.KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
const escape = (v: Visit, target: EventTarget): void => {
  target.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
};

async function room(o: { supported?: boolean; refuse?: boolean; index?: RoomIndex; sendTurn?: () => void } = {}) {
  const v = start({
    webgl: true,
    ...(o.index ? { room: o.index } : {}),
    ...(o.sendTurn ? { sendTurn: o.sendTurn } : {}),
  });
  const fs = offerFullscreen(v, o);
  await intoRoom(v);
  return { v, fs };
}

describe("the full-screen control (FR-036, FR-040, FR-042)", () => {
  it("is the bar's tile after Pause the room where offered, naming its shortcut, its words following every change", async () => {
    const { v, fs } = await room();
    const tiles = [...v.doc.querySelectorAll(".hud-bar > button, .hud-bar > a")].map((el) =>
      textOf(el.querySelector(".hud-tile-words")),
    );
    expect(tiles.indexOf(ENTER)).toBe(tiles.indexOf(UI["pause.button"] ?? "") + 1);
    const control = button(v.doc, ENTER);
    expect(control.getAttribute("aria-keyshortcuts")).toBe("Alt+Enter");
    const described = v.doc.getElementById(control.getAttribute("aria-describedby") ?? "");
    expect(textOf(described)).toMatch(/Alt\+Enter/);
    control.click();
    await flush();
    expect(fs.asked).toEqual([{ navigationUI: "hide" }]);
    expect(textOf(control.querySelector(".hud-tile-words"))).toBe(LEAVE);
    expect(v.doc.activeElement === control || v.doc.activeElement === v.doc.body).toBe(true);
    // The browser's own exit: the words follow.
    fs.exit();
    expect(textOf(control.querySelector(".hud-tile-words"))).toBe(ENTER);
    fs.enterByBrowser();
    expect(textOf(control.querySelector(".hud-tile-words"))).toBe(LEAVE);
  });

  it("is absent where the browser offers no full screen, the room unchanged (Q4, provisional)", async () => {
    const { v } = await room({ supported: false });
    expect(hasButton(v.doc, ENTER)).toBe(false);
    expect(altEnter(v, v.doc.body).defaultPrevented).toBe(false);
    expect(v.doc.documentElement.getAttribute("data-hud")).toBe("column");
  });

  it("says once that full screen isn't available when the request is refused, and keeps focus on the control", async () => {
    const { v } = await room({ refuse: true });
    const control = button(v.doc, ENTER);
    control.focus();
    control.click();
    await flush();
    expect(textOf(announcer(v.doc))).toBe(REFUSED);
    expect(v.doc.activeElement).toBe(control);
    expect(textOf(control.querySelector(".hud-tile-words"))).toBe(ENTER);
  });
});

describe("Alt+Enter (FR-037; D2)", () => {
  it("toggles from every focus place, the text box among them, sending no turn", async () => {
    const { v, fs } = await room();
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (!box) throw new Error("no text box");
    box.value = "not a turn";
    const events = v.events.length;
    for (const place of [
      v.doc.body,
      box,
      button(v.doc, "Resume"),
      v.doc.querySelector<HTMLElement>(".room-list li button"),
    ]) {
      if (!place) throw new Error("no place");
      place.focus();
      const e = altEnter(v, place);
      await flush();
      expect(e.defaultPrevented).toBe(true);
    }
    expect(fs.asked).toEqual([{ navigationUI: "hide" }, "exit", { navigationUI: "hide" }, "exit"]);
    expect(box.value).toBe("not a turn");
    expect(v.events.slice(events).filter((e) => e.kind === "turn_sent")).toEqual([]);
  });

  it("does nothing during the hand-off and its offer", async () => {
    const v = start({ webgl: true });
    const fs = offerFullscreen(v);
    await enter(v);
    v.clock.advance(1000);
    altEnter(v, v.doc.body);
    v.clock.advance(5000);
    altEnter(v, v.doc.body);
    await flush();
    expect(fs.asked).toEqual([]);
    expect(button(v.doc, ENTER).closest("[inert]")).not.toBeNull();
  });
});

describe("Escape in full screen is the browser's (FR-039; D3)", () => {
  const fixtureIndex = (): RoomIndex => {
    const { index } = compose(goodTree(), noPolicy(), { mode: "strict", drafts: false });
    return {
      ...index,
      live: { ...index.live, turn: "site" },
      topics: index.topics.map((t) => ({ ...t, ready: true })),
    };
  };

  it("leaves a turn in flight, the resume, and the larger view as they were, and acts as before after the exit", async () => {
    const sent: { signal: AbortSignal | undefined }[] = [];
    const index = fixtureIndex();
    const v = start({
      webgl: true,
      room: index,
      sendTurn: (_r: TurnRequest, _e: (x: TurnResult) => void, signal?: AbortSignal) => sent.push({ signal }),
    });
    const fs = offerFullscreen(v);
    await intoRoom(v);
    button(v.doc, ENTER).click();
    await flush();
    // A turn in flight: an opening sent for a ready topic.
    const talkPiece = index.selectables.find((s) => s.action.kind === "talk");
    v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${talkPiece?.id}"]`)?.click();
    expect(sent).toHaveLength(1);
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text") as HTMLInputElement;
    escape(v, box);
    expect(sent[0]?.signal?.aborted).toBe(false);
    // The larger view, and the resume.
    const larger = v.doc.querySelector<HTMLButtonElement>(".talk-larger") as HTMLButtonElement;
    larger.click();
    escape(v, larger);
    expect(larger.getAttribute("aria-expanded")).toBe("true");
    button(v.doc, "Resume").click();
    await flush();
    escape(v, v.doc.getElementById("resume-heading") as HTMLElement);
    expect(v.doc.querySelector<HTMLElement>(".resume-panel")?.hidden).toBe(false);
    // The browser left full screen on that Escape; the next acts as before.
    fs.exit();
    escape(v, v.doc.getElementById("resume-heading") as HTMLElement);
    expect(v.doc.querySelector<HTMLElement>(".resume-panel")?.hidden).toBe(true);
    escape(v, larger);
    expect(larger.getAttribute("aria-expanded")).toBe("false");
    escape(v, box);
    expect(sent[0]?.signal?.aborted).toBe(true);
  });

  it("leaves the walking view on in full screen, and lets the next Escape after the exit leave it", () => {
    const v = start({ webgl: true });
    const fs = offerFullscreen(v);
    const canvas = v.doc.createElement("canvas");
    const view = v.doc.createElement("div");
    view.tabIndex = 0;
    v.doc.body.append(view);
    const input = createWalkInput(canvas, v.win);
    input.bind(view);
    fs.enterByBrowser();
    escape(v, view);
    expect(input.take(0.016, { turn: 1, tilt: 1 }).escape).toBe(false);
    fs.exit();
    escape(v, view);
    expect(input.take(0.016, { turn: 1, tilt: 1 }).escape).toBe(true);
    input.unbind();
  });

  it("speaks of full screen in the walking view's words while in it", async () => {
    const { v, fs } = await room();
    button(v.doc, ENTER).click();
    await flush();
    button(v.doc, UI["walk.enter"] ?? "").click();
    expect(textOf(announcer(v.doc))).toBe(UI["walk.entered_fullscreen"]);
    expect(textOf(v.doc.getElementById("room-walk-help"))).toContain(UI["walk.help_fullscreen"] ?? "-");
    button(v.doc, UI["walk.leave"] ?? "").click();
    fs.exit();
    button(v.doc, UI["walk.enter"] ?? "").click();
    expect(textOf(announcer(v.doc))).toBe(UI["walk.entered"]);
    expect(textOf(v.doc.getElementById("room-walk-help"))).not.toContain(UI["walk.help_fullscreen"] ?? "-");
  });
});

describe("fullscreen_entered (FR-060, FR-061; D1)", () => {
  it("goes once a visit, at the first entry, never for a second entry, an exit, a refusal, or a resize", async () => {
    const { v, fs } = await room();
    const kinds = (): string[] => v.events.map((e) => e.kind).filter((k) => k.startsWith("fullscreen"));
    button(v.doc, ENTER).click();
    await flush();
    expect(kinds()).toEqual(["fullscreen_entered"]);
    fs.exit();
    fs.enterByBrowser();
    fs.exit();
    button(v.doc, ENTER).click();
    await flush();
    v.win.dispatchEvent(new v.win.Event("resize"));
    expect(kinds()).toEqual(["fullscreen_entered"]);
    expect(v.events.filter((e) => e.kind === "fullscreen_entered")).toEqual([{ kind: "fullscreen_entered" }]);
    const refused = await room({ refuse: true });
    button(refused.v.doc, ENTER).click();
    await flush();
    expect(refused.v.events.filter((e) => e.kind === "fullscreen_entered")).toEqual([]);
  });
});
