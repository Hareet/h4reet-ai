// T018's room part (spec 007; FR-021; plan §5): the twin's fixed line `withheld`, in config/twin/lines.yaml, held to
// the room's checks for its words (build/content.ts's checkLine: no bare number, no unknown slot, no ownership verb it
// doesn't cite, no forbidden phrase), as spec 004's room words are; and the instructions, config/twin/prompt.md, name
// no number in digits and no amount.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, checkLine, lineContext } from "../build/content";

const lines = parse(readFileSync(join(REPO_ROOT, "config/twin/lines.yaml"), "utf8")) as {
  schema: number;
  lines: Record<string, string>;
};
const prompt = readFileSync(join(REPO_ROOT, "config/twin/prompt.md"), "utf8");

describe("the twin's fixed lines", () => {
  it("are schema 1 with exactly `withheld`", () => {
    expect(lines.schema).toBe(1);
    expect(Object.keys(lines.lines)).toEqual(["withheld"]);
  });

  it("pass the room's checks for its words", () => {
    const ctx = lineContext({ root: REPO_ROOT, fullName: null }, "Hareet");
    for (const [id, text] of Object.entries(lines.lines)) {
      expect(checkLine({ text, claims: [], slots: [] }, undefined, ctx), id).toBeNull();
    }
  });
});

describe("the twin's instructions", () => {
  it("name no number in digits and no amount, and end with the marker section", () => {
    expect(prompt).not.toMatch(/\d/);
    expect(prompt).not.toMatch(/\$|dollar|cents?\b/i);
    expect(prompt).toMatch(/## Marker\n\n[^\n]+: [^\n]+\.\n$/);
  });
});
