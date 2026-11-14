// Spec 024 (T010; FR-001, FR-012; US1 AS2, AS3; Edge Cases; plan.md §5.5's key): the key B. The walking view's input
// gives an `eat` intent on B (by its physical key), once, never with a modifier, never from a text field or the twin's
// chat; the walking keys are unchanged. The walking orchestrator passes the intent on with the figure's pose, held or
// following. The press's gate (eat/press.ts) takes it only for the dinosaur showing its model, at an edible piece reach
// names (spec 008's kernel over the edible placements), with nothing in flight.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { floorOfPart } from "../../src/room/compose/floor";
import type { WalkableFloor } from "../../src/room/compose/floor";
import { REFERENCE_DESKTOP } from "../../src/room/compose/stages";
import type { EatAvailability } from "../../src/room/eat/available";
import { createMeal } from "../../src/room/eat/meal";
import { availabilityFor, eatTarget, edibleReach, edibleTargets } from "../../src/room/eat/press";
import { framedBoxes } from "../../src/room/scene/bundle3d";
import { createWalking } from "../../src/room/scene/walking";
import { createWalkInput } from "../../src/room/walk/input";
import type { WalkIntents } from "../../src/room/walk/input";
import type { Pose } from "../../src/room/walk/movement";
import { reachTargets } from "../../src/room/walk/reach";
import { repositoryBundle } from "../helpers/room";

function input() {
  const dom = new JSDOM(
    `<main><div id="view" tabindex="0"><canvas id="c"></canvas><input id="field"></div><textarea id="chat"></textarea></main>`,
    { pretendToBeVisual: true },
  );
  const win = dom.window as unknown as Window & typeof globalThis;
  const doc = win.document;
  const view = doc.getElementById("view") as HTMLElement;
  const walk = createWalkInput(doc.getElementById("c") as HTMLElement, win);
  walk.bind(view);
  const key = (code: string, key: string, on: HTMLElement = view, init: KeyboardEventInit = {}): void => {
    on.dispatchEvent(new win.KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true, ...init }));
    on.dispatchEvent(new win.KeyboardEvent("keyup", { code, key, bubbles: true, cancelable: true, ...init }));
  };
  return { doc, view, walk, key };
}

const RATES = { turn: Math.PI / 2, tilt: Math.PI / 4 };

describe("the key B (FR-012)", () => {
  it("gives one eat intent, by its physical key in any layout", () => {
    const { walk, key } = input();
    key("KeyB", "b");
    expect(walk.take(0.016, RATES).eat).toBe(true);
    expect(walk.take(0.016, RATES).eat).toBe(false);
    key("KeyB", "и");
    expect(walk.take(0.016, RATES).eat).toBe(true);
  });

  it("is ignored with a modifier (the browser's Ctrl+B, Cmd+B)", () => {
    const { walk, key, view } = input();
    key("KeyB", "b", view, { ctrlKey: true });
    key("KeyB", "b", view, { metaKey: true });
    key("KeyB", "b", view, { altKey: true });
    expect(walk.take(0.016, RATES).eat).toBe(false);
  });

  it("is ignored in a text field, and with the twin's chat focused", () => {
    const { walk, key, doc } = input();
    key("KeyB", "b", doc.getElementById("field") as HTMLElement);
    key("KeyB", "b", doc.getElementById("chat") as HTMLElement);
    expect(walk.take(0.016, RATES).eat).toBe(false);
  });

  it("leaves the walking keys as they were", () => {
    const { walk, key, view } = input();
    const held = (code: string, k: string) => {
      view.dispatchEvent(new view.ownerDocument.defaultView!.KeyboardEvent("keydown", { code, key: k, bubbles: true }));
    };
    for (const [code, k] of [
      ["KeyW", "w"],
      ["KeyD", "d"],
      ["KeyQ", "q"],
      ["KeyR", "r"],
    ] as const)
      held(code, k);
    key("Enter", "Enter");
    key("Escape", "Escape");
    const got = walk.take(1, RATES);
    expect(got.move).toEqual({ forward: 1, right: 1 });
    expect(got.turn).toBeCloseTo(-RATES.turn);
    expect(got.tilt).toBeCloseTo(-RATES.tilt);
    expect([got.enter, got.escape, got.eat]).toEqual([true, true, false]);
    for (const [code, k] of [
      ["KeyA", "a"],
      ["KeyS", "s"],
      ["KeyE", "e"],
      ["KeyF", "f"],
      ["ArrowUp", "ArrowUp"],
      ["ArrowLeft", "ArrowLeft"],
    ] as const)
      key(code, k);
    expect(walk.take(1, RATES).eat).toBe(false);
  });
});

const NONE: WalkIntents = {
  move: { forward: 0, right: 0 },
  turn: 0,
  tilt: 0,
  zoom: 0,
  taps: [],
  enter: false,
  escape: false,
  eat: false,
};

