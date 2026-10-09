// The store's Database interface over PGlite: a real Postgres, in WASM, in the test's own process. No Docker and
// no socket, so the integration tests run in the sandbox (plan §7).
//
// PGlite is one connection, so two sessions at once would interleave their statements inside one transaction.
// Every use of the database here, a session or a single query, waits for the one before it to finish, as a pool of
// connections never mixes two callers' statements. A query issued from inside a session would wait for itself, so it
// fails instead: on a real pool it would run on another connection, outside the transaction, which is a bug.
import { AsyncLocalStorage } from "node:async_hooks";

import { PGlite } from "@electric-sql/pglite";

import type { Database, Session } from "../../src/meter/store.js";

/** Called around every statement; throwing aborts it. `after` runs once the statement has run in PGlite. */
export type StatementHook = (text: string, phase: "before" | "after") => void;

export interface TestDatabase extends Database {
  readonly pg: PGlite;
  /** Every statement sent through the interface, in order. */
  readonly statements: string[];
  /** A fault to inject: a statement that fails before it runs, or after it ran, as a lost acknowledgement does. */
  hook: StatementHook | undefined;
}

export async function testDatabase(): Promise<TestDatabase> {
  const pg = await PGlite.create();
  const statements: string[] = [];
  const inSession = new AsyncLocalStorage<true>();
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    if (inSession.getStore() === true) {
      return Promise.reject(new Error("a store query from inside a session: a real pool would run it elsewhere"));
    }
    const run = tail.then(() => inSession.run(true, fn));
    tail = run.catch(() => {});
    return run;
  };
  const session: Session = {
    async query(text, params) {
      statements.push(text);
      db.hook?.(text, "before");
      const result = await pg.query(text, params as unknown[] | undefined);
      db.hook?.(text, "after");
      return { rows: result.rows as never[] };
    },
    async exec(sql) {
      statements.push(sql);
      await pg.exec(sql);
    },
  };
  const db: TestDatabase = {
    pg,
    statements,
    hook: undefined,
    query: (text, params) => exclusive(() => session.query(text, params)),
    withSession: (fn) => exclusive(() => fn(session)),
    listen: async (channel, onNotify) => pg.listen(channel, () => onNotify()),
    // The store owns its database and closes it; a test's own cleanup may close it again.
    close: async () => {
      if (!pg.closed) await pg.close();
    },
  };
  return db;
}

/** An error as pg raises it when the connection drops: a Node error code, and no SQLSTATE from the server. */
export function connectionLost(): Error {
  return Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
}

/** An error as Postgres raises it for a statement it refused, with its SQLSTATE: 23514 is a CHECK violation. */
export function statementRefused(sqlstate = "23514"): Error {
  return Object.assign(new Error("new row violates check constraint"), { code: sqlstate });
}
