// The HUD's hand-drawn parts (spec 018; FR-011, plan.md §1 P3): a rough-edged frame and a brush stroke, as SVG path
// strings made from a seeded generator, so the same seed draws the same line, no file or filter is needed, and a test
// can read them as strings. Only the commands M, L, C, Q, and Z, and numbers, are ever produced.

/** A small seeded generator (mulberry32): the same seed, the same sequence in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** The margin the frame keeps from its box, in the box's units: its roughness sits inside it. */
export const FRAME_MARGIN = 4;

/** A closed, rough-edged rectangle in a `w` × `h` box: each side a run of short segments with a small jitter. */
export function roughFramePath(w: number, h: number, seed: number): string {
  const rand = rng(seed);
  const m = FRAME_MARGIN;
  const jitter = (): number => (rand() - 0.5) * (m - 1.5);
  const side = (x0: number, y0: number, x1: number, y1: number): string => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / 40));
    let out = "";
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const j = i === n ? 0 : 1;
      out += ` L${r1(x0 + (x1 - x0) * t + jitter() * j)},${r1(y0 + (y1 - y0) * t + jitter() * j)}`;
    }
    return out;
  };
  const [x0, y0, x1, y1] = [m, m, Math.max(m + 1, w - m), Math.max(m + 1, h - m)];
  return `M${x0},${y0}${side(x0, y0, x1, y0)}${side(x1, y0, x1, y1)}${side(x1, y1, x0, y1)}${side(x0, y1, x0, y0)} Z`;
}

/** A brush stroke across `w` units: a gently bowed line drawn as two curves, from the left edge to the right. */
export function brushStrokePath(w: number, seed: number): string {
  const rand = rng(seed);
  const y = (): number => r1(2 + rand() * 4);
  const x1 = r1(w * (0.3 + rand() * 0.1));
  const x2 = r1(w * (0.65 + rand() * 0.1));
  return `M0,${y()} C${x1},${y()} ${x2},${y()} ${r1(w)},${y()}`;
}
