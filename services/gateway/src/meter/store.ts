// The gateway's state store: gateway-state, a Postgres 17 holding schema `gateway` (data-model.md §2.1).
//
// - The pool runs statement_timeout=250ms, lock_timeout=250ms, idle_in_transaction_session_timeout=2s, and
//   connectionTimeoutMillis=500, with at most 10 connections plus one for LISTEN. Any error or timeout on a
//   request's path is store_unreachable: the stack fails closed (FR-031).
// - Every connection resolves the store's host through c-ares (core/resolve.ts), not getaddrinfo (tasks.md T189).
//   pg-pool drops a client idle for 10 s, so a quiet stack opens a connection for most requests. A getaddrinfo the
//   resolver doesn't answer holds one of the two threads libuv gives lookups after pg has given up at 500 ms, and
//   while the store is stopped, the pool's own lookups would fill both and queue every other lookup in the process.
// - Migrations apply at startup, in file order, one transaction each, under a fixed advisory lock, each recorded
//   with its SHA-256. A changed file stops the gateway (exit 1). A store that records a migration this build doesn't
//   have, which is what a rollback across a migration looks like, exits 78 schema_newer_than_code.
// - A store that is down at startup doesn't stop the gateway: it starts, answers store_unreachable, and retries
//   every 5 s.
// - grafana_ro's password is set at every start from GATEWAY_GRAFANA_RO_PASSWORD, as a SCRAM-SHA-256 verifier, so
//   the plaintext never reaches Postgres or its logs (§2.9).
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type pg from "pg";

import { aresSocket } from "../core/resolve.js";

export const STORE_RETRY_MS = 5_000;
/** The fixed advisory lock migrations run under: "h4ga". */
export const MIGRATION_LOCK_KEY = 0x6834_6761;
export const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);

