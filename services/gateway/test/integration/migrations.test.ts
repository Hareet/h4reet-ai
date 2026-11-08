// The store's schema and its migrations, on PGlite (tasks.md T024, T025; data-model.md §2.1–§2.9): every migration
// applies, the SHA-256 check stops a changed file (exit 1), a schema newer than the code fails closed (exit 78), the
// audit trigger refuses UPDATE, DELETE, and TRUNCATE, and grafana_ro reads three objects and nothing else (the third,
// spec 003's gateway.v_studio_windows, came with 0003_studio_window: its contracts/gpu-window.md §3).
import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FatalStoreError,
  MIGRATION_LOCK_KEY,
  STORE_RETRY_MS,
  Store,
  buildPoolConfig,
  readMigrations,
  runMigrations,
  scramSha256Verifier,
  setGrafanaRoPassword,
  type Database,
  type Migration,
} from "../../src/meter/store.js";
import { testDatabase, type TestDatabase } from "../helpers/pglite.js";

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const HEX32 = "0123456789abcdef0123456789abcdef";
const HEX64 = "ab".repeat(32);

let migrations: Migration[];
beforeAll(async () => {
  migrations = await readMigrations();
});

/** A database with every migration applied. */
async function migrated(): Promise<TestDatabase> {
  const db = await testDatabase();
  await runMigrations(db, migrations);
  return db;
}

const fatal = async (p: Promise<unknown>): Promise<FatalStoreError> => {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(FatalStoreError);
  return err as FatalStoreError;
};

describe("the migration files", () => {
  it("are 0001_state, 0002_grafana_ro, 0003_studio_window, and 0004_twin, in order, each with the SHA-256 of its bytes", async () => {
    expect(migrations.map((m) => [m.version, m.name])).toEqual([
      [1, "0001_state"],
      [2, "0002_grafana_ro"],
      [3, "0003_studio_window"],
      [4, "0004_twin"],
    ]);
    const text = await readFile(new URL("../../migrations/0001_state.sql", import.meta.url), "utf8");
    expect(migrations[0]?.sha256).toBe(sha256(text));
    expect(migrations[0]?.sql).toBe(text);
  });
});

describe("applying them", () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = await testDatabase();
  });
  afterEach(async () => {
    await db.close();
  });

  it("applies each, records each with its SHA-256, and holds the advisory lock throughout", async () => {
    expect(await runMigrations(db, migrations)).toEqual([1, 2, 3, 4]);
    const { rows } = await db.pg.query<{ version: number; name: string; sha256: string }>(
      "SELECT version, name, sha256 FROM gateway.schema_migrations ORDER BY version",
    );
    expect(rows).toEqual(migrations.map((m) => ({ version: m.version, name: m.name, sha256: m.sha256 })));
    expect(db.statements[0]).toBe("SELECT pg_advisory_lock($1)");
    expect(db.statements.at(-1)).toBe("SELECT pg_advisory_unlock($1)");
    // Released: another session could take it now.
    const lock = await db.pg.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [MIGRATION_LOCK_KEY]);
    expect(lock.rows[0]?.ok).toBe(true);
  });

  it("applies each once: a second run changes nothing", async () => {
    await runMigrations(db, migrations);
    const before = await db.pg.query("SELECT * FROM gateway.schema_migrations ORDER BY version");
    expect(await runMigrations(db, migrations)).toEqual([]);
    expect((await db.pg.query("SELECT * FROM gateway.schema_migrations ORDER BY version")).rows).toEqual(before.rows);
  });

  it("stops with exit 1 when a recorded migration's file has changed", async () => {
    await runMigrations(db, migrations);
    const changed = migrations.map((m) =>
      m.version === 1 ? { ...m, sql: `${m.sql}\n-- edited`, sha256: sha256(`${m.sql}\n-- edited`) } : m,
    );
    const err = await fatal(runMigrations(db, changed));
    expect([err.exitCode, err.reason]).toEqual([1, "migration_changed"]);
    expect(err.message).toContain("0001_state");
  });

  it("exits 78 schema_newer_than_code when the store records a migration this build doesn't have", async () => {
    await runMigrations(db, migrations);
    // A rollback to a commit from before 0002 looks like this.
    const err = await fatal(runMigrations(db, migrations.slice(0, 1)));
    expect([err.exitCode, err.reason]).toEqual([78, "schema_newer_than_code"]);
    expect(err.message).toContain("2");
    await db.pg.query("INSERT INTO gateway.schema_migrations VALUES (7, '0007_later', $1, now())", [HEX64]);
    expect((await fatal(runMigrations(db, migrations))).reason).toBe("schema_newer_than_code");
  });

  it("refuses to apply a migration older than one already applied (exit 1)", async () => {
    const later: Migration = { version: 4, name: "0004_test", sql: "SELECT 1;", sha256: sha256("SELECT 1;") };
    await runMigrations(db, migrations.slice(0, 1));
    await db.pg.query("INSERT INTO gateway.schema_migrations VALUES (4, '0004_test', $1, now())", [later.sha256]);
    const err = await fatal(runMigrations(db, [...migrations, later]));
    expect([err.exitCode, err.reason]).toEqual([1, "migration_gap"]);
  });

  it("rolls back a migration that fails, and records nothing for it", async () => {
    const broken: Migration = {
      version: 5,
      name: "0005_broken",
      sql: "CREATE TABLE gateway.half_done (id int); SELECT no_such_function();",
      sha256: sha256("x"),
    };
    await expect(runMigrations(db, [...migrations, broken])).rejects.toThrow(/no_such_function/);
    const { rows } = await db.pg.query<{ version: number }>("SELECT version FROM gateway.schema_migrations");
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4]);
    expect((await db.pg.query("SELECT to_regclass('gateway.half_done') AS t")).rows[0]).toEqual({ t: null });
  });
});

