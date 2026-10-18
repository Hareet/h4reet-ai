// T050 and T052 (spec 002; FR-011, FR-012, FR-014 to FR-016; contracts/narration.md §1 to §3; data-model.md §3 and
// §5): the narration scripts, against the fixture corpus in test/fixtures/corpus/ (a made-up topic about no one).
//   N1  the resume's C1–C8 on each script's citations and words, with its item's ownership verb
//   N2  one script per item and path, and none for an item the resume doesn't have
//   N3  no forbidden phrase: the corpus's "Do not claim" key phrases, the surname rule, and the private denylist, the
//       last reported by its line alone
//   N4  at most 900 characters
//   N5  one eval case per script, with only public "Do not claim" phrases in expect.not_contains
// and the scripts' place in room-data.json: under their item, per path, only when published. A private denylist is a
// temporary file here, so no "private" fixture is ever committed, and its phrase is never printed.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { contentFiles, readPolicy, roomData, type RoomData } from "../../build/approvals";
import {
  checkLock,
  checkSource,
  computeLock,
  parseResume,
  readLock,
  RESUME_PATH,
  resumePart,
  writeLock,
} from "../../build/content";
import { CASES_DIR, checkNarration, MAX_CHARS, narrationCases, narrationPart } from "../../build/narration";
import { NARRATION_DIR, parseScript, readScripts } from "../../build/narration-source";

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const FILE = "corpus/01-fixture.md";
const OTHER = "corpus/02-other.md";
const DESIGNED = "Robin designed the lantern service for the fixture clinic";
const RAN = "The lantern service has run every night since its launch";
const PUBLIC_SERVER = "The tide clock was built on a public server";

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

type Claim = { file: string; quote: string };
const cite = (quote: string, file = FILE): Claim => ({ file, quote });

/** The fixture's resume: `lantern`, a role claim (designed), and `tide`, a fact about a system with no verb. */
function resumeText(): string {
  return stringify({
    version: 1,
    header: {
      room: {
        name: "Robin",
        lines: [{ text: "Lighthouse keeping by background", claims: [cite("lighthouse keeping")] }],
      },
    },
    sections: [
      {
        id: "work",
        title: "Work",
        items: [
          {
            id: "lantern",
            text: "Designed the lantern service.",
            verb: "designed",
            claims: [cite(DESIGNED)],
            slots: [],
          },
          { id: "tide", text: "The tide clock runs on a public server.", claims: [cite(PUBLIC_SERVER)], slots: [] },
        ],
      },
    ],
  });
}

/** A script's file: its front matter, then its words. */
function script(item: string, path: string, claims: Claim[], words: string, slots: string[] = []): string {
  return `---\n${stringify({ item, path, claims, slots })}---\n${words}\n`;
}

const CLEAN: Record<string, string> = {
  "lantern.engineer.md": script(
    "lantern",
    "engineer",
    [cite(DESIGNED), cite(RAN)],
    `${DESIGNED}. ${RAN}.{{slot:fixture.lanterns}}`,
    ["fixture.lanterns"],
  ),
  "lantern.non-engineer.md": script(
    "lantern",
    "non-engineer",
    [cite(DESIGNED)],
    `${DESIGNED}, so the harbor stays lit.`,
  ),
  "tide.engineer.md": script(
    "tide",
    "engineer",
    [cite(PUBLIC_SERVER)],
    `${PUBLIC_SERVER}, where the docks can read it.`,
  ),
  "tide.non-engineer.md": script("tide", "non-engineer", [cite(PUBLIC_SERVER)], `${PUBLIC_SERVER}.`),
};

/** CLEAN without one script. */
const without = (name: string): Record<string, string> =>
  Object.fromEntries(Object.entries(CLEAN).filter(([n]) => n !== name));

