// T179 (spec 004; FR-029, FR-030, FR-033, FR-061, User Story 5 scenarios 2 and 3; Amendment B9; R-11, R-57;
// contracts/room-bundle.md §5): room text, from its files to the page.
// - build/room/text.ts's roomTextPart writes room-data.json's room_text: its blocks sorted by ID; a release build
//   publishing only the files main approves (`state: "approved"`), and a drafts build adding the drafts
//   (`state: "draft"`); a block's lines its non-pending lines' text, unchanged; an outline's one line its words, with
//   view_box, cap_height, advance (the view box's width when absent), and paths, never intent_ref, source, or tool; no
//   † field and no pending line.
// - build/approvals.ts's contentFiles lists the room-text files after spec 002's, the blocks then the outlines, each in
//   name order and refused unless a regular file, so room-data.json's published and drafts list each; and a room-text
//   file is approved only by an entry of kind room-text, so one main approves under another kind stays a draft that no
//   release build publishes, as evals/test_room_order.py's case 2 counts only room-text approvals (FR-077; the review
//   of feat/004-setup, N1).
// - The site's release build leaves every committed draft's face plain and its words nowhere in dist/; its drafts
//   build publishes them as drafts.
// - The page fetches room-data.json once at Enter, through the loader the resume and narration share, and retries once
//   after 10 seconds; on failure the faces stay plain and their text-copy entries are left out (FR-061).
// The fixture set's IDs are synthetic fx- ones; the policy directories and trees are made in temporary folders.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, inject, it } from "vitest";

