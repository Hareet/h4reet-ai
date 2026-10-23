// T066's words half (spec 004; FR-009, FR-029 to FR-035, FR-052; R-15, R-21, R-38; contracts/room-data-files.md §7 to
// §9, §13.5, §14, §15): the RT family on the compositor's fixtures, each rule refusing what its table gives and
// passing what it doesn't. RT2 is spec 002's C9 over every string, IDs and names included, its reason ending
// `(from <source>)` and never printing the phrase; RT3 is C6; RT4 and RT5 are C1 to C5 and C8 on claims; RT6 holds the
// monitor's scripts; RT7 the chalkboard's excludes; RT8 words to their grid; RT9 the Author's words, verbatim; RT10 the
// typefaces; RT11 the tier's sentences; RT12 the closed list's keys; RT13 the outlines. Spec 002's line check, read
// through a tree as the compositor reads the corpus, agrees with checkSource on spec 002's fixtures (T074; R-15). The
// private denylist is a file in an in-memory tree here, so no "private" fixture is ever committed.
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { checkLine, checkSource, lineContext, treeLineContext } from "../../build/content";
import type { Item, ResumeSource } from "../../build/content";
import { outlineProblem, scriptProblem } from "../../build/room/checks/rt";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeOptions, RoomPolicy } from "../../build/room/compose";
import { noPolicy, policyFrom } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import { TYPING_CHARS_PER_S, TYPING_LIMIT_S } from "../../src/room/compose/layout";
import { goodFiles, overlay } from "../helpers/room-fixtures";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: true };

const SCENE = "apps/web/room/scene.yaml";
const UI = "apps/web/room/ui-words.yaml";
const TOPICS = "apps/web/room/topics.yaml";
const LOOK = "apps/web/room/looks/fx-cel.yaml";
const SHELL = "apps/web/room/catalog/fx-shell.yaml";
const SCRIPT = "apps/web/content/room/fx-script.yaml";
const NOTES = "apps/web/content/room/fx-notes.yaml";
const OUTLINE = "apps/web/content/room/outlines/fx-sign-words.outline.json";
const RESUME = "apps/web/content/resume.yaml";
const CORPUS = "corpus/90-fx-work.md";
const DENYLIST = "corpus/intake/private/denylist.txt";
/** The known-good scene's regions (test/fixtures/room/README.md): the monitor's terminal, the neon panel's word, and
 *  the board's chalk. */
const TERMINAL = `${SCENE}:placements[2].faces.screen.regions[0]`;
const NEON = `${SCENE}:placements[3].faces.panel.regions[0]`;
const CHALK = `${SCENE}:placements[5].faces.slate.regions[0]`;

/** A corpus topic file in the real corpus's shape (corpus/README.md), about no one: tagged sentences, a gap, an
 *  untagged sentence, and a Do not claim section whose bullet is line 14. */
const CORPUS_TEXT = [
  "# Fixture topic: the fixture work",
  "",
  "A synthetic corpus file for the compositor's tests, about no one.",
  "",
  "## Role at a glance",
  "",
  "- `[A 2026-01-01]` He designed the fixture desk for the fixture room.",
  "- `[A 2026-01-01]` The fixture keeper founded Glowseva for the fixture town.",
  "- `[?]` Whether the fixture desk reached the fixture harbor.",
  "- The fixture keeper mentions the fixture lamp before any tag.",
  "",
  "## Do not claim",
  "",
  "- That the fixture keeper invented the glowword. `[A 2026-01-01]` The glowword predates the fixture keeper.",
  "",
].join("\n");
const KEY_PHRASE_LINE = 14;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Changes = Record<string, string | Uint8Array | null>;
type Step = string | number;
type Edit = readonly [at: readonly Step[], value: unknown];

/** The known-good file at `path` with each edit's value set at its keys and indices (undefined deletes it), as text.
 *  One call per file: two calls for one file would each start from the known-good copy. */
function edit(path: string, ...edits: Edit[]): Changes {
  const data = goodFiles().get(path);
  if (data === undefined) throw new Error(`${path} isn't in the known-good set`);
  const json = path.endsWith(".json");
  const doc: unknown = json ? JSON.parse(decoder.decode(data)) : parse(decoder.decode(data));
  for (const [at, value] of edits) {
    let node = doc as Record<Step, unknown>;
    for (const step of at.slice(0, -1)) node = node[step] as Record<Step, unknown>;
    const last = at[at.length - 1] as Step;
    if (value !== undefined) node[last] = value;
    else if (Array.isArray(node)) node.splice(Number(last), 1);
    else delete node[last];
  }
  return { [path]: json ? `${JSON.stringify(doc, null, 2)}\n` : stringify(doc, { aliasDuplicateObjects: false }) };
}

