# fix/001-action-tags: the budget actions tagged, and T037's account block

## Status: built and verified; review to come; your patch P-A1 and the account's plan go on `fix/001-action-tags-p`; not merged; the bootstrap applied (2026-11-12), the account not

## What changed and why

The bootstrap is applied: `docs/infra/applies/2026-11-12-bootstrap.md`, on `ops/apply-bootstrap-2026-11-12`, which this branch builds on. So one gate takes the record, this fix, and T037's account block.

Your T037 plan, `make plan ROOT=account`, then refused:

    T2 plan:0 aws_budgets_budget_action.model: tags_all lacks component

AWS lets budget actions be tagged, so the saved plan's policy check (rule T2) asks for `component`. The policy's source list of taggable types, `TAGGABLE` in `tools/gates/infra_policy.py`, doesn't name `aws_budgets_budget_action`. So neither `make check`'s source check nor the tests caught it. The two rehearsal actions had the same gap, hidden while `local.rehearsal` is false.

| What | Where |
|---|---|
| The tag check covers budget actions too, with a fixture that fails it. The two existing action fixtures now carry the tag, so each still fails only on its own defect | `infra/test/test_account.py`, `infra/test/fixtures/account/` |
| P-A1, for your hand: `component` on the three actions (`kill-switch`, `rehearsal`, `rehearsal`) | `docs/merge-requests/2026-11-12-fix-001-pa1-action-tags.patch` |
| Records | tasks.md T155; plan.md §16 |

## Verification

- **RED, on this branch without P-A1:** `infra/test/test_account.py`'s fixture tests fail. The root names `tags: aws_budgets_budget_action.model sets no component` and the same for `rehearsal_model` and `rehearsal_server`.
- **GREEN, on an export with P-A1 applied:** `infra/test`, `infra/lambdas`, and `scripts/infra` give 390 passed. One fails because of the sandbox: `test_infra_check_runs_the_policy_then_waits_for_terraform` can't `mktemp` in its read-only `/tmp`. `tools/gates/infra_policy.py --root .` passes, 15 files.
- **P-A1:** built from a plain copy of main's `killswitch.tf` (`git show`), edited, then `diff -u`. It applies cleanly, and the resulting file matches the edited copy byte for byte. `terraform fmt -check` passes.

## For the Author

1. **Your branch,** `fix/001-action-tags-p` from this branch's tip, with P-A1 applied and committed.
2. **T037, the account's plan,** from a clone of your branch. Its block goes under "The plan block (T037)" below, inserted by the runbook's script, and is committed on your branch. Read it, as group 4's note, section 4, says:
   - the permission set "will be imported", with only its tags and description changing;
   - no function yet;
   - the rest as listed there;
   - no account ID, address, or email.
3. **The gate,** then its merge, behind the guard.
4. **Then T040,** the account's apply, in its parts (the runbook).

### The plan block (T037)

Pending: yours, on your branch.

## Cost and data-flow impact

None. Tags cost nothing, and nothing new is created or leaves.

## Backlog

- **The policy's `TAGGABLE` should name `aws_budgets_budget_action`,** so the source check catches this before a plan does. `tools/gates/infra_policy.py` is a gate tool, so the change is yours, as a patch, any time.
