// The walking view's orchestrator (spec 008; FR-022 to FR-035, FR-049; plan.md §3.6): owns the figure's pose, the
// follow camera's orbit, the walk-to, and reach while walking, over the pure kernel (compose/floor.ts, walk/movement.ts,
// walk/camera.ts, walk/reach.ts, compose/project.ts's ray) and the figure driver (scene/figure.ts). Each frame it reads
// the input's intents and:
// - leaves on Escape, through the room (`escape`);
// - turns, tilts, and zooms the orbit, held to the limits and the region, never farther than the production framing;
// - steps the figure by the held keys, relative to the camera's yaw, a key ending a walk-to; or goes on with the walk-to;
// - takes each tap: the pick at the follow camera first (a selection), else the floor point under it (a walk-to), else
//   nothing; and Enter selects the room's target;
// - follows: the camera from the production framing into the follow camera over at most 500 ms, or at once while the
//   motion store doesn't animate;
// - names reach to the room at entry and whenever the figure moves or turns, only when it changes (FR-033, FR-049);
// - moves the picker's camera only when the camera has moved since the last frame (FR-035, FR-049);
// - and drives the figure.
// Leaving rests the figure at once and brings the camera back to the production framing, as entering took it out.
import { framing } from "../compose/framing";
import type { Box } from "../compose/framing";
import type { RoomScene } from "../compose/bundle";
import { floorPoint } from "../compose/floor";
import type { WalkableFloor } from "../compose/floor";
import { ray } from "../compose/project";
import type { Camera } from "../compose/project";
import type { Stage } from "../compose/stages";
import type { Ndc } from "../objects";
import { blendCamera, cameraLimits, cameraRegion, clampOrbit, farthest, focusOf, followCamera } from "../walk/camera";
import type { Orbit } from "../walk/camera";
import type { WalkIntents } from "../walk/input";
import { startPose, step, walkTo } from "../walk/movement";
import type { Pose, WalkTo } from "../walk/movement";
import { reach } from "../walk/reach";
import type { ReachTarget } from "../walk/reach";
import type { FigureDriver } from "./figure";

/** How much a zoom step brings the camera in, as a share of its distance. */
export const ZOOM_STEP = 0.1;

export interface WalkingOptions {
  readonly floor: WalkableFloor;
  /** The scene's walking data, resolved. */
  readonly data: RoomScene["walking"];
  /** The framed placements' boxes: the production framing's. */
  readonly boxes: readonly Box[];
  /** Each selectable's members' floor-plane rectangles, for reach. */
  readonly targets: readonly ReachTarget[];
  readonly figure: FigureDriver;
  /** Picks at the camera last set, on the stage; setCamera recomputes its areas there. */
  readonly picker: { setCamera(camera: Camera, stage: Stage): void; pick(ndc: Ndc): string | null };
  /** Reach's naming, to the room's target store: a selectable's ID, or none. */
  reach(id: string | null): void;
  /** The one selection: a tap on a piece, or Enter on the room's target. */
  select(id: string): void;
  /** The room's target now, which Enter selects. */
  target(): string | null;
  /** Escape, pressed in the walking view: the room leaves it. */
  escape(): void;
}

export interface WalkingView {
  /** Whether the walking view is on. */
  readonly on: boolean;
  /** The figure's pose now. */
  readonly pose: Pose;
  /** Starts the walking view at the production framing, the figure at its place, at `now` in milliseconds. */
  enter(now: number): void;
  /** A frame while on: the intents since the last, the stage, the time, the frame's seconds, and whether the motion
   *  store animates; gives the camera to draw with. */
  frame(intents: WalkIntents, stage: Stage, now: number, dt: number, animate: boolean): Camera;
  /** Leaves it: the figure at its place at once, the camera on its way back from `now`. */
  leave(now: number): void;
  /** While not walking, the camera on its way back to the production framing, or null once it's there. */
  returning(stage: Stage, now: number, animate: boolean): Camera | null;
}

const same = (a: Camera | null, b: Camera): boolean =>
  a !== null &&
  a.fov === b.fov &&
  a.position.every((v, k) => v === b.position[k]) &&
  a.target.every((v, k) => v === b.target[k]);

