// RS, switches and claims (spec 004; FR-005, FR-020, FR-040, FR-043; R-04, R-22; data-model.md §3, §4.4;
// contracts/room-data-files.md §4, §5.4, §13.4, §17). A switch shows one pose of its piece for each value of the tier,
// and a piece that claims values names, for each pose, the value it claims or nothing. RS1's signal and RS6's sag,
// radius, and drop are checks the schema holds (schema.ts), so the loader refuses a scene that breaks one; the rest are
// here: RS1 the cases against the tier's values; RS2 the poses against the claims, a placement of a switch's piece, two
// poses claiming one value, and claims that give no pose local or none cloud, by which alone RS3 to RS5 know the
// plugged and the cloud poses (FR-043); RS3 a case showing a pose that claims another value, or passing over the pose
// that claims its own; RS4 the six values FR-043 gives one pose not sharing one that claims nothing; RS5 a pose
// sitting where the local pose sits; RS6 a cable from an anchor the switch's piece lacks.
// Readings: a pose the claims don't name is RS2's alone, so RS3 and RS5 judge only the poses the claims name; RS4's
// shared pose is the one most of the six values show, ties to the earliest in §13.4's order, and each value showing
// another is reported where its pose comes from, its case or the default; RS5 compares two poses where the world puts
// them (rg.ts's `mountedWorld`), by the distance between their origins and the angle between their frames, so a pose
// on another placement or anchor that lands where the plugged pose sits is refused too (§17). A pose, a case, or a
// piece that doesn't resolve is RI4's, and a piece whose file the loader refused is that file's finding: neither is
// judged again.
// No reason holds a pose's name or any other value from the data.
import { length, origin, sub } from "../../../src/room/compose/math";
import type { Mat4 } from "../../../src/room/compose/math";
import { TIER_VALUES } from "../../../src/room/compose/vocabulary";
import type { TierValue } from "../../../src/room/compose/vocabulary";
import type { CatalogEntry, Switch } from "../schema";
import type { Context, Family } from "./family";
import { geometryOf, mountedWorld } from "./rg";

/** The six values FR-043 and Q2 give one shared pose, in contracts/room-data-files.md §13.4's order. */
const SHARED: readonly TierValue[] = ["unknown", "paused", "not-live", "resting", "budget", "unavailable"];
const SIX = "unknown, paused, not-live, resting, budget, and unavailable";
/** RS5's tolerances: offsets within 1 mm, turns within 1°. */
const SAME_OFFSET_M = 0.001;
const SAME_TURN_DEG = 1;
/** Room for floating point at those bounds. */
const EPS = 1e-9;

const has = (o: object, key: string): boolean => Object.hasOwn(o, key);
const isTier = (value: string): value is TierValue => (TIER_VALUES as readonly string[]).includes(value);

/** A switch as RS judges it: its index, and its piece's claims, pose to value or null, once the piece resolves. */
interface Judged {
  readonly sw: Switch;
  readonly i: number;
  /** The switch's piece, when its catalog entry loaded. */
  readonly piece: CatalogEntry | undefined;
  /** Its claims; null for a piece that claims nothing, or one that doesn't resolve. */
  readonly claims: ReadonlyMap<string, TierValue | null> | null;
}

/** RS1: a case for a value the tier doesn't have; for a piece that claims values, a value without a case, or a
 *  default; for one that claims nothing, a value that neither a case nor the default covers. */
function cases(ctx: Context, file: string, { sw, i, piece, claims }: Judged): void {
  for (const value of Object.keys(sw.cases))
    if (!isTier(value))
      ctx.report("RS1", file, ctx.path("switches", i, "cases", value), "a case for a value the tier doesn't have");
  if (!piece) return;
  const at = ctx.path("switches", i, "cases");
  if (claims) {
    for (const value of TIER_VALUES)
      if (!has(sw.cases, value)) ctx.report("RS1", file, at, `no case for the tier value ${value}`);
    if (sw.default !== undefined)
      ctx.report("RS1", file, ctx.path("switches", i, "default"), "a default, where the switch's piece claims values");
  } else if (sw.default === undefined) {
    for (const value of TIER_VALUES)
      if (!has(sw.cases, value))
        ctx.report("RS1", file, at, `neither a case nor the default covers the tier value ${value}`);
  }
}