describe("the schema (data-model.md §2.2–§2.9)", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await migrated();
  });
  afterAll(async () => {
    await db.close();
  });
  const refuses = (sql: string, params: unknown[] = []) => expect(db.pg.query(sql, params)).rejects.toThrow();
  const accepts = (sql: string, params: unknown[] = []) => expect(db.pg.query(sql, params)).resolves.toBeDefined();

  const state = (fields: Record<string, unknown>) => {
    const row = {
      id: 1,
      stack: "dev",
      env: "dev",
      state: "normal",
      since: "2026-10-08T00:00:00Z",
      crossed: "{}",
      fallback_awaiting_renewal: false,
      fallback_awaiting_since: null,
      initialized_at: "2026-10-08T00:00:00Z",
      initialized_by: "operator:dev#0123abcd",
      test_clock_offset_ms: null,
      updated_at: "2026-10-08T00:00:00Z",
      ...fields,
    };
    const keys = Object.keys(row);
    return [
      `INSERT INTO gateway.stack_state (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    ] as const;
  };

  it("stack_state is one row: id = 1, and degraded iff a ceiling is crossed", async () => {
    await refuses(...state({ id: 2 }));
    await refuses(...state({ state: "degraded", crossed: "{}" }));
    await refuses(...state({ state: "normal", crossed: "{day:2026-10-08}" }));
    await refuses(...state({ fallback_awaiting_renewal: true }));
    await refuses(...state({ env: "prod", stack: "prod", test_clock_offset_ms: 5 }));
    await refuses(...state({ test_clock_offset_ms: -1 }));
    await refuses(...state({ stack: "staging" }));
    await accepts(...state({ state: "degraded", crossed: "{day:2026-10-08}", test_clock_offset_ms: 86_400_000 }));
    await refuses(...state({})); // the singleton is taken
    await db.pg.query("DELETE FROM gateway.stack_state");
  });

  const meter = (meter: string, key: string, allowance: number | null, grant: number | null) =>
    db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, allowance_micro, grant_no, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [meter, key, allowance, grant],
    );

  it("meters: one row per (meter, period_key), and the allowance and grant on fallback_day only", async () => {
    await expect(meter("day", "2026-10-08", null, null)).resolves.toBeDefined();
    await expect(meter("day", "2026-10-08", null, null)).rejects.toThrow(/duplicate key/);
    await expect(meter("month", "2026-10", null, null)).resolves.toBeDefined();
    await expect(meter("fallback_day", "2026-10-08", 2_000_000, 1)).resolves.toBeDefined();
    await expect(meter("day", "2026-10-09", 2_000_000, 1)).rejects.toThrow(/meters_allowance_fallback_only/);
    await expect(meter("fallback_day", "2026-10-09", null, null)).rejects.toThrow(/meters_allowance_fallback_only/);
    await expect(meter("fallback_day", "2026-10-09", 2_000_000, 0)).rejects.toThrow(/grant_no/);
    await expect(meter("fallback_day", "2026-10-09", 0, 1)).rejects.toThrow(/allowance_micro/);
    await expect(meter("day", "2026-10", null, null)).rejects.toThrow(/meters_period_key_format/);
    await expect(meter("month", "2026-10-08", null, null)).rejects.toThrow(/meters_period_key_format/);
    await expect(meter("day", "2026-13-01", null, null)).rejects.toThrow(/meters_period_key_format/);
    await expect(db.pg.query("UPDATE gateway.meters SET spent_micro = -1 WHERE meter = 'day'")).rejects.toThrow(
      /spent_micro/,
    );
  });

  const reservation = (id: string, fields: Record<string, unknown> = {}) => {
    const row = {
      id,
      attribution: "fallback",
      adapter_id: "synthetic",
      provider: "synthetic",
      model: "metered-test",
      price_version: "2026-10-08.1",
      max_micro: 100_000,
      period_day: "2026-10-08",
      period_month: "2026-10",
      created_at: "2026-10-08T10:00:00Z",
      expires_at: "2026-10-08T10:02:00Z",
      request_id: HEX32,
      trace_id: HEX32,
      purpose: "hello",
      route_reason: "local_unhealthy",
      routing_sha: HEX64,
      ...fields,
    };
    const keys = Object.keys(row);
    return db.pg.query(
      `INSERT INTO gateway.reservations (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    );
  };

  it("reservations: a metered call in flight, with what its ledger row will need", async () => {
    await expect(reservation("00000000-0000-4000-8000-000000000001")).resolves.toBeDefined();
    await expect(
      reservation("00000000-0000-4000-8000-000000000002", { attribution: "metered", route_reason: "local_failed" }),
    ).rejects.toThrow(/reservations_route_reason_fallback_only/);
    await expect(reservation("00000000-0000-4000-8000-000000000003", { attribution: "none" })).rejects.toThrow(
      /attribution/,
    );
    await expect(reservation("00000000-0000-4000-8000-000000000004", { trace_id: "nope" })).rejects.toThrow(/trace_id/);
  });

  it("the sweep can settle an expired reservation into a ledger row from the reservation alone (§2.4)", async () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    await reservation(id);
    await expect(
      db.pg.query(
        `INSERT INTO gateway.ledger (id, reservation_id, ts, started_at, stack, request_id, trace_id, purpose,
           route_decision, route_reason, attribution, adapter_id, provider, request_model, latency_ms, outcome,
           cost_micro, cost_basis, price_version, routing_sha, period_day, period_month)
         SELECT '00000000-0000-4000-8000-0000000000bb', r.id, r.expires_at, r.created_at, 'dev', r.request_id,
           r.trace_id, r.purpose, CASE WHEN r.attribution = 'fallback' THEN 'fallback' ELSE 'metered' END,
           r.route_reason, r.attribution, r.adapter_id, r.provider, r.model, 0, 'unknown', r.max_micro, 'expired',
           r.price_version, r.routing_sha, r.period_day, r.period_month
         FROM gateway.reservations r WHERE r.id = $1`,
        [id],
      ),
    ).resolves.toBeDefined();
  });

  let n = 0;
  const ledger = (fields: Record<string, unknown> = {}) => {
    n += 1;
    const row = {
      id: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`,
      reservation_id: null,
      ts: "2026-10-08T10:00:01Z",
      started_at: "2026-10-08T10:00:00Z",
      stack: "dev",
      request_id: HEX32,
      trace_id: HEX32,
      purpose: "hello",
      route_decision: "local",
      route_reason: null,
      attribution: "none",
      adapter_id: "local",
      provider: "local",
      request_model: "stand-in",
      response_model: "stand-in",
      input_tokens: 71,
      output_tokens: 14,
      latency_ms: 212,
      finish_reason: "stop",
      outcome: "ok",
      error_kind: null,
      cost_micro: 0,
      cost_basis: "none",
      price_version: "2026-10-08.1",
      routing_sha: HEX64,
      period_day: "2026-10-08",
      period_month: "2026-10",
      client_label: null,
      ...fields,
    };
    const keys = Object.keys(row);
    return db.pg.query(
      `INSERT INTO gateway.ledger (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    );
  };
  const metered = {
    route_decision: "fallback",
    route_reason: "local_failed",
    attribution: "fallback",
    adapter_id: "synthetic",
    provider: "synthetic",
    request_model: "metered-test",
    cost_micro: 100_000,
    cost_basis: "usage",
  };

  it("ledger: the row rules, the enumerations, and an idempotent commit's UNIQUE reservation_id", async () => {
    await expect(ledger()).resolves.toBeDefined();
    await expect(ledger({ ...metered, reservation_id: "00000000-0000-4000-8000-0000000000c1" })).resolves.toBeDefined();
    await expect(ledger({ ...metered, reservation_id: "00000000-0000-4000-8000-0000000000c1" })).rejects.toThrow(
      /duplicate key/,
    );
    await expect(ledger({ cost_basis: "estimated" })).rejects.toThrow(/cost_basis/);
    await expect(ledger({ outcome: "maybe" })).rejects.toThrow(/outcome/);
    await expect(ledger({ outcome: "unknown" })).rejects.toThrow(/ledger_unknown_only_expired/);
    await expect(ledger({ outcome: "error" })).rejects.toThrow(/ledger_error_kind_iff_error/);
    await expect(ledger({ outcome: "ok", error_kind: "timeout" })).rejects.toThrow(/ledger_error_kind_iff_error/);
    await expect(ledger({ outcome: "error", error_kind: "slow" })).rejects.toThrow(/error_kind/);
    await expect(ledger({ outcome: "error", error_kind: "unavailable", finish_reason: null })).resolves.toBeDefined();
    await expect(ledger({ cost_micro: 5 })).rejects.toThrow(/ledger_unmetered_costs_nothing/);
    await expect(ledger({ reservation_id: "00000000-0000-4000-8000-0000000000c2" })).rejects.toThrow(
      /ledger_reservation_iff_metered/,
    );
    await expect(ledger({ ...metered })).rejects.toThrow(/ledger_reservation_iff_metered/);
    await expect(ledger({ route_reason: "local_failed" })).rejects.toThrow(/ledger_route_reason_fallback_only/);
    await expect(ledger({ client_label: "Author's Terminal" })).rejects.toThrow(/client_label/);
    await expect(ledger({ client_label: "author-terminal" })).resolves.toBeDefined();
    await expect(ledger({ trace_id: HEX32.toUpperCase() })).rejects.toThrow(/trace_id/);
    await expect(ledger({ routing_sha: "abc" })).rejects.toThrow(/routing_sha/);
    await expect(ledger({ purpose: "chat" })).rejects.toThrow(/purpose/);
    await expect(ledger({ latency_ms: -1 })).rejects.toThrow(/latency_ms/);
  });

  // data-model.md §2.5's row rules for a paid call's cost_basis, and §7.3's commit table.
  let r = 0;
  const paid = (fields: Record<string, unknown>) => {
    r += 1;
    return ledger({ ...metered, reservation_id: `00000000-0000-4000-a000-${String(r).padStart(12, "0")}`, ...fields });
  };
  const failed = { outcome: "error", error_kind: "timeout", finish_reason: "error" };
  const sweep = {
    outcome: "unknown",
    cost_basis: "expired",
    cost_micro: 250_000,
    input_tokens: null,
    output_tokens: null,
    latency_ms: 0,
    finish_reason: null,
    response_model: null,
  };

  it("ledger: cost_basis 'reservation' only for a call that failed (possiblyBilled)", async () => {
    await expect(paid({ ...failed, cost_basis: "reservation", cost_micro: 250_000 })).resolves.toBeDefined();
    await expect(paid({ cost_basis: "reservation", cost_micro: 250_000 })).rejects.toThrow(
      /ledger_reservation_basis_failed/,
    );
  });

  it("ledger: a paid call with cost_basis 'none' failed, and cost nothing", async () => {
    await expect(
      paid({ outcome: "error", error_kind: "unavailable", finish_reason: null, cost_basis: "none", cost_micro: 0 }),
    ).resolves.toBeDefined();
    await expect(
      paid({ outcome: "error", error_kind: "unavailable", finish_reason: null, cost_basis: "none", cost_micro: 5000 }),
    ).rejects.toThrow(/ledger_paid_none_basis_failed/);
    await expect(paid({ cost_basis: "none", cost_micro: 0 })).rejects.toThrow(/ledger_paid_none_basis_failed/);
    // An unmetered call costs nothing whatever its outcome (the row rules' first line).
    await expect(ledger({ ...failed, error_kind: "unavailable" })).resolves.toBeDefined();
  });

  it("ledger: cost_basis 'expired' is a sweep's row, with no outcome, tokens, latency, or finish reason", async () => {
    await expect(paid(sweep)).resolves.toBeDefined();
    await expect(paid({ ...sweep, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 })).resolves.toBeDefined();
    await expect(paid({ ...sweep, outcome: "ok", input_tokens: 71, output_tokens: 14 })).rejects.toThrow(
      /ledger_expired_never_settled/,
    );
    await expect(paid({ ...sweep, outcome: "ok" })).rejects.toThrow(/ledger_expired_never_settled/);
    await expect(paid({ ...sweep, input_tokens: 71 })).rejects.toThrow(/ledger_expired_never_settled/);
    await expect(paid({ ...sweep, output_tokens: 14 })).rejects.toThrow(/ledger_expired_never_settled/);
    await expect(paid({ ...sweep, cache_read_tokens: 3 })).rejects.toThrow(/ledger_expired_never_settled/);
    await expect(paid({ ...sweep, latency_ms: 212 })).rejects.toThrow(/ledger_expired_never_settled/);
    await expect(paid({ ...sweep, finish_reason: "stop" })).rejects.toThrow(/ledger_expired_never_settled/);
    // With an error kind, outcome 'error' passes ledger_error_kind_iff_error; this CHECK still refuses it.
    await expect(paid({ ...sweep, outcome: "error", error_kind: "timeout" })).rejects.toThrow(
      /ledger_expired_never_settled/,
    );
  });

  const audit = (fields: Record<string, unknown>) => {
    const row = { ts: "2026-10-08T10:00:00Z", stack: "dev", actor: "operator:dev#0123abcd", ...fields };
    const keys = Object.keys(row);
    return db.pg.query(
      `INSERT INTO gateway.audit_log (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    );
  };

  it("audit_log: a reason of 10 to 500 characters for the operator's writes, and none for the gateway's", async () => {
    await expect(audit({ action: "reset", reason: "Breach rehearsal done." })).resolves.toBeDefined();
    await expect(audit({ action: "reset" })).rejects.toThrow(/audit_log_reason_iff_operator_write/);
    await expect(audit({ action: "reset", reason: "too short" })).rejects.toThrow(/audit_log_reason_length/);
    await expect(audit({ action: "reset", reason: "x".repeat(501) })).rejects.toThrow(/audit_log_reason_length/);
    await expect(audit({ action: "trip", actor: "gateway", reason: "the gateway gives none" })).rejects.toThrow(
      /audit_log_reason_iff_operator_write/,
    );
    await expect(audit({ action: "trip", actor: "gateway" })).resolves.toBeDefined();
    await expect(
      audit({ action: "auth_failed", actor: "unknown", detail: { class: "mismatch" } }),
    ).resolves.toBeDefined();
    await expect(audit({ action: "shutdown", actor: "gateway" })).rejects.toThrow(/action/);
    await expect(audit({ action: "trip", actor: "someone" })).rejects.toThrow(/actor/);
    // 0003_studio_window: the studio's GPU window is an operator write, with its reason (spec 003's gpu-window.md §1).
    await expect(audit({ action: "studio_window", reason: "studio: a portrait batch" })).resolves.toBeDefined();
    await expect(audit({ action: "studio_window" })).rejects.toThrow(/audit_log_reason_iff_operator_write/);
    await expect(audit({ action: "studio_window", reason: "too short" })).rejects.toThrow(/audit_log_reason_length/);
    const { rows } = await db.pg.query<{ recorded_at: Date; detail: unknown }>(
      "SELECT recorded_at, detail FROM gateway.audit_log WHERE action = 'trip'",
    );
    expect(rows[0]?.recorded_at).toBeInstanceOf(Date);
    expect(rows[0]?.detail).toEqual({});
  });

  it("audit_log is append-only: the trigger refuses UPDATE, DELETE, and TRUNCATE", async () => {
    await expect(db.pg.query("UPDATE gateway.audit_log SET reason = 'rewritten history'")).rejects.toThrow(
      /append-only: UPDATE refused/,
    );
    await expect(db.pg.query("DELETE FROM gateway.audit_log")).rejects.toThrow(/append-only: DELETE refused/);
    await expect(db.pg.query("TRUNCATE gateway.audit_log")).rejects.toThrow(/append-only: TRUNCATE refused/);
    const { rows } = await db.pg.query<{ n: number }>("SELECT count(*)::int AS n FROM gateway.audit_log");
    expect(rows[0]?.n).toBeGreaterThan(0);
  });

  const outbox = (key: string) =>
    db.pg.query(
      `INSERT INTO gateway.alert_outbox (dedupe_key, kind, stack, created_at, subject, body, facts, telegram_status,
         email_status) VALUES ($1, 'warn', 'dev', now(), 's', 'b', '{}', 'pending', 'pending')`,
      [key],
    );

  it("alert_outbox: a crossing alerts once (dedupe_key UNIQUE)", async () => {
    await expect(outbox("dev:warn:day:2026-10-08")).resolves.toBeDefined();
    await expect(outbox("dev:warn:day:2026-10-08")).rejects.toThrow(/duplicate key/);
    await expect(
      db.pg.query(
        `INSERT INTO gateway.alert_outbox (dedupe_key, kind, stack, created_at, subject, body, facts, telegram_status,
           email_status) VALUES ('k', 'store_unreachable', 'dev', now(), 's', 'b', '{}', 'pending', 'pending')`,
      ),
    ).rejects.toThrow(/kind/);
  });

  it("incidents: a period's ceiling is crossed once (UNIQUE (ceiling, period_key))", async () => {
    const incident = (ceiling: string, key: string) =>
      db.pg.query(
        `INSERT INTO gateway.incidents (created_at, stack, ceiling, period_key, ledger_id, trip_alert_key, status)
         VALUES (now(), 'dev', $1, $2, '00000000-0000-4000-8000-000000000001', 'dev:trip:day:2026-10-08', 'queued')`,
        [ceiling, key],
      );
    await expect(incident("day", "2026-10-08")).resolves.toBeDefined();
    await expect(incident("day", "2026-10-08")).rejects.toThrow(/duplicate key/);
    await expect(incident("month", "2026-10")).resolves.toBeDefined();
    await expect(incident("week", "2026-41")).rejects.toThrow(/ceiling/);
  });

  it("v_state joins the state row to the current periods' meters, by the gateway clock", async () => {
    await db.pg.query("DELETE FROM gateway.meters");
    expect((await db.pg.query("SELECT * FROM gateway.v_state")).rows).toEqual([]);
    const now = new Date();
    const offsetMs = 3 * 86_400_000; // dev's clock, three days ahead
    const ahead = new Date(now.getTime() + offsetMs);
    const day = ahead.toISOString().slice(0, 10);
    const month = ahead.toISOString().slice(0, 7);
    await db.pg.query(...state({ test_clock_offset_ms: offsetMs }));
    await db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no,
         created_at, updated_at)
       VALUES ('day', $1, 300000, 100000, NULL, NULL, now(), now()),
              ('day', $3, 999, 0, NULL, NULL, now(), now()),
              ('month', $2, 3800000, 100000, NULL, NULL, now(), now())`,
      [day, month, now.toISOString().slice(0, 10)],
    );
    const { rows } = await db.pg.query<Record<string, unknown>>("SELECT * FROM gateway.v_state");
    expect(rows).toHaveLength(1);
    const v = rows[0] as Record<string, unknown>;
    expect([v.day_key, v.month_key]).toEqual([day, month]);
    expect(Number(v.day_spent_micro)).toBe(300_000);
    expect(Number(v.day_reserved_micro)).toBe(100_000);
    expect(Number(v.month_spent_micro)).toBe(3_800_000);
    expect(Number(v.fallback_spent_micro)).toBe(0);
    expect(v.fallback_allowance_micro).toBeNull(); // NULL until today's row exists
    expect(Object.keys(v)).not.toContain("client_label");
    await db.pg.query("DELETE FROM gateway.stack_state");
  });
});

