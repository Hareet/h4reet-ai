// T009 (spec 007; FR-007, SC-011; plan §4): the twin's grounding pack, config/twin/corpus.json. On a fixture corpus and
// on the committed one: the builder reads only `corpus/NN-<topic>.md`, `corpus/facts/*.yaml`, and
// `config/room-topics.yaml`, never the intake, the proposals, the tools, the README, or the private denylist; it makes
// one section per `##` heading, one per Golden Q&A item, and splits a section over 2,000 characters at its bullets,
// keeping claim tags; it fills a filled, public-safe slot and renders an empty or unsafe one as its fallback or nothing;
// it holds the "Do not claim" union verbatim with each bullet's file, `01`'s rulings as `{system, verbs}`, the public
// artifacts' links, `08`'s answers for the privacy promise and the agents' share, and the selectables; its hashes are
// whole and per topic over canonical JSON; two builds are byte-identical; the committed pack is fresh, and a changed
// corpus file names itself; and the fit check names a topic past the input bound.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import {
  BUDGETS_PATH,
  CASES_DIR,
  buildCases,
  casesFiles,
  DEFAULT_TWIN_LIMITS,
  PACK_PATH,
  PROMPT_PATH,
  buildPack,
  canonicalHash,
  fitLimits,
  fitProblems,
  fsReader,
  instructionsChars,
  movedFiles,
  packJson,
  topicHashInput,
  wholeHashInput,
} from "../build/twin-pack";
import type { PackReader, TwinPack } from "../build/twin-pack";
import { REPO_ROOT } from "../build/content";

const LONG_BULLETS = Array.from(
  { length: 30 },
  (_, i) => `- \`[A 2026-11-06]\` Ride ${i}: ${"a long mountain day ".repeat(5).trim()}`,
);

const FIXTURE: Record<string, string> = {
  "corpus/00-profile.md": [
    "# Profile: who the twin represents",
    "Priority: 0 (loads first) · Status: draft · Last verified: 2026-09-27",
    "",
    "Surname: the twin never gives or confirms it `[A 2026-10-07]`.",
    "",
    "## Role at a glance",
    "",
    "- `[A-BIO]` Fixture is a lead at Example, {{slot:career.years}} there; {{slot:career.empty | else: some years}} before.",
    "- `[A]` Its budget was {{slot:career.unsafe}} in the end.",
    "",
    "## Do not claim",
    "",
    "- His home address.",
    "- That he coined the fixture words.",
    "",
    "## Golden Q&A",
    "",
    "1. *Who are you?* — I'm an AI twin of Fixture, disclosed as AI. [A-BIO]",
    "2. *(A visitor names a surname.)* — I don't confirm it. [policy]",
  ].join("\n"),
  "corpus/01-ai-strategy-and-cht.md": [
    "# AI strategy",
    "Priority: 1",
    "",
    "**Ownership rulings (2026-09-27).** *Built:* agent-watchdog, Example's side of Voice Thing; cht-agent, mainly by him (2026-10-28). *Designed:* cht-agent; claude-medic-aws, Voice Thing (the idea); the strategy, with Andra as co-author; No-Code Thing's goal. *Sponsored:* the CHT skills in cht-ai-tools, including `cht-pr-review`. *AI system architect:* No-Code Thing.",
    "",
    "## The strategy `[A-DOC strategy]`",
    "",
    "- `[A]` Two tracks.",
    "",
    "## Public artifacts",
    "",
    "- github.com/Example/cht-agent · github.com/medic/cht-agent",
    "- https://docs.example.org/ai/ (the docs)",
    "",
    "## Do not claim",
    "",
    "- That he built the CHT skills (sponsored).",
  ].join("\n"),
  "corpus/04-fx-hobbies.md": [
    "# Hobbies and travel",
    "Priority: none",
    "",
    "## Snowboarding",
    "",
    ...LONG_BULLETS,
    "",
    "## Golden Q&A",
    "",
    "1. *Do you ride in winter?* — Every winter. [A]",
  ].join("\n"),
  "corpus/08-hareet-ai.md": [
    "# The twin",
    "",
    "## How it's built `[A 2026-11-06]`",
    "",
    '- `[A 2026-11-06]` In his words: "We disclose every data flow, their conversation is not saved and they can look at the repo."',
    "",
    "## Do not claim",
    "",
    "- Any spend figure.",
    "",
    "## Golden Q&A",
    "",
    "1. *How is this built?* — AI agents in named roles do most of the typing, and only I merge. It runs locally. [A]",
    "2. *Who writes the code?* — AI agents in named roles do most of the typing, and only I merge. [A]",
    "3. *What happens to what I say here?* — We disclose every data flow, your conversation is not saved. [A]",
  ].join("\n"),
  "corpus/facts/career.yaml": [
    "facts:",
    "  - id: career.years",
    '    value: "six years"',
    "    public_safe: true",
    '    phrasing: "{value}"',
    "  - id: career.empty",
    "    value: null",
    "    public_safe: false",
    '    phrasing: "{value}"',
    "  - id: career.unsafe",
    '    value: "a held-back figure"',
    "    public_safe: false",
    '    phrasing: "{value}"',
  ].join("\n"),
  "corpus/README.md": "# README, never read\n",
  "corpus/INTAKE.md": "# INTAKE, never read\n",
  "corpus/intake/private/denylist.txt": "never read\n",
  "corpus/proposals/p.md": "never read\n",
  "corpus/tools/check_corpus.py": "never read\n",
  "config/room-topics.yaml": [
    "schema: 1",
    "selectables:",
    '  - id: "fx-board"',
    '    topic: "fx-hobbies"',
    "    corpus:",
    '      - "corpus/04-fx-hobbies.md"',
    '    lead: "Winter hobbies first."',
    '  - id: "fx-bike"',
    '    topic: "fx-hobbies"',
    "    corpus:",
    '      - "corpus/04-fx-hobbies.md"',
    "    lead: null",
  ].join("\n"),
};

