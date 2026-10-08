// Reading the gateway's configuration files as data (contracts/config-files.md §0).
//
// YAML 1.2 with the `yaml` package: one document per file, duplicate keys refused. Every number keeps the text it was
// written as, so a USD amount converts to integer micro-USD exactly, never through a float.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";

export const CONFIG_FILES = ["routing.yaml", "prices.yaml", "budgets.yaml", "alerts.yaml"] as const;
export type ConfigFileName = (typeof CONFIG_FILES)[number];

/**
 * Protected files a patch hasn't applied yet, with the task that writes the patch. validate-config reports each one
 * as PLANNED while it's missing (plan §11). Marks expire: once the Author applies the config patch, the next commit
 * deletes these entries, and a mark whose file exists fails validate-config until then (tasks.md, Notes).
 * The gateway itself never starts without these files: the runtime has no PLANNED state.
 */
export const PLANNED_CONFIG_FILES: Readonly<Partial<Record<ConfigFileName, string>>> = {
  "budgets.yaml": "T022",
  "alerts.yaml": "T022",
};

export interface ConfigIssue {
  severity: "error" | "note";
  file: string; // as printed: "config/routing.yaml"
  path: string; // "envs.prod.primary"; "" for the whole file
  rule: string; // the contract's rule ID: R1 … R11, P1 … P7, B1 … B8, A1 … A7; YAML for a parse error
  message: string;
  requirement?: string; // "FR-022"
}

/** One line per issue, as contracts/config-files.md §0 and §5 print them. */
export function formatIssue(issue: ConfigIssue): string {
  const where = issue.path === "" ? issue.file : `${issue.file}: ${issue.path}`;
  const line = `${where}: ${issue.message}${issue.requirement ? ` (${issue.requirement})` : ""}`;
  return issue.severity === "note" ? `NOTE ${line}` : line;
}

export type PathSegment = string | number;

/** versions[0].entries[1].input */
export function formatPath(path: readonly PathSegment[]): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") out += `[${segment}]`;
    else out += out === "" ? segment : `.${segment}`;
  }
  return out;
}

export interface ParsedYaml {
  file: string;
  data: unknown;
  /** Every number's source text, by path: "5.00" for daily_usd: 5.00. */
  numberSources: ReadonlyMap<string, string>;
  issues: ConfigIssue[];
  sha256: string;
}

function collectNumberSources(node: Node | null, path: PathSegment[], into: Map<string, string>): void {
  if (isMap(node)) {
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? pair.key.value : pair.key;
      collectNumberSources(pair.value as Node | null, [...path, String(key)], into);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, i) => collectNumberSources(item as Node | null, [...path, i], into));
  } else if (isScalar(node) && typeof node.value === "number" && typeof node.source === "string") {
    into.set(formatPath(path), node.source);
  }
}

/** Parse one YAML file. Syntax errors, duplicate keys, and a second document are issues under the file's rule. */
export function parseYaml(file: string, text: string): ParsedYaml {
  const sha256 = createHash("sha256").update(text, "utf8").digest("hex");
  const doc = parseDocument(text, { version: "1.2", uniqueKeys: true, strict: true, prettyErrors: false });
  const issues: ConfigIssue[] = [...doc.errors, ...doc.warnings].map((e) => {
    const first = e.message.split("\n")[0] ?? e.code;
    const line = text.slice(0, e.pos[0]).split("\n").length;
    return {
      severity: "error",
      file,
      path: `line ${line}`,
      rule: "YAML",
      message: `not valid YAML: ${first.replace(/ at line \d+, column \d+:?$/, "")}`,
    };
  });
  const numberSources = new Map<string, string>();
  if (issues.length > 0) return { file, data: undefined, numberSources, issues, sha256 };
  collectNumberSources(doc.contents, [], numberSources);
  return { file, data: doc.toJS(), numberSources, issues, sha256 };
}

/** Protected files a patch hasn't applied yet, each with the task that writes the patch. */
export type PlannedFiles = Readonly<Partial<Record<ConfigFileName, string>>>;

export interface ConfigDirFiles {
  /** The files that exist, parsed. */
  parsed: Partial<Record<ConfigFileName, ParsedYaml>>;
  /** Missing files: errors, or PLANNED entries when the caller allows them. */
  issues: ConfigIssue[];
  planned: { file: string; task: string }[];
}

/**
 * Read the four files from a config directory: /app/config in the container, `config/` in a checkout.
 * `allowPlanned` is validate-config's mode: a missing protected file whose patch is due is PLANNED, not an error, and
 * a PLANNED mark whose file exists is stale. The marks are the build's own, PLANNED_CONFIG_FILES, unless the caller
 * names others, as the tests do, so they hold whichever state the config patch leaves the build's marks in.
 */
export async function readConfigDir(
  dir: string,
  opts: { allowPlanned: boolean; plannedFiles?: PlannedFiles },
): Promise<ConfigDirFiles> {
  const marks = opts.plannedFiles ?? PLANNED_CONFIG_FILES;
  const out: ConfigDirFiles = { parsed: {}, issues: [], planned: [] };
  for (const name of CONFIG_FILES) {
    const file = `config/${name}`;
    const task = marks[name];
    let text: string;
    try {
      text = await readFile(join(dir, name), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      if (opts.allowPlanned && task !== undefined) {
        out.planned.push({ file, task });
      } else {
        out.issues.push({ severity: "error", file, path: "", rule: "MISSING", message: "missing" });
      }
      continue;
    }
    if (opts.allowPlanned && task !== undefined) {
      out.issues.push({
        severity: "error",
        file,
        path: "",
        rule: "STALE",
        message: `exists now, so its PLANNED (${task}) mark is stale: delete it from PLANNED_CONFIG_FILES in services/gateway/src/config/load.ts`,
      });
    }
    out.parsed[name] = parseYaml(file, text);
  }
  return out;
}
