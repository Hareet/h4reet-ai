// The petting's tunables (spec 026; FR-005, FR-007, FR-008; plan.md §3, R-08): scene data in `figures.pet`, these its
// defaults. Pure numbers with no import, so the build's schema (build/room/schema.ts) and the room read the same ones
// without three.js. Placeholders, the Author's look to set.

/** The reach's tunables (spec FR-007, FR-008; plan §3): `crouch_max_m` and `lean_max_deg` are measured by T003 on both
 *  rigs (Q162, Q212) and recorded in plan §3: the crouch within the thighs' level, the lean the larger need at that
 *  crouch plus 5°. */
export const PET_REACH_DEFAULTS = Object.freeze({
  crouch_max_m: 0.35,
  lean_max_deg: 66,
  stroke_m: 0.05,
  stroke_n: 3,
  pet_s: 3.5,
  elbow_deg: 150,
});

/** The pet block's tunables (spec "Pet block"; plan §3). */
export interface PetConfig {
  readonly reach_m: number;
  readonly cooldown_s: number;
  readonly turn_max_deg: number;
  readonly crouch_max_m: number;
  readonly lean_max_deg: number;
  readonly stroke_m: number;
  readonly stroke_n: number;
  readonly pet_s: number;
  readonly elbow_deg: number;
}

export const PET_DEFAULTS: PetConfig = Object.freeze({
  reach_m: 0.55,
  cooldown_s: 20,
  turn_max_deg: 60,
  ...PET_REACH_DEFAULTS,
});

/** `turn_max_deg`'s ceiling, 90°: spec 025's director turns the twin no further (chase.ts's FACE_MAX_RAD). */
export const PET_TURN_MAX_DEG_CEILING = 90;