/** A reader over a map of files, recording every path it reads or lists. */
function mapReader(files: Record<string, string>): PackReader & { reads: string[]; lists: string[] } {
  const reads: string[] = [];
  const lists: string[] = [];
  return {
    reads,
    lists,
    read(path) {
      reads.push(path);
      return files[path] ?? null;
    },
    list(dir) {
      lists.push(dir);
      const prefix = `${dir}/`;
      const names = Object.keys(files)
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length).split("/")[0] ?? "");
      return [...new Set(names)].sort();
    },
  };
}

function recording(root: string): PackReader & { reads: string[] } {
  const inner = fsReader(root);
  const reads: string[] = [];
  return {
    reads,
    read(path) {
      reads.push(path);
      return inner.read(path);
    },
    list: (dir) => inner.list(dir),
  };
}

const ALLOWED = (path: string): boolean =>
  /^corpus\/\d{2}-[a-z0-9-]+\.md$/.test(path) ||
  /^corpus\/facts\/[a-z0-9-]+\.yaml$/.test(path) ||
  path === "config/room-topics.yaml";

describe("the builder's reads (FR-007)", () => {
  it("reads only the topic files, the facts, and config/room-topics.yaml, on the fixture and the repository", () => {
    const fixture = mapReader(FIXTURE);
    buildPack(fixture);
    expect(fixture.reads.filter((p) => !ALLOWED(p))).toEqual([]);
    expect(fixture.reads).toContain("corpus/00-profile.md");
    expect(fixture.reads).toContain("corpus/facts/career.yaml");
    const repo = recording(REPO_ROOT);
    buildPack(repo);
    expect(repo.reads.filter((p) => !ALLOWED(p))).toEqual([]);
    for (const p of repo.reads) expect(p).not.toMatch(/intake|proposals|tools|README|INTAKE|denylist/);
  });
});

