// T067's policy half (spec 004; FR-053; Amendment C7; R-13, R-25; contracts/room-bundle.md §2): where the room's caps
// come from, the first source that exists: ROOM_POLICY_DIR ("policy-dir"), main by its full ref with
// `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:assets/policy/caps.json` ("main"; a tag named main and a
// replace entry change nothing, and the branch's own copy is never read), or, only where there is no .git, the export's
// own copy ("export"). Without per_asset.room the source is "defaults", FR-053's starting figures, pinned here. A
// malformed block is RK4's: the reader keeps it raw with its problems, which name paths and never a value. Main's
// approvals and the PDF header's full name come from the same source. The repositories are made by the test.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compose, formatFinding } from "../../build/room/compose";
import { CAPS_DEFAULTS, noPolicy, PHASE3_DEFAULT, readRoomPolicy } from "../../build/room/policy";
import { goodTree } from "../helpers/room-fixtures";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const CAPS = "assets/policy/caps.json";
const APPROVALS = "assets/policy/content-approvals.json";
const HEADER = "assets/policy/resume-header.json";

const ROOM = {
  gzip_bytes: 2000000,
  triangles: 30000,
  small_props: ["fx-plug", "fx-sign"],
  small_prop_texture_px: 512,
  scene_texture_bytes: 80000000,
  legibility_floor_css_px: 10,
};
const capsText = (room: unknown, extra: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ schema: 1, per_asset: { room }, first_visit_bytes: { phase2: 10000000, phase3: 20000000 }, ...extra }, null, 2)}\n`;
const approvalsText = (entries: { sha256: string; kind: string }[]): string =>
  `${JSON.stringify({
    schema: 1,
    approvals: entries.map((e, i) => ({
      id: `C-${String(i + 1).padStart(4, "0")}`,
      path_when_approved: "apps/web/content/room/fx-notes.yaml",
      kind: e.kind,
      sha256: e.sha256,
      date: "2026-10-23",
      reason: "Fixture approval.",
    })),
  })}\n`;

const made: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "room-policy-"));
  made.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: repo,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.invalid",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.invalid",
    },
  }).trim();
}

/** A repository whose main holds `main` (null: no branch main), checked out on a branch that holds `branch` too. */
function repository(main: Record<string, string> | null, branch: Record<string, string> = {}): string {
  const root = temp();
  git(root, "init", "-q", "-b", main === null ? "other" : "main");
  write(root, { "README.md": "fixture\n", ...(main ?? {}) });
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  git(root, "switch", "-qc", "feature");
  write(root, branch);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "branch", "--allow-empty");
  return root;
}

describe("the defaults (FR-053's starting figures)", () => {
  it("are 2,500,000 gzip-9 bytes and 40,000 triangles a piece, no small props, 1024, 96,000,000, and a floor of 9", () => {
    expect(CAPS_DEFAULTS).toEqual({
      gzip_bytes: 2500000,
      triangles: 40000,
      small_props: [],
      small_prop_texture_px: 1024,
      scene_texture_bytes: 96000000,
      legibility_floor_css_px: 9,
    });
    expect(PHASE3_DEFAULT).toBe(25000000);
  });

  it("make a policy with no caps, nothing approved, and no name", () => {
    expect(noPolicy()).toEqual({
      caps: null,
      caps_source: "defaults",
      caps_sha256: null,
      phase3_bytes: 25000000,
      approvals: [],
      caps_block: undefined,
      caps_problems: [],
      full_name: null,
    });
  });
});

describe("where the caps come from (contracts/room-bundle.md §2)", () => {
  it("is ROOM_POLICY_DIR first, even beside a repository", () => {
    const root = repository({ [CAPS]: capsText({ ...ROOM, triangles: 1 }) });
    const dir = temp();
    const caps = capsText(ROOM);
    const approved = [{ sha256: sha256("fx"), kind: "room-text" }];
    write(dir, {
      "caps.json": caps,
      "content-approvals.json": approvalsText(approved),
      "resume-header.json": `${JSON.stringify({ schema: 1, full_name: "Fixture Person", contact: null })}\n`,
    });
    const policy = readRoomPolicy({ env: { ROOM_POLICY_DIR: dir }, root });
    expect(policy).toEqual({
      caps: ROOM,
      caps_source: "policy-dir",
      caps_sha256: sha256(caps),
      phase3_bytes: 20000000,
      approvals: approved,
      caps_block: ROOM,
      caps_problems: [],
      full_name: "Fixture Person",
    });
  });

  it("is main next, by refs/heads/main: never the branch's copy, a tag named main, or a replace entry", () => {
    const caps = capsText(ROOM);
    const root = repository(
      { [CAPS]: caps, [APPROVALS]: approvalsText([{ sha256: sha256("main"), kind: "resume" }]) },
      { [CAPS]: capsText({ ...ROOM, triangles: 99999 }) },
    );
    writeFileSync(join(root, CAPS), capsText({ ...ROOM, triangles: 88888 }));
    git(root, "tag", "main", "feature");
    // Not vacuous: a bare `main` reads the tag, which holds the branch's caps.
    expect(git(root, "cat-file", "blob", `main:${CAPS}`)).toContain("99999");
    const blob = git(root, "rev-parse", `refs/heads/main:${CAPS}`);
    writeFileSync(join(root, "loose.json"), capsText({ ...ROOM, triangles: 77777 }));
    git(root, "replace", blob, git(root, "hash-object", "-w", join(root, "loose.json")));
    // Not vacuous: without GIT_NO_REPLACE_OBJECTS, main's blob now reads as the replacement.
    expect(git(root, "cat-file", "blob", `refs/heads/main:${CAPS}`)).toContain("77777");

    const policy = readRoomPolicy({ env: {}, root });
    expect(policy.caps_source).toBe("main");
    expect(policy.caps).toEqual(ROOM);
    expect(policy.caps_sha256).toBe(sha256(caps));
    expect(policy.approvals).toEqual([{ sha256: sha256("main"), kind: "resume" }]);
    expect(policy.full_name).toBeNull();
  });

  it("ignores the caller's GIT_DIR and git configuration", () => {
    const root = repository({ [CAPS]: capsText(ROOM) });
    vi.stubEnv("GIT_DIR", join(root, "nowhere"));
    vi.stubEnv("GIT_CONFIG_PARAMETERS", "'core.bare'='true'");
    expect(readRoomPolicy({ env: {}, root }).caps).toEqual(ROOM);
  });

  it("is the defaults where main lacks the room block, keeping the file's digest", () => {
    const caps = capsText(undefined);
    const root = repository({ [CAPS]: caps }, { [CAPS]: capsText(ROOM) });
    const policy = readRoomPolicy({ env: {}, root });
    expect(policy).toMatchObject({ caps: null, caps_source: "defaults", caps_sha256: sha256(caps), caps_problems: [] });
    expect(policy.phase3_bytes).toBe(20000000);
  });

  it("is the defaults where main has no caps.json, or there is no branch main: never the tree's own copy", () => {
    for (const root of [repository({}, { [CAPS]: capsText(ROOM) }), repository(null, { [CAPS]: capsText(ROOM) })]) {
      expect(readRoomPolicy({ env: {}, root })).toEqual(noPolicy());
    }
  });

  it("is the export's own copy only where there is no .git", () => {
    const root = temp();
    const caps = capsText(ROOM);
    write(root, { [CAPS]: caps, [HEADER]: `${JSON.stringify({ schema: 1, full_name: null, contact: null })}\n` });
    const policy = readRoomPolicy({ env: {}, root });
    expect(policy).toMatchObject({ caps: ROOM, caps_source: "export", caps_sha256: sha256(caps), full_name: null });
    expect(readRoomPolicy({ env: {}, root: temp() })).toEqual(noPolicy());
  });

  it.todo(
    "without per_asset.room every model stays a stand-in with the reason no-caps, and the report and manifest say so (T080)",
  );
});

describe("a malformed room block (RK4's, reported by T078's RK family)", () => {
  const read = (caps: string): ReturnType<typeof readRoomPolicy> => {
    const dir = temp();
    write(dir, { "caps.json": caps });
    return readRoomPolicy({ env: { ROOM_POLICY_DIR: dir }, root: temp() });
  };
  const problems = (caps: string): string[] => read(caps).caps_problems.map((p) => p.path);

  it.each([
    ["a missing key", { ...ROOM, triangles: undefined }, "per_asset.room.triangles"],
    ["an unknown key", { ...ROOM, bytes: 1 }, "per_asset.room.bytes"],
    ["a string for a number", { ...ROOM, gzip_bytes: "2500000" }, "per_asset.room.gzip_bytes"],
    ["a cap of 0", { ...ROOM, scene_texture_bytes: 0 }, "per_asset.room.scene_texture_bytes"],
    ["a negative floor", { ...ROOM, legibility_floor_css_px: -9 }, "per_asset.room.legibility_floor_css_px"],
    [
      "a texture side that isn't a power of two",
      { ...ROOM, small_prop_texture_px: 1000 },
      "per_asset.room.small_prop_texture_px",
    ],
    ["small props that aren't a list", { ...ROOM, small_props: "fx-plug" }, "per_asset.room.small_props"],
    [
      "a small prop outside the ID grammar",
      { ...ROOM, small_props: ["fx-plug", "Fx Bad Prop"] },
      "per_asset.room.small_props[1]",
    ],
    ["a small prop twice", { ...ROOM, small_props: ["fx-plug", "fx-plug"] }, "per_asset.room.small_props[1]"],
    ["a block that isn't an object", 5, "per_asset.room"],
  ])("%s", (_, room, path) => {
    const policy = read(capsText(room));
    expect(policy.caps).toBeNull();
    expect(policy.caps_source).toBe("policy-dir");
    expect(policy.caps_block).toEqual(JSON.parse(capsText(room)).per_asset.room);
    expect(policy.caps_problems.map((p) => p.path)).toEqual([path]);
    for (const p of policy.caps_problems) expect(p.reason).not.toMatch(/Fx Bad Prop|2500000|fx-plug/);
  });

  it("refuses a float where the block takes an integer, as spec 003's F2 reads it", () => {
    const text = capsText(ROOM).replace('"triangles": 30000', '"triangles": 30000.0');
    expect(problems(text)).toEqual(["per_asset.room.triangles"]);
  });

  it("refuses a caps.json that doesn't parse, or holds a duplicate key, for the whole file", () => {
    expect(problems("{")).toEqual(["-"]);
    expect(problems('{"schema": 1, "schema": 1}')).toEqual(["-"]);
    expect(read("{").caps_block).toBeUndefined();
  });

  it("takes the defaults' phase-3 figure where the file doesn't give one", () => {
    expect(read(`${JSON.stringify({ schema: 1, per_asset: { room: ROOM } })}\n`).phase3_bytes).toBe(25000000);
  });

  it("is RK4, by its path in caps.json, and fails strict and lenient builds alike", () => {
    const policy = read(capsText({ ...ROOM, triangles: undefined }));
    for (const mode of ["strict", "lenient"] as const) {
      const rk4 = compose(goodTree(), policy, { mode, drafts: true }).findings.filter((f) => f.rule === "RK4");
      expect(rk4.map((f) => formatFinding(f, mode))).toEqual([
        expect.stringMatching(/^RK4 assets\/policy\/caps\.json:per_asset\.room\.triangles: /),
      ]);
      expect(rk4.every((f) => !f.lenient)).toBe(true);
    }
  });
});
