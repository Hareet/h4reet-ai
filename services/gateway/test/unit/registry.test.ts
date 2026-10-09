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
import { RegistryError, buildRoute, loadFactories, type AdapterFactory } from "../../src/adapters/registry.js";
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
    expect(factories.get("openai-compatible")).toBe(localFactory);
  });

  it("takes each factory's kinds and settings schema from _settings.ts, so the gate and the runtime agree", () => {
    const spec = ADAPTER_TYPE_SPECS.get("openai-compatible");
    expect(localFactory.type).toBe(spec?.type);
    expect(localFactory.kinds).toEqual(spec?.kinds);
    expect(localFactory.settings).toBe(spec?.settings);
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