describe("grafana_ro (§2.9)", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await migrated();
  });
  afterAll(async () => {
    await db.close();
  });

  it("is a login role with no other powers, read-only, with a 2 s statement timeout", async () => {
    const { rows } = await db.pg.query<Record<string, unknown>>(
      `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolconfig
       FROM pg_roles WHERE rolname = 'grafana_ro'`,
    );
    expect(rows[0]).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolconfig: ["default_transaction_read_only=on", "statement_timeout=2s"],
    });
  });

  it("reads audit_log, v_state, and v_studio_windows, and is refused on every other table", async () => {
    const { rows: tables } = await db.pg.query<{ name: string }>(
      "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'gateway' ORDER BY tablename",
    );
    expect(tables.map((t) => t.name)).toEqual([
      "alert_outbox",
      "audit_log",
      "incidents",
      "ledger",
      "meters",
      "reservations",
      "schema_migrations",
      "stack_state",
    ]);
    await db.pg.exec("SET ROLE grafana_ro");
    try {
      await expect(db.pg.query("SELECT count(*) FROM gateway.audit_log")).resolves.toBeDefined();
      await expect(db.pg.query("SELECT * FROM gateway.v_state")).resolves.toBeDefined();
      await expect(db.pg.query("SELECT * FROM gateway.v_studio_windows")).resolves.toBeDefined();
      for (const { name } of tables.filter((t) => t.name !== "audit_log")) {
        await expect(db.pg.query(`SELECT 1 FROM gateway.${name} LIMIT 1`), name).rejects.toThrow(/permission denied/);
      }
      await expect(
        db.pg.query(
          "INSERT INTO gateway.audit_log (ts, stack, actor, action) VALUES (now(), 'dev', 'gateway', 'trip')",
        ),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.pg.exec("RESET ROLE");
    }
  });
});

