// T021 (spec 002; FR-014, FR-015; contracts/resume-source.md §2): the citation check, C1–C9, against the fixture
// corpus in test/fixtures/corpus/ (a made-up topic in the real corpus's shape, about no one). Each rule has a failing
// case, reported as `<item-id>: <reason>`, at the item's first problem; a clean source passes. C9's private denylist is
// a temporary file here, so no "private" fixture is ever committed, and its phrase is never printed.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { checkSource, forbiddenList, parseResume } from "../../build/content";

const ROOT = fileURLToPath(new URL("../fixtures", import.meta.url));
const FIXTURE = "corpus/01-fixture.md";
const DESIGNED = "Robin designed the lantern service for the fixture clinic";

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

type Claim = { file: string; quote: string };
type ItemIn = { id: string; text: string; verb?: string; claims: Claim[]; slots?: string[] };

const cite = (quote: string, file = FIXTURE): Claim => ({ file, quote });
/** Shared objects are written out in full: the source refuses aliases. */
const NO_ALIASES = { aliasDuplicateObjects: false } as const;

/** A source with the fixture's clean header and one section holding the given items, through YAML and the parser. */
function source(items: ItemIn[], header?: { name?: string; lines?: { text: string; claims: Claim[] }[] }) {
  const doc = {
    version: 1,
    header: {
      room: {
        name: header?.name ?? "Robin",
        lines: header?.lines ?? [
          { text: "Lighthouse keeping by background", claims: [cite("Robin's background is lighthouse keeping")] },
        ],
      },
    },
    sections: [{ id: "work", title: "Work", items: items.map((i) => ({ slots: [], ...i })) }],
  };
  return parseResume(stringify(doc, NO_ALIASES));
}

function problems(items: ItemIn[], options: { fullName?: string | null; denylist?: string } = {}): string[] {
  return checkSource(source(items), { root: ROOT, ...options }).problems;
}

const CLEAN: ItemIn = {
  id: "lantern",
  text: "Designed the lantern service for the fixture clinic.{{slot:fixture.lanterns}}",
  verb: "designed",
  claims: [cite(DESIGNED)],
  slots: ["fixture.lanterns"],
};

/** The 1-based line of the fixture file that holds the text. */
function lineOf(file: string, text: string): number {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const n = lines.findIndex((l) => l.includes(text));
  if (n < 0) throw new Error(`fixture ${file} has no line with ${text}`);
  return n + 1;
}

describe("a clean source", () => {
  it("passes every rule", () => {
    expect(problems([CLEAN])).toEqual([]);
  });

  it("finds a quote after collapsing its whitespace and the file's", () => {
    expect(problems([{ ...CLEAN, claims: [cite("Robin  designed the lantern\nservice")] }])).toEqual([]);
  });

  it("takes a [P] sentence for a fact about a system, without an ownership verb", () => {
    const item = { id: "tide", text: "The tide clock runs on a public server.", claims: [cite("on a public server")] };
    expect(problems([{ ...item, claims: [cite("The tide clock was built on a public server")] }])).toEqual([]);
  });
});

describe("C1, a corpus file", () => {
  it.each([
    "corpus/intake/notes.md",
    "corpus/proposals/idea.md",
    "corpus/facts/fixture.yaml",
    "corpus/../corpus/01-fixture.md",
    "corpus/missing.md",
    "docs/elsewhere.md",
    "/corpus/01-fixture.md",
    "corpus/01-fixture.txt",
    "corpus/README.md",
    "corpus/INTAKE.md",
  ])("refuses %s", (file) => {
    expect(problems([{ ...CLEAN, id: "c1", claims: [cite(DESIGNED, file)] }])).toEqual(["c1: not a corpus file"]);
  });
});

describe("C2, the quote in one sentence", () => {
  it.each([
    ["absent from the file", "Robin designed the moon"],
    ["across two sentences", "for the fixture clinic. Ownership"],
    ["shorter than 12 characters", "Robin built"],
  ])("fails a quote %s", (_why, quote) => {
    expect(problems([{ ...CLEAN, id: "c2", claims: [cite(quote)] }])).toEqual(["c2: quote not found"]);
  });
});

