// The resume's PDF (spec 002, T027 and T028; FR-013, FR-017, FR-019; contracts/resume-source.md §4; research.md R-06),
// with PDFKit, from the same rendered items as the interactive resume, in the same order and the same words.
//
// - Tagged, in reading order: a Document holding an H1 (the name), a P per header line, then an H2 and an L of
//   LI (Lbl, LBody) per section. The catalog has MarkInfo/Marked, a StructTreeRoot, Lang en-US, and DisplayDocTitle.
// - One font: IBM Plex Sans, vendored in apps/web/fonts/ and checked against fonts.lock before it's embedded,
//   subset. It is also the first font PDFKit loads, so its default, Helvetica, is never in the file. fonts.lock,
//   schema 2 (spec 004, Amendment B10), holds the room's families too; the PDF takes the one family whose uses hold
//   pdf, and refuses a lock that gives that use to none, or to more than one.
// - Info holds Title and Author only. PDFKit adds Producer, Creator, and CreationDate, which are taken out before the
//   file is written; its XMP metadata stream (xmp:CreatorTool, pdf:Producer) is never written. The file ID is
//   PDFKit's hash of the info with a fixed date, so the same source and policy build the same bytes.
// - The header follows FR-017: main's full name and contact when resume-header.json fills both, else the room's.
//   A withheld draft's PDF says "Draft, not approved" and nothing else; a drafts build's carries it first.
// - Its text, as pdf.js reads it through the embedded font's ToUnicode map, goes beside it in resume.pdf.txt
//   (pdfText): the font stores glyph codes, not text, so this is what the gate's scan of dist/ for a draft's words
//   reads to cover the PDF.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";

import { pdfHeader, type Policy } from "./approvals";
import type { Rendered } from "./content";

export const PDF_TITLE = "Resume";
export const DRAFT_NOTICE = "Draft, not approved";
export const FONTS_DIR = fileURLToPath(new URL("../fonts", import.meta.url));
export const FONT_FILES = { regular: "IBMPlexSans-Regular.woff", bold: "IBMPlexSans-Bold.woff" } as const;

/** PDFKit's file ID is a hash of its info, CreationDate included; a fixed date keeps the bytes the same. The date
 * itself is taken out of the info before it's written. */
const FIXED_DATE = new Date(0);

export type PdfState = "approved" | "draft" | "withheld";

export interface PdfInput {
  state: PdfState;
  /** null for a withheld draft. */
  header: { name: string; contact: string | null; lines: string[] } | null;
  sections: Rendered["sections"];
}

/** What the PDF shows: nothing but the notice for a withheld draft; else main's header when it fills both slots,
 * otherwise the room's (FR-017), and the room's header lines and the sections either way. */
export function pdfInput(rendered: Rendered | null, policy: Policy, state: PdfState): PdfInput {
  if (state === "withheld" || rendered === null) return { state: "withheld", header: null, sections: [] };
  const full = pdfHeader(policy);
  return {
    state,
    header: {
      name: full ? full.full_name : rendered.header.name,
      contact: full ? full.contact : null,
      lines: rendered.header.lines,
    },
    sections: rendered.sections,
  };
}

// ---- The fonts and their lock ----

/** What a vendored family is for (spec 004, B10): the site's CSS, the resume's PDF, or the room's live faces. */
export const FONT_USES = ["site", "pdf", "room"] as const;
export type FontUse = (typeof FONT_USES)[number];

/** One vendored family: its release on the npm registry and the files taken from it (spec 004's data-model.md §7.2). */
export interface FontFamily {
  family: string;
  license: string;
  /** The Reserved Font Name its license declares, or null when it declares none (Patrick Hand). */
  reserved_font_name: string | null;
  uses: FontUse[];
  source: { package: string; version: string; url: string; sha256: string; integrity: string; published: string };
  /** Each file's SHA-256 as vendored, its path in the tarball, and what changed from it, if anything. */
  files: Record<string, { sha256: string; from: string; note?: string }>;
}

