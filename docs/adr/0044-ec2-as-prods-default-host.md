# ADR 0044: EC2 as prod's default host, with the laptop serving when the Author runs it

Status: proposed, 2026-11-09 · Spec: 001 (FR-005 to FR-008; SC-002, SC-003; User Stories 2 to 5) · Amends [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), its routing order, now set per host · The constitution change it needs is proposed, not applied: [2026-11-09-constitution-1.1.0.patch](../merge-requests/2026-11-09-constitution-1.1.0.patch) · Number: ADR 0043 is taken by `feat/005-full-window-room`, so this is 0044

## Context

Prod has run on the Author's RTX 5090 machine. ADR 0001 set prod's routing for that machine: local first, then Bedrock as a capped fallback. The constitution's Technology Standards say "The cloud hosts only what must be always-on and cheap", and its Local tier names the outbound tunnel. Spec 001 is still a draft. It plans a cloud VM for the thin services, and says "the cloud VM runs the thin services and can run the full stack for demonstration only within budget" (spec 001, Assumptions).

On 2026-11-09 the Author decided where prod runs. His words, verbatim:

> "On the ec2 server, anthropic api will answer first. That ec2 server will end up being the main server running, I will rarely be running the stack from my laptop other than a demo to showcase or talk about, but it should be the local-first primary scenario we built for."

> "Keep the cap as-is at $20 a month, $5 a day."

> "Here is how we are imagining the move to ec2 workflow: That is the default, and if i run the stack locally, the bootup should ask me what my ip address is, and a script that can configure route53 etc to point to my IP, and the necessary router / firewall settings that would need to change. If i am running locally, then the ec2 should be shut off and not incurring costs. The kill-switch monitor should turn the ec2 on if it detects that the laptop is not present or the local ip address route is offline, then a lambda function can update route53 back to the ec2."

> "The server size and budget is outside the $20 model spend cost. Yes, bedrock stays as the ec2 second paid route."

Our reading, kept beside the words and not in place of them:

- The first quote ends "it should be the local-first primary scenario we built for". "It" can mean the EC2 stack, which would keep a local-first order, or the stack's design as a whole. This ADR records the first sentence's order for EC2 (the Anthropic API first) and ADR 0001's order on the laptop. Open item 9 asks which one "it" means.
- The third quote describes a workflow the Author was "imagining". Decisions 5 and 6 replace its IP prompt and router changes, as the Author approved below.

Principle I says: "The system MUST prefer on-device or self-hosted inference where it meets the quality bar." An API answering first on EC2 is a question for that sentence. The Author answered it on 2026-11-09. The question put to him, and his answer, verbatim:

> Question: "How should the amendment handle that?" (Our gloss, outside the quote: EC2-first against Principle I's "The system MUST prefer on-device or self-hosted inference where it meets the quality bar.")
>
> Answer: "Record the reason (Recommended)"
>
> Description: "Principle I stays as written. ADR 0044 records why EC2 complies: within the server budget EC2 has no GPU, and a model run on its CPU wouldn't meet the twin's quality bar, which your laptop's GPU model does. So the API is what meets the bar there, and the laptop stays self-hosted-first."

The version question, the Author's answer, verbatim:

> Question: "Which version?"
>
> Answer: "1.1.0, MINOR"
>
> Description: "Principle V's rules stay (the meter, the kill switch, degrading). Only its reason changes. This follows general semantic versioning rather than the rule's text."

The Governance section says a MAJOR bump is for "removing or redefining a principle". The reviewer of the drafts read the changed Principle V sentence as a redefinition, and so as MAJOR. The Author chose 1.1.0. This ADR records that reading and his choice.

The EC2 spend question, the Author's answer, verbatim:

> Question: "What should limit paid spend on EC2?"
>
> Answer: "The $5 and $20 ceilings (Recommended)"
>
> Description: "On EC2, the daily $5 and monthly $20 ceilings and the adapter caps limit the Anthropic API and Bedrock. When a ceiling trips, the twin rests until you reset it, as today. The $2-a-day sub-budget stays the laptop's fallback rule."

## Decision

1. **EC2 runs the production stack by default, without the local model server.** On EC2 the Anthropic API answers first, and Bedrock is its second paid route. Its paid routes sit inside the $5-a-day and $20-a-month ceilings and the adapter caps. The reason for this under Principle I is the Author's answer quoted above: EC2 has no GPU within the server budget, and the twin's quality bar is met by the API there, while the laptop's GPU model stays the self-hosted-first path.
2. **The laptop runs the same stack when the Author chooses to.** When it serves, it serves production: Principle I's "a production tier, not a demo" applies, and the "mainly for a demo" in his words describes how often he runs it, not what it is. On the laptop, ADR 0001's routing order holds (its Decision items 1 to 4): degraded when the kill switch says so, local when the local model is healthy, then one paid fallback, Bedrock or the Anthropic API, inside the $2-a-day sub-budget, then degraded. The $2-a-day sub-budget stays the laptop's fallback rule (the Author's answer above).
3. **One host serves at a time.** While the laptop serves, EC2 is stopped. When the laptop is gone, EC2 is started again.
4. **The model-spend ceilings stay as the Author set them.** His words of 2026-11-09 are "Keep the cap as-is at $20 a month, $5 a day." His separate sentence, "The server size and budget is outside the $20 model spend cost," names only the $20. His answer on EC2 spend names both ceilings for the EC2 routes. So the $5 daily ceiling applies to model spend on both hosts, counted as spec 000's FR-030 and FR-031 define it. The server's own cost is outside those ceilings. It has its own budget, and that figure is not yet set.

