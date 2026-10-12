// pgDatabase against a fake Postgres on loopback (review round 1): a connection that drops under a session, or under
// the migration client, must reject the call in flight, never crash the process. pg emits 'error' on a client whose
// connection fails, and an 'error' with no listener throws. data-model.md §2.1: "Any error or timeout on a request's
// path means store_unreachable (fail closed, FR-031)".
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Store,
  pgDatabase,
  readMigrations,
  runMigrations,
  type Database,
  type Migration,
} from "../../src/meter/store.js";
import { fakePostgres, type FakePostgres } from "../helpers/fake-postgres.js";

let migrations: Migration[];
beforeAll(async () => {
  migrations = await readMigrations();
});

/** Errors that escaped to the process, and listener-leak warnings, while a test runs. */
const escaped: unknown[] = [];
const warnings: Error[] = [];
const onUncaught = (err: unknown): void => void escaped.push(err);
const onRejection = (err: unknown): void => void escaped.push(err);
const onWarning = (w: Error): void => void warnings.push(w);
beforeEach(() => {
  escaped.length = 0;
  warnings.length = 0;
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onRejection);
  process.on("warning", onWarning);
});

let server: FakePostgres | undefined;
let db: Database | undefined;
afterEach(async () => {
  // A late 'error' from a torn-down connection would surface here, before the listeners go.
  await new Promise((r) => setTimeout(r, 50));
  process.off("uncaughtException", onUncaught);
  process.off("unhandledRejection", onRejection);
  process.off("warning", onWarning);
  await db?.close().catch(() => {});
  await server?.close();
  db = undefined;
  server = undefined;
});

async function against(mode: "drop" | "answer"): Promise<{ server: FakePostgres; db: Database }> {
  server = await fakePostgres(mode);
  db = pgDatabase({ host: "127.0.0.1", port: server.port, database: "gateway", user: "gateway", password: "x" });
  return { server, db };
}

describe("the LISTEN connection (data-model.md §2.1, §2.7)", () => {
  it("calls onEnd once when its connection drops, so the caller can listen again, and never after its close", async () => {
    const { server, db } = await against("answer");
    let ended = 0;
    const close = await db.listen(
      "alert_outbox",
      () => {},
      () => void (ended += 1),
    );
    expect(server.queries).toContain("LISTEN alert_outbox");
    server.drop(); // Postgres restarts
    await vi.waitFor(() => expect(ended).toBe(1));
    await close();
    // A fresh LISTEN, closed by its owner: not an end the caller must answer.
    const again = await db.listen(
      "alert_outbox",
      () => {},
      () => void (ended += 1),
    );
    await again();
    server.drop();
    await new Promise((r) => setTimeout(r, 50));
    expect(ended).toBe(1);
    expect(escaped).toEqual([]);
  });
});

describe("a connection that drops under a call", () => {
  it("rejects a pooled session's query, and the pool connects afresh for the next session", async () => {
    const { server, db } = await against("drop");
    await expect(db.withSession((s) => s.query("SELECT 1"))).rejects.toThrow(/terminated unexpectedly/);
    expect(server.connections()).toBe(1);
    await expect(db.withSession((s) => s.query("SELECT 1"))).rejects.toThrow(/terminated unexpectedly/);
    expect(server.connections()).toBe(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(escaped).toEqual([]);
  });

  it("rejects runMigrations, whose session has a connection of its own", async () => {
    const { db } = await against("drop");
    await expect(runMigrations(db, migrations)).rejects.toThrow(/terminated unexpectedly/);
    await new Promise((r) => setTimeout(r, 50));
    expect(escaped).toEqual([]);
  });

  it("rejects a pool query", async () => {
    const { db } = await against("drop");
    await expect(db.query("SELECT 1")).rejects.toThrow(/terminated unexpectedly/);
    await new Promise((r) => setTimeout(r, 50));
    expect(escaped).toEqual([]);
  });

  it("leaves the store unreachable and retrying, and its reads answer store_unreachable", async () => {
    const { server, db } = await against("drop");
    const logged: Record<string, unknown>[] = [];
    const keep = (record: object): void => void logged.push(record as Record<string, unknown>);
    const store = new Store({
      db,
      migrations,
      envClass: "dev",
      logger: { info: keep, warn: keep, error: keep },
      onFatal: () => {},
      retryMs: 20,
    });
    await store.start();
    expect(store.status).toBe("unreachable");
    expect(await store.readStackState()).toEqual({ kind: "unreachable" });
    await vi.waitFor(() => expect(server.connections()).toBeGreaterThanOrEqual(3), { timeout: 5_000, interval: 20 });
    expect(logged.map((r) => r.event)).toEqual(["state.unknown"]);
    await store.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(escaped).toEqual([]);
  });
});

describe("a healthy connection", () => {
  it("serves sessions from one pooled client, without piling up listeners", async () => {
    const { server, db } = await against("answer");
    for (let i = 0; i < 15; i++) {
      expect(await db.withSession((s) => s.query("SELECT $1::int AS n", [i]))).toEqual(
        expect.objectContaining({ rows: [] }),
      );
    }
    expect(server.connections()).toBe(1);
    expect(warnings.filter((w) => w.name === "MaxListenersExceededWarning")).toEqual([]);
    expect(escaped).toEqual([]);
  });

  it("discards a client whose session failed, so a half-done transaction is never handed on", async () => {
    const { server, db } = await against("answer");
    await expect(
      db.withSession(async (s) => {
        await s.query("BEGIN");
        throw new Error("the session's own failure");
      }),
    ).rejects.toThrow("the session's own failure");
    await db.withSession((s) => s.query("SELECT 1"));
    expect(server.connections()).toBe(2);
  });
});
