// T105, T106 (spec 001; FR-033; plan.md §14, P-6; ADR 0029): config/budgets.yaml's `public` section, the relay's
// public request cap, through the gateway's validator. The section is optional, so the file without it validates as
// before; with it, each of its four figures is a whole number in its bounds (rule B10), and on a copy with the
// Author's P-6 applied as drafted, each blank figure is refused by name. The figures here are this test's own.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseYaml } from "../../src/config/load.js";
import { validateBudgets } from "../../src/config/validate.js";
import { REPO } from "../helpers/twin.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const budgetsText = readFileSync(`${FIXTURES}budgets.yaml`, "utf8");
const budgets = (text: string) => validateBudgets(parseYaml("config/budgets.yaml", text));
const errors = (text: string) => budgets(text).issues.filter((i) => i.severity === "error");

const PUBLIC = `public:
  per_address:
    requests_per_minute: 6
    burst: 3
    requests_per_day: 10
  global:
    in_flight: 2
`;
const withPublic = (section: string): string => `${budgetsText.trimEnd()}\n${section}`;
const P6 = `${REPO}docs/merge-requests/2026-11-13-feat-001-p6-public-cap.patch`;

/** config/budgets.yaml as P-6 leaves it, as drafted: the patch's added lines appended to the real file, as its one hunk
 *  does. On a tree that holds P-6 already, the Author's `-p` branch, the file is first taken back to before it. */
function patchedBudgets(): string {
  const patch = readFileSync(P6, "utf8");
  const added = patch
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
  const real = readFileSync(`${REPO}config/budgets.yaml`, "utf8");
  const first = added.find((l) => l.trim() !== "") ?? "";
  const at = first === "" ? -1 : real.indexOf(`\n${first}\n`);
  const before = at === -1 ? real : real.slice(0, at + 1);
  return `${before.trimEnd()}\n${added.join("\n")}\n`;
}

describe("config/budgets.yaml's public section (P-6)", () => {
  it("is optional: the file without it validates as before, with no public cap", () => {
    expect(errors(budgetsText)).toEqual([]);
    expect(budgets(budgetsText).value?.public).toBeUndefined();
  });

  it("reads the four figures", () => {
    const result = budgets(withPublic(PUBLIC));
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.value?.public).toEqual({ requestsPerMinute: 6, burst: 3, requestsPerDay: 10, inFlight: 2 });
  });

  it("refuses P-6 as drafted, each figure blank, naming every key", () => {
    const found = errors(patchedBudgets());
    const paths = found.map((i) => i.path).sort();
    expect(paths).toEqual([
      "public.global.in_flight",
      "public.per_address.burst",
      "public.per_address.requests_per_day",
      "public.per_address.requests_per_minute",
    ]);
    for (const issue of found) {
      expect(issue.rule).toBe("B10");
      expect(issue.message).toContain("the Author's figure");
    }
  });

  it("accepts P-6 once each figure is filled in", () => {
    const filled = patchedBudgets()
      .replace(/requests_per_minute:\s+# the Author's figure/, "requests_per_minute: 6")
      .replace(/burst:\s+# the Author's figure/, "burst: 3")
      .replace(/requests_per_day:\s+# the Author's figure/, "requests_per_day: 10")
      .replace(/in_flight:\s+# the Author's figure/, "in_flight: 2");
    expect(errors(filled)).toEqual([]);
  });

  it.each([
    ["requests_per_minute: 6", "requests_per_minute: 0", "public.per_address.requests_per_minute"],
    ["requests_per_minute: 6", "requests_per_minute: 6.5", "public.per_address.requests_per_minute"],
    ["burst: 3", "burst: 7", "public.per_address.burst"],
    ["requests_per_day: 10", "requests_per_day: 5", "public.per_address.requests_per_day"],
    ["in_flight: 2", "in_flight: 999", "public.global.in_flight"],
    ["in_flight: 2", "in_flight: two", "public.global.in_flight"],
  ])("refuses %s changed to %s", (from, to, path) => {
    expect(errors(withPublic(PUBLIC.replace(from, to))).map((i) => i.path)).toContain(path);
  });

  it("refuses a key the section doesn't have", () => {
    const found = errors(withPublic(`${PUBLIC}  per_country: 1\n`));
    expect(found.map((i) => i.rule)).toContain("B10");
  });
});