On 2026-11-09 the Author also approved five points on the workflow, as a set. The five points were put to him as written below, and his reply is quoted in full after them.

5. **Point 1, Route 53 switches DNS by itself.** Put to the Author:

   > "Route 53 can switch DNS by itself." "Failover" records plus a health check on the laptop move DNS in both directions automatically, with no Lambda for DNS. You'd still want a Lambda, fired when that health check fails, to start EC2. Your local startup script would stop EC2 when the laptop takes over.

   Decided: the failover records and their health check move DNS between hosts. The Lambda fired by the health check starts EC2. The laptop's local startup stops EC2 when it takes over. Decision 3 is the rule behind it.

6. **Point 2, no home IP in DNS.** Put to the Author:

   > "I'd avoid pointing DNS at your home IP." The site needs to stay reachable while you're running it locally, and pointing hareet.ai at your home IP has costs:
   > - "Anyone who looks up hareet.ai gets your home IP, and from it a rough location."
   > - "It needs port 443 forwarded on your router, plus Windows firewall and port-forwarding rules to reach WSL."
   > - "Some internet providers block incoming 443 or share one public IP among customers, so it may not work at all."
   > - "The constitution says the laptop is "exposed only through an outbound tunnel"."
   >
   > With a tunnel, the laptop dials out instead, so there's no IP prompt and no router changes. I recommend that. Spec 001 decides it with you.

   Decided: the laptop reaches the site through an outbound tunnel. There is no IP prompt at boot and no router or firewall change. This replaces the steps the Author described on 2026-11-09. The constitution's sentence "exposed only through an outbound tunnel" stays as written. Which tunnel is open (open item 1).

7. **Point 3, one counter.** Put to the Author:

   > "The budget needs one counter." Each machine has its own database, so if each counts spend separately, both could spend the $20. The budget and kill-switch state need to live in one place in the cloud that both read. Spec 001's design already plans for that.

   Decided: the budget and kill-switch state live in one place in the cloud that both hosts read, so two hosts cannot each spend the ceilings. This changes spec 000 FR-031's rule that each stack has its own meter, for prod.

8. **Point 4, the start-up gap is accepted.** Put to the Author:

   > "There's a gap at switchover." When the laptop drops, EC2 has to start and the stack has to boot, which takes a few minutes. Visitors see the twin's "resting" message in the meantime.

   Decided: while EC2 starts after the laptop drops, visitors see the twin's resting message. Accepted.

9. **Point 5, server size.** Put to the Author:

   > "Server size." Even without the model server, the stack runs a database, Langfuse with ClickHouse, Grafana and Prometheus. That's probably about 8 GB of memory, roughly $50 a month on demand if it's always on, less if spec 001 trims the stack. That's the figure to compare against the separate server budget you'll set.

   The 8 GB and the $50 a month are the main session's unmeasured estimates, not figures from the repository or the Author. This ADR gives no price of its own.

   The Author's reply to the five points, verbatim:

   > "Okay, all of your feedback is approved. for server size, we will try to use spot instances, or only keep the server online for 8-12 hours a day."

   Decided: the Author will try spot instances, or keep the server online only 8 to 12 hours a day. The choice between them, the instance type, and the hours are open (open items 3, 4 and 5). When neither host serves, the static site stays up at the edge and the twin answers in degraded mode, as the Local tier standard already requires.

Not decided here: the tunnel product, the shared state store, the schedule's hours, the server's instance type and budget figure, spot-interruption handover, and the IAM each piece needs. These are the open list below.

## Alternatives considered

The repository and the Author's words already held these options. The Author's decisions rule out the first three. The fourth is ruled out by "Keep the cap as-is."

