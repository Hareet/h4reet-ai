// The gateway's two listeners and its startup order (plan §5.1; contracts/gateway-http.md §1; operator-admin.md §1).
//
// - The api listens on 8080: POST /hello, GET /health, and GET /health/live; and spec 002's POST /room/events, the
//   room's usage events, which reads config/room-events.yaml as server.ts loaded it (routes/room-events.ts).
// - The admin listener listens on 8081. Authentication comes first, before anything else (operator-admin.md §1.1),
//   and until it exists (tasks.md T055) every request there is unauthenticated, so every answer is 401.
// - Startup: validate the environment and the configuration (exit 78 on failure), build the route's adapters
//   (registry.ts: exit 78 for a configuration it refuses, 1 for a broken build), connect the store (retrying in the
//   background while it is down), then start the listeners and the background work: the adapters' health probes, the
//   meter's sweep, the gauges' refresh, the alert dispatcher with its daily reminder, and the incident drafts.
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { metrics as otelMetrics, trace, type Tracer } from "@opentelemetry/api";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";

import { buildRoute, loadFactories, RegistryError, switchedOff, type AdapterFactory } from "./adapters/registry.js";
import { channelsFrom, Dispatcher } from "./alerts/dispatcher.js";
import { IncidentDrafts } from "./incidents/draft.js";
import {
  ENV_CLASSES,
  routeFor,
  startupRefusals,
  type AlertsConfig,
  type Budgets,
  type EnvClass,
  type LoadedConfig,
  type PriceTable,
  type RoutingConfig,
  type StackName,
  type StartupRefusal,
} from "./config/validate.js";
import { validateGatewayEnv } from "./config/validate-env.js";
import type { RoomEventsConfig, RoomEventsLoad } from "./config/room-events.js";
import type { TwinLoad } from "./config/twin.js";
import { GatewayClock } from "./core/clock.js";
import { Gateway } from "./core/gateway.js";
import { ClientCap } from "./core/limits.js";
import { Journal } from "./meter/journal.js";
import { Meter } from "./meter/meter.js";
import {
  FatalStoreError,
  Store,
  pgDatabase,
  pgSettingsFromEnv,
  readMigrations,
  type Database,
  type Migration,
} from "./meter/store.js";
import { registerAdmin } from "./routes/admin.js";
import { registerHealth, registerHealthLive } from "./routes/health.js";
import { registerHello } from "./routes/hello.js";
import { registerRoomEvents } from "./routes/room-events.js";
import { registerRoomTurn } from "./routes/room-turn.js";
import { edgePeer, type ForwardedBy } from "./core/edge.js";
import { GatewayMetrics } from "./telemetry/metrics.js";
import { annotateServerSpan, noteErrorType } from "./telemetry/otel.js";
import { NO_TWIN, twinRuntime, type TwinRuntime } from "./twin/turn.js";
import { FREE_TALK } from "./twin/pack.js";

/** The room features a turn can be charged under: each selectable the pack names, and free talk (spec 007). */
const roomFeaturesOf = (twin: TwinLoad): string[] =>
  twin.available ? [...twin.files.pack.selectable.keys(), FREE_TALK].sort() : [];

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

function listener(bodyLimit: number, logger: AppLogger, stack: string): FastifyInstance {
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
    const cause = reply.getHeader("x-h4-degraded-cause");
    annotateServerSpan(req, {
      stack,
      status: reply.statusCode,
      degradedCause: typeof cause === "string" ? cause : undefined,
    });
    return payload;
  });
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status === 413)
      return reply.code(413).send({ error: "body_too_large", limit_bytes: bodyLimit, request_id: req.id });
    if (status === 415) return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
    // With no route schemas, every other 4xx here is the body parser's: JSON that doesn't parse, an empty JSON body,
    // a forbidden prototype key, or a size that isn't the Content-Length. The body as a whole is wrong, so the field
    // is body (gateway-http.md §2.5.4), on both listeners.
    if (status >= 400 && status < 500) {
      return reply
        .code(400)
        .send({ error: "invalid_request", field: "body", detail: "the request is malformed", request_id: req.id });
    }
    const cls = errorClass(err);
    noteErrorType(req, cls);
    logger.error(
      { event: "request.failed", error_class: cls, route: req.routeOptions.url ?? "other" },
      "A request failed unexpectedly.",
    );
    return reply.code(500).send({ error: "internal_error", request_id: req.id });
  });
  return app;
}

