// The room's fixed messages (spec 002, FR-023, FR-039–FR-041; data-model.md §7; contracts/room-conversation.md §3):
// their IDs, and how spec 000's degraded causes map to the three "can't talk" classes. The texts are in
// content/messages.yaml, written in advance and never generated; build/manifest.ts checks the file against these IDs
// and bundles it into the page, so showing one makes no request.
export const MESSAGE_IDS = [
  "topic_not_ready",
  "cannot_talk.resting",
  "cannot_talk.budget",
  "cannot_talk.unavailable",
  "voice_unavailable",
  "voice_output_unavailable",
  "didnt_catch",
  "utterance_limit",
] as const;

export type MessageId = (typeof MESSAGE_IDS)[number];
export type Messages = Readonly<Record<MessageId, string>>;
export type CannotTalk = "cannot_talk.resting" | "cannot_talk.budget" | "cannot_talk.unavailable";

export function isMessageId(value: unknown): value is MessageId {
  return (MESSAGE_IDS as readonly unknown[]).includes(value);
}

/** Spec 000's causes for "the local tier is resting" (contracts/room-conversation.md §3). */
const RESTING: ReadonlySet<string> = new Set([
  "local_unhealthy",
  "local_error",
  "no_fallback_in_stack",
  "fallback_unavailable",
]);

/** Spec 000's causes for "today's budget is used"; a kill-switch trip follows a ceiling, so it counts here. */
const BUDGET: ReadonlySet<string> = new Set([
  "meter_at_ceiling",
  "fallback_spent_today",
  "fallback_awaiting_renewal",
  "kill_switch_tripped",
]);

/** The class of a degraded cause; any other cause, an unknown one, or a network failure (no cause) is "unavailable". */
export function cannotTalkFor(cause: string | undefined): CannotTalk {
  if (cause !== undefined && RESTING.has(cause)) return "cannot_talk.resting";
  if (cause !== undefined && BUDGET.has(cause)) return "cannot_talk.budget";
  return "cannot_talk.unavailable";
}

/** Every "can't talk" message ends by pointing to the resume and the PDF. */
export function pointsToResume(id: MessageId): boolean {
  return id.startsWith("cannot_talk.");
}

/** A message's text with its {name} slots filled from the room's own words (an object's topic), never the visitor's. */
export function fill(text: string, vars: Readonly<Record<string, string>> = {}): string {
  return text.replace(/\{([a-z_]+)\}/g, (whole, name: string) => vars[name] ?? whole);
}
