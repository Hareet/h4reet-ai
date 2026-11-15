// Spec 024 (FR-001, FR-012; plan.md §5.5's key, and its departure at T010): the press's gate, pure. The piece a bite
// is for is the edible placement the figure has reached, by spec 008's reach kernel (walk/reach.ts) over the edible
// placements' frame boxes: the desk and the busy sign are no selectable's members, so the selectables' reach never
// names them. The press is taken only while eatingAvailable holds for that piece (eat/available.ts).
import type { RoomScene } from "../compose/bundle";
import type { Pose } from "../walk/movement";
import { reach } from "../walk/reach";
import type { ReachOptions, ReachTarget } from "../walk/reach";
import { eatingAvailable } from "./available";
import type { EatAvailability } from "./available";
import type { Meal } from "./meal";

/** Each edible placement, in scene order, with its frame box's floor-plane rectangle. */
export function edibleTargets(part: Pick<RoomScene, "placements">): ReachTarget[] {
  return part.placements
    .filter((p) => p.edible !== null)
    .map((p) => ({
      id: p.id,
      rects: [{ x0: p.frame_box.min[0], x1: p.frame_box.max[0], z0: p.frame_box.min[2], z1: p.frame_box.max[2] }],
    }));
}

/** The edible placement the figure reaches at its pose, or null. */
export function edibleReach(
  pose: Pick<Pose, "x" | "z" | "heading">,
  targets: readonly ReachTarget[],
  options: ReachOptions,
): string | null {
  return reach(pose, targets, options);
}

/** The availability at `piece`, an edible placement's ID or null; `model` says whether a placement shows its model. A
 *  piece the meal doesn't hold yet hasn't been split, so all its chunks stand: it can be bitten while nothing flies. */
export function availabilityFor(
  base: Omit<EatAvailability, "reached">,
  piece: string | null,
  meal: Meal,
  model: (id: string) => boolean,
): EatAvailability {
  const canBite = (id: string): boolean => (meal.has(id) ? meal.canBite(id) : !meal.flying());
  return {
    ...base,
    reached: piece === null ? null : { edible: true, model: model(piece), canBite: canBite(piece) },
  };
}

/** The piece a press bites, or null when the press is ignored. */
export function eatTarget(
  base: Omit<EatAvailability, "reached">,
  piece: string | null,
  meal: Meal,
  model: (id: string) => boolean,
): string | null {
  return piece !== null && eatingAvailable(availabilityFor(base, piece, meal, model)) ? piece : null;
}
