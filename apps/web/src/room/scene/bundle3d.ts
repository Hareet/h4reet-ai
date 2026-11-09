// The 3D part's interpreter (spec 004; FR-003, FR-005, FR-008, FR-057; R-11, R-17, R-18, R-27; contracts/room-bundle.md
// §3.2): the room's object tree, built from `virtual:room-scene`'s default export with no renderer, so it runs in Node
// as spec 002's buildWorkArea did. Each placement is one node, mounted under its parent's by the kernel's transform
// (compose/mount.ts, the function the compositor's checks use), so its world matrix is mount.ts's World(p) and moving a
// parent carries everything on it (FR-003). A node holds its picture in its piece's frame at the piece's stylized
// scale, Model(p): its stand-in from the catalog's shapes (standins.ts, in look.ts's materials), which a set model
// swaps out and a failed load brings back (R-28, FR-057). A stand-in's label, the UI word `standin.label` with its
// label word filled, floats where its frame box leaves room, only while the placement has no set model. The figures
// are found by role: the twin's picture is its stand-in until spec 003's avatars; the visitor's is the chosen avatar's
// flat cut-out (src/choice/avatars.ts), at its own size, as the 2D room draws it. The hand-off and its paper stay code,
// their two anchors the scene's `handoff` (FR-008); the visitor's is where the first avatar holds the paper, and the
// chosen avatar's own hand, spec 002's placement from its size, is offset from it (handoff.ts). Each switch case is
// its own group, at its pose's mount, holding the switch piece's stand-in and the cable's tube (scene/cables.ts); only
// not-live's case, by the claims rule, shows until the tier applies another (the face quads and glow cards come with
// T185). The camera frames
// the framed placements' boxes with compose/framing.ts, never loaded geometry, so a model arriving or failing moves
// nothing (R-18), and the pointer picks from the same boxes through compose/pick.ts, as the compositor's spacing check
// (RG6) measures them: each selectable's members projected at the camera's framing into the stage's CSS pixels,
// recomputed whenever the stage's size changes (R-20).
//
// The 3D part holds a label's key and a switch's poses, so the index gives the words and the cases (plan.md §10). A
// part that isn't the index's (its digest differs) or doesn't build whole (a mount, an anchor, or a figure that
// doesn't resolve) is refused with an error, and the room falls to 2D as for a chunk that fails to load.
import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  Shape as Polygon,
  ShapeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { BufferGeometry, Material, PerspectiveCamera, Sprite, Texture } from "three";

import { AVATAR_SHAPES } from "../../choice/avatars";
import type { AvatarId } from "../../choice/avatars";
import type { Box, RoomIndex, RoomScene } from "../compose/bundle";
import { LABEL_HEIGHT, framing } from "../compose/framing";
import { IDENTITY, add, invert, origin, transformDirection, transformPoint } from "../compose/math";
import type { Mat4, Turn, Vec3 } from "../compose/math";
import { anchorWorld, mountWorld, resolveMounts } from "../compose/mount";
import { listOnly, memberRect, pick, pickAreas } from "../compose/pick";
import type { PickArea } from "../compose/pick";
import { toStage } from "../compose/project";
import type { Camera } from "../compose/project";
import { reservedBoxes } from "../compose/hud";
import type { Stage } from "../compose/stages";
import { VISITOR_TURN, handOffset, sideOf, visitorTurnShare } from "../handoff";
import type { Side } from "../handoff";
import type { Ndc } from "../objects";
import { uiWord } from "../ui-keys";
import type { UiKey } from "../ui-keys";
import { buildCases } from "./cables";
import type { SwitchCases } from "./cables";
import { lookLights, lookMaterials } from "./look";
import type { Materials } from "./look";
import { standin } from "./standins";

/** Spec 002's backdrop, beyond the room's shell. */
const BACKDROP = "#20252b";
/** The paper the twin hands over, an A4 sheet in metres; its arc's height over the hand-off; and how far the twin turns
 *  toward the visitor, in radians: spec 002's. */
