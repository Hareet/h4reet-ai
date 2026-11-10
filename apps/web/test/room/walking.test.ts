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

function setup(pickAt: (ndc: { x: number; y: number }) => string | null = () => null, onEscape?: () => void) {
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
    escape: () => {
      record.escapes += 1;
      onEscape?.();
    },
  });
  return { part, index, floor, view, record };
}

/** setup's, with an escape that leaves the walking view at once, as the 3D stage's does (scene.ts). */
function setupEscaping() {
  const box: { view: ReturnType<typeof createWalking> | null } = { view: null };
  const made = setup(
    () => null,
    () => box.view?.leave(32),
  );
  box.view = made.view;
  return made;
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
    // Spec 014 (FR-030 to FR-033; W13): the follow camera takes over at the first camera intent, here a hair of tilt.
    const nudge = intents({ tilt: 1e-9 });
    view.frame(nudge, STAGE, 0, 0, true);
    const later = view.frame(NONE, STAGE, TRANSITION_MS, 0.016, true);
    expect(later.target[0]).toBeCloseTo(floor.start.x, 9);
    expect(later.target[2]).toBeCloseTo(floor.start.z, 9);
    // Not animating: at the follow camera at once.
    const { view: other } = setup();
    other.enter(0);
    const cut = other.frame(nudge, STAGE, 0, 0, false);
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

  it("selects the room's target on Enter, and leaves to the production framing, the camera back within 500 ms", () => {
    const { part, view, record } = setup();
    view.enter(0);
    record.target = "the-target";
    // Spec 014 (W13): a hair of tilt hands over, so the camera follows before it leaves.
    view.frame(intents({ enter: true, tilt: 1e-9 }), STAGE, 0, 0, true);
    expect(record.selected).toEqual(["the-target"]);
    const following = view.frame(intents({ move: { forward: 0, right: 1 } }), STAGE, 600, 0.3, true);
    view.leave(600);
    expect(view.on).toBe(false);
    expect(record.rests).toBe(1);
    const home = framing(STAGE.w / STAGE.h, framedBoxes(part));
    const midway = view.returning(STAGE, 600 + TRANSITION_MS / 2, true);
    expect(midway?.position).not.toEqual(home.position);
    expect(midway?.position).not.toEqual(following.position);
    expect(view.returning(STAGE, 600 + TRANSITION_MS, true)).toBeNull();
    // Not animating: back at once.
    const again = setup();
    again.view.enter(0);
    again.view.frame(NONE, STAGE, 0, 0, false);
    again.view.leave(16);
    expect(again.view.returning(STAGE, 16, false)).toBeNull();
  });

  it("stops the frame where Escape leaves: no step, no figure, no picker, and reach named none (FR-022)", () => {
    // The room's Escape leaves the walking view at once, as the 3D stage's does (scene.ts).
    const { view, record } = setupEscaping();
    view.enter(0);
    view.frame(intents({ turn: 0.5 }), STAGE, 16, 0.016, false);
    const [frames, cameras] = [record.frames.length, record.cameras.length];
    const at = view.pose;
    view.frame(intents({ escape: true, move: { forward: 1, right: 0 }, turn: 0.4 }), STAGE, 32, 0.016, false);
    expect([view.on, record.escapes, record.rests]).toEqual([false, 1, 1]);
    // Nothing after the rest: the figure isn't framed again, the pose isn't stepped, the picker isn't moved, and
    // reach's last naming is none.
    expect(record.frames.length).toBe(frames);
    expect(record.cameras.length).toBe(cameras);
    expect([view.pose.x, view.pose.z]).toEqual([at.x, at.z]);
    expect(record.reach.at(-1)).toBeNull();
  });

  it("names reach none on leaving, by any road, and again at the next entry", () => {
    const { view, record } = setup();
    view.enter(0);
    view.frame(NONE, STAGE, 0, 0, false);
    view.leave(16);
    expect(record.reach.at(-1)).toBeNull();
    const count = record.reach.length;
    view.enter(32);
    expect(record.reach.length).toBe(count + 1);
  });

  it("turns the view right on E and left on Q, the camera looking to the right of straight on (FR-029)", () => {
    for (const [turn, sign] of [
      [0.3, 1],
      [-0.3, -1],
    ] as const) {
      const { view } = setup();
      view.enter(0);
      view.frame(NONE, STAGE, 0, 0, false);
      const camera = view.frame(intents({ turn }), STAGE, 16, 0.016, false);
      const forward = camera.target[0] - camera.position[0];
      expect(Math.sign(forward), `a turn of ${turn}`).toBe(sign);
    }
  });

  it("reaches nothing from the figure's place at the data's default reach, 0.3 m", () => {
    const { part, record, view } = setup();
    expect(part.walking.reach_m).toBe(0.3);
    view.enter(0);
    expect(record.reach).toEqual([null]);
  });
});

