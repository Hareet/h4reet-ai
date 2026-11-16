// The live faces in 3D (spec 004; FR-005, FR-017, FR-031, FR-054, FR-059, FR-061; R-27, R-37): a quad for each face
// the index binds, under its placement's node, placed from the catalog's face (its centre, size, normal, and up, at
// the piece's stylized scale) with a polygon offset, so it draws over a stand-in and a studio model alike, whose own
// face objects the loader hides (R-28). Each quad's texture is a canvas the face's display list is drawn on
// (faces/raster.ts), sized by faceCanvasSize for the device's pixel ratio and the quality level, with no mipmaps.
// - A face with no words now stays plain: its quad hidden, so the stand-in's screen or slate shows (FR-009, FR-061);
//   the laptop's screen, which the scene binds to nothing, has no quad at all (FR-031).
// - A face waits for its typeface until the typeface loader gives it a family: the typeface, or after 2 seconds its
//   fallback, and it is drawn again when the typeface arrives (faces/fonts.ts).
// - The screens type once, from the first frame after their words come, redrawn at the quality level's typing rate,
//   and hold. While the room doesn't animate (reduced motion, paused, or hidden; the motion store) or at quality 3,
//   whose rate is 0, a screen shows its final frame, and never types again (FR-059; R-35).
// - Spec 029 (FR-019; plan.md §R-C3): once typed, a screen with a blinking cursor is drawn again only when the cursor's
//   phase changes, its phases counted from the first frame it blinks in, while the room animates and the level types;
//   otherwise its cursor is held, shown, in its final frame, and it isn't drawn again (WCAG 2.2's 2.2.2: the pause stops
//   it).
// - The neon sign's counters are drawn again at once on each new state of the cost channel (setCost), whatever the
//   motion store says: a pause stops only the glow's motion (FR-060).
import {
  CanvasTexture,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Material, Object3D } from "three";

import type { Clock } from "../clock";
import type { RoomIndex, RoomScene } from "../compose/bundle";
import { typefaceFor } from "../compose/legibility";
import type { DisplayList } from "../faces/display-list";
import type { TypefaceLoader } from "../faces/fonts";
import { faceCanvasSize, rasterize } from "../faces/raster";
import { faceLayout, faceList } from "../faces/words";
import type { FaceIndex, FaceSources, IndexFace, RoomText } from "../faces/words";
import type { CostState } from "../signals/turn-cost";
import type { MotionView } from "../stage";
import { qualitySettings } from "./levels";

/** How far a quad stands off its face, along its normal, in metres at scale 1, beside its polygon offset. */
const LIFT = 0.0005;

/** Spec 016 (FR-036, FR-037; plan.md R-12): a face drawn into its avatar's own mesh, its canvas and texture. */
export interface FaceSurface {
  readonly face: IndexFace;
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  /** The mesh's name in the avatar's instance: the face's role. */
  readonly role: string;
}

export interface FaceQuads {
  /** Each bound face's quad, by face ID, named `face:<id>`. */
  readonly quads: ReadonlyMap<string, Mesh>;
  /** Spec 016: each face drawn into an avatar's own mesh, by face ID. */
  readonly surfaces: ReadonlyMap<string, FaceSurface>;
  /** The display list each face drew last, by face ID; none for a face drawn plain. */
  readonly lists: ReadonlyMap<string, DisplayList>;
  /** The room text, once room-data.json has loaded: the faces it words are drawn, and the screens begin to type. */
  setText(text: RoomText | null): void;
  /** The cost channel's state: the counters are drawn again at once, paused or not (FR-048, FR-060). */
  setCost(state: CostState): void;
  /** The quality level: its canvas size and typing rate. */
  setLevel(level: number): void;
  /** A frame of the room: the screens' typing moves on. */
  frame(now: number): void;
  dispose(): void;
}