describe("C3, a tagged span", () => {
  it("fails a quote before the line's first tag, though a later sentence on the line is tagged", () => {
    const item = { id: "c3", text: "Mentions the harbor map.", claims: [cite("mentions the untagged harbor map")] };
    expect(problems([item])).toEqual(["c3: untagged sentence"]);
  });

  it("fails a bullet whose only tag is on its heading", () => {
    const item = { id: "c3h", text: "A heading's tag.", claims: [cite("The heading carries the tag")] };
    expect(problems([item])).toEqual(["c3h: untagged sentence"]);
  });

  it("reads a backticked bracket that isn't a tag, like the README's `[A date]`, as text", () => {
    const item = { id: "c3t", text: "The README's example.", claims: [cite("here is the README's own example")] };
    expect(problems([item])).toEqual(["c3t: untagged sentence"]);
  });

  it("reads the README's example tag `[A-DOC <name>]` as text too: only real tags count", () => {
    const item = { id: "c3d", text: "A placeholder.", claims: [cite("Robin wrote a placeholder tag on this line")] };
    expect(problems([item])).toEqual(["c3d: untagged sentence"]);
  });
});

describe("C4, the span's own tag", () => {
  it("fails a role claim from a [P] span, on a line whose other sentence's [A] tag would suffice", () => {
    const item = {
      id: "c4",
      text: "Built the tide clock on a public server.",
      verb: "built",
      claims: [cite("The tide clock was built on a public server")],
    };
    expect(problems([item])).toEqual(["c4: tag not sufficient"]);
    // The same line's [A] sentence is sufficient for the same claim.
    expect(problems([{ ...item, claims: [cite("Robin built the tide clock for the harbor office")] }])).toEqual([]);
  });

  it("fails a gap, [?], with or without a verb", () => {
    const quote = "Whether the lantern service reached the northern islands";
    expect(problems([{ id: "c4g", text: "Reached the islands.", claims: [cite(quote)] }])).toEqual([
      "c4g: tag not sufficient",
    ]);
  });

  it("fails a job description's role scope, [A-JD], for an ownership claim", () => {
    const item = {
      id: "c4j",
      text: "Built new lantern fleets.",
      verb: "built",
      claims: [cite("The role covers maintaining lantern fleets")],
    };
    expect(problems([item])).toEqual(["c4j: tag not sufficient"]);
  });
});

describe("C5, the Do not claim section", () => {
  it("fails a tagged sentence under a Do not claim heading", () => {
    const item = { id: "c5", text: "An old lantern.", claims: [cite("The lantern predates Robin by a century")] };
    expect(problems([item])).toEqual(["c5: do-not-claim section"]);
  });
});

describe("C6, numbers only from slots", () => {
  it("fails a digit in the display text", () => {
    expect(problems([{ ...CLEAN, id: "c6", text: "Designed the lantern service for 12 lanterns." }])).toEqual([
      "c6: bare number",
    ]);
  });

  it("fails a digit in a slot's fallback, which would be a number no slot holds", () => {
    const item = {
      ...CLEAN,
      id: "c6f",
      text: "Designed the lantern service.{{slot:fixture.empty | else: about 3 coves}}",
      slots: ["fixture.empty"],
    };
    expect(problems([item])).toEqual(["c6f: bare number"]);
  });
});

describe("C7, slots that exist", () => {
  it("fails a slot reference that names no fact", () => {
    const item = {
      ...CLEAN,
      id: "c7",
      text: "Designed the lantern service.{{slot:fixture.nope}}",
      slots: ["fixture.nope"],
    };
    expect(problems([item])).toEqual(["c7: unknown slot"]);
  });

  it("fails a slots entry that names no fact", () => {
    expect(problems([{ ...CLEAN, id: "c7s", slots: ["fixture.lanterns", "fixture.nope"] }])).toEqual([
      "c7s: unknown slot",
    ]);
  });
});

