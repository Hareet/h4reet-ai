// The gateway's process (tasks.md T027): two listeners, the api and admin, graceful shutdown, GET /health/live
// (contracts/gateway-http.md §1, §4), and the startup order: validate the environment and the configuration (exit 78
// on failure), connect the store (retrying), then start the listeners.
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { factory as localFactory } from "../../src/adapters/local-openai.js";
import { factory as syntheticFactory } from "../../src/adapters/synthetic.js";
import type { AdapterFactory } from "../../src/adapters/registry.js";
import { buildApp, startGateway, type RunningGateway } from "../../src/app.js";
import { loadConfig, type LoadedConfig } from "../../src/config/validate.js";
import { readMigrations, runMigrations, type Database, type Migration } from "../../src/meter/store.js";
import { testDatabase, type TestDatabase } from "../helpers/pglite.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

const DEV_ENV = {
  H4_STACK: "dev",
  H4_ENV: "dev",
  OPERATOR_TOKEN_SHA256: "ab".repeat(32),
  ALERT_DELIVERY: "standin",
  GATEWAY_TEST_CLOCK: "1",
  GATEWAY_TEST_SYNTHETIC_SPEND: "1",
  TELEMETRY_PAYLOAD_SAMPLING: "off",
  LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
  LOCAL_MODEL_NAME: "stand-in",
  AWS_PROFILE: "none",
  GATEWAY_GRAFANA_RO_PASSWORD: "feed".repeat(16),
};

interface Logged {
  level: string;
  record: Record<string, unknown>;
  msg: string;
}
function capture() {
  const logged: Logged[] = [];
  const at = (level: string) => (record: object, msg: string) =>
    void logged.push({ level, record: record as Record<string, unknown>, msg });
  const logger = { info: at("info"), warn: at("warn"), error: at("error"), fatal: at("fatal") };
  return { logged, logger, events: () => logged.map((l) => l.record.event) };
}

let migrations: Migration[];
let config: LoadedConfig;
beforeAll(async () => {
  migrations = await readMigrations();
  config = await loadConfig(FIXTURES, { allowPlanned: false });
  expect(config.issues).toEqual([]);
});

const running: RunningGateway[] = [];
const databases: TestDatabase[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const g of running.splice(0)) await g.close();
  for (const d of databases.splice(0)) await d.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function freshDatabase(): Promise<TestDatabase> {
  const db = await testDatabase();
  databases.push(db);
  return db;
}

/** A database whose every use is recorded, and that refuses connections while `down` is true. */
function watched(db: Database, state = { down: false, touched: 0 }): Database & { state: typeof state } {
  const refuse = () => Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  return {
    state,
    async query(text, params) {
      state.touched += 1;
      if (state.down) throw refuse();
      return db.query(text, params);
    },
    async withSession(fn, opts) {
      state.touched += 1;
      if (state.down) throw refuse();
      return db.withSession(fn, opts);
    },
    listen: (c, f, e) => db.listen(c, f, e),
    close: () => db.close(),
  };
}

const LOCAL = { host: "127.0.0.1", apiPort: 0, adminPort: 0 };

