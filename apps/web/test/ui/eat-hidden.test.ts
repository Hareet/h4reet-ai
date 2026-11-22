// rework2-024 (spec 024; FR-009; rv-rework-024's I-A; page Q232): the room tells the 3D stage's eating of each change
// of the state it counts as held, at once, not at the stage's next frame, which a hidden page never draws: the pause
// toggle, the page hidden and shown again, and the loader giving way. app.ts's motion listener and its loader call the
// stage's eat.sync(); the stage reads state() then (eat-scene.test.ts covers what sync does with frames stopped).
import { describe, expect, it, vi } from "vitest";

import { button, enter, flush, setHidden, start, throughLoader } from "../helpers/room";

describe("the room tells the eating of a held state at once (FR-009; I-A)", () => {
  it("calls the stage's eat.sync on the loader's end, the toggle, and the page hidden and shown, reading each in state()", async () => {
    const v = start({ webgl: true });
    const seen: { paused: boolean; loading: boolean }[] = [];
    const sync = vi.fn(() => {
      const state = v.scene.created.at(-1)?.eating?.state();
      if (state) seen.push({ ...state });
    });
    v.scene.onCreate = () => {
      (v.scene.stage as unknown as { eat: { press: () => void; sync: () => void } }).eat = {
        press: () => undefined,
        sync,
      };
    };
    await enter(v, "engineer", "dinosaur");
    expect(v.scene.created.at(-1)?.eating, "a dinosaur visit's stage has the eating").toBeDefined();
    await throughLoader(v);
    await flush();
    expect(seen.at(-1), "the loader's end, told").toEqual({ paused: false, loading: false });
    expect(sync).toHaveBeenCalled();
    v.clock.advance(5000);
    await flush();

    sync.mockClear();
    button(v.doc, "Pause the room").click();
    expect(sync, "the toggle, at once").toHaveBeenCalledTimes(1);
    expect(seen.at(-1)?.paused).toBe(true);
    button(v.doc, "Pause the room").click();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)?.paused).toBe(false);

    sync.mockClear();
    setHidden(v.win, true);
    expect(sync, "hidden, at once, with no frame drawn").toHaveBeenCalledTimes(1);
    expect(seen.at(-1)?.paused, "the room counts hidden as paused").toBe(true);
    setHidden(v.win, false);
    expect(sync, "shown, at once").toHaveBeenCalledTimes(2);
    expect(seen.at(-1)?.paused).toBe(false);
  });
});
