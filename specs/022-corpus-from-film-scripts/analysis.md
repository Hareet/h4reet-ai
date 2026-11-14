# Analysis: spec 022, across spec.md, plan.md, tasks.md

Read-only check, re-run 2026-11-14 by the third rework's spec-writer (rework3-spec-022), after rv-rework-spec-026's I-1 (Opus, important) and this rework; the second rework's run (rework2-spec-022, after rv-rework-spec-022's R-1) is kept below where nothing moved. `/speckit-analyze`'s prerequisite script needs `SPECIFY_FEATURE_DIRECTORY=specs/022-corpus-from-film-scripts` in this worktree (no `.specify/feature.json`); with it, it resolves the feature folder. Its `before_analyze` and `after_analyze` hooks (the git commit, both optional) are taken by hand: the save points are the night's.

Constitution check: VII (no ownership beyond `01`'s and `08`'s rulings: FR-002, plan §2 rules; the kill-switch film's "And only Hareet runs the final gate." carried only as `08`'s existing "only I merge"), VIII (corpus-only twin; unbuilt, stale, moving, and contradicted claims kept out: FR-006, FR-007, Q4, Q104), III (a human merges: FR-001, Assumptions), VI (the proposal and the left-out table are public). No deviation to name.

## rv-rework-spec-026's I-1, rechecked (the third rework)

