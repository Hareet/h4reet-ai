// Alert text (contracts/alerts.md §3, §5): plain text, UTF-8, at most 1,000 characters.
//
//   <prefix> <HEADLINE>: <one-line summary>
//   Daily: <spent> / <ceiling> USD (warning <w>) · Month: … · Fallback today: <spent> / <allowance> (grant <n>)
//   Runtime: <state> · Fallback: <state> · <time> · id <dedupe key>
//   <one fixed sentence for the kind, where it has one>
//   Runbook: docs/runbooks/<page>.md
//
// It renders from typed facts: numbers, states, times, the dedupe key, the operator's fingerprint, and an adapter's
// ID and label, with no field a payload, a client label, the operator's reason, or a secret could arrive through
// (§5). Telegram gets the whole text; email gets line 1 as its subject and the whole text as its body.
//
// Nothing here names a provider (SC-006): an adapter-specific alert takes the adapter's ID, which also names its
// runbook, and the label it gives itself.
import type { EnvClass, StackName } from "../config/validate.js";
import { rfc3339Seconds } from "../core/router.js";
import type { AuthFailureClass } from "../telemetry/metrics.js";

const MAX_CHARS = 1_000;

export interface MeterFacts {
  dayMicro: bigint;
  dayCeilingMicro: bigint;
  dayWarnMicro: bigint;
  monthMicro: bigint;
  monthCeilingMicro: bigint;
  monthWarnMicro: bigint;
  fallbackMicro: bigint;
  fallbackAllowanceMicro: bigint;
  /** The current grant's warning: its allowance minus $0.60. The fallback warning's meters line shows it. */
  fallbackWarnMicro?: bigint;
  grantNo: number;
}

export type RuntimeFacts =
  | { state: "normal" }
  | { state: "degraded"; since: number }
  | { state: "uninitialized" }
  | { state: "unknown"; since: number };

/** `unknown` leaves the Fallback segment out: the store that holds the flag can't be read. */
export type FallbackFacts =
  { state: "none" } | { state: "available" } | { state: "awaiting"; since: number } | { state: "unknown" };

export interface AlertContext {
  stack: StackName;
  envClass: EnvClass;
  /** config/alerts.yaml's prefix for the stack. */
  prefix: string;
  dedupeKey: string;
  /** The event's time on the gateway clock. */
  at: number;
  /** dev with a test-clock offset: every time is followed by " (test clock)". */
  testClock: boolean;
  runtime: RuntimeFacts;
  fallback: FallbackFacts;
  /** Omitted for a kind with no meter facts, which then has no meters line. */
  meters?: MeterFacts;
}

export type InitSource = "ledger" | "journal" | "stated";
export type Ceiling = "day" | "month";

/**
 * A capped paid adapter's month at a crossing (spec 010, FR-023, FR-037): the adapter by its routing.yaml ID and its
 * type's label ("the Anthropic API"), the UTC month, and its spend and cap as the crossing commit leaves them.
 */
export interface AdapterMonthFacts {
  adapter: string;
  label: string;
  month: string;
  spentMicro: bigint;
  capMicro: bigint;
}

