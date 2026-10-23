// T079 (spec 004; FR-052; RT10; R-21, R-38; data-model.md §7.2, §10.1; contracts/room-data-files.md §10, RT10, RG7;
// contracts/room-bundle.md §3.1): `build/room/typefaces.ts` reads each look's families from apps/web/fonts/ through the
// compositor's tree, each file only after its SHA-256 matched fonts.lock (schema 2), and gives the index's typefaces[]:
// each use's family and weight, the cap ratio of its file at that weight (the smallest top of A to Z and 0 to 9 over
// the em), and the generic family drawn while it's late. The vendored families' figures are pinned, as fontkit read
// them once. A tampered copy in a temporary folder, and a family fonts.lock doesn't vendor for the room, are RT10.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { FontFamily, FontsLock } from "../../build/pdf";
import { readTypefaces } from "../../build/room/typefaces";
import type { LookFonts } from "../../build/room/typefaces";
import { TYPEFACE_USES } from "../../src/room/compose/vocabulary";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const FONTS = "apps/web/fonts";
const LOCK = `${FONTS}/fonts.lock`;
const LOOK = "apps/web/room/looks/fx-look.yaml";
const OTHER_LOOK = "apps/web/room/looks/fx-other.yaml";

/** The default look's typefaces (contracts/room-data-files.md §10; Confirmation 7). */
const DEFAULT: LookFonts["typefaces"] = {
  terminal: { family: "IBM Plex Mono", weight: 400 },
  "desktop-session": { family: "IBM Plex Sans", weight: 400 },
  chalk: { family: "Patrick Hand", weight: 400 },
  neon: { family: "IBM Plex Sans", weight: 700 },
  counters: { family: "IBM Plex Mono", weight: 400 },
};

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** A tree over a folder laid out as the repository is, logging every path read (contracts/room-bundle.md §1). */
function folderTree(root: string) {
  const log: string[] = [];
  return {
    log,
    read(path: string): Uint8Array | null {
      log.push(path);
      const full = join(root, path);
      return existsSync(full) && statSync(full).isFile() ? new Uint8Array(readFileSync(full)) : null;
    },
  };
}

/** A temporary folder holding a copy of apps/web/fonts/ at its repository path. */
function fontsCopy(): string {
  const root = mkdtempSync(join(tmpdir(), "h4-typefaces-"));
  made.push(root);
  cpSync(join(REPO, FONTS), join(root, FONTS), { recursive: true });
  return root;
}

/** The copy's fonts.lock, rewritten after `edit`. */
function editLock(root: string, edit: (lock: FontsLock) => void): void {
  const path = join(root, LOCK);
  const lock = JSON.parse(readFileSync(path, "utf8")) as FontsLock;
  edit(lock);
  writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
}

function familyOf(lock: FontsLock, family: string): FontFamily {
  const found = lock.families.find((f) => f.family === family);
  if (!found) throw new Error(`no ${family} in fonts.lock`);
  return found;
}

/** The copy's file with its last byte flipped. */
function tamper(root: string, name: string): void {
  const path = join(root, FONTS, name);
  const bytes = readFileSync(path);
  bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0xff, bytes.length - 1);
  writeFileSync(path, bytes);
}

const look = (typefaces: Partial<LookFonts["typefaces"]> = {}, file = LOOK): LookFonts => ({
  file,
  typefaces: { ...DEFAULT, ...typefaces },
});