/** Every finding's line for the known-good set under `changes`. */
function lines(changes: Changes, options = STRICT, policy: RoomPolicy = noPolicy()): string[] {
  return compose(overlay(changes), policy, options).findings.map((f) => formatFinding(f));
}

/** One rule's findings, by rule, file, and path. */
function where(rule: string, changes: Changes, options = STRICT, policy: RoomPolicy = noPolicy()): string[] {
  return compose(overlay(changes), policy, options)
    .findings.filter((f) => f.rule === rule)
    .map((f) => `${f.rule} ${f.file}:${f.path}`);
}

const of = (rule: string, found: readonly string[]): string[] => found.filter((l) => l.startsWith(`${rule} `));

/** The policy a policy directory holding main's resume header gives: the surname rule's name. */
function named(fullName: string): RoomPolicy {
  const header = encoder.encode(`${JSON.stringify({ schema: 1, full_name: fullName })}\n`);
  return policyFrom({ caps: null, approvals: null, header }, "policy-dir");
}

describe("RT2, spec 002's C9 over every string (FR-009, FR-035)", () => {
  const surname = {
    ...edit(SCENE, [["selectables", 0, "name"], "Quillfeather workstation"], [["retired", 0, "id"], "quillfeather"]),
    ...edit(SHELL, [["anchors", "quillfeather"], { at: [0, 0, 0] }]),
  };

  it("refuses the surname rule's word in a name, an ID, and a map key, by its source and never its word", () => {
    const found = lines(surname, STRICT, named("Fixture Quillfeather"));
    expect(of("RT2", found)).toEqual([
      `RT2 ${SHELL}:anchors: forbidden phrase (from the surname rule)`,
      `RT2 ${SCENE}:retired[0].id: forbidden phrase (from the surname rule)`,
      `RT2 ${SCENE}:selectables[0].name: forbidden phrase (from the surname rule)`,
    ]);
    expect(found.join("\n")).not.toMatch(/quillfeather/i);
  });

  it("has no surname rule without main's full name, and never refuses the name's first word", () => {
    expect(of("RT2", lines(surname))).toEqual([]);
    expect(of("RT2", lines({}, STRICT, named("Fixture Quillfeather")))).toEqual([]);
  });

  it("refuses a corpus Do not claim key phrase in any string, a pending line's too, naming its corpus line", () => {
    const found = lines({
      [CORPUS]: CORPUS_TEXT,
      ...edit(UI, [["words", "sign.second_line"], "The fixture keeper  INVENTED the glowword"]),
      ...edit(NOTES, [["lines", 2, "text"], "The fixture keeper invented the glowword"]),
    });
    const reason = `forbidden phrase (from ${CORPUS}:${KEY_PHRASE_LINE})`;
    expect(of("RT2", found)).toEqual([
      `RT2 ${NOTES}:lines[2].text: ${reason}`,
      `RT2 ${UI}:words.sign.second_line: ${reason}`,
    ]);
  });

  it("refuses a private denylist phrase where the tree holds the list, naming only the private denylist", () => {
    const changes = edit(UI, [["words", "sign.second_line"], "metered by the quartz  Lantern gateway"]);
    expect(of("RT2", lines(changes))).toEqual([]);
    const found = lines({ ...changes, [DENYLIST]: "# fixture phrases\n\nquartz lantern\n" });
    expect(of("RT2", found)).toEqual([
      `RT2 ${UI}:words.sign.second_line: forbidden phrase (from the private denylist)`,
    ]);
    expect(found.join("\n")).not.toMatch(/quartz|denylist\.txt|:3\)/i);
  });

  it("leaves a refused name out of every later finding's path and reason", () => {
    const poses = {
      "fx-plugged": {
        mount: { on: "fx-laptop", anchor: "port", offset: [0.03, 0, 0], turn: { y: 90 } },
        glows: [{ placement: "fx-laptop", glow: "fx-charge", level: 1 }],
      },
      quillfeather: { mount: { on: "fx-desk", anchor: "fx-nowhere" } },
      "fx-resting": { mount: { on: "fx-desk", anchor: "top", offset: [0.5, 0, 0.15] } },
    };
    const found = lines(edit(SCENE, [["switches", 0, "poses"], poses]), STRICT, named("Fixture Quillfeather"));
    expect(found).toContain(`RT2 ${SCENE}:switches[0].poses: forbidden phrase (from the surname rule)`);
    expect(found).toContain(`RI4 ${SCENE}:switches[0].poses: no anchor of that name on the parent's piece`);
    expect(found.join("\n")).not.toMatch(/quillfeather/i);
  });
});

