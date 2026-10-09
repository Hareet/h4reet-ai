// The gateway's two listeners and its startup order (plan §5.1; contracts/gateway-http.md §1; operator-admin.md §1).
//
// - The api listens on 8080: /health/live now, /hello and /health with tasks.md T053 and T054.
// - The admin listener listens on 8081. Authentication comes first, before anything else (operator-admin.md §1.1),
//   and until it exists (tasks.md T055) every request there is unauthenticated, so every answer is 401.
// - Startup: validate the environment and the configuration (exit 78 on failure), connect the store (retrying in
//   the background while it is down), then start the listeners.
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import Fastify, { type FastifyError, type FastifyInstance } from "fastify";

import { ENV_CLASSES, routeFor, startupRefusals, type LoadedConfig, type StartupRefusal } from "./config/validate.js";
import { validateGatewayEnv } from "./config/validate-env.js";
import {
  FatalStoreError,
  Store,
  pgDatabase,
  pgSettingsFromEnv,
  readMigrations,
  type Database,
  type Migration,
} from "./meter/store.js";
import { registerHealthLive } from "./routes/health.js";

export const API_BODY_LIMIT = 16_384;
export const ADMIN_BODY_LIMIT = 4_096;

/** The pino methods the process logs with. */
export interface AppLogger {
  info(record: object, msg: string): void;
  warn(record: object, msg: string): void;
  error(record: object, msg: string): void;
  fatal(record: object, msg: string): void;
}

const REQUEST_ID = /^[0-9a-f]{32}$/;

/** Edge's X-Request-Id when it is 32 lowercase hex characters; otherwise one of our own (gateway-http.md §1). */
function requestId(req: IncomingMessage): string {
  const header = req.headers["x-request-id"];
  return typeof header === "string" && REQUEST_ID.test(header) ? header : randomUUID().replaceAll("-", "");
}

/** The class of an error, never its message, which can carry a payload or an address (telemetry.md §3.3). */
function errorClass(err: FastifyError | Error): string {
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : err.name;
}

function listener(bodyLimit: number, logger: AppLogger): FastifyInstance {
  const app = Fastify({
    // No Fastify logger, so no request lines: the gateway logs only its own events (telemetry.md §5.1, §5.2).
    logger: false,
    bodyLimit,
    genReqId: requestId,
    requestIdHeader: false,
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
  });
  // JSON in and out: a text/plain body is refused with 415 like any other type.
  app.removeContentTypeParser("text/plain");
  // Graceful shutdown: close() stops accepting and closes idle connections, and a request in flight finishes. Its
  // response then closes its connection too, or a keep-alive client would hold the listener open.
  let closing = false;
  app.addHook("preClose", async () => {
    closing = true;
  });
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-request-id", req.id);
    if (closing) reply.header("connection", "close");
    return payload;
  });
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status === 413)
      return reply.code(413).send({ error: "body_too_large", limit_bytes: bodyLimit, request_id: req.id });
    if (status === 415) return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
    if (status >= 400 && status < 500) {
      return reply.code(400).send({ error: "invalid_request", detail: "the request is malformed", request_id: req.id });
    }
    logger.error(
      { event: "request.failed", error_class: errorClass(err), route: req.routeOptions.url ?? "other" },
      "A request failed unexpectedly.",
    );
    return reply.code(500).send({ error: "internal_error", request_id: req.id });
  });
  return app;
}

export interface AppDeps {
  /** H4_STACK. */
  stack: string;
  logger: AppLogger;
}

/** Both listeners, routes registered, not yet listening. Tests drive them with inject(). */
export function buildApp(deps: AppDeps): { api: FastifyInstance; admin: FastifyInstance } {
  const api = listener(API_BODY_LIMIT, deps.logger);
  registerHealthLive(api);
  api.setNotFoundHandler(async (req, reply) => reply.code(404).send({ error: "not_found", request_id: req.id }));

  const admin = listener(ADMIN_BODY_LIMIT, deps.logger);
  // Until the operator's bearer authentication exists (tasks.md T055), no request here is authenticated. onRequest
  // runs before the body is read, so nothing is parsed, validated, or looked up for an unauthenticated caller, and
  // the body is the same for every request: no oracle.
  admin.addHook("onRequest", async (_req, reply) =>
    reply.code(401).header("www-authenticate", 'Bearer realm="h4reet-admin"').send({ error: "unauthorized" }),
  );
  return { api, admin };
}

