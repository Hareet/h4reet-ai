// The UI words' closed keys (spec 004; FR-029, FR-035, FR-048, FR-060, FR-063; R-05; data-model.md §6.3;
// contracts/room-data-files.md §9): every key `apps/web/room/ui-words.yaml` must hold, each with exactly its slots. The
// compositor refuses a missing key or a value whose slots differ (RT12), and any key that is neither one of these nor
// a data label, `label.<name>` (RD2). A slot is filled at run time with a live value, never with data: amounts are live
// values, so no UI word holds a digit outside a slot (RT3, FR-048).

/** The slots a UI word may hold: `{time}`, `{amount}`, and `{name}`. */
export const SLOTS = ["time", "amount", "name"] as const;
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
  "draft.badge": [],
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
