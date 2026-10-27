// T155 (spec 004; FR-042, FR-043, FR-045, SC-003, User Story 2 scenarios 1 to 3; contracts/tier-signal.md §6, §9):
// src/room/signals/live.ts, the live controller, with FakeClock and a fake scene whose `apply` takes the case the
// claims rule gives (tier.ts's caseFor) and records the frame on which each case is first drawn. With live.source off,
// no request and the not-live case; after each failure and at each stale instant, the plugged case leaves on the first
// frame after; on pause and on hide the tier reads paused (not-live while off), an answer arriving meanwhile changes
// nothing, and the plugged case is never drawn; on resume or show the tier is reduced before the next frame; and the
// plugged case is drawn only for local, even from a bundle that maps another value to it. Status results are injected
// directly through `complete`, since the poller comes in T245. Then the same in the room (src/room/app.ts), on its
// stand-in 3D stage and in its 2D drawing. Every ID is a synthetic fx- one or the composed data's, read at run time.
//
// T244 (spec 004; FR-042, SC-003; contracts/tier-signal.md §5.4, §6): then with the poller wired (T245, T246) and
// live.source `site`, results coming only from the room's own fetch of /api/status: each failure kind takes the plugged
// case away on the first frame after it, a stale answer on the first frame at `recheckAt`, and pause and hide with an
// answer in flight leave the tier paused, with no request while paused or hidden. And the drafts build's frame log
// (T246; R-70): the newest 10,000 entries of {t, wall, frame, event, …} in page memory, each event §6 lists, each new
// switch case with the frame on which the 3D room first drew it (in 2D, the time it was applied), and h4FrameLog() on
// the window returning it as JSON; a room without the log (a release build) has no h4FrameLog.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { TierValue } from "../../src/room/compose/vocabulary";
import type { MotionState } from "../../src/room/motion";
import { FRAME_LOG_KIND, FRAME_LOG_LIMIT, createFrameLog } from "../../src/room/signals/frame-log";
import type { FrameLogEntry } from "../../src/room/signals/frame-log";
import { createLiveSignals } from "../../src/room/signals/live";
import type { LiveSignals } from "../../src/room/signals/live";
import { caseFor } from "../../src/room/signals/tier";
import type { StatusAnswer, StatusResult, SwitchRule, TierReading } from "../../src/room/signals/tier";
import {
  FakeClock,
  WALL0,
  button,
  flush,
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
/** The plugged and the cloud poses, as the bundle's claims name them (contracts/room-bundle.md §3.1; T163). */
const CLAIMS = { local: "fx-plugged", cloud: "fx-cloud" } as const;
/** A switch with those claims and these cases, as the claims rule reads it. */
const claimed = (cases: Cases): SwitchRule => ({ cases, claims: CLAIMS });

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
    this.pending = caseFor(claimed(this.cases), value);
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
    expect(caseFor(claimed(faulty), "budget")).toBe(SHARED);
  });

  it("reads claims as not-live where no case shows their cloud pose: local and cloud both fall to the shared case", () => {
    const tangled: Cases = { ...CASES, cloud: PLUGGED };
    expect(caseFor(claimed(tangled), "local")).toBe(SHARED);
    expect(caseFor(claimed(tangled), "cloud")).toBe(SHARED);
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

// --------------------------------------------------------------------------------------------------------------------
// With the poller wired (T244; T245, T246)
// --------------------------------------------------------------------------------------------------------------------
const VALID: StatusAnswer = { local_tier: "up", state: "normal", cause_now: null };

/** One answer of the page's fetch for /api/status: a response, at once or `after` ms later on the visit's clock; a
 *  rejected fetch; or one that never settles. */
type Reply =
  { status: number; body: string | null; headers?: Record<string, string>; after?: number } | "reject" | "hang";
const OK: Reply = { status: 200, body: JSON.stringify(VALID) };

/** A response as the poller reads it; a `null` body never arrives. */
function response(status: number, body: string | null, headers: Record<string, string> = {}): Response {
  const text = (): Promise<string> => (body === null ? new Promise<string>(() => undefined) : Promise.resolve(body));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text,
    json: async () => JSON.parse(await text()) as unknown,
  } as unknown as Response;
}

interface Polled {
  v: Visit;
  index: RoomIndex;
  /** Each fetch the page made: its URL and init, at its time on the visit's clock. */
  calls: { url: string; init: RequestInit; at: number }[];
}

/** The fixture room with its live source on, the page's fetch answering from `replies` in turn (then a valid answer
 *  at once), and the drafts build's frame log. */
function polled(replies: Reply[], o: { webgl?: boolean; log?: boolean } = {}): Polled {
  const { index } = fixture();
  const calls: Polled["calls"] = [];
  const clock: { now(): number } = { now: () => -1 };
  const v = start({
    webgl: o.webgl ?? true,
    room: site(index),
    ...(o.log === false ? {} : { frameLog: createFrameLog }),
    fetch: (url, init) => {
      calls.push({ url, init, at: clock.now() });
      const reply = replies.shift() ?? OK;
      if (reply === "reject") return Promise.reject(new TypeError("Failed to fetch"));
      if (reply === "hang") return new Promise<Response>(() => undefined);
      const res = response(reply.status, reply.body, reply.headers);
      const { after } = reply;
      if (after === undefined) return Promise.resolve(res);
      return new Promise<Response>((resolve) => v.clock.setTimeout(() => resolve(res), after));
    },
  });
  clock.now = () => v.clock.now();
  return { v, index, calls };
}

/** Moves the visit's clock in steps, letting each step's promises settle (the page's fetches, the poller's reads). */
async function run(v: Visit, ms: number, step = 100): Promise<void> {
  await flush();
  for (let left = ms; left > 0; left -= step) {
    v.clock.advance(Math.min(step, left));
    await flush();
  }
}

interface LogFile {
  kind: string;
  version: number;
  origin: string;
  limit: number;
  dropped: number;
  entries: FrameLogEntry[];
}

/** The frame log, as the console's h4FrameLog() gives it in a drafts build. */
function frameLog(v: Visit): LogFile {
  const fn = (v.win as unknown as { h4FrameLog?: () => string }).h4FrameLog;
  if (typeof fn !== "function") throw new Error("no h4FrameLog on the window");
  const json = fn();
  expect(typeof json).toBe("string");
  return JSON.parse(json) as LogFile;
}

const events = (log: LogFile, event: string): FrameLogEntry[] => log.entries.filter((e) => e.event === event);

/** The pause control, by its UI word. */
const pauseOf = (v: Visit, index: RoomIndex): HTMLButtonElement =>
  button(v.doc, index.ui["pause.button"] ?? "Pause the room");

describe("with the poller wired: the requests (FR-044, FR-045; T246)", () => {
  it("asks nothing before Enter, then GET /api/status at Enter and every poll interval, and nothing else", async () => {
    const { v, index, calls } = polled([]);
    expect(index.live).toMatchObject({ poll_ms: 30_000, freshness_ms: 35_000 });
    await run(v, 60_000, 1_000);
    expect(v.spies.network).toEqual([]);
    await intoRoom(v);
    expect(calls.map((c) => c.at)).toEqual([60_000]);
    await run(v, 95_000, 500);
    expect(calls.map((c) => c.at)).toEqual([60_000, 90_000, 120_000, 150_000]);
    expect(calls.every((c) => c.url === "/api/status")).toBe(true);
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      mode: "same-origin",
      credentials: "omit",
      cache: "no-store",
    });
    expect(new Set(v.spies.network)).toEqual(new Set(["fetch /api/status"]));
    expect(v.spies.beacons).toEqual([]);
    expect(v.spies.history).toEqual([]);
    expect(v.room.live.tier).toMatchObject({ tier: "local", row: 8 });
  });

  it("asks nothing while the live source is off, though the room has entered", async () => {
    const calls: string[] = [];
    const v = start({ webgl: true, frameLog: createFrameLog, fetch: (url) => (calls.push(url), Promise.reject()) });
    await intoRoom(v);
    await run(v, 120_000, 1_000);
    expect(calls).toEqual([]);
    expect(v.room.live.tier.tier).toBe("not-live");
  });
});