describe("grafana_ro's password: a SCRAM-SHA-256 verifier computed in the gateway", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await migrated();
  });
  afterAll(async () => {
    await db.close();
  });

  const verifierOf = async (): Promise<string> =>
    (await db.pg.query<{ v: string }>("SELECT rolpassword AS v FROM pg_authid WHERE rolname = 'grafana_ro'")).rows[0]
      ?.v as string;

  it("equals Postgres's own verifier for the same password and salt", async () => {
    const password = "c0ffee".repeat(10); // generated passwords are 64 hex (env-files.md §9.2)
    await db.pg.exec(`SET password_encryption = 'scram-sha-256'; ALTER ROLE grafana_ro PASSWORD '${password}'`);
    const theirs = await verifierOf();
    const salt = Buffer.from(/^SCRAM-SHA-256\$4096:([^$]+)\$/.exec(theirs)?.[1] as string, "base64");
    expect(scramSha256Verifier(password, salt)).toBe(theirs);
  });

  it("is what setGrafanaRoPassword sends: the plaintext never reaches Postgres", async () => {
    const password = "beef".repeat(16);
    const sent = db.statements.length;
    await setGrafanaRoPassword(db, password);
    const statements = db.statements.slice(sent);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^ALTER ROLE grafana_ro PASSWORD 'SCRAM-SHA-256\$4096:/);
    expect(statements.join("\n")).not.toContain(password);
    const stored = await verifierOf();
    const [, salt, storedKey] = /^SCRAM-SHA-256\$4096:([^$]+)\$([^:]+):/.exec(stored) ?? [];
    // RFC 5802, recomputed here: StoredKey = H(HMAC(SaltedPassword, "Client Key")).
    const salted = pbkdf2Sync(password, Buffer.from(salt as string, "base64"), 4096, 32, "sha256");
    const expected = createHash("sha256")
      .update(createHmac("sha256", salted).update("Client Key").digest())
      .digest("base64");
    expect(storedKey).toBe(expected);
  });

  it("uses a fresh random salt each time", () => {
    expect(scramSha256Verifier("a".repeat(64))).not.toBe(scramSha256Verifier("a".repeat(64)));
  });

  it("refuses an empty or non-ASCII password, which SASLprep could change", async () => {
    await expect(setGrafanaRoPassword(db, "")).rejects.toThrow(/printable ASCII/);
    expect(() => scramSha256Verifier("pässword-with-umlaut")).toThrow(/printable ASCII/);
  });
});

