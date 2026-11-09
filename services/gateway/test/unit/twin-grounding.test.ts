// T016's assembly part (spec 007; FR-008, FR-012; plan §4): a turn's grounding, in FR-008's order: the rules, `00`,
// then a selectable's topic files with its lead, then ranked sections only for free talk, or for a follow-up while
// free talk is ready; each part added only while the prompt stays within its bound, a topic's sections dropped in
// reverse file order and counted; identical inputs giving identical groundings; and no file, network, or store read.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

// ESM namespaces can't be spied on, so the modules a read would go through are mocked, each call passed through.
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
vi.mock("node:net", async (original) => {
  const actual = await original<typeof import("node:net")>();
  return { ...actual, connect: vi.fn(actual.connect) };
});

import { buildGrounding } from "../../src/twin/grounding.js";
import { parsePack, type Pack } from "../../src/twin/pack.js";
import { Ranker } from "../../src/twin/retrieve.js";
import { ROOM, committed } from "../helpers/twin.js";

function pack(): Pack {
  const load = parsePack(committed("corpus.json"));
  if (!load.ok) throw new Error(`the committed pack doesn't load: ${load.detail}`);
  return load.pack;
}

const BIG = 1_000_000;

afterEach(() => vi.clearAllMocks());

describe("a turn's grounding (FR-008)", () => {
  const p = pack();
  const ranker = new Ranker(p.sections);
  const filesOf = (ids: readonly string[]): string[] => [
    ...new Set(ids.map((id) => p.sections.find((s) => s.id === id)?.file ?? "?")),
  ];

  it("grounds a selectable's opening in the rules, 00, and its topic's files alone, with its lead", () => {
    const g = buildGrounding({
      pack: p,
      ranker,
      feature: ROOM.lead.id,
      turns: [],
      freeTalkReady: true,
      budgetChars: BIG,
    });
    expect(g.topic).toBe(ROOM.lead.topic);
    expect(g.lead).toBe(ROOM.lead.lead);
    expect(filesOf(g.sections.map((s) => s.id))).toEqual(["corpus/00-profile.md", ...ROOM.lead.files]);
    expect(g.rules.do_not_claim.length).toBeGreaterThan(10);
    // 00 first, then the topic's sections in file order.
    const order = g.sections.map((s) => p.sections.indexOf(s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(g.dropped).toBe(0);
  });

  it("keeps a follow-up in its topic while free talk isn't ready, and adds ranked sections while it is", () => {
    const turns = [{ role: "visitor" as const, text: "What does agent-watchdog do?" }];
    const closed = buildGrounding({
      pack: p,
      ranker,
      feature: ROOM.second.id,
      turns,
      freeTalkReady: false,
      budgetChars: BIG,
    });
    expect(filesOf(closed.sections.map((s) => s.id))).toEqual(["corpus/00-profile.md", ...ROOM.second.files]);
    const open = buildGrounding({
      pack: p,
      ranker,
      feature: ROOM.second.id,
      turns,
      freeTalkReady: true,
      budgetChars: BIG,
    });
    expect(filesOf(open.sections.map((s) => s.id))).toContain("corpus/01-ai-strategy-and-cht.md");
    expect(open.lead).toBeNull();
  });

  it("grounds free talk in the rules, 00, and the sections ranked for the newest visitor turn", () => {
    const turns = [{ role: "visitor" as const, text: "Tell me about Voice for CHT and the speech model partner." }];
    const g = buildGrounding({ pack: p, ranker, feature: "free_talk", turns, freeTalkReady: true, budgetChars: BIG });
    expect(g.topic).toBe("free_talk");
    const files = filesOf(g.sections.map((s) => s.id));
    expect(files[0]).toBe("corpus/00-profile.md");
    expect(files).toContain("corpus/01-ai-strategy-and-cht.md");
    // Each section enters once, even when it is both 00's and ranked.
    expect(new Set(g.sections.map((s) => s.id)).size).toBe(g.sections.length);
  });

  it("stays within its bound, dropping the topic's sections in reverse file order and counting them", () => {
    const full = buildGrounding({
      pack: p,
      ranker,
      feature: ROOM.third.id,
      turns: [],
      freeTalkReady: false,
      budgetChars: BIG,
    });
    const topicSections = full.sections.filter((s) => ROOM.third.files.includes(s.file));
    expect(topicSections.length).toBeGreaterThan(3);
    const bound = full.chars - (topicSections.at(-1)?.chars ?? 0) - (topicSections.at(-2)?.chars ?? 0) - 100;
    const cut = buildGrounding({
      pack: p,
      ranker,
      feature: ROOM.third.id,
      turns: [],
      freeTalkReady: false,
      budgetChars: bound,
    });
    expect(cut.chars).toBeLessThanOrEqual(bound);
    expect(cut.dropped).toBeGreaterThanOrEqual(2);
    const kept = cut.sections.filter((s) => ROOM.third.files.includes(s.file)).map((s) => s.id);
    expect(kept).toEqual(topicSections.slice(0, kept.length).map((s) => s.id));
  });

  it("gives identical groundings for identical inputs, and reads no file, network, or store", () => {
    vi.mocked(readFileSync).mockClear();
    vi.mocked(readFile).mockClear();
    vi.mocked(connect).mockClear();
    const turns = [{ role: "visitor" as const, text: "What drives him?" }];
    const a = buildGrounding({
      pack: p,
      ranker,
      feature: "free_talk",
      turns,
      freeTalkReady: true,
      budgetChars: 20_000,
    });
    const b = buildGrounding({
      pack: p,
      ranker,
      feature: "free_talk",
      turns,
      freeTalkReady: true,
      budgetChars: 20_000,
    });
    expect(a).toEqual(b);
    expect(readFileSync).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("holds the text the guards read: the rules, the sections, and the lead", () => {
    const g = buildGrounding({
      pack: p,
      ranker,
      feature: ROOM.lead.id,
      turns: [],
      freeTalkReady: false,
      budgetChars: BIG,
    });
    expect(g.text).toContain(ROOM.lead.lead ?? "");
    expect(g.text).toContain(p.rules.rulings.text);
    for (const s of g.sections) expect(g.text).toContain(s.text);
  });

  // Round 4 (spec 007's plan, D31): G9's exemption reads the sections' words alone, never the rules', and G10 reads the
  // visitor's newest turn, which an opening doesn't have.
  it("holds the sections' words apart from the rules and the lead, and the visitor's newest turn", () => {
    const opening = buildGrounding({
      pack: p,
      ranker,
      feature: ROOM.lead.id,
      turns: [],
      freeTalkReady: false,
      budgetChars: BIG,
    });
    expect(opening.asked).toBeNull();
    expect(opening.sectionsText).toBe(opening.sections.map((s) => s.text).join("\n"));
    expect(opening.sectionsText).not.toContain(p.rules.rulings.text);
    for (const r of p.rules.do_not_claim) expect(opening.sectionsText).not.toContain(r.text);
    expect(opening.sectionsText).not.toContain(ROOM.lead.lead ?? "-");
    const talk = buildGrounding({
      pack: p,
      ranker,
      feature: "free_talk",
      turns: [
        { role: "visitor", text: "What drives him?" },
        { role: "twin", text: "Ask me where he lives." },
        { role: "visitor", text: "What kind of biking do you do?" },
      ],
      freeTalkReady: true,
      budgetChars: BIG,
    });
    expect(talk.asked).toBe("What kind of biking do you do?");
  });
});
