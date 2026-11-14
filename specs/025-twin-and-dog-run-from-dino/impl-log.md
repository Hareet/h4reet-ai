# Spec 025, the implementer's log (impl-025, 2026-11-14)

Each task's small tests and `make lint`, as run (the order's rule 4). The stack note's item 8 section quotes this.

## T001, T002 (chase-steer)

`vitest run test/room/chase-steer.test.ts`:

```
room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

`make lint`: eslint (0 warnings), tsc (three workspaces), prettier ("All matched files use Prettier code style!"), ruff ("All checks passed!", "786 files already formatted"), shellcheck: exit 0.

## T003 (RED)

`vitest run test/room/twin-states.test.ts test/room/chase-states.test.ts test/room/bundle.test.ts test/room/schema.test.ts`: 7 failed | 324 passed. The schema case (`fleeing` refused at `figures.twin.clips.fleeing`) passes before T004 too, as "a state outside the twin's closed list"; it holds the refusal once `fleeing` joins the list.

## T004 (GREEN)

`vitest run` T003's four files and those covering `twin-states.ts`, `ri.ts`, `emit.ts`, `reach.ts` (tasks.md's list, 14 files): `Test Files  14 passed (14)`, `Tests  476 passed (476)`. `make lint`: exit 0.

## T005 (RED)

`vitest run test/room/chase-director.test.ts`: "Cannot find module '../../src/room/scene/chase'", Test Files 1 failed (1).

## T006 (GREEN)

`vitest run test/room/chase-director.test.ts`: Tests 12 passed (12). `make lint`: exit 0.

## T007 (RED)

`vitest run test/room/chase-degraded.test.ts`: Tests 8 failed | 7 passed (15). The 2D room, below the floor, and a lost context are the shell's, tested in T014's chase-figures.test.ts (plan §4).

## T008 (GREEN)

`vitest run test/room/chase-degraded.test.ts test/room/chase-director.test.ts`: Test Files 2 passed (2), Tests 27 passed (27). `make lint`: exit 0.

## T009 (RED+GREEN)

RED: `vitest run test/room/chase-notes.test.ts`: 6 failed | 4 passed (10). GREEN: `vitest run test/room/chase-notes.test.ts test/ui/text-copy.test.ts test/room/scene.test.ts test/room/vocabulary.test.ts test/ui/notes-causes.test.ts test/ui/a11y.test.ts`: Test Files 6 passed (6), Tests 144 passed (144); with chase-director and chase-degraded: 8 files passed. `make lint`: exit 0.

## T010 (RED)

`vitest run test/room/dog-figure.test.ts test/room/likeness-line-anywhere.test.ts`: Tests 15 failed | 12 passed (27); the fixture scene's `figures.dog` isn't in the schema yet ("buildRoom: a figure of the 3D part doesn't resolve"), and the controller has no dog. The likeness-line file passes: its cases take the "dog" FigureId at run time already; T011 makes it a FigureId in the type.

## T011 (GREEN)

`vitest run` T010's two files, tasks.md's T011 list (28 files), and chase-steer (the dog's home moved to [0.30, 0.45]): Test Files 31 passed (31), Tests 869 passed (869); `room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations`. `make lint`: exit 0 (after prettier on `src/lookdev/stage.ts`).

## T012 (RED+GREEN)

RED: `vitest run test/room/dog-first-visit.test.ts`: Tests 5 failed (5) (`figuresVisit` has no `dog`; RK5 and the report don't name it). GREEN: that file and tasks.md's T012 list (9 files): Test Files 1 failed | 8 passed (9), Tests 1 failed | 515 passed (516). The one is `test/room/report.test.ts`'s "marks the counter face exempt on the phone, and the word face readable" (23.1 → 23.4 px), one of D-V2's six (Q164), carried under Q165: it fails the same with T012's code set aside (`-t "counter face exempt"`: 1 failed). `make lint`: exit 0.

## T013 (RED+GREEN)

RED: `vitest run test/room/chase-schema.test.ts`: Tests 23 failed | 4 passed (27) (no `figures.chase` in the schema, the bundle, or `scene.yaml`; the four passing are the homes and the speeds read through `CHASE_DEFAULTS`).
GREEN: `vitest run test/room/chase-schema.test.ts`: Tests 27 passed (27). Tasks.md's T013 list with chase-steer and dog-figure (11 files): Test Files 2 failed | 9 passed (11), Tests 2 failed | 557 passed (559): `avatars-compose.test.ts`'s committed figures keys (now with `chase`) and `data-only.test.ts`'s walking-speed edit to 1.5 m/s, which FR-005 now refuses ("RD3 apps/web/room/scene.yaml:figures.chase.twin_run_mps: not above walking.speed_mps + speed_margin_mps, 2 m/s (FR-005)"). Both changed on departure (plan R-09's as built; the walking speed's case at 1.4 m/s; a question on the page). Then: `vitest run test/room/avatars-compose.test.ts test/room/data-only.test.ts test/room/chase-schema.test.ts`: Test Files 3 passed (3), Tests 92 passed (92); chase-steer: `room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations`. `make lint`: exit 0.

## T014 (RED+GREEN)

RED: `vitest run test/room/chase-figures.test.ts`: "Cannot find module '../../src/room/scene/chase-figures'", Test Files 1 failed (1).
GREEN: `vitest run test/room/chase-figures.test.ts`: Tests 28 passed (28). With tasks.md's T014 list (`gait`, `gait-rig`, `stage-walk`, `walking`), T011's `avatars.ts` set (28 files), `dog-figure`, `gait-alloc`, and `avatar-gait-lift` (36 files): Test Files 36 passed (36), Tests 928 passed (928). `npx tsc --noEmit -p apps/web`: clean. `make lint`: exit 0 (after prettier on the new test file, its own task's).

## T015 (RED+GREEN)

RED: `vitest run test/room/dog-disclosure.test.ts` (a new file, on departure; plan §5): Tests 1 failed | 1 passed (2). `pytest deploy/scripts/test_dashboard.py -k rooms_dog`: 1 failed.
GREEN: `vitest run test/room/dog-disclosure.test.ts test/disclosure.test.ts`: Tests 2 failed | 11 passed (13); `pytest deploy/scripts/test_dashboard.py evals/test_disclosure.py evals/test_docs_links.py`: 1 failed, 170 passed; `python3 -I evals/docs_links.py`: "docs links: 0 failed, 2454 relative links in 409 files". The three failures are D-V2's (Q164: "gives the room's rows what the spec's entries carry …", "names the avatar files in V1 …", `test_the_rooms_rows_are_in_its_own_section_with_the_specs_words`), failing before T015 too. They pin V1's Carries whole, so FR-028's clause needs an amendment after 018's: `docs/merge-requests/proposed/025-disclosure-test-amendments.patch` (two files: the clause read from FR-028's own words, inserted after M17's twin's model and clips). On a copy (`git archive HEAD` 94332698 into a `mktemp -d` folder, 018's patch then 025's applied with `git apply`, `--check` clean, the worktree's `node_modules` linked): `vitest run test/disclosure.test.ts test/room/dog-disclosure.test.ts`: Test Files 2 passed (2), Tests 13 passed (13); `pytest evals/test_disclosure.py evals/test_docs_links.py`: 80 passed; prettier and ruff clean on both files. Never applied on the line. `make lint`: below.

## T016 (RED+GREEN; the full `make check` is not this task's, by the supervisor's order)

RED: `vitest run test/room/chase-bench.test.ts`: Tests 1 failed | 2 passed (3). The time holds already (`chase bench: 600 frames, mean ms a frame per run 0.0107, 0.0099, 0.0105; best 0.0099`); the scan finds nine allocations a frame: the shell's `pursuerPresent({ … })` argument, six `[twin, dog]` arrays in the director's `frame`, and `steer`'s two closures (`stand`, `sepOf`).
GREEN: the director's figures listed once (`all`), `steer`'s `stand` and `sepOf` at module level, the shell's FR-001 input written in place. `vitest run` the eight chase files (bench, steer, director, degraded, notes, figures, states, schema): Test Files 8 passed (8), Tests 115 passed (115); `chase bench: 600 frames, mean ms a frame per run 0.0128, 0.0672, 0.0105; best 0.0105`; `room floor: 201 starts × 600 frames, least distance kept 0.141 m, 0 violations`. `make lint`: exit 0.

## After the merge of verify-021 (81590888)

The item's thirteen test files: Test Files 13 passed (13), Tests 166 passed (166). The lint target: exit 0. `python3 -I evals/docs_links.py`: "docs links: 0 failed, 2454 relative links in 409 files". The stack note's item 8 section quotes this log.
