// The store connection on prod's shared state (spec 001 tasks.md T068; contracts/shared-state.md §3; contracts/env-
// cloud.md §2): GATEWAY_DB_URL with TLS verified against the shared state's own CA, by the server name
// GATEWAY_DB_TLS_SERVERNAME, whatever address the URL dials; the host on every session (h4.host, from H4_HOST); and
// h4.shared_state.latency and h4.shared_state.errors, labelled with h4.host. The certificates are made at run time
// (test/helpers/test-certs.ts), so no key or certificate sits in a file.
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { connect, TLSSocket } from "node:tls";

import { metrics as sdkMetrics } from "@opentelemetry/sdk-node";
import { afterEach, describe, expect, it } from "vitest";

import { LAPTOP } from "../../src/config/hosts.js";
import { instrumentDatabase, SHARED_STATE_METRICS } from "../../src/meter/store-telemetry.js";
import { buildPoolConfig, pgSettingsFromEnv, StoreSettingsError, type Database } from "../../src/meter/store.js";
import { testAuthority } from "../helpers/test-certs.js";

const { AggregationTemporality, InMemoryMetricExporter, MeterProvider } = sdkMetrics;

const authority = testAuthority("h4 shared-state test CA");
const caB64 = Buffer.from(authority.pem, "utf8").toString("base64");
const URL_TUNNEL = "postgres://gateway@tunnel:5432/h4reet?sslmode=verify-full";
const URL_EC2 = "postgres://gateway@10.42.1.10:5432/h4reet?sslmode=verify-full";

const sharedEnv = (more: Record<string, string | undefined> = {}) => ({
  H4_HOST: LAPTOP,
  GATEWAY_DB_URL: URL_TUNNEL,
  GATEWAY_DB_TLS_SERVERNAME: "shared-state",
  GATEWAY_DB_TLS_CA: caB64,
  GATEWAY_DB_PASSWORD: "a-password-the-test-made",
  ...more,
});

describe("the settings, from the environment", () => {
  it("keeps spec 000's local store, with no TLS, when GATEWAY_DB_URL is unset, and names the host on the session", () => {
    const s = pgSettingsFromEnv({ H4_HOST: LAPTOP, GATEWAY_DB_PASSWORD: "x" });
    expect(s).toMatchObject({
      host: "gateway-state",
      port: 5432,
      database: "gateway",
      user: "gateway",
      h4Host: LAPTOP,
    });
    const config = buildPoolConfig(s);
    expect(config.ssl).toBeUndefined();
    expect(config.options).toBe(`-c h4.host=${LAPTOP}`);
  });

  it("reads the shared state's host, port, database, and user from GATEWAY_DB_URL, and the password apart", () => {
    const s = pgSettingsFromEnv(sharedEnv());
    expect(s).toMatchObject({ host: "tunnel", port: 5432, database: "h4reet", user: "gateway" });
    expect(buildPoolConfig(s).password).toBe("a-password-the-test-made");
    const ec2 = pgSettingsFromEnv(sharedEnv({ H4_HOST: "ec2", GATEWAY_DB_URL: URL_EC2 }));
    expect(ec2).toMatchObject({ host: "10.42.1.10", database: "h4reet" });
    expect(buildPoolConfig(ec2).options).toBe("-c h4.host=ec2");
  });

  it("refuses a URL without verify-full, with a password, of another scheme, or without the server name or the CA", () => {
    const refused = (env: Record<string, string | undefined>): string => {
      try {
        pgSettingsFromEnv(env);
      } catch (err) {
        expect(err).toBeInstanceOf(StoreSettingsError);
        return (err as StoreSettingsError).reason;
      }
      throw new Error("not refused");
    };
    expect(refused(sharedEnv({ GATEWAY_DB_URL: URL_TUNNEL.replace("verify-full", "require") }))).toBe(
      "store_tls_required",
    );
    expect(refused(sharedEnv({ GATEWAY_DB_URL: URL_TUNNEL.replace("?sslmode=verify-full", "") }))).toBe(
      "store_tls_required",
    );
    expect(refused(sharedEnv({ GATEWAY_DB_URL: URL_TUNNEL.replace("gateway@", "gateway:pw@") }))).toBe(
      "store_url_invalid",
    );
    expect(refused(sharedEnv({ GATEWAY_DB_URL: URL_TUNNEL.replace("postgres:", "http:") }))).toBe("store_url_invalid");
    expect(refused(sharedEnv({ GATEWAY_DB_TLS_SERVERNAME: "" }))).toBe("store_tls_required");
    expect(refused(sharedEnv({ GATEWAY_DB_TLS_CA: undefined }))).toBe("store_tls_required");
    expect(refused(sharedEnv({ GATEWAY_DB_TLS_CA: "bm90IGEgY2VydGlmaWNhdGU=" }))).toBe("store_tls_required");
    expect(refused(sharedEnv({ GATEWAY_DB_URL: URL_TUNNEL.replace("tunnel", "gateway-state") }))).toBe(
      "local_store_on_shared_host",
    );
    expect(refused({ H4_HOST: "tunnel-end", GATEWAY_DB_PASSWORD: "x" })).toBe("invalid_host");
  });

  it("refuses EC2 without the shared state: it has no local store", () => {
    try {
      pgSettingsFromEnv({ H4_HOST: "ec2", GATEWAY_DB_PASSWORD: "x" });
      throw new Error("not refused");
    } catch (err) {
      expect((err as StoreSettingsError).reason).toBe("local_store_on_shared_host");
    }
  });
});

