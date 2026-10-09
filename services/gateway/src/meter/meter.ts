// The meter: metered admission, the commit, and their upkeep (data-model.md §7.2, §7.3, §7.7), behind the port the
// gateway calls (types.ts). The store is the enforcement point: nothing here enforces a ceiling from memory. Memory
// holds only the soft limits (the in-flight and per-minute slots) and the commits waiting to be retried.
//
// - admit: the slots, the admission transaction (admission.ts), then the journal's `reserve` record. A failed append
//   is compensated and refused as journal_unwritable.
// - settle: the commit transaction (commit.ts), then the journal's `commit` record and h4.cost.usd. A commit the store
//   couldn't take is kept in memory and retried every 2 s until the reservation's expires_at. If it never lands, the
//   sweep settles the reservation at its maximum. The slots are released on every way out.
// - the sweep, every 10 s, under the state lock, only when an expired reservation exists.
// Each transaction's effects, the cost counter and the logs, are emitted only once it has committed.
import { randomUUID } from "node:crypto";

import {
  PriceTable,
  thresholds,
  type AlertsConfig,
  type Budgets,
  type EnvClass,
  type StackName,
} from "../config/validate.js";
import { gatewayTime, toRfc3339, type GatewayClock } from "../core/clock.js";
import { degraded, rfc3339Seconds, type Degraded } from "../core/router.js";
import type { GatewayMetrics } from "../telemetry/metrics.js";
import { admissionTx, compensateTx, maxMicroOf, MeteredSlots, type AdmissionOut, type Slot } from "./admission.js";
import { commitTx, completedRecord, type CommitOut } from "./commit.js";
import {
  emitEffects,
  lockState,
  MeterTx,
  noEffects,
  type MeterLogger,
  type TxDeps,
  type TxEffects,
} from "./crossings.js";
import { JournalWriteError, type Journal } from "./journal.js";
import { CommitUnknownError, errorClass, isStoreFailure, type Store } from "./store.js";
import { sweepExpired } from "./sweep.js";
import type { AdmitRequest, AdmitResult, Admitted, MeterPort, SettledCall } from "./types.js";

export const SWEEP_INTERVAL_MS = 10_000;
export const COMMIT_RETRY_MS = 2_000;

export interface MeterDeps {
  stack: StackName;
  envClass: EnvClass;
  budgets: Budgets;
  alerts: AlertsConfig;
  prices: PriceTable;
  /** SHA-256 of config/routing.yaml: on every reservation and ledger row. */
  routingSha: string;
  store: Store;
  journal: Journal;
  clock: GatewayClock;
  metrics: GatewayMetrics;
  logger: MeterLogger;
  realNow: () => number;
  /** Whether this stack routes a fallback adapter: the alerts' Fallback line says none without one. */
  hasFallback: boolean;
  sweepIntervalMs?: number;
  commitRetryMs?: number;
}

interface Pending {
  timer: NodeJS.Timeout | undefined;
  /** An attempt whose COMMIT answer was lost: what it would have emitted, should its row turn out to be there. */
  lost?: CommitOut;
}

