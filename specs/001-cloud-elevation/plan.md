# Implementation Plan: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Branch**: `spec/001-cloud-elevation` (this plan; the work runs on one feature branch per task group, [§16](#16-order-of-work-risks-and-proof)) | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Status**: **Approved by the Author on 2026-11-10** (tasks.md T000). His words, verbatim: "Let's approve the t000 and spec 001 plan. Let's have you build it out but not push or try anything in the cloud yet, i will do that in the morning, but you can have everything ready and verified by then. Use the latest dependenices adn versions for aws services, plugins" What his approval takes is recorded in spec.md's Clarifications (Session 2026-11-10), each a reading beside his words: this plan and its §13 amendments; questions 5 to 7, and the spec's question 16, at their provisional defaults, the session's answers, which his approval leaves standing; question 8 at option A, taken provisionally under the session's reading of his approval, as Q5 to Q7 are, its wording in the 1.1.0 patch his to write or confirm at T001; and, as the session's reading, the default order with T001 first, the ADRs proposed until his merges, and T008's pins at the latest releases established on 2026-11-10. **One named deviation:** his words direct group 1 to be built now, before T001 (spec.md Assumptions, "The constitution first"). Nothing merges and nothing is applied before T001, and every group that touches `infra/` checks it first ([Constitution Check](#constitution-check)). **Since then:** T001 is done: the Author applied constitution 1.1.0 (3c89a8b0), with question 8's option A in the Cloud standard's words "the thin API/relay on spot capacity where the Author accepts the gap (ADR 0044)", and accepted ADR 0044 (67028747). Drafted on 2026-11-09 while he was away, at the main session's direction; it replaced the September plan (`plan.md` at 00309c47), and was revised the same day after `/speckit-analyze` over 8acc2686.

**Regrouped on 2026-11-12** in W1's first commit, for the Author's four gates (§16, "Four gates"), with the two named deviations of 2026-11-11 designed: EC2 on 12 hours a day ([ADR 0048](../../docs/adr/0048-ec2-on-12-hours-a-day.md), proposed) and the shared state on the tunnel end. Two more are named with it: the roots, amended ([ADR 0049](../../docs/adr/0049-what-names-an-instance-lives-in-its-root.md), proposed), and the interim from W1 to W2 (spec.md Assumptions). Open for him: the note's questions 1a to 10 (`docs/merge-requests/2026-11-13-spec-001-w1-regroup.md`), each marked where it applies.

**Input**: spec.md as reworked and clarified on 2026-11-09 (commit b2ea2765), with no needs-clarification marker left. [ADR 0044](../../docs/adr/0044-ec2-as-prods-default-host.md), then proposed on branch `docs/001-ec2-default` (4fe34783), accepted since on `main` (67028747). The constitution 1.0.1, then in force, and the 1.1.0 patch (`docs/merge-requests/2026-11-09-constitution-1.1.0.patch`), which the Author applied since at T001 (3c89a8b0). The September research, plan, data model, and contracts at 00309c47, where this plan carries something over.

