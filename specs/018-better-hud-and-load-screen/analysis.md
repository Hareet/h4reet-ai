# Analysis: spec 018 (`/speckit-analyze`, read-only over spec.md, plan.md, tasks.md)

Run by the spec-writer that wrote the artifacts, which is a limit: the implementation's review (T018) is by a worker that did not. No CRITICAL finding.

## Coverage

| Requirement | Task(s) |
|---|---|
| FR-001, FR-004 | T006, T007 |
| FR-002 | T015 |
| FR-003 | T010 |
| FR-005, FR-006, FR-009 | T008, T009 |
| FR-007, FR-008 | T011, T012 |
| FR-010 | T004, T005 |
| FR-011, FR-012, FR-013 | T001, T002, T003, T014 |
| FR-014 | T013, T014 |
| FR-015 | T016, T017 |
| FR-016, FR-017, FR-018 | T013, T014 |
| FR-019 | none by design: nothing is added |
| SC-001 | T006; SC-002 T007, T017; SC-003 T013; SC-004 T013; SC-005 the Author's |

## Findings

- **F1 (HIGH, resolved)**: the first draft of D1 named a toolbar toggle for "Conversation"; `hud.log_toggle` is the log's own header toggle (`src/talk/talk.ts`). D1 and plan §3 now say the bar's title is that toggle.
- **F2 (HIGH, open to the Author)**: spec 005's FR-020 and FR-022 and the Author's "fills the left half" pull against each other: a full panel always open would cover half the room at rest. Q2 takes the bar-at-rest form; if he wants the full panel always, FR-006 and T008 change.
- **F3 (MEDIUM)**: the twin's still has no export outside `flat.ts` (plan P6). T010 extracts it, or stops with the silhouette; Q4's recommended answer holds in the second case with a weaker portrait.
- **F4 (MEDIUM)**: the supervisor's description of the screenshots is the only source of the layout; the session has not seen them. Any difference is the Author's to name; the spec's geometry is one table (plan §2), so a change is cheap.
- **F5 (MEDIUM)**: FR-010 reads "the tier's short word" and the cost amounts; T004 must confirm that `signals/turn-cost.ts` exposes the call and visit amounts in a form a second reader can take. If it doesn't, T004 adds a read-only accessor and says so in plan.md.
- **F6 (LOW)**: `HUD_PLACEMENTS` is pinned by `test/room/stages.test.ts` and `test/ui/hud.test.ts`; T007 runs both so a new key doesn't surprise them.
- **F7 (LOW)**: the two frame and stroke paths are seeded, so a visual diff is stable; "hand-drawn" is an impression the Author judges (SC-005).
- **F8 (LOW)**: CLAUDE.md asks a new feature for a span and a dashboard panel; the spec names the deviation (presentation only).

## Constitution

Checked against I to VIII (spec's Constitution Check): no violation. No human-only path is in the file map; nothing is stated about the Author, the dog, or the dinosaur.

## Environment note

The pre-commit hook refused this session's commits ("the main working tree has no tools/gates/arrival_check.py (spec 003), so the staged files can't be checked"): the worktree has the file, the main checkout it names isn't reachable from here. The artifacts are on disk in the worktree, uncommitted. It is in `questions.md`.
