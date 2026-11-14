# Notes: spec 022's reworks (2026-11-14)

## rework2-spec-022

Rule 6's second rework of spec 022, after the Opus review rv-rework-spec-022 (Verdict: blocking, R-1), on `night/rework2-spec-022/rework2-spec-022`, based on rework-spec-022's tip (34fc353a). No code. Files changed: `specs/022-corpus-from-film-scripts/` (spec, plan, tasks, analysis, these notes) and `docs/merge-requests/human-patches/022.md`. The intent needed no change: it quotes him only as g) "hareet-ai corpus from film scripts" and names the orders file's sentence as the file's.

### What was done

- **R-1 (blocking)**: a list item's leading number (`^\s*\d+\.\s`, as G1's `numbersSource` and `twin-pack.ts`'s `GOLDEN_ITEM` read it) is an exempt span: spec FR-003, US3 scenario 3; plan §2 (Golden Q&A numbered on from `08`'s last), §3 R4, §8; T001's passing fixture `9. *How does the kill switch stop spending?* — The gateway reads the kill switch first. [P]`; T005.
- **R-2 (Q104, the page's recommended answer)**: the slot's label and source, and every line with the count or the road-out claim, name the laptop's production stack (`ENV=prod`, `COMPOSE_PROFILES=gpu`). The road-out line's source is `deploy/compose.yaml`'s `networks`. I counted again with Python on `deploy/compose.yaml`: under `gpu`, fifteen services, and only `gateway` lists `egress`. `tunnel`, `tunnel-end-collector`, and `ec2-snapshot-publisher` list it too, under their own profiles. Spec Q4, FR-003, FR-006; plan §2; T004, T005, T007; the human patch.
- **R-3**: the word-currency copy is `redteam/run.py`'s `AMOUNT_WORDS` with `_NUMBER_WORDS` filled in, its parity test reading that file as `twin-guards.test.ts:590-609` does. `EXTRA_PATTERN` is kept, with its fixed words named ("one", "a hundred", "a thousand"; `cents?`, `dollars?`, `usd`, `bucks?`). Spec FR-004; plan §3 R4; T002. Found on the way: "At three fifty" matches none of the currency patterns (checked with Python). R4's number words catch it, and T001 has a fixture for it.
- **R-4**: the spec no longer quotes the page's wording as his order. The page's "answered" record is named as the page's, and the orders file's rule 1 as the orders file's. T000 lists Q1 to Q6, Q95 to Q97, Q102, Q104, and this rework's question.
- **R-5**: rows carried in part (both spans), "contradicted by the repository" in the closed list, and `materials.md`'s "shown as built" note in R3. The examples are `kill-switch-b2` file lines 5, 7, 9 and 11 (R1's split now joins 9 and 11 into one sentence), `SCRIPTS.md` §1 line 2, and §5 line 1. T007 checks by hand which sentence stands under the note. Spec Q2, FR-006; plan §2, §3 R1 to R3; T001, T003, T004, T007.
- **N-a** "file line 15"; **N-b** "the plurals G1 reads"; **N-c** T007, T010, T011 name `make lint`, and T010, T011 name `evals/test_docs_links.py`; **N-d** the cost-meter row; **N-e** Q1 quotes line 10 with its markup.
- **rv-spec-022's N-1**: the first analysis's A1 cited a CLAUDE.md line that doesn't exist. The new A1 cites the evidence instead. **N-2** T000 names its small tests, and T006 and T007 name the lint. **N-3** T007 is a reviewer task the supervisor queues. **N-4** cites intent 015 and `LICENSE`, not ADR 0050. **N-5** Q3 says the `[P]` URLs resolve at publication (Q102).
- `/speckit-analyze` re-run: `analysis.md`. Critical 0; coverage 100%. A7 (the tunnel line) is the new question on the page. A8 (Info) is outside this spec: `deploy/compose.yaml`'s line 9 comment and `materials.md`'s networks row say "gateway only" for `egress`, which holds only without the `tunnel`, `tunnel-end`, and `ec2` profiles. That's for the Author and ops.

### Small runs (rule 4)

```
$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py
.............................................................            [100%]
61 passed in 1.04s
```

```
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this worktree (no `node_modules`). Every path this rework changes (`specs/`, `docs/`) is in `.prettierignore`, and ESLint, tsc, ruff, and shellcheck don't read Markdown.

### What's left

- rv-rework2-spec-022 (Opus, a worker that didn't write this) reviews this branch. It should also recheck rv-spec-022's three summarized nits, which were in neither brief. Then impl-022 starts from this branch's tip.
- On the page: this rework's question (the tunnel line "shown as built", recommended: leave the tunnel clause out). Also the answers T000 lists, for the Author to confirm or overturn.

## rework-spec-022 (the first rework, 34fc353a)

Rule 6's rework after rv-spec-022 (blocking: B-1 to B-3), based on `night/spec-022/spec-022` (0ebbad05). It fixed B-1 (Q95: `kill-switch-b2` as the seventh section), B-2 (the number rule, as the spec's own, with `guards.ts`'s number words and word-currency forms), B-3 (Q96: one slot; the case counts are gap lines), and C-1 to C-6 (`patch -p1` on an export; C9 and `content:check`; free talk `ready: false`; his words only as g); his recorded approval of the scripts; Golden Q&A 5's suggested sentence, Q97). It also renamed the new lifecycle section "How a change is made". Its small runs: `pytest evals/test_docs_links.py evals/test_repository_docs.py`, 61 passed; `make lint` stopped at "node_modules is missing".
