# 2026-11-22: the first real replace terminated EC2 and timed out

Date: 2026-11-22, UTC · Tier: the cloud, the start function (`h4-ec2-start`) and EC2 · Status: recovered by hand the same evening; fixed in code by `fix/032-launch-policy`, merged into `main` with its patch on 2026-11-22, live once the account's apply takes the patch and the start function's new image · Written 2026-11-23 by Claude Code (a general-purpose agent in the Author's session) from the records linked below, blameless

Sources: [`fix/032-launch-policy`'s note](../merge-requests/2026-11-22-fix-032-launch-policy.md), [ADR 0057, "Amended 2026-11-22"](../adr/0057-spot-with-interchangeable-types.md#amended-2026-11-22), and the apply records on `ops/apply-prod-2026-11-22` and `ops/apply-account-2026-11-22`. What is marked "(runbook)" comes from the Author's session runbook of 2026-11-22, not from a repository record: the one waiting invoke that recovered EC2, and its return at 22:33Z.

## What happened

Spec 032 lets the start function replace a host that can't get its spot type: it cancels the host's spot request, terminates it, launches the next listed type, and attaches the data volume. Its first real run, of EC2, started by hand that evening, took the lock at 21:58:12Z. Its dry runs took 8 to 40 seconds each; then nothing reached AWS for 8 minutes. At 22:07:23Z it cancelled the stopped EC2's persistent spot request, which terminates a stopped spot instance. Lambda then ended the run at its 900-second limit, before the terminate, the launch, or the attach reached AWS. EC2 had no instance, and nothing alerted.

Meanwhile the hand start's AWS CLI, with its 60-second read timeout and its retries, had sent the invocation a second time. The second run found the first one's lock and answered `busy`, which the hand start printed as a failed start while the first run was still working.

The Author set the function's memory to 1,024 MB by hand and invoked it once, with a wait long enough for a replace (runbook). EC2 came back at 22:33Z (runbook) on `m7g.large`, the list's second type, with its data volume attached.

Earlier that evening, after the account's apply, AWS had refused the start function's dry runs for all eight listed types (`UnauthorizedOperation`), because two of the role's launch conditions don't hold for every resource a launch from a template touches. The Author put a corrected policy on the role by hand, and every dry run passed. That refusal cost no service, since a dry run changes nothing; it is part of this note because the run above used the hand-set policy.

## Timeline

All times UTC, 2026-11-22.

| Time | Event |
| --- | --- |
| 19:49:42 to 19:50:28 | Prod's apply: one launch template per listed type; Terraform forgets the two instances (recorded on `ops/apply-prod-2026-11-22`) |
| 21:41:50 to 21:43:17 | The account's apply: the start function's new image and its role's policy (recorded on `ops/apply-account-2026-11-22`) |
| after 21:43 | The start function's dry runs, by hand, refused `UnauthorizedOperation` for all eight types; the Author corrects the role's policy by hand; all eight answer `DryRunOperation` |
| 21:58:12 | The first real replace of EC2, started by hand, takes the lock |
| about a minute in | The CLI's read timeout passes; it sends the invocation again; the second run answers `busy` |
| until 22:07 | The dry runs, 8 to 40 s each; then 8 minutes in which nothing reaches AWS |
| 22:07:23 | The run cancels the stopped EC2's spot request, which terminates EC2 |
| about 900 s after the start | Lambda ends the run before the terminate, the launch, or the attach reach AWS (CloudTrail shows no further call); no alert, and the lock stays until it goes stale |
| then | The Author sets the function's memory to 1,024 MB by hand and invokes it once, waiting for its answer (runbook) |
| 22:33 (runbook) | EC2 back, on `m7g.large`, with its data volume attached |

## Detection

- **Band:** none; availability has no control band yet.
- **Tier:** the cloud tier, the control path that starts and replaces the hosts.
- **What showed it:** the Author, running the replace by hand: the hand start's output, the function's log, and CloudTrail, which showed the cancel at 22:07:23Z and no call after it. Nothing paged: the function has no alarm on its errors or its duration and no failure destination, so a run its timeout kills can't send its own alert (the Well-Architected review's R03).

## Impact

- **EC2 had no instance from 22:07:23Z to 22:33Z (runbook),** about 26 minutes. It was already stopped when the replace began, so it wasn't serving before either. The record doesn't say whether the laptop served in that window.
- **Nothing lost:** EC2's data volume survived the terminate, as its attachment is set to.
- **One extra invocation,** the CLI's retry, which changed nothing: the lock refused it.
- **Spend:** cents at most. A whole 900-second run at 1,024 MB costs about $0.012 ([the fix's note](../merge-requests/2026-11-22-fix-032-launch-policy.md#cost-and-data-flow-impact)).

## Root cause

The replace ran in a function sized and set up for short starts. At 128 MB, Lambda's slowest CPU (memory sets CPU), with the SDK's default timeouts and retries (60 s to connect and 60 s to read, with retries), and with a new SDK client built at every call, each call cost seconds, and a stalled one minutes. The run reached its one irreversible step, the cancel, late, with too little time left to finish, and nothing in the code checked the time left before taking it. Lambda ended the run after the cancel and before the terminate.

### Contributing factors

- **Terminate before launch, by design.** EC2's fixed address and data volume must be free before a new instance can take them, so a replace terminates before it knows the next type will launch (ADR 0057, Consequences). That made a run killed mid-way the worst case.
- **A cancel that terminates.** Cancelling a stopped spot instance's persistent request terminates the instance, so the cancel, not the terminate, was the step with no way back.
- **The memory in code was 128 MB** (`infra/account/handover.tf`), sized before the replace path existed.
- **A first real run in prod.** No pre-production cloud environment exists, and the tests stubbed AWS; a call that hangs until its timeout was first tested in the fix (the review's R23).
- **A silent failure.** No alarm on the function, and no failure destination (R03).
- **A hand start that sends twice.** The CLI's 60-second read timeout and its retries re-sent a long run; the lock made the second run harmless, but its output read as a failure.
- **A hand-set policy.** The role's policy as written was refused by AWS for all eight types, so the run used a policy set by hand, outside the reviewed code, until `fix/032-launch-policy` renders it.

## Fix

`fix/032-launch-policy` ([its note](../merge-requests/2026-11-22-fix-032-launch-policy.md); [ADR 0057, "Amended 2026-11-22"](../adr/0057-spot-with-interchangeable-types.md#amended-2026-11-22)), reviewed, and merged into `main` on 2026-11-22 with its patch, P-032-launch-policy. It is live once the account's apply takes the patch and the start function's and the credential audit's new images.

- **The start function at 1,024 MB in code,** the Author's hand setting, so an account apply no longer puts back 128 MB.
- **Every AWS call bounded:** 5 s to connect, 20 s to read, 3 attempts in all, one client per service.
- **A run deadline 60 s before Lambda's own.** A step of a replace starts only with 30 s of the run left, and the cancel only with 300 s left; short of either, the step refuses `wait_timeout`, and before the cancel the host stays as it was.
- **One launch per replace attempt and type:** each real launch carries a client token, so a launch sent again after a lost answer returns the instance it made.
- **The hand start waits 960 s and sends once,** and its `busy` reads "another start holds the lock; wait, or check the first run's outcome in the function's log".
- **The role's policy in code is the one AWS accepted,** and the credential audit accepts that shape and still refuses the broad ones.

Still open: alarms on the start and guard functions (R03), a replace that resumes after a killed run (R19), a level-triggered check of EC2 inside the hours (R15), and the guard's same client and timeout pattern (`fix/032-launch-policy`'s question 1).

## The eval that would have caught it

- `infra/lambdas/ec2_start/test_replace.py` now fakes AWS calls that hang until their read timeout: the run refuses `wait_timeout` and alerts before its deadline, and too little time after the dry runs cancels nothing. A fake that answers the same instance for a repeated client token holds the single launch.
- `scripts/infra/test_ec2_ops.py` holds the hand start's 960-second read timeout and single attempt.
- `infra/test/test_handover.py` holds the role's policy in code to the one tried on AWS, and runs the credential audit over it.
- The review's R03 adds the check these can't make: after the apply, a copy of the function with a 3-second timeout, invoked on purpose, must page within 5 minutes.

## Follow-up intent

None written yet. The candidates are in the [security posture page's backlog](../security-posture.md#the-ranked-backlog): R03, R19, R15, and R23 (an ephemeral rehearsal cell, so the next control-path change meets AWS outside prod first).
