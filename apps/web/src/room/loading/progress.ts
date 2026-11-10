// The loader's progress (spec 012; FR-010 to FR-016; plan.md §2, PD-3, PD-22; contracts/loading-progress.md §1, §2): a
// pure model, with no DOM and no clock, of the first visit's files as each ends. Four parts:
// - the 3D code, the room's text, and the typefaces, steps of fixed shares, each counting once it has settled;
// - the figures' files and the set models, sharing the rest by their bytes as served, each counting once its load has
//   ended (loaded, failed after its retry, or skipped), never on a retry, and never for an asset not expected.
// Every end heard is kept, whether or not the 3D stage has yet said what it will load, and counts once it has, so a
// device below ADR 0010's floor, whose files are all skipped before the list arrives, isn't held to the ceiling. The
// value is the ended shares' sum as one exact fraction rounded down, never lower than before, and 100 only once every
// part has ended. It reads nothing but what the room hands it, and sends nothing (FR-001, FR-014).
import type { ExpectedFile } from "../stage";

export type { ExpectedFile } from "../stage";

export type Part = "code" | "text" | "typefaces" | "files";
export type Outcome = "loaded" | "failed" | "skipped";
type Step = Exclude<Part, "files">;

/** Each part's share of the bar, in whole percent, summing to 100 (PD-3): one edit each. */
export const SHARES: Readonly<Record<Part, number>> = Object.freeze({ code: 10, text: 2, typefaces: 3, files: 85 });

export interface ProgressState {
  /** A whole percentage, 0 to 100, never lower than any earlier value; 100 only once every part has ended. */
  readonly value: number;
  /** What the stage line names (FR-016): the code until it and the stage's list have arrived, then the pieces while a
   *  file hasn't ended, then the text and the typefaces, then nothing. */
  readonly stage: "code" | "pieces" | "finishing" | "done";
  /** The expected files ended, and their count: the stage line's {done} and {total}. */
  readonly done: number;
  readonly total: number;
  /** Whether every part has ended. */
  readonly complete: boolean;
}

export interface Progress {
  /** A step part has settled, arrived or failed. */
  ended(part: Step): void;
  /** What the 3D stage will load, once: a second list is ignored. */
  expected(files: readonly ExpectedFile[]): void;
  /** An asset event's end, as the room's loader records it. */
  asset(asset: string, outcome: Outcome | "retried"): void;
  readonly state: ProgressState;
}

const STEPS: readonly Step[] = ["code", "text", "typefaces"];
const OUTCOMES: ReadonlySet<string> = new Set(["loaded", "failed", "skipped"]);

/** A new model: nothing ended, no list yet. */
export function createProgress(): Progress {
  const steps = new Set<Step>();
  /** Every asset whose end was heard, from the first, whether or not it is expected. */
  const endedAssets = new Set<string>();
  /** The expected files, by asset, at their largest bytes; null until the list arrives. */
  let files: Map<string, number> | null = null;
  let total = 0;
  let high = 0;

  const filesEnded = (): boolean => {
    if (files === null) return false;
    if (total === 0) return true;
    for (const asset of files.keys()) if (!endedAssets.has(asset)) return false;
    return true;
  };

  const state = (): ProgressState => {
    const stepSum = [...steps].reduce((n, s) => n + SHARES[s], 0);
    let done = 0;
    let endedBytes = 0;
    if (files !== null)
      for (const [asset, bytes] of files)
        if (endedAssets.has(asset)) {
          done += 1;
          endedBytes += bytes;
        }
    const whole = filesEnded();
    const complete = whole && steps.size === STEPS.length;
    // One exact fraction, rounded down: the files' share in proportion to the ended bytes.
    let sum = stepSum;
    if (whole) sum += SHARES.files;
    else if (files !== null && total > 0) sum = Math.floor((stepSum * total + SHARES.files * endedBytes) / total);
    const value = complete ? 100 : Math.min(99, Math.max(high, sum));
    high = value;
    let stage: ProgressState["stage"];
    if (!steps.has("code") || files === null) stage = "code";
    else if (!whole) stage = "pieces";
    else if (!complete) stage = "finishing";
    else stage = "done";
    return { value, stage, done, total: files?.size ?? 0, complete };
  };

  return {
    ended(part) {
      if ((STEPS as readonly string[]).includes(part)) steps.add(part);
    },
    expected(list) {
      if (files !== null || !Array.isArray(list)) return;
      const next = new Map<string, number>();
      for (const file of list as readonly unknown[]) {
        if (typeof file !== "object" || file === null) continue;
        const { asset, bytes } = file as Partial<ExpectedFile>;
        if (typeof asset !== "string") continue;
        const size = typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
        next.set(asset, Math.max(next.get(asset) ?? 0, size));
      }
      files = next;
      total = [...next.values()].reduce((n, b) => n + b, 0);
    },
    asset(asset, outcome) {
      if (typeof asset === "string" && OUTCOMES.has(outcome)) endedAssets.add(asset);
    },
    get state() {
      return state();
    },
  };
}
