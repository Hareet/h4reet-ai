// An avatar in a figure (spec 009; FR-002, FR-003, FR-008, FR-011, FR-015 to FR-018, FR-025 to FR-027; plan.md R-04 to
// R-09, R-17): the room's two figures' controllers, which take the avatars' parsed files from the room's loader
// (loader.ts's loadFigures) and show them in the figures' pictures. Imported with the loader, only when the 3D part
// bundles an avatar, so three's animation mixer and skeleton clone stay out of the 3D chunk until then.
// - The picture (R-04): an avatar instance goes into its figure's existing picture group, buildRoom's (the visitor's
//   cut-out group, the twin's stand-in group), named `avatar`, and the fallback's meshes hide; so the hand-off's turns,
//   which rotate those groups, turn it too, and a failure or a reset shows the fallback again with nothing to rebuild.
//   It shows only once ready, its model and its idle each loaded or failed, so it never shows its rest pose for a frame
//   unless its idle failed (FR-022).
// - Placement and scale (R-05): its origin at the group's, the placement's, at the figure's feet; its height measured
//   once from its rest pose with Box3's precise bounds, which skin the vertices; scaled uniformly to its target, the
//   visitor's the chosen avatar's height in the room's table (AVATAR_SHAPES), the twin's its catalog height
//   (`figures.twin_height`); lifted so its lowest point is on the floor; facing glTF's +z, as the fallback does. A
//   model in centimetres scales with its clips; a height that isn't a finite number above 1 cm refuses the model, a
//   failed parse, so the fallback stays.
// - Two instances (R-06): SkeletonUtils' clone gives each figure its own bones and skinned meshes, sharing geometry,
//   materials, and textures, so the texture memory is counted once at run time; each has its own mixer.
// - Clips (R-07, R-17): an action per role; the idle and "idle-holding" loop, "take" plays once and holds its last frame;
//   a change crossfades over CROSSFADE_S while the motion store animates and cuts otherwise; while it doesn't, nothing
//   advances, so entry shows the clip's first frame and a pause the frame it had; at quality 1 or more only the twin's
//   mixer advances. A clip whose tracks name a bone the model lacks counts as failed (FR-003); three sanitizes node names
//   on load, a model's and a clip's alike, so `mixamorig:Hips` binds as `mixamorigHips`.
// - The holding hand (R-08): of ADR 0010's two hand bones, the one "idle-holding"'s first frame moves farther from
//   where the idle's first frame holds it, the right on a tie; with no "idle-holding", the hand nearer the other
//   figure's hand anchor; with neither bone, none, and the paper stays at the anchor (FR-018).
// - The kept paper (R-09): once the hand-off has ended and the visitor's avatar shows with a holding hand, the kept
//   sheet goes into that hand with Object3D.attach, keeping its world transform, then lifted so the hand holds its
//   lower edge, and moves with it; a reset puts it back at the visitor's anchor.
// - Signals: each picture's and clip's change, for the frame log; the stage adds each failed file (avatar_failed).
// Phase 1's timing (D4): the loader parses after the hand-off, so the avatars swap in when it ends.
import { AnimationMixer, Box3, LoopOnce, LoopRepeat, PropertyBinding, Vector3 } from "three";
import type { AnimationAction, AnimationClip, Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { AVATAR_SHAPES } from "../../choice/avatars";
import type { AvatarId, ClipRole } from "../../choice/avatars";
import type { RoomScene } from "../compose/bundle";
import type { FigureId, FigureSignal, FigureWhy } from "../stage";
import type { Room3D } from "./bundle3d";
import { disposeModel } from "./loader";

/** The name an avatar instance takes in its figure's picture group. */
export const AVATAR_NODE = "avatar";
/** A change of clip's crossfade while the motion store animates, in seconds: at most 0.25 (FR-025). */
export const CROSSFADE_S = 0.25;
/** Half the A4 sheet's height: the kept paper's centre over the holding hand, so the hand holds its lower edge (R-09);
 *  a constant lookdev judges (L1). */
export const PAPER_LIFT = 0.297 / 2;
/** The least height a model may measure, in metres before its scale; less is a failed parse (R-05). */
const MIN_HEIGHT = 0.01;
/** ADR 0010's hand bones, as three's loader names them. */
const HANDS = {
  right: PropertyBinding.sanitizeNodeName("mixamorig:RightHand"),
  left: PropertyBinding.sanitizeNodeName("mixamorig:LeftHand"),
} as const;
/** Two hands' movements this close are a tie, which the right hand takes. */
const TIE = 1e-6;

export interface AvatarFiguresOptions {
  /** The visitor's chosen avatar. */
  readonly chosen: AvatarId;
  /** Where each figure's picture and clip changes go: the stage's outcomes and the frame log. */
  readonly signal?: (signal: FigureSignal) => void;
}

export interface AvatarFigures {
  /** The avatar each figure shows once ready: the visitor's chosen avatar and the twin's stand-in, each where the 3D
   *  part bundles its model; null for a figure that keeps its fallback. */
  readonly wants: Readonly<Record<FigureId, AvatarId | null>>;
  /** An avatar's parsed model, readied as the room's: each figure that wants it takes its own instance. False where it
   *  can't be placed (a degenerate height), which the loader takes as a failed parse. */
  model(avatar: AvatarId, model: Object3D): boolean;
  /** A clip file's animations, its first the role's clip. */
  clip(avatar: AvatarId, role: ClipRole, clips: readonly AnimationClip[]): void;
  /** A figure file's load ended without it: its model (role null) or a clip failed after its retry, or was skipped. */
  missed(avatar: AvatarId, role: ClipRole | null, why: "failed" | "skipped"): void;
  /** Whether a figure shows its avatar. */
  shows(figure: FigureId): boolean;
  /** The figure's holding hand's bone, or null. */
  handOf(figure: FigureId): Object3D | null;
  /** The clip role a figure plays now, or null (its fallback, or its rest pose). */
  playing(figure: FigureId): ClipRole | null;
  /** Each frame: advances each shown figure's mixer by `dtMs` while `animate`, at quality 1 or more only the twin's. */
  update(dtMs: number, animate: boolean, level: number): void;
  /** The hand-off has ended: the visitor's avatar holds the kept paper from now on, and plays "idle-holding". */
  handoffEnded(): void;
  /** Every figure back to its fallback and every avatar's resources released, as a restored context's reload starts
   *  again; the figures want what they wanted. */
  reset(): void;
  /** Releases everything; nothing more is taken or shown. */
  dispose(): void;
}

/** What one avatar's files have given so far, shared by the figures that show it. */
interface Source {
  model: Object3D | null;
  /** The model has failed for good. */
  failed: boolean;
  readonly clips: Map<ClipRole, AnimationClip>;
  /** The roles whose loads have ended, loaded or not. */
  readonly ended: Set<ClipRole>;
}

interface Figure {
  readonly id: FigureId;
  readonly group: Object3D;
  readonly wants: AvatarId | null;
  readonly target: number;
  instance: Object3D | null;
  mixer: AnimationMixer | null;
  readonly actions: Map<ClipRole, AnimationAction>;
  playing: ClipRole | null;
  hand: Object3D | null;
  shown: boolean;
  /** The fallback's meshes' visibility before the avatar hid them. */
  hidden: Map<Object3D, boolean>;
}

/** Whether every track of a clip names a node the instance has. */
function binds(instance: Object3D, clip: AnimationClip): boolean {
  return clip.tracks.every((track) => {
    const { nodeName } = PropertyBinding.parseTrackName(track.name);
    return nodeName !== undefined && PropertyBinding.findNode(instance, nodeName) !== undefined;
  });
}

const worldOf = (node: Object3D): Vector3 => new Vector3().setFromMatrixPosition(node.matrixWorld);

export function createAvatarFigures(
  room: Room3D,
  part: Pick<RoomScene, "figures" | "avatars">,
  options: AvatarFiguresOptions,
): AvatarFigures {
  const signal = options.signal ?? ((): void => undefined);
  const bundled = (id: AvatarId | null): AvatarId | null => (id !== null && part.avatars[id] ? id : null);
  /** The hand-off's two anchors as buildRoom placed them: the paper's fallback places. */
  const anchors = { twin: room.anchors.twinHand.clone(), visitor: room.anchors.visitorHand.clone() };
  const figures: Record<FigureId, Figure> = {
    twin: {
      id: "twin",
      group: room.twin,
      wants: bundled(part.figures.stand_in),
      target: part.figures.twin_height,
      instance: null,
      mixer: null,
      actions: new Map(),
      playing: null,
      hand: null,
      shown: false,
      hidden: new Map(),
    },
    visitor: {
      id: "visitor",
      group: room.visitor,
      wants: bundled(options.chosen),
      target: AVATAR_SHAPES[options.chosen].height,
      instance: null,
      mixer: null,
      actions: new Map(),
      playing: null,
      hand: null,
      shown: false,
      hidden: new Map(),
    },
  };
  const sources = new Map<AvatarId, Source>();
  const sourceOf = (id: AvatarId): Source => {
    let s = sources.get(id);
    if (!s) {
      s = { model: null, failed: false, clips: new Map(), ended: new Set() };
      sources.set(id, s);
    }
    return s;
  };
  const both = (): Figure[] => [figures.twin, figures.visitor];
  let animate = false;
  let held = false;
  let disposed = false;

  const picture = (f: Figure, shows: "avatar" | "fallback", why: FigureWhy | null): void =>
    signal({ kind: "picture", figure: f.id, shows, why });
  for (const f of both()) if (f.wants === null) picture(f, "fallback", "no-file");

  /** The roles an avatar's part bundles. */
  const roles = (id: AvatarId): ClipRole[] => Object.keys(part.avatars[id]?.clips ?? {}) as ClipRole[];

  /** An instance of the source model, placed in its figure's frame, or null for a degenerate height. */
  function instanceFor(f: Figure, model: Object3D): Object3D | null {
    const instance = cloneSkinned(model);
    instance.name = AVATAR_NODE;
    instance.position.set(0, 0, 0);
    instance.quaternion.identity();
    instance.scale.set(1, 1, 1);
    instance.updateMatrixWorld(true);
    const box = new Box3().setFromObject(instance, true);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || !(height > MIN_HEIGHT) || !Number.isFinite(box.min.y)) return null;
    // The group's own scale (a figure piece's stylized scale) is undone, so the target is in metres.
    const s = f.target / height / (f.group.scale.y || 1);
    instance.scale.setScalar(s);
    instance.position.set(0, -box.min.y * s, 0);
    return instance;
  }

  /** The world positions of the hand bones in the instance's pose under one clip's first frame (none: the rest pose),
   *  sampled on a mixer of its own, which restores the pose it found when its action stops. */
  function handsAt(f: Figure, clip: AnimationClip | null): { right: Vector3 | null; left: Vector3 | null } {
    const instance = f.instance as Object3D;
    const sampler = new AnimationMixer(instance);
    if (clip) sampler.clipAction(clip).play();
    sampler.update(0);
    // The figure's placement and group above, then the bones: world positions, as a frame would draw them.
    instance.updateWorldMatrix(true, true);
    const at = (name: string): Vector3 | null => {
      const bone = instance.getObjectByName(name);
      return bone ? worldOf(bone) : null;
    };
    const out = { right: at(HANDS.right), left: at(HANDS.left) };
    sampler.stopAllAction();
    sampler.uncacheRoot(instance);
    instance.updateWorldMatrix(false, true);
    return out;
  }

  /** R-08's holding hand, found with the figure's own clips stopped, then the clip it played started again. */
  function findHand(f: Figure): void {
    const instance = f.instance;
    if (!instance || !f.mixer || f.wants === null) return;
    const source = sourceOf(f.wants);
    const playing = f.playing;
    const time = playing === null ? 0 : (f.actions.get(playing)?.time ?? 0);
    f.mixer.stopAllAction();
    const idle = source.clips.get("idle") ?? null;
    const holding = source.clips.get("idle-holding") ?? null;
    const rest = handsAt(f, idle);
    let hand: "right" | "left" | null;
    if (rest.right === null || rest.left === null) hand = rest.right ? "right" : rest.left ? "left" : null;
    else if (holding) {
      const moved = handsAt(f, holding);
      const right = moved.right ? moved.right.distanceTo(rest.right) : 0;
      const left = moved.left ? moved.left.distanceTo(rest.left) : 0;
      hand = left > right + TIE ? "left" : "right";
    } else {
      const other = f.id === "visitor" ? anchors.twin : anchors.visitor;
      hand = rest.left.distanceTo(other) < rest.right.distanceTo(other) - TIE ? "left" : "right";
    }
    f.hand = hand === null ? null : (instance.getObjectByName(HANDS[hand]) ?? null);
    if (playing !== null) start(f, playing, time);
  }

  /** Starts a role's action from `time`, its pose applied at once. */
  function start(f: Figure, role: ClipRole, time: number): void {
    const action = f.actions.get(role);
    if (!action || !f.mixer) return;
    action.reset();
    action.time = time;
    action.play();
    f.mixer.update(0);
  }

  /** The role a figure plays now: the visitor holding the paper after the hand-off plays "idle-holding", the idle in
   *  its place where it has none; every other time the idle; with no idle, the rest pose. */
  function wanted(f: Figure): ClipRole | null {
    if (f.id === "visitor" && held && f.actions.has("idle-holding")) return "idle-holding";
    return f.actions.has("idle") ? "idle" : null;
  }

  /** Plays the role the figure wants: a crossfade while the motion store animates, a cut otherwise (FR-025, FR-026). */
  function play(f: Figure): void {
    if (!f.shown || !f.mixer) return;
    const role = wanted(f);
    if (role === f.playing) return;
    const from = f.playing === null ? null : (f.actions.get(f.playing) ?? null);
    const to = role === null ? null : (f.actions.get(role) ?? null);
    f.playing = role;
    if (to === null) {
      f.mixer.stopAllAction();
      return;
    }
    to.reset();
    to.play();
    if (from && animate) from.crossFadeTo(to, CROSSFADE_S, false);
    else {
      from?.stop();
      f.mixer.update(0);
    }
    if (role !== null) signal({ kind: "clip", figure: f.id, role });
  }

  /** An action for a role's clip on a figure's instance; the idle and "idle-holding" loop, "take" plays once. */
  function addAction(f: Figure, role: ClipRole, clip: AnimationClip): void {
    if (!f.mixer || f.actions.has(role)) return;
    const action = f.mixer.clipAction(clip);
    if (role === "take") {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    } else action.setLoop(LoopRepeat, Infinity);
    f.actions.set(role, action);
  }

  /** The kept paper into the visitor's holding hand, once the hand-off has ended and the avatar shows (R-09). */
  function keepPaper(): void {
    const f = figures.visitor;
    const { kept, atTwin, atVisitor } = room.paper;
    if (!held || !f.shown || !f.hand) return;
    if (kept.parent === f.hand) return;
    // The sheet the hand-off carried and the kept one both sit at the visitor's hand when it ends: the kept one shows.
    atTwin.opacity = 0;
    atVisitor.opacity = 1;
    f.hand.updateWorldMatrix(true, false);
    f.hand.attach(kept);
    const lifted = worldOf(f.hand).add(new Vector3(0, PAPER_LIFT, 0));
    kept.position.copy(f.hand.worldToLocal(lifted));
  }

  /** The kept paper back at the visitor's anchor, in the scene. */
  function dropPaper(): void {
    const { kept } = room.paper;
    if (kept.parent === room.scene) return;
    room.scene.attach(kept);
    kept.position.copy(anchors.visitor);
    kept.quaternion.identity();
    kept.scale.set(1, 1, 1);
  }

  /** Shows a figure's avatar once it is ready: its model in, and its idle loaded or failed (or none in the part). */
  function tryShow(f: Figure): void {
    if (disposed || f.shown || f.wants === null || !f.instance) return;
    const source = sourceOf(f.wants);
    if (roles(f.wants).includes("idle") && !source.ended.has("idle")) return;
    f.hidden = new Map(f.group.children.map((c) => [c, c.visible] as const));
    for (const child of f.group.children) child.visible = false;
    f.group.add(f.instance);
    f.shown = true;
    picture(f, "avatar", null);
    findHand(f);
    play(f);
    if (f.id === "visitor") keepPaper();
  }

  /** A figure back to its fallback, its instance and mixer gone. */
  function fallBack(f: Figure, why: FigureWhy | null): void {
    if (f.instance) {
      f.mixer?.stopAllAction();
      f.mixer?.uncacheRoot(f.instance);
      f.instance.removeFromParent();
    }
    for (const [child, visible] of f.hidden) child.visible = visible;
    f.hidden = new Map();
    if (f.id === "visitor") dropPaper();
    const was = f.shown;
    Object.assign(f, { instance: null, mixer: null, playing: null, hand: null, shown: false });
    f.actions.clear();
    if (why !== null || was) picture(f, "fallback", why);
  }

  return {
    wants: { twin: figures.twin.wants, visitor: figures.visitor.wants },
    model(avatar, model) {
      if (disposed) return false;
      const wanting = both().filter((f) => f.wants === avatar && !f.instance);
      if (wanting.length === 0) return false;
      const placed = wanting.map((f) => ({ f, instance: instanceFor(f, model) }));
      if (placed.some((p) => p.instance === null)) {
        for (const { f } of placed) picture(f, "fallback", "degenerate");
        return false;
      }
      const source = sourceOf(avatar);
      source.model = model;
      for (const { f, instance } of placed) {
        f.instance = instance;
        f.mixer = new AnimationMixer(instance as Object3D);
        for (const [role, clip] of source.clips) addAction(f, role, clip);
      }
      for (const { f } of placed) tryShow(f);
      return true;
    },
    clip(avatar, role, clips) {
      if (disposed) return;
      const source = sourceOf(avatar);
      const clip = clips[0];
      const instances = both().filter((f) => f.wants === avatar && f.instance);
      // A clip that names a bone its model lacks is a failed clip (FR-003): the idle's leaves the rest pose.
      const usable = clip !== undefined && instances.every((f) => binds(f.instance as Object3D, clip));
      if (usable) source.clips.set(role, clip);
      source.ended.add(role);
      for (const f of both().filter((g) => g.wants === avatar)) {
        if (usable && f.instance) addAction(f, role, clip);
        if (!f.shown) tryShow(f);
        else {
          if (role === "idle" || role === "idle-holding") findHand(f);
          play(f);
          if (f.id === "visitor") keepPaper();
        }
      }
    },
    missed(avatar, role, why) {
      if (disposed) return;
      const source = sourceOf(avatar);
      if (role === null) {
        source.failed = true;
        for (const f of both().filter((g) => g.wants === avatar)) fallBack(f, why);
        return;
      }
      source.ended.add(role);
      for (const f of both().filter((g) => g.wants === avatar)) {
        if (!f.shown) tryShow(f);
        else if (role === "idle-holding") {
          findHand(f);
          if (f.id === "visitor") keepPaper();
        }
      }
    },
    shows: (figure) => figures[figure].shown,
    handOf: (figure) => figures[figure].hand,
    playing: (figure) => figures[figure].playing,
    update(dtMs, now, level) {
      animate = now;
      if (!now) return;
      for (const f of both()) {
        if (!f.shown || !f.mixer) continue;
        if (level >= 1 && f.id !== "twin") continue;
        f.mixer.update(dtMs / 1000);
      }
    },
    handoffEnded() {
      held = true;
      play(figures.visitor);
      keepPaper();
    },
    reset() {
      for (const f of both()) fallBack(f, null);
      for (const source of sources.values()) if (source.model) disposeModel(source.model);
      sources.clear();
    },
    dispose() {
      this.reset();
      disposed = true;
    },
  };
}