describe("C8, the ownership verb", () => {
  it("fails a verb the display text doesn't use", () => {
    expect(problems([{ ...CLEAN, id: "c8", verb: "built" }])).toEqual(["c8: ownership verb not cited"]);
  });

  it("fails a verb no cited sentence uses", () => {
    const item = { ...CLEAN, id: "c8c", verb: "built", text: "Built the lantern service for the fixture clinic." };
    expect(problems([item])).toEqual(["c8c: ownership verb not cited"]);
  });

  it("fails any ownership verb in the text that the cited sentence holds only as a noun phrase", () => {
    // The corpus says "his design of its face"; "Designed its face" turns the noun into a second ownership claim.
    const quote = "his design of its face won the harbor prize";
    const item = {
      id: "c8n",
      text: "Keeper of the tide clock. Designed its face, which won the harbor prize.",
      claims: [cite(quote)],
    };
    expect(problems([item])).toEqual(["c8n: ownership verb not cited"]);
    expect(problems([{ ...item, verb: "designed" }])).toEqual(["c8n: ownership verb not cited"]);
    // In the corpus's own words, the noun phrase stays a noun phrase.
    const kept = { ...item, text: "Keeper of the tide clock; his design of its face won the harbor prize." };
    expect(problems([kept])).toEqual([]);
  });

  it("holds the corpus's other act verbs too, like released, and never makes an agentless passive an act", () => {
    // The narration review (2026-10-18): "Built by Robin and released ..." names who built it, not who released it.
    const lamp = "The night lamp was designed by Robin and released to the docks";
    const item = { id: "c8a", text: "Designed the night lamp and released it to the docks.", claims: [cite(lamp)] };
    expect(problems([item])).toEqual(["c8a: passive made active"]);
    expect(problems([{ ...item, text: "The night lamp, designed by Robin and released to the docks." }])).toEqual([]);
    const released = { ...CLEAN, id: "c8r", text: "Designed and released the lantern service for the fixture clinic." };
    expect(problems([released])).toEqual(["c8r: ownership verb not cited"]);
  });
});

describe("C9, forbidden phrases", () => {
  it("fails a Do not claim key phrase, naming its source line", () => {
    const item = { id: "c9", text: "Invented the lantern for the fixture clinic.", claims: [cite(DESIGNED)] };
    const line = lineOf(FIXTURE, "That Robin invented the lantern");
    expect(problems([item])).toEqual([`c9: forbidden phrase (from ${FIXTURE}:${line})`]);
  });

  it("checks each alternative of a bullet that joins them with or, carrying its verb to the next", () => {
    const line = lineOf(FIXTURE, "That Robin built the tide clock alone or the harbor bell");
    for (const [id, text] of [
      ["c9a", "Built the tide clock alone, at night."],
      ["c9b", "Built the harbor bell for the docks."],
    ] as const) {
      // Cited from a sentence that says "built", so C8 passes and C9 is the rule that answers.
      const claims = [cite("Robin built the tide clock for the harbor office")];
      expect(problems([{ id, text, claims }])).toEqual([`${id}: forbidden phrase (from ${FIXTURE}:${line})`]);
    }
    const { list } = forbiddenList({ root: ROOT, roomName: "Robin", fullName: null });
    expect(list).toContainEqual({ phrase: "built the tide clock alone", source: `${FIXTURE}:${line}` });
    expect(list).toContainEqual({ phrase: "built the harbor bell", source: `${FIXTURE}:${line}` });
    expect(list.map((f) => f.phrase)).not.toContain("the harbor bell");
  });

  it("fails the surname, from the PDF header's full name, without printing it", () => {
    const item = { id: "c9s", text: "Designed the lantern service, as Quillfeather.", claims: [cite(DESIGNED)] };
    expect(problems([item])).toEqual([]);
    const found = problems([item], { fullName: "Robin Quillfeather" });
    expect(found).toEqual(["c9s: forbidden phrase (from the surname rule)"]);
    expect(found.join("\n")).not.toMatch(/quillfeather/i);
  });

  it("fails a private denylist phrase, reported by its line alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "h4-denylist-"));
    made.push(dir);
    const denylist = join(dir, "denylist.txt");
    writeFileSync(denylist, "# one phrase per line\nCobalt Harbor\n");
    const item = { id: "c9d", text: "Designed the lantern service near cobalt  harbor.", claims: [cite(DESIGNED)] };
    const result = checkSource(source([item]), { root: ROOT, denylist });
    expect(result.problems).toEqual(["c9d: forbidden phrase (from corpus/intake/private/denylist.txt:2)"]);
    expect(result.problems.join("\n")).not.toMatch(/cobalt/i);
    expect(result.denylist).toBe("applied");
    expect(checkSource(source([item]), { root: ROOT, denylist: join(dir, "absent.txt") }).denylist).toBe("missing");
  });

  it("checks the room's header too", () => {
    const bad = source([CLEAN], { name: "Robin Quillfeather" });
    expect(checkSource(bad, { root: ROOT, fullName: "Robin Quillfeather" }).problems).toEqual([
      "header.name: forbidden phrase (from the surname rule)",
    ]);
    const line = source([CLEAN], { lines: [{ text: "Keeper of lamps", claims: [cite("Robin keeps lamps lit")] }] });
    expect(checkSource(line, { root: ROOT }).problems).toEqual(["header.lines[0]: quote not found"]);
  });

  it("assembles the list narration's N3 shares: each Do not claim bullet's key phrase, with its line", () => {
    const { list } = forbiddenList({ root: ROOT, roomName: "Robin", fullName: null });
    expect(list).toContainEqual({
      phrase: "invented the lantern",
      source: `${FIXTURE}:${lineOf(FIXTURE, "invented")}`,
    });
    expect(list).toContainEqual({
      phrase: "sole ownership of the harbor map",
      source: `${FIXTURE}:${lineOf(FIXTURE, "Sole ownership")}`,
    });
    expect(list).toContainEqual({
      phrase: "the logbook is official",
      source: `corpus/02-other.md:${lineOf("corpus/02-other.md", "logbook is official")}`,
    });
    expect(list.every((f) => /^corpus\/\d{2}-[^/]+\.md:\d+$/.test(f.source))).toBe(true);
  });
});

