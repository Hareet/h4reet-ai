// T038 (spec 002; FR-023, FR-026, FR-027, FR-039, FR-040; contracts/room-conversation.md §3; research.md R-14): the
// room's floor before the twin exists. Each object answers topic_not_ready, the text box cannot_talk.unavailable with a
// pointer to the resume and the PDF, and the talk button announces voice_unavailable and moves focus to the text box
// without asking for the microphone. No request leaves but the events beacon (Phase 6's), which nothing sends yet.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MESSAGE_IDS, cannotTalkFor } from "../../src/talk/messages";
import { WEB, button, flush, intoRoom, roomContent, start, talkLog, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";

const OBJECTS = [
  ["snowboard", "Snowboard: hobbies and general life", "hobbies and general life"],
  ["bicycle", "Bicycle: travel adventures", "travel adventures"],
  ["laptop", "Laptop and screen: work projects", "work projects"],
] as const;

const messages = roomContent().messages;
const lastMessage = (v: Visit): Element | null => talkLog(v.doc).lastElementChild;
const textBox = (v: Visit): HTMLInputElement => {
  const el = v.doc.querySelector<HTMLInputElement>("#talk-text");
  if (!el) throw new Error("no text box");
  return el;
};

afterEach(() => vi.restoreAllMocks());

describe("the objects", () => {
  it("each answer topic_not_ready, naming their topic, and call no model", async () => {
    const v = start();
    await intoRoom(v);
    for (const [id, name, topic] of OBJECTS) {
      button(v.doc, name).click();
      expect(textOf(lastMessage(v))).toBe(messages.topic_not_ready.replace("{topic}", topic));
      expect(lastMessage(v)?.getAttribute("data-message")).toBe("topic_not_ready");
      expect(v.events.at(-1)).toEqual({ kind: "object_selected", id });
    }
    expect(v.spies.network).toEqual([]);
  });

  it("are none of them ready in the manifest, and neither is free talk", () => {
    const { manifest } = roomContent();
    expect(manifest.objects.map((o) => [o.id, o.ready])).toEqual([
      ["snowboard", false],
      ["bicycle", false],
      ["laptop", false],
    ]);
    expect(manifest.free_talk.ready).toBe(false);
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
    textBox(v).value = "Tell me about the snowboard.";
    button(v.doc, "Send").click();
    expect(textBox(v).value).toBe("Tell me about the snowboard.");
    expect(textOf(talkLog(v.doc))).not.toContain("Tell me about the snowboard.");
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
    for (const [, name] of OBJECTS) button(v.doc, name).click();
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
