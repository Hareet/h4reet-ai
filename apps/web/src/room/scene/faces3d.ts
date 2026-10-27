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
import type { Object3D } from "three";

import type { Clock } from "../clock";
import type { RoomIndex, RoomScene } from "../compose/bundle";
import { typefaceFor } from "../compose/legibility";
import type { DisplayList } from "../faces/display-list";
import type { TypefaceLoader } from "../faces/fonts";
import { faceCanvasSize, rasterize } from "../faces/raster";
import { faceLayout, faceList } from "../faces/words";
import type { FaceIndex, FaceSources, IndexFace, RoomText } from "../faces/words";
import type { MotionView } from "../stage";
import { qualitySettings } from "./levels";

/** How far a quad stands off its face, along its normal, in metres at scale 1, beside its polygon offset. */
const LIFT = 0.0005;

export interface FaceQuads {
  /** Each bound face's quad, by face ID, named `face:<id>`. */
  readonly quads: ReadonlyMap<string, Mesh>;
  /** The display list each face drew last, by face ID; none for a face drawn plain. */
  readonly lists: ReadonlyMap<string, DisplayList>;
  /** The room text, once room-data.json has loaded: the faces it words are drawn, and the screens begin to type. */
  setText(text: RoomText | null): void;
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
  readonly texture: CanvasTexture;
  /** When its typing began, on the clock; null before its first frame with words. */
  start: number | null;
  /** Its typing has ended, or was cut to its final frame: it never types again. */
  typed: boolean;
  /** The step of its typing last drawn, so a frame redraws only when the rate moves it on. */
  step: number;
}

/** The face quads for the index's bound faces. */
export function buildFaceQuads(options: FaceQuadOptions): FaceQuads {
  const { part, index, doc } = options;
  let level = options.level;
  let text: RoomText | null = null;
  const states = new Map<string, FaceState>();
  const quads = new Map<string, Mesh>();
  const lists = new Map<string, DisplayList>();

  const sources = (): FaceSources => ({
    index,
    text,
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
    const canvas = doc.createElement("canvas");
    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
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
    states.set(face.id, { face, quad, canvas, texture, start: null, typed: false, step: -1 });
  }

  /** Sizes a face's canvas for the device and the level; whether its size changed. */
  const size = (s: FaceState): boolean => {
    const [w, h] = faceCanvasSize(s.face, options.dpr, qualitySettings(level));
    if (s.canvas.width === w && s.canvas.height === h) return false;
    s.canvas.width = w;
    s.canvas.height = h;
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

  /** Draws every face as it stands now: its final frame once typed, else the first of its typing. */
  const redraw = (): void => {
    for (const s of states.values()) draw(s, s.typed || s.start === null ? (s.typed ? Infinity : 0) : 0);
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
    draw(s, (step * 1000) / rate);
  };

  for (const s of states.values()) size(s);
  redraw();
  const unwatch = options.typefaces?.onChange(redraw);

  return {
    quads,
    lists,
    setText(next) {
      text = next;
      redraw();
    },
    setLevel(next) {
      if (next === level) return;
      level = next;
      for (const s of states.values()) if (size(s) || qualitySettings(level).typingFps <= 0) s.step = -1;
      redraw();
    },
    frame(now) {
      for (const s of states.values()) type(s, now);
    },
    dispose() {
      unwatch?.();
      for (const s of states.values()) {
        s.texture.dispose();
        (s.quad.material as MeshBasicMaterial).dispose();
        s.quad.geometry.dispose();
      }
    },
  };
}
