# Analysis: Avatar Walking Legs (spec 019), 2026-11-14

Read-only cross-check of spec.md, plan.md, tasks.md, and the intent, against the constitution and CLAUDE.md. Nothing here changes code.

## Coverage: requirement to task to small test

| Requirement | Task(s) | Small test |
|---|---|---|
| FR-001 gait on while walking | T006, T007 | `avatar-gait.test.ts` |
| FR-002 phase by distance | T002, T003 | `gait.test.ts` |
| FR-003 amplitude by speed, ease | T002, T003 | `gait.test.ts` |
| FR-004 legs apart, knee limits | T002, T003 | `gait.test.ts` |
| FR-005 legs only | T006, T007 | `avatar-gait.test.ts` |
| FR-006 no residue | T005, T006, T007 | `gait-rig.test.ts`, `avatar-gait.test.ts` |
| FR-007 walk clip wins, time scale | T006, T007 | `avatar-gait.test.ts` |
| FR-008 no leg bones: slide, signal | T004 to T007 | `gait-rig.test.ts`, `avatar-gait.test.ts` |
| FR-009 reduced motion, level 1 | T006, T007 | `avatar-gait.test.ts` |
| FR-010 pure, deterministic | T002, T003 | `gait.test.ts` |
| FR-011 size, no allocation, no asset | T012 (chunk size from the build report) | none small; by the build report |
| FR-012 no DOM, key, setting | none needed | review at T011 (nothing is added) |
| FR-013 no `assets/**` edit | the tasks' rules | the repo's hooks; review at T011 |
| FR-014 reusable pure part | T003 | `gait.test.ts` imports nothing from the controller |
| US3 lookdev | T009 (P3, droppable) | `page.test.ts`, `builds.test.ts` |
| SC-001, SC-002, SC-003 | T002, T005, T006 | as above |
| SC-004 | T012 | the build report |
| SC-005 | the Author | morning page |

## Findings

1. **Resolved: a wrong task reference.** The spec's Assumptions named T003 for the real-rig check; it is T004. Fixed in spec.md.
2. **Resolved in the plan's wording: "no three import in the math".** `gait.ts` holds the pure part and the three-using applier in one file; the pure functions use only `import type`, so FR-014 holds and the file list stays short. If the implementer finds this leaks three into the pure test, a split into `gait-math.ts` is a plan edit in the same commit.
3. **Resolved: the fixture file.** The first plan draft named `test/helpers/room-avatars.ts`; the fixture rig is in `test/helpers/glb.ts`. Plan §5 and T001 now say so, with the leg bones opt-in so no other test's skeleton changes.
4. **Open, low risk: FR-011's 2 KB bound** is measured only at T012, the stack's end. A larger result is a fix task then. The module is small, so it is expected well under.
5. **Open, low risk: the bone axis and sign** are an assumption until T004 runs on the real models; R-07 makes that the first thing the stack learns, and a mismatch changes two constants, not the design.
6. **Shared ground with other specs.** `avatars.ts` and `stage.ts` are also touched by the dog, dinosaur, twin-running, and eating items. The edits here are additive; the plan asks the implementer to merge this branch first. A conflict there is the implementer's, with plan §2.3 as the reference.
7. **T010's smoke test is thin**; the docs check inside the lint run is the real gate for a README note. Acceptable.

## Constitution and policy check

- Principle I: degraded modes defined in the spec before the plan (table; FR-008, FR-009). Principle II: RED then GREEN per task; determinism by FR-010. Principle IV: no spend. Privacy and disclosure: no new byte. No clause is deferred or dropped, so no deviation is named.
- CLAUDE.md's "new feature" list: telemetry (one frame-log signal, stated), dashboard panel (none, stated), cost (none), degraded mode (done), data-flow row (none). No provider call anywhere.
- Human-only paths: none changes (docs/merge-requests/human-patches/019.md).
- The Author's words are quoted, not paraphrased; reading "leg animations" as legs only is the spec-writer's, marked as Q4 and on the morning page.

## Verdict

Ready to implement: no blocking finding. What's left: implementation T001 to T012, the Author's look approval, and his answers to Q1 to Q5.
