// The gateway's configuration rules (contracts/config-files.md §1–§4), the cross-file checks, and the startup
// refusals that combine the files with the stack's environment (§1.4, §2.5). validate-config and the gateway's own
// startup both run this module, so the gate and the runtime can't disagree (§5).
import { z } from "zod";

import {
  ADAPTER_TYPE_SPECS,
  PLACEHOLDER,
  PLACEHOLDER_REFUSED,
  REGISTERED_ADAPTER_TYPES,
  isServiceHost,
  type AdapterTypeSpec,
  type Env,
} from "../adapters/_settings.js";
import type { AdapterKind } from "../core/types.js";
import {
  formatIssue,
  formatPath,
  readConfigDir,
  type ConfigFileName,
  type ConfigIssue,
  type ParsedYaml,
  type PathSegment,
  type PlannedFiles,
} from "./load.js";

// ---------------------------------------------------------------------------------------------------------------
// Issues, and zod's turned into the contract's wording
// ---------------------------------------------------------------------------------------------------------------

class Findings {
  readonly issues: ConfigIssue[] = [];
  constructor(readonly file: string) {}

  error(path: string, rule: string, message: string, requirement?: string): void {
    this.issues.push({
      severity: "error",
      file: this.file,
      path,
      rule,
      message,
      ...(requirement ? { requirement } : {}),
    });
  }

  note(path: string, rule: string, message: string): void {
    this.issues.push({ severity: "note", file: this.file, path, rule, message });
  }

  get failed(): boolean {
    return this.issues.some((i) => i.severity === "error");
  }
}

const KIND_WORDS: Record<string, string> = {
  int: "a whole number",
  number: "a number",
  string: "a string",
  boolean: "true or false",
  object: "a mapping",
  record: "a mapping",
  array: "a list",
};

const plural = (n: number | bigint, word: string): string => `${n} ${word}${n === 1 || n === 1n ? "" : "s"}`;

function present(root: unknown, path: readonly PropertyKey[]): boolean {
  let at: unknown = root;
  for (const key of path) {
    if (at === null || typeof at !== "object" || !(key in at)) return false;
    at = (at as Record<PropertyKey, unknown>)[key];
  }
  return at !== undefined;
}

function describe(issue: z.core.$ZodIssue, root: unknown): string {
  if ((issue.code === "invalid_type" || issue.code === "invalid_value") && !present(root, issue.path)) {
    return "is required";
  }
  switch (issue.code) {
    case "invalid_type":
      return `must be ${KIND_WORDS[issue.expected] ?? issue.expected}`;
    case "too_small":
      if (issue.origin === "array") return `must have at least ${plural(issue.minimum, "item")}`;
      if (issue.origin === "string") return issue.minimum === 1 ? "must not be empty" : "is too short";
      return issue.inclusive === false ? `must be more than ${issue.minimum}` : `must be at least ${issue.minimum}`;
    case "too_big":
      if (issue.origin === "array") return `must have at most ${plural(issue.maximum, "item")}`;
      if (issue.origin === "string") return "is too long";
      return issue.inclusive === false ? `must be less than ${issue.maximum}` : `must be at most ${issue.maximum}`;
    case "invalid_value":
      return `must be ${issue.values.map((v) => JSON.stringify(v)).join(" or ")}`;
    case "invalid_format":
      if (issue.format === "regex" && issue.pattern !== undefined) {
        return `must match ${issue.pattern.replace(/^\/(.*)\/[a-z]*$/, "$1")}`;
      }
      if (issue.format === "starts_with")
        return `must start with ${JSON.stringify((issue as { prefix?: string }).prefix)}`;
      return `must be a valid ${issue.format}`;
    case "invalid_union":
      return "has the wrong type";
    default:
      return issue.message;
  }
}

/** Validate `value` (found at `base` in the file) with `schema`, reporting every zod issue by its path. */
function check<T>(
  out: Findings,
  schema: z.ZodType<T>,
  value: unknown,
  base: readonly PathSegment[],
  ruleFor: (path: string) => string,
): T | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const path = [...base, ...(issue.path as PathSegment[])];
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) out.error(formatPath([...path, key]), ruleFor(formatPath(path)), "unknown key");
    } else {
      out.error(formatPath(path), ruleFor(formatPath(path)), describe(issue, value));
    }
  }
  return undefined;
}

const isMapping = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const int = (min: number, max?: number) => {
  const base = z.number().int().min(min);
  return max === undefined ? base : base.max(max);
};

// ---------------------------------------------------------------------------------------------------------------
// Decimals: USD amounts, prices, and the warning ratio, converted from their source text, never through a float
// ---------------------------------------------------------------------------------------------------------------

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

type Decimal = { ok: true; scaled: bigint } | { ok: false; problem: "decimals" | "format" };

/** "5.00" at 6 places is 5,000,000n. More places than allowed, a sign, or an exponent are refused. */
function scaleDecimal(text: string, places: number): Decimal {
  const m = DECIMAL.exec(text);
  if (!m) return { ok: false, problem: "format" };
  const whole = m[1] ?? "0";
  const fraction = m[2] ?? "";
  if (fraction.length > places) return { ok: false, problem: "decimals" };
  return { ok: true, scaled: BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0") || "0") };
}

/** A number's source text (the YAML scalar as written), or a string's own text. */
function decimalText(value: unknown, sources: ReadonlyMap<string, string>, path: string): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return sources.get(path) ?? String(value);
  return undefined;
}

type Amount = { kind: "micro"; micro: bigint } | { kind: "placeholder" } | { kind: "invalid" };

/** A USD amount: a number or a decimal string, at least 0, with at most 6 decimal places (§0). */
function amount(
  out: Findings,
  value: unknown,
  sources: ReadonlyMap<string, string>,
  path: string,
  rule: string,
  opts: { placeholders: boolean; max?: bigint; message: string },
): Amount {
  if (opts.placeholders && typeof value === "string" && PLACEHOLDER.test(value)) return { kind: "placeholder" };
  const text = decimalText(value, sources, path);
  const scaled = text === undefined ? undefined : scaleDecimal(text, 6);
  if (!scaled?.ok || (opts.max !== undefined && scaled.scaled > opts.max)) {
    out.error(path, rule, opts.message);
    return { kind: "invalid" };
  }
  return { kind: "micro", micro: scaled.scaled };
}

// ---------------------------------------------------------------------------------------------------------------
// §1 routing.yaml
// ---------------------------------------------------------------------------------------------------------------

