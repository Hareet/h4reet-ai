// The alert dispatcher (contracts/alerts.md §4; data-model.md §2.7, §7.7), in the gateway process, so no second
// service needs egress.
//
// - It wakes on LISTEN alert_outbox, or every 2 s, and claims due rows with FOR UPDATE SKIP LOCKED, one channel at a
//   time, each on its own: one channel's failure never delays or stops the other.
// - Attempt k of a channel is due at enqueued_at plus the k-th offset: 0, 5, 20, 50, 110, and 230 s, the running sums
//   of retry.schedule_s; an attempt due before the previous one ended starts right after it. A channel still
//   undelivered when its next attempt would pass give_up_after_s (300 s) is marked failed. Real time throughout, so a
//   dev test-clock jump neither speeds the schedule up nor stalls it.
// - A claimed row's next_at moves past its attempt's timeout first (a lease), so a stalled process can't send it twice
//   at once; after a restart, a channel whose 300 s window has passed is marked failed without another attempt.
// - The outcome of each attempt is written back as a status, a reference, and an error class only: the Telegram URL
//   holds the bot token, and response bodies stay out. An outcome the store can't take is kept and written later.
// - When the store has been unreachable for 60 s, it sends one in-memory store_unreachable alert on both channels, with
//   the same schedule: the outbox is in the store that is down.
// - Every 10 s, the daily reminder: at or after 09:00 UTC on the gateway clock, while degraded or awaiting renewal,
//   one reminder row a day, for a condition that began before that day's reminder time.
// Degradation never waits on any of this: the rows were committed with their cause.
import type { AlertsConfig, Budgets, EnvClass, StackName } from "../config/validate.js";
import { thresholds } from "../config/validate.js";
import { dayKey, gatewayTime, type GatewayClock } from "../core/clock.js";
import { meterFactsOf } from "../meter/crossings.js";
import { readPeriodRows } from "../meter/rollover.js";
import type { Store } from "../meter/store.js";
import type { AlertChannel, AlertKind, GatewayMetrics } from "../telemetry/metrics.js";
import { renderAlert, type AlertSpec } from "./format.js";
import { dedupeKey, queueAlert } from "./outbox.js";
import { sendEmail, type EmailChannel } from "./smtp.js";
import { sendTelegram, type DeliveryResult, type TelegramChannel } from "./telegram.js";

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
    telegram?: (channel: TelegramChannel, text: string) => Promise<DeliveryResult>;
    email?: (
      channel: EmailChannel,
      mail: { subject: string; text: string; alertId: string },
    ) => Promise<DeliveryResult>;
  };
  intervalMs?: number;
  reminderIntervalMs?: number;
}

const CHANNELS: readonly AlertChannel[] = ["telegram", "email"];
/** The outbox's columns of each channel: a fixed name, never one a caller supplies. */
const PREFIX: Readonly<Record<AlertChannel, "telegram" | "email">> = { telegram: "telegram", email: "email" };

interface Claimed {
  id: number;
  dedupeKey: string;
  kind: AlertKind;
  subject: string;
  body: string;
  enqueuedAt: number;
  /** Attempts made, this one included. */
  attempts: number;
}

interface Outcome {
  status: "pending" | "delivered" | "failed";
  nextAt: number | null;
  deliveredAt: number | null;
  ref: string | null;
  error: string | null;
}

interface MemoryChannel {
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAt: number;
  error: string | null;
}

interface MemoryAlert {
  dedupeKey: string;
  subject: string;
  body: string;
  enqueuedAt: number;
  channels: Record<AlertChannel, MemoryChannel>;
}

