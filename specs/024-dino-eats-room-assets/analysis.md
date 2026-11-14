# Analysis: spec 024 (spec.md, plan.md, tasks.md)

`/speckit-analyze`, non-destructive on the three artifacts (fixes below were made to them in the same step). 2026-11-13, by the spec-writer; the implementer and the reviewer read it before starting.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A-1 | HIGH | The spec's action key **E** is the walking view's turn-right (`src/room/walk/input.ts` `HELD`: W A S D Q E R F, arrows; Enter and Escape are also taken). Pressing it would turn and bite. | The key is **B**. Spec, plan, tasks changed; Revision note at the spec's end. |
| A-2 | MEDIUM | The plan said the build refuses a piece with fewer than 2 edible chunks, but which chunks are edible comes from the model's triangles and the mounts, known only after a split. | A test (T004, on the four real GLBs) holds it, not a build check; plan §5.1 and §8 corrected. |
| A-3 | LOW | FR-001 said "more than one chunk"; US1 AS4 and FR-005 mean "one edible chunk standing besides the last". | FR-001 reworded. |
| A-4 | LOW | FR-012 puts the button in "the walking view's controls"; the file that builds them isn't named (plan §6 lists `app.ts`, `room.css`). | T011 names the geometry test (`hud-notes.test.ts`); the implementer confirms the file at T011 and updates plan §6 in the same commit. |
| A-5 | INFO | The laptop mounts on `laptop-stand`, not on the desk; its cable runs to the outlet, and its screen carries the tier's face. | FR-004's rule covers it (a face's mesh, and anything mounted); eating its other chunks doesn't touch the cable. T009 asserts the face. |
| A-6 | INFO | Spec 021 isn't on the branch; the figure's file, clips, and `mouth` node are assumed. | Plan §3 names them and isolates them in `eat/mouth.ts`; T000 reads spec 021's names; tests use stubs, so no task waits on 021 but the by-hand look (SC-007). |

## Coverage: requirement → task

FR-001 → T006, T010, T011. FR-002 → T001, T002. FR-003 → T004, T008. FR-004 → T004, T009. FR-005 → T005, T009. FR-006 → T008 (the look is the Author's, A4). FR-007 → T005, T008. FR-008 → T008. FR-009 → T006, T013. FR-010 → T003, T012. FR-011 → T001, T005. FR-012 → T010, T011. FR-013 → none, by design (no clip role; plan §5.7). FR-014 → T013 (a fetch spy; `disclosure.test.ts`). FR-015 → T004, T008. FR-016 → T005, T013. FR-017 → none: a negative (the twin isn't told); plan §5.7 and the files list don't touch `services/` or the twin's pack. SC-001 → T004; SC-002 → T009; SC-003 → T005; SC-004 → T013; SC-005 → T008, T014; SC-006 → T013; SC-007 → T015 (by hand). Every FR is covered or left out on purpose.

## Checks

- **Constitution**: I, II, III, IV, V, VIII met as plan §4 says; VI by the note (T015); no principle deferred. One CLAUDE.md deviation (the span, the panel, the disclosure row: none, no byte leaves) is named in spec A5, as CLAUDE.md asks.
- **Rule 4**: each task names its small tests; no task runs `make check`; T014 builds the web app and runs two chunk tests. The flaky `twin-2d.test.ts` is in no list.
- **Human-only paths**: none is written; the plan's "not touched" list holds. `docs/merge-requests/human-patches/024.md` says so, and lists what stays the Author's.
- **Test files named exist** (`test/room/{scene,walking,input,reach,pick,words,schema,compose,motion,highlight,gltf-images,flat,chunk,budgets,avatars,manifest-readiness}.test.ts`, `test/ui/{hud,hud-notes,degraded,a11y}.test.ts`, `test/disclosure.test.ts`); the `eat-*` ones are new, written first.
- **Overlap** with other stacks is additive (plan §6); the one real collision risk is `walk/input.ts` (a new key) and `app.ts`/`room.css`.
- **No CRITICAL finding.** Open questions: Q1 to Q6, on the morning page with recommendations.
