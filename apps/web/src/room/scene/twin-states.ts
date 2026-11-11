// The twin's states (spec 016; FR-019 to FR-024; plan.md R-08; contracts/twin-states.md §2): the closed lists the scene's
// twin block, the compositor, and the room share. The state machine itself is pure, reads only the clock it is given,
// and imports nothing from three.js, so the 2D room and the build can import its lists without the 3D chunk.

/** The twin's clip roles, by their files' names under assets/twin/, in the closed list's order (FR-009). */
export const TWIN_CLIP_ROLES = ["idle", "talking", "listening", "greeting", "desk-lean"] as const;
export type TwinClipRole = (typeof TWIN_CLIP_ROLES)[number];

/** The twin's states, in FR-021's order of precedence. */
export const TWIN_STATES = ["arriving", "answering", "listening", "resting", "present"] as const;
export type TwinState = (typeof TWIN_STATES)[number];

/** The state-to-clip map's defaults (FR-020; Clarifications, Q1): the greeting, talking, listening, the lean, the idle. */
export const TWIN_CLIPS_DEFAULT: Readonly<Record<TwinState, TwinClipRole>> = Object.freeze({
  arriving: "greeting",
  answering: "talking",
  listening: "listening",
  resting: "desk-lean",
  present: "idle",
});

export const isTwinClipRole = (value: string): value is TwinClipRole =>
  (TWIN_CLIP_ROLES as readonly string[]).includes(value);
export const isTwinState = (value: string): value is TwinState => (TWIN_STATES as readonly string[]).includes(value);
