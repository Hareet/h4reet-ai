// The site's builds for the tests that read what ships (spec 004, T084; R-67; contracts/room-bundle.md §14): a vitest
// global setup, named in vitest.config.ts, that makes one release build and one drafts build (ROOM_DRAFTS=1) of the
// site before any test file runs, each into a temporary folder under an empty policy directory, the build a checkout
// with nothing approved on main makes. The smoke test, the chunk test, and the built-site checks read the folders
// through `inject("siteBuilds")`, so the site is built twice a run, not once a file. A test that needs another policy
// directory makes its own build with `buildSite`, the same build under the policy it gives. A build reads
// ROOM_POLICY_DIR and ROOM_DRAFTS from the environment, so builds run one at a time, each restoring both after. What a
// build prints (spec 002's content checks say what they checked) stays quiet unless it fails, as a passing test's does.
// Each build also gives the modules each of its chunks holds, through `inject("siteChunks")`, so the chunk test knows
// where the room's bundle and the libraries landed without reading minified code for them (spec 004, T093).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import type { TestProject } from "vitest/node";

const WEB = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const REPO = resolve(WEB, "../..");

/** Each chunk a build wrote, by its file name under the build's folder, with the modules it holds: a file by its path
 *  from the repository's root (a package's under node_modules/), a virtual module by its ID. */
export type SiteChunks = Readonly<Record<string, readonly string[]>>;

declare module "vitest" {
  export interface ProvidedContext {
    /** The global setup's builds of the site: the release build's folder, and the drafts build's. */
    siteBuilds: { release: string; drafts: string };
    /** The same builds' chunks, each with its modules. */
    siteChunks: { release: SiteChunks; drafts: SiteChunks };
  }
}

/** One build of the site, in its own temporary folder. */
export interface SiteBuild {
  /** The built site, as dist/ would hold it. */
  readonly out: string;
  /** The policy directory it was built under (ROOM_POLICY_DIR). */
  readonly policy: string;
  /** Its chunks, each with its modules. */
  readonly chunks: SiteChunks;
  /** Removes the folders the build made: its output, and its policy directory unless the caller gave it. */
  remove(): void;
}

/** A module's ID as SiteChunks gives it. */
const moduleName = (id: string): string => (isAbsolute(id) ? relative(REPO, id).split("\\").join("/") : id);

/** A release or drafts build of the site into a new temporary folder, under `policy`, or an empty policy directory. */
export async function buildSite(options: { readonly drafts: boolean; readonly policy?: string }): Promise<SiteBuild> {
  const made = [mkdtempSync(join(tmpdir(), `h4-web-${options.drafts ? "drafts" : "release"}-`))];
  const out = made[0] as string;
  const policy = options.policy ?? mkdtempSync(join(tmpdir(), "h4-web-policy-"));
  if (options.policy === undefined) made.push(policy);
  const remove = (): void => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  };
  const saved = { ROOM_POLICY_DIR: process.env.ROOM_POLICY_DIR, ROOM_DRAFTS: process.env.ROOM_DRAFTS };
  process.env.ROOM_POLICY_DIR = policy;
  process.env.ROOM_DRAFTS = options.drafts ? "1" : "";
  const log = console.log;
  const printed: string[] = [];
  console.log = (...args: unknown[]): void => {
    printed.push(args.map(String).join(" "));
  };
  const chunks: Record<string, readonly string[]> = {};
  try {
    const built = await build({
      root: WEB,
      configFile: join(WEB, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir: out, emptyOutDir: true },
    });
    for (const result of Array.isArray(built) ? built : [built]) {
      if (!("output" in result)) throw new Error("buildSite: a watching build gives no chunks");
      for (const file of result.output)
        if (file.type === "chunk") chunks[file.fileName] = file.moduleIds.map(moduleName);
    }
  } catch (error) {
    for (const line of printed) log(line);
    remove();
    throw error;
  } finally {
    console.log = log;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  return { out, policy, chunks, remove };
}

/** The global setup: the two builds, provided to every test file; its teardown removes them. */
export default async function setup(project: TestProject): Promise<() => void> {
  const release = await buildSite({ drafts: false });
  let drafts: SiteBuild;
  try {
    drafts = await buildSite({ drafts: true });
  } catch (error) {
    release.remove();
    throw error;
  }
  project.provide("siteBuilds", { release: release.out, drafts: drafts.out });
  project.provide("siteChunks", { release: release.chunks, drafts: drafts.chunks });
  return () => {
    release.remove();
    drafts.remove();
  };
}
