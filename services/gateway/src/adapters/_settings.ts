// The routing.yaml settings of every adapter type (contracts/config-files.md §1.1, "Settings by type"), and which
// types this build registers (rule R6).
//
// A helper module: its name starts with "_", so the registry never loads it as an adapter (provider-adapter.md §4).
// It lives in src/adapters/ because it names providers, and nothing outside src/adapters/ may (SC-006). Each
// adapter's factory (tasks.md T051, T073, T102) takes its type, kinds, and settings schema from here, so
// validate-config and the registry check the same rules.
import { isIP } from "node:net";

import { z } from "zod";

import type { AdapterKind, ProviderErrorKind } from "../core/types.js";

/** A rule finding inside one adapter's settings; the path is relative to `adapters.<id>`. */
export interface SettingsFinding {
  path: string;
  rule: string;
  message: string;
  requirement?: string;
}

/** A startup refusal that depends on the stack's environment (config-files.md §1.4). */
export interface SettingsRefusal {
  reason: "local_url_not_in_stack" | "missing_env";
  key: string; // the env key, never its value
  message: string;
}

export type Env = Readonly<Record<string, string | undefined>>;

/** A probe every intervalMs, each within timeoutMs; unhealthy after that many failures, healthy after that many passes. */
export interface HealthCadence {
  intervalMs: number;
  timeoutMs: number;
  unhealthyAfter: number;
  healthyAfter: number;
}

/** A circuit breaker's settings, on the real clock (provider-adapter.md §6 item 5). */
export interface CircuitSettings {
  /** Counted failures in a row that open it. */
  failures: number;
  /** How long it stays open before a trial call, ms. */
  openMs: number;
}

export interface AdapterTypeSpec {
  readonly type: string;
  /** The kinds an adapter of this type may be declared as (rule R5). */
  readonly kinds: readonly AdapterKind[];
  /** Strict: every settings key besides `type` and `kind`. */
  readonly settings: z.ZodType;
  /** gen_ai.provider.name, fixed by the type or read from the settings. */
  provider(settings: Record<string, unknown>): string;
  /** The model the adapter sends: from its settings, or from the env key they name. */
  model(settings: Record<string, unknown>, env: Env): string | undefined;
  /** For routing.yaml's deadline rule (R9), and for the attempt wrapper's retry rule (provider-adapter.md §6). */
  timing(settings: Record<string, unknown>): { requestMs: number; retryMax: number; backoffMs: number };
  /** How the gateway probes an adapter of this type, on the real clock (provider-adapter.md §3, §6 item 4). */
  healthCadence(settings: Record<string, unknown>): HealthCadence;
  /** The rules a schema can't say: R7, R8, and the like. Runs only on settings that passed the schema. */
  check(settings: Record<string, unknown>, kind: AdapterKind): SettingsFinding[];
  /** Startup refusals that need the environment. */
  checkEnv(settings: Record<string, unknown>, env: Env): SettingsRefusal[];
  /** How an alert names an adapter of this type in a sentence: "Bedrock" (alerts.md §3). */
  readonly label?: string;
  /** A paid type with expiring credentials: how long before the session ends credentials_expiring fires (alerts.md §2). */
  credentialsWarnMs?(settings: Record<string, unknown>): number;
  /** A type with a circuit breaker, from its `circuit` settings (provider-adapter.md §6 item 5). */
  circuit?(settings: Record<string, unknown>): CircuitSettings;
}

/** A value only the Author can supply, such as "<inference-profile ID the Author confirms>" (§0). */
export const PLACEHOLDER = /^<[^<>]+>$/;
const placeholder = z.string().regex(PLACEHOLDER);

/** §0: a placeholder anywhere else fails that field's rule. */
export const PLACEHOLDER_REFUSED =
  "is a placeholder; only routing.yaml's Bedrock model and a prices.yaml entry's model and prices may hold one";

/** The paths, below `path`, of every placeholder in a value: its strings, and its mappings' keys. */
export function placeholdersIn(value: unknown, path: string): string[] {
  if (typeof value === "string") return PLACEHOLDER.test(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => placeholdersIn(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(PLACEHOLDER.test(k) ? [`${path}.${k}`] : []),
    ...placeholdersIn(v, `${path}.${k}`),
  ]);
}

const PROVIDER_ERROR_KIND_SET: Record<ProviderErrorKind, true> = {
  unavailable: true,
  timeout: true,
  rate_limited: true,
  auth: true,
  bad_request: true,
  content_filtered: true,
  provider_error: true,
};
export const PROVIDER_ERROR_KINDS = Object.keys(PROVIDER_ERROR_KIND_SET) as ProviderErrorKind[];

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const envKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

