// The relay's configuration (contracts/relay-http.md; contracts/env-cloud.md §2): the public cap's figures from
// config/budgets.yaml's `public` section, the Author's patch P-6, and the rest from the environment compose gives it.
//
// The relay refuses to start, naming each key, while the section is missing or a figure is blank (ADR 0029; tasks.md
// T105). A problem is a line for stderr; none names a value it read, since some are tokens or passwords.
import { parse } from "yaml";

import type { PublicCapFigures } from "./cap.js";
import type { HostName } from "./hosts.js";
import { parseRanges } from "./peer.js";
import type { BlockList } from "node:net";

/** The section's keys, as P-6 writes them, and each figure's bounds. */
export const PUBLIC_KEYS = [
  ["per_address", "requests_per_minute", 1, 600],
  ["per_address", "burst", 1, 600],
  ["per_address", "requests_per_day", 1, 100_000],
  ["global", "in_flight", 1, 256],
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** config/budgets.yaml's `public` section, read as the relay reads it: every figure a whole number in its bounds,
 *  the burst at most the minute's, the day at least the minute's, and nothing else in the section. */
export function readPublicCap(text: string): { figures?: PublicCapFigures; problems: string[] } {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return { problems: ["config/budgets.yaml: doesn't parse as YAML"] };
  }
  const section = isRecord(doc) ? doc.public : undefined;
  if (section === undefined || section === null) {
    return { problems: ["config/budgets.yaml: public is missing: the relay's cap is the Author's (P-6, FR-033)"] };
  }
  if (!isRecord(section)) return { problems: ["config/budgets.yaml: public must be a mapping"] };
  const problems: string[] = [];
  for (const key of Object.keys(section)) {
    if (key !== "per_address" && key !== "global") problems.push(`config/budgets.yaml: public.${key} isn't a key`);
  }
  const values: number[] = [];
  for (const [group, key, min, max] of PUBLIC_KEYS) {
    const path = `public.${group}.${key}`;
    const parent = section[group];
    const value = isRecord(parent) ? parent[key] : undefined;
    if (value === undefined || value === null || value === "") {
      problems.push(`config/budgets.yaml: ${path} is blank: the Author's figure (P-6, FR-033)`);
    } else if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      problems.push(`config/budgets.yaml: ${path} must be a whole number from ${min} to ${max}`);
    } else {
      values.push(value);
    }
  }
  for (const group of ["per_address", "global"] as const) {
    const parent = section[group];
    if (parent !== undefined && parent !== null && !isRecord(parent)) {
      problems.push(`config/budgets.yaml: public.${group} must be a mapping`);
    } else if (isRecord(parent)) {
      const known = PUBLIC_KEYS.filter(([g]) => g === group).map(([, k]) => k as string);
      for (const key of Object.keys(parent)) {
        if (!known.includes(key)) problems.push(`config/budgets.yaml: public.${group}.${key} isn't a key`);
      }
    }
  }
  if (problems.length > 0) return { problems };
  const [requestsPerMinute = 0, burst = 0, requestsPerDay = 0, inFlight = 0] = values;
  if (burst > requestsPerMinute)
    problems.push("config/budgets.yaml: public.per_address.burst must be at most requests_per_minute");
  if (requestsPerDay < requestsPerMinute) {
    problems.push("config/budgets.yaml: public.per_address.requests_per_day must be at least requests_per_minute");
  }
  if (problems.length > 0) return { problems };
  return { figures: { requestsPerMinute, burst, requestsPerDay, inFlight }, problems };
}

export interface HostTarget {
  readonly name: HostName;
  /** The host's relay block: the laptop's through the tunnel's reverse forward, EC2's in the VPC. */
  readonly url: string;
  readonly token: string;
  /** GET on it every second; the relay block's is /health (contracts/tunnel.md §4). */
  readonly healthPath: string;
}

export interface DbTarget {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  /** The shared state's CA certificate, PEM; absent only off prod, where the store is the stack's own. */
  readonly ca?: string;
  readonly servername?: string;
}

