// T072 (spec 004; FR-056; R-28; data-model.md §10.2; contracts/room-bundle.md §3.2): the kernel's load order, which the
// compositor writes into the 3D part's `load_order` and the room's loader follows: the framed members of selectables
// first, in the selectables' scene order, the shown pose first; then the other framed placements; then the rest. Only
// what has a set model is listed, and a model several placements share is fetched once. Every ID is a synthetic one.
import { describe, expect, it } from "vitest";

import { loadOrder } from "../../src/room/compose/load-order";
import type { LoadEntry } from "../../src/room/compose/load-order";

const entry = (
  id: string,
  model: string | null,
  framed: boolean,
  selectable: number | null,
  shown = true,
): LoadEntry => ({
  id,
  model,
  framed,
  selectable,
  shown,
});

describe("the load order (compose/load-order.ts)", () => {
  it("puts selectables' framed members first in the selectables' order, then other framed placements, then the rest", () => {
    const entries = [
      entry("fx-a", "fx-a.glb", true, 1),
      entry("fx-b", "fx-b.glb", true, 0),
      entry("fx-c", "fx-c.glb", true, null),
      entry("fx-d", "fx-d.glb", false, null),
      entry("fx-b2", "fx-b2.glb", true, 0),
    ];
    expect(loadOrder(entries)).toEqual(["fx-b", "fx-b2", "fx-a", "fx-c", "fx-d"]);
  });

  it("lists the shown pose before the others, and a shared model once, where it first comes", () => {
    const entries = [
      entry("fx-rest", "fx-r.glb", false, null),
      entry("fx-pose-one", "fx-shared.glb", false, null, false),
      entry("fx-pose-two", "fx-shared.glb", false, null, true),
      entry("fx-twin-of-a", "fx-a.glb", true, null),
      entry("fx-a", "fx-a.glb", true, 0),
    ];
    expect(loadOrder(entries)).toEqual(["fx-a", "fx-rest", "fx-pose-two"]);
  });

  it("leaves out whatever has no set model", () => {
    expect(loadOrder([entry("fx-standin", null, true, 0), entry("fx-set", "fx-set.glb", false, null)])).toEqual([
      "fx-set",
    ]);
    expect(loadOrder([])).toEqual([]);
  });

  it("keeps a member the scene doesn't frame among the rest, where RG4 will refuse it", () => {
    expect(loadOrder([entry("fx-loose", "fx-l.glb", false, 0), entry("fx-framed", "fx-f.glb", true, null)])).toEqual([
      "fx-framed",
      "fx-loose",
    ]);
  });
});
