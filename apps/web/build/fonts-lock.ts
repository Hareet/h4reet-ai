// The fonts' lock (spec 004, T010; Amendment B10; its research.md R-38, data-model.md §7.2). `npm run fonts:lock`
// writes apps/web/fonts/fonts.lock, schema 2, from FAMILIES below and the npm tarballs named on its command line, and
// computes every digest in it, so nothing in the lock is ever typed:
//
//     npm pack <package>@<version> --ignore-scripts        one per family, each into a new, empty folder
//     npm run fonts:lock -w apps/web -- [--copy] <tarball>...   each tarball by its absolute path
//
// Each tarball is matched to its family by its SHA-512, which must be the registry's integrity that the family's
// declaration records, before any file is read from it; then its package.json must name the declared package and
// version. Every family needs its tarball. With --copy, each declared file is written into apps/web/fonts/ unchanged,
// but for a license's line endings where the declaration says so (the repository stores text with LF). Without it,
// nothing is written but the lock. Either way, every vendored file must equal its tarball's file, and the lock records
// each tarball's URL, SHA-256, and integrity, and each file's SHA-256 and path in the tarball. It reads the tarballs
// in memory: it never unpacks one to disk, installs a package, runs a package's script, or reaches the network.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import type { FontFamily, FontsLock, FontUse } from "./pdf";

/** The fonts' directory: this file is apps/web/build/fonts-lock.ts. */
export const FONTS_DIR = fileURLToPath(new URL("../fonts", import.meta.url));

/** One family's release, as the registry gives it, and the files vendored from it. */
export interface FamilyDeclaration {
  family: string;
  license: string;
  /** The Reserved Font Name its license declares, or null when it declares none. */
  reserved_font_name: string | null;
  uses: FontUse[];
  /** The registry's `npm view <package>@<version> dist.integrity` and `time[<version>]`, its date. */
  source: { package: string; version: string; integrity: string; published: string };
  /** Each vendored file by its name in apps/web/fonts/: its path in the tarball, what changed from it (the note the
   * lock keeps), and whether that change is a text file's line endings, CRLF to LF. */
  files: Record<string, { from: string; note?: string; crlfToLf?: true }>;
}

const CRLF_NOTE = "line endings CRLF to LF, as the repository stores text; the words unchanged";

/** The vendored families, in the lock's order (B10): IBM Plex Sans, spec 002's, for the site, the PDF, and the
 * room; IBM Plex Mono and Patrick Hand for the room alone (Confirmation 7). */
export const FAMILIES: readonly FamilyDeclaration[] = [
  {
    family: "IBM Plex Sans",
    license: "OFL-1.1",
    reserved_font_name: "Plex",
    uses: ["site", "pdf", "room"],
    source: {
      package: "@ibm/plex-sans",
      version: "1.1.0",
      integrity: "sha512-WPgvO6Yfj2w5YbhyAr1tv95RUz4LRJlqN+CmYvBglabXteufP1D1E9BABMde+ZIKdRbFJDoKF5eQzfhpnbgZcQ==",
      published: "2024-11-11",
    },
    files: {
      "IBMPlexSans-Bold.woff": { from: "package/fonts/complete/woff/IBMPlexSans-Bold.woff" },
      "IBMPlexSans-Regular.woff": { from: "package/fonts/complete/woff/IBMPlexSans-Regular.woff" },
      "LICENSE.txt": { from: "package/LICENSE.txt", note: CRLF_NOTE, crlfToLf: true },
    },
  },
  {
    family: "IBM Plex Mono",
    license: "OFL-1.1",
    reserved_font_name: "Plex",
    uses: ["room"],
    source: {
      package: "@ibm/plex-mono",
      version: "2.5.0",
      integrity: "sha512-STBJIPxPomOYPmBMO7z5TKPJUotAF9u3gAUumTqVgwgrAO+K4FRNh0MlhsoJjKhJKsMbBJR10/bk4inkj/wc1w==",
      published: "2026-06-11",
    },
    files: {
      "IBMPlexMono-Regular.woff": { from: "package/fonts/complete/woff/IBMPlexMono-Regular.woff" },
      "LICENSE.txt": {
        from: "package/LICENSE.txt",
        note: `${CRLF_NOTE}; the same bytes as IBM Plex Sans's, so the two families share the file`,
        crlfToLf: true,
      },
    },
  },
  {
    family: "Patrick Hand",
    license: "OFL-1.1",
    reserved_font_name: null,
    uses: ["room"],
    source: {
      package: "@fontsource/patrick-hand",
      version: "5.3.0",
      integrity: "sha512-V8C38IlIFfdWg0Xtri3F7sLCVpm069rUwn6w4n+oyn38gt7H4arOJmuReg3tAw1Q6jHqZp89wTnAAJagq4Atxw==",
      published: "2026-07-19",
    },
    files: {
      "LICENSE-PatrickHand.txt": { from: "package/LICENSE" },
      "patrick-hand-latin-400-normal.woff": { from: "package/files/patrick-hand-latin-400-normal.woff" },
    },
  },
];

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const integrityOf = (data: Uint8Array): string => `sha512-${createHash("sha512").update(data).digest("base64")}`;

