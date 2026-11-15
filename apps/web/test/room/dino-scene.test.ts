// T-B04 (spec 028; FR-019 to FR-024; SC-004; plan.md R-B2): the dinosaur's scene's director, scene/dino-scene.ts, on
// numbers alone with a scripted clock.
// - It leaves `idle` only at the first frame of a dinosaur visit whose hand-off has ended, whose visitor's figure
//   shows the dinosaur's model, in the 3D room (FR-019); never in a woman's, a man's, or a dog's visit.
// - The phases in order: call, enter, gather, take, leave, gone; the call lasts its seconds and is said once; the dog
//   shows at the path's last point and walks the path reversed to `meet`; the twin and the dog walk to the floor below
//   the bicycle; the bicycle is taken over `take_s`; the three go out along the path and are hidden at its end; the left
//   line is said once, for both. The whole within SC-004's bound.
// - Never twice a visit: after `gone`, nothing more.
import { describe, expect, it } from "vitest";

import { DOG_STOP_M } from "../../src/room/scene/dino-scene";
import type { DinoPhase } from "../../src/room/scene/dino-scene";
import { CALL_S, DT, HOME, LEAVE, inputs, made, runTo } from "../helpers/dino-scene";

const length = (pts: readonly (readonly [number, number])[]): number =>
  pts.slice(1).reduce((sum, p, k) => sum + Math.hypot(p[0] - pts[k]![0], p[1] - pts[k]![1]), 0);

describe("its start (FR-019)", () => {
  it.each([
    ["the woman chosen", { chosen: "woman" as const }],
    ["the man chosen", { chosen: "man" as const }],
    ["the dog chosen", { chosen: "dog" as const }],
    ["the hand-off not ended", { handedOff: false }],
    ["the dinosaur's cut-out (its model not shown)", { modelShown: false }],
    ["the 2D room", { view3d: false }],
  ])("stays idle with %s, and says nothing", (_, over) => {
    const t = made();
    runTo(t.scene, null, inputs(over), 600);
    expect(t.scene.phase).toBe("idle");
    expect(t.calls).toEqual([]);
    expect(t.left).toEqual([]);
    expect(t.scene.twin.visible).toBe(true);
    expect(t.scene.dog.visible).toBe(false);
    expect(t.scene.carried.visible).toBe(true);
  });

  it("starts at the first frame all hold, whether the model arrived late or not", () => {
    const t = made();
    runTo(t.scene, null, inputs({ modelShown: false }), 30);
    expect(t.scene.phase).toBe("idle");
    t.scene.frame(DT, inputs());
    expect(t.scene.phase).toBe("call");
    expect(t.calls).toHaveLength(1);
  });
});

