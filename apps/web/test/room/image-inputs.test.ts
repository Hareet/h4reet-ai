// The web image's room sees the twin's readiness (spec 007; FR-030, FR-037, FR-027; plan.md's D44): the room's build
// reads config/twin-readiness.yaml, the pack, the prompt, the fixed lines, and config/budgets.yaml from the
// repository's tree (build/room/plugin.ts's buildStart; build/room/readiness.ts), and in the image that tree is what
// apps/web/Dockerfile copies before the build runs. So each file twinReadiness and talkLimits read, named by
// readiness.ts's own constants, is copied from the context to its tree path under the build's working directory, in
// the stages each of apps/web's builds stands on, before its RUN; else the image's room marks no topic ready, while a
// checkout's build, and so every other test here, sees the Author's file. No other part of config/ is copied. The
// runtime stage copies only dist/ (deploy/scripts/test_web_image.py holds it to that), so none of these files reaches
// nginx's root, and a context file .dockerignore leaves out fails the build (the same file's test).
import { readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../../build/content";
import {
  BUDGETS_FILE,
  LINES_FILE,
  PACK_FILE,
  PROMPT_FILE,
  READINESS_PATH,
  talkLimits,
  twinReadiness,
} from "../../build/room/readiness";
import { fileTree } from "../../build/room/source";

const DOCKERFILE = "apps/web/Dockerfile";
/** What the room's build reads from config/, by readiness.ts's own names. */
const INPUTS: readonly string[] = [READINESS_PATH, PACK_FILE, PROMPT_FILE, LINES_FILE, BUDGETS_FILE];

interface Stage {
  /** The FROM's image, or the earlier stage it builds on. */
  readonly base: string;
  /** The stage's name in lower case, "" for none. */
  readonly name: string;
  /** Its other instructions, as logical lines. */
  readonly body: readonly string[];
}

/** The Dockerfile's stages in order: comment lines dropped, continuations joined, as the Python tests read them. */
function stagesOf(text: string): Stage[] {
  const logical: string[] = [];
  let pending = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    pending = `${pending} ${line}`.trim();
    if (pending.endsWith("\\")) {
      pending = pending.slice(0, -1);
      continue;
    }
    logical.push(pending);
    pending = "";
  }
  const stages: { base: string; name: string; body: string[] }[] = [];
  for (const line of logical) {
    const [word = "", ...rest] = line.split(/\s+/);
    if (word.toUpperCase() === "FROM") {
      const tokens = rest.filter((t) => !t.startsWith("--"));
      const named = tokens.length >= 3 && tokens[1]?.toUpperCase() === "AS";
      stages.push({ base: tokens[0] ?? "", name: named ? (tokens[2] ?? "").toLowerCase() : "", body: [] });
    } else {
      const current = stages.at(-1);
      if (current === undefined) throw new Error(`${line}: an instruction before the first FROM`);
      current.body.push(line);
    }
  }
  return stages;
}

const isDirectory = (path: string): boolean => {
  try {
    return statSync(join(REPO_ROOT, path)).isDirectory();
  } catch {
    return false;
  }
};