describe("the connection pool (data-model.md §2.1)", () => {
  it("runs every statement and lock wait within 250 ms, connects within 500 ms, and holds at most 10", () => {
    const config = buildPoolConfig({
      host: "gateway-state",
      port: 5432,
      database: "gateway",
      user: "gateway",
      password: "not-a-real-one",
    });
    expect(config).toMatchObject({
      host: "gateway-state",
      port: 5432,
      database: "gateway",
      user: "gateway",
      max: 10,
      statement_timeout: 250,
      lock_timeout: 250,
      idle_in_transaction_session_timeout: 2_000,
      connectionTimeoutMillis: 500,
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------

interface Logged {
  level: string;
  record: Record<string, unknown>;
}
const capture = () => {
  const logged: Logged[] = [];
  const at = (level: string) => (record: object) =>
    void logged.push({ level, record: record as Record<string, unknown> });
  return { logged, logger: { info: at("info"), warn: at("warn"), error: at("error") } };
};

/** A database that refuses connections until `failures` runs out, then is the real one. */
function flaky(db: Database, failures: number): Database & { attempts: () => number } {
  let left = failures;
  let attempts = 0;
  const down = () => Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED" });
  return {
    attempts: () => attempts,
    async query(text, params) {
      if (left > 0) throw down();
      return db.query(text, params);
    },
    async withSession(fn, opts) {
      attempts += 1;
      if (left > 0) {
        left -= 1;
        throw down();
      }
      return db.withSession(fn, opts);
    },
    listen: (c, f, e) => db.listen(c, f, e),
    close: () => db.close(),
  };
}

describe("the store", () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = await testDatabase();
  });
  afterEach(async () => {
    await db.close();
  });

  it("retries a store that is down at startup every 5 s, answering store_unreachable meanwhile", async () => {
    expect(STORE_RETRY_MS).toBe(5_000);
    const database = flaky(db, 2);
    const { logged, logger } = capture();
    const store = new Store({ db: database, migrations, envClass: "dev", logger, onFatal: () => {}, retryMs: 20 });
    await store.start();
    expect(store.status).toBe("unreachable");
    expect(await store.readStackState()).toEqual({ kind: "unreachable" });
    await vi.waitFor(() => expect(store.status).toBe("ready"), { timeout: 5_000, interval: 10 });
    expect(database.attempts()).toBe(3);
    expect(await store.readStackState()).toEqual({ kind: "uninitialized" });
    const events = logged.map((l) => [l.level, l.record.event]);
    expect(events).toEqual([
      ["error", "state.unknown"],
      ["info", "migrations.applied"],
      ["info", "state.recovered"],
    ]);
    expect(logged[0]?.record).toMatchObject({ condition: "store_unreachable", error_class: "ECONNREFUSED" });
    expect(JSON.stringify(logged)).not.toContain("10.0.0.1");
    expect(logged[1]?.record).toMatchObject({ versions: [1, 2, 3, 4] });
    await store.close();
  });

  it("schedules the retries 5 s apart by default, on the real clock", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const down: Database = {
        query: async () => Promise.reject(Object.assign(new Error("down"), { code: "ECONNREFUSED" })),
        withSession: async () => {
          attempts += 1;
          throw Object.assign(new Error("down"), { code: "ECONNREFUSED" });
        },
        listen: async () => async () => {},
        close: async () => {},
      };
      const store = new Store({ db: down, migrations, envClass: "dev", logger: capture().logger, onFatal: () => {} });
      await store.start();
      expect(attempts).toBe(1);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(attempts).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(attempts).toBe(2);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(attempts).toBe(3);
      await store.close();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(attempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects start() with exit 78 when the schema is newer than the code", async () => {
    await runMigrations(db, migrations);
    const store = new Store({
      db,
      migrations: migrations.slice(0, 1),
      envClass: "dev",
      logger: capture().logger,
      onFatal: () => {},
    });
    const err = await fatal(store.start());
    expect([err.exitCode, err.reason]).toEqual([78, "schema_newer_than_code"]);
    await store.close();
  });

  it("hands a fatal error found on a retry to onFatal, which exits", async () => {
    await runMigrations(db, migrations);
    const seen: FatalStoreError[] = [];
    const store = new Store({
      db: flaky(db, 1),
      migrations: migrations.slice(0, 1),
      envClass: "dev",
      logger: capture().logger,
      onFatal: (e) => void seen.push(e),
      retryMs: 10,
    });
    await store.start();
    await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 5_000, interval: 10 });
    expect(seen[0]?.reason).toBe("schema_newer_than_code");
    expect(store.status).toBe("unreachable");
    await store.close();
  });

  it("refuses a prod gateway whose store carries a test clock offset (test_clock_in_prod, exit 78)", async () => {
    await runMigrations(db, migrations);
    await db.pg.query(
      `INSERT INTO gateway.stack_state (stack, env, state, since, fallback_awaiting_renewal, initialized_at,
         initialized_by, test_clock_offset_ms, updated_at)
       VALUES ('dev', 'dev', 'normal', now(), false, now(), 'operator:dev#0123abcd', 1000, now())`,
    );
    const prod = new Store({ db, migrations, envClass: "prod", logger: capture().logger, onFatal: () => {} });
    const err = await fatal(prod.start());
    expect([err.exitCode, err.reason]).toEqual([78, "test_clock_in_prod"]);
    const dev = new Store({ db, migrations, envClass: "dev", logger: capture().logger, onFatal: () => {} });
    await dev.start();
    expect(dev.status).toBe("ready");
  });

  it("reads the state row with no cache, and says store_unreachable when a read fails", async () => {
    const { logged, logger } = capture();
    const store = new Store({ db, migrations, envClass: "dev", logger, onFatal: () => {} });
    await store.start();
    expect(await store.readStackState()).toEqual({ kind: "uninitialized" });
    await db.pg.query(
      `INSERT INTO gateway.stack_state (stack, env, state, since, crossed, fallback_awaiting_renewal,
         fallback_awaiting_since, initialized_at, initialized_by, test_clock_offset_ms, updated_at)
       VALUES ('dev', 'dev', 'degraded', '2026-10-08T12:00:00Z', '{day:2026-10-08}', true, '2026-10-08T11:00:00Z',
         now(), 'operator:dev#0123abcd', 1528824493, now())`,
    );
    expect(await store.readStackState()).toEqual({
      kind: "ok",
      state: "degraded",
      since: new Date("2026-10-08T12:00:00Z"),
      crossed: ["day:2026-10-08"],
      fallbackAwaitingRenewal: true,
      fallbackAwaitingSince: new Date("2026-10-08T11:00:00Z"),
      testClockOffsetMs: 1_528_824_493,
    });
    // A table gone by hand, the migrations still recorded: running them again can't bring it back, so the read fails
    // closed, and within the retry interval they aren't run again for every read.
    await db.pg.query("ALTER TABLE gateway.stack_state RENAME TO stack_state_gone");
    expect(await store.readStackState()).toEqual({ kind: "unreachable" });
    expect(await store.readStackState()).toEqual({ kind: "unreachable" });
    expect(store.status).toBe("ready");
    expect(logged.filter((l) => l.record.event === "migrations.applied").map((l) => l.record.versions)).toEqual([
      [1, 2, 3, 4],
      [],
    ]);
    expect(logged.at(-1)?.record).toMatchObject({ event: "state.unknown", error_class: "42P01" });
    await db.pg.query("ALTER TABLE gateway.stack_state_gone RENAME TO stack_state");
    await store.close();
  });

  it("applies the migrations again when the schema is gone under a running gateway: a store wiped and brought back", async () => {
    const { logged, logger } = capture();
    const store = new Store({ db, migrations, envClass: "dev", logger, onFatal: () => {}, retryMs: 20 });
    await store.start();
    await db.pg.query(
      `INSERT INTO gateway.stack_state (stack, env, state, since, fallback_awaiting_renewal, initialized_at,
         initialized_by, updated_at)
       VALUES ('dev', 'dev', 'normal', now(), false, now(), 'operator:dev#0123abcd', now())`,
    );
    expect((await store.readStackState()).kind).toBe("ok");
    logged.length = 0;
    // The volume is removed and the store comes back empty: no schema, no tables, no migrations recorded. The store
    // answers, so it isn't unreachable: the read runs the migrations again, and finds no row.
    await db.pg.exec("DROP SCHEMA gateway CASCADE");
    const [first, second] = await Promise.all([store.readStackState(), store.readStackState()]);
    expect([first, second]).toEqual([{ kind: "uninitialized" }, { kind: "uninitialized" }]);
    expect(store.status).toBe("ready");
    expect((await db.pg.query("SELECT version FROM gateway.schema_migrations ORDER BY version")).rows).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
    ]);
    // One run, for both reads, and no outage: the store answered throughout.
    expect(logged.map((l) => [l.level, l.record.event, l.record.versions])).toEqual([
      ["info", "migrations.applied", [1, 2, 3, 4]],
    ]);
    expect(store.outageStartedAt()).toBeUndefined();
    await store.close();
  });

  it("keeps answering store_unreachable while the migrations can't run again, and retries them every 5 s", async () => {
    const { logged, logger } = capture();
    let down = false;
    const database: Database = {
      query: (text, params) => db.query(text, params),
      withSession: async (fn, opts) => {
        if (down) throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED" });
        return db.withSession(fn, opts);
      },
      listen: (c, f, e) => db.listen(c, f, e),
      close: () => db.close(),
    };
    const store = new Store({ db: database, migrations, envClass: "dev", logger, onFatal: () => {}, retryMs: 20 });
    await store.start();
    await db.pg.exec("DROP SCHEMA gateway CASCADE");
    down = true; // the store answers a query, but the migrations' session can't be had
    expect(await store.readStackState()).toEqual({ kind: "unreachable" });
    expect(store.status).toBe("unreachable");
    expect(logged.some((l) => l.record.event === "state.unknown" && l.record.error_class === "ECONNREFUSED")).toBe(
      true,
    );
    down = false;
    await vi.waitFor(() => expect(store.status).toBe("ready"), { timeout: 5_000, interval: 10 });
    expect(await store.readStackState()).toEqual({ kind: "uninitialized" });
    await store.close();
  });

  it("rejects start() with exit 78 for a grafana_ro password no verifier can take, the store up or down", async () => {
    // validate-env refuses it first (grafana_ro_password_invalid); this is the store's own line, so a value that
    // got past it never leaves the store retrying, unreachable, for good.
    for (const database of [db, flaky(db, 100)]) {
      const { logged, logger } = capture();
      const store = new Store({
        db: database,
        migrations,
        envClass: "dev",
        logger,
        onFatal: () => {},
        retryMs: 10,
        grafanaRoPassword: "two words",
      });
      const err = await fatal(store.start());
      expect([err.exitCode, err.reason]).toEqual([78, "grafana_ro_password_invalid"]);
      expect(err.message).not.toContain("two words");
      expect(store.status).toBe("unreachable");
      await new Promise((r) => setTimeout(r, 50));
      expect(logged).toEqual([]); // no outage logged, and no retry made
      // Not closed: close() would close the shared test database, and a fatal start leaves no timer behind.
    }
    // Refused before any migration ran.
    const { rows } = await db.pg.query<{ t: string | null }>("SELECT to_regclass('gateway.schema_migrations') AS t");
    expect(rows).toEqual([{ t: null }]);
  });

  it("sets grafana_ro's password at every start, when the gateway has one", async () => {
    const store = new Store({
      db,
      migrations,
      envClass: "dev",
      logger: capture().logger,
      onFatal: () => {},
      grafanaRoPassword: "feed".repeat(16),
    });
    await store.start();
    const { rows } = await db.pg.query<{ v: string }>(
      "SELECT rolpassword AS v FROM pg_authid WHERE rolname = 'grafana_ro'",
    );
    expect(rows[0]?.v).toMatch(/^SCRAM-SHA-256\$4096:/);
  });
});

