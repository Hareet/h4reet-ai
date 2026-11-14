---
description: "Task list for spec 018, a better HUD and a load screen"
---

# Tasks: A Better HUD, From the Author's Examples, and a Load Screen to Match

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over"

Item a) of his order: "better HUD with examples provided, and load screen". Q1 to Q5 and D1 to D8 stand as taken. Q53 to Q60 are recorded on the night's page as "Answered: recommended, the Author 2026-11-13", and the rework's R1 to R6 are taken at their recommended answers. All are on the morning page.

**Input**: [spec.md](spec.md), [plan.md](plan.md). **Prerequisites**: branch `night/hud-spec/spec-018` (docs), then the implementation on this stack's branch for item 1, from `main` at 086fea12 or later. **Rework (rule 6)**: T021 to T030 are appended by `night/rework-spec-018/rework-spec-018`, from impl-018's tip (b9378980), and run on `night/rework-018/rework-018` from this branch's tip.

**Tests**: required, test-first: each RED task's tests are written and seen to fail before its GREEN task. **Small runs only** (the order's rule 4): a task runs the test files it adds or changes plus those covering the files it changes, `cd apps/web && npx vitest run <files>`, and `make lint`, and pastes both into its notes. No task here runs the full suite; the stack's last task does, once. A failure in a test the stack doesn't touch is reported with the evidence (passes alone; the stack doesn't touch it), not chased; `test/room/twin-2d.test.ts` is flaky under load.

**Rules for every task**: no edit under `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, `assets/policy/**`; no merge, no push; the examples' images are not in the repository; no edit to a test to make a fix pass; a departure from plan.md updates plan.md in the same commit; one commit per task, `feat(018): T0nn …`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational

- [x] T001 [US1] RED: `test/room/hud-frame.test.ts`: `roughFramePath` and `brushStrokePath` are deterministic for a seed, differ across seeds, stay inside their box by a margin, close the frame, and return a path string only of `M L C Q Z` and numbers. Run: `npx vitest run test/room/hud-frame.test.ts`.
- [x] T002 [US1] GREEN: `src/room/hud/frame.ts`. Same run, plus `make lint`.
- [x] T003 [P] [US2] RED+GREEN: `src/room/hud/keycap.ts` and its cases in `test/ui/hud-split.test.ts` (created here): a key cap's text is its name, `aria-hidden`, class only. Run that file.
- [x] T004 [P] [US1] RED+GREEN: `src/room/hud/stats.ts` and `test/room/hud-stats.test.ts`: the three stats' labels and values for each tier state and cost signal form (`est.`, `at least`, `local`, unknown → "—"); no word about the Author. Run that file.
- [x] T005 [US1] Words: `room/ui-words.yaml` and `src/room/ui-keys.ts` gain plan §6's keys. Run `npx vitest run test/room/words.test.ts` and `make lint`.

## Phase 2: The split layout's geometry (US1, US2, US4)

- [x] T006 [US4] RED: `test/room/hud-split-geometry.test.ts`: over spec 005's sweep of window sizes, `layoutFor` returns `split` only for landscape and at least 48rem; below it, the same layout as today (assert against the existing results); at 1280 × 720 and 1920 × 1080 the panel's box is within the left half, the list's within the right 24rem, neither overlaps the other, the notes' reserve, the strip, or the walking control; `fitsHud` falls through to column, dock, stacked as today.
- [x] T007 [US4] GREEN: `src/room/compose/hud.ts`'s `split` (plan §2). Run the new file with `test/room/hud.test.ts`, `test/room/stages.test.ts`, `test/ui/hud-notes.test.ts`, `test/ui/hud-model.test.ts`; and `make lint`. Any existing test that pins today's layouts passes unchanged.

## Phase 3: The conversation panel (US1)

- [x] T008 [US1] RED: in `test/ui/hud-split.test.ts`: at 1280 × 720 the room opens with the bar (title, text box row, Send, talk; no frame, stats, portrait); a started conversation opens the panel with the title, the hint with its key cap, the emblem, the three stats, the log as body, the text box row, and the portrait slot; Escape (no turn out, not walking) closes to the bar and focuses the selected entry; a turn out → Escape aborts it first; walking → Escape stops walking first; the log survives a resize across 48rem and the text box keeps its text.
- [x] T009 [US1] GREEN: `src/room/hud/split.ts`; `layout.ts`, `talk.ts`, `app.ts` wiring; Escape's order (FR-009). Run `test/ui/hud-split.test.ts`, `test/ui/hud.test.ts`, `test/ui/hud-pointer.test.ts`, `test/ui/hud-faults.test.ts`, `test/ui/pause.test.ts`, and `test/talk` files for `talk.ts`'s changes; `make lint`.
- [x] T010 [US1] Portrait: extract the still's fetch-and-verify from `flat.ts`'s `renderFlat` into a shared function (behaviour unchanged; `twin-2d.test.ts` is its guard); the panel fetches through it at first open if the room is in 3D; the silhouette stands in on failure, the stand-in line stays. Add cases to `test/ui/hud-split.test.ts` (fetch stubbed: ok, refused integrity, failed). Run that file, `test/room/twin-2d.test.ts` (flaky: if it fails, rerun alone), `make lint`. If the still has no reusable export and reuse would need a new network path, **stop**: record it in the notes and use the silhouette only; Q4 goes back to the Author.

## Phase 4: Choosing (US2)

- [x] T011 [US2] RED: in `test/ui/hud-split.test.ts`: the list's label and entries right-aligned, "Back" shown only while the panel is open and doing Escape's job; the selected entry (focus, else hover, else the open piece) carries `aria-current`, the strokes, and the confirm key cap; no other entry's row size changes; a tap opens a piece in one tap.
- [x] T012 [US2] GREEN: list parts in `split.ts`, `split.css`, `room.css`. Run that file, `test/ui/hud.test.ts`, `test/ui/highlight.test.ts`, `test/ui/pick.test.ts`; `make lint`.

## Phase 5: The look (US1, US2, US5)

- [x] T013 [US5] RED: `test/ui/hud-split-a11y.test.ts` (axe on bar and open; Tab order toolbar → list → conversation; decorative parts `aria-hidden`; the buttons' names include the key's name; reduced motion has no movement; 200% zoom and 1.4.12 spacing don't clip) and `test/ui/hud-split-contrast.test.ts` (4.5:1 over the glass at its darkest and lightest; the accent entry 3:1 large, 4.5:1 not).
- [x] T014 [US5] GREEN: `split.css` and the type and colours per FR-011; reduced-transparency, more-contrast, and forced-colour rules. Run the two files, `test/ui/hud-a11y.test.ts`, `test/room/hud-contrast.test.ts`; `make lint`.
- [x] T015 [US4] RED+GREEN: `test/ui/hud-split-fallback.test.ts`: each decoration (frame, strokes, portrait, key caps) forced to throw → its plain form, every control still works, no uncaught error; then the wrapping in `split.ts` (plan §9). Run that file and `test/ui/hud-faults.test.ts`; `make lint`.

## Phase 6: The loader (US3)

- [x] T016 [US3] RED: `test/ui/loading-style.test.ts`: the card has the frame, the title, and the panel's type classes; opaque under reduced transparency or more contrast; the bar, percentage, stage line, and hints are unchanged.
- [x] T017 [US3] GREEN: `loading/view.ts` and `loading.css` (the frame and title only; no edit to the progress, hints, or ceiling code). Run `test/ui/loading-style.test.ts` and every `test/ui/loading-*.test.ts`, `test/room/loading-contrast.test.ts`, `test/room/loading-progress.test.ts`, `test/room/loading-hints.test.ts`; `make lint`.

## Phase 7: Review and the note

- [x] T018 Review by a worker that did not write the code, against `REVIEW.md`, spec.md, and plan.md; findings fixed by the implementer in new commits (the reviewer edits nothing).
- [x] T019 The stack's note: add this item's section to `docs/merge-requests/2026-11-14-night-stack.md` (create it if absent): the branch tip, the files, the small runs' output, what's left, and the questions on the morning page. **No full suite**: the stack's last task runs it once.
- [x] T020 `make build` ends with `BUILD OK` (the one broader check this item runs; paste its tail). A failure unrelated to the stack is reported with evidence.

## Phase 8: Rule 6's rework (rv-spec-018 and rv2-impl-018, blocking)

The spec's FR-001, FR-003, FR-004, FR-006, FR-009, FR-014, and FR-005's emblem as reworked; plan.md §2, §3, §7, §13, and R-1 to R-6. Same rules as above: test-first, small runs only, `make lint` each task, notes with both outputs, one commit per task, `feat(018): T0nn …`. A RED task's tests are seen to fail before its GREEN task. The geometry numbers in plan.md §2 and the spec's FR-001 table are the expectations. A difference is explained in the notes, never absorbed into the test. **Stop** at any expectation change to another spec's test beyond plan.md §13's list: record it in the notes and ask on the page.

- [ ] T021 [US1] [US4] RED: rewrite `test/room/hud-split-geometry.test.ts` to plan.md §13's row:
  - over `sweepScreens()`, `splitBoxes` is non-null exactly where FR-001's (a) to (e) hold, computed in the test from `hudBoxes`, `notesReserve`, `notesBox`, `unionArea`, and the table;
  - where it is null, `compactBoxes` equals the column or dock layout's as today;
  - null at 1280 × 720, 1366 × 768, 844 × 390, 768 × 432, 800 × 500, 1024 × 600, 700 × 400, and 770 × 330;
  - at 1392 × 783, 1920 × 1080, 1920 × 1200, and 2560 × 1440, plan.md §2's boxes (to 1e-6): the panel in the left half; the scene beside it ≥ 304 × 196; the rest row in the bar's band at the left, clear of the tile cluster by 0.25rem; the list in the band's right 24rem, ending 0.25rem above the walking control; the walking control at the band's foot; none overlapping the strip or `notesBox`; `frame` = the panel with the rest row; coverage at rest ≤ 0.25; `hudBoxes(screen).clear` unchanged from the column layout's.

  Add `test/ui/hud-split-model.test.ts`: the rest row's contents' least width, at their sizes, fits `split.rest.minRem`, and the list's label, "Back", and every entry of the repository's scene at 3.25rem fit `split.list.heightRem`. Run: `cd apps/web && npx vitest run test/room/hud-split-geometry.test.ts test/ui/hud-split-model.test.ts` (fails: RED), `make lint`.
- [ ] T022 [US4] RED: spec 014's `test/room/frame.test.ts`, the one other spec's test the rework changes (R4; plan.md §13). `UNDER` and the 0.5rem case measure from `compactBoxes(SCREEN).split.list` instead of `.column`, at the default and the 20-pixel root. No other line changes. Run `npx vitest run test/room/frame.test.ts` (fails: RED), `make lint`.
- [ ] T023 [US1] [US4] GREEN: `src/room/compose/hud.ts` per plan.md §2: the table's `split` (drop `minWidthRem` and `panel.gapRem`; add `rest`, `walkGapRem`, `coverMax`); `splitBoxes`'s rule and `{ panel, rest, frame, list, walk }`; `compactBoxes` split-aware (`split`, `all`, `walk`, `walkPlace`; `column` still computed). `test/ui/hud-model.ts` gains the split layout's measures for T021's model test. Run: `npx vitest run test/room/hud-split-geometry.test.ts test/ui/hud-split-model.test.ts test/room/frame.test.ts test/room/stages.test.ts test/room/hud.test.ts test/ui/hud-model.test.ts test/ui/hud-notes.test.ts test/room/legacy-stages.test.ts`, then `make lint`. `stages.test.ts`'s "always among them" case: see plan.md §13's stop rule.
- [ ] T024 [US1] [US2] [US5] RED: in `test/ui/hud-split.test.ts` and `test/ui/hud-split-a11y.test.ts`, per plan.md §13:
  - `WIDE` and the viewport become 1920 × 1080;
  - the rest row's contents (title toggle, "Larger conversation", the label, the text box, Send, the talk button) are in the bar's band at `--split-rest-*`;
  - a sent turn with no piece open opens the panel;
  - the resize case goes to 1280 × 720 (`data-split="off"`) and back, keeping the log and the text;
  - Escape's order (FR-009), one case per step: a `defaultPrevented` event, `browserOwnsEscape` stubbed true, a turn out, walking, the resume open, the larger view with focus in the conversation, and then the panel;
  - focus after closing goes to the opener, the entry, "Larger conversation", or the text box, and to the selected entry where the opener is hidden;
  - 200% zoom is 960 × 540, where `splitBoxes` is null, and there is no `minWidthRem` assertion.

  Run both files (fail: RED), `make lint`.
- [ ] T025 [US1] [US2] GREEN: `layout.ts` (`--split-rest-*` replacing `--split-bar-*`; the walking control from `compact.walk`), `hud/split.css` (the rest row in the bar's band; the frame round `SplitBoxes.frame`), `hud/split.ts` (Escape's order; the opener and focus return), `app.ts` (a sent turn opens the panel; the opener recorded), and `talk.ts` only if the sent turn needs a hook. Run `test/ui/hud-split.test.ts`, `test/ui/hud-split-a11y.test.ts`, `test/ui/hud-split-fallback.test.ts`, `test/ui/hud.test.ts`, `test/ui/hud-a11y.test.ts`, `test/ui/hud-pointer.test.ts`, `test/ui/hud-look.test.ts`, `test/ui/pause.test.ts`, the `test/talk` files for any `talk.ts` change; `make lint`.
- [ ] T026 [US1] RED+GREEN (rv2-impl-018's B3; Q60, R6): the emblem is the open piece's icon from `hud/icons.ts`, and the speech glyph in free talk and for a piece without an icon. `icons.ts` has neither at impl-018's tip: it gains one stroked path per selectable id of the repository's scene (snowboard, bicycle, laptop, chalkboard) and a `speech` glyph, on its 24-unit grid. Its failure leaves no emblem (FR-002). Cases in `test/ui/hud-split.test.ts` (each of the four pieces, free talk, and an unknown id) and `test/ui/hud-split-fallback.test.ts` (the icon throws). Then `icons.ts` and `split.ts`. Run both files and any test importing `icons.ts` (`grep -l hud/icons test -r`), `make lint`.
- [ ] T027 [US5] RED+GREEN (B2; FR-014): the open panel's title row has the panel's glass behind it. Cases: `test/ui/hud-split-contrast.test.ts` computes the title's 4.5:1 over that glass at its darkest and lightest; `test/ui/hud-split-a11y.test.ts` asserts the title's box sits inside a glass box. Then `split.css`. Run both files and `test/room/hud-contrast.test.ts`; `make lint`.
- [ ] T028 [US4] RED+GREEN (B1; FR-006): with the soft keyboard's inset (the metrics' `keyboard`, as the column's tests stub it), the rest row and the open panel's foot stay above it. The case goes in `test/ui/hud-split.test.ts`, at a landscape tablet that takes the split layout (e.g. 1400 × 1000, checked against `splitBoxes` in the test). Then `split.css`, `layout.ts`, `app.ts` as needed. Run that file and the existing keyboard tests for the column layout (`grep -l keyboard test/ui/*.test.ts`); `make lint`.
- [ ] T029 Docs (FR-003, H-11; plan.md §7): `docs/data-flow-disclosure.md` row V1's **Carries**, the spec's words: "the twin's still in a visit that shows the 2D room, or, in a 3D visit, once, when the conversation panel first opens in the split layout (spec 018)". The stack note's item 1 section in `docs/merge-requests/2026-11-14-night-stack.md` gets: the rework's commits; the changed tests (plan.md §13) with what each holds; the small runs' output; the deviations named (Principle II, Workflow step 7); the questions (Q53 to Q60, R1 to R6). Run `make lint`.
- [ ] T030 Review of T021 to T029 by a worker that wrote none of them (the supervisor's rv-rework-018), against `REVIEW.md`, spec.md, and plan.md. Findings are fixed by an implementer in new commits; the reviewer edits nothing.

## Dependencies

T001 → T002; T003, T004, T005 parallel after; T006 → T007 needs T005; T008 → T009 → T010; T011 → T012 after T009; T013 → T014 → T015 after T012; T016 → T017 any time after T005; T018 after all; T019, T020 last.

Rework: T021, T022 → T023; T024 → T025 after T023; T026, T027, T028 after T025, in any order; T029 after T028; T030 last.

## Implementation strategy

MVP is T001 to T010 (the left panel in the split layout); T011 to T012 add the right; T013 to T015 the look's guards; T016 to T017 the loader. Stop and report at any task whose assumption a code reading shows false (T010 names one).
