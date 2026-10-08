// `npm run -w services/gateway validate-config [-- --root <checkout>]`: make check's validate-config gate
// (contracts/config-files.md §5, plan §11). It runs the validators the gateway runs at startup, from the same module,
// so the gate and the runtime can't disagree. No daemon, no network: it runs in the sandbox.
//
// It prints one line per error or note, a PLANNED line for each protected file a patch hasn't applied yet, then a
// summary, and exits 0 with no errors and 78 with any. make check shows PASS, PLANNED, or FAIL.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { formatIssue, parseYaml, type ConfigIssue } from "./load.js";
import { checkPricesAppendOnly, checkStartup, loadConfig, type LoadedConfig } from "./validate.js";
import { DEVCPU_DUMMY_OPERATOR_SHA256, gatewayEnvFromFile, parseEnvFile, validateGatewayEnv } from "./validate-env.js";

/** The committed env files, each validated as the stack it's for (config-files.md §5, point 2). */
export const ENV_TEMPLATES = [
  { file: "deploy/env.example/prod.env.example", stack: "prod" },
  { file: "deploy/env.example/dev.env.example", stack: "dev" },
  { file: "deploy/env.agents/dev-cpu.vars", stack: "dev-cpu" },
] as const;
/** The task that writes them (tasks.md T031). */
const TEMPLATES_TASK = "T031";
const ENV_PLACEHOLDERS = ["__GENERATE__", "__ASK__", "__REPO__", "__HOME__"];
/** dev-cpu.vars has exactly the dev template's keys plus these (env-files.md §6.1; preflight P4). */
const DEVCPU_ONLY_KEYS = ["H4_DEVCPU_OPERATOR_TOKEN", "H4_TREE"];
const DEVCPU_TOKEN = /^h4op_devcpu_[A-Za-z0-9_-]{43}$/;

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

function envError(file: string, path: string, rule: string, message: string): ConfigIssue {
  return { severity: "error", file, path, rule, message, requirement: rule };
}

/**
 * The env templates against the gateway's own startup checks, with __GENERATE__ and __ASK__ counting as present
 * values of the right shape; and dev-cpu.vars against the dev template's keys and the dummy token's hash.
 */
