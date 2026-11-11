// T051 (spec 016; FR-039; plan.md R-13; contracts/twin-data.md §6; SC-018): the shirt's outline and its sources.
// - The committed outline, apps/web/content/room/outlines/twin-shirt-lettering.outline.json, equals
//   build/room/lettering.ts's conversion of the committed SVG and JSON, field for field, and byte for byte as written.
// - The converter refuses a foreign element, an href, another fill, and another view box, naming the element's index,
//   never its content.
// - The outline passes RT13 in a strict build, its words inside the quotation marks of intent-016.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { convertLettering, formatOutline, LETTERING_DIR, OUTLINE_PATH } from "../../build/room/lettering";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";
import { REPO } from "../helpers/room";

const read = (path: string): string => readFileSync(join(REPO, path), "utf8");
const SVG = read(`${LETTERING_DIR}/twin-shirt-lettering.svg`);
const JSON_TEXT = read(`${LETTERING_DIR}/twin-shirt-lettering.json`);

describe("the shirt's outline (FR-039; SC-018)", () => {
  it("is the committed file, the conversion of the committed SVG and JSON, field for field and byte for byte", () => {
    const outline = convertLettering(SVG, JSON_TEXT);
    const committed = JSON.parse(read(OUTLINE_PATH)) as unknown;
    expect(committed).toEqual(outline);
    expect(read(OUTLINE_PATH)).toBe(formatOutline(outline));
  });

  it("holds the SVG's paths in order, unchanged, the JSON's words, the 180 × 70 view box, and the larger cap height", () => {
    const outline = convertLettering(SVG, JSON_TEXT);
    const paths = [...SVG.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
    expect(outline.paths).toEqual(paths);
    expect(outline.paths).toHaveLength(22);
    expect(outline.words).toBe((JSON.parse(JSON_TEXT) as { words: string }).words);
    expect(outline.view_box).toEqual([0, 0, 180, 70]);
    expect(outline.cap_height).toBe(14.674);
    expect(outline.advance).toBe(180);
    expect(outline).toMatchObject({
      schema: 1,
      sign: "twin-shirt-lettering",
      intent_ref: "intent-016",
      source: { type: "design", id: "D-0002" },
      tool: { name: "the room's outline converter", version: "spec-016.1", license: "mit" },
    });
  });

  it.each([
    ["a foreign element", SVG.replace("<path d=", '<circle r="1"/><path d='), /element 0/],
    ["an href", SVG.replace('<path d="', '<path href="#x" d="'), /element 0/],
    ["another fill", SVG.replace('fill="#000000"', 'fill="#ff0000"'), /element 0/],
    ["another view box", SVG.replace('viewBox="0 0 180 70"', 'viewBox="0 0 200 70"'), /view box/],
    ["a second root", `${SVG}<svg/>`, /root/],
  ])("refuses %s, naming the element's index and never its content", (_, svg, message) => {
    expect(() => convertLettering(svg, JSON_TEXT)).toThrow(message);
    try {
      convertLettering(svg, JSON_TEXT);
    } catch (e) {
      expect(String(e)).not.toMatch(/M 13\.5|#ff0000|#x/);
    }
  });

  it("refuses a JSON without its words or its cap heights", () => {
    expect(() => convertLettering(SVG, "{}")).toThrow(/words/);
    expect(() => convertLettering(SVG, JSON.stringify({ words: "x" }))).toThrow(/cap_height_mm/);
  });

  it("passes RT13 in a strict build, its words inside intent-016's quotation marks", () => {
    const result = compose(fileTree(REPO), readRoomPolicy({ env: {}, root: REPO }), { mode: "strict", drafts: true });
    expect(result.findings.filter((f) => f.file === OUTLINE_PATH)).toEqual([]);
  });
});
