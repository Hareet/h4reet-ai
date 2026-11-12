# Feature Specification: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Feature Branch**: `001-cloud-elevation` (this rework on `spec/001-cloud-elevation`)

**Created**: 2026-09-07 · **Revised**: 2026-10-12 · **Reworked**: 2026-11-09

**Status**: Approved by the Author on 2026-11-10 (tasks.md T000; Clarifications, Session 2026-11-10). Reworked 2026-11-09.

**The rework.** On 2026-11-09 the Author decided where prod runs (Clarifications, Session 2026-11-09). [ADR 0044](../../docs/adr/0044-ec2-as-prods-default-host.md) records the decisions; proposed on branch `docs/001-ec2-default` when this rework was written, it is accepted on `main` (67028747). In short: EC2 runs prod by default, without the local model server, with the Anthropic API answering first and Bedrock second, both inside the $5 and $20 ceilings and the adapter caps. The laptop serves, local-first, when the Author runs it, with its $2-a-day fallback sub-budget. One host serves at a time. A relay on the tunnel end, a small spot instance in the account, moves visitors between the two, and the laptop reaches it through an outbound tunnel. One meter, held in the cloud, counts model spend from both hosts. The server has a budget of its own, outside the model ceilings. This replaces the design of September and October, in which the laptop served and the cloud was a thin control plane. The September plan, research, data model, tasks, quickstart, and contracts were replaced by the re-plan of 2026-11-09 (plan.md), whose questions 1 to 4 the Author answered that day; their answers are in Clarifications and applied here. The same day the Author answered the clarify questions 13, 14, 15, and 17: the tunnel ends on a small instance in the account, separate from EC2, run around the clock on spot (the plan's question 2); the plan measures the stack and he sets the server budget's figure; EC2 runs on spot around the clock; and a spot interruption is the same gap as EC2's start, plus an alert. Question 16, the IAM, was not asked: the session took its recommended option provisionally, as a default the plan carries, not his answer (Clarifications). No needs-clarification marker remains. The constitution change this design needs, version 1.1.0, was proposed as [the 1.1.0 patch](../../docs/merge-requests/2026-11-09-constitution-1.1.0.patch), with the two sentences he added on 2026-11-09, and the Author applied it at T001 (3c89a8b0). No infrastructure task started until the Author applied it, and he has (Assumptions).

**Input**: `intent.md` in this folder (accepted), and the Author's decisions and answers of 2026-11-09, quoted in full under Clarifications. The intent's proposed outcome, in the Author's words: "Terraform in one AWS account stands up the thin, cheap, always-on control plane — DNS and TLS for h4reet.ai, the static site at the edge, the relay, the kill-switch state, budgets and anomaly detection, the alert path — and a VM that runs the very same compose definition from spec 000. The local tier reaches the cloud through an outbound tunnel and pulls its deployments. The public dashboard stays up when the machine is off." Its constraints: "One account; environments by VM, IAM role, tag, budget. Plan in PR, human apply. Idle cloud cost must leave headroom for the Bedrock fallback. No inbound ports on the local tier; no self-hosted runners." The intent's cost lines ("All of it must fit the same $5/day, $20/month ceiling"; "Idle infrastructure target ≤ $10/month") are superseded by the Author's later words, "The server size and budget is outside the $20 model spend cost". The intent stays his to revise; this spec doesn't edit it (Assumptions, "The intents' lines").

## Clarifications

### Session 2026-11-10

The Author's approval of this spec and its plan, tasks.md T000, verbatim, as he went to bed on 2026-11-10:

> "Let's approve the t000 and spec 001 plan. Let's have you build it out but not push or try anything in the cloud yet, i will do that in the morning, but you can have everything ready and verified by then. Use the latest dependenices adn versions for aws services, plugins"

What his approval takes, each a reading beside his words, not in their place:
- **The spec and the plan are approved,** and with them plan.md §13's amendments, which are in this spec, and §13's list of the other specs' amendments, which travel in the groups that need them.
- **Plan Q5, Q6, and Q7, and the clarify question 16,** stand at their provisional defaults: the session's answers of 2026-11-09, not his words, which his approval leaves standing (Session 2026-11-09, below). He can still overturn any of them, and a different answer changes the tasks that cite it before they start.
- **Plan Q8 stands at the plan's recommended option, A,** taken provisionally under the session's reading of his approval, as Q5 to Q7 are: his words approve "the t000 and spec 001 plan" and choose neither option. Under A, his wording for the relay on spot goes into the still-unapplied 1.1.0 patch, on `docs/001-ec2-default`; that wording is his to write or confirm at T001, and he can still choose B. So no deviation is named for it here (Assumptions, "The relay on spot, against the Cloud standard").
- **Since then:** T001 is done: the Author applied constitution 1.1.0 (3c89a8b0), with question 8's option A in the Cloud standard's words "the thin API/relay on spot capacity where the Author accepts the gap (ADR 0044)", and accepted ADR 0044 (67028747).
- **The session's other listed defaults,** as the session reads his approval: T001, his constitution patch, comes before any group touches `infra/`, as the default order; ADR 0044 and the ADRs of plan §14 stay proposed until his merges accept them; and T008's pins are the latest releases the session could establish on 2026-11-10, from "Use the latest dependenices adn versions for aws services, plugins", which he confirms in his terminal at T011 (research.md R-02).
- **"build it out but not push or try anything in the cloud yet"** is read as: agent sessions build and verify group 1 on its branch tonight, with no push, no cloud call, and no `terraform init` or plan against the network; he runs the cloud steps himself, "in the morning". Building now, before T001, is a named deviation (Assumptions, "The constitution first").

### Session 2026-11-09

The Author's decisions and answers, verbatim, as ADR 0044 records them. Multiple-choice answers are quoted as the October sessions quote them: the option he chose, then that option's text as it was offered. Each reading is this spec's. It sits beside his words, never in their place, and he can overturn it.

- **Where prod runs, and what answers first.**

  > "On the ec2 server, anthropic api will answer first. That ec2 server will end up being the main server running, I will rarely be running the stack from my laptop other than a demo to showcase or talk about, but it should be the local-first primary scenario we built for."

  Reading: EC2 is prod's default host, and there the Anthropic API answers first (FR-063, FR-067). The laptop serves when he runs it, local-first, in ADR 0001's order (FR-064, FR-067). "it should be the local-first primary scenario we built for" is read as the laptop's stack. It stays a production tier that runs the whole topology with one command (FR-045), as Principle I requires; "a demo" is read as how often he runs it, not what it is (ADR 0044, decision 2). ADR 0044 notes that "it" could also mean the stack's design as a whole (its open item 9).

- **The ceilings.**

  > "Keep the cap as-is at $20 a month, $5 a day."

  Reading: the model-spend ceilings stay $5 a day and $20 a month, with spec 000's warnings at 70%, and spec 010's $20 monthly cap on the Anthropic adapter (`config/budgets.yaml`). They count on one meter across both hosts (FR-017, FR-020).

- **His first picture of the workflow.**

  > "Here is how we are imagining the move to ec2 workflow: That is the default, and if i run the stack locally, the bootup should ask me what my ip address is, and a script that can configure route53 etc to point to my IP, and the necessary router / firewall settings that would need to change. If i am running locally, then the ec2 should be shut off and not incurring costs. The kill-switch monitor should turn the ec2 on if it detects that the laptop is not present or the local ip address route is offline, then a lambda function can update route53 back to the ec2."

  Reading: these parts stand. EC2 is the default. While the laptop serves, EC2 is stopped (FR-063, FR-064). When the laptop goes, EC2 starts without a person (FR-065). The approved points below replaced three parts: the address prompt, the router and firewall changes, and a function that rewrites Route 53. "not incurring costs" is read as no running hours. A stopped instance still bills for its storage and any public address, and the server budget counts those (FR-020, FR-021).

- **The server's budget, and Bedrock.**

  > "The server size and budget is outside the $20 model spend cost. Yes, bedrock stays as the ec2 second paid route."

  Reading: the server's cost is outside the model ceilings and has a budget of its own (FR-020 to FR-022). "The server" is read as every cost of the account that isn't a model call: EC2, running or stopped, and the edge, DNS, the shared state, the health check, the start function, and the rest. Bedrock is EC2's second paid route, after the Anthropic API (FR-067).

- **The five points, and his approval.** The session put five points to him, as ADR 0044 records them (decisions 5 to 9). Their words are the session's, not his:
  1. "Route 53 can switch DNS by itself." "Failover" records plus a health check on the laptop move DNS in both directions automatically, with no Lambda for DNS. You'd still want a Lambda, fired when that health check fails, to start EC2. Your local startup script would stop EC2 when the laptop takes over.
  2. "I'd avoid pointing DNS at your home IP." The site needs to stay reachable while you're running it locally, and pointing hareet.ai at your home IP has costs: "Anyone who looks up hareet.ai gets your home IP, and from it a rough location." "It needs port 443 forwarded on your router, plus Windows firewall and port-forwarding rules to reach WSL." "Some internet providers block incoming 443 or share one public IP among customers, so it may not work at all." "The constitution says the laptop is "exposed only through an outbound tunnel"." With a tunnel, the laptop dials out instead, so there's no IP prompt and no router changes. I recommend that. Spec 001 decides it with you.
  3. "The budget needs one counter." Each machine has its own database, so if each counts spend separately, both could spend the $20. The budget and kill-switch state need to live in one place in the cloud that both read. Spec 001's design already plans for that.
  4. "There's a gap at switchover." When the laptop drops, EC2 has to start and the stack has to boot, which takes a few minutes. Visitors see the twin's "resting" message in the meantime.
  5. "Server size." Even without the model server, the stack runs a database, Langfuse with ClickHouse, Grafana and Prometheus. That's probably about 8 GB of memory, roughly $50 a month on demand if it's always on, less if spec 001 trims the stack. That's the figure to compare against the separate server budget you'll set.

  ADR 0044 adds: "The 8 GB and the $50 a month are the main session's unmeasured estimates, not figures from the repository or the Author." This spec uses neither as an estimate.

  His reply:

  > "Okay, all of your feedback is approved. for server size, we will try to use spot instances, or only keep the server online for 8-12 hours a day."

  Reading: point 1 is FR-054, FR-064, and FR-065. The first reading, that DNS moves visitors between the hosts by health, is superseded by the Author's answer to the plan's question 1, below: the relay on the tunnel end moves them, and Route 53's health check only wakes EC2. Nothing writes Route 53's records at run time (FR-072). Point 2 is FR-052; where the tunnel ends is question 13, answered below. Point 3 is FR-017 and FR-019. Point 4 is FR-066. Point 5's figures are estimates the plan measures and prices before anything is applied (question 14, answered below). "we will try to use spot instances, or only keep the server online for 8-12 hours a day" left the choice open; question 15, answered below, chose spot.

- Q: EC2 answering first with an API is a question for Principle I's "The system MUST prefer on-device or self-hosted inference where it meets the quality bar." "How should the amendment handle that?" → A: "Record the reason (Recommended)", which read: "Principle I stays as written. ADR 0044 records why EC2 complies: within the server budget EC2 has no GPU, and a model run on its CPU wouldn't meet the twin's quality bar, which your laptop's GPU model does. So the API is what meets the bar there, and the laptop stays self-hosted-first." Reading: EC2 runs no model server (FR-044; ADR 0044, decision 1), and Principle I is unchanged (Constitution Check).
- Q: "Which version?" → A: "1.1.0, MINOR", which read: "Principle V's rules stay (the meter, the kill switch, degrading). Only its reason changes. This follows general semantic versioning rather than the rule's text." Reading: ADR 0044 records that the drafts' reviewer read the changed Principle V sentence as a redefinition, and so as MAJOR, and that the Author chose 1.1.0. This spec cites the amendment as 1.1.0.
- Q: "What should limit paid spend on EC2?" → A: "The $5 and $20 ceilings (Recommended)", which read: "On EC2, the daily $5 and monthly $20 ceilings and the adapter caps limit the Anthropic API and Bedrock. When a ceiling trips, the twin rests until you reset it, as today. The $2-a-day sub-budget stays the laptop's fallback rule." Reading: neither of EC2's paid routes counts against the $2-a-day sub-budget. Both count against the ceilings, and each against its adapter cap if it has one; today only the Anthropic adapter has one, $20 (FR-017, FR-067). Spec 000's FR-030, whose sub-budget "limits the calls routed to Bedrock as fallback", is amended by name to the laptop's fallback (Scope). When a ceiling trips, the room shows `cannot_talk.budget`, spec 002's class for a tripped kill switch.

The clarify questions, answered by the Author the same day. Each is quoted as it was put to him, then the option he chose and that option's text.

- Q13: "Spec 001: while your laptop serves, EC2 is off, so the laptop's outbound tunnel needs somewhere else to end. Where should it end?" → A: "Tiny always-on relay (Recommended)", which read: "A small always-on instance in your AWS account, separate from EC2, using September's OpenSSH tunnel design. No third party carries visitors' messages, and the health check sees the whole path. The repo's research priced it in October at about $2.20 a month for a t4g.micro spot instance plus $3.65 for its address; that gets re-priced in the plan." Reading:
  - The tunnel ends on **the tunnel end**, a small instance in the account, separate from EC2, run around the clock (on spot, by the plan's question 2), with September's OpenSSH design (research.md R-11): reverse forwards that the far side limits to the listed ports (FR-052). The 2026-10-12 promise holds: no third party carries what the tunnel carries.
  - The health check probes the laptop's health path at the tunnel end's public address, through the tunnel, so it fails when the tunnel end, the tunnel, or the laptop's stack fails (FR-054; "the health check sees the whole path").
  - The option's title says "relay"; its text describes only the tunnel's end. This first reading kept `services/relay` off the tunnel end and raised the question for the plan. The plan's question 1, answered below, settled it: `services/relay`, the thin API with the public cap, the kill-switch read, and the host choice, runs on the tunnel end (FR-029), and answers the resting reply while no host serves (FR-066).
  - The tunnel end runs all month, inside the server budget. The October prices in his option are research.md R-05's, re-priced in the plan.
- Q14: "Spec 001: the server's monthly budget and instance type. If the server budget is crossed, the spec stops EC2 until you restore it. How should the figure be set?" → A: "Measure, then you set it (Recommended)", which read: "The plan measures the stack without the model server and prices the smallest instance types that fit, spot and 8 to 12 hours a day, from AWS's pages. You set the figure before the first apply." Reading: FR-021. The question as put stated FR-023's response, "the spec stops EC2 until you restore it", and he chose an option without changing it, so FR-023 stands. With question 15's answer, the plan prices spot first; the 8-to-12-hour price is for the schedule kept in reserve.
- Q15: "Spec 001: you said "we will try to use spot instances, or only keep the server online for 8-12 hours a day". Which should the plan build?" → A: "Spot, around the clock (Recommended)", which read: "A spot instance running all day, with a schedule kept in reserve. It's your first choice, and only one mechanism then starts and stops EC2." Reading: FR-069. EC2 is a spot instance, around the clock. The schedule is in reserve: it arrives only by his patch, with an ADR, and the hours don't arise until then. "only one mechanism then starts and stops EC2" is read as the handover's one mechanism, with no schedule beside it: the start function, the guard, the laptop's loop, and the Author's own commands (FR-064, FR-065, FR-069, FR-071); AWS's own stop on an interruption is question 17's case.
- Q17: "Spec 001: when AWS takes a spot instance back, which can happen with two minutes' notice, what should happen?" → A: "Same gap, plus an alert (Recommended)", which read: "Like the start-up gap you already accepted. You get an alert, and visitors see the resting message until capacity returns or you start the laptop." Reading: FR-071. "until capacity returns" is read as the spot instance stopping rather than terminating, so that it starts again when capacity returns (FR-069).
- Q16, not asked: "Which IAM do the start function and the laptop's stop use?" (FR-070). Taken provisionally by the session on 2026-11-09, as a default the plan carries; his approval at T000 leaves it standing (Session 2026-11-10). These are not the Author's words, and he can overturn it: "all in Terraform, human-only. The start function's role may start only the one tagged instance; the laptop's stop uses its own permission set, which may stop only that instance, through a short-lived SSO session." The session's reason: the option follows the constitution directly, since IAM changes are a human act and infrastructure is Terraform-only.

The plan's questions, answered by the Author the same day (plan.md, Questions for the Author). Each is quoted as it was put to him, then his choice and the option's text.

- Plan Q1: "Spec 001's plan: how should visitors reach whichever machine is serving (your laptop or EC2)?" → A: "Relay picks the host (Recommended)", which read: "The site's edge always talks to the tiny always-on relay (your tunnel's end). The relay checks both hosts every second and sends each request to the laptop if it's up, else EC2, else the resting reply. Switching takes seconds, and neither host needs a public certificate. Route 53's health check only wakes EC2. This changes the DNS-failover design you approved, so the spec's wording changes with your OK." Reading: this answer supersedes the DNS-failover reading of point 1. The relay runs on the tunnel end, in front of both hosts (FR-029). It checks both every second and picks the host (FR-054), and answers the resting reply when neither serves (FR-066). Route 53's health check only wakes EC2 (FR-065). Its wording changes are applied throughout this spec (plan.md §13).
- Plan Q2: "Spec 001's plan: the tiny always-on instance where your laptop's tunnel ends (and, with the relay option, every request passes through). On demand or spot?" → A: "Spot", which read: "About $2.20 a month (October's figure). AWS can take it back, and while it's gone the site rests, even if the laptop or EC2 is up." Reading: FR-076. The tunnel end is a persistent spot instance that stops on interruption. The warning is alerted. While it is gone, the edge serves the site and the resting reply. It comes back when capacity does. This wasn't the plan's recommendation (on demand), and the plan names the risk.
- Plan Q3: asked whether to add both sentences, the Observability standard's "Langfuse, self-hosted on the local tier" and the Cloud standard's always-on "Bedrock fallback path", to the 1.1.0 amendment before he applies it → A: "Add both (Recommended)", which read: "The patch gains two small wording changes: Langfuse self-hosted in the stack, and Bedrock called from the serving host. Still 1.1.0. The ADR's old → new list grows to match." Reading: neither is a deviation once the amended patch, on `docs/001-ec2-default`, is applied (Constitution Check).
- Plan Q4: "…How should offline demos work?" → A: "Use ENV=dev offline (Recommended)", which read: "Prod needs the network. For an offline demo you run the dev stack, which keeps its own local counter." Reading: Assumptions, "The laptop without a network", is decided.
- Plan Q5 to Q7, not asked. The session took their recommended options provisionally on 2026-11-09. These are not his words, and he can overturn them. His approval at T000 leaves them standing (Session 2026-11-10):
  - the resting message's words are a follow-up in spec 002's lifecycle, in words he writes;
  - "it" means the laptop's stack;
  - question 16's IAM default, plus the guard's stop-only role, and the start function's reads of the health check and the tunnel end's state (FR-070). Added after the analysis of 2026-11-09, in the same provisional standing: the guard's read of the server action's status (FR-071), `h4-laptop-bedrock`, the ordinary role the laptop's permission set assumes and the budget action's deny attaches to (FR-023; to confirm), and the tunnel end's reads of AWS's state for the dashboard (plan §11).
- Plan Q8, asked at T000: the relay runs on spot, and the Cloud standard, in force and as amended, lists it among what "must be always-on". The plan offers two ways to carry it (plan.md, Question 8). His approval at T000 chooses neither option; the session takes option A provisionally under its reading of that approval, as it took Q5 to Q7, and the wording in the 1.1.0 patch is his to write or confirm at T001 (Session 2026-11-10).

**What these decisions change in the earlier answers.** The answers of 2026-10-11 and 2026-10-12 below stand as given. These are superseded, in whole or in part:
- Question 2, production's meter of record and the split between the local path and the fallback gateway: replaced by EC2 as the default host, one host at a time, and the shared meter (FR-017, FR-063). The laptop keeps its paid fallback (ADR 0044, decision 2), so "Your machine's production drops its own paid route" no longer holds.
- Question 3, infrastructure cost booked on the meter inside the same ceiling: replaced by "The server size and budget is outside the $20 model spend cost" (FR-020).
- Question 6, the idle target "≤ $10/month": replaced by the server budget, whose figure the Author sets after the plan measures and prices (question 14; FR-021). Of its reading's options (always on, on demand or spot, or started only while the local tier is down), question 15 chose spot around the clock, with the Author's scenario of 2026-10-12 as the design for the laptop's handovers.
- Question 8, the AWS-side breach: still automatic and still provider-side, now for Bedrock on both hosts. The server budget gets its own action (FR-023).
- Question 11, where the tunnel ends: still "inside the project's AWS account", but no longer "on the cloud VM, which is always on", since EC2 is stopped while the laptop serves. Question 13 put it on the tunnel end, a small instance of its own, run around the clock on spot.
- Questions 1, 4, 5, 7, 9, 10, and 12 stand. Question 10's snapshot is refreshed by whichever host serves (FR-057).

**ADR 0044's conflicts and open items, and where this spec settles each.** ADR 0044 cites spec 001 by the 2026-09-07 outline's numbers, which this spec's traceability table maps (Assumptions). Its quotes, such as "a cloud store replicated from the stack", are the outline's words.

| ADR 0044 names | In this spec | Settled by |
|---|---|---|
| US2 AS2: hello through the relay "routes exactly as spec 000 defines" | User Story 6 (EC2); the routing is User Story 3's scenarios 2 and 3 | FR-067: a route per host; EC2's paid routes inside the ceilings and adapter caps |
| US3 AS2: "the relay routes to the fallback within the sub-budget or returns the degraded response" | User Story 3, scenarios 2 and 3 | FR-067; "fallback" and the sub-budget belong to the laptop's route only |
| US4 AS2: "routing falls back within 5 seconds" when the tunnel drops | User Story 4, scenarios 5 and 6 | FR-054: the relay sees a host fail within a second; FR-066's resting reply during the gap; SC-007 |
| US5 AS2: the meter in the stack; the relay sees its state "within 10 seconds" | User Story 2, scenario 4; SC-008 | FR-017, FR-019, FR-030: the shared state is the one record both hosts use |
| FR-007: "a cloud store replicated from the stack" | FR-017, FR-030 | FR-017, FR-019: the cloud store is the record, not a replica |
| SC-003: 5 seconds with the local tier off | SC-001 | SC-001's exception for a window with no host |
| SC-002: "≤ $10/month" | SC-002 | FR-021, SC-002: the server budget, whose figure the Author sets after the plan measures (question 14) |
| Assumptions: the full stack in the cloud "for demonstration only" | Assumptions | FR-044 |
| The Cloud standard's "Infrastructure exclusively via Terraform" | FR-001 | FR-001, FR-072: run-time actions change state only; the IAM is FR-070 (question 16, provisional) |
| Rule R1, "every primary must be local" (spec 000's contracts/config-files.md; `services/gateway/src/config/validate.ts`) | Scope | FR-067: R1 holds for the laptop's route; EC2's route names paid adapters only |
| The route selected by `H4_ENV` (`config/routing.yaml`'s header) | Scope | FR-067: selected by host, since both hosts run prod |
| Spec 000's FR-031, a meter per stack | Scope | FR-017 |
| Open item 1, the tunnel, and what the health check probes | FR-052, FR-054 | question 13: the tunnel end, a small instance in the account, run around the clock on spot; the check probes the laptop's health path at its address |
| Open item 2, the shared state | FR-017, FR-019 | its properties here; the store's product is the re-plan's; unreachable is degraded |
| Open item 3, spot interruption | FR-071 | question 17: the same gap, plus an alert |
| Open item 4, the schedule | FR-069 | question 15: spot around the clock; the schedule in reserve |
| Open item 5, the instance type, the budget figure, and the server's limits | FR-021, FR-023 | question 14: measured, then the Author sets the figure; FR-023 for the response (EC2 stops), unchanged by his answer |
| Open item 6, the IAM to start and stop EC2, and Terraform | FR-070, FR-072 | question 16, taken provisionally (not asked); FR-072 for Terraform |
| Open item 7, what serves while EC2 is stopped and the laptop is off | FR-075 | nothing calls a model; the edge, the site, the snapshot, the shared state, the budgets, and alerting stay up |
| Open item 8, the sub-budget's wording on each host | FR-067; Scope | the Author's answer: the laptop's rule only; spec 000's FR-030 amended by name |
| Open item 9, what "it" refers to | Clarifications | recorded per host, as ADR 0044 does; still his to say |
| Open item 10, a stopped instance's charges | FR-021 | inside the server budget |

### Session 2026-10-11

Multiple-choice answers are quoted as given: the option the Author chose, then that option's text as it was offered. Where the spec reads more into an answer, the reading follows it and is marked as such. The session asks the spec's twelve open questions in order.

- Q: Should the GitHub-only requirements stay in spec 001 as after-publication items, or move to the publication spec the way spec 000's did? These are the plan posted on pull requests, the protected apply, and CI's access to AWS through OIDC. (FR-014 to FR-016) → A: "B" (recommended), which read: "Move them word for word to the publication spec, through a carry-over file like spec 000's `publication-carryover.md`. Spec 001 keeps FR-005 and FR-007 and closes on local criteria. ADR 0008 records the move." Reading: FR-014 to FR-016, SC-015, User Story 1's scenarios 7 to 9, the Degraded Modes row for CI, and flow C12 move whole to `publication-carryover.md` in this folder, and their numbers aren't reused. The move updates ADR 0013's Consequence for spec 001 ("in spec 001, plan-in-PR and the protected apply") the way ADR 0014 updated spec 000's.

### Session 2026-10-12

Continued from the session of 2026-10-11, and quoted the same way.

- Q: While your machine is up, what should answer visitors' requests, and which stack should hold production's one meter and kill switch? (FR-017) → A: "D" (recommended), which read: "Your vision. While your machine is up, the relay sends requests through the tunnel to its web server (spec 000's `edge`), its gateway, and its model, and later the twin. While it's down, the relay sends them to a fallback gateway on the cloud VM, which holds the one meter and kill switch. Your machine's production drops its own paid route." Reading:
  - **How the question changed.** It was asked three times. The first options were the draft's: the cloud VM's gateway, the local tier's gateway, or a store both gateways meter against. The Author then proposed a scenario of their own: "1) When running local, an endpoint is available that Lambda polls. 2) If lambda detects, local is up, does nothing. If it detects local is down, it looks at aws spot instance price, increases it very slightly and brings up an ec2. I should be able to configure whether this lamda checking pipeline should even run, as in does it check hourly, or i can keep it off for days at a time if I am aware that no one is visiting or checking for the website." The scenario is about how the cloud VM runs, so it moved to question 6. The Author also asked whether a port forwarded to their machine had to be ruled out ("Is this necessary to rule out?"). Choosing D keeps Principle IV's outbound tunnel.
  - **The split.** While the local tier is healthy, its production stack answers visitors on the local path. The relay sends each request through the tunnel to the stack's `edge` service, as spec 000's research expected ("Spec 001's tunnel attaches to `edge`"). While the local tier isn't healthy, the relay sends requests to the fallback gateway on the cloud VM. Production's environment splits into a cloud file and a local file, as spec 000's plan interview anticipated: "Spec 001 can split prod into cloud and local files later."
  - **The paid route moves.** The local file keeps no paid route. Spec 000's T105 adds a Bedrock route to prod for spec 000's own criteria, and that route moves to the cloud file when this spec ships. Production's Bedrock identity becomes the fallback gateway's (FR-013).
  - **The kill switch.** The relay reads the meter of record's kill switch before it forwards on either path (FR-030). The local stack keeps its own spec 000 state, which never spends. If the local path answers degraded, the relay counts that as a failed local path and falls back in FR-022's order. Only the meter of record's kill switch stops every answer.
  - **What crosses the tunnel.** The local path reaches `edge`, not the model server, so the model server keeps spec 000's setup with no API key (FR-053). The client identity of FR-032 now crosses the tunnel to the local gateway, held in memory only (FR-042).
  - **Spec 000 pieces that change with it:** the routing schema, which "keeps every primary local"; the operator CLI, whose `--url` accepts only "`127.0.0.1` or `localhost`, at the stack's own port (18003, 18103, or 18303) and no other"; and the environment contract's three stack names.

Questions 3 to 12 were answered together. The Author read them in this spec's list of open questions and wrote: "I've read through the clarify questions in teh spec and the rest of them you can go with the recommendeded ones. I agree with the recommendations". Each bullet below quotes the recommended option as that list worded it.

- Q: How does cloud infrastructure cost count against "$5/day, $20/month"? (FR-020) → A: "A (recommended)", which read: "the meter of record also books infrastructure cost, as a daily share of the month's estimate corrected when AWS's billing data arrives. Metered calls stop when metered spend plus infrastructure reaches $5 for the day or $20 for the month. This changes spec 000's meter and needs an ADR." Reading: under question 2's answer, the fallback gateway's meter books it. Spec 000's data model has no room for it yet: its reservations accept only `CHECK (attribution IN ('fallback','metered','test'))` (data-model.md §2.4), and the ledger's check is the same plus `none`.
- Q: Where is the public request cap enforced within budget? (FR-033) → A: "A (recommended)", which read: "in the relay, from the address the edge supplies." Reading: the relay applies the cap before it forwards on either path.
- Q: Is hello public in spec 001? (FR-030 to FR-039) → A: "A (recommended)", which read: "yes, through the relay, capped, as a test endpoint with spec 000's fixed prompt."
- Q: What is the idle target? (FR-021; SC-002) → A: "A (recommended)", which read: "confirm the intent's "Idle infrastructure target ≤ $10/month"." Reading: how the cloud VM runs isn't settled by this answer. The options raised in question 2's discussion weren't in this spec's list: always on, on demand or as spot, or started only while the local tier is down (the Author's scenario). The relay and the tunnel's end are on the VM (FR-017, FR-052), so it has to be up whenever visitors are served, and the plan chooses between on demand and spot within the target (FR-021; Assumptions).
- Q: When neither the local tier nor the fallback can answer, does hello get a degraded page or static answers? (FR-036) → A: "A (recommended)", which read: "spec 000's degraded response and a notice on the site; static answers wait for the twin's spec."
- Q: What does an AWS-side breach do on its own? (FR-023) → A: "A (recommended)", which read: "revoke paid-model calls at the provider, automatically, until the Author restores them." Reading: the permission revoked is the fallback gateway's (FR-013, FR-017); local answers continue.
- Q: How are releases made before publication? (FR-046, FR-048) → A: "A (recommended)", which read: "the Author's terminal builds each release once and publishes it to a private registry in the account, and both deployers pull it by digest." Reading: one build per release, the same digests on every host. If the cloud VM's processor architecture differs from the local tier's, one release is one multi-architecture image index; the plan picks the instance type. Spec 000's own T184, one gateway build for prod and dev, stays the Author's decision for spec 000.
- Q: What do visitors see as the public dashboard? (FR-057 to FR-059) → A: "A (recommended)", which read: "always the cloud-hosted snapshot, refreshed so its values are at most 5 minutes old while the local tier is up. The operator's Grafana never faces the internet."
- Q: Where does the tunnel end? (FR-052) → A: "A (recommended)", which read: "inside the project's AWS account." Reading: on the cloud VM, which is always on, beside the relay and the fallback gateway.
- Q: Who runs the real `terraform plan` before publication? (FR-005) → A: "A (recommended)", which read: "the Author's terminal, while agent sessions run offline checks against a provider cache the Author seeds."

## Scope: what spec 001 reuses, and what it adds

Spec 000 hands this spec a named list (its Assumptions): "AWS Budgets, Terraform, the domain, edge protection, the public dashboard snapshot, and the outbound tunnel are spec 001."

**Terms.**
- **hareet.ai** is the public domain. The repository keeps the name h4reet.ai, and quotes keep the spelling they were written in (Assumptions, "The domain").
- **The edge** is the cloud edge that serves hareet.ai over TLS: the static site, and the door for dynamic requests. Spec 000's nginx proxy is called **the stack's `edge` service**.
- **The laptop** is the Author's RTX 5090 machine, the constitution's local tier. The Author's words call it his laptop.
- **EC2** is the one EC2 instance that runs prod's stack by default, without the local model server.
- **The serving host** is whichever of the two answers visitors' dynamic requests now: EC2 or the laptop, one at a time.
- **The relay** is the thin public API on the tunnel end, in front of both hosts' gateways: CLAUDE.md's `services/relay`, which doesn't exist yet. It picks the serving host for each request (plan question 1).
- **The shared state** is prod's one meter and kill switch, held in the cloud, read and written by whichever host serves (point 3).
- **The tunnel end** is the small instance in the account, separate from EC2, where the laptop's outbound tunnel ends (question 13). It runs around the clock, on spot, so AWS can take it back (plan question 2; FR-076). It runs the tunnel's far end, the relay, the public view's sink, and a small collector; it runs no gateway and no store.
- **The failover** is the Route 53 health check on the laptop's path, probed at the tunnel end's public address, and its alarm, which wakes EC2 through the start function. It doesn't move visitors: the relay does (plan question 1).
- **The start function** is the function that starts EC2 when the laptop goes (point 1's "a Lambda").
- **A handover** is the move of visitors from one host to the other. **The start-up gap** is the time from the laptop's last answer until EC2 passes its health check.
- **The model ceilings** are $5 a day and $20 a month, counting model calls only, on both hosts. **The fallback sub-budget** is $2 a day per grant, the laptop's fallback rule only. **The adapter caps** are `config/budgets.yaml`'s `adapter_monthly_usd`: today $20 a month on the Anthropic adapter.
- **The server budget** is the AWS-side budget for everything else the account costs.
- **A release** is a commit on `main` with its images pinned by digest (Key Entities). **Before publication** is ADR 0013's local phase; **after publication** starts once the Author has published the repository on GitHub.

**Reused from spec 000.** Each piece runs as spec 000 built it, with only configuration differing, as spec 000's FR-017 allows. The exceptions are listed under "has to change" below.

| Spec 000 piece | In this spec | Note |
|---|---|---|
| The one compose definition, `deploy/compose.yaml` (ADR 0002) | reused; extended in place | EC2 runs it with a cloud environment file that selects no model server (FR-043, FR-044). The tunnel end runs it with an environment file that selects only the tunnel's far end, the relay, the sink, and a small collector (FR-052). New services and profiles go into the same file, never an override or a fork. |
| The gateway (`services/gateway`): adapters, routing, the per-client cap, the meter and kill switch, the operator interface, alerts, incident drafts, telemetry | reused; configured per host | Each host's gateway meters against the shared state (FR-017). Each host has its own route (FR-067). |
| `config/routing.yaml`, `prices.yaml`, `budgets.yaml`, `alerts.yaml` | reused | The ceilings, the sub-budget's figure, and the Anthropic cap don't change. Routing gains a route per host. The server budget is AWS-side, in Terraform. The human-only files change only by the Author's hand, with an ADR. |
| The heavy services: the model server on the GPU, Langfuse and its stores, Prometheus, Loki, Grafana, the collector | reused | The laptop runs them all. EC2 runs them all but the model server (FR-044). |
| The degraded response and its causes, and the `api_unavailable` body | reused; one cause added | `no_host_serving`, for a window in which no host serves (FR-066). |
| Alerts through Telegram first and SMTP second (ADR 0005) | reused | AWS-side alerts and handover alerts go to the same channels (FR-022, FR-065). |
| The agents' engine (spec 000 FR-039) | reused unchanged | Agents build and test the relay, the tunnel, the handover, and the deployer CPU-only, with stand-ins for AWS, the shared state, and the tunnel's peer. |
| The local gate, the forbidden-action matrix, the breach test (dev only), rollback by `REF` | reused; the matrix and the breach test grow | FR-005, FR-006, FR-011, FR-012, FR-025 |
| The data-flow disclosure (spec 000 FR-040) | reused; rows changed and added; published on the site | FR-040, FR-041 |

**Added by this spec.**
- `infra/`: Terraform for one AWS account. It covers:
  - the state backend;
  - the model-spend budgets, the server budget, the anomaly monitor, and the budget actions;
  - the hareet.ai zone in Route 53, the health check and its alarm, and the certificate;
  - the edge, the static site's storage, and the public view's storage;
  - EC2, its network, its role, and its spot request;
  - the start function, its role, and its autostart switch;
  - the shared state's store;
  - the secrets store's entries;
  - the tunnel end: its spot instance, its public address, its network, and its role.
  (CI's OIDC roles moved to the publication spec; Clarifications, 2026-10-11.)
- The relay, a new container in the one compose definition, on the tunnel end.
- The outbound tunnel: its client on the laptop, and its far end on the tunnel end, both containers in the one compose definition (question 13).
- The handover in `make up ENV=prod` on the laptop: open the tunnel, wait for the relay to send to the laptop, stop EC2.
- The pull-based deployer for EC2, the tunnel end, and the laptop, and the releases it pulls.
- A cloud environment file for EC2's stack.
- The public view and its cloud-hosted snapshot.
- Publishing spec 002's site, with the disclosure, at the edge.
- Runbooks, uptime probes, and ADRs.

**Pieces of other specs and files this spec has to change.** Each is named so that none changes silently. Specs change by amendment, by name, in their own lifecycle; the Author's files change by his hand.
- **Spec 000's FR-031**, "Each stack has its own meter": for prod, one shared meter in the cloud that both hosts' gateways use (FR-017). Dev's and dev-cpu's meters stay local. FR-031's rule that "A store that is unreachable counts as unknown, which is `degraded`" applies to the shared state, on each host (FR-019).
- **Spec 000's FR-030**, whose sub-budget "limits the calls routed to Bedrock as fallback": it limits the laptop's fallback only, Bedrock or the Anthropic API. On EC2 no route is a fallback in FR-030's sense; both paid routes count against the ceilings and the adapter caps (the Author's answer of 2026-11-09).
- **Spec 000's FR-022 and ADR 0001**, the routing order: set per host. The laptop keeps ADR 0001's order. EC2's is the Anthropic API, then Bedrock (FR-067). ADR 0044 amends ADR 0001.
- **Rule R1**, "every primary must be local" (spec 000's contracts/config-files.md, R1; enforced in `services/gateway/src/config/validate.ts`), the routing file's header ("its schema keeps every primary local, a paid adapter in prod's route only"), and spec 010's FR-001 ("every route's primary SHALL be local (rule R1)", and "prod's route SHALL name at most one paid fallback"): R1 holds for the laptop's route. EC2's route names a paid first route and a second paid route (FR-067). Spec 010's Out list ("a paid primary", "a chain of two paid fallbacks") changes with it.
- **The route selector.** `config/routing.yaml` selects the route by `H4_ENV`: "prod for prod". Both hosts run prod, so the route is selected by host (FR-067). With it, **spec 000's environment contract**: its three stack names, and the gateway's check that `H4_STACK` is "one of the three, and agrees with `H4_ENV` (exit 78)". EC2's stack needs a name of its own, or a reading of `prod`, and so does the tunnel end's, which runs no gateway.
- **Spec 000's data model**: prod's meter rows, reservations, call records, and audit log move from the stack's `gateway-state` to the shared state. The September plan's `infra` attribution isn't needed: the meter books no infrastructure cost (FR-020).
- **Spec 010's FR-026 and spec 007's FR-031**, the readiness evidence: a ready topic needs runs on every adapter that can answer it on either host: the laptop's local model and its fallback, and EC2's Anthropic API and Bedrock (FR-039).
- **Spec 010's FR-003 and FR-024**, the live runs: the admin routes call only the route's adapters, so a live run on the Anthropic API needs a route that names it, on EC2 or the laptop.
- **Spec 002's room-conversation contract §3**: `no_host_serving` joins the "local tier off" class, so the room shows `cannot_talk.resting` (FR-066). The message's words name the laptop (Assumptions, "The resting message").
- **The operator CLI**: its `--url` accepts only "`127.0.0.1` or `localhost`, at the stack's own port (18003, 18103, or 18303) and no other" (contracts/operator-admin.md §6). The Author acts on the shared state from his terminal, whichever host serves (FR-074).
- **The client address**: spec 000's gateway believes `X-Forwarded-For` only from the stack's `edge` service (contracts/gateway-http.md §2.3). With the relay in front, that chain of trust has to end at a hop the edge reached, on both hosts, without letting any caller choose its own identity (FR-032).
- **The tunnel and the stack's `edge` service**: spec 000's plan left the model server with "no `--api-key`, because only containers in the same project reach it (revisited when spec 001's tunnel exists)" (plan §3). The tunnel reaches `edge`, not the model server, so that setup stands, and `edge` authenticates the tunnel's callers (FR-053).
- **The published ports**: spec 000 binds every published port to the literal `127.0.0.1`, which no environment file can change (plan §1). EC2 has to accept the edge's requests without loosening that binding on the laptop (FR-032).
- **Spec 000's preflight**: it refuses when "not exactly one of `gpu` and `cpu` is selected" (plan §4). EC2's class and the tunnel end's run no model server, so the rule is extended for those classes only.
- **The hand-made Bedrock runtime identity** comes under Terraform (FR-013).
- **CLAUDE.md's routing sentence**, "local-first, then the one paid fallback prod's route names (Bedrock or the Anthropic API) within its sub-budget and caps, then degraded", becomes per host. It is the Author's file.
- **The constitution**: the 1.1.0 patch, proposed (Assumptions). The Author's hand.
- **Intent 000 and this folder's intent**: their cost and hosting lines. The Author's to revise (Assumptions).
- **The data-flow disclosure**: rows S1, S2, V1, V2, V4, F1, F3, A1, A2, and D1 change, and rows are added (Data-Flow Disclosure Entries).

## User Scenarios & Testing *(mandatory)*

The users of this spec are three groups. Visitors reach hareet.ai, often for the first time. The Author is the operator and the builder. The agents plan the infrastructure but never apply it.

### User Story 1 - Infrastructure Changes Are Planned by Machines and Applied by a Human (Priority: P1)

As the Author, I want all cloud infrastructure in Terraform in one AWS account. Environments are separated by VM, IAM role, tag, and budget, and only short-lived identity-based credentials exist anywhere. Until publication (ADR 0013) there are no pull requests and no CI, so the plan goes in the branch's merge-request note, and apply is my own terminal action, recorded. The plan posted on every PR and the apply gated behind a protected environment I approve moved to the publication spec (Clarifications, 2026-10-11).

**Why this priority**: Principle III says only a human "applies infrastructure", and Principle IV says "`apply` and `destroy` are human actions". Every other story needs cloud resources, and none may come into existence any other way. The failover, the start function, and their IAM are infrastructure too.

**Independent Test**: Take a branch that changes `infra/`. The local gate refuses it until its note carries the redacted plan. Every apply-class command from an agent session is refused. After the Author merges, the Author's apply creates exactly what the plan showed and leaves an apply record. The credential audit finds zero access keys, and the tag check finds no untagged resource. After a handover, a fresh plan shows no change.

**Acceptance Scenarios**:

1. **Given** a branch that changes `infra/`, **When** the local gate runs, **Then** it fails unless the merge-request note carries a plan for each affected environment. The plan must be made from the branch's latest `infra/` change and redacted of account IDs and secret values (FR-005).
2. **Given** an agent session, **When** it tries `terraform apply`, `destroy`, `import`, a state write, or `force-unlock`, in any spelling, **Then** the attempt is refused with a reason and an audit record (FR-006).
3. **Given** a merged infrastructure change before publication, **When** the Author applies it from their own terminal, **Then** the apply uses the Author's short-lived SSO session and runs only a saved plan that matches the reviewed one. It leaves an apply record with no secrets or account IDs (FR-007).
4. **Given** resources exist, **When** costs are reported, **Then** every resource carries project, environment, and component tags under the correct environment budget (FR-002).
5. **Given** any identity in the account, **When** the credential audit runs, **Then** it finds no IAM user access key and no other long-lived credential (FR-008), but for the identities the Author's allowlist names, which it shows as allowed (amended 2026-11-11; Assumptions, "One account, shared with the Author's other work").
6. **Given** the Terraform that defines IAM, budgets, alert routing, edge rate limits, the kill switch, the failover, the start function, its autostart switch, or EC2's running pattern, **When** an agent session tries to change it, **Then** the write is refused. A change can arrive only as a patch the Author applies, with an ADR (FR-012).
10. **Given** a handover has happened (the relay sent visitors to another host, the start function started EC2, or the laptop stopped it), **When** the Author plans from the same commit, **Then** the plan shows no change (FR-072).

Scenarios 7 to 9 (the plan on pull requests, the protected apply, and CI's OIDC roles) moved to the publication spec with FR-014 to FR-016 (Clarifications, 2026-10-11; `publication-carryover.md`). Their numbers aren't reused, so the new scenario is 10.

---

### User Story 2 - Two Budgets: the Model Ceilings on One Shared Meter, and the Server's Own (Priority: P1)

As the operator, I want every model call from either host counted on one meter against the ceilings I set, so that two hosts can never each spend them. I want the server's cost under a budget of its own, outside those ceilings. And I want AWS Budgets and Cost Anomaly Detection on the account, routed to the same Telegram and email channels, as the lagging safety net.

**Why this priority**: Principle V: "Budgets, alerts, and the automated kill switch ship before the first feature and are tested by deliberately tripping them." The Author's words: "Keep the cap as-is at $20 a month, $5 a day", and "The server size and budget is outside the $20 model spend cost." On EC2 every admitted turn is a paid call, so the meter matters more than it did on the laptop.

**Independent Test**: Run a handover with both hosts serving for a moment, sending paid calls from both: the shared meter's day and month never pass the ceilings beyond spec 000's in-flight overshoot. Make the shared state unreachable from one host: that host answers degraded. Apply the budgets on their own, then trip a rehearsal budget of each kind: both channels alert, and each automated action takes effect on its rehearsal target. Run the breach test on dev: the relay follows the trip within 10 seconds.

**Acceptance Scenarios**:

1. **Given** this spec's first apply, **When** it completes, **Then** the model-spend budgets, the server budget, the anomaly monitor, and their alert routes exist, created no later than any other resource that costs money (FR-022).
2. **Given** model calls on either host, **When** they are metered, **Then** they land on the one shared meter. A production-class stack that would spend outside it refuses to start (FR-017, FR-018).
3. **Given** both hosts serving during a handover, **When** both admit paid calls, **Then** the day's and the month's model spend, together, never pass $5 and $20 beyond spec 000's in-flight overshoot (FR-017).
4. **Given** a host can't read the shared state, or can't confirm it within 10 seconds, **When** a request arrives there, **Then** that host answers with the degraded response (FR-019, FR-030).
5. **Given** the shared state is new or was lost, **When** prod starts on either host, **Then** it stays degraded until the operator initializes it with the carried-over values. Nothing restarts at zero (FR-019).
6. **Given** AWS's billing data shows Bedrock's month at $20, **When** the budget action runs, **Then** neither host can call Bedrock until the Author restores the permission. Local answers on the laptop and the Anthropic API on EC2 continue, inside the meter (FR-023).
7. **Given** AWS's billing data shows the server's month at its budget, **When** the budget action runs, **Then** EC2 stops, and the start function won't start it until the Author restores it (FR-023).
8. **Given** a rehearsal budget set below the month's actual spend, **When** AWS evaluates it, **Then** both channels get the alert and the automated action takes effect on its rehearsal target. The record says how long AWS took (FR-026).
9. **Given** the breach test on dev, **When** the ceiling trips, **Then** the relay answers degraded within 10 seconds, and after the operator's reset it forwards again (FR-025).

---

### User Story 3 - hareet.ai Answers From EC2 by Default (Priority: P1)

As a visitor, I want hareet.ai to load over TLS from the edge, and hello and the twin to answer, whether or not the Author's laptop is on.

**Why this priority**: The Author's words: "That ec2 server will end up being the main server running". The intent's first problem stands: "Visitors need h4reet.ai to answer whether or not the machine is awake".

**Independent Test**: With the laptop off and EC2 up, the site loads, and hello and a twin turn are answered by the Anthropic API, each with a full trace and its cost. With a stand-in that makes the Anthropic API fail, Bedrock answers inside the ceilings. With both failing, the answer is degraded with its cause. With EC2 stopped and the laptop off, the site still loads and dynamic requests get the degraded body.

**Acceptance Scenarios**:

1. **Given** hareet.ai, **When** requested, **Then** the static site is served over TLS from the edge, with DNS managed in Terraform (FR-027).
2. **Given** the laptop isn't serving and EC2 is healthy, **When** a visitor calls hello or sends a twin turn, **Then** the Anthropic API answers first, inside the ceilings and its adapter cap, and the call carries provider, model, tokens, and cost (FR-035, FR-067).
3. **Given** the Anthropic API can't answer (it is down, its circuit is open, or its key is refused), **When** a call arrives on EC2, **Then** Bedrock answers inside the ceilings, or else the answer is degraded with its cause. Neither call counts against the $2-a-day sub-budget (FR-036, FR-067).
4. **Given** the kill switch is `degraded`, unknown, or unreadable, **When** a request arrives, **Then** the relay answers with the degraded response without forwarding (FR-030).
5. **Given** public exposure, **When** a client exceeds the public request cap, **Then** the relay limits it before the gateway (FR-033).
6. **Given** a request that reaches either host's stack without passing through the edge, **When** it arrives, **Then** it is refused (FR-032).
7. **Given** a release that makes hello or the twin's turns reachable from the internet, **When** it is about to deploy, **Then** red-team cases must pass first on every adapter that can answer them, or the release is refused (FR-039).
8. **Given** EC2's route names the Anthropic API but its price, cap, key, or the Author's words in row F3 are missing, **When** EC2's stack starts, **Then** it refuses, or the gate fails, before any visitor's turn can reach Anthropic (FR-068).
9. **Given** EC2 is stopped and the laptop is off, **When** hareet.ai is requested, **Then** the static site still loads, and dynamic requests get the degraded body with `no_host_serving` (FR-028, FR-066).

---

### User Story 4 - The Laptop Serves When the Author Runs It, and EC2 Takes Back Over When It Goes (Priority: P1)

As the Author, I want to start prod on my laptop and have visitors move to it, local-first, without opening a port, typing an address, or touching my router. While it serves, EC2 should be stopped. When the laptop goes, EC2 should start and take visitors back without me.

**Why this priority**: The Author's words: "it should be the local-first primary scenario we built for", and "If i am running locally, then the ec2 should be shut off and not incurring costs." Principle IV: "the local tier accepts no inbound connections and pulls its deployments rather than receiving pushes."

**Independent Test**: Start prod on the laptop. Nothing asks for an address, and no router or firewall setting changes. The relay moves visitors to the laptop once its checks pass, and then EC2 stops. Cut the tunnel: the relay answers the resting reply, the health check fails, the start function starts EC2, and the relay sends visitors to EC2 once it passes its checks. An external scan of the laptop finds no open port.

**Acceptance Scenarios**:

1. **Given** the Author runs `make up ENV=prod` on the laptop, **When** it starts, **Then** the whole topology starts as before, it asks for no address, it changes no router or firewall setting, and the laptop dials out its tunnel (FR-045, FR-052, FR-064).
2. **Given** the laptop's stack and tunnel are healthy, **When** the relay's checks of the laptop pass three times in a row, **Then** the relay sends visitors' requests to the laptop, and they are answered local-first, with the laptop's paid fallback inside the $2-a-day sub-budget (FR-054, FR-067).
3. **Given** visitors have moved to the laptop, **When** the handover completes, **Then** the laptop stops EC2, which runs no longer than the handover window (FR-063, FR-064).
4. **Given** the laptop can't stop EC2 (it has no session, or the call fails), **When** `make up` finishes, **Then** it succeeds, says why, and alerts. The shared meter keeps both hosts inside the ceilings (FR-017, FR-064).
5. **Given** the laptop serves, **When** it sleeps, shuts down, or loses its tunnel, **Then** the relay answers the resting reply within about a second, the health check fails, the start function starts EC2 without a person, and the relay sends visitors to EC2 once it passes its checks (FR-054, FR-065).
6. **Given** EC2 is starting, **When** a visitor sends a dynamic request, **Then** the relay answers with the degraded body and `no_host_serving`, the room shows its resting message, and the site keeps loading (FR-066).
7. **Given** the Author has set the autostart switch `off`, **When** the laptop goes, **Then** EC2 stays stopped, and visitors get the degraded body until the Author starts a host (FR-065).
8. **Given** the tunnel flaps while the laptop runs, **When** the relay sends visitors to the laptop again, **Then** the laptop stops EC2 again (FR-064).
9. **Given** the laptop is running, **When** it is scanned from the internet, **Then** no inbound port is open, with the tunnel up or down (FR-052).
10. **Given** a call through the tunnel, **When** it doesn't come from a caller the disclosure names, **Then** the stack's `edge` service refuses it. Langfuse, the admin listener, and Grafana are not reachable through the tunnel at all (FR-052, FR-053).
11. **Given** a new release, **When** the laptop's deployer polls, **Then** it pulls the release. Nothing pushes to the laptop, and no CI runner runs there (FR-046, FR-055).
12. **Given** the Author started prod by hand from a commit, **When** the deployer polls, **Then** it leaves that stack running until the Author hands control back. The dashboard shows the commit and who started it (FR-049).
13. **Given** the host slept or WSL2 restarted, **When** the Author follows the laptop's runbook, **Then** it rejoins production (FR-056).
14. **Given** AWS reclaims the tunnel end's spot capacity, **When** visitors send dynamic requests, **Then** the Author is alerted at AWS's warning, the edge answers `no_host_serving`, and the site keeps loading. When capacity returns, the tunnel reconnects and the relay serves whichever host is up, without a person (FR-076).

---

### User Story 5 - A Visitor Can See What Leaves Their Device (Priority: P1)

As a visitor, I want the site to tell me exactly what my visit sends, where it goes, who answers, and why, before I send anything.

**Why this priority**: Principle I: "Every byte that leaves a visitor's device MUST be enumerated in a public data-flow disclosure with a stated reason." This spec carries the project's first visitor bytes over the internet, and on EC2 every turn goes to a paid API. So the disclosure has to be live, and say so, before hello and the twin are.

**Independent Test**: Open every page with the browser's network log on, and call hello, the status request, and a twin turn. Compare every host the browser contacted with the published disclosure. Read rows V2 and F3 and check that they say what EC2 sends to the Anthropic API. After the run, scan both hosts' stores and the shared state for visitor addresses and messages.

**Acceptance Scenarios**:

1. **Given** any page of the site, **When** a visitor opens it, **Then** it links the data-flow disclosure. The disclosure lists every flow the visit can cause, with what each carries, what it never carries, and why (FR-040, FR-041).
2. **Given** EC2 serves, **When** a visitor reads the disclosure, **Then** it says that every hello and twin turn goes to the Anthropic API first, and to Bedrock when it can't answer, with what each carries and what Anthropic keeps, in the Author's words (FR-040, FR-068).
3. **Given** a browser that loads every page and calls hello, the status request, and a twin turn, **When** its network requests are recorded, **Then** every request goes to a host the disclosure lists, and none goes to a third party (FR-038, FR-041).
4. **Given** a visit, **When** it ends, **Then** nothing is stored on the visitor's device, and no cookie was set (FR-042).
5. **Given** a test run of visitor calls on each host, **When** logs, traces, metrics, alerts, the ledger, the shared state, and the other stores are scanned, **Then** no visitor address, message, or answer is found (FR-031, FR-042).
6. **Given** a change that adds a service, a tunnel route, or an egress destination, **When** the local gate runs, **Then** it fails unless the disclosure lists the new flow in the same change (FR-040).

---

### User Story 6 - The Same Compose Stack Runs on EC2 (Priority: P1)

As the Author, I want the very same compose definition from spec 000 to run on a Terraform-provisioned EC2 instance with a different environment file, so that "one topology, many environments" is demonstrated rather than claimed. The 2026-09-07 outline said "unchanged". This spec adds services to the one file, so it uses the intent's words, "the very same compose definition".

**Why this priority**: It is the intent's "a VM that runs the very same compose definition from spec 000", and now the host that serves most of the time. The constitution's Compute standard asks the same: "One compose definition describes the production topology and is what runs in every environment".

**Independent Test**: `terraform apply` (human) creates EC2. The deployer pulls the release, and hello answers through the relay with a full trace. Destroying and recreating EC2 yields the same digests, and the shared state's values don't change. On the laptop, `make up ENV=prod` still starts the whole topology, calling local models.

**Acceptance Scenarios**:

1. **Given** EC2 is provisioned, **When** the deployer runs, **Then** the stack from `deploy/compose.yaml` starts with the cloud environment file, which selects no model server, and no other change (FR-043, FR-044).
2. **Given** EC2 starts after being stopped, **When** its deployer runs, **Then** it checks for a new release before the stack takes visitors (FR-046).
3. **Given** a new release, **When** a deployer polls, **Then** it pulls and restarts only the affected services and records the deployment (FR-046, FR-047). The outline's "a new image on `main`" became "a new release", because images built on `main` need CI.
4. **Given** a new release fails its health checks, **When** the deployer sees it, **Then** it returns to the previous release and alerts (FR-047).
5. **Given** the same release, **When** it runs on EC2 and on the laptop, **Then** their images match by digest, and only their environment files differ (FR-043, FR-048).
6. **Given** EC2 is destroyed and recreated, **When** the deployer finishes, **Then** the stack's digests match the release, and the shared state's values are unchanged (FR-019, FR-048).
7. **Given** this spec's changes to the compose definition, **When** the Author runs `make up ENV=prod` on the laptop, **Then** the whole topology still starts with one command, calling local models (FR-045).
8. **Given** EC2's stack, **When** its operator interface is probed from the internet, **Then** it is unreachable. The Author reaches it only through an identity-based, short-lived session (FR-050).

---

### User Story 7 - The Server Runs Only When It Must (Priority: P2)

As the Author, I want EC2 to run only while it serves: stopped while my laptop serves, and on spot capacity the rest of the time, so that the server stays inside its own budget.

**Why this priority**: The Author's words: "If i am running locally, then the ec2 should be shut off and not incurring costs", and "we will try to use spot instances, or only keep the server online for 8-12 hours a day", which his answer to question 15 settled as "Spot, around the clock". It follows the P1 stories, since visitors are served either way.

**Independent Test**: Over a month in which the laptop serves at least once, EC2's running hours while the laptop serves are no more than its handover windows. EC2 is a spot instance, and no schedule stops it. Simulate a spot interruption: the Author is alerted, visitors get the resting message, and EC2 serves again once capacity returns. The dashboard shows the server's month beside its budget.

**Acceptance Scenarios**:

1. **Given** the laptop serves, **When** a month is measured, **Then** EC2's running time while the relay sends to the laptop is at most the handover windows (FR-063, SC-016).
2. **Given** EC2 is the serving host, **When** a day passes, **Then** it runs on spot around the clock, and nothing but the laptop's stop, the server budget's action, or a spot interruption stops it (FR-069).
3. **Given** AWS reclaims EC2's spot capacity, **When** the interruption notice arrives, **Then** the Author is alerted on both channels, and visitors get the degraded body with `no_host_serving` until capacity returns and EC2 serves again, or until he starts the laptop (FR-071).
4. **Given** EC2 starts again on its own when spot capacity returns, **When** the laptop serves or the autostart switch is `off`, **Then** EC2 is stopped again (FR-071).
5. **Given** a month of operation, **When** the dashboard is opened, **Then** the server's cost shows beside its budget, and model spend beside the ceilings (FR-059).

---

### User Story 8 - The Public Dashboard Never Goes Dark (Priority: P2)

As a visitor, I want to watch the system run: spend next to latency and errors, and which host serves. I want that view to stay up when no host is running.

**Why this priority**: Principle VI makes operational dashboards public. The constitution's Observability standard asks for "Grafana for public read-only dashboards, with a cloud-hosted last-known snapshot so the public view never goes dark", and the intent says: "The public dashboard stays up when the machine is off." Spec 000's FR-028 left the dashboard's public exposure to this spec.

**Independent Test**: Turn both hosts off for an hour. The public view keeps answering with last-known values, the time they were taken, and "no host serving". Start a host, and the values are fresh again within 5 minutes.

**Acceptance Scenarios**:

1. **Given** no host serves, **When** the public dashboard is viewed, **Then** the cloud-hosted snapshot shows last-known values and says that no host serves; it does not go dark (FR-057, FR-075).
2. **Given** a host serves, **When** the public view is opened, **Then** its values are at most 5 minutes old, and it says when they were taken and which host serves (FR-058).
3. **Given** the public view, **When** inspected, **Then** it shows the listed panels with no payload, client identifier, operator reason, or secret, and it offers no write action (FR-059).

---

### Edge Cases

- **The laptop sleeps mid-request.** The call fails, and the room shows `cannot_talk.unavailable`, as spec 007's FR-036 does for a network failure. The next requests get the degraded body with `no_host_serving` until EC2 answers (FR-066).
- **The tunnel flaps.** The relay needs three passing checks in a row before it sends to the laptop again (FR-054). Each failure may start EC2; each return makes the laptop stop it again (FR-064). Each flip is recorded and shown.
- **Both hosts serve for a moment** during a handover, or because the laptop couldn't stop EC2. Both meter against the shared state, so together they can't pass a ceiling beyond spec 000's in-flight overshoot (FR-017). EC2's running hours count against the server budget, and the alert says so (FR-064).
- **The laptop loses its network while running.** Its tunnel drops, so the relay answers the resting reply, the start function starts EC2, and the relay sends visitors there once it is up. The laptop can't read the shared state, so its own prod answers degraded (FR-019). When the network returns, the laptop passes its checks, takes visitors back, and stops EC2.
- **The Author shows prod on the laptop with no network.** Prod answers degraded, because the shared state is unreachable and unknown state is degraded. An offline showing runs `make up ENV=dev`, whose meter stays local and spends nothing (Assumptions, "The laptop without a network").
- **EC2 starts, but its stack fails its health checks.** Visitors keep getting `no_host_serving`. The deployer returns to the previous release if a new one failed (FR-047), and the Author is alerted. The start function doesn't retry in a loop (FR-065).
- **The start function can't start EC2**: the autostart switch is `off`, the server budget's action stopped EC2, spot capacity is short, or the call fails. The site loads, dynamic requests get `no_host_serving`, and the Author is alerted (FR-065, FR-066).
- **A request is in flight when its host goes.** The relay retries it once on the other host only if the connection failed before the request was sent; otherwise the visitor gets the failure, and the next request goes to whichever host is healthy (FR-054).
- **The kill switch flips while a request is in flight.** The request completes, because the state is read at request start (spec 000).
- **The Anthropic adapter's month is spent.** Its cap is $20, the whole monthly ceiling (spec 010), so the month's ceiling trips first. Every answer on both hosts is then degraded until the Author's reset (spec 000 FR-033).
- **A visitor floods EC2.** The public cap acts first, then spec 000's per-client cap and global metered limits, then the meter. Every admitted call is paid on EC2, so a long flood can reach the $5 day ceiling, which degrades every answer until the Author's reset (Expected Cost Impact). On the laptop, local answers cost nothing.
- **A request reaches either host's stack without passing through the edge.** It is refused (FR-032).
- **A second production-class stack with a paid route starts outside the shared meter.** It is refused (FR-018).
- **An uptime probe runs while no host serves.** It checks the status request, which makes no model call, so it never spends (FR-061).
- **AWS reclaims EC2 while it serves.** The interruption notice alerts the Author, EC2 stops, and visitors get `no_host_serving` until capacity returns or he starts the laptop (FR-071).
- **AWS starts EC2 again on its own when spot capacity returns**, while the laptop serves, the autostart switch is `off`, or the server budget's action has run. The guard stops it again, and the laptop's loop does too while the laptop serves (FR-064, FR-071).
- **AWS reclaims the tunnel end** (it runs on spot, plan question 2), whichever host serves. The warning is alerted. While it is gone, the relay is gone too, so the edge answers every dynamic request with `no_host_serving`, and the site keeps loading, even if the laptop or EC2 is up. The start function doesn't start EC2 while the tunnel end is down. When capacity returns, the tunnel end starts again, the laptop's tunnel reconnects, and the relay finds whichever host is up. The start function runs once, starting EC2 if the laptop isn't serving (FR-076). Its health-check read can still show the outage while the laptop's tunnel reconnects, so it may start EC2 though the laptop is about to serve. The relay then sends to the laptop once it passes three checks, and the laptop's loop stops EC2 within its handover window (FR-063, FR-064).
- **An apply fails halfway.** The state lock holds, the apply record says what changed, and the Author re-plans. Only the Author force-unlocks (FR-006, FR-007).
- **A secret rotates.** The Author updates the secrets store, and the stack picks the new value up on restart. The value never passes through the repository or agent context (FR-009).
- **A release fails its health checks.** The deployer returns to the previous release and alerts (FR-047).
- **The Author runs production by hand from a branch.** The deployer leaves it alone until the Author hands control back (FR-049).
- **An edge cache holds a degraded answer.** It can't happen: dynamic responses are never cached (FR-029).
- **The certificate fails to renew.** An alert fires before expiry, and the runbook covers recovery (FR-027, FR-056).
- **The domain's delegation is wrong or lapses.** That happens outside Terraform. The uptime probe catches it, and the runbook covers it (FR-056, FR-061).

## Requirements *(mandatory)*

### Functional Requirements

Numbers from the October draft are kept where the requirement survives, rewritten where it changed, and never reused. New requirements start at FR-063.

**Infrastructure as code, in one account (User Story 1)**

- **FR-001**: THE SYSTEM SHALL define every cloud resource in Terraform, in one AWS account, among them the health check and its alarm, the start function, its role, and its autostart switch, EC2's running pattern, the shared state's store, and the budgets. Terraform's state SHALL be remote, encrypted, versioned, never public, and locked during every plan and apply.
- **FR-002**: THE SYSTEM SHALL separate environments by VM, IAM role, cost-allocation tag, and budget, never by account. Every taggable resource SHALL carry project, environment, and component tags, and the local gate SHALL fail any change that would create or keep an untagged taggable resource.
- **FR-003**: THE SYSTEM SHALL define the state backend in Terraform too. Its one-time bootstrap SHALL be an apply by the Author, recorded like any other (FR-007).
- **FR-004**: THE SYSTEM SHALL pin Terraform and every provider by version and lockfile, as spec 000's FR-014 pins every other dependency. The devcontainer SHALL carry the pinned Terraform, which spec 000's plan left to this spec.
- **FR-005**: WHEN a branch changes `infra/`, THE SYSTEM SHALL fail the local gate unless the branch's merge-request note carries the plan for each affected environment. Each plan SHALL be made from the branch's latest `infra/` change and redacted of account IDs and secret values. Until publication, this stands in for the plan posted on a pull request (FR-014, now in the publication spec).
- **FR-006**: IF an agent session attempts a Terraform command that changes infrastructure or state, THEN THE SYSTEM SHALL refuse it with a reason and an audit record. The covered commands are `apply`, `destroy`, `import`, `refresh`, `taint`, `untaint`, `force-unlock`, `test`, the `state` writes (`mv`, `rm`, `push`, `replace-provider`), `workspace new` and `workspace delete`, and `init` with `-migrate-state` or `-force-copy`. The refusal SHALL cover every spelling, including `-chdir`, wrappers, `bash -c`, subshells, and drop-in replacements. The forbidden-action matrix SHALL prove each spelling, with a gap row for any spelling that gets through.
- **FR-007**: WHILE the repository is unpublished (ADR 0013), THE SYSTEM SHALL let only the Author apply. The Author applies from their own terminal, with a short-lived SSO session, and only a saved plan that matches the reviewed plan of FR-005. Each apply SHALL leave an apply record in the repository with the commit, the plan's hash, the time, the outcome, and the resources changed, and no secrets or account IDs.
- **FR-008**: THE SYSTEM SHALL let no identity hold a long-lived credential. No IAM user access key exists, humans use SSO, and workloads use roles with short-lived credentials. No CI identity SHALL exist in the account before publication. A committed audit SHALL check all of this before every apply and at least weekly.
- **FR-009**: THE SYSTEM SHALL keep secret values out of the repository, the Terraform configuration, its state, its plan output, and agent context. The Author fills each secret by hand in a managed secrets store, and Terraform refers to the secret without reading its value.
- **FR-010**: THE SYSTEM SHALL keep the AWS account ID, the alert recipients' addresses, and the Telegram chat ID out of the repository. They SHALL be supplied at run time, and recorded plans and apply records SHALL be redacted of them.
- **FR-011**: WHEN this spec introduces a secret, a credential, a Terraform state file, a tunnel credential, or a paid route, THE SYSTEM SHALL deny it to agent sessions by name and by path, with a forbidden-action matrix row. The deny SHALL land in the same patch that creates the item or an earlier one (CLAUDE.md; spec 000 FR-007).
- **FR-012**: THE SYSTEM SHALL protect the Terraform that defines IAM, budgets (the model-spend budgets and the server budget), alert routing, edge rate limits, the kill switch, the failover and its health check, the start function and its autostart switch, and EC2's running pattern, the way spec 000 protects `config/budgets*` and `config/alert*`. An agent may propose a change to it only as a patch the Author applies, with an ADR, and the forbidden-action matrix SHALL prove the protection. The autostart switch's value SHALL be set only by the Author, from his terminal, with an audit record. The sources are the constitution's "Prohibited without a human" list and `.claude/agents/ops.md`.
- **FR-013**: THE SYSTEM SHALL bring both hosts' Bedrock identities under Terraform: the laptop's, by importing spec 000's hand-made runtime identity or replacing it with an environment-scoped one, and EC2's, as its instance role. Each SHALL be allowed only to invoke the one configured model. This ends spec 000's deviation "the runtime identity is made by hand".

**Moved to the publication spec: FR-014 to FR-016 (User Story 1)**

The plan posted on pull requests (FR-014), the apply from a protected environment (FR-015), and CI's OIDC roles (FR-016) need GitHub, so they moved to the publication spec (Clarifications, 2026-10-11; ADR 0008). Their text is word for word in `publication-carryover.md` in this folder, where the publication spec's intent starts, as spec 000's moved text is in its folder. Their numbers aren't reused. Until publication, FR-005 and FR-007 stand in, and FR-008 keeps CI identities out of the account.

**The model ceilings on one shared meter, and the server budget (User Story 2)**

- **FR-017**: THE SYSTEM SHALL count every production metered call, from either host, against one meter: the shared state in the cloud (point 3, approved; ADR 0044, decision 7). It SHALL hold:
  - spec 000's ceilings, $5 a day and $20 a month, each with a warning at 70%, for both hosts;
  - the fallback sub-budget, $2 a day per grant inside the daily ceiling, with its renewal, for the laptop's fallback only;
  - the adapter caps' months: today spec 010's $20 a month on the Anthropic adapter;
  - the kill switch, and the audit log.
  Admission and commit SHALL be atomic across hosts, so that two hosts serving at once can't together pass a ceiling beyond spec 000's in-flight overshoot. Each host's gateway, and the relay on the tunnel end, SHALL read the kill switch from it at request start. Dev and dev-cpu SHALL keep their own local meters, which never spend (spec 000 FR-031).
- **FR-018**: IF a production-class stack with a paid route would spend outside the shared meter, THEN THE SYSTEM SHALL refuse to start it.
- **FR-019**: THE SYSTEM SHALL keep the shared state in a store in the account that runs whether or not either host does, and that outlives both: stopping, losing, or replacing either host SHALL lose none of it. It SHALL hold the call records that initialization rebuilds from. WHEN prod's meter first moves into it, the store is found empty, or it is restored from a backup, THE SYSTEM SHALL keep prod degraded on both hosts until the operator initializes it under spec 000's FR-031 and FR-034. A restored store SHALL be marked uninitialized by the operator's restore action before any gateway uses it, so that initialization can confirm its values (contracts/shared-state.md §8). The initialization SHALL carry over the month's spend, the day's spend, today's fallback spend, the crossed ceilings, the renewal flag, and the adapter caps' months, and nothing SHALL start at zero silently. IF a host can't read the shared state, or can't confirm it within 10 seconds, THEN that host SHALL count it as unknown and answer degraded (spec 000 FR-031; CLAUDE.md: "unknown state = degraded").
- **FR-020**: THE model ceilings SHALL count model calls only: every metered call from either host, at its estimated cost, against $5 a day and $20 a month (spec 000 FR-030, FR-031; spec 010 FR-020). THE meter SHALL book no infrastructure cost. The server's cost SHALL sit outside the ceilings, under the server budget (FR-021, FR-022), in the Author's words: "The server size and budget is outside the $20 model spend cost." This replaces the October FR-020, which booked infrastructure on the meter inside the same ceiling.
- **FR-021**: THE SYSTEM SHALL keep the server's monthly cost, meaning every cost of the account that isn't a model call (amended 2026-11-11: every cost tagged `project = h4reet-ai` that isn't a model call; Assumptions, "One account, shared with the Author's other work"), EC2's while stopped included, at or under the server budget. The figure SHALL be the Author's, set before the first apply that creates EC2, from the plan's measurement and prices (question 14: "Measure, then you set it"):
  - the plan SHALL measure the stack's memory without the model server, rather than rely on the session's estimate;
  - it SHALL price the smallest instance types that fit, from AWS's published pages, on spot (FR-069) and for 8 to 12 hours a day, the schedule kept in reserve;
  - it SHALL price each other line, the tunnel end included (FR-052), and what a stopped EC2 still costs.
  EC2 SHALL run on the smallest measured type that fits. THE SYSTEM SHALL create no resource that the server budget covers before the Author has set the figure (FR-022).
- **FR-022**: THE SYSTEM SHALL create these in this spec's first apply, no later than any other resource that costs money:
  - the model-spend budgets on Bedrock's cost, at the ceilings, with warnings at 70% ($3.50 a day, $14 a month);
  - the server budget, on every other cost of the account, at the figure of FR-021, with a warning at 70%;
  - a cost-anomaly monitor on the account;
  - a budget for any other environment's tag, at the amount the Author sets before that environment exists.
  Each budget and the monitor SHALL alert through Telegram (primary) and email (secondary), never by SMS (ADR 0005).
- **FR-023**: WHEN AWS's billing data shows Bedrock's month-to-date cost at or above $20, THE SYSTEM SHALL, without a human, revoke both hosts' permission to call Bedrock, and alert on both channels. WHEN it shows the server's month-to-date cost at or above the server budget, THE SYSTEM SHALL, without a human, stop EC2, keep the start function from starting it, and alert on both channels. Each SHALL stay in force until the Author restores it, and each breach SHALL get the constitution's seven-day incident note.
- **FR-024**: THE SYSTEM SHALL keep the shared meter as the enforcement point for model spend, and treat AWS-side budgets as the lagging safety net. No automated degradation SHALL wait on an AWS-side alert being delivered (Principle V; the constitution's Alerting standard).
- **FR-025**: WHEN the breach test runs on dev, THE SYSTEM SHALL also assert the relay's side. Within 10 seconds of the trip the relay answers with the degraded response, and after the operator's reset it forwards again. This extends spec 000's FR-036, and it stays dev only, on dev's local meter.
- **FR-026**: THE SYSTEM SHALL rehearse the AWS-side paths by deliberately tripping a rehearsal model-spend budget and a rehearsal server budget, each set below the month's actual spend. The record SHALL show that both channels received each alert, that each automated action took effect on a rehearsal target (a rehearsal identity's permission, and a rehearsal instance), and how long AWS took.

**The edge, the site, and the relay (User Story 3)**

- **FR-027**: THE SYSTEM SHALL manage the hareet.ai zone in Route 53, through Terraform, and serve the static site from the edge only over TLS. The certificate SHALL be issued and renewed automatically, with an alert before it expires. Plain HTTP SHALL redirect to HTTPS.
- **FR-028**: WHILE EC2, the laptop, or both are down, THE SYSTEM SHALL keep serving the static site from the edge.
- **FR-029**: THE SYSTEM SHALL send visitors' dynamic requests from the edge to the relay, which runs on the tunnel end and which the edge reaches as its one private origin. The relay SHALL send each request on to the serving host (FR-054). The relay SHALL be a container in the one compose definition, on the tunnel end (the constitution: "everything runs as a container"; plan question 1). THE SYSTEM SHALL never cache a dynamic response at the edge.
- **FR-030**: WHEN a request reaches a relay, THE SYSTEM SHALL read the shared kill-switch state at request start. IF that state is `degraded`, unknown, unreadable, or not confirmed within the last 10 seconds, THEN the relay SHALL return spec 000's degraded response with its cause, without forwarding.
- **FR-031**: WHEN the relay forwards a request, THE SYSTEM SHALL forward only the fields the gateway's contract accepts, plus the client identity of FR-032. The relay SHALL keep no copy of the message or the answer after responding, and SHALL log neither. In the intent's words, "the relay carries no payload it does not need to route".
- **FR-032**: THE SYSTEM SHALL identify each client by the address the edge observed, accept that address only from the edge, and pass it to the gateway that answers, on either host, so that spec 000's per-client cap (FR-025) applies per visitor. Spec 000's contract expected this: "Spec 001's relay will set a verified identity." IF a request reaches either host's stack other than through the edge, THEN THE SYSTEM SHALL refuse it.
- **FR-033**: WHEN a client exceeds the public request cap, THE SYSTEM SHALL refuse its requests before they reach the gateway, with spec 000's 429 refusal shape, and SHALL count the refusals. The relay SHALL enforce the cap, from the address the edge supplies, before it forwards (Clarifications, 2026-10-12). Capped requests still reach the edge and the relay and are billed there, which the server budget bounds.
- **FR-034**: IF a host's gateway answers the relay with a failure that carries no cause, THEN THE SYSTEM SHALL return the degraded response with a cause that names this. IF the edge can't reach the relay, THEN FR-066 SHALL apply.
- **FR-035**: THE SYSTEM SHALL answer hello and the twin's turns in the serving host's routing order (FR-067). No new component SHALL call a model provider, and every model call SHALL go through the gateway with provider, model, tokens, and cost.
- **FR-036**: WHILE no route on the serving host can answer, THE SYSTEM SHALL answer with spec 000's degraded response, naming its cause, and the room SHALL show its fixed message for the cause's class (spec 002 FR-039). This keeps the "degraded page" side of the intent's open question, "degraded page vs. static answers" (Clarifications, 2026-10-12).
- **FR-037**: THE SYSTEM SHALL answer a public status request at the relay, without a model call, whether or not a host serves, and at the edge, with the fixed cause `no_host_serving`, while the relay can't be reached. The answer gives which host serves (EC2, the laptop, or none), whether EC2 is starting, the kill-switch state, and the cause a hello would get now.
- **FR-038**: THE site this spec publishes at the edge SHALL be the one `apps/web` builds (spec 002), with the disclosure and the status. WHERE it offers hello, it SHALL name hello as a test of the model gateway, not the twin. It SHALL state nothing about the Author that isn't in the corpus or a filled `facts/` slot, and it SHALL load nothing from any host other than hareet.ai.
- **FR-039**: WHEN a release would make hello or the twin's turns reachable from the internet, THE SYSTEM SHALL first run red-team cases against them on every adapter that can answer on either host: the laptop's local model and its paid fallback, and EC2's Anthropic API and Bedrock. The cases include attempts to make it claim to be the Author, to disparage, or to reveal its configuration. THE SYSTEM SHALL refuse the release if any case fails (Principle VIII).

**Data flows that leave the visitor's device, the laptop, or EC2 (User Story 5)**

- **FR-040**: WHEN this spec adds or changes a flow that leaves a visitor's device, the laptop, or EC2, THE SYSTEM SHALL list it in the data-flow disclosure, in the change that creates the flow and before the flow first happens. Each row uses spec 000's columns: from → to, trigger, what the flow carries, what it never carries, why, its default, how to switch it off, and the FR. The local gate SHALL fail a change that adds a service, a tunnel route, or an egress destination without its row. The rows are those in "Data-Flow Disclosure Entries". Rows V2 and F3 SHALL say that on EC2 every hello and twin turn goes to the Anthropic API first, and to Bedrock when it can't answer.
- **FR-041**: THE SYSTEM SHALL publish the disclosure on the site, linked from every page and built from the repository's disclosure, so that the two can't differ.
- **FR-042**: THE SYSTEM SHALL set no cookie and store nothing on the visitor's device. It SHALL hold a visitor's address only in memory, on either host, and only for as long as the request caps need it: at most one UTC day, as spec 000's per-client cap does. The address SHALL be written to no log, trace, metric, alert, ledger, the shared state, or any other store.

**EC2 and deployments (User Story 6)**

- **FR-043**: THE SYSTEM SHALL run the very same compose definition from spec 000 on a Terraform-provisioned EC2 instance, with only a cloud environment file differing; that file selects no model-server profile. This follows spec 000's FR-017, including what an environment file may select. Any service or profile this spec adds SHALL go into that one definition, with no override file and no fork (ADR 0002).
- **FR-044**: WHERE the constitution's amendment 1.1.0 is applied (ADR 0044), THE SYSTEM SHALL run prod's stack, without the local model server, on one EC2 instance, as prod's default host. The rest of the cloud SHALL be what the Cloud standard lists. THE SYSTEM SHALL run no GPU instance and no model server in the cloud. The reason is the Author's: "within the server budget EC2 has no GPU, and a model run on its CPU wouldn't meet the twin's quality bar, which your laptop's GPU model does" (Clarifications, 2026-11-09).
- **FR-045**: WHEN this spec changes the compose definition, THE SYSTEM SHALL keep `make up ENV=prod` on the laptop starting the whole production topology with one command, calling local models (Principle I; spec 000 FR-018).
- **FR-046**: THE SYSTEM SHALL deploy to EC2, the tunnel end, and the laptop only by pull. Each host's deployer polls the release source and takes only a release made from `main`: by the Author's terminal before publication, by CI after it. EC2's deployer SHALL also check for a new release each time EC2 starts, before its stack takes visitors. The deployer SHALL check the release's images against its recorded digests before starting them. It SHALL record each deployment, with the release, its digests, the time, who started it, and the outcome, where the dashboard shows it.
- **FR-047**: WHEN a deployer takes a new release, THE SYSTEM SHALL restart only the services whose image or configuration changed. IF the new release fails its health checks, THEN the deployer SHALL return to the previous release and alert. The previous release SHALL also be one command away for the Author (Development Workflow step 6).
- **FR-048**: THE SYSTEM SHALL run the same images for a release on both hosts, by digest. The laptop and a destroyed-and-recreated EC2 SHALL both show the release's digests.
- **FR-049**: WHEN the Author starts a stack by hand (spec 000's `make up ENV=… REF=…`), THE SYSTEM SHALL keep the deployer from replacing it until the Author hands control back. The dashboard SHALL show the running commit and who started it.
- **FR-050**: THE SYSTEM SHALL keep EC2's operator interface (spec 000's admin listener) unreachable from the internet. The Author SHALL reach it only through an identity-based, short-lived session.
- **FR-051**: THE SYSTEM SHALL limit EC2's outbound traffic to the destinations the disclosure lists, among them the Anthropic API (F3), Bedrock (F1), the alert channels (A1, A2), and the shared state (C2), and refuse all others. Spec 000's research deferred the gateway's egress allowlist "to spec 001, where the relay and edge get their own controls".

**The laptop, the tunnel, and the handover (User Story 4)**

- **FR-052**: THE laptop SHALL accept no inbound connection from outside its host. It SHALL be reachable from the cloud only through an outbound tunnel that it opens itself, so that its network address never appears in public DNS, nothing asks for an address at start, and no router or firewall setting changes (point 2, approved; ADR 0044, decision 6). The tunnel SHALL end on the tunnel end: a small instance in the account, separate from EC2, using September's OpenSSH design (question 13: "Tiny always-on relay"; research.md R-11), on spot (plan question 2; FR-076). The tunnel end SHALL run its far end, the relay, the public view's sink, and a small collector as containers from the one compose definition, with an environment file that selects nothing else, and it SHALL run whether or not either host does. Its far end SHALL refuse any forward but the listed ones, so the tunnel SHALL carry only the flows the disclosure lists, and no third party SHALL carry what it carries. Visitors' requests SHALL enter the laptop only at the stack's `edge` service, and only for the relay's public routes (spec 000 research R-06: "Spec 001's tunnel attaches to `edge`"). The tunnel SHALL NOT reach Langfuse, the admin listener, or any part of Grafana.
- **FR-053**: WHERE the tunnel reaches a local service, THE SYSTEM SHALL authenticate every call through it and accept only the callers the disclosure names: the relay's requests and the failover's health checks. IF the failover's health checks can't present a credential, THEN the health path SHALL be the one route through the tunnel that answers without one, and it SHALL return only whether the laptop is healthy. Visitors' requests reach the stack's `edge` service, not the model server, so the model server keeps spec 000's setup, which its plan said would be "revisited when spec 001's tunnel exists": no API key, and reachable only from its own stack.
- **FR-054**: THE failover's health check SHALL probe the laptop's health path at the tunnel end's public address, through the tunnel, so that it fails when the tunnel end, the tunnel, or the laptop's stack fails (question 13: "the health check sees the whole path"). WHEN that check fails, it SHALL fire the start function (FR-065); it moves no visitor. THE relay SHALL check each host's relay block every second, count a host unhealthy after one failed check and healthy again after three passing checks in a row, and send each request to the laptop while it is healthy, else to EC2 while it is healthy, else answer `no_host_serving` (FR-066; plan question 1: "The relay checks both hosts every second and sends each request to the laptop if it's up, else EC2, else the resting reply"). Each host's health answer SHALL be healthy only while its gateway is up and the shared state is readable.
- **FR-055**: THE laptop SHALL host no CI runner and receive no pushed deployment. The tunnel's credential SHALL be scoped to the tunnel alone, revocable by the Author in one action, and kept outside the repository and agent context.
- **FR-056**: THE SYSTEM SHALL include runbooks for:
  - the laptop: wake, WSL2 restart, tunnel recovery, the deployer, and `make up`;
  - handovers: to the laptop and back, a stop of EC2 that failed, and the autostart switch;
  - EC2: a start that failed, a spot interruption, and restoring EC2 after the server budget's action;
  - the tunnel end: a restart, its credential's revocation, and its loss while the laptop serves;
  - every alert this spec adds.
  The constitution asks for "a runbook entry if it can page a human", and spec 000 left wake, restart, and the tunnel to this runbook.

**The public dashboard (User Story 8)**

- **FR-057**: THE SYSTEM SHALL serve the public view as a cloud-hosted snapshot that the serving host refreshes. WHEN no host serves, the snapshot SHALL keep showing the last-known values and say that no host serves. WHILE the tunnel end is gone, and the snapshot's writer with it, the public view SHALL still say that no host serves, from the edge's own degraded answer to the status request (FR-066, FR-076). The snapshot SHALL be kept in the project's own account, with no third-party snapshot service; spec 000 switched Grafana's external snapshots off.
- **FR-058**: WHILE a host serves, THE SYSTEM SHALL keep the public view's values at most 5 minutes old. Every public view SHALL show when its values were taken.
- **FR-059**: THE public view SHALL show spec 000's FR-028 panels: request count, latency p50 and p95, error rate, spend today and month to date, fallback remaining, kill-switch state, model-server health, and why responses are degraded. It SHALL also show:
  - which host serves, the handovers, and each start-up gap's length;
  - EC2's state and the tunnel's state;
  - the server's month against its budget, next to model spend against the ceilings;
  - the adapter caps' months (spec 010 FR-036);
  - the running release.
  The view SHALL be read-only, and it SHALL show no payload, client identifier, operator reason, or secret.

**Observability and records**

- **FR-060**: THE SYSTEM SHALL emit telemetry for every new path:
  - relay requests, with the host, their outcome, latency, refusals, and degraded causes;
  - the failover's health state, its changes, and each handover;
  - EC2's starts and stops, with who or what made each, and each start-up gap's length;
  - spot interruptions, and AWS's own stops and restarts of EC2;
  - the tunnel end's health;
  - the shared state's latency and errors from each host;
  - tunnel state, deployer actions, edge requests and errors, and AWS-side alerts.
  The telemetry SHALL carry no payloads or client identifiers (spec 000 FR-026, FR-029), and the dashboard SHALL show each path next to spend. IF the serving host's telemetry backends are unreachable, THEN its stack SHALL keep answering, and the dashboard SHALL show how much telemetry was delayed or lost.
- **FR-061**: THE SYSTEM SHALL probe the site and the status request from outside both hosts at a fixed interval. Each probe SHALL be marked so it never reaches traces (spec 000 reserves `h4.probe` for "spec 001's uptime checks") and SHALL cause no metered call. THE SYSTEM SHALL alert on both channels after 5 minutes of failure.
- **FR-062**: WHEN a decision in this spec is made, THE SYSTEM SHALL record it as an ADR in the same change. The decisions are:
  - one account separated by VM, IAM role, tag, and budget (0007);
  - Terraform with reviewed plans and human apply, including the stand-in until publication and the move of the GitHub-side half to the publication spec (0008);
  - pull-based deployment to the laptop, with no inbound ports and no self-hosted runners (0009);
  - the public request cap's mechanism: the relay (FR-033);
  - EC2 as prod's default host, the per-host routing, one host at a time, the shared meter, and the server budget outside the model ceilings (ADR 0044, proposed);
  - the tunnel and its end in the account, run around the clock on spot (question 13; plan questions 1 and 2);
  - the shared state's store (the re-plan);
  - EC2 on spot around the clock, the schedule in reserve, and the handover on a spot interruption (questions 15 and 17);
  - the failover and the start function, with their IAM (question 16, provisional until the Author confirms it).
  The October list's "production's split" and "how infrastructure cost counts against the ceiling" are superseded by ADR 0044.

**One host at a time (User Stories 3, 4, and 7)**

- **FR-063**: THE SYSTEM SHALL serve prod's dynamic requests from one host at a time: EC2 by default, and the laptop WHILE the Author runs prod there and it passes the relay's checks (FR-054). WHILE the laptop serves, THE SYSTEM SHALL keep EC2 stopped, except during a handover, which SHALL last at most 5 minutes from the relay sending to the laptop to EC2's stop.
- **FR-064**: WHEN the Author runs `make up ENV=prod` on the laptop, THE SYSTEM SHALL start the whole topology as before (FR-045), open the tunnel, and, once the relay sends to the laptop, stop EC2. WHILE the laptop serves and the relay sends to it, THE SYSTEM SHALL stop EC2 whenever it finds it running, as after a flap. IF it can't stop EC2, THEN `make up` SHALL still succeed, say why, and alert on both channels. The start SHALL ask for no network address and change no router or firewall setting.
- **FR-065**: WHEN the failover's health check fails, THE SYSTEM SHALL start EC2 through the start function, without a person, unless the Author has set the autostart switch `off`, the server budget's action has stopped EC2 (FR-023), or the tunnel end isn't running (FR-076). Route 53's health check only wakes EC2 (plan question 1). The start function SHALL make one start attempt per alarm change, not a loop. The autostart switch SHALL be one switch the Author sets, `on` to let EC2 start automatically and `off` to stop that, and the dashboard shows, as the Author asked on 2026-10-12: "I should be able to configure whether this lamda checking pipeline should even run, as in does it check hourly, or i can keep it off for days at a time if I am aware that no one is visiting or checking for the website." Each start, and each start refused, SHALL be recorded, alerted on both channels, and shown on the dashboard.
- **FR-066**: WHILE no host can answer dynamic requests, THE relay SHALL answer each with spec 000's degraded body and the cause `no_host_serving`. WHILE the edge can't reach the relay, as while AWS has the tunnel end back (FR-076), THE edge SHALL answer each itself with the same body and cause. Spec 002's room-conversation contract SHALL map that cause to the "local tier off" class, so that the room shows its resting message, `cannot_talk.resting` (point 4, approved; ADR 0044, decision 8). The static site SHALL keep loading. This covers the start-up gap, EC2 stopped with its autostart switch `off` or by the server budget while the laptop is off, a spot interruption of EC2 (FR-071), and one of the tunnel end (FR-076).
- **FR-067**: THE SYSTEM SHALL route each host's prod by configuration, in `config/routing.yaml`, with the route selected by host, since both hosts run `H4_ENV=prod`:
  - **the laptop**: ADR 0001's order. Degraded while the kill switch is `degraded` or unknown; the local model while it is healthy; then the one paid fallback the laptop's route names (the Anthropic API since `feat/010-anthropic-switch`, which reaches `main` before this spec's group 6; Bedrock before it), inside the $2-a-day sub-budget, the ceilings, and the adapter caps; otherwise degraded. Rule R1, "every primary must be local", SHALL hold for this route.
  - **EC2**: degraded while the kill switch is `degraded` or unknown; the Anthropic API while it is healthy and admitted inside the ceilings and its adapter cap; then Bedrock, its second paid route, inside the ceilings and any cap it has; otherwise degraded. EC2's route SHALL name no local adapter. Neither of its calls SHALL count against the $2-a-day sub-budget, which stays the laptop's fallback rule (the Author's answer of 2026-11-09).
  Each degraded response SHALL record which condition applied, as spec 000's FR-022 does.
- **FR-068**: BEFORE EC2's route names the Anthropic API, THE SYSTEM SHALL hold spec 010's preconditions:
  - the price entry (spec 010 FR-019);
  - the adapter's monthly cap, $20 (spec 010 FR-021);
  - the key: on EC2, in the managed secrets store, filled by the Author's hand and passed to EC2's gateway alone (FR-009);
  - the Author's words in row F3 (spec 010 FR-039), which he adopted on 2026-11-09 on `feat/010-anthropic-switch`.
  IF the price, the cap, or the key is missing, THEN EC2's stack SHALL refuse to start, naming the reason first, as spec 010's preflight does. WHILE F3 holds its placeholder and any host route names the Anthropic API, as `first`, `second`, or `fallback`, `make test` SHALL fail (spec 010 FR-039). The line that gives EC2's route the Anthropic API first SHALL be the Author's, written in his own step, as ADR 0041 makes prod's route change his.
- **FR-069**: THE SYSTEM SHALL run EC2 as a spot instance, around the clock, to keep it inside the server budget (question 15: "Spot, around the clock"). On an interruption, EC2 SHALL stop rather than terminate, so that it can start again when capacity returns (FR-071). Only these SHALL start or stop EC2: the start function, on the alarm, on the tunnel end's return, and when the Author invokes it with `make ec2-start` or `make ec2-autostart STATE=on` (FR-065); the guard, which only stops it (FR-071); the laptop's loop, which only stops it (FR-064); and the Author's `make ec2-stop`. Besides those, AWS stops it on an interruption and starts it when capacity returns (FR-071), and the server budget's action stops it (FR-023). A daily schedule SHALL stay in reserve: it SHALL arrive only by the Author's patch, with an ADR, if a measured month passes the server budget. **Amended 2026-11-11 (Assumptions, "EC2 on 12 hours a day"):** the schedule is no longer in reserve. From W1, EC2 runs 12 hours a day, by the Author's patch with an ADR.
- **FR-070**: THE start function SHALL be allowed to start only EC2's one instance, and the laptop's startup to stop only that instance, each with a short-lived, identity-based credential, and nothing SHALL change IAM at run time. Their IAM SHALL change only by the Author's apply (FR-012). Provisionally, as the session's default and not the Author's answer (question 16): "all in Terraform, human-only. The start function's role may start only the one tagged instance; the laptop's stop uses its own permission set, which may stop only that instance, through a short-lived SSO session." Also provisional (plan question 7): the guard's own role, which may stop only that instance and read the autostart switch, the health check's status, and the server action's status (FR-071), and the start function's reads of the health check's status and the tunnel end's state (FR-065, FR-076).
- **FR-071**: WHEN AWS gives notice that it is reclaiming EC2's spot capacity, THE SYSTEM SHALL alert on both channels, and visitors SHALL get FR-066's degraded body, the room's resting message, until capacity returns and EC2 serves again, or until the Author starts the laptop (question 17: "Same gap, plus an alert"). IF EC2 starts again on its own WHILE the laptop serves, the autostart switch is `off`, or the server budget's action has run (FR-023), THEN THE SYSTEM SHALL stop it again, record why, and alert. The shared state SHALL lose nothing (FR-019).
- **FR-072**: WHEN the relay changes the serving host, the start function starts EC2, the laptop stops it, a spot interruption changes EC2's or the tunnel end's state, or the server budget's action stops EC2, THE SYSTEM SHALL change only the instances' running state and the relay's memory, never a resource's configuration and never a DNS answer, so that the next plan from the same commit shows no change. The health check, its alarm, the start function, and their roles SHALL be Terraform's alone (FR-001). This settles ADR 0044's conflict with "Infrastructure exclusively via Terraform": the Author's "a lambda function can update route53" becomes a relay that picks the host, and a function that only starts EC2 (plan question 1: "Route 53's health check only wakes EC2").
- **FR-073**: THE shared meter SHALL bound the Anthropic API's spend in real time on both hosts (spec 010 FR-020 to FR-023). AWS-side budgets can't see that spend, so WHERE the Anthropic account offers a monthly spend limit, the Author SHALL set it at or under $20, and the runbook SHALL record that it is set, with no account details.
- **FR-074**: THE SYSTEM SHALL let the Author reset, renew, and initialize the shared state from his own terminal, with the operator credential, a reason, and an audit row (spec 000 FR-034), whichever host serves, or none, and without a public port (FR-050).
- **FR-075**: WHILE no host serves, THE SYSTEM SHALL call no model: no gateway or Bedrock path runs in the cloud. THE SYSTEM SHALL keep up, without either host: the edge and the static site, the public view's last snapshot (FR-057), the relay with its status answer (FR-037) and its degraded body (FR-066), the shared state, the budgets and their actions, the health check, the start function, the tunnel end, and AWS-side alerting. While AWS has the tunnel end back, the edge's own degraded body stands in for the relay (FR-076). This settles ADR 0044's open item 7.
- **FR-076**: THE SYSTEM SHALL run the tunnel end as a persistent spot instance that stops, rather than terminates, on an interruption (plan question 2: "Spot"), and:
  - WHEN AWS gives notice that it is reclaiming the tunnel end, THE SYSTEM SHALL alert on both channels;
  - WHILE the tunnel end is gone, the edge SHALL keep serving the static site and SHALL answer every dynamic request with FR-066's degraded body, even while the laptop or EC2 is up; the start function SHALL NOT start EC2;
  - WHEN capacity returns and the tunnel end runs again, its services SHALL start without a person, the laptop's tunnel SHALL reconnect, and the start function SHALL run once, starting EC2 if the laptop isn't serving, and its return SHALL be alerted.

  In the Author's words of the option he chose: "AWS can take it back, and while it's gone the site rests, even if the laptop or EC2 is up."

### Key Entities

- **Environment**: a deployment target: prod on EC2, prod on the laptop, the laptop's dev and dev-cpu, or an ephemeral cloud dev or staging VM. Environments are separated by VM, IAM role, cost-allocation tag, and budget. Each runs the one compose definition with its own environment file.
- **Host**: EC2 or the laptop. At most one is the serving host, except during a handover.
- **Shared state**: prod's meter and kill switch in the cloud: the ceilings' meters, reservations, the laptop's fallback sub-budget and its renewal flag, the adapter caps' months, the call records, the handover events, and the audit log. Both hosts' gateways and the relay use it.
- **Failover**: the health check on the laptop's path at the tunnel end's address, its alarm, the start function, and its autostart switch. It wakes EC2; it moves no visitor (plan question 1).
- **Tunnel end**: the small instance in the account, separate from EC2, run around the clock on spot, with its public address; the tunnel's far end, the relay, the public view's sink, and a small collector run on it.
- **Handover record**: when, which way, why (the laptop's start, a failed check, a spot interruption, AWS's own restart, a budget action), the start-up gap's length, and whether EC2 stopped.
- **Release**: a commit on `main`, with its images pinned by digest and its configuration. The Author's terminal makes releases before publication, and CI makes them after. Deployers pull releases.
- **Deployment record**: which release runs on which host, who started it (a deployer or the Author), when, and the outcome.
- **Plan record**: a redacted Terraform plan for one environment at one commit. It is carried in the merge-request note. (Posting it on the pull request moved to the publication spec.)
- **Apply record**: who applied which plan (by its hash), at which commit, when, which resources changed, and the outcome.
- **Model-spend budget**: an AWS-side budget on Bedrock's cost at the ceilings, with FR-023's automated action. The Anthropic API's spend is outside AWS and bounded by the meter (FR-073).
- **Server budget**: an AWS-side budget on every other cost of the account, with FR-023's automated action. The cost-anomaly monitor sits beside the budgets.
- **Tunnel**: the laptop's outbound connection to the tunnel end, its credential, and the local services it reaches.
- **Public view**: the read-only dashboard visitors see, its values, the time those values were taken, and which host serves.
- **Data-flow disclosure entry**: a row in spec 000's format, published on the site.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the laptop off and EC2 serving, hareet.ai loads and hello answers (from any route, or degraded) within 5 seconds in 100% of probes over a day. The exception is a window in which no host serves (a start-up gap, a spot interruption, or EC2 stopped on purpose). In such a window the site loads, and every dynamic request gets the degraded body with `no_host_serving`, both within 5 seconds.
- **SC-002**: Over the first full month after EC2's first apply, the account's cost other than model calls (amended 2026-11-11: this project's tagged cost; Assumptions, "One account, shared with the Author's other work"), the tunnel end included, is at or under the server budget's figure the Author set (FR-021), measured from AWS's cost data and shown on the dashboard.
- **SC-003**: Each month's model spend across both hosts is at or under $20 on the shared meter, and no UTC day's is over $5. AWS's cost data for Bedrock, and the Anthropic account's usage for the month, are each at or under what the meter counted for that provider.
- **SC-004**: Zero long-lived credentials for any identity, verified weekly by a committed audit script. (Amended 2026-11-11: but for the identities the Author's allowlist names, which the audit shows as allowed; Assumptions, "One account, shared with the Author's other work".)
- **SC-005**: Destroy-and-recreate of EC2 yields an identical stack, verified by image digests, and the shared state's values are unchanged.
- **SC-006**: An external scan of the laptop's public address finds zero open inbound ports, both with the tunnel up and with it down. A scan of the tunnel end finds only its tunnel port and the forwarded ports the disclosure lists.
- **SC-007**: In 10 rehearsed handovers each way:
  - laptop to EC2: the move needs no person, and 100% of dynamic requests in the gap get an answer or the degraded body with `no_host_serving`, with none getting a DNS, TLS, or gateway error page;
  - EC2 to the laptop: no dynamic request goes unanswered, and EC2 is stopped within 5 minutes of the relay sending to the laptop.
  Each gap's length is recorded and shown on the dashboard.
- **SC-008**: A kill-switch change in the shared state reaches the relay within 10 seconds. While the relay can't read the state, 100% of its answers are degraded.
- **SC-009**: A deliberately tripped rehearsal model-spend budget and a rehearsal server budget each alert on both channels, and each automated action takes effect on its rehearsal target. AWS's delay is recorded.
- **SC-010**: When every page is loaded and hello, the status request, and a twin turn are called, 100% of the browser's requests go to hosts the published disclosure lists, and the site sets zero cookies.
- **SC-011**: After a test run on each host, a scan finds a visitor's address, message, or answer in zero logs, traces, metrics, alerts, ledger rows, shared-state rows, or other stores.
- **SC-012**: Until publication, 100% of infrastructure changes carry a redacted plan in their merge-request note and an apply record that matches it, and zero applies come from an agent session.
- **SC-013**: With both hosts off for one hour, the public view answers 100% of the time with last-known values, the time they were taken, and "no host serving".
- **SC-014**: Every decision FR-062 lists has an ADR reachable from the README in two clicks.
- **SC-016**: Over a month in which the laptop serves at least once, EC2's running time while the relay sends to the laptop is at most 5 minutes per handover, and at most 5 minutes after each restart AWS makes on its own.
- **SC-018**: In 5 rehearsed spot interruptions of EC2 and 3 of the tunnel end:
  - 100% raise an alert on both channels within the notice AWS gives;
  - 100% of dynamic requests until service returns get the degraded body with `no_host_serving`, and the site keeps loading;
  - service returns without a person once capacity does, with the shared state's values unchanged. For EC2 that means EC2 serves again; for the tunnel end, the tunnel reconnects and the relay serves whichever host is up.
- **SC-017**: In a recorded run of at least 100 turns on EC2's stack, with stand-ins for both paid APIs: with both healthy, 100% of answered turns come from the Anthropic adapter; with it failing, 100% of admitted turns come from Bedrock, inside the ceilings, with nothing counted against the sub-budget. Each call carries provider, model, tokens, and cost on its span and its ledger row.

SC-015 moved to the publication spec (`publication-carryover.md`); its number isn't reused.

## Assumptions

- **The constitution first.** This design needs the amendment ADR 0044 proposes ([2026-11-09-constitution-1.1.0.patch](../../docs/merge-requests/2026-11-09-constitution-1.1.0.patch)), version 1.1.0, as the Author chose. Under 1.0.1, three standards conflict with it. EC2 running the stack conflicts with the Cloud standard's "The cloud hosts only what must be always-on and cheap". EC2's paid first route conflicts with the Model access standard's "the initial policy is local-first with Bedrock as fallback inside a capped sub-budget". A server budget outside the ceilings conflicts with Principle V's "the local tier exists so the cloud bill stays near zero". The constitution changes only by the Author's hand. Until he applies the patch, no task of this spec's starts past it: tasks.md puts his patch, T001, before any group, as the default order he confirms at T000. **Deviation, named: group 1 is built before T001.** His approval at T000 says "Let's approve the t000 and spec 001 plan. Let's have you build it out but not push or try anything in the cloud yet, i will do that in the morning, but you can have everything ready and verified by then. Use the latest dependenices adn versions for aws services, plugins". The session reads "build it out" and "have everything ready and verified by then" as his direction to build group 1, the guards, on `feat/001-guards` before he applies the patch, which departs from the order above. What the deviation allows: agent work on the branch and its patches. What it doesn't: nothing merges, and nothing is applied, before T001; group 1 writes no file under `infra/`; and every group that touches `infra/` (3 to 9) still checks T001's result first. **Extended to group 3 on 2026-11-10,** at the main session's direction, as its reading of the same words, not a new word of his: group 3's check found T001 unmet, and its agent work, the first files under `infra/` and the patch P-I1, is built on `feat/001-us1-bootstrap` anyway (tasks.md, group 3's precondition). What still holds for it: nothing merges, and nothing is applied, before T001, and he can overturn the extension. **Extended to group 4 on 2026-11-10,** the same way: the main session's reading of the same words, not a new word of his. Group 4's check found T001 unmet, and its agent work, `infra/account`, the alert bridge and the probe, and the patch P-I2, is built on `feat/001-us2-safety-net`, stacked on groups 1 to 3, anyway (tasks.md, group 4's precondition). The same holds for it: nothing merges, and nothing is applied, before T001, and he can overturn it. **Ended at T001** (3c89a8b0): nothing had merged or been applied before it. Principle I stays as written, with his recorded reason (Clarifications). Two sentences the first patch left as they were, the Observability standard's "Langfuse, self-hosted on the local tier" and the Cloud standard's always-on "Bedrock fallback path", are amended in it too, by his answer to the plan's question 3: "Langfuse self-hosted in the stack, and Bedrock called from the serving host. Still 1.1.0." The amended patch is on `docs/001-ec2-default`.
- **One gate for groups 1 to 4 (deviation, named, 2026-11-10).** The Author's words: "Let's gropu them together to make them minimal and hand-merge if we have to", and, asked how the account root should go, "One gate, named deviation (Recommended)". Groups 1 to 4 merge as one branch, `feat/001-cloud-elevation`, through one gate, of his branch of it, `feat/001-cloud-elevation-p` (plan.md §16, "Groups 1 to 4, as one branch"). The account root keeps its state in the bootstrap's bucket, so it can't be planned before T030 applies the bootstrap, and this merge brings `infra/account` with no plan in its note. That departs from two clauses of the constitution: the Cloud standard's "plan output posted on every PR", and the Development Workflow's Verify step, where CI requires "Terraform plan reviewed if infra changed". It is also ADR 0008's Decision 3's first exception ("The gate's `infra-plan-note` step fails a branch whose changed roots have no such block"). **And the gate's three new failures don't hold this merge:** the gate runs from main's checkout, whose gate predates P-1, so none of P-1's three steps runs for it: FR-005's (`infra-plan-note`: the gate fails a branch that changes `infra/` without each affected root's plan in its note), FR-002's (`infra-check`: it fails a change that would create or keep an untagged taggable resource), and FR-040's (`disclosure`: it fails a change that adds a service, a tunnel route, or an egress destination without its row). What stands in for them: the session's runs of P-1's checkers on a patched export, recorded in the combined note; T027's `make plan`, which runs `tools/gates/infra_policy.py --root` over the whole tree before `init` and again on the saved plan; and the Author's own run of `tools/gates/disclosure_check.py` on his branch before the gate. What still holds: the bootstrap's block is in the note before the gate (T027); and no apply happens without a reviewed plan, since `scripts/infra/infra_verify.py` refuses with `no_reviewed_plan` until a merge on main's first-parent line, since `infra/` last changed, brings a note holding exactly one block for the root at `HEAD:infra`'s tree. So the account's apply (T040) waits for T037's block in a later merged note, which he reads before it. The account root's deviation ends with that merge, and the three failures hold from the next branch on, which main's gate, with P-1, runs.
- **Four gates for spec 001 (2026-11-11).** The Author's answers: "Let's do the least amount of gates as possible", then "4 gates in all (Recommended)", and, on building later groups in parallel, "Might as well do it in our original order". The gates are named in the merge-request notes and research.md:
  - **Gate A:** groups 1 to 4, the branch above.
  - **W1:** groups 5 to 10. Its first commit regroups plan.md and tasks.md. Resources that need an earlier apply wait behind a switch.
  - **W2:** the Author's switch-on patch and the image digests, planned after W1's applies.
  - **Close:** group 11 and the records.
- **EC2 on 12 hours a day (deviation, named, 2026-11-11).** The session priced the month at about $49 with EC2 on spot around the clock (research.md R-05). Asked for the server budget's figure, the Author answered: "$45, with 12 h a day". Told that the twin then rests for the other 12 hours unless the laptop serves, and that fixed hours can be learned, he confirmed: "Keep 12 h a day, $45". This reverses question 15's "Spot, around the clock" and FR-069's rule that the schedule stays in reserve until a measured month passes the budget. As FR-069 requires, the schedule arrives by the Author's patch with an ADR, in W1, before EC2 exists. W1 settles three things then: the hours, how the schedule combines with the start function and the guard (FR-065, FR-071), and whether the site states the hours. Until W1 the figure binds only the bootstrap's and the account's resources.
- **The shared state on the tunnel end (deviation, named, 2026-11-11).** The session priced RDS at about $14 of the $45 budget. Offered RDS, Postgres in a container on the tunnel end, or a meter per host, the Author answered: "Postgres in a container on the tunnel end" (research.md R-20). This reverses the plan's choice of RDS and ADR 0024's first decision, and it widens the tunnel end's role in the spec's Terms. FR-017 to FR-020's requirements stand. The tunnel end's spot interruption already rests the site, so it adds no outage for visitors. W1 reworks:
  - the store's backups, TLS and role passwords;
  - the tunnel end's size;
  - the Degraded Modes row on the shared state;
  - the data-flow row C2;
  - tasks T068, T073 and T080.
- **One account, shared with the Author's other work (deviation, named, 2026-11-11).** At T030, the bootstrap's verify refused: the credential audit found the Author's other work in the account. It found six IAM users holding access keys, one of them spec 000's `h4reet-runtime`; a GitHub Actions OIDC provider; and a deploy role trusting a principal outside the account. The server budget would also have counted that work's costs, and its action stops EC2.

  The Author's answers:
  - asked how to go, with a new account for this project as the recommendation: "Share it, scope the checks";
  - asked whether `h4reet-runtime` goes on the list or is deleted: "Allow it too";
  - asked whether the identities' names may stand in the repository: "Keep them out of the repo".

  So (ADR 0047):
  - **The credential audit reads his allowlist.** It holds those eight identities, by finding kind and name, and is kept out of the repository: in his terminal, `~/.config/h4reet-ai/infra/iam-allow.txt`; in the weekly function, his SecureString `/h4reet/audit/IAM_ALLOW`. They're shown as allowed on every run. Only four kinds can be allowed, never for this project's own names, and the root's keys, the laptop's identity, and the handover's policies stay strict.
  - **`h4-server-month` and its rehearsal, `h4-rehearsal-server`,** count every cost tagged `project = h4reet-ai` but Bedrock's, so the other work never trips the server action, and the rehearsal proves the real filter.

  This departs from:
  - the constitution's Principle IV, "Cloud access is short-lived and identity-based": the listed users, `h4reet-runtime` among them, keep long-lived keys;
  - FR-008, SC-004, and User Story 1's scenario 5: the audit finds those keys and a CI identity before publication, and allows them;
  - FR-021 and SC-002: the project's tagged costs, not the account's;
  - spec 000's FR-013: `h4reet-runtime` keeps its keys.

  Least privilege between this project and the other work rests on IAM, which the Author keeps narrow by hand. The audit allows a key by name whether it is active or not. Costs the tag doesn't carry aren't counted, so EC2's volumes and address must carry it (T154). Tasks T150 to T154.
- **Spec 000 first.** Spec 000 is implemented, and its stack passes its success criteria, before this spec is planned (START-HERE §3: "Spec 001 is specified in full only after spec 000's success criteria pass on your machine"). Spec 000's T105 has landed, and prod's route names Bedrock as its fallback. Spec 010 is on `main`: `config/routing.yaml` defines the `anthropic` adapter, and `config/budgets.yaml` caps it at $20 a month. `feat/010-anthropic-switch` makes the Anthropic API prod's fallback and carries the Author's words in row F3, adopted on 2026-11-09; it reaches `main` before this spec's group 6.
- **ADR 0044's numbering.** ADR 0044 cites spec 001 by the 2026-09-07 outline's numbers (its "FR-005 to FR-008", "FR-007", "FR-009", "SC-002, SC-003", "US2 AS2" to "US5 AS2"), which this spec's traceability table maps. Where this spec cites ADR 0044, it cites the ADR's own decision and open-item numbers. The table under Clarifications maps each conflict the ADR names to this spec.
- **The domain is hareet.ai.** The merge-request note of 2026-10-30 records it: "The domain: hareet.ai stays. Spec 001's FR-004 and the constitution still name h4reet.ai: spec 001 changes through its lifecycle, the constitution by your hand." This rework makes the change in spec 001; quotes keep their own spelling. The zone moves to Route 53, which the health check sits beside and which the Author's words name ("configure route53"). The change of the registration's name servers is a human action outside Terraform, recorded like an apply. That settles the October assumption about keeping another DNS provider.
- **The memory estimate.** "About 8 GB" is the session's estimate, not a measured figure. The plan measures the stack's memory without the model server before it picks an instance type, and the Author sets the server budget's figure from the plan's prices (question 14; FR-021). Point 5's "$50 a month" is the session's unmeasured estimate too, and this spec uses it nowhere.
- **The server budget's scope.** This is a reading of "The server size and budget is outside the $20 model spend cost". The server budget covers every cost of the account that isn't a model call: EC2 running, EC2 stopped (its volumes and any public address), the tunnel end and its address, the edge, DNS and the health check, the shared state, the start function, storage, and the registry (ADR 0044, open item 10).
- **The tunnel end and the relay.** Decided by the Author's answers to questions 13 and to the plan's questions 1 and 2.
  - **What the health check probes.** The laptop's health path at the tunnel end's public address, through the tunnel, so "the health check sees the whole path": the tunnel end, the tunnel, and the laptop's stack (FR-054). It only wakes EC2. If Route 53's checkers can't carry a credential, the health path is the one unauthenticated route through the tunnel, and it returns only health (FR-053).
  - **What serves the resting reply.** The relay, while no host serves; the edge, while the relay can't be reached (FR-066).
  - **The relay runs on the tunnel end** (the plan's question 1, "Relay picks the host"), in front of both hosts. So one small instance carries every dynamic request, and it runs on spot by his choice (the plan's question 2, FR-076).
  - **The relay on spot, against the Cloud standard.** The standard, in force and as amended, lists the relay among what "must be always-on". A relay on spot capacity has gaps. The plan's question 8 asked the Author at T000 to choose between two ways of carrying it: his wording in the still-unapplied 1.1.0 patch, or a deviation named here, citing ADR 0044. The session takes option A provisionally under its reading of his approval at T000 (Clarifications, Session 2026-11-10): the wording in the patch, on `docs/001-ec2-default`, is his to write or confirm at T001, so no deviation is named here unless he chooses B. **Applied at T001** (3c89a8b0): the Cloud standard reads "the thin API/relay on spot capacity where the Author accepts the gap (ADR 0044)". Until T001 applies it, the plan and this spec say "around the clock, on spot" for the tunnel end, never "always-on".
- **Spot.** EC2 and the tunnel end each stop rather than terminate on an interruption, so each can start again when capacity returns ("until capacity returns", question 17; FR-076). Whether AWS restarts it on its own in a case the spec doesn't want, while the laptop serves or the autostart switch is `off`, is for the plan to confirm against AWS's behavior; FR-071 stops it again either way.
- **What serves while no host does.** This spec decides ADR 0044's open item 7 (FR-075). The gateways run in each host's stack, so when neither host serves, no gateway or Bedrock path runs, and nothing calls a model. The cloud keeps the edge, the site, the snapshot, the relay with its status and its resting reply, the shared state, the budgets, the health check, the start function, the tunnel end, and alerting. The Author's approved point 4 already accepts that the twin rests in such a window.
- **The laptop without a network.** The shared state is in the cloud, and unknown state is degraded (CLAUDE.md; spec 000 FR-031). So prod on a laptop that can't reach the network answers degraded, local answers included. Visitors can't reach it then anyway, since the tunnel is down. An offline showing runs `make up ENV=dev`, whose meter stays local and spends nothing. Principle I's "the entire production topology MUST be runnable on it, calling local models, with one command" holds whenever the laptop has a network. Offline, prod still starts with one command but answers degraded. Decided by the Author's answer to the plan's question 4: "Prod needs the network. For an offline demo you run the dev stack, which keeps its own local counter."
- **The resting message.** During a window with no host, the room shows `cannot_talk.resting`, whose words in `apps/web/content/messages.yaml` are: "The twin can't talk right now. The local tier, the computer it runs on, is resting." Those words name the laptop, though in the start-up gap EC2 is the host that is starting. The words are spec 002's content, and they change, if the Author wants, through spec 002's lifecycle and his approval, not here.
- **The intents' lines.** Intent 000's constraints read "$5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero, and that is part of the story, not a workaround", and "Everything containerized; the entire production stack runs on my local machine calling local models." This folder's intent reads "All of it must fit the same $5/day, $20/month ceiling" and "Idle infrastructure target ≤ $10/month; the rest of the ceiling is fallback inference and burst." Under the Author's words of 2026-11-09, the $5 and $20 are model spend, the server is outside them, and EC2 is the default host. The laptop still runs the whole production stack, calling local models (FR-045), but it is no longer where prod runs by default. The intents are the Author's words, and they stay his to revise; this spec reads them under his later words and doesn't edit them.
- **The Anthropic account's limit.** FR-073 assumes the Anthropic account may offer a monthly spend limit. Whether it does is the Author's to confirm, in the account; no agent sees it.
- **Deviation for the local phase: no pull requests and no protected environment for infrastructure** (ADR 0013, accepted).
  - The constitution's Cloud standard asks for "plan output posted on every PR; apply from a protected environment requiring human approval". CLAUDE.md's infra line says "apply is a human action in the protected CI environment".
  - Until publication there are no pull requests and no CI. The plan goes in the merge-request note (FR-005), and apply is the Author's terminal action, recorded (FR-007).
  - Basis: ADR 0013's Consequences already name "in spec 001, plan-in-PR and the protected apply" as unverifiable until publication, and ADR 0014 left that Consequence unchanged. ADR 0003 (proposed) says: "Until publication, apply is the Author's terminal action, and spec 001 must say how it is recorded."
  - The deviation lasts until publication. ADR 0008 records it, together with the move in the next bullet.
  - Agents still plan only and never apply (CLAUDE.md: "Running `terraform apply`. Never. Plan only."; FR-006).
- **The GitHub-side requirements move to the publication spec** (Clarifications, 2026-10-11; ADR 0008). Spec 001 closes on local criteria only. `publication-carryover.md` in this folder holds the moved text word for word.
  - Moved whole: FR-014 to FR-016, SC-015, User Story 1's scenarios 7 to 9, the Degraded Modes row for CI after publication, and flow C12. Their numbers aren't reused.
  - Moved in part: from User Story 1, the plan on every PR and the protected apply; from the Scope, CI's OIDC roles; from the plan record, posting it on the pull request.
  - FR-008 still allows no CI identity in the account before publication.
  - ADR 0003 (proposed) already says this of the protected environment: "That environment belongs to the publication spec (ADR 0014)."
- **Carried deviation: CI-side supply-chain controls** (ADR 0014). This spec's new services and its Terraform get no SBOM, no vulnerability scan, no automated updates, and no CI-built releases until the publication spec. Lockfile and version pins (FR-004), digest checks (FR-046), and the local gate stand in. Spec 000's publication carry-over already notes that Dependabot doesn't cover Terraform providers.
- **Carried deviations on identical images** (spec 000's Assumptions, "Deviation: image variants" and "Deviation, pending the Author's decision: one gateway build per stack", which is tasks.md T184; ADR 0015). EC2's environment file selects which services run, and spec 000's FR-017 counts that as configuration. FR-048 asks for the same digests on both hosts for a release, and the answer on releases (Clarifications, 2026-10-12) builds each release once. If EC2's processor architecture differs from the laptop's, a release is one multi-architecture image index.
- **Ending a deviation.** Spec 000's "the runtime identity is made by hand" ends with FR-013.
- **Enforcement points change by the Author's hand.** FR-005, FR-006, FR-011, and FR-012 change hooks, deny lists, the matrix, and the local gate, which only the Author changes (`.claude/**`, `tools/gates/**`). They arrive as patches the Author applies, each before the risk it guards (spec 000 plan §15).
- **Who runs the real plan before publication** (Clarifications, 2026-10-12). Agent sessions have no AWS credentials, and their sandbox doesn't allow the Terraform registry. The Author's terminal makes the plan that goes in the note. Agent sessions run formatting, validation, and policy checks offline, against a provider cache the Author seeds. Opening the sandbox would be the Author's decision ("Widening `permissions.allow` or sandbox domains to make a task easier. Ask instead.").
- **Hello is public** (Clarifications, 2026-10-12): through the relay, capped, as a test endpoint with spec 000's fixed prompt; it is not the twin. On EC2 its calls are paid, at spec 010's estimate of under $0.0002 a call.
- **When no route can answer** (Clarifications, 2026-10-12). Spec 000's degraded response, and the room's fixed message by the cause's class (FR-036, FR-066). Static answers would be content about the Author, which only the corpus may supply (Principle VIII).
- **What an AWS-side breach does** (Clarifications, 2026-10-12, re-read on 2026-11-09). FR-023 revokes Bedrock on both hosts automatically. The Anthropic API isn't on AWS's bill, so the meter and spec 010's cap bound it, and the account's own limit is its safety net (FR-073). The server budget's action stops EC2. Principle V: "When spend crosses a threshold the system degrades itself without waiting for a human, and a human must consciously restore it." The Author's apply sets each action up, as the kill switch's trip is set up in advance.
- **Releases before publication** (Clarifications, 2026-10-12). The Author's terminal builds each release once and publishes it, with its digests, to a private registry in the account, and both deployers pull from there. After publication, CI publishes releases. That depends on the publication spec's half of spec 000's FR-016, "built in CI and promoted unchanged".
- **The public view** (Clarifications, 2026-10-12). The public view is always the cloud-hosted snapshot, refreshed by the serving host so its values are at most 5 minutes old (FR-058), and no operator's Grafana faces the internet. This reads the constitution's "Grafana for public read-only dashboards" as Grafana's dashboards served as snapshots.
- **Default intervals.** The 5 minutes for the public view, the uptime probe, and the handover window reuse spec 000's 5-minute alert window. The relay's 10 seconds come from the 2026-09-07 outline. The relay's one-second checks follow spec 000's health rule; the health check's interval and threshold are the plan's. These are defaults, not facts about the Author.
- **Only production lives in the cloud.** Cloud dev or staging VMs, if used, are ephemeral; dev and staging otherwise remain on the laptop. Each ephemeral VM gets its own role, tag, and budget, and the Author sets the budget's amount before the VM is created.
- **The site.** `apps/web` builds spec 002's room, which this spec publishes at the edge with the disclosure and the status. What the site says about the Author goes public only with the Author's approvals (ADR 0034) and the readiness of each topic (spec 007).
- **Alerts.** SMTP stays the email channel. Spec 000's answer allowed that "spec 001 can swap in SES by configuration", but nothing here needs it. No mail is received on hareet.ai.
- **The laptop's egress.** Spec 000 left the local gateway's open egress route to the Author. Its disclosure row S2 says: "The `egress` network has no destination allowlist in spec 000: the Author decides whether to accept that or ask for one (plan, Complexity Tracking)". That decision is still open, and this spec doesn't make it: FR-051 limits only EC2's egress.
- **The clock.** Every budget day and month is UTC, as in spec 000 and AWS billing.
- **Agents and the cloud.** No agent session reaches AWS. The agents' engine is reused unchanged, with stand-ins for AWS, the shared state, the health check, and the tunnel's peer.
- **Development-time spend** stays on the Team plan (spec 000 FR-037).
- **Changes that need a human.** IAM, budgets, alert routing, edge rate limits, the kill switch, the failover, the start function and its autostart switch, and EC2's running pattern (spot, or the reserve schedule) change only with the Author and an ADR (FR-012). Question 16's IAM is a default the session took, not his answer; the plan carries it, and he confirms or changes it when he reviews the plan. The same holds for `config/budgets.yaml`, `config/alerts.yaml`, and `config/prices.yaml` (ADR 0017). This spec changes none of those files' existing figures: the ceilings, the sub-budget, and the cap stay as they are, and the server budget lives in Terraform. It adds one section to `config/budgets.yaml`, `public`, the relay's per-address cap (FR-033), in figures the Author sets, by his patch P-6 with an ADR (plan §14). Saying there that the sub-budget applies to the laptop's route only, if the plan puts it there, is his patch too.
- **Out of scope**:
  - the twin's behavior, the corpus, voice, avatars, and the room (specs 002 to 011);
  - the publication spec's own work: branch protection, CI workflows, Dependabot, and the code of conduct;
  - more than one AWS region for the stack;
  - a standing cloud staging environment;
  - a GPU or a model server in the cloud;
  - both hosts serving at once beyond a handover.

**Dependencies**:
- Spec 000, implemented and passing its success criteria.
- The constitution's amendment 1.1.0, applied by the Author, and ADR 0044, accepted: both done at T001 (3c89a8b0, 67028747).
- Spec 010 on `main`, and `feat/010-anthropic-switch` merged before group 6, with the Author's preconditions for the Anthropic route: his price, his cap, his key, and his words in row F3, all in place for the laptop's route (FR-068). EC2's key is his to write in group 7.
- An amendment to spec 002's room-conversation contract for `no_host_serving` (FR-066).
- The publication spec, which has no intent yet. It takes FR-014 to FR-016 and SC-015 (`publication-carryover.md`), and CI-built releases depend on it.
- The Author's terminal, for every apply, the domain's delegation, the secrets, releases before publication, and the autostart switch.

**Traceability to the 2026-09-07 outline**:

| Outline | This draft |
|---|---|
| User Story 1 | User Story 1; its scenarios 1 to 3 became scenarios 7 to 9, which moved to the publication spec (`publication-carryover.md`) |
| User Story 2 | User Story 6 ("unchanged" became the intent's "the very same"; "a new image on `main`" became "a new release") |
| User Story 3 | User Story 3; its dashboard scenario moved to User Story 8 |
| User Story 4 | User Story 4 |
| User Story 5 | User Story 2, now P1 |
| FR-001 | FR-001, FR-002 |
| FR-002 | FR-005 and FR-007 until publication; after it, FR-014 and FR-015, which moved to the publication spec |
| FR-003 | FR-008; after publication, FR-016, which moved to the publication spec |
| FR-004 | FR-027 |
| FR-005 | FR-043, FR-046 |
| FR-006 | FR-046, FR-052, FR-055 |
| FR-007 | FR-017, FR-030 |
| FR-008 | FR-022 |
| FR-009 | FR-057 |
| FR-010 | FR-033 |
| FR-011 | FR-056 |
| SC-001 | SC-004 |
| SC-002 | SC-002; the target is now the server budget (question 14) |
| SC-003 | SC-001, with the window in which no host serves |
| SC-004 | SC-005 |
| SC-005 | SC-014 |

## Expected Cost Impact

Two budgets, kept apart, in the Author's words: "Keep the cap as-is at $20 a month, $5 a day", and "The server size and budget is outside the $20 model spend cost."

**Model spend, on the shared meter.** Nothing changes in the figures (`config/budgets.yaml`; spec 000 FR-030; spec 010 FR-021). What changes is where each applies:

| Item | Figure | Where it applies |
|---|---|---|
| The daily ceiling, and its warning | $5 a day; $3.50 | both hosts |
| The monthly ceiling, and its warning | $20 a month; $14 | both hosts |
| The fallback sub-budget, per grant, inside the daily ceiling, and its warning | $2 a day; $1.40 | the laptop's fallback only |
| The Anthropic adapter's monthly cap | $20, the whole monthly ceiling | both hosts |

What changes is how often a turn is paid:
- **On EC2, every admitted turn is a paid call**, since EC2 has no local model. Spec 010's estimate, at the price the Author confirmed on 2026-11-09 (his commit ada55c98 on `main`, `config/prices.yaml` version 2026-11-09.1, "read 2026-11-09"), is about $0.0007 to $0.00095 a twin turn, and under $0.0002 a hello. At that estimate, the $20 month covers about 21,000 to 28,000 twin turns, and the $5 day about 5,200 to 7,100, before hello, the Author's live runs, and reservations. These are derived from spec 010's estimate, not measured.
- **On EC2, the $5 day is the only daily limit** on paid calls; the sub-budget doesn't apply there. The option the Author chose on 2026-11-09 says: "When a ceiling trips, the twin rests until you reset it, as today."
- **A flood on EC2 now spends.** The global limit admits up to 60 metered calls a minute (`config/budgets.yaml`). At spec 010's high estimate, that reaches the $5 day ceiling in roughly an hour and a half. The kill switch then degrades every answer until the Author's reset (spec 000 FR-033). The public cap and the per-client cap slow this, but a flood from many addresses can still reach it.
- **On the laptop, local answers cost nothing**, as before, and its paid fallback stays inside the sub-budget.
- **The Anthropic account's credits**: the meter counts list price either way (spec 010).

**The server budget.** $45 a month, the Author's figure of 2026-11-11, set from research.md R-33's measurement and R-05's prices (question 14). With EC2 on spot 12 hours a day (Assumptions, "EC2 on 12 hours a day"), the month is about $38 to $42. Around the clock it would be about $49, or $57 with spot in the priciest zone. The tunnel end's growth for Postgres (R-20) is to price in W1. The September research priced an instance for the thin services only (research.md R-04 and R-05, superseded), so its totals don't carry over to a stack of about 8 GB.

| Line | Kind of cost | Expected |
|---|---|---|
| EC2 while running | per hour, on spot, around the clock while it serves | The largest line. Sized from the measured stack, priced on spot (questions 14 and 15). Stopped while the laptop serves, and through spot interruptions. |
| EC2 while stopped: its volumes, and any public address | storage, and the public IPv4 charge, which AWS bills in use or not (research.md R-05) | Paid whether EC2 runs or not, and counted in the server budget. |
| The tunnel end | fixed, all month: a small spot instance and its public address (question 13; plan question 2) | Research.md R-05 priced a t4g.micro spot instance at about $2.20 a month and its address at $3.65, on 2026-10-18, before the free tier; the Author's option called it "About $2.20 a month (October's figure)". Both figures are to confirm: the Author re-prices both from AWS's pages (tasks.md T017). |
| The shared state's store | storage, and its backups | Postgres in a container on the tunnel end, the Author's answer of 2026-11-11 (research.md R-20), replacing RDS at about $14 a month. Its cost is the tunnel end's larger size and the backups' storage, to price in W1. |
| The hareet.ai zone, its queries, the health check | fixed, small | The zone's figure is research.md R-05's, to confirm; the health check is to price (tasks.md T017). |
| The start function | per invocation | A few starts a month. |
| The edge, the static site's storage, and the public view's storage | per request and per byte | Small at a portfolio's traffic. The caps bound a flood (FR-033), and the server budget catches it, late (FR-022, FR-023). |
| Terraform state, the secrets store, the release registry | storage, small | — |
| AWS budgets, the anomaly monitor, the budget actions, and the bridge that carries AWS-side alerts to Telegram | small or none | — |
| The uptime probe | per check | Never a metered call (FR-061). |
| Telegram and SMTP alerts | none | Both are free (ADR 0005). |
| Development time | the Team plan (spec 000 FR-037) | Agent sessions reach no cloud. |

**Worst cases.** AWS's billing data lags by hours, so a server overrun can pass the budget before its action stops EC2. The meter bounds model spend in real time on both hosts. FR-023 then cuts off Bedrock at the provider. The Anthropic API's spend is outside AWS's data, bounded by the meter, spec 010's cap, and the account's own limit (FR-073).

**Measurement.** SC-002 and SC-003; the ledger's rows by provider and host; the server's month against its budget on the dashboard (FR-059); each start-up gap's length.

## Degraded Modes

This table gives every new path's behavior when something it needs is gone. Principle I: "Every user-facing capability MUST define its degraded mode before its happy path".

| What is gone | What a visitor gets | What the operator gets | Requirements |
|---|---|---|---|
| The laptop (asleep, off, or WSL2 restarting), or its tunnel, while it served | The site. The resting message for dynamic requests (`no_host_serving`) until EC2 answers, then EC2's answers. | A handover alert, the start record, the gap's length, and the runbook | FR-054, FR-065, FR-066 |
| EC2, while it starts | The site, and the resting message | The gap's length on the dashboard | FR-066 |
| EC2's spot capacity, reclaimed by AWS while EC2 serves | The site, and the resting message, until capacity returns and EC2 serves again, or the Author starts the laptop | An alert on both channels at AWS's notice, the gap's length, and the runbook | FR-066, FR-071 |
| The tunnel end, down for any other reason (a crash, a failed deploy, a revoked key), whichever host serves | The site; the edge's `no_host_serving` and the room's resting message, even while the laptop or EC2 is up. The relay is on the tunnel end, so no host can be reached. EC2 isn't started for a path no visitor can reach. The public view says no host serves, from the edge's status answer, beside its last-known values and their times. | A probe alert after 5 minutes, the start function's `tunnel_end_down` if the laptop goes meanwhile, a deployment record if a deploy failed, and the runbook | FR-066, FR-075, FR-076 |
| Both hosts: EC2's autostart switch off, EC2 stopped by the server budget, reclaimed by AWS, or failed to start, and the laptop off | The site; the resting message; the public view's last-known values with "no host serving". Nothing calls a model. | An alert, a probe alert after 5 minutes, and the runbook | FR-028, FR-057, FR-065, FR-066, FR-075 |
| The Anthropic API on EC2: down, circuit open, or key refused | Bedrock's answer inside the ceilings, or else `cannot_talk.resting` | Spec 010's alerts and runbook | FR-067 |
| Both paid routes on EC2: a provider down, or Bedrock revoked | The degraded response naming its cause | Spec 000's and spec 010's alerts | FR-036 |
| The laptop's local model, and its paid fallback: the sub-budget spent or awaiting renewal, or the provider down | The degraded response naming its cause | Spec 000's alerts and renewal | FR-036, FR-067 |
| A model ceiling reached, or the kill switch tripped | `cannot_talk.budget`, on both hosts, local answers included | Spec 000's alerts and reset | FR-017, FR-030 |
| The shared state, unreadable or unconfirmed from a host | The degraded response on that host (`cannot_talk.unavailable`); the relay moves visitors off a host whose health answer reports it | A store alert | FR-019, FR-030, FR-054 |
| The shared state, unreachable from every host and the relay (RDS down, or being restored) | The site; the degraded response everywhere (`cannot_talk.unavailable`), local answers included; the status request still answered, naming the cause. Nothing calls a model. | A store alert; the restore runbook (FR-019) | FR-019, FR-030 |
| The laptop's stop of EC2, failed | Nothing changes: the laptop serves, and the shared meter bounds model spend | An alert; EC2's running hours count against the server budget until it stops | FR-064 |
| The start function, failed or refused | The site, and the resting message | An alert and a probe alert | FR-065 |
| The health check (AWS-side) | Nothing changes: the relay picks the host on its own checks; only EC2's automatic start waits | Probe alerts | FR-061, FR-065 |
| The tunnel end, reclaimed on spot (plan question 2) | The site; the edge's `no_host_serving` and the room's resting message, even while the laptop or EC2 is up, until capacity returns. The public view says no host serves, from the edge's status answer. | The warning's alert; a probe alert after 5 minutes; on its return, an alert, the tunnel reconnecting, and one run of the start function | FR-066, FR-076 |
| The edge or the DNS service itself | Nothing loads. There is no second host: one account, and no second vendor. | Probe alerts | FR-061 |
| A client's share of the caps | A 429 refusal | Refusal counts | FR-033 |
| Bedrock's permission, after an AWS-side breach | On the laptop, local answers continue; on EC2, the Anthropic API continues, inside the meter | An alert and the seven-day incident note | FR-023 |
| The server budget, crossed | EC2 stops. The laptop serves if the Author runs it, and otherwise the resting message. | An alert and the seven-day incident note | FR-023 |
| AWS's billing data, arriving late | Nothing changes | The safety net acts late; the meter is unaffected | FR-024 |
| A new release that fails its health checks | The previous release keeps answering | An alert and a deployment record | FR-047 |
| The release source | Nothing changes; EC2 starts on its last release | The deployer's last poll, on the dashboard | FR-046 |
| The serving host's telemetry backends | Nothing changes | Delayed or lost telemetry, shown on the dashboard; enforcement is unaffected | FR-060 |
| The snapshot's refresh, while a host serves | Older values, with their time | The freshness panel | FR-058 |
| The uptime probe | Nothing changes | Missing probe results on the dashboard | FR-061 |
| One alert channel | Nothing changes | The other channel (spec 000 FR-032) | FR-022 |
| The state backend or its lock | Nothing changes | Plan and apply refuse to run; only the Author may force-unlock | FR-001, FR-006 |
| The secrets store, when EC2's stack starts | The resting message | The stack refuses to start (spec 000's startup refusals), and a probe alert | FR-009 |
| The certificate's renewal | Browser warnings once it expires | An alert before expiry, and the runbook | FR-027, FR-056 |
| The laptop's network, while the Author shows prod there | No visitors reach it (the tunnel is down), and EC2 takes over; on the laptop itself, degraded | The runbook: an offline showing runs `ENV=dev` | FR-019 |

The row for CI after publication moved to the publication spec with FR-014 and FR-015 (`publication-carryover.md`).

## Data-Flow Disclosure Entries

These are for `docs/data-flow-disclosure.md`, each in the change that creates or changes its flow (FR-040). The site publishes the result (FR-041). This is the list the spec commits to; the disclosure itself is authoritative. The rows below use the disclosure's existing IDs. Spec 002 holds V1, V2, and V4, and reserves V3 and V5 ("Rows V3 and V5 come with the work that creates each flow"), so this spec's new visitor rows start at V6. The October draft's own V and C numbers are replaced; C12 stays reserved for the publication spec.

### Changed rows

The headline change: **on EC2, every hello and twin turn goes to the Anthropic API.** Rows V2, F3, and S2 change for that, and the others for the edge, the tunnel, and EC2.

| Row | Cell | The change |
|---|---|---|
| V2 | From → To | "after spec 001, through its edge and relay" becomes "after spec 001, through hareet.ai's edge to the one relay, on the tunnel end (C1), which sends it to the serving host's relay block: EC2's by default, inside the account, or the laptop's through its tunnel while the Author runs it (C14)". |
| V2 | Why | After "On prod, that fallback is the paid adapter prod's route names: Bedrock (F1) or the Anthropic API (F3) (spec 010)", add: "On EC2, prod's default host, there is no local model: every turn goes to the Anthropic API first (F3), and to Bedrock (F1) when it can't answer. In the Author's words: "On the ec2 server, anthropic api will answer first." (2026-11-09; spec 001)". |
| V2 | Default | Add: "On EC2, every turn the meter admits is a paid call." |
| V2 | How to switch it off | Add: "Stop EC2 and set its autostart switch off (spec 001, FR-065)." |
| F3 | From → To | "`gateway`, on prod only" becomes "`gateway`, on prod only: on EC2 as its first route, and on the laptop while its route names the Anthropic API as the fallback". The endpoint, the model, and the placeholder for the Author's words don't change. |
| F3 | Trigger | Add, before the laptop's trigger: "On EC2: every `POST /hello` and room turn that the kill switch and admission let through, inside the ceilings and the adapter's monthly cap, with no local model before it and no sub-budget; and the health check, once a minute while EC2 runs." |
| F3 | Why | Add: "On EC2 it answers first: "On the ec2 server, anthropic api will answer first." (the Author, 2026-11-09)". |
| F3 | Default | "off: on only once the Author changes prod's route to `fallback: anthropic`" becomes "On EC2: on, once its route names the Anthropic API first, which waits on his price, his cap, his key, and his words in this row (spec 010, FR-002 and FR-039; spec 001, FR-068). On the laptop: off until his route names it as the fallback." |
| F3 | How to switch it off | Add: "On EC2, change its route, or stop EC2 and set its autostart switch off." On EC2 the meter's bound is the $5 daily and $20 monthly ceilings and the adapter's cap; "$2 of fallback a day" stays the laptop's. |
| F3 | The Author's words | No change in what is asked. He adopted his words on 2026-11-09, on `feat/010-anthropic-switch`, which quotes them in its note and reaches `main` before this spec's group 6. He also weighed them against intent 000's "Nothing is retained beyond the session without explicit consent" and the corpus's "their conversation is not saved", in his words: "We can say nothing is retained when running local models. Refer to Anthropic if cloud models are on." Under this spec they describe every turn on EC2, not only a fallback's, and `make test`'s placeholder gate covers every host route that names the Anthropic API (FR-068). |
| S2 | From → To | Add: "On EC2, the same, through the instance's egress allowlist (spec 001, FR-051), which admits only the destinations listed in their own rows." |
| S2 | Trigger | Add: "On EC2: F3 first, then F1. On prod, on either host: the shared state, C2." |
| S2 | Carries | "what A1, A2, F1, F2, and F3 say" becomes "what A1, A2, C2, F1, F2, and F3 say (F2 on the laptop only)". |
| S2 | How to switch it off | Add: "On EC2, stop EC2. The laptop's `egress` network still has no destination allowlist, the Author's open decision." |
| S1 | Why | "(spec 001's tunnel will attach here)" becomes "spec 001's tunnel attaches here, on the laptop (S16)". Add: "On EC2, `edge` also takes the cloud edge's requests (spec 001, FR-032), without loosening the laptop's `127.0.0.1` binding." |
| V1 | From → To, Default | Add: "After spec 001, hareet.ai's edge, which serves the built site from the account's storage." Default "loopback only until spec 001" becomes "on, at the edge". |
| V4 | From → To | Add: "After spec 001, through hareet.ai's edge to the relay on the tunnel end (C1), and on to the serving host's relay block (C14), whose gateway adds one to its own counter." |
| F1 | From → To, Trigger | Add: "On EC2, as its second route, when the Anthropic API can't answer, inside the $5 daily and $20 monthly ceilings, with no sub-budget. EC2's credentials come from its instance role, not F2's session." |
| F2 | From → To, Carries | Add: "The permission set now allows only `sts:AssumeRole` on `h4-laptop-bedrock`, an ordinary role that holds the Bedrock permission, so the gateway also calls STS's `AssumeRole` (`sts.amazonaws.com`) with its SSO credentials, and gets that role's short-lived credentials back. The budget action's deny attaches to that role (spec 001, FR-023)." |
| A1, A2 | From → To | Add: "and EC2's `gateway`, while EC2 serves". |
| D1 | one sentence | "the stack's only calls to Anthropic are F3's, prod's gateway with its own key, while prod's route names the Anthropic API (spec 010)" becomes "the stack's only calls to Anthropic are F3's, prod's gateway with its own key: on EC2 always, and on the laptop while its route names the Anthropic API (spec 010; spec 001)". |

### New rows

| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off |
|---|---|---|---|---|---|---|---|
| S15 | `relay`, on the tunnel end → the serving host's relay block (C14) and the shared state (C2). It takes the edge's requests (C1) | each dynamic request | the gateway's request fields and the client address, in memory | the message, the answer, or the address in any log or store (FR-031, FR-042) | the public request cap, the kill-switch read, and the choice of host, before any gateway (FR-030, FR-033, FR-054) | on, always, unless AWS has the tunnel end back (FR-076) | the Author's Terraform; stopping the tunnel end |
| S16 | `tunnel`, on the laptop's prod only → the tunnel end (C3) | `make up ENV=prod` on the laptop | as C3 | as C3 | the laptop serves without an inbound port (FR-052) | on, with the laptop's prod | `make down ENV=prod`; the Author revokes its credential in one action (FR-055) |
| S17 | `tunnel-end`, the tunnel's far end, on the tunnel end only. It accepts the laptop's one connection and only the forwards this row lists, and refuses any other. Three reverse forwards lead back to the laptop's `edge`: 2201 for the relay's requests (C14), 2202 for telemetry (C15), and 2203 for Route 53's health checks (C5). Two local forwards lead from the laptop: 5432 to the shared state (C2) and 2301 to `snapshot-sink` (C4) | the relay's requests for the laptop, the collector's export, the health checks, the laptop's store connection, and its panels | those flows' requests and answers, passed through inside the tunnel | anything to or from Langfuse, the admin listener, or Grafana; a shell or a command; the message, the answer, or the address in any log or store | the laptop's tunnel ends in the account, with no third party (FR-052; question 13) | on, around the clock, on spot, whether or not either host serves, except while AWS has the tunnel end back (FR-076) | the Author's Terraform; revoking the laptop's credential closes the tunnel (FR-055) |
| V6 | the visitor's browser → hareet.ai's edge → the relay on the tunnel end (C1): hello and the status request. The relay answers the status itself, and sends hello on to the serving host's relay block (C14) | a visitor calls hello or opens the status | hello's message (at most 500 characters) and its answer; the IP address, held in memory for the caps; the user agent | the message or the answer in any log, trace, or store; the address in any log, trace, metric, alert, ledger, the shared state, or any store (FR-031, FR-042) | to test the model gateway, and to show which host serves (FR-030 to FR-037) | on, once hello is public (FR-039) | the Author takes hello off the site; with both hosts stopped, hello gets `no_host_serving` and the status still answers |
| V7 | the visitor's resolver → Route 53, for hareet.ai | opening the site | the lookup, as the resolver sends it | — | to find the site | on | — |
| V8 | the visitor's browser → the public view, at the edge | opening the dashboard | the IP address, the user agent | — | to watch the system run (FR-057 to FR-059) | on | — |
| V9 | the visitor's browser's own checks, such as a certificate's status | the browser's choice | what the browser sends | — | listed because the site can't switch them off | the browser's | the browser's settings |
| C1 | hareet.ai's edge → the relay on the tunnel end, through CloudFront's private origin, inside AWS's network | each dynamic request (V2, V4, V6) | the request's fields and the answer back; the client address the edge saw (`CloudFront-Viewer-Address`), held in memory only | cookies; the message, the answer, or the address in any log, trace, or store | to answer visitors (FR-029, FR-032) | on | stop the tunnel end; the edge then answers itself (FR-066) |
| C14 | the relay → the serving host's relay block: EC2's at its private address, inside the VPC; the laptop's through the tunnel (S17, C3) | each forwarded request, and the relay's health checks every second | the request's fields and the answer back; the client address, as `X-H4-Viewer`, held in memory only; the relay's bearer token for that host; `traceparent` | cookies; the operator token; any other viewer header; the message, the answer, or the address in any log, trace, or store | to send each request to the serving host (FR-054) | on | stop both hosts; the relay then answers `no_host_serving` (FR-066) |
| C2 | each host's `gateway`, each host's Grafana (as `grafana_ro`), and the relay on the tunnel end (as `relay_ro` and `relay_rw`) → the shared state in RDS, in the account: from EC2 and the tunnel end inside the VPC; from the laptop through the tunnel's forward (C3, S17), with TLS inside it | each admission, commit, and kill-switch read; each handover event; operator actions | meter amounts, reservations, call records (provider, model, tokens, cost, attribution, host, times, request IDs), the kill-switch state, the renewal and cap flags, handover events, and audit rows (the action, the host, the operator's fingerprint, and the reason the Author types) | payloads; client identifiers; addresses; secrets | one meter for both hosts (FR-017, FR-019) | on, with prod on either host, and the relay always | `make down ENV=prod`; without it, prod and the relay answer degraded |
| C3 | the laptop's `tunnel` → `tunnel-end` on the tunnel end (question 13), over OpenSSH | while the laptop's prod runs | the tunnel's credential; keep-alives; the laptop's network address, to the tunnel end only; and, inside the tunnel, the flows S17 lists: C14, C15, C5, C2, and C4 | any route to Langfuse, the admin listener, or Grafana (FR-052) | the laptop serves without an inbound port, and its address stays out of public DNS (FR-052) | on, with the laptop's prod | `make down ENV=prod`; revoke the credential |
| C4 | the serving host's `snapshot-publisher` → `snapshot-sink` on the tunnel end (EC2's inside the VPC, the laptop's through the tunnel's forward), and the sink → the public view's storage, in the account | every 2 minutes while a host serves; the sink's cloud part every 2 minutes always | dashboard values and their time; which host serves; EC2's state; the server's month | payloads, client identifiers, operator reasons, secrets | so the public view never goes dark (FR-057) | on | stop both hosts and the view keeps its last values; stop the tunnel end and it keeps them too |
| C15 | the tunnel end's `otel-collector` → the serving host's collector: EC2's inside the VPC; the laptop's `edge` telemetry block, 8086, through the tunnel's reverse forward 2202 (S17) | as the relay and the tunnel end's services emit, from a file-backed queue | the relay's and the tunnel end's spans, metrics, and logs, labelled with the host they concern | payloads, addresses, client identifiers, secrets (spec 000's redaction, again in this collector) | the relay's traces join the host's, and the dashboard counts what was delayed or lost (FR-060) | on | stop the tunnel end; the queue holds up to its bound, and the drop is counted |
| C5 | Route 53's health checkers → the laptop's health path, at the tunnel end's public address, through the tunnel | at the check's interval | probe requests; the health answer, 200 or 503 with no body | anything else from the stack | to wake EC2 when the laptop goes (FR-054, FR-065) | on | the Author's Terraform |
| C6 | the laptop's `h4-handover` loop, which `make up ENV=prod` starts → AWS's EC2 API; and → hareet.ai's edge, for the status request (V6's path), marked as a probe | the status request every 5 s while it waits for the relay to serve the laptop; EC2's describe call every 60 s while the laptop serves; a stop at each takeover, and each time it finds EC2 running while the laptop serves | the status request and its answer; the describe and stop requests for EC2's one instance; the short-lived session's signature; the laptop's network address, to the edge and to AWS's API | a long-lived key (FR-008); any visitor's data | one host at a time (FR-064) | on, with the laptop's prod | `make down ENV=prod`; the Author's IAM (FR-070; question 16, provisional) |
| C7 | each deployer, on EC2, the tunnel end, and the laptop → the release source; EC2 and the tunnel end → the account's registry (ECR) and the account's endpoints they use (the secrets store, Systems Manager, and SNS, to publish to `h4-alerts`) | polls, EC2's start, deployments; each host alert (a deploy rolled back or refused) | release IDs, image names and digests, the host's address; EC2's requests for its secrets; each alert's one line of kind and facts | credentials beyond pull access; secret values outside EC2; in an alert, any payload, address, client identifier, or secret | pull-based deployment (FR-046); the Anthropic key on EC2 (FR-068); AWS-side alerts (FR-022) | on | stop the deployer; stop EC2; stop the tunnel end |
| C8 | AWS's budgets and anomaly monitor → Telegram and the alerts mailbox | a threshold crossed | the budget or monitor, the threshold, the amounts, the time | payloads, client identifiers | the safety net (FR-022) | on | the Author's Terraform |
| C9 | the Author's terminal → AWS's APIs: Terraform plans and applies, and the state | the Author's plan or apply | resource configuration, the state, the Author's short-lived session | secret values (FR-009) | infrastructure as code (FR-001, FR-007) | off; only the Author | — |
| C10 | the Author's terminal → the release source, before publication | the Author's release | release images and their digests | — | releases (Clarifications, 2026-10-12) | off; only the Author | — |
| C11 | the uptime probe → the site and the status request | at its interval | probe requests, marked as probes | — | detection (FR-061) | on | the Author's Terraform |
| C13 | the Author's terminal → the shared state | the Author's reset, renewal, or initialization | the operator credential's proof, the action, the reason, the values he states | — | operator actions whichever host serves (FR-074) | off; only the Author | — |

Not new rows: EC2's gateway takes its role credentials from the instance's metadata service, which never leaves the host. The start function's call to EC2's API runs inside the account, from no host and no visitor.

## Constitution Check

This applies the `constitution-check` skill's eight questions against `.specify/memory/constitution.md` 1.0.1, the version in force when it was made. The 1.1.0 amendment ADR 0044 proposed wasn't applied then, and where this spec needs it, the row says so. Since T001 (3c89a8b0), 1.1.0 is in force, and ADR 0044 is accepted (67028747).

| Principle or standard | Touched | How this spec complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | Every flow is in the public disclosure, on the site, before it happens (FR-040 to FR-042). Rows V2 and F3 say that on EC2 every turn goes to the Anthropic API, with what Anthropic keeps in the Author's words (FR-068). There are no cookies, no device storage, and no stored visitor address. Principle I stays as written. The Author's recorded reason why EC2 complies with "MUST prefer on-device or self-hosted inference where it meets the quality bar": "within the server budget EC2 has no GPU, and a model run on its CPU wouldn't meet the twin's quality bar, which your laptop's GPU model does. So the API is what meets the bar there, and the laptop stays self-hosted-first." The laptop stays a production tier that runs the whole topology with one command, calling local models (FR-045). Offline, its prod answers degraded, and offline demos run `ENV=dev`, by the Author's answer to the plan's question 4 (Assumptions). Every new path has a degraded mode (Degraded Modes). No biometrics. |
| II. Production-grade or not shipped | Yes | Tests come from the acceptance scenarios and the matrix; red-team cases run on every adapter that can answer (FR-039). Every new path gets telemetry and panels (FR-059, FR-060). Runbooks cover every new alert (FR-056), and decisions get ADRs (FR-062). Missing: the server's cost estimate, which by the Author's answer to question 14 the plan makes from a measured stack and AWS's prices before he sets the figure. The model-spend estimate is spec 010's (Expected Cost Impact). |
| III. Intent → spec → code; humans merge | Yes | The intent in this folder is accepted, but its cost lines are superseded by the Author's later words, which ADR 0044 records. The intents stay his to revise (Assumptions). No code comes before an approved plan, and the plan waits on his constitution patch. Deviation for the local phase: merge-request notes and the local gate stand in for pull requests (ADR 0013; FR-005, FR-007). |
| IV. Least privilege | Yes | Apply, destroy, and state writes are human-only, and agents are refused in every spelling (FR-006). Access is only short-lived and identity-based (FR-008). The start function may start only EC2's one instance, and the laptop may stop only that one (FR-070; question 16, taken provisionally as the session's default, not the Author's answer). No secret is in the repository, the state, plans, or agent context (FR-009 to FR-011). The Terraform for IAM, budgets, alert routing, edge rate limits, the kill switch, the failover, the start function, and the running pattern is human-only (FR-012). The laptop takes no inbound connection, pulls its releases, and runs no CI runner (FR-046, FR-052, FR-055). The tunnel end refuses any forward but the listed ones (FR-052). EC2's operator interface isn't public (FR-050), and its egress is allowlisted (FR-051). No sandbox domain or permission is widened. Deviation for the local phase: apply runs from the Author's terminal, not a protected environment (Assumptions). |
| V. Cost is a first-class signal | Yes | The model ceilings don't change, and one shared meter counts both hosts against them (FR-017, FR-020). On EC2 the ceilings and the adapter caps limit the paid routes, and on the laptop the sub-budget limits the fallback (FR-067). The server has its own budget, with its own automatic action (FR-021 to FR-023). AWS budgets and anomaly detection come first (FR-022), and both actions are rehearsed by tripping them (FR-026). The meter stays the control (FR-024). Model calls go only through the gateway with cost attributes (FR-035), and spend shows on every public view (FR-059). Deviation under 1.0.1: "the local tier exists so the cloud bill stays near zero" no longer describes the default host; 1.1.0 changes its reason to "the model spend", and the Author chose MINOR for it. |
| VI. Build in public | Yes | The public dashboard never goes dark (FR-057 to FR-059, FR-075), the disclosure is on the site (FR-041), apply records are committed (FR-007), and decisions get ADRs (FR-062). From W1, EC2 runs 12 hours a day (Assumptions, "EC2 on 12 hours a day"), so the twin's hours can be learned by watching. Whether the site states them is W1's question. Deviation, already recorded in ADR 0013: the repository stays private until publication, although the site may go live before it. |
| VII. Say exactly what you owned | Lightly | The site states nothing about the Author that isn't in the corpus or a filled `facts/` slot (FR-038). The product reasoning is visible: why EC2 is the default, in his words; and the trade it makes, every turn paid on EC2 and free on the laptop, shown on the dashboard. |
| VIII. Honest AI | Yes | The twin stays disclosed as AI, and hello is named as a test (FR-038). Red-team cases pass on every adapter that can answer before anything goes public (FR-039), and readiness evidence covers each one (Scope, spec 010's FR-026). |
| Prohibited without a human | Yes | IAM, budgets, alert routing, edge rate limits, and the kill switch change only through the Author's apply or the operator credential (FR-007, FR-012). The start function, the laptop's stop, and the budget actions are the system's own actions, set up by the Author's apply, as the kill switch's trip is (FR-023, FR-065, FR-072). |
| Secrets and supply chain | Yes | Terraform and its providers are pinned (FR-004). The Anthropic key lives in the secrets store on EC2 and in prod's env file on the laptop, denied to agents before it exists (spec 010 FR-032; FR-011). The tunnel credential is scoped and revocable (FR-055). The CI-side controls stay with the publication spec (ADR 0014). |
| Incidents | Yes | A model-spend or server-budget breach gets the seven-day incident note (FR-023). Meter breaches keep spec 000's drafts. |
| Cloud standard | Yes, with the 1.1.0 patch as amended, with plan question 8's wording | One account, with environments separated by VM, role, tag, and budget (FR-001, FR-002). Remote state with locking (FR-001). Infrastructure only through Terraform, the health check and the start function included; run-time actions change state, never configuration (FR-072). Under 1.0.1, "The cloud hosts only what must be always-on and cheap" rules out EC2 running the stack; 1.1.0's "The cloud may also host the production stack on one VM, without the local model server, as the default production host (ADR 0044)" allows it (FR-044). The relay runs on the tunnel end (plan question 1), around the clock, on spot (plan question 2; FR-076). The standard, in force and as amended, says the cloud hosts what "must be always-on", and names "the thin API/relay" among it, so a relay on spot capacity is a gap in it. Plan question 8 was put to the Author at T000; the session takes option A provisionally under its reading of his approval: his wording in the still-unapplied 1.1.0 patch, his to write or confirm at T001 (Clarifications, Session 2026-11-10). The list's "Bedrock fallback path" becomes Bedrock called from the serving host, in the patch as amended for the plan's question 3, on `docs/001-ec2-default`. |
| Compute standard | Yes | One compose definition runs on EC2, on the laptop, and, for the tunnel's far end, the relay, the sink, and a collector, on the tunnel end (FR-043, FR-052). The relay is a container (FR-029). Both hosts run the same images by digest (FR-048), and spec 000's image deviations carry over (Assumptions). |
| Local tier standard | Yes, with the 1.1.0 patch | Heavy containers run on the laptop, "exposed only through an outbound tunnel", which stays as written (FR-052). Deployment is pull-based (FR-046). 1.1.0's "Production MUST function when it is off, via the cloud host and its paid routes within the ceilings and adapter caps, or via degraded mode": EC2 serves, or the site answers degraded (FR-028, FR-063, FR-066). |
| Model access standard | Yes, with the 1.1.0 patch | One gateway; routing as configuration, per host (FR-067). Under 1.0.1, "the initial policy is local-first with Bedrock as fallback inside a capped sub-budget" doesn't allow EC2's paid first route. 1.1.0's sentence does: "on the laptop, the initial policy is local-first with one paid fallback, Bedrock or the Anthropic API, inside its capped $2-a-day sub-budget; on the cloud VM, the Anthropic API answers first, with Bedrock as its second paid route, inside the $5-a-day and $20-a-month ceilings and the adapter caps (ADR 0044)." |
| Observability standard | Yes, with the 1.1.0 patch as amended | Public read-only dashboards with a cloud-hosted last-known snapshot (FR-057 to FR-059). EC2's stack runs its own Langfuse. 1.0.1 says "Langfuse, self-hosted on the local tier"; the patch as amended for the plan's question 3 says Langfuse self-hosted in the stack. |
| Alerting standard | Yes | AWS-side alerts and handover alerts go to Telegram, then email, never SMS (FR-022, FR-065). Degradation never waits on delivery (FR-024). |
| Development Workflow step 6 | Yes | Releases are pulled by digest and restarted per service. A release that fails its health checks rolls back automatically, and the previous release is one command away (FR-046, FR-047). Building once and promoting in CI waits for the publication spec (ADR 0014). |

## Open questions for /speckit-clarify

None of this spec's questions is open. The one question the plan raised for T000, the plan's question 8, the relay on spot against the Cloud standard, stands at option A, taken provisionally under the session's reading of his approval at T000; its wording is his to write or confirm at T001 (Clarifications, Session 2026-11-10; Assumptions). Questions 1 to 12 were answered on 2026-10-11 and 2026-10-12, and their numbers stay because the readings cite them. Questions 13 to 17 were raised by the rework on 2026-11-09. The Author answered 13, 14, 15, and 17 the same day, each with the recommended option. Question 16 wasn't asked, and the session took its recommended option provisionally, as a default the plan carries, which his approval at T000 leaves standing. Clarifications quotes each question as it was put to him, with his choice and the option's text; the options below are as this spec offered them, kept as the record. The conflicts this spec couldn't settle are under "Kept for the plan", at the end.

### Question 13: Which outbound tunnel does the laptop use, and where does it end? (FR-052)

**Answered on 2026-11-09: A**, "Tiny always-on relay (Recommended)". The tunnel ends on the tunnel end, a small instance in the account, run around the clock on spot (FR-052, FR-054, FR-076).

The laptop dials out, so visitors reach it through a tunnel. The failover's health check also needs a public name to probe, one that fails when the laptop or its tunnel fails (ADR 0044, open item 1). On 2026-10-12 the tunnel was to end "inside the project's AWS account", on the cloud VM, so that no third party reads what it carries. EC2 is now stopped while the laptop serves, so the tunnel can't end there.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | A small, always-on tunnel end inside the account, separate from EC2. September's OpenSSH reverse forward (research.md R-11) fits, on the smallest instance. The health check probes the laptop's health path through it. | No third party in the visitor's path, as the 2026-10-12 answer chose. The check sees the whole path. One more small server runs all month, counted in the server budget: research.md R-05 priced a t4g.micro spot instance and its public address at about $2.20 and $3.65 a month on 2026-10-18, to re-price. It is a second machine to patch. |
| B | A managed tunnel service from a third party, which gives the laptop a public name. | Nothing of ours runs in the cloud while the laptop serves, and the check probes the vendor's name. But a third party carries visitors' messages, and may read them where it ends TLS. That needs a disclosure row with what the vendor keeps, in your words, as F3 does, and it reverses the 2026-10-12 answer. Some services want the name in their own DNS zone, which would put a second DNS vendor in front of the site. |
| C | The tunnel ends on EC2, as in September. | Nothing new to run, but EC2 must stay on while the laptop serves, which your "If i am running locally, then the ec2 should be shut off and not incurring costs" rules out. Listed so the trade is visible. |

Recommendation: A. It keeps the 2026-10-12 promise, adds no third party to the laptop's path, which is the local-first story's point, and costs little against the server budget.

### Question 14: What is the server's monthly budget, and which instance type? (FR-021)

**Answered on 2026-11-09: A**, "Measure, then you set it (Recommended)". The plan measures and prices, and the Author sets the figure before the first apply. The response below, FR-023's, stands.

The response when the budget is crossed is FR-023's: EC2 stops until you restore it, and the laptop serves if you run it (ADR 0044, open item 5). Say so if you want a different response.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Measure, price, then set. The re-plan's first step measures the stack's memory without the model server, picks the smallest instance types that hold it with headroom, and prices them from AWS's published pages, for spot and for an 8-to-12-hour day. You set the figure from those prices before the first apply that creates EC2, and the budget exists before the instance (FR-022). | The figure rests on a measured stack and real prices. "About 8 GB" and "$50 a month" are the session's estimates, not measurements. Nothing that costs money is applied until you set it. |
| B | You set a figure now, and the re-plan picks the largest instance and running pattern that fit under it. | Quicker to plan, but the figure comes before anyone knows what the stack needs. |
| C | Reuse the September target, "≤ $10/month" (this folder's intent), for the server alone. | It was set for a VM running only the thin services. Whether a stack of about 8 GB fits under it is unknown until priced. |

Recommendation: A.

### Question 15: Spot, or a daily schedule, and which hours? (FR-069)

**Answered on 2026-11-09: A**, "Spot, around the clock (Recommended)". The schedule stays in reserve, and no hours are set (FR-069).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Spot, around the clock: a persistent spot request that stops on interruption, so EC2 comes back when capacity returns. The schedule stays in reserve: if a measured month passes the server budget, your patch adds one. | One mechanism, and the twin can answer at any hour. Interruptions cause gaps (question 17). |
| B | A daily schedule of 8 to 12 hours, at an on-demand price, in hours you set in UTC. Outside them, the laptop serves if you run it; otherwise visitors get the resting message, and the start function doesn't start EC2. | A predictable cost, but the twin rests 12 to 16 hours a day unless the laptop runs. The hours sit in a public repository, so set them from visitors' traffic on the dashboard. |
| C | Both: spot, and only inside the schedule's hours. | The lowest cost, with both kinds of gap. |

Recommendation: A. It is your first choice ("we will try to use spot instances"), and it keeps one way of starting and stopping EC2, so a schedule never fights the start function.

### Question 16: Which IAM do the start function and the laptop's stop use? (FR-070)

**Not asked. Taken provisionally on 2026-11-09: A**, by the session, as a default the plan carries. It is not the Author's answer, and he can overturn it when he reviews the plan. The session's reason: the option follows the constitution directly, since IAM changes are a human act and infrastructure is Terraform-only.

This is a human act: the constitution makes IAM changes the Author's.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | All in Terraform, human-only (FR-012). The start function's role may start only EC2's one instance, by its tag. The laptop's stop runs under a permission set of its own in IAM Identity Center, which may stop only that instance, taken through a short-lived SSO session at `make up ENV=prod`. You apply both; nothing changes IAM at run time. | Least privilege, recorded in plans and apply records. `make up` needs a live SSO session to stop EC2; without one it still starts and alerts (FR-064). |
| B | The laptop's existing Bedrock runtime identity also gets the stop permission. | One identity fewer, but a model-calling identity gains power over infrastructure. |
| C | You make both by hand in the console, recorded like an apply. | A named deviation from "Infrastructure exclusively via Terraform", as spec 000's hand-made runtime identity was. |

Recommendation: A.

### Question 17: When AWS reclaims the spot instance, what happens? (FR-071)

**Answered on 2026-11-09: A**, "Same gap, plus an alert (Recommended)" (FR-071, SC-018).

The laptop takes no inbound connection, so nothing can wake it from outside. A handover to the laptop is always your own start. This question doesn't arise if question 15's answer is B.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The same gap you accepted for EC2's start. The interruption notice alerts you on both channels. Visitors see the resting message until capacity returns and the persistent request starts EC2 again, or until you start the laptop. | Nothing new to run. The shared state loses nothing, since it lives off EC2. Gaps last as long as capacity is short. |
| B | An on-demand stand-in: the start function starts an on-demand instance from the same release, and hands back when spot returns. | Shorter gaps, at on-demand prices, with a second instance and its storage to keep in step. |
| C | Nothing beyond the persistent request, and no alert. | The simplest, but you learn of gaps only from the dashboard. |

Recommendation: A.

### Answered earlier

1. **The GitHub-side requirements and ADRs 0013 and 0014** (FR-014 to FR-016; SC-015). Answered on 2026-10-11: B. They moved to the publication spec, and spec 001 closes on local criteria (Clarifications; `publication-carryover.md`).
2. **Production's meter of record** (FR-017). Answered on 2026-10-12: D. Superseded on 2026-11-09 by the shared meter and EC2 as the default host.
3. **Infrastructure cost and the ceiling** (FR-020). Answered on 2026-10-12: A. Superseded on 2026-11-09: the server is outside the model ceilings.
4. **The public request cap** (FR-033). Answered on 2026-10-12: A. The relay enforces it.
5. **Is hello public in spec 001?** (FR-030 to FR-039). Answered on 2026-10-12: A. Yes, capped, as a test endpoint with spec 000's fixed prompt.
6. **The idle target** (FR-021; SC-002). Answered on 2026-10-12: A, "≤ $10/month". Superseded on 2026-11-09 by the server budget (question 14) and the running pattern (question 15).
7. **When neither the local tier nor the fallback can answer** (FR-036). Answered on 2026-10-12: A. Spec 000's degraded response and a notice on the site, now the room's fixed message.
8. **What an AWS-side breach does on its own** (FR-023). Answered on 2026-10-12: A. Re-read on 2026-11-09: Bedrock is revoked on both hosts, and the server budget gets its own action.
9. **Releases before publication** (FR-046, FR-048). Answered on 2026-10-12: A. The Author's terminal builds each release once, into a private registry in the account, and both deployers pull it by digest.
10. **The public view** (FR-057 to FR-059). Answered on 2026-10-12: A. Always the cloud-hosted snapshot, refreshed by the serving host.
11. **Where the tunnel ends** (FR-052). Answered on 2026-10-12: A, inside the account, on the cloud VM. Superseded in part on 2026-11-09: still inside the account, but on the tunnel end, since EC2 is stopped while the laptop serves (question 13).
12. **Who runs the real `terraform plan` before publication** (FR-005). Answered on 2026-10-12: A. The Author's terminal; agent sessions run offline checks.

### Kept for the plan, and how each was settled

These were the conflicts this spec couldn't settle on its own. The plan raised or settled each (plan.md, Questions for the Author), and the Author answered the first four of its questions on 2026-11-09.

1. **Whether `services/relay` runs on the tunnel end.** Answered: yes. The plan's question 1, "Relay picks the host (Recommended)". Applied throughout this spec. Its consequence, a relay on spot against the Cloud standard's "must be always-on", is the plan's question 8, open for T000.
2. **The two sentences the 1.1.0 patch left.** Answered: both added to the patch. The plan's question 3, "Add both (Recommended)".
3. **The laptop without a network.** Answered: offline demos run `ENV=dev`. The plan's question 4, "Use ENV=dev offline (Recommended)".
4. **The resting message's words.** Provisional, the session's default: a spec 002 follow-up, in words the Author writes (plan question 5).
5. **ADR 0044's outline numbering.** For the ADR's own branch; the table under Clarifications maps it.
6. **Spot behavior.** Settled in the plan: the guard stops EC2 again whatever AWS's restart does (FR-071). The tunnel end on spot is the Author's answer to the plan's question 2 (FR-076).
7. **The health check's credential.** Settled in the plan: the health path is status-only and unauthenticated, and admitted only from Route 53's checker ranges (FR-053), to confirm.
8. **Unconfirmed or default.**
   - The Anthropic account's spend limit is the Author's step (FR-073).
   - The 5-minute window stays the default, measured in the plan's group 9.
   - "It" is read as the laptop's stack, provisionally (plan question 6).
9. **The Author's own files:** his patches P-3 and P-4 (plan.md §14).
10. **Question 16's IAM:** provisional, with the guard's role and the start function's two reads (plan question 7; FR-070).