import { contentFiles, readPolicy, roomData } from "../../build/approvals";
import type { Policy, RoomData, RoomDataContext } from "../../build/approvals";
import { loadRoom } from "../../build/room/load";
import { fileTree } from "../../build/room/source";
import { roomTextPart } from "../../build/room/text";
import { ROOM_TEXT_RETRY_MS, roomTextOf } from "../../src/room/faces/words";
import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { SceneModule } from "../../src/room/stage";
import { REPO, fakeScene, flush, intoRoom, start, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { GOOD_DIR, goodTree } from "../helpers/room-fixtures";

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

const NOTES = "apps/web/content/room/fx-notes.yaml";
const SCRIPT = "apps/web/content/room/fx-script.yaml";
const OUTLINE = "apps/web/content/room/outlines/fx-sign-words.outline.json";
const bytesOf = (path: string): Buffer => readFileSync(join(GOOD_DIR, path));

const made: string[] = [];
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

/** A policy directory whose content-approvals.json approves each path's digest under the kind given. */
function policy(...entries: { path: string; kind: string }[]): Policy {
  const dir = temp("h4-policy-");
  const approvals = entries.map(({ path, kind }, i) => ({
    id: `C-${String(i + 1).padStart(4, "0")}`,
    path_when_approved: path,
    kind,
    sha256: sha256(bytesOf(path)),
    date: "2026-10-27",
    reason: "a stand-in approval, made by the test",
  }));
  writeFileSync(join(dir, "content-approvals.json"), JSON.stringify({ schema: 1, approvals }));
  return readPolicy(dir);
}

/** room-data.json as the build writes it for the fixture tree: its own fields, then roomTextPart's. */
async function built(p: Policy, drafts: boolean, root = GOOD_DIR): Promise<RoomData> {
  const files = contentFiles(root, p);
  const context: RoomDataContext = { root, files, policy: p, drafts, emit: () => undefined, warn: () => undefined };
  return roomTextPart(roomData(files, p, drafts), context);
}

type Block = { id: string; state: string; lines: { text: string }[]; [key: string]: unknown };
const blocksOf = (data: RoomData): Block[] => (data.room_text as { blocks: Block[] }).blocks;

describe("roomTextPart (contracts/room-bundle.md §5)", () => {
  it("publishes only what main approves as room text in a release build, and adds the drafts in a drafts build", async () => {
    const p = policy({ path: NOTES, kind: "room-text" });
    expect(blocksOf(await built(p, false)).map((b) => [b.id, b.state])).toEqual([["fx-notes", "approved"]]);
    expect(blocksOf(await built(p, true)).map((b) => [b.id, b.state])).toEqual([
      ["fx-notes", "approved"],
      ["fx-script", "draft"],
      ["fx-sign-words", "draft"],
    ]);
    expect(blocksOf(await built(policy(), false))).toEqual([]);
  });

  it("writes a block's non-pending lines unchanged, and an outline's words and drawing, with no † field", async () => {
    const p = policy(
      { path: NOTES, kind: "room-text" },
      { path: SCRIPT, kind: "room-text" },
      { path: OUTLINE, kind: "room-text" },
    );
    const blocks = blocksOf(await built(p, false));
    expect(blocks.map((b) => b.lines.map((l) => l.text))).toEqual([
      ["Plan small", "Ship often"],
      ["fx run", "fx ok"],
      ["fixture sign words"],
    ]);
    const outline = blocks[2];
    expect(Object.keys(outline ?? {})).toEqual(["id", "source", "sha256", "state", "lines", "outline"]);
    expect(Object.keys((outline?.outline as object) ?? {})).toEqual(["view_box", "cap_height", "advance", "paths"]);
    const text = JSON.stringify(blocks);
    // The pending line, and every † value of the fixture's files: words_from, exclude, claims, intent_ref, source, tool.
    for (const value of ["Later idea", "words_from", "exclude", "claims", "intent_ref", "fx-tracer", "fx-design-01"])
      expect(text, value).not.toContain(value);
    for (const b of blocks) expect(b.sha256).toBe(sha256(bytesOf(String(b.source))));
  });

  it("takes an outline's advance as its view box's width when it gives none", async () => {
    const root = temp("h4-tree-");
    cpSync(GOOD_DIR, root, { recursive: true });
    const doc = JSON.parse(readFileSync(join(root, OUTLINE), "utf8")) as Record<string, unknown>;
    delete doc.advance;
    writeFileSync(join(root, OUTLINE), `${JSON.stringify(doc, null, 2)}\n`);
    const blocks = blocksOf(await built(policy(), true, root));
    const sign = blocks.find((b) => b.id === "fx-sign-words");
    expect((sign?.outline as { advance: number; view_box: number[] }).advance).toBe(
      (doc.view_box as number[])[2] ?? -1,
    );
  });

  it("lists each room-text file in published and drafts, the blocks then the outlines, after spec 002's files", async () => {
    const p = policy({ path: NOTES, kind: "room-text" });
    const release = await built(p, false);
    expect(release.published.map((f) => f.path)).toEqual([NOTES]);
    expect(release.drafts).toEqual([SCRIPT, OUTLINE]);
    const drafts = await built(p, true);
    expect(drafts.published).toEqual([
      { path: NOTES, sha256: sha256(bytesOf(NOTES)) },
      { path: SCRIPT, sha256: sha256(bytesOf(SCRIPT)), draft: true },
      { path: OUTLINE, sha256: sha256(bytesOf(OUTLINE)), draft: true },
    ]);
  });

  it("keeps a room-text file main approves only under another kind a draft, which no release build publishes", async () => {
    for (const kind of ["resume", "narration"]) {
      const p = policy({ path: NOTES, kind });
      expect(contentFiles(GOOD_DIR, p).find((f) => f.path === NOTES)?.state, kind).toBe("draft");
      const data = await built(p, false);
      expect(blocksOf(data), kind).toEqual([]);
      expect(data.published, kind).toEqual([]);
    }
  });

  it("refuses a room-text file or an outline that isn't a regular file", () => {
    for (const path of [NOTES, OUTLINE]) {
      const root = temp("h4-tree-");
      cpSync(GOOD_DIR, root, { recursive: true });
      rmSync(join(root, path));
      symlinkSync(join(GOOD_DIR, path), join(root, path));
      expect(() => contentFiles(root, policy()), path).toThrow(/regular file/);
    }
  });

  it("leaves a file that isn't a block or an outline out of the content", () => {
    const root = temp("h4-tree-");
    cpSync(GOOD_DIR, root, { recursive: true });
    mkdirSync(join(root, "apps/web/content/room/outlines"), { recursive: true });
    writeFileSync(join(root, "apps/web/content/room/notes.txt"), "not room text\n");
    writeFileSync(join(root, "apps/web/content/room/outlines/x.json"), "{}\n");
    expect(contentFiles(root, policy()).map((f) => f.path)).toEqual([NOTES, SCRIPT, OUTLINE]);
  });
});

// ---- The site's own builds ----

const builds = inject("siteBuilds");

/** Every file under a build, by its path from the build's folder. */
function builtFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(root, path).split("\\").join("/"));
    }
  };
  walk(root);
  return found.sort();
}

