// What the rule families share (spec 004; FR-009, FR-013; R-09, R-10; contracts/room-data-files.md §13 to §15):
// - the catalogue: every rule of §13, its family, whether lenient mode tolerates it (RX and RK2, the findings about one
//   piece's model file, alone), what of it runs only in strict mode (RT9, RT8's section-title fit, RT13's intent
//   lookup), whether it refuses (all but RG8, which only reports), and what of it the loader reports as it reads,
//   from a constraint the schemas hold (schema.ts's `own`), so the family's module needn't check that part again;
// - a finding, `<rule> <file>:<path>: <reason>`, its order (file, then path with indices as numbers, then rule), and a
//   path's form: keys joined by dots, indices in brackets, `-` for the whole file, and a key that isn't printable left
//   out with everything below it, so no path prints a name RT2 refused;
// - the context each family's check reads and reports through. A family is `(ctx) => void`, one module each in this
//   folder, run by compose.ts in the order RI, RG, RS, RT, RV, RX, RK, RL, and spec 008's RW, after RD (the loader's)
//   and RT2's walk.
import type { LoadedRoom } from "../load";
import type { RoomPolicy } from "../policy";
import { compareBytewise } from "../source";
import type { Tree } from "../source";

/** Spec 004's nine families, then spec 008's RW (its plan.md §3.5). */
export const FAMILIES = ["RD", "RI", "RG", "RS", "RT", "RV", "RX", "RK", "RL", "RW"] as const;
export type FamilyId = (typeof FAMILIES)[number];

export interface RuleInfo {
  readonly family: FamilyId;
  /** Lenient mode prints it prefixed `warn`, and the piece keeps its stand-in (§15). */
  readonly lenient: boolean;
  /** What of the rule runs in strict mode only: all of it, a part, or none. */
  readonly strict: "whole" | "part" | null;
  /** False for RG8, which the report carries and nothing refuses. */
  readonly refuses: boolean;
  /** What of the rule the loader reports, from a constraint the schemas hold: all of it, a part, or none. */
  readonly loader: "whole" | "part" | null;
}

const rule = (family: FamilyId, info: Partial<Omit<RuleInfo, "family">> = {}): RuleInfo => ({
  family,
  lenient: false,
  strict: null,
  refuses: true,
  loader: null,
  ...info,
});
const read = { loader: "whole" } as const;
const readPart = { loader: "part" } as const;
const model = { lenient: true } as const;

