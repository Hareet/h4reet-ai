// The 3D chunk (spec 002, T041; FR-005, FR-047, FR-048; contracts/room-scene.md §2–§4; research.md R-03, R-11): the
// work area in Three.js, from labeled placeholder geometry: the desk with its laptop and screen, the snowboard hanging
// on the left, the bicycle on the right, the small window with artwork above it and its view of a fence and a tree,
// the twin's figure at the desk, and the visitor's chosen avatar as a flat cut-out in front. No photo and no studio
// output: R-11's placeholders, which spec 003's assets replace (Phase 10).
//
// The room imports this file only after the WebGL 2 check (quality.ts), so Three.js is its own chunk, loaded behind
// the choice screen and never on a device without WebGL 2. buildWorkArea, fitCamera, createPicker, and applyHandoff
// need no renderer, so the tests run them in Node; createScene adds the renderer and the frame loop.
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Material, Texture } from "three";

import { AVATAR_SHAPES, avatarById } from "../choice/avatars";
import type { AvatarId } from "../choice/avatars";
import { LABEL_LIFT, LAYOUT, framing } from "./framing";
import type { Box, Vec3 } from "./framing";
import { bindPointerSelection, isObjectId } from "./objects";
import type { ObjectId, Picker } from "./objects";
import type { SceneOptions, Stage3D } from "./stage";

export type PartName =
  "desk" | "laptop" | "screen" | "snowboard" | "bicycle" | "window" | "artwork" | "view" | "twin" | "visitor" | "paper";

/** Makes a label node named `label:<text>`; the page's draws the text on a sprite. */
export type LabelFactory = (text: string) => Object3D;

export interface WorkArea {
  scene: Scene;
  parts: Record<PartName, Object3D>;
  /** The selectable objects: the snowboard, the bicycle, and the laptop and screen together. */
  objects: Map<ObjectId, Object3D>;
  /** Invisible boxes around each object, a little larger than it, that raycasts aim at. */
  hitBoxes: Mesh[];
  /** Where the paper starts and ends, in world space. */
  anchors: { twinHand: Vector3; visitorHand: Vector3 };
  /** The paper's two materials: the one that travels (or fades out), and the one that fades in at the visitor. */
  paper: { atTwin: MeshBasicMaterial; atVisitor: MeshBasicMaterial };
  /** The twin's figure, which turns toward the visitor during the hand-off and sways a little when idle. */
  twin: Object3D;
}

/** A label without a renderer: an empty node with the label's name, for the tests and a page with no 2D canvas. */
const namedLabel: LabelFactory = (text) => {
  const node = new Object3D();
  node.name = `label:${text}`;
  return node;
};

const solid = (color: string): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });

function block(size: Vec3, color: string, at: Vec3): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), solid(color));
  mesh.position.set(...at);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A thin cylinder from a to b. */
function tube(a: Vec3, b: Vec3, color: string, radius = 0.018): Mesh {
  const from = new Vector3(...a);
  const to = new Vector3(...b);
  const length = from.distanceTo(to);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 8), solid(color));
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
  mesh.castShadow = true;
  return mesh;
}

function topOf(box: Box): number {
  return box.center[1] + box.size[1] / 2;
}

function labelAt(label: LabelFactory, text: string, at: Vec3): Object3D {
  const node = label(text);
  node.position.set(...at);
  return node;
}

function desk(): Object3D {
  const [x, , z] = LAYOUT.desk.center;
  const [w, h, d] = LAYOUT.desk.size;
  const g = new Group();
  g.add(block([w, 0.05, d], "#8a6a4a", [x, h - 0.025, z]));
  for (const dx of [-w / 2 + 0.05, w / 2 - 0.05]) {
    for (const dz of [-d / 2 + 0.05, d / 2 - 0.05])
      g.add(block([0.05, h - 0.05, 0.05], "#6e5238", [x + dx, (h - 0.05) / 2, z + dz]));
  }
  return g;
}

function laptop(): Object3D {
  const [x, , z] = LAYOUT.laptop.center;
  const g = new Group();
  g.add(block([0.34, 0.02, 0.24], "#4a4a4a", [x, 0.76, z]));
  const lid = block([0.34, 0.22, 0.012], "#5a5a5a", [x, 0.88, z - 0.12]);
  lid.rotation.x = -0.2;
  g.add(lid);
  return g;
}

