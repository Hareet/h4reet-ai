// The adapter registry (tasks.md T051; contracts/provider-adapter.md §4): it finds every module in its own directory
// but itself and the "_" helpers, keys their factories by type, and builds only the adapters this H4_ENV's route
// names. A module without a factory, or two with one type, stop startup with exit 1; an unknown type, a kind the type
// doesn't allow, or settings its schema refuses, with exit 78.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ADAPTER_TYPE_SPECS, REGISTERED_ADAPTER_TYPES } from "../../src/adapters/_settings.js";
import { factory as localFactory } from "../../src/adapters/local-openai.js";
import { factory as syntheticFactory } from "../../src/adapters/synthetic.js";
import {
  RegistryError,
  buildRoute,
  loadFactories,
  switchedOff,
  type AdapterFactory,
} from "../../src/adapters/registry.js";
import { loadConfig, type AdapterConfig, type RoutingConfig } from "../../src/config/validate.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const quiet = { info() {}, warn() {}, error() {} };
const ENV = {
  H4_ENV: "dev",
  LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
  LOCAL_MODEL_NAME: "stand-in",
  OPERATOR_TOKEN_SHA256: "ab".repeat(32),
  GATEWAY_DB_PASSWORD: "not-for-adapters",
};

let routing: RoutingConfig;
beforeAll(async () => {
  const config = await loadConfig(FIXTURES, { allowPlanned: false });
  if (!config.routing) throw new Error("fixture routing");
  routing = config.routing;
});

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

/** A directory of adapter modules, as dist/adapters/ holds them. */
async function moduleDir(files: Record<string, string>): Promise<URL> {
  const dir = await mkdtemp(join(tmpdir(), "h4-registry-"));
  dirs.push(dir);
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return pathToFileURL(`${dir}/`);
}

const FAKE = (type: string) =>
  `export const factory = { type: ${JSON.stringify(type)}, kinds: ["local"], settings: { safeParse: (v) => ({ success: true, data: v }) }, create: () => ({}) };`;

const refusal = (fn: () => unknown): RegistryError => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(RegistryError);
    return err as RegistryError;
  }
  throw new Error("expected a RegistryError");
};

describe("loadFactories", () => {
  it("finds exactly the types this build registers, the ones validate-config checks rule R6 against", async () => {
    const factories = await loadFactories();
    expect([...factories.keys()].sort()).toEqual([...REGISTERED_ADAPTER_TYPES].sort());
    // T073 added synthetic, and T102 adds bedrock-converse.
    expect([...REGISTERED_ADAPTER_TYPES].sort()).toEqual(["bedrock-converse", "openai-compatible", "synthetic"]);
    expect(factories.get("openai-compatible")).toBe(localFactory);
    expect(factories.get("synthetic")).toBe(syntheticFactory);
  });

  it("takes each factory's kinds and settings schema from _settings.ts, so the gate and the runtime agree", () => {
    for (const f of [localFactory, syntheticFactory] as AdapterFactory[]) {
      const spec = ADAPTER_TYPE_SPECS.get(f.type);
      expect(f.type).toBe(spec?.type);
      expect(f.kinds).toEqual(spec?.kinds);
      expect(f.settings).toBe(spec?.settings);
    }
    expect(syntheticFactory.provider).toBe("synthetic");
  });

  it("skips itself, the _ helpers, declaration files, and source maps", async () => {
    const dir = await moduleDir({
      "registry.js": "throw new Error('the registry must not load itself');",
      "_helper.js": "throw new Error('helpers are not adapters');",
      "alpha.js": FAKE("alpha"),
      "alpha.d.ts": "export {};",
      "alpha.js.map": "{}",
      "README.md": "not a module",
    });
    const factories = await loadFactories(dir);
    expect([...factories.keys()]).toEqual(["alpha"]);
  });

  it("stops startup with exit 1 for a module without a factory", async () => {
    const dir = await moduleDir({ "nothing.js": "export const notAFactory = 1;" });
    const err = await loadFactories(dir).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RegistryError);
    expect([(err as RegistryError).exitCode, (err as RegistryError).reason]).toEqual([1, "adapter_without_factory"]);
  });

  it("stops startup with exit 1 for two modules with the same type", async () => {
    const dir = await moduleDir({ "one.js": FAKE("same"), "two.js": FAKE("same") });
    const err = await loadFactories(dir).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect([(err as RegistryError).exitCode, (err as RegistryError).reason]).toEqual([1, "duplicate_adapter_type"]);
  });

  it("loads a module once when its build and its source sit side by side", async () => {
    const dir = await moduleDir({ "beta.js": FAKE("beta"), "beta.ts": FAKE("beta") });
    expect([...(await loadFactories(dir)).keys()]).toEqual(["beta"]);
  });
});

