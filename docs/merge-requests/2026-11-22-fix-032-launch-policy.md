# fix/032-launch-policy
Spec: specs/032-spot-flexibility/ (plan.md "As built (2026-11-22, `fix/032-launch-policy`)"; ADR 0057, "Amended 2026-11-22") · Intent: specs/032-spot-flexibility/intent.md · Written by: Claude Code (implementer, a subagent of the Author's session) · Date: 2026-11-22
Session: /tmp/claude-1000/wt-fix-032-policy (worktree of /home/h4reet/h4reet-ai/h4reet-ai, branch from main 37e4a623) · Repo hooks active: yes (`.claude/audit/hooks.log` lines such as `2026-11-22T22:10:47Z bash ALLOW cd /tmp/claude-1000/wt-fix-032-policy && git add docs/adr specs && git commit …`; each commit ran the gitleaks and arrival-check hooks; the bash gate refused five commands: four whose text named the start function with the AWS CLI or an Author-only make target, each redone with Edit, never respelled; and one commit while main's checkout was on main, made once it was parked again)
Authorized by: the Author's direction of 2026-11-22 (the hand policy that passed every dry run; the hand start's retry; the first real replace's death at 900 s and his hand memory setting, all found on AWS), relayed by his session

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
6. **The first real replace** (that night, on AWS): the function took the lock at 21:58:12, its dry runs took 8 to 40 s each, then nothing for 8 minutes until `CancelSpotInstanceRequests` at 22:07:23 (cancelling a stopped spot instance's persistent request terminated EC2), and Lambda killed it at its 900 s limit before the terminate, the launch, or the attach reached AWS (CloudTrail shows no further call). It ran at 128 MB, Lambda's slowest CPU (its REPORT lines, as your session read them: "Max Memory Used ~11x of 128 MB"), and `BotoAws` used the SDK's defaults (60 s connect and read, several retries). Found while fixing it: `BotoAws` built a **new client at every call** (`dict.setdefault` evaluates its default first), loading EC2's model each time, which at 128 MB costs seconds a call. Now:
   - **1024 MB**: `infra/account/handover.tf`'s `memory_size = 1024` for `h4-ec2-start`, in the same patch (the Author set it by hand), so the account's plan finds nothing to change there;
   - **short SDK calls**: a botocore `Config` (connect 5 s, read 20 s, standard retries, 3 attempts), and one client a service;
   - **the run's deadline**: `Budgeted` lets a call of a replace, its waits, or an attach (also the attach before every start, and the repair's) start only with `CALL_S` = 30 s of the run's time left (one attempt's worst case), and the cancel, from which there is no way back, only with `COMMIT_S` = 300 s left (the terminate, the launch, the wait until it runs, and the attach in the usual case); short of either, the step refuses `wait_timeout`, and before the cancel the host stays as it was. The lock's write and release, and EC2's new ID after a launch, go straight to AWS, so the next trigger finds the new instance and repairs it. The run's deadline is still 60 s before Lambda's (`MARGIN_S`). Tests: too little time after the dry runs cancels nothing; a dry run the time can't cover isn't sent; after a launch with 10 s left only the ID is written.
   - **an idempotent launch**: each real `RunInstances` carries `ClientToken` = `h4-<host>-<type>-<the lock's epoch seconds>` (`client_token`; at most 64 ASCII characters; `take_lock` now returns its stamp), the same for one replace attempt and one type, new for the next type or the next replace. With retries on and a 20 s read timeout, a launch that ran at EC2 but whose answer was lost is sent again; with the token EC2 answers the instance it made, rather than a second launch that EC2's fixed address (or the tunnel end's interfaces) refuses `InvalidIPAddress.InUse` while the first runs unrecorded. Dry runs carry no token. Tests: a fake that answers the same instance for a repeated token, a launch sent again after a lost answer (EC2 and the tunnel end) ending with one instance, and one token a type within a replace. One reading to weigh: EC2's model marks `RunInstancesRequest.ClientToken` as an `idempotencyToken` (checked in the AWS CLI's bundled botocore model), and botocore fills such a member with a random token when it's absent, once per call, so its own retries likely carried one already (that handler is from botocore's source, not checked here). The explicit token doesn't depend on that, holds for the whole replace attempt, and is what the tests can see.
   - **The guard** (`h4-ec2-guard`, 128 MB, 30 s timeout) has the same client-per-call `BotoAws` and the SDK's 60-second defaults, longer than its own timeout, and so does the credential audit; neither is changed here (see "For the Author", question 1).