describe("the pack's sections (FR-007)", () => {
  const { pack, problems } = buildPack(mapReader(FIXTURE));

  it("builds the fixture with no problem", () => expect(problems).toEqual([]));

  it("makes one section per ## heading, the lead before it, and one per Golden Q&A item", () => {
    const ids = pack.sections.filter((s) => s.file === "corpus/00-profile.md").map((s) => [s.id, s.kind, s.heading]);
    expect(ids).toEqual([
      ["00-profile#0", "lead", "Profile: who the twin represents"],
      ["00-profile#1", "section", "Role at a glance"],
      ["00-profile#q1", "golden", "Golden Q&A 1"],
      ["00-profile#q2", "golden", "Golden Q&A 2"],
    ]);
    const q1 = pack.sections.find((s) => s.id === "00-profile#q1");
    expect(q1?.golden).toEqual({
      n: 1,
      question: "Who are you?",
      answer: "I'm an AI twin of Fixture, disclosed as AI.",
      tags: ["[A-BIO]"],
    });
    // The lead drops its metadata line.
    expect(pack.sections.find((s) => s.id === "00-profile#0")?.text).not.toContain("Priority:");
  });

  it("splits a section over 2,000 characters at its bullets, each part within the cap", () => {
    const parts = pack.sections.filter((s) => s.id.startsWith("04-fx-hobbies#1."));
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.chars).toBeLessThanOrEqual(2_000);
      expect(p.text.startsWith("- ")).toBe(true);
      expect(p.heading).toBe("Snowboarding");
    }
    expect(parts.map((p) => p.text).join("\n")).toBe(LONG_BULLETS.join("\n"));
  });

  it("keeps claim tags, fills a filled public-safe slot, and renders an empty or unsafe one as its fallback or nothing", () => {
    const role = pack.sections.find((s) => s.id === "00-profile#1")?.text ?? "";
    expect(role).toContain("`[A-BIO]`");
    expect(role).toContain("six years there");
    expect(role).toContain("some years before");
    expect(role).not.toContain("held-back");
    expect(role).not.toContain("{{slot");
  });

  it("holds every Do not claim bullet verbatim with its file, and no Do not claim section", () => {
    expect(pack.rules.do_not_claim).toEqual([
      { file: "corpus/00-profile.md", text: "His home address." },
      { file: "corpus/00-profile.md", text: "That he coined the fixture words." },
      { file: "corpus/01-ai-strategy-and-cht.md", text: "That he built the CHT skills (sponsored)." },
      { file: "corpus/08-hareet-ai.md", text: "Any spend figure." },
    ]);
    expect(pack.sections.some((s) => s.heading === "Do not claim")).toBe(false);
  });

  it("parses 01's rulings into {system, verbs}, against the paragraph's own text", () => {
    const text = FIXTURE["corpus/01-ai-strategy-and-cht.md"]?.split("\n")[3] ?? "";
    expect(pack.rules.rulings.text).toBe(text);
    const verbs = Object.fromEntries(pack.rules.rulings.entries.map((e) => [e.system, e.verbs]));
    expect(verbs).toMatchObject({
      "agent-watchdog": ["built"],
      "cht-agent": ["built", "designed"],
      "claude-medic-aws": ["designed"],
      "Voice Thing": ["designed"],
      "Example's side of Voice Thing": ["built"],
      "the strategy": ["co-authored", "designed"],
      "No-Code Thing": ["AI system architect", "designed"],
      "CHT skills in cht-ai-tools": ["sponsored"],
      "cht-pr-review": ["sponsored"],
    });
    // The rulings paragraph is a rule, not a section of the lead.
    expect(pack.sections.find((s) => s.id === "01-ai-strategy-and-cht#0")?.text ?? "").not.toContain(
      "Ownership rulings",
    );
  });

  it("holds the public artifacts' links, 08's two answers with the corpus's spans, and the selectables", () => {
    expect(pack.rules.artifacts).toEqual([
      "github.com/Example/cht-agent",
      "github.com/medic/cht-agent",
      "https://docs.example.org/ai/",
    ]);
    expect(pack.quotes.privacy).toEqual({
      file: "corpus/08-hareet-ai.md",
      answer: "We disclose every data flow, your conversation is not saved.",
      spans: ["your conversation is not saved", "We disclose every data flow"],
    });
    expect(pack.quotes.agents_share.answer).toBe("AI agents in named roles do most of the typing, and only I merge.");
    expect(pack.selectables).toEqual([
      {
        id: "fx-board",
        topic: "fx-hobbies",
        files: ["corpus/04-fx-hobbies.md"],
        lead: "Winter hobbies first.",
      },
      { id: "fx-bike", topic: "fx-hobbies", files: ["corpus/04-fx-hobbies.md"], lead: null },
    ]);
  });

  it("names a problem when 08 no longer holds the corpus's words", () => {
    const files = {
      ...FIXTURE,
      "corpus/08-hareet-ai.md": (FIXTURE["corpus/08-hareet-ai.md"] ?? "").replaceAll("not saved", "kept"),
    };
    expect(buildPack(mapReader(files)).problems.join("\n")).toContain("your conversation is not saved");
  });
});

