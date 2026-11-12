// config/routing.yaml's schema 2 and the route per host (spec 001 tasks.md T061; FR-067, FR-068; data-model.md §2.1;
// contracts/env-cloud.md §4; research.md R-27): rule R1 amended, H1, H2, and A1; H4_HOST's selection, and its
// refusals with exit 78; and spec 010's refusals on the ec2 route, on a fixture, since the file's ec2 line is the
// Author's (tasks.md T095).
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { parseYaml } from "../../src/config/load.js";
import {
  checkStartup,
  routingForHost,
  RouteMissingError,
  validateBudgets,
  validatePrices,
  validateRouting,
  type RoutingConfig,
} from "../../src/config/validate.js";
import { dayKey } from "../../src/core/clock.js";
import {
  ANTHROPIC_MODEL,
  ANTHROPIC_PRICES,
  anthropicBudgets,
  anthropicFactories,
} from "../helpers/anthropic-config.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));

const ADAPTERS = `adapters:
  local:
    type: openai-compatible
    kind: local
    provider: local
    base_url_env: LOCAL_MODEL_BASE_URL
    model_env: LOCAL_MODEL_NAME
    timeouts: { connect_ms: 1000, request_ms: 10000 }
    health: { path: /models, interval_ms: 1000, timeout_ms: 800, unhealthy_after: 1, healthy_after: 3 }
  bedrock:
    type: bedrock-converse
    kind: paid
    region: us-east-1
    model: us.anthropic.claude-test-v1:0
    additional_request_fields: {}
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: 2000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 50 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200
  anthropic:
    type: anthropic-messages
    kind: paid
    model: ${ANTHROPIC_MODEL}
    api_key_env: GATEWAY_ANTHROPIC_API_KEY
    thinking: disabled
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: 2000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 50 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 60000 }
  synthetic:
    type: synthetic
    kind: synthetic
    model: metered-test
    output_tokens: 1000
`;

/** A schema-2 routing file with these host lines under envs.prod.hosts, and dev's route as given. */
function schema2(hosts: string, dev = "{ primary: local, fallback: synthetic }"): string {
  return `schema: 2
deadline_ms: 20000
${ADAPTERS}envs:
  prod:
    hosts:
${hosts}
  dev: ${dev}
`;
}
const LAPTOP = "      laptop: { primary: local, fallback: anthropic }";
const EC2 = "      ec2: { first: anthropic, second: bedrock }";

const routing = (text: string) => validateRouting(parseYaml("config/routing.yaml", text));
const rules = (text: string): string[] =>
  routing(text)
    .issues.filter((i) => i.severity === "error")
    .map((i) => `${i.rule} ${i.path}`);

