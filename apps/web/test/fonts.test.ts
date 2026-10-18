// T028 (spec 002; FR-019; research.md R-06): the one vendored font, IBM Plex Sans, under the SIL Open Font License,
// with its license beside it. fonts.lock pins each file by SHA-256 and records the upstream release it came from;
// the build refuses a font whose bytes differ. The site's CSS and the PDF use the same files.
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { FONT_FILES, loadFonts, readFontsLock } from "../build/pdf";

const FONTS = fileURLToPath(new URL("../fonts", import.meta.url));
const CSS = fileURLToPath(new URL("../src/fonts.css", import.meta.url));

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

describe("fonts.lock", () => {
  it("pins every font file and the license by SHA-256", () => {
    const lock = readFontsLock(FONTS);
    expect(Object.keys(lock.files).sort()).toEqual([...Object.values(FONT_FILES), "LICENSE.txt"].sort());
    for (const [name, entry] of Object.entries(lock.files)) {
      expect(sha256(readFileSync(join(FONTS, name))), name).toBe(entry.sha256);
    }
  });

  it("records the upstream release: the package, its version, its tarball's URL and SHA-256, and each file's path in it", () => {
    const lock = readFontsLock(FONTS);
    expect(lock.family).toBe("IBM Plex Sans");
    expect(lock.license).toBe("OFL-1.1");
    expect(lock.source.package).toBe("@ibm/plex-sans");
    expect(lock.source.url).toBe(`https://registry.npmjs.org/@ibm/plex-sans/-/plex-sans-${lock.source.version}.tgz`);
    expect(lock.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lock.source.integrity).toMatch(/^sha512-/);
    for (const entry of Object.values(lock.files)) expect(entry.from).toMatch(/^package\//);
  });

  it("is all the directory holds, with the lock itself and its README", () => {
    const lock = readFontsLock(FONTS);
    expect(readdirSync(FONTS).sort()).toEqual([...Object.keys(lock.files), "README.md", "fonts.lock"].sort());
  });

  it("holds the license as the OFL, with the Reserved Font Name", () => {
    const license = readFileSync(join(FONTS, "LICENSE.txt"), "utf8");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(license).toContain('Reserved Font Name "Plex"');
  });
});

describe("loading the fonts", () => {
  it("returns the locked files' bytes", () => {
    const fonts = loadFonts(FONTS);
    expect(sha256(fonts.regular)).toBe(readFontsLock(FONTS).files[FONT_FILES.regular]?.sha256);
    expect(sha256(fonts.bold)).toBe(readFontsLock(FONTS).files[FONT_FILES.bold]?.sha256);
  });

  it("refuses a font whose bytes don't match the lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "h4-fonts-"));
    made.push(dir);
    cpSync(FONTS, dir, { recursive: true });
    const path = join(dir, FONT_FILES.regular);
    const bytes = readFileSync(path);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(path, bytes);
    expect(() => loadFonts(dir)).toThrow(/IBMPlexSans-Regular\.woff.*fonts\.lock/);
  });
});

describe("the site's CSS", () => {
  it("uses the same files the PDF embeds", () => {
    const css = readFileSync(CSS, "utf8");
    for (const name of Object.values(FONT_FILES)) expect(css).toContain(`url("../fonts/${name}")`);
  });
});