export interface FaceQuadOptions {
  readonly part: Pick<RoomScene, "pieces" | "placements">;
  readonly index: FaceIndex & Pick<RoomIndex, "faces">;
  /** buildRoom's placement nodes. */
  readonly placements: ReadonlyMap<string, Object3D>;
  readonly doc: Document;
  readonly clock: Clock;
  /** The device's pixel ratio. */
  readonly dpr: number;
  /** The quality level at the start. */
  readonly level: number;
  /** Whether the room animates now: read on every frame (FR-059, FR-060). */
  readonly motion: () => Pick<MotionView, "animate">;
  /** The typefaces' loader; without one, each face draws at once in its typeface and fallback. */
  readonly typefaces?: TypefaceLoader;
}

interface FaceState {
  readonly face: IndexFace;
  readonly quad: Mesh;
  readonly canvas: HTMLCanvasElement;
  /** Its canvas's texture: a new one whenever the canvas changes size (see `size`). */
  texture: CanvasTexture;
  /** When its typing began, on the clock; null before its first frame with words. */
  start: number | null;
  /** Its typing has ended, or was cut to its final frame: it never types again. */
  typed: boolean;
  /** The step of its typing last drawn, so a frame redraws only when the rate moves it on. */
  step: number;
  /** How far into its typing it was last drawn, in milliseconds, so a redraw keeps its place. */
  at: number;
  /** Spec 029: its cursor's blink period once typed, read once its words come (0: no blink); undefined until then. */
  period: number | undefined;
  /** When its cursor began to blink, on the clock; null while it's held. */
  blinkFrom: number | null;
  /** Whether its cursor was drawn shown last. */
  cursorOn: boolean;
}

