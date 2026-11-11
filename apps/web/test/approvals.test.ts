// T014 (spec 002; FR-012; contracts/resume-source.md §5, data-model.md §4): a content file is approved only when the
// policy directory's copy of main's content-approvals.json lists its current SHA-256; anything else is a draft, left
// out of a build without ROOM_DRAFTS=1 and bannered in one with it. build/policy.ts fills that directory from main
// by refs/heads/main in a checkout, never from the branch or a tag; the image gets it as the named context `policy`.
//
// Spec 004's T004 (FR-030, FR-053; Amendment B9; research.md R-13, R-57): an approval of kind room-text, beside resume
// and narration, breaks no build, make up included, and any other kind is still refused; and main's caps.json joins
// the policy third, read as bytes for the room's compositor, so the policy's digest covers three files in one order
// with web_image.py's label.
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
  POLICY_FILES,
  policyDigest,
  publication,
  readPolicy,
  roomData,
  stateOf,
} from "../build/approvals";
import { fillPolicy, POLICY_PATHS, prebuild, type Show } from "../build/policy";
import { compose as roomCompose } from "../build/room/compose";
import { policyFrom } from "../build/room/policy";
import type { RoomPolicy } from "../build/room/policy";
import { fileTree } from "../build/room/source";

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
  return approvalsOf(...digests.map((sha) => ({ sha, kind: "resume" as unknown })));
}

/** content-approvals.json with one entry per digest, each of the kind given (any value, for the refusals). */
function approvalsOf(...entries: { sha: string; kind: unknown }[]): string {
  return JSON.stringify({
    schema: 1,
    approvals: entries.map(({ sha, kind }, i) => ({
      id: `C-${String(i + 1).padStart(4, "0")}`,
      path_when_approved:
        kind === "room-text" ? "apps/web/content/room/fixture-sign.yaml" : "apps/web/content/resume.yaml",
      kind,
      sha256: sha,
      date: "2026-10-18",
      reason: "a stand-in approval, made by the test",
    })),
  });
}

/** A stand-in for main's caps.json: the policy reads it as bytes, and only the room's compositor parses it. */
const CAPS = '{"schema": 1, "per_asset": {}, "fixture": "made by the test"}\n';

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
    // Spec 016 (FR-015; plan.md R-03, R-18): the likeness approvals fourth; changed with T012.
    const expected = sha256(
      `content-approvals.json:${sha256(a)}\nresume-header.json:absent\ncaps.json:absent\napprovals.json:absent\n`,
    );
    expect(policyDigest(readPolicy(policyDir({ "content-approvals.json": a })))).toBe(expected);
    const none = sha256(
      "content-approvals.json:absent\nresume-header.json:absent\ncaps.json:absent\napprovals.json:absent\n",
    );
    expect(policyDigest(readPolicy(policyDir({})))).toBe(none);
  });

  it("are the approvals, the header, the caps, and the likeness approvals, in the order the digest takes them (spec 004, R-13; spec 016, R-03)", () => {
    expect(POLICY_FILES).toEqual(["content-approvals.json", "resume-header.json", "caps.json", "approvals.json"]);
    // build/policy.ts fills the directory with the same names, in the same order.
    expect(POLICY_PATHS.map(([, name]) => name)).toEqual([...POLICY_FILES]);
  });

  it("digest the caps third, so web_image.py's label and room-data.json's built_from agree (spec 004, R-13)", () => {
    const a = approvals();
    const h = JSON.stringify({ schema: 1, full_name: null, contact: null });
    const all = readPolicy(policyDir({ "content-approvals.json": a, "resume-header.json": h, "caps.json": CAPS }));
    expect(policyDigest(all)).toBe(
      sha256(
        `content-approvals.json:${sha256(a)}\nresume-header.json:${sha256(h)}\ncaps.json:${sha256(CAPS)}\n` +
          "approvals.json:absent\n",
      ),
    );
    const capsOnly = readPolicy(policyDir({ "caps.json": CAPS }));
    expect(policyDigest(capsOnly)).toBe(
      sha256(`content-approvals.json:absent\nresume-header.json:absent\ncaps.json:${sha256(CAPS)}\napprovals.json:absent\n`),
    );
  });

  it("read caps.json as bytes and never parse it: the room's compositor does (spec 004, R-13)", () => {
    const odd = "not JSON, and the policy reader doesn't care {\n";
    const policy = readPolicy(policyDir({ "caps.json": odd }));
    expect(policy.files["caps.json"]?.toString("utf8")).toBe(odd);
    expect(readPolicy(policyDir({})).files["caps.json"]).toBeNull();
    // A directory in its place is absent, as for the other two.
    const dir = policyDir({});
    mkdirSync(join(dir, "caps.json"));
    expect(readPolicy(dir).files["caps.json"]).toBeNull();
  });
});

