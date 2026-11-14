# Notes: rework2-spec-025 (2026-11-14, Opus 5.5)

Rule 6's second rework of spec 025, after rv-rework-spec-025 (Opus, blocking). It runs on `night/rework2-spec-025/rework2-spec-025` from c73cee1d. I edited only `intent/025-*`, `specs/025-*/`, and `docs/merge-requests/human-patches/025.md`, and wrote no code. The first rework's notes are in this file's history at c73cee1d.

## Read

Each branch was read with `git --no-replace-objects`:
- the code: `fix-019` (a9ecd26c, the gait: `gait.ts`, `stepGait`, `standingLift`), `fix-020` (3953b4c1), and `rework-018` (0be0cc91);
- the siblings: `rework-spec-019`, `rework-spec-020`, `rework-spec-021`, and `rework2-spec-024` (1c6fa885 and on; its page Q117 took no event, and Q-R2c an ADR).

I checked every location the review cites:
- `walking.ts:99,187,270` (`startPose`), `walk/movement.ts:46`;
- `scene.yaml`'s two figure mounts;
- `ri.ts:405-420` and `family.ts` (RI8 isn't lenient), `schema.ts:532`, `emit.ts:1165`, `reach.ts:574`;
- `bundle.test.ts:1403` (`toEqual`) and `:1441` (`toMatchObject`), `schema.test.ts:1242`;
- `avatars.ts:243` (`OWN`), `:771` (`place`), `:840-870` (`clip`, `missed`);
- `lookdev/stage.ts:587`.

## What changed, by finding

- **BLOCKING-1 (Q139, taken as recommended, provisional under the orders file's rule 1)**:
  - FR-007, SC-001, Q2's reading, and US1 scenario 1 now have two clauses, and the new Q11 records the answer.
  - Clause (a) also covers the dinosaur's jump to `floor.start`, because leaving or entering the walking view resets the pose (`walking.ts:187`, `:270`).
  - FR-009 now bounds only the picture's facing by the turn rate, not the step. Without that, a figure facing the wrong way couldn't keep clause (a) on its first frame.
  - T001 starts the pursuer at `floor.start` and at 200 seeded starts, with seeded jumps, and checks both clauses each frame.
  - R-09 and T013 check each home against `floor.start` and `safe_m` in a test over `scene.yaml`, and say why it isn't a build rule.
  - Plan §3.1 records the numbers.
- **What recording the numbers found (the new Q12, on the page)**: the room's floor is far smaller than the spec assumed.
  - The shell is 2.13 × 1.22 m (`room-shell.yaml`), and the desk, 1.5 × 0.8 m against the back wall, leaves a strip in front of it about 0.27 m deep. Spec 008's `floor.test.ts` names "the default scene's walkable strip in front of the desk".
  - The twin's obstacle closes the dinosaur's strip at x ≈ 0.17. FR-017 keeps that obstacle, so the dinosaur never enters the twin's corner, which runs about 0.6 m beyond.
  - From the strip's middle, the dinosaur is within about 1.1 m of every point of the chase floor, so `safe_m` 1.5 could never hold, whatever the tuning.
  - The defaults are now fitted to the room: `flee_m` 1.0, `safe_m` 0.4, `separation_m` 0.3. The dog's home is an estimate in the twin's corner, `[0.36, 0.55]`.
  - T002 may tune `safe_m` down to 0.3 m. Below that, it stops and asks on the page.
  - These numbers are my hand computation. T001 prints the composed floors and T002 records them.
- **IMPORTANT-1**:
  - RI8 in `ri.ts` refuses `fleeing` as a key (FR-011, R-04, §5, T004). `schema.ts`'s clips map doesn't change.
  - `emit.ts` and `reach.ts` are listed as read, not changed: the emitted map gains `fleeing: "idle"`, and the played roles stay the same.
  - T003 adds `bundle.test.ts`'s `fleeing: "idle"` and an RI8 case to `schema.test.ts`.
- **N-1**: `schema.test.ts` and `avatars-compose.test.ts` are in T011's and T013's lists, and in T004's.
- **N-2**: FR-013, R-05, and T014 use the twin's height in metres: the measured height for its own model (never `OWN` = -1), and `figures.twin_height` for the stand-in.
- **N-3**: in R-10, `place`, `clip`, and `missed` read `wanting()`, and `both()` stays the hand-off's. FR-018 scales the dog by `instanceFor` through `target`, not in the loader.
- **N-4**: `src/lookdev/stage.ts:587` passes `dog: undefined` (§5, T011).
- **N-5**: the spec's Input reads the gait's code at `fix-019`.
- **Spec 024's alignment**: Q13 asks for an ADR if Q10's deviation is confirmed, as spec 024's Q-R2c does. The first analysis's I1 is resolved by spec 024's Q117.

`/speckit-analyze` was re-run (analysis.md). It found one CRITICAL by rule (D1, the named deviation, his on the page), and four MEDIUMs, all applied:
- I2: the twin's corner is a refuge;
- I3: FR-007 outranks the separation;
- A3: `WALL_M` replaces 2 × `safe_m`;
- C1: the dog's height is tested.

## Small runs

```
$ pytest -q evals/test_docs_links.py
44 passed in 0.88s

$ python3 -I evals/docs_links.py
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: ...
docs links: 0 failed, 2406 relative links in 384 files

$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1

$ ruff check .
All checks passed!
```

`make lint` didn't run: this worktree has no `node_modules`. I didn't run `make setup`, because a spec-writer's task doesn't need dependencies installed into files git doesn't show. Every file I changed is Markdown under `specs/`, `intent/`, or `docs/`, which no lint reads.

## Questions and refusals

`/night/io/out/questions.md` has three questions, each with its recommended answer, all taken:
- Q139 as taken (the two clauses);
- Q12 (the room's floor and what the run is in it);
- Q13 (the ADR if Q10 stands).

No refusal was hit.

## What's left

- The Author's answers on the page:
  - Q139 as taken;
  - Q12, which the run's whole look rests on: if he takes "leave it off until the room is bigger" or "out through the open front", the spec is reworked before the code starts;
  - Q13, with Q10 and Q110 to Q112 from before.
- A reviewer should look at this second rework before spec 025's code starts (rule 6).
- Implementation (T001 onward) starts after specs 019, 020, 021, and 024 are on the line. T001's first case replaces plan §3.1's hand numbers with the composed floor's.
