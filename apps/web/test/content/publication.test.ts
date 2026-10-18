// T026 (spec 002; FR-012, FR-013; contracts/resume-source.md §4 and §5): what the build publishes from the resume's
// source. The citation check runs on every build, published or not. An approved source publishes its items, each
// with its source file and that file's SHA-256, so the gate's check can trace every published item to an approval.
// A draft is left out of a build without drafts, so none of its text reaches room-data.json or the PDF, which says
// only "Draft, not approved"; with drafts shown, it publishes under that banner. room-data.json's `published` names
// the file and its digest whenever its words are out. Beside the PDF, resume.pdf.txt holds the PDF's text as pdf.js
// reads it, so the gate's scan of dist/ for a draft's words covers the PDF, whose embedded font stores glyph codes.
// A stale lock warns at build, and fails make test (test/content/source.test.ts), so a corpus edit on main never
// stops make up.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { contentFiles, readPolicy, roomData, type RoomData } from "../../build/approvals";
import { computeLock, parseResume, RESUME_PATH, resumePart, writeLock } from "../../build/content";
import { DRAFT_NOTICE } from "../../build/pdf";

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));
const FILE = "corpus/01-fixture.md";
const ITEM_TEXT = "Designed the lantern service for the fixture clinic.";

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

function sourceText(quote = "Robin designed the lantern service"): string {
  return stringify({
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
        items: [{ id: "lantern", text: ITEM_TEXT, verb: "designed", claims: [{ file: FILE, quote }], slots: [] }],
      },
    ],
  });
}

/** A repository root: the fixture corpus, the resume's source, and its lock. */
function tree(text = sourceText()): string {
  const root = mkdtempSync(join(tmpdir(), "h4-publish-"));
  made.push(root);
  cpSync(join(FIXTURES, "corpus"), join(root, "corpus"), { recursive: true });
  mkdirSync(join(root, "apps/web/content"), { recursive: true });
  writeFileSync(join(root, RESUME_PATH), text);
  try {
    writeLock(root, computeLock(root, parseResume(text)));
  } catch {
    // A source that doesn't parse has no lock; the build reports why.
  }
  return root;
}

function policyApproving(...digests: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "h4-publish-policy-"));
  made.push(dir);
  const approvals = digests.map((sha, i) => ({
    id: `C-${String(i + 1).padStart(4, "0")}`,
    path_when_approved: RESUME_PATH,
    kind: "resume",
    sha256: sha,
    date: "2026-10-18",
    reason: "a stand-in approval, made by the test",
  }));
  writeFileSync(join(dir, "content-approvals.json"), JSON.stringify({ schema: 1, approvals }));
  return dir;
}

async function build(root: string, policyDir: string, drafts: boolean) {
  const policy = readPolicy(policyDir);
  const files = contentFiles(root, policy);
  const emitted: Record<string, Uint8Array | string> = {};
  const warnings: string[] = [];
  const data: RoomData = await resumePart(roomData(files, policy, drafts), {
    root,
    files,
    policy,
    drafts,
    emit: (name, source) => {
      emitted[name] = source;
    },
    warn: (message) => warnings.push(message),
  });
  return { data, emitted, warnings };
}

