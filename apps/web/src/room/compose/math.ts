// The kernel's matrices (spec 004; R-08, R-17; data-model.md §4.2): 4 × 4 matrices in column-major order, as three.js's
// Matrix4.elements holds them, and three-component vectors, in plain TypeScript with no three.js and no DOM, so the
// compositor in Node, the room in the browser, and the lookdev page compute the same numbers. Tests hold every
// function here to three.js's own within 1e-9. Lengths are metres; a turn is in degrees, applied in Y, then X, then Z:
// R({x, y, z}) = Ry(y) · Rx(x) · Rz(z), three.js's Euler order "YXZ".

export type Vec3 = readonly [number, number, number];

/** Column-major: element (row r, column c) is at index c × 4 + r, and the translation is at 12, 13, and 14. */
export type Mat4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** A turn in degrees about each axis; each 0 when the data leaves it out. */
export interface Turn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Radians in a degree, as three.js's MathUtils.DEG2RAD. */
export const DEG = Math.PI / 180;

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** a · b: b's transform first, then a's. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const [a11, a21, a31, a41, a12, a22, a32, a42, a13, a23, a33, a43, a14, a24, a34, a44] = a;
  const [b11, b21, b31, b41, b12, b22, b32, b42, b13, b23, b33, b43, b14, b24, b34, b44] = b;
  return [
    a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41,
    a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41,
    a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41,
    a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41,
    a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42,
    a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42,
    a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42,
    a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42,
    a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43,
    a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43,
    a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43,
    a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43,
    a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44,
    a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44,
    a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44,
    a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44,
  ];
}

export function translation(v: Vec3): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1];
}

/** A uniform scale: a piece's stylized scale. */
export function scaling(s: number): Mat4 {
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
}

/** A turn of `radians` about X. */
export function rotationX(radians: number): Mat4 {
  const [c, s] = [Math.cos(radians), Math.sin(radians)];
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

/** A turn of `radians` about Y. */
export function rotationY(radians: number): Mat4 {
  const [c, s] = [Math.cos(radians), Math.sin(radians)];
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** A turn of `radians` about Z. */
export function rotationZ(radians: number): Mat4 {
  const [c, s] = [Math.cos(radians), Math.sin(radians)];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** R({x, y, z}) = Ry(y) · Rx(x) · Rz(z), the turn in degrees: three.js's Euler order "YXZ", in its closed form. */
export function rotation(turn: Turn): Mat4 {
  const [a, b] = [Math.cos(turn.x * DEG), Math.sin(turn.x * DEG)];
  const [c, d] = [Math.cos(turn.y * DEG), Math.sin(turn.y * DEG)];
  const [e, f] = [Math.cos(turn.z * DEG), Math.sin(turn.z * DEG)];
  const [ce, cf, de, df] = [c * e, c * f, d * e, d * f];
  return [ce + df * b, a * f, cf * b - de, 0, de * b - cf, a * e, df + ce * b, 0, a * d, -b, a * c, 0, 0, 0, 0, 1];
}

/** The inverse, as three.js's Matrix4.invert computes it, or null for a singular matrix. */
export function invert(m: Mat4): Mat4 | null {
  const [n11, n21, n31, n41, n12, n22, n32, n42, n13, n23, n33, n43, n14, n24, n34, n44] = m;
  const t1 = n11 * n22 - n21 * n12;
  const t2 = n11 * n32 - n31 * n12;
  const t3 = n11 * n42 - n41 * n12;
  const t4 = n21 * n32 - n31 * n22;
  const t5 = n21 * n42 - n41 * n22;
  const t6 = n31 * n42 - n41 * n32;
  const t7 = n13 * n24 - n23 * n14;
  const t8 = n13 * n34 - n33 * n14;
  const t9 = n13 * n44 - n43 * n14;
  const t10 = n23 * n34 - n33 * n24;
  const t11 = n23 * n44 - n43 * n24;
  const t12 = n33 * n44 - n43 * n34;
  const det = t1 * t12 - t2 * t11 + t3 * t10 + t4 * t9 - t5 * t8 + t6 * t7;
  if (det === 0 || !Number.isFinite(det)) return null;
  const k = 1 / det;
  return [
    (n22 * t12 - n32 * t11 + n42 * t10) * k,
    (n31 * t11 - n21 * t12 - n41 * t10) * k,
    (n24 * t6 - n34 * t5 + n44 * t4) * k,
    (n33 * t5 - n23 * t6 - n43 * t4) * k,
    (n32 * t9 - n12 * t12 - n42 * t8) * k,
    (n11 * t12 - n31 * t9 + n41 * t8) * k,
    (n34 * t3 - n14 * t6 - n44 * t2) * k,
    (n13 * t6 - n33 * t3 + n43 * t2) * k,
    (n12 * t11 - n22 * t9 + n42 * t7) * k,
    (n21 * t9 - n11 * t11 - n41 * t7) * k,
    (n14 * t5 - n24 * t3 + n44 * t1) * k,
    (n23 * t3 - n13 * t5 - n43 * t1) * k,
    (n22 * t8 - n12 * t10 - n32 * t7) * k,
    (n11 * t10 - n21 * t8 + n31 * t7) * k,
    (n24 * t2 - n14 * t4 - n34 * t1) * k,
    (n13 * t4 - n23 * t2 + n33 * t1) * k,
  ];
}

/** A point through m, with the perspective divide: three.js's Vector3.applyMatrix4. */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const w = 1 / (m[3] * x + m[7] * y + m[11] * z + m[15]);
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) * w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) * w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) * w,
  ];
}

/** A direction through m's upper 3 × 3, neither translated nor normalized. */
export function transformDirection(m: Mat4, d: Vec3): Vec3 {
  const [x, y, z] = d;
  return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
}

/** Where m puts the origin. */
export function origin(m: Mat4): Vec3 {
  return [m[12], m[13], m[14]];
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** The unit vector along a, or a itself when it has no length. */
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l === 0 ? a : [a[0] / l, a[1] / l, a[2] / l];
}
