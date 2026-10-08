// npm run -w services/gateway validate-config (contracts/config-files.md §5): the gate's run of the gateway's own
// validators, with PLANNED for the protected files a patch hasn't applied yet (plan §11).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { validateConfig } from "../../src/config/validate-config.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const PACKAGE = fileURLToPath(new URL("../../", import.meta.url));

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

// The three committed env files, as tasks.md T031 writes them, with only the keys these checks read. Built at run
// time: the dev-cpu dummy token is public, but no token-shaped literal sits in a test file.
const DUMMY_TOKEN = ["h4op", "devcpu", ["devcpu", "public", "dummy", "operator", "token", "00000000"].join("-")].join(
  "_",
);
type Vars = Record<string, string>;
const PROD_TEMPLATE: Vars = {
  H4_STACK: "prod",
  H4_ENV: "prod",
  MODEL_ALIAS: "prod-model",
  LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
  GATEWAY_DB_PASSWORD: "__GENERATE__",
  GATEWAY_GRAFANA_RO_PASSWORD: "__GENERATE__",
  OPERATOR_TOKEN_SHA256: "__ASK__",
  ALERT_DELIVERY: "real",
  TELEGRAM_API_BASE: "https://api.telegram.org",
  TELEGRAM_BOT_TOKEN: "__ASK__",
  TELEGRAM_CHAT_ID: "__ASK__",
  SMTP_HOST: "__ASK__",
  SMTP_PORT: "__ASK__",
  SMTP_TLS: "__ASK__",
  SMTP_USER: "__ASK__",
  SMTP_PASSWORD: "__ASK__",
  ALERT_EMAIL_FROM: "__ASK__",
  ALERT_EMAIL_TO: "__ASK__",
  GATEWAY_AWS_PROFILE: "h4reet-bedrock",
  TELEMETRY_PAYLOAD_SAMPLING: "off",
};
const DEV_TEMPLATE: Vars = {
  ...Object.fromEntries(Object.entries(PROD_TEMPLATE).filter(([k]) => k !== "GATEWAY_AWS_PROFILE")),
  H4_STACK: "dev",
  H4_ENV: "dev",
  MODEL_ALIAS: "stand-in",
  ALERT_DELIVERY: "standin",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",
  SMTP_HOST: "",
  SMTP_PORT: "",
  SMTP_TLS: "implicit",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  ALERT_EMAIL_FROM: "",
  ALERT_EMAIL_TO: "",
  GATEWAY_TEST_CLOCK: "1",
  GATEWAY_TEST_SYNTHETIC_SPEND: "1",
};
const DEVCPU_VARS: Vars = {
  ...DEV_TEMPLATE,
  H4_STACK: "dev-cpu",
  GATEWAY_DB_PASSWORD: "devcpu-dummy",
  GATEWAY_GRAFANA_RO_PASSWORD: "devcpu-dummy",
  OPERATOR_TOKEN_SHA256: sha256(DUMMY_TOKEN),
  TELEGRAM_API_BASE: "http://telegram-standin:8080",
  SMTP_TLS: "none",
  H4_DEVCPU_OPERATOR_TOKEN: DUMMY_TOKEN,
  H4_TREE: "/run/h4agents/tree",
};
const envText = (vars: Vars): string =>
  `# written by the test\n${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")}\n`;

async function writeTemplates(root: string, change: { prod?: Vars; dev?: Vars; cpu?: Vars } = {}): Promise<void> {
  await mkdir(join(root, "deploy", "env.example"), { recursive: true });
  await mkdir(join(root, "deploy", "env.agents"), { recursive: true });
  await writeFile(join(root, "deploy/env.example/prod.env.example"), envText(change.prod ?? PROD_TEMPLATE));
  await writeFile(join(root, "deploy/env.example/dev.env.example"), envText(change.dev ?? DEV_TEMPLATE));
  await writeFile(join(root, "deploy/env.agents/dev-cpu.vars"), envText(change.cpu ?? DEVCPU_VARS));
}

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

/** A checkout's shape: config/ holding the named fixture files, and the env templates unless told otherwise. */
async function checkout(names: string[], opts: { templates?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "h4-validate-config-"));
  roots.push(root);
  await mkdir(join(root, "config"));
  for (const n of names) await copyFile(join(FIXTURES, n), join(root, "config", n));
  if (opts.templates !== false) await writeTemplates(root);
  return root;
}

async function run(root: string, mainPrices?: string): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const code = await validateConfig({ root, readMainPrices: () => mainPrices, print: (l) => lines.push(l) });
  return { code, lines };
}