export function createWalking(options: WalkingOptions): WalkingView {
  const { floor, data, boxes, targets, figure, picker } = options;
  const limits = cameraLimits(data);
  const region = cameraRegion(floor);
  const reachOptions = { reach: data.reach_m, cone: (data.reach_cone_deg * Math.PI) / 180, radius: data.radius_m };
  let on = false;
  let pose: Pose = startPose(floor);
  let orbit: Orbit = { yaw: 0, pitch: limits.pitchMax, distance: Infinity };
  let walk: WalkTo | null = null;
  let since = 0;
  let reached: string | null | undefined;
  let picked: Camera | null = null;
  /** The camera the last frame drew with, where the return starts from, and when it started. */
  let shown: Camera | null = null;
  let back: { from: Camera; at: number } | null = null;

  const production = (stage: Stage): Camera => framing(stage.w / stage.h, boxes);

  const nameReach = (): void => {
    const id = reach(pose, targets, reachOptions);
    if (id === reached) return;
    reached = id;
    options.reach(id);
  };

  return {
    get on() {
      return on;
    },
    get pose() {
      return pose;
    },
    enter(now) {
      if (on) return;
      on = true;
      pose = startPose(floor);
      orbit = { yaw: 0, pitch: limits.pitchMax, distance: Infinity };
      walk = null;
      since = now;
      reached = undefined;
      picked = null;
      back = null;
      nameReach();
    },
    frame(intents, stage, now, dt, animate) {
      if (!on) return production(stage);
      if (intents.escape) options.escape();
      const base = production(stage);
      // The orbit: turned, tilted, and zoomed, then held to the limits and the region about the figure's focus.
      const focus = focusOf(pose, limits, floor);
      const far = farthest(base, focus);
      orbit = clampOrbit(
        {
          yaw: orbit.yaw + intents.turn,
          pitch: orbit.pitch + intents.tilt,
          distance: Math.min(orbit.distance, far) * (1 - ZOOM_STEP * intents.zoom),
        },
        focus,
        limits,
        region,
        far,
      );
      // The figure: the held keys, which end a walk-to, or the walk-to going on.
      const before = pose;
      const moving = intents.move.forward !== 0 || intents.move.right !== 0;
      if (moving) {
        walk = null;
        pose = step(floor, pose, intents.move, orbit.yaw, dt, data.speed_mps);
      } else if (walk) {
        const next = walkTo(floor, pose, walk, dt, data.speed_mps);
        pose = next.pose;
        walk = next.walk;
      } else pose = { ...pose, speed: 0, walking: false };
      // The camera: following the figure, from the production framing at entry.
      const follow = followCamera(focusOf(pose, limits, floor), orbit, base);
      const camera = blendCamera(base, follow, now - since, animate);
      // The picker at this camera, only when it moved: then the taps, the pick first, else the floor.
      if (!same(picked, camera)) {
        picker.setCamera(camera, stage);
        picked = camera;
      }
      for (const tap of intents.taps) {
        const id = picker.pick(tap);
        if (id !== null) {
          options.select(id);
          continue;
        }
        const point = floorPoint(floor, ray(camera, stage.w / stage.h, [tap.x, tap.y]));
        if (point) walk = { goal: { x: point[0], z: point[1] }, best: Infinity, since: 0 };
      }
      if (intents.enter) {
        const id = options.target();
        if (id !== null) options.select(id);
      }
      // Reach, only when the figure moved or turned.
      if (pose.x !== before.x || pose.z !== before.z || pose.heading !== before.heading) nameReach();
      figure.frame({ pose, camera: camera.position, animate });
      shown = camera;
      return camera;
    },
    leave(now) {
      if (!on) return;
      on = false;
      walk = null;
      figure.rest();
      pose = startPose(floor);
      back = shown ? { from: shown, at: now } : null;
      shown = null;
    },
    returning(stage, now, animate) {
      if (on || !back) return null;
      const home = production(stage);
      const camera = blendCamera(back.from, home, now - back.at, animate);
      if (camera === home) {
        back = null;
        return null;
      }
      return camera;
    },
  };
}