export async function checkEnvTemplates(root: string, set: LoadedConfig, nowMs: number): Promise<ConfigIssue[]> {
  const issues: ConfigIssue[] = [];
  const read = new Map<string, Record<string, string>>();
  for (const { file, stack } of ENV_TEMPLATES) {
    let text: string;
    try {
      text = await readFile(join(root, file), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      issues.push({
        severity: "error",
        file,
        path: "",
        rule: "MISSING",
        message: `missing; tasks.md ${TEMPLATES_TASK} creates it`,
      });
      continue;
    }
    const parsed = parseEnvFile(text, file);
    issues.push(...parsed.issues);
    if (parsed.issues.length > 0) continue;
    const vars = parsed.vars;
    read.set(stack, vars);
    if (vars.H4_STACK !== stack) {
      issues.push(envError(file, "H4_STACK", "template_stack", `must be ${stack}: this file is the ${stack} stack's`));
    }
    const env = gatewayEnvFromFile(vars);
    for (const r of validateGatewayEnv(env, { template: true }))
      issues.push(envError(file, r.key, r.reason, r.message));
    if (set.routing && set.prices) {
      for (const r of checkStartup({ routing: set.routing, prices: set.prices }, env, nowMs)) {
        issues.push(envError(file, r.key ?? r.path ?? "", r.reason, r.message));
      }
    }
  }

  const dev = read.get("dev");
  const cpu = read.get("dev-cpu");
  const cpuFile = ENV_TEMPLATES[2].file;
  if (dev && cpu) {
    const expected = new Set([...Object.keys(dev), ...DEVCPU_ONLY_KEYS]);
    const missing = [...expected].filter((k) => !(k in cpu));
    const extra = Object.keys(cpu).filter((k) => !expected.has(k));
    if (missing.length > 0 || extra.length > 0) {
      const parts = [
        missing.length > 0 ? `lacks ${missing.join(", ")}` : "",
        extra.length > 0 ? `has ${extra.join(", ")}` : "",
      ];
      issues.push(
        envError(
          cpuFile,
          "",
          "key_parity",
          `must have exactly the dev template's keys plus ${DEVCPU_ONLY_KEYS.join(" and ")}: it ${parts.filter(Boolean).join(", and ")}`,
        ),
      );
    }
  }
  if (cpu) {
    for (const [key, value] of Object.entries(cpu)) {
      if (ENV_PLACEHOLDERS.includes(value)) {
        issues.push(envError(cpuFile, key, "placeholder", "holds a placeholder; dev-cpu.vars holds dummies only"));
      }
    }
    const token = cpu.H4_DEVCPU_OPERATOR_TOKEN;
    if (token === undefined || !DEVCPU_TOKEN.test(token)) {
      issues.push(envError(cpuFile, "H4_DEVCPU_OPERATOR_TOKEN", "dummy_token", `must match ${DEVCPU_TOKEN.source}`));
    } else if (cpu.OPERATOR_TOKEN_SHA256 !== sha256(token)) {
      issues.push(
        envError(cpuFile, "OPERATOR_TOKEN_SHA256", "dummy_token", "must be the SHA-256 of H4_DEVCPU_OPERATOR_TOKEN"),
      );
    } else if (sha256(token) !== DEVCPU_DUMMY_OPERATOR_SHA256) {
      issues.push(
        envError(
          cpuFile,
          "H4_DEVCPU_OPERATOR_TOKEN",
          "dummy_token",
          "its SHA-256 isn't DEVCPU_DUMMY_OPERATOR_SHA256 in services/gateway/src/config/validate-env.ts, so prod wouldn't refuse it: make them agree",
        ),
      );
    }
  }
  return issues;
}

export interface ValidateConfigOptions {
  /** The checkout: config/ and the env templates live under it. */
  root: string;
  /** main's config/prices.yaml, or undefined without git, or without the file on main (P5). */
  readMainPrices?: (root: string) => string | undefined;
  print?: (line: string) => void;
  /** The gateway clock for the startup checks: now. */
  now?: () => number;
}

/** `git show main:config/prices.yaml`, or undefined when there is no git, no main, or no such file on main. */
export function gitMainPrices(root: string): string | undefined {
  try {
    return execFileSync("git", ["-C", root, "show", "main:config/prices.yaml"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
  } catch {
    return undefined;
  }
}

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function validateConfig(opts: ValidateConfigOptions): Promise<number> {
  const print = opts.print ?? ((line: string) => void process.stdout.write(`${line}\n`));
  const set = await loadConfig(join(opts.root, "config"), { allowPlanned: true });
  const issues: ConfigIssue[] = [...set.issues];

  // P5: the append-only check against main, in a git checkout.
  const prices = set.parsed["prices.yaml"];
  if (prices && prices.issues.length === 0) {
    const mainText = (opts.readMainPrices ?? gitMainPrices)(opts.root);
    const main = mainText === undefined ? undefined : parseYaml("main:config/prices.yaml", mainText);
    issues.push(...checkPricesAppendOnly(prices, main));
  }

  // The env templates, against the gateway's own startup checks.
  issues.push(...(await checkEnvTemplates(opts.root, set, opts.now?.() ?? Date.now())));

  for (const issue of issues) print(formatIssue(issue));
  for (const { file, task } of set.planned) {
    print(
      `PLANNED (${task}): ${file} is missing; the config patch adds it (tasks.md ${task}), and its checks wait for it`,
    );
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  const notes = issues.length - errors;
  const planned = set.planned.length > 0 ? `, ${set.planned.length} planned` : "";
  print(`validate-config: ${count(errors, "error")}, ${count(notes, "note")}${planned}`);
  return errors > 0 ? 78 : 0;
}

function parseArgs(argv: readonly string[]): { root: string } | undefined {
  let root = fileURLToPath(new URL("../../../../", import.meta.url)); // services/gateway/src/config → the checkout
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--root" && value !== undefined) {
      root = resolve(value);
      i++;
    } else {
      return undefined;
    }
  }
  return { root };
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const args = parseArgs(process.argv.slice(2));
  if (args === undefined) {
    process.stderr.write("usage: validate-config [--root <checkout>]\n");
    process.exitCode = 2;
  } else {
    process.exitCode = await validateConfig(args);
  }
}
