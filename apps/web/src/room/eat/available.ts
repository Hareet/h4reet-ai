// Spec 024 (FR-001, FR-009; US3; plan.md §5.6): whether the dinosaur can eat now. One pure predicate, read by the key,
// the "Eat" tile, and the eating's tick, so every degraded path turns all three off together.

export interface EatAvailability {
  /** The room's view: the eating is the 3D walking view's only. */
  readonly view: "3d" | "2d";
  /** The visitor's chosen avatar. */
  readonly avatar: string | null;
  /** The visitor's figure shows its model, not its flat fallback. */
  readonly figureModel: boolean;
  /** The piece the figure has reached (spec 008), or null. */
  readonly reached: {
    /** Its placement has `edible`. */
    readonly edible: boolean;
    /** It shows its model, not its stand-in. */
    readonly model: boolean;
    /** The meal has a chunk FR-005 lets it eat, and no bite is in flight. */
    readonly canBite: boolean;
  } | null;
  readonly paused: boolean;
  /** The loader shows (FR-009). */
  readonly loading: boolean;
  /** The eating turned itself off for the visit (Degraded Mode). */
  readonly failed: boolean;
}

export const EATER = "dinosaur";

export function eatingAvailable(s: EatAvailability): boolean {
  return (
    s.view === "3d" &&
    s.avatar === EATER &&
    s.figureModel &&
    s.reached !== null &&
    s.reached.edible &&
    s.reached.model &&
    s.reached.canBite &&
    !s.paused &&
    !s.loading &&
    !s.failed
  );
}
