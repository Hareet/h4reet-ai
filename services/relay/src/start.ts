// The relay's start (contracts/relay-http.md §8; ADR 0029): what it refuses, and what it starts with. It refuses, exit
// 78, while the public section is missing or a figure is blank, or the environment lacks a key, naming each. It starts
// with empty caps, an unknown kill switch until its first read, and both hosts unhealthy until their checks pass.
import { metrics, trace } from "@opentelemetry/api";
import type pino from "pino";

import { buildRelay, type RelayDeps } from "./app.js";
import { PublicCap, StatusBucket } from "./cap.js";
import { readEnv, readPublicCap, type HostTarget, type RelayEnv } from "./config.js";
import { CHECK_INTERVAL_MS, checkHost, HostChoice, type HandoverEvent, type HostName } from "./hosts.js";
import { KillSwitch, type StateSource } from "./killswitch.js";
import { RelayTelemetry, type StatusClass } from "./telemetry.js";

export const EXIT_CONFIG = 78;

export type Prepared =
  | { readonly kind: "refused"; readonly exitCode: number; readonly lines: readonly string[] }
  | { readonly kind: "ready"; readonly env: RelayEnv; readonly cap: PublicCap };

/** The environment and the budgets file's text, checked together, so one start prints every problem at once. */
export function prepare(
  processEnv: NodeJS.ProcessEnv,
  budgetsText: string | undefined,
  now: () => number = Date.now,
): Prepared {
  const read = readEnv(processEnv);
  const cap =
    budgetsText === undefined
      ? { problems: ["config/budgets.yaml can't be read"] as string[] }
      : readPublicCap(budgetsText);
  const lines = [...read.problems, ...cap.problems].map((p) => `relay: ${p}`);
  if (read.env === undefined || !("figures" in cap) || cap.figures === undefined || lines.length > 0) {
    return { kind: "refused", exitCode: EXIT_CONFIG, lines };
  }
  return { kind: "ready", env: read.env, cap: new PublicCap(cap.figures, now) };
}

export interface Running {
  readonly deps: RelayDeps;
  readonly listeners: ReturnType<typeof buildRelay>;
  /** One round of checks of both hosts, as the timer runs it each second. */
  check(): Promise<void>;
  /** The checks every second, until stop(). */
  start(): void;
  stop(): void;
}

export function assemble(
  ready: Extract<Prepared, { kind: "ready" }>,
  stateSource: StateSource,
  recordHandover: ((event: HandoverEvent) => Promise<void>) | undefined,
  logger: pino.Logger,
  now: () => number = Date.now,
  check: (target: HostTarget) => Promise<boolean> = (t) => checkHost(t),
): Running {
  const targets = new Map<HostName, HostTarget>(ready.env.hosts.map((h) => [h.name, h]));
  const holder: { telemetry?: RelayTelemetry; statusClass?: () => StatusClass } = {};
  const hosts = new HostChoice([...targets.keys()], now, (event) => {
    holder.telemetry?.handover(event);
    logger.info(
      { event: "relay.handover", from: event.from, to: event.to, reason: event.reason, gap_ms: event.gapMs },
      "The serving host changed.",
    );
    recordHandover?.(event).catch(() =>
      logger.warn({ event: "relay.handover_unrecorded" }, "A handover couldn't be written to the shared state."),
    );
  });
  const telemetry = new RelayTelemetry(
    metrics.getMeter("h4reet-relay"),
    trace.getTracer("h4reet-relay"),
    hosts,
    () => holder.statusClass?.() ?? "unknown",
  );
  holder.telemetry = telemetry;
  const deps: RelayDeps = {
    stack: ready.env.stack,
    cap: ready.cap,
    statusCap: new StatusBucket(now),
    hosts,
    targets,
    killSwitch: new KillSwitch(stateSource, now),
    refusedPeers: ready.env.refusedPeers,
    telemetry,
    logger,
    now,
  };
  let timer: NodeJS.Timeout | undefined;
  let checking = false;
  const round = async (): Promise<void> => {
    if (checking) return;
    checking = true;
    try {
      const results = await Promise.all([...targets.values()].map(async (t) => [t.name, await check(t)] as const));
      hosts.reportRound(results);
      // No address outlives its day, or its bucket's refill, for want of a request (FR-042; nit 4).
      deps.cap.sweep();
      deps.statusCap.sweep();
    } finally {
      checking = false;
    }
  };
  const listeners = buildRelay(deps);
  holder.statusClass = listeners.statusClass;
  return {
    deps,
    listeners,
    check: round,
    start: () => {
      timer ??= setInterval(() => void round(), CHECK_INTERVAL_MS);
    },
    stop: () => clearInterval(timer),
  };
}