- **Laptop only, the cloud limited to the thin services** (ADR 0001 and spec 001 as drafted). Not chosen: "That ec2 server will end up being the main server running."
- **A cloud VM for demonstration only** (spec 001, Assumptions). Not chosen: the same sentence.
- **Bedrock first on EC2, the Anthropic API second.** Not chosen: "anthropic api will answer first."
- **Raising the ceilings to cover the server.** Not chosen: "Keep the cap as-is."
- **Both hosts serving at once.** Not chosen: decision 3.

The Author's answers to the Principle I and version questions name the option he chose and its reason. They do not record the other options, so none are listed. The Author did not record reasons for the choices above beyond his words.

## Consequences

**What this changes in the constitution.** The text is in the proposed file. Nothing is applied: the constitution changes only by the Author's hand (Governance; Principle III). Principle I is unchanged. Version 1.0.1 becomes 1.1.0, as the Author chose. Last Amended 2026-10-07 becomes 2026-11-09. The file has no sync-impact line, so none is added.

Each change, old → new:

- **Principle V**, the sentence on the local tier and the cloud bill (only its reason changes):
  - old: "Budgets are small on purpose, and the local tier exists so the cloud bill stays near zero."
  - new: "Budgets are small on purpose, and the local tier exists so the model spend stays near zero. The model-spend ceilings count model calls only; the server's own budget is separate from them (ADR 0044)."
- **Technology Standards, Cloud**, the hosting list:
  - old: "The cloud hosts only what must be always-on and cheap: the static site and edge, the thin API/relay, the kill-switch state, budgets and alerting, and the Bedrock fallback path."
  - new: "The cloud hosts what must be always-on and cheap: the static site and edge, the thin API/relay, the kill-switch state and the meter's state, budgets and alerting, and the Bedrock fallback path. The cloud may also host the production stack on one VM, without the local model server, as the default production host (ADR 0044)."
- **Technology Standards, Local tier**, the last two sentences:
  - old: "Deployments are pull-based. Production MUST function when it is off, via the cloud fallback within its sub-budget or via degraded mode."
  - new: "It serves production whenever the Author runs it (ADR 0044). Deployments are pull-based. Production MUST function when it is off, via the cloud host and its paid routes within the ceilings and adapter caps, or via degraded mode."
  - The same bullet's "exposed only through an outbound tunnel" is kept, unchanged, as decision 6 requires.
- **Technology Standards, Model access**, the routing sentence:
  - old: "Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget."
  - new: "Routing policy is configuration, set per host: on the laptop, the initial policy is local-first with one paid fallback, Bedrock or the Anthropic API, inside its capped $2-a-day sub-budget; on the cloud VM, the Anthropic API answers first, with Bedrock as its second paid route, inside the $5-a-day and $20-a-month ceilings and the adapter caps (ADR 0044)."
- **Governance**, the version line:
  - old: "**Version**: 1.0.1 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-10-07"
  - new: "**Version**: 1.1.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-11-09"

**Intent 000, not a constitution clause, not edited here.** Its cost constraint reads "$5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero, and that is part of the story, not a workaround." Under this decision the $5 and $20 are model spend, and the server is outside them. Its line "Everything containerized; the entire production stack runs on my local machine calling local models." is superseded for EC2 by decision 1. Both are for the Author to revise.

**Money.** The model ceilings do not change. The server's cost is unknown until the Author sets its budget and instance type. This ADR gives no estimate of its own, and the figures in point 5 are the session's unmeasured estimates. Every new feature needs a cost estimate (CLAUDE.md), so spec 001 must state one.

**Conflicts with spec 001, to be reworked with it. None is edited here.**

- US2 AS2: "Given the VM runs the stack, When hello is called through the relay, Then it routes exactly as spec 000 defines (local tier if healthy, Bedrock within sub-budget, else degraded)." On EC2 the Anthropic API answers first and the paid routes sit inside the ceilings, not a sub-budget.
- US3 AS2: "the relay routes to the fallback within the sub-budget or returns the degraded response." The "fallback" wording does not fit EC2's paid-first route.
- US4 AS2: "Given the tunnel drops, When health checks fail, Then routing falls back within 5 seconds." Decision 8 accepts a start-up gap, so this bound needs a stated exception.
- US5 AS2: "Given the meter in the stack sets degraded, When the relay reads state, Then it sees the same state within 10 seconds." Decision 7 moves the meter to the cloud.
- FR-007: "a cloud store replicated from the stack." Decision 7 makes the cloud store the one both hosts read, so the direction changes.
- SC-003: the 5-second bound with the local tier off, which decision 8 gives an accepted exception.
- SC-002: "≤ $10/month" idle target. Intent 001's cost line puts infrastructure inside the $20 ceiling. The Author's words put the server outside it.
- Assumptions: "The heavy tiers stay on the local machine; the cloud VM runs the thin services and can run the full stack for demonstration only within budget." Decision 1 supersedes it.
- Technology Standards, Cloud: "Infrastructure exclusively via Terraform." Route 53 failover records and the Lambda are infrastructure. Open item 6.

