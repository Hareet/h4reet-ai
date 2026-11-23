# Tasks: Flake-Proof Gates

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md). Test-first: each test task comes before
its code and fails on `main`'s code. `[H]` marks the gate's part, a patch for the Author's hand.

## Phase 1: The spec's documents

- [x] T001 The intent, copied unchanged; spec.md, research.md, plan.md, this file.

## Phase 2: `make test` and the release (on the branch)

- [x] T002 RED `scripts/test_make_test_parts.py`: the real Makefile's `make test`, with stand-ins for npm and pytest,
  runs every part after a failing workspace, prints `test-part: workspace <folder> exited N` for each workspace and
  `test-part: pytest exited N` last, and exits non-zero when any part did; 0 when none (FR-008).
- [x] T003 RED `deploy/scripts/test_release_accept_gate.py`: a passing line with a `flaky:` segment releases, whatever
  the names hold; `failing:` beside it refuses; the exception releases only for main's tip, with a reason, never a
  DEGRADED line, a merge without a line, or a commit that isn't a merge; `release.json` holds `gate.line` and, with
  the exception, `gate.accepted`; `--accept-gate` and `--reason` come together; `make release` passes `ACCEPT_GATE=`
  and `REASON=` from the command line (FR-009 to FR-012).
- [x] T004 GREEN the Makefile's `test` recipe (T002). Revised the same day from one `npm test --workspaces` line to one
  `npm test -w <folder>` a workspace, since npm's one exit can't say which workspace failed (research.md R-4).
- [x] T005 GREEN release.py's `gate_passes`, `check_gate`, the record, the flags; the Makefile's `release` and
  `LITERAL_VARS` (T003).

## Phase 3: The gate `[H]`

- [x] T006 [H] RED, in `tools/gates/test/test_gate.py`: the stand-in docker answers the reruns; tests for the retry
  (a vitest flake, a pytest flake, both, a rerun that fails, each no-retry case of FR-002, the commands and their
  container, the summary's `flaky:` segment) and for the fast path (each of the three folders, a deletion, a mixed
  branch, a README, a subfolder, a link, a note the tree's code names, a tree without `evals/docs_links.py`, the
  `links` step's failure, an empty branch). Run against `main`'s gate: they fail.
- [x] T007 [H] GREEN the gate: `retry_plan`, `vitest_failures`, `pytest_failures`, `retry_test`, the reruns' checks,
  `Step.flaky`, `summary_line`; `docs_only`, `names_in_tree`, the `links` step, the SKIPs; the merge base before the
  container phase.
- [x] T008 [H] The patch, `docs/merge-requests/human-patches/2026-11-23-036-gate.patch`, from plain copies
  (`git show refs/heads/main:<path>`, `diff -u` with `a/` and `b/` labels, a preamble); `patch -p1 --dry-run`, then
  `patch -p1`, on a fresh `git archive refs/heads/main` export; `tools/gates/test/` whole there; its SHA-256.

## Phase 4: Documents and the note

- [x] T009 `docs/runbooks/local-gate.md`, `docs/runbooks/deploy.md`, `docs/how-we-build/lifecycle.md`, spec 001's
  releases contract §1 and §2 (FR-013).
- [x] T010 ADR 0060 and the index.
- [ ] T011 The merge-request note: what changed, the patch and its SHA-256, the RED and GREEN runs, `make -f Makefile
  lint`, the touched suites, spec 031's rebuild, an empty Review.

## Coverage

| Requirement | Tasks |
|---|---|
| FR-001 to FR-005 | T006, T007 |
| FR-006, FR-007 | T006, T007 |
| FR-008 | T002, T004 |
| FR-009 to FR-012 | T003, T005 |
| FR-013 | T009, T010 |
| SC-001, SC-002 | T006 |
| SC-003 | T006 |
| SC-004 | T003 |
