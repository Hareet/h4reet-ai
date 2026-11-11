// T040 (spec 014; FR-053 to FR-055, FR-066; SC-009; plan.md §9, PD-17, PD-18; Q5): the placeholder note says what is
// missing. Over a table of causes: a room piece's stand-in from the bundle, or a piece's model that failed or was
// skipped at run time, shows `standin.note`; the visitor's figure showing its flat shape in 3D, its avatar with no
// model or its model failing mid-visit, shows `standin.avatar`; both show both in one note, `standin.note` first; the
// 2D room never shows the figure's words; and nothing missing shows no note. The twin's stand-in line keeps its own
// paragraph, so the notes stay two, and both let a pointer through.
import { describe, expect, it } from "vitest";

import type { RoomIndex } from "../../src/room/compose/bundle";
import { UI_KEYS } from "../../src/room/ui-keys";
import { intoRoom, roomIndex, start, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";

const index = roomIndex();
const NOTE = index.ui["standin.note"] ?? "";
const AVATAR = index.ui["standin.avatar"] ?? "";
const withPieces = (placeholders: boolean): RoomIndex => ({ ...index, build: { ...index.build, placeholders } });

async function room(o: { placeholders: boolean; webgl?: boolean }): Promise<Visit> {
  const v = start({ webgl: o.webgl ?? true, room: withPieces(o.placeholders) });
  await intoRoom(v);
  return v;
}

/** The placeholder note's words, or null where it's hidden. */
function note(v: Visit): string | null {
  const el = v.doc.querySelector<HTMLElement>(".room-note:not(.room-stand-in)");
  return el && !el.hidden ? textOf(el) : null;
}

const figure = (v: Visit, shows: "avatar" | "fallback", why: string | null): void =>
  v.scene.created[0]?.onFigure?.({ kind: "picture", figure: "visitor", shows, why } as never);

describe("the placeholder note's causes (spec 014, T040)", () => {
  it("has the figure's words in the closed list, with no slot", () => {
    expect(UI_KEYS["standin.avatar"]).toEqual([]);
    expect(AVATAR).toBe("Your figure is a flat placeholder until its model arrives.");
  });

  it("shows no note when every piece and the visitor's figure show their models", async () => {
    const v = await room({ placeholders: false });
    figure(v, "avatar", null);
    expect(note(v)).toBeNull();
    // The twin's stand-in line is its own paragraph, unchanged (spec 009, FR-013).
    expect(v.doc.querySelectorAll(".room-note")).toHaveLength(2);
  });

  it("names the room's pieces while one shows its stand-in, from the bundle", async () => {
    const v = await room({ placeholders: true });
    figure(v, "avatar", null);
    expect(note(v)).toBe(NOTE);
  });

  it("names the room's pieces once a piece's model fails or is skipped at run time", async () => {
    for (const outcome of ["failed", "skipped"] as const) {
      const v = await room({ placeholders: false });
      figure(v, "avatar", null);
      expect(note(v)).toBeNull();
      const asset = index.models[0];
      if (!asset) throw new Error("the room has no set model");
      v.scene.created[0]?.assets?.({ asset, outcome, ms: 0, bytes: 0, mode: "3d" } as never);
      expect(note(v), outcome).toBe(NOTE);
    }
  });

  it("names the visitor's figure while it shows its flat shape in 3D, and both, the pieces' first", async () => {
    for (const why of ["no-file", "failed"]) {
      const v = await room({ placeholders: false });
      figure(v, "fallback", why);
      expect(note(v), why).toBe(AVATAR);
    }
    const both = await room({ placeholders: true });
    figure(both, "fallback", "no-file");
    expect(note(both)).toBe(`${NOTE}. ${AVATAR}`);
    // Its model arriving takes its words away again.
    figure(both, "avatar", null);
    expect(note(both)).toBe(NOTE);
  });

  it("never shows the figure's words in the 2D room, where every figure is flat by design", async () => {
    const flat = await room({ placeholders: false, webgl: false });
    expect(flat.room.visit.mode).toBe("2d");
    expect(note(flat)).toBeNull();
    const pieces = await room({ placeholders: true, webgl: false });
    expect(note(pieces)).toBe(NOTE);
  });
});
