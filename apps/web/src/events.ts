// The room's usage events, sent (spec 002, FR-054; contracts/room-events.md §1; data-model.md §8; tasks.md T060): the
// EventSink the page hands the room, which posts each event with navigator.sendBeacon to the site's own
// /api/room/events, where edge forwards it to the gateway's counter.
//
// - The body is {kind} or {kind, id}, built here from those two fields alone, so nothing else a caller holds (a path,
//   an avatar, a visit, a time) can ride along. The gateway's clock times the event.
// - It goes as a string, so the browser sends text/plain;charset=UTF-8: a beacon needs no preflight for it, and the
//   gateway takes it beside JSON (§3).
// - A beacon the browser refuses or that throws is dropped: no retry, no queue, and nothing stored. Without
//   sendBeacon, nothing is sent at all, and never by another API.
// - An event the gateway would refuse anyway is never sent: an unknown kind, or a kind that takes an ID without one.
import { EVENT_KINDS } from "./room/events";
import type { EventKind, EventSink, RoomEvent } from "./room/events";

export const EVENTS_URL = "/api/room/events";

const KINDS: ReadonlySet<string> = new Set(EVENT_KINDS);
const TAKES_ID: ReadonlySet<EventKind> = new Set<EventKind>(["object_selected", "item_selected"]);

/** The beacon's body for an event, or null when it isn't one to send. */
function body(event: RoomEvent): string | null {
  const { kind, id } = event;
  if (!KINDS.has(kind)) return null;
  if (!TAKES_ID.has(kind)) return JSON.stringify({ kind });
  return typeof id === "string" && id !== "" ? JSON.stringify({ kind, id }) : null;
}

/** The sink that sends each event once, with `nav`'s sendBeacon; none, without it. */
export function beaconEvents(nav: Pick<Navigator, "sendBeacon"> | undefined): EventSink {
  return (event) => {
    const text = body(event);
    if (text === null || typeof nav?.sendBeacon !== "function") return;
    try {
      nav.sendBeacon(EVENTS_URL, text);
    } catch {
      // Refused, like a false return: the room carries on, and the event is gone.
    }
  };
}
