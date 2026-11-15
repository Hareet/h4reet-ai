# Notes: spec-026 and its reworks (2026-11-14)

## patch2-026 (`night/patch2-026/patch2-026`, from patch-026's tip 6c2b20e2, Opus 5.5, 2026-11-15)

Written by the night-shift implementer patch2-026, about 00:37Z to 00:50Z. It does the rework the page's Q292 recommends (answered: recommended, the Author's to confirm or overturn): the slot `hobbies.room_dog_name` and the Golden Q&A 9 suggestion that "fits only if you fill the slot with Arya" are dropped, and T019's patch is rebuilt without them. His approval of the dog's model (`A-20261114-dog`) says the room's dog is "a dog of the breed and not a likeness of the Author's dog". The "## Arya" line keeps his consent and the approval's line, verbatim. The review is rv-patch2-026's, a worker that didn't write this.

**A gap in patch-026's record.** patch-026's human-patch paragraph and the proposal say its runs are "pasted in `specs/026-twin-pets-dog/notes.md` and the stack note's item 9". Neither file holds a patch-026 section at 6c2b20e2, and its commits' messages hold no runs either. The procedure here is rebuilt from its human-patch paragraph, plan §6's as-built line, and the brief. The runs below are this task's own.

**Step 1, test-first (the checker).** RED 0a6b1a96, `scripts/corpus/test_dog_intro_proposal.py` only: the fixtures lose the slot (the "## Arya" line ends after the approval's quotation, and the patch has no facts diff). New cases: `test_patch_passes_with_no_slot_and_no_golden_answer`, `test_patch_refuses_the_dropped_slot_in_any_form` (null, filled, or its `{{slot:…}}` in `04`; the refusal names the slot and Q292), `test_patch_refuses_touching_the_facts_file`, and `test_proposal_refuses_proposing_the_dropped_slot` (its facts entry or its reference in a proposed line; the prose may still name it). `test_patch_refuses_a_filled_slot` and `test_patch_refuses_a_missing_slot` go, since the slot is no longer expected. The result was 8 failed, 21 passed. GREEN 82c4e77d: `dog_intro_proposal.py` refuses `DROPPED_SLOT` (the slot's `- id:` line, or its `{{slot:…}}`) in any file's added lines and in the proposal's lines; of `corpus/`, the patch touches `04` only (`CORPUS_ALLOWED`); `slot_problems` is rewritten, and `SLOT_FIELDS` and `FACTS_04` are gone. The digit rule's `{{slot:…}}` exemption stays, now unused. In the same commit: the proposal (the slot's section, its source-table row, the "## Arya" line's slot, the Golden Q&A 9 suggestion and its source-table row, the "fill the slot" words), spec FR-018 and FR-023, a Clarifications entry for Q292, plan R-13, §3's data, §6 and §7, and tasks T019, each marked "As amended (Q292, patch2-026, 2026-11-15)". Run on the real proposal, the checker refused it before the proposal's edit ("the proposal still proposes the slot hobbies.room_dog_name, which the rework drops (Q292)") and passes after it.

```
$ python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py      # RED, 0a6b1a96
FAILED …::test_patch_passes_with_no_slot_and_no_golden_answer
FAILED …::test_patch_refuses_the_dropped_slot_in_any_form
FAILED …::test_patch_accepts_a_golden_answer_in_his_own_words
FAILED …::test_patch_digit_rule_accepts_its_exemptions
FAILED …::test_patch_refuses_touching_a_human_only_path_or_another_corpus_file
FAILED …::test_b1_the_dogs_whole_line_and_his_consent_still_exempt
FAILED …::test_b1_his_own_answered_line_still_fills_it
FAILED …::test_proposal_refuses_proposing_the_dropped_slot
8 failed, 21 passed in 3.39s
$ python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py      # GREEN, 82c4e77d
29 passed in 2.25s
$ ruff format --check scripts/corpus/
4 files already formatted
$ ruff check scripts/corpus/dog_intro_proposal.py scripts/corpus/test_dog_intro_proposal.py
All checks passed!
```

**Step 2, the patch rebuilt (ebb23226).** No checkout or merge of `main` (Q286). The worktree had no `node_modules`, so `npm ci` ran in it first: 431 packages from the lockfile, and the lockfile is unchanged. Where commands run (`export1/b` and the second export), the worktree's four `node_modules` are symlinked in (root, `apps/web`, `services/gateway`, `services/relay`).