describe("with the poller wired: the first frame after a failure or a stale answer (SC-003; T244)", () => {
  it.each([
    ["network", "reject" as Reply, undefined],
    ["timeout", "hang" as Reply, undefined],
    ["status", { status: 404, body: "{}" } as Reply, 404],
    ["status", { status: 429, body: '{"retry_after_s": 40}', headers: { "Retry-After": "40" } } as Reply, 429],
    ["status", { status: 502, body: "{}" } as Reply, 502],
    ["shape", { status: 200, body: "[]" } as Reply, undefined],
  ])("takes the plugged case away on the first frame after a %s failure (%s)", async (why, reply, status) => {
    const { v, index, calls } = polled([OK, reply]);
    const plugged = index.switches[0]?.claims?.local;
    expect(plugged).toBeTruthy();
    await intoRoom(v);
    await run(v, 20_000);
    expect(v.room.live.tier.tier).toBe("local");
    // To the second request's end: its answer at 30 s, or its timeout at 35 s.
    for (let k = 0; k < 200 && v.room.live.tier.tier === "local"; k += 1) await run(v, 100);
    expect(calls).toHaveLength(2);
    expect(v.room.live.tier).toEqual({ tier: "unknown", row: 3, recheckAt: null });
    const applied = v.scene.applied.at(-1);
    expect(applied?.value).toBe("unknown");
    const landed = v.clock.now();
    // The result, the reduction, and the case to come, in the frame log, before the next frame.
    let log = frameLog(v);
    expect(events(log, "result").at(-1)).toMatchObject({ outcome: why, ...(status ? { status } : {}) });
    expect(events(log, "tier").at(-1)).toMatchObject({ tier: "unknown", row: 3 });
    v.clock.advance(16);
    log = frameLog(v);
    const [before, after] = events(log, "case").slice(-2);
    expect(before).toMatchObject({ pose: plugged, plugged: true, mode: "3d" });
    expect(after).toMatchObject({ plugged: false, mode: "3d", frame: (applied?.frame ?? Number.NaN) + 1 });
    expect((after?.t ?? Number.NaN) - landed).toBeLessThanOrEqual(16);
  });

  it("takes it away on the first frame at recheckAt, when a resume's request is still in flight", async () => {
    const { v, index, calls } = polled([OK, "hang"]);
    await intoRoom(v);
    pauseOf(v, index).click();
    await run(v, 29_000, 500);
    expect(v.clock.now()).toBe(34_000);
    expect(calls).toHaveLength(1);
    // Resume: reduced first (the answer at 0 is 34 s old), then a request at once, since nextAt (30 s) has passed.
    pauseOf(v, index).click();
    expect(v.room.live.tier).toEqual({ tier: "local", row: 8, recheckAt: 35_000 });
    expect(calls.map((c) => c.at)).toEqual([0, 34_000]);
    v.clock.advance(1_000);
    expect(v.room.live.tier).toEqual({ tier: "unknown", row: 4, recheckAt: null });
    const log = frameLog(v);
    expect(events(log, "tier").at(-1)).toMatchObject({ tier: "unknown", row: 4, t: 35_000 });
    const left = events(log, "case").at(-1);
    expect(left).toMatchObject({ plugged: false, mode: "3d" });
    expect(left?.t).toBeGreaterThanOrEqual(35_000);
    expect((left?.t ?? Number.NaN) - 35_000).toBeLessThan(16);
    expect(events(log, "case").at(-2)).toMatchObject({ plugged: true });
  });
});

