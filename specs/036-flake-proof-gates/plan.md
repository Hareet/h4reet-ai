# Implementation Plan: Flake-Proof Gates

**Branch**: `feat/036-flake-proof-gates` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

## Summary

Three changes, each test-first: the gate retries a failed test step once, by rerunning exactly the tests that failed,
and says `flaky:` when they pass; a branch that changes only notes and records no code names skips the long suites;
and the release takes a failing gate line only through a named, recorded exception. `make test` changes so that one
run shows every failing test and what each part exited.

## Technical Context

Python 3.12 (the gate, the release, their tests, standard library and PyYAML only); GNU make; vitest 5.0.3 and
pytest 9.1.1 in the devcontainer image. The gate's code is human-only (`tools/gates/**`), so its change and its tests
are a patch for the Author's hand, built from plain copies of `refs/heads/main`'s files and verified on a fresh
`git archive` export. Everything else changes on the branch.

## Constitution Check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | no | Nothing leaves the Author's machine; the retry's containers keep `--network none`. No disclosure row |
| II. Production-grade | yes | Tests for every FR, RED before GREEN; the gate's tests drive real vitest and pytest output (research R-1, R-2). No runtime endpoint, so no span or panel; the record is the gate line and `release.json` |
| III. Intent → spec → code, humans merge | yes | Accepted intent, then spec, research, plan, and tasks committed before code. The gate's part is a patch the Author applies; he merges |
| IV. Least privilege | yes | `tools/gates/**` is changed only by the Author's patch, built from plain copies, never applied by the session. The exception is the Author's, in his terminal: `make release` stays `AUTHOR_ONLY`, and the exception needs main's tip by its full SHA and a reason. No permission, hook, or sandbox setting changes |
| V. Cost | yes | $0 in the cloud; the gate's time drops |
| VI. Build in public, including failures | yes | A flaky test is named in the merge commit's own message, and an accepted failing line in the release's record; ADR 0060 records the decision |
| VII, VIII | no | Nothing about the Author's work or the twin |
| Quality gates (Development Workflow §5, "passing tests") | yes, a named deviation | The retry reports a test that passed only on its rerun as flaky, never as a plain pass. The release's exception releases past a failing line by the Author's hand, with the reason recorded: spec.md's Assumptions name it, and ADR 0060 records it, since it reverses the releases contract's "a merge by hand past a failing gate isn't releasable" for that case |

## Design

### 1. The retry (`tools/gates/gate`)

- `container_phase` runs `make test` as today. When the step is FAIL, `retry_test` reads the output:
  `retry_plan` finds the two `test-part:` lines (FR-008), then the vitest failures before the first and the pytest
  failures between them; `vitest_failures` puts each FAIL line in the one failing workspace whose folder holds its
  file (research R-1: the FAIL lines are on stderr, so their place in the output proves nothing); `pytest_failures`
  reads the short test summary; each checks its counts against what it named (FR-002).
- The reruns, through the same `container()` helper `make test` used: `npm test -w <folder> -- <files> -t
  '^(?:<names>)$'` per failing workspace, and `pytest <PYTEST_ARGS> <ids>`. Each rerun's own output must show exactly
  its tests passed and none failed (`vitest_rerun_problem`, `pytest_rerun_problem`).
- `Step` gains `flaky` (the short names); `summary_line` adds `; flaky: …` after `failing:` and before `DEGRADED`, so
  the line's head and the segments release.py and spec 031 read keep their place. A `;` in a name is written `,`.

### 2. The fast path (`tools/gates/gate`)

- `run_gate` computes the merge base and the changed paths before the container phase (they were computed after it,
  with no side effect), and `docs_only` decides: the paths from `git diff --raw --no-renames -z`, each in the set
  (spec FR-006, research R-3), then `names_in_tree` over the export.
