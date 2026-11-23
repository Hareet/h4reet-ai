# Intent: Flake-proof gates

Author: the Author. Status: accepted (2026-11-23, "Yes, let's get those in there before we do c2"). Created: 2026-11-23.

## Problem

In the Author's words (2026-11-23), after a docs-only branch failed its gate twice on unrelated tests: "This is too
strict for us to get a release by? Should we ease our release policy so that we can get releases out the door?" and
"Yes, let's get those in there before we do c2. We are exhausted of this process and want to fix it now rather than in
the future".

The evidence, all from the Author's gate runs:

- **2026-11-23 ~04:28Z, `stack/2026-11-23`:** `deploy/night-shift/tests/test_container_probe.py::test_it_removes_its_containers_and_networks`
  failed (`assert not ['h4-cprobe-egress-cojyrk']`). The stack touched nothing in `deploy/night-shift/`, and the
  file passes alone.
- **08:06Z, `ops/apply-records-2026-11-23`** (five files under `docs/infra/applies/`): `services/gateway/test/integration/dispatcher-forms.test.ts:191`
  failed with `expected 51.50356800000009 to be less than 50`, a wall-clock bound.
- **08:21Z, the same branch's rerun:** `apps/web/test/room/twin-2d.test.ts` failed, two tests
  (`expected undefined to be 'data:image/png;base64,…'`), the room test already known to fail under load and pass
  alone.

Each failure meant a 45-minute rerun, or a hand merge whose FAIL line makes `release.py` refuse the next release
until a later gated merge. A branch that only adds Markdown runs the whole suite.

## Proposed outcome

- **The known flaky tests are deterministic.** They prove the same behavior without racing wall clocks, cleanup, or
  load.
- **One retry for a failed test.** When the test step fails, the gate reruns exactly the failed tests once. If they
  pass, the step passes, and the gate line names them as flaky, so a flake costs about a minute and stays visible.
- **A fast path for docs-only branches.** A branch that changes only files no test, build or eval reads skips the
  long suites, with a SKIP that says why. The lint, link, content, secret, arrival and disclosure checks still run.
- **A recorded exception at release.** The Author can release past a known flake's FAIL line by naming the merge and
  a reason. It refuses by default, and the reason goes into the release's record.
- **The rule stands:** only gated code is released.

## Affected users and systems

- `tools/gates/gate` and its tests (human-only: patches for the Author's hand).
- `deploy/scripts/release.py`.
- The three flaky tests and the code they exercise.
- The merge-request and gate documentation.

## Constraints

- **Constitution:** test-first, and the gates' guarantees stay honest:
  - nothing that failed is ever reported as passing without saying so;
  - only one retry, and only for the test step;
  - the fast path's file set is derived from what the tests and builds actually read, never guessed.
- **`tools/gates/**` changes only by the Author's hand,** as patches built from plain copies.

## Expected cost impact

None in the cloud. A few agent-hours. It saves the Author's gate time.

## Data-flow impact

None.

## Open questions

1. The fast path's exact file set (recommended: start from `docs/merge-requests/`, `docs/infra/applies/` and
   `docs/incidents/`, and add a path only when no test, build or eval reads it).
2. Where the release's exception is recorded (recommended: the release's own record, beside its gate line).
