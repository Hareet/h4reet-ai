# Implementation Plan: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Branch**: `spec/001-cloud-elevation` (this plan; the work runs on one feature branch per task group, [§16](#16-order-of-work-risks-and-proof)) | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Status**: **Approved by the Author on 2026-11-10** (tasks.md T000). His words, verbatim: "Let's approve the t000 and spec 001 plan. Let's have you build it out but not push or try anything in the cloud yet, i will do that in the morning, but you can have everything ready and verified by then. Use the latest dependenices adn versions for aws services, plugins" What his approval takes is recorded in spec.md's Clarifications (Session 2026-11-10), each a reading beside his words: this plan and its §13 amendments; questions 5 to 7, and the spec's question 16, at their provisional defaults, the session's answers, which his approval leaves standing; question 8 as option A, his wording in the 1.1.0 patch, being added on `docs/001-ec2-default`; and, as the session's reading, the default order with T001 first, the ADRs proposed until his merges, and T008's pins at the latest releases established on 2026-11-10. **One named deviation:** his words direct group 1 to be built now, before T001 (spec.md Assumptions, "The constitution first"). Nothing merges and nothing is applied before T001, and every group that touches `infra/` checks it first ([Constitution Check](#constitution-check)). Drafted on 2026-11-09 while he was away, at the main session's direction; it replaced the September plan (`plan.md` at 00309c47), and was revised the same day after `/speckit-analyze` over 8acc2686.

**Input**: spec.md as reworked and clarified on 2026-11-09 (commit b2ea2765), with no needs-clarification marker left. [ADR 0044](../../docs/adr/0044-ec2-as-prods-default-host.md), proposed, on branch `docs/001-ec2-default` (4fe34783). The constitution 1.0.1 in force, and the proposed 1.1.0 patch (`docs/merge-requests/2026-11-09-constitution-1.1.0.patch` on that branch). The September research, plan, data model, and contracts at 00309c47, where this plan carries something over.