export interface StartOptions {
  env: Readonly<Record<string, string | undefined>>;
  /** The configuration, loaded with loadConfig(dir, { allowPlanned: false }). */
  config: LoadedConfig;
  logger: AppLogger;
  /** The package version. */
  version: string;
  /** The store's database; pg from the environment by default. */
  database?: Database;
  migrations?: readonly Migration[];
  listen?: { host: string; apiPort: number; adminPort: number };
  storeRetryMs?: number;
  /** A fatal store error found on a retry, once the listeners are up: the process exits with this code. */
  onFatal: (exitCode: number) => void;
  /** More routes on the api before it listens: the later tasks' and the tests'. */
  routes?: (api: FastifyInstance) => void;
  now?: () => number;
}

export interface RunningGateway {
  kind: "running";
  api: FastifyInstance;
  admin: FastifyInstance;
  store: Store;
  ports: { api: number; admin: number };
  /** Graceful shutdown: stop accepting, let requests in flight finish, then close the store. */
  close(): Promise<void>;
}

export interface RefusedGateway {
  kind: "refused";
  exitCode: 1 | 78;
  /** One line per error, for stderr. */
  lines: string[];
}

const refusalLine = (r: StartupRefusal): string =>
  r.reason === "invalid_config" ? r.message : `${r.key ?? r.path ?? "config"}: ${r.message} (${r.reason})`;

function logFatalStore(logger: AppLogger, err: FatalStoreError): void {
  if (err.exitCode === 78) {
    logger.fatal({ event: "gateway.config_refused", reason: err.reason }, "The gateway refuses to start.");
  } else {
    logger.fatal(
      { event: "gateway.fatal", reason: err.reason },
      "The gateway stops on an error it can't recover from.",
    );
  }
}

export async function startGateway(opts: StartOptions): Promise<RunningGateway | RefusedGateway> {
  const { env, config, logger } = opts;
  const now = opts.now ?? Date.now;

  // 1. The environment and the configuration: exit 78 on any refusal, before anything connects.
  const refusals: StartupRefusal[] = [
    ...validateGatewayEnv(env).map((r) => ({ reason: r.reason, key: r.key, message: r.message })),
    ...startupRefusals(config, env, now()),
  ];
  if (refusals.length > 0) {
    for (const r of refusals) {
      const where = r.key !== undefined ? { key: r.key } : r.path !== undefined ? { path: r.path } : {};
      logger.fatal({ event: "gateway.config_refused", reason: r.reason, ...where }, "The gateway refuses to start.");
    }
    return { kind: "refused", exitCode: 78, lines: refusals.map(refusalLine) };
  }
  const routing = config.routing;
  const prices = config.prices;
  const envClass = ENV_CLASSES.find((c) => c === env.H4_ENV);
  if (!routing || !prices || !envClass) throw new Error("validated configuration is incomplete");

  // 2. The store: the first attempt now, retries in the background while it is down.
  const store = new Store({
    db: opts.database ?? pgDatabase(pgSettingsFromEnv(env)),
    migrations: opts.migrations ?? (await readMigrations()),
    envClass,
    logger,
    ...(env.GATEWAY_GRAFANA_RO_PASSWORD ? { grafanaRoPassword: env.GATEWAY_GRAFANA_RO_PASSWORD } : {}),
    ...(opts.storeRetryMs !== undefined ? { retryMs: opts.storeRetryMs } : {}),
    onFatal: (err) => {
      logFatalStore(logger, err);
      opts.onFatal(err.exitCode);
    },
  });
  try {
    await store.start();
  } catch (err) {
    await store.close();
    if (!(err instanceof FatalStoreError)) throw err;
    logFatalStore(logger, err);
    return { kind: "refused", exitCode: err.exitCode, lines: [`${err.message} (${err.reason})`] };
  }

  // 3. The listeners.
  const { api, admin } = buildApp({ stack: env.H4_STACK ?? "unknown", logger });
  opts.routes?.(api);
  const where = opts.listen ?? { host: "0.0.0.0", apiPort: 8080, adminPort: 8081 };
  try {
    await api.listen({ host: where.host, port: where.apiPort });
    await admin.listen({ host: where.host, port: where.adminPort });
  } catch (err) {
    await Promise.allSettled([api.close(), admin.close()]);
    await store.close();
    throw err;
  }
  const port = (app: FastifyInstance): number => {
    const address = app.server.address();
    return typeof address === "object" && address !== null ? address.port : 0;
  };
  logger.info(
    {
      event: "gateway.started",
      routing_sha: routing.sha256,
      price_version: prices.active(now())?.id,
      adapters: routeFor(routing, envClass).map((a) => a.id),
      h4_env: envClass,
    },
    "The gateway started.",
  );

  let closing: Promise<void> | undefined;
  return {
    kind: "running",
    api,
    admin,
    store,
    ports: { api: port(api), admin: port(admin) },
    close: () =>
      (closing ??= (async () => {
        await Promise.allSettled([api.close(), admin.close()]);
        await store.close();
      })()),
  };
}
