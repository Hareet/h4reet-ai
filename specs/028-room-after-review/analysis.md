# Analysis: spec 028, the room after the Author's review

`/speckit-analyze`'s checks, done by hand on `spec.md`, `plan.md`, and `tasks.md` at this branch's tip, read-only but for the fixes named below (each made in its own commit before this file). The spec-writer analyzes its own artifacts here; the spec's review is another worker's.

## Coverage: requirements to tasks

| Requirement | Tasks | Test files |
|---|---|---|
| FR-001, FR-003 (no portrait; the panel always open) | T-A03 | `test/ui/split-no-still.test.ts`, `hud-split.test.ts` (rewritten), `hud-split-rest-row.test.ts` (rewritten) |
| FR-002 (no still in 3D; V1) | T-A03, T-INT | `split-no-still.test.ts`; `test/disclosure.test.ts`, `evals/test_disclosure.py` |
| FR-004 to FR-009 (the wall box, the area, the columns, the scale, the rule); SC-001 as reworked | T-A01, T-A02, T-A03, R-028a (N-4) | `test/room/wall-box.test.ts`, `hud-wall-geometry.test.ts`, `test/ui/hud-wall-dom.test.ts` |
| FR-010 (the compositor) | T-A05 | `stages.test.ts`, `stages-floor.test.ts`; `room:check`, `room:report` |
| FR-011 (the list's cap slot) | T-A04 | `test/ui/hud-split-list.test.ts` |
| FR-012, FR-014, FR-015 (the notes; the placeholder words in "Around the room") | T-A06, R-028a | `test/ui/notes-gone.test.ts` (scoped, B-2), `test/ui/text-copy.test.ts` (`setPlaceholders`, I-1), and the rewrites of plan §R-B8 |
| FR-013 (the Credits page) | T-A07 | `test/ui/credits.test.ts` |
| FR-016 ("Around the room": dock and stacked visible, focus overlay) | T-A08, R-028a | `a11y.test.ts`, `text-copy.test.ts`, `around.test.ts` (rewritten cases) |
| FR-017, FR-018 (the room's dog) | T-B02, T-B05 | `dog-figure.test.ts` (rewritten), `dino-scene-wiring.test.ts` |
| FR-019 to FR-024, FR-026 (the scene; the dog that can't walk, Q21) | T-B03, T-B04, T-B05, T-INT step 1 | `dino-scene*.test.ts`, `twin-states.test.ts` (added cases), `test/ui/bubble.test.ts` |
| FR-025, FR-032 (the eating after the scene; the probe) | T-B06 | `eat-after-scene.test.ts`, `dino-cutout-visit.test.ts` |
| FR-027 (the introduction) | T-B08 | `dog-intro-build.test.ts`, `dog-intro-line.test.ts`; `content:check` on the patched export |
| FR-028 (the run and the petting unwired) | T-B02 | `pet-shell.test.ts`, `chase-stage.test.ts` (rewritten), `pet-dormant.test.ts` |
| FR-029, FR-030 (RK5, V1) | T-B07, T-INT | `dog-first-visit.test.ts`, `dog-disclosure.test.ts`, `dog-report.test.ts` (rewritten), `disclosure.test.ts`, `evals/test_disclosure.py` |
| FR-031 (the PDF; P8 now) | T-B09, T-INT step 4 | none (no code); `human-patches/028.md`, `023.md`'s timing cell |
| FR-033 (the patch order; 026) | T-INT step 3 | `patch -p1 --dry-run` on two exports; `content:check` |
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
| F6 | Reversal | Q11 first let the stand-in eat, overturning night 1's page Q247, which `probe-eat-028` showed holds the eating's model gate. (Corrected by `docfix-028` after rv-probes-028's EAT-I1: this row first called Q247 "the Author's own answer, not a recommended one"; night 1's page shows its answer as the recommended one, taken under that night's rule, "Answered: recommended, the Author 2026-11-13 (the orders file's rule; yours to confirm or overturn here)." His own first words on it are his Q3 answer, "q3) keep it as waiting for model intake p9", spec Q11.) | Q11 rewritten to keep the condition for the eating and to gate the scene on it too; FR-018, FR-019, FR-025, FR-029, SC-005, plan §R-B1, §R-B6, T-B02, T-B06 follow. |
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

## Rework after rv-spec-028

`rv-spec-028` (reviewer, another worker, read-only) found `9cf2f91f` **blocking**; its findings are on the committed page (`git show d303965a:docs/night-shift/2026-11-15.md`, Stacks, spec-028's row, and Q10, Q23). `rework-spec-028` fixed each in the documents. Who takes each change to code: **`rework-028a`** (R-028a) for group A, **T-INT** for group B's and the patch order (tasks.md marks each **Changed**).

| ID | Kind | Finding (the review's, shortened; its words in quotes) | Fixed in | Code taken by |
|---|---|---|---|---|
| B-1 | Blocking | Q7/FR-016 showed "Around the room" in the stacked layout only, "but no phone takes it (390 × 844 and 320 × 568 take the dock, 844 × 390 the column; `app.ts:260`, `compose/hud.ts:289-298`)", against his "the phone layout still get the text". Checked on `main`: `layoutFor` (`compose/hud.ts:221-226`) gives the column to a landscape window ≥ 32rem and the dock to every other; `fitsHud` sends only windows < 20rem or with a clear area < 304 × 196 to the stacked. | Spec Q7 (reworked, the page's Q10), FR-016, US3 AS3 and AS4, Amendments (004); plan §1, §R-A6 (`html[data-hud="column"]` covers column and split); tasks T-A08 | `rework-028a` (T-A08) |
| B-2 | Blocking | "FR-012, SC-003, US3 AS1 forbid the twin's, stand-in, and visitor's lines on screen "in any layout", while FR-015/FR-016 keep them in "Around the room", which shows", so `notes-gone.test.ts` and `around.test.ts` couldn't both pass. | FR-012 and SC-003 scoped to the stage's notes (`.room-notes`: `p.room-stand-in`, `.room-visitor-line`, `p.room-note`) and anything outside "Around the room", with "where "Around the room" shows (FR-016), its lines show with it"; US3 AS1; tasks T-A06 | `rework-028a` (T-A06) |
| I-1 | Important | FR-015 and Q6 said "Around the room" keeps the placeholder notes "today", but `main`'s `build/room/emit.ts` (`copyOf`, lines 1080 to 1100) emits no slot for them, and they reach readers only through the stage's `p.room-note` that FR-012 removes (`layout.ts`'s `setPlaceholders`). | Q6 (corrected), new Q23 (the place: one item right after the visitor's line, at runtime, `text-copy.ts`), FR-015 ("keeps … **and adds**"), the edge case, FR-032, SC-003, US3 AS3; plan §R-A5; tasks T-A06 | `rework-028a` (T-A06) |
| I-2 | Important | Spec 028 makes his pending human patch 026 partly untrue (its lead note's room's dog, its "Dog" piece's figure at home), and its own corpus patch overlaps 022's and 026's generated files. | New Q20 (rv's question, the page's Q23: recommended, hold 026), new FR-033 (the dry-runs on a plain `git archive refs/heads/main` export and on it with 022 then 026; order 022 → 026 → 028; generated files regenerated, never hunks), Assumptions; plan §7 (the order; what 028 means for 026: hold); tasks T-B08's **Changed**, T-INT step 3 | T-INT (step 3) |
| N-1 | Nit | `plan.md:3` and `tasks.md:7` quoted the night order and rule 1 but not his review ("his words above"). | His review, his two answers, and his rule-14 answers quoted under the "Approved provisionally" lines of both, byte for byte the spec's (checked: the `> ` lines' checksums match across spec, plan, tasks, and the intent) | — |
| N-2 | Nit | R-A6's focus overlay went beyond FR-016's "take no space". | New Q22; FR-016 says it (an overlay at the window's foot while focused, no layout space); US3 AS3; plan §R-A6 | `rework-028a` (T-A08) |
| N-3 | Nit | R-B3's `wave()` amended spec 016's twin-states contract with no Amendments row, and FR-020 said `arriving` plays the greeting (on `main`, `arrive` is once a visit and spent at the hand-off's start). | FR-020 names `wave(now, length_s)`; spec's Amendments gains spec 016's `contracts/twin-states.md` row; plan §R-B3, R-3 | none (the plan already had `wave()`; T-B04 builds it) |
| N-4 | Nit | SC-001's "as tall as … at every window" against FR-004's notes pushing the panel down. | SC-001: the column's top and foot and the panel's foot at the wall box's; the panel's top at the wall's with no note, below the notes' reserve with one; tasks T-A01 | `rework-028a` (T-A01) |
| N-5 | Nit | Plan §6 named no owner for `src/room/stage.ts`, `src/room/compose/bundle.ts`, `compose/floor.ts`, `vite.config.ts`, `scene/highlight.ts`, `scene/bundle3d.ts`, and A's T-A05 edited `rg.ts` under B's `build/room/checks/*`. | Plan §6: A owns `compose/floor.ts`, `vite.config.ts`, `rg.ts`; B owns `stage.ts`, `compose/bundle.ts`, `scene/bundle3d.ts`, `scene/highlight.ts`, and `checks/*` but `rg.ts`; for rework-028a and T-INT, since both implementers started without it | T-INT (step 2), R-028a |
| FR-026 (counted) | Nit | "FR-026 cuts the whole scene when the dog lacks `walk`, but sends the twin alone when the dog is absent." | **Decided: the twin alone** (new Q21): a dog with neither `walk` nor `run` is treated as not bundled. Why: the lack is the dog's, the twin can still walk, and his order "the twin adn the dog grab the bicycle and leave" keeps as much of itself as the room can show; the same lack now gives one answer. FR-026, US4 AS5; plan §R-B3 | T-INT (step 1) |
| Rule 14 | His answers | His answers to the page's Q2 and Q3, verbatim. | Spec Q19 and Q11 record them verbatim as answered, with rule 14's reading and mine beside; FR-031 (P8 his in the morning, not after the repository is public; `023.md`'s timing cell brought in line keeping spec 003's A9 order); FR-032; plan §7; Assumptions | T-INT (steps 4, 5) |

After the rework: every FR still has a task (FR-033 added, T-INT step 3); the terms are unchanged; no answer of his is overturned by a recommended one (Q11 and Q19 are his now); no human-only path is written (023.md is under `docs/merge-requests/`, not human-only; T-INT's step 4 says what to do if a hook refuses it).
