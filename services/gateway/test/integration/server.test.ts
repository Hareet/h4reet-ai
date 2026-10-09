// The entry point as the container runs it (src/server.ts): the configuration read, the telemetry SDK started
// before Fastify, pg, and pino load, and a refusal printed one line per error with exit 78. pino's fatal records
// must reach stdout before the process exits.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const EMPTY = fileURLToPath(new URL("../fixtures/", import.meta.url)); // no YAML at its top level

/** A port nothing listens on, and a short timeout: telemetry's exports at shutdown fail fast and quietly. */
const QUIET = { OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:9", OTEL_EXPORTER_OTLP_TIMEOUT: "500" };
const DEV_ENV = {
  H4_STACK: "dev",
  H4_ENV: "dev",
  OPERATOR_TOKEN_SHA256: "ab".repeat(32),
  ALERT_DELIVERY: "standin",
  LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
  LOCAL_MODEL_NAME: "stand-in",
  GATEWAY_DB_PASSWORD: "not-a-real-one",
};

async function run(configDir: string, env: Record<string, string | undefined>) {
  const result = await promisify(execFile)(
    process.execPath,
    ["--import", "tsx", "src/server.ts", "--config-dir", configDir],
    { cwd: PACKAGE, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, ...QUIET, ...env }, timeout: 60_000 },
  ).then(
    (ok) => ({ code: 0, stdout: ok.stdout, stderr: ok.stderr }),
    (err: { code: number; stdout: string; stderr: string }) => ({
      code: err.code,
      stdout: err.stdout,
      stderr: err.stderr,
    }),
  );
  const records = result.stdout
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { ...result, records };
}

describe("node src/server.ts", () => {
  it("refuses a missing configuration with exit 78, every error on stderr and in the log", async () => {
    const { code, stderr, records } = await run(EMPTY, DEV_ENV);
    expect(code).toBe(78);
    expect(stderr.trimEnd().split("\n")).toEqual([
      "config/routing.yaml: missing",
      "config/prices.yaml: missing",
      "config/budgets.yaml: missing",
      "config/alerts.yaml: missing",
    ]);
    const refused = records.filter((r) => r.event === "gateway.config_refused");
    expect(refused).toHaveLength(4);
    expect(refused.every((r) => r.level === 60 && r.reason === "invalid_config" && r["h4.stack"] === "dev")).toBe(true);
  });

  it("refuses an environment the stack can't run with, before connecting to anything", async () => {
    const { code, stderr, records } = await run(FIXTURES, { ...DEV_ENV, H4_STACK: "staging" });
    expect(code).toBe(78);
    expect(stderr).toContain("H4_STACK: H4_STACK must be prod, dev, or dev-cpu (invalid_stack)");
    expect(records.map((r) => [r.event, r.reason, r.key])).toEqual([
      ["gateway.config_refused", "invalid_stack", "H4_STACK"],
    ]);
    expect(records.some((r) => r.event === "state.unknown" || r.event === "migrations.applied")).toBe(false);
    expect(JSON.stringify(records)).not.toContain("not-a-real-one");
  });
});
