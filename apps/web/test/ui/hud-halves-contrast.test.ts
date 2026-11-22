// T-A01 (c) (spec 030, group A; FR-005 to FR-007, SC-002; Q2; plan.md §R-A3): every text and mark of the right
// column's two halves at WCAG 2.2 AA over the room's brightest and darkest pixels, computed from the stylesheets by the
// cascade, as spec 029's test/ui/hud-over-layers.test.ts computes it (its model, test/helpers/layers.ts): text 4.5:1
// (3:1 at 24 px or more), borders, icons, and focus rings 3:1, over pure white and pure black beneath. With no blur
// (FR-001) the glass and the plates alone carry it. The halves: the top half's element and all it holds; the bottom
// half's own edge; and the parts the bottom half holds (the bar's tiles, and in the split layout the walking control
// and "Eat"), each over the half's glass (halfUnder). At (b)'s windows and views: his three windows (split), 1280 × 720
// (column), 390 × 844 (dock), at rest and walking in 3D, in a conversation with "Eat" offered; and 1366 × 768 and
// 390 × 844 in 2D at rest. Under reduced transparency, more contrast, and forced colours, both halves opaque (FR-007),
// as spec 029's FR-004 has it: its media rule makes --over-glass-alpha 1, which both halves' glass reads, and forced
// colours draw the bottom half in Canvas.
import { describe, expect, it } from "vitest";