const PLANNED_LINES = [
  "PLANNED (T022): config/budgets.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it",
  "PLANNED (T022): config/alerts.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it",
];

describe("validate-config", () => {
  it("passes with PLANNED (T022) while the protected budgets and alerts files are missing", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml"]);
    const { code, lines } = await run(root);
    expect(code).toBe(0);
    expect(lines).toEqual([
      "NOTE config/prices.yaml: main has no config/prices.yaml yet, so the append-only check waits for it",
      ...PLANNED_LINES,
      "validate-config: 0 errors, 1 note, 2 planned",
    ]);
  });

  it("fails a stale PLANNED mark once the patch's files exist, and still validates them", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml", "budgets.yaml", "alerts.yaml"]);
    const { code, lines } = await run(root, await readFile(join(FIXTURES, "prices.yaml"), "utf8"));
    expect(code).toBe(78);
    expect(lines).toEqual([
      "config/budgets.yaml: exists now, so its PLANNED (T022) mark is stale: delete it from PLANNED_CONFIG_FILES in services/gateway/src/config/load.ts",
      "config/alerts.yaml: exists now, so its PLANNED (T022) mark is stale: delete it from PLANNED_CONFIG_FILES in services/gateway/src/config/load.ts",
      "validate-config: 2 errors, 0 notes",
    ]);
  });

  it("prints every error, one per line, and exits 78", async () => {
    const root = await checkout(["prices.yaml"]);
    const routing = (await readFile(join(FIXTURES, "routing.yaml"), "utf8"))
      .replace("prod: { primary: local }", "prod: { primary: bedrock }")
      .replace("connect_ms: 1000", "connect_ms: 50");
    await writeFile(join(root, "config", "routing.yaml"), routing);
    const { code, lines } = await run(root);
    expect(code).toBe(78);
    expect(lines).toEqual([
      "config/routing.yaml: adapters.local.timeouts.connect_ms: must be at least 100",
      'config/routing.yaml: envs.prod.primary: names "bedrock", which isn\'t defined under adapters',
      "NOTE config/prices.yaml: main has no config/prices.yaml yet, so the append-only check waits for it",
      ...PLANNED_LINES,
      "validate-config: 2 errors, 1 note, 2 planned",
    ]);
  });

  it("checks prices.yaml against main's copy: published versions never change (P5)", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml"]);
    const main = (await readFile(join(FIXTURES, "prices.yaml"), "utf8")).replace("output: 100", "output: 90");
    const { code, lines } = await run(root, main);
    expect(code).toBe(78);
    expect(lines[0]).toBe(
      "config/prices.yaml: versions[0]: differs from the same version on main; published versions never change",
    );
    const same = await run(root, await readFile(join(FIXTURES, "prices.yaml"), "utf8"));
    expect(same.code).toBe(0);
    expect(same.lines.at(-1)).toBe("validate-config: 0 errors, 0 notes, 2 planned");
  });

  it("runs as the npm script does, through node --import tsx, and exits with its status", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml"]);
    const exec = promisify(execFile);
    const ok = await exec(process.execPath, ["--import", "tsx", "src/config/validate-config.ts", "--root", root], {
      cwd: PACKAGE,
    });
    expect(ok.stdout.trimEnd().split("\n").at(-1)).toMatch(/^validate-config: 0 errors, 1 note, 2 planned$/);
    await writeFile(join(root, "config", "routing.yaml"), "schema: 2\n");
    const failed = await exec(process.execPath, ["--import", "tsx", "src/config/validate-config.ts", "--root", root], {
      cwd: PACKAGE,
    }).catch((err: { code: number; stdout: string }) => err);
    expect("code" in failed && failed.code).toBe(78);
  });

  it("fails while the env templates are missing, naming the task that writes them", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml"], { templates: false });
    const { code, lines } = await run(root, await readFile(join(FIXTURES, "prices.yaml"), "utf8"));
    expect(code).toBe(78);
    expect(lines).toEqual([
      "deploy/env.example/prod.env.example: missing; tasks.md T031 creates it",
      "deploy/env.example/dev.env.example: missing; tasks.md T031 creates it",
      "deploy/env.agents/dev-cpu.vars: missing; tasks.md T031 creates it",
      ...PLANNED_LINES,
      "validate-config: 3 errors, 0 notes, 2 planned",
    ]);
  });

  it("checks each template against the gateway's startup checks, as the stack it's for", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml"]);
    const main = await readFile(join(FIXTURES, "prices.yaml"), "utf8");
    await writeTemplates(root, {
      prod: {
        ...PROD_TEMPLATE,
        ALERT_DELIVERY: "standin",
        GATEWAY_TEST_CLOCK: "1",
        TELEMETRY_PAYLOAD_SAMPLING: "on",
        LOCAL_MODEL_BASE_URL: "https://model-server/v1",
      },
      dev: { ...DEV_TEMPLATE, H4_STACK: "prod", H4_ENV: "dev" },
    });
    const { code, lines } = await run(root, main);
    expect(code).toBe(78);
    expect(lines.slice(0, -3)).toEqual([
      "deploy/env.example/prod.env.example: GATEWAY_TEST_CLOCK: GATEWAY_TEST_CLOCK is on outside H4_ENV=dev; the test machinery exists only in dev (FR-036) (dev_switch_outside_dev)",
      "deploy/env.example/prod.env.example: TELEMETRY_PAYLOAD_SAMPLING: TELEMETRY_PAYLOAD_SAMPLING is on outside H4_ENV=dev; payload sampling is dev only (FR-029) (dev_switch_outside_dev)",
      "deploy/env.example/prod.env.example: ALERT_DELIVERY: prod's ALERT_DELIVERY must be real; prod refuses the stand-ins (alert_delivery_not_real)",
      "deploy/env.example/prod.env.example: LOCAL_MODEL_BASE_URL: LOCAL_MODEL_BASE_URL isn't http://<single-label host>[:port][/path], an in-stack service (local_url_not_in_stack)",
      "deploy/env.example/dev.env.example: H4_STACK: must be dev: this file is the dev stack's (template_stack)",
      "deploy/env.example/dev.env.example: H4_ENV: H4_ENV must be the class of H4_STACK: prod for prod, dev for dev and dev-cpu (stack_env_mismatch)",
    ]);
  });

  it("holds dev-cpu.vars to the dev template's keys, dummies only, and the dummy token's hash", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml"]);
    const main = await readFile(join(FIXTURES, "prices.yaml"), "utf8");
    const { H4_TREE: _tree, ...noTree } = DEVCPU_VARS;
    void _tree;
    await writeTemplates(root, { cpu: { ...noTree, EXTRA_KEY: "x", GATEWAY_DB_PASSWORD: "__GENERATE__" } });
    const lines = (await run(root, main)).lines;
    expect(lines).toContain(
      "deploy/env.agents/dev-cpu.vars: must have exactly the dev template's keys plus H4_DEVCPU_OPERATOR_TOKEN and H4_TREE: it lacks H4_TREE, and has EXTRA_KEY (key_parity)",
    );
    expect(lines).toContain(
      "deploy/env.agents/dev-cpu.vars: GATEWAY_DB_PASSWORD: holds a placeholder; dev-cpu.vars holds dummies only (placeholder)",
    );

    await writeTemplates(root, { cpu: { ...DEVCPU_VARS, OPERATOR_TOKEN_SHA256: "cd".repeat(32) } });
    expect((await run(root, main)).lines).toContain(
      "deploy/env.agents/dev-cpu.vars: OPERATOR_TOKEN_SHA256: must be the SHA-256 of H4_DEVCPU_OPERATOR_TOKEN (dummy_token)",
    );

    const other = DUMMY_TOKEN.replace("00000000", "11111111");
    await writeTemplates(root, {
      cpu: { ...DEVCPU_VARS, H4_DEVCPU_OPERATOR_TOKEN: other, OPERATOR_TOKEN_SHA256: sha256(other) },
    });
    expect((await run(root, main)).lines).toContain(
      "deploy/env.agents/dev-cpu.vars: H4_DEVCPU_OPERATOR_TOKEN: its SHA-256 isn't DEVCPU_DUMMY_OPERATOR_SHA256 in services/gateway/src/config/validate-env.ts, so prod wouldn't refuse it: make them agree (dummy_token)",
    );
  });

  it("reports an env file's grammar by line and key, never with the value", async () => {
    const root = await checkout(["routing.yaml", "prices.yaml"]);
    await writeFile(
      join(root, "deploy/env.example/dev.env.example"),
      envText(DEV_TEMPLATE) + "SMTP_PASSWORD=has space\n",
    );
    const { lines } = await run(root, await readFile(join(FIXTURES, "prices.yaml"), "utf8"));
    expect(lines.some((l) => /dev\.env\.example: line \d+: SMTP_PASSWORD: appears twice/.test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain("has space");
  });

  it("refuses an unknown argument with exit 2", async () => {
    const exec = promisify(execFile);
    const result = await exec(process.execPath, ["--import", "tsx", "src/config/validate-config.ts", "--rot", "x"], {
      cwd: PACKAGE,
    }).catch((err: { code: number; stderr: string }) => err);
    expect("code" in result && result.code).toBe(2);
  });
});
