# ADR 0057: Spot with interchangeable types: one launch template per listed type, and the start function replacing a host that can't get its type

Status: proposed, 2026-11-22 · Spec: 032 ([spec.md](../../specs/032-spot-flexibility/spec.md) FR-001 to FR-020; [research.md](../../specs/032-spot-flexibility/research.md) R-1 to R-10; [plan.md](../../specs/032-spot-flexibility/plan.md)) · Amends [ADR 0027](0027-ec2-on-spot-the-start-function-and-the-guard.md) (one spot type for EC2, started by the function) and [ADR 0049](0049-what-names-an-instance-lives-in-its-root.md) (prod names its instances from its root: from now on by reading them by tag) · Accepted when the Author merges `feat/032-spot-flexibility` and applies its two patches

## Context

EC2, prod's default host, is one persistent spot instance of one type, `t4g.large`, in one zone, `us-east-1a`. The guard stops it at each day's close, so each open needs fresh spot capacity for that type in that zone. On 2026-11-18 there was none: `h4-ec2-start` refused at the open (14:01:01Z) and at the tunnel end's return (14:15:27Z) with AWS's `InsufficientInstanceCapacity`, and no host served until the Author brought his laptop up. AWS can't change a spot instance's type, even while it is stopped (the EC2 User Guide), so nothing in the design could pick another type. The tunnel end has the same shape, `t4g.small`, and while it is down no host serves at all.

The Author's words, 2026-11-18, verbatim:

> "Let's set the spot with interchangeable types. Since we want to discuss cost optimization skills and cost
> efficiency, this will be a good showcase of how I work, that we build cost optimization into the workflow. I know
> its minimal savings in this instance, but this is just a demostration of the production-grade thinking we bring to
> costs. We can say that because there is no need for this service to be highly available, we are okay with
> interchanging spot instances for cost efficiency and some downtime that brings if capacity is not available."

And on 2026-11-22, verbatim: "Go with your recommendations. Let's have you build it out in this session".

## Decision

