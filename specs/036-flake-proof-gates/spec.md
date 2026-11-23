# Feature Specification: Flake-Proof Gates

**Feature Branch**: `feat/036-flake-proof-gates`, from `main`'s `42019d3d`.

**Created**: 2026-11-23

**Status**: Draft, clarified the same day. Specified, clarified, planned, tasked, and built in one session from the intent [`intent.md`](intent.md), accepted 2026-11-23. Both of the intent's open questions take its recommended answers (below); each is the Author's to overturn.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md) (1.1.0); `CLAUDE.md`; [ADR 0017](../../docs/adr/0017-clean-room-gate-and-human-only-gate-paths.md) (the clean-room gate); `tools/gates/gate` and its tests at `42019d3d`; `deploy/scripts/release.py`; spec 001's [releases contract](../001-cloud-elevation/contracts/releases-deployer.md) §1 and §2; the Makefile's `test` target; and [research.md](research.md), which holds what vitest 5.0.3 and pytest 9.1.1 print, and the fast path's derivation.

## Source: The Author's Words

From the intent, 2026-11-23, verbatim:

> "This is too strict for us to get a release by? Should we ease our release policy so that we can get releases out the door?"

> "Yes, let's get those in there before we do c2. We are exhausted of this process and want to fix it now rather than in the future"

The intent's constraints, verbatim: "nothing that failed is ever reported as passing without saying so; only one retry, and only for the test step; the fast path's file set is derived from what the tests and builds actually read, never guessed." And: "The rule stands: only gated code is released."

**Readings, beside his words, never in their place.**

- "ease our release policy" is read as one recorded exception, not a looser default: the release still refuses a failing gate line unless he names the merge and a reason, and the reason is kept with the release.
- The three flaky tests themselves are another branch's (`fix/036-flaky-tests`); this spec is the gate's, the release's, and `make test`'s part.

## Clarifications

### Session 2026-11-23, the intent's open questions, taken at their recommended answers

- Q1: The fast path's exact file set? → **The recommended answer**: start from `docs/merge-requests/`, `docs/infra/applies/` and `docs/incidents/`, and add a path only when no test, build or eval reads it. As derived (research.md R-3): a Markdown file directly in one of those three folders, not a README, that no file of the tree outside the prose names. The name check runs at each gate, on the branch's own tree, so a test added later that reads a note by name takes that note out of the set without a change to the gate.
- Q2: Where is the release's exception recorded? → **The recommended answer**: in the release's own record, `release.json`, beside its gate line: it now always carries `gate.line`, and `gate.accepted` (the merge and the reason) when the exception was used.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A flake costs a minute, and stays visible (Priority: P1)

The Author gates a branch. One of the known flaky tests fails in the test step, as on 2026-11-23 at 04:28Z and 08:06Z. The gate reruns that test once, in the same container, and it passes: the test step is PASS, its line and the summary line say `flaky:` with the test's name, and the merge goes ahead. Had it failed again, or had the failure been anything the gate can't name as a test, the step is FAIL as today.

**Independent Test**: the gate's tests drive a stand-in docker whose `make test` prints real vitest and pytest failure output; the retry's commands, their environment, and the verdict are asserted.

**Acceptance Scenarios**:

1. **Given** `make test` fails with one vitest test failing in `services/gateway`, **When** the gate reruns it and it passes, **Then** the test step is PASS with `flaky: services/gateway/test/integration/dispatcher-forms.test.ts > …`, the summary line ends `; flaky: dispatcher-forms.test.ts > …`, and the gate prints the merge command.
2. **Given** the same, **When** the rerun fails, **Then** the step is FAIL, `failing: test FAIL` is in the summary, and no merge command is printed.
3. **Given** a pytest `ERROR`, a vitest failed suite, an unhandled error, a workspace that didn't reach its summary, or a `make test` from before this spec, **When** the step fails, **Then** nothing is rerun and the step is FAIL, with a note naming why.

### User Story 2 - A docs-only branch skips the long suites (Priority: P1)