/** A repository root: the fixture corpus, the resume, its scripts, and a lock over both. */
function tree(scripts: Record<string, string> = CLEAN, resume: string | null = resumeText()): string {
  const root = mkdtempSync(join(tmpdir(), "h4-narration-"));
  made.push(root);
  cpSync(join(FIXTURES, "corpus"), join(root, "corpus"), { recursive: true });
  mkdirSync(join(root, NARRATION_DIR), { recursive: true });
  if (resume !== null) writeFileSync(join(root, RESUME_PATH), resume);
  for (const [name, text] of Object.entries(scripts)) writeFileSync(join(root, NARRATION_DIR, name), text);
  try {
    if (resume !== null) writeLock(root, computeLock(root, parseResume(resume)));
  } catch {
    // A tree whose scripts don't parse has no lock; the check reports why.
  }
  return root;
}

function check(root: string, options: { fullName?: string | null; denylist?: string } = {}) {
  const source = parseResume(readFileSync(join(root, RESUME_PATH), "utf8"));
  return checkNarration(source, readScripts(root), { root, ...options });
}

const problems = (scripts: Record<string, string>, options: { fullName?: string | null; denylist?: string } = {}) =>
  check(tree(scripts), options).problems;

/** The 1-based line of a fixture file that holds the text. */
function lineOf(file: string, text: string): number {
  const n = readFileSync(join(FIXTURES, file), "utf8")
    .split("\n")
    .findIndex((l) => l.includes(text));
  if (n < 0) throw new Error(`fixture ${file} has no line with ${text}`);
  return n + 1;
}

describe("a clean set of scripts", () => {
  it("passes every check", () => {
    expect(problems(CLEAN)).toEqual([]);
  });

  it("reads each script's front matter and words", () => {
    const scripts = readScripts(tree());
    expect(scripts.map((s) => [s.file, s.item, s.path])).toEqual([
      [`${NARRATION_DIR}/lantern.engineer.md`, "lantern", "engineer"],
      [`${NARRATION_DIR}/lantern.non-engineer.md`, "lantern", "non-engineer"],
      [`${NARRATION_DIR}/tide.engineer.md`, "tide", "engineer"],
      [`${NARRATION_DIR}/tide.non-engineer.md`, "tide", "non-engineer"],
    ]);
    expect(scripts[1]?.body).toBe(`${DESIGNED}, so the harbor stays lit.`);
    expect(scripts[0]?.slots).toEqual(["fixture.lanterns"]);
  });
});

describe("N2, one script per item and path", () => {
  it("fails an item without a path's script, naming the file it needs", () => {
    expect(problems(without("tide.engineer.md"))).toEqual([
      "narration/tide.engineer.md: missing (each item needs a script for each path)",
    ]);
  });

  it("fails a script for an item the resume doesn't have", () => {
    const ghost = script("ghost", "engineer", [cite(DESIGNED)], `${DESIGNED}.`);
    expect(problems({ ...CLEAN, "ghost.engineer.md": ghost })).toEqual([
      "narration/ghost.engineer.md: names an item the resume doesn't have",
    ]);
  });

  it("fails every script when the tree has no resume", () => {
    const root = tree(CLEAN, null);
    expect(checkNarration(null, readScripts(root), { root }).problems).toHaveLength(4);
  });
});

