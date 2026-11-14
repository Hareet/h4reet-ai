// RA, the room's avatars (spec 009; FR-009, FR-014, FR-038; plan.md §3.5, R-12): each avatar's folder under
// assets/visitors/<id>/, as build/room/avatars.ts reads it once a compose:
// - RA1, a model or clip its folder's records.json doesn't record, records with another kind than `avatar` or
//   `animation`, or records with another SHA-256;
// - RA2, a file the GLB reader can't read (as RX1 and RX2 read it, READ_PAST aside), a clip with no animation, or a
//   clip whose channels move a node its model's raw names lack;
// - RA3, the twin's stand-in's model recorded as a likeness, or from a photo;
// - RA4, a file over main's per_asset cap for its kind, as spec 003's F2 measures it.
// Each is lenient: a strict build refuses, and a lenient one prints it prefixed `warn` and leaves the file out, its figure
// on its fallback, so `make up` builds. RA5, a file with no role, is the report's alone (report.ts), as RG8 is. A
// reason names keys and figures, never a value from the data. The stand-in outside the table is RI8's (ri.ts).
// Spec 016 (its FR-009, FR-015, FR-055; contracts/twin-data.md §7): RA1, RA2, and RA4 extend to the twin's files under
// assets/twin/, by their kinds (`avatar`, `animation`, `still`); RA5 to a file there with no role; and RA6, the twin's
// files without an approval in main's likeness approvals naming its model's current SHA-256 with a non-empty line,
// which leaves every file of the twin out of a lenient build. avatars.ts's readTwin reads them once a compose.
// Spec 020 (its FR-002; plan.md R-01): RA9, a visitor's model recorded as a likeness or from a photo (the stand-in aside,
// RA3's) without an approval in main's likeness approvals naming its current SHA-256 with a non-empty line, which leaves
// the avatar's files out of a lenient build, its figure on the cut-out. avatars.ts's readAvatars reads it.
// RA7 (spec 016, FR-029, FR-030; contracts/twin-data.md §7; SC-017): the scene's lean, measured from the resolved
// placements, in the twin placement's frame: the desk's origin `behind_m` behind the twin's root along its facing, within
// 1 cm; the desk facing as the twin faces, within 1°; and the desk's top reaching at least `right_m` to the twin's right
// of its root (its −x, glTF's), from within 5 cm of the root, so the forearm and hand lie on it (the hand-back's figures).
// The root's height and its side position along the desk aren't held: the twin may stand at the desk's end, the desk
// behind and to its right, as the room's does. Lenient: a lenient build leaves the lean out, the twin resting in its idle.
// RA8 (spec 016; plan.md R-19; the Author's lookdev, T079): the twin's own model, at rest and in each clip it plays,
// sampled every 1/30 s and skinned as three skins it (../reach.ts), reaching past a wall of the shell: a side wall its
// side-wall anchors stand on, or its back. One finding a source and wall, at the twin placement's offset. Lenient: a
// lenient build warns and keeps the twin, since nothing in the bundle stands on it; a strict one refuses.
import { DEG, invert, origin, transformDirection, transformPoint } from "../../../src/room/compose/math";
import type { Vec3 } from "../../../src/room/compose/math";
import { avatarsOf, twinOf } from "../avatars";
import { REACH_FPS, sourceName, twinReachOf } from "../reach";
import type { Scene } from "../schema";
import type { Context, Family } from "./family";
import { geometryOf } from "./rg";
import type { Geometry } from "./rg";

/** The lean's measures, for RA7 and the report: the desk's origin's offset from the spot, in metres; the turn between
 *  their facings, in degrees; and the desk's top to the twin's right of its root, in metres. Null without a lean, or
 *  where the placements don't resolve. */
export interface LeanMeasure {
  readonly off_m: number;
  readonly turn_deg: number;
  readonly right_m: number;
  /** How near the root the desk's top begins on the twin's right, in metres (0 where it passes the root). */
  readonly gap_m: number;
}