/** RS2: a pose the piece's claims don't name, and a pose they name that the switch lacks. */
function poses(ctx: Context, file: string, { sw, i, claims }: Judged): void {
  if (!claims) return;
  for (const name of Object.keys(sw.poses))
    if (!claims.has(name))
      ctx.report("RS2", file, ctx.path("switches", i, "poses", name), "a pose its piece's claims don't name");
  for (const name of claims.keys())
    if (!has(sw.poses, name))
      ctx.report("RS2", file, ctx.path("switches", i, "poses", name), "a pose its piece's claims name, missing here");
}

/** RS2: a placement that places a piece a switch places. */
function placed(ctx: Context, file: string, judged: readonly Judged[]): void {
  const switched = new Set(judged.map((j) => j.sw.piece));
  ctx.room.scene?.value.placements.forEach((p, k) => {
    if (switched.has(p.piece)) ctx.report("RS2", file, ctx.path("placements", k, "piece"), "places a switch's piece");
  });
}

/** The two values whose poses FR-043 names: the plugged pose, which only local shows, and the cloud pose, which only
 *  cloud shows. */
const NAMED: readonly { readonly value: TierValue; readonly pose: string }[] = [
  { value: "local", pose: "the plugged pose" },
  { value: "cloud", pose: "the cloud pose" },
];

/** RS2, in the catalog: two poses claiming one value; claims that give no pose local, or none cloud, since RS3 to RS5
 *  know the plugged and the cloud poses only by those claims. A piece that claims nothing is left to its default. */
function claimedTwice(ctx: Context): void {
  for (const { file, value } of ctx.room.catalog) {
    if (!value.claims) continue;
    const seen = new Set<TierValue>();
    for (const [name, claim] of Object.entries(value.claims.poses)) {
      if (claim === null) continue;
      if (seen.has(claim))
        ctx.report("RS2", file, ctx.path("claims", "poses", name), `claims ${claim}, as another pose does`);
      seen.add(claim);
    }
    for (const { value: tier, pose } of NAMED)
      if (!seen.has(tier))
        ctx.report("RS2", file, ctx.path("claims", "poses"), `no pose claims ${tier}, so none is known as ${pose}`);
  }
}

/** RS3: a case showing a pose that claims another value than its own; a pose claiming a value whose case shows
 *  another pose. So only local can show the plugged pose, and only cloud the cloud pose. */
function shown(ctx: Context, file: string, { sw, i, claims }: Judged): void {
  if (!claims) return;
  for (const [value, pose] of Object.entries(sw.cases)) {
    const claim = has(sw.poses, pose) ? claims.get(pose) : undefined;
    if (isTier(value) && claim !== undefined && claim !== null && claim !== value)
      ctx.report("RS3", file, ctx.path("switches", i, "cases", value), `shows a pose that claims ${claim}`);
  }
  for (const [pose, claim] of claims) {
    if (claim === null || !has(sw.poses, pose)) continue;
    const shows = has(sw.cases, claim) ? sw.cases[claim] : undefined;
    if (shows !== undefined && shows !== pose)
      ctx.report(
        "RS3",
        file,
        ctx.path("switches", i, "cases", claim),
        `shows another pose than the one that claims ${claim}`,
      );
  }
}

/** RS4: the six values not all showing one pose, the same, which claims nothing. */
function sharedPose(ctx: Context, file: string, { sw, i, claims }: Judged): void {
  const shows = SHARED.flatMap((value) => {
    const own = has(sw.cases, value) ? sw.cases[value] : undefined;
    if (own !== undefined) return [{ value, pose: own, path: ctx.path("switches", i, "cases", value), own: true }];
    if (sw.default !== undefined)
      return [{ value, pose: sw.default, path: ctx.path("switches", i, "default"), own: false }];
    return [];
  });
  const count = new Map<string, number>();
  for (const s of shows) count.set(s.pose, (count.get(s.pose) ?? 0) + 1);
  let shared: (typeof shows)[number] | undefined;
  for (const s of shows) if (!shared || (count.get(s.pose) ?? 0) > (count.get(shared.pose) ?? 0)) shared = s;
  if (!shared) return;
  for (const s of shows) {
    if (s.pose === shared.pose) continue;
    const reason = `another pose than the one ${SIX} share`;
    ctx.report("RS4", file, s.path, s.own ? `shows ${reason}` : `gives ${s.value} ${reason}`);
  }
  const claim = has(sw.poses, shared.pose) ? claims?.get(shared.pose) : undefined;
  if (claim !== undefined && claim !== null)
    ctx.report("RS4", file, shared.path, `the pose ${SIX} share claims ${claim}, where it claims nothing`);
}

