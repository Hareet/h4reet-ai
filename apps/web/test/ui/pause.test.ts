// T156's room half (spec 004; FR-059, FR-060, FR-065; WCAG 2.2's 2.2.2; R-34; data-model.md §11.3; Amendment B8): "Pause
// the room" in the room's toolbar, the UI word pause.button, a toggle whose state is in aria-pressed, inert during the
// hand-off as the toolbar is; while it's on, the stage's motion stops (the 3D stage reads the motion store, which no
// longer animates) and its frame loop keeps drawing still frames; "Paused at HH:MM", from the injected wall clock, is in
// "Around the room" while paused and only then, never for a hidden page; reduced motion, switched on mid-visit, reaches
// the stage in 3D and in 2D and stops motion, not the tier; and state changes still apply at once, paused or still.
// The neon sign's counters, which FR-060 keeps updating while paused, come with User Stories 5 and 9 (T184, T266).
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { StatusResult } from "../../src/room/signals/tier";
import {
  WALL0,
  button,
  enter,
  flush,
  intoRoom,
  radio,
  setHidden,
  setReducedMotion,
  start,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));
const site = (index: RoomIndex): RoomIndex => ({ ...index, live: { ...index.live, source: "site" } });

const pauseButton = (v: Visit, index: RoomIndex): HTMLButtonElement =>
  button(v.doc, index.ui["pause.button"] ?? "Pause the room");
const lines = (v: Visit): string[] => [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));
/** "Paused at" as the UI word words it, before its time. */
const pausedPrefix = (index: RoomIndex): string =>
  (index.ui["pause.paused_at"] ?? "Paused at {time}").split("{")[0] ?? "";
const pausedLines = (v: Visit, index: RoomIndex): string[] => lines(v).filter((l) => l.startsWith(pausedPrefix(index)));

function answer(v: Visit): StatusResult {
  return {
    ok: true,
    started: v.clock.now() - 100,
    ended: v.clock.now(),
    endedWall: WALL0 + v.clock.now(),
    answer: { local_tier: "up", state: "normal", cause_now: null },
  };
}

describe('"Pause the room" (FR-060)', () => {
  it("is a toolbar toggle, the UI word pause.button, its state in aria-pressed, in 3D and 2D", async () => {
    const { index } = fixture();
    // The fixture's own words, which the room takes from its index.
    expect(index.ui["pause.button"]).toBeTruthy();
    for (const webgl of [true, false]) {
      const v = start({ webgl, room: index });
      await intoRoom(v);
      const pause = pauseButton(v, index);
      expect(pause.closest(".room-toolbar"), String(webgl)).not.toBeNull();
      expect(pause.getAttribute("type")).toBe("button");
      expect(pause.getAttribute("aria-pressed")).toBe("false");
      pause.click();
      expect(pause.getAttribute("aria-pressed")).toBe("true");
      expect(v.room.motion.paused).toBe(true);
      pause.click();
      expect(pause.getAttribute("aria-pressed")).toBe("false");
      expect(v.room.motion.paused).toBe(false);
    }
  });

  it("is inert during the hand-off, as the rest of the toolbar is", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: index });
    await enter(v);
    expect(pauseButton(v, index).closest("[inert]")).not.toBeNull();
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    expect(pauseButton(v, index).closest("[inert]")).toBeNull();
  });

  it("stops the 3D stage's motion while the frame loop keeps drawing still frames, and lets it move again", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: index });
    await intoRoom(v);
    const options = v.scene.created[0];
    if (!options?.motion) throw new Error("the stage has no motion store");
    expect(options.motion.animate).toBe(true);
    pauseButton(v, index).click();
    expect(options.motion.animate).toBe(false);
    expect(options.reducedMotion).toBe(false);
    const frames = v.scene.frames;
    v.clock.advance(60_000);
    expect(v.scene.frames - frames).toBeGreaterThan(3000);
    expect(v.clock.pendingFrames).toBe(1);
    pauseButton(v, index).click();
    expect(options.motion.animate).toBe(true);
  });

  it('shows "Paused at HH:MM" in "Around the room" while paused, from the wall clock, and only then', async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: index, wall: (clock) => WALL0 + 47 * 60_000 + clock.now() });
    await intoRoom(v);
    const before = lines(v);
    expect(pausedLines(v, index)).toEqual([]);
    pauseButton(v, index).click();
    expect(pausedLines(v, index)).toEqual([(index.ui["pause.paused_at"] ?? "").replace("{time}", "13:52")]);
    // In copy[]'s place, the last entry, every other line as it was.
    expect(lines(v).slice(0, -1)).toEqual(before);
    // No live region: the line is page text, updated in place.
    const around = v.doc.querySelector(".room-around");
    expect(around?.querySelector("[aria-live], [role='status'], [role='log']")).toBeNull();
    v.clock.advance(3 * 60_000);
    expect(pausedLines(v, index)).toHaveLength(1);
    expect(pausedLines(v, index)[0]).toContain("13:52");
    pauseButton(v, index).click();
    expect(lines(v)).toEqual(before);
  });

  it("reads the tier as paused, or not-live while the live source is off", async () => {
    const { index } = fixture();
    const on = start({ webgl: true, room: site(index) });
    await intoRoom(on);
    on.room.live.complete(answer(on));
    pauseButton(on, index).click();
    expect(on.room.live.tier.tier).toBe("paused");
    const off = start({ webgl: true, room: index });
    await intoRoom(off);
    pauseButton(off, index).click();
    expect(off.room.live.tier.tier).toBe("not-live");
  });
});

