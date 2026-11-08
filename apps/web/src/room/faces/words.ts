// Each face's words (spec 004; FR-029, FR-030, FR-033, FR-034, FR-061; R-11, R-36): what each region of a bound face
// draws, from the four sources FR-029 allows and nothing else, and the renderers' own word lists, which the text copy
// reads, so the 3D room, the 2D room, and "Around the room" can't differ.
// - Room text, from room-data.json's room_text, which the page fetches once at Enter (app.ts) and reads here: a block's
//   drawn lines, or a sign's outline, published by the build (contracts/room-bundle.md §5); a draft, which only a
//   drafts build publishes, drawn with "Draft".
// - The published resume's section titles, from the same file, for a `resume_titles` region: withheld whenever the
//   resume is (FR-033, Confirmation 11).
// - UI words, from the index: the neon sign's word and second line.
// - Live values: a counter's reading, "cost unavailable" while the room's live configuration has no turn route, as
//   today (FR-048); the channel that reads its turns comes with T266.
// A region whose source has no words, room text not loaded or failed (FR-061) or a block the build withheld, draws
// nothing, and a face none of whose regions has words stays plain, its text-copy entry left out.
import { asRoomResume } from "../../resume/data";
import type { RoomIndex } from "../compose/bundle";
import { regionBox } from "../compose/layout";
import type { Grid } from "../compose/layout";
import { typefaceFor } from "../compose/legibility";
import type { TypefaceUse } from "../compose/vocabulary";
import { uiWord } from "../ui-keys";
import type { DisplayList, Op } from "./display-list";
import { REGISTRY } from "./registry";
import type { OutlineData, RegionInput } from "./registry";

/** How long the page waits before it loads room-data.json again, once, after a load at Enter that failed (R-11). */
export const ROOM_TEXT_RETRY_MS = 10_000;

/** A published block of room text: its state, its drawn lines, and, for a sign, its outline. */
export interface TextBlock {
  readonly id: string;
  readonly state: "approved" | "draft";
  readonly lines: readonly string[];
  readonly outline: OutlineData | null;
}

/** What room-data.json gives the faces: its room text by ID, and the resume's section titles while it's published. */
export interface RoomText {
  readonly blocks: ReadonlyMap<string, TextBlock>;
  readonly titles: { readonly lines: readonly string[]; readonly draft: boolean } | null;
}

