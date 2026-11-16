// T040 (spec 014; FR-053 to FR-055, FR-066; SC-009; plan.md §9, PD-17, PD-18; Q5): the placeholder note says what is
// missing. Over a table of causes: a room piece's stand-in from the bundle, or a piece's model that failed or was
// skipped at run time, shows `standin.note`; the visitor's figure showing its flat shape in 3D, its avatar with no
// model or its model failing mid-visit, shows `standin.avatar`; both show both in one note, `standin.note` first; the
// 2D room never shows the figure's words; and nothing missing shows no note. The twin's stand-in line keeps its own
// paragraph, so the notes stay two, and both let a pointer through.
// Spec 028's T-A06 (its FR-012, FR-015; plan.md §R-A5, §R-B8): the note leaves the stage; its words, by the same
// causes, are a line of their own in "Around the room", which `note` now reads. The cases are otherwise unchanged.
import { describe, expect, it } from "vitest";

import type { RoomIndex } from "../../src/room/compose/bundle";
import { UI_KEYS } from "../../src/room/ui-keys";
import { button, enter, flush, intoRoom, roomIndex, start, textOf, throughLoader } from "../helpers/room";
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

/** The placeholder words, "Around the room"'s line of them (spec 028), or null where there is none. */
function note(v: Visit): string | null {
  const el = v.doc.querySelector<HTMLElement>('.room-around li[data-line="placeholders"]');
  return el ? textOf(el) : null;
}

const figure = (v: Visit, shows: "avatar" | "fallback", why: string | null): void =>
  v.scene.created[0]?.onFigure?.({ kind: "picture", figure: "visitor", shows, why } as never);

describe("the placeholder note's causes (spec 014, T040)", () => {
  it("has the figure's words in the closed list, with no slot", () => {
    expect(UI_KEYS["standin.avatar"]).toEqual([]);
    expect(AVATAR).toBe("Your figure is a flat placeholder until its model arrives.");
  });

  it("shows no placeholder words when every piece and the visitor's figure show their models; the stage holds no note (spec 028)", async () => {
    const v = await room({ placeholders: false });
    figure(v, "avatar", null);
    expect(note(v)).toBeNull();
    // Spec 028 (FR-012): neither the note nor the stand-in line is drawn on the stage.
    expect(v.doc.querySelectorAll(".room-note")).toHaveLength(0);
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

// Spec 021 (T007; FR-010; spec 014's FR-053, FR-054): the dinosaur chosen in the 3D room. Its figure's cause is spec
// 014's for any avatar: while its picture is the fallback (no bundled model, or one that failed), the note says
// `standin.avatar`; once its model shows, those words go. `standin.note` follows the room's pieces alone in both. No
// code expected (a pin): the cause reads the picture signal, never the avatar's id.
describe("the placeholder note with the dinosaur chosen (spec 021, FR-010)", () => {
  async function dinosaurRoom(placeholders: boolean): Promise<Visit> {
    const v = start({ webgl: true, room: withPieces(placeholders) });
    await enter(v, "engineer", "dinosaur");
    await throughLoader(v);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    expect(v.scene.created[0]?.avatar).toBe("dinosaur");
    return v;
  }

  it("says standin.avatar while its figure shows the cut-out in 3D, and drops it once its model shows", async () => {
    for (const why of ["no-file", "failed"]) {
      const v = await dinosaurRoom(false);
      figure(v, "fallback", why);
      expect(note(v), why).toBe(AVATAR);
      figure(v, "avatar", null);
      expect(note(v), why).toBeNull();
    }
  });

  it("keeps standin.note to the room's pieces, with the cut-out or the model", async () => {
    const v = await dinosaurRoom(true);
    figure(v, "fallback", "no-file");
    expect(note(v)).toBe(`${NOTE}. ${AVATAR}`);
    figure(v, "avatar", null);
    expect(note(v)).toBe(NOTE);
  });
});