| Finding | Where it's fixed | Check |
|---|---|---|
| I-1: the human-patch note said no visitor reaches the new text until he opens free talk or a topic that reads `08`, but the patch's new "Do not claim" lines are in every topic's hash | `docs/merge-requests/human-patches/022.md` (a paragraph before the table; a `config/twin-readiness.yaml` row; the old line 17 rewritten); plan §6 (Readiness paragraph), §7; spec Clarifications (Q141), US2, FR-013, Cost estimate, Assumptions; tasks T000, T010 | Consistent: every place says the patch closes mission, work projects, and hobbies and travel until he re-runs his evaluations and re-marks them, and free talk alone reads `08`'s sections. Rechecked on `night/fix-020/fix-020`: `twin-pack.ts` line 17 (rules hold every "Do not claim" bullet), `topicHashInput` lines 220 to 228 (`rules: pack.rules` in every topic's hash); `config/twin-readiness.yaml` holds the three `ready: true` and `free_talk: { ready: false }`; `apps/web/src/talk/talk.ts` line 365 (a not-ready topic's turn "goes nowhere"), which plan §7 cites for "no visitor-paid call". |
| Q141: back to back with spec 026's corpus patch, evaluated once | the note's paragraph and last paragraph; plan §6, §7; spec Q141, US2, Assumptions; T000 | Named as spec 026 names 022 (read on `night/rework-spec-026/rework-spec-026`: `human-patches/026.md` items 1 and 5 and its last paragraph, plan §7): "whichever is second rebuilt on the first", both regenerating `config/twin/corpus.json`, the narration cases, and `docs/corpus-size.json`, only the generated files overlapping, one round of evaluations for the three topics (026's item 5). |
| Q145: the patch regenerates `docs/corpus-size.json` | the note's table (a new row); plan §1, §6; spec Q145, FR-009; T009, T010 | Consistent with spec 027 (read on `night/rework-spec-027/rework-spec-027`: spec Q145, plan §7, T008): written by `npm run twin:pack -w apps/web` once 027's code is on the line; if this patch is built first, 027's T008 rebuilds it with the record, and the note names the stage then. |

## The second review's findings, rechecked

| Review | Where it's fixed | Check |
|---|---|---|
| R-1 (blocking), list numbering read as numbers | spec FR-003, US3 scenario 3; plan §2 (Golden Q&A numbered on from `08`'s last), §3 R4 (exempt spans), §8; tasks T001 (passing fixture `9. *How does the kill switch stop spending?* — … [P]`), T005 | Consistent: the exemption is `^\s*\d+\.\s`, the same as `guards.ts`'s `numbersSource` (its third `replace`) and the prefix `twin-pack.ts`'s `GOLDEN_ITEM` (`/^(\d+)\.\s+(.*)$/`) reads. |
| R-2 (Q104), "production" is the laptop's stack | spec Input, Q4, FR-003, FR-006; plan §2 (kill-switch, local-first, stack rows; the slot's `source` and `label`), §8; tasks T004, T005, T007; human patch | Consistent: every place names `ENV=prod`, `COMPOSE_PROFILES=gpu`. Rechecked here: under that profile `deploy/compose.yaml` runs fifteen services, and only `gateway` lists `egress`; `tunnel` (profile `tunnel`), `tunnel-end-collector` (`tunnel-end`), and `ec2-snapshot-publisher` (`ec2`) also list it. The road-out line's source is `deploy/compose.yaml`'s `networks`. |
| R-3, `AMOUNT_WORDS_PY_SOURCE` isn't one literal | spec FR-004; plan §3 R4 (three numbered patterns); tasks T002 | Consistent: the word-currency copy and its parity test read `redteam/run.py`'s `_NUMBER_WORDS` and `AMOUNT_WORDS` blocks, as `twin-guards.test.ts:590-609` does; `EXTRA_PATTERN` is kept, its fixed words named. "At three fifty" matches none of the three currency patterns; R4's number words catch it (plan §3 R4, T001), checked here with Python against `AMOUNT_WORDS`. |
| R-4, attribution | spec header, Clarifications preamble, Open Questions; tasks T000, T006 | The page's "answered" record is named as the page's; the orders file's rule 1 is quoted as the brief gives it, as the orders file's; T000 lists Q1 to Q6, Q95 to Q97, Q102, Q104, and the new question. |
| R-5, carried in part, "contradicted by the repository", "shown as built" | spec Q2, FR-006; plan §2 (kill-switch and stack rows), §3 R1 (the split joins file lines 9 and 11), R2, R3; tasks T001, T003, T004, T007 | Consistent: the closed list is the same eight reasons in FR-006 and R2; the examples (`kill-switch-b2` file lines 5, 7, 9 and 11; `SCRIPTS.md` §1 line 2; §5 line 1) are the same in spec, plan, and T004. |
| N-a | plan §3 R1: "the quoted message on the file's line 15" | Fixed. |
| N-b | spec FR-003, plan §3 R4: "the plurals G1 reads", its `SCALES`' only | Fixed; the old A8 is closed. |
| N-c | tasks T007, T010, T011 name `make lint`; T010, T011 name `pytest evals/test_docs_links.py evals/test_repository_docs.py`; plan §5 | Fixed. |
| N-d | plan §2's cost-meter row leaves out "to the millionth of a dollar" (§1 line 2, carried in part) | Fixed. |
| N-e | spec Q1 quotes the note's line 10 with its markup (`**Seven explainer films**`) and says so | Fixed. |
| rv-spec-022's N-1, analysis A1's CLAUDE.md citation | A1 below | The first analysis's A1 cited "CLAUDE.md: agents' pytest and node_modules are the Author's host's", which CLAUDE.md doesn't say; the first rework dropped it, and A1 now cites the evidence instead (this worktree has no `node_modules`; notes). |
| N-2 | tasks T000 (its small tests), T006, T007 (`make lint`) | Fixed. |
| N-3 | tasks T007, plan §4: a reviewer task the supervisor queues | Fixed. |
| N-4 | spec Input and the quoting table: `intent/015-explainer-films.md` ("made with the huashu-motion skill as editable code (HTML and GSAP)") and `LICENSE`, not ADR 0050 | Fixed. |
| N-5 | spec Q3, tasks T005: the `[P]` lines' URLs resolve at publication, the proposal says so (Q102) | Fixed. |

The first review's B-1 to B-3 and C-1 to C-6, cleared by rv-rework-spec-022, are unchanged here.

## Coverage

Every FR (001 to 013) and SC (001 to 004) maps to a task and a small test (tasks.md, Coverage). Each task names its tests; the full `make check` is T012 only (rule 4). The approval line and the Author's words are at the top of `plan.md` and `tasks.md`.

| Requirement | Tasks |
|---|---|
| FR-001 | T005, T008 |
| FR-002 | T005, T007 |
| FR-003, FR-004 | T001, T002, T005 |
| FR-005, FR-010 | T006 |
| FR-006, FR-007 | T001, T003, T004 |
| FR-008 | T005, T009 |
| FR-009 | T009 |
| FR-011, FR-012 | T002 |
| FR-013 | T011 |
| SC-001 to SC-004 | T002, T003, T008, T009 |

No unmapped task: T000 is the Author's, T010 to T012 are the notes and the stack's one full run.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A1 | Medium | T009 needs node and `node_modules` in the export to regenerate the pack, the lock, and the cases, and to run `content:check`. This worktree has none (`make lint` stops at "node_modules is missing", notes), so an agent's export may not either. | T009 allows the fallback: patch the corpus files only, and the note lists the regeneration and `content:check` as the Author's first step. The reviewer must say which path was taken. |
| A2 | Low | Which script lines the films' note's rows (lines 41 to 48) changed after his approval is the implementer's to establish against the note's diff. | T004 marks them; T007 checks each mark. |
| A3 | Low | Q6's Haiku quote is "this session, 2026-11-10": not in any filed intake. | Marked "to confirm" (FR-010, T006); on the page as Q24. |
| A4 | Low | `apps/web/content/resume.lock.json` and C9's forbidden list are also touched by the resume item's stack. | Plan §6, T010, and the human patch name the overlap; the later merge regenerates the lock and re-runs `content:check`. |
| A5 | Low | Q1's other reading (third-party screenplays) would change the whole deliverable. | If he picks it, the spec is reworked before merge (the orders file's rule 1). |
| A6 | Low | R1's split joins "At five dollars..." and "it stops itself." into one sentence, so SC-003's count for `kill-switch-b2` is one less than a split at every `...`. | Stated once, in plan §3 R1; T003's real-script test holds the count to that split; spec FR-006 and T004 cite it. |
| A7 | Low | The tunnel clause in "From outside, there's no door: …" is left out as unbuilt on `materials.md`'s "shown as built" note, which reads the Author's words beside it. That reading is this rework's. | On the page as a new question with its recommended answer (leave it out as unbuilt), which the build takes; T000 lists it. |
| A8 | Info | Outside this spec: `deploy/compose.yaml`'s header comment (line 9: "only `gateway` joins `egress`") and `films/kill-switch-b2/materials.md`'s networks row ("egress (gateway only)") are true only without the `tunnel`, `tunnel-end`, and `ec2` profiles. | Not this spec's to change (no code, no film edit). Named in the notes for the Author and ops; the proposal says the road-out line only of the laptop's stack (Q104). |
| A9 | Info | rv-spec-022's three summarized nits were in neither rework's brief. | Left for rv-rework2-spec-022 to recheck (spec Assumptions, notes). |
| A10 | Low | Where the record starts: the human-patch note says "once spec 027's code is on main" (the Author's view, as spec 026's note says it); the spec, plan, and T009 say "on the line" (the builder's view). Both hold: the patch is built on the line and applied on main. | Left as is; T009 says what to do if 027's code isn't on the line yet. |
| A11 | Low | The stage the patch's record shows (spec 027 projects mission past T1 if `08`'s new lines pass its margin) isn't known until the patch is built. | T010 and spec 027's T008 write it into the note then; not this spec's to measure. |

**Metrics**: 13 functional requirements, 4 success criteria; 13 tasks (T000 to T012); coverage 100%; ambiguity 0 (the old A8 fixed by N-b); duplication 0; critical 0; 11 findings (1 Medium, 8 Low, 2 Info).

No needs-clarification marker is left in the requirements. No finding blocks the build; A7 waits on the page with its recommended answer, which the build takes.

## Next actions

The second rework was cleared by rv-rework2-spec-022. This third rework changes only I-1's lines, Q141 and Q145; a reviewer that didn't write it may confirm them, then impl-022 starts from this branch's tip.
