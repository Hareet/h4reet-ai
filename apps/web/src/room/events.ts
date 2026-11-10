// The room's usage events (spec 002, FR-054; contracts/room-events.md §1; data-model.md §8): a kind, and an object's
// or item's ID where there is one. Nothing else: no text, path, avatar, visit ID, or time. The room hands each to an
// EventSink: the page's is src/events.ts's beacon (tasks.md T060); the room's default, and the tests', sends nothing.
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
  // Spec 008 (FR-051; Amendment M3): the visitor's first entry into the walking view in a visit; no ID.
  "walk_started",
  // Spec 009 (its FR-032; Amendment M4): a figure's avatar file failed to load after its retry, once a visit, with no
  // identifier, after spec 008's walk_started (plan.md §3.4).
  "avatar_failed",
  // Spec 005 (its FR-060; Amendment H7): the visitor's first entry into full screen in a visit, with no identifier,
  // after spec 009's avatar_failed (plan.md §12.1).
  "fullscreen_entered",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface RoomEvent {
  kind: EventKind;
  id?: string;
}

export type EventSink = (event: RoomEvent) => void;

/** The sink until Phase 6: it sends nothing and keeps nothing. */
export const noEvents: EventSink = () => undefined;