// ---------------------------------------------------------------------------------------------------------------
// The services behind the routes
// ---------------------------------------------------------------------------------------------------------------

export interface GatewayServices {
  stack: StackName;
  envClass: EnvClass;
  version: string;
  env: Readonly<Record<string, string | undefined>>;
  routing: RoutingConfig;
  prices: PriceTable;
  budgets: Budgets;
  alerts: AlertsConfig;
  logger: AppLogger;
  metrics: GatewayMetrics;
  clock: GatewayClock;
  store: Store;
  journal: Journal;
  meter: Meter;
  gateway: Gateway;
  /** The alert outbox's delivery, the in-memory store_unreachable alert, and the daily reminder. */
  dispatcher: Dispatcher;
  /** The incident drafts a trip queues (FR-035), written every 10 s. */
  drafts: IncidentDrafts;
  /** The route's fallback adapter as built, or null: none configured, or its switch off (the synthetic one). */
  fallbackId: string | null;
  clientCap: ClientCap;
  realNow: () => number;
  /** Whether a peer is edge (core/edge.ts). */
  forwardedBy: ForwardedBy;
  /** GATEWAY_STATE_DIR: the journal and the incident drafts. */
  stateDir: string;
  /** Spec 002's event list, config/room-events.yaml; null when it was missing or invalid: every event is refused. */
  roomEvents: RoomEventsConfig | null;
  /** Spec 007's twin: its files, its per-turn limits, its ranking, and the turn route's own per-client cap. */
  twin: TwinRuntime;
}

/** GATEWAY_STATE_DIR, which compose sets (env-files.md §4): the journal and the incident drafts live under it. */
export const DEFAULT_STATE_DIR = "/var/lib/h4-gateway";

export interface ServiceOptions {
  env: Readonly<Record<string, string | undefined>>;
  /** Validated: startupRefusals found nothing. */
  config: LoadedConfig;
  /** Started, or about to be: until it is ready, every request answers store_unreachable. */
  store: Store;
  logger: AppLogger;
  version: string;
  tracer?: Tracer;
  metrics?: GatewayMetrics;
  /** The adapter factories; every module in adapters/ by default (registry.ts). */
  factories?: ReadonlyMap<string, AdapterFactory>;
  realNow?: () => number;
  /** Which peer is edge; by default the `edge` service's addresses, looked up on the stack's network. */
  forwardedBy?: ForwardedBy;
  /** Spec 002's event list; none by default, so every usage event is refused. */
  roomEvents?: RoomEventsConfig | null;
  /** Spec 007's twin files, as loadTwin read them; none by default, so every turn is twin_unavailable. */
  twin?: TwinLoad;
}

/**
 * Everything the routes use, for a validated configuration. It builds the route's adapters, and throws a
 * RegistryError when the registry refuses them: exit 78 for a configuration error, exit 1 for a broken build. A
 * route with a fallback gets the meter, through which every fallback call is admitted and committed (FR-022).
 */