/** The scene's lean measured (FR-029), over a compose's geometry. */
export function leanMeasure(scene: Scene | null | undefined, g: Geometry | null): LeanMeasure | null {
  const lean = scene?.figures.twin?.lean;
  if (!scene || !lean || !g) return null;
  const twin = scene.placements.find((p) => p.role === "twin");
  const desk = scene.placements.find((p) => p.id === lean.against);
  const tw = twin && g.resolved.world.get(twin.id);
  const dw = desk && g.resolved.world.get(desk.id);
  const entry = desk && g.pieces.get(desk.piece);
  const inverse = tw ? invert(tw) : null;
  if (!tw || !dw || !entry || !inverse) return null;
  const at = transformPoint(inverse, origin(dw));
  const off = Math.hypot(at[2] + lean.behind_m, 0);
  const facing = transformDirection(inverse, transformDirection(dw, [0, 0, 1]));
  const turn = Math.abs(Math.atan2(facing[0], facing[2])) / DEG;
  const { min, max } = entry.origin.bounds;
  const corners: Vec3[] = [
    [min[0], max[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], max[1], max[2]],
  ];
  const xs = corners.map((c) => transformPoint(inverse, transformPoint(dw, c))[0]);
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  return { off_m: off, turn_deg: turn, right_m: Math.max(0, -left), gap_m: Math.max(0, -right) };
}

/** RA7 over the scene's lean. */
function leanCheck(ctx: Context): void {
  const scene = ctx.room.scene;
  const lean = scene?.value.figures.twin?.lean;
  if (!scene || !lean) return;
  const m = leanMeasure(scene.value, geometryOf(ctx));
  if (m === null) return;
  const at = (key: string): string => ctx.path("figures", "twin", "lean", key);
  if (m.off_m > 0.01)
    ctx.report(
      "RA7",
      scene.file,
      at("behind_m"),
      `the desk's origin is ${(m.off_m * 100).toFixed(1)} cm off behind_m behind the twin's root, over 1 cm`,
    );
  if (m.turn_deg > 1)
    ctx.report("RA7", scene.file, at("against"), `the desk faces ${m.turn_deg.toFixed(1)}° from the twin, over 1°`);
  if (m.right_m < lean.right_m || m.gap_m > 0.05)
    ctx.report(
      "RA7",
      scene.file,
      at("right_m"),
      `${m.right_m.toFixed(2)} m of the desk's top to the twin's right, from ${(m.gap_m * 100).toFixed(1)} cm off its ` +
        "root: under right_m, or starting over 5 cm from it",
    );
}

/** RA8 over the twin's reach: each source and wall it passes. */
function reachCheck(ctx: Context): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const reach = twinReachOf(ctx.tree, scene.value, twinOf(ctx.tree, ctx.policy, scene.value), geometryOf(ctx));
  if (!reach) return;
  const index = scene.value.placements.findIndex((p) => p.role === "twin");
  for (const s of reach.sources)
    for (const w of s.walls) {
      const wall = reach.walls.find((x) => x.name === w.wall);
      if (!wall || !(w.reach > wall.at)) continue;
      ctx.report(
        "RA8",
        scene.file,
        ctx.path("placements", index, "mount", "offset"),
        `the twin's ${sourceName(s.source)} reaches ${((w.reach - wall.at) * 100).toFixed(1)} cm past the shell's ` +
          `${w.wall} at ${w.at_s.toFixed(2)} s, sampled every 1/${REACH_FPS} s`,
      );
    }
}

/** RA: every rule of the family, in its order: the visitors' folders, then the twin's, then its lean, then its reach. */
export const ra: Family = (ctx) => {
  const scene = ctx.room.scene?.value ?? null;
  for (const p of avatarsOf(ctx.tree, ctx.policy, scene).problems) ctx.report(p.rule, p.file, p.path, p.reason);
  for (const p of twinOf(ctx.tree, ctx.policy, scene).problems) ctx.report(p.rule, p.file, p.path, p.reason);
  leanCheck(ctx);
  reachCheck(ctx);
};
