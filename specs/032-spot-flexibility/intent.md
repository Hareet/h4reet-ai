# Intent: spot with interchangeable instance types
Author: the Author (Hareet), captured by Claude Code from his words. Status: accepted (the Author, 2026-11-22: "Go with your recommendations. Let's have you build it out in this session"; every open question takes its recommended answer). Created: 2026-11-18.

## Problem

EC2, prod's default host, runs as one persistent spot instance of one type, `t4g.large`, in one zone, `us-east-1a`
(`infra/prod/ec2-market.tf`, `infra/prod/ec2.tf`, `infra/prod/main.tf`). When AWS has no spot capacity for that one
type in that one zone, EC2 can't start, and nothing in the design can pick another type.

The evidence, 2026-11-18:

- `h4-ec2-start` logged `start_failed` at the hours' open (14:01:01Z, trigger `hours_open`) and again at 14:15:27Z
  (trigger `tunnel_end_back`). Its alert's code: `InsufficientInstanceCapacity`. The Author's `make ec2-start` by hand
  at about 17:40Z was refused the same way.
- EC2's spot request `sir-<redacted>` read `disabled`, `instance-stopped-by-user`: an API call stopped it near 01:00Z,
  so AWS doesn't restart it by itself, as it would after an interruption with `instance_interruption_behavior = "stop"`.
- Meanwhile no host served from the Author's laptop going down until he brought it up again, so the twin answered
  nothing inside EC2's hours.

The tunnel end has the same shape: one persistent spot instance, one type (`t4g.small`), one zone. If it can't start,
no host can serve, the laptop included, since the relay runs there.

## Proposed outcome

In the Author's words, 2026-11-18, verbatim:

> "Let's set the spot with interchangeable types. Since we want to discuss cost optimization skills and cost
> efficiency, this will be a good showcase of how I work, that we build cost optimization into the workflow. I know
> its minimal savings in this instance, but this is just a demostration of the production-grade thinking we bring to
> costs. We can say that because there is no need for this service to be highly available, we are okay with
> interchanging spot instances for cost efficiency and some downtime that brings if capacity is not available."

Read beside his words, not in their place:

- EC2 stays on spot, and when its type has no capacity it starts as another type from a short list of
  interchangeable ones, so a shortage of one type is no longer an outage.
- The decision is written down as a cost decision: the service doesn't need high availability, so spot's price is
  worth some downtime when no listed type has capacity. The downtime that remains is named, measured, and covered
  by the laptop's local tier, as today.
- The cost reasoning is visible to a reader of the repository: what each choice costs, what it buys, and why this
  one, as part of how the project builds cost into its workflow.

## Affected users and systems

- Visitors: fewer hours with no host serving inside EC2's hours.
- The Author: no hand start or market change when one type runs short; the alerts say which type started, or that
  none could.
- Cloud: `infra/prod/ec2-market.tf` (protected: a patch for the Author's hand), `infra/prod/ec2.tf`, the start
  function and the guard (`infra/lambdas/ec2_start/`, `infra/lambdas/ec2_guard/`), which today start and stop one
  named instance by `/h4reet/prod/ec2-instance-id`; the handover and its runbook; possibly the tunnel end
  (`infra/prod/tunnel-end.tf`).
- What must survive a change of type: EC2's fixed address `10.42.0.20`, its data volume (`aws_ebs_volume.ec2_data`),
  its user data and deployer, and the release's images, which are built for amd64 and arm64.
- Dashboards: the handover panels, and a cost panel or note for the market's choice.
- Docs: an ADR for the market decision, the handover runbook, and the cost story.

## Constraints

- Constitution: cost is designed in, with a cost estimate in the spec; infra changes only by plan and the Author's
  apply; the protected market file changes only by his patch.
- No high availability is wanted, and none is added: one host at a time, the laptop as the fallback, the hours as
  today.
- The server budget and its stop action stay as they are, and every type on the list fits under them.
- The listed types run the same images: arm64 (Graviton) first, and x86 only if the spec decides the images and the
  hosts' files support it.
- Nothing the visitor sees changes but how often the twin answers.

## Expected cost impact

Order of magnitude: EC2 runs about twelve hours a day. On spot that is a few dollars a month (about $7 at `t4g.large`
spot prices), against about $24 on demand. A list of comparable types keeps spot's price, and the spec sets each
type's price ceiling. The change itself costs dev-time model spend for the spec and implementation, and a few cents
of test instances. The tunnel end, if included, adds about $12 a month on demand around the clock, against a few
dollars on spot.

## Data-flow impact

None. No new byte leaves the visitor's device or the local tier.

## Open questions

1. Which types are interchangeable for EC2: the same size in other Graviton families (`t4g.large`, `m7g.large`,
   `m6g.large`, `c7g.large`), larger sizes, or x86 too? Recommended: Graviton only, the same memory or more, a
   price ceiling per type.
2. The tunnel end as well? Recommended: yes, the same treatment in the same spec, since its outage stops every host.
3. One zone or more? Today both hosts' subnets are in `us-east-1a`. Recommended: one zone in this intent; a second
   zone is a larger network change, and a later intent if capacity still runs short.
4. How: an EC2 Fleet or Auto Scaling group with a mixed-instances policy and capacity 0 or 1 by the hours, or the
   start function launching the next type from a launch template when one is short. The spec decides, keeping the
   fixed address and the data volume.
5. Who stopped EC2 near 01:00Z on 2026-11-18 (`instance-stopped-by-user`)? The guard's and the handover's logs for
   that hour answer it before the spec, since a stop the design didn't intend is its own fix.
6. What the cost story says, and where: an ADR, the docs site's how-we-build page, and the merge request's note.