const SHEET: readonly [number, number] = [0.21, 0.297];
const PAPER_ARC = 0.35;
const TWIN_TURN = 0.45;
const STANDIN_LABEL: UiKey = "standin.label";

/** Makes a label node from its words; spec 002's createLabels gives one that draws them on a sprite. */
export type LabelFactory = (text: string) => Object3D;

export interface RoomOptions {
  /** The visitor's chosen avatar: its flat cut-out is the visitor's picture. */
  readonly avatar: AvatarId;
  readonly label: LabelFactory;
  /** The index composed with the part: its digest, which the part's must equal; its UI words, for the labels; and its
   *  switches' cases. */
  readonly index: Pick<RoomIndex, "digest" | "ui" | "switches">;
}

export interface Room3D {
  readonly scene: Scene;
  /** Each placement's node at mount.ts's World(p), mounted under its parent's, the shell's in the scene; in the part's
   *  order. */
  readonly placements: ReadonlyMap<string, Object3D>;
  /** What each placement shows, in its node at Model(p): its piece's stand-in (named `standin`), or for the visitor
   *  the chosen avatar's cut-out (named `cutout`), at its own size. */
  readonly pictures: ReadonlyMap<string, Group>;
  /** The stand-ins' labels, by placement: only where the placement has no set model and the index has its words. */
  readonly labels: ReadonlyMap<string, Object3D>;
  /** Each switch's cases, by switch and pose: a group at the pose's mount holding the piece's stand-in and its cable's
   *  tube, only the case caseFor gives not-live shown until the tier applies another (cases.groups). */
  readonly switches: ReadonlyMap<string, ReadonlyMap<string, Group>>;
  /** The switches' cases, their tubes, and their glows, and the tier's `apply` (scene/cables.ts). */
  readonly cases: SwitchCases;
  /** The figures' pictures, found by role: the twin's turns toward the visitor in the hand-off. */
  readonly twin: Group;
  readonly visitor: Group;
  /** The hand-off's two anchors in the world, from the part's `handoff`: the twin's hand, and the chosen avatar's, the
   *  visitor's anchor moved by the avatar's hand from the first avatar's. */
  readonly anchors: { readonly twinHand: Vector3; readonly visitorHand: Vector3 };
  /** Which way each figure turns in the hand-off, toward the other, as a sign about +Y: the twin toward the visitor's
   *  hand, the visitor toward the twin's, each from where the other's hand lies in its own frame. */
  readonly facing: { readonly twin: Side; readonly visitor: Side };
  /** The paper: the sheet that travels from the twin's hand (or fades there), and its two materials. */
  readonly paper: {
    readonly sheet: Mesh;
    readonly atTwin: MeshBasicMaterial;
    readonly atVisitor: MeshBasicMaterial;
    /** The sheet at the visitor's hand, the one the figure keeps once the hand-off has ended (spec 008, R-12); spec
     *  009's avatars put it in the holding hand (scene/avatars.ts). */
    readonly kept: Mesh;
  };
  /** The look's materials, which the stand-ins share. */
  readonly materials: Materials;
}

/** A stand-in's label: the UI word `standin.label` with its `{name}` filled by the placement's label word; null when
 *  the index lacks either word. */
export function standinLabel(ui: Readonly<Record<string, string>>, key: string): string | null {
  const name = Object.hasOwn(ui, key) ? ui[key] : undefined;
  // The same words the 2D room draws (flat.ts), through the one function that fills a UI word's slots.
  return name === undefined ? null : uiWord(ui, STANDIN_LABEL, { name });
}

/** Puts an object at a rigid transform of the kernel's: its position and its rotation, at scale 1. */
function place(object: Object3D, m: Mat4): void {
  object.matrix.fromArray(m);
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  object.scale.set(1, 1, 1);
}