1. **Each host has an ordered list of interchangeable types**, data in its unprotected file: EC2 `t4g.large`, `m7g.large`, `m6g.large`, `t4g.xlarge`; the tunnel end `t4g.small`, `c7g.medium`, `c6g.medium`, `t4g.medium`. Graviton alone (the release's images are multi-arch, but the hosts stay arm64), each with the first type's memory or more, in one zone.
2. **Each type's price ceiling is the first type's on-demand price an hour**: $0.0672 for EC2's, $0.0168 for the tunnel end's. No fallback ever costs more an hour than today's type would on demand, so the worst month on any type is the on-demand month the Author already weighed (about $24.5 for EC2 at 12 hours a day, $12.3 for the tunnel end around the clock).
3. **One launch template per listed type** (the protected `ec2-market.tf`): spot, persistent, stopping on interruption, at the type's ceiling. EC2's carry its fixed address, `10.42.0.20`; the tunnel end's carry its two interfaces by ID, so the Elastic IP and `10.42.1.10` never move.
4. **The start function replaces a host that can't get its type.** EC2: its checks as before, then a start; if AWS refuses for capacity, or stopped it for capacity, or it is gone, or it was launched from an earlier generation's template, the function cancels its spot request, terminates it, and launches the next listed type that has capacity, attaches its data volume, and writes its ID. The tunnel end: a check every 5 minutes replaces it the same way after 10 minutes of a capacity stop, attaches the shared state's volume, and points CloudFront's VPC origin at it. A lock keeps one replace at a time. The alerts name the type that runs.
5. **Terraform no longer holds the instances.** It forgets them without destroying them, and reads each host's current instance by its `Name` tag for the instance rules, the server action, and the VPC origin, so the next plan after a replace re-points them.
6. **One zone, no high availability, no swap back.** A host stays on the type that started until that type is short, a generation replaces it, or the Author replaces it by hand.

## Alternatives considered

| Option | What it costs | Why not |
|---|---|---|
| An Auto Scaling group with a mixed-instances policy, capacity 0 or 1 by the hours | Free; the hours move into the group; a gate patch to rule T11 | A mixed-instances group refuses a launch template with `InstanceMarketOptions` (the EC2 Auto Scaling User Guide), so no persistent spot request that stops; a group launches into a subnet, so the fixed address and the tunnel end's interfaces would be attached by the host after boot, with the privilege to do it |
| An EC2 Fleet (`instant`) with overrides | Free | A fleet's launch template can't carry a network interface ID (the EC2 API Reference, `LaunchTemplateConfig`, for Spot Fleet; to confirm for EC2 Fleet); the same address problem |
| One stopped instance per type, made by Terraform, with the address and the volume moved to whichever starts | About $1.60 a month for each extra 20 GiB root volume; every type needs capacity at the apply | A secondary address or interface on EC2's host; CloudFront's VPC origin names one instance, so it can't serve the tunnel end; each instance boots once at its creation |
| On-demand when spot is short | About $17 a month more for EC2, $8 for the tunnel end, while on demand | The Author asked for spot; rule T11 refuses on-demand in prod |
| A second zone | A second subnet pair and a move of the shared state's volume and both interfaces | A larger network change, and the intent keeps one zone; a later intent if capacity still runs short |
| **Launch templates, and the start function replacing from them in order (chosen)** | Free; the function grows a replace path and a 5-minute check; Terraform reads the instances by tag | The smallest design that keeps every invariant: the address, the volumes, the interfaces, the hours, the laptop fallback, the server budget, no new service, no host networking change, no gate patch |

## Consequences

- **The cost story.** Spot's price is worth some downtime because the service needn't be highly available. A shortage of one type is no longer an outage; an outage now needs every listed type short in the zone at once. What remains is named in spec 032 ("The downtime that remains"): every listed type short (the laptop covers EC2's part when it runs; nothing covers the tunnel end's), a replace's own gap (minutes for EC2, up to about 20 for the tunnel end), and an interruption while serving. High availability would cost at least the on-demand difference, about $25 a month, to remove hours the laptop already covers.
- **The gap after a replace**, closed to minutes in the rework. Until the Author's next prod apply, the server budget's stop action names the replaced instance. Left alone, AWS's own restart of a new EC2 would run unguarded until the close, up to about $1.60 an event at the ceiling, repeatable. So `h4-ec2-running` names no instance (the guard acts on the instance tagged `h4-prod-ec2` alone), and the guard checks the server action every 5 minutes (`h4-ec2-budget-check`), stopping every running EC2 once it has run. What remains: up to 5 minutes after the action runs, and AWS's two-minute warning for a new host not alerted until the apply. The function never edits a budget action, a rule, or a role.
- **What IAM can't pair.** The role may attach either volume (`h4-ec2-data`, `h4-shared-state`) to either host: IAM conditions on a volume's and an instance's tags in one call can't require that they match. What bounds it: the function's code attaches each host's volume, by its name, to the instance of that host's name alone; both volumes are in the one zone, so nothing else could take them; and a volume in use can't be attached again. The same holds of the cancel and the terminate, scoped to the two host names.
- **Launches held at the enforcement point** (the rework): the role launches an instance only of a listed type, on spot, with a host's name, and takes the image, subnet, group, and interfaces only from a template, so a request can't override the ceiling's template; the credential audit holds each condition. Every candidate is dry-run before the old host is cancelled or terminated, so a refused permission leaves the host as it was.
- **The tunnel end after the server action.** The server action stops EC2 alone (spec 001 FR-023). The tunnel end's check replaces it whatever the server budget says, by design: the tunnel end carries every host's path, the laptop's too, and costs at most $12.3 a month on any listed type; EC2's start after it refuses as always.
- **A replace terminates before it knows another type will launch**, because the address and the volume must be free first. If none launches, EC2 has no instance until the next trigger; its stores are on the data volume and survive.
- **A new generation** (a host file, an OS update) replaces the templates in the reviewed plan; EC2 moves onto them at its next start, the tunnel end by the Author's hand replace (`make ec2-start REPLACE=tunnel_end`), never on its own.
- **To verify on AWS**: whether CloudFront's VPC origin needs the re-point at all with the same interface and DNS name, and whether it accepts a new ARN while in use. The function alerts a refusal, and the tunnel end's rehearsal settles it first.
- **Who stopped EC2 near 01:00Z on 2026-11-18** stays the Author's question, from CloudTrail and the guard's logs; nothing here assumes its answer.

## Amended 2026-11-22

After the account apply, AWS refused the start function's dry runs for all eight types (`UnauthorizedOperation`). CloudTrail's reasons: the tunnel end's on `security-group/*`, the group of the existing interfaces its template attaches, which isn't "from the template", so `ec2:IsLaunchTemplateResource` failed; EC2's on `spot-instances-request/*`, for which AWS supplies no `ec2:LaunchTemplate`. The Author put a corrected policy on `h4-ec2-start-fn` by hand, every dry run passed, and `fix/032-launch-policy`'s patch makes `iam.tf` render it. The launch's shape now: the launch template only with a host's `component` tag; the instance only of a listed type and on spot (no longer by the requested `Name`, which the template's tags give); the image only as the template names it (`ec2:IsLaunchTemplateResource`), which still forces every launch through a template, since a launch without one is refused on its image; the volume, the spot request, the subnet, the group, and the interfaces with no condition, all within this one-project account. "Launches held at the enforcement point" above reads so from this date; the credential audit holds this shape. The start function now logs AWS's whole message for an `UnauthorizedOperation`, so the next refusal decodes in one step.

## Links

Intent: [specs/032-spot-flexibility/intent.md](../../specs/032-spot-flexibility/intent.md) · Spec: [spec.md](../../specs/032-spot-flexibility/spec.md) · Plan: [plan.md](../../specs/032-spot-flexibility/plan.md) · Note: [docs/merge-requests/2026-11-22-feat-032-spot-flexibility.md](../merge-requests/2026-11-22-feat-032-spot-flexibility.md)
