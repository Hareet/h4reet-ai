// T021 (spec 018; FR-001 (d), FR-004; plan.md §2's model): the split layout's table held to the words. The rest row is
// one row in the bar's band, so its contents at their sizes (the title toggle, "Larger conversation" at its longer
// words, the label inline, the text box's least width, Send at its longer words, and the talk button, with their gaps
// and padding), measured in IBM Plex Sans by test/ui/hud-model.ts, rounded up to a whole rem, are `split.rest.minRem`.
// The list, at most `split.list.heightRem` tall, holds "Back", its heading, the "Select a piece" label, and every entry
// of the repository's scene at its 3.25rem row, so no entry scrolls out of a window that takes the split layout.
import { describe, expect, it } from "vitest";

import { DEFAULT_METRICS, HUD_PLACEMENTS } from "../../src/room/compose/hud";
import { roomIndex } from "../helpers/room";
import { hudWords, splitModel } from "./hud-model";

const WORDS = hudWords(roomIndex());
const t = HUD_PLACEMENTS.split;

describe("the split layout's table against the words (plan.md §2)", () => {
  it("gives the rest row its contents' least width, rounded up to a whole rem", () => {
    const m = splitModel(WORDS);
    expect(m.restW).toBeGreaterThan(0);
    expect(m.restW).toBeLessThanOrEqual(t.rest.minRem * DEFAULT_METRICS.rem);
    expect(Math.ceil(m.restW / DEFAULT_METRICS.rem)).toBe(t.rest.minRem);
  });

  it("holds at a 20-pixel root too, every size in rem", () => {
    const big = { ...DEFAULT_METRICS, rem: 20 };
    expect(splitModel(WORDS, big).restW).toBeLessThanOrEqual(t.rest.minRem * big.rem);
    expect(splitModel(WORDS, big).listH).toBeLessThanOrEqual(t.list.heightRem * big.rem);
  });

  it("gives the list the height of Back, the label, and every entry of the repository's scene", () => {
    expect(WORDS.names.length).toBeGreaterThanOrEqual(4);
    const m = splitModel(WORDS);
    expect(m.listH).toBeLessThanOrEqual(t.list.heightRem * DEFAULT_METRICS.rem);
    // Every entry counted: one row fewer would be 3.25rem less.
    const fewer = splitModel({ ...WORDS, names: WORDS.names.slice(1) });
    expect(m.listH - fewer.listH).toBeCloseTo(3.25 * DEFAULT_METRICS.rem, 6);
  });
});
