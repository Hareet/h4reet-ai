# Notes: spec-026 and its reworks (2026-11-14)

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
