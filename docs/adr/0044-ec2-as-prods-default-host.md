# ADR 0044: EC2 as prod's default host, with the laptop serving when the Author runs it

Status: proposed, 2026-11-09 · Spec: 001, reworked at 8acc2686 (FR-017 to FR-024, FR-029, FR-043, FR-044, FR-052 to FR-054, FR-063 to FR-072, FR-075, FR-076; SC-001, SC-002, SC-007, SC-018; User Stories 2 to 7; Clarifications, Session 2026-11-09). The numbers of the 2026-09-07 outline, which earlier drafts of this ADR cited, are mapped under Consequences · Amends [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), its routing order, now set per host · The constitution change it needs is proposed, not applied: [2026-11-09-constitution-1.1.0.patch](../merge-requests/2026-11-09-constitution-1.1.0.patch) · Number: ADR 0043 is taken by `feat/005-full-window-room`, so this is 0044

## Context

Prod has run on the Author's RTX 5090 machine. ADR 0001 set prod's routing for that machine: local first, then Bedrock as a capped fallback. The constitution's Technology Standards say "The cloud hosts only what must be always-on and cheap", and its Local tier names the outbound tunnel. Spec 001 was a draft on 2026-09-07. Its Assumptions said "the cloud VM runs the thin services and can run the full stack for demonstration only within budget". The reworked spec supersedes that sentence (FR-044; see Consequences).

On 2026-11-09 the Author decided where prod runs. His words, verbatim:

> "On the ec2 server, anthropic api will answer first. That ec2 server will end up being the main server running, I will rarely be running the stack from my laptop other than a demo to showcase or talk about, but it should be the local-first primary scenario we built for."

> "Keep the cap as-is at $20 a month, $5 a day."

> "Here is how we are imagining the move to ec2 workflow: That is the default, and if i run the stack locally, the bootup should ask me what my ip address is, and a script that can configure route53 etc to point to my IP, and the necessary router / firewall settings that would need to change. If i am running locally, then the ec2 should be shut off and not incurring costs. The kill-switch monitor should turn the ec2 on if it detects that the laptop is not present or the local ip address route is offline, then a lambda function can update route53 back to the ec2."

> "The server size and budget is outside the $20 model spend cost. Yes, bedrock stays as the ec2 second paid route."

Our reading, kept beside the words and not in place of them:

- The first quote ends "it should be the local-first primary scenario we built for". "It" can mean the EC2 stack, which would keep a local-first order, or the stack's design as a whole. This ADR records the first sentence's order for EC2 (the Anthropic API first) and ADR 0001's order on the laptop. Open item 9 asks which one "it" means.
- The third quote describes a workflow the Author was "imagining". Decisions 5, 6 and 10 replace its IP prompt, its router changes, and its Route 53 rewrite, as the Author approved below.

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

1. **EC2 runs the production stack by default, without the local model server.** On EC2 the Anthropic API answers first, and Bedrock is its second paid route. Its paid routes sit inside the $5-a-day and $20-a-month ceilings and the adapter caps. The reason for this under Principle I is the Author's answer quoted above: EC2 has no GPU within the server budget, and the twin's quality bar is met by the API there, while the laptop's GPU model stays the self-hosted-first path. (Spec 001 FR-043, FR-044, FR-067.)
2. **The laptop runs the same stack when the Author chooses to.** When it serves, it serves production: Principle I's "a production tier, not a demo" applies, and the "mainly for a demo" in his words describes how often he runs it, not what it is. On the laptop, ADR 0001's routing order holds (its Decision items 1 to 4): degraded when the kill switch says so, local when the local model is healthy, then one paid fallback, Bedrock or the Anthropic API, inside the $2-a-day sub-budget, then degraded. The $2-a-day sub-budget stays the laptop's fallback rule (the Author's answer above).
3. **One host serves at a time.** While the laptop serves, EC2 is stopped. When the laptop is gone, EC2 is started again. (Spec 001 FR-063 to FR-065.)
4. **The model-spend ceilings stay as the Author set them.** His words of 2026-11-09 are "Keep the cap as-is at $20 a month, $5 a day." His separate sentence, "The server size and budget is outside the $20 model spend cost," names only the $20. His answer on EC2 spend names both ceilings for the EC2 routes. So the $5 daily ceiling applies to model spend on both hosts, counted as spec 000's FR-030 and FR-031 define it (spec 001 FR-020). The server's own cost is outside those ceilings. It has its own budget (spec 001 FR-021), and that figure is not yet set.

On 2026-11-09 the Author also approved five points on the workflow, as a set. The five points were put to him as written below, and his reply is quoted in full after them. Points 1 and 2 were answered again the same day (decisions 10 and 11).

