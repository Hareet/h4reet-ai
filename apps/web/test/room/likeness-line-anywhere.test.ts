// T014 (spec 020; FR-007; plan.md R-02, reworked for Q69): the likeness line shows wherever the dog's model shows, the
// visitor's figure or another figure of the room (spec 025's dog figure, the "dog" FigureId).
// - src/room/likeness-line.ts holds each figure's latest picture line, or none, and gives the line while one figure or
//   more holds it, once; a figure's next picture signal without a line drops its own.
// - The room feeds it the picture signals of every figure but the twin's (the twin's likeness has its own slot, spec
//   016's, which dog-line.test.ts pins: the twin's picture never fills this one), and shows its line once, in the
//   stage's note and in "Around the room"; the twin's line slot stays as it was; a 2D room shows no line.
import { describe, expect, it } from "vitest";

import { createLikenessLine } from "../../src/room/likeness-line";
import type { FigureId, FigureSignal } from "../../src/room/stage";
import { button, flush, intoRoom, start, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";

const LINE = "The dog is an AI-made likeness of the Author's dog, shown with his consent.";
/** Spec 025's room figure, the room's dog (its FR-019, FR-020): the `"dog"` FigureId. */
const ROOM_DOG: FigureId = "dog";

describe("the likeness line's holder", () => {
  it("holds no line at first", () => {
    expect(createLikenessLine().line).toBeNull();
  });

  it("gives a figure's line, once while two hold it, and keeps it while one still does", () => {
    const held = createLikenessLine();
    held.picture("visitor", LINE);
    expect(held.line).toBe(LINE);
    held.picture(ROOM_DOG, LINE);
    expect(held.line).toBe(LINE);
    held.picture("visitor", null);
    expect(held.line).toBe(LINE);
    held.picture(ROOM_DOG, null);
    expect(held.line).toBeNull();
  });

  it("takes an empty line as none", () => {
    const held = createLikenessLine();
    held.picture(ROOM_DOG, "");
    expect(held.line).toBeNull();
  });

  it("lets clear() drop every figure's line", () => {
    const held = createLikenessLine();
    held.picture("visitor", LINE);
    held.picture(ROOM_DOG, LINE);
    held.clear();
    expect(held.line).toBeNull();
  });
});

/** Reports a figure signal as the 3D stage would, through the options the room gave it. */
function signal(v: Visit, s: FigureSignal): void {
  const options = v.scene.created.at(-1);
  if (!options) throw new Error("no 3D stage was made");
  options.onFigure?.(s);
}
const notes = (v: Visit): HTMLElement[] => [...v.doc.querySelectorAll<HTMLElement>(".room-visitor-line")];
const aroundLines = (v: Visit): string[] => [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));
const count = (lines: string[]): number => lines.filter((l) => l === LINE).length;
const dogAt = (figure: FigureId): FigureSignal => ({ kind: "picture", figure, shows: "avatar", why: null, line: LINE });
const fallbackAt = (figure: FigureId): FigureSignal => ({ kind: "picture", figure, shows: "fallback", why: "failed" });

describe("the room's likeness line, from any figure (FR-007)", () => {
  it("shows from the stage's dog picture signal alone, and goes with its fallback (spec 025, FR-020, SC-007)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    signal(v, { kind: "picture", figure: "dog", shows: "avatar", why: null, line: LINE });
    await flush();
    expect(notes(v).map((n) => textOf(n))).toEqual([LINE]);
    expect(count(aroundLines(v))).toBe(1);
    signal(v, { kind: "picture", figure: "dog", shows: "fallback", why: "failed" });
    await flush();
    expect(notes(v)).toHaveLength(0);
    expect(count(aroundLines(v))).toBe(0);
  });

  it("shows when a room figure shows the dog's model and the visitor is on another avatar", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null });
    signal(v, dogAt(ROOM_DOG));
    await flush();
    expect(notes(v).map((n) => textOf(n))).toEqual([LINE]);
    expect(count(aroundLines(v))).toBe(1);
  });

  it("shows once while the visitor's and the room's figure both show it", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    signal(v, dogAt("visitor"));
    signal(v, dogAt(ROOM_DOG));
    await flush();
    expect(notes(v)).toHaveLength(1);
    expect(count(aroundLines(v))).toBe(1);
  });

  it("stays while one figure holds it, and goes, no element left, once neither does", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const twinLine = aroundLines(v)[0];
    signal(v, dogAt("visitor"));
    signal(v, dogAt(ROOM_DOG));
    signal(v, fallbackAt(ROOM_DOG));
    await flush();
    expect(notes(v).map((n) => textOf(n))).toEqual([LINE]);
    expect(count(aroundLines(v))).toBe(1);
    expect(aroundLines(v)[0]).toBe(twinLine);
    signal(v, { kind: "failed" });
    signal(v, fallbackAt("visitor"));
    await flush();
    expect(notes(v)).toHaveLength(0);
    expect(count(aroundLines(v))).toBe(0);
    expect(aroundLines(v)[0]).toBe(twinLine);
  });

  it("leaves the twin's line slot as it was", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const before = aroundLines(v)[0];
    const standIn = textOf(v.doc.querySelector(".room-stand-in"));
    signal(v, dogAt(ROOM_DOG));
    await flush();
    expect(aroundLines(v)[0]).toBe(before);
    expect(textOf(v.doc.querySelector(".room-stand-in"))).toBe(standIn);
    signal(v, fallbackAt(ROOM_DOG));
    await flush();
    expect(aroundLines(v)[0]).toBe(before);
    expect(textOf(v.doc.querySelector(".room-stand-in"))).toBe(standIn);
  });

  it("shows no line in a 2D room, though a room figure had shown it", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    signal(v, dogAt(ROOM_DOG));
    await flush();
    expect(notes(v)).toHaveLength(1);
    button(v.doc, "2D view").click();
    await flush();
    expect(notes(v)).toHaveLength(0);
    expect(count(aroundLines(v))).toBe(0);
  });
});
