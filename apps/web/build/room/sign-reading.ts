// The sign check's page half (spec 014; FR-056 (d), FR-059; contracts/sign-check.md §3 step 5; plan.md PD-21): a turn's
// three facts, its status and, for a 200, its route and cost, read through the room's own turn-cost code, as the neon
// sign reads a reply: classifyTurn, a configured cost channel (live.turn: site), report(..., "turn"), and costReadings
// with the index's UI words. `npm run -s room:sign -w apps/web` reads one JSON object of facts a line on standard
// input and prints the two counters' words, {"call", "visit"}, a line each. It reads nothing else of a reply, so no
// words of the twin's ever reach it; the UI words come from the compositor over the tree, as the build composes them.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { classifyTurn, costReadings, createCostChannel } from "../../src/room/signals/turn-cost";
import type { CostWords } from "../../src/room/signals/turn-cost";
import { REPO_ROOT } from "../policy";
import { compose } from "./compose";
import { noPolicy } from "./policy";
import { fileTree } from "./source";

/** A turn's three facts (contracts/sign-check.md §3 step 4). */
export interface TurnFacts {
  readonly status: number;
  readonly route?: unknown;
  readonly cost_micro_usd?: unknown;
}

/** The sign's two counters' words after one turn with these facts, on a fresh channel. */
export function signReadings(facts: TurnFacts, words: CostWords): { call: string | null; visit: string | null } {
  const body = facts.status === 200 ? { route: facts.route, cost_micro_usd: facts.cost_micro_usd } : {};
  const channel = createCostChannel({ configured: true, clock: { now: () => 0 } });
  channel.report(classifyTurn({ kind: "response", status: facts.status, body }), "turn");
  const r = costReadings(channel.state, words);
  return { call: r.call?.text ?? null, visit: r.visit?.text ?? null };
}

/** The index's UI words, as a release build composes them. */
function uiWords(): Readonly<Record<string, string>> {
  return compose(fileTree(REPO_ROOT), noPolicy(), { mode: "lenient", drafts: false }).index.ui;
}

function main(): number {
  const words: CostWords = { ui: uiWords(), drafts: false };
  const input = readFileSync(0, "utf8");
  for (const line of input.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const facts: TurnFacts = {
      status: typeof parsed.status === "number" ? parsed.status : 0,
      route: parsed.route,
      cost_micro_usd: parsed.cost_micro_usd,
    };
    process.stdout.write(`${JSON.stringify(signReadings(facts, words))}\n`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
