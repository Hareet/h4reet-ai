# Feature Specification: Spot with Interchangeable Instance Types

**Feature Branch**: `feat/032-spot-flexibility`, from `main` `f1abe245`.

**Created**: 2026-11-22

**Status**: Draft, specified, clarified, planned, tasked, and analyzed in one session. Every open question in the intent, and every clarification below, takes its recommended answer under the Author's direction of 2026-11-22, verbatim: "Go with your recommendations. Let's have you build it out in this session". The answers are provisional and his to confirm or overturn at review.

**Input**: the accepted intent, [intent.md](intent.md); the [constitution](../../.specify/memory/constitution.md); `CLAUDE.md`; spec 001's contracts this amends ([handover.md](../001-cloud-elevation/contracts/handover.md) §3, [aws-alerts.md](../001-cloud-elevation/contracts/aws-alerts.md) §2); ADR 0048 (EC2's hours) and ADR 0049 (what names an instance lives in its root). The code, read at `f1abe245`: `infra/prod/ec2-market.tf`, `ec2.tf`, `tunnel-end.tf`, `main.tf`, `handover.tf`, `killswitch.tf`, `edge.tf`, `shared-state.tf`, `ssm.tf`; `infra/account/handover.tf`, `iam.tf`; `infra/lambdas/ec2_start/start.py`, `ec2_guard/guard.py`, `credential_audit/audit.py`, `alert_bridge/bridge.py`; `deploy/scripts/snapshot_sink.py`; `deploy/hosts/ec2/cloud-init.yaml.tftpl`, `deploy/hosts/tunnel-end/cloud-init.yaml.tftpl`; `scripts/infra/ec2_ops.py`; `tools/gates/infra_policy.py` (read only: rules T5, T11, T13).

## Source: the Author's words

His proposed outcome, 2026-11-18, verbatim (from the intent):

> "Let's set the spot with interchangeable types. Since we want to discuss cost optimization skills and cost
> efficiency, this will be a good showcase of how I work, that we build cost optimization into the workflow. I know
> its minimal savings in this instance, but this is just a demostration of the production-grade thinking we bring to
> costs. We can say that because there is no need for this service to be highly available, we are okay with
> interchanging spot instances for cost efficiency and some downtime that brings if capacity is not available."

His acceptance, 2026-11-22, verbatim: "Go with your recommendations. Let's have you build it out in this session".

**Readings, beside his words, never in their place.**

