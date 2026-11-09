// The narration's part of room-data.json (spec 002, data-model.md §3 and §5; contracts/narration.md §3 and §4): what
// build/narration.ts writes under each published resume item and the display reads. Pure data, no DOM and no Node, so
// both sides share it.
//
// Each item carries `narration: {engineer, non-engineer}`, one entry per path:
//   {words, approved, source, sha256}  the script's words with its slots filled; approved false for a draft, which only
//                                      a drafts build (ROOM_DRAFTS=1) publishes, under a "Draft" label;
//   null                               a draft a build without drafts left out: the item shows no narration.

/** The visitor's two paths (FR-002), one script for each per item (FR-012, FR-016). */
export const NARRATION_PATHS = ["engineer", "non-engineer"] as const;
export type NarrationPath = (typeof NARRATION_PATHS)[number];

export interface Narration {
  words: string;
  approved: boolean;
}

/** An item's published scripts, by path; a path the build left out has none. */
export type ItemNarration = Partial<Record<NarrationPath, Narration>>;

/** Every published item's narration, by item ID. */
export type RoomNarration = ReadonlyMap<string, ItemNarration>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function entry(v: unknown): Narration | null {
  return isObject(v) && typeof v.words === "string" && v.words.trim() !== "" && typeof v.approved === "boolean"
    ? { words: v.words, approved: v.approved }
    : null;
}

/** room-data.json's narration, as the browser fetched it; anything that isn't the build's shape reads as none. */
export function asRoomNarration(json: unknown): RoomNarration {
  const out = new Map<string, ItemNarration>();
  if (!isObject(json) || !Array.isArray(json.sections)) return out;
  for (const section of json.sections) {
    if (!isObject(section) || !Array.isArray(section.items)) continue;
    for (const item of section.items) {
      if (!isObject(item) || typeof item.id !== "string") continue;
      const narration: ItemNarration = {};
      if (isObject(item.narration)) {
        for (const path of NARRATION_PATHS) {
          const found = entry(item.narration[path]);
          if (found) narration[path] = found;
        }
      }
      out.set(item.id, narration);
    }
  }
  return out;
}
