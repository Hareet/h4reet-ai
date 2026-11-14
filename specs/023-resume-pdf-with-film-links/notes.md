# Notes: rework-spec-023 (2026-11-14), rule 6's rework after rv-spec-023 (blocking)

Branch `night/rework-spec-023/rework-spec-023`, from `night/spec-023/spec-023` (e450118b). Opus 5.5, high effort. No code written. Files changed: `specs/023-resume-pdf-with-film-links/` (spec, plan, tasks, analysis, these notes) and `docs/merge-requests/human-patches/023.md`. `intent/023-*` unchanged: nothing in rv-spec-023's findings touches it.

The review file (`/night/.io/rv-spec-023/out/review.md`) wasn't readable from this container; the findings fixed are the brief's lines, every one of them, nits included. The table in `analysis.md` maps each to where it's fixed.

## What the rework found in the tree, beside the review

- `evals/test_disclosure.py:408` holds V1's Trigger to end with spec 016's `, and following "Credits"` (`endswith`), and `apps/web/test/disclosure.test.ts:121` to contain it. So B3's sentence goes inside the Trigger cell, after `following the PDF link`, not at its end (FR-011 gives the text and the place).
- `apps/web/test/content/author-pdf.test.ts` runs over fixtures, not the served file. In the "published" state the served file is checked by the build's own PDF checks and by the new case 10 (its links against the table), not by that test (FR-013, plan §3).
- `films/kill-switch-b2/README.md:8` shows `media/kill-switch.gif`, which isn't tracked: a broken image on the page the PDF's third link reaches. Not this spec's to fix; analysis F3 carries it to the stack note.
- This run's own finding F1 (case 9 would fail under route (b)) is fixed: case 9 runs before publication only.

## Small runs (rule 4)

Tests that read a file this rework changes: `evals/docs_links.py` reads `specs/**` and `docs/**`.

```
$ python3 -I evals/docs_links.py
PASS  every relative link resolves: 2401 links in 383 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2401 relative links in 383 files
$ python3 -I -m pytest -q -p no:cacheprovider evals/test_docs_links.py
44 passed in 0.88s
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this worktree (no `node_modules`; `make setup` would fetch from the network, which this task doesn't need). Every path changed here is under `specs/` or `docs/`, both in `.prettierignore` (lines 39 and 43), and ESLint, tsc, ruff, and shellcheck don't read Markdown, so the lint has nothing here to check. No test file reads `specs/023-*` or `human-patches/023.md` by name.

## Questions and refusals

No new question: Q98 is answered (recommended, by his order) and written in (spec Clarifications, plan §6, T009). No hook or bash-gate refusal hit.

## What's left

- rv-rework-spec-023 (a worker that didn't write this) reviews this branch; then impl-023 starts from impl-022's tip with this branch merged first.
- For the Author on the page: Q25 to Q31 (this spec's Q1 to Q8) and Q98, each with its recommended answer taken; the approval entry and the `git mv` (human-patches/023.md) after the repository is public and each link has been clicked.
