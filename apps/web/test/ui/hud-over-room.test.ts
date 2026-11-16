// T-A01 (spec 029; FR-001, FR-005, FR-006, FR-007; SC-001; plan.md §R-A1, §R-A2, §R-A4): which HUD parts lie over the
// room. compose/over.ts's overRoom marks a part whose box meets the room's box with positive area, with no threshold;
// layout.ts's applyHud writes the mark as data-over="room" on each part's element at every re-fit and when the walking
// view starts or ends. The room's box: the whole stage (the window) in the walking view; else the wall box at the
// room's framing (spec 028's, from the protector the re-fit takes: here the 2D drawing's, since the stand-in 3D stage
// gives none). The expectation is computed from compose/hud.ts's compactBoxes and wallBoxes and the protector, not
// written by hand. At the split layout's windows at the room's framing no part is marked, so no [data-over] rule
// applies to any part (FR-005); the text box is the same over the room as beside it (FR-006).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { frameArea } from "../../src/room/compose/frame";
import { DEFAULT_METRICS, OPENING, compactBoxes, hudBoxes, notesReserve } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { overRoom } from "../../src/room/compose/over";
import type { PartId } from "../../src/room/compose/over";
import { flatProtectorFor } from "../../src/room/compose/protect";
import { flush, intoRoom, matchesRule, parseCss, roomIndex, start, stubViewport } from "../helpers/room";
import type { Visit } from "../helpers/room";

const B = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe("overRoom (FR-001; plan §R-A1)", () => {
  const room = B(100, 100, 400, 300);
  it("marks none where no part meets the room", () => {
    const parts = new Map<PartId, Box>([
      ["talk", B(0, 0, 90, 500)],
      ["list", B(510, 0, 90, 500)],
      ["bar", B(100, 410, 400, 40)],
    ]);
    expect([...overRoom(parts, room)]).toEqual([]);
  });
  it("marks none where a part only touches the room's edge", () => {
    const parts = new Map<PartId, Box>([
      ["talk", B(0, 100, 100, 50)],
      ["bar", B(100, 400, 400, 40)],
    ]);
    expect([...overRoom(parts, room)]).toEqual([]);
  });
  it("marks a part that meets the room by a sliver: no threshold", () => {
    const parts = new Map<PartId, Box>([
      ["talk", B(0, 100, 100.5, 50)],
      ["list", B(510, 0, 90, 500)],
    ]);
    expect([...overRoom(parts, room)]).toEqual(["talk"]);
  });
  it("marks every part the room holds whole", () => {
    const parts = new Map<PartId, Box>([
      ["walk", B(380, 350, 100, 40)],
      ["bar", B(120, 360, 200, 30)],
      ["column", B(0, 0, 50, 50)],
    ]);
    expect(new Set(overRoom(parts, room))).toEqual(new Set(["walk", "bar"]));
  });
  it("marks none for a part or a room without area, or no room", () => {
    const parts = new Map<PartId, Box>([["talk", B(200, 200, 0, 50)]]);
    expect([...overRoom(parts, room)]).toEqual([]);
    expect([...overRoom(new Map<PartId, Box>([["talk", B(200, 200, 10, 10)]]), B(100, 100, 0, 300))]).toEqual([]);
    expect([...overRoom(new Map<PartId, Box>([["talk", B(200, 200, 10, 10)]]), null)]).toEqual([]);
  });
});

/** The parts' elements, each by the selector that finds it in the room's DOM. */
const ELEMENTS = [".talk", ".room-list", ".hud-bar", ".room-walk", ".room-eat", ".hud-panels", ".talk-sheet"] as const;
type El = (typeof ELEMENTS)[number];

const overlaps = (a: Box, b: Box): boolean =>
  a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The elements that should be marked, computed from the layout's boxes and the protector the room takes. */
function expected(screen: { w: number; h: number }, mode: "3d" | "2d", walking: boolean): Set<El> {
  const flat = flatProtectorFor(roomIndex());
  const c = compactBoxes(screen, OPENING, DEFAULT_METRICS, { wall: flat });
  const bands = hudBoxes(screen, OPENING, DEFAULT_METRICS);
  const clear = bands.clear;
  const notes = notesReserve(clear, DEFAULT_METRICS.rem);
  // The sheet's reach: the clear area below the notes' reserve, where the dock's sheet and the larger view open.
  const reach = B(clear.x, clear.y + notes, clear.w, clear.h - notes);
  const parts: [El, Box][] = [];
  if (c.split)
    parts.push(
      [".talk", c.split.panel],
      [".room-list", c.split.list],
      [".hud-bar", c.split.bar],
      [".room-walk", c.walk],
    );
  else if (c.layout === "column" && c.column)
    parts.push([".hud-panels", c.column], [".hud-bar", c.bar], [".room-walk", c.walk], [".talk-sheet", reach]);
  else if (bands.dock)
    parts.push([".hud-panels", bands.dock], [".hud-bar", c.bar], [".room-walk", c.walk], [".talk-sheet", reach]);
  // The frame area: the split layout's area; else the 2D drawing's protector's ease, or, with the stand-in 3D stage,
  // which gives no protector, the clear area (app.ts's refit).
  const frame = c.split ? c.split.area : mode === "2d" ? frameArea(screen, OPENING, DEFAULT_METRICS, flat).area : clear;
  const room = walking ? B(0, 0, screen.w, screen.h) : c.split ? c.split.wall : (flat.wall?.(frame) ?? frame);
  return new Set(parts.filter(([, b]) => overlaps(b, room)).map(([el]) => el));
}

