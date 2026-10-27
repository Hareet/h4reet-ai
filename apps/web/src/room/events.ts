// The room's usage events (spec 002, FR-054; contracts/room-events.md §1; data-model.md §8): a kind, and an object's
// or item's ID where there is one. Nothing else: no text, path, avatar, visit ID, or time. The room hands each to an
// EventSink. Phase 6 (tasks.md T060, src/events.ts) supplies the one that sends the beacon; until then the page's sink
// drops them, so no request leaves.
//
// The kinds are the source of room-manifest.json's event_kinds and config/room-events.yaml's kinds (build/manifest.ts).
export const EVENT_KINDS = [
  "object_selected",
  "item_selected",
  "resume_opened",
  "resume_kept",
  "pdf_downloaded",
  "turn_sent",
  "voice_pressed",
  "mode_2d",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface RoomEvent {
  kind: EventKind;
  id?: string;
}

export type EventSink = (event: RoomEvent) => void;

/** The sink until Phase 6: it sends nothing and keeps nothing. */
export const noEvents: EventSink = () => undefined;