/** A pax extended header's path, if it sets one. */
function paxPath(body: Buffer): string | undefined {
  let path: string | undefined;
  for (let at = 0; at < body.length;) {
    const space = body.indexOf(0x20, at);
    const length = Number(body.subarray(at, space === -1 ? at : space).toString("ascii"));
    if (space === -1 || !Number.isSafeInteger(length) || length <= space - at) {
      throw new Error("a pax header's record has no length");
    }
    const record = body.subarray(space + 1, at + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (record.slice(0, equals) === "path") path = record.slice(equals + 1);
    at += length;
  }
  return path;
}

/** Every regular file in a gzipped tar, by its path, in memory: POSIX ustar, with a pax header's path or a GNU long
 * name, as npm's tarballs are. A header that fails its checksum, a truncated file, or a path given twice is refused. */
export function untar(gz: Uint8Array): Map<string, Buffer> {
  const tar = gunzipSync(gz);
  const files = new Map<string, Buffer>();
  let named: string | undefined;
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number): string => {
      const raw = header.subarray(start, start + length);
      const end = raw.indexOf(0);
      return raw.subarray(0, end === -1 ? length : end).toString("utf8");
    };
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0);
    if (Number.parseInt(field(148, 8).trim(), 8) !== sum)
      throw new Error(`a tar header at byte ${at} fails its checksum`);
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`a tar header at byte ${at} has no size`);
    const type = field(156, 1) || "0";
    const prefix = field(257, 6).startsWith("ustar") ? field(345, 155) : "";
    const path = named ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    const body = tar.subarray(at + 512, at + 512 + size);
    if (body.length !== size) throw new Error(`${path} is cut short in the tarball`);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      named = paxPath(body) ?? named;
      continue;
    }
    if (type === "L") {
      named = body.toString("utf8").replace(/\0+$/, "");
      continue;
    }
    named = undefined;
    if (type !== "0" && type !== "7") continue; // directories, links, and global headers carry no file
    if (files.has(path)) throw new Error(`${path} is in the tarball twice`);
    files.set(path, Buffer.from(body));
  }
  return files;
}

/** The registry's tarball URL for a package's version, as `npm view <package>@<version> dist.tarball` gives it. */
export function tarballUrl(pkg: string, version: string): string {
  return `https://registry.npmjs.org/${pkg}/-/${pkg.replace(/^@[^/]+\//, "")}-${version}.tgz`;
}

export interface LockOptions {
  /** apps/web/fonts/, or a copy of it. */
  fontsDir: string;
  /** One tarball per family, from `npm pack`. */
  tarballs: readonly string[];
  /** Write the declared files into fontsDir first. */
  copy: boolean;
  /** The families to lock; FAMILIES unless a test gives others. */
  families?: readonly FamilyDeclaration[];
}

