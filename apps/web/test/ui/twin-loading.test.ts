// T065 (spec 016; FR-047; plan.md R-05; Amendment M23; spec 012's contracts/loading-progress.md §3): the loader's count
// with the twin's own files, over the stage's own entries for a bundle with the twin.
// - The expected files include the twin's model and clips by their served bytes, and the chosen avatar's.
// - A stand-in fetched after the twin's model fails counts for nothing.
// - The progress reaches 100 only once every expected file has ended, and every step part.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { createProgress } from "../../src/room/loading/progress";
import { figureEntries, modelEntries, standInEntries } from "../../src/room/scene/loader";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, SCENE, sceneWith } from "../helpers/room-avatars";
import { twinFolder, twinPolicy } from "../helpers/room-twin";

const result = compose(
  overlay({
    [SCENE]: sceneWith({ twin_stand_in: "man" }),
    ...avatarFolder("man"),
    ...avatarFolder("woman"),
    ...twinFolder(),
  }),
  twinPolicy(),
  { mode: "lenient", drafts: false },
);
const part = result.scene;
const expected = [...figureEntries(part, "woman"), ...modelEntries(part)].map((e) => ({
  asset: e.asset,
  bytes: e.bytes,
}));

describe("the loader's count with the twin (FR-047)", () => {
  it("expects the twin's files by their served bytes, and the chosen avatar's, and no stand-in's", () => {
    const twin = part.twin;
    if (!twin) throw new Error("no twin");
    expect(expected.find((f) => f.asset === "twin")?.bytes).toBe(twin.model.bytes);
    for (const [role, clip] of Object.entries(twin.clips))
      expect(expected.find((f) => f.asset === `twin-${role}`)?.bytes).toBe(clip?.bytes);
    expect(expected.some((f) => f.asset === "woman")).toBe(true);
    expect(expected.some((f) => f.asset.startsWith("man"))).toBe(false);
  });

  it("counts a stand-in fetched after the twin fails for nothing, and reaches 100 only once every file has ended", () => {
    const p = createProgress();
    for (const step of ["code", "text", "typefaces"] as const) p.ended(step);
    p.expected(expected);
    const [first, ...rest] = expected;
    if (!first) throw new Error("nothing expected");
    p.asset(first.asset, "failed");
    const before = p.state.value;
    // The twin's model failed: the stage fetches the stand-in's files, which the list never named.
    for (const e of standInEntries(part, "woman")) p.asset(e.asset, "loaded");
    expect(p.state.value).toBe(before);
    expect(p.state.complete).toBe(false);
    for (const f of rest.slice(0, -1)) p.asset(f.asset, "loaded");
    expect(p.state.value).toBeLessThan(100);
    const last = rest.at(-1);
    if (last) p.asset(last.asset, "skipped");
    expect(p.state.value).toBe(100);
    expect(p.state.complete).toBe(true);
  });
});
