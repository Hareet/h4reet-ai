// The text copy, "Around the room" (spec 004; FR-011, FR-034, FR-063; R-40; contracts/room-bundle.md §3.1, `copy`): the
// words and states the room draws, as page text, visible to every visitor with nothing to expand, after the
// conversation panel and outside the stage, in 3D and 2D (layout.ts places it). It reads the index alone, so it never
// waits for the 3D part. Built from the index's copy[] by reference, in its order:
// - a bound face: its label and its words, from its renderers' own word lists (faces/words.ts), so the 3D room, the 2D
//   room, and this can't differ (FR-034), each badge in brackets; a face with no words now is left out (FR-061): one
//   bound to room text until room-data.json has loaded, and for good if it failed or the build withheld its block.
//   setText words them in place, in copy[]'s order. The neon sign's counters are faces too: their entries carry the
//   cost channel's readings (signals/turn-cost.ts), which setCost gives in place, each "est." marked up as an
//   abbreviation of "estimated" (contracts/turn-cost.md §8), so the index's `figures` entry adds nothing of its own;
// - a switch: its label and the sentence of the tier the room shows, `tier.<value>`: not-live until the tier signal
//   applies another through setTier (signals/live.ts), in the same call as the switch's case;
// - a fixed line: its UI word (spec 009's `twin.stand_in` first, always while the twin's figure shows a stand-in;
//   `sign.not_affiliated` with the neon sign, `around.illustration` once the monitor's face is bound), but
//   `pause.paused_at` only while the room is paused, "Paused at HH:MM", its {time} the live value
//   setPausedAt gives (motion.ts; FR-060), in its place in copy[]'s order, and gone on resume; a hidden page shows none.
// Updates replace text in place, in no live region, so a poll announces nothing (FR-063). The section is a Tab stop,
// the last of the room's before the resume (FR-065; Amendment B8), and every tier value has its own sentence, so no state
// rests on the charger's pose or a colour alone (R-40). Badges ("Draft", "Sample", "test") are UI words, said in
// brackets beside the words they mark (contracts/turn-cost.md §8).
import type { RoomIndex } from "./compose/bundle";
import type { TierValue } from "./compose/vocabulary";
import { h } from "./dom";
import { faceWords } from "./faces/words";
import type { RoomText } from "./faces/words";
import { pausedAtWords } from "./motion";
import type { CostState } from "./signals/turn-cost";
import { uiWord } from "./ui-keys";

/** What the text copy reads of the index: its words, its order of entries, its switches, and its faces with what words
 *  them. */
export type CopyIndex = Pick<RoomIndex, "ui" | "copy" | "switches" | "faces" | "build" | "live" | "typefaces">;

export interface TextCopy {
  /** The "Around the room" section. */
  readonly element: HTMLElement;
  /** The tier the room shows: each switch's sentence becomes its `tier.<value>` word, in place. */
  setTier(value: TierValue): void;
  /** While the room is paused, "Paused at" with the time it paused (HH:MM); null takes the line away. */
  setPausedAt(time: string | null): void;
  /** The room text, once room-data.json has loaded: each face it words gets its entry, in place. */
  setText(text: RoomText | null): void;
  /** The cost channel's state: the neon sign's counters' entries take their readings, in place (FR-048, FR-063). */
  setCost(state: CostState): void;
}

/** The tier the room shows until its signal applies another: not-live's case is the one the 3D and 2D rooms draw. */
const SHOWN: TierValue = "not-live";
/** The line shown only while the room is paused, with the time it paused. */
const PAUSED = "pause.paused_at";
/** What the counters' "est." abbreviates (contracts/turn-cost.md §8). */
const ESTIMATED = "estimated";

/** Whether a face holds one of the neon sign's counters: a region that reads the turn's cost. */
const isCounter = (face: RoomIndex["faces"][number]): boolean => face.regions.some((r) => "signal" in r.source);

export function renderTextCopy(doc: Document, room: CopyIndex): TextCopy {
  const sentence = (value: TierValue): string => uiWord(room.ui, `tier.${value}`) ?? "";
  const heading = h(doc, "h2", { id: "room-around-heading" }, uiWord(room.ui, "around.heading") ?? "");
  const list = h(doc, "ul", {});
  const states: HTMLElement[] = [];
  /** Where "Paused at" goes while the room is paused: after the entry before it, or first; null where copy[] lacks it. */
  let pausedAfter: Element | "first" | null = null;
  /** Each face's place in the list, in copy[]'s order: its entry while it has words, and a marker where it would go,
   *  so an entry comes and goes in its place. */
  const faces: { face: RoomIndex["faces"][number]; marker: Comment; item: HTMLElement | null }[] = [];
  for (const entry of room.copy) {
    if ("face" in entry) {
      const face = room.faces.find((f) => f.id === entry.face);
      if (!face) continue;
      const marker = doc.createComment("");
      list.append(marker);
      faces.push({ face, marker, item: null });
      continue;
    }
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
    // `figures`: the counters' readings are their faces' entries, above, so the copy holds them once.
  }
  /** The mark "est." as the UI word sign.estimated has it around its amount; none where it has no such word. */
  const mark = uiWord(room.ui, "sign.estimated", { amount: "" })?.trim() ?? "";
  /** An entry's text, with a counter's "est." as an abbreviation of "estimated": its text content is the line. */
  const fill = (item: HTMLElement, line: string, counter: boolean): void => {
    if (!counter || mark === "") {
      item.textContent = line;
      return;
    }
    item.replaceChildren(
      ...line
        .split(/(\s+)/)
        .filter((part) => part !== "")
        .map((part) => (part === mark ? h(doc, "abbr", { title: ESTIMATED }, part) : doc.createTextNode(part))),
    );
  };
  let text: RoomText | null = null;
  let cost: CostState | null = null;
  /** Each face's entry from the room text and the cost now: its label and its words, replaced in place, or left out. */
  const word = (): void => {
    for (const slot of faces) {
      const words = faceWords(slot.face, { index: room, text, ...(cost ? { cost } : {}) });
      const label = uiWord(room.ui, slot.face.label);
      const line = words === null || label === null ? null : `${label}: ${words.join(" ")}`;
      if (line === null) {
        slot.item?.remove();
        slot.item = null;
      } else if (slot.item) {
        if (slot.item.textContent !== line) fill(slot.item, line, isCounter(slot.face));
      } else {
        slot.item = h(doc, "li", {});
        fill(slot.item, line, isCounter(slot.face));
        slot.marker.after(slot.item);
      }
    }
  };
  word();
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
    setText(next) {
      text = next;
      word();
    },
    setCost(next) {
      cost = next;
      word();
    },
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