- `container_phase` reports test, evals, redteam, and matrix-h as SKIP with `docs-only: N files`, and runs `links`
  (the export's `evals/docs_links.py`, `--network none`) where evals would run; the host phase reports image SKIP.

### 3. `make test` (the Makefile)

One recipe line: each part in a subshell with `set -x`, its exit kept, `test-part: workspaces exited N` and
`test-part: pytest exited N` printed, and the line fails when either part did. `NPM_WS_SH`, spec 031's helper with the
same definition, is the shell form of `NPM_WS`.

### 4. The release (`deploy/scripts/release.py`, the Makefile)

- `gate_passes(line)` reads the line's head and segments: no `failing:` segment, no DEGRADED, `0 FAIL` and (when
  counted) `0 PENDING` in the head; a `flaky:` segment's text is not read.
- `check_gate(runner, commit, accept, reason)` returns `{"line": …}`, plus `accepted` when the exception was used, and
  refuses as before otherwise; `released` puts it in `release.json` as `gate`.
- `--accept-gate` (40 hex) and `--reason` in `main`, both or neither; `Options.accept_gate` and `Options.reason`.
- `make release`: `ACCEPT_GATE=` joins `LITERAL_VARS`; `--accept-gate "$$ACCEPT_GATE" --reason "$$REASON"` when
  `ACCEPT_GATE` is on the command line, the reason empty unless `REASON` is too.

## Files

| File | Change |
|---|---|
| `tools/gates/gate`, `tools/gates/test/test_gate.py` | The patch: `docs/merge-requests/human-patches/2026-11-23-036-gate.patch` |
| `Makefile` | `test`'s recipe, `NPM_WS_SH`; `release`'s two values; `LITERAL_VARS` |
| `scripts/test_make_test_parts.py` | New: `make test` runs both parts and says what each exited |
| `deploy/scripts/release.py` | `gate_passes`, `check_gate`'s exception and record, the two flags |
| `deploy/scripts/test_release_accept_gate.py` | New: the flaky line, the exception, the record, the make target |
| `docs/runbooks/local-gate.md`, `docs/runbooks/deploy.md`, `docs/how-we-build/lifecycle.md` | The retry, the fast path, the exception |
| `specs/001-cloud-elevation/contracts/releases-deployer.md` | §1 `release.json`'s `gate`; §2 step 1's exception |
| `docs/adr/0060-flake-proof-gates.md`, `docs/adr/README.md` | The decision |
| `docs/merge-requests/2026-11-23-feat-036-flake-proof-gates.md` | The note |

No existing test file changes.

## Order

1. The spec's documents (this commit).
2. RED: `scripts/test_make_test_parts.py` and `deploy/scripts/test_release_accept_gate.py`, failing on `main`'s code.
3. GREEN: the Makefile and release.py.
4. The gate patch, built in `$TMPDIR` from plain copies: its new tests first, run against main's gate (RED, recorded
   in the note), then the gate's code (GREEN), then `diff -u`; verified with `patch -p1 --dry-run` and `patch -p1` on a
   fresh `git archive refs/heads/main` export, where `tools/gates/test/` runs whole.
5. Docs and ADR 0060; the merge-request note with the patch's SHA-256; `make -f Makefile lint` and the touched suites.

## Risks

- **A false pass**: the retry passes a step whose failure was something else. Held by FR-002's accounting (both
  `test-part:` lines; summaries for every workspace; counts equal to the named tests; no ERROR, failed suite, or
  unhandled error) and by the rerun's own counts. Each no-retry case has a test.
- **A retry that never fires**: the parse rejects real output. Held by building the tests' outputs from real vitest
  5.0.3 and pytest 9.1.1 runs (research R-1, R-2), colours included, and by naming every reason in the step's note,
  so a real miss is visible.
- **A stale set**: a test that reads a note by a name the gate doesn't know. Held by the name check over the branch's
  own tree at each gate; what it can't see is a reader that builds a note's name from parts, which research R-3 found
  none of.
- **Spec 031**: its patch and its `test` recipe change the same places; rebuilt on top of this one when it lands.

## Proof

The gate's tests (the patch's new ones, then `tools/gates/test/` whole, on the patched export), the two new test
files, `scripts/test_makefile.py`, the release's suites, and `make -f Makefile lint`, pasted in the note. The Author's
proof is his next gate: a flake's step line, or `docs-only` on a notes branch.