/** A COPY or ADD from the build context: its sources and its destination; null for any other line, or one --from. */
function contextCopy(line: string): { sources: string[]; dest: string } | null {
  const [word = "", ...rest] = line.split(/\s+/);
  if (!["COPY", "ADD"].includes(word.toUpperCase())) return null;
  if (rest.some((w) => w.startsWith("--from="))) return null;
  const args = rest.filter((w) => !w.startsWith("--"));
  const dest = args.at(-1);
  if (dest === undefined || args.length < 2) throw new Error(`${line}: no source or no destination`);
  return {
    sources: args.slice(0, -1).map((s) => (s === "./" ? "." : s.replace(/^\.\//, "").replace(/\/+$/, ""))),
    dest,
  };
}

/** Where `line` puts the context's file `path`, with `workdir` the stage's working directory; null when it doesn't. */
function copiedTo(line: string, path: string, workdir: string): string | null {
  const copy = contextCopy(line);
  if (copy === null) return null;
  const into = posix.resolve(workdir, copy.dest);
  // A file source lands at the destination itself unless that names a folder: a trailing slash, or several sources.
  const folder = copy.dest.endsWith("/") || copy.sources.length > 1;
  for (const source of copy.sources) {
    if (source === ".") return posix.join(into, path);
    if (source === path) return folder ? posix.join(into, posix.basename(path)) : into;
    // A folder source copies its contents into the destination.
    if (path.startsWith(`${source}/`) && isDirectory(source)) return posix.join(into, path.slice(source.length + 1));
  }
  return null;
}

const STAGES = stagesOf(readFileSync(join(REPO_ROOT, DOCKERFILE), "utf8"));
/** A RUN of one of apps/web's builds (`build`, `build:lookdev-phone`), each of which composes the room. */
const BUILD_RUN = /\bnpm run (?:--ignore-scripts )?(build(?::[a-z-]+)?) -w apps\/web(?:\s|$)/;

/** Each build's RUN: its script, its working directory, and every line the stages it stands on run before it. */
function builds(): { script: string; workdir: string; before: string[] }[] {
  const found: { script: string; workdir: string; before: string[] }[] = [];
  STAGES.forEach((stage, k) => {
    stage.body.forEach((line, i) => {
      const script = line.startsWith("RUN ") ? BUILD_RUN.exec(line)?.[1] : undefined;
      if (script === undefined) return;
      // The chain of stages, oldest first: each stage's base, while that names an earlier stage.
      const chain: Stage[] = [stage];
      const parentOf = (s: Stage, at: number): Stage | undefined =>
        STAGES.slice(0, at).findLast((p) => p.name === s.base.toLowerCase());
      for (let p = parentOf(stage, k); p !== undefined; p = parentOf(p, STAGES.indexOf(p))) chain.unshift(p);
      const before = chain.flatMap((s) => (s === stage ? s.body.slice(0, i) : s.body));
      let workdir = "/";
      for (const l of before) {
        const [word = "", dir = ""] = l.split(/\s+/);
        if (word.toUpperCase() === "WORKDIR") workdir = posix.resolve(workdir, dir);
      }
      found.push({ script, workdir, before });
    });
  });
  return found;
}

/** How many of the lines before a build's RUN put the context's `path` at its tree path under the build's working
 *  directory, which is the room's root there (vite.config.ts: here("../..") from apps/web). */
const copies = (b: { workdir: string; before: string[] }, path: string): number =>
  b.before.filter((line) => copiedTo(line, path, b.workdir) === posix.join(b.workdir, path)).length;

describe("the web image's room build sees the twin's readiness (spec 007; FR-030, FR-037)", () => {
  it("reads from the tree exactly readiness.ts's five files, by its own constants", () => {
    const tree = fileTree(REPO_ROOT);
    twinReadiness(tree);
    talkLimits(tree);
    expect([...new Set(tree.log)].sort()).toEqual([...INPUTS].sort());
  });

  it("finds the Dockerfile's two builds of apps/web, and reads its copies as Docker does", () => {
    // The release build and the lookdev phone copy's, both through build/room/plugin.ts's roomBundle().
    const found = builds();
    expect(found.map((b) => b.script).sort()).toEqual(["build", "build:lookdev-phone"]);
    // The build's other inputs, which the install stage already copies: a file to a folder, a file to its own path, a
    // folder's contents, and a file it doesn't copy.
    for (const b of found) {
      expect(copies(b, "docs/data-flow-disclosure.md"), b.script).toBe(1);
      expect(copies(b, "assets/policy/caps.json"), b.script).toBe(1);
      expect(copies(b, "apps/web/vite.config.ts"), b.script).toBe(1);
      expect(copies(b, "deploy/compose.yaml"), b.script).toBe(0);
    }
  });

  for (const b of builds()) {
    it(`copies each file to its tree path under ${b.workdir} before \`npm run ${b.script}\` runs`, () => {
      expect(INPUTS.filter((path) => copies(b, path) === 0)).toEqual([]);
    });
  }

  it("copies from config/ those five files by name, and no other part of it, into any stage", () => {
    const sources = STAGES.flatMap((s) => s.body.flatMap((l) => contextCopy(l)?.sources ?? []));
    const config = sources.filter((s) => s === "." || s === "config" || s.startsWith("config/"));
    expect([...config].sort()).toEqual([...INPUTS].sort());
  });
});
