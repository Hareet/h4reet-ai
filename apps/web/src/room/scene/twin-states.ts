// The twin's states (spec 016; FR-019 to FR-024; plan.md R-08; contracts/twin-states.md §2): the closed lists the scene's
// twin block, the compositor, and the room share, and the state machine. Pure: it reads only the clock's milliseconds it
// is given and imports nothing from three.js, so the 2D room and the build can import its lists without the 3D chunk,
// and a test drives it on numbers alone.

/** The twin's clip roles, by their files' names under assets/twin/, in the closed list's order (FR-009). */
export const TWIN_CLIP_ROLES = ["idle", "talking", "listening", "greeting", "desk-lean"] as const;
export type TwinClipRole = (typeof TWIN_CLIP_ROLES)[number];

/** The twin's states, in FR-021's order of precedence. */
export const TWIN_STATES = ["arriving", "answering", "listening", "resting", "present"] as const;
export type TwinState = (typeof TWIN_STATES)[number];

/** The state-to-clip map's defaults (FR-020; Clarifications, Q1): the greeting, talking, listening, the lean, the idle. */
export const TWIN_CLIPS_DEFAULT: Readonly<Record<TwinState, TwinClipRole>> = Object.freeze({
  arriving: "greeting",
  answering: "talking",
  listening: "listening",
  resting: "desk-lean",
  present: "idle",
});

export const isTwinClipRole = (value: string): value is TwinClipRole =>
  (TWIN_CLIP_ROLES as readonly string[]).includes(value);
export const isTwinState = (value: string): value is TwinState => (TWIN_STATES as readonly string[]).includes(value);

/** What the twin's states read from the conversation, and nothing else (FR-022; contracts/twin-states.md §1): whether
 *  the text box holds unsent text, a turn's going and ending, an answer's arrival with its words, and a selection. */
export type TwinActivity =
  | { readonly kind: "draft"; readonly holds: boolean }
  | { readonly kind: "turn"; readonly out: boolean }
  | { readonly kind: "answer"; readonly words: number }
  | { readonly kind: "selected" };

/** The block's timings the states take (contracts/twin-data.md §1). */
export interface TwinTimings {
  readonly rest_after_s: number;
  readonly speak_wpm: number;
  readonly speak_s: readonly [number, number];
}

export interface TwinStates {
  /** The arrival: the hand-off's start where the twin shows then, else its first show; once a visit. `length_s` is the
   *  greeting clip's length. */
  arrive(now: number, length_s: number): void;
  /** The greeting clip has finished playing: arriving ends at once, whatever the clock says (§3). */
  arrived(now: number): void;
  signal(activity: TwinActivity, now: number): void;
  /** Moves the timers on; returns the state now. */
  tick(now: number): TwinState;
  readonly state: TwinState;
}

/**
 * The twin's state machine (FR-021; plan.md R-08; contracts/twin-states.md §2): the first state that holds, in order:
 * arriving, for one play of the greeting from `arrive`, once a visit; answering, from an answer for its speaking time,
 * its words at `speak_wpm` within `speak_s`, a later answer restarting it; listening, while the last draft held text
 * or the last turn is out; resting, from `rest_after_s` after the last moment any of those held or a selection came,
 * until a draft with text, a turn going, a selection, or an answer; present otherwise. Times are the room's clock's,
 * in milliseconds; it reads no other clock and no DOM, and runs whether or not the motion store animates (FR-024).
 */
export function createTwinStates(block: TwinTimings): TwinStates {
  const [least, most] = block.speak_s;
  let arrival: { from: number; until: number } | null = null;
  let arrivedOnce = false;
  let answerUntil = -Infinity;
  let drafting = false;
  let turnOut = false;
  /** The last moment arriving, answering, or listening held, or a selection came: the quiet counts from it. */
  let busy = 0;
  let state: TwinState = "present";

  const arriving = (now: number): boolean => arrival !== null && now >= arrival.from && now < arrival.until;
  const answering = (now: number): boolean => now < answerUntil;
  const listening = (): boolean => drafting || turnOut;

  /** The busy moment moved on to what held until `now`: a greeting's or an answer's end, or now while listening. */
  const settle = (now: number): void => {
    if (arrival !== null) busy = Math.max(busy, Math.min(now, arrival.until));
    if (Number.isFinite(answerUntil)) busy = Math.max(busy, Math.min(now, answerUntil));
    if (listening()) busy = Math.max(busy, now);
  };

  const compute = (now: number): TwinState => {
    settle(now);
    if (arriving(now)) return "arriving";
    if (answering(now)) return "answering";
    if (listening()) return "listening";
    if (now - busy >= block.rest_after_s * 1000) return "resting";
    return "present";
  };

  return {
    arrive(now, length_s) {
      if (arrivedOnce) return;
      arrivedOnce = true;
      arrival = { from: now, until: now + Math.max(0, length_s) * 1000 };
      state = compute(now);
    },
    arrived(now) {
      if (arrival !== null && now < arrival.until) arrival = { from: arrival.from, until: now };
      state = compute(now);
    },
    signal(activity, now) {
      settle(now);
      switch (activity.kind) {
        case "draft":
          drafting = activity.holds;
          if (activity.holds) busy = Math.max(busy, now);
          break;
        case "turn":
          turnOut = activity.out;
          if (activity.out) busy = Math.max(busy, now);
          break;
        case "answer": {
          const seconds = Math.min(most, Math.max(least, (activity.words * 60) / block.speak_wpm));
          answerUntil = now + seconds * 1000;
          busy = Math.max(busy, now);
          break;
        }
        case "selected":
          busy = Math.max(busy, now);
          break;
      }
      state = compute(now);
    },
    tick(now) {
      state = compute(now);
      return state;
    },
    get state() {
      return state;
    },
  };
}
