// A checkout's prebuild (spec 002, T017; contracts/resume-source.md §5): fills the policy directory with main's
// assets/policy/content-approvals.json, resume-header.json, caps.json (spec 004, R-13), and approvals.json (spec 016,
// its plan.md R-03, the likeness approvals the twin's line is read from), read with
// `git cat-file blob refs/heads/main:<path>` from the repository this workspace sits in, never from the branch's
// working tree, so a branch can neither approve its own content nor raise its own caps. The branch's full ref, as
// spec 003 reads its policy: a bare `main` resolves to refs/tags/main before refs/heads/main, and an agent session can
// make that tag. A file main doesn't hold, or a checkout with no main (an exported tree), leaves it out, so every
// content file builds as a draft, and the room's compositor takes FR-053's starting caps.
//
// It never runs in the image: the Dockerfile runs the build with --ignore-scripts, and ROOM_POLICY_DIR there names the
// named context's copy, which web_image.py read from main on the host. With ROOM_POLICY_DIR set, this does nothing.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** main's paths, and their names in the policy directory, in approvals.ts's POLICY_FILES order: the caps third, the
 *  likeness approvals fourth. */
export const POLICY_PATHS = [
  ["assets/policy/content-approvals.json", "content-approvals.json"],
  ["assets/policy/resume-header.json", "resume-header.json"],
  ["assets/policy/caps.json", "caps.json"],
  ["assets/policy/approvals.json", "approvals.json"],
] as const;

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
/** The repository's root: this file is apps/web/build/policy.ts. */
export const REPO_ROOT = here("../../../");
/** Where a checkout's build reads the policy when ROOM_POLICY_DIR names none: under node_modules, which nothing
 * commits, lints, or copies into an image. */
export const DEFAULT_POLICY_DIR = here("../../../node_modules/.cache/h4reet-web/policy");

export type Show = (repo: string, path: string) => Buffer | null;

/** main's blob at <path>, by the branch's full ref, with git's own minimum of settings: no GIT_DIR, no replace
 * objects, no global config. A missing blob, or no branch main, is null. */
export const gitShow: Show = (repo, path) => {
  try {
    return execFileSync("git", ["-C", repo, "cat-file", "blob", `refs/heads/main:${path}`], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/nonexistent",
        LC_ALL: "C",
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
      },
    });
  } catch {
    return null;
  }
};

/** Empties the directory, then writes each file main holds. Returns the names written. */
export function fillPolicy(dir: string, repo: string = REPO_ROOT, show: Show = gitShow): string[] {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) rmSync(`${dir}/${name}`, { recursive: true, force: true });
  const written: string[] = [];
  for (const [path, name] of POLICY_PATHS) {
    const data = show(repo, path);
    if (data === null) continue;
    writeFileSync(`${dir}/${name}`, data);
    written.push(name);
  }
  return written;
}

/** The prebuild: "given" when ROOM_POLICY_DIR names the directory (the image), else it fills the default one. */
export function prebuild(
  env: Readonly<Record<string, string | undefined>>,
  show: Show = gitShow,
  dir: string = DEFAULT_POLICY_DIR,
): "given" | "filled" {
  if (env.ROOM_POLICY_DIR) return "given";
  fillPolicy(dir, REPO_ROOT, show);
  return "filled";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const done = prebuild(process.env);
  if (done === "given") {
    console.log(`policy: ROOM_POLICY_DIR names the policy directory (${process.env.ROOM_POLICY_DIR}); nothing to fill`);
  } else {
    const written = readdirSync(DEFAULT_POLICY_DIR);
    const names = POLICY_PATHS.map(([, name]) => name).filter((name) => written.includes(name));
    const listed = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
    console.log(
      names.length
        ? `policy: main's ${listed} into ${DEFAULT_POLICY_DIR}`
        : "policy: main has no assets/policy files here, so every content file builds as a draft",
    );
  }
}
