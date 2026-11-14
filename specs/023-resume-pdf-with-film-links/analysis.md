# Analysis: spec 023 (spec.md, plan.md, tasks.md), re-run 2026-11-14 after rv-rework-spec-023

Read-only cross-check by the spec-writer who reworked them a second time (rework2-spec-023); this rework is reviewed by another worker, and the code by T011's reviewer. Constitution check: I (local-first, no run-time dependency; the one new byte off a visitor's device, a click in the PDF, is disclosed in V1's Trigger, FR-011, in words the disclosure gate can't mistake for a disclosed host), IV (no agent writes `assets/policy/**` or the served file; the writer runs only under an explicit opt-in in vitest, never from a script the Author runs; the human-only gates are run read-only, never edited), VII and VIII (no new claim about him; links only; his quotes checked against `corpus/08-hareet-ai.md`, and no answer is quoted as his), cost $0, no human-only path edited. No violation.

## rv-rework-spec-023's findings, as fixed

| Finding | Where fixed |
|---|---|
| R1 (blocking) `github.com` in a code span in V1 would count as disclosed for `tools/gates/disclosure_check.py` (`Rows.read`, `TICKED`) | spec FR-011: the host is plain text, "(its backticks are part of it)" dropped, the reason stated; same place, no pipe, the leading space. Plan §7 and T010 carry the sentence word for word (the three copies compared byte for byte by this run: identical, no backtick, no pipe). T010's and plan §7's small tests add the gate's test and a read-only run of the gate. T010 also names V1's place apart from V4's, which holds `following the PDF link` too. |
| I-1 runs after the stack note's edits | plan "Small tests"; T008, T012 (after the paste), T013: `vitest run test/content/film-links.test.ts` and `python3 -I evals/docs_links.py`. |
| N1 `films/kill-switch-b2/media/kill-switch.gif` is tracked | The earlier F3 and its bullet in `notes.md` dropped; nothing about it goes to the stack note. Checked: `git ls-files` lists it, 7,038,051 bytes, first in 8bc0788c. |
| N2 the page's numbers | spec Clarifications: Q1 = Q25, Q2 = Q26, Q4 = Q27, Q5 = Q28, Q6 = Q29, Q7 = Q30, Q8 = Q31, and Q98; plan R-1 names Q28. |
| N3 no answer quoted as his | spec Q98's answer and T009: "taken provisionally under his order of 2026-11-13; he confirms or overturns it on the page"; the session's lead says the same of Q1 to Q8. |
| N4 "neither", and the candidate file's absence | spec FR-013; plan §3 (cases 5, 7, 8, 9, 10 skip with "neither: see case 0"; 1 to 4 and 6 run; case 0 fails); plan §5, T006, T008, and the human patch name the file, not the folder. |
| N5 a deterministic writer | plan §2 (the original `/ID`, `/Root`, `/Info` copied; nothing time-based); T006's case 7. |
| nit T007's arrival check | T007 and plan "Small tests". |

## Findings of this run

| ID | Category | Severity | Location | Summary | Action |
|---|---|---|---|---|---|
| F1 | Underspecification | low | spec FR-011; T010 | `following the PDF link` occurs in V1 and V4. | Fixed: T010 names V1's place, followed by `, and following "Credits"`, which occurs once in `docs/data-flow-disclosure.md`. |
| F2 | Underspecification | low | spec FR-013; plan §3 | The spec names the kinds of case that skip; the plan the numbers and titles. | Kept, as before; the spec points to plan §3 for the titles. |
| F3 | Coverage | none | tasks "Coverage" | Every FR (001 to 013) and SC (001 to 005) maps to a task; FR-004 is an absence, shown by T012's run. US1-AC3, US2-AC2, US3-AC1 have their own cases (8, 10, 9). | – |
| F4 | Ambiguity | none | – | No vague adjective or open placeholder but the human patch's, which are deliberate (his date, his reason, the hash T008 fills). | – |

**Metrics**: 13 FRs, 5 SCs, 13 tasks; coverage 100% (FR-004 by absence); ambiguities 0; duplications 0; critical 0.

Nothing blocks the implementer. Open for the Author on the page: Q25 to Q31 (this spec's Q1, Q2, Q4 to Q8; Q3 settled by the corpus) and Q98, each with its recommended answer taken provisionally.
