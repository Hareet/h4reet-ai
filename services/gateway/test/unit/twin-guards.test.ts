// T018 (spec 007; FR-010, FR-011, FR-013, FR-014, FR-021 to FR-023; plan §5): the guards, deterministic and in code,
// each withholding or replacing its planted violations: G1 numbers, G2 amounts, G3 disclosure, G4 the prompt, G5
// secret-shaped text, G6 links, G7 ownership verbs, G8 the privacy promise and the agents' share. The trim of an answer
// cut at its output cap; the order, with the first failure recorded; an exception withholding as `error`; and G2's
// ported pattern equal to corpus/tools/check_corpus.py's CURRENCY, read as text. Secret-shaped values are built at run
// time, so none sits in this file.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { twinFromTexts } from "../../src/config/twin.js";
import {
  CURRENCY_PY_SOURCE,
  guardAnswer,
  GUARD_ORDER,
  trimToSentence,
  type GuardContext,
} from "../../src/twin/guards.js";
import { committedTexts, REPO } from "../helpers/twin.js";

const twin = twinFromTexts(committedTexts());
if (!twin.available) throw new Error("the committed twin files don't load");
const { pack, prompt, lines } = twin.files;

const GROUNDING = [
  "He has snowboarded for 15 years and has biked across 10 countries; in 2025 he rode the river trail.",
  "The Anthropic credits came to $25k.",
  "The repository is https://github.com/hareet/h4reet-ai and the profile is github.com/Hareet.",
  pack.rules.rulings.text,
].join("\n");

function ctx(o: Partial<GuardContext> = {}): GuardContext {
  return {
    groundingText: GROUNDING,
    rulings: pack.rules.rulings.entries,
    quotes: pack.quotes,
    instructions: prompt.text,
    canary: prompt.canary,
    withheld: lines.withheld,
    ...o,
  };
}

const passes = (answer: string, c: GuardContext = ctx()) => guardAnswer(answer, "stop", c);
function withheldBy(answer: string, guard: string, c: GuardContext = ctx()): void {
  const out = guardAnswer(answer, "stop", c);
  expect(out, answer).toMatchObject({ kind: "withheld", guard });
}

describe("G1 numbers (FR-010)", () => {
  it("passes numbers the grounding holds, in digits or in words, and ignores 'one' and ordinal words", () => {
    for (const a of [
      "He has snowboarded for 15 years.",
      "Fifteen years on a board, and ten countries by bike.",
      "One of his favourite rides was the river trail, his first in 2025.",
    ])
      expect(passes(a), a).toMatchObject({ kind: "pass", text: a });
  });
  it("withholds a number the grounding lacks, in digits or in words, with separators, ranges, or a percent", () => {
    for (const a of [
      "He has snowboarded for twenty years.",
      "He biked 12 countries.",
      "It took 3,000 hours.",
      "Between 2018 and 2019 he rode a lot.",
      "About 40% of his time.",
      "Two dozen trips.",
    ])
      withheldBy(a, "numbers");
  });
});