7. **Docs:** ADR 0057's "Amended 2026-11-22"; spec 032's plan, "As built".

Commits (RED then GREEN): `f5d0fb6d` RED policy and message · `8d776445` GREEN audit and message · `8cad47d5` RED hand start · `c331e0c1` GREEN hand start · `2e601fda` GREEN the patch · `f09a0d4e` docs · the note's draft · `c3fb7ddb` RED memory, timeouts, deadline · `07ceccfa` RED one client a service · `9e428e73` GREEN timeouts, one client, deadline · `354e2dad` GREEN the patch with 1024 MB · `c2a42aaa` RED the client token · `5b07c8a4` GREEN the client token · docs and this note.

### Does the patched HCL render the tried policy?

Yes, checked two ways, neither with Terraform against AWS:

- `infra/test/test_handover.py::test_the_start_policy_is_the_one_tried_on_aws` reads the patched `iam.tf` with the repository's HCL reader, holds the document's 19 Sids in order (`OnlyTheTemplatesImage` between `WhatALaunchFromATemplateMakes` and `WhatOnlyTheTemplateNames`), and builds the five RunInstances statements' JSON (resources and conditions, the account by a stand-in) against the tried shape; `test_the_credential_audit_finds_none_of_them_too_broad` runs the audit on that JSON.
- A scratch check outside the repository read the `ec2_start` document from main's `iam.tf` and from the patched copy, applied the Author's transformation to main's statements (remove the Name condition; drop the two conditions; move the image into a new statement before `WhatOnlyTheTemplateNames`), and compared: `statements: 18 -> 19`, `old transformed == new: True`.

Terraform renders a one-element list as a string and the provider compares policies by meaning, so the account's plan should show **no change** to `aws_iam_role_policy.ec2_start`, nor to `aws_lambda_function.ec2_start[0]`'s `memory_size` once your hand setting of 1024 is in. If it shows an in-place update, the hand policy differs from this one; read the diff before applying.

## Acceptance criteria