/** No room text: what a file without it, or one that isn't the build's shape, reads as. */
export const NO_TEXT: RoomText = { blocks: new Map(), titles: null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function outlineOf(v: unknown): OutlineData | null | false {
  if (v === undefined) return null;
  if (!isObject(v)) return false;
  const { view_box: box, cap_height: cap, advance, paths } = v;
  if (!Array.isArray(box) || box.length !== 4 || !box.every(isNumber)) return false;
  if (!isNumber(cap) || cap <= 0 || !isNumber(advance) || advance <= 0) return false;
  if (!Array.isArray(paths) || paths.length === 0 || !paths.every(isString)) return false;
  const [x, y, w, h] = box as [number, number, number, number];
  if (w <= 0 || h <= 0) return false;
  return { view_box: [x, y, w, h], cap_height: cap, advance, paths: [...(paths as string[])] };
}

function blockOf(v: unknown): TextBlock | null {
  if (!isObject(v) || !isString(v.id) || (v.state !== "approved" && v.state !== "draft")) return null;
  if (!Array.isArray(v.lines)) return null;
  const lines = v.lines.map((l: unknown) => (isObject(l) && isString(l.text) ? l.text : null));
  if (!lines.every((l) => l !== null)) return null;
  const outline = outlineOf(v.outline);
  if (outline === false) return null;
  return { id: v.id, state: v.state, lines: lines as string[], outline };
}

/** room-data.json's room text and the resume's titles, as the page fetched it. A room_text that isn't the build's
 *  shape reads as none, so every face it would word stays plain; the titles follow the resume's own reading. */
export function roomTextOf(json: unknown): RoomText {
  const resume = asRoomResume(json);
  const titles =
    resume.resume_state === "approved" || resume.resume_state === "draft"
      ? { lines: resume.sections.map((s) => s.title), draft: resume.resume_state === "draft" }
      : null;
  const raw = isObject(json) ? json.room_text : undefined;
  const list = isObject(raw) && Array.isArray(raw.blocks) ? raw.blocks : null;
  const blocks = list?.map(blockOf) ?? [];
  if (list === null || !blocks.every((b) => b !== null)) return { blocks: new Map(), titles };
  return { blocks: new Map((blocks as TextBlock[]).map((b) => [b.id, b])), titles };
}

/** What a face's words read of the index. */
export type FaceIndex = Pick<RoomIndex, "ui" | "build" | "live" | "typefaces">;
export type IndexFace = RoomIndex["faces"][number];
type IndexRegion = IndexFace["regions"][number];

/** Where a face's words come from: the index; the room text, null until room-data.json has loaded (or when it
 *  failed); and the family each typeface use draws in now, by default the vendored family and its fallback. */
export interface FaceSources {
  readonly index: FaceIndex;
  readonly text: RoomText | null;
  readonly family?: (use: TypefaceUse) => string;
}

/** The typeface a region draws in, from the index's typefaces; a sign, which draws its lettering's paths, has none, and
 *  its badge takes the page's generic sans-serif. */
function typefaceOf(sources: FaceSources, use: TypefaceUse | null): RegionInput["typeface"] {
  const t = use === null ? undefined : sources.index.typefaces.find((x) => x.use === use);
  const family = use !== null && sources.family ? sources.family(use) : t ? `${t.family}, ${t.fallback}` : "sans-serif";
  return { family, weight: t?.weight ?? 400, capRatio: t?.cap_ratio ?? 0.7 };
}

/** The "Draft" badge, the UI word draft.badge. */
function draftBadge(sources: FaceSources, draft: boolean): RegionInput["badge"] {
  const text = draft ? uiWord(sources.index.ui, "draft.badge") : null;
  return text === null ? null : { kind: "draft", text };
}

/** A counter's reading: "cost unavailable" while the live configuration has no turn route (FR-048); "no call yet" and
 *  "$0" once it has, before any turn, its amount marked "test" in a drafts build (FR-049). T266's channel feeds the
 *  turns' readings. */
function counterReading(sources: FaceSources, part: "call" | "visit"): Pick<RegionInput, "lines" | "badge"> | null {
  const { ui, live, build } = sources.index;
  if (live.turn === "off") {
    const text = uiWord(ui, "sign.unavailable");
    return text === null ? null : { lines: [text], badge: null };
  }
  if (part === "call") {
    const text = uiWord(ui, "sign.no_call_yet");
    return text === null ? null : { lines: [text], badge: null };
  }
  const test = build.kind === "drafts" ? uiWord(ui, "sign.test") : null;
  return { lines: ["$0"], badge: test === null ? null : { kind: "test", text: test } };
}

/** One region's input, or null where its source has no words now. */
function regionInput(face: IndexFace, region: IndexRegion, sources: FaceSources): RegionInput | null {
  const { source } = region;
  const base = {
    box: regionBox(region.rect, face.px),
    grid: region.grid as Grid | null,
    typeface: typefaceOf(sources, typefaceFor(region.renderer, source)),
    outline: null,
    counter: false,
  };
  if ("room_text" in source) {
    const block = sources.text?.blocks.get(source.room_text);
    if (!block) return null;
    const outline = region.renderer === "sign" ? block.outline : null;
    if (region.renderer === "sign" ? outline === null : block.lines.length === 0) return null;
    return { ...base, lines: [...block.lines], badge: draftBadge(sources, block.state === "draft"), outline };
  }
  if ("resume_titles" in source) {
    const titles = sources.text?.titles;
    if (!titles || titles.lines.length === 0) return null;
    return { ...base, lines: [...titles.lines], badge: draftBadge(sources, titles.draft) };
  }
  if ("ui" in source) {
    const lines = source.ui.flatMap((key) => uiWord(sources.index.ui, key) ?? []);
    return lines.length === 0 ? null : { ...base, lines, badge: null };
  }
  const reading = counterReading(sources, source.part);
  return reading === null ? null : { ...base, ...reading, counter: true };
}

/** Each region's input, in the face's order: null where the region has no words now. */
export function regionInputs(face: IndexFace, sources: FaceSources): (RegionInput | null)[] {
  return face.regions.map((r) => regionInput(face, r, sources));
}

/** A face's layout, its regions' together: its words and text-copy lines in order, its longest typing, and its
 *  smallest glyph; null for a face with no words now, which stays plain. */
export function faceLayout(
  face: IndexFace,
  sources: FaceSources,
): { words: string[]; copy: string[]; typingMs: number; glyph: number } | null {
  const inputs = regionInputs(face, sources);
  let out: { words: string[]; copy: string[]; typingMs: number; glyph: number } | null = null;
  face.regions.forEach((r, k) => {
    const input = inputs[k];
    if (!input) return;
    const layout = REGISTRY[r.renderer].layout(input);
    out ??= { words: [], copy: [], typingMs: 0, glyph: Infinity };
    out.words.push(...layout.words);
    out.copy.push(...layout.copy);
    out.typingMs = Math.max(out.typingMs, layout.typingMs);
    out.glyph = Math.min(out.glyph, layout.glyph);
  });
  return out;
}

/** A face's words as the text copy says them: its renderers' word lists, each badge in brackets; null while it has
 *  none, so its entry is left out (FR-034, FR-061). */
export function faceWords(face: IndexFace, sources: FaceSources): string[] | null {
  return faceLayout(face, sources)?.copy ?? null;
}

/** A face's display list `ms` into its typing (its final frame by default): its first region's renderer's background,
 *  then each region's drawing; null for a face with no words now, which stays plain. */
export function faceList(face: IndexFace, sources: FaceSources, ms = Infinity): DisplayList | null {
  const inputs = regionInputs(face, sources);
  if (inputs.every((i) => i === null)) return null;
  const first = face.regions[0];
  const ops: Op[] = [{ op: "fill", color: first ? REGISTRY[first.renderer].background : "#000000" }];
  face.regions.forEach((r, k) => {
    const input = inputs[k];
    if (input) ops.push(...REGISTRY[r.renderer].draw(input, ms));
  });
  return { size: [face.px[0], face.px[1]], ops };
}