function screen(): Object3D {
  const [x, , z] = LAYOUT.screen.center;
  const g = new Group();
  g.add(block([0.22, 0.015, 0.14], "#3a3a3a", [x, 0.758, z]));
  g.add(block([0.05, 0.14, 0.05], "#3a3a3a", [x, 0.83, z]));
  g.add(block([0.62, 0.38, 0.04], "#1f1f1f", [x, 1.09, z]));
  const panel = new Mesh(new PlaneGeometry(0.56, 0.32), new MeshBasicMaterial({ color: "#2d4f6e" }));
  panel.position.set(x, 1.09, z + 0.021);
  g.add(panel);
  return g;
}

function snowboard(): Object3D {
  const [x, y, z] = LAYOUT.snowboard.center;
  const g = new Group();
  const board = new Mesh(new CapsuleGeometry(0.15, 1.25, 6, 16), solid("#2f6db5"));
  board.scale.z = 0.1;
  board.position.set(x, y, z);
  board.castShadow = true;
  g.add(board);
  for (const dy of [-0.3, 0.3]) g.add(block([0.24, 0.07, 0.03], "#1a1a1a", [x, y + dy, z + 0.02]));
  return g;
}

function bicycle(): Object3D {
  const [x, y, z] = LAYOUT.bicycle.center;
  const hub = y - 0.07;
  const g = new Group();
  for (const dx of [-0.3, 0.3]) {
    const wheel = new Mesh(new TorusGeometry(0.3, 0.025, 8, 32), solid("#2b2b2b"));
    wheel.position.set(x + dx, hub, z);
    wheel.castShadow = true;
    g.add(wheel);
  }
  const rear: Vec3 = [x - 0.3, hub, z];
  const front: Vec3 = [x + 0.3, hub, z];
  const bracket: Vec3 = [x - 0.03, hub, z];
  const seat: Vec3 = [x - 0.13, hub + 0.33, z];
  const head: Vec3 = [x + 0.23, hub + 0.33, z];
  for (const [a, b] of [
    [rear, bracket],
    [rear, seat],
    [bracket, seat],
    [seat, head],
    [bracket, head],
    [head, front],
  ] as const) {
    g.add(tube(a, b, "#b03a2e"));
  }
  g.add(block([0.14, 0.03, 0.06], "#1a1a1a", [x - 0.15, hub + 0.37, z]));
  g.add(tube([x + 0.2, hub + 0.4, z - 0.05], [x + 0.2, hub + 0.4, z + 0.05], "#1a1a1a"));
  return g;
}

function windowFrame(): Object3D {
  const [x, y, z] = LAYOUT.window.center;
  const [w, h] = LAYOUT.window.size;
  const g = new Group();
  g.add(block([w, 0.05, 0.06], "#5b4a3a", [x, y + h / 2 - 0.025, z]));
  g.add(block([w, 0.05, 0.06], "#5b4a3a", [x, y - h / 2 + 0.025, z]));
  g.add(block([0.05, h, 0.06], "#5b4a3a", [x - w / 2 + 0.025, y, z]));
  g.add(block([0.05, h, 0.06], "#5b4a3a", [x + w / 2 - 0.025, y, z]));
  return g;
}

/** What the window looks out on: a neighbour's fence and a tree, nothing that could locate anyone (W8). */
function view(): Object3D {
  const [x, y, z] = LAYOUT.window.center;
  const [w, h] = LAYOUT.window.size;
  const flat = (color: string): MeshBasicMaterial => new MeshBasicMaterial({ color });
  const g = new Group();
  const sky = new Mesh(new PlaneGeometry(w - 0.1, h - 0.1), flat("#cfe6f5"));
  sky.position.set(x, y, z - 0.02);
  g.add(sky);
  for (let i = 0; i < 9; i += 1) {
    const slat = new Mesh(new PlaneGeometry(0.05, 0.22), flat("#a07a4f"));
    slat.position.set(x - 0.36 + i * 0.09, y - 0.16, z - 0.01);
    g.add(slat);
  }
  const trunk = new Mesh(new PlaneGeometry(0.05, 0.25), flat("#6b4a2b"));
  trunk.position.set(x + 0.15, y - 0.02, z - 0.012);
  const canopy = new Mesh(new CircleGeometry(0.14, 20), flat("#4f7d3a"));
  canopy.position.set(x + 0.15, y + 0.15, z - 0.011);
  g.add(trunk, canopy);
  return g;
}