The Author gates `ops/apply-records-2026-11-23`, five new files under `docs/infra/applies/`. The gate sees that every changed path is in the fast path's set, reports test, evals, redteam, matrix-h, and image as `SKIP docs-only: 5 files`, runs the docs' link check in evals' place, and runs every other step as today.

**Independent Test**: the gate's tests commit docs-only and mixed branches and assert which steps run.

**Acceptance Scenarios**:

1. **Given** a branch that adds `docs/infra/applies/2026-11-23-prod.md`, **When** the gate runs, **Then** test, evals, redteam, matrix-h, and image are SKIP `docs-only: 1 file`, a `links` step runs `evals/docs_links.py` in the container, and lint, validate-config, credits, the content build and check, and every host step run.
2. **Given** a branch that also changes one file outside the set, or changes a note a test names, **When** the gate runs, **Then** every step runs as today, and the gate's line says which path kept the fast path off.

### User Story 3 - A recorded release past a known flake (Priority: P2)

A merge's gate line reports a failure that the Author knows is a flake. The release refuses it, as today. He runs `make release … ACCEPT_GATE=<main's merge SHA> REASON="<why>"`, and the release goes ahead, saying so, with the line and the reason in `release.json`.

**Acceptance Scenarios**:

1. **Given** main's tip merge with `1 FAIL; failing: test FAIL`, **When** the release runs without the exception, **Then** it refuses, as today.
2. **Given** the same, **When** it runs with `--accept-gate <that merge's SHA> --reason "dispatcher-forms flake, fixed by fix/036-flaky-tests"`, **Then** it releases, prints a warning naming the line and the reason, and `release.json`'s `gate` holds the line, the merge, and the reason.
3. **Given** the exception names another commit, or an empty reason, or the line is DEGRADED or has a PENDING step, or the merge has no gate line, **Then** the release refuses.
4. **Given** a passing line with a `flaky:` segment, **When** the release runs, **Then** it releases, whatever the flaky test's name says.

### Edge Cases

- **A test fails on both runs**: FAIL, with a note naming the rerun that failed.
- **A failure the parse can't name**: a pytest `ERROR` (setup, teardown, collection), a part exiting other than 0 or 1 (pytest interrupted, an internal error, no tests; npm that couldn't run a workspace), a vitest "Failed Suites" (a hook or an import) or "Unhandled Errors" section, an `Errors` count, a failing workspace without its summary, counts that don't match the named tests, a file that isn't in exactly one failing workspace, a node id that can't be read for certain, or a failing workspace whose `test` script isn't `vitest run`: no retry.
- **A workspace that exits 1 and counts no failed test** (a coverage threshold, say), beside another workspace's flake: no retry. npm's one exit for every workspace couldn't tell them apart, so `make test` says what each workspace exited.
- **A `make test` from before this spec** (no `test-part:` lines): no retry, with a note saying to merge main into the branch, since its pytest never ran after a workspace's failure.
- **A rerun that runs no test, or another test**: the rerun's own counts must be exactly the named tests passed and none failed, or the step stays FAIL.
- **stdout and stderr interleaved**: vitest prints its failures on stderr and its summary on stdout, which docker forwards separately, so a FAIL line is placed by its file, never by where it lands in the output.
- **A docs-only branch with a link, an executable file, or a type change**: not docs-only.
- **A deleted note**: in the set when its name is in no code; a test that names it keeps the fast path off.
- **A branch with no change**: not docs-only (the fast path needs at least one file).
- **`--host`**: no container phase as before; the fast path still skips image.
- **The `flaky:` segment in the release's check**: test names are never read as a step's status, so a name holding "DEGRADED" or "PENDING" can't refuse a passing line, and a `;` in a name is written as `,`.

## Requirements *(mandatory)*

### Functional Requirements

**The test step's one retry** (`tools/gates/gate`, human-only: a patch for the Author's hand)

