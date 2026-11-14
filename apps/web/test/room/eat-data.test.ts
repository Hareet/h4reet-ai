// Spec 024 (T001, T003; FR-002, FR-010, FR-011; plan.md §5.1, §5.5's words): the eating's room data. `edible:
// { chunks }` on a placement, 2 to 12, never on the root (the room's shell) or a figure; a top-level `eating:
// { regrow_s }`, 5 to 120, 20 by default; both strict keys. The bundle carries `edible` on each placement (null where
// it isn't edible) and `eating.regrow_s` on the 3D part. The words: `eat.button` and `eat.first_bite`, its `{name}`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { readFile } from "../../build/room/load";
import { UI_KEYS } from "../../src/room/ui-keys";
import { repositoryBundle, WEB } from "../helpers/room";
import { goodFiles } from "../helpers/room-fixtures";

const SCENE = "apps/web/room/scene.yaml";
const good = goodFiles();
const decoder = new TextDecoder();
const encoder = new TextEncoder();

type Doc = Record<string, unknown> & { placements: Record<string, unknown>[] };
const fixtureScene = (): Doc => parse(decoder.decode(good.get(SCENE))) as Doc;

/** The fixture scene with one change, read as the loader reads it: its problems as `<rule> <path>`. */
function judge(change: (doc: Doc) => void): string[] {
  const doc = fixtureScene();
  change(doc);
  const read = readFile("scene", SCENE, encoder.encode(stringify(doc)));
  return read.problems.map((p) => `${p.rule} ${p.path}`);
}

/** The fixture's placements by ID: 0 fx-shell (the root), 1 fx-desk, 7 fx-twin (a figure). */
const at = (doc: Doc, id: string): Record<string, unknown> => {
  const p = doc.placements.find((q) => q.id === id);
  if (!p) throw new Error(`no ${id}`);
  return p;
};

describe("the eating's scene keys (FR-002, FR-011)", () => {
  it("reads edible on a piece's placement and the top-level eating block", () => {
    expect(
      judge((d) => {
        at(d, "fx-desk").edible = { chunks: 6 };
        at(d, "fx-sign").edible = { chunks: 4 };
        d.eating = { regrow_s: 20 };
      }),
    ).toEqual([]);
  });

  it.each([1, 13, 4.5])("refuses %s chunks", (chunks) => {
    const seen = judge((d) => {
      at(d, "fx-desk").edible = { chunks };
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.startsWith("RD3 ") && s.includes("edible"))).toBe(true);
  });

  it("refuses edible on the room's shell, the root placement", () => {
    const seen = judge((d) => {
      at(d, "fx-shell").edible = { chunks: 4 };
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^RD3 .*edible/);
  });

  it("refuses edible on a figure, a placement with no piece of the catalogue's to eat", () => {
    const seen = judge((d) => {
      at(d, "fx-twin").edible = { chunks: 4 };
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^RD3 .*edible/);
  });

  it.each([4, 121, 20.5])("refuses eating.regrow_s %s", (regrow_s) => {
    const seen = judge((d) => {
      d.eating = { regrow_s };
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.startsWith("RD3 ") && s.includes("eating"))).toBe(true);
  });

  it("still refuses an unknown key in either block (RD2)", () => {
    expect(
      judge((d) => {
        at(d, "fx-desk").edible = { chunks: 4, bites: 2 };
      }).some((s) => s.startsWith("RD2 ")),
    ).toBe(true);
    expect(
      judge((d) => {
        d.eating = { regrow_s: 20, order: "first" };
      }).some((s) => s.startsWith("RD2 ")),
    ).toBe(true);
  });

  it("reads a scene with neither key, as every scene before spec 024", () => {
    expect(judge(() => undefined)).toEqual([]);
  });
});

describe("the repository's bundle (FR-002, FR-011)", () => {
  const { scene, index } = repositoryBundle();
  // Spec 004's FR-007: no room ID stands in a test, so each placement is found by its label's words.
  const labelled = (words: string): string => {
    const found = scene.placements.filter((p) => p.label !== null && index.ui[p.label] === words);
    if (found.length !== 1 || !found[0]) throw new Error(`${found.length} placements labelled ${words}`);
    return found[0].id;
  };

  it("carries edible on the desk (6), the busy sign, the laptop, and the chalkboard (4 each), null elsewhere", () => {
    const edible = Object.fromEntries(
      scene.placements.filter((p) => p.edible !== null).map((p) => [p.id, p.edible?.chunks]),
    );
    expect(edible).toEqual({
      [labelled("Desk")]: 6,
      [labelled("Desk sign, busy")]: 4,
      [labelled("Laptop")]: 4,
      [labelled("Chalkboard")]: 4,
    });
    expect(scene.placements.every((p) => p.edible === null || typeof p.edible.chunks === "number")).toBe(true);
  });

  it("carries eating.regrow_s, 20", () => {
    expect(scene.eating).toEqual({ regrow_s: 20 });
  });
});

describe("the eating's words (FR-010, FR-012; T003)", () => {
  const words = parse(readFileSync(join(WEB, "room/ui-words.yaml"), "utf8")) as Record<string, unknown>;
  const text = (key: string): string => {
    const value = (words.words as Record<string, unknown>)[key];
    if (typeof value !== "string") throw new Error(`no words for ${key}`);
    return value;
  };

  it("has eat.button and eat.first_bite among the room's keys", () => {
    expect(UI_KEYS).toHaveProperty(["eat.button"], []);
    expect(UI_KEYS).toHaveProperty(["eat.first_bite"], ["name"]);
  });

  it("gives eat.button its words, with no slot and no digit", () => {
    expect(text("eat.button")).toBe("Eat");
  });

  it("gives eat.first_bite its one slot, {name}, and no digit outside it", () => {
    const line = text("eat.first_bite");
    expect(line).toBe("The dinosaur ate part of the {name}.");
    expect([...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1])).toEqual(["name"]);
    expect(/\d/.test(line.replace(/\{\w+\}/g, ""))).toBe(false);
  });
});
