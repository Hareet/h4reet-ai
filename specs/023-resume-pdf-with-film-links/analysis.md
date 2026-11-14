# Analysis: spec 023 (spec.md, plan.md, tasks.md), 2026-11-14

Read-only cross-check, by the spec-writer who wrote them (the review of the code is a later task by another worker, T011). Constitution check: I (local-first, no run-time dependency), VII and VIII (no new claim about him; links only), the disclosure rule (V1, FR-011), cost $0, no human-only path edited. No violation.

| # | Finding | Severity | Action |
|---|---|---|---|
| A-1 | Every FR maps to a task (tasks.md "Coverage"); FR-004 has no task, by design: it's an absence, shown by T012's run. | none | – |
| A-2 | Each task names small tests, as rule 4 asks; T009 is prose and runs `make lint` only. The single full `make check` is T012. | none | – |
| A-3 | The spec assumes the approved file (C-0002) already holds the four claims as text. The only evidence is `films/RESUME-LINKS-PLAN.md` ("The resume's twin section … lists four claims") and the C-0002 approval of 2026-11-09, which may predate that section. T003's spike reads the file. If the claims aren't there, route (a) is impossible (it can't add text) and the night ends at route (b). | medium | T003 states this as its stop condition. Recorded in questions.md as Q-D's neighbour. |
| A-4 | US1 AC1 says the links the approved file already has stay. T006 must assert them (the existing links read before and after, as a subset). | low | Folded into T006 when the implementer writes it; noted here. |
| A-5 | The claims' exact wording is unknown until T002 reads the PDF. FR-001 names them in capitals as the plan file does; they are labels, not quotes. | low | T002 records the strings it finds. |
| A-6 | Q6's correction of `films/RESUME-LINKS-PLAN.md` step 5 rests on my reading of spec 002's amendment ("Absent, unapproved, or without the header, the PDF is the render"). The reading is from the spec's text, not a build run. T006 doesn't test it (existing tests do). | low | The Author sees it on the page. |
| A-7 | The repository isn't public (`corpus/08`), so SC-001's "lands on a page that exists" is only checked by file existence on the night. | known | FR-010 puts the click-through at his step. |
| A-8 | `docs/data-flow-disclosure.md` may be edited by other night specs; this spec touches V1's row only. | low | Plan, "Files expected to be touched". |
| A-9 | No contradiction found between spec 002's contract §7 and this spec: PDF5's allowlist already admits `github.com/hareet/…` (case-blind first segment). | none | – |

Nothing blocks the implementer. Open for the Author: questions.md (Q-A to Q-F), each with a recommended answer already taken.