describe("the api listener", () => {
  it("answers GET /health/live with 200 {status: live}, reading nothing", async () => {
    const { api } = buildApp({ stack: "dev", logger: capture().logger });
    const res = await api.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "live" });
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("adopts edge's X-Request-Id when it is 32 lowercase hex, and makes its own otherwise", async () => {
    const { api } = buildApp({ stack: "dev", logger: capture().logger });
    const id = "9c1e5b0a3f2d4e6b8a7c1d2e3f4a5b6c";
    const adopted = await api.inject({ method: "GET", url: "/health/live", headers: { "x-request-id": id } });
    expect(adopted.headers["x-request-id"]).toBe(id);
    for (const bad of ["9C1E5B0A3F2D4E6B8A7C1D2E3F4A5B6C", "abc", `${id}0`, "<script>"]) {
      const res = await api.inject({ method: "GET", url: "/health/live", headers: { "x-request-id": bad } });
      expect(res.headers["x-request-id"], bad).toMatch(/^[0-9a-f]{32}$/);
      expect(res.headers["x-request-id"]).not.toBe(bad);
    }
  });

  it("answers an unknown route or method with 404 not_found and the request ID", async () => {
    const { api } = buildApp({ stack: "dev", logger: capture().logger });
    for (const [method, url] of [
      ["GET", "/nope"],
      ["DELETE", "/health/live"],
      ["GET", "/admin/status"],
    ] as const) {
      const res = await api.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json()).toEqual({ error: "not_found", request_id: res.headers["x-request-id"] });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("caps request bodies at 16 KB, and the admin listener's at 4 KB", () => {
    const { api, admin } = buildApp({ stack: "dev", logger: capture().logger });
    expect(api.initialConfig.bodyLimit).toBe(16_384);
    expect(admin.initialConfig.bodyLimit).toBe(4_096);
  });

  it("answers an unexpected error with 500 internal_error and logs its class, never its message", async () => {
    const { logged, logger } = capture();
    const { api } = buildApp({ stack: "dev", logger });
    api.get("/boom", async () => {
      throw new TypeError("secret detail that must stay in the process");
    });
    const res = await api.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error", request_id: res.headers["x-request-id"] });
    expect(res.body).not.toContain("secret detail");
    expect(logged).toEqual([
      {
        level: "error",
        record: { event: "request.failed", error_class: "TypeError", route: "/boom" },
        msg: "A request failed unexpectedly.",
      },
    ]);
  });

  it("refuses a body that isn't JSON with 415, and malformed JSON with 400, never echoing it", async () => {
    const { api } = buildApp({ stack: "dev", logger: capture().logger });
    api.post("/echo", async () => ({ ok: true }));
    const text = await api.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "text/plain" },
      payload: "hi",
    });
    expect(text.statusCode).toBe(415);
    expect(text.json()).toEqual({ error: "unsupported_media_type", request_id: text.headers["x-request-id"] });
    // A body the parser refuses is wrong as a whole, so its field is body (gateway-http.md §2.5.4): JSON cut short,
    // an empty body sent as JSON, or a forbidden prototype key (onProtoPoisoning: "error").
    for (const payload of ['{"message": "unterminated', "", '{"__proto__": {"unterminated": true}}']) {
      const bad = await api.inject({
        method: "POST",
        url: "/echo",
        headers: { "content-type": "application/json" },
        payload,
      });
      expect(bad.statusCode, payload).toBe(400);
      expect(bad.json(), payload).toEqual({
        error: "invalid_request",
        field: "body",
        detail: "the request is malformed",
        request_id: bad.headers["x-request-id"],
      });
      expect(bad.body).not.toContain("unterminated");
    }
    const big = await api.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ message: "x".repeat(17_000) }),
    });
    expect(big.statusCode).toBe(413);
    expect(big.json()).toEqual({
      error: "body_too_large",
      limit_bytes: 16_384,
      request_id: big.headers["x-request-id"],
    });
  });
});