/**
 * A paid adapter's `temperature` setting: whether its model takes the request's temperature (spec 010 FR-017, built
 * early for spec 007's live runs). `as_requested`, the default when the key is absent, sends it as given;
 * `model_default` sends none, whatever the request carries, so the model's own default applies. Claude Haiku 5.5
 * "takes no temperature but its default, 1" (provider-adapter.md §5.4), and refuses any other with a 400.
 */
export const PAID_TEMPERATURE = ["as_requested", "model_default"] as const;
export type PaidTemperature = (typeof PAID_TEMPERATURE)[number];
const paidTemperature = z.enum(PAID_TEMPERATURE).optional();

/** The temperature a paid adapter sends: the request's, unless its `temperature` setting is `model_default`. */
export function sentTemperature(
  setting: PaidTemperature | undefined,
  requested: number | undefined,
): number | undefined {
  return setting === "model_default" ? undefined : requested;
}

/**
 * A compose service's name: one DNS label that starts with a letter. A label of digits, or of hex or octal digits
 * after a 0, is an IPv4 address to URL parsing and to getaddrinfo (http://2852039166/ is 169.254.169.254), so a label
 * that doesn't start with a letter is never in-stack.
 */
export const SERVICE_LABEL = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A service name, checked again as a URL parser reads it: the host must come back unchanged, and not an address. */
export function isServiceHost(host: string): boolean {
  if (!SERVICE_LABEL.test(host)) return false;
  try {
    const parsed = new URL(`http://${host}/`).hostname;
    return parsed === host && isIP(parsed) === 0;
  } catch {
    return false;
  }
}

/** An in-stack service: http, a service host, an optional port and path, and nothing else (provider-adapter.md §3.1). */
export const IN_STACK_URL = /^http:\/\/([a-z][a-z0-9-]{0,62})(?::([0-9]{1,5}))?(?:\/[A-Za-z0-9._~/-]*)?$/;

export function isInStackUrl(url: string): boolean {
  const m = IN_STACK_URL.exec(url);
  if (!m || !isServiceHost(m[1] as string)) return false;
  if (m[2] !== undefined && Number(m[2]) > 65_535) return false;
  try {
    return new URL(url).hostname === m[1];
  } catch {
    return false;
  }
}

const get = (settings: Record<string, unknown>, ...path: string[]): unknown =>
  path.reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], settings);
const num = (settings: Record<string, unknown>, ...path: string[]): number => get(settings, ...path) as number;
const str = (settings: Record<string, unknown>, ...path: string[]): string => get(settings, ...path) as string;

const openAICompatible: AdapterTypeSpec = {
  type: "openai-compatible",
  // In spec 000 this type serves only the in-stack model server. A paid OpenAI-compatible API would add `paid`
  // here, with https and an api_key_env setting, inside its own module (provider-adapter.md §4).
  kinds: ["local"],
  settings: z.strictObject({
    provider: z.string().min(1),
    base_url_env: envKey,
    model_env: envKey,
    timeouts: z.strictObject({ connect_ms: int(100, 5_000), request_ms: int(1_000, 60_000) }),
    health: z.strictObject({
      path: z.string().startsWith("/"),
      interval_ms: int(250, 60_000),
      timeout_ms: z.number().int().min(100),
      unhealthy_after: int(1, 10),
      healthy_after: int(1, 10),
    }),
  }),
  provider: (s) => str(s, "provider"),
  model: (s, env) => env[str(s, "model_env")],
  timing: (s) => ({ requestMs: num(s, "timeouts", "request_ms"), retryMax: 0, backoffMs: 0 }),
  // §3.1: every interval_ms within timeout_ms; unhealthy after unhealthy_after failures, healthy after healthy_after.
  healthCadence: (s) => ({
    intervalMs: num(s, "health", "interval_ms"),
    timeoutMs: num(s, "health", "timeout_ms"),
    unhealthyAfter: num(s, "health", "unhealthy_after"),
    healthyAfter: num(s, "health", "healthy_after"),
  }),
  check(s, kind) {
    const findings: SettingsFinding[] = [];
    if (kind === "local" && str(s, "provider") !== "local") {
      findings.push({ path: "provider", rule: "R11", message: 'must be "local" when kind is local' });
    }
    if (num(s, "health", "timeout_ms") >= num(s, "health", "interval_ms")) {
      findings.push({ path: "health.timeout_ms", rule: "R11", message: "must be less than health.interval_ms" });
    }
    return findings;
  },
  checkEnv(s, env) {
    const refusals: SettingsRefusal[] = [];
    for (const field of ["base_url_env", "model_env"] as const) {
      const key = str(s, field);
      const value = env[key];
      if (value === undefined || value === "") {
        refusals.push({ reason: "missing_env", key, message: `${key} is unset; routing.yaml's ${field} names it` });
      } else if (field === "base_url_env" && !isInStackUrl(value)) {
        refusals.push({
          reason: "local_url_not_in_stack",
          key,
          message: `${key} isn't http://<single-label host>[:port][/path], an in-stack service`,
        });
      }
    }
    return refusals;
  },
};

