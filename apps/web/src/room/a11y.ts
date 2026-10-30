// The room's accessible layer (spec 002, FR-043–FR-045; contracts/room-scene.md §5; research.md R-03): the "In the
// room" list, the objects' equivalent for keyboards and screen readers, whose buttons call the same selectObject as a
// raycast hit and a touch; and the polite status region the hand-off's line goes to, in the page from the first screen
// so a screen reader is already watching it when the line arrives. The canvas and the 2D drawing stay aria-hidden.
import { h } from "./dom";
import { ROOM_OBJECTS } from "./objects";
import type { ObjectId } from "./objects";

/** The "In the room" list: one button per object, named by the object and its topic, in a fixed order. */
export function renderObjectList(doc: Document, select: (id: ObjectId) => void): HTMLElement {
  const heading = h(doc, "h2", { id: "room-list-heading", class: "visually-hidden" }, "In the room");
  const items = ROOM_OBJECTS.map((object) => {
    const button = h(
      doc,
      "button",
      { type: "button", "data-object-id": object.id },
      h(doc, "span", {}, object.name),
      h(doc, "span", { class: "visually-hidden" }, `: ${object.topic}`),
    );
    button.addEventListener("click", () => select(object.id));
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