describe("the vendored typefaces", () => {
  it("give the default look's typefaces[], one per use in the vocabulary's order, with their cap ratios pinned", () => {
    const { looks, findings } = readTypefaces(folderTree(REPO), [look()]);
    expect(findings).toEqual([]);
    // As fontkit 2.0.4 read them once: Plex's flat capitals and its 1, 4, 5, 6, and 7 stand 698 units of its
    // 1000-unit em, in both weights and in Mono (its round letters and other digits overshoot to 710); Patrick Hand's
    // shortest is its I, at 646. Only Plex Mono's post table marks it fixed-pitch.
    expect(looks).toEqual([
      {
        file: LOOK,
        typefaces: [
          { use: "terminal", family: "IBM Plex Mono", weight: 400, cap_ratio: 0.698, fallback: "monospace" },
          { use: "desktop-session", family: "IBM Plex Sans", weight: 400, cap_ratio: 0.698, fallback: "sans-serif" },
          { use: "chalk", family: "Patrick Hand", weight: 400, cap_ratio: 0.646, fallback: "sans-serif" },
          { use: "neon", family: "IBM Plex Sans", weight: 700, cap_ratio: 0.698, fallback: "sans-serif" },
          { use: "counters", family: "IBM Plex Mono", weight: 400, cap_ratio: 0.698, fallback: "monospace" },
        ],
      },
    ]);
    expect(looks[0]?.typefaces?.map((t) => t.use)).toEqual([...TYPEFACE_USES]);
  });

  it("keep the vocabulary's order whatever order the look's file gives its uses", () => {
    const reversed = Object.fromEntries(Object.entries(DEFAULT).reverse()) as LookFonts["typefaces"];
    const tree = folderTree(REPO);
    expect(readTypefaces(tree, [{ file: LOOK, typefaces: reversed }])).toEqual(readTypefaces(tree, [look()]));
  });

  it("are read through the tree, fonts.lock first, then each file of each family a look names, once", () => {
    const mono = { family: "IBM Plex Mono", weight: 400 };
    const tree = folderTree(REPO);
    readTypefaces(tree, [look({ "desktop-session": mono, neon: mono })]);
    expect(tree.log[0]).toBe(LOCK);
    // No look names IBM Plex Sans, so its fonts aren't read; the license it shares with Plex Mono is.
    expect([...tree.log].sort()).toEqual(
      [
        LOCK,
        `${FONTS}/IBMPlexMono-Regular.woff`,
        `${FONTS}/LICENSE.txt`,
        `${FONTS}/LICENSE-PatrickHand.txt`,
        `${FONTS}/patrick-hand-latin-400-normal.woff`,
      ].sort(),
    );
    const both = folderTree(REPO);
    const result = readTypefaces(both, [look({ "desktop-session": mono, neon: mono }), look({}, OTHER_LOOK)]);
    expect(result.findings).toEqual([]);
    expect(new Set(both.log).size).toBe(both.log.length);
    expect(both.log.every((path) => path.startsWith(`${FONTS}/`))).toBe(true);
    expect(result.looks.map((l) => l.typefaces?.find((t) => t.use === "neon")?.family)).toEqual([
      "IBM Plex Mono",
      "IBM Plex Sans",
    ]);
  });
});