export async function createServices(opts: ServiceOptions): Promise<GatewayServices> {
  const { env, config, logger } = opts;
  const { routing, prices, budgets, alerts } = config;
  const envClass = ENV_CLASSES.find((c) => c === env.H4_ENV);
  const stack = env.H4_STACK as StackName;
  if (!routing || !prices || !budgets || !alerts || !envClass) throw new Error("validated configuration is incomplete");
  const realNow = opts.realNow ?? Date.now;
  const adapters = buildRoute({
    factories: opts.factories ?? (await loadFactories()),
    routing,
    envClass,
    env,
    logger,
    realNow,
  });
  const clock = new GatewayClock(realNow);
  const metrics = opts.metrics ?? new GatewayMetrics(otelMetrics.getMeter("h4-gateway"));
  const stateDir = env.GATEWAY_STATE_DIR || DEFAULT_STATE_DIR;
  const journal = new Journal({ stateDir, stack, realNow });
  const meter = new Meter({
    stack,
    envClass,
    budgets,
    alerts,
    prices,
    routingSha: routing.sha256,
    store: opts.store,
    journal,
    clock,
    metrics,
    logger,
    realNow,
    hasFallback: adapters.some((a) => a.role === "fallback"),
    // Spec 010 (FR-023, FR-037): an adapter month's cap sets the renewal flag only for the route's fallback, and its
    // alerts name each adapter by its type's label.
    fallbackAdapterId: adapters.find((a) => a.role === "fallback")?.config.id ?? null,
    adapterLabels: new Map(adapters.map((a) => [a.config.id, a.config.spec.label ?? a.config.id] as [string, string])),
  });
  const gateway = new Gateway({
    stack,
    envClass,
    version: opts.version,
    routing,
    prices,
    budgets,
    adapters,
    disabled: switchedOff({ routing, envClass, env }),
    store: opts.store,
    clock,
    tracer: opts.tracer ?? trace.getTracer("h4-gateway"),
    metrics,
    logger,
    payloadSampling: env.TELEMETRY_PAYLOAD_SAMPLING === "on",
    testMachinery: { clock: env.GATEWAY_TEST_CLOCK === "1", synthetic: env.GATEWAY_TEST_SYNTHETIC_SPEND === "1" },
    journalStatus: () => journal.status(),
    meter,
    realNow,
    roomFeatures: roomFeaturesOf(opts.twin ?? NO_TWIN),
  });
  // A committed change to a meter or the state replaces the gauges' snapshot at once (telemetry.md §4.1).
  meter.onChange = () => void gateway.refreshGauges().catch(() => {});
  const dispatcher = new Dispatcher({
    stack,
    envClass,
    store: opts.store,
    alerts,
    budgets,
    channels: channelsFrom(env, alerts),
    hasFallback: gateway.fallbackId() !== null,
    clock,
    metrics,
    logger,
    realNow,
  });
  // A paid fallback that turns unhealthy: the dispatcher queues its fallback_unavailable alert (data-model.md §7.7).
  gateway.onFallbackUnavailable = (adapter, reason) => void dispatcher.fallbackUnavailable(adapter, reason);
  // A paid adapter whose SSO session ends soon: the dispatcher queues its credentials_expiring alert (alerts.md §2).
  gateway.onCredentialsExpiring = (adapter, label, endsAt) => dispatcher.credentialsExpiring(adapter, label, endsAt);
  const drafts = new IncidentDrafts({
    stack,
    envClass,
    store: opts.store,
    stateDir,
    budgets,
    prices,
    fallbackId: gateway.fallbackId(),
    env,
    clock,
    logger,
    realNow,
  });
  return {
    stack,
    envClass,
    version: opts.version,
    env,
    routing,
    prices,
    budgets,
    alerts,
    logger,
    metrics,
    clock,
    store: opts.store,
    journal,
    meter,
    gateway,
    dispatcher,
    drafts,
    fallbackId: gateway.fallbackId(),
    clientCap: new ClientCap(budgets.limits.perClient),
    realNow,
    forwardedBy: opts.forwardedBy ?? edgePeer(),
    stateDir,
    roomEvents: opts.roomEvents ?? null,
    twin: twinRuntime(opts.twin ?? NO_TWIN, budgets, envClass),
  };
}

export interface AppDeps {
  /** H4_STACK. */
  stack: string;
  logger: AppLogger;
  /** The routes' services. Without them the listeners are bare: /health/live, and an admin listener that refuses. */
  services?: GatewayServices;
}