/** The boxes' union, or a metre around the origin for none. */
function union(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
  const axis = (k: 0 | 1 | 2, end: "min" | "max", f: (...v: number[]) => number): number =>
    f(...boxes.map((b) => b[end][k]));
  return {
    min: [axis(0, "min", Math.min), axis(1, "min", Math.min), axis(2, "min", Math.min)],
    max: [axis(0, "max", Math.max), axis(1, "max", Math.max), axis(2, "max", Math.max)],
  };
}

/** The visitor's picture: the avatar's flat shape in metres, x centred and y up from its feet, one mesh a polygon. */
function cutout(avatar: AvatarId, materials: Materials): Group {
  const shape = AVATAR_SHAPES[avatar];
  const group = new Group();
  group.name = "cutout";
  const material = materials.of(shape.color, true, DoubleSide);
  for (const polygon of shape.polygons) {
    const mesh = new Mesh(new ShapeGeometry(new Polygon(polygon.map(([x, y]) => new Vector2(x, y)))), material);
    mesh.castShadow = materials.shaded;
    group.add(mesh);
  }
  return group;
}

/** The room's object tree from the 3D part, with no renderer. */
export function buildRoom(part: RoomScene, options: RoomOptions): Room3D {
  // Only the index's own part: one composed with other data would draw a room the 2D room and the list don't hold.
  if (part.digest !== options.index.digest) throw new Error("buildRoom: the 3D part's digest isn't the index's");
  const piece = (id: string): RoomScene["pieces"][string] | undefined =>
    Object.hasOwn(part.pieces, id) ? part.pieces[id] : undefined;
  // A repeated ID is RI2's; the first placement with it is the one built, as mount.ts resolves it.
  const byId = new Map<string, RoomScene["placements"][number]>();
  for (const p of part.placements) if (!byId.has(p.id)) byId.set(p.id, p);
  const { world, unresolved } = resolveMounts([...byId.values()], part.pieces);
  if (unresolved.length > 0) throw new Error("buildRoom: a placement of the 3D part doesn't resolve");

  const materials = lookMaterials(part.look);
  const scene = new Scene();
  scene.background = new Color(BACKDROP);
  const placements = new Map<string, Object3D>();
  for (const p of byId.values()) {
    const node = new Object3D();
    node.name = p.id;
    placements.set(p.id, node);
  }

  /** Where something mounts on a placement's anchor: the placement's node, and its own transform there. */
  const mount = (on: string, anchor: string, offset: Vec3, turn: Turn): { parent: Object3D; local: Mat4 } => {
    const p = byId.get(on);
    const parent = p && placements.get(p.id);
    const own = p && piece(p.piece);
    const at = own && Object.hasOwn(own.anchors, anchor) ? own.anchors[anchor] : undefined;
    if (!parent || !own || !at) throw new Error("buildRoom: a mount of the 3D part doesn't resolve");
    return { parent, local: mountWorld(IDENTITY, own.scale, at, offset, turn) };
  };
  /** A placement's anchor in the world, moved by an offset in the placement's own frame. */
  const anchorPoint = (ref: { placement: string; anchor: string }, offset: Vec3 = [0, 0, 0]): Vector3 => {
    const p = byId.get(ref.placement);
    const own = p && piece(p.piece);
    const w = p && world.get(p.id);
    const at = own && Object.hasOwn(own.anchors, ref.anchor) ? own.anchors[ref.anchor] : undefined;
    if (!own || !w || !at) throw new Error("buildRoom: an anchor of the hand-off doesn't resolve");
    return new Vector3(...add(origin(anchorWorld(w, own.scale, at)), transformDirection(w, offset)));
  };

  // The tree: the shell in the scene, every other placement under the node it mounts on.
  for (const p of byId.values()) {
    const node = placements.get(p.id) as Object3D;
    if (p.mount === null) {
      scene.add(node);
      continue;
    }
    const { parent, local } = mount(p.mount.on, p.mount.anchor, p.offset, p.turn);
    place(node, local);
    parent.add(node);
  }

  const figures = new Set([part.figures.twin, part.figures.visitor]);
  const pictures = new Map<string, Group>();
  const labels = new Map<string, Object3D>();
  for (const p of byId.values()) {
    const node = placements.get(p.id) as Object3D;
    const own = piece(p.piece) as RoomScene["pieces"][string];
    let picture: Group;
    if (p.id === part.figures.visitor) picture = cutout(options.avatar, materials);
    else {
      picture = standin(own.standin, materials);
      picture.scale.setScalar(own.scale);
    }
    node.add(picture);
    pictures.set(p.id, picture);
    // The label over a stand-in: at its frame box's centre, LABEL_HEIGHT under the top the box was grown to for it.
    const words =
      p.label !== null && p.model === null && !figures.has(p.id) ? standinLabel(options.index.ui, p.label) : null;
    if (words === null) continue;
    const label = options.label(words);
    const [min, max] = [p.frame_box.min, p.frame_box.max];
    const at: Vec3 = [(min[0] + max[0]) / 2, max[1] - LABEL_HEIGHT, (min[2] + max[2]) / 2];
    const back = invert(world.get(p.id) ?? IDENTITY);
    label.position.set(...(back ? transformPoint(back, at) : at));
    node.add(label);
    labels.set(p.id, label);
  }

  // Each switch's cases, their cable tubes, and the glows their poses set (scene/cables.ts), not-live's case shown until
  // the tier applies another.
  const cases = buildCases(part, options.index, { placements, world, materials });

  const [twin, visitor] = [pictures.get(part.figures.twin), pictures.get(part.figures.visitor)];
  if (!twin || !visitor) throw new Error("buildRoom: a figure of the 3D part doesn't resolve");
  // The scene's visitor anchor is the first avatar's hand, on the side the data puts nearer the twin; the chosen
  // avatar's own hand is offset from it, on that side (FR-008).
  const visitorPiece = piece(byId.get(part.handoff.to.placement)?.piece ?? "");
  const handAt =
    visitorPiece && Object.hasOwn(visitorPiece.anchors, part.handoff.to.anchor)
      ? visitorPiece.anchors[part.handoff.to.anchor]
      : undefined;
  if (!handAt) throw new Error("buildRoom: an anchor of the hand-off doesn't resolve");
  const anchors = {
    twinHand: anchorPoint(part.handoff.from),
    visitorHand: anchorPoint(part.handoff.to, handOffset(options.avatar, sideOf(handAt.at[0]))),
  };
  // Each figure turns toward the other's hand: where it lies across the figure, in the figure's own frame.
  const across = (figure: string, point: Vector3): Side => {
    const back = invert(world.get(figure) ?? IDENTITY);
    return sideOf(back ? transformPoint(back, point.toArray())[0] : point.x);
  };
  const facing = {
    twin: across(part.figures.twin, anchors.visitorHand),
    visitor: across(part.figures.visitor, anchors.twinHand),
  };

  // The paper: one sheet that travels from the twin's hand (or fades out there), one that fades in at the visitor's.
  const sheet = new PlaneGeometry(SHEET[0], SHEET[1]);
  const paperMaterial = (opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity, side: DoubleSide });
  const [atTwin, atVisitor] = [paperMaterial(1), paperMaterial(0)];
  const paper = new Mesh(sheet, atTwin);
  paper.position.copy(anchors.twinHand);
  const kept = new Mesh(sheet, atVisitor);
  kept.position.copy(anchors.visitorHand);
  scene.add(paper, kept);

  // The look's lights, over the pieces the shell holds (the shell itself, in a room of one).
  const held = part.placements.filter((p) => p.mount !== null);
  const area = union((held.length > 0 ? held : part.placements).map((p) => p.frame_box));
  const { ambient, key } = lookLights(part.look, area);
  scene.add(ambient, key, key.target);

  return {
    scene,
    placements,
    pictures,
    labels,
    switches: cases.groups,
    cases,
    twin,
    visitor,
    anchors,
    facing,
    paper: { sheet: paper, atTwin, atVisitor, kept },
    materials,
  };
}

