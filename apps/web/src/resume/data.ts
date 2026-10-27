// The resume's part of room-data.json (spec 002, data-model.md §5; contracts/resume-source.md §4 and §5): what
// build/content.ts writes and the interactive resume reads. Pure data, no DOM and no Node, so both sides share it.
//
// resume_state says what the build published:
//   approved  the source's hash is on main's approvals: its header and items, no banner;
//   draft     a draft, built with ROOM_DRAFTS=1 (dev and dev-cpu): its header and items, under "Draft, not approved";
//   withheld  a draft, built without drafts: no header and no items, only the notice that it's a draft;
//   absent    no source in the tree.
// Each published item, and the header, names its source file and that file's SHA-256, so the gate's content check
// can trace every published word to an approval.

export type ResumeState = "approved" | "draft" | "withheld" | "absent";

export interface RoomResumeItem {
  id: string;
  text: string;
  source?: string;
  sha256?: string;
}

export interface RoomResumeSection {
  id: string;
  title: string;
  items: RoomResumeItem[];
}

export interface RoomResumeHeader {
  name: string;
  lines: string[];
  source?: string;
  sha256?: string;
}

export interface RoomResume {
  resume_state: ResumeState;
  header: RoomResumeHeader | null;
  sections: RoomResumeSection[];
}

export const ABSENT: RoomResume = { resume_state: "absent", header: null, sections: [] };

const STATES: readonly ResumeState[] = ["approved", "draft", "withheld", "absent"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";

function item(v: unknown): RoomResumeItem | null {
  return isObject(v) && isString(v.id) && isString(v.text) ? { id: v.id, text: v.text } : null;
}

function section(v: unknown): RoomResumeSection | null {
  if (!isObject(v) || !isString(v.id) || !isString(v.title) || !Array.isArray(v.items)) return null;
  const items = v.items.map(item);
  return items.every((i) => i !== null) ? { id: v.id, title: v.title, items: items as RoomResumeItem[] } : null;
}

/** room-data.json's resume, as the browser fetched it; anything that isn't the build's shape reads as absent. */
export function asRoomResume(json: unknown): RoomResume {
  if (!isObject(json) || !STATES.includes(json.resume_state as ResumeState)) return ABSENT;
  const state = json.resume_state as ResumeState;
  if (state === "withheld" || state === "absent") return { resume_state: state, header: null, sections: [] };
  const h = json.header;
  if (!isObject(h) || !isString(h.name) || !Array.isArray(h.lines) || !h.lines.every(isString)) return ABSENT;
  if (!Array.isArray(json.sections)) return ABSENT;
  const sections = json.sections.map(section);
  if (!sections.every((s) => s !== null)) return ABSENT;
  return {
    resume_state: state,
    header: { name: h.name, lines: h.lines as string[] },
    sections: sections as RoomResumeSection[],
  };
}
