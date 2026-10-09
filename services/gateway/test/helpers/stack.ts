// A whole gateway stack for the admin and init tests: PGlite with both migrations, a journal in a fresh state
// directory, the services, and both listeners, driven with inject(). The operator token is made at run time, so no
// token-shaped value sits in a file (tasks.md: "tests build any token-shaped value at run time").
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance } from "fastify";

import { buildApp, createServices, type GatewayServices } from "../../src/app.js";
import { loadConfig } from "../../src/config/validate.js";
import { readMigrations, Store } from "../../src/meter/store.js";
import { testDatabase, type TestDatabase } from "./pglite.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));

export type StackName = "prod" | "dev" | "dev-cpu";
const SCOPE: Record<StackName, string> = { prod: "prod", dev: "dev", "dev-cpu": "devcpu" };

export interface Logged {
  level: string;
  record: Record<string, unknown>;
}

export interface TestStack {
  stack: StackName;
  db: TestDatabase;
  store: Store;
  services: GatewayServices;
  api: FastifyInstance;
  admin: FastifyInstance;
  stateDir: string;
  /** The stack's operator token, and its SHA-256 as OPERATOR_TOKEN_SHA256. */
  token: string;
  tokenSha256: string;
  logged: Logged[];
  /** Authorization: Bearer <token>. */
  auth(token?: string): Record<string, string>;
  close(): Promise<void>;
}

export const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** An operator token of the right shape: h4op_<scope>_ and 43 base64url characters. */
export function makeToken(stack: StackName): string {
  return `h4op_${SCOPE[stack]}_${randomBytes(32).toString("base64url")}`;
}

export async function testStack(
  o: {
    stack?: StackName;
    env?: Record<string, string | undefined>;
    realNow?: () => number;
    /** Leave the store unmigrated and not ready, as a store that is down. */
    storeDown?: boolean;
  } = {},
): Promise<TestStack> {
  const stack = o.stack ?? "dev";
  const envClass = stack === "prod" ? "prod" : "dev";
  const token = makeToken(stack);
  const tokenSha256 = sha256(token);
  const stateDir = await mkdtemp(join(tmpdir(), "h4-stack-"));
  const logged: Logged[] = [];
  const at = (level: string) => (record: object) =>
    void logged.push({ level, record: record as Record<string, unknown> });
  const logger = { info: at("info"), warn: at("warn"), error: at("error"), fatal: at("fatal") };
  const db = await testDatabase();
  const store = new Store({
    db,
    migrations: await readMigrations(),
    envClass,
    logger,
    onFatal: () => {},
    ...(o.realNow === undefined ? {} : { realNow: o.realNow }),
  });
  if (!o.storeDown) await store.start();
  const services = await createServices({
    env: {
      H4_STACK: stack,
      H4_ENV: envClass,
      OPERATOR_TOKEN_SHA256: tokenSha256,
      ALERT_DELIVERY: envClass === "prod" ? "real" : "standin",
      GATEWAY_TEST_CLOCK: envClass === "dev" ? "1" : "0",
      GATEWAY_TEST_SYNTHETIC_SPEND: envClass === "dev" ? "1" : "0",
      TELEMETRY_PAYLOAD_SAMPLING: "off",
      LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
      LOCAL_MODEL_NAME: "stand-in",
      AWS_PROFILE: envClass === "prod" ? "h4reet-bedrock" : "none",
      GATEWAY_STATE_DIR: stateDir,
      ...o.env,
    },
    config: await loadConfig(FIXTURES, { allowPlanned: false }),
    store,
    logger,
    version: "0.1.0",
    ...(o.realNow === undefined ? {} : { realNow: o.realNow }),
  });
  const { api, admin } = buildApp({ stack, logger, services });
  await Promise.all([api.ready(), admin.ready()]);
  return {
    stack,
    db,
    store,
    services,
    api,
    admin,
    stateDir,
    token,
    tokenSha256,
    logged,
    auth: (t = token) => ({ authorization: `Bearer ${t}` }),
    close: async () => {
      await services.gateway.close();
      await Promise.allSettled([api.close(), admin.close()]);
      await store.close();
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}
