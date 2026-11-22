// rework-024 (spec 024; FR-009's third state; plan.md §5.5's "The fall to 2D takes the tile away"): item 7's note said
// T013's tests reach the fall to 2D; they reach a visit that starts in 2D. This one reaches the fall: a 3D dinosaur
// visit with the tile offered, then the 2D view, and the tile is gone, the Eat box with it. A pin on T011b's code
// (app.ts's toFlat), written after it.
import { describe, expect, it, vi } from "vitest";

import { protectorFor } from "../../src/room/compose/protect";
import type { ProtectScene } from "../../src/room/compose/protect";
import { PROTECT_SCENE } from "../fixtures/room/protect-scene";
import { button, enter, flush, start, throughLoader } from "../helpers/room";

describe("the fall to 2D (FR-009)", () => {
  it("takes the tile and the Eat box away from a 3D dinosaur visit", async () => {
    const v = start({ webgl: true });
    v.scene.protect = protectorFor(PROTECT_SCENE as unknown as ProtectScene, 16, { eat: true });
    const press = vi.fn(() => true);
    v.scene.onCreate = () => {
      (v.scene.stage as unknown as { eat: { press: () => boolean } }).eat = { press };
    };
    await enter(v, "engineer", "dinosaur");
    await throughLoader(v);
    v.clock.advance(5000);
    await flush();
    const tile = v.doc.querySelector(".room-eat") as HTMLButtonElement;
    v.scene.created.at(-1)?.eating?.available?.(true);
    await flush();
    expect(tile.hidden, "offered in 3D").toBe(false);
    button(v.doc, "2D view").click();
    await flush();
    v.clock.advance(100);
    await flush();
    expect(tile.hidden, "gone in 2D").toBe(true);
    expect(v.doc.documentElement.getAttribute("data-eat-place"), "no Eat box in 2D").toBe("off");
    tile.click();
    expect(press).not.toHaveBeenCalled();
  });
});
