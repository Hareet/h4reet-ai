// T028 (spec 002; FR-019; research.md R-06): the vendored fonts, under the SIL Open Font License, each with its
// license beside it. fonts.lock pins each file by SHA-256 and records the upstream release it came from; the build
// refuses a font whose bytes differ. The site's CSS and the PDF use the same files.
//
// Spec 004's T006 (Amendment B10; FR-033, FR-061; research.md R-38; data-model.md §7.2): fonts.lock is schema 2, one
// entry per family with its uses (site, pdf, room). IBM Plex Sans keeps the site and the PDF and gains the room; IBM
// Plex Mono and Patrick Hand are the room's alone; the PDF embeds only the family whose uses hold pdf, Plex Sans. The
// lock is what `npm run fonts:lock` writes from its declaration, never typed.
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { FAMILIES } from "../build/fonts-lock";
import { FONT_FILES, FONT_USES, loadFonts, readFontsLock, type FontsLock } from "../build/pdf";

const FONTS = fileURLToPath(new URL("../fonts", import.meta.url));
const CSS = fileURLToPath(new URL("../src/fonts.css", import.meta.url));

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const keys = (o: object): string[] => Object.keys(o).sort();

/** The lock as JSON, unchecked, for the shape tests and for altered copies. */
const rawLock = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FONTS, "fonts.lock"), "utf8")) as Record<string, unknown>;

/** A copy of the fonts directory whose lock is the one given. */
function withLock(lock: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "h4-fonts-"));
  made.push(dir);
  cpSync(FONTS, dir, { recursive: true });
  writeFileSync(join(dir, "fonts.lock"), `${JSON.stringify(lock, null, 2)}\n`);
  return dir;
}

const byFamily = (lock: FontsLock, family: string) => {
  const found = lock.families.find((f) => f.family === family);
  if (!found) throw new Error(`no ${family} in fonts.lock`);
  return found;
};

