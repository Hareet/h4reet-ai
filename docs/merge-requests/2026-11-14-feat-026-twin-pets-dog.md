# Merge request: spec 026, the twin pets the dog (`night/impl-026/impl-026`, then `night/impl2-026/impl2-026`), the first part and the rig's reach

Spec: specs/026-twin-pets-dog/ · Written by: implementer (night shift), impl-026, then impl2-026, both on Opus 5.5 · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/impl-026, then /home/h4reet/h4reet-ai/night/2026-11-13/impl2-026 · Repo hooks active: the commit hooks ran (gitleaks, arrival check) on every commit
Authorized by: the Author's order of 2026-11-13 ("Approved provisionally", at the top of plan.md and tasks.md), the spec, and the plan as reworked three times (rework3-spec-026, 9bba8f36). Every question on the page about spec 026 (Q120 to Q128, Q140 to Q145, Q153, Q154, Q158 to Q162) reads "Answered: recommended" under the orders file's rule, and each is taken provisionally. Base: rework3-spec-026's tip, with `night/verify2-020/verify2-020` (3767859f) merged first and `night/verify-021/verify-021` (b3d043a2) last, the line's verified tip with items 1 to 4.

The stack's note has the summary (`2026-11-14-night-stack.md`, item 9). This note holds each task's small runs (the order's rule 4) and what waits.

## What's built, test-first

| Task | What | RED, then GREEN |
|---|---|---|
| T001, T002 | `src/room/scene/pet-reach.ts`'s pure math: `solveLean`, `solveTwoBone`, `strokeTarget`, `weightAt`, `strokeShare` (R-03; FR-007, FR-008). No three.js import. | 5ad2fa5d (import fails), then 18 passed |
| T003 | impl-026 **stopped RED at the measure** (Q162). `test/room/pet-reach-measure.test.ts` reads `twin.glb` and `man.glb` and prints plan §3's table. At the default home and heading, FR-007's spine lean leaves the hand 0.15 m to 0.30 m short at 75°, and SC-002 asks 0.08 m. **impl2-026**: the page's Q212 (a crouch) taken provisionally. The measure's second test sets `crouch_max_m` 0.35 (within the thighs' level, 0.390 m) and `lean_max_deg` 66 (the man's 60.9° plus 5°), and every figure and home reaches (7815642b). Then `pet-reach-rig.test.ts` on both real rigs, and `solvePosture`'s pure cases. | 1834f432: 20 failed, 19 passed |
| T004 | impl2-026: the rig part of `pet-reach.ts`: `solvePosture` (the crouch and the lean bent together by one share), `findReachRig`, `applyReach` (the hips lowered, the legs bent with the feet kept, the spine leaned, the arm's two bones), `clearReach`, with base and applied tracking (R-04). (rework-026: "preallocated" was unmeasured here; measured, it allocated, I-1: see rework-026's section.) The hand lands on the target on both rigs at both homes. | 18947317: 39 passed |
| T007, T008 | `src/room/scene/pet.ts`, the director: `inReach`, `petAim`, the turn by `faceTwin`, the clip and reach paths, the run's cut, SC-001 over 25 seeded runs (R-01, R-07, R-08) | import fails, then 15 passed |
| T009 | Its degraded modes: the null figures, the capsule, a rig without the bones, reduced motion, the pause, quality level 1 or more, 2D/the floor/a lost context; a cut at once mid-way; no request (FR-001, FR-011, FR-025, SC-003) | 12 failed, 8 passed, then 35 passed |
| T010 | The line `figures.pet_note` ("The twin pets the dog."), the frame log's `twin-pet` kind, the director's `note` and `log`; no usage event (FR-024, FR-026, Q142) | 6 failed, 3 passed, then 44 passed |
| T017 | `scripts/corpus/dog_intro_proposal.py` and its test (R-13; FR-023) | 17 failed, 1 passed, then 18 passed |
| T018 | `corpus/proposals/dog-intro-2026-11-14.md` (FR-017 to FR-022) | the checker: OK, "buildable: no" |
| T020 | `docs/studio/twin-petting.md`; the data-flow check (row V1 covers it, so nothing was added); this note | docs checks below |

Departures, each in plan.md in its task's commit: the director's shape as built (plan §4: `motion`, `petting_s`, `finished`, `reach`, `PetActivity`); the checker's CLI and its two readings (R-13); line 4's "figure" for "in 3D" (§3); T003's numbers (§3); Q212's crouch, taken provisionally (FR-007, FR-008, SC-002, R-03, R-04, §3, §4 in 7815642b; the as-built posture and the palm-down twist not built in R-03). The closed list's pins moved with T010, the pin only: `vocabulary.test.ts` (77 to 78 keys) and the known-good fixture's `ui-words.yaml`.

## What waits

- **His answer to Q212** (the crouch, taken provisionally): if he overturns it, the crouch comes out of `applyReach`, and T003 stops RED again with the measure's first table.
- **T005, T006** (the `petting` state and the closed lists): spec 025's code, which changes the same lines for `fleeing` (specs/026-twin-pets-dog/notes.md). A later task does them from impl-025's reviewed tip (Q170).
- **T011 to T016** (`faceTwin` in spec 025's `chase.ts`, the adapters, the data and schema, the pick and RG6, the selectable, the wiring, lookdev, the bench): spec 025's code (Q170).
- **T019** (the corpus patch): his approval of the dog's model, with its `disclosure_line`, on the line (spec 020; FR-019). Waiting on his approval of the dog's model.
- **T021**: not this task's (the stack's one full `make check`). **T022**: the review, by another worker.
- **His** (T023; `human-patches/026.md`): the page's answers; the one ADR for the "no usage event" deviation (Q161), the docs role's draft and his merge on `main`; his look; the studio round; the slot and Golden Q&A 9 in his own words; the patch applied back to back with spec 022's (Q141); his evaluations and `config/twin-readiness.yaml`; the merge.

## Small runs (rule 4), on the tip with verify-021 merged

```
$ npx vitest run test/room/pet-reach.test.ts test/room/pet-director.test.ts test/room/pet-degraded.test.ts test/room/pet-notes.test.ts test/room/vocabulary.test.ts test/room/words.test.ts test/room/live.test.ts test/lookdev/builds.test.ts test/room/pet-reach-measure.test.ts
 Test Files  9 passed (9)
      Tests  235 passed (235)
   Start at  17:51:54
   Duration  115.39s (tests 95%, import 4%, transform 1%)

$ python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py
..................                                                       [100%]
18 passed in 1.13s

$ python3 -I scripts/corpus/dog_intro_proposal.py proposal corpus/proposals/dog-intro-2026-11-14.md
OK: proposal dog-intro-2026-11-14.md
buildable: no (FR-019: waiting on his approval of the dog's model, with a disclosure line)

$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py
61 passed in 0.93s

$ python3 -I evals/docs_links.py
docs links: 0 failed, 2458 relative links in 410 files

$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
787 files already formatted
# then shellcheck over the repository's scripts: no finding; make exited 0
```

T003's measure is in specs/026-twin-pets-dog/notes.md, in full. The docs runs were after this note and the stack's item 9 were written, and the lint ran on the merged tip. D-V2's six (Q165) weren't hit: none of these files is among them. The full `make check` is T021's, not this task's.

## Small runs (rule 4), impl2-026, on f1901d29

```
$ npx vitest run test/room/pet-reach-rig.test.ts test/room/pet-reach.test.ts test/room/pet-reach-measure.test.ts test/room/avatar-gait.test.ts
 Test Files  4 passed (4)
      Tests  50 passed (50)
   Start at  18:29:55
   Duration  52.53s (tests 42%, import 30%, transform 28%)

$ npx vitest run test/room/pet-director.test.ts test/room/pet-degraded.test.ts test/room/pet-notes.test.ts   # pet.ts's PetConfig gained crouch_max_m
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

$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py   # after these notes
61 passed in 1.00s

$ python3 -I evals/docs_links.py
docs links: 0 failed, 2458 relative links in 410 files
```

The measure's table and the two corrections (the RED commit's mixer cases, d459cace; a type, 32909058) are in specs/026-twin-pets-dog/notes.md, "impl2-026". No refusal was hit.

