# fix/032-launch-policy
Spec: specs/032-spot-flexibility/ (plan.md "As built (2026-11-22, `fix/032-launch-policy`)"; ADR 0057, "Amended 2026-11-22") · Intent: specs/032-spot-flexibility/intent.md · Written by: Claude Code (implementer, a subagent of the Author's session) · Date: 2026-11-22
Session: /tmp/claude-1000/wt-fix-032-policy (worktree of /home/h4reet/h4reet-ai/h4reet-ai, branch from main 37e4a623) · Repo hooks active: yes (`.claude/audit/hooks.log` lines such as `2026-11-22T22:10:47Z bash ALLOW cd /tmp/claude-1000/wt-fix-032-policy && git add docs/adr specs && git commit …`; each commit ran the gitleaks and arrival-check hooks; the bash gate refused three commands whose text named the start function with the AWS CLI or an Author-only make target; each was redone with Edit, never respelled)
Authorized by: the Author's direction of 2026-11-22 (the hand policy that passed every dry run, and the hand start's retry found on AWS), relayed by his session

## What changed and why

**What AWS refused.** After 032's account apply, the start function's by-hand dry runs (`make ec2-start REPLACE=… DRY_RUN=1`) were refused `UnauthorizedOperation` for all eight types. CloudTrail's plain-text reasons: the tunnel end's four templates on `security-group/sg-…`, the group of the existing network interfaces its template attaches, which isn't "from the template", so `WhatOnlyTheTemplateNames`'s `ec2:IsLaunchTemplateResource` failed; EC2's four on `spot-instances-request/*`, since `WhatALaunchFromATemplateMakes` required `ec2:LaunchTemplate`, which AWS doesn't supply for a spot request. CloudTrail cut the encoded message at 1,024 characters, so it couldn't be decoded. The Author put a corrected policy on `h4-ec2-start-fn` (inline `ec2-start`) by hand, and every dry run answered `DryRunOperation`.

1. **The patch** `docs/merge-requests/human-patches/2026-11-22-032-launch-policy.patch` (P-032-launch-policy; `infra/account/iam.tf` is protected) makes `data.aws_iam_policy_document.ec2_start` render that policy, statement order included:
   - `LaunchOnlyAHost` (`instance/*`): `aws:RequestTag/Name` removed; `ec2:InstanceType` (the eight types) and `ec2:InstanceMarketType = spot` kept;
   - `WhatALaunchFromATemplateMakes` (`volume/*`, `spot-instances-request/*`): its condition removed;
   - `OnlyTheTemplatesImage` (new, just before the next): `image/*` with `Bool ec2:IsLaunchTemplateResource = true`;
   - `WhatOnlyTheTemplateNames` (`network-interface/*`, `subnet/*`, `security-group/*`): its condition removed;
   - every other statement unchanged; the comments above them say why: the two refusals; the image's condition still forces every launch through a template, since a launch without one is refused on its image; the subnet, groups and interfaces are within this one-project account; type and market stay locked. The comment's stale pointer to the audit's `START_ROLE` now names `HANDOVER_ROLES`, `HOLDS`, and `RUN_KINDS`.
