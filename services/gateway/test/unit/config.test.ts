// Every validation error and exit-78 refusal of contracts/config-files.md §1.3–§1.4, §2.4–§2.5, §3.3, and §4.3
// (tasks.md T018), and the pin of prod's thresholds. §4.4's refusals combine the environment with the files; they
// are in validate-env.test.ts with the module that checks them.
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYamlText, stringify } from "yaml";

import { ADAPTER_TYPE_SPECS, type Env } from "../../src/adapters/_settings.js";
import {
  PLANNED_CONFIG_FILES,
  formatIssue,
  formatPath,
  parseYaml,
  readConfigDir,
  type ConfigIssue,
  type PlannedFiles,
} from "../../src/config/load.js";
import {
  PriceTable,
  checkPricesAppendOnly,
  checkStartup,
  costMicro,
  loadConfig,
  startupRefusals,
  thresholds,
  validateAlerts,
  validateBudgets,
  validateConfigFiles,
  validatePrices,
  validateRouting,
  type RoutingConfig,
} from "../../src/config/validate.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const ALL_TYPES = new Set(ADAPTER_TYPE_SPECS.keys());
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

const errors = (issues: ConfigIssue[]): ConfigIssue[] => issues.filter((i) => i.severity === "error");
const notes = (issues: ConfigIssue[]): ConfigIssue[] => issues.filter((i) => i.severity === "note");
const errorLines = (issues: ConfigIssue[]): string[] => errors(issues).map(formatIssue);
const rulesOf = (issues: ConfigIssue[]): string[] => errors(issues).map((i) => i.rule);

const at = (iso: string): number => Date.parse(iso);
const NOT_HERE =
  "is a placeholder; only routing.yaml's Bedrock model and a prices.yaml entry's model and prices may hold one";
const NOW = at("2026-10-08T16:00:00Z");

// contracts/config-files.md §1.2's final form: every type, once tasks T073, T102, and T105 are done.
const FULL_ROUTING = `schema: 1
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
    model: "<inference-profile ID the Author confirms>"
    additional_request_fields: {}
    timeouts: { connect_ms: 1000, request_ms: 4000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 250 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200
  synthetic:
    type: synthetic
    kind: synthetic
    model: metered-test
    output_tokens: 1000
envs:
  prod: { primary: local, fallback: bedrock }
  dev: { primary: local, fallback: synthetic }
`;

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The full routing form with one change, validated with every type registered unless the test says otherwise. */
function routing(change: (doc: Doc) => void = () => {}, registeredTypes: ReadonlySet<string> = ALL_TYPES) {
  const doc = parseYamlText(FULL_ROUTING) as Doc;
  change(doc);
  return validateRouting(parseYaml("config/routing.yaml", stringify(doc)), { registeredTypes });
}

const routingConfig = (change?: (doc: Doc) => void): RoutingConfig => {
  const result = routing(change);
  expect(errorLines(result.issues)).toEqual([]);
  return result.value as RoutingConfig;
};

const prices = (text: string) => validatePrices(parseYaml("config/prices.yaml", text));
const pricesTable = (text: string): PriceTable => {
  const result = prices(text);
  expect(errorLines(result.issues)).toEqual([]);
  return result.value as PriceTable;
};
const budgets = (text: string) => validateBudgets(parseYaml("config/budgets.yaml", text));
const alerts = (text: string) => validateAlerts(parseYaml("config/alerts.yaml", text));

const BEDROCK_MODEL = "us.anthropic.example-model-v1:0"; // a well-formed ID, not a real one
const withModel = (doc: Doc): void => {
  doc.adapters.bedrock.model = BEDROCK_MODEL;
};

const DEV_ENV: Env = {
  H4_STACK: "dev",
  H4_ENV: "dev",
  LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
  LOCAL_MODEL_NAME: "stand-in",
};
const PROD_ENV: Env = { ...DEV_ENV, H4_STACK: "prod", H4_ENV: "prod" };

// ---------------------------------------------------------------------------------------------------------------

