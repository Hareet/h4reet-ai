---

description: "Task list for spec 003, Studio Assets"
---

# Tasks: Studio Assets — The Studio's Outputs, Brought In Safely

**Status**: generated on 2026-10-18 from the plan, under the Author's direction of 2026-10-17 to continue with the recommended options ([research.md](research.md#decided-by-recommendation-revisit-any-time)). Phases 1 to 4 can be built now. Phases 5 and 6 wait for specs 001 and 002, and say so.

**Input**: the design documents in `specs/003-studio-assets/`: plan.md, research.md, data-model.md, contracts/ (five), quickstart.md.

**Tests**: required. In each phase, the test tasks come first and must fail before the code that makes them pass; each merge-request note records that RED run.

**Organization**:
- One phase per task group of plan §9, each one feature branch, merged by the Author in order, after `spec/002-the-room`. They branch from `spec/003-studio-assets`, not from `spec/002-the-room`, so the work could start while spec 002's plan was being written: Phases 1 and 2 stack on each other from this spec's tip, and Phase 4 starts from the same tip, since it touches nothing Phases 1 to 3 change. Nothing in them depends on spec 002.
- The stories map onto them: US1 and US4's repository half in Phase 2, US5 in Phase 3, US6 in Phase 4, US2 and US3 in Phase 5, US7 in Phase 6. Phase 1 serves US1's controls.
- Each phase's last task is its merge-request note, with `make check`'s whole output and a reviewer agent's REVIEW.md passes.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task).
- **[USn]**: the user story the task serves.
- **Author**: only the Author runs it, in their own terminal. **Heavy** marks one that stops prod's model server.
- **Patch**: a change to a human-only path (`.claude/**`, `REVIEW.md`, `tools/gates/**`, and `assets/policy/**` once Phase 1 protects it), written as a patch file under `docs/merge-requests/`, verified in a scratch worktree, applied by the Author.

## Path conventions

- The check and its tests: `tools/gates/arrival_check.py`, `tools/gates/test/test_arrival_check.py`, `tools/gates/test/arrival_fixtures.py`.
- The helpers: `scripts/assets/`. The assets: `assets/`. The published images: `docs/research/images/`.
- "§" means plan.md unless another file is named.

---

## Phase 1: The guards, before any studio file — branch `feat/003-guards`

**Purpose**: the studio's folders denied and the policy protected before any photo is staged or any asset arrives (plan §2; FR-003, FR-005).

**Independent test**: quickstart §1: an agent session's `make check` shows the new rows passing once the placeholders are filled.

- [x] T001 [P] [US1] Add stage S rows to `redteam/forbidden-actions.sh` reading each studio folder (`<STUDIO_PHOTOS>`, `<STUDIO_OUTPUTS>`, `<STUDIO_WORKFLOWS>`, `<STUDIO_BLINDING_KEY>`), each failing with "placeholder not filled" while a placeholder remains, per FR-003 and research R-07
- [x] T002 [P] [US1] Add stage H rows to `redteam/forbidden-actions.sh` refusing an Edit and a shell write of `assets/policy/licenses.json`, `approvals.json`, and `caps.json`, per FR-005
- [x] T003 [US1] **Patch** `docs/merge-requests/<date>-feat-003-guards.patch`: `.claude/settings.json` (`denyRead` and `Read(...)` on the four placeholders; `denyWrite` and `Edit(...)` on `assets/policy/**`), `.claude/hooks/protected-paths.sh` (`assets/policy/**`), the three policy files as data-model.md §3 to §5 give them (no licenses, no approvals, `adr_0010: "not-accepted"`), `tools/gates/matrix-required.txt`'s new rows, and `tools/gates/studio-folders.txt`, the folders by name for the matrix (added in implementation), per plan §2
- [x] T004 [US1] Verify the patch in a detached scratch worktree, with stand-in paths for the placeholders: `git apply --check`, then `make check` on the patched tree and `gitleaks dir`, recording T001 and T002's rows going from PLANNED to PASS
- [ ] T005 [US1] **Author**: fill the placeholders, apply the patch, `claude doctor`, `make git-hooks`, per quickstart §1
- [x] T006 [US1] Merge-request note `docs/merge-requests/<date>-feat-003-guards.md`, with the patch's verification, `make check`, and the reviewer's passes

**Checkpoint**: no agent session can read the studio's folders or write the policy.

---

## Phase 2: The arrival check (User Story 1, Priority P1; User Story 4's repository half) — branch `feat/003-us1-arrival-check`

**Goal**: every studio file is checked before any commit, over every commit of a branch, and over the history; the records render as credits; the decisions are ADRs.