describe("with the poller wired: pause and hide with an answer in flight (FR-042, FR-060; T244)", () => {
  for (const how of ["pause", "hide"] as const) {
    const set = (p: Polled, on: boolean): void => {
      if (how === "hide") setHidden(p.v.win, on);
      else if (p.v.room.motion.paused !== on) pauseOf(p.v, p.index).click();
    };

    for (const webgl of [true, false])
      it(`leaves the tier paused when the answer lands, asks nothing while ${how === "pause" ? "paused" : "hidden"}, and reduces before the next frame on return, in ${webgl ? "3D" : "2D"}`, async () => {
        const p = polled([OK, { status: 200, body: JSON.stringify(VALID), after: 2_000 }], { webgl });
        const { v, calls } = p;
        await intoRoom(v);
        await run(v, 26_000);
        expect(calls.map((c) => c.at)).toEqual([0, 30_000]);
        set(p, true);
        expect(v.room.live.tier.tier).toBe("paused");
        await run(v, 1_000);
        // The answer in flight landed at 32 s: recorded, and paused still wins.
        let log = frameLog(v);
        expect(events(log, "result").at(-1)).toMatchObject({ outcome: "ok", status: 200, t: 32_000 });
        expect(v.room.live.tier.tier).toBe("paused");
        await run(v, 10 * 60_000, 1_000);
        expect(calls).toHaveLength(2);
        expect(v.room.live.tier.tier).toBe("paused");
        // Return: the tier reduced first, by FR-041's table (the answer is 10 minutes old: unknown), then one request.
        const frames = v.scene.frames;
        const returned = v.clock.now();
        set(p, false);
        expect(calls.map((c) => c.at)).toEqual([0, 30_000, returned]);
        expect(v.room.live.tier).toEqual({ tier: "unknown", row: 4, recheckAt: null });
        if (webgl) expect(v.scene.applied.at(-1)).toEqual({ value: "unknown", frame: frames, at: returned });
        await run(v, 100);
        expect(v.room.live.tier.tier).toBe("local");
        // The frame log: no plugged case between the pause or hide and its return.
        log = frameLog(v);
        const off = how === "pause" ? "pause" : "hide";
        const on = how === "pause" ? "resume" : "show";
        const from = events(log, off).at(-1)?.t ?? Number.NaN;
        const to = events(log, on).at(-1)?.t ?? Number.NaN;
        expect(to).toBe(returned);
        // In 3D the shared case is first drawn on the frame after the pause or hide; in 2D it is applied with it.
        const shown = events(log, "case").filter((e) => e.t >= from && e.t < to);
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.every((e) => e.plugged === false)).toBe(true);
        expect(
          events(log, "case")
            .filter((e) => e.t < from)
            .at(-1),
        ).toMatchObject({ plugged: true });
        const paused = events(log, off).at(-1);
        expect(shown[0]).toMatchObject(
          webgl ? { mode: "3d", frame: (paused?.frame ?? Number.NaN) + 1 } : { mode: "2d", t: from },
        );
      });
  }
});

