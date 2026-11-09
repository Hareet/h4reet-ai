# ADR 0043: EC2 as prod's default host, with the laptop serving when the Author runs it

Status: proposed, 2026-11-09 · Spec: 001 (FR-005 to FR-008; SC-002, SC-003; User Stories 2 to 5) · Amends [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), its routing order, now set per host · The constitution change it needs is proposed, not applied: [2026-11-09-constitution-1.1.0.patch](../merge-requests/2026-11-09-constitution-1.1.0.patch)

## Context

Prod has run on the Author's RTX 5090 machine. ADR 0001 set prod's routing for that machine: local first, then Bedrock as a capped fallback. The constitution's Technology Standards describe the cloud as "only what must be always-on and cheap", and its Local tier names the outbound tunnel. Spec 001 is still a draft. It plans a cloud VM for the thin services, and says the VM "can run the full stack for demonstration only within budget" (spec 001, Assumptions).

On 2026-11-09 the Author decided where prod runs. His words, verbatim:

> "On the ec2 server, anthropic api will answer first. That ec2 server will end up being the main server running, I will rarely be running the stack from my laptop other than a demo to showcase or talk about, but it should be the local-first primary scenario we built for."

> "Keep the cap as-is at $20 a month, $5 a day."

> "Here is how we are imagining the move to ec2 workflow: That is the default, and if i run the stack locally, the bootup should ask me what my ip address is, and a script that can configure route53 etc to point to my IP, and the necessary router / firewall settings that would need to change. If i am running locally, then the ec2 should be shut off and not incurring costs. The kill-switch monitor should turn the ec2 on if it detects that the laptop is not present or the local ip address route is offline, then a lambda function can update route53 back to the ec2."

> "The server size and budget is outside the $20 model spend cost. Yes, bedrock stays as the ec2 second paid route."

Our reading, kept beside the words and not in place of them:

- The first quote ends "it should be the local-first primary scenario we built for". "It" can mean the EC2 stack, which would keep a local-first order, or the stack's design as a whole. This ADR records the first sentence's order for EC2 (the Anthropic API first) and ADR 0001's order on the laptop. Whether EC2 has any local model is not said (open item 8).
- The third quote describes a workflow the Author was "imagining". Decision 6 replaces its IP prompt and router changes, as the Author approved below.

## Decision

1. **EC2 runs the production stack by default.** On EC2 the Anthropic API answers first, and Bedrock is its second paid route.
2. **The laptop runs the same stack when the Author chooses to,** mainly for a demo. There ADR 0001's routing order holds (its Decision items 1 to 4): degraded when the kill switch says so, local when the local model is healthy, then the paid fallback, then degraded. The laptop's paid fallback is the one prod's route names, Bedrock today (ADR 0041, `config/routing.yaml`).
3. **One host serves at a time.** While the laptop serves, EC2 is stopped. When the laptop is gone, EC2 is started again.
4. **The model-spend ceilings stay as the Author set them:** $5 a day and $20 a month, counting every metered model call, as spec 000's FR-030 and FR-031 define them. The server's own cost is outside those ceilings. It has its own budget, and that figure is not yet set.

On 2026-11-09 the Author also approved five points on the workflow, as a set. The five points below are written from the feedback as it was put to him. His reply, verbatim:

> "Okay, all of your feedback is approved. for server size, we will try to use spot instances, or only keep the server online for 8-12 hours a day."

5. **Failover is DNS, by itself.** Route 53 failover records, with a health check on the laptop, move DNS between the hosts in both directions without a person. A Lambda, fired when that health check fails, starts EC2. The laptop's local startup stops EC2 when the laptop takes over.
6. **No home IP in DNS.** The laptop reaches the site through an outbound tunnel: it dials out. So there is no IP prompt at boot and no router or firewall change. This replaces the steps the Author described on 2026-11-09. The constitution's sentence "exposed only through an outbound tunnel" stays as written.
7. **One meter.** The budget and kill-switch state live in one place in the cloud that both hosts read, so two hosts cannot each spend the ceilings. This changes spec 000 FR-031's rule that each stack has its own meter, for prod.
8. **The start-up gap is accepted.** While EC2 starts after the laptop drops, visitors see the twin's resting message.
9. **Size and schedule.** The Author will try spot instances, or keep the server online only 8 to 12 hours a day. The choice between them, the instance type, and the hours are open. When neither host serves, the static site stays up at the edge and the twin answers in degraded mode, as the Local tier standard already requires.