/** Both listeners, routes registered, not yet listening. Tests drive them with inject(). */
export function buildApp(deps: AppDeps): { api: FastifyInstance; admin: FastifyInstance } {
  const api = listener(API_BODY_LIMIT, deps.logger, deps.stack);
  registerHealthLive(api);
  const s = deps.services;
  if (s !== undefined) {
    registerHealth(api, s.gateway);
    registerHello(api, {
      stack: s.stack,
      gateway: s.gateway,
      clientCap: s.clientCap,
      clock: s.clock,
      metrics: s.metrics,
      logger: s.logger,
      maxOutputTokens: s.budgets.limits.perCall.helloMaxOutputTokens,
      realNow: s.realNow,
      forwardedBy: s.forwardedBy,
    });
    registerRoomEvents(api, { events: s.roomEvents, metrics: s.metrics });
    registerRoomTurn(api, {
      stack: s.stack,
      gateway: s.gateway,
      twin: s.twin,
      clock: s.clock,
      metrics: s.metrics,
      logger: s.logger,
      realNow: s.realNow,
      forwardedBy: s.forwardedBy,
    });
  }
  api.setNotFoundHandler(async (req, reply) => reply.code(404).send({ error: "not_found", request_id: req.id }));

  const admin = listener(ADMIN_BODY_LIMIT, deps.logger, deps.stack);
  if (s !== undefined) {
    registerAdmin(admin, {
      stack: s.stack,
      envClass: s.envClass,
      operatorTokenSha256: s.env.OPERATOR_TOKEN_SHA256 ?? "",
      gateway: s.gateway,
      store: s.store,
      journal: s.journal,
      clock: s.clock,
      budgets: s.budgets,
      alerts: s.alerts,
      fallbackId: s.fallbackId,
      metrics: s.metrics,
      logger: s.logger,
      realNow: s.realNow,
      meter: s.meter,
      stateDir: s.stateDir,
      testMachinery: { clock: s.env.GATEWAY_TEST_CLOCK === "1", synthetic: s.env.GATEWAY_TEST_SYNTHETIC_SPEND === "1" },
      onChange: () => void s.gateway.refreshGauges().catch(() => {}),
      twin: s.twin,
    });
  } else {
    // Bare listeners have no operator credential, so no request is authenticated. onRequest runs before the body is
    // read, so nothing is parsed or looked up, and the body is the same for every request: no oracle.
    admin.addHook("onRequest", async (_req, reply) =>
      reply.code(401).header("www-authenticate", 'Bearer realm="h4reet-admin"').send({ error: "unauthorized" }),
    );
  }
  admin.setNotFoundHandler(async (req, reply) => reply.code(404).send({ error: "not_found", request_id: req.id }));
  return { api, admin };
}

// ---------------------------------------------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------------------------------------------

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
  /** More routes on the api before it listens: the tests'. */
  routes?: (api: FastifyInstance) => void;
  /** The adapter factories; every module in adapters/ by default. */
  factories?: ReadonlyMap<string, AdapterFactory>;
  now?: () => number;
  /**
   * Spec 002's config/room-events.yaml, as server.ts read it from the config directory. Missing or invalid, the
   * gateway still starts, logs room_events.unavailable, and refuses every usage event; absent, it refuses them too.
   */
  roomEvents?: RoomEventsLoad;
  /** Spec 007's twin files, as server.ts read them from the config directory. Missing or invalid, the gateway still
   *  starts, logs twin.unavailable once, and answers every turn twin_unavailable (FR-054). */
  twin?: TwinLoad;
}

