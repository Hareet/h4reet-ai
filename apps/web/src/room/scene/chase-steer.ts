// The run's steering (spec 025; FR-004 to FR-009; plan.md R-02, R-03): pure and deterministic, on numbers alone, with no
// three.js import, so the property test (SC-001) runs it on the room's own floor and on fake ones. It writes into the
// runner it is given and allocates nothing a frame (FR-029).
// - The chase floor is spec 008's walkable floor with the twin's own placement left out, as the visitor's own is
//   (FR-006): the twin's picture can leave its home and come back, and the dinosaur, on the visitor's floor, which keeps
//   the twin's obstacle (FR-017), can't follow it into the twin's corner (Q12).
// - Each frame, a figure within `flee_m` of the dinosaur tries `headings` unit directions. Each heading's step is spec
//   008's slide on the chase floor at the figure's run speed; its score is the least margin along the path the figure
//   would run on it for `lookahead_s`, sampled LOOK_SAMPLES times, from the dinosaur's reach (it can be anywhere within
//   `walking.speed_mps` × t of where it is): so a heading into a wall or past the dinosaur scores low, and one along the
//   edge and around it scores high. A penalty below WALL_M of clearance keeps it off the edges (plan R-02, as tuned).
// - FR-007's two clauses filter the headings before the score picks: a step must end at least min(`safe_m`, the
//   distance the figure ended its last frame at) from the dinosaur, the last distance being the one before the step at
//   a start, a resume, or a jump (`last` NaN). With none allowed, the heading that loses least.
// - The separation (FR-008) is applied last, among the headings FR-007 allows: the dog prefers a step that keeps
//   `separation_m` from the twin, or opens the gap; else it keeps its choice and the twin's own step opens it.
// - The dead band: a figure at or above `safe_m` stands where no step beats standing by DEAD_BAND_MPS, so it doesn't
//   jitter in a pocket. Beyond `flee_m` it stands, facing the dinosaur.
// - The step takes the chosen heading at once; the turn rate bounds only the picture's facing (FR-009).
// Headings are spec 008's: h faces (−sin h, −cos h) on the floor.
import type { WalkableFloor } from "../compose/floor";
import { STEP_S, headingOf, slideInto } from "../walk/movement";

/** The scene's `figures.chase` block, resolved (FR-005, FR-007, FR-008; plan.md §3). */
export interface ChaseConfig {
  readonly flee_end_delay_s: number;
  readonly flee_m: number;
  readonly safe_m: number;
  readonly separation_m: number;
  readonly twin_run_mps: number;
  readonly dog_run_mps: number;
  readonly speed_margin_mps: number;
  readonly turn_rate_rad_s: number;
  readonly lookahead_s: number;
  readonly headings: number;
  readonly clip_thresholds: { readonly walk_mps: number; readonly run_mps: number };
}

/** Plan §3's defaults, fitted to the room's floor (Q12); placeholders the Author's look sets. */
export const CHASE_DEFAULTS: ChaseConfig = Object.freeze({
  flee_end_delay_s: 2,
  flee_m: 1.0,
  safe_m: 0.4,
  separation_m: 0.3,
  twin_run_mps: 2.0,
  dog_run_mps: 2.5,
  speed_margin_mps: 0.5,
  turn_rate_rad_s: 8,
  lookahead_s: 1.0,
  headings: 16,
  clip_thresholds: Object.freeze({ walk_mps: 0.3, run_mps: 1.5 }),
});

/** Below this clearance from the chase floor's edges a step is penalized (plan R-02, as T002 tuned it), in metres. */
export const WALL_M = 0.1;
/** The penalty's weight: at the edge itself a step loses WALL_K × WALL_M metres of score, bounded. */
export const WALL_K = 0.5;
/** The dead band: a step that beats standing by less than this speed's distance a frame isn't taken. */
export const DEAD_BAND_MPS = 0.05;
/** How many points of each heading's path the lookahead measures. */
export const LOOK_SAMPLES = 4;

/** One running figure's state, written in place each frame. */
export interface Runner {
  x: number;
  z: number;
  /** The heading of its last step (spec 008's convention). */
  heading: number;
  /** The picture's facing, which turns toward the heading at most `turn_rate_rad_s` (FR-009). */
  facing: number;
  /** Metres a second, its last step's. */
  speed: number;
  /** Its distance from the dinosaur at the end of its last frame; NaN at a start, a resume, or a jump (FR-007 (a)). */
  last: number;
}

