# Notes: rework2-spec-023 (2026-11-14), rule 6's second rework after rv-rework-spec-023 (blocking)

Branch `night/rework2-spec-023/rework2-spec-023`, from `night/rework-spec-023/rework-spec-023` (563822ea). Opus 5.5, high effort. No code written. Files changed: `specs/023-resume-pdf-with-film-links/` (spec, plan, tasks, analysis, these notes) and `docs/merge-requests/human-patches/023.md`. `intent/023-*` unchanged: no finding touches it.

The review file wasn't readable from this container; the findings fixed are the brief's lines, every one (R1, I-1, N1 to N5, the nit). `analysis.md` maps each to where it's fixed.

## The first rework's notes, kept

- `evals/test_disclosure.py:408` holds V1's Trigger to end with spec 016's `, and following "Credits"` (`endswith`), and `apps/web/test/disclosure.test.ts:121` to contain it. So FR-011's sentence goes inside the Trigger cell, after `following the PDF link`, not at its end.
- `apps/web/test/content/author-pdf.test.ts` runs over fixtures, not the served file. In the "published" state the served file is checked by the build's own PDF checks and by case 10 (its links against the table), not by that test (FR-013, plan §3).

## What this rework checked in the tree

- R1: `tools/gates/disclosure_check.py` (`TICKED`, `Rows.read`) takes every backticked token of a row line as a disclosed name. No row has `github.com` in backticks today. FR-011's sentence now has the host as plain text; the three copies (spec FR-011, plan §7, T010) are byte-identical, with no backtick and no pipe.
- `following the PDF link` occurs in rows V1 and V4; `following the PDF link, and following "Credits"` occurs once, in V1. T010 says so.
- N1: `git ls-files films/kill-switch-b2` lists `media/kill-switch.gif` (blob 2eb9955c, 7,038,051 bytes, first in 8bc0788c). The earlier bullet saying it was untracked was wrong and is gone, as is analysis F3.
- The gate's own test and a read-only run, which T010 now names, pass on this tree as it is:

```
$ python3 -I -B -X pycache_prefix=/dev/null tools/gates/disclosure_check.py
disclosure-check: PASS, every outward thing the tree holds has its row
$ python3 -I -B -X pycache_prefix=/dev/null -m pytest -q -p no:cacheprovider tools/gates/test/test_disclosure_check.py
13 passed in 0.13s
```

## Small runs (rule 4)

Tests that read a file this rework changes: `evals/docs_links.py` reads `specs/**` and `docs/**`.

```
$ python3 -I evals/docs_links.py
PASS  every relative link resolves: 2401 links in 384 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2401 relative links in 384 files
$ python3 -I -B -X pycache_prefix=/dev/null -m pytest -q -p no:cacheprovider evals/test_docs_links.py
44 passed in 0.90s
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this worktree: `node_modules` is missing (in the root and in `apps/web`), and `make setup` would fetch from the network, which this task doesn't need. Every path changed here is under `specs/` or `docs/`, both in `.prettierignore`, and ESLint, tsc, ruff, and shellcheck don't read Markdown, so the lint has nothing here to check.

## Questions and refusals

No new question: every finding was a fix, not a choice. Q25 to Q31 and Q98 stay on the page as they were, each with its recommended answer taken provisionally under his order of 2026-11-13. No hook or bash-gate refusal hit, so nothing under Interruptions.

## What's left

- A reviewer that didn't write this reviews the branch; then impl-023 starts from impl-022's tip with this branch merged first.
- For the Author on the page: Q25 to Q31 (this spec's Q1, Q2, Q4 to Q8) and Q98, each with its recommended answer taken provisionally; the approval entry and the `git mv` (`human-patches/023.md`) after the repository is public and each link has been clicked.