/** The lock FAMILIES and the tarballs make, checking every vendored file against its tarball's file. */
export function lockFonts(options: LockOptions): FontsLock {
  const families = options.families ?? FAMILIES;
  const tarballs = new Map<FamilyDeclaration, { bytes: Buffer; files: Map<string, Buffer> }>();
  for (const path of options.tarballs) {
    const bytes = readFileSync(path);
    const integrity = integrityOf(bytes);
    const family = families.find((f) => f.source.integrity === integrity);
    if (!family) {
      throw new Error(
        `${basename(path)}: its SHA-512 is no family's integrity in build/fonts-lock.ts, so it isn't a release the lock declares, or isn't the registry's bytes`,
      );
    }
    if (tarballs.has(family)) throw new Error(`${basename(path)}: ${family.family}'s tarball is named twice`);
    const files = untar(bytes);
    const manifest = JSON.parse(files.get("package/package.json")?.toString("utf8") ?? "null") as {
      name?: unknown;
      version?: unknown;
    } | null;
    if (manifest?.name !== family.source.package || manifest.version !== family.source.version) {
      throw new Error(`${basename(path)}: its package.json isn't ${family.source.package} ${family.source.version}`);
    }
    tarballs.set(family, { bytes, files });
  }
  const tarballOf = (family: FamilyDeclaration) => {
    const found = tarballs.get(family);
    if (!found) throw new Error(`no tarball for ${family.source.package} ${family.source.version}: npm pack it`);
    return found;
  };

  // The bytes each vendored file must hold. Two families may share a file only with the same bytes.
  const expected = new Map<string, Buffer>();
  for (const family of families) {
    const { files } = tarballOf(family);
    for (const [name, entry] of Object.entries(family.files)) {
      if (name !== basename(name) || name === "fonts.lock" || name === "README.md") {
        throw new Error(`${family.family}: ${name} isn't a file name fonts.lock can give`);
      }
      const member = files.get(entry.from);
      if (!member) throw new Error(`${family.source.package} ${family.source.version} has no ${entry.from}`);
      const bytes = entry.crlfToLf ? Buffer.from(member.toString("latin1").replace(/\r\n/g, "\n"), "latin1") : member;
      const other = expected.get(name);
      if (other && !other.equals(bytes)) throw new Error(`${name}: two families vendor it, with different bytes`);
      expected.set(name, bytes);
    }
  }

  if (options.copy) for (const [name, bytes] of expected) writeFileSync(join(options.fontsDir, name), bytes);
  for (const [name, bytes] of expected) {
    const path = join(options.fontsDir, name);
    if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`${name} isn't vendored yet: run with --copy`);
    if (!readFileSync(path).equals(bytes)) throw new Error(`${name} isn't its tarball's file, unchanged`);
  }

  return {
    schema: 2,
    families: families.map((family): FontFamily => {
      const files: FontFamily["files"] = {};
      for (const name of Object.keys(family.files).sort()) {
        const entry = family.files[name];
        if (!entry) continue;
        const digest = sha256(readFileSync(join(options.fontsDir, name)));
        files[name] =
          entry.note === undefined
            ? { sha256: digest, from: entry.from }
            : { sha256: digest, from: entry.from, note: entry.note };
      }
      return {
        family: family.family,
        license: family.license,
        reserved_font_name: family.reserved_font_name,
        uses: [...family.uses],
        source: {
          package: family.source.package,
          version: family.source.version,
          url: tarballUrl(family.source.package, family.source.version),
          sha256: sha256(tarballOf(family).bytes),
          integrity: family.source.integrity,
          published: family.source.published,
        },
        files,
      };
    }),
  };
}

/** fonts.lock's text: the lock as JSON, two-space indented, with a final newline. */
export function lockText(lock: FontsLock): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const copy = args.includes("--copy");
  const tarballs = args.filter((arg) => arg !== "--copy");
  if (tarballs.length === 0 || tarballs.some((arg) => arg.startsWith("-"))) {
    console.error("usage: npm run fonts:lock -w apps/web -- [--copy] <tarball>...  (one npm pack tarball per family)");
    process.exit(2);
  }
  try {
    const lock = lockFonts({ fontsDir: FONTS_DIR, tarballs, copy });
    writeFileSync(join(FONTS_DIR, "fonts.lock"), lockText(lock));
    const count = new Set(lock.families.flatMap((f) => Object.keys(f.files))).size;
    console.log(
      `fonts:lock: ${lock.families.length} families and ${count} files, each checked against its tarball${copy ? " and copied" : ""}, into ${join(FONTS_DIR, "fonts.lock")}`,
    );
  } catch (error) {
    console.error(`fonts:lock: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
