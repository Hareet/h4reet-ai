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