**Conflicts in code and config, to be reworked with spec 001.**

- Rule R1, "every primary must be local": `envs.<env>.primary` must name a local adapter. It is FR-022 and `specs/000-local-foundations/contracts/config-files.md` (R1, line 148), enforced at `services/gateway/src/config/validate.ts:328-329`. On EC2 the primary is the Anthropic API, a paid adapter, so R1 refuses that configuration as written.
- Route selection by `H4_ENV`. `config/routing.yaml` (its header) selects the route by `H4_ENV`: prod for prod. Both hosts run prod, so "per host" needs a new selector.
- Spec 000 FR-031 gives each stack its own meter (Decision 7 changes it for prod).

**Routes and disclosure.** ADR 0041 holds that choosing the Anthropic API as the paid route waits on the Author's price, cap, key, and his words in `docs/data-flow-disclosure.md`'s row F3, and that the route change is "the one line" `fallback: anthropic`. Decision 1 makes the Anthropic API the route on EC2, so those preconditions apply before EC2 sends a call. The disclosure rows that name prod's route (S2, V2, F1, F3) describe one host and need the EC2 route before EC2 serves visitors. Two more flows leave the local tier and need rows of their own: the shared meter and kill-switch state in the cloud (decision 7), and the outbound tunnel (decision 6). This ADR adds neither row.

## Open, for spec 001

These are not decided. The spec should decide them, with the Author.

1. **The tunnel.** Which outbound tunnel the laptop uses. The constitution's sentence stays until the Author decides otherwise. Our question: a Route 53 health check needs something to probe, and a laptop that only dials out has no address to probe. The check would have to target a cloud-side endpoint that reflects the tunnel's state. Not decided.
2. **The shared state.** Which cloud store holds the budget and kill-switch state (decision 7), what the laptop's gateway reads, and what each host does when that store is unreachable. Spec 000 FR-031 treats an unreachable store as unknown, which is degraded. Spec 001 must say whether that rule applies to this store.
3. **Spot interruption.** How a reclaimed spot instance hands over to the laptop, and whether it is the same start-up gap decision 8 accepts.
4. **The schedule.** Which 8 to 12 hours, and who sets them, if the server runs on a schedule instead of spot.
5. **The server's instance type and budget figure, and its limits.** Neither is set. SC-002's "≤ $10/month" is a proposal in spec 001, and whether it stands is the Author's call. Also open: what limits the server's own spend, and what degrades when it is exceeded. Principle V's budgets, alerts, and automated kill switch apply to it, but no one has said which ceiling or response the server has.
6. **What starts and stops EC2, and with which IAM permissions.** Decision 5 settles who starts and stops it: a Lambda fired by the health check starts it, and the laptop's startup stops it. Open: the IAM permissions for the Lambda, the start-up stop, and the health check (changing IAM is a human act), and whether their infrastructure is Terraform-managed, given Technology Standards' "Infrastructure exclusively via Terraform."
7. **What serves while EC2 is stopped.** The relay, the Bedrock path, and the cloud-hosted dashboard snapshot (spec 001 FR-009) while EC2 is stopped and the laptop is off. Decision 9 says the static site stays up and the twin answers in degraded mode. Which of the other pieces stays up, and where, is open.

Further questions the Author's words raise:

8. **Whether the sub-budget and the EC2 routes need separate reading.** The Author's answer puts EC2's paid routes under the ceilings and adapter caps, and the $2-a-day sub-budget on the laptop. Whether spec 000's FR-030 wording for fallback needs any change on either host is not decided.
9. **What "it" refers to** in the first quote (see Context). Not decided.
10. **Whether a stopped instance's remaining charges**, such as storage and addresses, fit the server budget. Not decided.

## Links

- Spec: [001 spec](../../specs/001-cloud-elevation/spec.md) · Intent: [001 intent](../../specs/001-cloud-elevation/intent.md)
- Constitution amendment, proposed and not applied: [2026-11-09-constitution-1.1.0.patch](../merge-requests/2026-11-09-constitution-1.1.0.patch)
- Merge-request note: [2026-11-09-docs-001-ec2-default.md](../merge-requests/2026-11-09-docs-001-ec2-default.md)
- Amends: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md) · Related: [ADR 0041](0041-the-anthropic-api-as-a-second-paid-adapter.md), [ADR 0005](0005-telegram-and-smtp-alerting.md), [ADR 0013](0013-local-until-publication.md)
- PR: none until publication. The merge-request note above carries the record until then.
