// `npm run -w services/gateway validate-config [-- --root <checkout>]`: make check's validate-config gate
// (contracts/config-files.md §5, plan §11). It runs the validators the gateway runs at startup, from the same module,
// so the gate and the runtime can't disagree. No daemon, no network: it runs in the sandbox.
//
// It prints one line per error or note, a PLANNED line for each protected file a patch hasn't applied yet, then a
// summary, and exits 0 with no errors and 78 with any. make check shows PASS, PLANNED, or FAIL.
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { formatIssue, parseYaml, type ConfigIssue } from "./load.js";
import { checkPricesAppendOnly, loadConfig } from "./validate.js";

export interface ValidateConfigOptions {
  /** The checkout: config/ and the env templates live under it. */
  root: string;
  /** main's config/prices.yaml, or undefined without git, or without the file on main (P5). */
  readMainPrices?: (root: string) => string | undefined;
  print?: (line: string) => void;
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
