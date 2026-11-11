// T070 (spec 004; FR-005, FR-029; R-02, R-05; contracts/room-data-files.md §3.4, §9): the closed lists are code. A new
// behaviour kind, renderer, signal, or UI key is a new behaviour, made through the lifecycle, so these lists are pinned
// word for word: `compose/vocabulary.ts`, which RI5 keeps the four namespaces' IDs off, and `ui-keys.ts`, the UI words'
// closed keys with exactly their slots, which RT12 holds `ui-words.yaml` to.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

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
import { WEB } from "../helpers/room";

describe("the closed vocabulary (compose/vocabulary.ts)", () => {
  it("holds exactly room-data-files.md §3.4's lists, in its order", () => {
    expect(BEHAVIOUR_KINDS).toEqual(["mount", "frame", "live-face", "glow", "switch", "cable", "selectable"]);
    // Spec 016's print, by its Amendment M18 to §5.3 (changed with T057, plan.md R-18).
    expect(RENDERERS).toEqual(["terminal", "desktop-session", "neon", "chalk", "sign", "print"]);
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
      // Spec 014 (FR-054; plan.md §9; D11): the visitor's figure showing its flat shape in 3D.
      "standin.avatar": [],
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
      // Spec 009's stand-in line (FR-013, FR-039).
      "twin.stand_in": [],
      // Spec 005's HUD (its FR-023, FR-028, FR-065; plan.md §6.10): the conversation log's header button, and the larger
      // view's two words.
      "hud.log_toggle": [],
      "talk.larger": [],
      "talk.smaller": [],
      // Spec 005's full screen (its FR-005, FR-036, FR-039; T036).
      "fullscreen.enter": [],
      "fullscreen.leave": [],
      "fullscreen.refused": [],
      "walk.help_fullscreen": [],
      "walk.entered_fullscreen": [],
      // Spec 012's loader (its FR-016, FR-030, FR-037, FR-051; D8; T013).
      "loading.heading": [],
      "loading.code": [],
      "loading.pieces": ["done", "total"],
      "loading.finishing": [],
      "loading.ready": [],
      "loading.cut_short": [],
      "hints.label": [],
      "hints.position": ["n", "total"],
      "hints.pause": [],
      "hints.play": [],
      "hints.previous": [],
      "hints.next": [],
    });
    expect(Object.keys(UI_KEYS)).toHaveLength(62);
  });

  // T013 (spec 012; FR-051; D8): the loader's twelve words join the closed list, two with their live counts' slots, and
  // every room holds them with D8's words: the repository's and the fixture set's (RT12), none stating anything about
  // the Author, no digit outside a slot (RT3).
  it("hold spec 012's loader words, in the repository's room and the fixture set's", () => {
    const words = {
      "loading.heading": "Loading the room",
      "loading.code": "Loading the room's code",
      "loading.pieces": "Loading the room's pieces: {done} of {total}",
      "loading.finishing": "Finishing the room",
      "loading.ready": "The room is ready.",
      "loading.cut_short": "The room opens now. Some pieces are still on their way and appear as they arrive.",
      "hints.label": "Hint",
      "hints.position": "Hint {n} of {total}",
      "hints.pause": "Pause hints",
      "hints.play": "Play hints",
      "hints.previous": "Previous hint",
      "hints.next": "Next hint",
    };
    for (const [key, text] of Object.entries(words)) {
      expect(UI_KEYS[key as keyof typeof UI_KEYS], key).toEqual(slotsIn(text));
      expect(text.replace(/\{[a-z]+\}/g, ""), key).not.toMatch(/\d/);
      for (const file of ["room/ui-words.yaml", "test/fixtures/room/good/apps/web/room/ui-words.yaml"]) {
        const parsed = (parse(readFileSync(join(WEB, file), "utf8")) as { words: Record<string, unknown> }).words;
        expect(parsed[key], `${file}: ${key}`).toBe(text);
      }
    }
  });

  // T022 (spec 005; FR-065): the HUD's words join the closed list with no slot, and every room holds them: the
  // repository's and the fixture set's, each with the plan's words (RT12), none stating anything about the Author (RT3).
  it("hold spec 005's HUD words with no slot, in the repository's room and the fixture set's", () => {
    const words = {
      "hud.log_toggle": "Conversation",
      "talk.larger": "Larger conversation",
      "talk.smaller": "Smaller conversation",
    };
    for (const [key, text] of Object.entries(words)) {
      expect(UI_KEYS[key as keyof typeof UI_KEYS], key).toEqual([]);
      for (const file of ["room/ui-words.yaml", "test/fixtures/room/good/apps/web/room/ui-words.yaml"]) {
        const yaml = readFileSync(join(WEB, file), "utf8");
        expect(yaml, `${file}: ${key}`).toContain(`  ${key}: ${text}\n`);
      }
    }
  });

  it("give one tier sentence for each tier value", () => {
    expect(Object.keys(UI_KEYS).filter((k) => k.startsWith("tier."))).toEqual(TIER_VALUES.map((v) => `tier.${v}`));
  });

  it("take slots only from {time}, {amount}, {name}, and spec 012's live counts, {done}, {total}, and {n}", () => {
    expect(SLOTS).toEqual(["time", "amount", "name", "done", "total", "n"]);
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
