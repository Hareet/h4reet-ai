// The relay's two connections to the shared state (spec 001 contracts/shared-state.md §2 and §3; data-model.md §1.2):
// relay_ro reads gateway.v_state, and relay_rw inserts into gateway.handover_events, each over TLS verified against
// the shared state's CA and its name, `shared-state`. Neither reads or writes anything else, and no query carries an
// address, a message, or an answer.
import pg from "pg";

import type { DbTarget } from "./config.js";
import type { HandoverEvent } from "./hosts.js";
import type { StateRow, StateSource } from "./killswitch.js";

export const STATE_SQL = "SELECT state, since, crossed FROM gateway.v_state";
export const HANDOVER_SQL =
  "INSERT INTO gateway.handover_events (at, from_host, to_host, reason, gap_ms) VALUES ($1, $2, $3, $4, $5)";
/** The read's bound, the role's own statement_timeout, and the connect's: the kill switch can't wait longer. */
export const QUERY_TIMEOUT_MS = 250;
export const CONNECT_TIMEOUT_MS = 500;

/** A client the store's two classes need: pg's Pool, or a stub in the tests. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export function poolFor(target: DbTarget): Queryable {
  return new pg.Pool({
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.user,
    password: target.password,
    max: 2,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
    ...(target.ca === undefined
      ? {}
      : {
          ssl: {
            ca: target.ca,
            rejectUnauthorized: true,
            ...(target.servername ? { servername: target.servername } : {}),
          },
        }),
  });
}

export class PgStateSource implements StateSource {
  constructor(private readonly client: Queryable) {}

  async read(): Promise<StateRow | null> {
    const { rows } = await this.client.query(STATE_SQL);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      state: String(row.state),
      since: (row.since as Date | string | null) ?? null,
      crossed: (row.crossed as string[] | string | null) ?? null,
    };
  }
}

export class PgHandoverWriter {
  constructor(private readonly client: Queryable) {}

  async record(event: HandoverEvent): Promise<void> {
    await this.client.query(HANDOVER_SQL, [event.at, event.from, event.to, event.reason, event.gapMs]);
  }
}