function artwork(): Object3D {
  const [x, y, z] = LAYOUT.artwork.center;
  const [w, h] = LAYOUT.artwork.size;
  const g = new Group();
  g.add(block([w, h, 0.03], "#5b4a3a", [x, y, z]));
  const canvas = new Mesh(new PlaneGeometry(w - 0.06, h - 0.06), new MeshBasicMaterial({ color: "#f3d27a" }));
  canvas.position.set(x, y, z + 0.016);
  const sun = new Mesh(new CircleGeometry(0.07, 20), new MeshBasicMaterial({ color: "#c4553b" }));
  sun.position.set(x - 0.12, y + 0.02, z + 0.017);
  const hill = new Mesh(new CircleGeometry(0.12, 3), new MeshBasicMaterial({ color: "#3b6fa5" }));
  hill.position.set(x + 0.12, y - 0.04, z + 0.017);
  g.add(canvas, sun, hill);
  return g;
}

function twinFigure(): Object3D {
  const [x, , z] = LAYOUT.twin.center;
  const g = new Group();
  g.position.set(x, 0, z);
  const body = new Mesh(new CapsuleGeometry(0.2, 0.95, 6, 16), solid("#6c5a8f"));
  body.position.set(0, 0.7, 0);
  const head = new Mesh(new SphereGeometry(0.15, 20, 16), solid("#8a77ad"));
  head.position.set(0, 1.55, 0);
  body.castShadow = true;
  head.castShadow = true;
  g.add(body, head, tube([0.18, 1.25, 0], [0.33, 1.02, 0.15], "#6c5a8f", 0.04));
  return g;
}

function visitorCutout(avatar: AvatarId): Object3D {
  const shape = AVATAR_SHAPES[avatar];
  const [x, , z] = LAYOUT.visitor.center;
  const g = new Group();
  g.position.set(x, 0, z);
  const material = new MeshStandardMaterial({ color: shape.color, roughness: 0.9, side: DoubleSide });
  for (const polygon of shape.polygons) {
    const mesh = new Mesh(new ShapeGeometry(new Shape(polygon.map(([px, py]) => new Vector2(px, py)))), material);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

function tagObject(object: Object3D, id: ObjectId): void {
  object.traverse((node) => {
    node.userData.objectId = id;
  });
}

/** The work area's scene graph, with no renderer: the room's placeholders, each labeled, and the objects' hit boxes. */
export function buildWorkArea(options: { avatar: AvatarId; label?: LabelFactory }): WorkArea {
  const label = options.label ?? namedLabel;
  const scene = new Scene();
  scene.background = new Color("#20252b");

  const wall = new Mesh(new PlaneGeometry(16, 9), solid("#d9d2c5"));
  wall.position.set(0, 4.5, LAYOUT.wallZ);
  wall.receiveShadow = true;
  const floor = new Mesh(new PlaneGeometry(16, 20), solid("#8f7a62"));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 8);
  floor.receiveShadow = true;
  scene.add(wall, floor);

  scene.add(new HemisphereLight("#ffffff", "#8a7a66", 1.2));
  const sun = new DirectionalLight("#ffffff", 1.6);
  sun.position.set(2.5, 4.5, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -1, near: 0.5, far: 15 });
  scene.add(sun);

  const parts: Record<PartName, Object3D> = {
    desk: desk(),
    laptop: laptop(),
    screen: screen(),
    snowboard: snowboard(),
    bicycle: bicycle(),
    window: windowFrame(),
    artwork: artwork(),
    view: view(),
    twin: twinFigure(),
    visitor: visitorCutout(options.avatar),
    paper: new Object3D(),
  };
  const laptopAndScreen = new Group();
  laptopAndScreen.add(parts.laptop, parts.screen);
  const objects = new Map<ObjectId, Object3D>([
    ["snowboard", parts.snowboard],
    ["bicycle", parts.bicycle],
    ["laptop", laptopAndScreen],
  ]);
  scene.add(parts.desk, laptopAndScreen, parts.snowboard, parts.bicycle);
  scene.add(parts.window, parts.view, parts.artwork, parts.twin, parts.visitor);

  // The hit boxes, from each object's geometry before its label joins it.
  scene.updateMatrixWorld(true);
  const hitBoxes = [...objects].map(([id, object]) => {
    tagObject(object, id);
    const box = new Box3().setFromObject(object).expandByScalar(0.06);
    const size = box.getSize(new Vector3());
    const hit = new Mesh(new BoxGeometry(size.x, size.y, Math.max(size.z, 0.12)), new MeshBasicMaterial());
    hit.position.copy(box.getCenter(new Vector3()));
    hit.visible = false;
    hit.userData.objectId = id;
    scene.add(hit);
    return hit;
  });

  // The paper: one that travels from the twin's hand (or fades out there), one that fades in at the visitor.
  const shape = AVATAR_SHAPES[options.avatar];
  const [tx, , tz] = LAYOUT.twin.center;
  const [vx, , vz] = LAYOUT.visitor.center;
  const anchors = {
    twinHand: new Vector3(tx + 0.33, 1.02, tz + 0.2),
    visitorHand: new Vector3(vx - shape.width * 0.35, Math.min(0.95, shape.height * 0.6), vz + 0.06),
  };
  const sheet = new PlaneGeometry(0.21, 0.297);
  const paperMaterial = (opacity: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity, side: DoubleSide });
  const atTwin = paperMaterial(1);
  const atVisitor = paperMaterial(0);
  const paper = new Mesh(sheet, atTwin);
  paper.position.copy(anchors.twinHand);
  const kept = new Mesh(sheet, atVisitor);
  kept.position.copy(anchors.visitorHand);
  parts.paper = paper;
  scene.add(paper, kept);

  // The labels, each saying it's a placeholder (R-11).
  const lift = LABEL_LIFT;
  parts.desk.add(labelAt(label, "Desk (placeholder)", [LAYOUT.desk.center[0] + 0.45, topOf(LAYOUT.desk) + 0.05, -1.1]));
  parts.laptop.add(
    labelAt(label, "Laptop (placeholder)", [LAYOUT.laptop.center[0], topOf(LAYOUT.laptop) + lift, -1.3]),
  );
  parts.screen.add(
    labelAt(label, "Screen (placeholder)", [LAYOUT.screen.center[0], topOf(LAYOUT.screen) + lift, -1.6]),
  );
  parts.snowboard.add(labelAt(label, "Snowboard (placeholder)", [-2.3, topOf(LAYOUT.snowboard) + lift, -1.9]));
  parts.bicycle.add(labelAt(label, "Bicycle (placeholder)", [2.25, topOf(LAYOUT.bicycle) + lift, -1.85]));
  parts.window.add(labelAt(label, "Window (placeholder)", [0.25, LAYOUT.window.center[1] + 0.25, -1.9]));
  parts.view.add(labelAt(label, "View: a fence and a tree (placeholder)", [0.95, 1.4, -1.9]));
  parts.artwork.add(labelAt(label, "Artwork (placeholder)", [0.95, topOf(LAYOUT.artwork) + lift, -1.9]));
  parts.twin.add(labelAt(label, "The twin (placeholder)", [0, 1.75 + lift, 0]));
  parts.visitor.add(
    labelAt(label, `You: ${avatarById(options.avatar).name} (placeholder)`, [0, shape.height + lift, 0.05]),
  );

  return { scene, parts, objects, hitBoxes, anchors, paper: { atTwin, atVisitor }, twin: parts.twin };
}

