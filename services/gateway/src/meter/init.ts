// The store's initialization (FR-031; data-model.md §8; contracts/operator-admin.md §2.3). A store found empty, on a
// new host or after its data was removed, stays degraded until the operator initializes it: a reset under FR-034,
// with the credential, a reason, and an audit row. Nothing sets the meters to zero silently.
//
// 1. Preconditions: a state row means 409 already_initialized; a journal directory that can't be read, 409
//    journal_unreadable; a missing one is a new host.
// 2. The dev clock: the newest clock record restores the offset, so the rebuilt periods are the journal's.
// 3–5. Each meter (day, month, fallback_day) takes the largest of its candidates: the surviving ledger, with any
//    reservations left at their maximum; the journal, with the newest init record as a floor; and the stated values.
// 6. The allowance is today's last renewal, from the journal or the audit log, or 2,000,000 and grant 1.
// 7. With no ledger row this month, no reserve or commit record in the files read, and nothing stated, it refuses
//    with 409 confirm_zero_required unless confirm_zero.
// 8. One transaction: the state row, the meter rows, the audit row, and the operator_action alert.
// 9. Then the journal's operator record. A failed append is reported, and audited as journal_failed, and doesn't undo
//    the initialization. An init whose COMMIT landed while its answer, and the re-read after it, were lost answered
//    503 without the record: the retry's 409 already_initialized appends it from the init's audit row.
import { renderAlert, type InitSource, type MeterFacts } from "../alerts/format.js";
import { dedupeKey as dedupeKeys, enqueueAlert } from "../alerts/outbox.js";
import { thresholds, type AlertsConfig, type Budgets, type EnvClass, type StackName } from "../config/validate.js";
import { gatewayTime, monthKey, periodKeys, toRfc3339, type GatewayClock } from "../core/clock.js";
import type { GatewayMetrics } from "../telemetry/metrics.js";
import {
  JournalUnreadableError,
  JournalWriteError,
  type CommitRecord,
  type Journal,
  type JournalRecord,
  type JournalScan,
  type OperatorRecord,
  type ReserveRecord,
  previousMonth,
} from "./journal.js";
import { adapterMonthKey } from "./rollover.js";
import { CommitUnknownError, isStoreFailure, Rollback, toBigInt, type Queryable, type Store } from "./store.js";

export type Meter = "day" | "month" | "fallback_day";
const METERS: readonly Meter[] = ["day", "month", "fallback_day"];

/** Serializes initializations: no state row exists yet to lock (data-model.md §2.1's locking order). "h4in". */
export const INIT_LOCK_KEY = 0x6834_696e;

export interface InitRequest {
  /** §1.2's reason, trimmed. */
  reason: string;
  /** FR-031's starting values the operator states, in micro-USD. */
  stated: Partial<Record<Meter, bigint>>;
  confirmZero: boolean;
  renew: boolean;
}

export interface Operator {
  /** operator:<stack>#<first 8 hex of the token's SHA-256>. */
  actor: string;
  fingerprint: string;
}

export interface InitDeps {
  stack: StackName;
  envClass: EnvClass;
  store: Store;
  journal: Journal;
  clock: GatewayClock;
  budgets: Budgets;
  alerts: AlertsConfig;
  /** The route's fallback adapter, for the alert's Fallback line; null when the stack has none. */
  fallbackId: string | null;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
}

export type InitResult = { status: 200 | 409 | 503; body: Record<string, unknown> };

const DETAILS = {
  already_initialized: "The store already has its state row; initialization runs once, on an empty store.",
  confirm_zero_required:
    "No ledger row this month, no journal record, and nothing stated: initializing would set every meter to zero. Repeat with confirm_zero to confirm it.",
  journal_unreadable: "The journal directory exists but can't be read; fix its permissions first.",
  below_restored_meters:
    "A stated value is lower than the restored store's meter for this period: a restore starts from the restored meters, raised by the spend since its dump, never lower (spec 001 contracts/shared-state.md §8, step 4).",
} as const;