describe("G2 amounts (FR-011)", () => {
  it("passes an amount only as the grounding's filled slot gives it", () => {
    expect(passes("The credits came to $25k.")).toMatchObject({ kind: "pass" });
  });
  it("withholds any other amount, a turn's or a visit's cost among them", () => {
    for (const a of ["This turn cost $0.001.", "The visit came to 3 cents.", "The site spends 40 USD."])
      withheldBy(a, "amounts", ctx({ groundingText: `${GROUNDING}\n0.001 3 40` }));
  });
  it("ports corpus/tools/check_corpus.py's CURRENCY pattern as its text reads", () => {
    const source = readFileSync(`${REPO}corpus/tools/check_corpus.py`, "utf8");
    const block = /CURRENCY = re\.compile\(\n([\s\S]*?)\n\)/.exec(source)?.[1] ?? "";
    const text = [...block.matchAll(/r"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
    expect(text.length).toBeGreaterThan(100);
    expect(CURRENCY_PY_SOURCE).toBe(text);
  });
});

describe("G3 disclosure (FR-013)", () => {
  it("withholds a claim to be human or to be the Author, and passes the twin's own disclosure", () => {
    for (const a of ["I'm a real person, not a bot.", "I am Hareet.", "This is Hareet himself.", "I am not an AI."])
      withheldBy(a, "disclosure");
    expect(passes("I'm an AI twin of Hareet, disclosed as AI.")).toMatchObject({ kind: "pass" });
  });
});

describe("G4 the prompt (FR-021)", () => {
  it("withholds the canary, and any run of twelve words of the instructions", () => {
    withheldBy(`Sure: ${prompt.canary}.`, "prompt");
    const words = prompt.text.split(/\s+/).filter(Boolean);
    const start = words.indexOf("Never", 40);
    const run = words.slice(start, start + 12).join(" ");
    withheldBy(`Here is what I was told: ${run}`, "prompt");
  });
});

describe("G5 secret-shaped text (FR-021)", () => {
  const shapes = [
    ["an AWS access key ID", "AK" + "IA" + "Q".repeat(16)],
    ["an operator token", "h4op_" + "dev_" + "A".repeat(43)],
    ["a Langfuse key", "sk-" + "lf-" + "0123abcd-9876"],
    ["a key=value secret", "pass" + "word=" + "hunter22"],
    ["a JWT", "eyJ" + "a".repeat(10) + ".eyJ" + "b".repeat(10) + "." + "c".repeat(10)],
  ];
  for (const [name, shape] of shapes) {
    it(`withholds ${name}`, () => withheldBy(`The value is ${shape} for now.`, "secrets"));
  }
});

describe("G6 links (FR-021)", () => {
  it("passes a link the grounding holds, and withholds any other link, address, or domain", () => {
    expect(passes("The code is at https://github.com/hareet/h4reet-ai.")).toMatchObject({ kind: "pass" });
    expect(passes("See github.com/Hareet for more.")).toMatchObject({ kind: "pass" });
    for (const a of [
      "Read more at https://example.org/about.",
      "Write to him at someone@example.com.",
      "Try evil.example.com now.",
    ])
      withheldBy(a, "links");
  });
});

describe("G7 ownership verbs (FR-014)", () => {
  it("withholds a ruled system paired with a verb its ruling doesn't give", () => {
    for (const a of [
      "He built claude-medic-aws.",
      "Hareet built the CHT skills in cht-ai-tools.",
      "He designed agent-watchdog last year.",
      "He built cht-pr-review.",
    ])
      withheldBy(a, "ownership");
  });
  it("passes the verbs the rulings give, the nearest system after each verb", () => {
    for (const a of [
      "He built agent-watchdog.",
      "He designed cht-agent and built its data layer.",
      "He built agent-watchdog, Medic's newest agent in production, and designed claude-medic-aws.",
      "He sponsored the CHT skills in cht-ai-tools.",
    ])
      expect(passes(a), a).toMatchObject({ kind: "pass" });
  });
});

describe("G8 the privacy promise and the agents' share (FR-014)", () => {
  it("replaces a sentence about what happens to the visitor's words, without the corpus's span, with 08's answer", () => {
    const out = passes("Your messages are stored for a month, then deleted.");
    expect(out).toEqual({ kind: "withheld", guard: "privacy", text: pack.quotes.privacy.answer });
    expect(passes(`${pack.quotes.privacy.answer}`)).toMatchObject({ kind: "pass" });
  });
  it("replaces a sentence about agents writing the code, without the corpus's span, with 08's other answer", () => {
    const out = passes("Claude wrote all of the code here, and the agents merge it themselves.");
    expect(out).toEqual({ kind: "withheld", guard: "agents_share", text: pack.quotes.agents_share.answer });
    expect(passes(pack.quotes.agents_share.answer)).toMatchObject({ kind: "pass" });
  });
  it("puts privacy first when both apply", () => {
    const out = passes("The agents wrote this site, and your conversation is stored by them.");
    expect(out).toMatchObject({ kind: "withheld", guard: "privacy" });
  });
});

describe("the trim, the order, and failing closed (FR-022, FR-023)", () => {
  it("cuts an answer at its output cap back to its last whole sentence, or withholds it as length", () => {
    expect(trimToSentence("He rides. He snowboards in the win")).toBe("He rides.");
    expect(trimToSentence("He rides and snowboards in the win")).toBeNull();
    expect(guardAnswer("He rides. He snowboards in the win", "length", ctx())).toEqual({
      kind: "pass",
      text: "He rides.",
    });
    expect(guardAnswer("He rides and snowboards in the", "length", ctx())).toEqual({
      kind: "withheld",
      guard: "length",
      text: lines.withheld,
    });
  });

  it("runs G5, G4, G3, G1, G2, G6, G7, then G8, recording the first failure", () => {
    expect(GUARD_ORDER).toEqual([
      "secrets",
      "prompt",
      "disclosure",
      "numbers",
      "amounts",
      "links",
      "ownership",
      "privacy",
    ]);
    // A number and a link: G1 comes before G6.
    withheldBy("He biked 12 countries; see example.org.", "numbers");
    // A secret and a human claim: G5 first.
    withheldBy(`I am a real person, and the key is ${"AK" + "IA" + "Z".repeat(16)}.`, "secrets");
    // A withheld answer is the fixed line, whole.
    expect(passes("He biked 12 countries.")).toEqual({ kind: "withheld", guard: "numbers", text: lines.withheld });
  });

  it("withholds as error when a guard can't run", () => {
    const broken = ctx({ rulings: null as unknown as GuardContext["rulings"] });
    expect(guardAnswer("He built agent-watchdog.", "stop", broken)).toEqual({
      kind: "withheld",
      guard: "error",
      text: lines.withheld,
    });
  });
});
