# Notes: rework-spec-025 (2026-11-14, Opus 5.5)

Rule 6's rework of spec 025 after rv-spec-025 (blocking), on `night/rework-spec-025/rework-spec-025` from faea8352. Edited only `intent/025-*`, `specs/025-*/`, and `docs/merge-requests/human-patches/025.md`; no code.

## Read

Each sibling at its latest branch, with `git --no-replace-objects`: `rework-spec-019` (605fb3ff), `rework-spec-020` (7a002a6a), `rework-spec-021` (abb2043a), `rework-spec-024` (8c50418c, which doesn't differ from `spec-024` yet). The line's code: `fix-020` (3953b4c1) and `rework-018` (0be0cc91). There is no `impl-021` branch, so spec 021's code isn't on the line.

## What changed, by finding

- **B1 (the page's Q110)**: the dinosaur is the visitor's figure. A021 and `DinoPresence` are gone. FR-001 starts the run while the visitor is the dinosaur, with its model shown, in the walking view. FR-005 and FR-007 use `walking.speed_mps`: the build refuses a run speed that isn't above it plus `speed_margin_mps`, and "never caught" is a property test on the room's own floor with an adversarial pursuer, with no footprint assumption. Q1 and Q4 are rewritten. R-06 reads the visitor's pose. A new section, §Interplay with Spec 024, covers the overlap.
- **B2 (the page's Q79)**: FR-018 to FR-022 cover the room's dog:
  - the `figures.dog` block in `scene.yaml`, with a home and a footprint;
  - `FigureId` gains `"dog"`, and `wants.dog` follows;
  - the dog's picture signals carry the bundle's `line` to `likeness-line.ts` through `app.ts`, tested in `likeness-line-anywhere.test.ts`;
  - `run` comes from `CLIP_ROLES` via `clipOf`;
  - the loader fetches the dog's four files in every 3D visit;
  - RK5 counts them against phase 3's 25,000,000;
  - row VIII and row V1 are updated.

  Every file is in plan §5 and the tasks (T010 to T012).
- **B3 (the page's Q111)**: FR-013 and FR-014 put the twin on spec 019's gait (`scene/gait.ts`) over its idle; where the gait can't apply, the twin holds. `TWIN_CLIP_ROLES` is unchanged (R-04, T004). FR-009's sentence that blocked the twin is gone.
- **I1**: only his letter and title are quoted as his words, in the intent, spec, plan, and tasks.
- **I2**: Q10 recommends no usage event, named as a deviation from Principle II and Workflow 7. The reason: an event would carry the visitor's avatar, which row V4 says it never does. The event route is kept as option B. This also touches spec 024's Q108, so it goes on the page.
- **I3 (the page's Q112)**: a missing `run` plays `walk` at 1x (Q8, FR-010).
- **I4**: plan §5 names every file. §7 drops the conditional patch case, and so does the human-patches note.
- **N1 to N5**: item i is spec 024; the intent's author line now names the night's spec-writer; T004's and T009's covering tests are listed; under reduced motion nothing is said; Key Entities lists `speed_margin_mps` and `TWIN_CLIP_ROLES`.

Q110 to Q112's answers are taken under the orders file's rule 1, provisional and his to overturn. Q9 and Q10 are new on the page, with recommended answers taken the same way. `/speckit-analyze` was re-run (analysis.md): one CRITICAL by rule (D1, the named deviation, his call on the page), one cross-spec HIGH (I1, spec 024's event), and three MEDIUMs, which were applied (U1 to U3).

## Small runs

```
$ pytest -q evals/test_docs_links.py
44 passed in 0.99s

$ python3 -I evals/docs_links.py
PASS  every relative link resolves: 2406 links in 383 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: ...
docs links: 0 failed, 2406 relative links in 383 files

$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

`make lint` didn't run because this worktree has no `node_modules`. I didn't run `make setup`: that would install dependencies into files git doesn't show, which a spec-writer's task doesn't need. Every file this rework changed is under `specs/`, `intent/`, or `docs/`. `.prettierignore` excludes all three, and ESLint, tsc, and shellcheck don't read Markdown. The one linter that could run, `ruff check .`, passed ("All checks passed!"). So the lint has no result for this task, and no lint covers these files.

## Refusals

None hit.

## What's left

- The Author's answers on the morning page: Q110 to Q112 as taken, and the new questions (Q9, the room's dog beside a visitor who chose the dog; Q10, no usage event and the deviation; spec 024's event, which needs the same answer).
- A reviewer should look at this rework before the line's code for spec 025 starts (rule 6).
- Implementation (T001 onward) starts after specs 019, 020, 021, and 024 are on the line.
