// T029 (spec 009; FR-019 (a); plan.md R-10; SC-006): the room's wait before the hand-off, in jsdom with the stand-in 3D
// chunk (test/helpers/room.ts), whose stage gives the figures' promise (`Stage3D.figures`) and the scene's wait_ms as
// the test sets them, as the real stage does from the 3D part (src/room/scene.ts).
// - The hand-off starts when both figures are ready, or wait_ms after the 3D stage's mount, whichever comes first.
// - It starts at once where no avatar loads (the promise already settled), or where the stage gives no promise: the 2D
//   room, a stage below the floor, or one made before spec 009.
// - Its line is announced at its start, not before, within wait_ms of the mount, which spec 002's SC-005 allows.
import { describe, expect, it } from "vitest";

import { HANDOFF_LINE, announcer, enter, flush, start, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";

/** Whether the hand-off has started: runHandoff draws its progress 0 at once on the stage. */
const started = (v: Visit): boolean => v.scene.handoff.length > 0;

function waiting(v: Visit, waitMs = 1500): () => void {
  let ready: () => void = () => undefined;
  v.scene.figures = new Promise<void>((resolve) => (ready = resolve));
  v.scene.waitMs = waitMs;
  return () => ready();
}

describe("the hand-off's wait for the avatars (FR-019 (a); R-10; SC-006)", () => {
  it("starts the hand-off once both figures are ready, before wait_ms has passed", async () => {
    const v = start({ webgl: true });
    const ready = waiting(v);
    await enter(v, "engineer", "woman");
    expect(v.room.visit.mode).toBe("3d");
    expect(started(v)).toBe(false);
    v.clock.advance(400);
    await flush();
    expect(started(v)).toBe(false);
    ready();
    await flush();
    expect(started(v)).toBe(true);
    expect(v.scene.handoff[0]).toBe(0);
    expect(textOf(announcer(v.doc))).toContain(HANDOFF_LINE);
  });

  it("starts it at wait_ms after the mount where a figure isn't ready, never later", async () => {
    const v = start({ webgl: true });
    waiting(v, 1500);
    await enter(v, "engineer", "woman");
    v.clock.advance(1499);
    await flush();
    expect(started(v)).toBe(false);
    expect(textOf(announcer(v.doc))).not.toContain(HANDOFF_LINE);
    v.clock.advance(1);
    await flush();
    expect(started(v)).toBe(true);
    expect(textOf(announcer(v.doc))).toContain(HANDOFF_LINE);
  });

  it("takes the scene's wait_ms as data: 0 starts it at once", async () => {
    const v = start({ webgl: true });
    waiting(v, 0);
    await enter(v, "engineer", "woman");
    v.clock.advance(0);
    await flush();
    expect(started(v)).toBe(true);
  });

  it("starts it at once where no avatar loads, or the stage gives no figures' promise", async () => {
    const none = start({ webgl: true });
    none.scene.figures = Promise.resolve();
    none.scene.waitMs = 1500;
    await enter(none, "engineer", "dog");
    expect(started(none)).toBe(true);
    // The stand-in 3D chunk with no promise, as a stage below the floor or the 2D room gives none.
    const plain = start({ webgl: true });
    await enter(plain, "engineer", "woman");
    expect(started(plain)).toBe(true);
    const flat = start({ webgl: false });
    await enter(flat, "engineer", "woman");
    expect(flat.room.visit.mode).toBe("2d");
    expect(textOf(announcer(flat.doc))).toContain(HANDOFF_LINE);
  });
});