export type AlertSpec =
  | {
      kind: "warn";
      meter: "day" | "month" | "fallback_day";
      /** fallback_day only: the grant whose 70% this is. */
      grantNo?: number;
      /** budgets.yaml's warn_ratio in basis points: 0.70 is 7000. */
      warnRatioBp: bigint;
    }
  /** Spec 010: a capped adapter's month at its cap × warn_ratio. */
  | { kind: "warn"; meter: "adapter_month"; warnRatioBp: bigint; adapterMonth: AdapterMonthFacts }
  | { kind: "trip"; ceiling: Ceiling }
  | { kind: "fallback_exhausted"; grantNo: number }
  /** Spec 010: a capped adapter's month at its cap; the paid fallback awaits a renewal when it is the route's. */
  | { kind: "fallback_exhausted"; adapterMonth: AdapterMonthFacts }
  | {
      kind: "operator_action";
      action: "init";
      /** The first 8 hex of the operator token's SHA-256. */
      fingerprint: string;
      /** The sources a meter's chosen value came from; none when every meter rebuilt at zero. */
      sources: InitSource[];
      confirmZero: boolean;
      renewed: boolean;
    }
  | {
      kind: "operator_action";
      action: "reset";
      fingerprint: string;
      /** The meters still at or above their ceiling, counting reservations: metered calls stay refused for them. */
      metersAtCeiling: Ceiling[];
    }
  | {
      kind: "operator_action";
      action: "renew";
      fingerprint: string;
      grantNo: number;
      /** fallback_daily_usd: what the renewal made available. */
      grantMicro: bigint;
    }
  | {
      // spec 003's studio GPU window (its contracts/gpu-window.md §1): opened, then closed with its fallback spend.
      kind: "operator_action";
      action: "studio_window";
      fingerprint: string;
      state: "start";
    }
  | {
      kind: "operator_action";
      action: "studio_window";
      fingerprint: string;
      state: "end";
      /** The ledger's fallback spend inside the window, and its calls. */
      fallbackMicro: bigint;
      fallbackCalls: number;
    }
  | {
      kind: "credentials_expiring";
      /** The adapter's ID: its dedupe key, and its runbook's name. */
      adapter: string;
      /** How the adapter names itself in a sentence. */
      label: string;
      /** When the session ends. */
      endsAt: number;
    }
  | { kind: "fallback_unavailable"; adapter: string; reason: "credentials" | "circuit_open" }
  | { kind: "auth_failed"; count: number; windowMinutes: number; lastClass: AuthFailureClass }
  | {
      kind: "store_unreachable";
      /** When the outage began. */
      since: number;
      /** alerts.yaml's store_unreachable_after_s. */
      afterS: number;
    }
  | {
      kind: "reminder";
      /** While degraded: stack_state.since. */
      degradedSince?: number;
      /** While awaiting renewal: stack_state.fallback_awaiting_since. */
      awaitingSince?: number;
      /** stack_state.crossed: "day:2026-10-29", "month:2026-10". */
      crossed: readonly string[];
    };

export interface RenderedAlert {
  subject: string;
  body: string;
  /** What the text was rendered from, in micro-USD: the outbox row's `facts`. */
  facts: Record<string, unknown>;
}

/** USD with two decimals, truncated toward zero, so a display never shows more than was spent (§3). */
export function usd(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const cents = (micro % 1_000_000n) / 10_000n;
  return `${whole}.${String(cents).padStart(2, "0")}`;
}