/** apps/web/fonts/fonts.lock, schema 2, which `npm run fonts:lock` writes (build/fonts-lock.ts). */
export interface FontsLock {
  schema: 2;
  families: FontFamily[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const keysAre = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => k in v);

/** fonts.lock, refused unless it is schema 2's shape: every family's fields, its uses among FONT_USES with none
 * twice, its source, and each file a plain name with a SHA-256, the same in every family that names it. */
export function readFontsLock(dir: string = FONTS_DIR): FontsLock {
  const refuse = (why: string): never => {
    throw new Error(`fonts.lock isn't schema 2's shape (spec 004's data-model.md §7.2): ${why}`);
  };
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(join(dir, "fonts.lock"), "utf8")) as unknown;
  } catch {
    return refuse("it isn't there, or isn't JSON");
  }
  if (!isRecord(doc) || !keysAre(doc, ["schema", "families"])) return refuse("its keys aren't schema and families");
  if (doc.schema !== 2) refuse("schema isn't 2");
  if (!Array.isArray(doc.families) || doc.families.length === 0) refuse("families isn't a list of at least one");
  const families = doc.families as unknown[];
  const names = new Set<string>();
  const digests = new Map<string, string>();
  families.forEach((family, i) => {
    const at = `families[${i}]`;
    if (!isRecord(family)) return refuse(`${at} isn't an object`);
    if (!keysAre(family, ["family", "license", "reserved_font_name", "uses", "source", "files"])) {
      refuse(`${at}'s keys aren't family, license, reserved_font_name, uses, source, and files`);
    }
    if (typeof family.family !== "string" || family.family === "" || names.has(family.family)) {
      refuse(`${at}.family is missing, or names a family twice`);
    }
    names.add(family.family as string);
    if (typeof family.license !== "string" || family.license === "") refuse(`${at}.license is missing`);
    if (family.reserved_font_name !== null && typeof family.reserved_font_name !== "string") {
      refuse(`${at}.reserved_font_name isn't a name or null`);
    }
    const uses = family.uses;
    if (
      !Array.isArray(uses) ||
      uses.length === 0 ||
      new Set(uses).size !== uses.length ||
      !uses.every((use) => (FONT_USES as readonly unknown[]).includes(use))
    ) {
      refuse(`${at}.uses isn't one or more of site, pdf, and room, each once`);
    }
    const source = family.source;
    if (
      !isRecord(source) ||
      !keysAre(source, ["package", "version", "url", "sha256", "integrity", "published"]) ||
      !Object.values(source).every((v) => typeof v === "string" && v !== "") ||
      !SHA256_HEX.test(source.sha256 as string) ||
      !(source.integrity as string).startsWith("sha512-")
    ) {
      refuse(`${at}.source isn't its package, version, url, sha256, integrity, and published date`);
    }
    const files = family.files;
    if (!isRecord(files) || Object.keys(files).length === 0) return refuse(`${at}.files is empty`);
    for (const [name, entry] of Object.entries(files)) {
      if (name === "" || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
        refuse(`${at}.files names ${JSON.stringify(name)}, which isn't a file name in apps/web/fonts/`);
      }
      if (
        !isRecord(entry) ||
        !Object.keys(entry).every((k) => k === "sha256" || k === "from" || k === "note") ||
        typeof entry.sha256 !== "string" ||
        !SHA256_HEX.test(entry.sha256) ||
        typeof entry.from !== "string" ||
        (entry.note !== undefined && typeof entry.note !== "string")
      ) {
        refuse(`${at}.files.${name} isn't its sha256, from, and an optional note`);
      }
      const digest = (entry as { sha256: string }).sha256;
      if ((digests.get(name) ?? digest) !== digest) refuse(`${name} has two SHA-256s in two families`);
      digests.set(name, digest);
    }
    return undefined;
  });
  return doc as unknown as FontsLock;
}

/** The PDF's two weights' bytes, from the one family whose uses hold pdf, each refused unless it is a file of that
 * family and matches its SHA-256 in fonts.lock. */