- **FR-001**: WHEN the test step's `make test` exits non-zero, THE gate SHALL read its output for the failing tests: pytest's `FAILED <node id>` lines in its short test summary, and vitest's `FAIL  <file> > <name>` lines in "Failed Tests" sections, each put in the one failing workspace whose folder holds its file.
- **FR-002**: THE gate SHALL retry only when the output accounts for every failure: `make test` printed a `test-part: workspace <folder> exited N` line for each workspace and `test-part: pytest exited N` last, each 0 or 1 and not all 0; each workspace that exited 1 reached its summary, which counts at least one failed test, and its counts of failed tests and failed files equal the FAIL lines put there, pytest's failed count equals its FAILED lines, and there is no pytest ERROR, no vitest failed suite, unhandled error, or `Errors` count; and each test maps to a command: its failing workspace's `test` script is `vitest run`, the branch's Makefile's `PYTEST_ARGS` is plain words, and each node id reads unambiguously. Otherwise the step is FAIL as today, with a note `no retry: <why>`.
- **FR-003**: THE retry SHALL rerun exactly the failing tests, once: per failing workspace, `npm test -w <workspace> -- <files> -t '^(?:<names>)$'`, the names escaped; and `pytest <PYTEST_ARGS> <node ids>`; each in the same devcontainer image, on the same installed copy at `/work`, with `--network none`, and the user, capabilities, and mounts of `make test`'s own run.
- **FR-004**: WHEN every rerun exits 0 and reports exactly its tests passed and none failed, THE step SHALL be PASS with the note `flaky: <tests> (…)`, and the summary line SHALL carry `; flaky: <tests>`; otherwise the step SHALL be FAIL as today, with a note naming the rerun that failed.
- **FR-005**: THE gate SHALL retry at most once, only the test step, and print both runs in its output.

**The docs-only fast path** (`tools/gates/gate`)

- **FR-006**: WHEN the branch changes at least one path against its merge base with `refs/heads/main`, and every changed path (`git diff --raw --no-renames`) is a regular file (mode 100644) added, changed, or deleted directly in `docs/merge-requests/`, `docs/infra/applies/`, or `docs/incidents/`, named `<letters, digits, . _ ->.md` and not README.md, AND no file of the export outside `specs/`, `intent/`, and the Markdown under `docs/` holds that file's name without `.md` (binary files aside), AND the export has `evals/docs_links.py`, THE gate SHALL report test, evals, redteam, matrix-h, and image as `SKIP docs-only: N files`, and run a `links` step, `evals/docs_links.py` in the container with `--network none`, in evals' place.
- **FR-007**: Every other step SHALL run as today, and the gate SHALL print the fast path's decision: the files when it applies, the first path that keeps it off when it doesn't.

**`make test`** (the Makefile, on the branch)

- **FR-008**: `make test` SHALL run each workspace's tests by its folder (`npm test -w <folder> --if-present`, as `npm test --workspaces --if-present` runs them) and then pytest, each whatever the others exit; print `test-part: workspace <folder> exited N` after each workspace and `test-part: pytest exited N` last; and exit non-zero when any part did.

