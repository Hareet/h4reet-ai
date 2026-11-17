// rework-029a (spec 029, group A; rv-spec-029's S-10; FR-001, FR-007; SC-001; plan.md §R-A1, §R-A2): the over-room
// flag follows the walking view itself, never its offer, and outside the split layout it takes the room's box from the
// re-fit's wall source, which only app.ts holds. A new file beside T-A01's hud-over-room.test.ts, so that file's cases
// stay as they were committed. Through the real room (test/helpers/room.ts), layout.ts, and app.ts's re-fit.
//
// S-10's two points, each a case below:
// - the walking view's switch is layout.ts's setWalking(on) (app.ts's enterWalking and leaveWalking), not
//   setWalkOffered, which sets data-walk when the walking control is offered: offered alone marks nothing walking,
//   walking marks every part over the stage, and a walk the stage ends itself (Escape, a failed step) unmarks them;
// - outside the split layout the wall box lives only in app.ts's refit (`protect ?? flatProtect`), so applyHud must be
//   given it: with a stage protector whose wall box differs from the frame area, the marks are the wall box's, in the
//   column and dock layouts, his "smaller browser window"; the stacked layout lays nothing over the stage.
// Spec 030 (T-A01 (d); FR-005, Q2): the right column's halves take the over-room look in every layout and view, so
// their parts are marked at rest and walking alike; the cases above hold for every other part.
import { describe, expect, it } from "vitest";

import type { Protect } from "../../src/room/compose/frame";
import { frameArea } from "../../src/room/compose/frame";
import { DEFAULT_METRICS, OPENING, compactBoxes, fitsHud, hudBoxes, notesReserve } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { flatProtectorFor } from "../../src/room/compose/protect";
import { flush, intoRoom, roomIndex, start, stubViewport } from "../helpers/room";
import type { Visit } from "../helpers/room";

