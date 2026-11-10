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
//   where the idle's first frame holds it, a hand's motion summing its hand bone's and every bone's under it, its
//   fingers, so a clip that only closes a hand's fingers on the sheet moves that hand (the Author's answer of
//   2026-11-09, "Count the fingers"); the right on a tie; with no "idle-holding", the hand nearer the other figure's
//   hand anchor; with neither bone, none, and the paper stays at the anchor (FR-018).
// - The kept paper (R-09): once the hand-off has ended and the visitor's avatar shows with a holding hand, the kept
//   sheet goes into that hand with Object3D.attach, keeping its world transform, then lifted so the hand holds its
//   lower edge, and moves with it; a reset puts it back at the visitor's anchor.
// - Signals: each picture's and clip's change, for the frame log; the stage adds each failed file (avatar_failed).
// - The hand-off between them (Phase 2; FR-019, FR-020; R-10): before it, the twin's avatar holds the paper in
//   "idle-holding", the sheet in its holding hand; at its start (the stage's first showHandoff) the sheet's start is
//   that hand's place, and the twin plays its idle; during it, the sheet's end follows the visitor's holding hand, and
//   the visitor plays "take" so that it ends as the hand-off ends; at its end, "idle-holding" and the kept paper. An
//   avatar that becomes ready during it waits for its end to show. Under reduced motion the hand-off's crossfade
//   stays, "take" doesn't play, and the clips change by cuts at the start and the end. `settled` resolves once both
//   figures show their avatars or keep their fallbacks for good: what the room waits for, at most wait_ms.
// - Spec 012 (its FR-021; Amendment L11): close() is the room's loader giving way, which the 3D stage passes on; from
//   then, before the hand-off's first frame too, an avatar that becomes ready waits for the hand-off's end to show, as
//   one ready during it does (FR-022).
import { AnimationMixer, Box3, LoopOnce, LoopRepeat, PropertyBinding, Quaternion, Vector3 } from "three";
import type { AnimationAction, AnimationClip, Bone, Euler, Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { AVATAR_SHAPES } from "../../choice/avatars";
import type { AvatarId, ClipRole } from "../../choice/avatars";
import type { RoomScene } from "../compose/bundle";
import { handoffDuration } from "../handoff";
import type { FigureId, FigureSignal, FigureWhy } from "../stage";
import { showHandoff as drawHandoff } from "./bundle3d";
import type { Room3D } from "./bundle3d";
import type { FigureDriver } from "./figure";
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
  /** A figure file's load ended without it: its model (role null) or a clip failed after its retry, or was skipped,
   *  below the floor, or as the room went to 2D. */
  missed(avatar: AvatarId, role: ClipRole | null, why: "failed" | "skipped" | "floor" | "2d"): void;
  /** Whether a figure shows its avatar. */
  shows(figure: FigureId): boolean;
  /** The figure's holding hand's bone, or null. */
  handOf(figure: FigureId): Object3D | null;
  /** The clip role a figure plays now, or null (its fallback, or its rest pose). */
  playing(figure: FigureId): ClipRole | null;
  /** Each frame: advances each shown figure's mixer by `dtMs` while `animate`, at quality 1 or more only the twin's. */
  update(dtMs: number, animate: boolean, level: number): void;
  /** Draws the hand-off at its progress, 0 to 1, of `durationMs` (spec 002's by default), with the avatars' hands as
   *  its ends where they show, through bundle3d.ts's showHandoff; its first call is the hand-off's start (R-10). */
  showHandoff(progress: number, reducedMotion: boolean, durationMs?: number): void;
  /** The hand-off has ended: the visitor's avatar holds the kept paper from now on, and plays "idle-holding"; an avatar
   *  that became ready during it shows now. */
  handoffEnded(): void;
  /** Spec 012: the room's loader has given way; an avatar that becomes ready from now until the hand-off ends shows
   *  only once it ends. One already shown stays. */
  close(): void;
  /** Resolves once both figures show their avatars or keep their fallbacks for good (R-10): the room's wait. */
  readonly settled: Promise<void>;
  /** Walking's driver for the visitor's avatar (FR-028; R-16), which figure.ts's figureDriverFor uses while the
   *  visitor's avatar shows: the figure at the pose's place, the avatar turned to its heading, never mirrored, no bob,
   *  "walk" while it walks where it has the clip and its slide otherwise; rest() puts back what its first frame found. */
  readonly driver: FigureDriver;
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
  /** It keeps its fallback for good: its model failed, or it has none to show. */
  gone: boolean;
  /** The fallback's meshes, its picture group's children when the controller began, before anything else joined it
   *  (walking's kept paper, an avatar): what an avatar hides, and nothing else. */
  readonly fallback: readonly Object3D[];
  /** The fallback's meshes' visibility before the avatar hid them. */
  hidden: Map<Object3D, boolean>;
}