async function pdfText(pdf: Uint8Array | string | undefined): Promise<string> {
  if (!(pdf instanceof Uint8Array)) throw new Error("no PDF emitted");
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return content.items
    .map((i) => ("str" in i ? i.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("an approved source", () => {
  it("publishes its header and items, each with its source file and that file's SHA-256, and no drafts", async () => {
    const text = sourceText();
    const root = tree(text);
    const { data, emitted, warnings } = await build(root, policyApproving(sha256(text)), false);
    expect(data.drafts).toEqual([]);
    expect(data.published).toEqual([{ path: RESUME_PATH, sha256: sha256(text) }]);
    expect(data.resume_state).toBe("approved");
    expect(data.header).toEqual({
      name: "Robin",
      lines: ["Lighthouse keeping by background"],
      source: RESUME_PATH,
      sha256: sha256(text),
    });
    expect(data.sections).toEqual([
      {
        id: "lanterns",
        title: "Lanterns",
        items: [{ id: "lantern", text: ITEM_TEXT, source: RESUME_PATH, sha256: sha256(text) }],
      },
    ]);
    expect((data.built_from as Record<string, unknown>).lock).toMatch(/^[0-9a-f]{64}$/);
    expect(await pdfText(emitted["resume.pdf"])).toContain(ITEM_TEXT);
    expect(emitted["resume.pdf.txt"]).toBe(`Robin Lighthouse keeping by background Lanterns ${ITEM_TEXT}\n`);
    expect(warnings).toEqual([]);
  });

  it("writes the PDF's text beside it with lines rejoined, so a scan finds the source's words as written", async () => {
    const long =
      "Designed the lantern service for the fixture clinic as a well-known, much-loved, long-standing, carefully kept part of the harbor's nightly life.";
    const text = sourceText().replace(ITEM_TEXT, long);
    const root = tree(text);
    const { emitted } = await build(root, policyApproving(sha256(text)), false);
    expect(String(emitted["resume.pdf.txt"])).toContain(long);
  });
});

describe("a draft source", () => {
  it("is withheld without drafts: none of its text in room-data.json, and a PDF that says only it's a draft", async () => {
    const root = tree();
    const { data, emitted } = await build(root, policyApproving(), false);
    expect(data.drafts).toEqual([RESUME_PATH]);
    expect(data.published).toEqual([]);
    expect(data.resume_state).toBe("withheld");
    expect(data.header).toBeNull();
    expect(data.sections).toEqual([]);
    const json = JSON.stringify(data);
    for (const words of [ITEM_TEXT, "Lighthouse keeping", "Lanterns", "Robin"]) expect(json).not.toContain(words);
    expect(await pdfText(emitted["resume.pdf"])).toBe(DRAFT_NOTICE);
    expect(emitted["resume.pdf.txt"]).toBe(`${DRAFT_NOTICE}\n`);
  });

  it("publishes under the banner with drafts shown, still listed as a draft", async () => {
    const root = tree();
    const { data, emitted } = await build(root, policyApproving(), true);
    expect(data.drafts).toEqual([RESUME_PATH]);
    expect(data.published).toEqual([{ path: RESUME_PATH, sha256: sha256(sourceText()), draft: true }]);
    expect(data.resume_state).toBe("draft");
    expect((data.sections as { items: { text: string }[] }[])[0]?.items[0]?.text).toBe(ITEM_TEXT);
    expect(await pdfText(emitted["resume.pdf"])).toMatch(new RegExp(`^${DRAFT_NOTICE} Robin`));
  });
});

describe("the build's checks", () => {
  it("fails on a citation problem, even for a draft it would withhold", async () => {
    const root = tree(sourceText("Robin designed the moon"));
    await expect(build(root, policyApproving(), false)).rejects.toThrow(/lantern: quote not found/);
  });

  it("warns on a stale lock, and still builds from the current corpus", async () => {
    const text = sourceText();
    const root = tree(text);
    writeFileSync(join(root, FILE), `${readFileSync(join(root, FILE), "utf8")}\n`);
    const { data, warnings } = await build(root, policyApproving(sha256(text)), false);
    expect(warnings).toEqual([`corpus changed since the lock: ${FILE} (run npm run content:lock -w apps/web)`]);
    expect(data.resume_state).toBe("approved");
  });

  it("publishes no resume and no PDF from a tree without the source", async () => {
    const root = mkdtempSync(join(tmpdir(), "h4-publish-empty-"));
    made.push(root);
    const { data, emitted } = await build(root, policyApproving(), false);
    expect(data.resume_state).toBe("absent");
    expect(data.sections).toEqual([]);
    expect(emitted).toEqual({});
  });
});