/** The angle between two frames' rotations, in degrees: of the rotation that takes one to the other. */
function angleBetween(p: Mat4, q: Mat4): number {
  let trace = 0;
  for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10] as const) trace += p[k] * q[k];
  return (Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2))) * 180) / Math.PI;
}

/** Two poses that place the piece the same, where the world puts them (mount.ts's World, which carries no scale): their
 *  origins within 1 mm, their frames within 1°, whatever placement and anchor each mounts on. */
function samePlace(a: Mat4, b: Mat4): boolean {
  return length(sub(origin(a), origin(b))) <= SAME_OFFSET_M + EPS && angleBetween(a, b) <= SAME_TURN_DEG + EPS;
}

/** RS5: a pose that claims nothing or cloud on the placement and anchor of the pose that claims local; two poses with
 *  different claims placing the piece the same. So nothing but the local case puts the plug in the port. */
function plugged(ctx: Context, file: string, { sw, i, claims }: Judged): void {
  if (!claims) return;
  const named = Object.entries(sw.poses).filter(([name]) => claims.has(name));
  const claimOf = (name: string): TierValue | null | undefined => claims.get(name);
  const local =
    named.find(([name]) => claimOf(name) === "local" && sw.cases.local === name) ??
    named.find(([name]) => claimOf(name) === "local");
  const onPort = new Set<string>();
  if (local) {
    const [localName, { mount }] = local;
    for (const [name, pose] of named) {
      const claim = claimOf(name);
      if (name === localName || (claim !== null && claim !== "cloud")) continue;
      if (pose.mount.on !== mount.on || pose.mount.anchor !== mount.anchor) continue;
      onPort.add(name);
      ctx.report(
        "RS5",
        file,
        ctx.path("switches", i, "poses", name, "mount"),
        "on the placement and anchor of the pose that claims local",
      );
    }
  }
  // Where the world puts each pose; a mount that doesn't resolve is RI4's or RG1's, and judged with nothing here.
  const g = geometryOf(ctx);
  const worlds = new Map(named.map(([name, pose]) => [name, g ? mountedWorld(g, pose.mount) : null]));
  named.forEach(([a], k) => {
    for (const [b] of named.slice(k + 1)) {
      const [wa, wb] = [worlds.get(a), worlds.get(b)];
      if (claimOf(a) === claimOf(b) || !wa || !wb || !samePlace(wa, wb)) continue;
      // The local pose and one already reported on its port: that finding stands for this pair.
      if ((a === local?.[0] && onPort.has(b)) || (b === local?.[0] && onPort.has(a))) continue;
      const at = b === local?.[0] ? a : b;
      ctx.report(
        "RS5",
        file,
        ctx.path("switches", i, "poses", at, "mount"),
        "places the piece within 1 mm and 1° of a pose with another claim",
      );
    }
  });
}

/** RS6: a cable whose `from` isn't an anchor of the switch's piece. */
function lead(ctx: Context, file: string, { sw, i, piece }: Judged): void {
  if (piece && sw.cable && !has(piece.anchors, sw.cable.from))
    ctx.report("RS6", file, ctx.path("switches", i, "cable", "from"), "not an anchor of the switch's piece");
}

/** RS: every rule of the family, switch by switch, in its order. */
export const rs: Family = (ctx) => {
  claimedTwice(ctx);
  const scene = ctx.room.scene;
  if (!scene) return;
  const pieces = new Map<string, CatalogEntry>();
  for (const c of ctx.room.catalog) if (!pieces.has(c.value.id)) pieces.set(c.value.id, c.value);
  const judged: Judged[] = scene.value.switches.map((sw, i) => {
    const piece = pieces.get(sw.piece);
    const claims = piece?.claims ? new Map(Object.entries(piece.claims.poses)) : null;
    return { sw, i, piece, claims };
  });
  for (const j of judged) {
    cases(ctx, scene.file, j);
    poses(ctx, scene.file, j);
    shown(ctx, scene.file, j);
    sharedPose(ctx, scene.file, j);
    plugged(ctx, scene.file, j);
    lead(ctx, scene.file, j);
  }
  placed(ctx, scene.file, judged);
};