/** Whether every track of a clip names a node the instance has. PropertyBinding.findNode returns null for a name it
 *  doesn't find, so both null and undefined are a miss. */
function binds(instance: Object3D, clip: AnimationClip): boolean {
  return clip.tracks.every((track) => {
    const { nodeName } = PropertyBinding.parseTrackName(track.name);
    if (nodeName === undefined) return false;
    const node = PropertyBinding.findNode(instance, nodeName) as Object3D | null | undefined;
    return node !== null && node !== undefined;
  });
}

const worldOf = (node: Object3D): Vector3 => new Vector3().setFromMatrixPosition(node.matrixWorld);

/** One hand in one pose (R-08): its hand bone's world position, and the hand bone's and every bone's under it, in the
 *  tree's order, so two poses of one instance list the same bones alike. Bones alone (`isBone`): the kept sheet, which
 *  the holding hand carries once the hand-off ends, is no bone, so a later "idle-holding" never counts it. */
interface HandPose {
  readonly at: Vector3;
  readonly bones: readonly Vector3[];
}

/** How far a hand moves from one pose to another: its hand bone and every bone under it, its fingers, each by its
 *  world position, summed; a hand the other pose lacks moves nothing (FR-018, as the Author amended it on 2026-11-09,
 *  "Count the fingers": a holding clip that only closes a hand's fingers moves that hand). */
function handMotion(from: HandPose, to: HandPose | null): number {
  if (to === null) return 0;
  let sum = 0;
  from.bones.forEach((p, i) => {
    const q = to.bones[i];
    if (q) sum += p.distanceTo(q);
  });
  return sum;
}

/** Whether `node` is `root` or lies under it. */
function within(node: Object3D, root: Object3D | null): boolean {
  for (let at: Object3D | null = node; at; at = at.parent) if (at === root) return true;
  return false;
}

/** A node's turn about +Y in the world. */
function yawOf(node: Object3D | null): number {
  if (!node) return 0;
  node.updateWorldMatrix(true, false);
  const turn = new Quaternion();
  node.matrixWorld.decompose(new Vector3(), turn, new Vector3());
  return 2 * Math.atan2(turn.y, turn.w);
}