describe("RT3, spec 002's C6 (FR-030, FR-035, FR-048)", () => {
  it("refuses a digit outside a slot in a UI word, its {time}, {amount}, and {name} the slots", () => {
    const about = { text: "The fixture sign has 3 makers", about_author: true, claims: [] };
    const changes = edit(
      UI,
      [["words", "sign.no_call_yet"], "no call in 24 hours"],
      [["words", "label.fx-desk"], "fixture desk 2"],
      [["words", "sign.not_affiliated"], about],
    );
    expect(where("RT3", changes)).toEqual([
      `RT3 ${UI}:words.label.fx-desk`,
      `RT3 ${UI}:words.sign.no_call_yet`,
      `RT3 ${UI}:words.sign.not_affiliated.text`,
    ]);
    expect(where("RT3", {})).toEqual([]);
  });

  it("refuses any digit in a line about the Author, and passes one in another line", () => {
    const changes = edit(
      NOTES,
      [["lines", 0], { text: "Plans 3 things", about_author: true }],
      [["lines", 1, "text"], "Ship 2 often"],
    );
    expect(lines(changes).filter((l) => l.startsWith("RT3 "))).toEqual([
      `RT3 ${NOTES}:lines[0].text: a digit in a line about the Author`,
    ]);
  });

  it("refuses any slot in a room-text line, spec 002's or a UI word's", () => {
    const changes = edit(SCRIPT, [["lines", 0, "text"], "fx {{slot:fx.n}}"], [["lines", 1, "text"], "fx {amount}"]);
    expect(where("RT3", changes)).toEqual([`RT3 ${SCRIPT}:lines[0].text`, `RT3 ${SCRIPT}:lines[1].text`]);
  });
});

describe("RT4 and RT5, spec 002's C1 to C5 and C8 on claims (FR-033, FR-035)", () => {
  const cite = (quote: string, file = CORPUS) => ({ file, quote });

  it("refuses each failing claim of a line, at the claim, with C1 to C5's reason", () => {
    const claims = [
      cite("designed the fixture desk for the fixture room", "docs/fx-work.md"),
      cite("He designed a fixture lamp"),
      cite("mentions the fixture lamp before any tag"),
      cite("Whether the fixture desk reached"),
      cite("The glowword predates the fixture keeper"),
      cite("designed the fixture desk for the fixture room"),
    ];
    const found = lines({ [CORPUS]: CORPUS_TEXT, ...edit(NOTES, [["lines", 0, "claims"], claims]) });
    expect(of("RT4", found)).toEqual([
      `RT4 ${NOTES}:lines[0].claims[0]: not a corpus file`,
      `RT4 ${NOTES}:lines[0].claims[1]: quote not found`,
      `RT4 ${NOTES}:lines[0].claims[2]: untagged sentence`,
      `RT4 ${NOTES}:lines[0].claims[3]: tag not sufficient`,
      `RT4 ${NOTES}:lines[0].claims[4]: do-not-claim section`,
    ]);
  });

  it("refuses a UI word's failing claim, and leaves a pending line's claims unchecked", () => {
    const word = {
      text: "The fixture sign isn't affiliated",
      about_author: true,
      claims: [cite("a quote", "docs/fx.md")],
    };
    const pending = { text: "Later idea", pending: true, about_author: true, claims: [cite("a quote", "docs/fx.md")] };
    const changes = { ...edit(UI, [["words", "sign.not_affiliated"], word]), ...edit(NOTES, [["lines", 2], pending]) };
    expect(where("RT4", changes)).toEqual([`RT4 ${UI}:words.sign.not_affiliated.claims[0]`]);
    expect(where("RT5", changes)).toEqual([]);
  });

  it("refuses a line or a UI word about the Author without claims (RT5)", () => {
    const changes = {
      ...edit(NOTES, [["lines", 1, "about_author"], true]),
      ...edit(UI, [["words", "sign.not_affiliated"], { text: "The fixture sign stands alone", about_author: true }]),
    };
    expect(where("RT5", changes)).toEqual([
      `RT5 ${NOTES}:lines[1].claims`,
      `RT5 ${UI}:words.sign.not_affiliated.claims`,
    ]);
  });

  it("refuses an ownership verb that a line about the Author says and its cited sentence doesn't (C8)", () => {
    const cited = [cite("He designed the fixture desk")];
    const changes = {
      [CORPUS]: CORPUS_TEXT,
      ...edit(
        NOTES,
        [["lines", 0], { text: "Built the fixture desk", about_author: true, claims: cited }],
        [["lines", 1], { text: "Designed the fixture desk", about_author: true, claims: cited }],
        [["lines", 2], { text: "Built the fixture desk", claims: cited }],
      ),
    };
    expect(lines(changes).filter((l) => /^RT[45] /.test(l))).toEqual([
      `RT5 ${NOTES}:lines[0].text: ownership verb not cited`,
    ]);
  });
});

