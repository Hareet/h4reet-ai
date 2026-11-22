# Research: Spot with Interchangeable Instance Types

Approved provisionally by the Author's direction of 2026-11-22: "Go with your recommendations. Let's have you build it out in this session".

Each item: the question, what was found, the decision, and what stays open. AWS's documents were read on 2026-11-22; nothing here was tried on AWS from this session (no AWS call is allowed to it), so each AWS behavior the design leans on is in the Author's verification (plan.md, "Proof").

## R-1. Can a stopped spot instance change type?

No: "While a Spot Instance is stopped, you can modify some of its instance attributes, but not the instance type" (EC2 User Guide, "Behavior of Spot Instance interruptions"). Another type is another instance. And "Only Amazon EC2 can restart an interrupted stopped Spot Instance", for the same type in the same zone. **Decision**: a replace, never a modify.

## R-2. What happens to a persistent request when its instance is terminated or the request is cancelled?

"If the Spot Instance is terminated (irrespective of whether the Spot Instance is in a stopped or running state), the Spot Instance request is opened again and Amazon EC2 launches a new Spot Instance"; and "If you cancel a Spot Instance request ... Amazon EC2 terminates any associated Spot Instances that are stopped" (EC2 User Guide, "State changes for a Spot request"; "Behavior of Spot Instance interruptions"). **Decision**: cancel the request, then terminate (idempotent if AWS already did), then wait for `terminated`.

## R-3. The status codes that say why a spot instance is stopped

`instance-stopped-by-user` (a `StopInstances` call; the request is disabled until the instance is started again), and `instance-stopped-no-capacity` ("Your instance was stopped due to EC2 capacity management needs"), with `instance-stopped-by-price` and `instance-stopped-capacity-oversubscribed` beside it (EC2 User Guide, "Spot request status"). **Decision**: any `instance-stopped-*` but `-by-user` is a capacity stop, for EC2 (replace at once: only AWS could restart it) and for the tunnel end (replace after 10 minutes, measured from the status's `UpdateTime`).

## R-4. The five mechanisms

| Option | Keeps 10.42.0.20 and the volume | Keeps the tunnel end's interfaces | Persistent spot that stops (T11) | Cost and size | Verdict |
|---|---|---|---|---|---|
| A. Auto Scaling group, mixed instances, capacity 0 or 1 by the hours | no: a group launches into a subnet; a fixed address or an interface by ID would be attached after boot by the host, with more host privilege | no | no: a mixed-instances group refuses a template with `InstanceMarketOptions` (EC2 Auto Scaling User Guide), and a group terminates spot on interruption | free; the hours move into the group's schedule; T11 would need a gate patch | rejected |
| B. EC2 Fleet (`instant`) with overrides | no: a fleet's launch template can't carry a network interface ID (documented for Spot Fleet, `LaunchTemplateConfig`; to confirm for EC2 Fleet) | no | one-time requests in practice | free | rejected |
| C. One stopped instance per type, created by Terraform; the address as a secondary address or interface moved to whichever starts | yes, with host networking changes (a secondary interface on EC2) | no: CloudFront's VPC origin names one instance | yes | N−1 extra root volumes (about $1.60 a month each for EC2); every type needs capacity at apply time; each boots once at creation | rejected |
| D. Launch templates per type; the start function replaces the instance from them in order (**chosen**) | yes: the template carries the address; the function attaches the volume | yes: the template carries both interfaces by ID | yes | free; the function grows a replace path and a 5-minute check; the instance leaves Terraform | **chosen** |
| E. On-demand fallback | yes (same instance, a type change is allowed on demand) | yes | no (T11) | about $17 a month more for EC2 at 12 h a day, $8 for the tunnel end | rejected: the Author asked for spot |

D is the smallest that keeps every invariant: no new AWS service, no host networking change, no gate patch, and nothing runs that doesn't run today but a 5-minute check.

## R-5. Who names a replaced instance

Today prod's root names each instance in nine places: the instance rules (four), the server action's role and budget action, the VPC origin, the volume attachments (two), the interface attachment, and the instance ID's parameter. **Decision** (spec Q-C5): Terraform forgets the instances and their attachments (`removed`, `destroy = false`; Terraform 1.17.1, pinned, has it since 1.7), and reads each host's current instance by tag at plan time; the start function writes the ID's parameter and attaches the volumes itself, and re-points the VPC origin, which can't wait for an apply. The rules and the budget action wait for the Author's next plan (spec Assumptions, "The gap after a replace"). Rejected: the function editing rules or budget actions (it would hold power over alert routing and the kill switch, which the constitution keeps for a human); ID-free rules with the functions filtering by tag (a larger rewrite of the handover's events and alerts for the same result).