/** Places the camera for a stage of this aspect, so the whole work area is in view (framing.ts). */
export function fitCamera(camera: PerspectiveCamera, aspect: number): void {
  const f = framing(aspect);
  camera.fov = f.fov;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 80;
  camera.position.set(...f.position);
  camera.lookAt(...f.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** The object under a point of the view, by a raycast against the hit boxes. */
export function createPicker(camera: PerspectiveCamera, area: WorkArea): Picker {
  const raycaster = new Raycaster();
  const point = new Vector2();
  return (ndc) => {
    point.set(ndc.x, ndc.y);
    raycaster.setFromCamera(point, camera);
    const id: unknown = raycaster.intersectObjects(area.hitBoxes, false)[0]?.object.userData.objectId;
    return isObjectId(id) ? id : null;
  };
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The hand-off at a progress, 0 to 1: the twin turns toward the visitor and the paper travels in an arc from its hand
 * to the visitor's; under reduced motion nothing moves, and the paper crossfades from one hand to the other.
 */
export function applyHandoff(area: WorkArea, progress: number, reducedMotion: boolean): void {
  const p = Math.min(1, Math.max(0, progress));
  const { twinHand, visitorHand } = area.anchors;
  const paper = area.parts.paper;
  if (reducedMotion) {
    paper.position.copy(twinHand);
    area.paper.atTwin.opacity = 1 - p;
    area.paper.atVisitor.opacity = p;
    area.twin.rotation.y = 0;
    return;
  }
  const e = easeInOut(p);
  paper.position.lerpVectors(twinHand, visitorHand, e);
  paper.position.y += Math.sin(Math.PI * e) * 0.35;
  area.paper.atTwin.opacity = 1;
  area.paper.atVisitor.opacity = 0;
  area.twin.rotation.y = 0.45 * Math.min(1, p / 0.3) * (1 - Math.max(0, (p - 0.8) / 0.2));
}

export interface QualitySettings {
  /** The most device pixels a CSS pixel gets. */
  pixelRatio: number;
  shadows: boolean;
  /** The labels' texture resolution, as a share (the placeholders' only textures). */
  textureScale: number;
  /** The twin's idle sway. */
  animations: boolean;
}

const LEVELS: readonly QualitySettings[] = [
  { pixelRatio: 2, shadows: true, textureScale: 1, animations: true },
  { pixelRatio: 1.25, shadows: true, textureScale: 1, animations: true },
  { pixelRatio: 1, shadows: false, textureScale: 1, animations: true },
  { pixelRatio: 0.75, shadows: false, textureScale: 0.5, animations: false },
];

/** R-04's steps: the pixel ratio first, then shadows, then textures and animations. */
export function qualitySettings(level: number): QualitySettings {
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.round(level)))] as QualitySettings;
}