describe("RT6, the monitor's scripts (FR-031)", () => {
  const PATH = "a local, absolute, or home path";
  const USER = "user@host or an email address";
  const IP = "an IP address";
  const URL_ = "a URL other than the site's";
  const AMOUNT = "an amount";
  const SECRET = "a secret-shaped token";

  it.each([
    ["ls ~/fx", PATH],
    ["cd $HOME/fx", PATH],
    ["cat /etc/fx/hosts", PATH],
    ["sh ./fx.sh", PATH],
    ["cd ../fx", PATH],
    ["dir C:\\fx", PATH],
    ["fx@fxbox:~$ ls", USER],
    ["mail fx@fx.test", USER],
    ["ping 10.0.0.1", IP],
    ["ping fe80::1", IP],
    ["open https://fx.test/a", URL_],
    ["open http://h4reet.ai.fx.test", URL_],
    ["see www.fx.test", URL_],
    ["see fx.test/docs", URL_],
    ["spent $12", AMOUNT],
    ["spent 12 USD", AMOUNT],
    ["€3 so far", AMOUNT],
    ["12 dollars", AMOUNT],
    ["fx-".repeat(11), SECRET],
    ["AKIAFXFXFX", SECRET],
    ["key sk-lf-fx", SECRET],
    ["h4op_fx", SECRET],
  ])("finds in %s %s", (text, kind) => {
    expect(scriptProblem(text)).toBe(kind);
  });

  it.each([
    "/help",
    "spec.md",
    "Claude Code reads specs/004-room/spec.md",
    "https://h4reet.ai/room",
    "see h4reet.ai",
    "12 tests passed in 3 s",
    "v1.2.3 at 10:42",
    "npm i @fx/pkg",
    "and/or",
    "std::vector",
    "a run of thirty-one characters x",
  ])("passes %s", (text) => {
    expect(scriptProblem(text)).toBeNull();
  });

  it("refuses such a line of a terminal or desktop-session block at its text, and holds no other block to it", () => {
    expect(where("RT6", edit(SCRIPT, [["lines", 1, "text"], "fx@fx.test"]))).toEqual([`RT6 ${SCRIPT}:lines[1].text`]);
    const desktop = edit(SCRIPT, [["renderer"], "desktop-session"], [["lines", 0, "text"], "ls ~/fx"]);
    expect(lines(desktop).filter((l) => l.startsWith("RT6 "))).toEqual([`RT6 ${SCRIPT}:lines[0].text: holds ${PATH}`]);
    expect(where("RT6", edit(NOTES, [["lines", 0, "text"], "ls ~/fx"]))).toEqual([]);
  });

  it(`refuses a block its renderer would type for over ${TYPING_LIMIT_S} s; a pending line isn't typed`, () => {
    expect(TYPING_LIMIT_S).toBe(5);
    const most = TYPING_CHARS_PER_S * TYPING_LIMIT_S;
    const typed = Array.from({ length: most / 12 }, () => ({ text: "fx run fx ok" }));
    expect(typed.length * 12).toBe(most);
    expect(where("RT6", edit(SCRIPT, [["lines"], typed]))).toEqual([]);
    expect(where("RT6", edit(SCRIPT, [["lines"], [...typed, { text: "x" }]]))).toEqual([`RT6 ${SCRIPT}:lines`]);
    expect(where("RT6", edit(SCRIPT, [["lines"], [...typed, { text: "fx later", pending: true }]]))).toEqual([]);
  });
});

