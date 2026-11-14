# Analysis: spec 022, across spec.md, plan.md, tasks.md

Read-only check, re-run 2026-11-14 by the rework's spec-writer (rework-spec-022), after the Opus review rv-spec-022 (blocking: B-1 to B-3) and its rework. `/speckit-analyze`'s prerequisite script needs `SPECIFY_FEATURE_DIRECTORY=specs/022-corpus-from-film-scripts` in this worktree (no `.specify/feature.json`); with it, it resolves the feature folder. Its optional `before_analyze` and `after_analyze` hooks (the git commit) are taken by hand: the save points are the night's.

Constitution check: VII (no ownership beyond `01`'s and `08`'s rulings: FR-002, plan §2 rules; the kill-switch film's "And only Hareet runs the final gate." carried only as `08`'s existing "only I merge"), VIII (corpus-only twin; unbuilt, stale, and moving claims kept out: FR-007, Q4), III (a human merges: FR-001, Assumptions), VI (the proposal and the left-out table are public). No deviation to name.

## The review's blocking findings, rechecked

| Review | Where it's fixed | Check |
|---|---|---|
| B-1, `kill-switch-b2` in scope but read by nothing (Q95) | spec Q1, Q2, FR-006, SC-003; plan §2 (first row), §3 R1, R2; tasks T001, T003, T004, T007 | Consistent: seven sections everywhere; sentences numbered by plan §3 R1's split; sources from `films/kill-switch-b2/materials.md`; the "five dollars" and "three fifty" amounts out, the daily figure `site.kill_switch_daily`, "only Hareet runs the final gate" only as "only I merge". |
| B-2, the number rule | spec Q3, FR-003, FR-004, US3; plan §3 R4, R5; tasks T001, T002; human patch's slot row | Consistent: stated as the spec's own rule, with `corpus/README.md`'s actual words; exempt spans named the same in FR-003 and R4; number words and word-currency forms from `guards.ts` as well as `check_corpus.py`'s `CURRENCY`, with parity tests; "Qwen3" dropped (plan §2 leaves the local model's name out); "ten cents" and "fifteen containers" fixtures in T001. |
| B-3, moving counts (Q96) | spec Q4, FR-003, FR-007; plan §2 (slots, evals row); tasks T005; human patch | Consistent: one slot, `site.prod_containers` (fifteen, prod's services in `deploy/compose.yaml` under `COMPOSE_PROFILES=gpu`, which I counted: edge, gateway, web, gateway-state, model-server-gpu, otel-collector, prometheus, loki, grafana, langfuse-web, langfuse-worker, langfuse-db, clickhouse, valkey, seaweedfs); case and red-team counts are gap lines. |
| C-1 to C-6 | SC-002, US1-2, tasks header and T008 (`patch -p1`); FR-009, plan §6, T009 (C9, `content:check`, `narration.test.ts`); US2, FR-013, cost estimate, plan §7 (free talk `ready: false`); intent, spec, plan, human patch (his words are g) "hareet-ai corpus from film scripts" only); spec Q2 and Source (the note's line 4, lines 41 to 48); spec Q6, plan §2, T006 (Golden Q&A 5's suggested sentence) | Consistent across the files. |

## Coverage

Every FR (001 to 013) and SC (001 to 004) maps to a task and a small test (tasks.md, Coverage). Each task names its test files and `make lint`; the full `make check` is T012 only (rule 4). The approval line and the Author's words are at the top of `plan.md` and `tasks.md`.

| Requirement | Tasks |
|---|---|
| FR-001 | T005, T008 |
| FR-002 | T005, T007 |
| FR-003, FR-004 | T001, T002, T005 |
| FR-005, FR-010 | T006 |
| FR-006, FR-007 | T003, T004 |
| FR-008 | T005, T009 |
| FR-009 | T009 |
| FR-011, FR-012 | T002 |
| FR-013 | T011 |
| SC-001 to SC-004 | T002, T003, T008, T009 |

No unmapped task: T000 is the Author's, T010 to T012 are the notes and the stack's one full run.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A1 | Medium | T009 needs node and `node_modules` in the export to regenerate the pack, the lock, and the cases, and to run `content:check`; agents' sandboxes may not run them. | T009 allows the fallback: patch the corpus files only, and the note lists the regeneration and `content:check` as the Author's first step. The reviewer must say which path was taken. |
| A2 | Low | Q2: his approval of the scripts is now cited (`docs/merge-requests/2026-11-11-feat-015-explainer-films.md:4`; line 10 for each `script.txt`); lines changed after it (lines 41 to 48) are marked per row. Which script lines those rows changed is the implementer's to establish against the note's diff, not this spec's. | T004 marks them; T007 checks each mark. |
| A3 | Low | Q6's Haiku quote is "this session, 2026-11-10": not in any filed intake. The tag `[A 2026-11-10]` needs it to be his. | Marked "to confirm" (FR-010, T006); on the page as Q24. |
| A4 | Low | `apps/web/content/resume.lock.json` and C9's forbidden list are also touched by the resume item's stack. | Plan §6, T010, and the human patch name the overlap; the later merge regenerates the lock and re-runs `content:check`. |
| A5 | Low | Q1's other reading (third-party screenplays) would change the whole deliverable; FR-012 and the quoting table cover only the rule, not the work. | If he picks it, the spec is reworked before merge (the order's rule 1). |
| A6 | Medium | Plan §2 named a new `08` section "How it's built" (from `SCRIPTS.md` §6), and FR-002 "how it's built (the lifecycle)"; `08` already has `## How it's built` tagged `[A 2026-11-06]`, his. Two headings of one name, or `[P]` lines under his tagged heading, would blur whose words they are. | Rename the new section "How a change is made" in FR-002, plan §2, and the human patch; `08`'s own section stays his. Applied after this analysis, in the same commit. |
| A7 | Low | `[P]` is "Public artifact, with URL" (`corpus/README.md`); the repository isn't public yet (`08`, Public artifacts). The new `[P]` lines point to URLs that resolve only after publication. | A new question on the page (recommended: keep `[P]` with the repository URL, as `08` already cites the repository; the proposal says so). T000 lists it. |
| A8 | Low | FR-003 and plan §3 R4 say G1's number words "with plurals"; `guards.ts` reads a plural only for its `SCALES` ("hundreds", "dozens"). | The parity test reads `guards.ts`'s pattern, so the checker follows the code; the wording is read as "the plurals G1 reads". No change. |
| A9 | Info | The review's own file (`/home/h4reet/h4reet-ai/night/.io/rv-spec-022/out/review.md`) wasn't readable in this container, and its branch has no commit of its own; N-1 to N-5 and the three summarized nits weren't in the brief's lines. | Not addressed by name; left for rv-rework-spec-022 to recheck (notes, page's Interruptions). Nits found here and fixed: `corpus/README.md`'s currency rule is rule 2, not 3; the comparison cuts' quote is `films/README.md:17`'s actual words; Q1's "seven films" is cited to the films' note, line 10 (the old A7); T012's "whichever is later" is "the supervisor names it" (the old A5). |

**Metrics**: 13 functional requirements, 4 success criteria; 13 tasks (T000 to T012); coverage 100%; ambiguity 1 (A8, no change); duplication 1 (A6, fixed); critical 0.

No needs-clarification marker is left in the requirements. No finding blocks the build; A6 is fixed in the same commit, and A7 waits on the page with its recommended answer, which the build takes.

## Next actions

Implementation (impl-022) waits for rv-rework-spec-022, an Opus reviewer that didn't write this rework, then starts from this branch's tip.
