// Spec 002's amendment of 2026-11-09 (contracts/resume-source.md §7; plan §2, "The Author's PDF"): the site's PDF is
// the Author's own designed file, apps/web/content/resume-author.pdf, when main approves its SHA-256 and main's
// resume-header.json fills both slots. It is served byte for byte as resume.pdf, its text beside it in resume.pdf.txt
// for the gate's scan of dist/, and recorded in room-data.json's resume_pdf, never in `published`, which the gate's
// content check holds to content files. Absent, unapproved, or without main's header, the PDF is the render, as before.
// A drafts build serves it unapproved, marked as a draft. Its checks, PDF1 to PDF9, run whenever the file is there,
// served or not, and fail the build by rule, never by a private phrase. The fixtures are PDFs this test makes with
// PDFKit and the vendored font, never the Author's file; the last case reads his only when the tree holds it.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { contentFiles, readPolicy, roomData, type RoomData } from "../../build/approvals";
import {
  authorPdfRules,
  checkAuthorPdf,
  computeLock,
  parseResume,
  RESUME_PATH,
  resumePart,
  writeLock,
} from "../../build/content";
import { loadFonts, pdfText } from "../../build/pdf";
import {
  AUTHOR_PDF_PATH,
  PDF_LINKS,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  pdf4Lines,
  pdfProblems,
  type PdfRead,
} from "../../build/resume-pdf";

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const FILE = "corpus/01-fixture.md";
const ITEM_TEXT = "Designed the lantern service for the fixture clinic.";
const FULL_NAME = "Robin Tidewell";
const CONTACT = "robin@example.org";
const HEADER = { full_name: FULL_NAME, contact: CONTACT };
/** A designed resume's words that pass every check: the full name, the contact, and the allowed hosts. */
const CLEAN = [
  FULL_NAME,
  `${CONTACT} · hareet.ai · github.com/Hareet · denverlocal.ai`,
  "Keeper of the lantern service, 2019-2023, CHT 4.0.",
  "For 1,000,000 nights, as of 2026-10-29.",
];
const CLEAN_LINKS = ["https://hareet.ai/", "https://github.com/Hareet", `mailto:${CONTACT}`];

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

const SOURCE = stringify({
  version: 1,
  header: {
    room: {
      name: "Robin",
      lines: [{ text: "Lighthouse keeping by background", claims: [{ file: FILE, quote: "lighthouse keeping" }] }],
    },
  },
  sections: [
    {
      id: "lanterns",
      title: "Lanterns",
      items: [
        {
          id: "lantern",
          text: ITEM_TEXT,
          verb: "designed",
          claims: [{ file: FILE, quote: "Robin designed the lantern service" }],
          slots: [],
        },
      ],
    },
  ],
});

interface Fixture {
  /** Each page's lines; one page by default. */
  pages?: string[][];
  /** Each link annotation's target. */
  links?: string[];
  /** Info's Title. */
  title?: string;
  /** An embedded file's bytes. */
  attachment?: Uint8Array;
  /** A sticky note, an annotation other than a link. */
  note?: boolean;
  /** A JavaScript action the document runs when it opens. */
  javascript?: boolean;
  /** PDF 1.7, for which PDFKit writes an XMP metadata stream. */
  xmp?: boolean;
  /** A form with one text field. */
  form?: boolean;
}