describe("the first problem", () => {
  it("is the only one reported for an item, in the rules' order", () => {
    const item = {
      ...CLEAN,
      id: "first",
      text: "Lit 12 lanterns.",
      claims: [cite(DESIGNED, "docs/x.md"), cite("nope")],
    };
    expect(problems([item])).toEqual(["first: not a corpus file"]);
  });

  it("is reported for every item that has one", () => {
    const a = { ...CLEAN, id: "item-a", text: "Lit 12 lanterns." };
    const b = { ...CLEAN, id: "item-b", claims: [cite("Robin designed the moon")] };
    expect(problems([CLEAN, a, b])).toEqual(["item-a: bare number", "item-b: quote not found"]);
  });
});

describe("the source's shape", () => {
  const base = { version: 1, header: { room: { name: "Robin", lines: [] } }, sections: [] };
  it.each([
    ["a version other than 1", { ...base, version: 2 }, /version/],
    ["a bad item ID", { ...base, sections: [{ id: "work", title: "W", items: [{ ...CLEAN, id: "Bad ID" }] }] }, /id/],
    ["a duplicate item ID", { ...base, sections: [{ id: "work", title: "W", items: [CLEAN, CLEAN] }] }, /duplicate/],
    [
      "an item without claims",
      { ...base, sections: [{ id: "work", title: "W", items: [{ ...CLEAN, claims: [] }] }] },
      /claims/,
    ],
    [
      "display text over 400 characters",
      { ...base, sections: [{ id: "work", title: "W", items: [{ ...CLEAN, text: "a".repeat(401) }] }] },
      /400/,
    ],
    [
      "a verb that isn't an ownership verb",
      { ...base, sections: [{ id: "work", title: "W", items: [{ ...CLEAN, verb: "invented" }] }] },
      /verb/,
    ],
    [
      "a slot the text uses but slots doesn't list",
      { ...base, sections: [{ id: "work", title: "W", items: [{ ...CLEAN, slots: [] }] }] },
      /slots/,
    ],
    ["an unknown key", { ...base, extra: true }, /extra/],
  ])("refuses %s", (_why, doc, why) => {
    expect(() => parseResume(stringify(doc, NO_ALIASES))).toThrow(why);
  });

  it("refuses YAML aliases", () => {
    const text = stringify(base).replace("sections: []", "x: &a 1\nsections: []\ny: *a");
    expect(() => parseResume(text)).toThrow(/alias/);
  });
});
