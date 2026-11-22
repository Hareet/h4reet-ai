# fix/032-lambda-images
Spec: specs/032-spot-flexibility/ (its note's "For the Author", step 6) · Intent: specs/032-spot-flexibility/intent.md · Written by: Claude Code (the Author's session) · Date: 2026-11-22
Session: /tmp/claude-1000/wt-fix-032-images (worktree of /home/h4reet/h4reet-ai/h4reet-ai) · Repo hooks active: yes (the commit ran the gitleaks and arrival-check hooks)
Authorized by: spec 032's plan and its note's step 6, and the Author's pushes of the three images

## What changed and why

`infra/account/main.tf`'s `local.lambda_images` takes the three digests the Author pushed from main `f2f63e7f` (the
2026-11-22 stack's merge), for linux/arm64 with provenance off, as W2's T174 built them:

| Function | Digest | Why it changed |
|---|---|---|
| `ec2_start` | `sha256:b457ac9f4f7458cce2df54c40e7d781cae842d568cd3d39cb7382578d07e6992` | spec 032: the replace from the type list, the dry runs, the repair, the tunnel-end check |
| `ec2_guard` | `sha256:67866d55c51facdf86cfca79ba94920aceea2f6d0ff91712ead29adc2b616b95` | spec 032: the `budget_check` trigger, `not_ec2` |
| `credential_audit` | `sha256:76f01fe94d7aeec7ca4d91d7e975ebc5c69bdc3c2a7fbd22b2fbcb1cde1be0da` | spec 032: `run_holds`, the launch permissions' check |

032's note named only the first two. The credential audit's source changed in the same stack, so without its image
the deployed audit would keep the check that passed round one's over-broad statements.

The account's apply must not run before these are in: the new five-minute budget check would call the guard's old
image, which refuses an unknown trigger and alerts every five minutes; and the start function's new timeout and
schedule belong to its new code.

## Acceptance criteria

Spec 032's FR for the start function, the guard and the credential audit run the reviewed code (spec 032's SC on the
dry runs and the fallback follow in its note's steps 6 to 9).

## Constitution check

Images built once and promoted unchanged, by digest; no apply here (the Author's plan and apply follow); no secret or
account ID in the repository.

## Review

None by an agent: three digests the Author pushed, written as given; the comment beside them says where they came
from. The account's plan block below is the review of what they change.

## Verification

From the worktree: `uv run --offline --frozen pytest -q -p no:cacheprovider infra/test/test_account.py`, `104 passed
in 5.42s`; `infra/test`, `390 passed in 9.76s`.

## Cost and data-flow impact

None.

## For the Author

1. The account's plan from a fresh clone of this branch, its block appended here, committed, and the plan-note check
   (the runbook's B1 and B2). Read it for: `aws_lambda_function.ec2_start[0]`, `ec2_guard[0]` and
   `credential_audit[0]` updated in place (their image URIs; the start function's timeout 900), the start function's
   policy and invoke config updated, the two schedules created (`tunnel_end_check` with `state = "DISABLED"`), and
   nothing destroyed or replaced.
2. Your gate on this branch and the merge.
3. The account's apply from main (`infra-verify ROOT=account`, the apply line it prints, `infra-record`).
4. Then spec 032's note, step 6's dry runs, the DeleteOnTermination check, and the tunnel-end check enabled.
