// The adapter registry (contracts/provider-adapter.md §4).
//
// - At startup it imports every module in its own directory, dist/adapters/ in the container, except itself and the
//   helper modules whose names start with "_". Each module exports one factory, keyed by its routing.yaml type. A
//   module without a factory, or two modules with one type, stop startup with exit 1: the build itself is wrong.
// - It builds only the adapters this H4_ENV's route names. An unknown type, a kind the type doesn't allow, or settings
//   the factory's schema refuses, stop startup with exit 78, as a configuration error.
// - Each adapter sees only the env keys its own settings name (the `*_env` settings), never the rest of the
//   gateway's environment: no store password, operator hash, or alert credential reaches an adapter.
//
// Adding a provider is a new module here and its routing.yaml entry; nothing else in the gateway names a provider
// (SC-006).
import { readdir } from "node:fs/promises";

import type { z } from "zod";

import type { AdapterConfig, EnvClass, RoutingConfig } from "../config/validate.js";
import type { AdapterKind, ProviderAdapter } from "../core/types.js";

/** The logger an adapter gets: the gateway's, whose redaction rules apply to whatever it writes. */
export interface AdapterLogger {
  info(record: object, msg: string): void;
  warn(record: object, msg: string): void;
  error(record: object, msg: string): void;
}

export interface AdapterContext {
  env: Readonly<Record<string, string | undefined>>; // only the keys its settings name
  logger: AdapterLogger;
  realNow(): number;
}

export interface AdapterFactory<S = unknown> {
  readonly type: string; // the routing.yaml `type` it serves
  readonly kinds: readonly AdapterKind[]; // the kinds this type may be declared as
  readonly settings: z.ZodType<S>; // its routing.yaml settings; strict, no unknown keys
  readonly provider?: string; // a fixed gen_ai.provider.name, when the type has one
  create(id: string, settings: S, ctx: AdapterContext): ProviderAdapter;
}

/** A refusal a factory raises while building an adapter. Its message names keys, never their values. */
export class AdapterConfigError extends Error {
  constructor(
    readonly reason: "local_url_not_in_stack" | "missing_env" | "invalid_config",
    message: string,
  ) {
    super(message);
    this.name = "AdapterConfigError";
  }
}

/** A startup refusal: exit 1 when the build is wrong, 78 when the configuration is. */
export class RegistryError extends Error {
  constructor(
    readonly exitCode: 1 | 78,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

const MODULE = /^([a-z][a-z0-9-]*)\.(js|ts)$/;

/** The adapter modules in `dir`, one per name: a build's .js, or a source .ts under vitest and tsx. */
async function moduleNames(dir: URL): Promise<string[]> {
  const byBase = new Map<string, string>();
  for (const file of (await readdir(dir)).sort()) {
    const m = MODULE.exec(file);
    if (!m || m[1] === "registry") continue;
    const base = m[1] as string;
    if (!byBase.has(base) || m[2] === "js") byBase.set(base, file);
  }
  return [...byBase.values()];
}

/** Every adapter factory this build has, keyed by type. */
export async function loadFactories(dir: URL = new URL("./", import.meta.url)): Promise<Map<string, AdapterFactory>> {
  const factories = new Map<string, AdapterFactory>();
  for (const file of await moduleNames(dir)) {
    const mod = (await import(new URL(file, dir).href)) as { factory?: Partial<AdapterFactory> };
    const f = mod.factory;
    if (
      f === undefined ||
      typeof f.type !== "string" ||
      typeof f.create !== "function" ||
      !Array.isArray(f.kinds) ||
      typeof f.settings?.safeParse !== "function"
    ) {
      throw new RegistryError(1, "adapter_without_factory", `adapters/${file} exports no adapter factory`);
    }
    if (factories.has(f.type)) {
      throw new RegistryError(1, "duplicate_adapter_type", `two adapter modules serve the type "${f.type}"`);
    }
    factories.set(f.type, f as AdapterFactory);
  }
  return factories;
}

export interface BuiltAdapter {
  role: "primary" | "fallback";
  config: AdapterConfig;
  adapter: ProviderAdapter;
}

export interface BuildRouteOptions {
  factories: ReadonlyMap<string, AdapterFactory>;
  routing: RoutingConfig;
  envClass: EnvClass;
  env: Readonly<Record<string, string | undefined>>;
  logger: AdapterLogger;
  realNow(): number;
}

/** The env keys an adapter's settings name: the values of its `*_env` settings. */
function envFor(
  settings: Readonly<Record<string, unknown>>,
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key.endsWith("_env") && typeof value === "string") out[value] = env[value];
  }
  return out;
}

/** The adapters of this H4_ENV's route, primary first. A refusal closes whatever it had built already. */
export function buildRoute(opts: BuildRouteOptions): BuiltAdapter[] {
  const built: BuiltAdapter[] = [];
  try {
    buildInto(built, opts);
    return built;
  } catch (err) {
    for (const b of built) void b.adapter.close?.().catch(() => {});
    throw err;
  }
}

function buildInto(built: BuiltAdapter[], opts: BuildRouteOptions): void {
  const route = opts.routing.envs[opts.envClass];
  const roles: ["primary" | "fallback", string | undefined][] = [
    ["primary", route.primary],
    ["fallback", route.fallback],
  ];
  for (const [role, id] of roles) {
    if (id === undefined) continue;
    const at = `config/routing.yaml: adapters.${id}`;
    const config = opts.routing.adapters.get(id);
    if (config === undefined) throw new RegistryError(78, "invalid_config", `${at}: isn't defined`);
    const factory = opts.factories.get(config.type);
    if (factory === undefined) {
      throw new RegistryError(
        78,
        "unknown_adapter_type",
        `${at}.type: "${config.type}" isn't a registered adapter type`,
      );
    }
    if (!factory.kinds.includes(config.kind)) {
      throw new RegistryError(
        78,
        "adapter_kind_not_allowed",
        `${at}.kind: "${config.kind}" isn't allowed for type "${config.type}"`,
      );
    }
    const settings = factory.settings.safeParse(config.settings);
    if (!settings.success) {
      throw new RegistryError(78, "invalid_config", `${at}: settings the "${config.type}" factory refuses`);
    }
    try {
      const adapter = factory.create(id, settings.data, {
        env: envFor(config.settings, opts.env),
        logger: opts.logger,
        realNow: opts.realNow,
      });
      built.push({ role, config, adapter });
    } catch (err) {
      if (err instanceof AdapterConfigError) throw new RegistryError(78, err.reason, `${at}: ${err.message}`);
      throw err;
    }
  }
}
