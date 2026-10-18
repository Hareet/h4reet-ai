// T014 (spec 002; FR-012; contracts/resume-source.md §5, data-model.md §4): a content file is approved only when the
// policy directory's copy of main's content-approvals.json lists its current SHA-256; anything else is a draft, left
// out of a build without ROOM_DRAFTS=1 and bannered in one with it. build/policy.ts fills that directory from main
// with git show in a checkout, never from the branch; the image gets it as the named context `policy` instead.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  contentFiles,
  draftsOn,
  pdfHeader,
  policyDigest,
  publication,
  readPolicy,
  roomData,
  stateOf,
} from "../build/approvals";
import { fillPolicy, prebuild } from "../build/policy";

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
const RESUME = "version: 1\nsections: []\n";
const SCRIPT = "---\nitem: x\npath: engineer\n---\nWords.\n";

const made: string[] = [];
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

function approvals(...digests: string[]): string {
  return JSON.stringify({
    schema: 1,
    approvals: digests.map((sha, i) => ({
      id: `C-${String(i + 1).padStart(4, "0")}`,
      path_when_approved: "apps/web/content/resume.yaml",
      kind: "resume",
      sha256: sha,
      date: "2026-10-18",
      reason: "a stand-in approval, made by the test",
    })),
  });
}

