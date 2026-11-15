// intake-020 (spec 020; FR-002, FR-004, SC-001, SC-002; plan.md §5 step 5, R-10; the Author's orders, rule 15): the
// dog's files, taken in from studio round 4, on the committed tree and main's likeness approvals.
// - each of `dog.glb`, `dog-idle.glb`, `dog-walk.glb` is in `assets/visitors/dog/` with the SHA-256 his approval on
//   main names (A-20261114-dog, -dog-idle, -dog-walk), and its record names that SHA-256 and that approval;
// - the RA family reads, caps, and counts them as the man's and woman's (no RA or RK finding names the dog's folder in a
//   strict build), and the bundle holds the model, its idle, and its walk, with the line his approval carries;
// - no `dog-run.glb` (round 4 made none; rule 12's "Next: studio assets"), so the dog's clips are idle and walk;
// - with his approval of the model taken away, RA9 refuses it in a strict build and a lenient one bundles none of the
//   dog's files: it is his approval on main that brings the model in.
// The approvals are read as the build reads them (build/room/policy.ts): main's by its full ref, where the root holds
// a .git. In the gate's export, with no .git, they are the tree's own copy.
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { avatarsOf, bundledFiles } from "../../build/room/avatars";
import { compose } from "../../build/room/compose";
import type { ComposeOptions, Finding, RoomPolicy } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const DIR = "assets/visitors/dog";
const STRICT: ComposeOptions = { mode: "strict", drafts: false };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: false };
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const onDog = (findings: readonly Finding[]): string[] =>
  findings.filter((f) => f.file.startsWith(`${DIR}/`)).map((f) => `${f.rule} ${f.file}:${f.path}`);

/** His approvals on main (b6985ad2), by file: the ID and the SHA-256 each names. */
const APPROVED = {
  "dog.glb": { id: "A-20261114-dog", sha256: "d31c085cfa6dc92449f3ada3873417c829acd8e4989a3ae54c2bacc524842078" },
  "dog-idle.glb": {
    id: "A-20261114-dog-idle",
    sha256: "1bd5ee9454ed654700dbbec6279ec54861419d8ae47ffc61d243aa8107e9ff25",
  },
  "dog-walk.glb": {
    id: "A-20261114-dog-walk",
    sha256: "f35b742a6b8070faddf9f184fc1ac94d4560e1d4c501e2bee9a2c1ad3e53e306",
  },
} as const;

const tree = fileTree(REPO);
const policy = readRoomPolicy({ env: {}, root: REPO });
const approvals = policy.likeness?.approvals ?? [];
const modelApproval = approvals.find((a) => a.id === APPROVED["dog.glb"].id);

describe("the dog's files, taken in from round 4", () => {
  it("are in the dog's folder, each with the SHA-256 his approval names", () => {
    expect(tree.list(DIR)).toEqual(["LICENSE.md", "dog-idle.glb", "dog-walk.glb", "dog.glb", "records.json"]);
    for (const [name, want] of Object.entries(APPROVED)) {
      const bytes = tree.read(`${DIR}/${name}`);
      expect(bytes, name).not.toBeNull();
      expect(sha256(bytes as Uint8Array), name).toBe(want.sha256);
      expect(approvals.find((a) => a.id === want.id)?.sha256, want.id).toBe(want.sha256);
    }
  });

  it("are recorded with those SHA-256s and approvals, from round 4's photo source, as no likeness", () => {
    const text = new TextDecoder().decode(tree.read(`${DIR}/records.json`) ?? new Uint8Array());
    const records = JSON.parse(text || "{}") as {
      directory?: string;
      entries?: { file: string; sha256: string; approval?: string; likeness: boolean; source: { type: string } }[];
    };
    expect(records.directory).toBe(DIR);
    const entries = records.entries ?? [];
    expect(entries.map((e) => e.file)).toEqual(["dog-idle.glb", "dog-walk.glb", "dog.glb"]);
    for (const e of entries) {
      const want = APPROVED[e.file as keyof typeof APPROVED];
      expect(e.sha256, e.file).toBe(want.sha256);
      expect(e.approval, e.file).toBe(want.id);
      expect(e.likeness, e.file).toBe(false);
      expect(e.source.type, e.file).toBe("photo");
    }
  });

  it("carry the man's and woman's licence, word for word", () => {
    const dog = tree.read(`${DIR}/LICENSE.md`);
    expect(dog).not.toBeNull();
    expect(Buffer.from(dog as Uint8Array).equals(Buffer.from(tree.read("assets/visitors/man/LICENSE.md") ?? []))).toBe(
      true,
    );
  });

  it("are read, capped, and counted with no RA or RK finding, and bundled with his line", () => {
    expect(modelApproval?.disclosure_line).toMatch(/\S/);
    const result = compose(tree, policy, STRICT);
    expect(onDog(result.findings)).toEqual([]);
    expect(result.findings.filter((f) => /^(RA|RK)/.test(f.rule)).map((f) => `${f.rule} ${f.file}`)).toEqual([]);
    const dog = result.scene.avatars.dog;
    expect(dog).toBeDefined();
    expect(Object.keys(dog?.clips ?? {})).toEqual(["idle", "walk"]);
    expect(dog?.line).toBe(modelApproval?.disclosure_line);
    const set = avatarsOf(tree, policy, loadRoom(tree).scene?.value ?? null);
    const avatar = set.avatars.find((a) => a.id === "dog");
    expect(bundledFiles(avatar!).map((f) => f.name)).toEqual(["dog.glb", "dog-idle.glb", "dog-walk.glb"]);
  });

  it("are left out without his approval of the model: RA9 in a strict build, none bundled in a lenient one", () => {
    const without: RoomPolicy = {
      ...policy,
      likeness: { source: policy.likeness!.source, approvals: approvals.filter((a) => a.id !== "A-20261114-dog") },
    };
    expect(onDog(compose(tree, without, STRICT).findings).filter((w) => w.startsWith("RA9 "))).toEqual([
      `RA9 ${DIR}/dog.glb:-`,
    ]);
    const lenient = compose(tree, without, LENIENT);
    expect(lenient.scene.avatars.dog).toBeUndefined();
    expect(lenient.scene.avatars.man).toBeDefined();
  });
});
