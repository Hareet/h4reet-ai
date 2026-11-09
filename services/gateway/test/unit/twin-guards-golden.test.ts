// T019 (spec 007; FR-049, SC-002; plan §5, R-3): every Golden Q&A answer in the committed pack, "the exact answer the
// twin should give" (the corpus README), passes every guard against the grounding its generated case's feature gives:
// its topic's selectable for 04 to 06 (the bicycle for 04, so no lead applies), and free talk, with its own question
// as the visitor's turn, for every other file. A guard that withholds one of them would withhold the Author's words.
// Each runs with the context the route builds (src/twin/turn.ts's guardContext), its question as the visitor's newest
// turn, so G10 reads a place question where one is asked (D31).
import { describe, expect, it } from "vitest";

import { twinFromTexts } from "../../src/config/twin.js";
import { buildGrounding } from "../../src/twin/grounding.js";
import { guardAnswer } from "../../src/twin/guards.js";
import { Ranker } from "../../src/twin/retrieve.js";
import { guardContext } from "../../src/twin/turn.js";
import { committedTexts } from "../helpers/twin.js";

const twin = twinFromTexts(committedTexts());
if (!twin.available) throw new Error("the committed twin files don't load");
const { pack } = twin.files;
const ranker = new Ranker(pack.sections);

/** The feature a file's golden cases are asked under (plan §8). */
function featureOf(file: string): string {
  const selectable = pack.selectables
    .filter((s) => s.files.includes(file))
    .sort((a, b) => (a.lead === null ? 0 : 1) - (b.lead === null ? 0 : 1))[0];
  return selectable?.id ?? "free_talk";
}

const golden = pack.sections.filter((s) => s.golden !== null);

describe("the guards pass every Golden Q&A answer against its own grounding (FR-049, SC-002)", () => {
  it("has the corpus's Golden Q&A, from every topic file", () => {
    expect(golden.length).toBeGreaterThan(60);
    expect(new Set(golden.map((s) => s.file)).size).toBe(pack.files.length);
  });

  for (const section of golden) {
    const g = section.golden;
    if (g === null) continue;
    it(`passes ${section.id}`, () => {
      const feature = featureOf(section.file);
      const grounding = buildGrounding({
        pack,
        ranker,
        feature,
        turns: [{ role: "visitor", text: g.question }],
        freeTalkReady: true,
        budgetChars: 1_000_000,
      });
      const out = guardAnswer(g.answer, "stop", guardContext(twin.files, grounding));
      expect(out, `${section.id} (${feature}): ${g.answer}`).toEqual({ kind: "pass", text: g.answer });
    });
  }
});
