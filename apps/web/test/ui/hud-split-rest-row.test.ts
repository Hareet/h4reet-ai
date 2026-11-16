// verify-018 (rv-rework-018's I-2; FR-004, D-R1): the rest row is one row of the bar's band, `--split-rest-w` wide (640 px
// at §2's windows), with nothing wrapping (`flex-wrap: nowrap`). Its text box, `#talk-text`, takes talk.css's
// `flex: 1 1 6rem` and no `min-width`, so as a flex item its least width is the input's own intrinsic width, and it can't
// shrink below it: the row's contents then overflow the glass. split.css gives the rest row's input `min-width: 0`, so it
// shrinks to what the other controls leave, as D-R1's model of the row (the text box at its 6rem basis) counts.
// Spec 028's T-A03 (its FR-003, FR-004; plan.md §R-B8) rewrote the last two cases: the rest row is gone, and the
// text box row is the panel's foot, which stands open beside the room's left wall; the same rule holds there.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCss } from "../helpers/room";

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const SPLIT = parseCss(read("../../src/room/hud/split.css"));
const TALK = parseCss(read("../../src/talk/talk.css"));

const PANEL = 'html[data-split="on"][data-hud="column"] .talk';
const declared = (sheet: ReturnType<typeof parseCss>, test: (s: string) => boolean, property: string): string[] =>
  sheet.rules
    .filter(
      (r) =>
        r.selector
          .split(",")
          .map((x) => x.trim())
          .some(test) && r.declarations.has(property),
    )
    .map((r) => r.declarations.get(property) ?? "");

describe("the rest row's text box shrinks to the row (verify-018; I-2, FR-004)", () => {
  it("starts from talk.css's flexible text box, which sets no least width of its own", () => {
    expect(declared(TALK, (s) => s === ".talk-row input", "flex")).toEqual(["1 1 6rem"]);
    expect(declared(TALK, (s) => s === ".talk-row input", "min-width")).toEqual([]);
  });

  it("keeps the panel's text box row on one line (spec 028: the rest row is gone)", () => {
    expect(declared(SPLIT, (s) => s === `${PANEL} .talk-row`, "flex-wrap").at(-1)).toBe("nowrap");
    expect(SPLIT.rules.some((r) => r.selector.includes('data-panel="bar"'))).toBe(false);
  });

  it("gives the panel's text box a least width of 0, so it can shrink inside the glass (spec 028)", () => {
    const input = (s: string): boolean =>
      s === `${PANEL} .talk-row input` || s === `${PANEL} #talk-text` || s === `${PANEL} input`;
    expect(declared(SPLIT, input, "min-width").at(-1)).toBe("0");
  });
});
