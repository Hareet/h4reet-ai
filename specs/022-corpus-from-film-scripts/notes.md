# Notes: rework-spec-022 (2026-11-14)

Rule 6's rework of spec 022 after the Opus review rv-spec-022 (Verdict: blocking), on `night/rework-spec-022/rework-spec-022`, based on `night/spec-022/spec-022` (0ebbad05). No code. Files changed: `intent/022-corpus-from-film-scripts.md`, `specs/022-corpus-from-film-scripts/` (spec, plan, tasks, analysis, these notes), `docs/merge-requests/human-patches/022.md`.

## What was done

- **B-1 (Q95)**: `films/kill-switch-b2/script.txt` is the seventh section: spec Q1, Q2, FR-006, SC-003; plan §2 (its own row), §3 R1 (sentence split, sources from `materials.md`) and R2; tasks T001, T003, T004, T007; analysis (the old A7 resolved by the films' note, line 10). Its "five dollars" and "three fifty" are left out, the daily figure is `site.kill_switch_daily`, and "And only Hareet runs the final gate." is carried only as `08`'s "only I merge".
- **B-2**: FR-003, Q3 and R4 state the no-number rule as the spec's own choice, quoting `corpus/README.md`'s actual rule ("every number the twin says must appear in a corpus file or a filled slot"). Exempt spans: claim tags, dates, paths, URLs, slot references, and R5's quotes. R4 reads `guards.ts`'s G1 number words and its word-currency forms (`AMOUNT_WORDS_PY_SOURCE`, `EXTRA_PATTERN`) as well as `check_corpus.py`'s `CURRENCY`, with parity tests. "Qwen3" is dropped (plan §2 leaves the local model's name out). T001 adds "ten cents" and "fifteen containers", and "millionth of a dollar". The human patch's citation is fixed. Found on the way: the cost meter's "whole micro-dollars" and the kill switch's "millionth of a dollar" are word-currency forms, so they're left out (FR-004, plan §2).
- **B-3 (Q96)**: one slot, `site.prod_containers` (fifteen, which I counted from prod's services in `deploy/compose.yaml` under `COMPOSE_PROFILES=gpu`). The case and red-team counts are gap lines: Q4, FR-003, FR-007, plan §2, T005, the human patch.
- **C-1**: `patch -p1 --dry-run` then `patch -p1` on a fresh `git archive` export, in US1-2, SC-002, the tasks header, T008, and the human patch.
- **C-2**: C9's forbidden list (the resume's items and header, its PDF, the narration) is in FR-009, plan §6, T009, and the human patch. T009's small tests are `npm run content:check -w apps/web` and `apps/web/test/content/narration.test.ts`.
- **C-3**: `08` is read by free talk alone, and free talk is `ready: false`. This is in US2, FR-013, the cost estimate, plan §7, and the human patch.
- **C-4**: his words are g) "hareet-ai corpus from film scripts" only. "Corpus changes are proposals …" is attributed to the orders file and the night's rule 2 in the intent, spec, plan, and human patch.
- **C-5**: his approval of the scripts is cited at `docs/merge-requests/2026-11-11-feat-015-explainer-films.md:4` (and line 10 for each `script.txt`). Lines changed after it (lines 41 to 48) are marked per row: Q2, FR-006, T004, T007.
- **C-6 (Q97)**: Golden Q&A 5 gets a suggested second sentence in his F3 words, quoted exactly ("this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training", `[A 2026-11-09]`). His sentence stays as it is, which `twin-pack.ts`'s `PRIVACY_SPANS` also requires: Q6, FR-010, plan §2, T006.
- **Other nits found and fixed**: the currency rule is `corpus/README.md`'s rule 2, not 3. The comparison cuts' quote is now `films/README.md:17`'s actual words. T012 says "the supervisor names it". The new lifecycle section is "How a change is made", since `08` already has his "How it's built" (analysis A6).
- `/speckit-analyze` re-run: `analysis.md`. Critical 0; coverage 100%; A6 fixed; A7 (`[P]` before publication) is on the page with its recommended answer.

## Small runs (rule 4)

Tests that read files this rework changes (`evals/docs_links.py` checks every link in `specs/**`; `evals/test_repository_docs.py` reads `intent`):

```
$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py
.............................................................            [100%]
61 passed in 0.92s
```

```
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this worktree (no `node_modules`). Every path this rework changes (`specs/`, `intent/`, `docs/`) is in `.prettierignore`, and ESLint, tsc, ruff and shellcheck don't read Markdown, so the lint has nothing here to check.

## What's left

- **Not fixed by name**: rv-spec-022's N-1 to N-5 and its three summarized nits. Its review file wasn't readable here (see the page's Interruptions). rv-rework-spec-022 should recheck them.
- rv-rework-spec-022 (Opus, a worker that didn't write this) reviews this branch, then impl-022 starts from its tip.
- On the page: the new `[P]` question (analysis A7), and Q19 to Q24 for the Author to confirm or overturn.
