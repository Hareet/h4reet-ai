# 2026-11-18: EC2 couldn't start, with no spot capacity for its one type

Date: 2026-11-18, UTC · Tier: the cloud, EC2 (prod's default host) · Status: fixed by spec 032 (spot with interchangeable types), merged and applied 2026-11-22; who stopped EC2 near 01:00Z is still open · Written 2026-11-23 by Claude Code (docs role, a subagent of the Author's session) from the records linked below, blameless

## What happened

EC2 ran as one persistent spot instance of one type, `t4g.large`, in one zone, `us-east-1a`. Near 01:00Z an API call stopped it. Its spot request then read `instance-stopped-by-user`, so AWS wouldn't restart it on its own, as it does after an interruption. Who or what made that call is not established.

At the hours' open, 14:01:01Z, the start function (`h4-ec2-start`) asked AWS to start EC2 and was refused for capacity, `InsufficientInstanceCapacity`. It was refused again at 14:15:27Z, when the tunnel end came back, and the Author's start by hand at about 17:40Z was refused the same way. AWS can't change a spot instance's type, even while it is stopped, so nothing in the design could try another type. In ADR 0057's words, "no host served until the Author brought his laptop up".

The Author's decision that day, verbatim ([ADR 0057](../adr/0057-spot-with-interchangeable-types.md), [intent 032](../../specs/032-spot-flexibility/intent.md)):

> "Let's set the spot with interchangeable types. Since we want to discuss cost optimization skills and cost
> efficiency, this will be a good showcase of how I work, that we build cost optimization into the workflow. I know
> its minimal savings in this instance, but this is just a demostration of the production-grade thinking we bring to
> costs. We can say that because there is no need for this service to be highly available, we are okay with
> interchanging spot instances for cost efficiency and some downtime that brings if capacity is not available."

## Timeline

All times UTC.

| Time | Event |
| --- | --- |
| 2026-11-18, near 01:00 | EC2 stopped by an API call (`instance-stopped-by-user`); who made it is not established |
| 14:01:01 | The hours' open: `h4-ec2-start` refuses, `start_failed`, with AWS's code `InsufficientInstanceCapacity` (trigger `hours_open`) |
| 14:15:27 | The same, on the tunnel end's return after its reboot (trigger `tunnel_end_back`) |
| about 17:40 | The Author's `make ec2-start` by hand, refused the same way |
| 2026-11-18 | The Author's intent: spot with interchangeable types (above) |
| 2026-11-22 | Spec 032 specified, built, and reviewed in one session; merged (6f792d2e) with its two patches, and onto `main` at f2f63e7f; prod's apply 19:49Z to 19:50Z, the account's 21:41Z to 21:43Z |
| 2026-11-22, 22:33 | EC2 back, on `m7g.large`, with its data volume attached, after the first real replace failed and was recovered by hand ([2026-11-22-first-real-replace.md](2026-11-22-first-real-replace.md)) |

## Detection

- **Band:** none; availability has no control band yet.
- **Tier:** the cloud tier, EC2.
- **What showed it:** the start function's own alert at the hours' open, `ec2_start_refused (start_failed)` with AWS's code ([contracts/aws-alerts.md §2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)). The stop near 01:00Z: what, if anything, alerted on it isn't in the record. No alert kind covers a stop by anyone but the guard, the start function, or the Author's `make ec2-stop` (the same table); the Well-Architected review's R08 proposes one.

## Impact

- **Inside EC2's hours on 2026-11-18** (07:00 to 19:00 in Denver, 14:00Z to 02:00Z), EC2 couldn't serve, and the twin answered only while the Author's laptop served. When the laptop came up isn't in the record.
- **After that day:** EC2 next ran on 2026-11-22 at 22:33Z, on `m7g.large`. The record doesn't say whether `t4g.large` had capacity at any open in between.
- **Nothing lost:** EC2's data volume was untouched, and the meter and the kill switch live on the tunnel end, which was serving.

## Root cause

EC2 was one persistent spot instance of one type in one zone, by design ([ADR 0027](../adr/0027-ec2-on-spot-the-start-function-and-the-guard.md)). Starting a stopped spot instance needs capacity for its type in its zone, and its type can't change, so a shortage of `t4g.large` in `us-east-1a` left EC2 unable to start, with no other type to try. Nothing malfunctioned; the shortage showed what the design cost.

### Contributing factors

- **A fresh start every day.** The guard stops EC2 at each day's close, so each open needs capacity again (ADR 0057, Context).
- **One zone, by decision.** The service needn't be highly available, in the Author's words above; a second zone was weighed in ADR 0057 and left for a later intent.
- **A stop AWS wouldn't undo.** The stop near 01:00Z left the spot request `disabled`, so AWS wouldn't restart EC2 by itself as it would after an interruption (intent 032).
- **No alarm on an unexplained stop.** No alert covers a stop made by anyone but the project's own functions and the Author's stop command.

## Fix

- **Spec 032, spot with interchangeable types** ([spec](../../specs/032-spot-flexibility/spec.md); [ADR 0057](../adr/0057-spot-with-interchangeable-types.md); branch `feat/032-spot-flexibility`, merged and applied 2026-11-22). Each host has an ordered list of Graviton types (EC2: `t4g.large`, `m7g.large`, `m6g.large`, `t4g.xlarge`), each capped at the first type's on-demand price an hour, with one launch template per type. When AWS refuses or stops EC2 for capacity, the start function replaces it with the next listed type that has capacity. An outage now needs every listed type short in the zone at once.
- **Its first real use** on 2026-11-22 terminated EC2 and timed out, and was recovered by hand; `fix/032-launch-policy` fixes what it found ([2026-11-22-first-real-replace.md](2026-11-22-first-real-replace.md)).

## The eval that would have caught it

No test prevents a capacity shortage; what tests can hold is the response. `infra/lambdas/ec2_start/test_replace.py` holds the replace path against stubbed AWS: a capacity refusal, the next listed type, the lock, and, since `fix/032-launch-policy`, calls that hang. What remains open is a rehearsal on AWS itself: spec 032's SC-002 for the tunnel end, and the review's R21, a quarterly game day with fault injection.

## Follow-up intent

Intent 032 ([specs/032-spot-flexibility/intent.md](../../specs/032-spot-flexibility/intent.md)), created 2026-11-18 and accepted 2026-11-22, built as spec 032.

## Open question: who stopped EC2 near 01:00Z

Not established. The evidence is CloudTrail's event history and the guard's log group, and each keeps 90 days: the account has no CloudTrail trail (the review's R08), and the guard's log group is set to 90 days (`infra/account/handover.tf`). Both expire about 2027-02-16 unless the Author exports that window first, which is R08's first step.