## rework-026: rv-impl-026's findings (`night/rework-026/rework-026`, from 13eaf76f, Opus 5.5)

Session: /home/h4reet/h4reet-ai/night/2026-11-13/rework-026 · Repo hooks active: the commit hooks ran (gitleaks, arrival check) on every commit. rv-impl-026 was blocking (Opus), with one finding, B-1. Its review file wasn't mounted in this container, so the findings were read from the page's summary of them (Stacks, rv-impl-026's row; the page's Q243). Each RED commit came before its GREEN, and each fix's plan.md change is in its commit.

| Finding | What changed | RED, then GREEN |
|---|---|---|
| **B-1** (FR-023, Q143; blocking) | `scripts/corpus/dog_intro_proposal.py`. A quoted span exempts its digits only when it is the dog's approval's `disclosure_line` whole, or lies inside his consent's own sentence (main's `specs/017-the-night-shift/spec.md`, line 48). An "Answered:" line holding "recommend" in any case or spelling never fills Golden Q&A 9. This includes "Answered: as recommended", "Recommended", "recomended", "the recommendation", and a lower-case or bold label. An empty or wordless Golden Q&A 9 answer is refused. Any other numbered item the patch adds to `04` is refused. Proposal mode looks up the same two sources the same way. Plan R-13's "As built (rework-026, B-1)" records it. | 2384c828: 8 failed, 20 passed; 3f7e6187: 28 passed |
| **I-2**, answered by Q226 (taken provisionally) | On a run's cut, the hips and the six leg bones are the clip's from the cut's first frame. Only the arm and the spine ease out over 0.2 s. `pet.ts`'s `reach` gained `legs`, and `applyReach` gained `legs`. FR-011, User Story 2 scenario 4, plan R-04 and §5, and T014 are amended, each marked Q226. | 01b4e1c8: 3 failed, 29 passed; 5fa97c2d: 86 passed |
| **I-1** (FR-027) | `pet.frame` and the reach no longer allocate per frame, and this is measured. Removing the lines the review named didn't move the measure: V8 was boxing fractions. Points and every number written per frame now live in class instances. The new `applyReachLayer(rig, layer, cfg)` reads the weight from the director's `reach`. Plan R-04's "As built (I-1)" has the details. T016's text covers both `pet.frame` and `applyReachLayer`, and the wired twin once T014 is built. T004's "preallocated" is corrected. b8c63998 makes the bench wait for TurboFan before it measures, because under load one run read 14 bytes a frame. | 6dac6f3b: 2 failed (48 and 1,901 bytes a frame); ac17ffa4: 0.27 and 0.44 bytes a frame |
| **N-1 to N-5**, `pet-degraded.test.ts:127` | N-1: Q212's leftovers in the spec. N-2: the studio brief's stand-in line. N-3: claims in the notes without pasted output, which this section and the stack's item 9 now carry. N-4: the checker's untested refusals (`evals/agent-config`, `redteam/forbidden-actions.sh`, `assets`). N-5: T011a and T011b. Line 127: the fetch stub comes off in a `finally`. They were read from the page's summary, so the page asks rv-rework-026 to check them against the review's words (Q243). | 90b96aaf: 28 passed; `pet-degraded` 20 passed |