## R-6. The VPC origin

CloudFront's `UpdateVpcOrigin` takes the whole endpoint configuration, the ARN included, with the ETag (CloudFront API Reference); its developer guide's console steps disassociate the origin from the distribution before an edit. Whether an in-use VPC origin accepts a new ARN, and whether it needs one at all when the new instance holds the same interface, address, and private DNS name, isn't documented. **Decision**: the function re-points when the ARN differs and alerts a refusal; the distribution's origin domain becomes the private interface's DNS name (`aws_network_interface.tunnel_end_private.private_dns_name`), which a replace doesn't change; the tunnel end's rehearsal (SC-002) is the first proof. **Open**: if the re-point is refused in use, the runbook's fallback is the Author's prod apply, and a later change may move the relay's origin elsewhere.

## R-7. Templates and generations

A launch template's `image_id` and `user_data` ignore drift; `replace_triggered_by = [terraform_data.<host>_generation]` replaces every template of the host when its user data or generation changes, as the instance was replaced before, so a newer image reaches a host only through a reviewed change. A replaced template gets a new ID; an instance whose `aws:ec2launchtemplate:id` tag isn't on the host's list is "of an earlier generation" (spec FR-006, FR-010). An instance with no such tag (today's two, made by Terraform) counts as current until a capacity event or a hand replace, so the migration moves nothing by itself.

## R-8. Lambda's time and concurrency

A replace waits for a terminate (about a minute) and a launch to run (under a minute), then attaches; a tunnel end replace adds the VPC origin call and EC2's start, which may replace too. **Decision**: the start function's timeout goes from 30 s to 900 s, Lambda's maximum; each wait polls every 5 s for at most 240 s. Reserved concurrency can't serialize runs in an account whose concurrency limit may be 10 (reserving needs 10 unreserved), so a lock parameter does (spec Q-C7).

## R-9. Types and prices

Graviton types with the first type's memory or more, offered widely in `us-east-1` (each may be `Unsupported` in `us-east-1a`; the function then moves on). On-demand list prices, Linux, `us-east-1`, as remembered at writing (the Author confirms, SC-006):

| Host | Type | vCPU | GiB | On demand $/h | Ceiling $/h |
|---|---|---|---|---|---|
| EC2 | t4g.large | 2 | 8 | 0.0672 | 0.0672 |
| EC2 | m7g.large | 2 | 8 | 0.0816 | 0.0672 |
| EC2 | m6g.large | 2 | 8 | 0.0770 | 0.0672 |
| EC2 | t4g.xlarge | 4 | 16 | 0.1344 | 0.0672 |
| tunnel end | t4g.small | 2 | 2 | 0.0168 | 0.0168 |
| tunnel end | c7g.medium | 1 | 2 | 0.0363 | 0.0168 |
| tunnel end | c6g.medium | 1 | 2 | 0.0340 | 0.0168 |
| tunnel end | t4g.medium | 2 | 4 | 0.0336 | 0.0168 |

`c7g.large` (4 GiB) is left out for EC2: less memory. **Open**: a tunnel end fallback whose spot price sits above $0.0168 most hours is refused `SpotMaxPriceTooLow` and passed over; if the rehearsal shows the list too tight, raising one ceiling is a one-line change the Author decides.

## R-10. The credential audit

`handover_too_broad` today allows the start role `ec2:StartInstances` alone, with its condition naming `h4-prod-ec2`, and the describe calls. **Decision**: a per-action table for the start role: each action and the condition keys and values it must carry (instance names, volume names, the template's component tag, `ec2:CreateAction`), still finding any other EC2 action or one without its condition; `ec2:DescribeSpotInstanceRequests` and `ec2:DescribeVolumes` join the describe calls.