describe("its phases (FR-020 to FR-023; SC-004)", () => {
  it("goes call, enter, gather, take, leave, gone, in order, saying the call and the left line once each", () => {
    const t = made();
    expect(runTo(t.scene, "gone")).toEqual(["idle", "call", "enter", "gather", "take", "leave", "gone"]);
    expect(t.calls).toHaveLength(1);
    expect(t.left).toEqual(["both"]);
    expect(t.scene.withDog).toBe(true);
  });

  it("holds the call for its seconds", () => {
    const t = made({ call: 2 });
    runTo(t.scene, "call");
    let s = 0;
    while (t.scene.phase === "call") {
      t.scene.frame(DT, inputs());
      s += DT;
    }
    expect(s).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(s).toBeLessThan(2 + 2 * DT);
  });

  it("shows the dog at the path's last point and walks it the path reversed to meet", () => {
    const t = made();
    runTo(t.scene, "enter");
    const last = LEAVE.path.at(-1)!;
    expect(t.scene.dog.visible).toBe(true);
    expect(Math.hypot(t.scene.dog.x - last[0], t.scene.dog.z - last[1])).toBeLessThan(LEAVE.dog_mps * DT + 1e-9);
    runTo(t.scene, "gather");
    // The enter's end leaves it at meet, and it took the path's points in reverse on the way (its arc length).
    expect(Math.hypot(t.scene.dog.x - LEAVE.meet[0], t.scene.dog.z - LEAVE.meet[1])).toBeLessThan(
      LEAVE.dog_mps * DT + 1e-6,
    );
  });

  it("brings the twin to take_at and the dog within DOG_STOP_M of it, then takes the piece over take_s", () => {
    const t = made();
    runTo(t.scene, "take");
    const [ux, uz] = LEAVE.take_at;
    expect(Math.hypot(t.scene.twin.x - ux, t.scene.twin.z - uz)).toBeLessThan(1e-6);
    expect(Math.hypot(t.scene.dog.x - ux, t.scene.dog.z - uz)).toBeCloseTo(DOG_STOP_M, 6);
    expect(t.scene.carried.taken).toBeLessThanOrEqual(DT / LEAVE.take_s + 1e-9);
    let s = 0;
    while (t.scene.phase === "take") {
      t.scene.frame(DT, inputs());
      s += DT;
    }
    expect(s).toBeGreaterThanOrEqual(LEAVE.take_s - 1e-9);
    expect(s).toBeLessThan(LEAVE.take_s + 2 * DT);
    expect(t.scene.carried.taken).toBe(1);
  });

  it("goes out along the path and hides the three at its end", () => {
    const t = made();
    runTo(t.scene, "leave");
    expect(t.scene.twin.visible && t.scene.dog.visible && t.scene.carried.visible).toBe(true);
    runTo(t.scene, "gone");
    const last = LEAVE.path.at(-1)!;
    expect(Math.hypot(t.scene.twin.x - last[0], t.scene.twin.z - last[1])).toBeLessThan(1e-6);
    expect(t.scene.twin.visible).toBe(false);
    expect(t.scene.dog.visible).toBe(false);
    expect(t.scene.carried.visible).toBe(false);
  });

  it("moves the twin only in gather and leave, and the dog in enter, gather, and leave", () => {
    const t = made();
    const twinMoves = new Set<DinoPhase>();
    const dogMoves = new Set<DinoPhase>();
    for (let k = 0; k < 60 * 60 && t.scene.phase !== "gone"; k += 1) {
      t.scene.frame(DT, inputs());
      if (t.scene.twin.moving) twinMoves.add(t.scene.phase);
      if (t.scene.dog.moving) dogMoves.add(t.scene.phase);
    }
    expect([...twinMoves].sort()).toEqual(["gather", "leave"]);
    expect([...dogMoves].sort()).toEqual(["enter", "gather", "leave"]);
  });

  it("ends within SC-004's bound: the paths over their speeds, the call, and the take, plus 2 s", () => {
    const t = made();
    let s = 0;
    while (t.scene.phase !== "gone" && s < 120) {
      t.scene.frame(DT, inputs());
      s += DT;
    }
    const home: [number, number] = [HOME.x, HOME.z];
    const enter = length([...[...LEAVE.path].reverse(), LEAVE.meet]) / LEAVE.dog_mps;
    const gather = length([home, LEAVE.take_at]) / LEAVE.walk_mps;
    const leave = length([LEAVE.take_at, ...LEAVE.path]) / LEAVE.walk_mps;
    expect(t.scene.phase).toBe("gone");
    expect(s).toBeLessThan(CALL_S + enter + gather + LEAVE.take_s + leave + 2);
  });

  it("never runs twice a visit: after gone, frames change nothing", () => {
    const t = made();
    runTo(t.scene, "gone");
    for (let k = 0; k < 600; k += 1) t.scene.frame(DT, inputs());
    expect(t.scene.phase).toBe("gone");
    expect(t.calls).toHaveLength(1);
    expect(t.left).toHaveLength(1);
    expect(t.scene.twin.visible || t.scene.dog.visible || t.scene.carried.visible).toBe(false);
  });
});
