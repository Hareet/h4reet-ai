// Spec 001's hosts as data (group 6's departure 16; its review, nit 1): hosts.json names the two hosts a gateway runs
// on, and migration 0007's CHECKs on ledger.host and audit_log.host hold the store to the same two, by their names.
// The names come from hosts.json, never a literal (spec 004's room scan).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { HOST_NAMES } from "../../src/config/hosts.js";
import data from "../../src/config/hosts.json" with { type: "json" };

const MIGRATION = readFileSync(new URL("../../migrations/0007_hosts.sql", import.meta.url), "utf-8");

function checked(column: string): string[] {
  const m = new RegExp(`ADD CONSTRAINT ${column}_check CHECK \\(host IN \\(([^)]*)\\)\\)`).exec(MIGRATION);
  expect(m, column).not.toBeNull();
  return (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

describe("hosts.json and migration 0007", () => {
  it("names the same two hosts as each CHECK on host", () => {
    expect(HOST_NAMES).toEqual(Object.values(data));
    for (const column of ["ledger_host", "audit_log_host"]) {
      expect([...checked(column)].sort()).toEqual([...HOST_NAMES].sort());
    }
  });
});