describe("RT7, the chalkboard's excludes (FR-033)", () => {
  const excluding = (blockLines: unknown[]): Changes =>
    edit(NOTES, [["exclude"], ["fixture excluded phrase", "Glowseva"]], [["lines"], blockLines]);

  it("refuses a chalk line that holds an exclude phrase, as whole words in any case", () => {
    const changes = excluding([
      { text: "No GLOWSEVA" },
      { text: "Glowsevan art" },
      { text: "a Fixture  excluded phrase" },
    ]);
    expect(where("RT7", changes)).toEqual([`RT7 ${NOTES}:lines[0].text`, `RT7 ${NOTES}:lines[2].text`]);
  });

  it("refuses a chalk line that cites a corpus sentence holding one", () => {
    const claims = [{ file: CORPUS, quote: "founded Glowseva for the fixture town" }];
    const changes = { [CORPUS]: CORPUS_TEXT, ...excluding([{ text: "Plan small", claims }]) };
    expect(where("RT7", changes)).toEqual([`RT7 ${NOTES}:lines[0].claims[0]`]);
  });

  it("refuses a chalk line sharing a 24-character span with such a sentence, and passes 23", () => {
    const changes = {
      [CORPUS]: CORPUS_TEXT,
      ...excluding([
        { text: "e fixture keeper founded" },
        { text: "e fixture keeper founde" },
        { text: "He designed the fixture desk" },
      ]),
    };
    expect(where("RT7", changes)).toEqual([`RT7 ${NOTES}:lines[0].text`]);
  });

  it("holds a chalk block's exclude as the loader reads it", () => {
    expect(where("RT7", edit(NOTES, [["exclude"], undefined]))).toEqual([`RT7 ${NOTES}:exclude`]);
  });
});

describe("RT8, words over their grid (FR-031, FR-033, FR-052)", () => {
  it("refuses more drawn lines than a terminal grid's rows, a pending line taking none", () => {
    const four = [{ text: "fx run" }, { text: "fx ok" }, { text: "fx three" }, { text: "fx four" }];
    expect(of("RT8", lines(edit(SCRIPT, [["lines"], four])))).toEqual([
      `RT8 ${TERMINAL}: 4 drawn lines, more than the grid's 3 rows`,
    ]);
    const pending = [...four.slice(0, 3), { text: "fx four", pending: true }];
    expect(where("RT8", edit(SCRIPT, [["lines"], pending]))).toEqual([]);
  });

  it("refuses a line wider than a terminal grid's columns", () => {
    expect(where("RT8", edit(SCRIPT, [["lines", 0, "text"], "fx run --all"]))).toEqual([]);
    expect(of("RT8", lines(edit(SCRIPT, [["lines", 0, "text"], "fx run --all!"])))).toEqual([
      `RT8 ${TERMINAL}: lines[0] of its block is 13 characters, more than the grid's 12 columns`,
    ]);
  });

  it("refuses a chalk line wider than its region at the grid's size, by the chalk typeface's advance widths", () => {
    const wide = edit(NOTES, [["lines", 0, "text"], "Plan small things daily"]);
    const found = of("RT8", lines(wide));
    expect(found).toHaveLength(1);
    const width = /^lines\[0\] of its block is \d+\.\d{3} m wide at the grid's size, wider than the region's 0\.740 m$/;
    expect(found[0]?.startsWith(`RT8 ${CHALK}: `)).toBe(true);
    expect(found[0]?.slice(`RT8 ${CHALK}: `.length)).toMatch(width);
    // Six rows halve the glyph: the same line fits.
    const smaller = edit(SCENE, [["placements", 5, "faces", "slate", "regions", 0, "grid"], { rows: 6 }]);
    expect(where("RT8", { ...wide, ...smaller })).toEqual([]);
  });

  it("refuses a neon word over its panel's characters, or wider than the panel in its typeface", () => {
    expect(where("RT8", edit(UI, [["words", "sign.word"], "Glowwordss"]))).toEqual([]);
    expect(of("RT8", lines(edit(UI, [["words", "sign.word"], "Glowwordsss"])))).toEqual([
      `RT8 ${NEON}: ui[0] is 11 characters, more than the grid's 10 characters`,
    ]);
    expect(where("RT8", edit(UI, [["words", "sign.word"], "WWWWWWWWWW"]))).toEqual([`RT8 ${NEON}`]);
  });

  it("refuses more neon words than the panel's one row", () => {
    const two = edit(SCENE, [
      ["placements", 3, "faces", "panel", "regions", 0, "ui"],
      ["sign.word", "sign.test"],
    ]);
    expect(of("RT8", lines(two))).toEqual([`RT8 ${NEON}: 2 words, more than the grid's 1 row`]);
  });

  it("refuses, in strict mode only, the resume source's section titles over a resume_titles region", () => {
    const resume = (titles: string[]): string =>
      [
        "version: 1",
        "header:",
        "  room: { name: Fixture Keeper, lines: [] }",
        "sections:",
        ...titles.map((title, i) => `  - { id: part-${"abcdefgh"[i]}, title: ${title}, items: [] }`),
        "",
      ].join("\n");
    const titles = { rect: [0, 0, 1, 1], renderer: "chalk", grid: { rows: 3 }, resume_titles: true };
    const region = edit(SCENE, [["placements", 5, "faces", "slate", "regions", 0], titles]);
    const four = { ...region, [RESUME]: resume(["Work", "Tools", "Talks", "Notes"]) };
    expect(of("RT8", lines(four))).toEqual([`RT8 ${CHALK}: 4 section titles, more than the grid's 3 rows`]);
    expect(where("RT8", four, LENIENT)).toEqual([]);
    expect(where("RT8", { ...region, [RESUME]: resume(["Work", "Tools", "Talks"]) })).toEqual([]);
    const long = { ...region, [RESUME]: resume(["Work", "A section title far too long for the slate"]) };
    expect(where("RT8", long)).toEqual([`RT8 ${CHALK}`]);
    expect(where("RT8", region)).toEqual([]);
  });
});

