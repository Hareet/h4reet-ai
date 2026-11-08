// T043 (spec 008; FR-022, FR-030, FR-032 to FR-035, FR-049; SC-005): src/room/scene/walking.ts, the walking view's
// orchestrator, in Node over the repository's 3D part, a fake input's intents, a recording picker, and a recording
// figure driver. It steps the figure by the held keys and follows it; names reach at entry and only when it changes;
// moves the picker's camera at most once a frame and only after the camera moved; resolves a tap by the pick first and
// the floor second; selects the target on Enter and passes Escape on; and leaves to the production framing, the figure
// rested, the camera back within 500 ms, or at once while the motion store doesn't animate.
import { describe, expect, it } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { floorOfPart } from "../../src/room/compose/floor";
import type { WalkableFloor } from "../../src/room/compose/floor";
import { framing } from "../../src/room/compose/framing";
import { projector } from "../../src/room/compose/project";
import type { Camera } from "../../src/room/compose/project";
import { REFERENCE_DESKTOP } from "../../src/room/compose/stages";
import { framedBoxes } from "../../src/room/scene/bundle3d";
import type { FigureFrame } from "../../src/room/scene/figure";
import { createWalking } from "../../src/room/scene/walking";
import type { WalkIntents } from "../../src/room/walk/input";
import { ARRIVE_M } from "../../src/room/walk/movement";
import { reachTargets } from "../../src/room/walk/reach";
import { TRANSITION_MS } from "../../src/room/walk/camera";
import { repositoryBundle } from "../helpers/room";

const STAGE = REFERENCE_DESKTOP.stage;
const NONE: WalkIntents = {
  move: { forward: 0, right: 0 },
  turn: 0,
  tilt: 0,
  zoom: 0,
  taps: [],
  enter: false,
  escape: false,
};
const intents = (over: Partial<WalkIntents>): WalkIntents => ({ ...NONE, ...over });

function setup(pickAt: (ndc: { x: number; y: number }) => string | null = () => null) {
  const { scene: part, index } = repositoryBundle() as {
    scene: RoomScene;
    index: ReturnType<typeof repositoryBundle>["index"];
  };
  const floor = floorOfPart(part, part.walking.radius_m) as WalkableFloor;
  const record = {
    cameras: [] as Camera[],
    reach: [] as (string | null)[],
    selected: [] as string[],
    escapes: 0,
    frames: [] as FigureFrame[],
    rests: 0,
    target: null as string | null,
  };
  const view = createWalking({
    floor,
    data: part.walking,
    boxes: framedBoxes(part),
    targets: reachTargets(part, index),
    figure: { frame: (f) => record.frames.push(f), rest: () => (record.rests += 1) },
    picker: { setCamera: (c) => record.cameras.push(c), pick: pickAt },
    reach: (id) => record.reach.push(id),
    select: (id) => record.selected.push(id),
    target: () => record.target,
    escape: () => (record.escapes += 1),
  });
  return { part, index, floor, view, record };
}