const refuse = (error: keyof typeof DETAILS): InitResult => ({
  status: 409,
  body: { error, detail: DETAILS[error] },
});
const UNREACHABLE: InitResult = { status: 503, body: { error: "store_unreachable" } };

/** The meters a call counts toward (data-model.md, Conventions: attribution). */
function metersOf(attribution: string): Meter[] {
  return attribution === "fallback" ? ["day", "month", "fallback_day"] : ["day", "month"];
}

/** Whether a record of these periods counts toward this meter now (§3 step 3). */
function current(meter: Meter, period: { day: string; month: string }, now: { day: string; month: string }): boolean {
  return meter === "month" ? period.month === now.month : period.day === now.day;
}

export interface JournalCandidates {
  /** The paired call records: a commit's cost, a reserve with no commit at its maximum (§3 step 2). */
  calls: Record<Meter, bigint>;
  /** The newest init record's chosen value plus the calls after it, for a meter whose period it shares (§3 step 6). */
  floor: Record<Meter, bigint | null>;
  /** reserve and commit records in the files read: §8 step 7's evidence. */
  callRecords: number;
  /** Today's last renewal: a renew, or an init with renewed: true (§3 step 4). */
  renewal: { allowance: bigint; grantNo: number } | undefined;
}

/** What the journal's records say about the current periods (data-model.md §3, "What a rebuild reads"). */
export function journalCandidates(
  records: readonly JournalRecord[],
  now: { day: string; month: string },
): JournalCandidates {
  const pairs = new Map<string, { reserve?: ReserveRecord; commit?: CommitRecord }>();
  let callRecords = 0;
  let init: OperatorRecord | undefined;
  let renewal: OperatorRecord | undefined;
  const later = (a: { ts: string }, b: { ts: string } | undefined) =>
    b === undefined || Date.parse(a.ts) >= Date.parse(b.ts);
  for (const r of records) {
    if (r.kind === "reserve" || r.kind === "commit") {
      callRecords += 1;
      const pair = pairs.get(r.reservation_id) ?? {};
      if (r.kind === "reserve") pair.reserve ??= r;
      else pair.commit ??= r;
      pairs.set(r.reservation_id, pair);
    } else if (r.kind === "operator") {
      if (r.action === "init" && later(r, init)) init = r;
      const grants = r.action === "renew" || (r.action === "init" && r.renewed === true);
      if (grants && r.period_day === now.day && later(r, renewal)) renewal = r;
    }
  }
  const calls: Record<Meter, bigint> = { day: 0n, month: 0n, fallback_day: 0n };
  const sinceInit: Record<Meter, bigint> = { day: 0n, month: 0n, fallback_day: 0n };
  for (const { reserve, commit } of pairs.values()) {
    const record = commit ?? reserve;
    if (record === undefined) continue;
    const cost = BigInt(commit?.cost_micro ?? reserve?.max_micro ?? 0);
    const ts = (reserve ?? commit) as { ts: string };
    const afterInit = init !== undefined && Date.parse(ts.ts) > Date.parse(init.ts);
    for (const meter of metersOf(record.attribution)) {
      if (!current(meter, { day: record.period_day, month: record.period_month }, now)) continue;
      calls[meter] += cost;
      if (afterInit) sinceInit[meter] += cost;
    }
  }
  const chosenAt: Record<Meter, number | undefined> = {
    day: init?.day_micro,
    month: init?.month_micro,
    fallback_day: init?.fallback_day_micro,
  };
  const floor = Object.fromEntries(
    METERS.map((m) => {
      const value = chosenAt[m];
      const shares = init !== undefined && current(m, { day: init.period_day, month: init.period_month }, now);
      return [m, shares && value !== undefined ? BigInt(value) + sinceInit[m] : null];
    }),
  ) as Record<Meter, bigint | null>;
  return {
    calls,
    floor,
    callRecords,
    renewal:
      renewal?.allowance_micro === undefined || renewal.grant_no === undefined
        ? undefined
        : { allowance: BigInt(renewal.allowance_micro), grantNo: renewal.grant_no },
  };
}