**Companions**: [research.md](research.md) (each decision, why, and what else was weighed; the cost lines), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md) (the Author's validation runs), and the ADRs [§14](#14-the-authors-patches-steps-and-adrs) lists. Where this plan and a contract disagree on an interface detail, the contract is right and this plan is fixed.

**Conventions** (spec 000's, plus three):
- **The Author's terminal**: commands only the Author runs, outside Claude Code. Hooks refuse them to agents.
- **[A]** agent-editable, reviewed; **[H]** human-only; **[P]** delivered as a patch the Author applies.
- **The three hosts**: **the laptop** (the local tier), **EC2** (prod's default host), and **the tunnel end** (the small instance, run around the clock on spot, where the tunnel ends and the relay runs). Only the laptop and EC2 serve.

## Questions for the Author

Each was something this plan would otherwise have decided past his answers. Questions 1 to 4 were put to him on 2026-11-09, in the session, in the words quoted under each. His choice and the option's text are quoted as given. The options below them are as this plan first offered them, kept as the record. Questions 5 to 7 weren't asked: the session took each recommended option provisionally, as a default that the tasks carry, not his words, and his to overturn at T000. Question 8 came from the analysis of 2026-11-09, after his answers. T000 asked it, and his approval takes option A (spec.md Clarifications, Session 2026-11-10).

### Question 1: How does the edge reach whichever host serves?

**Answered on 2026-11-09.** Asked "Spec 001's plan: how should visitors reach whichever machine is serving (your laptop or EC2)?", he chose "Relay picks the host (Recommended)", which read: "The site's edge always talks to the tiny always-on relay (your tunnel's end). The relay checks both hosts every second and sends each request to the laptop if it's up, else EC2, else the resting reply. Switching takes seconds, and neither host needs a public certificate. Route 53's health check only wakes EC2. This changes the DNS-failover design you approved, so the spec's wording changes with your OK." Applied: §13's amendments are now in spec.md, whose Clarifications record that this answer supersedes the DNS-failover reading of point 1.

The spec moves visitors by DNS: failover records answer the dynamic origin's name with the laptop's path or EC2's (spec FR-054, FR-072; point 1). But CloudFront reaches a private origin only through a VPC origin, which is bound to one resource, not a name. So DNS can switch only between public origins, and those need TLS and a certificate on both hosts, a public certificate authority, and a secret header that tells this distribution from any other (research.md R-07).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | **The relay runs on the tunnel end**, the always-on instance you chose for the tunnel ("Tiny always-on relay", your question 13 option). CloudFront reaches it as its one VPC origin. The relay sends each request to the laptop while it is healthy, else to EC2, else answers the resting reply. Route 53's health check stays, and still fires the start function. | Visitors' requests stay inside AWS's network and the SSH tunnel. There is no secret in Terraform's state, no certificate, and no runtime DNS change. A host's failure is seen in about a second, not after a record's time to live. The public cap and a live status answer stay up while no host serves. The tunnel end is now in EC2's path too, so its outage rests the twin (question 2). One part of point 1 changes: the relay, not DNS, moves visitors. Spec amendments: [§13](#13-the-spec-amendments-question-1s-answer-needed-applied). |
| B | **The spec as written:** failover records for `api-origin.hareet.ai`, with the tunnel end's and EC2's public addresses. Each host serves TLS with a certificate for that name from a public authority, through a DNS challenge. A secret origin header, which you write into a CloudFront key-value store, admits only this distribution. | Point 1 holds as approved. But visitors' requests cross the internet between CloudFront and the host, inside TLS. There are more parts: two certificates, a third-party authority, Route 53 write access from both hosts, a key-value store, and a fixed public address on EC2. Handovers take the health check's detection time plus the record's time to live. The tunnel end stays out of EC2's path. |
| C | **CloudFront picks the origin:** a CloudFront Function reads which host serves from a key-value store that the handover writes, and selects one of two VPC origins. | Private, with no relay in EC2's path. But it rests on a function's origin selection, a feature to confirm, and the handover writes the store at run time. |

Recommendation: A. It keeps September's private path, has the fewest parts, and moves visitors fastest. The title of the option you chose for the tunnel already names it. If B or C: §4, §7, §8, §12, and §13 change, with research.md R-07, R-18, and R-31, data-model.md §3 and §6.1, and the relay, edge, and handover contracts.

### Question 2: The tunnel end: on demand, or spot?

**Answered on 2026-11-09.** Asked "Spec 001's plan: the tiny always-on instance where your laptop's tunnel ends (and, with the relay option, every request passes through). On demand or spot?", he chose "Spot", which read: "About $2.20 a month (October's figure). AWS can take it back, and while it's gone the site rests, even if the laptop or EC2 is up." That wasn't this plan's recommendation; [What the answers change](#what-the-answers-change-in-this-plan) says how the plan carries it.

Your question 13 option priced it as a spot instance: "about $2.20 a month for a t4g.micro spot instance plus $3.65 for its address". With question 1's option A, every dynamic request passes through it, so a spot interruption rests the twin even while EC2 runs.

| Option | Answer | Implications |
|---|---|---|
| A (recommended, with question 1's A) | On demand. | Interruptions stop. The September research put an on-demand `t4g.micro` at $0.0084 an hour, $6.13 a month (research.md R-04, read 2026-10-18, to confirm), against about $2.20 on spot. |
| B (recommended, with question 1's B) | Spot, as your option priced it. | An interruption takes only the laptop's path away; EC2 then starts. |

### Question 3: Should the 1.1.0 patch amend two more sentences before you apply it?

**Answered on 2026-11-09.** Asked to add both sentences to the 1.1.0 amendment before he applies it, he chose "Add both (Recommended)", which read: "The patch gains two small wording changes: Langfuse self-hosted in the stack, and Bedrock called from the serving host. Still 1.1.0. The ADR's old → new list grows to match." Applied: the Constitution Check no longer lists either as a deviation. Both are covered by the amended patch on `docs/001-ec2-default`.

Two sentences the patch leaves strain this design (Constitution Check):
- the Observability standard's "Langfuse, self-hosted on the local tier", while EC2 runs its own Langfuse;
- the Cloud standard's always-on list, which names "the Bedrock fallback path", while Bedrock is called only from a host that serves.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Amend both in the patch. For example: "Langfuse, self-hosted on each host that runs production", and "the Bedrock path of whichever host serves". The words are yours. | No deviation remains. The ADR 0044 branch's patch file changes before you apply it. |
| B | Leave them. This plan records a deviation for each in Complexity Tracking. | One permanent deviation, which the Governance section says needs an ADR. |

### Question 4: The laptop without a network

**Answered on 2026-11-09.** Asked "…How should offline demos work?", he chose "Use ENV=dev offline (Recommended)", which read: "Prod needs the network. For an offline demo you run the dev stack, which keeps its own local counter." Applied: the laptop's runbook says so (§11), and the spec's Assumptions record it as decided.

The shared state is in the cloud, and unknown state is degraded. So prod on a laptop with no network answers degraded, local answers included. Principle I's "runnable on it, calling local models, with one command" then holds only with a network (spec Assumptions).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Accept it. An offline showing runs `make up ENV=dev`, whose meter is local and spends nothing. | No new rule. The runbook says so. |
| B | An offline mode for prod: while both the shared state and the tunnel are unreachable, prod answers from the local model only, with no paid route, so nothing can spend. | Local answers keep working offline. But it departs from CLAUDE.md's "unknown state = degraded" and spec FR-019, which needs an ADR, and a ceiling tripped elsewhere wouldn't reach the laptop until it reconnects. |

### Question 5: The resting message's words

**Not asked; taken provisionally on 2026-11-09** as the session's default, not his words: option A. The words become a follow-up in spec 002's lifecycle, in words he writes (P-5).

The room shows `cannot_talk.resting` while no host serves. Its words, "The twin can't talk right now. The local tier, the computer it runs on, is resting.", name the laptop, though in a start-up gap EC2 is the host that is away.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | A follow-up through spec 002's lifecycle, with words you write that name no host. | Spec 002's content changes by your approval, as ADR 0034 requires. |
| B | Keep the words. | Visitors read "the local tier" while EC2 is starting. |

### Question 6: Confirm the reading of "it"

**Not asked; taken provisionally on 2026-11-09** as the session's default, not his words: option A. "It" means the laptop's stack.

You wrote "it should be the local-first primary scenario we built for". The spec reads "it" as the laptop's stack (spec Clarifications; ADR 0044 open item 9).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Yes: the laptop's stack. | Nothing changes. |
| B | It also means EC2 should be local-first. | EC2 would need a model before the Anthropic API, which your recorded reason under Principle I rules out ("within the server budget EC2 has no GPU, and a model run on its CPU wouldn't meet the twin's quality bar"). |

### Question 7: Confirm the provisional IAM, with its additions

**Not asked; taken provisionally on 2026-11-09** as the session's default, not his words: option A. That is question 16's default, the guard's stop-only role, and the start function's read of the health check. Five additions came after: the start function's read of the tunnel end's state, which question 2's answer brings ([What the answers change](#what-the-answers-change-in-this-plan)); the guard's read of the server action's status, so it also stops EC2 while that action has run (the analysis's H5); `h4-laptop-bedrock`, an ordinary role the laptop's permission set assumes, so the budget action's deny never attaches to a role Identity Center manages (H8; to confirm in group 4); the tunnel end's reads of AWS's state for the dashboard (the autostart switch, the health check's status, the server action's status, and the functions' outcome counts; §11), all reads; and the tunnel end's `sns:Publish` on `h4-alerts`, for its deployer's alerts (M1). He confirms or overturns all of it at T000.

Question 16 wasn't asked; the session took its recommended option as a default (spec FR-070): "all in Terraform, human-only. The start function's role may start only the one tagged instance; the laptop's stop uses its own permission set, which may stop only that instance, through a short-lived SSO session." This plan adds two identities in the same shape (research.md R-15, R-30):
- `h4-ec2-guard-fn`, which may stop only that instance. It stops EC2 when AWS restarts it on its own while the laptop serves, the autostart switch is `off`, or the server budget's action has run (spec FR-071).
- The start function reads the health check's status, so that `make ec2-start` can't start EC2 while the laptop serves.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Confirm the default and the additions. | As planned. |
| B | Change them. | Research R-15's table and the handover contract change. |

### Question 8: The relay on spot, against the Cloud standard (answered at T000: option A)

**Answered at T000, 2026-11-10,** by his approval of this plan, which takes option A, the recommendation: his wording for the relay on spot goes into the still-unapplied 1.1.0 patch, and is being added on `docs/001-ec2-default`. The words are his, in that patch. T001 applies it.

The relay runs on the tunnel end (question 1), and the tunnel end runs on spot (question 2), so AWS can take the relay away for a while. The Cloud standard, in force and as amended on `docs/001-ec2-default`, lists "the thin API/relay" among what "must be always-on". Neither answer said how to square that, and this plan doesn't decide it.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Add your wording to the 1.1.0 patch, which you haven't applied yet. For example, the relay "on spot capacity where the Author accepts the gap (ADR 0044)". The words are yours. | No deviation. The patch's old → new list, and ADR 0044's, grow by one line. T001 applies the patch with it. |
| B | Keep the standard's words, and name a deviation in spec.md's Assumptions, citing ADR 0044. | A standing deviation, which the constitution's Governance says needs an ADR; ADR 0044 is it. |

Meanwhile, the plan and the spec say "around the clock, on spot" for the tunnel end, never "always-on".

### What the answers change in this plan

**The tunnel end on spot** (question 2). Every dynamic request passes through it (question 1), so AWS taking it back rests the twin on both hosts. The plan carries it this way:
- **The instance:** a persistent spot request with `instance_interruption_behavior = "stop"`, as EC2's (research.md R-30). Its root volume and its Elastic IP's association stay while it is stopped (the address's association across a stop is to confirm). The policy's rule T11 covers both instances (contracts/infra-records.md §3).
- **The warning:** an EventBridge rule on "EC2 Spot Instance Interruption Warning" for the tunnel end publishes `tunnel_end_interruption` to `h4-alerts` (contracts/aws-alerts.md §2).
- **While it is gone:**
  - CloudFront can't reach the relay, so its error responses answer `no_host_serving` from the site's bucket;
  - the static site keeps loading from the edge, and the room shows its resting message (spec FR-066);
  - the probe's status check fails, and alerts after 5 minutes;
  - Route 53's check fails too, but `h4-ec2-start` refuses with `tunnel_end_down`, so EC2 isn't started for a path no visitor can reach. If EC2 was already serving, it keeps running, and its hours show on the dashboard.
- **How it comes back:**
  1. AWS starts it again when capacity returns.
  2. systemd starts Docker and the deployer, and compose starts `tunnel-end`, the relay, the sink, and the collector.
  3. The laptop's `tunnel` reconnects within its backoff (at most 30 s between tries).
  4. The relay's checks find whichever host is up.
  5. A rule on the tunnel end entering `running` invokes `h4-ec2-start` once, which starts EC2 if the laptop isn't serving. The health check's alarm stays in alarm through the outage, so it wouldn't change again.
  6. `tunnel_end_back` is alerted.

  The start function's run in step 5 can come before the laptop's tunnel is back, and Route 53's check still reports the outage then, so it can start EC2 while the laptop is about to serve. This plan accepts that rather than delaying the run: once the relay serves the laptop, the laptop's loop stops EC2 within the handover window (FR-063), as after any handover, and SC-016 counts those minutes.
  - **The public view while it is gone:** the sink is gone too, so `latest.json` keeps its last serving host. `/status/` reads the edge's degraded answer to `/api/status` (`no_host_serving`, `stack` null), or no answer at all, as `none`, and shows the document's values as last-known, with their times (spec FR-057; contracts/public-view.md §3).

  The relay's in-memory caps restart empty, which is acceptable for a per-address cap of at most a day (FR-042).
- **The IAM:** the start function also reads the tunnel end's state, `ec2:DescribeInstances` on its tag. That is a read, in question 7's shape (research.md R-15).
- **The cost:** research.md R-05's spot line, about $2.20 a month (read 2026-10-18, to confirm), with the Elastic IP at $3.65 (September R-05, to confirm).
- **Where else it shows:** §12's degraded paths, §16's risks, and Complexity Tracking; spec.md's Degraded Modes, its edge cases, and FR-076.

**The two sentences added to the 1.1.0 patch** (question 3): the Constitution Check below has no Observability deviation and no "Bedrock fallback path" reading. P-2 is the patch as amended on `docs/001-ec2-default`.

**Offline demos** (question 4): the laptop's runbook says that prod needs the network, and an offline demo runs `make up ENV=dev`.

### Settled in this plan, with the reason

These were open before planning. Each is settled here, inside the Author's answers.

| Item | Settled as | Why |
|---|---|---|
| Where the shared meter and kill switch live | RDS for PostgreSQL 17, single instance, private; both hosts use spec 000's schema as it is (research.md R-20) | It runs whether or not a host does, and it runs the meter's transactions and tests unchanged. Its cost is a line the Author prices before he sets the figure. DynamoDB is the fallback if that price is out of proportion. |
| What the health check probes | The laptop's health block, at the tunnel end's public address, through the tunnel (research.md R-29) | His question 13 option: "the health check sees the whole path". |
| Credentials on the health path | None: Route 53's checkers can't send one (to confirm). The health block answers only 200 or 503, and the tunnel end admits that port only from Route 53's checker addresses (research.md R-12) | Spec FR-053's conditional. |
| AWS restarting EC2 on its own | The guard stops it again, whatever AWS's restart does (research.md R-30) | Spec FR-071, without relying on AWS's exact behavior. |
| The 5-minute handover window | Kept as the spec's default; group 9 measures it | Spec FR-063, SC-016. |
| The Anthropic account's spend limit | The Author's step, in his account ([§14](#14-the-authors-patches-steps-and-adrs)) | Spec FR-073; no agent sees the account. |
| His files: the intents' lines, CLAUDE.md's lines | His patches, drafted in [§14](#14-the-authors-patches-steps-and-adrs) | They change only by his hand. |
| ADR 0044 cites spec 001 by the outline's numbers | For the ADR's branch to correct; the spec's table under Clarifications maps them | The ADR is outside this folder. |
| September's interview questions | Q1 is obsolete. Q2 is question 1 here. Q3 was answered (spec questions 14, 15). Q4 is settled by the spec: Route 53. Q5: the apply record arrives on an `ops/apply-*` branch. Q6: both hosts' Bedrock identities come under Terraform (spec FR-013). Q7: the laptop takes releases from the Author's own release directory. Q8: no breaker. Q9: research.md R-19 and R-25. | Research R-13, R-15, R-17, R-06. |

## Summary

Spec 001 puts prod on EC2 by default, with the laptop serving local-first when the Author runs it, one host at a time. One AWS account in us-east-1 holds:
- **the safety net, applied first:** budgets on Bedrock's cost at the $5 and $20 ceilings, and the server budget at the Author's figure. An anomaly monitor watches the account. Two automatic actions: one revokes Bedrock on both hosts, the other stops EC2.
- **the shared state:** RDS for PostgreSQL with spec 000's meter and kill switch, which both hosts' gateways use with `H4_STACK=prod`;
- **the tunnel end:** a small instance, run around the clock on spot, so AWS can take it back (question 2), with OpenSSH's server for the laptop's outbound tunnel, and the relay that CloudFront reaches privately and that picks the serving host (question 1);
- **EC2:** a spot instance that stops on interruption, running the very same compose file without the model server, with the Anthropic API first and Bedrock second;
- **the handover:** a Route 53 health check through the tunnel end, whose alarm fires `h4-ec2-start`; `h4-ec2-guard`; the laptop's `h4-handover` loop, which stops EC2 once the laptop serves; and the autostart switch (`on` lets EC2 start automatically);
- **the edge:** CloudFront serving spec 002's site from S3 over TLS for hareet.ai, with the zone in Route 53.

Technical approach, by area:
- **Infrastructure** ([§1](#1-infrastructure-the-roots-the-state-and-the-records)): September's three Terraform roots, plan-in-note, recorded terminal apply, and offline checks, with the new resources added to the protected files.
- **Guards first** ([§2](#2-the-guard-patch-before-any-infra-file)): one patch before any `infra/` file.
- **Cost** ([§3](#3-cost-the-budgets-the-actions-and-the-shared-meter)): the budgets, the two actions and their rehearsals, the shared meter, and a route per host that keeps EC2's calls out of the laptop's sub-budget.
- **The tunnel end** ([§4](#4-the-tunnel-end-the-tunnel-the-relay-and-the-sink)): the tunnel, the relay, the snapshot sink, and a small collector.
- **The hosts** ([§5](#5-the-hosts-ec2-and-the-laptop)): EC2's instance, network, storage, and identities; the laptop's changes.
- **Routing** ([§6](#6-routing-per-host-fr-035-fr-067-fr-068-researchmd-r-27-r-28)): `H4_HOST`, schema 2, and rule R1 amended.
- **The handover** ([§7](#7-the-handover-fr-063-to-fr-066-fr-069-to-fr-072-fr-074-researchmd-r-29-to-r-32)): the sequence, the windows, the functions, and the operator's commands.
- **Visitors** ([§8](#8-the-edge-the-site-and-the-disclosure)): the edge, the site, the disclosure's rows, and the public view.

## Technical Context

**Language/Version**:
- **TypeScript on Node 24 LTS**, at spec 000's pins, for `services/relay` (new) and the gateway's changes.
- **Python 3.12, stdlib only**, for the host scripts (the deployer, the egress proxy, the credential timer, the handover loop, the snapshot publisher and sink), the Lambda functions, and the gates' new checks. `python-hcl2` stays the one pinned, hashed addition (September).
- **HCL for Terraform**, with Terraform and `hashicorp/aws` pinned in the first infra task from the Author's terminal.
- **Bash**, nginx and OpenSSH configuration, and SQL for migration 0007.

**Primary Dependencies**:
- **The relay:** Fastify, `pg`, zod, and pino at the gateway's pinned versions, in one lockfile.
- **The AWS CLI v2** at the devcontainer's pin, and the Session Manager plugin, in the Author's terminal and on the hosts.
- **OpenSSH** from Alpine, pinned by the base image's digest.
- **The RDS certificate bundle,** pinned by SHA-256 into the gateway's and the relay's images.
- **New images,** pinned by index digest in `deploy/images.lock`: `relay`, `tunnel` (both ends), `snapshot`, and the Lambda images on AWS's Python 3.12 Lambda base.

**Storage**:
- **RDS for PostgreSQL 17:** the shared state (data-model.md §1).
- **S3:** Terraform's state, the site and the public view, and the releases.
- **ECR:** one repository per service, with the upstream images copied by digest.
- **EBS:** EC2's root and data volumes, kept while it is stopped; the tunnel end's root.
- **Parameter Store:** the secrets the Author writes (research.md R-26), and the autostart switch.
- **The laptop:** spec 000's stores, with prod's meter moved out; `~/.config/h4reet-ai/{infra,tunnel,release}`, denied to agents.
- **Memory only:** the relay's per-address caps and host health.

**Testing**:
- **vitest:** the relay's contract suite; the gateway's route per host, `H4_HOST`, and R1; and the two-gateways test on one store.
- **pytest:** the host scripts, the Lambda functions (stub EC2, Budgets, and SSM), the deployer, and the gates' checks.
- **The matrix:** FR-006, FR-011, FR-012, and R-32's targets.
- **`make breach-test ENV=dev-cpu`:** grows the relay's side (FR-025), with the relay in a `dev-relay` profile.
- **Offline Terraform checks** against the Author's provider mirror.
- **The Author's runs** in [quickstart.md](quickstart.md), against real AWS.

**Target Platform**:
- **The laptop:** spec 000's host, unchanged.
- **EC2:** Amazon Linux 2023. The type is the smallest that holds the measured stack, Graviton if every image has an arm64 build (research.md R-04, R-33). Spot, persistent, stopping on interruption.
- **The tunnel end:** `t4g.micro`, Amazon Linux 2023, spot, persistent, stopping on interruption (question 2).
- **RDS:** PostgreSQL 17, the smallest Graviton class, single-AZ.
- **CloudFront** with S3, and a VPC origin to the tunnel end. **Lambda:** container images on arm64.

**Project Type**: an extension of spec 000's multi-service system. It adds one web service (the relay), infrastructure as code, host services, and Lambda functions.

**Performance Goals**:
- **Hello and the site:** within 5 s with the laptop off and EC2 serving. In a window with no host, the degraded body within 5 s (SC-001).
- **Kill-switch changes** reach the relay within 10 s (SC-008); the relay reads the shared state on every request.
- **The relay's host choice:** a host is unhealthy after one failed check, a second apart, and healthy after three passes (research.md R-18).
- **The handover window:** EC2 stopped within 5 minutes of the relay sending to the laptop (FR-063, SC-007, SC-016).
- **The public view:** at most 5 minutes old while a host serves (SC-013).

**Constraints**:
- **Model spend:** $5 a day and $20 a month on the shared meter, both hosts together (SC-003).
- **Server spend:** at or under the Author's figure (SC-002), with nothing applied before he sets it.
- **Credentials:** none long-lived. The laptop holds short-lived SSO sessions only.
- **The laptop** takes no inbound connection (SC-006).
- **Visitor data:** none stored, no cookie (SC-010, SC-011).
- **Agents** plan offline only, and never apply.

**Scale/Scope**: a portfolio's traffic. Three Terraform roots, three hosts, one database. One new TypeScript service, about eight Python host scripts and tools, five Lambda functions, and two OpenSSH images.

**Dependencies on other specs**:
- **Spec 000:** its success criteria pass before work starts (spec Assumptions). Its FR-030, FR-031, rule R1, environment contract, and operator actions are amended by name, in group 6's branch ([§13](#13-the-spec-amendments-question-1s-answer-needed-applied)).
- **Spec 010:** on `main`. Its price is confirmed: the Author's commit ada55c98 on `main`, 2026-11-09, `config/prices.yaml` version 2026-11-09.1 ("read 2026-11-09"). Its cap is $20. The Author adopted his words for row F3 on 2026-11-09, with his weighing: "We can say nothing is retained when running local models. Refer to Anthropic if cloud models are on." They are on `feat/010-anthropic-switch`, quoted in its note, and that branch, which also makes the Anthropic API prod's fallback, reaches `main` before group 6.
- **Spec 002:** its room-conversation contract §3 gains `no_host_serving`.
- **Spec 007:** its readiness evidence covers both hosts' adapters.

## Constitution Check

*GATE: checked before research and again after design ([below](#constitution-check-post-design)).* Against 1.0.1, in force, and the proposed 1.1.0. A deviation from 1.0.1 that 1.1.0 removes is a dependency: no infrastructure task starts until the Author applies 1.1.0. Tasks.md puts his patch first, as T001, before any group, and makes its check a precondition of every group that touches `infra/` (groups 3 to 9).

| Principle or standard | Under 1.0.1 | Under 1.1.0 as proposed | This plan |
|---|---|---|---|
| I. Data-local by default | Prefer self-hosted inference "where it meets the quality bar" | unchanged | **Complies**, with the Author's recorded reason for EC2 (spec Clarifications). Every new flow is a disclosure row before it happens ([§8](#8-the-edge-the-site-and-the-disclosure)). No cookies, no stored address. The laptop runs the whole topology with one command (FR-045). Prod needs the network, and offline demos run `ENV=dev`: the Author's answer to question 4. |
| II. Production-grade | — | — | **Complies**: tests per contract, red-team on all four adapters, telemetry and panels, a cost estimate (priced by the Author before apply) and its measurement, runbooks, ADRs. |
| III. Intent → spec → code | — | — | **Complies**, with the local-phase deviation (ADR 0013). The plan waits on approval (T000). The spec amendments of [§13](#13-the-spec-amendments-question-1s-answer-needed-applied) follow his answer to question 1 and are in spec.md. |
| IV. Least privilege | — | — | **Complies**. Agents can't apply; every new target is refused to them. Each role is scoped to one instance, one key, or one action (research.md R-15). Nothing changes IAM at run time. The laptop takes no inbound connection. The tunnel end permits only the listed forwards. EC2 admits only the tunnel end. Every deny lands before its risk ([§2](#2-the-guard-patch-before-any-infra-file)). |
| V. Cost | "the local tier exists so the cloud bill stays near zero" | "so the model spend stays near zero", with the server's budget separate | **Deviation from 1.0.1, removed by 1.1.0.** The meter is the control on both hosts. The two budgets and their two actions come first and are rehearsed. |
| VI. Build in public | — | — | **Complies**, with ADR 0013's recorded deviation (private until publication). |
| VII. Whole product | — | — | **Complies**: the site states nothing outside the corpus. The trade, every turn paid on EC2 and free on the laptop, is on the dashboard. |
| VIII. Honest AI | — | — | **Complies**: red-team cases on every adapter that can answer, before public (FR-039). |
| Cloud standard | "The cloud hosts only what must be always-on and cheap" | "may also host the production stack on one VM, without the local model server, as the default production host"; the always-on list keeps "the thin API/relay", and, as amended for question 3, names Bedrock called from the serving host | **Deviation from 1.0.1, removed by 1.1.0** as amended on `docs/001-ec2-default`. **Question 8, answered at T000 with option A:** the relay runs around the clock on spot, so it has gaps where the standard, in force and as amended, lists it among what "must be always-on"; his wording for it goes into the 1.1.0 patch, so no deviation remains once T001 applies it. Terraform for everything, with one named exception: secrets (research.md R-26). |
| Compute standard | — | — | **Complies**: one compose file on three hosts, with only the env file differing; the same images by digest. Image variants carried (ADR 0015). |
| Local tier standard | "via the cloud fallback within its sub-budget" | "via the cloud host and its paid routes within the ceilings and adapter caps" | **Deviation from 1.0.1, removed by 1.1.0.** "Exposed only through an outbound tunnel" holds. |
| Model access standard | "local-first with Bedrock as fallback inside a capped sub-budget" | per host: local-first on the laptop; the Anthropic API first on EC2 | **Deviation from 1.0.1, removed by 1.1.0.** One gateway, routes as configuration ([§6](#6-routing-per-host-fr-035-fr-067-fr-068-researchmd-r-27-r-28)). |
| Observability standard | "Langfuse, self-hosted on the local tier" | as amended for question 3: Langfuse self-hosted in the stack | **Deviation from 1.0.1, removed by 1.1.0** as amended on `docs/001-ec2-default`: EC2's stack runs its own Langfuse. |
| Alerting standard | — | — | **Complies**: Telegram first, email second, never SMS; degradation never waits on delivery. |
| Security & Agent Governance | — | — | **Complies**: IAM, budgets, alert routing, edge limits, the kill switch, the failover, the start function, and the autostart switch are the Author's. Agents plan only. |
| Secrets and supply chain | — | — | **Complies**, with ADR 0014's carried deviation (the CI-side controls wait for publication). Secrets stay outside Terraform (a named exception to spec FR-001). |
| Development Workflow step 6 | — | — | **Complies**: built once, pulled by digest, rollback in one command. Building in CI waits for publication (ADR 0014). |

Gate result: **PASS, conditional on the 1.1.0 patch** before any infrastructure task. Every remaining deviation is named in [Complexity Tracking](#complexity-tracking).

## Project Structure

### Documentation (this feature)

```text
specs/001-cloud-elevation/
├── intent.md                  # the accepted intent (the Author's; its cost lines superseded by his later words)
├── spec.md                    # reworked and clarified 2026-11-09
├── publication-carryover.md   # FR-014 to FR-016 and SC-015, moved word for word
├── plan.md                    # this file
├── research.md                # decisions, why, alternatives; the cost lines
├── data-model.md              # the shared state, migration 0007, the route per host, the records, the state machines
├── quickstart.md              # the Author's validation runs, per group
├── contracts/
│   ├── relay-http.md          # the relay: listeners, routes, host choice, causes, headers
│   ├── tunnel.md              # the forwards, sshd's rules, the hosts' relay, telemetry, and health blocks, keys
│   ├── edge.md                # CloudFront, the VPC origin, error responses, DNS, the certificate, the CSP
│   ├── shared-state.md        # RDS, roles, connections, TLS, the move, two writers, unknown is degraded
│   ├── handover.md            # the health check, the alarm, the start function, the guard, the autostart switch, the loop, the commands
│   ├── env-cloud.md           # the env keys per host, H4_HOST, profiles, routing schema 2, preflight
│   ├── releases-deployer.md   # release.json, three deployers, holds, rollback
│   ├── infra-records.md       # the plan block, infra-verify, the apply record, the policy, the audit
│   ├── aws-alerts.md          # the topic, the bridge, the probe, the budgets and their two actions, spot and start alerts
│   └── public-view.md         # the snapshot document, the publishers, the sink, the page
├── checklists/requirements.md
└── tasks.md                   # T000 to T149 in eleven groups, revised after /speckit-analyze (the September one is superseded)
```

### Source Code (repository root)

```text
infra/                              [A] new, except the protected files [P]
  README.md
  bootstrap/  main, variables, versions .tf; budgets.tf [P]; alerts.tf [P]; .terraform.lock.hcl
  account/    main.tf; killswitch.tf [P]; handover.tf [P]; iam.tf [P]; alerts.tf [P], with the probe's and the audit's
              EventBridge schedules (rule T5); lambdas.tf (the functions only); registry.tf
  prod/       edge-limits.tf [P]: CloudFront's policies (rule T5)
  prod/       main, network, tunnel-end, ec2, rds, edge, dns, site, ssm .tf; ec2-market.tf [P]; failover.tf [P]; iam.tf [P]
  modules/    lambda-image/, tagged-bucket/
  lambdas/    alert_bridge/, probe/, credential_audit/, ec2_start/, ec2_guard/   (stdlib Python, Dockerfile, tests)
  policy/     [P] the policy's rules and fixtures
services/relay/                     [A] new: the relay, a second npm workspace
services/gateway/                   [A] changed: H4_HOST; routes per host (schema 2, R1, A1); GATEWAY_DB_URL with TLS;
                                        migrations/0007_hosts.sql; host on ledger and audit rows
config/routing.yaml                 [A] changed: schema 2, a route per host (research.md R-27)
deploy/
  compose.yaml                      [A] changed: relay, tunnel, tunnel-end, snapshot-publisher, snapshot-sink;
                                        profiles tunnel-end, tunnel, dev-relay; ec2's literal bindings
  env.example/{ec2,tunnel-end}.env.example        [A] new
  edge/nginx.conf                   [A] changed: the relay block 8085, the telemetry block 8086, the health block 8087
  tunnel/                           [A] new: Dockerfile, ssh_config, sshd_config, entrypoint
  otel/collector-tunnel-end.yaml    [A] new
  hosts/                            [A] new: cloud-init for EC2 and the tunnel end, systemd units, nftables, daemon.json
  scripts/deployer.py, release.py, egress_proxy.py, write_env.py, handover.py, snapshot_{publisher,sink}.py   [A] new
  scripts/preflight.py              [A] changed: H4_HOST, the ec2 and tunnel-end classes, TLS to the shared state
scripts/operator.py                 [A] changed: ENV=shared, through prod's admin listener or the admin-only stack; operator-restore
apps/web/                           [A] changed: the status page, the disclosure page's new rows
tools/gates/                        [P] infra_policy.py, infra_redact.py, infra_plan_note.py, disclosure_check.py,
                                        compose_policy.py's host rules, and their tests
redteam/                            [A] forbidden-actions.sh rows; hello and twin cases on the paid adapters (FR-039)
evals/visitor_scan.py               [A] new: SC-011 over every store, the shared state included
docs/data-flow-disclosure.md        [A] the changed and new rows (§8)
docs/infra/applies/                 [A] apply records
docs/runbooks/                      [A] the hosts, the handover, and one per new alert (§11)
docs/adr/                           [A] in group 1, proposed; accepted when he merges it (§14)
.claude/**, CLAUDE.md               [P] the guard patch (§2)
.devcontainer/toolchain.vars        [A] Terraform's and the AWS CLI's pins, travelling with the patch
```

**Structure Decision**: September's, carried. The relay is a second npm workspace. Terraform has one root per lifecycle. The Lambda functions live with the Terraform that deploys them. Host services are stdlib Python in `deploy/scripts/`, outside compose, because they need the Docker socket, the firewall, or an instance role (spec 000 refuses `docker.sock` in any service).

## Phases

- **Phase 0, research:** done; [research.md](research.md). No needs-clarification item remains in this Technical Context. What stays open is the Author's to answer (the questions above), or measured in a named task (research.md R-33's memory and architectures, R-08's error-page header, and R-29's checker addresses).
- **Phase 1, design:** done; [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md). The agent context file isn't updated: CLAUDE.md is the Author's, and its changes are in his guard patch (§2).
- **Phase 2, tasks:** done; [tasks.md](tasks.md), written after his answers and revised after `/speckit-analyze`. The task groups are in [§16](#16-order-of-work-risks-and-proof).

---

## 1. Infrastructure: the roots, the state, and the records

As September §1 (research.md R-02, R-03, R-13, R-14):
- **Three roots,** each with its own state key. What each holds is in research.md R-02.
- **The plan in the note:** `make plan ROOT=<root>` in the Author's terminal runs the policy on the HCL before `init`, then prints a redacted block tied to `HEAD:infra`'s tree hash. The gate's `infra-plan-note` step checks it.
- **The apply:** `make infra-verify`, then the Author's `terraform -chdir=infra/<root> apply <saved plan>`, then `make infra-record`. There is no `make apply`.
- **The offline checks:** `make infra-check` against the Author's provider mirror; the policy's rules grow with FR-012's longer list (research.md R-14).
- **Credentials and secrets:** as September §1.4. The Author's administrator session in his terminal; workload roles only; no CI identity. Secrets are the Author's, outside Terraform (research.md R-26).
- **Tags:** `project`, `environment` (`prod` or `account`), and `component` on every resource (FR-002).

## 2. The guard patch, before any infra file

The rule from spec 000's plan §15: a deny lands in a patch applied before the risk it guards. Group 1 is the patch; nothing under `infra/` exists until the Author has applied it.

**`docs/merge-requests/<date>-feat-001-guards.patch`** (P-1):
- **`.claude/hooks/bash-gate.sh`:** September R-16's Terraform rules, and the Author-only targets of research.md R-32 and R-16.
- **`.claude/settings.json`:**
  - `denyRead`, `denyWrite`, `Read(...)`, and `Edit(...)` on `*.tfstate*`, `*.tfplan`, and `*.tfvars*`;
  - `credentials.envVars` gains `TF_VAR_*`, `AWS_*`, `TF_CLI_ARGS*`, `GATEWAY_DB_URL`, the relay's host tokens (`RELAY_TOKEN_*`), the sink's token (`SNAPSHOT_SINK_TOKEN`), the telemetry block's token (`TELEMETRY_BLOCK_TOKEN`), and the shared state's role passwords (`DB_*_PASSWORD`);
  - `~/.config/h4reet-ai/{infra,tunnel,release}` get their own matrix rows; spec 000's deny already covers them.
- **`.claude/hooks/protected-paths.sh`:** `infra/**/{iam,budgets,alerts,killswitch,handover,failover,ec2-market,edge-limits}*.tf` and `infra/policy/**`.
- **`tools/gates/`:** the policy, redaction, plan-note, and disclosure checks, the compose policy's host rules, and the gate's new steps.
- **`redteam/forbidden-actions.sh`:** a stage H row per spelling, with a gap row for any that gets through.
- **`CLAUDE.md`:** three sentences, in [§14](#14-the-authors-patches-steps-and-adrs).
- **`.devcontainer/toolchain.vars`:** the Terraform and AWS CLI pins.

## 3. Cost: the budgets, the actions, and the shared meter

### 3.1 The budgets (FR-021, FR-022; research.md R-22)

Applied first, in `infra/bootstrap/budgets.tf`:
- **`h4-model-month` and `h4-model-day`:** $20 and $5 on Bedrock's cost, with warnings at 70% ($14, $3.50) and alerts at 100%.
- **`h4-server-month`:** the Author's figure, on every cost but Bedrock's, with a warning at 70% and an alert at 100%.
- **The anomaly monitor,** with an immediate subscription to `h4-alerts`.

The Author sets the server budget's figure before this first apply: the state bucket itself is a resource the server budget covers (spec FR-021). It comes from group 2's measurement and his own pricing.

### 3.2 The two actions, and their rehearsals (FR-023, FR-026)

In `infra/account/killswitch.tf` (protected):
- **On `h4-model-month` at 100%:** attach `h4-deny-paid-models` to EC2's gateway role, `h4-prod-gateway`, and to `h4-laptop-bedrock`, an ordinary role that the laptop's permission set assumes. Never to a role Identity Center makes for a permission set, which Identity Center manages itself. The rehearsal's target, `h4-rehearsal-target`, is an ordinary role of the same shape. Both are to confirm in group 4 (research.md R-22, R-15).
- **On `h4-server-month` at 100%:** run `AWS-StopEC2Instance` on the tagged instance (to confirm the action type's form). The start function refuses while it is executed.
- **Rehearsals:** while `rehearsal = true`, two $0.01 budgets with the same actions, against a rehearsal role and a rehearsal instance. The Author starts the rehearsal instance before the trip, since stopping a stopped instance proves nothing, and the record keeps the SSM run's status. The record says when AWS evaluated, when each channel got the alert, and when each action took effect (SC-009). Then `rehearsal = false`.

The Author reverses either action after the seven-day incident note: `make server-budget-restore`, or the runbook's reverse command for the model action.

### 3.3 The shared meter (FR-017 to FR-020; research.md R-20; data-model.md §1)

- **RDS for PostgreSQL 17,** private, TLS-only, with deletion protection and 7 days of backups. Its master password is managed by RDS in Secrets Manager.
- **Both production gateways** connect as `gateway` with `H4_STACK=prod`, so they share the one `stack_state` row and the one set of meters.
- **Migration 0007** adds `host` to ledger and audit rows, and `handover_events`, `relay_ro`, `relay_rw`, and `v_handovers`.
- **Two writers:** the existing advisory locks and `SKIP LOCKED` hold; a new test proves admission and the rollover sweep with two gateways ([§10](#10-tests-and-proofs)).
- **Unknown is degraded** on each host and in the relay.
- **The move** follows data-model.md §1.5: nothing starts at zero.
- **No infrastructure on the meter** (FR-020). The `infra` attribution and its correction (September R-21) are gone.
- **The Anthropic API's own limit:** the Author sets the account's monthly spend limit at or under $20 where the account offers one, and the runbook records that it is set (FR-073; [§14](#14-the-authors-patches-steps-and-adrs)).

## 4. The tunnel end: the tunnel, the relay, and the sink

[contracts/tunnel.md](contracts/tunnel.md), [contracts/relay-http.md](contracts/relay-http.md), [contracts/public-view.md](contracts/public-view.md).

- **The instance** (research.md R-04): `t4g.micro`, a persistent spot request stopping on interruption (question 2; [What the answers change](#what-the-answers-change-in-this-plan)). It has two interfaces: a private one for CloudFront's VPC origin, and a public one with an Elastic IP for the tunnel's port and the health port. Amazon Linux 2023, IMDSv2 with hop limit 1, operator access through Systems Manager only. It runs the compose file with `H4_HOST=tunnel-end` and the `tunnel-end` profile:

  | Service | What it does | Limit (to measure, research.md R-33) |
  |---|---|---|
  | `tunnel-end` | OpenSSH's server: permits exactly the forwards in research.md R-11, no shell | 32 MiB |
  | `relay` | the Author's answer to question 1: the edge listener on the private interface, the host choice, the cap, the kill-switch read, the status | 96 MiB |
  | `snapshot-sink` | merges the serving host's panels with the cloud part, and writes the public view | 48 MiB |
  | `otel-collector` | file-backed queue; routes the relay's telemetry to the serving host's collector (research.md R-25) | 96 MiB |

- **Its host services:** the deployer, the egress proxy, and the credential timer, as September §6.
- **The tunnel** (research.md R-11): the laptop's `tunnel` service in the `tunnel` profile, unprivileged. Three reverse forwards: the relay block, the telemetry block, and the health block. Two local forwards: the shared state and the snapshot sink. Keys from `make tunnel-keys`; revocation in one action.
- **The hosts' blocks** (research.md R-12): 8085, the relay block, on both hosts, behind a bearer token per host; 8086, telemetry in, on the laptop; 8087, health, on the laptop, unauthenticated and status-only.

## 5. The hosts: EC2 and the laptop

### 5.1 EC2 (FR-043, FR-044, FR-050, FR-069; research.md R-04, R-30)

- **The launch template:** the type group 2 measures; spot, persistent, `instance_interruption_behavior = "stop"`; standard credits if burstable; IMDSv2, hop limit 1; encrypted gp3 root and data volumes, kept while stopped.
- **The network:** one interface in a public subnet, with an address assigned at each start, used for egress through the proxy only (research.md R-10). The security group admits the relay block's port from the tunnel end's security group, and nothing else.
- **cloud-init and its host script:** Docker and the pinned Compose plugin; the egress proxy, the deployer, and the credential timer. `write_env.py` writes the env file from Parameter Store to tmpfs (the Anthropic key, the role passwords, the relay's token for EC2) and checks IMDSv2's instance tag before preflight (research.md R-28).
- **What it runs** (`H4_HOST=ec2`; data-model.md §2.2): the whole topology but the model server (`gateway`, `edge`, `web`, `otel-collector`, Prometheus, Loki, Grafana, and Langfuse and its four stores), and no local `gateway-state`, since the meter is RDS. Preflight's rule "exactly one of `gpu` and `cpu`" becomes "neither" for the `ec2` class.
- **Its identity:** the instance role `h4-prod-ec2`, and `h4-prod-gateway` for Bedrock, assumed by the credential timer (research.md R-15).
- **Operator access:** Systems Manager only (FR-050). `make cloud-session HOST=ec2`.

### 5.2 The laptop (FR-045, FR-052 to FR-055, FR-064)

- **`make up ENV=prod`** still starts the whole production topology, calling local models (FR-045). New in prod:
  - the `tunnel` profile;
  - `GATEWAY_DB_URL` to the tunnel's forward;
  - `H4_HOST=laptop`;
  - the relay, telemetry, and health blocks on `edge`;
  - `h4-handover`, started in the Author's session (§7).
- **The local `gateway-state`** isn't used by prod after the move. Dev and dev-cpu keep theirs.
- **Its Bedrock identity:** spec 000's SSO permission set, imported into Terraform and narrowed to `sts:AssumeRole` on `h4-laptop-bedrock`, the ordinary role that holds the Bedrock permission and takes the budget action's deny (FR-013, FR-023; row F2's change).
- **Its stop of EC2:** the `h4-ec2-stop` permission set, through the Author's SSO session (question 7). `make up` never fails because the stop fails (FR-064).
- **No inbound port, no CI runner, no pushed deployment;** the local deployer takes releases from the Author's release directory (research.md R-17).

## 6. Routing per host (FR-035, FR-067, FR-068; research.md R-27, R-28)

- **`H4_HOST`** selects the route: `envs.prod.hosts.laptop` or `envs.prod.hosts.ec2` (data-model.md §2.1).
- **The laptop:** ADR 0001's order. The kill switch first; the local model while it is healthy; then the one paid fallback its route names, attributed `fallback`, inside the $2-a-day sub-budget, the ceilings, and the adapter caps; otherwise degraded. Its route keeps what prod's route names on `main` when group 6 starts: the Anthropic API, once `feat/010-anthropic-switch` has merged.
- **EC2:** the kill switch first; the Anthropic API while it is healthy and admitted (the ceilings, then its $20 cap); then Bedrock under the same admission; otherwise degraded. Its calls are attributed `metered`, so the sub-budget never sees them (the Author's answer, "The $2-a-day sub-budget stays the laptop's fallback rule").
- **Rule R1, amended:** every `primary` is local; a route with `first` names only paid adapters and appears only as `envs.prod.hosts.ec2`. The validator (`services/gateway/src/config/validate.ts`), spec 000's config-files contract, and spec 010's FR-001 change together, by name.
- **Spec 010's preconditions on EC2** (FR-068): the price (in place since 2026-11-09.1), the cap ($20, in place), the key (in Parameter Store, the Author's, in group 7), and his words in row F3 (adopted, on `feat/010-anthropic-switch`). EC2 doesn't serve visitors until all four are in.
- **The placeholder gate:** `evals/test_disclosure.py`'s `placeholder_gate` reads only `envs.prod.fallback` today. Group 6 makes it read every host route's `first`, `second`, and `fallback`, test-first, before schema 2 lands.
- **EC2's route line,** `ec2: { first: anthropic, second: bedrock }`, is the Author's own step in group 7, not an agent's: ADR 0041 makes the route's change his. Group 6's agents write schema 2 with the laptop's line only, and a gateway with `H4_HOST=ec2` refuses to start until his line is in (`route_missing`).
- **Readiness evidence** (spec 010 FR-026; spec 007 FR-031): a ready topic needs runs on the laptop's local model and its fallback, and on EC2's Anthropic API and Bedrock. The report reads both host routes from the file.

## 7. The handover (FR-063 to FR-066, FR-069 to FR-072, FR-074; research.md R-29 to R-32)

[contracts/handover.md](contracts/handover.md) has the details.

**The laptop takes over** (`make up ENV=prod`):
1. Preflight, then the tunnel first, since the gateway needs the shared state through it.
2. The whole topology starts.
3. The relay sees the laptop pass three checks and sends visitors to it; Route 53's check turns healthy.
4. `h4-handover` sees the relay's status say `laptop`, stops EC2 through the Author's SSO session, and records it. The window is at most 5 minutes.
5. Every 60 s while the laptop serves, it stops EC2 if EC2 runs. If its session has expired, it alerts once and keeps serving.

**EC2 takes over** (the laptop goes):
1. The relay sees the laptop fail and answers `no_host_serving`, or sends to EC2 if it is already healthy.
2. Route 53's check fails after its threshold. The alarm changes, and EventBridge invokes `h4-ec2-start`, which checks the autostart switch and the server action and starts EC2.
3. EC2 boots, its deployer checks the release, and the stack comes up.
4. The relay sees EC2 pass three checks and sends visitors to it, recording the gap.

**The functions:**
- **`h4-ec2-start`:** one start per alarm change, and once when the tunnel end returns. It refuses while the autostart switch is `off` (code `paused`), while the server action is executed, while the tunnel end isn't running (`tunnel_end_down`), or, when invoked by hand or by the tunnel end's return, while the laptop serves. Its run on the tunnel end's return can start EC2 while the laptop is reconnecting; the loop then stops it within the window ([What the answers change](#what-the-answers-change-in-this-plan)).
- **`h4-ec2-guard`:** on EC2 entering `running`, stops it if the laptop serves, the autostart switch is `off`, or the server budget's action has run, and alerts which (`ec2_stopped_server_budget` for the last).
- **The spot interruption warning:** an EventBridge rule publishes it to `h4-alerts` (FR-071).

All three are in `infra/account/handover.tf` (protected).

**The operator's commands** are research.md R-32's: `make ec2-status`, `ec2-start`, `ec2-stop`, `ec2-autostart`, `operator-* ENV=shared`, `cloud-session`, and `server-budget-restore`. Each writes an audit record. `ENV=shared` uses the laptop prod's own admin listener while that prod runs, and otherwise starts an admin-only stack on the laptop that can't take visitors, so the two never hold port 18003 together (FR-074). `make operator-restore ENV=shared` marks a restored store uninitialized, so that `operator-init` can confirm its values (contracts/shared-state.md §8).

**Nothing writes configuration at run time** (FR-072): the functions and the loop change EC2's running state only, and the relay's choice is in memory and in `handover_events`. A plan from the same commit after a handover shows no change (spec User Story 1, scenario 10).

## 8. The edge, the site, and the disclosure

### 8.1 The edge (FR-027 to FR-029, FR-034, FR-066; research.md R-07, R-08, R-09)

[contracts/edge.md](contracts/edge.md).
- **The zone and the certificate:** the hareet.ai zone in Route 53. The Author points the registrar's name servers at it, a recorded human step. ACM's certificate covers `hareet.ai` and `www.hareet.ai`, validated by DNS.
- **The distribution** has two behaviors:
  - `/api/*` goes to the VPC origin on the tunnel end's private interface (the relay, question 1), with `CachingDisabled` and `CloudFront-Viewer-Address` forwarded;
  - the default goes to the site's bucket through origin access control, with the CSP, HSTS, `Referrer-Policy: no-referrer`, and a `Permissions-Policy` that turns off the camera, microphone, and geolocation.
- **Errors:** custom error responses turn 502 and 504 into a 503 with `/_degraded/api.json`, cause `no_host_serving`.
- **No access logs:** they would store visitors' addresses.

### 8.2 The site (FR-036 to FR-038, FR-041, FR-042)

- **Spec 002's `apps/web` build,** synced to the site's bucket by `make release`. Releases refuse drafts and placeholders (spec 002's rule).
- **Pages:** the room, the disclosure page rendered from `docs/data-flow-disclosure.md`, and `/status/` (§8.4).
- **Fixed messages:** the room maps `no_host_serving` to `cannot_talk.resting` once spec 002's contract §3 is amended by name ([§13](#13-the-spec-amendments-question-1s-answer-needed-applied)).
- **Content:** what goes public about the Author needs his approvals (ADR 0034) and each topic's readiness (spec 007).
- **The site's scan** in `make check` fails on any absolute URL to another host.

### 8.3 The disclosure (FR-040)

Spec.md's Data-Flow Disclosure Entries become rows, each in the change that creates its flow:
- **The changed rows** S1, S2, V1, V2, V4, F1, F2, F3, A1, A2, and D1. On EC2 every hello and twin turn goes to the Anthropic API first. F2's change is the laptop's `sts:AssumeRole` on `h4-laptop-bedrock`. F3 keeps the Author's adopted words verbatim; this spec adds only EC2's trigger, default, and switch-off beside them.
- **The new rows** S15 to S17, V6 to V9, C1 to C11, and C13 to C15 (C12 is reserved).
- **With the relay on the tunnel end** (question 1), as spec.md now has them: C1 is "the edge → the relay on the tunnel end", C14 is "the relay → the serving host's relay block", carrying the same fields, and C15 is the tunnel end's collector → the serving host's collector, the laptop's through the tunnel's reverse forward 2202 to its `edge`'s telemetry block, 8086.
- **Which group adds which row:** each row lands in the commit that creates its flow (tasks.md names the commit): group 5 has S1's change, S16, S17, C3, C15, C7's tunnel-end part (its deployer, ECR, the secrets store, Systems Manager, and SNS), and the tunnel end's egress; group 4 has F2's change; group 6 has C2, C13, and S2's shared-state change; group 7 has S2's EC2 part, F1, F3's EC2 part, A1, A2, D1, V2's EC2 part, and C7's EC2 and laptop parts; group 8 has V1, V2's path, V4, V6 to V9, C1, C14, and S15; group 9 has C5 and C6; group 3 has C8's email half and C9; group 4 has C8's Telegram half, C10, and C11. The tunnel end's reads of AWS's state stay inside the account, under C7's "the account's endpoints they use".

`tools/gates/disclosure_check.py` fails a change that adds an outward kind of thing without its row: a compose service on `egress`, an sshd permit, an egress-proxy host, a CloudFront origin, an EventBridge rule that calls out, or a security group rule open to an outside range.

### 8.4 The public view (FR-057 to FR-059; research.md R-19)

[contracts/public-view.md](contracts/public-view.md).
- **The publishers:** each serving host's `snapshot-publisher` posts its panels every 2 minutes.
- **The sink,** on the tunnel end, adds the cloud part and writes `site/status/latest.json`.
- **`/status/`** shows:
  - spec 000's FR-028 panels;
  - which host serves, the handovers and their gaps, and EC2's state;
  - the server's month against its budget, next to model spend against the ceilings;
  - the adapter's month, the running release on each host, and when each part was taken;
  - `none` whenever `/api/status` gives the edge's degraded answer or none at all, as while the tunnel end and the sink are gone, whatever `latest.json` last said (spec FR-057).

## 9. Releases and the deployers (FR-046 to FR-049; research.md R-17)

[contracts/releases-deployer.md](contracts/releases-deployer.md).
- **`make release`** builds once, for `linux/amd64`, and for `linux/arm64` if EC2 or the tunnel end is Graviton. It pushes to ECR, copies the upstream images the cloud hosts run, writes `release.json`, and syncs the site.
- **Three deployers:**
  - **EC2's** runs at boot before its stack takes visitors, and every minute while it runs;
  - **the tunnel end's** runs every minute;
  - **the laptop's** takes releases from the Author's release directory.
- **Rollback and holds:**
  - `make rollback ENV=ec2|tunnel-end|prod` rolls back;
  - a hand-started stack is left alone until `make deployer-resume`;
  - the gateway still refuses a store whose schema is newer than its code, so a rollback across migration 0007 fails closed.

## 10. Tests and proofs

| What | Where | Proves |
|---|---|---|
| The relay's contract suite | `services/relay/test/**`, with stub hosts and a stub store | the order; the host choice and its thresholds; the retry on the other host; `no_host_serving`; the cap; the 10 s rule; the peer rule; no body kept; no address logged |
| Routes per host | `services/gateway/test/**` | `H4_HOST` selection; R1 amended; `metered` on EC2 and `fallback` on the laptop; the sub-budget untouched on EC2; spec 010's refusals on the `ec2` route; exit 78 on a host mismatch |
| Two gateways on one store | `services/gateway/test/integration/shared-state.test.ts`, two gateway processes against one Postgres | admission at the global limit never passes a ceiling beyond spec 000's bound; one rollover; one alert per crossing; the kill switch seen by both within 10 s |
| The breach test, grown | `evals/breach.py` on dev-cpu, with the relay in `dev-relay` | FR-025 |
| The tunnel's rules | `deploy/tunnel/test_*.py`, two containers on the agents' engine | only the permitted forwards; no shell; a wrong host key refused; the forward to the store reaches only the store |
| The hosts' firewalls and daemons | `deploy/hosts/test_hosts.py` on the rules' text | the egress chains; EC2's single inbound rule; the tunnel end's three ports |
| The Lambda functions | `infra/lambdas/*/test_*.py`, with stub EC2, Budgets, SSM, and Route 53 | the start function's refusals and its one attempt; the guard's three stops (the laptop serving, the switch off, the server budget's action run); the alert texts, `ec2_stopped_server_budget` among them; no secret logged |
| The placeholder gate | `evals/test_disclosure.py`, with schema-2 routing fixtures | `placeholder_gate` fails while F3 holds a placeholder and any host route names the Anthropic API as `first`, `second`, or `fallback`; it passes with his adopted words |
| The tunnel end's collector | `deploy/otel/test_collector_tunnel_end.py`, on the configuration's text | `laptop` to the tunnel's 2202 forward, `ec2` and `none` to EC2's collector; the file-backed queue; spec 000's redaction |
| The handover loop | `deploy/scripts/test_handover.py`, with a stub relay status and a stub EC2 | stop after the relay says `laptop`; stop again after a flap; alert once on an expired session; `make up` never fails on a failed stop |
| The policy, redaction, plan note, disclosure checks | `tools/gates/test/*.py` | each rule, passing and failing |
| The matrix | `redteam/forbidden-actions.sh` | FR-006's spellings, FR-011's paths and names, FR-012's files, and R-32's targets |
| Red-team cases | `redteam/cases/` | FR-039, on the laptop's local model and fallback, and EC2's Anthropic API and Bedrock |
| The site's scan, the visitor scan | `apps/web/test_site.py`, `evals/visitor_scan.py` | SC-010's machine half; SC-011 over every store, the shared state included |

## 11. Telemetry and the dashboard (FR-059, FR-060; research.md R-25)

- **Spans:**
  - `relay.request`, with `h4.relay.host` (`laptop`, `ec2`, `none`), `h4.relay.reason`, `h4.degraded.cause`, and `h4.cap.refused`, never an address;
  - the gateways' spans gain `h4.host`;
  - trace context goes from the relay to the host, so the gateway's spans are its children.
- **Metrics:**
  - `h4.relay.requests` by host and outcome; `h4.relay.host_healthy` by host; `h4.serving_host`;
  - `h4.handover.events` by direction and reason; `h4.handover.gap_seconds`;
  - `h4.ec2.state` and `h4.ec2.starts` by outcome, from the sink's reads and the functions' alerts;
  - `h4.tunnel.up` and `h4.tunnel.reconnects`;
  - `h4.shared_state.latency` and `h4.shared_state.errors` by host;
  - `h4.deploy.events` by host and outcome; `h4.release.info`;
  - the edge's request and error counts from CloudFront's default metrics;
  - the collectors' queue and drop counters.
- **The dashboard's new row, "Hosts".** Each panel lands in the group of the feature it shows, as the constitution's Development Workflow step 7 asks, so no feature ships without its panel:
  - **group 5:** the tunnel's state and reconnects; telemetry delayed or lost (the tunnel end's collector's queue and drop counters);
  - **group 6:** the shared state's latency and errors, per host;
  - **group 7:** the release on each host, with who started it (FR-049);
  - **group 8:** which host serves (a state timeline), the handovers and their gaps, the relay's requests by host and outcome, and the cap's refusals;
  - **group 9:** EC2's state and interruptions, its starts and refusals and the guard's stops, the autostart switch, the health check's status, and the handover window; and the server's month against its budget beside model spend against the ceilings and the adapter's month (spec 010; User Story 7). Their AWS-side values come from the sink's cloud reads, which group 9 writes and exports as metrics through the tunnel end's collector (C15): EC2's state and its spot request's, the autostart switch, the health check's status, the server action's status, the server's month (`budgets:ViewBudget`, hourly), and each function's outcome count from its log's embedded metric (`cloudwatch:GetMetricData`, to confirm in group 9). The tunnel end's role gains those reads (research.md R-15; question 7);
  - **group 10:** `/status/` only, with the publishers and the public document.
- **Runbooks** (FR-056), each named by its alert:
  - the laptop's;
  - the handover's: a failed stop and the autostart switch;
  - EC2's: a failed start, a spot interruption, and the server action;
  - the tunnel end's: a restart, a key's revocation, and its loss;
  - the shared state: unreachable, the move, and a restore from backup (`operator-restore`, then `operator-init`);
  - AWS-side alerts, the public view gone stale, and the domain.

## 12. Degraded paths

Spec.md's Degraded Modes table holds, with these mechanisms:

| What is gone | How it is detected | A visitor gets | The operator gets |
|---|---|---|---|
| The laptop, while it served | the relay's check (1 s); Route 53's check (its threshold) | `no_host_serving` from the relay, then EC2's answers | the start function's alert, the gap's length |
| EC2, starting | the relay's checks | `no_host_serving` | the gap on the dashboard |
| Both hosts | the relay's checks | `no_host_serving`; the status answer live | the probe's alert after 5 minutes |
| The tunnel end, reclaimed on spot (question 2) or down | AWS's interruption warning; CloudFront's 502 or 504; the probe | the edge's `no_host_serving` body and the room's resting message, even if a host is up; the site loads | `tunnel_end_interruption` at the warning; the probe's alert after 5 minutes; `h4-ec2-start` refuses with `tunnel_end_down`; on its return, `tunnel_end_back`, the tunnel reconnects, and the start function runs once |
| The tunnel end's spot capacity, gone for long | the same | the same, for as long as capacity is short | the runbook moves the request to another zone (a new instance from the same release; the Elastic IP re-associated) |
| The tunnel, while the laptop runs | the relay's checks; Route 53's check | as "the laptop", above | the tunnel panel |
| The shared state, from one host | that host's gateway read; the relay's read | degraded on that host (`cannot_talk.unavailable`); the relay moves visitors off a host whose health block reports it | the store alert |
| The shared state, everywhere | every read | degraded (`cannot_talk.unavailable`) | the store alert; the restore runbook |
| The Anthropic API on EC2 | the adapter's health and circuit | Bedrock's answer, inside the ceilings | spec 010's alerts |
| A ceiling, or the kill switch | the meter | `cannot_talk.budget` on both hosts | spec 000's alerts and reset |
| The server budget | AWS's billing data, late | EC2 stopped; the laptop if he runs it, else `no_host_serving` | the alert, and the incident note |
| The laptop's stop of EC2 | the loop | nothing changes | an alert; EC2's hours count against the server budget |
| The start function | its outcome | `no_host_serving` | its alert |
| A spot interruption | AWS's warning | `no_host_serving` until capacity returns | the warning's alert |
| The egress proxy on EC2 | the gateway's adapter errors | degraded answers (`fallback_unavailable`) | the alert-delivery panel; AWS-side alerts unaffected |

## 13. The spec amendments question 1's answer needed (applied)

The Author answered question 1 with the relay on the tunnel end, and these changes are now in spec.md, made on 2026-11-09 with his answer. Each follows from the relay running on the tunnel end; question 2's spot answer adds FR-076 and its Degraded Modes row.

| Spec text | Amended to |
|---|---|
| Terms: "The relay is the thin public API in each host's stack" | the thin public API on the tunnel end, in front of both hosts |
| Terms: the tunnel end "runs the tunnel's far end and nothing of the stack's" | runs the tunnel's far end, the relay, the snapshot sink, and a collector; no gateway and no store |
| Terms: "The failover … The laptop … is the primary; EC2 is the secondary" | the health check through the tunnel end, which fires the start function; the relay moves visitors |
| FR-029: the relay "on both hosts" | on the tunnel end |
| FR-034, FR-066, FR-075 | the relay answers `no_host_serving` while it is up and no host serves; the edge answers it while it can't reach the relay. Nothing calls a model while no host serves |
| FR-037 | the relay answers the status request always |
| FR-052 | the tunnel end's environment selects the tunnel's far end, the relay, the snapshot sink, and the collector |
| FR-054 | the relay checks both hosts' relay blocks every second and sends each request to the laptop while healthy, else EC2 while healthy, else `no_host_serving`; Route 53's health check, through the tunnel end, fires the start function |
| FR-063, FR-064, FR-065 | "the failover answers with the laptop" becomes "the relay sends to the laptop" |
| FR-072 | no DNS answer changes at run time |
| SC-007, SC-016 | "the failover answering with the laptop" becomes "the relay sending to the laptop" |
| Data-Flow Disclosure Entries | C1 to the relay on the tunnel end; new row C14, the relay to the serving host's relay block |
| Constitution Check, Cloud standard | the relay runs around the clock on spot; its gap against "must be always-on" is question 8, answered at T000 with option A |
| Clarifications | a new entry records the answers to the plan's questions 1 to 4, and that question 1's supersedes the DNS-failover reading of point 1 |
| New FR-076; Degraded Modes; Edge Cases | the tunnel end on spot: stop on interruption, the warning's alert, the site and the resting reply while it's gone, its return (question 2) |
| Assumptions | the 1.1.0 patch's two added sentences (question 3); offline demos on `ENV=dev` (question 4); the tunnel end and the relay, decided |

Amendments to other specs, by name, each passage marked "(spec 001)". Each travels in the group branch whose code needs it, so one gate checks the code against the amended text, and the Author approves both in one merge. He approved the list itself with this plan (T000):
- **Spec 000** (group 6, T074): FR-030, the sub-budget is the laptop's fallback rule; FR-031, one shared meter for prod; contracts/config-files.md, R1; contracts/env-files.md, `H4_HOST` and `GATEWAY_DB_URL`; the operator actions, `operator-restore`.
- **Spec 002** (group 8, T108): contracts/room-conversation.md §3, `no_host_serving` in the "local tier off" class. The resting message's words are spec 002's own change, in its lifecycle (P-5).
- **Spec 007** (group 6, T074): FR-031's evidence, per host.
- **Spec 010** (group 6, T074): FR-001's R1 text; FR-026's evidence; its Out list.

## 14. The Author's patches, steps, and ADRs

**Patches** (drafted by agents, applied by him):

| # | Patch | When |
|---|---|---|
| P-1 | The guard patch (§2) | group 1, before any `infra/` file |
| P-2 | Constitution 1.1.0, as amended on `docs/001-ec2-default` with the two sentences he chose to add (question 3), and with his wording for question 8 if he chooses A | before any group, by default (tasks.md T001, confirmed at T000) |
| P-3 | CLAUDE.md, three sentences. **The infra line,** as September drafted it, for the local phase's apply. **The routing sentence,** per host, for example: "local-first on the laptop, then its one paid fallback (Bedrock or the Anthropic API) within its sub-budget and caps; on EC2, the Anthropic API, then Bedrock, within the ceilings and caps; then degraded". **The relay's line,** "`services/relay` — thin cloud API on the tunnel end; kill-switch read; host choice; public cap". The words are his | with P-1 |
| P-4 | The intents' lines: intent 000's cost and hosting constraints, and this folder's intent's cost lines, in his words | any time; the spec reads them under his later words until then |
| P-5 | Spec 002's resting words, in his words (question 5, provisional) | before the first public release |
| P-6 | `config/budgets.yaml`'s new `public` section: the relay's per-address cap (requests a minute, burst, requests a day) and its global in-flight limit, each figure his, with an ADR (FR-033). The agent drafts the section's keys with each figure left blank for him; the gateway's validator and the relay accept the section in group 8's code, tested on a copy with P-6 applied | drafted in group 8 before the relay's code; applied with the group's other patches, before its gate (tasks.md) |
| P-I1 to P-I6 | The protected Terraform files, one patch per group that has any (tasks.md) | in their groups |

**His steps** (each recorded): pricing and the server budget's figure (group 2); every apply; the state's migration; activating the cost tags; confirming the email subscription; the Telegram parameters; the secrets and the role passwords; the tunnel keys; the name servers; the move of the meter; EC2's route line naming the Anthropic API first (group 7, ADR 0041); the Anthropic account's spend limit; the rehearsals; the red-team runs; the first public release. His words in row F3 are already adopted, on `feat/010-anthropic-switch`.

**ADRs**, written in group 1 (tasks.md T007), status proposed, each quoting the answers it rests on; they become accepted when he merges group 1, after his approval at T000:

| ADR | Decision | From |
|---|---|---|
| 0007, 0008, 0009 | September's reserved three: one account; Terraform with reviewed plans and the recorded terminal apply; pull-based deployment, no inbound ports | research.md R-02, R-13, R-17 |
| next free | The shared state in RDS for PostgreSQL | R-20 |
| next free | The relay on the tunnel end, which picks the host (question 1), and the tunnel end on spot (question 2) | R-04, R-07, R-18 |
| next free | The tunnel: OpenSSH, ending on the tunnel end | R-11, R-12 |
| next free | EC2 on spot with stop, the start function, and the guard | R-29, R-30 |
| next free | The route per host and rule R1 | R-27, R-28 |
| next free | The public request cap in the relay | R-18 |

ADR numbers come from the index when T007 runs: 0043 is spec 005's and 0044 is ADR 0044. ADR 0044 amends ADR 0001; the route-per-host ADR extends it.

## 15. Cost lines

research.md R-05 has the table, each line with its repository figure and date, or marked to price. In short:
- **Model spend** is spec 010's estimate and the meter's ceilings, both hosts together.
- **The server budget** covers EC2 (running on spot; its volumes running or stopped; its address while running), the tunnel end (instance, Elastic IP, root volume), RDS (instance, storage, backups), its master password's secret, Route 53 (the zone and the health check), CloudWatch alarms, S3, ECR, and AWS's free or near-free services.
- **The Author prices it** from group 2's measurement and sets the figure before group 3's apply.
- **Measured** by SC-002 and SC-003, and on the dashboard.

## 16. Order of work, risks, and proof

**Before any group:** T000, his approval (2026-11-10), and T001, his constitution patch (P-2, 1.1.0 as amended, with his question 8 wording, option A), as the default order. Every group that touches `infra/` (3 to 9) checks T001's result first. **The named deviation:** his approval's "build it out … you can have everything ready and verified by then" has group 1 built before T001; group 1 writes nothing under `infra/`, and nothing merges or is applied before T001 (spec.md Assumptions).

**Task groups.** Each is a feature branch with a note, merged by the Author in this order.

| # | Branch | What | The Author's part |
|---|---|---|---|
| 1 | `feat/001-guards` | P-1 and P-3; the ADRs; the Terraform pin | choose the pins; apply P-1 and P-3 on the branch, gate, merge; seed the mirror on `main` |
| 2 | `feat/001-measure` | research.md R-33: the stack's memory without the model server on dev-cpu; the tunnel end's; every image's architectures; the disks | price the lines from AWS's pages and **set the server budget's figure** (spec question 14), on the branch before its review; gate, merge |
| 3 | `feat/001-us1-bootstrap` | `infra/bootstrap`: state, the three budgets, the anomaly monitor, the topic; the plan and apply targets; the credential audit's script | the plan block; P-I1, gate, merge; on `main`, verify, apply, record; migrate the state; the cost tags; the email subscription |
| 4 | `feat/001-us2-safety-net` | `infra/account`: the laptop's Bedrock permission set imported and narrowed to `sts:AssumeRole` on `h4-laptop-bedrock`, the ordinary role that holds Bedrock; the model action on that role, and both actions' rehearsals against targets of the same shape (the server action itself waits for EC2, group 7); the alert bridge, the probe (its schedule disabled until group 8's P-I5), the credential audit, and both schedules in the protected `alerts.tf`; the registry and the release bucket | the plan block; P-I2, gate, merge; on `main`, apply with the import; the laptop's Bedrock profile; the Telegram parameters; **the rehearsals (SC-009)**; `rehearsal = false` |
| 5 | `feat/001-tunnel-end` | `infra/prod`'s network and the tunnel end, on spot with stop, and its interruption warning's rule; the `tunnel` and `tunnel-end` images; the laptop `edge`'s three blocks; the tunnel end's deployer, egress proxy, and collector; the tunnel's and the collector's panels | the plan block; P-I3, gate, merge; on `main`, apply; `make tunnel-keys`; start the tunnel; **SC-006** |
| 6 | `feat/001-shared-state` | the placeholder gate over every host route, test-first; RDS; migration 0007; the gateway's `H4_HOST`, routes per host with the laptop's line only, R1, TLS to the store; the two-gateways test; `operator-* ENV=shared`; the shared state's panel | the plan block; gate, merge; on `main`, apply; the role passwords; **the move** (data-model.md §1.5); the laptop's prod on the shared state |
| 7 | `feat/001-us6-ec2` | EC2 (spot, stop), its roles, env, host scripts, egress proxy, and deployer; the model action gains EC2's gateway role, and the server action is added; multi-architecture releases; EC2's relay block; the release panel | the plan block; P-I4 and **EC2's route line** (`ec2: { first: anthropic, second: bedrock }`, his own commit, ADR 0041), gate, merge; on `main`, apply; the secrets; the Anthropic account's limit; the first release; **SC-005, SC-017** |
| 8 | `feat/001-us3-us5-edge` | P-6 drafted first; the zone, the certificate, CloudFront and its VPC origin; the relay on the tunnel end; the site; the disclosure's rows; red-team on four adapters; the edge's body; spec 002's contract §3, amended by name; the relay's panels | the plan block; P-6 with his figures, P-I5 (CloudFront's policies, and the line that enables the probe's schedule), gate, merge; on `main`, the name servers; apply; the red-team runs; the site stays unannounced until group 9 ends |
| 9 | `feat/001-us4-us7-handover` | the health check, the alarm, the rules (the tunnel end's return among them), `h4-ec2-start`, `h4-ec2-guard` (three stops), the autostart switch, EC2's spot warning; `h4-handover`; `make ec2-*`; the sink's cloud reads as metrics; the handover's and the server budget's panels | the plan block; P-I6, gate, merge; on `main`, apply; **10 handovers each way (SC-007); rehearsed interruptions, 5 of EC2 and 3 of the tunnel end (SC-018)**; the first public release; **SC-001, SC-010, SC-011** |
| 10 | `feat/001-us8-public-view` | the publishers, the sink's document, and `/status/` | gate, merge; **SC-013**: both hosts off for an hour |
| 11 | `feat/001-close` | the success-criteria table; runbooks completed; the README and the ADR index | gate, merge; **SC-002, SC-003, SC-016** after the first full month; **SC-004**; **SC-012**; **SC-014** |

**The order inside each group** (tasks.md): the tests, which fail first; the code, each feature with its span, its panel, its runbook, and its disclosure row; the Author's plan block, pasted into the note on the branch; a review by an agent that wrote none of it, and the note; then his patches, the gate, and the merge; then his apply on `main` and his other steps there. The plan block comes before his patches are on the branch, so he makes it from a scratch copy of the branch with the group's patches applied: the patched files are byte for byte the ones he then commits, so `infra/`'s tree hash is the same, and the gate's `infra-plan-note` step matches it.

Hello and the twin become public only at the end of group 9, after the handover is rehearsed, so the first visitor meets the whole design, and the disclosure is live before the first visitor byte.

**Risks:**

| Risk | Mitigation |
|---|---|
| The stack without the model server needs more memory than the Author's figure allows | Measured in group 2, before any apply; the Author sets the figure from it. Trimming the stack on EC2 (Langfuse's stores are the largest) is a plan change he can ask for |
| An image the stack runs has no arm64 build | Measured in group 2; EC2 is then x86-64, and releases stay single-architecture for it |
| RDS's price is out of proportion to the server budget | Priced in group 2. DynamoDB is the alternative (research.md R-20), with its rewrite |
| Spot capacity for EC2's type is short | The interruption's alert, `no_host_serving`, and the laptop; the runbook moves the request to another zone, with a snapshot of the data volume |
| The tunnel end is a single point for dynamic requests, and on spot (questions 1 and 2) | The Author chose spot knowing it ("while it's gone the site rests, even if the laptop or EC2 is up"). The warning's alert; the edge's own degraded body; the probe; stop-not-terminate, so it returns when capacity does; the start function waits for it; the runbook's move to another zone |
| Route 53's checkers can't reach the health port, or their address ranges change | The first infra task confirms the ranges' published form; the policy refuses any other open rule |
| A CloudFront error response can't carry the cause's header | Measured in group 8; the cause travels in the body (research.md R-08) |
| Two gateways race on the shared rows | The two-gateways test (§10) before group 7 |
| The laptop's SSO session expires while it serves | The loop alerts once and keeps serving; the shared meter bounds spend; EC2's hours show on the dashboard |
| AWS's billing data lags | The meter is the control for model spend; the server action is the safety net, late, as the spec says |
| Spec 000's open criteria, if any | The spec puts spec 000 first; group 5 waits for them |

**Proof.** [quickstart.md](quickstart.md) runs each story in the Author's terminal. Each group's note carries `make check`'s whole output, the gate's summary, the reviewer's passes, and the redacted plan blocks and apply records. Spec 001 is done when SC-001 to SC-018 (but SC-015, moved) pass and the matrix shows zero failures and zero planned rows.

## 17. Requirement coverage

| Requirements | Where | Group |
|---|---|---|
| FR-001 to FR-012 | §1, §2; research.md R-02, R-03, R-13, R-14, R-16, R-26 | 1–3 |
| FR-013 | §5; research.md R-15 | 6–7 |
| FR-017 to FR-020 | §3.3; research.md R-20; data-model.md §1 | 6 |
| FR-021, FR-022 | §3.1; research.md R-05, R-22, R-33 | 2–3 |
| FR-023, FR-026 | §3.2; research.md R-22 | 4 |
| FR-024 | §3.3 | 6 |
| FR-025 | §10 | 8 |
| FR-027 to FR-029, FR-034 | §8.1; research.md R-07 to R-09 | 8 |
| FR-030 to FR-033, FR-035, FR-037 | §4, §6; research.md R-18, R-27 | 6–8 |
| FR-036, FR-038, FR-041, FR-042 | §8.2 | 8 |
| FR-039 | §10 | 8 |
| FR-040 | §8.3 | 5–9, each flow with its change |
| FR-043 to FR-045 | §5 | 5–7 |
| FR-046 to FR-049 | §9; research.md R-17 | 5–7 |
| FR-050, FR-051 | §5.1; research.md R-10 | 7 |
| FR-052 to FR-055 | §4, §5.2; research.md R-11, R-12 | 5 |
| FR-056 | §11 | 3–11 |
| FR-057 to FR-059 | §8.4; research.md R-19 | 10 |
| FR-060 | §11; research.md R-25 | 5–10 |
| FR-061 | research.md R-24 | 4, enabled in 8 |
| FR-062 | §14 | approval |
| FR-063 to FR-066, FR-069 to FR-072 | §7; research.md R-29 to R-31 | 9 |
| FR-067, FR-068 | §6; research.md R-27 | 6–7 |
| FR-073 | §3.3, §14 | 7 |
| FR-074 | §7; research.md R-32 | 6 |
| FR-075 | §4, §12 | 8–9 |
| SC-001, SC-010, SC-011 | quickstart §9 | 9 |
| SC-002, SC-003, SC-016 | quickstart §11 | 11 |
| SC-004, SC-012 | §1 | 3–11 |
| SC-005, SC-017 | quickstart §7 | 7 |
| SC-006 | quickstart §5 | 5 |
| SC-007, SC-018 | quickstart §9 | 9 |
| SC-008 | §10 | 6, 8 |
| SC-009 | quickstart §4 | 4 |
| SC-013 | quickstart §10 | 10 |
| SC-014 | §14 | 11 |

## Constitution Check (post-design)

Re-checked against the design above:
- **No new violation** beyond those named before design.
- **Principle IV is stronger than the spec requires in five places:**
  - containers can't reach any instance's metadata;
  - Bedrock's permission on EC2 sits on a role only a host timer assumes;
  - the tunnel end refuses any forward it doesn't list;
  - CloudFront is the only route to the relay, and the relay the only route to EC2 (question 1);
  - the start function, the guard, and the laptop's stop each hold one action on one instance.
- **Principle I:** visitors' requests stay inside AWS's network and the SSH tunnel (question 1). Every flow is a disclosure row before it happens.
- **Principle V:** the meter stays the control on both hosts. The server budget has its own automatic action, and both actions are rehearsed.
- **The guards come first**, before any `infra/` file, state, key, or secret exists.

Verdict: **PASS**, conditional on the 1.1.0 patch, with the deviations below.

## Complexity Tracking

| Deviation or added part | Why needed | Simpler alternative rejected because |
|---|---|---|
| Deviations from constitution 1.0.1 that 1.1.0 removes: EC2 hosting the stack (Cloud standard), its paid first route (Model access standard), Principle V's reason, the Local tier standard's fallback sentence | The Author's decisions of 2026-11-09 | None: the constitution changes only by his hand, so infrastructure tasks wait for his patch |
| The Author applies from his own terminal (ADR 0013) | No CI before publication | Waiting for publication would leave the site without its safety net |
| The CI-side supply-chain controls wait (ADR 0014) | They need GitHub | Pins, digests, and the local gate stand in |
| Image variants, and multi-architecture releases if Graviton (ADR 0015) | Measured in group 2 | x86 everywhere: allowed if R-33 finds an image without arm64 |
| **Exception to spec FR-001:** secrets are written by the Author outside Terraform (research.md R-26) | FR-009: "Terraform refers to the secret without reading its value" | A Terraform-managed SecureString is read back, decrypted, into the state on each refresh |
| An always-on RDS instance | The shared meter must outlive both hosts and run while EC2 is stopped (FR-019) | Postgres on the tunnel end: one small instance becomes the meter's only home; DynamoDB: a second implementation of the meter |
| The relay on the tunnel end (question 1, the Author's answer) | A private, single origin for CloudFront, and a host choice that DNS can't make for VPC origins | DNS failover with public origins (option B): certificates, a third-party authority, and a secret header |
| The tunnel end on spot (question 2, the Author's answer) | His choice, at about $2.20 a month (research.md R-05, 2026-10-18, to confirm) | On demand, about $6.13 a month (research.md R-04, to confirm), recommended and not chosen. The risk is named in §12 and §16: while AWS has it back, the twin rests on both hosts and the site still loads |
| The relay on spot, against the Cloud standard's "must be always-on" (question 8, answered at T000: option A) | The relay runs on the tunnel end (question 1), which runs on spot (question 2) | Not this plan's to choose. His approval takes option A: his wording goes into the 1.1.0 patch, being added on `docs/001-ec2-default`, so no deviation remains once T001 applies it. Option B, a deviation in spec.md's Assumptions citing ADR 0044, wasn't taken |
| Group 1 built before T001 (spec.md Assumptions, "The constitution first") | His approval at T000: "Let's have you build it out … you can have everything ready and verified by then" | Waiting for T001: his words ask for the build tonight. The deviation is bounded: group 1 writes nothing under `infra/`, and nothing merges or is applied before T001 |
| Three hosts and three deployers | The tunnel end must run while both serving hosts are off | Fewer hosts: the tunnel would have nowhere to end while EC2 is stopped |
| Host services outside compose (deployers, egress proxies, credential timers, the handover loop) | They need the Docker socket, the firewall, an instance role, or the Author's SSO session | In containers they would need `docker.sock` or host networking, which spec 000 refuses |
| **Spec FR-032's one exception:** the Author's test client reaches the relay's internal listener through a Systems Manager session, as a fixed documentation-range identity (as September) | The relay has to be testable before the edge exists | Testing only through CloudFront: no test before group 8 |
| The health block answers without a credential (spec FR-053's conditional) | Route 53's checkers can't send one (to confirm) | An authenticated check: not possible with Route 53's HTTP checks; the block returns only a status |
