// T-C02 (spec 029; FR-015 to FR-018, FR-021, FR-023a; plan.md §R-C1, §R-C2, §R-C5, §R-C6): the words on the pieces,
// as the room's data holds them.
// - The two signs' outlines are the converter's setting of their committed sources in the vendored IBM Plex Sans Bold,
//   byte for byte: "I AM VERY BUSY" on two lines, and "My dog thinks I'm cool" on two with the paw print after the
//   second, the paw the HUD's own path (hud/icons.ts's EMBLEM_ICONS.paw), copied into the source as data and placed by
//   the converter with every command kept. Each outline's intent_ref is intent-029 and its source the next free design
//   ID (D-0004, D-0005; T-C01).
// - RT13, in strict mode, passes both outlines on the tree as it is: it checks only that the words stand between
//   quotation marks in an intent of that number (rt.ts), and intent-029 quotes both. The dog sign's hold is the
//   Author's approval: while main's content-approvals.json holds no entry for its outline, a release build publishes
//   none of its words, so the face stays plain, and a drafts build publishes it marked "Draft".
// - The monitor's block passes the room's checks in strict mode (RT3 to RT5 its claim, RT9 its quote) with its green
//   ink and its blinking cursor; its line, "Applied AI Engineer", is the corpus's own words.
// - The shirt's outline and the neon sign's scene entry are unchanged against f411d8e1, by their SHA-256s; the scan
//   finds no piece ID in the code.
// The faces' bindings in the scene wait for the Author's answer on RG7 (impl-c.md; the page's question): the composed
// room's faces and "Around the room" are asserted by the task that binds them.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { compose } from "../../build/room/compose";
import {
  convertLettering,
  formatOutline,
  LETTERING_DIR,
  outlinePath,
  placePath,
  readSetSource,
  setFromTree,
  setStems,
} from "../../build/room/lettering";
import { readRoomPolicy } from "../../build/room/policy";
import { scan } from "../../build/room/scan";
import { fileTree } from "../../build/room/source";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { drawnWords } from "../../src/room/faces/display-list";
import { faceList, roomTextOf } from "../../src/room/faces/words";
import { EMBLEM_ICONS } from "../../src/room/hud/icons";
import { REPO, repositoryBundle } from "../helpers/room";

const read = (path: string): string => readFileSync(join(REPO, path), "utf8");
const sha = (text: string | Uint8Array): string => createHash("sha256").update(text).digest("hex");

/** The two signs' stems (T-C01) and what each outline holds. */
const SIGNS = [
  { stem: "lettering-busy", words: "I AM VERY BUSY", lines: ["I AM", "VERY BUSY"], id: "D-0004", paths: 11 },
  {
    stem: "lettering-cool",
    words: "My dog thinks I'm cool",
    lines: ["My dog thinks", "I'm cool"],
    id: "D-0005",
    paths: 19,
  },
] as const;
const MONITOR = "apps/web/content/room/monitor-line.yaml";

/** f411d8e1's SHA-256s: the shirt's outline file, and the neon sign's scene entry as parsed and serialized. */
const SHIRT_AT_BASE = "961d566167bf452adf9e387bb3a2a3d5508063ee4e98bd1c1cce4badb391567d";
const NEON_AT_BASE = "cfd59e58e80050255fc2fe1cb10d9d4bcb8d3bebddfa9c5e4716536ce8a159b4";

const strict = (): ReturnType<typeof compose> =>
  compose(fileTree(REPO), readRoomPolicy({ env: {}, root: REPO }), { mode: "strict", drafts: true });
let strictResult: ReturnType<typeof compose> | undefined;
const strictCompose = (): ReturnType<typeof compose> => (strictResult ??= strict());

