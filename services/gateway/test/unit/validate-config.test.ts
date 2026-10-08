// npm run -w services/gateway validate-config (contracts/config-files.md §5): the gate's run of the gateway's own
// validators, with PLANNED for the protected files a patch hasn't applied yet (plan §11).
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { validateConfig } from "../../src/config/validate-config.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const PACKAGE = fileURLToPath(new URL("../../", import.meta.url));

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

/** A checkout's shape: config/ holding the named fixture files. */
async function checkout(names: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "h4-validate-config-"));
  roots.push(root);
  await mkdir(join(root, "config"));
  for (const n of names) await copyFile(join(FIXTURES, n), join(root, "config", n));
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

  it("refuses an unknown argument with exit 2", async () => {
    const exec = promisify(execFile);
    const result = await exec(process.execPath, ["--import", "tsx", "src/config/validate-config.ts", "--rot", "x"], {
      cwd: PACKAGE,
    }).catch((err: { code: number; stderr: string }) => err);
    expect("code" in result && result.code).toBe(2);
  });
});