/** Every rule of contracts/room-data-files.md §13, in its order, then spec 008's (its Amendment M12). */
export const RULES = {
  RD1: rule("RD", read), // a file that doesn't parse
  RD2: rule("RD", read), // a key its schema doesn't define
  RD3: rule("RD", read), // a required key missing, or a value outside its type or range
  RD4: rule("RD", read), // a version other than 1
  RD5: rule("RD", read), // a file in the data folders that isn't one of their kinds
  RI1: rule("RI", read), // an ID or a name outside its grammar
  RI2: rule("RI"), // a duplicate ID or name
  RI3: rule("RI"), // a retired ID taken again
  RI4: rule("RI"), // a reference that doesn't resolve
  RI5: rule("RI"), // an ID equal to a vocabulary word
  RI6: rule("RI"), // too many selectables, or a placement in two
  RI7: rule("RI"), // a model not under assets/room/, or not recorded
  RI8: rule("RI"), // the root, the figures, and the hand-off
  RI9: rule("RI", read), // a corpus path outside its form
  RI10: rule("RI"), // lookdev.yaml naming a placement the scene lacks
  RI11: rule("RI"), // a label nothing references
  RG1: rule("RG"), // mounts that aren't one tree
  RG2: rule("RG", readPart), // bounds, faces, glows, and stand-ins; unit vectors (the loader's); px's aspect
  RG3: rule("RG", read), // a stylized scale outside 1 to 4
  RG4: rule("RG"), // the twin or a selectable's member not framed
  RG5: rule("RG"), // a framed box outside the view
  RG6: rule("RG"), // a hit area or core under 44 × 44
  RG7: rule("RG"), // a face under the legibility floor
  RG8: rule("RG", { refuses: false }), // poses apart by less than the floor: reported, never refused
  RG9: rule("RG"), // a region outside its face, or two that overlap
  RS1: rule("RS", readPart), // a switch's signal (the loader's), and its cases
  RS2: rule("RS"), // poses against claims; a placed switch piece; two poses claiming one value
  RS3: rule("RS"), // a case showing a pose that claims another value
  RS4: rule("RS"), // the six values not sharing one pose that claims nothing
  RS5: rule("RS"), // a pose sitting where the local pose sits
  RS6: rule("RS", readPart), // a cable's from; its sag, radius, and drop (the loader's)
  RT1: rule("RT", readPart), // a region's sources (the loader's), and its text's renderer
  RT2: rule("RT"), // spec 002's C9 over every string
  RT3: rule("RT"), // a digit or a slot where C6 refuses it
  RT4: rule("RT"), // C1 to C5 on claims
  RT5: rule("RT"), // a line about the Author without claims, or failing C8
  RT6: rule("RT"), // what the monitor's scripts may not hold
  RT7: rule("RT", readPart), // a chalk block's exclude: missing (the loader's), held, cited, or echoed
  RT8: rule("RT", { strict: "part" }), // words over their grid; the section titles' fit in strict mode
  RT9: rule("RT", { strict: "whole" }), // a words_from quote not verbatim
  RT10: rule("RT"), // a typeface not vendored for room, or a file off the lock
  RT11: rule("RT"), // a tier word naming the twin
  RT12: rule("RT"), // a closed-list UI key missing, or its slots wrong
  RT13: rule("RT", { strict: "part", loader: "part" }), // an outline's keys, cap height, and paths (the loader's); its intent in strict mode
  RV1: rule("RV"), // a piece with no drawing
  RV2: rule("RV", readPart), // point counts, path data, and finite numbers (the loader's)
  RV3: rule("RV", readPart), // a colour outside the palette; a negative stroke width (the loader's)
  RX1: rule("RX", model),
  RX2: rule("RX", model),
  RX3: rule("RX", model),
  RX4: rule("RX", model),
  RX5: rule("RX", model),
  RX6: rule("RX", model),
  RX7: rule("RX", model),
  RX8: rule("RX", model),
  RX9: rule("RX", model),
  RX10: rule("RX", model),
  RK1: rule("RK"), // a budget above the caps
  RK2: rule("RK", model), // a model over its budget
  RK3: rule("RK"), // the scene's texture memory over its cap
  RK4: rule("RK"), // a malformed room block (policy.ts keeps it and its problems)
  RL1: rule("RL", read), // the poll interval and the freshness window
  RL2: rule("RL"), // the status source without row V7
  RL3: rule("RL"), // asset events without row V6
  RL4: rule("RL"), // the turn route without row V2
  // Spec 008 (plan.md §3.5): RW1, the visitor figure's start on the walkable floor, joins with the walking data (T041).
  RW2: rule("RW"), // a look whose highlight's band and edge both give under 3:1 against a colour of its palette
} as const satisfies Record<string, RuleInfo>;

export type RuleId = keyof typeof RULES;
export const RULE_IDS = Object.keys(RULES) as RuleId[];

export function isRuleId(value: string): value is RuleId {
  return Object.hasOwn(RULES, value);
}

/** One refusal (§14): `<rule> <file>:<path>: <reason>`. Its rule is a catalogue ID (`report` takes only those). */
export interface Finding {
  readonly rule: string;
  /** The repository-relative path of the file it concerns. */
  readonly file: string;
  /** The place in that file's own terms, or `-` for the whole file. */
  readonly path: string;
  /** The rule's fixed text, with keys, indices, types, measures, stages, and IDs RT2 passed; never a data value. */
  readonly reason: string;
  /** From the catalogue: whether lenient mode tolerates it. */
  readonly lenient: boolean;
}

/** A finding before the catalogue's verdict: what the loader and a family's own helpers return. */
export interface Problem extends Omit<Finding, "rule" | "lenient"> {
  readonly rule: RuleId;
}

