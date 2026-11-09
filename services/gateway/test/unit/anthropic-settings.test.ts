// The anthropic-messages adapter's settings, its routing rules, and its startup refusals (spec 010, FR-005, FR-014,
// FR-017, FR-019, FR-021; tasks.md T007; contracts/config-files.md §1.1, §1.3, §1.4, §3.1, §3.3). The key's value is
// made at run time and never key-shaped; a refusal names the key, never its value.
import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";
import { parse as parseYamlText, stringify } from "yaml";

import { ADAPTER_TYPE_SPECS, REGISTERED_ADAPTER_TYPES, type Env } from "../../src/adapters/_settings.js";
import { formatIssue, parseYaml, type ConfigIssue } from "../../src/config/load.js";
import {
  checkStartup,
  validateBudgets,
  validateConfigFiles,
  validatePrices,
  validateRouting,
  type Budgets,
  type PriceTable,
  type RoutingConfig,
} from "../../src/config/validate.js";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NOW = Date.parse("2026-11-08T16:00:00Z");
const ALL_TYPES = new Set(ADAPTER_TYPE_SPECS.keys());

const ROUTING = `schema: 1
deadline_ms: 20000
adapters:
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
    model: us.anthropic.example-model-v1:0
    additional_request_fields: {}
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: 4000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 250 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200
  anthropic:
    type: anthropic-messages
    kind: paid
    model: claude-haiku-5-5
    api_key_env: GATEWAY_ANTHROPIC_API_KEY
    thinking: disabled
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: 4000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 250 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 60000 }
envs:
  prod: { primary: local, fallback: bedrock }
  dev: { primary: local }
`;

const PRICES = `schema: 1
currency: USD
unit: per_million_tokens
versions:
  - id: "2026-11-08.1"
    effective_from: "2026-11-08T00:00:00Z"
    source: "the anthropic-settings test: made-up prices"
    entries:
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: aws.bedrock
        model: us.anthropic.example-model-v1:0
        input: 1
        output: 5
      - provider: anthropic
        model: claude-haiku-5-5
        input: 1
        output: 5
`;

/** budgets.yaml with prod's cap, and dev's: the same as prod's unless `devCap` says otherwise (null: none). */
const budgetsText = (cap?: string, devCapGiven?: string | null): string => {
  const devCap = devCapGiven === undefined ? cap : (devCapGiven ?? undefined);
  return `schema: 1
timing:
  timezone: UTC
  reservation_ttl_s: 120
envs:
  prod:
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00
    warn_ratio: 0.70
${cap === undefined ? "" : `    adapter_monthly_usd: ${cap}\n`}  dev:
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00
    warn_ratio: 0.70
${devCap === undefined ? "" : `    adapter_monthly_usd: ${devCap}\n`}limits:
  per_client: { requests_per_minute: 20, burst: 5, requests_per_day: 500, metered_in_flight: 1 }
  global: { metered_in_flight: 4, metered_per_minute: 60 }
  per_call: { max_input_chars: 2000, hello_max_output_tokens: 128, max_output_tokens: 512 }
`;
};

const errors = (issues: ConfigIssue[]): ConfigIssue[] => issues.filter((i) => i.severity === "error");
const lines = (issues: ConfigIssue[]): string[] => errors(issues).map(formatIssue);
const rules = (issues: ConfigIssue[]): string[] => errors(issues).map((i) => i.rule);

function routing(change: (doc: Doc) => void = () => {}) {
  const doc = parseYamlText(ROUTING) as Doc;
  change(doc);
  return validateRouting(parseYaml("config/routing.yaml", stringify(doc)), { registeredTypes: ALL_TYPES });
}
const routingValue = (change?: (doc: Doc) => void): RoutingConfig => {
  const result = routing(change);
  expect(lines(result.issues)).toEqual([]);
  return result.value as RoutingConfig;
};
const pricesValue = (text = PRICES): PriceTable => {
  const result = validatePrices(parseYaml("config/prices.yaml", text));
  expect(lines(result.issues)).toEqual([]);
  return result.value as PriceTable;
};
const budgetsValue = (text: string): Budgets => {
  const result = validateBudgets(parseYaml("config/budgets.yaml", text));
  expect(lines(result.issues)).toEqual([]);
  return result.value as Budgets;
};
const anthropicFallback = (doc: Doc): void => {
  doc.envs.prod.fallback = "anthropic";
};

