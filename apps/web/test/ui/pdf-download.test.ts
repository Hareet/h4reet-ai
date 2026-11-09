// Spec 002's amendment of 2026-11-09 (contracts/resume-source.md §7; plan §2): every link to the resume's PDF saves it
// under the Author's file name, which the build derives from main's resume-header.json: the full name, its words
// joined by hyphens, then "-Resume-hareet-ai.pdf"; and "Resume-hareet-ai.pdf" while either slot is empty, as FR-017's
// WHILE clause has it. No source file holds the name (the review of 9320b778): the build defines it for the scripts
// and writes it into index.html. The served path stays ./resume.pdf, so the web image's content type and cache rules
// (contracts/web-serving.md §3) are unchanged. The links: the first screen's plain HTML link, the choice screen's, the
// talk panel's beside a message that points to the resume, and the interactive resume's "Download (PDF)".
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readPolicy } from "../../build/approvals";
import { pdfDownloadName } from "../../build/download-name";
import { ABSENT } from "../../src/resume/data";
import { PDF_FILE_FALLBACK, PDF_HREF, pdfFileName, pdfFileNameFor } from "../../src/resume/download";
import { resumePanel } from "../../src/resume/view";
import { buildSite } from "../global-build";
import { button, intoRoom, REPO, start, talkLog, textOf } from "../helpers/room";

const INDEX = fileURLToPath(new URL("../../index.html", import.meta.url));
/** The test's stand-in for main's header (test/content/author-pdf.test.ts uses the same). */
const FULL_NAME = "Robin Tidewell";
const NAMED = "Robin-Tidewell-Resume-hareet-ai.pdf";

const made: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const pdfLinks = (root: ParentNode): HTMLAnchorElement[] =>
  [...root.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => a.getAttribute("href") === PDF_HREF);
const named = (root: ParentNode): (string | null)[][] =>
  pdfLinks(root).map((a) => [textOf(a), a.getAttribute("download")]);

/** A policy directory holding a resume-header.json with these slots, or none. */
function policyDir(header?: { full_name: string | null; contact: string | null }): string {
  const dir = mkdtempSync(join(tmpdir(), "h4-download-policy-"));
  made.push(dir);
  if (header) writeFileSync(join(dir, "resume-header.json"), JSON.stringify({ schema: 1, ...header }));
  return dir;
}

/** The three scripted links, as a visit shows them. */
async function scriptedLinks(): Promise<(string | null)[][]> {
  const v = start({ webgl: true });
  const choice = named(v.doc.querySelector("#app") as Element);
  await intoRoom(v);
  const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
  if (!box) throw new Error("no text box");
  box.value = "What did the Author build?";
  button(v.doc, "Send").click();
  const talk = named(talkLog(v.doc).lastElementChild as Element);
  const panel = named(resumePanel(new JSDOM("<!doctype html><body></body>").window.document, ABSENT));
  return [...choice, ...talk, ...panel];
}

describe("the name, from main's header", () => {
  it("is the full name's words joined by hyphens, then -Resume-hareet-ai.pdf", () => {
    expect(PDF_HREF).toBe("./resume.pdf");
    expect(pdfFileNameFor(FULL_NAME)).toBe(NAMED);
    expect(pdfFileNameFor("  Robin \t Tidewell ")).toBe(NAMED);
    expect(pdfFileNameFor('Robin "Tidewell"/..')).toBe(NAMED);
  });

  it("is Resume-hareet-ai.pdf without a full name", () => {
    expect(PDF_FILE_FALLBACK).toBe("Resume-hareet-ai.pdf");
    for (const none of [null, "", "  ", '"/']) expect(pdfFileNameFor(none)).toBe(PDF_FILE_FALLBACK);
  });

  it("follows FR-017's WHILE clause: the full name only while both slots are filled", () => {
    const contact = "robin@example.org";
    expect(pdfDownloadName(readPolicy(policyDir({ full_name: FULL_NAME, contact })))).toBe(NAMED);
    expect(pdfDownloadName(readPolicy(policyDir({ full_name: FULL_NAME, contact: null })))).toBe(PDF_FILE_FALLBACK);
    expect(pdfDownloadName(readPolicy(policyDir({ full_name: null, contact })))).toBe(PDF_FILE_FALLBACK);
    expect(pdfDownloadName(readPolicy(policyDir()))).toBe(PDF_FILE_FALLBACK);
  });

  it("is, under main's header in this tree, the file name the Author asked for in spec.md, word for word", () => {
    const spec = readFileSync(join(REPO, "specs/002-the-room/spec.md"), "utf8");
    const asked = /in the resume directory: "([^"]+)"/.exec(spec)?.[1];
    expect(asked).toMatch(/^[\p{L}-]+-Resume-hareet-ai\.pdf$/u);
    expect(pdfDownloadName(readPolicy(join(REPO, "assets/policy")))).toBe(asked);
  });
});

describe("the links", () => {
  it("name the fallback where the build defines no name, as in these tests", async () => {
    expect(pdfFileName()).toBe(PDF_FILE_FALLBACK);
    expect(await scriptedLinks()).toEqual([
      ["Download the resume (PDF)", PDF_FILE_FALLBACK],
      ["Download the resume (PDF)", PDF_FILE_FALLBACK],
      ["Download (PDF)", PDF_FILE_FALLBACK],
    ]);
  });

  it("name what the build defines, each of them", async () => {
    vi.stubGlobal("__PDF_FILE_NAME__", NAMED);
    expect(pdfFileName()).toBe(NAMED);
    expect(await scriptedLinks()).toEqual([
      ["Download the resume (PDF)", NAMED],
      ["Download the resume (PDF)", NAMED],
      ["Download (PDF)", NAMED],
    ]);
  });

  it("include the first screen's plain link, which holds the fallback in the source", () => {
    const doc = new JSDOM(readFileSync(INDEX, "utf8")).window.document;
    expect(named(doc)).toEqual([["Download the resume (PDF)", PDF_FILE_FALLBACK]]);
  });
});

describe("a build under a filled header", () => {
  it("writes the name into index.html's link and the scripts, and leaves no placeholder", async () => {
    const site = await buildSite({
      drafts: false,
      policy: policyDir({ full_name: FULL_NAME, contact: "robin@example.org" }),
    });
    try {
      const doc = new JSDOM(readFileSync(join(site.out, "index.html"), "utf8")).window.document;
      expect(named(doc)).toEqual([["Download the resume (PDF)", NAMED]]);
      const scripts = Object.keys(site.chunks).map((name) => readFileSync(join(site.out, name), "utf8"));
      expect(scripts.some((text) => text.includes(NAMED))).toBe(true);
      expect(scripts.some((text) => text.includes("__PDF_FILE_NAME__"))).toBe(false);
    } finally {
      site.remove();
    }
  });
});