export interface ComposeOptions {
  /** contracts/room-data-files.md §15. */
  readonly mode: "strict" | "lenient";
  /** A drafts build: draft room text, fixtures, and lookdev. */
  readonly drafts: boolean;
  /** The twin's readiness (spec 007, FR-037; departure D3), which the build reads from config/twin-readiness.yaml by
   *  the gateway's rule (build/room/readiness.ts) and hands in, so the compositor's own reads stay the room's data.
   *  Absent, nothing is ready. */
  readonly readiness?: { readonly topics: ReadonlyMap<string, boolean>; readonly freeTalk: boolean };
}

const RULE_PARTS = /^([A-Z]+)(\d+)$/;

/** A path's keys and indices, the indices as numbers. */
function steps(path: string): (string | number)[] {
  return [...path.matchAll(/\[(\d+)\]|([^.[\]]+)/g)].map((m) => (m[1] === undefined ? (m[2] ?? "") : Number(m[1])));
}

function comparePaths(a: string, b: string): number {
  const [x, y] = [steps(a), steps(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const [p, q] = [x[i], y[i]];
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    if (typeof p === "number") return -1;
    if (typeof q === "number") return 1;
    return compareBytewise(p ?? "", q ?? "");
  }
  return x.length - y.length;
}

function compareRules(a: string, b: string): number {
  const [x, y] = [RULE_PARTS.exec(a), RULE_PARTS.exec(b)];
  if (!x || !y) return compareBytewise(a, b);
  return compareBytewise(x[1] ?? "", y[1] ?? "") || Number(x[2]) - Number(y[2]);
}

/** §14's order: by file, then path with its indices compared as numbers, then rule (RI2 before RI10). */
export function compareFindings(
  a: Pick<Finding, "rule" | "file" | "path">,
  b: Pick<Finding, "rule" | "file" | "path">,
): number {
  return compareBytewise(a.file, b.file) || comparePaths(a.path, b.path) || compareRules(a.rule, b.rule);
}

/** A key that may stand in a path: lowercase letters, digits, `_`, `.`, and `-`, as schema keys, names, roles, tier
 *  values, and UI keys are. Any other key holds something the data's author typed and RT2 hasn't judged. */
const PRINTABLE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/** Keys joined by dots and indices in brackets (`placements[3].mount.anchor`), or `-` for none. A key that isn't
 *  printable, or that `printable` refuses, is left out with everything below it. */
export function formatPath(
  segments: readonly (string | number)[],
  printable: (key: string) => boolean = () => true,
): string {
  let out = "";
  for (const s of segments) {
    if (typeof s === "number") out += `[${s}]`;
    else if (!PRINTABLE.test(s) || !printable(s)) break;
    else out += out === "" ? s : `.${s}`;
  }
  return out === "" ? "-" : out;
}

/** What a family's check reads, and how it reports. */
export interface Context {
  /** Every data file that passed RD, parsed, with its path. */
  readonly room: LoadedRoom;
  readonly policy: RoomPolicy;
  readonly options: ComposeOptions;
  /** For what the loaded room doesn't hold: models and records, typefaces, the corpus, the disclosure, the intents. */
  readonly tree: Tree;
  /** Reports a finding; whether it is lenient comes from the catalogue. */
  report(rule: RuleId, file: string, path: string, reason: string): void;
  /** Whether a string from the data may stand in a reason or a path: RT2 hasn't refused it. */
  printable(value: string): boolean;
  /** `formatPath` through `printable`. */
  path(...segments: (string | number)[]): string;
}

export type Family = (ctx: Context) => void;

/** A context over `room`, its findings, and `refuse`, which records the strings RT2 refused. */
export function createContext(
  room: LoadedRoom,
  policy: RoomPolicy,
  options: ComposeOptions,
  tree: Tree,
): { ctx: Context; findings: Finding[]; refuse(values: Iterable<string>): void } {
  const findings: Finding[] = [];
  const refused = new Set<string>();
  const printable = (value: string): boolean => !refused.has(value);
  const ctx: Context = {
    room,
    policy,
    options,
    tree,
    report(rule, file, path, reason) {
      findings.push({ rule, file, path, reason, lenient: RULES[rule].lenient });
    },
    printable,
    path: (...segments) => formatPath(segments, printable),
  };
  return {
    ctx,
    findings,
    refuse(values) {
      for (const v of values) refused.add(v);
    },
  };
}