export type EnvClass = "prod" | "dev";
export const ENV_CLASSES: readonly EnvClass[] = ["prod", "dev"];

export interface AdapterConfig {
  readonly id: string;
  readonly type: string;
  readonly kind: AdapterKind;
  readonly provider: string;
  /** Its settings, checked against its type's schema: every key besides `type` and `kind`. */
  readonly settings: Readonly<Record<string, unknown>>;
  readonly spec: AdapterTypeSpec;
  /** Paths of placeholder values, such as "adapters.bedrock.model". */
  readonly placeholders: readonly string[];
}

export interface Route {
  readonly primary: string;
  readonly fallback?: string;
}

export interface RoutingConfig {
  readonly deadlineMs: number;
  readonly adapters: ReadonlyMap<string, AdapterConfig>;
  readonly envs: Readonly<Record<EnvClass, Route>>;
  /** SHA-256 of the file's bytes: h4.routing.sha on every span and ledger row. */
  readonly sha256: string;
}

export interface RoutingOptions {
  /** The adapter types this build registers (rule R6). */
  registeredTypes?: ReadonlySet<string>;
  specs?: ReadonlyMap<string, AdapterTypeSpec>;
}

const ADAPTER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const KINDS: readonly AdapterKind[] = ["local", "paid", "synthetic"];
const ROUTE = z.strictObject({ primary: z.string().min(1), fallback: z.string().min(1).optional() });

function placeholderPaths(value: unknown, path: PathSegment[]): string[] {
  if (typeof value === "string") return PLACEHOLDER.test(value) ? [formatPath(path)] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => placeholderPaths(v, [...path, i]));
  if (isMapping(value)) return Object.entries(value).flatMap(([k, v]) => placeholderPaths(v, [...path, k]));
  return [];
}