describe("the signs' outlines (FR-016 to FR-018, FR-021)", () => {
  it("are the two set sources, in the lettering folder, the shirt's left to its own converter", () => {
    expect(setStems(REPO)).toEqual(SIGNS.map((s) => s.stem));
  });

  it.each(SIGNS)("$stem is the converter's setting of its source, field for field and byte for byte", (sign) => {
    const outline = setFromTree(REPO, sign.stem);
    expect(JSON.parse(read(outlinePath(sign.stem)))).toEqual(outline);
    expect(read(outlinePath(sign.stem))).toBe(formatOutline(outline));
  });

  it.each(SIGNS)("$stem holds its words, intent-029, its design ID, and the converter as its tool", (sign) => {
    const outline = JSON.parse(read(outlinePath(sign.stem))) as ReturnType<typeof setFromTree>;
    const source = readSetSource(read(`${LETTERING_DIR}/${sign.stem}.json`));
    expect(source.set_as).toEqual(sign.lines);
    expect(outline).toMatchObject({
      schema: 1,
      sign: sign.stem,
      words: sign.words,
      intent_ref: "intent-029",
      source: { type: "design", id: sign.id },
      tool: { name: "the room's outline converter", version: "spec-029.1", license: "mit" },
    });
    expect(outline.paths).toHaveLength(sign.paths);
    expect(outline.view_box.slice(0, 2)).toEqual([0, 0]);
    expect(outline.advance).toBe(outline.view_box[2]);
    expect(outline.cap_height).toBeGreaterThan(0);
    expect(outline.cap_height).toBeLessThanOrEqual(outline.view_box[3]);
  });

  it("sets the paw print, the HUD's own path, after the dog sign's second line, in the words' ink", () => {
    const source = readSetSource(read(`${LETTERING_DIR}/lettering-cool.json`));
    expect(source.mark?.path).toBe(EMBLEM_ICONS.paw);
    expect(source.mark?.line).toBe(1);
    const outline = setFromTree(REPO, "lettering-cool");
    const paw = outline.paths.at(-1) ?? "";
    // Its commands are the paw's own, in order: a pad and four toes, each closed.
    const letters = (d: string): string => d.replace(/[^A-Za-z]/g, "");
    expect(letters(paw)).toBe(letters(EMBLEM_ICONS.paw ?? ""));
    expect(paw.match(/z/gi)).toHaveLength(5);
    // It starts inside the view box.
    const xs = (d: string): number[] => [...d.matchAll(/^M ([-\d.]+)|M([-\d.]+)/g)].map((m) => Number(m[1] ?? m[2]));
    const [pawX] = xs(paw);
    expect(pawX).toBeGreaterThan(0);
    expect(pawX).toBeLessThan(outline.view_box[2]);
  });

  it("places a path with every command kept: absolute points scaled and moved, relative ones and arcs' radii scaled", () => {
    expect(placePath("M1 2L3 4h5v6z", 2, 10, 20)).toBe("M 12 24 L 16 28 h 10 v 12 z");
    expect(placePath("M0 0a1.5 2 0 1 0 3 0", 2, 1, 1)).toBe("M 1 1 a 3 4 0 1 0 6 0");
    expect(placePath("M1 1c-3 0-5.5 3.5-5.5 5.5s2 2.5 5.5 2.5", 1, 0, 0)).toBe(
      "M 1 1 c -3 0 -5.5 3.5 -5.5 5.5 s 2 2.5 5.5 2.5",
    );
    expect(placePath("M1 1a1 1 0 1 0 2 0a1 1 0 1 0-2 0", 1, 0, 0)).toBe("M 1 1 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0");
    expect(() => placePath("1 1", 1, 0, 0)).toThrow(/command/);
  });

  it("refuses a set source by the key that's wrong, never its value", () => {
    const good = JSON.parse(read(`${LETTERING_DIR}/lettering-busy.json`)) as Record<string, unknown>;
    const bad = (change: Record<string, unknown>): string => JSON.stringify({ ...good, ...change });
    expect(() => readSetSource(bad({ converter: "trace" }))).toThrow(/converter/);
    expect(() => readSetSource(bad({ intent_ref: "intent/029-room-polish.md" }))).toThrow(/intent_ref/);
    expect(() => readSetSource(bad({ set_as: ["I AM", "VERY"] }))).toThrow(/set_as/);
    try {
      readSetSource(bad({ set_as: ["I AM", "VERY"] }));
    } catch (e) {
      expect(String(e)).not.toMatch(/VERY/);
    }
  });

  it("passes RT13 in a strict build: both outlines' words stand quoted in intent-029", () => {
    const files = SIGNS.map((s) => outlinePath(s.stem));
    expect(strictCompose().findings.filter((f) => files.includes(f.file))).toEqual([]);
    const intent = read("intent/029-room-polish.md");
    for (const s of SIGNS) expect(intent).toContain(`"${s.words}"`);
  });
});

