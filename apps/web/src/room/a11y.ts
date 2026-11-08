// The room's accessible layer (spec 002, FR-043–FR-045; contracts/room-scene.md §5; research.md R-03): the "In the
// room" list, the selectables' equivalent for keyboards and screen readers, whose buttons call the same selectObject as
// a pick in 3D or 2D; and the polite status region the hand-off's line goes to, in the page from the first screen so a
// screen reader is already watching it when the line arrives. The canvas and the 2D drawing stay aria-hidden.
// Since spec 004 (FR-004, FR-063; R-40), the list is the bundle's index's: a button per selectable in scene order,
// named by its name, with a visually hidden ": " and its topic's phrase, or the resume action's UI word, under the
// index's own heading, so a selectable added, renamed, or retargeted as data changes the list with no change here.
// Spec 008 (T017; FR-008 (c), FR-040): keyboard focus on a button is a targeting input, naming its selectable, held at
// the stage or not, and none when focus leaves it, so the piece shows the highlight in the scene while its button has
// focus.
import type { RoomIndex } from "./compose/bundle";
import { h } from "./dom";
import { uiWord } from "./ui-keys";

/** What the list reads of the index: its words, its selectables, and their topics. */
export type ListIndex = Pick<RoomIndex, "ui" | "selectables" | "topics">;

/** What a selectable opens, in words: its topic's phrase, or the resume action's UI word; null where the index has
 *  neither. */
function opens(room: ListIndex, selectable: ListIndex["selectables"][number]): string | null {
  const { action } = selectable;
  if (action.kind === "talk") return room.topics.find((t) => t.id === action.topic)?.phrase ?? null;
  return uiWord(room.ui, "list.resume_action");
}

/** The "In the room" list: a button per selectable, in the index's order, named by it and by what it opens. With
 *  `target`, each button's focus names its selectable and its blur names none (spec 008). */
export function renderObjectList(
  doc: Document,
  room: ListIndex,
  select: (id: string) => void,
  target?: (id: string | null) => void,
): HTMLElement {
  const heading = h(
    doc,
    "h2",
    { id: "room-list-heading", class: "visually-hidden" },
    uiWord(room.ui, "list.heading") ?? "",
  );
  const items = room.selectables.map((selectable) => {
    const what = opens(room, selectable);
    const button = h(
      doc,
      "button",
      { type: "button", "data-object-id": selectable.id },
      h(doc, "span", {}, selectable.name),
      ...(what === null ? [] : [h(doc, "span", { class: "visually-hidden" }, `: ${what}`)]),
    );
    button.addEventListener("click", () => select(selectable.id));
    if (target) {
      button.addEventListener("focus", () => target(selectable.id));
      button.addEventListener("blur", () => target(null));
    }
    return h(doc, "li", {}, button);
  });
  return h(
    doc,
    "section",
    { class: "room-list", "aria-labelledby": "room-list-heading" },
    heading,
    h(doc, "ul", {}, ...items),
  );
}

export interface Announcer {
  readonly element: HTMLElement;
  say(text: string): void;
}

/** A polite status region, visually hidden: what it says, a screen reader reads when it can. */
export function createAnnouncer(doc: Document): Announcer {
  const element = h(doc, "div", { role: "status", "aria-live": "polite", class: "visually-hidden" });
  return {
    element,
    say(text) {
      element.textContent = text;
    },
  };
}