export function validateRouting(
  parsed: ParsedYaml,
  opts: RoutingOptions = {},
): { value?: RoutingConfig; issues: ConfigIssue[] } {
  if (parsed.issues.length > 0) return { issues: parsed.issues };
  const registered = opts.registeredTypes ?? REGISTERED_ADAPTER_TYPES;
  const specs = opts.specs ?? ADAPTER_TYPE_SPECS;
  const out = new Findings(parsed.file);
  const R11 = () => "R11";
  const data = parsed.data;
  if (!isMapping(data)) {
    out.error("", "R11", "must be a mapping");
    return { issues: out.issues };
  }
  for (const key of Object.keys(data)) {
    if (!["schema", "deadline_ms", "adapters", "envs"].includes(key)) out.error(key, "R11", "unknown key");
  }
  check(out, z.literal(1), data.schema, ["schema"], R11);
  const deadlineMs = check(out, int(5_000, 25_000), data.deadline_ms, ["deadline_ms"], R11);

  // Adapters.
  const adapters = new Map<string, AdapterConfig>();
  const defined = new Set<string>();
  if (!isMapping(data.adapters)) {
    out.error("adapters", "R11", present(data, ["adapters"]) ? "must be a mapping" : "is required");
  } else {
    for (const [id, raw] of Object.entries(data.adapters)) {
      defined.add(id);
      const at = `adapters.${id}`;
      if (!ADAPTER_ID.test(id)) out.error(at, "R11", `adapter IDs match ${ADAPTER_ID.source}`);
      if (!isMapping(raw)) {
        out.error(at, "R11", "must be a mapping");
        continue;
      }
      const { type, kind, ...settings } = raw;
      if (typeof type !== "string") {
        out.error(`${at}.type`, "R11", present(raw, ["type"]) ? "must be a string" : "is required");
        continue;
      }
      const spec = specs.get(type);
      if (!registered.has(type) || spec === undefined) {
        out.error(`${at}.type`, "R6", `"${type}" isn't a registered adapter type`, "FR-021");
        continue;
      }
      if (typeof kind !== "string" || !KINDS.includes(kind as AdapterKind)) {
        out.error(`${at}.kind`, "R11", present(raw, ["kind"]) ? "must be local, paid, or synthetic" : "is required");
        continue;
      }
      if (!spec.kinds.includes(kind as AdapterKind)) {
        out.error(`${at}.kind`, "R5", `"${kind}" isn't allowed for type "${type}"`, "FR-031");
        continue;
      }
      const ok = check(out, spec.settings, settings, ["adapters", id], R11) as Record<string, unknown> | undefined;
      if (ok === undefined) continue;
      const findings = spec.check(ok, kind as AdapterKind);
      for (const f of findings) out.error(`${at}.${f.path}`, f.rule, f.message, f.requirement);
      if (findings.length > 0 || !ADAPTER_ID.test(id)) continue;
      adapters.set(id, {
        id,
        type,
        kind: kind as AdapterKind,
        provider: spec.provider(ok),
        settings: ok,
        spec,
        placeholders: placeholderPaths(settings, ["adapters", id]),
      });
    }
  }

  // Routes.
  const routes: Partial<Record<EnvClass, Route>> = {};
  if (!isMapping(data.envs)) {
    out.error("envs", "R11", present(data, ["envs"]) ? "must be a mapping" : "is required");
  } else {
    const keys = Object.keys(data.envs).sort();
    if (keys.length !== 2 || keys[0] !== "dev" || keys[1] !== "prod") {
      out.error("envs", "R10", "must have exactly the keys prod and dev");
    }
    for (const env of ENV_CLASSES) {
      if (!(env in data.envs)) continue;
      const route = check(out, ROUTE, data.envs[env], ["envs", env], R11);
      if (route === undefined) continue;
      let ok = true;
      for (const role of ["primary", "fallback"] as const) {
        const id = route[role];
        if (id === undefined) continue;
        const at = `envs.${env}.${role}`;
        if (!defined.has(id)) {
          out.error(at, "R4", `names "${id}", which isn't defined under adapters`);
          ok = false;
          continue;
        }
        const adapter = adapters.get(id);
        if (adapter === undefined) {
          ok = false; // its own errors are already reported
          continue;
        }
        if (role === "primary" && adapter.kind !== "local") {
          out.error(at, "R1", `names "${id}", a ${adapter.kind} adapter; every primary must be local`, "FR-022");
          ok = false;
        } else if (role === "fallback" && env === "dev" && adapter.kind === "paid") {
          out.error(
            at,
            "R2",
            `names "${id}", a paid adapter; a paid adapter may be routed only in envs.prod`,
            "FR-031",
          );
          ok = false;
        } else if (role === "fallback" && env === "prod" && adapter.kind === "synthetic") {
          out.error(at, "R3", `names "${id}", a synthetic adapter; synthetic spend exists only in dev`, "FR-036");
          ok = false;
        } else if (role === "fallback" && adapter.kind === "local") {
          const wanted = env === "prod" ? "paid" : "synthetic";
          out.error(at, "R11", `names "${id}", a local adapter; ${env}'s fallback must be a ${wanted} adapter`);
          ok = false;
        }
      }
      if (ok) {
        routes[env] =
          route.fallback === undefined
            ? { primary: route.primary }
            : { primary: route.primary, fallback: route.fallback };
      }
    }
  }

  // R9: the deadline covers the route's timeouts: hello's, the primary's request, 500 ms, then the fallback's attempts
  // with their backoff; and, amended by spec 007's plan, D43, a twin turn's, the primary's request, 500 ms, then one
  // attempt of the fallback's twin_request_ms (local 10,000 + 500 + 9,000 = 19,500 in the committed file).
  if (deadlineMs !== undefined) {
    let needed = 0;
    for (const env of ENV_CLASSES) {
      const route = routes[env];
      const primary = route && adapters.get(route.primary);
      if (!route || !primary) continue;
      let n = primary.spec.timing(primary.settings).requestMs + 500;
      let twin = n;
      const fallback = route.fallback === undefined ? undefined : adapters.get(route.fallback);
      if (fallback) {
        const t = fallback.spec.timing(fallback.settings);
        n += t.requestMs * (1 + t.retryMax) + t.backoffMs;
        twin += t.twinRequestMs ?? t.requestMs * (1 + t.retryMax) + t.backoffMs;
      }
      needed = Math.max(needed, n, twin);
    }
    if (deadlineMs < needed)
      out.error("deadline_ms", "R9", `${deadlineMs} is shorter than the route's timeouts allow (${needed})`);
  }

  // Placeholders: a NOTE each; a route that uses one refuses to start (checkStartup).
  const routed = new Set(Object.values(routes).flatMap((r) => [r.primary, r.fallback]));
  for (const adapter of adapters.values()) {
    for (const path of adapter.placeholders) {
      out.note(
        path,
        "PLACEHOLDER",
        routed.has(adapter.id)
          ? "placeholder; the route that names this adapter can't start until the Author fills it"
          : "placeholder; no route names it until the Author fills it",
      );
    }
  }

  if (out.failed || deadlineMs === undefined || !routes.prod || !routes.dev) return { issues: out.issues };
  return {
    value: { deadlineMs, adapters, envs: { prod: routes.prod, dev: routes.dev }, sha256: parsed.sha256 },
    issues: out.issues,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// §2 prices.yaml
// ---------------------------------------------------------------------------------------------------------------

export type PriceField = "input" | "output" | "cache_read_input";

export interface PriceEntry {
  readonly provider: string;
  readonly model: string;
  /** Integer micro-USD per million tokens. 0n where `placeholders` names the field. */
  readonly input: bigint;
  readonly output: bigint;
  /** The input price when the entry gives none: that never undercounts (§2.1). */
  readonly cacheReadInput: bigint;
  /** The fields that still hold a placeholder, "model" included. */
  readonly placeholders: readonly (PriceField | "model")[];
}

export interface PriceVersion {
  readonly id: string;
  readonly effectiveFrom: number; // epoch ms
  readonly source: string;
  readonly entries: readonly PriceEntry[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
}

/** The cost of a call: the sum, rounded up to the next micro-USD once, never per term (§2.3). BigInt throughout. */
export function costMicro(entry: PriceEntry, usage: Usage): bigint {
  if (entry.placeholders.length > 0) throw new Error(`the price of ${entry.provider}/${entry.model} is a placeholder`);
  for (const n of [usage.inputTokens, usage.outputTokens, usage.cacheReadInputTokens ?? 0]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("token counts are non-negative integers");
  }
  const sum =
    BigInt(usage.inputTokens) * entry.input +
    BigInt(usage.outputTokens) * entry.output +
    BigInt(usage.cacheReadInputTokens ?? 0) * entry.cacheReadInput;
  return (sum + 999_999n) / 1_000_000n;
}

/** The versioned price table (FR-023). */
export class PriceTable {
  constructor(readonly versions: readonly PriceVersion[]) {}

  /** The latest version whose effective_from is at or before the gateway clock; looked up on every call. */
  active(nowMs: number): PriceVersion | undefined {
    let found: PriceVersion | undefined;
    for (const v of this.versions) if (v.effectiveFrom <= nowMs) found = v;
    return found;
  }

  /** The versions after this one: each takes over by itself on its date. */
  later(version: PriceVersion): PriceVersion[] {
    return this.versions.filter((v) => v.effectiveFrom > version.effectiveFrom);
  }

  /** The exact (provider, model) first, then (provider, "*"). */
  static lookup(version: PriceVersion, provider: string, model: string): PriceEntry | undefined {
    return (
      version.entries.find((e) => e.provider === provider && e.model === model) ??
      version.entries.find((e) => e.provider === provider && e.model === "*")
    );
  }
}

const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;

/** An RFC 3339 time in UTC (Z) that names a real instant: 2026-02-30 is refused. */
export function parseUtcTimestamp(text: string): number | undefined {
  const m = RFC3339_UTC.exec(text);
  if (!m) return undefined;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return undefined;
  const d = new Date(ms);
  const same =
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) &&
    d.getUTCDate() === Number(m[3]) &&
    d.getUTCHours() === Number(m[4]) &&
    d.getUTCMinutes() === Number(m[5]) &&
    d.getUTCSeconds() === Number(m[6]);
  return same ? ms : undefined;
}

/** A string field whose rule allows no placeholder (§0). */
const filled = (schema: z.ZodString = z.string()) =>
  schema.refine((s) => !PLACEHOLDER.test(s), { error: PLACEHOLDER_REFUSED });

const PRICE = z.union([z.number(), z.string()]);
const PRICES_TOP = z.strictObject({
  schema: z.literal(1),
  currency: z.literal("USD"),
  unit: z.literal("per_million_tokens"),
  versions: z
    .array(
      z.strictObject({
        id: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
        effective_from: z.string().refine((s) => parseUtcTimestamp(s) !== undefined, {
          error: "must be an RFC 3339 time in UTC, such as 2026-10-08T00:00:00Z",
        }),
        source: filled(z.string().min(1)),
        entries: z
          .array(
            z.strictObject({
              provider: filled(z.string().min(1)),
              model: z.string().min(1),
              input: PRICE,
              output: PRICE,
              cache_read_input: PRICE.optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const MAX_PRICE = 1_000n * 1_000_000n;

export function validatePrices(parsed: ParsedYaml): { value?: PriceTable; issues: ConfigIssue[] } {
  if (parsed.issues.length > 0) return { issues: parsed.issues };
  const out = new Findings(parsed.file);
  const doc = check(out, PRICES_TOP, parsed.data, [], () => "P6");
  if (doc === undefined) return { issues: out.issues };

  const versions: PriceVersion[] = [];
  doc.versions.forEach((v, i) => {
    const entries: PriceEntry[] = [];
    const seen = new Set<string>();
    v.entries.forEach((e, j) => {
      const at = `versions[${i}].entries[${j}]`;
      const placeholders: (PriceField | "model")[] = [];
      if (PLACEHOLDER.test(e.model)) placeholders.push("model");
      const prices: Partial<Record<PriceField, bigint>> = {};
      for (const field of ["input", "output", "cache_read_input"] as const) {
        const value = e[field];
        if (value === undefined) continue;
        const a = amount(out, value, parsed.numberSources, `${at}.${field}`, "P2", {
          placeholders: true,
          max: MAX_PRICE,
          message: "at most 6 decimal places, from 0 to 1000",
        });
        if (a.kind === "placeholder") placeholders.push(field);
        if (a.kind === "micro") prices[field] = a.micro;
      }
      for (const field of placeholders)
        out.note(
          `${at}.${field}`,
          "PLACEHOLDER",
          "placeholder; a route that uses this entry can't start until the Author fills it",
        );
      if (e.model === "*") {
        const allZero = placeholders.length === 0 && Object.values(prices).every((p) => p === 0n);
        if (!allZero) out.error(`${at}.model`, "P3", '"*" is allowed only when every price in the entry is 0');
      }
      const key = `${e.provider}/${e.model}`;
      if (seen.has(key)) out.error(`versions[${i}].entries`, "P4", `provider and model "${key}" appear twice`);
      seen.add(key);
      const input = prices.input ?? 0n;
      entries.push({
        provider: e.provider,
        model: e.model,
        input,
        output: prices.output ?? 0n,
        cacheReadInput: e.cache_read_input === undefined ? input : (prices.cache_read_input ?? 0n),
        placeholders,
      });
    });
    versions.push({
      id: v.id,
      effectiveFrom: parseUtcTimestamp(v.effective_from) as number,
      source: v.source,
      entries,
    });
  });

  const ids = new Set<string>();
  let increasing = true;
  versions.forEach((v, i) => {
    if (ids.has(v.id)) increasing = false;
    ids.add(v.id);
    const previous = versions[i - 1];
    if (previous && v.effectiveFrom <= previous.effectiveFrom) increasing = false;
  });
  if (!increasing) out.error("versions", "P1", "effective_from must strictly increase, and ids must be unique");

  return out.failed ? { issues: out.issues } : { value: new PriceTable(versions), issues: out.issues };
}

/**
 * P5, append-only: when `main` has the file, its versions must open this file's list unchanged and in order.
 * `main` is main's config/prices.yaml, parsed, or undefined when there is no git or main has no such file.
 */
export function checkPricesAppendOnly(current: ParsedYaml, main: ParsedYaml | undefined): ConfigIssue[] {
  const out = new Findings(current.file);
  if (main === undefined) {
    out.note("", "P5", "main has no config/prices.yaml yet, so the append-only check waits for it");
    return out.issues;
  }
  const versionsOf = (data: unknown): unknown[] | undefined =>
    isMapping(data) && Array.isArray(data.versions) ? data.versions : undefined;
  const mine = versionsOf(current.data);
  const theirs = main.issues.length > 0 ? undefined : versionsOf(main.data);
  if (mine === undefined) return out.issues; // the file's own errors are reported by validatePrices
  if (theirs === undefined) {
    out.note("", "P5", "main's config/prices.yaml doesn't parse, so the append-only check can't compare");
    return out.issues;
  }
  theirs.forEach((version, i) => {
    if (JSON.stringify(canonical(mine[i])) !== JSON.stringify(canonical(version))) {
      out.error(`versions[${i}]`, "P5", "differs from the same version on main; published versions never change");
    }
  });
  return out.issues;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isMapping(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// §3 budgets.yaml
// ---------------------------------------------------------------------------------------------------------------

export interface BudgetEnv {
  readonly dailyMicro: bigint;
  readonly monthlyMicro: bigint;
  readonly fallbackDailyMicro: bigint;
  /** warn_ratio in basis points: 0.70 is 7000. */
  readonly warnRatioBp: bigint;
  /** adapter_monthly_usd (spec 010, FR-021): each capped paid adapter's monthly cap, by its routing.yaml ID; absent
   *  when the file caps none. */
  readonly adapterMonthly?: ReadonlyMap<string, bigint>;
}

export interface Budgets {
  readonly timing: { readonly timezone: "UTC"; readonly reservationTtlS: number };
  readonly envs: Readonly<Record<EnvClass, BudgetEnv>>;
  readonly limits: {
    readonly perClient: {
      readonly requestsPerMinute: number;
      readonly burst: number;
      readonly requestsPerDay: number;
      readonly meteredInFlight: number;
    };
    readonly global: { readonly meteredInFlight: number; readonly meteredPerMinute: number };
    readonly perCall: {
      readonly maxInputChars: number;
      readonly helloMaxOutputTokens: number;
      readonly maxOutputTokens: number;
    };
    /** The twin's per-turn limits (spec 007, FR-027; Amendment 0-2): optional, the Author's patch P-2 sets them. */
    readonly twin?: TwinLimits;
  };
}

/** limits.twin (spec 007, FR-027): a visitor turn's characters, the turns and characters of conversation a request
 *  carries, a twin call's input bound (its reservation's too), and its output cap. */
export interface TwinLimits {
  readonly turnMaxChars: number;
  readonly historyMaxTurns: number;
  readonly historyMaxChars: number;
  readonly maxInputChars: number;
  readonly maxOutputTokens: number;
}

/** FR-027's defaults, which dev and dev-cpu use while config/budgets.yaml has no limits.twin. */
export const TWIN_LIMIT_DEFAULTS: TwinLimits = {
  turnMaxChars: 600,
  historyMaxTurns: 8,
  historyMaxChars: 4_000,
  maxInputChars: 32_000,
  maxOutputTokens: 300,
};

/** The derived thresholds, in micro-USD (§3.1). */
export interface Thresholds {
  readonly dayCeiling: bigint;
  readonly monthCeiling: bigint;
  /** The ceiling × warn_ratio, rounded down, so a warning never comes later than the ratio says. */
  readonly dayWarn: bigint;
  readonly monthWarn: bigint;
  /** fallback_daily_usd: the first grant's allowance, and what each renewal adds. */
  readonly fallbackGrant: bigint;
  /** A grant's warning: its allowance − (fallback_daily − fallback_daily × warn_ratio). */
  fallbackWarn(allowanceMicro: bigint): bigint;
  /** Each capped adapter's month (spec 010, FR-021): its cap, and the cap × warn_ratio, rounded down. */
  readonly adapterCaps: ReadonlyMap<string, { readonly cap: bigint; readonly warn: bigint }>;
}

export function thresholds(env: BudgetEnv): Thresholds {
  const warn = (micro: bigint): bigint => (micro * env.warnRatioBp) / 10_000n;
  const gap = env.fallbackDailyMicro - warn(env.fallbackDailyMicro);
  return {
    dayCeiling: env.dailyMicro,
    monthCeiling: env.monthlyMicro,
    dayWarn: warn(env.dailyMicro),
    monthWarn: warn(env.monthlyMicro),
    fallbackGrant: env.fallbackDailyMicro,
    fallbackWarn: (allowanceMicro) => allowanceMicro - gap,
    adapterCaps: new Map(
      [...(env.adapterMonthly ?? new Map<string, bigint>())].map(([id, cap]) => [id, { cap, warn: warn(cap) }]),
    ),
  };
}

const MONEY = z.union([z.number(), z.string()]);
const BUDGET_ENV = z.strictObject({
  daily_usd: MONEY,
  monthly_usd: MONEY,
  fallback_daily_usd: MONEY,
  warn_ratio: z.number(),
  // Spec 010's Amendment 0-4: optional; its keys and bounds are rule B9, checked below and across the files.
  adapter_monthly_usd: z.record(z.string(), z.unknown()).optional(),
});
const BUDGETS_TOP = z.strictObject({
  schema: z.literal(1),
  timing: z.strictObject({ timezone: z.string(), reservation_ttl_s: int(30, 600) }),
  envs: z.strictObject({ prod: BUDGET_ENV, dev: BUDGET_ENV }),
  limits: z.strictObject({
    per_client: z.strictObject({
      requests_per_minute: int(1, 600),
      burst: int(1),
      requests_per_day: int(1),
      metered_in_flight: int(1),
    }),
    global: z.strictObject({ metered_in_flight: int(1, 32), metered_per_minute: int(1, 600) }),
    per_call: z.strictObject({
      max_input_chars: int(100, 4_000),
      hello_max_output_tokens: int(1),
      max_output_tokens: int(1, 4_096),
    }),
    // Spec 007's Amendment 0-2: optional; the cross-field bounds are checked below.
    twin: z
      .strictObject({
        turn_max_chars: int(50, 2_000),
        history_max_turns: int(1, 20),
        history_max_chars: int(50, 16_000),
        max_input_chars: int(4_000, 64_000),
        max_output_tokens: int(32, 4_096),
      })
      .optional(),
  }),
});

/** Two envs' adapter caps, the same adapters at the same caps (B8 holds them too). */
function sameCaps(a: ReadonlyMap<string, bigint> = new Map(), b: ReadonlyMap<string, bigint> = new Map()): boolean {
  return a.size === b.size && [...a].every(([id, cap]) => b.get(id) === cap);
}

export function validateBudgets(parsed: ParsedYaml): { value?: Budgets; issues: ConfigIssue[] } {
  if (parsed.issues.length > 0) return { issues: parsed.issues };
  const out = new Findings(parsed.file);
  const doc = check(out, BUDGETS_TOP, parsed.data, [], (path) => (path.startsWith("limits") ? "B5" : "B7"));
  if (doc === undefined) return { issues: out.issues };

  if (doc.timing.timezone !== "UTC") out.error("timing.timezone", "B1", "must be UTC", "FR-031");

  const envs: Partial<Record<EnvClass, BudgetEnv>> = {};
  for (const env of ENV_CLASSES) {
    const raw = doc.envs[env];
    const at = `envs.${env}`;
    const usd = (field: "daily_usd" | "monthly_usd" | "fallback_daily_usd"): bigint | undefined => {
      const a = amount(out, raw[field], parsed.numberSources, `${at}.${field}`, "B7", {
        placeholders: false,
        message: "must be a USD amount: a number or a decimal string, at least 0, with at most 6 decimal places",
      });
      return a.kind === "micro" ? a.micro : undefined;
    };
    const daily = usd("daily_usd");
    const monthly = usd("monthly_usd");
    const fallback = usd("fallback_daily_usd");
    if (daily === 0n) out.error(`${at}.daily_usd`, "B7", "must be more than 0");
    if (fallback === 0n) out.error(`${at}.fallback_daily_usd`, "B7", "must be more than 0");
    if (daily !== undefined && monthly !== undefined && monthly < daily) {
      out.error(`${at}.monthly_usd`, "B3", "must be at least daily_usd");
    }
    if (daily !== undefined && fallback !== undefined && fallback > daily) {
      out.error(
        `${at}.fallback_daily_usd`,
        "B2",
        "must be at most daily_usd; the sub-budget counts inside the daily ceiling",
        "FR-030",
      );
    }
    const ratioPath = `${at}.warn_ratio`;
    const ratio = scaleDecimal(decimalText(raw.warn_ratio, parsed.numberSources, ratioPath) ?? "", 4);
    if (!ratio.ok || ratio.scaled <= 0n || ratio.scaled >= 10_000n) {
      out.error(ratioPath, "B4", "must be more than 0 and less than 1, with at most 4 decimal places");
    }
    // B9 (spec 010, FR-021): each cap more than 0 and at most monthly_usd, to the micro-dollar; its keys an adapter
    // ID's shape here, and a paid adapter of routing.yaml's across the files (validateConfigFiles).
    const adapterMonthly = new Map<string, bigint>();
    for (const [id, value] of Object.entries(raw.adapter_monthly_usd ?? {})) {
      const path = `${at}.adapter_monthly_usd.${id}`;
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
        out.error(path, "B9", "must be a paid adapter's ID in config/routing.yaml");
        continue;
      }
      const a = amount(out, value, parsed.numberSources, path, "B9", {
        placeholders: false,
        message: "must be a USD amount more than 0 and at most monthly_usd, with at most 6 decimal places",
      });
      if (a.kind !== "micro") continue;
      if (a.micro === 0n || (monthly !== undefined && a.micro > monthly)) {
        out.error(path, "B9", "must be more than 0 and at most monthly_usd; the cap counts inside the monthly ceiling");
        continue;
      }
      adapterMonthly.set(id, a.micro);
    }
    if (daily !== undefined && monthly !== undefined && fallback !== undefined && ratio.ok) {
      envs[env] = {
        dailyMicro: daily,
        monthlyMicro: monthly,
        fallbackDailyMicro: fallback,
        warnRatioBp: ratio.scaled,
        ...(adapterMonthly.size === 0 ? {} : { adapterMonthly }),
      };
    }
  }
  const { prod, dev } = envs;
  if (
    prod &&
    dev &&
    (prod.dailyMicro !== dev.dailyMicro ||
      prod.monthlyMicro !== dev.monthlyMicro ||
      prod.fallbackDailyMicro !== dev.fallbackDailyMicro ||
      prod.warnRatioBp !== dev.warnRatioBp ||
      !sameCaps(prod.adapterMonthly, dev.adapterMonthly))
  ) {
    out.error("envs.dev", "B8", "must equal envs.prod", "FR-031");
  }

  const pc = doc.limits.per_client;
  const g = doc.limits.global;
  const call = doc.limits.per_call;
  if (pc.burst > pc.requests_per_minute)
    out.error("limits.per_client.burst", "B5", "must be at most requests_per_minute");
  if (pc.requests_per_day < pc.requests_per_minute) {
    out.error("limits.per_client.requests_per_day", "B5", "must be at least requests_per_minute");
  }
  if (pc.metered_in_flight > g.metered_in_flight) {
    out.error("limits.per_client.metered_in_flight", "B5", "must be at most limits.global.metered_in_flight");
  }
  if (call.hello_max_output_tokens > call.max_output_tokens) {
    out.error("limits.per_call.hello_max_output_tokens", "B5", "must be at most max_output_tokens");
  }
  const twin = doc.limits.twin;
  if (twin !== undefined && twin.history_max_chars < twin.turn_max_chars) {
    out.error("limits.twin.history_max_chars", "B5", "must be at least turn_max_chars");
  }
  if (twin !== undefined && twin.max_output_tokens > call.max_output_tokens) {
    out.error("limits.twin.max_output_tokens", "B5", "must be at most limits.per_call.max_output_tokens");
  }

  if (out.failed || !prod || !dev) return { issues: out.issues };
  return {
    value: {
      timing: { timezone: "UTC", reservationTtlS: doc.timing.reservation_ttl_s },
      envs: { prod, dev },
      limits: {
        perClient: {
          requestsPerMinute: pc.requests_per_minute,
          burst: pc.burst,
          requestsPerDay: pc.requests_per_day,
          meteredInFlight: pc.metered_in_flight,
        },
        global: { meteredInFlight: g.metered_in_flight, meteredPerMinute: g.metered_per_minute },
        perCall: {
          maxInputChars: call.max_input_chars,
          helloMaxOutputTokens: call.hello_max_output_tokens,
          maxOutputTokens: call.max_output_tokens,
        },
        ...(twin === undefined
          ? {}
          : {
              twin: {
                turnMaxChars: twin.turn_max_chars,
                historyMaxTurns: twin.history_max_turns,
                historyMaxChars: twin.history_max_chars,
                maxInputChars: twin.max_input_chars,
                maxOutputTokens: twin.max_output_tokens,
              },
            }),
      },
    },
    issues: out.issues,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// §4 alerts.yaml
// ---------------------------------------------------------------------------------------------------------------

export type StackName = "prod" | "dev" | "dev-cpu";

export interface AlertsConfig {
  readonly channels: {
    readonly order: readonly ["telegram", "email"];
    readonly telegram: { readonly timeoutMs: number };
    readonly email: { readonly timeoutMs: number };
  };
  readonly retry: { readonly scheduleS: readonly number[]; readonly giveUpAfterS: number };
  readonly reminder: { readonly atUtc: string; readonly hour: number; readonly minute: number };
  readonly storeUnreachableAfterS: number;
  readonly authFailed: { readonly threshold: number; readonly windowS: number };
  readonly prefixes: Readonly<Record<StackName, string>>;
  readonly standin: { readonly telegramBase: string; readonly smtpHost: string; readonly smtpPort: number };
  /**
   * Each channel's form (spec 011, FR-031; rule A8): designed where the file says nothing. plain sends every alert in
   * its plain form, today's, with no fallback recorded: the Author's switch.
   */
  readonly formats: { readonly telegram: "designed" | "plain"; readonly email: "designed" | "plain" };
}

/** A stand-in is an in-network service: one label starting with a letter, never an address in any notation. */
const STANDIN_BASE = /^http:\/\/([a-z][a-z0-9-]{0,62})(?::([0-9]{1,5}))?$/;
const ALERTS_TOP = z.strictObject({
  schema: z.literal(1),
  channels: z.strictObject({
    order: z.array(z.string()),
    telegram: z.strictObject({ timeout_ms: int(1_000, 10_000) }),
    email: z.strictObject({ timeout_ms: int(1_000, 30_000) }),
  }),
  retry: z.strictObject({ schedule_s: z.array(int(1, 300)).min(1).max(8), give_up_after_s: int(1) }),
  reminder: z.strictObject({ at_utc: z.string() }),
  store_unreachable_after_s: int(10, 600),
  auth_failed: z.strictObject({ threshold: int(1, 100), window_s: int(60, 3_600) }),
  prefixes: z.record(z.string(), filled()),
  standin: z.strictObject({ telegram_base: z.string(), smtp_host: z.string(), smtp_port: int(1, 65_535) }),
  // Spec 011 (Amendment 0-10; rule A8): each channel designed or plain, and no other key.
  formats: z
    .strictObject({
      telegram: z.enum(["designed", "plain"]).optional(),
      email: z.enum(["designed", "plain"]).optional(),
    })
    .optional(),
});

export function validateAlerts(parsed: ParsedYaml): { value?: AlertsConfig; issues: ConfigIssue[] } {
  if (parsed.issues.length > 0) return { issues: parsed.issues };
  const out = new Findings(parsed.file);
  const doc = check(out, ALERTS_TOP, parsed.data, [], (path) => (/^formats\b/.test(path) ? "A8" : "A7"));
  if (doc === undefined) return { issues: out.issues };

  const order = doc.channels.order;
  if (order.length !== 2 || order[0] !== "telegram" || order[1] !== "email") {
    out.error("channels.order", "A1", "must be [telegram, email]", "FR-032: Telegram primary, email secondary");
  }
  const schedule = doc.retry.schedule_s;
  if (schedule.some((s, i) => i > 0 && s < (schedule[i - 1] as number))) {
    out.error("retry.schedule_s", "A7", "must never decrease");
  }
  const giveUp = doc.retry.give_up_after_s;
  if (giveUp > 300) out.error("retry.give_up_after_s", "A3", "at most 300", "FR-032: within 5 minutes");
  // Spec 011 (Amendment 0-10): an attempt that falls back to the plain form makes two sends, so the slowest timeout
  // counts twice.
  const lastStart = schedule.reduce((a, b) => a + b, 0);
  const lastRun = (2 * Math.max(doc.channels.telegram.timeout_ms, doc.channels.email.timeout_ms)) / 1_000;
  if (lastStart + lastRun > giveUp) {
    out.error(
      "retry",
      "A2",
      `the last attempt starts at ${lastStart} s and can run ${lastRun} s; both must fit in give_up_after_s (${giveUp} s)`,
    );
  }
  const reminder = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(doc.reminder.at_utc);
  if (!reminder) out.error("reminder.at_utc", "A4", "must be HH:MM");

  const p = doc.prefixes;
  const keys = Object.keys(p).sort();
  const values = Object.values(p);
  const prefixesOk =
    keys.join(",") === "dev,dev-cpu,prod" &&
    values.every((v) => v.length >= 1 && v.length <= 32) &&
    new Set(values).size === values.length;
  if (!prefixesOk) out.error("prefixes", "A5", "needs prod, dev, and dev-cpu, each distinct, of 1 to 32 characters");

  const base = STANDIN_BASE.exec(doc.standin.telegram_base);
  if (!base || !isServiceHost(base[1] as string) || (base[2] !== undefined && Number(base[2]) > 65_535)) {
    out.error("standin.telegram_base", "A6", "must be an in-network host (a single-label name): http://<host>[:port]");
  }
  if (!isServiceHost(doc.standin.smtp_host)) {
    out.error("standin.smtp_host", "A6", "must be an in-network host (a single-label name)");
  }

  if (out.failed || !reminder) return { issues: out.issues };
  return {
    value: {
      channels: {
        order: ["telegram", "email"],
        telegram: { timeoutMs: doc.channels.telegram.timeout_ms },
        email: { timeoutMs: doc.channels.email.timeout_ms },
      },
      retry: { scheduleS: schedule, giveUpAfterS: giveUp },
      reminder: { atUtc: doc.reminder.at_utc, hour: Number(reminder[1]), minute: Number(reminder[2]) },
      storeUnreachableAfterS: doc.store_unreachable_after_s,
      authFailed: { threshold: doc.auth_failed.threshold, windowS: doc.auth_failed.window_s },
      prefixes: { prod: p.prod as string, dev: p.dev as string, "dev-cpu": p["dev-cpu"] as string },
      standin: {
        telegramBase: doc.standin.telegram_base,
        smtpHost: doc.standin.smtp_host,
        smtpPort: doc.standin.smtp_port,
      },
      formats: { telegram: doc.formats?.telegram ?? "designed", email: doc.formats?.email ?? "designed" },
    },
    issues: out.issues,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The set of files: each file's rules, then the cross-file checks (§5 point 1)
// ---------------------------------------------------------------------------------------------------------------

export interface ConfigSet {
  routing?: RoutingConfig;
  prices?: PriceTable;
  budgets?: Budgets;
  alerts?: AlertsConfig;
  issues: ConfigIssue[];
}

export function validateConfigFiles(
  files: Partial<Record<ConfigFileName, ParsedYaml>>,
  opts: RoutingOptions = {},
): ConfigSet {
  const set: ConfigSet = { issues: [] };
  const routing = files["routing.yaml"] && validateRouting(files["routing.yaml"], opts);
  const prices = files["prices.yaml"] && validatePrices(files["prices.yaml"]);
  const budgets = files["budgets.yaml"] && validateBudgets(files["budgets.yaml"]);
  const alerts = files["alerts.yaml"] && validateAlerts(files["alerts.yaml"]);
  for (const result of [routing, prices, budgets, alerts]) if (result) set.issues.push(...result.issues);
  if (routing?.value) set.routing = routing.value;
  if (prices?.value) set.prices = prices.value;
  if (budgets?.value) set.budgets = budgets.value;
  if (alerts?.value) set.alerts = alerts.value;

  // B6: a reservation outlives its call, so the commit can retry (data-model.md §7.3).
  if (set.routing && set.budgets && set.budgets.timing.reservationTtlS * 1_000 <= 2 * set.routing.deadlineMs) {
    set.issues.push({
      severity: "error",
      file: "config/budgets.yaml",
      path: "timing.reservation_ttl_s",
      rule: "B6",
      message: "must be more than twice routing.yaml's deadline_ms in seconds",
    });
  }

  // B9 across the files (spec 010, FR-021): each adapter_monthly_usd key names a paid adapter in routing.yaml.
  if (set.routing && set.budgets) {
    for (const env of ENV_CLASSES) {
      for (const id of set.budgets.envs[env].adapterMonthly?.keys() ?? []) {
        if (set.routing.adapters.get(id)?.kind === "paid") continue;
        set.issues.push({
          severity: "error",
          file: "config/budgets.yaml",
          path: `envs.${env}.adapter_monthly_usd.${id}`,
          rule: "B9",
          message: `names "${id}", which isn't a paid adapter in config/routing.yaml`,
        });
      }
    }
  }

  // P7: a paid model is never free, in any version.
  if (set.routing && set.prices) {
    for (const adapter of set.routing.adapters.values()) {
      if (adapter.kind !== "paid") continue;
      const model = adapter.spec.model(adapter.settings, {});
      if (model === undefined || PLACEHOLDER.test(model)) continue;
      set.prices.versions.forEach((version, i) => {
        const entry = PriceTable.lookup(version, adapter.provider, model);
        if (!entry) return;
        const zero = (field: "input" | "output") => !entry.placeholders.includes(field) && entry[field] === 0n;
        if (zero("input") || zero("output")) {
          set.issues.push({
            severity: "error",
            file: "config/prices.yaml",
            path: `versions[${i}].entries[${version.entries.indexOf(entry)}]`,
            rule: "P7",
            message: `prices ${entry.provider}/${entry.model} at 0 for input or output, but routing.yaml's paid adapter "${adapter.id}" sends ${model}; a paid model is never free`,
          });
        }
      });
    }
  }
  return set;
}

export interface LoadedConfig extends ConfigSet {
  /** The files as read, for the checks that need their text, such as P5. */
  parsed: Partial<Record<ConfigFileName, ParsedYaml>>;
  /** Protected files a patch hasn't applied yet: only in validate-config's mode. */
  planned: { file: string; task: string }[];
}

/**
 * Read and validate a config directory: /app/config at startup, config/ for validate-config. `plannedFiles` replaces
 * the build's PLANNED marks in validate-config's mode (readConfigDir).
 */
export async function loadConfig(
  dir: string,
  opts: { allowPlanned: boolean; plannedFiles?: PlannedFiles } & RoutingOptions,
): Promise<LoadedConfig> {
  const files = await readConfigDir(dir, {
    allowPlanned: opts.allowPlanned,
    ...(opts.plannedFiles === undefined ? {} : { plannedFiles: opts.plannedFiles }),
  });
  const set = validateConfigFiles(files.parsed, opts);
  return { ...set, issues: [...files.issues, ...set.issues], parsed: files.parsed, planned: files.planned };
}

// ---------------------------------------------------------------------------------------------------------------
// Startup refusals that combine the files with the environment (§1.4, §2.5)
// ---------------------------------------------------------------------------------------------------------------

export interface StartupRefusal {
  /** The reason code, as config-files.md, env-files.md §11, and plan §5.8 name them. */
  reason: string;
  /** An env key, never its value. */
  key?: string;
  /** A config path: "config/routing.yaml: envs.prod.fallback". */
  path?: string;
  message: string;
}

/** The route H4_ENV selects: prod for prod, dev for dev and dev-cpu. */
export function routeFor(routing: RoutingConfig, env: EnvClass): AdapterConfig[] {
  const route = routing.envs[env];
  const ids = route.fallback === undefined ? [route.primary] : [route.primary, route.fallback];
  return ids.map((id) => routing.adapters.get(id)).filter((a): a is AdapterConfig => a !== undefined);
}

/**
 * The refusals of §1.4 and §2.5 for a gateway with this environment, at this gateway time. validate-env.ts checks the
 * environment on its own; this checks what the files mean for it.
 */
export function checkStartup(
  config: { routing: RoutingConfig; prices: PriceTable; budgets?: Budgets },
  env: Env,
  nowMs: number,
): StartupRefusal[] {
  const envClass = env.H4_ENV;
  if (envClass !== "prod" && envClass !== "dev") return []; // validate-env.ts refuses it
  const refusals: StartupRefusal[] = [];
  const route = routeFor(config.routing, envClass);
  for (const adapter of route) {
    const at = `config/routing.yaml: adapters.${adapter.id}`;
    if (adapter.kind === "paid" && envClass !== "prod") {
      refusals.push({
        reason: "paid_route_outside_prod",
        path: at,
        message: `the ${envClass} route names "${adapter.id}", a paid adapter, and only prod spends (FR-031)`,
      });
    }
    if (adapter.kind === "synthetic" && envClass === "prod") {
      refusals.push({
        reason: "synthetic_in_prod",
        path: at,
        message: `the prod route names "${adapter.id}", a synthetic adapter (FR-036)`,
      });
    }
    for (const path of adapter.placeholders) {
      refusals.push({
        reason: "placeholder_value",
        path: `config/routing.yaml: ${path}`,
        message: "the route uses a placeholder the Author hasn't filled",
      });
    }
    for (const r of adapter.spec.checkEnv(adapter.settings, env)) refusals.push({ ...r });
    // Spec 010 (FR-021): a type that needs a monthly cap is routed only with its cap in budgets.yaml.
    if (
      adapter.spec.monthlyCapRequired === true &&
      config.budgets !== undefined &&
      config.budgets.envs[envClass].adapterMonthly?.has(adapter.id) !== true
    ) {
      refusals.push({
        reason: "adapter_cap_missing",
        path: `config/budgets.yaml: envs.${envClass}.adapter_monthly_usd.${adapter.id}`,
        message: `the ${envClass} route names "${adapter.id}", ${adapter.spec.label ?? "a paid adapter"}, and budgets.yaml caps no month for it (spec 010, FR-021)`,
      });
    }
  }

  const active = config.prices.active(nowMs);
  if (active === undefined) {
    refusals.push({
      reason: "no_active_price_version",
      path: "config/prices.yaml: versions",
      message: "no version's effective_from is at or before the gateway clock",
    });
    return refusals;
  }
  for (const adapter of route) {
    if (adapter.kind === "local") continue;
    const model = adapter.spec.model(adapter.settings, env);
    if (model === undefined || PLACEHOLDER.test(model)) continue; // a placeholder model is refused above
    for (const version of [active, ...config.prices.later(active)]) {
      const entry = PriceTable.lookup(version, adapter.provider, model);
      if (!entry) {
        refusals.push({
          reason: "price_missing",
          path: `config/prices.yaml: ${version.id}`,
          message: `version ${version.id} has no price for ${adapter.provider}/${model}, which the ${envClass} route uses`,
        });
      } else if (entry.placeholders.length > 0) {
        refusals.push({
          reason: "placeholder_value",
          path: `config/prices.yaml: ${version.id}`,
          message: `the price of ${adapter.provider}/${model} in version ${version.id} is a placeholder`,
        });
      }
    }
  }
  return refusals;
}

/**
 * Everything that stops the gateway with exit 78 on account of its config: one invalid_config per error line, or,
 * with valid files, the refusals that combine them with the environment.
 */
export function startupRefusals(set: ConfigSet, env: Env, nowMs: number): StartupRefusal[] {
  const failed = set.issues.filter((i) => i.severity === "error");
  if (failed.length > 0) {
    return failed.map((i) => ({
      reason: "invalid_config",
      path: i.path === "" ? i.file : `${i.file}: ${i.path}`,
      message: formatIssue(i),
    }));
  }
  if (!set.routing || !set.prices || !set.budgets || !set.alerts) {
    return [{ reason: "invalid_config", message: "the configuration is incomplete" }];
  }
  return checkStartup({ routing: set.routing, prices: set.prices, budgets: set.budgets }, env, nowMs);
}