**Companions**: [research.md](research.md) (each decision, why, and what else was weighed; the cost lines), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md) (the Author's validation runs), and the ADRs [§14](#14-the-authors-patches-steps-and-adrs) lists. Where this plan and a contract disagree on an interface detail, the contract is right and this plan is fixed.

**Conventions** (spec 000's, plus three):
- **The Author's terminal**: commands only the Author runs, outside Claude Code. Hooks refuse them to agents.
- **[A]** agent-editable, reviewed; **[H]** human-only; **[P]** delivered as a patch the Author applies.
- **The three hosts**: **the laptop** (the local tier), **EC2** (prod's default host), and **the tunnel end** (the small instance, run around the clock on spot, where the tunnel ends and the relay runs). Only the laptop and EC2 serve.

## Questions for the Author

Each was something this plan would otherwise have decided past his answers. Questions 1 to 4 were put to him on 2026-11-09, in the session, in the words quoted under each. His choice and the option's text are quoted as given. The options below them are as this plan first offered them, kept as the record. Questions 5 to 7 weren't asked: the session took each recommended option provisionally, as a default that the tasks carry, not his words, and his to overturn at T000. Question 8 came from the analysis of 2026-11-09, after his answers. T000 asked it. His approval chooses neither option, so the session takes option A provisionally, as it took 5 to 7, and the wording is his to write or confirm at T001 (spec.md Clarifications, Session 2026-11-10).

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

### Question 8: The relay on spot, against the Cloud standard (provisional: option A, taken at T000)

**Taken provisionally at T000, 2026-11-10,** as questions 5 to 7 are: his approval, "Let's approve the t000 and spec 001 plan", chooses neither option, and the session reads it as taking the recommendation, A. Under A, his wording for the relay on spot goes into the still-unapplied 1.1.0 patch on `docs/001-ec2-default`; the wording is his to write or confirm at T001, and he can still choose B. **Applied at T001** (3c89a8b0): the Cloud standard reads "the thin API/relay on spot capacity where the Author accepts the gap (ADR 0044)".

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
| Where the shared meter and kill switch live | RDS for PostgreSQL 17, single instance, private; both hosts use spec 000's schema as it is (research.md R-20). **Replaced on 2026-11-11** by Postgres in a container on the tunnel end, the Author's answer (spec.md Assumptions; W1 reworks it) | It runs whether or not a host does, and it runs the meter's transactions and tests unchanged. Its cost is a line the Author prices before he sets the figure. DynamoDB is the fallback if that price is out of proportion. |
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
- **the shared state:** RDS for PostgreSQL (replaced on 2026-11-11 by Postgres on the tunnel end, research.md R-20) with spec 000's meter and kill switch, which both hosts' gateways use with `H4_STACK=prod`;
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
- **Python 3.12, stdlib only**, for the host scripts (the deployer, the egress proxy, the credential timer, the handover loop, the snapshot publisher and sink), and the gates' new checks. **Changed in group 1:** the gates' checks read HCL with their own standard-library reader, in `tools/gates/infra_policy.py`, which refuses (rule T0) what it can't read; `python-hcl2`, September's one pinned addition, isn't added, since the gate's tools run under `python3 -I` with no third-party package, in the Author's terminal before `terraform init`. Group 3's `infra/test/` reads HCL through the same reader.
- **The Lambda functions: `python3.14` on arm64,** and `nodejs24.x` for any function in TypeScript, the latest runtimes the session established on 2026-11-10 (web search; research.md R-02), for the Author's "Use the latest dependenices adn versions for aws services, plugins" (tasks.md T000); he confirms them at T011. Node.js 26's runtime may be live but isn't confirmed, so 24, which matches the repository's Node 24.
- **HCL for Terraform**, with Terraform 1.17.1 and `hashicorp/aws` 6.72.0 pinned in group 1 (tasks.md T008; research.md R-02), the latest established on 2026-11-10, which the Author confirms in his terminal at T011.
- **Bash**, nginx and OpenSSH configuration, and SQL for migration 0007.

**Primary Dependencies**:
- **The relay:** Fastify, `pg`, zod, and pino at the gateway's pinned versions, in one lockfile.
- **The AWS CLI v2** at the devcontainer's pin (2.29.1, the host's version on the repository's record; a newer one is his to choose), and the Session Manager plugin (its version to confirm), in the Author's terminal and on the hosts.
- **OpenSSH** from Alpine, pinned by the base image's digest.
- **The RDS certificate bundle,** pinned by SHA-256 into the gateway's and the relay's images. **Replaced in W1** (§16, "The shared state on the tunnel end"): the shared state's own CA certificate, which the Author makes, in each client's environment.
- **New images,** pinned by index digest in `deploy/images.lock`: `relay`, `tunnel` (both ends), `snapshot`, and the Lambda images on AWS's `python3.14` Lambda base for arm64, pinned by digest in group 4.

**Storage**:
- **RDS for PostgreSQL 17:** the shared state (data-model.md §1). **Replaced in W1:** Postgres 17 in a container on the tunnel end, on a data volume of its own, with its backups in a bucket of their own (§16, "The shared state on the tunnel end").
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
- **The tunnel end:** `t4g.micro`, Amazon Linux 2023, spot, persistent, stopping on interruption (question 2). **From W1:** the smallest type that holds its five services with the shared state among them, likely `t4g.small`, measured (tasks.md T166).
- **RDS:** PostgreSQL 17, the smallest Graviton class, single-AZ. **Replaced in W1** by the tunnel end's `shared-state` service.
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

*GATE: checked before research and again after design ([below](#constitution-check-post-design)).* Against 1.0.1, then in force, and the proposed 1.1.0. Since T001 (3c89a8b0), 1.1.0 is in force. A deviation from 1.0.1 that 1.1.0 removes is a dependency: no infrastructure task starts until the Author applies 1.1.0. Tasks.md puts his patch first, as T001, before any group, and makes its check a precondition of every group that touches `infra/` (groups 3 to 9).

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
| Cloud standard | "The cloud hosts only what must be always-on and cheap" | "may also host the production stack on one VM, without the local model server, as the default production host"; the always-on list keeps "the thin API/relay", and, as amended for question 3, names Bedrock called from the serving host | **Deviation from 1.0.1, removed by 1.1.0** as amended on `docs/001-ec2-default`. **Question 8, provisionally option A** (the session's reading of his approval at T000): the relay runs around the clock on spot, so it has gaps where the standard, in force and as amended, lists it among what "must be always-on"; his wording for it, his to write or confirm at T001, goes into the 1.1.0 patch, so no deviation remains once T001 applies it. Terraform for everything, with one named exception: secrets (research.md R-26). |
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
  - `denyRead`, `denyWrite`, `Read(...)`, and `Edit(...)` on `*.tfstate*`, `*.tfplan`, and `*.tfvars*`. **As built:** `Read(...)` and `Edit(...)` on the three patterns; the sandbox's `denyRead` and `denyWrite` take paths, and a pattern there is unconfirmed (a bad entry could stop every sandboxed command), so they keep the folders that hold the files: `~/.config/h4reet-ai/infra/` holds the local state, the saved plans, and each root's `TF_VAR_` lines, under spec 000's deny of all of `~/.config/h4reet-ai`;
  - `credentials.envVars` gains `TF_VAR_*`, `AWS_*`, `TF_CLI_ARGS*`, `GATEWAY_DB_URL`, the relay's host tokens (`RELAY_TOKEN_*`), the sink's token (`SNAPSHOT_SINK_TOKEN`), the telemetry block's token (`TELEMETRY_BLOCK_TOKEN`), and the shared state's role passwords (`DB_*_PASSWORD`). **As built:** by their members' names, since the sandbox takes names and a pattern there is unconfirmed: `TF_VAR_alert_email`, `TF_VAR_state_bucket_suffix`, `TF_VAR_server_budget_usd`; `TF_CLI_ARGS` and its per-command forms; the AWS credential and profile names spec 000 lacked; `RELAY_TOKEN_SELF`, `_LAPTOP`, `_EC2`; and `DB_GATEWAY_PASSWORD`, `DB_GRAFANA_RO_PASSWORD`, `DB_RELAY_RO_PASSWORD`, `DB_RELAY_RW_PASSWORD` (contracts/env-cloud.md §5). The bash gate also refuses `TF_CLI_ARGS` by name, and any terraform command while one is set;
  - `~/.config/h4reet-ai/{infra,tunnel,release}` get their own matrix rows; spec 000's deny already covers them.
- **`.claude/hooks/protected-paths.sh`:** `infra/**/{iam,budgets,alerts,killswitch,handover,failover,ec2-market,edge-limits}*.tf` and `infra/policy/**`. **As built:** by file name in any case, `.tf` or `.tf.json`, anywhere under `infra/` but `infra/test/`, whose fixtures Terraform never plans, and state, saved-plan, and variable files anywhere. Spec 000's broader names stay (`infra/*budget*`, `infra/*alert*`, `infra/*iam*`, `infra/*edge*`, `infra/*waf*`), so they also hold `infra/lambdas/alert_bridge/` (group 4, T035) and `infra/prod/edge.tf` (group 8, T107): those arrive as the Author's patches with P-I2 and P-I5, unless he narrows spec 000's names, a loosening that is his to choose (the note's "For the Author").
- **`tools/gates/`:** the policy, redaction, plan-note, and disclosure checks, and the gate's new steps, `infra-plan-note`, `infra-check` (the policy over the export, as data), and `disclosure`; `toolchain_check.py` reads spec 001's pins, each SKIP where its tool isn't installed. **As built, two departures:** the gate runs no `terraform` (its fmt and validate need the Author's mirror and run in `make infra-check`; his `make plan` runs init and plan anyway); and **the compose policy's host rules move** to the groups that add the host classes, as patches beside their P-I patches (group 5's `tunnel-end`, group 7's `ec2`), since no host class, `H4_HOST` key, or host env template exists yet to write or test them against.
- **`redteam/forbidden-actions.sh`:** a stage H row per spelling, with a gap row for any that gets through.
- **`CLAUDE.md`:** three sentences, in [§14](#14-the-authors-patches-steps-and-adrs), as their own patch, P-3. **As built:** shortened to fit CLAUDE.md's 6 KB cap (`evals/agent-config/static.py`, FR-006), which leaves main's file 170 bytes; the patch makes it 6143 of 6144.
- **`.devcontainer/toolchain.vars`:** the Terraform and AWS CLI pins. **As built,** on the branch, not in the patch: the file is agent-editable, and the branch's `toolchain_check.py` ignores keys it doesn't know until P-1 gives each its row.

## 3. Cost: the budgets, the actions, and the shared meter

### 3.1 The budgets (FR-021, FR-022; research.md R-22)

Applied first, in `infra/bootstrap/budgets.tf`:
- **`h4-model-month` and `h4-model-day`:** $20 and $5 on Bedrock's cost, with warnings at 70% ($14, $3.50) and alerts at 100%.
- **`h4-server-month`:** the Author's figure, on every cost but Bedrock's (from T150, every cost tagged `project = h4reet-ai` but Bedrock's; ADR 0047), with a warning at 70% and an alert at 100%.
- **The anomaly monitor,** with an immediate subscription to `h4-alerts`.

The Author sets the server budget's figure before this first apply: the state bucket itself is a resource the server budget covers (spec FR-021). It comes from group 2's measurement and his own pricing.

### 3.2 The two actions, and their rehearsals (FR-023, FR-026)

In `infra/account/killswitch.tf` (protected):
- **On `h4-model-month` at 100%:** attach `h4-deny-paid-models` to EC2's gateway role, `h4-prod-gateway`, and to `h4-laptop-bedrock`, an ordinary role that the laptop's permission set assumes. Never to a role Identity Center makes for a permission set, which Identity Center manages itself. The rehearsal's target, `h4-rehearsal-target`, is an ordinary role of the same shape. Both are to confirm in group 4 (research.md R-22, R-15).
- **On `h4-server-month` at 100%:** run `AWS-StopEC2Instance` on the tagged instance (to confirm the action type's form). The start function refuses while it is executed.
- **Rehearsals:** while `rehearsal = true`, two $0.01 budgets with the same actions, against a rehearsal role and a rehearsal instance. The Author starts the rehearsal instance before the trip, since stopping a stopped instance proves nothing, and the record keeps the SSM run's status. The record says when AWS evaluated, when each channel got the alert, and when each action took effect (SC-009). Then `rehearsal = false`.

The Author reverses either action after the seven-day incident note: `make server-budget-restore`, or the runbook's reverse command for the model action.

### 3.3 The shared meter (FR-017 to FR-020; research.md R-20; data-model.md §1)

- **RDS for PostgreSQL 17,** private, TLS-only, with deletion protection and 7 days of backups. Its master password is managed by RDS in Secrets Manager. **Replaced in W1** by Postgres 17 in a container on the tunnel end, the Author's answer of 2026-11-11, "Postgres in a container on the tunnel end": §16, "The shared state on the tunnel end", names each part that changes. The bullets below stand.
- **Both production gateways** connect as `gateway` with `H4_STACK=prod`, so they share the one `stack_state` row and the one set of meters.
- **Migration 0007** adds `host` to ledger and audit rows, and `handover_events`, `relay_ro`, `relay_rw`, and `v_handovers`.
- **Two writers:** the existing advisory locks and `SKIP LOCKED` hold; a new test proves admission and the rollover sweep with two gateways ([§10](#10-tests-and-proofs)).
- **Unknown is degraded** on each host and in the relay.
- **The move** follows data-model.md §1.5: nothing starts at zero.
- **No infrastructure on the meter** (FR-020). The `infra` attribution and its correction (September R-21) are gone.
- **The Anthropic API's own limit:** the Author sets the account's monthly spend limit at or under $20 where the account offers one, and the runbook records that it is set (FR-073; [§14](#14-the-authors-patches-steps-and-adrs)).

## 4. The tunnel end: the tunnel, the relay, and the sink

[contracts/tunnel.md](contracts/tunnel.md), [contracts/relay-http.md](contracts/relay-http.md), [contracts/public-view.md](contracts/public-view.md).

- **The instance** (research.md R-04): `t4g.micro`, a persistent spot request stopping on interruption (question 2; [What the answers change](#what-the-answers-change-in-this-plan)). **From W1** it also runs the shared state, `shared-state`, on a data volume of its own, so its type is the smallest that holds five services, likely `t4g.small`, measured before W1's plan blocks (§16, "The shared state on the tunnel end"; tasks.md T166). It has two interfaces: a private one for CloudFront's VPC origin, and a public one with an Elastic IP for the tunnel's port and the health port. Amazon Linux 2023, IMDSv2 with hop limit 1, operator access through Systems Manager only. It runs the compose file with `H4_HOST=tunnel-end` and the `tunnel-end` profile:

  | Service | What it does | Limit (to measure, research.md R-33, once groups 5 and 8 build it: §16) |
  |---|---|---|
  | `tunnel-end` | OpenSSH's server: permits exactly the forwards in research.md R-11, no shell | 32 MiB |
  | `relay` | the Author's answer to question 1: the edge listener on the private interface, the host choice, the cap, the kill-switch read, the status | 128 MiB (96 until T166's run, §16) |
  | `snapshot-sink` | merges the serving host's panels with the cloud part, and writes the public view | 48 MiB |
  | `otel-collector` | file-backed queue; routes the relay's telemetry to the serving host's collector (research.md R-25) | 128 MiB (96 until T166's run, §16) |
  | `shared-state` (from W1) | Postgres 17: prod's meter and kill switch, for both hosts and the relay (§16, "The shared state on the tunnel end") | to measure (T166); spec 000's `gateway-state` limit is 256 MiB, and its peak on dev-cpu was 55.3 MiB (research.md R-33) |

- **Its host services:** the deployer, the egress proxy, and the credential timer, as September §6.
- **The tunnel** (research.md R-11): the laptop's `tunnel` service in the `tunnel` profile, unprivileged. Three reverse forwards: the relay block, the telemetry block, and the health block. Two local forwards: the shared state and the snapshot sink. Keys from `make tunnel-keys`; revocation in one action.
- **The hosts' blocks** (research.md R-12): 8085, the relay block, on both hosts, behind a bearer token per host; 8086, telemetry in, on the laptop; 8087, health, on the laptop, unauthenticated and status-only.

## 5. The hosts: EC2 and the laptop

### 5.1 EC2 (FR-043, FR-044, FR-050, FR-069; research.md R-04, R-30)

- **The launch template:** the type group 2 measures; spot, persistent, `instance_interruption_behavior = "stop"`; standard credits if burstable; IMDSv2, hop limit 1; encrypted gp3 root and data volumes, kept while stopped.
- **The network:** one interface in a public subnet, with an address assigned at each start, used for egress through the proxy only (research.md R-10). The security group admits the relay block's port from the tunnel end's security group, and nothing else.
- **cloud-init and its host script:** Docker and the pinned Compose plugin; the egress proxy, the deployer, and the credential timer. `write_env.py` writes the env file from Parameter Store to tmpfs (the Anthropic key, the role passwords, the relay's token for EC2) and checks IMDSv2's instance tag before preflight (research.md R-28).
- **What it runs** (`H4_HOST=ec2`; data-model.md §2.2): the whole topology but the model server (`gateway`, `edge`, `web`, `otel-collector`, Prometheus, Loki, Grafana, and Langfuse and its four stores), and no local `gateway-state`, since the meter is the shared state on the tunnel end (RDS until W1). Preflight's rule "exactly one of `gpu` and `cpu`" becomes "neither" for the `ec2` class.
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

All three are in `infra/account/handover.tf` (protected). **From W1** (§16, "No root holds another root's instance or health-check ID"): the functions, their roles, the autostart switch, `h4-laptop-away-rule`, and the hours' two schedules stay in `infra/account/handover.tf`; the rules that name an instance move to `infra/prod/handover.tf`, the alarm to `infra/prod/failover.tf`, and the server action to `infra/prod/killswitch.tf`. **The hours** (ADR 0048, proposed): the start function also refuses `outside_hours`, and the guard also stops EC2 outside them, `ec2_stopped_outside_hours`, on `running` and at the hours' close.

**The operator's commands** are research.md R-32's: `make ec2-status`, `ec2-start`, `ec2-stop`, `ec2-autostart`, `operator-* ENV=shared`, `cloud-session`, and `server-budget-restore`. Each writes an audit record. `ENV=shared` uses the laptop prod's own admin listener while that prod runs, and otherwise starts an admin-only stack on the laptop that can't take visitors, so the two never hold port 18003 together (FR-074). `make operator-restore ENV=shared` marks a restored store uninitialized, so that `operator-init` can confirm its values (contracts/shared-state.md §8).

**Nothing writes configuration at run time** (FR-072): the functions and the loop change EC2's running state only, and the relay's choice is in memory and in `handover_events`. A plan from the same commit after a handover shows no change (spec User Story 1, scenario 10).

## 8. The edge, the site, and the disclosure

### 8.1 The edge (FR-027 to FR-029, FR-034, FR-066; research.md R-07, R-08, R-09)

[contracts/edge.md](contracts/edge.md).
- **The zone and the certificate:** the hareet.ai zone in Route 53. The Author points the registrar's name servers at it, a recorded human step. ACM's certificate covers `hareet.ai` and `www.hareet.ai`, validated by DNS.
- **The distribution** has two behaviors:
  - `/api/*` goes to the VPC origin on the tunnel end's private interface, its primary since B-6's option C (the relay, question 1; §16, "B-6: option C, and the VPC origin from W1"), with `CachingDisabled` and `CloudFront-Viewer-Address` forwarded;
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
| Constitution Check, Cloud standard | the relay runs around the clock on spot; its gap against "must be always-on" is question 8, provisionally option A at T000, its wording his at T001 |
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
| P-I1 to P-I7 | The protected Terraform files, one patch per group that has any (tasks.md). P-I7 is group 6's, which had no protected file until the shared state moved to the tunnel end (its bucket and Parameter Store grants in prod's `iam.tf`), numbered after P-I6 so that no other patch is renamed. From W1, P-I3 also carries `h4-alerts`' two publishers in `infra/bootstrap/alerts.tf` and the account's two new alarms (§16, W1's departure 4) | in their groups; W1's applied together, before W1's gate |
| P-G1 | The policy's list of taggable types, `TAGGABLE` in `tools/gates/infra_policy.py`, gains `aws_budgets_budget_action`, `aws_sqs_queue`, and `aws_ssoadmin_permission_set`, with its tests (tasks.md T158) | W1, before its gate |
| P-G2 | The guards for W1's new Author-only targets, `make shared-state-tls` and `make shared-state-restore`: their rules in `.claude/hooks/bash-gate.sh`, and their rows in `redteam/forbidden-actions.sh` and `tools/gates/matrix-required.txt`, in every spelling the gate covers (tasks.md T165) | W1, before its gate |
| P-G3 | The compose policy's host classes, in `tools/gates/compose_policy.py` and its tests: the laptop's `tunnel` on egress with its keys' bind; the tunnel end's `tunnel-end` publishing exactly its two ports on its public interface's fixed address, from the edge bridge, with its keys' bind; the tunnel end's collector on egress; a cloud class's images from the account's registry; the tunnel end's env template rendered too (§16, group 5's departure 5; tasks.md T044, T049) | W1, before its gate |
| P-G4 | The compose policy's shared state, after P-G3, in `tools/gates/compose_policy.py` and its tests: the tunnel end's `shared-state` on the edge bridge, publishing exactly `10.42.1.10:5432`, its key and certificate's tmpfs bind read-only and its data volume's mount writable, and gateway-state's Postgres copied to its own repository, `h4reet/shared-state` (§16, group 6's departure 11; tasks.md T163, T164) | W1, before its gate |
| P-G5 | The compose policy's `ec2` class, after P-G4, in `tools/gates/compose_policy.py` and its tests: EC2's env file's template among the files it reads; `ec2-relay-block` on the edge bridge, publishing exactly `10.42.0.20:8085` and `:4318` in the `ec2` profile alone, edge's image copied by the lock's pin; a shared service's EC2 override, `${H4_IMAGE_<SERVICE>:-<pin>}`, its own service's variable alone; and no env file naming an `H4_IMAGE_` key (§16, "Group 7, as built", 2) | W1, before its gate |
| P-W2 | The switch-on: `local.wired = true` in `infra/account/handover.tf` and `infra/prod/handover.tf` (§16, "Four gates") | W2, after W1's applies |

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
| 0048, in W1's first commit | EC2 on 12 hours a day: two schedules that invoke the start function and the guard, and the hours as a check in both (FR-069: "by the Author's patch, with an ADR") | R-04, R-05, R-29, R-30; §16 |
| 0049, in W1's first commit | What names an instance lives in that instance's root (amends ADR 0007's decision 2) | R-02, R-15, R-22; §16 |

ADR numbers come from the index when T007 runs: 0043 is spec 005's and 0044 is ADR 0044. ADR 0044 amends ADR 0001; the route-per-host ADR extends it.

## 15. Cost lines

research.md R-05 has the table, each line with its repository figure and date, or marked to price. In short:
- **Model spend** is spec 010's estimate and the meter's ceilings, both hosts together.
- **The server budget** covers EC2 (running on spot; its volumes running or stopped; its address while running), the tunnel end (instance, Elastic IP, root volume; from W1, its larger type and the shared state's data volume), the shared state's backups (RDS's instance, storage, and secret until W1), Route 53 (the zone and the health check), CloudWatch alarms, S3, ECR, and AWS's free or near-free services.
- **The Author prices it** from group 2's measurement and sets the figure before group 3's apply.
- **Measured** by SC-002 and SC-003, and on the dashboard.

## 16. Order of work, risks, and proof

**Before any group:** T000, his approval (2026-11-10), and T001, his constitution patch (P-2, 1.1.0 as amended, with his question 8 wording under option A, provisional), as the default order. Every group that touches `infra/` (3 to 9) checks T001's result first. **The named deviation:** his approval's "build it out … you can have everything ready and verified by then" has group 1 built before T001; group 1 writes nothing under `infra/`, and nothing merges or is applied before T001 (spec.md Assumptions). The main session extended it to group 3 on 2026-11-10, as its reading of the same words: group 3's check found T001 unmet, and its agent work is built anyway, with nothing merged or applied before T001 (spec.md Assumptions; tasks.md, group 3's precondition). It extended it to group 4 the same day, the same way (tasks.md, group 4's precondition). T001 is done (3c89a8b0).

**Task groups.** Each is a feature branch with a note, built in this order. Since 2026-11-11 they merge through four gates, not eleven: groups 1 to 4 are gate A ("Groups 1 to 4, as one branch", below), groups 5 to 10 are W1, the switch-on is W2, and group 11 is Close ("Four gates", after the table).

| # | Branch | What | The Author's part |
|---|---|---|---|
| 1 | `feat/001-guards` | P-1 and P-3; the ADRs; the Terraform pin | choose the pins; apply P-1 and P-3 on the branch, gate, merge; seed the mirror on `main` |
| 2 | `feat/001-measure` | research.md R-33: the stack's memory without the model server on dev-cpu; the tunnel end's; every image's architectures; the disks | price the lines from AWS's pages and **set the server budget's figure** (spec question 14), on the branch before its review; gate, merge |
| 3 | `feat/001-us1-bootstrap` | `infra/bootstrap`: state, the three budgets, the anomaly monitor, the topic; the plan and apply targets; the credential audit's script | the plan block; P-I1, gate, merge; on `main`, verify, apply, record; migrate the state; the cost tags; the email subscription |
| 4 | `feat/001-us2-safety-net` | `infra/account`: the laptop's Bedrock permission set imported and narrowed to `sts:AssumeRole` on `h4-laptop-bedrock`, the ordinary role that holds Bedrock; the model action on that role, and both actions' rehearsals against targets of the same shape (the server action itself waits for EC2, group 7); the alert bridge, the probe (its schedule disabled until group 8's P-I5), the credential audit, and both schedules in the protected `alerts.tf`; the registry and the release bucket | the plan block; P-I2, gate, merge; on `main`, apply with the import; the laptop's Bedrock profile; the Telegram parameters; **the rehearsals (SC-009)**; `rehearsal = false` |
| 5 | `feat/001-tunnel-end` | `infra/prod`'s network and the tunnel end, on spot with stop, and its interruption warning's rule; the `tunnel` and `tunnel-end` images; the laptop `edge`'s three blocks; the tunnel end's deployer, egress proxy, and collector; the tunnel's and the collector's panels | the plan block; P-I3, gate, merge; on `main`, apply; `make tunnel-keys`; start the tunnel; **SC-006** |
| 6 | `feat/001-shared-state` | the placeholder gate over every host route, test-first; the shared state, Postgres on the tunnel end (RDS until W1's regrouping); migration 0007; the gateway's `H4_HOST`, routes per host with the laptop's line only, R1, TLS to the store; the two-gateways test; `operator-* ENV=shared`; the shared state's panel | the plan block; gate, merge; on `main`, apply; the role passwords; **the move** (data-model.md §1.5); the laptop's prod on the shared state |
| 7 | `feat/001-us6-ec2` | EC2 (spot, stop), its roles, env, host scripts, egress proxy, and deployer; the model action gains EC2's gateway role, and the server action is added; multi-architecture releases; EC2's relay block; the release panel | the plan block; P-I4 and **EC2's route line** (`ec2: { first: anthropic, second: bedrock }`, his own commit, ADR 0041), gate, merge; on `main`, apply; the secrets; the Anthropic account's limit; the first release; **SC-005, SC-017** |
| 8 | `feat/001-us3-us5-edge` | P-6 drafted first; the zone, the certificate, CloudFront and its VPC origin; the relay on the tunnel end; the site; the disclosure's rows; red-team on four adapters; the edge's body; spec 002's contract §3, amended by name; the relay's panels | the plan block; P-6 with his figures, P-I5 (CloudFront's policies, and the line that enables the probe's schedule), gate, merge; on `main`, the name servers; apply; the red-team runs; the site stays unannounced until group 9 ends |
| 9 | `feat/001-us4-us7-handover` | the health check, the alarm, the rules (the tunnel end's return among them), `h4-ec2-start`, `h4-ec2-guard` (three stops), the autostart switch, EC2's spot warning; `h4-handover`; `make ec2-*`; the sink's cloud reads as metrics; the handover's and the server budget's panels | the plan block; P-I6, gate, merge; on `main`, apply; **10 handovers each way (SC-007); rehearsed interruptions, 5 of EC2 and 3 of the tunnel end (SC-018)**; the first public release; **SC-001, SC-010, SC-011** |
| 10 | `feat/001-us8-public-view` | the publishers, the sink's document, and `/status/` | gate, merge; **SC-013**: both hosts off for an hour |
| 11 | `feat/001-close` | the success-criteria table; runbooks completed; the README and the ADR index | gate, merge; **SC-002, SC-003, SC-016** after the first full month; **SC-004**; **SC-012**; **SC-014** |

The Author's part in groups 5 to 10 now runs once for all of W1: one plan block per root, one gate, one merge, then the applies in order. Each group's steps on `main` follow in the order tasks.md's "Dependencies" gives, split between W1 and W2 as below.

**Four gates** (2026-11-11; regrouped in W1's first commit, 2026-11-12). The Author's answers: "Let's do the least amount of gates as possible", then "4 gates in all (Recommended)", and, on building later groups in parallel, "Might as well do it in our original order" (spec.md Assumptions, "Four gates for spec 001"). So:

| Gate | Holds | What the Author applies after its merge |
|---|---|---|
| A | groups 1 to 4, `feat/001-cloud-elevation-p`, and the fixes that followed it: `fix/001-shared-account-p`, `fix/001-action-tags-p`, `feat/001-rehearsal-on-p` | the bootstrap and the account, 2026-11-12 (`docs/infra/applies/`); T040's rehearsal, in progress |
| W1 | groups 5 to 10, built in his "original order", each on a branch stacked on the one before, from this regrouping commit (`spec/001-w1-regroup`). One gate, of his `-p` copy of group 10's tip, with W1's patches: P-I3 to P-I7, P-6 with his figures, P-G1, P-G2, and his route line | the bootstrap, then the account, then prod: everything that needs no apply of W1's own |
| W2 | his switch-on patch, P-W2, and the new functions' image digests, planned after W1's applies | prod, then the account: what W1's applies made possible ("W2's order", below) |
| Close | group 11, and the records of W2's applies, the rehearsals, and the success criteria | none |

**Why a switch.** A plan block is made before its gate, and its gate before its applies. So W1's blocks, one per root, are all made at W1's tree before any of W1's applies, and a resource in W1 can't read, or need at apply time, what another of W1's applies makes. Such a resource is written in W1 behind one switch per root, `count = local.wired ? 1 : 0`. `local.wired` is `false` in W1, and sits in that root's protected `handover.tf`, so only the Author's P-W2 sets it `true`. W2's blocks are made after W1's applies, so they can read them. The tests read the tree's state, as the rehearsal's do (group 4's departure 4): each switched resource's checks pass with the switch off and with it on.

| Waits in W1 behind the switch | Why it can't come in W1 | Root |
|---|---|---|
| `h4-ec2-start` and `h4-ec2-guard`, their permissions, and the two schedules of the hours (below) | a function is made only once `local.lambda_images` names its digest, and its image is pushed to the repository W1's account apply makes (group 4's departure 3) | account |
| `h4-laptop-away-rule`, and the function targets of `h4-ec2-running` and `h4-tunnel-end-running` | their targets are those functions | account; prod |
| the certificate, its validation, CloudFront's distribution and VPC origin, the alias records, and the site's and the public view's bucket policies | ACM issues the certificate only once the registrar's name servers point at the zone, and W1's prod apply makes the zone (T115). The bucket policies' `aws:SourceArn` is the distribution's | prod |
| the probe's schedule enabled, and the probe's alarm (group 4's departure 2) | the probe checks hareet.ai, which answers only after the row above; an alarm that reads missing data as breaching would page meanwhile | account |
| EC2's replacement for SC-005, `local.ec2_generation` from 1 to 2 (T097) | it needs a first EC2 with a release, and a shared state that holds the moved meters | prod |

One resource runs the other way, `count = local.wired ? 0 : 1`: `aws_ec2_instance_state.ec2_w1`, `state = "stopped"`, in `infra/prod/ec2.tf`. W1's apply makes EC2 stopped. W2 drops the resource, and dropping it leaves the instance as it is (to confirm in W2's plan; spec.md Assumptions, "From W1 to W2"). So no plan after W2 holds a running state that would fight the start function and the guard (FR-072).

**Neither direction reads the other in W1.** The account's W1 block reads nothing of prod's, and prod's W1 block reads nothing the account's W1 apply makes. Prod names the account's new repositories only by their name-built ARNs, in its roles' pull grants. T046 checks both directions.

**No root holds another root's instance or health-check ID.** Groups 5, 7, and 9 put EC2's and the tunnel end's IDs in `infra/account`: the server action's instance, the four instance rules' filters, and the alarm's health check. A switch alone wouldn't save them. Replacing EC2 for SC-005, or moving the tunnel end to another zone as its runbook does, would leave the account's references on a gone instance, and only a second account plan, made after the replace's apply, could mend that; no gate can hold that plan. So each such resource moves to `infra/prod`, beside what it names, in a protected file, where the replace's own plan updates it:
- the server action and its execution role: `infra/prod/killswitch.tf`;
- a second model action on `h4-model-month`, by its name, attaching `h4-deny-paid-models` to `h4-prod-gateway`, with its own execution role: `infra/prod/killswitch.tf`, made in the same apply as the role (W1's departure 10);
- `h4-laptop-away`, the health check's alarm: `infra/prod/failover.tf`, beside the check;
- `h4-ec2-spot-warning`, `h4-ec2-running`, `h4-tunnel-end-spot-warning`, and `h4-tunnel-end-running`: `infra/prod/handover.tf`;
- `/h4reet/prod/ec2-instance-id`, a String parameter holding EC2's ID: `infra/prod/handover.tf`.

The account keeps the functions, their roles and permissions, the autostart switch, the schedules, and `h4-laptop-away-rule`, which matches the alarm by its name. At run time the functions:
- read the laptop's serving from `h4-laptop-away`, by its name-built ARN, since Route 53's health checks can't be scoped by tag in IAM;
- read EC2's ID from the parameter;
- find the tunnel end by its tag (R-15, amended).

Between roots, a reference is a fixed name only: a function's, a rule's, an alarm's, a role's, a budget's, a topic's, a parameter's. R-02's reason for the account root holds: the functions and their IAM still don't share a root with the instances they act on. This amends ADR 0007's decision 2, which is accepted, so it comes with [ADR 0049](../../docs/adr/0049-what-names-an-instance-lives-in-its-root.md), proposed (spec.md Assumptions, "The roots, amended"). The contracts and research entries that held the old placement are amended to match: contracts/aws-alerts.md §4 and §5, contracts/handover.md §2 to §4, and research.md R-02, R-15, and R-22.

**What W1 applies, and in what order.** Everything else in groups 5 to 10:
- the network; the tunnel end and the shared state; EC2, made stopped, with the server action and EC2's model action;
- the health check and its alarm; the zone; the site's and the public view's buckets, without their policies; CloudFront's policies; the VPC origin to the tunnel end ("B-6: option C, and the VPC origin from W1", below); and the rules that publish straight to `h4-alerts`.

The bootstrap goes first, since `h4-alerts` must let CloudWatch alarms and EventBridge publish before W1's alarms and rules exist (T160). Then the account, with its new roles, alarms, and repositories:
- `stack["tunnel"]`, `stack["relay"]`, and `stack["snapshot"]` (T051);
- `stack["shared-state"]`, the Postgres image's copy (T164);
- `lambda["h4-ec2-start"]` and `lambda["h4-ec2-guard"]` (T122).

Then prod.

**Between W1's applies and W2's** (spec.md Assumptions, "From W1 to W2"; the note's question 9). W1's apply makes EC2 stopped. The start function, the guard, and the hours are W2's, so until then EC2 starts only by the Author's hand, inside the hours, for W1's checks: SC-017's recorded run (T097) and the red-team runs (T115). He stops it after them with `make ec2-stop`, whose permission set is W1's. The server action, and the model action on `h4-prod-gateway`, are W1's, so FR-021's and FR-023's safety nets hold. Nothing is public until W2's apply and T134: the zone answers nothing, and hello and the twin aren't reachable.

**W2's order: prod, then the account.** The account's W2 apply enables the probe, which checks the site. Prod's W2 apply makes the site: the certificate, the distribution, and the records (W1 made the VPC origin). So prod goes first, then a release with `SITE_BUCKET=` and `DISTRIBUTION=`, which puts the site in the bucket the distribution serves (group 8's review B, nit 5), and then the account, so the probe starts against a site that answers. That works only because of the cross-root names:
- prod's rule targets name the account's functions by their name-built ARNs;
- the account's permissions name prod's rules the same way.

Neither is read at plan time. Whether EventBridge accepts a target whose function doesn't exist yet is to confirm in W2's apply. If it refuses, the account's apply goes first, and the probe's alarm during prod's apply is expected and recorded (T178).

**B-6: option C, and the VPC origin from W1** (2026-11-12; the Author's answers, relayed by the main session: "Yes w1 can create the vpc origin", and for B-6, "We aren't building option A, we went with Option C"; the B-6 decision is C, and A isn't built). Both are W1's, before its apply, since moving the tunnel end's primary interface after it would replace the instance:
1. **The private interface is the tunnel end's primary,** device 0 (P-I3's `ec2-market.tf`, one line), so the instance sits in the private subnet, AWS's documented layout for a VPC origin's instance, and the origin reaches `10.42.1.10`, where the relay publishes 8080. The public interface, `10.42.0.10` with the Elastic IP, is attached as device 1 (`aws_network_interface_attachment.tunnel_end_public`); an Elastic IP is associated with an interface and its address, so it holds on a second interface as on a first. The relay's origin is the instance's private DNS name, now the private interface's. B-6's strict xfail loses its marker.
2. **The host's way out stays the public interface.** The private subnet has no route out, and amazon-ec2-net-utils gives device 0 the lowest default-route metric (512, to confirm at T058). A systemd-networkd drop-in in the user data, `deploy/hosts/tunnel-end/networkd/zz-h4-public-first.conf` at `/etc/systemd/network/70-ens6.network.d/` (named to sort last, the review of 59dfdc4a, nit 3), gives the public interface's default route metric 100, so the egress proxy's 443 (Session Manager's and the image pulls') leaves by it; Route 53's and the laptop's connections arrive on the Elastic IP and answer from it.
3. **The first boot waits for the public interface,** which Terraform attaches once the instance runs: cloud-init's runcmd waits for `ens6`, reloads networkd, waits for its default route (5 minutes each at most), then installs docker and nftables with `dnf`, which the `packages:` module did before it could wait; then the filter, as before.
4. **nftables' names swap:** on Nitro the private interface, device 0, is `ens5`, and the public one `ens6` (to confirm at T058; docs/runbooks/tunnel-end.md, "The interfaces and the way out (T058)"). Compose publishes each port on its address, so no port moves and nothing new listens on the public interface; the private group's 2301 and 5432 stay EC2's alone.
5. **The VPC origin is made in W1, unswitched** (P-I5): CloudFront makes its VPC origins' own group, `CloudFront-VPCOrigins-Service-SG`, once an origin exists. Under C the private group's 8080, from CloudFront's origin-facing prefix list, is a source AWS documents for a VPC origin, so W2 needs no group change and one phase. Everything else of the relay's path stays behind the switch: the certificate, its validation, the distribution, its records. Nothing sends through the origin until W2's distribution. Whether a VPC origin takes a stopped instance is unknown from here; prod's W1 apply creates it right after the instance, so it is running then, and W1's note names it as a thing to watch. **The source, cited** (the review of 59dfdc4a, I2): AWS's CloudFront guide, "Restrict access with VPC origins" (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html), documents CloudFront's origin-facing managed prefix list as an allowed source for a VPC origin's security group, and says that once the origin exists the source can be narrowed to the `CloudFront-VPCOrigins-Service-SG` group. The fallback, in tasks.md T176: if W2's `/api/*` answers 503 for want of the origin's reach, a second-phase rule from `CloudFront-VPCOrigins-Service-SG` goes in, behind the switch. **As the deploy found it: fix F1 departs from this item** (`fixes/f1.md`, with its rework). W2's deploy needed the fallback. `/api/*` didn't reach the relay until the Author added 8080 from `CloudFront-VPCOrigins-Service-SG` by hand (`sgr-0aa7b8f4927baa380`): the VPC origin connects from that group, not from the prefix list's addresses. The private group's rules are inline, so the next apply would remove his rule. F1 codifies it as a second inline 8080 ingress in `aws_security_group.tunnel_end_private`, from `data.aws_security_group.cloudfront_vpc_origins`, read by name in prod's VPC at plan time. It isn't behind a switch, and it isn't a second phase. `local.wired` is true from W2 for good, and the group has existed in prod's VPC since W1's origin, so T176's second phase has nothing left to wait for. The read has no `depends_on`. A wait on the VPC origin closes a cycle, which Terraform refuses (`Error: Cycle`): the origin targets the tunnel end, whose primary interface holds the private group, whose rule names the read (F1's rework, R-1). The prefix-list rule stays until the Author decides it (night 5's Q2), though it admits nothing that can arrive. The group's name, description, and VPC stay as applied, so the plan changes the rule in place. **A rebuild from nothing (unwritten input: F1's backlog).** CloudFront makes the group only when the VPC origin is created. The origin needs the tunnel end, the tunnel end its private interface, the interface the private group, and the group now the read. So with no VPC, the read is left to the apply, made right after the VPC, and finds no group: the apply stops there. A plan in which the origin is gone and the group with it (whether CloudFront deletes the group with its last origin is unknown from here) fails at the read. The way round: a first apply from a copy without the read and its 8080 ingress (the origin's creation makes the group), then an apply from the tree as committed, which adds the rule in place. Or, before any rebuild, T176's switch, written as this item first had it.
6. **EC2's replies leave by the interface they came in on** (the review of 59dfdc4a, I1; it predates C). EC2, at `10.42.0.20` in the public subnet, reaches the shared state's 5432 and the sink's 2301 on `10.42.1.10`, so it arrives on `ens5`; without a route, the reply would leave by `ens6`'s connected `10.42.0.0/24` with the private address as its source, which the interface's source/dest check drops. A drop-in for `ens5`, `zz-h4-ec2-route.conf`, holds one host route to `10.42.0.20/32` by its DHCP gateway, and changes nothing else.
7. **The first boot's chain:** runcmd reconfigures both interfaces, and its route waits (`10.42.0.20` by `ens5`, 60 s at most, the review of b78e3492, N2; the default by `ens6`), `dnf`, and `nft -f` are one chain ending in `|| exit 1`, so a missing route fails cloud-init rather than running on (nit 3). The template's header comment moved into `tunnel-end.tf`, so the user data, with both drop-ins and the second wait, is 14,134 bytes gzipped, under the test's 14,400.
8. **A tunnel-end replace and the VPC origin** (nit 5): a replace changes the origin's target ARN; once W2's distribution uses the origin, that may plan as the origin's replace, about 15 minutes, or be refused while it is in use. Each plan after a host-file change, or an OS update, is read for it (the note's step 10; docs/runbooks/tunnel-end.md, "An OS update, or a changed host file").

**W1's answers** (2026-11-12, relayed by the main session; the note's step 1). The Author's words: "W1 answers: 1a A, 1b A, 2 A, 3 A, 4 A, W-9 A, B-3 A, G10-1 A, G10-2 A, G10-3 A". Each is the option built, so the code is unchanged: T169's amendments are applied to spec.md, contracts/handover.md §3 and §4, and research.md R-29 and R-30, each marked "(amended; ADR 0048)"; question 4's backups are confirmed as built; and the "provisional" marks for these questions are gone from the code's comments, the note's tables, and this section. 1b's option A is T170: the status document carries EC2's hours in their zone, read from the two schedules, test-first. ADR 0048 and ADR 0049 stay proposed: an ADR's acceptance is recorded by the Author's own merge or commit, as the index's other rows show. **Corrected** (the review of 59dfdc4a, I3): the T169 draft put "the hours' scheduled starts and stops, by outcome (contracts/handover.md §10)" under FR-059, the public view, in error; question 3's answer is "recorded and on the dashboard", the operator's Hosts row, so the bullet is FR-065's dashboard clause's, and FR-065's amended sentence now reads whole (nit 1).

**T170: /status/ alone, a named deviation from 1b's wording** (2026-11-13). Question 1b's option A reads "A: /status/ and the status answer show them in their zone", and the Author answered "1b A". Asked where the relay's status answer would get the hours without a second copy (data flows only from the relay to the sink), he answered "Only /status/ (Recommended)". So the public view's document carries `ec2_hours`, which the sink's write reads from the two schedules, and `/status/` shows them; the relay's status answer doesn't (spec.md Assumptions, "EC2 on 12 hours a day"). The read's grant, `scheduler:GetSchedule` on the two schedules, is P-I6's, not P-I3's as first planned: the sink's other dashboard reads are P-I6's, P-I6 is the last patch on prod's `iam.tf`, so no later patch moves, and it is a policy of its own, `tunnel-end-hours`, so the role's fixtures that replace the main document still each name one defect. Both departures, P-I6 for the grant and "/status/ only", were recorded here in the docs commit after the GREEN (ab8d9e85, after 1354302c), not in the GREEN itself. **Until W2 makes the schedules,** each write's hours read fails: the sink counts `h4.sink.read_errors{read="hours"}` every 2 minutes, and `/status/` says EC2's hours are unknown; both are expected until W2's account apply.

**Found by T166's dry run, on the Author's engine** (2026-11-13): BuildKit makes a missing destination directory with a `COPY --chmod`'s own mode, so `deploy/snapshot/Dockerfile`'s `COPY --chmod=0644 … /app/` left `/app` at 0644, which user 10001 couldn't enter ("python3: can't open file '/app/snapshot_sink.py': [Errno 13] Permission denied"), and `deploy/tunnel/Dockerfile` did the same to `/etc/ssh/h4/`. Both images ship, and neither was on main. Each makes its directory first now (WORKDIR, `install -d`), and `deploy/scripts/test_dockerfile_dirs.py` holds every Dockerfile in the tree to it. The same run found the harness's lost error (it printed compose's first stderr line, an interpolation warning), the take-down that skipped the `tunnel-end` profile, and measure-keys' `chown` before its `chmod`; each is fixed, test-first (53d2a842, 5b178699).

**W1's departures** (tasks.md, Organization; the note `docs/merge-requests/2026-11-13-spec-001-w1-regroup.md`):
1. **One gate for groups 5 to 10,** and one plan block per root, at W1's tree, made from a scratch clone of his `-p` branch with all of W1's patches committed (T171). Each group keeps its own review, by an agent that wrote none of it, as gate A's groups did. Tasks T055, T057, T077, T079, T093, T095's gate, T112, T114's gate, T129, T131, and T140 become W1's T171 and T172.
2. **The switch,** above. T112's certificate, distribution, records, bucket policies, and probe, and T129's functions, schedules, and function targets wait for W2's blocks (T176).
3. **The ID rule,** above. T055's warning rule, T093's server action, and T129's alarm and instance rules move from `infra/account` to `infra/prod`, in W1's prod block. The contracts and research entries are amended in this commit (contracts/aws-alerts.md §4 and §5; contracts/handover.md §2 to §4; research.md R-02, R-15, and R-22), and ADR 0049 amends ADR 0007's decision 2.
4. **The bootstrap root is in W1.** Group 4's departure 2 put `h4-alerts`' CloudWatch publisher in group 8. W1's first alarms, the credential audit's (T159), come earlier, and the tunnel end's warning rule publishes through EventBridge. So `infra/bootstrap/alerts.tf` gains both publishers, for this account alone, in P-I3, and the bootstrap has a block in W1.
5. **The zone before the name servers** (T115). W1 makes the zone; the Author points the registrar's name servers at it and records it; W2 makes the certificate and waits for its validation, which then resolves.
6. **EC2's destroy-and-recreate is a reviewed change** (T097). `infra/prod/ec2.tf` gains `terraform_data.ec2_generation`, from `local.ec2_generation`, and EC2's `replace_triggered_by` names it. W2 sets the local to 2, so W2's prod block shows the replace, and SC-005 is checked after W2's apply. A `-replace` plan of an unchanged tree couldn't pass `make infra-verify`, since no note can hold a second block for the same tree (group 4's departure 4).
7. **The tunnel end is measured before W1's blocks** (T166), since its instance type is in prod's block. Group 2's departure 5 and T115 had it after group 8's apply.
8. **W1's blocks wait for the session's next branch:** `rehearsal = false` and the bootstrap's state in S3 (T040 step 6; group 3's departure 4), so that W1's tree holds both.
9. **The backlog of gate A,** as tasks: T027's `metrics` finding (beside T027); the account tests' tag check over `aws_sqs_queue` and `aws_ssoadmin_permission_set` (T157); the policy's own list (P-G1, the Author's, T158); the credential audit's Errors alarm and the alert bridge's failure queue alarm (T159, in P-I3); and T154, EC2's tagged volumes and address, in group 7.
10. **A model action for EC2's role, in prod** (FR-023; T180; the note's question 8, taken on its recommended option). The account's model action reaches only `h4-laptop-bedrock`. Given a second target behind W2's switch, `h4-prod-gateway` would hold `bedrock:InvokeModel*` beyond any action from W1's prod apply until W2's. So W1 adds a second action on `h4-model-month`, by name, in `infra/prod/killswitch.tf`, with its own execution role. The account's model action gains no target. Whether one budget may hold two actions of a type is to confirm in W1's prod apply, since a plan never calls Budgets; if it may not, the apply fails at that action, EC2 is checked stopped, and the fallback is the switched second target (`docs/runbooks/aws-budget-action.md`, "A partly failed apply").
11. **EC2 is made stopped in W1** (spec.md Assumptions, "From W1 to W2"; T089; the note's question 9, taken on its recommended option): `aws_ec2_instance_state.ec2_w1`, behind `!local.wired`. Before this, EC2 would have run from its creation until his first stop.
12. **W2 applies prod before the account** ("W2's order", above).
13. **A replace can leave the spot request open** (T097; the note's question 10, taken on its recommended option). After W2's apply, the runbook cancels the old instance's spot request and checks that one instance carries `h4-prod-ec2`. The guard stops any running tagged instance that `/h4reet/prod/ec2-instance-id` doesn't name, and alerts `ec2_unrecognised_instance` (contracts/handover.md §4, amended). Whether the provider cancels the request when it destroys the instance is to confirm in W2's plan and apply.
14. **New Author-only targets get their guards first** (T165, P-G2). `make shared-state-tls` and `make shared-state-restore` are new; each needs its bash-gate rule and its matrix rows in a patch for his hand before W1's gate.

**W2, as built: its departures** (tasks.md T174 to T178; the note `docs/merge-requests/2026-11-13-feat-001-w2.md`). W2's branch is stacked on W1's tip (0bf73883) and built before W1's applies, as far as it can go; the digests wait for T174, and its plan blocks for W1's applies (T176):
1. **The digests' placeholder is `""`, named in a comment** (T175). `infra/account/main.tf`'s two new slots, `ec2_start` and `ec2_guard`, hold `""`, the one form `handover.tf`'s preconditions refuse (`local.lambda_images.<key> != ""`), so with P-W2's switch on no plan runs until T174's digests are written. A named placeholder string would pass that precondition and reach the plan as an image URI, so the name is in the comment beside each slot. A test holds each slot to `""` or an image digest, `sha256:` and 64 hex.
2. **The switch tests read "off" by hand.** The tests read P-W2 as the patch leaves the tree (`infra/test/patches.py`, which now names W2's patches after W1's five), so the tree reads both switches on. Each "off and on" test (T046, T084, T104, T119) reads the "off" half through `switched_off`, beside `switched_on`; W1's `test_w1_holds_both_switches_off` is now `test_w2_holds_both_switches_on`, `is True`.
3. **The site's sync, its partial failures** (group 8's review B, nit 1; contracts/edge.md §5; contracts/releases-deployer.md §2). `deploy/scripts/release.py` puts the release's assets in `site/` first, never deleting, then the rest with `--delete`, which spares the snapshot sink's `status/latest.json`, `assets/`, and `a/`; after W2's review (I1) it spares that one file, not the whole of `status/`, since an excluded key is neither uploaded nor deleted, and `status/*` kept the build's own `status/index.html` and stylesheet out of `site/`, so `/status/` would have answered AccessDenied. A failed invalidation is a warning that prints its one recovery, `aws cloudfront create-invalidation --distribution-id <ID> --paths '/*'`, and the release goes on to its pointer, since `site/` already holds it; before, it refused with the pointer on the release before while `site/` held the new one. The assets and content-addressed files a release lacks are retired: a ledger, `releases/retired.json` in the site's bucket (outside `site/`, which the distribution serves alone), holds the time of the release that first lacked each, and a release deletes the ones a day old. A failed listing, an unreadable ledger, or a failed delete deletes nothing it can't account for, and is a warning (`docs/runbooks/deploy.md`, Act 4). "A day" is from that release, not from the asset's upload, so a tab open on the release before has a day. A failed sync still refuses, and its refusal names its recovery, `make release` again (W2's review, N4). **Spec 004's contract differs and isn't amended here** (W2's review, N3): its `contracts/serving.md`, "The sync" item 3, says stale GLB keys under `site/a/` "are then deleted, as the sync deletes other files"; from W2 they stay a day from the release that first lacked them, then go. That is another spec's contract, so it changes by that spec's own follow-up, which reads this item.
4. **The edge's index function on the folders alone, and their redirect; row C1's headers** (group 8's review B, the smaller ones; P-I5b; contracts/edge.md §3). `h4-site-index` runs on `*/` and on each of the site's folders without its slash (`/credits`, `/disclosure`, `/status`, which the test reads from the build's emitted `index.html` files), after `/api/*`, and on no other path: W1 ran it on every site request, one invocation each (research.md R-05's line). A folder's path without its slash is redirected to it, 301, as the web image's nginx does, where S3 through origin access control answered AccessDenied. A new folder in the site's build needs its behavior in `edge.tf`, which the test then names. P-I5b is a patch of its own after P-I5, not a rebuilt P-I5, since W1's gate commits P-I5 before this branch can, and apart from P-W2, so each patch holds one decision. Row C1 names each header the edge forwards to the relay, `traceparent` among them, which a test holds to the relay's origin-request policy.
5. **W2's prod apply launches the new EC2 running** (W2's review, I2; tasks.md T176, T178). P-W2 drops `aws_ec2_instance_state.ec2_w1` in the same apply that replaces EC2 (generation 2), so nothing holds the new instance stopped, a persistent spot request launches it running, and until the account's apply makes `h4-ec2-guard` and the hours' schedules nothing guards it or closes its hours. The Author's step 9 reads `make ec2-status` right after prod's apply, stops it with `make ec2-stop` (his stop profile) if the account's apply won't follow inside the hours, and SC-005's check reads EC2 running, started with `make ec2-start` if he stopped it. The server action, W1's, still bounds its cost (FR-021). No code changes: the window is the order's, prod before the account ("W2's order").

**B-6 is W1's, not W2's** (the note's "B-6"). The main session relayed "A, from the docs" mid-build; the session's permission system refused its test edits, so A was set aside. Then the Author's answer, relayed by the main session: "We aren't building option A, we went with Option C". C is built in W1: the tunnel end's private interface becomes primary, and W1 makes the VPC origin with no switch; the private group's 8080 rule from CloudFront's origin-facing prefix list is, as the main session relays it, a documented source for VPC origins, so W2 changes no security group and has no second phase. W2 checks it in its plan (T176). The VPC origin's strict xfail is W1's change to flip, not W2's.

**The shared state on the tunnel end: what changes from R-20's RDS design** (spec.md Assumptions, "The shared state on the tunnel end"; ADR 0024's decision 1, amended). The Author's answer: "Postgres in a container on the tunnel end". FR-017 to FR-020's requirements stand. Spec 000's schema, migration 0007, the roles, the two writers, unknown as degraded, and the move are unchanged. What changes:

| Part | R-20, RDS | W1, Postgres on the tunnel end |
|---|---|---|
| The store | RDS for PostgreSQL 17, single-AZ, a subnet group over two private subnets | `shared-state`, a service in the one compose file's `tunnel-end` profile, on spec 000's pinned Postgres 17 image (`gateway-state`'s; its arm64 build to confirm with `make arch-inventory`) |
| Its data | RDS's encrypted storage | an encrypted gp3 volume of its own (`aws_ebs_volume`, `prevent_destroy`), attached to the tunnel end; the spot stop keeps it (R-30); its size from T166. `prevent_destroy` blocks a plan that replaces it, so the runbook's move of the tunnel end to another zone is a reviewed change: a second volume in the new zone, filled from the last backup, with the old one kept until a later change removes its `prevent_destroy` |
| The host's size | `t4g.micro` for four services | the smallest type that holds five, likely `t4g.small` (2 GiB) (R-20), measured (T166) and priced (T167) |
| TLS | `rds.force_ssl`; RDS's CA bundle, pinned by SHA-256 in the images | `ssl = on`, and `hostssl` lines only, so every TCP connection uses TLS. The certificate comes from a CA the Author makes in his terminal (`make shared-state-tls`). The CA's key stays in `~/.config/h4reet-ai/shared-state/`, under spec 000's deny. The server's key and certificate go to Parameter Store, and the tunnel end's host script writes them to tmpfs. Clients verify the chain and the name (`GATEWAY_DB_TLS_SERVERNAME`) against the CA certificate in their environment |
| Roles and passwords | the master user, `h4admin`, its password managed by RDS in Secrets Manager; `make shared-state-roles` as that user | no superuser over TCP: it connects only through the container's own socket. `make shared-state-roles` runs on the tunnel end through Systems Manager, and sets the four roles' passwords from the SecureStrings the Author writes to Parameter Store (contracts/shared-state.md §2's paths). No Secrets Manager secret, and, if the build needs a new secret name after all, its deny by name first (T165) |
| Logs | the parameter group's `log_statement = none` and `log_min_duration_statement = -1` | the same two settings, in the service's configuration |
| Reach | 5432 from EC2's and the tunnel end's security groups | 5432 on the tunnel end's private interface, from EC2's group only; the relay over the compose network; the laptop through the tunnel's `-L 5432`, whose `PermitOpen` names `shared-state:5432` (R-11) |
| Backups | automated, kept 7 days, with a final snapshot and deletion protection | The note's question 4, answered with its recommended option, A, as the main session relayed (group 6's departure 1): a `pg_dump` every hour over the socket, by a host timer on the tunnel end, to a bucket of its own (versioned, encrypted, public access blocked, objects kept 7 days). The tunnel end's role may only put objects there. A failed dump alerts, `shared_state_backup_failed`, and the dashboard shows the last good dump's age. Disclosure row C16 |
| Restore | from RDS's backups to a new instance under the old identifier | from the last dump into an emptied `shared-state`, then contracts/shared-state.md §8's `operator-restore` and `operator-init`. A move of the tunnel end to another zone is such a restore, since its volume stays in its zone. **The fetch** (recommended): the tunnel end's role may only put, so it can't read a dump. In the Author's terminal, `make shared-state-restore` picks the dump, and makes a presigned GET for it with his own session, valid for 15 minutes. It passes that URL to the tunnel end through a Systems Manager command, which fetches the dump over the egress the backups already use and loads it over the socket. The URL is a short-lived bearer credential: the command's history keeps it, past its expiry, so the target prints none of it, and the runbook says so. The alternative, a read grant on the bucket for the tunnel end, lets a compromised tunnel end read every dump |
| Cost | about $14 a month (R-05) | the larger type, the data volume, and the backups' storage, each to price (T167). RDS's line and its secret go |
| Rule T12 | applies to RDS | no RDS resource remains; T12 stays for any later one |

The Degraded Modes row on the shared state changes in one cause: "RDS down, or being restored" becomes the tunnel end's `shared-state` down, or being restored. Visitors get what they got. While the tunnel end itself is gone, they already get the edge's `no_host_serving`, with or without the store (R-20; T162).

**EC2 on 12 hours a day** (spec.md Assumptions, "EC2 on 12 hours a day"; [ADR 0048](../../docs/adr/0048-ec2-on-12-hours-a-day.md), proposed). His answers: "$45, with 12 h a day", confirmed "Keep 12 h a day, $45", and, for the hours, "12 hours, from 7am to 7pm Mountain Standard Time" (2026-11-12; spec.md Clarifications, Session 2026-11-12). The mechanism, as ADR 0048 proposes it:
- **The hours** are one local in `infra/account/handover.tf`, 07:00 to 19:00, in the zone his answer to the note's question 1a names: `America/Denver`, the local clock all year (recommended), or `Etc/GMT+7`, a fixed UTC−7, which by the summer clock is 8am to 8pm. (answered: "1a A", `America/Denver`) In UTC, the first is 14:00 to 02:00 in winter and 13:00 to 01:00 in summer; the second is 14:00 to 02:00 all year. EventBridge Scheduler takes either name directly.
- **Two schedules** in the same file: `h4-ec2-hours-open` at 07:00 invokes `h4-ec2-start` with `from: hours_open`, and `h4-ec2-hours-close` at 19:00 invokes `h4-ec2-guard` with `from: hours_close`. Their role may invoke those two functions and nothing else. Neither calls EC2's API, so only the functions start and stop EC2: "a schedule never fights the start function", the reason question 15's recommendation gave.
- **The start function** refuses outside the hours with `outside_hours`, whatever automatic trigger invoked it, and for a hand start too (question 2, the Author's answer "2 A"). Its order: `paused`, `outside_hours`, `server_budget_stopped`, `tunnel_end_down`, `laptop_serving` (by hand, `from: tunnel_end_back`, and `from: hours_open`), then the start.
- **The guard** stops EC2 outside the hours, `ec2_stopped_outside_hours`: on `h4-ec2-running`, as after AWS's restart, and at `hours_close` when EC2 runs.
- **The autostart switch and the server action keep precedence,** inside the hours too. The schedules write nothing, so a plan after them shows no change (FR-072).
- **By his patch** (FR-069): the schedules, their role, and the hours' local are in protected files, so they arrive in P-I6. The functions' code is agent-written, test-first (T116, T117). They switch on in W2 with the functions' digests.
- **Degraded mode:** outside the hours with the laptop off, every dynamic request gets `no_host_serving`, the room's `cannot_talk.resting`, and the public view "no host serving", which SC-001's "EC2 stopped on purpose" already excepts. Whether the site states the hours was the note's question 1b: answered "1b A", and then "Only /status/ (Recommended)" (T170; "W1's answers" below). Each scheduled start and stop alerts on both channels under FR-065 as written, about two alerts a day; whether routine ones should is question 3 [NEEDS CLARIFICATION].
- **Cost:** R-05's 12-hour lines for `t4g.large` on spot, about $8.70 to $13.00 a month, with its address charged only while it runs. The two schedules, and about 60 invocations a month, are inside Scheduler's and Lambda's free tiers (to confirm).
- **The spec's amendments,** FR-065, FR-069, and FR-071, and a Degraded Modes row, follow his answers (T169).

**Group 2, as built: its departures** (tasks.md T014 to T016; research.md R-33, where the method now reads as built):
1. **The architectures come from the engine's store, through the Engine API, not `docker buildx imagetools inspect`.** imagetools asks the registry, so it can't run "offline against the seeded store". `deploy/scripts/arch_inventory.py` sends one `GET /images/{name}/json?manifests=1` an image (Engine API 1.48), which lists each platform the stored index names, including platforms whose content was never pulled. The docker CLI shows that view only in `docker image ls --tree`, which is experimental and has no machine-readable form, so the script speaks to the engine itself: the one `DOCKER_HOST` names, over its unix socket, or over mutual TLS with the CLI's certificates. Nothing else is sent: no pull, load, or tag. `make arch-inventory` runs it, through the relay inside the sandbox.
2. **The load's rate is the gateway's global metered limit, not the public cap.** The public cap's figures are P-6's, blank until group 8. The load runs at `config/budgets.yaml`'s `limits.global.metered_per_minute` (60 a minute), the most the gateway admits whatever the public cap is. Its twin turns open the three ready pieces, `snowboard`, `laptop`, and `chalkboard`, as the room does (`{feature, path, turns: []}`). Free talk isn't ready, and answers 409 before the gateway (T018's review, finding 1). The turns come from one client, since edge drops the client label on the site's listener. So they go no faster than its per-minute cap, half the whole, or its 500 a day over the run allows: 16 a minute over 30 minutes. Hello takes the rest, 44 a minute, over enough labels that none reaches either cap (eight, for 30 minutes).
3. **The stub paid adapter is dev's synthetic adapter, inside dev's meters.** With the model server stopped, dev's route answers from its fallback, the synthetic adapter (`config/routing.yaml`; `GATEWAY_TEST_SYNTHETIC_SPEND=1` on dev-cpu). It costs $0.10 a call against dev's $2 fallback grant, so it answers about 20 calls, and the run spends dev-cpu's grant for the day. After that the gateway answers degraded. Every request passes edge and the gateway, and the gateway reads the store's state for each one past the client caps. Only the stub's answers reach an adapter and write the meter's journal and ledger.
   - **What that means for the figure.** The measurement exists to size EC2's memory for the stack as it serves. On EC2 every admitted turn is a paid call, until the meter's ceilings stop them. A run with about 20 answers in 1,800 measures a stack that mostly isn't calling a model: the paths those calls add, the model call's span and Langfuse's generation through its worker into ClickHouse, the ledger's rows, carry about 1% of the load. The rest of the stack, edge, the gateway's request path, the store's reads, Prometheus, Loki, Grafana, and every store's resident set, carries it all.
   - So the record and its table put the stub's share beside the peaks (T018's review, its caveat). The Author can accept the figure, or ask for a longer answered window. That window needs the dev-only clock or operator renewals inside the load, which this group doesn't build.
4. **dev-cpu only.** prod is refused: with its model server stopped, its route would send the load to the paid fallback. The Author's repeat on the laptop (R-33) isn't built; he can ask for it. The run starts from the main working tree on the branch, since the engine binds that tree's files (spec 000 contracts/env-files.md §7.3). It starts only after the checks: at least 30 GB free on the Windows drive that holds WSL's disk, at least 16 GB of memory available, and no other agent session using the engine.
5. **The tunnel end's measurement moves to groups 5 and 8.** Its four services (`tunnel-end`, `relay`, `snapshot-sink`, and its collector) don't exist yet. §4's limits stay "to measure" until then. Of the images pinned today, the tunnel end runs the collector, which the inventory covers.

**Group 3, as built: its departures** (tasks.md T020 to T026):
1. **The tests read HCL with P-1's reader, and skip until P-1 is applied.** `infra/test/test_bootstrap.py` and `scripts/infra/`'s tests of the Author's targets load `tools/gates/infra_policy.py`, `infra_redact.py`, and `infra_plan_note.py` by path, and read PLANNED (T010) without them. Until the Author applies P-I1, `test_bootstrap.py` reads `budgets.tf` and `alerts.tf` from P-I1's patch file, as the new files it creates, so the branch's tests cover the protected files' content before they are in the tree.
2. **Terraform's data folder is outside the tree.** `make plan ROOT=…`, `make infra-verify`, and the apply run with `TF_DATA_DIR=~/.config/h4reet-ai/infra/data/<root>`, so no `.terraform/` folder, which an agent could fill with a provider the Author's terminal would run, ever sits in the tree (P-1's rule T4 refuses one). So the command `make infra-verify` prints carries it, and the profile: `AWS_PROFILE=<profile> TF_DATA_DIR=<…/data/root> terraform -chdir=infra/<root> apply <saved plan>`. The saved plans, the local state, and each root's `TF_VAR_` values are beside it under `~/.config/h4reet-ai/infra/`, which spec 000 denies to agents.
3. **The lockfile is the Author's step.** T023 makes it "from the mirror", and no agent session holds Terraform or the mirror, which T011 seeds. So `infra/bootstrap/.terraform.lock.hcl` is his command on the branch, `terraform providers lock -fs-mirror=…`, before T027's plan block (the branch's note gives it). Until then rule T10 is the policy's one finding on the root.
4. **The state starts local, and its move needs a backend change.** The bootstrap's `versions.tf` declares `backend "local" {}`, and `make plan ROOT=bootstrap` names its path. T030's move to the bucket, `terraform init -migrate-state`, needs that block to read `backend "s3"`, which is a change to `infra/` on a branch of its own after T029, gated like any other; T030 step 2 runs from it, not from `main` as T030 reads.
5. **September R-03's "every principal except the Author's administrator role from IAM Identity Center" isn't built.** The state bucket's policy denies every principal (`"*"`) any request without TLS, and grants nothing. The administrator-only clause needs his administrator permission set's name, a wrong one would lock him out of his own state, and T020's list doesn't hold it. It is his to ask for. (Before T028's review this departure also named the account in place of `"*"`, since P-1's rule T6 then read a deny's wildcard as a grant; P-1 at `feat/001-guards` 84d0b707 reads it as the deny it is, and the policy names `"*"` again.)
6. **The server budget's "every cost but Bedrock's"** is `aws_budgets_budget`'s `filter_expression` with `not`, to confirm when `make plan ROOT=bootstrap` validates it (T027). **T027's plan (2026-11-11):** hashicorp/aws 6.72.0 needs `metrics` beside `filter_expression`, so both such budgets carry `metrics = ["UnblendedCost"]` (the account has no credits). **From T150 (ADR 0047):** two `and` terms, the `not` and the `project` tag, to confirm at that branch's plan; AWS Budgets' older `cost_filter` only includes. **After T028's review (B3),** Bedrock's cost, in all three budgets, is the services `var.bedrock_service_names` names: a list the Author writes from what his Cost Explorer shows, with no default, since Claude on Bedrock is sold through AWS Marketplace and its cost can show under a name of its own ("Claude … (Amazon Bedrock Edition)"), not "Amazon Bedrock". Guessed wrong, the model budgets would see none of the spend, group 4's action would never trip, and the server budget would count model spend as the server's. Its `TF_VAR_` name needs its deny by name in P-1 before he writes it (contracts/env-cloud.md §5). The model budgets also count usage, not cost net of credits (`cost_types`, `include_credit = false`), so a credit can't hide the spend; the server budget keeps AWS's default, both his to change.
7. **The credential audit's Dockerfile moves to group 4.** The compose policy refuses a Dockerfile whose `FROM` has no digest that `deploy/images.lock` pins, and the `python3.14` arm64 Lambda base can't be resolved offline. Group 4 deploys the function (T034) and pins its base by digest, as the Technical Context already has it. In group 3 the audit runs in the Author's terminal, by `make infra-audit` and `make infra-verify`.
8. **The laptop identity's check waits for group 4's cutover.** Before group 4, spec 000's hand-made permission set stands, and the bootstrap's apply must pass the audit. So the check runs once `h4-laptop-bedrock` exists or the audit's `LAPTOP_PERMISSION_SET` names the set, which group 4 writes when it imports it.
9. **The apply record's times** are `make infra-verify`'s pass, from a stamp it writes beside the saved plan, and `make infra-record`'s run; the record says so. A second record the same day is `docs/infra/applies/<date>-2-<root>.md` (data-model.md §6.5's `[-n]`), on `ops/apply-<root>-<date>-2`. `OUTCOME=failed` takes `EXIT_STATUS=<n>`.
10. **`make secrets-check` reads `infra/parameters.txt`,** the names the hosts expect, which group 3 leaves empty: its bootstrap reads none.
11. **After T028's review (I4), the credential audit finds any IAM user,** `iam_user_present`, whatever it holds: a console password, a service-specific credential (Bedrock's long-term API keys among them), an SSH public key, and a signing certificate are an IAM user's, each long-lived, against FR-008's "humans use SSO, and workloads use roles" and User Story 1's scenario 5. A user's access keys keep their own finding. SES's SMTP credentials are an IAM user's access keys, so if spec 000's mail channel is SES, the audit finds that user and `make infra-verify` refuses the apply until he moves it.
12. **After T028's review (nits 1 and 3), `make plan ROOT=…` runs `terraform fmt -check`** on the root after the policy and before `init`, and refuses while a saved plan of the same tree, or its stamp, exists: it never replaces one.

**Group 6, as built: its departures** (tasks.md T059 to T076, T162 to T165; the note `docs/merge-requests/2026-11-13-feat-001-w1.md`, group 6):
1. **The backups are the regrouping note's question 4, option A,** as the main session relayed the Author's answer: a `pg_dump` every hour to a bucket of its own, `h4reet-ai-shared-state-<account>`, its `dumps/` kept 7 days with their old versions. The plan's other choices stand as recommended: the restore's presigned GET, and the tunnel end's role putting only.
2. **The CA certificate travels in the env file itself,** `GATEWAY_DB_TLS_CA`, base64 of its PEM on one line, not a file the env names: a container sees only its five bind roots, and none holds the Author's certificate. It is public material, so no deny (T165). The one server name is `shared-state`, whichever address a client dials, and the gateway checks it itself, since pg sets SNI to the host it dials (`tunnel`, or an address). TLS 1.3 at least.
3. **FR-018's refusal on the laptop waits for the move** (T080). While prod's `GATEWAY_DB_URL` is empty, its meter is the laptop's own `gateway-state`, and preflight's P23 warns rather than refuses, so `make up ENV=prod` works between W1's merge and the move, when no second host spends. Once it is set, P23 holds it to the shared state through the tunnel, with TLS. EC2's gateway refuses to start without it (`local_store_on_shared_host`). The laptop's prod still runs `gateway-state`, whose volume is the move's record (data-model.md §1.5). Its Grafana's store datasource still reads `gateway-state`: moving it with the cutover is an open point.
4. **The host on each row is the session's,** `h4.host`, which the gateway's pool sets on every connection from `H4_HOST` (`options: -c h4.host=…`), and which 0007's `host` columns take as their default. So every writer of spec 000's sets it without naming it, and rows from before 0007 stay NULL.
5. **The shared state's host parts come from the release's tree,** not the user data, which group 5 left at 14.1 KB of 16. The deployer runs a class's host step (`HOST_STEPS`) from the tree it fetched, before compose pulls or starts anything: `deploy/hosts/tunnel-end/shared_state.py prepare` mounts the volume, writes the key and certificate to tmpfs, and installs itself and the backup's units, `deploy/hosts/tunnel-end/release/`. A failed step is a failed start, which rolls back. So the host's later parts change with a release, where group 5's change only with a replace.
6. **The backup's age is pushed by the host's timer** to the tunnel end's collector at its address on the stack's egress bridge, as OTLP/HTTP's JSON, with no `h4.relay.host`, so the collector sends it to both hosts (§11; contracts/shared-state.md §10).
7. **EC2's security group is made here,** `h4-ec2` in `network.tf`, with no rule until group 7 (T084), since 5432 admits it alone; and 5432's rule is an inline `ingress` of the tunnel end's private group in `tunnel-end.tf`, since inline rules and rule resources on one group fight. `shared-state.tf` holds the volume, its attachment, and the bucket.
8. **The tunnel end's role reads two of EC2's parameters by name,** `/h4reet/ec2/DB_GATEWAY_PASSWORD` and `DB_GRAFANA_RO_PASSWORD`, since the roles target runs on the tunnel end and sets all four; it gains nothing from them, since it holds the store's superuser.
9. **The roles target makes a role no migration has yet made,** as 0002 and 0007 would, and gives `gateway` the admin option on the other three, without membership: on Postgres 17 a `CREATEROLE` role alters only the roles it has that option on, and the gateway's migrations and its start alter them.
10. **The data volume is 8 GiB until T166 confirms it,** `local.shared_state_volume_gib` in the unprotected `shared-state.tf`; the bucket refuses any request without TLS.
11. **P-G4, the compose policy's shared state,** a patch §14 didn't list (now it does), stacked after P-G3, and **P-I7 stacks after P-I3**, whose `iam.tf`, bridge, and §2 rows it changes; `infra/test/patches.py` reads a tree that holds both, as the `-p` branch will.
12. **EC2's route is a primary and a fallback marked paid,** inside the gateway: `envs.prod.hosts.ec2`'s `first` and `second` become the route's two roles with `paid`, so the registry builds them as any route, and the gateway calls them in order with no local step, each `metered`.
13. **The admin-only stack** is prod's project's `gateway` and `edge`, with the relay and telemetry blocks' tokens empty, and a one-off `tunnel admin` (`deploy/tunnel/ssh_config_admin`, `-L 5432` alone), stopped when the command ends. The Makefile takes `ENV=shared` for the operator's targets alone, and gains the restore target. `--use-aliases` giving the one-off the name `tunnel` is to confirm on the Author's engine.
14. **T060 runs two gateways on one PGlite,** whose one connection interleaves their sessions as two pools would; a real Postgres's concurrency is the Author's run on the tunnel end (quickstart §6, step 5).
15. **T166, T167, and T179 aren't group 6's** to finish: T166 measures the tunnel end's five services under the relay's load, and the relay is group 8's (T106), on an engine the agents' session lacks; T167 is the Author's prices; and T179 follows T167.
16. **The hosts' names are data** (`services/gateway/src/config/hosts.json`): one of them is also one of the room's piece IDs, and spec 004's source scan (its FR-007; `apps/web/build/room/scan.ts`) refuses any room ID in the gateway's or the web workspace's string literals, with no allowlist by design. So the gateway and its tests take the names from that file, and the room's hints find prod's local-first route by its primary, not its name. The overlap of the two namespaces is an open point for the Author: 0007's handover reasons (`laptop_healthy` and the like) hold the same word; the relay's code (group 8) doesn't meet the scan, which reads the web workspace's and the gateway's folders alone (`SCAN_FOLDERS`; group 6's review, nit 1).

**Group 6, after its review** (the note's "Group 6's review, and what was done"):
1. **The restore target reads `aws s3 presign`'s plain-text answer** (I-1).
2. **The host script's restore gives the gateway its database grant back** after `CREATE DATABASE`, the roles target's own statement, and loads the dump in one transaction (I-2).
3. **The restored meters are init's fourth candidate** for the day, the month, today's fallback, and each capped adapter's month, and count as evidence (I-3). FR-019's crossed ceilings and renewal flag are shown by the restore, and carried as contracts/shared-state.md §8 step 3 reads FR-019's words: the ceilings by the restored meters' effect, the flag by the Author's `RENEW=1`.
4. **The nits:** `hosts.json` held to 0007's CHECKs; P-G2's two gap rows for the targets' script run directly; blkid's exit 2 alone formats, findmnt first; the admin-only stack stops its own three services alone; spec.md's cost row and the backlog's wording. Nits 5 (the window between the restore's steps 2 and 3) and 8 (departure 1's relayed answer) are the note's backlog.

**Group 5's fixes, reviewed** (the note's "Group 5's fixes, reviewed"):
1. **The role check fails closed** on a policy naming its role by a literal, a policy that isn't a document it reads, an exclusion statement, or an `inline_policy`; and `kms:Decrypt` is held to the role's own parameters by Parameter Store's encryption context (in P-I3 and P-I7).
2. **Preflight runs in two phases:** T1 to T4 before the host step, T5 after it, a refusal after it putting the running release's host files back; each refusal alerted once (contracts/env-cloud.md §3).
3. **The tunnel end's deployer honours a hold,** a file in its state folder (contracts/releases-deployer.md §4); the runbook stops its timer before the stack.
4. **The nits:** the runbook's two corrections; the level-6 size alone (15,291 bytes); the seed checked against its Dockerfile; preflight in the 3.9 check.

**From the release** (2026-11-13). The Author's answer to the deployer's place: "From the release (Recommended)". A departure from group 5's, which put the deployer in the tunnel end's user data (group 5's departure 9): the user data carries a small first step, `deploy/scripts/deploy_first_step.py`, which runs the deployer of the release the host last started, from its tree, or, before any, fetches the newest release's tree, held to `release.json`'s SHA-256, and runs its deployer. So the deployer changes with a release, with no replace of the tunnel end and no user-data limit near: the user data is 12,208 bytes gzipped at level 6 of EC2's 16,384 (the run's own figure; an earlier 11,975 wasn't), and 13,316 after the deployer's review below. No release yet, or the bucket out of reach, runs and alerts nothing; a tree that isn't the release's, and a deployer that doesn't run, are each `deploy_refused` once per release, and the previous release's deployer then runs. The deployer's guarantees stand (the boot's cached images, the hold, preflight's phases, `refused.json`, the registry out of reach), and it exits 75 for a run that refused or rolled back and alerted, which the first step tells from one that didn't run. `terraform_data.tunnel_end_host` still holds the SHA-256 of what the user data carries, so a change to the first step, `write_env.py`, `egress_proxy.py`, or the boot's files is still a replace the plan shows. EC2's user data takes the same step (group 7): `ENV_FILES` names its env file then. Contracts/releases-deployer.md §3 says so.

**FR-019's carry-over, answered** (2026-11-13): "Show them, you decide (Recommended)". The reading in contracts/shared-state.md §8 step 3 stands: the restore shows the crossed ceilings and the renewal flag, and init carries them as that step says.

**Fixes, reviewed again** (the note's "Fixes, reviewed again"): the role check reads nothing as empty (an unreadable effect or actions list, a document built from others, a dynamic block, or a module is a finding); the deployer's alert memory keys a pointer's incident on the pointer, keeps an alert only once SNS took it, reads damage as nothing seen, and forgets on a deploy; a refused or rolled-back release isn't tried again until a newer one deploys; T5's restore checks its host step; `h4-stack.service` stops the class's containers; the hold alerts once per hold.

**Group 9, as built: its departures** (tasks.md T116 to T128; the note `docs/merge-requests/2026-11-13-feat-001-w1.md`, group 9). Built on the regrouping note's questions 1a, 2, and 3 at their recommended options, which the Author's answers confirm (2026-11-12, relayed: "W1 answers: 1a A, 1b A, 2 A, 3 A, 4 A, W-9 A, B-3 A, G10-1 A, G10-2 A, G10-3 A"; each one line, below); T169's spec amendments are applied; T170, for his "1b A", is test-first:
1. **The hours' answers, each in one place.** Question 1a, option A: `local.ec2_hours` in `infra/account/handover.tf` (P-I6) names `America/Denver`, 07:00 to 19:00, and `infra/test/test_handover.py`'s `PROVISIONAL_ZONE` holds it; option B is `Etc/GMT+7` in both. Question 2, option A: `HAND_START_OUTSIDE_HOURS = False` in `infra/lambdas/ec2_start/start.py`. Question 3, option A: `SCHEDULED_ALERTED` in `start.py`, which `ec2_guard/guard.py` and its test hold alike: the scheduled open's and close's routine outcomes are recorded (the embedded metric) and not alerted, and only `start_failed`, `server_budget_stopped`, and `tunnel_end_down` alert; a failed read, `ec2_unrecognised_instance`, and `ec2_guard_failed` always do. Every other trigger alerts each outcome, as FR-065 and FR-071 say.
2. **The functions carry the zone's rules; no time-zone database.** Whether AWS's python3.14 base for arm64 carries `/usr/share/zoneinfo` couldn't be confirmed: the agents' engine can't pull `public.ecr.aws/lambda/python`, and the minimal Amazon Linux 2023 base is reported to lack it. So each function carries question 1a's two zones by their rules (`ZONES`: UTC−7, with the US daylight-saving rule since 2007 for `America/Denver`), and refuses any other zone. Its tests hold the rules to the machine's database every half hour to 2036; a later change of the US rule would fail them on the first tzdata that has it. Scheduler takes the zone's name itself.
3. **One environment value, `H4_EC2_HOURS`,** `"<zone> <HH:MM>-<HH:MM>"`, which `local.ec2_hours_value` builds; the schedules' cron expressions are built from the same local, and their zone is its `zone`. The hours sit in a second `locals` block of their own in the account's `handover.tf`, so P-W2 changes the switch's block alone.
4. **A failed read refuses, or stops, at its own step,** with `- unread: <code>` among the facts, and always alerts: the start function starts EC2 only when every check passes, and the guard counts a read it can't make as its condition holding. An unreadable or unknown `H4_EC2_HOURS` is `outside_hours`. An unknown event is `start_failed` (`code: unknown_trigger`), or the guard's `ec2_guard_failed`. Neither function raises, so Lambda never retries one (`maximum_retry_attempts = 0` too): FR-065's one attempt.
5. **The close stops EC2 whatever the clock says** (`from: hours_close` is the close, even a second early); the open runs the clock's check like every trigger, and reads the laptop's alarm as `from: tunnel_end_back` does. The guard's order is the start function's: the switch, the hours, the server action, the laptop.
6. **A new kind, `ec2_guard_failed`,** for the guard's parameter or listing unreadable, a failed stop, or an unknown event (T117: "alerts once"); `ec2_stopped_outside_hours` and `ec2_unrecognised_instance` page `ec2.md`, and `outside_hours` pages `handover.md`, the row its reasons share. The bridge's kinds, its test, and contracts/aws-alerts.md §2's table, which the test reads, travel in P-I6, since `infra/*alert*` is protected.
7. **`h4-ec2-stop`, the Author's permission set, is P-I6's** (`infra/account/iam.tf`), on the tag, with `sns:Publish` for `ec2_stopped_by_author`. Its assignment to his user stays his, by hand in IAM Identity Center, as the laptop's was: nothing in the repository names a user.
8. **The tunnel end's one key and its backups share one put statement:** a role's check takes each action once, so `s3:PutObject` lists both `dumps/*` and `site/status/latest.json`; `test_prod_shared_state.py` still holds the backups' part to `dumps/*` alone. The dashboard's reads: `ec2:DescribeInstances`, `ec2:DescribeSpotInstanceRequests`, and `cloudwatch:GetMetricData` on `*` (none takes a narrower resource), `route53:GetHealthCheckStatus` on prod's own check, and `budgets:ViewBudget` and `budgets:DescribeBudgetActionsForBudget` on `h4-server-month` by name (the resource form to confirm at W2's first run). The autostart switch joins the role's parameters.
9. **The health check runs every 30 s,** Route 53's standard interval, with threshold 3, as R-29 has it; `h4-laptop-away` has no alarm action: the account's rule reads its change, and the start function alerts.
10. **The functions' log groups are W1's,** made empty before their functions, so the roles' log grants have their ARNs; everything that needs a digest waits behind the switch, and each function refuses a plan without its digest (a `precondition`).
11. **The embedded metric's dimensions are `Function`, `Trigger`, and `Outcome`,** so the dashboard tells a scheduled start or stop from the others (T127). Each combination is a custom metric, billed only in the hours it has data: about a dozen in use, a few cents a month at most (to confirm at T167). Corrected after group 9's review A (I5): the sink's `SEARCH` over them is `GetMetricData`, which has no free tier and bills each metric it returns at $0.01 per 1,000. At every 2 minutes that was 21,600 calls a month at about a dozen series, roughly $2.60 a month, not "under a cent"; the sink now reads them once in 30 minutes (the series is a last-hour sum already), about 1,440 calls and 17,280 metrics a month, about $0.17 (research.md R-05).
12. **The Author's targets** (`scripts/infra/ec2_ops.py`): the autostart target writes its audit row to `~/.local/state/h4reet/ec2-actions.jsonl`, as the stop target does, not to the shared state: no admin route writes an arbitrary audit row there, and one would be spec 000's change. The restore target takes `INCIDENT=`, a note under `docs/incidents/` that must exist, and reverses the server action alone; its alert is the action's own history. The status target reads the hours from `local.ec2_hours` in the tree, the one source, and marks its status request as a probe.
13. **The loop's failed stop alerts through `h4-alerts`,** corrected after group 9's review A (I3): `handover_stop_failed`, once a failing streak, published with the Author's stop profile, whose permission set already holds `sns:Publish` on `h4-alerts` (P-I6), so it reaches both channels as `make ec2-stop`'s alert does; the bridge's kind, its page (`handover.md`), and contracts/aws-alerts.md §2's row travel in P-I6, rebuilt, with no IAM change. Its line stays in `~/.local/state/h4reet/prod/handover.log` and `handover.jsonl` too, and is the only record when the session that would publish it has expired. `make up ENV=prod` says so on its terminal only for a session already expired when it starts the loop; **a session that expires later in the day alerts nowhere but the log** (the fixes' review, nit 2): the guard's close at 19:00 bounds what EC2 then costs, and T169's draft names the gap. Spec 000's dispatcher has no host-script kind and no route a host script can raise one through; a kind there is spec 000's change, the backlog's.
14. **The window's metric goes through x004** (`h4.handover.window_seconds`, from `h4-handover` alone): the collector's devtime filter admits that one name as a named exception to spec 000's FR-037, which keeps x004 to dev-time metrics. Recommended to the Author, and built; his question W-9 in W1's note.
15. **The sink's cloud reads are a module, not yet a service** (`deploy/scripts/snapshot_sink.py`): its compose service is group 10's, with the document part (T137); settled there as a host service with the instance role beside a container that holds the token alone ("Group 10, as built", item 1). Its reads need the tunnel end's role, which no container reaches (IMDSv2, one hop), so group 10 runs them as a host timer, as the backup's, or hands a container credentials as EC2's gateway gets them. The health check's ID reaches it as `/h4reet/tunnel-end/HEALTH_CHECK_ID`, a String in prod's unprotected `ssm.tf`. The label order CloudWatch's `SEARCH` gives the outcomes is to confirm at W2's first run.
16. **The hours aren't on a panel themselves,** only the scheduled starts and stops: a panel stating them would need a copy, or T170's read of the schedules, which waits for question 1b.

**The final review, and what was done** (the review of 2e32fe49..3649b36e, approved; the note's "Final review, and what was done"): both loops' fixed-rate sleep is tested with a clock that moves inside the round, the publisher's loop split out as `run_publishes` for it; both keep time by `time.monotonic()`; contracts/public-view.md says the write's 30 s is a stated figure, not a bound, and that the host part's age is the tunnel-down signal.

**T166's harness: its departures** (tasks.md T166; the note's "T166"). T166 stays open: the harness is built, and the Author runs it on his own engine; the session then sets `local.tunnel_end_type` from his block. What the harness is, and where it departs from T166's words:
1. **The Author's engine, not dev-cpu.** T166 says "on dev-cpu". The agents' engine can't build the tunnel's image (its Ubuntu packages are behind the engine's egress proxy: `apt-get` exits 100), and it binds only the main checkout's tree (rule A14 refused the store's bind from a worktree). So `make measure-tunnel-end` runs on whichever engine `docker` reaches: the Author's from his terminal, the agents' through the relay. On the agents' engine the relay's and the sink's images build, and nothing more runs (tried 2026-11-12). What would let the agents run T166 themselves: a pinned base that already holds OpenSSH's server, from a registry the engine's proxy reaches (ghcr.io), in `deploy/images.lock` by the Author's pin step, or the Ubuntu mirror on the engine's egress list (the engine's configuration, his); and the harness run from the main checkout with `H4_TREE=/run/h4agents/tree`, as dev-cpu's vars name it. Neither is done here; the tunnel's image keeps its base.
2. **An overlay outside the committed compose file,** `deploy/measure/tunnel-end.overlay.yaml`, in a project of its own, `h4reet-measure-tunnel-end`: no port published; the tunnel end's host paths become the project's named volumes or the tree's own files, read-only; the release-built images built from the tree, the copies at the lock's pins; the relay forwarding to a stub host, `measure-host`, as both hosts, refusing no peer but loopback. No make up, deployer, release, or preflight reads it, and a test holds that.
3. **Stand-in public-cap figures,** `deploy/measure/budgets.measure.yaml`: config/budgets.yaml and a public section at spec 000's per-client figures and the gateway's global in-flight limit. Its first line says it is a measurement's, not the Author's, and the harness says so before the run; it is outside `config/`, and no prod file or host's class names it.
4. **The store without TLS, and the relay as on dev** (`H4_STACK=dev`, `deploy/measure/pg_hba.measure.conf`): TLS's memory isn't what T166 records, and the measurement makes no certificate. The store is the gateway's migrations, its kill switch `normal`, the relay's roles with stand-in passwords.
5. **Stand-in secrets in a temporary folder,** never `deploy/env` or `~/.config`, mode 0600, removed after; the project is taken down with its volumes whatever happens.
6. **The sshd carries no forwarded traffic:** the relay reaches the stub host directly, not through the tunnel, so `tunnel-end`'s peak is its idle sshd's. Its limit is 32 MiB; the record says so.
7. **The type by R-33's rule, as T016 applied it, written as code:** the largest total of the five at one sample, beside 512 MiB for the OS and Docker, within 80% of the type's memory; the t4g family from `nano` to `xlarge`. `t4g.nano` never fits by that rule. No price. **After the safety review (nit 5), the same rule also on the five's memory limits,** as docker stats reports them (deploy/compose.yaml's: 32, 96, 48, 96, and 256 MiB, 528 MiB together, which need `t4g.small`), and the type the block names is the larger of the two, so a host whose peaks fit `t4g.micro` isn't sized below its own limits. The host's own timers, the sink's writer (`h4-snapshot-sink.service`) and the backup (`h4-shared-state-backup.timer`), run beside Docker within the OS's share and aren't counted; the block says so. This reads R-33's rule as T016 did, applied twice; R-33's words stand.
8. **Not Author-only:** it touches no stack, account, or secret of his and spends nothing; from an agent's sandbox it reaches the agents' engine alone, through the relay, as `make measure-stack` does. So no bash-gate row and no patch.
9. **After the safety review** (no Important; the note's "T166's harness, and the final review"): the overlay gives the five `restart: "no"`, and the cleanup ignores SIGINT, SIGTERM, and SIGHUP and survives a failed print, so the down always runs (nit 1); a failed sample is skipped and counted, and the data volume is read by `du` in the store's own container, which mounts it alone, never by `docker system df -v`, which sizes every volume on the engine, prod's among them (nit 2); the load's container gets `GRACE_S` to finish before its counts are read, and missing counts are said (nit 3); the window is kept by the monotonic clock, the record's times by the wall clock (nit 4); the limits' type beside the peaks' (nit 5, item 7); the note names the build's npm and Ubuntu fetches and the images left behind (nit 6); and `MAX_MINUTES` is 120, under the stand-in's 500 a day across the load's 16 addresses at 60 a minute, which runs out after about 133 minutes (nit 7).

**T166's run, and the limits** (2026-11-13; research.md R-33, "The tunnel end"). The Author ran the harness on his engine, at a clone of 4c56e440. Its verdict: "The type, the larger of the two (R-33's rule on the peaks and on the limits): t4g.small." `local.tunnel_end_type` is `t4g.small`; the precondition still refuses the placeholder. The relay peaked at exactly its 96 MiB limit and the tunnel end's collector at 94.6 of its 96, so both limits rise to 128M, `dev-relay`'s with the relay's, test-first (fa2894e1); the five's limits total 592 MiB, still t4g.small by R-33's rule. The collector's `memory_limiter` stays at 72 MiB. §4's table carries the new figures.

**Group 10's review, and what was done** (the review of 6584bda2..2e32fe49; the note's "Group 10's review, and what was done"). What its fixes change of group 10 as built:
- **I1:** the cause gauge's `none` (1 while nothing is degraded) is dropped by the publisher, and by the sink as defence in depth; before, every post outside a degradation was refused.
- **I2:** FR-059's tunnel state, `tunnel_up`, in the host part from the dashboard's "Tunnel up" panel, a line on the page.
- **I3:** FR-058's margin: the publisher posts every minute, and both loops run at a fixed rate; the worst age at the edge is 270 s with the stated figures.
- **Nits:** the write's loop survives a round's error and keeps its hourly and half-hourly reads' times across a restart; the server part stays last-known after a failed read; no tagged instance, or two, is `unknown`, never `stopped` or the first; a part is kept with the sink's time of receipt; the page says "unknown" on a 429 or another 5xx, and marks EC2's line last-known; the sink's server has a 10 s socket timeout; the spec's cost table names the write's PUTs and reads.

**The fixes' review, and what was done** (the review of 1976456c..2e32fe49, the review fixes alone; the note's "The fixes' review, and what was done"):
- **I1:** B-6's strict xfail asks that the origin reach one address the relay publishes on, and its parse test that the one primary interface's one address be in `10.42.0.0/23`, so the marker flips under each of options A, B, and C (each checked on a scratch copy).
- **Nit 1:** the laptop's loop releases only on an explicit `ec2` or `none`; an unread status skips the round and stays serving.
- **Nit 2:** item 13 above names the session that expires after `make up`.
- **Nit 4:** a round's error whose record can't be written is said on stderr, and the loop goes on.
- **Nit 5:** the red-team key also hashes the root `package.json` and `tsconfig.base.json`.
- **Nit 6:** the loop's start reads a quoted `H4_OTLP_PORT` as its value.
- **Nit 7:** a test of `main`'s `--otlp-port`.

**Group 10, as built: its departures** (tasks.md T135 to T138; the note `docs/merge-requests/2026-11-13-feat-001-w1.md`, group 10). Built on item 15 of group 9's, the sink's credentials, at the option recommended below, which the Author's answer confirms (the note's question G10-1; 2026-11-12, relayed: "W1 answers: 1a A, 1b A, 2 A, 3 A, 4 A, W-9 A, B-3 A, G10-1 A, G10-2 A, G10-3 A"):
1. **The sink is two parts, split by what each may hold** (group 9's item 15, settled). `snapshot-sink`, the container, is the publishers' one way in and holds the sink's token alone. `h4-snapshot-sink.service`, a long-lived host service on the tunnel end, as the backup's timer is a host unit, runs the same file's `write` every 2 minutes as root with the instance role, which no container reaches (IMDSv2, one hop): group 9's cloud reads; the relay's status on its internal listener, `127.0.0.1:18505`; the shared state inside its container, over its socket, in a read-only transaction under `SET LOCAL ROLE grafana_ro`, as the backup's dump goes; the container's last part, at its address on the edge bridge, with the token; then the write of `site/status/latest.json`, the one key P-I6 grants the role, through the egress proxy. No new role and no Terraform for the credentials, and the parser that faces the tunnel holds no AWS credential and no store password. The options (question G10-1): (A, recommended, built) this; (B) a narrow role, `h4-prod-snapshot`, assumed by the instance role and handed to the container as a `credential_process` file on tmpfs, as EC2's gateway gets Bedrock's: a P-I8 role, a host timer anyway, and the AWS CLI or a SigV4 client in the image; (C) the instance role's own credentials in the container: the whole role in the parser that faces the tunnel, refused. A host service, not a timer: the hourly budget read and the half-hourly outcomes read keep their cadence in one process (group 9's review A, I5).
2. **A publisher learns who serves from the sink** (contract §1's "by the relay's status"): `GET /v1/serving` answers the relay's own `serving`; the laptop's publisher has no route out of `internal`, and EC2's reaches the VPC alone. The sink also refuses a part from a host the relay doesn't serve (409 `not_serving`).
3. **Two publishers' services, one script and one image.** `snapshot-publisher` on the laptop, in the `tunnel` profile, built from the tree, on `internal` alone; `ec2-snapshot-publisher` on EC2, the release's image by its digest (`H4_DIGEST_SNAPSHOT`, which EC2's deployer now writes for its own release-built image, `DIGESTED`), on `internal` and `egress`, to reach `10.42.1.10:2301`. One service on both hosts would have put the laptop's on `egress` too. The image is `h4reet/snapshot` (`deploy/snapshot/Dockerfile`, the pinned `base:python`, the two scripts, nothing fetched), which the release builds once for both cloud services.
4. **The publishers read no store:** the store's values (spend, the kill switch, the adapters' months, the handovers) are the sink's cloud part alone, so no publisher holds `grafana_ro`'s password; the ceilings and warnings travel in the host part, from the gateway's own gauges, last-known while no host serves.
5. **The sink's port for EC2 is 2301 on the private interface,** the tunnel's own number for the sink: `infra/prod/tunnel-end.tf`'s private group admits it from EC2's group (an unprotected file, as group 6's 5432 rule), and the tunnel end's nftables on `ens6`. P-G7, the compose policy's public view, admits the sink's port, image, and edge network, and EC2's publisher's image and egress. It applies after P-I6.
6. **The document's fields, as built** (contracts/public-view.md §2): a handover's `reason` is left out (no operator reason; the page needs none); the release is its commit's first 12 hex, never the release's free-form name; `releases` keeps each host's last; money is rounded down to the cent; EC2's `interrupted` is read from the spot request's status code.
7. **The tunnel end's egress allowlist gains** the write's endpoints, `ec2`, `monitoring`, `route53`, `budgets`, and the site's bucket, each named in row C17: group 9 wrote the reads but ran them nowhere. Its user data, with them, the sink's port, and the token's template line, is 14,069 bytes gzipped; the size test's bound goes from 14,000 to 14,400, test-first, still 1,216 under 15,616.
8. **The relay's `ec2` field stays `unknown`** (group 8's item 4): the sink doesn't feed the relay; the page takes EC2's state from the document. Backlog: the relay reading the sink's last EC2 state is a relay change of its own.
9. **The page is an entry of its own,** emitted by a build plugin (`apps/web/build/status.ts`) from `apps/web/status/main.ts`, so the room's page never loads it; the release's site sync already keeps `status/` apart (group 8's item 22). Its code is in `apps/web/status/`, not `src/`: it is spec 001's page, not the room, and it names spec 001's host `laptop`, which is also a room piece's ID, a word spec 004's source scan (FR-007) holds to the room's data in the room's folders; its test takes the hosts' names from the page's module. And the smoke test's check that every file a script names is in the build exempts `./latest.json`, the sink's, by name, with its reason.
10. **No alert for a stale view:** its age is a panel (red from 300 s) and a runbook section in `tunnel-end.md`; an alert kind would be a bridge change, P-I6's file, and W2's first runs show whether one is wanted (backlog).

**Group 8's fixes, reviewed** (the review of 8418fd0b..080eb731, group 8's fixes alone; the note's "Group 8's fixes, reviewed"). What its fixes change of group 8 as built:
- **I1:** B-6's strict xfail reads the tunnel end's `primary_network_interface` too, and takes option B's internal Network Load Balancer; a test of its own holds the parse, so the xfail can fail only on the comparison (item 13, after review B).
- **I2:** the visitor scan's live sources exit 2 unless each answer is HTTP's ok and says `success`, and Loki's when its window reaches its 5000-line limit, so an error's body never scans clean (item 20).
- **Nit 1:** EC2's red-team key hashes `services/gateway` whole but its `test/`, so its Dockerfile, migrations, and build settings count; option A of B-3 has a gap B hasn't: nothing enforces "while the laptop serves" (contracts/releases-deployer.md §2).
- **Nit 3:** an IPv4-mapped address in its hex form keys as its IPv4 address, as the dotted form does.
- **Nit 4:** the relay reads the status's verdict in its 1 s round, at most once in 5 s, so `h4.relay.status.class` never holds a class older than that with no status poll.

**Group 9's review A, and what was done** (the review of 8418fd0b..080eb731; the note's "Group 9's review, and what was done"). What its fixes change of group 9 as built:
- **I1:** the laptop's loop stops EC2 only while the relay's status says `laptop`; on anything else it records `released` and goes back to waiting (FR-064's "WHILE"), so a laptop whose tunnel or gateway failed no longer stops the EC2 that took over.
- **I2:** a hung or missing CLI, or an answer that isn't JSON, is the step's failure (`Ec2Error`); any other error in a round is recorded and the loop goes on.
- **I3:** item 13, above, corrected: the failed stop alerts through `h4-alerts`; `make up ENV=prod` says when the stop profile's session can't be used.
- **I4:** `make up ENV=prod` passes the env file to the loop's start, which reads `H4_OTLP_PORT` and gives it to the loop as `--otlp-port`; without one, the start and the loop each say so.
- **I5:** item 11, above, corrected: the sink reads the functions' outcomes once in 30 minutes.
- **Nit 1:** at the close, an unreadable `/h4reet/prod/ec2-instance-id` still stops every running instance tagged `h4-prod-ec2`, as the close needs no parameter, and still alerts `ec2_guard_failed`.
- **Nit 2:** contracts/handover.md §6 and §7 now match items 12 and 13.

**Group 8's review B, and what was done** (the review of 7c5f1259..8418fd0b, the edge's side; the note's "Group 8's review, and what was done"). What its fixes change of group 8 as built:
- **I1:** the relay's origin-request policy forwards `X-H4-Probe`, so the relay knows a probe (P-I5, rebuilt; contracts/edge.md §3).
- **I2:** what runs on EC2, `redteam/live.py`, `run.py`, and `scripts/operator.py`, keeps to Python 3.9, and a test holds it so.
- **I3:** EC2's red-team record is keyed by what its cases exercise, so a release counts an earlier release's EC2 run while those bytes are the same; a change to them needs EC2's run of a non-public release of it first, while the laptop serves (contracts/releases-deployer.md §2). The Author's question B-3.
- **I4, I5:** the visitor scan's dumps run as `postgres`, and it asks Loki and Prometheus through their APIs (item 20, corrected).
- **I6:** item 13, above: W2's precondition, with a strict-xfail test and the Author's question B-6. The tunnel end's networking isn't redesigned here.
- **Nits:** `live.py` holds the token file to the CLI's rules (2); the no-host text names no cause (3); row V4 names the relay's path (4); the probe's alarm also waits for its function, and W2's order has the release between prod's and the account's applies (5).

**Group 8's review A, and what was done** (the review of 7c5f1259..8418fd0b, the relay's side; the note's "Group 8's review, and what was done"). What its fixes change of group 8 as built:
- **I1:** an IPv6 viewer is keyed by its /64, written as the network's first address (`2001:db8:1:2::`), in the public cap and in `X-H4-Viewer`, so the gateway's per-client cap counts the same key (`services/relay/src/peer.ts`, `clientKey`).
- **I2:** spec 004's A1 and A2, above (item 3, corrected). Spec 004's own "Room live state" panel stays its own task; the relay now gives it its series.
- **I3:** the kill switch fails closed at once: a failed read is `store_unreachable`, with no grace on the last good read (FR-030, SC-008). The rehearsal gains row 11f, the relay with the store stopped.
- **I4:** the serving gauge is labelled `h4.serving`, and the host-health gauge `h4.relay.checked`, never `h4.relay.host`, which the tunnel end's collector routes on per datapoint, so each reaches both hosts' Prometheus whole; `none`'s 1 is red by a value mapping of its own (contracts/relay-http.md §9).
- **I5:** the tests decide P-6's readiness by parsing the four figures, never by its comments' words.
- **Nits:** the edge listener starts a root span, so a visitor's `traceparent` neither parents it nor turns sampling off (1); the release's own files include `GNUmakefile`, and the check's comment says it guards a mistake, not a hostile copy (2); SC-017's hold stays until the gateway runs the real key, the deployer's stale-hold recovery says so and alerts `deploy_refused` (`sc017_recovery_failed`) when it can't, and a run longer than the hold's hour is refused (3); the cap's and the status bucket's sweep run in the 1 s round (4); a second unreachable host is marked failed too (6). The rest of nit 6 is the backlog's, with its reasons, in the note.

**Group 8, as built: its departures** (tasks.md T098 to T111, T166; the note `docs/merge-requests/2026-11-13-feat-001-w1.md`, group 8). The relay, first:
1. **dev-relay is a service of its own,** not `relay` in a second profile: one service can't publish the tunnel end's literal addresses on dev, where they don't exist. It is built from the tree, joins `internal` alone, and publishes nothing; no env file selects its profile, so `make up` never starts it, and the kill-switch rehearsal starts and removes it (T099). Its one host is its stack's gateway, read on `GET /health/serving`, since dev's relay block has no token; it reads the kill switch as `grafana_ro`, which holds `SELECT` on `gateway.v_state` and has dev's password, where `relay_ro` has none; and it records no handover. Contracts/env-cloud.md §3's "`relay` only, in `dev-relay`" means this service.
2. **The cap's refusal is spec 000's 429 shape,** `{"error":"public_cap","limit":…,"retry_after_s":…,"request_id":…}` with `Retry-After` and no `X-H4-Degraded-Cause`, as contract §3 step 3 says; §5's "bodies use spec 000's degraded shape" holds for its 503s. The room shows any 429 as `turn_refused.slow_down` (spec 002's talk client), so the cause needs no header. The 403 and 400 answers are `{"error":…,"request_id":…}`, a body over its route's limit 413 `body_too_large`, as edge's.
3. **`GET /api/status` takes no part of hello's cap,** but, corrected after group 8's review A (I2), it has its own: spec 004's Amendment A1, accepted, gives the status a bucket of 30 a minute, burst 10, per address, apart from hello's, with 429 `relay_cap_exceeded` (`status_per_minute`), and A1's three fields, `local_tier`, `state`, and `cause_now`; A2 adds the route label, the class gauge, and no span for a status below 500. The status reads the store at most once in 5 s. The probe's one a minute is far inside it. On 8080 it still needs the edge's address, as every request there does.
4. **EC2's state in the status reads `unknown`** until group 10's sink brings its reads (contracts/public-view.md §2): the relay has no other source.
5. **The gap** is the time since the relay moved to `none` from a host it served; the first move out of `none` after the relay's own start, whose beginning it can't know, records a null gap. One round of checks applies both hosts' results together, so two hosts failing in the same second make one change, not two.
6. **A forward that couldn't connect,** within 2 s (the relay blocks' own `proxy_connect_timeout`), counts as that host's failed check and is retried once on the other host if it is healthy, else answers `no_host_serving`; one that was sent and failed, or passed the 25 s deadline, answers `host_error`. An empty token sends no `Authorization` (dev-relay's gateway takes none).
7. **P-G6, the compose policy's relay,** a patch §14 didn't list: spec 000's policy refuses a service other than `edge` publishing, a fourth service on the edge network, and a cloud class's image it doesn't know. P-G6 admits `relay` by name and exactly: `10.42.1.10:8080` and `127.0.0.1:18505`, the edge network, and `h4reet/relay` by the release's digest, in the tunnel end's class alone. It applies after P-G5.
8. **The tunnel end's env file carries the relay's secrets:** both hosts' tokens, `relay_ro`'s and `relay_rw`'s passwords, and the shared state's CA certificate (`/h4reet/hosts/SHARED_STATE_TLS_CA`, the String EC2 reads too). `infra/parameters.txt` gains `/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD` and `DB_RELAY_RW_PASSWORD`, which group 6's `shared_state.py` already read but the list lacked.
9. **The dashboard's room-live-state test is narrowed** (spec 004's Amendment A2 shares the relay's `h4_relay_requests_total`): it still refuses that section's panels, its class gauge, its own refusal counter, and any query by the route label A2 adds, and lets the Hosts row read the relay's requests by host and outcome (contracts/relay-http.md §9).

Then the edge, the site, the scans, and the rehearsal:

10. **Two tests take other names.** tasks.md's `infra/test/test_prod_edge.py` and `fixtures/prod-edge/` fall under spec 000's protected name `infra/*edge*`, which holds any `infra/` path that contains the word; a test isn't configuration, and the earlier groups' fixtures kept to names outside the protected words (`bridge-*`, not `alert-*`), so they are `infra/test/test_prod_cdn.py` and `fixtures/prod-cdn/`. T100's `apps/web/test_site.py` is `apps/web/test/site.test.ts`: the site's tests are the web workspace's vitest, which reads the global setup's release build, and no pytest folder holds `apps/web`.
11. **One bucket for the site and the public view,** `h4reet-ai-site-<the account's ID>`: the public view is `site/status/latest.json` in it (contracts/public-view.md §1), so "the site's and the public view's bucket policies" are its one policy, behind the switch; each release's copy is kept under `releases/<commit>/` for 90 days.
12. **A CloudFront Function serves a folder's `index.html`** (`h4-site-index`, a viewer-request function on the site's behavior): S3 through origin access control serves no index document, so `/disclosure/` and `/credits/`, and group 10's `/status/`, would answer 403 without it. It names nothing, so W1 makes it, in `edge.tf` (P-I5). **From W2** (P-I5b; "W2, as built", item 4): it runs on the folders' behaviors alone, and redirects a folder's path without its slash.
13. **The VPC origin, W2's precondition; answered C** ("B-6: option C, and the VPC origin from W1", above, which supersedes the rest of this item) (the note's question for group 8; after group 8's review B, I6, a strict-xfail test, `infra/test/test_prod_cdn.py::test_the_vpc_origin_reaches_the_interface_the_relay_publishes_on`, names the gap, and tasks.md T176 holds it as W2's precondition; the Author's question B-6 in W1's note). It targets the tunnel end's instance; CloudFront's VPC origins reach an instance in a private subnet at its private address, and the tunnel end's primary interface is the public one, `10.42.0.10` in the public subnet, while the relay listens on the private one, `10.42.1.10`. If AWS takes the primary interface, the relay must publish on it too, or the origin target a Network Load Balancer in the private subnet. AWS also documents VPC origins' own security group, where group 5 admits CloudFront's origin-facing prefix list on 8080. Neither can be read from here; W2's plan and the Author's check settle both.
14. **No `X-H4-Degraded-Cause` on the edge's own 503:** whether a CloudFront Function can add it to an error response wasn't measured (nothing in this session reaches AWS), so the cause is in the body alone for that case, as contracts/edge.md §4 allows; to confirm in W2.
15. **`/_degraded/api.json`'s `request_id` is null,** as its `trace_id`: a file has no request to name. The web build writes it (`apps/web/build/degraded.ts`), and its test holds it to spec 000's §2.5.2 fields.
16. **The probe's alarm,** `h4-probe-failing`, the name the bridge has known since group 4: the probe's Lambda Errors, five one-minute periods all failing, missing data breaching, to `h4-alerts` on alarm and on recovery; behind the account's switch with the schedule.
17. **ACM's expiry events don't reach `h4-alerts` yet** (contracts/edge.md §2): an EventBridge rule lives in a protected file alone, and none of W1's fits; it is the backlog's, for W2's patch.
18. **The status page's links** (T108) wait for `/status/`, group 10's (T138).
19. **The red-team's hello cases** go through the admin adapter route, `POST /admin/adapters/{id}/complete`, with hello's fixed system prompt read from the gateway's own source and hello's output cap from `config/budgets.yaml`: hello's public route can't name an adapter, and on EC2 its second adapter answers only when the first fails.
20. **The visitor scan** collects each host's stores with their own tools (`pg_dump`, run as the image's `postgres` user, ClickHouse's and Valkey's clients, `docker cp` of every named volume, every container's log) and scans the files. Corrected after group 8's review B (I4, I5): Loki's chunks and Prometheus's blocks are compressed on disk, and the gateway's and the relay's OTLP logs and metrics reach them through the collector, not through any container's log; so on the hosts that run them the scan also asks each through its own API, from the gateway's container: Loki's `query_range` over every stream for the last two hours, and Prometheus's label names and their values.
21. **The rehearsal's relay rows wait for P-6's figures:** dev-relay refuses to start without them, as the tunnel end's relay does, so until the Author's figures are on the branch, rows 7h and 9f read SKIP with the reason, and nothing starts it.
22. **Contract §2.5, the site's sync, is built here** (`deploy/scripts/release.py`, with `SITE_BUCKET=` and `DISTRIBUTION=`, which W2's apply makes): the checked copy to `releases/<commit>/` with the web image's Cache-Control, each GLB's gzip copy as gzip_static serves it, then to `site/` keeping the public view's `status/`, then one invalidation, all before `release.json` and the pointer. Without a site bucket nothing is synced, and the release says so. A rollback's site part, syncing the previous release's copy back, is the backlog's.

**Group 7, as built: its departures** (tasks.md T081 to T092, T180; the note `docs/merge-requests/2026-11-13-feat-001-w1.md`, group 7):

1. **No launch template.** EC2 is an `aws_instance` carrying its own market options in the protected `ec2-market.tf`, as the tunnel end is (T084 named a launch template). A template would add a version per change that nothing here reads; rules T11 and T13 hold the instance either way.
2. **EC2's images.** One compose file names each shared service's image once, so on EC2 each upstream one runs from an override, `"${H4_IMAGE_<SERVICE>:-<the lock's pin>}"`, which only EC2's deployer writes, in its release's env file, as the account's registry's copy by the same tag and digest (FR-048); every other host runs the pin after `:-` as written. The two images the release builds, the gateway's and the room's, keep the laptop's build names: the deployer pulls each by the release's digest and tags it `h4reet-gateway:<commit>` and `h4reet-web:<commit>` for the release's `H4_REF`. The deployer refuses a copy whose tag and digest aren't its lock line's (reason `pin`). The compose policy needs **P-G5**, a patch §14 didn't list: the `ec2` class, the overrides, and no env file naming an `H4_IMAGE_` key; preflight's P17, `make pull`, and `make pin-images` read the override as its pin.
3. **The gateway's egress is an SNI proxy, not a proxy setting.** The gateway's two paid transports resolve through c-ares and lock their origin (spec 010), and take no proxy. So EC2's nftables send each container's 443 and 465 to `deploy/scripts/sni_proxy.py` on EC2's private address, which reads the name the TLS hello asks for and nothing after it, and connects to it only if `deploy/hosts/ec2/release/gateway-allowlist.txt` holds it (443) or it is the env file's `SMTP_HOST` (465), at public addresses alone (FR-051). The gateway's TLS runs end to end. SMTP's STARTTLS, whose name comes only after a plain greeting, can't pass it: EC2's mail is implicit TLS on 465 (preflight E4).
4. **EC2's two doors are a service of their own,** `ec2-relay-block`: nginx's stream module, edge's image, forwarding EC2's private `10.42.0.20:8085` to edge's relay block and `:4318` to its collector, in the `ec2` profile alone. edge's ports stay on `127.0.0.1` on every host, which a published private address on edge would break on the laptop.
5. **EC2's group admits the tunnel end by its two fixed addresses,** `10.42.0.10/32` and `10.42.1.10/32`, not by its group: the tunnel end's private group already names EC2's for 5432, and two inline groups naming each other are a cycle.
6. **EC2's Bedrock credentials** come from a credential timer, `deploy/hosts/ec2/ec2_host.py credentials`, every 15 minutes: the instance role assumes `h4-prod-gateway` for an hour, and the answer is written as a `credential_process` document that the gateway's `h4reet-bedrock` profile reads with `cat`, so the SDK refreshes before each expiry. Whether the gateway's SSO session-end reading leaves such a profile alone is to confirm at T096.
7. **The host's later parts come from the release's tree,** by the deployer's host step for the `ec2` class, as the tunnel end's shared state does: the gateway's proxy, its allowlist, its unit, and the credential timer. With them in it, EC2's user data was 17,207 bytes gzipped at level 6, past its 15,616-byte bound; without them, 14,781.
8. **The data volume is Docker's data root,** `/srv/h4reet/data/docker`, so the images and the stack's named volumes outlive a replace. cloud-init's boot command mounts it at each boot, formatting it once when blkid finds no filesystem (exit 2), and `docker.service` requires the mount, so Docker never writes the stores to the root volume.
9. **EC2's boot asks the bucket first** (FR-046); when it can't, it starts its last release from its cached images and alerts `deploy_refused` with reason `unreachable` or `bucket`, not a new kind, since the bridge's kinds (contracts/aws-alerts.md §2) are protected.
10. **EC2's host allowlist names no Budgets endpoint,** which R-10 lists: nothing on EC2 calls it. It names STS, for the credential timer.
11. **The laptop's deployer isn't built** (T082's third host). The laptop runs `make up ENV=prod` by hand, FR-049's hand-started stack, which no deployer replaces; the release panel's laptop line waits for it (the note's backlog).
12. **The deployer's metrics** go as OTLP/HTTP's JSON from the host to its collector: EC2's through its doors' 4318, the tunnel end's to its collector's address on the stack's egress bridge, as the backup timer does. Each label is a datapoint's, since a resource attribute isn't a Prometheus label.
13. **EC2's public address carries no tag:** an address AWS assigns at each start isn't a resource Terraform makes. Whether Cost Explorer's `project` filter shows its charge is to confirm after T173's apply (T154).
14. **The disclosure's F3:** EC2's trigger, default, and switch-off follow spec 010's words in their cells rather than replace or precede them, so the row keeps spec 010's text whole, and the Author's adopted words aren't touched.

**Group 7's fixes, reviewed** (the review of a59d52a9..7c5f1259; the note's "Group 7's fixes, reviewed"). What its fixes change:
1. **FR-039's four adapters are four (host, adapter) pairs** (I1), each host's two route adapters from the export's `config/routing.yaml`: the laptop's `primary` and `fallback`, EC2's `first` and `second`. Group 7's review A read them as three adapter names, which no run could meet: the laptop's route builds only its own two, and EC2's had no red-team path. The red team's live run takes `--host ec2`, EC2's two adapters on prod, from the Author's Systems Manager session on EC2 (`redteam/live.py --host ec2 --operator-token-file FILE`), through EC2's own admin listener, with the commit from the deployer's `current.json`; each record names its host, and one without is the laptop's. An export whose routing names no route for EC2 refuses a public release.
2. **The release runs as main's own code** (I2): its own bytes and the Makefile's must be refs/heads/main's blobs, so it is run from main's checkout, on main; and every command it runs has `GIT_NO_REPLACE_OBJECTS=1` (nit 1).
3. **The gate's line must report a pass** (nit 1): no `; failing:`, `0 FAIL`, `0 PENDING`, and no `DEGRADED` run. A merge by hand past a failing gate isn't releasable until the next gated merge.
4. **SC-017's harness leaves nothing behind when it dies** (I3): SIGTERM and SIGHUP end it through its restore; it says how far it has got every ten turns; its refused copy of the env file is on tmpfs, `/run/h4reet/sc017.env`; its hold is stamped `sc017 <epoch>` and written under the deployer's state lock, before it reads the running release; and the deployer clears a stamped hold older than an hour, removes the copy, and recreates the gateway with the real file. `docs/runbooks/ec2.md` has the recovery by hand.
5. **The deployments counter's file** (nit 5): a count that isn't a whole number reads as none, so the record line is always written; a file that can't be written is said on the deployer's stderr, not swallowed.
6. **Left in the backlog, with their reasons:** an alert on the credential timer's repeated failure (nit 2: Bedrock degraded is E6's WARN and the journal's; an alert needs a kind in the protected bridge, so P-I4's next rebuild or W2's patch); and a red-team record's commit taken only after `status --after-up` (nit 4: the run file's grammar is preflight's, and a new key needs its check and status's).

**Group 7, after review B** (the review of a22e3005..5c92814e; the note's "Group 7's review B, and what was done"). What its fixes change of group 7 as built:
1. **The gateway's journal is on the data volume,** `H4_STATE_DIR=/srv/h4reet/data/state`, not the root volume, which a replace loses; the host step makes `gateway` under it, 0700, owned by the gateway's user, since compose's long-syntax bind never makes its source and nothing else on EC2 did (B1). On EC2 the compose file's "survives the loss of the store's volume" holds either way: its store is the shared state, on the tunnel end.
2. **Docker checks its two guards itself.** Its drop-in runs `mountpoint -q /srv/h4reet/data` before it starts, since `RequiresMountsFor=` orders alone for the boot command's hand mount, which has no unit (I1); and it requires `h4-nftables.service`, not only follows it, so with no `h4reet` table no container's 443 goes out past the proxy (I2). A Docker that didn't start is the runbook's, by its journal.
3. **Names resolve to IPv4 alone** in both proxies, since the VPC has no IPv6; the SNI proxy tries each address in turn, holds at most 512 connections at once, under its unit's `LimitNOFILE=2048`, and closes a splice idle for 300 s (I3; nit 4).
4. **A failed assume degrades Bedrock, never the stack** (I4). The host step writes the profile, then tries the assume; on a failure it says so and goes on, so the stack starts on the Anthropic API, EC2's first route, and the credential timer tries again every 15 minutes. E6 warns of a document missing or expired, and refuses only a wrong profile or one open beyond 0400 (contracts/env-cloud.md §3). The boot's fallback without the bucket alerts what happened: `started` yes or no, and a start that failed exits 1 (75 to the first step).
5. **P17 also names an `H4_IMAGE_*` the shell sets,** beside P5's refusal of any `H4_*` there (nit 1). `own_volume` takes a volume under EC2's data root too (nit 6).

**Group 7, after review A** (the review of c8571b3e..a59d52a9; the note's "Group 7's review A, and what was done"). What its fixes change of the deployer and the release as built:
1. **A restart takes no lock.** The key's revocation (FR-055) waited behind a running deploy, up to the first step's hour, while the revoked tunnel stayed up. A restart touches no tree's folder, so the first step runs it before the lock (I-A; contract §3).
2. **A hold still sends what SNS refused.** The hold's run sends the pending alerts first, its own among them; and each check restarts what runs before it sends any, since a publish can take the CLI's 120 s (I-B, nit 1).
3. **The deployments counter is cumulative** (I-F). It was a delta, which the collector's otlp pipeline passes on unconverted and Prometheus drops, so the Deployments panel was always empty. Of the review's two ways, cumulative needs no change to two collectors' pipelines: the deployer keeps each outcome's count and their start in `events.json`, and every run sends all four counts and the running release once, a held run too. With nothing running, an identical repeat is tried each run but recorded and counted once (nit 2). The release table reads the last five minutes, not the hour's maximum (nit 6).
4. **The release is main's, from its export** (I-D). It refused any untracked file, and the main checkout always has some; and its red-team gate wanted runs newer than HEAD in the tree, which a run there dirties and its commit moves past. So `make release` releases refs/heads/main's commit from a fresh `git archive` export, whatever the checkout's HEAD or untracked files, and reads the red-team runs from `REDTEAM=` (default `redteam/history`, outside the export), matched by a `commit` field each live run now records, the stack's running commit from its run file. FR-039's "four adapters" are three adapter names, `local`, `bedrock`, and `anthropic`: the laptop's paid fallback is one of EC2's two, and `fake`, which the release named, answers nothing live, so `PUBLIC=1` could never pass.
5. **The site is checked in its image** (I-E). The release ran `npm run build` in the checkout, so its `node_modules` ran in the Author's terminal with his admin profile exported, the very thing the Makefile's `CONTAINED` guard refuses `content-check` for; and it checked a host build, not what ships. It now builds the web image from the export, loaded and never pushed, copies its `/usr/share/nginx/html` out, and runs main's `content_check.py` on that; the build itself runs `npm ci --ignore-scripts` inside the image. The pushed web image is the same build of the same export; its amd64 layers come from the check's cache, and an arm64 build of the same Dockerfile and context is checked by its amd64 twin alone.
6. **Contract §2.1, the gate, is built; §2.5, the site's sync, is group 8's** (I-H). The release refuses a commit that isn't a merge whose message carries the gate's `gate: <tip> (` line for the tip it merged, as the Author's hand guard writes it. A commit of the Author's own on main isn't releasable until the next gated merge. The sync waits for the edge it syncs to (group 8; contracts/edge.md §5): a departure from contract §2's step 5 until then.
7. **SC-017's recorded run uses the real APIs, not stand-ins** (I-G; SC-017 and quickstart §7, step 4, say stand-ins). The gateway's endpoints are fixed in code (spec 010 FR-005), so stand-ins on EC2 would need a code path the release would carry; the stand-ins stay the harness's test's. The failing phase works on EC2 as the gateway reads its key, at its container's creation: the harness holds the deployer, writes a 0600 copy of the env file with the key refused, recreates the gateway alone from the running release's tree, and restores the real file and removes the hold whatever happens. Its score counts a throttled turn and an admitted turn not answered against the run, paces the turns under the per-client cap (one each 3.2 s), and checks the day's and the month's ceilings from the status's `meters`, which the harness had read at the top of the status, where the gateway puts nothing. **Its cost:** 200 hello turns, at most 2,000 characters in and 128 tokens out each, at Haiku 5.5's $0.10 and $0.50 a million tokens (config/prices.yaml), at most about $0.05 on the day ceiling; the refused key's 100 calls cost nothing.

**Deployer, reviewed** (the review of 58d5a676..23622319; the note's "Deployer, reviewed"). What its fixes change of the deployer as built:
1. **The retry rule.** The alert memory, `refused.json`, only deduplicates alerts; an attempt is marked in `attempts.json`. A refusal is tried again once a newer release comes, a failed start after a backoff that doubles from two minutes to an hour, every attempt at boot, and each run while nothing runs, so one failure never strands a host. The first step's alert keys no longer block a release. The manual retry is `docs/runbooks/deploy.md`'s, new.
2. **The record doesn't wait for SNS.** Each attempt writes its line to `deployments.jsonl` and its mark, whatever SNS does; an alert SNS refused waits in `pending.json` and goes on a later run. `AwsCli.account()` reads the env file it was given.
3. **Exit 75 is a check's or a boot's alone.** A failed restart exits 1, and the first step passes a restart's exit through with no fallback, so the key's revocation fails its unit when its restart fails (FR-055).
4. **The first boot's deployer that doesn't run** is alerted once, `deploy_refused`, reason `deployer`, with no fallback.
5. **The nits:** the tree's key pinned to `trees/<commit>.tar.gz` in contract §1 and in both; the first step's arguments and exits in §3; an exclusive lock on the state folder around each run, a timeout of an hour, and the process group killed at its end; `h4-deployer.service` Wants the env file's unit; an S3 refusal (access denied, no such bucket, a bad name, an empty `RELEASE_BUCKET`) alerted once per boot, reason `bucket`, where it was waited out as a network hiccup; and a missing env file starts nothing and crashes no alert.

**Group 5, as built: its departures** (tasks.md T041 to T054, T157 to T161; the note `docs/merge-requests/2026-11-13-feat-001-w1.md`, group 5):
1. **The laptop's health block listens on edge's 8088, not 8087,** which is spec 002's site, x005. The tunnel's `-R 2203` leads to `edge:8088`; the tunnel end still publishes its reverse forward 2203 on its public 8087, which the security group holds to Route 53's checkers (contracts/tunnel.md §3 and §4, amended).
2. **The blocks ask the gateway's `GET /health/serving`.** `GET /health` already carries the store's readability, but answers 200 whatever the state (spec 000's contracts/gateway-http.md §5), and nginx can't read its body. So the gateway answers `GET /health/serving` with 200 while the store reads and 503 otherwise, each with no body and no span, and both blocks pass that on (gateway-http.md §4, amended by name).
3. **The blocks' tokens reach nginx as maps in a file.** nginx reads no environment, so edge's entrypoint, `deploy/edge/entrypoint.sh`, writes the two token maps to its tmpfs from `RELAY_TOKEN_SELF` and `TELEMETRY_BLOCK_TOKEN` before nginx starts, and drops both from nginx's environment; with no token, as on dev and dev-cpu, nothing matches and the blocks answer 401.
4. **The tunnel's image is Ubuntu's OpenSSH on the pinned `base:ubuntu`,** not Alpine's (contracts/tunnel.md §2): no Alpine base is pinned, and pinning one is the Author's `make pin-images`. Its build fetches Ubuntu's packages, so it builds on the Author's engine and in his release; on the agents' engine, whose egress proxy reaches only npm, PyPI, and ghcr.io, `deploy/tunnel/test_tunnel.py`'s container checks skip with the build's own error.
5. **P-G3, the compose policy's host classes,** a patch §14 didn't list (now it does). Spec 000's policy refuses each of the tunnel's needs as written: only edge publishes, on 127.0.0.1; only the gateway joins egress; only edge the edge network; five bind roots; images from the lock. P-G3 admits each by name and exactly. Until the Author applies it, the branch's `make policy` refuses the tunnel's services, and four of the policy's own tests fail.
6. **The tunnel end's services and their images.** One compose file can't hold two services of a name, so the tunnel end's collector is `tunnel-end-collector`. The tunnel end's services run their release's images from the account's registry, named `${H4_REGISTRY:-registry.invalid}/h4reet/<repository>`, a release-built one by the release's digest (`H4_DIGEST_<REPOSITORY>`, which the deployer writes) and an upstream one by the lock's own tag and digest, so compose names exactly what the deployer pulled and never builds there. The class's services start by name, `docker compose up` with the class's list, so none of the laptop's runs on the tunnel end.
7. **The laptop's `tunnel` profile is optional on prod** (preflight P6, P22), so `make up ENV=prod` works before T058's keys exist; the Author adds it to `COMPOSE_PROFILES` at T058. `H4_TUNNEL_DIR` is in every env file, as `H4_AWS_DIR` is, since a bind source takes no default (dev's and dev-cpu's name `deploy/tunnel-none/`), so after W1's merge the Author runs `make init-env ENV=prod SYNC=1` and `ENV=dev SYNC=1` before the next `make up`.
8. **The deployer is written here, the tunnel end's part,** `deploy/scripts/deployer.py`, with release.json's fields as group 5 reads them (the commit, the tree's SHA-256, the Compose plugin's key and SHA-256, and each service's repository, digest, and hosts); group 7 extends it to EC2 and the laptop (T082, T088). It also gives the collector's queue volume to the image's user, since a new volume's root is root's.
9. **The host's files travel in the tunnel end's user data,** a `.tftpl` template of `deploy/hosts/tunnel-end/cloud-init.yaml.tftpl`, which prod's `tunnel-end.tf` fills with the host's files at the plan's commit. The instance ignores its AMI's and its user data's drift, so a newer image or a changed host file reaches the tunnel end only through a reviewed replace. **After group 5's review (I3),** that replace is in the plan rather than left to the Author's hand: `terraform_data.tunnel_end_host` in `tunnel-end.tf` holds the rendered user data's SHA-256 and `local.tunnel_end_generation`, and the instance is `replace_triggered_by` it, so a changed host file plans as the tunnel end replaced, and an OS update is a new generation (`docs/runbooks/tunnel-end.md`, "An OS update, or a changed host file"). Its host scripts keep to Python 3.9's syntax, Amazon Linux 2023's python3.
10. **The tunnel end's egress allowlist holds group 5's names alone,** ECR's three, the release bucket's, Systems Manager's three, and SNS's, in a new row, C17; groups 6 to 9 add theirs with their rows. At the first boot, before the packet filter loads, `dnf` installs Docker and nftables from Amazon Linux's repository, which the security group's 443 admits.
11. **The two names the hosts read that Terraform writes:** `/h4reet/hosts/RELEASE_BUCKET`, the account's (`registry.tf`), and `/h4reet/prod/tunnel-end-address`, prod's (`ssm.tf`), both Strings. Prod reads neither with a data source.
12. **T159's two alert rows reach contracts/aws-alerts.md §2 in P-I3,** with the bridge that knows them, as the regrouping did for `ec2_unrecognised_instance`: the bridge's own test holds every kind in §2 to a notice, and the bridge is protected.
13. **Prod's lockfile is the Author's step,** as each root's was: `make infra-check` finds T10 on `infra/prod` alone until he makes `infra/prod/.terraform.lock.hcl` from his mirror, before T171's prod block.

**Group 5, after its review** (2026-11-12; the note's "Group 5's review, and what was done"). What its fixes changed of the plan as built:
1. **The tunnel end's role holds Session Manager's and Run Command's own actions inline,** with no managed policy: `AmazonSSMManagedInstanceCore` grants `ssm:GetParameter` and `ssm:GetParameters` on `"*"`, every parameter in the account (I1). `kms:Decrypt` keeps its `kms:ViaService` condition and reaches this account's keys alone; whether `aws/ssm` needs it at all is to confirm at T058.
2. **A changed host file, or an OS update, plans as the tunnel end's replace** (I3; departure 9 above).
3. **The deployer starts a release the host ran from its cached images,** `up --pull never` with no registry login: at boot, at a rollback, and whenever a run finds the current release's services not all running, which each run now checks first. A new release's registry login that can't be reached changes nothing. `h4-write-env.service` orders itself before `docker.service`, by ordering alone (I4).
4. **The tunnel end's template names compose's three bind roots,** `H4_STATE_DIR`, `H4_AWS_DIR`, and `H4_MODEL_DIR`, as `/var/lib/h4reet/none`: compose requires each of every stack and interpolates the whole file before it starts the class's services (I5).
5. **The alert bridge reads an EventBridge rule's string template,** which arrives as a JSON string, once as the text it encodes (I6, in P-I3). The templates stay as they are.
6. **The deployer runs the release tree's own preflight** for the host's class after the host step and before any pull or `up`; a refusal starts nothing, and a new release is refused with `deploy_refused` (I7; contracts/env-cloud.md §3).
7. **The switch is held to a boolean literal either way,** and "off in W1" is its own W1-only test, which T175 flips with P-W2 (I8).
8. **FR-076's return alert is W1's:** `h4-tunnel-end-running` and its `h4-alerts` target, `tunnel_end_back`, in P-I3's `infra/prod/handover.tf`, as contracts/handover.md §2 places it; its start-function target stays group 9's, behind the switch ("Missing").
9. **The blocks' token maps are exact regular expressions,** `~^Bearer <token>$`: nginx matches a map's plain strings without case, and `nginx -t` on the pinned image refused a token of the longest shape (`map_hash_bucket_size`), so edge wouldn't have started on prod with one (I2 and a nit; contracts/tunnel.md §4).
10. **The tunnel's container checks skip on the archive's error alone,** and take an image the Author builds on his engine and moves to the agents' engine, `h4reet-tunnel-seed:local`, once its files are the tree's (I2).
11. **The nits:** the tunnel end's collector sends the telemetry block's token to the laptop's block alone; the tunnel's sshd adds `PerSourceMaxStartups 2`; cloud-init disables Amazon Linux's own sshd; the instance keeps its tags out of its metadata. The user data is at 15,291 bytes gzipped at level 6, Terraform's, of EC2's 16,384 (after group 5's fixes' review), so the next host file, and group 7's deployer changes, need the deployer moved to the release's tree first (the note's backlog).

**Group 4, as built: its departures** (tasks.md T031 to T036):
1. **The alert bridge's folder is protected,** by spec 000's names (`infra/*alert*`), which §2 kept. So `infra/lambdas/alert_bridge/`'s test, code, and Dockerfile travel in P-I2 with the protected Terraform, and its RED and GREEN ran on patched exports.
2. **The probe's alarm, and `h4-alerts`' CloudWatch publisher, move to group 8,** with the line that enables the probe's schedule (P-I5). An alarm that reads missing data as breaching would fire while the schedule is off, and the publisher is a change to the bootstrap's topic policy (P-I1's `alerts.tf`), whose plan group 4 otherwise doesn't touch. Group 4 has the function, its role, its schedule written disabled, and its permission.
3. **The functions' images wait for their base's digest.** AWS's `python3.14` Lambda base for arm64 can't be resolved offline, and the compose policy refuses a Dockerfile whose `FROM` `deploy/images.lock` doesn't pin. So the lock's `base:lambda-python` line and the three Dockerfiles come after the Author's resolve, `docker buildx imagetools inspect`, as `make pin-images` resolves a tag (`infra/lambdas/test_images.py` read PLANNED until then). **On 2026-11-11** the Author resolved it, `sha256:9ffc23f871c4db05f101f457e1742655f7629459bd3623c0ce60a65a01872904` (the combined note, For the Author, 2): the lock's line, its row in `deploy/scripts/arch_inventory.py`'s hosts (none of contracts/env-cloud.md §3's: AWS Lambda runs the images), and the probe's and the credential audit's Dockerfiles are on the branch, and the bridge's is in P-I2, each held to the pin by `infra/lambdas/test_images.py`, test-first. The agents' engine's seed now moves it too, as it moves every pinned image but the GPU-only ones (the combined note's Backlog). Each function is made only once `main.tf`'s `local.lambda_images` names its digest: the first apply makes the registry the images go to, he builds and pushes them, and a reviewed change sets the digests.
4. **The rehearsal is a local, `local.rehearsal`, not a variable.** Every apply needs its plan in a merged note (`make infra-verify`), and a run-time value would make a second plan of the same tree that no note can hold; a new `TF_VAR_` name would also need its deny first (FR-011). So rehearsal on and off are reviewed changes, as the digests are, and the lockfile, like group 3's, is his step. **After T038's review (I1):** the rehearsal's own change sets it true beside a marker, `infra/account/rehearsal-on.txt`, naming that change's note, whose `<!-- h4-rehearsal: on -->` line says it is the rehearsal, so the change passes `make test` and so the gate; the change that ends it sets false and removes the marker. Every other check holds the rehearsal's resources the same either way.
5. **The permission set's name wasn't in the repository** (until 37d13175, below). `local.laptop_permission_set` is null until the Author reads it from Identity Center (the note's step before T037), and `make plan ROOT=account` stops at the set's lookup while it is, with nothing made. **After T038's review (I4):** the name is a local of the protected `iam.tf`, in P-I2, since it decides which set that file imports, overwrites, and provisions, and the trust's pattern; the set is kept from destroy; and the trust matches exactly that set's role, `AWSReservedSSO_<set>_` and 16 characters, with or without a Region's segment. **On 2026-11-11** the Author read the name, `h4reet-ai-cloud`, and counted the 16 in its role's name under IAM, Roles (the combined note, For the Author, 2); P-I2 sets the local to it, and the role's suffix itself stays out of the tree.
6. **The set's import takes its ID from Identity Center's data sources,** by that name; that Terraform 1.17 takes a data source's value in an `import` block's `id` is to confirm in his plan, and the literal ARNs in a local are the fallback.
7. **Spec 000's hand-made policy on the set is detached by the Author, once,** at the cutover (tasks.md T040, step 2), after the chained profile works: Terraform imports the set and writes its inline policy, and doesn't manage the old customer-managed reference, `h4reet-ai-cloud`, so the laptop keeps Bedrock until its profile moves. The credential audit's `LAPTOP_PERMISSION_SET` stays unset until then: it runs before every apply, and naming the set before the detach would refuse the very apply that narrows it. **Its window** (T038's review): from the account root's first apply until the detach, FR-023 doesn't reach the laptop's direct SSO role, whose `h4reet-ai-cloud` still allows Bedrock; only `h4-laptop-bedrock` takes the deny. The meter bounds the spend meanwhile, and prod's route on `main` names the Anthropic API, so the laptop's gateway calls no Bedrock unless the Author runs a live run on it.
8. **The laptop's chained profile needed spec 000's code to follow it.** `GATEWAY_AWS_PROFILE` must stay `h4reet-bedrock` (preflight P7), so that profile assumes `h4-laptop-bedrock` from an SSO profile, its `source_profile`. Preflight P19, the adapter's session end (the 2 h `credentials_expiring` warning), and `make aws-login` now take that form, one hop, to that role alone, test-first; `make up ENV=prod` keeps working on either form.
9. **The rehearsal budgets read `var.bedrock_service_names`,** the variable group 3's review gives the bootstrap's budgets: Bedrock's spend may show in Cost Explorer under its Marketplace name. The model rehearsal reads those names, and the server rehearsal every cost but theirs (from T150, every cost tagged `project = h4reet-ai` but theirs, h4-server-month's filter; ADR 0047), so each proves its filter on spend the month already holds. Its `TF_VAR_` deny is group 3's, which names it first.
10. **The release bucket's name is AWS's, from a prefix,** so the root needs no other variable; the credential audit stores its weekly results in it, under `audits/credential/`, as September's data model had it.
11. **No modules.** The three functions are written in `lambdas.tf`, and the buckets each in full: `infra/modules/lambda-image/` and `tagged-bucket/` wait for a fourth function or bucket.
12. **The rehearsal instance has a network of its own,** with no route out and no rule, and its image comes from `data "aws_ami"` (Amazon Linux 2023 minimal, arm64), since a Parameter Store lookup is rule T9's refusal.
13. **The account's state is in the bucket from its first apply** (`backend "s3"`, key `account.tfstate`, S3's lock file), since the bucket exists after T030.

**Groups 1 to 4, as one branch: departures** (2026-11-10; tasks.md, Prerequisites):
1. **One branch, one gate.** The Author's words: "Let's gropu them together to make them minimal and hand-merge if we have to". He merged the four branches by hand into `feat/001-cloud-elevation`: group 4's tip 30cd2fcd, then group 3's a37863c7, group 2's b2263f94, and group 1's 245f4447 with `-X ours`, which took groups 2 to 4's text in five hunks of spec.md, plan.md, tasks.md, and contracts/env-cloud.md (13ba1a0f). The session merged `refs/heads/main` (b7e5f6df) and re-applied group 1's words in those hunks (45d13328). Every reviewed commit stays in the history: each group's tip is a parent. So T010, T019, T029, and T039 are one gate and one merge, of his branch `feat/001-cloud-elevation-p` with P-1, P-3, P-I1, P-I2, and both lockfiles; and the reviews' open passes (T018's second round, T038's second pass, and the fixes after T009 and T028) are one review of what is new against each group's reviewed tip.
2. **The account's plan block comes after T030.** The account's state is in the bootstrap's bucket (group 4's departure 13 above), so `make plan ROOT=account` can't run until T030 has made it, and the merge brings `infra/account` with no plan in its note. His answer: "One gate, named deviation (Recommended)". The deviation is named in spec.md's Assumptions ("One gate for groups 1 to 4"). T037's block reaches `main` in a later merge's note, and `make infra-verify ROOT=account` refuses the apply until it does.
3. **This gate runs main's checkers.** The gate runs from main's checkout, whose `tools/gates/gate` predates P-1, so its `infra-plan-note`, `infra-check`, and `disclosure` steps don't run for this merge: FR-005's, FR-002's, and FR-040's failures don't hold it. What stands in: the session's runs of P-1's checkers on a patched export (the combined note), T027's `make plan`, which runs `tools/gates/infra_policy.py --root` over the whole tree, and his run of `tools/gates/disclosure_check.py` on his branch before the gate. From the next branch on, main's gate runs them. Named in spec.md's Assumptions beside departure 2, with ADR 0008's Decision 3's first exception.
4. **T011's mirror comes before the gate.** Both lockfiles need it, and the lockfiles come before the bootstrap's block; `make infra-mirror` is on the branch until the merge, so he seeds the mirror from his branch's checkout, and T011's checks run on `main` after the merge.
5. **The bootstrap's block is made last.** A block's `tree` is all of `infra/`, the account's files included, so P-I1, P-I2, both lockfiles, and every agent commit under `infra/` (group 4's section 2) land before T027, which runs on a clone of `feat/001-cloud-elevation-p`.
6. **Spec 000's protected names stay as they are.** His answer: "Keep them protected (Recommended)". The files groups 4 and 8 create under those names (`infra/lambdas/alert_bridge/`, `infra/prod/edge.tf`) remain his patches, and P-1 isn't rebuilt.
7. **P-E, the agents' engine's half of P-1** (the combined review's B1). P-1 adds three in-tree read denies that are bare file-name patterns, `Read(*.tfstate*)`, `Read(*.tfplan)`, and `Read(*.tfvars*)`, which no line of `deploy/agents-engine/tree-masks.txt` can hold, so the engine's mask check refused to start while the settings named them, and `make test` failed with P-1 applied. His decision: "Derive from settings (Recommended)". P-E (`docs/merge-requests/2026-11-10-feat-001-pe-engine.patch`, built from plain copies, for his hand, since `deploy/agents-engine/` is protected) takes every such pattern from the settings: the check lets each through and refuses while a file one matches sits outside a mask, and stage E's row E7 walks the container's view for them and plants one for `up` to refuse. Spec 000's `contracts/agents-engine.md` H8 and E7 say so. It is applied after P-1, on his branch, and group 4's second review pass reads it.

**After the bootstrap's apply: the budget actions tagged** (2026-11-12; tasks.md T155). The T037 plan's policy check found the model action untagged. AWS lets budget actions be tagged, but the policy's source list of taggable types (`tools/gates/infra_policy.py`'s `TAGGABLE`) doesn't name them, so only the saved plan caught it. P-A1 tags all three actions. Adding the type to that list is the gate tool's change, and so the Author's.

**After gate A: the shared account** (2026-11-12; tasks.md T150 to T154; spec.md Assumptions; ADR 0047). The account holds the Author's other work. His answers were "Share it, scope the checks", "Allow it too", and "Keep them out of the repo":
- **the credential audit reads his allowlist,** his file in the terminal and his SecureString `/h4reet/audit/IAM_ALLOW` in the function, whose role may read that one parameter;
- **`h4-server-month` and `h4-rehearsal-server`** are scoped to the `project` tag (P-S1).

The bootstrap is planned again at the new tree, and its block goes in this branch's note, so one gate takes both.

**The order inside each group** (tasks.md): the tests, which fail first; the code, each feature with its span, its panel, its runbook, and its disclosure row; a review by an agent that wrote none of it, and the note. In gate A the Author's plan block, his patches, the gate, the merge, and his apply then followed per group. From W1 they come once a gate: his plan blocks, one per root, pasted into the gate's note; his patches, the gate, and the merge; then his applies on `main` and his other steps there. The plan block comes before his patches are on the branch, so he makes it from a scratch copy of the branch with the gate's patches applied: the patched files are byte for byte the ones he then commits, so `infra/`'s tree hash is the same, and the gate's `infra-plan-note` step matches it.

Hello and the twin become public only after W2's apply, once the handover is rehearsed (T133, T134), so the first visitor meets the whole design, and the disclosure is live before the first visitor byte.

**Risks:**

| Risk | Mitigation |
|---|---|
| The stack without the model server needs more memory than the Author's figure allows | Measured in group 2, before any apply; the Author sets the figure from it. Trimming the stack on EC2 (Langfuse's stores are the largest) is a plan change he can ask for |
| An image the stack runs has no arm64 build | Measured in group 2; EC2 is then x86-64, and releases stay single-architecture for it |
| RDS's price is out of proportion to the server budget | Priced in group 2. DynamoDB is the alternative (research.md R-20), with its rewrite. **Happened:** about $14 of $45; the Author chose Postgres on the tunnel end (2026-11-11; "The shared state on the tunnel end", above) |
| The shared state shares the tunnel end's fate | A spot stop keeps its volume (R-30); the backups live in a bucket of their own; a lost volume or a move to another zone is a restore from the last backup, with contracts/shared-state.md §8's steps, so nothing restarts at zero (FR-019). Visitors lose nothing new: while the tunnel end is gone, the site already rests |
| A start at the hours' open fails for want of spot capacity | One attempt, as every start (FR-065): EC2 stays stopped until the next trigger, AWS's start under the persistent request when capacity returns (to confirm), or the Author's `make ec2-start`; `start_failed` alerts |
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
| An always-on RDS instance. **Replaced in W1** by Postgres in a container on the tunnel end, the Author's answer of 2026-11-11 (§16) | The shared meter must outlive both hosts and run while EC2 is stopped (FR-019) | Postgres on the tunnel end: one small instance becomes the meter's only home; DynamoDB: a second implementation of the meter. The Author chose the first: "Postgres in a container on the tunnel end" |
| Two cross-root rules in W1: a switch (`local.wired`), and no root holding another root's instance or health-check ID (§16, "Four gates") | Four gates, with plan blocks made before their gate's applies; and SC-005's replace of EC2 | One gate a root and apply: more gates than the Author's "4 gates in all (Recommended)" |
| The relay on the tunnel end (question 1, the Author's answer) | A private, single origin for CloudFront, and a host choice that DNS can't make for VPC origins | DNS failover with public origins (option B): certificates, a third-party authority, and a secret header |
| The tunnel end on spot (question 2, the Author's answer) | His choice, at about $2.20 a month (research.md R-05, 2026-10-18, to confirm) | On demand, about $6.13 a month (research.md R-04, to confirm), recommended and not chosen. The risk is named in §12 and §16: while AWS has it back, the twin rests on both hosts and the site still loads |
| The relay on spot, against the Cloud standard's "must be always-on" (question 8, provisionally option A) | The relay runs on the tunnel end (question 1), which runs on spot (question 2) | Not this plan's to choose. The session takes option A provisionally under its reading of his approval at T000: his wording goes into the 1.1.0 patch, his to write or confirm at T001, so no deviation remains once T001 applies it. Option B, a deviation in spec.md's Assumptions citing ADR 0044, stays his to choose instead. Applied at T001 (3c89a8b0) |
| Group 1 built before T001 (spec.md Assumptions, "The constitution first") | His approval at T000: "Let's have you build it out … you can have everything ready and verified by then" | Waiting for T001: his words ask for the build tonight. The deviation is bounded: group 1 writes nothing under `infra/`, and nothing merges or is applied before T001. **Extended to group 3** (2026-11-10, the main session's reading of the same words, recorded in spec.md's Assumptions and tasks.md): its check found T001 unmet, and its agent work, `infra/`'s first files and P-I1, is built anyway; nothing of it merges or is applied before T001. **And to group 4,** the same way: `infra/account`, the alert bridge, the probe, and P-I2, with nothing merged or applied before T001. Ended at T001 (3c89a8b0) |
| Three hosts and three deployers | The tunnel end must run while both serving hosts are off | Fewer hosts: the tunnel would have nowhere to end while EC2 is stopped |
| Host services outside compose (deployers, egress proxies, credential timers, the handover loop) | They need the Docker socket, the firewall, an instance role, or the Author's SSO session | In containers they would need `docker.sock` or host networking, which spec 000 refuses |
| **Spec FR-032's one exception:** the Author's test client reaches the relay's internal listener through a Systems Manager session, as a fixed documentation-range identity (as September) | The relay has to be testable before the edge exists | Testing only through CloudFront: no test before group 8 |
| The health block answers without a credential (spec FR-053's conditional) | Route 53's checkers can't send one (to confirm) | An authenticated check: not possible with Route 53's HTTP checks; the block returns only a status |

## Bug-fixes, night 5 (2026-11-17)

- [`fixes/f1.md`](fixes/f1.md): F1, the fix
- [`fixes/f2.md`](fixes/f2.md): F2, the fix
- [`fixes/f3.md`](fixes/f3.md): F3, the fix
- [`fixes/f4.md`](fixes/f4.md): F4, the fix
- [`fixes/f5.md`](fixes/f5.md): F5, the fix
- [`fixes/f6.md`](fixes/f6.md): F6, the fix
- [`fixes/f7.md`](fixes/f7.md): F7, the fix
- [`fixes/merge-f-1.md`](fixes/merge-f-1.md): the merge of F2, F3, F4 and F5
- [`fixes/merge-f-2.md`](fixes/merge-f-2.md): the merge of F1 and F6
- [`fixes/verify-f1.md`](fixes/verify-f1.md): F1's verify
- [`fixes/verify-f2.md`](fixes/verify-f2.md): F2's verify
- [`fixes/verify-f3.md`](fixes/verify-f3.md): F3's verify
- [`fixes/verify-f4.md`](fixes/verify-f4.md): F4's verify
- [`fixes/verify-f5.md`](fixes/verify-f5.md): F5's verify
- [`fixes/verify-f6.md`](fixes/verify-f6.md): F6's verify
- [`fixes/verify-f7.md`](fixes/verify-f7.md): F7's verify
