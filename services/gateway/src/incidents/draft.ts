// The incident drafts (FR-035; contracts/alerts.md §7; data-model.md §2.8, §7.7). A trip queues an `incidents` row in
// its own commit (meter/crossings.ts). This background task, every 10 s, writes the draft of each row still queued:
// - once both channels of the trip alert are final, or 300 s after the trip, whichever comes first, so the draft can
//   record the alert outcomes;
// - from a deterministic template, with no model call: a breach is the worst moment to spend, and the same evidence
//   gives the same bytes;
// - under ${GATEWAY_STATE_DIR}/incidents/YYYY-MM-DD-<stack>-<ceiling>.intent.md, the crossing's UTC date on the
//   gateway clock, with -2, -3, … when the name is taken; written under a temporary name and renamed, mode 0640, its
//   SHA-256 and relative path in the row;
// - with no payloads, client identifiers, or secrets: totals are grouped by provider, model, and route only, and the
//   audit trail's reasons stay in the operator's words.
// A failed write leaves the row queued with its error class, and the next pass tries again.
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

import { dedupeKey } from "../alerts/outbox.js";
import type { Budgets, EnvClass, PriceTable, StackName } from "../config/validate.js";
import { dayKey, toRfc3339, type GatewayClock } from "../core/clock.js";
import { rfc3339Seconds } from "../core/router.js";
import { errorClass, toBigInt, type Store } from "../meter/store.js";

export const DRAFT_INTERVAL_MS = 10_000;
/** A draft waits for both channels of its trip alert to be final, or this long after the trip, on the real clock. */
export const DRAFT_WAIT_MS = 300_000;

// ---------------------------------------------------------------------------------------------------------------
// The template (alerts.md §7)
// ---------------------------------------------------------------------------------------------------------------

/** One channel's outcome for one alert, as its outbox row has it. */
export interface AlertOutcome {
  status: "pending" | "delivered" | "failed";
  attempts: number;
  /** Real time, epoch ms. */
  deliveredAt: number | null;
  /** Telegram's message_id; the SMTP reply code and queue ID. */
  ref: string | null;
  /** An error class only. */
  error: string | null;
}

export interface MeterLine {
  period: string;
  spentMicro: bigint;
  reservedMicro: bigint;
  /** The ceiling, or for fallback_day the allowance. */
  limitMicro: bigint;
  warnMicro: bigint;
}

/** Everything a draft shows, read from the store. Times are the gateway clock's unless they say otherwise. */
export interface DraftEvidence {
  stack: string;
  ceiling: "day" | "month";
  periodKey: string;
  crossedAt: number;
  /** The state's `since` after the trip: when `degraded` was set. */
  degradedAt: number;
  /** Whether this crossing set `degraded`, or the stack was degraded already by an earlier one. */
  setDegraded: boolean;
  /** The crossing on the real clock, which Grafana's series are on. */
  crossedAtReal: number;
  crossing: {
    before: bigint;
    after: bigint;
    ceiling: bigint;
    ledgerId: string;
    traceId: string;
    provider: string;
    model: string;
    attribution: string;
    costMicro: bigint;
  };
  meters: { day: MeterLine; month: MeterLine; fallbackDay: MeterLine & { grantNo: number } };
  /** Newest first. */
  lastCalls: {
    ts: number;
    route: string;
    provider: string;
    model: string;
    attribution: string;
    costMicro: bigint;
    traceId: string;
  }[];
  hourly: {
    hour: number;
    provider: string;
    model: string;
    route: string;
    calls: number;
    inputTokens: bigint;
    outputTokens: bigint;
    costMicro: bigint;
  }[];
  /** The monthly ceiling only. */
  daily: { day: string; calls: number; costMicro: bigint }[] | null;
  audit: { ts: number; actor: string; action: string; reason: string | null }[];
  config: {
    routingSha: string;
    priceVersion: string;
    effectiveFrom: number | null;
    dailyMicro: bigint;
    monthlyMicro: bigint;
    fallbackDailyMicro: bigint;
    warnRatioBp: bigint;
    /** The global metered in-flight limit: the overshoot's bound. */
    inFlight: number;
  };
  /** The trip alert first, then each warning of the period. */
  alerts: { key: string; telegram: AlertOutcome; email: AlertOutcome }[];
  fallbackId: string | null;
  ports: { grafana: number; langfuse: number };
}

