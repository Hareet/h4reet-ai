// The tier signal (spec 004; FR-041 to FR-043, SC-003; Confirmation 9; R-30; contracts/tier-signal.md §2 to §4;
// data-model.md §11.1): what the laptop and its charger show, reduced by one pure function from what the page knows.
// Pure TypeScript, with no DOM or Three.js, in the entry chunk, so the 2D room and the text copy read it as the 3D room
// does. Three parts:
// - reduceTier, FR-041's table: rows tried in order, the first that matches winning, with the instant the last valid
//   answer turns stale, `recheckAt`, so the live controller (live.ts) re-reduces then, and the plugged pose leaves on
//   the first frame after a stale answer (SC-003);
// - causeClass, row 6's map, which the talk panel's "can't talk" messages share (src/talk/messages.ts's cannotTalkFor),
//   so the laptop and the conversation never disagree about a cause (§4);
// - caseFor, the runtime's claims rule (§2; contracts/room-bundle.md §3.1): whatever a bundle maps, the pose the
//   switch's claims give `local` shows only for `local`, and the one they give `cloud` only for `cloud`; any other
//   mapping falls to the shared pose, and claims that aren't whole read as not-live, so a faulty bundle can neither
//   plug the laptop in nor leave the room blank (FR-043, FR-062). A switch without claims has no plugged pose and
//   draws its cases as they are.
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
  // Spec 010's Amendment 2-1: the paid fallback's monthly cap.
  "adapter_month_spent",
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

/** A switch as the claims rule reads it: the index's `cases`, and its `claims` where its piece declares them
 *  (contracts/room-bundle.md §3.1). The claims come from a bundle, so the rule checks them whatever their type says. */
export interface SwitchRule {
  readonly cases: Readonly<Partial<Record<TierValue, string>>>;
  readonly claims?: { readonly local: string; readonly cloud: string };
}

/** The poses a switch's claims give local and cloud, and every pose they name; `whole` where they are what RS3
 *  requires: a pose for each, two different poses that the cases name. */
function claimsOf(sw: SwitchRule): {
  whole: boolean;
  local: string | undefined;
  cloud: string | undefined;
  named: ReadonlySet<string>;
} {
  const claims: unknown = sw.claims;
  const pose = (key: "local" | "cloud"): string | undefined => {
    if (claims === null || typeof claims !== "object" || !Object.hasOwn(claims, key)) return undefined;
    const value: unknown = (claims as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  };
  const [local, cloud] = [pose("local"), pose("cloud")];
  const named = new Set([local, cloud].filter((p): p is string => p !== undefined));
  const shown = new Set<unknown>(Object.values(sw.cases));
  const whole = local !== undefined && cloud !== undefined && local !== cloud && shown.has(local) && shown.has(cloud);
  return { whole, local, cloud, named };
}

/** The pose most of SHARED_ORDER's cases name among the poses `free` lets through, ties going to the earliest value's;
 *  null where none does. RS4's shared pose, at run time. */
function mostShown(
  own: (v: TierValue) => string | undefined,
  free: (pose: string | undefined) => pose is string,
): string | null {
  const count = new Map<string, number>();
  for (const v of SHARED_ORDER) {
    const pose = own(v);
    if (free(pose)) count.set(pose, (count.get(pose) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [pose, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = pose;
  return best;
}

/**
 * The pose a switch shows for a tier value, whatever its cases map (FR-043, FR-062). The plugged and the cloud poses
 * are the ones the switch's claims give `local` and `cloud`, never read from its cases: `local` shows the first and
 * `cloud` the second; any other value its own case, unless that names either, or a pose the room doesn't draw, or
 * none; then the shared pose, the first of SHARED_ORDER's cases that names a drawn pose the claims don't name. Claims
 * that lack `local` or `cloud`, name a pose the cases don't, or name one pose for both read as not-live: every value,
 * `local` and `cloud` included, shows the shared pose as RS4 picks it, the unnamed drawn pose most of the six values
 * show, ties to the earliest of SHARED_ORDER. A switch without claims has no plugged pose, so each value
 * shows its own case, and the shared pose only where that is missing or not drawn. Null where no such pose exists,
 * which the compositor's RS rules refuse.
 */
export function caseFor(
  sw: SwitchRule,
  value: TierValue,
  drawn: (pose: string) => boolean = () => true,
): string | null {
  const { cases } = sw;
  const own = (v: TierValue): string | undefined => (Object.hasOwn(cases, v) ? cases[v] : undefined);
  const claimless = !Object.hasOwn(sw, "claims") || sw.claims === undefined;
  const claims = claimless ? null : claimsOf(sw);
  const free = (pose: string | undefined): pose is string =>
    typeof pose === "string" && drawn(pose) && !(claims?.named.has(pose) ?? false);
  // Claims present but not whole read as not-live: every value shows the shared pose RS4 would name, the drawn pose the
  // claims don't name that most of the six values show, ties going to the earliest of SHARED_ORDER. Never just the first
  // case, which a swapped bundle may point at the plugged pose (the delta review of T163, I1).
  if (claims !== null && !claims.whole) return mostShown(own, free);
  if (claims?.whole && (value === "local" || value === "cloud")) {
    const pose = claims[value];
    if (pose !== undefined && drawn(pose)) return pose;
  } else {
    const mine = own(value);
    if (free(mine)) return mine;
  }
  for (const v of SHARED_ORDER) {
    const pose = own(v);
    if (free(pose)) return pose;
  }
  return null;
}
