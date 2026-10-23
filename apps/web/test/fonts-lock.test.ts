// Spec 004's T010 (Amendment B10; research.md R-38): build/fonts-lock.ts, the script `npm run fonts:lock`. It reads
// npm tarballs in memory, finds each one's family by the registry's integrity before reading a file from it, copies
// the declared files unchanged (a license's line endings aside, where declared), checks every vendored file against
// its tarball's, and writes fonts.lock with every digest computed. The tarballs here are made at run time.
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { lockFonts, tarballUrl, untar, type FamilyDeclaration } from "../build/fonts-lock";

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "h4-fonts-lock-"));
  made.push(dir);
  return dir;
}

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const integrityOf = (data: Uint8Array): string => `sha512-${createHash("sha512").update(data).digest("base64")}`;

/** A gzipped POSIX ustar archive of the entries, in order, as npm pack writes one; a path over 100 bytes is split
 * into the header's prefix and name. */
function tarball(entries: [string, string | Buffer][]): Buffer {
  const blocks: Buffer[] = [];
  for (const [path, content] of entries) {
    const body = typeof content === "string" ? Buffer.from(content) : content;
    const header = Buffer.alloc(512);
    const cut = path.length > 100 ? path.lastIndexOf("/", 155) : -1;
    header.write(cut > 0 ? path.slice(cut + 1) : path, 0, 100, "utf8");
    if (cut > 0) header.write(path.slice(0, cut), 345, 155, "utf8");
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.write("        ", 148);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const manifest = (pkg: string, version: string): [string, string] => [
  "package/package.json",
  JSON.stringify({ name: pkg, version }),
];

function declare(
  pkg: string,
  version: string,
  integrity: string,
  files: FamilyDeclaration["files"],
): FamilyDeclaration {
  return {
    family: `Fixture ${pkg}`,
    license: "OFL-1.1",
    reserved_font_name: null,
    uses: ["room"],
    source: { package: pkg, version, integrity, published: "2026-10-23" },
    files,
  };
}

/** A tarball written to its own folder, and its family declared with the tarball's own integrity. */
function release(
  pkg: string,
  version: string,
  files: [string, string | Buffer][],
  declared: FamilyDeclaration["files"],
) {
  const gz = tarball([manifest(pkg, version), ...files]);
  const path = join(temp(), `${pkg.replace(/\W/g, "-")}-${version}.tgz`);
  writeFileSync(path, gz);
  return { gz, path, family: declare(pkg, version, integrityOf(gz), declared) };
}

const FONT = Buffer.from([0x77, 0x4f, 0x46, 0x46, 0x00, 0x01, 0x0d, 0x0a, 0xff]);
const LICENSE_CRLF = "Copyright, a fixture\r\n\r\nSIL OPEN FONT LICENSE Version 1.1\r\n";

describe("untar", () => {
  it("reads a gzipped tar's regular files by path, in memory, a long path's prefix included", () => {
    const long = `package/${"d".repeat(120)}/file.txt`;
    const files = untar(
      tarball([
        ["package/a.txt", "a\n"],
        ["package/dir/b.bin", FONT],
        [long, "long\n"],
      ]),
    );
    expect([...files.keys()]).toEqual(["package/a.txt", "package/dir/b.bin", long]);
    expect(files.get("package/a.txt")?.toString("utf8")).toBe("a\n");
    expect(files.get("package/dir/b.bin")).toEqual(FONT);
    expect(files.get(long)?.toString("utf8")).toBe("long\n");
  });

  it("refuses a header that fails its checksum, and a path given twice", () => {
    const tar = gunzipSync(tarball([["package/a.txt", "a\n"]]));
    tar.writeUInt8((tar.readUInt8(0) ^ 0x01) & 0xff, 0);
    expect(() => untar(gzipSync(tar))).toThrow(/checksum/);
    expect(() =>
      untar(
        tarball([
          ["package/a.txt", "a\n"],
          ["package/a.txt", "b\n"],
        ]),
      ),
    ).toThrow(/twice/);
  });
});

describe("lockFonts", () => {
  it("finds the family by its integrity, copies its files unchanged but for a declared CRLF, and computes every digest", () => {
    const { gz, path, family } = release(
      "@fixture/sans",
      "1.0.0",
      [
        ["package/fonts/Fixture-Regular.woff", FONT],
        ["package/LICENSE.txt", LICENSE_CRLF],
      ],
      {
        "Fixture-Regular.woff": { from: "package/fonts/Fixture-Regular.woff" },
        "LICENSE-Fixture.txt": { from: "package/LICENSE.txt", note: "line endings CRLF to LF", crlfToLf: true },
      },
    );
    const fonts = temp();
    const lock = lockFonts({ fontsDir: fonts, tarballs: [path], copy: true, families: [family] });
    const license = LICENSE_CRLF.replace(/\r\n/g, "\n");
    // A binary keeps every byte, the CR LF inside it too; only the declared license's line endings change.
    expect(readFileSync(join(fonts, "Fixture-Regular.woff"))).toEqual(FONT);
    expect(readFileSync(join(fonts, "LICENSE-Fixture.txt"), "utf8")).toBe(license);
    expect(lock).toEqual({
      schema: 2,
      families: [
        {
          family: "Fixture @fixture/sans",
          license: "OFL-1.1",
          reserved_font_name: null,
          uses: ["room"],
          source: {
            package: "@fixture/sans",
            version: "1.0.0",
            url: "https://registry.npmjs.org/@fixture/sans/-/sans-1.0.0.tgz",
            sha256: sha256(gz),
            integrity: integrityOf(gz),
            published: "2026-10-23",
          },
          files: {
            "Fixture-Regular.woff": { sha256: sha256(FONT), from: "package/fonts/Fixture-Regular.woff" },
            "LICENSE-Fixture.txt": {
              sha256: sha256(Buffer.from(license)),
              from: "package/LICENSE.txt",
              note: "line endings CRLF to LF",
            },
          },
        },
      ],
    });
    // Without --copy it checks the files already there, and writes nothing.
    expect(lockFonts({ fontsDir: fonts, tarballs: [path], copy: false, families: [family] })).toEqual(lock);
  });

  it("refuses a tarball whose bytes aren't a declared release's, before it writes a file", () => {
    const { gz, path, family } = release("@fixture/sans", "1.0.0", [["package/f.woff", FONT]], {
      "f.woff": { from: "package/f.woff" },
    });
    const fonts = temp();
    writeFileSync(path, Buffer.concat([gz, Buffer.from([0])]));
    expect(() => lockFonts({ fontsDir: fonts, tarballs: [path], copy: true, families: [family] })).toThrow(
      /no family's integrity/,
    );
    expect(readdirSync(fonts)).toEqual([]);
  });

  it("refuses a package.json that isn't the declared package and version", () => {
    const gz = tarball([manifest("@fixture/sans", "1.0.1"), ["package/f.woff", FONT]]);
    const path = join(temp(), "sans.tgz");
    writeFileSync(path, gz);
    const family = declare("@fixture/sans", "1.0.0", integrityOf(gz), { "f.woff": { from: "package/f.woff" } });
    expect(() => lockFonts({ fontsDir: temp(), tarballs: [path], copy: true, families: [family] })).toThrow(
      /package\.json isn't @fixture\/sans 1\.0\.0/,
    );
  });

  it("refuses a vendored file that isn't its tarball's, and a file the tarball doesn't hold", () => {
    const { path, family } = release("@fixture/sans", "1.0.0", [["package/f.woff", FONT]], {
      "f.woff": { from: "package/f.woff" },
    });
    const fonts = temp();
    lockFonts({ fontsDir: fonts, tarballs: [path], copy: true, families: [family] });
    writeFileSync(join(fonts, "f.woff"), Buffer.concat([FONT, Buffer.from([0])]));
    expect(() => lockFonts({ fontsDir: fonts, tarballs: [path], copy: false, families: [family] })).toThrow(
      /f\.woff isn't its tarball's file, unchanged/,
    );
    const missing = { ...family, files: { "g.woff": { from: "package/g.woff" } } };
    expect(() => lockFonts({ fontsDir: fonts, tarballs: [path], copy: true, families: [missing] })).toThrow(
      /has no package\/g\.woff/,
    );
  });

  it("needs every family's tarball, and lets two families share a file only with the same bytes", () => {
    const sans = release("@fixture/sans", "1.0.0", [["package/LICENSE.txt", "one\n"]], {
      "LICENSE.txt": { from: "package/LICENSE.txt" },
    });
    const mono = release("@fixture/mono", "2.0.0", [["package/LICENSE.txt", "two\n"]], {
      "LICENSE.txt": { from: "package/LICENSE.txt" },
    });
    const families = [sans.family, mono.family];
    expect(() => lockFonts({ fontsDir: temp(), tarballs: [sans.path], copy: true, families })).toThrow(
      /no tarball for @fixture\/mono 2\.0\.0/,
    );
    expect(() => lockFonts({ fontsDir: temp(), tarballs: [sans.path, mono.path], copy: true, families })).toThrow(
      /LICENSE\.txt: two families vendor it, with different bytes/,
    );
  });

  it("gives the registry's tarball URL, the scope dropped from the file's name", () => {
    expect(tarballUrl("@ibm/plex-mono", "2.5.0")).toBe(
      "https://registry.npmjs.org/@ibm/plex-mono/-/plex-mono-2.5.0.tgz",
    );
    expect(tarballUrl("@fontsource/patrick-hand", "5.3.0")).toBe(
      "https://registry.npmjs.org/@fontsource/patrick-hand/-/patrick-hand-5.3.0.tgz",
    );
  });
});
