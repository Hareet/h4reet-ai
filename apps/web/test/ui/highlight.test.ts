// T007 (spec 008; FR-007 to FR-013, FR-040, SC-001; User Story 1 scenarios 1 to 7): the room's target, in jsdom.
// On the stand-in 3D stage (test/helpers/room.ts), driving the stage's targeting callback as its pointer would and
// reading each target the room hands back through setTarget:
// - after the hand-off's offer, a hover sets the stage's target and a move onto nothing clears it;
// - a click sends one object_selected and clears the target in the same call, and the piece isn't targeted again
//   until the pointer leaves it and returns;
// - a touch press targets until the lift selects, and a slide beyond the slop clears with nothing selected;
// - keyboard focus on a button of the "In the room" list targets its piece, held or not, and focus moving on targets
//   the next; the button pressed selects and clears;
// - the latest input wins, and a pointer leaving the stage leaves a target focus set;
// - during the hand-off and its offer nothing is targeted;
// - only an ID the index lists is targeted, and the fall to 2D clears the target;
// - the network, beacon, history, and storage spies record nothing, and the events nothing but object_selected.
// On the real 3D stage (src/room/scene.ts, with a stand-in renderer, since jsdom has no WebGL), end to end through its
// pointer (src/room/objects.ts): a hover targets exactly what a click at its point would select, so a side-wall
// selectable held at the stage isn't targeted by a hover there, but is by focus; and the stage draws the highlight's
// two passes from the first frame after it's targeted until it's cleared. Every ID is read from the index at run time.
import type { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import { listOnly } from "../../src/room/compose/pick";
import { REFERENCE_DESKTOP } from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { framedBoxes, pickAreasOn, selectablePicker } from "../../src/room/scene/bundle3d";
import type { SceneModule, SceneOptions } from "../../src/room/stage";
import { button, enter, flush, intoRoom, repositoryBundle, roomIndex, start } from "../helpers/room";
import type { TestWindow, Visit } from "../helpers/room";

const swapped = vi.hoisted(() => ({ renderer: null as ((parameters: unknown) => unknown) | null }));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

afterEach(() => {
  swapped.renderer = null;
});

const ids = (): string[] => roomIndex().selectables.map((s) => s.id);
const listButton = (v: Visit, id: string): HTMLButtonElement => {
  const b = v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`);
  if (!b) throw new Error(`no list button for ${id}`);
  return b;
};
const sceneOf = (v: Visit): SceneOptions => {
  const options = v.scene.created[0];
  if (!options) throw new Error("the room built no 3D scene");
  return options;
};
/** The stage's targeting callback, as its pointer calls it. */
const targetVia =
  (v: Visit) =>
  (input: "pointer" | "press", id: string | null): void => {
    const target = sceneOf(v).target;
    if (!target) throw new Error("the room gave the stage no targeting callback");
    target(input, id);
  };
const last = (v: Visit): string | null | undefined => v.scene.targets.at(-1);

/** What the room sent or stored besides the events the test's sink records. */
function expectNothingSent(v: Visit): void {
  expect(v.spies.network).toEqual([]);
  expect(v.spies.beacons).toEqual([]);
  expect(v.spies.history).toEqual([]);
  expect(v.spies.storage).toEqual([]);
}

describe("the target on the stand-in 3D stage", () => {
  it("is set by a hover after the offer, and cleared by a move onto nothing (scenarios 1 and 2)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const [first, second] = ids();
    if (!first || !second) throw new Error("fewer than two selectables");
    const target = targetVia(v);
    target("pointer", first);
    expect(last(v)).toBe(first);
    target("pointer", second);
    expect(last(v)).toBe(second);
    target("pointer", null);
    expect(last(v)).toBeNull();
    expectNothingSent(v);
  });

  it("is cleared in the same call as a click's selection, and comes back only after the pointer leaves (scenario 3)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const id = ids()[0] ?? "";
    const target = targetVia(v);
    target("pointer", id);
    target("press", id);
    expect(last(v)).toBe(id);
    const [events, targets] = [v.events.length, v.scene.targets.length];
    sceneOf(v).select(id);
    // One object_selected, and the target cleared before select returned.
    expect(v.events.slice(events)).toEqual([{ kind: "object_selected", id }]);
    expect(v.scene.targets.slice(targets)).toEqual([null]);
    // The mouse rests over the piece and moves within it: the border stays off.
    target("pointer", id);
    target("pointer", id);
    expect(v.scene.targets.slice(targets)).toEqual([null]);
    // It leaves, and returns.
    target("pointer", null);
    target("pointer", id);
    expect(v.scene.targets.slice(targets)).toEqual([null, id]);
    expect(v.events.slice(events)).toEqual([{ kind: "object_selected", id }]);
    expectNothingSent(v);
  });

  it("is a touch press's until its lift selects, and a slide beyond the slop clears it with nothing selected (scenario 4)", async () => {
    const v = start({ webgl: true, touch: true });
    await intoRoom(v);
    const [first, second] = ids();
    if (!first || !second) throw new Error("fewer than two selectables");
    const target = targetVia(v);
    const events = v.events.length;
    target("press", first);
    expect(last(v)).toBe(first);
    sceneOf(v).select(first);
    expect(last(v)).toBeNull();
    // The finger's lift names nothing; a new press on the same piece shows its border again.
    target("press", null);
    target("press", first);
    expect(last(v)).toBe(first);
    target("press", null);
    target("press", second);
    expect(last(v)).toBe(second);
    // Beyond the slop: the press names nothing, and nothing is selected.
    target("press", null);
    expect(last(v)).toBeNull();
    expect(v.events.slice(events)).toEqual([{ kind: "object_selected", id: first }]);
    expectNothingSent(v);
  });

  it("is the focused list button's piece, the next one's as focus moves on, and none once focus leaves the list (scenario 5)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const all = ids();
    for (const id of all) {
      listButton(v, id).focus();
      expect(v.doc.activeElement).toBe(listButton(v, id));
      expect(last(v), id).toBe(id);
    }
    v.doc.querySelector<HTMLInputElement>("#talk-text")?.focus();
    expect(last(v)).toBeNull();
    expectNothingSent(v);
  });

  it("is a side-wall selectable's from its list button, at any stage, held or not (FR-009, FR-040)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const walls = roomIndex().selectables.filter((s) => s.side_wall);
    expect(walls.length).toBeGreaterThan(0);
    for (const { id } of walls) {
      listButton(v, id).focus();
      expect(last(v), id).toBe(id);
    }
  });

  it("is cleared by the list button's press in the same call as its selection, and comes back after focus leaves", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const id = ids()[0] ?? "";
    const b = listButton(v, id);
    b.focus();
    expect(last(v)).toBe(id);
    const [events, targets] = [v.events.length, v.scene.targets.length];
    b.click();
    expect(v.events.slice(events)[0]).toEqual({ kind: "object_selected", id });
    expect(v.scene.targets.slice(targets)).toEqual([null]);
    // Focus left on the button names it again only after leaving it.
    listButton(v, ids()[1] ?? "").focus();
    b.focus();
    expect(last(v)).toBe(id);
  });

  it("goes to the latest input, and a pointer leaving the stage leaves the one focus set (edge cases)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const [first, second] = ids();
    if (!first || !second) throw new Error("fewer than two selectables");
    const target = targetVia(v);
    target("pointer", first);
    listButton(v, second).focus();
    expect(last(v)).toBe(second);
    target("pointer", first);
    expect(last(v)).toBe(first);
    listButton(v, second).blur();
    listButton(v, second).focus();
    expect(last(v)).toBe(second);
    target("pointer", null);
    expect(last(v)).toBe(second);
  });

  it("is never set during the hand-off or its offer, by a hover, a press, or focus (scenario 7; FR-010)", async () => {
    const v = start({ webgl: true });
    await enter(v);
    const id = ids()[0] ?? "";
    const target = targetVia(v);
    target("pointer", id);
    target("press", id);
    listButton(v, id).focus();
    expect(v.scene.targets).toEqual([]);
    // The hand-off ends: its offer shows, and the room still takes no input.
    v.clock.advance(5000);
    target("pointer", id);
    listButton(v, ids()[1] ?? "").focus();
    expect(v.scene.targets).toEqual([]);
    button(v.doc, "Keep it for later").click();
    await flush();
    target("pointer", id);
    expect(last(v)).toBe(id);
  });

  it("is only an ID the index lists", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    targetVia(v)("pointer", "fx-elsewhere");
    expect(v.scene.targets).toEqual([]);
  });

  it("leaves the selection whole when the stage throws taking a target: the event, the topic, and the room drawing", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const stage = v.scene.stage;
    if (!stage) throw new Error("no stage");
    stage.setTarget = () => {
      throw new Error("a stage that can't take its target");
    };
    const id = roomIndex().selectables.find((s) => s.action.kind === "talk")?.id ?? "";
    const messages = v.doc.querySelector('[role="log"]')?.childElementCount ?? 0;
    expect(() => targetVia(v)("pointer", id)).not.toThrow();
    const events = v.events.length;
    expect(() => sceneOf(v).select(id)).not.toThrow();
    expect(v.events.slice(events)).toEqual([{ kind: "object_selected", id }]);
    expect(v.doc.querySelector('[role="log"]')?.childElementCount ?? 0).toBeGreaterThan(messages);
    expect(() => listButton(v, id).focus()).not.toThrow();
    const frames = v.scene.frames;
    v.clock.advance(100);
    expect(v.scene.frames).toBeGreaterThan(frames);
  });

  it("is cleared by the fall to 2D, the 3D stage given none before it goes", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const id = ids()[0] ?? "";
    targetVia(v)("pointer", id);
    expect(last(v)).toBe(id);
    button(v.doc, "2D view").click();
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    expect(last(v)).toBeNull();
    expect(v.scene.disposed).toBe(1);
    // The 2D room takes list focus as a target with nothing to fail.
    listButton(v, id).focus();
    listButton(v, id).click();
    expect(v.events.at(-1)).toEqual({ kind: "object_selected", id });
  });

  it("sends nothing over a whole visit's targeting: no request, beacon, history entry, or storage, and no event but object_selected (FR-013)", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const before = v.events.length;
    const target = targetVia(v);
    for (const id of ids()) {
      target("pointer", id);
      target("press", id);
      target("press", null);
      listButton(v, id).focus();
      target("pointer", null);
    }
    sceneOf(v).select(ids()[0] ?? "");
    v.clock.advance(60_000);
    expect(new Set(v.events.slice(before).map((e) => e.kind))).toEqual(new Set(["object_selected"]));
    expectNothingSent(v);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The real 3D stage, end to end through its pointer
// --------------------------------------------------------------------------------------------------------------------
interface RealStage {
  readonly v: Visit;
  readonly canvas: HTMLCanvasElement;
  /** Each pick the stage's pointer reported, in order. */
  readonly reported: ["pointer" | "press", string | null][];
  /** Each scene name the renderer drew since the last read. */
  renders(): string[];
  /** Sizes the canvas and lets a frame measure it. */
  size(stage: Stage): Promise<void>;
  move(point: readonly [number, number]): void;
  leave(): void;
  tap(point: readonly [number, number], pointerType?: string): void;
}

async function realStage(): Promise<RealStage> {
  const names: string[] = [];
  swapped.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene) => names.push(scene.name),
    dispose: () => undefined,
  });
  const reported: RealStage["reported"] = [];
  const loadScene = async (): Promise<SceneModule> => {
    const real = (await import("../../src/room/scene")) as SceneModule;
    return {
      createScene(options) {
        const target = options.target;
        return real.createScene(
          Object.assign(Object.create(options) as SceneOptions, {
            target: (input: "pointer" | "press", id: string | null) => {
              reported.push([input, id]);
              target?.(input, id);
            },
          }),
        );
      },
    };
  };
  const v = start({ webgl: true, loadScene });
  await intoRoom(v);
  expect(v.room.visit.mode).toBe("3d");
  const canvas = v.doc.querySelector("canvas");
  if (!canvas) throw new Error("no canvas");
  let current: Stage = { w: 0, h: 0 };
  Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => current.w });
  Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => current.h });
  const fire = (type: string, [clientX, clientY]: readonly [number, number], pointerType = "mouse"): void => {
    canvas.dispatchEvent(
      new (v.win as TestWindow).PointerEvent(type, { bubbles: true, pointerType, clientX, clientY, button: 0 }),
    );
  };
  return {
    v,
    canvas,
    reported,
    renders: () => names.splice(0),
    async size(stage) {
      current = stage;
      canvas.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: stage.w, bottom: stage.h, width: stage.w, height: stage.h, x: 0, y: 0 }) as DOMRect;
      v.clock.advance(50);
      await flush();
    },
    move: (point) => fire("pointermove", point),
    leave: () => fire("pointerleave", [-1, -1]),
    tap(point, pointerType = "mouse") {
      fire("pointerdown", point, pointerType);
      fire("pointerup", point, pointerType);
    },
  };
}

const PASSES = ["highlight:edge", "highlight:band"];
const passesIn = (names: readonly string[]): string[] => names.filter((n) => n.startsWith("highlight:"));

/** The centre of each selectable's core at a stage, and the IDs held there, by the runtime's own functions. */
function areasAt(stage: Stage): { centres: Map<string, readonly [number, number]>; held: ReadonlySet<string> } {
  const { scene: part, index } = repositoryBundle() as { scene: RoomScene; index: RoomIndex };
  const areas = pickAreasOn(part, index, framing(stage.w / stage.h, framedBoxes(part)), stage);
  const sideWall = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
  const held = listOnly(areas, [0, 0, stage.w, stage.h], sideWall);
  const centres = new Map<string, readonly [number, number]>();
  for (const a of areas) if (a.core) centres.set(a.id, [a.core[0] + a.core[2] / 2, a.core[1] + a.core[3] / 2]);
  return { centres, held };
}

describe("the target on the real 3D stage, through its pointer", () => {
  it("draws the highlight from the first frame after a hover until the pointer leaves, and clears it on a click", async () => {
    const r = await realStage();
    const stage = REFERENCE_DESKTOP.stage;
    await r.size(stage);
    const { centres, held } = areasAt(stage);
    const id = ids().find((x) => !held.has(x) && centres.has(x));
    if (!id) throw new Error("no selectable with a pick area at the reference desktop's stage");
    const at = centres.get(id) as readonly [number, number];
    r.renders();
    r.move(at);
    expect(r.reported.at(-1)).toEqual(["pointer", id]);
    r.v.clock.advance(16);
    expect(passesIn(r.renders())).toEqual(PASSES);
    r.leave();
    r.v.clock.advance(16);
    expect(passesIn(r.renders())).toEqual([]);
    // A click selects it and clears the border; a move within it keeps the border off; leaving and returning shows it.
    r.move(at);
    const events = r.v.events.length;
    r.tap(at);
    expect(r.v.events.slice(events)).toEqual([{ kind: "object_selected", id }]);
    r.v.clock.advance(16);
    r.renders();
    r.move([at[0] + 1, at[1]]);
    r.v.clock.advance(32);
    expect(passesIn(r.renders())).toEqual([]);
    r.leave();
    r.move(at);
    r.v.clock.advance(16);
    expect(passesIn(r.renders()).slice(-2)).toEqual(PASSES);
  });

  it("targets by hover exactly what a click would select at each point, so a held side-wall selectable only by focus", async () => {
    const r = await realStage();
    const { scene: part, index } = repositoryBundle();
    // A stage where the room holds a side-wall selectable: the smallest the report lists (FR-064's carve-out).
    const stage: Stage = { w: 304, h: 196 };
    const { held } = areasAt(stage);
    expect(held.size).toBeGreaterThan(0);
    await r.size(stage);
    const picker = selectablePicker(part, index);
    picker.resize(stage);
    const seen = new Set<string>();
    for (let y = 4; y < stage.h; y += 8)
      for (let x = 4; x < stage.w; x += 8) {
        r.move([x, y]);
        const expected = picker.pick({ x: (x / stage.w) * 2 - 1, y: -((y / stage.h) * 2) + 1 });
        expect(r.reported.at(-1), `${x}, ${y}`).toEqual(["pointer", expected]);
        if (expected) seen.add(expected);
      }
    for (const id of held) expect(seen.has(id), id).toBe(false);
    r.leave();
    r.v.clock.advance(16);
    r.renders();
    for (const id of held) {
      listButton(r.v, id).focus();
      r.v.clock.advance(16);
      expect(passesIn(r.renders()).slice(-2), id).toEqual(PASSES);
    }
  });
});
