# Analysis: spec 028, the room after the Author's review

`/speckit-analyze`'s checks, done by hand on `spec.md`, `plan.md`, and `tasks.md` at this branch's tip, read-only but for the fixes named below (each made in its own commit before this file). The spec-writer analyzes its own artifacts here; the spec's review is another worker's.

## Coverage: requirements to tasks

| Requirement | Tasks | Test files |
|---|---|---|
| FR-001, FR-003 (no portrait; the panel always open) | T-A03 | `test/ui/split-no-still.test.ts`, `hud-split.test.ts` (rewritten), `hud-split-rest-row.test.ts` (rewritten) |
| FR-002 (no still in 3D; V1) | T-A03, T-INT | `split-no-still.test.ts`; `test/disclosure.test.ts`, `evals/test_disclosure.py` |
| FR-004 to FR-009 (the wall box, the area, the columns, the scale, the rule) | T-A01, T-A02, T-A03 | `test/room/wall-box.test.ts`, `hud-wall-geometry.test.ts`, `test/ui/hud-wall-dom.test.ts` |
| FR-010 (the compositor) | T-A05 | `stages.test.ts`, `stages-floor.test.ts`; `room:check`, `room:report` |
| FR-011 (the list's cap slot) | T-A04 | `test/ui/hud-split-list.test.ts` |
| FR-012, FR-014, FR-015 (the notes) | T-A06 | `test/ui/notes-gone.test.ts` and the rewrites of plan §R-B8 |
| FR-013 (the Credits page) | T-A07 | `test/ui/credits.test.ts` |
| FR-016 ("Around the room") | T-A08 | `a11y.test.ts`, `text-copy.test.ts`, `around.test.ts` (rewritten cases) |
| FR-017, FR-018 (the room's dog) | T-B02, T-B05 | `dog-figure.test.ts` (rewritten), `dino-scene-wiring.test.ts` |
| FR-019 to FR-024, FR-026 (the scene) | T-B03, T-B04, T-B05 | `dino-scene*.test.ts`, `twin-states.test.ts` (added cases), `test/ui/bubble.test.ts` |
| FR-025, FR-032 (the eating after the scene; the probe) | T-B06 | `eat-after-scene.test.ts`, `dino-cutout-visit.test.ts` |
| FR-027 (the introduction) | T-B08 | `dog-intro-build.test.ts`, `dog-intro-line.test.ts`; `content:check` on the patched export |
| FR-028 (the run and the petting unwired) | T-B02 | `pet-shell.test.ts`, `chase-stage.test.ts` (rewritten), `pet-dormant.test.ts` |
| FR-029, FR-030 (RK5, V1) | T-B07, T-INT | `dog-first-visit.test.ts`, `dog-disclosure.test.ts`, `dog-report.test.ts` (rewritten), `disclosure.test.ts`, `evals/test_disclosure.py` |
| FR-031 (the PDF) | T-B09 | none (no code); the note |
| SC-008 (his look) | T-INT's note | — |
| ADR 0055's two cases | T-DOC | — |

Every FR has a task; every task names its test files; T-INT is last and runs the one `make check`.

## Findings, and what was done

| ID | Kind | Finding | Done |
|---|---|---|---|
| F1 | Coupling | FR-020's bubble was clamped "inside the wall box", group A's module, which group B can't have until the merge. | Clamped inside the frame area, which the 3D stage already holds (spec FR-020, plan §R-B5, T-B05). |
| F2 | Underspecified | FR-027 said "when the hand-off ends", but the 2D room has no hand-off. | 3D at the hand-off's end; 2D when the room first shows (FR-027). |
| F3 | Coverage | FR-007 and FR-008's DOM placement (the tiles in the column, the scales) had no named test. | `test/ui/hud-wall-dom.test.ts` in T-A03. |
| F4 | Coverage | FR-028's dormant petting had no test. | `test/room/pet-dormant.test.ts` in T-B02. |
| F5 | Hidden pin | `test/room/vocabulary.test.ts` pins the closed key list exactly, so T-B01's keys fail it unless it is changed with them. | T-B01 adds the rows test-first, as specs 025 and 026 did. |
| F6 | Reversal | Q11 first let the stand-in eat, overturning night 1's page Q247, which `probe-eat-028` showed is the Author's own answer, not a recommended one. | Q11 rewritten to keep his condition for the eating and to gate the scene on it too; FR-018, FR-019, FR-025, FR-029, SC-005, plan §R-B1, §R-B6, T-B02, T-B06 follow. |
| F7 | Probe | `probe-pdf-028` found the candidate's four annotations on the four claims. | Q19, FR-031, T-B09: no code; the note points to his P8 and the probe's question. |
| F8 | Risk, open | RG7's legibility floor at the reference stages may fail with the room framed between the columns (plan R-1). | T-A05 stops and asks on the page if it fails; never lowers the floor. Not decidable before the run. |
| F9 | Risk, open | Rewriting tests of specs 004, 016, 018, 020, 025, and 026 departs from those plans' "no test edited" lines. | Named in plan §R-B8 with the questions that cause each; each rewrite in the task that changes its subject, test-first, its cases listed. |
| F10 | Constitution | The scene and the introduction send no usage event (Principle II, Workflow 7). | Named deviation under ADR 0055's reason; T-DOC adds the cases to ADR 0055. |
| F11 | Honest AI | The likeness lines leave the screen. | His answer moves them to the Credits page; they stay in "Around the room"; the banner stays (FR-012, FR-013, FR-015). |
| F12 | Note | A cut-out dinosaur visit no longer shows the placeholder note that hinted why nothing happens (`probe-eat-028`'s "What a visitor is told"). | Its words stay in "Around the room"; the stack's note tells him (FR-032). A visible line elsewhere would add to his answer, so it isn't taken. |

## Consistency

- Terms: "the split layout", "the wall box", "the panel", "the column", "the scene" are defined once in spec.md's Requirements and used the same in plan and tasks.
- Every question Q1 to Q19 names its requirements; every requirement names its question where one exists.
- The shared files (plan §6) are each owned first by one group, with the second's task starting from the first's named commit, or the integration task.
- Nothing of `corpus/**` is written but the proposal (T-B08), and no human-only path.

## Not checked here

- Numbers: plan §R-A3's table and §R-B4's points are the tasks' to print and record (T-A01, T-B03).
- The Author's look (SC-008).