describe("RT9, the Author's words, verbatim (FR-031, FR-036)", () => {
  const quote = (text: string): Changes => edit(TOPICS, [["topics", 0, "words_from", 0, "quote"], text]);

  it("refuses, in strict mode only, a words_from quote its intent doesn't hold", () => {
    const changes = quote("the fixture room holds a lamp");
    expect(where("RT9", changes)).toEqual([`RT9 ${TOPICS}:topics[0].words_from[0].quote`]);
    expect(where("RT9", changes, LENIENT)).toEqual([]);
  });

  it("collapses whitespace, and nothing else", () => {
    expect(where("RT9", quote("the  fixture room\n holds a desk"))).toEqual([]);
    expect(where("RT9", quote("The fixture room holds a desk"))).toEqual([
      `RT9 ${TOPICS}:topics[0].words_from[0].quote`,
    ]);
    expect(where("RT9", quote(" "))).toEqual([`RT9 ${TOPICS}:topics[0].words_from[0].quote`]);
  });

  it.each([
    "docs/fx-notes.md",
    "intent/README.md",
    "intent/900-fx-room.txt",
    "intent/sub/900-fx-room.md",
    "specs/900-fx-room/spec.md",
    "intent/901-fx-none.md",
    "specs/900-fx-room/intent.md",
  ])("refuses %s, which isn't an intent file the tree holds", (file) => {
    expect(where("RT9", edit(SCRIPT, [["words_from", 0, "file"], file]))).toEqual([`RT9 ${SCRIPT}:words_from[0].file`]);
  });

  it("reads a spec's intent.md as an intent", () => {
    const changes = {
      "specs/901-fx-room/intent.md": "# Intent 901\n\nThe Author said the screen shows a long script.\n",
      ...edit(SCRIPT, [
        ["words_from", 0],
        { file: "specs/901-fx-room/intent.md", quote: "the screen shows a long script" },
      ]),
    };
    expect(where("RT9", changes)).toEqual([]);
  });
});

describe("RT10, the look's typefaces (FR-033; B10)", () => {
  it("refuses a family or a weight fonts.lock doesn't vendor for the room, at the look's key", () => {
    const changes = edit(
      LOOK,
      [["typefaces", "chalk", "family"], "Fixture Hand"],
      [["typefaces", "neon", "weight"], 900],
    );
    expect(where("RT10", changes)).toEqual([
      `RT10 ${LOOK}:typefaces.chalk.family`,
      `RT10 ${LOOK}:typefaces.neon.weight`,
    ]);
  });

  it("refuses a vendored file whose SHA-256 differs from fonts.lock's", () => {
    const font = "apps/web/fonts/patrick-hand-latin-400-normal.woff";
    const bytes = Uint8Array.from(goodFiles().get(font) ?? []);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    expect(of("RT10", lines({ [font]: bytes }))).toEqual([`RT10 ${font}:-: its SHA-256 differs from fonts.lock's`]);
  });
});