/** Labels drawn on a 2D canvas and shown as sprites of a fixed size on screen, readable at any camera distance. */
function spriteLabels(doc: Document, scale: () => number): LabelFactory {
  return (text) => {
    const node = namedLabel(text);
    const canvas = doc.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return node;
    const px = Math.round(28 * scale());
    const font = `600 ${px}px system-ui, sans-serif`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + px;
    canvas.height = Math.round(px * 1.5);
    ctx.font = font;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a1a1a";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px / 2, canvas.height / 2);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }));
    const height = 0.045;
    sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
    sprite.renderOrder = 10;
    node.add(sprite);
    return node;
  };
}

function disposeAll(root: Object3D): void {
  const textures = new Set<Texture>();
  root.traverse((node) => {
    const mesh = node as Partial<Mesh> & Partial<Sprite>;
    mesh.geometry?.dispose();
    const materials = ([] as Material[]).concat((mesh.material as Material | Material[] | undefined) ?? []);
    for (const material of materials) {
      const map = (material as Partial<SpriteMaterial>).map;
      if (map) textures.add(map);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

/** The 3D stage: the renderer on its own canvas, the frame loop on the room's clock, and the hand-off's drawing. */
export function createScene(options: SceneOptions): Stage3D {
  const { win, doc, clock } = options;
  const canvas = doc.createElement("canvas");
  canvas.className = "room-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  let settings = qualitySettings(0);
  const area = buildWorkArea({ avatar: options.avatar, label: spriteLabels(doc, () => settings.textureScale) });
  const camera = new PerspectiveCamera();
  fitCamera(camera, 16 / 9);
  const unbind = bindPointerSelection(canvas, createPicker(camera, area), options.select);

  let size = { w: 0, h: 0, ratio: 0 };
  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = Math.min(win.devicePixelRatio || 1, settings.pixelRatio);
    if (!w || !h || (w === size.w && h === size.h && ratio === size.ratio)) return;
    size = { w, h, ratio };
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    fitCamera(camera, w / h);
  };

  let disposed = false;
  let frame = 0;
  const loop = (time: number): void => {
    if (disposed) return;
    options.onFrame(time);
    // The controller may have switched the room to 2D, which disposes this stage.
    if (disposed) return;
    resize();
    area.twin.rotation.z = settings.animations && !options.reducedMotion ? Math.sin(time / 900) * 0.015 : 0;
    renderer.render(area.scene, camera);
    frame = clock.requestFrame(loop);
  };
  applyHandoff(area, 0, options.reducedMotion);
  frame = clock.requestFrame(loop);

  return {
    mode: "3d",
    element: canvas,
    canvas,
    showHandoff(progress) {
      applyHandoff(area, progress, options.reducedMotion);
    },
    setQuality(level) {
      const before = settings.shadows;
      settings = qualitySettings(level);
      renderer.shadowMap.enabled = settings.shadows;
      if (before !== settings.shadows) {
        area.scene.traverse((node) => {
          const material = (node as Partial<Mesh>).material;
          for (const m of ([] as Material[]).concat((material as Material | Material[] | undefined) ?? [])) {
            m.needsUpdate = true;
          }
        });
      }
      size = { w: 0, h: 0, ratio: 0 };
    },
    dispose() {
      disposed = true;
      clock.cancelFrame(frame);
      unbind();
      disposeAll(area.scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}
