// The room's usage events, as the browser sends them (spec 002, tasks.md T057; contracts/room-events.md §1;
// data-model.md §8; FR-054): one navigator.sendBeacon to /api/room/events per event, whose body is {kind} or
// {kind, id} and nothing else. No path, avatar, visit ID, address, or time goes in it, whatever a caller hands the sink.
// A beacon the browser refuses, or that throws, is dropped: never retried, queued, or stored, and nothing is sent
// another way. Each test runs the sink in its own jsdom window, with every storage and request API spied on.
// Spec 004 (T104; R-16, R-60): an object's ID here is a synthetic fx- one, since a room's IDs live in its data alone;
// test/room/events.test.ts sends the room's own, from each input.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENTS_URL, beaconEvents } from "../src/events";
import { EVENT_KINDS } from "../src/room/events";
import type { RoomEvent } from "../src/room/events";

const ID_KINDS: Record<string, string> = { object_selected: "fx-workstation", item_selected: "cht-agent" };

interface Page {
  win: Window;
  /** Each sendBeacon: its URL and its body, as given. */
  beacons: { url: string; body: unknown }[];
  /** Every touch of a storage API, and every request but a beacon. */
  touched: string[];
}

/** A jsdom window whose sendBeacon answers `answer` (true: queued; false: refused; "throw": throws). */
function page(answer: boolean | "throw" = true): Page {
  const win = new JSDOM("<!doctype html><title>t</title>", { url: "http://127.0.0.1:18105/" })
    .window as unknown as Window;
  const beacons: Page["beacons"] = [];
  const touched: string[] = [];
  const define = (target: object, name: string, descriptor: PropertyDescriptor): void => {
    Object.defineProperty(target, name, { configurable: true, ...descriptor });
  };
  define(win.document, "cookie", {
    get: () => (touched.push("document.cookie read"), ""),
    set: () => touched.push("document.cookie write"),
  });
  for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches"]) {
    define(win, name, { get: () => (touched.push(name), undefined) });
  }
  define(win, "fetch", { value: (input: unknown) => (touched.push(`fetch ${String(input)}`), Promise.reject()) });
  define(win, "XMLHttpRequest", {
    value: class {
      open(method: string, url: string): void {
        touched.push(`XMLHttpRequest ${method} ${url}`);
      }
    },
  });
  define(win.navigator, "sendBeacon", {
    value: (url: string, body: unknown) => {
      beacons.push({ url, body });
      if (answer === "throw") throw new TypeError("the beacon's queue is full");
      return answer;
    },
  });
  return { win, beacons, touched };
}

const bodies = (p: Page): unknown[] => p.beacons.map((b) => JSON.parse(String(b.body)) as unknown);

afterEach(() => {
  vi.useRealTimers();
});

describe("the beacon", () => {
  it("is posted to the site's own /api/room/events", () => {
    expect(EVENTS_URL).toBe("/api/room/events");
  });

  it("sends each kind once, its body {kind} or {kind, id} alone, as text a beacon sends without a preflight", () => {
    const p = page();
    const emit = beaconEvents(p.win.navigator);
    for (const kind of EVENT_KINDS) {
      const id = ID_KINDS[kind];
      emit(id === undefined ? { kind } : { kind, id });
    }
    expect(p.beacons.map((b) => b.url)).toEqual(EVENT_KINDS.map(() => EVENTS_URL));
    // A string body goes as text/plain;charset=UTF-8, which contracts/room-events.md §3 accepts.
    for (const b of p.beacons) expect(typeof b.body).toBe("string");
    expect(p.beacons.map((b) => b.body)).toEqual([
      '{"kind":"object_selected","id":"fx-workstation"}',
      '{"kind":"item_selected","id":"cht-agent"}',
      '{"kind":"resume_opened"}',
      '{"kind":"resume_kept"}',
      '{"kind":"pdf_downloaded"}',
      '{"kind":"turn_sent"}',
      '{"kind":"voice_pressed"}',
      '{"kind":"mode_2d"}',
    ]);
    expect(p.touched).toEqual([]);
  });

  it("carries nothing else a caller hands it: no path, avatar, visit ID, address, text, or time", () => {
    const p = page();
    const emit = beaconEvents(p.win.navigator);
    const extra = { path: "engineer", avatar: "dog", visit: "v-1", address: "203.0.113.9", text: "hi", at: 1_760_000 };
    emit({ kind: "object_selected", id: "fx-workstation", ...extra } as RoomEvent);
    emit({ kind: "mode_2d", ...extra } as RoomEvent);
    // An ID on a kind that takes none is dropped too: the gateway would refuse the event's shape.
    emit({ kind: "resume_opened", id: "fx-workstation" });
    expect(bodies(p)).toEqual([
      { kind: "object_selected", id: "fx-workstation" },
      { kind: "mode_2d" },
      { kind: "resume_opened" },
    ]);
  });

  it("sends nothing for a kind it doesn't know, or a kind that takes an ID without one", () => {
    const p = page();
    const emit = beaconEvents(p.win.navigator);
    emit({ kind: "page_viewed" } as unknown as RoomEvent);
    emit({ kind: "object_selected" });
    emit({ kind: "item_selected", id: 7 } as unknown as RoomEvent);
    emit({ kind: "item_selected", id: "" });
    expect(p.beacons).toEqual([]);
  });
});

describe("a beacon that doesn't go", () => {
  it("is dropped when the browser refuses it: not retried, queued, or stored", () => {
    vi.useFakeTimers();
    const p = page(false);
    const emit = beaconEvents(p.win.navigator);
    emit({ kind: "pdf_downloaded" });
    vi.advanceTimersByTime(60_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(p.beacons).toHaveLength(1);
    // The next event carries itself alone, not the one refused before it.
    emit({ kind: "mode_2d" });
    expect(bodies(p)).toEqual([{ kind: "pdf_downloaded" }, { kind: "mode_2d" }]);
    expect(p.touched).toEqual([]);
  });

  it("is dropped when sendBeacon throws, and the room carries on", () => {
    const p = page("throw");
    const emit = beaconEvents(p.win.navigator);
    expect(() => emit({ kind: "turn_sent" })).not.toThrow();
    expect(() => emit({ kind: "turn_sent" })).not.toThrow();
    expect(p.beacons).toHaveLength(2);
    expect(p.touched).toEqual([]);
  });

  it("is never sent another way when the browser has no sendBeacon", () => {
    const p = page();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    Object.defineProperty(p.win.navigator, "sendBeacon", { configurable: true, value: undefined });
    const emit = beaconEvents(p.win.navigator);
    expect(() => emit({ kind: "voice_pressed" })).not.toThrow();
    expect(() => beaconEvents(undefined)({ kind: "voice_pressed" })).not.toThrow();
    expect(p.touched).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
