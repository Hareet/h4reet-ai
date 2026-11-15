// T-B04 (spec 028; FR-026; User Story 4's scenarios 4 to 6; plan.md R-B2): the scene's cuts and its degraded modes, on
// the director alone.
// - Cut at the call's end (the call still shown and said, then the three hidden at once, the left line said): reduced
//   motion, quality level 1 or more, a twin that can't walk (no leg bones, the capsule), a dog shown without `walk`.
// - Cut at once when reduced motion or quality level 1 or more begins mid-scene.
// - The dog not shown (not bundled, or failed): the twin leaves with the bicycle alone, no enter, the left line the
//   twin's.
// - Paused: the scene's clock stops, and it goes on from where it was.
import { describe, expect, it } from "vitest";

import type { DinoInputs } from "../../src/room/scene/dino-scene";
import { CALL_S, DT, inputs, made, runTo } from "../helpers/dino-scene";

function cutAtCallEnd(over: Partial<DinoInputs>): void {
  const t = made();
  const i = inputs(over);
  expect(runTo(t.scene, "cut", i)).toEqual(["idle", "call", "cut"]);
  expect(t.calls).toHaveLength(1);
  expect(t.left).toHaveLength(1);
  expect(t.scene.twin.visible || t.scene.dog.visible || t.scene.bicycle.visible).toBe(false);
}

describe("cut at the call's end (FR-026)", () => {
  it("with reduced motion", () => cutAtCallEnd({ reduced: true }));
  it("at quality level 1", () => cutAtCallEnd({ level: 1 }));
  it("at quality level 2", () => cutAtCallEnd({ level: 2 }));
  it("with a twin that can't walk", () => cutAtCallEnd({ twinCanWalk: false }));
  it("with the dog shown but no walk clip", () => cutAtCallEnd({ dogHasWalk: false }));

  it("holds the call its seconds first, then says both left where the dog shows", () => {
    const t = made();
    let s = 0;
    runTo(t.scene, "call", inputs({ reduced: true }));
    while (t.scene.phase === "call") {
      t.scene.frame(DT, inputs({ reduced: true }));
      s += DT;
    }
    expect(s).toBeGreaterThanOrEqual(CALL_S - 1e-9);
    expect(t.scene.phase).toBe("cut");
    expect(t.left).toEqual(["both"]);
  });

  it("says the twin alone left where the dog doesn't show", () => {
    const t = made();
    runTo(t.scene, "cut", inputs({ reduced: true, dogShown: false }));
    expect(t.left).toEqual(["twin"]);
  });
});

describe("cut at once mid-scene (FR-026)", () => {
  it.each([
    ["reduced motion", { reduced: true }],
    ["quality level 1", { level: 1 }],
  ])("when %s begins in the gather", (_, over) => {
    const t = made();
    runTo(t.scene, "gather");
    t.scene.frame(DT, inputs());
    expect(t.scene.phase).toBe("gather");
    t.scene.frame(DT, inputs(over));
    expect(t.scene.phase).toBe("cut");
    expect(t.scene.twin.visible || t.scene.dog.visible || t.scene.bicycle.visible).toBe(false);
    expect(t.left).toEqual(["both"]);
    // Nothing after it: the cut is the end.
    runTo(t.scene, null, inputs(), 600);
    expect(t.scene.phase).toBe("cut");
    expect(t.left).toHaveLength(1);
  });

  it("when reduced motion begins in the leave", () => {
    const t = made();
    runTo(t.scene, "leave");
    t.scene.frame(DT, inputs({ reduced: true }));
    expect(t.scene.phase).toBe("cut");
  });
});

describe("the dog not shown (FR-026)", () => {
  it("leaves the twin alone with the bicycle: no enter, the dog never shown, the left line the twin's", () => {
    const t = made();
    const i = inputs({ dogShown: false });
    expect(runTo(t.scene, "gone", i)).toEqual(["idle", "call", "gather", "take", "leave", "gone"]);
    expect(t.scene.withDog).toBe(false);
    expect(t.left).toEqual(["twin"]);
  });

  it("never shows the dog on any frame", () => {
    const t = made();
    const i = inputs({ dogShown: false });
    for (let k = 0; k < 60 * 60 && t.scene.phase !== "gone"; k += 1) {
      t.scene.frame(DT, i);
      expect(t.scene.dog.visible).toBe(false);
    }
  });
});

describe("paused (FR-026)", () => {
  it("stops the scene's clock while paused, and goes on from where it was", () => {
    const a = made();
    const b = made();
    runTo(a.scene, "gather");
    runTo(b.scene, "gather");
    for (let k = 0; k < 10; k += 1) {
      a.scene.frame(DT, inputs());
      b.scene.frame(DT, inputs());
    }
    const at = { x: a.scene.twin.x, z: a.scene.twin.z };
    for (let k = 0; k < 120; k += 1) a.scene.frame(DT, inputs({ paused: true }));
    expect(a.scene.phase).toBe("gather");
    expect({ x: a.scene.twin.x, z: a.scene.twin.z }).toEqual(at);
    a.scene.frame(DT, inputs());
    b.scene.frame(DT, inputs());
    expect(a.scene.twin.x).toBeCloseTo(b.scene.twin.x, 12);
    expect(a.scene.twin.z).toBeCloseTo(b.scene.twin.z, 12);
  });

  it("doesn't start the call's clock while paused, though the call starts", () => {
    const t = made();
    t.scene.frame(DT, inputs({ paused: true }));
    expect(t.scene.phase).toBe("call");
    for (let k = 0; k < 60 * 10; k += 1) t.scene.frame(DT, inputs({ paused: true }));
    expect(t.scene.phase).toBe("call");
  });
});