**The release** (`deploy/scripts/release.py`, the Makefile's `release` target)

- **FR-009**: THE release SHALL accept a gate line that reports 0 FAIL and 0 PENDING, is not DEGRADED, and names no failing step, with or without a `flaky:` segment, whose text it SHALL NOT read as a status; it SHALL refuse any `failing:` segment, as today.
- **FR-010**: WHERE `--accept-gate <SHA> --reason <text>` is given, THE release SHALL go ahead past a gate line that doesn't report a pass only when SHA is `refs/heads/main`'s commit, written in full; that commit is a merge carrying the gate's line for its second parent; the line isn't DEGRADED and has no PENDING step (a run only the Author makes, which no reason replaces); and the reason has at least one character that isn't a space and no control character. It SHALL print a warning naming the line and the reason. Without the exception, a failing line SHALL be refused, as today.
- **FR-011**: `release.json` SHALL carry `gate.line`, the merge's gate line, and, when the exception was used, `gate.accepted` with `merge` and `reason`.
- **FR-012**: `make release` SHALL pass `ACCEPT_GATE=` and `REASON=` through as `--accept-gate` and `--reason`, from the command line only, as its other values; `ACCEPT_GATE` joins `LITERAL_VARS`.

**Documentation**

- **FR-013**: The local gate's runbook, the deploy runbook, `docs/how-we-build/lifecycle.md`, spec 001's releases contract §1 and §2, and an ADR SHALL describe the retry, the fast path, and the exception.

### Key Entities

- **The retry plan**: per failing workspace, its `(file, name)` pairs; pytest's node ids and the Makefile's `PYTEST_ARGS`.
- **`make test`'s part lines**: `test-part: workspace <folder> exited N`, one for each workspace in the Makefile's `WORKSPACE_DIRS`, then `test-part: pytest exited N`.
- **The gate line**: `gate: <sha> (<ref>) by tools/gates/gate at <sha12>: N PASS, N SKIP, N WARN, N PLANNED, N PENDING, N FAIL[; failing: …][; flaky: …][; DEGRADED (--host): …]`. `flaky:` is new; the rest is unchanged, so spec 031's `tools/ci/summary.py` and the release read it as before.
- **`release.json`'s `gate`**: `{"line": …}` or `{"line": …, "accepted": {"merge": <SHA>, "reason": …}}`.

## Success Criteria *(mandatory)*

- **SC-001**: A failure that passes on its rerun costs the rerun of the failing tests, not a gate rerun: the test step is PASS, named flaky in its line and the summary line.
- **SC-002**: No failure that repeats on its rerun, or that the gate can't name as a test, is ever reported as passing: each of the edge cases above has a test that holds the step at FAIL.
- **SC-003**: A branch that changes only apply records, incident notes, or merge-request notes no code names runs neither `make test`, `make evals`, the red team, the matrix, nor the image builds.
- **SC-004**: A release refuses a failing line by default; the exception works only for main's tip, with a reason, and leaves both in `release.json`.

## Cost, telemetry, degraded mode, data flow

- **Cost**: $0 in the cloud. The gate's time drops; a retry adds one container start per failing workspace, and one for pytest.
- **Telemetry and dashboards**: none. The gate and the release are the Author's tools, not runtime endpoints; their record is the gate line in the merge commit and `release.json`.
- **Degraded mode**: none at runtime. A retry that can't run (docker gone between runs) is a FAIL, as the step was.
- **Data flow**: none new. Nothing leaves the Author's machine; the container keeps `--network none`. No `docs/data-flow-disclosure.md` row.

## Assumptions

- **The retry runs the test commands directly, not through make.** `npm test -w <workspace>` runs the workspace's own `test` script, as `make test` did, and pytest gets the Makefile's own `PYTEST_ARGS`. The differences from the first run are make's own variables (`MAKEFLAGS`, `MAKELEVEL`) and the `corpus-check` prerequisite, which passed already.
- **Branches cut before this spec get no retry** until they merge main: their `make test` stops before pytest when a workspace fails, so a rerun of the failing tests alone could pass a step whose pytest never ran.
- **The fast path's name check is conservative.** It matches a changed file's name without `.md` anywhere in the tree's code and data, comments included, so a note that a comment cites runs the whole suite. It reads no file with a NUL byte in its first 8 KiB (images, models, films).
- **Deviation, named (constitution, Development Workflow §5, "CI requires … passing tests"; spec 001's releases contract §2.1, "a merge by hand past a failing gate isn't releasable")**: the release's exception lets a failing gate line through, by the Author's hand only, with the merge and the reason recorded. It reverses that contract line for the case he names, so [ADR 0060](../../docs/adr/0060-flake-proof-gates.md) records it. The retry is not a deviation: a test that passed only on its rerun is reported as flaky, never as a plain pass.
- **Spec 031** (`feat/031-ci`, not merged) patches the same gate and the same `test` recipe. Its patch is rebuilt on top of this one when it lands; the gate line's format is unchanged but for the new optional segment.
