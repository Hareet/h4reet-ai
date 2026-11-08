// A whole gateway stack with the twin's files, for the turn route's integration tests (spec 007): test/helpers/
// stack.ts's stack, its local adapter on the in-process llama.cpp stub, the twin loaded from the committed config/twin/
// files with a readiness file made at run time, and budgets with or without `limits.twin`. The store is initialized,
// and the local adapter probed to health, unless a test asks otherwise.
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { LightMyRequestResponse } from "fastify";
import { expect } from "vitest";

import type { TwinLoad } from "../../src/config/twin.js";
import type { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { testStack, type TestStack } from "./stack.js";
import { stubOpenAI, type StubOpenAI } from "./stub-openai.js";
import { allReady } from "./twin.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const FALLBACK_ROUTING = fileURLToPath(new URL("../fixtures/config-fallback/routing.yaml", import.meta.url));

export const TWIN_LIMITS_BLOCK =
  "  twin: { turn_max_chars: 600, history_max_turns: 8, history_max_chars: 4000, max_input_chars: 32000, max_output_tokens: 300 }\n";

export interface TwinStack {
  s: TestStack;
  stub: StubOpenAI;
  configDir: string;
  turn(body: unknown, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
  raw(payload: string, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

export async function twinStack(
  o: {
    stack?: "dev" | "prod";
    twin?: TwinLoad;
    /** Write `limits.twin` into budgets.yaml: by default on prod, off on dev (which then uses the defaults). */
    limits?: boolean;
    /** dev's synthetic fallback (test/fixtures/config-fallback). */
    fallback?: boolean;
    init?: boolean;
    healthy?: boolean;
    storeDown?: boolean;
    env?: Record<string, string>;
    metrics?: GatewayMetrics;
  } = {},
): Promise<TwinStack> {
  const stack = o.stack ?? "dev";
  const stub = await stubOpenAI({ model: "stand-in" });
  const configDir = await mkdtemp(join(tmpdir(), "h4-twin-config-"));
  for (const file of ["prices.yaml", "alerts.yaml"]) await copyFile(join(FIXTURES, file), join(configDir, file));
  await copyFile(
    o.fallback === true ? FALLBACK_ROUTING : join(FIXTURES, "routing.yaml"),
    join(configDir, "routing.yaml"),
  );
  const { readFile } = await import("node:fs/promises");
  const budgets = await readFile(join(FIXTURES, "budgets.yaml"), "utf8");
  const limits = o.limits ?? stack === "prod";
  await writeFile(join(configDir, "budgets.yaml"), limits ? `${budgets.trimEnd()}\n${TWIN_LIMITS_BLOCK}` : budgets);
  const s = await testStack({
    stack,
    configDir,
    twin: o.twin ?? allReady(),
    ...(o.storeDown === true ? { storeDown: true } : {}),
    ...(o.metrics === undefined ? {} : { metrics: o.metrics }),
    env: { LOCAL_MODEL_BASE_URL: stub.baseUrl, ...o.env },
  });
  if (o.init !== false && o.storeDown !== true) {
    const init = await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({ reason: "A fresh stack for the twin's turn tests.", confirm_zero: true, renew: true }),
    });
    expect(init.statusCode).toBe(200);
  }
  if (o.healthy !== false) {
    // The fixture's local adapter turns healthy after three passing probes in a row.
    for (let i = 0; i < 3; i += 1) await s.services.gateway.probeAll();
  }
  const inject = (payload: string, headers: Record<string, string> = {}) =>
    s.api.inject({
      method: "POST",
      url: "/room/turn",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
      payload,
    });
  return {
    s,
    stub,
    configDir,
    turn: (body, headers) => inject(JSON.stringify(body), headers),
    raw: inject,
    close: async () => {
      await s.close();
      await stub.close();
      await rm(configDir, { recursive: true, force: true });
    },
  };
}

/** The ledger's rows, oldest first. */
export async function ledger(s: TestStack): Promise<Record<string, unknown>[]> {
  return (await s.db.pg.query<Record<string, unknown>>("SELECT * FROM gateway.ledger ORDER BY ts, id")).rows;
}