/**
 * Each capped adapter's month in the journal (spec 010, FR-022; data-model.md §3): a reserve record naming the adapter,
 * for this month, paired with its commit as every record is, at the commit's cost, or at its maximum without one.
 */
export function adapterMonthsFromJournal(
  records: readonly JournalRecord[],
  month: string,
  adapters: ReadonlySet<string>,
): Map<string, bigint> {
  const reserves = new Map<string, ReserveRecord>();
  const commits = new Map<string, CommitRecord>();
  for (const r of records) {
    if (r.kind === "reserve" && !reserves.has(r.reservation_id)) reserves.set(r.reservation_id, r);
    if (r.kind === "commit" && !commits.has(r.reservation_id)) commits.set(r.reservation_id, r);
  }
  const out = new Map<string, bigint>();
  for (const [id, reserve] of reserves) {
    if (!adapters.has(reserve.adapter) || reserve.period_month !== month) continue;
    const cost = BigInt(commits.get(id)?.cost_micro ?? reserve.max_micro);
    out.set(reserve.adapter, (out.get(reserve.adapter) ?? 0n) + cost);
  }
  return out;
}

/** Each capped adapter's month in the surviving ledger, with its reservations left at their maximum (spec 010). */
async function adapterMonthsFromLedger(q: Queryable, month: string): Promise<Map<string, bigint>> {
  const { rows } = await q.query<{ adapter_id: string; spent: unknown }>(
    `SELECT adapter_id, sum(spent)::text AS spent FROM (
       SELECT adapter_id, cost_micro AS spent FROM gateway.ledger WHERE attribution <> 'none' AND period_month = $1
       UNION ALL
       SELECT adapter_id, max_micro AS spent FROM gateway.reservations WHERE period_month = $1
     ) AS calls GROUP BY adapter_id`,
    [month],
  );
  return new Map(rows.map((r) => [r.adapter_id, toBigInt(r.spent)]));
}

const big = (n: bigint | null | undefined): number | null => (n === null || n === undefined ? null : Number(n));
const max = (...values: (bigint | null | undefined)[]): bigint =>
  values.reduce<bigint>((a, v) => (v !== null && v !== undefined && v > a ? v : a), 0n);

/** The ledger's candidates: committed costs for the current periods, plus any reservations left at their maximum. */
async function ledgerCandidates(q: Queryable, now: { day: string; month: string }) {
  const { rows: ledger } = await q.query<{ day: unknown; month: unknown; fallback_day: unknown; rows: unknown }>(
    `SELECT coalesce(sum(cost_micro) FILTER (WHERE attribution <> 'none' AND period_day = $1), 0)::text AS day,
            coalesce(sum(cost_micro) FILTER (WHERE attribution <> 'none' AND period_month = $2), 0)::text AS month,
            coalesce(sum(cost_micro) FILTER (WHERE attribution = 'fallback' AND period_day = $1), 0)::text AS fallback_day,
            count(*) FILTER (WHERE period_month = $2)::text AS rows
     FROM gateway.ledger`,
    [now.day, now.month],
  );
  const { rows: held } = await q.query<{ day: unknown; month: unknown; fallback_day: unknown; rows: unknown }>(
    `SELECT coalesce(sum(max_micro) FILTER (WHERE period_day = $1), 0)::text AS day,
            coalesce(sum(max_micro) FILTER (WHERE period_month = $2), 0)::text AS month,
            coalesce(sum(max_micro) FILTER (WHERE attribution = 'fallback' AND period_day = $1), 0)::text AS fallback_day,
            count(*)::text AS rows
     FROM gateway.reservations`,
    [now.day, now.month],
  );
  const l = ledger[0];
  const r = held[0];
  const pick = (row: typeof l, m: Meter) => (row === undefined ? 0n : toBigInt(row[m]));
  return {
    values: Object.fromEntries(METERS.map((m) => [m, pick(l, m) + pick(r, m)])) as Record<Meter, bigint>,
    ledgerRows: l === undefined ? 0 : Number(toBigInt(l.rows)),
    reservations: r === undefined ? 0 : Number(toBigInt(r.rows)),
  };
}

