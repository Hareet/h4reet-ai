# Group B's notes: spec 028, the behaviour (`impl-028b`, night of 2026-11-15, implementer, Opus 5.5)

Branch `night/impl-028b/impl-028b`, from spec-028's tip `9cf2f91f`. Paths are under `apps/web/` unless they start otherwise.

## For group A: T-B01's commit

**T-B01: `eeede9c0`** (`feat(028): T-B01 the four UI words, …`). Merge it for `credits.likeness` (T-A06): `git merge eeede9c0`. It adds `figures.dino_call`, `figures.left_both`, `figures.left_twin`, and `credits.likeness` to `room/ui-words.yaml`, `src/room/ui-keys.ts`, and `test/fixtures/room/good/apps/web/room/ui-words.yaml`; its RED step is `20a1a9eb` (the four rows in `test/room/vocabulary.test.ts`'s pinned list, the count 86 → 90).

## T-B01

RED (`20a1a9eb`), with the three word files as on the base:

```
$ ../../node_modules/.bin/vitest run test/room/vocabulary.test.ts --maxWorkers=1
-   "figures.dino_call": [],
-   "figures.left_both": [],
-   "figures.left_twin": [],
 ❯ test/room/vocabulary.test.ts:99:21
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

GREEN (`eeede9c0`):

```
$ ../../node_modules/.bin/vitest run test/room/vocabulary.test.ts --maxWorkers=1
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Tests run from `apps/web/` with the root's `node_modules/.bin/vitest` (vitest 5.0.3, the lockfile's, installed by `npm ci --ignore-scripts`; `apps/web/node_modules/.bin` has none), `--maxWorkers=1` (`cpu.max` 400000/100000 = 4, ÷ 4).
