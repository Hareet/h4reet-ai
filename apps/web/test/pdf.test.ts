// T024 (spec 002; FR-013, FR-017, FR-019, SC-002; contracts/resume-source.md §4): the PDF. pdf.js (pinned) reads
// it back: its text holds each item's filled text exactly once, in the source's order, and nothing else but the
// header and the section titles. Its catalog is tagged (MarkInfo/Marked, a StructTreeRoot in reading order), in
// en-US, with DisplayDocTitle; its Info holds Title and Author only, with no dates, producer, or creator, and there is
// no XMP stream. The same source and policy build the same bytes. The header follows FR-017 from the policy
// directory's resume-header.json, main's copy.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { readPolicy } from "../build/approvals";
import { parseResume, readFacts, renderResume, type Rendered } from "../build/content";
import { DRAFT_NOTICE, pdfInput, renderPdf } from "../build/pdf";

const ROOT = fileURLToPath(new URL("./fixtures", import.meta.url));
const FILE = "corpus/01-fixture.md";

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const RENDERED: Rendered = renderResume(
  parseResume(
    stringify({
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
              text: "Designed the lantern service for the fixture clinic, co-authoring nothing.{{slot:fixture.lanterns}}",
              verb: "designed",
              claims: [{ file: FILE, quote: "Robin designed the lantern service" }],
              slots: ["fixture.lanterns"],
            },
            {
              id: "service",
              text: "The lantern service has run every night since its launch, through storms and calm alike, which makes this line long enough to wrap on the page.",
              claims: [{ file: FILE, quote: "The lantern service has run every night" }],
            },
          ],
        },
        {
          id: "harbor",
          title: "Harbor",
          items: [
            {
              id: "tide",
              text: "Built the tide clock for the harbor office.",
              verb: "built",
              claims: [{ file: FILE, quote: "Robin built the tide clock" }],
            },
          ],
        },
      ],
    }),
  ),
  readFacts(ROOT),
);

function policy(header?: { full_name: string | null; contact: string | null }) {
  const dir = mkdtempSync(join(tmpdir(), "h4-pdf-policy-"));
  made.push(dir);
  if (header) writeFileSync(join(dir, "resume-header.json"), JSON.stringify({ schema: 1, ...header }));
  return readPolicy(dir);
}

const collapse = (s: string): string =>
  s
    .replace(/\s+/g, " ")
    .replace(/- (?=\S)/g, "-")
    .trim();

/** pdf.js's reading of the file: its text, whitespace collapsed (a line wrapped after a hyphen rejoined). */
async function read(pdf: Buffer) {
  const doc = await getDocument({
    data: new Uint8Array(pdf),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  let text = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) if ("str" in item) text += item.str + (item.hasEOL ? " " : "");
    text += " ";
  }
  return { doc, text: collapse(text) };
}

/** The bytes as text, for the dictionaries PDFKit writes uncompressed. */
const raw = (pdf: Buffer): string => pdf.toString("latin1");

function object(pdf: string, id: string): string {
  const match = new RegExp(`(?:^|\\n)${id} 0 obj\\n([\\s\\S]*?)\\nendobj`).exec(pdf);
  if (!match?.[1]) throw new Error(`no object ${id}`);
  return match[1];
}

function trailerRef(pdf: string, key: string): string {
  const trailer = pdf.slice(pdf.lastIndexOf("trailer"));
  const match = new RegExp(`/${key} (\\d+) 0 R`).exec(trailer);
  if (!match?.[1]) throw new Error(`no /${key} in the trailer`);
  return match[1];
}

const keys = (dict: string): string[] => [...dict.matchAll(/^\/([A-Za-z]+)\b/gm)].map((m) => m[1] as string);

describe("the PDF's text (SC-002)", () => {
  it("holds each item's filled text exactly once, in order, and nothing but the header and section titles", async () => {
    const { text } = await read(await renderPdf(pdfInput(RENDERED, policy(), "approved")));
    const expected = [
      "Robin",
      "Lighthouse keeping by background",
      "Lanterns",
      "Designed the lantern service for the fixture clinic, co-authoring nothing. It lights 12 lanterns.",
      RENDERED.sections[0]?.items[1]?.text as string,
      "Harbor",
      "Built the tide clock for the harbor office.",
    ].map(collapse);
    let rest = text;
    for (const part of expected) {
      const at = rest.indexOf(part);
      expect(at, `"${part}" in "${rest}"`).toBeGreaterThanOrEqual(0);
      expect(rest.slice(0, at).trim(), `before "${part}"`).toBe("");
      rest = rest.slice(at + part.length);
    }
    expect(rest.trim()).toBe("");
    for (const section of RENDERED.sections) {
      for (const item of section.items) expect(text.split(collapse(item.text)).length - 1, item.id).toBe(1);
    }
  });
});

