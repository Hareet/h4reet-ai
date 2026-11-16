// The 3D highlight (spec 008; FR-014 to FR-019, FR-049; plan.md R-07): the border the room's target shows, drawn at run
// time after the look's frame, in the lazy 3D chunk. Its colours and widths are the look's `highlight`, resolved by the
// compositor (FR-057), and lookdev judges them (SC-002).
// - What it borders: the target's members' draws (scene/bundle3d.ts's memberDraws), each mesh a member's placement
//   draws itself, its stand-in or its model, and nothing mounted on it. Each gets two proxies, one a pass, placed each
//   frame where the mesh stands; a mesh that doesn't show hides its proxies.
// - How, in two passes (FR-049), the plan's departures from its back-face hull (plan.md §10, the review of Phase 1):
//   1. The mask: the target's draws, front and back, into the stencil, with no colour and no depth test, so the border
//      never covers the target and no other piece in front of it hides any of the target's outline.
//   2. The ring: around each of the mesh's contour edges on screen, those whose two faces face opposite ways from the
//      eye, where the outline runs, a capsule as wide as the band and the edge together, drawn outside the stencil,
//      so what shows is every pixel within that width of the target's outline, measured on screen in CSS pixels: the
//      border is its data's widths on any mesh, hard-edged or smooth, at any angle. A capsule's fragment knows its
//      distance from its edge, and colours itself by it, the band nearer than band_px and the edge beyond; its depth
//      is that distance, scaled into the depth buffer's nearest thousandth, so of the capsules that cover a pixel the
//      nearest edge's colour shows, and no surface of the room hides it, not even the one the target stands on
//      (finding 2). The outer side fades over a pixel through the canvas's multisampling (alpha to coverage). Each
//      edge is one instance of a four-cornered quad, 48 bytes; an edge that isn't on the contour this frame folds to
//      nothing in the vertex shader, so the fragments drawn follow the outline's length, not the mesh's size.
//   The back-face hull drew a border narrower than its data wherever a hard edge met another (the review's finding 1),
//   and a miter couldn't mend it: measured over the room's stand-ins and over boxes turned across the stage, the
//   mitered hull still left parts of an outline with less than its width and drew spurs of up to four widths.
// - Its own materials, never the look's OutlineEffect instance, which shares one set of parameters with every material,
//   turns off at quality 2 and 3 (R-35), and draws nothing in the painted and flat looks: so the highlight draws in
//   every look and at every quality level (FR-017), still (FR-018), and changes nothing in the room (FR-019). The
//   stand-ins' labels draw after it (drawFrame), so a border never paints over a label.
// - Nothing without a target: no proxy, and no render call (FR-049). A new target takes its members' draws then;
//   refresh() takes them again after a model swaps in or falls back (the loader's swap), so the border follows what
//   the member draws now (FR-019).
import {
  AlwaysStencilFunc,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  KeepStencilOp,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import type { Camera, Object3D } from "three";

import type { Highlight as HighlightStyle } from "../compose/bundle";
import { REFERENCE_DESKTOP } from "../compose/stages";
import { memberDraws } from "./bundle3d";
import type { Room3D } from "./bundle3d";

/** The two passes' scenes, by name, in the order they're drawn. */
export const HIGHLIGHT_PASSES = ["highlight:mask", "highlight:ring"] as const;

/** The layer the stand-ins' labels draw on, beside the room's own, layer 0: drawFrame draws it after the passes. */
export const LABEL_LAYER = 1;

/** The stencil value the mask writes where the target draws. */
const MASKED = 1;

/** How far the ring's quads reach past its outer side, in CSS pixels, so the fade, not the quad, ends it. */
const MARGIN_PX = 1;

/** The share of the depth buffer, from its near end, the ring's distances are scaled into: nearer than anything of
 *  the room but what stands within a thousandth of the near plane's distance of it. (Three's reversed depth buffer,
 *  which neither stage asks for, would want the far end.) */
const RING_DEPTH = 1e-3;

/** How finely positions are matched when edges are found: a hundredth of a millimetre. */
const MATCH = 1e5;

const VERTEX = /* glsl */ `
uniform vec2 stage;
uniform float reach;
attribute vec3 edgeA;
attribute vec3 edgeB;
attribute vec3 faceA;
attribute vec3 faceB;
varying vec3 vLocal;
void main() {
  // On the contour only: the two faces facing opposite ways from the eye, measured at the edge's middle, the same in
  // all four corners; a face of zero, a border's or one whose faces don't agree on a side, always draws.
  vec3 mid = ( modelViewMatrix * vec4( ( edgeA + edgeB ) * 0.5, 1.0 ) ).xyz;
  vec3 na = normalMatrix * faceA;
  vec3 nb = normalMatrix * faceB;
  float sa = isOrthographic ? -na.z : dot( na, mid );
  float sb = isOrthographic ? -nb.z : dot( nb, mid );
  // This corner: position's x 1 at the first end and -1 at the second, its y the side.
  vec4 a = projectionMatrix * ( modelViewMatrix * vec4( position.x > 0.0 ? edgeA : edgeB, 1.0 ) );
  vec4 b = projectionMatrix * ( modelViewMatrix * vec4( position.x > 0.0 ? edgeB : edgeA, 1.0 ) );
  // The edge cut at the near plane: nothing where it lies wholly behind it.
  float da = a.z + a.w;
  float db = b.z + b.w;
  if ( sa * sb > 0.0 || ( da < 0.0 && db < 0.0 ) ) {
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    vLocal = vec3( 0.0 );
    return;
  }
  if ( da < 0.0 ) a = mix( a, b, da / ( da - db ) );
  else if ( db < 0.0 ) b = mix( b, a, db / ( db - da ) );
  // Both ends in CSS pixels from the stage's centre, and this corner of the capsule's quad around them.
  vec2 half_ = stage * 0.5;
  vec2 p = a.xy / a.w * half_;
  vec2 q = b.xy / b.w * half_;
  vec2 d = p - q;
  float len = length( d );
  vec2 dir = len > 1e-4 ? d / len : vec2( 1.0, 0.0 );
  vec2 perp = vec2( -dir.y, dir.x );
  gl_Position = vec4( ( p + ( dir + position.y * perp ) * reach ) / half_, 0.0, 1.0 );
  // Where the corner lies from the edge's middle, along it and across it, in the frame of the edge's first end, and
  // half the edge's length: every corner the same w, so the fragment gets them interpolated straight on screen.
  vLocal = vec3( position.x * vec2( len * 0.5 + reach, position.y * reach ), len * 0.5 );
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 bandColor;
uniform vec3 edgeColor;
uniform float band;
uniform float outer;
uniform float reach;
varying vec3 vLocal;
void main() {
  float along = max( abs( vLocal.x ) - vLocal.z, 0.0 );
  float d = length( vec2( along, vLocal.y ) );
  if ( d > outer + 0.5 ) discard;
  gl_FragDepth = ${RING_DEPTH.toExponential()} * d / reach;
  gl_FragColor = vec4( mix( bandColor, edgeColor, clamp( d - band + 0.5, 0.0, 1.0 ) ), clamp( outer + 0.5 - d, 0.0, 1.0 ) );
  #include <colorspace_fragment>
}
`;

/** Each geometry's ring, made once and kept as long as the geometry, and released with it. */
const rings = new WeakMap<BufferGeometry, InstancedBufferGeometry>();

/** The quad each edge draws, its corners as `position`: x 1 at the edge's first end and -1 at its second, y the side. */
const CORNERS = [1, 1, 0, 1, -1, 0, -1, 1, 0, -1, -1, 0];

/**
 * A geometry's ring for the highlight: one instance of a four-cornered quad for each of its edges, the capsule the ring
 * pass draws around it while the edge is on the contour. Its edges: each pair of positions a triangle joins, positions
 * matched to a hundredth of a millimetre, except where exactly two triangles meet in one plane, as a box face's
 * diagonal, which is never on the contour. Each instance holds the edge's two ends, `edgeA` and `edgeB`, and its two
 * faces' normals, `faceA` and `faceB`, each zero where the edge always draws: a border's, an edge three or more
 * triangles share, and one whose two triangles run it the same way, so their normals don't agree on a side. Made once
 * a geometry, and released when it is.
 */
export function ringGeometry(source: BufferGeometry): InstancedBufferGeometry {
  const known = rings.get(source);
  if (known) return known;
  const position = source.getAttribute("position");
  const ids = new Map<string, number>();
  const points: Vector3[] = [];
  const at: number[] = [];
  const p = new Vector3();
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i);
    const key = `${Math.round(p.x * MATCH)},${Math.round(p.y * MATCH)},${Math.round(p.z * MATCH)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = points.length;
      ids.set(key, id);
      points.push(p.clone());
    }
    at.push(id);
  }
  const index = source.index;
  const corners = index ? index.count : position.count;
  /** Each edge by its ends' IDs, low then high: each face's normal, and whether the face runs it low to high. */
  const edges = new Map<number, { a: number; b: number; faces: { normal: Vector3; up: boolean }[] }>();
  const u = new Vector3();
  const v = new Vector3();
  for (let k = 0; k + 2 < corners; k += 3) {
    const tri = [0, 1, 2].map((j) => at[index ? index.getX(k + j) : k + j] as number) as [number, number, number];
    const [x, y, z] = tri.map((id) => points[id] as Vector3) as [Vector3, Vector3, Vector3];
    const normal = u.subVectors(y, x).clone().cross(v.subVectors(z, x));
    if (normal.lengthSq() < 1e-24) continue;
    normal.normalize();
    for (const [s, t] of [
      [tri[0], tri[1]],
      [tri[1], tri[2]],
      [tri[2], tri[0]],
    ] as const) {
      const [lo, hi] = s < t ? [s, t] : [t, s];
      const key = lo * points.length + hi;
      let edge = edges.get(key);
      if (!edge) edges.set(key, (edge = { a: lo, b: hi, faces: [] }));
      edge.faces.push({ normal, up: s < t });
    }
  }
  const kept = [...edges.values()].filter(
    ({ faces: f }) => !(f.length === 2 && (f[0]?.normal as Vector3).dot(f[1]?.normal as Vector3) > 1 - 1e-6),
  );
  const ends = [new Float32Array(kept.length * 3), new Float32Array(kept.length * 3)];
  const normals = [new Float32Array(kept.length * 3), new Float32Array(kept.length * 3)];
  kept.forEach(({ a, b, faces }, e) => {
    for (const [k, id] of [a, b].entries()) {
      const q = points[id] as Vector3;
      ends[k]?.set([q.x, q.y, q.z], e * 3);
    }
    // Two faces running the edge opposite ways, as a closed surface's do: the contour test holds; else zeros.
    const [f, g] = faces;
    if (faces.length === 2 && f && g && f.up !== g.up) {
      normals[0]?.set([f.normal.x, f.normal.y, f.normal.z], e * 3);
      normals[1]?.set([g.normal.x, g.normal.y, g.normal.z], e * 3);
    }
  });
  const ring = new InstancedBufferGeometry();
  ring.setAttribute("position", new Float32BufferAttribute(CORNERS, 3));
  ring.setIndex([0, 1, 2, 0, 2, 3]);
  ring.setAttribute("edgeA", new InstancedBufferAttribute(ends[0] as Float32Array, 3));
  ring.setAttribute("edgeB", new InstancedBufferAttribute(ends[1] as Float32Array, 3));
  ring.setAttribute("faceA", new InstancedBufferAttribute(normals[0] as Float32Array, 3));
  ring.setAttribute("faceB", new InstancedBufferAttribute(normals[1] as Float32Array, 3));
  ring.instanceCount = kept.length;
  rings.set(source, ring);
  source.addEventListener("dispose", () => ring.dispose());
  return ring;
}

/** What the highlight draws with: the renderer's render and its autoClear, which it turns off for its passes. */
export interface HighlightRenderer {
  autoClear: boolean;
  render(scene: Scene, camera: Camera): void;
}

export interface HighlightOptions {
  readonly room: Room3D;
  /** The look's highlight, resolved. */
  readonly style: HighlightStyle;
  /** A selectable's members, by its ID: the index's; none for an ID it doesn't list. */
  members(id: string): readonly string[];
  /** Spec 026 (R-09): the pictures of a selectable's figure that show now (the room's dog's), whose meshes it borders
   *  with its members'; none by default. */
  figures?(id: string): readonly Object3D[];
}

export interface Highlight {
  /** The selectable bordered, or none. */
  readonly target: string | null;
  /** Whether render draws: a target with draws. */
  readonly active: boolean;
  /** The meshes the passes border now: the target's draws that show. */
  readonly draws: readonly Mesh[];
  /** Borders a selectable's members' draws from the next frame drawn; null clears it. */
  setTarget(id: string | null): void;
  /** Takes the target's draws again: after a member's model swaps in, or falls back to its stand-in. */
  refresh(): void;
  /** The stage's size in CSS pixels: the ring's widths follow it from the next frame. */
  setStage(width: number, height: number): void;
  /** Draws the two passes, mask then ring, after the look's frame; nothing, and no call, without a target. */
  render(renderer: HighlightRenderer, camera: Camera): void;
  /** Releases the passes' materials; the rings stay with their geometries. */
  dispose(): void;
}

interface Pair {
  readonly source: Mesh;
  readonly proxies: readonly [Mesh, Mesh];
}

export function createHighlight(options: HighlightOptions): Highlight {
  const { room, style } = options;
  const scene = (name: string): Scene => {
    const s = new Scene();
    s.name = name;
    // The proxies' world matrices are their meshes', copied each frame: nothing recomputes them.
    s.matrixWorldAutoUpdate = false;
    return s;
  };
  const [maskName, ringName] = HIGHLIGHT_PASSES;
  const mask = {
    scene: scene(maskName),
    material: new MeshBasicMaterial({
      name: maskName,
      side: DoubleSide,
      colorWrite: false,
      depthTest: false,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: MASKED,
      stencilFunc: AlwaysStencilFunc,
      stencilZPass: ReplaceStencilOp,
    }),
  };
  const outer = style.band_px + style.edge_px;
  const ring = {
    scene: scene(ringName),
    material: new ShaderMaterial({
      name: ringName,
      uniforms: {
        stage: { value: new Vector2(REFERENCE_DESKTOP.stage.w, REFERENCE_DESKTOP.stage.h) },
        band: { value: style.band_px },
        outer: { value: outer },
        reach: { value: outer + MARGIN_PX },
        bandColor: { value: new Color(style.band) },
        edgeColor: { value: new Color(style.edge) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: DoubleSide,
      depthTest: true,
      depthWrite: true,
      alphaToCoverage: true,
      stencilWrite: true,
      stencilRef: MASKED,
      stencilFunc: NotEqualStencilFunc,
      stencilFail: KeepStencilOp,
      stencilZFail: KeepStencilOp,
      stencilZPass: KeepStencilOp,
      toneMapped: false,
    }),
  };
  let target: string | null = null;
  let pairs: Pair[] = [];

  const setStage = (width: number, height: number): void => {
    if (!(width > 0 && height > 0)) return;
    (ring.material.uniforms.stage?.value as Vector2).set(width, height);
  };

  /** Whether a mesh shows: it and every node above it visible, up to the room's scene. */
  const shown = (mesh: Mesh): boolean => {
    for (let node: typeof mesh.parent | Mesh = mesh; node; node = node.parent) {
      if (!node.visible) return false;
      if (node === room.scene) return true;
    }
    return false;
  };

  const proxy = (geometry: BufferGeometry, material: MeshBasicMaterial | ShaderMaterial): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  };

  const take = (): void => {
    for (const { proxies } of pairs) for (const p of proxies) p.removeFromParent();
    pairs = [];
    if (target === null) return;
    for (const source of memberDraws(room, options.members(target), options.figures?.(target) ?? [])) {
      const proxies = [
        proxy(source.geometry, mask.material),
        proxy(ringGeometry(source.geometry), ring.material),
      ] as const;
      mask.scene.add(proxies[0]);
      ring.scene.add(proxies[1]);
      pairs.push({ source, proxies });
    }
  };

  return {
    get target() {
      return target;
    },
    get active() {
      return pairs.length > 0;
    },
    get draws() {
      return pairs.filter((pair) => shown(pair.source)).map((pair) => pair.source);
    },
    setTarget(id) {
      if (id === target) return;
      target = id;
      take();
    },
    refresh: take,
    setStage,
    render(renderer, camera) {
      if (pairs.length === 0) return;
      for (const { source, proxies } of pairs) {
        const on = shown(source);
        if (on) source.updateWorldMatrix(true, false);
        for (const p of proxies) {
          p.visible = on;
          if (on) p.matrixWorld.copy(source.matrixWorld);
        }
      }
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      try {
        renderer.render(mask.scene, camera);
        renderer.render(ring.scene, camera);
      } finally {
        renderer.autoClear = auto;
      }
    },
    dispose() {
      target = null;
      take();
      mask.material.dispose();
      ring.material.dispose();
    },
  };
}

/** What a frame with the highlight draws with: the highlight's renderer, and its shadow map, off for the labels. */
export interface FrameRenderer extends HighlightRenderer {
  readonly shadowMap: { enabled: boolean };
}

export interface FrameOptions {
  readonly renderer: FrameRenderer;
  /** The room's scene, its stand-ins' labels on LABEL_LAYER. */
  readonly scene: Scene;
  readonly camera: Camera;
  readonly highlight: Highlight;
  /** Whether the room has labels to draw. */
  readonly labels: boolean;
  /** Draws the room in its look: the look's frame, its ink lines and all. */
  drawRoom(): void;
}

/**
 * A frame with the highlight (FR-015, FR-019): with a target, the room in its look without its labels, the highlight's
 * two passes, then the labels alone, so no border paints over a label; otherwise, or where the room has no labels or
 * the camera doesn't show them (lookdev's Labels off), the room as before and then the passes, which draw nothing
 * without a target. The labels' render clears nothing and draws no background or shadow map: only the sprites.
 */
export function drawFrame(options: FrameOptions): void {
  const { renderer, scene, camera, highlight } = options;
  if (!highlight.active || !options.labels || !camera.layers.isEnabled(LABEL_LAYER)) {
    options.drawRoom();
    highlight.render(renderer, camera);
    return;
  }
  camera.layers.disable(LABEL_LAYER);
  try {
    options.drawRoom();
  } finally {
    camera.layers.enable(LABEL_LAYER);
  }
  highlight.render(renderer, camera);
  const layers = camera.layers.mask;
  const background = scene.background;
  const shadows = renderer.shadowMap.enabled;
  const auto = renderer.autoClear;
  camera.layers.set(LABEL_LAYER);
  scene.background = null;
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;
  try {
    renderer.render(scene, camera);
  } finally {
    camera.layers.mask = layers;
    scene.background = background;
    renderer.shadowMap.enabled = shadows;
    renderer.autoClear = auto;
  }
}

// --------------------------------------------------------------------------------------------------------------------
// The shaders in JS, line for line, so the tests measure what the ring draws
// --------------------------------------------------------------------------------------------------------------------
/** A clip-space position: x, y, z, w. */
export type Clip = readonly [number, number, number, number];

/** A view-space vector: x, y, z. */
export type View = readonly [number, number, number];

/** The vertex shader's contour test: whether an edge draws, from its two faces' normals and its middle in view space,
 *  and whether the camera is orthographic. */
export function ringContour(faceA: View, faceB: View, mid: View, orthographic: boolean): boolean {
  const dot = (n: View): number => n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2];
  const sa = orthographic ? -faceA[2] : dot(faceA);
  const sb = orthographic ? -faceB[2] : dot(faceB);
  return !(sa * sb > 0);
}

/** A ring corner as the vertex shader places it: its clip position, w 1, and its place from the edge's middle. */
export interface RingCorner {
  readonly clip: Clip;
  /** Along the edge and across it from its middle, in CSS pixels, in its first end's frame; and half its length. */
  readonly local: readonly [number, number, number];
}

/**
 * The vertex shader past its contour test: a corner of an edge's quad, from the corner's own end and the far end in
 * clip space, its corner (`position`'s x and y), the stage's size, and the reach in CSS pixels; null where the edge
 * lies wholly behind the near plane.
 */
export function ringVertex(
  own: Clip,
  far: Clip,
  corner: readonly [number, number],
  stage: readonly [number, number],
  reach: number,
): RingCorner | null {
  let a = own;
  let b = far;
  const da = a[2] + a[3];
  const db = b[2] + b[3];
  if (da < 0 && db < 0) return null;
  const mix = (x: Clip, y: Clip, t: number): Clip => [
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
    x[3] + (y[3] - x[3]) * t,
  ];
  if (da < 0) a = mix(a, b, da / (da - db));
  else if (db < 0) b = mix(b, a, db / (db - da));
  const half = [stage[0] / 2, stage[1] / 2] as const;
  const p = [(a[0] / a[3]) * half[0], (a[1] / a[3]) * half[1]] as const;
  const q = [(b[0] / b[3]) * half[0], (b[1] / b[3]) * half[1]] as const;
  const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
  const [dx, dy] = len > 1e-4 ? [(p[0] - q[0]) / len, (p[1] - q[1]) / len] : [1, 0];
  const [end, side] = corner;
  return {
    clip: [(p[0] + (dx - side * dy) * reach) / half[0], (p[1] + (dy + side * dx) * reach) / half[1], 0, 1],
    local: [end * (len / 2 + reach), end * side * reach, len / 2],
  };
}

/** A ring fragment as the fragment shader colours it: its depth, its tone from the band, 0, to the edge, 1, and its
 *  coverage; null where it's discarded. */
export interface RingFragment {
  readonly depth: number;
  readonly tone: number;
  readonly alpha: number;
}

/** The fragment shader, from the interpolated place, the band's width, the band's and edge's together, and the reach. */
export function ringFragment(
  local: readonly [number, number, number],
  band: number,
  outer: number,
  reach: number,
): RingFragment | null {
  const along = Math.max(Math.abs(local[0]) - local[2], 0);
  const d = Math.hypot(along, local[1]);
  if (d > outer + 0.5) return null;
  const clamp = (x: number): number => Math.min(Math.max(x, 0), 1);
  return { depth: (RING_DEPTH * d) / reach, tone: clamp(d - band + 0.5), alpha: clamp(outer + 0.5 - d) };
}