**Independent test**: quickstart §2: SC-001's fixture set; a refused commit; a branch failing on an earlier commit; `publish-check` clean.

### Tests for User Story 1 (first)

- [x] T007 [US1] **Patch** `tools/gates/test/arrival_fixtures.py`: build at run time one passing PNG, JPEG, WebP, and GLB (with its embedded image), each with its record, notice, and mark, and one failing file for every rule in contracts/arrival-check.md §3; the §5 fixtures there (outside the roots, a HEIC, AVIF, TIFF, DNG, and MOV with EXIF and a GPS directory, and a binary file of no listed format with an EXIF header; GLBs with a photo's file name in `images[].name`, with a `uri`, keeping `mesh.extras.targetNames`, with an embedded texture carrying metadata or a mark, and with uncovered `BIN` bytes; a PNG whose pixel data holds `C:\` by chance, and one with bytes after `IEND`); a policy directory standing in for the `main` branch's `assets/policy/`; a three-commit repository whose second commit adds a failing file and third fixes it; a merge commit whose resolution adds a failing file; and a branch that deletes a directory's `LICENSE.md`
- [x] T008 [US1] **Patch** `tools/gates/test/test_arrival_check.py`: each rule refuses its fixture with its ID (SC-001); every passing fixture passes; `--range` fails on the fixed-later branch, on the merge whose resolution adds a failing file, and on the tip that deleted a `LICENSE.md` (FR-004); the policy is read from `refs/heads/main` with replace objects off, with a branch's own `assets/policy/` ignored and failing A9, and the main working tree's checked-out copy, a tag named `main`, and a `refs/replace` entry all ignored; the Author's own policy commit on `main` passes under `--staged` (A9 doesn't apply); the pixel data that holds `C:\` by chance passes (the B rules' scope); exit 2 when a studio file needs the policy and `main` has none; exit 0 for a commit with no studio file while `main` has no policy; no matched bytes in the output (FR-007)
- [x] T009 [P] [US1] `scripts/assets/test_scrub.py`: a PNG with `tEXt`, `iTXt`, and `eXIf`; a JPEG with EXIF, XMP, and a comment; a WebP with `EXIF` and `XMP `; a GLB with `extras` (and `mesh.extras.targetNames`, which must survive), `asset.generator`, an unlisted extension, a source image's file name in `images[].name` and in a material's `name`, and an embedded texture carrying EXIF and its own XMP packet. Each comes out passing rules M1 to M9, with one mark on the GLB and none on its embedded texture, the image and material names replaced by neutral IDs, the morph targets' names kept, and its pixel data unchanged, byte for byte
- [x] T010 [P] [US4] `scripts/assets/test_credits.py`: rendering from fixture records, `--check` failing on a stale or hand-edited `CREDITS.md`, and no source ID's meaning or path in the output, per contracts/asset-record.md §4

### Implementation for User Story 1

- [x] T011 [US1] **Patch** `tools/gates/arrival_check.py`: the four invocations (range mode with merges against each parent and the tip's whole tree), the `main` branch's policy read with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:<path>`, the files checked by format and by content (camera metadata in any binary file), the rules and their IDs (A4, M8, and M9 among them, and the B rules' scope), the size table, the history total, and the exit codes, per contracts/arrival-check.md and research R-02 to R-09
- [x] T012 [US1] **Patch** `.claude/git-hooks/pre-commit`: run the main tree's `arrival_check.py --staged` after gitleaks, failing closed when it can't run, per research R-06
- [x] T013 [US1] **Patch** `tools/gates/gate` (a step `arrival` over `main..HEAD`), `tools/gates/run_checks.py`'s gate list, and `tools/gates/publish_check.py` (`--history`, per FR-004 and spec 000's FR-042), with their tests
- [x] T014 [US1] **Patch** `REVIEW.md`: an "Arriving assets" pass: the records against the files, the art direction and intent 000's "Inspired-by only" rule, third-party content, and an approval on `main` for each file rule P names, per FR-017 and FR-037
- [x] T015 [P] [US1] `Makefile`: `arrival` (in `make check`'s list, through `PY_HOST`, running the main tree's copy), `assets-scrub FILE=`, and `assets-credits`, per plan §3 and §4
- [x] T016 [P] [US1] `scripts/assets/scrub.py`, per research R-03
- [x] T017 [P] [US4] `scripts/assets/credits.py`, and the arrival step's run of `credits.py --check`, per contracts/asset-record.md §4
- [x] T018 [US1] `assets/README.md`, and `assets/twin/`, `assets/visitors/`, `assets/animations/`, each with its `LICENSE.md` (contracts/asset-record.md §3) and an empty `records.json`; `assets/CREDITS.md` rendered, per research R-01
- [x] T019 [P] [US4] `README.md`'s license line: MIT for code, the media license for `assets/` and `docs/research/images/`, per FR-015
- [x] T020 [P] [US1] `docs/adr/0010-…md`, **proposed**: the rig's format, skeletons, blendshapes and visemes for the twin, the caps, the reference phone, and the capability floor, from intent 003's survey, per research R-12; the ADR index updated
- [x] T021 [P] [US1] `docs/adr/0030`, `0031`, and `0032`, and the ADR index, per research R-15
- [x] T022 [P] [US1] `docs/runbooks/asset-withdrawal.md`, per FR-041 and ADR 0032
- [x] T023 [P] [US4] `docs/data-flow-disclosure.md`, row D1: committed assets, the Author's likeness among them, reach Anthropic when an agent session reads them, per FR-040d
- [x] T024 [US1] Verify the patch on a scratch worktree: `make check` and `gitleaks dir` on the patched tree, and the RED run of T008 against a tree without T011
- [ ] T025 [US1] **Author**: apply the patch, `make git-hooks`, and read ADR 0010's draft (accept it, change it, or leave it proposed: avatars stay refused until it's accepted), per quickstart §2
- [x] T026 [US1] Merge-request note `docs/merge-requests/<date>-feat-003-us1-arrival-check.md`, with the verification, `make check`, and the reviewer's passes

