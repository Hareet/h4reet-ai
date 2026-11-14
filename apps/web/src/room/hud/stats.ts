// The panel's three stats (spec 018; FR-010, plan.md §1 P5): who is serving, this call's cost, and this visit's cost,
// from the signals the neon sign reads (the tier signal, signals/turn-cost.ts). Each is a label and a value in the
// index's UI words; a word the index lacks, or a state with no reading, reads "—". Nothing here is about the Author.
import type { TierValue } from "../compose/vocabulary";
import { costReadings } from "../signals/turn-cost";
import type { CostState, CostWords } from "../signals/turn-cost";
import { uiWord } from "../ui-keys";

export interface Stat {
  readonly id: "serving" | "call" | "visit";
  readonly label: string;
  readonly value: string;
}

const TIER_WORDS = new Set(["local", "cloud", "resting", "budget", "unavailable"]);

/** The three stats for a tier value and the cost channel's state. */
export function statsFrom(tier: TierValue, cost: CostState, words: CostWords): readonly [Stat, Stat, Stat] {
  const { ui } = words;
  const unknown = uiWord(ui, "stat.unknown") ?? "—";
  const key = TIER_WORDS.has(tier) ? tier : "unknown";
  const readings = costReadings(cost, words);
  return [
    { id: "serving", label: uiWord(ui, "stat.serving") ?? unknown, value: uiWord(ui, `stat.tier.${key}`) ?? unknown },
    { id: "call", label: uiWord(ui, "stat.call") ?? unknown, value: readings.call?.text ?? unknown },
    { id: "visit", label: uiWord(ui, "stat.visit") ?? unknown, value: readings.visit?.text ?? unknown },
  ];
}
