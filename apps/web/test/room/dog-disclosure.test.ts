// T015 (spec 025; FR-028; plan.md R-12): row V1 of the data-flow disclosure names the room's dog's files among the
// avatar files fetched, in plan R-12's words, right after the twin's model and clips; no new row, and row V4 unchanged
// (Q10: no usage event names the run or the dog). Spec 002's and 016's tests pin V1's Carries whole (D-V2); their
// amendment for this clause is docs/merge-requests/proposed/025-disclosure-test-amendments.patch, for the Author's hand.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(resolve(__dirname, "../../../../docs/data-flow-disclosure.md"), "utf8");
// Spec 028 (T-B07; FR-030; plan.md R-B9, R-B8's departure): the sentence spec 025's FR-028 added becomes plan R-B9's.
const DOG =
  "the room's dog's model and clips only in a 3D visit whose visitor chose the dinosaur, so, like the chosen avatar's files, their paths show that choice";
const TWIN = "the twin's model and clips in every 3D visit above the floor, the same for every visitor";

const row = (id: string): string[] => {
  const line = SOURCE.split("\n").find((l) => l.startsWith(`| ${id} |`));
  if (!line) throw new Error(`no row ${id}`);
  return line.split("|").map((c) => c.trim());
};

describe("row V1 names the room's dog's files (FR-028)", () => {
  // Spec 028 (FR-030): was "in plan R-12's words, right after the twin's model and clips, once".
  it("in spec 028's plan R-B9's words, right after the twin's model and clips, once (spec 028, FR-030)", () => {
    const carries = row("V1")[4] ?? "";
    expect(carries).toContain(`${TWIN}; ${DOG};`);
    expect(carries.split(DOG)).toHaveLength(2);
  });

  it("adds no row, and leaves V4 without the dog or the run", () => {
    const ids = SOURCE.split("\n")
      .filter((l) => /^\| V\d+ \|/.test(l))
      .map((l) => l.split("|")[1]?.trim());
    expect(ids).toEqual([...new Set(ids)]);
    expect(row("V4").join("|")).not.toMatch(/dog|dinosaur|chase|run from/);
  });
});
