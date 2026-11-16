// T-C02 (spec 029; FR-019; plan.md §R-C3, §R-C6): the monitor's green line and its blinking cursor.
// - The terminal renderer: a block with `ink: green` draws its line and its cursor in the terminal's green, at 4.5:1 or
//   more on the screen's ground; with `cursor: blink`, a block cursor stays after the last character once the typing
//   ends, shown in its phase "on" and hidden in its phase "off", BLINK_MS each, and shown in the final frame, which the
//   2D room, reduced motion, the pause, and quality 3 draw. The cursor adds no word to the text copy. A block without
//   the two keys draws as before.
// - room-data.json's block carries the two keys to the region: the page reads them, and only their two values.
// - In 3D (scene/faces3d.ts): while the room animates, a face with a blinking cursor is drawn again only when the
//   cursor's phase changes; while it doesn't (reduced motion, the pause, a hidden page: the motion store's `animate`)
//   or at quality 3, the cursor is held, shown, and the face isn't drawn again.
// The faces come from compose() over the fixture set, whose IDs are synthetic, its terminal block given the two keys.
import { JSDOM } from "jsdom";
import { Object3D } from "three";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "../../build/room/checks/rw";
import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { GRID_METRICS, TYPING_LIMIT_S, textGrid } from "../../src/room/compose/layout";
import type { DisplayList, Op } from "../../src/room/faces/display-list";
import { REGISTRY } from "../../src/room/faces/registry";
import type { RegionInput } from "../../src/room/faces/registry";
import { BLINK_MS, TERMINAL_GREEN } from "../../src/room/faces/terminal";
import { faceLayout, roomTextOf } from "../../src/room/faces/words";
import type { RoomText } from "../../src/room/faces/words";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { buildFaceQuads } from "../../src/room/scene/faces3d";
import { FakeClock } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const LINE = "Applied AI Engineer";
const terminal = REGISTRY.terminal;

/** A terminal region's input: the monitor's line on a 24 × 4 grid. */
const input = (over: Partial<RegionInput> = {}): RegionInput => ({
  box: { x: 100, y: 70, w: 1840, h: 720 },
  grid: { cols: 24, rows: 4 },
  typeface: { family: "IBM Plex Mono, monospace", weight: 400, capRatio: 0.7 },
  lines: [LINE],
  badge: null,
  outline: null,
  counter: false,
  ...over,
});
const green = (): RegionInput => input({ ink: "green", cursor: "blink" });
const rects = (ops: readonly Op[]): Extract<Op, { op: "rect" }>[] =>
  ops.filter((o): o is Extract<Op, { op: "rect" }> => o.op === "rect");
const texts = (ops: readonly Op[]): Extract<Op, { op: "text" }>[] =>
  ops.filter((o): o is Extract<Op, { op: "text" }> => o.op === "text");