/** The nodes under a placement's own node that hold its pictures: its stand-in (standins.ts), its set model (the
 *  loader's MODEL_NODE, which this module doesn't import, so the loader's chunk stays apart), and the visitor's cut-out.
 *  Everything else under the node is mounted on it, or is a label, a switch's case, a face, or a glow. */
const PICTURE_NODES: ReadonlySet<string> = new Set(["standin", "model", "cutout"]);

/**
 * A selectable's members' draws (spec 008, FR-014; plan.md R-07): each mesh that each member's placement draws itself,
 * its stand-in or its set model, shown or not, in member order, and nothing mounted on it: no placement mounted on a
 * member that isn't one (the neon sign on its monitor), no switch's case mounted on one (the charger's plug on the
 * laptop), and no label, face, or glow. The lookdev page's vignette reads a placement much the same way, but keeps its
 * switch cases, which a highlight mustn't.
 */
export function memberDraws(room: Room3D, members: readonly string[]): Mesh[] {
  const out: Mesh[] = [];
  for (const id of new Set(members)) {
    for (const child of room.placements.get(id)?.children ?? []) {
      if (!PICTURE_NODES.has(child.name)) continue;
      child.traverse((node) => {
        if ((node as Mesh).isMesh) out.push(node as Mesh);
      });
    }
  }
  return out;
}