// T029 (spec 014; FR-030 to FR-037, FR-064; SC-005; plan.md §5, PD-10, PD-11; R-11): the walking view holds the room's
// view from entry. The camera doesn't change through a scripted walk that stays clear, and taps pick and walk-to at the
// room's view; the first turn, tilt, or zoom, or the figure nearing a HUD box or the window's edge, hands over to the
// follow camera, its first frame the room's view, the move within 500 ms, or a cut while the motion store is still;
// leaving from the hold moves nothing; a re-fit while held re-frames; and each hold and hand-over is told, with its cause.
describe("the hold at the room's view (spec 014, T029)", () => {
  function holding(
    edge: (pose: { x: number; z: number }) => boolean = () => false,
    pickAt = (): string | null => null,
  ) {
    const { scene: part, index } = repositoryBundle() as {
      scene: RoomScene;
      index: ReturnType<typeof repositoryBundle>["index"];
    };
    const floor = floorOfPart(part, part.walking.radius_m) as WalkableFloor;
    const record = {
      cameras: [] as Camera[],
      selected: [] as string[],
      held: [] as [string, string | null][],
    };
    const view = createWalking({
      floor,
      data: part.walking,
      boxes: framedBoxes(part),
      targets: reachTargets(part, index),
      figure: { frame: () => undefined, rest: () => undefined },
      picker: { setCamera: (c) => record.cameras.push(c), pick: pickAt },
      reach: () => undefined,
      select: (id) => record.selected.push(id),
      target: () => null,
      escape: () => undefined,
      nearsEdge: (_camera, pose) => edge(pose),
      held: (state, cause) => record.held.push([state, cause]),
    });
    return { part, floor, view, record, home: framing(STAGE.w / STAGE.h, framedBoxes(part)) };
  }
  const sameCamera = (a: Camera, b: Camera): boolean =>
    a.position.every((v, k) => Math.abs(v - (b.position[k] ?? 0)) < 1e-9) &&
    a.target.every((v, k) => Math.abs(v - (b.target[k] ?? 0)) < 1e-9);

  it("enters at the room's view and keeps it, 0 changes, through a walk that stays clear", () => {
    const { view, record, home } = holding();
    view.enter(0);
    let now = 0;
    const first = view.frame(NONE, STAGE, now, 0, true);
    expect(sameCamera(first, home)).toBe(true);
    const start = view.pose;
    let changes = 0;
    let last = first;
    for (let k = 0; k < 60; k += 1) {
      const move = k < 30 ? { forward: 0, right: 1 } : { forward: 1, right: 0 };
      const c = view.frame(intents({ move }), STAGE, (now += 16), 0.016, true);
      if (!sameCamera(c, last)) changes += 1;
      last = c;
    }
    expect(changes).toBe(0);
    expect(sameCamera(last, home)).toBe(true);
    expect(view.pose.x).not.toBe(start.x);
    expect(record.held).toEqual([["hold", null]]);
  });

  for (const [cause, over] of [
    ["turn", { turn: 0.05 }],
    ["tilt", { tilt: 0.05 }],
    ["zoom", { zoom: 1 }],
  ] as const)
    it(`hands over on the first ${cause}, from the room's view, within 500 ms, or at once while still`, () => {
      const { view, record, home, floor } = holding();
      view.enter(0);
      view.frame(NONE, STAGE, 0, 0, true);
      const first = view.frame(intents(over), STAGE, 100, 0.016, true);
      expect(Math.hypot(...first.position.map((v, k) => v - (home.position[k] ?? 0)))).toBeLessThan(0.001);
      const later = view.frame(NONE, STAGE, 100 + TRANSITION_MS, 0.016, true);
      expect(later.target[0]).toBeCloseTo(floor.start.x, 9);
      expect(later.target[2]).toBeCloseTo(floor.start.z, 9);
      expect(record.held).toEqual([
        ["hold", null],
        ["follow", cause],
      ]);
      // Still: a cut to the follow camera on the frame that hands over.
      const still = holding();
      still.view.enter(0);
      still.view.frame(NONE, STAGE, 0, 0, false);
      const cut = still.view.frame(intents(over), STAGE, 100, 0.016, false);
      expect(cut.target[0]).toBeCloseTo(floor.start.x, 9);
    });

  it("hands over when the figure nears a HUD box or the window's edge, never for the keys alone", () => {
    const { view, record, floor } = holding((pose) => pose.x > floor.start.x + 0.2);
    view.enter(0);
    let now = 0;
    view.frame(NONE, STAGE, now, 0, true);
    for (let k = 0; k < 100 && record.held.length < 2; k += 1)
      view.frame(intents({ move: { forward: 0, right: 1 } }), STAGE, (now += 16), 0.016, true);
    expect(record.held).toEqual([
      ["hold", null],
      ["follow", "edge"],
    ]);
  });

  it("doesn't hand over at entry when the figure starts clear (R-11), and picks and walks to at the room's view", () => {
    const { view, record, home } = holding(
      () => false,
      () => "fx-picked",
    );
    view.enter(0);
    const c = view.frame(intents({ taps: [{ x: 0, y: 0 }] }), STAGE, 0, 0, true);
    expect(sameCamera(c, home)).toBe(true);
    expect(record.selected).toEqual(["fx-picked"]);
    expect(record.held).toEqual([["hold", null]]);
    // A tap that picks nothing walks the figure, the camera held.
    const walker = holding();
    walker.view.enter(0);
    walker.view.frame(NONE, STAGE, 0, 0, true);
    const before = walker.view.pose;
    let now = 0;
    // A floor point 0.15 m to the figure's right, under the pointer at the room's view.
    const goal: [number, number, number] = [walker.floor.start.x + 0.15, walker.floor.feetY, walker.floor.start.z];
    const [px, py] = projector(walker.home, STAGE.w / STAGE.h).project(goal);
    walker.view.frame(intents({ taps: [{ x: px, y: py }] }), STAGE, (now += 16), 0.016, true);
    for (let k = 0; k < 120; k += 1) walker.view.frame(NONE, STAGE, (now += 16), 0.016, true);
    expect(Math.hypot(walker.view.pose.x - before.x, walker.view.pose.z - before.z)).toBeGreaterThan(0.1);
    expect(sameCamera(walker.view.frame(NONE, STAGE, now + 16, 0.016, true), walker.home)).toBe(true);
  });

  it("leaves from the hold with nothing moving, and re-frames the held view at a re-fit", () => {
    const { view, part, home } = holding();
    view.enter(0);
    view.frame(NONE, STAGE, 0, 0, true);
    const wider = { w: 1640, h: 1150.3125 };
    const refit = view.frame(NONE, wider, 16, 0.016, true);
    expect(sameCamera(refit, framing(wider.w / wider.h, framedBoxes(part)))).toBe(true);
    view.frame(NONE, STAGE, 32, 0.016, true);
    view.leave(48);
    for (const t of [48, 64, 300, 600]) {
      const back = view.returning(STAGE, t, true);
      if (back) expect(sameCamera(back, home), `at ${t}`).toBe(true);
    }
  });
});