describe("RT10", () => {
  it("refuses a tampered copy's file, which is never read as a font, and the looks that name its family", () => {
    const root = fontsCopy();
    tamper(root, "IBMPlexMono-Regular.woff");
    const { looks, findings } = readTypefaces(folderTree(root), [look(), look({}, OTHER_LOOK)]);
    expect(findings).toEqual([
      {
        rule: "RT10",
        file: `${FONTS}/IBMPlexMono-Regular.woff`,
        path: "-",
        reason: "its SHA-256 differs from fonts.lock's",
      },
    ]);
    expect(looks).toEqual([
      { file: LOOK, typefaces: null },
      { file: OTHER_LOOK, typefaces: null },
    ]);
  });

  it("refuses a tampered license, a vendored file like the fonts", () => {
    const root = fontsCopy();
    tamper(root, "LICENSE-PatrickHand.txt");
    const sans = { family: "IBM Plex Sans", weight: 400 };
    const { looks, findings } = readTypefaces(folderTree(root), [look(), look({ chalk: sans }, OTHER_LOOK)]);
    expect(findings).toEqual([
      {
        rule: "RT10",
        file: `${FONTS}/LICENSE-PatrickHand.txt`,
        path: "-",
        reason: "its SHA-256 differs from fonts.lock's",
      },
    ]);
    // A look that names no family the file belongs to keeps its typefaces.
    expect(looks.map((l) => l.typefaces === null)).toEqual([true, false]);
  });

  it("refuses a family fonts.lock doesn't vendor, on the look's path, never naming the family", () => {
    const { looks, findings } = readTypefaces(folderTree(REPO), [look({ chalk: { family: "Kalam", weight: 400 } })]);
    expect(findings).toEqual([
      { rule: "RT10", file: LOOK, path: "typefaces.chalk.family", reason: "no family of that name in fonts.lock" },
    ]);
    expect(JSON.stringify(findings)).not.toContain("Kalam");
    expect(looks).toEqual([{ file: LOOK, typefaces: null }]);
  });

  it("refuses a family fonts.lock vendors without the room's use", () => {
    const root = fontsCopy();
    editLock(root, (lock) => {
      familyOf(lock, "Patrick Hand").uses = ["site"];
    });
    const { looks, findings } = readTypefaces(folderTree(root), [look()]);
    expect(findings).toEqual([
      {
        rule: "RT10",
        file: LOOK,
        path: "typefaces.chalk.family",
        reason: "fonts.lock doesn't vendor that family for the room",
      },
    ]);
    expect(looks).toEqual([{ file: LOOK, typefaces: null }]);
  });

  it("refuses a weight the family has no vendored file at, naming the weights it has", () => {
    const { looks, findings } = readTypefaces(folderTree(REPO), [
      look({
        neon: { family: "IBM Plex Mono", weight: 700 },
        "desktop-session": { family: "IBM Plex Sans", weight: 500 },
      }),
    ]);
    expect(findings).toEqual([
      {
        rule: "RT10",
        file: LOOK,
        path: "typefaces.desktop-session.weight",
        reason: "no vendored file of that family at that weight (fonts.lock vendors it at 400 and 700)",
      },
      {
        rule: "RT10",
        file: LOOK,
        path: "typefaces.neon.weight",
        reason: "no vendored file of that family at that weight (fonts.lock vendors it at 400)",
      },
    ]);
    expect(looks).toEqual([{ file: LOOK, typefaces: null }]);
  });

  it("refuses two vendored files of a family at one weight, which a look can't choose between", () => {
    const root = fontsCopy();
    cpSync(join(root, FONTS, "IBMPlexMono-Regular.woff"), join(root, FONTS, "IBMPlexMono-Text.woff"));
    editLock(root, (lock) => {
      const mono = familyOf(lock, "IBM Plex Mono");
      const regular = mono.files["IBMPlexMono-Regular.woff"];
      if (!regular) throw new Error("no IBMPlexMono-Regular.woff in fonts.lock");
      mono.files["IBMPlexMono-Text.woff"] = { sha256: regular.sha256, from: "package/fonts/IBMPlexMono-Text.woff" };
    });
    const { looks, findings } = readTypefaces(folderTree(root), [look()]);
    const twice = "two vendored files of that family at that weight";
    expect(findings).toEqual([
      { rule: "RT10", file: LOOK, path: "typefaces.terminal.weight", reason: twice },
      { rule: "RT10", file: LOOK, path: "typefaces.counters.weight", reason: twice },
    ]);
    expect(looks).toEqual([{ file: LOOK, typefaces: null }]);
  });

  it("refuses a file fonts.lock vendors that isn't there", () => {
    const root = fontsCopy();
    rmSync(join(root, FONTS, "patrick-hand-latin-400-normal.woff"));
    const { looks, findings } = readTypefaces(folderTree(root), [look()]);
    expect(findings).toEqual([
      {
        rule: "RT10",
        file: `${FONTS}/patrick-hand-latin-400-normal.woff`,
        path: "-",
        reason: "absent, though fonts.lock vendors it",
      },
    ]);
    expect(looks).toEqual([{ file: LOOK, typefaces: null }]);
  });

  it("refuses a vendored file fontkit can't measure, though its SHA-256 matches the lock", () => {
    const root = fontsCopy();
    const broken = new TextEncoder().encode("not a font\n");
    writeFileSync(join(root, FONTS, "Broken.woff"), broken);
    editLock(root, (lock) => {
      familyOf(lock, "Patrick Hand").files["Broken.woff"] = {
        sha256: sha256(broken),
        from: "package/files/broken.woff",
      };
    });
    const { looks, findings } = readTypefaces(folderTree(root), [look()]);
    expect(findings).toEqual([
      {
        rule: "RT10",
        file: `${FONTS}/Broken.woff`,
        path: "-",
        reason: "not one font with a weight and a glyph for each of A to Z and 0 to 9, as fontkit reads it",
      },
    ]);
    expect(looks).toEqual([{ file: LOOK, typefaces: null }]);
  });

  it("refuses an absent fonts.lock, or one that isn't schema 2, once, at the lock", () => {
    const absent = fontsCopy();
    rmSync(join(absent, LOCK));
    const first = folderTree(absent);
    expect(readTypefaces(first, [look(), look({}, OTHER_LOOK)])).toEqual({
      looks: [
        { file: LOOK, typefaces: null },
        { file: OTHER_LOOK, typefaces: null },
      ],
      findings: [{ rule: "RT10", file: LOCK, path: "-", reason: "absent, so no typeface is vendored" }],
    });
    expect(first.log).toEqual([LOCK]);

    const old = fontsCopy();
    editLock(old, (lock) => {
      (lock as unknown as { schema: number }).schema = 1;
    });
    const second = folderTree(old);
    expect(readTypefaces(second, [look()])).toEqual({
      looks: [{ file: LOOK, typefaces: null }],
      findings: [
        {
          rule: "RT10",
          file: LOCK,
          path: "-",
          reason: "not fonts.lock's schema 2 (data-model.md §7.2), so no typeface is vendored",
        },
      ],
    });
    expect(second.log).toEqual([LOCK]);
  });
});