describe("buildRoute", () => {
  it("builds the route H4_ENV selects, primary first, each adapter seeing only the env keys its settings name", async () => {
    let seen: Readonly<Record<string, string | undefined>> | undefined;
    const spy: AdapterFactory = {
      ...localFactory,
      create(id, settings, ctx) {
        seen = ctx.env;
        return localFactory.create(id, settings as never, ctx);
      },
    };
    const built = buildRoute({
      factories: new Map([["openai-compatible", spy]]),
      routing,
      envClass: "dev",
      env: ENV,
      logger: quiet,
      realNow: Date.now,
    });
    expect(built.map((b) => [b.role, b.config.id, b.adapter.id, b.adapter.type, b.adapter.kind])).toEqual([
      ["primary", "local", "local", "openai-compatible", "local"],
    ]);
    expect(seen).toEqual({ LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1", LOCAL_MODEL_NAME: "stand-in" });
    expect(built[0]?.adapter.model).toBe("stand-in");
    await Promise.all(built.map((b) => b.adapter.close?.()));
  });

  const variant = (patch: Partial<AdapterConfig>): RoutingConfig => {
    const local = routing.adapters.get("local") as AdapterConfig;
    return { ...routing, adapters: new Map([["local", { ...local, ...patch }]]) };
  };
  const build = (r: RoutingConfig, env: Record<string, string | undefined> = ENV) =>
    buildRoute({
      factories: new Map([["openai-compatible", localFactory]]),
      routing: r,
      envClass: "dev",
      env,
      logger: quiet,
      realNow: Date.now,
    });

  it("stops startup with exit 78 for a type no module serves", () => {
    const err = refusal(() => build(variant({ type: "carrier-pigeon" })));
    expect([err.exitCode, err.reason]).toEqual([78, "unknown_adapter_type"]);
  });

  it("stops startup with exit 78 for a kind the type doesn't allow", () => {
    const err = refusal(() => build(variant({ kind: "paid" })));
    expect([err.exitCode, err.reason]).toEqual([78, "adapter_kind_not_allowed"]);
  });

  it("stops startup with exit 78 for settings the factory's schema refuses", () => {
    const local = routing.adapters.get("local") as AdapterConfig;
    const err = refusal(() => build(variant({ settings: { ...local.settings, unexpected: true } })));
    expect([err.exitCode, err.reason]).toEqual([78, "invalid_config"]);
    expect(err.message).toContain("adapters.local");
  });

  it("stops startup with exit 78 when the local URL isn't an in-stack service, naming the key and not its value", () => {
    for (const url of ["https://model-server/v1", "http://169.254.169.254/v1", "http://api.example.com/v1"]) {
      const err = refusal(() => build(routing, { ...ENV, LOCAL_MODEL_BASE_URL: url }));
      expect([err.exitCode, err.reason]).toEqual([78, "local_url_not_in_stack"]);
      expect(err.message).toContain("LOCAL_MODEL_BASE_URL");
      expect(err.message).not.toContain(url);
    }
    const missing = refusal(() => build(routing, { ...ENV, LOCAL_MODEL_NAME: undefined }));
    expect([missing.exitCode, missing.reason]).toEqual([78, "missing_env"]);
  });
});

describe("buildRoute and the synthetic adapter (provider-adapter.md §3.3)", () => {
  /** config-files.md §1.2's second step: dev's route falls back to the synthetic adapter. */
  const withSynthetic = (): RoutingConfig => {
    const synthetic: AdapterConfig = {
      id: "synthetic",
      type: "synthetic",
      kind: "synthetic",
      provider: "synthetic",
      settings: { model: "metered-test", output_tokens: 1_000 },
      spec: ADAPTER_TYPE_SPECS.get("synthetic") as AdapterConfig["spec"],
      placeholders: [],
    };
    return {
      ...routing,
      adapters: new Map([...routing.adapters, ["synthetic", synthetic]]),
      envs: { ...routing.envs, dev: { primary: "local", fallback: "synthetic" } },
    };
  };
  const factories = new Map<string, AdapterFactory>([
    ["openai-compatible", localFactory],
    ["synthetic", syntheticFactory as AdapterFactory],
  ]);
  const build = (env: Record<string, string | undefined>) =>
    buildRoute({ factories, routing: withSynthetic(), envClass: "dev", env, logger: quiet, realNow: Date.now });

  it("builds dev's synthetic fallback only when GATEWAY_TEST_SYNTHETIC_SPEND=1", async () => {
    const on = build({ ...ENV, GATEWAY_TEST_SYNTHETIC_SPEND: "1" });
    expect(on.map((b) => [b.role, b.adapter.id, b.adapter.kind, b.adapter.provider])).toEqual([
      ["primary", "local", "local", "local"],
      ["fallback", "synthetic", "synthetic", "synthetic"],
    ]);
    expect(on[1]?.adapter.fixedUsage).toEqual({ inputTokens: 0, outputTokens: 1_000 });
    // Without the switch, dev's route has no fallback: hello with local down answers no_fallback_in_stack.
    for (const value of [undefined, "0", "", "yes"]) {
      const off = build({ ...ENV, GATEWAY_TEST_SYNTHETIC_SPEND: value });
      expect(
        off.map((b) => b.role),
        String(value),
      ).toEqual(["primary"]);
      await Promise.all(off.map((b) => b.adapter.close?.()));
    }
    await Promise.all(on.map((b) => b.adapter.close?.()));
  });

  it("names the adapters it leaves switched off, for GET /health and the gauge to report as disabled (tasks.md T154)", () => {
    const routingOf = withSynthetic();
    for (const value of [undefined, "0", "", "yes"]) {
      expect(
        switchedOff({ routing: routingOf, envClass: "dev", env: { ...ENV, GATEWAY_TEST_SYNTHETIC_SPEND: value } }).map(
          (d) => [d.role, d.config.id],
        ),
        String(value),
      ).toEqual([["fallback", "synthetic"]]);
    }
    expect(
      switchedOff({ routing: routingOf, envClass: "dev", env: { ...ENV, GATEWAY_TEST_SYNTHETIC_SPEND: "1" } }),
    ).toEqual([]);
    expect(switchedOff({ routing: routingOf, envClass: "prod", env: ENV })).toEqual([]);
  });

  it("gives the synthetic adapter no env key: it reads nothing from the environment", () => {
    let seen: Readonly<Record<string, string | undefined>> | undefined;
    const spy: AdapterFactory = {
      ...(syntheticFactory as AdapterFactory),
      create(id, settings, ctx) {
        seen = ctx.env;
        return syntheticFactory.create(id, settings as never, ctx);
      },
    };
    buildRoute({
      factories: new Map([...factories, ["synthetic", spy]]),
      routing: withSynthetic(),
      envClass: "dev",
      env: { ...ENV, GATEWAY_TEST_SYNTHETIC_SPEND: "1" },
      logger: quiet,
      realNow: Date.now,
    });
    expect(seen).toEqual({});
  });
});
