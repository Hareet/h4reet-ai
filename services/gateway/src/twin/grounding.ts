// A turn's grounding (spec 007; FR-008, FR-012; plan §4): what one turn's prompt holds of the pack, in FR-008's order.
// 1. The rules: every public "Do not claim" bullet, and `01`'s ownership rulings.
// 2. `00-profile.md`.
// 3. For a selectable, its topic's files, with its lead.
// 4. Ranked sections, for free talk, or for a selectable's follow-up while free talk is ready: the lexical ranking's
//    best for the newest visitor turn, the previous one at half weight.
// Each part is added only while the prompt stays within its bound: a topic's sections that don't fit are dropped in
// reverse file order and counted; a ranked section that doesn't fit is passed over. Nothing here reads a file, the
// network, or a store, and no live value can enter: identical inputs give identical groundings.
import { FREE_TALK, PROFILE_FILE, type Pack, type PackSection } from "./pack.js";
import { renderLead, renderRules, renderSection } from "./render.js";
import type { Ranker } from "./retrieve.js";

export interface Turn {
  readonly role: "visitor" | "twin";
  readonly text: string;
}

export interface Grounding {
  /** The topic's ID, or free_talk. */
  readonly topic: string;
  readonly lead: string | null;
  readonly rules: Pack["rules"];
  /** The sections, in the order the prompt writes them. */
  readonly sections: readonly PackSection[];
  /** Topic sections left out to fit the bound. */
  readonly dropped: number;
  /** The characters the grounding takes in the prompt. */
  readonly chars: number;
  /** Every word the grounding holds, which the guards hold an answer to. */
  readonly text: string;
}

export function buildGrounding(o: {
  pack: Pack;
  ranker: Ranker;
  feature: string;
  turns: readonly Turn[];
  freeTalkReady: boolean;
  budgetChars: number;
}): Grounding {
  const { pack } = o;
  const selectable = o.feature === FREE_TALK ? undefined : pack.selectable.get(o.feature);
  const topicId = selectable?.topic ?? FREE_TALK;
  const topicFiles = selectable === undefined ? [] : (pack.topic.get(selectable.topic)?.files ?? selectable.files);
  const lead = selectable?.lead ?? null;
  const rulesText = renderRules(pack.rules);
  const profile = pack.sections.filter((s) => s.file === PROFILE_FILE);
  const topic = pack.sections.filter((s) => s.file !== PROFILE_FILE && topicFiles.includes(s.file));

  const cost = (s: PackSection): number => renderSection(s).length;
  let chars = rulesText.length + renderLead(lead).length + profile.reduce((n, s) => n + cost(s), 0);
  const kept: PackSection[] = [];
  let topicChars = topic.reduce((n, s) => n + cost(s), 0);
  let dropped = 0;
  const keep = [...topic];
  while (keep.length > 0 && chars + topicChars > o.budgetChars) {
    const last = keep.pop();
    if (last !== undefined) topicChars -= cost(last);
    dropped += 1;
  }
  kept.push(...profile, ...keep);
  chars += topicChars;

  const visitorTurns = o.turns.filter((t) => t.role === "visitor");
  const ranks = o.feature === FREE_TALK || (selectable !== undefined && o.turns.length > 0 && o.freeTalkReady);
  if (ranks && visitorTurns.length > 0) {
    const newest = visitorTurns.at(-1)?.text ?? "";
    const previous = visitorTurns.length > 1 ? visitorTurns.at(-2)?.text : undefined;
    const included = new Set(kept.map((s) => s.id));
    const byId = new Map(pack.sections.map((s) => [s.id, s]));
    for (const r of o.ranker.rank(newest, previous)) {
      const s = byId.get(r.id);
      if (s === undefined || included.has(s.id)) continue;
      if (chars + cost(s) > o.budgetChars) continue;
      kept.push(s);
      included.add(s.id);
      chars += cost(s);
    }
  }
  const text = [rulesText, ...kept.map((s) => s.text), lead ?? ""].join("\n");
  return { topic: topicId, lead, rules: pack.rules, sections: kept, dropped, chars, text };
}
