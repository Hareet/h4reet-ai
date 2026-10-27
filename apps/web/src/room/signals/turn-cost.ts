// The turn-cost channel (spec 004; FR-047 to FR-050; R-32; contracts/turn-cost.md §3 to §6; data-model.md §11.2): the
// neon sign's counters, "this call" and "this visit", from each conversation turn's own reply and nothing else.
// - classifyTurn sorts how a sent turn ended (§3): a 200 is a reply, carrying its body's `route` and `cost_micro_usd`
//   as found; a 503 with spec 000's degraded body, degraded; 400 to 499, 429 included, refused; any other status or a
//   network error, failed; an abort or a body that failed to read or parse, lost.
// - A reply is valid (§4) only with `route` exactly "local" or "fallback" and a safe integer cost of at least 0, so the
//   gateway's dev-only "metered", a cost sent as a string, a fraction, and anything past 2^53 − 1 read invalid.
// - createCostChannel applies FR-048's table (§5) in page memory: the visit's total a bigint of micro-dollars, each
//   valid cost added exactly; "at least" set by a turn with no valid cost and kept until the page reloads, which makes
//   a new channel; a refused turn changing nothing; and, while the live configuration has no turn route, nothing.
// - Every 200 reply from a turn whose route is "fallback", valid cost or not, calls onFallbackReply with the room
//   Clock's time: row 7's cue, which the live controller passes to the tier (tier-signal.md §6). A fixture never does.
// - costReadings words the state with the index's UI words: amounts formatted with integer arithmetic ($, the
//   micro-dollars ÷ 1,000,000, a point, the remainder in six digits); "est." once paid; a call of $100 or more "cost
//   unavailable" and a visit of $100 or more "at least $99.999999 est.", which the counters' grid holds (RT8); and a
//   badge beside each amount: "Sample" from a fixture, else "test" in a drafts build (FR-049).
// Pure, and in the entry chunk: it makes no request of any kind and touches no storage, cookie, or URL (FR-047, FR-050).
// Its state never reaches the turn request, the twin, or the announcer (FR-038).
import type { Clock } from "../clock";
import { uiWord } from "../ui-keys";

/** How one sent turn ended, as the talk panel reports it (§7): the whole body, parsed, or for a stream its final
 *  frame; or an error before (`network`) or after the request went (`aborted`, `body`). */
export type TurnResult =
  | { readonly kind: "response"; readonly status: number; readonly body: unknown }
  | { readonly kind: "error"; readonly error: "network" | "aborted" | "body" };

/** What a turn's end means for its cost (§3). */
export type TurnOutcome =
  | { readonly kind: "reply"; readonly route: unknown; readonly cost_micro_usd: unknown }
  /** The cause, for the talk panel's own message (§7). */
  | { readonly kind: "degraded"; readonly cause: string }
  | { readonly kind: "failed" }
  | { readonly kind: "lost" }
  | { readonly kind: "refused"; readonly status: number };

/** "this call": before the route exists, before the first turn, a local reply costing 0, a paid one, or none valid. */
export type CallReading = "unconfigured" | "no-call-yet" | "local-zero" | { readonly paid: bigint } | "unavailable";

export interface CostState {
  /** The live configuration's `turn` is `site`. */
  readonly configured: boolean;
  readonly call: CallReading;
  /** What fed the current call reading. */
  readonly callFrom: "turn" | "fixture" | null;
  readonly visitMicro: bigint;
  /** The total includes a paid reply, so it reads "est.". */
  readonly visitPaid: boolean;
  /** Set by a turn with no valid cost; cleared only by a reload. */
  readonly visitAtLeast: boolean;
  /** A fixture fed the total. */
  readonly visitSample: boolean;
}

export interface CostChannel {
  /** Applies §5's table to one outcome, then notifies each subscriber once; while not configured, nothing at all. */
  report(outcome: TurnOutcome, from: "turn" | "fixture"): void;
  readonly state: CostState;
  /** Called with each new state; returns what unsubscribes. */
  subscribe(listener: (state: CostState) => void): () => void;
  /** Row 7's cue: called with the Clock's time for each fallback reply from a turn; returns what unsubscribes. */
  onFallbackReply(listener: (at: number) => void): () => void;
}

/** A reading's badge: "test" in a drafts build, "Sample" for a fixture's figure (FR-049). */
export interface CostBadge {
  readonly kind: "test" | "sample";
  readonly text: string;
}