describe("the terminal's green line and its cursor (FR-019)", () => {
  it("draws the line and its cursor in the terminal's green, at 4.5:1 or more on the screen's ground", () => {
    const ops = terminal.draw(green());
    expect(texts(ops).map((t) => [t.text, t.color])).toEqual([[LINE, TERMINAL_GREEN]]);
    const cursor = rects(ops);
    expect(cursor).toHaveLength(1);
    expect(cursor[0]?.color).toBe(TERMINAL_GREEN);
    // After the last character: Plex Mono's cells are 0.6 em wide.
    const em = textGrid("terminal", green().grid, green().box)?.em ?? 0;
    expect(cursor[0]?.x).toBeCloseTo(100 + [...LINE].length * GRID_METRICS.terminal.advance * em, 6);
    expect(contrastRatio(TERMINAL_GREEN, terminal.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("types as before, its cursor green while it types", () => {
    const { typingMs } = terminal.layout(green());
    const half = terminal.draw(green(), typingMs / 2);
    expect(texts(half)[0]?.text.length).toBeLessThan(LINE.length);
    expect(rects(half).map((r) => r.color)).toEqual([TERMINAL_GREEN]);
  });

  it("after its typing, shows the cursor in phase on and hides it in phase off; its final frame shows it", () => {
    const { typingMs } = terminal.layout(green());
    const cursorAt = (ms: number): number => rects(terminal.draw(green(), ms)).length;
    expect(cursorAt(typingMs + 1)).toBe(1);
    expect(cursorAt(typingMs + BLINK_MS + 1)).toBe(0);
    expect(cursorAt(typingMs + 2 * BLINK_MS + 1)).toBe(1);
    expect(cursorAt(typingMs + 3 * BLINK_MS + 1)).toBe(0);
    expect(cursorAt(Infinity)).toBe(1);
    // The words are whole in every phase.
    expect(texts(terminal.draw(green(), typingMs + BLINK_MS + 1)).map((t) => t.text)).toEqual([LINE]);
  });

  it("blinks at most twice a second, far from three flashes a second (WCAG 2.2's 2.3.1)", () => {
    expect(BLINK_MS).toBeGreaterThanOrEqual(500);
  });

  it("adds no word: the layout's words and copy are the line's; it names its blink period, and none without the key", () => {
    const layout = terminal.layout(green());
    expect(layout.words).toEqual([LINE]);
    expect(layout.copy).toEqual([LINE]);
    expect(layout.blinkMs).toBe(BLINK_MS);
    expect(terminal.layout(input()).blinkMs ?? 0).toBe(0);
  });

  it("draws a terminal without the two keys as before: its own ink, and no cursor once typed", () => {
    const ops = terminal.draw(input());
    expect(texts(ops).map((t) => t.color)).toEqual(["#d6dde6"]);
    expect(rects(ops)).toEqual([]);
    expect(rects(terminal.draw(input(), 1)).map((r) => r.color)).toEqual(["#8fc3ff"]);
  });

  it("reads the two keys from room-data.json's block, and only their two values", () => {
    const block = (extra: Record<string, unknown>) => ({
      room_text: { blocks: [{ id: "fx-line", state: "approved", lines: [{ text: "fx" }], ...extra }] },
    });
    expect(roomTextOf(block({ ink: "green", cursor: "blink" })).blocks.get("fx-line")).toMatchObject({
      ink: "green",
      cursor: "blink",
    });
    const plain = roomTextOf(block({})).blocks.get("fx-line");
    expect(plain?.ink ?? null).toBeNull();
    expect(plain?.cursor ?? null).toBeNull();
    expect(roomTextOf(block({ ink: "red" })).blocks.size).toBe(0);
    expect(roomTextOf(block({ cursor: "steady" })).blocks.size).toBe(0);
  });
});

describe("the cursor in 3D (scene/faces3d.ts; FR-019, FR-059)", () => {
  let drafts: ComposeResult | undefined;
  const fixture = (): ComposeResult => (drafts ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }));
  const terminalFace = () => {
    const face = fixture().index.faces.find((f) => f.regions[0]?.renderer === "terminal");
    const source = face?.regions[0]?.source;
    if (!face || !source || !("room_text" in source)) throw new Error("no terminal face in the fixture");
    return { face, block: source.room_text };
  };
  /** The fixture's room text, its terminal's block given a green ink and a blinking cursor. */
  const blinking = (): RoomText => {
    const { block } = terminalFace();
    const blocks = fixture().roomText.blocks.map((b) => (b.id === block ? { ...b, ink: "green", cursor: "blink" } : b));
    return roomTextOf({ room_text: { blocks } });
  };

  function quads(options: { level?: number; animate?: boolean } = {}) {
    const { scene: part, index } = fixture();
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index });
    const clock = new FakeClock();
    const motion = { animate: options.animate ?? true };
    const faces = buildFaceQuads({
      part,
      index,
      placements: room.placements,
      doc: new JSDOM("<main></main>").window.document,
      clock,
      dpr: 2,
      level: options.level ?? 0,
      motion: () => motion,
    });
    faces.setText(blinking());
    const id = terminalFace().face.id;
    const list = (): DisplayList | undefined => faces.lists.get(id);
    const step = (ms: number): void => {
      clock.advance(ms);
      faces.frame(clock.now());
    };
    return { faces, clock, motion, list, step };
  }
  const cursorShown = (list: DisplayList | undefined): boolean =>
    rects(list?.ops ?? []).some((r) => r.color === TERMINAL_GREEN);

  it("names the blink in the face's layout", () => {
    const { face } = terminalFace();
    expect(faceLayout(face, { index: fixture().index, text: blinking() })?.blinkMs).toBe(BLINK_MS);
  });

  it("draws the face again only when the cursor's phase changes, while the room animates", () => {
    const q = quads();
    q.step(0);
    q.step(TYPING_LIMIT_S * 1000);
    const on = q.list();
    expect(cursorShown(on)).toBe(true);
    q.step(100);
    expect(q.list()).toBe(on);
    q.step(BLINK_MS);
    const off = q.list();
    expect(off).not.toBe(on);
    expect(cursorShown(off)).toBe(false);
    q.step(100);
    expect(q.list()).toBe(off);
    q.step(BLINK_MS);
    expect(q.list()).not.toBe(off);
    expect(cursorShown(q.list())).toBe(true);
  });

  it("holds the cursor shown and still while the room doesn't animate, and at quality 3", () => {
    for (const still of [quads({ animate: false }), quads({ level: 3 })]) {
      still.step(0);
      const held = still.list();
      expect(cursorShown(held)).toBe(true);
      for (let k = 0; k < 6; k++) still.step(BLINK_MS / 2);
      expect(still.list()).toBe(held);
    }
  });

  it("holds the cursor shown at once when the room stops mid-blink, and blinks again when it moves", () => {
    const q = quads();
    q.step(0);
    q.step(TYPING_LIMIT_S * 1000);
    q.step(BLINK_MS);
    expect(cursorShown(q.list())).toBe(false);
    q.motion.animate = false;
    q.step(1);
    const held = q.list();
    expect(cursorShown(held)).toBe(true);
    q.step(BLINK_MS * 3);
    expect(q.list()).toBe(held);
    q.motion.animate = true;
    q.step(1);
    q.step(BLINK_MS);
    expect(cursorShown(q.list())).toBe(false);
  });
});
