# Tasks: The Resume in the Visitor's Hand

Approved provisionally by the Author's direction of 2026-11-22: "Go with your recommendations. Let's have you build it out in this session"

**Input**: [spec.md](spec.md), [plan.md](plan.md). Tests first: each RED task's tests are run and their failure pasted in the commit before its GREEN task.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: RED

- [ ] T001 [US3] `apps/web/test/room/paper-steady.test.ts`: the flicker's reproduction as a test (SC-003; FR-011): the repository's holding avatars with their real clips, the hand-off to its end, 8 s of "idle-holding" at 50 ms; no drawn sheet hides a sample of the held sheet from the room's camera; one drawn sheet after the hand-off in travel, appear, reduced-motion, and handless endings.
- [ ] T002 [P] [US1] `apps/web/test/ui/handoff.test.ts`: "after the hand-off" rewritten for FR-001 to FR-005 (no offer in 3D, reduced motion, 2D; focus on the heading; `resume_kept` once; controls open at once; "Resume" one action away).
- [ ] T003 [P] [US2] `apps/web/test/ui/held-paper.test.ts`: FR-006, FR-007, FR-009, FR-010 at the room, through the fake stage's `select` and `target`.
- [ ] T004 [P] [US2] `apps/web/test/room/held-paper-pick.test.ts`: FR-008 and the highlight at the 3D stage with a stand-in renderer.
- [ ] T005 Run T001 to T004, paste the failures, commit RED.

## Phase 2: GREEN

- [ ] T006 [US3] D3: `fadePaper` and `keptPaper` in `bundle3d.ts`; `showHandoff`, `avatars.ts`'s `keepPaper` and `handoffEnded`, and `scene.ts`'s hand-off end through them. T001 passes.
- [ ] T007 [US1] D1: the offer out of `layout.ts`, `app.ts` (`enterRoom`), `visit.ts`, `room.css`, and the comments. T002 passes; the existing tests of plan.md's table change in this commit.
- [ ] T008 [US2] D2: `HELD_PAPER` in `stage.ts`; `heldPaperArea` in `bundle3d.ts`; the pick and the highlight's figures in `scene.ts`; `targetInput`, `selectObject`, and "Resume"'s focus in `app.ts`. T003 and T004 pass.

## Phase 3: Records

- [ ] T009 [P] D4: the dashboard's five panels and `test_dashboard.py`; telemetry.md §7.8.
- [ ] T010 [P] D4: `docs/data-flow-disclosure.md` row V4.
- [ ] T011 [P] D4: amendments A1 to A7 in specs 002, 005, 008, 009, 012.

## Phase 4: Verify and hand over

- [ ] T012 `make -f Makefile lint`, the changed and new tests, `test_dashboard.py`, and the whole `apps/web` suite once, pasted.
- [ ] T013 `docs/merge-requests/2026-11-22-feat-033-resume-in-hand.md` with the Author's look list.

## Dependencies

T001 to T004 before T005; T005 before T006 to T008; T006 before T008 (the pick reads the sheet's visibility); T009 to T011 any time after T005; T012 after all; T013 last.
