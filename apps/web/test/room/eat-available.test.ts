// Spec 024 (T006; FR-001, FR-009; US3 AS1 to AS3, AS5; plan.md §5.6): the one predicate the key, the tile, and the
// tick read. True only in the 3D room, with the figure the dinosaur showing its model, at an edible piece the figure has
// reached that shows its model and has a chunk the meal lets it eat, the room not paused, the loader not showing, and
// the eating not failed.
import { describe, expect, it } from "vitest";

import { eatingAvailable } from "../../src/room/eat/available";
import type { EatAvailability } from "../../src/room/eat/available";

const clear: EatAvailability = {
  view: "3d",
  avatar: "dinosaur",
  figureModel: true,
  reached: { edible: true, model: true, canBite: true },
  paused: false,
  loading: false,
  failed: false,
};

describe("eatingAvailable (FR-001)", () => {
  it("is true with all clear", () => {
    expect(eatingAvailable(clear)).toBe(true);
  });

  it.each<[string, Partial<EatAvailability>]>([
    ["the 2D room (US3 AS1)", { view: "2d" }],
    ["the woman", { avatar: "woman" }],
    ["the man", { avatar: "man" }],
    ["the dog", { avatar: "dog" }],
    ["no avatar", { avatar: null }],
    ["the dinosaur without its model, on its flat fallback (US3 AS2)", { figureModel: false }],
    ["nothing reached", { reached: null }],
    ["a piece that isn't edible (US1 AS3)", { reached: { edible: false, model: true, canBite: false } }],
    ["a piece on its stand-in (US3 AS3)", { reached: { edible: true, model: false, canBite: true } }],
    ["no chunk the meal lets it eat (US1 AS4)", { reached: { edible: true, model: true, canBite: false } }],
    ["paused (US3 AS5)", { paused: true }],
    ["the loader showing (FR-009)", { loading: true }],
    ["the eating failed (Degraded Mode)", { failed: true }],
  ])("is false for %s", (_, change) => {
    expect(eatingAvailable({ ...clear, ...change })).toBe(false);
  });
});
