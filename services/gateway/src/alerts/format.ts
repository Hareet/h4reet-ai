// Alert text (contracts/alerts.md §3, §5): plain text, UTF-8, at most 1,000 characters.
//
//   <prefix> <HEADLINE>: <one-line summary>
//   Daily: <spent> / <ceiling> USD (warning <w>) · Month: … · Fallback today: <spent> / <allowance> (grant <n>)
//   Runtime: <state> · Fallback: <state> · <time> · id <dedupe key>
//   <one fixed sentence for the kind>
//   Runbook: docs/runbooks/<page>.md
//
// It renders from typed facts: numbers, states, times, the dedupe key, and the operator's fingerprint, with no field
// a payload, a client label, the operator's reason, or a secret could arrive through (§5). In US1 the gateway queues
// two kinds, the init confirmation and auth_failed; tasks.md T077 adds the others and their delivery.
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
  grantNo: number;
}

export type RuntimeFacts =
  | { state: "normal" }
  | { state: "degraded"; since: number }
  | { state: "uninitialized" }
  | { state: "unknown"; since: number };

export type FallbackFacts = { state: "none" } | { state: "available" } | { state: "awaiting"; since: number };

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

export type AlertSpec =
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
  | { kind: "auth_failed"; count: number; windowMinutes: number; lastClass: AuthFailureClass };

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

const SOURCE_WORDS: Record<InitSource, string> = {
  ledger: "the ledger",
  journal: "the journal",
  stated: "the stated values",
};

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const CLASS_WORDS: Record<AuthFailureClass, string> = {
  missing: "missing",
  malformed: "malformed",
  wrong_prefix: "wrong prefix",
  mismatch: "mismatch",
};

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
  const fallback = (): string => {
    switch (ctx.fallback.state) {
      case "none":
        return "none";
      case "available":
        return "available";
      case "awaiting":
        return `awaiting renewal since ${time(ctx.fallback.since)}`;
    }
  };

  let headline: string;
  let sentence: string;
  let runbook: string;
  if (spec.kind === "operator_action") {
    headline = `OPERATOR ACTION: store initialized by operator #${spec.fingerprint}`;
    const from =
      spec.sources.length > 0
        ? list(spec.sources.map((s) => SOURCE_WORDS[s]))
        : spec.confirmZero
          ? "no surviving record, zero confirmed"
          : "records that show no spend";
    sentence = `Meters rebuilt from ${from}; renewal ${spec.renewed ? "granted" : "pending"}.`;
    runbook = "store-initialization.md";
  } else {
    headline = `AUTH FAILURES: ${spec.count} failed operator authentications in ${spec.windowMinutes} minutes`;
    sentence = `The admin listener refused them (last: ${CLASS_WORDS[spec.lastClass]}). No action was taken.`;
    runbook = "operator-auth-failures.md";
  }

  const subject = `${ctx.prefix} ${headline}`;
  const lines = [subject];
  const m = ctx.meters;
  if (m !== undefined) {
    lines.push(
      `Daily: ${usd(m.dayMicro)} / ${usd(m.dayCeilingMicro)} USD (warning ${usd(m.dayWarnMicro)}) · ` +
        `Month: ${usd(m.monthMicro)} / ${usd(m.monthCeilingMicro)} (warning ${usd(m.monthWarnMicro)}) · ` +
        `Fallback today: ${usd(m.fallbackMicro)} / ${usd(m.fallbackAllowanceMicro)} (grant ${m.grantNo})` +
        (ctx.envClass === "dev" ? " (synthetic spend)" : ""),
    );
  }
  lines.push(`Runtime: ${runtime()} · Fallback: ${fallback()} · ${time(ctx.at)} · id ${ctx.dedupeKey}`);
  lines.push(sentence);
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
            grant_no: m.grantNo,
          },
        }),
    ...(spec.kind === "operator_action"
      ? { action: spec.action, fingerprint: spec.fingerprint, sources: spec.sources, renewed: spec.renewed }
      : { count: spec.count, window_minutes: spec.windowMinutes, last_class: spec.lastClass }),
  };
  return { subject, body, facts };
}
