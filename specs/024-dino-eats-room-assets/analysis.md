# Analysis: spec 024 (spec.md, plan.md, tasks.md)

`/speckit-analyze` on the three artifacts. First run 2026-11-13 by the spec-writer; re-run 2026-11-14 after the first rework (rv-spec-024's B-1 to B-3); **re-run again 2026-11-14 after the second rework** (rv-rework-spec-024's RB-1 to RB-3, page Q117, NB-1 to NB-5), on Opus. The analysis itself is read-only; the fixes it led to were made to the artifacts in the same step and are listed in each row. The implementer and the reviewer read it before starting.

## Findings, second re-run (2026-11-14)

| ID | Category | Severity | Location(s) | Finding | Resolution |
|---|---|---|---|---|---|
| S-1 | Constitution | HIGH | spec A5; plan §4 | Q117 drops the event, so Principle II's "telemetry that makes it observable in production" and Development Workflow 7's "A feature without a graph is not done" go unmet. A5 names them, as spec 025's rework does; but the constitution's governance also says "Deviations require a written justification in the spec and an ADR if permanent", which neither spec had said. | A5 and plan §4 now cite that sentence: the deviation is provisional until he answers Q117; if confirmed, a docs-role ADR is on main before the merge. New page question Q-R2c; T015 and the human-patches note carry it. Not CRITICAL: the deviation is named and justified in the spec, as the governance asks, and the ADR is scheduled before the merge. |
| S-2 | Underspecification | MEDIUM | spec FR-004 (d); plan §5.2 | The plan handled a path glow (its points and `spread`); FR-004 (d) named only `at` and `radius`. | FR-004 (d) names the path glow's case (none of the four pieces has one). |
| S-3 | Inconsistency | MEDIUM | spec SC-004; FR-012; US3 AS2 | With the Eat box reserved from the start of a 3D dinosaur visit (so the framing doesn't move when the tile shows), a dinosaur visit whose model failed still has the box reserved and an empty spot; SC-004's "byte-identical" can't hold for that degraded state. | SC-004 states the exception, "A 3D dinosaur visit's framing differs only by the Eat box's reserve (FR-012), the dinosaur's model present or not"; plan §5.6 says the box stays reserved with no tile. |
| S-4 | Coverage | LOW | tasks T016 | T016 is dropped (Q117), and its ID is kept checked as dropped so the reviews' references hold. FR-014 is now a negative, covered by T005 (the ledger has no sink) and T013 (the spy sees nothing; `EVENT_KINDS` and the generated file unchanged). | None needed. |
| S-5 | Ambiguity | LOW | spec Q119, Q-R2b; FR-004 (d) | "under a glow card's point within its radius" is the reviewer's phrase; this rework reads it (Q-R2b) as the radius ball for a glow off a face and the face for a glow on one, on the measurement that a ball at the screen glow's 0.18 m takes 20,419 of the laptop's 31,016 triangles. | On the page as Q-R2b, with the others; plan §8 says (d) is one function if he reads it otherwise. |
| S-6 | Inconsistency | LOW | spec A1; plan §3 | The first rework's A1 listed spec 021's clips as `idle` and `walk`; spec 021's rework adds `take` (its Q3, FR-001). | A1 and plan §3 list all three; none is added here (FR-013). |
| S-7 | Underspecification | INFO | plan §5.5; T011 | The Eat box's place where neither the band nor the clear area holds it beside or above the walking control is not specified. | Plan §8: T011's geometry test fails, not the room, and the implementer takes the case to the page. |

The first re-run's findings, as this rework leaves them: R-1 (FR-001's "a chunk FR-005 lets it eat") stands. R-2 (FR-004 (b)'s 0.5 mm) stands. R-3 (spec 002's `contracts/room-events.md` in FR-014) is moot: no event, so no contract changes (Q117). R-4 (the desk's mesh count near the 100 ceiling) stands; (d) adds at most one set-aside mesh to the laptop (68 measured), none to the desk. R-5 (the `Jaw` lookup's suffix match) stands. R-6 (T016's place) is moot: T016 is dropped.

The first run's findings: A-1 (key **B**, not E) stands. A-2 (no build check for edible chunks) stands; T004 asserts an edible chunk on each of the four real files. A-3 is superseded by R-1. A-4 (the button's file) is resolved by B-2, and its box by RB-2 (plan §5.5: `compose/hud.ts`, `compose/stages.ts`, `compose/frame.ts`). **A-5 (the laptop), corrected by RB-1 (3)**: the laptop's placement binds no face (spec 004's FR-031: "THE LAPTOP'S SCREEN, the second monitor, SHALL be a live face that stays a plain glow unless approved room text is bound to it"), and the loader hides its `screen` mesh, so no quad is drawn there. What the laptop shows of its state is its glows: the screen's glow, which stands on the `screen` and the lid behind it (FR-004 (a), (b)), and the charge light, which stands on its `charge-light` mesh and the base round it (FR-004 (d)) and glows while the plug is in; the `port` under the plugged charger is set aside by (c). A-6 (spec 021's names) is resolved by I-5.