/** micro-USD as USD with six decimals, which is exact. */
function usd(micro: bigint): string {
  const sign = micro < 0n ? "-" : "";
  const m = micro < 0n ? -micro : micro;
  return `${sign}${m / 1_000_000n}.${(m % 1_000_000n).toString().padStart(6, "0")}`;
}

/** warn_ratio from basis points: 7000 is 0.70. */
function ratio(bp: bigint): string {
  const frac = (bp % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${bp / 10_000n}.${frac.padEnd(2, "0")}`;
}

/** A table cell: a `|` would end it, so it is escaped; nothing else changes. */
const cell = (value: string): string => value.replace(/\|/g, "\\|");
const row = (cells: readonly string[]): string => `| ${cells.map(cell).join(" | ")} |`;
const at = (ms: number): string => rfc3339Seconds(ms);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function outcome(o: AlertOutcome, channel: "telegram" | "email"): string {
  if (o.status === "delivered") {
    const when = o.deliveredAt === null ? "" : ` at ${at(o.deliveredAt)}`;
    const ref = o.ref === null ? "" : channel === "telegram" ? ` (message ${o.ref})` : ` (${o.ref})`;
    return `delivered${when}${ref}`;
  }
  const error = o.error === null ? "" : ` (${o.error})`;
  return `${o.status} after ${plural(o.attempts, "attempt")}${error}`;
}

function meterRow(name: string, m: MeterLine, limit: string): string {
  return row([name, m.period, usd(m.spentMicro), usd(m.reservedMicro), limit, usd(m.warnMicro)]);
}

/** The draft's Markdown: intent/README.md's format, with the Evidence section of alerts.md §7. */
export function renderDraft(e: DraftEvidence): string {
  const meter = e.ceiling === "day" ? "daily" : "monthly";
  const c = e.crossing;
  const overshoot = c.after > c.ceiling ? c.after - c.ceiling : 0n;
  const degraded = e.setDegraded
    ? `\`degraded\` was set at ${at(e.degradedAt)}, in the same transaction.`
    : `\`degraded\` was set already, at ${at(e.degradedAt)}, by an earlier crossing.`;
  const lines = [
    `# Intent: Respond to the ${meter} ceiling breach on ${e.stack}, ${e.periodKey}`,
    `Author: the gateway (automated draft). Status: draft. Created: ${dayKey(e.crossedAt)}.`,
    "",
    "## Problem",
    `The ${e.stack} stack's ${meter} meter reached its ceiling of ${usd(c.ceiling)} USD at ${at(e.crossedAt)}.`,
    `The kill switch set \`degraded\` at ${at(e.degradedAt)}, with no human action (FR-033). Every request gets the`,
    "degraded response until an operator resets it (FR-034). The evidence below is what the gateway recorded.",
    "",
    "## Proposed outcome",
    "To be written by the Author.",
    "",
    "## Affected users and systems",
    `The ${e.stack} stack: its hello endpoint, its gateway, and its fallback (${e.fallbackId ?? "none"}).`,
    "No visitor data flows in spec 000.",
    "",
    "## Constraints",
    "Principle V: the system degraded itself, and a human must consciously restore it. The constitution's",
    "Incidents rule: an incident note in docs/incidents/ within seven days, and an eval that would have caught",
    "this. A change to a ceiling, the sub-budget, or a limit needs an ADR and the Author's approval.",
    "",
    "## Expected cost impact",
    `Metered spend at the crossing: day ${usd(e.meters.day.spentMicro)} USD, month ${usd(e.meters.month.spentMicro)} USD. Overshoot past the ceiling:`,
    `${usd(overshoot)} USD, against the bound of ${e.config.inFlight} calls in flight times the maximum cost per call.`,
    "",
    "## Data-flow impact",
    "None. This draft was generated inside the stack. It holds no payloads, client identifiers, or secrets.",
    "",
    "## Open questions",
    "- What drove the spend? See the hourly totals.",
    "- Did a configuration change or an operator action contribute? See the configuration and the audit trail.",
    "- Which eval or alert would have caught it sooner?",
    "",
    "## Evidence",
    "",
    "### Meters at the crossing",
    "| Meter | Period | Spent | Reserved | Ceiling or allowance | Warning |",
    "|---|---|---|---|---|---|",
    meterRow("day", e.meters.day, usd(e.meters.day.limitMicro)),
    meterRow("month", e.meters.month, usd(e.meters.month.limitMicro)),
    meterRow(
      "fallback_day",
      e.meters.fallbackDay,
      `${usd(e.meters.fallbackDay.limitMicro)} (grant ${e.meters.fallbackDay.grantNo})`,
    ),
    "",
    "### The crossing",
    `- Ceiling: ${e.ceiling} ${e.periodKey}. Spend before the call: ${usd(c.before)} USD; after: ${usd(c.after)} USD.`,
    `- The crossing call: ledger ${c.ledgerId}, trace ${c.traceId}, ${c.provider} ${c.model}, attribution ${c.attribution}, cost ${usd(c.costMicro)} USD.`,
    `- Crossed at ${at(e.crossedAt)}. ${degraded}`,
    "",
    "### The last 10 metered calls",
    "| Time | Route | Provider | Model | Attribution | Cost (USD) | Trace |",
    "|---|---|---|---|---|---|---|",
    ...e.lastCalls.map((x) =>
      row([at(x.ts), x.route, x.provider, x.model, x.attribution, usd(x.costMicro), x.traceId]),
    ),
    "",
    "### Hourly totals, the 24 hours before the crossing (UTC)",
    "| Hour | Provider | Model | Route | Calls | Input tokens | Output tokens | Cost (USD) |",
    "|---|---|---|---|---|---|---|---|",
    ...e.hourly.map((h) =>
      row([
        `${new Date(h.hour).toISOString().slice(0, 13)}:00Z`,
        h.provider,
        h.model,
        h.route,
        String(h.calls),
        String(h.inputTokens),
        String(h.outputTokens),
        usd(h.costMicro),
      ]),
    ),
    "",
    ...(e.daily === null
      ? []
      : [
          "### Daily totals this month",
          "| Day | Calls | Cost (USD) |",
          "|---|---|---|",
          ...e.daily.map((d) => row([d.day, String(d.calls), usd(d.costMicro)])),
          "",
        ]),
    `### Audit trail, this ${e.ceiling}`,
    "| Time | Actor | Action | Reason |",
    "|---|---|---|---|",
    ...e.audit.map((a) => row([at(a.ts), a.actor, a.action, a.reason ?? "–"])),
    "",
    "### Configuration",
    `- Routing: config/routing.yaml, SHA-256 ${e.config.routingSha}`,
    `- Prices: version ${e.config.priceVersion}, effective from ${e.config.effectiveFrom === null ? "unknown" : at(e.config.effectiveFrom)}`,
    `- Budgets: day ${usd(e.config.dailyMicro)} USD, month ${usd(e.config.monthlyMicro)} USD, fallback ${usd(e.config.fallbackDailyMicro)} USD a grant, warning ratio ${ratio(e.config.warnRatioBp)}`,
    "",
    "### Alerts",
    "| Alert | Telegram | Email |",
    "|---|---|---|",
    ...e.alerts.map((a) => row([a.key, outcome(a.telegram, "telegram"), outcome(a.email, "email")])),
    "",
    "### Links",
    `- Grafana: http://localhost:${e.ports.grafana}/d/h4-runtime?from=${e.crossedAtReal - 7_200_000}&to=${e.crossedAtReal + 1_800_000}&tz=UTC`,
    `- The crossing call in Langfuse: http://localhost:${e.ports.langfuse}/project/h4reet-${e.stack}/traces/${c.traceId}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** The draft's file name: the crossing's UTC date on the gateway clock, the stack, the ceiling, then -2, -3, …. */
export function draftName(date: string, stack: string, ceiling: "day" | "month", n: number): string {
  return `${date}-${stack}-${ceiling}${n === 1 ? "" : `-${n}`}.intent.md`;
}

// ---------------------------------------------------------------------------------------------------------------
// The background task
// ---------------------------------------------------------------------------------------------------------------

export interface DraftDeps {
  stack: StackName;
  envClass: EnvClass;
  store: Store;
  /** GATEWAY_STATE_DIR: the drafts go into its incidents/ directory. */
  stateDir: string;
  budgets: Budgets;
  prices: PriceTable;
  /** The route's fallback adapter as built, or null. */
  fallbackId: string | null;
  /** H4_GRAFANA_PORT and H4_LANGFUSE_PORT, for the links (env-files.md §4). */
  env: Readonly<Record<string, string | undefined>>;
  clock: GatewayClock;
  logger: {
    info(record: object, msg: string): void;
    warn(record: object, msg: string): void;
    error(record: object, msg: string): void;
  };
  realNow: () => number;
  intervalMs?: number;
}

/** env-files.md's fixed ports, for a gateway whose environment doesn't carry them. */
const FIXED_PORTS: Record<StackName, { grafana: number; langfuse: number }> = {
  prod: { grafana: 18002, langfuse: 18001 },
  dev: { grafana: 18102, langfuse: 18101 },
  "dev-cpu": { grafana: 18302, langfuse: 18301 },
};

function portOf(value: string | undefined, fixed: number): number {
  if (value === undefined || !/^\d{1,5}$/.test(value)) return fixed;
  const port = Number(value);
  return port >= 1 && port <= 65_535 ? port : fixed;
}

interface QueuedRow {
  id: unknown;
  created_at: Date | string;
  ceiling: "day" | "month";
  period_key: string;
  ledger_id: string;
  trip_alert_key: string;
  error: string | null;
}

interface OutboxRow {
  dedupe_key: string;
  enqueued_at: Date | string;
  telegram_status: AlertOutcome["status"];
  email_status: AlertOutcome["status"];
  telegram_attempts: number;
  email_attempts: number;
  telegram_delivered_at: Date | string | null;
  email_delivered_at: Date | string | null;
  telegram_ref: string | null;
  email_ref: string | null;
  telegram_error: string | null;
  email_error: string | null;
}

interface TripRow {
  ts: Date | string;
  recorded_at: Date | string;
  after: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
}

const ms = (v: Date | string): number => new Date(v).getTime();
const msOrNull = (v: Date | string | null): number | null => (v === null ? null : ms(v));
const final = (status: string): boolean => status === "delivered" || status === "failed";
const big = (v: unknown, fallback = 0n): bigint => {
  try {
    return v === null || v === undefined ? fallback : toBigInt(v);
  } catch {
    return fallback;
  }
};
const text = (v: unknown, fallback = "unknown"): string => (typeof v === "string" && v !== "" ? v : fallback);

/** The directory's entry for a renamed file, made durable; best effort, as some filesystems refuse it. */
async function syncDir(dir: string): Promise<void> {
  const handle = await open(dir, "r").catch(() => undefined);
  if (handle === undefined) return;
  try {
    await handle.sync();
  } catch {
    // a directory fsync some filesystems don't support
  } finally {
    await handle.close().catch(() => {});
  }
}

/** A draft that can never be written: the store lacks what the trip's own transaction wrote. */
class DraftImpossible extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class IncidentDrafts {
  private timer: NodeJS.Timeout | undefined;
  private ticking: Promise<number> | undefined;
  private stopped = true;
  private readonly ports: { grafana: number; langfuse: number };

  constructor(private readonly deps: DraftDeps) {
    const fixed = FIXED_PORTS[deps.stack];
    this.ports = {
      grafana: portOf(deps.env.H4_GRAFANA_PORT, fixed.grafana),
      langfuse: portOf(deps.env.H4_LANGFUSE_PORT, fixed.langfuse),
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), this.deps.intervalMs ?? DRAFT_INTERVAL_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    await this.ticking?.catch(() => 0);
  }

  /** One pass over the queued rows; resolves to how many drafts it wrote. A pass under way is joined, not doubled. */
  tick(): Promise<number> {
    this.ticking ??= this.pass().finally(() => {
      this.ticking = undefined;
    });
    return this.ticking;
  }

  private async pass(): Promise<number> {
    const { store } = this.deps;
    if (store.status !== "ready") return 0;
    let queued: QueuedRow[];
    try {
      queued = (
        await store.query<QueuedRow>(
          `SELECT id, created_at, ceiling, period_key, ledger_id::text AS ledger_id, trip_alert_key, error
           FROM gateway.incidents WHERE status = 'queued' ORDER BY id`,
        )
      ).rows;
    } catch {
      return 0; // the store is down, or wiped: the next pass looks again
    }
    let written = 0;
    for (const row of queued) {
      try {
        if (await this.draft(row)) written += 1;
      } catch {
        // The store failed under this row: it stays queued for the next pass.
      }
    }
    return written;
  }

  /** One row: when it is due, its evidence, the file, then the row. Resolves to whether it wrote the draft. */
  private async draft(row: QueuedRow): Promise<boolean> {
    const { store } = this.deps;
    const alerts = await this.alertRows(row);
    const trip = await store.query<TripRow>(
      `SELECT ts, recorded_at, after, detail FROM gateway.audit_log
       WHERE action = 'trip' AND detail->>'ledger_id' = $1 AND detail->>'ceiling' = $2
       ORDER BY id DESC LIMIT 1`,
      [row.ledger_id, row.ceiling],
    );
    const tripRow = trip.rows[0];
    // Due once both channels of the trip alert are final, or 300 s after the trip: the alert row's enqueued_at, or
    // without one, the trip audit row's recorded_at, both real time.
    const tripAlert = alerts.find((a) => a.dedupe_key === row.trip_alert_key);
    const trippedAt =
      tripAlert !== undefined ? ms(tripAlert.enqueued_at) : tripRow !== undefined ? ms(tripRow.recorded_at) : undefined;
    const settled = tripAlert !== undefined && final(tripAlert.telegram_status) && final(tripAlert.email_status);
    if (!settled && trippedAt !== undefined && this.deps.realNow() < trippedAt + DRAFT_WAIT_MS) return false;

    let content: string;
    try {
      content = renderDraft(await this.evidence(row, alerts, tripRow));
    } catch (err) {
      if (!(err instanceof DraftImpossible)) throw err;
      await store.query(
        "UPDATE gateway.incidents SET status = 'failed', error = $2 WHERE id = $1 AND status = 'queued'",
        [row.id, err.code],
      );
      this.deps.logger.error(
        { event: "incident.draft_failed", incident_id: Number(toBigInt(row.id)), error_class: err.code },
        "An incident draft can't be written: the store lacks the trip's own records.",
      );
      return false;
    }
    const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
    let path: string;
    try {
      path = await this.write(dayKey(ms(row.created_at)), row.ceiling, content);
    } catch (err) {
      await this.writeFailed(row, errorClass(err));
      return false;
    }
    const writtenAt = toRfc3339(this.deps.clock.now());
    try {
      const updated = await store.query(
        `UPDATE gateway.incidents SET status = 'written', path = $2, sha256 = $3, written_at = $4, error = NULL
         WHERE id = $1 AND status = 'queued' RETURNING id`,
        [row.id, path, sha256, writtenAt],
      );
      if (updated.rows.length === 0) return false;
    } catch (err) {
      // The row can't say where the draft is: the file goes, and the next pass writes it again, under the same name.
      await unlink(join(this.deps.stateDir, path)).catch(() => {});
      throw err;
    }
    this.deps.logger.info(
      { event: "incident.drafted", incident_id: Number(toBigInt(row.id)), path, sha256 },
      "An incident draft was written.",
    );
    return true;
  }

  /** The trip alert, then the period's warnings: the crossed meter's, and on a day, the fallback grants'. */
  private async alertRows(row: QueuedRow): Promise<OutboxRow[]> {
    const { stack } = this.deps;
    const grants = row.ceiling === "day" ? `${stack}:warn:fallback_day:${row.period_key}:g` : null;
    return (
      await this.deps.store.query<OutboxRow>(
        `SELECT dedupe_key, enqueued_at, telegram_status, email_status, telegram_attempts, email_attempts,
           telegram_delivered_at, email_delivered_at, telegram_ref, email_ref, telegram_error, email_error
         FROM gateway.alert_outbox
         WHERE dedupe_key = $1 OR (kind = 'warn' AND (dedupe_key = $2 OR starts_with(dedupe_key, $3)))
         ORDER BY (dedupe_key = $1) DESC, id`,
        [row.trip_alert_key, dedupeKey.warn(stack, row.ceiling, row.period_key), grants],
      )
    ).rows;
  }

  private async evidence(row: QueuedRow, alerts: OutboxRow[], trip: TripRow | undefined): Promise<DraftEvidence> {
    const { store, budgets, envClass } = this.deps;
    if (trip === undefined || trip.detail === null) throw new DraftImpossible("no_trip_audit");
    const d = trip.detail;
    const crossedAt = ms(row.created_at);
    const crossedIso = toRfc3339(crossedAt);
    const ledger = (
      await store.query<{ price_version: string; routing_sha: string }>(
        "SELECT price_version, routing_sha FROM gateway.ledger WHERE id = $1",
        [row.ledger_id],
      )
    ).rows[0];
    if (ledger === undefined) throw new DraftImpossible("no_crossing_call");

    const snapshot = (d.meters ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const line = (name: string, limitKey: string): MeterLine => {
      const m = snapshot[name] ?? {};
      return {
        period: text(m.period, name === "month" ? row.period_key.slice(0, 7) : "unknown"),
        spentMicro: big(m.spent_micro),
        reservedMicro: big(m.reserved_micro),
        limitMicro: big(m[limitKey]),
        warnMicro: big(m.warn_micro),
      };
    };
    const fallback = snapshot.fallback_day ?? {};

    const lastCalls = (
      await store.query<{
        ts: Date | string;
        route_decision: string;
        provider: string;
        request_model: string;
        attribution: string;
        cost_micro: unknown;
        trace_id: string;
      }>(
        `SELECT ts, route_decision, provider, request_model, attribution, cost_micro, trace_id FROM gateway.ledger
         WHERE attribution <> 'none' AND ts <= $1 ORDER BY ts DESC, id DESC LIMIT 10`,
        [crossedIso],
      )
    ).rows.map((x) => ({
      ts: ms(x.ts),
      route: x.route_decision,
      provider: x.provider,
      model: x.request_model,
      attribution: x.attribution,
      costMicro: big(x.cost_micro),
      traceId: x.trace_id,
    }));

    const hourly = (
      await store.query<{
        hour: Date | string;
        provider: string;
        model: string;
        route: string;
        calls: unknown;
        input_tokens: unknown;
        output_tokens: unknown;
        cost_micro: unknown;
      }>(
        `SELECT date_trunc('hour', ts, 'UTC') AS hour, provider, request_model AS model, route_decision AS route,
           count(*) AS calls, coalesce(sum(input_tokens), 0) AS input_tokens,
           coalesce(sum(output_tokens), 0) AS output_tokens, coalesce(sum(cost_micro), 0) AS cost_micro
         FROM gateway.ledger
         WHERE ts > $1::timestamptz - interval '24 hours' AND ts <= $1::timestamptz
         GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`,
        [crossedIso],
      )
    ).rows.map((h) => ({
      hour: ms(h.hour),
      provider: h.provider,
      model: h.model,
      route: h.route,
      calls: Number(big(h.calls)),
      inputTokens: big(h.input_tokens),
      outputTokens: big(h.output_tokens),
      costMicro: big(h.cost_micro),
    }));

    const month = row.ceiling === "month" ? row.period_key : row.period_key.slice(0, 7);
    const daily =
      row.ceiling !== "month"
        ? null
        : (
            await store.query<{ period_day: string; calls: unknown; cost_micro: unknown }>(
              `SELECT period_day, count(*) AS calls, coalesce(sum(cost_micro), 0) AS cost_micro FROM gateway.ledger
               WHERE period_month = $1 AND ts <= $2 GROUP BY period_day ORDER BY period_day`,
              [month, crossedIso],
            )
          ).rows.map((x) => ({ day: x.period_day, calls: Number(big(x.calls)), costMicro: big(x.cost_micro) }));

    // The period on the gateway clock, as the audit rows' ts are: this day, or this month, up to the crossing.
    const start = row.ceiling === "day" ? `${row.period_key}T00:00:00Z` : `${row.period_key}-01T00:00:00Z`;
    const audit = (
      await store.query<{ ts: Date | string; actor: string; action: string; reason: string | null }>(
        `SELECT ts, actor, action, reason FROM gateway.audit_log
         WHERE ts >= $1::timestamptz AND ts < $1::timestamptz + $2::interval AND ts <= $3::timestamptz
         ORDER BY ts, id`,
        [start, row.ceiling === "day" ? "1 day" : "1 month", crossedIso],
      )
    ).rows.map((a) => ({ ts: ms(a.ts), actor: a.actor, action: a.action, reason: a.reason }));

    const env = budgets.envs[envClass];
    const version = this.deps.prices.versions.find((v) => v.id === ledger.price_version);
    const after = (trip.after ?? {}) as { since?: unknown };
    const channel = (o: OutboxRow, ch: "telegram" | "email"): AlertOutcome => ({
      status: o[`${ch}_status`],
      attempts: Number(o[`${ch}_attempts`]),
      deliveredAt: msOrNull(o[`${ch}_delivered_at`]),
      ref: o[`${ch}_ref`],
      error: o[`${ch}_error`],
    });
    return {
      stack: this.deps.stack,
      ceiling: row.ceiling,
      periodKey: row.period_key,
      crossedAt,
      degradedAt: typeof after.since === "string" ? Date.parse(after.since) : crossedAt,
      setDegraded: d.degraded_now === true,
      crossedAtReal: ms(trip.recorded_at),
      crossing: {
        before: big(d.spent_before_micro),
        after: big(d.spent_after_micro),
        ceiling: big(d.ceiling_micro, row.ceiling === "day" ? env.dailyMicro : env.monthlyMicro),
        ledgerId: row.ledger_id,
        traceId: text(d.trace_id),
        provider: text(d.provider),
        model: text(d.model),
        attribution: text(d.attribution),
        costMicro: big(d.cost_micro),
      },
      meters: {
        day: line("day", "ceiling_micro"),
        month: line("month", "ceiling_micro"),
        fallbackDay: {
          ...line("fallback_day", "allowance_micro"),
          grantNo: typeof fallback.grant_no === "number" ? fallback.grant_no : 1,
        },
      },
      lastCalls,
      hourly,
      daily,
      audit,
      config: {
        routingSha: ledger.routing_sha,
        priceVersion: ledger.price_version,
        effectiveFrom: version?.effectiveFrom ?? null,
        dailyMicro: env.dailyMicro,
        monthlyMicro: env.monthlyMicro,
        fallbackDailyMicro: env.fallbackDailyMicro,
        warnRatioBp: env.warnRatioBp,
        inFlight: budgets.limits.global.meteredInFlight,
      },
      alerts: alerts.map((a) => ({ key: a.dedupe_key, telegram: channel(a, "telegram"), email: channel(a, "email") })),
      fallbackId: this.deps.fallbackId,
      ports: this.ports,
    };
  }

  /**
   * The file, under a temporary name, synced, mode 0640, then renamed to the first free name: an earlier store's
   * draft of the same date, stack, and ceiling keeps its file. Resolves to the path relative to the state directory.
   */
  private async write(date: string, ceiling: "day" | "month", content: string): Promise<string> {
    const dir = join(this.deps.stateDir, "incidents");
    await mkdir(dir, { recursive: true, mode: 0o750 });
    const temp = join(dir, `.draft-${randomUUID()}.tmp`);
    const file = await open(temp, "wx", 0o640);
    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await chmod(temp, 0o640); // whatever the umask took off
      for (let n = 1; n <= 1_000; n++) {
        const name = draftName(date, this.deps.stack, ceiling, n);
        const taken = await lstat(join(dir, name)).then(
          () => true,
          (err: NodeJS.ErrnoException) => {
            if (err.code === "ENOENT") return false;
            throw err;
          },
        );
        if (taken) continue;
        await rename(temp, join(dir, name));
        await syncDir(dir);
        return `incidents/${name}`;
      }
      throw Object.assign(new Error("no free name"), { code: "EEXIST" });
    } catch (err) {
      await unlink(temp).catch(() => {});
      throw err;
    }
  }

  /** The row stays queued with the error class; the failure is logged when it starts, or changes class. */
  private async writeFailed(row: QueuedRow, cls: string): Promise<void> {
    if (row.error !== cls) {
      this.deps.logger.warn(
        { event: "incident.draft_failed", incident_id: Number(toBigInt(row.id)), error_class: cls },
        "An incident draft couldn't be written; it is tried again every 10 s.",
      );
    }
    await this.deps.store
      .query("UPDATE gateway.incidents SET error = $2 WHERE id = $1 AND status = 'queued'", [row.id, cls])
      .catch(() => {});
  }
}