// ---------------------------------------------------------------------------------------------------------------
// The database, behind an interface: pg in production, PGlite in the tests
// ---------------------------------------------------------------------------------------------------------------

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface Session extends Queryable {
  /** A script of several statements, with no parameters: a migration file. */
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  /** One connection for the length of `fn`: for an advisory lock or a transaction. */
  withSession<T>(fn: (session: Session) => Promise<T>, opts?: { purpose?: "migrate" }): Promise<T>;
  /**
   * The one LISTEN connection (the alert dispatcher's, tasks.md T077). Resolves to its close function. `onEnd` is
   * called once if the connection ends or fails on its own, as when Postgres restarts, so the caller can listen again;
   * never after the close function ran.
   */
  listen(channel: string, onNotify: () => void, onEnd: () => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export interface PgSettings {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/** Compose sets these on the gateway (env-files.md §4); the password stays its own variable, never in a URL. */
export function pgSettingsFromEnv(env: Readonly<Record<string, string | undefined>>): PgSettings {
  return {
    host: env.GATEWAY_DB_HOST ?? "gateway-state",
    port: Number(env.GATEWAY_DB_PORT ?? 5432),
    database: env.GATEWAY_DB_NAME ?? "gateway",
    user: env.GATEWAY_DB_USER ?? "gateway",
    password: env.GATEWAY_DB_PASSWORD ?? "",
  };
}

export function buildPoolConfig(s: PgSettings): pg.PoolConfig {
  return {
    host: s.host,
    port: s.port,
    database: s.database,
    user: s.user,
    password: s.password,
    application_name: "h4-gateway",
    max: 10,
    statement_timeout: 250,
    lock_timeout: 250,
    idle_in_transaction_session_timeout: 2_000,
    connectionTimeoutMillis: 500,
    stream: aresSocket,
  };
}

/**
 * The pg-backed database. pg loads through require, after the telemetry SDK has started, so its instrumentation
 * can wrap it (telemetry.md §3.1).
 */
export function pgDatabase(s: PgSettings): Database {
  const { Client, Pool } = createRequire(import.meta.url)("pg") as typeof pg;
  const config = buildPoolConfig(s);
  const pool = new Pool(config);
  // An idle client's error: the pool drops that client, and the next query reports any outage as
  // store_unreachable. Without a listener, the error would crash the process.
  pool.on("error", () => {});
  const sessionOf = (client: pg.ClientBase): Session => ({
    query: async <R>(text: string, params?: unknown[]) =>
      (await client.query(text, params)) as unknown as { rows: R[] },
    exec: async (sql) => void (await client.query(sql)),
  });
  return {
    query: async <R>(text: string, params?: unknown[]) => (await pool.query(text, params)) as unknown as { rows: R[] },
    async withSession(fn, opts) {
      // pg emits 'error' on a client whose connection fails, and pg-pool stops listening on a client it hands out.
      // An 'error' with no listener throws, so a dropped connection would crash the process. Each session listens
      // for its whole length instead: the query in flight rejects, and the caller answers store_unreachable
      // (data-model.md §2.1). A failed client keeps the listener while pg tears it down.
      let failure: Error | undefined;
      const onError = (err: Error): void => {
        failure ??= err;
      };
      if (opts?.purpose === "migrate") {
        // Migrations aren't on a request's path: they may wait on the lock and take longer than 250 ms.
        const client = new Client({ ...config, statement_timeout: 60_000, lock_timeout: 60_000 });
        client.on("error", onError);
        try {
          await client.connect();
          return await fn(sessionOf(client));
        } finally {
          await client.end().catch(() => {});
        }
      }
      const client = await pool.connect();
      client.on("error", onError);
      try {
        return await fn(sessionOf(client));
      } catch (err) {
        failure ??= err instanceof Error ? err : new Error("the session failed");
        throw err;
      } finally {
        // A client whose connection failed, or whose session threw (perhaps inside a transaction), is discarded
        // rather than handed to the next caller. A healthy one goes back, and the pool listens while it's idle.
        if (failure === undefined) client.off("error", onError);
        client.release(failure);
      }
    },
    async listen(channel, onNotify, onEnd) {
      if (!/^[a-z_]+$/.test(channel)) throw new Error("a channel name is lower-case letters and underscores");
      const client = new Client(config);
      let closed = false;
      let ended = false;
      // A dropped connection emits 'error', then 'end'. Either one ends this LISTEN: the client goes, and the caller
      // listens again on a fresh one. An error here must not crash the process, and none is thrown from here.
      const end = (): void => {
        if (ended) return;
        ended = true;
        void client.end().catch(() => {});
        if (!closed) onEnd();
      };
      client.on("error", end);
      client.on("end", end);
      await client.connect();
      client.on("notification", (msg) => {
        if (msg.channel === channel) onNotify();
      });
      await client.query(`LISTEN ${channel}`);
      return async () => {
        closed = true;
        await client.end().catch(() => {});
      };
    },
    close: () => pool.end(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------------------------------------------

export interface Migration {
  version: number;
  name: string;
  sql: string;
  sha256: string;
}

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** migrations/NNNN_name.sql, in version order, each with the SHA-256 of its bytes. */
export async function readMigrations(dir: URL = MIGRATIONS_DIR): Promise<Migration[]> {
  const out: Migration[] = [];
  for (const file of (await readdir(dir)).sort()) {
    const m = MIGRATION_FILE.exec(file);
    if (!m) continue;
    const bytes = await readFile(new URL(file, dir));
    out.push({
      version: Number(m[1]),
      name: `${m[1]}_${m[2]}`,
      sql: bytes.toString("utf8"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i]?.version === out[i - 1]?.version) throw new Error(`two migrations are version ${out[i]?.version}`);
  }
  return out;
}

export type FatalReason =
  | "schema_newer_than_code"
  | "migration_changed"
  | "migration_gap"
  | "test_clock_in_prod"
  | "grafana_ro_password_invalid";

/** The fatal reasons that are configuration refusals: exit 78 (plan §5.8; env-files.md §11). */
const REFUSALS: ReadonlySet<FatalReason> = new Set([
  "schema_newer_than_code",
  "test_clock_in_prod",
  "grafana_ro_password_invalid",
]);

/** A store problem retrying can't fix. The gateway exits with `exitCode`: 78 for a refusal, 1 otherwise. */
export class FatalStoreError extends Error {
  readonly exitCode: 1 | 78;

  constructor(
    readonly reason: FatalReason,
    message: string,
  ) {
    super(message);
    this.name = "FatalStoreError";
    this.exitCode = REFUSALS.has(reason) ? 78 : 1;
  }
}

/** Apply what the store lacks, under the advisory lock. Resolves to the versions applied now. */
export async function runMigrations(db: Database, migrations: readonly Migration[]): Promise<number[]> {
  return db.withSession(
    async (s) => {
      await s.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      try {
        await s.exec(
          `CREATE SCHEMA IF NOT EXISTS gateway;
           CREATE TABLE IF NOT EXISTS gateway.schema_migrations (
             version integer PRIMARY KEY, name text NOT NULL, sha256 text NOT NULL, applied_at timestamptz NOT NULL
           );`,
        );
        const { rows } = await s.query<{ version: number; name: string; sha256: string }>(
          "SELECT version, name, sha256 FROM gateway.schema_migrations ORDER BY version",
        );
        const known = new Map(migrations.map((m) => [m.version, m]));
        for (const row of rows) {
          const mine = known.get(Number(row.version));
          if (mine === undefined) {
            throw new FatalStoreError(
              "schema_newer_than_code",
              `the store records migration ${row.version} (${row.name}), which this build doesn't have`,
            );
          }
          if (mine.sha256 !== row.sha256) {
            throw new FatalStoreError(
              "migration_changed",
              `migration ${mine.name} no longer matches the SHA-256 the store recorded when it was applied`,
            );
          }
        }
        const applied = new Set(rows.map((r) => Number(r.version)));
        const latest = Math.max(0, ...applied);
        const pending = migrations.filter((m) => !applied.has(m.version));
        const older = pending.find((m) => m.version < latest);
        if (older) {
          throw new FatalStoreError(
            "migration_gap",
            `migration ${older.name} is older than migration ${latest}, which the store already has`,
          );
        }
        for (const m of pending) {
          await s.query("BEGIN");
          try {
            await s.exec(m.sql);
            await s.query("INSERT INTO gateway.schema_migrations VALUES ($1, $2, $3, now())", [
              m.version,
              m.name,
              m.sha256,
            ]);
            await s.query("COMMIT");
          } catch (err) {
            await s.query("ROLLBACK").catch(() => {});
            throw err;
          }
        }
        return pending.map((m) => m.version);
      } finally {
        await s.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
      }
    },
    { purpose: "migrate" },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// grafana_ro's password (§2.9)
// ---------------------------------------------------------------------------------------------------------------

const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

/**
 * The SCRAM-SHA-256 verifier Postgres stores for a password (RFC 5802, RFC 7677):
 * SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>, in base64. Printable ASCII only, which SASLprep leaves
 * unchanged; generated passwords are 64 hex (env-files.md §9.2).
 */
export function scramSha256Verifier(password: string, salt: Buffer = randomBytes(16), iterations = 4_096): string {
  if (!PRINTABLE_ASCII.test(password)) throw new Error("the grafana_ro password must be printable ASCII");
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

const VERIFIER = /^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

/** ALTER ROLE takes no parameters, so the verifier, which holds no quote, is checked and then written in. */
export async function setGrafanaRoPassword(db: Queryable, password: string): Promise<void> {
  const verifier = scramSha256Verifier(password);
  if (!VERIFIER.test(verifier)) throw new Error("unexpected verifier shape");
  await db.query(`ALTER ROLE grafana_ro PASSWORD '${verifier}'`);
}

// ---------------------------------------------------------------------------------------------------------------
// The store: migrations at startup, retried while the store is down, and the state read of data-model.md §7.1
// ---------------------------------------------------------------------------------------------------------------

export type StoreStatus = "starting" | "unreachable" | "ready";

export type StateRead =
  | { kind: "unreachable" }
  | { kind: "uninitialized" }
  | {
      kind: "ok";
      state: "normal" | "degraded";
      since: Date;
      crossed: string[];
      fallbackAwaitingRenewal: boolean;
      fallbackAwaitingSince: Date | null;
      testClockOffsetMs: number | null;
    };

/** The pino methods the store logs with. */
export interface StoreLogger {
  info(record: object, msg: string): void;
  warn(record: object, msg: string): void;
  error(record: object, msg: string): void;
}

export interface StoreOptions {
  db: Database;
  migrations: readonly Migration[];
  /** H4_ENV: prod refuses a store whose state row carries a test clock offset. */
  envClass: "prod" | "dev";
  logger: StoreLogger;
  /** A fatal error found on a retry, after the listeners are up: the gateway logs it and exits. */
  onFatal: (err: FatalStoreError) => void;
  /** GATEWAY_GRAFANA_RO_PASSWORD; unset in tests that don't need the role's login. */
  grafanaRoPassword?: string;
  retryMs?: number;
  realNow?: () => number;
}

export type MeterName = "day" | "month" | "fallback_day";

export interface MeterRow {
  meter: MeterName;
  periodKey: string;
  spentMicro: bigint;
  reservedMicro: bigint;
  allowanceMicro: bigint | null; // fallback_day only
  grantNo: number | null; // fallback_day only
}

/** Thrown inside Store.transaction to roll it back and resolve with `value`: a refusal, not a failure. */
export class Rollback<T> {
  constructor(readonly value: T) {}
}

/** A query the store couldn't take: it isn't ready (starting, or retrying after an outage). */
export class StoreUnavailableError extends Error {
  readonly code = "STORE_NOT_READY";
  constructor() {
    super("the store isn't ready");
    this.name = "StoreUnavailableError";
  }
}

/** A bigint column as pg returns it (a string), as PGlite does (a number), or a numeric sum (a string). */
export function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new TypeError("not an integer column");
}

/** A Postgres SQLSTATE, or a Node error code such as ECONNREFUSED: never a message, which can carry an address. */
export function errorClass(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "unknown";
}

/**
 * The SQLSTATE the server answered with, when it answered: five digits or capitals with a digit among them, such as
 * 23514 or 42P01. A Node error code of five letters, such as EPIPE, has none.
 */
export function sqlStateOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && /[0-9]/.test(code) ? code : undefined;
}

/**
 * The SQLSTATE classes of a statement the store refused while working: a bad value, a constraint, a syntax error, a
 * missing object, a privilege, a trigger's RAISE. The store answered, so it isn't down: the statement was wrong.
 */
const STATEMENT_CLASSES: ReadonlySet<string> = new Set([
  "0A", // feature not supported
  "21", // cardinality violation
  "22", // data exception
  "23", // integrity constraint violation: CHECK, UNIQUE, NOT NULL
  "26", // invalid SQL statement name
  "27", // triggered data change violation
  "2B", // dependent privilege descriptors still exist
  "2D", // invalid transaction termination
  "2F", // SQL routine exception
  "34", // invalid cursor name
  "3D", // invalid catalog name
  "3F", // invalid schema name
  "42", // syntax error or access rule violation
  "44", // WITH CHECK OPTION violation
  "P0", // PL/pgSQL: the audit log's append-only trigger raises here
]);

/** The JavaScript classes a bug in the gateway's own code raises. */
const BUGS = [TypeError, RangeError, ReferenceError, SyntaxError] as const;

/**
 * A failure of the store itself, which is store_unreachable (data-model.md §2.1): no connection, a dropped one, a
 * statement or lock timeout, the server going away, or a store that isn't ready. A statement the store refused, such as
 * a CHECK violation, is a bug in the gateway, not an outage, and a request answers 500 for it (tasks.md T072).
 */
export function isStoreFailure(err: unknown): boolean {
  if (err instanceof StoreUnavailableError || err instanceof CommitUnknownError) return true;
  if (!(err instanceof Error) || BUGS.some((cls) => err instanceof cls)) return false;
  const sqlstate = sqlStateOf(err);
  return sqlstate === undefined || !STATEMENT_CLASSES.has(sqlstate.slice(0, 2));
}

/**
 * COMMIT was sent, and its answer was lost: the connection dropped, or the server went away, before the
 * acknowledgement came back. The transaction may have committed or not. It carries what the transaction computed, so
 * a caller that re-reads the store and finds its own write can finish as if the acknowledgement had arrived
 * (tasks.md T072).
 */
export class CommitUnknownError<T = unknown> extends Error {
  readonly code = "COMMIT_UNKNOWN";
  /** The failure's class, never its message. */
  readonly failure: string;

  constructor(
    readonly value: T,
    failure: unknown,
  ) {
    super("COMMIT's acknowledgement was lost");
    this.name = "CommitUnknownError";
    this.failure = errorClass(failure);
  }
}

/** A COMMIT that failed with no answer, or with the server going away, may have landed; one the server refused didn't. */
function commitOutcomeUnknown(err: unknown): boolean {
  if (!isStoreFailure(err)) return false;
  const sqlstate = sqlStateOf(err);
  return sqlstate === undefined || ["08", "57", "58", "XX"].includes(sqlstate.slice(0, 2));
}

const OUTAGE_LOG_EVERY_MS = 60_000;

/**
 * The SQLSTATEs of a state read whose schema is gone: undefined_table and invalid_schema_name. The store answers but
 * holds nothing, so it was wiped and brought back empty while the gateway ran (plan §8 step 11).
 */
const SCHEMA_GONE: ReadonlySet<string> = new Set(["42P01", "3F000"]);

export class Store {
  status: StoreStatus = "starting";
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  private outageSince: number | undefined;
  private outageLoggedAt: number | undefined;
  /** When the migrations last ran again for a schema found gone, real ms: at most once per retry interval. */
  private remigratedAt: number | undefined;
  /** That run, while it lasts: reads wait for it. */
  private remigration: Promise<void> | undefined;

  constructor(private readonly opts: StoreOptions) {}

  private now(): number {
    return (this.opts.realNow ?? Date.now)();
  }

  /**
   * The first attempt. It resolves once that attempt has settled, ready or not: a store that is down is retried in
   * the background. It rejects only with a FatalStoreError, before the listeners start.
   */
  async start(): Promise<void> {
    await this.attempt(true);
  }

  private async attempt(first: boolean): Promise<void> {
    if (this.closed) return;
    try {
      // validate-env refuses such a password first; without this, every retry would fail on it, and the store would
      // stay unreachable for good.
      const password = this.opts.grafanaRoPassword;
      if (password && !PRINTABLE_ASCII.test(password)) {
        throw new FatalStoreError(
          "grafana_ro_password_invalid",
          "GATEWAY_GRAFANA_RO_PASSWORD isn't printable ASCII, so grafana_ro's verifier can't be made (env-files.md §11)",
        );
      }
      const versions = await runMigrations(this.opts.db, this.opts.migrations);
      if (this.opts.grafanaRoPassword) await setGrafanaRoPassword(this.opts.db, this.opts.grafanaRoPassword);
      await this.refuseTestClockInProd();
      this.status = "ready";
      this.opts.logger.info(
        {
          event: "migrations.applied",
          versions,
          grafana_ro_login: this.opts.grafanaRoPassword ? "enabled" : "disabled",
        },
        "The store's migrations are in place.",
      );
      this.recovered();
    } catch (err) {
      if (err instanceof FatalStoreError) {
        this.status = "unreachable";
        if (first) throw err;
        this.opts.onFatal(err);
        return;
      }
      this.status = "unreachable";
      this.noteOutage(err);
      if (!this.closed) {
        this.timer = setTimeout(() => void this.attempt(false), this.opts.retryMs ?? STORE_RETRY_MS);
      }
    }
  }

  private async refuseTestClockInProd(): Promise<void> {
    if (this.opts.envClass !== "prod") return;
    const { rows } = await this.opts.db.query<{ offset: unknown }>(
      "SELECT test_clock_offset_ms AS offset FROM gateway.stack_state WHERE id = 1",
    );
    if (rows[0] && rows[0].offset !== null) {
      throw new FatalStoreError(
        "test_clock_in_prod",
        "the store's stack_state carries a test clock offset, which prod refuses (plan §5.8)",
      );
    }
  }

  /** state.unknown when an outage starts, then at most once a minute while it lasts (telemetry.md §5.2). */
  noteOutage(err: unknown): void {
    const now = this.now();
    this.outageSince ??= now;
    if (this.outageLoggedAt === undefined || now - this.outageLoggedAt >= OUTAGE_LOG_EVERY_MS) {
      this.outageLoggedAt = now;
      this.opts.logger.error(
        {
          event: "state.unknown",
          condition: "store_unreachable",
          since: new Date(this.outageSince).toISOString(),
          error_class: err instanceof CommitUnknownError ? err.failure : errorClass(err),
        },
        "The kill-switch store can't be read, so the stack fails closed.",
      );
    }
  }

  private recovered(): void {
    if (this.outageSince === undefined) return;
    const outageS = Math.round((this.now() - this.outageSince) / 1_000);
    this.outageSince = undefined;
    this.outageLoggedAt = undefined;
    this.opts.logger.info({ event: "state.recovered", outage_s: outageS }, "The kill-switch store answers again.");
  }

  /** When the current outage began (real ms): the `since` of a store_unreachable answer. Undefined while it answers. */
  outageStartedAt(): number | undefined {
    return this.outageSince;
  }

  /**
   * A query on a request's path. It is refused while the store isn't ready. A failure of the store itself is noted as
   * an outage, since any error or timeout on a request's path means store_unreachable (data-model.md §2.1); a
   * statement the store refused isn't one (isStoreFailure).
   */
  async query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> {
    if (this.status !== "ready") throw new StoreUnavailableError();
    try {
      return await this.opts.db.query<R>(text, params);
    } catch (err) {
      if (isStoreFailure(err)) this.noteOutage(err);
      throw err;
    }
  }

  /**
   * One transaction on one connection: BEGIN, `fn`, then COMMIT, or ROLLBACK on any error. `fn` throws a Rollback to
   * roll back and resolve with its value: a refusal, such as a 409, and no outage. A failure of the store is noted as
   * an outage. A COMMIT whose answer was lost rejects with a CommitUnknownError carrying `fn`'s value, so the caller
   * can re-read the store and find out whether it landed.
   */
  async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    if (this.status !== "ready") throw new StoreUnavailableError();
    try {
      return await this.opts.db.withSession(async (session) => {
        await session.query("BEGIN");
        let value: T;
        try {
          value = await fn(session);
        } catch (err) {
          await session.query("ROLLBACK").catch(() => {});
          if (err instanceof Rollback) return err.value as T;
          throw err;
        }
        try {
          await session.query("COMMIT");
        } catch (err) {
          await session.query("ROLLBACK").catch(() => {});
          if (commitOutcomeUnknown(err)) throw new CommitUnknownError(value, err);
          throw err;
        }
        return value;
      });
    } catch (err) {
      if (isStoreFailure(err)) this.noteOutage(err);
      throw err;
    }
  }

  /** The current periods' meter rows (data-model.md §2.3); a period with no row yet has none here. */
  async readMeters(day: string, month: string): Promise<MeterRow[]> {
    const { rows } = await this.query<{
      meter: MeterName;
      period_key: string;
      spent_micro: unknown;
      reserved_micro: unknown;
      allowance_micro: unknown;
      grant_no: unknown;
    }>(
      `SELECT meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no FROM gateway.meters
       WHERE (meter = 'day' AND period_key = $1) OR (meter = 'month' AND period_key = $2)
          OR (meter = 'fallback_day' AND period_key = $1)`,
      [day, month],
    );
    return rows.map((r) => ({
      meter: r.meter,
      periodKey: r.period_key,
      spentMicro: toBigInt(r.spent_micro),
      reservedMicro: toBigInt(r.reserved_micro),
      allowanceMicro: r.allowance_micro === null ? null : toBigInt(r.allowance_micro),
      grantNo: r.grant_no === null ? null : Number(r.grant_no),
    }));
  }

  /**
   * The state read at request start (data-model.md §7.1): no cache, and any failure is store_unreachable, but one. A
   * store that answers without its schema was wiped and brought back empty under the running gateway: the migrations
   * run again, as at startup, and the read follows them, so the empty store answers store_uninitialized (§6.1). Reads
   * that arrive meanwhile wait for the same run. store_unreachable stays for a store that can't be reached, or whose
   * migrations fail, which are then retried every 5 s.
   */
  async readStackState(): Promise<StateRead> {
    if (this.remigration !== undefined) await this.remigration;
    let read = await this.readOnce();
    if (read.kind === "schema_gone" && (this.remigration !== undefined || this.migrateAgain())) {
      await this.remigration;
      read = await this.readOnce();
    }
    if (read.kind !== "schema_gone") return read;
    this.noteOutage(read.err);
    return { kind: "unreachable" };
  }

  private async readOnce(): Promise<StateRead | { kind: "schema_gone"; err: unknown }> {
    if (this.status !== "ready") return { kind: "unreachable" };
    try {
      const { rows } = await this.opts.db.query<{
        state: "normal" | "degraded";
        since: Date | string;
        crossed: string[];
        fallback_awaiting_renewal: boolean;
        fallback_awaiting_since: Date | string | null;
        test_clock_offset_ms: number | string | bigint | null;
      }>(
        `SELECT state, since, crossed, fallback_awaiting_renewal, fallback_awaiting_since, test_clock_offset_ms
         FROM gateway.stack_state WHERE id = 1`,
      );
      const row = rows[0];
      this.recovered();
      if (!row) return { kind: "uninitialized" };
      return {
        kind: "ok",
        state: row.state,
        since: new Date(row.since),
        crossed: row.crossed,
        fallbackAwaitingRenewal: row.fallback_awaiting_renewal,
        fallbackAwaitingSince: row.fallback_awaiting_since === null ? null : new Date(row.fallback_awaiting_since),
        testClockOffsetMs: row.test_clock_offset_ms === null ? null : Number(row.test_clock_offset_ms),
      };
    } catch (err) {
      const sqlstate = sqlStateOf(err);
      if (sqlstate !== undefined && SCHEMA_GONE.has(sqlstate)) return { kind: "schema_gone", err };
      this.noteOutage(err);
      return { kind: "unreachable" };
    }
  }

  /**
   * Starts the migrations again for a schema found gone (data-model.md §2.1): the same run as at startup, under the
   * same advisory lock and the same checks, and retried every 5 s if it fails. While it runs the store isn't ready, so
   * queries answer as store_unreachable, and reads wait for it. At most once per retry interval: a schema the
   * migrations can't bring back, such as one with a table dropped by hand, stays store_unreachable without a run on
   * every request. Says whether it started one.
   */
  private migrateAgain(): boolean {
    const now = this.now();
    if (this.closed || this.status !== "ready") return false;
    if (this.remigratedAt !== undefined && now - this.remigratedAt < (this.opts.retryMs ?? STORE_RETRY_MS))
      return false;
    this.remigratedAt = now;
    this.status = "unreachable";
    this.remigration = this.attempt(false).finally(() => {
      this.remigration = undefined;
    });
    return true;
  }

  /** The dedicated LISTEN connection: the alert dispatcher's wake-up (data-model.md §2.7). Resolves to its close. */
  listen(channel: string, onNotify: () => void, onEnd: () => void): Promise<() => Promise<void>> {
    return this.opts.db.listen(channel, onNotify, onEnd);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    await this.opts.db.close();
  }
}