1. The first export: `git merge-tree --write-tree HEAD refs/heads/main` at 82c4e77d gave tree `27e688745e58d1808e178d3678a964c126cdd120`, exit 0, no conflict, with main at b6985ad2. It was `git archive`d into `/tmp/patch2-026/export1/a`. Spec 022's patch was applied there first (`patch -p1`; Q293, plan §7), with no offset, fuzz, or reject. Then `a` was copied to `b`.
2. In `b`, the hand-written lines: patch-026's hunks for `apps/web/room/scene.yaml` (the sign on the floor, Q287, and the `dog` selectable) and `corpus/04-hobbies-and-travel.md`, taken from its patch, with `{{slot:hobbies.room_dog_name}}` removed from the "## Arya" line (`/tmp/patch2-026/hand.patch`). No facts change.
3. In `b`, by their commands: `npm run room:generate -w apps/web` ("room: 4 written, 0 removed, 22 unchanged": `config/room-events.yaml`, `config/room-topics.yaml`, `docs/studio/photo-guide.md`, `docs/studio/work-orders/dog-sign.md`); `npm run twin:pack -w apps/web` ("150 sections, 3 topics; 224 cases"; "wrote docs/corpus-size.json: stage 1; hobbies-and-travel 21,564 of 21,182", mission 21,410, the same record as patch-026's); `npm run content:lock -w apps/web` ("C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); wrote apps/web/content/resume.lock.json and 44 eval cases").
4. `diff -ruN --exclude=__pycache__ --exclude=node_modules a b`, then the `---`/`+++` lines' timestamps stripped (`sed`; none left). The result: 57,377 bytes, 68 files, SHA-256 `8bd705636a1847de6846bdba132ddb16511fdac103f2387477a700a1161c6ead`. Against patch-026's 71 files, the only paths gone are `corpus/facts/hobbies-and-travel.yaml` and the slot's two gap cases, `evals/product/cases/twin-04-hobbies-and-travel-gap-1-engineer.yaml` and `-non-engineer.yaml`. The content's other differences are the "## Arya" line without the slot and `config/twin/corpus.json`'s byte, word, and character counts for the shorter section; there is no `room_dog_name` anywhere in the patch.

**The checks, on a second fresh export.** `git merge-tree --write-tree HEAD refs/heads/main` at ebb23226 gave tree `2625384ace4854651f093fab8f93f476be9b5d37`, archived into `/tmp/patch2-026/export2/t`. Main's spec 017 was archived for the checker's `--main-dir` into `/tmp/patch2-026/main`.

```
022 dry-run: no offset, fuzz, reject, or failure · 022 apply: 104 files patched, none
026 dry-run: 68 files checked, none · 026 apply: 68 files patched, none · no .orig or .rej
$ python3 -I corpus/tools/check_corpus.py
corpus-check: OK — 45 slots, 27 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems   (exit 0)
$ npm run content:check -w apps/web
content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are current   (exit 0)
$ npm run room:check -w apps/web
room: 0 findings in 0 files   (exit 0)
$ npm run room:report -w apps/web
Findings: none.
$ python3 -I scripts/corpus/dog_intro_proposal.py --root <export2> --main-dir /tmp/patch2-026/main patch docs/merge-requests/2026-11-14-corpus-dog-intro.patch
OK: patch 2026-11-14-corpus-dog-intro.patch
buildable: yes (his approval of the dog's model, with its line, is in approvals.json)   (exit 0)
$ (apps/web) npx vitest run test/twin-pack.test.ts test/content/narration.test.ts
 Test Files  2 passed (2)
      Tests  80 passed (80)   (exit 0)
```

Proposal mode needs the tree before 026's patch, since its source table quotes `04`'s lines as they are now. On the patched export it refuses two spans, "In the room, the snowboard and the bicycle open this topic" and "None named for this topic:", both of which the patch replaces, as expected. On the first export's `a` (main and the line, 022 applied): `OK: proposal dog-intro-2026-11-14.md` / `buildable: yes`. On the line's tree (no approval): `OK` / `buildable: no (FR-019: …)`.

**Step 3 (d1c06256).** The new size, file count, and SHA-256 are in the proposal's "The patch" section (patch-026's figures kept beside them as replaced) and in `docs/merge-requests/human-patches/026.md`: a patch2-026 paragraph ahead of patch-026's, and item 1's row without the slot and its "fill the slot" words. Then the small runs after the edits:

```
$ python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py
29 passed in 3.41s
$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py
61 passed in 1.01s
$ python3 -I evals/docs_links.py
docs links: 0 failed, 2498 relative links in 453 files
$ make lint      (at d1c06256, exit 0)
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
836 files already formatted
# then shellcheck over the repository's scripts: no finding; make exited 0
```

No full `make check`: the stack's last task runs it once (rule 4).

**Copies left under `/tmp`** (not committed; the next worker may delete them): `/tmp/patch2-026/export1/a` (tip and main, 022 applied), `/tmp/patch2-026/export1/b` (the same, with 026's lines and the regenerated files), `/tmp/patch2-026/export2/t` (the second export, 022 and 026 applied), `/tmp/patch2-026/main` (main's spec 017 only), `/tmp/patch2-026/hand.patch`, `/tmp/patch2-026/raw.patch` (with timestamps), `/tmp/patch2-026/new.patch` (the committed patch), and `/tmp/patch2-026/export1-022.log` and `e2-*.log` (the `patch` runs).

