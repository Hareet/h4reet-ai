// Which errors are the store going away, and which are a statement it refused (tasks.md T072; data-model.md §2.1):
// only the first is store_unreachable. A CHECK violation is a bug in the gateway, answered 500, and no outage.
import { describe, expect, it } from "vitest";

import { CommitUnknownError, isStoreFailure, sqlStateOf, StoreUnavailableError } from "../../src/meter/store.js";

const withCode = (code: string, cls: ErrorConstructor = Error): Error => Object.assign(new cls("x"), { code });

describe("isStoreFailure", () => {
  it("counts the store's own failures: connections, timeouts, the server going away, a store not ready", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN"]) {
      expect(isStoreFailure(withCode(code)), code).toBe(true);
    }
    // 57014 is statement_timeout, 55P03 lock_timeout, 25P03 idle_in_transaction, 08006 a broken connection,
    // 57P01 an administrator's shutdown, 53300 too many connections, 40001 and 40P01 a transient conflict.
    for (const code of ["57014", "55P03", "25P03", "08006", "57P01", "53300", "40001", "40P01", "XX000"]) {
      expect(isStoreFailure(withCode(code)), code).toBe(true);
    }
    expect(isStoreFailure(new Error("Connection terminated unexpectedly"))).toBe(true); // pg: no code at all
    expect(isStoreFailure(new StoreUnavailableError())).toBe(true);
    expect(isStoreFailure(new CommitUnknownError(1, withCode("ECONNRESET")))).toBe(true);
  });

  it("doesn't count a statement the store refused, or a bug in the gateway's own code", () => {
    // 23514 CHECK, 23505 UNIQUE, 23502 NOT NULL, 22003 out of range, 42601 syntax, 42P01 no such table,
    // 42501 privilege, P0001 the append-only trigger's RAISE.
    for (const code of ["23514", "23505", "23502", "22003", "42601", "42P01", "42501", "P0001"]) {
      expect(isStoreFailure(withCode(code)), code).toBe(false);
    }
    expect(isStoreFailure(new TypeError("x"))).toBe(false);
    expect(isStoreFailure(new RangeError("x"))).toBe(false);
    expect(isStoreFailure("not an error")).toBe(false);
  });
});

describe("sqlStateOf", () => {
  it("reads a server's SQLSTATE, and not a Node error code of five letters", () => {
    expect(sqlStateOf(withCode("23514"))).toBe("23514");
    expect(sqlStateOf(withCode("42P01"))).toBe("42P01");
    expect(sqlStateOf(withCode("EPIPE"))).toBeUndefined();
    expect(sqlStateOf(withCode("ECONNRESET"))).toBeUndefined();
    expect(sqlStateOf(new Error("x"))).toBeUndefined();
  });
});

describe("CommitUnknownError", () => {
  it("carries the transaction's value and the failure's class, never its message", () => {
    const err = new CommitUnknownError({ auditId: 7 }, withCode("ECONNRESET"));
    expect(err.value).toEqual({ auditId: 7 });
    expect(err.failure).toBe("ECONNRESET");
    expect(err.message).toBe("COMMIT's acknowledgement was lost");
  });
});