/** Today's last renewal in a surviving audit log, when the journal has none (§8 step 6). */
async function auditRenewal(q: Queryable, day: string): Promise<{ allowance: bigint; grantNo: number } | undefined> {
  const { rows } = await q.query<{ ts: Date | string; action: string; after: unknown }>(
    `SELECT ts, action, after FROM gateway.audit_log WHERE action IN ('renew', 'init') ORDER BY id DESC LIMIT 50`,
  );
  for (const row of rows) {
    const after = (row.after ?? {}) as Record<string, unknown>;
    if (row.action === "init" && after.renewed !== true) continue;
    const meters = (after.meters ?? {}) as Record<string, unknown>;
    const f = (after.fallback_day ?? meters.fallback_day ?? {}) as Record<string, unknown>;
    if (periodKeys(new Date(row.ts).getTime()).day !== day) continue;
    if (typeof f.allowance_micro === "number" && typeof f.grant_no === "number") {
      return { allowance: BigInt(f.allowance_micro), grantNo: f.grant_no };
    }
  }
  return undefined;
}

export async function initializeStore(deps: InitDeps, req: InitRequest, operator: Operator): Promise<InitResult> {
  // 1. Preconditions. The state read first, with no cache (data-model.md §7.1).
  const read = await deps.store.readStackState();
  if (read.kind === "unreachable") return UNREACHABLE;
  if (read.kind === "ok") {
    await finishLostInit(deps);
    return refuse("already_initialized");
  }
  let scan: JournalScan;
  try {
    scan = await deps.journal.scan({ envClass: deps.envClass, realNow: deps.realNow() });
  } catch (err) {
    if (err instanceof JournalUnreadableError) return refuse("journal_unreadable");
    throw err;
  }

  // 2–3. The clock and the current periods.
  const offset = deps.envClass === "dev" ? scan.clockOffsetMs : null;
  const at = gatewayTime(deps.realNow(), offset);
  const atIso = toRfc3339(at);
  const now = periodKeys(at);
  const fromJournal = journalCandidates(scan.records, now);
  const t = thresholds(deps.budgets.envs[deps.envClass]);
  const anyStated = METERS.some((m) => req.stated[m] !== undefined);

  type Done = { kind: "done"; result: InitResult; auditId: number; alertKey?: string; journalRecord: object };
  let done: Done | InitResult;
  try {
    done = await deps.store.transaction<Done | InitResult>(async (q) => {
      await q.query("SELECT pg_advisory_xact_lock($1)", [INIT_LOCK_KEY]);
      const exists = await q.query("SELECT 1 FROM gateway.stack_state WHERE id = 1");
      if (exists.rows.length > 0) throw new Rollback(refuse("already_initialized"));

      // Spec 001 (contracts/shared-state.md §8, step 4): a store restored from a backup keeps its meters, and a stated
      // value may raise them by the spend since the dump, never lower them. A new or emptied store has no meter rows.
      const restored = await q.query<{ meter: string; spent_micro: unknown }>(
        `SELECT meter, spent_micro FROM gateway.meters
         WHERE (meter IN ('day', 'fallback_day') AND period_key = $1) OR (meter = 'month' AND period_key = $2)`,
        [now.day, now.month],
      );
      for (const row of restored.rows) {
        const stated = req.stated[row.meter as Meter];
        if (stated !== undefined && stated < toBigInt(row.spent_micro)) {
          throw new Rollback(refuse("below_restored_meters"));
        }
      }

      // 4–5. The candidates and the max rule.
      const ledger = await ledgerCandidates(q, now);
      const journal = Object.fromEntries(
        METERS.map((m) => [m, max(fromJournal.calls[m], fromJournal.floor[m])]),
      ) as Record<Meter, bigint>;
      const chosen = Object.fromEntries(
        METERS.map((m) => [m, max(ledger.values[m], journal[m], req.stated[m])]),
      ) as Record<Meter, bigint>;

      // 7. Zero needs confirming.
      const evidence = ledger.ledgerRows > 0 || ledger.reservations > 0 || fromJournal.callRecords > 0 || anyStated;
      if (!evidence && !req.confirmZero) throw new Rollback(refuse("confirm_zero_required"));

      // 6. The allowance: neither summed nor maxed.
      const renewal = fromJournal.renewal ?? (await auditRenewal(q, now.day));
      let allowance = renewal?.allowance ?? t.fallbackGrant;
      let grantNo = renewal?.grantNo ?? 1;
      if (req.renew) {
        allowance = chosen.fallback_day + t.fallbackGrant;
        grantNo += 1;
      }

      // 8. The write. Reservations left over are counted at their maximum above, so they go, and reserved starts at 0.
      const awaiting = !req.renew;
      const inserted = await q.query(
        `INSERT INTO gateway.stack_state (id, stack, env, state, since, crossed, fallback_awaiting_renewal,
           fallback_awaiting_since, initialized_at, initialized_by, test_clock_offset_ms, updated_at)
         VALUES (1, $1, $2, 'normal', $3, '{}', $4, $5, $3, $6, $7, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [deps.stack, deps.envClass, atIso, awaiting, awaiting ? atIso : null, operator.actor, offset],
      );
      if (inserted.rows.length === 0) throw new Rollback(refuse("already_initialized"));
      await q.query(
        `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no,
           created_at, updated_at)
         VALUES ('day', $1, $2, 0, NULL, NULL, $7, $7), ('month', $3, $4, 0, NULL, NULL, $7, $7),
                ('fallback_day', $1, $5, 0, $6, $8, $7, $7)
         ON CONFLICT (meter, period_key) DO UPDATE SET spent_micro = EXCLUDED.spent_micro, reserved_micro = 0,
           allowance_micro = EXCLUDED.allowance_micro, grant_no = EXCLUDED.grant_no, updated_at = EXCLUDED.updated_at`,
        [
          now.day,
          String(chosen.day),
          now.month,
          String(chosen.month),
          String(chosen.fallback_day),
          String(allowance),
          atIso,
          grantNo,
        ],
      );
      // Spec 010 (FR-022): each capped adapter's month, the larger of the ledger's and the journal's. Its reservations
      // are counted at their maximum, as the meters' are, so reserved starts at 0.
      const capped = new Set(t.adapterCaps.keys());
      if (capped.size > 0) {
        const fromLedger = await adapterMonthsFromLedger(q, now.month);
        const fromJournalMonths = adapterMonthsFromJournal(scan.records, now.month, capped);
        for (const id of capped) {
          const spent = max(fromLedger.get(id), fromJournalMonths.get(id));
          if (spent === 0n) continue;
          await q.query(
            `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no,
               created_at, updated_at)
             VALUES ('adapter_month', $1, $2, 0, NULL, NULL, $3, $3)
             ON CONFLICT (meter, period_key) DO UPDATE SET spent_micro = EXCLUDED.spent_micro, reserved_micro = 0,
               updated_at = EXCLUDED.updated_at`,
            [adapterMonthKey(id, now.month), String(spent), atIso],
          );
        }
      }
      await q.query("DELETE FROM gateway.reservations");

      const candidates = Object.fromEntries(
        METERS.map((m) => [
          m,
          {
            ledger: big(ledger.values[m]),
            journal_calls: big(fromJournal.calls[m]),
            journal_floor: big(fromJournal.floor[m]),
            stated: big(req.stated[m]),
          },
        ]),
      );
      const after = {
        stack_state: {
          state: "normal",
          since: atIso,
          crossed: [],
          fallback_awaiting_renewal: awaiting,
          fallback_awaiting_since: awaiting ? atIso : null,
          test_clock_offset_ms: offset,
        },
        meters: {
          day: { period_key: now.day, spent_micro: big(chosen.day) },
          month: { period_key: now.month, spent_micro: big(chosen.month) },
          fallback_day: {
            period_key: now.day,
            spent_micro: big(chosen.fallback_day),
            allowance_micro: big(allowance),
            grant_no: grantNo,
          },
        },
        renewed: req.renew,
      };
      const detail = {
        candidates,
        chosen: { day: big(chosen.day), month: big(chosen.month), fallback_day: big(chosen.fallback_day) },
        confirm_zero: req.confirmZero,
        renewed: req.renew,
        lines_skipped: scan.linesSkipped,
        files_read: scan.filesRead,
        records: scan.records.length,
        clock_offset_ms: offset,
        allowance_from: renewal === undefined ? "default" : fromJournal.renewal !== undefined ? "journal" : "audit_log",
        reservations_settled: ledger.reservations,
      };
      const audit = await q.query<{ id: unknown }>(
        `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
         VALUES ($1, $2, $3, 'init', $4, NULL, $5::jsonb, $6::jsonb) RETURNING id`,
        [atIso, deps.stack, operator.actor, req.reason, JSON.stringify(after), JSON.stringify(detail)],
      );
      const auditId = Number(toBigInt(audit.rows[0]?.id));

      // The confirmation alert, in the same transaction (operator-admin.md §1.3; alerts.md §2, §3).
      const sources = (["ledger", "journal", "stated"] as InitSource[]).filter((source) =>
        METERS.some((m) => {
          const value = source === "ledger" ? ledger.values[m] : source === "journal" ? journal[m] : req.stated[m];
          return chosen[m] > 0n && value === chosen[m];
        }),
      );
      const meters: MeterFacts = {
        dayMicro: chosen.day,
        dayCeilingMicro: t.dayCeiling,
        dayWarnMicro: t.dayWarn,
        monthMicro: chosen.month,
        monthCeilingMicro: t.monthCeiling,
        monthWarnMicro: t.monthWarn,
        fallbackMicro: chosen.fallback_day,
        fallbackAllowanceMicro: allowance,
        grantNo,
      };
      const dedupeKey = dedupeKeys.operatorAction(deps.stack, "init", auditId);
      const alert = renderAlert(
        {
          stack: deps.stack,
          envClass: deps.envClass,
          prefix: deps.alerts.prefixes[deps.stack],
          dedupeKey,
          at,
          testClock: offset !== null,
          runtime: { state: "normal" },
          fallback:
            deps.fallbackId === null
              ? { state: "none" }
              : awaiting
                ? { state: "awaiting", since: at }
                : { state: "available" },
          meters,
        },
        {
          kind: "operator_action",
          action: "init",
          fingerprint: operator.fingerprint,
          sources,
          confirmZero: req.confirmZero,
          renewed: req.renew,
        },
      );
      const queued = await enqueueAlert(q, {
        dedupeKey,
        kind: "operator_action",
        stack: deps.stack,
        createdAt: atIso,
        enqueuedAt: deps.realNow(),
        subject: alert.subject,
        body: alert.body,
        facts: alert.facts,
      });

      const result: InitResult = {
        status: 200,
        body: {
          action: "init",
          audit_id: auditId,
          state: "normal",
          fallback_awaiting_renewal: awaiting,
          periods: now,
          meters: {
            day: {
              spent_micro_usd: big(chosen.day),
              sources: { ledger: big(ledger.values.day), journal: big(journal.day), stated: big(req.stated.day) },
            },
            month: {
              spent_micro_usd: big(chosen.month),
              sources: { ledger: big(ledger.values.month), journal: big(journal.month), stated: big(req.stated.month) },
            },
            fallback_day: {
              spent_micro_usd: big(chosen.fallback_day),
              allowance_micro_usd: big(allowance),
              grant: grantNo,
              sources: {
                ledger: big(ledger.values.fallback_day),
                journal: big(journal.fallback_day),
                stated: big(req.stated.fallback_day),
              },
            },
          },
          journal: { files_read: scan.filesRead, records: scan.records.length, lines_skipped: scan.linesSkipped },
          confirm_zero: req.confirmZero,
          renewed: req.renew,
          clock_offset_ms: offset,
        },
      };
      return {
        kind: "done",
        result,
        auditId,
        ...(queued ? { alertKey: dedupeKey } : {}),
        journalRecord: initRecordOf({
          auditId,
          actor: operator.actor,
          periods: now,
          chosen: { day: Number(chosen.day), month: Number(chosen.month), fallback_day: Number(chosen.fallback_day) },
          confirmZero: req.confirmZero,
          renewed: req.renew,
          allowance: Number(allowance),
          grantNo,
        }),
      };
    });
  } catch (err) {
    if (err instanceof CommitUnknownError) {
      // COMMIT was sent and its answer lost. If it landed, this init owns the state row now, and its journal record
      // must follow, or a later rebuild loses this init's floor (data-model.md §3 step 6). Only a row this actor wrote
      // at this init's own time counts; anything else, or a store that still can't be read, is store_unreachable.
      if (!(await initLanded(deps.store, operator.actor, at))) return UNREACHABLE;
      done = err.value as Done;
    } else if (isStoreFailure(err)) {
      return UNREACHABLE;
    } else {
      throw err;
    }
  }
  if (!("kind" in done)) return done;

  // The state row exists now: the gateway clock follows the restored offset.
  deps.clock.setOffsetMs(offset);
  if (done.alertKey !== undefined) {
    deps.logger.info(
      { event: "alert.queued", dedupe_key: done.alertKey, kind: "operator_action" },
      "An alert was queued.",
    );
  }

  // 9. The journal's operator record follows the commit. A failure doesn't undo the initialization.
  let append: "ok" | "unwritable" = "ok";
  try {
    await deps.journal.append(done.journalRecord as Parameters<Journal["append"]>[0], at);
  } catch (err) {
    if (!(err instanceof JournalWriteError)) throw err;
    append = "unwritable";
    await deps.store
      .query(
        `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
         VALUES ($1, $2, 'gateway', 'journal_failed', NULL, NULL, NULL, $3::jsonb)`,
        [atIso, deps.stack, JSON.stringify({ audit_id: done.auditId, error_class: err.code })],
      )
      .catch(() => {});
  }
  const body = done.result.body as { journal: Record<string, unknown> };
  body.journal = { ...body.journal, append };

  deps.metrics.operatorAction("init");
  const record = done.journalRecord as Record<string, unknown>;
  deps.logger.info(
    {
      event: "operator.init",
      "event.name": "h4.audit",
      audit_id: done.auditId,
      actor: operator.actor,
      action: "init",
      reason: req.reason,
      before: null,
      after: {
        day_micro: record.day_micro,
        month_micro: record.month_micro,
        fallback_day_micro: record.fallback_day_micro,
        confirm_zero: req.confirmZero,
        renewed: req.renew,
      },
    },
    "The operator initialized the store.",
  );
  return done.result;
}

/** The journal's init record (data-model.md §3): the chosen values, a rebuild's floor, and the grant when renewed. */
function initRecordOf(o: {
  auditId: number;
  actor: string;
  periods: { day: string; month: string };
  chosen: Record<Meter, number>;
  confirmZero: boolean;
  renewed: boolean;
  allowance: number;
  grantNo: number;
}): Record<string, unknown> & { kind: "operator" } {
  return {
    kind: "operator",
    action: "init",
    audit_id: o.auditId,
    actor: o.actor,
    period_day: o.periods.day,
    period_month: o.periods.month,
    day_micro: o.chosen.day,
    month_micro: o.chosen.month,
    fallback_day_micro: o.chosen.fallback_day,
    confirm_zero: o.confirmZero,
    renewed: o.renewed,
    ...(o.renewed ? { allowance_micro: o.allowance, grant_no: o.grantNo } : {}),
  };
}

/** Repairs in flight, one per journal: two 409s at once append one record. */
const repairs = new WeakMap<Journal, Promise<void>>();

/**
 * Finishes an init whose COMMIT landed while its acknowledgement, and the re-read after it, were lost, as when
 * Postgres restarts: it answered 503 and wrote no journal record (step 9). If the journal's newest init record is older
 * than the state row's initialized_at, the record is appended now from the init's audit row, at the init's own time, so
 * a later rebuild keeps its floor (data-model.md §3 step 6), and operator.init follows. Only an init in a month a
 * rebuild reads is repaired. Best effort: a failure leaves it for the next 409 (tasks.md T072).
 */
async function finishLostInit(deps: InitDeps): Promise<void> {
  const inFlight = repairs.get(deps.journal);
  if (inFlight !== undefined) return inFlight;
  const repair = repairInit(deps).catch(() => {});
  repairs.set(deps.journal, repair);
  try {
    await repair;
  } finally {
    repairs.delete(deps.journal);
  }
}

async function repairInit(deps: InitDeps): Promise<void> {
  const { rows } = await deps.store.query<{
    id: unknown;
    ts: Date | string;
    actor: string;
    reason: string | null;
    after: Record<string, unknown> | null;
    detail: Record<string, unknown> | null;
  }>(
    `SELECT a.id, a.ts, a.actor, a.reason, a.after, a.detail
     FROM gateway.stack_state s
     JOIN gateway.audit_log a ON a.action = 'init' AND a.ts = s.initialized_at AND a.actor = s.initialized_by
     WHERE s.id = 1
     ORDER BY a.id DESC LIMIT 1`,
  );
  const row = rows[0];
  if (row === undefined || row.after === null) return;
  const at = new Date(row.ts).getTime();
  const scan = await deps.journal.scan({ envClass: deps.envClass, realNow: deps.realNow() });
  const month = monthKey(gatewayTime(deps.realNow(), scan.clockOffsetMs));
  if (monthKey(at) !== month && monthKey(at) !== previousMonth(month)) return;
  const newest = scan.records
    .filter((r): r is OperatorRecord => r.kind === "operator" && r.action === "init")
    .reduce<number | undefined>((t, r) => Math.max(t ?? -Infinity, Date.parse(r.ts)), undefined);
  if (newest !== undefined && newest >= at) return;

  const after = row.after as {
    meters?: Record<
      Meter,
      { period_key?: unknown; spent_micro?: unknown; allowance_micro?: unknown; grant_no?: unknown }
    >;
    renewed?: unknown;
  };
  const m = after.meters;
  const num = (v: unknown): number => (typeof v === "number" && Number.isSafeInteger(v) ? v : 0);
  if (m === undefined || typeof m.day?.period_key !== "string" || typeof m.month?.period_key !== "string") return;
  const renewed = after.renewed === true;
  const auditId = Number(toBigInt(row.id));
  const record = initRecordOf({
    auditId,
    actor: row.actor,
    periods: { day: m.day.period_key, month: m.month.period_key },
    chosen: {
      day: num(m.day.spent_micro),
      month: num(m.month.spent_micro),
      fallback_day: num(m.fallback_day?.spent_micro),
    },
    confirmZero: row.detail?.confirm_zero === true,
    renewed,
    allowance: num(m.fallback_day?.allowance_micro),
    grantNo: num(m.fallback_day?.grant_no),
  });
  await deps.journal.append(record as Parameters<Journal["append"]>[0], at);
  deps.metrics.operatorAction("init");
  deps.logger.info(
    {
      event: "operator.init",
      "event.name": "h4.audit",
      audit_id: auditId,
      actor: row.actor,
      action: "init",
      reason: row.reason,
      before: null,
      after: {
        day_micro: record.day_micro,
        month_micro: record.month_micro,
        fallback_day_micro: record.fallback_day_micro,
        confirm_zero: record.confirm_zero,
        renewed,
      },
    },
    "The operator initialized the store; its acknowledgement was lost, and the journal record follows now.",
  );
}

/** Whether the state row is this init's: written by this actor, at this init's own time. */
async function initLanded(store: Store, actor: string, at: number): Promise<boolean> {
  try {
    const { rows } = await store.query<{ initialized_by: string; initialized_at: Date | string }>(
      "SELECT initialized_by, initialized_at FROM gateway.stack_state WHERE id = 1",
    );
    const row = rows[0];
    return row !== undefined && row.initialized_by === actor && new Date(row.initialized_at).getTime() === at;
  } catch {
    return false;
  }
}
