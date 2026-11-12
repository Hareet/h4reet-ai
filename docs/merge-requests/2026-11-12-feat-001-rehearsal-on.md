# feat/001-rehearsal-on: the functions, and the budget actions' rehearsal (T040 d to f)

<!-- h4-rehearsal: on -->

## Status: built and verified; review to come; the account's plan block and the gate are yours; not merged; the account applied (2026-11-12) without functions or rehearsal

## What changed and why

This branch builds on your `ops/apply-account-2026-11-12` (4dae41b2), so one gate takes the account's apply record and this change.

| What | Where |
|---|---|
| The three functions' images by digest, from your 8d push (2026-11-12), so the account's next apply makes the functions: alert bridge `sha256:d2453921…`, probe `sha256:85e0a4e0…`, credential audit `sha256:9a660808…` | `infra/account/main.tf`, `local.lambda_images` |
| `rehearsal = true`, so the next apply makes the two $0.01 budgets with their actions, `h4-rehearsal-target`, and `h4-rehearsal-instance` (FR-026, SC-009) | `infra/account/main.tf` |
| The marker naming this note, whose line above says it is the rehearsal's (T038's review, I1) | `infra/account/rehearsal-on.txt` |
| The credential audit names your laptop set, `h4reet-ai-cloud`, iam.tf's own local. That's T040b's follow-up: the profile chains and the hand-made policy is detached, so the audit holds the set to the one policy. The name is read at each run, so the tests' fake accounts, which hold no set, run as before | `infra/lambdas/credential_audit/audit.py`, its tests |
| Row F2 names the STS host the chain calls, `sts.us-east-1.amazonaws.com`, as your CLI's opened connection showed (2026-11-12) | `docs/data-flow-disclosure.md` |

## Verification

- **RED:** two tests fail on the audit as it was:
  - the named set, which must be iam.tf's `h4reet-ai-cloud`;
  - the name, which must be read when the audit runs.
- **GREEN:** `infra/lambdas` gives 156 passed. The terminal test's fake account now holds the post-cutover state: `h4-laptop-bedrock` and the set, both Terraform's, the set holding only the assume.
- **The rest:** see "Checks" below, filled before the review.

## For the Author

1. **Your branch,** `feat/001-rehearsal-on-p`, a copy of this branch's tip. There's no patch: `main.tf` isn't protected.
2. **The account's plan,** from a clone of your branch. Its block goes under "The plan block" below, by the runbook's script, and is committed on your branch. Read it:
   - the three `aws_lambda_function`s and what invokes them;
   - the rehearsal's two budgets, their actions and roles, `h4-rehearsal-target`, and `h4-rehearsal-instance` (a `t4g.nano`);
   - no change to what the first apply made, but the functions' wiring;
   - no account ID, address, or email.
3. **The gate,** then its merge, behind the runbook's guard.
4. **Verify, apply, and record** the account, as before. The verify's credential audit now checks `h4reet-ai-cloud` holds only the assume.
5. **Before the trip:**
   - start `h4-rehearsal-instance` (`docs/runbooks/server-budget.md`, Verify);
   - check that Cost Explorer holds at least a cent of Bedrock's spend this month, for the model rehearsal: November's metered Bedrock runs held about $0.49.
   
   Then wait for AWS to evaluate both $0.01 budgets: hours, up to a day.
6. **Record, per action** (contracts/aws-alerts.md §4):
   - when AWS evaluated;
   - when Telegram and the mailbox got each alert: `model_budget_reached` and `server_budget_reached`, with `- rehearsal: yes`, then each `_action_executed`;
   - when the deny was on `h4-rehearsal-target`;
   - for the server action, the SSM run's status and the instance's state after it, `stopped`.
   
   Tell the session the real notices' text.
7. **Then `rehearsal = false`:** reverse both actions (each runbook's Undo), then the session's branch that sets false, removes the marker, and moves the bootstrap's state to S3.

SC-009 passes when both channels got each alert and each action took effect on its target.

### The plan block

Pending: yours, on your branch.

## Checks

- **RED, at 176a6a4d:** `infra/lambdas/credential_audit` fails exactly the two new tests: the set named as iam.tf's, and the name read at each run.
- **GREEN, with the rehearsal on (this branch's tip):**
  - `infra/test`, `infra/lambdas`, and `evals/test_disclosure.py`: 313 passed;
  - `scripts/infra`, `tools/gates/test/test_disclosure_check.py`, and `tools/gates/test/test_infra_policy.py`: 212 passed, plus one failure caused by the sandbox (`test_infra_check_runs_the_policy_then_waits_for_terraform` can't `mktemp` in its read-only `/tmp`).
- **With the rehearsal off,** on a copy with `rehearsal = false` and no marker, as the branch that ends it will have: `infra/test` gives 125 passed. The three rehearsal tests now follow the tree's state, so both pass.
- **The tools:** `tools/gates/disclosure_check.py` passes ("every outward thing the tree holds has its row"); `tools/gates/infra_policy.py --root .` passes, 15 files; `terraform fmt -check` passes on `main.tf`; ruff passes.

## Cost and data-flow impact

- **Cost:** the rehearsal's `t4g.nano` costs cents while it runs. The two $0.01 budgets are among Budgets' free actions while they exist. The three functions stay inside Lambda's free tier: the bridge on each alert, the audit weekly, and the probe's schedule written DISABLED (group 8 enables it).
- **Data flow:** no new flow. Row F2 now names the STS host it already used.
