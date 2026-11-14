# Notes: spec 027, the rework after rv-spec-027

2026-11-14, spec-writer (rework-spec-027), on `night/rework-spec-027/rework-spec-027`, based on `night/spec-027/spec-027` at 0f61b8db.

## What the review asked, and where it went

- **B1** (Q144, Q145): spec 026's corpus patch (read at `night/rework-spec-026/rework-spec-026`, 2924cc4d, whose spec, plan, and `human-patches/026.md` are spec-026's at a7c78a6f, since the rework had only started) is named beside spec 022's (read at `night/rework2-spec-022/rework2-spec-022`, 74853b8a, with `--no-replace-objects`), in the spec (Q144, Q145, Edge Cases, Assumptions), plan §7 and §8 (R-3, R-6), T001, T007, ADR 0054's Decision 1 and Consequences, the index row, `human-patches/027.md`, and analysis A2. The figures, measured here: `[04-hobbies-and-travel] Do not claim:` plus its line break is 38 characters; 026's bullet is 91; the block is 133 (`renderRules`). Mission keeps 137 − 133 = 4. 026's Arya line's fixed words and line break are at least 137 characters, so hobbies and travel goes to 266 − 133 − 137 = −4 before his disclosure line. 022's five `08` lines cost their text plus 3 each. Plan §7's "rewrites `docs/corpus-size.json` too" is replaced by **T008**, after T004. The line's order is after item f (spec 026).
- **I1**: FR-010, Key Entities, plan §2 and §4 (`model`), and the ADR's "What these figures are" now say the figures are the fit check's model (spec 007, D5, D20), and name what it leaves out: the lead (`renderLead`; 41 characters today for the snowboard), JSON escaping beyond `PER_TURN_CHARS`, and the 400 framing estimate against `CONVERSATION_HEAD` (147) and `CONVERSATION_TAIL` (177). Each topic's lead is counted as information (`lead`, `margin_after_lead`), not in T1.
- **I2**: `stageOf`'s T1 is now per pack topic (`pack.topics[].files`), and the per-file figures are information (`by_file`, `in_topics`). Room parity uses a two-file fixture topic, and a lead case is added.
- **I3**: Decision 1's fourth reason now says the bound sets the reservation (3,350 micro-USD), not the billed cost (`commit.ts:15-17`, quoted). The billed cost is about 1,050 micro-USD at most, from D43, marked as an estimate. Stage 1's possible saving (under 900 micro-USD a turn, its spec's to estimate) is in Consequences.
- **I4**: T005 moves "Measured on `main` at 3c0e4cd0" to the line's commit that carries the check. The ADR's status line and "How to rerun it" already say the pack's figures rerun by the check only from that commit on.
- **N1** dev's slot comparison is marked as inferred, with its arithmetic. **N2** the T1 note prints beside `twin:pack`'s existing fit note (FR-011, plan §4, ADR Decision 4). **N3** the header's 38 characters are in the Edge Case and Consequences. **N4** the ADR status and its index row add "after his answers to Q1 to Q8 on the morning page".

Q144 and Q145's answers are taken under the orders file's rule ("Every question, new ones included: the recommended answer stands"). They are provisional, his to overturn on the morning page.

## Small runs

```
$ python3 -I -m pytest -q -p no:cacheprovider evals/test_docs_links.py
............................................                             [100%]
44 passed in 0.86s
```

```
$ python3 -I evals/docs_links.py
PASS  every relative link resolves: 2406 links in 384 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 51 of 51
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2406 relative links in 384 files
```

```
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this container (no `node_modules`). This rework changed no code, only Markdown.

## Interruptions

None. No hook or bash-gate refusal was hit.

## What's left

T000 is the Author's answers (Q1 to Q8, Q144, Q145, and this rework's new question on the lead, which the supervisor numbers). Then T001 to T008 run on the line after spec 026, in the order T001 → T002 → T003 → T004 → T008 → T005 → T006 → T007. Nothing more is built tonight (Q144). Stage 1's spec is the next item once he applies either corpus patch and the record reads "stage 1 due".
