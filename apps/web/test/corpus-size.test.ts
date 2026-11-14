// T002 (spec 027; FR-008 to FR-012, SC-002; plan §5): the corpus size check, apps/web/build/corpus-size.ts, and its
// record, docs/corpus-size.json. The record is fresh and deterministic; its room and each pack topic's grounding are
// the fit check's (`fitProblems`), a two-file topic included; one character across T1 flips the stage, with one note;
// a file no topic holds, and a selectable's lead, never set the stage; T2 and T3 cross at their boundaries; the
// limits fall back to FR-027's defaults; it reads only the topic and facts files, the pack, the prompt, and the
// budgets; and a word is a run of non-white-space characters.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BUDGETS_PATH, PACK_PATH, PROMPT_PATH, REPO_ROOT, fitProblems, fsReader, packJson } from "../build/twin-pack";
import type { PackReader, PackSection, Selectable, TwinPack } from "../build/twin-pack";
import {
  RECORD_PATH,
  THRESHOLDS,
  buildRecord,
  computeRecord,
  measureFiles,
  measurePack,
  recordJson,
  renderLead,
  stageOf,
} from "../build/corpus-size";
import type { PackMeasure } from "../build/corpus-size";

const COMMAND = "npm run twin:pack -w apps/web";

/** A reader over a map of files, recording what it reads and lists (as twin-pack.test.ts's). */
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

const PROFILE = "corpus/00-profile.md";

const sec = (file: string, heading: string, text: string): PackSection => ({
  id: `${file.slice(7, -3)}#${heading}`,
  file,
  heading,
  kind: "section",
  text,
  chars: text.length,
  golden: null,
});

function fixturePack(o: {
  sections: PackSection[];
  topics: { id: string; files: string[] }[];
  selectables?: Selectable[];
}): TwinPack {
  return {
    schema: 1,
    generated_by: COMMAND,
    files: [...new Set(o.sections.map((s) => s.file))].sort(),
    sections: o.sections,
    rules: {
      do_not_claim: [{ file: PROFILE, text: "His home address." }],
      rulings: { file: "corpus/01-fx-strategy.md", text: "*Built:* a thing.", entries: [] },
      ownership_verbs: [],
      artifacts: [],
    },
    quotes: {
      privacy: { file: "corpus/08-fx.md", answer: "", spans: [] },
      agents_share: { file: "corpus/08-fx.md", answer: "", spans: [] },
    },
    selectables: o.selectables ?? [],
    topics: o.topics.map((t) => ({ ...t, sha256: "" })),
    sha256: "",
  };
}

/** Limits that leave a room of 10,000 − 0 − 400 − (1,000 + 2 × 16) = 8,568 with an empty prompt. */
const BUDGETS = [
  "limits:",
  "  twin:",
  "    max_input_chars: 10000",
  "    history_max_chars: 1000",
  "    history_max_turns: 2",
  "",
].join("\n");
const ROOM = 8_568;
const LIMITS = { max_input_chars: 10_000, history_max_chars: 1_000, history_max_turns: 2 };

const measure = (pack: TwinPack, packBytes = 1_000): PackMeasure =>
  measurePack({ pack, packBytes, prompt: "", budgetsText: BUDGETS });

/** A one-topic pack whose topic file has one section of `n` characters. */
const oneTopic = (n: number, selectables: Selectable[] = []): TwinPack =>
  fixturePack({
    sections: [sec(PROFILE, "Role", "A lead at Example."), sec("corpus/04-fx.md", "Riding", "x".repeat(n))],
    topics: [{ id: "fx", files: ["corpus/04-fx.md"] }],
    selectables,
  });

/** The section length that puts the one topic's grounding at the room exactly. */
function atRoom(selectables: Selectable[] = []): number {
  const m = measure(oneTopic(1_000, selectables));
  return 1_000 + (m.topics[0]?.margin ?? 0);
}

describe("the record, docs/corpus-size.json (FR-008, FR-009, FR-012)", () => {
  it("is fresh: the committed record is what the repository computes", () => {
    const committed = (() => {
      try {
        return readFileSync(join(REPO_ROOT, RECORD_PATH), "utf8");
      } catch {
        return null;
      }
    })();
    const fresh = recordJson(computeRecord(fsReader(REPO_ROOT)).record);
    expect(committed, `${RECORD_PATH} is missing or stale: run ${COMMAND} and commit it`).toBe(fresh);
  });

  it("is deterministic, holds no commit or date, and keeps its keys in order", () => {
    const a = recordJson(computeRecord(fsReader(REPO_ROOT)).record);
    const b = recordJson(computeRecord(fsReader(REPO_ROOT)).record);
    expect(a).toBe(b);
    const record = JSON.parse(a) as Record<string, unknown>;
    expect(Object.keys(record)).toEqual([
      "schema",
      "generated_by",
      "adr",
      "unit",
      "files",
      "limits",
      "model",
      "room",
      "base",
      "topics",
      "by_file",
      "free_talk",
      "pack",
      "thresholds",
      "stage",
    ]);
    expect(record.schema).toBe(1);
    expect(record.thresholds).toEqual(THRESHOLDS);
    expect(a).not.toMatch(/\b[0-9a-f]{40}\b|\b20\d\d-\d\d-\d\dT/);
    expect(a.endsWith("}\n")).toBe(true);
  });
});

