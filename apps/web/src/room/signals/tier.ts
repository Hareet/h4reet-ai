// The tier signal (spec 004; FR-041 to FR-043, SC-003; Confirmation 9; R-30; contracts/tier-signal.md §2 to §4;
// data-model.md §11.1): what the laptop and its charger show, reduced by one pure function from what the page knows.
// Pure TypeScript, with no DOM or Three.js, in the entry chunk, so the 2D room and the text copy read it as the 3D room
// does. Three parts:
// - reduceTier, FR-041's table: rows tried in order, the first that matches winning, with the instant the last valid
//   answer turns stale, `recheckAt`, so the live controller (live.ts) re-reduces then, and the plugged pose leaves on
//   the first frame after a stale answer (SC-003);
// - causeClass, row 6's map, which the talk panel's "can't talk" messages share (src/talk/messages.ts's cannotTalkFor),
//   so the laptop and the conversation never disagree about a cause (§4);
// - caseFor, the runtime's claims rule (§2): whatever a bundle maps, the pose `local`'s case names shows only for
//   `local`, and the pose `cloud`'s only for `cloud`; any other mapping falls to the shared pose, so a faulty bundle can
//   neither plug the laptop in nor leave the room blank (FR-043, FR-062).
// The tier gates nothing: the room renders in full whatever it reads, and the talk panel decides from its own turn.
import type { TierValue } from "../compose/vocabulary";

export type { TierValue };

/** The three fields the room reads from GET /api/status; tunnel, release, time, request_id, and any later field are
 *  ignored. */
export interface StatusAnswer {
  readonly local_tier: string;
  readonly state: string;
  readonly cause_now: string | null;
}

/** How a status request failed (§5.2). */
export type StatusFailure = "network" | "timeout" | "status" | "shape";

/** A completed status request: `started` and `ended` on the room's Clock, `endedWall` on the wall clock. */
export type StatusResult =
  | {
      readonly ok: true;
      readonly started: number;
      readonly ended: number;
      readonly endedWall: number;
      readonly answer: StatusAnswer;
    }
  | {
      readonly ok: false;
      readonly started: number;
      readonly ended: number;
      readonly endedWall: number;
      readonly why: StatusFailure;
      readonly status?: number;
      readonly retryAfterMs?: number;
    };

export interface TierInputs {
  /** live.source. */
  readonly live: "off" | "site";
  /** "Pause the room" (FR-060). */
  readonly paused: boolean;
  /** The page isn't visible (§5.4). */
  readonly hidden: boolean;
  /** The room's Clock: monotonic milliseconds. */
  readonly now: number;
  /** The wall clock: milliseconds since the epoch. */
  readonly wallNow: number;
  /** live.freshness_ms. */
  readonly freshnessMs: number;
  /** The last completed status request; null before the first completes. */
  readonly last: StatusResult | null;
  /** The Clock's time of the last turn reply whose route was "fallback". */
  readonly fallbackReplyAt: number | null;
}

export type TierRow = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface TierReading {
  readonly tier: TierValue;
  readonly row: TierRow;
  /** When the last valid answer turns stale, on the room's Clock, wherever rows 5 to 10 decided; null otherwise. */
  readonly recheckAt: number | null;
}

/** FR-041's table (§3). Rows 4 to 10 are reached only when the last completed request was valid, so `last` is the last
 *  valid answer there; its age is the larger of its monotonic and wall-clock ages, so a device that slept, or a wall
 *  clock moved forward, can't make an old answer look fresh, and one moved back changes nothing. */
export function reduceTier(inputs: TierInputs): TierReading {
  const { last } = inputs;
  if (inputs.live === "off") return { tier: "not-live", row: 1, recheckAt: null };
  if (inputs.paused || inputs.hidden) return { tier: "paused", row: 2, recheckAt: null };
  if (last === null || !last.ok) return { tier: "unknown", row: 3, recheckAt: null };
  const age = Math.max(inputs.now - last.ended, inputs.wallNow - last.endedWall);
  if (!(age < inputs.freshnessMs)) return { tier: "unknown", row: 4, recheckAt: null };
  const recheckAt = inputs.now + inputs.freshnessMs - age;
  const { answer } = last;
  if (answer.state === "unknown") return { tier: "unknown", row: 5, recheckAt };
  if (answer.cause_now !== null) return { tier: causeClass(answer.cause_now), row: 6, recheckAt };
  // A reply that answered while this answer's request was already on its way may predate the failover it reports, so
  // it counts as after (§3's reading of FR-041's "after"): only ever cloud where the literal reading shows local.
  if (inputs.fallbackReplyAt !== null && inputs.fallbackReplyAt > last.started)
    return { tier: "cloud", row: 7, recheckAt };
  if (answer.state === "normal" && answer.local_tier === "up") return { tier: "local", row: 8, recheckAt };
  if (answer.state === "normal" && answer.local_tier === "down") return { tier: "cloud", row: 9, recheckAt };
  return { tier: "unknown", row: 10, recheckAt };
}

// ---- The cause classes (§4) ----

export type CauseClass = "resting" | "budget" | "unavailable";

/** Spec 000's causes for "the local tier is resting" (spec 002's room-conversation contract §3). */
export const RESTING_CAUSES: readonly string[] = [
  "local_unhealthy",
  "local_error",
  "no_fallback_in_stack",
  "fallback_unavailable",
];

/** Spec 000's causes for "today's budget is used"; a kill-switch trip follows a ceiling, so it counts here. */
export const BUDGET_CAUSES: readonly string[] = [
  "meter_at_ceiling",
  "fallback_spent_today",
  "fallback_awaiting_renewal",
  "kill_switch_tripped",
];

/** A cause's class: resting, budget, or, for any other cause, one the room doesn't know (the relay's
 *  no_path_available among them), and none at all, unavailable. */
export function causeClass(cause: string | null | undefined): CauseClass {
  if (typeof cause !== "string") return "unavailable";
  if (RESTING_CAUSES.includes(cause)) return "resting";
  if (BUDGET_CAUSES.includes(cause)) return "budget";
  return "unavailable";
}

// ---- The claims rule (§2) ----

/** The values whose cases may name the shared pose, in the order the rule looks for it: unknown's first, then the
 *  other values that claim nothing. */
export const SHARED_ORDER: readonly TierValue[] = ["unknown", "not-live", "paused", "resting", "budget", "unavailable"];

/**
 * The pose a switch shows for a tier value, whatever its cases map (FR-043, FR-062): the value's own case, unless it
 * names the pose `local`'s case names and the value isn't `local`, or the pose `cloud`'s and the value isn't `cloud`,
 * or a pose the room doesn't draw, or none; then the shared pose, the first of SHARED_ORDER's cases that names a drawn
 * pose claiming neither. Null where no such pose exists, which the compositor's RS rules refuse.
 */
export function caseFor(
  cases: Readonly<Partial<Record<TierValue, string>>>,
  value: TierValue,
  drawn: (pose: string) => boolean = () => true,
): string | null {
  const own = (v: TierValue): string | undefined => (Object.hasOwn(cases, v) ? cases[v] : undefined);
  const [plugged, cloud] = [own("local"), own("cloud")];
  const shows = (pose: string | undefined, v: TierValue): pose is string =>
    pose !== undefined && drawn(pose) && (pose !== plugged || v === "local") && (pose !== cloud || v === "cloud");
  const mine = own(value);
  if (shows(mine, value)) return mine;
  for (const v of SHARED_ORDER) {
    const pose = own(v);
    if (shows(pose, "unknown")) return pose;
  }
  return null;
}
