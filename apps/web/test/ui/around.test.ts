// T180 (spec 004; FR-034, FR-063, SC-008): "Around the room" holds what the room draws, from the renderers' own word
// lists, so the 3D room, the 2D room, and the text copy can't differ: each bound face's label and words; the monitor's
// note that it is a scripted illustration (around.illustration); the laptop's state; the neon sign's word, labels,
// readings, and second line; and the line saying the project isn't affiliated with or endorsed by Langfuse or its
// owner. Each face's entry equals the 2D drawing's words for it and the 3D faces' display list. The fixture set's IDs
// are synthetic fx- ones; the repository's neon sign gives the real words.
import { JSDOM } from "jsdom";
import { Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { drawnWords } from "../../src/room/faces/display-list";
import { faceWords, roomTextOf } from "../../src/room/faces/words";
import type { RoomText } from "../../src/room/faces/words";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { buildFaceQuads } from "../../src/room/scene/faces3d";
import { FakeClock, flush, intoRoom, repositoryBundle, roomIndex, start, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

/** The 2D stages the room draws, the latest last, so a face's group is read from the drawing's faces. */
const flats = vi.hoisted(() => [] as { drawing: { faces: ReadonlyMap<string, Element> } }[]);

vi.mock("../../src/room/flat", async (importOriginal) => {
  const flat = await importOriginal<typeof import("../../src/room/flat")>();
  return {
    ...flat,
    renderFlat(...args: Parameters<typeof flat.renderFlat>) {
      const stage = flat.renderFlat(...args);
      flats.push(stage);
      return stage;
    },
  };
});

afterEach(() => {
  flats.length = 0;
});

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }));
const fixtureData = (): unknown => ({ room_text: fixture().roomText });
const fixtureText = (): RoomText => roomTextOf(fixtureData());

const lines = (v: Visit): string[] => [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));

/** A face's entry in "Around the room": its label, then its renderer's words. */
const entry = (index: RoomIndex, face: RoomIndex["faces"][number], text: RoomText | null): string | null => {
  const words = faceWords(face, { index, text });
  return words === null ? null : `${index.ui[face.label] ?? ""}: ${words.join(" ")}`;
};

/** The words the 2D drawing draws for a face: its group's text runs, the neon tube's glow pass (drawn under the tube,
 *  at an opacity) left out, so each word counts once. */
function drawn2d(v: Visit, face: string): string[] {
  const group = flats.at(-1)?.drawing.faces.get(face);
  // The drawing this visit shows, which the room put on its stage.
  if (!group || !v.doc.querySelector(".flat svg")?.contains(group)) return [];
  return [...(group?.querySelectorAll("text") ?? [])]
    .filter((t) => !t.hasAttribute("opacity"))
    .map((t) => t.textContent ?? "");
}

describe('"Around the room" (FR-034, FR-063)', () => {
  it("holds each bound face's label and words, the illustration's note, the switch's state, and the fixed lines", async () => {
    const { index } = fixture();
    const v = start({ room: index, roomData: [fixtureData()] });
    await intoRoom(v);
    const held = lines(v);
    for (const face of index.faces) {
      const want = entry(index, face, fixtureText());
      expect(want, face.id).not.toBeNull();
      expect(held, face.id).toContain(want);
    }
    expect(held).toContain(index.ui["around.illustration"]);
    expect(held).toContain(index.ui["sign.not_affiliated"]);
    const sw = index.switches[0];
    expect(held).toContain(`${index.ui[sw?.label ?? ""]}: ${index.ui["tier.not-live"]}`);
    // In the index's copy order: the faces, the switches, then the fixed lines.
    const order = index.faces.map((f) => held.indexOf(entry(index, f, fixtureText()) ?? ""));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(Math.max(...order)).toBeLessThan(held.indexOf(index.ui["around.illustration"] ?? ""));
  });

  it("holds the repository's neon sign: its word, its counters' labels and readings, and its second line", async () => {
    const index = roomIndex();
    const v = start({ room: index });
    await intoRoom(v);
    const held = lines(v);
    const ui = index.ui;
    expect(held).toContain(`${ui["label.neon-word"]}: ${ui["sign.word"]}`);
    expect(held).toContain(`${ui["label.neon-call"]}: ${ui["sign.unavailable"]}`);
    expect(held).toContain(`${ui["label.neon-visit"]}: ${ui["sign.unavailable"]}`);
    expect(held).toContain(`${ui["label.neon-line"]}: ${ui["sign.second_line"]}`);
    expect(held).toContain(ui["sign.not_affiliated"]);
    expect(held.join("\n")).toContain("Langfuse");
  });

  it("equals the 2D drawing, face by face", async () => {
    const { index } = fixture();
    const v = start({ room: index, roomData: [fixtureData()] });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("2d");
    for (const face of index.faces) {
      const words = faceWords(face, { index, text: fixtureText() });
      expect(
        drawn2d(v, face.id).map((w) => (w === index.ui["draft.badge"] ? `[${w}]` : w)),
        face.id,
      ).toEqual(words);
    }
  });

  it("equals the 3D faces' display lists, face by face", () => {
    const { index, scene: part } = fixture();
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index });
    const faces = buildFaceQuads({
      part,
      index,
      placements: room.placements,
      doc: new JSDOM("<main></main>").window.document,
      clock: new FakeClock(),
      dpr: 1,
      level: 0,
      motion: () => ({ animate: false }),
    });
    faces.setText(fixtureText());
    faces.frame(0);
    for (const face of index.faces) {
      const list = faces.lists.get(face.id);
      expect(list ? drawnWords(list.ops) : null, face.id).toEqual(faceWords(face, { index, text: fixtureText() }));
    }
  });

  it("updates a face's entry in place when its words come, in no live region", async () => {
    const { index } = fixture();
    const v = start({ room: index, roomData: [null, fixtureData()] });
    await intoRoom(v);
    const before = lines(v);
    v.clock.advance(10_000);
    await flush();
    const after = lines(v);
    expect(after.length).toBeGreaterThan(before.length);
    const around = v.doc.querySelector(".room-around");
    for (const el of [around, ...(around?.querySelectorAll("*") ?? [])])
      expect(el?.hasAttribute("aria-live"), el?.localName).toBe(false);
  });

  it("is the repository's own: its faces' words and its fixed lines, from Enter", async () => {
    const repo = repositoryBundle();
    const v = start({ room: repo.index });
    await intoRoom(v);
    for (const face of repo.index.faces) {
      const want = entry(repo.index, face, roomTextOf({}));
      if (want !== null) expect(lines(v), face.id).toContain(want);
    }
  });
});
