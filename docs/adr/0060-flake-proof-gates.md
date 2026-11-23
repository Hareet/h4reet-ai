# ADR 0060: Flake-proof gates: one visible retry of a failed test, a derived docs-only fast path, and a recorded release exception

Status: proposed, 2026-11-23 · Spec: 036 ([spec.md](../../specs/036-flake-proof-gates/spec.md) Q1, Q2, FR-001 to FR-013; [research.md](../../specs/036-flake-proof-gates/research.md) R-1 to R-4; [plan.md](../../specs/036-flake-proof-gates/plan.md)) · Amends [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md) (the clean-room gate) and spec 001's [releases contract](../../specs/001-cloud-elevation/contracts/releases-deployer.md) §2.1 · Accepted when the Author applies the gate's patch and merges `feat/036-flake-proof-gates`

## Context

The Author's words, 2026-11-23, verbatim:

> "This is too strict for us to get a release by? Should we ease our release policy so that we can get releases out the door?"

> "Yes, let's get those in there before we do c2. We are exhausted of this process and want to fix it now rather than in the future"

On 2026-11-23 three gate runs failed on tests the branches didn't touch: a cleanup race in the container probe, a
wall-clock bound in `dispatcher-forms.test.ts`, and the room's `twin-2d.test.ts` under load. One of those branches
changed five Markdown files. Each failure cost a 45-minute rerun, or a hand merge whose FAIL line made `release.py`
refuse every release until a later gated merge. Before this, `make test` also stopped at a failing workspace, so its
pytest suite never ran after a vitest failure.

## Decision

1. **One retry, of the test step alone, visible.** When `make test` fails, the gate reruns exactly the failing tests,
   once, in `make test`'s own container. It does so only when its output accounts for every failure as a named test:
   both of `make test`'s `test-part:` lines, every workspace's summary, counts equal to the named tests, and no pytest
   ERROR, vitest failed suite, or unhandled error. A test that passes on its rerun makes the step PASS, named
   `flaky:` in the step's line and in the summary line, which goes into the merge commit's message. Anything else is
   FAIL, as before, with the reason.
2. **`make test` runs both parts.** The workspaces' tests and pytest each run whatever the other exits, and each
   prints what it exited, so one run shows every failing test.
3. **A docs-only fast path, derived from what reads the files.** A branch whose every change is a plain Markdown file
   directly in `docs/merge-requests/`, `docs/infra/applies/`, or `docs/incidents/`, not a README, and named by no file
   of its tree outside the prose, skips test, evals, redteam, matrix-h, and image. Each says `docs-only: N files`, and
   the docs' links run on their own. The name check runs at each gate, on the branch's tree, so a test that later reads
   a note by name takes it out of the set.
4. **A recorded release exception.** `make release` refuses a gate line that doesn't report a pass, as before, unless
   the Author gives `ACCEPT_GATE=<main's SHA, in full>` and `REASON=…`. Then, for main's tip alone, and never for a
   DEGRADED line or a merge without a line, it releases with a warning. `release.json` keeps the line and the reason
   (`gate.accepted`). Every release's `release.json` now keeps its gate line (`gate.line`).

## Alternatives considered

| Option | What it costs | Why not |
|---|---|---|
| Retry the whole step, or the whole gate | 10 to 45 minutes a flake | The cost the intent names; a rerun of the failing tests alone is a minute |
| Retry silently, a pass as a pass | nothing to read | Breaks the intent's first constraint: a test that failed would be reported as passing without saying so |
| Several retries, or retries for every step | more passes | Hides real regressions in lint, evals, and the red team, whose failures aren't timing; the intent says one, for tests |
| A fixed list of docs paths | simpler | Goes stale: tests here read notes and patches by name, and new ones keep coming. The name check reads the branch's own tree instead |
| Skip the gate for docs-only branches | fastest | The lint, link, secret, arrival, and disclosure checks still matter for prose; the intent keeps them |
| A release that accepts any FAIL line | no extra step | Breaks "only gated code is released"; the exception is per merge, by the Author, with a reason kept in the release's record |

## Consequences

- **What a flake costs**: a rerun of its tests, about a minute, and its name in the merge's message. The three known
  ones are made deterministic on `fix/036-flaky-tests`; the next flake shows by name.
- **What the retry can't see**: a failure outside the tests that make test runs (the corpus check, a container that
  dies) isn't retried, and neither is a branch cut before this change, whose `make test` doesn't say what its parts
  exited. Such a branch gets the retry after it merges main.
- **The fast path's limit**: it can't see a reader that builds a note's name from parts. Research R-3 found none, and a
  test that does so would read a folder, which the derivation names.
- **The exception is the Author's hand**: it lets a failing line reach production, once, by name, with the reason in
  the release's own record, beside the merge's message that already shows the failure. It reverses the releases
  contract's "a merge by hand past a failing gate isn't releasable" for that case only.
- **Spec 031**: its gate patch (`--ci`, `--only`, `--shard`) and its `test` recipe are rebuilt on top of this one when
  it lands. The gate line keeps its format, and `flaky:` is a new optional segment.
- **Cost**: $0 in the cloud. **Data flow**: none new.
