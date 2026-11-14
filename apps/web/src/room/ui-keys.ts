// The UI words' closed keys (spec 004; FR-029, FR-035, FR-048, FR-060, FR-063; R-05; data-model.md §6.3;
// contracts/room-data-files.md §9): every key `apps/web/room/ui-words.yaml` must hold, each with exactly its slots. The
// compositor refuses a missing key or a value whose slots differ (RT12), and any key that is neither one of these nor
// a data label, `label.<name>` (RD2). A slot is filled at run time with a live value, never with data: amounts are live
// values, so no UI word holds a digit outside a slot (RT3, FR-048).

/** The slots a UI word may hold: `{time}`, `{amount}`, and `{name}`; since spec 012 (its FR-051), the loader's live
 *  counts, `{done}`, `{total}`, and `{n}`. */
export const SLOTS = ["time", "amount", "name", "done", "total", "n"] as const;
export type Slot = (typeof SLOTS)[number];

export const UI_KEYS = {
  // The laptop's state sentence for each tier value, about the machine (FR-035, FR-043).
  "tier.local": [],
  "tier.cloud": [],
  "tier.resting": [],
  "tier.budget": [],
  "tier.unavailable": [],
  "tier.unknown": [],
  "tier.paused": [],
  "tier.not-live": [],
  // "Pause the room", and "Paused at {time}" in the text copy (FR-060).
  "pause.button": [],
  "pause.paused_at": ["time"],
  // The neon sign: its word, its second line, the counters' labels and readings, and its marks (FR-046 to FR-049).
  "sign.word": [],
  "sign.second_line": [],
  "sign.call_label": [],
  "sign.visit_label": [],
  "sign.no_call_yet": [],
  "sign.unavailable": [],
  "sign.local": ["amount"],
  "sign.estimated": ["amount"],
  "sign.at_least": ["amount"],
  "sign.not_affiliated": [],
  "sign.test": [],
  "sign.sample": [],
  // The text copy, "Around the room" (FR-031, FR-063).
  "around.heading": [],
  "around.illustration": [],
  "around.call": ["amount"],
  "around.visit": ["amount"],
  // The "In the room" list and the toolbar (FR-063, FR-065; Amendment C9).
  "list.heading": [],
  "list.resume_action": [],
  "toolbar.credits": [],
  // A stand-in's label, the placeholder note, and the drafts' badge (FR-013, FR-029, FR-030).
  "standin.label": ["name"],
  "standin.note": [],
  // Spec 014 (FR-054, FR-066; Amendment W12; D11): the visitor's figure's placeholder note.
  "standin.avatar": [],
  "draft.badge": [],
  // The stage's line when the 2D drawing can't be drawn (FR-081).
  "flat-failed": [],
  // Spec 008's walking view (FR-059; its plan.md §3.3): the control's two words, the walking view's name and help, and
  // its three announcements, the last with the target's name.
  "walk.enter": [],
  "walk.leave": [],
  "walk.region": [],
  "walk.help": [],
  "walk.entered": [],
  "walk.left": [],
  "walk.target": ["name"],
  // Spec 009's stand-in line (its FR-013, FR-039): in the stage's note and first in "Around the room" while the twin's
  // figure shows anything but the twin's own avatar. It states nothing about the Author but that the figure isn't the
  // Author's likeness.
  "twin.stand_in": [],
  // Spec 026 (FR-024; plan.md R-10): the petting's line in the polite live region, said once as it starts.
  "figures.pet_note": [],
  // Spec 005's HUD (its FR-023, FR-028, FR-065): the conversation log's header button, and the larger view's two words.
  "hud.log_toggle": [],
  "talk.larger": [],
  "talk.smaller": [],
  // Spec 005's full screen (its FR-005, FR-036, FR-039): the control's two words, a refusal, and the walking view's
  // words while in full screen.
  "fullscreen.enter": [],
  "fullscreen.leave": [],
  "fullscreen.refused": [],
  "walk.help_fullscreen": [],
  "walk.entered_fullscreen": [],
  // Spec 012's loader (its FR-016, FR-030, FR-037, FR-051; D8): its heading, its stage lines, its two end lines, and its
  // hints' label, position, and three controls. None states anything about the Author.
  "loading.heading": [],
  "loading.code": [],
  "loading.pieces": ["done", "total"],
  "loading.finishing": [],
  "loading.ready": [],
  "loading.cut_short": [],
  "hints.label": [],
  "hints.position": ["n", "total"],
  "hints.pause": [],
  "hints.play": [],
  "hints.previous": [],
  "hints.next": [],
  // Spec 018's split HUD: the list's label and the panel's close, the key caps' names, and the three stats' labels and tier words.
  "hud.select": [],
  "hud.back": [],
  "hud.close": [],
  "key.esc": [],
  "key.enter": [],
  "stat.serving": [],
  "stat.call": [],
  "stat.visit": [],
  "stat.unknown": [],
  "stat.tier.local": [],
  "stat.tier.cloud": [],
  "stat.tier.resting": [],
  "stat.tier.budget": [],
  "stat.tier.unavailable": [],
  "stat.tier.unknown": [],
  // Spec 025 (FR-025; plan.md R-07): the run's start and end in the polite live region, by the figures that move.
  "chase.started_both": [],
  "chase.started_twin": [],
  "chase.started_dog": [],
  "chase.ended_both": [],
  "chase.ended_twin": [],
  "chase.ended_dog": [],
} as const satisfies Record<string, readonly Slot[]>;

export type UiKey = keyof typeof UI_KEYS;

export function isUiKey(key: string): key is UiKey {
  return Object.hasOwn(UI_KEYS, key);
}

/** A label the data references from a placement, a face binding, or a switch: `label.` and a name in the ID grammar. */
export const LABEL_KEY = /^label\.[a-z][a-z0-9-]{1,40}$/;

/** The slots a UI word's text holds, in order, as many times as it holds each: `{` a lowercase name `}`. */
export function slotsIn(text: string): string[] {
  return [...text.matchAll(/\{([a-z][a-z0-9_]*)\}/g)].map((m) => m[1] ?? "");
}

/**
 * A UI word as the room shows it, from the index's words (contracts/room-bundle.md §3.1, slots unfilled): its slots
 * filled from the values given, which are the room's own (a label's word, a live value), never the visitor's words;
 * null when the index lacks the key or a value for one of its slots.
 */
export function uiWord(
  ui: Readonly<Record<string, string>>,
  key: string,
  slots: Readonly<Partial<Record<Slot, string>>> = {},
): string | null {
  const text = Object.hasOwn(ui, key) ? ui[key] : undefined;
  if (text === undefined) return null;
  const value = (name: string): string | undefined => (Object.hasOwn(slots, name) ? slots[name as Slot] : undefined);
  if (slotsIn(text).some((name) => value(name) === undefined)) return null;
  return text.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name: string) => value(name) ?? "");
}
