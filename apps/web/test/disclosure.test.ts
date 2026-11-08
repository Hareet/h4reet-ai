// T010 (spec 002; FR-004, FR-058): the disclosure page is docs/data-flow-disclosure.md, rendered at build. Its
// table rows are the Markdown's, cell for cell, read here by a parser of this test's own, so the renderer can't
// agree with itself; and nothing in the Markdown becomes markup the author didn't write.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { renderDisclosure } from "../build/disclosure";

const WEB = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SOURCE = readFileSync(resolve(WEB, "../../docs/data-flow-disclosure.md"), "utf8");

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** The text a reader sees in a Markdown cell: code spans and bold lose their marks, and a code span's content,
 * asterisks included (S5's `****`), stays as written. */
const plain = (cell: string): string =>
  collapse(
    cell
      .split(/(`[^`]*`)/)
      .map((part, i) => (i % 2 === 1 ? part.slice(1, -1) : part.replace(/\*\*/g, "")))
      .join(""),
  );

/** Each pipe table's rows, as plain cell text, header first, the delimiter row dropped. */
function markdownTables(md: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] | null = null;
  for (const line of md.split("\n")) {
    if (line.trimStart().startsWith("|")) {
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      if (cells.every((c) => /^\s*:?-{3,}:?\s*$/.test(c))) continue;
      if (current === null) tables.push((current = []));
      current.push(cells.map(plain));
    } else {
      current = null;
    }
  }
  return tables;
}

/** Spec 009's Amendment M6, in its own words: what V1's Carries gains, after "and", and what V4's Trigger gains. */
function amendmentM6(): { v1: string; v4: string } {
  const spec = readFileSync(resolve(WEB, "../../specs/009-room-avatars/spec.md"), "utf8");
  const row = markdownTables(spec)
    .flatMap((t) => t.slice(1))
    .find((r) => r[0] === "M6");
  const change = row?.[2] ?? "";
  const v1 = /V1's Carries gains "([^"]+)"/.exec(change)?.[1];
  const v4 = /V4's Trigger gains "([^"]+)"/.exec(change)?.[1];
  if (v1 === undefined || v4 === undefined) throw new Error("spec 009's M6 doesn't read as this test reads it");
  return { v1: `and ${v1}`, v4 };
}

function htmlTables(html: string): string[][][] {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll("table")].map((table) =>
    [...table.querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("th, td")].map((cell) => collapse(cell.textContent ?? "")),
    ),
  );
}

describe("the disclosure page", () => {
  it("holds the Markdown's rows, cell for cell, in order", () => {
    // The parser above splits on every pipe: the disclosure escapes none, and this keeps it so.
    expect(SOURCE).not.toContain("\\|");
    const expected = markdownTables(SOURCE);
    expect(expected.length).toBeGreaterThan(0);
    expect(htmlTables(renderDisclosure(SOURCE))).toEqual(expected);
  });

  it("lists every row ID the Markdown has, spec 000's and the room's", () => {
    const ids = htmlTables(renderDisclosure(SOURCE)).flatMap((t) => t.slice(1).map((row) => row[0]));
    for (const id of ["S1", "S14", "F1", "D3", "V1", "V4"]) expect(ids).toContain(id);
  });

  it("gives the room's rows what the spec's entries carry, never carry, and why, in the spec's own words", () => {
    // spec.md's Data-Flow Disclosure Entries: ID | From → To | Carries | Never carries | Why. The disclosure adds
    // Trigger after From → To, so its Carries, Never carries, and Why are columns 3 to 5 (FR-058; T062 for V4). Spec
    // 009's Amendment M6 adds to V1's Carries, in its own words, and to V4's Trigger, which spec 002's entry lacks.
    const spec = readFileSync(resolve(WEB, "../../specs/002-the-room/spec.md"), "utf8");
    const entries = new Map(
      markdownTables(spec)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    const rows = new Map(
      markdownTables(SOURCE)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    const { v1 } = amendmentM6();
    for (const id of ["V1", "V4"]) {
      const entry = entries.get(id);
      const row = rows.get(id);
      expect(entry, id).toBeDefined();
      const carries = id === "V1" ? `${entry?.[2] ?? ""}, ${v1}` : entry?.[2];
      expect(row?.slice(3, 6), id).toEqual([carries, ...(entry?.slice(3, 5) ?? [])]);
    }
  });

  it("names the walking view in row V4's trigger, its first entry in a visit (spec 008, Amendment M4)", () => {
    const rows = new Map(
      markdownTables(SOURCE)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    expect(rows.get("V4")?.[2]).toContain("the visitor first entering the walking view in a visit");
  });

  it("names the avatar files in V1, whose paths show the choice, and avatar_failed's trigger in V4 (spec 009, M6)", () => {
    const rows = new Map(
      markdownTables(SOURCE)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    const { v1, v4 } = amendmentM6();
    expect(v1).toMatch(/^and the avatar files: .*whose paths show which avatar the visitor chose$/);
    expect(rows.get("V1")?.[3]).toContain(v1);
    expect(v4).toBe("and a figure's avatar failing to load, once a visit");
    expect(rows.get("V4")?.[2]?.endsWith(`, ${v4}`)).toBe(true);
  });

  it("puts header cells in th and body cells in td", () => {
    const doc = new JSDOM(renderDisclosure("| ID | Why |\n|---|---|\n| X1 | because |\n")).window.document;
    expect([...doc.querySelectorAll("thead th")].map((c) => c.textContent)).toEqual(["ID", "Why"]);
    expect([...doc.querySelectorAll("tbody td")].map((c) => c.textContent)).toEqual(["X1", "because"]);
  });

  it("renders headings, paragraphs, code, and bold, and escapes everything else", () => {
    const md = [
      "# Title & <b>more</b>",
      "",
      "Text with `<script>alert(1)</script>` and **bold** and a <img src=x onerror=alert(1)>.",
      "",
      "| A | B |",
      "|---|---|",
      '| `make down ENV=<stack>` | "quoted" & <i>raw</i> |',
    ].join("\n");
    const doc = new JSDOM(renderDisclosure(md)).window.document;
    expect(doc.querySelector("main h1")?.textContent).toBe("Title & <b>more</b>");
    expect(doc.querySelector("main p code")?.textContent).toBe("<script>alert(1)</script>");
    expect(doc.querySelector("main p strong")?.textContent).toBe("bold");
    // Only the markup the renderer writes: no script, image, bold or italic element came from the text.
    expect(doc.querySelectorAll("script, img, b, i")).toHaveLength(0);
    expect(doc.querySelector("td code")?.textContent).toBe("make down ENV=<stack>");
    expect(doc.querySelectorAll("td")[1]?.textContent).toBe('"quoted" & <i>raw</i>');
  });

  it("is a page of the site: English, titled, the AI disclosure on it, a way back, its own stylesheet only", () => {
    const doc = new JSDOM(renderDisclosure(SOURCE)).window.document;
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
    expect(doc.title).toBe("Data-flow disclosure");
    expect(doc.body.textContent).toContain("You're talking with an AI representation of the Author, not the Author.");
    expect([...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("../");
    expect([...doc.querySelectorAll("link")].map((l) => l.getAttribute("href"))).toEqual(["style.css"]);
    expect(doc.querySelectorAll("script, style, [style]")).toHaveLength(0);
  });

  it("is the same bytes for the same source", () => {
    expect(renderDisclosure(SOURCE)).toBe(renderDisclosure(SOURCE));
  });
});