export function createRunner(x: number, z: number, facing: number): Runner {
  return { x, z, heading: facing, facing, speed: 0, last: Number.NaN };
}

/** The chase floor (FR-006): the visitor's walkable floor with the twin's placement's obstacle left out. */
export function chaseFloor(floor: WalkableFloor, twin: string): WalkableFloor {
  return { ...floor, obstacles: floor.obstacles.filter((o) => o.id !== twin) };
}

/** An angle turned toward another the short way round, by at most `max` radians; the target itself once within. */
export function turnToward(from: number, to: number, max: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  if (Math.abs(d) <= max) return to;
  return from + Math.sign(d) * max;
}

/** compose/floor.ts's clearance, as a number and with no object made: the distance to the nearest bound or obstacle's
 *  edge, 0 inside an obstacle, negative outside the bounds. */
export function clearanceAt(floor: WalkableFloor, x: number, z: number): number {
  const b = floor.bounds;
  let c = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
  if (c < 0) return c;
  const obstacles = floor.obstacles;
  for (let i = 0; i < obstacles.length; i += 1) {
    const r = (obstacles[i] as WalkableFloor["obstacles"][number]).rect;
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return 0;
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dz = Math.max(r.z0 - z, 0, z - r.z1);
    const d = Math.hypot(dx, dz);
    if (d < c) c = d;
  }
  return c;
}

/** Reused points: nothing is made a frame. */
const at = { x: 0, z: 0 };
const path = { x: 0, z: 0 };

/** A distance along a unit direction over dt, cut into steps of at most STEP_S, as spec 008's travel; into `at`. */
function travel(floor: WalkableFloor, x: number, z: number, ux: number, uz: number, distance: number, dt: number) {
  const steps = Math.max(1, Math.ceil(dt / STEP_S));
  at.x = x;
  at.z = z;
  for (let i = 0; i < steps; i += 1) slideInto(floor, at.x, at.z, (ux * distance) / steps, (uz * distance) / steps, at);
}

const penalty = (floor: WalkableFloor, x: number, z: number): number => {
  const c = clearanceAt(floor, x, z);
  return c < WALL_M ? WALL_K * (WALL_M - c) : 0;
};

/** A heading's score from where its step ends, (qx, qz): the least margin along its path from the dinosaur's reach. */
function score(
  floor: WalkableFloor,
  qx: number,
  qz: number,
  ux: number,
  uz: number,
  run: number,
  dino: { readonly x: number; readonly z: number },
  walk: number,
  lookahead: number,
): number {
  path.x = qx;
  path.z = qz;
  const dt = lookahead / LOOK_SAMPLES;
  let least = Infinity;
  for (let k = 1; k <= LOOK_SAMPLES; k += 1) {
    slideInto(floor, path.x, path.z, ux * run * dt, uz * run * dt, path);
    const margin = Math.hypot(path.x - dino.x, path.z - dino.z) - walk * dt * k;
    if (margin < least) least = margin;
  }
  return least - penalty(floor, qx, qz);
}

/**
 * One frame of a running figure (FR-004 to FR-009): its step on the chase floor at `run` metres a second, away from the
 * dinosaur at `dino`, written into `figure`. `other` is the figure it keeps `separation_m` from (the dog's twin), or
 * null. The dinosaur has already moved this frame.
 */