export interface RelayEnv {
  readonly stack: string;
  readonly hosts: readonly HostTarget[];
  readonly refusedPeers: BlockList;
  readonly stateDb: DbTarget;
  /** Where handover_events rows go, as relay_rw; absent off prod, where the relay records nothing. */
  readonly handoverDb?: DbTarget;
  readonly budgetsPath: string;
}

const HOST_NAMES: readonly HostName[] = ["laptop", "ec2"];

/** The environment, as compose gives it. Every problem names its key and never a value. */
export function readEnv(env: NodeJS.ProcessEnv): { env?: RelayEnv; problems: string[] } {
  const problems: string[] = [];
  const need = (key: string): string => {
    const v = env[key];
    if (v === undefined || v === "") problems.push(`${key} is missing`);
    return v ?? "";
  };
  const stack = need("H4_STACK");
  const prod = stack === "prod";

  const hosts: HostTarget[] = [];
  for (const name of HOST_NAMES) {
    const key = name.toUpperCase();
    const url = env[`RELAY_${key}_URL`] ?? "";
    if (url === "") {
      if (prod) problems.push(`RELAY_${key}_URL is missing`);
      continue;
    }
    if (!/^http:\/\/[A-Za-z0-9.-]+:\d{1,5}$/.test(url)) problems.push(`RELAY_${key}_URL must be http://<host>:<port>`);
    const token = env[`RELAY_TOKEN_${key}`] ?? "";
    if (prod && token.length < 32) problems.push(`RELAY_TOKEN_${key} is missing or shorter than 32 characters`);
    hosts.push({ name, url, token, healthPath: env.RELAY_HEALTH_PATH || "/health" });
  }
  if (hosts.length === 0) problems.push("no host: RELAY_LAPTOP_URL and RELAY_EC2_URL are both missing");

  const peers = parseRanges(env.RELAY_REFUSED_PEERS ?? "");
  problems.push(...peers.problems);
  if (prod && (env.RELAY_REFUSED_PEERS ?? "").trim() === "") problems.push("RELAY_REFUSED_PEERS is missing");

  const caText = env.RELAY_DB_TLS_CA ?? "";
  let ca: string | undefined;
  if (caText !== "") {
    const pem = Buffer.from(caText, "base64").toString("utf8");
    if (!/^-----BEGIN CERTIFICATE-----\n[\s\S]+\n-----END CERTIFICATE-----\n?$/.test(pem)) {
      problems.push("RELAY_DB_TLS_CA must be the base64 of one PEM certificate");
    } else ca = pem;
  }
  const servername = env.RELAY_DB_TLS_SERVERNAME || undefined;
  if (prod && (ca === undefined || servername === undefined)) {
    problems.push("RELAY_DB_TLS_CA and RELAY_DB_TLS_SERVERNAME are required on prod: the shared state is TLS only");
  }
  const port = Number(env.RELAY_DB_PORT ?? "5432");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) problems.push("RELAY_DB_PORT must be a port");
  const db = (user: string, password: string): DbTarget => ({
    host: env.RELAY_DB_HOST ?? "",
    port,
    database: env.RELAY_DB_NAME ?? "",
    user,
    password,
    ...(ca === undefined ? {} : { ca }),
    ...(servername === undefined ? {} : { servername }),
  });
  need("RELAY_DB_HOST");
  need("RELAY_DB_NAME");
  const stateDb = db(need("RELAY_DB_RO_USER"), need("RELAY_DB_RO_PASSWORD"));
  const rwUser = env.RELAY_DB_RW_USER ?? "";
  let handoverDb: DbTarget | undefined;
  if (rwUser !== "") handoverDb = db(rwUser, need("RELAY_DB_RW_PASSWORD"));
  else if (prod) problems.push("RELAY_DB_RW_USER is missing: prod records every handover (FR-063)");

  if (problems.length > 0) return { problems };
  return {
    env: {
      stack,
      hosts,
      refusedPeers: peers.list,
      stateDb,
      ...(handoverDb === undefined ? {} : { handoverDb }),
      budgetsPath: env.RELAY_BUDGETS || "/app/config/budgets.yaml",
    },
    problems,
  };
}