## The reviews' findings, where each went

| Review | Where |
|---|---|
| B-1 (Q107) | spec Q2, Q4, Q107, FR-003 to FR-005, US2 AS2 and AS4; plan §5.2, §5.4, §8; T004, T009 |
| B-2 (Q109) | spec Q1, Q109, FR-012; plan §1, §5.5; T000, T011 |
| B-3 (Q108) | overturned by Q117 (below) |
| I-4, I-5, I-6, N-1 to N-5 | as the first re-run had them: FR-003, FR-006, FR-015, A1, plan §3, §5.4, §7, the intent; unchanged by this rework except as named below |
| RB-1 (1) visibility | spec FR-004, FR-007, SC-002, SC-003, Key Entities, Edge Cases; plan §2, §5.4, §5.6; T000, T008, T009 |
| RB-1 (2) glows, Q119 | spec Q4, Q119, Q-R2b, FR-004 (d), SC-002, US2 AS2 and AS4, Revision; plan §5.1, §5.2, §5.4, §8; T004, T009 |
| RB-1 (3) the laptop binds no face | spec summary, US2 (heading, test, AS2), Edge Cases; this file's A-5 |
| RB-2 the Eat box | spec Q-R2a, FR-012, SC-004, Key Entities, US3 AS1; plan §5.5, §5.6, §6, §7, §8; T000, T011 |
| RB-3 his words | spec Source; intent Problem; plan's header ("His item, as his orders file lists it") |
| Q117 (over Q108) | spec Q3, Q108, Q117, Q-R2c, summary, US1 AS5, US3, FR-014, FR-016, Key Entities, SC-006, Cost, Degraded Mode, A5, A6; plan §1, §2, §4, §5.3, §5.5, §5.7, §6; T005, T013, T016 (dropped), T015; intent's data-flow note; human patch 024 |
| NB-1 `attempt` | spec FR-012; plan §5.5, §6; T011 |
| NB-2 "grown 10 mm in every direction" | spec FR-004 (c); plan §5.2 (`MOUNT_MARGIN`); T004 |
| NB-3 `node_modules` | this file's notes and Interruptions |
| NB-4 spec 021's contract line 7 | spec A1; plan §3, §6; T007, T015 |
| NB-5 the mesh counts | spec FR-015; plan §5.4; T008 |

## Coverage: requirement → task

| Requirement | Tasks | Notes |
|---|---|---|
| FR-001 | T006, T010, T011 | |
| FR-002 | T001, T002 | |
| FR-003 | T004, T008 | |
| FR-004 | T004, T008, T009 | (a) to (d) and visibility |
| FR-005 | T005, T009 | |
| FR-006 | T008 | the look is the Author's (A4) |
| FR-007 | T005, T008 | the recorded visibility |
| FR-008 | T008 | |
| FR-009 | T006, T013 | |
| FR-010 | T003, T005, T012 | |
| FR-011 | T001, T005 | |
| FR-012 | T010, T011 | the box and the tile |
| FR-013 | none | by design (no clip role; plan §5.7) |
| FR-014 | T005, T013 | a negative |
| FR-015 | T004, T008, T014 | |
| FR-016 | T005, T013 | |
| FR-017 | none | a negative: the twin isn't told; plan §6 touches no twin pack and no `services/**` |

SC-001 → T004; SC-002 → T009; SC-003 → T005, T008; SC-004 → T011, T013; SC-005 → T004, T008, T014; SC-006 → T013; SC-007 → T015 (by hand).

**Metrics**: 17 FRs, 15 covered by a task and 2 left out on purpose (88%; 100% of those that need work); 7 SCs, all covered; 17 task IDs (T000 to T016), 16 live and T016 dropped; ambiguities 1 (S-5, on the page); duplications 0; critical issues 0.

## Checks