const KEY = `test-${randomBytes(12).toString("hex")}`;
const PROD: Env = {
  H4_STACK: "prod",
  H4_ENV: "prod",
  LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
  LOCAL_MODEL_NAME: "stand-in",
  GATEWAY_ANTHROPIC_API_KEY: KEY,
};
const DEV: Env = { ...PROD, H4_STACK: "dev", H4_ENV: "dev" };

describe("the anthropic-messages type (FR-004, FR-005)", () => {
  it("is registered, paid only (R5), and its provider is anthropic", () => {
    expect(REGISTERED_ADAPTER_TYPES.has("anthropic-messages")).toBe(true);
    const spec = ADAPTER_TYPE_SPECS.get("anthropic-messages");
    expect(spec?.kinds).toEqual(["paid"]);
    expect(spec?.provider({})).toBe("anthropic");
    expect(spec?.label).toBe("the Anthropic API");
    expect(rules(routing((d) => void (d.adapters.anthropic.kind = "local")).issues)).toContain("R5");
  });

  it("accepts the committed form, and the endpoint is no setting", () => {
    expect(lines(routing().issues)).toEqual([]);
    for (const key of ["base_url", "region", "base_url_env", "organization_env"]) {
      const result = routing((d) => void (d.adapters.anthropic[key] = key.endsWith("_env") ? "SOME_KEY" : "x"));
      expect(lines(result.issues)).toEqual([`config/routing.yaml: adapters.anthropic.${key}: unknown key`]);
      expect(rules(result.issues)).toEqual(["R11"]);
    }
  });

  it("takes thinking only as disabled, and temperature as absent, as_requested, or model_default", () => {
    expect(rules(routing((d) => void (d.adapters.anthropic.thinking = "adaptive")).issues)).toEqual(["R11"]);
    expect(lines(routing((d) => void delete d.adapters.anthropic.temperature).issues)).toEqual([]);
    for (const value of ["as_requested", "model_default"]) {
      expect(lines(routing((d) => void (d.adapters.anthropic.temperature = value)).issues)).toEqual([]);
    }
    expect(rules(routing((d) => void (d.adapters.anthropic.temperature = 0.3)).issues)).toEqual(["R11"]);
  });

  it("holds connect plus request to 5,000 ms (R8), and each to its bounds", () => {
    const result = routing((d) => void (d.adapters.anthropic.timeouts = { connect_ms: 2000, request_ms: 4000 }));
    expect(rules(result.issues)).toEqual(["R8"]);
    expect(rules(routing((d) => void (d.adapters.anthropic.timeouts.request_ms = 4001)).issues)).toContain("R11");
    expect(rules(routing((d) => void (d.adapters.anthropic.health.interval_ms = 9_999)).issues)).toContain("R11");
  });

  it("refuses an api_key_env beginning ANTHROPIC_, a name the SDK reads on its own (R12)", () => {
    for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) {
      const result = routing((d) => void (d.adapters.anthropic.api_key_env = name));
      expect(rules(result.issues)).toEqual(["R12"]);
      expect(lines(result.issues)[0]).toContain("adapters.anthropic.api_key_env");
    }
  });

  it("counts toward the deadline rule like Bedrock (R9)", () => {
    const result = routing((d) => {
      anthropicFallback(d);
      d.deadline_ms = 18_000;
    });
    expect(rules(result.issues)).toEqual(["R9"]);
  });

  it("can't be dev's fallback (R2)", () => {
    expect(rules(routing((d) => void (d.envs.dev.fallback = "anthropic")).issues)).toContain("R2");
  });
});

