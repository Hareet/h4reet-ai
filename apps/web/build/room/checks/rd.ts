// RD, shape (spec 004; FR-001, FR-005; R-01, R-09; contracts/room-data-files.md §2, §13.1, §14). RD runs as each file
// is read (load.ts), and a file that fails it is left out of the model, so it meets no other rule:
// - RD1, a file that doesn't parse: not UTF-8, a byte-order mark, a CR, a YAML syntax error, more than one document, a
//   duplicate key, an alias, an anchor, a merge key, a tag, or a directive; in JSON, a duplicate key, NaN, or Infinity
//   (load.ts's readers);
// - RD2 to RD4, a file outside its schema (schema.ts): `shapeProblems` maps each zod issue to an unknown key (RD2), a
//   missing key or a value outside its type or range (RD3), or a version other than 1 (RD4); a check that names its
//   own rule (`own`) gives that rule instead, so a stylized scale of 5 is RG3 as the file is read;
// - RD5, a file in the data folders that isn't one of their kinds (load.ts's walk).
// A reason names keys, types, and the schema's own words and figures, never a value from the data, and a key that
// isn't printable is left out of the path (family.ts).
import type { z } from "zod";

import { owner } from "../schema";
import { formatPath, isRuleId } from "./family";
import type { Family, Problem, RuleId } from "./family";

type Issue = z.core.$ZodIssue;
type Step = string | number;

/** Whether `path` names a key its object lacks: a required key missing, rather than a value of the wrong kind. */
function missing(input: unknown, path: readonly PropertyKey[]): boolean {
  let node = input;
  for (const key of path.slice(0, -1)) {
    if (typeof node !== "object" || node === null) return false;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  const last = path[path.length - 1];
  return (
    last !== undefined &&
    typeof node === "object" &&
    node !== null &&
    !Array.isArray(node) &&
    !Object.hasOwn(node, last as string)
  );
}

const article = (word: string): string => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);
const listed = (values: readonly unknown[]): string =>
  values.length === 1 ? String(values[0]) : `one of ${values.map(String).join(", ")}`;

/** RD3's reason for one of zod's own issues: what the schema expects, in its own words and figures. */
function expected(issue: Issue): string {
  switch (issue.code) {
    case "invalid_type": {
      const received = (issue as { received?: string }).received;
      if (received === "Infinity" || received === "-Infinity" || received === "NaN")
        return "a number that isn't finite";
      return `not ${article(issue.expected === "int" ? "integer" : issue.expected)}`;
    }
    case "invalid_value":
      return `not ${listed(issue.values)}`;
    case "too_small":
    case "too_big": {
      const bound = Number(issue.code === "too_small" ? issue.minimum : issue.maximum);
      const below = issue.code === "too_small";
      if (issue.origin === "string")
        return below ? `shorter than ${bound} characters` : `longer than ${bound} characters`;
      if (issue.origin === "array") return below ? `fewer than ${bound} items` : `more than ${bound} items`;
      if (issue.inclusive === false) return below ? `not above ${bound}` : `not under ${bound}`;
      return below ? `under ${bound}` : `over ${bound}`;
    }
    case "not_multiple_of":
      return `not a multiple of ${Number(issue.divisor)}`;
    default:
      return "outside its schema";
  }
}

/** The issue's rule and reason when its check names its own (schema.ts's `own`). */
function owned(issue: Issue): { rule: RuleId; reason: string } | null {
  const found = owner(issue.message);
  return found && isRuleId(found.rule) ? { rule: found.rule, reason: found.reason } : null;
}

function map(issue: Issue, base: readonly Step[], input: unknown, file: string, out: Problem[]): void {
  const path = [...base, ...(issue.path as Step[])];
  const add = (rule: RuleId, at: readonly Step[], reason: string): void => {
    out.push({ rule, file, path: formatPath(at), reason });
  };
  const own = owned(issue);
  switch (issue.code) {
    case "unrecognized_keys":
      for (const key of issue.keys)
        add(own?.rule ?? "RD2", [...path, key], own?.reason ?? "a key its schema doesn't define");
      return;
    case "invalid_key": {
      const inner = issue.issues.map(owned).find((o) => o !== null);
      add(inner?.rule ?? "RD3", path, inner?.reason ?? "a key outside its schema");
      return;
    }
    case "invalid_union": {
      if (missing(input, path)) return add("RD3", path, "a required key is missing");
      if ("note" in issue && issue.note === "No matching discriminator") {
        const options = (issue as { options?: unknown[] }).options ?? [];
        return add("RD3", path, `not ${listed(options)}`);
      }
      // The form whose own type matched, as zod tried each: its issues are the ones that say what's wrong.
      const matched = issue.errors.filter((e) => !e.some((i) => i.path.length === 0 && i.code === "invalid_type"));
      if (matched.length === 1) for (const i of matched[0] as Issue[]) map(i, path, input, file, out);
      else add("RD3", path, "none of the forms its schema takes");
      return;
    }
    case "invalid_type":
    case "invalid_value":
      if (missing(input, path)) return add("RD3", path, "a required key is missing");
      return own ? add(own.rule, path, own.reason) : add("RD3", path, expected(issue));
    default:
      return own ? add(own.rule, path, own.reason) : add("RD3", path, expected(issue));
  }
}

/** A schema's issues on `input`, the file at `file`, as findings: RD2, RD3, RD4, or the rule a check names. */
export function shapeProblems(issues: readonly Issue[], input: unknown, file: string): Problem[] {
  const out: Problem[] = [];
  for (const issue of issues) map(issue, [], input, file, out);
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.rule}\n${p.path}\n${p.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** RD: each problem the loader met reading the room's files, the constraints the schemas hold for other rules among
 *  them, reported as findings. */
export const rd: Family = (ctx) => {
  for (const p of ctx.room.problems) ctx.report(p.rule, p.file, p.path, p.reason);
};