describe("RT11, the tier's sentences (FR-035)", () => {
  it("refuses a tier word naming the twin, and no other word", () => {
    const changes = edit(
      UI,
      [["words", "tier.cloud"], "The fixture twin is answering"],
      [["words", "tier.local"], "The Twin's machine is serving"],
      [["words", "tier.resting"], "Twins are resting"],
      [["words", "tier.unknown"], "The fixture machine is twinkling"],
      [["words", "around.heading"], "Around the twin's room"],
    );
    expect(where("RT11", changes)).toEqual([
      `RT11 ${UI}:words.tier.cloud`,
      `RT11 ${UI}:words.tier.local`,
      `RT11 ${UI}:words.tier.resting`,
    ]);
  });
});

describe("RT12, the closed list's keys and slots (FR-005, FR-029)", () => {
  it("refuses a closed-list key that's missing", () => {
    expect(of("RT12", lines(edit(UI, [["words", "sign.local"], undefined])))).toEqual([
      `RT12 ${UI}:words.sign.local: a closed-list UI key missing`,
    ]);
  });

  it("refuses a value whose slots differ from its key's: another slot, none, an extra one, or one twice", () => {
    const changes = edit(
      UI,
      [["words", "pause.paused_at"], "Paused at {amount}"],
      [["words", "sign.local"], "local"],
      [["words", "sign.word"], "Glow {amount}"],
      [["words", "standin.label"], "{name} ({name})"],
    );
    expect(of("RT12", lines(changes))).toEqual([
      `RT12 ${UI}:words.pause.paused_at: slots that differ from its key's, which takes {time}`,
      `RT12 ${UI}:words.sign.local: slots that differ from its key's, which takes {amount}`,
      `RT12 ${UI}:words.sign.word: slots that differ from its key's, which takes none`,
      `RT12 ${UI}:words.standin.label: slots that differ from its key's, which takes {name}`,
    ]);
  });
});

describe("RT13, the outlines (FR-032, FR-052)", () => {
  it.each([
    ["fixture href sign", "an href"],
    ["DATA:fx", "a data: URI"],
    ["fx/tracer", "a path"],
    ["fx\\tracer", "a path"],
    ["QUJD".repeat(10), "a base64-like run"],
    ["tracer.exe", "a file name or extension"],
    ["DSC0001", "a camera's file stem"],
  ])("finds in %s %s", (text, kind) => {
    expect(outlineProblem(text)).toBe(kind);
  });

  it.each(["fixture sign words", "my dog thinks i'm cool", "1.0.0", "GPL-3.0-or-later", "MIT", "fx-design-01"])(
    "passes %s",
    (text) => {
      expect(outlineProblem(text)).toBeNull();
    },
  );

  it("refuses one at the key that holds it, in any string but the path data the grammar holds", () => {
    const good = JSON.parse(decoder.decode(goodFiles().get(OUTLINE))) as { paths: string[] };
    const compact = `M1L2L3L4L5L6L7L8L9L1L2L3L4L5L6L7L8L9L1L2L3L4L5L6L7L8L9`;
    const changes = edit(
      OUTLINE,
      [["tool", "name"], "fx-tracer.exe"],
      [["source", "id"], "DSC0001"],
      [["paths"], [...good.paths, compact]],
    );
    expect(where("RT13", changes)).toEqual([`RT13 ${OUTLINE}:source.id`, `RT13 ${OUTLINE}:tool.name`]);
  });

  it("refuses, in strict mode only, words that the intent it names doesn't hold in quotation marks", () => {
    const words = (text: string): Changes => edit(OUTLINE, [["words"], text]);
    expect(of("RT13", lines(words("fixture sign word")))).toEqual([
      `RT13 ${OUTLINE}:words: not inside the quotation marks of the intent intent_ref names`,
    ]);
    expect(where("RT13", words("fixture sign word"), LENIENT)).toEqual([]);
    expect(where("RT13", words("fixture sign"))).toEqual([`RT13 ${OUTLINE}:words`]);
    expect(where("RT13", words("the fixture room holds a desk"))).toEqual([]);
  });

  it("refuses, in strict mode only, an intent_ref naming no intent, and reads a spec's intent.md", () => {
    const ref = edit(OUTLINE, [["intent_ref"], "intent-901"], [["words"], "other sign words"]);
    expect(where("RT13", ref)).toEqual([`RT13 ${OUTLINE}:intent_ref`]);
    expect(where("RT13", ref, LENIENT)).toEqual([]);
    const spec = { ...ref, "specs/901-fx-room/intent.md": "The second sign reads “other sign words”.\n" };
    expect(where("RT13", spec)).toEqual([]);
  });
});