export function createAvatarFigures(
  room: Room3D,
  part: Pick<RoomScene, "figures" | "avatars">,
  options: AvatarFiguresOptions,
): AvatarFigures {
  const signal = options.signal ?? ((): void => undefined);
  const bundled = (id: AvatarId | null): AvatarId | null => (id !== null && part.avatars[id] ? id : null);
  /** The hand-off's two anchors as buildRoom placed them: the paper's fallback places. */
  const anchors = { twin: room.anchors.twinHand.clone(), visitor: room.anchors.visitorHand.clone() };
  /** A picture's fallback meshes: its children now, less the kept paper and an avatar, should either be in it. */
  const fallbackOf = (group: Object3D): Object3D[] =>
    group.children.filter((c) => c !== room.paper.kept && c.name !== AVATAR_NODE);
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
      gone: false,
      fallback: fallbackOf(room.twin),
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
      gone: false,
      fallback: fallbackOf(room.visitor),
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
  /** Where the hand-off stands: before its start, during it, or after its end (Phase 1 has only after). */
  let phase: "before" | "during" | "after" = "before";
  /** Spec 012: the room's loader has given way (close()). */
  let closed = false;
  /** The visitor's "take" has started in this hand-off. */
  let taking = false;
  /** The sheet's start: the twin's holding hand's place at the hand-off's start, where it showed its avatar. */
  let sheetFrom: Vector3 | null = null;
  /** The visitor walks now, by walking's last pose to the avatar's driver (FR-028). */
  let walkingNow = false;
  /** Where the kept paper was before the visitor's hand took it: walking's picture, or the scene (R-09). */
  let paperHome: { parent: Object3D; position: Vector3; quaternion: Quaternion; scale: Vector3 } | null = null;
  let disposed = false;
  let settle: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => (settle = resolve));
  /** Resolves `settled` once each figure shows its avatar or keeps its fallback for good. */
  const checkSettled = (): void => {
    if (both().every((f) => f.wants === null || f.shown || f.gone)) settle();
  };

  const picture = (f: Figure, shows: "avatar" | "fallback", why: FigureWhy | null): void =>
    signal({ kind: "picture", figure: f.id, shows, why });
  for (const f of both()) if (f.wants === null) picture(f, "fallback", "no-file");
  checkSettled();

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

  /** Each hand in the instance's pose under one clip's first frame (none: the rest pose), sampled on a mixer of its
   *  own, which restores the pose it found when its action stops: the hand bone's world position, and its own and every
   *  bone's under it, its fingers, in the tree's order; null for a hand the skeleton lacks. */
  function handsAt(f: Figure, clip: AnimationClip | null): { right: HandPose | null; left: HandPose | null } {
    const instance = f.instance as Object3D;
    const sampler = new AnimationMixer(instance);
    if (clip) sampler.clipAction(clip).play();
    sampler.update(0);
    // The figure's placement and group above, then the bones: world positions, as a frame would draw them.
    instance.updateWorldMatrix(true, true);
    const at = (name: string): HandPose | null => {
      const bone = instance.getObjectByName(name);
      if (!bone) return null;
      // The hand bone, then the bones under it alone, as FR-018 says: never the kept sheet or another object it holds.
      const bones: Vector3[] = [];
      bone.traverse((node) => {
        if (node === bone || (node as Partial<Bone>).isBone === true) bones.push(worldOf(node));
      });
      return { at: worldOf(bone), bones };
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
      const right = handMotion(rest.right, moved.right);
      const left = handMotion(rest.left, moved.left);
      hand = left > right + TIE ? "left" : "right";
    } else {
      const other = f.id === "visitor" ? anchors.twin : anchors.visitor;
      hand = rest.left.at.distanceTo(other) < rest.right.at.distanceTo(other) - TIE ? "left" : "right";
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

  /** The role a figure plays now (FR-018, FR-019): the twin holding the paper before the hand-off, and the visitor
   *  after it, play "idle-holding"; the visitor plays "take" once its time in the hand-off has come; every other time
   *  the idle, which also stands in for a missing clip; with no idle, the rest pose. */
  function wanted(f: Figure): ClipRole | null {
    const has = (role: ClipRole): boolean => f.actions.has(role);
    if (f.id === "visitor") {
      // While it walks, its walk where it has one (FR-028); otherwise it slides in what it stands in.
      if (walkingNow && has("walk")) return "walk";
      if (phase === "after" && has("idle-holding")) return "idle-holding";
      if (phase === "during" && taking && has("take")) return "take";
    } else if (phase === "before" && has("idle-holding")) return "idle-holding";
    return has("idle") ? "idle" : null;
  }

  /** Where the paper's centre sits in a figure's holding hand, so the hand holds its lower edge; null where the figure
   *  shows no avatar or its avatar has no hand. */
  function paperAt(f: Figure): Vector3 | null {
    if (!f.shown || !f.hand) return null;
    f.hand.updateWorldMatrix(true, false);
    return worldOf(f.hand).add(new Vector3(0, PAPER_LIFT, 0));
  }

  /** Before the hand-off, the sheet in the twin's holding hand, where it shows its avatar (FR-019 (b)). */
  function holdSheet(): void {
    if (phase !== "before") return;
    const at = paperAt(figures.twin);
    if (!at) return;
    room.anchors.twinHand.copy(at);
    room.paper.sheet.position.copy(at);
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
    if (phase !== "after" || !f.shown || !f.hand) return;
    if (kept.parent === f.hand) return;
    // The sheet the hand-off carried and the kept one both sit at the visitor's hand when it ends: the kept one shows.
    atTwin.opacity = 0;
    atVisitor.opacity = 1;
    if (!within(kept, f.instance)) {
      const parent = kept.parent ?? room.scene;
      paperHome = {
        parent,
        position: kept.position.clone(),
        quaternion: kept.quaternion.clone(),
        scale: kept.scale.clone(),
      };
    }
    f.hand.updateWorldMatrix(true, false);
    f.hand.attach(kept);
    const lifted = worldOf(f.hand).add(new Vector3(0, PAPER_LIFT, 0));
    kept.position.copy(f.hand.worldToLocal(lifted));
  }

  /** The kept paper, wherever the visitor's avatar holds it, back where it was before: in walking's picture as it sat
   *  there, or in the scene at the visitor's anchor. A sheet the avatar doesn't hold stays where it is. */
  function dropPaper(): void {
    const { kept } = room.paper;
    const home = paperHome;
    if (!within(kept, figures.visitor.instance)) return;
    paperHome = null;
    if (home && home.parent !== room.scene) {
      home.parent.add(kept);
      kept.position.copy(home.position);
      kept.quaternion.copy(home.quaternion);
      kept.scale.copy(home.scale);
      return;
    }
    room.scene.add(kept);
    kept.position.copy(anchors.visitor);
    kept.quaternion.identity();
    kept.scale.set(1, 1, 1);
  }

  /** Shows a figure's avatar once it is ready: its model in, and its idle loaded or failed (or none in the part). */
  function tryShow(f: Figure): void {
    // Never during the hand-off, nor from the loader's giving way before it: an avatar ready then swaps in when it ends
    // (FR-019 (e), FR-022; spec 012's FR-021).
    if (disposed || f.shown || f.wants === null || !f.instance || phase === "during") return;
    if (closed && phase === "before") return;
    const source = sourceOf(f.wants);
    if (roles(f.wants).includes("idle") && !source.ended.has("idle")) return;
    f.hidden = new Map(f.fallback.map((c) => [c, c.visible] as const));
    for (const child of f.fallback) child.visible = false;
    f.group.add(f.instance);
    f.shown = true;
    picture(f, "avatar", null);
    findHand(f);
    play(f);
    if (f.id === "visitor") keepPaper();
    else holdSheet();
    checkSettled();
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
    else room.anchors.twinHand.copy(anchors.twin);
    const was = f.shown;
    Object.assign(f, { instance: null, mixer: null, playing: null, hand: null, shown: false, gone: why !== null });
    f.actions.clear();
    if (why !== null || was) picture(f, "fallback", why);
    checkSettled();
  }

  /** Walking's driver for the visitor's avatar (FR-028; R-16): the placement's node at the pose's place, as the cut-out's
   *  driver puts it, and the picture group, which holds the avatar, turned to the heading, at its own scale made
   *  positive and its own height, so nothing mirrors or bobs; its first frame since a rest keeps what it found. */
  const visitorNode = room.placements.get(part.figures.visitor) ?? null;
  let home: { position: Vector3; rotation: Euler; scale: Vector3; lift: number } | null = null;
  const driver: FigureDriver = {
    frame({ pose }) {
      const [node, group] = [visitorNode, room.visitor];
      if (!node) return;
      home ??= {
        position: node.position.clone(),
        rotation: group.rotation.clone(),
        scale: group.scale.clone(),
        lift: group.position.y,
      };
      // The feet at the pose's place, the node's height in the world kept.
      node.updateWorldMatrix(true, false);
      const feet = new Vector3().setFromMatrixPosition(node.matrixWorld);
      feet.set(pose.x, feet.y, pose.z);
      if (node.parent) {
        node.parent.updateWorldMatrix(true, false);
        node.parent.worldToLocal(feet);
      }
      node.position.copy(feet);
      node.updateMatrixWorld(true);
      // The avatar faces +z as glTF has it, and heading 0 faces into the room (−z): its turn in the world is heading + π.
      group.rotation.set(home.rotation.x, pose.heading + Math.PI - yawOf(group.parent), home.rotation.z);
      group.scale.set(Math.abs(home.scale.x), Math.abs(home.scale.y), Math.abs(home.scale.z));
      group.position.y = home.lift;
      group.updateMatrixWorld(true);
      if (pose.walking !== walkingNow) {
        walkingNow = pose.walking;
        play(figures.visitor);
      }
    },
    hold(item) {
      // The kept paper in the avatar's holding hand; with no hand, or anything else, in the picture as the cut-out's.
      if (item === room.paper.kept) keepPaper();
      if (within(item, room.visitor)) return;
      room.scene.updateMatrixWorld(true);
      room.visitor.attach(item);
    },
    rest() {
      if (home && visitorNode) {
        visitorNode.position.copy(home.position);
        room.visitor.rotation.copy(home.rotation);
        room.visitor.scale.copy(home.scale);
        room.visitor.position.y = home.lift;
        visitorNode.updateMatrixWorld(true);
      }
      home = null;
      if (walkingNow) {
        walkingNow = false;
        play(figures.visitor);
      }
    },
  };

  return {
    wants: { twin: figures.twin.wants, visitor: figures.visitor.wants },
    driver,
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
      // A clip parsed before its model is checked now: one that names a bone the model lacks failed (FR-003).
      for (const [role, clip] of [...source.clips])
        if (!placed.every((p) => binds(p.instance as Object3D, clip))) source.clips.delete(role);
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
      if (now)
        for (const f of both()) {
          if (!f.shown || !f.mixer) continue;
          if (level >= 1 && f.id !== "twin") continue;
          f.mixer.update(dtMs / 1000);
        }
      holdSheet();
    },
    showHandoff(progress, reducedMotion, durationMs = handoffDuration("3d", reducedMotion)) {
      if (phase === "before") {
        // The start: the sheet leaves from the twin's hand as it holds it now, and the twin lets go, to its idle.
        sheetFrom = paperAt(figures.twin);
        phase = "during";
        play(figures.twin);
        // A figure whose avatar isn't ready yet keeps its fallback through it (FR-022), and the frame log says why.
        for (const f of both()) if (f.wants !== null && !f.shown && !f.gone) picture(f, "fallback", "late");
      }
      const visitor = figures.visitor;
      const take = visitor.actions.get("take");
      if (phase === "during" && !taking && take && visitor.shown && animate && !reducedMotion) {
        // "take" ends as the hand-off ends (R-10): it starts at max(0, D − its length).
        const length = take.getClip().duration * 1000;
        if (progress * durationMs >= Math.max(0, durationMs - length)) {
          taking = true;
          play(visitor);
        }
      }
      const to = paperAt(visitor);
      room.anchors.twinHand.copy(sheetFrom ?? anchors.twin);
      room.anchors.visitorHand.copy(to ?? anchors.visitor);
      // The kept sheet, which reduced motion fades in, at the visitor's hand while it isn't in it yet.
      if (to && room.paper.kept.parent === room.scene) room.paper.kept.position.copy(to);
      drawHandoff(room, progress, reducedMotion);
    },
    close() {
      closed = true;
    },
    handoffEnded() {
      phase = "after";
      taking = false;
      room.anchors.twinHand.copy(anchors.twin);
      room.anchors.visitorHand.copy(anchors.visitor);
      for (const f of both()) tryShow(f);
      play(figures.visitor);
      play(figures.twin);
      keepPaper();
    },
    settled,
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
