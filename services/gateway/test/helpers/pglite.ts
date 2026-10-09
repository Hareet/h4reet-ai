// The store's Database interface over PGlite: a real Postgres, in WASM, in the test's own process. No Docker and
// no socket, so the integration tests run in the sandbox (plan §7).
import { PGlite } from "@electric-sql/pglite";

import type { Database, Session } from "../../src/meter/store.js";

export interface TestDatabase extends Database {
  readonly pg: PGlite;
  /** Every statement sent through the interface, in order. */
  readonly statements: string[];
}

export async function testDatabase(): Promise<TestDatabase> {
  const pg = await PGlite.create();
  const statements: string[] = [];
  const session: Session = {
    async query(text, params) {
      statements.push(text);
      const result = await pg.query(text, params as unknown[] | undefined);
      return { rows: result.rows as never[] };
    },
    async exec(sql) {
      statements.push(sql);
      await pg.exec(sql);
    },
  };
  return {
    pg,
    statements,
    query: session.query,
    withSession: (fn) => fn(session),
    listen: async (channel, onNotify) => pg.listen(channel, () => onNotify()),
    // The store owns its database and closes it; a test's own cleanup may close it again.
    close: async () => {
      if (!pg.closed) await pg.close();
    },
  };
}