describe("the pack's hashes and its determinism (SC-011)", () => {
  it("hashes the whole and each topic over canonical JSON", () => {
    const { pack } = buildPack(mapReader(FIXTURE));
    expect(pack.sha256).toBe(canonicalHash(wholeHashInput(pack)));
    for (const t of pack.topics) expect(t.sha256).toBe(canonicalHash(topicHashInput(pack, t.id, t.files)));
    expect(canonicalHash({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonicalHash({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });

  it("builds byte-identical packs from the same corpus", () => {
    expect(packJson(buildPack(mapReader(FIXTURE)).pack)).toBe(packJson(buildPack(mapReader(FIXTURE)).pack));
    expect(packJson(buildPack(fsReader(REPO_ROOT)).pack)).toBe(packJson(buildPack(fsReader(REPO_ROOT)).pack));
  });

  it("changes a topic's hash only when its own files, 00, or the rules change", () => {
    const base = buildPack(mapReader(FIXTURE)).pack;
    const files = {
      ...FIXTURE,
      "corpus/01-ai-strategy-and-cht.md": (FIXTURE["corpus/01-ai-strategy-and-cht.md"] ?? "").replace(
        "- `[A]` Two tracks.",
        "- `[A]` Two tracks.\n- `[A]` Three tracks.",
      ),
    };
    const moved = buildPack(mapReader(files)).pack;
    expect(moved.sha256).not.toBe(base.sha256);
    expect(moved.topics[0]?.sha256).toBe(base.topics[0]?.sha256);
  });
});

describe("the committed pack (FR-007's freshness check)", () => {
  it("equals a fresh build of the repository's corpus, with no problem; a stale one names the corpus file that moved", () => {
    const { pack, problems } = buildPack(fsReader(REPO_ROOT));
    expect(problems).toEqual([]);
    const committed = readFileSync(join(REPO_ROOT, PACK_PATH), "utf8");
    const moved = movedFiles(JSON.parse(committed) as unknown, pack);
    expect(moved, `stale: run npm run twin:pack -w apps/web (moved: ${moved.join(", ")})`).toEqual([]);
    expect(committed).toBe(packJson(pack));
  });

  it("names the corpus file whose sections moved", () => {
    const { pack } = buildPack(mapReader(FIXTURE));
    const changed = {
      ...FIXTURE,
      "corpus/04-fx-hobbies.md": (FIXTURE["corpus/04-fx-hobbies.md"] ?? "").replace("Every winter.", "Most winters."),
    };
    expect(movedFiles(JSON.parse(packJson(pack)) as unknown, buildPack(mapReader(changed)).pack)).toEqual([
      "corpus/04-fx-hobbies.md",
    ]);
  });

  it("holds the topics the room opens, and only public topic files", () => {
    const pack = JSON.parse(readFileSync(join(REPO_ROOT, PACK_PATH), "utf8")) as TwinPack;
    const topics = parse(readFileSync(join(REPO_ROOT, "config/room-topics.yaml"), "utf8")) as {
      selectables: { topic: string }[];
    };
    expect(pack.topics.map((t) => t.id)).toEqual([...new Set(topics.selectables.map((s) => s.topic))].sort());
    for (const s of pack.sections) expect(s.file).toMatch(/^corpus\/\d{2}-[a-z0-9-]+\.md$/);
    for (const s of pack.sections) expect(s.text).not.toContain("{{slot");
  });
});

describe("the fit check (plan §4, R-1; departure D5)", () => {
  it("names a topic whose grounding passes the input bound, less the instructions and a whole conversation", () => {
    const { pack } = buildPack(mapReader(FIXTURE));
    expect(
      fitProblems(pack, { max_input_chars: 32_000, history_max_chars: 4_000, history_max_turns: 8 }, 5_000),
    ).toEqual([]);
    const tight = fitProblems(pack, { max_input_chars: 13_000, history_max_chars: 4_000, history_max_turns: 8 }, 5_000);
    expect(tight.join("\n")).toContain("fx-hobbies");
  });

  it("passes the repository's pack at config/budgets.yaml's limits, or FR-027's defaults, with the real instructions", () => {
    const { pack } = buildPack(fsReader(REPO_ROOT));
    const read = (path: string): string | null => fsReader(REPO_ROOT).read(path);
    const limits = fitLimits(read(BUDGETS_PATH));
    expect(limits.max_input_chars).toBeGreaterThanOrEqual(DEFAULT_TWIN_LIMITS.max_input_chars);
    expect(fitProblems(pack, limits, instructionsChars(read(PROMPT_PATH) ?? ""))).toEqual([]);
    expect(fitLimits(null)).toEqual({ max_input_chars: 32_000, history_max_chars: 4_000, history_max_turns: 8 });
    expect(
      fitLimits("limits:\n  twin: { max_input_chars: 40000, history_max_chars: 4000, history_max_turns: 8 }\n")
        .max_input_chars,
    ).toBe(40_000);
  });
});

// T038 (spec 007; FR-016, FR-049; plan §8, departure D11): the product cases generated from the corpus by the same build
// as the pack, one for each Golden Q&A on each path, each with its feature, its anchors present in both its answer and
// its grounding, the "Do not claim" phrases of its file and 00 that its answer doesn't hold, and a check; and fresh.
describe("the golden product cases (T038; FR-049)", () => {
  const { pack } = buildPack(fsReader(REPO_ROOT));
  const cases = buildCases(pack).filter((c) => c.kind === "golden");
  const golden = pack.sections.filter((s) => s.golden !== null && !s.golden.question.startsWith("("));

  it("makes one case per Golden Q&A per path, the stage directions aside", () => {
    expect(cases).toHaveLength(golden.length * 2);
    for (const s of golden) {
      for (const path of ["engineer", "non-engineer"] as const) {
        const id = `twin-${s.id.replace("#q", "-q")}-${path}`;
        const c = cases.find((x) => x.id === id);
        expect(c, id).toBeDefined();
        expect(c?.twin.path).toBe(path);
        expect(c?.prompt).toBe(s.golden?.question);
        expect(c?.twin.turns).toEqual([{ role: "visitor", text: s.golden?.question }]);
        expect(c?.fake_response).toBe(s.golden?.answer);
      }
    }
  });

  it("asks each under a selectable of its file, one with no lead first, and free talk for every other file", () => {
    const room = parse(readFileSync(join(REPO_ROOT, "config/room-topics.yaml"), "utf8")) as {
      selectables: { id: string; corpus: string[]; lead: string | null }[];
    };
    const sources = new Set(cases.map((c) => c.source));
    for (const source of sources) {
      const feature = cases.find((c) => c.source === source)?.twin.feature;
      const pieces = room.selectables.filter((s) => s.corpus.includes(source));
      if (pieces.length === 0) {
        expect(feature, source).toBe("free_talk");
        continue;
      }
      const chosen = pieces.find((s) => s.id === feature);
      expect(chosen, source).toBeDefined();
      if (pieces.some((s) => s.lead === null)) expect(chosen?.lead, source).toBeNull();
    }
    expect([...sources].some((s) => room.selectables.some((x) => x.corpus.includes(s)))).toBe(true);
  });

  it("checks every case: up to three anchors from its answer, and no Do not claim phrase its answer lacks", () => {
    for (const c of cases) {
      expect(c.expect.contains.length, c.id).toBeGreaterThan(0);
      expect(c.expect.contains.length, c.id).toBeLessThanOrEqual(3);
      for (const a of c.expect.contains)
        expect(c.fake_response.toLowerCase(), `${c.id}: ${a}`).toContain(a.toLowerCase());
      for (const n of c.expect.not_contains) expect(c.fake_response.toLowerCase(), `${c.id}: ${n}`).not.toContain(n);
    }
  });

  it("are committed fresh, and no stale twin case is left beside them", () => {
    const files = casesFiles(buildCases(pack));
    for (const f of files) {
      expect(readFileSync(join(REPO_ROOT, f.path), "utf8"), `${f.path}: stale, run npm run twin:pack -w apps/web`).toBe(
        f.text,
      );
    }
    const committed = fsReader(REPO_ROOT)
      .list(CASES_DIR)
      .filter((n) => n.startsWith("twin-"))
      .map((n) => `${CASES_DIR}/${n}`);
    expect(committed.sort()).toEqual(files.map((f) => f.path).sort());
  });
});