**What waits for him.** Q292 and Q293, as the page has them, are his to confirm or overturn. If he overturns Q292 toward keeping the slot, the patch goes back to patch-026's build (d0ab9204…391ea) and the checker's Q292 cases are reverted. There is one new question, about the "Do not claim" line's word "likeness" (on the page). Applying the patch, 022 first, his evaluations, and readiness are unchanged from the human-patch note.

**Interruptions (patch2-026).** No hook or bash-gate refusal. `npm ci --offline` failed (ENOTCACHED, the cache held no tarballs), and `npm ci` from the registry succeeded. Nothing was respelled.

## impl3-026 (`night/impl3-026/impl3-026`, from rework2-026's tip 82e3508b, Opus 5.5)

Written by the night-shift implementer impl3-026, 2026-11-14, about 21:30Z to 23:45Z. The review is for a worker who didn't write the code (T022, rule 6).

**Merges first (step 1).** `refs/heads/night/rework-025/rework-025` (8ce1558f, item 8's reviewed tip): two conflicts. One was `vocabulary.test.ts`'s count of the UI keys: 77 at the base, 78 with `figures.pet_note`, 83 with spec 025's six run lines; resolved to 84 (the pin only). The other was this note, kept whole, item 8 before item 9. Then `refs/heads/night/verify-022/verify-022` (7db03c0f, the line's tip): two conflicts. One was the disclosure's row V1: both rows' additions kept (the room's dog's files, and the PDF's links). The other was this note, rebuilt by items: items 1 to 6 and 10 as verify-022 has them, items 8 and 9 as this branch had them, in his order (1 to 6, 8, 9, 10). A first check after the merges: `vocabulary`, `words`, `pet-director`, `pet-degraded`, `pet-notes`, `pet-reach`, `chase-director`, `chase-figures`, `twin-states`, `live`: 10 files, 288 passed.

**Built (step 2), one commit a task, RED before GREEN unless said:**

- **T005 / T006** `petting` in the twin's states: after `fleeing` and `arriving`, before `answering`; `{ kind: "pet", on }`; the timers run under it; `TWIN_CLIP_ROLES` and the default map gain `petting`. The pins changed in the same commit: `twin-states` (the roles), `bundle` (the emitted map), `twin-compose` (the fixture's roles plus `petting`), `chase-states` (petting's clip played where bundled), `twin-reach` (the delivered clips, all but `petting`, which RA8 samples once his intake bundles it).
- **T011a** `faceTwin` on spec 025's director (`chase.ts`): 180°/s, at most `FACE_MAX_RAD` (90°, the schema's ceiling; the director clamps to the data's `turn_max_deg`) from home; `null` back; ignored under the run, and dropped when a run starts; cut by reduced motion and level 1; held by a pause. `chase-figures.ts` unchanged, the one writer (plan R-07 as built).
- **T011b** `pet-adapters.ts`: the twin's and the dog's views, made once, homes read as `chase-figures.ts` reads them; the run's adapter. **Gap:** spec 020's model isn't on the line (`assets/visitors/dog/` absent), so the head point's pin and `dogBoxAt` against its bounds wait for his intake (plan §4 as built).
- **T012** `figures.pet` (optional; plan §3's defaults; ranges; R-08's refine against `separation_m`) and `selectables[].figure` (`dog` only) in the schema, the bundle, and the shipped scene; the defaults moved into a pure `pet-config.ts` so the build reads them without three.js. On the shipped scene: the twin's home (0.660, 0.469), heading −180°; the dog's (0.3, 0.45), 0.361 m away; the aim 60° from home (clamped), the right arm.
- **T013a** the front-only pick: `dogBoxAt`, `pick.ts`'s `front`, the picker's `pickable`, `pickSweep`'s `figureFronts`. The dog's rectangle is non-null at all 7,671 supported stages. **RG6 finding (on the page, before T019):** with the `dog` selectable added in memory, RG6 refuses its desk sign against the laptop (the sign's core over the laptop's members at 7,528 of 7,671 stages, the two cores at 3,076, in 3D and 2D alike), and the dog's figure adds nothing to that (the sweep with it equals the sweep without it). The test's last RG6 case, its owner's, was reworked after RED: the member rule over the dog's rectangle is shown on a fixture piece on the desk.
- **T013b** `memberDraws`' figures and the highlight's, `dogPickable`, `talk.active`, `selectObject`'s `pet?` (unless the active conversation is the piece's), `Stage3D.pet`. `scene.ts`'s part landed with T014.
- **T014** the wiring. The controller's `twinState`, `reachRigOf`, `pet(link)`; the reach laid after the legs by `applyReachLayer(rig, pet.reach, config)`; the petting clip once, its end ending the petting. In `scene.ts`: the director and its adapters with the run's shell, `pet.frame` before the shell's, `Stage3D.pet`, the picker's `pickable`, the highlight's figure, and two new signals (`pet-note`, `twin-pet`) that `app.ts` says and logs. **Departure (on the page, its recommended answer taken provisionally):** the run's shell is made for every visitor where the room has the dog, so the twin can turn to pet it; no run starts unless the visitor is the dinosaur. **Found by `pet-wiring.test.ts`:** three's mixer writes a bone only when its sampled value changes, so the idle's constant left-knee track left the crouch on the bone. On the run's first frame the run's gait took it as its base, 1.5 rad off. `settleReach` now gives the legs back to the clip before the gait every frame the reach is laid. The test was written after the wiring, not RED first: its red was that leak. An export of the pre-T014 tip couldn't run it (pako's module error in the global setup).
- **T015** dropped, as tasks.md allows: the night's time went to T013a's finding, T014's leak, and T016's real paths.
- **T016** the timing half, the real paths, and rv-rework2-026's nits 2 to 4 (below). **A known gap, on the page:** over the real adapters with spec 025's real director the director allocates, 246 bytes a petting, marked `it.fails`.
- **T019** waiting on his approval of the dog's model (the page's Q260), and on T013a's RG6 question. The human-patch note says so.