5. **Point 1, Route 53 switches DNS by itself. Superseded in part by decision 10.** Put to the Author:

   > "Route 53 can switch DNS by itself." "Failover" records plus a health check on the laptop move DNS in both directions automatically, with no Lambda for DNS. You'd still want a Lambda, fired when that health check fails, to start EC2. Your local startup script would stop EC2 when the laptop takes over.

   Decided, and still standing: a Lambda, fired when the health check fails, starts EC2, and the laptop's local startup stops EC2 when it takes over (decision 3). Superseded: the DNS failover records. Decision 10 replaces them.

6. **Point 2, no home IP in DNS.** Put to the Author:

   > "I'd avoid pointing DNS at your home IP." The site needs to stay reachable while you're running it locally, and pointing hareet.ai at your home IP has costs:
   > - "Anyone who looks up hareet.ai gets your home IP, and from it a rough location."
   > - "It needs port 443 forwarded on your router, plus Windows firewall and port-forwarding rules to reach WSL."
   > - "Some internet providers block incoming 443 or share one public IP among customers, so it may not work at all."
   > - "The constitution says the laptop is "exposed only through an outbound tunnel"."
   >
   > With a tunnel, the laptop dials out instead, so there's no IP prompt and no router changes. I recommend that. Spec 001 decides it with you.

   Decided: the laptop reaches the site through an outbound tunnel. There is no IP prompt at boot and no router or firewall change. This replaces the steps the Author described on 2026-11-09. The constitution's sentence "exposed only through an outbound tunnel" stays as written (spec 001 FR-052). The tunnel's end is settled in decision 11.

7. **Point 3, one counter.** Put to the Author:

   > "The budget needs one counter." Each machine has its own database, so if each counts spend separately, both could spend the $20. The budget and kill-switch state need to live in one place in the cloud that both read. Spec 001's design already plans for that.

   Decided: the budget and kill-switch state live in one place in the cloud that both hosts read, so two hosts cannot each spend the ceilings (spec 001 FR-017, FR-019). This changes spec 000 FR-031's rule that each stack has its own meter, for prod. The sentence "Spec 001's design already plans for that" is the session's; the 2026-09-07 design planned the reverse (see the mapping under Consequences).

8. **Point 4, the start-up gap is accepted.** Put to the Author:

   > "There's a gap at switchover." When the laptop drops, EC2 has to start and the stack has to boot, which takes a few minutes. Visitors see the twin's "resting" message in the meantime.

   Decided: while EC2 starts after the laptop drops, visitors see the twin's resting message. Accepted (spec 001 FR-066; SC-001's exception).

9. **Point 5, server size.** Put to the Author:

   > "Server size." Even without the model server, the stack runs a database, Langfuse with ClickHouse, Grafana and Prometheus. That's probably about 8 GB of memory, roughly $50 a month on demand if it's always on, less if spec 001 trims the stack. That's the figure to compare against the separate server budget you'll set.

   The 8 GB and the $50 a month are the main session's unmeasured estimates, not figures from the repository or the Author. This ADR gives no price of its own. The spec measures the figure before the first apply (question 14).

   The Author's reply to the five points, verbatim:

   > "Okay, all of your feedback is approved. for server size, we will try to use spot instances, or only keep the server online for 8-12 hours a day."

   Decided: the server is a spot instance around the clock (spec 001 FR-069, question 15). The schedule of 8 to 12 hours is kept in reserve. The instance type and the budget figure are open (open items 4 and 5). When neither host serves, the static site stays up at the edge and the twin answers in degraded mode, as the Local tier standard already requires (spec 001 FR-028, FR-066, FR-075).

10. **Relay picks the host. Supersedes the DNS part of point 1.** The question put to the Author on 2026-11-09 was "how should visitors reach whichever machine is serving (your laptop or EC2)?" His answer: "Relay picks the host (Recommended)". The option read: "The site's edge always talks to the tiny always-on relay (your tunnel's end). The relay checks both hosts every second and sends each request to the laptop if it's up, else EC2, else the resting reply. Switching takes seconds, and neither host needs a public certificate. Route 53's health check only wakes EC2. This changes the DNS-failover design you approved, so the spec's wording changes with your OK."

    Decided: the edge always talks to the relay at the tunnel's end, and the relay picks the host. Route 53 does not move DNS between the hosts. Route 53's health check only wakes EC2. At 8acc2686 the spec applies this: the relay picks the host (FR-029, FR-054, FR-063), and the health check only wakes EC2 (FR-065). Whether the Author has signed off that wording is his to confirm.