/** A PDF made here with PDFKit and the vendored font, so pdf.js reads its text through the font's ToUnicode map. */
async function fixturePdf(fixture: Fixture = {}): Promise<Buffer> {
  const fonts = loadFonts();
  const doc = new PDFDocument({
    size: "LETTER",
    font: fonts.regular as unknown as string,
    info: { Title: fixture.title ?? "Resume" },
    ...(fixture.xmp ? { pdfVersion: "1.7" as const } : {}),
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const pages = fixture.pages ?? [CLEAN];
  pages.forEach((lines, i) => {
    if (i > 0) doc.addPage();
    for (const line of lines) doc.fontSize(11).text(line);
  });
  (fixture.links ?? []).forEach((url, i) => doc.link(54, 300 + i * 20, 120, 14, url));
  if (fixture.attachment) doc.file(Buffer.from(fixture.attachment), { name: "notes.txt" });
  if (fixture.note) doc.note(54, 500, 20, 20, "a note the text doesn't show");
  if (fixture.javascript) {
    const action = doc.ref({ S: "JavaScript", JS: new String("app.alert('opened');") });
    (action as unknown as { end(): void }).end();
    (doc as unknown as { _root: { data: Record<string, unknown> } })._root.data.OpenAction = action;
  }
  if (fixture.form) {
    doc.initForm();
    doc.formText("field", 54, 540, 120, 20);
  }
  doc.end();
  return done;
}

/** A PDF with a drawing and no text. */
async function drawingPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", font: loadFonts().regular as unknown as string });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.rect(54, 54, 200, 100).fill("#336699");
  doc.end();
  return done;
}

/** A repository root: the fixture corpus, the resume's source and its lock, and the Author's PDF when given. */
function tree(pdf?: Uint8Array, denylist?: string): string {
  const root = mkdtempSync(join(tmpdir(), "h4-author-pdf-"));
  made.push(root);
  cpSync(join(FIXTURES, "corpus"), join(root, "corpus"), { recursive: true });
  mkdirSync(join(root, "apps/web/content"), { recursive: true });
  writeFileSync(join(root, RESUME_PATH), SOURCE);
  writeLock(root, computeLock(root, parseResume(SOURCE)));
  if (pdf) writeFileSync(join(root, AUTHOR_PDF_PATH), pdf);
  if (denylist !== undefined) {
    mkdirSync(join(root, "corpus/intake/private"), { recursive: true });
    writeFileSync(join(root, "corpus/intake/private/denylist.txt"), denylist);
  }
  return root;
}

/** A policy directory: main approves the resume's source and each digest given, and fills the header unless told. */
function policy(options: { approve?: string[]; header?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "h4-author-pdf-policy-"));
  made.push(dir);
  const approvals = [sha256(SOURCE), ...(options.approve ?? [])].map((sha, i) => ({
    id: `C-${String(i + 1).padStart(4, "0")}`,
    path_when_approved: i === 0 ? RESUME_PATH : AUTHOR_PDF_PATH,
    kind: "resume",
    sha256: sha,
    date: "2026-11-09",
    reason: "a stand-in approval, made by the test",
  }));
  writeFileSync(join(dir, "content-approvals.json"), JSON.stringify({ schema: 1, approvals }));
  if (options.header !== false)
    writeFileSync(join(dir, "resume-header.json"), JSON.stringify({ schema: 1, ...HEADER }));
  return dir;
}

async function build(root: string, policyDir: string, drafts = false) {
  const read = readPolicy(policyDir);
  const files = contentFiles(root, read);
  const emitted: Record<string, Uint8Array | string> = {};
  const warnings: string[] = [];
  const infos: string[] = [];
  const data: RoomData = await resumePart(roomData(files, read, drafts), {
    root,
    files,
    policy: read,
    drafts,
    emit: (name, source) => {
      emitted[name] = source;
    },
    warn: (message) => warnings.push(message),
    info: (message) => infos.push(message),
  });
  return { data, emitted, warnings, infos };
}

const bytesOf = (value: Uint8Array | string | undefined): Buffer => {
  if (!(value instanceof Uint8Array)) throw new Error("no PDF emitted");
  return Buffer.from(value);
};

/** What the build emits from the same tree without the Author's PDF: the render. */
async function render(): Promise<{ pdf: Buffer; text: string | Uint8Array | undefined }> {
  const { emitted } = await build(tree(), policy());
  return { pdf: bytesOf(emitted["resume.pdf"]), text: emitted["resume.pdf.txt"] };
}