describe("the PDF's catalog and properties (FR-019)", () => {
  it("is tagged, in en-US, with its title displayed and a structure tree in reading order", async () => {
    const pdf = await renderPdf(pdfInput(RENDERED, policy(), "approved"));
    const { doc } = await read(pdf);
    expect((await doc.getMarkInfo())?.get("Marked")).toBe(true);
    expect((await doc.getViewerPreferences())?.get("DisplayDocTitle")).toBe(true);
    const catalog = object(raw(pdf), trailerRef(raw(pdf), "Root"));
    expect(catalog).toMatch(/^\/Lang \(en-US\)$/m);
    expect(catalog).toMatch(/^\/StructTreeRoot \d+ 0 R$/m);
    const tree = (await (await doc.getPage(1)).getStructTree()) as unknown as Node;
    type Node = { role?: string; children?: Node[] };
    const roles = (n: Node): unknown =>
      n.children?.some((c) => c.role) ? { [n.role ?? "?"]: n.children.filter((c) => c.role).map(roles) } : n.role;
    expect(roles(tree)).toEqual({
      Root: [
        {
          Document: [
            "H1",
            "P",
            "H2",
            { L: [{ LI: ["Lbl", "LBody"] }, { LI: ["Lbl", "LBody"] }] },
            "H2",
            { L: [{ LI: ["Lbl", "LBody"] }] },
          ],
        },
      ],
    });
  });

  it("holds Title and Author only in Info, and no dates, producer, creator, or XMP stream", async () => {
    const pdf = await renderPdf(pdfInput(RENDERED, policy(), "approved"));
    const text = raw(pdf);
    expect(keys(object(text, trailerRef(text, "Info")))).toEqual(["Title", "Author"]);
    const { doc } = await read(pdf);
    const meta = await doc.getMetadata();
    expect(meta.metadata).toBeNull();
    expect(meta.info).toMatchObject({ Title: "Resume", Author: "Robin" });
    for (const word of ["CreationDate", "ModDate", "Producer", "Creator", "/Metadata", "xmpmeta", "PDFKit"]) {
      expect(text.includes(word), word).toBe(false);
    }
  });

  it("embeds the vendored font, subset, and no other", () => {
    return renderPdf(pdfInput(RENDERED, policy(), "approved")).then((pdf) => {
      const fonts = [...raw(pdf).matchAll(/\/BaseFont \/([A-Za-z0-9+_-]+)/g)].map((m) => m[1] as string);
      expect(fonts.length).toBeGreaterThan(0);
      for (const font of fonts) expect(font).toMatch(/^[A-Z]{6}\+IBMPlexSans(-Bold)?$/);
      expect(raw(pdf)).toContain("/FontFile2");
    });
  });

  it("is the same bytes from the same source and policy", async () => {
    const a = await renderPdf(pdfInput(RENDERED, policy(), "approved"));
    const b = await renderPdf(pdfInput(RENDERED, policy(), "approved"));
    expect(a.equals(b)).toBe(true);
  });
});

describe("the PDF's header (FR-017)", () => {
  const head = async (header?: { full_name: string | null; contact: string | null }) => {
    const pdf = await renderPdf(pdfInput(RENDERED, policy(header), "approved"));
    const { doc, text } = await read(pdf);
    return { text, author: (await doc.getMetadata()).info as { Author?: string } };
  };

  it("carries main's full name and contact when both are filled, the room's header lines after them", async () => {
    const { text, author } = await head({ full_name: "Robin Quillfeather", contact: "robin@example.org" });
    expect(text.startsWith("Robin Quillfeather robin@example.org Lighthouse keeping by background Lanterns")).toBe(
      true,
    );
    expect(author.Author).toBe("Robin Quillfeather");
  });

  it.each([
    ["no resume-header.json on main", undefined],
    ["both slots empty", { full_name: null, contact: null }],
    ["only the name filled", { full_name: "Robin Quillfeather", contact: null }],
    ["only the contact filled", { full_name: null, contact: "robin@example.org" }],
  ])("is the room's header with %s", async (_why, header) => {
    const { text, author } = await head(header);
    expect(text.startsWith("Robin Lighthouse keeping by background Lanterns")).toBe(true);
    expect(text).not.toContain("Quillfeather");
    expect(text).not.toContain("example.org");
    expect(author.Author).toBe("Robin");
  });
});

describe("a draft's PDF", () => {
  it("says only that it's a draft when drafts aren't shown, with no name in its properties", async () => {
    const pdf = await renderPdf(pdfInput(null, policy(), "withheld"));
    const { text } = await read(pdf);
    expect(text).toBe(DRAFT_NOTICE);
    const body = raw(pdf);
    expect(keys(object(body, trailerRef(body, "Info")))).toEqual(["Title"]);
  });

  it("carries the banner first when drafts are shown", async () => {
    const { text } = await read(await renderPdf(pdfInput(RENDERED, policy(), "draft")));
    expect(text.startsWith(`${DRAFT_NOTICE} Robin Lighthouse keeping by background`)).toBe(true);
  });
});