describe("schema 2: the route per host (data-model.md §2.1)", () => {
  it("takes the laptop's line alone, as the committed file has it, and the laptop's and EC2's together", () => {
    const one = routing(schema2(LAPTOP));
    expect(one.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(one.value?.hosts?.laptop).toEqual({ primary: "local", fallback: "anthropic" });
    expect(one.value?.hosts?.ec2).toBeUndefined();
    // Every reader of envs.prod still finds the laptop's route there (H2).
    expect(one.value?.envs.prod).toEqual({ primary: "local", fallback: "anthropic" });
    const two = routing(schema2(`${LAPTOP}\n${EC2}`));
    expect(two.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(two.value?.hosts?.ec2).toEqual({ primary: "anthropic", fallback: "bedrock", paid: true });
  });

  it("keeps schema 1 as it was", () => {
    const one = routing(`schema: 1
deadline_ms: 20000
${ADAPTERS}envs:
  prod: { primary: local, fallback: anthropic }
  dev: { primary: local }
`);
    expect(one.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(one.value?.hosts).toBeUndefined();
  });

  it("R1, amended: every primary is local; a first route names paid adapters only, and only as envs.prod.hosts.ec2", () => {
    expect(rules(schema2(`${LAPTOP}\n      ec2: { primary: local }`))).toContain("R1 envs.prod.hosts.ec2");
    expect(rules(schema2("      laptop: { first: anthropic }"))).toContain("R1 envs.prod.hosts.laptop");
    expect(rules(schema2(`${LAPTOP}\n      ec2: { first: local }`))).toContain("R1 envs.prod.hosts.ec2.first");
    expect(rules(schema2(`${LAPTOP}\n      ec2: { first: anthropic, second: local }`))).toContain(
      "R1 envs.prod.hosts.ec2.second",
    );
    expect(rules(schema2(`${LAPTOP}\n      ec2: { first: synthetic }`))).toContain("R1 envs.prod.hosts.ec2.first");
    expect(rules(schema2(`${LAPTOP}\n      ec2: { first: anthropic, fallback: bedrock }`))).toContain(
      "R1 envs.prod.hosts.ec2",
    );
    expect(rules(schema2(LAPTOP, "{ first: anthropic }"))).toContain("R1 envs.dev");
  });

  it("H1: hosts holds the laptop, may hold EC2, and holds no other host", () => {
    expect(rules(schema2(EC2))).toContain("H1 envs.prod.hosts");
    expect(rules(schema2(`${LAPTOP}\n      tunnel-end: { primary: local }`))).toContain("H1 envs.prod.hosts");
    expect(
      rules(`schema: 2
deadline_ms: 20000
${ADAPTERS}envs:
  prod: { primary: local, fallback: anthropic }
  dev: { primary: local }
`),
    ).toContain("H1 envs.prod");
    expect(
      rules(`schema: 1
deadline_ms: 20000
${ADAPTERS}envs:
  prod:
    hosts:
${LAPTOP}
  dev: { primary: local }
`),
    ).toContain("R11 envs.prod");
  });
});

describe("H2: the host's route, by H4_HOST", () => {
  const valid = (text: string): RoutingConfig => {
    const r = routing(text);
    if (r.value === undefined) throw new Error(JSON.stringify(r.issues));
    return r.value;
  };

  it("selects envs.prod.hosts.<H4_HOST> on prod, and envs.<H4_ENV> where there are no hosts", () => {
    const both = valid(schema2(`${LAPTOP}\n${EC2}`));
    expect(routingForHost(both, "laptop").envs.prod).toEqual({ primary: "local", fallback: "anthropic" });
    expect(routingForHost(both, "ec2").envs.prod).toEqual({ primary: "anthropic", fallback: "bedrock", paid: true });
    expect(routingForHost(both, "ec2").envs.dev).toEqual(both.envs.dev);
  });

  it("refuses EC2 with exit 78, route_missing, while envs.prod.hosts.ec2 is missing, in schema 1 or 2", () => {
    for (const text of [
      schema2(LAPTOP),
      `schema: 1
deadline_ms: 20000
${ADAPTERS}envs:
  prod: { primary: local, fallback: anthropic }
  dev: { primary: local }
`,
    ]) {
      try {
        routingForHost(valid(text), "ec2");
        throw new Error("not refused");
      } catch (err) {
        expect(err).toBeInstanceOf(RouteMissingError);
        expect((err as RouteMissingError).exitCode).toBe(78);
        expect((err as RouteMissingError).reason).toBe("route_missing");
      }
    }
  });
});

describe("spec 010's refusals on the ec2 route (a fixture: the file's ec2 line is the Author's)", () => {
  const PRICES_WITHOUT_ANTHROPIC = ANTHROPIC_PRICES.replace(
    / {6}- provider: anthropic\n {8}model: [^\n]+\n {8}input: 1\n {8}output: 5\n/,
    "",
  );
  const startup = (prices: string, budgets: string, env: Record<string, string | undefined>) => {
    const r = routingForHost(routing(schema2(`${LAPTOP}\n${EC2}`)).value as RoutingConfig, "ec2");
    const p = validatePrices(parseYaml("config/prices.yaml", prices)).value;
    const b = validateBudgets(parseYaml("config/budgets.yaml", budgets)).value;
    if (p === undefined || b === undefined) throw new Error("fixture invalid");
    return checkStartup({ routing: r, prices: p, budgets: b }, { H4_ENV: "prod", H4_HOST: "ec2", ...env }, Date.now())
      .map((x) => x.reason)
      .sort();
  };
  const key = { GATEWAY_ANTHROPIC_API_KEY: `test-${randomBytes(8).toString("hex")}`, AWS_PROFILE: "h4reet-ec2" };

  it("starts with the price, the cap, and the key", () => {
    expect(startup(ANTHROPIC_PRICES, anthropicBudgets(), key)).toEqual([]);
  });

  it("price_missing, adapter_cap_missing, and missing_env, each on its own", () => {
    expect(startup(PRICES_WITHOUT_ANTHROPIC, anthropicBudgets(), key)).toContain("price_missing");
    expect(
      startup(
        ANTHROPIC_PRICES,
        anthropicBudgets().replaceAll("    adapter_monthly_usd: { anthropic: 10.00 }\n", ""),
        key,
      ),
    ).toContain("adapter_cap_missing");
    expect(startup(ANTHROPIC_PRICES, anthropicBudgets(), { AWS_PROFILE: "h4reet-ec2" })).toContain("missing_env");
  });
});

// A1, on two whole gateways: EC2's calls are metered and leave fallback_day alone; the laptop's fallback is fallback.
describe("A1: the attribution of each host's paid calls", () => {
  const KEY = `test-${randomBytes(16).toString("hex")}`;
  let openai: StubOpenAI;
  let anthropic: StubAnthropic;
  const stacks: TestStack[] = [];
  const dirs: string[] = [];
  beforeAll(async () => {
    openai = await stubOpenAI({ model: "stand-in" });
    anthropic = await stubAnthropic();
  });
  afterAll(async () => {
    await anthropic.close();
    await openai.close();
  });
  afterEach(async () => {
    openai.reset();
    anthropic.reset();
    for (const s of stacks.splice(0)) await s.close();
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  async function host(h4Host: "laptop" | "ec2"): Promise<TestStack> {
    const dir = await mkdtemp(join(tmpdir(), "h4-config-hosts-"));
    dirs.push(dir);
    await copyFile(join(FIXTURES, "alerts.yaml"), join(dir, "alerts.yaml"));
    await writeFile(join(dir, "routing.yaml"), schema2(`${LAPTOP}\n      ec2: { first: anthropic }`));
    await writeFile(join(dir, "prices.yaml"), ANTHROPIC_PRICES);
    await writeFile(join(dir, "budgets.yaml"), anthropicBudgets());
    const { factories } = await anthropicFactories(anthropic.origin);
    openai.setHealth({ status: 503 });
    const s = await testStack({
      stack: "prod",
      env: { H4_HOST: h4Host, LOCAL_MODEL_BASE_URL: openai.baseUrl, GATEWAY_ANTHROPIC_API_KEY: KEY },
      configDir: dir,
      factories,
    });
    stacks.push(s);
    const init = await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({ reason: "A fresh prod stack for the hosts test.", confirm_zero: true, renew: true }),
    });
    expect(init.statusCode, init.body).toBe(200);
    await s.services.gateway.probeAll();
    return s;
  }
  const hello = (s: TestStack) =>
    s.api.inject({
      method: "POST",
      url: "/hello",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
      payload: JSON.stringify({}),
    });
  const rows = async (s: TestStack) =>
    (
      await s.db.pg.query<Record<string, unknown>>(
        "SELECT route_decision, attribution, adapter_id, host FROM gateway.ledger WHERE attribution <> 'none'",
      )
    ).rows;
  const fallbackDay = async (s: TestStack): Promise<string | undefined> =>
    (
      await s.db.pg.query<{ spent_micro: string }>(
        "SELECT spent_micro FROM gateway.meters WHERE meter = 'fallback_day' AND period_key = $1",
        [dayKey(Date.now())],
      )
    ).rows[0]?.spent_micro;

  it("EC2 calls its first adapter with no local step, metered, and leaves fallback_day untouched", async () => {
    const s = await host("ec2");
    const before = await fallbackDay(s);
    const res = await hello(s);
    expect(res.statusCode, res.body).toBe(200);
    expect(anthropic.messages()).toHaveLength(1);
    // No local step: EC2's route names no local adapter, so no request reaches the local stub's completions.
    expect(openai.requests().filter((r) => r.path.includes("chat/completions"))).toEqual([]);
    expect(await rows(s)).toEqual([
      { route_decision: "metered", attribution: "metered", adapter_id: "anthropic", host: "ec2" },
    ]);
    expect(await fallbackDay(s)).toBe(before);
  });

  it("the laptop's fallback stays fallback, counted against fallback_day", async () => {
    const s = await host("laptop");
    const res = await hello(s);
    expect(res.statusCode, res.body).toBe(200);
    expect(await rows(s)).toEqual([
      { route_decision: "fallback", attribution: "fallback", adapter_id: "anthropic", host: "laptop" },
    ]);
    expect(BigInt((await fallbackDay(s)) ?? "0")).toBeGreaterThan(0n);
  });

  it("a gateway's H4_HOST is laptop or ec2, and exits 78 otherwise", async () => {
    await expect(host("tunnel-end" as "ec2")).rejects.toThrow(/invalid_host|H4_HOST/);
  });
});