export function loadFonts(dir: string = FONTS_DIR): { regular: Buffer; bold: Buffer } {
  const lock = readFontsLock(dir);
  const forPdf = lock.families.filter((family) => family.uses.includes("pdf"));
  const family = forPdf[0];
  if (forPdf.length !== 1 || family === undefined) {
    throw new Error(
      `fonts.lock gives the pdf use to ${forPdf.length} families, and the PDF embeds exactly one (spec 004, B10)`,
    );
  }
  const load = (name: string): Buffer => {
    const pinned = family.files[name]?.sha256;
    if (!pinned) {
      throw new Error(
        `${name} isn't a file of ${family.family}, the family fonts.lock gives the pdf use; the PDF embeds that family alone`,
      );
    }
    const bytes = readFileSync(join(dir, name));
    if (createHash("sha256").update(bytes).digest("hex") !== pinned) {
      throw new Error(`${name} doesn't match its SHA-256 in fonts.lock; the build embeds only the pinned font`);
    }
    return bytes;
  };
  return { regular: load(FONT_FILES.regular), bold: load(FONT_FILES.bold) };
}

// ---- The document ----

/** PDFKit's document, without its XMP metadata stream: PDFKit writes one for every version above 1.3, naming its
 * toolchain (xmp:CreatorTool, pdf:Producer) and dating the file, and the contract wants none. */
class ResumeDocument extends PDFDocument {
  override endMetadata(): void {}
}

const MARGIN = { top: 44, bottom: 44, left: 54, right: 54 };
const SIZE = { name: 20, contact: 10.5, line: 10.5, section: 12, item: 10, notice: 11 };

export async function renderPdf(input: PdfInput, fontsDir: string = FONTS_DIR): Promise<Buffer> {
  const fonts = loadFonts(fontsDir);
  const author = input.header?.name;
  const doc = new ResumeDocument({
    pdfVersion: "1.7",
    tagged: true,
    lang: "en-US",
    displayTitle: true,
    size: "LETTER",
    margins: MARGIN,
    // PDFKit opens a Buffer here as it opens a path; its types name only the path. Loading the vendored font first
    // keeps Helvetica, PDFKit's default, out of the file.
    font: fonts.regular as unknown as string,
    info: { Title: PDF_TITLE, ...(author ? { Author: author } : {}), CreationDate: FIXED_DATE },
  });
  delete doc.info.Producer;
  delete doc.info.Creator;
  delete doc.info.CreationDate;

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const root = doc.struct("Document");
  doc.addStructure(root);
  const block = (type: string, font: Buffer, size: number, text: string, after: number): void => {
    root.add(
      doc.struct(type, {}, () => {
        doc.font(font).fontSize(size).text(text, { lineGap: 2 });
      }),
    );
    doc.moveDown(after);
  };

  if (input.state !== "approved") block("P", fonts.bold, SIZE.notice, DRAFT_NOTICE, 0.6);
  if (input.header) {
    block("H1", fonts.bold, SIZE.name, input.header.name, 0.15);
    if (input.header.contact) block("P", fonts.regular, SIZE.contact, input.header.contact, 0.1);
    for (const line of input.header.lines) block("P", fonts.regular, SIZE.line, line, 0.1);
    for (const section of input.sections) {
      doc.moveDown(0.5);
      block("H2", fonts.bold, SIZE.section, section.title, 0.25);
      const list = doc.struct("L");
      root.add(list);
      doc
        .font(fonts.regular)
        .fontSize(SIZE.item)
        .list(
          section.items.map((i) => i.text),
          { structParent: list, bulletRadius: 1.6, textIndent: 11, lineGap: 1.5, paragraphGap: 2.5 },
        );
      list.end();
    }
  }
  root.end();
  doc.end();
  return done;
}

/** The PDF's text as pdf.js extracts it, one line: a line that ends after a hyphen rejoined to the next without a
 * space, any other line break a space, and whitespace collapsed, so it holds the source's words as written. */
export async function pdfText(pdf: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(pdf), verbosity: 0, disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  let text = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) if ("str" in item) text += item.str + (item.hasEOL ? "\n" : "");
    text += "\n";
  }
  await task.destroy();
  return text
    .replace(/-\n+(?=\S)/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