// T012 (spec 007; FR-026; Amendment 0-1): 0004_twin admits the purpose `twin` on the ledger and the reservations, adds
// the ledger's two nullable columns for the room's feature and topic, each a bounded ID, admits the audit action
// `twin_call`, and leaves 0001_state.sql as it was: an append-only migration, never an edit.
describe("0004_twin (spec 007, Amendment 0-1)", () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = await migrated();
  });
  afterEach(async () => {
    await db.close();
  });

  const ledgerRow = (o: { purpose?: string; feature?: string | null; topic?: string | null } = {}) =>
    db.pg.query(
      `INSERT INTO gateway.ledger (id, reservation_id, ts, started_at, stack, request_id, trace_id, purpose,
         route_decision, route_reason, attribution, adapter_id, provider, request_model, response_model, input_tokens,
         output_tokens, cache_read_tokens, latency_ms, finish_reason, outcome, error_kind, cost_micro, cost_basis,
         price_version, routing_sha, period_day, period_month, client_label, room_feature, room_topic)
       VALUES (gen_random_uuid(), NULL, now(), now(), 'dev', 'r1', $1, $2, 'local', NULL, 'none', 'local', 'local',
         'stand-in', 'stand-in', 10, 5, NULL, 12, 'stop', 'ok', NULL, 0, 'none', '2026-10-08.1', $3, '2026-11-07',
         '2026-11', NULL, $4, $5)`,
      [
        HEX32,
        o.purpose ?? "twin",
        HEX64,
        o.feature === undefined ? "snowboard" : o.feature,
        o.topic === undefined ? "hobbies-and-travel" : o.topic,
      ],
    );

  it("admits a twin call's ledger row with its feature and topic", async () => {
    await ledgerRow();
    const { rows } = await db.pg.query<{ purpose: string; room_feature: string; room_topic: string }>(
      "SELECT purpose, room_feature, room_topic FROM gateway.ledger",
    );
    expect(rows).toEqual([{ purpose: "twin", room_feature: "snowboard", room_topic: "hobbies-and-travel" }]);
  });

  it("leaves both columns null for every other call, and admits free talk's topic", async () => {
    await ledgerRow({ purpose: "hello", feature: null, topic: null });
    await ledgerRow({ feature: "free_talk", topic: "free_talk" });
    const { rows } = await db.pg.query<{ room_feature: string | null }>(
      "SELECT room_feature FROM gateway.ledger ORDER BY purpose",
    );
    expect(rows.map((r) => r.room_feature).sort()).toEqual(["free_talk", null].sort());
  });

  it("refuses a feature or a topic outside their pattern, and a purpose outside the list", async () => {
    await expect(ledgerRow({ feature: "Not An ID" })).rejects.toThrow();
    await expect(ledgerRow({ topic: "x".repeat(65) })).rejects.toThrow();
    await expect(ledgerRow({ purpose: "chat" })).rejects.toThrow();
  });

  it("admits a reservation for a twin call, and the audit action twin_call with its reason", async () => {
    const constraint = await db.pg.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'reservations' AND pg_get_constraintdef(c.oid) LIKE '%purpose%'`,
    );
    expect(constraint.rows.map((r) => r.def).join(" ")).toContain("twin");
    const audit = await db.pg.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'audit_log'`,
    );
    expect(audit.rows.map((r) => r.def).join(" ")).toContain("twin_call");
  });

  it("leaves 0001_state.sql byte for byte as recorded", async () => {
    const text = await readFile(new URL("../../migrations/0001_state.sql", import.meta.url), "utf8");
    expect(text).not.toContain("twin");
    expect(migrations.find((m) => m.name === "0004_twin")?.sql).toContain("ADD COLUMN room_feature");
  });
});
