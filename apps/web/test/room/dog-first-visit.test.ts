// T012 (spec 025; FR-022; plan.md R-11): RK5's first visit with the room's dog. Where the scene has `figures.dog`, the
// room's dog's files (the dog's folder as bundled) count once, beside the room's, the twin's or the stand-in's, and the
// largest other visitor avatar's, which then leaves the dog's folder out as it leaves the stand-in's; without it, the
// visit is as before. RK5's message and the report's line name the room's dog's bytes.
// Spec 028 (T-B07; FR-029, SC-005; plan.md R-B8, R-B9, the named departure): the room's dog's files count only with the
// dinosaur's, as one visitor set ("the dinosaur's plus the room's dog's"), and only where the bundle carries the
// dinosaur's model; the first visit is the room's, the twin's or the stand-in's, and the largest of the woman's, the
// man's, the dog visitor's, and that set. Without the dinosaur's model, no room's dog share.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { avatarsOf, twinOf } from "../../build/room/avatars";
import { figuresVisit } from "../../build/room/checks/rk";
import { compose } from "../../build/room/compose";
import type { ComposeOptions, ComposeResult } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { gzipBytes } from "../../src/room/glb/gzip";
import { avatarGlb, clipGlb, IDLE_TRACKS } from "../helpers/glb";
import { overlay } from "../helpers/room-fixtures";
import { avatarFolder, sceneWith, SCENE } from "../helpers/room-avatars";
import type { RecordEntry } from "../helpers/room-avatars";
import { dinosaurFolder } from "../helpers/room-dinosaur";
import { twinPolicy } from "../helpers/room-twin";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

const dogBytes = avatarGlb({ height: 1.3, hands: false, legs: true }).bytes;
const dogClips = {
  idle: clipGlb("idle", { tracks: IDLE_TRACKS, duration: 3 }).bytes,
  walk: clipGlb("walk", { tracks: IDLE_TRACKS, duration: 1 }).bytes,
  run: clipGlb("run", { tracks: IDLE_TRACKS, duration: 0.5 }).bytes,
};
const records = (e: RecordEntry[]): void => {
  for (const x of e) {
    x.likeness = x.file === "dog.glb";
    x.source = x.file === "dog.glb" ? { type: "photo", id: "H-dog-1" } : { type: "asset", id: "AS-dog-model" };
  }
};

function files(block: boolean, dino = true): Record<string, Uint8Array | string> {
  return {
    // Spec 028 (FR-029): the dinosaur's folder, whose model the room's dog's share needs; `dino` false leaves it out.
    ...(dino ? dinosaurFolder() : {}),
    [SCENE]: sceneWith({
      twin_stand_in: "man",
      ...(block ? { dog: { home: { at: [0.3, 0.45], heading_deg: 180 }, footprint_m: 0.3 } } : {}),
    }),
    ...avatarFolder("man"),
    ...avatarFolder("woman"),
    ...avatarFolder("dog", {
      model: dogBytes,
      clips: { ...dogClips, "idle-holding": null, take: null },
      records,
    }),
  };
}
const policy = (phase3?: number): RoomPolicy =>
  twinPolicy({
    likeness: [{ id: "A-fx-dog", sha256: sha256(dogBytes), line: "A made-up line." }],
    ...(phase3 === undefined ? {} : { phase3 }),
  });

/** A folder's served GLBs, gzip-9, as RK5 counts them. */
function folderBytes(all: Record<string, Uint8Array | string>, id: string): number {
  return Object.entries(all)
    .filter(([path]) => path.startsWith(`assets/visitors/${id}/`) && path.endsWith(".glb"))
    .reduce((sum, [, data]) => sum + gzipBytes(data as Uint8Array), 0);
}

function visitOf(tree: Tree, p: RoomPolicy, roomDog: boolean): ReturnType<typeof figuresVisit> {
  const scene = loadRoom(tree).scene?.value ?? null;
  return figuresVisit(avatarsOf(tree, p, scene), twinOf(tree, p, scene), roomDog);
}
const rk5 = (result: ComposeResult): string[] => result.findings.filter((f) => f.rule === "RK5").map((f) => f.reason);

describe("RK5's first visit with the room's dog (FR-022)", () => {
  // Spec 028 (FR-029): was "counts the room's dog's files once, and the largest other avatar's leaves the dog's folder
  // out".
  it("counts the room's dog's files with the dinosaur's, as one visitor set, where it is the largest (spec 028, FR-029)", () => {
    const all = files(true);
    const visit = visitOf(overlay(all), policy(), true);
    const dino = folderBytes(all, "dinosaur");
    const dog = folderBytes(all, "dog");
    expect(dino + dog).toBeGreaterThan(Math.max(folderBytes(all, "woman"), dog));
    expect(visit.other_id).toBe("dinosaur");
    expect(visit.other).toBe(dino);
    expect(visit.dog).toBe(dog);
  });

  it("counts no room's dog share where the bundle lacks the dinosaur's model; the dog visitor's folder competes alone (spec 028, FR-029)", () => {
    const all = files(true, false);
    const visit = visitOf(overlay(all), policy(), true);
    expect(visit.dog).toBe(0);
    expect(visit.other).toBe(Math.max(folderBytes(all, "woman"), folderBytes(all, "dog")));
  });

  it("counts no dog share without figures.dog: the visit is as before", () => {
    const all = files(false);
    const visit = visitOf(overlay(all), policy(), false);
    expect(visit.dog).toBe(0);
    const largest = Math.max(folderBytes(all, "woman"), folderBytes(all, "dog"));
    expect(visit.other).toBe(largest);
  });

  // Spec 028 (FR-029): the case's subject kept; the room's dog's share now rides with the dinosaur's, the set the largest.
  it("counts the dog's files once where the scene names the dog the stand-in, which RA3 refuses (no hands)", () => {
    const all = {
      ...files(true),
      [SCENE]: sceneWith({ twin_stand_in: "dog", dog: { home: { at: [0.3, 0.45] }, footprint_m: 0.3 } }),
    };
    const visit = visitOf(overlay(all), policy(), true);
    expect(visit.stand_in).toBe(0);
    expect(visit.dog).toBe(folderBytes(all, "dog"));
    expect(visit.other_id).toBe("dinosaur");
  });

  it("refuses over phase 3 with the room's dog's bytes named, and passes at it", () => {
    const all = files(true);
    const visit = visitOf(overlay(all), policy(), true);
    const total = visit.twin + visit.stand_in + visit.other + visit.dog;
    expect(rk5(compose(overlay(all), policy(total), STRICT))).toEqual([]);
    const over = rk5(compose(overlay(all), policy(total - 1), STRICT));
    expect(over).toHaveLength(1);
    expect(over[0]).toContain(`${visit.dog.toLocaleString("en-US")} in the room's dog's files`);
  });

  // Spec 028 (FR-029): was "the report's first-visit line names the room's dog's bytes, and only with figures.dog".
  it("the report's first-visit line names the room's dog's bytes, only with figures.dog and the dinosaur's model (spec 028, FR-029)", () => {
    const withDog = compose(overlay(files(true)), policy(), STRICT).report.markdown;
    const visit = visitOf(overlay(files(true)), policy(), true);
    expect(withDog).toContain(`${visit.dog.toLocaleString("en-US")} of the room's dog's files`);
    const without = compose(overlay(files(false)), policy(), STRICT).report.markdown;
    expect(without).not.toContain("room's dog's files");
    const noDino = compose(overlay(files(true, false)), policy(), STRICT).report.markdown;
    expect(noDino).not.toContain("room's dog's files");
  });
});
