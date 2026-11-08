// The gateway's entry point: `node dist/server.js` in its container (plan §5.1, tasks.md T028).
//
// The order matters. The configuration is read first: YAML and zod only, nothing instrumented. Then the telemetry
// SDK starts, and only then are Fastify, pg, and pino loaded, through dynamic imports and require, so their
// instrumentations can wrap them (telemetry.md §3.1). Then the startup sequence of app.ts runs: refusals exit 78,
// a store problem retrying can't fix exits 1 or 78, and otherwise the listeners serve until SIGTERM or SIGINT, when
// the gateway stops accepting, lets requests in flight finish, closes the store, flushes telemetry, and exits 0.
import { createRequire } from "node:module";

import { loadRoomEvents } from "./config/room-events.js";
import { loadTwin } from "./config/twin.js";
import { loadConfig } from "./config/validate.js";
import { hostOf, startTelemetry } from "./telemetry/otel.js";

/** ${H4_TREE}/config, mounted read-only (data-model.md §1). `--config-dir <dir>` points elsewhere, for tests. */
const CONFIG_DIR = process.argv[2] === "--config-dir" && process.argv[3] ? process.argv[3] : "/app/config";
/** Past this, a shutdown that hasn't finished exits anyway; compose's stop timeout is longer (`down --timeout 30`). */
const SHUTDOWN_GRACE_MS = 15_000;

const env = process.env;
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
const config = await loadConfig(CONFIG_DIR, { allowPlanned: false });
// Spec 002's usage events: config/room-events.yaml, from the same directory. Missing or invalid, it refuses no start.
const roomEvents = await loadRoomEvents(CONFIG_DIR);
// Spec 007's twin: config/twin/ and config/twin-readiness.yaml, from the same directory. None of them refuses a start.
const twin = await loadTwin(CONFIG_DIR);
const telemetry = startTelemetry({
  version,
  telegramHosts: [...hostOf(env.TELEGRAM_API_BASE), ...hostOf(config.alerts?.standin.telegramBase)],
});

const { createLogger } = await import("./telemetry/log.js");
const logger = createLogger({ stack: env.H4_STACK ?? "unknown" });
const { startGateway } = await import("./app.js");

let stopping = false;
async function exit(code: number, close?: () => Promise<void>): Promise<never> {
  if (!stopping) {
    stopping = true;
    setTimeout(() => process.exit(code === 0 ? 1 : code), SHUTDOWN_GRACE_MS).unref();
    await close?.().catch(() => {});
    await telemetry.shutdown().catch(() => {});
  }
  process.exit(code);
}

let close: (() => Promise<void>) | undefined;
const result = await startGateway({
  env,
  config,
  logger,
  version,
  onFatal: (code) => void exit(code, close),
  roomEvents,
  twin,
});

if (result.kind === "refused") {
  // Every error, one per line, as config-files.md §0 prints them; the log records carry the reason codes.
  for (const line of result.lines) process.stderr.write(`${line}\n`);
  await exit(result.exitCode);
} else {
  close = result.close;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      logger.info({ event: "gateway.stopping", signal }, "The gateway is stopping.");
      void exit(0, close);
    });
  }
}