export interface RunningGateway {
  kind: "running";
  api: FastifyInstance;
  admin: FastifyInstance;
  store: Store;
  services: GatewayServices;
  ports: { api: number; admin: number };
  /** Graceful shutdown: stop accepting, let requests in flight finish, stop the background work, close the store. */
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

function logFatal(logger: AppLogger, exitCode: 1 | 78, reason: string): void {
  if (exitCode === 78) {
    logger.fatal({ event: "gateway.config_refused", reason }, "The gateway refuses to start.");
  } else {
    logger.fatal({ event: "gateway.fatal", reason }, "The gateway stops on an error it can't recover from.");
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

  // Spec 002's event list never stops the gateway: without it, every usage event is refused (room-events.md §3).
  const roomEvents = opts.roomEvents;
  if (roomEvents !== undefined && !roomEvents.ok) {
    logger.warn(
      { event: "room_events.unavailable", reason: roomEvents.reason, path: roomEvents.path },
      "The room's event list is missing or invalid, so every usage event is refused.",
    );
  }

  // 2. The route's adapters, and the services around them; then the store: the first attempt now, retries in the
  //    background while it is down.
  const store = new Store({
    db: opts.database ?? pgDatabase(pgSettingsFromEnv(env)),
    migrations: opts.migrations ?? (await readMigrations()),
    envClass,
    logger,
    ...(env.GATEWAY_GRAFANA_RO_PASSWORD ? { grafanaRoPassword: env.GATEWAY_GRAFANA_RO_PASSWORD } : {}),
    ...(opts.storeRetryMs !== undefined ? { retryMs: opts.storeRetryMs } : {}),
    onFatal: (err) => {
      logFatal(logger, err.exitCode, err.reason);
      opts.onFatal(err.exitCode);
    },
  });
  let services: GatewayServices;
  try {
    services = await createServices({
      env,
      config,
      store,
      logger,
      version: opts.version,
      ...(opts.factories === undefined ? {} : { factories: opts.factories }),
      roomEvents: roomEvents?.ok === true ? roomEvents.config : null,
      ...(opts.twin === undefined ? {} : { twin: opts.twin }),
    });
  } catch (err) {
    await store.close();
    if (!(err instanceof RegistryError)) throw err;
    logFatal(logger, err.exitCode, err.reason);
    return { kind: "refused", exitCode: err.exitCode, lines: [`${err.message} (${err.reason})`] };
  }
  try {
    await store.start();
  } catch (err) {
    await services.gateway.close();
    await store.close();
    if (!(err instanceof FatalStoreError)) throw err;
    logFatal(logger, err.exitCode, err.reason);
    return { kind: "refused", exitCode: err.exitCode, lines: [`${err.message} (${err.reason})`] };
  }

  // Spec 007's twin never stops the gateway: each reason it can't answer is logged once, here, when server.ts read the
  // files (FR-054, FR-030, FR-027); a caller that passes none, as the tests do, has nothing to report.
  const twin = services.twin;
  if (opts.twin !== undefined) {
    if (!twin.load.available) {
      logger.warn(
        { event: "twin.unavailable", reason: twin.load.reason },
        "The twin's files are missing or invalid, so every turn is twin_unavailable.",
      );
    }
    if (!twin.load.readiness.ok) {
      logger.info(
        { event: "twin.readiness_unavailable", reason: twin.load.readiness.reason },
        "The twin's readiness file is missing or invalid, so nothing is ready.",
      );
    }
    if (twin.limits === null) {
      logger.warn(
        { event: "twin.unavailable", reason: "limits_missing" },
        "config/budgets.yaml has no limits.twin, so every turn is twin_unavailable on prod.",
      );
    } else if (twin.limitsDefault) {
      logger.info(
        { event: "twin.limits_default" },
        "config/budgets.yaml has no limits.twin, so the twin uses FR-027's defaults.",
      );
    }
  }

  // 3. The listeners, then the background work.
  const { api, admin } = buildApp({ stack: services.stack, logger, services });
  opts.routes?.(api);
  const where = opts.listen ?? { host: "0.0.0.0", apiPort: 8080, adminPort: 8081 };
  try {
    await api.listen({ host: where.host, port: where.apiPort });
    await admin.listen({ host: where.host, port: where.adminPort });
  } catch (err) {
    await Promise.allSettled([api.close(), admin.close()]);
    await services.gateway.close();
    await store.close();
    throw err;
  }
  services.gateway.start();
  services.dispatcher.start();
  services.drafts.start();
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
    services,
    ports: { api: port(api), admin: port(admin) },
    close: () =>
      (closing ??= (async () => {
        await Promise.allSettled([api.close(), admin.close()]);
        await services.drafts.stop();
        await services.dispatcher.stop();
        await services.gateway.close();
        await store.close();
      })()),
  };
}