/** The framed placements' boxes, which the room frames and picks from: never loaded geometry (R-18). */
export function framedBoxes(part: RoomScene): Box[] {
  return part.placements.filter((p) => p.framed).map((p) => p.frame_box);
}

/** Each selectable's pick area on a stage, as the compositor's spacing check (RG6) measures it: its members' frame boxes
 *  projected at the camera's framing into the stage's CSS pixels (a box with a corner behind the camera gives none),
 *  their union, and the exclusive core centred on it, in the index's order, the scene's. */
export function pickAreasOn(
  part: RoomScene,
  index: Pick<RoomIndex, "selectables">,
  camera: Camera,
  stage: Stage,
): PickArea[] {
  const boxes = new Map<string, Box>();
  for (const p of part.placements) if (!boxes.has(p.id)) boxes.set(p.id, p.frame_box);
  return pickAreas(
    index.selectables.map((s) => ({
      id: s.id,
      members: s.members.flatMap((m) => {
        const box = boxes.get(m);
        const rect = box && memberRect(box, camera, stage);
        return rect ? [rect] : [];
      }),
    })),
  );
}

/** The pointer's picker on the 3D stage (R-20). */
export interface SelectablePicker {
  /** The stage's size in CSS pixels: the areas are recomputed at the camera's framing for it whenever it changes. */
  resize(stage: Stage): void;
  /** The selectable under a point of the view, in normalized device coordinates, or null; none before a size. */
  readonly pick: (ndc: Ndc) => string | null;
  /** The walking view's follow camera on a stage, the areas recomputed there (spec 008, FR-035); null, the production
   *  framing's again. */
  setCamera(camera: Camera | null, stage: Stage): void;
}

/** Picks the index's selectables from the part's frame boxes, framed as frameCamera frames them (compose/pick.ts). At
 *  each stage size it holds the side-wall selectables FR-064's carve-out leaves to the list there (see listOnly). */
export function selectablePicker(part: RoomScene, index: Pick<RoomIndex, "selectables">): SelectablePicker {
  const boxes = framedBoxes(part);
  const sideWall = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
  let stage: Stage | null = null;
  let areas: readonly PickArea[] = [];
  let held: ReadonlySet<string> = new Set();
  /** The follow camera the walking view set, or none: the production framing's. */
  let following: Camera | null = null;
  const measure = (next: Stage): void => {
    stage = { w: next.w, h: next.h };
    const camera = following ?? framing(next.w / next.h, boxes);
    areas = next.w > 0 && next.h > 0 ? pickAreasOn(part, index, camera, stage) : [];
    // The walking control's box reserved, as RG6 reserves it: a side-wall selectable whose core lies under it is held
    // here exactly where the compositor's report lists it (spec 008, FR-021; plan.md §2); and at the follow camera,
    // where the control still stands, the carve-out applied there (FR-035).
    held = listOnly(areas, [0, 0, next.w, next.h], sideWall, reservedBoxes(next));
  };
  return {
    resize(next) {
      if (stage !== null && next.w === stage.w && next.h === stage.h) return;
      measure(next);
    },
    setCamera(camera, next) {
      following = camera;
      measure(next);
    },
    pick: (ndc) => (stage === null ? null : pick(areas, toStage([ndc.x, ndc.y, 0], stage), held)),
  };
}