**Checkpoint**: nothing can enter the history that the check refuses, before or after publication.

---

## Phase 3: The comparison's images (User Story 5, Priority P2) — branch `feat/003-us5-comparison`

**Goal**: the evaluation note's images come in under the same rules, with their caption.

**Independent test**: quickstart §3, after the evaluation's runs.

- [x] T027 [US5] **Patch** for `tools/gates/test/test_arrival_check.py`: rule C1, an arm-B grid with and without its caption on the line after its link; and L1 in a published-image folder, a grid whose license reads `no` on research display refused and one reading `yes` passing without FR-013's three terms, while the same license in an asset directory is still refused, per research R-09 and FR-036 as clarified (as built: Phase 2's patch already carries every case, so Phase 3 adds no patch; its note maps each to its test)
- [x] T028 [US5] `docs/research/images/2026-10-12-image-model-evaluation/`, with its `LICENSE.md` and an empty `records.json`; `docs/research/images/CREDITS.md` rendered, per plan §5
- [x] T029 [US5] Update `docs/research/2026-10-12-image-model-evaluation.md` where the clarification settled what it left open: the license chosen, the mark settled, the record table's rows as `records.json` entries with the arm, each license's research-display reading, and `make assets-scrub` in "Making a grid", per FR-036. (Its preconditions, the guard patch before any photo and the arrival check before any commit, came in with the plan's review on 2026-10-18.)
- [ ] T030 [US5] **Author**: after the evaluation's runs, scrub, record, add each license with its research-display reading and the approvals on `main`, and commit the grids, per quickstart §3
- [x] T031 [US5] Merge-request note `docs/merge-requests/<date>-feat-003-us5-comparison.md`, with `make check` and the reviewer's passes

---

## Phase 4: The studio's GPU window (User Story 6, Priority P3) — branch `feat/003-us6-gpu-window`

**Goal**: the studio borrows the GPU through one command, recorded, with production degrading as designed.

**Independent test**: quickstart §4: SC-011.

### Tests for User Story 6 (first)

- [X] T032 [P] [US6] `services/gateway/test/integration/studio-window.test.ts`: start, end, `already_open`, `not_open`, the audit row, the gauge, the span's attributes with no reason text, and no meter or budget changed, per contracts/gpu-window.md §1
- [X] T033 [P] [US6] The operator CLI's tests for the `studio-window` command: arguments, the reason's length, and the stack refusals, per contracts/gpu-window.md §2

### Implementation for User Story 6

- [X] T034 [US6] `POST /admin/studio-window` in `services/gateway/src/routes/admin.ts`, its server span's attributes (the state and the outcome, never the reason's text), the gauge in the gateway's metrics, and the operator CLI's command, per contracts/gpu-window.md §1
- [X] T035 [US6] `make studio-window ENV=… STATE=… REASON=…`, and **Patch** the bash gate's operator rule to cover it for every stack but dev-cpu, with matrix rows in `redteam/forbidden-actions.sh` for its plain spelling and others (`make -C . studio-window ENV=prod …`, `bash -c 'make studio-window ENV=dev …'`, a variable carrying the stack, the operator CLI's command called directly) and a gap row for any spelling the rule can't catch, per contracts/gpu-window.md §2 and §4
- [X] T036 [P] [US6] The dashboard's annotation and the "Fallback spend in studio windows" panel in `deploy/grafana/dashboards/h4-runtime.json`, with `deploy/scripts/test_dashboard.py`'s cases, per contracts/gpu-window.md §3
- [X] T037 [P] [US6] `docs/runbooks/studio-gpu-window.md`, per FR-035
- [ ] T038 [US6] **Author** (Heavy): the rehearsal, per quickstart §4 (SC-011)
- [ ] T039 [US6] Merge-request note `docs/merge-requests/<date>-feat-003-us6-gpu-window.md`, with `make check`, the rehearsal's record, and the reviewer's passes

