// T-A06 (spec 028; FR-012, FR-014, FR-015; Q6; the Author's answer "Keep top banner (Recommended)"): the top-left
// labels leave the screen. In every layout, with the twin's own model showing, a dog visitor's model showing, and the
// room's pieces and the visitor's figure on placeholders, none of the stage's notes (`.room-notes`: the stand-in
// line's `p.room-stand-in`, the visitor's line's `.room-visitor-line`, the placeholder's `p.room-note`) holds a twin's
// line, stand-in line, visitor's likeness line, or placeholder note, nor does anything else on the page outside "Around
// the room"; the top-centre banner shows as before; and "Around the room" keeps main's lines a screen reader reads, the
// twin's line or the stand-in line first, the visitor's line after it, plus the placeholder words (plan.md §R-A5) while
// stand-ins show. Reworked after rv-spec-028's B-2 (FR-012, SC-003, US3 AS1 scoped): where "Around the room" shows
// (the dock and stacked layouts, FR-016), its lines show with it, so this file and test/ui/around.test.ts both pass.
import { describe, expect, it } from "vitest";

import type { RoomIndex } from "../../src/room/compose/bundle";
import type { FigureSignal } from "../../src/room/stage";
import { AI_DISCLOSURE, flush, intoRoom, roomIndex, start, stubViewport, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";

const index = roomIndex();
const NOTE = index.ui["standin.note"] ?? "";
const AVATAR = index.ui["standin.avatar"] ?? "";
const STAND_IN = index.ui["twin.stand_in"] ?? "";
const TWIN = index.twin?.line ?? "";
const DOG_LINE = "The dog is an AI-made, stylized dog, shown by the Author's choice.";
const withPieces: RoomIndex = { ...index, build: { ...index.build, placeholders: true } };

const LAYOUTS = [
  { name: "split", screen: { w: 1920, h: 1080 } },
  { name: "column", screen: { w: 844, h: 390 } },
  { name: "dock", screen: { w: 390, h: 844 } },
  { name: "stacked", screen: { w: 300, h: 500 } },
] as const;

function signal(v: Visit, s: FigureSignal): void {
  const options = v.scene.created.at(-1);
  if (!options) throw new Error("no 3D stage was made");
  options.onFigure?.(s);
}
const aroundLines = (v: Visit): string[] => [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));
/** Everything on the page outside "Around the room" (B-2): the page's body with the section taken out of a copy. */
const onScreen = (v: Visit): string => {
  const body = v.doc.body.cloneNode(true) as HTMLElement;
  for (const around of body.querySelectorAll(".room-around")) around.remove();
  return textOf(body);
};
/** The stage's notes' words (FR-012): the box and the three notes it held on main, wherever one is. */
const stageNotes = (v: Visit): string =>
  [...v.doc.querySelectorAll(".room-notes, p.room-stand-in, .room-visitor-line, p.room-note")]
    .map((el) => textOf(el))
    .join(" ");

async function room(screen: { w: number; h: number }): Promise<Visit> {
  const view = stubViewport(screen);
  const v = start({ webgl: true, room: withPieces, viewport: view.factory });
  await intoRoom(v);
  return v;
}

describe("the top-left labels leave the screen (FR-012)", () => {
  for (const { name, screen } of LAYOUTS)
    it(`puts none of the four in the stage's notes or anywhere outside Around the room in the ${name} layout, whichever pictures show (B-2)`, async () => {
      const v = await room(screen);
      expect(v.doc.documentElement.getAttribute("data-hud") ?? "stacked").toBe(name === "split" ? "column" : name);
      for (const s of [
        { kind: "picture", figure: "visitor", shows: "fallback", why: "no-file" },
        { kind: "picture", figure: "twin", shows: "fallback", why: "no-file" },
      ] as FigureSignal[]) {
        signal(v, s);
        await flush();
        for (const words of [NOTE, AVATAR, STAND_IN]) {
          expect(onScreen(v), words).not.toContain(words);
          expect(stageNotes(v), words).not.toContain(words);
        }
        expect(v.doc.querySelectorAll(".room-notes > *")).toHaveLength(0);
      }
      signal(v, { kind: "picture", figure: "twin", shows: "own", why: null } as FigureSignal);
      signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null, line: DOG_LINE } as FigureSignal);
      await flush();
      for (const words of [TWIN, DOG_LINE, NOTE, STAND_IN]) {
        expect(onScreen(v), words).not.toContain(words);
        expect(stageNotes(v), words).not.toContain(words);
      }
      expect(v.doc.querySelectorAll(".room-note, .room-stand-in, .room-visitor-line")).toHaveLength(0);
    });

  it("keeps the top-centre banner", async () => {
    for (const { screen } of LAYOUTS) {
      const v = await room(screen);
      const banner = v.doc.getElementById("ai-disclosure");
      expect(banner?.hidden).toBe(false);
      expect(textOf(banner)).toContain(AI_DISCLOSURE.replace(/\.$/, ""));
    }
  });
});

describe("where Around the room shows, its lines show with it (FR-012, FR-016; B-2, B-1)", () => {
  for (const { name, screen } of LAYOUTS.filter((l) => l.name === "dock" || l.name === "stacked"))
    it(`holds the stand-in line and the placeholder words in the ${name} layout, where it shows`, async () => {
      const v = await room(screen);
      signal(v, { kind: "picture", figure: "visitor", shows: "fallback", why: "no-file" } as FigureSignal);
      await flush();
      const around = v.doc.querySelector(".room-around");
      if (!around) throw new Error('no "Around the room"');
      expect(around.closest("[hidden], [inert], [aria-hidden='true']")).toBeNull();
      expect(aroundLines(v)[0]).toBe(STAND_IN);
      expect(aroundLines(v)).toContain(`${NOTE}. ${AVATAR}`);
      expect(onScreen(v)).not.toContain(STAND_IN);
    });
});

describe('"Around the room" keeps main\'s lines, plus the placeholder words while stand-ins show (FR-015; I-1)', () => {
  it("holds the stand-in line first, then the placeholder words, while placeholders show", async () => {
    const v = await room({ w: 1920, h: 1080 });
    signal(v, { kind: "picture", figure: "visitor", shows: "fallback", why: "no-file" } as FigureSignal);
    await flush();
    const lines = aroundLines(v);
    expect(lines[0]).toBe(STAND_IN);
    expect(lines).toContain(`${NOTE}. ${AVATAR}`);
    expect(lines.indexOf(`${NOTE}. ${AVATAR}`)).toBe(1);
  });

  it("holds the twin's line, then the visitor's line, then the placeholder words, with the models", async () => {
    const v = await room({ w: 1920, h: 1080 });
    signal(v, { kind: "picture", figure: "twin", shows: "own", why: null } as FigureSignal);
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null, line: DOG_LINE } as FigureSignal);
    await flush();
    expect(aroundLines(v).slice(0, 3)).toEqual([TWIN, DOG_LINE, NOTE]);
  });

  it("drops the placeholder words once nothing is a placeholder, and keeps the rest", async () => {
    const view = stubViewport({ w: 1920, h: 1080 });
    const v = start({ webgl: true, room: index, viewport: view.factory });
    await intoRoom(v);
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null } as FigureSignal);
    await flush();
    const lines = aroundLines(v);
    for (const words of [NOTE, AVATAR]) expect(lines.some((l) => l.includes(words))).toBe(false);
    expect(lines[0]).toBe(STAND_IN);
  });
});
