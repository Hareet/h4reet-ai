# Analysis: spec 020, the dog modeled and brought in

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, and the intent, read against the code at `main` 3c0e4cd0, by the spec-writer (2026-11-14). Non-destructive: the findings below were fixed in the same commit unless marked open. Constitution check: plan §2 (no violation; one reading named in the spec's Assumptions).

## Coverage

| Requirement | Task | Small tests |
|---|---|---|
| FR-001 the dog shows at the table's height | T004, T005 | `dog-avatar.test.ts`, `avatar-scene.test.ts` |
| FR-002 likeness gate (RA9) | T001, T002 | `likeness-visitor.test.ts`, `avatars-compose.test.ts`, `compose.test.ts` |
| FR-003 RA3 stays for the stand-in | T001 (g), T002 | `likeness-visitor.test.ts`, `twin-compose.test.ts` |
| FR-004 file convention, caps, counting | T001, T003 | `likeness-visitor.test.ts`, `avatars-compose.test.ts` (existing RA1 to RA4 and RK3 cases) |
| FR-005 walk, root in place | T004, T005 | `dog-avatar.test.ts` (the root in place is the studio's; the intake's RA2 reads the clip) |
| FR-006 failures leave the cut-out | T004 | `dog-avatar.test.ts`, `avatar-loader.test.ts` |
| FR-007 the line | T006 to T008 | `dog-line.test.ts`, `compose.test.ts`, `mount.test.ts` |
| FR-008 no hand, no paper clip | T004 | `dog-avatar.test.ts`, `avatar-handoff.test.ts` |
| FR-009 choice screen unchanged, fetch only if chosen | T004 | pinned by existing `avatars.test.ts`, `avatar-loader.test.ts` (not edited) |
| FR-010 to FR-014 the studio round | T011 (the brief); the round is a later studio task | the arrival check and RA family at intake; his look |
| FR-015 no new event; report lines | T003 | `report.test.ts` / `dog-report.test.ts` |
| FR-016 no new byte off-device | T012 | the disclosure test, `disclosure.test.ts`, if a row is touched |
| SC-001 to SC-003 | T001, T004 | as above |
| SC-004, SC-005 | his | look approval, phone run |

Every task names its tests (the order's rule 4); `make check` is in T013 alone.

## Findings

| # | Kind | Finding | Resolution |
|---|---|---|---|
| A1 | Inconsistency (fixed) | The plan and T002 said RA rules register in `checks/ra.ts`. In the code they register in `build/room/checks/family.ts` (RA6 at line 124); `ra.ts` holds RA7 and RA8 measures and the header comment. | Plan §6 and T002 now name `family.ts`; `ra.ts` is the header only. `compose.test.ts`, which lists the rule table, joins T002's and the plan's test list. |
| A2 | Underspecified (fixed) | `lineFor` is typed to the twin's file (`Omit<TwinFile, …>`) and `Avatar` has no `line`. "Reuse" in R-01 hid a signature change. | R-01, the data model, and T002 say the parameter is loosened to anything with a `sha256`, and `Avatar` gains `line: string \| null`. |
| A3 | Ambiguity (fixed) | T004's scaling case said the tail counts "as the fixture says". | Reworded: scaling is by the rest pose's precise bounds; the fixture's tail stays under its head's top, as FR-012 asks of the studio's model. |
| A4 | Gap (named, not a defect) | FR-005's "root in place" and FR-012's skeleton rules can't be proven by a fixture test; they are the studio's output's properties. | The intake's RA2 (a clip moves only nodes its model names) and his look on lookdev's view are the checks. The studio brief (T011) states the rules. |
| A5 | Risk (open, carried) | The copy's order is pinned by compose tests; adding the slot moves it. | Plan R-04 and T007: the pin is changed with the code, nothing else edited. The implementer should find the pin with `npx vitest run test/room/compose.test.ts test/room/text.test.ts` before the edit. |
| A6 | Risk (open, carried) | The dinosaur (item e) and the chase (item h) specs extend the same avatar path (`build/room/avatars.ts`, `emit.ts`, `bundle.ts`, `text-copy.ts`). | Plan §6: this branch merges first; the others rebase. The supervisor should merge in that order. |
| A7 | Open (his) | The photos folder is not in the spec-writer's container, and the photo rules (spec 003's FR-025) say no agent reads a photo. Whether the studio agent may read them is his (Q2). | Taken provisionally: he queues the photo step; the round continues from the concept he hands back. If he overturns it (option B), only plan §5 step 1 and FR-011 change. |
| A8 | Reading named | Spec 003's FR-017 ("resemble no real person") vs a dog's likeness. | Spec Assumptions, "Deviations named": a dog is not a person, he consents, and the likeness path (RA9) is the control. No control is dropped. |
| A9 | Check passed | Facts about the Author: the only one stated is the corpus's "Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller." (`corpus/04-hobbies-and-travel.md`); the spec states no size, age, or trait; the 0.62 m is the room's table, not a fact about his dog. | None needed. |
| A10 | Check passed | No human-only path is edited; the five human items are in `docs/merge-requests/human-patches/020.md`, each with whether it is on main before the gate (none is, for the code). `make up` builds with the dog's files absent (RA9 and the existing `no-model` path). | None needed. |
| A11 | Check passed | New-feature list (CLAUDE.md): span or event (none new, reuse stated), dashboard panel (existing row), cost estimate (spec), degraded mode (cut-out), disclosure (T012). | None needed. |

## Verdict

Ready to implement on one line, test-first, after the Author's confirmations on the morning page for Q1 to Q5 (provisional). The first overturn that changes tasks is Q1 option B or C (a companion in the room), which would add a new figure kind and is rework, not a tweak; the others change a line or a task each.

## What's left

The studio round, his intake, his look approval, and his approval entries (human-patches/020.md); the five questions in `/night/io/out/questions.md`.