Spec 032 FR-016 (the start role's grants, as amended by ADR 0057's amendment; the plan's "As built" names the departure: the instance no longer held to a requested Name), FR-009 (the hand replace and its dry run, now decodable and not resent), SC-002's rehearsal unblocked (the dry runs pass on AWS with this policy).

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | no | No byte leaves a visitor's device; no new endpoint |
| II. Production-grade | yes | Tests first (RED, GREEN), the runbook's by-hand step, the ADR and plan updated |
| III. Intent, spec, humans merge | yes | Bug fix inside spec 032; the plan's "As built" records the departure; the Author merges |
| IV. Least privilege | yes | IAM changes only by the Author's patch and apply; type, market, template tag and the image's template condition stay enforced in IAM, and the credential audit still refuses the broad shapes the reviews named; the refusal's message is logged in the account's own log group, never alerted |
| V. Cost | yes | Type and market stay locked in IAM (FR-002's ceiling); a resent invocation can no longer race the lock; 1024 MB costs cents a month (below); a replace refuses before the cancel rather than die mid-way and leave EC2 without an instance |
| VI. Build in public | yes | The refusals and the hand fix are written up here and in ADR 0057 |
| VII, VIII | no | |

## Review

## Verification

From the worktree, `UV_CACHE_DIR=$TMPDIR/uv uv run --offline --frozen pytest -q -p no:cacheprovider …`:

- RED, each at its own commit: `f5d0fb6d` (the policy, the audit, the message) `19 failed, 281 passed` over `infra/lambdas/credential_audit infra/lambdas/ec2_start infra/test/test_handover.py`; `8cad47d5` (the hand start) `5 failed, 175 passed` over `infra/lambdas/ec2_start scripts/infra/test_ec2_ops.py`; `c3fb7ddb` (memory, timeouts, deadline) `5 failed, 180 passed` over `infra/lambdas/ec2_start infra/test/test_handover.py`; `07ceccfa` (one client a service) `1 failed`; `c2a42aaa` (the client token) `3 failed, 143 passed` over `infra/lambdas/ec2_start`.
- GREEN at `5b07c8a4`: `infra/lambdas scripts/infra/test_ec2_ops.py infra/test`, `814 passed in 18.50s`; on an export of `5b07c8a4` with the patch applied, the same, `814 passed in 17.15s`.
- `make -f Makefile lint` (after `npm ci --cache $TMPDIR/npm`), on the final tree: exit 0 (eslint `--max-warnings 0`, tsc, Prettier `All matched files use Prettier code style!`, ruff `All checks passed!`, `975 files already formatted`, shellcheck).
- `make -f Makefile check ENGINE_MODE=none-yet`, on the tree with every code change above:

```text
PASS     makefiles-check
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
FAIL     test
PASS     content-check
PASS     secrets
PASS     arrival
FAIL     infra-check
FAIL     infra-plan-note
PASS     disclosure-check
WARN     evals  WARN (behavioral tier): no run for trigger hash 9d6bd993305f in evals/agent-config/history/; the Author runs make evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the commands it prints
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 12 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 3 FAIL; failing: test FAIL, infra-check FAIL, infra-plan-note FAIL
```

The three FAILs, each read:

- `test`: `1 failed, 7641 passed, 14 skipped`; the one is `scripts/infra/test_infra_targets.py::test_infra_check_runs_the_policy_then_waits_for_terraform`, `mktemp: failed to create file via template '/tmp/tmp.XXXXXXXXXX': Read-only file system`, the agent sandbox's read-only `/tmp`. It fails the same way on a fresh export of main 37e4a623; this branch doesn't touch the Makefile or that test.
- `infra-check`: `infra-policy: PASS, 32 files`, then Terraform's `Failed to load plugin schemas` (`the plugin failed to negotiate the initial go-plugin protocol handshake`) for the bootstrap root, which the sandbox refuses; the same on that export of main. Your gate runs it outside the sandbox.
- `infra-plan-note`: the account's plan block, which "For the Author" step 3 asks of you.

The evals WARN names the agent-config tier, which this branch doesn't touch (no `.claude/**` or `CLAUDE.md`).

## Cost and data-flow impact

No new AWS resource or call; the log line goes to the function's existing log group. No byte leaves a visitor's device. The start function at 1024 MB instead of 128 (Lambda on arm64 bills by GB-second, about $0.0000133 each): a whole 900-second replace costs at most about $0.012; the tunnel end's check, every 5 minutes, runs a few seconds, about 8,640 runs and some 17,000 GB-seconds a month at 2 s each, about $0.23 a month before Lambda's free tier (400,000 GB-seconds a month), which covers it. Faster runs at 1024 MB also cut the billed seconds.

## For the Author

The patch, P-032-launch-policy: `docs/merge-requests/human-patches/2026-11-22-032-launch-policy.patch`, SHA-256 `255046d09839f3f8dde43238316112028dc6944800130d2d942312ec3ae6e6fb`. It changes `infra/account/iam.tf` (the policy) and `infra/account/handover.tf` (`memory_size = 1024`). Built from plain copies of `refs/heads/main` 37e4a623 with `diff -u`; `patch -p1 --dry-run` then `patch -p1` applied it cleanly on a fresh `git archive refs/heads/main` export and on an export of this branch's tip (`354e2dad`); on both, `terraform fmt -check` on the two files passed and `python3 -I -B tools/gates/infra_policy.py` printed `infra-policy: PASS, 32 files`; on the patched tip, `infra/test infra/lambdas scripts/infra/test_ec2_ops.py` passed (`811 passed`).

1. **Your gate on this branch and the merge**, from main's checkout: `tools/gates/gate fix/032-launch-policy`, then the merge line it prints.
2. **The patch on main**, by your hand:
   ```sh
   p=docs/merge-requests/human-patches
   f=$p/2026-11-22-032-launch-policy.patch
   sha256sum "$f"
   ```
   Check it prints `255046d0…e6e6fb`, then:
   ```sh
   patch -p1 --dry-run < "$f"
   patch -p1 < "$f"
   git add infra/account/iam.tf
   git add infra/account/handover.tf
   git commit -m "P-032-launch-policy"
   ```
3. **The account's plan from a fresh clone**, its block appended to this note (the runbook's B1 and B2). Expect: **no change to `aws_iam_role_policy.ec2_start`** and none to `aws_lambda_function.ec2_start[0]`, once your hand policy and your hand `memory_size` 1024 are in. An in-place update there means a hand value differs from the patch: read it before applying. Nothing else should change until the images' digests are in.
4. **The two images from main** after the merge, as before (W2's T174; the runbook's A3 blocks): `ec2_start` (the message log, the result's code, the short SDK calls, one client a service, the deadline, the launch's client token) and `credential_audit` (the new `RUN_KINDS`). The guard's code didn't change here. Tell the session the two digests; it writes them into `infra/account/main.tf`'s `local.lambda_images` on a small digest branch for your gate and merge. That branch's account plan should show only `aws_lambda_function.ec2_start[0]` and `aws_lambda_function.credential_audit[0]` updated in place (their image URIs). Then your apply (`infra-verify ROOT=account`, the apply line it prints, `infra-record`).
5. **Until that audit image runs**, the deployed audit (main f2f63e7f's) still requires the old conditions, so its next weekly run will report `handover_policy_too_broad h4-ec2-start-fn` against your hand policy. That finding is expected until step 4's apply; the new image accepts the tried shape.
6. **Then the dry runs again** (`make ec2-start REPLACE=ec2 DRY_RUN=1 PROFILE=$pf`, and `REPLACE=tunnel_end`), which should answer `DryRunOperation` for all eight. If EC2 still has no instance since 22:07:23 (the cancel terminated it), a hand replace of EC2 (the same target without `DRY_RUN`) launches one from the top of its list and attaches `h4-ec2-data`, which survived. A hand start now waits up to 16 minutes for the function's answer; `another start holds the lock` means a first run is still going. Then spec 032's note from its step 6 on.

Questions, each with a recommendation:

1. **The guard and the credential audit.** `h4-ec2-guard` runs at 128 MB with a 30 s timeout every 5 minutes, and its `BotoAws` has the same client-per-call pattern and the SDK's 60-second defaults (longer than its whole timeout); the credential audit's `BotoAws` has the pattern too. Recommended: read the guard's REPORT lines (Duration against 30 s, Max Memory Used against 128 MB); whatever they show, fix the guard's client and timeouts on a small branch next (test-first, as here), with its memory raised (512 MB is plenty) in a protected patch, since it enforces the server budget's stop. The audit, weekly, can ride on that branch. Not done here, to keep this branch to the start function and the plan clean.
2. **`COMMIT_S` = 300 s.** A replace refuses before the cancel when less than 300 s of the run's 840 remain. At 1024 MB and with short calls, the dry runs should take seconds. Recommended: keep 300, and change it only with the function's logs in hand if `wait_timeout` at `step: cancel` ever shows.

Nothing wrong found in the governance files.
