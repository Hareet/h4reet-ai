# Analysis: spec 024 (spec.md, plan.md, tasks.md)

`/speckit-analyze`, non-destructive on the three artifacts (fixes below were made to them in the same step). First run 2026-11-13 by the spec-writer; **re-run 2026-11-14** after the rework of rv-spec-024's findings (B-1 to B-3, I-4 to I-6, N-1 to N-5), on Opus. The implementer and the reviewer read it before starting.

## Findings, re-run of 2026-11-14

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| R-1 | MEDIUM | FR-001 offered the eating while "one of its chunks stands", but FR-005 keeps the last chunk of a piece with an empty set-aside part, so the tile would show over a bite that does nothing. | FR-001 and T006 say "a chunk FR-005 lets it eat". |
| R-2 | LOW | FR-004 (b) said "wholly behind that plane"; plan §5.2 allows +0.5 mm, which the measured faces need (a holder can share the face's plane). | FR-004 (b) names the 0.5 mm. |
| R-3 | LOW | Plan §6 and T016 change spec 002's `contracts/room-events.md` §1; FR-014 didn't name it. | FR-014 names it. |
| R-4 | INFO | FR-015's 100-mesh ceiling for one piece is close to the desk's measured 95 to 97 (a throwaway split, plan §5.4); the implementation's own seeding can land either side. | Kept: the ceiling binds the phone's cost; plan §8 names the way out (drop the cut-face meshes first, a look change for the Author). T008 and T014 measure it on the real files. |
| R-5 | INFO | The mouth's lookup (plan §3) takes a node ending in `Jaw` after a prefix, so a bone named, say, `LowerJaw` would match too. Spec 021's rig has `Jaw` only. | Kept; T007 pins the first in traversal order. |
| R-6 | INFO | T016 is numbered after T015 but sits in Phase 4; its dependencies say where it runs (after T005 and T010, before T013). | None needed: IDs are stable for the review's references (T004, T008, T009, T011, T014). |

The first run's findings, as the rework leaves them: A-1 (key **B**, not E) stands. A-2 (no build check for edible chunks) stands; T004 now asserts an edible chunk on each of the four real files. A-3 is superseded by R-1. A-4 (the button's file) is resolved by B-2: `layout.ts`'s tile beside the walking control (plan §5.5), with T000 confirming it on the line. A-5 (the laptop) is now FR-004's rule: the `screen` and the lid behind it, and the `port` under the plugged charger, are set aside. A-6 (spec 021's names) is resolved by I-5: plan §3 takes spec 021's `Jaw` bone, T007 pins it.

## The review's findings, where each went

| Review | Where |
|---|---|
| B-1 (Q107) | spec Q2, Q4, Q107, FR-003 to FR-005, US2 AS2 and AS4, Revision 2026-11-14; plan §5.2, §5.4, §8; T004, T009 |
| B-2 (Q109) | spec Q1, Q109, FR-012; plan §1, §5.5 (overlaps: `scene/avatars.ts`, `scene/gait.ts`, the HUD files); T000, T011 |
| B-3 (Q108) | spec Q3, Q108, US1 AS5, FR-014, FR-016, SC-006, A5, A6, Cost; plan §1, §2, §4, §5.5, §6; T013, T016; intent's data-flow note; `docs/merge-requests/human-patches/024.md` |
| I-4 | FR-003, FR-006, FR-015, SC-005; plan §5.4; T008, T014 |
| I-5 | A1; plan §3; T007 |
| I-6 | plan §7; T002, T003, T010 (and T011, T012, T016) |
| N-1 | intent's Proposed outcome: his words quoted, not labelled on a paraphrase |
| N-2 | FR-011, SC-003, plan §5.1, T001, T005: `eating.regrow_s` only |
| N-3 | FR-007, US2 AS3, plan §5.4, T008 |
| N-4 | T014: no build line (the chunk test builds through its global setup) |
| N-5 | A6, plan §4: Principle I, Data-Local by Default, with FR-014's one disclosed event |

## Coverage: requirement → task

FR-001 → T006, T010, T011. FR-002 → T001, T002. FR-003 → T004, T008. FR-004 → T004, T009. FR-005 → T005, T009. FR-006 → T008 (the look is the Author's, A4). FR-007 → T005, T008. FR-008 → T008. FR-009 → T006, T013. FR-010 → T003, T012. FR-011 → T001, T005. FR-012 → T010, T011. FR-013 → none, by design (no clip role; plan §5.7). FR-014 → T016, T013. FR-015 → T004, T008, T014. FR-016 → T005, T013. FR-017 → none: a negative (the twin isn't told); plan §6 doesn't touch the twin's pack or `services/**` code. SC-001 → T004; SC-002 → T009; SC-003 → T005; SC-004 → T013; SC-005 → T004, T008, T014; SC-006 → T016, T013; SC-007 → T015 (by hand). 17 FRs, 15 covered by a task and 2 left out on purpose; 17 tasks (T000 to T016), each mapped to a story or the note.

## Checks

- **Constitution**: I (every byte that leaves is enumerated: the one event is in row V4's trigger in the same commit, T016), II, III, IV, V, VIII met as plan §4 says; VI by the note (T015); the agent that implements doesn't review (the night's rule 6 and the reviewer task). No principle deferred. CLAUDE.md's new-feature list: the cost, the degraded mode, the disclosure entry, the panel are here; the span is row V4's existing request span (spec A5).
- **Rule 4**: each task names its small tests, including the tests that import the files it changes (plan §7); no task runs `make check`; T014 runs three test files and the lint. The flaky `twin-2d.test.ts` is in no list.
- **Human-only paths**: none is written; the plan's "not touched" list holds. `docs/data-flow-disclosure.md`, the dashboard, and the gateway's test file are not human-only. `docs/merge-requests/human-patches/024.md` says so.
- **Test files named exist** on the line (`night/rework-018/rework-018`, checked 2026-11-14): `test/room/{scene,walking,input,reach,pick,words,vocabulary,schema,compose,bundle,data-only,standins,generated,events,objects,motion,highlight,gltf-images,flat,chunk,budgets,avatars,manifest-readiness,hud-split-geometry,hud-frame}.test.ts`, `test/ui/{hud,hud-notes,hud-split,hud-split-a11y,hud-split-contrast,hud-split-fallback,walking,fullscreen,notes-causes,degraded,a11y}.test.ts`, `test/{events,manifest,disclosure}.test.ts`, `services/gateway/test/unit/room-events-config.test.ts`, `deploy/scripts/test_dashboard.py`; the `eat-*` ones are new, written first.
- **Overlap** with other stacks (plan §5.5): additive. The real collision risks are `walk/input.ts` (a new key), `layout.ts` and `room.css` (a new tile after the walking control), `events.ts` and the generated kinds (a kind at the list's end, after spec 012's), and the dashboard's Room row (a panel's grid position).
- **No CRITICAL finding.** Open questions: Q1 to Q6 and the rework's Q107 to Q109, on the morning page with recommendations, taken provisionally.

## Rework notes (rework-spec-024, 2026-11-14)

Small runs, this task (documents only):

```
$ pytest evals/test_docs_links.py
evals/test_docs_links.py ............................................    [100%]
============================== 44 passed in 1.31s ==============================

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

The lint didn't run: this worktree has no `node_modules` (no change here is code or a file the lint reads beyond Markdown).

The measurements quoted in spec's Revision 2026-11-14 and plan §5.4 came from a throwaway Python script over the four GLBs as `night/fix-020/fix-020` has them, kept outside the repository; T004 and T008 measure the same on the real files in the implementation.

**What's left**: the Author's answers to Q1 to Q6 and Q107 to Q109 (and the page's Q107a and the draw-call ceilings), all taken provisionally; a reviewer's re-read of this rework (rule 6: a worker that didn't write it); then T000 rebases this branch onto the line's tip once spec 021's code is on it, and impl-024 starts.