export function steer(
  floor: WalkableFloor,
  figure: Runner,
  run: number,
  dino: { readonly x: number; readonly z: number },
  config: ChaseConfig,
  walk: number,
  dt: number,
  other: { readonly x: number; readonly z: number } | null,
): void {
  const px = figure.x;
  const pz = figure.z;
  const now = Math.hypot(px - dino.x, pz - dino.z);
  const turn = config.turn_rate_rad_s * Math.max(0, dt);
  const stand = (): void => {
    figure.speed = 0;
    if (now > 1e-12) figure.facing = turnToward(figure.facing, headingOf(dino.x - px, dino.z - pz), turn);
    figure.last = now;
  };
  if (!(dt > 0)) {
    figure.last = now;
    return;
  }
  const sepOf = (x: number, z: number): number => (other ? Math.hypot(x - other.x, z - other.z) : Infinity);
  const sepNow = sepOf(px, pz);
  // Beyond flee_m it stands, unless it is under the separation, which it opens (FR-008).
  if (now >= config.flee_m && sepNow >= config.separation_m) {
    stand();
    return;
  }
  // FR-007: the least distance a step may end at, by the clause that holds.
  const reference = Number.isNaN(figure.last) ? now : figure.last;
  const floorM = Math.min(config.safe_m, reference);
  const n = Math.max(1, Math.floor(config.headings));
  let best = -1;
  let bestScore = -Infinity;
  let bestSep = false;
  let bestX = px;
  let bestZ = pz;
  let fallback = -1;
  let fallbackDist = -Infinity;
  let fallbackX = px;
  let fallbackZ = pz;
  for (let i = 0; i < n; i += 1) {
    const theta = (2 * Math.PI * i) / n;
    const ux = Math.cos(theta);
    const uz = Math.sin(theta);
    travel(floor, px, pz, ux, uz, run * dt, dt);
    const qx = at.x;
    const qz = at.z;
    const d = Math.hypot(qx - dino.x, qz - dino.z);
    if (d > fallbackDist) {
      fallbackDist = d;
      fallback = i;
      fallbackX = qx;
      fallbackZ = qz;
    }
    if (d < floorM) continue;
    const s = score(floor, qx, qz, ux, uz, run, dino, walk, config.lookahead_s);
    // FR-008, among the headings FR-007 allows: a step that keeps the separation, or opens the gap, goes first.
    const sep = other === null || sepOf(qx, qz) >= config.separation_m || sepOf(qx, qz) > sepNow;
    if ((sep && !bestSep) || (sep === bestSep && s > bestScore)) {
      best = i;
      bestScore = s;
      bestSep = sep;
      bestX = qx;
      bestZ = qz;
    }
  }
  // Standing, where FR-007 lets it (at or above safe_m now) and no step beats it by the dead band.
  const mayStand = now >= config.safe_m;
  if (mayStand) {
    const standSep = other === null || sepNow >= config.separation_m;
    const standScore = score(floor, px, pz, 0, 0, 0, dino, walk, config.lookahead_s);
    if (best < 0 || (standSep === bestSep && standScore + DEAD_BAND_MPS * dt >= bestScore) || (standSep && !bestSep)) {
      stand();
      return;
    }
  }
  let i = best;
  let qx = bestX;
  let qz = bestZ;
  if (i < 0) {
    // None allowed: the heading that loses least.
    i = fallback;
    qx = fallbackX;
    qz = fallbackZ;
  }
  const moved = Math.hypot(qx - px, qz - pz);
  const theta = (2 * Math.PI * i) / n;
  figure.x = qx;
  figure.z = qz;
  figure.speed = moved / dt;
  figure.heading = headingOf(Math.cos(theta), Math.sin(theta));
  figure.facing = turnToward(figure.facing, figure.heading, turn);
  figure.last = Math.hypot(qx - dino.x, qz - dino.z);
}

/** One frame of a figure walking home at the walking speed, straight, sliding (FR-002): true once it is there, its
 *  facing its home's. */
export function walkHome(
  floor: WalkableFloor,
  figure: Runner,
  home: { readonly x: number; readonly z: number; readonly heading: number },
  walk: number,
  config: ChaseConfig,
  dt: number,
): boolean {
  const turn = config.turn_rate_rad_s * Math.max(0, dt);
  const dx = home.x - figure.x;
  const dz = home.z - figure.z;
  const d = Math.hypot(dx, dz);
  if (d <= 1e-3) {
    figure.x = home.x;
    figure.z = home.z;
    figure.speed = 0;
    figure.facing = turnToward(figure.facing, home.heading, turn);
    return figure.facing === home.heading;
  }
  if (!(dt > 0)) return false;
  const reach = Math.min(d, walk * dt);
  travel(floor, figure.x, figure.z, dx / d, dz / d, reach, dt);
  const moved = Math.hypot(at.x - figure.x, at.z - figure.z);
  figure.x = at.x;
  figure.z = at.z;
  figure.speed = moved / dt;
  figure.heading = headingOf(dx, dz);
  figure.facing = turnToward(figure.facing, figure.heading, turn);
  // Stuck against an edge on the way: put it home (a cut), so the run always ends (SC-002).
  if (moved < 1e-9 && d > 1e-3) {
    figure.x = home.x;
    figure.z = home.z;
  }
  figure.last = Number.NaN;
  return false;
}