import type { Protect } from "../../src/room/compose/frame";
import { flatProtectorFor } from "../../src/room/compose/protect";
import { background, failing, halfUnder, pairsOf, read } from "../helpers/layers";
import type { Pair } from "../helpers/layers";
import { enter, flush, parseCss, roomIndex, start, stubViewport, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";

type Screen = { readonly w: number; readonly h: number };
interface Case extends Screen {
  readonly layout: "split" | "column" | "dock";
  readonly mode: "3d" | "2d";
  readonly walking: boolean;
}

const WINDOWS: readonly (Screen & { layout: Case["layout"] })[] = [
  { w: 1366, h: 768, layout: "split" },
  { w: 1440, h: 900, layout: "split" },
  { w: 1920, h: 1080, layout: "split" },
  { w: 1280, h: 720, layout: "column" },
  { w: 390, h: 844, layout: "dock" },
];
const CASES: readonly Case[] = [
  ...WINDOWS.flatMap((s) => [
    { ...s, mode: "3d" as const, walking: false },
    { ...s, mode: "3d" as const, walking: true },
  ]),
  { w: 1366, h: 768, layout: "split", mode: "2d", walking: false },
  { w: 390, h: 844, layout: "dock", mode: "2d", walking: false },
];

/** The room in a conversation, the "Eat" tile offered in 3D; walking where asked (hud-halves.test.ts's harness). */
async function inConversation(c: Case): Promise<Visit> {
  const index = roomIndex();
  const room = {
    ...index,
    live: { ...index.live, turn: "site" as const },
    topics: index.topics.map((t) => ({ ...t, ready: true })),
  };
  const viewport = stubViewport(c);
  const v = start({ webgl: c.mode === "3d", room, viewport: viewport.factory, sendTurn: () => undefined });
  if (c.mode === "3d") {
    const flat = flatProtectorFor(roomIndex());
    const protect: Protect = { ...flat, key: `${flat.key}:eat`, eat: true };
    v.scene.protect = protect;
  }
  await enter(v, "engineer", "dinosaur");
  await throughLoader(v);
  v.clock.advance(5000);
  await flush();
  const id = room.selectables.find((s) => s.action.kind === "talk")?.id ?? "";
  v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`)?.click();
  await flush();
  if (c.mode === "3d") {
    v.scene.created.at(-1)?.eating?.available?.(true);
    await flush();
  }
  if (c.walking) {
    v.doc.querySelector<HTMLButtonElement>("button.room-walk")?.click();
    await flush();
  }
  return v;
}

/** The halves' elements: the top half, the bottom half's panel, and the parts the bottom half holds. */
function halvesOf(v: Visit): { top: Element; bottom: Element; held: Element[] } {
  const top = v.doc.querySelector('[data-half="top"]');
  const bottom = v.doc.querySelector('[data-half="bottom"]');
  if (!top || !bottom) throw new Error("no halves");
  const held = [...v.doc.querySelectorAll(".hud-bar, .room-walk, .room-eat")].filter(
    (el) => halfUnder(el).length > 0 && el.closest("[hidden]") === null,
  );
  return { top, bottom, held };
}

/** Every pair of both halves: the top's, the bottom half's own edge, and each held part's over the half's glass. */
function pairsOfHalves(v: Visit): Pair[] {
  const { top, bottom, held } = halvesOf(v);
  return [top, bottom, ...held].flatMap((el) => pairsOf(el, el === top || el === bottom ? [] : halfUnder(el)));
}

describe("both halves at AA over the room (FR-005, FR-006, SC-002)", () => {
  for (const c of CASES)
    it(`holds every ratio at ${c.w} × ${c.h} (${c.layout}) in ${c.mode}, ${c.walking ? "walking" : "at rest"}`, async () => {
      const v = await inConversation(c);
      const { top, bottom, held } = halvesOf(v);
      expect(top.getAttribute("data-over")).toBe("room");
      expect(bottom.getAttribute("data-over")).toBe("room");
      // The bar, and in the split layout the walking control and "Eat" where offered (3D), lie on the bottom half's
      // glass.
      const names = held.map((el) => el.className.split(" ")[0]);
      expect(names).toContain("room-toolbar");
      if (c.layout === "split" && c.mode === "3d")
        expect(names).toEqual(expect.arrayContaining(["room-walk", "room-eat"]));
      // The bottom half draws the glass the bar no longer draws: the bar's own background is none.
      const bar = v.doc.querySelector(".hud-bar") as Element;
      expect(background(bar)).toBeNull();
      const glass = background(bottom);
      expect(glass?.a).toBeGreaterThan(0);
      expect(glass?.a).toBeLessThan(1);
      const pairs = pairsOfHalves(v);
      expect(pairs.length).toBeGreaterThan(40);
      expect(failing(pairs)).toEqual([]);
    });
});

describe("both halves opaque under the visitor's asks (FR-007)", () => {
  const ROOM = parseCss(read("../../src/room/room.css"));

  for (const ask of [/prefers-reduced-transparency:\s*reduce/, /prefers-contrast:\s*more/, /forced-colors:\s*active/])
    it(`makes the over-room glass 1 under ${ask.source}`, () => {
      const bodies = ROOM.atRules.filter((a) => ask.test(a.prelude)).map((a) => a.body);
      expect(bodies.some((b) => /--over-glass-alpha:\s*1\b/.test(b))).toBe(true);
    });

  for (const c of [CASES[0], CASES[6], CASES[8]] as Case[])
    it(`draws both halves' glass opaque where --over-glass-alpha is 1, at ${c.w} × ${c.h} (${c.layout})`, async () => {
      const v = await inConversation(c);
      const { top, bottom } = halvesOf(v);
      v.doc.documentElement.style.setProperty("--over-glass-alpha", "1");
      expect(background(top)?.a, "top").toBe(1);
      expect(background(bottom)?.a, "bottom").toBe(1);
    });

  it("draws the bottom half in Canvas with a CanvasText edge under forced colours", () => {
    const forced = ROOM.atRules.filter((a) => /forced-colors:\s*active/.test(a.prelude)).map((a) => parseCss(a.body));
    const half = forced.flatMap((s) => s.rules).filter((r) => r.selector.includes(".hud-half"));
    expect(half.some((r) => r.declarations.get("background") === "Canvas")).toBe(true);
    expect(half.some((r) => r.declarations.get("border-color") === "CanvasText")).toBe(true);
  });
});