- **Constitution**: I (nothing leaves for the eating), III, IV, V, VIII met as plan §4 says; VI by the note (T015); II and Development Workflow 7 named deviations (spec A5), with the governance's ADR scheduled (S-1, Q-R2c). The agent that implements doesn't review (the night's rule 6 and the reviewer task).
- **Rule 4**: each task names its small tests, including the tests that import the files it changes (plan §7: `protect.test.ts` runs because `protect.ts` imports `walkControlBox`); no task runs `make check`; T014 runs three test files and the lint. The flaky `twin-2d.test.ts` is in no list.
- **Human-only paths**: none is written; the plan's "not touched" list holds; `docs/merge-requests/human-patches/024.md` says so.
- **Test files named exist** on the line (`night/rework-018/rework-018`, checked 2026-11-14): `test/room/{scene,walking,input,reach,pick,words,vocabulary,schema,compose,bundle,data-only,standins,generated,events,objects,motion,highlight,gltf-images,flat,chunk,budgets,avatars,manifest-readiness,hud,protect,stages,stages-checks,stages-floor,frame,flat-frame,hud-split-geometry,hud-frame}.test.ts`, `test/ui/{hud,hud-a11y,hud-notes,hud-split,hud-split-a11y,hud-split-contrast,hud-split-fallback,hud-split-model,flat-frame,walking,fullscreen,notes-causes,degraded,a11y}.test.ts`, `test/{events,disclosure}.test.ts`; the `eat-*` ones are new, written first.
- **The line's code the plan names**, read on 2026-11-14: `scene/loader.ts`'s `prepareModel` (`if (roles.has(node.name)) node.visible = false`), `scene/faces3d.ts` ("the laptop's screen, which the scene binds to nothing, has no quad at all (FR-031)"), `scene/glows.ts` (a `CircleGeometry` card at the glow's `at`, under the placement's node), `catalog/laptop.yaml`'s `glows`, `compose/hud.ts`'s `WALK_CONTROL`, `walkControlBox`, `compactBoxes`, `splitBoxes`, `compose/stages.ts`'s `stageFor`, `compose/frame.ts`'s `frameArea`, `compose/protect.ts`'s `listOnly` reserve, `hud/split.ts`'s `attempt` and `labelled` (`attempt` is module-private today, so plan §5.5 exports it), `hud/keycap.ts`'s `keycap`.
- **Overlap** with other stacks (plan §5.5): additive. The real collision risks are `walk/input.ts` (a new key), `compose/hud.ts` (an option off by default, a field), `layout.ts` and `room.css` (a new tile after the walking control), and `hud/split.ts` (one export).

## Notes, second rework (rework2-spec-024, 2026-11-14)

Small runs, this task (documents only):

```
$ pytest -q evals/test_docs_links.py
............................................                             [100%]
44 passed in 0.97s

$ python3 -I evals/docs_links.py
PASS  every relative link resolves: 2406 links in 383 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2406 relative links in 383 files

$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint didn't run: this worktree has no `node_modules` (neither at the root nor in `apps/web`), and a spec-writer doesn't run `make setup`. Nothing this task changed is code; the lint's Markdown-relevant checks are the docs-links runs above, which pass. (The links runs were taken before the analysis's last edits to the spec, plan, and tasks and this file; they are re-run before the last commit, below.)

The laptop's measurements (its meshes, the `charge-light` quad's place, the 15 triangles within 6 mm of the charge light, the 20,419 within the screen glow's 0.18 m, the screen glow's 2.4 mm in front of the `screen`) and the four pieces' mesh and primitive counts came from a throwaway Python script over the GLBs as `night/fix-020/fix-020` has them, kept outside the repository (`/tmp`) and run with `python3 -I`; T004, T008, and T009 measure the same on the real files in the implementation.

## Interruptions

- `make lint` refused to run: "node_modules is missing: run make setup" (NB-3). No hook or bash-gate refusal was hit in this task.
- The project's post-edit hook flagged lint style (import order, `open` without a context manager) in the throwaway measuring script under `/tmp`, outside the repository; it is not part of any commit.
- The bash gate refused the cleanup of that scratch folder: "Blocked by .claude/hooks/bash-gate.sh — recursive delete outside workspace. Route: delete only inside the repo". It was a real refusal, not a false match; the folder (`/tmp/rw2-024`, the script and copies of the four GLBs from the line) is left in place, outside the repository, and nothing was respelled to get round the refusal.

**What's left**: the Author's answers to Q1 to Q6, Q107 to Q109, Q117, Q119, and Q-R2a to Q-R2c (all taken provisionally; Q-R2a to Q-R2c are in `/night/io/out/questions.md`); a reviewer's re-read of this second rework (rule 6: a worker that didn't write it); if Q117 stands, the docs role's ADR for its deviation (Q-R2c); then T000 rebases this branch onto the line's tip once spec 021's code is on it, and impl-024 starts.