const marked = (v: Visit): Set<El> =>
  new Set(ELEMENTS.filter((s) => v.doc.querySelector(s)?.getAttribute("data-over") === "room"));

async function inRoom(screen: { w: number; h: number }, mode: "3d" | "2d"): Promise<Visit> {
  const viewport = stubViewport(screen);
  const v = start({ webgl: mode === "3d", viewport: viewport.factory });
  await intoRoom(v);
  return v;
}

const walkControl = (v: Visit): HTMLButtonElement => {
  const el = v.doc.querySelector<HTMLButtonElement>("button.room-walk");
  if (!el) throw new Error("no walking control");
  return el;
};

const WINDOWS = [
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
] as const;

/** Every rule of room.css and split.css that names data-over, one per selector of its list, at-rules' bodies too. */
const OVER_RULES: string[] = (() => {
  const out: string[] = [];
  const add = (text: string): void => {
    const sheet = parseCss(text);
    for (const r of sheet.rules)
      for (const s of r.selector.split(","))
        if (s.includes("data-over")) out.push(s.trim().replace(/:focus-visible/g, ""));
    for (const a of sheet.atRules) add(a.body);
  };
  for (const path of ["../../src/room/room.css", "../../src/room/hud/split.css"])
    add(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"));
  return out;
})();

describe("the parts over the room, through the real room (FR-001, FR-005, FR-007; SC-001)", () => {
  it("names the over-room look in the stylesheets", () => {
    expect(OVER_RULES.length).toBeGreaterThan(0);
  });

  for (const screen of WINDOWS)
    it(`marks exactly the parts that meet the room at ${screen.w} × ${screen.h} in 3D, in the room and walking`, async () => {
      const v = await inRoom(screen, "3d");
      const want = expected(screen, "3d", false);
      expect(marked(v)).toEqual(want);
      const split = v.doc.documentElement.getAttribute("data-split") === "on";
      if (split) {
        // At the room's framing the split layout's parts stand in the grey bands: none is marked, no rule applies.
        expect(want.size).toBe(0);
        for (const el of v.doc.querySelectorAll(".room *, .room"))
          for (const s of OVER_RULES) expect(matchesRule(el, s), `${s} on ${el.className}`).toBe(false);
      }
      walkControl(v).click();
      await flush();
      expect(v.scene.walks.at(-1)?.call).toBe("enter");
      const walking = expected(screen, "3d", true);
      expect(walking.size).toBeGreaterThan(0);
      expect(marked(v)).toEqual(walking);
      walkControl(v).click();
      await flush();
      expect(marked(v)).toEqual(want);
    });

  for (const screen of [WINDOWS[0], WINDOWS[3]])
    it(`marks exactly the parts that meet the room at ${screen.w} × ${screen.h} in 2D`, async () => {
      const v = await inRoom(screen, "2d");
      expect(v.doc.querySelector(".room-stage-view")?.getAttribute("data-stage")).toBe("2d");
      expect(marked(v)).toEqual(expected(screen, "2d", false));
    });

  it("is the split layout at 1920 × 1080, so FR-005's case is held there", async () => {
    const v = await inRoom(WINDOWS[2], "3d");
    expect(v.doc.documentElement.getAttribute("data-split")).toBe("on");
  });

  it("follows a re-fit: a window that leaves the split layout marks its parts, and one that returns unmarks them", async () => {
    const viewport = stubViewport(WINDOWS[2]);
    const v = start({ webgl: true, viewport: viewport.factory });
    await intoRoom(v);
    expect(marked(v).size).toBe(0);
    viewport.set(WINDOWS[3]);
    await flush();
    expect(marked(v)).toEqual(expected(WINDOWS[3], "3d", false));
    viewport.set(WINDOWS[2]);
    await flush();
    expect(marked(v).size).toBe(0);
  });
});

describe("the text box over the room (FR-006)", () => {
  for (const screen of [WINDOWS[2], WINDOWS[3]])
    it(`gives the text box no over-room rule at ${screen.w} × ${screen.h}, walking, its parts marked`, async () => {
      const v = await inRoom(screen, "3d");
      walkControl(v).click();
      await flush();
      expect(marked(v).size).toBeGreaterThan(0);
      const box = v.doc.getElementById("talk-text");
      expect(box).not.toBeNull();
      for (const s of OVER_RULES) expect(matchesRule(box as Element, s), s).toBe(false);
    });
});