Not decided here: the tunnel product, the store that holds the shared state, the schedule's hours, the server's instance type and budget figure, spot-interruption handover, and the IAM each piece needs. These are the open list below.

## Alternatives considered

The repository and the Author's words already held these options. The Author's decisions rule out the first three. The fourth is ruled out by "Keep the cap as-is."

- **Laptop only, the cloud limited to the thin services** (ADR 0001 and spec 001 as drafted). Not chosen: "That ec2 server will end up being the main server running."
- **A cloud VM for demonstration only** (spec 001, Assumptions). Not chosen: the same sentence.
- **Bedrock first on EC2, the Anthropic API second.** Not chosen: "anthropic api will answer first."
- **Raising the ceilings to cover the server.** Not chosen: "Keep the cap as-is."
- **Both hosts serving at once.** Not chosen: decision 3.

The Author did not record reasons for these choices beyond his words above.

## Consequences

**What this changes in the constitution.** The text is in the proposed file. Nothing is applied: the constitution changes only by the Author's hand (Governance; Principle III). Version 1.0.1 becomes 1.1.0 (MINOR: it changes standards and a rationale, and removes or redefines no principle; if the Author reads the changed Principle V sentence as a redefinition, the bump is MAJOR). Last Amended 2026-10-07 becomes 2026-11-09. The file has no sync-impact line, so none is added.

Each change, old → new:

- **Principle V**, the sentence on the local tier and the cloud bill:
  - old: "Budgets are small on purpose, and the local tier exists so the cloud bill stays near zero."
  - new: "Budgets are small on purpose, and the local tier exists so the model spend stays near zero. The model-spend ceilings count model calls only; the server's own budget is separate from them (ADR 0043)."
- **Technology Standards, Cloud**, the hosting list:
  - old: "The cloud hosts only what must be always-on and cheap: the static site and edge, the thin API/relay, the kill-switch state, budgets and alerting, and the Bedrock fallback path."
  - new: "The cloud hosts what must be always-on and cheap: the static site and edge, the thin API/relay, the kill-switch state and the meter's state, budgets and alerting, and the Bedrock fallback path. The cloud may also host the full production stack on one VM, as the default production host (ADR 0043)."
- **Technology Standards, Local tier**, the last two sentences:
  - old: "Deployments are pull-based. Production MUST function when it is off, via the cloud fallback within its sub-budget or via degraded mode."
  - new: "It serves production whenever the Author runs it (ADR 0043). Deployments are pull-based. Production MUST function when it is off, via the cloud host and its paid routes within their ceilings, or via degraded mode."
  - The same bullet's "exposed only through an outbound tunnel" is kept, unchanged, as decision 6 requires.
- **Technology Standards, Model access**, the routing sentence:
  - old: "Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget."
  - new: "Routing policy is configuration, set per host: on the laptop, local-first with one paid fallback, Bedrock or the Anthropic API, inside a capped sub-budget; on the cloud VM, the Anthropic API answers first, with Bedrock as its second paid route (ADR 0043)."
- **Governance**, the version line:
  - old: "**Version**: 1.0.1 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-10-07"
  - new: "**Version**: 1.1.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-11-09"

**Intent 000, not a constitution clause, not edited here.** Its cost constraint reads "$5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero." Under this decision the $5 and $20 are model spend, and the server is outside them. Its constraint that "the entire production stack runs on my local machine" is also superseded by decision 1. Both are for the Author to revise.

**Money.** The model ceilings do not change. The server's cost is unknown until the Author sets its budget and instance type, and this ADR gives no estimate. Every new feature needs one (CLAUDE.md, cost estimate in the spec), so spec 001 must state it.

**Conflicts with other documents, not amended here.**