describe("the admin listener", () => {
  // The listener with its routes and the operator's authentication: test/integration/admin.test.ts.
  it("answers 401 to every request when it is bare, with no operator credential to check against", async () => {
    const { admin } = buildApp({ stack: "dev", logger: capture().logger });
    for (const [method, url] of [
      ["GET", "/admin/status"],
      ["POST", "/admin/reset"],
      ["GET", "/health/live"],
      ["GET", "/anything"],
    ] as const) {
      const res = await admin.inject({ method, url, headers: { authorization: "Bearer not-a-token" } });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
      expect(res.json()).toEqual({ error: "unauthorized" });
      expect(res.headers["www-authenticate"]).toBe('Bearer realm="h4reet-admin"');
      expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });
});

describe("startup", () => {
  it("validates the environment first: a refusal exits 78 before the store or a listener is touched", async () => {
    const db = watched(await freshDatabase());
    const { logged, logger } = capture();
    const result = await startGateway({
      env: { ...DEV_ENV, H4_ENV: "prod" },
      config,
      logger,
      version: "0.1.0",
      database: db,
      migrations,
      listen: LOCAL,
      onFatal: () => {},
    });
    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.exitCode).toBe(78);
    expect(db.state.touched).toBe(0);
    expect(result.lines.length).toBeGreaterThan(0);
    const refused = logged.filter((l) => l.record.event === "gateway.config_refused");
    expect(refused.length).toBe(result.lines.length);
    expect(refused.every((l) => l.level === "fatal")).toBe(true);
    expect(refused.map((l) => l.record.reason)).toContain("stack_env_mismatch");
  });

  it("refuses invalid configuration with exit 78, one line per error", async () => {
    const db = watched(await freshDatabase());
    const incomplete = await loadConfig(fileURLToPath(new URL("../fixtures/", import.meta.url)), {
      allowPlanned: false,
    });
    const result = await startGateway({
      env: DEV_ENV,
      config: incomplete,
      logger: capture().logger,
      version: "0.1.0",
      database: db,
      migrations,
      listen: LOCAL,
      onFatal: () => {},
    });
    expect(result.kind === "refused" && result.exitCode).toBe(78);
    expect(result.kind === "refused" && result.lines).toEqual([
      "config/routing.yaml: missing",
      "config/prices.yaml: missing",
      "config/budgets.yaml: missing",
      "config/alerts.yaml: missing",
    ]);
    expect(db.state.touched).toBe(0);
  });

  it("starts a route with a fallback, now that the metered fallback path exists (T074, inverting T148's refusal)", async () => {
    // config-files.md §1.2's second step, which T073 commits: the synthetic adapter, and dev's fallback. Every fallback
    // call goes through the meter now (T072–T074), so the gateway routes it instead of refusing it.
    const dir = await mkdtemp(join(tmpdir(), "h4-fallback-"));
    dirs.push(dir);
    for (const file of ["prices.yaml", "budgets.yaml", "alerts.yaml"])
      await copyFile(join(FIXTURES, file), join(dir, file));
    await copyFile(join(FIXTURES, "..", "config-fallback", "routing.yaml"), join(dir, "routing.yaml"));
    const withFallback = await loadConfig(dir, { allowPlanned: false });
    expect(withFallback.issues).toEqual([]);
    expect(withFallback.routing?.envs.dev).toEqual({ primary: "local", fallback: "synthetic" });
    const db = watched(await freshDatabase());
    const { logged, logger } = capture();
    const result = await startGateway({
      env: DEV_ENV,
      config: withFallback,
      logger,
      version: "0.1.0",
      database: db,
      migrations,
      listen: LOCAL,
      factories: new Map<string, AdapterFactory>([
        ["openai-compatible", localFactory],
        ["synthetic", syntheticFactory as AdapterFactory],
      ]),
      onFatal: () => {},
    });
    expect(result.kind).toBe("running");
    if (result.kind !== "running") return;
    running.push(result);
    expect(logged.filter((l) => l.level === "fatal")).toEqual([]);
    expect(result.services.fallbackId).toBe("synthetic");
    expect(result.services.gateway.routedAdapters().map((a) => [a.id, a.role])).toEqual([
      ["local", "primary"],
      ["synthetic", "fallback"],
    ]);
    const health = (await result.api.inject({ method: "GET", url: "/health" })).json() as Record<string, unknown>;
    expect(health.fallback).toMatchObject({ adapter: "synthetic" });
    expect((health.adapters as { id: string }[]).map((a) => a.id)).toEqual(["local", "synthetic"]);
    expect(logged.find((l) => l.record.event === "gateway.started")?.record).toMatchObject({
      adapters: ["local", "synthetic"],
    });
  });

  it("builds dev's synthetic fallback only with GATEWAY_TEST_SYNTHETIC_SPEND=1: without it, no fallback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "h4-fallback-"));
    dirs.push(dir);
    for (const file of ["prices.yaml", "budgets.yaml", "alerts.yaml"])
      await copyFile(join(FIXTURES, file), join(dir, file));
    await copyFile(join(FIXTURES, "..", "config-fallback", "routing.yaml"), join(dir, "routing.yaml"));
    const result = await startGateway({
      env: { ...DEV_ENV, GATEWAY_TEST_SYNTHETIC_SPEND: "0" },
      config: await loadConfig(dir, { allowPlanned: false }),
      logger: capture().logger,
      version: "0.1.0",
      database: await freshDatabase(),
      migrations,
      listen: LOCAL,
      onFatal: () => {},
    });
    expect(result.kind).toBe("running");
    if (result.kind !== "running") return;
    running.push(result);
    expect(result.services.fallbackId).toBeNull();
    const health = (await result.api.inject({ method: "GET", url: "/health" })).json() as Record<string, unknown>;
    expect(health.fallback).toMatchObject({ adapter: null });
  });

  it("starts with the store down: listeners up, /health/live answers, and the store retries", async () => {
    const db = watched(await freshDatabase(), { down: true, touched: 0 });
    const { events, logger } = capture();
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger,
      version: "0.1.0",
      database: db,
      migrations,
      listen: LOCAL,
      storeRetryMs: 20,
      onFatal: () => {},
    });
    expect(result.kind).toBe("running");
    if (result.kind !== "running") return;
    running.push(result);
    expect(result.store.status).toBe("unreachable");
    const live = await fetch(`http://127.0.0.1:${result.ports.api}/health/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "live" });
    const admin = await fetch(`http://127.0.0.1:${result.ports.admin}/admin/status`);
    expect(admin.status).toBe(401);
    db.state.down = false;
    await vi.waitFor(() => expect(result.store.status).toBe("ready"), { timeout: 10_000, interval: 20 });
    // The unauthenticated status read is a failed operator authentication: counted and logged, not audited, while the
    // store is down (operator-admin.md §1.1).
    expect(events()).toEqual([
      "state.unknown",
      "gateway.started",
      "operator.auth_failed",
      "migrations.applied",
      "state.recovered",
    ]);
  });

  it("logs gateway.started with the routing SHA, the price version, the adapters, and H4_ENV", async () => {
    const db = await freshDatabase();
    const { logged, logger } = capture();
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger,
      version: "0.1.0",
      database: db,
      migrations,
      listen: LOCAL,
      onFatal: () => {},
    });
    expect(result.kind).toBe("running");
    if (result.kind === "running") running.push(result);
    const started = logged.find((l) => l.record.event === "gateway.started");
    expect(started?.record).toEqual({
      event: "gateway.started",
      routing_sha: config.routing?.sha256,
      price_version: "2026-10-08.1",
      adapters: ["local"],
      h4_env: "dev",
    });
    expect(logged.map((l) => l.record.event).indexOf("migrations.applied")).toBeLessThan(
      logged.map((l) => l.record.event).indexOf("gateway.started"),
    );
  });

  // Spec 007 (FR-054, FR-027, FR-030): the twin's files never stop the gateway; each reason the twin can't answer, as
  // server.ts read them, is logged once at start.
  it("starts whatever the twin's files hold, and logs twin.unavailable, the missing readiness file, and the defaults once", async () => {
    const db = await freshDatabase();
    const { logged, logger } = capture();
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger,
      version: "0.1.0",
      database: db,
      migrations,
      listen: LOCAL,
      onFatal: () => {},
      twin: { available: false, reason: "pack_invalid", readiness: { ok: false, reason: "missing" } },
    });
    expect(result.kind).toBe("running");
    if (result.kind === "running") running.push(result);
    const twin = logged.filter((l) => String(l.record.event).startsWith("twin."));
    expect(twin.map((l) => l.record)).toEqual([
      { event: "twin.unavailable", reason: "pack_invalid" },
      { event: "twin.readiness_unavailable", reason: "missing" },
      { event: "twin.limits_default" },
    ]);
  });

  it("exits 78 schema_newer_than_code before any listener starts", async () => {
    const db = await freshDatabase();
    await runMigrations(db, migrations);
    const { logged, logger } = capture();
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger,
      version: "0.1.0",
      database: db,
      migrations: migrations.slice(0, 1),
      listen: LOCAL,
      onFatal: () => {},
    });
    expect(result.kind === "refused" && [result.exitCode, result.lines]).toEqual([
      78,
      ["the store records migration 2 (0002_grafana_ro), which this build doesn't have (schema_newer_than_code)"],
    ]);
    expect(logged.find((l) => l.record.event === "gateway.config_refused")?.record).toEqual({
      event: "gateway.config_refused",
      reason: "schema_newer_than_code",
    });
  });

  it("exits 1 when a migration the store recorded has changed", async () => {
    const db = await freshDatabase();
    await runMigrations(db, migrations);
    const changed = migrations.map((m) => (m.version === 2 ? { ...m, sha256: sha256("edited") } : m));
    const { logged, logger } = capture();
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger,
      version: "0.1.0",
      database: db,
      migrations: changed,
      listen: LOCAL,
      onFatal: () => {},
    });
    expect(result.kind === "refused" && result.exitCode).toBe(1);
    expect(logged.find((l) => l.record.event === "gateway.fatal")?.record).toEqual({
      event: "gateway.fatal",
      reason: "migration_changed",
    });
  });

  it("hands a fatal store error found after startup to onFatal, with its exit code", async () => {
    const pg = await freshDatabase();
    await runMigrations(pg, migrations);
    const db = watched(pg, { down: true, touched: 0 });
    const exits: number[] = [];
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger: capture().logger,
      version: "0.1.0",
      database: db,
      migrations: migrations.slice(0, 1),
      listen: LOCAL,
      storeRetryMs: 20,
      onFatal: (code) => void exits.push(code),
    });
    expect(result.kind).toBe("running");
    if (result.kind === "running") running.push(result);
    db.state.down = false;
    await vi.waitFor(() => expect(exits).toEqual([78]), { timeout: 10_000, interval: 20 });
  });
});

