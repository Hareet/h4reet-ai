// The text copy, "Around the room" (spec 004; FR-011, FR-034, FR-063; R-40; contracts/room-bundle.md §3.1, `copy`): the
// words and states the room draws, as page text, visible to every visitor with nothing to expand, after the
// conversation panel and outside the stage, in 3D and 2D (layout.ts places it). It reads the index alone, so it never
// waits for the 3D part. Built from the index's copy[] by reference, in its order:
// - a bound face: its label and its words, from its renderer's own word list, so the 3D room, the 2D room, and this
//   can't differ (FR-034); none exists until T183 and T184, so a face with no words is left out, as the neon sign's
//   figures are until their counters word them;
// - a switch: its label and the sentence of the tier the room shows, `tier.<value>`: not-live, the case the 3D and 2D
//   rooms show, until the tier signal applies another through setTier (T161);
// - a fixed line: its UI word (`sign.not_affiliated` with the neon sign, `around.illustration` once the monitor's face
//   is bound), but `pause.paused_at` only while the room is paused, which comes with "Pause the room" (T161).
// Updates replace text in place, in no live region, so a poll announces nothing (FR-063).
import type { RoomIndex } from "./compose/bundle";
import type { TierValue } from "./compose/vocabulary";
import { h } from "./dom";
import { uiWord } from "./ui-keys";

/** What the text copy reads of the index: its words, its order of entries, and its switches. */
export type CopyIndex = Pick<RoomIndex, "ui" | "copy" | "switches">;

export interface TextCopy {
  /** The "Around the room" section. */
  readonly element: HTMLElement;
  /** The tier the room shows: each switch's sentence becomes its `tier.<value>` word, in place. */
  setTier(value: TierValue): void;
}

/** The tier the room shows until its signal applies another: not-live's case is the one the 3D and 2D rooms draw. */
const SHOWN: TierValue = "not-live";
/** The line shown only while the room is paused, with the time it paused. */
const PAUSED = "pause.paused_at";

export function renderTextCopy(doc: Document, room: CopyIndex): TextCopy {
  const sentence = (value: TierValue): string => uiWord(room.ui, `tier.${value}`) ?? "";
  const heading = h(doc, "h2", { id: "room-around-heading" }, uiWord(room.ui, "around.heading") ?? "");
  const list = h(doc, "ul", {});
  const states: HTMLElement[] = [];
  for (const entry of room.copy) {
    if ("switch" in entry) {
      const sw = room.switches.find((s) => s.id === entry.switch);
      const label = sw ? uiWord(room.ui, sw.label) : null;
      if (label === null) continue;
      const state = h(doc, "span", {}, sentence(SHOWN));
      states.push(state);
      list.append(h(doc, "li", {}, `${label}: `, state));
    } else if ("line" in entry && entry.line !== PAUSED) {
      const words = uiWord(room.ui, entry.line);
      if (words !== null) list.append(h(doc, "li", {}, words));
    }
    // A face's words and the sign's figures come from the renderers' own word lists (T183, T184): none yet.
  }
  const element = h(doc, "section", { class: "room-around", "aria-labelledby": "room-around-heading" }, heading, list);
  return {
    element,
    setTier(value) {
      for (const state of states) state.textContent = sentence(value);
    },
  };
}
