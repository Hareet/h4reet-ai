// The kernel's camera and projection (spec 004; FR-052, FR-064; R-08, R-20, R-21): a perspective camera as three.js's
// PerspectiveCamera computes it, looking from `position` at `target` with +Y up, in plain TypeScript, so the build's
// checks measure exactly what the room draws. `project` equals three.js's Vector3.project (the point through the
// camera's world inverse, then its projection matrix) for spec 002's camera, which looks straight down −Z; the test
// holds it to three.js within 1e-9. Normalized device coordinates run −1 to 1, y up; a stage's CSS pixels run from its
// top left, y down.
import { DEG, cross, dot, invert, multiply, normalize, sub, transformPoint } from "./math";
import type { Mat4, Vec3 } from "./math";
import type { Stage } from "./stages";

export interface Camera {
  /** The vertical field of view, in degrees. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  readonly position: Vec3;
  readonly target: Vec3;
}

const UP: Vec3 = [0, 1, 0];

/** World to camera: the inverse of the camera's world matrix after three.js's lookAt, with +Y up. */
export function viewMatrix(camera: Camera): Mat4 {
  const eye = camera.position;
  // three.js's Matrix4.lookAt(eye, target, up), as a camera's Object3D.lookAt calls it, including its two fallbacks.
  let z = sub(eye, camera.target);
  if (dot(z, z) === 0) z = [0, 0, 1];
  z = normalize(z);
  let x = cross(UP, z);
  if (dot(x, x) === 0) {
    z = normalize(Math.abs(UP[2]) === 1 ? [z[0] + 0.0001, z[1], z[2]] : [z[0], z[1], z[2] + 0.0001]);
    x = cross(UP, z);
  }
  x = normalize(x);
  const y = cross(z, x);
  // The rotation's transpose, and the eye taken off.
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

/** The projection, as three.js's PerspectiveCamera.updateProjectionMatrix makes it (zoom 1, no view offset). */
export function projectionMatrix(camera: Camera, aspect: number): Mat4 {
  const { near, far } = camera;
  const top = near * Math.tan(DEG * 0.5 * camera.fov);
  const height = 2 * top;
  const width = aspect * height;
  const left = -0.5 * width;
  const [right, bottom] = [left + width, top - height];
  const x = (2 * near) / (right - left);
  const y = (2 * near) / (top - bottom);
  const a = (right + left) / (right - left);
  const b = (top + bottom) / (top - bottom);
  const c = -(far + near) / (far - near);
  const d = (-2 * far * near) / (far - near);
  return [x, 0, 0, 0, 0, y, 0, 0, a, b, c, -1, 0, 0, d, 0];
}

export interface Projector {
  readonly view: Mat4;
  readonly projection: Mat4;
  /** A world point in normalized device coordinates, as three.js's Vector3.project gives it. */
  project(point: Vec3): Vec3;
  /** How far a world point lies in front of the camera, along its view: negative behind it. */
  depth(point: Vec3): number;
}

/** One camera at one aspect, its matrices computed once for many points. */
export function projector(camera: Camera, aspect: number): Projector {
  const view = viewMatrix(camera);
  const projection = projectionMatrix(camera, aspect);
  return {
    view,
    projection,
    project: (point) => transformPoint(projection, transformPoint(view, point)),
    depth: (point) => -(view[2] * point[0] + view[6] * point[1] + view[10] * point[2] + view[14]),
  };
}

export function project(point: Vec3, camera: Camera, aspect: number): Vec3 {
  return projector(camera, aspect).project(point);
}

/** How far a world point lies in front of the camera, along its view: negative behind it. */
export function viewDepth(point: Vec3, camera: Camera): number {
  return -transformPoint(viewMatrix(camera), point)[2];
}

/** Normalized device coordinates to a stage's CSS pixels, from its top left. */
export function toStage(ndc: Vec3, stage: Stage): readonly [number, number] {
  return [((ndc[0] + 1) / 2) * stage.w, ((1 - ndc[1]) / 2) * stage.h];
}

/** A ray: its origin, and its direction, a unit vector (spec 008, R-11). */
export interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

/**
 * The ray through a point of the view in normalized device coordinates, the inverse of `project` (spec 008; FR-030 to
 * FR-032; plan.md R-11): from the camera's near plane through its far plane, so every point along it projects back to
 * the same coordinates. A click or a tap on the stage walks the figure to where it meets the floor.
 */
export function ray(camera: Camera, aspect: number, ndc: readonly [x: number, y: number]): Ray {
  const back = invert(multiply(projectionMatrix(camera, aspect), viewMatrix(camera)));
  if (!back) return { origin: camera.position, direction: normalize(sub(camera.target, camera.position)) };
  const near = transformPoint(back, [ndc[0], ndc[1], -1]);
  const far = transformPoint(back, [ndc[0], ndc[1], 1]);
  return { origin: near, direction: normalize(sub(far, near)) };
}

/** Where a ray meets the horizontal plane at a height, ahead of its origin, as [x, z]; null where it never does. */
export function planeHit(r: Ray, y: number): readonly [x: number, z: number] | null {
  const dy = r.direction[1];
  if (Math.abs(dy) < 1e-12) return null;
  const t = (y - r.origin[1]) / dy;
  if (!(t > 0)) return null;
  return [r.origin[0] + r.direction[0] * t, r.origin[2] + r.direction[2] * t];
}
