// T027's check (spec 007; plan's Performance Goals, a plan choice): a turn's grounding and guards, on the committed
// pack, take under 20 ms in the gateway's process, so the twin's own work adds nothing a visitor waits on beside the
// model. Measured as the mean of many free-talk turns, the heaviest kind, since they rank every section.
import { describe, expect, it } from "vitest";

import { twinFromTexts } from "../../src/config/twin.js";
import { buildGrounding } from "../../src/twin/grounding.js";
import { guardAnswer } from "../../src/twin/guards.js";
import { buildMessages } from "../../src/twin/prompt.js";
import { Ranker } from "../../src/twin/retrieve.js";
import { committedTexts } from "../helpers/twin.js";

describe("the twin's own work per turn", () => {
  it("builds the grounding and the messages and runs every guard in under 20 ms a turn", () => {
    const twin = twinFromTexts(committedTexts());
    if (!twin.available) throw new Error("the committed twin files don't load");
    const { pack, prompt, lines } = twin.files;
    const ranker = new Ranker(pack.sections);
    const golden = pack.sections.flatMap((s) => (s.golden === null ? [] : [s.golden]));
    const runs = 60;
    const started = performance.now();
    for (let i = 0; i < runs; i += 1) {
      const g = golden[i % golden.length];
      if (g === undefined) continue;
      const turns = [{ role: "visitor" as const, text: g.question }];
      const grounding = buildGrounding({
        pack,
        ranker,
        feature: "free_talk",
        turns,
        freeTalkReady: true,
        budgetChars: 22_000,
      });
      buildMessages({ files: twin.files, grounding, feature: "free_talk", path: "engineer", turns });
      guardAnswer(g.answer, "stop", {
        groundingText: grounding.text,
        rulings: pack.rules.rulings.entries,
        quotes: pack.quotes,
        instructions: prompt.text,
        canary: prompt.canary,
        withheld: lines.withheld,
      });
    }
    const perTurn = (performance.now() - started) / runs;
    expect(perTurn).toBeLessThan(20);
  });
});