describe("every file (§0)", () => {
  it("refuses duplicate keys, naming the line", () => {
    const parsed = parseYaml("config/routing.yaml", "schema: 1\nschema: 1\n");
    expect(errorLines(parsed.issues)).toEqual(["config/routing.yaml: line 2: not valid YAML: Map keys must be unique"]);
  });

  it("refuses a second document", () => {
    const parsed = parseYaml("config/prices.yaml", "schema: 1\n---\nschema: 1\n");
    expect(rulesOf(parsed.issues)).toEqual(["YAML"]);
    expect(formatIssue(errors(parsed.issues)[0] as ConfigIssue)).toContain("multiple documents");
  });

  it("requires schema: 1", () => {
    expect(errorLines(routing((d) => delete d.schema).issues)).toEqual(["config/routing.yaml: schema: is required"]);
    expect(errorLines(routing((d) => (d.schema = 2)).issues)).toEqual(["config/routing.yaml: schema: must be 1"]);
  });

  it("accepts a placeholder only in routing.yaml's Bedrock model and a price entry's model and prices", () => {
    // Every scalar, and every mapping key, of each file in turn becomes a placeholder, short and long. Where §0's
    // list allows one, the file still passes with a NOTE for it; anywhere else it fails that field's rule, with no
    // NOTE. A wildcard price entry is the exception the rules make: its prices must be 0 (P3).
    type Path = (string | number)[];
    const scalars = (v: unknown, path: Path = []): Path[] =>
      Array.isArray(v)
        ? v.flatMap((x, i) => scalars(x, [...path, i]))
        : v !== null && typeof v === "object"
          ? Object.entries(v).flatMap(([k, x]) => scalars(x, [...path, k]))
          : [path];
    const keys = (v: unknown, path: Path = []): Path[] =>
      Array.isArray(v)
        ? v.flatMap((x, i) => keys(x, [...path, i]))
        : v !== null && typeof v === "object"
          ? Object.entries(v).flatMap(([k, x]) => [[...path, k], ...keys(x, [...path, k])])
          : [];
    const parent = (doc: Doc, path: Path): Doc => path.slice(0, -1).reduce<Doc>((at, k) => at[k], doc);
    const withValue = (doc: Doc, path: Path, ph: string): Doc => {
      const copy = structuredClone(doc);
      parent(copy, path)[path.at(-1) as string] = ph;
      return copy;
    };
    const withKey = (doc: Doc, path: Path, ph: string): Doc => {
      const copy = structuredClone(doc);
      const at = parent(copy, path);
      const entries = Object.entries(at).map(([k, v]) => (k === path.at(-1) ? [ph, v] : [k, v]));
      for (const k of Object.keys(at)) delete at[k];
      Object.assign(at, Object.fromEntries(entries));
      return copy;
    };
    const routingDoc = parseYamlText(FULL_ROUTING) as Doc;
    routingDoc.adapters.bedrock.additional_request_fields = { thinking: { type: "disabled" }, tags: ["h4"] };
    const files = [
      {
        doc: routingDoc,
        run: (d: Doc) =>
          validateRouting(parseYaml("config/routing.yaml", stringify(d)), { registeredTypes: ALL_TYPES }),
        allowed: /^adapters\.bedrock\.model$/,
      },
      {
        doc: parseYamlText(fixture("prices.yaml")) as Doc,
        run: (d: Doc) => prices(stringify(d)),
        allowed: /^versions\[\d+\]\.entries\[\d+\]\.(model|input|output|cache_read_input)$/,
      },
      { doc: parseYamlText(fixture("budgets.yaml")) as Doc, run: (d: Doc) => budgets(stringify(d)), allowed: /^$/ },
      { doc: parseYamlText(fixture("alerts.yaml")) as Doc, run: (d: Doc) => alerts(stringify(d)), allowed: /^$/ },
    ];
    const wildcardPrice = /^versions\[0\]\.entries\[0\]\.(input|output)$/; // the fixture's local "*" entry
    const wrong: string[] = [];
    let allowedSeen = 0;
    for (const ph of ["<x>", "<a value only the Author can supply>"]) {
      for (const { doc, run, allowed } of files) {
        expect(errorLines(run(doc).issues)).toEqual([]);
        for (const path of scalars(doc)) {
          const where = formatPath(path);
          const { issues } = run(withValue(doc, path, ph));
          const noted = notes(issues).some((i) => i.path === where);
          if (wildcardPrice.test(where)) {
            if (rulesOf(issues).join() !== "P3") wrong.push(`${ph} at ${where}: not refused by P3 alone`);
          } else if (allowed.test(where)) {
            allowedSeen += 1;
            if (errors(issues).length > 0 || !noted) wrong.push(`${ph} at ${where}: refused, or passed without a NOTE`);
          } else {
            if (errors(issues).length === 0) wrong.push(`${ph} at ${where}: passed`);
            if (noted) wrong.push(`${ph} at ${where}: a NOTE`);
          }
        }
        for (const path of keys(doc)) {
          const where = formatPath(path);
          if (errors(run(withKey(doc, path, ph)).issues).length === 0) wrong.push(`${ph} as the key ${where}: passed`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(allowedSeen).toBe(2 * 5); // bedrock's model; the wildcard's model; the synthetic entry's model and prices
  });

  it("keeps every number's source text", () => {
    const parsed = parseYaml("x.yaml", "a: 5.00\nb: [0.70]\nc: { d: 1e3 }\n");
    expect([...parsed.numberSources]).toEqual([
      ["a", "5.00"],
      ["b[0]", "0.70"],
      ["c.d", "1e3"],
    ]);
  });
});

describe("routing.yaml (§1.3)", () => {
  it("accepts the foundations branch's file, with only openai-compatible registered", () => {
    const text = fixture("routing.yaml");
    const result = validateRouting(parseYaml("config/routing.yaml", text));
    expect(result.issues).toEqual([]);
    const value = result.value as RoutingConfig;
    expect(value.deadlineMs).toBe(20_000);
    expect([...value.adapters.keys()]).toEqual(["local"]);
    expect(value.envs).toEqual({ prod: { primary: "local" }, dev: { primary: "local" } });
    expect(value.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(value.adapters.get("local")?.provider).toBe("local");
  });

  it("accepts the final form once every type is registered, with one NOTE for the placeholder", () => {
    const result = routing();
    expect(errors(result.issues)).toEqual([]);
    expect(notes(result.issues).map(formatIssue)).toEqual([
      "NOTE config/routing.yaml: adapters.bedrock.model: placeholder; the route that names this adapter can't start until the Author fills it",
    ]);
  });

  it("notes a placeholder no route names as waiting for the Author", () => {
    const result = routing((d) => delete d.envs.prod.fallback);
    expect(notes(result.issues).map(formatIssue)).toEqual([
      "NOTE config/routing.yaml: adapters.bedrock.model: placeholder; no route names it until the Author fills it",
    ]);
  });

  it("R1: every primary is local", () => {
    expect(errorLines(routing((d) => (d.envs.prod.primary = "bedrock")).issues)).toContain(
      'config/routing.yaml: envs.prod.primary: names "bedrock", a paid adapter; every primary must be local (FR-022)',
    );
    expect(rulesOf(routing((d) => (d.envs.dev.primary = "synthetic")).issues)).toContain("R1");
  });

  it("R2: a paid adapter is routed only in prod", () => {
    expect(errorLines(routing((d) => (d.envs.dev.fallback = "bedrock")).issues)).toEqual([
      'config/routing.yaml: envs.dev.fallback: names "bedrock", a paid adapter; a paid adapter may be routed only in envs.prod (FR-031)',
    ]);
  });

  it("R3: synthetic spend exists only in dev", () => {
    expect(errorLines(routing((d) => (d.envs.prod.fallback = "synthetic")).issues)).toEqual([
      'config/routing.yaml: envs.prod.fallback: names "synthetic", a synthetic adapter; synthetic spend exists only in dev (FR-036)',
    ]);
  });

  it("R4: a route names a defined adapter", () => {
    expect(errorLines(routing((d) => (d.envs.prod.fallback = "openrouter")).issues)).toEqual([
      'config/routing.yaml: envs.prod.fallback: names "openrouter", which isn\'t defined under adapters',
    ]);
  });

  it("R5: a kind the type allows, so no paid service is declared local", () => {
    expect(errorLines(routing((d) => (d.adapters.local.kind = "paid")).issues)).toContain(
      'config/routing.yaml: adapters.local.kind: "paid" isn\'t allowed for type "openai-compatible" (FR-031)',
    );
    expect(rulesOf(routing((d) => (d.adapters.bedrock.kind = "local")).issues)).toContain("R5");
    expect(rulesOf(routing((d) => (d.adapters.synthetic.kind = "paid")).issues)).toContain("R5");
  });

  it("R6: a registered type; the foundations branch registers openai-compatible alone (§1.2's steps)", () => {
    const result = routing(() => {}, new Set(["openai-compatible"]));
    expect(errorLines(result.issues)).toEqual([
      'config/routing.yaml: adapters.bedrock.type: "bedrock-converse" isn\'t a registered adapter type (FR-021)',
      'config/routing.yaml: adapters.synthetic.type: "synthetic" isn\'t a registered adapter type (FR-021)',
    ]);
    expect(rulesOf(routing((d) => (d.adapters.local.type = "openai")).issues)).toEqual(["R6"]);
  });

  it("R7: Bedrock in us-east-1, the region the disclosure lists", () => {
    expect(errorLines(routing((d) => (d.adapters.bedrock.region = "us-west-2")).issues)).toEqual([
      "config/routing.yaml: adapters.bedrock.region: must be us-east-1, the region docs/data-flow-disclosure.md lists (FR-040)",
    ]);
  });

  it("R8: a paid adapter's connect and request timeouts fit SC-005's 5 s", () => {
    const result = routing((d) => (d.adapters.bedrock.timeouts = { connect_ms: 2000, request_ms: 4000 }));
    expect(errorLines(result.issues)).toEqual([
      "config/routing.yaml: adapters.bedrock.timeouts: connect_ms + request_ms must be at most 5000 (SC-005)",
    ]);
    expect(
      errors(routing((d) => (d.adapters.bedrock.timeouts = { connect_ms: 1000, request_ms: 4000 })).issues),
    ).toEqual([]);
  });

  it("R9: the deadline covers the route's timeouts", () => {
    // local 10,000 + bedrock 4,000 × (1 + 1) + 250 + 500 = 18,750
    expect(errorLines(routing((d) => (d.deadline_ms = 18_000)).issues)).toEqual([
      "config/routing.yaml: deadline_ms: 18000 is shorter than the route's timeouts allow (18750)",
    ]);
    expect(errors(routing((d) => (d.deadline_ms = 18_750)).issues)).toEqual([]);
    const local = validateRouting(
      parseYaml("config/routing.yaml", fixture("routing.yaml").replace("request_ms: 10000", "request_ms: 25000")),
    );
    expect(errorLines(local.issues)).toEqual([
      "config/routing.yaml: deadline_ms: 20000 is shorter than the route's timeouts allow (25500)",
    ]);
  });

  it("R10: envs has exactly prod and dev", () => {
    expect(errorLines(routing((d) => delete d.envs.dev).issues)).toEqual([
      "config/routing.yaml: envs: must have exactly the keys prod and dev",
    ]);
    expect(rulesOf(routing((d) => (d.envs.staging = { primary: "local" })).issues)).toEqual(["R10"]);
  });

  it("R11: unknown keys, wrong types, and out-of-range values, named by their paths", () => {
    expect(errorLines(routing((d) => (d.colour = "blue")).issues)).toEqual([
      "config/routing.yaml: colour: unknown key",
    ]);
    expect(errorLines(routing((d) => (d.adapters.local.colour = "blue")).issues)).toEqual([
      "config/routing.yaml: adapters.local.colour: unknown key",
    ]);
    expect(errorLines(routing((d) => (d.adapters.local.timeouts.connect_ms = "fast")).issues)).toEqual([
      "config/routing.yaml: adapters.local.timeouts.connect_ms: must be a number",
    ]);
    expect(errorLines(routing((d) => (d.adapters.local.timeouts.connect_ms = 50)).issues)).toEqual([
      "config/routing.yaml: adapters.local.timeouts.connect_ms: must be at least 100",
    ]);
    expect(errorLines(routing((d) => (d.adapters.local.timeouts.request_ms = 1500.5)).issues)).toEqual([
      "config/routing.yaml: adapters.local.timeouts.request_ms: must be a whole number",
    ]);
    expect(errorLines(routing((d) => delete d.adapters.local.base_url_env).issues)).toEqual([
      "config/routing.yaml: adapters.local.base_url_env: is required",
    ]);
    expect(errorLines(routing((d) => (d.adapters.local.model_env = "local_model")).issues)).toEqual([
      "config/routing.yaml: adapters.local.model_env: must match ^[A-Z][A-Z0-9_]*$",
    ]);
    expect(errorLines(routing((d) => (d.deadline_ms = 30_000)).issues)).toEqual([
      "config/routing.yaml: deadline_ms: must be at most 25000",
    ]);
    expect(errorLines(routing((d) => (d.adapters.synthetic.output_tokens = 0)).issues)).toEqual([
      "config/routing.yaml: adapters.synthetic.output_tokens: must be at least 1",
    ]);
    expect(rulesOf(routing((d) => (d.adapters.bedrock.retry.on = ["slow"])).issues)).toEqual(["R11"]);
    expect(rulesOf(routing((d) => (d.adapters.bedrock.model = "Not An ID")).issues)).toEqual(["R11"]);
    expect(rulesOf(routing((d) => (d.adapters.local.kind = "free")).issues)).toEqual(["R11"]);
  });

  it("R11: an adapter ID matches ^[a-z][a-z0-9-]{0,31}$", () => {
    const result = routing((d) => {
      d.adapters.Local = d.adapters.local;
      delete d.adapters.local;
      d.envs.prod.primary = "Local";
      d.envs.dev.primary = "Local";
    });
    expect(errorLines(result.issues)).toEqual([
      "config/routing.yaml: adapters.Local: adapter IDs match ^[a-z][a-z0-9-]{0,31}$",
    ]);
  });

  it("R11: the settings rules a schema can't say", () => {
    expect(errorLines(routing((d) => (d.adapters.local.health.timeout_ms = 1000)).issues)).toEqual([
      "config/routing.yaml: adapters.local.health.timeout_ms: must be less than health.interval_ms",
    ]);
    expect(errorLines(routing((d) => (d.adapters.local.provider = "openai")).issues)).toEqual([
      'config/routing.yaml: adapters.local.provider: must be "local" when kind is local',
    ]);
    expect(
      errorLines(routing((d) => (d.adapters.bedrock.additional_request_fields = { note: "x".repeat(1_100) })).issues),
    ).toEqual(["config/routing.yaml: adapters.bedrock.additional_request_fields: must be at most 1 KB as JSON"]);
    const extra = (fields: Doc) => routing((d) => (d.adapters.bedrock.additional_request_fields = fields));
    expect(errorLines(extra({ thinking: { type: "<on or off>" } }).issues)).toEqual([
      `config/routing.yaml: adapters.bedrock.additional_request_fields.thinking.type: ${NOT_HERE}`,
    ]);
    expect(errorLines(extra({ "<the field that turns thinking off>": false, stop: ["<x>"] }).issues)).toEqual([
      `config/routing.yaml: adapters.bedrock.additional_request_fields.<the field that turns thinking off>: ${NOT_HERE}`,
      `config/routing.yaml: adapters.bedrock.additional_request_fields.stop[0]: ${NOT_HERE}`,
    ]);
    expect(notes(extra({ thinking: { type: "<on or off>" } }).issues)).toEqual([]); // an error, never a NOTE
    expect(errorLines(extra({ thinking: { type: "disabled" }, note: "<a>b" }).issues)).toEqual([]);
    expect(errorLines(routing((d) => (d.envs.prod.fallback = "local")).issues)).toEqual([
      'config/routing.yaml: envs.prod.fallback: names "local", a local adapter; prod\'s fallback must be a paid adapter',
    ]);
  });
});

describe("routing.yaml's startup refusals (§1.4)", () => {
  it("passes the foundations branch's file on every stack", () => {
    const value = validateRouting(parseYaml("config/routing.yaml", fixture("routing.yaml"))).value as RoutingConfig;
    const table = pricesTable(fixture("prices.yaml"));
    expect(checkStartup({ routing: value, prices: table }, PROD_ENV, NOW)).toEqual([]);
    expect(checkStartup({ routing: value, prices: table }, DEV_ENV, NOW)).toEqual([]);
    expect(checkStartup({ routing: value, prices: table }, { ...DEV_ENV, H4_STACK: "dev-cpu" }, NOW)).toEqual([]);
  });

  it("paid_route_outside_prod: rechecked against the gateway's own H4_ENV", () => {
    // R2 makes this impossible in a valid file, so the config is built by hand.
    const valid = routingConfig(withModel);
    const config: RoutingConfig = { ...valid, envs: { ...valid.envs, dev: { primary: "local", fallback: "bedrock" } } };
    const refusals = checkStartup({ routing: config, prices: pricesTable(fixture("prices.yaml")) }, DEV_ENV, NOW);
    expect(refusals.map((r) => r.reason)).toContain("paid_route_outside_prod");
  });

  it("synthetic_in_prod", () => {
    const valid = routingConfig();
    const config: RoutingConfig = {
      ...valid,
      envs: { ...valid.envs, prod: { primary: "local", fallback: "synthetic" } },
    };
    const refusals = checkStartup({ routing: config, prices: pricesTable(fixture("prices.yaml")) }, PROD_ENV, NOW);
    expect(refusals.map((r) => r.reason)).toEqual(["synthetic_in_prod"]);
  });

  it("placeholder_value: prod's route uses Bedrock's placeholder model; dev's route doesn't", () => {
    const config = routingConfig();
    const table = pricesTable(fixture("prices.yaml"));
    expect(checkStartup({ routing: config, prices: table }, PROD_ENV, NOW)).toEqual([
      {
        reason: "placeholder_value",
        path: "config/routing.yaml: adapters.bedrock.model",
        message: "the route uses a placeholder the Author hasn't filled",
      },
    ]);
    expect(checkStartup({ routing: config, prices: table }, DEV_ENV, NOW)).toEqual([]);
  });

  it("local_url_not_in_stack: http, one DNS label, an optional port and path; never the URL in the message", () => {
    const config = routingConfig();
    const table = pricesTable(fixture("prices.yaml"));
    for (const url of [
      "https://model-server:8080/v1",
      "http://model-server.example.com/v1",
      "http://10.0.0.5:8080/v1",
      "http://model-server:8080/v1?debug=1",
      "http://operator@model-server/v1",
      "http://MODEL-SERVER/v1",
      // One label that URL parsing and getaddrinfo read as an IPv4 address, in decimal, hex, or octal:
      "http://134744072:8080/v1", // 8.8.8.8
      "http://2852039166/latest", // 169.254.169.254, the instance-metadata address
      "http://0x7f000001:8080/v1", // 127.0.0.1
      "http://017700000001/v1", // 127.0.0.1
      // A compose service name starts with a letter.
      "http://1model/v1",
    ]) {
      const refusals = checkStartup({ routing: config, prices: table }, { ...DEV_ENV, LOCAL_MODEL_BASE_URL: url }, NOW);
      expect(refusals.map((r) => [r.reason, r.key])).toEqual([["local_url_not_in_stack", "LOCAL_MODEL_BASE_URL"]]);
      expect(JSON.stringify(refusals)).not.toContain(url);
    }
    for (const url of [
      "http://model-server:8080/v1",
      "http://model-server",
      "http://model-server/v1/",
      "http://deadbeef/v1",
    ]) {
      expect(checkStartup({ routing: config, prices: table }, { ...DEV_ENV, LOCAL_MODEL_BASE_URL: url }, NOW)).toEqual(
        [],
      );
    }
  });

  it("missing_env: the keys base_url_env and model_env name", () => {
    const config = routingConfig();
    const table = pricesTable(fixture("prices.yaml"));
    const withoutName = { ...DEV_ENV, LOCAL_MODEL_NAME: undefined };
    expect(checkStartup({ routing: config, prices: table }, withoutName, NOW)).toEqual([
      {
        reason: "missing_env",
        key: "LOCAL_MODEL_NAME",
        message: "LOCAL_MODEL_NAME is unset; routing.yaml's model_env names it",
      },
    ]);
    expect(
      checkStartup({ routing: config, prices: table }, { ...DEV_ENV, LOCAL_MODEL_BASE_URL: "" }, NOW).map((r) => r.key),
    ).toEqual(["LOCAL_MODEL_BASE_URL"]);
  });

  it("invalid_config: any §1.3 error, one refusal per error line", () => {
    const parsed = {
      "routing.yaml": parseYaml("config/routing.yaml", FULL_ROUTING),
      "prices.yaml": parseYaml("config/prices.yaml", fixture("prices.yaml")),
      "budgets.yaml": parseYaml("config/budgets.yaml", fixture("budgets.yaml")),
      "alerts.yaml": parseYaml("config/alerts.yaml", fixture("alerts.yaml")),
    };
    // The build before T102 registered openai-compatible and synthetic alone (tasks.md T073): that set makes the
    // full file's bedrock adapter the §1.3 error here, now that this build registers bedrock-converse too.
    const set = validateConfigFiles(parsed, { registeredTypes: new Set(["openai-compatible", "synthetic"]) });
    const refusals = startupRefusals(set, DEV_ENV, NOW);
    expect(refusals.map((r) => r.reason)).toEqual(["invalid_config"]);
    expect(refusals[0]?.message).toBe(
      'config/routing.yaml: adapters.bedrock.type: "bedrock-converse" isn\'t a registered adapter type (FR-021)',
    );
  });
});

describe("prices.yaml (§2.4)", () => {
  const VERSION_2 = `
  - id: "2026-11-01.1"
    effective_from: "2026-11-01T00:00:00Z"
    source: "test"
    entries:
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: synthetic
        model: metered-test
        input: 0
        output: 100
`;

  it("accepts the foundations branch's file", () => {
    const result = prices(fixture("prices.yaml"));
    expect(result.issues).toEqual([]);
    const table = result.value as PriceTable;
    expect(table.versions.map((v) => v.id)).toEqual(["2026-10-08.1"]);
    const v = table.active(NOW);
    expect(v?.id).toBe("2026-10-08.1");
    expect(PriceTable.lookup(v!, "synthetic", "metered-test")?.output).toBe(100_000_000n);
    expect(PriceTable.lookup(v!, "local", "qwen2.5-0.5b-instruct")?.model).toBe("*");
    expect(PriceTable.lookup(v!, "aws.bedrock", "any")).toBeUndefined();
  });

  it("picks the latest version in effect by the gateway clock, so a future version takes over by itself", () => {
    const table = pricesTable(fixture("prices.yaml") + VERSION_2);
    expect(table.active(at("2026-10-31T23:59:59.999Z"))?.id).toBe("2026-10-08.1");
    expect(table.active(at("2026-11-01T00:00:00Z"))?.id).toBe("2026-11-01.1");
    expect(table.active(at("2026-10-07T23:59:59Z"))).toBeUndefined();
    expect(table.later(table.versions[0]!).map((v) => v.id)).toEqual(["2026-11-01.1"]);
  });

  it("P1: effective_from strictly increases, and ids are unique", () => {
    const same = fixture("prices.yaml") + VERSION_2.replace("2026-11-01T00:00:00Z", "2026-10-08T00:00:00Z");
    expect(errorLines(prices(same).issues)).toEqual([
      "config/prices.yaml: versions: effective_from must strictly increase, and ids must be unique",
    ]);
    const earlier = fixture("prices.yaml") + VERSION_2.replace("2026-11-01T00:00:00Z", "2026-09-01T00:00:00Z");
    expect(rulesOf(prices(earlier).issues)).toEqual(["P1"]);
    const sameId = fixture("prices.yaml") + VERSION_2.replace('"2026-11-01.1"', '"2026-10-08.1"');
    expect(rulesOf(prices(sameId).issues)).toEqual(["P1"]);
  });

  it("P2: at most 6 decimal places, from 0 to 1000, as written: never through a float", () => {
    const withOutput = (v: string) => fixture("prices.yaml").replace("output: 100", `output: ${v}`);
    const line = "config/prices.yaml: versions[0].entries[1].output: at most 6 decimal places, from 0 to 1000";
    for (const v of ["0.1234567", "1000.000001", "-1", "1e2", '"0.1234567"', '"abc"', "100.0000000000000001"]) {
      expect(errorLines(prices(withOutput(v)).issues), v).toEqual([line]);
    }
    for (const [v, micro] of [
      ["1000", 1_000_000_000n],
      ["0.123456", 123_456n],
      ['"0.5"', 500_000n],
      ["100.000000", 100_000_000n],
    ] as const) {
      const entry = pricesTable(withOutput(v)).versions[0]?.entries[1];
      expect(entry?.output, v).toBe(micro);
    }
  });

  it("P3: model * only when every price in the entry is 0", () => {
    const text = fixture("prices.yaml").replace("model: metered-test", 'model: "*"');
    expect(errorLines(prices(text).issues)).toEqual([
      'config/prices.yaml: versions[0].entries[1].model: "*" is allowed only when every price in the entry is 0',
    ]);
  });

  it("P4: one entry per provider and model in a version", () => {
    const text = fixture("prices.yaml")
      .replace("provider: synthetic", "provider: local")
      .replace("model: metered-test", 'model: "*"');
    const lines = errorLines(prices(text).issues);
    expect(lines).toContain('config/prices.yaml: versions[0].entries: provider and model "local/*" appear twice');
  });

  it("P5: published versions never change; appending one is fine", () => {
    const main = parseYaml("config/prices.yaml", fixture("prices.yaml"));
    const same = parseYaml("config/prices.yaml", fixture("prices.yaml"));
    expect(checkPricesAppendOnly(same, main)).toEqual([]);
    const appended = parseYaml("config/prices.yaml", fixture("prices.yaml") + VERSION_2);
    expect(checkPricesAppendOnly(appended, main)).toEqual([]);
    const changed = parseYaml("config/prices.yaml", fixture("prices.yaml").replace("output: 100", "output: 90"));
    expect(errorLines(checkPricesAppendOnly(changed, main))).toEqual([
      "config/prices.yaml: versions[0]: differs from the same version on main; published versions never change",
    ]);
    const dropped = parseYaml("config/prices.yaml", fixture("prices.yaml").replace("2026-10-08.1", "2026-10-09.1"));
    expect(rulesOf(checkPricesAppendOnly(dropped, main))).toEqual(["P5"]);
  });

  it("P5: without main's copy, a NOTE", () => {
    const issues = checkPricesAppendOnly(parseYaml("config/prices.yaml", fixture("prices.yaml")), undefined);
    expect(issues.map(formatIssue)).toEqual([
      "NOTE config/prices.yaml: main has no config/prices.yaml yet, so the append-only check waits for it",
    ]);
  });

  it("P6: unknown keys, wrong types, and bad timestamps", () => {
    expect(errorLines(prices(fixture("prices.yaml").replace("currency: USD", "currency: EUR")).issues)).toEqual([
      'config/prices.yaml: currency: must be "USD"',
    ]);
    expect(errorLines(prices(fixture("prices.yaml").replace('"2026-10-08T00:00:00Z"', '"2026-10-08"')).issues)).toEqual(
      ["config/prices.yaml: versions[0].effective_from: must be an RFC 3339 time in UTC, such as 2026-10-08T00:00:00Z"],
    );
    expect(
      rulesOf(prices(fixture("prices.yaml").replace('"2026-10-08T00:00:00Z"', '"2026-02-30T00:00:00Z"')).issues),
    ).toEqual(["P6"]);
    expect(
      rulesOf(prices(fixture("prices.yaml").replace('"2026-10-08T00:00:00Z"', '"2026-10-08T02:00:00+02:00"')).issues),
    ).toEqual(["P6"]);
    expect(
      errorLines(prices(fixture("prices.yaml").replace("output: 100", "output: 100\n        tier: gold")).issues),
    ).toEqual(["config/prices.yaml: versions[0].entries[1].tier: unknown key"]);
    expect(errorLines(prices("schema: 1\ncurrency: USD\nunit: per_million_tokens\nversions: []\n").issues)).toEqual([
      "config/prices.yaml: versions: must have at least 1 item",
    ]);
  });

  it("P6: a placeholder outside an entry's model and prices (§0)", () => {
    const p6 = (from: string, to: string) => prices(fixture("prices.yaml").replace(from, to)).issues;
    expect(errorLines(p6('"spec 000: local and synthetic only"', '"<the page the price came from>"'))).toEqual([
      `config/prices.yaml: versions[0].source: ${NOT_HERE}`,
    ]);
    expect(errorLines(p6("provider: synthetic", 'provider: "<provider>"'))).toEqual([
      `config/prices.yaml: versions[0].entries[1].provider: ${NOT_HERE}`,
    ]);
    expect(rulesOf(p6("provider: synthetic", 'provider: "<provider>"'))).toEqual(["P6"]);
    expect(notes(p6("provider: synthetic", 'provider: "<provider>"'))).toEqual([]);
  });

  it("P7: a paid model is never free (checked across files)", () => {
    const doc = parseYamlText(FULL_ROUTING) as Doc;
    withModel(doc);
    const files = (priceText: string) => ({
      "routing.yaml": parseYaml("config/routing.yaml", stringify(doc)),
      "prices.yaml": parseYaml("config/prices.yaml", priceText),
    });
    const bedrockEntry = (input: string, output: string) =>
      fixture("prices.yaml") +
      `      - provider: aws.bedrock\n        model: ${BEDROCK_MODEL}\n        input: ${input}\n        output: ${output}\n`;
    const opts = { registeredTypes: ALL_TYPES };
    expect(errorLines(validateConfigFiles(files(bedrockEntry("0", "5")), opts).issues)).toEqual([
      `config/prices.yaml: versions[0].entries[2]: prices aws.bedrock/${BEDROCK_MODEL} at 0 for input or output, but routing.yaml's paid adapter "bedrock" sends ${BEDROCK_MODEL}; a paid model is never free`,
    ]);
    expect(rulesOf(validateConfigFiles(files(bedrockEntry("1", "0")), opts).issues)).toEqual(["P7"]);
    const wildcard =
      fixture("prices.yaml") +
      '      - provider: aws.bedrock\n        model: "*"\n        input: 0\n        output: 0\n';
    expect(rulesOf(validateConfigFiles(files(wildcard), opts).issues)).toEqual(["P7"]);
    expect(errors(validateConfigFiles(files(bedrockEntry("1", "5")), opts).issues)).toEqual([]);
  });

  it("notes a placeholder price", () => {
    const text = fixture("prices.yaml").replace("output: 100", 'output: "<USD per million output tokens>"');
    const result = prices(text);
    expect(errors(result.issues)).toEqual([]);
    expect(notes(result.issues).map(formatIssue)).toEqual([
      "NOTE config/prices.yaml: versions[0].entries[1].output: placeholder; a route that uses this entry can't start until the Author fills it",
    ]);
  });
});

describe("prices.yaml's startup refusals (§2.5)", () => {
  it("no_active_price_version: nothing is in effect yet by the gateway clock", () => {
    const config = { routing: routingConfig(), prices: pricesTable(fixture("prices.yaml")) };
    expect(checkStartup(config, DEV_ENV, at("2026-10-07T23:59:59Z")).map((r) => r.reason)).toEqual([
      "no_active_price_version",
    ]);
  });

  it("price_missing: a routed metered adapter needs an entry in the active version and every later one", () => {
    const noSynthetic = `schema: 1
currency: USD
unit: per_million_tokens
versions:
  - id: "2026-10-08.1"
    effective_from: "2026-10-08T00:00:00Z"
    source: "test"
    entries:
      - { provider: local, model: "*", input: 0, output: 0 }
`;
    const config = routingConfig();
    expect(checkStartup({ routing: config, prices: pricesTable(noSynthetic) }, DEV_ENV, NOW)).toEqual([
      {
        reason: "price_missing",
        path: "config/prices.yaml: 2026-10-08.1",
        message: "version 2026-10-08.1 has no price for synthetic/metered-test, which the dev route uses",
      },
    ]);
    const laterDropsIt =
      fixture("prices.yaml") +
      '  - id: "2026-12-01.1"\n    effective_from: "2026-12-01T00:00:00Z"\n    source: "test"\n    entries:\n      - { provider: local, model: "*", input: 0, output: 0 }\n';
    expect(
      checkStartup({ routing: config, prices: pricesTable(laterDropsIt) }, DEV_ENV, NOW).map((r) => [r.reason, r.path]),
    ).toEqual([["price_missing", "config/prices.yaml: 2026-12-01.1"]]);
  });

  it("placeholder_value: a price entry the route uses still holds a placeholder", () => {
    const config = routingConfig(withModel);
    const table = pricesTable(
      fixture("prices.yaml") +
        `      - provider: aws.bedrock\n        model: ${BEDROCK_MODEL}\n        input: "<USD per million input tokens>"\n        output: 5\n`,
    );
    expect(checkStartup({ routing: config, prices: table }, PROD_ENV, NOW)).toEqual([
      {
        reason: "placeholder_value",
        path: "config/prices.yaml: 2026-10-08.1",
        message: `the price of aws.bedrock/${BEDROCK_MODEL} in version 2026-10-08.1 is a placeholder`,
      },
    ]);
  });

  it("invalid_config: any §2.4 error", () => {
    const parsed = {
      "routing.yaml": parseYaml("config/routing.yaml", fixture("routing.yaml")),
      "prices.yaml": parseYaml(
        "config/prices.yaml",
        fixture("prices.yaml").replace('model: "*"', 'model: "*"\n        tier: x'),
      ),
      "budgets.yaml": parseYaml("config/budgets.yaml", fixture("budgets.yaml")),
      "alerts.yaml": parseYaml("config/alerts.yaml", fixture("alerts.yaml")),
    };
    expect(startupRefusals(validateConfigFiles(parsed), DEV_ENV, NOW)).toEqual([
      {
        reason: "invalid_config",
        path: "config/prices.yaml: versions[0].entries[0].tier",
        message: "config/prices.yaml: versions[0].entries[0].tier: unknown key",
      },
    ]);
  });
});

describe("cost (§2.3)", () => {
  it("is exactly $0.10 for the synthetic call: 1,000 tokens at $100 per million", () => {
    const entry = PriceTable.lookup(pricesTable(fixture("prices.yaml")).versions[0]!, "synthetic", "metered-test")!;
    expect(costMicro(entry, { inputTokens: 0, outputTokens: 1_000 })).toBe(100_000n);
  });

  it("rounds the sum up once: the contract's worked example costs 17 micro-USD", () => {
    const table = pricesTable(
      fixture("prices.yaml") +
        "      - provider: example\n        model: m\n        input: 0.123456\n        output: 0.654321\n",
    );
    const entry = PriceTable.lookup(table.versions[0]!, "example", "m")!;
    expect(entry.input).toBe(123_456n);
    expect(entry.output).toBe(654_321n);
    expect(costMicro(entry, { inputTokens: 41, outputTokens: 18 })).toBe(17n);
  });

  it("never rounds per term: two terms of 0.4 micro-USD cost 1, not 2", () => {
    const table = pricesTable(
      fixture("prices.yaml") + "      - provider: example\n        model: m\n        input: 0.4\n        output: 0.4\n",
    );
    const entry = PriceTable.lookup(table.versions[0]!, "example", "m")!;
    expect(costMicro(entry, { inputTokens: 1, outputTokens: 1 })).toBe(1n);
    expect(costMicro(entry, { inputTokens: 0, outputTokens: 0 })).toBe(0n);
  });

  it("prices cache reads at the input price unless the entry gives one, which never undercounts", () => {
    const base =
      fixture("prices.yaml") + "      - provider: example\n        model: m\n        input: 3\n        output: 15\n";
    const implicit = PriceTable.lookup(pricesTable(base).versions[0]!, "example", "m")!;
    expect(costMicro(implicit, { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000 })).toBe(3_000_000n);
    const explicit = PriceTable.lookup(
      pricesTable(base + "        cache_read_input: 0.3\n").versions[0]!,
      "example",
      "m",
    )!;
    expect(costMicro(explicit, { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000 })).toBe(300_000n);
  });

  it("is deterministic, and refuses a placeholder price or a bad token count", () => {
    const entry = PriceTable.lookup(pricesTable(fixture("prices.yaml")).versions[0]!, "synthetic", "metered-test")!;
    const usage = { inputTokens: 123, outputTokens: 456 };
    expect(costMicro(entry, usage)).toBe(costMicro(entry, usage));
    expect(() => costMicro(entry, { inputTokens: -1, outputTokens: 0 })).toThrow(RangeError);
    expect(() => costMicro(entry, { inputTokens: 1.5, outputTokens: 0 })).toThrow(RangeError);
    const placeholder = pricesTable(fixture("prices.yaml").replace("output: 100", 'output: "<later>"')).versions[0]!;
    expect(() => costMicro(PriceTable.lookup(placeholder, "synthetic", "metered-test")!, usage)).toThrow(/placeholder/);
  });
});

describe("budgets.yaml (§3.3)", () => {
  it("accepts the plan's values", () => {
    const result = budgets(fixture("budgets.yaml"));
    expect(result.issues).toEqual([]);
    const value = result.value!;
    expect(value.timing).toEqual({ timezone: "UTC", reservationTtlS: 120 });
    expect(value.envs.prod).toEqual({
      dailyMicro: 5_000_000n,
      monthlyMicro: 20_000_000n,
      fallbackDailyMicro: 2_000_000n,
      warnRatioBp: 7_000n,
    });
    expect(value.limits).toEqual({
      perClient: { requestsPerMinute: 20, burst: 5, requestsPerDay: 500, meteredInFlight: 1 },
      global: { meteredInFlight: 4, meteredPerMinute: 60 },
      perCall: { maxInputChars: 2_000, helloMaxOutputTokens: 128, maxOutputTokens: 512 },
    });
  });

  it("pins prod's thresholds: $3.50, $14.00, and a first-grant warning at $1.40 (FR-030)", () => {
    const t = thresholds(budgets(fixture("budgets.yaml")).value!.envs.prod);
    expect(t.dayCeiling).toBe(5_000_000n);
    expect(t.monthCeiling).toBe(20_000_000n);
    expect(t.dayWarn).toBe(3_500_000n);
    expect(t.monthWarn).toBe(14_000_000n);
    expect(t.fallbackGrant).toBe(2_000_000n);
    expect(t.fallbackWarn(2_000_000n)).toBe(1_400_000n);
    // A same-day renewal's grant (data-model.md §6.2): the allowance minus $0.60.
    expect(t.fallbackWarn(4_000_000n)).toBe(3_400_000n);
  });

  const realBudgets = join(REPO, "config/budgets.yaml");
  it.skipIf(!existsSync(realBudgets))(
    "pins the same thresholds in the committed config/budgets.yaml (tasks.md T022)",
    () => {
      const result = budgets(readFileSync(realBudgets, "utf8"));
      expect(errorLines(result.issues)).toEqual([]);
      for (const env of ["prod", "dev"] as const) {
        const t = thresholds(result.value!.envs[env]);
        expect([t.dayWarn, t.monthWarn, t.fallbackWarn(t.fallbackGrant)]).toEqual([
          3_500_000n,
          14_000_000n,
          1_400_000n,
        ]);
        expect([t.dayCeiling, t.monthCeiling, t.fallbackGrant]).toEqual([5_000_000n, 20_000_000n, 2_000_000n]);
      }
    },
  );

  it("converts USD amounts exactly, whether written as numbers or decimal strings", () => {
    for (const v of ["5", "5.00", '"5.00"', '"5"', "5.000000"]) {
      const text = fixture("budgets.yaml").replaceAll("daily_usd: 5.00", `daily_usd: ${v}`);
      expect(budgets(text).value?.envs.prod.dailyMicro, v).toBe(5_000_000n);
    }
    const tiny = fixture("budgets.yaml").replaceAll("fallback_daily_usd: 2.00", "fallback_daily_usd: 0.000001");
    expect(budgets(tiny).value?.envs.dev.fallbackDailyMicro).toBe(1n);
  });

  it("B1: the timezone is UTC", () => {
    expect(
      errorLines(budgets(fixture("budgets.yaml").replace("timezone: UTC", "timezone: Europe/London")).issues),
    ).toEqual(["config/budgets.yaml: timing.timezone: must be UTC (FR-031)"]);
  });

  it("B2: the sub-budget counts inside the daily ceiling", () => {
    const text = fixture("budgets.yaml").replaceAll("fallback_daily_usd: 2.00", "fallback_daily_usd: 6.00");
    expect(errorLines(budgets(text).issues)).toEqual([
      "config/budgets.yaml: envs.prod.fallback_daily_usd: must be at most daily_usd; the sub-budget counts inside the daily ceiling (FR-030)",
      "config/budgets.yaml: envs.dev.fallback_daily_usd: must be at most daily_usd; the sub-budget counts inside the daily ceiling (FR-030)",
    ]);
  });

  it("B3: the month is at least the day", () => {
    const text = fixture("budgets.yaml").replaceAll("monthly_usd: 20.00", "monthly_usd: 4.99");
    expect(errorLines(budgets(text).issues)).toEqual([
      "config/budgets.yaml: envs.prod.monthly_usd: must be at least daily_usd",
      "config/budgets.yaml: envs.dev.monthly_usd: must be at least daily_usd",
    ]);
  });

  it("B4: the warning ratio is more than 0 and less than 1, with at most 4 decimal places", () => {
    for (const v of ["1", "1.0", "0", "0.70001", "-0.5"]) {
      const text = fixture("budgets.yaml").replaceAll("warn_ratio: 0.70", `warn_ratio: ${v}`);
      expect(rulesOf(budgets(text).issues), v).toEqual(["B4", "B4"]);
    }
    expect(
      errorLines(budgets(fixture("budgets.yaml").replaceAll("warn_ratio: 0.70", "warn_ratio: 0.7001")).issues),
    ).toEqual([]);
  });

  it("B5: the limits' rules", () => {
    const limit = (from: string, to: string) => errorLines(budgets(fixture("budgets.yaml").replace(from, to)).issues);
    expect(limit("burst: 5", "burst: 30")).toEqual([
      "config/budgets.yaml: limits.per_client.burst: must be at most requests_per_minute",
    ]);
    expect(limit("requests_per_day: 500", "requests_per_day: 10")).toEqual([
      "config/budgets.yaml: limits.per_client.requests_per_day: must be at least requests_per_minute",
    ]);
    expect(limit("metered_in_flight: 1 }", "metered_in_flight: 5 }")).toEqual([
      "config/budgets.yaml: limits.per_client.metered_in_flight: must be at most limits.global.metered_in_flight",
    ]);
    expect(limit("hello_max_output_tokens: 128", "hello_max_output_tokens: 600")).toEqual([
      "config/budgets.yaml: limits.per_call.hello_max_output_tokens: must be at most max_output_tokens",
    ]);
    expect(limit("metered_in_flight: 4", "metered_in_flight: 33")).toEqual([
      "config/budgets.yaml: limits.global.metered_in_flight: must be at most 32",
    ]);
    expect(
      rulesOf(budgets(fixture("budgets.yaml").replace("max_input_chars: 2000", "max_input_chars: 50")).issues),
    ).toEqual(["B5"]);
  });

  it("B6: a reservation outlives twice the request deadline (checked across files)", () => {
    const files = (ttl: number) => ({
      "routing.yaml": parseYaml("config/routing.yaml", fixture("routing.yaml")),
      "budgets.yaml": parseYaml(
        "config/budgets.yaml",
        fixture("budgets.yaml").replace("reservation_ttl_s: 120", `reservation_ttl_s: ${ttl}`),
      ),
    });
    expect(errorLines(validateConfigFiles(files(40)).issues)).toEqual([
      "config/budgets.yaml: timing.reservation_ttl_s: must be more than twice routing.yaml's deadline_ms in seconds",
    ]);
    expect(errors(validateConfigFiles(files(41)).issues)).toEqual([]);
  });

  it("B7: unknown keys, wrong types, and more than 6 decimal places, named by their paths", () => {
    const b = (from: string, to: string) => errorLines(budgets(fixture("budgets.yaml").replace(from, to)).issues);
    expect(b("daily_usd: 5.00", "daily_usd: 5.1234567")[0]).toBe(
      "config/budgets.yaml: envs.prod.daily_usd: must be a USD amount: a number or a decimal string, at least 0, with at most 6 decimal places",
    );
    expect(b("warn_ratio: 0.70", 'warn_ratio: "0.70"')).toEqual([
      "config/budgets.yaml: envs.prod.warn_ratio: must be a number",
    ]);
    expect(b("timing:", "colour: blue\ntiming:")).toEqual(["config/budgets.yaml: colour: unknown key"]);
    expect(b("  dev:", "  staging: {}\n  dev:")).toEqual(["config/budgets.yaml: envs.staging: unknown key"]);
    expect(b("reservation_ttl_s: 120", "reservation_ttl_s: 20")).toEqual([
      "config/budgets.yaml: timing.reservation_ttl_s: must be at least 30",
    ]);
    expect(rulesOf(budgets(fixture("budgets.yaml").replaceAll("daily_usd: 5.00", "daily_usd: 0")).issues)).toEqual(
      expect.arrayContaining(["B7"]),
    );
  });

  it("B8: dev's thresholds equal prod's, so the breach test rehearses prod's ceilings (FR-031)", () => {
    const text = fixture("budgets.yaml").replace(
      "  dev: # dev and dev-cpu: the same thresholds, applied to synthetic spend (FR-036)\n    daily_usd: 5.00",
      "  dev:\n    daily_usd: 4.00",
    );
    expect(errorLines(budgets(text).issues)).toEqual(["config/budgets.yaml: envs.dev: must equal envs.prod (FR-031)"]);
    const ratio = fixture("budgets.yaml").replace(/(dev:[\s\S]*warn_ratio: )0\.70/, "$10.75");
    expect(rulesOf(budgets(ratio).issues)).toEqual(["B8"]);
  });
});

describe("alerts.yaml (§4.3)", () => {
  const a = (from: string | RegExp, to: string) => errorLines(alerts(fixture("alerts.yaml").replace(from, to)).issues);

  it("accepts the plan's values", () => {
    const result = alerts(fixture("alerts.yaml"));
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual({
      channels: { order: ["telegram", "email"], telegram: { timeoutMs: 5_000 }, email: { timeoutMs: 10_000 } },
      retry: { scheduleS: [5, 15, 30, 60, 120], giveUpAfterS: 300 },
      reminder: { atUtc: "09:00", hour: 9, minute: 0 },
      storeUnreachableAfterS: 60,
      authFailed: { threshold: 3, windowS: 600 },
      prefixes: { prod: "[h4reet.ai prod]", dev: "[dev]", "dev-cpu": "[dev-cpu]" },
      standin: { telegramBase: "http://telegram-standin:8080", smtpHost: "mailpit", smtpPort: 1025 },
    });
  });

  it("A1: Telegram first, email second", () => {
    expect(a("order: [telegram, email]", "order: [email, telegram]")).toEqual([
      "config/alerts.yaml: channels.order: must be [telegram, email] (FR-032: Telegram primary, email secondary)",
    ]);
    expect(a("order: [telegram, email]", "order: [telegram]")[0]).toContain("channels.order");
  });

  it("A2: every attempt fits inside the window", () => {
    expect(a("[5, 15, 30, 60, 120]", "[5, 15, 30, 60, 181]")).toEqual([
      "config/alerts.yaml: retry: the last attempt starts at 291 s and can run 10 s; both must fit in give_up_after_s (300 s)",
    ]);
    // 290 s plus the 10 s email timeout ends exactly at 300 s, which fits.
    expect(a("[5, 15, 30, 60, 120]", "[5, 15, 30, 60, 180]")).toEqual([]);
    expect(a("[5, 15, 30, 60, 120]", "[5, 15, 30, 60, 180, 2]")).toContain(
      "config/alerts.yaml: retry.schedule_s: must never decrease",
    );
  });

  it("A3: within 5 minutes", () => {
    expect(a("give_up_after_s: 300", "give_up_after_s: 301")).toEqual([
      "config/alerts.yaml: retry.give_up_after_s: at most 300 (FR-032: within 5 minutes)",
    ]);
  });

  it("A4: the reminder is HH:MM", () => {
    for (const v of ['"9:00"', '"24:00"', '"09:60"', '"0900"']) {
      expect(a('at_utc: "09:00"', `at_utc: ${v}`), v).toEqual(["config/alerts.yaml: reminder.at_utc: must be HH:MM"]);
    }
  });

  it("A5: prefixes for prod, dev, and dev-cpu, each distinct", () => {
    const line = "config/alerts.yaml: prefixes: needs prod, dev, and dev-cpu, each distinct, of 1 to 32 characters";
    expect(a('  dev-cpu: "[dev-cpu]"\n', "")).toEqual([line]);
    expect(a('dev-cpu: "[dev-cpu]"', 'dev-cpu: "[dev]"')).toEqual([line]);
    expect(a('dev: "[dev]"', 'dev: ""')).toEqual([line]);
    expect(a('dev: "[dev]"', `dev: "${"x".repeat(33)}"`)).toEqual([line]);
    expect(a('dev-cpu: "[dev-cpu]"', 'dev-cpu: "[dev-cpu]"\n  staging: "[staging]"')).toEqual([line]);
    // A placeholder fits 1 to 32 characters, but alerts.yaml allows none (§0).
    expect(a('dev: "[dev]"', 'dev: "<dev prefix>"')).toEqual([`config/alerts.yaml: prefixes.dev: ${NOT_HERE}`]);
  });

  it("A6: the stand-ins are in-network hosts, so stand-in mode can't reach a real service", () => {
    expect(a('"http://telegram-standin:8080"', '"https://api.telegram.org"')).toEqual([
      "config/alerts.yaml: standin.telegram_base: must be an in-network host (a single-label name): http://<host>[:port]",
    ]);
    expect(a('"http://telegram-standin:8080"', '"http://standin.example:8080"')[0]).toContain("standin.telegram_base");
    expect(a("smtp_host: mailpit", "smtp_host: mail.example.com")).toEqual([
      "config/alerts.yaml: standin.smtp_host: must be an in-network host (a single-label name)",
    ]);
    // One label that URL parsing and getaddrinfo read as an IPv4 address, in decimal, hex, or octal.
    for (const host of ["134744072", "2852039166", "0x7f000001", "017700000001", "1mailpit"]) {
      expect(a('"http://telegram-standin:8080"', `"http://${host}:8080"`), host).toEqual([
        "config/alerts.yaml: standin.telegram_base: must be an in-network host (a single-label name): http://<host>[:port]",
      ]);
      expect(a("smtp_host: mailpit", `smtp_host: "${host}"`), host).toEqual([
        "config/alerts.yaml: standin.smtp_host: must be an in-network host (a single-label name)",
      ]);
    }
  });

  it("A7: unknown keys, wrong types, and out-of-range values", () => {
    expect(a("store_unreachable_after_s: 60", "store_unreachable_after_s: 5")).toEqual([
      "config/alerts.yaml: store_unreachable_after_s: must be at least 10",
    ]);
    expect(a("telegram: { timeout_ms: 5000 }", "telegram: { timeout_ms: 500 }")).toEqual([
      "config/alerts.yaml: channels.telegram.timeout_ms: must be at least 1000",
    ]);
    expect(a("[5, 15, 30, 60, 120]", "[1, 1, 1, 1, 1, 1, 1, 1, 1]")).toEqual([
      "config/alerts.yaml: retry.schedule_s: must have at most 8 items",
    ]);
    expect(
      a("auth_failed: { threshold: 3, window_s: 600 }", "auth_failed: { threshold: 3, window_s: 600, mute: true }"),
    ).toEqual(["config/alerts.yaml: auth_failed.mute: unknown key"]);
    expect(a("smtp_port: 1025", "smtp_port: 70000")).toEqual([
      "config/alerts.yaml: standin.smtp_port: must be at most 65535",
    ]);
  });
});

describe("the config directory", () => {
  // The marks as the foundations branch carries them until the config patch (tasks.md T022) adds the two files and
  // empties the build's own map. The tests name their marks, so they hold in either state.
  const T022_MARKS: PlannedFiles = { "budgets.yaml": "T022", "alerts.yaml": "T022" };
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  const dirWith = async (names: string[]): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), "h4-config-"));
    dirs.push(dir);
    for (const n of names) await copyFile(join(FIXTURES, n), join(dir, n));
    return dir;
  };

  it("loads the four files with no issues", async () => {
    const set = await loadConfig(FIXTURES, { allowPlanned: false });
    expect(set.issues).toEqual([]);
    expect(set.planned).toEqual([]);
    expect(set.routing && set.prices && set.budgets && set.alerts).toBeTruthy();
    expect(startupRefusals(set, DEV_ENV, NOW)).toEqual([]);
  });

  it("reports the protected files a patch hasn't applied yet as PLANNED (T022) for validate-config", async () => {
    const dir = await dirWith(["routing.yaml", "prices.yaml"]);
    const files = await readConfigDir(dir, { allowPlanned: true, plannedFiles: T022_MARKS });
    expect(files.issues).toEqual([]);
    expect(files.planned).toEqual([
      { file: "config/budgets.yaml", task: "T022" },
      { file: "config/alerts.yaml", task: "T022" },
    ]);
  });

  it("never lets the gateway start without them: the runtime has no PLANNED state", async () => {
    const dir = await dirWith(["routing.yaml", "prices.yaml"]);
    const set = await loadConfig(dir, { allowPlanned: false });
    expect(errorLines(set.issues)).toEqual(["config/budgets.yaml: missing", "config/alerts.yaml: missing"]);
    expect(startupRefusals(set, DEV_ENV, NOW).map((r) => r.reason)).toEqual(["invalid_config", "invalid_config"]);
  });

  it("fails a stale mark: once the file exists, its PLANNED entry must go", async () => {
    const dir = await dirWith(["routing.yaml", "prices.yaml", "budgets.yaml"]);
    const files = await readConfigDir(dir, { allowPlanned: true, plannedFiles: T022_MARKS });
    expect(files.planned).toEqual([{ file: "config/alerts.yaml", task: "T022" }]);
    expect(errorLines(files.issues)).toEqual([
      "config/budgets.yaml: exists now, so its PLANNED (T022) mark is stale: delete it from PLANNED_CONFIG_FILES in services/gateway/src/config/load.ts",
    ]);
  });

  it("treats a missing unprotected file as an error in both modes", async () => {
    const dir = await dirWith(["prices.yaml"]);
    for (const allowPlanned of [true, false]) {
      const files = await readConfigDir(dir, { allowPlanned, plannedFiles: T022_MARKS });
      expect(errorLines(files.issues)).toContain("config/routing.yaml: missing");
    }
  });

  it("holds a missing protected file to an error once its mark is gone, as after the config patch", async () => {
    const two = await dirWith(["routing.yaml", "prices.yaml"]);
    const missing = await readConfigDir(two, { allowPlanned: true, plannedFiles: {} });
    expect(missing.planned).toEqual([]);
    expect(errorLines(missing.issues)).toEqual(["config/budgets.yaml: missing", "config/alerts.yaml: missing"]);
    const four = await dirWith(["routing.yaml", "prices.yaml", "budgets.yaml", "alerts.yaml"]);
    const present = await readConfigDir(four, { allowPlanned: true, plannedFiles: {} });
    expect(present.issues).toEqual([]);
    expect(present.planned).toEqual([]);
    expect(Object.keys(present.parsed)).toEqual(["routing.yaml", "prices.yaml", "budgets.yaml", "alerts.yaml"]);
  });

  it("applies the build's own marks, PLANNED_CONFIG_FILES, when the caller names none", async () => {
    for (const names of [
      ["routing.yaml", "prices.yaml"],
      ["routing.yaml", "prices.yaml", "budgets.yaml", "alerts.yaml"],
    ]) {
      const dir = await dirWith(names);
      const implicit = await readConfigDir(dir, { allowPlanned: true });
      const explicit = await readConfigDir(dir, { allowPlanned: true, plannedFiles: PLANNED_CONFIG_FILES });
      expect([implicit.issues, implicit.planned], names.join(" ")).toEqual([explicit.issues, explicit.planned]);
    }
  });

  it("validates the committed config/routing.yaml and config/prices.yaml", async () => {
    const dir = await dirWith(["budgets.yaml", "alerts.yaml"]);
    for (const n of ["routing.yaml", "prices.yaml"]) {
      await writeFile(join(dir, n), readFileSync(join(REPO, "config", n), "utf8"));
    }
    const set = await loadConfig(dir, { allowPlanned: false });
    expect(errorLines(set.issues)).toEqual([]);
    // A gateway starts on the active price version, the newest whose effective_from has passed. Check from the newest
    // committed version's effective_from, or NOW if that is later: before it, an older version is active, and a route
    // added with the newest version's price (T105's Bedrock fallback) is rightly refused there.
    const newest = Math.max(NOW, ...(set.prices?.versions ?? []).map((v) => v.effectiveFrom));
    expect(startupRefusals(set, PROD_ENV, newest)).toEqual([]);
    expect(startupRefusals(set, DEV_ENV, newest)).toEqual([]);
  });
});