describe("graceful shutdown", () => {
  it("lets a request in flight finish, then closes both listeners and the store", async () => {
    const db = await freshDatabase();
    // Shutdown starts once the request has reached its handler, not after a fixed wait. On a loaded machine a request
    // can take longer than any fixed wait to arrive, and Fastify answers one that reaches its router after close()
    // has begun with 503 (return503OnClosing): a listener that no longer accepts, not a request in flight.
    let arrived = (): void => {};
    const reached = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger: capture().logger,
      version: "0.1.0",
      database: db,
      migrations,
      listen: LOCAL,
      onFatal: () => {},
      routes: (api) => {
        api.get("/slow", async () => {
          arrived();
          await new Promise((r) => setTimeout(r, 200));
          return { done: true };
        });
      },
    });
    expect(result.kind).toBe("running");
    if (result.kind !== "running") return;
    const inFlight = fetch(`http://127.0.0.1:${result.ports.api}/slow`);
    // A fetch that fails, or is answered without reaching the handler, ends the wait with its own error or answer.
    const first = await Promise.race([reached.then(() => "reached"), inFlight.then(() => "answered")]);
    expect(first).toBe("reached");
    const closing = result.close();
    const res = await inFlight;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: true });
    await closing;
    await expect(fetch(`http://127.0.0.1:${result.ports.api}/health/live`)).rejects.toThrow();
    await expect(fetch(`http://127.0.0.1:${result.ports.admin}/admin/status`)).rejects.toThrow();
    expect(result.store.status).not.toBe("starting");
    expect(db.pg.closed).toBe(true);
  });
});