const bedrockConverse: AdapterTypeSpec = {
  type: "bedrock-converse",
  kinds: ["paid"],
  settings: z.strictObject({
    region: z.string(),
    model: z.union([z.string().regex(/^[a-z0-9][a-z0-9.:-]{2,127}$/), placeholder]),
    additional_request_fields: z.record(z.string(), z.unknown()),
    temperature: paidTemperature,
    timeouts: z.strictObject({ connect_ms: int(100, 2_000), request_ms: int(1_000, 4_000) }),
    retry: z.strictObject({
      on: z.array(z.enum(PROVIDER_ERROR_KINDS as [ProviderErrorKind, ...ProviderErrorKind[]])),
      max: int(0, 1),
      backoff_ms: int(0, 2_000),
    }),
    circuit: z.strictObject({ failures: int(1, 10), open_s: int(5, 600) }),
    health: z.strictObject({ interval_ms: int(1_000, 60_000) }),
    credentials_warn_before_s: int(600, 86_400),
  }),
  provider: () => "aws.bedrock",
  model: (s) => str(s, "model"),
  timing: (s) => ({
    requestMs: num(s, "timeouts", "request_ms"),
    retryMax: num(s, "retry", "max"),
    backoffMs: num(s, "retry", "backoff_ms"),
  }),
  // §3.2: every interval_ms; one failure makes it unhealthy and one pass healthy. The probe resolves credentials and
  // never calls Bedrock, within 5 s or the interval, whichever is shorter.
  healthCadence: (s) => ({
    intervalMs: num(s, "health", "interval_ms"),
    timeoutMs: Math.min(5_000, num(s, "health", "interval_ms") - 1),
    unhealthyAfter: 1,
    healthyAfter: 1,
  }),
  check(s) {
    const findings: SettingsFinding[] = [];
    if (str(s, "region") !== "us-east-1") {
      findings.push({
        path: "region",
        rule: "R7",
        message: "must be us-east-1, the region docs/data-flow-disclosure.md lists",
        requirement: "FR-040",
      });
    }
    if (num(s, "timeouts", "connect_ms") + num(s, "timeouts", "request_ms") > 5_000) {
      findings.push({
        path: "timeouts",
        rule: "R8",
        message: "connect_ms + request_ms must be at most 5000",
        requirement: "SC-005",
      });
    }
    if (Buffer.byteLength(JSON.stringify(get(s, "additional_request_fields"))) > 1_024) {
      findings.push({ path: "additional_request_fields", rule: "R11", message: "must be at most 1 KB as JSON" });
    }
    for (const path of placeholdersIn(get(s, "additional_request_fields"), "additional_request_fields")) {
      findings.push({ path, rule: "R11", message: PLACEHOLDER_REFUSED });
    }
    return findings;
  },
  checkEnv: () => [],
  label: "Bedrock",
  credentialsWarnMs: (s) => num(s, "credentials_warn_before_s") * 1_000,
  circuit: (s) => ({ failures: num(s, "circuit", "failures"), openMs: num(s, "circuit", "open_s") * 1_000 }),
};

const synthetic: AdapterTypeSpec = {
  type: "synthetic",
  kinds: ["synthetic"],
  settings: z.strictObject({
    model: z.string().regex(/^[a-z0-9-]{1,64}$/),
    output_tokens: int(1, 100_000),
  }),
  provider: () => "synthetic",
  model: (s) => str(s, "model"),
  timing: () => ({ requestMs: 0, retryMax: 0, backoffMs: 0 }),
  // §3.3: always healthy, as it never touches the network; checked like any adapter so its gauge reports.
  healthCadence: () => ({ intervalMs: 10_000, timeoutMs: 1_000, unhealthyAfter: 1, healthyAfter: 1 }),
  check: () => [],
  checkEnv: () => [],
};

/** Every adapter type the configuration contract describes. */
export const ADAPTER_TYPE_SPECS: ReadonlyMap<string, AdapterTypeSpec> = new Map(
  [openAICompatible, bedrockConverse, synthetic].map((spec) => [spec.type, spec]),
);

/**
 * The types this build registers: a routing.yaml adapter of any other type fails rule R6. The file grows in steps,
 * so every adapter it defines is registered when it lands (config-files.md §1.2): the foundations branch registered
 * openai-compatible, T073 adds synthetic, and T102 adds bedrock-converse, each with its module.
 */
export const REGISTERED_ADAPTER_TYPES: ReadonlySet<string> = new Set([
  "openai-compatible",
  "synthetic",
  "bedrock-converse",
]);