**For his hand, a CLAUDE.md line** (rv-impl-026's feedback, in its words, from the page; a proposal only, and never written to CLAUDE.md by a worker), under "Things Claude gets wrong":

> Writing a checker rule against a page or file's wording that matches only one spelling ("Answered: recommended"): match case-insensitively and test the variants, as for bash-gate rules.

**Questions this rework put on the page**: Q243 (the review file wasn't mounted), Q244 (should Golden Q&A 9's answer equal one whole quotation of his?), Q245 (refusing "recommend" even in his own words), Q246 (FR-027's bar measured as the heap's growth). Each has its recommended answer there.

**Still waiting, unchanged**: T005, T006, and T011 to T016 wait for impl-025's reviewed tip (Q170). T016's timing half and its wired-twin half are included. T019 waits on his approval of the dog's model. This branch merges nothing.

### Small runs (rule 4), rework-026, on b8c63998

```
$ python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py
............................                                             [100%]
28 passed in 4.11s

$ python3 -I scripts/corpus/dog_intro_proposal.py proposal corpus/proposals/dog-intro-2026-11-14.md
OK: proposal dog-intro-2026-11-14.md
buildable: no (FR-019: waiting on his approval of the dog's model, with a disclosure line)

$ npx vitest run test/room/pet-bench.test.ts test/room/pet-degraded.test.ts test/room/pet-director.test.ts test/room/pet-notes.test.ts test/room/pet-reach-measure.test.ts test/room/pet-reach-rig.test.ts test/room/pet-reach.test.ts test/room/avatar-gait.test.ts
pet.frame: 0.26 bytes a frame
applyReachLayer at weight 1: 0.56 bytes a frame; legs off 0.42
applyReachLayer at weight 0.37: 0.42 bytes a frame; legs off 0.42
 Test Files  8 passed (8)
      Tests  99 passed (99)
   Start at  19:54:51
   Duration  63.37s (tests 80%, import 16%, transform 4%)

$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
788 files already formatted
# then shellcheck over the repository's scripts: no finding; make exited 0
```

The vitest files are every `pet-*` test this rework added or changed: `pet-bench` (new), `pet-degraded`, `pet-director`, and `pet-reach-rig`. They also include those covering `pet.ts` and `pet-reach.ts` (`pet-notes`, `pet-reach`, `pet-reach-measure`) and `avatar-gait`, whose rig the reach shares. No other test imports either file. The heap figures are under one heap number (12 bytes), and the test's bar is 8 bytes a frame. No hook or bash-gate refusal was hit.

## Cost and data-flow impact

$0 and no model call at run time. The petting adds no request, no event, and no byte leaving the device (FR-025; `pet-degraded.test.ts`'s fetch spy). The studio's `petting.glb`, once his approval bundles it, is one more twin clip that row V1 already covers, and RK5 counts it. This session's own cost is the night's, on the subscription.