describe("fonts.lock, schema 2 (spec 004, B10)", () => {
  it("is schema 2, with families, each with its family, license, reserved name, uses, source, and files", () => {
    const lock = rawLock();
    expect(keys(lock)).toEqual(["families", "schema"]);
    expect(lock.schema).toBe(2);
    const families = lock.families as Record<string, unknown>[];
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(keys(family), String(family.family)).toEqual(
        ["family", "files", "license", "reserved_font_name", "source", "uses"].sort(),
      );
      expect(typeof family.family).toBe("string");
      expect(family.license).toBe("OFL-1.1");
      expect(family.reserved_font_name === null || typeof family.reserved_font_name === "string").toBe(true);
      const uses = family.uses as string[];
      expect(uses.length).toBeGreaterThan(0);
      expect(new Set(uses).size).toBe(uses.length);
      for (const use of uses) expect(FONT_USES).toContain(use);
      expect(keys(family.source as object)).toEqual(["integrity", "package", "published", "sha256", "url", "version"]);
      const files = family.files as Record<string, Record<string, unknown>>;
      expect(Object.keys(files).length).toBeGreaterThan(0);
      for (const [name, entry] of Object.entries(files)) {
        expect(
          ["from", "sha256"].every((k) => k in entry),
          name,
        ).toBe(true);
        expect(
          keys(entry).every((k) => ["from", "note", "sha256"].includes(k)),
          name,
        ).toBe(true);
      }
    }
    // The build reads it with the same rules.
    expect(readFontsLock(FONTS).schema).toBe(2);
  });

  it("pins every file of every family by SHA-256", () => {
    const lock = readFontsLock(FONTS);
    let checked = 0;
    for (const family of lock.families) {
      for (const [name, entry] of Object.entries(family.files)) {
        expect(entry.sha256, `${family.family}: ${name}`).toMatch(/^[0-9a-f]{64}$/);
        expect(sha256(readFileSync(join(FONTS, name))), `${family.family}: ${name}`).toBe(entry.sha256);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it("records each family's upstream release: the package, its version, its tarball's URL and digests, and each file's path in it", () => {
    for (const family of readFontsLock(FONTS).families) {
      const { source } = family;
      const base = source.package.replace(/^@[^/]+\//, "");
      expect(source.url, family.family).toBe(
        `https://registry.npmjs.org/${source.package}/-/${base}-${source.version}.tgz`,
      );
      expect(source.version, family.family).toMatch(/^\d+\.\d+\.\d+$/);
      expect(source.sha256, family.family).toMatch(/^[0-9a-f]{64}$/);
      expect(source.integrity, family.family).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
      expect(source.published, family.family).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const entry of Object.values(family.files)) expect(entry.from).toMatch(/^package\//);
    }
  });

  it("gives Plex Sans the site, the PDF, and the room, and Plex Mono and Patrick Hand the room alone", () => {
    const lock = readFontsLock(FONTS);
    expect(lock.families.map((f) => [f.family, f.uses])).toEqual([
      ["IBM Plex Sans", ["site", "pdf", "room"]],
      ["IBM Plex Mono", ["room"]],
      ["Patrick Hand", ["room"]],
    ]);
    expect(byFamily(lock, "IBM Plex Sans").source.package).toBe("@ibm/plex-sans");
    expect(byFamily(lock, "IBM Plex Mono").source.package).toBe("@ibm/plex-mono");
    expect(byFamily(lock, "Patrick Hand").source.package).toBe("@fontsource/patrick-hand");
  });

  it("names Plex's reserved font name, and none for Patrick Hand", () => {
    const lock = readFontsLock(FONTS);
    expect(byFamily(lock, "IBM Plex Sans").reserved_font_name).toBe("Plex");
    expect(byFamily(lock, "IBM Plex Mono").reserved_font_name).toBe("Plex");
    expect(byFamily(lock, "Patrick Hand").reserved_font_name).toBeNull();
  });

  it("keeps Plex Sans's release and files as spec 002 vendored them", () => {
    const sans = byFamily(readFontsLock(FONTS), "IBM Plex Sans");
    expect(sans.source.version).toBe("1.1.0");
    expect(sans.source.published).toBe("2024-11-11");
    expect(Object.keys(sans.files).sort()).toEqual([...Object.values(FONT_FILES), "LICENSE.txt"].sort());
  });

  it("vendors weight 400 of the room's two new families, as WOFF", () => {
    const lock = readFontsLock(FONTS);
    for (const family of ["IBM Plex Mono", "Patrick Hand"]) {
      const fonts = Object.keys(byFamily(lock, family).files).filter((n) => !/license/i.test(n));
      expect(fonts.length, family).toBe(1);
      expect(fonts[0], family).toMatch(/(-Regular|-400-normal)\.woff$/);
    }
  });

  it("is all the directory holds, with the lock itself and its README", () => {
    const names = new Set(readFontsLock(FONTS).families.flatMap((f) => Object.keys(f.files)));
    expect(readdirSync(FONTS).sort()).toEqual([...names, "README.md", "fonts.lock"].sort());
  });

  it("holds each family's license as the OFL, with the Reserved Font Name only where the family reserves one", () => {
    for (const family of readFontsLock(FONTS).families) {
      const licenses = Object.keys(family.files).filter((n) => /license/i.test(n));
      expect(licenses.length, family.family).toBe(1);
      const text = readFileSync(join(FONTS, licenses[0] as string), "utf8");
      const body = text.indexOf("SIL OPEN FONT LICENSE Version 1.1");
      expect(body, family.family).toBeGreaterThan(0);
      // A family reserves a name in the copyright notice above the license; the license's own definitions name the
      // term whatever the family reserves.
      const notice = text.slice(0, body);
      if (family.reserved_font_name === null) {
        expect(notice, family.family).not.toMatch(/Reserved Font Name/i);
      } else {
        expect(notice, family.family).toContain(`Reserved Font Name "${family.reserved_font_name}"`);
      }
    }
  });

  it("is what `npm run fonts:lock` writes from its declaration: nothing in it was typed", () => {
    const lock = readFontsLock(FONTS);
    expect(lock.families.map((f) => f.family)).toEqual(FAMILIES.map((f) => f.family));
    for (const [i, declared] of FAMILIES.entries()) {
      const family = lock.families[i];
      if (!family) throw new Error(`no family ${i}`);
      expect(family.license).toBe(declared.license);
      expect(family.reserved_font_name).toBe(declared.reserved_font_name);
      expect(family.uses).toEqual(declared.uses);
      // The tarball's URL and SHA-256 are the script's to compute; the rest is declared.
      const { package: pkg, version, integrity, published } = family.source;
      expect({ package: pkg, version, integrity, published }).toEqual(declared.source);
      expect(Object.keys(family.files).sort()).toEqual(Object.keys(declared.files).sort());
      for (const [name, entry] of Object.entries(declared.files)) {
        expect(family.files[name]?.from, name).toBe(entry.from);
        expect(family.files[name]?.note, name).toBe(entry.note);
      }
    }
  });

  it("is refused by the build when it isn't schema 2's shape, naming the file", () => {
    const lock = rawLock();
    const families = lock.families as Record<string, unknown>[];
    const first = families[0] as Record<string, unknown>;
    const spec002 = {
      schema: 1,
      family: first.family,
      license: first.license,
      source: first.source,
      files: first.files,
    };
    for (const bad of [
      spec002,
      { ...lock, schema: 3 },
      { ...lock, families: [] },
      { ...lock, families: [{ ...first, uses: ["site", "print"] }] },
      { ...lock, families: [{ ...first, uses: ["site", "site"] }] },
      { ...lock, families: [{ ...first, uses: [] }] },
      { ...lock, families: [{ ...first, reserved_font_name: 1 }] },
      { ...lock, families: [{ ...first, files: {} }] },
      { ...lock, families: [{ ...first, extra: true }] },
    ]) {
      expect(() => readFontsLock(withLock(bad)), JSON.stringify(bad).slice(0, 80)).toThrow(/fonts\.lock/);
    }
  });
});

describe("loading the PDF's fonts", () => {
  it("returns the locked files' bytes", () => {
    const fonts = loadFonts(FONTS);
    const sans = byFamily(readFontsLock(FONTS), "IBM Plex Sans");
    expect(sha256(fonts.regular)).toBe(sans.files[FONT_FILES.regular]?.sha256);
    expect(sha256(fonts.bold)).toBe(sans.files[FONT_FILES.bold]?.sha256);
  });

  it("refuses a font whose bytes don't match the lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "h4-fonts-"));
    made.push(dir);
    cpSync(FONTS, dir, { recursive: true });
    const path = join(dir, FONT_FILES.regular);
    const bytes = readFileSync(path);
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0xff, bytes.length - 1);
    writeFileSync(path, bytes);
    expect(() => loadFonts(dir)).toThrow(/IBMPlexSans-Regular\.woff.*fonts\.lock/);
  });

  it("takes them only from the one family whose uses hold pdf (spec 004, B10)", () => {
    const lock = rawLock();
    const families = lock.families as Record<string, unknown>[];
    const usesOf = (family: string, uses: string[]) => ({
      ...lock,
      families: families.map((f) => (f.family === family ? { ...f, uses } : f)),
    });
    // No family for the PDF: nothing is embedded.
    expect(() => loadFonts(withLock(usesOf("IBM Plex Sans", ["site", "room"])))).toThrow(/fonts\.lock.*pdf/);
    // Two: the PDF stays one family.
    expect(() => loadFonts(withLock(usesOf("IBM Plex Mono", ["pdf", "room"])))).toThrow(/fonts\.lock.*pdf/);
    // The pdf use on a family without the PDF's files: refused, never a font from another family.
    const moved = {
      ...lock,
      families: families.map((f) =>
        f.family === "IBM Plex Sans"
          ? { ...f, uses: ["site", "room"] }
          : f.family === "IBM Plex Mono"
            ? { ...f, uses: ["pdf", "room"] }
            : f,
      ),
    };
    expect(() => loadFonts(withLock(moved))).toThrow(/IBMPlexSans-Regular\.woff.*IBM Plex Mono/);
  });
});

describe("the site's CSS", () => {
  /** Each @font-face rule: its family, weight, style, display, and the files its src names. */
  function faces(css: string) {
    return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
      const body = m[1] as string;
      const value = (prop: string): string | undefined =>
        new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();
      return {
        family: value("font-family")?.replace(/^"|"$/g, ""),
        weight: value("font-weight"),
        style: value("font-style"),
        display: value("font-display"),
        files: [...body.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((u) => u[1]),
      };
    });
  }

  it("uses the same files the PDF embeds", () => {
    const css = readFileSync(CSS, "utf8");
    for (const name of Object.values(FONT_FILES)) expect(css).toContain(`url("../fonts/${name}")`);
  });

  it("serves every vendored WOFF from ../fonts/, in its family's rule at its weight, swapped in when it loads", () => {
    const lock = readFontsLock(FONTS);
    const mono = Object.keys(byFamily(lock, "IBM Plex Mono").files).find((n) => n.endsWith(".woff"));
    const hand = Object.keys(byFamily(lock, "Patrick Hand").files).find((n) => n.endsWith(".woff"));
    expect(faces(readFileSync(CSS, "utf8"))).toEqual([
      { family: "IBM Plex Sans", weight: "400", style: "normal", display: "swap", files: [FONT_FILES.regular] },
      { family: "IBM Plex Sans", weight: "700", style: "normal", display: "swap", files: [FONT_FILES.bold] },
      { family: "IBM Plex Mono", weight: "400", style: "normal", display: "swap", files: [mono] },
      { family: "Patrick Hand", weight: "400", style: "normal", display: "swap", files: [hand] },
    ]);
    // Every WOFF the lock holds has its rule, so the room's renderers can ask document.fonts for each family.
    const woffs = lock.families.flatMap((f) => Object.keys(f.files).filter((n) => n.endsWith(".woff")));
    expect(
      faces(readFileSync(CSS, "utf8"))
        .flatMap((f) => f.files)
        .sort(),
    ).toEqual(woffs.sort());
  });
});

describe("the fonts' README", () => {
  it("lists every family with its uses and its source, and no longer says no other font is used", () => {
    const readme = readFileSync(join(FONTS, "README.md"), "utf8");
    expect(readme).not.toContain("No other font is used");
    for (const family of readFontsLock(FONTS).families) {
      expect(readme, family.family).toContain(family.family);
      expect(readme, family.family).toContain(`\`${family.source.package}\` ${family.source.version}`);
    }
  });
});
