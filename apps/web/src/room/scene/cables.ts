// The tier switch's cases in 3D (spec 004; FR-020, FR-043, FR-051, FR-058; R-22; contracts/tier-signal.md §2;
// contracts/room-bundle.md §3.2): each pose of each switch its own group, at the pose's mount, holding the switch
// piece's stand-in at its stylized scale (a set model swaps in for it, scene/loader.ts's showModel) and the cable's
// tube, which the room draws at run time along compose/cable.ts's 16 points, from the lead's free end where the pose
// puts it to the desk's back edge, then its short drop, at the charger's stylized scale (FR-051): one tube made per
// pose, when the room is built, and kept, so a change of case makes nothing. Only the plug's placement decides whether
// the cable reaches the port, so moving the laptop, its stand, or the desk needs no re-export (FR-020).
// `apply(value)` shows, for each switch, the case tier.ts's caseFor gives: the pose `local`'s case names only for
// `local`, the pose `cloud`'s only for `cloud`, and any other mapping the shared pose, so a faulty bundle can neither
// plug the laptop in nor leave the room blank (FR-043, FR-062). A pose's `glows` set other placements' glow levels while
// it shows, such as the laptop's charge light, and the levels go back to their pieces' own when another case shows:
// `glow(placement, glow)` reads them, for the glow cards User Story 5 draws (T185).
import { CatmullRomCurve3, Group, Mesh, TubeGeometry, Vector3 } from "three";
import type { Object3D } from "three";

import type { RoomIndex, RoomScene } from "../compose/bundle";
import { cableRun, restPlane } from "../compose/cable";
import type { CableRun } from "../compose/cable";
import { IDENTITY, invert, origin, transformPoint } from "../compose/math";
import type { Mat4, Vec3 } from "../compose/math";
import { anchorWorld, mountWorld } from "../compose/mount";
import type { TierValue } from "../compose/vocabulary";
import { caseFor } from "../signals/tier";
import type { Materials } from "./look";
import { standin } from "./standins";

/** The cable's ink, the 2D drawing's (flat.ts). */
export const CABLE_INK = "#1a1a1a";
/** The tube's segments along its run and around it: two a sampled point, and a hexagon. */
const TUBULAR_SEGMENTS = 32;
const RADIAL_SEGMENTS = 6;
/** The name of a case's tube, beside its `standin` (and a set model's `model`). */
export const CABLE_NODE = "cable";

export interface SwitchCases {
  /** Each switch's cases, by switch and pose: a group at the pose's mount, named `<switch>.<pose>`. */
  readonly groups: ReadonlyMap<string, ReadonlyMap<string, Group>>;
  /** Each case's cable tube, by switch and pose, made once; none for a switch without a cable. */
  readonly tubes: ReadonlyMap<string, ReadonlyMap<string, Mesh>>;
  /** Each tube's run in the world, by switch and pose: compose/cable.ts's, as the tube follows it. */
  readonly runs: ReadonlyMap<string, ReadonlyMap<string, CableRun>>;
  /** The pose a switch shows now; null for no switch of that ID, or none to show. */
  shown(id: string): string | null;
  /** A glow's level now: the shown pose's, while one sets it, else its piece's own. */
  glow(placement: string, glow: string): number;
  /** Shows each switch's case for a tier value, by the claims rule. */
  apply(value: TierValue): void;
}

/** What the cases are built on: buildRoom's placement nodes and their world transforms, and the look's materials. */
export interface CaseContext {
  readonly placements: ReadonlyMap<string, Object3D>;
  readonly world: ReadonlyMap<string, Mat4>;
  readonly materials: Materials;
}

const glowKey = (placement: string, glow: string): string => `${placement}\n${glow}`;

/** Puts an object at a rigid transform of the kernel's: its position and its rotation, at scale 1. */
function place(object: Object3D, m: Mat4): void {
  object.matrix.fromArray(m);
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  object.scale.set(1, 1, 1);
}