**rv-rework2-026's words, answered.** "The director allocates nothing only if the page's `clock.now`, `twin()`, `dog()`, `dog.headPoint(out)`, and `chase.twinHeading()` keep their fractions in class fields or typed arrays": the adapters' views are class instances written in place, and `headPoint` writes into the `out` it's given. Measured over the real adapters, the real `twin()` and the real turn still allocate, the gap above. A typed-array read of the heading (`twinHeadingInto`) was tried, didn't move the number, and was reverted. "Re-run `pet-bench` with the real chase adapter": done, pasted below. "Apply the reach with `applyReachLayer(rig, pet.reach, cfg)`": `avatars.ts`'s `stepReach` does, and no weight is passed as a number. "A consumer must react to `options.signal` and never detect a new petting by object identity": the controller takes the director's activity through `signal` (`twinActivity`) and reads `reach` each frame; nothing compares activity objects. "Build the seeded timing benchmark": `msPerCall`, pasted below. Nit 2: `select` is among the functions the warm-up waits for, optimized itself or inlined into its optimized caller (V8 inlines it into the step that calls it once a petting, and then it has no optimized code of its own). Nit 3: the comment gives the actual warm-up, at least 20 passes and up to 100. Nit 4: `dog_intro_proposal.py`'s docstring states the regex as it is ("re", one or more "c", "o", one or more "m", "end"), and its long line is wrapped, with no logic change. Nit 1 is the page's Q266, for his hand; the runs beside every measured number are pasted here.

**Small runs (rule 4), each from `apps/web` unless said; each task's commit names its own:**

