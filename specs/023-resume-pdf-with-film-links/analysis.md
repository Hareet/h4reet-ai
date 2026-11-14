# Analysis: spec 023 (spec.md, plan.md, tasks.md), re-run 2026-11-14 after rv-spec-023

Read-only cross-check by the spec-writer who reworked them (rework-spec-023); the rework itself is reviewed by another worker (rv-rework-spec-023), and the code by T011's reviewer. Constitution check: I (local-first, no run-time dependency; the one new byte off a visitor's device, a click in the PDF, is disclosed in V1's Trigger, FR-011), IV (no agent writes `assets/policy/**` or the served file; the writer runs only under an explicit opt-in in vitest, never from a script the Author runs), VII and VIII (no new claim about him; links only; his quotes checked against `corpus/08-hareet-ai.md`), cost $0, no human-only path edited. No violation.

## rv-spec-023's findings, as fixed

| Finding | Where fixed |
|---|---|
| B1 `kill-switch-b2`'s MP4 is `media/kill-switch.mp4` | the table's `media` field (spec FR-003, FR-012, Key Entities, US1-AC2, Assumptions; plan §1, §3 case 2, Departures; T001, T002). No film file renamed. |
| B2 the checks after publication | spec FR-006 (guard binds the writer only), FR-013 (three states); plan §3's state table and cases 0 and 10; `pdf_sha256` in the table, the hash's one home; T006, T007; human patch (both routes reach "published" with no test edited). |
| B3 the disclosure sentence | spec FR-011 gives the exact text and its place inside V1's Trigger, before spec 016's closing words, which `evals/test_disclosure.py:410` holds with `endswith`; plan §7; T010 runs `test/disclosure.test.ts` and `evals/test_disclosure.py` too. |
| I1 the appended section's structure | spec US1-AC3, SC-004; plan §2, §3 case 8; T006. |
| I2 "Q-A to Q-F", "Q-D" | spec Clarifications names its Q1 to Q8 as the page's Q25 to Q31; plan R-1 and T003 name the page's Q31 and a new question if a dependency is needed. |
| N1 (Q98) dated notes, his text kept | spec Clarifications (rework session); plan §6; T009. |
| N2 `human-patches/023.md` among the files touched | plan "Files expected to be touched"; tasks "Files touched". |
| N3 T008's hash case, with RED | plan §3 case 9; T008 RED then GREEN. |
| N4 the night's branch names | spec header; plan header; tasks header. |
| N5 "the edit, as RESUME-LINKS-PLAN step 1 gives it" | spec Q5, FR-007; plan §5; T008. |
| nit: US3-AC1's edit text is prose | US3-AC1 now says the writer and checks follow the table, and the prose is rewritten by hand, held by case 9. |
| nit: "the next free ID on main" | spec FR-010; plan §4; human patch ("C-0005 today"). |

## Findings of this run

| ID | Category | Severity | Location | Summary | Action |
|---|---|---|---|---|---|
| F1 | Inconsistency | medium | plan §3 case 9; human patch route (b) | Case 9 (the notes' hash equals `pdf_sha256`) would fail under route (b), where the table holds his render's hash and the notes the night's candidate's; and "before: every case runs" contradicted case 10 being published-only. | Fixed in this run: case 9 runs in "before" only; case 10 skips in "before" with its reason (spec FR-013, plan §3, T006, T008). |
| F2 | Underspecification | low | spec FR-013; plan §3 | The spec's FR-013 points to the plan's case numbers for which cases skip. | Kept: the spec names the kinds (the candidate's, the notes'), the plan the numbers. |
| F3 | Out of scope, for the Author | low | `films/kill-switch-b2/README.md:8` | The kill switch's landing page, which the PDF's third link reaches, shows `media/kill-switch.gif`, which `git ls-files films` doesn't list; the other three films comment theirs out until the media commit. The page will show a broken image unless the GIF lands. | Not this spec's to fix (no film file is touched). Goes in the stack note's item for 023 (T013), for the Author. |
| F4 | Coverage | none | tasks "Coverage" | Every FR (001 to 013) and SC (001 to 005) maps to a task; FR-004 is an absence, shown by T012's run. US1-AC3, US2-AC2, US3-AC1 have their own cases (8, 10, 9). | – |
| F5 | Ambiguity | none | – | No vague adjective or open placeholder but the human patch's, which are deliberate (his date, his reason, the hash T008 fills). | – |
| F6 | Earlier A-3 (claims as text in C-0002) | resolved | plan R-1 | rv-spec-023 read the approved file: four claims, each one text run; a classic xref; four links; no script. T003 still confirms and records it. | – |

**Metrics**: 13 FRs, 5 SCs, 13 tasks; coverage 100% (FR-004 by absence); ambiguities 0; duplications 0; critical 0.

Nothing blocks the implementer. Open for the Author: the page's Q25 to Q31 (this spec's Q1 to Q8; Q3 settled by the corpus) and Q98, each with its recommended answer taken.
