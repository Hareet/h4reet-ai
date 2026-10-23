// compose() (spec 004; FR-004, FR-005, FR-009, FR-010, FR-013; R-08 to R-12; contracts/room-bundle.md §1;
// contracts/room-data-files.md §13 to §15): the room's data, read through a tree, checked, and composed into the
// bundle. Pure: it reads only through `tree` and `policy` (policy.ts does the reading of the policy), with no clock,
// environment variable, network, or process state, and it never throws on data, since every problem is a finding.
// The order of checking is §13's: RD on each file as the loader reads it (load.ts), then RT2 over every string
// (checks/rt.ts's walk), then the families RI, RG, RS, RT, RV, RX, RK, and RL, one module each under checks/.
// Findings are reported once each, sorted by file, then path with its indices as numbers, then rule; with any finding
// lenient mode doesn't tolerate, the outputs aren't to be used. The outputs are emit.ts's.
import { compareFindings, createContext } from "./checks/family";
import type { ComposeOptions, Family, Finding } from "./checks/family";
import { rd } from "./checks/rd";
import { rg } from "./checks/rg";
import { ri } from "./checks/ri";
import { rk } from "./checks/rk";
import { rl } from "./checks/rl";
import { rs } from "./checks/rs";
import { rt, walkStrings } from "./checks/rt";
import { rv } from "./checks/rv";
import { rx } from "./checks/rx";
import { emit } from "./emit";
import type { RoomOutputs } from "./emit";
import { loadRoom } from "./load";
import type { RoomPolicy } from "./policy";
import type { Tree } from "./source";

export type { ComposeOptions, Finding } from "./checks/family";
export type { RoomCaps, RoomPolicy } from "./policy";
export type { Tree } from "./source";

/** The families after RD and RT2's walk, in §13's order. */
export const FAMILY_ORDER: readonly Family[] = [ri, rg, rs, rt, rv, rx, rk, rl];

/** contracts/room-bundle.md §1's ComposeResult: emit.ts's outputs, and every finding, sorted. */
export interface ComposeResult extends RoomOutputs {
  readonly findings: readonly Finding[];
}

/** The room in `tree`, under `policy`, composed for a strict or lenient build, with or without drafts. */
export function compose(tree: Tree, policy: RoomPolicy, options: ComposeOptions): ComposeResult {
  const room = loadRoom(tree);
  const { ctx, findings, refuse } = createContext(room, policy, options, tree);
  rd(ctx);
  refuse(walkStrings(ctx));
  for (const family of FAMILY_ORDER) family(ctx);
  const seen = new Set<string>();
  const sorted = findings
    .filter((f) => {
      const key = `${f.rule}\n${f.file}\n${f.path}\n${f.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareFindings);
  return { ...emit(room, policy, options, sorted), findings: sorted };
}

/** A finding's line (§14), `<rule> <file>:<path>: <reason>`; in a lenient build, a lenient one prefixed `warn`. */
export function formatFinding(f: Finding, mode: ComposeOptions["mode"] = "strict"): string {
  return `${mode === "lenient" && f.lenient ? "warn " : ""}${f.rule} ${f.file}:${f.path}: ${f.reason}`;
}