/** Places the camera for a stage of this aspect with the kernel's framing over the boxes, and gives that framing. */
export function frameCamera(camera: PerspectiveCamera, aspect: number, boxes: readonly Box[]): Camera {
  const spec = framing(aspect, boxes);
  camera.fov = spec.fov;
  camera.aspect = aspect;
  camera.near = spec.near;
  camera.far = spec.far;
  camera.up.set(0, 1, 0);
  camera.position.set(...spec.position);
  camera.lookAt(...spec.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return spec;
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The hand-off at a progress, 0 to 1 (spec 002's, FR-008): the twin turns toward the visitor and the paper travels in
 * an arc from its hand to the visitor's, who turns toward the twin to take it and back (handoff.ts's VISITOR_TURN and
 * visitorTurnShare), each toward the side the other stands on; under reduced motion nothing moves, and the paper
 * crossfades from one hand to the other.
 */
export function showHandoff(room: Room3D, progress: number, reducedMotion: boolean): void {
  const p = Math.min(1, Math.max(0, progress));
  const { twinHand, visitorHand } = room.anchors;
  const { sheet, atTwin, atVisitor } = room.paper;
  if (reducedMotion) {
    sheet.position.copy(twinHand);
    atTwin.opacity = 1 - p;
    atVisitor.opacity = p;
    room.twin.rotation.y = 0;
    room.visitor.rotation.y = 0;
    return;
  }
  const e = easeInOut(p);
  sheet.position.lerpVectors(twinHand, visitorHand, e);
  sheet.position.y += Math.sin(Math.PI * e) * PAPER_ARC;
  atTwin.opacity = 1;
  atVisitor.opacity = 0;
  room.twin.rotation.y = room.facing.twin * TWIN_TURN * Math.min(1, p / 0.3) * Math.min(1, (1 - p) / 0.2);
  room.visitor.rotation.y = room.facing.visitor * VISITOR_TURN * visitorTurnShare(p);
}

/** The kept paper into the visitor's picture, its world transform kept, so it walks and mirrors with the figure and
 *  comes back with it (spec 008, FR-034; R-12): once the hand-off has ended, before the walking view first moves the
 *  figure. Nothing the second time. */
export function keepPaper(room: Room3D): void {
  const { kept } = room.paper;
  // Anywhere in the picture already, the avatar's holding hand too (spec 009, R-09), it stays where it is.
  for (let at = kept.parent; at; at = at.parent) if (at === room.visitor) return;
  room.scene.updateMatrixWorld(true);
  room.visitor.attach(kept);
}

/** Releases what the room made: every mesh's geometry, every material and its textures (the ramp, a label's), and the
 *  look's materials. A sprite's geometry is three.js's own, shared by every sprite, so it stays. */
export function disposeRoom(room: Room3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  room.scene.traverse((node) => {
    const drawn = node as Partial<Mesh> & Partial<Sprite>;
    if (drawn.isMesh && drawn.geometry) geometries.add(drawn.geometry);
    for (const material of ([] as Material[]).concat((drawn.material as Material | Material[] | undefined) ?? [])) {
      materials.add(material);
      const maps = material as Partial<{ map: Texture | null; gradientMap: Texture | null }>;
      for (const texture of [maps.map, maps.gradientMap]) if (texture) textures.add(texture);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  room.materials.dispose();
}
