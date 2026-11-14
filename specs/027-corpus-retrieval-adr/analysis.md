# Analysis: spec 027, across spec.md, plan.md, tasks.md, and ADR 0054

Read-only check, rerun 2026-11-14 by the spec-writer after the second rework, for rv-rework-spec-027 (I-1, I-2, nits 1 to 5; not blocking), on `night/rework2-spec-027/rework2-spec-027`. It was first rerun after the rework for rv-spec-027 (blocking B1; I1 to I4; N1 to N4). The earlier findings (A1 to A11) are kept below with their status; A12 to A16 are this run's. Prerequisites: `check_prerequisites.py` resolves the feature only with `SPECIFY_FEATURE_DIRECTORY=specs/027-corpus-retrieval-adr` (no `.specify/feature.json` on this branch). The `before_analyze` and `after_analyze` hooks in `.specify/extensions.yml` are optional commits, and the branch's save points cover them.

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
| Q144, Q145 | T008, T005 (final figures), T007 | |

18 requirements (FR-001 to FR-014, SC-001 to SC-004), all with at least one task: 100%. 9 tasks (T000 to T008); none unmapped. Ambiguities: 0. Duplications: 0. Critical: 0.

## Consistency checks made

- **The two pending patches** (B1; reworked for I-1): spec 026's `04` block, reread from 026's patch at `night/rework2-spec-026/rework2-spec-026`, b12ac0ba (`git --no-replace-objects`; its tree is `rework-spec-026`'s at 3417bff2), is 136 characters by `renderRules` (`apps/web/build/twin-pack.ts`, `[${shortName(file)}] Do not claim:\n…\n\n`): the 38-character header with its line break, `- `, FR-021's 94-character bullet ("That the dog in the room is a real dog: it is an AI-made likeness, not a photo or a recording."), and two line breaks; the same as Consequences' rule, 42 + the bullet. Its Arya line (026's plan §3) is at least 137 characters: its fixed words, a 10-character date standing in for his approval's, and its line break, before his disclosure line. Mission 137 − 136 = 1; hobbies and travel 266 − 136 = 130, then 130 − 137 = −7. Spec 022's five `08` lines (its FR-008) each cost their text plus 3, so after 026's any one passes mission's 1. The figures agree in spec Q144, Edge Cases, and Assumptions; plan §7 and R-3; T007, T008; ADR Decision 1 and Consequences; `human-patches/027.md`; and notes. No 133, 91, "mission 4", or −4 is left in these files but in notes.md's history, marked as corrected.
- **The projected figures' end** (I-1): plan §7's new paragraph and T005 agree that the final figures are T008's records, corrected in each place listed (the same list in both), before the line is named for his merge; a patch T008 couldn't build keeps its projection, marked.
- **What T008 writes under `corpus/`** (I-2): the spec's Status line, plan §7, tasks' rules line and T008, `human-patches/027.md`, and the constitution check above say the same: nothing outside `corpus/proposals/`, and there only each proposal's recorded blob ID and SHA-256 (or 026's FR-017 fallback, `docs/merge-requests/<date>-corpus-dog-intro-proposal.md`, read at b12ac0ba).
- **The page's questions**: Q1 to Q8, Q144, Q145, and Q157 (the lead in T1) are named alike in T000, T007, the ADR's status line, its index row, and `human-patches/027.md`; the Edge Case cites Q157 with its recommended answer (no).
- **FR-002's commit** (nit 4): FR-002 names 3c0e4cd0 as drafted, then T005's line commit, which is in `main`'s history only if he merges without squash or rebase; T007's note says so.
- **Stage 1's possible saving** (nit 2): the ADR states its ratio, one token a character (the gateway's count before a call): 9,023 characters, 902 micro-USD, "about 900 at most".
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
| A12 | Medium | The projected figures for 026's patch came from its old bullet (91 characters, at a7c78a6f); its FR-021 is now 94, so the block is 136, mission keeps 1, and hobbies and travel goes to −7. | Fixed (I-1): every place reread at b12ac0ba; conclusions unchanged. |
| A13 | Medium | 026's text may move again before T008 runs, staling the figures a third time. | Fixed (I-1): T005 takes the final figures from T008's records and corrects each place; plan §7 lists them. |
| A14 | Low | "Never writes `corpus/**`" contradicted T008's writes under `corpus/proposals/`. | Fixed (I-2): stated as "outside `proposals/`" in the spec's Status, plan §7, tasks, and `human-patches/027.md`, with what T008 writes there. |
| A15 | Low | FR-002's "named commit of `main`" against T005's line commit. | Fixed (nit 4). |
| A16 | Info | T008's "in the order its own notes give" suggested the two patches build on each other; each is applied alone on its own export. | Fixed (nit 5): the clause is dropped, and the order said not to matter. |

No needs-clarification marker is left in the requirements. No finding blocks implementation.

## Next actions

None blocking. No finding is critical; the 18 requirements keep 100% coverage over 9 tasks; ambiguities 0; duplications 0. Implementation follows T000's answers on the line after spec 026, in the order T001 → T002 → T003 → T004 → T008 → T005 → T006 → T007.