11. **The tunnel's end is spot.** The question was "On demand or spot?", for the tiny always-on instance that is the tunnel's end. His answer: "Spot". The option read: "About $2.20 a month (October's figure). AWS can take it back, and while it's gone the site rests, even if the laptop or EC2 is up." The price is the option's own, quoted from October; this ADR gives no price of its own. Decided: the tunnel's end is a spot instance. While AWS has it back, the site rests, whichever host is up. Spec 001 at 8acc2686 settles the response in FR-076: an alert on both channels; the edge rests every dynamic request while the tunnel's end is gone; the start function does not start EC2; on return, the tunnel's end's services restart without a person and the start function runs once (open item 3).

12. **The amendment's two wording changes.** The question put to the Author was whether to add two wording changes to the amendment: the Observability standard's "Langfuse, self-hosted on the local tier", and the Cloud standard's always-on "Bedrock fallback path". His answer: "Add both (Recommended)". The option read: "The patch gains two small wording changes: Langfuse self-hosted in the stack, and Bedrock called from the serving host. Still 1.1.0. The ADR's old → new list grows to match." Decided: both are in the amendment, and the version stays 1.1.0.

Not decided here: the tunnel software, the shared state store, the server's instance type and budget figure, and the IAM each piece needs. These are the open list below, with the items the reworked spec now settles marked as such.

## Alternatives considered

The repository and the Author's words already held these options. The Author's decisions rule out the first three. The fourth is ruled out by "Keep the cap as-is." The fifth is ruled out by decision 10, and the sixth by decision 11.

- **Laptop only, the cloud limited to the thin services** (ADR 0001, and spec 001 as drafted on 2026-09-07). Not chosen: "That ec2 server will end up being the main server running."
- **A cloud VM for demonstration only** (spec 001 as drafted, Assumptions). Not chosen: the same sentence.
- **Bedrock first on EC2, the Anthropic API second.** Not chosen: "anthropic api will answer first."
- **Raising the ceilings to cover the server.** Not chosen: "Keep the cap as-is."
- **Route 53 failover records moving DNS between the hosts** (point 1 as put). Not chosen: "Relay picks the host (Recommended)."
- **An on-demand tunnel end.** Not chosen: "Spot."

The Author's answers to the Principle I and version questions name the option he chose and its reason. They do not record the other options, so none are listed. The Author did not record reasons for the choices above beyond his words.

## Consequences

**What this changes in the constitution.** The text is in the proposed file. Nothing is applied: the constitution changes only by the Author's hand (Governance; Principle III). Principle I is unchanged. Version 1.0.1 becomes 1.1.0, as the Author chose. Last Amended 2026-10-07 becomes 2026-11-09. The file has no sync-impact line, so none is added.

Each change, old → new:

- **Principle V**, the sentence on the local tier and the cloud bill (only its reason changes):
  - old: "Budgets are small on purpose, and the local tier exists so the cloud bill stays near zero."
  - new: "Budgets are small on purpose, and the local tier exists so the model spend stays near zero. The model-spend ceilings count model calls only; the server's own budget is separate from them (ADR 0044)."
- **Technology Standards, Cloud**, the hosting list (decision 12 removes the Bedrock fallback path from the always-on list):
  - old: "The cloud hosts only what must be always-on and cheap: the static site and edge, the thin API/relay, the kill-switch state, budgets and alerting, and the Bedrock fallback path."
  - new: "The cloud hosts what must be always-on and cheap: the static site and edge, the thin API/relay, the kill-switch state and the meter's state, budgets and alerting. Bedrock is called from the serving host. The cloud may also host the production stack on one VM, without the local model server, as the default production host (ADR 0044)."
- **Technology Standards, Local tier**, the last two sentences:
  - old: "Deployments are pull-based. Production MUST function when it is off, via the cloud fallback within its sub-budget or via degraded mode."
  - new: "It serves production whenever the Author runs it (ADR 0044). Deployments are pull-based. Production MUST function when it is off, via the cloud host and its paid routes within the ceilings and adapter caps, or via degraded mode."
  - The same bullet's "exposed only through an outbound tunnel" is kept, unchanged, as decision 6 requires.
- **Technology Standards, Model access**, the routing sentence:
  - old: "Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget."
  - new: "Routing policy is configuration, set per host: on the laptop, the initial policy is local-first with one paid fallback, Bedrock or the Anthropic API, inside its capped $2-a-day sub-budget; on the cloud VM, the Anthropic API answers first, with Bedrock as its second paid route, inside the $5-a-day and $20-a-month ceilings and the adapter caps (ADR 0044)."