```
T005 RED   pet-states, twin-states: Tests 9 failed | 19 passed (28)
T006       pet-states, twin-states, chase-figures, chase-states, twin-compose, twin-reach, twin-handoff, twin-figure,
           twin-2d, bundle: Test Files 10 passed (10) · Tests 183 passed (183)
T011a RED  chase-face: Tests 14 failed | 1 passed (15)
T011a      chase-face, chase-director, chase-figures, chase-degraded, chase-steer: Test Files 5 passed · Tests 85 passed
           chase-bench, chase-notes, chase-handoff, chase-end-line, chase-states, chase-schema: 6 passed · 59 passed
T011b RED  pet-adapters: Cannot find module '../../src/room/scene/pet-adapters'
T011b      the five chase files and pet-adapters: Test Files 6 passed (6) · Tests 98 passed (98)
T012 RED   pet-homes: Tests 27 failed | 2 passed (29)
T012       pet-homes, schema, data-only, scene, chase-schema: Test Files 5 passed (5) · Tests 414 passed (414)
           the 51 files importing emit.ts or the repository's bundle: Tests 1 failed | 916 passed (917), the one
           report.test.ts's "marks the counter face exempt on the phone", one of D-V2's six (Q165): it fails the same
           on 7db03c0f, 8ce1558f, and 82e3508b (each a git archive copy): Tests 1 failed | 24 passed (25)
           pet-homes: the twin's home (0.660, 0.469), heading -180.0°; the dog's home (0.3, 0.45), 0.361 m away
           (reach_m 0.55); the aim -240.0°, -60.0° from home (turn_max_deg 60), the right arm
T013a RED  dog-pick: the dog's rectangle undefined; pick.ts takes no front
T013a      dog-pick plus pick, ui/pick, stages-checks, geometry, data-only, events, ui/highlight, scene-fit, flat,
           flat-frame, protect, report, bundle, objects: Test Files 1 failed | 14 passed (15) · Tests 1 failed | 341
           passed (342), the one D-V2's report.test.ts case above
           dog-pick: RG6 on the shipped scene with the dog selectable in memory, over 7671 stages: 3D 2 core 4
           (320 × 250 and 3075 more); 3D 2 member 4 (320 × 250 and 2348 more); 3D 4 core 2 (320 × 250 and 3075 more);
           3D 4 member 2 (320 × 250 and 7527 more); 2D 2 core 4 (320 × 250 and 4292 more); 2D 2 member 4 (320 × 250
           and 3664 more); 2D 4 core 2 (320 × 250 and 4292 more); 2D 4 member 2 (320 × 250 and 7527 more)
T013b RED  dog-selectable: Tests 6 failed | 1 passed (7)
T013b      dog-selectable, objects, dog-figure, ui/a11y, ui/highlight, room/highlight, ui/talk, ui/talk-activity:
           Test Files 8 passed (8) · Tests 167 passed (167)
T014       pet-wiring, pet-reach-rig, avatar-scene, twin-figure, avatar-gait, chase-figures, chase-face, pet-adapters,
           dog-selectable, room/highlight, chase-handoff, pet-director, pet-degraded, pet-notes: Test Files 14 passed
           (14) · Tests 213 passed (213)
           ui/talk, ui/a11y, objects, ui/hud-pointer, stage-walk, avatars, twin-handoff, live: Test Files 8 passed (8)
           · Tests 174 passed (174)
T016       pet-bench: Tests 5 passed | 1 expected fail (6)
             pet.select and pet.frame, a whole petting of 251 frames (turn 19, petting 211, return 20; 59 eased): 3.13
               bytes a petting
             pet.select and pet.frame, a short petting of 9 frames: 0.25 bytes a petting
             pet.frame through a cut petting of 40 frames (fade 11): 0.25 bytes a cut petting
             applyReachLayer at weight 1: 0.25 bytes a frame; legs off 0.25; 0.0040 ms a frame; legs off 0.0032 ms
             applyReachLayer at weight 0.37: 0.25 bytes a frame; legs off 0.25; 0.0041 ms a frame; legs off 0.0031 ms
             pet.select and pet.frame over the real adapters, with chase.frame: 246.33 bytes a petting of 252 frames;
               0.0001 ms a frame                                     (the it.fails case: over 12 bytes a petting)
             the wired twin's frame (pet.frame, the run's shell, figures.update): linked 685.24 bytes and 0.0122 ms a
               frame; unlinked 685.23 bytes and 0.0049 ms; the reach adds 0.01 bytes and 0.0073 ms
           a scratch breakdown (not kept), whole pettings, bytes a petting: fake chase and fake twin 1.8; fake chase
           and the real twin() 64.1; the real chase and a fake twin 16.1; both real 152.1
           (root) python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py: 28 passed in 2.14s
           pet-states, pet-homes, twin-states after the lint target's prettier: Test Files 3 passed · Tests 57 passed
```