export class Meter implements MeterPort {
  /** Called after a committed change to a meter or the state: the gauges' snapshot follows it (telemetry.md §4.1). */
  onChange: (() => void) | undefined;
  private readonly slots: MeteredSlots;
  private readonly held = new Map<string, Slot>();
  private readonly pending = new Map<string, Pending>();
  private sweepTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly deps: MeterDeps) {
    const limits = deps.budgets.limits;
    this.slots = new MeteredSlots(
      {
        perClientInFlight: limits.perClient.meteredInFlight,
        globalInFlight: limits.global.meteredInFlight,
        perMinute: limits.global.meteredPerMinute,
      },
      deps.realNow,
    );
  }

  /** The transactions' context: this class's thresholds, its alert settings, and the real clock. */
  txDeps(): TxDeps {
    const env = this.deps.budgets.envs[this.deps.envClass];
    return {
      stack: this.deps.stack,
      envClass: this.deps.envClass,
      thresholds: thresholds(env),
      warnRatioBp: env.warnRatioBp,
      alerts: this.deps.alerts,
      hasFallback: this.deps.hasFallback,
      realNow: this.deps.realNow,
    };
  }

  counters(): { inFlight: number; lastMinute: number } {
    return this.slots.counters();
  }

  /** Commits waiting for a retry: the store couldn't take them yet. */
  pendingCommits(): number {
    return this.pending.size;
  }

  start(): void {
    this.stopped = false;
    if (this.sweepTimer !== undefined) return;
    this.sweepTimer = setInterval(
      () => void this.sweepNow().catch(() => {}),
      this.deps.sweepIntervalMs ?? SWEEP_INTERVAL_MS,
    );
    this.sweepTimer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.sweepTimer !== undefined) clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
    for (const [rid, p] of this.pending) {
      if (p.timer !== undefined) clearTimeout(p.timer);
      this.release(rid);
    }
    this.pending.clear();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Admission (§7.2)
  // -------------------------------------------------------------------------------------------------------------

  async admit(request: AdmitRequest): Promise<AdmitResult> {
    const taken = this.slots.take(request.clientKey);
    if (!taken.ok) return taken;
    const slot = taken.slot;
    let admitted: Admitted | undefined;
    try {
      const result = await this.admitInStore(request);
      if (result.ok) admitted = result.admitted;
      return result;
    } finally {
      // A refusal, a compensation, or an error gives the slot back; an admitted call holds it until it settles.
      if (admitted === undefined) this.slots.refund(slot);
      else this.held.set(admitted.reservationId, slot);
    }
  }

  private async admitInStore(request: AdmitRequest): Promise<AdmitResult> {
    const { deps } = this;
    const price = deps.prices.active(deps.clock.now());
    if (price === undefined) throw new Error("no active price version"); // startup refuses this (config-files.md §2.5)
    const entry = PriceTable.lookup(price, request.adapter.provider, request.adapter.model);
    if (entry === undefined) throw new Error("the adapter has no price"); // startup refuses this too (price_missing)
    const maxMicro = maxMicroOf(entry, {
      maxInputChars: deps.budgets.limits.perCall.maxInputChars,
      maxOutputTokens: request.maxOutputTokens,
      ...(request.adapter.fixedUsage === undefined ? {} : { fixedUsage: request.adapter.fixedUsage }),
    });
    let out: AdmissionOut;
    try {
      out = await deps.store.transaction((q) =>
        admissionTx(q, {
          request,
          reservationId: randomUUID(),
          price,
          maxMicro,
          ttlS: deps.budgets.timing.reservationTtlS,
          routingSha: deps.routingSha,
          txDeps: this.txDeps(),
          realNow: deps.realNow,
        }),
      );
    } catch (err) {
      if (!isStoreFailure(err)) throw err;
      // COMMIT's answer was lost: the reservation may exist, so take it back if the store answers again. If it
      // doesn't, the sweep settles it at its maximum once it expires, which fails safe.
      if (err instanceof CommitUnknownError && (err.value as AdmissionOut).kind === "admitted") {
        const lost = err.value as Extract<AdmissionOut, { kind: "admitted" }>;
        await this.compensate(lost.admitted).catch(() => {});
      }
      return this.refused(this.unreachable());
    }
    if (out.kind === "uninitialized") return this.refused(degraded("store_uninitialized"));
    this.emit(out.effects);
    if (out.kind === "refused") return this.refused(out.decision);

    // 8. The journal's reserve record, durable before the provider call.
    const a = out.admitted;
    try {
      await deps.journal.append(
        {
          kind: "reserve",
          reservation_id: a.reservationId,
          attribution: a.attribution,
          adapter: a.adapterId,
          provider: a.provider,
          model: a.model,
          price_version: a.price.id,
          max_micro: Number(a.maxMicro),
          period_day: a.periodDay,
          period_month: a.periodMonth,
          expires_at: toRfc3339(a.expiresAt),
        },
        a.createdAt,
      );
    } catch (err) {
      if (!(err instanceof JournalWriteError)) throw err;
      deps.logger.error({ event: "journal.unwritable", error_class: err.code }, "The call journal can't be written.");
      // A metered call must leave a durable record (FR-031): withdraw the reservation, then refuse. If the store
      // can't take the withdrawal either, the sweep settles the reservation once it expires.
      await this.compensate(a).catch(() => {});
      const since = deps.journal.unwritableSince();
      return this.refused(degraded("journal_unwritable", since === undefined ? {} : { since: rfc3339Seconds(since) }));
    }
    return { ok: true, admitted: a };
  }

  private refused(decision: Degraded): AdmitResult {
    return { ok: false, refusal: "degraded", decision };
  }

  private unreachable(): Degraded {
    const since = this.deps.store.outageStartedAt();
    return degraded("store_unreachable", since === undefined ? {} : { since: rfc3339Seconds(since) });
  }

  private async compensate(a: Admitted): Promise<void> {
    const removed = await this.deps.store.transaction((q) => compensateTx(q, a, this.deps.realNow));
    if (removed) this.onChange?.();
  }

  // -------------------------------------------------------------------------------------------------------------
  // The commit (§7.3)
  // -------------------------------------------------------------------------------------------------------------

  async settle(
    admitted: Admitted,
    call: SettledCall,
    o: { clientLabel?: string } = {},
  ): Promise<{ committed: boolean }> {
    const ledgerId = randomUUID();
    try {
      await this.commitOnce(admitted, call, o.clientLabel ?? null, ledgerId);
      return { committed: true };
    } catch (err) {
      if (!isStoreFailure(err) || this.stopped) {
        // A statement the store refused is a bug, and a stopping gateway retries nothing: the commit never lands, and
        // the sweep settles the reservation at its maximum once it expires. The answer the call got still stands.
        this.release(admitted.reservationId);
        this.deps.logger.error(
          {
            event: "meter.commit_gave_up",
            reservation_id: admitted.reservationId,
            attribution: admitted.attribution,
          },
          "A metered call's commit never landed; the sweep settles its reservation at its maximum.",
        );
        return { committed: false };
      }
      const pending: Pending = { timer: undefined };
      if (err instanceof CommitUnknownError) pending.lost = err.value as CommitOut;
      this.pending.set(admitted.reservationId, pending);
      this.deps.logger.warn(
        {
          event: "meter.commit_pending",
          reservation_id: admitted.reservationId,
          attribution: admitted.attribution,
          error_class: err instanceof CommitUnknownError ? err.failure : errorClass(err),
        },
        "A metered call's commit failed; it is retried every 2 s until its reservation expires.",
      );
      this.scheduleRetry(admitted, call, o.clientLabel ?? null, ledgerId);
      return { committed: false };
    }
  }

  /** One attempt; it throws what the store throws. On success, the effects, the journal, and the slots follow. */
  private async commitOnce(
    a: Admitted,
    call: SettledCall,
    clientLabel: string | null,
    ledgerId: string,
  ): Promise<void> {
    const out = await this.deps.store.transaction((q) =>
      commitTx(q, {
        admitted: a,
        call,
        clientLabel,
        ledgerId,
        stack: this.deps.stack,
        realNow: this.deps.realNow,
        offsetMs: this.deps.clock.offsetMs(),
        txDeps: this.txDeps(),
      }),
    );
    try {
      // A retry that finds its own lost attempt's row finishes what that attempt would have: its effects and records.
      const done = !out.inserted && out.ownRowFound ? this.pending.get(a.reservationId)?.lost : out;
      if (done === undefined || !done.inserted) return;
      this.emit(done.effects);
      this.deps.metrics.cost(call.costMicro, { provider: a.provider, model: a.model, attribution: a.attribution });
      this.deps.logger.info(completedRecord(a, call), "A provider attempt completed.");
      // 8. The commit record. A failed append doesn't undo the commit: the next reserve's append fails too, and
      //    metered calls stop until the journal is writable again.
      await this.deps.journal
        .append(
          {
            kind: "commit",
            reservation_id: a.reservationId,
            ledger_id: done.ledgerId,
            cost_micro: Number(call.costMicro),
            cost_basis: call.costBasis,
            outcome: call.outcome,
            error_kind: call.outcome === "error" ? (call.errorKind ?? "provider_error") : null,
            input_tokens: call.inputTokens,
            output_tokens: call.outputTokens,
            cache_read_tokens: call.cacheReadTokens,
            attribution: a.attribution,
            period_day: a.periodDay,
            period_month: a.periodMonth,
            trace_id: a.traceId,
          },
          done.now,
        )
        .catch(() => {});
    } finally {
      // The call is over: its pending entry and its slots go, on every way out.
      this.pending.delete(a.reservationId);
      this.release(a.reservationId);
    }
  }

  private scheduleRetry(a: Admitted, call: SettledCall, clientLabel: string | null, ledgerId: string): void {
    const pending = this.pending.get(a.reservationId);
    if (pending === undefined || this.stopped) return;
    const timer = setTimeout(
      () => void this.retry(a, call, clientLabel, ledgerId),
      this.deps.commitRetryMs ?? COMMIT_RETRY_MS,
    );
    timer.unref();
    pending.timer = timer;
  }

  private async retry(a: Admitted, call: SettledCall, clientLabel: string | null, ledgerId: string): Promise<void> {
    const pending = this.pending.get(a.reservationId);
    if (pending === undefined || this.stopped) return;
    if (this.deps.realNow() >= a.retryUntil) {
      // The reservation has expired: the sweep settles it at its maximum, and the slots go back.
      this.pending.delete(a.reservationId);
      this.release(a.reservationId);
      this.deps.logger.error(
        { event: "meter.commit_gave_up", reservation_id: a.reservationId, attribution: a.attribution },
        "A metered call's commit never landed; the sweep settles its reservation at its maximum.",
      );
      return;
    }
    try {
      await this.commitOnce(a, call, clientLabel, ledgerId);
    } catch (err) {
      if (err instanceof CommitUnknownError) pending.lost = err.value as CommitOut;
      if (isStoreFailure(err)) {
        this.scheduleRetry(a, call, clientLabel, ledgerId);
        return;
      }
      this.pending.delete(a.reservationId);
      this.release(a.reservationId);
      this.deps.logger.error(
        { event: "meter.commit_gave_up", reservation_id: a.reservationId, attribution: a.attribution },
        "A metered call's commit never landed; the sweep settles its reservation at its maximum.",
      );
    }
  }

  private release(reservationId: string): void {
    const slot = this.held.get(reservationId);
    if (slot === undefined) return;
    this.held.delete(reservationId);
    this.slots.release(slot);
  }

  // -------------------------------------------------------------------------------------------------------------
  // The sweep (§2.4, §7.7)
  // -------------------------------------------------------------------------------------------------------------

  /** Settles the reservations past their expiry, under the state lock, only when one exists. Resolves to how many. */
  async sweepNow(): Promise<number> {
    const { deps } = this;
    if (deps.store.status !== "ready") return 0;
    const now = gatewayTime(deps.realNow(), deps.clock.offsetMs());
    const due = await deps.store.query("SELECT 1 FROM gateway.reservations WHERE expires_at <= $1 LIMIT 1", [
      toRfc3339(now),
    ]);
    if (due.rows.length === 0) return 0;
    const out = await deps.store.transaction(async (q): Promise<{ swept: number; effects: TxEffects }> => {
      const locked = await lockState(q);
      if (locked === undefined) return { swept: 0, effects: noEffects() };
      const tx = new MeterTx(q, this.txDeps(), locked, gatewayTime(deps.realNow(), locked.testClockOffsetMs));
      const swept = await sweepExpired(tx);
      await tx.flushAlerts();
      return { swept, effects: tx.effects };
    });
    this.emit(out.effects);
    return out.swept;
  }

  /** A committed transaction's effects: the cost counter and the logs, then the gauges. */
  emit(effects: TxEffects): void {
    emitEffects(effects, {
      logger: this.deps.logger,
      cost: (micro, c) => this.deps.metrics.cost(micro, c),
    });
    if (effects.changed) this.onChange?.();
  }
}