describe("the room and each grounding, by the fit check's model (FR-010)", () => {
  it("names exactly the topics fitProblems names, a two-file topic among them, with the same room", () => {
    const A = "corpus/05-fx-a.md";
    const B = "corpus/06-fx-b.md";
    const C = "corpus/07-fx-c.md";
    const pack = fixturePack({
      sections: [
        sec(PROFILE, "Role", "A lead at Example."),
        sec(A, "One", "a".repeat(5_000)),
        sec(B, "Two", "b".repeat(5_000)),
        sec(C, "Three", "c".repeat(2_000)),
      ],
      topics: [
        { id: "pair", files: [A, B] },
        { id: "solo", files: [C] },
      ],
    });
    const m = measure(pack);
    expect(m.room.room).toBe(ROOM);
    const named = fitProblems(pack, LIMITS, 0);
    expect(named).toHaveLength(1);
    expect(named[0]).toContain("the topic pair needs");
    expect(named[0]).toContain(`past the ${m.room.room} the input bound leaves`);
    expect(m.topics.filter((t) => t.grounding > m.room.room).map((t) => t.id)).toEqual(["pair"]);
    expect(m.topics.map((t) => t.id)).toEqual(["pair", "solo"]);
    const pair = m.topics[0];
    expect(pair?.files).toEqual([A, B]);
    expect(named[0]).toContain(`needs ${pair?.grounding} characters`);
    // Each file of the pair fits alone: by_file is information, the pack topic sets T1.
    for (const f of [A, B]) {
      const row = m.by_file.find((r) => r.file === f);
      expect(row?.in_topics).toEqual(["pair"]);
      expect(row?.margin).toBeGreaterThan(0);
    }
    const s = stageOf(m);
    expect(s.stage).toBe(1);
    expect(s.crossed).toEqual(["T1"]);
  });
});

describe("T1 (ADR 0054's Decision 2; SC-002; FR-011)", () => {
  it("at the room exactly is stage 0, in band; one character more is stage 1, crossed, with one note", () => {
    const n = atRoom();
    const at = measure(oneTopic(n));
    expect(at.topics[0]?.grounding).toBe(ROOM);
    expect(at.topics[0]?.margin).toBe(0);
    const s0 = stageOf(at);
    expect(s0.stage).toBe(0);
    expect(s0.crossed).toEqual([]);
    expect(s0.band).toEqual(["T1"]);
    expect(fitProblems(oneTopic(n), LIMITS, 0)).toEqual([]);

    const past = measure(oneTopic(n + 1));
    expect(past.topics[0]?.margin).toBe(-1);
    const s1 = stageOf(past);
    expect(s1.stage).toBe(1);
    expect(s1.crossed).toEqual(["T1"]);
    expect(s1.band).toEqual([]);
    expect(s1.notes).toHaveLength(1);
    expect(s1.notes[0]).toMatch(/^corpus:size: T1 crossed: the topic fx needs 8,569 characters of grounding/);
    expect(s1.notes[0]).toContain("8,568");
    expect(s1.notes[0]).toContain("ADR 0054");
    expect(s1.notes[0]).toContain("stage 1");
    expect(fitProblems(oneTopic(n + 1), LIMITS, 0)).toHaveLength(1);
  });

  it("starts the band at 95% of the room, rounded up", () => {
    const n = atRoom();
    const bandStart = Math.ceil(ROOM * THRESHOLDS.t1_band);
    const below = measure(oneTopic(n - (ROOM - bandStart) - 1));
    expect(below.topics[0]?.grounding).toBe(bandStart - 1);
    expect(stageOf(below).band).toEqual([]);
    expect(stageOf(below).notes).toEqual([]);
    const inBand = measure(oneTopic(n - (ROOM - bandStart)));
    expect(stageOf(inBand).band).toEqual(["T1"]);
    expect(stageOf(inBand).notes).toHaveLength(1);
    expect(stageOf(inBand).notes[0]).toContain("T1");
  });

  it("never crosses for a file past the room that no pack topic holds", () => {
    const big = "corpus/01-fx-strategy.md";
    const pack = fixturePack({
      sections: [
        sec(PROFILE, "Role", "A lead at Example."),
        sec(big, "Strategy", "s".repeat(12_000)),
        sec("corpus/04-fx.md", "Riding", "x".repeat(100)),
      ],
      topics: [{ id: "fx", files: ["corpus/04-fx.md"] }],
    });
    const m = measure(pack);
    const row = m.by_file.find((r) => r.file === big);
    expect(row?.in_topics).toEqual([]);
    expect(row?.margin).toBeLessThan(0);
    expect(stageOf(m).crossed).not.toContain("T1");
    expect(stageOf(m).stage).toBe(0);
  });
});