/** Builds every switch's cases under their mounts' placements, each showing not-live's case by the claims rule. */
export function buildCases(
  part: Pick<RoomScene, "pieces" | "placements" | "switches">,
  index: Pick<RoomIndex, "switches">,
  ctx: CaseContext,
): SwitchCases {
  const piece = (id: string): RoomScene["pieces"][string] | undefined =>
    Object.hasOwn(part.pieces, id) ? part.pieces[id] : undefined;
  const byId = new Map<string, RoomScene["placements"][number]>();
  for (const p of part.placements) if (!byId.has(p.id)) byId.set(p.id, p);
  /** A placement's anchor frame in the world; null where it doesn't resolve. */
  const anchorAt = (on: string, anchor: string): Mat4 | null => {
    const p = byId.get(on);
    const own = p && piece(p.piece);
    const w = p && ctx.world.get(p.id);
    const at = own && Object.hasOwn(own.anchors, anchor) ? own.anchors[anchor] : undefined;
    return own && w && at ? anchorWorld(w, own.scale, at) : null;
  };

  // Each glow's own level, by placement and glow, which a shown pose's glows override.
  const base = new Map<string, number>();
  for (const p of byId.values())
    for (const [id, g] of Object.entries(piece(p.piece)?.glows ?? {})) base.set(glowKey(p.id, id), g.level);
  const lit = new Map<string, number>();

  const groups = new Map<string, Map<string, Group>>();
  const tubes = new Map<string, Map<string, Mesh>>();
  const runs = new Map<string, Map<string, CableRun>>();
  const cases = new Map<string, RoomIndex["switches"][number]["cases"]>();
  const shown = new Map<string, string | null>();
  for (const sw of part.switches) {
    const own = piece(sw.piece);
    if (!own) throw new Error("buildRoom: a switch's piece isn't in the 3D part");
    const its = index.switches.find((s) => s.id === sw.id)?.cases;
    if (its) cases.set(sw.id, its);
    const poses = new Map<string, Group>();
    const swTubes = new Map<string, Mesh>();
    const swRuns = new Map<string, CableRun>();
    for (const [name, pose] of Object.entries(sw.poses)) {
      const on = byId.get(pose.mount.on);
      const parent = on && ctx.placements.get(on.id);
      const onPiece = on && piece(on.piece);
      const onWorld = on && ctx.world.get(on.id);
      const at =
        onPiece && Object.hasOwn(onPiece.anchors, pose.mount.anchor) ? onPiece.anchors[pose.mount.anchor] : undefined;
      if (!parent || !onPiece || !onWorld || !at) throw new Error("buildRoom: a mount of the 3D part doesn't resolve");
      const world = mountWorld(onWorld, onPiece.scale, at, pose.mount.offset, pose.mount.turn);
      const group = new Group();
      group.name = `${sw.id}.${name}`;
      // Its transform under the placement it mounts on: the mount alone, the parent's world being the placement's.
      place(group, mountWorld(IDENTITY, onPiece.scale, at, pose.mount.offset, pose.mount.turn));
      const shapes = standin(own.standin, ctx.materials);
      shapes.scale.setScalar(own.scale);
      group.add(shapes);

      // The cable: from the lead's free end at this pose to its `to` anchor, kept above its `rest` surface.
      const c = sw.cable;
      const lead = c && Object.hasOwn(own.anchors, c.from) ? own.anchors[c.from] : undefined;
      const to = c && anchorAt(c.to.placement, c.to.anchor);
      const rest = c?.rest ? anchorAt(c.rest.placement, c.rest.anchor) : null;
      const back = invert(world);
      if (c && lead && to && (c.rest === null || rest) && back) {
        const run = cableRun({
          from: origin(anchorWorld(world, own.scale, lead)),
          to: origin(to),
          sag: c.sag,
          radius: c.radius,
          scale: own.scale,
          drop: c.drop,
          rest: rest ? restPlane(rest) : null,
        });
        const points: Vec3[] = run.drop ? [...run.points, run.drop] : [...run.points];
        const path = new CatmullRomCurve3(points.map((p) => new Vector3(...transformPoint(back, p))));
        const tube = new Mesh(
          new TubeGeometry(path, TUBULAR_SEGMENTS, run.radius, RADIAL_SEGMENTS, false),
          ctx.materials.of(CABLE_INK, true),
        );
        tube.name = CABLE_NODE;
        tube.castShadow = tube.receiveShadow = ctx.materials.shaded;
        group.add(tube);
        swTubes.set(name, tube);
        swRuns.set(name, run);
      }
      parent.add(group);
      poses.set(name, group);
    }
    groups.set(sw.id, poses);
    tubes.set(sw.id, swTubes);
    runs.set(sw.id, swRuns);
  }

  function apply(value: TierValue): void {
    lit.clear();
    for (const sw of part.switches) {
      const poses = groups.get(sw.id);
      if (!poses) continue;
      const pose = caseFor(cases.get(sw.id) ?? {}, value, (p) => poses.has(p));
      shown.set(sw.id, pose);
      for (const [name, group] of poses) group.visible = name === pose;
      const own = pose !== null && Object.hasOwn(sw.poses, pose) ? sw.poses[pose] : undefined;
      for (const g of own?.glows ?? []) lit.set(glowKey(g.placement, g.glow), g.level);
    }
  }
  apply("not-live");

  return {
    groups,
    tubes,
    runs,
    shown: (id) => shown.get(id) ?? null,
    glow: (placement, glow) => lit.get(glowKey(placement, glow)) ?? base.get(glowKey(placement, glow)) ?? 0,
    apply,
  };
}
