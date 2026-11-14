# Analysis: spec 027, across spec.md, plan.md, tasks.md, and ADR 0054

Read-only check, 2026-11-14, by the spec-writer, after tasks. Constitution check: VIII (the grounding is unchanged; the ADR records how much of the corpus a turn holds: FR-005, FR-013), V (no run-time cost; a paid call's reservation and each later stage's cost stated: ADR Context, Consequences), I (no byte leaves; degraded modes unchanged; stage 2's named), II (tests for the check; no run-time capability, so no span or panel; the run-time gap found is Q5), III (intent, spec, plan, ADR; a human merges), IV (no human-only path written: `docs/merge-requests/human-patches/027.md`), VI (the measurement is public and rerunnable). No control is deferred or dropped, so no deviation is named.

## Coverage

Every FR (001 to 014) and SC (001 to 004) maps to a task and a small test or the review (tasks.md, Coverage). The ADR is drafted on this branch; T005 finalizes its figures from the check. Each task names its test files and `make lint`; the full `make check` is the stack's last task, not this spec's (rule 4). The approval line and the Author's words are at the top of `plan.md` and `tasks.md`. Every clarification (Q1 to Q8) is on the questions page with its recommended answer, plus Q9 (spec 022's interaction) and Q10 (dev's slot).

## Consistency checks made

- **Figures**: the ADR's bytes and words equal `LC_ALL=C.UTF-8 wc -c -w` (114,123 bytes, 17,401 words for the twenty files; 96,567 and 15,089 for the topic files); its characters equal Node's string length (113,672). The room (21,182), the base (12,022), each grounding, free talk's 9,160 of 78,202 (11.7%), and the pack's 131 sections and 153,697 bytes agree across spec.md (Q1, Q2, Q6), plan.md, the ADR, the index row, and the questions page.
- **Thresholds**: T1 at the room with a band from 95% (20,123), T2 at 5% with a band from 7.5%, T3 at 10,485,760 bytes or 10,000 sections with a band from half of either: the same in Q2, Q6, the ADR's Decision 2, and plan §4's `THRESHOLDS`.
- **Terms**: "selectable topic" (a pack topic the room can select) throughout, never "ready" (readiness is `config/twin-readiness.yaml`'s, which this spec doesn't read); fixed in spec.md's US2 scenario 3 and the questions page during this check.
- **Quotes**: his item, his intent-015 words, his order's words, `08`'s privacy promise, `corpus/README.md`'s gap rule, spec 007's plan §4 and D27, D43, and `admission.ts`'s comment: each checked against its source, word for word.
- **Number**: 0054 is free on `main` and on every local branch (`git ls-tree` of each branch's `docs/adr/`); no night branch adds an ADR.
- **Overlap**: no other night spec's plan touches `apps/web/package.json`, `apps/web/build/twin-pack.ts`, or `docs/adr/README.md`. Spec 022's patch regenerates with the same command (Q9).

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A1 | Medium | The per-topic, room, rules, and free-talk figures came from a replica of the fit check (no `node_modules` in the spec-writer's worktree), not from `twin-pack.ts` itself. | T005 replaces them with the check's output; plan §9 records any difference. The room-parity test (T002) holds the check to `fitProblems`. |
| A2 | Medium | Mission's margin is 137 characters at the worst case. Spec 022's proposal adds "Do not claim" lines to `08`, which go into every turn's rules, so applying it may cross T1. | A note, not a failure (Q4); FR-008 keeps the turn working; on the page as Q9 with the recommendation that 022's note says so. The ADR's Consequences name it. |
| A3 | Low | T2's second trigger, a free-talk miss in the Author's live runs, isn't something the check can measure. | The ADR says so (Decision 2): the check measures the ratio; a miss is his to record on the decision page. |
| A4 | Low | `grounding.ts` computes the dropped sections' count, and no log or span carries it, though spec 007's plan §4 says "the drop is a log field". | Q5: stage 1's first task; recorded in the ADR's Consequences. Not this spec's to fix. |
| A5 | Low | dev and dev-cpu's local slot is 4,096 tokens (8,192 ÷ 2), below a twin turn's measured 8,201 to 8,803. | Outside this spec; recorded in the ADR's context table and on the page (Q10). |
| A6 | Low | The record's freshness test adds a step to a prompt or `limits.twin` change (the latter is the Author's file), which before needed no regeneration. | The failure names the command; the ADR's Consequences say so; the alternative (no freshness test) would let the ADR's "this size" go stale silently. |
| A7 | Info | SC-003's "small test" still pays the `apps/web` workspace's two site builds (`test/global-build.ts`) per run. | SC-003 and plan §5 say so; run the file alone, not the suite. |
| A8 | Info | Tasks T003 and T004 also run `test/twin-pack.test.ts`, though `twin-pack.ts` doesn't change. | Kept: it covers the `twin:pack` command whose script line changes, and it costs no extra build. |

No needs-clarification marker is left in the requirements. No finding blocks implementation.