const iso = (ms: number): string => new Date(ms).toISOString();

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

  constructor(private readonly deps: DispatcherDeps) {}

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
    const expired = await store.query<{ dedupe_key: string; kind: AlertKind; attempts: unknown; error: string | null }>(
      `UPDATE gateway.alert_outbox SET ${p}_status = 'failed', ${p}_next_at = NULL, ${p}_error = coalesce(${p}_error, 'expired')
       WHERE ${p}_status = 'pending' AND enqueued_at <= $1 AND NOT (id = ANY ($2::bigint[]))
       RETURNING dedupe_key, kind, ${p}_attempts AS attempts, ${p}_error AS error`,
      [iso(now - alerts.retry.giveUpAfterS * 1_000), held],
    );
    for (const r of expired.rows) this.failed(channel, r.dedupe_key, r.kind, Number(r.attempts), r.error ?? "expired");
    // The due rows, leased past their attempt's timeout.
    const lease = now + this.timeoutOf(channel) + 5_000;
    const { rows } = await store.query<{
      id: unknown;
      dedupe_key: string;
      kind: AlertKind;
      subject: string;
      body: string;
      enqueued_at: Date | string;
      attempts: unknown;
    }>(
      `UPDATE gateway.alert_outbox SET ${p}_attempts = ${p}_attempts + 1, ${p}_next_at = $2
       WHERE id IN (
         SELECT id FROM gateway.alert_outbox
         WHERE ${p}_status = 'pending' AND ${p}_next_at <= $1 AND NOT (id = ANY ($3::bigint[]))
         ORDER BY ${p}_next_at, id LIMIT ${CLAIM_BATCH} FOR UPDATE SKIP LOCKED)
       RETURNING id, dedupe_key, kind, subject, body, enqueued_at, ${p}_attempts AS attempts`,
      [iso(now), iso(lease), held],
    );
    for (const r of rows) {
      const claimed: Claimed = {
        id: Number(r.id),
        dedupeKey: r.dedupe_key,
        kind: r.kind,
        subject: r.subject,
        body: r.body,
        enqueuedAt: new Date(r.enqueued_at).getTime(),
        attempts: Number(r.attempts),
      };
      const outcome = await this.attempt(channel, claimed);
      await this.write(channel, claimed.id, outcome);
    }
  }

  private timeoutOf(channel: AlertChannel): number {
    return channel === "telegram" ? this.deps.channels.telegram.timeoutMs : this.deps.channels.email.timeoutMs;
  }

  /** One attempt on one channel, its metrics and its log; resolves to the outcome to record. */
  private async attempt(
    channel: AlertChannel,
    a: { dedupeKey: string; kind: AlertKind; subject: string; body: string; enqueuedAt: number; attempts: number },
  ): Promise<Outcome> {
    const result = await this.send(channel, a);
    const end = this.deps.realNow();
    if (result.ok) {
      const lag = Math.max(0, end - a.enqueuedAt) / 1_000;
      this.deps.metrics.alertAttempt({ channel, kind: a.kind, outcome: "delivered" });
      this.deps.metrics.alertDeliveryLag(lag);
      this.deps.logger.info(
        {
          event: "alert.delivered",
          dedupe_key: a.dedupeKey,
          kind: a.kind,
          channel,
          attempt: a.attempts,
          lag_s: Math.round(lag * 1_000) / 1_000,
          provider_ref: result.ref,
        },
        "An alert was delivered.",
      );
      return { status: "delivered", nextAt: null, deliveredAt: end, ref: result.ref, error: null };
    }
    const next = nextAttemptAt(a.enqueuedAt, a.attempts, end, this.deps.alerts.retry);
    if (next === undefined) {
      this.failed(channel, a.dedupeKey, a.kind, a.attempts, result.errorClass);
      return { status: "failed", nextAt: null, deliveredAt: null, ref: null, error: result.errorClass };
    }
    this.deps.metrics.alertAttempt({ channel, kind: a.kind, outcome: "retry" });
    this.deps.logger.warn(
      {
        event: "alert.retry",
        dedupe_key: a.dedupeKey,
        channel,
        attempt: a.attempts,
        error_class: result.errorClass,
        next_in_s: Math.max(0, Math.round((next - end) / 1_000)),
      },
      "An alert's delivery attempt failed; another is due.",
    );
    return { status: "pending", nextAt: next, deliveredAt: null, ref: null, error: result.errorClass };
  }

  private failed(channel: AlertChannel, key: string, kind: AlertKind, attempts: number, errorClass: string): void {
    this.deps.metrics.alertAttempt({ channel, kind, outcome: "failed" });
    this.deps.logger.error(
      { event: "alert.failed", dedupe_key: key, channel, attempts, error_class: errorClass },
      "An alert's channel gave up.",
    );
  }

  private send(
    channel: AlertChannel,
    a: { dedupeKey: string; subject: string; body: string },
  ): Promise<DeliveryResult> {
    const send = this.deps.send ?? {};
    if (channel === "telegram") return (send.telegram ?? sendTelegram)(this.deps.channels.telegram, a.body);
    return (send.email ?? sendEmail)(this.deps.channels.email, {
      subject: a.subject,
      text: a.body,
      alertId: a.dedupeKey,
    });
  }

  private async write(channel: AlertChannel, id: number, outcome: Outcome): Promise<void> {
    const p = PREFIX[channel];
    try {
      await this.deps.store.query(
        `UPDATE gateway.alert_outbox SET ${p}_status = $2, ${p}_next_at = $3, ${p}_delivered_at = $4, ${p}_ref = $5,
           ${p}_error = $6
         WHERE id = $1`,
        [
          id,
          outcome.status,
          outcome.nextAt === null ? null : iso(outcome.nextAt),
          outcome.deliveredAt === null ? null : iso(outcome.deliveredAt),
          outcome.ref,
          outcome.error,
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
    const channel = (): MemoryChannel => ({ status: "pending", attempts: 0, nextAt: now, error: null });
    this.memory.push({
      dedupeKey: key,
      subject: rendered.subject,
      body: rendered.body,
      enqueuedAt: now,
      channels: { telegram: channel(), email: channel() },
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
            this.failed(channel, alert.dedupeKey, "store_unreachable", c.attempts, c.error ?? "expired");
            return;
          }
          c.attempts += 1;
          const outcome = await this.attempt(channel, { ...alert, kind: "store_unreachable", attempts: c.attempts });
          c.status = outcome.status;
          c.error = outcome.error;
          if (outcome.nextAt !== null) c.nextAt = outcome.nextAt;
        }),
      );
      if (CHANNELS.every((ch) => alert.channels[ch].status !== "pending"))
        this.memory.splice(this.memory.indexOf(alert), 1);
    }
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
