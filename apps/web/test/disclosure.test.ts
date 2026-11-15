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

/** Spec 016's V1 (its FR-053; Amendment M17): its Carries' avatar files, which replace spec 009's M6 words, and its
 *  Why's addition, each in the spec's own words, from its Data-Flow Disclosure Entries table. */
function amendmentM17(): { carries: string; why: string; trigger: string } {
  const spec = readFileSync(resolve(WEB, "../../specs/016-the-twins-own-avatar/spec.md"), "utf8");
  const row = markdownTables(spec)
    .flatMap((t) => t.slice(1))
    .find((r) => r[0] === "V1, amended (M17)");
  const carries = /^as before, with (the avatar files now: .*)$/.exec(row?.[3] ?? "")?.[1];
  const why = /^as before: the room's static assets and pages; (.*)$/.exec(row?.[5] ?? "")?.[1];
  const trigger = /^as before, (and following .*)$/.exec(row?.[2] ?? "")?.[1];
  if (!carries || !why || !trigger) throw new Error("spec 016's V1 doesn't read as this test reads it");
  return { carries: `and ${carries}`, why, trigger };
}

/** Spec 018's Amendment H-11 (its FR-003): V1's Carries gains the twin's still in a 3D visit, once, when the split
 *  layout's conversation panel first opens, right after M17's words for the still (its T029; plan.md §13). */
function amendmentH11(carries: string): string {
  const spec = readFileSync(resolve(WEB, "../../specs/018-better-hud-and-load-screen/spec.md"), "utf8");
  if (!spec.includes("| H-11 | Data-flow disclosure, row V1 |"))
    throw new Error("spec 018's H-11 doesn't read as this test reads it");
  const still = "the twin's still in a visit that shows the 2D room";
  if (carries.split(still).length !== 2) throw new Error("spec 016's M17 doesn't name the still once");
  return carries.replace(
    still,
    `${still}, or, in a 3D visit, once, when the conversation panel first opens in the split layout (spec 018)`,
  );
}

/** Spec 025's FR-028: V1's Carries names the room's dog's model and clips among the avatar files fetched, in the
 *  requirement's own words, right after M17's words for the twin's model and clips (its T015; plan.md R-12). */
function amendment025(carries: string): string {
  const spec = readFileSync(resolve(WEB, "../../specs/025-twin-and-dog-run-from-dino/spec.md"), "utf8");
  const dog = /among the avatar files fetched, (the room's dog's .*?, the same for every visitor);/.exec(spec)?.[1];
  if (dog === undefined) throw new Error("spec 025's FR-028 doesn't read as this test reads it");
  const twin = "the twin's model and clips in every 3D visit above the floor, the same for every visitor; ";
  if (carries.split(twin).length !== 2) throw new Error("spec 016's M17 doesn't name the twin's model and clips once");
  return carries.replace(twin, `${twin}${dog}; `);
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
    // Spec 016's M17 replaces M6's avatar files in V1's Carries, and adds to its Trigger and Why, in its own words
    // (changed with T073, plan.md R-18); spec 018's H-11 adds the still in a 3D visit to its Carries, and spec 025's
    // FR-028 the room's dog's model and clips.
    const m17 = amendmentM17();
    for (const id of ["V1", "V4"]) {
      const entry = entries.get(id);
      const row = rows.get(id);
      expect(entry, id).toBeDefined();
      const carries = id === "V1" ? `${entry?.[2] ?? ""}, ${amendment025(amendmentH11(m17.carries))}` : entry?.[2];
      const why = id === "V1" ? `${entry?.[4] ?? ""}; ${m17.why}` : entry?.[4];
      expect(row?.slice(3, 6), id).toEqual([carries, entry?.[3], why]);
    }
    expect(rows.get("V1")?.[2]).toContain(m17.trigger);
  });

  it("names the walking view in row V4's trigger, its first entry in a visit (spec 008, Amendment M4)", () => {
    const rows = new Map(
      markdownTables(SOURCE)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    expect(rows.get("V4")?.[2]).toContain("the visitor first entering the walking view in a visit");
  });

  it("names full screen's first entry in row V4's trigger, before spec 009's closing clause (spec 005, H9)", () => {
    const rows = new Map(
      markdownTables(SOURCE)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    const trigger = rows.get("V4")?.[2] ?? "";
    const words = ", the visitor first entering full screen in a visit";
    expect(trigger).toContain(words);
    expect(trigger.indexOf(words)).toBeLessThan(
      trigger.indexOf(", and a figure's avatar failing to load, once a visit"),
    );
    expect(trigger.indexOf(words)).toBeGreaterThan(
      trigger.indexOf("the visitor first entering the walking view in a visit"),
    );
  });

  it("names the loader cut short in row V4's trigger, before spec 009's closing clause (spec 012, L5)", () => {
    const rows = new Map(
      markdownTables(SOURCE)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    const trigger = rows.get("V4")?.[2] ?? "";
    const words = ", the loader giving way at its ceiling while the room's files are still loading, once a visit";
    expect(trigger).toContain(words);
    expect(trigger.indexOf(words)).toBeLessThan(
      trigger.indexOf(", and a figure's avatar failing to load, once a visit"),
    );
    expect(trigger.indexOf(words)).toBeGreaterThan(
      trigger.indexOf(", the visitor first entering full screen in a visit"),
    );
  });

  it("names the avatar files in V1, whose paths show the choice, and avatar_failed's trigger in V4 (spec 009, M6)", () => {
    const rows = new Map(
      markdownTables(SOURCE)
        .flatMap((t) => t.slice(1))
        .map((row) => [row[0], row] as const),
    );
    const { v1, v4 } = amendmentM6();
    expect(v1).toMatch(/^and the avatar files: .*whose paths show which avatar the visitor chose$/);
    // Spec 016's M17 words in its place: the twin's own files, its still, the stand-in's on failure (T073).
    const { carries } = amendmentM17();
    expect(carries).toMatch(
      /^and the avatar files now: the twin's model and clips .*whose paths show which avatar the visitor chose$/,
    );
    expect(rows.get("V1")?.[3]).toContain(amendment025(amendmentH11(carries)));
    expect(rows.get("V1")?.[3]).not.toContain(v1);
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