/** A face canvas's texture: no mipmaps (R-37), filtered linearly, in sRGB. */
function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The face quads for the index's bound faces. */
export function buildFaceQuads(options: FaceQuadOptions): FaceQuads {
  const { part, index, doc } = options;
  let level = options.level;
  let text: RoomText | null = null;
  let cost: CostState | null = null;
  const states = new Map<string, FaceState>();
  const quads = new Map<string, Mesh>();
  const lists = new Map<string, DisplayList>();
  const surfaces = new Map<string, FaceSurface>();

  const sources = (): FaceSources => ({
    index,
    text,
    ...(cost ? { cost } : {}),
    ...(options.typefaces ? { family: (use) => options.typefaces?.family(use) ?? "sans-serif" } : {}),
  });
  /** Whether every typeface the face draws in has a family to draw with yet. */
  const ready = (face: IndexFace): boolean =>
    !options.typefaces ||
    face.regions.every((r) => {
      const use = typefaceFor(r.renderer, r.source);
      return use === null || options.typefaces?.family(use) !== null;
    });

  for (const face of index.faces) {
    const p = part.placements.find((x) => x.id === face.placement);
    const piece = p && Object.hasOwn(part.pieces, p.piece) ? part.pieces[p.piece] : undefined;
    const geometry = piece && Object.hasOwn(piece.faces, face.role) ? piece.faces[face.role] : undefined;
    const node = p && options.placements.get(p.id);
    if (!piece || !geometry || !node || states.has(face.id)) continue;
    // Spec 016 (FR-036, FR-037; plan.md R-12): a face drawn into its avatar's own mesh has a canvas and no quad;
    // dressSurface puts the canvas on the mesh while the twin's own model shows.
    if (face.surface === "model") {
      const canvas = doc.createElement("canvas");
      const texture = canvasTexture(canvas);
      // glTF's texture coordinates run from the image's top-left (the delivered face's (0, 0) is its top-left from the
      // front, K3's test), so the canvas uploads as it is drawn.
      texture.flipY = false;
      surfaces.set(face.id, { face, canvas, texture, role: face.role });
      continue;
    }
    const canvas = doc.createElement("canvas");
    const texture = canvasTexture(canvas);
    const material = new MeshBasicMaterial({
      map: texture,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    const quad = new Mesh(new PlaneGeometry(geometry.size[0], geometry.size[1]), material);
    quad.name = `face:${face.id}`;
    quad.visible = false;
    // The plane's x, y, and normal onto the face's right, up, and facing, at its centre, lifted off it.
    const facing = new Vector3(...geometry.facing).normalize();
    const up = new Vector3(...geometry.up).normalize();
    const right = new Vector3().crossVectors(up, facing).normalize();
    quad.matrixAutoUpdate = true;
    quad.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, up, facing));
    quad.position.set(...geometry.at).addScaledVector(facing, LIFT);
    const holder = new Group();
    holder.name = `faces:${face.id}`;
    holder.scale.setScalar(piece.scale);
    holder.add(quad);
    node.add(holder);
    quads.set(face.id, quad);
    states.set(face.id, {
      face,
      quad,
      canvas,
      texture,
      start: null,
      typed: false,
      step: -1,
      at: 0,
      period: undefined,
      blinkFrom: null,
      cursorOn: true,
    });
  }

  /**
   * Sizes a face's canvas for the device and the level; whether its size changed. three allocates a texture's storage
   * once, at the size it first uploads, and then only updates it, so a canvas resized under its texture would draw
   * into a corner of the old storage, or fail outright: a resized canvas takes a new texture, the old one released, as
   * the stand-ins' labels do (scene.ts; the review of T194, I1).
   */
  const size = (s: FaceState): boolean => {
    const [w, h] = faceCanvasSize(s.face, options.dpr, qualitySettings(level));
    if (s.canvas.width === w && s.canvas.height === h) return false;
    const fresh = s.canvas.width !== 0 || s.canvas.height !== 0;
    s.canvas.width = w;
    s.canvas.height = h;
    if (fresh) {
      const old = s.texture;
      s.texture = canvasTexture(s.canvas);
      const material = s.quad.material as MeshBasicMaterial;
      material.map = s.texture;
      material.needsUpdate = true;
      old.dispose();
    }
    return true;
  };

  /** Draws a face `ms` into its typing, or plain where it has no words or its typeface hasn't a family yet. */
  const draw = (s: FaceState, ms: number): void => {
    const list = ready(s.face) ? faceList(s.face, sources(), ms) : null;
    if (list === null) {
      lists.delete(s.face.id);
      s.quad.visible = false;
      return;
    }
    lists.set(s.face.id, list);
    const ctx = s.canvas.getContext("2d");
    if (ctx) rasterize(ctx, list, s.canvas.width, s.canvas.height);
    s.texture.needsUpdate = true;
    s.quad.visible = true;
  };

  /** A surface face's canvas, sized once for the device at the level it began at, drawn at its final frame, or left
   *  out of `lists` where it has no words now (a release build without the Author's approval), so nothing dresses it. */
  const drawSurface = (s: FaceSurface): void => {
    const list = ready(s.face) ? faceList(s.face, sources()) : null;
    if (list === null) {
      lists.delete(s.face.id);
      return;
    }
    if (s.canvas.width === 0) {
      const [w, h] = faceCanvasSize(s.face, options.dpr, qualitySettings(level));
      s.canvas.width = w;
      s.canvas.height = h;
    }
    lists.set(s.face.id, list);
    const ctx = s.canvas.getContext("2d");
    if (ctx) rasterize(ctx, list, s.canvas.width, s.canvas.height);
    s.texture.needsUpdate = true;
  };

  /** Draws every face as it stands now: its final frame once typed, else where its typing has reached. */
  const redraw = (): void => {
    for (const s of states.values()) {
      draw(s, s.typed ? Infinity : s.at);
      // The final frame shows a blinking cursor; its period is read again, from the words drawn now.
      s.cursorOn = true;
      s.period = undefined;
    }
    for (const s of surfaces.values()) drawSurface(s);
  };

  /** Spec 029: a typed face's blinking cursor at `now`: drawn again only when its phase changes, held shown while the
   *  room is still or the level types nothing. */
  const blink = (s: FaceState, now: number): void => {
    if (s.period === undefined) {
      const layout = ready(s.face) ? faceLayout(s.face, sources()) : null;
      if (layout === null) return;
      s.period = layout.blinkMs ?? 0;
    }
    const period = s.period;
    if (period <= 0) return;
    if (!options.motion().animate || qualitySettings(level).typingFps <= 0) {
      s.blinkFrom = null;
      if (!s.cursorOn) {
        s.cursorOn = true;
        draw(s, Infinity);
      }
      return;
    }
    s.blinkFrom ??= now;
    const on = Math.floor((now - s.blinkFrom) / period) % 2 === 0;
    if (on === s.cursorOn) return;
    s.cursorOn = on;
    // The renderer counts the phases from the typing's end: an "off" frame is one period past it.
    const typingMs = faceLayout(s.face, sources())?.typingMs ?? 0;
    draw(s, on ? Infinity : typingMs + period);
  };

  /** Moves a face's typing on to `now`, ending it at once while the room is still or the level types nothing. */
  const type = (s: FaceState, now: number): void => {
    if (s.typed) return;
    const layout = ready(s.face) ? faceLayout(s.face, sources()) : null;
    if (layout === null) return;
    const rate = qualitySettings(level).typingFps;
    if (layout.typingMs <= 0 || rate <= 0 || !options.motion().animate) {
      s.typed = true;
      draw(s, Infinity);
      return;
    }
    s.start ??= now;
    const ms = now - s.start;
    if (ms >= layout.typingMs) {
      s.typed = true;
      draw(s, Infinity);
      return;
    }
    const step = Math.floor((ms * rate) / 1000);
    if (step === s.step) return;
    s.step = step;
    s.at = (step * 1000) / rate;
    draw(s, s.at);
  };

  for (const s of states.values()) size(s);
  redraw();
  const unwatch = options.typefaces?.onChange(redraw);

  return {
    quads,
    surfaces,
    lists,
    setText(next) {
      text = next;
      redraw();
    },
    setCost(next) {
      cost = next;
      // Only the counters read it: each is drawn again, at its final frame, which is its only one.
      for (const s of states.values())
        if (s.face.regions.some((r) => "signal" in r.source)) draw(s, s.typed ? Infinity : s.at);
    },
    setLevel(next) {
      if (next === level) return;
      level = next;
      for (const s of states.values()) if (size(s) || qualitySettings(level).typingFps <= 0) s.step = -1;
      redraw();
    },
    frame(now) {
      for (const s of states.values()) {
        type(s, now);
        if (s.typed) blink(s, now);
      }
    },
    dispose() {
      unwatch?.();
      for (const s of surfaces.values()) s.texture.dispose();
      for (const s of states.values()) {
        s.texture.dispose();
        (s.quad.material as MeshBasicMaterial).dispose();
        s.quad.geometry.dispose();
      }
    },
  };
}