/** One counter's words, and its badge beside the amount, or none. */
export interface CostReading {
  readonly text: string;
  readonly badge: CostBadge | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** §3's table. */
export function classifyTurn(result: TurnResult): TurnOutcome {
  if (result.kind === "error") return result.error === "network" ? { kind: "failed" } : { kind: "lost" };
  const { status, body } = result;
  if (status === 200) {
    return isObject(body)
      ? { kind: "reply", route: body.route, cost_micro_usd: body.cost_micro_usd }
      : { kind: "reply", route: undefined, cost_micro_usd: undefined };
  }
  if (status === 503 && isObject(body) && body.state === "degraded" && typeof body.cause === "string")
    return { kind: "degraded", cause: body.cause };
  if (status >= 400 && status <= 499) return { kind: "refused", status };
  return { kind: "failed" };
}

/** §4: route exactly "local" or "fallback", and a safe integer cost of at least 0. */
export function isValidReply(outcome: Extract<TurnOutcome, { kind: "reply" }>): boolean {
  const { route, cost_micro_usd: cost } = outcome;
  return (
    (route === "local" || route === "fallback") && typeof cost === "number" && Number.isSafeInteger(cost) && cost >= 0
  );
}

const MICRO = 1_000_000n;
/** $100 in micro-dollars: the first amount the counters' grid doesn't hold (§5). */
const LIMIT = 100n * MICRO;

/** An amount: `$`, the micro-dollars ÷ 1,000,000, a point, then the remainder in six digits, in integer arithmetic. */
export function formatMicro(micro: bigint): string {
  return `$${String(micro / MICRO)}.${String(micro % MICRO).padStart(6, "0")}`;
}

/** A fresh state, as a new channel starts, and what a counter reads before any report. */
export function initialCostState(configured: boolean): CostState {
  return {
    configured,
    call: configured ? "no-call-yet" : "unconfigured",
    callFrom: null,
    visitMicro: 0n,
    visitPaid: false,
    visitAtLeast: false,
    visitSample: false,
  };
}

/** One outcome applied to a state (§5's table); a refused turn, or any while not configured, changes nothing. */
function apply(state: CostState, outcome: TurnOutcome, from: "turn" | "fixture"): CostState {
  if (!state.configured || outcome.kind === "refused") return state;
  const sample = state.visitSample || from === "fixture";
  if (outcome.kind !== "reply" || !isValidReply(outcome)) {
    return { ...state, call: "unavailable", callFrom: from, visitAtLeast: true, visitSample: sample };
  }
  const cost = BigInt(outcome.cost_micro_usd as number);
  const localZero = outcome.route === "local" && cost === 0n;
  return {
    ...state,
    call: localZero ? "local-zero" : { paid: cost },
    callFrom: from,
    visitMicro: state.visitMicro + cost,
    visitPaid: state.visitPaid || !localZero,
    visitSample: sample,
  };
}

export function createCostChannel(options: { configured: boolean; clock: Pick<Clock, "now"> }): CostChannel {
  let state = initialCostState(options.configured);
  const listeners = new Set<(state: CostState) => void>();
  const cues = new Set<(at: number) => void>();
  return {
    get state() {
      return state;
    },
    report(outcome, from) {
      if (!state.configured) return;
      state = apply(state, outcome, from);
      // Row 7's cue: a turn's 200 by the fallback, whatever its cost says; never a fixture's.
      if (from === "turn" && outcome.kind === "reply" && outcome.route === "fallback") {
        const at = options.clock.now();
        for (const cue of [...cues]) cue(at);
      }
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onFallbackReply(listener) {
      cues.add(listener);
      return () => cues.delete(listener);
    },
  };
}

/** The UI words a reading takes, and whether the build is a drafts build. */
export interface CostWords {
  readonly ui: Readonly<Record<string, string>>;
  readonly drafts: boolean;
}

/** The two counters' readings, in the index's UI words; a counter whose word the index lacks reads null. */
export function costReadings(
  state: CostState,
  words: CostWords,
): { call: CostReading | null; visit: CostReading | null } {
  const { ui } = words;
  const plain = (text: string | null): CostReading | null => (text === null ? null : { text, badge: null });
  if (!state.configured) {
    const unavailable = plain(uiWord(ui, "sign.unavailable"));
    return { call: unavailable, visit: unavailable };
  }
  /** The badge beside an amount: "Sample" from a fixture, else "test" in a drafts build, else none. */
  const badge = (sample: boolean): CostBadge | null => {
    const kind = sample ? "sample" : words.drafts ? "test" : null;
    const text = kind === null ? null : uiWord(ui, kind === "sample" ? "sign.sample" : "sign.test");
    return kind === null || text === null ? null : { kind, text };
  };
  const amount = (text: string | null, sample: boolean): CostReading | null =>
    text === null ? null : { text, badge: badge(sample) };
  const estimated = (micro: bigint): string | null => uiWord(ui, "sign.estimated", { amount: formatMicro(micro) });

  let call: CostReading | null;
  const fixture = state.callFrom === "fixture";
  if (state.call === "unconfigured" || state.call === "unavailable") call = plain(uiWord(ui, "sign.unavailable"));
  else if (state.call === "no-call-yet") call = plain(uiWord(ui, "sign.no_call_yet"));
  else if (state.call === "local-zero") call = amount(uiWord(ui, "sign.local", { amount: "$0" }), fixture);
  else if (state.call.paid >= LIMIT) call = plain(uiWord(ui, "sign.unavailable"));
  else call = amount(estimated(state.call.paid), fixture);

  let visit: string | null;
  if (state.visitMicro >= LIMIT) {
    const most = estimated(LIMIT - 1n);
    visit = most === null ? null : uiWord(ui, "sign.at_least", { amount: most });
  } else {
    const sum = state.visitPaid
      ? estimated(state.visitMicro)
      : state.visitMicro === 0n
        ? "$0"
        : formatMicro(state.visitMicro);
    visit = sum === null || !state.visitAtLeast ? sum : uiWord(ui, "sign.at_least", { amount: sum });
  }
  return { call, visit: amount(visit, state.visitSample) };
}
