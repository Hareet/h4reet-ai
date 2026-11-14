# Analysis: spec 027, across spec.md, plan.md, tasks.md, and ADR 0054

Read-only check, rerun 2026-11-14 by the spec-writer after the rework for rv-spec-027 (blocking B1; I1 to I4; N1 to N4), on `night/rework-spec-027/rework-spec-027`. The first run's findings (A1 to A8) are kept below with their status. The `before_analyze` and `after_analyze` hooks in `.specify/extensions.yml` are optional commits, and the branch's save points cover them.

Constitution check: VIII (the grounding is unchanged; the ADR records how much of the corpus a turn holds, by the fit check's model, and says what that model leaves out: FR-005, FR-010, FR-013), V (no run-time cost; a paid call's reservation and its estimated billed cost are stated apart, each marked for what it is, and each later stage's cost is given: ADR Context, Decision 1, Consequences), I (no byte leaves; degraded modes unchanged; stage 2's is named), II (tests for the check; no run-time capability, so no span or panel; the run-time gap found is Q5), III (intent, spec, plan, ADR; a human merges; Q144 and Q145 are on the page), IV (no human-only path written; T008 changes other specs' patch files and notes under `docs/merge-requests/`, and their proposals' recorded hashes, never `corpus/` outside `proposals/`), VI (the measurement is public and rerunnable). No control is deferred or dropped, so no deviation is named.

## Coverage

| Requirement | Tasks | Notes |
|---|---|---|
| FR-001 to FR-007, FR-014 (the ADR) | drafted on the branch; T005; T006 | T005 now also moves the measurement's commit (I4) |
| FR-008 the record, deterministic, reads only | T002, T003, T004, T008 | T008 regenerates it in both pending patches |
| FR-009 the record's fields | T002, T003 | pack topics; `by_file` and `lead` as information (I2) |
| FR-010 the fit check's model, and what it leaves out | T002, T003; the ADR | room parity with a two-file topic; the lead case (I1, I2) |
| FR-011 a crossing is a note, beside the fit note | T002, T003, T004 | N2 |
| FR-012 stale record fails, naming the command | T002, T004, T008 | |
| FR-013 nothing at run time changes | T004 | |
| SC-001 to SC-004 | T005, T002, T002, T004 | |
| Q144, Q145 | T008, T007 | |

18 requirements (FR-001 to FR-014, SC-001 to SC-004), all with at least one task: 100%. 9 tasks (T000 to T008); none unmapped. Ambiguities: 0. Duplications: 0. Critical: 0.

## Consistency checks made

- **The two pending patches** (B1): spec 026's `04` block (133 characters: the 38-character header with its line break, the 91-character bullet, their line breaks; checked against `renderRules` in `apps/web/build/twin-pack.ts`, `[${shortName(file)}] Do not claim:\n…\n\n`) and its Arya line (at least 137 characters, its fixed words and line break, before his approval's disclosure line), and spec 022's five `08` lines (its FR-008), are named alike in spec Clarifications Q144 and Q145, Edge Cases, and Assumptions; plan §7 and R-3; T001, T007, T008; ADR Decision 1 and Consequences; the index row; and `human-patches/027.md`. Mission 137 − 133 = 4; hobbies and travel 266 − 133 − 137 < 0.
- **Line order**: after item f (spec 026), in the spec's header, plan §7, and T001; no "after item h" remains but as 026's own predecessor.
- **Plan §7's "rewrites `docs/corpus-size.json` too"**: replaced by T008 and its description in §7 (Q145), under 026's rule quoted from `human-patches/026.md`'s last paragraph.
- **The fit check's model** (I1): FR-010, Key Entities, plan §2 and §4 (`model`), and the ADR's "What these figures are" say the same three omissions: the lead (`renderLead`, counted at run time in `grounding.ts`), JSON escaping beyond `PER_TURN_CHARS`, the 400 framing allowance against `CONVERSATION_HEAD` (147) and `CONVERSATION_TAIL` (177), measured from `services/gateway/src/twin/prompt.ts`.
- **T1 per pack topic** (I2): FR-009, Q2, US2 scenario 3, plan §4 (`topics`, `stageOf`), §5 (room parity's two-file topic), T003, and the ADR's table heading agree; per-file figures are information everywhere.
- **Reservation against billed cost** (I3): the ADR's Context, Decision 1's fourth reason, and Consequences agree: 3,350 micro-USD reserved; about 1,050 at most billed, D43's "about 9k tokens in and up to 300 out" at `config/prices.yaml`'s Haiku 5.5 prices, marked as an estimate; `commit.ts`'s lines 15 to 17 quoted word for word.
- **Quotes**: his item, his intent-015 words, `08`'s privacy promise, `corpus/README.md`'s gap rule, spec 007's plan §4, D27 and D43, `admission.ts`'s and `commit.ts`'s comments, `human-patches/026.md`'s rebuild rule, and the fit note's text: each checked against its source.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A1 | Medium | The per-topic, room, rules, and free-talk figures came from a replica of the fit check, not `twin-pack.ts` itself. | Unchanged: T005 replaces them with the check's output; the room-parity test holds the check to `fitProblems`. |
| A2 | Medium | Two pending corpus patches are projected to cross T1: spec 026's (hobbies and travel; mission left 4), then spec 022's (mission). | Reworked (B1): named in the spec, plan §7 and §8, T001, T007, T008, and the ADR; Q144 (Q1 stands; stage 1's spec is next once he applies either and the record reads "stage 1 due"); Q145 (T008). |
| A3 | Low | T2's second trigger, a live free-talk miss, isn't measurable by the check. | Unchanged: the ADR says so. |
| A4 | Low | The dropped sections' count is computed and not logged. | Unchanged: Q5; stage 1's first task. |
| A5 | Low | dev's local slot looks smaller than a twin turn. | Reworked (N1): the ADR marks the comparison as inferred and gives its arithmetic (25,933 characters at an opening would need more than 6 characters a token). |
| A6 | Low | The freshness test adds a step to a prompt or `limits.twin` change. | Unchanged: the failure names the command. |
| A7 | Info | The small test pays the workspace's two site builds per run. | Unchanged. |
| A8 | Info | T003 and T004 also run `test/twin-pack.test.ts`. | Unchanged: it covers the changed `twin:pack` line. |
| A9 | Low | Spec 026's patch is buildable only after spec 020's approval of the dog's model is on main (026's R-13, FR-019), so it may not be on the line's tip when T008 runs. | T008 notes a missing patch; built later, its `twin:pack` run writes the record itself (plan §7). |
| A10 | Low | T008 updates each proposal's recorded blob ID and SHA-256 under `corpus/proposals/`; the container may refuse that write, as 026's FR-017 foresees. | T008 uses the proposal's own fallback path under `docs/merge-requests/` where one exists, and says so in its notes; otherwise the refusal goes on the page under Interruptions (the order's rule 5). |
| A11 | Info | T008 keeps its number after T007 so the review's references to T001 to T007 hold; the order is explicit in tasks.md's "Order". | None needed. |

No needs-clarification marker is left in the requirements. No finding blocks implementation.

## Next actions

None blocking. Implementation follows T000's answers on the line after spec 026, in the order T001 → T002 → T003 → T004 → T008 → T005 → T006 → T007.