/**
 * Spec 016 (FR-036, FR-037, FR-041; plan.md R-12, K4): a surface face drawn into an avatar instance's own mesh of the
 * face's role: its material cloned, the face's canvas as its map, an alpha cut-off of 0.5, opaque, marked as a face's
 * surface, and its ink lines off, which the look's Ink.prepare leaves as it is. False, and nothing changed, where the
 * instance has no such mesh (the stand-in or the capsule) or the face has no words now (FR-038).
 */
export function dressSurface(
  faces: Pick<FaceQuads, "surfaces" | "lists">,
  faceId: string,
  instance: Object3D,
): boolean {
  const surface = faces.surfaces.get(faceId);
  if (!surface || !faces.lists.has(faceId)) return false;
  const mesh = instance.getObjectByName(surface.role) as Mesh | undefined;
  if (!mesh?.isMesh) return false;
  const source = mesh.material as Material | Material[];
  if (Array.isArray(source)) return false;
  if (source.userData.h4FaceSurface === true) return true;
  const material = source.clone() as Material & { map?: CanvasTexture | null; alphaTest: number };
  material.map = surface.texture;
  material.alphaTest = 0.5;
  material.transparent = false;
  material.userData = { ...material.userData, h4FaceSurface: true, outlineParameters: { visible: false } };
  material.needsUpdate = true;
  mesh.material = material;
  return true;
}
