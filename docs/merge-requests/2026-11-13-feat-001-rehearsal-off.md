# feat/001-rehearsal-off: the rehearsal ended, the audit's image, and the bootstrap's state in the bucket (T040 g, T030's move)

## Status: built and verified; review to come; the trip's records, your state migration, two plan blocks, and the gate are yours; not merged

## What changed and why

This branch builds on `ops/apply-account-2026-11-12-2` (6fa72fd8), the account's second apply, so one gate takes that record and this change.

| What | Where |
|---|---|
| `rehearsal = false`, and its marker removed (T040g). The next account apply destroys the two $0.01 budgets with their actions, `h4-rehearsal-target`, and `h4-rehearsal-instance` | `infra/account/main.tf`, `infra/account/rehearsal-on.txt` |
| The credential audit's image rebuilt with the set's check, your 9g push: `sha256:dd899845…`, which replaces `sha256:9a660808…`. From this apply on, the weekly function holds `h4reet-ai-cloud` to the one policy, as the terminal run does (the rehearsal branch's review, I-1) | `infra/account/main.tf` |
| The bootstrap's state in the bucket, T030's move (group 3's departure 4). Its backend is `s3` under `bootstrap.tfstate`, with S3's own lock file, as the account's is; the plan supplies the bucket's name. The test now holds that, and the fixture `state-still-local` is the old form | `infra/bootstrap/versions.tf`, `infra/test/test_bootstrap.py`, `infra/test/fixtures/bootstrap/` |
| The rehearsal branch's review nits: | |
| - the audit test's always-true assert replaced, and the weekly function held to the module's set name | `infra/lambdas/credential_audit/test_audit.py` |
| - the on-fixture's digests made current | `infra/test/fixtures/account/rehearsal-on-in-the-tree.tf` |
| - row F2's paragraph says the gateway's SDK default is the session's reading, beside what your CLI showed | `docs/data-flow-disclosure.md` |

## Verification

- **RED, at 0c035bec:** `infra/test` and `infra/lambdas` gave 33 failed, each on the backend: "the state isn't in the bucket, under bootstrap.tfstate".
- **GREEN, at this branch's tip:**
  - `infra/test`, `infra/lambdas`, and `evals/test_disclosure.py`: 314 passed, with the rehearsal off;
  - `tools/gates/infra_policy.py --root .`: passes, 15 files;
  - `tools/gates/disclosure_check.py`: passes;
  - `terraform fmt -check`: passes on `main.tf`, `versions.tf`, and the fixtures.

## For the Author, in this order

1. **The trip first,** on the rehearsal still standing (the runbook's step 9):
   - each alert's time on Telegram and in the mailbox;
   - the deny on `h4-rehearsal-target`;
   - the SSM run and the instance `stopped`;
   - then both actions undone, each runbook's Undo.
   
   Tell the session the notices' text. This branch's apply destroys the rehearsal, so the trip has to finish before it.
2. **Your copy branch,** `feat/001-rehearsal-off-p`, of this branch's tip. There's no patch: nothing here is protected.
3. **The state's move,** from your copy branch's checkout, whose `versions.tf` names the bucket. It copies the local state into the bucket under `bootstrap.tfstate`. Terraform asks "Do you want to copy existing state to the new backend?"; answer `yes`. The runbook has the lines. Until this branch merges, don't plan the bootstrap from `main`, whose `versions.tf` still says local.
4. **Two plans,** from a clone of your copy branch:
   - **the bootstrap's,** which should read "No changes": the move changes where the state lives, not what it holds;
   - **the account's:** the rehearsal's resources destroyed, and the audit function's image updated.
   
   Both blocks go in this note's "The plan blocks" below, by the runbook's script, and are committed on your branch.
5. **The gate,** then its merge, behind the runbook's guard: after the anchor, only this note may differ.
6. **The account's verify, apply, and record,** from main. The bootstrap has nothing to apply.

### The plan blocks

Pending: yours, on your branch.

## The rehearsal's record (SC-009)

Pending: the session writes it from what you tell it.

## Cost and data-flow impact

- **Cost:** none new. The rehearsal's `t4g.nano` and its two $0.01 budgets go, and the bootstrap's state is one small object in a bucket that already exists.
- **Data flow:** none new. Row F2's wording only.