describe("a room-text approval (spec 004, FR-030, Amendment B9; R-57)", () => {
  it("is accepted beside resume and narration, so one on main breaks no build, make up included", () => {
    const text = "version: 1\nlines: []\n";
    const policy = readPolicy(
      policyDir({
        "content-approvals.json": approvalsOf(
          { sha: sha256(RESUME), kind: "resume" },
          { sha: sha256(SCRIPT), kind: "narration" },
          { sha: sha256(text), kind: "room-text" },
        ),
      }),
    );
    expect([...policy.approved].sort()).toEqual([sha256(RESUME), sha256(SCRIPT), sha256(text)].sort());
    // The build's own fields still come out: the resume and the script approved, whatever else main approves.
    const data = roomData(contentFiles(tree(), policy), policy, false);
    expect(data.published.map((p) => p.path)).toEqual([
      "apps/web/content/resume.yaml",
      "apps/web/content/narration/x.engineer.md",
    ]);
    expect(data.drafts).toEqual([]);
  });

  it("still leaves every other kind refused, naming the three it accepts", () => {
    for (const kind of ["outline", "Room-text", "room_text", "roomtext", " room-text", "", null, 1, ["room-text"]]) {
      const text = approvalsOf({ sha: sha256(RESUME), kind });
      expect(() => readPolicy(policyDir({ "content-approvals.json": text })), String(kind)).toThrow(
        /content-approvals\.json.*kind isn't resume, narration, or room-text/,
      );
    }
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

  it("names in room-data.json what it published, each with its digest, and every draft it left out", () => {
    // The gate's content check reads `published` as the build's claim, holds each digest to main's approvals, and
    // scans dist/ for any draft's text whatever the build says (contracts/resume-source.md §5).
    const root = tree();
    const policy = readPolicy(policyDir({ "content-approvals.json": approvals(sha256(RESUME)) }));
    const data = roomData(contentFiles(root, policy), policy, false);
    expect(data).toEqual({
      built_from: { policy: policyDigest(policy) },
      published: [{ path: "apps/web/content/resume.yaml", sha256: sha256(RESUME) }],
      drafts: ["apps/web/content/narration/x.engineer.md"],
    });
  });

  it("publishes drafts too in a drafts build, marked as such, and still lists them as drafts", () => {
    const root = tree();
    const policy = readPolicy(policyDir({ "content-approvals.json": approvals(sha256(RESUME)) }));
    expect(roomData(contentFiles(root, policy), policy, true).published).toEqual([
      { path: "apps/web/content/resume.yaml", sha256: sha256(RESUME) },
      { path: "apps/web/content/narration/x.engineer.md", sha256: sha256(SCRIPT), draft: true },
    ]);
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
      for (const [rel, text] of Object.entries(branch)) {
        mkdirSync(join(root, rel, ".."), { recursive: true });
        writeFileSync(join(root, rel), text);
      }
      git(root, "add", "-A");
      git(root, "commit", "-qm", "branch");
    }
    return root;
  }

  const MAIN_APPROVALS = approvals(sha256(RESUME));
  const MAIN_HEADER = JSON.stringify({ schema: 1, full_name: null, contact: null });

  it("reads main's four paths, the caps third and the likeness approvals fourth (spec 004, R-13; spec 016, R-03)", () => {
    // Changed with T012 (spec 016, plan.md R-18): the likeness approvals join the policy fourth.
    expect(POLICY_PATHS).toEqual([
      ["assets/policy/content-approvals.json", "content-approvals.json"],
      ["assets/policy/resume-header.json", "resume-header.json"],
      ["assets/policy/caps.json", "caps.json"],
      ["assets/policy/approvals.json", "approvals.json"],
    ]);
  });

  it("fills the directory with main's three files", () => {
    const root = repo({
      "assets/policy/content-approvals.json": MAIN_APPROVALS,
      "assets/policy/resume-header.json": MAIN_HEADER,
      "assets/policy/caps.json": CAPS,
    });
    const dir = join(temp("h4-fill-"), "policy");
    expect(fillPolicy(dir, root)).toEqual(["content-approvals.json", "resume-header.json", "caps.json"]);
    expect(readFileSync(join(dir, "content-approvals.json"), "utf8")).toBe(MAIN_APPROVALS);
    expect(readFileSync(join(dir, "resume-header.json"), "utf8")).toBe(MAIN_HEADER);
    expect(readFileSync(join(dir, "caps.json"), "utf8")).toBe(CAPS);
  });

  it("writes caps.json from what main's refs/heads/main holds, through the Show it's given (spec 004, R-13)", () => {
    const asked: [string, string][] = [];
    const show: Show = (repoDir, path) => {
      asked.push([repoDir, path]);
      return path === "assets/policy/caps.json" ? Buffer.from(CAPS) : null;
    };
    const dir = join(temp("h4-fill-"), "policy");
    expect(fillPolicy(dir, "/the/repository", show)).toEqual(["caps.json"]);
    expect(asked).toEqual([
      ["/the/repository", "assets/policy/content-approvals.json"],
      ["/the/repository", "assets/policy/resume-header.json"],
      ["/the/repository", "assets/policy/caps.json"],
      ["/the/repository", "assets/policy/approvals.json"],
    ]);
    expect(readdirSync(dir)).toEqual(["caps.json"]);
    expect(readFileSync(join(dir, "caps.json"), "utf8")).toBe(CAPS);
  });

  it("takes main's caps.json, never a branch's or a tag's named main (spec 004, R-13)", () => {
    // A branch could raise its own caps if the build read its copy; a tag named main would answer a bare `main`.
    const raised = '{"schema": 1, "per_asset": {"room": "raised by the branch"}}\n';
    const root = repo({ "assets/policy/caps.json": CAPS }, { "assets/policy/caps.json": raised });
    git(root, "tag", "main", "feature");
    const dir = join(temp("h4-fill-"), "policy");
    fillPolicy(dir, root);
    expect(readFileSync(join(dir, "caps.json"), "utf8")).toBe(CAPS);
    // With no branch main, a tag named main gives no caps at all.
    const tagged = repo(null, { "assets/policy/caps.json": raised });
    git(tagged, "tag", "main", "feature");
    fillPolicy(dir, tagged);
    expect(readdirSync(dir)).toEqual([]);
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

  it("reads main by its full ref: a tag named main never stands in for the branch", () => {
    // git resolves a bare `main` to refs/tags/main before refs/heads/main, and an agent session can make that tag.
    const root = repo(
      { "assets/policy/content-approvals.json": MAIN_APPROVALS },
      { "assets/policy/content-approvals.json": approvals(sha256(SCRIPT)) },
    );
    git(root, "tag", "main", "feature");
    const dir = join(temp("h4-fill-"), "policy");
    fillPolicy(dir, root);
    expect(readFileSync(join(dir, "content-approvals.json"), "utf8")).toBe(MAIN_APPROVALS);
    // With no branch main, a tag named main approves nothing.
    const tagged = repo(null, { "assets/policy/content-approvals.json": approvals(sha256(SCRIPT)) });
    git(tagged, "tag", "main", "feature");
    fillPolicy(dir, tagged);
    expect(readdirSync(dir)).toEqual([]);
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
    expect(asked).toEqual([
      "assets/policy/content-approvals.json",
      "assets/policy/resume-header.json",
      "assets/policy/caps.json",
      "assets/policy/approvals.json",
    ]);
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

// T038 (spec 014; FR-050, FR-051; SC-008; plan.md §8): the chalkboard's line, `chalk-denverlocal.yaml`, waits only for
// the Author's room-text approval. With a policy whose approvals name the block's digest under room-text, computed here
// from the file at run time (no digest is written down), a release build publishes the block, its one line the words
// "denverlocal.ai", approved, so the slate's region draws it; without the entry, a release build leaves it out, the
// slate plain, and a drafts build carries it marked as a draft.
describe("the slate's line (spec 014, T038)", () => {
  const ROOT = join(__dirname, "..", "..", "..");
  const BLOCK = "apps/web/content/room/chalk-denverlocal.yaml";
  const digest = sha256(readFileSync(join(ROOT, BLOCK)));
  const caps = readFileSync(join(ROOT, "assets/policy/caps.json"));
  const withBoard = policyFrom(
    {
      caps,
      approvals: new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          approvals: [
            {
              id: "C-0003",
              path_when_approved: BLOCK,
              kind: "room-text",
              sha256: digest,
              date: "2026-11-10",
              reason: "a stand-in approval, made by the test",
            },
          ],
        }),
      ),
      header: null,
    },
    "policy-dir",
  );
  const without = policyFrom({ caps, approvals: null, header: null }, "policy-dir");
  const block = (policy: RoomPolicy, drafts: boolean) =>
    roomCompose(fileTree(ROOT), policy, { mode: "lenient", drafts }).roomText.blocks.find(
      (b) => b.id === "chalk-denverlocal",
    );

  it("publishes the line, approved, in a release build once main approves the block's digest", () => {
    const b = block(withBoard, false);
    expect(b?.state).toBe("approved");
    expect(b?.sha256).toBe(digest);
    expect(b?.lines.map((l) => l.text)).toEqual(["denverlocal.ai"]);
  });

  it("leaves the slate plain in a release build without it, and marks it a draft in a drafts build", () => {
    expect(block(without, false)).toBeUndefined();
    expect(block(without, true)?.state).toBe("draft");
  });
});
