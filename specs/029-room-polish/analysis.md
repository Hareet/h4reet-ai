# Analysis: spec 029, the room's polish

`/speckit-analyze`'s pass over [spec.md](spec.md), [plan.md](plan.md), and [tasks.md](tasks.md), by the spec-writer `spec-029` (night 4, 2026-11-16), after the three probes' notes were read (plan §2). Not a review: the agent that wrote these documents ran it, so a reviewer's read is still owed (CLAUDE.md: "The agent that implements never reviews"; the same holds for a spec).

## Findings, and what was done

| ID | Severity | Where | Finding | Done |
|---|---|---|---|---|
| AN-1 | High | spec.md | Two requirements numbered FR-015: group B's room-report line, added after B0's note, and group C's "THE WORDS SHALL be drawn in the room's code". | Group B's renamed FR-014a in spec, plan §R-B1, §R-B4, §10, and T-B03. No duplicate id remains (checked by a script over the spec's FR lines). |
| AN-2 | Medium | plan §R-A4 | Said each split part's style equals `f411d8e1`'s, which T-B02's fix (the frame out of flow) makes false; SC-001 had already been reworded to "group A's rules apply to no part". | §R-A4 reworded to SC-001's form. |
| AN-3 | Medium | spec FR-006, tasks | FR-006 (the text box stays opaque over the room) had no test. | T-A01 and §R-A4 assert the text box's declarations are the same over the room as beside it. |
| AN-4 | Low | tasks.md | Twelve requirements were covered only through plan sections, not named on a task (FR-002, FR-009, FR-013, FR-014, FR-016, FR-017, FR-024 to FR-035). | Each named on its task; a script counting ids and ranges finds every FR covered. FR-008 (his look) is T-INT's note's list. |
| AN-5 | Medium | spec Q11, Q13 (first drafts) | The first role drafts said each resume item's narration takes the path's script, but no narration is approved for a release build (`probe-pick-029`); the first avatar drafts said "walks the room" without "in the 3D room", and conditioned the dinosaur's line on the bundle, which the choice screen can't read before "Enter" (spec 012's FR-010 (b)). | Reworked before the plan to the probe's sourced drafts; the narration clause is Q11's option C; the dinosaur's condition is a build test (FR-031). |
| AN-6 | Medium | spec FR-023 (first form) | Said the desk sign's words go with the eaten chunks; spec 024's Q4 and Q107 set the `lettering` face and the triangles holding it aside, never eaten (`probe-words-029`). | FR-023 follows spec 024: the words stay on the set-aside part. |
| AN-7 | Medium | spec FR-021 (first form) | Took the words as plain data; spec 004's routes approve room text by SHA-256 (`assets/policy/content-approvals.json`, human-only), and RT13 reads the sign's words from the intent's quotes, where the dog sign's corrected words are this spec's reading, not his. | FR-021 follows spec 004's routes; the release build shows the three faces plain until his approval patch (plan §R-C5); the dog sign waits for his Q6 answer recorded verbatim (Q6's consequence). |
| AN-8 | Low | spec FR-028, FR-033 (first form) | Put "Selected" in each card's accessible description, beside the native radio's own checked state: read twice. | The word is `aria-hidden`; the radio's state is what a reader announces. |
| AN-9 | Info | spec group B | Written before B0's note, keyed to an unknown cause. | Reworked to B0's finding (Readings; FR-009 to FR-013; plan §R-B1 to §R-B5): two faults, one his (readiness), one code (the panel's `> *` rule); no ops batch. |

## Coverage

- Every FR (FR-001 to FR-036, FR-014a, FR-023a) is named by a task or a range on one (AN-4's check). Every user story has an independent test file named in both the spec and the plan (US1 `hud-over-room`, `hud-over-contrast`; US2 `talk-answer-shows`; US3 `piece-words`, `monitor-cursor`, `paper-sheet`; US4 `choice-cards`, `choice`, `a11y`).
- SC-001 to SC-007 map to T-A01, T-A01, T-B01 and T-B03, T-C02 to T-C06, T-D01, T-D02 and T-INT, T-INT; SC-008 is his look.
- Shared files: one, `src/room/hud/split.css`, edited by B (line 273) and A (an appended block), merged by T-INT, B first (plan §9). `ui-words.yaml` and `ui-keys.ts` are C's alone, and `messages.yaml` B's alone. No group edits `app.ts`.

## Constitution

- **Principle I**: no new byte leaves the device; nothing fetched before "Enter"; degraded modes written first; the conversation's refusals become messages (FR-012).
- **Principle II, Workflow 7**: the telemetry deviation is named in spec.md's Assumptions, with ADR 0055's reason for the choice screen.
- **Workflow 4**: T-B01 writes the test, and T-B02, the fix, edits no test.
- **Principle IV**: the human-only paths are a patch (the approvals) or his step (the readiness). Plan §10 lists them.
- **Principle VII**: the monitor's line carries its corpus claim, and the cards say only what the code does.
- **Principle VIII**: the disclosure stays.
- No accepted ADR is reversed. One test departure is named, `choice.test.ts`'s legends, in a feature task, not a fix task.

## Open, for the page and the line

- His answers: Q1 to Q15, each taken provisionally, and B0's Q-B0-1 (re-marking readiness).
- **Gaps that only something beyond tonight closes:**
  - The log's height is layout, which jsdom can't compute. FR-011's out-of-flow assertion is the nearest DOM check. B0's DevTools snippet and a later real-browser test (plan §R-B5) close the rest.
  - A release build shows the signs and the monitor plain until his approvals patch.
  - The intent's move into the spec folder must carry the outlines' `intent_ref` with it (plan R-1).
- No CRITICAL finding remains. Implementation may start from this branch's tip under his rule 1. An answer he overturns is reworked before he merges.