describe("the site's builds of the committed room text (FR-029, FR-030; SC-008)", () => {
  const committed = loadRoom(fileTree(REPO));
  const lines = committed.blocks.flatMap((b) => b.value.lines.filter((l) => !l.pending).map((l) => l.text));

  it("has room text committed to build: the board's chalk drafts", () => {
    expect(committed.blocks.filter((b) => b.value.renderer === "chalk").length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("leaves a draft's face plain in the release build, its words nowhere in dist/", () => {
    const root = builds.release;
    const data = JSON.parse(readFileSync(join(root, "room-data.json"), "utf8")) as RoomData;
    expect(data.room_text).toEqual({ blocks: [] });
    const files = committed.blocks.map((b) => b.file);
    for (const file of files) expect(data.drafts).toContain(file);
    const found: string[] = [];
    for (const name of builtFiles(root)) {
      const body = readFileSync(join(root, name), "utf8");
      for (const line of lines) if (body.includes(line)) found.push(`${name} holds "${line}"`);
    }
    expect(found).toEqual([]);
  });

  it("publishes them as drafts in the drafts build, each pending line left out", () => {
    const data = JSON.parse(readFileSync(join(builds.drafts, "room-data.json"), "utf8")) as RoomData;
    const blocks = blocksOf(data);
    expect(blocks.map((b) => b.state)).toEqual(blocks.map(() => "draft"));
    // Spec 016's outline, the shirt's lettering, is room text too, published as a draft beside the blocks, its words
    // its one line (changed with T056, plan.md R-18).
    const outlines = committed.outlines.map((o) => ({ id: o.value.sign, lines: [o.value.words] }));
    const expected = [
      ...committed.blocks.map((b) => ({
        id: b.value.block,
        lines: b.value.lines.filter((l) => !l.pending).map((l) => l.text),
      })),
      ...outlines,
    ].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(blocks.map((b) => b.id)).toEqual(expected.map((e) => e.id));
    expect(blocks.flatMap((b) => b.lines.map((l) => l.text))).toEqual(expected.flatMap((e) => e.lines));
    const pending = committed.blocks.flatMap((b) => b.value.lines.filter((l) => l.pending).map((l) => l.text));
    for (const line of pending) expect(JSON.stringify(data), line).not.toContain(line);
  });
});

// ---- In the page (FR-061; R-11) ----

let index: RoomIndex | null = null;
/** The fixture set's index, as a drafts build composes it, and its room text as room-data.json carries it. */
const fixtureIndex = (): RoomIndex =>
  (index ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }).index);
const fixtureData = (): unknown => ({
  room_text: compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }).roomText,
});

/** "Around the room"'s entries for the faces bound to room text: those that start with such a face's label. */
function textEntries(v: Visit, room: RoomIndex): string[] {
  const labels = room.faces
    .filter((f) => f.regions.some((r) => "room_text" in r.source))
    .map((f) => room.ui[f.label] ?? "?");
  return [...v.doc.querySelectorAll(".room-around li")]
    .map((li) => textOf(li))
    .filter((line) => labels.some((label) => line.startsWith(`${label}:`)));
}

