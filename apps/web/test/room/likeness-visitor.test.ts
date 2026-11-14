// T001 (spec 020; FR-002, FR-003, SC-001; plan.md R-01): RA9, a visitor avatar recorded as a likeness or from a photo,
// bundled only where main's likeness approvals hold an entry for its model's SHA-256 with a non-empty line.
// - no approval, an empty or null line, or an approval for another SHA-256: a strict build finds RA9, a lenient build
//   bundles none of the avatar's files, and scene.avatars has no entry;
// - a matching approval with a line: the model and its clips are bundled, the avatar's `line` is the approval's;
// - a clip of an unbundled model is not bundled;
// - a non-likeness avatar is unaffected; the stand-in recorded as a likeness still fails RA3, not RA9.
import { describe, expect, it } from "vitest";

import { avatarsOf } from "../../build/room/avatars";
import { compose } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, avatarModel, sceneWith, SCENE } from "../helpers/room-avatars";
import type { RecordEntry } from "../helpers/room-avatars";
import { likenessText, twinPolicy } from "../helpers/room-twin";
import { createHash } from "node:crypto";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: true };
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const where = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.rule} ${f.file}:${f.path}`);
const LINE = "The dog is an AI-made likeness of the Author's dog, shown with his consent.";

const dogModel = avatarModel({ height: 0.62 }).bytes;
const dogClips = {
  idle: clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes,
  walk: clipGlb("walk", { tracks: IDLE_TRACKS, duration: 1 }).bytes,
};

/** The dog's folder recorded as a likeness from a photo batch, beside the man as the stand-in. */
const likeness = (e: RecordEntry[]): void => {
  for (const x of e) {
    x.likeness = true;
    x.source = { type: "photo", id: "H-dog-1" };
  }
};
const tree = (o: { records?: (e: RecordEntry[]) => void } = {}): Tree =>
  overlay({
    [SCENE]: sceneWith({ twin_stand_in: "man" }),
    ...avatarFolder("man"),
    ...avatarFolder("dog", {
      model: dogModel,
      clips: { idle: dogClips.idle, walk: dogClips.walk, "idle-holding": null, take: null },
      records: o.records ?? likeness,
    }),
  });
const policyWith = (entries: { sha: string; line: string | null }[] | null): RoomPolicy =>
  twinPolicy({
    likeness: entries === null ? [] : entries.map((e, i) => ({ id: `A-fx-dog-${i}`, sha256: e.sha, line: e.line })),
  });
void likenessText;

const dogFiles = (t: Tree, p: RoomPolicy): string[] => {
  const scene = loadRoom(t).scene?.value ?? null;
  const dog = avatarsOf(t, p, scene).avatars.find((a) => a.id === "dog");
  return (dog ? [dog.model, ...dog.clips] : []).filter((f) => f?.bundled).map((f) => f!.name);
};

describe("RA9: a visitor's likeness without main's approval and line (FR-002, SC-001)", () => {
  const cases: [string, RoomPolicy][] = [
    ["no approval", policyWith(null)],
    ["a null line", policyWith([{ sha: sha256(dogModel), line: null }])],
    ["an empty line", policyWith([{ sha: sha256(dogModel), line: "" }])],
    ["another SHA-256", policyWith([{ sha: sha256(new Uint8Array([1, 2, 3])), line: LINE }])],
  ];
  it.each(cases)("%s: strict finds RA9, lenient bundles none of the dog's files", (_name, policy) => {
    const t = tree();
    const strict = compose(t, policy, STRICT);
    expect(where(strict.findings)).toEqual(["RA9 assets/visitors/dog/dog.glb:-"]);
    const lenient = compose(t, policy, LENIENT);
    expect(lenient.scene.avatars.dog).toBeUndefined();
    expect(lenient.scene.avatars.man).toBeDefined();
    expect(dogFiles(t, policy)).toEqual([]);
  });

  it("a matching approval with a line bundles the model, idle, and walk, with the line", () => {
    const policy = policyWith([{ sha: sha256(dogModel), line: LINE }]);
    const t = tree();
    expect(where(compose(t, policy, STRICT).findings)).toEqual([]);
    expect(dogFiles(t, policy)).toEqual(["dog.glb", "dog-idle.glb", "dog-walk.glb"]);
    const scene = loadRoom(t).scene?.value ?? null;
    const dog = avatarsOf(t, policy, scene).avatars.find((a) => a.id === "dog");
    expect(dog?.line).toBe(LINE);
    expect(Object.keys(compose(t, policy, LENIENT).scene.avatars.dog?.clips ?? {})).toEqual(["idle", "walk"]);
  });

  it("a clip of an unbundled model is not bundled", () => {
    const policy = policyWith(null);
    const t = tree();
    const scene = loadRoom(t).scene?.value ?? null;
    const dog = avatarsOf(t, policy, scene).avatars.find((a) => a.id === "dog");
    expect(dog?.clips.every((c) => !c.bundled)).toBe(true);
    expect(dog?.line ?? null).toBeNull();
  });

  it("a photo-sourced record alone (likeness false) is held too", () => {
    const t = tree({
      records: (e) => {
        for (const x of e) x.source = { type: "photo", id: "H-dog-1" };
      },
    });
    expect(where(compose(t, policyWith(null), STRICT).findings)).toEqual(["RA9 assets/visitors/dog/dog.glb:-"]);
  });

  it("a non-likeness avatar needs no approval", () => {
    const t = tree({ records: () => undefined });
    const policy = policyWith(null);
    expect(where(compose(t, policy, STRICT).findings)).toEqual([]);
    expect(dogFiles(t, policy)).toEqual(["dog.glb", "dog-idle.glb", "dog-walk.glb"]);
    const scene = loadRoom(t).scene?.value ?? null;
    expect(avatarsOf(t, policy, scene).avatars.find((a) => a.id === "dog")?.line ?? null).toBeNull();
  });

  it("the stand-in recorded as a likeness fails RA3, not RA9", () => {
    const t = overlay({
      [SCENE]: sceneWith({ twin_stand_in: "man" }),
      ...avatarFolder("man", { records: likeness }),
    });
    expect(where(compose(t, policyWith(null), STRICT).findings)).toEqual(["RA3 assets/visitors/man/man.glb:-"]);
  });
});
