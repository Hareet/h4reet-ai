// T006 (spec 020; FR-003, FR-007; plan.md R-02): the likeness line of the visitor's avatar.
// - The index's copy carries the visitor's line slot, `{visitor_line: true}`, right after the twin's.
// - The 3D stage's picture signal for the visitor's figure carries the bundle's `avatars.<id>.line` while that avatar's
//   model shows, and no `line` for an avatar without one.
// - The room fills the slot, in the stage's note and in "Around the room" after the twin's line, as text a screen reader
//   reads, while the visitor's figure shows a model with a line; it takes it away (no element at all, so the layout,
//   320 × 568 among them, adds no line) while the cut-out shows, once the avatar failed, and for an avatar with no line.
import { createHash } from "node:crypto";

import { Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { FigureSignal } from "../../src/room/stage";
import { avatarGlb, clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { flush, intoRoom, start, stubViewport, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree, overlay } from "../helpers/room-fixtures";
import { avatarFolder, sceneWith, SCENE } from "../helpers/room-avatars";
import type { RecordEntry } from "../helpers/room-avatars";
import { twinPolicy } from "../helpers/room-twin";

const LINE = "The dog is an AI-made likeness of the Author's dog, shown with his consent.";
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

describe("the copy's visitor line slot (FR-003)", () => {
  it("follows the twin's line slot in the index's copy", () => {
    const { index } = compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
    expect(index.copy.slice(0, 2)).toEqual([{ twin_line: true }, { visitor_line: true }]);
  });
});

describe("the visitor's picture signal carries the bundle's line (FR-003)", () => {
  const dogBytes = avatarGlb({ height: 1.3, hands: false, legs: true }).bytes;
  const idleBytes = clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes;
  const likeness = (e: RecordEntry[]): void => {
    for (const x of e) {
      x.likeness = true;
      x.source = { type: "photo", id: "H-dog-1" };
    }
  };
  const night = (records: ((e: RecordEntry[]) => void) | undefined) =>
    compose(
      overlay({
        [SCENE]: sceneWith({ twin_stand_in: "man" }),
        ...avatarFolder("man"),
        ...avatarFolder("dog", {
          model: dogBytes,
          clips: { idle: idleBytes, walk: null, "idle-holding": null, take: null },
          ...(records ? { records } : {}),
        }),
      }),
      twinPolicy({ likeness: [{ id: "A-fx-dog", sha256: sha256(dogBytes), line: LINE }] }),
      { mode: "lenient", drafts: false },
    );
  const loader = new GLTFLoader();
  const parsed = async (bytes: Uint8Array): Promise<{ scene: Object3D; animations: AnimationClip[] }> =>
    loader.parseAsync(bytes.slice().buffer, "");
  const shown = async (records: ((e: RecordEntry[]) => void) | undefined): Promise<FigureSignal[]> => {
    const composed = night(records);
    const room = buildRoom(composed.scene, { avatar: "dog", label: () => new Object3D(), index: composed.index });
    const signals: FigureSignal[] = [];
    const figures = createAvatarFigures(room, composed.scene, { chosen: "dog", signal: (x) => signals.push(x) });
    expect(figures.model("dog", (await parsed(dogBytes)).scene)).toBe(true);
    figures.clip("dog", "idle", (await parsed(idleBytes)).animations);
    figures.handoffEnded();
    return signals.filter((x) => x.kind === "picture" && x.figure === "visitor" && x.shows === "avatar");
  };

  it("with the approval's line while the dog's model shows", async () => {
    const pictures = await shown(likeness);
    expect(pictures).not.toEqual([]);
    for (const p of pictures)
      expect(p).toEqual({ kind: "picture", figure: "visitor", shows: "avatar", why: null, line: LINE });
  });

  it("with no line for an avatar the bundle gives none", async () => {
    const pictures = await shown(undefined);
    expect(pictures).not.toEqual([]);
    for (const p of pictures) expect("line" in p).toBe(false);
  });
});

/** Reports a figure signal as the 3D stage would, through the options the room gave it. */
function signal(v: Visit, s: FigureSignal): void {
  const options = v.scene.created.at(-1);
  if (!options) throw new Error("no 3D stage was made");
  options.onFigure?.(s);
}
/** The visitor's line: since spec 028 (T-A06; plan.md §R-B8) "Around the room"'s slot, no longer a stage note. */
const noteLine = (v: Visit): HTMLElement | null =>
  v.doc.querySelector<HTMLElement>('.room-around [data-line="visitor"]');
const aroundLines = (v: Visit): string[] => [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));
const DOG = { kind: "picture", figure: "visitor", shows: "avatar", why: null, line: LINE } as FigureSignal;

describe("the room's visitor line (FR-003, FR-007)", () => {
  it("shows after the twin's line in Around the room, and not on the stage, while the dog's model shows (spec 028)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    expect(noteLine(v)).toBeNull();
    expect(aroundLines(v)).not.toContain(LINE);
    const twinLine = aroundLines(v)[0];
    signal(v, DOG);
    await flush();
    expect(textOf(noteLine(v))).toBe(LINE);
    expect(noteLine(v)?.hidden).toBe(false);
    expect(noteLine(v)?.closest("[aria-hidden='true']")).toBeNull();
    expect(noteLine(v)?.closest(".room-around")).not.toBeNull();
    expect(v.doc.querySelector(".room-stage")?.textContent ?? "").not.toContain(LINE);
    expect(aroundLines(v).slice(0, 2)).toEqual([twinLine, LINE]);
  });

  it("goes when the cut-out shows, once the avatar failed, and for an avatar with no line", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const gone = (): void => {
      expect(noteLine(v)).toBeNull();
      expect(aroundLines(v)).not.toContain(LINE);
    };
    signal(v, DOG);
    signal(v, { kind: "picture", figure: "visitor", shows: "fallback", why: "failed" });
    await flush();
    gone();
    signal(v, DOG);
    signal(v, { kind: "failed" });
    signal(v, { kind: "picture", figure: "visitor", shows: "fallback", why: "failed" });
    await flush();
    gone();
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null });
    await flush();
    gone();
    // The twin's figure's picture never fills the visitor's slot.
    signal(v, { ...DOG, figure: "twin" } as FigureSignal);
    await flush();
    gone();
  });

  it("adds no line to the 320 × 568 layout while the cut-out shows; the stage holds no note (spec 028)", async () => {
    const view = stubViewport({ w: 320, h: 568 });
    const v = start({ webgl: true, viewport: view.factory });
    await intoRoom(v);
    signal(v, { kind: "picture", figure: "visitor", shows: "fallback", why: "no-file" });
    await flush();
    expect(noteLine(v)).toBeNull();
    expect(v.doc.querySelectorAll(".room-notes > p")).toHaveLength(0);
  });
});