- **Observability**, the Langfuse clause (decision 12):
  - old: "Langfuse, self-hosted on the local tier, for LLM traces and evaluation records;"
  - new: "Langfuse, self-hosted in the stack on whichever host serves, for LLM traces and evaluation records;"
- **Governance**, the version line:
  - old: "**Version**: 1.0.1 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-10-07"
  - new: "**Version**: 1.1.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-11-09"

**Intent 000, not a constitution clause, not edited here.** Its cost constraint reads "$5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero, and that is part of the story, not a workaround." Under this decision the $5 and $20 are model spend, and the server is outside them. Its line "Everything containerized; the entire production stack runs on my local machine calling local models." is superseded for EC2 by decision 1. Both are for the Author to revise.

**Money.** The model ceilings do not change. The server's cost is unknown until the Author sets its budget and instance type. This ADR gives no estimate of its own, and the figures in point 5 are the session's unmeasured estimates. Every new feature needs a cost estimate (CLAUDE.md). Spec 001 states one (SC-002, FR-021).

**The 2026-09-07 outline's numbers, and the reworked spec's.** Earlier drafts of this ADR cited spec 001 by the outline's numbers. The reworked spec at 8acc2686 settles each conflict below under its own numbers. Where a number changed, the mapping says so.

| Outline (2026-09-07) | Reworked spec at 8acc2686 | What changed |
|---|---|---|
| Header: FR-005 to FR-008; SC-002, SC-003; User Stories 2 to 5 | FR-017 to FR-024, FR-029, FR-043, FR-044, FR-052 to FR-054, FR-063 to FR-072, FR-075, FR-076; SC-001, SC-002, SC-007, SC-018; User Stories 2 to 7 | the reworked spec's numbers now carry these decisions |
| FR-001 (Terraform only) | FR-001, FR-072 | run-time actions change state only; IAM is FR-070 |
| FR-005 (the VM runs the compose file unchanged) | FR-043, FR-044 | EC2 runs without the model server (FR-044) |
| FR-006 (no inbound; the tunnel) | FR-052, with FR-076 for the tunnel's end | the tunnel's end is settled in decision 11 |
| FR-007 ("a cloud store replicated from the stack") | FR-017, FR-019 | the cloud store is the record both hosts use, not a replica |
| FR-008 (budgets and anomaly detection) | FR-022 to FR-026 | the server budget is FR-021 |
| FR-009 (the dashboard snapshot) | FR-057 | refreshed by whichever host serves |
| SC-002 ("≤ $10/month" idle) | SC-002, FR-021 | the server budget, set by the Author after measuring |
| SC-003 (5 seconds, local tier off) | SC-001 | an exception for a window in which no host serves |
| Assumptions ("the full stack for demonstration only") | FR-044 | superseded |
| Point 1 (DNS failover moves visitors; decision 10) | FR-029, FR-054, FR-063, FR-065 | the relay picks the host; the health check only wakes EC2 (FR-065) |
| The tunnel's end on spot (decision 11) | FR-052, FR-076 | the site rests while it is gone |
| US2 AS2 (hello through the relay "routes exactly as spec 000 defines") | User Story 6; User Story 3, scenarios 2 and 3; FR-067 | a route per host |
| US3 AS2 ("the relay routes to the fallback within the sub-budget") | User Story 3, scenarios 2 and 3; FR-067 | the sub-budget belongs to the laptop's route only |
| US4 AS2 ("routing falls back within 5 seconds" when the tunnel drops) | User Story 4, scenarios 5 and 6; FR-054, FR-066; SC-007; FR-076 for the tunnel's end | the window has a stated exception (decision 8) |
| US5 AS2 (the meter in the stack; the relay sees its state "within 10 seconds") | User Story 2, scenario 4; SC-008; FR-017, FR-019, FR-030 | the shared state is the record both hosts use |
| Rule R1, "every primary must be local" (spec 000's contracts/config-files.md; `services/gateway/src/config/validate.ts:328-329`) | FR-067 | the laptop's route keeps R1; EC2's route names paid adapters only |
| The route selected by `H4_ENV` (`config/routing.yaml`'s header) | FR-067 | the route is selected by host, since both hosts run prod |
| Spec 000's FR-031 (a meter per stack) | FR-017 | for prod, one shared meter |

**Conflicts in documents other than spec 001, not amended here.**

- Intent 000's cost constraint and its "entire production stack" line (above).
- Intent 001's cost line, which puts infrastructure inside the $20 ceiling. The Author's words put the server outside it.
- Disclosure rows S2, V2, F1 and F3 name prod's route as one host. ADR 0041 holds that the Anthropic API as the paid route waits on the Author's price, cap, key, and his words in `docs/data-flow-disclosure.md`'s row F3, and that the route change is "the one line" `fallback: anthropic`. Decision 1 makes the Anthropic API the route on EC2, so those preconditions apply before EC2 sends a call. The rows need the EC2 route before EC2 serves visitors.
- Two more flows leave the local tier and need rows of their own: the shared meter and kill-switch state in the cloud (decision 7), and the outbound tunnel and its end (decisions 6 and 11). This ADR adds neither row.

## Open, for spec 001

These items stay here for the record. Where the reworked spec at 8acc2686 now settles one, its number is given, and the answer is the spec's reading, which the Author can overturn unless it says it is his.

1. **The tunnel software and the health check.** Settled at 8acc2686 by FR-052 (the tunnel ends on the tunnel end, a spot instance, on September's OpenSSH design, FR-076) and by FR-054 (the relay checks each host every second, and the failover's health check probes the laptop's path through the tunnel). Still open: whether the plan keeps September's OpenSSH design or uses another tunnel software. Our question, now answered by FR-054: a laptop that only dials out has no address to probe, so the probe runs through the tunnel. History: the 2026-09-07 outline left the health check open, and decision 10 replaced the DNS failover it was part of.
2. **The shared state.** Which cloud store holds the budget and kill-switch state (decision 7), and what the laptop's gateway reads. Spec 001 at 8acc2686 answers what each host does when that store is unreachable: unreachable, or unconfirmed within 10 seconds, is degraded (FR-019, FR-030, SC-008). The store's product is the re-plan's.
3. **Spot interruption, of EC2 and of the tunnel's end.** Settled at 8acc2686. For EC2: the same gap plus an alert (question 17; FR-071; SC-018). For the tunnel's end: FR-076, an alert on both channels; while it is gone, the edge rests every dynamic request even with a host up, and the start function does not start EC2; on return, the services restart without a person, the tunnel reconnects, and the start function runs once. History: decision 11 left this response open.
4. **The schedule.** Spec 001 at 8acc2686 answers: spot around the clock, with the schedule in reserve (question 15; FR-069). Open: which 8 to 12 hours, and who sets them, if the schedule is used.
5. **The server's instance type and budget figure, and its limits.** Spec 001 at 8acc2686 answers the limit: at the server budget, EC2 stops until the Author restores it (FR-021, FR-023). Neither the instance type nor the figure is set (question 14: measured, then the Author sets it).
6. **What starts and stops EC2, and with which IAM permissions.** Decision 5 keeps the Lambda and the laptop's stop. Spec 001 at 8acc2686 answers the permissions provisionally (question 16, not asked: FR-070, FR-072). Open: the Author's own answer on the IAM, since changing IAM is a human act, and the Terraform question, which FR-001 and FR-072 answer for now.
7. **What serves while no host does.** Settled at 8acc2686 by FR-075: no model call; the edge, the static site, the last snapshot, the relay's status answer and degraded body, the shared state, the budgets and their actions, the health check, the start function, the tunnel's end, and AWS-side alerting stay up. While the tunnel's end is gone, the edge's own degraded body stands in for the relay (FR-076). FR-028 covers the static site.
8. **The sub-budget's reading on each host.** Spec 001 at 8acc2686 takes the Author's answer as its reading: the $2-a-day sub-budget is the laptop's rule only, and spec 000's FR-030 is amended by name (Scope; FR-067). Not decided by the Author in his own words.
9. **What "it" refers to** in the first quote (see Context). Spec 001 records it per host, as this ADR does. Still his to say.
10. **Whether a stopped instance's remaining charges**, such as storage and addresses, fit the server budget. Spec 001 at 8acc2686 counts EC2's stopped time inside the server budget (FR-021). The size of those charges is not known.

## Links

- Spec: [001 spec](../../specs/001-cloud-elevation/spec.md) (reworked at 8acc2686) · Intent: [001 intent](../../specs/001-cloud-elevation/intent.md)
- Constitution amendment, proposed and not applied: [2026-11-09-constitution-1.1.0.patch](../merge-requests/2026-11-09-constitution-1.1.0.patch)
- Merge-request note: [2026-11-09-docs-001-ec2-default.md](../merge-requests/2026-11-09-docs-001-ec2-default.md)
- Amends: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md) · Related: [ADR 0041](0041-the-anthropic-api-as-a-second-paid-adapter.md), [ADR 0005](0005-telegram-and-smtp-alerting.md), [ADR 0013](0013-local-until-publication.md)
- PR: none until publication. The merge-request note above carries the record until then.