describe("a hidden page (FR-042, FR-060)", () => {
  it('reads paused and shows no "Paused at", and reduces again when shown', async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    v.room.live.complete(answer(v));
    setHidden(v.win, true);
    expect(v.room.live.tier.tier).toBe("paused");
    expect(v.room.motion.animate).toBe(false);
    expect(pausedLines(v, index)).toEqual([]);
    expect(pauseButton(v, index).getAttribute("aria-pressed")).toBe("false");
    setHidden(v.win, false);
    expect(v.room.live.tier.tier).toBe("local");
  });
});

describe("reduced motion, read throughout the visit (FR-059)", () => {
  it("reaches the 3D stage mid-visit and stops its motion, not the tier, and state changes still apply at once", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    const options = v.scene.created[0];
    if (!options?.motion) throw new Error("the stage has no motion store");
    expect(options.reducedMotion).toBe(false);
    setReducedMotion(v.win, true);
    expect(options.reducedMotion).toBe(true);
    expect(options.motion.animate).toBe(false);
    expect(v.room.live.tier.tier).toBe("unknown");
    expect(pausedLines(v, index)).toEqual([]);
    const frames = v.scene.frames;
    v.room.live.complete(answer(v));
    expect(v.scene.applied.at(-1)).toEqual({ value: "local", frame: frames, at: v.clock.now() });
    expect(lines(v).some((l) => l.endsWith(index.ui["tier.local"] ?? "?"))).toBe(true);
    // Paused too, a change still applies at once: a failure takes the plugged case away.
    pauseButton(v, index).click();
    expect(v.scene.applied.at(-1)?.value).toBe("paused");
    setReducedMotion(v.win, false);
    expect(options.reducedMotion).toBe(false);
    expect(options.motion.animate).toBe(false);
  });

  it("reaches the 2D hand-off mid-visit: switched on before the middle frame, the visitor doesn't turn", async () => {
    const moving = start({ webgl: false });
    await enter(moving);
    moving.clock.advance(1500);
    const turned = moving.doc.querySelector(".flat")?.querySelectorAll("[transform]").length ?? 0;
    const v = start({ webgl: false });
    await flush();
    radio(v.doc, "path", "engineer").click();
    radio(v.doc, "avatar", "dog").click();
    button(v.doc, "Enter").click();
    await v.room.settled();
    await flush();
    const start2d = v.doc.querySelector(".flat")?.querySelectorAll("[transform]").length ?? 0;
    setReducedMotion(v.win, true);
    v.clock.advance(1500);
    expect(v.doc.querySelector(".flat")?.getAttribute("data-handoff-frame")).toBe("1");
    expect(v.doc.querySelector(".flat")?.querySelectorAll("[transform]").length).toBe(start2d);
    expect(turned).toBe(start2d + 1);
  });
});
