// T-B08 (spec 028; FR-027; SC-006; plan.md R-B7): the room's build bundles a dog visitor's introduction from the
// corpus slot `hobbies.dog_visitor_intro`, read from `corpus/facts/*.yaml` as the twin's pack reads a slot (only a value
// whose `public_safe` is true), into the room's index (`dog_visitor_intro`), which the 3D and the 2D room both read.
// - Filled and public-safe: the value, verbatim.
// - Null, not public-safe, absent, or not a string: null. Nothing else ever fills it: no worker's text, no default.
// - The repository's own bundle: null, the slot not filled on main (the proposal is for the Author's hand).
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { overlay } from "../helpers/room-fixtures";
import { repositoryBundle } from "../helpers/room";

const FACTS = "corpus/facts/hobbies-and-travel.yaml";
const LINE = "A made-up sentence for the tests, never the Author's.";

function facts(slot: Record<string, unknown> | null): string {
  const list = slot === null ? [] : [{ id: "hobbies.dog_visitor_intro", label: "The fixture's slot", ...slot }];
  return stringify({ topic: "04-hobbies-and-travel", facts: list });
}
const introOf = (text: string | null): string | null => {
  const tree = overlay(text === null ? {} : { [FACTS]: text });
  return compose(tree, noPolicy(), { mode: "lenient", drafts: false }).index.dog_visitor_intro;
};

describe("the introduction's slot in the room's index (FR-027)", () => {
  it("carries a filled, public-safe value verbatim", () => {
    expect(introOf(facts({ value: LINE, public_safe: true, phrasing: "{value}" }))).toBe(LINE);
  });

  it.each([
    ["a null value", { value: null, public_safe: true }],
    ["public_safe null", { value: LINE, public_safe: null }],
    ["public_safe false", { value: LINE, public_safe: false }],
    ["a value that isn't a string", { value: 3, public_safe: true }],
  ])("carries null for %s", (_, slot) => {
    expect(introOf(facts(slot))).toBeNull();
  });

  it("carries null with no such slot, and with no facts file", () => {
    expect(introOf(facts(null))).toBeNull();
    expect(introOf(null)).toBeNull();
  });

  it("is null in the repository's own bundle: main's slot isn't filled", () => {
    expect(repositoryBundle().index.dog_visitor_intro).toBeNull();
  });
});
