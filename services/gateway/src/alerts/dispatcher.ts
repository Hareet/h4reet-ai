// The alert dispatcher (contracts/alerts.md §4; data-model.md §2.7, §7.7), in the gateway process, so no second
// service needs egress.
//
// - It wakes on LISTEN alert_outbox, or every 2 s, and claims due rows with FOR UPDATE SKIP LOCKED, one channel at a
//   time, each on its own: one channel's failure never delays or stops the other.
// - Attempt k of a channel is due at enqueued_at plus the k-th offset: 0, 5, 20, 50, 110, and 230 s, the running sums
//   of retry.schedule_s; an attempt due before the previous one ended starts right after it. A channel still
//   undelivered when its next attempt would pass give_up_after_s (300 s) is marked failed. Real time throughout, so a
//   dev test-clock jump neither speeds the schedule up nor stalls it.
// - A claimed row's next_at moves past two sends' timeouts first (a lease), so a stalled process can't send it twice
//   at once, and an attempt that falls back to the plain form makes both sends inside it (spec 011, FR-028); after a
//   restart, a channel whose 300 s window has passed is marked failed without another attempt.
// - Each attempt sends each channel's form as forms.ts chooses it, rendered then from the row's facts (spec 011, plan
//   D1): the designed form, or the plain text. A Telegram 400 or a mail server's 5xx to the message's data sends the
//   plain form at once, in the same attempt; the attempt counts once, and the channel stays plain for that alert.
//   Each attempt records its form, and a fallback its reason, counted and logged, with an alert.deliver span.
// - The outcome of each attempt is written back as a status, a reference, and an error class only: the Telegram URL
//   holds the bot token, and response bodies stay out. An outcome the store can't take is kept and written later.
// - When the store has been unreachable for 60 s, it sends one in-memory store_unreachable alert on both channels, with
//   the same schedule: the outbox is in the store that is down.
// - Every 10 s, the daily reminder: at or after 09:00 UTC on the gateway clock, while degraded or awaiting renewal,
//   one reminder row a day, for a condition that began before that day's reminder time.
// Degradation never waits on any of this: the rows were committed with their cause.
import { SpanKind, trace, type Tracer } from "@opentelemetry/api";

import type { AlertsConfig, Budgets, EnvClass, StackName } from "../config/validate.js";
import { thresholds } from "../config/validate.js";
import { dayKey, gatewayTime, periodKeys, type GatewayClock } from "../core/clock.js";
import { meterFactsOf } from "../meter/crossings.js";
import { readPeriodRows } from "../meter/rollover.js";
import type { Store } from "../meter/store.js";
import type { AlertChannel, AlertKind, AlertMetricKind, GatewayMetrics } from "../telemetry/metrics.js";
import { ALERT_DELIVER_SPAN, alertDeliverAttributes } from "../telemetry/otel.js";
import { renderAlert, type AlertSpec } from "./format.js";
import {
  formsFor,
  RENDERERS,
  type AlertForm,
  type DesignedEmail,
  type DesignedRenderers,
  type FallbackReason,
  type SampleMark,
  type TelegramMessage,
} from "./forms.js";
import { dedupeKey, queueAlert } from "./outbox.js";
import { sendEmail, type EmailChannel } from "./smtp.js";
import { sendTelegram, type DeliveryResult, type TelegramChannel, type TelegramSend } from "./telegram.js";

export const DISPATCH_INTERVAL_MS = 2_000;
export const REMINDER_INTERVAL_MS = 10_000;
/** How many due rows one tick claims per channel. */
const CLAIM_BATCH = 20;

// ---------------------------------------------------------------------------------------------------------------
// The channels, from the environment (config-files.md §4.4; alerts.md §4.3)
// ---------------------------------------------------------------------------------------------------------------

export interface Channels {
  mode: "real" | "standin";
  telegram: TelegramChannel;
  email: EmailChannel;
}

/**
 * Stand-in mode's addresses: they exist only inside the stack, where Mailpit takes everything. The contract names no
 * stand-in From and To (alerts.md §4.3), so these are dev-cpu.vars' own dummies (tasks.md T077).
 */
export const STANDIN_EMAIL = { from: "alerts@h4reet.local", to: "operator@h4reet.local" } as const;

/**
 * ALERT_DELIVERY's choice. Real mode takes the env file's channel keys, which validate-env.ts has already held to the
 * Bot API and to TLS; stand-in mode takes config/alerts.yaml's in-network endpoints, the dummy token `standin`, chat
 * 0, and no SMTP AUTH, and ignores the real keys. Never logged: it holds the bot token and the mailbox's password.
 */