/** The build's failure for a tree holding this PDF, with main approving nothing of it. */
async function failure(pdf: Uint8Array, denylist?: string): Promise<string> {
  try {
    await build(tree(pdf, denylist), policy());
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the build passed");
}

describe("the Author's PDF, when main approves it and fills the header", () => {
  it("is served byte for byte, its text beside it, and recorded in resume_pdf, not in published", async () => {
    const pdf = await fixturePdf({ links: CLEAN_LINKS });
    const { data, emitted, warnings, infos } = await build(tree(pdf), policy({ approve: [sha256(pdf)] }));
    expect(bytesOf(emitted["resume.pdf"]).equals(pdf)).toBe(true);
    expect(emitted["resume.pdf.txt"]).toBe(`${await pdfText(pdf)}\n`);
    expect(String(emitted["resume.pdf.txt"])).toContain(FULL_NAME);
    expect(data.resume_pdf).toEqual({ source: AUTHOR_PDF_PATH, sha256: sha256(pdf) });
    // The gate's content check holds `published` to content files; the PDF isn't one.
    expect(data.published).toEqual([{ path: RESUME_PATH, sha256: sha256(SOURCE) }]);
    expect(data.drafts).toEqual([]);
    // The room's on-screen resume stays the cited source's.
    expect(data.resume_state).toBe("approved");
    expect((data.sections as { items: { text: string }[] }[])[0]?.items[0]?.text).toBe(ITEM_TEXT);
    expect(warnings).toEqual([]);
    expect(infos.join("\n")).toContain(`resume: the PDF is ${AUTHOR_PDF_PATH}, which main approves`);
  });

  it("is served by a drafts build too, still approved", async () => {
    const pdf = await fixturePdf();
    const { data, emitted } = await build(tree(pdf), policy({ approve: [sha256(pdf)] }), true);
    expect(bytesOf(emitted["resume.pdf"]).equals(pdf)).toBe(true);
    expect(data.resume_pdf).toEqual({ source: AUTHOR_PDF_PATH, sha256: sha256(pdf) });
  });
});

describe("the render, unchanged, otherwise", () => {
  it("when the file is absent", async () => {
    const { data, emitted, infos } = await build(tree(), policy());
    const before = await render();
    expect(bytesOf(emitted["resume.pdf"]).equals(before.pdf)).toBe(true);
    expect(emitted["resume.pdf.txt"]).toBe(
      `${FULL_NAME} ${CONTACT} Lighthouse keeping by background Lanterns ${ITEM_TEXT}\n`,
    );
    expect(data.resume_pdf).toBeNull();
    expect(infos.join("\n")).not.toContain(AUTHOR_PDF_PATH);
  });

  it("when main doesn't approve it, in a build without drafts", async () => {
    const pdf = await fixturePdf();
    const { data, emitted, infos } = await build(tree(pdf), policy());
    const before = await render();
    expect(bytesOf(emitted["resume.pdf"]).equals(before.pdf)).toBe(true);
    expect(emitted["resume.pdf.txt"]).toBe(before.text);
    expect(data.resume_pdf).toBeNull();
    expect(infos.join("\n")).toContain(`resume: ${AUTHOR_PDF_PATH} passed PDF1 to PDF9; main doesn't approve it`);
  });

  it("when main's header isn't filled, even approved", async () => {
    const pdf = await fixturePdf();
    const { data, emitted } = await build(tree(pdf), policy({ approve: [sha256(pdf)], header: false }));
    expect(bytesOf(emitted["resume.pdf"]).equals(pdf)).toBe(false);
    expect(String(emitted["resume.pdf.txt"])).toBe(`Robin Lighthouse keeping by background Lanterns ${ITEM_TEXT}\n`);
    expect(data.resume_pdf).toBeNull();
  });

  it("except in a drafts build, which serves it unapproved, marked as a draft", async () => {
    const pdf = await fixturePdf();
    const { data, emitted } = await build(tree(pdf), policy(), true);
    expect(bytesOf(emitted["resume.pdf"]).equals(pdf)).toBe(true);
    expect(data.resume_pdf).toEqual({ source: AUTHOR_PDF_PATH, sha256: sha256(pdf), draft: true });
  });
});

describe("the checks, which fail the build whether or not main approves the file", () => {
  it("PDF4: a private denylist phrase, reported by its line, never its words", async () => {
    const pdf = await fixturePdf({ pages: [[...CLEAN, "Lead of the Cobalt Harbor project."]] });
    const message = await failure(pdf, "# one phrase per line\nCobalt Harbor\n");
    expect(message).toContain(`${AUTHOR_PDF_PATH}: the PDF check failed`);
    expect(message).toContain("PDF4 forbidden phrase (from corpus/intake/private/denylist.txt:2), in its text");
    expect(message.toLowerCase()).not.toContain("cobalt");
  });

  it("PDF4: a corpus file's 'Do not claim' phrase, by its file and line", async () => {
    const pdf = await fixturePdf({ pages: [[...CLEAN, "Robin invented the lantern in a storm."]] });
    expect(await failure(pdf)).toMatch(/PDF4 forbidden phrase \(from corpus\/01-fixture\.md:\d+\), in its text/);
  });

  it("PDF4 and PDF8 leave main's full name and contact alone, even when the denylist holds them", async () => {
    const pdf = await fixturePdf();
    const { emitted } = await build(tree(pdf, "Tidewell\nrobin@example.org\n"), policy({ approve: [sha256(pdf)] }));
    expect(bytesOf(emitted["resume.pdf"]).equals(pdf)).toBe(true);
  });

  it("PDF5: a URL to a host outside the allowlist, in the text or a link", async () => {
    for (const words of ["See https://example.com/robin.", "Notes at example.com.", "Code at github.com/someone."]) {
      const pdf = await fixturePdf({ pages: [[...CLEAN, words]] });
      expect(await failure(pdf), words).toContain("PDF5 a URL to a host outside the allowlist, in its text");
    }
    const linked = await fixturePdf({ links: [...CLEAN_LINKS, "https://example.com/"] });
    expect(await failure(linked)).toContain("PDF5 a URL to a host outside the allowlist, in its links");
    const local = await fixturePdf({ links: ["file:///etc/hosts"] });
    expect(await failure(local)).toContain("PDF5 a link that isn't http, https, or mailto, in its links");
  });

  it("PDF5 allows the hosts the corpus names: hareet.ai, denverlocal.ai, and github.com/Hareet", async () => {
    const pdf = await fixturePdf({
      pages: [[...CLEAN, "https://www.hareet.ai/room", "https://denverlocal.ai/,", "github.com/hareet/h4reet-ai."]],
      links: ["https://hareet.ai/", "https://denverlocal.ai/", "https://github.com/Hareet/cht-agent"],
    });
    const { emitted } = await build(tree(pdf), policy({ approve: [sha256(pdf)] }));
    expect(bytesOf(emitted["resume.pdf"]).equals(pdf)).toBe(true);
  });

  it("PDF6: a phone number's shape, in the text or a link, and never a year range or a count", async () => {
    for (const phone of [
      "+1 (303) 555-0142",
      "303-555-0142",
      "(303) 555 0142",
      "303.555.0142",
      "+44 20 7946 0958",
      "1-303-555-0142",
      "1.303.555.0142",
      "1 (303) 555-0142",
    ]) {
      const pdf = await fixturePdf({ pages: [[...CLEAN, `Call ${phone} any time.`]] });
      expect(await failure(pdf), phone).toContain("PDF6 a phone number's shape, in its text");
    }
    const linked = await fixturePdf({ links: ["tel:+13035550142"] });
    expect(await failure(linked)).toContain("PDF6 a phone number's shape, in its links");
  });

  it("PDF7: an email address other than main's contact, in the text or a link", async () => {
    const pdf = await fixturePdf({ pages: [[...CLEAN, "Or write to keeper@example.net."]] });
    expect(await failure(pdf)).toContain("PDF7 an email address other than main's contact, in its text");
    const linked = await fixturePdf({ links: ["mailto:keeper@example.net"] });
    expect(await failure(linked)).toContain("PDF7 an email address other than main's contact, in its links");
  });

  it("PDF8: the surname outside main's full name and contact, in the text or the properties", async () => {
    const pdf = await fixturePdf({ pages: [[...CLEAN, "Founder of Tidewell Lantern Works."]] });
    expect(await failure(pdf)).toContain("PDF8 the surname outside main's full name and contact, in its text");
    const titled = await fixturePdf({ title: "Tidewell" });
    expect(await failure(titled)).toContain("PDF8 the surname outside main's full name and contact, in its properties");
  });

  it("PDF2: more pages than the cap", async () => {
    const pdf = await fixturePdf({ pages: [CLEAN, ["two"], ["three"]] });
    expect(PDF_MAX_PAGES).toBe(2);
    expect(await failure(pdf)).toContain("PDF2 over 2 pages");
  });

  it("PDF1: bytes pdf.js can't read as a PDF", async () => {
    expect(await failure(new TextEncoder().encode("%PDF-1.7 not really"))).toContain(
      "PDF1 not a PDF that pdf.js reads",
    );
  });

  it("PDF3: no text the checks can read, or text without main's full name", async () => {
    expect(await failure(await drawingPdf())).toContain("PDF3 no text the checks can read");
    const nameless = await fixturePdf({ pages: [[CONTACT, "Keeper of the lantern service."]] });
    expect(await failure(nameless)).toContain("PDF3 its text doesn't hold main's full name");
  });

  it("PDF9: an embedded file, which the checks can't read", async () => {
    const pdf = await fixturePdf({ attachment: new TextEncoder().encode("anything at all") });
    expect(await failure(pdf)).toContain("PDF9 an attachment, which the checks can't read");
  });

  it("PDF9: JavaScript, an XMP metadata stream, a form field, or another annotation, each in a file made here", async () => {
    expect(await failure(await fixturePdf({ javascript: true }))).toContain(
      "PDF9 JavaScript, which the checks can't read",
    );
    expect(await failure(await fixturePdf({ xmp: true }))).toContain(
      "PDF9 an XMP metadata stream, which the checks can't read",
    );
    expect(await failure(await fixturePdf({ form: true }))).toContain("PDF9 a form field, which the checks can't read");
    expect(await failure(await fixturePdf({ note: true }))).toContain(
      "PDF9 an annotation other than a link, which the checks can't read",
    );
  });

  it("refuses a link in the file's place", async () => {
    const root = tree();
    const target = join(root, "elsewhere.pdf");
    writeFileSync(target, await fixturePdf());
    symlinkSync(target, join(root, AUTHOR_PDF_PATH));
    await expect(build(root, policy())).rejects.toThrow(`${AUTHOR_PDF_PATH}: must be a regular file, not a link`);
  });
});

describe("the checks' rules, as pdfProblems applies them", () => {
  const rules = authorPdfRules({ root: FIXTURES, roomName: "Robin", header: HEADER }).rules;
  const read = (text: string, more: Partial<PdfRead> = {}): PdfRead => ({
    pages: 1,
    text,
    links: [],
    properties: [],
    unread: [],
    ...more,
  });
  const clean = CLEAN.join(" ");

  it("PDF2: over the size cap", () => {
    expect(PDF_MAX_BYTES).toBe(1_000_000);
    expect(pdfProblems(read(clean), PDF_MAX_BYTES, rules)).toEqual([]);
    expect(pdfProblems(read(clean), PDF_MAX_BYTES + 1, rules)).toEqual(["PDF2 over 1,000,000 bytes"]);
  });

  it("reports each rule once for each place it fails", () => {
    const text = `${clean} example.com and example.net, 303-555-0142 and 720-555-0199.`;
    expect(pdfProblems(read(text), 1000, rules)).toEqual([
      "PDF5 a URL to a host outside the allowlist, in its text",
      "PDF6 a phone number's shape, in its text",
    ]);
  });

  it("needs only text when main's header isn't filled, and leaves emails and the surname unchecked then", () => {
    const bare = authorPdfRules({ root: FIXTURES, roomName: "Robin", header: null }).rules;
    expect(pdfProblems(read("Keeper of lanterns, keeper@example.net"), 1000, bare)).toEqual([]);
    expect(pdfProblems(read(""), 1000, bare)).toEqual(["PDF3 no text the checks can read"]);
  });

  it("PDF3: text pdf.js couldn't map to characters, a replacement, private-use, or control character", () => {
    for (const odd of ["\uFFFD", "\uE000", "\u0001"]) {
      expect(pdfProblems(read(`${clean} ${odd}`), 1000, rules), JSON.stringify(odd)).toEqual([
        "PDF3 text pdf.js couldn't map to characters",
      ]);
    }
  });

  it("gives PDF4's input, one normalized line a place, main's full name and contact taken out", () => {
    const lines = pdf4Lines(
      read(`${FULL_NAME} · ${CONTACT} · “Keeper’s   **lamp**”`, {
        links: [`mailto:${CONTACT}`, "https://hareet.ai/"],
        properties: [`${FULL_NAME} · hareet.ai`],
      }),
      rules,
    );
    expect(lines).toEqual(['· · "keeper\'s lamp"', "mailto:", "https://hareet.ai/", "· hareet.ai"]);
    expect(lines.join("\n").toLowerCase()).not.toContain("tidewell");
  });

  it("names what the checks can't read", () => {
    expect(pdfProblems(read(clean, { unread: ["JavaScript", "an XMP metadata stream"] }), 1000, rules)).toEqual([
      "PDF9 JavaScript, which the checks can't read",
      "PDF9 an XMP metadata stream, which the checks can't read",
    ]);
  });
});

describe("the allowlist", () => {
  it("holds only hosts the corpus names, each in the file it cites", () => {
    expect(PDF_LINKS.map((l) => l.attested)).toEqual(["hareet.ai", "denverlocal.ai", "github.com/Hareet"]);
    for (const link of PDF_LINKS) {
      expect(link.source, link.attested).toMatch(/^corpus\/\d{2}-[a-z0-9-]+\.md$/);
      expect(link.attested.toLowerCase(), link.attested).toBe(link.path ? `${link.host}/${link.path}` : link.host);
      expect(readFileSync(join(REPO, link.source), "utf8"), link.attested).toContain(link.attested);
    }
  });
});

describe("the Author's PDF in this tree", () => {
  const path = join(REPO, AUTHOR_PDF_PATH);
  it.skipIf(!existsSync(path))("passes PDF1 to PDF9 under the tree's resume-header.json", async () => {
    const header = readPolicy(join(REPO, "assets/policy")).header;
    const filled =
      header?.full_name && header.contact ? { full_name: header.full_name, contact: header.contact } : null;
    const roomName = parseResume(readFileSync(join(REPO, RESUME_PATH), "utf8")).header.room.name;
    const { problems } = await checkAuthorPdf(readFileSync(path), { root: REPO, roomName, header: filled });
    expect(problems).toEqual([]);
  });
});