describe("the frame log (R-70; contracts/tier-signal.md §6; T246)", () => {
  it("logs Enter, each request and its result, each reduction, pause, resume, hide, show, and each fallback cue", async () => {
    const { v, index } = polled([OK, { status: 503, body: "{}" }]);
    await intoRoom(v);
    await run(v, 30_000);
    pauseOf(v, index).click();
    pauseOf(v, index).click();
    setHidden(v.win, true);
    setHidden(v.win, false);
    await run(v, 100);
    v.room.live.fallbackReply();
    const log = frameLog(v);
    expect(log).toMatchObject({ kind: FRAME_LOG_KIND, version: 1, origin: "http://127.0.0.1:18105", limit: 10_000 });
    expect(FRAME_LOG_KIND).toBe("h4-frame-log");
    expect(FRAME_LOG_LIMIT).toBe(10_000);
    for (const entry of log.entries) {
      expect(Number.isFinite(entry.t)).toBe(true);
      expect(entry.wall).toBe(WALL0 + entry.t);
      expect(Number.isInteger(entry.frame)).toBe(true);
      expect(typeof entry.event).toBe("string");
    }
    const kinds = log.entries.map((e) => e.event);
    for (const event of ["enter", "request", "result", "tier", "case", "pause", "resume", "hide", "show", "fallback"])
      expect(kinds, event).toContain(event);
    expect(events(log, "enter")).toEqual([
      expect.objectContaining({ t: 0, source: "site", poll_ms: 30_000 }) as unknown,
    ]);
    expect(events(log, "request").map((e) => e.t)).toEqual([0, 30_000]);
    expect(events(log, "result").map((e) => [e.outcome, e.status])).toEqual([
      ["ok", 200],
      ["status", 503],
    ]);
    expect(events(log, "fallback")).toHaveLength(1);
    expect(events(log, "tier").at(-1)).toMatchObject({ tier: "unknown", row: 3 });
    // In order: Enter before its request, each request before its result, and every entry in time order.
    expect(kinds.indexOf("enter")).toBeLessThan(kinds.indexOf("request"));
    expect(kinds.indexOf("request")).toBeLessThan(kinds.indexOf("result"));
    const ts = log.entries.map((e) => e.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it("logs each new case in 3D with the frame that first drew it, and only a new one", async () => {
    const { v, index } = polled([]);
    await intoRoom(v);
    const sw = index.switches[0];
    const log = frameLog(v);
    const cases = events(log, "case");
    // The answer at Enter may land before or after the stage is made, so the shared case may or may not come first.
    expect(cases.at(-1)).toMatchObject({ switch: sw?.id, pose: sw?.claims?.local, plugged: true, mode: "3d" });
    for (const entry of cases.slice(0, -1))
      expect(entry).toMatchObject({ switch: sw?.id, pose: caseFor(sw ?? { cases: {} }, "unknown"), plugged: false });
    // Drawn first on the frame after it was applied.
    const local = v.scene.applied.filter((a) => a.value === "local").at(-1);
    expect(cases.at(-1)?.frame).toBe((local?.frame ?? Number.NaN) + 1);
    // Reductions that keep the case log no case.
    const count = cases.length;
    await run(v, 60_000);
    expect(events(frameLog(v), "case")).toHaveLength(count);
    expect(events(frameLog(v), "tier").length).toBeGreaterThan(events(log, "tier").length);
  });

  it("logs each new case in 2D at the time it was applied", async () => {
    const { v, index } = polled([OK, "reject"], { webgl: false });
    await intoRoom(v);
    await run(v, 30_000);
    const cases = events(frameLog(v), "case");
    expect(cases.length).toBeGreaterThan(1);
    expect(cases.every((e) => e.mode === "2d")).toBe(true);
    expect(cases.at(-2)).toMatchObject({ pose: index.switches[0]?.claims?.local, plugged: true });
    // The failure at 30 s: applied, and so logged, at that time.
    expect(cases.at(-1)).toMatchObject({ plugged: false, t: 30_000 });
  });

  it("keeps the newest 10,000 entries in page memory, and says how many it dropped", () => {
    const clock = new FakeClock();
    const log = createFrameLog({ clock, wall: () => WALL0 + clock.now(), origin: "http://127.0.0.1:18105" });
    for (let k = 0; k < FRAME_LOG_LIMIT + 5; k += 1) {
      clock.advance(1, 1_000_000);
      log.record("tier", { tier: "unknown", row: 3, k });
    }
    const file = JSON.parse(log.json()) as LogFile;
    expect(file.entries).toHaveLength(FRAME_LOG_LIMIT);
    expect(file.dropped).toBe(5);
    expect(file.entries[0]).toMatchObject({ k: 5, t: 6, wall: WALL0 + 6, frame: 0, event: "tier" });
    expect(file.entries.at(-1)).toMatchObject({ k: FRAME_LOG_LIMIT + 4 });
  });

  it("counts frames, and logs a 3D case only on the frame after it was applied, the last applied winning", () => {
    const clock = new FakeClock();
    const log = createFrameLog({ clock, wall: () => WALL0 + clock.now(), origin: "o" });
    log.frame(16);
    log.applied("sw", "a", false, "3d");
    log.applied("sw", "b", true, "3d");
    expect(JSON.parse(log.json()).entries).toEqual([]);
    clock.advance(32, 1_000_000);
    log.frame(32);
    log.frame(48);
    log.applied("sw", "b", true, "3d");
    log.frame(64);
    log.applied("sw", "b", true, "2d");
    const entries = (JSON.parse(log.json()) as LogFile).entries;
    expect(entries).toEqual([
      { t: 32, wall: WALL0 + 32, frame: 2, event: "case", switch: "sw", pose: "b", plugged: true, mode: "3d" },
      { t: 32, wall: WALL0 + 32, frame: 4, event: "case", switch: "sw", pose: "b", plugged: true, mode: "2d" },
    ]);
  });

  it("exposes h4FrameLog() on the window in a drafts build, and a room without the log has none", async () => {
    const { v } = polled([]);
    await intoRoom(v);
    expect(Array.isArray(frameLog(v).entries)).toBe(true);
    const release = polled([], { log: false });
    await intoRoom(release.v);
    expect("h4FrameLog" in release.v.win).toBe(false);
    expect(release.v.spies.storage).toEqual([]);
  });
});