The lint target, at the tip before this note (245df0eb), from the root, exit 0:

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
821 files already formatted
# then shellcheck over the repository's scripts: no finding; make exited 0
```

Its first run found four files Prettier would reformat (`pick.ts`, `twin-states.ts`, `pet-homes.test.ts`, `pet-states.test.ts`); they were formatted, their tests rerun (57 passed), and committed (245df0eb). No full `make check`: the stack's last task runs it once.

**What waits for him.** The page's questions from impl3-026: RG6 on the `dog` selectable's sign (blocks T019; recommended: move the sign along the desk, offsets measured for his look); the run's shell for every visitor (taken provisionally); FR-027's allocation over the real adapters (recommended: a rework); Q266, the CLAUDE.md line. His approval of the dog's model (Q260), then T019's patch. The ADR for the "no usage event" deviation (Q161).

**Interruptions (impl3-026).** No hook or bash-gate refusal. The harness refused one foreground `sleep` while I waited for a background run, and I used a background until-loop instead. The edit hook flagged lint findings in a helper script I wrote under `/tmp` (`SIM115`), and I fixed them. Nothing was respelled.

## rework2-026 (on `night/rework2-026/rework2-026`, from rework-026's tip 6973088c)

The findings, as the supervisor's brief quotes them (no review file was mounted): rv-rework-026's B-3 (blocking) and its nit 5; rv-impl-026's N-1, N-3, and N-4, which rework-026 had fixed from a summary; and the checker's B-1, B-2, I-4, and nit 1, which go to the Backlog under the Author's rule 11. This branch merges nothing. Each RED came before its GREEN, and the plan's changes are in their fix's commit.

### B-3: the director measured over whole pettings

rv-rework-026, in its words: "only the petting's steady middle. `heading` is NaN (line 104), so the turn ends on its time limit in one `pet.frame(1)`. Every measured frame has `reach.weight` at exactly 1 (line 109)." It was right: rework-026's 0.27 bytes a frame measured the middle of a petting, nothing else.

`pet-bench.test.ts` now measures a whole petting at a time, from `select` to idle: at the defaults, the twin turning on a fractional heading that converges (19 turn frames, 211 petting frames with 59 eased, 20 return frames); a 0.1 s petting whose phases change every few frames; and a run's cut 15 frames into the reach-in, through its fade. The bound is 12 bytes (one object) a petting. A bound of 8 bytes a frame let 1,310 bytes a petting through on the first harness I tried.

| Commit | What | Whole, short, cut (bytes a petting) |
|---|---|---|
| 831e1bb7 | RED: the three director tests; the bench's own timeout (nit 5) | 418.78, 216.26, 176.25 |
| 427b2ac3 | RED: 20 warm-up passes, 5,000 whole pettings a pass | 188.33, 216.26, 176.25 |
| 497115bf | GREEN: `pet.ts`; plan R-04's "As reworked (rework2-026)" | 3.14, 0.25, 0.25 |

The fixes and what each removed are in plan R-04. The last 16 bytes a petting came from one line of `select`, found by removing `select`'s lines one at a time in a scratch copy of the bench (deleted): `pet_s = path === "clip" ? petting_s : config.pet_s`. Its two branches are a tagged field and an unboxed one, so the choice was boxed at each selection. Two stores replaced it.

The 3.14 is the measure's noise: it read 7.86 over 2,000 pettings a pass and 3.14 over 5,000, a constant of about 16 KB a pass. The first GREEN run, with no fixed warm-up, read 232 bytes a petting. The functions a petting calls once (`endPetting`, `toIdle`, the selection's checks) were still in V8's lower tiers, which box fractions. By the twentieth pass they read nothing. **What the bench shows, and no more:** no object a petting, the selection and every frame included, on the reach's path with no frame log, once V8 has optimized the code. Not measured: the page, where a petting comes at most once in `cooldown_s`, so the once-a-petting functions may stay in the lower tiers; the clip's path; the draft build's frame log; spec 025's real `twinHeading()`, which isn't on this line (T014's wiring re-runs the bench with it). The page's new question asks about it.

### Nit 5: the bench's own timeout

Each of the bench's tests has `BENCH_TIMEOUT_MS`, 300 s. On 6e962042, in one run with the other seven files: 1.79 s (whole pettings), 0.33 s (short), 1.08 s (cut), 7.43 s (`applyReachLayer`, after its 180 s `beforeAll`, the GLB's parse). The eight files took 67.82 s.

### N-1, N-4, N-3

- **N-1** (563b20a6): `PetTwin.rig`'s comment names the bones `findReachRig` reads: the spine's three; each arm's `Arm`, `ForeArm`, `Hand`, `HandMiddle1`; since Q212, the `Hips` and both legs' `UpLeg`, `Leg`, `Foot`.
- **N-4** (135d4378): `pet-reach-rig.test.ts` asserts the knees bend forward along the root's +z, and checks that the toes are ahead of the ankles along it. It runs SC-002 on the left arm, the dog's homes mirrored across the twin's, on both rigs. It covers `findReachRig`'s null cases: any of the six leg bones missing gives null on both sides, and a missing `HandMiddle1` gives null on its side only. This is coverage of built behaviour, so there is no RED: 29 passed.
- **N-3**: the "under 0.1 mm off" and the hips' falls (impl2-026's T003 GREEN, below) come from these lines, now pasted. They print the miss to 0.1 mm, four decimals of a metre, and all eight read 0.0000. The feet's 1 mm and their kept rotation are the test's assertions (`toBeLessThan(1e-3)`, the rotations' dot above 1 − 1e-5), not printed. On 135d4378:

```
$ npx vitest run test/room/pet-reach-rig.test.ts --silent=false
twin at spec 025's estimate [0.36, 0.55], the right hand: 0.0000 m from the target; hips down 0.291 m
twin at Q158's estimate [0.30, 0.45], the right hand: 0.0000 m from the target; hips down 0.262 m
twin at spec 025's estimate [0.36, 0.55] mirrored, the left hand: 0.0000 m from the target; hips down 0.291 m
twin at Q158's estimate [0.30, 0.45] mirrored, the left hand: 0.0000 m from the target; hips down 0.261 m
man at spec 025's estimate [0.36, 0.55], the right hand: 0.0000 m from the target; hips down 0.341 m
man at Q158's estimate [0.30, 0.45], the right hand: 0.0000 m from the target; hips down 0.304 m
man at spec 025's estimate [0.36, 0.55] mirrored, the left hand: 0.0000 m from the target; hips down 0.350 m
man at Q158's estimate [0.30, 0.45] mirrored, the left hand: 0.0000 m from the target; hips down 0.322 m
twin at spec 025's estimate [0.36, 0.55]: the knees 0.027 → 0.304 and 0.027 → 0.304 m ahead of the hip-to-ankle line
twin at Q158's estimate [0.30, 0.45]: the knees 0.027 → 0.292 and 0.027 → 0.292 m ahead of the hip-to-ankle line
man at spec 025's estimate [0.36, 0.55]: the knees 0.023 → 0.312 and 0.013 → 0.312 m ahead of the hip-to-ankle line
man at Q158's estimate [0.30, 0.45]: the knees 0.023 → 0.301 and 0.013 → 0.301 m ahead of the hip-to-ankle line
 Test Files  1 passed (1)
      Tests  29 passed (29)
   Duration  53.71s (transform 49%, import 38%, tests 13%)