/** A ratio in basis points as a percentage: 7000 is "70", 7050 is "70.5". */
export function percent(bp: bigint): string {
  const whole = bp / 100n;
  const rest = (bp % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return rest === "" ? `${whole}` : `${whole}.${rest}`;
}

const SOURCE_WORDS: Record<InitSource, string> = {
  ledger: "the ledger",
  journal: "the journal",
  stated: "the stated values",
};

/** An adapter month's facts, as numbers and IDs: never text a person wrote. */
function adapterMonthFacts(a: AdapterMonthFacts): Record<string, unknown> {
  return { adapter: a.adapter, month: a.month, spent_micro: Number(a.spentMicro), cap_micro: Number(a.capMicro) };
}

/** A label at a sentence's start: "the Anthropic API" as "The Anthropic API". */
const capitalized = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function list(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const CLASS_WORDS: Record<AuthFailureClass, string> = {
  missing: "missing",
  malformed: "malformed",
  wrong_prefix: "wrong prefix",
  mismatch: "mismatch",
};

const CEILING_WORDS: Record<Ceiling, string> = { day: "daily", month: "monthly" };

/** "day:2026-10-29" as "daily ceiling, 2026-10-29". */
function crossedWords(crossed: readonly string[]): string {
  return crossed
    .map((c) => {
      const [meter, period] = c.split(":");
      return `${meter === "month" ? "monthly" : "daily"} ceiling, ${period ?? ""}`;
    })
    .join("; ");
}

interface Parts {
  headline: string;
  sentence?: string;
  runbook: string;
}

function initSentence(sources: readonly InitSource[], confirmZero: boolean, renewed: boolean): string {
  const from =
    sources.length > 0
      ? list(sources.map((s) => SOURCE_WORDS[s]))
      : confirmZero
        ? "no surviving record, zero confirmed"
        : "records that show no spend";
  return `Meters rebuilt from ${from}; renewal ${renewed ? "granted" : "pending"}.`;
}

function partsOf(spec: AlertSpec, time: (ms: number) => string): Parts {
  switch (spec.kind) {
    case "warn": {
      const pct = percent(spec.warnRatioBp);
      if (spec.meter === "adapter_month") {
        const a = spec.adapterMonth;
        return {
          headline: `WARNING: ${a.label}'s month at ${pct}% of its cap`,
          sentence: `${usd(a.spentMicro)} of ${usd(a.capMicro)} USD in ${a.month}. The paid fallback stops at its cap; local answers go on.`,
          runbook: "fallback-renewal.md",
        };
      }
      const headline =
        spec.meter === "day"
          ? `WARNING: daily meter at ${pct}%`
          : spec.meter === "month"
            ? `WARNING: monthly meter at ${pct}%`
            : `WARNING: fallback sub-budget at ${pct}% of grant ${spec.grantNo ?? 1}`;
      return { headline, runbook: "cost-warning.md" };
    }
    case "trip":
      return {
        headline: `KILL SWITCH TRIPPED: ${CEILING_WORDS[spec.ceiling]} ceiling reached`,
        sentence:
          "Every request now gets the degraded response, local answers included. Only an operator reset restores service.",
        runbook: "kill-switch-trip.md",
      };
    case "fallback_exhausted":
      if ("adapterMonth" in spec) {
        const a = spec.adapterMonth;
        return {
          headline: `PAID FALLBACK CAPPED: ${a.label}'s month reached its cap`,
          sentence:
            `${usd(a.spentMicro)} of ${usd(a.capMicro)} USD in ${a.month}. ${capitalized(a.label)} is refused until the ` +
            "month rolls over or the cap is raised, and the paid fallback awaits a renewal; local answers go on.",
          runbook: "fallback-renewal.md",
        };
      }
      return {
        headline: `FALLBACK EXHAUSTED: grant ${spec.grantNo} of today's sub-budget is spent`,
        sentence: "Fallback stays refused, across days and restarts, until the operator renews it.",
        runbook: "fallback-renewal.md",
      };
    case "operator_action":
      if (spec.action === "reset") {
        const held =
          spec.metersAtCeiling.length === 0
            ? ""
            : ` Metered calls stay refused while a meter is at or above its ceiling: ${list(spec.metersAtCeiling)}.`;
        return {
          headline: `OPERATOR ACTION: reset by operator #${spec.fingerprint}`,
          sentence: `Local answers resume.${held}`,
          runbook: "kill-switch-reset.md",
        };
      }
      if (spec.action === "renew") {
        return {
          headline: `OPERATOR ACTION: fallback renewed by operator #${spec.fingerprint}`,
          sentence: `$${usd(spec.grantMicro)} more fallback is available now, within the daily ceiling (grant ${spec.grantNo}).`,
          runbook: "fallback-renewal.md",
        };
      }
      if (spec.action === "studio_window") {
        if (spec.state === "start") {
          return {
            headline: `OPERATOR ACTION: studio GPU window opened by operator #${spec.fingerprint}`,
            sentence:
              "The model server stops next: hello falls back within the sub-budget, or degrades, until the window closes.",
            runbook: "studio-gpu-window.md",
          };
        }
        const calls = `${spec.fallbackCalls} call${spec.fallbackCalls === 1 ? "" : "s"}`;
        return {
          headline: `OPERATOR ACTION: studio GPU window closed by operator #${spec.fingerprint}`,
          sentence: `Hello answers from the local model again. The window's fallback spend: $${usd(spec.fallbackMicro)} in ${calls}.`,
          runbook: "studio-gpu-window.md",
        };
      }
      return {
        headline: `OPERATOR ACTION: store initialized by operator #${spec.fingerprint}`,
        sentence: initSentence(spec.sources, spec.confirmZero, spec.renewed),
        runbook: "store-initialization.md",
      };
    case "credentials_expiring":
      return {
        headline: `CREDENTIALS EXPIRING: the ${spec.label} SSO session ends at ${time(spec.endsAt)}`,
        sentence: `Fallback to ${spec.label} stops then. Run make aws-login in your terminal.`,
        runbook: `${spec.adapter}-credentials-expiring.md`,
      };
    case "fallback_unavailable":
      return {
        headline: `FALLBACK UNAVAILABLE: ${spec.adapter} is unhealthy (${spec.reason === "circuit_open" ? "circuit open" : "credentials"})`,
        sentence: "If the local model goes down, hello answers degraded with fallback_unavailable.",
        runbook: `${spec.adapter}-unavailable.md`,
      };
    case "auth_failed":
      return {
        headline: `AUTH FAILURES: ${spec.count} failed operator authentications in ${spec.windowMinutes} minutes`,
        sentence: `The admin listener refused them (last: ${CLASS_WORDS[spec.lastClass]}). No action was taken.`,
        runbook: "operator-auth-failures.md",
      };
    case "store_unreachable":
      return {
        headline: `STORE UNREACHABLE: the kill-switch store hasn't answered for ${spec.afterS} s`,
        sentence:
          "Every request gets 503 store_unreachable (fail closed). Meters and alerts resume when the store answers.",
        runbook: "store-unreachable.md",
      };
    case "reminder": {
      const renewal = spec.awaitingSince === undefined ? "" : "Only a renewal restores fallback.";
      if (spec.degradedSince !== undefined) {
        const ceilings = spec.crossed.length === 0 ? "" : ` (${crossedWords(spec.crossed)})`;
        return {
          headline: `REMINDER: still degraded since ${time(spec.degradedSince)}${ceilings}`,
          sentence: `Only an operator reset restores service.${renewal === "" ? "" : ` ${renewal}`}`,
          runbook: "kill-switch-trip.md",
        };
      }
      return {
        headline: `REMINDER: fallback still awaiting renewal since ${time(spec.awaitingSince ?? 0)}`,
        sentence: renewal,
        runbook: "fallback-renewal.md",
      };
    }
  }
}

/** What each kind adds to `facts`, beyond the common ones: numbers, states, times, IDs; never text from a person. */
function specFacts(spec: AlertSpec): Record<string, unknown> {
  const iso = (ms: number): string => new Date(ms).toISOString();
  switch (spec.kind) {
    case "warn":
      if (spec.meter === "adapter_month") {
        return { meter: spec.meter, warn_ratio_bp: Number(spec.warnRatioBp), ...adapterMonthFacts(spec.adapterMonth) };
      }
      return {
        meter: spec.meter,
        warn_ratio_bp: Number(spec.warnRatioBp),
        ...(spec.grantNo === undefined ? {} : { grant_no: spec.grantNo }),
      };
    case "trip":
      return { ceiling: spec.ceiling };
    case "fallback_exhausted":
      return "adapterMonth" in spec ? adapterMonthFacts(spec.adapterMonth) : { grant_no: spec.grantNo };
    case "operator_action":
      if (spec.action === "reset") {
        return { action: "reset", fingerprint: spec.fingerprint, meters_at_ceiling: [...spec.metersAtCeiling] };
      }
      if (spec.action === "renew") {
        return {
          action: "renew",
          fingerprint: spec.fingerprint,
          grant_no: spec.grantNo,
          grant_micro: Number(spec.grantMicro),
        };
      }
      if (spec.action === "studio_window") {
        return spec.state === "start"
          ? { action: "studio_window", fingerprint: spec.fingerprint, state: "start" }
          : {
              action: "studio_window",
              fingerprint: spec.fingerprint,
              state: "end",
              fallback_micro: Number(spec.fallbackMicro),
              fallback_calls: spec.fallbackCalls,
            };
      }
      return { action: spec.action, fingerprint: spec.fingerprint, sources: spec.sources, renewed: spec.renewed };
    case "credentials_expiring":
      return { adapter: spec.adapter, ends_at: iso(spec.endsAt) };
    case "fallback_unavailable":
      return { adapter: spec.adapter, reason: spec.reason };
    case "auth_failed":
      return { count: spec.count, window_minutes: spec.windowMinutes, last_class: spec.lastClass };
    case "store_unreachable":
      return { since: iso(spec.since), after_s: spec.afterS };
    case "reminder":
      return {
        degraded_since: spec.degradedSince === undefined ? null : iso(spec.degradedSince),
        awaiting_since: spec.awaitingSince === undefined ? null : iso(spec.awaitingSince),
        crossed: [...spec.crossed],
      };
  }
}

export function renderAlert(ctx: AlertContext, spec: AlertSpec): RenderedAlert {
  const time = (ms: number): string => `${rfc3339Seconds(ms)}${ctx.testClock ? " (test clock)" : ""}`;
  const runtime = (): string => {
    switch (ctx.runtime.state) {
      case "normal":
        return "normal";
      case "degraded":
        return `degraded since ${time(ctx.runtime.since)}`;
      case "uninitialized":
        return "uninitialized, treated as degraded";
      case "unknown":
        return `unknown, treated as degraded since ${time(ctx.runtime.since)}`;
    }
  };
  const fallback = (): string | undefined => {
    switch (ctx.fallback.state) {
      case "none":
        return "none";
      case "available":
        return "available";
      case "awaiting":
        return `awaiting renewal since ${time(ctx.fallback.since)}`;
      case "unknown":
        return undefined;
    }
  };

  const { headline, sentence, runbook } = partsOf(spec, time);
  const subject = `${ctx.prefix} ${headline}`;
  const lines = [subject];
  const m = ctx.meters;
  if (m !== undefined) {
    const grantWarn =
      spec.kind === "warn" && spec.meter === "fallback_day" && m.fallbackWarnMicro !== undefined
        ? `, warning ${usd(m.fallbackWarnMicro)}`
        : "";
    lines.push(
      `Daily: ${usd(m.dayMicro)} / ${usd(m.dayCeilingMicro)} USD (warning ${usd(m.dayWarnMicro)}) · ` +
        `Month: ${usd(m.monthMicro)} / ${usd(m.monthCeilingMicro)} (warning ${usd(m.monthWarnMicro)}) · ` +
        `Fallback today: ${usd(m.fallbackMicro)} / ${usd(m.fallbackAllowanceMicro)} (grant ${m.grantNo}${grantWarn})` +
        (ctx.envClass === "dev" ? " (synthetic spend)" : ""),
    );
  }
  const fallbackState = fallback();
  lines.push(
    `Runtime: ${runtime()}${fallbackState === undefined ? "" : ` · Fallback: ${fallbackState}`} · ` +
      `${time(ctx.at)} · id ${ctx.dedupeKey}`,
  );
  if (sentence !== undefined && sentence !== "") lines.push(sentence);
  lines.push(`Runbook: docs/runbooks/${runbook}`);
  const body = lines.join("\n").slice(0, MAX_CHARS);

  const facts: Record<string, unknown> = {
    kind: spec.kind,
    stack: ctx.stack,
    at: new Date(ctx.at).toISOString(),
    test_clock: ctx.testClock,
    runtime: ctx.runtime.state,
    fallback: ctx.fallback.state,
    ...(m === undefined
      ? {}
      : {
          meters: {
            day_micro: Number(m.dayMicro),
            day_ceiling_micro: Number(m.dayCeilingMicro),
            day_warn_micro: Number(m.dayWarnMicro),
            month_micro: Number(m.monthMicro),
            month_ceiling_micro: Number(m.monthCeilingMicro),
            month_warn_micro: Number(m.monthWarnMicro),
            fallback_micro: Number(m.fallbackMicro),
            fallback_allowance_micro: Number(m.fallbackAllowanceMicro),
            ...(m.fallbackWarnMicro === undefined ? {} : { fallback_warn_micro: Number(m.fallbackWarnMicro) }),
            grant_no: m.grantNo,
          },
        }),
    ...specFacts(spec),
  };
  return { subject, body, facts };
}