describe("TLS, verified by the CA and the server name, whatever the address", () => {
  const servers: { close(): void }[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });

  async function serve(dnsNames: string[], ca = authority): Promise<number> {
    const cert = ca.issue({ subject: "shared-state", dnsNames });
    // As the email channel's TLS tests serve: a TLS socket over each plain one, with the certificate's context.
    const server = createNetServer((plain) => {
      const encrypted = new TLSSocket(plain, { isServer: true, secureContext: cert.context });
      encrypted.on("error", () => plain.destroy());
      encrypted.on("secure", () => encrypted.end());
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    servers.push(server);
    return (server.address() as { port: number }).port;
  }

  /** What pg does with the pool's ssl options: tls.connect with the socket's host, and SNI for a name. */
  async function handshake(port: number, env = sharedEnv()): Promise<"ok" | string> {
    const ssl = buildPoolConfig(pgSettingsFromEnv(env)).ssl as Record<string, unknown>;
    const socket = connect({ ...ssl, host: "127.0.0.1", port, servername: "tunnel" });
    try {
      await once(socket, "secureConnect");
      return "ok";
    } catch (err) {
      return (err as { code?: string }).code ?? String(err);
    } finally {
      socket.destroy();
    }
  }

  it("accepts the shared state's certificate for shared-state, though the client dials tunnel or an address", async () => {
    expect(await handshake(await serve(["shared-state"]))).toBe("ok");
    expect(await handshake(await serve(["shared-state"]), sharedEnv({ H4_HOST: "ec2", GATEWAY_DB_URL: URL_EC2 }))).toBe(
      "ok",
    );
  });

  it("refuses a certificate for another name, and one another CA signed", async () => {
    expect(await handshake(await serve(["tunnel"]))).not.toBe("ok");
    expect(await handshake(await serve(["shared-state"], testAuthority("another CA")))).not.toBe("ok");
  });

  it("never turns verification off", () => {
    const ssl = buildPoolConfig(pgSettingsFromEnv(sharedEnv())).ssl as Record<string, unknown>;
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe(authority.pem);
    expect(ssl.minVersion).toBe("TLSv1.3");
  });
});

describe("h4.shared_state.latency and h4.shared_state.errors (FR-060)", () => {
  function harness() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
    const provider = new MeterProvider({ readers: [reader] });
    return { meter: provider.getMeter("h4-gateway"), reader };
  }
  const failing = (fail: boolean): Database => ({
    query: async () => {
      if (fail) throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
      return { rows: [] };
    },
    withSession: async (fn) => fn({ query: async () => ({ rows: [] }), exec: async () => {} }),
    listen: async () => async () => {},
    close: async () => {},
  });

  it("records each query's latency and each failure, by h4.host and the error's class, and nothing request-specific", async () => {
    const { meter, reader } = harness();
    const ok = instrumentDatabase(failing(false), { meter, host: LAPTOP });
    await ok.query("SELECT 1");
    await ok.withSession(async () => undefined);
    const bad = instrumentDatabase(failing(true), { meter, host: LAPTOP });
    await expect(bad.query("SELECT 1")).rejects.toThrow();
    const { resourceMetrics } = await reader.collect();
    const found = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics);
    const byName = new Map(found.map((m) => [m.descriptor.name, m]));
    expect([...byName.keys()].sort()).toEqual([...SHARED_STATE_METRICS].sort());
    const latency = byName.get("h4.shared_state.latency");
    expect(latency?.descriptor.unit).toBe("s");
    const points = latency?.dataPoints ?? [];
    expect(points.map((p) => p.attributes)).toEqual([{ "h4.host": LAPTOP }]);
    expect((points[0]?.value as { count: number }).count).toBe(3);
    const errors = byName.get("h4.shared_state.errors")?.dataPoints ?? [];
    expect(errors.map((p) => [p.attributes, p.value])).toEqual([
      [{ "h4.host": LAPTOP, "error.type": "ECONNREFUSED" }, 1],
    ]);
  });
});
