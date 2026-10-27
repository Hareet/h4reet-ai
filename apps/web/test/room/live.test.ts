// T155 (spec 004; FR-042, FR-043, FR-045, SC-003, User Story 2 scenarios 1 to 3; contracts/tier-signal.md §6, §9):
// src/room/signals/live.ts, the live controller, with FakeClock and a fake scene whose `apply` takes the case the
// claims rule gives (tier.ts's caseFor) and records the frame on which each case is first drawn. With live.source off,
// no request and the not-live case; after each failure and at each stale instant, the plugged case leaves on the first
// frame after; on pause and on hide the tier reads paused (not-live while off), an answer arriving meanwhile changes
// nothing, and the plugged case is never drawn; on resume or show the tier is reduced before the next frame; and the
// plugged case is drawn only for local, even from a bundle that maps another value to it. Status results are injected
// directly through `complete`, since the poller comes in T245. Then the same in the room (src/room/app.ts), on its
// stand-in 3D stage and in its 2D drawing. Every ID is a synthetic fx- one or the composed data's, read at run time.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { TierValue } from "../../src/room/compose/vocabulary";
import type { MotionState } from "../../src/room/motion";
import { createLiveSignals } from "../../src/room/signals/live";
import type { LiveSignals } from "../../src/room/signals/live";
import { caseFor } from "../../src/room/signals/tier";
import type { StatusAnswer, StatusResult, TierReading } from "../../src/room/signals/tier";
import {
  FakeClock,
  WALL0,
  button,
  intoRoom,
  roomIndex,
  setHidden,
  setReducedMotion,
  start,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const FRAME = 16;
const FRESH = 35_000;
type Cases = Record<TierValue, string>;

/** A switch's cases as the default scene maps them: the plugged pose for local, the cloud pose for cloud, and one
 *  shared pose for the rest. */
const CASES: Cases = {
  local: "fx-plugged",
  cloud: "fx-cloud",
  resting: "fx-resting",
  budget: "fx-resting",
  unavailable: "fx-resting",
  unknown: "fx-resting",
  paused: "fx-resting",
  "not-live": "fx-resting",
};

/** The motion store's pause and visibility, set by the test. */
function fakeMotion() {
  const listeners = new Set<(state: MotionState) => void>();
  const motion = {
    paused: false,
    hidden: false,
    reducedMotion: false,
    subscribe(fn: (state: MotionState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(change: Partial<Pick<MotionState, "paused" | "hidden" | "reducedMotion">>) {
      Object.assign(motion, change);
      const state: MotionState = {
        paused: motion.paused,
        hidden: motion.hidden,
        reducedMotion: motion.reducedMotion,
        animate: !motion.paused && !motion.hidden && !motion.reducedMotion,
        pausedAt: motion.paused ? "13:05" : null,
      };
      for (const fn of [...listeners]) fn(state);
    },
  };
  return motion;
}

/** A fake scene: `apply` takes the case the claims rule gives, which its frame loop draws from its next frame on; each
 *  case's first frame drawn, after a change, is logged with its frame number and time. */
class FakeScene {
  frames = 0;
  pending: string | null = null;
  drawn: string | null = null;
  readonly log: { pose: string | null; frame: number; at: number }[] = [];
  readonly applied: { value: TierValue; frame: number; at: number }[] = [];
  constructor(
    private readonly clock: FakeClock,
    private readonly cases: Cases,
  ) {
    const loop = (time: number): void => {
      this.frames += 1;
      if (this.pending !== this.drawn) {
        this.drawn = this.pending;
        this.log.push({ pose: this.drawn, frame: this.frames, at: time });
      }
      clock.requestFrame(loop);
    };
    clock.requestFrame(loop);
  }
  apply(value: TierValue): void {
    this.applied.push({ value, frame: this.frames, at: this.clock.now() });
    this.pending = caseFor(this.cases, value);
  }
  /** The frames on which the pose was drawn: from each first drawing until the next change. */
  framesOf(pose: string): [number, number][] {
    const out: [number, number][] = [];
    this.log.forEach((entry, i) => {
      if (entry.pose !== pose) return;
      const next = this.log[i + 1];
      out.push([entry.frame, next ? next.frame - 1 : this.frames]);
    });
    return out;
  }
}

interface Harness {
  clock: FakeClock;
  motion: ReturnType<typeof fakeMotion>;
  scene: FakeScene;
  live: LiveSignals;
  readings: TierReading[];
  /** A valid answer whose request took 200 ms and ends now. */
  answer(answer?: Partial<StatusAnswer>): StatusResult;
  failure(why: "network" | "timeout" | "status" | "shape", status?: number): StatusResult;
}

function harness(o: { source?: "off" | "site"; cases?: Cases } = {}): Harness {
  const clock = new FakeClock();
  const motion = fakeMotion();
  const scene = new FakeScene(clock, o.cases ?? CASES);
  const readings: TierReading[] = [];
  const wall = (): number => WALL0 + clock.now();
  const live = createLiveSignals({
    live: { source: o.source ?? "site", freshness_ms: FRESH },
    clock,
    wall,
    motion,
    apply: (reading) => {
      readings.push(reading);
      scene.apply(reading.tier);
    },
  });
  return {
    clock,
    motion,
    scene,
    live,
    readings,
    answer: (answer = {}) => ({
      ok: true,
      started: clock.now() - 200,
      ended: clock.now(),
      endedWall: wall(),
      answer: { local_tier: "up", state: "normal", cause_now: null, ...answer },
    }),
    failure: (why, status) => ({
      ok: false,
      started: clock.now() - 5_000,
      ended: clock.now(),
      endedWall: wall(),
      why,
      ...(status === undefined ? {} : { status }),
    }),
  };
}

const PLUGGED = CASES.local;
const SHARED = CASES.unknown;

describe("the live controller with live.source off (FR-045; scenario 1)", () => {
  it("reads not-live from Enter, whatever completes, and draws the shared case", () => {
    const h = harness({ source: "off" });
    h.live.enter();
    expect(h.live.tier).toEqual({ tier: "not-live", row: 1, recheckAt: null });
    h.live.complete(h.answer());
    h.live.fallbackReply();
    h.motion.set({ paused: true });
    h.motion.set({ paused: false, hidden: true });
    h.clock.advance(60_000, FRAME);
    expect(new Set(h.readings.map((r) => r.tier))).toEqual(new Set(["not-live"]));
    expect(h.scene.framesOf(PLUGGED)).toEqual([]);
    expect(h.scene.drawn).toBe(SHARED);
    // No reading is ever stale, so no timer is armed.
    expect(h.clock.pendingTimers).toBe(0);
  });
});

describe("the live controller: the first frame after a failure or a stale answer (SC-003; scenario 2)", () => {
  it("reads unknown at Enter, before the first answer, and local once it comes", () => {
    const h = harness();
    h.live.enter();
    expect(h.live.tier.tier).toBe("unknown");
    expect(h.live.tier.row).toBe(3);
    h.clock.advance(100, FRAME);
    h.live.complete(h.answer());
    expect(h.live.tier).toEqual({ tier: "local", row: 8, recheckAt: h.clock.now() + FRESH });
    h.clock.advance(FRAME, FRAME);
    expect(h.scene.drawn).toBe(PLUGGED);
  });

  it.each([
    ["network", undefined],
    ["timeout", undefined],
    ["status", 404],
    ["status", 429],
    ["status", 503],
    ["shape", undefined],
  ] as const)("leaves the plugged case on the first frame after a %s failure (%s)", (why, status) => {
    const h = harness();
    h.live.enter();
    h.live.complete(h.answer());
    h.clock.advance(1_000, FRAME);
    expect(h.scene.drawn).toBe(PLUGGED);
    const framesBefore = h.scene.frames;
    h.live.complete(h.failure(why, status));
    // At once: the tier, the switch's case, and the subscribers, in the same call.
    expect(h.live.tier).toEqual({ tier: "unknown", row: 3, recheckAt: null });
    expect(h.scene.applied.at(-1)).toEqual({ value: "unknown", frame: framesBefore, at: h.clock.now() });
    h.clock.advance(FRAME, FRAME);
    expect(h.scene.frames).toBe(framesBefore + 1);
    expect(h.scene.drawn).toBe(SHARED);
    expect(h.scene.framesOf(PLUGGED).at(-1)?.[1]).toBe(framesBefore);
  });

  it("leaves the plugged case on the first frame at or after the answer's stale instant, never before", () => {
    const h = harness();
    h.live.enter();
    h.clock.advance(5, FRAME);
    h.live.complete(h.answer());
    const stale = h.live.tier.recheckAt ?? Number.NaN;
    expect(stale).toBe(h.clock.now() + FRESH);
    h.clock.advance(stale - 1 - h.clock.now(), FRAME);
    expect(h.live.tier.tier).toBe("local");
    expect(h.scene.drawn).toBe(PLUGGED);
    h.clock.advance(1, FRAME);
    // The timer on the room's Clock re-reduced at the instant itself.
    expect(h.live.tier).toEqual({ tier: "unknown", row: 4, recheckAt: null });
    expect(h.readings.at(-1)?.row).toBe(4);
    h.clock.advance(FRAME, FRAME);
    const left = h.scene.log.at(-1);
    expect(left?.pose).toBe(SHARED);
    // The first frame drawn after the stale instant: the frame before it, the last plugged one, came before it.
    expect(left?.at).toBeGreaterThanOrEqual(stale);
    expect((left?.at ?? Number.NaN) - stale).toBeLessThanOrEqual(FRAME);
    expect(h.scene.framesOf(PLUGGED).at(-1)?.[1]).toBe((left?.frame ?? 0) - 1);
  });

  it("re-arms the stale timer with each answer, and keeps local while each comes in time", () => {
    const h = harness();
    h.live.enter();
    for (let k = 0; k < 6; k += 1) {
      h.live.complete(h.answer());
      h.clock.advance(30_000, FRAME);
      expect(h.live.tier.tier, String(k)).toBe("local");
    }
    expect(h.scene.framesOf(PLUGGED)).toHaveLength(1);
    expect(h.clock.pendingTimers).toBe(1);
  });

  it("reads cloud at once on a fallback reply, until the next valid answer", () => {
    const h = harness();
    h.live.enter();
    h.live.complete(h.answer());
    h.clock.advance(2_000, FRAME);
    h.live.fallbackReply();
    expect(h.live.tier.tier).toBe("cloud");
    expect(h.live.tier.row).toBe(7);
    h.clock.advance(FRAME, FRAME);
    expect(h.scene.drawn).toBe(CASES.cloud);
    // An answer whose request began after the reply: local again.
    h.clock.advance(1_000, FRAME);
    h.live.complete(h.answer());
    expect(h.live.tier.tier).toBe("local");
  });
});

describe("the live controller: paused and hidden (FR-042, FR-060; scenario 3)", () => {
  for (const flag of ["paused", "hidden"] as const) {
    it(`reads paused while ${flag}, even when an answer in flight completes, and never draws the plugged case`, () => {
      const h = harness();
      h.live.enter();
      h.live.complete(h.answer());
      h.clock.advance(1_000, FRAME);
      expect(h.scene.drawn).toBe(PLUGGED);
      const before = h.scene.frames;
      h.motion.set({ [flag]: true });
      expect(h.live.tier).toEqual({ tier: "paused", row: 2, recheckAt: null });
      expect(h.scene.applied.at(-1)?.value).toBe("paused");
      h.clock.advance(FRAME, FRAME);
      expect(h.scene.drawn).toBe(SHARED);
      expect(h.scene.framesOf(PLUGGED).at(-1)?.[1]).toBe(before);
      // The request that was in flight completes: paused still wins (row 2).
      h.clock.advance(3_000, FRAME);
      h.live.complete(h.answer());
      expect(h.live.tier.tier).toBe("paused");
      h.clock.advance(10 * 60_000, FRAME);
      expect(h.live.tier.tier).toBe("paused");
      expect(h.scene.framesOf(PLUGGED)).toHaveLength(1);
      expect(h.clock.pendingTimers).toBe(0);
    });

    it(`on ${flag === "paused" ? "resume" : "show"}, reduces the tier before the next frame`, () => {
      const h = harness();
      h.live.enter();
      h.motion.set({ [flag]: true });
      h.clock.advance(2_000, FRAME);
      h.live.complete(h.answer());
      h.clock.advance(1_000, FRAME);
      const frames = h.scene.frames;
      h.motion.set({ [flag]: false });
      // In the same event, before the clock draws another frame: by FR-041's table, from the answer kept.
      expect(h.live.tier.tier).toBe("local");
      expect(h.scene.applied.at(-1)).toEqual({ value: "local", frame: frames, at: h.clock.now() });
      h.clock.advance(FRAME, FRAME);
      expect(h.scene.log.at(-1)).toEqual({ pose: PLUGGED, frame: frames + 1, at: h.clock.now() });
      // An answer that turned stale while paused reads unknown on resume, not local.
      const late = harness();
      late.live.enter();
      late.live.complete(late.answer());
      late.motion.set({ [flag]: true });
      late.clock.advance(FRESH + 1, FRAME);
      late.motion.set({ [flag]: false });
      expect(late.live.tier).toEqual({ tier: "unknown", row: 4, recheckAt: null });
    });
  }

  it("reads not-live, not paused, while the live source is off (FR-041 row 1)", () => {
    const h = harness({ source: "off" });
    h.live.enter();
    h.motion.set({ paused: true });
    expect(h.live.tier.tier).toBe("not-live");
    h.motion.set({ paused: false, hidden: true });
    expect(h.live.tier.tier).toBe("not-live");
  });

  it("changes nothing when reduced motion turns on or off: it stops motion, not the tier", () => {
    const h = harness();
    h.live.enter();
    h.live.complete(h.answer());
    const count = h.readings.length;
    h.motion.set({ reducedMotion: true });
    h.motion.set({ reducedMotion: false });
    expect(h.readings).toHaveLength(count);
    expect(h.live.tier.tier).toBe("local");
  });
});

describe("the claims rule at run time (FR-043, FR-062)", () => {
  it("draws the plugged case only for local, even from a bundle that maps every other value to it", () => {
    const faulty: Cases = { ...CASES, unknown: PLUGGED, paused: PLUGGED, budget: PLUGGED, "not-live": PLUGGED };
    const h = harness({ cases: faulty });
    const tiers: TierValue[] = [];
    h.live.subscribe((r) => tiers.push(r.tier));
    h.live.enter();
    h.clock.advance(100, FRAME);
    h.live.complete(h.answer());
    h.clock.advance(100, FRAME);
    h.live.fallbackReply();
    h.clock.advance(100, FRAME);
    h.live.complete(h.answer({ cause_now: "meter_at_ceiling" }));
    h.clock.advance(100, FRAME);
    h.motion.set({ paused: true });
    h.clock.advance(100, FRAME);
    h.motion.set({ paused: false });
    h.clock.advance(100, FRAME);
    h.live.complete(h.answer({ local_tier: "down" }));
    h.clock.advance(100, FRAME);
    h.live.complete(h.failure("network"));
    h.clock.advance(100, FRAME);
    expect(tiers).toEqual(["unknown", "local", "cloud", "budget", "paused", "budget", "cloud", "unknown"]);
    // Each log entry's pose is the case the tier applied before its frame: plugged only while local.
    const drawnFor = h.scene.log.map((entry) => {
      const applied = h.scene.applied.filter((a) => a.frame < entry.frame).at(-1);
      return [entry.pose, applied?.value] as const;
    });
    for (const [pose, value] of drawnFor) if (pose === PLUGGED) expect(value).toBe("local");
    expect(h.scene.framesOf(PLUGGED)).toHaveLength(1);
    // Every other value falls to the shared case, so the room is never left without one.
    expect(h.scene.log.every((entry) => entry.pose !== null)).toBe(true);
    expect(caseFor(faulty, "budget")).toBe(SHARED);
  });

  it("trusts neither claim where local's and cloud's cases name one pose: both fall to the shared case", () => {
    const tangled: Cases = { ...CASES, cloud: PLUGGED };
    expect(caseFor(tangled, "local")).toBe(SHARED);
    expect(caseFor(tangled, "cloud")).toBe(SHARED);
    const h = harness({ cases: tangled });
    h.live.enter();
    h.live.complete(h.answer());
    h.clock.advance(100, FRAME);
    h.live.complete(h.answer({ local_tier: "down" }));
    h.clock.advance(100, FRAME);
    expect(h.scene.framesOf(PLUGGED)).toEqual([]);
  });

  it("lets go of its timer and its listeners when disposed", () => {
    const h = harness();
    h.live.enter();
    h.live.complete(h.answer());
    expect(h.clock.pendingTimers).toBe(1);
    h.live.dispose();
    expect(h.clock.pendingTimers).toBe(0);
    const count = h.readings.length;
    h.motion.set({ paused: true });
    h.live.complete(h.answer());
    expect(h.readings).toHaveLength(count);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// In the room (app.ts)
// --------------------------------------------------------------------------------------------------------------------
let composed: ComposeResult | null = null;
/** The fixture set, composed once a file. */
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));

/** An index whose live source is on, as User Story 8's switch-on change makes it, with no poller on this branch. */
const site = (index: RoomIndex): RoomIndex => ({ ...index, live: { ...index.live, source: "site" } });

/** A valid answer ending now on the visit's clocks. */
function answerIn(v: Visit, answer: Partial<StatusAnswer> = {}): StatusResult {
  return {
    ok: true,
    started: v.clock.now() - 200,
    ended: v.clock.now(),
    endedWall: WALL0 + v.clock.now(),
    answer: { local_tier: "up", state: "normal", cause_now: null, ...answer },
  };
}

/** "Around the room"'s line for the index's first switch. */
function switchLine(v: Visit, index: RoomIndex): string {
  const sw = index.switches[0];
  const label = sw ? (index.ui[sw.label] ?? "") : "";
  const line = [...v.doc.querySelectorAll(".room-around li")].find((li) => textOf(li).startsWith(`${label}:`));
  return textOf(line ?? null);
}

/** The 2D drawing's shown case of the index's first switch: its case groups are the svg's g children with a
 *  visibility, in the index's poses' order. */
function shown2d(v: Visit, index: RoomIndex): string | null {
  const sw = index.switches[0];
  const poses = index.flat.poses.filter((p) => p.switch === sw?.id).map((p) => p.pose);
  const groups = [...v.doc.querySelectorAll(".flat svg > g[visibility]")];
  const k = groups.findIndex((g) => g.getAttribute("visibility") === "visible");
  return k < 0 ? null : (poses[k] ?? null);
}

describe("in the room: the live source off (scenario 1)", () => {
  it("makes no request, applies not-live to the stage at Enter and on pause, and says so in the text copy", async () => {
    const index = roomIndex();
    expect(index.live.source).toBe("off");
    const v = start({ webgl: true });
    await intoRoom(v);
    expect(v.spies.network).toEqual([]);
    expect(v.scene.applied.length).toBeGreaterThan(0);
    expect(new Set(v.scene.applied.map((a) => a.value))).toEqual(new Set(["not-live"]));
    expect(v.room.live.tier.tier).toBe("not-live");
    const sw = index.switches[0];
    expect(switchLine(v, index)).toBe(`${index.ui[sw?.label ?? ""] ?? ""}: ${index.ui["tier.not-live"] ?? ""}`);
    button(v.doc, index.ui["pause.button"] ?? "Pause the room").click();
    v.clock.advance(120_000);
    expect(new Set(v.scene.applied.map((a) => a.value))).toEqual(new Set(["not-live"]));
    expect(v.spies.network).toEqual([]);
  });
});

describe("in the room: a reading reaches the stage and the text copy at once (scenarios 2 and 3)", () => {
  it("applies each reading to the 3D stage before its next frame, the sentence changing in the same call", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    // Enter's reduction: unknown, before any answer.
    expect(v.scene.applied.at(-1)?.value).toBe("unknown");
    expect(switchLine(v, index)).toContain(index.ui["tier.unknown"] ?? "?");
    const frames = v.scene.frames;
    v.room.live.complete(answerIn(v));
    expect(v.scene.applied.at(-1)).toEqual({ value: "local", frame: frames, at: v.clock.now() });
    expect(switchLine(v, index)).toContain(index.ui["tier.local"] ?? "?");
    v.room.live.complete({ ...answerIn(v), ok: false, why: "timeout" } as StatusResult);
    expect(v.scene.applied.at(-1)?.value).toBe("unknown");
    expect(switchLine(v, index)).toContain(index.ui["tier.unknown"] ?? "?");
    expect(v.scene.frames).toBe(frames);
  });

  it("on pause and hide reads paused, and on resume and show reduces again before the next frame", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    v.room.live.complete(answerIn(v));
    v.clock.advance(500);
    const pause = button(v.doc, index.ui["pause.button"] ?? "Pause the room");
    pause.click();
    expect(v.scene.applied.at(-1)?.value).toBe("paused");
    expect(switchLine(v, index)).toContain(index.ui["tier.paused"] ?? "?");
    // An answer in flight completes while paused: paused still wins.
    v.room.live.complete(answerIn(v));
    expect(v.scene.applied.at(-1)?.value).toBe("paused");
    v.clock.advance(5_000);
    const frames = v.scene.frames;
    pause.click();
    expect(v.scene.applied.at(-1)).toEqual({ value: "local", frame: frames, at: v.clock.now() });
    setHidden(v.win, true);
    expect(v.scene.applied.at(-1)?.value).toBe("paused");
    v.clock.advance(5_000);
    const shownAt = v.scene.frames;
    setHidden(v.win, false);
    expect(v.scene.applied.at(-1)).toEqual({ value: "local", frame: shownAt, at: v.clock.now() });
    // Reduced motion changes motion only.
    const count = v.scene.applied.length;
    setReducedMotion(v.win, true);
    expect(v.scene.applied).toHaveLength(count);
  });

  it("shows the 2D drawing's case at once, by the claims rule, even from an index that maps unknown to the plugged pose", async () => {
    const { index } = fixture();
    const sw = index.switches[0];
    if (!sw) throw new Error("the fixture has no switch");
    const faulty: RoomIndex = {
      ...site(index),
      switches: index.switches.map((s) => ({ ...s, cases: { ...s.cases, unknown: s.cases.local } })),
    };
    const v = start({ webgl: false, room: faulty });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(shown2d(v, faulty)).toBe(sw.cases["not-live"]);
    v.room.live.complete(answerIn(v));
    expect(shown2d(v, faulty)).toBe(sw.cases.local);
    v.room.live.complete({ ...answerIn(v), ok: false, why: "network" } as StatusResult);
    expect(v.room.live.tier.tier).toBe("unknown");
    expect(shown2d(v, faulty)).toBe(sw.cases["not-live"]);
    expect(switchLine(v, faulty)).toContain(faulty.ui["tier.unknown"] ?? "?");
  });

  it("applies the tier to a stage the room moves to, when it goes to 2D", async () => {
    const { index } = fixture();
    const sw = index.switches[0];
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    v.room.live.complete(answerIn(v, { local_tier: "down" }));
    button(v.doc, "2D view").click();
    expect(v.room.visit.mode).toBe("2d");
    expect(shown2d(v, index)).toBe(sw?.cases.cloud);
  });
});
