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
//
// Spec 011 (FR-001 to FR-003; plan §3.2): the designed forms (telegram-design.ts, email-design.ts) take their words
// from alertParts here, the same parts this text is built from, so no word drifts between forms; and a sample's marks
// (FR-036) are added here too: `[SAMPLE] ` before line 1, and a last line naming the requester, nothing having
// happened. The cut at 1,000 units, a last resort, never splits a surrogate pair, since a prefix may hold an emoji.
import type { EnvClass, StackName } from "../config/validate.js";
import { rfc3339Seconds } from "../core/router.js";
import type { AuthFailureClass } from "../telemetry/metrics.js";
import { factsOf } from "./facts.js";

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

export type InitSource = "ledger" | "journal" | "stated" | "restored";
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
  /** label (spec 010, FR-037): how the adapter's type names it, "Bedrock" or "the Anthropic API"; its ID without one. */
  | { kind: "fallback_unavailable"; adapter: string; label?: string; reason: "credentials" | "circuit_open" }
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
  /** What the text was rendered from, in micro-USD: the outbox row's `facts`, version 2 (facts.ts). */
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
  // Spec 001: a store restored from a backup keeps its meters (contracts/shared-state.md §8, step 4).
  restored: "the restored store",
};

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
        headline: `FALLBACK UNAVAILABLE: ${spec.label ?? spec.adapter} is unhealthy (${spec.reason === "circuit_open" ? "circuit open" : "credentials"})`,
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

/** A sample's marks in the plain text and every form (FR-036). */
export const SAMPLE_PREFIX = "[SAMPLE] ";
export const sampleSentence = (fingerprint: string, stack: StackName): string =>
  `A sample, sent by operator #${fingerprint}: nothing happened on ${stack}.`;

/** One meter of a designed form's block or bar, with the values the plain text shows for it (FR-003, FR-021). */
export interface MeterRow {
  /** Daily, Month, Fallback, or an adapter month's adapter ID. */
  label: string;
  spentMicro: bigint;
  /** The ceiling, the allowance, or the cap: the bar's full length. */
  ceilingMicro: bigint;
  /** The warning the plain text shows for this meter, where it shows one. */
  warnMicro?: bigint;
  /** The fallback's grant. */
  grantNo?: number;
  /** An adapter month's month, YYYY-MM. */
  month?: string;
}

/** Every part of an alert's text, as each form shows it: the plain text's words, never others (FR-002). */
export interface AlertParts {
  /** Line 1: `[SAMPLE] ` for a sample, the prefix, and the headline. */
  firstLine: string;
  headline: string;
  /** The kind's fixed sentence, where it has one. */
  sentence?: string;
  /** docs/runbooks/<page>.md */
  runbookPath: string;
  runtime: string;
  /** Absent where the plain text leaves it out: the flag's store can't be read. */
  fallback?: string;
  /** The event's time, with " (test clock)" in dev on a test clock. */
  time: string;
  meters: MeterRow[];
  /** dev's mark on the meters: their spend is synthetic. */
  synthetic: boolean;
  /** A sample's last line. */
  sampleLine?: string;
}

export function alertParts(ctx: AlertContext, spec: AlertSpec, sample?: { fingerprint: string }): AlertParts {
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
  const meters: MeterRow[] = [];
  const m = ctx.meters;
  if (m !== undefined) {
    const grantWarn = spec.kind === "warn" && spec.meter === "fallback_day" ? m.fallbackWarnMicro : undefined;
    meters.push(
      { label: "Daily", spentMicro: m.dayMicro, ceilingMicro: m.dayCeilingMicro, warnMicro: m.dayWarnMicro },
      { label: "Month", spentMicro: m.monthMicro, ceilingMicro: m.monthCeilingMicro, warnMicro: m.monthWarnMicro },
      {
        label: "Fallback",
        spentMicro: m.fallbackMicro,
        ceilingMicro: m.fallbackAllowanceMicro,
        grantNo: m.grantNo,
        ...(grantWarn === undefined ? {} : { warnMicro: grantWarn }),
      },
    );
  }
  // Spec 010's adapter month, against its cap, where its alert carries it (FR-003).
  if ((spec.kind === "warn" || spec.kind === "fallback_exhausted") && "adapterMonth" in spec) {
    const a = spec.adapterMonth;
    meters.push({ label: a.adapter, spentMicro: a.spentMicro, ceilingMicro: a.capMicro, month: a.month });
  }
  const fallbackState = fallback();
  return {
    firstLine: `${sample === undefined ? "" : SAMPLE_PREFIX}${ctx.prefix} ${headline}`,
    headline,
    ...(sentence === undefined || sentence === "" ? {} : { sentence }),
    runbookPath: `docs/runbooks/${runbook}`,
    runtime: runtime(),
    ...(fallbackState === undefined ? {} : { fallback: fallbackState }),
    time: time(ctx.at),
    meters,
    synthetic: ctx.envClass === "dev",
    ...(sample === undefined ? {} : { sampleLine: sampleSentence(sample.fingerprint, ctx.stack) }),
  };
}

/** At most `max` UTF-16 code units, cut where no surrogate pair is split (FR-023's last resort). */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

export function renderAlert(ctx: AlertContext, spec: AlertSpec, sample?: { fingerprint: string }): RenderedAlert {
  const p = alertParts(ctx, spec, sample);
  const subject = p.firstLine;
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
        (p.synthetic ? " (synthetic spend)" : ""),
    );
  }
  lines.push(
    `Runtime: ${p.runtime}${p.fallback === undefined ? "" : ` · Fallback: ${p.fallback}`} · ` +
      `${p.time} · id ${ctx.dedupeKey}`,
  );
  if (p.sentence !== undefined) lines.push(p.sentence);
  lines.push(`Runbook: ${p.runbookPath}`);
  if (p.sampleLine !== undefined) lines.push(p.sampleLine);
  const body = cut(lines.join("\n"), MAX_CHARS);

  // The facts, version 2 (facts.ts; spec 011, plan §2.2): every value the forms show, from which the designed
  // forms render at each delivery attempt.
  const facts = factsOf(ctx, spec);
  return { subject, body, facts };
}