describe("the adapter's monthly cap in budgets.yaml (FR-021, B8, B9)", () => {
  it("is optional, and parses as micro-USD per adapter", () => {
    expect(budgetsValue(budgetsText()).envs.prod.adapterMonthly).toBeUndefined();
    const b = budgetsValue(budgetsText("{ anthropic: 10.00 }"));
    expect(b.envs.prod.adapterMonthly?.get("anthropic")).toBe(10_000_000n);
  });

  it("takes a cap more than 0 and at most monthly_usd, to the micro-dollar (B9)", () => {
    expect(
      lines(validateBudgets(parseYaml("config/budgets.yaml", budgetsText("{ anthropic: 20.00 }"))).issues),
    ).toEqual([]);
    for (const bad of ["{ anthropic: 0 }", "{ anthropic: 20.01 }", "{ anthropic: 1.0000001 }", "{ anthropic: x }"]) {
      const result = validateBudgets(parseYaml("config/budgets.yaml", budgetsText(bad)));
      expect(rules(result.issues)).toContain("B9");
    }
  });

  it("holds dev equal to prod (B8)", () => {
    const result = validateBudgets(parseYaml("config/budgets.yaml", budgetsText("{ anthropic: 10.00 }", null)));
    expect(rules(result.issues)).toContain("B8");
  });

  it("names only a paid adapter in routing.yaml, checked across the files (B9)", () => {
    const files = (cap: string) => ({
      "routing.yaml": parseYaml("config/routing.yaml", ROUTING),
      "budgets.yaml": parseYaml("config/budgets.yaml", budgetsText(cap)),
    });
    const registeredTypes = ALL_TYPES;
    expect(lines(validateConfigFiles(files("{ anthropic: 10.00 }"), { registeredTypes }).issues)).toEqual([]);
    for (const cap of ["{ nobody: 10.00 }", "{ local: 10.00 }"]) {
      const set = validateConfigFiles(files(cap), { registeredTypes });
      expect(rules(set.issues)).toEqual(["B9", "B9"]); // prod's and dev's, which B8 holds equal
      expect(errors(set.issues).map((i) => i.path)).toEqual([
        `envs.prod.adapter_monthly_usd.${cap.slice(2, cap.indexOf(":"))}`,
        `envs.dev.adapter_monthly_usd.${cap.slice(2, cap.indexOf(":"))}`,
      ]);
    }
  });
});

describe("the adapter's startup refusals (FR-014, FR-019, FR-021; §1.4)", () => {
  const capped = (): Budgets => budgetsValue(budgetsText("{ anthropic: 10.00 }"));

  it("starts prod with the route on anthropic, its key, price, and cap in place", () => {
    const refusals = checkStartup(
      { routing: routingValue(anthropicFallback), prices: pricesValue(), budgets: capped() },
      PROD,
      NOW,
    );
    expect(refusals).toEqual([]);
  });

  it("paid_route_outside_prod: a dev gateway whose route names it doesn't start", () => {
    const valid = routingValue();
    const config: RoutingConfig = {
      ...valid,
      envs: { ...valid.envs, dev: { primary: "local", fallback: "anthropic" } },
    };
    const refusals = checkStartup({ routing: config, prices: pricesValue(), budgets: capped() }, DEV, NOW);
    expect(refusals.map((r) => r.reason)).toContain("paid_route_outside_prod");
  });

  it("missing_env: the key unset or empty, naming the key and never its value", () => {
    for (const value of [undefined, ""]) {
      const refusals = checkStartup(
        { routing: routingValue(anthropicFallback), prices: pricesValue(), budgets: capped() },
        { ...PROD, GATEWAY_ANTHROPIC_API_KEY: value },
        NOW,
      );
      expect(refusals.map((r) => [r.reason, r.key])).toEqual([["missing_env", "GATEWAY_ANTHROPIC_API_KEY"]]);
    }
    const ok = checkStartup(
      { routing: routingValue(anthropicFallback), prices: pricesValue(), budgets: capped() },
      PROD,
      NOW,
    );
    expect(JSON.stringify(ok)).not.toContain(KEY);
  });

  it("price_missing: no active or later version prices it", () => {
    const noAnthropic = PRICES.replace(
      / {6}- provider: anthropic\n {8}model: claude-haiku-5-5\n {8}input: 1\n {8}output: 5\n/,
      "",
    );
    expect(noAnthropic).not.toContain("provider: anthropic");
    const refusals = checkStartup(
      { routing: routingValue(anthropicFallback), prices: pricesValue(noAnthropic), budgets: capped() },
      PROD,
      NOW,
    );
    expect(refusals.map((r) => r.reason)).toEqual(["price_missing"]);
  });

  it("adapter_cap_missing: budgets.yaml has no cap for the routed adapter", () => {
    const refusals = checkStartup(
      { routing: routingValue(anthropicFallback), prices: pricesValue(), budgets: budgetsValue(budgetsText()) },
      PROD,
      NOW,
    );
    expect(refusals.map((r) => [r.reason, r.path])).toEqual([
      ["adapter_cap_missing", "config/budgets.yaml: envs.prod.adapter_monthly_usd.anthropic"],
    ]);
  });

  it("refuses none of these while the route names Bedrock: an unrouted anthropic adapter is never checked", () => {
    const refusals = checkStartup(
      {
        routing: routingValue(),
        prices: pricesValue(PRICES.replace("provider: anthropic", "provider: someone-else")),
        budgets: budgetsValue(budgetsText()),
      },
      { ...PROD, GATEWAY_ANTHROPIC_API_KEY: "" },
      NOW,
    );
    expect(refusals).toEqual([]);
  });
});