function walking() {
  const { scene: part, index } = repositoryBundle() as {
    scene: RoomScene;
    index: ReturnType<typeof repositoryBundle>["index"];
  };
  const floor = floorOfPart(part, part.walking.radius_m) as WalkableFloor;
  const eats: Pose[] = [];
  const box: { view: ReturnType<typeof createWalking> | null } = { view: null };
  const view = createWalking({
    floor,
    data: part.walking,
    boxes: framedBoxes(part),
    targets: reachTargets(part, index),
    figure: { frame: () => undefined, rest: () => undefined },
    picker: { setCamera: () => undefined, pick: () => null },
    reach: () => undefined,
    select: () => undefined,
    target: () => null,
    escape: () => box.view?.leave(0),
    eat: (pose) => eats.push(pose),
  });
  box.view = view;
  return { part, view, eats };
}

describe("the walking view passes B on (FR-012)", () => {
  it("with the figure's pose, while held and while following, and only on the intent", () => {
    const { view, eats } = walking();
    const stage = REFERENCE_DESKTOP.stage;
    view.enter(0);
    view.frame(NONE, stage, 0, 0.016, true);
    expect(eats).toEqual([]);
    view.frame({ ...NONE, eat: true }, stage, 16, 0.016, true);
    expect(eats).toHaveLength(1);
    expect(eats[0]).toEqual(view.pose);
    view.frame({ ...NONE, tilt: 0.01 }, stage, 32, 0.016, true);
    view.frame({ ...NONE, eat: true }, stage, 48, 0.016, true);
    expect(eats).toHaveLength(2);
  });

  it("not after Escape left the view in the same frame", () => {
    const { view, eats } = walking();
    view.enter(0);
    view.frame({ ...NONE, escape: true, eat: true }, REFERENCE_DESKTOP.stage, 0, 0.016, true);
    expect(eats).toEqual([]);
  });
});

describe("the press's gate (FR-001; US1 AS2, AS3)", () => {
  const part = repositoryBundle().scene as RoomScene;
  const targets = edibleTargets(part);
  const options = {
    reach: part.walking.reach_m,
    cone: (part.walking.reach_cone_deg * Math.PI) / 180,
    radius: part.walking.radius_m,
  };
  /** A pose 0.3 m in front of (+z of) the placement's frame box, facing it. */
  const before = (id: string): Pose => {
    const p = part.placements.find((q) => q.id === id);
    if (!p) throw new Error(id);
    const [x, z] = [(p.frame_box.min[0] + p.frame_box.max[0]) / 2, p.frame_box.max[2] + 0.3];
    return { x, z, heading: 0, speed: 0, walking: false } as Pose;
  };
  const base: Omit<EatAvailability, "reached"> = {
    view: "3d",
    avatar: "dinosaur",
    figureModel: true,
    paused: false,
    loading: false,
    failed: false,
  };
  const model = (): boolean => true;

  it("targets only the edible placements, in scene order", () => {
    expect(targets.map((t) => t.id)).toEqual(["work-desk", "laptop", "busy-sign", "chalkboard"]);
  });

  it("takes the dinosaur's press at the desk", () => {
    const meal = createMeal({ regrow_s: 20, now: () => 0 });
    const piece = edibleReach(before("work-desk"), targets, options);
    expect(piece).toBe("work-desk");
    expect(eatTarget(base, piece, meal, model)).toBe("work-desk");
    expect(availabilityFor(base, piece, meal, model).reached).toEqual({ edible: true, model: true, canBite: true });
  });

  it.each(["woman", "man", "dog"])("ignores the %s's press", (avatar) => {
    const meal = createMeal({ regrow_s: 20, now: () => 0 });
    expect(eatTarget({ ...base, avatar }, "work-desk", meal, model)).toBeNull();
  });

  it("ignores a press at a piece that isn't edible (US1 AS3)", () => {
    const meal = createMeal({ regrow_s: 20, now: () => 0 });
    const piece = edibleReach(before("bicycle"), targets, options);
    expect(piece).toBeNull();
    expect(eatTarget(base, piece, meal, model)).toBeNull();
  });

  it("ignores a press while a chunk is in flight", () => {
    const meal = createMeal({ regrow_s: 20, now: () => 0 });
    meal.addPiece("laptop", { centres: [[0, 0, 0]], asideEmpty: false });
    expect(meal.bite("laptop", [0, 0, 0])).toBe(0);
    expect(eatTarget(base, "work-desk", meal, model)).toBeNull();
    expect(eatTarget(base, "laptop", meal, model)).toBeNull();
  });

  it("ignores a press at a piece on its stand-in", () => {
    const meal = createMeal({ regrow_s: 20, now: () => 0 });
    expect(eatTarget(base, "work-desk", meal, () => false)).toBeNull();
  });
});