- Principle IV's "the local tier accepts no inbound connections" and spec 001 FR-006 hold under decision 6. ADR 0009's "no inbound ports" also holds. No change is proposed to them.
- Technology Standards, Cloud, says "Infrastructure exclusively via Terraform." Route 53 failover records and the Lambda are infrastructure. The approved points do not say whether they are Terraform-managed. Open item 6.
- Spec 001 SC-002 proposes an idle target of "≤ $10/month", and intent 001's cost line puts infrastructure inside the $20 ceiling. The Author's words put the server outside it.
- Spec 001, Assumptions, says "The heavy tiers stay on the local machine." Decision 1 supersedes it.
- Spec 001 SC-003 requires h4reet.ai to load and hello to answer within 5 seconds with the local tier off. Decision 8 accepts a start-up gap in which visitors see the resting message, so SC-003 needs a stated exception for that window.
- Spec 000 FR-031 gives each stack its own meter. Decision 7 changes that for prod, and FR-031 needs the change.

**Routes and disclosure.** ADR 0041 holds that choosing the Anthropic API as the paid route waits on the Author's price, cap, key, and his words in `docs/data-flow-disclosure.md`'s row F3, and that the route change is "the one line" `fallback: anthropic`. Decision 1 makes it the route on EC2, so those preconditions apply before EC2 sends a call. The disclosure rows that name prod's route (S2, V2, F1, F3) describe one host. They need the EC2 route before EC2 serves visitors. This ADR does not change them.

## Open, for spec 001

These are not decided. The spec should decide them, with the Author.

1. **The tunnel.** Which outbound tunnel the laptop uses. The constitution's sentence stays until the Author decides otherwise. Our question: a Route 53 health check needs something to probe, and a laptop that only dials out has no address to probe. The check would have to target a cloud-side endpoint that reflects the tunnel's state. Not decided.
2. **The shared state.** Which cloud store holds the budget and kill-switch state (decision 7), what the laptop's gateway reads, and what each host does when that store is unreachable. Spec 000 FR-031 treats an unreachable store as unknown, which is degraded. Spec 001 must say whether that rule applies to this store.
3. **Spot interruption.** How a reclaimed spot instance hands over to the laptop, and whether it is the same start-up gap decision 8 accepts.
4. **The schedule.** Which 8 to 12 hours, and who sets them, if the server runs on a schedule instead of spot.
5. **The server's instance type and budget figure.** Neither is set. SC-002's "≤ $10/month" is a proposal in spec 001, and whether it stands is the Author's call.
6. **What starts and stops EC2, and with which IAM permissions.** The Lambda, the start-up stop, the health check, and any Terraform for them. The constitution makes IAM, budget, alert-routing, and kill-switch changes human acts, and Technology Standards requires Terraform for infrastructure. Changing IAM is a human act.

Further questions the Author's words raise:

7. **Whether the $2-a-day fallback sub-budget applies to EC2.** ADR 0001 and FR-030 limit calls routed as fallback. On EC2 the Anthropic API is the first route, not a fallback. If the sub-budget does not apply there, the $5 daily ceiling is the only paid limit on EC2. Not decided.
8. **Whether EC2 has a local model.** The Author's words name none on EC2, and ADR 0001's local-first order needs a local model to start from. Not decided.
9. **What "it" refers to** in the first quote (see Context). Not decided.
10. **Whether a stopped instance's remaining charges**, such as storage and addresses, fit the server budget. Not decided.

## Links

- Spec: [001 spec](../../specs/001-cloud-elevation/spec.md) · Intent: [001 intent](../../specs/001-cloud-elevation/intent.md)
- Constitution amendment, proposed and not applied: [2026-11-09-constitution-1.1.0.patch](../merge-requests/2026-11-09-constitution-1.1.0.patch)
- Amends: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md) · Related: [ADR 0041](0041-the-anthropic-api-as-a-second-paid-adapter.md), [ADR 0005](0005-telegram-and-smtp-alerting.md), [ADR 0013](0013-local-until-publication.md)
- PR: none until publication. The merge-request note, `docs/merge-requests/2026-11-09-adr-0043-ec2-default-host.md`, is for the main session to write.
