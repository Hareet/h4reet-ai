// The loader's hints, filled (spec 012; FR-032, FR-033; plan.md §7.2, PD-14, PD-21; contracts/hints.md §2): each hint's
// slots filled at build, never typed. A figure slot from the configuration that enforces it, read through the
// compositor's tree as build/room/readiness.ts reads config/budgets.yaml: prod's ceilings and its fallback sub-budget
// from config/budgets.yaml, and the paid fallback's prices from config/prices.yaml's last version, its entry for the
// model of the adapter config/routing.yaml's prod fallback names (the laptop's, with spec 001's schema 2). A `{ui:<key>}` slot from the room's UI words, for a
// key on the closed list whose word holds no slot. Amounts in US dollars: whole where the cents are 0, else at least two
// decimals, zeros past them trimmed. A slot that can't be filled leaves its hint unfilled, which RT17 reports and the
// index leaves out. The three paths are constants, which fix/007-image-readiness's list of the files the room's build
// reads takes, so the web image's build copies them and its hints equal a checkout's (PD-21).
import { parse } from "yaml";

import { UI_KEYS, slotsIn } from "../../src/room/ui-keys";
import { BUDGETS_FILE } from "./readiness";
import type { Hint, Hints, UiWord } from "./schema";
import type { Tree } from "./source";

export { BUDGETS_FILE } from "./readiness";
/** The paid fallback prod's route names. */
export const ROUTING_FILE = "config/routing.yaml";
/** The versioned price table. */
export const PRICES_FILE = "config/prices.yaml";

/** The figure slots of the closed list (contracts/hints.md §2). */
export const FIGURE_SLOTS = [
  "budget.daily_usd",
  "budget.monthly_usd",
  "budget.fallback_daily_usd",
  "price.input",
  "price.output",
] as const;
export type FigureSlot = (typeof FIGURE_SLOTS)[number];

/** A slot in a hint's text: `{`, a name with no space or brace, `}`. */
export const HINT_SLOT = /\{([^{}\s]*)\}/g;
const UI_SLOT = /^ui:(.+)$/;

/** Why a slot couldn't be filled: off the closed list; a UI key off it, or whose word holds a slot; or a figure the
 *  configuration doesn't hold. */
export type SlotFault =
  | { readonly kind: "unknown" }
  | { readonly kind: "ui"; readonly key: string }
  | { readonly kind: "unfilled"; readonly slot: FigureSlot };

/** An amount in US dollars (contracts/hints.md §2), or null for one that isn't a finite figure of 0 or more. */
export function formatAmount(n: number): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) < 1e-9 && cents % 100 === 0) return `$${cents / 100}`;
  let text = n.toFixed(6).replace(/0+$/, "");
  const [whole = "0", part = ""] = text.split(".");
  text = `${whole}.${part.padEnd(2, "0")}`;
  return `$${text}`;
}

