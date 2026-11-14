# Notes: spec-026 and its reworks (2026-11-14)

## impl-026 (on `night/impl-026/impl-026`, from rework3-spec-026's tip 9bba8f36)

Step 1: `night/verify2-020/verify2-020` (3767859f) merged first (92ce0066), with no conflict.

### T001, T002: the reach's pure math

T001 RED (5ad2fa5d): `pet-reach.test.ts` failed at import, because there was no module. T002 GREEN: `pet-reach.ts`'s pure part (`solveLean`, `solveTwoBone`, `strokeTarget`, `weightAt`, `strokeShare`, `PET_REACH_DEFAULTS`), with no three.js import.

```
$ npx vitest run test/room/pet-reach.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

### T003: stopped RED at the measure (Q162)

`test/room/pet-reach-measure.test.ts` reads both real rigs and prints plan §3's table. At the dog's default home and heading, FR-007's spine lean leaves the twin's hand 0.15 m to 0.20 m short at 75°, and the man's 0.25 m to 0.30 m, where SC-002 allows 0.08 m. About the hips alone, the man needs 74.8° at [0.36, 0.55], over the cap once the margin is added. So no default is set (`lean_max_deg` stays 35), SC-002 isn't relaxed, and the question is on the page (`/night/io/out/questions.md`, recommended: a crouch through the hips and knees). T003's own tests (`pet-reach-rig.test.ts`) and T004 wait for his answer.

```
$ npx vitest run test/room/pet-reach-measure.test.ts
twin: shoulder 1.395 m, a 0.309 m, b 0.307 m (to the middle finger's base), hips 0.905 m, 0.98 (a + b) 0.603 m
  spec 025's estimate [0.36, 0.55], head +z (heading_deg 0): turn -60.0°, shoulder to target 0.991 m; lean about the hips 72.3°; over the spine > 120°, short at 75° by 0.200 m
  spec 025's estimate [0.36, 0.55], head -z (heading_deg 180): turn -60.0°, shoulder to target 0.889 m; lean about the hips 52.8°; over the spine 74.3°, short at 75° by 0.000 m
  spec 025's estimate [0.36, 0.55], head toward the twin: turn -60.0°, shoulder to target 0.887 m; lean about the hips 85.6°; over the spine > 120°, short at 75° by 0.152 m
  Q158's estimate [0.30, 0.45], head +z (heading_deg 0): turn -60.0°, shoulder to target 0.967 m; lean about the hips 67.0°; over the spine 115.0°, short at 75° by 0.154 m
  Q158's estimate [0.30, 0.45], head -z (heading_deg 180): turn -60.0°, shoulder to target 0.903 m; lean about the hips 47.7°; over the spine 70.0°, short at 75° by 0.000 m
  Q158's estimate [0.30, 0.45], head toward the twin: turn -60.0°, shoulder to target 0.884 m; lean about the hips 73.8°; over the spine 101.4°, short at 75° by 0.092 m
man: shoulder 1.438 m, a 0.269 m, b 0.407 m (to the middle finger's base), hips 0.946 m, 0.98 (a + b) 0.662 m
  spec 025's estimate [0.36, 0.55], head +z (heading_deg 0): turn -60.0°, shoulder to target 1.034 m; lean about the hips 74.8°; over the spine > 120°, short at 75° by 0.298 m
  spec 025's estimate [0.36, 0.55], head -z (heading_deg 180): turn -60.0°, shoulder to target 0.928 m; lean about the hips 49.7°; over the spine 82.7°, short at 75° by 0.025 m
  spec 025's estimate [0.36, 0.55], head toward the twin: turn -60.0°, shoulder to target 0.934 m; lean about the hips 84.1°; over the spine > 120°, short at 75° by 0.224 m
  Q158's estimate [0.30, 0.45], head +z (heading_deg 0): turn -60.0°, shoulder to target 1.008 m; lean about the hips 68.4°; over the spine > 120°, short at 75° by 0.246 m
  Q158's estimate [0.30, 0.45], head -z (heading_deg 180): turn -60.0°, shoulder to target 0.939 m; lean about the hips 44.2°; over the spine 73.6°, short at 75° by 0.000 m
  Q158's estimate [0.30, 0.45], head toward the twin: turn -60.0°, shoulder to target 0.930 m; lean about the hips 70.8°; over the spine > 120°, short at 75° by 0.141 m
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

What the measure assumes: the man is scaled to `figures.twin_height` (1.82 m, the `twin-figure` piece's `h`) from its 1.76 m, as `avatars.ts` scales a stand-in, and the twin keeps its own size. The dog's head is on the side its picture faces, which is glTF's +z at `heading_deg` 0 (spec 025's R-10, spec 020's fixture). There's no dog model on the line to check that against (spec 020's round 1 stopped). The two other facings are there for the question.

### T005, T006: wait for spec 025's code

Adding `petting` to `TWIN_STATES` and `TWIN_CLIP_ROLES` changes the emitted twin block (`emit.ts`'s `twinBlockOf`), RA8's played roles (`reach.ts`'s `playedRoles`), RI8's keys, and `twin-reach.test.ts`. That test reads `assets/twin/<role>.glb` for every role, so it would fail on a `petting.glb` that isn't there. Spec 025's T003 and T004, built beside this branch on `night/impl-025/impl-025`, change the same lines for `fleeing`. Writing T005's RED now would leave a failing test on the line, and splitting T006 would leave the same lines to merge twice. Both wait, and a later task does them from impl-025's reviewed tip. Nothing in T007 to T010 needs them: the director declares `PetActivity`, the same shape as the `pet` kind T006 adds (plan §4, "As built").

### T007 to T010: the director, on fakes

Each RED was committed before its GREEN:

| Task | RED | GREEN |
|---|---|---|
| T007 / T008 | `pet-director.test.ts` failed at import (no `pet.ts`) | 15 passed |
| T009 | `pet-degraded.test.ts`: 12 failed, 8 passed (the null figures, the levels at selection, the pause's hold, another piece's selection, and the fetch spy passed on T008's code) | with T007's: 35 passed |
| T010 | `pet-notes.test.ts`: 6 failed, 3 passed (the frame log takes any kind at run time; tsc refuses it until `FrameEvent` has it) | 44 passed with T007's and T009's |

T010's covering tests caught two pins on the closed list of UI keys: `vocabulary.test.ts`'s keys and count (77 to 78), and the known-good fixture's `ui-words.yaml`, which spec 018's words commit also changed. Both changed in T010's commit, the pin only. The key goes after `twin.stand_in`, not at the list's end, so it doesn't sit where spec 025's six chase keys go. T008's commit was checked with eslint only, and `make lint`'s tsc then found `config` refusing `undefined` (`exactOptionalPropertyTypes`). That was fixed in T010's commit.

### T017, T018: the checker and the proposal

T017 RED: `test_dog_intro_proposal.py`, 17 failed and 1 passed (the determinism case, both runs failing alike). GREEN: 18 passed. Plan R-13 records the CLI and the two departures in reading. T018: `corpus/proposals/dog-intro-2026-11-14.md`, written at that path (the container allowed it, so FR-017's fallback wasn't needed). The checker in proposal mode reads it as OK, "buildable: no". Line 4 says "the room's dog figure" where plan §3 said "in 3D", because the digit rule refuses the added digit (plan §3 records it). rv-rework3-spec-022's N-2: `topicHashInput` runs from line 220 (its comment) to line 233. "220 to 228" is corrected in the spec, the plan, the human-patch note, and the proposal. The second rework's record below keeps its old words.

### T020: the docs

`docs/studio/twin-petting.md`, the clip's brief (RK5 and row V1 named; Blender 5.2.3 and the exporter from main's list). Data-flow check: row V1's "the twin's model and clips in every 3D visit above the floor, the same for every visitor" covers `petting.glb`. No row lists the selectables or the twin's clips by name (`grep -n "snowboard\|chalkboard\|greeting\|idle.glb" docs/data-flow-disclosure.md`: none), so no sentence was added. There's no dashboard change and no ADR here: the one ADR (Q161) is the docs role's, and the notes name it as waiting. The merge-request note is `docs/merge-requests/2026-11-14-feat-026-twin-pets-dog.md`.

### Step 5: verify-021 merged

`night/verify-021/verify-021` (b3d043a2) ends item 4 with "verify-021: green, carrying D-V2's six (Q165)", so it merged (8b815f02) with no conflict. The small tests ran again on the merged tip, all passing (the merge-request note has the output).

### Interruptions

One hook finding, not a refusal: the post-edit hook reported two ruff findings in `dog_intro_proposal.py` (FURB188, ISC004). Both were fixed before the commit. No bash-gate refusal was hit, and nothing was respelled.

## The third rework (rework3-spec-026, on `night/rework3-spec-026/rework3-spec-026`, from rework2-spec-026's tip 8e676f55)

Fixes for the Opus review rv-rework2-spec-026 (**not blocking**), done while a worker was free so impl-026 starts from a spec that matches the line's code. No code. Files: `intent/026-twin-pets-dog.md` (its rework line only) and `specs/026-twin-pets-dog/` (spec, plan, tasks, analysis, these notes). Read with `git --no-replace-objects`: `night/fix-020/fix-020` (3953b4c1: `compose/pick.ts`, its `memberRect` and `listOnly`; `compose/framing.ts`'s `Box`; `scene/bundle3d.ts`; `build/room/checks/rg.ts`'s `pickSweep`, lines 639 to 700; `room/scene.yaml`'s `selectables` and `twin-figure`; `src/choice/avatars.ts`'s `dog` shape; the tests that import them), spec 025's final tip bb1240be (plan §3, §3.1: the shell's z ±0.610), and the page's Q160 and its note.

- **I-1** (the twin has no pick area; checked: `selectables` hold the snowboard, the bicycle, the laptop, the chalkboard; `twin-figure` is a placement with `frame: true`; `pickSweep` builds areas only from selectables' members): spec FR-014, User Story 3 scenario 5, M4, the Q160 note (the page's note quoted), Assumptions' RG6 paragraph; plan R-09 ("beside the twin's figure" is where the box stands; `pickSweep`'s inputs gain only the `front`; no twin pick area); tasks T013a (the grid's selectables are the scene's real ones plus `dog`, no twin piece).
- **I-2** (rule 4): T013a and plan §6's `dog-pick` row gain `scene-fit`, `flat`, `flat-frame`, `protect`, `report`, and, found here, `bundle` and `objects` (each imports `compose/pick.ts`); T013b and the `dog-selectable` row gain `test/room/highlight.test.ts` (the one test calling `memberDraws`).
- **Nit-1**: `dogBoxAt` returns the turned box's axis-aligned bounds (`Box`'s `min`, `max`): FR-014, R-09, §4, T013a. **Nit-2**: T013a asserts the dog's projected rectangle non-null at every swept stage and on the shipped scene, and stops RED with a page question if it is null at the shipped home: FR-014, Assumptions, R-09, T013a, the dependencies. **Nit-3**: Expected Cost Impact says 22 small tasks, T013 being T013a and T013b.
- **Analysis re-run** (`/speckit-analyze`, with `SPECIFY_FEATURE_DIRECTORY`): no CRITICAL; A9 updated, A14 resolved, A15 (the bounds at an off-axis heading, LOW) and A16 (covering tests, INFO) added.
- **Questions**: none new (`/night/io/out/questions.md` says so and names the two the implementer may raise at T003 and T013a).

### Small runs (rule 4)

```
$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py
.............................................................            [100%]
61 passed in 0.89s

$ python3 -I evals/docs_links.py
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2409 relative links in 384 files

$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this container (no `node_modules`); this task changed only Markdown.

### Interruptions

None: no hook or bash-gate refusal was hit.

### What's left

Nothing of this rework. impl-026 on the line after spec 025's code (this branch merged first): T001 to T021, with T003's lean and T013a's non-null check and RG6 run on the shipped scene as the two places it may stop for the page; impl-026's reviewer checks this rework on the line (T022); the Author's T023 as the second rework lists it below.

## The second rework (rework2-spec-026, on `night/rework2-spec-026/rework2-spec-026`, from rework-spec-026's tip 3417bff2)

Rule 6's rework after the Opus review rv-rework-spec-026 (blocking: RB-1, RB-2; also I-2, I-3, N-1, N-2, N-4). No code. Files: `intent/026-twin-pets-dog.md` (its rework line only), `specs/026-twin-pets-dog/` (spec, plan, tasks, analysis, these notes), `docs/merge-requests/human-patches/026.md`. Read with `git --no-replace-objects`: spec 025's final tip bb1240be (plan §3, §3.1, R-09; spec FR-008, FR-018, Q10, Q13), `fix-020`'s `compose/pick.ts`, `bundle3d.ts`'s picker, `rg.ts`'s `pickSweep`, `src/choice/avatars.ts`, `scene.yaml`; `main`'s `compose/floor.ts`, lines 121 to 147; the page (Q149, Q152 to Q154, Q158 to Q162).

The page's Q159 to Q162 read "Answered: recommended" under the orders file's rule; each recommended answer is taken **provisionally**, not as his answer (spec, a third clarification session; plan and tasks, their rework notes). Q158 (spec 025's) is written against.

- **RB-1 (Q159)**: the dog stays at its home; the twin turns (`faceTwin`) and reaches. Dropped: `visiting`, `visit()`, the pet spot, "fits", "occupied", the approach's limit, `pet.walk_mps`, `pet.approach_max_s`; spec 025's director gains only `faceTwin`, and `chase-figures.ts` no longer changes. The petting needs the dog's home within `reach_m` (0.55 m) of the twin's (0.660, 0.469); `pet-homes.test.ts` pins it on the shipped scene: 0.36 m at Q158's estimate (about [0.30, 0.45], impl-025's T011), 0.311 m before it. Why the walk never ran (checked by hand): the corner is 0.275 m deep, so no point of it has the 0.3 m clearance `footprint_m` asked; the home was nearer than `reach_m`; the "occupied" ring (0.6 m) covered most of the strip. Spec Q3, FR-001, FR-003 to FR-005, FR-010, FR-011, US1, US2, edge cases, A025, M3, SC-001; plan R-01, R-06, R-07, R-08, §3, §4, §5, §6, §9, §10; tasks T007, T009, T011, T012, T014.
- **RB-2 (Q160)**: the dog's rectangle is a front-only member: `PickInput.front`, seen only by `pick`'s first rule and `pickProblems`' "member" check; the "Dog" piece's union and core stay the sign's; RG6 (`pickSweep`) measures the dog's box at its home beside the twin's figure. The box is `dogBoxAt(figures.dog, AVATAR_SHAPES.dog)`, never loaded geometry, so the build and the pointer use the same box. Spec FR-014, M4, US3 scenario 5, Assumptions; plan R-09; tasks T013a (with the in-memory sweep of the shipped scene, its result to the page before T019), T013b.
- **I-2 (Q161)**: the one ADR for specs 024's, 025's, and 026's "no usage event" deviation; the docs role drafts it, he merges it on `main` before the implementation merges. Spec Assumptions, Constitution row II; plan R-11, §9; tasks T020, T023; patch's "Also yours".
- **I-3 (Q162)**: T003 measures both rigs first and sets `lean_max_deg` (capped at 75°), recorded in plan §3; a shortfall stops it RED with a page question. Spec FR-007, SC-002; plan R-03, §3.
- **N-1** `04`'s "None named for this topic:" becomes "None named by him for this topic:", marked as the spec's (FR-021, plan §3, T018, patch item 1). **N-2** the digit rule allows a quoted span found verbatim in its named source (FR-023, R-13, T017). **N-4** bb1240be cited; RQ1 and RQ2 named as the page's Q153 and Q154. I-1 is spec 022's (rework3-spec-022); N-3 is spec 027's: neither touched.
- **Analysis re-run**: A1 to A14, no CRITICAL; F2 and F3 of the first pass resolved by RB-1. New: A9 (RG6 on the shipped scene with the piece is known only at T013a), A11 (the aim may meet the 60° clamp; printed for his look), A14 (task count wording, left).
- **Questions**: none new (`/night/io/out/questions.md` says so, and names the two the implementer may raise at T003 and T013a).

### Small runs (rule 4)

```
$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py
.............................................................            [100%]
61 passed in 1.70s

$ python3 -I evals/docs_links.py
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2409 relative links in 384 files

$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this container (no `node_modules`); this task changed only Markdown.

### Interruptions

None: no hook or bash-gate refusal was hit.

### What's left

rv-rework2-spec-026's review of this rework. Then implementation T001 to T020 on the line after spec 025's code (this branch merged first): T003 measures the lean first, T011 adds only `faceTwin` against bb1240be and Q158's home, T013a runs RG6 on the shipped scene with the piece in memory; the review T022; the Author's T023: Q120 to Q127, Q140 to Q145, Q153, Q154, Q158 to Q162 on the page, the one ADR (Q161), his look, the studio round's intake and approval, the corpus patch once spec 020's approval is on main (applied back to back with spec 022's, the slot and any Golden Q&A 9 in his own words before he regenerates), his one evaluation of the three topics and their readiness marks, the merge.

## The rework (rework-spec-026, on `night/rework-spec-026/rework-spec-026`, from a7c78a6f)

Rule 6's rework after the Opus review rv-spec-026 (blocking: B1 to B4; also I1 to I6, N1 to N5). No code. Files: `intent/026-twin-pets-dog.md`, `specs/026-twin-pets-dog/` (spec, plan, tasks, analysis, these notes), `docs/merge-requests/human-patches/026.md`.

The page's Q140 to Q143 (the review's) and Q144, Q145 (spec 027's review's, which bear on this patch) read "Answered: recommended" under the orders file's rule. Each recommended answer is taken **provisionally**, not as his answer; the spec says so in a second clarification session, and the plan and tasks in their rework notes.

- **B1 (Q140)**: built on spec 025 as reworked, read at `rework2-spec-025` (7ead9819, still running; earlier tip c73cee1d): `FigureId` `dog` (`stage.ts`, carried by `scene/avatars.ts`), `figures.dog: { home, footprint_m }`, the pictures placed by `scene/chase-figures.ts` from the director's poses, `pictureOf`/`legsOf`, the head point from the dog's picture and `AVATAR_SHAPES.dog`. FR-001 at quality level 0 only. FR-003: the spot computed from `figures.dog.home` at `reach_m`; "fits" (walkable, clearance ≥ `footprint_m`, no overlap) and "occupied" (the walking pose within `footprint_m + separation_m`) defined. R-06: `visiting` in `chase.ts` and `chase-figures.ts`, now definite; R-07: `faceTwin` into the director, so `chase-figures.ts` stays the one writer of the twin's heading. FR-014 and M5: a pick for the `dog` piece only, dog at home, amending 025's FR-018. R-09, plan §4, §5 (conflict watch with `stage.ts`, `chase-figures.ts`, spec 018's `app.ts` and `src/talk/talk.ts`), T011, T013, T014.
- **B2 (Q142)**: no usage event, no dashboard count; the Principle II and Development Workflow 7 deviation named in Assumptions; the New Endpoint list, Constitution row II, R-11, T010, T020, analysis A5. The frame log keeps a `twin-pet` record (N5: hyphenated, as `twin-state`), a development aid never sent.
- **B3 (Q141, Q144)**: the "Do not claim" line, kept, changes every topic's hash (`apps/web/build/twin-pack.ts`, line 17 and lines 220 to 228), so the patch closes mission, work projects, and hobbies and travel; he applies 022's and 026's back to back and evaluates once. It takes hobbies and travel past ADR 0054's T1 (20,916 of 21,182 on main; 266 left). The line's wording now puts its claim before the colon (N3: C9's key phrase stops at the first ", "): "That the dog in the room is a real dog: it is an AI-made likeness, not a photo or a recording." (on the page as RQ2). Q7, FR-021, FR-022, User Story 4, §Degraded-Mode, Assumptions, analysis A2 and A4, T018, plan §7, patch lead and items 1 and 5.
- **B4 (Q143)**: Golden Q&A 9 and the slot take only his own words; "Answered: recommended" never fills them. FR-018, FR-020, FR-023, R-13; T017's failing fixture (an "Answered: recommended" entry, the text on its "Recommended:" line) the checker refuses; T019.
- **I1** `content:lock`, `content:check`, `narration.test.ts` in T019, FR-022, SC-005, plan §3 and §6, patch item 1. **I2** `04`'s line 4 (FR-019, plan §3, patch item 1). **I3** fill the slot before his runs (FR-018, T018, patch item 1). **I4** his consent from main's `specs/017-the-night-shift/spec.md`, line 48 (FR-019, FR-023, R-13, T017). **I5** an approved `petting.glb` is a first-visit file, row V1 already covers it, RK5 counts it (FR-025, §Data-Flow, R-14, T020, patch item 3). **I6** the spec's Input names the branches read. **Q145** `docs/corpus-size.json` in FR-022 and patch item 1. **N1** the intent names its drafter. **N2** item i is spec 024's. **N4** FR-023 and R-13 allow Golden `9.`.
- **Found while reworking**: the twin's product cases read only their own file's and `00`'s "Do not claim" lines (`forbiddenFor`), so only `twin-04-*` cases change, not every topic's; the resume's lock pins no `04` file, so `content:lock` should leave it unchanged. The analysis re-run found F1 (T007 still tested the active-conversation check the rework moved to `app.ts`), fixed.
- **Questions**: two new, with recommended answers, in `/night/io/out/questions.md`: RQ1 (the pet spot computed from the dog's home), RQ2 (the "Do not claim" line's wording).

### Small runs (rule 4)

```
$ python3 -m pytest -q evals/test_docs_links.py
............................................                             [100%]
44 passed in 0.87s

$ python3 -I evals/docs_links.py
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2409 relative links in 384 files

$ python3 -m pytest -q evals/test_repository_docs.py
.................                                                        [100%]
17 passed in 0.04s

$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this container (no `node_modules`); this task changed only Markdown.

### Interruptions

None: no hook or bash-gate refusal was hit (also on the questions file).

### What's left

Implementation T001 to T020 on the line after spec 025's code (this branch merged first), T011 reading spec 025's final text (its rework2 was still running: if it differs from A025, only the adapter and T011 change); the review T022; the Author's T023: Q120 to Q127, Q140 to Q145, RQ1 and RQ2 on the page, his look, the studio round's intake and approval, the corpus patch once spec 020's approval is on main (applied back to back with spec 022's, the slot and any Golden Q&A 9 in his own words before he regenerates), his one evaluation of the three topics and their readiness marks, the merge.

## The first pass (spec-026, on `night/spec-026/spec-026`, from main at 3c0e4cd0)

Intent, spec (Q1 to Q8 taken as recommended), plan R-01 to R-14, tasks T001 to T023, analysis A1 to A12, the human-patches note, nine page questions. Its small runs: `evals/test_docs_links.py` and `evals/test_repository_docs.py`, 61 passed; `make lint` stopped at "node_modules is missing". No refusal hit.