describe("the script's file (contracts/narration.md §1)", () => {
  const good = CLEAN["lantern.engineer.md"] as string;
  it.each([
    ["a name that isn't <item>.<path>.md", "lantern.md", good, /isn't <item-id>\.<path>\.md/],
    ["a path other than the two", "lantern.manager.md", good, /isn't <item-id>\.<path>\.md/],
    ["an item ID with capitals", "Lantern.engineer.md", good, /isn't <item-id>\.<path>\.md/],
    ["front matter naming another item", "tide.engineer.md", good, /says item lantern/],
    ["front matter naming another path", "lantern.non-engineer.md", good, /says path engineer/],
    ["no front matter", "lantern.engineer.md", `${DESIGNED}.\n`, /front matter/],
    ["an unknown key", "lantern.engineer.md", good.replace("slots:", "voice: true\nslots:"), /voice/],
    ["no claims", "lantern.engineer.md", script("lantern", "engineer", [], `${DESIGNED}.`), /claims/],
    [
      "a claim without a quote",
      "lantern.engineer.md",
      good.replace(/ *quote: .*\n/, ""),
      /claims\[0\] needs a file and a quote/,
    ],
    ["no words", "lantern.engineer.md", script("lantern", "engineer", [cite(DESIGNED)], ""), /no words/],
    ["an alias", "lantern.engineer.md", good.replace("slots:", "x: &a 1\ny: *a\nslots:"), /alias/],
    ["carriage returns", "lantern.engineer.md", good.replace(/\n/g, "\r\n"), /carriage return/],
  ])("refuses %s", (_why, name, text, why) => {
    expect(() => parseScript(text, `${NARRATION_DIR}/${name}`)).toThrow(why);
  });

  it("refuses a script that is a link", () => {
    const root = tree();
    const link = join(root, NARRATION_DIR, "tide.engineer.md");
    rmSync(link);
    symlinkSync(join(root, NARRATION_DIR, "tide.non-engineer.md"), link);
    expect(() => readScripts(root)).toThrow(/regular file/);
  });

  it("refuses a slot the words use but slots doesn't list", () => {
    const text = script("lantern", "engineer", [cite(DESIGNED)], `${DESIGNED}.{{slot:fixture.lanterns}}`);
    expect(() => check(tree({ ...CLEAN, "lantern.engineer.md": text }))).toThrow(/doesn't list fixture\.lanterns/);
  });
});

describe("N1, the resume's citation check on each script", () => {
  const lantern = (claims: Claim[], words: string, slots: string[] = []) => ({
    ...CLEAN,
    "lantern.engineer.md": script("lantern", "engineer", claims, words, slots),
  });
  const at = "narration/lantern.engineer.md";

  it.each([
    ["C1, a file outside the corpus's topics", [cite(DESIGNED, "corpus/intake/notes.md")], "not a corpus file"],
    ["C1, the corpus's README, which isn't a topic file", [cite(DESIGNED, "corpus/README.md")], "not a corpus file"],
    ["C2, a quote the file doesn't hold", [cite("Robin designed the moon")], "quote not found"],
    ["C3, an untagged sentence", [cite("mentions the untagged harbor map")], "untagged sentence"],
    ["C5, a sentence under Do not claim", [cite("The lantern predates Robin by a century")], "do-not-claim section"],
  ])("fails %s", (_why, claims, reason) => {
    expect(problems(lantern(claims, `${DESIGNED}.`))).toEqual([`${at}: ${reason}`]);
  });

  it("C4: holds a script to its item's ownership verb, so a [P] sentence can't carry it", () => {
    const words = `${DESIGNED}. ${PUBLIC_SERVER}.`;
    expect(problems(lantern([cite(DESIGNED), cite(PUBLIC_SERVER)], words))).toEqual([`${at}: tag not sufficient`]);
    // The same [P] sentence carries a fact about a system, in a script whose item has no verb (CLEAN's tide).
    expect(problems(CLEAN)).toEqual([]);
  });

  it("C6: fails a digit outside a slot", () => {
    expect(problems(lantern([cite(DESIGNED)], `${DESIGNED}, with 12 lanterns.`))).toEqual([`${at}: bare number`]);
  });

  it("C7: fails a slot that names no fact", () => {
    const words = `${DESIGNED}.{{slot:fixture.nope}}`;
    expect(problems(lantern([cite(DESIGNED)], words, ["fixture.nope"]))).toEqual([`${at}: unknown slot`]);
  });

  it("C8: doesn't require the item's verb in the words, whose citations it still holds to C4's bar", () => {
    // The review of 2026-10-18: a script tells its item's story in the cited sentences' own words, and the only
    // sentence that says a verb can be a ruling annotation, which a script may not read out.
    const words = "Robin made the lantern service for the fixture clinic.";
    expect(problems(lantern([cite(DESIGNED)], words))).toEqual([]);
  });

  it("C8: fails an act verb, like released, that no cited sentence holds", () => {
    const words = `${DESIGNED}, and released it.`;
    expect(problems(lantern([cite(DESIGNED)], words))).toEqual([`${at}: ownership verb not cited`]);
  });

  it("C8: fails an act the corpus says only in an agentless passive, made the Author's in the active", () => {
    const tide = (words: string, quote = PUBLIC_SERVER) => ({
      ...CLEAN,
      "tide.engineer.md": script("tide", "engineer", [cite(quote)], words),
    });
    const at = "narration/tide.engineer.md";
    // "The tide clock was built on a public server" says what was done, not who did it.
    expect(problems(tide("Robin built the tide clock on a public server."))).toEqual([`${at}: passive made active`]);
    // "Designed by Robin and released to the docks": the "by" names who designed it, not who released it.
    const lamp = "The night lamp was designed by Robin and released to the docks";
    expect(problems(tide("Robin designed the night lamp and released it to the docks.", lamp))).toEqual([
      `${at}: passive made active`,
    ]);
    // In the corpus's own grammar, both pass; and a "by" passive names its agent, so its verb can be said as an act.
    expect(problems(tide(`${lamp}.`, lamp))).toEqual([]);
    expect(problems(tide("Robin designed the night lamp for the docks.", lamp))).toEqual([]);
  });

  it("N1: neither quotes nor reads out a ruling annotation, which rules a verb and isn't a sentence", () => {
    const words = `${DESIGNED}.`;
    expect(problems(lantern([cite(DESIGNED), cite("Ownership: *designed*")], words))).toEqual([
      `${at}: claims[1] quotes a ruling annotation, not a sentence`,
    ]);
    expect(problems(lantern([cite(DESIGNED)], `${DESIGNED}. Ownership: designed.`))).toEqual([
      `${at}: reads out a ruling annotation`,
    ]);
  });

  it("C8: fails any ownership verb in the words that no cited sentence holds, in a script whose item has none", () => {
    const words = `${PUBLIC_SERVER}; Robin led its care.`;
    const tide = { ...CLEAN, "tide.engineer.md": script("tide", "engineer", [cite(PUBLIC_SERVER)], words) };
    expect(problems(tide)).toEqual(["narration/tide.engineer.md: ownership verb not cited"]);
  });

  it("reports each script's first problem, for every script that has one", () => {
    const bad = {
      ...lantern([cite("Robin designed the moon")], "Lit 12 lanterns."),
      "tide.non-engineer.md": script("tide", "non-engineer", [cite(PUBLIC_SERVER)], "Wound 3 times a day."),
    };
    expect(problems(bad)).toEqual([`${at}: quote not found`, "narration/tide.non-engineer.md: bare number"]);
  });
});

describe("N3, forbidden phrases", () => {
  const at = "narration/lantern.non-engineer.md";
  const lantern = (words: string) => ({
    ...CLEAN,
    "lantern.non-engineer.md": script("lantern", "non-engineer", [cite(DESIGNED)], words),
  });

  it("fails a Do not claim key phrase, from any corpus file, naming its source line", () => {
    const words = `${DESIGNED}; the logbook is official.`;
    expect(problems(lantern(words))).toEqual([
      `${at}: forbidden phrase (from ${OTHER}:${lineOf(OTHER, "logbook is official")})`,
    ]);
    const invented = `${DESIGNED}. Robin invented the lantern.`;
    expect(problems(lantern(invented))).toEqual([
      `${at}: forbidden phrase (from ${FILE}:${lineOf(FILE, "Robin invented the lantern")})`,
    ]);
  });

  it("checks each alternative of a Do not claim bullet joined by or, its verb carried over", () => {
    const line = lineOf(FILE, "That Robin built the tide clock alone or the harbor bell");
    const words = `${DESIGNED}. Robin built the harbor bell.`;
    const claims = [cite(DESIGNED), cite("Robin built the tide clock for the harbor office")];
    const bell = { ...CLEAN, "lantern.non-engineer.md": script("lantern", "non-engineer", claims, words) };
    expect(problems(bell)).toEqual([`${at}: forbidden phrase (from ${FILE}:${line})`]);
  });

  it("fails the surname, from the PDF header's full name, without printing it", () => {
    const words = `${DESIGNED}, as Quillfeather.`;
    expect(problems(lantern(words))).toEqual([]);
    const found = problems(lantern(words), { fullName: "Robin Quillfeather" });
    expect(found).toEqual([`${at}: forbidden phrase (from the surname rule)`]);
    expect(found.join("\n")).not.toMatch(/quillfeather/i);
  });

  it("fails a private denylist phrase, reported by its line alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "h4-denylist-"));
    made.push(dir);
    const denylist = join(dir, "denylist.txt");
    writeFileSync(denylist, "# one phrase per line\nCobalt Harbor\n");
    const result = check(tree(lantern(`${DESIGNED}, near cobalt harbor.`)), { denylist });
    expect(result.problems).toEqual([`${at}: forbidden phrase (from corpus/intake/private/denylist.txt:2)`]);
    expect(result.problems.join("\n")).not.toMatch(/cobalt/i);
    expect(result.denylist).toBe("applied");
  });
});

describe("N4, length", () => {
  const at = "narration/lantern.non-engineer.md";
  const padded = (length: number) => {
    const start = `${DESIGNED}, so `;
    return `${start}${"a".repeat(length - start.length - 1)}.`;
  };
  const lantern = (words: string) => ({
    ...CLEAN,
    "lantern.non-engineer.md": script("lantern", "non-engineer", [cite(DESIGNED)], words),
  });

  it(`passes ${MAX_CHARS} characters and fails one more`, () => {
    expect(MAX_CHARS).toBe(900);
    expect(padded(900)).toHaveLength(900);
    expect(problems(lantern(padded(900)))).toEqual([]);
    expect(problems(lantern(padded(901)))).toEqual([`${at}: over 900 characters`]);
  });
});

describe("N5, the eval cases", () => {
  function cases(root: string) {
    const source = parseResume(readFileSync(join(root, RESUME_PATH), "utf8"));
    return narrationCases(root, source, readScripts(root));
  }

  it("writes one case per script, named for its item and path, in spec 000's case format", () => {
    const written = cases(tree());
    expect([...written.keys()]).toEqual([
      `${CASES_DIR}/narration-lantern-engineer.yaml`,
      `${CASES_DIR}/narration-lantern-non-engineer.yaml`,
      `${CASES_DIR}/narration-tide-engineer.yaml`,
      `${CASES_DIR}/narration-tide-non-engineer.yaml`,
    ]);
    const doc = parse(written.get(`${CASES_DIR}/narration-lantern-engineer.yaml`) as string) as Record<string, unknown>;
    expect(Object.keys(doc).sort()).toEqual(["description", "expect", "fake_response", "id", "prompt"]);
    expect(doc.id).toBe("narration-lantern-engineer");
    expect(doc.prompt).toMatch(/lantern/);
    expect(doc.prompt).toMatch(/engineer path/);
    // The words as the room shows them, with the filled, public-safe slot's phrasing.
    expect(doc.fake_response).toBe(`${DESIGNED}. ${RAN}. It lights 12 lanterns.`);
  });

  it("holds one key phrase per citation, each in the words and in the citation's quote", () => {
    const doc = parse(cases(tree()).get(`${CASES_DIR}/narration-lantern-engineer.yaml`) as string) as {
      fake_response: string;
      expect: { contains: string[] };
    };
    const quotes = [DESIGNED, RAN];
    expect(doc.expect.contains).toHaveLength(quotes.length);
    doc.expect.contains.forEach((phrase, i) => {
      expect(phrase.length).toBeGreaterThanOrEqual(12);
      expect(doc.fake_response.toLowerCase()).toContain(phrase.toLowerCase());
      expect((quotes[i] as string).toLowerCase()).toContain(phrase.toLowerCase());
    });
  });

  it("holds the corpus's public Do not claim phrases, and none of them is in the words", () => {
    for (const text of cases(tree()).values()) {
      const doc = parse(text) as { fake_response: string; expect: { not_contains: string[] } };
      expect(doc.expect.not_contains).toEqual(
        expect.arrayContaining(["invented the lantern", "sole ownership of the harbor map", "the logbook is official"]),
      );
      for (const phrase of doc.expect.not_contains) expect(doc.fake_response.toLowerCase()).not.toContain(phrase);
    }
  });

  it("never writes a private denylist phrase or the surname, even where the checkout can read the denylist", () => {
    const root = tree();
    mkdirSync(join(root, "corpus/intake/private"), { recursive: true });
    writeFileSync(join(root, "corpus/intake/private/denylist.txt"), "Cobalt Harbor\nQuillfeather\n");
    const all = [...cases(root).values()].join("\n");
    expect(all).not.toMatch(/cobalt|quillfeather/i);
  });

  it("fails a citation the words don't use: no shared phrase of at least 12 characters", () => {
    // The tide clock's sentence shares only "Robin" with these words.
    const words = "Robin designed the lantern service for the fixture clinic.";
    const text = script(
      "lantern",
      "engineer",
      [cite(DESIGNED), cite("Robin built the tide clock for the harbor office")],
      words,
    );
    expect(problems({ ...CLEAN, "lantern.engineer.md": text })).toEqual([
      "narration/lantern.engineer.md: claims[1] shares no phrase of 12 characters or more with the words",
    ]);
  });
});

describe("the lock", () => {
  it("covers every corpus file a script cites, so a change to one fails make test", () => {
    const tide = script(
      "tide",
      "engineer",
      [cite(PUBLIC_SERVER), cite("Robin keeps a logbook", OTHER)],
      [`${PUBLIC_SERVER}.`, "Robin keeps a logbook of passing ships."].join(" "),
    );
    const root = tree({ ...CLEAN, "tide.engineer.md": tide });
    const source = parseResume(readFileSync(join(root, RESUME_PATH), "utf8"));
    expect(Object.keys(computeLock(root, source).files)).toContain(OTHER);
    expect(checkLock(root, source, readLock(root) ?? { files: {} })).toEqual([]);
    writeFileSync(join(root, OTHER), `${readFileSync(join(root, OTHER), "utf8")}\n`);
    expect(checkLock(root, source, readLock(root) ?? { files: {} })).toEqual([
      `corpus changed since the lock: ${OTHER}`,
    ]);
  });
});

describe("room-data.json's narration", () => {
  function policyApproving(...paths: [string, string][]): string {
    const dir = mkdtempSync(join(tmpdir(), "h4-narration-policy-"));
    made.push(dir);
    const approvals = paths.map(([path, sha], i) => ({
      id: `C-${String(i + 1).padStart(4, "0")}`,
      path_when_approved: path,
      kind: path.endsWith(".yaml") ? "resume" : "narration",
      sha256: sha,
      date: "2026-10-18",
      reason: "a stand-in approval, made by the test",
    }));
    writeFileSync(join(dir, "content-approvals.json"), JSON.stringify({ schema: 1, approvals }));
    return dir;
  }

  const approval = (root: string, path: string): [string, string] => [path, sha256(readFileSync(join(root, path)))];
  const all = (root: string): [string, string][] => [
    approval(root, RESUME_PATH),
    ...readdirSync(join(root, NARRATION_DIR))
      .sort()
      .map((n) => approval(root, `${NARRATION_DIR}/${n}`)),
  ];

  async function build(root: string, policyDir: string, drafts: boolean): Promise<RoomData> {
    const policy = readPolicy(policyDir);
    const files = contentFiles(root, policy);
    const context = { root, files, policy, drafts, emit: () => undefined, warn: () => undefined };
    return narrationPart(await resumePart(roomData(files, policy, drafts), context), context);
  }

  type Item = { id: string; narration: Record<string, { words: string; approved: boolean } | null> };
  const items = (data: RoomData): Item[] => (data.sections as { items: Item[] }[]).flatMap((s) => s.items);

  it("puts each approved script under its item, per path, with its words, source, and digest", async () => {
    const root = tree();
    const data = await build(root, policyApproving(...all(root)), false);
    const lantern = items(data).find((i) => i.id === "lantern");
    const file = `${NARRATION_DIR}/lantern.non-engineer.md`;
    expect(lantern?.narration["non-engineer"]).toEqual({
      words: `${DESIGNED}, so the harbor stays lit.`,
      approved: true,
      source: file,
      sha256: sha256(readFileSync(join(root, file))),
    });
    expect(lantern?.narration.engineer?.words).toBe(`${DESIGNED}. ${RAN}. It lights 12 lanterns.`);
    expect(data.published.map((p) => p.path)).toEqual(all(root).map(([p]) => p));
    expect(data.drafts).toEqual([]);
  });

  it("leaves a draft script out of a build without drafts: no words, not published, listed as a draft", async () => {
    const root = tree();
    const draft = `${NARRATION_DIR}/tide.engineer.md`;
    const policy = policyApproving(...all(root).filter(([p]) => p !== draft));
    const data = await build(root, policy, false);
    expect(items(data).find((i) => i.id === "tide")?.narration).toEqual({
      engineer: null,
      "non-engineer": {
        words: `${PUBLIC_SERVER}.`,
        approved: true,
        source: expect.any(String),
        sha256: expect.any(String),
      },
    });
    expect(JSON.stringify(data)).not.toContain("where the docks can read it");
    expect(data.published.map((p) => p.path)).not.toContain(draft);
    expect(data.drafts).toEqual([draft]);
  });

  it("shows a draft script in a drafts build, marked not approved and published as a draft", async () => {
    const root = tree();
    const draft = `${NARRATION_DIR}/tide.engineer.md`;
    const data = await build(root, policyApproving(...all(root).filter(([p]) => p !== draft)), true);
    expect(items(data).find((i) => i.id === "tide")?.narration.engineer).toEqual({
      words: `${PUBLIC_SERVER}, where the docks can read it.`,
      approved: false,
      source: draft,
      sha256: sha256(readFileSync(join(root, draft))),
    });
    expect(data.published).toContainEqual({ path: draft, sha256: expect.any(String), draft: true });
  });

  it("publishes no script when the resume is withheld, even an approved one", async () => {
    const root = tree();
    const policy = policyApproving(...all(root).filter(([p]) => p !== RESUME_PATH));
    const data = await build(root, policy, false);
    expect(data.sections).toEqual([]);
    expect(data.published).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("so the harbor stays lit");
  });

  it("fails the build on a check's problem, even for a draft it would withhold", async () => {
    const root = tree(without("tide.engineer.md"));
    await expect(build(root, policyApproving(), false)).rejects.toThrow(/tide\.engineer\.md: missing/);
  });
});

describe("the committed scripts", () => {
  const source = parseResume(readFileSync(join(REPO, RESUME_PATH), "utf8"));
  const scripts = readScripts(REPO);

  it("give every resume item a script on each path, and pass N1–N5 against the repository's corpus", () => {
    const ids = source.sections.flatMap((s) => s.items.map((i) => i.id));
    expect(scripts.length).toBe(ids.length * 2);
    expect(checkSource(source, { root: REPO }).problems).toEqual([]);
    expect(checkNarration(source, scripts, { root: REPO }).problems).toEqual([]);
  });

  it("have their eval cases committed and current, and no case for a script that's gone", () => {
    const expected = narrationCases(REPO, source, scripts);
    const dir = join(REPO, CASES_DIR);
    const onDisk = readdirSync(dir)
      .filter((n) => n.startsWith("narration-"))
      .map((n) => `${CASES_DIR}/${n}`);
    expect(onDisk.sort(), "run npm run content:lock -w apps/web").toEqual([...expected.keys()].sort());
    for (const [path, text] of expected) {
      expect(readFileSync(join(REPO, path), "utf8"), `${path} is stale: run npm run content:lock -w apps/web`).toBe(
        text,
      );
    }
    expect(dirname(CASES_DIR)).toBe("evals/narration");
  });
});
