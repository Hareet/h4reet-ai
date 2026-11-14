# Analysis: spec 021, the dinosaur modeled and brought in

Cross-artifact read of spec.md, plan.md, tasks.md, and the contracts, at `main` 3c0e4cd0, on 2026-11-14. Non-destructive: findings were fixed in the artifacts where they were mine to fix (marked **fixed**).

## Coverage

| Requirement | Task | Test |
|---|---|---|
| FR-001, FR-002 (files, caps, cut-out fallback) | T006 | `avatars-compose.test.ts` |
| FR-003 (RA11) | T005 | `avatars.test.ts`, `compose.test.ts` |
| FR-004 (RA9) | T004 | same |
| FR-005 (RA10, rig table) | T003 | same |
| FR-006 (no human-only file) | every task's rules; SC-006 in T010's `git diff --stat` | n/a |
| FR-007 (original, `likeness: false`) | the brief; the intake is the Author's | none in code (the existing RA3 reads only the stand-in) |
| FR-008, FR-009 (no hand; placement unchanged) | T002 | `avatar-hands.test.ts`, `avatar-scene.test.ts` |
| FR-010 (note) | T007 | `ui/avatars.test.ts` |
| FR-011 (no new event) | none new; no code adds one | covered by the absence of change |
| FR-012 (first visit, report) | T006 | report line; F3 at the asset's intake |
| FR-013, FR-014 (brief, tools) | T008 | `test_line.py` |
| FR-015 (look approval) | human-patches/021.md | n/a |
| FR-016 (small tests) | each task's **Tests** line, T010's one full run | n/a |
| FR-017, FR-018 (docs checks) | T009 | `disclosure.test.ts` |

## Findings

1. **Fixed: the rule catalogue has its own tests.** `compose.test.ts` demands a `bad/<RULE>-*/` case for every refusing rule and pins the lenient list; `checks/family.ts` is the catalogue. Plan §3 and R-08, and T003 to T005, now carry `family.ts`, three bad cases, the fixture generators, and the one existing test (the pinned list) this stack changes.
2. **Fixed: rule numbers.** RA8 already exists (spec 016's twin reach). The new rules are RA9 to RA11 throughout.
3. **Fixed: `test_line.py` has its own stand-in tools list.** Its `TOOLS` doesn't name the dinosaur's tools. T008 builds the fixture repository from the real `studio-tools.json` (plan R-06).
4. **Fixed: scale, not height.** Spec 009's FR-016 already scales the model to 1.2 m high, so RA9 measures the body's length and width after that scaling rather than the height (FR-004, plan R-03).
5. **Open, low: FR-012's first-visit number isn't computable now.** There is no asset. SC-005 holds only at the asset's intake (F3 on his branch); the code task reports the line, not the number. Not a gap in the stack.
6. **Open, low: `idle-holding` is absent.** Spec 009's FR-028 says an avatar with no walk clip slides in `idle-holding` or idle; with no `idle-holding`, the idle. T002's tests cover it; if it fails, converge adds a task.
7. **Open, medium: the dog's spec shares `avatars.ts` and `room-fixtures.ts`.** The implementer merges this branch first (plan §3); a conflict is a table row, not a rule. Say so in the stack's note.
8. **Constitution**: no clause deferred or dropped; no deviation to name; no ADR.
9. **Constraints**: the plan touches no human-only path; its `human-patches/021.md` lists what waits on the Author (the asset's intake, an approval entry if the gate wants one, an optional ADR pointer). The tools list is on `main` (P-7), so the studio round is unblocked.
10. **Paraphrase check**: the Author's item and orders are quoted word for word in the intent, spec, plan, and tasks; the readings sit beside them. No fact about the Author is stated.

## Verdict

Consistent. The two open items (5, 6) are low and have a defined resolution. Ready for the implementer, who merges this branch first and runs one line.