describe("the dog sign's hold, the Author's approval (spec Q6; FR-021)", () => {
  const file = outlinePath("lettering-cool");

  it("main's approvals hold no entry for the dog sign's outline", () => {
    const approvals = readRoomPolicy({ env: {}, root: REPO }).approvals.map((a) => a.sha256);
    expect(approvals).not.toContain(sha(readFileSync(join(REPO, file))));
  });

  /** A face of the sign renderer bound to the dog sign's outline, as the scene would bind it. */
  const signFace = (): RoomIndex["faces"][number] => ({
    id: "fx-sign.lettering",
    placement: "fx-sign",
    role: "lettering",
    readable: true,
    label: "label.fx-sign",
    atmosphere: false,
    max_chars: null,
    px: [1024, 700],
    screen_css: [100, 70],
    regions: [{ rect: [0, 0, 1, 1], renderer: "sign", grid: null, source: { room_text: "lettering-cool" } }],
  });

  it("a release build publishes none of its words, so its face stays plain", () => {
    const release = repositoryBundle({ drafts: false, policy: "empty" });
    expect(release.roomText.blocks.map((b) => b.id)).not.toContain("lettering-cool");
    const text = roomTextOf({ room_text: release.roomText });
    expect(faceList(signFace(), { index: release.index, text })).toBeNull();
  });

  it('a drafts build publishes it, marked "Draft"', () => {
    const drafts = repositoryBundle({ drafts: true, policy: "empty" });
    const block = drafts.roomText.blocks.find((b) => b.id === "lettering-cool");
    expect(block?.state).toBe("draft");
    const text = roomTextOf({ room_text: drafts.roomText });
    const list = faceList(signFace(), { index: drafts.index, text });
    expect(drawnWords(list?.ops ?? [])).toEqual(["My dog thinks I'm cool", "[Draft]"]);
  });
});

describe("the monitor's line (FR-019, FR-021)", () => {
  it("is a terminal block of one line, green, with a blinking cursor, its words from intent-029 and its claim the corpus's", () => {
    const block = parse(read(MONITOR)) as Record<string, unknown>;
    expect(block).toMatchObject({
      block: "monitor-line",
      renderer: "terminal",
      ink: "green",
      cursor: "blink",
      words_from: [{ file: "intent/029-room-polish.md" }],
      lines: [{ text: "Applied AI Engineer", about_author: true, claims: [{ file: "corpus/07-denver-local-ai.md" }] }],
    });
    const quote = (block.lines as { claims: { quote: string }[] }[])[0]?.claims[0]?.quote ?? "";
    expect(quote).toContain("Applied AI Engineer");
    expect(read("corpus/07-denver-local-ai.md")).toContain(quote);
  });

  it("passes the room's checks in strict mode: RT3 to RT5, RT9, and the schema's two new keys", () => {
    expect(strictCompose().findings.filter((f) => f.file === MONITOR)).toEqual([]);
  });

  it("is published in a drafts build with its ink and its cursor, and in a release build only once approved", () => {
    const drafts = repositoryBundle({ drafts: true, policy: "empty" });
    expect(drafts.roomText.blocks.find((b) => b.id === "monitor-line")).toMatchObject({
      state: "draft",
      lines: [{ text: "Applied AI Engineer" }],
      ink: "green",
      cursor: "blink",
    });
    const release = repositoryBundle({ drafts: false, policy: "empty" });
    expect(release.roomText.blocks.map((b) => b.id)).not.toContain("monitor-line");
  });
});

describe("what stays as it was (FR-019, FR-021; SC-004)", () => {
  it("the shirt's outline is unchanged byte for byte, and still its own converter's", () => {
    const shirt = "apps/web/content/room/outlines/twin-shirt-lettering.outline.json";
    expect(sha(readFileSync(join(REPO, shirt)))).toBe(SHIRT_AT_BASE);
    const converted = convertLettering(
      read(`${LETTERING_DIR}/twin-shirt-lettering.svg`),
      read(`${LETTERING_DIR}/twin-shirt-lettering.json`),
    );
    expect(read(shirt)).toBe(formatOutline(converted));
  });

  it("the neon sign's scene entry is unchanged", () => {
    const scene = parse(read("apps/web/room/scene.yaml")) as {
      placements: { faces?: Record<string, { regions: { renderer: string }[] }> }[];
    };
    const neon = scene.placements.filter((p) =>
      Object.values(p.faces ?? {}).some((f) => f.regions.some((r) => r.renderer === "neon")),
    );
    expect(neon).toHaveLength(1);
    expect(sha(JSON.stringify(neon[0]))).toBe(NEON_AT_BASE);
  });

  it("the code holds no piece, placement, selectable, or topic ID (the scan)", () => {
    const tree = fileTree(REPO);
    expect(scan(tree, tree, readRoomPolicy({ env: {}, root: REPO }))).toEqual({ lines: [], code: 0 });
  });
});