describe("a selectable's lead, counted beside T1, never in it (FR-010; Q157)", () => {
  it("counts the longest rendered lead on the topic and its margin after it, and the stage doesn't move", () => {
    const short: Selectable = { id: "bicycle", topic: "fx", files: ["corpus/04-fx.md"], lead: null };
    const long: Selectable = { id: "board", topic: "fx", files: ["corpus/04-fx.md"], lead: "Winter hobbies first." };
    const mid: Selectable = { id: "skis", topic: "fx", files: ["corpus/04-fx.md"], lead: "Snow." };
    const selectables = [short, long, mid];
    const n = atRoom(selectables) - 5;
    const m = measure(oneTopic(n, selectables));
    const topic = m.topics[0];
    expect(topic?.margin).toBe(5);
    expect(topic?.lead).toBe(renderLead("Winter hobbies first.").length);
    expect(topic?.lead).toBe(41);
    expect(topic?.margin_after_lead).toBe(5 - 41);
    expect(stageOf(m).stage).toBe(0);
    expect(stageOf(m).crossed).toEqual([]);

    const none = measure(oneTopic(n, [short]));
    expect(none.topics[0]?.lead).toBe(0);
    expect(none.topics[0]?.margin_after_lead).toBe(5);
  });

  it("writes the lead as the gateway's renderLead does (services/gateway/src/twin/render.ts)", () => {
    const source = readFileSync(join(REPO_ROOT, "services/gateway/src/twin/render.ts"), "utf8");
    const template = /export const renderLead\b[^`]*`([^`]*)`/.exec(source)?.[1];
    expect(template, "renderLead's template literal in render.ts").toBeDefined();
    const gateway = (lead: string): string => (template ?? "").replace("${lead}", lead).replace(/\\n/g, "\n");
    expect(renderLead("Winter hobbies first.")).toBe(gateway("Winter hobbies first."));
    expect(renderLead(null)).toBe("");
  });
});

describe("T2 and T3 (ADR 0054's Decision 2)", () => {
  const base = measure(oneTopic(1_000));
  const withFreeTalk = (room: number, rankable: number): PackMeasure => ({
    ...base,
    free_talk: { room, rankable, share: Math.round((room / rankable) * 10_000) / 10_000 },
  });

  it("free talk's share at 5% exactly is not crossed; under it is", () => {
    expect(base.free_talk.room).toBe(ROOM - base.base.base);
    const exactly = stageOf(withFreeTalk(1_000, 20_000));
    expect(exactly.crossed).not.toContain("T2");
    expect(exactly.band).toContain("T2");
    const under = stageOf(withFreeTalk(999, 20_000));
    expect(under.crossed).toContain("T2");
    expect(under.stage).toBe(2);
    expect(under.notes.join("\n")).toMatch(/T2 crossed.*ADR 0054/);
    const atBand = stageOf(withFreeTalk(1_500, 20_000));
    expect(atBand.band).not.toContain("T2");
    expect(stageOf(withFreeTalk(1_499, 20_000)).band).toContain("T2");
  });

  it("the pack's bytes past 10 MiB, or its sections past 10,000, cross T3", () => {
    const bytes = (b: number): PackMeasure => measure(oneTopic(1_000), b);
    expect(bytes(10_485_760).pack.bytes).toBe(10_485_760);
    expect(stageOf(bytes(10_485_760)).crossed).not.toContain("T3");
    expect(stageOf(bytes(10_485_760)).band).toContain("T3");
    expect(stageOf(bytes(10_485_761)).crossed).toContain("T3");
    expect(stageOf(bytes(10_485_761)).stage).toBe(3);
    expect(stageOf(bytes(5_242_879)).band).not.toContain("T3");
    expect(stageOf(bytes(5_242_880)).band).toContain("T3");
    const sections = (n: number): PackMeasure => ({ ...base, pack: { ...base.pack, sections: n } });
    expect(stageOf(sections(10_000)).crossed).not.toContain("T3");
    expect(stageOf(sections(10_001)).crossed).toContain("T3");
    expect(stageOf(sections(10_001)).notes.join("\n")).toMatch(/T3 crossed.*ADR 0054/);
    expect(stageOf(sections(5_000)).band).toContain("T3");
    expect(stageOf(sections(4_999)).band).not.toContain("T3");
  });

  it("the stage is the highest threshold crossed", () => {
    const both: PackMeasure = { ...withFreeTalk(999, 20_000), pack: { ...base.pack, sections: 10_001 } };
    const s = stageOf(both);
    expect(s.crossed).toEqual(["T2", "T3"]);
    expect(s.stage).toBe(3);
  });
});

describe("the limits (FR-009; FR-027's defaults)", () => {
  it("takes config/budgets.yaml's limits.twin, or FR-027's defaults when it has none", () => {
    const pack = oneTopic(1_000);
    const own = measurePack({ pack, packBytes: 1, prompt: "", budgetsText: BUDGETS });
    expect(own.limits).toEqual({ source: "config/budgets.yaml", ...LIMITS });
    for (const budgetsText of [null, "limits:\n  daily_usd: 1\n"]) {
      const m = measurePack({ pack, packBytes: 1, prompt: "", budgetsText });
      expect(m.limits).toEqual({
        source: "defaults",
        max_input_chars: 32_000,
        history_max_chars: 4_000,
        history_max_turns: 8,
      });
      expect(m.room).toEqual({ instructions: 0, framing: 400, conversation: 4_128, room: 32_000 - 400 - 4_128 });
    }
  });
});

describe("what the check reads (FR-008)", () => {
  it("reads only the topic and facts files, the pack, the prompt, and the budgets", () => {
    const pack = oneTopic(1_000);
    const reader = mapReader({
      [PROFILE]: "# Profile\n\n## Role\n\nA lead.\n",
      "corpus/04-fx.md": "# Riding\n\n## Riding\n\nxxx\n",
      "corpus/facts/career.yaml": "facts: []\n",
      "corpus/facts/notes.txt": "not a facts file\n",
      "corpus/README.md": "about\n",
      "corpus/INTAKE.md": "about\n",
      "corpus/intake/interview.md": "never read\n",
      "corpus/intake/private/denylist.txt": "never read\n",
      "corpus/proposals/next.md": "never read\n",
      "corpus/tools/check.py": "never read\n",
      [PACK_PATH]: packJson(pack),
      [PROMPT_PATH]: "You are the twin.\n",
      [BUDGETS_PATH]: BUDGETS,
    });
    const { record } = computeRecord(reader);
    const allowed = (p: string): boolean =>
      /^corpus\/\d{2}-[a-z0-9-]+\.md$/.test(p) ||
      /^corpus\/facts\/[a-z0-9-]+\.yaml$/.test(p) ||
      [PACK_PATH, PROMPT_PATH, BUDGETS_PATH].includes(p);
    expect(reader.reads.filter((p) => !allowed(p))).toEqual([]);
    expect(reader.reads).toEqual(expect.arrayContaining([PROFILE, "corpus/facts/career.yaml", PACK_PATH]));
    expect([...new Set(reader.lists)].sort()).toEqual(["corpus", "corpus/facts"]);
    expect(record.files.total.files).toBe(3);
    expect(record.pack.bytes).toBe(Buffer.byteLength(packJson(pack), "utf8"));
  });
});

describe("words, bytes, and characters (FR-009; the ADR's measurement)", () => {
  it("counts a lone dash as a word, a double space as one break, and bytes as UTF-8", () => {
    const files = measureFiles(
      mapReader({
        "corpus/00-fx.md": "a — b  c\n",
        "corpus/facts/fx.yaml": "id: x\n",
        "corpus/README.md": "not measured\n",
      }),
    );
    expect(files.by_file).toEqual([
      { path: "corpus/00-fx.md", bytes: 11, words: 4, chars: 9 },
      { path: "corpus/facts/fx.yaml", bytes: 6, words: 2, chars: 6 },
    ]);
    expect(files.topic).toEqual({ files: 1, bytes: 11, words: 4, chars: 9 });
    expect(files.facts).toEqual({ files: 1, bytes: 6, words: 2, chars: 6 });
    expect(files.total).toEqual({ files: 2, bytes: 17, words: 6, chars: 15 });
  });

  it("builds the record from the measures and the stage in a fixed order", () => {
    const files = measureFiles(mapReader({ "corpus/00-fx.md": "a\n" }));
    const m = measure(oneTopic(1_000));
    const record = buildRecord(files, m, stageOf(m));
    expect(record.stage).toEqual({ stage: 0, crossed: [], band: [] });
    expect(record.room).toEqual(m.room);
    expect(record.model).toContain("leaves out the selectable's lead");
    expect(recordJson(record)).toBe(`${JSON.stringify(record, null, 2)}\n`);
  });
});
