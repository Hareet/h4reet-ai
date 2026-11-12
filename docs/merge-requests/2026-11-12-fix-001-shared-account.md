# fix/001-shared-account: one account, shared with the Author's other work

## Status: built, verified, and reviewed once (first form; its findings and your "Keep them out of the repo" fixed in this, the second form); your patch P-S1, your allowlist file, and the bootstrap's second plan go on `fix/001-shared-account-p`; not merged; nothing applied

## What changed and why

At T030, the bootstrap's verify refused with `credential_finding`. The credential audit found your other work in the account:
- six IAM users holding access keys;
- a GitHub Actions OIDC provider;
- a deploy role trusting a principal outside the account.

The server budget would also have counted that work's costs, and its action stops EC2.

Your answers:
- 2026-11-11: "Share it, scope the checks" (a new account was the recommendation);
- 2026-11-11, on `h4reet-runtime`: "Allow it too";
- 2026-11-12, on the names: "Keep them out of the repo".

They're recorded in spec.md's Assumptions, "One account, shared with the Author's other work", and in ADR 0047.

| What | Where |
|---|---|
| The audit reads your allowlist: your file in the terminal, your SecureString in the function. Allowed findings are listed apart, not failing. Four kinds only, never this project's names. Any other line is a finding of its own, named by its line number | `infra/lambdas/credential_audit/audit.py` |
| The function's environment names the parameter, and `secrets-check` lists it | `infra/account/lambdas.tf`, `infra/parameters.txt` |
| P-S1, for your hand. `h4-server-month` and `h4-rehearsal-server` count every cost tagged `project = h4reet-ai` except Bedrock's. The audit's role may read `/h4reet/audit/IAM_ALLOW` | `docs/merge-requests/2026-11-12-fix-001-ps1-shared-account.patch` |
| Tests first, RED on main | `test_audit.py`, `test_account.py` (a new check and two fixtures), `test_bootstrap.py` (a fixture) |
| Records | spec.md (Assumptions, FR-021, SC-002, SC-004, scenario 5), plan.md §16 and its notes 6 and 9, tasks.md T150 to T154, research.md R-22, quickstart.md, contracts/aws-alerts.md, both runbooks, ADR 0047 and its index row |

None of your other work's identities is named in the repository or in this branch's history.

## Acceptance

- The audit passes on the account as it stands, once your allowlist holds your eight identities, listing them under `allowed`. A root key, the laptop's identity, the handover's policies, or a line naming this project's own identity still fail it.
- `h4-server-month` counts only the project's tagged costs, without Bedrock's, and its rehearsal reads the same filter.
- The rest of spec 001 is unchanged.

## Review

**The first form's review, 2026-11-12, of fa3cb611, by an agent that wrote none of it: no blocker.** In its words, the allowlist "holds": four kinds only, refused lines named by number, both paths reading the same list, failing closed. That first form's history was replaced with this one, which holds no names.

| Finding | Done |
|---|---|
| I1: `h4-rehearsal-server` still read the whole account, so its rehearsal couldn't prove the real filter | P-S1 puts it on the same filter. `test_account.py` checks it, with the fixture `rehearsal-server-whole-account` |
| I2: the deviation named only FR-008, FR-021 and spec 000's FR-013 | Also named: Principle IV, SC-002, SC-004 and scenario 5. Also updated: quickstart.md, plan.md's notes 6 and 9 and its budget line, tasks.md's T029 line, contracts/aws-alerts.md, and both runbooks |
| I3: only your plan can confirm the provider takes `and` with a nested `not`; the tag key; the volumes' tags | Named in P-S1's preamble and ADR 0047. T153 compares the budget's actual with Cost Explorer. T154 checks EC2's volumes and address in group 7 |
| I4: the allowlist can't tell an inactive key from an active one | ADR 0047's Consequences and the credential-audit runbook say so |
| Names in history, raised as a question | Your answer was "Keep them out of the repo". The list moved to your file and your SecureString, and this branch was rebuilt from main |
| Nits: the server check's message; the term blocks' sizes unchecked; the credential-audit runbook; this project's names allowable; plan.md not in the code's commit | The message is "doesn't count every cost of this project but Bedrock's". Each term block is held to its own two lines. The runbook lists `iam_user_present`, `allowlist_entry_refused` and the list. Names starting `h4-` or `AWSReservedSSO_` are refused. plan.md changes in the GREEN commit |

## Verification

- **RED, on main's code with this branch's tests:** `infra/test` and `infra/lambdas` gave 106 failed and 170 passed. Every failure is the missing `parse_allow` or `terminal_allow`, or a root no longer clean on the budgets' and parameter's checks.
- **GREEN, on an export of the branch with P-S1 applied:** `infra/test`, `infra/lambdas`, and `scripts/infra` gave 387 passed. One test failed because of the sandbox: `test_infra_check_runs_the_policy_then_waits_for_terraform` can't `mktemp` in this sandbox's read-only `/tmp`.
- **P-S1** was built from plain copies: each of main's three files by `git show`, edited, then `diff -u`. It dry-runs and applies cleanly, and the three resulting files match their edited copies byte for byte. `terraform fmt -check` passes on all three.
- **Lint:** ruff check and ruff format pass, and Prettier passes on everything changed.

## For the Author

The runbook's step 7B-1 has the lines:
1. **Your allowlist file,** `~/.config/h4reet-ai/infra/iam-allow.txt`, mode 0600, from the lines the runbook gives.
2. **Your branch,** `fix/001-shared-account-p` from this branch's tip, with P-S1 applied and committed.
3. **The bootstrap's plan again,** from a clone of your branch. Its block goes under "The plan block (T153)" below, inserted by the runbook's script, and is committed on your branch. Read it: `h4-server-month`'s filter shows the `not` and the `project` tag.
4. **The gate** on your branch, then the merge.
5. **Then T030's apply** (runbook 7B). At T040, your SecureString `/h4reet/audit/IAM_ALLOW` gets the same lines.

### The plan block (T153)

Pending: yours, on your branch.

## Cost and data-flow impact

- **Cost:** no new cost. One more standard SecureString is free.
- **Flow:** the weekly function reads one more Parameter Store value inside the account, so no new flow leaves anything.
- **The server budget:** it counts less of the account, only this project's tagged costs, so your other work never stops EC2.

## Backlog

- **Least privilege between this project and your other work rests on IAM** (ADR 0047). The audit doesn't read the allowed identities' policies, so keeping them away from this project's resources is yours.
- **Your file and your SecureString must hold the same lines.** Nothing in the repository can compare them.
- **For W1's regrouping commit:** record T027's `metrics` finding beside T027 in tasks.md (plan.md's note 6 now has it).
