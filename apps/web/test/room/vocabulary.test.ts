// T070 (spec 004; FR-005, FR-029; R-02, R-05; contracts/room-data-files.md §3.4, §9): the closed lists are code. A new
// behaviour kind, renderer, signal, or UI key is a new behaviour, made through the lifecycle, so these lists are pinned
// word for word: `compose/vocabulary.ts`, which RI5 keeps the four namespaces' IDs off, and `ui-keys.ts`, the UI words'
// closed keys with exactly their slots, which RT12 holds `ui-words.yaml` to.
import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  BEHAVIOUR_KINDS,
  GLOW_MOTIONS,
  LIVE_SWITCHES,
  LOOK_METHODS,
  PRIMITIVES,
  REGION_SOURCES,
  RENDERERS,
  ROLES,
  SIGNALS,
  STANDIN_SHAPES,
  TIER_VALUES,
  TURN_COST_PARTS,
  TYPEFACE_USES,
  SIDE_WALL_ANCHORS,
  VOCABULARY,
  isSideWallAnchor,
  isVocabulary,
} from "../../src/room/compose/vocabulary";
import { LABEL_KEY, SLOTS, UI_KEYS, isUiKey, slotsIn } from "../../src/room/ui-keys";

describe("the closed vocabulary (compose/vocabulary.ts)", () => {
  it("holds exactly room-data-files.md §3.4's lists, in its order", () => {
    expect(BEHAVIOUR_KINDS).toEqual(["mount", "frame", "live-face", "glow", "switch", "cable", "selectable"]);
    expect(RENDERERS).toEqual(["terminal", "desktop-session", "neon", "chalk", "sign"]);
    expect(SIGNALS).toEqual(["tier", "turn-cost"]);
    expect(TIER_VALUES).toEqual([
      "local",
      "cloud",
      "resting",
      "budget",
      "unavailable",
      "unknown",
      "paused",
      "not-live",
    ]);
    expect(TURN_COST_PARTS).toEqual(["call", "visit"]);
    expect(ACTIONS).toEqual(["talk", "resume"]);
    expect(ROLES).toEqual(["twin", "visitor"]);
    expect(STANDIN_SHAPES).toEqual([
      "box",
      "cylinder",
      "capsule",
      "sphere",
      "torus",
      "plane",
      "circle",
      "tube",
      "polygon",
    ]);
    expect(PRIMITIVES).toEqual(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"]);
    expect(LOOK_METHODS).toEqual(["inked-cel", "painted", "flat"]);
    expect(TYPEFACE_USES).toEqual(["terminal", "desktop-session", "chalk", "neon", "counters"]);
    expect(GLOW_MOTIONS).toEqual(["flicker", "breathe", "steady"]);
    expect(REGION_SOURCES).toEqual(["resume_titles"]);
    expect(LIVE_SWITCHES).toEqual(["off", "site"]);
  });

  it("gathers every word of every list for RI5, and nothing else", () => {
    const all = [
      BEHAVIOUR_KINDS,
      RENDERERS,
      SIGNALS,
      TIER_VALUES,
      TURN_COST_PARTS,
      ACTIONS,
      ROLES,
      STANDIN_SHAPES,
      PRIMITIVES,
      LOOK_METHODS,
      TYPEFACE_USES,
      GLOW_MOTIONS,
      REGION_SOURCES,
      LIVE_SWITCHES,
    ].flat();
    expect([...VOCABULARY].sort()).toEqual([...new Set<string>(all)].sort());
    expect(isVocabulary("twin")).toBe(true);
    expect(isVocabulary("not-live")).toBe(true);
    expect(isVocabulary("fx-piece")).toBe(false);
    expect(isVocabulary("Twin")).toBe(false);
  });
});

describe("the UI words' closed keys (ui-keys.ts)", () => {
  it("hold exactly room-data-files.md §9's keys, each with exactly its slots", () => {
    expect(UI_KEYS).toEqual({
      "tier.local": [],
      "tier.cloud": [],
      "tier.resting": [],
      "tier.budget": [],
      "tier.unavailable": [],
      "tier.unknown": [],
      "tier.paused": [],
      "tier.not-live": [],
      "pause.button": [],
      "pause.paused_at": ["time"],
      "sign.word": [],
      "sign.second_line": [],
      "sign.call_label": [],
      "sign.visit_label": [],
      "sign.no_call_yet": [],
      "sign.unavailable": [],
      "sign.local": ["amount"],
      "sign.estimated": ["amount"],
      "sign.at_least": ["amount"],
      "sign.not_affiliated": [],
      "sign.test": [],
      "sign.sample": [],
      "around.heading": [],
      "around.illustration": [],
      "around.call": ["amount"],
      "around.visit": ["amount"],
      "list.heading": [],
      "list.resume_action": [],
      "toolbar.credits": [],
      "standin.label": ["name"],
      "standin.note": [],
      "draft.badge": [],
      // The stage's line when the 2D drawing can't be drawn (FR-081; the Author, 2026-10-30: "flat-failed is good").
      "flat-failed": [],
      // Spec 008's Amendment M12: FR-059's seven keys, the last with the target's name.
      "walk.enter": [],
      "walk.leave": [],
      "walk.region": [],
      "walk.help": [],
      "walk.entered": [],
      "walk.left": [],
      "walk.target": ["name"],
    });
    expect(Object.keys(UI_KEYS)).toHaveLength(40);
  });

  it("give one tier sentence for each tier value", () => {
    expect(Object.keys(UI_KEYS).filter((k) => k.startsWith("tier."))).toEqual(TIER_VALUES.map((v) => `tier.${v}`));
  });

  it("take slots only from {time}, {amount}, and {name}", () => {
    expect(SLOTS).toEqual(["time", "amount", "name"]);
    for (const slots of Object.values(UI_KEYS)) for (const slot of slots) expect(SLOTS).toContain(slot);
  });

  it("read a UI word's slots, in order, each once", () => {
    expect(slotsIn("Paused at {time}")).toEqual(["time"]);
    expect(slotsIn("{amount} est.")).toEqual(["amount"]);
    expect(slotsIn("no slot here")).toEqual([]);
    expect(slotsIn("{name} and {amount} and {name}")).toEqual(["name", "amount", "name"]);
    // Only a slot's own form counts: braces around anything else are text.
    expect(slotsIn("{ time } {Time} {topic} {}")).toEqual(["topic"]);
  });

  it("tell a closed key from a data label, `label.<name>`, whose name follows the ID grammar", () => {
    expect(isUiKey("sign.word")).toBe(true);
    expect(isUiKey("label.fx-piece")).toBe(false);
    expect(LABEL_KEY.test("label.fx-piece")).toBe(true);
    expect(LABEL_KEY.test("label.x")).toBe(false);
    expect(LABEL_KEY.test("label.Fx")).toBe(false);
    expect(LABEL_KEY.test(`label.a${"b".repeat(40)}`)).toBe(true);
    expect(LABEL_KEY.test(`label.a${"b".repeat(41)}`)).toBe(false);
    expect(LABEL_KEY.test("sign.word")).toBe(false);
  });
});

// T292 (spec 004; FR-064; contracts/room-data-files.md §13.3): the shell's side-wall anchors are reserved names, both
// side walls under Reading R2's default, with a type guard; they name anchors, not IDs, so RI5 doesn't hold them.
describe("the side-wall anchors (compose/vocabulary.ts)", () => {
  it("are left-wall and right-wall, outside the IDs' vocabulary", () => {
    expect(SIDE_WALL_ANCHORS).toEqual(["left-wall", "right-wall"]);
    expect(SIDE_WALL_ANCHORS.map(isSideWallAnchor)).toEqual([true, true]);
    for (const other of ["back-wall", "wall", "floor", "Left-wall", "left-wall "])
      expect(isSideWallAnchor(other), other).toBe(false);
    for (const name of SIDE_WALL_ANCHORS) expect(isVocabulary(name)).toBe(false);
  });
});