describe("room-data.json at Enter (FR-061; R-11)", () => {
  it(`is fetched once at Enter, and its room text drawn`, async () => {
    const v = start({ room: fixtureIndex(), roomData: [fixtureData()] });
    await intoRoom(v);
    expect(v.roomDataLoads()).toBe(1);
    expect(textEntries(v, fixtureIndex()).length).toBe(3);
    v.clock.advance(ROOM_TEXT_RETRY_MS * 3);
    expect(v.roomDataLoads()).toBe(1);
  });

  it(`is fetched again once ${ROOM_TEXT_RETRY_MS / 1000} s after a load that failed, and drawn then`, async () => {
    expect(ROOM_TEXT_RETRY_MS).toBe(10_000);
    const v = start({ room: fixtureIndex(), roomData: [null, fixtureData()] });
    // Enter's load fails at Enter's time; intoRoom then plays the hand-off on the clock.
    const entered = v.clock.now();
    await intoRoom(v);
    expect(v.roomDataLoads()).toBe(1);
    expect(textEntries(v, fixtureIndex())).toEqual([]);
    v.clock.advance(entered + ROOM_TEXT_RETRY_MS - 1 - v.clock.now());
    expect(v.roomDataLoads()).toBe(1);
    v.clock.advance(1);
    await flush();
    expect(v.roomDataLoads()).toBe(2);
    expect(textEntries(v, fixtureIndex()).length).toBe(3);
  });

  it("leaves the faces plain and their text-copy entries out when the retry fails too, and fetches no more", async () => {
    const v = start({ room: fixtureIndex(), roomData: [null] });
    await intoRoom(v);
    v.clock.advance(ROOM_TEXT_RETRY_MS);
    await flush();
    v.clock.advance(ROOM_TEXT_RETRY_MS * 6);
    expect(v.roomDataLoads()).toBe(2);
    expect(textEntries(v, fixtureIndex())).toEqual([]);
    const flat = v.doc.querySelector(".flat svg");
    if (flat) for (const word of ["fx run", "Plan small"]) expect(flat.textContent).not.toContain(word);
  });

  it("words the text copy even when the stage's setText throws (the review's nit 4)", async () => {
    const fake = fakeScene();
    const throwing: SceneModule = {
      createScene(options) {
        const stage = fake.module.createScene(options);
        return {
          ...stage,
          setText() {
            throw new Error("the stage refused the room text");
          },
        };
      },
    };
    // The load at Enter fails, so the retry's words reach a stage already made, through its setText.
    const v = start({
      webgl: true,
      room: fixtureIndex(),
      roomData: [null, fixtureData()],
      loadScene: async () => throwing,
    });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("3d");
    v.clock.advance(ROOM_TEXT_RETRY_MS);
    await flush();
    expect(v.roomDataLoads()).toBe(2);
    expect(textEntries(v, fixtureIndex()).length).toBe(3);
  });

  it("reads a room_text that isn't the build's shape as none: the faces plain", () => {
    for (const json of [null, {}, { room_text: 1 }, { room_text: { blocks: {} } }, { room_text: { blocks: [1] } }])
      expect(roomTextOf(json).blocks.size, JSON.stringify(json)).toBe(0);
    const text = roomTextOf(fixtureData());
    expect([...text.blocks.keys()]).toEqual(["fx-notes", "fx-script", "fx-sign-words"]);
    expect(text.blocks.get("fx-notes")?.lines).toEqual(["Plan small", "Ship often"]);
    expect(text.blocks.get("fx-notes")?.state).toBe("draft");
  });

  it("reads the resume's section titles from the same file, withheld whenever the resume is", () => {
    const sections = [{ id: "a", title: "Fixture section", items: [] }];
    expect(roomTextOf({ resume_state: "approved", header: { name: "x", lines: [] }, sections }).titles).toEqual({
      lines: ["Fixture section"],
      draft: false,
    });
    expect(roomTextOf({ resume_state: "draft", header: { name: "x", lines: [] }, sections }).titles).toEqual({
      lines: ["Fixture section"],
      draft: true,
    });
    for (const state of ["withheld", "absent"])
      expect(roomTextOf({ resume_state: state, header: null, sections: [] }).titles, state).toBeNull();
  });
});
