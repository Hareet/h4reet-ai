// T003 (spec 020; FR-002, FR-003; plan.md §6): the report's lines for a visitor's likeness. The avatars table already
// gives the dog's files, bytes, and texture memory, bundled or why not (a model RA9 refuses: "no (RA9)"; its clips
// "no (no-model)"); after it, one line per likeness: whether main's approval holds, with its line, or RA9's reason and
// the cut-out. An avatar that isn't a likeness gets no such line.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, avatarModel, sceneWith, SCENE } from "../helpers/room-avatars";
import type { RecordEntry } from "../helpers/room-avatars";
import { twinPolicy } from "../helpers/room-twin";

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const LINE = "The dog is an AI-made likeness of the Author's dog, shown with his consent.";
const dogModel = avatarModel({ height: 0.62 }).bytes;
const clips = {
  idle: clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes,
  walk: clipGlb("walk", { tracks: IDLE_TRACKS, duration: 1 }).bytes,
};
const likeness = (e: RecordEntry[]): void => {
  for (const x of e) {
    x.likeness = true;
    x.source = { type: "photo", id: "H-dog-1" };
  }
};
const tree = (records: (e: RecordEntry[]) => void = likeness): Tree =>
  overlay({
    [SCENE]: sceneWith({ twin_stand_in: "man" }),
    ...avatarFolder("man"),
    ...avatarFolder("dog", {
      model: dogModel,
      clips: { idle: clips.idle, walk: clips.walk, "idle-holding": null, take: null },
      records,
    }),
  });
const approved = (): RoomPolicy => twinPolicy({ likeness: [{ id: "A-fx-dog", sha256: sha256(dogModel), line: LINE }] });
const lines = (r: ComposeResult): string[] => r.report.markdown.split("\n");
const row = (r: ComposeResult, path: string): string | undefined => lines(r).find((l) => l.startsWith(`| \`${path}\``));
const likenessLines = (r: ComposeResult): string[] => lines(r).filter((l) => l.startsWith("Likeness "));

describe("the report's lines for the dog (FR-002, FR-003)", () => {
  it("without an approval: the model's row says RA9, its clips no-model, and a line says the cut-out shows", () => {
    const r = compose(tree(), twinPolicy({ likeness: [] }), { mode: "lenient", drafts: true });
    expect(row(r, "assets/visitors/dog/dog.glb")).toMatch(/\| no \(RA9\) \|$/);
    expect(row(r, "assets/visitors/dog/dog-walk.glb")).toMatch(/\| no \(no-model\) \|$/);
    expect(likenessLines(r)).toEqual([
      "Likeness `dog`: no approval on main names its model's SHA-256 with a line (RA9), so none of its files is " +
        "bundled and its figure shows the cut-out.",
    ]);
  });

  it("with an approval: the files bundled, and a line saying the approval holds, with its line", () => {
    const r = compose(tree(), approved(), { mode: "strict", drafts: true });
    expect(row(r, "assets/visitors/dog/dog.glb")).toMatch(/\| yes \|$/);
    expect(row(r, "assets/visitors/dog/dog-idle.glb")).toMatch(/\| yes \|$/);
    expect(likenessLines(r)).toEqual([
      `Likeness \`dog\`: main's approval holds for its model, with the line "${LINE}"`,
    ]);
  });

  it("gives no likeness line for an avatar that isn't one", () => {
    const r = compose(
      tree(() => undefined),
      twinPolicy({ likeness: [] }),
      { mode: "strict", drafts: true },
    );
    expect(likenessLines(r)).toEqual([]);
  });
});
