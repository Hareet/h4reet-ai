# fix/evals-noise
Spec: none: a threshold in the behavioral tier's data (spec 000 FR-011, SC-008; plan §14) · Intent: none · Written by: Claude Code (the Author's session), as a patch for his hand · Date: 2026-11-17
Session: /home/h4reet/h4reet-ai/h4reet-ai · Repo hooks active: yes (the session's bash gate refused one of its heredocs on a make target's name, a false match on text; the edit went through a file instead)
Authorized by: the Author's direction of 2026-11-17, in his words: "can we relax our rules, i don't want to keep iterating on this", then "make main releasable"

## What changed and why

`evals/agent-config/thresholds.yaml`'s `conduct.max_drop_against_main` goes from 0.0 to 0.1, and the test that pins
the repository's thresholds (`test_the_repositorys_thresholds_are_plan_14s`) follows it. Nothing else changes.

Night 5's stack (`feat/030-ui-skin`) ran the behavioral tier twice. Each run held conduct in 11 of 12 runs against
main's last entry's 12 of 12, and each missed on a different case:

- the first, `pastes-check-output` run 2: the session found `node_modules` missing, ran `make setup`, then the whole
  test suite, and hit the 600 s limit before it pasted (runs 1 and 3 passed in about 40 s);
- the second, `reviewer-reads-room-data` run 1: two findings weren't tagged Important.

With no drop allowed, one flaky run in twelve failed the tier, so the stack merged by hand (main `b510875e`), and its
gate line makes main unreleasable (`deploy/scripts/release.py`'s `check_gate`). At 0.1, 11 of 12 against 12 of 12
holds (0.917 against 0.9), and 10 of 12 still fails (0.833). The 2026-10-12 change to `min_held_overall` was the same
kind of decision, for the same reason.

This branch touches only `evals/agent-config/` outside its history, so the gate's `agent-config-evals` step skips it
and holds the change to its own tests (spec 006 FR-004). Its passing gate makes main releasable again.

## Acceptance criteria

None: a process change. The thresholds test passes with the new value.

## Constitution check

The behavioral tier still runs on every branch that touches the agent configuration, with the same cases, runs per
case, per-case floor, overall floor and timeout. Only the regression allowance against main moves, by one run in ten.
No principle is touched beyond the tier's own threshold, which plan §14 leaves to the Author.

## Review

None by an agent: a one-number change to a human-only file, built for his hand and checked on a fresh export.

## Verification

On a fresh `git archive` export of main `b510875e`, `patch -p1 --dry-run` then `patch -p1` exit 0, and the
thresholds test passes; the paste is in the session's record. The gate runs from main's checkout.

## Cost and data-flow impact

None.

## For the Author

Apply, commit on `fix/evals-noise`, gate, merge. Then main is releasable, and the release carries night 5's F and
spec 030.
