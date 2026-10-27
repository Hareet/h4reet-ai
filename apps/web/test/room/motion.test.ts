// T156's store half (spec 004; FR-059, FR-060, FR-065; WCAG 2.2's 2.2.2; R-34; data-model.md §11.3): src/room/motion.ts,
// the one motion store, on a jsdom window: its three flags, paused (the toolbar's "Pause the room"), reduced motion
// (matchMedia("(prefers-reduced-motion: reduce)"), its change listener read throughout the visit), and hidden
// (document.visibilityState, from visibilitychange, pagehide, and pageshow); the room animates only while all three are
// false; "Paused at HH:MM", 24-hour local time from the injected wall clock, kept while paused and only then, filling
// the UI word pause.paused_at's {time} slot; each change told to subscribers at once; and nothing stored or asked of
// the network.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { REDUCED_MOTION, clockTime, createMotionStore, pausedAtWords } from "../../src/room/motion";
import type { MotionState } from "../../src/room/motion";
import { WALL0, makeWindow, setHidden, setReducedMotion } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

/** A test window (test/helpers/room.ts), its reduced motion as given. */
const page = (reducedMotion = false): TestWindow => makeWindow({ reducedMotion }).window as unknown as TestWindow;

describe("the motion store's flags", () => {
  it("starts from the page: reduced motion from matchMedia, hidden from visibilityState, not paused", () => {
    expect(REDUCED_MOTION).toBe("(prefers-reduced-motion: reduce)");
    const still = createMotionStore({ win: page(true) });
    expect([still.paused, still.reducedMotion, still.hidden, still.animate]).toEqual([false, true, false, false]);
    const win = page();
    setHidden(win, true);
    const hidden = createMotionStore({ win });
    expect([hidden.paused, hidden.reducedMotion, hidden.hidden, hidden.animate]).toEqual([false, false, true, false]);
    const moving = createMotionStore({ win: page() });
    expect([moving.paused, moving.reducedMotion, moving.hidden, moving.animate]).toEqual([false, false, false, true]);
    expect(moving.pausedAt).toBeNull();
  });

  it("reads reduced motion throughout the visit, through its change listener", () => {
    const win = page();
    const store = createMotionStore({ win });
    const seen: MotionState[] = [];
    store.subscribe((state) => seen.push(state));
    setReducedMotion(win, true);
    expect(store.reducedMotion).toBe(true);
    expect(store.animate).toBe(false);
    setReducedMotion(win, false);
    expect(store.animate).toBe(true);
    expect(seen.map((s) => [s.reducedMotion, s.animate])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("follows the page's visibility: visibilitychange, pagehide, and pageshow", () => {
    const win = page();
    const store = createMotionStore({ win });
    const seen: boolean[] = [];
    store.subscribe((state) => seen.push(state.hidden));
    setHidden(win, true);
    expect(store.hidden).toBe(true);
    setHidden(win, false);
    expect(store.hidden).toBe(false);
    win.dispatchEvent(new win.Event("pagehide"));
    expect(store.hidden).toBe(true);
    win.dispatchEvent(new win.Event("pageshow"));
    expect(store.hidden).toBe(false);
    expect(seen).toEqual([true, false, true, false]);
    // A visibilitychange that changes nothing tells nobody.
    win.document.dispatchEvent(new win.Event("visibilitychange"));
    expect(seen).toHaveLength(4);
  });

  it("animates only while none of the three is set", () => {
    const win = page();
    const store = createMotionStore({ win });
    const combos: [boolean, boolean, boolean][] = [];
    for (const paused of [false, true])
      for (const reduced of [false, true])
        for (const hidden of [false, true]) {
          store.setPaused(paused);
          setReducedMotion(win, reduced);
          setHidden(win, hidden);
          combos.push([paused, reduced, hidden]);
          expect(store.animate, JSON.stringify(combos.at(-1))).toBe(!paused && !reduced && !hidden);
        }
  });

  it("stops listening when disposed", () => {
    const win = page();
    const store = createMotionStore({ win });
    const seen: MotionState[] = [];
    store.subscribe((state) => seen.push(state));
    store.dispose();
    setReducedMotion(win, true);
    setHidden(win, true);
    expect(seen).toEqual([]);
    expect(store.reducedMotion).toBe(false);
  });

  it("works on a page with no matchMedia: reduced motion off", () => {
    const win = new JSDOM("<main></main>").window as unknown as Window;
    const store = createMotionStore({ win });
    expect(store.reducedMotion).toBe(false);
    expect(store.animate).toBe(true);
  });
});

describe("Paused at HH:MM (FR-060)", () => {
  it("keeps the wall clock's local time, 24-hour, from the moment the room paused, and only while it is paused", () => {
    let wall = WALL0;
    const store = createMotionStore({ win: page(), wall: () => wall });
    const seen: (string | null)[] = [];
    store.subscribe((state) => seen.push(state.pausedAt));
    store.setPaused(true);
    expect(store.paused).toBe(true);
    expect(store.pausedAt).toBe("13:05");
    // Time passing changes nothing: it's the time the room paused.
    wall += 7 * 60_000;
    expect(store.pausedAt).toBe("13:05");
    // Pressing it on again changes nothing either.
    store.setPaused(true);
    store.setPaused(false);
    expect(store.pausedAt).toBeNull();
    wall = new Date(2026, 9, 27, 0, 7).getTime();
    store.setPaused(true);
    expect(store.pausedAt).toBe("00:07");
    expect(seen).toEqual(["13:05", null, "00:07"]);
  });

  it("writes HH:MM in 24-hour local time", () => {
    expect(clockTime(new Date(2026, 0, 1, 0, 0).getTime())).toBe("00:00");
    expect(clockTime(new Date(2026, 0, 1, 9, 3).getTime())).toBe("09:03");
    expect(clockTime(new Date(2026, 0, 1, 13, 45).getTime())).toBe("13:45");
    expect(clockTime(new Date(2026, 0, 1, 23, 59, 59).getTime())).toBe("23:59");
  });

  it("fills the UI word pause.paused_at's {time} slot with the live value, and gives null without the word", () => {
    expect(pausedAtWords({ "pause.paused_at": "Paused at {time}" }, "13:05")).toBe("Paused at 13:05");
    expect(pausedAtWords({}, "13:05")).toBeNull();
  });

  it("isn't set by a hidden page or by reduced motion", () => {
    const win = page();
    const store = createMotionStore({ win, wall: () => WALL0 });
    setHidden(win, true);
    setReducedMotion(win, true);
    expect(store.paused).toBe(false);
    expect(store.pausedAt).toBeNull();
  });
});