const yamlAt = (tree: Pick<Tree, "read">, path: string): unknown => {
  const bytes = tree.read(path);
  if (bytes === null) return undefined;
  try {
    return parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
};

const at = (value: unknown, ...keys: string[]): unknown => {
  let node = value;
  for (const key of keys) {
    if (typeof node !== "object" || node === null || Array.isArray(node) || !Object.hasOwn(node, key)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
};

/** The figures the configuration holds, each formatted; a figure it doesn't hold is absent. */
export function hintFigures(tree: Pick<Tree, "read">): Partial<Record<FigureSlot, string>> {
  const out: Partial<Record<FigureSlot, string>> = {};
  const put = (slot: FigureSlot, value: unknown): void => {
    const amount = typeof value === "number" ? formatAmount(value) : null;
    if (amount !== null) out[slot] = amount;
  };
  const budgets = yamlAt(tree, BUDGETS_FILE);
  put("budget.daily_usd", at(budgets, "envs", "prod", "daily_usd"));
  put("budget.monthly_usd", at(budgets, "envs", "prod", "monthly_usd"));
  put("budget.fallback_daily_usd", at(budgets, "envs", "prod", "fallback_daily_usd"));
  const routing = yamlAt(tree, ROUTING_FILE);
  // Spec 001's schema 2: prod's route per host, of which the local-first one, with a primary and a fallback, is the
  // one this figure prices; schema 1's envs.prod is that route itself.
  const hosts = at(routing, "envs", "prod", "hosts");
  const localFirst =
    hosts !== null && typeof hosts === "object"
      ? Object.values(hosts as Record<string, unknown>).find((r) => at(r, "primary") !== undefined)
      : at(routing, "envs", "prod");
  const fallback = at(localFirst, "fallback");
  const model = typeof fallback === "string" ? at(routing, "adapters", fallback, "model") : undefined;
  const versions = at(yamlAt(tree, PRICES_FILE), "versions");
  const last = Array.isArray(versions) ? (versions.at(-1) as unknown) : undefined;
  const entries = at(last, "entries");
  // The one entry for that model in the last version: the provider is fixed by the adapter's type in the gateway's
  // own code, which nothing outside its adapters names, so two entries for one model leave the price unfilled (RT17)
  // rather than one picked by the file's order.
  const matching =
    typeof model === "string" && Array.isArray(entries)
      ? (entries as unknown[]).filter((e) => at(e, "model") === model)
      : [];
  const entry = matching.length === 1 ? matching[0] : undefined;
  if (entry !== undefined) {
    put("price.input", at(entry, "input"));
    put("price.output", at(entry, "output"));
  }
  return out;
}

const wordText = (word: UiWord | undefined): string | undefined =>
  word === undefined ? undefined : typeof word === "string" ? word : word.text;

/** A hint's text with its slots filled, or the faults of the slots that couldn't be. */
export function fillText(
  text: string,
  figures: Partial<Record<FigureSlot, string>>,
  ui: Readonly<Record<string, UiWord>>,
): { readonly text: string | null; readonly faults: readonly SlotFault[] } {
  const faults: SlotFault[] = [];
  const filled = text.replace(HINT_SLOT, (whole, name: string) => {
    const key = UI_SLOT.exec(name)?.[1];
    if (key !== undefined) {
      const word = Object.hasOwn(UI_KEYS, key) && Object.hasOwn(ui, key) ? wordText(ui[key]) : undefined;
      if (word === undefined || slotsIn(word).length > 0) {
        faults.push({ kind: "ui", key });
        return whole;
      }
      return word;
    }
    if (!(FIGURE_SLOTS as readonly string[]).includes(name)) {
      faults.push({ kind: "unknown" });
      return whole;
    }
    const figure = figures[name as FigureSlot];
    if (figure === undefined) {
      faults.push({ kind: "unfilled", slot: name as FigureSlot });
      return whole;
    }
    return figure;
  });
  return { text: faults.length > 0 ? null : filled, faults };
}

/** One hint, filled, with its place in the file. */
export interface FilledHint {
  readonly index: number;
  readonly hint: Hint;
  /** Its text, filled; null where a slot couldn't be. */
  readonly text: string | null;
  readonly faults: readonly SlotFault[];
}

/** Every hint of the file, filled, in the file's order. */
export function fillHints(
  hints: Hints | null,
  tree: Pick<Tree, "read">,
  ui: Readonly<Record<string, UiWord>>,
): FilledHint[] {
  if (hints === null) return [];
  const figures = hintFigures(tree);
  return hints.hints.map((hint, index) => ({ index, hint, ...fillText(hint.text, figures, ui) }));
}

/** The index's hints (contracts/hints.md §3): each filled, in the file's order; a hint whose slot couldn't be filled,
 *  or whose `when` isn't met, left out. */
export function indexHints(filled: readonly FilledHint[], freeTalkReady: boolean): string[] {
  return filled.flatMap((h) => {
    if (h.text === null) return [];
    if (h.hint.when === "free_talk_ready" && !freeTalkReady) return [];
    return [h.text];
  });
}

/** Words, as RT16 counts them: runs of non-space characters. */
export const wordCount = (text: string): number => text.split(/\s+/).filter((w) => w !== "").length;
