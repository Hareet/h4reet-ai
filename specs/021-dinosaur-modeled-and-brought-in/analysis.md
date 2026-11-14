# Analysis: spec 021, the dinosaur modeled and brought in (re-run after rv-spec-021)

Cross-artifact read of spec.md, plan.md, tasks.md, and the contracts, on 2026-11-14, after the rework that rule 6's Opus review (rv-spec-021, Verdict: blocking) asked for. Read against the line, `night/impl-020/impl-020` at 384a0db8, spec 020's rework at 7a002a6a, and `main` 3c0e4cd0 for the policy files. Findings were fixed in the artifacts where they were mine to fix (marked **fixed**). The first run's report is in git history (ee2ecdf2).

## The review's findings, and where each is answered

| Finding | Answered in |
|---|---|
| B1: RA9 is spec 020's on the line; the `counts` pin; `RIG_BONES.dog = null`; no "parallel", no "merges first"; spec 019's gait gives no gait to a non-Mixamo rig | Rules are RA10 to RA12 everywhere (spec FR-003 to FR-006, plan R-01, R-08, contracts, tasks), renumbered by impl-021 if the line holds a higher one; R-08 names both pins, `counts` and the lenient list, and R-07 now precedes R-08 (N1); `dog: null` in spec Q7, FR-005, plan R-05, §4, the contract, T003; plan §3 and §4 and the spec's US1 and Edge Cases say the gait applies none (spec 019's FR-008); T002 runs `test/room/avatar-gait.test.ts` |
| B2: FR-010, Q6, Edge Cases, T007 on spec 014's terms | Q6, FR-010, US2, Edge Cases, Degraded mode: `standin.avatar` while the dinosaur shows its flat shape in 3D, gone when its model shows; `standin.note` untouched. T007 is a test with no code expected: `figure: true` without a bundled model, `figure: false` with one, in `test/ui/notes-causes.test.ts` |
| B3: the night-stack note | Plan §3 and T001 name `docs/merge-requests/2026-11-14-night-stack.md`; T010 completes this item's section with small runs and the lint only; FR-016 says this item runs no full suite |
| B4: rules only where `RIG_BONES[id] !== null`; the box from `AVATAR_SHAPES[id]`; woman and man cases; "an avatar with a rig-table row"; extents in `measures` | FR-003, FR-004, FR-005 (the phrase defined), plan R-03, R-05, §4 (`extent_x`, `extent_z`: N5), T004 and T005 each with "woman and man with no `walk` clip and any extent: no finding" |
| B5: the brief's tools and notes | `contracts/dinosaur-brief.md`: the fourteen IDs the shipped records use, with the name-to-ID table; `notes` carries the prose constraints in full; the JSON passes `line.py brief` (run in this rework); T008 asserts `notes` holds "no film or franchise creature" |
| I1: main's caps | Spec Q5 and the brief's reading quote `assets/policy/caps.json` on `main`: avatar `{"bytes": 21000000, "triangles": 180000, "texture_bytes": 46000000}`, animation `{"bytes": 1000000}`, first visit phase 3 25000000 |
| I2 (the page's Q75): FR-007 | FR-007 reworded to the enforcement that exists: brief and record say `likeness: false`; a likeness needs his approval under the arrival check's rule P, and on the line spec 020's RA9 keeps it out of the bundle without it; no new rule |
| I3: the rig contract | `avatars.ts`, raw names, `<prefix>:<name>` matched as `line.py`'s `has_bone` |
| N2: T004, T005 not `[P]` | Removed; the dependencies say why |
| N3: a missing `take` | Spec 009's FR-003, cited in Q3, FR-008, the contract, T002 |
| N4: spec 004's recorded answer | The Edge Case quotes the question's dinosaur line and both answers in their words, the reading beside them |

## Coverage

| Requirement | Task | Test |
|---|---|---|
| FR-001, FR-002 (files, caps, cut-out fallback) | T006 | `dinosaur-compose.test.ts` |
| FR-003 (RA12) | T005 | `dinosaur-compose.test.ts`, `compose.test.ts` |
| FR-004 (RA11) | T004 | same |
| FR-005 (RA10, rig table) | T003 | same |
| FR-006 (no human-only file; numbering) | every task's rules; SC-006 in T010 | n/a |
| FR-007 (original, `likeness: false`) | the brief (T008 asserts its notes); the existing rule P and RA9 | `test_line.py` |
| FR-008 (no hand, no gait, `take`) | T002 | `avatar-hands`, `avatar-scene`, `avatar-gait` |
| FR-009 (placement unchanged) | T002 | `avatar-hands.test.ts` (**fixed** in this run: T002 now asserts the height, origin, and facing) |
| FR-010 (`standin.avatar`) | T007 | `notes-causes.test.ts` |
| FR-011 (no new event) | none new; no code adds one | covered by the absence of change |
| FR-012 (first visit, report) | T006 | report line; F3 at the asset's intake |
| FR-013, FR-014 (brief, tools) | T008 | `test_line.py` |
| FR-015 (look approval) | `human-patches/021.md` | n/a |
| FR-016 (small tests) | every task's **Tests** line; T010 | n/a |
| FR-017, FR-018 (docs checks) | T009 | `disclosure.test.ts` |

Requirements 18, tasks 10, every requirement with a task or a stated reason (FR-011, FR-015), coverage 100%.

## Findings

| ID | Category | Severity | Location | Summary | Resolution |
|---|---|---|---|---|---|
| C1 | Underspecification | LOW | tasks.md T002 | FR-009 (placement) had no assertion of its own | **Fixed**: T002 asserts 1.2 m high, origin and facing at the placement |
| F1 | Inconsistency | LOW | spec.md FR-003 to FR-005 | "an avatar with a rig-table row" read against a table where every avatar has a row (`null` for three) | **Fixed**: FR-005 defines it as a row that isn't `null` |
| F2 | Inconsistency | MEDIUM | tasks.md (first version) | The RA tests were placed in `test/room/avatars.test.ts`, which is the runtime's test, not the compositor's | **Fixed** in the rework: a new `test/room/dinosaur-compose.test.ts` (plan R-09), with `avatars-compose`, `likeness-visitor`, and `report` run as the files covering `avatars.ts` |
| F3 | Inconsistency | MEDIUM | plan R-08, tasks | The `counts` pin builds RA1 to RAn contiguously, so the three rules must land in number order | **Fixed**: the numbers follow the task order (RA10 bones in T003, RA11 box in T004, RA12 clips in T005), so each commit is contiguous; this differs from the first version's order (box, bones, clips), and every artifact uses the new one |
| U1 | Underspecification | LOW, open | spec FR-012, SC-005 | The first visit's number isn't computable without the asset | SC-005 holds at the asset's intake (F3 on his branch); the code task reports the line, not the number. Not a gap in the item |
| U2 | Underspecification | LOW, open | contracts/dinosaur-brief.md | This session can't read `/srv/studio/briefs/dinosaur/1.json` to compare it with the contract | brief-dino-r1 reports it names the shipped records' IDs and passes `line.py brief`; the round's judge compares the two, and a difference goes to the page |
| U3 | Underspecification | LOW, open | spec Q7, plan R-05 | The dog's rig row stays `null`; no spec names the dog's bones | A question on the page with a recommended answer; it blocks nothing here |

## Constitution

No clause deferred or dropped; no deviation to name; no ADR. No human-only path is written: `human-patches/021.md` lists what waits on the Author (the asset's intake, an approval entry only if the gate wants one, an optional ADR pointer).

## Paraphrase check

The Author's item, orders, and the P-7 answer are quoted word for word in the intent, spec, plan, and tasks; spec 004's recorded answer and intent 000's "Inspired-by only" sentence are quoted in their words, the readings beside them. No fact about the Author is stated.

## Verdict

Consistent; no CRITICAL or HIGH finding. The three open items are low and have a defined resolution. Ready for impl-021, which merges this branch into the line after impl-020.

## Rework notes (rework-spec-021, 2026-11-14)

Small runs only, the order's rule 4 (this rework writes no code; the tests that read its files are the docs-links check and the lint):

```text
$ python3 -I -m pytest -q -p no:cacheprovider evals/test_docs_links.py
44 passed in 0.89s
$ python3 -I -B scripts/studio/line.py brief /tmp/rw021b/dinosaur/1.json   # the contract's first json block
line: pass
$ make lint
… eslint, tsc, prettier ("All matched files use Prettier code style!"), ruff ("All checks passed!", "758 files already formatted"), shellcheck … exit 0
```

The first docs-links run failed on two links to specs 019 and 020, which are on the line but not on this branch's base; they are now plain paths. One question went to the page (the dog's `null` rig row; recommended: a later spec fills it). No refusal.

What's left: impl-021 merges this branch into the line after impl-020 and runs T001 to T010; the studio round (studio-dino-r1) and the Author's look approval and intake (`human-patches/021.md`) are outside this item.