function policyDir(files: Record<string, string>): string {
  const dir = temp("h4-policy-");
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

/** A tree with the room's content files: the resume's source and one narration script. */
function tree(resume = RESUME, script = SCRIPT): string {
  const root = temp("h4-tree-");
  mkdirSync(join(root, "apps/web/content/narration"), { recursive: true });
  writeFileSync(join(root, "apps/web/content/resume.yaml"), resume);
  writeFileSync(join(root, "apps/web/content/narration/x.engineer.md"), script);
  return root;
}

describe("a content file's state", () => {
  it("is approved only when main's approvals list its current digest", () => {
    const policy = readPolicy(policyDir({ "content-approvals.json": approvals(sha256(RESUME)) }));
    expect(stateOf(Buffer.from(RESUME), policy)).toBe("approved");
    expect(stateOf(Buffer.from(SCRIPT), policy)).toBe("draft");
  });

  it("becomes a draft again with any edit, whatever its path", () => {
    const policy = readPolicy(policyDir({ "content-approvals.json": approvals(sha256(RESUME)) }));
    expect(stateOf(Buffer.from(RESUME + " "), policy)).toBe("draft");
    const files = contentFiles(tree(RESUME + "\n"), policy);
    expect(files.map((f) => [f.path, f.state])).toEqual([
      ["apps/web/content/resume.yaml", "draft"],
      ["apps/web/content/narration/x.engineer.md", "draft"],
    ]);
  });

  it("is a draft, every one, with an empty policy directory, and the PDF gets the room's header", () => {
    const policy = readPolicy(policyDir({}));
    expect(policy.approved.size).toBe(0);
    expect(contentFiles(tree(), policy).map((f) => f.state)).toEqual(["draft", "draft"]);
    expect(pdfHeader(policy)).toBeNull();
  });

  it("is a draft when the policy directory doesn't exist at all", () => {
    const policy = readPolicy(join(temp("h4-none-"), "missing"));
    expect(stateOf(Buffer.from(RESUME), policy)).toBe("draft");
  });

  it("is listed resume first, then the scripts in name order, with digests from the bytes", () => {
    const root = tree();
    writeFileSync(join(root, "apps/web/content/narration/a.non-engineer.md"), SCRIPT + "more\n");
    writeFileSync(join(root, "apps/web/content/notes.txt"), "not content\n");
    const files = contentFiles(root, readPolicy(policyDir({})));
    expect(files.map((f) => f.path)).toEqual([
      "apps/web/content/resume.yaml",
      "apps/web/content/narration/a.non-engineer.md",
      "apps/web/content/narration/x.engineer.md",
    ]);
    expect(files[0]?.sha256).toBe(sha256(RESUME));
  });
});

describe("the policy files", () => {
  it("refuse an approvals file that isn't main's shape, naming it", () => {
    for (const text of [
      "{",
      JSON.stringify({ schema: 2, approvals: [] }),
      JSON.stringify({ schema: 1 }),
      JSON.stringify({ schema: 1, approvals: [{ sha256: "abc" }] }),
      approvals("A".repeat(64)),
    ]) {
      expect(() => readPolicy(policyDir({ "content-approvals.json": text }))).toThrow(/content-approvals\.json/);
    }
  });

  it("give the PDF the full header only when both slots are filled", () => {
    const header = (full_name: unknown, contact: unknown): unknown =>
      pdfHeader(readPolicy(policyDir({ "resume-header.json": JSON.stringify({ schema: 1, full_name, contact }) })));
    expect(header(null, null)).toBeNull();
    expect(header("A Name", null)).toBeNull();
    expect(header(null, "a channel")).toBeNull();
    expect(header("", "a channel")).toBeNull();
    expect(header("A Name", "a channel")).toEqual({ full_name: "A Name", contact: "a channel" });
    expect(() => header(1, null)).toThrow(/resume-header\.json/);
  });

  it("have the digest web_image.py labels the image with: each file's name and SHA-256, or absent", () => {
    const a = approvals();
    const expected = sha256(`content-approvals.json:${sha256(a)}\nresume-header.json:absent\n`);
    expect(policyDigest(readPolicy(policyDir({ "content-approvals.json": a })))).toBe(expected);
    const none = sha256("content-approvals.json:absent\nresume-header.json:absent\n");
    expect(policyDigest(readPolicy(policyDir({})))).toBe(none);
  });
});

describe("publication", () => {
  it("leaves drafts out without ROOM_DRAFTS=1, and banners them with it", () => {
    expect(publication("approved", false)).toEqual({ publish: true, banner: false });
    expect(publication("approved", true)).toEqual({ publish: true, banner: false });
    expect(publication("draft", false)).toEqual({ publish: false, banner: false });
    expect(publication("draft", true)).toEqual({ publish: true, banner: true });
  });

  it("reads ROOM_DRAFTS as on for 1 alone", () => {
    expect(draftsOn({ ROOM_DRAFTS: "1" })).toBe(true);
    for (const value of [undefined, "", "0", "true", "yes", " 1"]) {
      expect(draftsOn(value === undefined ? {} : { ROOM_DRAFTS: value })).toBe(false);
    }
  });

  it("lists every draft in room-data.json, with the policy's digest, approved or not", () => {
    const root = tree();
    const policy = readPolicy(policyDir({ "content-approvals.json": approvals(sha256(RESUME)) }));
    const data = roomData(contentFiles(root, policy), policy);
    expect(data).toEqual({
      built_from: { policy: policyDigest(policy) },
      drafts: ["apps/web/content/narration/x.engineer.md"],
    });
  });
});

describe("build/policy.ts, a checkout's prebuild", () => {
  const git = (repo: string, ...args: string[]): string =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: repo,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@example.invalid",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@example.invalid",
      },
    });

  function repo(main: Record<string, string> | null, branch?: Record<string, string>): string {
    const root = temp("h4-repo-");
    git(root, "init", "-q", "-b", main === null ? "other" : "main");
    writeFileSync(join(root, "README.md"), "x\n");
    for (const [rel, text] of Object.entries(main ?? {})) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    git(root, "add", "-A");
    git(root, "commit", "-qm", "base");
    if (branch) {
      git(root, "switch", "-qc", "feature");
      for (const [rel, text] of Object.entries(branch)) writeFileSync(join(root, rel), text);
      git(root, "add", "-A");
      git(root, "commit", "-qm", "branch");
    }
    return root;
  }

  const MAIN_APPROVALS = approvals(sha256(RESUME));
  const MAIN_HEADER = JSON.stringify({ schema: 1, full_name: null, contact: null });

  it("fills the directory with main's two files", () => {
    const root = repo({
      "assets/policy/content-approvals.json": MAIN_APPROVALS,
      "assets/policy/resume-header.json": MAIN_HEADER,
    });
    const dir = join(temp("h4-fill-"), "policy");
    fillPolicy(dir, root);
    expect(readFileSync(join(dir, "content-approvals.json"), "utf8")).toBe(MAIN_APPROVALS);
    expect(readFileSync(join(dir, "resume-header.json"), "utf8")).toBe(MAIN_HEADER);
  });

  it("never reads the branch's copy", () => {
    const root = repo(
      { "assets/policy/content-approvals.json": MAIN_APPROVALS },
      { "assets/policy/content-approvals.json": approvals(sha256(SCRIPT)) },
    );
    const dir = join(temp("h4-fill-"), "policy");
    fillPolicy(dir, root);
    expect(readFileSync(join(dir, "content-approvals.json"), "utf8")).toBe(MAIN_APPROVALS);
    expect(readdirSync(dir)).toEqual(["content-approvals.json"]);
  });

  it("does nothing, and runs no git, when ROOM_POLICY_DIR names the directory, as in the image", () => {
    const asked: string[] = [];
    const show = (_repo: string, path: string): Buffer | null => {
      asked.push(path);
      return null;
    };
    expect(prebuild({ ROOM_POLICY_DIR: "/src/policy" }, show)).toBe("given");
    expect(asked).toEqual([]);
    expect(prebuild({}, show, join(temp("h4-fill-"), "policy"))).toBe("filled");
    expect(asked).toEqual(["assets/policy/content-approvals.json", "assets/policy/resume-header.json"]);
  });

  it("leaves the directory empty with no main, or none of the files on it, and clears what was there", () => {
    for (const root of [repo(null), repo({}), temp("h4-not-a-repo-")]) {
      const dir = join(temp("h4-fill-"), "policy");
      mkdirSync(dir);
      writeFileSync(join(dir, "content-approvals.json"), "stale\n");
      fillPolicy(dir, root);
      expect(readdirSync(dir)).toEqual([]);
    }
  });
});
