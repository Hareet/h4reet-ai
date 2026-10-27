// The text copy, "Around the room" (spec 004; FR-011, FR-034, FR-063; R-40; contracts/room-bundle.md §3.1, `copy`): the
// words and states the room draws, as page text, visible to every visitor with nothing to expand, after the
// conversation panel and outside the stage, in 3D and 2D (layout.ts places it). It reads the index alone, so it never
// waits for the 3D part. Built from the index's copy[] by reference, in its order:
// - a bound face: its label and its words, from its renderer's own word list, so the 3D room, the 2D room, and this
//   can't differ (FR-034); none exists until T183 and T184, so a face with no words is left out, as the neon sign's
//   figures are until their counters word them;
// - a switch: its label and the sentence of the tier the room shows, `tier.<value>`: not-live until the tier signal
//   applies another through setTier (signals/live.ts), in the same call as the switch's case;
// - a fixed line: its UI word (`sign.not_affiliated` with the neon sign, `around.illustration` once the monitor's face
//   is bound), but `pause.paused_at` only while the room is paused, "Paused at HH:MM", its {time} the live value
//   setPausedAt gives (motion.ts; FR-060), in its place in copy[]'s order, and gone on resume; a hidden page shows none.
// Updates replace text in place, in no live region, so a poll announces nothing (FR-063). The section is a Tab stop,
// the last of the room's before the resume (FR-065; Amendment B8), and every tier value has its own sentence, so no state
// rests on the charger's pose or a colour alone (R-40). Badges ("Draft", "Sample", "test") are UI words, and come in
// with the faces' words (T183, T184).
import type { RoomIndex } from "./compose/bundle";
import type { TierValue } from "./compose/vocabulary";
import { h } from "./dom";
import { pausedAtWords } from "./motion";
import { uiWord } from "./ui-keys";

/** What the text copy reads of the index: its words, its order of entries, and its switches. */
export type CopyIndex = Pick<RoomIndex, "ui" | "copy" | "switches">;

export interface TextCopy {
  /** The "Around the room" section. */
  readonly element: HTMLElement;
  /** The tier the room shows: each switch's sentence becomes its `tier.<value>` word, in place. */
  setTier(value: TierValue): void;
  /** While the room is paused, "Paused at" with the time it paused (HH:MM); null takes the line away. */
  setPausedAt(time: string | null): void;
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
  /** Where "Paused at" goes while the room is paused: after the entry before it, or first; null where copy[] lacks it. */
  let pausedAfter: Element | "first" | null = null;
  for (const entry of room.copy) {
    if ("line" in entry && entry.line === PAUSED) {
      pausedAfter ??= list.lastElementChild ?? "first";
      continue;
    }
    if ("switch" in entry) {
      const sw = room.switches.find((s) => s.id === entry.switch);
      const label = sw ? uiWord(room.ui, sw.label) : null;
      if (label === null) continue;
      const state = h(doc, "span", {}, sentence(SHOWN));
      states.push(state);
      list.append(h(doc, "li", {}, `${label}: `, state));
    } else if ("line" in entry) {
      const words = uiWord(room.ui, entry.line);
      if (words !== null) list.append(h(doc, "li", {}, words));
    }
    // A face's words and the sign's figures come from the renderers' own word lists (T183, T184): none yet.
  }
  // A Tab stop of its own, after the conversation (FR-065; Amendment B8): a keyboard reaches it, with the room's focus
  // ring, and a screen reader hears its heading as its name.
  const element = h(
    doc,
    "section",
    { class: "room-around", "aria-labelledby": "room-around-heading", tabindex: 0 },
    heading,
    list,
  );
  let paused: HTMLElement | null = null;
  return {
    element,
    setTier(value) {
      for (const state of states) state.textContent = sentence(value);
    },
    setPausedAt(time) {
      const words = time === null || pausedAfter === null ? null : pausedAtWords(room.ui, time);
      if (words === null) {
        paused?.remove();
        paused = null;
        return;
      }
      if (paused) {
        paused.textContent = words;
        return;
      }
      paused = h(doc, "li", {}, words);
      if (pausedAfter === "first") list.prepend(paused);
      else pausedAfter?.after(paused);
    },
  };
}