- "interchanging spot instances": a host that can't get its type gets another type from a short list, still on spot. Never on demand, never a second host.
- "no need for this service to be highly available ... some downtime that brings": the downtime that remains is named (below, "The downtime that remains") and the laptop's local tier covers it as today; nothing here adds a standby.
- "build cost optimization into the workflow": the price ceilings, the cost estimate, and the reasoning are part of the change itself (ADR 0057, this spec's cost section, the merge-request note), not a later write-up.

## The problem, in facts

Verified 2026-11-18 (the intent; the main session's notes):

- EC2 is one persistent spot instance, `t4g.large`, in `us-east-1a` (`infra/prod/ec2-market.tf`, `ec2.tf`, `main.tf`). The guard stops it at every close, so every open needs fresh spot capacity for that one type in that one zone.
- On 2026-11-18 `h4-ec2-start` logged `start_failed`, code `InsufficientInstanceCapacity`, at 14:01:01Z (`hours_open`) and 14:15:27Z (`tunnel_end_back`); the Author's hand start about 17:40Z was refused the same way. No host served until he brought the laptop up.
- AWS can't change a spot instance's type, even stopped ("While a Spot Instance is stopped, you can modify some of its instance attributes, but not the instance type", the EC2 User Guide, "Behavior of Spot Instance interruptions"). Another type is another instance.
- The tunnel end has the same shape (`t4g.small`), and runs around the clock; after an interruption only AWS can restart it, and only as its own type, when capacity for that type returns. While it is down no host serves, the laptop included.

## Clarifications

### Session 2026-11-22

Every answer below is the recommended one, taken under the Author's direction of 2026-11-22 quoted above.

The intent's six questions:

- Q: Which types are interchangeable? → A: Graviton only, the same memory as the first type or more, with a price ceiling per type (intent Q1). EC2: `t4g.large`, `m7g.large`, `m6g.large`, `t4g.xlarge`. The tunnel end: `t4g.small`, `c7g.medium`, `c6g.medium`, `t4g.medium`.
- Q: The tunnel end as well? → A: Yes, the same treatment in this spec (intent Q2).
- Q: One zone or more? → A: One zone, `us-east-1a` (intent Q3). A second zone is a later intent if capacity still runs short.
- Q: How? → A: The spec decides (intent Q4): one launch template per listed type, and the start function launching from them in order (Q-C1 below; ADR 0057 weighs the alternatives).
- Q: Who stopped EC2 near 01:00Z on 2026-11-18? → A: The Author answers it from CloudTrail and the guard's logs; this spec carries it as his step and a backlog item, never a guess (intent Q5; FR-019).
- Q: Where does the cost story go? → A: An ADR (0057), the docs' how-we-build page on cost, and the merge-request note (intent Q6). No how-we-build cost page exists yet; this spec names where it belongs (`docs/how-we-build/cost.md`) and leaves its writing to the docs role (Assumptions).

This session's questions:

- Q-C1: An Auto Scaling group or EC2 Fleet with a mixed-instances policy, or launch templates the start function launches from? → A: Launch templates and the start function. A mixed-instances group refuses a launch template that requests spot through `InstanceMarketOptions` (the EC2 Auto Scaling User Guide), and a fleet's launch template can't carry a network interface ID (the EC2 API Reference, `LaunchTemplateConfig`), so neither keeps EC2's fixed address with a persistent spot request that stops, or the tunnel end's two interfaces; and the repository's rule T11 requires every prod instance and launch template to be spot, persistent, and stopping on interruption. ADR 0057 records all five alternatives and their costs.
- Q-C2: What is a type's price ceiling? → A: The first type's on-demand price an hour, for every type on its list: no fallback ever costs more an hour than today's type would on demand. EC2: $0.0672 (`t4g.large`); the tunnel end: $0.0168 (`t4g.small`). The ceilings are data in the unprotected roots; the Author confirms the list prices before his apply (FR-002; SC-006).
- Q-C3: Does a host go back to the first type on its own once that type has capacity again? → A: No. A host stays on the type that started until that type is short, a new generation replaces it, or the Author replaces it by hand. A swap back would add a replace, and an outage, to save cents.
- Q-C4: When does the tunnel end give up waiting for AWS's own restart? → A: After 10 minutes stopped for capacity, read from its spot request's status (`instance-stopped-no-capacity` or another `instance-stopped-*` code but `instance-stopped-by-user`) and that status's update time, checked every 5 minutes. A tunnel end the Author stopped (`instance-stopped-by-user`) is left alone.
- Q-C5: The prod root's rules, server action, and VPC origin name an instance today. Who keeps them pointed at a replaced one? → A: Prod's root reads its current instances by tag at plan time, so the Author's next prod plan re-points them, and the start function writes `/h4reet/prod/ec2-instance-id` and points the VPC origin at a new tunnel end itself, at once. The function never edits a budget action, a rule, or a role (FR-012; Assumptions, "The gap after a replace").
- Q-C6: How does a new generation (a host-file change, an OS update) reach a host now that Terraform no longer holds the instance? → A: A new generation replaces the host's launch templates in the plan, which the Author reviews. EC2 moves onto it at its next start (each day's open at the latest); the tunnel end, whose replace stops every host for minutes, only by the Author's hand replace (FR-010).
- Q-C7: Two invocations at once (the 5-minute check and an open, say) could both replace. How is that prevented? → A: A lock: the function writes `/h4reet/prod/host-lock` only if it doesn't exist before any terminate or launch, and deletes it after; a lock older than 20 minutes is taken over. A run that finds a live lock refuses `busy` (FR-011).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - EC2 starts as another type when its type is short (Priority: P1)

At the open, the laptop gone, or the Author's hand, the start function's checks pass but AWS has no spot capacity for EC2's current type in `us-east-1a`. Today that is an outage until the laptop comes up. With this change the function replaces EC2 with the next listed type that has capacity, keeping its address and its data volume, and says which type started.

**Why this priority**: it is the outage of 2026-11-18, and EC2 meets it every day, since every open is a fresh start.

**Independent Test**: the start function's tests with AWS stubbed (every path below); on AWS, the Author's hand replace that skips the first type (FR-009), which proves a fallback type starts and serves.

**Acceptance Scenarios**:

1. **Given** checks 1 to 5 pass and EC2 is stopped by the guard, **When** its start is refused `InsufficientInstanceCapacity`, **Then** the function cancels its spot request, terminates it, launches `m7g.large` from its template, attaches the data volume at `/dev/sdf`, writes the new ID to `/h4reet/prod/ec2-instance-id`, and alerts `ec2_started` with `- type: m7g.large` and `- replaced: t4g.large InsufficientInstanceCapacity`.
2. **Given** the same, **When** `m7g.large` is refused too and `m6g.large` launches, **Then** the alert's `- tried:` names both refusals and `- type: m6g.large`.
3. **Given** every listed type is refused, **When** the run ends, **Then** no EC2 instance exists, the function alerts `ec2_start_refused (start_failed)` with `- code: no_capacity` and `- tried:` naming each type and its code, and the next trigger launches from the top of the list.
4. **Given** the parameter names an instance that no longer exists, **When** the checks pass, **Then** the function launches from the top of the list without a stop.
5. **Given** EC2 was stopped by AWS for capacity (an interruption), **When** a trigger's checks pass, **Then** the function replaces it at once, since only AWS can restart an interrupted spot instance.

---

### User Story 2 - The tunnel end comes back as another type (Priority: P1)

AWS interrupted the tunnel end, and capacity for its type doesn't return. Every host is unreachable. With this change, 10 minutes into a capacity stop, the start function replaces it with the next listed type, keeping its two interfaces, its Elastic IP, and the shared state's volume, points CloudFront's VPC origin at the new instance, and then starts EC2 as on any tunnel end's return.

**Why this priority**: the tunnel end down stops every host; the Author named it in his answer to Q2.

**Independent Test**: the function's tests with AWS stubbed; on AWS, the Author's hand replace of the tunnel end in a quiet hour, with `/api/status` read before and after (FR-009; quickstart in plan.md).

**Acceptance Scenarios**:

1. **Given** the tunnel end stopped with `instance-stopped-no-capacity` 10 minutes ago or more, **When** the 5-minute check runs, **Then** the function replaces it from its list skipping the short type, attaches `h4-shared-state` at `/dev/sdf`, points the VPC origin `h4-relay` at the new instance if it names another, alerts `tunnel_end_back` with `- type:` and `- replaced:`, and then runs EC2's start as `from: tunnel_end_back`.
2. **Given** the tunnel end stopped for capacity less than 10 minutes ago, **When** the check runs, **Then** nothing changes (AWS may still restart it) and nothing is alerted.
3. **Given** the Author stopped the tunnel end (`instance-stopped-by-user`), **When** the check runs, **Then** nothing changes.
4. **Given** the tunnel end runs, **When** the check runs, **Then** nothing changes and nothing is recorded as a metric (a plain log line only).
5. **Given** no tunnel end instance exists, **When** the check runs, **Then** the function launches one from the top of its list.

---

### User Story 3 - The Author sees which type runs and why (Priority: P2)

The alerts say which type started, or that none could and why; the dashboard shows each host's type beside its state.

**Why this priority**: the Author asked that the alerts say which type started (intent, "Affected users and systems"); the constitution asks for a graph.

**Independent Test**: the start function's alert texts in its tests; the bridge's tests against the amended contract table; the snapshot sink's tests for the new point and the dashboard's panel query.

**Acceptance Scenarios**:

1. **Given** any start that launches, **When** it alerts, **Then** the alert carries `- type:` and, for a replace, `- replaced:` or `- tried:`.
2. **Given** the snapshot sink runs, **When** it reads the hosts, **Then** it writes `h4.host.type` with labels `host` (`ec2`, `tunnel_end`) and `type`, and the runtime dashboard's panel "Host types" shows them.

---

### User Story 4 - The Author proves a fallback and rolls a generation by hand (Priority: P2)

From his terminal: `make ec2-start REPLACE=ec2 SKIP=t4g.large` replaces EC2 with the first listed type that isn't skipped; `make ec2-start REPLACE=tunnel_end` replaces the tunnel end. Both go through the start function, so its checks and lock apply.

**Independent Test**: `scripts/infra/test_ec2_ops.py` for the event it sends; the function's tests for `replace` and `skip`.

**Acceptance Scenarios**:

1. **Given** EC2's checks pass, **When** the Author asks for a replace skipping `t4g.large`, **Then** EC2 runs as `m7g.large` (or the next with capacity) and the alert says so.
2. **Given** a new tunnel end generation applied, **When** the Author asks for a tunnel end replace, **Then** the tunnel end runs from the new templates.

### Edge Cases

- **A persistent request reopening.** Terminating an instance a persistent request launched reopens the request, and AWS launches another (the EC2 User Guide, "State changes for a Spot request"). The function cancels the request first, then terminates; AWS also terminates a stopped instance whose request is cancelled.
- **A refused launch leaving an open request.** If a refused `RunInstances` left a persistent request open, it could launch a second instance later. EC2's: the guard stops any running instance tagged `h4-prod-ec2` that the parameter doesn't name (`ec2_unrecognised_instance`, unchanged). The tunnel end's: a second instance can't take the interfaces the first holds, so its launch fails. The Author's verification checks for open requests (plan.md, quickstart).
- **Termination is final.** EC2's replace terminates the current instance before it knows another type has capacity, because the address and the volume must be free first. If no type launches, EC2 has no instance until a later trigger launches one; its root volume (the OS alone; the images and stores are on the data volume) is gone, as in any replace.
- **The lock left behind.** A function killed mid-replace leaves the lock; after 20 minutes the next run takes it over (FR-011).
- **The first replace after the migration.** Today's two spot requests carry no tags, so the function's tag-scoped cancel can't touch them; the Author tags both once before the first replace (plan.md, "For the Author").
- **An attach that fails.** The new instance runs without its volume: EC2's boot waits 120 s for `/dev/sdf`, then Docker's mount check fails and the stack doesn't start; the tunnel end's shared state doesn't start. The function alerts `start_failed` with `- attach:` and the code; the runbook's step is a hand replace.
- **The VPC origin re-point refused.** CloudFront's guide describes editing a VPC origin after disassociating it from its distribution. If `UpdateVpcOrigin` is refused, the function alerts `tunnel_end_back` with `- origin: <code>`, and the runbook's step is the Author's prod apply. Whether the origin needs the re-point at all, with the same interface, address, and private DNS name, is the first thing the tunnel end's rehearsal shows (Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

**Types and templates**

- **FR-001**: Each prod host SHALL have an ordered list of interchangeable types, as data in its unprotected file (`local.ec2_types` in `infra/prod/ec2.tf`, `local.tunnel_end_types` in `infra/prod/tunnel-end.tf`): Graviton only, each with the first type's memory or more, in one zone, `local.zone`.
- **FR-002**: Each listed type SHALL carry a spot price ceiling no higher than the first type's on-demand price an hour (Q-C2); a test SHALL hold every ceiling to that rule.
- **FR-003**: Each listed type SHALL have its own launch template in the protected `infra/prod/ec2-market.tf`: spot, persistent, stopping on interruption, with its ceiling as the maximum price (rule T11); IMDSv2 required with hop limit 1 (T13); the host's user data, instance profile, and encrypted gp3 root volume as today; standard CPU credits for burstable types alone; and tags `Name`, `project`, `environment`, `component` on the instance, its volumes, its interfaces, and its spot request, since provider default tags don't reach what a template launches and the server budget filters on `project`.
- **FR-004**: EC2's templates SHALL launch it in the public subnet at the fixed private address `10.42.0.20` with a public address and its security group; the tunnel end's SHALL attach its two interfaces by ID, the private one (`10.42.1.10`) as device 0 and the public one (with the Elastic IP) as device 1.

**Starting from the list**

- **FR-005**: WHEN the start function's checks 1 to 5 pass and the instance `/h4reet/prod/ec2-instance-id` names is stopped by a user, THE SYSTEM SHALL start it, as today; WHEN that start is refused with a capacity code (`InsufficientInstanceCapacity`, `InsufficientCapacity`, `SpotMaxPriceTooLow`, `Unsupported`), THE SYSTEM SHALL replace it (FR-007), skipping the refused type.
- **FR-006**: WHEN the named instance is stopped for capacity (its spot request's status code starts `instance-stopped-` and isn't `instance-stopped-by-user`), or no longer exists, or was launched from a template that is no longer listed (an earlier generation), THE SYSTEM SHALL replace it (FR-007) without a start; a missing instance is launched from the top of the list.
- **FR-007**: A replace SHALL, under the lock (FR-011): cancel the instance's spot request; terminate it; wait until it is terminated (its address and volume free); launch from each listed template in order, skipping the types FR-005 or the Author's `skip` names, until one launches, moving to the next on a capacity code and stopping on any other code; write the new ID to `/h4reet/prod/ec2-instance-id` as soon as the launch returns; wait until it runs; attach its volume (`h4-ec2-data`, or `h4-shared-state` for the tunnel end) at `/dev/sdf`.
- **FR-008**: WHEN no listed type launches, THE SYSTEM SHALL refuse `start_failed` with `- code: no_capacity` and every type's code, and alert it at every trigger, the scheduled open's included.
- **FR-009**: THE SYSTEM SHALL accept a hand replace, `{"manual": true, "replace": "ec2"|"tunnel_end", "skip": [types]}`, from the Author's `make ec2-start REPLACE=… [SKIP=…]`: EC2's after its checks 1 to 5, the tunnel end's after none; each through FR-007, and the tunnel end's then FR-014's re-point and EC2's start.
- **FR-010**: A new generation (a changed host file, `local.ec2_generation`, or `local.tunnel_end_generation`) SHALL replace the host's templates in the plan; EC2 moves onto them at its next start (FR-006), the tunnel end only by the Author's hand replace (FR-009).
- **FR-011**: Before any cancel, terminate, or launch, THE SYSTEM SHALL take the lock `/h4reet/prod/host-lock` (written only if absent; taken over when older than 20 minutes) and delete it after; WHILE another run holds a live lock, THE SYSTEM SHALL refuse `start_failed` with `- code: busy`, alerted but for the 5-minute check's.
- **FR-012**: THE SYSTEM SHALL never run two instances of a host at once: one lock, a cancel before every terminate, a launch only after the old instance is terminated, and the guard's stop of an unrecognised `h4-prod-ec2` unchanged.

**The tunnel end's check**

- **FR-013**: Every 5 minutes, a schedule SHALL invoke the start function `{"from": "tunnel_end_check"}`. WHEN no tunnel end instance exists, or it has been stopped for capacity 10 minutes or more (Q-C4), or it was launched from an unlisted template while stopped for capacity, THE SYSTEM SHALL replace it (FR-007) from its list; WHEN it runs, is pending, was stopped by the Author, or has been stopped for capacity less than 10 minutes, THE SYSTEM SHALL do nothing but write one plain log line.
- **FR-014**: After a tunnel end replace, THE SYSTEM SHALL point the VPC origin `/h4reet/prod/relay-vpc-origin-id` names at the new instance's ARN if it names another, alert `tunnel_end_back` with `- type:` and `- origin:` (`re-pointed`, `unchanged`, or the code of a refusal), and then run EC2's start as `from: tunnel_end_back`, since prod's `h4-tunnel-end-running` rule names the old instance until the next prod apply.

**What names an instance**

- **FR-015**: Terraform SHALL no longer hold the instances: prod's root forgets `aws_instance.ec2`, `aws_instance.tunnel_end`, and the two volume attachments and the public interface's attachment without destroying them (`removed` blocks), and reads each host's current instance by its `Name` tag (`data "aws_instance"`, the states pending, running, stopping, stopped) for the four instance rules, the server budget action's instance IDs, and the VPC origin's ARN. The server action's role names EC2 by tag, not by ARN. `/h4reet/prod/ec2-instance-id` is made from the data source and its value is the start function's from then on (ignored drift).
- **FR-016**: The start function's role SHALL gain only what FR-005 to FR-014 need, each scoped: launches from a template tagged `component` `ec2` or `tunnel-end`, an instance launched only with `Name` `h4-prod-ec2` or `h4-prod-tunnel-end`; tags only at launch; terminate, cancel, and attach on those names (and the two volumes' names); pass the two host roles to EC2 alone; write the instance ID's parameter and the lock; read the three new parameters; update the VPC origin. The weekly credential audit SHALL know the new grants, and still find any EC2 action outside them, or one without its condition.

**Unchanged, and the rest**

- **FR-017**: The hours, the autostart switch, the order of the checks, the laptop fallback, the guard's table, the server budget, and its stop action's effect SHALL stay as they are. Every listed type fits the server budget as the first type does on demand (FR-002).
- **FR-018**: Observability: each outcome that acts or refuses SHALL be one embedded-metric line (namespace `h4reet/handover`, dimensions `Function`, `Trigger`, `Outcome`, as today), with new outcomes `no_capacity`, `busy`, `tunnel_end_replaced`; the 5-minute check's no-op is a plain log line, never a metric. The snapshot sink SHALL write `h4.host.type`, and the runtime dashboard SHALL carry a "Host types" panel beside EC2's state. Alerts SHALL use the bridge's existing kinds and reasons (`ec2_started`, `ec2_start_refused` with `start_failed` or `tunnel_end_down`, `tunnel_end_back`), since the bridge's folder is protected (`infra/*alert*`); the new facts (`type`, `replaced`, `tried`, `repoint`, `origin`, `tunnel_end`, and the codes `no_capacity`, `busy`, `wait_timeout`) SHALL be in spec 001's `contracts/aws-alerts.md` §2 and the runbooks.
- **FR-019**: "Who stopped EC2 near 01:00Z on 2026-11-18" SHALL be the Author's step, from CloudTrail's `StopInstances` events for that hour and the guard's log group, recorded in the merge-request note's backlog; nothing in this change assumes its answer.
- **FR-020**: Docs: ADR 0057 (the decision, the five alternatives and their costs, the cost story) and its row in `docs/adr/README.md`; the runbooks `handover.md`, `ec2.md`, `tunnel-end.md`; spec 001's contracts amended where they describe step 6 and the alerts.

### Key Entities

- **Type list**: per host, ordered `(type, ceiling)` pairs, data in the unprotected roots.
- **Launch template**: per listed type, the protected file's; what a launch is made of.
- **Template list parameter**: `/h4reet/prod/ec2-launch-templates` and `/h4reet/prod/tunnel-end-launch-templates`, Strings, prod's: the JSON list `[{"type": …, "template": "lt-…"}, …]` in order, which the function reads.
- **Current instance**: EC2's by `/h4reet/prod/ec2-instance-id`; the tunnel end's by its `Name` tag.
- **Lock**: `/h4reet/prod/host-lock`, a String the function writes and deletes.

## Cost estimate *(constitution, Principle V)*

Prices are AWS's on-demand list prices for Linux in `us-east-1` as remembered at writing; the Author confirms them in the console before his apply (SC-006). Spot prices move; this estimate uses the intent's figures for today's types.

| Host | Hours a month | Today on spot | On demand, the ceiling's worst case | This change |
|---|---|---|---|---|
| EC2 (`t4g.large`, 12 h a day) | about 365 | about $7 (the intent) | $0.0672 × 365 ≈ $24.5 | about $7 while the first type has capacity; never above $24.5 on any listed type, since every ceiling is $0.0672 |
| The tunnel end (`t4g.small`, around the clock) | about 730 | a few dollars | $0.0168 × 730 ≈ $12.3 | the same; never above $12.3 |

The rest: the 5-minute check is about 8,640 invocations a month, inside Lambda's free tier, with a plain log line each (about 2.6 MB, under a cent of ingestion); new embedded-metric outcomes are custom metrics billed by the hours they report, cents a month at most; the new parameters are standard-tier Strings, free. Test instances for the Author's verification: two replaces, each a few minutes of an instance, cents. Development: this session's model spend, outside the production budget.

**Why spot's price is worth some downtime.** The service needn't be highly available (the Author's words above). High availability would mean a second host of each kind or on-demand capacity: at least the on-demand difference, about $17 a month for EC2 and $8 for the tunnel end, to remove a few hours a month of downtime the laptop already covers whenever it runs. Interchangeable spot types remove most of that downtime at no added cost: an outage now needs every listed type short in the zone at once, not one.

**The downtime that remains**, named:

1. Every listed type short in `us-east-1a` at once: EC2 doesn't start, or the tunnel end stays down; the laptop serves EC2's part when up; nothing serves when the tunnel end is down.
2. A replace's own gap: about 2 to 5 minutes for EC2 (terminate, launch, boot, stack), the laptop or degraded mode serving meanwhile; for the tunnel end, up to 10 minutes of waiting for AWS's own restart plus up to 5 to the next check plus the replace, so up to about 20 minutes with no host.
3. An interruption while serving: AWS's two-minute warning, then the gap above.

The laptop's local tier covers 1 and 2 for EC2 whenever the Author runs it, as today; for the tunnel end nothing covers it, since every host's path runs through it.

## Degraded mode

Nothing the visitor sees changes but how often the twin answers. While no host serves, the relay's degraded mode answers as today; while the tunnel end is down, CloudFront's 503 page answers the API and the static site still serves.

## Data-flow impact

None. No new byte leaves the visitor's device or the local tier; the new calls are the start function's, inside AWS. No row of `docs/data-flow-disclosure.md` changes.

## Success Criteria *(mandatory)*

- **SC-001**: With the first type skipped by hand (FR-009), EC2 serves on another listed type within 10 minutes of the trigger, at `10.42.0.20`, with its data volume's stores intact (the Langfuse traces from before the replace still listed), and the alert names the type.
- **SC-002**: The tunnel end's hand replace returns `/api/status` to 200 within 15 minutes, with the shared state's rows intact and the laptop's tunnel connected again with its pinned host key.
- **SC-003**: After any replace, exactly one instance is tagged `h4-prod-ec2` and one `h4-prod-tunnel-end` in a non-terminated state, and no open spot request carries either name without an instance.
- **SC-004**: The start function's tests cover FR-005 to FR-014 with AWS stubbed; the infra tests hold FR-001 to FR-004 and FR-015 against the tree as the patches leave it; `make -f Makefile plan` (the offline checks) passes on the patched tree.
- **SC-005**: Prod's first plan after the patches shows no instance destroyed or replaced: one launch template per listed type created, the three new parameters created, the two instances, two volume attachments, and the interface attachment forgotten, and the rules, the budget action, and the VPC origin unchanged (the data sources read the same IDs).
- **SC-006**: Every ceiling is at or below its list's first type's on-demand price, confirmed by the Author against the console's prices before his apply.

## Assumptions

- **The gap after a replace (a bounded deviation, Principle V, "the automated kill switch").** Between a replace and the Author's next prod apply, the server budget's action names a terminated instance, so at 100% its stop doesn't reach the new one. Its effect is kept another way: the start function refuses every start while the action isn't standing by or reversed, and the guard stops EC2 at the close while it has run (both unchanged), so the exposure is the rest of that day's hours, cents at the ceiling's price. In the same gap the four instance rules name the old instances: AWS's two-minute warning for the new host isn't alerted, AWS's own restart of a new EC2 isn't guarded until the close, and the tunnel end's return doesn't invoke the start function (FR-014 covers the replace's own return). The start function's alert after any replace says the next prod plan re-points these. Giving the function power over a budget action, a rule, or a role was rejected (Q-C5). ADR 0057 records this as the decision's consequence.
- **The VPC origin.** Whether CloudFront's VPC origin follows a new instance at the same interface, address, and private DNS name without a re-point, and whether `UpdateVpcOrigin` may change the ARN while the distribution uses it, aren't in AWS's documents as found; the function re-points and alerts a refusal (FR-014), and the tunnel end's rehearsal (SC-002) settles it first. The distribution's origin reads the private interface's DNS name, which a replace doesn't change.
- **The host files.** A replace is a first boot from the template's user data, as a Terraform replace was. The tunnel end's network drop-ins came up clean on a fresh boot on 2026-11-18 at 14:15Z (the main session's notes); hand fixes not in the repository would be lost by a replace, as by any reboot.
- **Burstable and fixed-performance types.** `m7g`, `m6g`, and `c7g`/`c6g` aren't burstable, so their templates carry no CPU credit setting; the stack fits each type's memory, since each has the first type's memory or more.
- **The cost page.** `docs/how-we-build/` has no cost page; the cost story is in ADR 0057 and the merge-request note, and a `docs/how-we-build/cost.md` is the docs role's, from them, after the merge (intent Q6).
- **Out of scope.** A second zone; x86 types; on-demand fallback; a swap back to the first type; Q5's cause.
