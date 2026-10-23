// The closed vocabulary (spec 004; FR-005, FR-007; R-02, R-05; contracts/room-data-files.md §3.4): the words the room's
// code knows, so data can name them but never add to them. A new word here is a new behaviour, made through the
// lifecycle. The compositor's RI5 keeps the four namespaces' IDs (pieces, placements, selectables, topics) off every
// word below, so code can say `twin` as a role while the placement has an ID of its own, and the source scan, which
// looks for the data's IDs in code, never meets a vocabulary word.

export const BEHAVIOUR_KINDS = ["mount", "frame", "live-face", "glow", "switch", "cable", "selectable"] as const;
export const RENDERERS = ["terminal", "desktop-session", "neon", "chalk", "sign"] as const;
export const SIGNALS = ["tier", "turn-cost"] as const;
/** FR-041's tier values. */
export const TIER_VALUES = [
  "local",
  "cloud",
  "resting",
  "budget",
  "unavailable",
  "unknown",
  "paused",
  "not-live",
] as const;
export const TURN_COST_PARTS = ["call", "visit"] as const;
export const ACTIONS = ["talk", "resume"] as const;
export const ROLES = ["twin", "visitor"] as const;
export const STANDIN_SHAPES = [
  "box",
  "cylinder",
  "capsule",
  "sphere",
  "torus",
  "plane",
  "circle",
  "tube",
  "polygon",
] as const;
export const PRIMITIVES = ["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"] as const;
export const LOOK_METHODS = ["inked-cel", "painted", "flat"] as const;
export const TYPEFACE_USES = ["terminal", "desktop-session", "chalk", "neon", "counters"] as const;
export const GLOW_MOTIONS = ["flicker", "breathe", "steady"] as const;
export const REGION_SOURCES = ["resume_titles"] as const;
export const LIVE_SWITCHES = ["off", "site"] as const;

export type BehaviourKind = (typeof BEHAVIOUR_KINDS)[number];
export type Renderer = (typeof RENDERERS)[number];
export type Signal = (typeof SIGNALS)[number];
export type TierValue = (typeof TIER_VALUES)[number];
export type TurnCostPart = (typeof TURN_COST_PARTS)[number];
export type Action = (typeof ACTIONS)[number];
export type Role = (typeof ROLES)[number];
export type StandinShape = (typeof STANDIN_SHAPES)[number];
export type Primitive = (typeof PRIMITIVES)[number];
export type LookMethod = (typeof LOOK_METHODS)[number];
export type TypefaceUse = (typeof TYPEFACE_USES)[number];
export type GlowMotion = (typeof GLOW_MOTIONS)[number];
export type RegionSource = (typeof REGION_SOURCES)[number];
export type LiveSwitch = (typeof LIVE_SWITCHES)[number];

/** Every word of every list, once: what RI5 refuses as an ID. */
export const VOCABULARY: ReadonlySet<string> = new Set<string>([
  ...BEHAVIOUR_KINDS,
  ...RENDERERS,
  ...SIGNALS,
  ...TIER_VALUES,
  ...TURN_COST_PARTS,
  ...ACTIONS,
  ...ROLES,
  ...STANDIN_SHAPES,
  ...PRIMITIVES,
  ...LOOK_METHODS,
  ...TYPEFACE_USES,
  ...GLOW_MOTIONS,
  ...REGION_SOURCES,
  ...LIVE_SWITCHES,
]);

export function isVocabulary(word: string): boolean {
  return VOCABULARY.has(word);
}