2. **The credential audit** (`infra/lambdas/credential_audit/audit.py`, `RUN_KINDS`): the instance needs its type and market (no longer its Name); the image alone needs `IsLaunchTemplateResource`; the volume, spot request, subnet, group and interfaces need nothing. Still too broad, each with a test: an instance statement without the type or the market (or with only the Name), RunInstances on `*` with only `ec2:LaunchTemplate`, an image without `IsLaunchTemplateResource` (none, `ArnLike` only, or `false`), the image beside the interfaces in a statement without the condition, and any unknown kind or `*`.
3. **The start function** (`infra/lambdas/ec2_start/start.py`): `AwsError` keeps AWS's whole message for `UnauthorizedOperation` alone (`BotoAws`, `KEEP_MESSAGE`); `log_refusal` prints it on a line of its own from a dry run or a launch, with its `encoded` part apart, so the next refusal decodes in one step. The alert, the metric and the result carry the code alone (tested). The result now also carries a refusal's `code`.
4. **The hand start** (`scripts/infra/ec2_ops.py`, found on AWS in the same session): `aws lambda invoke` used the CLI's 60-second read timeout and default retries; a replace takes minutes, so the CLI timed out and sent the invocation again, and the second found the first's `/h4reet/prod/host-lock` and answered `busy`, printed as `refused (start_failed); its alert says why` while the first still replaced EC2. Now: `--cli-read-timeout 960` (the function's timeout is 900 s) and `AWS_MAX_ATTEMPTS=1`, `AWS_RETRY_MODE=standard` for that call alone (`aws()` takes an `env` to add); a `busy` result prints `another start holds the lock; wait, or check the first run's outcome in the function's log`, with no mention of an alert (busy sends none). `docs/runbooks/handover.md`'s by-hand step says so, and how to decode a refusal.
5. **Tests that pinned the old conditions**, changed with the reason beside each: `infra/test/test_handover.py`'s `LAUNCH` (five statements now; the instance without the Name; the volume and spot request, and the interfaces, subnet and group, without a condition; the image alone with `IsLaunchTemplateResource`); `test_audit.py`'s row for a subnet with only `ec2:LaunchTemplate`, now not too broad. `infra/test/patches.py` reads the new patch after P-032-account.
6. **Docs:** ADR 0057's "Amended 2026-11-22"; spec 032's plan, "As built".

Commits (RED then GREEN, each run pasted below): `f5d0fb6d` RED policy and message · `8d776445` GREEN audit and message · `8cad47d5` RED hand start · `c331e0c1` GREEN hand start · `2e601fda` GREEN the patch · `f09a0d4e` docs · this note.

### Does the patched HCL render the tried policy?

Yes, checked two ways, neither with Terraform against AWS:

- `infra/test/test_handover.py::test_the_start_policy_is_the_one_tried_on_aws` reads the patched `iam.tf` with the repository's HCL reader, holds the document's 19 Sids in order (`OnlyTheTemplatesImage` between `WhatALaunchFromATemplateMakes` and `WhatOnlyTheTemplateNames`), and builds the five RunInstances statements' JSON (resources and conditions, the account by a stand-in) against the tried shape; `test_the_credential_audit_finds_none_of_them_too_broad` runs the audit on that JSON.
- A scratch check outside the repository read the `ec2_start` document from main's `iam.tf` and from the patched copy, applied the Author's transformation to main's statements (remove the Name condition; drop the two conditions; move the image into a new statement before `WhatOnlyTheTemplateNames`), and compared: `statements: 18 -> 19`, `old transformed == new: True`.

Terraform renders a one-element list as a string and the provider compares policies by meaning, so the account's plan should show **no change** to `aws_iam_role_policy.ec2_start`. If it shows an in-place update, the hand policy differs from this one; read the diff before applying.

## Acceptance criteria

Spec 032 FR-016 (the start role's grants, as amended by ADR 0057's amendment; the plan's "As built" names the departure: the instance no longer held to a requested Name), FR-009 (the hand replace and its dry run, now decodable and not resent), SC-002's rehearsal unblocked (the dry runs pass on AWS with this policy).

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | no | No byte leaves a visitor's device; no new endpoint |
| II. Production-grade | yes | Tests first (RED, GREEN), the runbook's by-hand step, the ADR and plan updated |
| III. Intent, spec, humans merge | yes | Bug fix inside spec 032; the plan's "As built" records the departure; the Author merges |
| IV. Least privilege | yes | IAM changes only by the Author's patch and apply; type, market, template tag and the image's template condition stay enforced in IAM, and the credential audit still refuses the broad shapes the reviews named; the refusal's message is logged in the account's own log group, never alerted |
| V. Cost | yes | Type and market stay locked in IAM (FR-002's ceiling); no new spend; a resent invocation can no longer race the lock |
| VI. Build in public | yes | The refusals and the hand fix are written up here and in ADR 0057 |
| VII, VIII | no | |

## Review

## Verification

(make check, lint, and the suites run from the worktree; outputs below.)

## Cost and data-flow impact

None. No new AWS resource or call; the log line goes to the function's existing log group. No byte leaves a visitor's device.

## For the Author

The patch, P-032-launch-policy: `docs/merge-requests/human-patches/2026-11-22-032-launch-policy.patch`, SHA-256 `ae63a1ef83ac3c32c6fb914d337eefed04ab0cac90be37935a2f5e1358d01340`. Built from a plain copy of `refs/heads/main` 37e4a623 with `diff -u`; `patch -p1 --dry-run` then `patch -p1` applied it cleanly on a fresh `git archive refs/heads/main` export and on an export of this branch's tip; on the patched tip, `terraform fmt -check` passed, `python3 -I -B tools/gates/infra_policy.py` printed `infra-policy: PASS, 32 files`, and `infra/test infra/lambdas scripts/infra/test_ec2_ops.py` passed (805).

1. **Your gate on this branch and the merge**, from main's checkout: `tools/gates/gate fix/032-launch-policy`, then the merge line it prints.
2. **The patch on main**, by your hand:
   ```sh
   p=docs/merge-requests/human-patches
   f=$p/2026-11-22-032-launch-policy.patch
   sha256sum "$f"
   ```
   Check it prints `ae63a1ef…01340`, then:
   ```sh
   patch -p1 --dry-run < "$f"
   patch -p1 < "$f"
   git add infra/account/iam.tf
   git commit -m "P-032-launch-policy"
   ```
3. **The account's plan from a fresh clone**, its block appended to this note (the runbook's B1 and B2). Expect: **no change to `aws_iam_role_policy.ec2_start`** (the role already holds this policy; an in-place update there means the hand policy differs, so read it). Nothing else should change until the images' digests are in.
4. **The two images from main** after the merge, as before (W2's T174; the runbook's A3 blocks): `ec2_start` (the message log, the result's code) and `credential_audit` (the new `RUN_KINDS`). The guard didn't change. Tell the session the two digests; it writes them into `infra/account/main.tf`'s `local.lambda_images` on a small digest branch for your gate and merge. That branch's account plan should show only `aws_lambda_function.ec2_start[0]` and `aws_lambda_function.credential_audit[0]` updated in place (their image URIs). Then your apply (`infra-verify ROOT=account`, the apply line it prints, `infra-record`).
5. **Until that audit image runs**, the deployed audit (main f2f63e7f's) still requires the old conditions, so its next weekly run will report `handover_policy_too_broad h4-ec2-start-fn` against your hand policy. That finding is expected until step 4's apply; the new image accepts the tried shape.
6. **Then the dry runs again** (`make ec2-start REPLACE=ec2 DRY_RUN=1 PROFILE=$pf`, and `REPLACE=tunnel_end`), which should answer `DryRunOperation` for all eight, and spec 032's note from its step 6 on. A hand start now waits up to 16 minutes for the function's answer; `another start holds the lock` means a first run is still going.

Nothing wrong found in the governance files.