---

## Phase 5: Visitors meet the twin, and the visit goes on (User Stories 2 and 3, Priority P1) — branch `feat/003-us2-us3-site`

**Waits** for spec 001's site and relay (its task group 6) and spec 002's room. Before it starts, re-read both, and update contracts/site-loading.md and asset-events.md where they changed.

### Tests (first)

- [ ] T040 [P] [US2] A harness page and its fault-injection tests: a blocked, timed-out, corrupted, and integrity-failing twin GLB; no WebGL2; a forced low frame rate; the 2D control. Every run ends with the line visible and a working text box (SC-007)
- [ ] T041 [P] [US3] The manifest builder's tests: content-derived names, integrity hashes, fallbacks, and only same-origin URLs (FR-029, FR-030)
- [ ] T042 [P] [US3] The relay's `POST /api/events` contract tests: the schema, the refusals, metrics with no address, nothing stored, per contracts/asset-events.md §2

### Implementation

- [ ] T043 [US3] The manifest builder in the site's release, per contracts/site-loading.md §1
- [ ] T044 [US2] The loader, the capability check, the retry and still, the frame-rate step-down, and the 2D control, per contracts/site-loading.md §2 and §3
- [ ] T045 [US3] The disclosure line with the twin in every mode, from the approval's text (FR-032, FR-034), and the credits link and page (FR-033)
- [ ] T046 [US3] The relay's `POST /api/events`, the "Assets" panel, and disclosure rows V6 and the asset requests, in this change, per contracts/asset-events.md and FR-040a, FR-040b
- [ ] T047 [US3] The assets' monthly transfer from the edge, with its estimated cost beside the spec's estimate, on the dashboard, per FR-038 and SC-012
- [ ] T048 [US3] **Author**: the measurements on the reference phone and a desktop, per quickstart §5 (SC-004 to SC-010, SC-012)
- [ ] T049 [US3] Merge-request note, with the measurements, `make check`, and the reviewer's passes

---

## Phase 6: The room's assets (User Story 7, Priority P3, Phase 3) — branch `feat/003-us7-room`

**Waits** for spec 002's room.

- [ ] T050 [US7] `assets/room/` with its `LICENSE.md` and `records.json`; the room's first files through the check, with each approval's room confirmations, per FR-037 and quickstart §6
- [ ] T051 [US7] Merge-request note, with `make check` and the reviewer's passes

---

## Phase 7: The close — branch `feat/003-close`

- [ ] T052 The success-criteria table, in the spec's words, with each criterion's run: SC-001 to SC-003 and SC-011 once Phases 1 to 4 are merged; SC-004 to SC-010 and SC-012 after Phase 5, in `docs/merge-requests/<date>-feat-003-close.md`

---

## Dependencies & Execution Order

- **Phase order is merge order:** 1 → 2 → 3 → 4, then 5 and 6 when their dependencies exist, then 7.
- **Hard dependencies:** Phase 1 before any studio file is staged or committed (FR-003); Phase 2 before the first asset or published image (FR-004); ADR 0010 accepted before any avatar or animation (FR-018); the twin's disclosure line approved before its first file (research R-11); Phase 5 after spec 001's site and relay and spec 002's room.
- **Within a phase:** tests first (they must fail), then the code, then the Author's task, then the note.

## Parallel opportunities

- **Phase 1:** T001 and T002.
- **Phase 2:** the check's tests (T007, T008) beside the helpers' tests (T009, T010); the docs (T019 to T023) beside the code.
- **Phase 4:** T032 and T033; T036 and T037.

## Implementation strategy

- **MVP:** Phases 1 and 2. The studio's files can come in safely from then on.
- **Then:** Phase 3 when the evaluation runs, Phase 4 before the studio's first heavy job, Phase 5 with the site.
