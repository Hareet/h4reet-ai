// T033 (spec 005; FR-036, FR-041, FR-042; plan.md §8.1, PD-19, PD-21): src/room/fullscreen.ts with a stubbed document.
// Support from the unprefixed names or WebKit's, none from neither; the page's root asked for full screen with its
// navigation UI hidden, or left; a refusal by a rejected request or a fullscreenerror; a change by either event's name;
// Escape the browser's only while in full screen; and no lock of the keyboard, the orientation, or the pointer.
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { browserOwnsEscape, createFullscreen } from "../../src/room/fullscreen";

type Doc = Document & Record<string, unknown>;

/** How a stand-in refuses a request: as browsers do, the error event and then the rejection (the Fullscreen API's
 *  order; WebKit's prefixed request has no promise, so its event alone); the rejection alone; or the event alone. */
type Refusal = false | "both" | "reject" | "event";

/** A document whose Fullscreen API is a stand-in: unprefixed, WebKit's, or none. */
function stub(kind: "unprefixed" | "webkit" | "none", refuse: Refusal = false) {
  const dom = new JSDOM("<main></main>");
  const doc = dom.window.document as unknown as Doc;
  const root = doc.documentElement as HTMLElement & Record<string, unknown>;
  let element: Element | null = null;
  const calls = { request: [] as unknown[], exit: 0 };
  const fire = (name: string): void => {
    doc.dispatchEvent(new dom.window.Event(name));
  };
  if (kind === "unprefixed") {
    Object.defineProperty(doc, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(doc, "fullscreenElement", { configurable: true, get: () => element });
    root.requestFullscreen = (options?: unknown) => {
      calls.request.push(options);
      if (refuse === "both" || refuse === "event") fire("fullscreenerror");
      if (refuse === "both" || refuse === "reject") return Promise.reject(new TypeError("refused"));
      if (refuse === "event") return Promise.resolve();
      element = root;
      fire("fullscreenchange");
      return Promise.resolve();
    };
    doc.exitFullscreen = () => {
      calls.exit += 1;
      element = null;
      fire("fullscreenchange");
      return Promise.resolve();
    };
  } else if (kind === "webkit") {
    Object.defineProperty(doc, "fullscreenEnabled", { configurable: true, value: undefined });
    Object.defineProperty(doc, "webkitFullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(doc, "webkitFullscreenElement", { configurable: true, get: () => element });
    root.webkitRequestFullscreen = (options?: unknown) => {
      calls.request.push(options);
      if (refuse) {
        fire("webkitfullscreenerror");
        return;
      }
      element = root;
      fire("webkitfullscreenchange");
    };
    doc.webkitExitFullscreen = () => {
      calls.exit += 1;
      element = null;
      fire("webkitfullscreenchange");
    };
  } else {
    Object.defineProperty(doc, "fullscreenEnabled", { configurable: true, value: false });
  }
  const lock = { keyboard: vi.fn(), orientation: vi.fn(), pointer: vi.fn() };
  Object.defineProperty(dom.window.navigator, "keyboard", { configurable: true, value: { lock: lock.keyboard } });
  Object.defineProperty(dom.window, "screen", {
    configurable: true,
    value: { orientation: { lock: lock.orientation } },
  });
  root.requestPointerLock = lock.pointer;
  return { doc, calls, lock, fire, set: (on: boolean) => (element = on ? root : null), win: dom.window };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await Promise.resolve();
};

describe("full screen (src/room/fullscreen.ts; spec 005, T033)", () => {
  it("is supported from the unprefixed names or WebKit's, and not from neither", () => {
    expect(createFullscreen(stub("unprefixed").doc).supported).toBe(true);
    expect(createFullscreen(stub("webkit").doc).supported).toBe(true);
    expect(createFullscreen(stub("none").doc).supported).toBe(false);
  });

  it("asks for the page's root in full screen with its navigation UI hidden, and leaves it", async () => {
    for (const kind of ["unprefixed", "webkit"] as const) {
      const s = stub(kind);
      const fs = createFullscreen(s.doc);
      expect(fs.active).toBe(false);
      fs.toggle();
      await flush();
      expect(s.calls.request).toEqual([{ navigationUI: "hide" }]);
      expect(fs.active).toBe(true);
      fs.toggle();
      await flush();
      expect(s.calls.exit).toBe(1);
      expect(fs.active).toBe(false);
    }
  });

  // The review of 60b51de4's nit: a browser refusing fires fullscreenerror and then rejects the request's promise, and
  // the room said the refusal twice. It says it once a request, by whichever signal comes first.
  it("calls onRefused once a refused request: for the event and the rejection both, either alone, or WebKit's", async () => {
    for (const [kind, refusal] of [
      ["unprefixed", "both"],
      ["unprefixed", "reject"],
      ["unprefixed", "event"],
      ["webkit", "both"],
    ] as const) {
      const s = stub(kind, refusal);
      const fs = createFullscreen(s.doc);
      const refused = vi.fn();
      fs.onRefused(refused);
      fs.toggle();
      await flush();
      expect(refused, `${kind}, ${refusal}`).toHaveBeenCalledTimes(1);
      fs.toggle();
      await flush();
      expect(refused, `${kind}, ${refusal}, a second request`).toHaveBeenCalledTimes(2);
    }
  });

  it("says nothing for an error event no request of the room's asked for", async () => {
    const s = stub("unprefixed");
    const fs = createFullscreen(s.doc);
    const refused = vi.fn();
    fs.onRefused(refused);
    s.fire("fullscreenerror");
    s.fire("webkitfullscreenerror");
    expect(refused).not.toHaveBeenCalled();
    // A request granted leaves no refusal pending for a later stray event.
    fs.toggle();
    await flush();
    s.fire("fullscreenerror");
    expect(refused).not.toHaveBeenCalled();
  });

  it("follows each change, by either event's name, whatever made it", () => {
    for (const [kind, name] of [
      ["unprefixed", "fullscreenchange"],
      ["webkit", "webkitfullscreenchange"],
    ] as const) {
      const s = stub(kind);
      const fs = createFullscreen(s.doc);
      const changes: boolean[] = [];
      const stop = fs.onChange((on) => changes.push(on));
      s.set(true);
      s.fire(name);
      s.set(false);
      s.fire(name);
      expect(changes).toEqual([true, false]);
      stop();
      s.set(true);
      s.fire(name);
      expect(changes).toEqual([true, false]);
    }
  });

  it("leaves Escape to the browser only while the page is in full screen", () => {
    for (const kind of ["unprefixed", "webkit"] as const) {
      const s = stub(kind);
      expect(browserOwnsEscape(s.doc)).toBe(false);
      s.set(true);
      expect(browserOwnsEscape(s.doc)).toBe(true);
      s.set(false);
      expect(browserOwnsEscape(s.doc)).toBe(false);
    }
    expect(browserOwnsEscape(stub("none").doc)).toBe(false);
  });

  it("locks no keyboard, orientation, or pointer", async () => {
    const s = stub("unprefixed");
    const fs = createFullscreen(s.doc);
    fs.toggle();
    await flush();
    fs.toggle();
    await flush();
    expect(s.lock.keyboard).not.toHaveBeenCalled();
    expect(s.lock.orientation).not.toHaveBeenCalled();
    expect(s.lock.pointer).not.toHaveBeenCalled();
  });
});
