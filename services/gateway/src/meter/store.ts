// The gateway's state store: gateway-state, a Postgres 17 holding schema `gateway` (data-model.md §2.1).
//
// - The pool runs statement_timeout=250ms, lock_timeout=250ms, idle_in_transaction_session_timeout=2s, and
//   connectionTimeoutMillis=500, with at most 10 connections plus one for LISTEN. Any error or timeout on a
//   request's path is store_unreachable: the stack fails closed (FR-031).
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
  /** The one LISTEN connection (the alert dispatcher's, tasks.md T077). Resolves to its close function. */
  listen(channel: string, onNotify: () => void): Promise<() => Promise<void>>;
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
    async listen(channel, onNotify) {
      if (!/^[a-z_]+$/.test(channel)) throw new Error("a channel name is lower-case letters and underscores");
      const client = new Client(config);
      client.on("error", () => {}); // the caller reconnects; an error here must not crash the process
      await client.connect();
      client.on("notification", (msg) => {
        if (msg.channel === channel) onNotify();
      });
      await client.query(`LISTEN ${channel}`);
      return async () => void (await client.end().catch(() => {}));
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

/** A Postgres SQLSTATE, or a Node error code such as ECONNREFUSED: never a message, which can carry an address. */
export function errorClass(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "unknown";
}

const OUTAGE_LOG_EVERY_MS = 60_000;

export class Store {
  status: StoreStatus = "starting";
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  private outageSince: number | undefined;
  private outageLoggedAt: number | undefined;

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
          error_class: errorClass(err),
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

  /** The state read at request start (data-model.md §7.1): no cache, and any failure is store_unreachable. */
  async readStackState(): Promise<StateRead> {
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
      this.noteOutage(err);
      return { kind: "unreachable" };
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    await this.opts.db.close();
  }
}
