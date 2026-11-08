// T016's ranking part (spec 007; FR-008; plan §4): BM25 (k1 1.2, b 0.75) over the pack's sections, built in memory.
// Tokens are lowercase, accent-folded words without a fixed English stop list, lightly stemmed. The newest visitor turn
// is the query, the previous one at half weight; sections scoring 0 never enter; ties break by pack order; identical
// inputs give identical rankings; and nothing reads a file, the network, or a store.
import { describe, expect, it } from "vitest";

import { Ranker, tokenize } from "../../src/twin/retrieve.js";

const SECTIONS = [
  { id: "a#1", text: "Snowboarding in the mountains every winter, with friends." },
  { id: "a#2", text: "Biking along the river trail, and biking to work." },
  { id: "b#1", text: "The data layer: documentation and code-context servers, and agent memory." },
  { id: "b#2", text: "Voice for CHT: the CHW speaks the visit, and the form fills itself offline." },
  { id: "c#1", text: "Seva, selfless service, brought into daily work." },
  { id: "c#2", text: "Seva, selfless service, brought into daily work." },
];

describe("the tokens", () => {
  it("are lowercase, accent-folded words, with stop words dropped and a light stem", () => {
    expect(tokenize("The Mountains, and Café biking!")).toEqual(["mountain", "cafe", "bik"]);
    expect(tokenize("is it the of and a")).toEqual([]);
    expect(tokenize("agents' memories, voiced")).toEqual(["agent", "memori", "voic"]);
  });
});

describe("the ranking (FR-008)", () => {
  const ranker = new Ranker(SECTIONS);

  it("scores the sections that share the query's words, best first, leaving out every section that scores 0", () => {
    const ranked = ranker.rank("Tell me about snowboarding in winter");
    expect(ranked[0]?.id).toBe("a#1");
    expect(ranked.every((r) => r.score > 0)).toBe(true);
    expect(ranked.map((r) => r.id)).not.toContain("b#2");
  });

  it("breaks ties by pack order", () => {
    const ranked = ranker.rank("seva service");
    expect(ranked.map((r) => r.id).slice(0, 2)).toEqual(["c#1", "c#2"]);
    expect(ranked[0]?.score).toBe(ranked[1]?.score);
  });

  it("reads the previous visitor turn at half weight, so a follow-up keeps its subject", () => {
    const alone = ranker.rank("tell me more");
    expect(alone).toEqual([]);
    const followUp = ranker.rank("tell me more", "what does the voice program do offline?");
    expect(followUp[0]?.id).toBe("b#2");
    const both = ranker.rank("biking", "voice offline");
    expect(both[0]?.id).toBe("a#2");
  });

  it("gives identical rankings for identical inputs", () => {
    expect(new Ranker(SECTIONS).rank("agent memory data")).toEqual(new Ranker(SECTIONS).rank("agent memory data"));
  });

  it("returns nothing for a query of stop words or of words no section has", () => {
    expect(ranker.rank("the and of")).toEqual([]);
    expect(ranker.rank("xylophone quasar")).toEqual([]);
  });
});
