// The room's fixed messages (spec 002, FR-023, FR-039–FR-041; data-model.md §7; contracts/room-conversation.md §3):
// their IDs, and the "can't talk" class of each of spec 000's degraded causes, by the tier signal's own cause map
// (spec 004, src/room/signals/tier.ts's causeClass, moved out of here so the two share it). The texts are in
// content/messages.yaml, written in advance and never generated; build/manifest.ts checks the file against these IDs
// and bundles it into the page, so showing one makes no request.
import { causeClass } from "../room/signals/tier";

export const MESSAGE_IDS = [
  "topic_not_ready",
  "cannot_talk.resting",
  "cannot_talk.budget",
  "cannot_talk.unavailable",
  "voice_unavailable",
  "voice_output_unavailable",
  "didnt_catch",
  "utterance_limit",
  // Spec 007's four (its FR-038, Amendment 2-2): the waiting status, two refusals, and a stopped turn.
  "twin_answering",
  "turn_refused.slow_down",
  "turn_refused.unreadable",
  "turn_stopped",
] as const;

export type MessageId = (typeof MESSAGE_IDS)[number];
export type Messages = Readonly<Record<MessageId, string>>;
export type CannotTalk = "cannot_talk.resting" | "cannot_talk.budget" | "cannot_talk.unavailable";

export function isMessageId(value: unknown): value is MessageId {
  return (MESSAGE_IDS as readonly unknown[]).includes(value);
}

/** The "can't talk" message for a degraded cause: its class by the tier's own map (spec 004, FR-041 row 6;
 *  contracts/tier-signal.md §4), so the laptop and the conversation never disagree about a cause; any other cause, an
 *  unknown one, or a network failure (no cause) is "unavailable". */
export function cannotTalkFor(cause: string | undefined): CannotTalk {
  return `cannot_talk.${causeClass(cause)}`;
}

/** Every "can't talk" message ends by pointing to the resume and the PDF. */
export function pointsToResume(id: MessageId): boolean {
  return id.startsWith("cannot_talk.");
}

/** A message's text with its {name} slots filled from the room's own words (an object's topic), never the visitor's. */
export function fill(text: string, vars: Readonly<Record<string, string>> = {}): string {
  return text.replace(/\{([a-z_]+)\}/g, (whole, name: string) => vars[name] ?? whole);
}