describe("checkLine through a tree, as the compositor reads the corpus (T074; FR-035; R-15)", () => {
  const ROOT = fileURLToPath(new URL("../fixtures", import.meta.url));
  const FIXTURE = "corpus/01-fixture.md";
  const DESIGNED = "Robin designed the lantern service for the fixture clinic";
  const cite = (quote: string, file = FIXTURE) => ({ file, quote });
  const CLEAN: Item = {
    id: "lantern",
    text: "Designed the lantern service for the fixture clinic.{{slot:fixture.lanterns}}",
    verb: "designed",
    claims: [cite(DESIGNED)],
    slots: ["fixture.lanterns"],
  };
  /** Spec 002's citation cases (test/content/citations.test.ts), one failing each rule, and a clean one. */
  const ITEMS: Item[] = [
    CLEAN,
    { ...CLEAN, id: "c1", claims: [cite(DESIGNED, "corpus/README.md")] },
    { ...CLEAN, id: "c2", claims: [cite("Robin designed the moon")] },
    { id: "c3", text: "Mentions the harbor map.", claims: [cite("mentions the untagged harbor map")], slots: [] },
    {
      id: "c4",
      text: "Built the tide clock on a public server.",
      verb: "built",
      claims: [cite("The tide clock was built on a public server")],
      slots: [],
    },
    { id: "c5", text: "An old lantern.", claims: [cite("The lantern predates Robin by a century")], slots: [] },
    { ...CLEAN, id: "c6", text: "Designed the lantern service for 12 lanterns." },
    { ...CLEAN, id: "c7", slots: ["fixture.lanterns", "fixture.nope"] },
    { ...CLEAN, id: "c8", verb: "built" },
    {
      id: "c8a",
      text: "Designed the night lamp and released it to the docks.",
      claims: [cite("The night lamp was designed by Robin and released to the docks")],
      slots: [],
    },
    { id: "c9", text: "Invented the lantern for the fixture clinic.", claims: [cite(DESIGNED)], slots: [] },
    { id: "c9s", text: "Designed the lantern service, as Quillfeather.", claims: [cite(DESIGNED)], slots: [] },
  ];
  const FULL_NAME = "Robin Quillfeather";

  it("agrees with checkSource and lineContext on spec 002's fixtures", () => {
    const source: ResumeSource = {
      version: 1,
      header: { room: { name: "Robin", lines: [] } },
      sections: [{ id: "work", title: "Work", items: ITEMS }],
    };
    const expected = checkSource(source, { root: ROOT, fullName: FULL_NAME }).problems;
    expect(expected.map((p) => p.slice(0, p.indexOf(":")))).toEqual(ITEMS.slice(1).map((i) => i.id));
    const byRoot = lineContext({ root: ROOT, fullName: FULL_NAME }, "Robin");
    const byTree = treeLineContext(fileTree(ROOT), "Robin", FULL_NAME);
    expect(byTree.forbidden).toEqual(byRoot.forbidden);
    expect([...byTree.facts]).toEqual([...byRoot.facts]);
    expect(byTree.authorWords).toEqual(byRoot.authorWords);
    expect(byTree.denylist).toBe(byRoot.denylist);
    const viaTree = ITEMS.flatMap((item) => {
      const reason = checkLine(item, item.verb, byTree);
      return reason === null ? [] : [`${item.id}: ${reason}`];
    });
    expect(viaTree).toEqual(expected);
  });

  it("reads the private denylist where the tree holds it", () => {
    const denylist = encoder.encode("# one phrase per line\nlights 12 lanterns\n");
    const tree = overlayTree(fileTree(ROOT), new Map([[DENYLIST, denylist]]));
    const ctx = treeLineContext(tree, "Robin", null);
    expect(ctx.denylist).toBe("applied");
    expect(checkLine(CLEAN, "designed", ctx)).toBe(`forbidden phrase (from ${DENYLIST}:2)`);
    expect(treeLineContext(fileTree(ROOT), "Robin", null).denylist).toBe("missing");
  });

  it("gives a corpus file only for a topic file the tree holds, and reads only the corpus", () => {
    const tree = fileTree(ROOT);
    const ctx = treeLineContext(tree, "Robin", null);
    expect(ctx.corpusFile(FIXTURE)?.sentences.length).toBeGreaterThan(0);
    for (const file of [
      "corpus/README.md",
      "corpus/../corpus/01-fixture.md",
      "corpus/facts/fixture.yaml",
      "corpus/99-none.md",
    ])
      expect(ctx.corpusFile(file), file).toBeNull();
    expect(tree.log.filter((p) => !/^corpus(\/|$)/.test(p))).toEqual([]);
  });
});