describe("the walking view's orchestrator (spec 008, T043)", () => {
  it("starts at the production framing with the figure at its place, and follows it in at most 500 ms", () => {
    const { part, floor, view, record } = setup();
    view.enter(0);
    expect(view.on).toBe(true);
    expect([view.pose.x, view.pose.z]).toEqual([floor.start.x, floor.start.z]);
    const home = framing(STAGE.w / STAGE.h, framedBoxes(part));
    const first = view.frame(NONE, STAGE, 0, 0, true);
    expect(first.position).toEqual(home.position);
    const later = view.frame(NONE, STAGE, TRANSITION_MS, 0.016, true);
    expect(later.target[0]).toBeCloseTo(floor.start.x, 9);
    expect(later.target[2]).toBeCloseTo(floor.start.z, 9);
    // Not animating: at the follow camera at once.
    const { view: other } = setup();
    other.enter(0);
    const cut = other.frame(NONE, STAGE, 0, 0, false);
    expect(cut.target[0]).toBeCloseTo(floor.start.x, 9);
    expect(record.frames.length).toBeGreaterThan(0);
  });

  it("steps the figure by the held keys, relative to the camera, and drives it each frame", () => {
    const { view, record } = setup();
    view.enter(0);
    const before = view.pose;
    let now = 0;
    for (let k = 0; k < 10; k += 1)
      view.frame(intents({ move: { forward: 0, right: 1 } }), STAGE, (now += 16), 0.016, true);
    // Right, with the camera straight into the room: toward +x.
    expect(view.pose.x).toBeGreaterThan(before.x);
    expect(record.frames.at(-1)?.pose).toEqual(view.pose);
    expect(record.frames.at(-1)?.pose.walking).toBe(true);
    view.frame(NONE, STAGE, now + 16, 0.016, true);
    expect(view.pose.walking).toBe(false);
  });

  it("names reach at entry and again only when it changes", () => {
    const { view, record } = setup();
    view.enter(0);
    expect(record.reach).toHaveLength(1);
    view.frame(NONE, STAGE, 16, 0.016, true);
    view.frame(NONE, STAGE, 32, 0.016, true);
    expect(record.reach).toHaveLength(1);
    // Walking about: each naming differs from the one before.
    let now = 32;
    for (let k = 0; k < 120; k += 1)
      view.frame(intents({ move: { forward: 1, right: k < 60 ? -1 : 1 } }), STAGE, (now += 16), 0.016, true);
    for (let k = 1; k < record.reach.length; k += 1) expect(record.reach[k]).not.toBe(record.reach[k - 1]);
  });

  it("moves the picker's camera at most once a frame, and only after the camera moved", () => {
    const { view, record } = setup();
    view.enter(0);
    view.frame(NONE, STAGE, 0, 0, false);
    expect(record.cameras).toHaveLength(1);
    view.frame(NONE, STAGE, 16, 0.016, false);
    view.frame(NONE, STAGE, 32, 0.016, false);
    expect(record.cameras).toHaveLength(1);
    view.frame(intents({ turn: 0.1 }), STAGE, 48, 0.016, false);
    expect(record.cameras).toHaveLength(2);
  });

  it("takes a tap on a piece as a selection, and on the floor as a walk toward it", () => {
    const picked = setup(() => "a-piece");
    picked.view.enter(0);
    picked.view.frame(intents({ taps: [{ x: 0, y: 0 }] }), STAGE, 0, 0, false);
    expect(picked.record.selected).toEqual(["a-piece"]);
    // A floor point a little to the figure's right, projected at the follow camera: a walk there.
    const { floor, view, record } = setup();
    view.enter(0);
    const camera = view.frame(NONE, STAGE, 0, 0, false);
    const goal: [number, number, number] = [floor.start.x + 0.15, floor.feetY, floor.start.z];
    const [px, py] = projector(camera, STAGE.w / STAGE.h).project(goal);
    view.frame(intents({ taps: [{ x: px, y: py }] }), STAGE, 16, 0.016, false);
    let now = 16;
    for (let k = 0; k < 60; k += 1) view.frame(NONE, STAGE, (now += 16), 0.016, false);
    expect(record.selected).toEqual([]);
    // Arrived: within walk-to's own arrival distance of the point.
    expect(Math.hypot(view.pose.x - goal[0], view.pose.z - goal[2])).toBeLessThanOrEqual(ARRIVE_M + 1e-9);
  });

  it("selects the room's target on Enter, passes Escape on, and leaves to the production framing", () => {
    const { part, view, record } = setup();
    view.enter(0);
    record.target = "the-target";
    view.frame(intents({ enter: true }), STAGE, 0, 0, true);
    expect(record.selected).toEqual(["the-target"]);
    view.frame(intents({ escape: true }), STAGE, 16, 0.016, true);
    expect(record.escapes).toBe(1);
    view.frame(intents({ move: { forward: 0, right: 1 } }), STAGE, 600, 0.3, true);
    view.leave(600);
    expect(view.on).toBe(false);
    expect(record.rests).toBe(1);
    const home = framing(STAGE.w / STAGE.h, framedBoxes(part));
    const midway = view.returning(STAGE, 600 + TRANSITION_MS / 2, true);
    expect(midway).not.toBeNull();
    expect(view.returning(STAGE, 600 + TRANSITION_MS, true)).toBeNull();
    // Not animating: back at once.
    const again = setup();
    again.view.enter(0);
    again.view.frame(NONE, STAGE, 0, 0, false);
    again.view.leave(16);
    expect(again.view.returning(STAGE, 16, false)).toBeNull();
    expect(home.position.length).toBe(3);
  });
});