```

The man's left side, at spec 025's mirrored estimate, crouches to the limit (0.350 m, `crouch_max_m`).

### The checker: to the Backlog (rule 11)

The real proposal fills no Golden Q&A 9: its item 9 holds `<his answer>`. So the checker's findings don't block, and its logic is unchanged. Plan R-13's and the docstring's "in any case or spelling" are narrowed to what `rec+om+end` matches, as a deviation (6e962042). The Backlog in the stack note's item 9 and in the feature's note lists the probes. Each was run on this branch against `golden_problems` and `RECOMMENDED` (a scratch script outside the repository).

### Interruptions

No hook or bash-gate refusal. The harness refused one foreground `sleep 100`, which it doesn't allow, and I waited with an until-loop instead. One of my edits silently didn't run: its `cd` failed in a chained command, the same slip impl2-026 recorded. The first RED run measured a harness with an `expect` inside the measured step, which made objects of its own. I found it before committing and re-ran.

### What waits

T005, T006, and T011 to T016 still wait for impl-025's reviewed tip (Q170), and with them T016's timing half and the wired twin. T014's wiring re-runs `pet-bench` with spec 025's real `twinHeading()`. T019 waits on his approval of the dog's model.

## impl2-026 (on `night/impl2-026/impl2-026`, from impl-026's tip 5fbedcb5)

No merge was needed: impl-026 had merged verify-021. The worktree held one untracked file, `test/room/zz-scratch-crouch.test.ts`, an earlier attempt's scratch that measured the crouch. It was run once for its numbers, then deleted, and its math went into the measure's second test.

### Q212, taken provisionally

The page's Q212 reads "Answered: recommended, the Author 2026-11-13 (the orders file's rule; yours to confirm or overturn here)". This task takes its recommended answer provisionally, not as his answer. That answer is a crouch: the hips lowered and both legs bent by the same two-bone solve, the feet kept where the clip has them, with a smaller spine lean. `figures.pet.crouch_max_m` is data, re-measured by T003 on both rigs. FR-007 (the legs move during the petting only), FR-008, SC-002, the spec's Clarifications, and plan R-03, R-04, §3, §4 are amended in 7815642b, each marked "Q212, taken provisionally". It is his to confirm or overturn on the page. If he overturns it, the crouch comes out of `applyReach`, and T003 stops RED again with the measure's first table.

### T003: the measure, the crouch (7815642b)

The measure's second test reads both rigs with the hips lowered straight down and the feet kept. It prints the lean over the spine at a crouch of 0.20 m to 0.35 m, and the share of the defaults that reaches (plan §3's second table). The crouch's limit is the thighs coming level: 0.390 m on the twin and 0.401 m on the man. The default is 0.35 m, with the knees then at 111°. At 0.35 m, the default heading needs a lean of 39.2° (the twin) and 60.9° (the man) at spec 025's estimate, and 25.4° and 37.0° at Q158's. So `lean_max_deg` is 66 (60.9° + 5°, rounded up; under the 75° cap). Every figure, home, and facing reaches at a share of at most 1. The nearest to the limits is the man at [0.36, 0.55], at 0.975. No figure is short, so no new question was needed.

```
$ npx vitest run test/room/pet-reach-measure.test.ts   # its second test's lines
the thighs come level at a crouch of 0.390 m (the smaller figure's); crouch_max_m 0.35, lean_max_deg 66
  twin, spec 025's estimate [0.36, 0.55], head +z (heading_deg 0): lean over the spine at a crouch of 0.20 m 77.8°, 0.25 m 65.3°, 0.30 m 52.5°, 0.35 m 39.2°; knees at 0.35 m 111/111°; the defaults' share 0.831
  twin, Q158's estimate [0.30, 0.45], head +z (heading_deg 0): lean over the spine at a crouch of 0.20 m 65.5°, 0.25 m 52.5°, 0.30 m 39.1°, 0.35 m 25.4°; knees at 0.35 m 111/111°; the defaults' share 0.748
  man, spec 025's estimate [0.36, 0.55], head +z (heading_deg 0): lean over the spine at a crouch of 0.20 m 107.7°, 0.25 m 94.1°, 0.30 m 78.7°, 0.35 m 60.9°; knees at 0.35 m 111/112°; the defaults' share 0.975
  man, Q158's estimate [0.30, 0.45], head +z (heading_deg 0): lean over the spine at a crouch of 0.20 m 93.6°, 0.25 m 77.6°, 0.30 m 59.2°, 0.35 m 37.0°; knees at 0.35 m 111/112°; the defaults' share 0.870
the larger lean the default heading needs at 0.35 m: 60.9°
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

(The other two facings per row are in plan §3's table.)

### T003 RED, T004 GREEN

| Commit | What | Run |
|---|---|---|
| 1834f432 | RED: `pet-reach-rig.test.ts` (both real rigs: `findReachRig` on each side and null without the bones; SC-002 at both homes; the feet kept; only the reach's bones change, the hips' position and the legs among them; the elbow's limit; a partial weight; determinism; `clearReach` and the mixer's frames), plus `solvePosture`'s six pure cases and the crouch default in `pet-reach.test.ts` | 20 failed, 19 passed |
| d459cace | The RED commit's two mixer cases corrected (below) | (still RED: no code) |
| 18947317 | GREEN: `solvePosture`, `findReachRig`, `applyReach`, `clearReach` | 39 passed |
| 32909058, f1901d29 | A type for `exactOptionalPropertyTypes` in the rig test; prettier over the four files | lint exit 0 |

On both rigs, at both homes, the hand's end (`HandMiddle1`) lands on the target at the stroke's middle, under 0.1 mm off (SC-002 asks 0.08 m). The hips fall 0.291 m and 0.262 m (the twin) and 0.341 m and 0.304 m (the man), which are the measured shares of 0.35 m. The feet stay within 1 mm, with their world rotation kept. (The test's console lines behind these figures were first pasted by rework2-026, under its N-3, above.)

**The correction (d459cace).** The RED commit was meant to compare the mixer cases against the same figure with the idle clip alone. That edit didn't run, because its `cd` failed in a chained command, so the RED commit snapshot the pose after the mixer's frame. There, a bone the idle clip has no track for still holds the reach's rotation, but the clip's own pose for such a bone is the rest pose. The test now compares against the clip-only figure. The change is to the test's reference, not its claim: every bone is the clip's own after `clearReach`. This task owns the file (T003), and it isn't a fix task.

**The type fix.** The GREEN commit went in while `tsc` reported the rig test's `clip?: AnimationClip` (`exactOptionalPropertyTypes`). The type check and the commit were on separate lines of one shell call, so the error didn't stop the commit. The next commit fixed it.

**As built** (plan R-03, §4): the posture is solved each frame against the stroke's moving target, so the body follows the stroke a little. The forearm's palm-down twist isn't built: the rig names no palm axis, so the hand keeps the clip's rotation relative to the forearm. The look is his, and the studio's clip replaces the layer. `PetConfig` gains `crouch_max_m`, from `PET_REACH_DEFAULTS`. The schema's `figures.pet` (T012) takes it there.

### Small runs (rule 4), on f1901d29

```
$ npx vitest run test/room/pet-reach-rig.test.ts test/room/pet-reach.test.ts test/room/pet-reach-measure.test.ts test/room/avatar-gait.test.ts
 Test Files  4 passed (4)
      Tests  50 passed (50)
   Start at  18:29:55
   Duration  52.53s (tests 42%, import 30%, transform 28%)

$ npx vitest run test/room/pet-director.test.ts test/room/pet-degraded.test.ts test/room/pet-notes.test.ts   # pet.ts's PetConfig changed
 Test Files  3 passed (3)
      Tests  44 passed (44)
   Start at  18:30:49
   Duration  70.37s (tests 76%, transform 12%, import 11%)

$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
788 files already formatted
# then shellcheck over the repository's scripts: no finding; make exited 0
```

### What waits

T005, T006, and T011 to T016 wait for impl-025's reviewed tip (Q170). T019 waits for his approval of the dog's model. T021 isn't this task's, and T022 is the review, by another worker (the reach's rig part is new code for it). No new question.

### Interruptions

None: no hook or bash-gate refusal, and nothing respelled. The two slips above (the failed `cd`, the commit before the type check) were this session's own, and both are corrected in commits of their own.

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