const B = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** The parts' elements, each by the selector that finds it in the room's DOM (hud-over-room.test.ts's list). */
const ELEMENTS = [".talk", ".room-list", ".hud-bar", ".room-walk", ".room-eat", ".hud-panels", ".talk-sheet"] as const;
type El = (typeof ELEMENTS)[number];

const overlaps = (a: Box, b: Box): boolean =>
  a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

type Screen = { readonly w: number; readonly h: number };

/** Each part's element and box at a window, from compose/hud.ts's boxes and the wall source the re-fit takes. */
function partBoxes(screen: Screen, wall: Protect): [El, Box][] {
  if (!fitsHud(screen, OPENING, DEFAULT_METRICS)) return [];
  const c = compactBoxes(screen, OPENING, DEFAULT_METRICS, { eat: wall.eat, wall });
  const bands = hudBoxes(screen, OPENING, DEFAULT_METRICS);
  const clear = bands.clear;
  const notes = notesReserve(clear, DEFAULT_METRICS.rem);
  const reach = B(clear.x, clear.y + notes, clear.w, clear.h - notes);
  if (c.split)
    return [
      [".talk", c.split.panel],
      [".room-list", c.split.list],
      [".hud-bar", c.split.bar],
      [".room-walk", c.walk],
    ];
  if (c.layout === "column" && c.column)
    return [
      [".hud-panels", c.column],
      [".hud-bar", c.bar],
      [".room-walk", c.walk],
      [".talk-sheet", reach],
    ];
  if (bands.dock)
    return [
      [".hud-panels", bands.dock],
      [".hud-bar", c.bar],
      [".room-walk", c.walk],
      [".talk-sheet", reach],
    ];
  return [];
}

/** The room's box at rest, as FR-001 names it: the wall box at the room's framing, or the frame area. */
function restRoom(screen: Screen, wall: Protect, stage: Protect | null): Box {
  const c = compactBoxes(screen, OPENING, DEFAULT_METRICS, { eat: wall.eat, wall });
  if (c.split) return c.split.wall;
  const frame = stage ? frameArea(screen, OPENING, DEFAULT_METRICS, stage).area : hudBoxes(screen, OPENING).clear;
  return wall.wall?.(frame) ?? frame;
}

const pick = (parts: [El, Box][], room: Box): Set<El> =>
  new Set(parts.filter(([, b]) => overlaps(b, room)).map(([el]) => el));

/** Spec 030 (FR-005; Q2): the right column's parts, marked in every layout and view: the list, the bar, and the walking
 *  control in the split layout; the column or the dock, and the bar, outside it; none in the stacked layout. */
function rightColumn(screen: Screen, wall: Protect): El[] {
  if (!fitsHud(screen, OPENING, DEFAULT_METRICS)) return [];
  const c = compactBoxes(screen, OPENING, DEFAULT_METRICS, { eat: wall.eat, wall });
  return c.split ? [".room-list", ".hud-bar", ".room-walk"] : [".hud-panels", ".hud-bar"];
}

/** The elements that should be marked: at rest, the parts meeting the room's box; walking, those meeting the stage;
 *  and the right column's always (spec 030). */
function expected(screen: Screen, o: { walking: boolean; wall: Protect; stage: Protect | null }): Set<El> {
  const parts = partBoxes(screen, o.wall);
  const meeting = pick(parts, o.walking ? B(0, 0, screen.w, screen.h) : restRoom(screen, o.wall, o.stage));
  return new Set([...meeting, ...rightColumn(screen, o.wall)]);
}

const marked = (v: Visit): Set<El> =>
  new Set(ELEMENTS.filter((s) => v.doc.querySelector(s)?.getAttribute("data-over") === "room"));

const walkControl = (v: Visit): HTMLButtonElement => {
  const el = v.doc.querySelector<HTMLButtonElement>("button.room-walk");
  if (!el) throw new Error("no walking control");
  return el;
};

async function inRoom(screen: Screen, o: { mode: "3d" | "2d"; protect?: Protect }): Promise<Visit> {
  const viewport = stubViewport(screen);
  const v = start({ webgl: o.mode === "3d", viewport: viewport.factory });
  if (o.protect) v.scene.protect = o.protect;
  await intoRoom(v);
  return v;
}

const layoutOf = (v: Visit): string =>
  v.doc.documentElement.getAttribute("data-split") === "on"
    ? "split"
    : (v.doc.documentElement.getAttribute("data-hud") ?? "none");

/**
 * A stage protector whose wall box differs from the frame area: a strip along the frame area's top, too short for the
 * split layout (spec 028: the wall box at least 14rem tall), so every window keeps the column or the dock layout. It
 * meets no part but the column's or the dock's own top, where the frame area meets the bar, the walking control, and
 * the sheet's reach too; so a room box taken from the frame area, not the wall box, marks other parts.
 */
const strip: Protect = {
  key: "rework-029a:strip",
  boxes: () => [],
  wall: (area) => B(area.x, area.y, area.w, 2 * DEFAULT_METRICS.rem),
};

const flat = (): Protect => flatProtectorFor(roomIndex());

const WINDOWS: readonly Screen[] = [
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
  { w: 390, h: 844 },
];

describe("the walking view itself, not its offer, moves the flag (S-10; FR-001)", () => {
  for (const screen of WINDOWS)
    it(`at ${screen.w} × ${screen.h} in 3D: offered marks the rest's parts; walking, the stage's; Escape, the rest's`, async () => {
      const v = await inRoom(screen, { mode: "3d" });
      const rest = expected(screen, { walking: false, wall: flat(), stage: null });
      const walking = expected(screen, { walking: true, wall: flat(), stage: null });
      // The control is offered, the visitor isn't walking: layout.ts's setWalkOffered alone.
      expect(v.doc.documentElement.getAttribute("data-walk")).toBe("on");
      expect(walkControl(v).hidden).toBe(false);
      expect(v.scene.walks).toEqual([]);
      expect(marked(v)).toEqual(rest);
      expect(walking.size).toBeGreaterThan(0);
      // Walking, by the control: setWalking(true).
      walkControl(v).click();
      await flush();
      expect(v.scene.walks.at(-1)?.call).toBe("enter");
      expect(marked(v)).toEqual(walking);
      // The stage ends the walk itself (Escape): leaveWalking's setWalking(false), the offer unchanged.
      v.scene.endWalk("escape");
      await flush();
      expect(v.doc.documentElement.getAttribute("data-walk")).toBe("on");
      expect(marked(v)).toEqual(rest);
      // Again, ended by a failed step.
      walkControl(v).click();
      await flush();
      expect(marked(v)).toEqual(walking);
      v.scene.endWalk("failed");
      await flush();
      expect(marked(v)).toEqual(rest);
    });

  it("offers the walk at the split windows with only the right column marked: the offer isn't the walk", async () => {
    for (const screen of WINDOWS.slice(0, 3)) {
      const v = await inRoom(screen, { mode: "3d" });
      expect(layoutOf(v)).toBe("split");
      expect(v.doc.documentElement.getAttribute("data-walk")).toBe("on");
      // Spec 030 (Q2): the right column's halves always; the conversation panel, which only walking marks, not.
      expect(marked(v)).toEqual(new Set([".room-list", ".hud-bar", ".room-walk"]));
    }
  });
});

describe("outside the split layout the room's box is the re-fit's wall box (S-10; FR-001)", () => {
  for (const screen of WINDOWS)
    it(`at ${screen.w} × ${screen.h} in 3D with a stage protector, at rest and walking`, async () => {
      const v = await inRoom(screen, { mode: "3d", protect: strip });
      expect(["column", "dock"]).toContain(layoutOf(v));
      const parts = partBoxes(screen, strip);
      const frame = frameArea(screen, OPENING, DEFAULT_METRICS, strip).area;
      const rest = expected(screen, { walking: false, wall: strip, stage: strip });
      // The case discriminates: the frame area would mark other parts than the wall box does (with the right column's,
      // marked either way, spec 030).
      expect(new Set([...pick(parts, frame), ...rightColumn(screen, strip)])).not.toEqual(rest);
      expect(marked(v)).toEqual(rest);
      walkControl(v).click();
      await flush();
      expect(marked(v)).toEqual(expected(screen, { walking: true, wall: strip, stage: strip }));
      walkControl(v).click();
      await flush();
      expect(marked(v)).toEqual(rest);
    });

  for (const screen of [{ w: 1280, h: 720 }])
    it(`at ${screen.w} × ${screen.h} in 2D, the drawing's wall box`, async () => {
      const v = await inRoom(screen, { mode: "2d" });
      expect(v.doc.querySelector(".room-stage-view")?.getAttribute("data-stage")).toBe("2d");
      expect(layoutOf(v)).not.toBe("split");
      const want = expected(screen, { walking: false, wall: flat(), stage: flat() });
      expect(want.size).toBeGreaterThan(0);
      expect(marked(v)).toEqual(want);
    });

  for (const mode of ["3d", "2d"] as const)
    it(`marks nothing in the stacked layout (300 × 400, ${mode}), which lays no part over the stage`, async () => {
      const screen = { w: 300, h: 400 };
      const v = await inRoom(screen, { mode });
      expect(layoutOf(v)).toBe("stacked");
      expect(marked(v).size).toBe(0);
      if (mode === "3d" && !walkControl(v).hidden) {
        walkControl(v).click();
        await flush();
        expect(marked(v).size).toBe(0);
      }
    });
});