export function channelsFrom(env: Readonly<Record<string, string | undefined>>, alerts: AlertsConfig): Channels {
  const telegramTimeout = alerts.channels.telegram.timeoutMs;
  const emailTimeout = alerts.channels.email.timeoutMs;
  if (env.ALERT_DELIVERY === "real") {
    return {
      mode: "real",
      telegram: {
        base: env.TELEGRAM_API_BASE ?? "",
        token: env.TELEGRAM_BOT_TOKEN ?? "",
        chatId: env.TELEGRAM_CHAT_ID ?? "",
        timeoutMs: telegramTimeout,
      },
      email: {
        host: env.SMTP_HOST ?? "",
        port: Number(env.SMTP_PORT ?? 0),
        secure: env.SMTP_TLS === "implicit",
        requireTLS: env.SMTP_TLS === "starttls",
        ignoreTLS: false,
        auth: { user: env.SMTP_USER ?? "", pass: env.SMTP_PASSWORD ?? "" },
        from: env.ALERT_EMAIL_FROM ?? "",
        to: env.ALERT_EMAIL_TO ?? "",
        timeoutMs: emailTimeout,
      },
    };
  }
  return {
    mode: "standin",
    telegram: { base: alerts.standin.telegramBase, token: "standin", chatId: "0", timeoutMs: telegramTimeout },
    email: {
      host: alerts.standin.smtpHost,
      port: alerts.standin.smtpPort,
      secure: false,
      requireTLS: false,
      ignoreTLS: true,
      from: STANDIN_EMAIL.from,
      to: STANDIN_EMAIL.to,
      timeoutMs: emailTimeout,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The schedule (pure)
// ---------------------------------------------------------------------------------------------------------------

/** Each attempt's offset from enqueued_at, in seconds: 0, then the running sums of the waits (§4.2). */
export function attemptOffsets(scheduleS: readonly number[]): number[] {
  const out = [0];
  for (const s of scheduleS) out.push((out.at(-1) ?? 0) + s);
  return out;
}

/**
 * When a channel's next attempt is due, after `made` attempts, the last of which ended at `nowMs`; undefined once it
 * gives up: no attempt left, or the next would pass give_up_after_s.
 */
export function nextAttemptAt(
  enqueuedAtMs: number,
  made: number,
  nowMs: number,
  retry: AlertsConfig["retry"],
): number | undefined {
  const offsets = attemptOffsets(retry.scheduleS);
  const offset = offsets[made];
  if (offset === undefined) return undefined;
  const due = Math.max(enqueuedAtMs + offset * 1_000, nowMs);
  if (due > enqueuedAtMs + retry.giveUpAfterS * 1_000) return undefined;
  return due;
}

/**
 * Today's reminder, when it is due (alerts.md §2, §3): at or after the reminder time on the gateway clock, while the
 * stack is degraded or awaiting renewal, for a condition that began before today's reminder time. A trip later in the
 * day is reminded of the next morning, as §3's example shows.
 */
export function reminderDue(o: {
  state: "normal" | "degraded";
  since: number;
  crossed: readonly string[];
  awaiting: boolean;
  awaitingSince: number | null;
  nowMs: number;
  at: { hour: number; minute: number };
}): { day: string; spec: Extract<AlertSpec, { kind: "reminder" }> } | undefined {
  const day = dayKey(o.nowMs);
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const at = Date.UTC(y, m - 1, d, o.at.hour, o.at.minute);
  if (o.nowMs < at) return undefined;
  const degradedSince = o.state === "degraded" ? o.since : undefined;
  const awaitingSince = o.awaiting && o.awaitingSince !== null ? o.awaitingSince : undefined;
  const starts = [degradedSince, awaitingSince].filter((t): t is number => t !== undefined);
  if (starts.length === 0 || Math.min(...starts) >= at) return undefined;
  return {
    day,
    spec: {
      kind: "reminder",
      crossed: [...o.crossed],
      ...(degradedSince === undefined ? {} : { degradedSince }),
      ...(awaitingSince === undefined ? {} : { awaitingSince }),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------------------------------------------

export interface DispatcherDeps {
  stack: StackName;
  envClass: EnvClass;
  store: Store;
  alerts: AlertsConfig;
  budgets: Budgets;
  channels: Channels;
  /** Whether this stack routes a fallback: the reminder's Fallback line says none without one. */
  hasFallback: boolean;
  clock: GatewayClock;
  metrics: GatewayMetrics;
  logger: {
    info(record: object, msg: string): void;
    warn(record: object, msg: string): void;
    error(record: object, msg: string): void;
  };
  realNow: () => number;
  /** The channels' senders; the real ones by default, stubs in tests. */
  send?: {
    telegram?: (channel: TelegramChannel, message: string | TelegramSend) => Promise<DeliveryResult>;
    email?: (
      channel: EmailChannel,
      mail: { subject: string; text: string; html?: string; alertId: string },
    ) => Promise<DeliveryResult>;
  };
  /** The designed renderers (spec 011); the registered ones by default (forms.ts), stubs in tests. */
  renderers?: DesignedRenderers;
  /** alert.deliver's tracer; the global one by default. */
  tracer?: Tracer;
  intervalMs?: number;
  reminderIntervalMs?: number;
}

const CHANNELS: readonly AlertChannel[] = ["telegram", "email"];
/** The outbox's columns of each channel: a fixed name, never one a caller supplies. */
const PREFIX: Readonly<Record<AlertChannel, "telegram" | "email">> = { telegram: "telegram", email: "email" };

/** What one attempt sends from: an outbox row, the in-memory store_unreachable alert, or a sample. */
interface AttemptInput {
  dedupeKey: string;
  /** h4.alert.kind: the alert's kind, or sample. */
  kind: AlertMetricKind;
  subject: string;
  body: string;
  /** The facts the designed forms render from (facts.ts). */
  facts: unknown;
  enqueuedAt: number;
  /** Attempts made, this one included. */
  attempts: number;
  /** The form and fallback reason the channel's last attempt recorded, or null before its first. */
  form: AlertForm | null;
  fallback: FallbackReason | null;
  sample?: SampleMark;
}

interface Claimed extends AttemptInput {
  id: number;
  kind: AlertKind;
}

interface Outcome {
  status: "pending" | "delivered" | "failed";
  nextAt: number | null;
  deliveredAt: number | null;
  ref: string | null;
  error: string | null;
  /** The form this attempt sent, and the reason when it was the plain form in the designed one's place. */
  form: AlertForm;
  fallback: FallbackReason | null;
}

interface MemoryChannel {
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAt: number;
  error: string | null;
  form: AlertForm | null;
  fallback: FallbackReason | null;
}

interface MemoryAlert {
  dedupeKey: string;
  kind: AlertMetricKind;
  subject: string;
  body: string;
  facts: unknown;
  enqueuedAt: number;
  sample?: SampleMark;
  channels: Record<AlertChannel, MemoryChannel>;
}

const DESIGNED: { telegram: AlertForm; email: AlertForm } = { telegram: "designed", email: "designed" };
/** A Telegram answer that refuses a designed message's entities (FR-026): its HTTP status, or its error_code. */
const ENTITIES_REFUSED = new Set(["http_400", "telegram_400"]);

const iso = (ms: number): string => new Date(ms).toISOString();
const pendingChannel = (now: number): MemoryChannel => ({
  status: "pending",
  attempts: 0,
  nextAt: now,
  error: null,
  form: null,
  fallback: null,
});

/** What asking for an alert row came to: queued now, already there, or not now (the store was empty, down, or failed). */
export type QueueAnswer = "queued" | "present" | "retry";

export class Dispatcher {
  private timer: NodeJS.Timeout | undefined;
  private reminderTimer: NodeJS.Timeout | undefined;
  private unlisten: (() => Promise<void>) | undefined;
  /** The LISTEN connection being made or held, while it lasts: its end clears it, and the next pass listens again. */
  private listening: object | undefined;
  private ticking: Promise<void> | undefined;
  private again = false;
  private stopped = true;
  /** Outcomes the store couldn't take yet, by channel and row. */
  private readonly unwritten = new Map<string, { channel: AlertChannel; id: number; outcome: Outcome }>();
  private readonly memory: MemoryAlert[] = [];
  /** The outage whose store_unreachable alert went out: one per outage, deduplicated in memory. */
  private alertedOutage: number | undefined;

  private readonly tracer: Tracer;

  constructor(private readonly deps: DispatcherDeps) {
    this.tracer = deps.tracer ?? trace.getTracer("h4-gateway");
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), this.deps.intervalMs ?? DISPATCH_INTERVAL_MS);
    this.timer.unref();
    this.reminderTimer = setInterval(
      () => void this.remind().catch(() => {}),
      this.deps.reminderIntervalMs ?? REMINDER_INTERVAL_MS,
    );
    this.reminderTimer.unref();
    void this.tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    if (this.reminderTimer !== undefined) clearInterval(this.reminderTimer);
    this.timer = undefined;
    this.reminderTimer = undefined;
    await this.ticking?.catch(() => {});
    const unlisten = this.unlisten;
    this.listening = undefined;
    this.unlisten = undefined;
    await unlisten?.().catch(() => {});
  }

  /** One pass: LISTEN if it isn't yet, the outcomes kept back, the in-memory alerts, then each channel's due rows. */
  tick(): Promise<void> {
    if (this.ticking !== undefined) {
      this.again = true;
      return this.ticking;
    }
    this.ticking = (async () => {
      try {
        do {
          this.again = false;
          await this.pass();
        } while (this.again && !this.stopped);
      } finally {
        this.ticking = undefined;
      }
    })();
    return this.ticking;
  }

  private async pass(): Promise<void> {
    const now = this.deps.realNow();
    if (!this.stopped && this.listening === undefined && this.deps.store.status === "ready") await this.listen();
    await this.flushUnwritten();
    this.noteOutage(now);
    await this.deliverMemory();
    await Promise.all(CHANNELS.map((channel) => this.deliverRows(channel).catch(() => {})));
  }

  /**
   * LISTEN alert_outbox on its own connection. When that connection ends, as when Postgres restarts under the running
   * gateway, the next pass listens again on a fresh one; the 2 s poll covers the gap.
   */
  private async listen(): Promise<void> {
    const token = {};
    this.listening = token;
    const ended = (): void => {
      if (this.listening !== token) return;
      this.listening = undefined;
      this.unlisten = undefined;
    };
    try {
      const close = await this.deps.store.listen("alert_outbox", () => void this.tick(), ended);
      if (this.listening === token) this.unlisten = close;
      else await close(); // it ended, or the dispatcher stopped, before it was in place
    } catch {
      ended(); // no connection: the next pass tries again
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // The outbox's rows
  // -------------------------------------------------------------------------------------------------------------

  private async deliverRows(channel: AlertChannel): Promise<void> {
    const { store, alerts } = this.deps;
    if (store.status !== "ready") return;
    const p = PREFIX[channel];
    const now = this.deps.realNow();
    const held = [...this.unwritten.values()].filter((u) => u.channel === channel).map((u) => u.id);
    // A window that has passed (a restart, a long outage): failed, with no attempt more.
    const expired = await store.query<{
      dedupe_key: string;
      kind: AlertKind;
      attempts: unknown;
      error: string | null;
      form: AlertForm | null;
    }>(
      `UPDATE gateway.alert_outbox SET ${p}_status = 'failed', ${p}_next_at = NULL, ${p}_error = coalesce(${p}_error, 'expired')
       WHERE ${p}_status = 'pending' AND enqueued_at <= $1 AND NOT (id = ANY ($2::bigint[]))
       RETURNING dedupe_key, kind, ${p}_attempts AS attempts, ${p}_error AS error, ${p}_form AS form`,
      [iso(now - alerts.retry.giveUpAfterS * 1_000), held],
    );
    for (const r of expired.rows) {
      // A channel marked failed with no attempt has no form; after attempts, it keeps the last one's.
      this.failed(channel, r.dedupe_key, r.kind, Number(r.attempts), r.error ?? "expired", r.form ?? "none");
    }
    // The due rows, leased past two sends' timeouts: an attempt that falls back makes both inside it (FR-028).
    const lease = now + 2 * this.timeoutOf(channel) + 5_000;
    const { rows } = await store.query<{
      id: unknown;
      dedupe_key: string;
      kind: AlertKind;
      subject: string;
      body: string;
      facts: unknown;
      enqueued_at: Date | string;
      attempts: unknown;
      form: AlertForm | null;
      fallback: FallbackReason | null;
    }>(
      `UPDATE gateway.alert_outbox SET ${p}_attempts = ${p}_attempts + 1, ${p}_next_at = $2
       WHERE id IN (
         SELECT id FROM gateway.alert_outbox
         WHERE ${p}_status = 'pending' AND ${p}_next_at <= $1 AND NOT (id = ANY ($3::bigint[]))
         ORDER BY ${p}_next_at, id LIMIT ${CLAIM_BATCH} FOR UPDATE SKIP LOCKED)
       RETURNING id, dedupe_key, kind, subject, body, facts, enqueued_at, ${p}_attempts AS attempts,
         ${p}_form AS form, ${p}_fallback AS fallback`,
      [iso(now), iso(lease), held],
    );
    for (const r of rows) {
      const claimed: Claimed = {
        id: Number(r.id),
        dedupeKey: r.dedupe_key,
        kind: r.kind,
        subject: r.subject,
        body: r.body,
        facts: r.facts,
        enqueuedAt: new Date(r.enqueued_at).getTime(),
        attempts: Number(r.attempts),
        form: r.form,
        fallback: r.fallback,
      };
      const outcome = await this.attempt(channel, claimed);
      await this.write(channel, claimed.id, outcome);
    }
  }

  private timeoutOf(channel: AlertChannel): number {
    return channel === "telegram" ? this.deps.channels.telegram.timeoutMs : this.deps.channels.email.timeoutMs;
  }

  /**
   * One attempt on one channel: its form, chosen and rendered now (forms.ts); the send, and at once the plain form's
   * after a refusal of the designed one (FR-026, FR-027); its metrics, its log, and its alert.deliver span. Resolves to
   * the outcome to record, which is the last send's.
   */
  private async attempt(channel: AlertChannel, a: AttemptInput): Promise<Outcome> {
    const span = this.tracer.startSpan(ALERT_DELIVER_SPAN, { kind: SpanKind.INTERNAL, root: true });
    try {
      const outcome = await this.attemptForms(channel, a);
      const result = outcome.status === "delivered" ? "delivered" : outcome.status === "failed" ? "failed" : "retry";
      span.setAttributes(
        alertDeliverAttributes({
          channel,
          kind: a.kind,
          form: outcome.form,
          fallbackReason: outcome.fallback,
          outcome: result,
          attempt: a.attempts,
          sample: a.sample !== undefined,
        }),
      );
      return outcome;
    } finally {
      span.end();
    }
  }

  private async attemptForms(channel: AlertChannel, a: AttemptInput): Promise<Outcome> {
    const input = {
      facts: a.facts,
      dedupeKey: a.dedupeKey,
      form: a.form,
      fallback: a.fallback,
      ...(a.sample === undefined ? {} : { sample: a.sample }),
    };
    const opts = { formats: this.deps.alerts.formats ?? DESIGNED, renderers: this.deps.renderers ?? RENDERERS };
    const chosen = channel === "telegram" ? formsFor("telegram", input, opts) : formsFor("email", input, opts);
    let form: AlertForm = chosen.form;
    let fallback: FallbackReason | null = chosen.form === "plain" ? chosen.reason : null;
    let result: DeliveryResult;
    if (chosen.form === "designed") {
      result = await this.sendDesigned(channel, a, chosen.designed);
      const refused = this.refusalOf(channel, result);
      if (refused !== undefined) {
        // The plain form at once, in the same attempt and under the same lease (FR-026 to FR-028).
        this.fellBack(channel, a, refused, result.ok ? undefined : result.errorClass);
        form = "plain";
        fallback = refused;
        result = await this.sendPlain(channel, a);
      }
    } else {
      // A fallback decided now is counted now; one kept from an earlier attempt was counted then.
      if (chosen.reason !== null && !chosen.kept) this.fellBack(channel, a, chosen.reason, undefined);
      result = await this.sendPlain(channel, a);
    }
    return this.settle(channel, a, result, form, fallback);
  }

  /** A refusal of the designed form that the plain one goes at once after: Telegram's 400, a mail server's 5xx. */
  private refusalOf(channel: AlertChannel, result: DeliveryResult): FallbackReason | undefined {
    if (result.ok) return undefined;
    if (channel === "telegram") return ENTITIES_REFUSED.has(result.errorClass) ? "entities_refused" : undefined;
    return result.messageRefused === true ? "message_refused" : undefined;
  }

  /** A fallback (FR-045): counted, and logged as alert.fallback with the refused send's class, if one was refused. */
  private fellBack(channel: AlertChannel, a: AttemptInput, reason: FallbackReason, errorClass: string | undefined): void {
    this.deps.metrics.alertFallback({ channel, kind: a.kind, reason });
    this.deps.logger.warn(
      {
        event: "alert.fallback",
        dedupe_key: a.dedupeKey,
        kind: a.kind,
        channel,
        attempt: a.attempts,
        reason,
        ...(errorClass === undefined ? {} : { error_class: errorClass }),
      },
      "An alert went in its plain form in place of the designed one.",
    );
  }

  /** The attempt's outcome from its last send: delivered, another attempt due, or failed; with its metrics and log. */
  private settle(
    channel: AlertChannel,
    a: AttemptInput,
    result: DeliveryResult,
    form: AlertForm,
    fallback: FallbackReason | null,
  ): Outcome {
    const end = this.deps.realNow();
    const formFields = { form, ...(fallback === null ? {} : { fallback_reason: fallback }) };
    if (result.ok) {
      const lag = Math.max(0, end - a.enqueuedAt) / 1_000;
      this.deps.metrics.alertAttempt({ channel, kind: a.kind, outcome: "delivered", form });
      // Lag is an alert's alone: a sample has no kind to keep it apart (plan §7.4).
      if (a.sample === undefined) this.deps.metrics.alertDeliveryLag(lag);
      this.deps.logger.info(
        {
          event: "alert.delivered",
          dedupe_key: a.dedupeKey,
          kind: a.kind,
          channel,
          attempt: a.attempts,
          lag_s: Math.round(lag * 1_000) / 1_000,
          provider_ref: result.ref,
          ...formFields,
        },
        "An alert was delivered.",
      );
      return { status: "delivered", nextAt: null, deliveredAt: end, ref: result.ref, error: null, form, fallback };
    }
    const next = nextAttemptAt(a.enqueuedAt, a.attempts, end, this.deps.alerts.retry);
    if (next === undefined) {
      this.failed(channel, a.dedupeKey, a.kind, a.attempts, result.errorClass, form);
      return { status: "failed", nextAt: null, deliveredAt: null, ref: null, error: result.errorClass, form, fallback };
    }
    this.deps.metrics.alertAttempt({ channel, kind: a.kind, outcome: "retry", form });
    this.deps.logger.warn(
      {
        event: "alert.retry",
        dedupe_key: a.dedupeKey,
        channel,
        attempt: a.attempts,
        error_class: result.errorClass,
        next_in_s: Math.max(0, Math.round((next - end) / 1_000)),
        form,
      },
      "An alert's delivery attempt failed; another is due.",
    );
    return { status: "pending", nextAt: next, deliveredAt: null, ref: null, error: result.errorClass, form, fallback };
  }

  private failed(
    channel: AlertChannel,
    key: string,
    kind: AlertMetricKind,
    attempts: number,
    errorClass: string,
    form: AlertForm | "none",
  ): void {
    this.deps.metrics.alertAttempt({ channel, kind, outcome: "failed", form });
    this.deps.logger.error(
      { event: "alert.failed", dedupe_key: key, channel, attempts, error_class: errorClass, form },
      "An alert's channel gave up.",
    );
  }

  /** The plain form: the stored text on Telegram, and today's message on email, line 1 as its subject. */
  private sendPlain(channel: AlertChannel, a: AttemptInput): Promise<DeliveryResult> {
    const send = this.deps.send ?? {};
    if (channel === "telegram") return (send.telegram ?? sendTelegram)(this.deps.channels.telegram, a.body);
    return (send.email ?? sendEmail)(this.deps.channels.email, {
      subject: a.subject,
      text: a.body,
      alertId: a.dedupeKey,
    });
  }

  /** The designed form: Telegram's text with its entities; the email's HTML beside the plain text, its subject. */
  private sendDesigned(
    channel: AlertChannel,
    a: AttemptInput,
    designed: TelegramMessage | DesignedEmail,
  ): Promise<DeliveryResult> {
    const send = this.deps.send ?? {};
    if (channel === "telegram") {
      const m = designed as TelegramMessage;
      return (send.telegram ?? sendTelegram)(this.deps.channels.telegram, { text: m.text, entities: m.entities });
    }
    const e = designed as DesignedEmail;
    return (send.email ?? sendEmail)(this.deps.channels.email, {
      subject: e.subject,
      text: a.body,
      html: e.html,
      alertId: a.dedupeKey,
    });
  }

  private async write(channel: AlertChannel, id: number, outcome: Outcome): Promise<void> {
    const p = PREFIX[channel];
    try {
      await this.deps.store.query(
        `UPDATE gateway.alert_outbox SET ${p}_status = $2, ${p}_next_at = $3, ${p}_delivered_at = $4, ${p}_ref = $5,
           ${p}_error = $6, ${p}_form = $7, ${p}_fallback = $8
         WHERE id = $1`,
        [
          id,
          outcome.status,
          outcome.nextAt === null ? null : iso(outcome.nextAt),
          outcome.deliveredAt === null ? null : iso(outcome.deliveredAt),
          outcome.ref,
          outcome.error,
          outcome.form,
          outcome.fallback,
        ],
      );
      this.unwritten.delete(`${channel}:${id}`);
    } catch {
      // The store went away mid-delivery: the outcome is kept, and written when it answers (alerts.md §4.4).
      this.unwritten.set(`${channel}:${id}`, { channel, id, outcome });
    }
  }

  private async flushUnwritten(): Promise<void> {
    for (const u of [...this.unwritten.values()]) await this.write(u.channel, u.id, u.outcome);
  }

  /** One attempt of an in-memory alert on one channel, its outcome kept in memory, its form state too. */
  private async attemptMemory(alert: MemoryAlert, channel: AlertChannel, c: MemoryChannel): Promise<void> {
    const outcome = await this.attempt(channel, {
      dedupeKey: alert.dedupeKey,
      kind: alert.kind,
      subject: alert.subject,
      body: alert.body,
      facts: alert.facts,
      enqueuedAt: alert.enqueuedAt,
      attempts: c.attempts,
      form: c.form,
      fallback: c.fallback,
      ...(alert.sample === undefined ? {} : { sample: alert.sample }),
    });
    c.status = outcome.status;
    c.error = outcome.error;
    c.form = outcome.form;
    c.fallback = outcome.fallback;
    if (outcome.nextAt !== null) c.nextAt = outcome.nextAt;
  }

  /** The in-memory alerts not yet final on both channels. */
  memoryAlerts(): readonly { dedupeKey: string; channels: Record<AlertChannel, MemoryChannel> }[] {
    return this.memory;
  }

  // -------------------------------------------------------------------------------------------------------------
  // The in-memory store_unreachable alert (alerts.md §2, §4.4)
  // -------------------------------------------------------------------------------------------------------------

  private noteOutage(now: number): void {
    const since = this.deps.store.outageStartedAt();
    if (since === undefined || this.alertedOutage === since) return;
    const afterS = this.deps.alerts.storeUnreachableAfterS;
    if (now - since < afterS * 1_000) return;
    this.alertedOutage = since;
    const key = dedupeKey.storeUnreachable(this.deps.stack, since);
    const offset = this.deps.clock.offsetMs();
    const rendered = renderAlert(
      {
        stack: this.deps.stack,
        envClass: this.deps.envClass,
        prefix: this.deps.alerts.prefixes[this.deps.stack],
        dedupeKey: key,
        at: gatewayTime(now, offset),
        testClock: offset !== null,
        runtime: { state: "unknown", since: gatewayTime(since, offset) },
        fallback: { state: "unknown" },
      },
      { kind: "store_unreachable", since: gatewayTime(since, offset), afterS },
    );
    this.memory.push({
      dedupeKey: key,
      kind: "store_unreachable",
      subject: rendered.subject,
      body: rendered.body,
      facts: rendered.facts,
      enqueuedAt: now,
      channels: { telegram: pendingChannel(now), email: pendingChannel(now) },
    });
  }

  private async deliverMemory(): Promise<void> {
    for (const alert of [...this.memory]) {
      await Promise.all(
        CHANNELS.map(async (channel) => {
          const c = alert.channels[channel];
          const now = this.deps.realNow();
          if (c.status !== "pending" || c.nextAt > now) return;
          if (now > alert.enqueuedAt + this.deps.alerts.retry.giveUpAfterS * 1_000) {
            c.status = "failed";
            this.failed(channel, alert.dedupeKey, alert.kind, c.attempts, c.error ?? "expired", c.form ?? "none");
            return;
          }
          c.attempts += 1;
          await this.attemptMemory(alert, channel, c);
        }),
      );
      if (CHANNELS.every((ch) => alert.channels[ch].status !== "pending"))
        this.memory.splice(this.memory.indexOf(alert), 1);
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // fallback_unavailable (alerts.md §2, §3; data-model.md §7.7)
  // -------------------------------------------------------------------------------------------------------------

  /**
   * A paid fallback adapter turned unhealthy: one row, keyed by the adapter and the hour on the gateway clock, so at
   * most one an hour per adapter. While the store is empty or down, its own state answers for the stack and nothing is
   * queued. Resolves true when this call queued it.
   */
  async fallbackUnavailable(adapter: string, reason: "credentials" | "circuit_open", label?: string): Promise<boolean> {
    const { deps } = this;
    if (deps.store.status !== "ready") return false;
    const read = await deps.store.readStackState();
    if (read.kind !== "ok") return false;
    const now = gatewayTime(deps.realNow(), read.testClockOffsetMs);
    const key = dedupeKey.fallbackUnavailable(deps.stack, adapter, now);
    const t = thresholds(deps.budgets.envs[deps.envClass]);
    const periods = periodKeys(now);
    let queued: boolean;
    try {
      queued = await deps.store.transaction(async (q) =>
        queueAlert(
          q,
          {
            stack: deps.stack,
            envClass: deps.envClass,
            prefix: deps.alerts.prefixes[deps.stack],
            dedupeKey: key,
            at: now,
            testClock: read.testClockOffsetMs !== null,
            runtime:
              read.state === "degraded" ? { state: "degraded", since: read.since.getTime() } : { state: "normal" },
            fallback:
              read.fallbackAwaitingRenewal && read.fallbackAwaitingSince !== null
                ? { state: "awaiting", since: read.fallbackAwaitingSince.getTime() }
                : { state: "available" },
            meters: meterFactsOf(await readPeriodRows(q, periods), t),
          },
          { kind: "fallback_unavailable", adapter, reason, ...(label === undefined ? {} : { label }) },
          deps.realNow(),
        ),
      );
    } catch {
      return false; // the store failed under it: its outage is noted, and the store_unreachable alert covers it
    }
    if (queued) {
      deps.logger.info(
        { event: "alert.queued", dedupe_key: key, kind: "fallback_unavailable" },
        "An alert was queued.",
      );
    }
    return queued;
  }

  // -------------------------------------------------------------------------------------------------------------
  // credentials_expiring (alerts.md §2, §3; data-model.md §7.7)
  // -------------------------------------------------------------------------------------------------------------

  /**
   * A paid adapter's SSO session ends within its warning lead time: one row, keyed by the adapter and the session's
   * end to the minute, so one per session however often the ticker asks. Resolves `queued` when this call queued it,
   * `present` when the row was already there, and `retry` when nothing could be queued: the store was empty, down, or
   * failed under it, and the next tick asks again.
   */
  async credentialsExpiring(adapter: string, label: string, endsAt: number): Promise<QueueAnswer> {
    const { deps } = this;
    if (deps.store.status !== "ready") return "retry";
    const read = await deps.store.readStackState();
    if (read.kind !== "ok") return "retry";
    const now = gatewayTime(deps.realNow(), read.testClockOffsetMs);
    const key = dedupeKey.credentialsExpiring(deps.stack, adapter, endsAt);
    const t = thresholds(deps.budgets.envs[deps.envClass]);
    const periods = periodKeys(now);
    let queued: boolean;
    try {
      queued = await deps.store.transaction(async (q) =>
        queueAlert(
          q,
          {
            stack: deps.stack,
            envClass: deps.envClass,
            prefix: deps.alerts.prefixes[deps.stack],
            dedupeKey: key,
            at: now,
            testClock: read.testClockOffsetMs !== null,
            runtime:
              read.state === "degraded" ? { state: "degraded", since: read.since.getTime() } : { state: "normal" },
            fallback:
              read.fallbackAwaitingRenewal && read.fallbackAwaitingSince !== null
                ? { state: "awaiting", since: read.fallbackAwaitingSince.getTime() }
                : { state: "available" },
            meters: meterFactsOf(await readPeriodRows(q, periods), t),
          },
          { kind: "credentials_expiring", adapter, label, endsAt },
          deps.realNow(),
        ),
      );
    } catch {
      return "retry"; // the store failed under it: its outage is noted, and the next tick asks again
    }
    if (!queued) return "present";
    deps.logger.info({ event: "alert.queued", dedupe_key: key, kind: "credentials_expiring" }, "An alert was queued.");
    return "queued";
  }

  // -------------------------------------------------------------------------------------------------------------
  // The daily reminder (alerts.md §2, §3; data-model.md §7.7)
  // -------------------------------------------------------------------------------------------------------------

  /** Queues today's reminder when it is due; resolves true when this call queued it. */
  async remind(): Promise<boolean> {
    const { deps } = this;
    if (deps.store.status !== "ready") return false;
    const read = await deps.store.readStackState();
    if (read.kind !== "ok") return false;
    const now = gatewayTime(deps.realNow(), read.testClockOffsetMs);
    const due = reminderDue({
      state: read.state,
      since: read.since.getTime(),
      crossed: read.crossed,
      awaiting: read.fallbackAwaitingRenewal,
      awaitingSince: read.fallbackAwaitingSince?.getTime() ?? null,
      nowMs: now,
      at: { hour: deps.alerts.reminder.hour, minute: deps.alerts.reminder.minute },
    });
    if (due === undefined) return false;
    const key = dedupeKey.reminder(deps.stack, due.day);
    const t = thresholds(deps.budgets.envs[deps.envClass]);
    const queued = await deps.store.transaction(async (q) => {
      const rows = await readPeriodRows(q, { day: due.day, month: due.day.slice(0, 7) });
      return queueAlert(
        q,
        {
          stack: deps.stack,
          envClass: deps.envClass,
          prefix: deps.alerts.prefixes[deps.stack],
          dedupeKey: key,
          at: now,
          testClock: read.testClockOffsetMs !== null,
          runtime: read.state === "degraded" ? { state: "degraded", since: read.since.getTime() } : { state: "normal" },
          fallback: !deps.hasFallback
            ? { state: "none" }
            : read.fallbackAwaitingRenewal && read.fallbackAwaitingSince !== null
              ? { state: "awaiting", since: read.fallbackAwaitingSince.getTime() }
              : { state: "available" },
          meters: meterFactsOf(rows, t),
        },
        due.spec,
        deps.realNow(),
      );
    });
    if (queued) deps.logger.info({ event: "alert.queued", dedupe_key: key, kind: "reminder" }, "An alert was queued.");
    return queued;
  }
}
