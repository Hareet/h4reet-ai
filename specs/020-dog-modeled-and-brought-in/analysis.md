# Analysis: spec 020, the dog modeled and brought in

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, the intent, and `docs/merge-requests/human-patches/020.md`. First run by the spec-writer (2026-11-14), against `main` 3c0e4cd0. **Re-run** after the rework for rv-spec-020 (blocking) on Opus 5.5, with the decision page's Q67 to Q70 (each "Answered: recommended, the Author 2026-11-13"), against `main` and impl-020's tip c169da96 (T001 to T007 done). Non-destructive: the findings below were fixed in the same commit unless marked open. Constitution check: plan §2 (no violation; one reading and one conflict named in the spec's Assumptions).

## Coverage

| Requirement | Task | Small tests |
|---|---|---|
| FR-001 the dog shows at the table's height | T004, T005 | `dog-avatar.test.ts`, `avatar-scene.test.ts` |
| FR-002 likeness gate (RA9) | T001, T002 | `likeness-visitor.test.ts`, `avatars-compose.test.ts`, `compose.test.ts` |
| FR-003 RA3 stays for the stand-in | T001 (g), T002 | `likeness-visitor.test.ts`, `twin-compose.test.ts` |
| FR-004 file convention, caps, counting (now with `dog-run.glb`) | T001, T003, T016, T017 | `likeness-visitor.test.ts`, `avatars-compose.test.ts`, `dog-run.test.ts` |
| FR-005 walk, root in place | T004, T005 | `dog-avatar.test.ts` (the root in place is the studio's; the intake's RA2 reads the clip) |
| FR-006 failures leave the cut-out | T004 | `dog-avatar.test.ts`, `avatar-loader.test.ts` |
| FR-007 the line, wherever the model shows | T006 to T008; T014, T015 | `dog-line.test.ts`, `likeness-line-anywhere.test.ts`, `text-copy.test.ts`, `mount.test.ts` |
| FR-008 no hand, no paper clip | T004 | `dog-avatar.test.ts`, `avatar-handoff.test.ts` |
| FR-009 choice screen unchanged, fetch only if chosen | T004, T016 (d) | existing `avatars.test.ts`, `avatar-loader.test.ts`; `dog-run.test.ts` |
| FR-010 to FR-013 the studio round | T011 (the brief, from step 2, no photo path); the round is a later studio task | the arrival check and RA family at intake; his look |
| FR-011 no session reads a photo | T011 (its check); human patch 020, items 1 and 2 | `git grep` in T011; his move of the photos |
| FR-014 records and the credit | T018, T019 (the credit); the records are his intake (patch item 3) | `test_credits_likeness.py`, `test_credits.py`; the arrival check at intake |
| FR-015 no new event; report lines | T003 | `report.test.ts` / `dog-report.test.ts` |
| FR-016 no new byte off-device | T012 | `disclosure.test.ts`, if a row is touched |
| FR-017 the `run` role | T016, T017; T009, T010 (its frame in lookdev) | `dog-run.test.ts`, `avatars.test.ts`, `avatar-driver.test.ts`, `avatar-gait.test.ts` |
| SC-001, SC-003 | T001, T004, T016 | as above |
| SC-002 | none, by design (plan R-10) | RA4 and RK5 at his intake, with T003's report lines |
| SC-004, SC-005 | his | look approval, phone run |

Requirements 17, success criteria 5; every FR has a task or a named owner (his, or the studio's later task). Tasks 19 (T001 to T019), each naming its small tests (rule 4); `make check` is in T013 alone, after T019.

## Findings

| # | Kind | Finding | Resolution |
|---|---|---|---|
| A1 | Inconsistency (fixed, first run) | The plan and T002 said RA rules register in `checks/ra.ts`. In the code they register in `build/room/checks/family.ts`. | Plan §6 and T002 name `family.ts`; `ra.ts` is the header only. |
| A2 | Underspecified (fixed, first run) | `lineFor` was typed to the twin's file, and `Avatar` had no `line`. | R-01, the data model, and T002 name the signature change. |
| A3 | Ambiguity (fixed, first run) | T004's scaling case said the tail counts "as the fixture says". | Scaling by the rest pose's precise bounds; the fixture's tail under the head's top. |
| A4 | Gap (named, not a defect) | FR-005's and FR-012's "root in place" and skeleton rules (now for `run` too) can't be proven by a fixture test. | The intake's RA2 and his look on lookdev's view; the studio brief (T011) states the rules. |
| A5 | Risk (carried; done on the line) | Adding the slot moves the copy's pinned order. | T007 moved the two pins only (impl-020, c169da96). The rework keeps the slot's name, so no pin moves again (R-02). |
| A6 | Risk (open, carried, wider) | The dinosaur (021) and the chase (025) extend the same avatar path; the rework adds `CLIP_ROLES`, `FigureId`, and `likeness-line.ts` to the shared files. | Plan §6: this branch merges first; spec 025's A020 then reads this spec's `run` role and holder (question below). |
| A7 | **Blocking in rv-spec-020 (B1); fixed** | The first run said the photos folder "is not in the spec-writer's container" and cited spec 003's FR-025, which is spec 003's degraded mode. In fact `/srv/studio/briefs/dog/photos/` is outside the deny (`.claude/settings.json` and `tools/gates/studio-folders.txt` deny `/srv/studio/photos/`, `outputs/`, `workflows/`, `key/`), and `/srv/studio/briefs/` is mounted into the implementer (rw), ops (rw), studio (ro), and supervisor (ro) containers (main's `deploy/night-shift/containers/`). | FR-011 cites spec 003's FR-003 and the photo guide's words; the spec's Assumptions say where the photos are and who mounts the folder; human patch 020's item 1 is his move of the photos into the photos folder, by the photo guide, with his word on whether any session read them (Q67); plan §5 and T011 name no photo path in any brief or studio document. Open only in his hands: the move itself. |
| A8 | Reading named | Spec 003's FR-017 ("resemble no real person") vs a dog's likeness. | Spec Assumptions, "Deviations named". No control is dropped. |
| A9 | Check passed | Facts about the Author: only the corpus's "Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller." The 0.62 m is the room's table. | None needed. |
| A10 | Check passed | No human-only path is edited; human patch 020 now lists seven items, the photos' move and the concept step first. `make up` builds with the dog's files absent. | None needed. |
| A11 | Check passed | New-feature list (CLAUDE.md): no new event, existing dashboard row, cost in the spec, degraded mode the cut-out, disclosure check in T012. | None needed. |
| A12 | **Blocking in rv-spec-020 (B2, B3, I1, I2); fixed** | Q1 left spec 025's dog with no clips to run; Q2 took a recommendation the photo rules don't allow if the studio reads photos, and didn't quote the words for option B; plan §4 recorded every file `likeness: true`, so `credits.py` would credit the dog as a likeness "of the Author"; SC-002 had no way to be met. | Q1 is "both" (Q69), quoting item h and spec 025's A020; FR-007 shows the line wherever the model shows (T014, T015); FR-012, D3, plan §5 step 3, R-03 and FR-017 give `idle`, `walk`, `run` (T016, T017). Q2 quotes option B's evidence and what B needs; the round starts at plan §5's step 2, queued once his concept image is in the inbox; patch 020 numbers the concept step (item 2). Q6 and FR-014: the model `likeness: true`, `source.type: "photo"`, the clips `likeness: false`, the credit "a likeness of the Author's dog" (R-08; T018, T019); REVIEW.md's C5 conflict named in the Assumptions. SC-002 is met by RA4 and RK5 at intake (R-10). |
| A13 | Inconsistency (fixed in tasks) | On impl-020's line, T006 to T007's comments and test header cite the likeness line as "FR-003"; in this spec FR-003 is RA3's rule and the line is FR-007. | T015 corrects the citations in the comments it touches. Non-blocking; for the item's merge-request note. |
| A14 | Ordering (named) | T009 (RED, lookdev) draws `run`'s middle frame, which needs T017's closed list. | Dependencies: T009's run frame waits for T017; T009 and T010 are not yet started on the line. |
| A15 | Gap (his, open) | `credits.py --check` runs in the arrival step, so T019's change is code his gate runs (CLAUDE.md: what the Author runs executes what agents write). | Plan R-08 says so; it is reviewed like the rest of the stack, by a worker that didn't write it. |
| A16 | Consistency (named) | The decision page's Q51 (the studio reads the photos) was "Answered: recommended", and is reopened by Q68, not acted on. Q64's "geometry only from the photos" assumed the studio read them; under Q68 the studio's input is his reviewed concept image (D4's style frame), and the texture rules of Q64 still hold for the model. | Spec Q2 names Q51's reopening. Nothing else changes. |

Constitution: no CRITICAL. Principle IV is met by holding the round until his move (A7); VIII by the line wherever the model shows and the credit naming the dog (A12).

## Verdict

Ready for the line to continue, test-first: impl-020 finishes T008 to T012, then T014 to T019, then T013. Each answer is provisional, his to confirm or overturn on the morning page; the rework's answers are the decision page's Q67 to Q70, already "Answered: recommended". The studio round stays held until patch 020's items 1 and 2 are done.

## What's left

For the line (impl-020 or a rework-020 task on it): T008 to T012, then T014 to T019, then T013's one `make check`, then a review by a worker that wrote none of it. For him: patch 020's items 1 (move the photos; say whether any session read them), 2 (the reviewed concept image in the inbox), 3 and 4 (intake, approval), 5 and 7 only if needed. For spec 025: read this spec's `run` role and likeness-line holder in its A020. The questions are in `/night/io/out/questions.md`.
